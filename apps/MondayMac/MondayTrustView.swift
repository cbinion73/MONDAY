import MONDAYCore
import SwiftUI

struct MondayTrustView: View {
    @EnvironmentObject private var model: MondayAppModel
    @Environment(\.dismiss) private var dismiss
    @State private var draft = TrustSettings()
    @State private var messagesContact = ""

    var body: some View {
        ZStack {
            MondayDesign.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Trust Center")
                                .font(.system(size: 29, weight: .semibold, design: .rounded))
                            Text("Access is not authority. Every dimension stays separate.")
                                .font(.system(size: 12, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Done") { dismiss() }
                            .buttonStyle(.bordered)
                    }

                    GlassCard {
                        VStack(alignment: .leading, spacing: 16) {
                            Label("Constitutional controls", systemImage: "checkmark.shield.fill")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                            TrustToggle(title: "Permissioned awareness", detail: "Allow approved sources to inform this conversation.", isOn: $draft.awarenessEnabled)
                            TrustToggle(title: "Action authority", detail: "Allow proposals. Consequential work still requires approval.", isOn: $draft.actionsEnabled)
                            TrustToggle(title: "Local-only mode", detail: "Keep intelligence and personal context on this device.", isOn: Binding(
                                get: { draft.localOnly },
                                set: { enabled in
                                    draft.localOnly = enabled
                                    if enabled { draft.cloudIntelligenceEnabled = false }
                                }
                            ))
                            TrustToggle(title: "Apple Intelligence", detail: "Use Apple’s on-device Foundation Model for conversation. It receives no action tools.", isOn: $draft.onDeviceIntelligenceEnabled)
                            TrustToggle(title: "Background intelligence", detail: "Currently off. No silent model or battery use.", isOn: $draft.backgroundIntelligenceEnabled)
                            TrustToggle(title: "Apple Private Cloud Compute", detail: "Use Apple’s stronger private cloud model for conversation. It receives no action tools.", isOn: Binding(
                                get: { draft.cloudIntelligenceEnabled && !draft.localOnly },
                                set: { enabled in
                                    draft.cloudIntelligenceEnabled = enabled
                                    if enabled { draft.localOnly = false }
                                }
                            ))
                        }
                    }

                    GlassCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("External intelligence", systemImage: "network.badge.shield.half.filled")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                            ExternalPolicyFact(title: "Approval", value: draft.externalModelPolicy.approvalMode == .everyRequest ? "Every call" : "Restricted")
                            ExternalPolicyFact(title: "Automatic budget", value: String(format: "$%.2f / month", Double(draft.externalModelPolicy.automaticMonthlyBudgetCents) / 100))
                            ExternalPolicyFact(title: "Automatic request classes", value: draft.externalModelPolicy.automaticRequestClasses.isEmpty ? "None" : "\(draft.externalModelPolicy.automaticRequestClasses.count)")
                            ExternalPolicyFact(title: "Pro / max modes", value: draft.externalModelPolicy.proAndMaxModesEnabled ? "On" : "Off")
                            Text("Any OpenAI fallback must disclose its model, purpose, context, token ceilings, and maximum estimated cost. One approval authorizes one matching request.")
                                .font(.system(size: 10, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                    }

                    GlassCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("Siri AI", systemImage: "apple.intelligence")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                            TrustToggle(title: "Allow Siri AI to use MONDAY", detail: "Expose governed MONDAY abilities and authorized context to Siri.", isOn: $draft.siriIntelligenceEnabled)
                            TrustToggle(title: "Publish Monday Knowledge", detail: "Make active knowledge notes semantically searchable through Spotlight and Siri.", isOn: $draft.siriKnowledgeIndexingEnabled)
                            ExternalPolicyFact(title: "Role", value: "MONDAY intelligence provider")
                            ExternalPolicyFact(title: "Published context", value: "Authorized Spotlight entities")
                            ExternalPolicyFact(title: "Background actions", value: "Read and capture only")
                            ExternalPolicyFact(title: "Consequential work", value: "Proposal only")
                            Text("Siri can recognize MONDAY-shaped requests without being named. It cannot bypass MONDAY approvals or execute consequential work.")
                                .font(.system(size: 10, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                    }

                    GlassCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("Monday Knowledge", systemImage: "books.vertical.fill")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                            ExternalPolicyFact(title: "Format", value: "Markdown + JSON")
                            ExternalPolicyFact(title: "Sync", value: "Apple iCloud Documents")
                            ExternalPolicyFact(title: "Vault context", value: "Reviewed selections only")
                            ExternalPolicyFact(title: "Canonical source", value: "Obsidian on Mac")
                            Text("Knowledge stays machine-readable. Note contents cannot cross to an external model without a separately disclosed, one-time approval.")
                                .font(.system(size: 10, design: .rounded))
                                .foregroundStyle(.secondary)
                            Text("Promoted vault context is read-only, provenance-linked, locally reasoned over, update-gated, and revocable.")
                                .font(.system(size: 10, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                    }

                    GlassCard {
                        VStack(alignment: .leading, spacing: 16) {
                            Label("Messages", systemImage: "message.fill")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                            TrustToggle(title: "Read MONDAY conversation", detail: "Observe new messages only in the one contact thread you configure. The bridge never scans your whole inbox.", isOn: $draft.messagesRead)
                            TrustToggle(title: "Reply in Messages", detail: "Reply to that contact as MONDAY. Turn this off to use Messages as a read-only attention channel.", isOn: Binding(
                                get: { draft.messagesAutoReply && draft.messagesRead },
                                set: { enabled in
                                    draft.messagesAutoReply = enabled
                                    if enabled { draft.messagesRead = true }
                                }
                            ))
                            TextField("Your iMessage address or phone number", text: $messagesContact)
                                .textFieldStyle(.roundedBorder)
                                .textContentType(.emailAddress)
                            HStack {
                                Button("Use this Messages contact") {
                                    Task {
                                        model.messagesContactHandle = messagesContact
                                        await model.configureMessagesContact()
                                    }
                                }
                                .buttonStyle(.bordered)
                                Text(model.messagesBridgeStatus)
                                    .font(.system(size: 10, design: .rounded))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            Text("Messages needs Full Disk Access to observe its local database and Automation permission to send. Approval replies are always single-use and auditable.")
                                .font(.system(size: 10, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                    }

                    GlassCard {
                        VStack(alignment: .leading, spacing: 16) {
                            Label("Apple Reminders", systemImage: "checklist")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                            TrustToggle(title: "Observe reminders", detail: "Read incomplete reminders only when a request needs them.", isOn: $draft.remindersRead)
                            TrustToggle(title: "Create approved reminders", detail: "Write only after a specific preview and one-time approval.", isOn: $draft.remindersWrite)
                        }
                    }

                    GlassCard {
                        VStack(alignment: .leading, spacing: 16) {
                            Label("Apple Calendar", systemImage: "calendar")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                            TrustToggle(title: "Observe schedule", detail: "Read events only when a request needs schedule context.", isOn: $draft.calendarRead)
                            TrustToggle(title: "Create approved events", detail: "Write only after a specific preview and one-time approval.", isOn: $draft.calendarWrite)
                        }
                    }

                    HStack(spacing: 12) {
                        Button("Save policy") {
                            Task {
                                await model.updateSettings(draft)
                                dismiss()
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(MondayDesign.violet)
                        .controlSize(.large)

                        Button("STOP EVERYTHING", role: .destructive) {
                            Task {
                                await model.stopEverything()
                                draft = model.workspace.settings
                            }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)

                        Spacer()
                        Text("Every change is auditable and reversible.")
                            .font(.system(size: 9, design: .rounded))
                            .foregroundStyle(.tertiary)
                    }
                }
                .padding(30)
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            draft = model.workspace.settings
            messagesContact = model.messagesContactHandle
        }
    }
}

private struct ExternalPolicyFact: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title).font(.system(size: 11, design: .rounded)).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(MondayDesign.mint)
        }
    }
}

private struct TrustToggle: View {
    let title: String
    let detail: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 12, weight: .semibold, design: .rounded))
                Text(detail).font(.system(size: 10, design: .rounded)).foregroundStyle(.secondary)
            }
        }
        .toggleStyle(.switch)
        .tint(MondayDesign.mint)
    }
}

struct MondayActivityView: View {
    @EnvironmentObject private var model: MondayAppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            MondayDesign.background.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Activity & proof")
                            .font(.system(size: 27, weight: .semibold, design: .rounded))
                        Text("What MONDAY observed, proposed, attempted, and verified.")
                            .font(.system(size: 11, design: .rounded))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Done") { dismiss() }.buttonStyle(.bordered)
                }
                .padding(28)

                Divider().overlay(MondayDesign.line)

                ScrollView {
                    LazyVStack(spacing: 0) {
                        if !model.workspace.modelUsage.isEmpty {
                            HStack {
                                Text("MODEL USAGE")
                                    .font(.system(size: 9, weight: .bold, design: .rounded))
                                    .tracking(1.5)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Text("No hidden usage")
                                    .font(.system(size: 9, design: .rounded))
                                    .foregroundStyle(MondayDesign.mint)
                            }
                            .padding(.horizontal, 28)
                            .padding(.top, 20)

                            ForEach(model.workspace.modelUsage.reversed()) { usage in
                                HStack(alignment: .top, spacing: 15) {
                                    ZStack {
                                        Circle().fill(MondayDesign.violet.opacity(0.14)).frame(width: 32, height: 32)
                                        Image(systemName: usage.route == .onDevice ? "apple.intelligence" : "icloud.and.arrow.up")
                                            .foregroundStyle(MondayDesign.violet)
                                    }
                                    VStack(alignment: .leading, spacing: 5) {
                                        HStack {
                                            Text(usage.model).font(.system(size: 13, weight: .semibold, design: .rounded))
                                            Spacer()
                                            Text(usage.timestamp.formatted(date: .abbreviated, time: .shortened))
                                                .font(.system(size: 9, design: .rounded)).foregroundStyle(.tertiary)
                                        }
                                        Text("\(usage.purpose) · \(usage.invocationCount) invocation\(usage.invocationCount == 1 ? "" : "s") · \(usage.inputCharacters) input / \(usage.outputCharacters) output characters")
                                            .font(.system(size: 11, design: .rounded)).foregroundStyle(.secondary)
                                        Text(usage.personalContextLeftDevice ? "Apple PCC boundary · no framework cost reported" : "Stayed on device · $0 reported cost")
                                            .font(.system(size: 9, design: .rounded))
                                            .foregroundStyle(usage.personalContextLeftDevice ? MondayDesign.violet : MondayDesign.mint)
                                    }
                                }
                                .padding(.horizontal, 28)
                                .padding(.vertical, 16)
                            }
                            Divider().overlay(MondayDesign.line)
                        }

                        ForEach(model.workspace.audit.reversed()) { record in
                            HStack(alignment: .top, spacing: 15) {
                                ZStack {
                                    Circle().fill(color(record).opacity(0.14)).frame(width: 32, height: 32)
                                    Image(systemName: icon(record)).foregroundStyle(color(record)).font(.system(size: 12, weight: .semibold))
                                }
                                VStack(alignment: .leading, spacing: 5) {
                                    HStack {
                                        Text(record.summary)
                                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                                        Spacer()
                                        Text(record.timestamp.formatted(date: .abbreviated, time: .shortened))
                                            .font(.system(size: 9, design: .rounded))
                                            .foregroundStyle(.tertiary)
                                    }
                                    Text(record.outcome)
                                        .font(.system(size: 11, design: .rounded))
                                        .foregroundStyle(.secondary)
                                    HStack(spacing: 7) {
                                        StatusPill(label: record.category, color: color(record))
                                        Text("via \(record.surface.displayName)")
                                            .font(.system(size: 9, design: .rounded))
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                            }
                            .padding(.horizontal, 28)
                            .padding(.vertical, 16)
                            Divider().overlay(MondayDesign.line).padding(.leading, 74)
                        }
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func color(_ record: AuditRecord) -> Color {
        switch record.category {
        case "approval": MondayDesign.amber
        case "action": record.outcome == "Verified" ? MondayDesign.mint : MondayDesign.blue
        case "policy": MondayDesign.rose
        default: MondayDesign.violet
        }
    }

    private func icon(_ record: AuditRecord) -> String {
        switch record.category {
        case "approval": "hand.raised.fill"
        case "action": "checkmark.seal.fill"
        case "policy": "checkmark.shield.fill"
        default: "bubble.left.and.bubble.right.fill"
        }
    }
}
