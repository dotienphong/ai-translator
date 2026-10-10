//! Thanh phụ đề trên macOS: NSPanel non-activating, mức `Status`, có mặt ở mọi Space kể cả Space
//! toàn màn hình của app khác (spec §4.4). Giữ nguyên cách tạo của spike S5 (kế hoạch 0-05, Task 2):
//! - panel tạo từ cửa sổ không viền, trong suốt, không focus, `accept_first_mouse`;
//! - bit NonactivatingPanel được cộng thêm bằng `add_style_mask`; `StyleMask::borderless()` gán đè
//!   cả mask nên không được dùng, nếu không panel sẽ lấy focus của app họp;
//! - cộng bit sau khi cửa sổ đã tạo chỉ đổi `styleMask`, chưa làm hệ điều hành ngừng kích hoạt app khi bấm vào panel
//!   (xem [`prevent_activation`]).

use tauri::{AppHandle, Runtime, WebviewUrl};
use tauri_nspanel::{CollectionBehavior, ManagerExt, Panel, PanelBuilder, PanelLevel, StyleMask};

use super::placement::Edge;
use super::{LABEL, MIN_HEIGHT, MIN_WIDTH};
use crate::navigation;

tauri_nspanel::tauri_panel! {
    panel!(OverlayPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true,
            // Panel không bao giờ là key window (để không cướp phím của app họp), nên WebKit coi trang là không active:
            // con trỏ CSS (`ns-resize` ở mép) không đổi, `:hover` không được vẽ lại và sự kiện chuột rời khỏi trang không
            // tới (đo trên máy thật: `document.hasFocus()` là `false`, `pointerleave` 0 trên 5 lần vào). Báo `true` để
            // WebKit coi trang là active. Phím vẫn không vào panel vì `can_become_key_window` là `false`: AppKit chọn cửa
            // sổ nhận phím theo khả năng đó và theo `NSApp.keyWindow`, không theo `isKeyWindow`.
            is_key_window: true
        }
    })
}

pub fn create<R: Runtime>(app: &AppHandle<R>, title: &str) -> tauri::Result<()> {
    let handle = app.clone();
    let panel = PanelBuilder::<_, OverlayPanel<R>>::new(app, LABEL)
        .url(WebviewUrl::App("overlay.html".into()))
        .title(title)
        .size(tauri::Size::Logical(tauri::LogicalSize::new(900.0, 160.0)))
        // Kéo cạnh để đổi kích thước (§4.4): app tự đổi khung theo con trỏ (`overlay::resize_to_cursor`). Vẫn đặt
        // `resizable` và cỡ tối thiểu, phòng khi chính NSPanel không viền cũng cho kéo ở mép ngoài cùng.
        .resizable(true)
        .min_size(tauri::Size::Logical(tauri::LogicalSize::new(MIN_WIDTH, MIN_HEIGHT)))
        .with_window(move |w| {
            w.decorations(false)
                .transparent(true)
                .focused(false)
                .visible(false)
                .accept_first_mouse(true)
                .on_new_window(navigation::new_window_handler(handle.clone()))
        })
        .level(PanelLevel::Status)
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
    prevent_activation(&*panel);
    Ok(())
}

/// Bấm vào panel không được kích hoạt app (spec §4.4: thanh phụ đề không lấy focus của app họp).
///
/// Cờ "không kích hoạt app khi bấm" của hệ điều hành chỉ được đặt khi cửa sổ **được tạo** với `NonactivatingPanel`.
/// Panel này tạo từ một cửa sổ có sẵn rồi mới cộng bit bằng `add_style_mask`: `styleMask` có bit, nhưng cờ kia không được
/// đặt, nên bấm vào thanh làm app của ta thành app phía trước và chữ gõ không còn vào app họp. Đo bằng chương trình thử
/// riêng (NSPanel tạo ngay với bit: không kích hoạt; đổi lớp rồi cộng bit sau: kích hoạt; thêm `_setPreventsActivation:`:
/// không kích hoạt). Phải gọi sau `add_style_mask`.
///
/// `_setPreventsActivation:` là hàm riêng của AppKit. Máy nào không có hàm này thì bỏ qua và ghi log: thanh vẫn chạy,
/// chỉ còn lỗi cũ.
fn prevent_activation<R: Runtime>(panel: &dyn Panel<R>) {
    let target = panel.as_panel();
    let selector = objc2::sel!(_setPreventsActivation:);
    // SAFETY: `target` là một NSPanel còn sống; `_setPreventsActivation:` nhận một BOOL và không trả giá trị.
    unsafe {
        let supported: bool = objc2::msg_send![target, respondsToSelector: selector];
        if supported {
            let _: () = objc2::msg_send![target, _setPreventsActivation: true];
        } else {
            log::warn!("macOS không có _setPreventsActivation:, bấm vào thanh phụ đề có thể kích hoạt app");
        }
    }
}

/// Chạy `f` trên luồng chính. NSPanel chỉ được đổi từ luồng chính: `tauri_nspanel` gọi thẳng AppKit (`orderOut:`…) trên
/// luồng của người gọi, và AppKit dừng app ("Must only be used from the main thread") khi bị gọi từ luồng khác. Nút ✕
/// của thanh phụ đề ẩn thanh từ luồng của `spawn_blocking` (dừng phiên có thể chờ vài giây) nên đã làm app crash ở bản
/// 0.1.3–0.1.5. Đang ở luồng chính thì `run_on_main_thread` chạy `f` ngay, nên người gọi trên luồng chính không đổi gì.
fn on_main_thread<R: Runtime>(app: &AppHandle<R>, f: impl FnOnce(&AppHandle<R>) + Send + 'static) -> tauri::Result<()> {
    let handle = app.clone();
    app.run_on_main_thread(move || f(&handle))
}

pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> tauri::Result<()> {
    on_main_thread(app, move |app| {
        if let Ok(panel) = app.get_webview_panel(LABEL) {
            if visible { panel.show() } else { panel.hide() }
        }
    })
}

pub fn set_ignore_mouse<R: Runtime>(app: &AppHandle<R>, ignore: bool) -> tauri::Result<()> {
    on_main_thread(app, move |app| {
        if let Ok(panel) = app.get_webview_panel(LABEL) {
            panel.set_ignores_mouse_events(ignore);
        }
    })
}

/// tao trên macOS không có `drag_resize_window`: app tự đổi kích thước theo con trỏ.
pub fn system_resize<R: Runtime>(_app: &AppHandle<R>, _edge: Edge) -> bool {
    false
}
