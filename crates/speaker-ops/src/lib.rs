//! Vận hành của "Phân biệt người nói" (spec 2026-10-26-phan-biet-nguoi-noi §7). Chỉ phần thuần, không mạng:
//!
//! - [`envelope`]: phong bì ký của công thức đọc tên (`format` và tiền tố ký riêng, tách khỏi manifest model);
//! - [`recipes`]: nhận hay từ chối một công thức tải về (chống quay lui, `min_app_version`), lưu trên máy;
//! - [`health`]: gom trạng thái bộ đọc thành báo cáo tình trạng, không có tên người;
//! - [`canary`]: chấm một lượt kiểm tra tự động (tên đọc được so với lịch nói đã biết).

#![forbid(unsafe_code)]

pub mod canary;
pub mod envelope;
pub mod health;
pub mod recipes;
