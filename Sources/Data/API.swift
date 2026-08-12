import Foundation

// MARK: - Supabase client
//
// Deliberately hand-rolled rather than pulling in the SDK: the surface this
// app needs is a dozen RPCs and a dozen view reads, and a thin client keeps
// the security model legible — every call below names the exact view or
// function it touches, and there is no code path that can reach a base table.

enum APIError: LocalizedError {
    case notConfigured, unauthorized, server(String), decoding(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Fourteen isn't configured yet."
        case .unauthorized:  return "Please sign in again."
        case .server(let m): return m
        case .decoding(let m): return "Unexpected response (\(m))."
        }
    }
}

struct APIConfig {
    let url: URL
    let anonKey: String

    /// Reads Supabase.plist, which is gitignored. Never hard-code keys.
    static func load() -> APIConfig? {
        guard let path = Bundle.main.url(forResource: "Supabase", withExtension: "plist"),
              let dict = NSDictionary(contentsOf: path) as? [String: Any],
              let raw = dict["SUPABASE_URL"] as? String,
              let url = URL(string: raw),
              let key = dict["SUPABASE_ANON_KEY"] as? String,
              !key.isEmpty
        else { return nil }
        return APIConfig(url: url, anonKey: key)
    }
}

actor API {
    static let shared = API()

    private var config: APIConfig?
    private var accessToken: String?
    private var refreshToken: String?

    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 20
        c.waitsForConnectivity = true
        return URLSession(configuration: c)
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { dec in
            let s = try dec.singleValueContainer().decode(String.self)
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = iso.date(from: s) { return d }
            iso.formatOptions = [.withInternetDateTime]
            return iso.date(from: s) ?? Date()
        }
        return d
    }()

    func configure() { config = APIConfig.load() }
    var isConfigured: Bool { config != nil }
    var isSignedIn: Bool { accessToken != nil }

    func restore(access: String?, refresh: String?) {
        accessToken = access; refreshToken = refresh
    }
    func tokens() -> (String?, String?) { (accessToken, refreshToken) }
    func signOutLocally() { accessToken = nil; refreshToken = nil }

    // MARK: Auth — emailed one-time code

    func sendCode(to email: String) async throws {
        _ = try await raw(path: "/auth/v1/otp", method: "POST",
                          body: ["email": email, "create_user": true], authed: false)
    }

    func verifyCode(email: String, code: String) async throws {
        struct Session: Decodable { let accessToken: String; let refreshToken: String }
        let data = try await raw(path: "/auth/v1/verify", method: "POST",
                                 body: ["email": email, "token": code, "type": "email"],
                                 authed: false)
        let s = try decoder.decode(Session.self, from: data)
        accessToken = s.accessToken; refreshToken = s.refreshToken
    }

    @discardableResult
    func refreshSession() async throws -> Bool {
        guard let refreshToken else { return false }
        struct Session: Decodable { let accessToken: String; let refreshToken: String }
        let data = try await raw(path: "/auth/v1/token?grant_type=refresh_token",
                                 method: "POST",
                                 body: ["refresh_token": refreshToken], authed: false)
        let s = try decoder.decode(Session.self, from: data)
        accessToken = s.accessToken; self.refreshToken = s.refreshToken
        return true
    }

    // MARK: Reads — views only

    func select<T: Decodable>(_ view: String, _ type: T.Type,
                              query: [String: String] = [:]) async throws -> T {
        var items = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        if items.isEmpty { items = [URLQueryItem(name: "select", value: "*")] }
        let data = try await raw(path: "/rest/v1/\(view)", method: "GET", query: items)
        return try decode(type, from: data)
    }

    // MARK: Writes — RPCs only

    @discardableResult
    func rpc(_ name: String, _ args: [String: Any] = [:]) async throws -> Data {
        try await raw(path: "/rest/v1/rpc/\(name)", method: "POST", body: args)
    }

    func rpc<T: Decodable>(_ name: String, _ type: T.Type,
                           _ args: [String: Any] = [:]) async throws -> T {
        try decode(type, from: try await rpc(name, args))
    }

    // MARK: Transport

    private func raw(path: String, method: String,
                     query: [URLQueryItem] = [],
                     body: [String: Any]? = nil,
                     authed: Bool = true,
                     isRetry: Bool = false) async throws -> Data {
        guard let config else { throw APIError.notConfigured }
        var comps = URLComponents(url: config.url.appendingPathComponent(path),
                                  resolvingAgainstBaseURL: false)!
        if !query.isEmpty { comps.queryItems = query }

        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        req.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authed, let accessToken {
            req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        } else {
            req.setValue("Bearer \(config.anonKey)", forHTTPHeaderField: "Authorization")
        }
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.server("No response")
        }

        // One transparent refresh-and-retry on expiry, then give up.
        if http.statusCode == 401 && authed && !isRetry {
            if (try? await refreshSession()) == true {
                return try await raw(path: path, method: method, query: query,
                                     body: body, authed: authed, isRetry: true)
            }
            accessToken = nil
            throw APIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            // Supabase reports failures as `message`; GoTrue uses
            // `error_description`. Fall back to the status code.
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let msg = body?["message"] as? String
                   ?? body?["error_description"] as? String
                   ?? body?["msg"] as? String
            throw APIError.server(msg ?? "Request failed (\(http.statusCode))")
        }
        return data
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        if data.isEmpty, let empty = "[]".data(using: .utf8) {
            return try decoder.decode(T.self, from: empty)
        }
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.decoding(String(describing: error)) }
    }
}

// MARK: - Wire types
//
// These mirror the VIEWS exactly. Note what CrushInbox does not contain and
// cannot be made to contain: a sender. If you ever find yourself adding one,
// the bug is upstream in the SQL.

struct MeRow: Decodable {
    let id: UUID
    let kind: String
    let campusId: String?
    let firstName: String
    let lastName: String
    let gradYear: Int?
    let onboardedAt: Date?
    let campusCity: String?
    let campusState: String?
    let campusZip: String?
    let campusName: String?
}

struct PersonRow: Decodable, Identifiable, Hashable {
    let id: UUID
    let firstName: String
    let lastName: String
    let gradYear: Int?
    var displayName: String { "\(firstName) \(lastName)" }
    var shortName: String { "\(firstName) \(lastName.prefix(1))." }
}

struct CrushInboxRow: Decodable, Identifiable {
    let id: UUID
    let messageText: String
    let status: String
    let createdAt: Date
    let expiresAt: Date
    let daysRemaining: Int
    let cluesUnlocked: Int
    let guessUsedToday: Bool
}

struct ClueRowWire: Decodable, Identifiable {
    let crushId: UUID
    let dayIndex: Int
    let kindLabel: String
    let hintText: String?          // nil while locked — the server withholds it
    let unlockedAt: Date?
    var id: Int { dayIndex }
    var isUnlocked: Bool { unlockedAt != nil }
}

struct CrushOutboxRow: Decodable, Identifiable {
    let id: UUID
    let recipientId: UUID
    let recipientFirstName: String
    let recipientLastName: String
    let messageText: String
    let status: String
    let createdAt: Date
    let expiresAt: Date
    let daysRemaining: Int
    let awaitingConsent: Bool
    let consentCall: String?
    let cluesUnlocked: Int
    let nextClueLabel: String?
}

struct RevealRow: Decodable, Identifiable {
    let id: UUID
    let status: String
    let resolvedAt: Date?
    let senderFirstName: String
    let recipientFirstName: String
}

struct ComplimentRow: Decodable, Identifiable {
    let id: UUID
    let promptText: String
    let createdAt: Date
}

struct RoundCardRow: Decodable, Identifiable {
    let id: UUID
    let position: Int
    let promptText: String
    let answeredAt: Date?
    let skipped: Bool
    let optionIds: [UUID]
}

struct MessageRow: Decodable, Identifiable, Hashable {
    let id: Int
    let text: String
}

struct CampusRow: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let city: String
    let state: String
    let zip: String
    let emailDomain: String
    var postmark: String { "\(city) \(state) \(zip)" }

    /// Used when the server list can't be read — no config yet, offline, or a
    /// failed request. Without it a transient error makes campus signup
    /// impossible, because an unrecognized domain is indistinguishable from
    /// "we haven't opened that school." The server list wins whenever it
    /// arrives; this only has to cover the campuses we actually launch at.
    static let bundledFallback: [CampusRow] = [
        .init(id: "umich",  name: "University of Michigan",   city: "ANN ARBOR",
              state: "MI", zip: "48104", emailDomain: "umich.edu"),
        .init(id: "msu",    name: "Michigan State University", city: "EAST LANSING",
              state: "MI", zip: "48824", emailDomain: "msu.edu"),
        .init(id: "utexas", name: "UT Austin",                city: "AUSTIN",
              state: "TX", zip: "78712", emailDomain: "utexas.edu"),
        .init(id: "wisc",   name: "UW–Madison",               city: "MADISON",
              state: "WI", zip: "53706", emailDomain: "wisc.edu"),
        .init(id: "nwu",    name: "Northwestern",             city: "EVANSTON",
              state: "IL", zip: "60208", emailDomain: "northwestern.edu"),
        .init(id: "unc",    name: "UNC Chapel Hill",          city: "CHAPEL HILL",
              state: "NC", zip: "27599", emailDomain: "unc.edu")
    ]
}

struct NotificationRow: Decodable, Identifiable {
    let id: UUID
    let kind: String
    let createdAt: Date
    let readAt: Date?
}
