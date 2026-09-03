import SwiftUI

struct WindowHeaderView: View {
    let deviceName: String
    let state: ConnectionState
    let persistWarning: Bool
    let transportText: String?

    var body: some View {
        HStack(alignment: .top, spacing: MoteSpacing.item) {
            VStack(alignment: .leading, spacing: MoteSpacing.micro) {
                Text(deviceName)
                    .font(MoteTypography.deviceName)
                    .foregroundStyle(.primary)
                    .textSelection(.enabled)
                Text("Mote Agent")
                    .font(MoteTypography.secondary)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .trailing, spacing: MoteSpacing.micro) {
                StatusView(state: state, persistWarning: persistWarning)
                if let transportText {
                    Text(transportText)
                        .font(MoteTypography.secondary)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        if let transportText {
            return "\(deviceName), Mote Agent, \(state.title), \(transportText)"
        }
        return "\(deviceName), Mote Agent, \(state.title)"
    }
}
