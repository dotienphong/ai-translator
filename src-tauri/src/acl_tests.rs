//! Test quyền của từng cửa sổ (spec §10.2, §11 "cửa sổ overlay gọi một lệnh không được cấp thì Tauri
//! chặn lại"). Hai lớp kiểm:
//! 1. Tĩnh: danh sách quyền trong `capabilities/` khớp đúng một danh sách cố định; mỗi file chỉ có các
//!    khóa đã biết (không có `remote`, `platforms`, `local`…), gắn đúng một cửa sổ; thư mục chỉ có hai
//!    file; `tauri.conf.json` không khai capability riêng.
//! 2. Lúc chạy: app chạy bằng `MockRuntime` với ACL thật của app; lệnh không được cấp thì bị chặn.
//! 3. Lệnh có tác dụng ra ngoài app chỉ tới bản giả của `SystemOpener` (QĐ28): bị chặn thì bản giả
//!    không ghi nhận gì, được phép thì ghi nhận đúng lời gọi.
//!
//! Kế hoạch sau thêm quyền (ví dụ 03 cấp `core:window:allow-start-resize-dragging` cho overlay) thì sửa
//! danh sách cố định ở đây trong cùng commit.

use serde_json::{Value, json};

use crate::commands::{MAIN_COMMANDS, OVERLAY_COMMANDS};
use crate::test_support::{denied, invoke, mock_app, system_calls, window};

/// Quyền không phải lệnh của app, theo từng cửa sổ.
const MAIN_CORE_PERMISSIONS: &[&str] = &[
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:webview:allow-set-webview-zoom",
];
const OVERLAY_CORE_PERMISSIONS: &[&str] = &[
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:window:allow-start-dragging",
];

/// Lệnh của Tauri và plugin mà không cửa sổ nào được gọi.
const FORBIDDEN: &[&str] = &[
    "plugin:window|set_position",
    "plugin:window|close",
    "plugin:webview|create_webview_window",
    "plugin:store|get",
    "plugin:store|set",
    "plugin:autostart|enable",
    "plugin:autostart|disable",
    "plugin:opener|open_url",
    "plugin:opener|open_path",
    "plugin:log|log",
    "plugin:event|emit",
    "plugin:global-shortcut|register",
];

/// Lệnh của app có tác dụng ra ngoài app (mở Finder, System Settings, Settings của Windows).
const OPENER_COMMANDS: &[&str] = &["open_log_dir", "open_taskbar_settings", "open_login_items_settings"];

fn allow(cmd: &str) -> String {
    format!("allow-{}", cmd.replace('_', "-"))
}

fn expected(commands: &[&str], core: &[&str]) -> Vec<String> {
    let mut all: Vec<String> = commands
        .iter()
        .map(|c| allow(c))
        .chain(core.iter().map(|p| p.to_string()))
        .collect();
    all.sort();
    all
}

/// Khóa được phép trong một file capability. `remote` (cho trang web ngoài gọi lệnh), `platforms`,
/// `local` hay khóa lạ đều làm test đỏ.
const CAPABILITY_KEYS: &[&str] = &["$schema", "description", "identifier", "permissions", "windows"];

fn permissions(file: &str, label: &str) -> Vec<String> {
    let cap: Value = serde_json::from_str(file).unwrap();
    let mut keys: Vec<&str> = cap.as_object().unwrap().keys().map(String::as_str).collect();
    keys.sort();
    assert_eq!(keys, CAPABILITY_KEYS, "capability {label} chỉ có các khóa đã biết");
    assert_eq!(cap["identifier"], label);
    assert_eq!(
        cap["windows"],
        json!([label]),
        "capability {label} chỉ gắn cửa sổ {label}"
    );
    let mut all: Vec<String> = cap["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p.as_str().unwrap().to_string())
        .collect();
    all.sort();
    all
}

#[test]
fn capabilities_grant_exactly_the_fixed_lists() {
    assert_eq!(
        permissions(include_str!("../capabilities/main.json"), "main"),
        expected(MAIN_COMMANDS, MAIN_CORE_PERMISSIONS)
    );
    assert_eq!(
        permissions(include_str!("../capabilities/overlay.json"), "overlay"),
        expected(OVERLAY_COMMANDS, OVERLAY_CORE_PERMISSIONS),
        "overlay chỉ đọc phần cài đặt của nó, nghe sự kiện và kéo cửa sổ của chính nó"
    );
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities");
    let mut files: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    files.sort();
    assert_eq!(files, ["main.json", "overlay.json"], "không có capability nào khác");
    let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    assert!(
        conf["app"]["security"].get("capabilities").is_none(),
        "không khai capability trong tauri.conf.json"
    );
    let build_rs = include_str!("../build.rs");
    for cmd in MAIN_COMMANDS.iter().chain(OVERLAY_COMMANDS) {
        assert!(build_rs.contains(&format!("\"{cmd}\"")), "build.rs thiếu {cmd}");
    }
}

#[test]
fn each_window_only_reaches_its_own_commands() {
    let app = mock_app();
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");

    let settings = invoke(&main, "get_settings", json!({})).expect("main đọc được cài đặt");
    assert_eq!(settings["uiLanguage"], "vi");
    let view = invoke(&overlay, "get_overlay_view", json!({})).expect("overlay đọc được phần của nó");
    assert_eq!(view["lines"], 2);
    assert!(view.get("hotkeys").is_none(), "overlay không thấy cài đặt khác");
    let zoom = invoke(&main, "plugin:webview|set_webview_zoom", json!({ "value": 1.2 }));
    assert!(!denied(&zoom), "main phóng to được chữ: {zoom:?}");

    for cmd in MAIN_COMMANDS {
        let result = invoke(&overlay, cmd, json!({}));
        assert!(denied(&result), "overlay không được gọi {cmd}: {result:?}");
    }
    for cmd in OVERLAY_COMMANDS {
        let result = invoke(&main, cmd, json!({}));
        assert!(denied(&result), "main không cần gọi {cmd}: {result:?}");
    }
    assert!(denied(&invoke(
        &overlay,
        "plugin:webview|set_webview_zoom",
        json!({ "value": 1.2 })
    )));
    // Không cửa sổ nào tự đọc ghi file cài đặt, bật tắt khởi động cùng hệ thống, mở URL hay đường dẫn,
    // tạo cửa sổ, di chuyển cửa sổ, phát sự kiện, hay đăng ký phím tắt.
    for cmd in FORBIDDEN {
        for window in [&main, &overlay] {
            let result = invoke(window, cmd, json!({}));
            assert!(denied(&result), "{} không được gọi {cmd}: {result:?}", window.label());
        }
    }
    // Cửa sổ lạ (ví dụ trang ngoài mở trong webview mới) không có quyền nào.
    let stranger = window(&app, "stranger");
    assert!(denied(&invoke(&stranger, "get_settings", json!({}))));
}

#[test]
fn outside_effects_only_reach_the_fake_opener() {
    let app = mock_app();
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");
    for cmd in OPENER_COMMANDS {
        let result = invoke(&overlay, cmd, json!({}));
        assert!(denied(&result), "overlay không được gọi {cmd}: {result:?}");
    }
    assert!(system_calls(&app).is_empty(), "lệnh bị chặn không tới SystemOpener");
    for cmd in OPENER_COMMANDS {
        let _ = invoke(&main, cmd, json!({}));
    }
    // Lệnh không có trên hệ điều hành này trả `unsupported` trước khi tới SystemOpener.
    let expected: &[&str] = if cfg!(target_os = "macos") {
        &["open_log_dir", "open_login_items_settings"]
    } else {
        &["open_log_dir", "open_taskbar_settings"]
    };
    assert_eq!(system_calls(&app), expected);
}
