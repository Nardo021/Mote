import SwiftUI

struct MoteButtonChrome: ViewModifier {
    var prominent: Bool = false
    var isStatic: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled
    @GestureState private var pressed = false
    @State private var hovering = false

    func body(content: Content) -> some View {
        chrome(content)
            .opacity(isEnabled ? 1 : 0.4)
            .scaleEffect(scale)
            .animation(
                reduceMotion || isStatic ? nil : .easeOut(duration: 0.15),
                value: pressed
            )
            .onHover { hovering = $0 }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: hovering)
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
                    fillColor,
                    in: RoundedRectangle(cornerRadius: MoteSpacing.radiusSmall, style: .continuous)
                )
        } else {
            content
                .buttonStyle(.bordered)
        }
    }

    private var fillColor: Color {
        if hovering && isEnabled {
            return MoteColors.accentHover(for: colorScheme)
        }
        return MoteColors.accentFill(for: colorScheme)
    }

    private var scale: CGFloat {
        if isStatic || reduceMotion || !pressed || !isEnabled {
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

struct MoteTextAction: View {
    let title: String
    var hint: String? = nil
    var usesCancelShortcut: Bool = false
    let action: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(MoteTypography.primary)
                .foregroundStyle(labelColor)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .modifier(OptionalCancelShortcut(enabled: usesCancelShortcut))
        .padding(.vertical, MoteSpacing.tight)
        .onHover { hovering = $0 }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: hovering)
        .modifier(OptionalAccessibilityHint(hint: hint))
    }

    private var labelColor: Color {
        hovering
            ? MoteColors.accentHover(for: colorScheme)
            : MoteColors.accentFill(for: colorScheme)
    }
}

private struct OptionalCancelShortcut: ViewModifier {
    let enabled: Bool

    func body(content: Content) -> some View {
        if enabled {
            content.keyboardShortcut(.cancelAction)
        } else {
            content
        }
    }
}

private struct OptionalAccessibilityHint: ViewModifier {
    let hint: String?

    func body(content: Content) -> some View {
        if let hint, !hint.isEmpty {
            content.accessibilityHint(hint)
        } else {
            content
        }
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
            .font(MoteTypography.primaryMedium)
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
