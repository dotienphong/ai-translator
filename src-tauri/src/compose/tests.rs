//! Test Gõ dịch qua lệnh của cửa sổ `compose`, chạy bằng `MockRuntime` (spec 2026-10-17-go-dich §1.3, §1.5, §3, §4, §6). Bộ dịch
//! giả của `FakeDeps` dịch dòng nào cũng ra "Xin chào mọi người.".

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tauri::{Listener, Manager};

use crate::errors;
use crate::events::{COMPOSE_DELTA, COMPOSE_DONE, COMPOSE_LOADING, COMPOSE_OPEN, NAVIGATE};
use crate::test_support::{
    FakeDeps, PrepareGate, all_logs, capture_logs, compose_calls, invoke, mock_app, mock_app_with, window,
};

const FAKE: &str = "Xin chào mọi người.";

type App = tauri::App<tauri::test::MockRuntime>;

/// Ghi lại payload của một sự kiện tới đúng cửa sổ `window`.
fn heard(window: &tauri::WebviewWindow<tauri::test::MockRuntime>, event: &str) -> Arc<Mutex<Vec<Value>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    window.listen(event, move |e| {
        sink.lock().unwrap().push(serde_json::from_str(e.payload()).unwrap())
    });
    received
}

/// Chờ tới khi `ok` đúng, tối đa 10 giây.
fn wait_until(what: &str, ok: impl Fn() -> bool) {
    let started = Instant::now();
    while !ok() {
        assert!(started.elapsed() < Duration::from_secs(10), "chờ quá lâu: {what}");
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// Xin dịch `text` từ cửa sổ `compose`; trả số của yêu cầu.
fn translate(app: &App, text: &str) -> u64 {
    let compose = window(app, "compose");
    invoke(&compose, "compose_translate", json!({ "text": text }))
        .unwrap()
        .as_u64()
        .unwrap()
}

/// Kết quả (`outcome`) của yêu cầu `id`, chờ tới khi có.
fn outcome_of(done: &Arc<Mutex<Vec<Value>>>, id: u64) -> Value {
    wait_until("có kết quả", || done.lock().unwrap().iter().any(|d| d["id"] == id));
    let all = done.lock().unwrap();
    all.iter().find(|d| d["id"] == id).unwrap()["outcome"].clone()
}

fn submit(app: &App, id: u64) -> Result<Value, String> {
    invoke(&window(app, "compose"), "compose_submit", json!({ "id": id }))
}

#[test]
fn a_message_is_translated_line_by_line_and_pasted() {
    let app = mock_app();
    let compose = window(&app, "compose");
    let done = heard(&compose, COMPOSE_DONE);
    let deltas = heard(&compose, COMPOSE_DELTA);
    let id = translate(&app, "Mai mình gửi báo cáo nhé\n\nCảm ơn");
    assert_eq!(
        outcome_of(&done, id),
        json!({ "kind": "translated", "text": format!("{FAKE}\n\n{FAKE}") })
    );
    let lines: Vec<u64> = deltas
        .lock()
        .unwrap()
        .iter()
        .map(|d| d["line"].as_u64().unwrap())
        .collect();
    assert!(
        lines.contains(&0) && lines.contains(&2) && !lines.contains(&1),
        "{lines:?}"
    );
    assert_eq!(submit(&app, id).unwrap(), "pasted");
    assert_eq!(
        compose_calls(&app),
        [format!("clipboard {FAKE}\n\n{FAKE}"), "hide".into(), "paste".into()]
    );
    assert!(submit(&app, id).is_err(), "bản dịch đã dán thì không dán lại");
}

/// Spec §2.2: câu chắc chắn đã là ngôn ngữ đích thì không dịch; Enter dán nguyên văn.
#[test]
fn text_already_in_the_target_language_is_pasted_as_is() {
    let app = mock_app();
    let main = window(&app, "main");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "compose": { "target": "vi" } } }),
    )
    .unwrap();
    let done = heard(&window(&app, "compose"), COMPOSE_DONE);
    let id = translate(&app, "Mai mình gửi báo cáo nhé");
    assert_eq!(outcome_of(&done, id), json!({ "kind": "sameLanguage" }));
    submit(&app, id).unwrap();
    assert_eq!(compose_calls(&app)[0], "clipboard Mai mình gửi báo cáo nhé");
}

/// Spec §3.3, §3.4: yêu cầu mới hủy yêu cầu đang chạy (kết quả của nó bị bỏ, không dán được); lần đầu chưa có tiến trình phụ
/// nào chạy thì báo "Đang nạp model…".
#[test]
fn a_newer_request_replaces_the_older_one() {
    let gate = Arc::new(PrepareGate::default());
    let app = mock_app_with(FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    });
    let compose = window(&app, "compose");
    let done = heard(&compose, COMPOSE_DONE);
    let loading = heard(&compose, COMPOSE_LOADING);
    let first = translate(&app, "Mai mình gửi");
    wait_until("lần dịch đầu chờ nạp model", || gate.waiting() == 1);
    let second = translate(&app, "Mai mình gửi báo cáo");
    assert_eq!(second, first + 1);
    gate.open();
    assert_eq!(outcome_of(&done, second)["kind"], "translated");
    std::thread::sleep(Duration::from_millis(100));
    assert!(
        done.lock().unwrap().iter().all(|d| d["id"] != first),
        "kết quả của yêu cầu cũ bị bỏ"
    );
    assert!(submit(&app, first).is_err());
    assert_eq!(*loading.lock().unwrap(), [json!({ "id": first })]);
}

/// Spec §1.2: quá 4000 ký tự thì lệnh từ chối; một dòng quá 400 token thì báo `composeTooLong`, không dịch dở.
#[test]
fn too_long_text_is_refused() {
    let app = mock_app();
    let compose = window(&app, "compose");
    let error = invoke(&compose, "compose_translate", json!({ "text": "a".repeat(4001) })).unwrap_err();
    assert!(error.contains(errors::COMPOSE_TOO_LONG), "{error}");
    let done = heard(&compose, COMPOSE_DONE);
    let id = translate(&app, &vec!["chữ"; 401].join(" "));
    assert_eq!(
        outcome_of(&done, id),
        json!({ "kind": "failed", "code": errors::COMPOSE_TOO_LONG })
    );
    assert!(submit(&app, id).is_err(), "lỗi thì không có gì để dán");
}

/// Spec §5: lỗi lúc chuẩn bị tiến trình phụ (ví dụ chưa tải model) tới ô soạn với đúng mã lỗi.
#[test]
fn a_missing_model_reaches_the_compose_window() {
    let app = mock_app_with(FakeDeps {
        prepare_error: Some(errors::MODEL_MISSING),
        ..FakeDeps::default()
    });
    let done = heard(&window(&app, "compose"), COMPOSE_DONE);
    let id = translate(&app, "Mai mình gửi");
    assert_eq!(
        outcome_of(&done, id),
        json!({ "kind": "failed", "code": errors::MODEL_MISSING })
    );
}

/// Spec §1.5: chưa có token dùng thử thì Gõ dịch bị chặn (`trialNeedsNetwork`) mà không gọi server; mở ô soạn khi bị chặn thì
/// không chạy sẵn tiến trình phụ.
#[test]
fn a_blocked_license_stops_compose_without_calling_the_server() {
    use crate::license::manager::tests::{FakeApi, license};
    use crate::license::store::tests::FakeVault;
    let deps = FakeDeps::default();
    let prepares = deps.prepares.clone();
    let app = mock_app_with(deps);
    let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
    crate::license::app::install_with(app.handle(), license(&api, &vault, crate::license::app::now()));
    let compose = window(&app, "compose");
    let view = invoke(&compose, "get_compose_view", json!({})).unwrap();
    assert_eq!(view["blocked"], errors::TRIAL_NEEDS_NETWORK);
    let done = heard(&compose, COMPOSE_DONE);
    let id = translate(&app, "Mai mình gửi");
    assert_eq!(
        outcome_of(&done, id),
        json!({ "kind": "failed", "code": errors::TRIAL_NEEDS_NETWORK })
    );
    super::open(app.handle());
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(*prepares.lock().unwrap(), 0, "bị chặn thì không nạp model");
    assert!(api.calls.lock().unwrap().is_empty(), "không gọi server");
}

/// Spec §1.1, §1.3: mở ô soạn gửi phần cài đặt của nó rồi hiện, và chạy sẵn tiến trình phụ; phím tắt lần nữa thì đóng.
#[test]
fn the_hotkey_opens_with_the_view_and_closes_again() {
    let deps = FakeDeps::default();
    let prepares = deps.prepares.clone();
    let app = mock_app_with(deps);
    let opened = heard(&window(&app, "compose"), COMPOSE_OPEN);
    super::toggle(app.handle());
    wait_until("đã gửi phần cài đặt", || opened.lock().unwrap().len() == 1);
    let view = opened.lock().unwrap()[0].clone();
    assert_eq!(view["target"], "en");
    assert_eq!(view["uiLanguage"], "vi");
    assert_eq!(view["blocked"], Value::Null);
    assert_eq!(view["autoPaste"], true);
    wait_until("chạy sẵn tiến trình phụ", || *prepares.lock().unwrap() == 1);
    super::toggle(app.handle());
    assert_eq!(compose_calls(&app), ["show", "hide"]);
}

/// Spec §1.3: đóng ô soạn hủy yêu cầu đang chạy; kết quả của nó không tới và không dán được.
#[test]
fn closing_cancels_the_request_in_flight() {
    let gate = Arc::new(PrepareGate::default());
    let app = mock_app_with(FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    });
    let compose = window(&app, "compose");
    let done = heard(&compose, COMPOSE_DONE);
    let id = translate(&app, "Mai mình gửi");
    wait_until("đang chờ nạp model", || gate.waiting() == 1);
    invoke(&compose, "compose_close", json!({})).unwrap();
    gate.open();
    std::thread::sleep(Duration::from_millis(200));
    assert!(done.lock().unwrap().is_empty());
    assert!(submit(&app, id).is_err());
    assert_eq!(compose_calls(&app), ["hide"]);
}

/// Spec §4.1, §4.2 (macOS): bật tự dán mà chưa có quyền Trợ năng thì chỉ chép và giữ ô soạn mở; tắt tự dán ("Luôn chỉ chép")
/// thì chép rồi đóng, không gửi phím; không đưa được cửa sổ trước về thì báo đã chép.
#[cfg(target_os = "macos")]
#[test]
fn without_permission_the_translation_is_only_copied() {
    use std::sync::atomic::Ordering;

    use crate::test_support::FakeNative;

    let app = mock_app();
    let compose = window(&app, "compose");
    let done = heard(&compose, COMPOSE_DONE);
    let native = app.state::<FakeNative>().inner().clone();
    native.trusted.store(false, Ordering::SeqCst);
    let id = translate(&app, "Mai mình gửi");
    outcome_of(&done, id);
    assert_eq!(submit(&app, id).unwrap(), "needsPermission");
    assert_eq!(compose_calls(&app), [format!("clipboard {FAKE}")], "ô soạn không đóng");
    invoke(&compose, "compose_copy_only", json!({})).unwrap();
    let settings = app.state::<crate::state::AppState>().settings();
    assert!(!settings.compose.auto_paste);
    let id = translate(&app, "Mai mình gửi");
    outcome_of(&done, id);
    assert_eq!(submit(&app, id).unwrap(), "copied");
    assert_eq!(compose_calls(&app)[1..], [format!("clipboard {FAKE}"), "hide".into()]);
    native.trusted.store(true, Ordering::SeqCst);
    let main = window(&app, "main");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "compose": { "autoPaste": true } } }),
    )
    .unwrap();
    native.paste_ok.store(false, Ordering::SeqCst);
    let id = translate(&app, "Mai mình gửi");
    outcome_of(&done, id);
    assert_eq!(submit(&app, id).unwrap(), "copied", "cửa sổ trước không về được");
}

/// Spec §3.4: trong lúc Gõ dịch đang chuẩn bị hay dùng tiến trình phụ, `release_models` (trước khi xóa hay tải đè model) chờ.
#[test]
fn releasing_models_waits_for_a_compose_request() {
    let gate = Arc::new(PrepareGate::default());
    let deps = FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    };
    let releases = deps.releases.clone();
    let app = mock_app_with(deps);
    let done = heard(&window(&app, "compose"), COMPOSE_DONE);
    let id = translate(&app, "Mai mình gửi");
    wait_until("đang chờ nạp model", || gate.waiting() == 1);
    let handle = app.handle().clone();
    let release = std::thread::spawn(move || crate::session::release_models(&handle));
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(
        *releases.lock().unwrap(),
        0,
        "chưa tắt tiến trình phụ khi Gõ dịch còn dùng"
    );
    gate.open();
    release.join().unwrap();
    assert_eq!(*releases.lock().unwrap(), 1);
    assert_eq!(outcome_of(&done, id)["kind"], "translated");
}

/// Spec §3.4, §8.1: mỗi yêu cầu dịch đều chuẩn bị tiến trình phụ trước khi dùng bộ dịch. Bản thật chạm
/// `SidecarManager::touch()` ở bước này, nên luật tắt sau 10 phút rảnh tính lại từ đầu sau mỗi lần dịch.
#[test]
fn every_request_prepares_the_sidecars_first() {
    let deps = FakeDeps::default();
    let prepares = deps.prepares.clone();
    let app = mock_app_with(deps);
    let done = heard(&window(&app, "compose"), COMPOSE_DONE);
    for text in ["Mai mình gửi", "Cảm ơn cả nhóm"] {
        let id = translate(&app, text);
        assert_eq!(outcome_of(&done, id)["kind"], "translated");
    }
    assert_eq!(*prepares.lock().unwrap(), 2);
}

/// Spec §6: log chỉ có số liệu, không bao giờ có chữ đã gõ.
#[test]
fn logs_never_hold_what_was_typed() {
    capture_logs();
    let app = mock_app();
    let done = heard(&window(&app, "compose"), COMPOSE_DONE);
    let id = translate(&app, "Mật khẩu wifi là RIENGTU-73519 nhé");
    outcome_of(&done, id);
    let logs = all_logs();
    assert!(logs.iter().any(|l| l.contains("Gõ dịch:")), "có dòng số liệu");
    assert!(
        logs.iter().all(|l| !l.contains("RIENGTU-73519")),
        "log không có chữ đã gõ"
    );
}

/// Spec §1.2: chiều cao theo nội dung, trong khoảng 120–420 px.
#[test]
fn the_height_stays_within_bounds() {
    let app = mock_app();
    let compose = window(&app, "compose");
    for height in [50.0, 300.0, 9999.0] {
        invoke(&compose, "compose_resize", json!({ "height": height })).unwrap();
    }
    assert_eq!(compose_calls(&app), ["height 120", "height 300", "height 420"]);
}

/// Spec §5: nút của hộp lỗi đóng ô soạn rồi mở cửa sổ chính ở đúng màn hình.
#[test]
fn an_error_button_opens_the_right_screen() {
    let app = mock_app();
    let nav = heard(&window(&app, "main"), NAVIGATE);
    let compose = window(&app, "compose");
    invoke(&compose, "compose_open_main", json!({ "screen": "models" })).unwrap();
    invoke(&compose, "compose_open_main", json!({ "screen": "upgrade" })).unwrap();
    wait_until("đã mở hai màn hình", || nav.lock().unwrap().len() == 2);
    assert_eq!(
        *nav.lock().unwrap(),
        [
            json!({ "screen": "settings", "settingsGroup": "model" }),
            json!({ "screen": "upgrade", "settingsGroup": null }),
        ]
    );
    assert_eq!(compose_calls(&app), ["hide", "hide"]);
    assert!(invoke(&compose, "compose_open_main", json!({ "screen": "about" })).is_err());
}

/// Spec §1.1, §1.4: phím tắt Gõ dịch mở rồi đóng ô soạn; tắt Gõ dịch thì đóng ô soạn đang mở và bỏ phím đó khỏi danh sách phím
/// tắt không đăng ký được.
#[test]
fn the_hotkey_toggles_and_turning_compose_off_closes_it() {
    use crate::hotkeys::HotkeyAction;
    let app = mock_app();
    crate::actions::run_hotkey(app.handle(), HotkeyAction::Compose);
    assert_eq!(compose_calls(&app), ["show"]);
    app.state::<crate::state::AppState>()
        .update_status(|s| s.hotkey_failures = vec![HotkeyAction::Compose]);
    let main = window(&app, "main");
    let settings = invoke(
        &main,
        "update_settings",
        json!({ "patch": { "compose": { "enabled": false } } }),
    )
    .unwrap();
    assert_eq!(settings["compose"]["enabled"], false);
    assert_eq!(compose_calls(&app), ["show", "hide"]);
    let status = invoke(&main, "get_app_status", json!({})).unwrap();
    assert_eq!(status["hotkeyFailures"], json!([]));
}

/// Spec §1.4: Gõ dịch đang tắt thì đổi phím của nó chỉ kiểm và lưu (không đăng ký); phím trùng việc khác bị từ chối.
#[test]
fn a_disabled_compose_hotkey_is_only_checked_and_saved() {
    let app = mock_app();
    let main = window(&app, "main");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "compose": { "enabled": false } } }),
    )
    .unwrap();
    let settings = invoke(
        &main,
        "set_hotkey",
        json!({ "action": "compose", "accelerator": "control+alt+KeyJ" }),
    )
    .unwrap();
    assert_eq!(settings["hotkeys"]["compose"], "Ctrl+Alt+J");
    let error = invoke(
        &main,
        "set_hotkey",
        json!({ "action": "compose", "accelerator": "Ctrl+Alt+T" }),
    )
    .unwrap_err();
    assert!(error.contains("hotkeyDuplicate"), "{error}");
}
