// axtrace: đọc cây Accessibility của app họp để tìm tên người tham dự và dấu "đang nói".
//
//   axtrace trust                         in ra quyền Accessibility của tiến trình này
//   axtrace dump  <bundle-id> [out.json]  chụp cả cây (giới hạn độ sâu/số nút) của mọi cửa sổ
//   axtrace watch <bundle-id> <out.jsonl> [giây]  mỗi nhịp ghi các chuỗi văn bản của mọi nút; chỉ ghi khi đổi
//
// Chỉ đọc, không bấm, không ghi gì vào app họp. Với Chrome/Teams (Chromium/WebView) đặt AXManualAccessibility = true
// để trình duyệt dựng cây trợ năng cho nội dung web (như khi có trình đọc màn hình).

import ApplicationServices
import AppKit
import Foundation

let maxDepth = 60
let maxNodes = 40_000

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
    var v: AnyObject?
    let r = AXUIElementCopyAttributeValue(el, name as CFString, &v)
    return r == .success ? v : nil
}

func str(_ el: AXUIElement, _ name: String) -> String? {
    guard let v = attr(el, name) else { return nil }
    if let s = v as? String { return s.isEmpty ? nil : String(s.prefix(300)) }
    if let n = v as? NSNumber { return n.stringValue }
    return nil
}

func children(_ el: AXUIElement) -> [AXUIElement] {
    for name in ["AXChildren"] {
        if let arr = attr(el, name) as? [AXUIElement] { return arr }
    }
    return []
}

struct Node: Codable {
    var d: Int
    var role: String?
    var sub: String?
    var title: String?
    var desc: String?
    var value: String?
    var ident: String?
    var help: String?
    var dom: String?  // AXDOMIdentifier (Chromium)
    var cls: String?  // AXDOMClassList (Chromium), nối bằng dấu cách
}

func walk(_ root: AXUIElement) -> [Node] {
    var out: [Node] = []
    var seen = Set<UInt>()
    var stack: [(AXUIElement, Int)] = [(root, 0)]
    while let (el, d) = stack.popLast() {
        if out.count >= maxNodes { break }
        let h = UInt(CFHash(el))
        if seen.contains(h) { continue }
        seen.insert(h)
        var n = Node(d: d)
        n.role = str(el, "AXRole")
        n.sub = str(el, "AXSubrole")
        n.title = str(el, "AXTitle")
        n.desc = str(el, "AXDescription")
        n.value = str(el, "AXValue")
        n.ident = str(el, "AXIdentifier")
        n.help = str(el, "AXHelp")
        n.dom = str(el, "AXDOMIdentifier")
        if let cl = attr(el, "AXDOMClassList") as? [String] { n.cls = cl.joined(separator: " ") }
        out.append(n)
        if d < maxDepth {
            for c in children(el).reversed() { stack.append((c, d + 1)) }
        }
    }
    return out
}

func appElement(_ bundle: String) -> (AXUIElement, pid_t)? {
    // AXTRACE_PID: chọn đúng tiến trình khi có nhiều bản cùng bundle id (Chrome của người dùng và Chrome tự động).
    var pid: pid_t
    if let p = ProcessInfo.processInfo.environment["AXTRACE_PID"], let v = Int32(p) {
        pid = v
    } else {
        guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first else { return nil }
        pid = app.processIdentifier
    }
    let el = AXUIElementCreateApplication(pid)
    // Chromium chỉ dựng cây web khi có công nghệ trợ năng hỏi tới.
    AXUIElementSetAttributeValue(el, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    if ProcessInfo.processInfo.environment["AXTRACE_EUI"] == "1" {
        AXUIElementSetAttributeValue(el, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
    }
    return (el, pid)
}

// AXTRACE_WIN=<regex>: chỉ đọc các cửa sổ có tiêu đề khớp (ví dụ chỉ cửa sổ Meet của Chrome, không đọc tab khác).
let winFilter: NSRegularExpression? = ProcessInfo.processInfo.environment["AXTRACE_WIN"].map {
    try! NSRegularExpression(pattern: $0, options: [.caseInsensitive])
}

func windows(_ app: AXUIElement) -> [AXUIElement] {
    let all = (attr(app, "AXWindows") as? [AXUIElement]) ?? []
    guard let re = winFilter else { return all }
    return all.filter { w in
        let t = str(w, "AXTitle") ?? ""
        return re.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)) != nil
    }
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    print("cách dùng: axtrace trust | dump <bundle> [out] | watch <bundle> <out.jsonl> [giây]")
    exit(2)
}
switch args[1] {
case "noaccess":
    // Tắt lại AXManualAccessibility (trả Chrome về như cũ sau khi đo)
    let pid = Int32(ProcessInfo.processInfo.environment["AXTRACE_PID"] ?? "") ?? NSRunningApplication.runningApplications(withBundleIdentifier: args[2]).first!.processIdentifier
    let el = AXUIElementCreateApplication(pid)
    print(AXUIElementSetAttributeValue(el, "AXManualAccessibility" as CFString, kCFBooleanFalse).rawValue,
          AXUIElementSetAttributeValue(el, "AXEnhancedUserInterface" as CFString, kCFBooleanFalse).rawValue)
case "closewin":
    // Bấm nút đóng của các cửa sổ khớp AXTRACE_WIN (bắt buộc đặt bộ lọc để không đóng nhầm)
    guard winFilter != nil, let (app, _) = appElement(args[2]) else { print("cần AXTRACE_WIN"); exit(1) }
    for w in windows(app) {
        if let b = attr(w, "AXCloseButton") {
            print(str(w, "AXTitle") ?? "?", "→", AXUIElementPerformAction(b as! AXUIElement, "AXPress" as CFString).rawValue)
        }
    }
case "trust":
    print("AXIsProcessTrusted =", AXIsProcessTrusted())
case "dump":
    guard let (app, pid) = appElement(args[2]) else { print("app không chạy"); exit(1) }
    Thread.sleep(forTimeInterval: 1.0)  // cho Chromium kịp dựng cây sau khi bật AXManualAccessibility
    var all: [String: [Node]] = [:]
    for (i, w) in windows(app).enumerated() {
        let t = str(w, "AXTitle") ?? "?"
        all["\(i): \(t)"] = walk(w)
    }
    let data = try! JSONEncoder().encode(all)
    if args.count >= 4 {
        try! data.write(to: URL(fileURLWithPath: args[3]))
        print("pid \(pid): \(all.count) cửa sổ, \(all.values.map { $0.count }.reduce(0, +)) nút → \(args[3])")
    } else {
        print(String(data: data, encoding: .utf8)!)
    }
case "watch":
    guard let (app, _) = appElement(args[2]) else { print("app không chạy"); exit(1) }
    let out = args[3]
    let interval = args.count >= 5 ? Double(args[4])! : 0.5
    FileManager.default.createFile(atPath: out, contents: nil)
    let fh = FileHandle(forWritingAtPath: out)!
    var last: [String] = []
    signal(SIGINT) { _ in exit(0) }
    while true {
        let t0 = Date()
        var texts: [String] = []
        for w in windows(app) {
            for n in walk(w) {
                let parts = [n.role, n.sub, n.title, n.desc, n.value, n.ident, n.help, n.dom, n.cls].map { $0 ?? "" }
                if parts[2...].contains(where: { !$0.isEmpty }) {
                    texts.append("\(n.d)|" + parts.joined(separator: "|"))
                }
            }
        }
        let ms = Date().timeIntervalSince(t0) * 1000
        if texts != last {
            let rec: [String: Any] = ["t": t0.timeIntervalSince1970, "walk_ms": ms, "n": texts.count, "texts": texts]
            fh.write(try! JSONSerialization.data(withJSONObject: rec))
            fh.write("\n".data(using: .utf8)!)
            last = texts
        }
        let dt = interval - Date().timeIntervalSince(t0)
        if dt > 0 { Thread.sleep(forTimeInterval: dt) }
    }
case "find", "press", "setvalue":
    // find <bundle> <regex>: liệt kê nút có title/desc/value khớp (kèm khung); press <bundle> <regex> [thứ tự]: AXPress nút khớp
    guard let (app, _) = appElement(args[2]) else { print("app không chạy"); exit(1) }
    Thread.sleep(forTimeInterval: 0.5)
    let re = try! NSRegularExpression(pattern: args[3], options: [.caseInsensitive])
    var hits: [AXUIElement] = []
    for w in windows(app) {
        var stack: [(AXUIElement, Int)] = [(w, 0)]
        var count = 0
        var seenF = Set<UInt>()
        while let (el, d) = stack.popLast(), count < maxNodes {
            count += 1
            let hh = UInt(CFHash(el))
            if seenF.contains(hh) { continue }
            seenF.insert(hh)
            let texts = ["AXTitle", "AXDescription", "AXValue", "AXHelp", "AXIdentifier"].compactMap { str(el, $0) }
            if texts.contains(where: { re.firstMatch(in: $0, range: NSRange($0.startIndex..., in: $0)) != nil }) {
                hits.append(el)
                var pos = CGPoint.zero, size = CGSize.zero
                if let pv = attr(el, "AXPosition") { AXValueGetValue(pv as! AXValue, .cgPoint, &pos) }
                if let sv = attr(el, "AXSize") { AXValueGetValue(sv as! AXValue, .cgSize, &size) }
                print("[\(hits.count - 1)] \(str(el, "AXRole") ?? "") | \(texts.joined(separator: " | ")) | (\(Int(pos.x)),\(Int(pos.y)) \(Int(size.width))x\(Int(size.height)))")
            }
            if d < maxDepth { for c in children(el).reversed() { stack.append((c, d + 1)) } }
        }
    }
    if args[1] == "setvalue" {
        guard !hits.isEmpty else { print("không có nút khớp"); exit(1) }
        AXUIElementSetAttributeValue(hits[0], "AXFocused" as CFString, kCFBooleanTrue)
        let r = AXUIElementSetAttributeValue(hits[0], "AXValue" as CFString, args[4] as CFString)
        print("AXValue →", r.rawValue)
    }
    if args[1] == "press" {
        let i = args.count >= 5 ? Int(args[4])! : 0
        guard i < hits.count else { print("không có nút khớp"); exit(1) }
        let r = AXUIElementPerformAction(hits[i], "AXPress" as CFString)
        print("AXPress [\(i)] →", r.rawValue)
    }
default:
    print("lệnh không biết")
    exit(2)
}
