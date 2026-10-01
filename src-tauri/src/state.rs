//! Trạng thái dùng chung của app, quản lý bằng `tauri::Manager::manage`.

use std::sync::Mutex;

use serde::Serialize;

use crate::hotkeys::HotkeyAction;
use crate::settings::migrate::FileMeta;
use crate::settings::{Settings, UiLanguage};

/// Trạng thái phiên dịch. Kế hoạch 02 thêm trạng thái (đang nạp model, lỗi…) khi nối pipeline.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Idle,
    Running,
}

/// Trạng thái lúc chạy, không lưu xuống đĩa. Cửa sổ chính nhận qua sự kiện `app://status`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub session: SessionStatus,
    pub overlay_visible: bool,
    /// Phím tắt không đăng ký được với hệ điều hành, theo thứ tự của `HotkeyAction::ALL`.
    pub hotkey_failures: Vec<HotkeyAction>,
}

/// Phần cài đặt mà thanh phụ đề cần. Cửa sổ `overlay` chỉ đọc được phần này (§10.2).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayView {
    pub ui_language: UiLanguage,
    pub font_size: u32,
    pub lines: u32,
    pub opacity: f64,
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
            }),
            launched_at_login,
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }

    /// Thay cài đặt, trả về bản cũ.
    pub fn replace_settings(&self, next: Settings) -> Settings {
        std::mem::replace(&mut *self.settings.lock().unwrap(), next)
    }

    pub fn file_meta(&self) -> &FileMeta {
        &self.file_meta
    }

    pub fn status(&self) -> AppStatus {
        self.status.lock().unwrap().clone()
    }

    pub fn update_status<T>(&self, f: impl FnOnce(&mut AppStatus) -> T) -> T {
        f(&mut self.status.lock().unwrap())
    }

    pub fn launched_at_login(&self) -> bool {
        self.launched_at_login
    }
}
