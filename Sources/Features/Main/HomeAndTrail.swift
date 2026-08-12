import SwiftUI

// MARK: - Home ("Delivered")

struct HomeView: View {
    @EnvironmentObject var store: Store
    @Binding var route: Route

    var body: some View {
        PostmarkPage {
            if let crush = store.activeCrush {
                Button { route = .trail(crush.id) } label: { ParcelCard(crush: crush) }
                    .buttonStyle(.plain)
            } else if let m = store.revealable {
                PostmarkButton(title: "It's mutual — open it", kind: .crush) {
                    route = .reveal(m.id)
                }
            } else {
                emptyMailbox
            }

            dailyStrip

            if let mine = store.myCrush {
                Button { route = .sent(mine.id) } label: { SentStrip(crush: mine) }
                    .buttonStyle(.plain)
            }

            if !store.compliments.isEmpty {
                SectionHead(title: "Said about you")
                ForEach(store.compliments) { c in
                    HStack(alignment: .top, spacing: 7) {
                        Text("✦").font(.system(size: 11))
                            .foregroundStyle(Ink.post(store.nightShift))
                        Text("“\(c.promptText)”").font(Face.quote(11.5))
                        Spacer(minLength: 6)
                        Text(rel(c.createdAt)).font(Face.mono(7))
                            .foregroundStyle(Ink.muted(store.nightShift))
                    }
                    .padding(.vertical, 6)
                    HairRule()
                }
            }

            // Expiry fades to a line rather than vanishing mid-scroll:
            // disappearing without a trace reads as a bug, fading reads as
            // mercy — and mercy is the tone the whole product is aiming for.
            if store.inbox.contains(where: { $0.status == "expired" }) {
                Text("RETURNED TO SENDER")
                    .font(Face.mono(8)).tracking(1.4)
                    .foregroundStyle(Ink.muted(store.nightShift))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .overlay(Rectangle().strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .foregroundStyle(Ink.rule(store.nightShift)))
            }
        }
        .refreshable { await store.refreshAll() }
        .task { await store.refreshAll() }
    }

    private var emptyMailbox: some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker(text: "Nothing today")
            Text("Your mailbox is empty.").font(Face.display(17)).textCase(.uppercase)
            Text("Someone's probably working up the nerve.")
                .font(Face.quote(12)).foregroundStyle(Ink.ink2(store.nightShift))
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            .foregroundStyle(Ink.rule(store.nightShift)))
    }

    private var dailyStrip: some View {
        Button { route = .round } label: {
            HStack(spacing: 10) {
                Text("DAILY").font(Face.mono(7)).tracking(1.4)
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .overlay(Rectangle().strokeBorder(Ink.post(store.nightShift), lineWidth: 1.2))
                    .foregroundStyle(Ink.post(store.nightShift))
                VStack(alignment: .leading, spacing: 1) {
                    Text(ready ? "TODAY'S DELIVERY" : "UNLOCKS AT 4 PEOPLE")
                        .font(Face.display(10.5))
                    Text(ready ? "\(store.round.filter { $0.answeredAt == nil }.count) cards · 30 seconds"
                               : "\(store.circle.count) of 4 in your circle")
                        .font(Face.mono(8)).foregroundStyle(Ink.muted(store.nightShift))
                }
                Spacer()
                Text("→").font(Face.display(13)).foregroundStyle(Ink.post(store.nightShift))
            }
            .padding(.horizontal, 11).padding(.vertical, 9)
            .background(Ink.kraft2(store.nightShift))
            .overlay(Rectangle().strokeBorder(Ink.rule(store.nightShift), lineWidth: Metric.rule))
            .opacity(ready ? 1 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!ready)
    }

    private var ready: Bool {
        store.circle.count >= 4 && store.round.contains { $0.answeredAt == nil }
    }

    private func rel(_ d: Date) -> String {
        let h = Calendar.current.dateComponents([.hour], from: d, to: Date()).hour ?? 0
        return h < 24 ? "\(max(1, h))h" : "\(h / 24)d"
    }
}

/// The parcel. The only crush-red border in the app, and its dot is the only
/// other crush-red mark on this screen.
struct ParcelCard: View {
    @EnvironmentObject var store: Store
    let crush: CrushInboxRow

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 9) {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 5) {
                        Circle().fill(Ink.crush).frame(width: 5, height: 5)
                        Text("DELIVERED · DAY \(min(14, 15 - max(1, crush.daysRemaining)))")
                            .font(Face.mono(8, .semibold)).tracking(1.4)
                    }
                    .foregroundStyle(Ink.crush)
                    Text("Someone has a\ncrush on you")
                        .font(Face.display(16.5)).textCase(.uppercase)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(crush.daysRemaining) days until it's returned to sender.")
                        .font(Face.body(10.5)).foregroundStyle(Ink.ink2(store.nightShift))
                }
                Spacer(minLength: 0)
                PostageStamp(cancelled: true)
            }
            .padding(.horizontal, 11).padding(.top, 10).padding(.bottom, 8)

            VStack(alignment: .leading, spacing: 5) {
                TrackBar(remaining: crush.daysRemaining)
                HStack {
                    Text("\(crush.cluesUnlocked) OF 14 CANCELLED")
                    Spacer()
                    Text("TRACK IT →")
                }
                .font(Face.mono(7.5)).tracking(1)
                .foregroundStyle(Ink.muted(store.nightShift))
            }
            .padding(.horizontal, 11).padding(.bottom, 10)
        }
        .background(Ink.kraft2(store.nightShift))
        .overlay(Rectangle().strokeBorder(Ink.crush, lineWidth: Metric.rule))
    }
}

/// The sender's own crush — deliberately the quietest thing on screen. It must
/// never compete with the one they received.
struct SentStrip: View {
    @EnvironmentObject var store: Store
    let crush: CrushOutboxRow

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Kicker(text: "Your sent letter · to \(crush.recipientFirstName)")
            HStack(spacing: 2) {
                ForEach(0..<14, id: \.self) { i in
                    Rectangle()
                        .fill(i < crush.cluesUnlocked ? Ink.post(store.nightShift)
                                                      : Ink.rule(store.nightShift))
                        .frame(height: 5)
                }
            }
            // Anticipation with zero leak: it's the sender's own ladder, so
            // naming tomorrow's clue tells them nothing they don't know.
            if let label = crush.nextClueLabel {
                Text("Tomorrow they learn: \(label).")
                    .font(Face.body(10.5)).foregroundStyle(Ink.ink2(store.nightShift))
            }
            if crush.awaitingConsent {
                Text("THEY GUESSED YOU — YOUR CALL →")
                    .font(Face.mono(8, .bold)).tracking(1.2)
                    .foregroundStyle(Ink.crush)
            }
        }
        .padding(.horizontal, 11).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            .foregroundStyle(Ink.rule(store.nightShift)))
    }
}

// MARK: - Trail ("Tracking")

struct TrailView: View {
    @EnvironmentObject var store: Store
    let crushID: UUID
    @Binding var route: Route

    private var crush: CrushInboxRow? { store.inbox.first { $0.id == crushID } }
    private var clues: [ClueRowWire] { store.clues[crushID] ?? [] }

    var body: some View {
        PostmarkPage(showsStripe: false, masthead: false) {
            BackLine(title: "Delivered") { route = .home }
            if let crush {
                Text("Tracking").font(Face.display(21)).textCase(.uppercase)
                Text("“\(crush.messageText)”")
                    .font(Face.quote(11.5)).foregroundStyle(Ink.ink2(store.nightShift))
                TrackBar(remaining: crush.daysRemaining)
                HStack {
                    Text("\(crush.cluesUnlocked) OF 14 CANCELLED")
                    Spacer()
                    Text("\(crush.daysRemaining) DAYS LEFT")
                }
                .font(Face.mono(7.5)).tracking(1)
                .foregroundStyle(Ink.muted(store.nightShift))

                ForEach(clues) { clue in
                    ClueRowView(clue: clue,
                                isToday: clue.isUnlocked && clue.dayIndex == crush.cluesUnlocked)
                }

                PostmarkButton(
                    title: crush.guessUsedToday ? "Come back tomorrow" : "Name your sender",
                    kind: .quiet, enabled: !crush.guessUsedToday
                ) { route = .guess(crushID) }
                Kicker(text: "One guess a day · they're never told you tried")
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .task { await store.openCrush(crushID) }
    }
}

/// Locked clues are DATED, never blurred. Blur implies crackable content and
/// invites screenshot-and-enhance; a dated row tells the truth — the clue does
/// not exist yet — while still saying what KIND is coming, which is the more
/// suspenseful half. Note the text isn't merely hidden here: the server never
/// sent it.
struct ClueRowView: View {
    @EnvironmentObject var store: Store
    let clue: ClueRowWire
    let isToday: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text("№\(String(format: "%02d", clue.dayIndex))")
                .font(Face.mono(8.5, .bold))
                .foregroundStyle(Ink.muted(store.nightShift))
                .frame(width: 34, alignment: .leading)
            if let text = clue.hintText {
                Text(text).font(Face.body(11))
            } else {
                Text("DAY \(clue.dayIndex) · \(clue.kindLabel.uppercased())")
                    .font(Face.mono(8)).tracking(1.2)
                    .foregroundStyle(Ink.muted(store.nightShift))
            }
            Spacer(minLength: 0)
            if isToday {
                Text("JUST IN").font(Face.mono(7)).tracking(1.2)
                    .padding(.horizontal, 4).padding(.vertical, 1.5)
                    .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: 1.2))
            }
        }
        .padding(.vertical, isToday ? 8 : 6)
        .padding(.horizontal, isToday ? 9 : 0)
        .background(isToday ? Ink.kraft2(store.nightShift) : .clear)
        .overlay(alignment: .bottom) { if !isToday { HairRule() } }
        .overlay {
            if isToday {
                Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: Metric.rule)
            }
        }
    }
}
