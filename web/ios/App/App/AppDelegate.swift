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
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioSessionReset(_:)),
            name: AVAudioSession.mediaServicesWereResetNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    private func isBuiltInSpeaker(_ session: AVAudioSession = AVAudioSession.sharedInstance()) -> Bool {
        return session.currentRoute.outputs.contains { $0.portType == .builtInSpeaker }
    }

    private func hasExternalInput(_ session: AVAudioSession = AVAudioSession.sharedInstance()) -> Bool {
        return session.availableInputs?.contains { input in
            switch input.portType {
            case .builtInMic:
                return false
            default:
                return true
            }
        } ?? false
    }

    private func applyRoute(_ route: String) throws {
        let session = AVAudioSession.sharedInstance()
        // Voice calls must use the receiver/headset unless the user explicitly
        // presses the loudspeaker button. Never include defaultToSpeaker here.
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
        try session.setActive(true)

        if route == "speaker" {
            try session.overrideOutputAudioPort(.speaker)
            return
        }

        try session.overrideOutputAudioPort(.none)

        // If WebRTC inherited the ringtone/playback speaker route, nudge the
        // built-in microphone only when there is no external headset/input.
        // Always clear the preferred-input override immediately afterwards so
        // Bluetooth/wired devices remain free to become the active call route.
        if isBuiltInSpeaker(session), !hasExternalInput(session),
           let builtInMic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
            try? session.setPreferredInput(builtInMic)
            try session.overrideOutputAudioPort(.none)
            try? session.setPreferredInput(nil)
        } else {
            try? session.setPreferredInput(nil)
        }
    }

    private func reinforceReceiver(generation: Int) {
        // WKWebView/WebRTC may reconfigure AVAudioSession several seconds after
        // answering (remote track, ICE connection, audio unit startup). Keep the
        // receiver preference alive through that whole startup window. Any user
        // tap on the speaker button increments routeGeneration and cancels these.
        for delay in [0.08, 0.25, 0.7, 1.5, 3.0, 6.0, 12.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self = self,
                      self.routeGeneration == generation,
                      self.preferredRoute == "receiver" else { return }
                if self.isBuiltInSpeaker() {
                    try? self.applyRoute("receiver")
                }
            }
        }
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard preferredRoute == "receiver" else { return }
        let generation = routeGeneration
        // routeChangeNotification can arrive before currentRoute has settled, so
        // inspect it shortly afterwards rather than trusting the immediate value.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
            guard let self = self,
                  self.routeGeneration == generation,
                  self.preferredRoute == "receiver",
                  self.isBuiltInSpeaker() else { return }
            try? self.applyRoute("receiver")
        }
    }

    @objc private func handleAudioSessionReset(_ notification: Notification) {
        guard preferredRoute == "receiver" else { return }
        let generation = routeGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            guard let self = self,
                  self.routeGeneration == generation,
                  self.preferredRoute == "receiver" else { return }
            try? self.applyRoute("receiver")
            self.reinforceReceiver(generation: generation)
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
            try? session.setPreferredInput(nil)
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
