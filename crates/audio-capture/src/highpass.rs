//! Lọc thông cao 80 Hz cho luồng micro (spec 2026-10-24-nguon-micro §5.7, lớp 1): cắt tiếng thình thịch khi gõ bàn, rung
//! bàn, chạm laptop. Giọng nói hầu như không có năng lượng dưới 80 Hz, nên lớp này không hại nhận dạng.
//!
//! Biquad bậc 2 Butterworth (Q = 1/√2), hệ số theo RBJ Audio EQ Cookbook, dạng trực tiếp I. Không cấp phát.

pub struct HighPass {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl HighPass {
    pub fn new(sample_rate: u32, cutoff_hz: f32) -> Self {
        let w0 = 2.0 * std::f32::consts::PI * cutoff_hz / sample_rate as f32;
        let (sin, cos) = w0.sin_cos();
        // alpha = sin / (2Q), Q = 1/√2.
        let alpha = sin * std::f32::consts::FRAC_1_SQRT_2;
        let a0 = 1.0 + alpha;
        let b0 = (1.0 + cos) / 2.0 / a0;
        Self {
            b0,
            b1: -2.0 * b0,
            b2: b0,
            a1: -2.0 * cos / a0,
            a2: (1.0 - alpha) / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    /// Lọc tại chỗ. Gọi nhiều lần liên tiếp trên các khối nối nhau cho cùng kết quả như lọc một lần.
    pub fn process(&mut self, samples: &mut [f32]) {
        for s in samples {
            let x = *s;
            let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
            self.x2 = self.x1;
            self.x1 = x;
            self.y2 = self.y1;
            self.y1 = y;
            *s = y;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq: f32, seconds: f32) -> Vec<f32> {
        (0..(16_000.0 * seconds) as usize)
            .map(|i| 0.5 * (2.0 * std::f32::consts::PI * freq * i as f32 / 16_000.0).sin())
            .collect()
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
    }

    /// Tỉ lệ RMS ra/vào, bỏ 0,5 giây đầu (lúc bộ lọc còn ổn định).
    fn gain_at(freq: f32) -> f32 {
        let input = sine(freq, 2.0);
        let mut output = input.clone();
        HighPass::new(16_000, 80.0).process(&mut output);
        rms(&output[8_000..]) / rms(&input[8_000..])
    }

    #[test]
    fn low_rumble_is_cut_and_speech_band_is_kept() {
        // Bậc 2 Butterworth: thấp hơn tần số cắt một quãng tám thì giảm khoảng 12 dB (hệ số 0,24).
        let rumble = gain_at(40.0);
        assert!(rumble < 0.3, "40 Hz: {rumble}");
        let speech = gain_at(300.0);
        assert!((0.97..=1.01).contains(&speech), "300 Hz: {speech}");
        let high = gain_at(3_000.0);
        assert!((0.99..=1.01).contains(&high), "3 kHz: {high}");
    }

    #[test]
    fn dc_is_removed() {
        let mut x = vec![0.5f32; 16_000];
        HighPass::new(16_000, 80.0).process(&mut x);
        assert!(x[8_000..].iter().all(|v| v.abs() < 1e-3));
    }

    #[test]
    fn chunked_processing_matches_one_pass() {
        let input = sine(150.0, 0.5);
        let mut whole = input.clone();
        HighPass::new(16_000, 80.0).process(&mut whole);
        let mut chunked = input;
        let mut f = HighPass::new(16_000, 80.0);
        for c in chunked.chunks_mut(97) {
            f.process(c);
        }
        assert_eq!(whole, chunked);
    }
}
