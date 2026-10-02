//! Bản quyền trong app (kế hoạch 06; spec §6.8, §10.2): token bản quyền, hạn mức, kích hoạt và mua gói.
//!
//! - [`token`]: token v1 ký Ed25519, kiểm offline bằng khóa công khai build sẵn ([`keys`]). Định dạng và thứ tự kiểm là
//!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.
//! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.

pub mod key;
pub mod keys;
pub mod token;
