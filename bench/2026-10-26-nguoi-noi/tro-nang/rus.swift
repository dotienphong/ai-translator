// rus: ảnh chụp rusage của mọi tiến trình (cùng người dùng) có đường dẫn chứa một trong các chuỗi; in JSON một dòng.
// Mỗi tiến trình: thời gian CPU (s), số lệnh, số chu kỳ, năng lượng (nJ, ước tính của nhân macOS), RSS, footprint.
// Dùng số lệnh và năng lượng thay cho %CPU vì %CPU (thời gian) đổi theo xung nhịp: khi có thêm tải, chip lên xung và các
// tiến trình khác tốn ít thời gian hơn cho cùng việc (kế hoạch 01, Task 12, results/teams-chrome.md).
//
//   swiftc -O -o rus rus.swift && ./rus "google chrome" msteams     (chuỗi "/" = mọi tiến trình)

import Darwin
import Foundation

let pats = CommandLine.arguments.dropFirst().map { $0.lowercased() }
var tb = mach_timebase_info_data_t()
mach_timebase_info(&tb)
let n = proc_listallpids(nil, 0)
var pids = [pid_t](repeating: 0, count: Int(n) * 2)
let got = proc_listallpids(&pids, Int32(pids.count * MemoryLayout<pid_t>.size))
var out: [[String: Any]] = []
for pid in pids.prefix(Int(got)) where pid > 0 {
    var buf = [CChar](repeating: 0, count: 4096)
    guard proc_pidpath(pid, &buf, UInt32(buf.count)) > 0 else { continue }
    let path = String(cString: buf).lowercased()
    guard let p = pats.first(where: { path.contains($0) }) else { continue }
    var ri = rusage_info_v6()
    let r = withUnsafeMutablePointer(to: &ri) { ptr -> Int32 in
        ptr.withMemoryRebound(to: rusage_info_t?.self, capacity: 1) { proc_pid_rusage(pid, RUSAGE_INFO_V6, $0) }
    }
    guard r == 0 else { continue }  // tiến trình của người dùng khác: không đọc được, bỏ qua
    let cpu = Double(ri.ri_user_time + ri.ri_system_time) * Double(tb.numer) / Double(tb.denom) / 1e9
    out.append([
        "pid": Int(pid), "pat": p, "renderer": path.contains("renderer"), "cpu_s": cpu,
        "instr": Double(ri.ri_instructions), "cycles": Double(ri.ri_cycles), "energy_nj": Double(ri.ri_energy_nj),
        "rss": Double(ri.ri_resident_size), "foot": Double(ri.ri_phys_footprint),
    ])
}
let d = try! JSONSerialization.data(withJSONObject: ["t": Date().timeIntervalSince1970, "p": out])
print(String(data: d, encoding: .utf8)!)
