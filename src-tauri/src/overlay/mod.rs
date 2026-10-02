//! Thanh phụ đề (spec §4.4): cửa sổ `overlay` không viền, trong suốt, luôn nổi trên cùng, không lấy
//! focus của app họp. Cách làm từ spike S5 (kế hoạch 0-05):
//! - macOS (`macos.rs`): NSPanel non-activating qua `tauri-nspanel`;
//! - Windows (`windows.rs`): cửa sổ topmost, `skip_taskbar`, `focusable(false)`.
//!
//! Phần chung ở đây: ẩn/hiện, khóa (click xuyên qua), nhớ vị trí theo từng màn hình, kéo cạnh để đổi kích thước. Các
//! thao tác trên cửa sổ đi qua trait `Surface`, để test (`app_tests.rs`) kiểm bằng bản giả mà không cần cửa sổ thật.
//!
//! Kéo cạnh hay góc (§4.4, cả macOS lẫn Windows): thanh phụ đề vẽ vùng kéo ở mép (khi chưa khóa) và gọi
//! [`begin_resize`], [`resize_to_cursor`], [`end_resize`]. Windows để hệ điều hành đổi kích thước (`start_resize_dragging`).
//! macOS không có cách đó trong tao, nên app tự đặt khung cửa sổ theo vị trí con trỏ (đọc ở phía Rust, không nhận tọa độ
//! từ giao diện) mỗi lần con trỏ di chuyển. Độ dời của con trỏ tính bằng điểm logic rồi mới đổi ra pixel theo tỉ lệ của
//! màn hình chứa thanh: tao đổi vị trí con trỏ ra pixel theo tỉ lệ của màn hình chính, còn khung cửa sổ theo tỉ lệ của màn
//! hình chứa nó, nên hai màn hình khác tỉ lệ (Retina và màn hình ngoài 1×) mà cộng thẳng pixel thì mép thanh chạy nhanh
//! gấp đôi hay chậm một nửa so với con trỏ (Q-A của review 03 lần 2).

pub mod placement;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(not(target_os = "macos"))]
mod windows;
#[cfg(not(target_os = "macos"))]
use windows as platform;

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime};

use crate::i18n;
use crate::settings::{MAX_OVERLAY_POSITIONS, persist};
use crate::state::AppState;
use placement::{Edge, Frame, Screen};

pub const LABEL: &str = "overlay";
/// Cỡ nhỏ nhất của thanh phụ đề khi kéo cạnh (điểm logic, §4.4): 320 × 80, trên mức tối thiểu `settings::OVERLAY_WIDTH`
/// (200) và `OVERLAY_HEIGHT` (40), để vị trí sau khi kéo luôn qua `Settings::validate` và được lưu.
pub const MIN_WIDTH: f64 = 320.0;
pub const MIN_HEIGHT: f64 = 80.0;

/// Thao tác trên cửa sổ của thanh phụ đề. Bản thật gọi `macos.rs` hoặc `windows.rs`; test dùng bản giả
/// ghi lại từng lần gọi (`test_support::FakeSurface`).
pub trait Surface: Send + Sync + 'static {
    fn set_visible(&self, visible: bool) -> tauri::Result<()>;
    /// Chế độ khóa: click đi xuyên qua thanh phụ đề (§4.4).
    fn set_click_through(&self, on: bool) -> tauri::Result<()>;
    /// Khung hiện tại của cửa sổ và màn hình nó đang nằm. `None`: chưa có cửa sổ, hay không đọc được.
    fn frame(&self) -> Option<(Frame, Screen)>;
    fn set_frame(&self, frame: Frame) -> tauri::Result<()>;
    /// Vị trí con trỏ chuột, bằng điểm logic (không phải pixel).
    fn cursor(&self) -> Option<(f64, f64)>;
    /// Để hệ điều hành đổi kích thước theo con trỏ cho tới khi nhả chuột. `false`: hệ điều hành không làm được (macOS),
    /// app tự đổi ([`resize_to_cursor`]).
    fn system_resize(&self, edge: Edge) -> bool;
}

/// Một lần kéo cạnh đang dở (macOS): cạnh đang kéo, con trỏ (điểm) và khung (pixel) lúc bấm, tỉ lệ của màn hình chứa
/// thanh, cỡ tối thiểu theo pixel của màn hình đó.
#[derive(Clone, Copy, Debug)]
struct Drag {
    edge: Edge,
    cursor: (f64, f64),
    frame: Frame,
    scale: f64,
    min: (u32, u32),
}

/// `Surface` đang dùng, quản lý bằng `app.manage`: `create` đặt bản thật, test đặt bản giả.
pub struct OverlaySurface {
    surface: Box<dyn Surface>,
    drag: Mutex<Option<Drag>>,
}

impl OverlaySurface {
    pub fn new(surface: Box<dyn Surface>) -> Self {
        Self {
            surface,
            drag: Mutex::new(None),
        }
    }

    fn drag(&self) -> std::sync::MutexGuard<'_, Option<Drag>> {
        self.drag.lock().unwrap_or_else(|e| e.into_inner())
    }
}

struct Native<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Surface for Native<R> {
    fn set_visible(&self, visible: bool) -> tauri::Result<()> {
        platform::set_visible(&self.0, visible)
    }

    fn set_click_through(&self, on: bool) -> tauri::Result<()> {
        platform::set_ignore_mouse(&self.0, on)
    }

    fn frame(&self) -> Option<(Frame, Screen)> {
        let window = self.0.get_webview_window(LABEL)?;
        let (Ok(position), Ok(size), Ok(Some(monitor))) =
            (window.outer_position(), window.outer_size(), window.current_monitor())
        else {
            return None;
        };
        let frame = Frame {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        };
        Some((frame, screen_of(&monitor)))
    }

    fn set_frame(&self, frame: Frame) -> tauri::Result<()> {
        if let Some(window) = self.0.get_webview_window(LABEL) {
            window.set_size(PhysicalSize::new(frame.width, frame.height))?;
            window.set_position(PhysicalPosition::new(frame.x, frame.y))?;
        }
        Ok(())
    }

    fn cursor(&self) -> Option<(f64, f64)> {
        // tao đổi vị trí con trỏ (điểm, `NSEvent mouseLocation`) ra pixel theo tỉ lệ của màn hình chính: chia lại cho tỉ lệ
        // đó. Chỉ macOS dùng (Windows để hệ điều hành đổi kích thước).
        let p = self.0.cursor_position().ok()?;
        let scale = self
            .0
            .primary_monitor()
            .ok()
            .flatten()
            .map_or(1.0, |m| m.scale_factor());
        Some((p.x / scale, p.y / scale))
    }

    fn system_resize(&self, edge: Edge) -> bool {
        platform::system_resize(&self.0, edge)
    }
}

/// Tạo thanh phụ đề ở trạng thái ẩn, đặt vào vị trí đã nhớ, áp chế độ khóa đã lưu. Thanh chỉ hiện khi
/// bắt đầu phiên (`session::start`) hoặc khi người dùng bấm hiện (§4.2).
pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let settings = app.state::<AppState>().settings();
    platform::create(app, i18n::strings(settings.ui_language).overlay_title)?;
    app.manage(OverlaySurface::new(Box::new(Native(app.clone()))));
    restore_position(app);
    set_locked(app, settings.overlay.locked)
}

pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> tauri::Result<()> {
    match app.try_state::<OverlaySurface>() {
        Some(overlay) => overlay.surface.set_visible(visible),
        None => Ok(()),
    }
}

/// Chế độ khóa: cho click xuyên qua thanh phụ đề (§4.4).
pub fn set_locked<R: Runtime>(app: &AppHandle<R>, locked: bool) -> tauri::Result<()> {
    match app.try_state::<OverlaySurface>() {
        Some(overlay) => overlay.surface.set_click_through(locked),
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
/// kích thước, khi ẩn, và trước khi thoát).
pub fn remember_position<R: Runtime>(app: &AppHandle<R>) {
    let Some((frame, screen)) = app.try_state::<OverlaySurface>().and_then(|o| o.surface.frame()) else {
        return;
    };
    let rect = placement::to_relative(&screen, frame.x, frame.y, frame.width, frame.height);
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
    state.replace_settings(&mut next);
    if let Err(e) = persist::save_overlay(app, &next, state.file_meta()) {
        log::warn!("không lưu được vị trí thanh phụ đề: {e}");
    }
}

/// Bấm giữ ở cạnh hay góc `edge` của thanh phụ đề (§4.4). Thanh đang khóa thì không làm gì (click đi xuyên qua, nên lệnh
/// này thường không tới).
pub fn begin_resize<R: Runtime>(app: &AppHandle<R>, edge: Edge) {
    if app.state::<AppState>().settings().overlay.locked {
        return;
    }
    let Some(overlay) = app.try_state::<OverlaySurface>() else {
        return;
    };
    *overlay.drag() = None;
    if overlay.surface.system_resize(edge) {
        return;
    }
    let (Some((frame, screen)), Some(cursor)) = (overlay.surface.frame(), overlay.surface.cursor()) else {
        return;
    };
    let min = (
        (MIN_WIDTH * screen.scale).ceil() as u32,
        (MIN_HEIGHT * screen.scale).ceil() as u32,
    );
    *overlay.drag() = Some(Drag {
        edge,
        cursor,
        frame,
        scale: screen.scale,
        min,
    });
}

/// Con trỏ di chuyển trong lúc kéo cạnh: đặt khung theo con trỏ (chỉ khi app tự đổi kích thước, xem [`Surface`]).
pub fn resize_to_cursor<R: Runtime>(app: &AppHandle<R>) {
    let Some(overlay) = app.try_state::<OverlaySurface>() else {
        return;
    };
    let Some(drag) = *overlay.drag() else {
        return;
    };
    let Some(cursor) = overlay.surface.cursor() else {
        return;
    };
    // Độ dời bằng điểm, đổi ra pixel theo tỉ lệ của màn hình chứa thanh.
    let dx = ((cursor.0 - drag.cursor.0) * drag.scale).round() as i32;
    let dy = ((cursor.1 - drag.cursor.1) * drag.scale).round() as i32;
    let next = placement::resized(drag.frame, drag.edge, dx, dy, drag.min.0, drag.min.1);
    if let Err(e) = overlay.surface.set_frame(next) {
        log::warn!("không đổi được kích thước thanh phụ đề: {e}");
    }
}

/// Nhả chuột: hết lần kéo cạnh, nhớ vị trí và kích thước mới.
pub fn end_resize<R: Runtime>(app: &AppHandle<R>) {
    let Some(overlay) = app.try_state::<OverlaySurface>() else {
        return;
    };
    if overlay.drag().take().is_some() {
        remember_position(app);
    }
}
