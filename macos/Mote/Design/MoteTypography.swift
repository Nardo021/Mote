import SwiftUI

enum MoteTypography {
    static let windowHeading = Font.system(size: 20, weight: .semibold)
    static let deviceName = Font.system(size: 20, weight: .semibold)
    static let sectionHeading = Font.system(size: 11, weight: .semibold)
    static let primary = Font.system(size: 13)
    static let primaryMedium = Font.system(size: 13, weight: .medium)
    static let secondary = Font.system(size: 12)
    static let metadata = Font.system(size: 11)
    static let technical = Font.system(size: 12, design: .monospaced)
    static let technicalSmall = Font.system(size: 11, design: .monospaced)

    /// Extra leading for 20pt headings (~1.1).
    static let headingLineSpacing: CGFloat = 2
    /// Extra leading for 12pt wrapping copy (~1.5).
    static let wrappingLineSpacing: CGFloat = 6
    /// -0.02em at 20pt.
    static let deviceNameTracking: CGFloat = -0.4
    /// 0.05em at 11pt uppercase overlines.
    static let sectionTracking: CGFloat = 0.55
}
