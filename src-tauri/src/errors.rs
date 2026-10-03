//! Lỗi trả về giao diện qua lệnh `invoke`. `code` là khóa để giao diện chọn câu báo lỗi
//! (`error.<code>` trong `src/i18n/en.ts`); test bên dưới kiểm mọi mã đều có câu báo lỗi.

use serde::Serialize;

use crate::hotkeys::{HotkeyAction, HotkeyError};
use crate::settings::Invalid;

/// Lỗi trả về giao diện. `code` là khóa để giao diện chọn câu báo lỗi (`error.<code>` trong i18n).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub field: Option<String>,
    /// Chi tiết cho log và cho người hỗ trợ; không hiện nguyên văn trên giao diện.
    pub message: String,
}

// Các hằng dưới đây là các mã lỗi ngoài lỗi cài đặt (`settings::Reason`) và lỗi phím tắt (`CommandError::hotkey`):
// năm mã chung của app, rồi các mã của phiên dịch (kế hoạch 02).

/// Không bật, tắt hay đọc được trạng thái khởi động cùng hệ thống.
pub const AUTOSTART_FAILED: &str = "autostartFailed";
/// Windows: tắt rồi mà vẫn còn mục khởi động ở `HKLM`, app không có quyền xóa (QĐ16).
pub const AUTOSTART_STILL_ENABLED: &str = "autostartStillEnabled";
/// Không ẩn, hiện hay khóa được thanh phụ đề.
pub const OVERLAY_FAILED: &str = "overlayFailed";
/// Không mở được thư mục, trang cài đặt của hệ thống hay link ngoài (`system::SystemOpener`).
pub const OPEN_FAILED: &str = "openFailed";
/// Việc không có trên hệ điều hành này.
pub const UNSUPPORTED: &str = "unsupported";

// Mã lỗi của phiên dịch (kế hoạch 02, spec §9).
/// Thiếu tiến trình phụ trong bản cài (bản dev: chưa chạy `scripts/copy-sidecars.sh`).
pub const SIDECAR_MISSING: &str = "sidecarMissing";
/// Tiến trình phụ hay thư viện đi kèm khác bản build sẵn (§10.2).
pub const SIDECAR_TAMPERED: &str = "sidecarTampered";
/// Tiến trình phụ không khởi động được, hoặc lỗi quá 5 lần trong 10 phút.
pub const SIDECAR_FAILED: &str = "sidecarFailed";
/// Thiếu file model (kế hoạch 04 tải về).
pub const MODEL_MISSING: &str = "modelMissing";
/// macOS: tạo tap lỗi, thường là chưa cấp quyền "Ghi âm thanh hệ thống".
pub const AUDIO_PERMISSION: &str = "audioPermission";
/// Không mở được nguồn âm thanh.
pub const CAPTURE_FAILED: &str = "captureFailed";
/// macOS, tap một app: app đó không phát âm thanh.
pub const APP_NOT_PLAYING: &str = "appNotPlaying";
/// Model không nạp được, kể cả bằng CPU: model hỏng (§9: đề nghị tải lại, kế hoạch 04).
pub const MODEL_BROKEN: &str = "modelBroken";
/// Không nạp được VAD.
pub const VAD_FAILED: &str = "vadFailed";
/// Chạm hạn mức (§6.8): phiên dừng với lý do `quota_exhausted`. Kế hoạch 06 thêm thời điểm reset và nút nâng gói.
pub const QUOTA_EXHAUSTED: &str = "quotaExhausted";
// Mã lỗi của kế hoạch 03.
/// Tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) khi đang ở gói Free (`pro::require`).
pub const PRO_REQUIRED: &str = "proRequired";
/// Không mở được DB của lịch sử và từ điển (kho khóa bị từ chối, file lỗi, file của bản app mới hơn).
pub const DATA_UNAVAILABLE: &str = "dataUnavailable";
/// Không đọc hay ghi được file người dùng đã chọn (`files.rs`).
pub const FILE_FAILED: &str = "fileFailed";
/// File chọn để nhập lớn quá giới hạn (`files::MAX_IMPORT_BYTES`).
pub const FILE_TOO_LARGE: &str = "fileTooLarge";
/// Lỗi bên trong app không thuộc loại nào ở trên (ví dụ một tác vụ nền dừng bất thường).
pub const UNKNOWN: &str = "unknown";

// Mã lỗi của tự cập nhật (kế hoạch 07b, spec §6.11).
/// Khởi động lại để cập nhật khi chưa có bản nào tải xong.
pub const UPDATE_NOT_READY: &str = "updateNotReady";
/// Khởi động lại để cập nhật khi đang dịch hay đang tải model: dừng việc đó trước.
pub const UPDATE_BUSY: &str = "updateBusy";

// Mã lỗi của quản lý model (kế hoạch 04, spec §6.7, §9).
/// Bản này chưa có URL manifest (bản dev chưa cấu hình staging; bản phát hành chờ kế hoạch 07).
pub const MODELS_NO_SOURCE: &str = "modelsNoSource";
/// Không tải được manifest (mất mạng, server lỗi).
pub const MODELS_OFFLINE: &str = "modelsOffline";
/// Manifest sai chữ ký, sai định dạng, hay cũ hơn bản đã có.
pub const MODELS_MANIFEST_INVALID: &str = "modelsManifestInvalid";
pub const MODELS_UNKNOWN_PACK: &str = "modelsUnknownPack";
/// Gói cần app bản mới hơn (`min_app_version`).
pub const MODELS_APP_TOO_OLD: &str = "modelsAppTooOld";
/// Không đủ dung lượng trống: phần còn phải tải cộng 1 GB (§6.7).
pub const MODELS_NO_SPACE: &str = "modelsNoSpace";
/// Đang tải model, hay đang cập nhật model của gói đang dùng.
pub const MODELS_BUSY: &str = "modelsBusy";
/// Đang dịch bằng gói này: dừng dịch trước khi cập nhật hay xóa nó.
pub const MODELS_IN_USE: &str = "modelsInUse";
/// Tải model không xong sau 3 lần thử lại (§9); phần đã tải được giữ để tải tiếp.
pub const MODELS_DOWNLOAD_FAILED: &str = "modelsDownloadFailed";
/// File tải về sai SHA-256 sau 3 lần thử lại (§9).
pub const MODELS_CHECKSUM: &str = "modelsChecksum";
/// Không ghi hay xóa được file trong thư mục model.
pub const MODELS_DISK: &str = "modelsDisk";
/// Máy chưa được hỗ trợ (§8: RAM dưới mức tối thiểu, CPU x64 không có AVX2): không cho tải model. `field` là lý do.
pub const MODELS_UNSUPPORTED: &str = "modelsUnsupported";

impl CommandError {
    pub fn new(code: &str, field: Option<&str>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            field: field.map(Into::into),
            message: message.into(),
        }
    }

    pub fn hotkey(action: HotkeyAction, error: HotkeyError) -> Self {
        let code = match error {
            HotkeyError::Invalid => "hotkeyInvalid",
            HotkeyError::NoModifier => "hotkeyNoModifier",
            HotkeyError::Duplicate => "hotkeyDuplicate",
            HotkeyError::RegisterFailed => "hotkeyRegisterFailed",
        };
        Self::new(code, Some(action.key()), error.to_string())
    }
}

impl From<Invalid> for CommandError {
    fn from(e: Invalid) -> Self {
        let code = serde_json::to_value(e.reason)
            .ok()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default();
        Self {
            code,
            field: Some(e.field.clone()),
            message: e.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Reason;

    /// Mọi mã lỗi phía Rust có câu báo lỗi trong từ điển chuẩn của giao diện (`src/i18n/en.ts`).
    #[test]
    fn every_error_code_has_ui_text() {
        let en = include_str!("../../src/i18n/en.ts");
        let reasons = [
            Reason::OutOfRange,
            Reason::Empty,
            Reason::Duplicate,
            Reason::TooLong,
            Reason::InvalidHotkey,
            Reason::WrongType,
            Reason::UnknownKey,
            Reason::ReadOnly,
            Reason::NotObject,
        ];
        // Không dùng `_`: thêm biến thể mà quên liệt kê ở trên thì không biên dịch được.
        for reason in reasons {
            match reason {
                Reason::OutOfRange
                | Reason::Empty
                | Reason::Duplicate
                | Reason::TooLong
                | Reason::InvalidHotkey
                | Reason::WrongType
                | Reason::UnknownKey
                | Reason::ReadOnly
                | Reason::NotObject => {}
            }
        }
        let mut codes: Vec<String> = reasons
            .iter()
            .map(|r| CommandError::from(Invalid::new("x", *r)).code)
            .collect();
        for error in [
            HotkeyError::Invalid,
            HotkeyError::NoModifier,
            HotkeyError::Duplicate,
            HotkeyError::RegisterFailed,
        ] {
            match error {
                HotkeyError::Invalid
                | HotkeyError::NoModifier
                | HotkeyError::Duplicate
                | HotkeyError::RegisterFailed => {}
            }
            codes.push(CommandError::hotkey(HotkeyAction::ToggleLock, error).code);
        }
        codes.extend(
            [
                AUTOSTART_FAILED,
                AUTOSTART_STILL_ENABLED,
                OVERLAY_FAILED,
                OPEN_FAILED,
                UNSUPPORTED,
                SIDECAR_MISSING,
                SIDECAR_TAMPERED,
                SIDECAR_FAILED,
                MODEL_MISSING,
                MODEL_BROKEN,
                AUDIO_PERMISSION,
                CAPTURE_FAILED,
                APP_NOT_PLAYING,
                VAD_FAILED,
                QUOTA_EXHAUSTED,
                PRO_REQUIRED,
                DATA_UNAVAILABLE,
                FILE_FAILED,
                FILE_TOO_LARGE,
                UNKNOWN,
                MODELS_NO_SOURCE,
                MODELS_OFFLINE,
                MODELS_MANIFEST_INVALID,
                MODELS_UNKNOWN_PACK,
                MODELS_APP_TOO_OLD,
                MODELS_NO_SPACE,
                MODELS_BUSY,
                MODELS_IN_USE,
                MODELS_DOWNLOAD_FAILED,
                MODELS_CHECKSUM,
                MODELS_DISK,
                MODELS_UNSUPPORTED,
            ]
            .map(String::from),
        );
        codes.extend(crate::glossary::ERROR_CODES.iter().map(|c| c.to_string()));
        codes.push(crate::transcript::history::NOT_FOUND.to_string());
        codes.extend(crate::license::manager::ERROR_CODES.iter().map(|c| c.to_string()));
        for code in codes {
            assert!(
                en.contains(&format!("\"error.{code}\":")),
                "src/i18n/en.ts thiếu error.{code}"
            );
        }
    }

    #[test]
    fn invalid_setting_maps_to_reason_code_and_field() {
        let e = CommandError::from(Invalid::new("overlay.lines", Reason::OutOfRange));
        assert_eq!(
            (e.code.as_str(), e.field.as_deref()),
            ("outOfRange", Some("overlay.lines"))
        );
        let e = CommandError::hotkey(HotkeyAction::ToggleOverlay, HotkeyError::Duplicate);
        assert_eq!(
            (e.code.as_str(), e.field.as_deref()),
            ("hotkeyDuplicate", Some("toggleOverlay"))
        );
    }
}
