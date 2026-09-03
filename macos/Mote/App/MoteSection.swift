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
                .tracking(0.8)
                .accessibilityAddTraits(.isHeader)
                .accessibilityHeading(.h2)
            MoteGroupSurface {
                content
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}

struct MoteRow<Value: View>: View {
    let label: String
    var alignment: VerticalAlignment = .center
    var interactive: Bool = false
    var hidesLabel: Bool = false
    @ViewBuilder var value: Value

    var body: some View {
        HStack(alignment: alignment, spacing: MoteSpacing.related) {
            Text(label)
                .font(MoteTypography.primary)
                .foregroundStyle(.primary)
                .accessibilityHidden(hidesLabel)
            Spacer(minLength: MoteSpacing.related)
            value
        }
        .padding(.vertical, MoteSpacing.tight)
        .accessibilityElement(children: interactive ? .contain : .combine)
    }
}

struct MoteValueText: View {
    let text: String
    var monospaced: Bool = false
    var monospacedDigit: Bool = false
    var color: Color = .secondary

    var body: some View {
        textView
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
    }

    @ViewBuilder
    private var textView: some View {
        let styled = Text(text)
            .font(monospaced ? MoteTypography.technical : MoteTypography.primary)
            .foregroundStyle(color)
            .multilineTextAlignment(.trailing)
        if monospacedDigit {
            styled.monospacedDigit()
        } else {
            styled
        }
    }
}
