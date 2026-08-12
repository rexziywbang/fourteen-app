import Foundation
import UIKit
import UserNotifications

extension Notification.Name {
    static let fourteenOpenCrush  = Notification.Name("fourteen.open.crush")
    static let fourteenOpenReveal = Notification.Name("fourteen.open.reveal")
}

/// Push permission is requested CONTEXTUALLY — after the first crush is sent
/// or the first round is finished — never on launch. Asking cold is how apps
/// get permanently denied, and this product is almost useless without a buzz
/// in a pocket.
@MainActor
final class PushManager: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = PushManager()
    private var onToken: ((String) -> Void)?

    func attach(_ handler: @escaping (String) -> Void) {
        onToken = handler
        UNUserNotificationCenter.current().delegate = self
    }

    var hasAsked: Bool {
        get { UserDefaults.standard.bool(forKey: "push.asked") }
        set { UserDefaults.standard.set(newValue, forKey: "push.asked") }
    }

    func requestIfNeeded() async {
        guard !hasAsked else { return }
        hasAsked = true
        let granted = (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted { UIApplication.shared.registerForRemoteNotifications() }
    }

    func didRegister(_ deviceToken: Data) {
        onToken?(deviceToken.map { String(format: "%02x", $0) }.joined())
    }

    // Foreground: still show it. Someone staring at the app when a crush lands
    // should see it land.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions { [.banner, .sound, .badge] }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        guard let kind = info["kind"] as? String,
              let raw = info["crush_id"] as? String,
              let id = UUID(uuidString: raw) else { return }
        let name: Notification.Name =
            ["mutual_reveal", "identity_revealed"].contains(kind)
            ? .fourteenOpenReveal : .fourteenOpenCrush
        await MainActor.run {
            UIApplication.shared.applicationIconBadgeNumber = 0
            NotificationCenter.default.post(name: name, object: id)
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
        Task { @MainActor in PushManager.shared.didRegister(token) }
    }
    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Non-fatal: the app degrades to in-app notifications only.
        print("APNs registration failed: \(error.localizedDescription)")
    }
}
