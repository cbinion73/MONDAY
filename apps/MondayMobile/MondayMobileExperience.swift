import MONDAYCore
import SwiftUI

struct MobileMondayView: View {
    var body: some View {
        CodexDeckView()
    }
}

private struct MondayAmbientBackground: View {
    let intensity: Double
    @State private var drift = false

    var body: some View {
        ZStack {
            Color(red: 0.018, green: 0.022, blue: 0.045).ignoresSafeArea()
            Circle()
                .fill(MondayDesign.violet.opacity(0.20 * intensity))
                .frame(width: 620, height: 620)
                .blur(radius: 120)
                .offset(x: drift ? 280 : 110, y: drift ? -390 : -270)
            Circle()
                .fill(MondayDesign.blue.opacity(0.14 * intensity))
                .frame(width: 520, height: 520)
                .blur(radius: 130)
                .offset(x: drift ? -330 : -180, y: drift ? 470 : 330)
            LinearGradient(
                colors: [.clear, Color.black.opacity(0.24)],
                startPoint: .top,
                endPoint: .bottom
            ).ignoresSafeArea()
        }
        .animation(.easeInOut(duration: 8).repeatForever(autoreverses: true), value: drift)
        .onAppear { drift = true }
    }
}

private struct MondayPresenceHeader: View {
    @EnvironmentObject private var model: MobileMondayModel
    let isCompact: Bool

    var body: some View {
        HStack(spacing: 14) {
            HStack(spacing: 12) {
                MondayOrb(size: 28, active: model.isWorking || model.isListening)
                VStack(alignment: .leading, spacing: 1) {
                    Text("MONDAY")
                        .font(.system(size: 16, weight: .black, design: .rounded))
                        .tracking(2.5)
                    Text(isCompact ? "CONTINUOUS INTELLIGENCE" : "YOUR CONTINUOUS INTELLIGENCE")
                        .font(.system(size: 8, weight: .bold, design: .rounded))
                        .tracking(1.4)
                        .foregroundStyle(.secondary)
                }
                .fixedSize(horizontal: true, vertical: false)
            }
            .layoutPriority(2)
            Spacer()
            if isCompact {
                HStack(spacing: 8) {
                    commandCenterButton
                    knowledgeButton
                    connectionsButton
                    trustButton
                }
            } else {
                HStack(spacing: 10) {
                    privacyBadge
                    commandCenterButton
                    knowledgeButton
                    connectionsButton
                    trustButton
                }
            }
        }
        .padding(.horizontal, isCompact ? 16 : 24)
        .padding(.vertical, isCompact ? 10 : 14)
        .background(.black.opacity(0.08))
        .overlay(alignment: .bottom) { Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1) }
    }

    private var privacyBadge: some View {
        HStack(spacing: 7) {
            Circle().fill(MondayDesign.mint).frame(width: 6, height: 6)
            Text(model.workspace.settings.localOnly ? "PRIVATE · ON DEVICE" : "APPLE PCC ROUTE")
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .tracking(0.7)
        }
        .fixedSize()
        .foregroundStyle(model.workspace.settings.localOnly ? MondayDesign.mint : MondayDesign.violet)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
    }

    private var trustButton: some View {
        Button { model.showTrust = true } label: {
            Image(systemName: "person.badge.shield.checkmark.fill")
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 38, height: 38)
                .background(Color.white.opacity(0.07), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open Trust Center")
    }

    private var connectionsButton: some View {
        Button { model.showConnections = true } label: {
            Image(systemName: "point.3.connected.trianglepath.dotted")
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 38, height: 38)
                .background(Color.white.opacity(0.07), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open Connections")
    }

    private var knowledgeButton: some View {
        Button { model.showKnowledge = true } label: {
            Image(systemName: "books.vertical.fill")
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 38, height: 38)
                .background(Color.white.opacity(0.07), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open Monday Knowledge")
    }

    private var commandCenterButton: some View {
        Button { model.showCommandCenter = true } label: {
            Image(systemName: "rectangle.3.group.fill")
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 38, height: 38)
                .background(Color.white.opacity(0.07), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open Command Center")
    }
}

private struct MondayLivingThread: View {
    @EnvironmentObject private var model: MobileMondayModel
    let containerWidth: CGFloat?

    init(containerWidth: CGFloat? = nil) {
        self.containerWidth = containerWidth
    }

    private var activeLoops: [OpenLoop] {
        model.workspace.openLoops.filter { ![.completed, .abandoned].contains($0.status) }
    }

    private var pendingActions: [ActionProposal] {
        model.workspace.actions.filter { $0.status == .proposed }
    }

    private var sessionMessages: [ConversationMessage] {
        Array(model.workspace.messages.dropFirst(min(model.sessionStartMessageCount, model.workspace.messages.count)))
    }

    var body: some View {
        let compact = (containerWidth ?? 1_000) < 600
        let horizontalPadding: CGFloat = compact ? 16 : 26
        let contentWidth = containerWidth.map { min(820, max(1, $0 - (horizontalPadding * 2))) }

        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 18) {
                    MondayExecutiveRead(activeLoops: activeLoops, pendingActions: pendingActions, isCompact: compact)
                    ForEach(sessionMessages) { message in
                        MobileMessageView(message: message).id(message.id)
                    }
                    ForEach(pendingActions) { action in
                        MobileApprovalCard(action: action).id(action.id)
                    }
                    if model.isWorking {
                        MondayThinkingRow()
                    }
                }
                .frame(width: contentWidth, alignment: .leading)
                .padding(.horizontal, horizontalPadding)
                .padding(.top, compact ? 18 : 24)
                .padding(.bottom, 132)
            }
            .onChange(of: model.workspace.messages.count) {
                if let id = model.workspace.messages.last?.id {
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.86)) {
                        proxy.scrollTo(id, anchor: .bottom)
                    }
                }
            }
            .safeAreaInset(edge: .bottom) { MondayCommandBar(isCompact: compact) }
        }
    }
}

private struct MondayExecutiveRead: View {
    @EnvironmentObject private var model: MobileMondayModel
    let activeLoops: [OpenLoop]
    let pendingActions: [ActionProposal]
    let isCompact: Bool

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        if hour < 12 { return "Good morning, Chris." }
        if hour < 18 { return "Good afternoon, Chris." }
        return "Good evening, Chris."
    }

    private var read: String {
        if let action = pendingActions.first {
            return "One decision is waiting: \(action.title.lowercased()). I have not acted."
        }
        if let loop = activeLoops.first {
            return "The thread I would protect is \(loop.title.lowercased())."
        }
        return "Nothing urgent is claiming your attention. We can choose what matters next."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 8) {
                Text(greeting)
                    .font(.system(size: model.surface == .iPad ? 42 : 34, weight: .medium, design: .rounded))
                    .tracking(-1.1)
                Text(read)
                    .font(.system(size: model.surface == .iPad ? 19 : 16, weight: .regular, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineSpacing(4)
                if model.sessionStartMessageCount > 0 {
                    Label("Previous thread preserved · \(model.sessionStartMessageCount) messages", systemImage: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundStyle(.tertiary)
                }
            }

            if isCompact {
                VStack(spacing: 10) {
                    HStack(spacing: 10) {
                        openLoopsTile
                        decisionsTile
                    }
                    trustTile
                }
            } else {
                HStack(spacing: 12) {
                    openLoopsTile
                    decisionsTile
                    trustTile
                }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    MondayMove(title: "Assemble my day", icon: "sun.horizon.fill") {
                        Task { await model.send("Review my calendar today and tell me what deserves my attention.") }
                    }
                    MondayMove(title: "Protect deep work", icon: "moon.stars.fill") {
                        Task { await model.send("Find and protect a focus hour on my calendar today.") }
                    }
                    MondayMove(title: "Review reminders", icon: "checklist") {
                        Task { await model.send("What reminders are still open?") }
                    }
                    MondayMove(title: "Think with me", icon: "sparkles") {
                        Task { await model.send("Help me decide what would make today feel meaningfully successful.") }
                    }
                }
            }
        }
        .padding(.bottom, 4)
    }

    private var openLoopsTile: some View {
        MondayInsightTile(
            eyebrow: "OPEN LOOPS",
            value: "\(activeLoops.count)",
            detail: activeLoops.first?.title ?? "You are clear",
            color: MondayDesign.blue,
            icon: "point.3.connected.trianglepath.dotted"
        )
    }

    private var decisionsTile: some View {
        MondayInsightTile(
            eyebrow: "DECISIONS",
            value: "\(pendingActions.count)",
            detail: pendingActions.first?.title ?? "Nothing waiting",
            color: MondayDesign.amber,
            icon: "checkmark.circle.badge.questionmark"
        )
    }

    private var trustTile: some View {
        MondayInsightTile(
            eyebrow: "TRUST STATE",
            value: model.workspace.settings.localOnly ? "Local" : "PCC",
            detail: model.workspace.settings.actionsEnabled ? "Approval required" : "Do not act",
            color: MondayDesign.mint,
            icon: "lock.shield.fill"
        )
    }
}

private struct MondayInsightTile: View {
    let eyebrow: String
    let value: String
    let detail: String
    let color: Color
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: icon).foregroundStyle(color)
                Spacer()
                Text(value).font(.system(size: 23, weight: .semibold, design: .rounded))
            }
            Text(eyebrow)
                .font(.system(size: 8, weight: .black, design: .rounded))
                .tracking(1.4)
                .foregroundStyle(color)
            Text(detail)
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(15)
        .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(LinearGradient(colors: [color.opacity(0.45), Color.white.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 0.8)
        }
    }
}

private struct MondayMove: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.07), in: Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.11), lineWidth: 0.7))
        }
        .buttonStyle(.plain)
    }
}

private struct MondayThinkingRow: View {
    var body: some View {
        HStack(spacing: 12) {
            MondayOrb(size: 24)
            VStack(alignment: .leading, spacing: 3) {
                Text("MONDAY is assembling the answer")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                Text("Routing locally · preserving authority boundaries")
                    .font(.system(size: 9, design: .rounded)).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(14)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct MondayCommandBar: View {
    @EnvironmentObject private var model: MobileMondayModel
    let isCompact: Bool

    var body: some View {
        VStack(spacing: 8) {
            if model.isListening {
                HStack(spacing: 8) {
                    Image(systemName: "waveform").symbolEffect(.variableColor.iterative)
                    Text(model.draft.isEmpty ? "I’m listening…" : model.draft)
                        .lineLimit(1)
                    Spacer()
                    Text("Tap to stop").foregroundStyle(.secondary)
                }
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(MondayDesign.mint)
                .padding(.horizontal, 16)
            }

            HStack(alignment: .bottom, spacing: 12) {
                Button { model.toggleListening() } label: {
                    ZStack {
                        Circle().fill(model.isListening ? MondayDesign.rose : MondayDesign.violet)
                        Circle().stroke(.white.opacity(0.28), lineWidth: 1).padding(3)
                        Image(systemName: model.isListening ? "stop.fill" : "waveform")
                            .font(.system(size: 19, weight: .bold))
                    }
                    .frame(width: 48, height: 48)
                    .shadow(color: (model.isListening ? MondayDesign.rose : MondayDesign.violet).opacity(0.5), radius: 14)
                }
                .buttonStyle(.plain)

                TextField("Ask, decide, or carry something through…", text: $model.draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14, design: .rounded))
                    .lineLimit(1...4)
                    .submitLabel(.send)
                    .onSubmit { Task { await model.send() } }

                Button { Task { await model.send() } } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 15, weight: .black))
                        .frame(width: 36, height: 36)
                        .background(model.draft.isEmpty ? Color.white.opacity(0.08) : MondayDesign.mint, in: Circle())
                        .foregroundStyle(model.draft.isEmpty ? Color.secondary : MondayDesign.ink)
                }
                .buttonStyle(.plain)
                .disabled(model.draft.isEmpty || model.isWorking)
            }
            .padding(12)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 25, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 25, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 0.8))
            .shadow(color: .black.opacity(0.35), radius: 30, y: 12)
        }
        .frame(maxWidth: 820)
        .padding(.horizontal, isCompact ? 14 : 24)
        .padding(.bottom, isCompact ? 8 : 12)
    }
}

private struct MondayContextRail: View {
    @EnvironmentObject private var model: MobileMondayModel

    private var activeLoops: [OpenLoop] {
        model.workspace.openLoops.filter { ![.completed, .abandoned].contains($0.status) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("LIVE CONTEXT")
                        .font(.system(size: 9, weight: .black, design: .rounded)).tracking(1.7)
                        .foregroundStyle(MondayDesign.mint)
                    Text("What MONDAY is holding")
                        .font(.system(size: 20, weight: .semibold, design: .rounded))
                }

                MondayRailCard(title: "Continuity", icon: "arrow.trianglehead.2.clockwise.rotate.90", color: MondayDesign.blue) {
                    Text("Last active on \(model.workspace.lastSurface.displayName)")
                    Text("\(model.workspace.messages.count) messages · updated \(model.workspace.lastUpdated.formatted(date: .omitted, time: .shortened))")
                        .foregroundStyle(.secondary)
                }

                MondayRailCard(title: "Open loops", icon: "point.3.connected.trianglepath.dotted", color: MondayDesign.amber) {
                    if activeLoops.isEmpty {
                        Text("No unresolved threads.").foregroundStyle(.secondary)
                    } else {
                        ForEach(activeLoops.prefix(4)) { loop in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(loop.title).fontWeight(.semibold)
                                Text(loop.status.rawValue.replacingOccurrences(of: "awaitingApproval", with: "awaiting approval"))
                                    .font(.system(size: 9, weight: .bold)).foregroundStyle(MondayDesign.amber)
                            }
                        }
                    }
                }

                MondayRailCard(title: "Capability pulse", icon: "waveform.path.ecg", color: MondayDesign.mint) {
                    ForEach(model.capabilities) { capability in
                        HStack(spacing: 8) {
                            Circle()
                                .fill(capability.health == .available ? MondayDesign.mint : MondayDesign.amber)
                                .frame(width: 6, height: 6)
                            Text(capability.name).fontWeight(.medium)
                            Spacer()
                            Text(capability.health.rawValue).foregroundStyle(.secondary)
                        }
                    }
                }

                if let usage = model.workspace.modelUsage.last {
                    MondayRailCard(title: "Last intelligence route", icon: "apple.intelligence", color: MondayDesign.violet) {
                        Text(usage.model).fontWeight(.semibold)
                        Text("\(usage.route.displayName) · \(usage.invocationCount) invocation\(usage.invocationCount == 1 ? "" : "s")")
                            .foregroundStyle(.secondary)
                        Label(usage.personalContextLeftDevice ? "Apple PCC boundary" : "Context stayed on device", systemImage: usage.personalContextLeftDevice ? "icloud" : "lock.fill")
                            .foregroundStyle(usage.personalContextLeftDevice ? MondayDesign.violet : MondayDesign.mint)
                    }
                }

                Button { model.showTrust = true } label: {
                    HStack {
                        Image(systemName: "checkmark.shield.fill")
                        Text("Inspect trust, actions & model use")
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .padding(15)
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)

                Button { model.showConnections = true } label: {
                    HStack {
                        Image(systemName: "point.3.connected.trianglepath.dotted")
                        Text("Inspect specialist connections")
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .padding(15)
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
            }
            .padding(24)
        }
        .background(.black.opacity(0.12))
    }
}

private struct MondayRailCard<Content: View>: View {
    let title: String
    let icon: String
    let color: Color
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: icon)
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 9) { content }
                .font(.system(size: 10, design: .rounded))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 0.7))
    }
}
