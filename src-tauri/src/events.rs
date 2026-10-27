//! Sự kiện gửi sang giao diện. Tên sự kiện phải khớp `src/lib/ipc.ts`.
//!
//! Lưu ý bảo mật: trong Tauri 2, sự kiện không phải ranh giới quyền. Một listener JS đăng ký với
//! đích `Any` nhận cả sự kiện gửi riêng cho cửa sổ khác. Vì vậy không gửi bí mật nào qua sự kiện
//! (kế hoạch 06: không gửi token hay license key đầy đủ); `emit_to` chỉ để giảm việc thừa.

use pipeline::subtitle::{LiveEnd, LiveLine, Roster, SpeakerLabel};
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Runtime};

use crate::compose::{self, ComposeView, Delta, Done, Loading};
use crate::overlay;
use crate::settings::Settings;
use crate::state::{AppStatus, OverlayView};
use crate::support::chat::SupportView;
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
/// Dòng đang nói (spec 2026-10-10 §6.2, `pipeline::subtitle::LiveLine`). Chỉ gửi cho thanh phụ đề: cửa sổ chính, bản chép
/// lời, lịch sử và xuất file chỉ có bản cuối (QĐ5 của spec 2026-10-10).
pub const SUBTITLE_LIVE: &str = "subtitle://live";
/// Gỡ dòng đang nói (`pipeline::subtitle::LiveEnd`); chỉ gửi cho thanh phụ đề.
pub const SUBTITLE_LIVE_END: &str = "subtitle://live-end";
/// Giọng của một phụ đề đã phát vừa đổi (spec 2026-10-26-phan-biet-nguoi-noi §4.3, `pipeline::subtitle::SpeakerLabel`). Cửa sổ
/// chính và thanh phụ đề.
pub const SUBTITLE_SPEAKER: &str = "subtitle://speaker";
/// Bảng giọng của phiên (`pipeline::subtitle::Roster`). Cửa sổ chính và thanh phụ đề.
pub const SPEAKER_ROSTER: &str = "speaker://roster";
/// Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch.
pub const AUDIO_LEVEL: &str = "audio://level";
/// Phím tắt cuộn phụ đề lên hay xuống (§4.4); chỉ gửi cho thanh phụ đề. Nội dung là `"up"` hay `"down"`.
pub const OVERLAY_SCROLL: &str = "overlay://scroll";
/// Gõ dịch (spec 2026-10-17-go-dich §3.3), chỉ gửi cho cửa sổ `compose`: mở ô soạn kèm phần cài đặt của nó
/// (`compose::ComposeView`); yêu cầu đang chờ nạp model (`compose::Loading`); phần chữ dịch mới (`compose::Delta`); kết quả
/// (`compose::Done`).
pub const COMPOSE_OPEN: &str = "compose://open";
pub const COMPOSE_LOADING: &str = "compose://loading";
pub const COMPOSE_DELTA: &str = "compose://delta";
pub const COMPOSE_DONE: &str = "compose://done";
/// Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4), chỉ gửi cho cửa sổ chính: trạng thái mới sau lần hỏi tin nền
/// (`support::chat::SupportView`, không có token).
pub const SUPPORT_VIEW: &str = "support://view";

/// Hướng cuộn của phím tắt cuộn phụ đề. Tên khớp `ScrollDirection` ở `src/lib/overlayScroll.ts`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ScrollDirection {
    Up,
    Down,
}

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

/// Dòng đang nói: chỉ thanh phụ đề vẽ (QĐ5 của spec 2026-10-10).
pub fn subtitle_live<R: Runtime>(app: &AppHandle<R>, line: &LiveLine) {
    emit(app, overlay::LABEL, SUBTITLE_LIVE, line);
}

/// Gỡ dòng đang nói trên thanh phụ đề.
pub fn subtitle_live_end<R: Runtime>(app: &AppHandle<R>, end: &LiveEnd) {
    emit(app, overlay::LABEL, SUBTITLE_LIVE_END, end);
}

pub fn subtitle_speaker<R: Runtime>(app: &AppHandle<R>, label: &SpeakerLabel) {
    emit(app, window::MAIN, SUBTITLE_SPEAKER, label);
    emit(app, overlay::LABEL, SUBTITLE_SPEAKER, label);
}

pub fn speaker_roster<R: Runtime>(app: &AppHandle<R>, roster: &Roster) {
    emit(app, window::MAIN, SPEAKER_ROSTER, roster);
    emit(app, overlay::LABEL, SPEAKER_ROSTER, roster);
}

/// Báo thanh phụ đề cuộn một trang (§4.4). Thanh khóa vẫn nhận: sự kiện không đi qua chuột.
pub fn overlay_scroll<R: Runtime>(app: &AppHandle<R>, direction: ScrollDirection) {
    emit(app, overlay::LABEL, OVERLAY_SCROLL, direction);
}

pub fn compose_open<R: Runtime>(app: &AppHandle<R>, view: &ComposeView) {
    emit(app, compose::LABEL, COMPOSE_OPEN, view);
}

pub fn compose_loading<R: Runtime>(app: &AppHandle<R>, loading: &Loading) {
    emit(app, compose::LABEL, COMPOSE_LOADING, loading);
}

pub fn compose_delta<R: Runtime>(app: &AppHandle<R>, delta: &Delta) {
    emit(app, compose::LABEL, COMPOSE_DELTA, delta);
}

pub fn compose_done<R: Runtime>(app: &AppHandle<R>, done: &Done) {
    emit(app, compose::LABEL, COMPOSE_DONE, done);
}

pub fn support_view<R: Runtime>(app: &AppHandle<R>, view: &SupportView) {
    emit(app, window::MAIN, SUPPORT_VIEW, view);
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
