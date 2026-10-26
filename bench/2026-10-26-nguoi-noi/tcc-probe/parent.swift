// App cha của phép thử (spec 2026-10-26-phan-biet-nguoi-noi §6.2): ghi quyền Trợ năng của chính nó, rồi chạy tiến trình con
// nằm trong cùng gói .app (giống app chạy speaker-worker) và chờ con ghi kết quả. Log: ~/Library/Logs/tcc-probe.log.
import ApplicationServices
import Foundation

let log = NSHomeDirectory() + "/Library/Logs/tcc-probe.log"

func write(_ s: String) {
    let line = "\(Date()) \(s)\n"
    if let h = FileHandle(forWritingAtPath: log) {
        h.seekToEndOfFile()
        h.write(line.data(using: .utf8)!)
        h.closeFile()
    } else {
        FileManager.default.createFile(atPath: log, contents: line.data(using: .utf8))
    }
}

write("cha: AXIsProcessTrusted = \(AXIsProcessTrusted())")
let child = Process()
child.executableURL = URL(fileURLWithPath: Bundle.main.bundlePath + "/Contents/MacOS/tcc-child")
child.arguments = [log]
do {
    try child.run()
    child.waitUntilExit()
    write("cha: con thoát với mã \(child.terminationStatus)")
} catch {
    write("cha: không chạy được con: \(error)")
}
