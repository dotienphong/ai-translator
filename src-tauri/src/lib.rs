//! Spike S5: thanh phụ đề nổi trên app họp đang toàn màn hình (spec §4.4).
//! macOS dùng NSPanel kiểu non-activating (tauri-nspanel); Windows dùng cửa sổ topmost.

pub mod hotkeys;
pub mod i18n;
pub mod overlay;
pub mod security;
pub mod settings;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
tauri_nspanel::tauri_panel! {
    panel!(OverlayPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true
        }
    })
}

#[derive(Default)]
struct Flags {
    ticker: AtomicBool,
    locked: AtomicBool,
    hidden: AtomicBool,
}

const SAMPLES: &[(&str, &str)] = &[
    (
        "Good morning everyone, thanks for joining.",
        "Chào buổi sáng mọi người, cảm ơn đã tham gia.",
    ),
    (
        "Let's review the quarterly numbers first.",
        "Trước hết hãy xem lại số liệu quý.",
    ),
    (
        "我们下周需要完成测试。",
        "Tuần sau chúng ta cần hoàn thành việc kiểm thử.",
    ),
    (
        "来月の予算を確認させてください。",
        "Cho tôi xác nhận lại ngân sách tháng tới.",
    ),
];

#[tauri::command]
fn toggle_ticker(flags: tauri::State<'_, Arc<Flags>>) -> bool {
    !flags.ticker.fetch_xor(true, Ordering::Relaxed)
}

#[tauri::command]
fn set_locked(app: AppHandle, flags: tauri::State<'_, Arc<Flags>>, locked: bool) -> Result<(), String> {
    flags.locked.store(locked, Ordering::Relaxed);
    apply_lock(&app, locked).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_accessory(app: AppHandle, accessory: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let policy = if accessory {
            tauri::ActivationPolicy::Accessory
        } else {
            tauri::ActivationPolicy::Regular
        };
        app.set_activation_policy(policy).map_err(|e| e.to_string())?;
    }
    let _ = (app, accessory);
    Ok(())
}

fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::{CollectionBehavior, PanelBuilder, PanelLevel, StyleMask};
        let panel = PanelBuilder::<_, OverlayPanel>::new(app, "overlay")
            .url(WebviewUrl::App("overlay.html".into()))
            .size(tauri::Size::Logical(tauri::LogicalSize::new(900.0, 160.0)))
            // Tạo sẵn cửa sổ gốc không viền (Borderless|Resizable), WKWebView trong suốt,
            // không nhận key lúc tạo, chưa hiện; click đầu tiên vào panel không-key vẫn tới webview.
            .with_window(|w| {
                w.decorations(false)
                    .transparent(true)
                    .focused(false)
                    .visible(false)
                    .accept_first_mouse(true)
            })
            .level(PanelLevel::Status)
            // Chỉ OR thêm NonactivatingPanel. `StyleMask::borderless()` GÁN mask = 0 nên không được gọi sau.
            .add_style_mask(StyleMask::empty().nonactivating_panel())
            .collection_behavior(
                CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary()
                    .stationary(),
            )
            .transparent(true)
            .has_shadow(false)
            .hides_on_deactivate(false)
            .no_activate(true)
            .build()?;
        panel.show();
    }
    #[cfg(not(target_os = "macos"))]
    {
        tauri::WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
            .title("Phụ đề")
            .inner_size(900.0, 160.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .focused(false)
            .focusable(false) // WS_EX_NOACTIVATE: click/kéo không kích hoạt thanh phụ đề
            .build()?;
    }
    Ok(())
}

/// Chế độ khóa: cho click xuyên qua thanh phụ đề (spec §4.4).
fn apply_lock(app: &AppHandle, locked: bool) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel("overlay") {
            panel.set_ignores_mouse_events(locked);
        }
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("overlay") {
        window.set_ignore_cursor_events(locked)?;
    }
    app.emit("overlay://locked", locked)
}

fn toggle_visible(app: &AppHandle, flags: &Flags) -> tauri::Result<()> {
    let hide = !flags.hidden.fetch_xor(true, Ordering::Relaxed);
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel("overlay") {
            if hide { panel.hide() } else { panel.show() }
        }
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("overlay") {
        if hide { window.hide()? } else { window.show()? }
    }
    Ok(())
}

pub fn run() {
    let flags = Arc::new(Flags::default());
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    builder
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let flags = app.state::<Arc<Flags>>();
                    match shortcut.key {
                        Code::KeyT => {
                            flags.ticker.fetch_xor(true, Ordering::Relaxed);
                        }
                        Code::KeyH => {
                            let _ = toggle_visible(app, &flags);
                        }
                        Code::KeyL => {
                            let locked = !flags.locked.fetch_xor(true, Ordering::Relaxed);
                            let _ = apply_lock(app, locked);
                        }
                        _ => {}
                    }
                })
                .build(),
        )
        .manage(flags.clone())
        .invoke_handler(tauri::generate_handler![toggle_ticker, set_locked, set_accessory])
        .setup(move |app| {
            create_overlay(app.handle())?;
            // Phím tắt mặc định của F10; lỗi đăng ký nghĩa là đã có app khác giữ tổ hợp này.
            for code in [Code::KeyT, Code::KeyH, Code::KeyL] {
                if let Err(e) = app
                    .global_shortcut()
                    .register(Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), code))
                {
                    eprintln!("không đăng ký được Ctrl+Alt+{code:?}: {e}");
                }
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut n = 0u64;
                loop {
                    std::thread::sleep(Duration::from_millis(1500));
                    if !flags.ticker.load(Ordering::Relaxed) {
                        continue;
                    }
                    let (src, tgt) = SAMPLES[n as usize % SAMPLES.len()];
                    let payload =
                        serde_json::json!({ "id": n, "src_text": src, "tgt_text": tgt, "provisional": n % 4 == 3 });
                    let _ = handle.emit("subtitle://upsert", payload);
                    n += 1;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("lỗi khi chạy app");
}
