import Foundation

final class RecentCommandCache: @unchecked Sendable {
    private var orderedIDs: [String] = []
    private var knownIDs: Set<String> = []
    private let limit: Int
    private let lock = NSLock()

    init(limit: Int = 256) {
        self.limit = max(1, limit)
    }

    func contains(_ id: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return knownIDs.contains(id)
    }

    func record(_ id: String) {
        lock.lock()
        defer { lock.unlock() }
        if knownIDs.contains(id) {
            return
        }
        orderedIDs.append(id)
        knownIDs.insert(id)
        while orderedIDs.count > limit {
            let removed = orderedIDs.removeFirst()
            knownIDs.remove(removed)
        }
    }

    var count: Int {
        lock.lock()
        defer { lock.unlock() }
        return orderedIDs.count
    }
}
