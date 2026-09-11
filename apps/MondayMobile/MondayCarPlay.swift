import CarPlay
import UIKit

final class MondayMobileDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        if connectingSceneSession.role == .carTemplateApplication {
            let configuration = UISceneConfiguration(name: "MONDAY CarPlay", sessionRole: connectingSceneSession.role)
            configuration.delegateClass = MondayCarPlaySceneDelegate.self
            return configuration
        }
        return UISceneConfiguration(name: "MONDAY iPhone", sessionRole: connectingSceneSession.role)
    }
}

final class MondayCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interfaceController: CPInterfaceController?

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController

        let context = CPListSection(items: [
            CPListItem(text: "Next commitment", detailText: "MONDAY will recover authorized calendar context"),
            CPListItem(text: "Weather & route", detailText: "Unavailable until approved capabilities are connected"),
            CPListItem(text: "Open loop", detailText: "Resume the thread from iPhone or Mac")
        ], header: "Drive brief", sectionIndexTitle: nil)

        let template = CPListTemplate(title: "MONDAY", sections: [context])
        template.tabImage = UIImage(systemName: "sparkles")
        interfaceController.setRootTemplate(template, animated: false, completion: nil)
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        self.interfaceController = nil
    }
}
