import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

@objc(AudioRoutePlugin)
public class AudioRoutePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioRoutePlugin"
    public let jsName = "AudioRoute"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise)
    ]

    private var preferredRoute: String?
    private var routeGeneration = 0

    public override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    private func applyRoute(_ route: String) throws {
        let session = AVAudioSession.sharedInstance()
        // Voice-chat + playAndRecord is the iPhone call profile. In particular we
        // never set defaultToSpeaker: loudspeaker is opt-in from the UI only.
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
        try session.setActive(true)
        try session.overrideOutputAudioPort(route == "speaker" ? .speaker : .none)
    }

    private func reinforceReceiver(generation: Int) {
        // WKWebView/WebRTC can reconfigure AVAudioSession just after the remote
        // track starts. Re-assert the receiver a few times, but cancel these
        // retries immediately if the user explicitly taps the speaker button.
        for delay in [0.12, 0.45, 1.1, 2.4] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self = self,
                      self.routeGeneration == generation,
                      self.preferredRoute == "receiver" else { return }
                try? self.applyRoute("receiver")
            }
        }
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard preferredRoute == "receiver" else { return }
        let session = AVAudioSession.sharedInstance()
        let unexpectedlyOnSpeaker = session.currentRoute.outputs.contains {
            $0.portType == .builtInSpeaker
        }
        guard unexpectedlyOnSpeaker else { return }
        let generation = routeGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { [weak self] in
            guard let self = self,
                  self.routeGeneration == generation,
                  self.preferredRoute == "receiver" else { return }
            try? self.applyRoute("receiver")
        }
    }

    @objc public func setRoute(_ call: CAPPluginCall) {
        let route = call.getString("route") == "speaker" ? "speaker" : "receiver"
        DispatchQueue.main.async {
            self.routeGeneration += 1
            let generation = self.routeGeneration
            self.preferredRoute = route
            do {
                try self.applyRoute(route)
                if route == "receiver" {
                    self.reinforceReceiver(generation: generation)
                }
                call.resolve(["route": route, "applied": true])
            } catch {
                call.reject("audio_route_failed", nil, error)
            }
        }
    }

    @objc public func reset(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.routeGeneration += 1
            self.preferredRoute = nil
            let session = AVAudioSession.sharedInstance()
            try? session.overrideOutputAudioPort(.none)
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        }
    }
}

@objc(LuminaBridgeViewController)
class LuminaBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioRoutePlugin())
    }
}
