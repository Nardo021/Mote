import SwiftUI

struct StatusView: View {
    let state: ConnectionState
    var persistWarning: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: MoteSpacing.micro) {
            indicator
            Text(state.title)
                .font(MoteTypography.primary)
                .foregroundStyle(labelColor)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(state.title)
    }

    @ViewBuilder
    private var indicator: some View {
        if state.isActivelyConnecting && !reduceMotion {
            ProgressView()
                .controlSize(.small)
                .accessibilityHidden(true)
        } else {
            Image(systemName: symbolName)
                .font(.system(size: 8, weight: .semibold))
                .foregroundStyle(indicatorColor)
                .accessibilityHidden(true)
        }
    }

    private var symbolName: String {
        switch state {
        case .connected, .error:
            return "circle.fill"
        case .connecting, .authenticating, .reconnecting, .disconnected, .notConfigured:
            return "circle"
        }
    }

    private var indicatorColor: Color {
        state.statusTone(persistWarning: persistWarning).color
    }

    private var labelColor: Color {
        switch state {
        case .error:
            return MoteColors.error
        case .reconnecting where persistWarning:
            return MoteColors.warning
        case .notConfigured, .disconnected, .connecting, .authenticating, .connected, .reconnecting:
            return .primary
        }
    }
}

#Preview("Connected") {
    StatusView(state: .connected)
        .padding()
}
