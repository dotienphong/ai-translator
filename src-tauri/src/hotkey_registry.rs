//! Đăng ký các phím tắt toàn cục với hệ điều hành qua `tauri-plugin-global-shortcut`. Luật đổi phím
//! tắt (đăng ký lại phím cũ khi phím mới bị từ chối) nằm ở `hotkeys::rebind`, có test với bản giả.
//!
//! Trên Windows, phím tắt đã bị app khác giữ thì đăng ký thất bại, và app báo lỗi. Trên macOS, đăng
//! ký gần như luôn thành công dù app khác đang dùng cùng tổ hợp, nên chỉ thử tay mới thấy trùng
//! (ma trận S5, dòng 13; C5 của kế hoạch 00).

use std::sync::Mutex;

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcut, GlobalShortcutExt, Shortcut, ShortcutState};

use crate::actions;
use crate::hotkeys::{self, Bound, HotkeyAction, RebindError, Registrar};
use crate::settings::Hotkeys;

/// Phím tắt đang đăng ký, dùng chung cho handler của plugin và lệnh `set_hotkey`.
#[derive(Default)]
pub struct HotkeyRegistry(Mutex<Bound>);

struct OsRegistrar<'a, R: Runtime>(&'a GlobalShortcut<R>);

impl<R: Runtime> Registrar for OsRegistrar<'_, R> {
    fn register(&self, shortcut: Shortcut) -> bool {
        match self.0.register(shortcut) {
            Ok(()) => true,
            Err(e) => {
                log::warn!("không đăng ký được phím tắt {shortcut}: {e}");
                false
            }
        }
    }

    fn unregister(&self, shortcut: Shortcut) {
        if let Err(e) = self.0.unregister(shortcut) {
            log::warn!("không gỡ được phím tắt {shortcut}: {e}");
        }
    }
}

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let action = app
                .state::<HotkeyRegistry>()
                .0
                .lock()
                .unwrap()
                .action_for(shortcut.id());
            if let Some(action) = action {
                actions::run_hotkey(app, action);
            }
        })
        .build()
}

/// Đăng ký các phím tắt lúc khởi động (`Settings::active_hotkeys`: Gõ dịch đang tắt thì không có phím của nó). Trả về các việc
/// không đăng ký được.
pub fn register_all<R: Runtime>(app: &AppHandle<R>, bindings: &[(HotkeyAction, &str)]) -> Vec<HotkeyAction> {
    let registry = app.state::<HotkeyRegistry>();
    let mut bound = registry.0.lock().unwrap();
    hotkeys::register_all(&OsRegistrar(app.global_shortcut()), &mut bound, bindings)
}

/// Bật Gõ dịch thì đăng ký phím của nó, tắt thì gỡ (spec 2026-10-17-go-dich §1.4). `false` khi bật mà hệ điều hành từ chối.
/// App giả của test không có phím tắt (`HotkeyRegistry` chưa cài): không làm gì, trả `true`.
pub fn set_active<R: Runtime>(app: &AppHandle<R>, action: HotkeyAction, accelerator: &str, active: bool) -> bool {
    let Some(registry) = app.try_state::<HotkeyRegistry>() else {
        return true;
    };
    let mut bound = registry.0.lock().unwrap();
    let registrar = OsRegistrar(app.global_shortcut());
    if active {
        hotkeys::activate(&registrar, &mut bound, action, accelerator)
    } else {
        hotkeys::deactivate(&registrar, &mut bound, action);
        true
    }
}

/// Đổi phím tắt của một việc; trả về bộ phím tắt mới.
pub fn rebind<R: Runtime>(
    app: &AppHandle<R>,
    current: &Hotkeys,
    action: HotkeyAction,
    accelerator: &str,
) -> Result<Hotkeys, RebindError> {
    let registry = app.state::<HotkeyRegistry>();
    let mut bound = registry.0.lock().unwrap();
    let canonical = hotkeys::rebind(
        &OsRegistrar(app.global_shortcut()),
        &mut bound,
        &current.bindings(),
        action,
        accelerator,
    )?;
    let mut next = current.clone();
    next.set(action, canonical);
    Ok(next)
}
