//! Nhận giọng người nói (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §5): đặc trưng fbank, nhúng giọng ERes2Net chạy từng nút,
//! phân cụm trực tuyến, trạng thái của worker (`session`), phần phụ thuộc hệ điều hành (`platform`). Binary `speaker-worker`
//! (`main.rs`) nói giao thức `speaker-protocol` qua stdin/stdout. Không chứa ggml, không có mã mạng. Kế hoạch 04 thêm đọc tên
//! (`reader`, `names`).

pub mod cluster;
pub mod embed;
pub mod fbank;
pub mod names;
pub mod onnx_steps;
pub mod platform;
pub mod reader;
pub mod session;
