import SwiftUI
import UIKit   // UIAccessibility.isReduceMotionEnabled

// MARK: - Sent ("Tracking, sender side")
//
// Without this the sender's fourteen days are entirely passive, which is a
// retention hole in the exact middle of the core loop.

struct SentView: View {
    @EnvironmentObject var store: Store
    let crushID: UUID
    @Binding var route: Route
    @State private var showConsent = false

    private var crush: CrushOutboxRow? { store.outbox.first { $0.id == crushID } }

    var body: some View {
        ZStack {
            PostmarkPage(showsStripe: false, masthead: false) {
                BackLine(title: "Delivered") { route = .home }
                if let crush {
                    Kicker(text: "Tracking · outbound")
                    Text("\(crush.recipientFirstName) \(crush.recipientLastName)")
                        .font(Face.display(20)).textCase(.uppercase)
                    TrackBar(remaining: crush.daysRemaining, lit: Ink.post(store.nightShift))
                    HStack {
                        Text("DAY \(min(14, 15 - max(1, crush.daysRemaining)))")
                        Spacer()
                        Text("\(crush.cluesUnlocked) OF 14 CANCELLED")
                    }
                    .font(Face.mono(7.5)).tracking(1)
                    .foregroundStyle(Ink.muted(store.nightShift))

                    SectionHead(title: "Status")
                    row("SENT", DateFormatter.stampLine(crush.createdAt))
                    row("OPENED", "\(crush.cluesUnlocked) of 14 clues")
                    if let label = crush.nextClueLabel {
                        row("TOMORROW", label.capitalized)
                    }
                    if crush.awaitingConsent {
                        row("TODAY", "They guessed you.", hot: true)
                    }
                    if crush.consentCall == "stayed_anonymous" {
                        Text("You stayed anonymous. They were never told they were right, and the clock keeps running.")
                            .font(Face.body(11)).foregroundStyle(Ink.muted(store.nightShift))
                    }
                }
            }
            if let crush, crush.awaitingConsent, showConsent {
                consentSheet(crush)
            }
        }
        .onAppear { showConsent = crush?.awaitingConsent ?? false }
    }

    private func row(_ k: String, _ v: String, hot: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Text(k).font(Face.mono(7.5)).tracking(1)
                .foregroundStyle(Ink.muted(store.nightShift))
                .frame(width: 66, alignment: .leading)
            Text(v).font(Face.body(11))
                .foregroundStyle(hot ? Ink.crush : Ink.ink(store.nightShift))
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
        .overlay(alignment: .bottom) { HairRule() }
    }

    /// Both outcomes are legitimate and both buttons carry equal weight. A
    /// greyed-out decline would tell the sender they picked wrong, which is
    /// the opposite of consent design.
    private func consentSheet(_ crush: CrushOutboxRow) -> some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.55).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 11) {
                Text("SIGNATURE REQUESTED")
                    .font(Face.mono(7.5)).tracking(1.6)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: 1.2))
                Text("They guessed you.").font(Face.display(17)).textCase(.uppercase)
                Text("Sign for it, or stay anonymous. They will never know they were right unless you say so.")
                    .font(Face.body(11)).foregroundStyle(Ink.ink2(store.nightShift))
                PostmarkButton(title: "Sign for it", kind: .crush) {
                    Task {
                        await store.consent(crush: crush.id, signedFor: true)
                        route = .reveal(crush.id)
                    }
                }
                PostmarkButton(title: "Stay anonymous", kind: .plain) {
                    Task {
                        await store.consent(crush: crush.id, signedFor: false)
                        showConsent = false
                    }
                }
            }
            .padding(14)
            .background(Ink.kraft2(store.nightShift))
            .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: Metric.rule))
            .padding(9)
        }
    }
}

// MARK: - Reveal ("Signed for")
//
// The only inverted screen in the app, and the only viral surface the product
// has — no feed, no profiles, no share mechanics. Composed to be screenshot:
// chrome-free, 9:16 safe, wordmark and postmark built in. The crush hairline
// between the names is the one mark identical in every edition.

struct RevealView: View {
    @EnvironmentObject var store: Store
    let crushID: UUID
    @Binding var route: Route
    @State private var reveal: RevealRow?
    @State private var phase = 0
    @State private var showChrome = true

    var body: some View {
        ZStack {
            Ink.ink(store.nightShift).ignoresSafeArea()
            VStack(spacing: 0) {
                AirmailStripe(inverted: true)
                Text(reveal?.status == "mutual" ? "SIGNED FOR · IT'S MUTUAL" : "SIGNED FOR")
                    .font(Face.mono(8)).tracking(2.4)
                    .foregroundStyle(Ink.onInk(store.nightShift).opacity(0.75))
                    .padding(.top, 16)
                    .opacity(phase >= 1 ? 1 : 0)

                postmarkCircle
                    .padding(.top, 14)
                    .opacity(phase >= 1 ? 1 : 0)
                    .scaleEffect(phase >= 1 ? 1 : 0.85)

                Spacer()
                VStack(spacing: 0) {
                    Text((reveal?.senderFirstName ?? "").uppercased())
                        .font(Face.display(39))
                        .opacity(phase >= 2 ? 1 : 0)
                        .offset(y: phase >= 2 ? 0 : 14)
                    Rectangle().fill(Ink.crush)
                        .frame(width: 190, height: 2)
                        .padding(.vertical, 13)
                        .opacity(phase >= 3 ? 1 : 0)
                    Text((reveal?.recipientFirstName ?? "").uppercased())
                        .font(Face.display(39))
                        .opacity(phase >= 3 ? 1 : 0)
                        .offset(y: phase >= 3 ? 0 : 14)
                }
                .foregroundStyle(Ink.onInk(store.nightShift))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .padding(.horizontal, 14)

                Text("You already have each other's numbers.\nThe rest is history.")
                    .font(Face.quote(11.5))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Ink.onInk(store.nightShift).opacity(0.8))
                    .padding(.top, 14)
                    .opacity(phase >= 4 ? 1 : 0)
                Spacer()

                Text("FOURTEEN. · \(store.campusPostmark) · \(DateFormatter.stampLine(Date()))")
                    .font(Face.mono(7)).tracking(1.8)
                    .foregroundStyle(Ink.onInk(store.nightShift).opacity(0.75))
                    .padding(.top, 8)
                    .overlay(alignment: .top) {
                        Rectangle().frame(height: Metric.rule)
                            .foregroundStyle(Ink.onInk(store.nightShift))
                    }
                    .padding(.horizontal, Metric.gutter)
                    .opacity(phase >= 4 ? 1 : 0)
                    .padding(.bottom, 10)
            }
            if showChrome {
                VStack {
                    Spacer()
                    PostmarkButton(title: "Back", kind: .quiet) { route = .home }
                        .padding(.horizontal, Metric.gutter).padding(.bottom, 10)
                }
                .transition(.opacity)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { withAnimation { showChrome.toggle() } }
        .task {
            reveal = await store.reveal(crushID)
            run()
            // Chrome retreats on its own so a screenshot is clean by default.
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            withAnimation { showChrome = false }
        }
    }

    private var postmarkCircle: some View {
        VStack(spacing: 1) {
            Text(store.campusCity ?? "FOURTEEN").font(Face.mono(6.5)).tracking(0.6)
            Text(DateFormatter.stampLine(Date())).font(Face.mono(6.5))
        }
        .foregroundStyle(Ink.onInk(store.nightShift))
        .frame(width: 74, height: 74)
        .overlay(Circle().strokeBorder(Ink.onInk(store.nightShift), lineWidth: Metric.rule))
        .rotationEffect(.degrees(-11))
        .opacity(0.9)
    }

    /// Plays once. Never loops — a looping reveal turns a moment into a
    /// screensaver.
    private func run() {
        guard !UIAccessibility.isReduceMotionEnabled else { phase = 4; return }
        for (delay, p) in [(0.15, 1), (0.55, 2), (1.05, 3), (1.5, 4)] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                withAnimation(.spring(response: 0.5, dampingFraction: 0.72)) { phase = p }
            }
        }
    }
}

// MARK: - You

struct YouView: View {
    @EnvironmentObject var store: Store
    @Binding var route: Route
    @State private var invite: String?
    @State private var showReport = false
    @State private var showDelete = false
    @State private var confirmText = ""

    var body: some View {
        PostmarkPage(showsStripe: false) {
            SectionHead(title: "Your address")
            row("Name", "\(store.me?.firstName ?? "") \(store.me?.lastName ?? "")")
            row("Account", store.me?.kind == "campus" ? "School address" : "Personal address")
            row("Postmark", store.campusPostmark)
            if let n = store.me?.campusName { row("School", n) }

            SectionHead(title: "Your circle · \(store.circle.count)")
            ForEach(store.circle) { p in
                HStack {
                    Text(p.displayName).font(Face.body(12.5))
                    Spacer()
                    Button("Block") { Task { await store.block(p.id) } }
                        .font(Face.mono(8)).tracking(1)
                        .foregroundStyle(Ink.muted(store.nightShift))
                }
                .padding(.vertical, 7)
                .overlay(alignment: .bottom) { HairRule() }
            }

            if !store.blockedList.isEmpty {
                SectionHead(title: "Blocked")
                ForEach(store.blockedList) { p in
                    HStack {
                        Text(p.displayName).font(Face.body(12.5))
                        Spacer()
                        Button("Unblock") { Task { await store.unblock(p.id) } }
                            .font(Face.mono(8)).tracking(1)
                            .foregroundStyle(Ink.post(store.nightShift))
                    }
                    .padding(.vertical, 7)
                    .overlay(alignment: .bottom) { HairRule() }
                }
                Text("Blocking is silent and total. They are never told, and any letter between you goes quiet in both directions.")
                    .font(Face.body(10.5)).foregroundStyle(Ink.muted(store.nightShift))
            }

            SectionHead(title: "Settings")
            Toggle(isOn: $store.nightShift) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Night shift").font(Face.body(12.5, .medium))
                    Text("The late edition — kraft and ink trade places")
                        .font(Face.body(10)).foregroundStyle(Ink.muted(store.nightShift))
                }
            }
            .tint(Ink.post(store.nightShift))
            .padding(.vertical, 4)

            PostmarkButton(title: invite == nil ? "Create an invite link" : "Share \(invite!)",
                           kind: .plain) {
                Task { if invite == nil { invite = await store.createInvite() } }
            }
            if let code = invite, let url = URL(string: "https://fourteen.app/i/\(code)") {
                ShareLink(item: url) {
                    Text("SHARE LINK").font(Face.mono(8)).tracking(1.4)
                        .frame(maxWidth: .infinity, minHeight: Metric.tap)
                        .foregroundStyle(Ink.post(store.nightShift))
                }
            }
            Text("An invite adds you both to each other's circles — which is how a personal account builds one without a directory.")
                .font(Face.body(11)).foregroundStyle(Ink.muted(store.nightShift))

            SectionHead(title: "Safety")
            PostmarkButton(title: "Report someone", kind: .quiet) { showReport = true }
            PostmarkButton(title: "Sign out", kind: .quiet) { Task { await store.signOut() } }
            PostmarkButton(title: "Delete account", kind: .quiet) { showDelete = true }
            Text("Fourteen is 18+. Deleting removes your profile, your circle, and every letter you have sent or received.")
                .font(Face.body(10.5)).foregroundStyle(Ink.muted(store.nightShift))
        }
        .sheet(isPresented: $showReport) { ReportSheet() }
        .alert("Delete account", isPresented: $showDelete) {
            TextField("Type DELETE", text: $confirmText)
            Button("Cancel", role: .cancel) { confirmText = "" }
            Button("Delete", role: .destructive) {
                if confirmText == "DELETE" { Task { await store.deleteAccount() } }
                confirmText = ""
            }
        } message: {
            Text("This cannot be undone. Type DELETE to confirm.")
        }
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k.uppercased()).font(Face.mono(8)).tracking(1.2)
                .foregroundStyle(Ink.muted(store.nightShift))
            Spacer()
            Text(v).font(Face.body(12.5))
        }
        .padding(.vertical, 7)
        .overlay(alignment: .bottom) { HairRule() }
    }
}

struct ReportSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var reason = "harassment"
    @State private var detail = ""

    private let reasons = [
        ("harassment", "Harassment or bullying"),
        ("not_18", "This person isn't 18+"),
        ("impersonation", "Impersonation"),
        ("spam", "Spam"),
        ("other", "Something else")
    ]

    var body: some View {
        PostmarkPage(showsStripe: false, masthead: false) {
            Text("Report").font(Face.display(20)).textCase(.uppercase)
            Kicker(text: "Reviewed by a person · never shown to anyone else")
            ForEach(reasons, id: \.0) { code, label in
                Button { reason = code } label: {
                    HStack {
                        Text(label).font(Face.body(12.5))
                        Spacer()
                        if reason == code { Text("✓").font(Face.display(12)) }
                    }
                    .padding(11)
                    .background(reason == code ? Ink.kraft2(store.nightShift) : .clear)
                    .overlay(Rectangle().strokeBorder(
                        reason == code ? Ink.ink(store.nightShift) : Ink.rule(store.nightShift),
                        lineWidth: reason == code ? Metric.rule : Metric.hair))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Ink.ink(store.nightShift))
            }
            // The one free-text field in the app — admin-eyes only, never
            // rendered to another user, and capped server-side at 500 chars.
            TextField("Anything else we should know (optional)", text: $detail, axis: .vertical)
                .lineLimit(3...6)
                .font(Face.body(12))
                .padding(11)
                .background(Ink.kraft2(store.nightShift))
                .overlay(Rectangle().strokeBorder(Ink.rule(store.nightShift), lineWidth: Metric.hair))
            PostmarkButton(title: "Send report", kind: .post) {
                Task {
                    _ = await store.report(subject: nil, reason: reason, detail: detail)
                    dismiss()
                }
            }
        }
    }
}
