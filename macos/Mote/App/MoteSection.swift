import SwiftUI

struct MoteSection<Content: View>: View {
    let title: String
    var footer: String? = nil
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: MoteSpacing.sectionTitleGap) {
            Text(title)
                .font(MoteTypography.sectionHeading)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, MoteSpacing.sectionTitleInset)
                .accessibilityAddTraits(.isHeader)
                .accessibilityHeading(.h2)
            MoteGroupSurface {
                content
            }
            if let footer, !footer.isEmpty {
                Text(footer)
                    .font(MoteTypography.metadata)
                    .foregroundStyle(.tertiary)
                    .lineSpacing(MoteTypography.wrappingLineSpacing)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                    .padding(.horizontal, MoteSpacing.sectionTitleInset)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}

struct MoteRow<Value: View>: View {
    let label: String
    var alignment: VerticalAlignment = .firstTextBaseline
    var interactive: Bool = false
    var hidesLabel: Bool = false
    @ViewBuilder var value: Value

    var body: some View {
        HStack(alignment: alignment, spacing: MoteSpacing.related) {
            Text(label)
                .font(MoteTypography.primary)
                .foregroundStyle(.primary)
                .lineLimit(2)
                .truncationMode(.tail)
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(1)
                .accessibilityHidden(hidesLabel)
            Spacer(minLength: MoteSpacing.related)
            value
        }
        .padding(.vertical, MoteSpacing.rowVertical)
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
            .lineLimit(2)
            .truncationMode(.tail)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
            .help(text)
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

struct MoteWrappingText: View {
    let text: String
    var color: Color = .secondary

    var body: some View {
        Text(text)
            .font(MoteTypography.secondary)
            .foregroundStyle(color)
            .lineSpacing(MoteTypography.wrappingLineSpacing)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
    }
}

struct MoteHelperBlock<Action: View>: View {
    let text: String
    @ViewBuilder var action: Action

    var body: some View {
        VStack(alignment: .leading, spacing: MoteSpacing.related) {
            MoteWrappingText(text: text)
            action
        }
        .padding(.top, MoteSpacing.tight)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}

struct DeviceNameField: View {
    @Binding var text: String
    @FocusState private var focused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TextField("MacBook Pro", text: $text)
            .textFieldStyle(.plain)
            .font(MoteTypography.primary)
            .multilineTextAlignment(.trailing)
            .foregroundStyle(focused ? Color.primary : Color.secondary)
            .focused($focused)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: focused)
            .accessibilityLabel("Name")
    }
}

struct RelayURLField: View {
    @Binding var text: String
    var accessibilityName: String = "Relay URL"
    @FocusState private var focused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TextField(RelayDefaults.productionBaseURLString, text: $text)
            .textFieldStyle(.plain)
            .font(MoteTypography.technical)
            .multilineTextAlignment(.trailing)
            .foregroundStyle(focused ? Color.primary : Color.secondary)
            .focused($focused)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .textContentType(.URL)
            .autocorrectionDisabled()
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: focused)
            .accessibilityLabel(accessibilityName)
    }
}

struct MoteTrailingAction<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        HStack {
            Spacer(minLength: 0)
            content
        }
        .padding(.vertical, MoteSpacing.tight)
    }
}
