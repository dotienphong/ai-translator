//! Thu âm thanh hệ thống (spec §6.1) và chuyển về 16 kHz mono (spec §6.2).

pub mod gapfill;
pub mod mix;

use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
}

/// Nguồn âm thanh. Callback thu âm chỉ ghi mẫu float32 xen kẽ (interleaved) vào ring buffer,
/// không cấp phát bộ nhớ và không lock (spec §6.1).
pub trait AudioSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> anyhow::Result<()>;
    fn stop(&mut self);
    /// Hợp lệ sau khi `start` thành công.
    fn format(&self) -> AudioFormat;
}

/// Số liệu chẩn đoán, cập nhật từ luồng thu.
#[derive(Default, Debug)]
pub struct CaptureStats {
    /// Số khung (frame) nhận từ thiết bị.
    pub frames: AtomicU64,
    /// Số khung im lặng tự chèn vào khoảng trống (Windows, spec §6.1).
    pub silence_inserted: AtomicU64,
    /// Số khung bị bỏ vì trùng với phần im lặng đã chèn.
    pub skipped: AtomicU64,
    /// Số mẫu bị bỏ vì ring buffer đầy.
    pub dropped: AtomicU64,
}

impl CaptureStats {
    pub fn snapshot(&self) -> [u64; 4] {
        [
            self.frames.load(Ordering::Relaxed),
            self.silence_inserted.load(Ordering::Relaxed),
            self.skipped.load(Ordering::Relaxed),
            self.dropped.load(Ordering::Relaxed),
        ]
    }
}
