import SwiftUI

struct UnconfiguredStateView: View {
    let onConfigure: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MoteSpacing.tight) {
            Text("Mote is not configured")
                .font(MoteTypography.deviceName)
            Text("Connect this Mac to Mote Relay to enable remote actions.")
                .font(MoteTypography.secondary)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Configure Mote", action: onConfigure)
                .buttonStyle(.borderedProminent)
                .tint(MoteColors.accent)
                .padding(.top, MoteSpacing.micro)
                .accessibilityHint("Copies the Device ID for Relay pairing.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, MoteSpacing.tight)
        .accessibilityElement(children: .contain)
    }
}
