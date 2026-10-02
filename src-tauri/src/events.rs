//! Sự kiện gửi sang giao diện. Tên sự kiện phải khớp `src/lib/ipc.ts`.
//!
//! Lưu ý bảo mật: trong Tauri 2, sự kiện không phải ranh giới quyền. Một listener JS đăng ký với
//! đích `Any` nhận cả sự kiện gửi riêng cho cửa sổ khác. Vì vậy không gửi bí mật nào qua sự kiện
//! (kế hoạch 06: không gửi token hay license key đầy đủ); `emit_to` chỉ để giảm việc thừa.

use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Runtime};

use crate::overlay;
use crate::settings::Settings;
use crate::state::{AppStatus, OverlayView};
use crate::window;

pub const SETTINGS_CHANGED: &str = "settings://changed";
pub const STATUS_CHANGED: &str = "app://status";
pub const NAVIGATE: &str = "app://navigate";
pub const NOTICE: &str = "app://notice";
pub const OVERLAY_VIEW: &str = "overlay://view";
/// Phụ đề (spec §6.6): cả đối tượng (`pipeline::subtitle::Subtitle`).
pub const SUBTITLE_UPSERT: &str = "subtitle://upsert";
/// Phần chữ dịch mới trong lúc đang dịch (`pipeline::subtitle::Delta`).
pub const SUBTITLE_DELTA: &str = "subtitle://delta";
/// Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch.
pub const AUDIO_LEVEL: &str = "audio://level";

/// Yêu cầu cửa sổ chính mở một màn hình, ví dụ khi bấm dòng báo lỗi phím tắt ở menu khay.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Navigate {
    pub screen: &'static str,
    pub settings_group: Option<&'static str>,
}

/// Lời nhắc trong app (QĐ12), hiện ở thanh báo của cửa sổ chính. Giao diện dịch `kind` thành câu.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Notice {
    /// macOS: app vừa bỏ qua `⌘Q` hay Quit ở Dock; muốn thoát thì dùng menu khay.
    QuitFromTray,
    /// macOS: vừa bật khởi động cùng hệ thống, nhưng mục của app đang bị tắt ở Login Items; giao diện
    /// có nút mở System Settings (lệnh `open_login_items_settings`).
    LoginItemsApproval,
}

pub fn settings_changed<R: Runtime>(app: &AppHandle<R>, settings: &Settings) {
    emit(app, window::MAIN, SETTINGS_CHANGED, settings);
}

/// Gửi cho cả thanh phụ đề: nó cần biết đang nạp model, đang trễ, không có âm thanh (§4.4; kế hoạch 03 hiển thị).
pub fn status_changed<R: Runtime>(app: &AppHandle<R>, status: &AppStatus) {
    emit(app, window::MAIN, STATUS_CHANGED, status);
    emit(app, overlay::LABEL, STATUS_CHANGED, status);
}

pub fn overlay_view<R: Runtime>(app: &AppHandle<R>, view: &OverlayView) {
    emit(app, overlay::LABEL, OVERLAY_VIEW, view);
}

pub fn navigate<R: Runtime>(app: &AppHandle<R>, target: Navigate) {
    emit(app, window::MAIN, NAVIGATE, target);
}

pub fn notice<R: Runtime>(app: &AppHandle<R>, notice: Notice) {
    emit(app, window::MAIN, NOTICE, notice);
}

fn emit<R: Runtime, S: Serialize + Clone>(app: &AppHandle<R>, label: &str, event: &str, payload: S) {
    if let Err(e) = app.emit_to(EventTarget::webview_window(label), event, payload) {
        log::warn!("không gửi được sự kiện {event}: {e}");
    }
}
