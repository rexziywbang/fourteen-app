import SwiftUI

@main
struct FourteenApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = Store()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .task {
                    PushManager.shared.attach { token in
                        Task { await store.registerPush(token: token) }
                    }
                }
        }
    }
}
