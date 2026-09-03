import SwiftUI

enum MoteTypography {
    static let windowHeading = Font.system(size: 20, weight: .semibold)
    static let deviceName = Font.system(size: 20, weight: .semibold)
    static let sectionHeading = Font.system(size: 13, weight: .semibold)
    static let primary = Font.system(size: 13)
    static let primaryMedium = Font.system(size: 13, weight: .medium)
    static let secondary = Font.system(size: 12)
    static let metadata = Font.system(size: 11)
    static let technical = Font.system(size: 12, design: .monospaced)
    static let technicalSmall = Font.system(size: 11, design: .monospaced)
    static let wrappingLineSpacing: CGFloat = 5
}
