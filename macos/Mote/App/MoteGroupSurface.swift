import SwiftUI

struct MoteGroupSurface<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .padding(.horizontal, MoteSpacing.groupInset)
        .padding(.vertical, MoteSpacing.micro)
        .background(
            MoteColors.surface,
            in: RoundedRectangle(cornerRadius: MoteSpacing.radiusGroup, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: MoteSpacing.radiusGroup, style: .continuous)
                .strokeBorder(MoteColors.hairline(for: colorScheme), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
    }
}

struct MoteGroupDivider: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Rectangle()
            .fill(MoteColors.hairline(for: colorScheme))
            .frame(height: 1)
    }
}
