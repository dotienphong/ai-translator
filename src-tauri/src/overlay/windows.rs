//! Thanh phụ đề trên Windows: cửa sổ không viền, trong suốt, topmost, không có nút ở taskbar, không
//! lấy focus (`focusable(false)` đặt `WS_EX_NOACTIVATE`). Giữ nguyên cách tạo của spike S5.
//! Cần Windows để thử (ma trận S5 trên Windows, C5 của kế hoạch 00).
//!
//! Sau khi tạo, ẩn/hiện và click xuyên qua làm hẳn bằng Win32, không qua `show`, `hide` hay
//! `set_ignore_cursor_events` của tao (QĐ23). tao giữ cờ `VISIBLE` riêng: cửa sổ hiện bằng Win32 thì tao
//! vẫn tưởng đang ẩn, nên `hide()` không làm gì; đổi click xuyên qua tao thì tao áp lại cả bộ cờ, gọi
//! `SW_HIDE` (thanh biến mất) hoặc `SW_SHOW` (lấy focus). `AppStatus.overlay_visible` là trạng thái gốc.
//! Cũng vì vậy, không gọi hàm nào đổi cờ của tao cho cửa sổ này sau khi tạo (`set_resizable`,
//! `set_always_on_top`, `set_decorations`, `set_maximizable`…): mọi cờ đặt một lần ở `create`.

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use windows::Win32::UI::WindowsAndMessaging::{
    GWL_EXSTYLE, GetWindowLongPtrW, SW_HIDE, SW_SHOWNOACTIVATE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SWP_NOZORDER, SetWindowLongPtrW, SetWindowPos, ShowWindow, WS_EX_LAYERED, WS_EX_TRANSPARENT,
};

use super::LABEL;
use super::placement::Edge;
use crate::navigation;

pub fn create<R: Runtime>(app: &AppHandle<R>, title: &str) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("overlay.html".into()))
        .title(title)
        .inner_size(900.0, 160.0)
        // Kéo cạnh để đổi kích thước (§4.4): thanh phụ đề tự vẽ vùng kéo cạnh, rồi hệ điều hành đổi kích thước
        // (`system_resize`). Cờ đặt một lần ở đây (QĐ23 của kế hoạch 01). Cỡ tối thiểu trên mức của `settings`, để vị trí
        // luôn lưu được.
        .resizable(true)
        .min_inner_size(super::MIN_WIDTH, super::MIN_HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        // Không có nút phóng to: kéo thanh lên mép trên thì Aero Snap không phóng to. Ghép nửa màn hình
        // (kéo sang mép trái, phải) còn tùy kiểu cửa sổ cho đổi cỡ (`WS_THICKFRAME`), cờ này không chắc
        // chặn được; Task 25 dòng 17 kiểm.
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

pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(LABEL) else {
        return Ok(());
    };
    let hwnd = window.hwnd()?;
    // `SW_SHOWNOACTIVATE` hiện cửa sổ mà không kích hoạt, nên không lấy focus của app họp.
    let command = if visible { SW_SHOWNOACTIVATE } else { SW_HIDE };
    // SAFETY: `hwnd` là cửa sổ của chính app, còn sống trong lúc gọi. Hàm Win32 này gửi việc sang luồng
    // sở hữu cửa sổ nếu cần, nên gọi từ luồng nào cũng được.
    let _ = unsafe { ShowWindow(hwnd, command) };
    Ok(())
}

/// Bật/tắt click xuyên qua bằng đúng hai bit mà tao dùng (`WS_EX_TRANSPARENT | WS_EX_LAYERED`), rồi báo
/// hệ thống cập nhật khung cửa sổ mà không đổi vị trí, thứ tự hay focus.
pub fn set_ignore_mouse<R: Runtime>(app: &AppHandle<R>, ignore: bool) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(LABEL) else {
        return Ok(());
    };
    let hwnd = window.hwnd()?;
    let bits = (WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0) as isize;
    // SAFETY: như `set_visible`; chỉ đổi hai bit của kiểu mở rộng, giữ nguyên các bit khác.
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let next = if ignore { style | bits } else { style & !bits };
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
        SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        )
        .map_err(std::io::Error::other)?;
    }
    Ok(())
}

/// Hệ điều hành đổi kích thước theo con trỏ tới khi nhả chuột (`WM_NCLBUTTONDOWN` với cạnh tương ứng, qua tao).
pub fn system_resize<R: Runtime>(app: &AppHandle<R>, edge: Edge) -> bool {
    let Some(window) = app.get_webview_window(LABEL) else {
        return false;
    };
    // `tauri` không xuất kiểu `ResizeDirection`; tên hướng trùng `Edge::direction`, nên dựng qua serde.
    let Ok(direction) = serde_json::from_value(serde_json::Value::String(edge.direction().into())) else {
        return false;
    };
    window.as_ref().window().start_resize_dragging(direction).is_ok()
}
