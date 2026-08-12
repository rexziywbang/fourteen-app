import Foundation
import SwiftUI
import Security

// MARK: - Store
//
// The single source of truth for the UI. Every mutation delegates to an RPC;
// nothing is computed locally that the server also decides (weekly postage,
// clue unlocks, correctness). Where the two could disagree, the server wins
// and this object re-reads.

@MainActor
final class Store: ObservableObject {

    // Session
    @Published var me: MeRow?
    @Published var isSignedIn = false
    @Published var isOnboarded = false
    @Published var configured = true
    @Published var nightShift = UserDefaults.standard.bool(forKey: "nightShift") {
        didSet { UserDefaults.standard.set(nightShift, forKey: "nightShift") }
    }

    // Content
    @Published var circle: [PersonRow] = []
    @Published var inbox: [CrushInboxRow] = []
    @Published var outbox: [CrushOutboxRow] = []
    @Published var clues: [UUID: [ClueRowWire]] = [:]
    @Published var compliments: [ComplimentRow] = []
    @Published var round: [RoundCardRow] = []
    @Published var roundPeople: [UUID: PersonRow] = [:]
    @Published var messages: [MessageRow] = []
    @Published var campuses: [CampusRow] = []
    @Published var blockedList: [PersonRow] = []

    // UI
    @Published var loading = false
    @Published var errorMessage: String?

    private let api = API.shared
    private let keychain = Keychain(service: "app.fourteen.session")

    var activeCrush: CrushInboxRow? { inbox.first { $0.status == "active" } }
    var revealable: CrushInboxRow? { inbox.first { $0.status == "mutual" || $0.status == "revealed" } }
    var myCrush: CrushOutboxRow? {
        outbox.first { $0.status == "active" || $0.status == "revealed" || $0.status == "mutual" }
    }
    var postageAvailable: Bool {
        !outbox.contains {
            $0.status != "suppressed" &&
            Calendar.current.isDate($0.createdAt, equalTo: Date(), toGranularity: .weekOfYear)
        }
    }
    var campusPostmark: String {
        guard let me else { return "POSTED ANONYMOUSLY" }
        if me.kind == "campus", let c = me.campusCity, let s = me.campusState, let z = me.campusZip {
            return "\(c) \(s) \(z)"
        }
        return "POSTED ANONYMOUSLY"
    }
    var campusCity: String? { me?.kind == "campus" ? me?.campusCity : nil }
    var hasDirectory: Bool { me?.kind == "campus" }

    // MARK: Boot

    func boot() async {
        // Seed from the bundle first so the signup screen can recognize a
        // campus domain even before — or without — a successful server read.
        campuses = CampusRow.bundledFallback
        await api.configure()
        configured = await api.isConfigured
        guard configured else { return }

        if let a = keychain.get("access"), let r = keychain.get("refresh") {
            await api.restore(access: a, refresh: r)
            if (try? await api.refreshSession()) == true {
                await persistTokens()
                isSignedIn = true
                await loadMe()
            }
        }
        // Server list is authoritative when it arrives; the bundle stands in
        // when it doesn't.
        if let live = try? await api.select("campus_v", [CampusRow].self), !live.isEmpty {
            campuses = live
        }
    }

    private func persistTokens() async {
        let (a, r) = await api.tokens()
        if let a { keychain.set(a, for: "access") }
        if let r { keychain.set(r, for: "refresh") }
    }

    // MARK: Auth

    func sendCode(to email: String) async -> Bool {
        await run { try await self.api.sendCode(to: email) }
    }

    func verify(email: String, code: String) async -> Bool {
        let ok = await run { try await self.api.verifyCode(email: email, code: code) }
        if ok {
            await persistTokens()
            isSignedIn = true
            await loadMe()
        }
        return ok
    }

    /// The 18+ boolean is the ONLY thing that crosses the wire from the age
    /// gate — the date is discarded on device and never transmitted. The
    /// server refuses to create a profile when it is false, so a patched
    /// client gains nothing.
    func completeProfile(kind: String, campusID: String?, first: String,
                         last: String, gradYear: Int?, isOver18: Bool) async -> Bool {
        guard isOver18 else { return false }
        let ok = await run {
            try await self.api.rpc("complete_profile", [
                "p_kind": kind,
                "p_campus": campusID as Any,
                "p_first": first,
                "p_last": last,
                "p_grad": gradYear as Any,
                "p_over_18": true
            ])
        }
        if ok { await loadMe(); await refreshAll() }
        return ok
    }

    func signOut() async {
        await api.signOutLocally()
        keychain.clear()
        me = nil; isSignedIn = false; isOnboarded = false
        inbox = []; outbox = []; circle = []; compliments = []; round = []
    }

    func deleteAccount() async {
        _ = await run { try await self.api.rpc("delete_account") }
        await signOut()
    }

    // MARK: Loads

    func loadMe() async {
        guard let rows = try? await api.select("me_v", [MeRow].self) else { return }
        me = rows.first
        isOnboarded = me?.onboardedAt != nil
    }

    func refreshAll() async {
        guard isOnboarded else { return }
        loading = true
        defer { loading = false }
        async let c: [PersonRow]        = (try? api.select("my_circle_v", [PersonRow].self)) ?? []
        async let i: [CrushInboxRow]    = (try? api.select("crush_inbox_v", [CrushInboxRow].self)) ?? []
        async let o: [CrushOutboxRow]   = (try? api.select("crush_outbox_v", [CrushOutboxRow].self)) ?? []
        async let p: [ComplimentRow]    = (try? api.select("compliments_v", [ComplimentRow].self)) ?? []
        async let m: [MessageRow]       = (try? api.select("message_library_v", [MessageRow].self)) ?? []
        async let b: [PersonRow]        = (try? api.select("my_blocks_v", [PersonRow].self)) ?? []
        circle = await c; inbox = await i; outbox = await o
        compliments = await p; messages = await m; blockedList = await b
        if let crush = activeCrush { await loadClues(crush.id) }
        await loadRound()
    }

    func loadClues(_ crushID: UUID) async {
        guard let rows = try? await api.select(
            "crush_clues_v", [ClueRowWire].self,
            query: ["select": "*", "crush_id": "eq.\(crushID.uuidString.lowercased())"])
        else { return }
        clues[crushID] = rows.sorted { $0.dayIndex < $1.dayIndex }
    }

    func loadRound() async {
        _ = try? await api.rpc("get_or_create_round")
        round = (try? await api.select("my_round_v", [RoundCardRow].self)) ?? []
        let needed = Set(round.flatMap(\.optionIds)).subtracting(roundPeople.keys)
        if !needed.isEmpty {
            for p in circle where needed.contains(p.id) { roundPeople[p.id] = p }
        }
    }

    // MARK: Actions

    func search(_ q: String) async -> [PersonRow] {
        guard hasDirectory, q.trimmingCharacters(in: .whitespaces).count >= 3 else { return [] }
        return (try? await api.rpc("search_directory", [PersonRow].self, ["q": q])) ?? []
    }

    func addToCircle(_ id: UUID) async {
        _ = await run { try await self.api.rpc("add_to_circle", ["member": id.uuidString]) }
        await refreshAll()
    }

    func sendCrush(to person: PersonRow, messageID: Int) async -> Bool {
        let ok = await run {
            try await self.api.rpc("send_crush",
                ["recipient": person.id.uuidString, "message_id": messageID])
        }
        if ok { await refreshAll() }
        return ok
    }

    /// Idempotent server-side: opening twice in one local day unlocks nothing
    /// extra, and days away never stack.
    func openCrush(_ id: UUID) async {
        _ = try? await api.rpc("open_crush", ["crush": id.uuidString])
        await loadClues(id)
        inbox = (try? await api.select("crush_inbox_v", [CrushInboxRow].self)) ?? inbox
    }

    /// Returns nothing on purpose. There is no result to branch on: the
    /// caller shows one screen regardless, because the server's answer is
    /// identical whether the guess was right or wrong.
    func submitGuess(crush: UUID, person: PersonRow) async {
        _ = try? await api.rpc("submit_guess",
            ["crush": crush.uuidString, "guessed": person.id.uuidString])
        inbox = (try? await api.select("crush_inbox_v", [CrushInboxRow].self)) ?? inbox
    }

    func consent(crush: UUID, signedFor: Bool) async {
        _ = await run {
            try await self.api.rpc("consent_reveal", [
                "crush": crush.uuidString,
                "decision": signedFor ? "signed_for" : "stayed_anonymous"
            ])
        }
        await refreshAll()
    }

    func answer(card: RoundCardRow, pick: UUID?) async {
        _ = try? await api.rpc("answer_card",
            ["card": card.id.uuidString, "pick": pick?.uuidString as Any])
        await loadRound()
    }

    func block(_ id: UUID) async {
        _ = await run { try await self.api.rpc("block_user", ["target": id.uuidString]) }
        await refreshAll()
    }

    func unblock(_ id: UUID) async {
        _ = await run { try await self.api.rpc("unblock_user", ["target": id.uuidString]) }
        await refreshAll()
    }

    func report(subject: UUID?, reason: String, detail: String) async -> Bool {
        await run {
            try await self.api.rpc("submit_report", [
                "subject": subject?.uuidString as Any,
                "reason_code": reason,
                "detail": detail
            ])
        }
    }

    func createInvite() async -> String? {
        try? await api.rpc("create_invite", String.self)
    }

    func claimInvite(_ code: String) async {
        _ = await run { try await self.api.rpc("claim_invite", ["code": code]) }
        await refreshAll()
    }

    func registerPush(token: String) async {
        _ = try? await api.rpc("register_push", ["token": token])
    }

    func reveal(_ crushID: UUID) async -> RevealRow? {
        let rows = try? await api.select("reveal_v", [RevealRow].self,
            query: ["select": "*", "id": "eq.\(crushID.uuidString.lowercased())"])
        return rows?.first
    }

    // MARK: Helper

    @discardableResult
    private func run(_ work: @escaping () async throws -> Void) async -> Bool {
        do { try await work(); errorMessage = nil; return true }
        catch { errorMessage = (error as? LocalizedError)?.errorDescription
                            ?? "Something went wrong."; return false }
    }
}

// MARK: - Keychain
//
// Session tokens go here, never UserDefaults. ThisDeviceOnly so a restored
// backup on a different phone cannot resume someone else's session.

struct Keychain {
    let service: String

    func set(_ value: String, for key: String) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: service,
                                kSecAttrAccount as String: key]
        SecItemDelete(q as CFDictionary)
        var add = q
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    func get(_ key: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: service,
                                kSecAttrAccount as String: key,
                                kSecReturnData as String: true,
                                kSecMatchLimit as String: kSecMatchLimitOne]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    func clear() {
        for key in ["access", "refresh"] {
            SecItemDelete([kSecClass as String: kSecClassGenericPassword,
                           kSecAttrService as String: service,
                           kSecAttrAccount as String: key] as CFDictionary)
        }
    }
}
