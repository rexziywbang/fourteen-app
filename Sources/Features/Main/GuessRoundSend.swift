import SwiftUI

// MARK: - Guess
//
// The result screen is the ONLY screen in the app with zero accent color. Any
// green, red, or gold here would leak the answer the whole product exists to
// withhold. The absence is itself the signal — and note that `submitGuess`
// returns nothing, so this view has nothing to branch on even if it wanted to.

struct GuessView: View {
    @EnvironmentObject var store: Store
    let crushID: UUID
    @Binding var route: Route
    @State private var query = ""
    @State private var results: [PersonRow] = []
    @State private var picked: PersonRow?
    @State private var submitted = false

    private var candidates: [PersonRow] {
        if query.trimmingCharacters(in: .whitespaces).isEmpty { return store.circle }
        let local = store.circle.filter {
            $0.displayName.lowercased().contains(query.lowercased())
        }
        return local.isEmpty ? results : local
    }

    var body: some View {
        if submitted { neutralResult } else { picker }
    }

    private var picker: some View {
        PostmarkPage(showsStripe: false, masthead: false) {
            BackLine(title: "Tracking") { route = .trail(crushID) }
            Text("Name your sender").font(Face.display(20)).textCase(.uppercase)
            Kicker(text: "One guess a day · they're never told you tried")

            TextField("Search a name", text: $query)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .font(Face.body(14))
                .padding(11)
                .background(Ink.kraft2(store.nightShift))
                .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: Metric.rule))
                .onChange(of: query) { q in
                    Task { results = await store.search(q) }
                }

            ForEach(candidates) { p in
                Button { picked = p } label: {
                    HStack {
                        Text(p.displayName).font(Face.body(13, .medium))
                        Spacer()
                        if let y = p.gradYear {
                            Text("'\(String(y).suffix(2))").font(Face.mono(9))
                                .foregroundStyle(Ink.muted(store.nightShift))
                        }
                        if picked?.id == p.id { Text("✓").font(Face.display(12)) }
                    }
                    .padding(11)
                    .background(picked?.id == p.id ? Ink.kraft2(store.nightShift) : .clear)
                    .overlay(Rectangle().strokeBorder(
                        picked?.id == p.id ? Ink.ink(store.nightShift) : Ink.rule(store.nightShift),
                        lineWidth: picked?.id == p.id ? Metric.rule : Metric.hair))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Ink.ink(store.nightShift))
            }

            if let picked {
                PostmarkButton(title: "Use today's guess on \(picked.firstName)", kind: .quiet) {
                    Task {
                        await store.submitGuess(crush: crushID, person: picked)
                        submitted = true
                    }
                }
            }
        }
    }

    private var neutralResult: some View {
        ZStack {
            Ink.kraft(store.nightShift).ignoresSafeArea()
            VStack(spacing: 14) {
                Spacer()
                Text("RECORDED")
                    .font(Face.mono(8)).tracking(2.8)
                    .foregroundStyle(Ink.muted(store.nightShift))
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .overlay(Rectangle().strokeBorder(Ink.rule(store.nightShift), lineWidth: 1))
                Text("That's all\nwe're saying.")
                    .font(Face.display(21)).textCase(.uppercase)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Ink.ink2(store.nightShift))
                Text("Right or wrong, this screen looks the same. It always will.")
                    .font(Face.body(11))
                    .foregroundStyle(Ink.muted(store.nightShift))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 220)
                Spacer()
                PostmarkButton(title: "Back to tracking", kind: .quiet) { route = .trail(crushID) }
                    .frame(maxWidth: 220)
            }
            .padding(Metric.gutter)
        }
    }
}

// MARK: - Round ("Today's delivery")
//
// The daily habit. It must never feel like an event — postal blue only, and
// the romance color goes nowhere near it, or the two compete for the same
// register and both get quieter.

struct RoundView: View {
    @EnvironmentObject var store: Store
    @Binding var route: Route

    private var card: RoundCardRow? {
        store.round.first { $0.answeredAt == nil }
    }
    private func person(_ id: UUID) -> PersonRow? {
        store.roundPeople[id] ?? store.circle.first { $0.id == id }
    }

    var body: some View {
        PostmarkPage(showsStripe: false, masthead: false) {
            if let card {
                Text("TODAY'S DELIVERY")
                    .font(Face.display(11)).tracking(1)
                    .frame(maxWidth: .infinity).padding(.vertical, 6)
                    .background(Ink.post(store.nightShift))
                    .foregroundStyle(Ink.onInk(store.nightShift))

                HStack {
                    Text("CARD \(card.position + 1) OF \(store.round.count)")
                    Spacer()
                    Text("SEALED · ALWAYS")
                }
                .font(Face.mono(7.5)).tracking(1)
                .foregroundStyle(Ink.muted(store.nightShift))

                Text(card.promptText)
                    .font(Face.display(20)).textCase(.uppercase)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.vertical, 6)

                ForEach(card.optionIds, id: \.self) { id in
                    if let p = person(id) {
                        Button { Task { await store.answer(card: card, pick: id) } } label: {
                            HStack(spacing: 9) {
                                Rectangle().fill(.clear).frame(width: 17, height: 17)
                                    .overlay(Rectangle().strokeBorder(
                                        Ink.ink(store.nightShift), lineWidth: 1.2))
                                Text(p.displayName).font(Face.body(13, .medium))
                                Spacer()
                                if let y = p.gradYear {
                                    Text("'\(String(y).suffix(2))").font(Face.mono(8))
                                        .foregroundStyle(Ink.muted(store.nightShift))
                                }
                            }
                            .padding(11)
                            .background(Ink.kraft2(store.nightShift))
                            .overlay(Rectangle().strokeBorder(
                                Ink.rule(store.nightShift), lineWidth: Metric.rule))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Ink.ink(store.nightShift))
                    }
                }

                Button { Task { await store.answer(card: card, pick: nil) } } label: {
                    Text("Skip this one")
                        .font(Face.mono(9)).tracking(0.8).underline()
                        .foregroundStyle(Ink.muted(store.nightShift))
                        .frame(maxWidth: .infinity, minHeight: Metric.tap)
                }
                .buttonStyle(.plain)

                Kicker(text: "They'll know someone said it — never who")
                    .frame(maxWidth: .infinity, alignment: .center)
            } else {
                VStack(spacing: 12) {
                    Spacer(minLength: 60)
                    Text("That's the round.").font(Face.display(20)).textCase(.uppercase)
                    Text("Everyone you picked hears about it within the hour — never who picked them.")
                        .font(Face.body(12)).multilineTextAlignment(.center)
                        .foregroundStyle(Ink.ink2(store.nightShift))
                    PostmarkButton(title: "Back to delivered", kind: .post) { route = .home }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .task { await store.loadRound() }
    }
}

// MARK: - Send ("Postage")

struct SendView: View {
    @EnvironmentObject var store: Store
    @Binding var route: Route
    @State private var query = ""
    @State private var results: [PersonRow] = []
    @State private var target: PersonRow?
    @State private var messageID: Int?
    @State private var confirming = false
    @State private var busy = false

    private var options: [PersonRow] {
        if query.trimmingCharacters(in: .whitespaces).isEmpty { return store.circle }
        let local = store.circle.filter { $0.displayName.lowercased().contains(query.lowercased()) }
        return local.isEmpty ? results : local
    }

    var body: some View {
        PostmarkPage(showsStripe: false, masthead: false) {
            BackLine(title: "Delivered") { route = .home }

            if !store.postageAvailable {
                Kicker(text: "No postage")
                Text("You've sent\nthis week's.")
                    .font(Face.display(21)).textCase(.uppercase)
                    .fixedSize(horizontal: false, vertical: true)
                Text("One a week is what makes receiving one mean something. Yours resets Monday.")
                    .font(Face.body(12)).foregroundStyle(Ink.ink2(store.nightShift))
            } else if let target {
                addressed(target)
            } else {
                Text("One stamp left").font(Face.display(19)).textCase(.uppercase)
                Kicker(text: "Your postage resets Monday")
                TextField(store.hasDirectory ? "Search your school" : "Search your circle",
                          text: $query)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .font(Face.body(14))
                    .padding(11)
                    .background(Ink.kraft2(store.nightShift))
                    .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: Metric.rule))
                    .onChange(of: query) { q in Task { results = await store.search(q) } }

                ForEach(options) { p in
                    Button { target = p } label: {
                        HStack {
                            Text(p.displayName).font(Face.body(13, .medium))
                            Spacer()
                            Text("→").font(Face.display(12))
                        }
                        .padding(11)
                        .overlay(Rectangle().strokeBorder(
                            Ink.rule(store.nightShift), lineWidth: Metric.hair))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Ink.ink(store.nightShift))
                }
                if !store.hasDirectory {
                    Text("Personal accounts build a circle by invite. Share your link from the You tab to add someone.")
                        .font(Face.body(11)).foregroundStyle(Ink.muted(store.nightShift))
                }
            }
        }
    }

    private func addressed(_ p: PersonRow) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("TO · \(p.shortName.uppercased())").font(Face.display(12))
                        Text(store.campusPostmark).font(Face.mono(7))
                            .foregroundStyle(Ink.muted(store.nightShift))
                    }
                    Spacer()
                    PostageStamp()
                }
                .padding(.bottom, 8)
                .overlay(alignment: .bottom) {
                    Rectangle().frame(height: 1)
                        .foregroundStyle(Ink.ink(store.nightShift)).opacity(0.5)
                }
                Kicker(text: "Exactly what arrives — no return address")
                NotificationPreview()
            }
            .padding(11)
            .background(Ink.kraft2(store.nightShift))
            .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: Metric.rule))

            SectionHead(title: "Pick your line")
            ForEach(store.messages) { m in
                Button { messageID = m.id } label: {
                    Text("“\(m.text)”")
                        .font(Face.quote(11.5))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(messageID == m.id ? Ink.crush : Ink.kraft2(store.nightShift))
                        .foregroundStyle(messageID == m.id ? .white : Ink.ink2(store.nightShift))
                        .overlay(Rectangle().strokeBorder(
                            messageID == m.id ? Ink.crush : Ink.rule(store.nightShift),
                            lineWidth: Metric.hair))
                        .rotationEffect(.degrees(messageID == m.id ? -0.6 : 0))
                }
                .buttonStyle(.plain)
            }

            PostmarkButton(
                title: busy ? "Sending…" : (confirming ? "Yes — drop it in the box" : "Drop it in the box"),
                kind: .crush, enabled: messageID != nil && !busy
            ) {
                guard let mid = messageID else { return }
                if confirming {
                    Task {
                        busy = true
                        if await store.sendCrush(to: p, messageID: mid) { route = .home }
                        busy = false
                    }
                } else { confirming = true }
            }
            Text(confirming
                 ? "This is your one for the week. There are no takebacks and no edits."
                 : "One a week — no takebacks.")
                .font(Face.body(11))
                .foregroundStyle(confirming ? Ink.crush : Ink.muted(store.nightShift))
                .frame(maxWidth: .infinity, alignment: .center)
            if let e = store.errorMessage {
                Text(e).font(Face.body(11)).foregroundStyle(Ink.crush)
            }
        }
    }
}
