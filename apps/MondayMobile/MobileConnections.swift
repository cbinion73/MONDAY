import MONDAYCore
import SwiftUI

enum MobileConnectionCatalog {
    static func discover(
        capabilities: [CapabilityDescriptor],
        settings: TrustSettings,
        saved: [SpecialistConnection]
    ) -> [SpecialistConnection] {
        let discovered = [
            appleConnection(
                id: "apple.calendar",
                displayName: "Apple Calendar",
                domain: "Calendar",
                icon: "calendar",
                summary: "Schedule awareness and approval-gated event creation through EventKit.",
                data: ["Calendar events", "Availability", "Event identifiers"],
                fallbackActions: ["Read today", "Find free time", "Create approved event"],
                capability: capabilities.first { $0.id == "apple.calendar" },
                policy: ConnectionPolicy(
                    observe: settings.calendarRead,
                    importData: settings.calendarRead,
                    recommend: settings.calendarRead,
                    actWithApproval: settings.calendarWrite
                )
            ),
            appleConnection(
                id: "apple.reminders",
                displayName: "Apple Reminders",
                domain: "Tasks",
                icon: "checklist",
                summary: "Reminder awareness and approval-gated reminder creation through EventKit.",
                data: ["Reminder titles", "Lists", "Completion state"],
                fallbackActions: ["Review reminders", "Create approved reminder"],
                capability: capabilities.first { $0.id == "apple.reminders" },
                policy: ConnectionPolicy(
                    observe: settings.remindersRead,
                    importData: settings.remindersRead,
                    recommend: settings.remindersRead,
                    actWithApproval: settings.remindersWrite
                )
            ),
            SpecialistConnection(
                manifest: SpecialistManifest(
                    id: "monday.siri-ai",
                    displayName: "Siri AI",
                    domain: "System intelligence",
                    bundleIdentifiers: ["com.chris.monday.iphone"],
                    summary: "Siri can semantically discover authorized MONDAY context and route natural-language requests into governed abilities.",
                    systemImage: "apple.intelligence",
                    transports: [.appIntent],
                    dataCategories: ["Authorized Spotlight entities", "User-supplied requests", "MONDAY responses", "Open-loop status"],
                    capabilities: ["Semantic MONDAY search", "Review priorities", "Assess capacity", "Capture knowledge", "Record commitment", "Find approvals"],
                    verificationMethod: "Compiled App Intents metadata, system search schema registration, Spotlight index refresh, and MONDAY audit records"
                ),
                state: .connected,
                statusDetail: "Siri AI provider contracts are compiled and Spotlight indexing refreshes with MONDAY continuity.",
                policy: ConnectionPolicy(observe: true, importData: true, recommend: true),
                lastVerifiedAt: .now
            ),
            adapterTarget(
                id: "nav",
                name: "NAV",
                domain: "Navigation",
                bundleID: "com.binion.nav",
                icon: "location.fill",
                summary: "Routes, destinations, trip state, and verified navigation handoff.",
                data: ["Saved places", "Routes", "ETA", "Active trip"],
                actions: ["Plan route", "Start approved route", "Return arrival state"],
                verification: "NAV returns the active route identifier and destination after launch"
            ),
            adapterTarget(
                id: "vitals",
                name: "VITALS",
                domain: "Health",
                bundleID: "com.binion.vitals",
                icon: "heart.text.clipboard.fill",
                summary: "Health observations and domain analysis remain owned by VITALS.",
                data: ["Authorized health summary", "Trends", "Source provenance"],
                actions: ["Request health summary", "Compare approved trends", "Open supporting record"],
                verification: "VITALS returns source identifiers, sample windows, and freshness"
            ),
            adapterTarget(
                id: "chronicle",
                name: "Chronicle",
                domain: "Personal history",
                bundleID: "com.binion.chronicle",
                icon: "books.vertical.fill",
                summary: "Timeline records and durable narrative context remain owned by Chronicle.",
                data: ["Timeline entries", "People", "Places", "Source links"],
                actions: ["Find entries", "Prepare capture", "Open source record"],
                verification: "Chronicle returns the canonical entry identifier and revision"
            )
        ]
        var reconciled = ConnectionRegistry.reconcile(saved: saved, discovered: discovered)
        if let index = reconciled.firstIndex(where: { $0.id == "apple.calendar" }) {
            if !settings.calendarRead {
                reconciled[index].policy.observe = false
                reconciled[index].policy.importData = false
                reconciled[index].policy.recommend = false
            }
            if !settings.calendarWrite { reconciled[index].policy.actWithApproval = false }
        }
        if let index = reconciled.firstIndex(where: { $0.id == "apple.reminders" }) {
            if !settings.remindersRead {
                reconciled[index].policy.observe = false
                reconciled[index].policy.importData = false
                reconciled[index].policy.recommend = false
            }
            if !settings.remindersWrite { reconciled[index].policy.actWithApproval = false }
        }
        return reconciled
    }

    private static func appleConnection(
        id: String,
        displayName: String,
        domain: String,
        icon: String,
        summary: String,
        data: [String],
        fallbackActions: [String],
        capability: CapabilityDescriptor?,
        policy: ConnectionPolicy
    ) -> SpecialistConnection {
        let state: ConnectionState
        switch capability?.health {
        case .available, .degraded: state = .connected
        case .needsPermission: state = .needsPermission
        case .unavailable, nil: state = .unavailable
        }
        let manifest = SpecialistManifest(
            id: id,
            displayName: displayName,
            domain: domain,
            bundleIdentifiers: [],
            summary: summary,
            systemImage: icon,
            transports: [.appleFramework],
            dataCategories: data,
            capabilities: capability?.actions ?? fallbackActions,
            verificationMethod: capability?.verificationMethod ?? "Read-after-write verification"
        )
        return SpecialistConnection(
            manifest: manifest,
            state: state,
            statusDetail: capability?.statusDetail ?? "The Apple capability is not registered.",
            policy: policy,
            lastVerifiedAt: state == .connected ? .now : nil
        )
    }

    private static func adapterTarget(
        id: String,
        name: String,
        domain: String,
        bundleID: String,
        icon: String,
        summary: String,
        data: [String],
        actions: [String],
        verification: String
    ) -> SpecialistConnection {
        SpecialistConnection(
            manifest: SpecialistManifest(
                id: id,
                displayName: name,
                domain: domain,
                bundleIdentifiers: [bundleID],
                summary: summary,
                systemImage: icon,
                transports: [.appGroupBridge, .appIntent, .universalLink],
                dataCategories: data,
                capabilities: actions,
                verificationMethod: verification
            ),
            state: .adapterRequired,
            statusDetail: "The app target is known, but it does not yet contain the MONDAY Bridge adapter. No data is accessible."
        )
    }
}

struct MobileConnectionsView: View {
    @EnvironmentObject private var model: MobileMondayModel
    @Environment(\.dismiss) private var dismiss

    private var live: [SpecialistConnection] {
        model.workspace.connections.filter { $0.state == .connected || $0.state == .needsPermission }
    }

    private var waiting: [SpecialistConnection] {
        model.workspace.connections.filter { $0.state == .adapterRequired || $0.state == .unavailable }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("One relationship. Explicit bridges.", systemImage: "point.3.connected.trianglepath.dotted")
                            .font(.headline)
                        Text("An installed app is not automatically trusted. MONDAY connects only through a declared transport, narrow permissions, and a verification method.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                }

                Section("Live connections") {
                    ForEach(live) { connection in
                        NavigationLink {
                            MobileConnectionDetail(connectionID: connection.id)
                        } label: {
                            ConnectionRow(connection: connection)
                        }
                    }
                }

                Section {
                    ForEach(waiting) { connection in
                        NavigationLink {
                            MobileConnectionDetail(connectionID: connection.id)
                        } label: {
                            ConnectionRow(connection: connection)
                        }
                    }
                } header: {
                    Text("Specialist apps")
                } footer: {
                    Text("NAV, VITALS, and Chronicle remain isolated until their own targets adopt the versioned MONDAY Bridge contract.")
                }

                Section("Bridge guarantees") {
                    Label("Observation never grants action authority", systemImage: "eye.trianglebadge.exclamationmark")
                    Label("Every action request requires an idempotency key", systemImage: "number.square")
                    Label("Consequential actions require approval", systemImage: "hand.raised.fill")
                    Label("Completion requires specialist read-back", systemImage: "checkmark.seal.fill")
                }
                .font(.subheadline)
            }
            .navigationTitle("Connections")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .refreshable { await model.refreshConnections() }
        }
    }
}

private struct ConnectionRow: View {
    let connection: SpecialistConnection

    var body: some View {
        HStack(spacing: 13) {
            Image(systemName: connection.manifest.systemImage)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(connectionColor(connection.state))
                .frame(width: 38, height: 38)
                .background(connectionColor(connection.state).opacity(0.12), in: RoundedRectangle(cornerRadius: 11))
            VStack(alignment: .leading, spacing: 3) {
                Text(connection.manifest.displayName).font(.headline)
                Text(connection.manifest.domain).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(connection.state.displayName)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(connectionColor(connection.state))
        }
        .padding(.vertical, 3)
    }
}

private struct MobileConnectionDetail: View {
    @EnvironmentObject private var model: MobileMondayModel
    let connectionID: String

    private var connection: SpecialistConnection? {
        model.workspace.connections.first { $0.id == connectionID }
    }

    var body: some View {
        Group {
            if let connection {
                Form {
                    Section {
                        HStack(spacing: 15) {
                            Image(systemName: connection.manifest.systemImage)
                                .font(.system(size: 25, weight: .semibold))
                                .foregroundStyle(connectionColor(connection.state))
                                .frame(width: 52, height: 52)
                                .background(connectionColor(connection.state).opacity(0.12), in: RoundedRectangle(cornerRadius: 15))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(connection.state.displayName).font(.headline)
                                Text(connection.statusDetail).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }

                    Section("Transport") {
                        ForEach(connection.manifest.transports, id: \.self) { transport in
                            Label(transport.displayName, systemImage: transportIcon(transport))
                        }
                        LabeledContent("Contract", value: "v\(connection.manifest.version)")
                    }

                    Section("Data this specialist owns") {
                        ForEach(connection.manifest.dataCategories, id: \.self) { item in
                            Label(item, systemImage: "circle.fill").labelStyle(.titleOnly)
                        }
                    }

                    Section("Declared capabilities") {
                        ForEach(connection.manifest.capabilities, id: \.self) { item in
                            Label(item, systemImage: "sparkle")
                        }
                    }

                    Section("Authority") {
                        Toggle("Observe authorized context", isOn: policyBinding(connection, \.observe))
                        Toggle("Import selected data", isOn: policyBinding(connection, \.importData))
                        Toggle("Use for recommendations", isOn: policyBinding(connection, \.recommend))
                        Toggle("Act after explicit approval", isOn: policyBinding(connection, \.actWithApproval))
                        Toggle("Background refresh", isOn: policyBinding(connection, \.backgroundRefresh))
                        Toggle("Cross-device synchronization", isOn: policyBinding(connection, \.crossDeviceSync))
                    }
                    .disabled(connection.state != .connected)

                    Section("Verification") {
                        Label(connection.manifest.verificationMethod, systemImage: "checkmark.seal")
                        if let verified = connection.lastVerifiedAt {
                            LabeledContent("Capability checked", value: verified.formatted(date: .abbreviated, time: .shortened))
                        }
                        if let transfer = connection.lastTransferAt {
                            LabeledContent("Last transfer", value: transfer.formatted(date: .abbreviated, time: .shortened))
                        } else {
                            LabeledContent("Last transfer", value: "None recorded")
                        }
                    }

                    if connection.manifest.transports.contains(.appGroupBridge) {
                        Section {
                            Button("Verify MONDAY Bridge") {
                                Task { await model.verifyConnection(connection.id) }
                            }
                        } footer: {
                            Text("MONDAY queues a versioned handshake. Open the specialist app so it can answer, then pull down to refresh Connections.")
                        }
                    }
                }
                .navigationTitle(connection.manifest.displayName)
            } else {
                ContentUnavailableView("Connection unavailable", systemImage: "bolt.horizontal.circle")
            }
        }
    }

    private func policyBinding(
        _ connection: SpecialistConnection,
        _ keyPath: WritableKeyPath<ConnectionPolicy, Bool>
    ) -> Binding<Bool> {
        Binding(
            get: { connection.policy[keyPath: keyPath] },
            set: { value in
                var policy = connection.policy
                policy[keyPath: keyPath] = value
                Task { await model.updateConnectionPolicy(connectionID, policy: policy) }
            }
        )
    }

    private func transportIcon(_ transport: ConnectionTransport) -> String {
        switch transport {
        case .appleFramework: "apple.logo"
        case .appGroupBridge: "arrow.left.arrow.right.square"
        case .appIntent: "wand.and.stars"
        case .shareExtension: "square.and.arrow.up"
        case .universalLink: "link"
        }
    }
}

private func connectionColor(_ state: ConnectionState) -> Color {
    switch state {
    case .connected: MondayDesign.mint
    case .needsPermission: MondayDesign.amber
    case .adapterRequired: MondayDesign.violet
    case .unavailable: MondayDesign.rose
    }
}
