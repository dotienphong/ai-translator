//! Mô phỏng từ đầu tới cuối của gợi ý bật dịch (spec 2026-11-01-goi-y-bat-dich-khi-hop §8) cho Teams, Zoom và Google Meet (Chrome, Edge):
//! cây tiến trình, phiên âm thanh, cửa sổ và tiêu đề như trên máy Windows thật, đưa qua `Probe` rồi `Hint` mỗi 500 ms, đúng như vòng lấy
//! mẫu của app. Kèm các trường hợp **không** được gợi ý, và một test ngẫu nhiên kiểm các bất biến an toàn.
//!
//! Không thay được lần thử trên máy thật (hàm Win32 nằm sau trait và không chạy ở đây): công cụ `hint_probe` (examples) làm việc đó.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::indexing_slicing, clippy::panic)]

use std::path::Path;
use std::time::Instant;

use meeting_scan::hint::{Action, Hint, HintApp, SAMPLE_EVERY, Tick};
use meeting_scan::probe::Probe;
use meeting_scan::procmap::{Levels, ProcTable};
use meeting_scan::winscan::{Desktop, RawWindow};
use speaker_recipe::{Recipes, parse};

// ---------------------------------------------------------------- máy giả

#[derive(Clone)]
struct Win {
    id: isize,
    pid: u32,
    exe: &'static str,
    title: String,
}

/// Một trạng thái của máy tại một thời điểm: cửa sổ, cây tiến trình, mức tiếng của từng phiên và của loa.
#[derive(Clone, Default)]
struct World {
    windows: Vec<Win>,
    table: ProcTable,
    sessions: Vec<(u32, f32)>,
    device_peak: f32,
}

impl Desktop for World {
    fn top_windows(&mut self) -> Vec<RawWindow> {
        self.windows
            .iter()
            .map(|w| RawWindow { id: w.id, pid: w.pid })
            .collect()
    }
    fn exe_path(&mut self, pid: u32) -> Option<String> {
        self.windows
            .iter()
            .find(|w| w.pid == pid)
            .map(|w| format!("C:\\Apps\\{}", w.exe))
    }
    fn title(&mut self, id: isize) -> String {
        self.windows
            .iter()
            .find(|w| w.id == id)
            .map(|w| w.title.clone())
            .unwrap_or_default()
    }
    fn class_name(&mut self, _id: isize) -> String {
        "Chrome_WidgetWin_1".into()
    }
}

fn recipes() -> Recipes {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../scripts/speaker-recipes/fixtures");
    let read = |name: &str| std::fs::read_to_string(dir.join(name)).unwrap();
    let teams: serde_json::Value = serde_json::from_str(&read("teams-windows.recipes.json")).unwrap();
    let meet: serde_json::Value = serde_json::from_str(&read("meet-windows.recipes.json")).unwrap();
    let mut apps = teams["apps"].as_array().unwrap().clone();
    apps.extend(meet["apps"].as_array().unwrap().iter().cloned());
    let json = serde_json::json!({"schema": 1, "version": 1, "min_app_version": "0.3.2", "apps": apps});
    parse(&json.to_string()).unwrap()
}

/// Vòng lấy mẫu của app: `Probe` rồi `Hint`, mỗi 500 ms.
struct Sim {
    probe: Probe,
    hint: Hint,
    recipes: Option<Recipes>,
    t0: Instant,
    n: u32,
    idle: bool,
    enabled: bool,
    ignored: Vec<HintApp>,
}

impl Sim {
    fn new() -> Self {
        Sim {
            probe: Probe::default(),
            hint: Hint::new(),
            recipes: Some(recipes()),
            t0: Instant::now(),
            n: 0,
            idle: true,
            enabled: true,
            ignored: Vec::new(),
        }
    }

    fn secs(&self) -> f32 {
        self.n as f32 * 0.5
    }

    fn step(&mut self, world: &World) -> Action {
        let now = self.t0 + SAMPLE_EVERY * self.n;
        self.n += 1;
        let obs = if self.enabled && self.idle {
            let levels = Levels {
                sessions: world.sessions.clone(),
                device_peak: world.device_peak,
            };
            let mut desktop = world.clone();
            self.probe
                .observe(&mut desktop, self.recipes.as_ref(), &levels, &world.table, now)
        } else {
            Default::default()
        };
        self.hint.tick(&Tick {
            now,
            enabled: self.enabled,
            idle: self.idle,
            ignored: &self.ignored,
            present: &obs.present,
            sound: &obs.sound,
        })
    }

    /// Chạy `secs` giây với `world(t)` (t là giây từ lúc bắt đầu lần chạy này). Trả mọi hành động khác `None`, kèm giây tuyệt đối.
    fn run(&mut self, secs: f32, world: impl Fn(f32) -> World) -> Vec<(f32, Action)> {
        let start = self.secs();
        let mut out = Vec::new();
        while self.secs() - start < secs {
            let w = world(self.secs() - start);
            let action = self.step(&w);
            if action != Action::None {
                out.push((self.secs(), action));
            }
        }
        out
    }
}

// ---------------------------------------------------------------- các máy mẫu

fn explorer(t: &mut ProcTable) {
    t.insert(4, 0, "System");
    t.insert(100, 4, "explorer.exe");
}

/// Tiếng người nói trong cuộc họp: cứ 10 lần lấy mẫu thì `quiet` lần im (nghỉ giữa các câu).
fn speech(tick: u32, quiet: u32) -> f32 {
    if tick % 10 < quiet { 0.0 } else { 0.25 }
}

fn tick_of(t: f32) -> u32 {
    (t * 2.0) as u32
}

/// Teams mới: app `ms-teams.exe`, tiếng phát từ tiến trình WebView2 con.
fn teams_new(t: f32, quiet: u32, title: &str) -> World {
    let mut table = ProcTable::default();
    explorer(&mut table);
    table.insert(200, 100, "ms-teams.exe");
    table.insert(201, 200, "msedgewebview2.exe");
    table.insert(202, 201, "msedgewebview2.exe");
    let peak = speech(tick_of(t), quiet);
    World {
        windows: vec![Win {
            id: 1,
            pid: 200,
            exe: "ms-teams.exe",
            title: title.into(),
        }],
        table,
        sessions: vec![(202, peak)],
        device_peak: peak,
    }
}

fn zoom(t: f32, quiet: u32, session_pid: u32) -> World {
    let mut table = ProcTable::default();
    explorer(&mut table);
    table.insert(300, 100, "Zoom.exe");
    table.insert(301, 300, "CptHost.exe");
    let peak = speech(tick_of(t), quiet);
    World {
        windows: vec![Win {
            id: 2,
            pid: 300,
            exe: "Zoom.exe",
            title: "Zoom Meeting".into(),
        }],
        table,
        sessions: vec![(session_pid, peak)],
        device_peak: peak,
    }
}

/// Meet trong trình duyệt `exe` (chrome.exe hay msedge.exe): cửa sổ chính (pid 400) và tiến trình dịch vụ âm thanh (pid 401).
fn meet(t: f32, quiet: u32, exe: &'static str, title: &str) -> World {
    let mut table = ProcTable::default();
    explorer(&mut table);
    table.insert(400, 100, exe);
    table.insert(401, 400, exe);
    let peak = speech(tick_of(t), quiet);
    World {
        windows: vec![Win {
            id: 5,
            pid: 400,
            exe,
            title: title.into(),
        }],
        table,
        sessions: vec![(401, peak)],
        device_peak: peak,
    }
}

const MEET_TITLE: &str = "Meet - abc-defg-hij - Google Chrome";
const TEAMS_CALL: &str = "Meeting with Hoa Phạm | Microsoft Teams";

fn shows(events: &[(f32, Action)]) -> Vec<(f32, HintApp)> {
    events
        .iter()
        .filter_map(|(t, a)| {
            if let Action::Show(app) = a {
                Some((*t, *app))
            } else {
                None
            }
        })
        .collect()
}

fn assert_shows_once(events: &[(f32, Action)], app: HintApp) {
    let s = shows(events);
    assert_eq!(s.len(), 1, "{events:?}");
    assert_eq!(s[0].1, app);
    assert!((4.5..=6.5).contains(&s[0].0), "hiện lúc {}s: {events:?}", s[0].0);
}

// ---------------------------------------------------------------- Teams

#[test]
fn teams_new_call_shows_after_five_seconds() {
    let mut sim = Sim::new();
    let events = sim.run(30.0, |t| teams_new(t, 2, TEAMS_CALL));
    assert_shows_once(&events, HintApp::Teams);
}

#[test]
fn teams_named_meeting_shows_even_when_the_title_is_not_a_known_call_title() {
    // Cuộc họp có tên tự đặt: tiêu đề không khớp công thức "Meeting with…", vẫn gợi ý nhờ phiên âm thanh gán về ms-teams.exe.
    let mut sim = Sim::new();
    let events = sim.run(30.0, |t| teams_new(t, 2, "Họp giao ban tuần | Microsoft Teams"));
    assert_shows_once(&events, HintApp::Teams);
}

#[test]
fn teams_window_hidden_in_the_tray_still_shows() {
    let mut sim = Sim::new();
    let events = sim.run(30.0, |t| World {
        windows: vec![],
        ..teams_new(t, 2, TEAMS_CALL)
    });
    assert_shows_once(&events, HintApp::Teams);
}

#[test]
fn teams_falls_back_to_the_device_sound_when_the_audio_process_cannot_be_mapped() {
    // Tiếng phát từ một tiến trình không nằm trong cây của Teams (ví dụ bản Teams lạ), nhưng có cuộc gọi: dự phòng.
    let mut sim = Sim::new();
    let events = sim.run(30.0, |t| {
        let mut w = teams_new(t, 2, TEAMS_CALL);
        w.sessions = vec![(999, speech(tick_of(t), 2))];
        w
    });
    assert_shows_once(&events, HintApp::Teams);
}

#[test]
fn teams_open_but_music_from_another_app_does_not_show() {
    let mut sim = Sim::new();
    let events = sim.run(120.0, |t| {
        let mut w = teams_new(t, 0, "Chat | Microsoft Teams");
        w.table.insert(500, 100, "Spotify.exe");
        w.sessions = vec![(500, 0.5)];
        w.device_peak = 0.5;
        w
    });
    assert!(shows(&events).is_empty(), "{events:?}");
}

#[test]
fn teams_notification_ping_does_not_show() {
    let mut sim = Sim::new();
    let events = sim.run(60.0, |t| {
        let mut w = teams_new(t, 0, "Chat | Microsoft Teams");
        // Tiếng "ting" ngắn một lần mỗi 20 giây.
        let ping = (t % 20.0) < 1.0;
        w.sessions = vec![(202, if ping { 0.4 } else { 0.0 })];
        w.device_peak = w.sessions[0].1;
        w
    });
    assert!(shows(&events).is_empty(), "{events:?}");
}

// ---------------------------------------------------------------- Zoom

#[test]
fn zoom_meeting_shows_with_sound_from_the_main_process() {
    let mut sim = Sim::new();
    let events = sim.run(30.0, |t| zoom(t, 2, 300));
    assert_shows_once(&events, HintApp::Zoom);
}

#[test]
fn zoom_meeting_shows_with_sound_from_a_helper_process() {
    let mut sim = Sim::new();
    let events = sim.run(30.0, |t| zoom(t, 2, 301));
    assert_shows_once(&events, HintApp::Zoom);
}

#[test]
fn zoom_idle_without_sound_does_not_show() {
    let mut sim = Sim::new();
    let events = sim.run(120.0, |t| zoom(t, 10, 300));
    assert!(shows(&events).is_empty(), "{events:?}");
}

// ---------------------------------------------------------------- Google Meet

#[test]
fn meet_in_chrome_shows_after_five_seconds() {
    let mut sim = Sim::new();
    let events = sim.run(30.0, |t| meet(t, 2, "chrome.exe", MEET_TITLE));
    assert_shows_once(&events, HintApp::Meet);
}

#[test]
fn meet_in_edge_shows_after_five_seconds() {
    let mut sim = Sim::new();
    let events = sim.run(30.0, |t| {
        meet(t, 2, "msedge.exe", "Meet - abc-defg-hij - Microsoft Edge")
    });
    assert_shows_once(&events, HintApp::Meet);
}

#[test]
fn meet_with_a_custom_meeting_name_in_the_title_shows() {
    let mut sim = Sim::new();
    let events = sim.run(30.0, |t| {
        meet(t, 2, "chrome.exe", "Meet \u{2013} Họp nhóm - Google Chrome")
    });
    assert_shows_once(&events, HintApp::Meet);
}

#[test]
fn youtube_in_chrome_never_shows() {
    let mut sim = Sim::new();
    let events = sim.run(300.0, |t| {
        meet(t, 0, "chrome.exe", "Nhạc hay nhất 2026 - YouTube - Google Chrome")
    });
    assert!(shows(&events).is_empty(), "{events:?}");
}

#[test]
fn meet_open_in_edge_while_youtube_plays_in_chrome_does_not_show() {
    // Meet mở ở Edge (im lặng), YouTube phát ở Chrome: tiếng là của Chrome.
    let mut sim = Sim::new();
    let events = sim.run(120.0, |_t| {
        let mut table = ProcTable::default();
        explorer(&mut table);
        table.insert(400, 100, "chrome.exe");
        table.insert(401, 400, "chrome.exe");
        table.insert(500, 100, "msedge.exe");
        World {
            windows: vec![
                Win {
                    id: 5,
                    pid: 400,
                    exe: "chrome.exe",
                    title: "Video - YouTube - Google Chrome".into(),
                },
                Win {
                    id: 6,
                    pid: 500,
                    exe: "msedge.exe",
                    title: "Meet - abc-defg-hij - Microsoft Edge".into(),
                },
            ],
            table,
            sessions: vec![(401, 0.5)],
            device_peak: 0.5,
        }
    });
    assert!(shows(&events).is_empty(), "{events:?}");
}

#[test]
fn a_gmail_tab_with_notification_sound_does_not_show() {
    let mut sim = Sim::new();
    let events = sim.run(60.0, |t| {
        let mut w = meet(t, 0, "chrome.exe", "Hộp thư - Gmail - Google Chrome");
        let ping = (t % 15.0) < 1.0;
        w.sessions = vec![(401, if ping { 0.5 } else { 0.0 })];
        w
    });
    assert!(shows(&events).is_empty(), "{events:?}");
}

#[test]
fn switching_to_another_tab_for_a_while_and_back_does_not_ask_twice() {
    let mut sim = Sim::new();
    let first = sim.run(15.0, |t| meet(t, 2, "chrome.exe", MEET_TITLE));
    assert_eq!(shows(&first).len(), 1);
    sim.hint.dismissed();
    // 30 giây ở tab khác (tiêu đề đổi), rồi quay lại tab Meet.
    let away = sim.run(30.0, |t| meet(t, 2, "chrome.exe", "Slide trình bày - Google Chrome"));
    assert!(shows(&away).is_empty(), "{away:?}");
    let back = sim.run(60.0, |t| meet(t, 2, "chrome.exe", MEET_TITLE));
    assert!(shows(&back).is_empty(), "{back:?}");
}

// ---------------------------------------------------------------- chung

#[test]
fn speech_with_pauses_still_shows_but_a_mostly_quiet_room_does_not() {
    // 3 giây nói, 1 giây nghỉ (80% đủ mẫu có tiếng trong khoảng 5 giây): vẫn hiện.
    let mut sim = Sim::new();
    let events = sim.run(60.0, |t| zoom(t, 2, 300));
    assert_eq!(shows(&events).len(), 1);
    // Nói 5 giây, im 5 giây (một nửa): không hiện.
    let mut sim = Sim::new();
    let events = sim.run(120.0, |t| zoom(t, 5, 300));
    assert!(shows(&events).is_empty(), "{events:?}");
}

#[test]
fn nothing_shows_while_translating_or_when_turned_off_or_for_an_ignored_app() {
    for case in 0..3 {
        let mut sim = Sim::new();
        match case {
            0 => sim.idle = false,
            1 => sim.enabled = false,
            _ => sim.ignored = vec![HintApp::Teams],
        }
        let events = sim.run(120.0, |t| teams_new(t, 2, TEAMS_CALL));
        assert!(shows(&events).is_empty(), "case {case}: {events:?}");
    }
}

#[test]
fn two_meetings_in_a_row_ask_twice_and_overlapping_apps_ask_one_at_a_time() {
    let mut sim = Sim::new();
    let a = sim.run(20.0, |t| zoom(t, 2, 300));
    assert_eq!(shows(&a).len(), 1);
    sim.hint.dismissed();
    // Zoom đóng, nghỉ hơn một phút, rồi họp Meet.
    let gap = sim.run(70.0, |_| World::default());
    assert!(shows(&gap).is_empty());
    let b = sim.run(20.0, |t| meet(t, 2, "chrome.exe", MEET_TITLE));
    assert_eq!(shows(&b).len(), 1);
    assert_eq!(shows(&b)[0].1, HintApp::Meet);
}

#[test]
fn an_empty_or_broken_machine_never_panics_or_shows() {
    // Không có tiến trình, không có cửa sổ, đỉnh âm thanh lạ (NaN, âm, vô cực).
    let mut sim = Sim::new();
    for peak in [f32::NAN, -1.0, f32::INFINITY, f32::NEG_INFINITY, 0.0] {
        let events = sim.run(10.0, |_| World {
            sessions: vec![(0, peak), (u32::MAX, peak)],
            device_peak: peak,
            ..World::default()
        });
        assert!(shows(&events).is_empty(), "{events:?}");
    }
}

// ---------------------------------------------------------------- ngẫu nhiên

/// Bộ sinh số giả ngẫu nhiên xác định (xorshift), để test lặp lại được.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
    fn chance(&mut self, percent: u64) -> bool {
        self.below(100) < percent
    }
}

/// Bất biến an toàn dưới mọi đầu vào: không panic; chỉ hiện khi bật, rảnh, app không bị tắt, app có mặt và có tiếng; không bao giờ hiện hai
/// cửa sổ cùng lúc; đóng ngay khi không còn cần.
#[test]
fn random_worlds_keep_the_invariants() {
    let exes = [
        "ms-teams.exe",
        "Zoom.exe",
        "chrome.exe",
        "msedge.exe",
        "notepad.exe",
        "Spotify.exe",
        "msedgewebview2.exe",
        "CptHost.exe",
    ];
    let titles = [
        "Meet - abc-defg-hij - Google Chrome",
        "Meeting with Hoa | Microsoft Teams",
        "Zoom Meeting",
        "YouTube - Google Chrome",
        "",
        "Meet",
        "Meetup",
        "Mật khẩu.txt - Notepad",
    ];
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut sim = Sim::new();
    let (mut shown_total, mut hidden_total) = (0u32, 0u32);
    let mut world = World::default();
    for step in 0..400_000u32 {
        // Mỗi 40 lần lấy mẫu (20 giây) đổi sang một thế giới ngẫu nhiên mới và giữ nó, để có lúc đủ 5 giây có tiếng.
        if step % 40 == 0 {
            sim.enabled = rng.chance(90);
            sim.idle = rng.chance(85);
            sim.ignored = HintApp::ALL.into_iter().filter(|_| rng.chance(10)).collect();
            world = World::default();
            for i in 0..rng.below(8) {
                let parent = if rng.chance(70) {
                    100 + rng.below(8) as u32
                } else {
                    rng.below(3) as u32
                };
                world
                    .table
                    .insert(100 + i as u32, parent, exes[rng.below(exes.len() as u64) as usize]);
            }
            for i in 0..rng.below(6) {
                let exe = exes[rng.below(exes.len() as u64) as usize];
                let title = titles[rng.below(titles.len() as u64) as usize];
                world.windows.push(Win {
                    id: i as isize,
                    pid: 100 + rng.below(8) as u32,
                    exe,
                    title: title.into(),
                });
            }
            let loud = rng.chance(75);
            let peak = if loud { 0.3 } else { 0.0 };
            for _ in 0..rng.below(4) {
                world.sessions.push((100 + rng.below(10) as u32, peak));
            }
            world.device_peak = peak;
        }
        let was_shown = sim.hint.shown();
        let action = sim.step(&world);
        match action {
            Action::Show(app) => {
                shown_total += 1;
                assert!(
                    sim.enabled && sim.idle,
                    "hiện khi không bật hay không rảnh (bước {step})"
                );
                assert!(!sim.ignored.contains(&app), "hiện cho app đã tắt (bước {step})");
                assert!(was_shown.is_none(), "hiện chồng lên cửa sổ đang hiện (bước {step})");
                assert_eq!(sim.hint.shown(), Some(app));
            }
            Action::Hide(_) => {
                hidden_total += 1;
                assert!(was_shown.is_some(), "đóng khi chưa hiện (bước {step})");
                assert!(sim.hint.shown().is_none());
            }
            Action::None => {}
        }
        if !sim.enabled || !sim.idle {
            assert!(sim.hint.shown().is_none(), "còn hiện khi không còn cần (bước {step})");
        }
        // Người dùng thỉnh thoảng bấm.
        if sim.hint.shown().is_some() && rng.chance(5) {
            if rng.chance(50) {
                sim.hint.accepted()
            } else {
                sim.hint.dismissed()
            }
        }
    }
    // Phải thật sự có hiện và đóng, kẻo test chạy suông.
    assert!(shown_total > 50, "chỉ hiện {shown_total} lần");
    assert!(hidden_total > 5, "chỉ đóng {hidden_total} lần");
}
