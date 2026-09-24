import SwiftUI

struct WindowHeaderView: View {
    let deviceName: String
    let state: ConnectionState
    let persistWarning: Bool
    let transportText: String?

    var body: some View {
        HStack(alignment: .top, spacing: MoteSpacing.related) {
            Text(deviceName)
                .font(MoteTypography.deviceName)
                .tracking(MoteTypography.deviceNameTracking)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .lineLimit(2)
                .truncationMode(.tail)
                .lineSpacing(MoteTypography.headingLineSpacing)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .help(deviceName)
                .accessibilityAddTraits(.isHeader)
                .accessibilityHeading(.h1)

            VStack(alignment: .trailing, spacing: MoteSpacing.micro) {
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
            .layoutPriority(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}
