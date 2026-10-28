// axprobe: thăm dò trạng thái trợ năng cấp app mà KHÔNG tự đặt thuộc tính nào (trừ lệnh set, time). Kế hoạch 01, Task 12.
//
//   axprobe read  <pid> <thuộc tính>                    đọc giá trị (ví dụ AXEnhancedUserInterface)
//   axprobe settable <pid> <thuộc tính>                 thuộc tính có cho đặt không (AXManualAccessibility của Chrome 156: không)
//   axprobe set   <pid> <thuộc tính> <0|1>              chỉ đặt, không đọc cây
//   axprobe count <pid> <regex tiêu đề> [lặp] [nghỉ s]  đếm nút và AXWebArea trong cửa sổ khớp (cây web có dựng không)
//   axprobe time  <pid> <thuộc tính> <regex> <ngưỡng>   đặt thuộc tính = true rồi đo thời gian tới khi cửa sổ khớp có ≥ ngưỡng nút
//
// swiftc -O -o axprobe axprobe.swift. Tiến trình chạy nó phải có quyền Trợ năng.

import ApplicationServices
import Foundation

let a = CommandLine.arguments
guard a.count >= 4 else {
    print("cách dùng: axprobe read|settable|set|count|time <pid> ...")
    exit(2)
}
let app = AXUIElementCreateApplication(Int32(a[2])!)

func kids(_ e: AXUIElement) -> [AXUIElement] {
    var v: AnyObject?
    return AXUIElementCopyAttributeValue(e, "AXChildren" as CFString, &v) == .success ? (v as? [AXUIElement]) ?? [] : []
}

// (số nút, số AXWebArea) trong các cửa sổ có tiêu đề khớp
func count(_ re: NSRegularExpression) -> (Int, Int) {
    var v: AnyObject?
    AXUIElementCopyAttributeValue(app, "AXWindows" as CFString, &v)
    var n = 0, web = 0
    for w in (v as? [AXUIElement]) ?? [] {
        var t: AnyObject?
        AXUIElementCopyAttributeValue(w, "AXTitle" as CFString, &t)
        let s = (t as? String) ?? ""
        guard re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil else { continue }
        var st = [w]
        while let e = st.popLast(), n < 40_000 {
            n += 1
            var r: AnyObject?
            AXUIElementCopyAttributeValue(e, "AXRole" as CFString, &r)
            if (r as? String) == "AXWebArea" { web += 1 }
            st.append(contentsOf: kids(e))
        }
    }
    return (n, web)
}

switch a[1] {
case "read":
    var v: AnyObject?
    let r = AXUIElementCopyAttributeValue(app, a[3] as CFString, &v)
    print(a[3], "mã \(r.rawValue)", v.map { "\($0)" } ?? "không có")
case "settable":
    var s: DarwinBoolean = false
    let r = AXUIElementIsAttributeSettable(app, a[3] as CFString, &s)
    print(a[3], "mã \(r.rawValue)", s.boolValue ? "đặt được" : "không đặt được")
case "set":
    print(a[3], "→ mã", AXUIElementSetAttributeValue(app, a[3] as CFString, a[4] == "1" ? kCFBooleanTrue : kCFBooleanFalse).rawValue)
case "count":
    let re = try! NSRegularExpression(pattern: a[3])
    let reps = a.count > 4 ? Int(a[4])! : 1
    let pause = a.count > 5 ? Double(a[5])! : 0.25
    let start = Date()
    for i in 0..<reps {
        let t0 = Date()
        let (n, web) = count(re)
        print(String(format: "%.2f s: %d nút, %d AXWebArea, đọc %.1f ms", t0.timeIntervalSince(start), n, web,
                     Date().timeIntervalSince(t0) * 1000))
        if i < reps - 1 { Thread.sleep(forTimeInterval: pause) }
    }
case "time":
    let re = try! NSRegularExpression(pattern: a[4])
    let need = Int(a[5])!
    print("trước:", count(re).0, "nút")
    let t0 = Date()
    print("đặt", a[3], "→ mã", AXUIElementSetAttributeValue(app, a[3] as CFString, kCFBooleanTrue).rawValue)
    var last = -1
    while Date().timeIntervalSince(t0) < 10 {
        let n = count(re).0
        if n != last {
            print(String(format: "%.3f s: %d nút", Date().timeIntervalSince(t0), n))
            last = n
        }
        if n >= need { break }
        Thread.sleep(forTimeInterval: 0.05)
    }
default:
    print("lệnh không biết")
    exit(2)
}
