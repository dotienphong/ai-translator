//! Trên Mac, `⌘Q` và mục Quit ở Dock không thoát app (spec §4.3); chỉ Thoát ở menu khay mới thoát.
//! Nhưng không được cản đăng xuất, khởi động lại, tắt máy (R9 của kế hoạch 00).
//!
//! Cách làm: tao (event loop của Tauri) không cài `applicationShouldTerminate:`, nên `⌘Q`, Quit ở
//! Dock và yêu cầu thoát của hệ thống đều đi thẳng tới `NSApp terminate:` rồi thoát. App thêm
//! `applicationShouldTerminate:` vào lớp app delegate của tao:
//! - Apple Event `quit` có thuộc tính lý do (`kAEQuitReason`) là do loginwindow gửi khi đăng xuất,
//!   khởi động lại hay tắt máy: cho thoát.
//! - Mọi trường hợp khác (`⌘Q`, mục Quit ở menu app, Quit ở Dock, `osascript -e 'quit app ...'`): hủy,
//!   rồi gọi `on_cancel` để app hiện cửa sổ chính kèm lời nhắc thoát ở menu bar (không dùng thông báo
//!   hệ thống, vì cần xin quyền).
//!
//! Thoát ở menu khay gọi `AppHandle::exit`; tao dừng event loop bằng `stop:`, không qua `terminate:`,
//! nên không bị hàm này chặn. Cập nhật app (kế hoạch 07) dùng `AppHandle::restart`, cũng không qua đây.

/// Mã bốn ký tự của Apple Event, như `'why?'`.
pub const fn four_cc(code: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*code)
}

pub const K_CORE_EVENT_CLASS: u32 = four_cc(b"aevt");
pub const K_AE_QUIT_APPLICATION: u32 = four_cc(b"quit");
pub const K_AE_QUIT_REASON: u32 = four_cc(b"why?");

/// Các lý do thoát do hệ thống gửi (AERegistry.h).
const SYSTEM_QUIT_REASONS: [u32; 7] = [
    four_cc(b"logo"), // kAELogOut
    four_cc(b"rlgo"), // kAEReallyLogOut
    four_cc(b"rrst"), // kAEShowRestartDialog
    four_cc(b"rsdn"), // kAEShowShutdownDialog
    four_cc(b"rest"), // kAERestart
    four_cc(b"shut"), // kAEShutDown
    four_cc(b"quia"), // kAEQuitAll
];

/// Apple Event đang được xử lý lúc `terminate:` được gọi, nếu có.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct QuitEvent {
    pub event_class: u32,
    pub event_id: u32,
    /// Giá trị của thuộc tính `kAEQuitReason`, nếu có.
    pub reason: Option<u32>,
}

/// Có cho app thoát không.
pub fn allow_terminate(event: Option<QuitEvent>) -> bool {
    event.is_some_and(|e| {
        e.event_class == K_CORE_EVENT_CLASS
            && e.event_id == K_AE_QUIT_APPLICATION
            && e.reason.is_some_and(|r| SYSTEM_QUIT_REASONS.contains(&r))
    })
}

/// Trả lời của `applicationShouldTerminate:` (`NSApplicationTerminateReply`).
pub const NS_TERMINATE_CANCEL: usize = 0;
pub const NS_TERMINATE_NOW: usize = 1;

/// Trả lời cho một yêu cầu thoát. Hủy thì gọi `on_cancel`; `on_cancel` mà panic thì chỉ ghi log, không để
/// panic chạy ngược qua khung của AppKit (hành vi không xác định).
pub fn terminate_reply(event: Option<QuitEvent>, on_cancel: Option<&dyn Fn()>) -> usize {
    if allow_terminate(event) {
        log::info!("cho thoát theo yêu cầu của hệ thống: {event:?}");
        return NS_TERMINATE_NOW;
    }
    log::info!("bỏ qua yêu cầu thoát không đến từ menu khay: {event:?}");
    if let Some(on_cancel) = on_cancel
        && std::panic::catch_unwind(std::panic::AssertUnwindSafe(on_cancel)).is_err()
    {
        log::error!("lỗi khi hiện cửa sổ chính sau khi hủy yêu cầu thoát");
    }
    NS_TERMINATE_CANCEL
}

/// Việc cần làm khi hủy một yêu cầu thoát.
#[cfg(target_os = "macos")]
static ON_CANCEL: std::sync::OnceLock<Box<dyn Fn() + Send + Sync>> = std::sync::OnceLock::new();

/// Cài `applicationShouldTerminate:` vào app delegate. Gọi một lần trong `setup`, trên luồng chính.
/// Trả `false` (và ghi log) nếu không cài được: không ở luồng chính, đã cài rồi, NSApp chưa có
/// delegate, hoặc delegate đã có phương thức này. Chỉ gán `on_cancel` khi đã cài xong.
#[cfg(target_os = "macos")]
pub fn install(on_cancel: impl Fn() + Send + Sync + 'static) -> bool {
    use objc2::MainThreadMarker;
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{class, msg_send, sel};

    extern "C-unwind" fn should_terminate(_this: *mut AnyObject, _cmd: Sel, _sender: *mut AnyObject) -> usize {
        let on_cancel = ON_CANCEL.get().map(|f| f.as_ref() as &dyn Fn());
        terminate_reply(current_quit_event(), on_cancel)
    }

    if MainThreadMarker::new().is_none() {
        log::warn!("chặn thoát phải cài trên luồng chính");
        return false;
    }
    if ON_CANCEL.get().is_some() {
        log::warn!("chặn thoát đã được cài");
        return false;
    }
    // SAFETY: đang ở luồng chính (kiểm ở trên), sau khi tao đã tạo NSApplication và gắn delegate. Chữ ký
    // của hàm khớp `- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender`,
    // kiểu trả về là NSUInteger ("Q"); `class_addMethod` không ghi đè nếu lớp đã có phương thức này.
    let added = unsafe {
        let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let delegate: *mut AnyObject = msg_send![app, delegate];
        let Some(delegate) = delegate.as_ref() else {
            log::warn!("NSApp chưa có delegate, không cài được chặn thoát");
            return false;
        };
        let class = delegate.class() as *const AnyClass as *mut AnyClass;
        let imp: Imp = std::mem::transmute::<extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> usize, Imp>(
            should_terminate,
        );
        objc2::ffi::class_addMethod(class, sel!(applicationShouldTerminate:), imp, c"Q@:@".as_ptr()).as_bool()
    };
    if !added {
        log::warn!("app delegate đã có applicationShouldTerminate:, không cài chặn thoát");
        return false;
    }
    // Luồng chính là luồng duy nhất gọi `should_terminate`, nên gán sau khi cài vẫn kịp trước lần gọi đầu.
    let _ = ON_CANCEL.set(Box::new(on_cancel));
    true
}

#[cfg(target_os = "macos")]
fn current_quit_event() -> Option<QuitEvent> {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    // SAFETY: NSAppleEventManager dùng được trên luồng chính; `currentAppleEvent` trả nil khi không
    // có Apple Event nào đang xử lý. AEEventClass, AEEventID, AEKeyword và OSType đều là UInt32.
    unsafe {
        let manager: *mut AnyObject = msg_send![class!(NSAppleEventManager), sharedAppleEventManager];
        let event: *mut AnyObject = msg_send![manager, currentAppleEvent];
        let event = event.as_ref()?;
        let event_class: u32 = msg_send![event, eventClass];
        let event_id: u32 = msg_send![event, eventID];
        let reason: *mut AnyObject = msg_send![event, attributeDescriptorForKeyword: K_AE_QUIT_REASON];
        let reason = reason.as_ref().map(|descriptor| {
            let code: u32 = msg_send![descriptor, enumCodeValue];
            code
        });
        Some(QuitEvent {
            event_class,
            event_id,
            reason,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quit(reason: Option<&[u8; 4]>) -> Option<QuitEvent> {
        Some(QuitEvent {
            event_class: K_CORE_EVENT_CLASS,
            event_id: K_AE_QUIT_APPLICATION,
            reason: reason.map(four_cc),
        })
    }

    #[test]
    fn four_cc_is_big_endian() {
        assert_eq!(four_cc(b"quit"), 0x7175_6974);
    }

    #[test]
    fn logout_restart_and_shutdown_are_allowed() {
        for reason in [b"logo", b"rlgo", b"rrst", b"rsdn", b"rest", b"shut", b"quia"] {
            assert!(
                allow_terminate(quit(Some(reason))),
                "{}",
                String::from_utf8_lossy(reason)
            );
        }
    }

    #[test]
    fn cmd_q_and_dock_quit_are_cancelled() {
        // ⌘Q gọi thẳng `terminate:`, không có Apple Event.
        assert!(!allow_terminate(None));
        // Quit ở Dock và `osascript` gửi Apple Event `quit` không có lý do.
        assert!(!allow_terminate(quit(None)));
        // Lý do lạ cũng không cho qua.
        assert!(!allow_terminate(quit(Some(b"abcd"))));
        // Apple Event khác (ví dụ mở file) đang xử lý lúc gọi `terminate:`.
        let open = QuitEvent {
            event_class: K_CORE_EVENT_CLASS,
            event_id: four_cc(b"odoc"),
            reason: Some(four_cc(b"shut")),
        };
        assert!(!allow_terminate(Some(open)));
    }

    #[test]
    fn cancelled_quit_runs_on_cancel_and_system_quit_does_not() {
        let calls = std::cell::Cell::new(0);
        let on_cancel = || calls.set(calls.get() + 1);
        assert_eq!(terminate_reply(quit(Some(b"shut")), Some(&on_cancel)), NS_TERMINATE_NOW);
        assert_eq!(calls.get(), 0);
        assert_eq!(terminate_reply(None, Some(&on_cancel)), NS_TERMINATE_CANCEL);
        assert_eq!(calls.get(), 1);
        assert_eq!(terminate_reply(None, None), NS_TERMINATE_CANCEL, "chưa cài on_cancel");
    }

    #[test]
    fn panic_in_on_cancel_does_not_unwind_into_appkit() {
        let on_cancel = || panic!("lỗi giả khi hiện cửa sổ chính");
        assert_eq!(terminate_reply(None, Some(&on_cancel)), NS_TERMINATE_CANCEL);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn install_off_the_main_thread_does_nothing() {
        // Luồng phụ: dừng trước khi chạm NSApp, không gán `ON_CANCEL`.
        let installed = std::thread::spawn(|| install(|| {})).join().unwrap();
        assert!(!installed);
        assert!(ON_CANCEL.get().is_none());
    }
}
