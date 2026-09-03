import SwiftUI

struct WindowHeaderView: View {
    let deviceName: String
    let state: ConnectionState
    let persistWarning: Bool
    let transportText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: MoteSpacing.tight) {
            Text(deviceName)
                .font(MoteTypography.deviceName)
                .tracking(MoteTypography.deviceNameTracking)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .lineLimit(2)
                .truncationMode(.tail)
                .lineSpacing(MoteTypography.headingLineSpacing)
                .fixedSize(horizontal: false, vertical: true)
                .help(deviceName)
                .accessibilityAddTraits(.isHeader)
                .accessibilityHeading(.h1)

            VStack(alignment: .leading, spacing: MoteSpacing.micro) {
                StatusView(state: state, persistWarning: persistWarning)
                if let transportText {
                    Text(transportText)
                        .font(MoteTypography.secondary)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .lineLimit(1)
                        .textSelection(.enabled)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}
