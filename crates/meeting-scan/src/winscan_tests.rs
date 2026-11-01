//! Test của [`crate::winscan`]. Dùng các file công thức mẫu chung của repo (`scripts/speaker-recipes/fixtures`).

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

fn fixture_path(name: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../scripts/speaker-recipes/fixtures")
        .join(name)
}

fn recipes() -> Recipes {
    // Teams (công thức ứng viên) và Meet trên Chrome, Edge: hai file ứng viên gộp thành một.
    let read = |name: &str| std::fs::read_to_string(fixture_path(name)).unwrap();
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
