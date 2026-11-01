//! Một lần quan sát cho máy trạng thái gợi ý: app họp nào có mặt và app nào đang có tiếng (spec 2026-11-01-goi-y-bat-dich-khi-hop
//! §2, §3). Thuần Rust: hàm hệ thống (cửa sổ, tiến trình, âm lượng) do bên gọi đưa vào qua [`Desktop`], [`ProcTable`], [`Levels`].
//!
//! Quyền riêng tư (QĐ 3 của kế hoạch 04): chỉ hỏi cửa sổ thuộc tiến trình nào và file chạy của tiến trình đó. Tiêu đề cửa sổ chỉ được
//! đọc khi file chạy là Chrome hay Edge (để xét có phải trang Meet), và khi bộ quét công thức xét cửa sổ của Teams, Zoom. Cửa sổ của mọi
//! app khác không bao giờ bị đọc tiêu đề. Tiêu đề không được lưu: chỉ giữ kết quả "có / không".

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use speaker_protocol::MeetingApp;
use speaker_recipe::Recipes;

use crate::hint::{HintApp, apps_with_sound, is_meet_title, is_native, present_apps};
use crate::procmap::{Levels, ProcTable};
use crate::winscan::{Desktop, EXE_TTL, MAX_TOP_WINDOWS, Scanner, app_of_exe};

/// Quét cửa sổ thưa hơn khi chưa thấy app họp nào.
pub const SCAN_IDLE: Duration = Duration::from_secs(5);
/// Quét dày hơn khi đã thấy app họp.
pub const SCAN_ACTIVE: Duration = Duration::from_secs(2);

/// Kết quả một lần quan sát, đúng dạng máy trạng thái cần (`hint::Tick`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Observation {
    /// App họp có mặt ([`present_apps`]).
    pub present: Vec<HintApp>,
    /// App có tiếng ([`apps_with_sound`]).
    pub sound: Vec<HintApp>,
}

#[derive(Default)]
pub struct Probe {
    scanner: Scanner,
    exes: HashMap<u32, (Instant, Option<MeetingApp>)>,
    /// Teams, Zoom có cửa sổ hiện; Chrome, Edge có cửa sổ mang tiêu đề Meet.
    visible: Vec<MeetingApp>,
    /// Teams, Zoom có cửa sổ họp theo công thức (chỉ dùng cho dự phòng).
    recipe_windows: Vec<MeetingApp>,
    scanned_at: Option<Instant>,
}

impl Probe {
    /// Đã tới lúc quét cửa sổ chưa: lần đầu, hay đã qua [`SCAN_ACTIVE`] (đã thấy app họp) hoặc [`SCAN_IDLE`] (chưa thấy).
    pub fn scan_due(&self, now: Instant) -> bool {
        let every = if self.visible.is_empty() {
            SCAN_IDLE
        } else {
            SCAN_ACTIVE
        };
        self.scanned_at
            .is_none_or(|at| now.saturating_duration_since(at) >= every)
    }

    /// `levels` và `table` là của lần lấy mẫu này (bên gọi chỉ cần dựng `table` khi `levels` có tiếng; bảng rỗng thì không gán được phiên
    /// nào). `recipes`: công thức đang có, để dự phòng cho Teams và Zoom; `None` thì không dự phòng. Cửa sổ chỉ quét lại khi
    /// [`Probe::scan_due`], còn lại dùng kết quả lần trước.
    pub fn observe<D: Desktop>(
        &mut self,
        desktop: &mut D,
        recipes: Option<&Recipes>,
        levels: &Levels,
        table: &ProcTable,
        now: Instant,
    ) -> Observation {
        if self.scan_due(now) {
            self.scan(desktop, recipes, now);
        }
        let mapped = levels.mapped_apps(table);
        let present = present_apps(&self.visible, &mapped);
        let sound = apps_with_sound(&mapped, levels.device_loud(), &present, &self.recipe_windows);
        let mut present_hint: Vec<HintApp> = Vec::new();
        for app in present {
            let h = HintApp::of(app);
            if !present_hint.contains(&h) {
                present_hint.push(h);
            }
        }
        Observation {
            present: present_hint,
            sound,
        }
    }

    fn scan<D: Desktop>(&mut self, d: &mut D, recipes: Option<&Recipes>, now: Instant) {
        let mut seen = HashSet::new();
        let mut visible = Vec::new();
        for w in d.top_windows().into_iter().take(MAX_TOP_WINDOWS) {
            seen.insert(w.pid);
            let app = match self.exes.get(&w.pid) {
                Some((at, app)) if now.saturating_duration_since(*at) < EXE_TTL => *app,
                _ => {
                    let app = d.exe_path(w.pid).as_deref().and_then(app_of_exe);
                    self.exes.insert(w.pid, (now, app));
                    app
                }
            };
            let Some(app) = app else { continue };
            // Teams, Zoom: cửa sổ hiện là đủ. Chrome, Edge: phải là trang Meet, nên mới đọc tiêu đề (chỉ file chạy trong danh sách).
            let is_meeting = is_native(app) || is_meet_title(&d.title(w.id));
            if is_meeting && !visible.contains(&app) {
                visible.push(app);
            }
        }
        self.exes.retain(|pid, _| seen.contains(pid));
        self.visible = visible;
        self.recipe_windows = match recipes {
            Some(r) => [MeetingApp::Teams, MeetingApp::Zoom]
                .into_iter()
                .filter(|a| self.scanner.scan(d, r, Some(*a), now).is_some())
                .collect(),
            None => Vec::new(),
        };
        self.scanned_at = Some(now);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::winscan::RawWindow;
    use speaker_recipe::parse;

    fn recipes() -> Recipes {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../scripts/speaker-recipes/fixtures");
        let read = |name: &str| std::fs::read_to_string(dir.join(name)).unwrap();
        let teams: serde_json::Value = serde_json::from_str(&read("teams-windows.recipes.json")).unwrap();
        let meet: serde_json::Value = serde_json::from_str(&read("meet-windows.recipes.json")).unwrap();
        let mut apps = teams["apps"].as_array().unwrap().clone();
        apps.extend(meet["apps"].as_array().unwrap().iter().cloned());
        let json = serde_json::json!({"schema": 1, "version": 1, "min_app_version": "0.3.2", "apps": apps});
        parse(&json.to_string()).unwrap()
    }

    /// Bàn làm việc giả: (cửa sổ, file chạy, tiêu đề); ghi lại số lần quét và những cửa sổ đã bị đọc tiêu đề.
    #[derive(Default)]
    struct Fake {
        windows: Vec<(RawWindow, &'static str, &'static str)>,
        scans: u32,
        titled: Vec<isize>,
    }

    impl Desktop for Fake {
        fn top_windows(&mut self) -> Vec<RawWindow> {
            self.scans += 1;
            self.windows.iter().map(|w| w.0).collect()
        }
        fn exe_path(&mut self, pid: u32) -> Option<String> {
            self.windows.iter().find(|w| w.0.pid == pid).map(|w| w.1.to_string())
        }
        fn title(&mut self, id: isize) -> String {
            self.titled.push(id);
            self.windows
                .iter()
                .find(|w| w.0.id == id)
                .map(|w| w.2.to_string())
                .unwrap_or_default()
        }
        fn class_name(&mut self, _id: isize) -> String {
            "Chrome_WidgetWin_1".into()
        }
    }

    const TEAMS_CALL: &str = "Meeting with Hoa Phạm | Microsoft Teams";

    fn with(windows: &[(RawWindow, &'static str, &'static str)]) -> Fake {
        Fake {
            windows: windows.to_vec(),
            ..Fake::default()
        }
    }

    fn win(id: isize, pid: u32) -> RawWindow {
        RawWindow { id, pid }
    }

    fn table() -> ProcTable {
        let mut t = ProcTable::default();
        t.insert(200, 100, "ms-teams.exe");
        t.insert(201, 200, "msedgewebview2.exe");
        t.insert(300, 100, "Zoom.exe");
        t.insert(400, 100, "chrome.exe");
        t.insert(401, 400, "chrome.exe");
        t.insert(500, 100, "Spotify.exe");
        t
    }

    fn at(secs: u64, t0: Instant) -> Instant {
        t0 + Duration::from_secs(secs)
    }

    #[test]
    fn teams_with_sound_from_its_webview_is_a_meeting() {
        let mut d = with(&[(win(1, 200), "ms-teams.exe", "Chat | Microsoft Teams")]);
        let levels = Levels {
            sessions: vec![(201, 0.2)],
            device_peak: 0.2,
        };
        let o = Probe::default().observe(&mut d, None, &levels, &table(), Instant::now());
        assert_eq!(o.present, vec![HintApp::Teams]);
        assert_eq!(o.sound, vec![HintApp::Teams]);
    }

    #[test]
    fn teams_hidden_in_the_tray_still_counts_when_its_sound_is_mapped() {
        // Không có cửa sổ nào hiện (Teams thu nhỏ xuống khay, hay cuộc gọi mở ở cửa sổ khác), nhưng phiên âm thanh gán được.
        let mut d = Fake::default();
        let levels = Levels {
            sessions: vec![(201, 0.2)],
            device_peak: 0.2,
        };
        let o = Probe::default().observe(&mut d, None, &levels, &table(), Instant::now());
        assert_eq!(o.sound, vec![HintApp::Teams]);
    }

    #[test]
    fn zoom_is_seen_by_its_window_and_sound() {
        let mut d = with(&[(win(2, 300), "Zoom.exe", "Zoom Meeting")]);
        let levels = Levels {
            sessions: vec![(300, 0.3)],
            device_peak: 0.3,
        };
        let o = Probe::default().observe(&mut d, None, &levels, &table(), Instant::now());
        assert_eq!(o.present, vec![HintApp::Zoom]);
        assert_eq!(o.sound, vec![HintApp::Zoom]);
    }

    #[test]
    fn meet_in_a_browser_needs_the_meet_tab_title() {
        let levels = Levels {
            sessions: vec![(401, 0.4)],
            device_peak: 0.4,
        };
        let mut meet = with(&[(win(5, 400), "chrome.exe", "Meet - abc-defg-hij - Google Chrome")]);
        let o = Probe::default().observe(&mut meet, None, &levels, &table(), Instant::now());
        assert_eq!(o.present, vec![HintApp::Meet]);
        assert_eq!(o.sound, vec![HintApp::Meet]);
        // YouTube trong cùng trình duyệt, cùng tiếng: không phải họp.
        let mut yt = with(&[(
            win(5, 400),
            "chrome.exe",
            "Nhạc hay nhất 2026 - YouTube - Google Chrome",
        )]);
        let o = Probe::default().observe(&mut yt, None, &levels, &table(), Instant::now());
        assert_eq!(o, Observation::default());
    }

    #[test]
    fn the_fallback_needs_a_teams_meeting_window_by_recipe() {
        // Tiếng phát từ tiến trình không gán được (500 = Spotify) khi Teams có cuộc gọi: dự phòng bật.
        let levels = Levels {
            sessions: vec![(500, 0.5)],
            device_peak: 0.5,
        };
        let mut call = with(&[(win(1, 200), "ms-teams.exe", TEAMS_CALL)]);
        let o = Probe::default().observe(&mut call, Some(&recipes()), &levels, &table(), Instant::now());
        assert_eq!(o.sound, vec![HintApp::Teams]);
        // Teams chỉ mở sẵn (cửa sổ chính), Spotify phát nhạc: không phải họp.
        let mut idle = with(&[(win(1, 200), "ms-teams.exe", "Chat | Microsoft Teams")]);
        let o = Probe::default().observe(&mut idle, Some(&recipes()), &levels, &table(), Instant::now());
        assert_eq!(o.present, vec![HintApp::Teams]);
        assert_eq!(o.sound, Vec::<HintApp>::new());
        // Không có công thức thì không dự phòng.
        let o = Probe::default().observe(&mut call, None, &levels, &table(), Instant::now());
        assert_eq!(o.sound, Vec::<HintApp>::new());
    }

    #[test]
    fn windows_are_rescanned_on_a_schedule_not_every_sample() {
        let levels = Levels::default();
        let t0 = Instant::now();
        // Có app họp: quét lại mỗi 2 giây.
        let (mut p, mut d) = (
            Probe::default(),
            with(&[(win(1, 200), "ms-teams.exe", "Chat | Microsoft Teams")]),
        );
        p.observe(&mut d, None, &levels, &table(), t0);
        let first = d.scans;
        assert!(first >= 1);
        p.observe(&mut d, None, &levels, &table(), t0 + Duration::from_millis(1500));
        assert_eq!(d.scans, first);
        p.observe(&mut d, None, &levels, &table(), at(2, t0));
        assert!(d.scans > first);
        // Chưa thấy app họp: thưa hơn, 5 giây.
        let (mut p, mut d) = (Probe::default(), Fake::default());
        p.observe(&mut d, None, &levels, &table(), t0);
        let first = d.scans;
        p.observe(&mut d, None, &levels, &table(), at(3, t0));
        assert_eq!(d.scans, first);
        p.observe(&mut d, None, &levels, &table(), at(5, t0));
        assert!(d.scans > first);
    }

    #[test]
    fn titles_of_other_apps_are_never_read() {
        let mut d = with(&[
            (win(7, 600), "notepad.exe", "Mật khẩu ngân hàng.txt - Notepad"),
            (win(8, 500), "Spotify.exe", "Bài hát riêng tư - Spotify"),
            (win(9, 200), "ms-teams.exe", "Chat | Microsoft Teams"),
            (win(10, 400), "chrome.exe", "Hộp thư - Gmail - Google Chrome"),
        ]);
        Probe::default().observe(&mut d, None, &Levels::default(), &table(), Instant::now());
        // Chỉ cửa sổ trình duyệt (xét có phải trang Meet) được đọc tiêu đề; Teams không cần tiêu đề; app khác thì không bao giờ.
        assert_eq!(d.titled, vec![10]);
    }
}
