//! Test hành vi của app qua lệnh `invoke`, chạy bằng `MockRuntime` (không mở cửa sổ thật).

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tauri::{Listener, Manager};

use crate::actions;
use crate::errors;
use crate::events::{AUDIO_LEVEL, NOTICE, SUBTITLE_DELTA, SUBTITLE_UPSERT};
use crate::login_item::AgentStatus;
use crate::session::{self, StartOptions};
use crate::state::{AppState, SessionStatus};
use crate::test_support::{
    FakeAudio, FakeDeps, PrepareGate, invoke, last_saved, login_state, mock_app, mock_app_with, overlay_calls, window,
};

/// Ghi lại mọi payload của một sự kiện.
fn record(app: &tauri::App<tauri::test::MockRuntime>, event: &str) -> Arc<Mutex<Vec<Value>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    app.listen_any(event, move |e| {
        sink.lock().unwrap().push(serde_json::from_str(e.payload()).unwrap())
    });
    received
}

/// Chờ tới khi `ok` đúng, tối đa 10 giây.
fn wait_until(what: &str, ok: impl Fn() -> bool) {
    let started = Instant::now();
    while !ok() {
        assert!(started.elapsed() < Duration::from_secs(10), "chờ quá lâu: {what}");
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn overlay_starts_hidden_and_appears_when_a_session_starts() {
    let app = mock_app();
    let main = window(&app, "main");
    let status = invoke(&main, "get_app_status", json!({})).unwrap();
    assert_eq!(
        (status["session"].as_str(), status["overlayVisible"].as_bool()),
        (Some("idle"), Some(false))
    );
    assert!(overlay_calls(&app).is_empty());
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(
        (status["session"].as_str(), status["overlayVisible"].as_bool()),
        (Some("running"), Some(true))
    );
    assert_eq!(overlay_calls(&app), ["show"], "bắt đầu phiên thì hiện thanh phụ đề");
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(
        (status["session"].as_str(), status["overlayVisible"].as_bool()),
        (Some("idle"), Some(true)),
        "dừng phiên thì thanh phụ đề giữ nguyên"
    );
    assert_eq!(overlay_calls(&app), ["show"]);
}

#[test]
fn hide_show_and_lock_reach_the_overlay_window() {
    let app = mock_app();
    let main = window(&app, "main");
    let status = invoke(&main, "set_overlay_visible", json!({ "visible": true })).unwrap();
    assert_eq!(status["overlayVisible"], true);
    let status = invoke(&main, "set_overlay_visible", json!({ "visible": false })).unwrap();
    assert_eq!(status["overlayVisible"], false);
    let settings = invoke(&main, "set_overlay_locked", json!({ "locked": true })).unwrap();
    assert_eq!(settings["overlay"]["locked"], true);
    assert_eq!(
        last_saved(&app, "overlay").unwrap()["locked"],
        true,
        "khóa được ghi vào file"
    );
    invoke(&main, "set_overlay_locked", json!({ "locked": false })).unwrap();
    assert_eq!(
        overlay_calls(&app),
        ["show", "hide", "click_through on", "click_through off"],
        "khóa và mở khóa không tự hiện hay ẩn thanh phụ đề"
    );
}

#[test]
fn blocked_quit_shows_a_notice_in_the_main_window() {
    let app = mock_app();
    let _main = window(&app, "main");
    let received = notices(&app);
    actions::quit_blocked(app.handle());
    assert_eq!(*received.lock().unwrap(), [r#"{"kind":"quitFromTray"}"#]);
}

fn notices(app: &tauri::App<tauri::test::MockRuntime>) -> Arc<Mutex<Vec<String>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    app.listen_any(NOTICE, move |event| {
        sink.lock().unwrap().push(event.payload().to_string())
    });
    received
}

#[test]
fn enabling_launch_at_login_blocked_in_login_items_shows_a_notice() {
    let app = mock_app();
    let main = window(&app, "main");
    let received = notices(&app);
    login_state(&app, |s| s.status = Some(AgentStatus::RequiresApproval));
    let settings = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": true } })).unwrap();
    assert_eq!(settings["launchAtLogin"], true);
    assert_eq!(*received.lock().unwrap(), [r#"{"kind":"loginItemsApproval"}"#]);
}

#[test]
fn turning_off_launch_at_login_works_and_reports_when_it_stays_on() {
    let app = mock_app();
    let main = window(&app, "main");
    let registered = |app: &tauri::App<tauri::test::MockRuntime>| {
        let mut value = false;
        login_state(app, |s| value = s.registered);
        value
    };
    let settings = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": true } })).unwrap();
    assert_eq!(settings["launchAtLogin"], true);
    assert!(registered(&app), "bật thì gọi `enable()`");
    let settings = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": false } })).unwrap();
    assert_eq!(settings["launchAtLogin"], false);
    assert!(!registered(&app), "tắt bình thường thì hết đăng ký");
    invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": true } })).unwrap();
    // Windows: mục ở `HKLM` không xóa được khi không có quyền admin.
    login_state(&app, |s| s.stuck_on = true);
    let error = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": false } })).unwrap_err();
    assert!(error.contains("autostartStillEnabled"), "{error}");
    let settings = invoke(&main, "get_settings", json!({})).unwrap();
    assert_eq!(settings["launchAtLogin"], true, "cài đặt giữ đúng trạng thái thật");
}

#[test]
fn startup_follows_the_system_when_login_items_turned_it_off() {
    let app = mock_app();
    login_state(&app, |s| {
        s.registered = true;
        s.status = Some(AgentStatus::RequiresApproval);
    });
    let mut settings = crate::settings::Settings::defaults(crate::settings::UiLanguage::Vi);
    settings.launch_at_login = true;
    assert!(actions::sync_launch_at_login(app.handle(), &mut settings));
    assert!(!settings.launch_at_login);
}

#[test]
fn a_session_turns_speech_into_subtitle_events() {
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let main = window(&app, "main");
    let (upserts, deltas, levels) = (
        record(&app, SUBTITLE_UPSERT),
        record(&app, SUBTITLE_DELTA),
        record(&app, AUDIO_LEVEL),
    );
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "running");
    wait_until("một phụ đề dịch xong", || {
        upserts.lock().unwrap().iter().any(|s| s["status"] == "done")
    });
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "idle");

    let upserts = upserts.lock().unwrap();
    let done = upserts.iter().find(|s| s["status"] == "done").unwrap();
    assert_eq!(
        (&done["src_lang"], &done["src_text"], &done["tgt_text"]),
        (&json!("en"), &json!("Hello everyone."), &json!("Xin chào mọi người."))
    );
    assert!(
        done["id"].as_u64().unwrap() >= 1_000_000,
        "id của phiên thứ nhất bắt đầu từ 1 000 000: {done}"
    );
    let id = done["id"].clone();
    assert!(
        deltas.lock().unwrap().iter().any(|d| d["id"] == id),
        "chữ dịch tới dần qua subtitle://delta"
    );
    assert!(!levels.lock().unwrap().is_empty(), "có mức âm lượng cho giao diện");
}

#[test]
fn a_failed_start_reports_its_error_code() {
    let app = mock_app_with(FakeDeps {
        prepare_error: Some(errors::MODEL_MISSING),
        ..FakeDeps::default()
    });
    let main = window(&app, "main");
    let result = invoke(&main, "toggle_session", json!({}));
    assert!(
        matches!(&result, Err(message) if message.contains(errors::MODEL_MISSING)),
        "{result:?}"
    );
    let status = invoke(&main, "get_app_status", json!({})).unwrap();
    assert_eq!(
        (&status["session"], &status["sessionError"]),
        (&json!("error"), &json!(errors::MODEL_MISSING))
    );
}

/// Lỗi tới sau khi phiên đã chạy (nguồn âm thanh chưa có quyền, `asr-worker` bỏ cuộc): phiên dừng, trạng thái lỗi.
#[test]
fn errors_after_the_start_stop_the_session_with_their_code() {
    let cases = [
        (
            FakeDeps {
                capture_error: Some(errors::AUDIO_PERMISSION),
                ..FakeDeps::default()
            },
            errors::AUDIO_PERMISSION,
        ),
        (
            FakeDeps {
                audio: FakeAudio::Tone,
                asr_unavailable: true,
                ..FakeDeps::default()
            },
            errors::SIDECAR_FAILED,
        ),
    ];
    for (deps, code) in cases {
        let app = mock_app_with(deps);
        let main = window(&app, "main");
        invoke(&main, "toggle_session", json!({})).unwrap();
        let state = app.state::<AppState>();
        wait_until(code, || state.status().session == SessionStatus::Error);
        assert_eq!(state.status().session_error.as_deref(), Some(code));
        let status = invoke(&main, "toggle_session", json!({})).unwrap();
        assert_ne!(status["session"], "error", "bấm Bắt đầu lại thì thử lại");
    }
}

/// Bước "Nghe thử" của kế hoạch 03 (Đ16): phiên mở nguồn âm thanh có thu cả âm thanh của chính app; phiên thường thì không.
#[test]
fn a_listening_test_session_also_captures_the_app_itself() {
    let deps = FakeDeps::default();
    let captures = deps.captures.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    session::start_with(app.handle(), StartOptions { include_self: true }).unwrap();
    session::stop(app.handle());
    session::start(app.handle()).unwrap();
    session::stop(app.handle());
    assert_eq!(*captures.lock().unwrap(), [true, false]);
}

/// App giả có `prepare` chặn ở cổng (như nạp model lâu), và một lần bắt đầu phiên đang chờ ở đó trên luồng riêng.
struct StartingApp {
    app: tauri::App<tauri::test::MockRuntime>,
    gate: Arc<PrepareGate>,
    /// Các lần gọi `shutdown` và `kill_all` của phần bên ngoài giả.
    shutdowns: Arc<Mutex<Vec<&'static str>>>,
    /// Các lần mở nguồn âm thanh (`include_self` của từng lần).
    captures: Arc<Mutex<Vec<bool>>>,
    starting: std::thread::JoinHandle<Result<crate::state::AppStatus, crate::errors::CommandError>>,
}

fn starting_app() -> StartingApp {
    let gate = Arc::new(PrepareGate::default());
    let deps = FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    };
    let shutdowns = deps.shutdowns.clone();
    let captures = deps.captures.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    let handle = app.handle().clone();
    let starting = std::thread::spawn(move || session::start(&handle));
    wait_until("đang chờ nạp model", || gate.waiting() == 1);
    assert_eq!(app.state::<AppState>().status().session, SessionStatus::Starting);
    StartingApp {
        app,
        gate,
        shutdowns,
        captures,
        starting,
    }
}

/// Q1 của review 02c: bấm lần nữa lúc đang chuẩn bị là Hủy: về `idle` ngay, không chờ nạp model; lần bắt đầu đang dở
/// không chạy phiên khi nạp xong.
#[test]
fn cancel_while_starting_returns_to_idle_at_once() {
    let StartingApp {
        app,
        gate,
        starting,
        captures,
        ..
    } = starting_app();
    let started = Instant::now();
    let status = session::toggle(app.handle()).unwrap();
    assert!(started.elapsed() < Duration::from_secs(1));
    assert_eq!(status.session, SessionStatus::Idle);
    gate.open();
    let after = starting.join().unwrap().unwrap();
    assert_eq!(after.session, SessionStatus::Idle);
    assert!(!app.state::<session::Session>().has_engine(), "không có phiên nào chạy");
    assert_eq!(app.state::<AppState>().status().session, SessionStatus::Idle);
    assert!(
        captures.lock().unwrap().is_empty(),
        "lần đã hủy không mở nguồn âm thanh"
    );
}

/// Q-E của review 02 lần 2: Hủy rồi bấm Bắt đầu lại trong lúc lần đã hủy còn đang chờ nạp model. Lần mới hiện `starting`
/// ngay (không chờ lần cũ nạp xong); khi nạp xong, chỉ lần mới chạy phiên.
#[test]
fn start_again_after_cancel_responds_at_once() {
    let StartingApp {
        app,
        gate,
        starting,
        captures,
        ..
    } = starting_app();
    assert_eq!(session::toggle(app.handle()).unwrap().session, SessionStatus::Idle);
    let handle = app.handle().clone();
    let again = std::thread::spawn(move || session::toggle(&handle));
    wait_until("lần bắt đầu mới hiện starting", || {
        app.state::<AppState>().status().session == SessionStatus::Starting
    });
    wait_until("cả hai lần đều đang chờ nạp model", || gate.waiting() == 2);
    gate.open();
    let _ = starting.join().unwrap().unwrap(); // lần đã hủy trả về mà không chạy phiên
    let status = again.join().unwrap().unwrap();
    assert_eq!(status.session, SessionStatus::Running);
    assert!(app.state::<session::Session>().has_engine());
    assert_eq!(captures.lock().unwrap().len(), 1, "chỉ lần mới mở nguồn âm thanh");
    session::stop(app.handle());
}

/// Nhỏ-7 của review 02 lần 3: Hủy, rồi lần đã hủy nạp lỗi. Sự kiện tới muộn của tiến trình phụ đã đặt lại "Đang nạp
/// model"; khi lần đó kết thúc, chỉ báo được bỏ, trạng thái vẫn `idle`, không báo lỗi.
#[test]
fn a_cancelled_start_that_fails_clears_the_loading_note() {
    let gate = Arc::new(PrepareGate::default());
    let app = mock_app_with(FakeDeps {
        prepare_gate: Some(gate.clone()),
        prepare_error: Some(errors::MODEL_MISSING),
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    let handle = app.handle().clone();
    let starting = std::thread::spawn(move || session::start(&handle));
    wait_until("đang chờ nạp model", || gate.waiting() == 1);
    assert_eq!(session::toggle(app.handle()).unwrap().session, SessionStatus::Idle);
    let state = app.state::<AppState>();
    state.update_status(|s| s.loading = Some(crate::state::Loading::Model));
    gate.open();
    let result = starting.join().unwrap();
    assert!(result.is_ok(), "lần đã hủy không báo lỗi: {result:?}");
    let status = state.status();
    assert_eq!((status.session, status.loading), (SessionStatus::Idle, None));
}

/// R3-1 của review 02 lần 3: bấm Bắt đầu thì cho tiến trình phụ đã bỏ cuộc thử lại, trước khi chuẩn bị; chạy sẵn khi mở
/// cửa sổ chính thì không.
#[test]
fn a_user_start_allows_a_retry_before_preparing_and_prewarm_does_not() {
    let deps = FakeDeps::default();
    let calls = deps.calls.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    session::prewarm(app.handle());
    wait_until("chạy sẵn xong", || !calls.lock().unwrap().is_empty());
    assert_eq!(*calls.lock().unwrap(), ["prepare"]);
    session::toggle(app.handle()).unwrap();
    assert_eq!(*calls.lock().unwrap(), ["prepare", "allow_retry", "prepare"]);
    session::stop(app.handle());
}

/// Chỗ nối của kế hoạch 06: hạn mức còn 0 thì không bắt đầu phiên (không chuẩn bị tiến trình phụ), trạng thái ra lỗi
/// `quotaExhausted`.
#[test]
fn an_exhausted_quota_refuses_to_start() {
    let deps = FakeDeps {
        quota_exhausted: true,
        ..FakeDeps::default()
    };
    let prepares = deps.prepares.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    let err = session::toggle(app.handle()).unwrap_err();
    assert_eq!(err.code, errors::QUOTA_EXHAUSTED);
    let status = app.state::<AppState>().status();
    assert_eq!(
        (status.session, status.session_error.as_deref()),
        (SessionStatus::Error, Some(errors::QUOTA_EXHAUSTED))
    );
    assert_eq!(*prepares.lock().unwrap(), 0);
}

/// N1 của review 02c: thoát app lúc đang chờ nạp model trả về ngay (không chờ 60–180 giây).
#[test]
fn shutdown_while_preparing_returns_quickly() {
    let StartingApp {
        app,
        shutdowns,
        starting,
        ..
    } = starting_app();
    let started = Instant::now();
    session::shutdown(app.handle());
    assert!(started.elapsed() < Duration::from_secs(1), "{:?}", started.elapsed());
    assert_eq!(*shutdowns.lock().unwrap(), ["shutdown", "kill_all"]);
    let result = starting.join().unwrap();
    assert!(result.is_ok(), "lần bắt đầu bị hủy, không báo lỗi: {result:?}");
    assert!(!app.state::<session::Session>().has_engine());
}

/// Lỗi của một phiên cũ tới muộn (nguồn âm thanh của phiên trước) không dừng phiên mới.
#[test]
fn a_late_error_of_an_old_session_does_not_touch_the_new_one() {
    let deps = FakeDeps::default();
    let events = deps.capture_events.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    session::start(app.handle()).unwrap();
    session::stop(app.handle());
    session::start(app.handle()).unwrap();
    let old = events.lock().unwrap().remove(0);
    old(crate::capture::CaptureEvent::Failed {
        code: errors::CAPTURE_FAILED,
        message: "phiên cũ".into(),
    });
    old(crate::capture::CaptureEvent::PermissionSuspected(true));
    std::thread::sleep(Duration::from_millis(300));
    let status = app.state::<AppState>().status();
    assert_eq!(
        (status.session, status.session_error, status.permission_suspected),
        (SessionStatus::Running, None, false)
    );
    old(crate::capture::CaptureEvent::WaitingForApp(true));
    assert!(!app.state::<AppState>().status().waiting_for_app);
    // Lỗi của chính phiên đang chạy thì dừng phiên; chỉ báo của nó thì hiện.
    let current = events.lock().unwrap().remove(0);
    current(crate::capture::CaptureEvent::PermissionSuspected(true));
    assert!(app.state::<AppState>().status().permission_suspected);
    current(crate::capture::CaptureEvent::WaitingForApp(true));
    assert!(app.state::<AppState>().status().waiting_for_app);
    current(crate::capture::CaptureEvent::WaitingForApp(false));
    assert!(!app.state::<AppState>().status().waiting_for_app);
    current(crate::capture::CaptureEvent::Failed {
        code: errors::CAPTURE_FAILED,
        message: "phiên này".into(),
    });
    let state = app.state::<AppState>();
    wait_until("phiên dừng vì lỗi", || {
        state.status().session == SessionStatus::Error
    });
    assert_eq!(state.status().session_error.as_deref(), Some(errors::CAPTURE_FAILED));
}

/// Bấm Bắt đầu từ ba nơi cùng lúc (nút, phím tắt, khay) trong lúc đang nạp model: kết quả cuối nhất quán, không kẹt ở
/// `starting`, và có engine khi và chỉ khi trạng thái là `running`.
#[test]
fn toggling_from_three_threads_ends_in_a_consistent_state() {
    let gate = Arc::new(PrepareGate::default());
    let app = mock_app_with(FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    let toggles: Vec<_> = (0..3)
        .map(|_| {
            let handle = app.handle().clone();
            std::thread::spawn(move || session::toggle(&handle))
        })
        .collect();
    std::thread::sleep(Duration::from_millis(100));
    gate.open();
    for t in toggles {
        t.join().unwrap().unwrap();
    }
    let status = app.state::<AppState>().status();
    assert_ne!(status.session, SessionStatus::Starting);
    assert_eq!(
        status.session == SessionStatus::Running,
        app.state::<session::Session>().has_engine()
    );
    session::stop(app.handle());
}

/// Trạng thái có `rev` tăng dần, để giao diện bỏ kết quả cũ tới muộn.
#[test]
fn the_status_revision_grows_with_every_change() {
    let app = mock_app();
    let main = window(&app, "main");
    let before = invoke(&main, "get_app_status", json!({})).unwrap()["rev"]
        .as_u64()
        .unwrap();
    let running = invoke(&main, "toggle_session", json!({})).unwrap()["rev"]
        .as_u64()
        .unwrap();
    let idle = invoke(&main, "toggle_session", json!({})).unwrap()["rev"]
        .as_u64()
        .unwrap();
    assert!(before < running && running < idle, "{before} {running} {idle}");
}
