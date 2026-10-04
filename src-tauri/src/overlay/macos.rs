//! Thanh phụ đề trên macOS: NSPanel non-activating, mức `Status`, có mặt ở mọi Space kể cả Space
//! toàn màn hình của app khác (spec §4.4). Giữ nguyên cách tạo của spike S5 (kế hoạch 0-05, Task 2):
//! - panel tạo từ cửa sổ không viền, trong suốt, không focus, `accept_first_mouse`;
//! - bit NonactivatingPanel được cộng thêm bằng `add_style_mask`; `StyleMask::borderless()` gán đè
//!   cả mask nên không được dùng, nếu không panel sẽ lấy focus của app họp.

use tauri::{AppHandle, Runtime, WebviewUrl};
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask};

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
    PanelBuilder::<_, OverlayPanel<R>>::new(app, LABEL)
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
    Ok(())
}

pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> tauri::Result<()> {
    if let Ok(panel) = app.get_webview_panel(LABEL) {
        if visible { panel.show() } else { panel.hide() }
    }
    Ok(())
}

pub fn set_ignore_mouse<R: Runtime>(app: &AppHandle<R>, ignore: bool) -> tauri::Result<()> {
    if let Ok(panel) = app.get_webview_panel(LABEL) {
        panel.set_ignores_mouse_events(ignore);
    }
    Ok(())
}

/// tao trên macOS không có `drag_resize_window`: app tự đổi kích thước theo con trỏ.
pub fn system_resize<R: Runtime>(_app: &AppHandle<R>, _edge: Edge) -> bool {
    false
}
