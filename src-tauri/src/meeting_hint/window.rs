//! Cửa sổ gợi ý bật dịch trên Windows: không viền, trong suốt, luôn nổi, không có nút ở taskbar và **không lấy focus** của app họp
//! (`focusable(false)` đặt `WS_EX_NOACTIVATE`; hiện bằng `SW_SHOWNOACTIVATE`). Cờ đặt một lần ở `create`, như thanh phụ đề
//! (`overlay::windows`): ẩn hiện làm bằng Win32, không qua `show`, `hide` của tao, và không gọi hàm nào đổi cờ sau khi tạo.
//!
//! Vị trí: sát góc dưới phải vùng làm việc của màn hình chính (ngay trên taskbar, nơi có khay hệ thống).

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindowBuilder};
use windows::Win32::UI::WindowsAndMessaging::{SW_HIDE, SW_SHOWNOACTIVATE, ShowWindow};

use super::LABEL;
use crate::navigation;

/// Bề rộng và chiều cao, px logic. Giao diện vẽ thẻ trong khung này, kèm mũi tên chỉ xuống khay.
const WIDTH: f64 = 296.0;
const HEIGHT: f64 = 168.0;
/// Cách mép vùng làm việc, px logic.
const MARGIN: f64 = 8.0;

/// Tạo cửa sổ gợi ý nếu chưa có, ẩn. Gọi lúc cần hiện lần đầu (không tạo lúc khởi động: không tốn bộ nhớ, không có gì để hỏng nếu app
/// không bao giờ có cuộc họp). Gọi từ luồng lấy mẫu, không phải luồng giao diện.
fn ensure<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("hint.html".into()))
        .title(app.package_info().name.clone())
        .inner_size(WIDTH, HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .maximizable(false)
        .minimizable(false)
        .shadow(false)
        .focused(false)
        .focusable(false)
        .visible(false)
        .on_new_window(navigation::new_window_handler(app.clone()))
        .build()?;
    Ok(())
}

/// Đặt cửa sổ ở góc dưới phải của màn hình chính rồi hiện mà không kích hoạt.
pub fn show<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    ensure(app)?;
    let Some(window) = app.get_webview_window(LABEL) else {
        return Ok(());
    };
    if let Some(monitor) = app.primary_monitor()? {
        let scale = monitor.scale_factor();
        let work = monitor.work_area();
        let (width, height, margin) = (
            (WIDTH * scale).round(),
            (HEIGHT * scale).round(),
            (MARGIN * scale).round(),
        );
        let x = f64::from(work.position.x) + f64::from(work.size.width) - width - margin;
        let y = f64::from(work.position.y) + f64::from(work.size.height) - height - margin;
        window.set_size(PhysicalSize::new(width as u32, height as u32))?;
        window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))?;
    }
    let hwnd = window.hwnd()?;
    // SAFETY: `hwnd` là cửa sổ của chính app, còn sống trong lúc gọi; hàm Win32 gửi việc sang luồng sở hữu cửa sổ nếu cần.
    let _ = unsafe { ShowWindow(hwnd, SW_SHOWNOACTIVATE) };
    Ok(())
}

pub fn hide<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(LABEL) else {
        return Ok(());
    };
    let hwnd = window.hwnd()?;
    // SAFETY: như `show`.
    let _ = unsafe { ShowWindow(hwnd, SW_HIDE) };
    Ok(())
}
