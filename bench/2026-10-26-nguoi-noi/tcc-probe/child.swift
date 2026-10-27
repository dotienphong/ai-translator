// Tiến trình con: ghi AXIsProcessTrusted và thử đọc thật danh sách cửa sổ của Finder qua Accessibility.
import AppKit
import ApplicationServices

let log = CommandLine.arguments[1]

func write(_ s: String) {
    let h = FileHandle(forWritingAtPath: log)!
    h.seekToEndOfFile()
    h.write("\(Date()) \(s)\n".data(using: .utf8)!)
    h.closeFile()
}

let trusted = AXIsProcessTrusted()
var result = "không thấy Finder"
if let finder = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder").first {
    let el = AXUIElementCreateApplication(finder.processIdentifier)
    var value: AnyObject?
    let r = AXUIElementCopyAttributeValue(el, kAXWindowsAttribute as CFString, &value)
    result = "đọc cửa sổ Finder: mã \(r.rawValue) (0 là được), \((value as? [AXUIElement])?.count ?? -1) cửa sổ"
}
write("con: AXIsProcessTrusted = \(trusted), \(result)")
