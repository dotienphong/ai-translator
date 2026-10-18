//! Ô soạn Gõ dịch trên macOS (spec 2026-10-17-go-dich §3.1, §4.2): NSPanel không kích hoạt app nhưng nhận được bàn phím (kiểu
//! Spotlight). App chat vẫn là app phía trước suốt lúc ô soạn mở, nên ẩn ô soạn thì cửa sổ của nó nhận lại bàn phím, không cần
//! nhớ cửa sổ trước. Dán: chép vào clipboard (`NSPasteboard`) rồi gửi ⌘V (`CGEventPost`), việc này cần quyền Trợ năng.
//!
//! Mọi thao tác trên panel chạy trên luồng chính: AppKit dừng app khi bị gọi từ luồng khác (xem `overlay::macos`).

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, mpsc};
use std::time::Duration;

use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::data::{CFData, CFDataRef};
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::string::{CFString, CFStringRef};
use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSPasteboard, NSPasteboardTypeString, NSResponder, NSScreen};
use objc2_core_graphics::{CGEvent, CGEventFlags, CGEventSource, CGEventSourceStateID, CGEventTapLocation};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl};
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask};

use super::{LABEL, MIN_HEIGHT, Native, WIDTH};
use crate::{navigation, overlay};
use panel::ComposePanel;

/// Lớp NSPanel của ô soạn. Để trong module riêng: macro tự nhập vài tên của AppKit (`NSEvent`, `NSPoint`…) vào module chứa nó.
mod panel {
    tauri_nspanel::tauri_panel! {
        panel!(ComposePanel {
            config: {
                // Khác thanh phụ đề: ô soạn phải nhận bàn phím. Panel không kích hoạt app nên app chat vẫn ở phía trước.
                can_become_key_window: true,
                is_floating_panel: true
            }
        })
    }
}

/// Chờ cửa sổ của app chat nhận lại bàn phím sau khi ô soạn ẩn, rồi mới gửi ⌘V (spec §4.1 bước 4). Spike S2 chốt con số.
const PASTE_DELAY: Duration = Duration::from_millis(120);
/// Mã phím V của bố cục ANSI (`kVK_ANSI_V`), khi không tìm được phím ra chữ "v" trên bố cục đang dùng.
const ANSI_V: u16 = 9;
/// Chờ luồng chính làm xong một việc trên panel tối đa chừng này.
const MAIN_WAIT: Duration = Duration::from_secs(2);
/// `kUCKeyActionDisplay`, `kUCKeyTranslateNoDeadKeysMask` của `UCKeyTranslate`.
const UC_KEY_ACTION_DISPLAY: u16 = 3;
const UC_NO_DEAD_KEYS: u32 = 1;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
    static kAXTrustedCheckOptionPrompt: CFStringRef;
}

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    fn TISCopyCurrentKeyboardLayoutInputSource() -> *mut c_void;
    fn TISGetInputSourceProperty(source: *mut c_void, key: CFStringRef) -> *const c_void;
    static kTISPropertyUnicodeKeyLayoutData: CFStringRef;
    fn LMGetKbdType() -> u8;
    fn UCKeyTranslate(
        layout: *const c_void,
        code: u16,
        action: u16,
        modifiers: u32,
        keyboard: u32,
        options: u32,
        dead: *mut u32,
        max: usize,
        len: *mut usize,
        chars: *mut u16,
    ) -> i32;
}

/// Bản thật của [`Native`] trên macOS.
pub struct MacNative<R: Runtime> {
    app: AppHandle<R>,
    visible: AtomicBool,
    /// Chiều cao giao diện xin gần nhất (px logic), dùng lại mỗi lần hiện.
    height: Mutex<f64>,
}

/// Tạo ô soạn ẩn, như thanh phụ đề (`overlay::macos::create`) nhưng nhận được bàn phím.
pub fn create<R: Runtime>(app: &AppHandle<R>, title: &str) -> tauri::Result<MacNative<R>> {
    let handle = app.clone();
    let panel = PanelBuilder::<_, ComposePanel<R>>::new(app, LABEL)
        .url(WebviewUrl::App("compose.html".into()))
        .title(title)
        .size(tauri::Size::Logical(tauri::LogicalSize::new(WIDTH, MIN_HEIGHT)))
        .resizable(false)
        .with_window(move |w| {
            w.decorations(false)
                .transparent(true)
                .focused(false)
                .visible(false)
                .on_new_window(navigation::new_window_handler(handle.clone()))
        })
        .level(PanelLevel::Status)
        .add_style_mask(StyleMask::empty().nonactivating_panel())
        .collection_behavior(CollectionBehavior::new().can_join_all_spaces().full_screen_auxiliary())
        .transparent(true)
        .has_shadow(true)
        .hides_on_deactivate(false)
        .becomes_key_only_if_needed(false)
        .no_activate(true)
        .build()?;
    overlay::macos::prevent_activation(&*panel);
    Ok(MacNative {
        app: app.clone(),
        visible: AtomicBool::new(false),
        height: Mutex::new(MIN_HEIGHT),
    })
}

/// Chạy `f` trên luồng chính và chờ kết quả (tối đa [`MAIN_WAIT`]). Đang ở luồng chính (phím tắt) thì chạy ngay, không chờ
/// chính mình.
fn on_main<R: Runtime, T: Send + 'static>(
    app: &AppHandle<R>,
    f: impl FnOnce(&AppHandle<R>) -> T + Send + 'static,
) -> Option<T> {
    if MainThreadMarker::new().is_some() {
        return Some(f(app));
    }
    let (tx, rx) = mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(f(&handle));
    })
    .ok()?;
    rx.recv_timeout(MAIN_WAIT).ok()
}

/// Khung của ô soạn trên một màn hình (spec §1.2), tọa độ AppKit (điểm, gốc ở góc dưới bên trái): giữa màn hình theo chiều
/// ngang; mép trên cách đỉnh màn hình 25% chiều cao màn hình, không cao hơn vùng làm việc (dưới menu bar).
fn frame_on(screen: NSRect, visible: NSRect, height: f64) -> NSRect {
    let x = screen.origin.x + (screen.size.width - WIDTH) / 2.0;
    let top = (screen.origin.y + screen.size.height * 0.75).min(visible.origin.y + visible.size.height);
    NSRect::new(NSPoint::new(x, top - height), NSSize::new(WIDTH, height))
}

fn contains(rect: NSRect, point: NSPoint) -> bool {
    point.x >= rect.origin.x
        && point.x < rect.origin.x + rect.size.width
        && point.y >= rect.origin.y
        && point.y < rect.origin.y + rect.size.height
}

/// Đưa bàn phím vào WebView của ô soạn: panel nhận phím rồi chuyển cho WKWebView, trang tự đặt con trỏ vào ô gõ.
fn focus_webview<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let handle = app.clone();
    let _ = window.with_webview(move |webview| {
        let Ok(panel) = handle.get_webview_panel(LABEL) else {
            return;
        };
        // SAFETY: `inner()` là WKWebView (một NSView, nên là NSResponder) còn sống của chính cửa sổ này; `with_webview` chạy
        // trên luồng chính.
        let view = unsafe { &*webview.inner().cast::<NSResponder>() };
        panel.make_first_responder(Some(view));
    });
}

/// Mã phím ra chữ "v" trên bố cục bàn phím đang dùng (Dvorak, AZERTY… khác ANSI), để ⌘V đúng là lệnh Dán. Phải gọi trên luồng
/// chính: các hàm TIS dừng app khi bị gọi từ luồng khác (macOS 14 trở lên).
fn v_keycode() -> Option<u16> {
    // SAFETY: các hàm Carbon dưới đây chỉ đọc bố cục bàn phím hiện tại; nguồn bố cục được trả lại (`CFType`, luật create) khi
    // ra khỏi hàm; dữ liệu `uchr` thuộc nguồn đó và chỉ được đọc trong lúc nguồn còn sống; bộ đệm chữ có kích thước đúng.
    unsafe {
        let source = TISCopyCurrentKeyboardLayoutInputSource();
        if source.is_null() {
            return None;
        }
        let source = CFType::wrap_under_create_rule(source as CFTypeRef);
        let data = TISGetInputSourceProperty(source.as_CFTypeRef() as *mut c_void, kTISPropertyUnicodeKeyLayoutData);
        if data.is_null() {
            return None;
        }
        let data = CFData::wrap_under_get_rule(data as CFDataRef);
        let layout = data.bytes().as_ptr().cast::<c_void>();
        let keyboard = u32::from(LMGetKbdType());
        (0u16..128).find(|&code| {
            let (mut dead, mut len, mut chars) = (0u32, 0usize, [0u16; 4]);
            let status = UCKeyTranslate(
                layout,
                code,
                UC_KEY_ACTION_DISPLAY,
                0,
                keyboard,
                UC_NO_DEAD_KEYS,
                &mut dead,
                chars.len(),
                &mut len,
                chars.as_mut_ptr(),
            );
            status == 0 && len == 1 && chars[0] == u16::from(b'v')
        })
    }
}

/// Gửi tổ hợp ⌘ + `key` (nhấn rồi nhả) vào app đang nhận bàn phím.
fn post_command_key(key: u16) {
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState);
    for down in [true, false] {
        let event = CGEvent::new_keyboard_event(source.as_deref(), key, down);
        CGEvent::set_flags(event.as_deref(), CGEventFlags::MaskCommand);
        CGEvent::post(CGEventTapLocation::SessionEventTap, event.as_deref());
    }
}

impl<R: Runtime> Native for MacNative<R> {
    fn show(&self) -> tauri::Result<()> {
        let height = *self.height.lock().unwrap_or_else(|e| e.into_inner());
        let shown = on_main(&self.app, move |app| {
            let Ok(panel) = app.get_webview_panel(LABEL) else {
                return false;
            };
            if let Some(mtm) = MainThreadMarker::new() {
                let mouse = NSEvent::mouseLocation();
                let screen = NSScreen::screens(mtm)
                    .iter()
                    .find(|s| contains(s.frame(), mouse))
                    .or_else(|| NSScreen::mainScreen(mtm));
                if let Some(screen) = screen {
                    panel
                        .as_panel()
                        .setFrame_display(frame_on(screen.frame(), screen.visibleFrame(), height), false);
                }
            }
            panel.show_and_make_key();
            focus_webview(app);
            true
        });
        self.visible.store(shown == Some(true), Ordering::SeqCst);
        Ok(())
    }

    fn hide(&self) -> tauri::Result<()> {
        self.visible.store(false, Ordering::SeqCst);
        on_main(&self.app, |app| {
            if let Ok(panel) = app.get_webview_panel(LABEL) {
                panel.hide();
            }
        });
        Ok(())
    }

    fn visible(&self) -> bool {
        self.visible.load(Ordering::SeqCst)
    }

    fn set_height(&self, height: f64) -> tauri::Result<()> {
        *self.height.lock().unwrap_or_else(|e| e.into_inner()) = height;
        on_main(&self.app, move |app| {
            if let Ok(panel) = app.get_webview_panel(LABEL) {
                let window = panel.as_panel();
                let frame = window.frame();
                let top = frame.origin.y + frame.size.height;
                let next = NSRect::new(NSPoint::new(frame.origin.x, top - height), NSSize::new(WIDTH, height));
                window.setFrame_display(next, true);
            }
        });
        Ok(())
    }

    fn trusted(&self) -> bool {
        // SAFETY: hàm của ApplicationServices, không tham số.
        unsafe { AXIsProcessTrusted() }
    }

    fn request_trust(&self) {
        // SAFETY: khóa là hằng của ApplicationServices (đọc theo luật get); từ điển sống tới hết lời gọi.
        let key = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
        let options = CFDictionary::from_CFType_pairs(&[(key, CFBoolean::true_value())]);
        // SAFETY: như trên.
        let trusted = unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) };
        log::info!("hỏi quyền Trợ năng; đã có quyền: {trusted}");
    }

    fn reset_stale_trust(&self) {
        let id = self.app.config().identifier.clone();
        match std::process::Command::new("/usr/bin/tccutil")
            .args(["reset", "Accessibility", &id])
            .output()
        {
            Ok(out) if out.status.success() => log::info!("đã xóa dòng quyền Trợ năng cũ của {id}"),
            Ok(out) => log::warn!(
                "tccutil reset Accessibility {id} lỗi ({}): {}",
                out.status,
                String::from_utf8_lossy(&out.stderr).trim()
            ),
            Err(e) => log::warn!("không chạy được tccutil: {e}"),
        }
    }

    fn set_clipboard(&self, text: &str) -> Result<(), String> {
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();
        // SAFETY: hằng kiểu dữ liệu của AppKit.
        let kind = unsafe { NSPasteboardTypeString };
        if pasteboard.setString_forType(&NSString::from_str(text), kind) {
            Ok(())
        } else {
            Err("NSPasteboard không nhận chữ".into())
        }
    }

    fn paste(&self) -> bool {
        std::thread::sleep(PASTE_DELAY);
        let key = on_main(&self.app, |_| v_keycode()).flatten().unwrap_or(ANSI_V);
        post_command_key(key);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> NSRect {
        NSRect::new(NSPoint::new(x, y), NSSize::new(width, height))
    }

    /// Spec §1.2: giữa màn hình, mép trên ở 25% chiều cao tính từ đỉnh; màn hình thứ hai lệch gốc thì tính theo gốc của nó.
    #[test]
    fn the_panel_sits_in_the_upper_middle_of_the_screen() {
        let main = rect(0.0, 0.0, 1440.0, 900.0);
        let visible = rect(0.0, 0.0, 1440.0, 875.0);
        assert_eq!(frame_on(main, visible, 120.0), rect(440.0, 555.0, WIDTH, 120.0));
        let side = rect(1440.0, -200.0, 1920.0, 1080.0);
        assert_eq!(frame_on(side, side, 300.0), rect(2120.0, 310.0, WIDTH, 300.0));
        // Màn hình rất thấp: mép trên không cao hơn vùng làm việc.
        let short = rect(0.0, 0.0, 1024.0, 100.0);
        assert_eq!(frame_on(short, rect(0.0, 0.0, 1024.0, 60.0), 120.0).origin.y, -60.0);
        assert!(contains(main, NSPoint::new(0.0, 0.0)) && !contains(main, NSPoint::new(1440.0, 10.0)));
    }
}
