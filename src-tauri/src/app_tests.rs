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
    FakeAudio, FakeDeps, PrepareGate, invoke, last_saved, login_state, mock_app, mock_app_with, overlay_calls, set_pro,
    window,
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

/// N3 của review cuối 02: đang có một lần chạy sẵn chờ nạp model thì mở lại cửa sổ chính không tạo thêm luồng `prewarm`.
#[test]
fn reopening_the_main_window_while_prewarming_does_not_prepare_again() {
    let gate = Arc::new(PrepareGate::default());
    let deps = FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    };
    let prepares = deps.prepares.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    session::prewarm(app.handle());
    wait_until("lần chạy sẵn đầu đang chờ", || gate.waiting() == 1);
    session::prewarm(app.handle());
    session::prewarm(app.handle());
    std::thread::sleep(Duration::from_millis(200));
    assert_eq!(*prepares.lock().unwrap(), 1, "không chạy sẵn trùng");
    gate.open();
    let session = app.state::<session::Session>();
    wait_until("lần chạy sẵn đầu xong", || !session.is_prewarming());
    session::prewarm(app.handle());
    wait_until("lần chạy sẵn sau", || !session.is_prewarming());
    assert_eq!(*prepares.lock().unwrap(), 2, "xong rồi thì chạy lại được");
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

/// Bản chép lời của phiên nằm trong bộ nhớ (§6.6): đủ các câu, chữ dịch đầy đủ; dừng phiên thì có giờ kết thúc; phiên sau
/// bắt đầu với bản mới.
#[test]
fn a_session_keeps_its_transcript_in_memory() {
    use crate::transcript::store::TranscriptStore;
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    let store = app.state::<TranscriptStore>();
    session::start(app.handle()).unwrap();
    wait_until("một câu dịch xong", || {
        store
            .snapshot()
            .lines
            .iter()
            .any(|l| l.tgt_text == "Xin chào mọi người.")
    });
    assert_eq!(store.snapshot().ended_at, None);
    session::stop(app.handle());
    let t = store.snapshot();
    assert_eq!((t.session, t.target_lang.as_str()), (1, "vi"));
    assert!(t.started_at > 1_700_000_000_000, "giờ Unix ms: {}", t.started_at);
    assert!(t.ended_at.is_some_and(|end| end >= t.started_at));
    assert!(t.lines.iter().all(|l| l.src_text == "Hello everyone."));
    session::start(app.handle()).unwrap();
    assert_eq!(store.snapshot().session, 2);
    assert_eq!(store.snapshot().ended_at, None);
    session::stop(app.handle());
}

/// Lịch sử (F4): phiên dừng thì được lưu chỉ khi bật "Lưu lịch sử" và là Pro; mặc định tắt nên không lưu gì.
#[test]
fn a_stopped_session_is_saved_only_with_save_history_on_and_pro() {
    use crate::transcript::history;
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let main = window(&app, "main");
    let run_session = || {
        let store = app.state::<crate::transcript::store::TranscriptStore>();
        session::start(app.handle()).unwrap();
        wait_until("một câu dịch xong", || {
            store.snapshot().lines.iter().any(|l| !l.tgt_text.is_empty())
        });
        session::stop(app.handle());
    };
    let saved = || crate::db::with(app.handle(), |c| history::list(c)).unwrap().len();
    run_session();
    assert_eq!(saved(), 0, "lưu lịch sử mặc định tắt");
    invoke(&main, "update_settings", json!({ "patch": { "saveHistory": true } })).unwrap();
    run_session();
    assert_eq!(saved(), 1);
    let list = crate::db::with(app.handle(), |c| history::list(c)).unwrap();
    assert_eq!(list[0].preview, "Hello everyone.");
    set_pro(&app, false);
    run_session();
    assert_eq!(saved(), 1, "gói Free không lưu");
}

/// Chạy một phiên có lưu lịch sử tới khi có một câu dịch xong; phiên vẫn chạy khi hàm trả về.
fn running_session_with_history() -> tauri::App<tauri::test::MockRuntime> {
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let main = window(&app, "main");
    invoke(&main, "update_settings", json!({ "patch": { "saveHistory": true } })).unwrap();
    session::start(app.handle()).unwrap();
    let store = app.state::<crate::transcript::store::TranscriptStore>();
    wait_until("một câu dịch xong", || {
        store.snapshot().lines.iter().any(|l| !l.tgt_text.is_empty())
    });
    app
}

fn saved_sessions(app: &tauri::App<tauri::test::MockRuntime>) -> usize {
    crate::db::with(app.handle(), |c| crate::transcript::history::list(c))
        .unwrap()
        .len()
}

/// Q3 của review 03: Thoát ở menu khay (`session::shutdown`) lưu phiên đang chạy vào lịch sử, như khi bấm Dừng (§4.3).
/// `RunEvent::Exit` tới sau đó không lưu lần nữa.
#[test]
fn quitting_saves_the_running_session_to_history() {
    let app = running_session_with_history();
    session::shutdown(app.handle());
    assert_eq!(saved_sessions(&app), 1);
    session::save_on_exit(app.handle());
    assert_eq!(saved_sessions(&app), 1, "không lưu hai lần");
}

/// Q3 của review 03: app thoát không qua menu khay (máy tắt, đăng xuất, app tự khởi động lại để cập nhật) thì
/// `RunEvent::Exit` gọi `crate::on_exit`: kill tiến trình phụ rồi lưu phiên đang chạy vào lịch sử, không chờ engine dừng
/// (N-A của review 03 lần 2: test đi qua đúng hàm mà `RunEvent::Exit` gọi).
#[test]
fn the_exit_event_saves_the_running_session_to_history() {
    use std::sync::atomic::{AtomicBool, Ordering};
    static KILLED: AtomicBool = AtomicBool::new(false);
    fn fake_kill_all() {
        KILLED.store(true, Ordering::SeqCst);
    }
    let app = running_session_with_history();
    crate::on_exit(app.handle(), fake_kill_all);
    assert!(KILLED.load(Ordering::SeqCst), "kill tiến trình phụ còn sót");
    assert_eq!(saved_sessions(&app), 1);
    crate::on_exit(app.handle(), fake_kill_all);
    session::stop(app.handle());
    assert_eq!(saved_sessions(&app), 1, "không lưu hai lần");
}

/// App giả đã chạy xong một phiên có câu dịch (lưu lịch sử bật hay tắt theo `save_history`).
fn app_after_one_session(save_history: bool) -> tauri::App<tauri::test::MockRuntime> {
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let main = window(&app, "main");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "saveHistory": save_history } }),
    )
    .unwrap();
    let store = app.state::<crate::transcript::store::TranscriptStore>();
    session::start(app.handle()).unwrap();
    wait_until("một câu dịch xong", || {
        store
            .snapshot()
            .lines
            .iter()
            .any(|l| l.status == pipeline::subtitle::Status::Done)
    });
    session::stop(app.handle());
    app
}

/// File chọn để nhập lớn hơn 1 MiB thì từ chối (`fileTooLarge`), đúng 1 MiB thì đọc được (M05 của review 03).
#[test]
fn files_larger_than_1_mib_are_not_read() {
    use crate::test_support::FakePicker;
    let app = mock_app();
    let picker = app.state::<FakePicker>();
    let dir = picker.dir.lock().unwrap().clone();
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("big.csv");
    *picker.to_open.lock().unwrap() = Some(path.clone());
    std::fs::write(&path, vec![b'a'; crate::files::MAX_IMPORT_BYTES as usize]).unwrap();
    let read = crate::files::open_bytes(app.handle(), crate::files::CSV)
        .unwrap()
        .unwrap();
    assert_eq!(read.len() as u64, crate::files::MAX_IMPORT_BYTES);
    std::fs::write(&path, vec![b'a'; crate::files::MAX_IMPORT_BYTES as usize + 1]).unwrap();
    let refused = crate::files::open_bytes(app.handle(), crate::files::CSV).unwrap_err();
    assert_eq!(refused.code, errors::FILE_TOO_LARGE);
}

/// Bản chép lời (F4): xem và sao chép ở mọi gói; xuất file là Pro, ghi đúng định dạng vào chỗ người dùng chọn.
#[test]
fn the_transcript_can_be_read_copied_and_exported() {
    use crate::test_support::FakePicker;
    let app = app_after_one_session(false);
    let main = window(&app, "main");
    let t = invoke(&main, "get_transcript", json!({})).unwrap();
    assert!(
        t["lines"]
            .as_array()
            .unwrap()
            .iter()
            .any(|l| l["tgt_text"] == "Xin chào mọi người.")
    );
    assert!(t["startedAt"].as_u64().is_some() && t["endedAt"].as_u64().is_some());
    let current = json!({ "kind": "current" });
    let text = invoke(
        &main,
        "transcript_text",
        json!({ "source": current, "utcOffsetMinutes": 420 }),
    )
    .unwrap();
    let text = text.as_str().unwrap();
    assert!(text.contains("] Hello everyone.\n→ Xin chào mọi người.\n"), "{text}");

    let export = |format: &str| {
        invoke(
            &main,
            "export_transcript",
            json!({ "source": current, "format": format, "srtText": "translation", "utcOffsetMinutes": 0 }),
        )
    };
    // N4 của review 03: độ lệch múi giờ ngoài ±18 giờ là dữ liệu hỏng.
    for bad in [1081, -1081] {
        let refused = invoke(
            &main,
            "transcript_text",
            json!({ "source": current, "utcOffsetMinutes": bad }),
        )
        .unwrap_err();
        assert!(refused.contains("outOfRange"), "{refused}");
        let refused = invoke(
            &main,
            "export_transcript",
            json!({ "source": current, "format": "txt", "srtText": "translation", "utcOffsetMinutes": bad }),
        )
        .unwrap_err();
        assert!(refused.contains("outOfRange"), "{refused}");
    }
    assert!(
        invoke(
            &main,
            "transcript_text",
            json!({ "source": current, "utcOffsetMinutes": -1080 })
        )
        .is_ok()
    );
    let path = export("srt").unwrap();
    let written = std::fs::read_to_string(path.as_str().unwrap()).unwrap();
    assert!(written.starts_with("1\n00:00:"), "{written}");
    assert!(written.contains("Xin chào mọi người."));
    assert!(path.as_str().unwrap().ends_with(".srt"));
    let md = export("markdown").unwrap();
    assert!(
        std::fs::read_to_string(md.as_str().unwrap())
            .unwrap()
            .starts_with("# Bản chép lời · ")
    );

    app.state::<FakePicker>()
        .cancel
        .store(true, std::sync::atomic::Ordering::SeqCst);
    assert_eq!(export("txt").unwrap(), Value::Null, "bấm Hủy thì không ghi gì");
    app.state::<FakePicker>()
        .cancel
        .store(false, std::sync::atomic::Ordering::SeqCst);

    set_pro(&app, false);
    let refused = export("txt").unwrap_err();
    assert!(refused.contains(errors::PRO_REQUIRED), "{refused}");
    assert!(
        invoke(
            &main,
            "transcript_text",
            json!({ "source": current, "utcOffsetMinutes": 0 })
        )
        .is_ok()
    );
}

/// Lịch sử (Pro): danh sách, xem lại, xuất, xóa từng phiên, xóa tất cả; gói Free bị khóa.
#[test]
fn history_commands_list_open_delete_and_need_pro() {
    let app = app_after_one_session(true);
    let main = window(&app, "main");
    let list = invoke(&main, "list_history", json!({})).unwrap();
    let id = list[0]["id"].as_i64().unwrap();
    assert_eq!(list[0]["preview"], "Hello everyone.");
    let saved = invoke(&main, "get_history_session", json!({ "id": id })).unwrap();
    assert_eq!(saved["session"], 0);
    assert!(!saved["lines"].as_array().unwrap().is_empty());
    let source = json!({ "kind": "history", "id": id });
    let text = invoke(
        &main,
        "transcript_text",
        json!({ "source": source, "utcOffsetMinutes": 0 }),
    )
    .unwrap();
    assert!(text.as_str().unwrap().contains("Hello everyone."));

    set_pro(&app, false);
    for (cmd, args) in [
        ("list_history", json!({})),
        ("get_history_session", json!({ "id": id })),
        ("delete_history_session", json!({ "id": id })),
        ("clear_history", json!({})),
        ("transcript_text", json!({ "source": source, "utcOffsetMinutes": 0 })),
    ] {
        let refused = invoke(&main, cmd, args).unwrap_err();
        assert!(refused.contains(errors::PRO_REQUIRED), "{cmd}: {refused}");
    }
    set_pro(&app, true);
    invoke(&main, "delete_history_session", json!({ "id": id })).unwrap();
    let missing = invoke(&main, "get_history_session", json!({ "id": id })).unwrap_err();
    assert!(missing.contains("historyNotFound"), "{missing}");
    assert_eq!(invoke(&main, "clear_history", json!({})).unwrap(), 0);
}

/// Từ điển thuật ngữ (F5) vào prompt của phiên ở gói Pro, theo mẫu "terminology" (§6.5); gói Free thì không (Đ6).
#[test]
fn glossary_terms_reach_the_prompt_only_for_pro() {
    let deps = FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    };
    let prompts = deps.prompts.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    crate::db::with(app.handle(), |c| crate::glossary::add(c, "everyone", "mọi người")).unwrap();
    // Prompt của câu "Hello everyone." trong một phiên (bỏ lần làm nóng).
    let sentence_prompt = || {
        prompts.lock().unwrap().clear();
        session::start(app.handle()).unwrap();
        wait_until("câu đầu được gửi đi dịch", || {
            prompts.lock().unwrap().iter().any(|p| p.ends_with("Hello everyone."))
        });
        session::stop(app.handle());
        let prompts = prompts.lock().unwrap();
        prompts.iter().find(|p| p.ends_with("Hello everyone.")).unwrap().clone()
    };
    let pro = sentence_prompt();
    assert!(
        pro.starts_with("Reference the following translations:\neveryone translates to mọi người\n"),
        "{pro}"
    );
    set_pro(&app, false);
    let free = sentence_prompt();
    assert!(
        free.starts_with("Translate the following text into Vietnamese."),
        "{free}"
    );
}

/// N11 của review 03: về Free (`pro::refresh`) thì luồng dịch thôi dùng thuật ngữ ngay, không chờ phiên sau. Lên Pro thì
/// không mở DB (lúc khởi động app cũng vậy, QĐ4).
#[test]
fn losing_pro_empties_the_glossary_of_the_translation_thread() {
    let app = mock_app();
    assert!(
        !app.state::<crate::db::DataStore>().path().exists(),
        "dựng app (Pro) không mở DB"
    );
    crate::db::with(app.handle(), |c| crate::glossary::add(c, "sprint", "sprint")).unwrap();
    crate::glossary::reload(app.handle());
    let active = || app.state::<crate::glossary::ActiveGlossary>().0.read().unwrap().len();
    assert_eq!(active(), 1);
    set_pro(&app, false);
    crate::pro::refresh(app.handle());
    assert_eq!(active(), 0, "về Free thì không còn thuật ngữ trong prompt");
}

/// Cài đặt có số thứ tự tăng dần (điểm cần quyết 10 của 02a), để giao diện bỏ bản cũ tới muộn. Số trong kết quả của
/// lệnh, trong sự kiện `settings://changed` và trong `get_settings` là một.
#[test]
fn the_settings_revision_grows_with_every_change() {
    let app = mock_app();
    let main = window(&app, "main");
    let changed = record(&app, crate::events::SETTINGS_CHANGED);
    let before = invoke(&main, "get_settings", json!({})).unwrap()["revision"]
        .as_u64()
        .unwrap();
    let first = invoke(&main, "update_settings", json!({ "patch": { "theme": "dark" } })).unwrap();
    let second = invoke(&main, "set_overlay_locked", json!({ "locked": true })).unwrap();
    let (first, second) = (
        first["revision"].as_u64().unwrap(),
        second["revision"].as_u64().unwrap(),
    );
    assert!(before < first && first < second, "{before} {first} {second}");
    let events: Vec<u64> = changed
        .lock()
        .unwrap()
        .iter()
        .map(|s| s["revision"].as_u64().unwrap())
        .collect();
    assert_eq!(events, [first, second]);
    assert_eq!(invoke(&main, "get_settings", json!({})).unwrap()["revision"], second);
    assert!(last_saved(&app, "revision").is_none(), "số thứ tự không vào file");
}

/// N8 của review 03: thư mục tạm của app giả từ những lần chạy trước (cũ hơn một giờ) được dọn; thư mục mới và thư mục
/// khác thì giữ.
#[test]
fn old_temporary_folders_of_mock_apps_are_removed() {
    let parent = std::env::temp_dir().join(format!("mt-stale-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&parent);
    std::fs::create_dir_all(parent.join("mt-app-data-1-0").join("x")).unwrap();
    std::fs::create_dir_all(parent.join("mt-app-data-1-1")).unwrap();
    std::fs::create_dir_all(parent.join("mt-settings-x")).unwrap();
    let now = std::time::SystemTime::now();
    assert_eq!(
        crate::test_support::remove_stale_app_dirs(&parent, now),
        0,
        "thư mục mới thì giữ"
    );
    let later = now + Duration::from_secs(2 * 3600);
    assert_eq!(crate::test_support::remove_stale_app_dirs(&parent, later), 2);
    assert!(parent.join("mt-settings-x").exists(), "chỉ dọn thư mục của app giả");
    std::fs::remove_dir_all(parent).unwrap();
}

/// Q8(c) của review 02c: câu hỏi quyền ghi âm thanh hệ thống có bản tiếng Anh (gốc, trong `Info.plist`) và tiếng Việt
/// (`vi.lproj`), đều nói tên AI Translator, và `tauri.conf.json` chép hai file `InfoPlist.strings` vào gói `.app`.
#[test]
fn the_audio_permission_prompt_is_localized() {
    const KEY: &str = "NSAudioCaptureUsageDescription";
    let plist = include_str!("../Info.plist");
    let en = include_str!("../macos/en.lproj/InfoPlist.strings");
    let vi = include_str!("../macos/vi.lproj/InfoPlist.strings");
    for (name, text) in [("Info.plist", plist), ("en", en), ("vi", vi)] {
        assert!(text.contains(KEY) && text.contains("AI Translator"), "{name}");
    }
    assert!(plist.contains("<string>vi</string>"), "CFBundleLocalizations có vi");
    assert!(vi.contains("thu âm thanh máy đang phát"));
    let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let files = &conf["bundle"]["macOS"]["files"];
    for lang in ["en", "vi"] {
        assert_eq!(
            files[format!("Resources/{lang}.lproj/InfoPlist.strings")],
            format!("macos/{lang}.lproj/InfoPlist.strings")
        );
    }
}
