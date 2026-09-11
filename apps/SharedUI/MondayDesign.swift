import SwiftUI

enum MondayDesign {
    static let ink = Color(red: 0.035, green: 0.045, blue: 0.075)
    static let panel = Color.white.opacity(0.055)
    static let line = Color.white.opacity(0.10)
    static let violet = Color(red: 0.57, green: 0.42, blue: 1.0)
    static let blue = Color(red: 0.20, green: 0.66, blue: 1.0)
    static let mint = Color(red: 0.28, green: 0.94, blue: 0.72)
    static let amber = Color(red: 1.0, green: 0.70, blue: 0.30)
    static let rose = Color(red: 1.0, green: 0.36, blue: 0.54)

    static let background = LinearGradient(
        colors: [
            Color(red: 0.025, green: 0.030, blue: 0.055),
            Color(red: 0.055, green: 0.035, blue: 0.095),
            Color(red: 0.025, green: 0.055, blue: 0.085)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

struct MondayOrb: View {
    var size: CGFloat = 54
    var active = true
    @State private var breathing = false

    var body: some View {
        ZStack {
            Circle()
                .fill(MondayDesign.violet.opacity(0.26))
                .frame(width: size * 1.45, height: size * 1.45)
                .blur(radius: size * 0.28)
                .scaleEffect(breathing && active ? 1.12 : 0.88)
            Circle()
                .fill(
                    AngularGradient(
                        colors: [MondayDesign.blue, MondayDesign.violet, MondayDesign.mint, MondayDesign.blue],
                        center: .center
                    )
                )
                .overlay {
                    Circle()
                        .fill(.white.opacity(0.28))
                        .blur(radius: size * 0.20)
                        .padding(size * 0.18)
                }
                .frame(width: size, height: size)
                .shadow(color: MondayDesign.violet.opacity(0.65), radius: size * 0.30)
        }
        .frame(width: size * 1.5, height: size * 1.5)
        .onAppear {
            withAnimation(.easeInOut(duration: 2.8).repeatForever(autoreverses: true)) {
                breathing = true
            }
        }
    }
}

struct StatusPill: View {
    let label: String
    let color: Color
    var icon: String? = nil

    var body: some View {
        HStack(spacing: 5) {
            if let icon { Image(systemName: icon).font(.system(size: 9, weight: .bold)) }
            Text(label.uppercased())
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .tracking(0.9)
        }
        .foregroundStyle(color)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(color.opacity(0.10), in: Capsule())
        .overlay(Capsule().stroke(color.opacity(0.28), lineWidth: 0.7))
    }
}

struct GlassCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(16)
            .background(MondayDesign.panel, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(MondayDesign.line, lineWidth: 0.7))
    }
}
