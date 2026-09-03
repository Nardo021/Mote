import SwiftUI

struct WindowHeaderView: View {
    let deviceName: String
    let state: ConnectionState
    let persistWarning: Bool
    let transportText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: MoteSpacing.micro) {
            Text(deviceName)
                .font(MoteTypography.deviceName)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .lineLimit(2)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityHeading(.h1)

            StatusView(state: state, persistWarning: persistWarning)

            if let transportText {
                Text(transportText)
                    .font(MoteTypography.secondary)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}
