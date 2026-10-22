//! Chat hỗ trợ trong app (spec 2026-10-22-chat-ho-tro-zalo-design.md §4; kế hoạch chat-ho-tro-03). Khách nhắn ở màn hình Hỗ trợ,
//! tin tới Zalo của chủ dự án qua license server (`api.`); câu trả lời về bằng cách hỏi tin mới định kỳ. Dùng được với mọi người
//! dùng, kể cả Free và chưa có license.
//!
//! - [`api`]: gọi `/v1/support/*` (production, không theo redirect, lỗi không kèm URL hay token);
//! - [`store`]: `support.json` (token, con trỏ, đang chờ trả lời, chấm đỏ);
//! - [`cadence`]: luật nhịp hỏi tin (hàm thuần); [`chat`]: lõi, không phụ thuộc Tauri;
//! - [`context`]: dòng thông tin máy gửi kèm tin đầu tiên (không bao giờ có key, email, mã máy, tên máy, tên người dùng);
//! - file này: phần ghép với app (trạng thái quản lý bằng `app.manage`, luồng hỏi nền, sự kiện `support://view`, việc của các
//!   lệnh `support_*`).

pub mod api;
pub mod cadence;
pub mod store;
