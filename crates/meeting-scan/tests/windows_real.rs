//! Kiểm bằng **Windows thật** (spec 2026-11-01-goi-y-bat-dich-khi-hop §8): tiến trình, cửa sổ, tiêu đề và cây tiến trình cha-con là của hệ
//! điều hành, không phải bàn làm việc giả. Tạo các app giả tên `ms-teams.exe`, `Zoom.exe`, `chrome.exe`, `msedge.exe` (bản chép của
//! `examples/fake_app.rs`) với cửa sổ có tiêu đề như app thật, và tiến trình con `msedgewebview2.exe`, `CptHost.exe`; rồi chạy `Probe` và
//! `Hint` với `Win32Desktop` và `process_table` thật.
//!
//! Chỉ phần âm thanh là giả (mức tiếng đưa tay vào): máy chạy CI không có thiết bị phát để có phiên âm thanh thật. Còn `output_levels()` thật
//! cũng được gọi, để kiểm nó không panic dù máy có thiết bị phát hay không.
//!
//! Cần cửa sổ thật nên mặc định `#[ignore]`: `cargo test -p meeting-scan --test windows_real -- --ignored --nocapture`.
#![cfg(windows)]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::indexing_slicing, clippy::panic)]

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{Duration, Instant};

use meeting_scan::hint::{Action, Hint, HintApp, SAMPLE_EVERY, Tick};
use meeting_scan::probe::{Observation, Probe};
use meeting_scan::procmap::Levels;
use meeting_scan::win::{Win32Desktop, process_table};
use speaker_recipe::BUILTIN_JSON;

/// Đường dẫn `fake_app.exe` (cargo dựng các example khi chạy `cargo test`).
fn fake_app() -> PathBuf {
    let exe = std::env::current_exe().unwrap();
    // target/<profile>/deps/windows_real-xxxx.exe → target/<profile>/examples/fake_app.exe
    let profile = exe.parent().unwrap().parent().unwrap().to_path_buf();
    let path = profile.join("examples").join("fake_app.exe");
    assert!(path.exists(), "chưa dựng example fake_app: {}", path.display());
    path
}

/// Một app giả đang chạy; giết cả cây tiến trình khi hết phạm vi.
struct Running {
    child: Child,
    _dir: PathBuf,
}

impl Running {
    fn pid(&self) -> u32 {
        self.child.id()
    }
}

impl Drop for Running {
    fn drop(&mut self) {
        // `/T` giết cả tiến trình con.
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &self.pid().to_string()])
            .output();
        let _ = self.child.wait();
    }
}

fn copy_as(dir: &Path, name: &str) -> PathBuf {
    std::fs::create_dir_all(dir).unwrap();
    let dest = dir.join(name);
    std::fs::copy(fake_app(), &dest).unwrap();
    dest
}

/// Chạy app giả tên `exe` có cửa sổ `title`, và (nếu có) một tiến trình con tên `child_exe` do chính nó sinh ra.
fn launch(tag: &str, exe: &str, title: &str, child_exe: Option<&str>) -> Running {
    let dir = std::env::temp_dir().join(format!("mt-hint-real-{}-{tag}", std::process::id()));
    let app = copy_as(&dir, exe);
    let mut command = Command::new(&app);
    command.arg(title);
    if let Some(name) = child_exe {
        // Cha tên `exe` nằm ở `dir`; con tên `name` nằm ở thư mục con để không trùng tên với cha khi cả hai cùng là chrome.exe.
        let child = copy_as(&dir.join("child"), name);
        command.arg(child);
    }
    Running {
        child: command.spawn().unwrap(),
        _dir: dir,
    }
}

/// Số hiệu của một tiến trình con trực tiếp của `parent`, chờ tới khi nó xuất hiện trong bảng tiến trình.
fn child_of(parent: u32) -> u32 {
    let end = Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(pid) = process_table().children_of(parent).first() {
            return *pid;
        }
        assert!(Instant::now() < end, "tiến trình con của {parent} không xuất hiện");
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// Chạy vòng lấy mẫu của app (`Probe` rồi `Hint`) với cửa sổ và cây tiến trình **thật**, mức tiếng đưa tay vào qua `peak`, trong `secs`
/// giây. Trả các hành động khác `None` và quan sát cuối cùng.
fn run_loop(secs: f32, session_pid: u32, peak: f32) -> (Vec<(f32, Action)>, Observation) {
    let recipes = speaker_recipe::parse(BUILTIN_JSON).ok();
    let (mut probe, mut hint, mut desktop) = (Probe::default(), Hint::new(), Win32Desktop);
    let started = Instant::now();
    let mut events = Vec::new();
    let mut last = Observation::default();
    let mut n = 0u32;
    while started.elapsed().as_secs_f32() < secs {
        std::thread::sleep(SAMPLE_EVERY);
        n += 1;
        let now = Instant::now();
        let levels = Levels {
            sessions: vec![(session_pid, peak)],
            device_peak: peak,
        };
        let table = process_table();
        last = probe.observe(&mut desktop, recipes.as_ref(), &levels, &table, now);
        let action = hint.tick(&Tick {
            now,
            enabled: true,
            idle: true,
            ignored: &[],
            present: &last.present,
            sound: &last.sound,
        });
        if action != Action::None {
            events.push((n as f32 * 0.5, action));
        }
        if matches!(action, Action::Show(_)) {
            hint.dismissed();
        }
    }
    (events, last)
}

fn shows(events: &[(f32, Action)]) -> Vec<HintApp> {
    events
        .iter()
        .filter_map(|(_, a)| if let Action::Show(app) = a { Some(*app) } else { None })
        .collect()
}

/// Chờ cửa sổ giả hiện (tạo cửa sổ mất một chút), qua đường nhận biết thật.
fn wait_present(app: HintApp, session_pid: u32) {
    let recipes = speaker_recipe::parse(BUILTIN_JSON).ok();
    let (mut probe, mut desktop) = (Probe::default(), Win32Desktop);
    let end = Instant::now() + Duration::from_secs(20);
    loop {
        let levels = Levels {
            sessions: vec![(session_pid, 0.3)],
            device_peak: 0.3,
        };
        let o = probe.observe(
            &mut desktop,
            recipes.as_ref(),
            &levels,
            &process_table(),
            Instant::now(),
        );
        if o.present.contains(&app) {
            return;
        }
        assert!(
            Instant::now() < end,
            "cửa sổ của {app:?} không hiện (đã chờ 20 giây); thấy {o:?}"
        );
        std::thread::sleep(Duration::from_millis(300));
    }
}

fn check_app(tag: &str, exe: &str, title: &str, child_exe: &str, expected: HintApp) {
    let parent = launch(tag, exe, title, Some(child_exe));
    let child_pid = child_of(parent.pid());
    let table = process_table();
    println!(
        "[{tag}] cha {} ({exe}) → con {child_pid} ({:?})",
        parent.pid(),
        table.exe_of(child_pid)
    );
    wait_present(expected, child_pid);
    let (events, last) = run_loop(14.0, child_pid, 0.3);
    println!("[{tag}] sự kiện {events:?}; quan sát cuối {last:?}");
    assert_eq!(
        shows(&events),
        vec![expected],
        "[{tag}] phải gợi ý đúng một lần cho {expected:?}: {events:?}"
    );
    let when = events
        .iter()
        .find(|(_, a)| matches!(a, Action::Show(_)))
        .map(|(t, _)| *t)
        .unwrap();
    assert!(
        (4.0..=8.5).contains(&when),
        "[{tag}] gợi ý lúc {when}s, mong khoảng 5 giây"
    );
}

#[test]
#[ignore = "cần cửa sổ thật và chạy lâu; chạy với --ignored"]
fn real_windows_and_process_trees_for_teams_zoom_and_meet() {
    // Teams mới: ms-teams.exe có cửa sổ, tiếng phát từ msedgewebview2.exe con.
    check_app(
        "teams",
        "ms-teams.exe",
        "Meeting with Hoa Phạm | Microsoft Teams",
        "msedgewebview2.exe",
        HintApp::Teams,
    );
    // Cuộc họp Teams có tên tự đặt (tiêu đề không phải cuộc gọi).
    check_app(
        "teams-named",
        "ms-teams.exe",
        "Họp giao ban tuần | Microsoft Teams",
        "msedgewebview2.exe",
        HintApp::Teams,
    );
    // Zoom: Zoom.exe có cửa sổ, tiếng từ CptHost.exe con.
    check_app("zoom", "Zoom.exe", "Zoom Meeting", "CptHost.exe", HintApp::Zoom);
    // Google Meet ở Chrome, Edge: cửa sổ mang tiêu đề Meet, tiếng từ tiến trình con cùng tên.
    check_app(
        "meet-chrome",
        "chrome.exe",
        "Meet - abc-defg-hij - Google Chrome",
        "chrome.exe",
        HintApp::Meet,
    );
    check_app(
        "meet-edge",
        "msedge.exe",
        "Meet - abc-defg-hij - Microsoft Edge",
        "msedge.exe",
        HintApp::Meet,
    );
}

#[test]
#[ignore = "cần cửa sổ thật và chạy lâu; chạy với --ignored"]
fn real_windows_that_are_not_meetings_never_show() {
    // YouTube trong Chrome, có tiếng liên tục.
    let youtube = launch(
        "yt",
        "chrome.exe",
        "Nhạc hay nhất 2026 - YouTube - Google Chrome",
        Some("chrome.exe"),
    );
    let child = child_of(youtube.pid());
    let (events, last) = run_loop(12.0, child, 0.5);
    println!("[youtube] sự kiện {events:?}; quan sát cuối {last:?}");
    assert!(shows(&events).is_empty(), "{events:?}");
    assert!(last.sound.is_empty(), "{last:?}");
    // App không nằm trong danh sách, kể cả khi tiêu đề trông như Meet: không bao giờ được nhận biết.
    let other = launch(
        "other",
        "Spotify.exe",
        "Meet - abc-defg-hij",
        Some("msedgewebview2.exe"),
    );
    let child = child_of(other.pid());
    let (events, last) = run_loop(12.0, child, 0.5);
    println!("[other] sự kiện {events:?}; quan sát cuối {last:?}");
    assert!(
        shows(&events).is_empty() && last == Observation::default(),
        "{events:?} {last:?}"
    );
    // Teams mở sẵn (cửa sổ chính, không họp), âm thanh từ app khác (Spotify): không phải họp.
    let teams = launch("teams-idle", "ms-teams.exe", "Chat | Microsoft Teams", None);
    let (events, _) = run_loop(12.0, child, 0.5);
    println!("[teams-idle] sự kiện {events:?}");
    assert!(shows(&events).is_empty(), "{events:?}");
    drop(teams);
}

#[test]
#[ignore = "cần Windows thật; chạy với --ignored"]
fn the_real_win32_helpers_and_audio_probe_do_not_panic() {
    // Bảng tiến trình thật: có chính tiến trình test, kèm cha.
    let table = process_table();
    let me = std::process::id();
    assert!(table.len() > 10, "chỉ {} tiến trình", table.len());
    assert!(
        table.exe_of(me).is_some(),
        "không thấy chính tiến trình test trong bảng"
    );
    assert!(table.parent_of(me).is_some_and(|p| p != 0));
    // Mức tiếng thật của loa: máy có thiết bị phát thì Ok, không có thì Err; không panic dù thế nào. Gọi nhiều lần.
    let mut ok = 0;
    for _ in 0..5 {
        match audio_capture::windows::output_levels() {
            Ok(l) => {
                ok += 1;
                println!("output_levels Ok: loa {:.3}, {} phiên", l.device_peak, l.sessions.len());
                assert!((0.0..=1.0).contains(&l.device_peak) || l.device_peak.is_nan());
            }
            Err(e) => println!("output_levels Err (máy không có thiết bị phát?): {e}"),
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    println!("output_levels Ok {ok}/5");
}
