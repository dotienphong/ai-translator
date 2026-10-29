//! Tìm cửa sổ họp trên Windows (spec 2026-10-26-phan-biet-nguoi-noi §6.1; kế hoạch 05 QĐ 4). Phần này thuần Rust, test trên mọi nền
//! tảng; hàm Win32 thật nằm sau trait [`Desktop`] (Windows: `reader::uia::Win32Desktop`).
//!
//! Thứ tự đọc là bảo vệ quyền riêng tư (QĐ 3 của kế hoạch 04): trước hết chỉ hỏi cửa sổ thuộc **tiến trình nào** và tiến trình đó
//! là **file chạy nào**; tiêu đề cửa sổ chỉ được đọc khi file chạy nằm trong danh sách viết cứng ([`MeetingApp::windows_exe`]) và
//! có công thức cho Windows. Cửa sổ của mọi app khác không bao giờ bị đọc tiêu đề.

use std::collections::{HashMap, HashSet};
use std::fmt;
use std::time::{Duration, Instant};

use speaker_protocol::MeetingApp;
use speaker_recipe::{Os, Recipes};

use super::extract::is_meeting_window;

/// Hai cửa sổ họp mỗi app là đủ (spec §6.1).
pub const MAX_WINDOWS: usize = 2;
/// Số cửa sổ cấp cao nhất xét mỗi lần quét.
pub const MAX_TOP_WINDOWS: usize = 1_024;
/// File chạy của một tiến trình được nhớ chừng này (tiến trình thoát, số hiệu dùng lại cho app khác thì tự hết hạn).
pub const EXE_TTL: Duration = Duration::from_secs(30);

/// Một cửa sổ cấp cao nhất đang hiện: số hiệu (HWND) và tiến trình sở hữu.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RawWindow {
    pub id: isize,
    pub pid: u32,
}

/// Hàm hệ thống mà bộ quét dùng.
pub trait Desktop {
    /// Cửa sổ cấp cao nhất đang hiện, theo thứ tự trên xuống dưới. Không đọc tiêu đề.
    fn top_windows(&mut self) -> Vec<RawWindow>;
    /// Đường dẫn hay tên file chạy của tiến trình.
    fn exe_path(&mut self, pid: u32) -> Option<String>;
    fn title(&mut self, id: isize) -> String;
    /// Tên lớp cửa sổ Win32 (công thức dùng làm `window_id`).
    fn class_name(&mut self, id: isize) -> String;
    /// Phiên bản của app họp đang chạy ở tiến trình `pid` (file chạy `exe_path`), cho báo cáo tình trạng (kế hoạch 06, spec §7.2).
    /// Mặc định không biết. Chỉ gọi cho tiến trình của app trong danh sách viết cứng.
    fn app_version(&mut self, pid: u32, exe_path: &str) -> Option<String> {
        let _ = (pid, exe_path);
        None
    }
}

/// App họp của một file chạy (danh sách viết cứng, không phân biệt hoa thường, chỉ xét tên file không xét thư mục).
pub fn app_of_exe(path: &str) -> Option<MeetingApp> {
    let file = path.rsplit(['\\', '/']).next()?;
    MeetingApp::ALL
        .into_iter()
        .find(|a| a.windows_exe().eq_ignore_ascii_case(file))
}

/// Phiên bản trong tên đầy đủ của một gói MSIX (`Tên_Phiên.bản.số.nữa_Kiến-trúc_Mã-tài-nguyên_Mã-nhà-phát-hành`, ví dụ
/// `MSTeams_26032.1100.4129.1234_x64__8wekyb3d8bbwe`): Teams mới là gói trong `WindowsApps`, đọc file phiên bản của file chạy ở đó
/// thường bị từ chối, còn tên gói thì tiến trình nào cũng hỏi được. `None` nếu không đúng dạng (chỉ số và dấu chấm, ≤ 32 ký tự).
pub fn package_version(full_name: &str) -> Option<String> {
    let mut parts = full_name.split('_');
    let (_name, version) = (parts.next()?, parts.next()?);
    let ok = !version.is_empty()
        && version.len() <= speaker_protocol::MAX_APP_VERSION_BYTES
        && version
            .split('.')
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()));
    (ok && parts.next().is_some()).then(|| version.to_string())
}

/// `a.b.c.d` của hai nửa `VS_FIXEDFILEINFO::dwFileVersionMS` và `dwFileVersionLS`.
pub fn fixed_file_version(ms: u32, ls: u32) -> String {
    format!("{}.{}.{}.{}", ms >> 16, ms & 0xFFFF, ls >> 16, ls & 0xFFFF)
}

/// Cửa sổ họp tìm được. `title` có chữ của app họp: không in ra log.
#[derive(Clone, PartialEq, Eq)]
pub struct MeetingWindow {
    pub id: isize,
    pub title: String,
}

impl fmt::Debug for MeetingWindow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "MeetingWindow({}, tiêu đề {} ký tự)",
            self.id,
            self.title.chars().count()
        )
    }
}

/// App họp đầu tiên (theo ưu tiên của [`MeetingApp::ALL`]) có cửa sổ họp, và các cửa sổ họp của nó.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Found {
    pub app: MeetingApp,
    pub windows: Vec<MeetingWindow>,
    /// Phiên bản app họp (từ tiến trình của cửa sổ họp đầu tiên), nếu hỏi được.
    pub version: Option<String>,
}

/// Bộ quét, nhớ file chạy của từng tiến trình giữa các lần quét.
#[derive(Default)]
pub struct Scanner {
    exes: HashMap<u32, (Instant, Option<MeetingApp>, Option<String>)>,
}

impl Scanner {
    /// `only`: chỉ xét app này (công cụ `uia-record`). Chỉ app có công thức Windows mới vào danh sách (như macOS).
    pub fn scan<D: Desktop>(
        &mut self,
        d: &mut D,
        recipes: &Recipes,
        only: Option<MeetingApp>,
        now: Instant,
    ) -> Option<Found> {
        let mut seen = HashSet::new();
        let mut per_app: Vec<Vec<MeetingWindow>> = vec![Vec::new(); MeetingApp::ALL.len()];
        let mut versions: Vec<Option<String>> = vec![None; MeetingApp::ALL.len()];
        for w in d.top_windows().into_iter().take(MAX_TOP_WINDOWS) {
            seen.insert(w.pid);
            let (app, version) = match self.exes.get(&w.pid) {
                Some((at, app, version)) if now.saturating_duration_since(*at) < EXE_TTL => (*app, version.clone()),
                _ => {
                    let path = d.exe_path(w.pid);
                    let app = path.as_deref().and_then(app_of_exe);
                    // Phiên bản chỉ hỏi cho app trong danh sách viết cứng.
                    let version = app.and_then(|_| path.as_deref().and_then(|p| d.app_version(w.pid, p)));
                    self.exes.insert(w.pid, (now, app, version.clone()));
                    (app, version)
                }
            };
            let Some(app) = app.filter(|a| only.is_none_or(|o| o == *a)) else {
                continue;
            };
            let Some(recipe) = recipes.app(Os::Windows, app) else {
                continue;
            };
            let title = d.title(w.id);
            let class = if recipe.window_id.is_some() {
                d.class_name(w.id)
            } else {
                String::new()
            };
            if is_meeting_window(recipe, &title, &class, "") {
                let slot = MeetingApp::ALL.iter().position(|a| *a == app).unwrap_or(0);
                if per_app[slot].is_empty() {
                    versions[slot] = version;
                }
                per_app[slot].push(MeetingWindow { id: w.id, title });
            }
        }
        self.exes.retain(|pid, _| seen.contains(pid));
        MeetingApp::ALL
            .into_iter()
            .zip(per_app)
            .zip(versions)
            .find(|((_, windows), _)| !windows.is_empty())
            .map(|((app, mut windows), version)| {
                windows.truncate(MAX_WINDOWS);
                Found { app, windows, version }
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use speaker_recipe::parse;

    /// Bàn làm việc giả: danh sách cửa sổ, và ghi lại những cửa sổ đã bị đọc tiêu đề, những tiến trình đã bị hỏi file chạy.
    #[derive(Default)]
    struct Fake {
        windows: Vec<(RawWindow, &'static str, &'static str, &'static str)>,
        titled: Vec<isize>,
        exe_asked: Vec<u32>,
        /// (tiến trình, phiên bản) mà `app_version` trả; ghi lại các tiến trình đã bị hỏi phiên bản.
        versions: Vec<(u32, &'static str)>,
        version_asked: Vec<u32>,
    }

    impl Fake {
        fn add(&mut self, id: isize, pid: u32, exe: &'static str, title: &'static str) {
            self.windows
                .push((RawWindow { id, pid }, exe, title, "Chrome_WidgetWin_1"));
        }
    }

    impl Desktop for Fake {
        fn top_windows(&mut self) -> Vec<RawWindow> {
            self.windows.iter().map(|w| w.0).collect()
        }

        fn exe_path(&mut self, pid: u32) -> Option<String> {
            self.exe_asked.push(pid);
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

        fn class_name(&mut self, id: isize) -> String {
            self.windows
                .iter()
                .find(|w| w.0.id == id)
                .map(|w| w.3.to_string())
                .unwrap_or_default()
        }

        fn app_version(&mut self, pid: u32, _exe_path: &str) -> Option<String> {
            self.version_asked.push(pid);
            self.versions.iter().find(|v| v.0 == pid).map(|v| v.1.to_string())
        }
    }

    fn recipes() -> Recipes {
        // Teams (công thức ứng viên) và Meet trên Chrome, Edge: hai file ứng viên gộp thành một.
        let read = |name: &str| std::fs::read_to_string(crate::reader::tree::tests::fixture_path(name)).unwrap();
        let teams: serde_json::Value = serde_json::from_str(&read("teams-windows.recipes.json")).unwrap();
        let meet: serde_json::Value = serde_json::from_str(&read("meet-windows.recipes.json")).unwrap();
        let mut apps = teams["apps"].as_array().unwrap().clone();
        apps.extend(meet["apps"].as_array().unwrap().iter().cloned());
        let json = serde_json::json!({"schema": 1, "version": 1, "min_app_version": "0.3.2", "apps": apps});
        let r = parse(&json.to_string()).unwrap();
        assert!(r.dropped.is_empty(), "{:?}", r.dropped);
        r
    }

    #[test]
    fn package_names_give_the_app_version() {
        assert_eq!(
            package_version("MSTeams_26032.1100.4129.1234_x64__8wekyb3d8bbwe").as_deref(),
            Some("26032.1100.4129.1234")
        );
        assert_eq!(package_version("A_1_neutral__x").as_deref(), Some("1"));
        for bad in [
            "",
            "MSTeams",
            "MSTeams_26032.1100",
            "MSTeams__x64__x",
            "A_1.x_x64__x",
            "A_1..2_x64__x",
            "A_1.2._x64__x",
            "A_1.2.3.4.5.6.7.8.9.10.11.12.13.14.15_x64__x",
            "A_Lan Nguyễn_x64__x",
        ] {
            assert_eq!(package_version(bad), None, "{bad}");
        }
    }

    #[test]
    fn fixed_file_versions_read_four_numbers() {
        assert_eq!(fixed_file_version(0x0009_0001, 0x0002_0003), "9.1.2.3");
        assert_eq!(fixed_file_version(0x009C_0000, 0x1234_FFFF), "156.0.4660.65535");
    }

    /// Phiên bản của app họp đi cùng cửa sổ họp; chỉ hỏi cho app trong danh sách, và nhớ cùng file chạy (không hỏi lại trong `EXE_TTL`).
    #[test]
    fn the_app_version_comes_with_the_meeting_window_and_is_asked_once() {
        let mut d = Fake::default();
        d.add(1, 100, "notepad.exe", "Meeting with my diary - Notepad");
        d.add(2, 101, "ms-teams.exe", "Meeting with Hoa Phạm | Microsoft Teams");
        d.versions = vec![(100, "9.9"), (101, "26032.1100.4129.1234")];
        let mut s = Scanner::default();
        let t0 = Instant::now();
        let found = s.scan(&mut d, &recipes(), None, t0).unwrap();
        assert_eq!(found.version.as_deref(), Some("26032.1100.4129.1234"));
        assert_eq!(
            d.version_asked,
            [101],
            "notepad không có trong danh sách: không hỏi phiên bản"
        );
        s.scan(&mut d, &recipes(), None, t0 + Duration::from_secs(2)).unwrap();
        assert_eq!(d.version_asked, [101], "còn trong EXE_TTL");
        s.scan(&mut d, &recipes(), None, t0 + EXE_TTL + Duration::from_secs(1))
            .unwrap();
        assert_eq!(d.version_asked, [101, 101], "hết hạn thì hỏi lại");
        let mut none = Fake::default();
        none.add(2, 101, "ms-teams.exe", "Meeting with Hoa Phạm | Microsoft Teams");
        assert_eq!(
            Scanner::default()
                .scan(&mut none, &recipes(), None, t0)
                .unwrap()
                .version,
            None
        );
    }

    #[test]
    fn executables_map_to_the_hard_coded_apps() {
        assert_eq!(app_of_exe("ms-teams.exe"), Some(MeetingApp::Teams));
        assert_eq!(
            app_of_exe(r"C:\Program Files\WindowsApps\MSTeams_1_x64__x\MS-Teams.EXE"),
            Some(MeetingApp::Teams)
        );
        assert_eq!(
            app_of_exe(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            Some(MeetingApp::MeetChrome)
        );
        assert_eq!(app_of_exe("C:/x/msedge.exe"), Some(MeetingApp::MeetEdge));
        assert_eq!(app_of_exe("Zoom.exe"), Some(MeetingApp::Zoom));
        assert_eq!(app_of_exe("notepad.exe"), None);
        assert_eq!(app_of_exe("chrome.exe.bak"), None);
        assert_eq!(app_of_exe(r"C:\x\notchrome.exe"), None);
        assert_eq!(app_of_exe(""), None);
    }

    /// QĐ 4: chỉ cửa sổ của file chạy trong danh sách (và có công thức) bị đọc tiêu đề.
    #[test]
    fn titles_of_other_apps_are_never_read() {
        let mut d = Fake::default();
        d.add(1, 100, "notepad.exe", "Meeting with my diary - Notepad");
        d.add(2, 101, "ms-teams.exe", "Meeting with Hoa Phạm | Microsoft Teams");
        d.add(3, 102, "Zoom.exe", "Zoom Meeting");
        d.add(4, 103, "explorer.exe", "Meeting with taxes");
        let mut s = Scanner::default();
        let found = s.scan(&mut d, &recipes(), None, Instant::now()).unwrap();
        assert_eq!(found.app, MeetingApp::Teams);
        assert_eq!(found.windows.len(), 1);
        assert_eq!(found.windows[0].id, 2);
        assert_eq!(d.titled, [2], "Zoom không có công thức Windows: cũng không đọc tiêu đề");
    }

    #[test]
    fn only_meeting_titles_match_and_the_first_app_by_priority_wins() {
        let mut d = Fake::default();
        d.add(1, 200, "chrome.exe", "Meet - abc-defg-hij - Google Chrome");
        d.add(2, 200, "chrome.exe", "Gmail - Google Chrome");
        d.add(3, 201, "ms-teams.exe", "Chat | Microsoft Teams");
        d.add(4, 201, "ms-teams.exe", "Meeting with Lan | Microsoft Teams");
        let mut s = Scanner::default();
        let found = s.scan(&mut d, &recipes(), None, Instant::now()).unwrap();
        assert_eq!(
            (found.app, found.windows.iter().map(|w| w.id).collect::<Vec<_>>()),
            (MeetingApp::Teams, vec![4])
        );
        // `only` thu hẹp.
        let found = s
            .scan(&mut d, &recipes(), Some(MeetingApp::MeetChrome), Instant::now())
            .unwrap();
        assert_eq!((found.app, found.windows.len()), (MeetingApp::MeetChrome, 1));
        assert!(
            s.scan(&mut d, &recipes(), Some(MeetingApp::MeetEdge), Instant::now())
                .is_none()
        );
    }

    #[test]
    fn at_most_two_windows_per_app() {
        let mut d = Fake::default();
        for i in 0..5 {
            d.add(10 + i, 300, "chrome.exe", "Meet - abc-defg-hij - Google Chrome");
        }
        let found = Scanner::default()
            .scan(&mut d, &recipes(), None, Instant::now())
            .unwrap();
        assert_eq!(found.windows.iter().map(|w| w.id).collect::<Vec<_>>(), [10, 11]);
    }

    /// File chạy được nhớ 30 s theo tiến trình; tiến trình hết cửa sổ thì bị quên; sau 30 s hỏi lại.
    #[test]
    fn executables_are_remembered_for_a_while() {
        let mut d = Fake::default();
        d.add(1, 400, "ms-teams.exe", "Meeting with Lan | Microsoft Teams");
        let (mut s, r, t0) = (Scanner::default(), recipes(), Instant::now());
        s.scan(&mut d, &r, None, t0);
        s.scan(&mut d, &r, None, t0 + Duration::from_secs(2));
        assert_eq!(d.exe_asked, [400], "lần quét thứ hai dùng bản nhớ");
        s.scan(&mut d, &r, None, t0 + EXE_TTL + Duration::from_secs(1));
        assert_eq!(d.exe_asked, [400, 400], "hết hạn thì hỏi lại");
        d.windows.clear();
        assert!(s.scan(&mut d, &r, None, t0 + Duration::from_secs(40)).is_none());
        assert!(s.exes.is_empty(), "tiến trình không còn cửa sổ thì bị quên");
        d.add(2, 400, "notepad.exe", "Meeting with a reused pid");
        assert!(
            s.scan(&mut d, &r, None, t0 + Duration::from_secs(41)).is_none(),
            "số hiệu dùng lại cho app khác"
        );
    }

    #[test]
    fn debug_output_hides_titles() {
        let w = MeetingWindow {
            id: 7,
            title: "Meeting with Lan".into(),
        };
        assert_eq!(format!("{w:?}"), "MeetingWindow(7, tiêu đề 16 ký tự)");
    }
}
