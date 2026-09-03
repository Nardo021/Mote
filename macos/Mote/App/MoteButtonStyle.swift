import SwiftUI

struct MoteButtonChrome: ViewModifier {
    var prominent: Bool = false
    var isStatic: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @GestureState private var pressed = false

    func body(content: Content) -> some View {
        chrome(content)
            .scaleEffect(scale)
            .animation(
                reduceMotion || isStatic ? nil : .easeOut(duration: 0.15),
                value: pressed
            )
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .updating($pressed) { _, state, _ in
                        state = true
                    }
            )
    }

    @ViewBuilder
    private func chrome(_ content: Content) -> some View {
        if prominent {
            content
                .buttonStyle(.plain)
                .font(MoteTypography.primaryMedium)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .foregroundStyle(.white)
                .background(
                    MoteColors.accentFill(for: colorScheme),
                    in: RoundedRectangle(cornerRadius: MoteSpacing.radiusSmall, style: .continuous)
                )
        } else {
            content
                .buttonStyle(.bordered)
        }
    }

    private var scale: CGFloat {
        if isStatic || reduceMotion || !pressed {
            return 1
        }
        return 0.96
    }
}

extension View {
    func moteButtonStyle(prominent: Bool = false, isStatic: Bool = false) -> some View {
        modifier(MoteButtonChrome(prominent: prominent, isStatic: isStatic))
    }
}

struct CopyDeviceIDButton: View {
    let action: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var copied = false
    @State private var hovering = false

    var body: some View {
        Button(action: copy) {
            ZStack {
                icon("checkmark.fill", visible: copied)
                icon("doc.on.doc", visible: !copied)
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(iconColor)
            .frame(width: 24, height: 24)
            .contentShape(Rectangle())
            .padding(.vertical, -6)
            .animation(iconAnimation, value: copied)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: hovering)
        }
        .buttonStyle(.borderless)
        .help("Copy Device ID")
        .onHover { hovering = $0 }
        .accessibilityLabel(copied ? "Device ID copied" : "Copy Device ID")
    }

    private var iconColor: Color {
        if copied {
            return MoteColors.success
        }
        return hovering ? Color.primary : Color.secondary
    }

    private var iconAnimation: Animation? {
        reduceMotion ? nil : .timingCurve(0.2, 0, 0, 1, duration: 0.3)
    }

    private func copy() {
        action()
        AccessibilityNotification.Announcement("Device ID copied").post()
        copied = true
        Task {
            try? await Task.sleep(for: .seconds(1.6))
            copied = false
        }
    }

    private func icon(_ name: String, visible: Bool) -> some View {
        Image(systemName: name)
            .accessibilityHidden(true)
            .opacity(visible ? 1 : 0)
            .scaleEffect(reduceMotion ? 1 : (visible ? 1 : 0.25))
            .blur(radius: reduceMotion ? 0 : (visible ? 0 : 4))
    }
}
