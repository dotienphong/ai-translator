//! Bù mức thu khi đang hạ âm lượng họp (spec 2026-11-02-nghe-dich-truc-tiep §5).
//!
//! Hạ âm lượng riêng các ứng dụng làm tiếng loopback nhỏ đi theo mức **không tỉ lệ** với số đặt (đường cong âm lượng, hiệu ứng
//! của driver), nên không bù bằng `1/mức đặt` mà bằng mức đo thực: nhớ mức tiếng họp ngay trước khi hạ (trung bình trượt ~10 s
//! trên các khung 10 ms có tiếng), rồi nhân tín hiệu để mức hiện tại về lại gần mức đó, tối đa [`MAX_GAIN`] (+20 dB).
//!
//! - Khi `engaged == false` mẫu **không bao giờ bị sửa** và hệ số về 1 ngay (đường thu hiện có không đổi).
//! - Chưa biết mức trước khi hạ (bật giữa im lặng) thì không bù.
//! - Hệ số đổi chậm (tối đa 0,5 dB mỗi khung 10 ms), im lặng không làm hệ số đổi, đầu ra luôn trong [-1, 1], mẫu không hữu hạn
//!   được thay bằng 0 (không làm hỏng trạng thái).

/// Hệ số tối đa: +26 dB (đo thật: hạ app còn 1% thì loopback còn ≈ −25 dB, nên +20 dB là không đủ).
pub const MAX_GAIN: f32 = 20.0;

/// Khung đo: 10 ms ở 16 kHz.
const FRAME: usize = 160;
/// Khung có tiếng khi chưa hạ: RMS từ ngưỡng này.
const VOICED_BASE: f32 = 1e-3;
/// Khung có tiếng khi đang hạ (tiếng nhỏ hơn nên ngưỡng thấp hơn).
const VOICED_DUCKED: f32 = 2e-4;
/// Số khung tối thiểu đã nghe thấy trước khi tin mức nền (0,5 s).
const MIN_BASE_FRAMES: u32 = 50;
/// EMA của mức nền: ~10 s (1000 khung).
const BASE_ALPHA: f32 = 0.001;
/// EMA của mức hiện tại khi đang hạ: ~1,5 s (150 khung).
const CUR_ALPHA: f32 = 1.0 / 150.0;
/// Bước đổi hệ số tối đa mỗi khung: 0,5 dB.
const STEP: f32 = 1.0593;

#[derive(Debug, Default)]
pub struct Agc {
    base_rms: f32,
    base_frames: u32,
    current_rms: Option<f32>,
    current_frames: u32,
    was_engaged: bool,
    gain: f32,
    acc_sq: f32,
    acc_n: usize,
}

impl Agc {
    pub fn new() -> Self {
        Self {
            gain: 1.0,
            ..Self::default()
        }
    }

    /// Mức nền đã học (RMS, số khung) để mang sang bộ bù mới khi nguồn thu mở lại giữa phiên (đổi thiết bị phát, mất kết nối): bộ mới
    /// không còn dịp học vì tiếng họp đã bị hạ. `None` khi chưa học được gì.
    pub fn learned(&self) -> Option<(f32, u32)> {
        (self.base_frames > 0).then_some((self.base_rms, self.base_frames))
    }

    /// Bộ bù mới nhưng dùng mức nền đã học từ bộ cũ.
    pub fn with_baseline(mut self, (rms, frames): (f32, u32)) -> Self {
        self.base_rms = rms;
        self.base_frames = frames;
        self
    }

    /// Hệ số đang áp (1 khi chưa bù).
    pub fn gain(&self) -> f32 {
        if self.gain == 0.0 { 1.0 } else { self.gain }
    }

    /// Xử lý một đoạn mẫu 16 kHz mono, kích thước bất kỳ. `engaged == false`: chỉ học mức nền, không sửa mẫu.
    pub fn process(&mut self, samples: &mut [f32], engaged: bool) {
        if engaged != self.was_engaged {
            // Đổi chế độ: bỏ khung dở dang (còn tiếng của chế độ trước), không cho nó làm lệch mức đo.
            self.was_engaged = engaged;
            self.acc_sq = 0.0;
            self.acc_n = 0;
        }
        if !engaged {
            self.gain = 1.0;
            self.current_rms = None;
            self.current_frames = 0;
            for &x in samples.iter() {
                self.feed(x, false);
            }
            return;
        }
        for x in samples.iter_mut() {
            let v = if x.is_finite() { *x } else { 0.0 };
            self.feed(v, true);
            *x = if self.gain() == 1.0 {
                v
            } else {
                (v * self.gain()).clamp(-1.0, 1.0)
            };
        }
    }

    fn feed(&mut self, x: f32, engaged: bool) {
        let x = if x.is_finite() { x } else { 0.0 };
        self.acc_sq += x * x;
        self.acc_n += 1;
        if self.acc_n < FRAME {
            return;
        }
        let rms = (self.acc_sq / FRAME as f32).sqrt();
        self.acc_sq = 0.0;
        self.acc_n = 0;
        // Mẫu hữu hạn nhưng cực lớn làm bình phương tràn: bỏ khung này, không để trạng thái thành vô hạn/NaN.
        if !rms.is_finite() {
            return;
        }
        if !engaged {
            if rms >= VOICED_BASE {
                self.base_frames = self.base_frames.saturating_add(1);
                let alpha = (1.0 / self.base_frames as f32).max(BASE_ALPHA);
                self.base_rms += alpha * (rms - self.base_rms);
            }
            return;
        }
        if self.base_frames < MIN_BASE_FRAMES || rms < VOICED_DUCKED {
            return;
        }
        self.current_frames = self.current_frames.saturating_add(1);
        // Trung bình cộng cho tới khi đủ khung, rồi EMA ~1,5 s: hội tụ nhanh ngay từ lúc mới hạ.
        let alpha = (1.0 / self.current_frames as f32).max(CUR_ALPHA);
        let current = match self.current_rms {
            Some(c) => c + alpha * (rms - c),
            None => rms,
        };
        self.current_rms = Some(current);
        let target = (self.base_rms / current).clamp(1.0, MAX_GAIN);
        let g = self.gain();
        self.gain = if target > g {
            (g * STEP).min(target)
        } else {
            (g / STEP).max(target)
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: usize = 16_000;

    fn sine(amplitude: f32, seconds: f32, phase: &mut usize) -> Vec<f32> {
        (0..(seconds * RATE as f32) as usize)
            .map(|_| {
                let x = amplitude * (2.0 * std::f32::consts::PI * 440.0 * *phase as f32 / RATE as f32).sin();
                *phase += 1;
                x
            })
            .collect()
    }

    fn run(agc: &mut Agc, signal: &mut [f32], engaged: bool, chunk: usize) {
        for part in signal.chunks_mut(chunk) {
            agc.process(part, engaged);
        }
    }

    fn peak(x: &[f32]) -> f32 {
        x.iter().fold(0.0_f32, |m, v| m.max(v.abs()))
    }

    fn learned(baseline: f32) -> (Agc, usize) {
        let mut agc = Agc::new();
        let mut phase = 0;
        let mut loud = sine(baseline, 10.0, &mut phase);
        run(&mut agc, &mut loud, false, 512);
        (agc, phase)
    }

    #[test]
    fn off_is_bit_exact() {
        let mut agc = Agc::new();
        let mut phase = 0;
        let mut x = sine(0.2, 3.0, &mut phase);
        let before = x.clone();
        run(&mut agc, &mut x, false, 480);
        assert_eq!(x, before);
        assert_eq!(agc.gain(), 1.0);
    }

    #[test]
    fn learns_baseline_then_restores_level() {
        let (mut agc, mut phase) = learned(0.2);
        let mut quiet = sine(0.05, 4.0, &mut phase);
        run(&mut agc, &mut quiet, true, 512);
        let last_second = &quiet[quiet.len() - RATE..];
        let p = peak(last_second);
        assert!((0.18..=0.22).contains(&p), "đỉnh sau khi bù = {p}");
    }

    #[test]
    fn gain_is_capped_at_max() {
        let (mut agc, mut phase) = learned(0.2);
        let mut very_quiet = sine(0.001, 6.0, &mut phase);
        run(&mut agc, &mut very_quiet, true, 512);
        assert!(agc.gain() <= MAX_GAIN + 1e-4, "gain = {}", agc.gain());
        assert!(agc.gain() > MAX_GAIN - 0.2, "gain = {}", agc.gain());
    }

    #[test]
    fn never_clips() {
        let (mut agc, mut phase) = learned(0.2);
        let mut quiet = sine(0.05, 2.0, &mut phase);
        run(&mut agc, &mut quiet, true, 512);
        let mut burst = sine(0.9, 0.5, &mut phase);
        run(&mut agc, &mut burst, true, 512);
        assert!(burst.iter().all(|v| v.abs() <= 1.0), "có mẫu vượt [-1, 1]");
    }

    #[test]
    fn silence_keeps_gain() {
        let (mut agc, mut phase) = learned(0.2);
        let mut quiet = sine(0.05, 3.0, &mut phase);
        run(&mut agc, &mut quiet, true, 512);
        let before = agc.gain();
        let mut silence = vec![0.0_f32; RATE * 2];
        run(&mut agc, &mut silence, true, 512);
        // Khung dở dang ở ranh giới im lặng có thể làm lệch một khung đo: cho phép dưới 2%.
        assert!(
            (agc.gain() - before).abs() < 0.02 * before,
            "gain đổi khi im lặng: {before} -> {}",
            agc.gain()
        );
    }

    #[test]
    fn release_resets_and_leaves_samples_alone() {
        let (mut agc, mut phase) = learned(0.2);
        let mut quiet = sine(0.05, 3.0, &mut phase);
        run(&mut agc, &mut quiet, true, 512);
        assert!(agc.gain() > 1.5);
        let mut next = sine(0.05, 0.1, &mut phase);
        let before = next.clone();
        run(&mut agc, &mut next, false, 512);
        assert_eq!(next, before);
        assert_eq!(agc.gain(), 1.0);
    }

    #[test]
    fn engaged_without_baseline_does_nothing() {
        let mut agc = Agc::new();
        let mut phase = 0;
        let mut x = sine(0.05, 2.0, &mut phase);
        let before = x.clone();
        run(&mut agc, &mut x, true, 512);
        assert_eq!(x, before);
        assert_eq!(agc.gain(), 1.0);
    }

    #[test]
    fn non_finite_input_does_not_poison_state() {
        let (mut agc, mut phase) = learned(0.2);
        let mut x = sine(0.05, 1.0, &mut phase);
        x[100] = f32::NAN;
        x[200] = f32::INFINITY;
        run(&mut agc, &mut x, true, 512);
        assert!(x.iter().all(|v| v.is_finite()));
        assert!(agc.gain().is_finite());
        let mut more = sine(0.05, 1.0, &mut phase);
        run(&mut agc, &mut more, true, 512);
        assert!(more.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn works_with_one_sample_at_a_time() {
        let (mut agc, mut phase) = learned(0.2);
        let mut x = sine(0.05, 1.0, &mut phase);
        run(&mut agc, &mut x, true, 1);
        assert!(x.iter().all(|v| v.is_finite() && v.abs() <= 1.0));
    }

    #[test]
    fn a_learned_baseline_can_be_carried_to_a_new_instance() {
        let (agc, mut phase) = learned(0.2);
        let carried = agc.learned().expect("đã học được mức nền");
        let mut fresh = Agc::new().with_baseline(carried);
        let mut quiet = sine(0.05, 4.0, &mut phase);
        run(&mut fresh, &mut quiet, true, 512);
        let p = peak(&quiet[quiet.len() - RATE..]);
        assert!((0.18..=0.22).contains(&p), "đỉnh sau khi bù = {p}");
        assert!(Agc::new().learned().is_none());
    }

    #[test]
    fn a_huge_finite_sample_does_not_poison_the_gain() {
        let (mut agc, mut phase) = learned(0.2);
        let mut quiet = sine(0.05, 2.0, &mut phase);
        quiet[100] = 3.0e19;
        run(&mut agc, &mut quiet, true, 512);
        assert!(agc.gain().is_finite() && agc.gain() >= 1.0, "gain = {}", agc.gain());
        let mut more = sine(0.05, 4.0, &mut phase);
        run(&mut agc, &mut more, true, 512);
        let p = peak(&more[more.len() - RATE..]);
        assert!((0.18..=0.22).contains(&p), "không hồi phục sau mẫu cực lớn: {p}");
    }

    #[test]
    fn the_cap_is_26_db_so_a_25_db_duck_can_be_made_up() {
        assert!((MAX_GAIN - 20.0).abs() < 1e-6);
        let (mut agc, mut phase) = learned(0.2);
        // Đo thật trên Windows: hạ app còn 0,01 thì loopback còn ≈ 5,4% (−25 dB), cần bù ≈ 18,6 lần.
        let mut ducked = sine(0.2 * 0.054, 8.0, &mut phase);
        run(&mut agc, &mut ducked, true, 512);
        let p = peak(&ducked[ducked.len() - RATE..]);
        assert!((0.18..=0.22).contains(&p), "đỉnh sau khi bù = {p}");
    }
}
