//! Trạng thái dùng chung của app, quản lý bằng `tauri::Manager::manage`.

use std::sync::Mutex;

use serde::Serialize;

use pipeline::engine::Indicators;

use crate::hotkeys::HotkeyAction;
use crate::settings::migrate::FileMeta;
use crate::settings::{BackgroundColor, Settings, TextColor, UiLanguage};

/// Trạng thái phiên dịch (§4.3: Sẵn sàng, Đang dịch, Lỗi).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Idle,
    /// Đang chạy tiến trình phụ và mở nguồn âm thanh ("Đang nạp model…").
    Starting,
    Running,
    /// Phiên vừa dừng vì lỗi; mã lỗi ở `AppStatus::session_error`.
    Error,
}

/// Đang chờ tiến trình phụ (§4.2, §6.5).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Loading {
    /// "Đang nạp model…"
    Model,
    /// Lần đầu chạy binary mới: "Đang chuẩn bị lần đầu".
    FirstRun,
}

/// Trạng thái lúc chạy, không lưu xuống đĩa. Cửa sổ chính nhận qua sự kiện `app://status`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub session: SessionStatus,
    pub overlay_visible: bool,
    /// Phím tắt không đăng ký được với hệ điều hành, theo thứ tự của `HotkeyAction::ALL`.
    pub hotkey_failures: Vec<HotkeyAction>,
    pub loading: Option<Loading>,
    /// Mã lỗi của phiên (`error.<mã>` trong i18n) khi `session` là `error`.
    pub session_error: Option<String>,
    /// "Đang chạy bằng CPU (chậm hơn)" (§9).
    pub cpu_fallback: bool,
    /// Tiến trình phụ báo hết bộ nhớ: đề xuất gói Nhẹ (§9).
    pub suggest_lite: bool,
    /// Đang trễ, không có âm thanh, dịch không dùng được (§4.4, §9).
    pub indicators: Indicators,
    /// macOS: nguồn âm thanh trả toàn im lặng tuyệt đối trong khi có app đang phát: nghi chưa được cấp quyền ghi âm thanh
    /// hệ thống (§9). Phiên vẫn chạy; giao diện hiện `error.audioPermission` kèm nút mở System Settings.
    pub permission_suspected: bool,
    /// macOS, nguồn một app: app đã chọn không phát tiếng nữa (đã đóng); phiên vẫn chạy và thử thu lại mỗi 2 giây
    /// (Q-C của review 02 lần 2). Giao diện hiện chỉ báo.
    pub waiting_for_app: bool,
    /// Đang có gói trả phí còn hạn (spec §2 "Pro"): giao diện mở hay khóa tính năng Pro. Đặt bởi `pro::refresh`.
    pub pro: bool,
    /// Hạn mức còn từ 5 phút trở xuống (§4.2 bước 2): thanh phụ đề và cửa sổ chính nhắc. Đặt bởi `license::app::refresh`.
    pub quota_warning: bool,
    /// Thời điểm hạn mức được reset (giây Unix), để báo khi hết hạn mức; `None` khi không giới hạn.
    pub quota_reset_at: Option<i64>,
    /// Phiên bản app mới đã tải xong, sẽ cài ở lần thoát kế tiếp (§6.11; kế hoạch 07b). Khi app rảnh, cửa sổ chính và menu
    /// khay mời khởi động lại để cập nhật. Đặt bởi `updater::publish`.
    pub update_ready: Option<String>,
    /// Tăng mỗi lần trạng thái đổi. Giao diện bỏ trạng thái có `rev` nhỏ hơn trạng thái đã có (kết quả của một lệnh có thể
    /// tới sau sự kiện `app://status` mới hơn).
    pub rev: u64,
}

/// Phần cài đặt mà thanh phụ đề cần. Cửa sổ `overlay` chỉ đọc được phần này (§10.2).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayView {
    pub ui_language: UiLanguage,
    pub font_size: u32,
    pub lines: u32,
    pub opacity: f64,
    pub text_color: TextColor,
    pub background: BackgroundColor,
    pub show_source: bool,
    pub locked: bool,
}

impl OverlayView {
    pub fn from_settings(settings: &Settings) -> Self {
        let o = &settings.overlay;
        Self {
            ui_language: settings.ui_language,
            font_size: o.font_size,
            lines: o.lines,
            opacity: o.opacity,
            text_color: o.text_color,
            background: o.background,
            show_source: o.show_source,
            locked: o.locked,
        }
    }
}

/// Thông tin cho màn hình Giới thiệu và các bước chỉ có trên một hệ điều hành.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    /// `macos` hoặc `windows`.
    pub platform: &'static str,
    /// App được hệ điều hành mở lúc đăng nhập (Đ19): chỉ nằm ở khay, chưa chạy tiến trình phụ.
    pub launched_at_login: bool,
}

pub struct AppState {
    settings: Mutex<Settings>,
    /// Thông tin về file cài đặt lúc đọc (phiên bản schema, giá trị thô của bản mới hơn).
    file_meta: FileMeta,
    status: Mutex<AppStatus>,
    launched_at_login: bool,
}

impl AppState {
    pub fn new(settings: Settings, file_meta: FileMeta, launched_at_login: bool) -> Self {
        Self {
            settings: Mutex::new(settings),
            file_meta,
            status: Mutex::new(AppStatus {
                session: SessionStatus::Idle,
                // Thanh phụ đề ẩn lúc khởi động, kể cả khi mở lúc đăng nhập; hiện khi bắt đầu phiên (§4.2, Đ19).
                overlay_visible: false,
                hotkey_failures: Vec::new(),
                loading: None,
                session_error: None,
                cpu_fallback: false,
                suggest_lite: false,
                indicators: Indicators::default(),
                permission_suspected: false,
                waiting_for_app: false,
                pro: false,
                quota_warning: false,
                quota_reset_at: None,
                update_ready: None,
                rev: 0,
            }),
            launched_at_login,
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }

    /// Thay cài đặt, trả về bản cũ. `next.revision` được đặt bằng số của bản cũ cộng 1, dưới cùng khóa, nên số thứ tự
    /// tăng đúng theo thứ tự các lần thay.
    pub fn replace_settings(&self, next: &mut Settings) -> Settings {
        let mut current = self.settings.lock().unwrap();
        next.revision = current.revision + 1;
        std::mem::replace(&mut *current, next.clone())
    }

    pub fn file_meta(&self) -> &FileMeta {
        &self.file_meta
    }

    pub fn status(&self) -> AppStatus {
        self.status.lock().unwrap().clone()
    }

    /// Đổi trạng thái dưới khóa của nó (một lần đổi là nguyên khối), rồi tăng `rev`.
    pub fn update_status<T>(&self, f: impl FnOnce(&mut AppStatus) -> T) -> T {
        let mut status = self.status.lock().unwrap();
        let out = f(&mut status);
        status.rev += 1;
        out
    }

    pub fn launched_at_login(&self) -> bool {
        self.launched_at_login
    }
}
