//! Nhường lời ở chế độ âm thanh máy + micro (spec 2026-10-24-nguon-micro §5.4): khi luồng âm thanh máy (Playback) có
//! tiếng, micro bị hạ xuống, để tiếng cuộc họp phát ra loa rồi lọt vào micro không vào luồng trộn lần thứ hai.
//!
//! - [`MicGate`] đo RMS của Playback theo khung 10 ms. Khung vượt ngưỡng thì hạ micro ngay; hết tiếng thì giữ mức hạ thêm
//!   `hold_ms` rồi mở lại dần trong 50 ms. Tiếng vọng luôn tới micro sau tín hiệu số, nên cổng đóng kịp mà không cần đọc
//!   trước.
//! - [`DuckingMixer`] ghép cặp mẫu Playback với mẫu micro như `Mixer2` (phần dư quá `max_skew` phát riêng), nhân micro với
//!   hệ số của cổng rồi cộng. Micro có hai bản thẳng hàng (cho whisper, cho VAD, spec §5.3): cùng một hệ số cho cả hai.
//!
//! Mọi số đều ở 16 kHz.

/// Một khung đo năng lượng: 10 ms.
pub const GATE_FRAME: usize = 160;
/// Thời gian mở lại dần: 50 ms.
const RELEASE_SAMPLES: f32 = 800.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GateParams {
    /// Khung Playback có RMS từ ngưỡng này (dBFS) trở lên là "có tiếng".
    pub threshold_dbfs: f32,
    /// Mức hạ micro (dB, âm). `f32::NEG_INFINITY`: tắt hẳn micro.
    pub duck_db: f32,
    /// Giữ mức hạ thêm chừng này sau khung có tiếng cuối cùng.
    pub hold_ms: u32,
}

impl GateParams {
    /// Không bao giờ hạ: trộn thẳng (phương án A của spike, và C sau khi khử vọng).
    pub const OFF: GateParams = GateParams {
        threshold_dbfs: f32::INFINITY,
        duck_db: 0.0,
        hold_ms: 0,
    };
}

impl Default for GateParams {
    /// Tham số ban đầu của spec §5.4; spike chọn giá trị chốt.
    fn default() -> Self {
        Self {
            threshold_dbfs: -45.0,
            duck_db: -20.0,
            hold_ms: 300,
        }
    }
}

#[derive(Debug)]
pub struct MicGate {
    threshold_sq: f32,
    duck: f32,
    hold_frames: u32,
    release_step: f32,
    acc: f32,
    count: usize,
    holding: u32,
    gain: f32,
}

impl MicGate {
    pub fn new(p: GateParams) -> Self {
        let threshold = 10f32.powf(p.threshold_dbfs / 20.0);
        let duck = if p.duck_db == f32::NEG_INFINITY {
            0.0
        } else {
            10f32.powf(p.duck_db / 20.0)
        };
        Self {
            threshold_sq: threshold * threshold,
            duck,
            hold_frames: p.hold_ms.div_ceil(10),
            release_step: (1.0 - duck) / RELEASE_SAMPLES,
            acc: 0.0,
            count: 0,
            holding: 0,
            gain: 1.0,
        }
    }

    /// Một mẫu Playback; trả hệ số nhân cho mẫu micro cùng vị trí. Không cấp phát.
    pub fn next(&mut self, playback: f32) -> f32 {
        let applied = self.gain;
        self.acc += playback * playback;
        self.count += 1;
        let mut loud = false;
        if self.count == GATE_FRAME {
            loud = self.acc / GATE_FRAME as f32 >= self.threshold_sq;
            self.acc = 0.0;
            self.count = 0;
            if loud {
                self.holding = self.hold_frames;
                self.gain = self.duck;
            } else {
                self.holding = self.holding.saturating_sub(1);
            }
        }
        if !loud && self.holding == 0 && self.gain < 1.0 {
            self.gain = (self.gain + self.release_step).min(1.0);
        }
        applied
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Hệ số áp cho từng mẫu micro khi Playback là `playback`.
    fn gains(params: GateParams, playback: &[f32]) -> Vec<f32> {
        let mut gate = MicGate::new(params);
        playback.iter().map(|&p| gate.next(p)).collect()
    }

    /// 100 ms Playback có tiếng (hằng 0,1: −20 dBFS) rồi im lặng, tổng 0,5 giây.
    fn burst() -> Vec<f32> {
        let mut x = vec![0.1f32; 1_600];
        x.resize(8_000, 0.0);
        x
    }

    #[test]
    fn silence_never_ducks() {
        assert!(gains(GateParams::default(), &[0.0; 8_000]).iter().all(|&g| g == 1.0));
    }

    #[test]
    fn noise_below_the_threshold_never_ducks() {
        // RMS 0,001 = −60 dBFS, dưới ngưỡng −45 dBFS.
        let quiet: Vec<f32> = (0..8_000).map(|i| if i % 2 == 0 { 0.001 } else { -0.001 }).collect();
        assert!(gains(GateParams::default(), &quiet).iter().all(|&g| g == 1.0));
    }

    #[test]
    fn a_burst_ducks_after_one_frame_holds_then_releases() {
        let g = gains(GateParams::default(), &burst());
        let duck = 10f32.powf(-20.0 / 20.0);
        // Khung đầu chưa đo xong: chưa hạ.
        assert_eq!(g[100], 1.0);
        // Từ mẫu thứ 160: đã hạ.
        assert!((g[200] - duck).abs() < 1e-6);
        // Khung cuối có tiếng kết thúc ở mẫu 1600; giữ 300 ms (30 khung) tới mẫu 6400.
        assert!((g[6_000] - duck).abs() < 1e-6);
        // Đang mở lại dần.
        assert!(g[6_800] > duck && g[6_800] < 1.0, "{}", g[6_800]);
        // Mở lại xong sau 50 ms (800 mẫu).
        assert_eq!(g[7_300], 1.0);
    }

    #[test]
    fn negative_infinity_mutes_the_mic() {
        let g = gains(
            GateParams {
                duck_db: f32::NEG_INFINITY,
                ..GateParams::default()
            },
            &burst(),
        );
        assert_eq!(g[200], 0.0);
    }

    #[test]
    fn off_never_ducks() {
        assert!(gains(GateParams::OFF, &[0.9; 8_000]).iter().all(|&g| g == 1.0));
    }

    #[test]
    fn zero_hold_releases_right_after_the_sound() {
        let g = gains(
            GateParams {
                hold_ms: 0,
                ..GateParams::default()
            },
            &burst(),
        );
        // Khung im lặng đầu tiên kết thúc ở mẫu 1760, mở lại xong trước mẫu 1760 + 800 + 1.
        assert_eq!(g[2_600], 1.0);
    }
}
