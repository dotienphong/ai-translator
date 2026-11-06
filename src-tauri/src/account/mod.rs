//! Tài khoản Google của người dùng (spec 2026-11-05 "Đăng nhập Google"): app chỉ giữ token tài khoản do license server
//! ký và địa chỉ email để hiện trên giao diện; trình duyệt hệ thống mới nói chuyện với Google.
//!
//! - [`flow`]: [`flow::AccountService`], luồng đăng nhập (mở trang Google, hỏi kết quả, lưu token), đăng xuất, xóa tài
//!   khoản; cài [`crate::license::manager::AccountHook`] cho cổng đăng nhập của `License`.
//! - [`client`]: client HTTP của các route `/v1/auth/*` và `/v1/account/*` (đăng nhập, gắn license, xóa tài khoản), dựng trên
//!   `HttpApi` của license server.
//! - [`token`]: token tài khoản `v1` (`typ: "account"`), kiểm offline bằng khóa công khai build sẵn, cùng định dạng và
//!   khóa với token bản quyền ([`crate::license::token`]).
//!
//! Bản release đặt `panic = "abort"`: một lần panic là sập cả app. Mã ở đây cấm `unwrap`, `expect`, `panic!` và chỉ mục
//! mảng (lint `clippy`); lỗi kho khóa, lỗi mạng hay token hỏng chỉ thành trạng thái chưa đăng nhập kèm mã lỗi.

#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::indexing_slicing)]

pub mod client;
pub mod flow;
pub mod token;

pub use flow::{AccountError, AccountService, AccountState, AccountView, LinkOutcome, Timing, is_google_login_url};
