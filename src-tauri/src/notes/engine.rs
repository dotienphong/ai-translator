//! Giao diện giữa việc dựng ghi chú (`job`) và nơi chạy model (local hay cloud). `job` chỉ biết trait này.

use std::sync::atomic::AtomicBool;

use crate::errors;

/// Vai của một tin nhắn trong lượt hội thoại gửi model.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    User,
    Assistant,
}

/// Một tin nhắn.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Message {
    pub role: Role,
    pub content: String,
}

/// Một yêu cầu sinh chữ: các tin nhắn theo thứ tự và số token tối đa của câu trả lời.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NotesRequest {
    pub messages: Vec<Message>,
    pub max_tokens: u32,
    /// Dạng câu trả lời mong đợi. Cloud không đọc; engine local chọn khuôn đầu ra theo nó.
    pub format: Format,
}

/// Dạng câu trả lời của một yêu cầu: ghi chú đủ bốn phần, riêng bản tóm tắt (`{"summary": …}`), hay kết luận kiểm một việc
/// cần làm (`{"items": [{"n", "keep", "owner", "due"}]}`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Format {
    Notes,
    Summary,
    Verdict,
}

/// Cách `job::run` dựng ghi chú: `Standard` là map rồi reduce bằng model (cloud); `Verified` là map chặt, gộp cơ học,
/// reduce chỉ để tóm tắt và kiểm từng việc cần làm (model local).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Strategy {
    Standard,
    Verified,
}

/// Giới hạn của engine: `budget` là ngân sách token cho phần chữ của một đoạn map (và của một nhóm reduce),
/// `max_map` và `max_reduce` là `max_tokens` của câu trả lời ở hai giai đoạn.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    pub budget: usize,
    pub max_map: u32,
    pub max_reduce: u32,
}

/// Lỗi khi engine sinh chữ. Mã lỗi gửi giao diện: `NotesError::code()`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NotesError {
    /// Chưa có khóa API (cloud).
    KeyMissing,
    /// Không có mạng hay không nối được máy chủ.
    Offline,
    /// Khóa bị từ chối.
    AuthFailed,
    /// Bị giới hạn tốc độ.
    RateLimited,
    /// Tài khoản nhà cung cấp hết số dư (HTTP 402).
    NoBalance,
    /// Máy chủ cloud trả mã HTTP lỗi.
    Cloud(u16),
    /// Phản hồi của engine không đọc được.
    BadResponse,
    /// Người dùng hủy.
    Cancelled,
    /// File model ghi chú trên máy băm ra khác SHA-256 của manifest (hỏng hay bị thay): bỏ gói, tải lại.
    ModelCorrupt,
    /// Lỗi khác của engine (model local), kèm mô tả.
    Engine(String),
}

impl NotesError {
    /// Mã lỗi gửi giao diện (`error.<mã>` trong i18n). Không phụ thuộc phần kèm theo của `Cloud(_)` và `Engine(_)`
    /// (mã HTTP, mô tả chỉ để ghi log).
    pub fn code(&self) -> &'static str {
        match self {
            Self::KeyMissing => errors::NOTES_KEY_MISSING,
            Self::Offline => errors::NOTES_OFFLINE,
            Self::AuthFailed => errors::NOTES_AUTH_FAILED,
            Self::RateLimited => errors::NOTES_RATE_LIMITED,
            Self::NoBalance => errors::NOTES_NO_BALANCE,
            Self::Cloud(_) | Self::BadResponse => errors::NOTES_CLOUD_FAILED,
            Self::Cancelled => errors::NOTES_CANCELLED,
            Self::ModelCorrupt => errors::NOTES_LOCAL_PACK_MISSING,
            Self::Engine(_) => errors::NOTES_ENGINE_FAILED,
        }
    }
}

/// Nơi sinh chữ cho ghi chú. `generate` chặn tới khi xong; engine nên dừng sớm và trả `Cancelled` khi `cancel` bật.
pub trait NotesEngine: Send {
    fn limits(&self) -> Limits;
    fn count_tokens(&self, text: &str) -> usize;
    fn generate(&self, req: &NotesRequest, cancel: &AtomicBool) -> Result<String, NotesError>;
    /// Cách dựng ghi chú hợp với engine này; mặc định (cloud) là `Standard`.
    fn strategy(&self) -> Strategy {
        Strategy::Standard
    }
    /// Cách dừng ngay engine từ luồng khác, kể cả khi `generate` đang chặn (engine chạy tiến trình riêng: kill nó). Cloud không
    /// có (`None`): hủy qua cờ `cancel` là đủ.
    fn interrupter(&self) -> Option<Interrupt> {
        None
    }
}

/// Dừng ngay một engine từ luồng khác ([`NotesEngine::interrupter`]).
pub type Interrupt = std::sync::Arc<dyn Fn() + Send + Sync>;

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::errors;

    #[test]
    fn every_variant_has_its_ui_code() {
        let table = [
            (NotesError::KeyMissing, errors::NOTES_KEY_MISSING, "notesKeyMissing"),
            (NotesError::Offline, errors::NOTES_OFFLINE, "notesOffline"),
            (NotesError::AuthFailed, errors::NOTES_AUTH_FAILED, "notesAuthFailed"),
            (NotesError::RateLimited, errors::NOTES_RATE_LIMITED, "notesRateLimited"),
            (NotesError::NoBalance, errors::NOTES_NO_BALANCE, "notesNoBalance"),
            (NotesError::Cloud(500), errors::NOTES_CLOUD_FAILED, "notesCloudFailed"),
            (NotesError::BadResponse, errors::NOTES_CLOUD_FAILED, "notesCloudFailed"),
            (NotesError::Cancelled, errors::NOTES_CANCELLED, "notesCancelled"),
            (
                NotesError::Engine("x".into()),
                errors::NOTES_ENGINE_FAILED,
                "notesEngineFailed",
            ),
            (
                NotesError::ModelCorrupt,
                errors::NOTES_LOCAL_PACK_MISSING,
                "notesLocalPackMissing",
            ),
        ];
        for (error, constant, literal) in table {
            // Không dùng `_`: thêm biến thể mà quên ở đây thì không biên dịch được.
            match error {
                NotesError::KeyMissing
                | NotesError::Offline
                | NotesError::AuthFailed
                | NotesError::RateLimited
                | NotesError::NoBalance
                | NotesError::Cloud(_)
                | NotesError::BadResponse
                | NotesError::Cancelled
                | NotesError::ModelCorrupt
                | NotesError::Engine(_) => {}
            }
            assert_eq!(error.code(), constant, "{error:?}");
            assert_eq!(error.code(), literal, "{error:?}");
        }
    }

    #[test]
    fn code_ignores_the_payload() {
        assert_eq!(NotesError::Cloud(401).code(), NotesError::Cloud(503).code());
        assert_eq!(
            NotesError::Engine("a".into()).code(),
            NotesError::Engine("b khác".into()).code()
        );
    }
}
