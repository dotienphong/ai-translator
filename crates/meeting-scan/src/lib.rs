//! Nhận biết cuộc họp (spec 2026-11-01-goi-y-bat-dich-khi-hop; nhận giọng người nói §6.1).
//!
//! - [`winscan`]: tìm cửa sổ họp trên Windows. Chuyển từ `speaker-worker` để app chính dùng được mà không kéo theo candle.
//! - [`hint`]: máy trạng thái gợi ý bật dịch (khi nào hiện, hỏi một lần mỗi cuộc họp, tự đóng).
//! - [`is_meeting_window`]: cửa sổ có phải cửa sổ họp của app không, theo công thức đã ký.

// Bản release đặt `panic = "abort"`: một lần panic ở luồng gợi ý làm sập cả app. Cấm các cách panic quen thuộc ở mã không phải test.
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

pub mod hint;
pub mod probe;
pub mod procmap;
#[cfg(windows)]
pub mod win;
pub mod winscan;

use speaker_recipe::AppRecipe;

/// Cửa sổ có phải cửa sổ họp của app không (spec §6.1): id khớp `window_id`, tiêu đề khớp một mẫu, hay (macOS) AXSubrole khớp một
/// mẫu `window_subrole` (cuộc họp có tên tự đặt: tiêu đề cửa sổ là tên cuộc họp). Luật vai trò phụ chỉ cho cửa sổ ứng viên; bộ đọc
/// vẫn chỉ lấy tên khi thấy phần tử `confirm_id` trong cửa sổ (`Walk::step`). Windows truyền `subrole` rỗng.
pub fn is_meeting_window(app: &AppRecipe, title: &str, ident: &str, subrole: &str) -> bool {
    app.window_id.as_ref().is_some_and(|re| re.is_match(ident))
        || app.window_title.iter().any(|re| re.is_match(title))
        || (!subrole.is_empty() && app.window_subrole.iter().any(|re| re.is_match(subrole)))
}
