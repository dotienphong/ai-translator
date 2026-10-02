//! Quản lý model (spec F6, §6.7, kế hoạch 04): manifest ký Ed25519, tải tiếp được khi rớt mạng, kiểm SHA-256, đề
//! xuất gói theo máy, xóa model.

pub mod download;
pub mod manifest;
pub mod signed;
pub mod store;
#[cfg(test)]
pub mod test_http;
