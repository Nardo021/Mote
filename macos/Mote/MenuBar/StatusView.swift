import SwiftUI

struct StatusView: View {
    let state: ConnectionState
    var persistWarning: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: MoteSpacing.micro) {
            indicator
                .frame(width: 14, height: 14)
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
                .controlSize(.mini)
                .accessibilityHidden(true)
        } else {
            Image(systemName: symbolName)
                .font(.system(size: 8, weight: .semibold))
                .foregroundStyle(indicatorColor)
                .offset(y: 0.5)
                .accessibilityHidden(true)
        }
    }

    private var symbolName: String {
        switch state {
        case .connected, .error, .disabled:
            return "circle.fill"
        case .connecting, .authenticating, .reconnecting, .pairing, .disconnected, .notConfigured:
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
        case .disabled:
            return MoteColors.warning
        case .reconnecting where persistWarning:
            return MoteColors.warning
        case .notConfigured, .pairing, .disconnected, .connecting, .authenticating, .connected, .reconnecting:
            return .primary
        }
    }
}

#Preview("Connected") {
    StatusView(state: .connected)
        .padding()
}
