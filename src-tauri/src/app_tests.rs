//! Test hành vi của app qua lệnh `invoke`, chạy bằng `MockRuntime` (không mở cửa sổ thật).

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tauri::{Listener, Manager};

use crate::actions;
use crate::errors;
use crate::events::{
    AUDIO_LEVEL, NOTICE, OVERLAY_SCROLL, SUBTITLE_DELTA, SUBTITLE_LIVE, SUBTITLE_LIVE_END, SUBTITLE_UPSERT,
};
use crate::hotkeys::HotkeyAction;
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
    invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": false } })).unwrap();
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
    invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": false } })).unwrap();
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
fn first_run_registers_the_default_launch_at_login() {
    let app = mock_app();
    let mut settings = crate::settings::Settings::defaults(crate::settings::UiLanguage::Vi);
    assert!(settings.launch_at_login, "mặc định là Bật");
    actions::register_default_launch_at_login(app.handle(), &settings);
    assert!(
        !actions::sync_launch_at_login(app.handle(), &mut settings),
        "đã đăng ký thì cài đặt giữ Bật"
    );
    assert!(settings.launch_at_login);
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
    session::start_with(app.handle(), StartOptions::LISTEN_TEST).unwrap();
    session::stop(app.handle());
    session::start(app.handle()).unwrap();
    session::stop(app.handle());
    assert_eq!(*captures.lock().unwrap(), [true, false]);
}

/// Thanh phụ đề trên màn hình 1920 × 1080 điểm, tỉ lệ 2 (Retina): khung 900 × 160 điểm.
fn overlay_on_a_retina_screen(app: &tauri::App<tauri::test::MockRuntime>) -> crate::test_support::FakeSurface {
    use crate::overlay::placement::{Frame, Screen};
    let surface = app.state::<crate::test_support::FakeSurface>().inner().clone();
    let screen = Screen {
        key: "Retina 3840x2160".into(),
        x: 0,
        y: 0,
        width: 3840,
        height: 2160,
        scale: 2.0,
    };
    let frame = Frame {
        x: 200,
        y: 1600,
        width: 1800,
        height: 320,
    };
    *surface.frame.lock().unwrap() = Some((frame, screen));
    surface
}

fn saved_rect(app: &tauri::App<tauri::test::MockRuntime>) -> Option<(f64, f64, f64, f64)> {
    let settings = app.state::<AppState>().settings();
    let r = settings.overlay.positions.get("Retina 3840x2160")?;
    Some((r.x, r.y, r.width, r.height))
}

/// Phím tắt cuộn phụ đề (§4.4): dùng được cả khi thanh khóa (chuột xuyên qua nên không có con lăn). Chỉ thanh phụ đề nhận
/// `overlay://scroll`, với hướng đúng; cửa sổ chính thì không.
#[test]
fn scroll_hotkeys_reach_only_the_overlay() {
    let app = mock_app();
    let overlay = window(&app, "overlay");
    let main = window(&app, "main");
    let to_overlay = Arc::new(Mutex::new(Vec::<String>::new()));
    let to_main = Arc::new(Mutex::new(Vec::<String>::new()));
    let sink = to_overlay.clone();
    overlay.listen(OVERLAY_SCROLL, move |e| {
        sink.lock().unwrap().push(e.payload().to_string())
    });
    let sink = to_main.clone();
    main.listen(OVERLAY_SCROLL, move |e| {
        sink.lock().unwrap().push(e.payload().to_string())
    });
    actions::run_hotkey(app.handle(), HotkeyAction::ScrollUp);
    actions::run_hotkey(app.handle(), HotkeyAction::ScrollDown);
    wait_until("thanh phụ đề nhận hai lệnh cuộn", || {
        to_overlay.lock().unwrap().len() == 2
    });
    assert_eq!(*to_overlay.lock().unwrap(), ["\"up\"", "\"down\""]);
    assert!(to_main.lock().unwrap().is_empty(), "cửa sổ chính không nhận lệnh cuộn");
}

/// Đổi màu chữ, màu nền ở Cài đặt › Phụ đề (§4.3): thanh phụ đề thấy ngay qua `overlay://view`. Mặc định chữ trắng trên
/// nền đen.
#[test]
fn subtitle_colors_reach_the_overlay_at_once() {
    let app = mock_app();
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");
    let view = invoke(&overlay, "get_overlay_view", json!({})).unwrap();
    assert_eq!(
        (&view["textColor"], &view["background"]),
        (&json!("white"), &json!("black"))
    );
    let views = record(&app, crate::events::OVERLAY_VIEW);
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "overlay": { "textColor": "yellow", "background": "navy" } } }),
    )
    .unwrap();
    let last = views.lock().unwrap().last().cloned().unwrap();
    assert_eq!(
        (&last["textColor"], &last["background"]),
        (&json!("yellow"), &json!("navy"))
    );
    let saved = last_saved(&app, "overlay").unwrap();
    assert_eq!(
        (&saved["textColor"], &saved["background"]),
        (&json!("yellow"), &json!("navy"))
    );
}

/// Spec 2026-10-10 §6.1, §6.3: công tắc "Dịch trong lúc người nói chưa dừng" mặc định tắt, được ghi vào file, và thanh phụ
/// đề biết ngay qua `overlay://view` (để thôi làm nhạt cả dòng phụ đề tạm khi chế độ có hiệu lực).
#[test]
fn the_live_switch_is_off_by_default_and_reaches_the_overlay() {
    let app = mock_app();
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");
    let settings = invoke(&main, "get_settings", json!({})).unwrap();
    assert_eq!(settings["translateWhileSpeaking"], false);
    let view = invoke(&overlay, "get_overlay_view", json!({})).unwrap();
    assert_eq!(view["translateWhileSpeaking"], false);
    let views = record(&app, crate::events::OVERLAY_VIEW);
    let settings = invoke(
        &main,
        "update_settings",
        json!({ "patch": { "translateWhileSpeaking": true } }),
    )
    .unwrap();
    assert_eq!(settings["translateWhileSpeaking"], true);
    let last = views.lock().unwrap().last().cloned().unwrap();
    assert_eq!(last["translateWhileSpeaking"], true);
    assert_eq!(last_saved(&app, "translateWhileSpeaking"), Some(json!(true)));
}

/// Kéo cạnh trên macOS (§4.4): app tự đặt khung theo con trỏ, không nhỏ hơn 320 × 80 điểm; nhả chuột thì nhớ kích thước
/// mới cho màn hình đó. Thanh đang khóa thì không đổi gì.
#[test]
fn dragging_an_edge_resizes_the_overlay_and_remembers_it() {
    let app = mock_app();
    let overlay = window(&app, "overlay");
    let surface = overlay_on_a_retina_screen(&app);
    // Con trỏ tính bằng điểm: dời (100, −30) điểm là (200, −60) pixel trên màn hình tỉ lệ 2.
    *surface.cursor.lock().unwrap() = (100.0, 850.0);
    invoke(&overlay, "begin_overlay_resize", json!({ "edge": "northWest" })).unwrap();
    *surface.cursor.lock().unwrap() = (200.0, 820.0);
    invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
    *surface.cursor.lock().unwrap() = (2500.0, 2500.0);
    invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
    invoke(&overlay, "end_overlay_resize", json!({})).unwrap();
    assert_eq!(
        overlay_calls(&app),
        ["frame 400 1540 1600x380", "frame 1360 1760 640x160"],
        "cạnh phải và cạnh dưới đứng yên; cỡ tối thiểu 320 × 80 điểm là 640 × 160 pixel"
    );
    assert_eq!(saved_rect(&app), Some((680.0, 880.0, 320.0, 80.0)));
    invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
    assert_eq!(overlay_calls(&app).len(), 2, "nhả chuột rồi thì thôi theo con trỏ");

    let main = window(&app, "main");
    invoke(&main, "set_overlay_locked", json!({ "locked": true })).unwrap();
    let before = overlay_calls(&app).len();
    invoke(&overlay, "begin_overlay_resize", json!({ "edge": "east" })).unwrap();
    invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
    assert_eq!(overlay_calls(&app).len(), before, "đang khóa thì không đổi kích thước");
}

/// Q-A của review 03 lần 2: mép thanh dính theo con trỏ trên màn hình tỉ lệ 1 cũng như trên màn hình Retina (tỉ lệ 2), dù
/// màn hình chính có tỉ lệ nào: con trỏ dời 100 điểm thì khung dời 100 điểm, tức 100 pixel trên màn hình 1×, 200 pixel trên
/// màn hình 2×.
#[test]
fn the_edge_follows_the_cursor_on_screens_of_different_scales() {
    use crate::overlay::placement::{Frame, Screen};
    for (scale, expected) in [(1.0, "frame 0 0 1000x160"), (2.0, "frame 0 0 1100x160")] {
        let app = mock_app();
        let overlay = window(&app, "overlay");
        let surface = app.state::<crate::test_support::FakeSurface>().inner().clone();
        let screen = Screen {
            key: format!("screen {scale}"),
            x: 0,
            y: 0,
            width: 3840,
            height: 2160,
            scale,
        };
        let frame = Frame {
            x: 0,
            y: 0,
            width: 900,
            height: 160,
        };
        *surface.frame.lock().unwrap() = Some((frame, screen));
        *surface.cursor.lock().unwrap() = (500.0, 50.0);
        invoke(&overlay, "begin_overlay_resize", json!({ "edge": "east" })).unwrap();
        *surface.cursor.lock().unwrap() = (600.0, 50.0);
        invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
        assert_eq!(overlay_calls(&app), [expected], "tỉ lệ {scale}");
    }
}

/// Kéo cạnh trên Windows (§4.4): hệ điều hành đổi kích thước (`start_resize_dragging`); app không tự đặt khung.
#[test]
fn on_windows_the_system_resizes_the_overlay() {
    let app = mock_app();
    let overlay = window(&app, "overlay");
    let surface = overlay_on_a_retina_screen(&app);
    surface.system_resize.store(true, std::sync::atomic::Ordering::SeqCst);
    invoke(&overlay, "begin_overlay_resize", json!({ "edge": "southEast" })).unwrap();
    *surface.cursor.lock().unwrap() = (400.0, 1640.0);
    invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
    invoke(&overlay, "end_overlay_resize", json!({})).unwrap();
    assert_eq!(overlay_calls(&app), ["system resize SouthEast"]);
    assert!(invoke(&overlay, "begin_overlay_resize", json!({ "edge": "up" })).is_err());
}

/// Nút ✕ (§4.4): ẩn thanh và dừng phiên dịch trong một lần bấm; vị trí được nhớ lúc ẩn (QĐ19, M17 của review 03).
#[test]
fn the_close_button_hides_the_overlay_stops_the_session_and_remembers_the_position() {
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let overlay = window(&app, "overlay");
    overlay_on_a_retina_screen(&app);
    session::start(app.handle()).unwrap();
    assert!(app.state::<AppState>().status().overlay_visible);
    invoke(&overlay, "hide_overlay", json!({})).unwrap();
    let status = app.state::<AppState>().status();
    assert!(!status.overlay_visible);
    assert_eq!(status.session, SessionStatus::Idle, "bấm ✕ thì dừng phiên");
    assert_eq!(overlay_calls(&app).last().map(String::as_str), Some("hide"));
    assert_eq!(saved_rect(&app), Some((100.0, 800.0, 900.0, 160.0)));
}

/// Nút ✕ khi chưa dịch chỉ ẩn thanh, không bắt đầu phiên (khác `toggle_session`).
#[test]
fn the_close_button_never_starts_a_session() {
    let app = mock_app();
    let overlay = window(&app, "overlay");
    overlay_on_a_retina_screen(&app);
    invoke(&overlay, "hide_overlay", json!({})).unwrap();
    let status = app.state::<AppState>().status();
    assert!(!status.overlay_visible);
    assert_eq!(status.session, SessionStatus::Idle);
}

/// Ẩn bằng phím tắt, menu khay hay nút ở cửa sổ chính cũng nhớ vị trí (QĐ19, M17 của review 03).
#[test]
fn hiding_the_overlay_from_the_main_window_remembers_the_position() {
    let app = mock_app();
    let main = window(&app, "main");
    overlay_on_a_retina_screen(&app);
    assert_eq!(saved_rect(&app), None);
    invoke(&main, "set_overlay_visible", json!({ "visible": false })).unwrap();
    assert_eq!(saved_rect(&app), Some((100.0, 800.0, 900.0, 160.0)));
}

/// Lệnh `start_listen_test`: thu toàn hệ thống kể cả chính app, dù cài đặt đang chọn một app họp; phiên thường vẫn theo
/// cài đặt. Thanh phụ đề cũng nhận mức âm lượng (chỉ báo "đang nghe", §4.4).
#[test]
fn the_listening_test_captures_the_whole_system_and_the_overlay_hears_the_level() {
    use crate::settings::AudioSource;
    let deps = FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    };
    let (captures, sources) = (deps.captures.clone(), deps.capture_sources.clone());
    let app = mock_app_with(deps);
    let main = window(&app, "main");
    let _overlay = window(&app, "overlay");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "audioSource": { "kind": "app", "bundleId": "us.zoom.xos" } } }),
    )
    .unwrap();
    let levels = Arc::new(Mutex::new(0usize));
    let seen = levels.clone();
    app.get_webview_window("overlay")
        .unwrap()
        .listen(AUDIO_LEVEL, move |_| *seen.lock().unwrap() += 1);
    let status = invoke(&main, "start_listen_test", json!({})).unwrap();
    assert_eq!(status["session"], "running");
    wait_until("thanh phụ đề nhận mức âm lượng", || {
        *levels.lock().unwrap() > 0
    });
    invoke(&main, "toggle_session", json!({})).unwrap();
    invoke(&main, "toggle_session", json!({})).unwrap();
    invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(*captures.lock().unwrap(), [true, false]);
    assert_eq!(
        *sources.lock().unwrap(),
        [
            AudioSource::System,
            AudioSource::App {
                bundle_id: "us.zoom.xos".into()
            }
        ]
    );
}

/// Spec 2026-10-24-nguon-micro §7, QĐ5 của kế hoạch 02: chế độ micro mà quyền đã bị từ chối thì không bắt đầu phiên, không
/// nạp model, không mở nguồn; có quyền thì mở nguồn micro theo cài đặt.
#[test]
fn the_mic_mode_needs_the_mic_permission() {
    use crate::capture::CapturePlan;
    use audio_capture::MicPermission;
    let deps = FakeDeps::default();
    let (plans, prepares, permission) = (
        deps.capture_plans.clone(),
        deps.prepares.clone(),
        deps.mic_permission.clone(),
    );
    *permission.lock().unwrap() = Some(MicPermission::Denied);
    let app = mock_app_with(deps);
    let main = window(&app, "main");
    invoke(&main, "update_settings", json!({ "patch": { "captureMode": "mic" } })).unwrap();
    let err = session::toggle(app.handle()).unwrap_err();
    assert_eq!(err.code, errors::MIC_PERMISSION);
    let status = app.state::<AppState>().status();
    assert_eq!(
        (status.session, status.session_error.as_deref()),
        (SessionStatus::Error, Some(errors::MIC_PERMISSION))
    );
    assert!(plans.lock().unwrap().is_empty());
    assert_eq!(*prepares.lock().unwrap(), 0, "không nạp model");
    *permission.lock().unwrap() = Some(MicPermission::Granted);
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "running");
    assert_eq!(
        *plans.lock().unwrap(),
        [CapturePlan::Mic {
            device: None,
            noise_filter: true
        }]
    );
}

/// Micro không có tín hiệu (spec §5.6, §7): phiên chạy tiếp, `micIssue` là `suspected`; có tín hiệu lại hay dừng phiên thì
/// xóa.
#[test]
fn a_silent_mic_shows_a_mic_issue() {
    use crate::capture::CaptureEvent;
    use crate::state::MicIssue;
    let deps = FakeDeps::default();
    let events = deps.capture_events.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    session::start(app.handle()).unwrap();
    let current = events.lock().unwrap().remove(0);
    current(CaptureEvent::MicSilent(true));
    assert_eq!(app.state::<AppState>().status().mic_issue, Some(MicIssue::Suspected));
    current(CaptureEvent::MicSilent(false));
    assert_eq!(app.state::<AppState>().status().mic_issue, None);
    current(CaptureEvent::MicSilent(true));
    session::stop(app.handle());
    assert_eq!(app.state::<AppState>().status().mic_issue, None);
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
/// cửa sổ chính thì không. QĐ1 của kế hoạch 03: lần bắt đầu hỏi máy có đủ sức dịch trong lúc nói không sau khi chuẩn bị
/// (lúc đã biết thiết bị thật của `asr-worker`); chạy sẵn thì không hỏi.
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
    assert_eq!(
        *calls.lock().unwrap(),
        ["prepare", "allow_retry", "prepare", "streaming_supported"]
    );
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
/// (N-A của review 03 lần 2; N-2 của review cuối 03: test đưa chính `RunEvent::Exit` vào `crate::handle_run_event`, nên
/// bỏ lời gọi `on_exit` ở nhánh `Exit` thì test đỏ).
#[test]
fn the_exit_event_saves_the_running_session_to_history() {
    use std::sync::atomic::{AtomicBool, Ordering};
    static KILLED: AtomicBool = AtomicBool::new(false);
    fn fake_kill_all() {
        KILLED.store(true, Ordering::SeqCst);
    }
    let app = running_session_with_history();
    crate::handle_run_event(app.handle(), tauri::RunEvent::Exit, fake_kill_all);
    assert!(KILLED.load(Ordering::SeqCst), "kill tiến trình phụ còn sót");
    assert_eq!(saved_sessions(&app), 1);
    crate::handle_run_event(app.handle(), tauri::RunEvent::Exit, fake_kill_all);
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

/// Từ điển thuật ngữ (Pro): thêm, sửa, xóa, xuất rồi nhập CSV qua hộp thoại; lỗi có mã; gói Free bị khóa.
#[test]
fn glossary_commands_edit_import_export_and_need_pro() {
    use crate::test_support::FakePicker;
    let app = mock_app();
    let main = window(&app, "main");
    let added = invoke(
        &main,
        "add_glossary_entry",
        json!({ "source": "sprint", "target": "đợt chạy" }),
    )
    .unwrap();
    let id = added["id"].as_i64().unwrap();
    let dup = invoke(
        &main,
        "add_glossary_entry",
        json!({ "source": "SPRINT", "target": "x" }),
    )
    .unwrap_err();
    assert!(dup.contains("glossaryDuplicate"), "{dup}");
    // Mỗi lần sửa thì luồng dịch có ngay bản mới (QĐ12): sau thêm, sửa, xóa và nhập (M03, M04 của review 03).
    let active = app.state::<crate::glossary::ActiveGlossary>();
    let active_target = |source: &str| {
        active
            .0
            .read()
            .unwrap()
            .matches(source)
            .first()
            .map(|t| t.target.clone())
    };
    assert_eq!(active_target("sprint").as_deref(), Some("đợt chạy"));
    invoke(
        &main,
        "update_glossary_entry",
        json!({ "id": id, "source": "sprint", "target": "chặng" }),
    )
    .unwrap();
    assert_eq!(active_target("sprint").as_deref(), Some("chặng"));
    invoke(
        &main,
        "add_glossary_entry",
        json!({ "source": "API, SDK", "target": "giao diện" }),
    )
    .unwrap();
    assert_eq!(active.0.read().unwrap().len(), 2);

    let path = invoke(&main, "export_glossary_csv", json!({})).unwrap();
    let path = std::path::PathBuf::from(path.as_str().unwrap());
    assert!(path.ends_with("glossary.csv"));
    let csv = std::fs::read_to_string(&path).unwrap();
    assert_eq!(csv, "\u{feff}source,target\nsprint,chặng\n\"API, SDK\",giao diện\n");
    invoke(&main, "delete_glossary_entry", json!({ "id": id })).unwrap();
    assert_eq!(active_target("sprint"), None, "xóa xong thì thôi dùng ngay");
    assert_eq!(
        invoke(&main, "list_glossary", json!({}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );

    *app.state::<FakePicker>().to_open.lock().unwrap() = Some(path);
    let report = invoke(&main, "import_glossary_csv", json!({})).unwrap();
    assert_eq!(
        report,
        json!({ "added": 1, "updated": 1, "skipped": 0, "overLimit": 0 })
    );
    let sources: Vec<Value> = invoke(&main, "list_glossary", json!({}))
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["source"].clone())
        .collect();
    assert_eq!(sources, [json!("API, SDK"), json!("sprint")]);
    assert_eq!(
        active_target("sprint").as_deref(),
        Some("chặng"),
        "nhập xong thì dùng ngay"
    );
    app.state::<FakePicker>()
        .cancel
        .store(true, std::sync::atomic::Ordering::SeqCst);
    assert_eq!(invoke(&main, "import_glossary_csv", json!({})).unwrap(), Value::Null);

    // Mọi lệnh của từ điển đi qua điểm kiểm tra Pro (M01, M02 của review 03), và không sửa gì ở gói Free.
    set_pro(&app, false);
    for (cmd, args) in [
        ("list_glossary", json!({})),
        ("import_glossary_csv", json!({})),
        ("export_glossary_csv", json!({})),
        ("add_glossary_entry", json!({ "source": "a", "target": "b" })),
        (
            "update_glossary_entry",
            json!({ "id": id, "source": "sprint", "target": "x" }),
        ),
        ("delete_glossary_entry", json!({ "id": id })),
    ] {
        let refused = invoke(&main, cmd, args).unwrap_err();
        assert!(refused.contains(errors::PRO_REQUIRED), "{cmd}: {refused}");
    }
    let kept = crate::db::with(app.handle(), |c| crate::glossary::list(c)).unwrap();
    assert_eq!(kept.len(), 2);
    assert!(kept.iter().any(|e| e.source == "sprint" && e.target == "chặng"));
}

/// Nút "Xóa toàn bộ dữ liệu" (§4.3): lịch sử, từ điển và bản chép lời trong bộ nhớ đều mất, kể cả ở gói Free; cài đặt
/// giữ nguyên.
#[test]
fn clear_all_data_removes_history_glossary_and_the_transcript() {
    let app = app_after_one_session(true);
    let main = window(&app, "main");
    invoke(
        &main,
        "add_glossary_entry",
        json!({ "source": "sprint", "target": "đợt chạy" }),
    )
    .unwrap();
    assert_eq!(
        invoke(&main, "list_history", json!({}))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let db_file = app.state::<crate::db::DataStore>().path();
    assert!(db_file.exists());
    set_pro(&app, false);
    invoke(&main, "clear_all_data", json!({})).unwrap();
    assert!(!db_file.exists(), "file DB bị xóa");
    assert!(
        invoke(&main, "get_transcript", json!({})).unwrap()["lines"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(
        app.state::<crate::glossary::ActiveGlossary>()
            .0
            .read()
            .unwrap()
            .is_empty()
    );
    set_pro(&app, true);
    assert!(
        invoke(&main, "list_history", json!({}))
            .unwrap()
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(
        invoke(&main, "list_glossary", json!({}))
            .unwrap()
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        invoke(&main, "get_settings", json!({})).unwrap()["saveHistory"],
        true,
        "cài đặt giữ nguyên"
    );
    // Xóa khi đang Pro: luồng dịch cũng thôi dùng thuật ngữ ngay (ở trên, về Free đã làm việc đó, C1 của lần chạy mutation).
    invoke(
        &main,
        "add_glossary_entry",
        json!({ "source": "sprint", "target": "đợt chạy" }),
    )
    .unwrap();
    invoke(&main, "clear_all_data", json!({})).unwrap();
    assert!(
        app.state::<crate::glossary::ActiveGlossary>()
            .0
            .read()
            .unwrap()
            .is_empty()
    );
}

/// Bảng debug ẩn (§7): số đo của phiên vừa dừng, không có chữ chép lời.
#[test]
fn the_debug_panel_lists_the_metrics_of_finished_sessions() {
    let app = app_after_one_session(false);
    let main = window(&app, "main");
    let sessions = invoke(&main, "get_debug_sessions", json!({})).unwrap();
    let first = &sessions[0];
    assert_eq!(first["session"], 1);
    assert!(first["translated"].as_u64().unwrap() >= 1);
    assert_eq!(first["stages"][3]["name"], "total");
    assert!(
        !sessions.to_string().contains("Hello everyone"),
        "không có chữ chép lời"
    );
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

/// Q8(c) của review 02c: câu hỏi quyền ghi âm thanh hệ thống có bản gốc tiếng Anh (trong `Info.plist`) và bản của từng
/// ngôn ngữ giao diện (`<lproj>/InfoPlist.strings`, spec 2026-10-12 §6), đều nói tên AI Translator; `Info.plist` liệt kê
/// đủ ngôn ngữ trong `CFBundleLocalizations`, và `tauri.conf.json` chép các file `InfoPlist.strings` vào gói `.app`.
#[test]
fn the_audio_permission_prompt_is_localized() {
    const KEY: &str = "NSAudioCaptureUsageDescription";
    let plist = include_str!("../Info.plist");
    assert!(plist.contains(KEY) && plist.contains("AI Translator"), "Info.plist");
    // Tên thư mục `.lproj` của macOS: tiếng Trung giản thể là `zh-Hans`, không phải `zh`.
    let prompts = [
        ("en", include_str!("../macos/en.lproj/InfoPlist.strings")),
        ("vi", include_str!("../macos/vi.lproj/InfoPlist.strings")),
        ("ja", include_str!("../macos/ja.lproj/InfoPlist.strings")),
        ("zh-Hans", include_str!("../macos/zh-Hans.lproj/InfoPlist.strings")),
        ("ko", include_str!("../macos/ko.lproj/InfoPlist.strings")),
    ];
    for (name, text) in prompts {
        assert!(text.contains(KEY) && text.contains("AI Translator"), "{name}");
        assert!(
            plist.contains(&format!("<string>{name}</string>")),
            "CFBundleLocalizations có {name}"
        );
    }
    assert!(prompts[1].1.contains("thu âm thanh máy đang phát"));
    let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let files = &conf["bundle"]["macOS"]["files"];
    for (lang, _) in prompts {
        assert_eq!(
            files[format!("Resources/{lang}.lproj/InfoPlist.strings")],
            format!("macos/{lang}.lproj/InfoPlist.strings")
        );
    }
}

/// Bản quyền cho app giả: server và kho khóa giả của `license::manager::tests`, giờ thật.
fn license_for(
    app: &tauri::App<tauri::test::MockRuntime>,
) -> (
    Arc<crate::license::manager::tests::FakeApi>,
    Arc<crate::license::manager::License>,
) {
    let (api, _, license) = license_with_vault(app);
    (api, license)
}

/// Như [`license_for`], kèm kho khóa giả (để cho lỗi đọc, ghi, xóa).
fn license_with_vault(
    app: &tauri::App<tauri::test::MockRuntime>,
) -> (
    Arc<crate::license::manager::tests::FakeApi>,
    Arc<crate::license::store::tests::FakeVault>,
    Arc<crate::license::manager::License>,
) {
    use crate::license::manager::tests::{DEVICE, FakeApi, test_keys, vn};
    use crate::license::manager::{License, Machine};
    use crate::license::store::tests::FakeVault;
    let api = Arc::new(FakeApi::default());
    let vault = Arc::new(FakeVault::default());
    let license = License::new(
        Box::new(api.clone()),
        Box::new(vault.clone()),
        test_keys(),
        Machine {
            id_hash: DEVICE.into(),
            label: None,
        },
        vn(),
        true,
        false,
        false,
        crate::license::app::now(),
    );
    license.set_genuine(true);
    crate::license::app::install_with(app.handle(), license);
    let installed = app.state::<crate::license::app::Licensing>().0.clone();
    (api, vault, installed)
}

/// Hạn mức (§6.8, "Khi chạm hạn mức"): đang dịch mà chạm hạn mức thì phiên dừng với `quotaExhausted`; hạn mức còn 0 thì
/// không bắt đầu được phiên mới.
#[test]
fn a_used_up_quota_stops_the_session_and_refuses_the_next_one() {
    use crate::license::quota::FREE_DAILY_MS;
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    let (_, license) = license_for(&app);
    let now = crate::license::app::now();
    assert!(license.add_usage(FREE_DAILY_MS - 1, now).is_continue());
    session::start(app.handle()).unwrap();
    let state = app.state::<AppState>();
    wait_until("phiên dừng vì hết hạn mức", || {
        state.status().session == SessionStatus::Error
    });
    assert_eq!(state.status().session_error.as_deref(), Some(errors::QUOTA_EXHAUSTED));
    let refused = session::start(app.handle()).unwrap_err();
    assert_eq!(refused.code, errors::QUOTA_EXHAUSTED);
    assert!(state.status().quota_reset_at.is_some(), "báo thời điểm reset");
    // Phiên "Nghe thử" là phiên thật (N13 của review 03): cũng trừ hạn mức và cũng bị chặn (QĐ của 06).
    let refused = session::start_with(app.handle(), StartOptions::LISTEN_TEST).unwrap_err();
    assert_eq!(refused.code, errors::QUOTA_EXHAUSTED);
}

/// Còn từ 5 phút trở xuống: `AppStatus.quota_warning` bật, thanh phụ đề và cửa sổ chính nhắc (§4.2 bước 2).
#[test]
fn the_five_minute_warning_reaches_the_status() {
    use crate::license::quota::FREE_DAILY_MS;
    let app = mock_app();
    let (_, license) = license_for(&app);
    let state = app.state::<AppState>();
    assert!(!state.status().quota_warning);
    let _ = license.add_usage(FREE_DAILY_MS - 4 * 60_000, crate::license::app::now());
    crate::license::app::refresh(app.handle());
    assert!(state.status().quota_warning);
}

/// Sự kiện `license://changed` không mang key đầy đủ hay token (01 QĐ6: sự kiện không phải ranh giới quyền).
#[test]
fn license_events_never_carry_the_key_or_the_token() {
    use crate::license::manager::tests::{DEVICE, KEY, granted, sign};
    let app = mock_app();
    let views = record(&app, crate::license::app::LICENSE_CHANGED);
    let (api, license) = license_for(&app);
    let now = crate::license::app::now();
    let claims = json!({
        "kid": "test-1", "license_id": "lic", "activation_id": "act", "activation_created_at": now,
        "device_id_hash": DEVICE, "plan": "yearly", "expires_at": now + 365 * 86_400, "cycle_anchor": now,
        "quota_minutes_per_cycle": null, "quota_epoch": 0, "quota_fresh": true,
        "issued_at": now, "refresh_before": now + 14 * 86_400,
    });
    api.replies.lock().unwrap().push_back(granted(&claims, true));
    license.activate(KEY, now).unwrap();
    crate::license::app::refresh(app.handle());
    let last = views.lock().unwrap().last().cloned().unwrap();
    assert_eq!(last["plan"], "yearly");
    let text = last.to_string();
    assert!(text.contains("••••-••••-••••-••••-••••-••••-RST5"), "{text}");
    assert!(!text.contains(&sign(&claims)[..20]), "không có token");
    assert!(!text.contains("0123-4567"), "không có key đầy đủ");
    assert!(app.state::<AppState>().status().pro, "gate Pro theo bản quyền thật");
}

/// Lỗi của `open_checkout_page`: mã `openFailed`, chi tiết là nhãn cố định của nhánh lỗi (cũng là chữ ghi vào log; M4 của
/// review C1), không bao giờ có URL hay đường dẫn trang thanh toán.
fn open_error(refused: &str) -> String {
    let error: Value = serde_json::from_str(refused).unwrap_or_else(|e| panic!("{refused}: {e}"));
    assert_eq!(error["code"], errors::OPEN_FAILED, "{refused}");
    for leak in ["http", "payos", "creem", "evil", "/x", "ch_abc", "web/abc"] {
        assert!(!refused.contains(leak), "lộ {leak}: {refused}");
    }
    error["message"].as_str().unwrap_or_default().to_string()
}

/// Trang thanh toán của PayOS mở bằng trình duyệt của hệ thống (01 QĐ28), chỉ với URL do phía Rust giữ và nằm trong
/// danh sách cho phép (§10.2); giao diện không gửi URL nào.
#[test]
fn the_checkout_page_opens_only_for_the_pending_payos_order() {
    use crate::license::store::{self, PendingOrder};
    use crate::test_support::system_calls;
    let app = mock_app();
    let main = window(&app, "main");
    let (_, license) = license_for(&app);
    let refused = invoke(&main, "open_checkout_page", json!({})).unwrap_err();
    assert_eq!(open_error(&refused), "open_failed:no_order");
    let mut order = PendingOrder {
        order_code: 7,
        order_token: "tok".into(),
        plan: "monthly".into(),
        expires_at: crate::license::app::now() + 900,
        renewal: false,
        checkout_url: "https://pay.payos.vn/web/abc".into(),
        qr_code: Some("000201".into()),
        provider: "payos".into(),
        amount: 50_000,
        currency: "VND".into(),
    };
    store::write(license.vault(), store::ORDER, &order).unwrap();
    invoke(&main, "open_checkout_page", json!({})).unwrap();
    assert_eq!(system_calls(&app), ["open_external_url https://pay.payos.vn/web/abc"]);
    order.checkout_url = "https://pay.payos.vn.evil.example/x".into();
    store::write(license.vault(), store::ORDER, &order).unwrap();
    let refused = invoke(&main, "open_checkout_page", json!({})).unwrap_err();
    assert_eq!(open_error(&refused), "open_failed:not_allowed");
    let pending = invoke(&main, "get_pending_order", json!({})).unwrap();
    assert!(pending["qrSvg"].as_str().unwrap().contains("<svg"));
    assert_eq!(
        (
            pending["provider"].as_str(),
            pending["amount"].as_i64(),
            pending["currency"].as_str()
        ),
        (Some("payos"), Some(50_000), Some("VND"))
    );
    assert!(!pending.to_string().contains("tok"), "order_token không ra giao diện");
    invoke(&main, "cancel_checkout", json!({})).unwrap();
    assert_eq!(invoke(&main, "get_pending_order", json!({})).unwrap(), Value::Null);
}

/// Bảng gói trả cho giao diện (spec 2026-10-22 §3.1): chỉ có `plans`, không còn loại tiền gợi ý; tên trường camelCase, giá USD
/// tính bằng cent.
#[test]
fn get_plans_returns_only_the_plans() {
    use crate::license::client::{PlanOffer, PlansReply};
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    *api.plans.lock().unwrap() = Some(PlansReply {
        plans: vec![PlanOffer {
            code: "monthly".into(),
            name: "Monthly".into(),
            quota_minutes_per_cycle: Some(3000),
            days_per_order: 30,
            prices: [("VND".to_string(), 50_000), ("USD".to_string(), 399)].into(),
        }],
    });
    let plans = invoke(&main, "get_plans", json!({})).unwrap();
    assert!(plans.get("suggestedCurrency").is_none(), "{plans}");
    assert_eq!(
        (
            plans["plans"][0]["code"].as_str(),
            plans["plans"][0]["prices"]["USD"].as_i64()
        ),
        (Some("monthly"), Some(399))
    );
}

/// Đơn thẻ (Creem) đang chờ: không có mã QR, giao diện biết cổng; mở lại trang thanh toán chỉ với URL của Creem đã lưu.
#[test]
fn a_pending_card_order_has_no_qr_and_reopens_only_the_creem_page() {
    use crate::license::store::{self, PendingOrder};
    use crate::test_support::system_calls;
    let app = mock_app();
    let main = window(&app, "main");
    let (_, license) = license_for(&app);
    let mut order = PendingOrder {
        order_code: 8,
        order_token: "tok".into(),
        plan: "monthly".into(),
        expires_at: crate::license::app::now() + 1800,
        renewal: false,
        checkout_url: "https://checkout.creem.io/ch_abc".into(),
        qr_code: None,
        provider: "creem".into(),
        amount: 399,
        currency: "USD".into(),
    };
    store::write(license.vault(), store::ORDER, &order).unwrap();
    let pending = invoke(&main, "get_pending_order", json!({})).unwrap();
    assert_eq!(pending.get("qrSvg"), Some(&Value::Null), "khóa có mặt, giá trị null");
    assert_eq!(pending["provider"], "creem");
    assert_eq!(
        (pending["amount"].as_i64(), pending["currency"].as_str()),
        (Some(399), Some("USD")),
        "mở lại app vẫn biết số tiền và loại tiền của đơn"
    );
    assert!(!pending.to_string().contains("tok"), "order_token không ra giao diện");
    invoke(&main, "open_checkout_page", json!({})).unwrap();
    assert_eq!(
        system_calls(&app),
        ["open_external_url https://checkout.creem.io/ch_abc"]
    );
    order.checkout_url = "https://checkout.creem.io.evil.example/x".into();
    store::write(license.vault(), store::ORDER, &order).unwrap();
    let refused = invoke(&main, "open_checkout_page", json!({})).unwrap_err();
    assert_eq!(open_error(&refused), "open_failed:not_allowed");
    order.checkout_url = "không phải URL".into();
    store::write(license.vault(), store::ORDER, &order).unwrap();
    let refused = invoke(&main, "open_checkout_page", json!({})).unwrap_err();
    assert_eq!(open_error(&refused), "open_failed:bad_url");
}

/// Đơn server giả vừa tạo: thẻ (Creem, không mã QR, giữ 30 phút) hay VietQR (PayOS, 15 phút).
fn new_checkout(card: bool) -> crate::license::client::Checkout {
    crate::license::client::Checkout {
        order_code: 8,
        order_token: "tok".into(),
        provider: Some(if card { "creem" } else { "payos" }.into()),
        checkout_url: if card {
            "https://checkout.creem.io/ch_abc".into()
        } else {
            "https://pay.payos.vn/web/abc".into()
        },
        qr_code: (!card).then(|| "000201".into()),
        plan: "monthly".into(),
        amount: if card { 399 } else { 50_000 },
        currency: if card { "USD" } else { "VND" }.into(),
        expires_at: crate::license::app::now() + if card { 1800 } else { 900 },
        license_expires_at: None,
        converted_days: None,
    }
}

/// Một đơn vừa tạo trên server giả: thẻ (Creem, không mã QR) hay VietQR (PayOS). Đơn kế tiếp báo `refunded` để luồng hỏi
/// nền (do `start_checkout` bật) kết thúc ngay sau lần hỏi đầu, không chạy mãi sau test.
fn queue_checkout(api: &crate::license::manager::tests::FakeApi, card: bool) {
    queue_order(api, new_checkout(card));
}

fn queue_order(api: &crate::license::manager::tests::FakeApi, checkout: crate::license::client::Checkout) {
    let code = checkout.order_code;
    api.checkouts.lock().unwrap().push_back(Ok(checkout));
    api.orders.lock().unwrap().push_back(Ok(order_status(code, "refunded")));
}

/// Trạng thái đơn `code` server giả trả cho lần hỏi kế tiếp.
fn order_status(code: i64, status: &str) -> crate::license::client::OrderStatus {
    crate::license::client::OrderStatus {
        order_code: code,
        status: status.into(),
        plan: "monthly".into(),
        expires_at: 0,
        license_key: None,
        license_plan: None,
        license_expires_at: None,
        grant_kind: None,
    }
}

/// Đơn thẻ (Creem) vừa tạo: app mở ngay trang thanh toán bằng trình duyệt (spec 2026-10-14 §5), không có mã QR để vẽ, và
/// gửi `currency: "USD"` cho server.
#[test]
fn a_new_card_order_opens_the_payment_page_at_once() {
    use crate::test_support::system_calls;
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    queue_checkout(&api, true);
    let args = json!({ "plan": "monthly", "email": "a@b.vn", "consent": true, "renew": false, "currency": "USD" });
    let view = invoke(&main, "start_checkout", args).unwrap();
    assert_eq!(view.get("qrSvg"), Some(&Value::Null), "khóa có mặt, giá trị null");
    assert_eq!(view["provider"], "creem");
    assert_eq!(
        system_calls(&app),
        ["open_external_url https://checkout.creem.io/ch_abc"]
    );
    assert_eq!(api.calls.lock().unwrap()[0], "checkout monthly a@b.vn - USD");
    poller_asked_and_stopped(&app, &api);
}

/// Luồng hỏi nền do `start_checkout` bật đã hỏi đơn 8 rồi dừng (đơn kế tiếp trên server giả là kết quả cuối).
fn poller_asked_and_stopped(app: &tauri::App<tauri::test::MockRuntime>, api: &crate::license::manager::tests::FakeApi) {
    wait_until("luồng hỏi nền hỏi đơn 8", || {
        api.calls.lock().unwrap().iter().any(|c| c == "order 8 tok")
    });
    let licensing = app.state::<crate::license::app::Licensing>();
    wait_until("luồng hỏi nền dừng", || !licensing.polling());
}

/// Đơn VietQR vẫn như cũ: vẽ mã QR, người dùng tự bấm "Mở trang thanh toán" nếu cần; app không tự mở trình duyệt.
#[test]
fn a_new_vietqr_order_draws_the_qr_and_does_not_open_the_browser() {
    use crate::test_support::system_calls;
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    queue_checkout(&api, false);
    let args = json!({ "plan": "monthly", "email": "a@b.vn", "consent": true, "renew": false, "currency": "VND" });
    let view = invoke(&main, "start_checkout", args).unwrap();
    assert!(view["qrSvg"].as_str().unwrap().contains("<svg"));
    assert_eq!(view["provider"], "payos");
    assert!(system_calls(&app).is_empty(), "không tự mở trình duyệt");
    assert_eq!(api.calls.lock().unwrap()[0], "checkout monthly a@b.vn -");
    poller_asked_and_stopped(&app, &api);
}

/// Đơn thẻ mà trang thanh toán không mở được (URL ngoài danh sách cho phép, hay trình duyệt lỗi; I1-KH03T4): đơn đã tạo
/// trên server nên lệnh vẫn trả đơn, đơn vẫn lưu (mở lại app, "Mở lại trang thanh toán"), và luồng hỏi nền vẫn chạy rồi
/// dừng khi có kết quả cuối. Đơn mở lại có đúng số tiền và loại tiền.
#[test]
fn a_card_order_whose_page_cannot_open_is_still_kept_and_polled() {
    use crate::test_support::system_calls;
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    let mut checkout = new_checkout(true);
    checkout.checkout_url = "https://checkout.creem.io.evil.example/x".into();
    queue_order(&api, checkout);
    // Lần hỏi đầu chờ tới khi test cho phép: đơn chắc chắn còn lưu lúc đọc lại bên dưới.
    let (release, hold) = std::sync::mpsc::channel();
    *api.order_hold.lock().unwrap() = Some(hold);
    let args = json!({ "plan": "monthly", "email": "a@b.vn", "consent": true, "renew": false, "currency": "USD" });
    let view = invoke(&main, "start_checkout", args).unwrap();
    assert_eq!(view.get("qrSvg"), Some(&Value::Null));
    assert!(system_calls(&app).is_empty(), "URL bị từ chối: không mở gì");
    let pending = invoke(&main, "get_pending_order", json!({})).unwrap();
    assert_eq!(
        (
            pending["orderCode"].as_i64(),
            pending["amount"].as_i64(),
            pending["currency"].as_str(),
            pending["provider"].as_str()
        ),
        (Some(8), Some(399), Some("USD"), Some("creem"))
    );
    assert_eq!(pending.get("qrSvg"), Some(&Value::Null));
    assert!(!pending.to_string().contains("tok"), "order_token không ra giao diện");
    let refused = invoke(&main, "open_checkout_page", json!({})).unwrap_err();
    assert_eq!(open_error(&refused), "open_failed:not_allowed");
    release.send(()).unwrap();
    poller_asked_and_stopped(&app, &api);
    assert_eq!(invoke(&main, "get_pending_order", json!({})).unwrap(), Value::Null);
}

/// Trình mở của hệ điều hành báo lỗi (`open` của macOS in nguyên URL trong lỗi; M4 của review C1): lệnh tạo đơn vẫn trả
/// đơn, còn lỗi của "Mở lại trang thanh toán" (cũng là chữ ghi log khi tự mở không được) chỉ có nhãn cố định, không có URL.
#[test]
fn a_failing_browser_leaves_no_url_in_the_error() {
    use crate::test_support::{fail_opening_links, system_calls};
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    fail_opening_links(&app);
    queue_checkout(&api, true);
    let (release, hold) = std::sync::mpsc::channel();
    *api.order_hold.lock().unwrap() = Some(hold);
    let args = json!({ "plan": "monthly", "email": "a@b.vn", "consent": true, "renew": false, "currency": "USD" });
    let view = invoke(&main, "start_checkout", args).unwrap();
    assert_eq!(view["orderCode"], 8);
    assert_eq!(
        system_calls(&app),
        ["open_external_url https://checkout.creem.io/ch_abc"],
        "đã thử mở"
    );
    let refused = invoke(&main, "open_checkout_page", json!({})).unwrap_err();
    assert_eq!(open_error(&refused), "open_failed:opener");
    release.send(()).unwrap();
    poller_asked_and_stopped(&app, &api);
}

/// Người dùng hủy đơn A rồi tạo đơn B trong lúc luồng hỏi nền còn chờ server trả lời cho A (I1 của review C1). Lệnh tạo B
/// không bật được luồng mới (luồng của A còn chạy), nên khi A có kết quả cuối, luồng phải chuyển sang hỏi B chứ không dừng.
/// Hai biến thể: A là đơn thẻ server báo `expired`, và A là đơn VietQR đã quá hạn mà server còn báo `pending` (app tự tính
/// `Failed`).
#[test]
fn the_poller_moves_on_to_an_order_created_while_it_was_asking_about_a_cancelled_one() {
    for card in [true, false] {
        let app = mock_app();
        let main = window(&app, "main");
        let (api, _) = license_for(&app);
        let mut first = new_checkout(card);
        if !card {
            first.expires_at = crate::license::app::now() - 1;
        }
        api.checkouts.lock().unwrap().push_back(Ok(first));
        let answer = if card { "expired" } else { "pending" };
        api.orders.lock().unwrap().push_back(Ok(order_status(8, answer)));
        let (release, hold) = std::sync::mpsc::channel();
        *api.order_hold.lock().unwrap() = Some(hold);
        let currency = if card { "USD" } else { "VND" };
        let args =
            json!({ "plan": "monthly", "email": "a@b.vn", "consent": true, "renew": false, "currency": currency });
        invoke(&main, "start_checkout", args).unwrap();
        wait_until("luồng hỏi nền hỏi đơn A", || {
            api.calls.lock().unwrap().iter().any(|c| c == "order 8 tok")
        });
        invoke(&main, "cancel_checkout", json!({})).unwrap();
        let mut second = new_checkout(true);
        second.order_code = 9;
        queue_order(&api, second);
        let args = json!({ "plan": "yearly", "email": "a@b.vn", "consent": true, "renew": false, "currency": "USD" });
        invoke(&main, "start_checkout", args).unwrap();
        assert_eq!(invoke(&main, "get_pending_order", json!({})).unwrap()["orderCode"], 9);
        release.send(()).unwrap();
        wait_until("luồng hỏi nền hỏi đơn B", || {
            api.calls.lock().unwrap().iter().any(|c| c == "order 9 tok")
        });
        let licensing = app.state::<crate::license::app::Licensing>();
        wait_until("luồng hỏi nền dừng", || !licensing.polling());
        assert_eq!(
            invoke(&main, "get_pending_order", json!({})).unwrap(),
            Value::Null,
            "B đã có kết quả cuối (refunded)"
        );
    }
}

/// Kho khóa không xóa được đơn vừa có kết quả cuối (I1 của review C1): kho còn đúng đơn vừa hỏi, không phải đơn khác, nên
/// luồng hỏi vẫn dừng thay vì hỏi lại đơn đó liên tục.
#[test]
fn a_finished_order_the_keystore_cannot_delete_does_not_keep_the_poller_running() {
    let app = mock_app();
    let main = window(&app, "main");
    let (api, vault, _) = license_with_vault(&app);
    *vault.fail_deletes.lock().unwrap() = true;
    queue_checkout(&api, true);
    let args = json!({ "plan": "monthly", "email": "a@b.vn", "consent": true, "renew": false, "currency": "USD" });
    invoke(&main, "start_checkout", args).unwrap();
    poller_asked_and_stopped(&app, &api);
    let asked = api.calls.lock().unwrap().iter().filter(|c| *c == "order 8 tok").count();
    assert_eq!(asked, 1, "chỉ hỏi một lần");
    assert_eq!(
        invoke(&main, "get_pending_order", json!({})).unwrap()["orderCode"],
        8,
        "xóa lỗi nên đơn còn trong kho"
    );
}

/// Đơn đang chờ do bản app cũ lưu (không có `provider`, `amount`, `currency`; KH03-T3-a): mở lại vẫn vẽ mã QR, là đơn PayOS,
/// số tiền 0 và loại tiền rỗng (giao diện tự suy).
#[test]
fn a_pending_order_saved_by_an_older_app_still_shows_its_qr() {
    use crate::license::store;
    let app = mock_app();
    let main = window(&app, "main");
    let (_, license) = license_for(&app);
    let raw = json!({
        "order_code": 7, "order_token": "tok", "plan": "monthly", "expires_at": crate::license::app::now() + 900,
        "renewal": false, "checkout_url": "https://pay.payos.vn/web/abc", "qr_code": "000201",
    });
    license.vault().set(store::ORDER, raw.to_string().as_bytes()).unwrap();
    let pending = invoke(&main, "get_pending_order", json!({})).unwrap();
    assert!(pending["qrSvg"].as_str().unwrap().contains("<svg"));
    assert_eq!(
        (
            pending["provider"].as_str(),
            pending["amount"].as_i64(),
            pending["currency"].as_str()
        ),
        (Some("payos"), Some(0), Some(""))
    );
}

/// Lệnh bản quyền đọc hay ghi kho khóa không chạy trên luồng chính (N-1 của review cuối 06): Keychain có thể chờ người dùng
/// trả lời hộp thoại quyền truy cập, khi đó cửa sổ, khay và thanh phụ đề sẽ đứng. Kho khóa giả ghi lại luồng của mỗi lần đọc
/// ghi: lệnh đồng bộ chạy ngay trên luồng gọi `invoke` (luồng của test), lệnh `async` chạy trên luồng của `spawn_blocking`.
#[test]
fn license_commands_touch_the_keystore_off_the_calling_thread() {
    use crate::license::manager::tests::{DEVICE, FakeApi, test_keys, vn};
    use crate::license::manager::{License, Machine};
    use crate::license::store::tests::FakeVault;
    use crate::license::store::{self, PendingOrder, Vault};
    use std::thread::ThreadId;

    #[derive(Default)]
    struct ThreadVault {
        inner: FakeVault,
        threads: Mutex<Vec<ThreadId>>,
    }
    impl ThreadVault {
        fn seen(&self) {
            self.threads.lock().unwrap().push(std::thread::current().id());
        }
    }
    impl Vault for Arc<ThreadVault> {
        fn get(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
            self.seen();
            self.inner.get(name)
        }
        fn set(&self, name: &str, value: &[u8]) -> Result<(), String> {
            self.seen();
            self.inner.set(name, value)
        }
        fn delete(&self, name: &str) -> Result<(), String> {
            self.seen();
            self.inner.delete(name)
        }
    }

    let app = mock_app();
    let main = window(&app, "main");
    let vault = Arc::new(ThreadVault::default());
    let license = License::new(
        Box::new(Arc::new(FakeApi::default())),
        Box::new(vault.clone()),
        test_keys(),
        Machine {
            id_hash: DEVICE.into(),
            label: None,
        },
        vn(),
        true,
        false,
        false,
        crate::license::app::now(),
    );
    license.set_genuine(true);
    crate::license::app::install_with(app.handle(), license);
    let order = PendingOrder {
        order_code: 7,
        order_token: "tok".into(),
        plan: "monthly".into(),
        expires_at: crate::license::app::now() + 900,
        renewal: false,
        checkout_url: "https://pay.payos.vn/web/abc".into(),
        qr_code: Some("000201".into()),
        provider: "payos".into(),
        amount: 50_000,
        currency: "VND".into(),
    };
    store::write(&vault, store::ORDER, &order).unwrap();
    let here = std::thread::current().id();
    for cmd in ["get_pending_order", "open_checkout_page", "cancel_checkout"] {
        vault.threads.lock().unwrap().clear();
        let _ = invoke(&main, cmd, json!({}));
        let threads = vault.threads.lock().unwrap().clone();
        assert!(!threads.is_empty(), "{cmd} đọc hay ghi kho khóa");
        assert!(threads.iter().all(|t| *t != here), "{cmd} chạy trên luồng gọi lệnh");
    }
}

/// Key đang dùng ở máy khác: lệnh kích hoạt trả danh sách máy để gỡ hay "Vẫn kích hoạt" (spec 2026-10-07 §4.2), không
/// phải lỗi.
#[test]
fn activating_a_key_in_use_returns_its_devices() {
    use crate::license::client::{ApiError, Device, ServerError};
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(ApiError::Server(Box::new(ServerError {
            status: 409,
            code: "key_in_use".into(),
            devices: vec![Device {
                activation_id: "a1".into(),
                device_label: None,
                last_validated_at: Some(1),
            }],
            ..ServerError::default()
        }))));
    let out = invoke(
        &main,
        "activate_license",
        json!({ "key": crate::license::manager::tests::KEY }),
    )
    .unwrap();
    assert_eq!(out["view"], Value::Null);
    assert_eq!(out["devices"][0]["activation_id"], "a1");
    let bad = invoke(&main, "activate_license", json!({ "key": "abc" })).unwrap_err();
    assert!(bad.contains("licenseInvalidKey"), "{bad}");
}

/// Activation của hai máy trong các test xung đột (UUID như server cấp).
const ACT_1: &str = "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60";
const ACT_2: &str = "9b1f2c3d-4e5a-4b6c-8d7e-0f1a2b3c4d5e";

/// Claims của license Monthly cấp lúc `issued_at` (giờ thật), cho các test bản quyền của app.
fn monthly_claims(activation_id: &str, issued_at: i64) -> Value {
    json!({
        "kid": "test-1", "license_id": "lic", "activation_id": activation_id, "activation_created_at": issued_at,
        "device_id_hash": crate::license::manager::tests::DEVICE, "plan": "monthly",
        "expires_at": issued_at + 30 * 86_400, "cycle_anchor": issued_at,
        "quota_minutes_per_cycle": 3000, "quota_epoch": 0, "quota_fresh": true,
        "issued_at": issued_at, "refresh_before": issued_at + 14 * 86_400,
    })
}

/// Lỗi `409` có danh sách máy.
fn devices_error(code: &str, ids: &[&str]) -> crate::license::client::ApiError {
    use crate::license::client::{ApiError, Device, ServerError};
    ApiError::Server(Box::new(ServerError {
        status: 409,
        code: code.into(),
        devices: ids
            .iter()
            .map(|id| Device {
                activation_id: (*id).into(),
                device_label: None,
                last_validated_at: Some(1),
            })
            .collect(),
        ..ServerError::default()
    }))
}

/// Free (spec 2026-10-07 §3.2, §6): chưa đăng ký được dùng thử thì báo cần mạng; dùng thử đã hết thì báo hết dùng thử.
#[test]
fn a_free_session_needs_a_running_trial() {
    use crate::license::client::ApiError;
    use crate::license::manager::tests::{DEVICE, trial_grant};
    let app = mock_app();
    let (api, _) = license_for(&app);
    api.trials
        .lock()
        .unwrap()
        .push_back(Err(ApiError::Network("tắt mạng".into())));
    let refused = session::start(app.handle()).unwrap_err();
    assert_eq!(refused.code, errors::TRIAL_NEEDS_NETWORK);
    let now = crate::license::app::now();
    api.trials.lock().unwrap().push_back(trial_grant(
        DEVICE,
        now - 20 * 86_400,
        now - 10 * 86_400,
        now - 20 * 86_400,
    ));
    let refused = session::start(app.handle()).unwrap_err();
    assert_eq!(refused.code, errors::TRIAL_ENDED);
    assert_eq!(
        app.state::<AppState>().status().session_error.as_deref(),
        Some(errors::TRIAL_ENDED)
    );
}

/// Bước Điều khoản gọi `start_trial`: app đăng ký dùng thử chạy nền, báo giao diện qua `license://changed`.
#[test]
fn the_terms_step_starts_the_trial_in_the_background() {
    let app = mock_app();
    let main = window(&app, "main");
    let views = record(&app, crate::license::app::LICENSE_CHANGED);
    let (api, license) = license_for(&app);
    invoke(&main, "start_trial", json!({})).unwrap();
    wait_until("đăng ký dùng thử", || {
        api.calls.lock().unwrap().iter().any(|c| c.starts_with("trial "))
    });
    let now = crate::license::app::now();
    wait_until("báo giao diện", || {
        views
            .lock()
            .unwrap()
            .last()
            .is_some_and(|v| v["trial"]["status"] == "active")
    });
    assert!(!license.trial_due(now), "đã có token: ticker không gọi nữa");
}

/// Bắt đầu phiên trả phí mà lần kiểm gần nhất đã quá 1 giờ: kiểm lại chạy nền; key đang xung đột thì dừng phiên với
/// `licenseConflict` (spec 2026-10-07 §4.2).
#[test]
fn a_conflict_found_when_a_paid_session_starts_stops_it() {
    use crate::license::manager::tests::{KEY, granted};
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    let (api, license) = license_for(&app);
    let then = crate::license::app::now() - 3700;
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims("act", then), true));
    license.activate(KEY, then).unwrap();
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(devices_error("license_conflict", &["act", "b"])));
    session::start(app.handle()).unwrap();
    let state = app.state::<AppState>();
    wait_until("phiên dừng vì xung đột", || {
        state.status().session == SessionStatus::Error
    });
    assert_eq!(state.status().session_error.as_deref(), Some(errors::LICENSE_CONFLICT));
    assert!(!license.is_pro(crate::license::app::now()), "không còn gói trả phí");
}

/// "Vẫn kích hoạt" rồi "Gỡ máy kia" bằng key đã lưu: hết xung đột, nhận token lại.
#[test]
fn activating_anyway_then_removing_the_other_machine() {
    use crate::license::manager::tests::{KEY, granted};
    let app = mock_app();
    let main = window(&app, "main");
    let (api, _) = license_for(&app);
    let crate::license::client::ApiError::Server(mut conflict) = devices_error("license_conflict", &[ACT_1, ACT_2])
    else {
        unreachable!()
    };
    conflict.activation_id = Some(ACT_2.into());
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(crate::license::client::ApiError::Server(conflict)));
    let out = invoke(&main, "activate_license", json!({ "key": KEY, "allowConflict": true })).unwrap();
    assert_eq!(out["view"]["standing"], "conflict");
    assert_eq!(out["view"]["conflict"]["thisActivationId"], ACT_2);
    let now = crate::license::app::now();
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims(ACT_2, now), false));
    invoke(&main, "deactivate_other_device", json!({ "activationId": ACT_1 })).unwrap();
    let calls = api.calls.lock().unwrap().clone();
    assert!(
        calls
            .iter()
            .any(|c| c == &format!("deactivate 0123456789ABCDEFGHJKMNPQRST5 {ACT_1}")),
        "{calls:?}"
    );
    assert_eq!(
        calls.last().unwrap(),
        &format!("validate 0123456789ABCDEFGHJKMNPQRST5 {ACT_2}")
    );
    let view = invoke(&main, "get_license", json!({})).unwrap();
    assert_eq!(view["standing"], "active");
}

/// `check_start` nêu lý do của gói trả phí (key xung đột, bị thu hồi) khi dùng thử đã hết, và mã lỗi của lần đăng ký dùng thử
/// khi server từ chối (Task 8 của 02a).
#[test]
fn check_start_names_the_reason_of_the_plan_and_of_a_failed_trial() {
    use crate::license::client::{ApiError, ServerError};
    use crate::license::manager::tests::{DEVICE, KEY, granted, server, trial_grant};
    let now = crate::license::app::now();
    let ended = || trial_grant(DEVICE, now - 20 * 86_400, now - 10 * 86_400, now - 20 * 86_400);
    let app = mock_app();
    let (api, license) = license_for(&app);
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims("act", now), true));
    license.activate(KEY, now).unwrap();
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(devices_error("license_conflict", &["act", "b"])));
    let _ = license.validate(now);
    api.trials.lock().unwrap().push_back(ended());
    assert_eq!(session::start(app.handle()).unwrap_err().code, errors::LICENSE_CONFLICT);
    let app = mock_app();
    let (api, license) = license_for(&app);
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims("act", now), true));
    license.activate(KEY, now).unwrap();
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(server(403, "license_revoked")));
    let _ = license.validate(now);
    api.trials.lock().unwrap().push_back(ended());
    assert_eq!(session::start(app.handle()).unwrap_err().code, "licenseRevoked");
    // Free chưa có dùng thử, server từ chối (503) thì báo "thử lại sau", không phải "cần mạng".
    let app = mock_app();
    let (api, _) = license_for(&app);
    api.trials
        .lock()
        .unwrap()
        .push_back(Err(ApiError::Server(Box::new(ServerError {
            status: 503,
            code: "trial_not_configured".into(),
            ..ServerError::default()
        }))));
    assert_eq!(session::start(app.handle()).unwrap_err().code, "licenseServer");
}

/// `abort` chỉ chạm tới lần bắt đầu đã nhờ nó: kết quả kiểm bản quyền tới muộn của phiên cũ không dừng phiên mới.
#[test]
fn abort_only_touches_the_attempt_that_asked_for_it() {
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    session::start(app.handle()).unwrap();
    let first = session::attempt(app.handle());
    session::stop(app.handle());
    session::start(app.handle()).unwrap();
    let second = session::attempt(app.handle());
    assert_ne!(first, second);
    let state = app.state::<AppState>();
    session::abort(app.handle(), first, errors::LICENSE_CONFLICT, "kết quả của phiên cũ");
    assert_eq!(state.status().session, SessionStatus::Running);
    session::abort(app.handle(), second, errors::LICENSE_CONFLICT, "đúng phiên này");
    assert_eq!(state.status().session, SessionStatus::Error);
    assert_eq!(state.status().session_error.as_deref(), Some(errors::LICENSE_CONFLICT));
}

/// Phiên trả phí S1 có kiểm nhanh đang treo; người dùng dừng S1, gỡ key, bắt đầu S2 ở Free; kết quả kiểm nhanh (xung đột) tới
/// muộn không được dừng S2.
#[test]
fn a_late_quick_check_cannot_stop_a_newer_session() {
    use crate::license::manager::tests::{KEY, granted};
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let _main = window(&app, "main");
    let (api, license) = license_for(&app);
    let then = crate::license::app::now() - 3700;
    api.replies
        .lock()
        .unwrap()
        .push_back(granted(&monthly_claims("act", then), true));
    license.activate(KEY, then).unwrap();
    let (release, hold) = std::sync::mpsc::channel();
    *api.validate_hold.lock().unwrap() = Some(hold);
    api.replies
        .lock()
        .unwrap()
        .push_back(Err(devices_error("license_conflict", &["act", "b"])));
    session::start(app.handle()).unwrap();
    wait_until("kiểm nhanh đã gọi server", || {
        api.calls.lock().unwrap().iter().any(|c| c.starts_with("validate "))
    });
    session::stop(app.handle());
    license.deactivate(None).unwrap();
    session::start(app.handle()).unwrap();
    let state = app.state::<AppState>();
    assert_eq!(state.status().session, SessionStatus::Running);
    release.send(()).unwrap();
    wait_until("kiểm nhanh trả kết quả", || {
        api.validate_returned.load(std::sync::atomic::Ordering::SeqCst) == 1
    });
    // Nếu `abort` không phân biệt phiên thì S2 bị dừng ngay sau đây: chờ dư để thấy.
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(state.status().session, SessionStatus::Running, "S2 không bị dừng");
    assert_eq!(state.status().session_error, None);
}

// Tự cập nhật (kế hoạch 07b): lệnh khởi động lại, đổi kênh, cài ở lúc thoát.

/// Việc của `kill_all` giả và của bản cập nhật giả, cùng một chỗ để so thứ tự.
static UPDATE_LOG: std::sync::LazyLock<crate::updater::tests::Log> = std::sync::LazyLock::new(Default::default);

fn kill_all_into_update_log() {
    UPDATE_LOG.lock().unwrap().push("kill_all".into());
}

/// App giả có tự cập nhật với bản giả: manifest báo bản 0.2.0.
fn app_with_update(log: crate::updater::tests::Log) -> tauri::App<tauri::test::MockRuntime> {
    use crate::updater::tests::{Answer, NOW, fake_with_log};
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    });
    let clock = Arc::new(std::sync::atomic::AtomicU64::new(NOW));
    let (updater, _log, _dir) = fake_with_log(vec![Answer::Newer("0.2.0")], clock, log);
    app.manage(Arc::new(updater));
    app
}

fn updater_of(app: &tauri::App<tauri::test::MockRuntime>) -> Arc<crate::updater::Updater> {
    app.state::<Arc<crate::updater::Updater>>().inner().clone()
}

#[test]
fn restart_to_update_needs_a_download_and_an_idle_app() {
    use std::sync::atomic::{AtomicBool, Ordering};
    static RESTARTED: AtomicBool = AtomicBool::new(false);
    fn fake_restart(_: &tauri::AppHandle<tauri::test::MockRuntime>) {
        RESTARTED.store(true, Ordering::SeqCst);
    }
    let code = |r: Result<Value, String>| -> String {
        serde_json::from_str::<Value>(&r.unwrap_err())
            .map(|v| v["code"].as_str().unwrap_or("").to_string())
            .unwrap_or_default()
    };
    // Bản build không có nguồn cập nhật: không có `Updater`.
    let plain = mock_app();
    assert_eq!(
        code(invoke(&window(&plain, "main"), "restart_to_update", json!({}))),
        errors::UPDATE_NOT_READY
    );

    let log = crate::updater::tests::Log::default();
    let app = app_with_update(log.clone());
    let main = window(&app, "main");
    assert_eq!(
        code(invoke(&main, "restart_to_update", json!({}))),
        errors::UPDATE_NOT_READY
    );
    assert_eq!(
        invoke(&main, "get_app_status", json!({})).unwrap()["updateReady"],
        Value::Null
    );
    // Bản test không có Team ID (ký ad-hoc): chỉ macOS báo trước sẽ bị hỏi lại sau cập nhật.
    assert_eq!(
        invoke(&main, "get_app_status", json!({})).unwrap()["updateReprompts"],
        Value::Bool(cfg!(target_os = "macos"))
    );

    assert!(updater_of(&app).tick(crate::settings::UpdateChannel::Stable));
    crate::updater::publish(app.handle());
    assert_eq!(
        invoke(&main, "get_app_status", json!({})).unwrap()["updateReady"],
        "0.2.0"
    );

    session::start(app.handle()).unwrap();
    assert_eq!(
        code(invoke(&main, "restart_to_update", json!({}))),
        errors::UPDATE_BUSY,
        "đang dịch"
    );
    session::stop(app.handle());
    assert!(!RESTARTED.load(Ordering::SeqCst));

    crate::updater::restart_to_update(app.handle(), fake_restart).unwrap();
    wait_until("gọi khởi động lại", || RESTARTED.load(Ordering::SeqCst));
    // Sau đó `RunEvent::Exit` cài bản mới, và báo bộ cài Windows mở lại app.
    crate::handle_run_event(app.handle(), tauri::RunEvent::Exit, || {});
    assert!(
        log.lock()
            .unwrap()
            .contains(&"install 0.2.0 [bộ cài 0.2.0] restart=true".to_string()),
        "{:?}",
        log.lock().unwrap()
    );
}

/// Nút "Kiểm tra cập nhật" (Cài đặt › Chung, menu khay): kiểm ngay, tải bản mới rồi mời khởi động lại; bản build không tự
/// cập nhật thì báo `unavailable`.
#[test]
fn checking_for_updates_downloads_the_new_version_or_says_it_is_unavailable() {
    let plain = mock_app();
    let status = invoke(&window(&plain, "main"), "check_for_updates", json!({})).unwrap();
    assert_eq!(status["updateCheck"], "unavailable");

    let log = crate::updater::tests::Log::default();
    let app = app_with_update(log.clone());
    let main = window(&app, "main");
    assert_eq!(
        invoke(&main, "get_app_status", json!({})).unwrap()["updateCheck"],
        "idle"
    );
    let status = invoke(&main, "check_for_updates", json!({})).unwrap();
    assert_eq!(
        (&status["updateReady"], &status["updateCheck"]),
        (&json!("0.2.0"), &json!("idle"))
    );
    assert!(log.lock().unwrap().contains(&"download 0.2.0".to_string()));
    // Manifest không còn báo bản nào mới hơn: đã là bản mới nhất, bản đã tải bị bỏ.
    let status = invoke(&main, "check_for_updates", json!({})).unwrap();
    assert_eq!(
        (&status["updateReady"], &status["updateCheck"]),
        (&Value::Null, &json!("upToDate"))
    );
}

/// Thoát ở menu khay cũng cài bản đã tải, sau khi kill tiến trình phụ và lưu lịch sử; bộ cài Windows không mở lại app.
/// `RunEvent::Exit` mà người dùng không yêu cầu (tắt máy, đăng xuất) thì không cài.
#[test]
fn a_user_quit_installs_the_download_after_killing_sidecars() {
    let app = app_with_update(UPDATE_LOG.clone());
    updater_of(&app).tick(crate::settings::UpdateChannel::Stable);
    UPDATE_LOG.lock().unwrap().clear();
    crate::handle_run_event(app.handle(), tauri::RunEvent::Exit, kill_all_into_update_log);
    assert_eq!(
        *UPDATE_LOG.lock().unwrap(),
        ["kill_all"],
        "tắt máy, đăng xuất: không cài"
    );
    UPDATE_LOG.lock().unwrap().clear();
    // Phần đồng bộ của Thoát ở menu khay (`actions::quit` gọi rồi mới dừng phiên và thoát).
    crate::actions::prepare_quit(app.handle());
    crate::handle_run_event(app.handle(), tauri::RunEvent::Exit, kill_all_into_update_log);
    assert_eq!(
        *UPDATE_LOG.lock().unwrap(),
        ["kill_all", "install 0.2.0 [bộ cài 0.2.0] restart=false"]
    );
}

#[test]
fn changing_the_update_channel_wakes_the_updater() {
    let app = app_with_update(Default::default());
    let updater = updater_of(&app);
    let waiter = updater.clone();
    let started = Instant::now();
    let done = std::thread::spawn(move || waiter.wait(Duration::from_secs(30)));
    std::thread::sleep(Duration::from_millis(50));
    let main = window(&app, "main");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "updateChannel": "beta" } }),
    )
    .unwrap();
    done.join().unwrap();
    assert!(started.elapsed() < Duration::from_secs(10), "đổi kênh thì kiểm ngay");
}

/// Spec 2026-10-10 §5, §6.3 (QĐ1, QĐ2 của kế hoạch 03): máy chưa đủ sức thì phiên dịch sau mỗi câu ngay từ đầu, và trạng
/// thái báo để Cài đặt › Phụ đề ghi chú. Ghi chú còn sau khi dừng; phiên sau trên máy đủ sức thì hết.
#[test]
fn a_slow_machine_translates_after_each_sentence_from_the_start() {
    use std::sync::atomic::Ordering;
    let deps = FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    };
    let slow = deps.slow_machine.clone();
    slow.store(true, Ordering::SeqCst);
    let app = mock_app_with(deps);
    let main = window(&app, "main");
    let state = app.state::<AppState>();
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "running");
    assert_eq!(status["streamingTooSlow"], true, "biết ngay lúc bắt đầu phiên");
    wait_until("engine báo phiên dịch sau mỗi câu", || {
        state.status().indicators.streaming_unavailable
    });
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "idle");
    assert_eq!(status["streamingTooSlow"], true, "ghi chú còn sau khi dừng");
    assert_eq!(status["indicators"]["streamingUnavailable"], false);
    slow.store(false, Ordering::SeqCst);
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(
        status["streamingTooSlow"], false,
        "phiên mới trên máy đủ sức thì hết ghi chú"
    );
    invoke(&main, "toggle_session", json!({})).unwrap();
}

/// Ghi lại payload của một sự kiện tới đúng cửa sổ `window` (sự kiện gửi riêng cho cửa sổ khác thì không có ở đây).
fn heard(window: &tauri::WebviewWindow<tauri::test::MockRuntime>, event: &str) -> Arc<Mutex<Vec<Value>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    window.listen(event, move |e| {
        sink.lock().unwrap().push(serde_json::from_str(e.payload()).unwrap())
    });
    received
}

/// Id lớn nhất trong các payload có trường `id`; 0 khi chưa có.
fn max_id(values: &[Value]) -> u64 {
    values.iter().filter_map(|v| v["id"].as_u64()).max().unwrap_or(0)
}

/// Spec 2026-10-10 §6.2, §6.3, QĐ5 (QĐ4, QĐ5 của kế hoạch 03): qua engine thật, dòng đang nói và lệnh gỡ nó chỉ tới thanh
/// phụ đề. Tắt công tắc giữa phiên thì từ đoạn kế tiếp không còn dòng đang nói (đoạn đang mở lúc tắt thì còn được); bật lại
/// thì có lại.
#[test]
fn live_lines_reach_only_the_overlay_and_follow_the_switch_mid_session() {
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::LongTone,
        ..FakeDeps::default()
    });
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");
    let lives = heard(&overlay, SUBTITLE_LIVE);
    let ends = heard(&overlay, SUBTITLE_LIVE_END);
    let (lives_to_main, ends_to_main) = (heard(&main, SUBTITLE_LIVE), heard(&main, SUBTITLE_LIVE_END));
    let upserts = record(&app, SUBTITLE_UPSERT);
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "translateWhileSpeaking": true } }),
    )
    .unwrap();
    invoke(&main, "toggle_session", json!({})).unwrap();
    wait_until("có dòng đang nói", || !lives.lock().unwrap().is_empty());
    wait_until("có lệnh gỡ dòng đang nói", || !ends.lock().unwrap().is_empty());
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "translateWhileSpeaking": false } }),
    )
    .unwrap();
    let cutoff = max_id(&upserts.lock().unwrap()).max(max_id(&lives.lock().unwrap())) + 1;
    wait_until("hai câu sau mốc tắt đã dịch xong", || {
        upserts
            .lock()
            .unwrap()
            .iter()
            .any(|s| s["status"] == "done" && s["id"].as_u64().unwrap_or(0) > cutoff + 1)
    });
    let late: Vec<u64> = lives
        .lock()
        .unwrap()
        .iter()
        .filter_map(|v| v["id"].as_u64())
        .filter(|id| *id > cutoff)
        .collect();
    assert!(late.is_empty(), "đã tắt mà đoạn sau vẫn có dòng đang nói: {late:?}");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "translateWhileSpeaking": true } }),
    )
    .unwrap();
    let resumed = max_id(&upserts.lock().unwrap());
    wait_until("bật lại thì đoạn mới có dòng đang nói", || {
        lives
            .lock()
            .unwrap()
            .iter()
            .any(|v| v["id"].as_u64().unwrap_or(0) > resumed)
    });
    invoke(&main, "toggle_session", json!({})).unwrap();
    assert!(
        lives_to_main.lock().unwrap().is_empty(),
        "cửa sổ chính không nhận (QĐ5)"
    );
    assert!(ends_to_main.lock().unwrap().is_empty());
    let line = lives.lock().unwrap()[0].clone();
    for key in [
        "id",
        "extends",
        "src_lang",
        "src_stable",
        "src_tail",
        "tgt_stable",
        "tgt_tail",
        "tgt_src_units",
    ] {
        assert!(line.get(key).is_some(), "LiveLine thiếu {key}: {line}");
    }
}

/// Spec 2026-10-10 §5: máy chưa đủ sức thì không có dòng đang nói nào, chỉ bản cuối.
#[test]
fn a_slow_machine_sends_no_live_lines() {
    let deps = FakeDeps {
        audio: FakeAudio::LongTone,
        ..FakeDeps::default()
    };
    deps.slow_machine.store(true, std::sync::atomic::Ordering::SeqCst);
    let app = mock_app_with(deps);
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");
    let lives = heard(&overlay, SUBTITLE_LIVE);
    let upserts = record(&app, SUBTITLE_UPSERT);
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "translateWhileSpeaking": true } }),
    )
    .unwrap();
    invoke(&main, "toggle_session", json!({})).unwrap();
    wait_until("hai câu dịch xong", || {
        upserts.lock().unwrap().iter().filter(|s| s["status"] == "done").count() >= 2
    });
    invoke(&main, "toggle_session", json!({})).unwrap();
    assert!(
        lives.lock().unwrap().is_empty(),
        "công tắc bật nhưng máy chưa đủ sức: dịch sau mỗi câu"
    );
}

/// QĐ4 của kế hoạch 03: đổi công tắc "Dịch trong lúc người nói chưa dừng" trong lúc phiên đang chuẩn bị (nạp model, tới 180
/// giây) thì phiên theo giá trị mới ngay từ đầu. Lúc đổi chưa có engine nên `session::set_streaming_enabled` không làm gì;
/// phiên chỉ theo giá trị mới nhờ `start_with` đọc lại cài đặt lúc gắn engine.
#[test]
fn the_switch_changed_while_preparing_holds_from_the_start() {
    for on in [false, true] {
        let gate = Arc::new(PrepareGate::default());
        let app = mock_app_with(FakeDeps {
            audio: FakeAudio::LongTone,
            prepare_gate: Some(gate.clone()),
            ..FakeDeps::default()
        });
        let main = window(&app, "main");
        let overlay = window(&app, "overlay");
        let lives = heard(&overlay, SUBTITLE_LIVE);
        let upserts = record(&app, SUBTITLE_UPSERT);
        let switch = |value: bool| {
            invoke(
                &main,
                "update_settings",
                json!({ "patch": { "translateWhileSpeaking": value } }),
            )
            .unwrap();
        };
        switch(!on);
        let handle = app.handle().clone();
        let starting = std::thread::spawn(move || session::start(&handle));
        wait_until("đang chờ nạp model", || gate.waiting() == 1);
        assert!(
            !app.state::<session::Session>().has_engine(),
            "đang chuẩn bị: chưa có engine"
        );
        switch(on);
        gate.open();
        assert_eq!(starting.join().unwrap().unwrap().session, SessionStatus::Running);
        if on {
            wait_until("bật trong lúc chuẩn bị: có dòng đang nói", || {
                !lives.lock().unwrap().is_empty()
            });
        } else {
            wait_until("tắt trong lúc chuẩn bị: hai câu dịch xong", || {
                upserts.lock().unwrap().iter().filter(|s| s["status"] == "done").count() >= 2
            });
            assert!(
                lives.lock().unwrap().is_empty(),
                "tắt trong lúc chuẩn bị mà vẫn có dòng đang nói"
            );
        }
        session::stop(app.handle());
    }
}

// ---- Báo cáo lỗi gửi về nhà phát triển (spec 2026-10-17-diagnostics-reports-design.md §1, §2, §5) ----

mod reports {
    use super::*;
    use crate::capture::CaptureEvent;
    use crate::diagnostics::report::{Event, Kind};
    use crate::diagnostics::send::SendError;
    use crate::test_support::{enable_error_reports, install_reports};

    fn unix_now() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_secs() as i64)
    }

    fn sidecar_event() -> Event {
        Event {
            kind: Kind::SessionError,
            code: Some(errors::SIDECAR_FAILED.into()),
            location: String::new(),
            message: "tiến trình phụ không khởi động được".into(),
            at: unix_now(),
        }
    }

    /// Lỗi của chính app làm phiên dừng: báo cáo vào hàng đợi, và không có chữ chép lời hay bản dịch nào của phiên trong đó,
    /// dù phiên vừa dịch xong một câu (spec §2: log không bao giờ chứa nội dung cuộc họp).
    #[test]
    fn a_session_error_of_the_app_queues_one_report_that_holds_no_transcript() {
        let deps = FakeDeps {
            audio: FakeAudio::Tone,
            ..FakeDeps::default()
        };
        let events = deps.capture_events.clone();
        let app = mock_app_with(deps);
        let rig = install_reports(&app);
        enable_error_reports(&app);
        let main = window(&app, "main");
        let upserts = record(&app, SUBTITLE_UPSERT);
        invoke(&main, "toggle_session", json!({})).unwrap();
        wait_until("một phụ đề dịch xong", || {
            upserts.lock().unwrap().iter().any(|s| s["status"] == "done")
        });
        let failing = events.lock().unwrap().remove(0);
        failing(CaptureEvent::Failed {
            code: errors::CAPTURE_FAILED,
            message: "không mở được nguồn âm thanh".into(),
        });
        wait_until("báo cáo vào hàng đợi", || rig.reporter.pending_count() == 1);

        let report = rig.reporter.pending_reports().remove(0);
        let v: Value = serde_json::from_str(&report).unwrap();
        assert_eq!(
            (v["kind"].as_str(), v["code"].as_str()),
            (Some("session_error"), Some(errors::CAPTURE_FAILED))
        );
        for secret in ["Hello everyone", "Xin chào", "mọi người"] {
            assert!(!report.contains(secret), "báo cáo lộ \"{secret}\":\n{report}");
        }
        // Báo cáo dựng từ log thật của phiên, không rỗng: phiên vừa ghi dòng bắt đầu.
        let app_log = v["logs"]["app"].as_str().unwrap();
        assert!(app_log.contains("bắt đầu phiên dịch"), "{app_log}");
        assert!(app_log.contains("phiên dịch dừng vì lỗi captureFailed"), "{app_log}");
    }

    /// Lỗi do môi trường hay người dùng (quyền ghi âm), và lỗi khi tắt báo cáo tự động: không gửi gì, không tạo luồng nào.
    #[test]
    fn errors_that_are_not_the_apps_fault_and_the_off_switch_send_nothing() {
        let permission = FakeDeps {
            capture_error: Some(errors::AUDIO_PERMISSION),
            ..FakeDeps::default()
        };
        let capture = FakeDeps {
            capture_error: Some(errors::CAPTURE_FAILED),
            ..FakeDeps::default()
        };
        for (deps, enabled) in [(permission, true), (capture, false)] {
            let app = mock_app_with(deps);
            let rig = install_reports(&app);
            if enabled {
                enable_error_reports(&app);
            }
            let main = window(&app, "main");
            invoke(&main, "toggle_session", json!({})).unwrap();
            let state = app.state::<AppState>();
            wait_until("phiên dừng vì lỗi", || {
                state.status().session == SessionStatus::Error
            });
            assert_eq!(rig.reporter.pending_count(), 0);
            assert_eq!(rig.reporter.flush(), 0);
            assert!(rig.api.bodies.lock().unwrap().is_empty());
        }
    }

    /// Không bao giờ gửi lúc đang bắt đầu hay đang dịch (A7); dừng phiên xong thì gửi.
    #[test]
    fn no_report_is_sent_while_a_session_runs() {
        let app = mock_app_with(FakeDeps {
            audio: FakeAudio::Tone,
            ..FakeDeps::default()
        });
        let rig = install_reports(&app);
        enable_error_reports(&app);
        let main = window(&app, "main");
        rig.reporter.record(sidecar_event()).expect("xếp hàng một báo cáo");
        assert_eq!(
            invoke(&main, "toggle_session", json!({})).unwrap()["session"],
            "running"
        );
        assert_eq!(rig.reporter.flush(), 0);
        assert!(rig.api.bodies.lock().unwrap().is_empty(), "không gửi gì lúc đang dịch");
        assert_eq!(invoke(&main, "toggle_session", json!({})).unwrap()["session"], "idle");
        assert_eq!(rig.reporter.flush(), 1);
        assert_eq!(rig.api.bodies.lock().unwrap().len(), 1);
    }

    /// Nút "Gửi log cho hỗ trợ": gửi ngay, kể cả khi tắt tự động và đang dịch; trả mã báo cáo; lỗi có đúng ba mã.
    #[test]
    fn the_manual_command_sends_at_once_and_reports_its_errors_with_three_codes() {
        let app = mock_app_with(FakeDeps {
            audio: FakeAudio::Tone,
            ..FakeDeps::default()
        });
        let rig = install_reports(&app);
        let main = window(&app, "main");
        invoke(&main, "toggle_session", json!({})).unwrap();
        let sent = invoke(&main, "send_log_report", json!({})).unwrap();
        let id = sent["id"].as_str().unwrap();
        assert!(id.starts_with("R-") && id.len() == 11, "{id}");
        let bodies = rig.api.bodies.lock().unwrap().clone();
        assert_eq!(bodies.len(), 1);
        let v: Value = serde_json::from_str(&bodies[0]).unwrap();
        assert_eq!((v["id"].as_str(), v["kind"].as_str()), (Some(id), Some("manual")));
        assert_eq!(rig.reporter.pending_count(), 0, "gửi tay không vào hàng đợi");

        *rig.api.script.lock().unwrap() = vec![
            Err(SendError::RateLimited(Some(3600))),
            Err(SendError::Transient("mạng rớt".into())),
            Err(SendError::Rejected {
                status: 422,
                code: "rejected_sensitive".into(),
            }),
        ];
        for code in [
            errors::REPORT_RATE_LIMITED,
            errors::REPORT_FAILED,
            errors::REPORT_REJECTED,
        ] {
            let result = invoke(&main, "send_log_report", json!({}));
            assert!(
                matches!(&result, Err(message) if message.contains(code)),
                "{code}: {result:?}"
            );
        }
    }

    /// Tắt báo cáo lỗi tự động ở Cài đặt: các báo cáo đang chờ bị bỏ.
    #[test]
    fn turning_the_setting_off_drops_the_waiting_reports() {
        let app = mock_app();
        let rig = install_reports(&app);
        enable_error_reports(&app);
        let main = window(&app, "main");
        rig.reporter.record(sidecar_event()).expect("xếp hàng");
        assert_eq!(rig.reporter.pending_count(), 1);
        invoke(
            &main,
            "update_settings",
            json!({ "patch": { "sendErrorReports": true } }),
        )
        .unwrap();
        assert_eq!(rig.reporter.pending_count(), 1, "vẫn bật thì giữ");
        invoke(
            &main,
            "update_settings",
            json!({ "patch": { "sendErrorReports": false } }),
        )
        .unwrap();
        assert_eq!(rig.reporter.pending_count(), 0);
        assert_eq!(rig.reporter.flush(), 0);
    }
}
