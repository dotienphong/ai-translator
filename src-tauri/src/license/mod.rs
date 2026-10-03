//! Bản quyền trong app (kế hoạch 06; spec §6.8, §10.2): token bản quyền, hạn mức, kích hoạt và mua gói.
//!
//! - [`token`]: token v1 ký Ed25519, kiểm offline bằng khóa công khai build sẵn ([`keys`]). Định dạng và thứ tự kiểm là
//!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.
//! - [`app`]: nối vào app: điểm kiểm tra Pro thật, hạn mức của phiên, lịch `validate`, sự kiện cho giao diện.
//! - [`client`]: gọi license server (`LicenseApi`, bản thật [`client::HttpApi`]).
//! - [`device`]: `device_id_hash` và tên máy gửi cho server.
//! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
//! - [`store`]: bản ghi trong kho khóa (key, token, bộ đếm, bản ghi đánh dấu, đơn đang chờ).
//! - [`manager`]: trạng thái bản quyền và hạn mức của máy này: kích hoạt, làm mới, gỡ, đếm phút, lịch `validate`.
//! - [`quota`]: luật hạn mức của gói trả phí và của Free, chống chỉnh đồng hồ, dạng phép tính thuần.

pub mod app;
pub mod client;
pub mod device;
pub mod key;
pub mod keys;
pub mod manager;
pub mod quota;
pub mod store;
pub mod token;
