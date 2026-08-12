import SwiftUI

// MARK: - Shared chrome

/// Navy-only airmail stripe. Deliberately NOT red-and-blue: decoration must
/// never spend the crush color, or the reveal stops detonating.
struct AirmailStripe: View {
    @EnvironmentObject var store: Store
    var inverted = false
    var body: some View {
        GeometryReader { geo in
            Path { p in
                let w = geo.size.width, h = geo.size.height, step: CGFloat = 14
                var x: CGFloat = -h
                while x < w + h {
                    p.move(to: .init(x: x, y: h)); p.addLine(to: .init(x: x + h, y: 0))
                    p.addLine(to: .init(x: x + h + 7, y: 0)); p.addLine(to: .init(x: x + 7, y: h))
                    p.closeSubpath(); x += step
                }
            }
            .fill((inverted ? Ink.onInk(store.nightShift) : Ink.ink(store.nightShift)).opacity(0.5))
        }
        .frame(height: 9)
        .clipped()
        .accessibilityHidden(true)
    }
}

struct Masthead: View {
    @EnvironmentObject var store: Store
    var body: some View {
        VStack(spacing: 5) {
            Text("Fourteen.").font(Face.display(21)).textCase(.uppercase)
            HStack {
                Text(store.campusPostmark)
                Spacer()
                Text(DateFormatter.stampLine(Date()))
            }
            .font(Face.mono(7.5)).tracking(1.1)
            .foregroundStyle(Ink.muted(store.nightShift))
        }
        .foregroundStyle(Ink.ink(store.nightShift))
        .padding(.bottom, 6)
        .overlay(alignment: .bottom) {
            Rectangle().frame(height: Metric.rule)
                .foregroundStyle(Ink.ink(store.nightShift))
        }
    }
}

struct Kicker: View {
    @EnvironmentObject var store: Store
    let text: String
    var color: Color? = nil
    var body: some View {
        Text(text.uppercased())
            .font(Face.mono(8, .semibold)).tracking(1.6)
            .foregroundStyle(color ?? Ink.muted(store.nightShift))
    }
}

struct PostageStamp: View {
    @EnvironmentObject var store: Store
    var cancelled = false
    var body: some View {
        ZStack {
            VStack(spacing: 2) {
                Text("14¢").font(Face.display(15))
                Text("FOURTEEN").font(Face.mono(5.5)).tracking(0.8)
                    .foregroundStyle(Ink.muted(store.nightShift))
            }
            .frame(width: 52, height: 60)
            .background(Ink.kraft2(store.nightShift))
            .overlay(Rectangle().strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                .foregroundStyle(Ink.ink(store.nightShift)))
            if cancelled {
                VStack(spacing: 1) {
                    Text(store.campusCity ?? "FOURTEEN").font(Face.mono(5)).tracking(0.4)
                    Text(DateFormatter.stampLine(Date())).font(Face.mono(5))
                }
                .foregroundStyle(Ink.ink(store.nightShift))
                .frame(width: 44, height: 44)
                .overlay(Circle().strokeBorder(Ink.ink(store.nightShift), lineWidth: 1.2))
                .rotationEffect(.degrees(-14))
                .opacity(0.55)
            }
        }
        .rotationEffect(.degrees(2.5))
        .accessibilityHidden(true)
    }
}

/// THE TRACK — burns DOWN, never fills.
///
/// A bar that fills rewards completion. Here completion is expiry: the crush
/// disappearing. Same data, opposite emotion — and both sides watch the
/// identical bar shorten.
struct TrackBar: View {
    @EnvironmentObject var store: Store
    let remaining: Int
    var lit: Color? = nil
    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<14, id: \.self) { i in
                Rectangle()
                    .fill(i < remaining ? (lit ?? Ink.crush) : .clear)
                    .frame(height: 10)
                    .overlay(Rectangle().strokeBorder(
                        i < remaining ? (lit ?? Ink.crush) : Ink.rule(store.nightShift),
                        lineWidth: 1.2))
            }
        }
        .accessibilityElement()
        .accessibilityLabel("\(remaining) of 14 days remaining")
    }
}

struct PostmarkButton: View {
    @EnvironmentObject var store: Store
    enum Kind { case crush, post, quiet, plain }
    let title: String
    var kind: Kind = .plain
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title.uppercased())
                .font(Face.display(10.5)).tracking(0.6)
                .frame(maxWidth: .infinity, minHeight: Metric.tap)
                .foregroundStyle(fg)
                .background(bg)
                .overlay(Rectangle().strokeBorder(border, lineWidth: Metric.rule))
                .opacity(enabled ? 1 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    private var n: Bool { store.nightShift }
    private var fg: Color {
        switch kind {
        case .crush: return .white
        case .post:  return Ink.onInk(n)
        default:     return Ink.ink(n)
        }
    }
    private var bg: Color {
        switch kind {
        case .crush: return Ink.crush
        case .post:  return Ink.post(n)
        case .quiet: return .clear
        case .plain: return Ink.kraft2(n)
        }
    }
    private var border: Color {
        switch kind {
        case .crush: return Ink.crush
        case .post:  return Ink.post(n)
        default:     return Ink.ink(n)
        }
    }
}

struct PostmarkPage<Content: View>: View {
    @EnvironmentObject var store: Store
    var showsStripe = true
    var masthead = true
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            Ink.kraft(store.nightShift).ignoresSafeArea()
            VStack(spacing: 0) {
                if showsStripe { AirmailStripe().padding(.bottom, 8) }
                if masthead { Masthead().padding(.horizontal, Metric.gutter) }
                // The content is given the scroll view's own height as a
                // minimum, so a Spacer inside `content` actually expands.
                // Without this, ScrollView sizes to its content and every
                // Spacer silently collapses to its minLength — which is why
                // short screens pile up at the top with dead space below.
                GeometryReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) { content() }
                            .padding(.horizontal, Metric.gutter)
                            .padding(.top, 12)
                            .padding(.bottom, 90)
                            .frame(maxWidth: .infinity,
                                   minHeight: proxy.size.height,
                                   alignment: .top)
                    }
                    .scrollIndicators(.hidden)
                }
            }
        }
        .foregroundStyle(Ink.ink(store.nightShift))
    }
}

struct HairRule: View {
    @EnvironmentObject var store: Store
    var body: some View {
        Rectangle().frame(height: Metric.hair)
            .foregroundStyle(Ink.rule(store.nightShift))
    }
}

struct SectionHead: View {
    @EnvironmentObject var store: Store
    let title: String
    var body: some View {
        HStack(spacing: 8) {
            Text(title.uppercased()).font(Face.display(9.5)).tracking(1)
            Rectangle().frame(height: Metric.rule)
        }
        .foregroundStyle(Ink.ink(store.nightShift))
        .padding(.top, 4)
    }
}

struct BackLine: View {
    @EnvironmentObject var store: Store
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text("← \(title.uppercased())")
                .font(Face.mono(8)).tracking(1.5)
                .foregroundStyle(Ink.muted(store.nightShift))
                .frame(minHeight: Metric.tap, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

struct NotificationPreview: View {
    @EnvironmentObject var store: Store
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            ZStack { Ink.crush; Text("♥").foregroundStyle(.white).font(.system(size: 11)) }
                .frame(width: 26, height: 26)
                .overlay(Rectangle().strokeBorder(Ink.ink(store.nightShift), lineWidth: 1.2))
            Text("SOMEONE HAS A CRUSH ON YOU. CLUE 1 OF 14 IS WAITING.")
                .font(Face.mono(8, .bold)).lineSpacing(2)
            Spacer(minLength: 0)
        }
        .padding(9)
        .background(Ink.kraft2(store.nightShift))
        .overlay(Rectangle().strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            .foregroundStyle(Ink.rule(store.nightShift)))
    }
}

extension DateFormatter {
    static func stampLine(_ d: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "MMM d"
        return f.string(from: d).uppercased()
    }
}
