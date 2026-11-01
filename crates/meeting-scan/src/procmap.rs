//! Gán phiên âm thanh về app họp (spec 2026-11-01-goi-y-bat-dich-khi-hop §3). Thuần Rust; bảng tiến trình do hàm Win32 (`win`) dựng.
//!
//! Tiếng của app họp không luôn phát từ tiến trình chính của app: Teams mới chạy trong WebView2 (tiếng từ `msedgewebview2.exe`, cha là
//! `ms-teams.exe`), Zoom có tiến trình phụ, trình duyệt phát tiếng qua tiến trình dịch vụ âm thanh. Vì vậy lần theo cây tiến trình cha,
//! và chỉ gán khi một tổ tiên (hay chính tiến trình đó) là file chạy trong danh sách viết cứng (`MeetingApp::windows_exe`).

use std::collections::HashMap;

use speaker_protocol::MeetingApp;

use crate::hint::PEAK_THRESHOLD;
use crate::winscan::app_of_exe;

/// Số cấp cha tối đa lần theo.
pub const MAX_ANCESTORS: usize = 4;

/// Bảng tiến trình: số hiệu → (số hiệu cha, tên file chạy). Chỉ tên file, không đường dẫn, không dòng lệnh.
#[derive(Clone, Debug, Default)]
pub struct ProcTable {
    procs: HashMap<u32, (u32, String)>,
}

impl ProcTable {
    pub fn insert(&mut self, pid: u32, parent: u32, exe: impl Into<String>) {
        self.procs.insert(pid, (parent, exe.into()));
    }

    pub fn len(&self) -> usize {
        self.procs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.procs.is_empty()
    }

    /// App họp của tiến trình `pid`: chính nó hay tổ tiên gần nhất (tối đa [`MAX_ANCESTORS`] cấp) là file chạy trong danh sách.
    pub fn app_of_pid(&self, pid: u32) -> Option<MeetingApp> {
        let mut current = pid;
        for _ in 0..=MAX_ANCESTORS {
            let (parent, exe) = self.procs.get(&current)?;
            if let Some(app) = app_of_exe(exe) {
                return Some(app);
            }
            // Cha trùng chính nó (hay 0) hay vòng lặp (số hiệu dùng lại): dừng.
            if *parent == 0 || *parent == current {
                return None;
            }
            current = *parent;
        }
        None
    }
}

/// Đỉnh âm lượng của thiết bị phát và của từng phiên đang hoạt động: (số hiệu tiến trình, đỉnh 0..1).
#[derive(Clone, Debug, Default)]
pub struct Levels {
    pub sessions: Vec<(u32, f32)>,
    pub device_peak: f32,
}

impl Levels {
    pub fn device_loud(&self) -> bool {
        self.device_peak >= PEAK_THRESHOLD
    }

    /// App họp có phiên đang có tiếng (đỉnh từ [`PEAK_THRESHOLD`] trở lên), không trùng lặp, theo thứ tự ưu tiên.
    pub fn mapped_apps(&self, table: &ProcTable) -> Vec<MeetingApp> {
        let mut out = Vec::new();
        for (pid, peak) in &self.sessions {
            if *peak < PEAK_THRESHOLD {
                continue;
            }
            if let Some(app) = table.app_of_pid(*pid)
                && !out.contains(&app)
            {
                out.push(app);
            }
        }
        out.sort_by_key(|a| MeetingApp::ALL.iter().position(|x| x == a));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table() -> ProcTable {
        let mut t = ProcTable::default();
        t.insert(4, 0, "System");
        t.insert(100, 4, "explorer.exe");
        // Teams mới: tiếng từ WebView2 con.
        t.insert(200, 100, "ms-teams.exe");
        t.insert(201, 200, "msedgewebview2.exe");
        t.insert(202, 201, "msedgewebview2.exe");
        // Zoom và tiến trình phụ.
        t.insert(300, 100, "Zoom.exe");
        t.insert(301, 300, "CptHost.exe");
        // Chrome với tiến trình dịch vụ âm thanh; Edge.
        t.insert(400, 100, "chrome.exe");
        t.insert(401, 400, "chrome.exe");
        t.insert(500, 100, "msedge.exe");
        // App khác kèm WebView2 riêng (không phải Teams).
        t.insert(600, 100, "Spotify.exe");
        t.insert(601, 600, "msedgewebview2.exe");
        // Chuỗi quá dài tới Teams.
        t.insert(700, 200, "a.exe");
        t.insert(701, 700, "b.exe");
        t.insert(702, 701, "c.exe");
        t.insert(703, 702, "d.exe");
        t.insert(704, 703, "e.exe");
        t
    }

    #[test]
    fn processes_map_to_their_meeting_app_through_parents() {
        let t = table();
        assert_eq!(t.app_of_pid(200), Some(MeetingApp::Teams));
        assert_eq!(t.app_of_pid(201), Some(MeetingApp::Teams));
        assert_eq!(t.app_of_pid(202), Some(MeetingApp::Teams));
        assert_eq!(t.app_of_pid(301), Some(MeetingApp::Zoom));
        assert_eq!(t.app_of_pid(401), Some(MeetingApp::MeetChrome));
        assert_eq!(t.app_of_pid(500), Some(MeetingApp::MeetEdge));
    }

    #[test]
    fn other_apps_and_their_webview_are_not_meeting_apps() {
        let t = table();
        assert_eq!(t.app_of_pid(100), None);
        assert_eq!(t.app_of_pid(600), None);
        assert_eq!(t.app_of_pid(601), None);
        // Tiến trình không có trong bảng (đã thoát).
        assert_eq!(t.app_of_pid(9999), None);
    }

    #[test]
    fn the_climb_is_bounded_and_survives_cycles() {
        let t = table();
        // 704 → 703 → 702 → 701 → 700 → 200: năm cấp cha, vượt giới hạn.
        assert_eq!(t.app_of_pid(704), None);
        assert_eq!(t.app_of_pid(703), Some(MeetingApp::Teams));
        let mut c = ProcTable::default();
        c.insert(1, 2, "a.exe");
        c.insert(2, 1, "b.exe");
        c.insert(3, 3, "c.exe");
        assert_eq!(c.app_of_pid(1), None);
        assert_eq!(c.app_of_pid(3), None);
    }

    #[test]
    fn only_loud_sessions_count_and_apps_are_deduplicated_in_priority_order() {
        let t = table();
        let levels = Levels {
            sessions: vec![(401, 0.3), (301, 0.2), (202, 0.001), (400, 0.5), (601, 0.9)],
            device_peak: 0.4,
        };
        // Teams im (0,001 < ngưỡng); WebView của Spotify không phải họp; Chrome hai phiên chỉ tính một lần.
        assert_eq!(levels.mapped_apps(&t), vec![MeetingApp::Zoom, MeetingApp::MeetChrome]);
        assert!(levels.device_loud());
        assert!(
            !Levels {
                sessions: vec![],
                device_peak: 0.0
            }
            .device_loud()
        );
    }
}
