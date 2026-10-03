//! Tự cập nhật app (F9, spec §6.11; kế hoạch 07b) bằng `tauri-plugin-updater`.
//!
//! - `source`: URL gốc và khóa công khai của bản build này; thiếu một trong hai thì tắt tự cập nhật.
//! - Plugin chỉ dùng từ Rust: không cửa sổ nào được cấp lệnh của plugin (`acl_tests`).
//! - `requireSignedVersion` bật trong `tauri.conf.json`: chữ ký phải gắn đúng phiên bản mà manifest báo, để manifest
//!   bị sửa không ghép được số phiên bản mới với bộ cài cũ.

pub mod source;

use tauri::Runtime;
use tauri::plugin::TauriPlugin;

/// Plugin với khóa công khai của bản build này (chuỗi rỗng khi chưa có khóa; khi đó app không bao giờ gọi plugin).
pub fn plugin<R: Runtime>() -> TauriPlugin<R, tauri_plugin_updater::Config> {
    let pubkey = source::for_this_build().map(|s| s.pubkey).unwrap_or_default();
    tauri_plugin_updater::Builder::new().pubkey(pubkey).build()
}
