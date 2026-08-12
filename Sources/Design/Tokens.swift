import SwiftUI

// MARK: - Postmark design tokens
//
// Built as PARCEL + TRACKING, not correspondence. Kraft is packaging.
//
// THE RESERVATION RULE — the single most important thing in this file:
// `Ink.crush` may appear on exactly four surfaces in the entire app:
//   1. the parcel border on Home
//   2. its status dot
//   3. the send button on Send
//   4. the hairline between two names on Reveal
// Decoration NEVER spends the crush color — that is why the airmail
// stripe is navy-only. If crush red starts showing up in chrome, the
// reveal stops detonating and the whole system collapses into noise.

enum Ink {

    // Global. Never varies by campus, never varies by theme.
    static let crush = Color(hex: 0xD5453C)

    // MARK: Day / Night
    // Night shift is not a separate design language — kraft and postal
    // navy trade places and everything else holds.

    static func kraft(_ n: Bool) -> Color   { n ? Color(hex: 0x201C17) : Color(hex: 0xE9DFC9) }
    static func kraft2(_ n: Bool) -> Color  { n ? Color(hex: 0x2A251E) : Color(hex: 0xF3EBDA) }
    static func ink(_ n: Bool) -> Color     { n ? Color(hex: 0xF0E9DA) : Color(hex: 0x1E2A3D) }
    static func ink2(_ n: Bool) -> Color    { n ? Color(hex: 0xC3BBAA) : Color(hex: 0x53607A) }
    static func muted(_ n: Bool) -> Color   { n ? Color(hex: 0x8B8577) : Color(hex: 0x8A8270) }
    static func rule(_ n: Bool) -> Color    { n ? Color(hex: 0x453E33) : Color(hex: 0xC9BCA1) }
    static func post(_ n: Bool) -> Color    { n ? Color(hex: 0x7E9BC9) : Color(hex: 0x3C5C93) }
    static func onInk(_ n: Bool) -> Color   { n ? Color(hex: 0x201C17) : Color(hex: 0xF2ECDD) }
}

// MARK: - Type

enum Face {
    /// Heavy grotesque for headlines and the wordmark.
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .black, design: .default)
    }
    /// Monospace for kickers, postmarks, tracking numbers.
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
    /// Serif italic for the crush lines and compliments — the only warm voice.
    static func quote(_ size: CGFloat) -> Font {
        .system(size: size, weight: .regular, design: .serif).italic()
    }
    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }
}

// MARK: - Metrics

enum Metric {
    static let hair: CGFloat = 1
    static let rule: CGFloat = 1.5
    static let heavy: CGFloat = 2
    static let gutter: CGFloat = 16
    static let tap: CGFloat = 44          // never smaller
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >>  8) & 0xFF) / 255,
            blue:  Double( hex        & 0xFF) / 255,
            opacity: 1
        )
    }
}
