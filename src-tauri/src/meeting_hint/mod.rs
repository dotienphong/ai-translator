//! Gợi ý bật dịch khi có cuộc họp (spec 2026-11-01-goi-y-bat-dich-khi-hop). Khi Teams, Zoom hay Google Meet đang họp và có tiếng ra loa
//! liên tục 5 giây, hiện một cửa sổ nhỏ cạnh khay hỏi "Bật dịch?". App không tự bật dịch.
//!
//! - Quyết định nằm ở crate `meeting-scan` (`hint::Hint`, `probe::Probe`): thuần Rust, test trên mọi nền tảng.
//! - `sensor` (Windows): đọc phiên âm thanh của loa, cây tiến trình, cửa sổ họp. Chỉ đọc; tiêu đề cửa sổ chỉ đọc cho file chạy trong
//!   danh sách viết cứng và không được lưu hay ghi log.
//! - `window` (Windows): cửa sổ gợi ý, không lấy focus của app họp.
//! - Phần ở đây: vòng lấy mẫu 500 ms, các lệnh của cửa sổ gợi ý (`get_meeting_hint_view`, `meeting_hint_accept`,
//!   `meeting_hint_dismiss`) và việc ghi "Không hỏi lại" vào cài đặt.
//!
//! **An toàn (yêu cầu của chủ dự án 2026-11-01: không được làm hỏng hay sập app):**
//! - `install` không bao giờ trả lỗi: không tạo được luồng thì chỉ ghi log và tắt tính năng; app vẫn khởi động bình thường.
//! - Cửa sổ gợi ý chỉ được tạo lúc cần hiện lần đầu (không tốn bộ nhớ hay thời gian khởi động nếu không có cuộc họp); không tạo được
//!   thì ghi log, không gợi ý, không ảnh hưởng gì khác.
//! - Bản release đặt `panic = "abort"`: một lần panic là sập cả app. Mã ở đây và ở `meeting-scan` cấm `unwrap`, `expect`, chỉ số mảng,
//!   `panic!` (lint `clippy`); khóa bị nhiễm độc thì dùng tiếp; mọi lỗi của Win32 hay COM chỉ thành giá trị rỗng và dòng log.
//! - Chỉ đọc: không đổi gì trong app họp hay trong cấu hình âm thanh; không mở luồng âm thanh, không đụng tới việc thu của phiên dịch.
//!
//! macOS chưa làm (chủ dự án 2026-11-01): `install` không tạo gì, các lệnh trả "chưa có gợi ý nào".
//! Log chỉ có số liệu và tên app họp (Teams, Zoom, Meet); không có tiêu đề cửa sổ, tên cuộc họp hay tên người.

#![cfg_attr(
    not(test),
    deny(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::unreachable
    )
)]

#[cfg(windows)]
mod sensor;
#[cfg(windows)]
mod window;

use std::sync::{Mutex, MutexGuard};

use meeting_scan::hint::{Hint, HintApp};
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Manager, Runtime};

use crate::actions;
use crate::hotkeys::HotkeyAction;
use crate::settings::{CaptureMode, Settings, Theme, UiLanguage};
use crate::state::{AppState, AppStatus, SessionStatus};

pub const LABEL: &str = "hint";
/// Sự kiện báo cửa sổ gợi ý đổi nội dung (payload: [`HintView`]).
pub const CHANGED_EVENT: &str = "meeting-hint://changed";

/// Trạng thái gợi ý, quản lý bằng `app.manage`; chỉ có khi tính năng chạy (Windows).
pub struct Service {
    hint: Mutex<Hint>,
}

impl Service {
    #[cfg_attr(not(windows), allow(dead_code))]
    fn new() -> Self {
        Self {
            hint: Mutex::new(Hint::new()),
        }
    }

    fn hint(&self) -> MutexGuard<'_, Hint> {
        self.hint.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Phần cài đặt và nội dung mà cửa sổ gợi ý đọc được: chỉ ngôn ngữ, giao diện sáng tối và app đang gợi ý (không tiêu đề, không tên).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HintView {
    pub ui_language: UiLanguage,
    pub theme: Theme,
    /// App đang được gợi ý; `None` khi cửa sổ đang ẩn.
    pub app: Option<HintApp>,
}

pub fn view<R: Runtime>(app: &AppHandle<R>) -> HintView {
    let (ui_language, theme) = app
        .try_state::<AppState>()
        .map(|state| state.settings())
        .map_or((UiLanguage::Vi, Theme::System), |s| (s.ui_language, s.theme));
    HintView {
        ui_language,
        theme,
        app: app.try_state::<Service>().and_then(|s| s.hint().shown()),
    }
}

/// App đang rảnh để gợi ý: không có phiên dịch (đang bắt đầu, đang chạy), không đang nạp model, và đang thu âm thanh máy
/// (chế độ chỉ micro thì không có tiếng cuộc họp để dịch). Phiên vừa dừng vì lỗi (`Error`) tính là rảnh, như lời mời cập nhật.
pub fn idle(settings: &Settings, status: &AppStatus) -> bool {
    matches!(status.session, SessionStatus::Idle | SessionStatus::Error)
        && status.loading.is_none()
        && settings.capture_mode != CaptureMode::Mic
}

/// Chạy vòng lấy mẫu. Gọi một lần trong `setup`, sau `AppState`. Không bao giờ trả lỗi (xem mục An toàn): cửa sổ gợi ý được tạo lúc cần.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    #[cfg(windows)]
    {
        app.manage(Service::new());
        let handle = app.clone();
        if let Err(e) = std::thread::Builder::new()
            .name("meeting-hint".into())
            .spawn(move || sensor::run(handle))
        {
            log::warn!("gợi ý bật dịch: không tạo được luồng, tắt tính năng: {e}");
        }
    }
    #[cfg(not(windows))]
    let _ = app;
    Ok(())
}

/// Hiện cửa sổ gợi ý cho `app` (đã ghi vào máy trạng thái).
#[cfg_attr(not(windows), allow(dead_code))]
fn show<R: Runtime>(app: &AppHandle<R>, hinted: HintApp) {
    log::info!("gợi ý bật dịch: hiện cho {hinted:?}");
    #[cfg(windows)]
    {
        use tauri::Emitter;
        if let Err(e) = app.emit_to(tauri::EventTarget::webview_window(LABEL), CHANGED_EVENT, view(app)) {
            log::warn!("không gửi được sự kiện {CHANGED_EVENT}: {e}");
        }
        if let Err(e) = window::show(app) {
            log::warn!("không hiện được cửa sổ gợi ý: {e}");
        }
    }
    #[cfg(not(windows))]
    let _ = app;
}

fn hide<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(windows)]
    {
        use tauri::Emitter;
        if let Err(e) = window::hide(app) {
            log::warn!("không ẩn được cửa sổ gợi ý: {e}");
        }
        let _ = app.emit_to(tauri::EventTarget::webview_window(LABEL), CHANGED_EVENT, view(app));
    }
    #[cfg(not(windows))]
    let _ = app;
}

/// Người dùng bấm "Bật dịch": bắt đầu phiên như bấm phím tắt Bắt đầu, nếu app còn rảnh (người dùng đã tự bắt đầu thì thôi, kẻo phím
/// tắt chuyển đổi lại dừng phiên của họ).
pub fn accept<R: Runtime>(app: &AppHandle<R>) {
    let Some(service) = app.try_state::<Service>() else {
        return;
    };
    service.hint().accepted();
    hide(app);
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if idle(&state.settings(), &state.status()) {
        log::info!("gợi ý bật dịch: người dùng bật dịch");
        actions::run_hotkey(app, HotkeyAction::ToggleSession);
    }
}

/// Người dùng bấm "Bỏ qua" hay ✕. `ignore_app`: "Không hỏi lại với <app>" — ghi app vào `meetingHint.ignoredApps`.
pub fn dismiss<R: Runtime>(app: &AppHandle<R>, ignore_app: bool) {
    let Some(service) = app.try_state::<Service>() else {
        return;
    };
    let shown = {
        let mut hint = service.hint();
        let shown = hint.shown();
        hint.dismissed();
        shown
    };
    hide(app);
    log::info!("gợi ý bật dịch: người dùng bỏ qua (không hỏi lại: {ignore_app})");
    let Some(hinted) = shown.filter(|_| ignore_app) else {
        return;
    };
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let mut ignored = state.settings().meeting_hint.ignored_apps;
    if ignored.contains(&hinted) {
        return;
    }
    ignored.push(hinted);
    if let Err(e) = actions::update_settings(app, &json!({ "meetingHint": { "ignoredApps": ignored } })) {
        log::warn!("không lưu được \"không hỏi lại\" cho gợi ý bật dịch: {e:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::migrate::FileMeta;
    use crate::state::Loading;

    fn settings() -> Settings {
        Settings::defaults(UiLanguage::Vi)
    }

    fn status() -> AppStatus {
        AppState::new(settings(), FileMeta::current(), false).status()
    }

    #[test]
    fn idle_only_when_nothing_is_translating_or_loading() {
        let mut st = status();
        assert!(idle(&settings(), &st));
        st.session = SessionStatus::Error;
        assert!(idle(&settings(), &st), "phiên vừa lỗi thì rảnh");
        for busy in [SessionStatus::Starting, SessionStatus::Running] {
            st.session = busy;
            assert!(!idle(&settings(), &st));
        }
        st.session = SessionStatus::Idle;
        st.loading = Some(Loading::Model);
        assert!(!idle(&settings(), &st), "đang nạp model thì không rảnh");
    }

    #[test]
    fn microphone_only_mode_is_never_idle_for_hints() {
        let mut s = settings();
        s.capture_mode = CaptureMode::Mic;
        assert!(!idle(&s, &status()));
        s.capture_mode = CaptureMode::Both;
        assert!(idle(&s, &status()));
    }

    #[test]
    fn the_hint_is_on_by_default_with_no_ignored_apps() {
        let s = settings();
        assert!(s.meeting_hint.enabled);
        assert!(s.meeting_hint.ignored_apps.is_empty());
    }
}
