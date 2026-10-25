//! Nhường lời ở chế độ âm thanh máy + micro (spec 2026-10-24-nguon-micro §5.4): khi luồng âm thanh máy (Playback) có
//! tiếng, micro bị hạ xuống, để tiếng cuộc họp phát ra loa rồi lọt vào micro không vào luồng trộn lần thứ hai.
//!
//! - [`MicGate`] đo RMS của Playback theo khung 10 ms. Khung vượt ngưỡng thì hạ micro ngay; hết tiếng thì giữ mức hạ thêm
//!   `hold_ms` rồi mở lại dần trong 50 ms. Tiếng vọng luôn tới micro sau tín hiệu số, nên cổng đóng kịp mà không cần đọc
//!   trước.
//! - [`DuckingMixer`] ghép cặp mẫu Playback với mẫu micro như `Mixer2` (phần dư quá `max_skew` phát riêng), nhân micro với
//!   hệ số của cổng rồi cộng. Micro có hai bản thẳng hàng (cho whisper, cho VAD, spec §5.3): cùng một hệ số cho cả hai.
//! - Cổng kép (spec mục 17): ngoài năng lượng, một [`SpeechDetector`] tùy chọn (app: Silero VAD) nghe Playback theo khung
//!   [`SPEECH_FRAME`] mẫu; khung có tiếng nói thì cổng hạ như một khung to. Kết quả áp từ mẫu kế tiếp, không đọc trước, nên
//!   không thêm độ trễ; giọng nhỏ có thể lọt tối đa một hai khung đầu câu.
//!
//! Mọi số đều ở 16 kHz.

use std::collections::VecDeque;

/// Một khung đo năng lượng: 10 ms.
pub const GATE_FRAME: usize = 160;
/// Thời gian mở lại dần: 50 ms.
const RELEASE_SAMPLES: f32 = 800.0;
/// Khung của bộ phát hiện tiếng nói: 512 mẫu (32 ms), như Silero VAD.
pub const SPEECH_FRAME: usize = 512;

/// Bộ phát hiện tiếng nói trên Playback cho cổng (spec mục 17). Crate này không phụ thuộc `pipeline`: app và
/// `latency-bench` bọc Silero VAD bằng trait này.
pub trait SpeechDetector {
    /// Xác suất có tiếng nói của một khung [`SPEECH_FRAME`] mẫu.
    fn prob(&mut self, frame: &[f32]) -> anyhow::Result<f32>;
    /// Xóa state. [`DuckingMixer`] gọi ở lần dùng đầu tiên của mỗi bộ trộn (mỗi lần mở nguồn).
    fn reset(&mut self) -> anyhow::Result<()>;
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GateParams {
    /// Khung Playback có RMS từ ngưỡng này (dBFS) trở lên là "có tiếng".
    pub threshold_dbfs: f32,
    /// Mức hạ micro (dB, âm). `f32::NEG_INFINITY`: tắt hẳn micro.
    pub duck_db: f32,
    /// Giữ mức hạ thêm chừng này sau khung có tiếng cuối cùng.
    pub hold_ms: u32,
    /// Bộ phát hiện tiếng nói (nếu có) cho xác suất từ mức này trở lên là "có tiếng" (spec mục 17). `f32::INFINITY`: không
    /// dùng bộ phát hiện.
    pub speech_prob: f32,
    /// Khung Playback dưới mức này (dBFS, theo bình phương trung bình cả khung) coi là im lặng: khỏi hỏi bộ phát hiện, để tiết
    /// kiệm CPU. Khung từ ngưỡng năng lượng trở lên cũng khỏi hỏi (cổng đã hạ micro). `f32::NEG_INFINITY`: hỏi cả khung im lặng.
    pub speech_floor_dbfs: f32,
}

impl GateParams {
    /// Không bao giờ hạ: trộn thẳng (phương án A của spike, và C sau khi khử vọng).
    pub const OFF: GateParams = GateParams {
        threshold_dbfs: f32::INFINITY,
        duck_db: 0.0,
        hold_ms: 0,
        speech_prob: f32::INFINITY,
        speech_floor_dbfs: f32::NEG_INFINITY,
    };
}

impl Default for GateParams {
    /// Tham số ban đầu của spec §5.4; spike chọn giá trị chốt.
    fn default() -> Self {
        Self {
            threshold_dbfs: -45.0,
            duck_db: -20.0,
            hold_ms: 300,
            speech_prob: f32::INFINITY,
            speech_floor_dbfs: f32::NEG_INFINITY,
        }
    }
}

#[derive(Debug)]
pub struct MicGate {
    threshold_sq: f32,
    speech_prob: f32,
    speech_floor_sq: f32,
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
            speech_prob: p.speech_prob,
            speech_floor_sq: if p.speech_floor_dbfs == f32::NEG_INFINITY {
                0.0
            } else {
                10f32.powf(p.speech_floor_dbfs / 10.0)
            },
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

    /// Playback có tiếng nói (bộ phát hiện, spec mục 17): hạ từ mẫu kế tiếp và giữ như sau một khung to.
    pub fn hold(&mut self) {
        self.holding = self.hold_frames;
        self.gain = self.duck;
    }

    /// Ngưỡng xác suất tiếng nói; `f32::INFINITY` là không dùng bộ phát hiện.
    pub fn speech_prob(&self) -> f32 {
        self.speech_prob
    }

    /// Ngưỡng năng lượng của cổng, dạng bình phương trung bình.
    fn loud_sq(&self) -> f32 {
        self.threshold_sq
    }

    /// Mức im lặng dưới đó khỏi hỏi bộ phát hiện, dạng bình phương trung bình (0: không bỏ khung im lặng).
    fn floor_sq(&self) -> f32 {
        self.speech_floor_sq
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
    /// Playback đang gom cho khung kế tiếp của bộ phát hiện.
    speech_buf: Vec<f32>,
    /// Đã reset bộ phát hiện cho bộ trộn này chưa.
    speech_started: bool,
    /// Số lần hỏi bộ phát hiện và số khung bỏ qua, để log và đo.
    speech_calls: u64,
    speech_skips: u64,
    /// Bộ phát hiện đã lỗi: từ đó cổng chỉ còn theo năng lượng.
    speech_failed: bool,
    speech_error: Option<String>,
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
            speech_buf: Vec::with_capacity(SPEECH_FRAME),
            speech_started: false,
            speech_calls: 0,
            speech_skips: 0,
            speech_failed: false,
            speech_error: None,
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
        self.drain_into_with(out, out_vad, None);
    }

    /// Như [`Self::drain_into`], có bộ phát hiện tiếng nói nghe Playback (spec mục 17).
    pub fn drain_into_with(
        &mut self,
        out: &mut Vec<f32>,
        out_vad: &mut Vec<f32>,
        mut speech: Option<&mut (dyn SpeechDetector + '_)>,
    ) {
        let paired = self.playback.len().min(self.mic.len());
        for _ in 0..paired {
            let (Some(p), Some(m), Some(v)) = (
                self.playback.pop_front(),
                self.mic.pop_front(),
                self.mic_vad.pop_front(),
            ) else {
                break;
            };
            let g = self.gate.next(p);
            self.mic_samples += 1;
            if g < 1.0 {
                self.ducked_samples += 1;
            }
            out.push((p + g * m).clamp(-1.0, 1.0));
            out_vad.push((p + g * v).clamp(-1.0, 1.0));
            self.listen(p, &mut speech);
        }
        let extra = self.playback.len().saturating_sub(self.max_skew);
        self.flush_playback(extra, out, out_vad, &mut speech);
        let extra = self.mic.len().saturating_sub(self.max_skew);
        self.flush_mic(extra, out, out_vad);
    }

    /// Phát hết phần còn lại (khi dừng, hay cuối file).
    pub fn flush_into(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        self.flush_into_with(out, out_vad, None);
    }

    /// Như [`Self::flush_into`], có bộ phát hiện tiếng nói.
    pub fn flush_into_with(
        &mut self,
        out: &mut Vec<f32>,
        out_vad: &mut Vec<f32>,
        mut speech: Option<&mut (dyn SpeechDetector + '_)>,
    ) {
        self.drain_into_with(out, out_vad, speech.as_deref_mut());
        self.flush_playback(self.playback.len(), out, out_vad, &mut speech);
        self.flush_mic(self.mic.len(), out, out_vad);
    }

    /// Phát hết micro đang chờ ghép, như thể Playback im lặng ở các vị trí đó. Dùng khi Playback không trả mẫu nào một lúc
    /// (tap macOS tự dừng khi không app nào phát): micro không phải chờ đủ `max_skew` rồi còn trễ mãi sau đó.
    pub fn release_mic(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        self.flush_mic(self.mic.len(), out, out_vad);
    }

    /// (số lần hỏi bộ phát hiện tiếng nói, số khung bỏ qua vì to hay im lặng) từ lúc tạo bộ trộn.
    pub fn speech_stats(&self) -> (u64, u64) {
        (self.speech_calls, self.speech_skips)
    }

    /// Lỗi của bộ phát hiện tiếng nói, nếu có, đúng một lần. Từ lúc lỗi, bộ trộn này chỉ hạ theo năng lượng.
    pub fn take_speech_error(&mut self) -> Option<String> {
        self.speech_error.take()
    }

    /// Đưa một mẫu Playback cho bộ phát hiện; đủ một khung thì hỏi, có tiếng nói thì giữ cổng hạ.
    fn listen(&mut self, p: f32, speech: &mut Option<&mut (dyn SpeechDetector + '_)>) {
        let Some(detector) = speech.as_deref_mut() else {
            return;
        };
        if self.speech_failed || self.gate.speech_prob() == f32::INFINITY {
            return;
        }
        self.speech_buf.push(p);
        if self.speech_buf.len() < SPEECH_FRAME {
            return;
        }
        let mean_sq = self.speech_buf.iter().map(|v| v * v).sum::<f32>() / SPEECH_FRAME as f32;
        if mean_sq >= self.gate.loud_sq() || mean_sq < self.gate.floor_sq() {
            self.speech_skips += 1;
            self.speech_buf.clear();
            return;
        }
        if !self.speech_started {
            self.speech_started = true;
            if let Err(e) = detector.reset() {
                self.speech_buf.clear();
                self.speech_fail(e);
                return;
            }
        }
        self.speech_calls += 1;
        match detector.prob(&self.speech_buf) {
            Ok(prob) if prob >= self.gate.speech_prob() => self.gate.hold(),
            Ok(_) => {}
            Err(e) => self.speech_fail(e),
        }
        self.speech_buf.clear();
    }

    fn speech_fail(&mut self, e: anyhow::Error) {
        self.speech_failed = true;
        self.speech_error = Some(format!("{e:#}"));
    }

    /// Tỉ lệ mẫu micro bị hạ (kể cả lúc giữ và lúc mở lại), để ghi log (spec §5.6).
    pub fn ducked_ratio(&self) -> f32 {
        if self.mic_samples == 0 {
            0.0
        } else {
            self.ducked_samples as f32 / self.mic_samples as f32
        }
    }

    fn flush_playback(
        &mut self,
        n: usize,
        out: &mut Vec<f32>,
        out_vad: &mut Vec<f32>,
        speech: &mut Option<&mut (dyn SpeechDetector + '_)>,
    ) {
        for _ in 0..n {
            let Some(p) = self.playback.pop_front() else {
                break;
            };
            self.gate.next(p);
            self.listen(p, speech);
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

    /// Bộ phát hiện giả: trả lần lượt các xác suất trong `probs` (hết thì 0), đếm lần gọi và lần reset; `fail_at`: lần gọi
    /// thứ mấy (từ 0) trả lỗi.
    #[derive(Default)]
    struct FakeSpeech {
        probs: Vec<f32>,
        calls: usize,
        resets: usize,
        fail_at: Option<usize>,
    }

    impl SpeechDetector for FakeSpeech {
        fn prob(&mut self, frame: &[f32]) -> anyhow::Result<f32> {
            assert_eq!(frame.len(), SPEECH_FRAME);
            let i = self.calls;
            self.calls += 1;
            if self.fail_at == Some(i) {
                anyhow::bail!("hỏng");
            }
            Ok(self.probs.get(i).copied().unwrap_or(0.0))
        }

        fn reset(&mut self) -> anyhow::Result<()> {
            self.resets += 1;
            Ok(())
        }
    }

    /// Như `GATE` của app (spec mục 17).
    const APP: GateParams = GateParams {
        threshold_dbfs: -55.0,
        duck_db: f32::NEG_INFINITY,
        hold_ms: 300,
        speech_prob: 0.5,
        speech_floor_dbfs: -80.0,
    };
    /// Biên độ hằng 0,0008: −62 dBFS, dưới ngưỡng năng lượng.
    const QUIET: f32 = 0.0008;

    fn mix_with(
        params: GateParams,
        playback: &[f32],
        mic: &[f32],
        speech: &mut FakeSpeech,
    ) -> (Vec<f32>, DuckingMixer) {
        let mut m = DuckingMixer::new(params, usize::MAX);
        m.push_playback(playback);
        m.push_mic(mic, mic);
        let mut out = Vec::new();
        m.flush_into_with(&mut out, &mut Vec::new(), Some(speech as &mut dyn SpeechDetector));
        (out, m)
    }

    #[test]
    fn quiet_speech_mutes_the_mic_from_the_next_sample_and_holds() {
        let mut playback = vec![QUIET; 1_536];
        playback.resize(9_000, 0.0);
        let mut s = FakeSpeech {
            probs: vec![0.9, 0.9, 0.9],
            ..Default::default()
        };
        let (out, _) = mix_with(APP, &playback, &[0.3; 9_000], &mut s);
        // Khung 512 mẫu đầu chưa xong: micro chưa bị hạ.
        assert!((out[100] - (QUIET + 0.3)).abs() < 1e-6, "{}", out[100]);
        // Từ mẫu 512: micro tắt, chỉ còn âm thanh máy.
        assert!((out[600] - QUIET).abs() < 1e-6, "{}", out[600]);
        // Khung có tiếng cuối kết thúc ở mẫu 1 536; giữ 300 ms (30 khung 10 ms) tới khoảng mẫu 6 240.
        assert_eq!(out[6_000], 0.0);
        // Mở lại xong sau 50 ms.
        assert!((out[8_500] - 0.3).abs() < 1e-6, "{}", out[8_500]);
    }

    #[test]
    fn quiet_non_speech_does_not_duck() {
        let mut s = FakeSpeech {
            probs: vec![0.1; 20],
            ..Default::default()
        };
        let (out, _) = mix_with(APP, &[QUIET; 8_000], &[0.3; 8_000], &mut s);
        assert!(out.iter().all(|&v| (v - (QUIET + 0.3)).abs() < 1e-6));
        assert_eq!(s.calls, 8_000 / SPEECH_FRAME);
    }

    #[test]
    fn loud_playback_still_ducks_at_once_whatever_the_detector_says() {
        let mut s = FakeSpeech::default();
        let (out, _) = mix_with(APP, &[0.1; 1_600], &[0.3; 1_600], &mut s);
        assert!((out[100] - 0.4).abs() < 1e-6, "{}", out[100]);
        assert!((out[200] - 0.1).abs() < 1e-6, "{}", out[200]);
    }

    #[test]
    fn a_failing_detector_is_reported_once_and_the_gate_falls_back_to_energy() {
        let mut s = FakeSpeech {
            probs: vec![0.9; 20],
            fail_at: Some(0),
            ..Default::default()
        };
        let (out, mut m) = mix_with(APP, &[QUIET; 4_000], &[0.3; 4_000], &mut s);
        assert_eq!(s.calls, 1, "lỗi một lần thì không hỏi nữa");
        assert!(out.iter().all(|&v| (v - (QUIET + 0.3)).abs() < 1e-6));
        assert!(m.take_speech_error().unwrap().contains("hỏng"));
        assert_eq!(m.take_speech_error(), None);
    }

    #[test]
    fn the_detector_is_reset_once_per_mixer() {
        let mut s = FakeSpeech::default();
        let mut m = DuckingMixer::new(APP, usize::MAX);
        for _ in 0..3 {
            m.push_playback(&[QUIET; 600]);
            m.push_mic(&[0.0; 600], &[0.0; 600]);
            m.drain_into_with(
                &mut Vec::new(),
                &mut Vec::new(),
                Some(&mut s as &mut dyn SpeechDetector),
            );
        }
        assert_eq!((s.resets, s.calls), (1, 1_800 / SPEECH_FRAME));
        let mut m2 = DuckingMixer::new(APP, usize::MAX);
        m2.push_playback(&[QUIET; 600]);
        m2.push_mic(&[0.0; 600], &[0.0; 600]);
        m2.drain_into_with(
            &mut Vec::new(),
            &mut Vec::new(),
            Some(&mut s as &mut dyn SpeechDetector),
        );
        assert_eq!(s.resets, 2, "bộ trộn mới (mở lại nguồn) thì reset lại");
    }

    #[test]
    fn without_a_speech_threshold_the_detector_is_never_asked() {
        let mut s = FakeSpeech {
            probs: vec![1.0; 20],
            ..Default::default()
        };
        let params = GateParams {
            speech_prob: f32::INFINITY,
            ..APP
        };
        let (out, _) = mix_with(params, &[QUIET; 4_000], &[0.3; 4_000], &mut s);
        assert_eq!((s.calls, s.resets), (0, 0));
        assert!(out.iter().all(|&v| (v - (QUIET + 0.3)).abs() < 1e-6));
    }

    /// Chỉ gửi cho bộ phát hiện những khung có thể là giọng nhỏ: khung to (cổng năng lượng đã hạ) và khung im lặng số thì bỏ qua.
    #[test]
    fn only_quiet_frames_reach_the_detector() {
        let mut playback = vec![0.1; SPEECH_FRAME * 2];
        playback.extend(vec![0.0; SPEECH_FRAME * 2]);
        playback.extend(vec![0.00005; SPEECH_FRAME * 2]);
        playback.extend(vec![QUIET; SPEECH_FRAME * 3]);
        let mut s = FakeSpeech::default();
        let (_, _) = mix_with(APP, &playback, &vec![0.3; playback.len()], &mut s);
        assert_eq!(
            s.calls, 3,
            "chỉ ba khung −62 dBFS, không phải khung to (−20), im lặng số, hay −86 dBFS"
        );
    }

    /// State của bộ phát hiện không bị xóa giữa chừng: khung im lặng bỏ qua rồi giọng nhỏ quay lại thì bộ phát hiện tiếp tục
    /// với state cũ. (Xóa state sau 0,5 giây nghỉ làm onset giọng nhỏ bị nhận chậm: h36 21,4% so với 12,7%.)
    #[test]
    fn the_detector_state_survives_gaps_of_skipped_frames() {
        let frames = |n: usize, v: f32| vec![v; SPEECH_FRAME * n];
        let mut playback = frames(2, QUIET);
        playback.extend(frames(40, 0.0));
        playback.extend(frames(2, QUIET));
        let mut s = FakeSpeech::default();
        mix_with(APP, &playback, &vec![0.0; playback.len()], &mut s);
        assert_eq!((s.calls, s.resets), (4, 1));
    }

    /// Không đặt mức im lặng (mặc định của `GateParams::OFF` và của mix-eval): mọi khung không to đều tới bộ phát hiện.
    #[test]
    fn without_a_floor_every_non_loud_frame_reaches_the_detector() {
        let params = GateParams {
            speech_floor_dbfs: f32::NEG_INFINITY,
            ..APP
        };
        let mut playback = vec![QUIET; SPEECH_FRAME];
        playback.extend(vec![0.0; SPEECH_FRAME * 40]);
        playback.extend(vec![QUIET; SPEECH_FRAME]);
        let mut s = FakeSpeech::default();
        mix_with(params, &playback, &vec![0.0; playback.len()], &mut s);
        assert_eq!((s.calls, s.resets), (42, 1));
    }

    /// Playback im lặng: micro đang chờ ghép được xả ngay (cổng nhận im lặng ở các vị trí đó), không chờ đủ `max_skew`.
    #[test]
    fn release_mic_flushes_the_unpaired_mic_at_once() {
        let mut m = DuckingMixer::new(APP, 1_600);
        m.push_mic(&[0.1; 800], &[0.1; 800]);
        let (mut out, mut vad) = (Vec::new(), Vec::new());
        m.drain_into(&mut out, &mut vad);
        assert!(out.is_empty(), "chưa quá max_skew: vẫn chờ Playback");
        m.release_mic(&mut out, &mut vad);
        assert_eq!((out.len(), vad.len()), (800, 800));
        assert!(
            out.iter().all(|&v| (v - 0.1).abs() < 1e-6),
            "Playback im lặng nên micro nguyên vẹn"
        );
        m.push_playback(&[0.0; 160]);
        m.push_mic(&[0.1; 160], &[0.1; 160]);
        m.drain_into(&mut out, &mut vad);
        assert_eq!(
            out.len(),
            960,
            "sau khi xả, Playback quay lại thì ghép từng mẫu, không lệch"
        );
    }

    /// Thống kê số lần hỏi bộ phát hiện và số khung bỏ qua (để log và để đo).
    #[test]
    fn speech_stats_count_calls_and_skips() {
        let mut playback = vec![0.1; SPEECH_FRAME];
        playback.extend(vec![0.0; SPEECH_FRAME]);
        playback.extend(vec![QUIET; SPEECH_FRAME * 2]);
        let mut s = FakeSpeech::default();
        let (_, m) = mix_with(APP, &playback, &vec![0.0; playback.len()], &mut s);
        assert_eq!(m.speech_stats(), (2, 2));
    }
}
