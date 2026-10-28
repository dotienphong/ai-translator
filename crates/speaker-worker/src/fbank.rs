//! Đặc trưng fbank kiểu Kaldi cho model nhúng giọng (spec 2026-10-26-phan-biet-nguoi-noi §5.1): 80 dải mel, khung 25 ms, bước
//! 10 ms (`snip_edges`), bỏ thành phần DC, nhấn tần 0,97, cửa sổ povey, đệm tới 512, phổ công suất, log; không dither. Khớp
//! `kaldi-native-fbank` (test `matches_kaldi_native_fbank`) với `num_bins = 80` (mặc định của Kaldi là 23), `dither = 0`,
//! `snip_edges = true` và `round_to_power_of_two = true` (khung 400 mẫu đệm tới 512); các tùy chọn còn lại giữ mặc định
//! (`samp_freq = 16000`, `preemph_coeff = 0.97`, `low_freq = 20`, cửa sổ povey, bỏ DC, phổ công suất, log). Mẫu đầu vào trong
//! [-1, 1] (model 3D-Speaker dùng `normalize_samples = 1`, không nhân 32768).

use std::sync::Arc;

use realfft::{RealFftPlanner, RealToComplex};

pub(crate) const FRAME_LEN: usize = 400;
pub(crate) const FRAME_SHIFT: usize = 160;
pub const NUM_BINS: usize = 80;
const FFT_LEN: usize = 512;
const SAMPLE_RATE: f32 = 16_000.0;
const PREEMPH: f32 = 0.97;
const LOW_FREQ: f32 = 20.0;

/// Bộ tính log fbank 80 dải cho mẫu 16 kHz. Cửa sổ povey, các dải mel và kế hoạch FFT tính một lần ở `new`; dùng lại cho
/// nhiều đoạn, các lần gọi `compute` không giữ trạng thái chung nên gọi song song được.
pub struct Fbank {
    window: Vec<f32>,
    /// Mỗi dải mel: chỉ số bin FFT đầu tiên có trọng số và các trọng số liên tiếp.
    banks: Vec<(usize, Vec<f32>)>,
    fft: Arc<dyn RealToComplex<f32>>,
}

fn mel(freq: f32) -> f32 {
    1127.0 * (1.0 + freq / 700.0).ln()
}

impl Default for Fbank {
    fn default() -> Self {
        Self::new()
    }
}

impl Fbank {
    pub fn new() -> Self {
        let window = (0..FRAME_LEN)
            .map(|i| {
                let a = 2.0 * std::f64::consts::PI * i as f64 / (FRAME_LEN - 1) as f64;
                (0.5 - 0.5 * a.cos()).powf(0.85) as f32
            })
            .collect();
        let bin_width = SAMPLE_RATE / FFT_LEN as f32;
        let (low, high) = (mel(LOW_FREQ), mel(SAMPLE_RATE / 2.0));
        let delta = (high - low) / (NUM_BINS + 1) as f32;
        let banks = (0..NUM_BINS)
            .map(|b| {
                let left = low + b as f32 * delta;
                let center = left + delta;
                let right = center + delta;
                let mut first = None;
                let mut weights = Vec::new();
                // Như Kaldi: chỉ xét FFT_LEN / 2 bin đầu (không có bin Nyquist).
                for i in 0..FFT_LEN / 2 {
                    let m = mel(bin_width * i as f32);
                    if m > left && m < right {
                        let w = if m <= center {
                            (m - left) / (center - left)
                        } else {
                            (right - m) / (right - center)
                        };
                        first.get_or_insert(i);
                        weights.push(w);
                    }
                }
                (first.unwrap_or(0), weights)
            })
            .collect();
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(FFT_LEN);
        Self { window, banks, fft }
    }

    /// Số khung của `len` mẫu (`snip_edges` của Kaldi: chỉ khung đủ 400 mẫu).
    pub(crate) fn num_frames(len: usize) -> usize {
        if len < FRAME_LEN {
            0
        } else {
            1 + (len - FRAME_LEN) / FRAME_SHIFT
        }
    }

    /// Log fbank chưa chuẩn hóa: `num_frames × NUM_BINS` giá trị, theo hàng.
    pub(crate) fn compute_raw(&self, samples: &[f32]) -> Vec<f32> {
        let frames = Self::num_frames(samples.len());
        let mut out = Vec::with_capacity(frames * NUM_BINS);
        let mut input = self.fft.make_input_vec();
        let mut spectrum = self.fft.make_output_vec();
        let mut scratch = self.fft.make_scratch_vec();
        let mut power = vec![0.0f32; FFT_LEN / 2 + 1];
        let mut x = [0.0f32; FRAME_LEN];
        for f in 0..frames {
            let frame = &samples[f * FRAME_SHIFT..f * FRAME_SHIFT + FRAME_LEN];
            let mean = frame.iter().sum::<f32>() / FRAME_LEN as f32;
            for (dst, src) in x.iter_mut().zip(frame) {
                *dst = src - mean;
            }
            for i in (1..FRAME_LEN).rev() {
                x[i] -= PREEMPH * x[i - 1];
            }
            x[0] -= PREEMPH * x[0];
            // Phải xóa mỗi khung: `realfft` dùng bộ đệm vào làm vùng nháp, sau mỗi lần `process` nội dung bị phá, mà các mẫu từ
            // FRAME_LEN tới FFT_LEN phải là 0 (đệm).
            input.fill(0.0);
            for i in 0..FRAME_LEN {
                input[i] = x[i] * self.window[i];
            }
            self.fft
                .process_with_scratch(&mut input, &mut spectrum, &mut scratch)
                .expect("độ dài bộ đệm FFT cố định");
            for (p, c) in power.iter_mut().zip(&spectrum) {
                *p = c.re * c.re + c.im * c.im;
            }
            for (first, weights) in &self.banks {
                let energy: f32 = weights.iter().zip(&power[*first..]).map(|(w, p)| w * p).sum();
                out.push(energy.max(f32::EPSILON).ln());
            }
        }
        out
    }

    /// Log fbank đã trừ trung bình theo thời gian của từng dải (`feature_normalize_type: global-mean`).
    pub fn compute(&self, samples: &[f32]) -> Vec<f32> {
        let mut feats = self.compute_raw(samples);
        let frames = feats.len() / NUM_BINS;
        for b in 0..NUM_BINS {
            let mean = (0..frames).map(|f| feats[f * NUM_BINS + b]).sum::<f32>() / frames.max(1) as f32;
            for f in 0..frames {
                feats[f * NUM_BINS + b] -= mean;
            }
        }
        feats
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn read_f32(name: &str) -> Vec<f32> {
        let path = format!("{}/testdata/{name}", env!("CARGO_MANIFEST_DIR"));
        let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
        bytes
            .as_chunks::<4>()
            .0
            .iter()
            .map(|b| f32::from_le_bytes(*b))
            .collect()
    }

    #[test]
    fn frame_count_follows_kaldi_snip_edges() {
        assert_eq!(Fbank::num_frames(399), 0);
        assert_eq!(Fbank::num_frames(400), 1);
        assert_eq!(Fbank::num_frames(559), 1);
        assert_eq!(Fbank::num_frames(560), 2);
        assert_eq!(Fbank::num_frames(24_000), 148);
    }

    #[test]
    fn povey_window_starts_at_zero_and_peaks_in_the_middle() {
        let f = Fbank::new();
        assert!(f.window[0].abs() < 1e-6);
        assert!((f.window[FRAME_LEN / 2] - 1.0).abs() < 1e-3);
    }

    #[test]
    fn every_mel_bank_has_weights_in_zero_one() {
        let f = Fbank::new();
        assert_eq!(f.banks.len(), NUM_BINS);
        for (first, w) in &f.banks {
            assert!(!w.is_empty());
            assert!(first + w.len() <= FFT_LEN / 2);
            assert!(w.iter().all(|&x| x > 0.0 && x <= 1.0));
        }
    }

    #[test]
    fn matches_kaldi_native_fbank() {
        let signal = read_f32("signal.f32");
        let reference = read_f32("fbank_ref.f32");
        let ours = Fbank::new().compute_raw(&signal);
        assert_eq!(ours.len(), reference.len());
        let max = ours
            .iter()
            .zip(&reference)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0f32, f32::max);
        let mean = ours.iter().zip(&reference).map(|(a, b)| (a - b).abs()).sum::<f32>() / ours.len() as f32;
        // Spec §5.1: sai lệch ≤ 1e-3 (đo được ≈ 2,3e-4).
        assert!(max < 1e-3, "sai lệch lớn nhất {max}");
        assert!(mean < 1e-4, "sai lệch trung bình {mean}");
    }

    #[test]
    fn compute_removes_the_mean_of_each_bin() {
        let feats = Fbank::new().compute(&read_f32("signal.f32"));
        let n = feats.len() / NUM_BINS;
        for b in 0..NUM_BINS {
            let mean = (0..n).map(|f| feats[f * NUM_BINS + b]).sum::<f32>() / n as f32;
            assert!(mean.abs() < 1e-4, "dải {b}: trung bình {mean}");
        }
    }

    #[test]
    fn too_short_input_gives_no_frames() {
        assert!(Fbank::new().compute(&[0.0; 100]).is_empty());
    }
}
