//! Ô soạn Gõ dịch trên Windows (spec 2026-10-17-go-dich §3.1, §4.3): cửa sổ không viền, topmost, không có nút ở taskbar. Trước
//! khi hiện, nhớ cửa sổ đang ở phía trước; lúc dán thì đưa nó về phía trước rồi gửi Ctrl+V (`SendInput`). Không cần quyền gì.
//! App kia chạy quyền admin thì Windows chặn phím giả (UIPI) mà app không biết: bản dịch vẫn nằm trong clipboard. Cần Windows để
//! thử (nghiệm thu GD1, GD4–GD6 trên Windows).

use std::ffi::c_void;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindowBuilder};
use windows::Win32::Foundation::{GlobalFree, HANDLE, HWND};
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
use windows::Win32::System::Ole::CF_UNICODETEXT;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY, VK_CONTROL,
    VK_V,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsWindow, SetForegroundWindow};

use super::{LABEL, MIN_HEIGHT, Native, WIDTH};
use crate::navigation;

/// Chờ cửa sổ trước về phía trước tối đa chừng này rồi mới gửi Ctrl+V; quá thì chỉ chép (spec §4.3).
const FOREGROUND_WAIT: Duration = Duration::from_millis(300);

/// Bản thật của [`Native`] trên Windows.
pub struct WinNative<R: Runtime> {
    app: AppHandle<R>,
    /// Cửa sổ ở phía trước ngay trước khi ô soạn hiện, giữ dạng số để struct dùng được giữa các luồng.
    previous: Mutex<Option<isize>>,
    /// Chiều cao giao diện xin gần nhất (px logic), dùng lại mỗi lần hiện.
    height: Mutex<f64>,
}

/// Tạo ô soạn ẩn. Cờ đặt một lần ở đây, như thanh phụ đề (`overlay::windows`).
pub fn create<R: Runtime>(app: &AppHandle<R>, title: &str) -> tauri::Result<WinNative<R>> {
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("compose.html".into()))
        .title(title)
        .inner_size(WIDTH, MIN_HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .visible(false)
        .on_new_window(navigation::new_window_handler(app.clone()))
        .build()?;
    Ok(WinNative {
        app: app.clone(),
        previous: Mutex::new(None),
        height: Mutex::new(MIN_HEIGHT),
    })
}

/// Một lần nhấn hay nhả phím `vk`.
fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

impl<R: Runtime> WinNative<R> {
    fn height(&self) -> f64 {
        *self.height.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl<R: Runtime> Native for WinNative<R> {
    fn show(&self) -> tauri::Result<()> {
        let Some(window) = self.app.get_webview_window(LABEL) else {
            return Ok(());
        };
        // SAFETY: chỉ đọc cửa sổ đang ở phía trước.
        let foreground = unsafe { GetForegroundWindow() };
        if !foreground.is_invalid() && window.hwnd().ok() != Some(foreground) {
            *self.previous.lock().unwrap_or_else(|e| e.into_inner()) = Some(foreground.0 as isize);
        }
        // Màn hình có con trỏ chuột: trên Windows, vị trí con trỏ và khung màn hình cùng là pixel của toàn desktop (spec §1.2).
        let cursor = self.app.cursor_position()?;
        if let Some(monitor) = self.app.monitor_from_point(cursor.x, cursor.y)? {
            let scale = monitor.scale_factor();
            let (area, work) = (monitor.position(), monitor.work_area());
            let width = (WIDTH * scale).round();
            let height = (self.height() * scale).round();
            let x = f64::from(area.x) + (f64::from(monitor.size().width) - width) / 2.0;
            let y = (f64::from(area.y) + f64::from(monitor.size().height) * 0.25).max(f64::from(work.position.y));
            window.set_size(PhysicalSize::new(width as u32, height as u32))?;
            window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))?;
        }
        window.show()?;
        window.set_focus()
    }

    fn hide(&self) -> tauri::Result<()> {
        match self.app.get_webview_window(LABEL) {
            Some(window) => window.hide(),
            None => Ok(()),
        }
    }

    fn visible(&self) -> bool {
        self.app
            .get_webview_window(LABEL)
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false)
    }

    fn set_height(&self, height: f64) -> tauri::Result<()> {
        *self.height.lock().unwrap_or_else(|e| e.into_inner()) = height;
        let Some(window) = self.app.get_webview_window(LABEL) else {
            return Ok(());
        };
        let scale = window.scale_factor()?;
        let position = window.outer_position()?;
        window.set_size(PhysicalSize::new(
            (WIDTH * scale).round() as u32,
            (height * scale).round() as u32,
        ))?;
        window.set_position(position)
    }

    fn trusted(&self) -> bool {
        true
    }

    fn request_trust(&self) {}

    fn reset_stale_trust(&self) {}

    fn set_clipboard(&self, text: &str) -> Result<(), String> {
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: clipboard mở rồi đóng trong hàm này. Bộ nhớ cấp bằng `GlobalAlloc` đủ chỗ cho chữ cả số 0 cuối; sau khi
        // `SetClipboardData` thành công thì hệ thống giữ nó, chỉ giải phóng khi lời gọi đó lỗi.
        unsafe {
            let mut opened = false;
            for _ in 0..10 {
                if OpenClipboard(None).is_ok() {
                    opened = true;
                    break;
                }
                // App khác đang giữ clipboard: chờ một chút rồi thử lại.
                std::thread::sleep(Duration::from_millis(20));
            }
            if !opened {
                return Err("không mở được clipboard".into());
            }
            let result = (|| -> windows::core::Result<()> {
                EmptyClipboard()?;
                let memory = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2)?;
                let target = GlobalLock(memory).cast::<u16>();
                if target.is_null() {
                    let _ = GlobalFree(Some(memory));
                    return Err(windows::core::Error::from_thread());
                }
                std::ptr::copy_nonoverlapping(wide.as_ptr(), target, wide.len());
                let _ = GlobalUnlock(memory);
                if let Err(e) = SetClipboardData(u32::from(CF_UNICODETEXT.0), Some(HANDLE(memory.0))) {
                    let _ = GlobalFree(Some(memory));
                    return Err(e);
                }
                Ok(())
            })();
            let _ = CloseClipboard();
            result.map_err(|e| e.to_string())
        }
    }

    fn paste(&self) -> bool {
        let Some(previous) = *self.previous.lock().unwrap_or_else(|e| e.into_inner()) else {
            return false;
        };
        let hwnd = HWND(previous as *mut c_void);
        // SAFETY: `hwnd` được kiểm còn là cửa sổ trước khi dùng; các hàm dưới đây không giữ con trỏ nào sau lời gọi.
        unsafe {
            if !IsWindow(Some(hwnd)).as_bool() {
                return false;
            }
            let _ = SetForegroundWindow(hwnd);
            let started = Instant::now();
            while GetForegroundWindow() != hwnd {
                if started.elapsed() >= FOREGROUND_WAIT {
                    return false;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            let inputs = [
                key(VK_CONTROL, false),
                key(VK_V, false),
                key(VK_V, true),
                key(VK_CONTROL, true),
            ];
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) == inputs.len() as u32
        }
    }
}
