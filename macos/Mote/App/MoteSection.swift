import SwiftUI

struct MoteSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: MoteSpacing.tight) {
            Text(title)
                .font(MoteTypography.sectionHeading)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            VStack(alignment: .leading, spacing: 0) {
                content
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }
}

struct MoteRow<Value: View>: View {
    let label: String
    var alignment: VerticalAlignment = .center
    @ViewBuilder var value: Value

    var body: some View {
        HStack(alignment: alignment, spacing: MoteSpacing.related) {
            Text(label)
                .font(MoteTypography.primary)
                .foregroundStyle(.primary)
            Spacer(minLength: MoteSpacing.related)
            value
        }
        .padding(.vertical, MoteSpacing.tight)
        .accessibilityElement(children: .combine)
    }
}

struct MoteValueText: View {
    let text: String
    var monospaced: Bool = false
    var color: Color = .secondary

    var body: some View {
        Text(text)
            .font(monospaced ? MoteTypography.technical : MoteTypography.primary)
            .foregroundStyle(color)
            .multilineTextAlignment(.trailing)
            .textSelection(.enabled)
    }
}
