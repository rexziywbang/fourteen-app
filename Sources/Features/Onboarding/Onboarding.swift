import SwiftUI

// MARK: - Onboarding flow

struct OnboardingFlow: View {
    @EnvironmentObject var store: Store
    @State private var step: Step = .intro
    @State private var kind = "campus"
    @State private var campusID: String?
    @State private var email = ""

    enum Step { case intro, kind, email, verify, age, profile }

    var body: some View {
        Group {
            switch step {
            case .intro:  IntroView { step = .kind }
            case .kind:   AccountKindView(kind: $kind) { step = .email }
            case .email:  EmailView(kind: kind, email: $email, campusID: $campusID) { step = .verify }
            case .verify: VerifyView(email: email) { step = .age }
            case .age:    AgeGateView { step = .profile }
            case .profile: ProfileView(kind: kind, campusID: campusID)
            }
        }
        .animation(.easeOut(duration: 0.2), value: step)
    }
}

struct IntroView: View {
    @EnvironmentObject var store: Store
    let next: () -> Void
    var body: some View {
        PostmarkPage {
            Kicker(text: "Something is already on its way")
            Text("Someone sent it.\nYou get fourteen days.")
                .font(Face.display(26)).textCase(.uppercase)
                .fixedSize(horizontal: false, vertical: true)
            NotificationPreview()
            Text("You send one person a week. They get fourteen days of true clues about you — and never find out it was you unless you say so.")
                .font(Face.body(12)).foregroundStyle(Ink.ink2(store.nightShift))

            // Hero sits under the masthead; the call to action rides the
            // bottom where a thumb actually reaches.
            Spacer(minLength: 24)

            PostmarkButton(title: "Claim your address", kind: .post, action: next)
            Kicker(text: "18+ · No photos · Nothing to type")
                .frame(maxWidth: .infinity, alignment: .center)
            if !store.configured {
                Text("Supabase.plist is missing — add it before signing in.")
                    .font(Face.body(11)).foregroundStyle(Ink.crush)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
    }
}

// MARK: - Account kind
//
// Both kinds are equal citizens: they crush on each other, share circles, and
// reach mutual identically. Only discovery and chrome differ.

struct AccountKindView: View {
    @EnvironmentObject var store: Store
    @Binding var kind: String
    let next: () -> Void

    var body: some View {
        PostmarkPage {
            Kicker(text: "Two ways in")
            Text("How should we\naddress you?")
                .font(Face.display(24)).textCase(.uppercase)
                .fixedSize(horizontal: false, vertical: true)

            card(title: "School address", sub: "you@umich.edu",
                 bullets: ["Your campus postmark on every screen",
                           "Search classmates by name",
                           "Faster to build a circle"],
                 buttonKind: .post) { kind = "campus"; next() }

            card(title: "Personal address", sub: "you@gmail.com",
                 bullets: ["Generic postmark — no school shown",
                           "Circle is invite-only",
                           "Works with campus accounts either way"],
                 buttonKind: .plain) { kind = "personal"; next() }

            Text("Either way you can send to, receive from, and match with anyone in your circle. The only difference is how easily people find you.")
                .font(Face.body(11)).foregroundStyle(Ink.muted(store.nightShift))
        }
    }

    private func card(title: String, sub: String, bullets: [String],
                      buttonKind: PostmarkButton.Kind,
                      action: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title.uppercased()).font(Face.display(13))
                    Text(sub).font(Face.mono(9)).foregroundStyle(Ink.muted(store.nightShift))
                }
                Spacer()
                PostageStamp()
            }
            ForEach(bullets, id: \.self) { b in
                HStack(alignment: .top, spacing: 6) {
                    Text("—").font(Face.mono(9)).foregroundStyle(Ink.muted(store.nightShift))
                    Text(b).font(Face.body(11.5)).foregroundStyle(Ink.ink2(store.nightShift))
                }
            }
            PostmarkButton(title: "Use this", kind: buttonKind, action: action)
        }
        .padding(12)
        .background(Ink.kraft2(store.nightShift))
        .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: Metric.rule))
    }
}

// MARK: - Email

struct EmailView: View {
    @EnvironmentObject var store: Store
    let kind: String
    @Binding var email: String
    @Binding var campusID: String?
    let next: () -> Void
    @State private var busy = false

    private var matched: CampusRow? {
        let domain = email.lowercased().split(separator: "@").last.map(String.init) ?? ""
        return store.campuses.first { domain == $0.emailDomain || domain.hasSuffix("." + $0.emailDomain) }
    }
    private var valid: Bool {
        guard email.contains("@"), email.contains("."), email.count > 5 else { return false }
        return kind == "personal" || matched != nil
    }

    var body: some View {
        PostmarkPage {
            BackLine(title: "Back") { }
            Kicker(text: "Your address")
            Text("Where should\nwe send it?")
                .font(Face.display(24)).textCase(.uppercase)
                .fixedSize(horizontal: false, vertical: true)

            TextField("you@example.com", text: $email)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .font(Face.mono(12))
                .padding(12)
                .background(Ink.kraft2(store.nightShift))
                .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: Metric.rule))

            if kind == "campus" {
                if let c = matched {
                    HStack(spacing: 6) {
                        Text("◉")
                        Text("\(c.name) — you'll get the \(c.city.capitalized) postmark.")
                            .font(Face.body(11))
                    }
                    .foregroundStyle(Ink.post(store.nightShift))
                } else if email.contains("@") {
                    Text("That domain isn't a campus we've opened yet. You can use a personal address instead.")
                        .font(Face.body(11)).foregroundStyle(Ink.muted(store.nightShift))
                }
            }

            PostmarkButton(title: busy ? "Sending…" : "Send the code",
                           kind: .post, enabled: valid && !busy) {
                Task {
                    busy = true
                    campusID = matched?.id
                    if await store.sendCode(to: email.lowercased()) { next() }
                    busy = false
                }
            }
            if let e = store.errorMessage {
                Text(e).font(Face.body(11)).foregroundStyle(Ink.crush)
            }
        }
    }
}

struct VerifyView: View {
    @EnvironmentObject var store: Store
    let email: String
    let next: () -> Void
    @State private var code = ""
    @State private var busy = false

    var body: some View {
        PostmarkPage {
            Kicker(text: "Check your mail")
            Text("Six digits,\nten minutes.")
                .font(Face.display(24)).textCase(.uppercase)
                .fixedSize(horizontal: false, vertical: true)
            Text(email).font(Face.mono(10)).foregroundStyle(Ink.muted(store.nightShift))

            TextField("000000", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .font(Face.mono(22, .bold))
                .multilineTextAlignment(.center)
                .padding(14)
                .background(Ink.kraft2(store.nightShift))
                .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: Metric.rule))

            PostmarkButton(title: busy ? "Checking…" : "Verify",
                           kind: .post, enabled: code.count >= 6 && !busy) {
                Task {
                    busy = true
                    if await store.verify(email: email, code: code) {
                        // Returning users skip straight past the gate.
                        if store.isOnboarded { await store.refreshAll() } else { next() }
                    }
                    busy = false
                }
            }
            if let e = store.errorMessage {
                Text(e).font(Face.body(11)).foregroundStyle(Ink.crush)
            }
        }
    }
}

// MARK: - Age gate
//
// Neutral by construction: a plain wheel, no hint of the threshold before
// entry, and the date is discarded on device — only the derived boolean is
// ever sent. The server refuses a profile when it is false, so patching the
// client gains nothing.

struct AgeGateView: View {
    @EnvironmentObject var store: Store
    let next: () -> Void
    @State private var dob = Calendar.current.date(byAdding: .year, value: -20, to: Date())!
    @State private var rejected = false

    var body: some View {
        PostmarkPage {
            if rejected {
                Kicker(text: "Return to sender")
                Text("Fourteen is 18+.").font(Face.display(24)).textCase(.uppercase)
                Text("We can't open an account for you. Nothing you entered was kept.")
                    .font(Face.body(12)).foregroundStyle(Ink.ink2(store.nightShift))
                PostmarkButton(title: "Close", kind: .quiet) {
                    Task { await store.signOut() }
                }
            } else {
                Kicker(text: "One detail")
                Text("Date of birth").font(Face.display(24)).textCase(.uppercase)
                DatePicker("", selection: $dob, in: ...Date(), displayedComponents: .date)
                    .datePickerStyle(.wheel).labelsHidden()
                PostmarkButton(title: "Continue", kind: .post) {
                    let years = Calendar.current
                        .dateComponents([.year], from: dob, to: Date()).year ?? 0
                    if years >= 18 { next() } else { rejected = true }
                }
                Text("We keep whether you're 18 or over. We never keep the date.")
                    .font(Face.body(11)).foregroundStyle(Ink.muted(store.nightShift))
            }
        }
    }
}

struct ProfileView: View {
    @EnvironmentObject var store: Store
    let kind: String
    let campusID: String?
    @State private var first = ""
    @State private var last = ""
    @State private var year = 2028
    @State private var busy = false

    var body: some View {
        PostmarkPage {
            Kicker(text: "The name on the envelope")
            Text("What do people\ncall you?")
                .font(Face.display(24)).textCase(.uppercase)
                .fixedSize(horizontal: false, vertical: true)
            field("First name", $first)
            field("Last name", $last)
            if kind == "campus" {
                VStack(alignment: .leading, spacing: 5) {
                    Kicker(text: "Class year")
                    Picker("", selection: $year) {
                        ForEach(2026...2031, id: \.self) { Text(String($0)).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
            }
            Text("Your name is what friends search for. There are no photos and no bio — nothing to judge, and nothing to scroll.")
                .font(Face.body(11)).foregroundStyle(Ink.muted(store.nightShift))
            PostmarkButton(title: busy ? "Opening…" : "Open my mailbox",
                           kind: .post,
                           enabled: !first.isEmpty && !last.isEmpty && !busy) {
                Task {
                    busy = true
                    _ = await store.completeProfile(
                        kind: kind, campusID: campusID,
                        first: first, last: last,
                        gradYear: kind == "campus" ? year : nil,
                        isOver18: true)
                    busy = false
                }
            }
            if let e = store.errorMessage {
                Text(e).font(Face.body(11)).foregroundStyle(Ink.crush)
            }
        }
    }

    private func field(_ label: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Kicker(text: label)
            TextField("", text: text)
                .font(Face.body(15))
                .padding(11)
                .background(Ink.kraft2(store.nightShift))
                .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: Metric.rule))
        }
    }
}
