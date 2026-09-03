import SwiftUI

struct MoteInlineErrorView: View {
    let title: String
    var detail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: MoteSpacing.micro) {
            Text(title)
            if let detail, !detail.isEmpty {
                Text(detail)
            }
        }
        .font(MoteTypography.secondary)
        .foregroundStyle(MoteColors.error)
        .lineSpacing(MoteTypography.wrappingLineSpacing)
        .multilineTextAlignment(.leading)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, MoteSpacing.tight)
        .textSelection(.enabled)
        .accessibilityElement(children: .combine)
    }
}
