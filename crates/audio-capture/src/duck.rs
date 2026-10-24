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

use std::collections::VecDeque;

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

pub struct DuckingMixer {
    playback: VecDeque<f32>,
    mic: VecDeque<f32>,
    mic_vad: VecDeque<f32>,
    gate: MicGate,
    max_skew: usize,
    mic_samples: u64,
    ducked_samples: u64,
}

impl DuckingMixer {
    /// `max_skew_samples`: lệch tối đa giữa hai luồng trước khi phần dư được phát riêng (app: 100 ms, như `Mixer2`;
    /// đo offline trên hai file thì `usize::MAX`, ghép theo chỉ số).
    pub fn new(params: GateParams, max_skew_samples: usize) -> Self {
        Self {
            playback: VecDeque::new(),
            mic: VecDeque::new(),
            mic_vad: VecDeque::new(),
            gate: MicGate::new(params),
            max_skew: max_skew_samples,
            mic_samples: 0,
            ducked_samples: 0,
        }
    }

    pub fn push_playback(&mut self, samples: &[f32]) {
        self.playback.extend(samples);
    }

    /// Hai bản micro (cho whisper, cho VAD) phải dài bằng nhau: thẳng hàng từng mẫu (spec §5.3).
    pub fn push_mic(&mut self, asr: &[f32], vad: &[f32]) {
        assert_eq!(asr.len(), vad.len(), "hai bản micro phải dài bằng nhau");
        self.mic.extend(asr);
        self.mic_vad.extend(vad);
    }

    /// Ghi phần ghép được vào `out` (cho whisper) và `out_vad` (cho VAD); phần dư quá `max_skew` phát riêng.
    pub fn drain_into(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        let paired = self.playback.len().min(self.mic.len());
        for ((p, m), v) in self
            .playback
            .drain(..paired)
            .zip(self.mic.drain(..paired))
            .zip(self.mic_vad.drain(..paired))
        {
            let g = self.gate.next(p);
            self.mic_samples += 1;
            if g < 1.0 {
                self.ducked_samples += 1;
            }
            out.push((p + g * m).clamp(-1.0, 1.0));
            out_vad.push((p + g * v).clamp(-1.0, 1.0));
        }
        let extra = self.playback.len().saturating_sub(self.max_skew);
        self.flush_playback(extra, out, out_vad);
        let extra = self.mic.len().saturating_sub(self.max_skew);
        self.flush_mic(extra, out, out_vad);
    }

    /// Phát hết phần còn lại (khi dừng, hay cuối file).
    pub fn flush_into(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        self.drain_into(out, out_vad);
        self.flush_playback(self.playback.len(), out, out_vad);
        self.flush_mic(self.mic.len(), out, out_vad);
    }

    /// Tỉ lệ mẫu micro bị hạ (kể cả lúc giữ và lúc mở lại), để ghi log (spec §5.6).
    pub fn ducked_ratio(&self) -> f32 {
        if self.mic_samples == 0 {
            0.0
        } else {
            self.ducked_samples as f32 / self.mic_samples as f32
        }
    }

    fn flush_playback(&mut self, n: usize, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        for p in self.playback.drain(..n) {
            self.gate.next(p);
            let p = p.clamp(-1.0, 1.0);
            out.push(p);
            out_vad.push(p);
        }
    }

    fn flush_mic(&mut self, n: usize, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        for (m, v) in self.mic.drain(..n).zip(self.mic_vad.drain(..n)) {
            // Không có Playback ở vị trí này: cổng nhận im lặng, nên vẫn giữ rồi mở lại đúng nhịp.
            let g = self.gate.next(0.0);
            self.mic_samples += 1;
            if g < 1.0 {
                self.ducked_samples += 1;
            }
            out.push((g * m).clamp(-1.0, 1.0));
            out_vad.push((g * v).clamp(-1.0, 1.0));
        }
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

    fn mix(
        params: GateParams,
        max_skew: usize,
        playback: &[f32],
        mic: &[f32],
        mic_vad: &[f32],
    ) -> (Vec<f32>, Vec<f32>) {
        let mut m = DuckingMixer::new(params, max_skew);
        m.push_playback(playback);
        m.push_mic(mic, mic_vad);
        let (mut out, mut out_vad) = (Vec::new(), Vec::new());
        m.flush_into(&mut out, &mut out_vad);
        (out, out_vad)
    }

    #[test]
    fn quiet_playback_passes_both_mic_views_unchanged() {
        let (out, out_vad) = mix(
            GateParams::default(),
            1_600,
            &[0.0; 1_600],
            &[0.3; 1_600],
            &[0.2; 1_600],
        );
        assert!(out.iter().all(|&v| (v - 0.3).abs() < 1e-6));
        assert!(out_vad.iter().all(|&v| (v - 0.2).abs() < 1e-6));
    }

    #[test]
    fn loud_playback_ducks_both_mic_views_by_the_same_gain() {
        let (out, out_vad) = mix(
            GateParams::default(),
            1_600,
            &[0.1; 1_600],
            &[0.5; 1_600],
            &[0.4; 1_600],
        );
        // Khung đầu chưa hạ.
        assert!((out[0] - 0.6).abs() < 1e-6);
        // Sau đó micro nhân 0,1.
        assert!((out[1_000] - 0.15).abs() < 1e-5, "{}", out[1_000]);
        assert!((out_vad[1_000] - 0.14).abs() < 1e-5, "{}", out_vad[1_000]);
    }

    #[test]
    fn excess_beyond_the_skew_is_emitted_alone() {
        let mut m = DuckingMixer::new(GateParams::OFF, 100);
        m.push_playback(&[0.2; 300]);
        let (mut out, mut out_vad) = (Vec::new(), Vec::new());
        m.drain_into(&mut out, &mut out_vad);
        assert_eq!(out.len(), 200);
        assert_eq!(out_vad.len(), 200);
        m.push_mic(&[0.1; 100], &[0.1; 100]);
        m.drain_into(&mut out, &mut out_vad);
        assert_eq!(out.len(), 300);
        assert!((out[250] - 0.3).abs() < 1e-6);
    }

    #[test]
    fn flush_emits_everything_that_is_left() {
        let (out, _) = mix(GateParams::OFF, 10_000, &[0.1; 50], &[0.2; 80], &[0.2; 80]);
        assert_eq!(out.len(), 80);
        assert!((out[10] - 0.3).abs() < 1e-6);
        assert!((out[70] - 0.2).abs() < 1e-6);
    }

    #[test]
    fn the_sum_is_clamped() {
        let (out, _) = mix(GateParams::OFF, 100, &[0.9; 10], &[0.9; 10], &[0.9; 10]);
        assert!(out.iter().all(|&v| v == 1.0));
    }

    #[test]
    #[should_panic(expected = "hai bản micro phải dài bằng nhau")]
    fn mic_views_must_have_the_same_length() {
        DuckingMixer::new(GateParams::OFF, 100).push_mic(&[0.0; 3], &[0.0; 2]);
    }

    #[test]
    fn ducked_ratio_counts_mic_samples_under_the_gate() {
        let mut m = DuckingMixer::new(GateParams::default(), 1_600);
        m.push_playback(&[0.1; 1_600]);
        m.push_mic(&[0.0; 1_600], &[0.0; 1_600]);
        m.flush_into(&mut Vec::new(), &mut Vec::new());
        assert!((m.ducked_ratio() - 0.9).abs() < 0.01, "{}", m.ducked_ratio());
    }
}
