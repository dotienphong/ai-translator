//! Log của app (Đ10 của kế hoạch 00): ghi ra file trên máy, xoay vòng, không gửi đi đâu (§10.1).
//!
//! - macOS: `~/Library/Logs/<bundle-id>/app.log`; Windows: `%LOCALAPPDATA%\<bundle-id>\logs\app.log`.
//! - Mỗi file tối đa 1 MB, giữ 5 file cũ.
//! - Log không bao giờ chứa âm thanh, nội dung chép lời, license key đầy đủ, token hay khóa API (§10.2).
//! - Giao diện không ghi được log (capabilities không cấp `log:*`).

use tauri::Runtime;
use tauri::plugin::TauriPlugin;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

pub const MAX_FILE_BYTES: u128 = 1_000_000;
pub const KEEP_FILES: usize = 5;

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    let level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir {
            file_name: Some("app".into()),
        }))
        .target(Target::new(TargetKind::Stdout))
        .level(level)
        // Thư viện cửa sổ và webview ghi rất nhiều ở mức debug.
        .level_for("tao", log::LevelFilter::Warn)
        .level_for("wry", log::LevelFilter::Warn)
        .max_file_size(MAX_FILE_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(KEEP_FILES))
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build()
}
