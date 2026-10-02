//! Thanh phụ đề (spec §4.4): cửa sổ `overlay` không viền, trong suốt, luôn nổi trên cùng, không lấy
//! focus của app họp. Cách làm từ spike S5 (kế hoạch 0-05):
//! - macOS (`macos.rs`): NSPanel non-activating qua `tauri-nspanel`;
//! - Windows (`windows.rs`): cửa sổ topmost, `skip_taskbar`, `focusable(false)`.
//!
//! Phần chung ở đây: ẩn/hiện, khóa (click xuyên qua), nhớ vị trí theo từng màn hình. Ẩn/hiện và khóa
//! đi qua trait `Surface`, để test (`app_tests.rs`) kiểm bằng bản giả mà không cần cửa sổ thật.

pub mod placement;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(not(target_os = "macos"))]
mod windows;
#[cfg(not(target_os = "macos"))]
use windows as platform;

use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime};

use crate::i18n;
use crate::settings::{MAX_OVERLAY_POSITIONS, persist};
use crate::state::AppState;
use placement::Screen;

pub const LABEL: &str = "overlay";

/// Thao tác trên cửa sổ của thanh phụ đề. Bản thật gọi `macos.rs` hoặc `windows.rs`; test dùng bản giả
/// ghi lại từng lần gọi (`test_support::FakeSurface`).
pub trait Surface: Send + Sync + 'static {
    fn set_visible(&self, visible: bool) -> tauri::Result<()>;
    /// Chế độ khóa: click đi xuyên qua thanh phụ đề (§4.4).
    fn set_click_through(&self, on: bool) -> tauri::Result<()>;
}

/// `Surface` đang dùng, quản lý bằng `app.manage`: `create` đặt bản thật, test đặt bản giả.
pub struct OverlaySurface(pub Box<dyn Surface>);

struct Native<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Surface for Native<R> {
    fn set_visible(&self, visible: bool) -> tauri::Result<()> {
        platform::set_visible(&self.0, visible)
    }

    fn set_click_through(&self, on: bool) -> tauri::Result<()> {
        platform::set_ignore_mouse(&self.0, on)
    }
}

/// Tạo thanh phụ đề ở trạng thái ẩn, đặt vào vị trí đã nhớ, áp chế độ khóa đã lưu. Thanh chỉ hiện khi
/// bắt đầu phiên (`session::start`) hoặc khi người dùng bấm hiện (§4.2).
pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let settings = app.state::<AppState>().settings();
    platform::create(app, i18n::strings(settings.ui_language).overlay_title)?;
    app.manage(OverlaySurface(Box::new(Native(app.clone()))));
    restore_position(app);
    set_locked(app, settings.overlay.locked)
}

pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> tauri::Result<()> {
    match app.try_state::<OverlaySurface>() {
        Some(surface) => surface.0.set_visible(visible),
        None => Ok(()),
    }
}

/// Chế độ khóa: cho click xuyên qua thanh phụ đề (§4.4).
pub fn set_locked<R: Runtime>(app: &AppHandle<R>, locked: bool) -> tauri::Result<()> {
    match app.try_state::<OverlaySurface>() {
        Some(surface) => surface.0.set_click_through(locked),
        None => Ok(()),
    }
}

fn screen_of(monitor: &Monitor) -> Screen {
    let area = monitor.work_area();
    Screen {
        key: placement::screen_key(
            monitor.name().map(String::as_str),
            monitor.size().width,
            monitor.size().height,
        ),
        x: area.position.x,
        y: area.position.y,
        width: area.size.width,
        height: area.size.height,
        scale: monitor.scale_factor(),
    }
}

/// Đặt thanh phụ đề vào vị trí đã nhớ (hoặc vị trí mặc định) trên màn hình phù hợp.
pub fn restore_position<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let screens: Vec<Screen> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(screen_of)
        .collect();
    let primary = app.primary_monitor().ok().flatten().map(|m| screen_of(&m).key);
    let settings = app.state::<AppState>().settings();
    let Some(p) = placement::place(
        &settings.overlay.positions,
        settings.overlay.last_monitor.as_deref(),
        &screens,
        primary.as_deref(),
    ) else {
        log::warn!("không thấy màn hình nào để đặt thanh phụ đề");
        return;
    };
    let _ = window.set_size(PhysicalSize::new(p.width, p.height));
    let _ = window.set_position(PhysicalPosition::new(p.x, p.y));
}

/// Nhớ vị trí hiện tại của thanh phụ đề cho màn hình nó đang nằm (gọi khi cửa sổ di chuyển hay đổi
/// kích thước, và trước khi thoát).
pub fn remember_position<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let (Ok(position), Ok(size), Ok(Some(monitor))) =
        (window.outer_position(), window.outer_size(), window.current_monitor())
    else {
        return;
    };
    let screen = screen_of(&monitor);
    let rect = placement::to_relative(&screen, position.x, position.y, size.width, size.height);
    let state = app.state::<AppState>();
    let mut next = state.settings();
    let unchanged = next
        .overlay
        .positions
        .get(&screen.key)
        .is_some_and(|r| placement::same_geometry(r, &rect));
    if unchanged && next.overlay.last_monitor.as_deref() == Some(&screen.key) {
        return;
    }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    placement::remember(
        &mut next.overlay.positions,
        &screen.key,
        rect,
        now,
        MAX_OVERLAY_POSITIONS,
    );
    next.overlay.last_monitor = Some(screen.key);
    if next.validate().is_err() {
        // Cửa sổ bị thu quá nhỏ hay nằm ngoài phạm vi: không lưu.
        return;
    }
    state.replace_settings(next.clone());
    if let Err(e) = persist::save_overlay(app, &next, state.file_meta()) {
        log::warn!("không lưu được vị trí thanh phụ đề: {e}");
    }
}
