import SwiftUI

enum Route: Equatable {
    case home, round, send, you
    case trail(UUID), guess(UUID), sent(UUID), reveal(UUID)
}

struct RootView: View {
    @EnvironmentObject var store: Store
    @State private var route: Route = .home
    @State private var booted = false

    var body: some View {
        Group {
            if !booted {
                ZStack {
                    Ink.kraft(store.nightShift).ignoresSafeArea()
                    VStack(spacing: 10) {
                        Text("Fourteen.").font(Face.display(24)).textCase(.uppercase)
                        ProgressView().tint(Ink.ink(store.nightShift))
                    }
                    .foregroundStyle(Ink.ink(store.nightShift))
                }
            } else if !store.isSignedIn || !store.isOnboarded {
                OnboardingFlow()
            } else {
                ZStack(alignment: .bottom) {
                    screen
                    if showsTabBar { TabBar(route: $route) }
                }
            }
        }
        .preferredColorScheme(store.nightShift ? .dark : .light)
        // Without this, every system-drawn control — text cursor, field
        // placeholder, toggle, selection — renders in iOS system blue, which
        // is the one colour that belongs to neither the ink nor the crush.
        .tint(Ink.post(store.nightShift))
        .task {
            await store.boot()
            booted = true
        }
        // A push tap deep-links to whatever it was about.
        .onReceive(NotificationCenter.default.publisher(for: .fourteenOpenCrush)) { note in
            guard let id = note.object as? UUID else { return }
            route = store.inbox.contains(where: { $0.id == id }) ? .trail(id) : .sent(id)
        }
        .onReceive(NotificationCenter.default.publisher(for: .fourteenOpenReveal)) { note in
            if let id = note.object as? UUID { route = .reveal(id) }
        }
    }

    @ViewBuilder private var screen: some View {
        switch route {
        case .home:           HomeView(route: $route)
        case .trail(let id):  TrailView(crushID: id, route: $route)
        case .guess(let id):  GuessView(crushID: id, route: $route)
        case .round:          RoundView(route: $route)
        case .send:           SendView(route: $route)
        case .sent(let id):   SentView(crushID: id, route: $route)
        case .reveal(let id): RevealView(crushID: id, route: $route)
        case .you:            YouView(route: $route)
        }
    }

    /// The reveal is chrome-free by design — it is the screenshot.
    private var showsTabBar: Bool {
        switch route {
        case .reveal, .guess, .round: return false
        default: return true
        }
    }
}

struct TabBar: View {
    @EnvironmentObject var store: Store
    @Binding var route: Route

    var body: some View {
        HStack {
            tab("Delivered", active: !isYou) { route = .home }
            Spacer()
            Button { route = .send } label: {
                Text("♥")
                    .font(.system(size: 16))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(store.postageAvailable ? Ink.crush : Ink.rule(store.nightShift))
                    .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: 1.5))
                    .rotationEffect(.degrees(-4))
            }
            .buttonStyle(.plain)
            .offset(y: -14)
            .accessibilityLabel(store.postageAvailable ? "Send a crush" : "No postage this week")
            Spacer()
            tab("You", active: isYou) { route = .you }
        }
        .padding(.horizontal, 34)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .background(
            Ink.kraft(store.nightShift)
                .overlay(alignment: .top) {
                    Rectangle().frame(height: Metric.rule)
                        .foregroundStyle(Ink.ink(store.nightShift))
                }
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private var isYou: Bool { if case .you = route { return true }; return false }

    private func tab(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title.uppercased())
                .font(Face.mono(7.5, .bold)).tracking(1.4)
                .foregroundStyle(active ? Ink.ink(store.nightShift) : Ink.muted(store.nightShift))
                .frame(minWidth: 60, minHeight: Metric.tap)
        }
        .buttonStyle(.plain)
    }
}
