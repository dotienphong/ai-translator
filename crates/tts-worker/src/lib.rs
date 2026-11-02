//! Lõi tính toán không cần model của `tts-worker` (spec 2026-11-02-doc-ban-dich-tts-design §3, bước 3): lấy mẫu mã âm
//! thanh và cửa sổ phạt lặp. Port từ SDK `vieneu` (`_v3_turbo_engine/onnx_runtime_lite.py::_sample`,
//! `rep_history.py`) và đối chiếu bằng golden test sinh từ chính SDK (`gen/golden.py`).
//!
//! Phần suy luận ONNX (prefill, decode_step, acoustic, codec) chưa có ở đây: cần model để spike (spec §8).

#![forbid(unsafe_code)]

pub mod frames;
pub mod rep_history;
pub mod sampling;
pub mod speech;
pub mod text;

#[cfg(feature = "engine")]
pub mod config;
#[cfg(feature = "engine")]
pub mod engine;
pub mod npz;
#[cfg(feature = "engine")]
pub mod phonemize;
#[cfg(feature = "engine")]
pub mod synth;
#[cfg(feature = "engine")]
pub mod voices;
