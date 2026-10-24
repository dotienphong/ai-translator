//! Chuỗi xử lý micro (spec 2026-10-24-nguon-micro §5.7, mục 16): một luồng thiết bị ra hai bản 16 kHz mono thẳng hàng
//! theo chỉ số.
//!
//! - Bản cho whisper: 16 kHz → khuếch đại +20 dB, chặn mềm `tanh` → lọc 80 Hz.
//! - Bản cho VAD: 48 kHz → RNNoise → 16 kHz → khuếch đại, chặn mềm → lọc 80 Hz. Tắt "Lọc tiếng ồn micro" thì bản này là
//!   bản sao của bản cho whisper.
//!
//! Thứ tự các bước giống hệt `latency-bench mix-eval` (nơi đo ra các số của spec mục 16). Bản cho VAD đi qua thêm hai bộ
//! đổi tần số và RNNoise nên trễ hơn bản cho whisper chừng 10–20 ms; đoạn có 200 ms đệm nên lệch này không cắt chữ.

use crate::AudioFormat;
use crate::highpass::HighPass;
use crate::resample::{MonoResampler, TARGET_RATE};
use anyhow::Result;
use nnnoiseless::DenoiseState;

/// Khuếch đại cố định của micro (spec mục 16): micro laptop thu giọng ở 1 m chỉ khoảng −38 dBFS.
pub const MIC_GAIN_DB: f32 = 20.0;
/// Lọc thông cao (lớp 1, §5.7): cắt tiếng thình thịch khi gõ bàn.
pub const MIC_HIGHPASS_HZ: f32 = 80.0;
/// RNNoise chạy ở 48 kHz, khung 10 ms.
const DENOISE_RATE: u32 = 48_000;
const DENOISE_FRAME: usize = DenoiseState::FRAME_SIZE;

/// RNNoise theo luồng: nhận mẫu 48 kHz trong [-1, 1], trả mẫu đã lọc theo từng khung 480 mẫu. Khung đầu tiên ra im lặng
/// (tiếng "fade-in" của mạng, khuyến nghị của `nnnoiseless`).
pub struct Denoiser {
    state: Box<DenoiseState<'static>>,
    pending: Vec<f32>,
    frame_in: [f32; DENOISE_FRAME],
    frame_out: [f32; DENOISE_FRAME],
    first: bool,
}

impl Default for Denoiser {
    fn default() -> Self {
        Self::new()
    }
}

impl Denoiser {
    pub fn new() -> Self {
        Self {
            state: DenoiseState::new(),
            pending: Vec::with_capacity(DENOISE_FRAME * 2),
            frame_in: [0.0; DENOISE_FRAME],
            frame_out: [0.0; DENOISE_FRAME],
            first: true,
        }
    }

    /// Ghi thêm vào `out` mọi khung đủ 480 mẫu; phần lẻ giữ cho lần sau.
    pub fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        self.pending.extend_from_slice(input);
        let whole = self.pending.len() / DENOISE_FRAME * DENOISE_FRAME;
        for chunk in self.pending[..whole].as_chunks::<DENOISE_FRAME>().0 {
            // nnnoiseless nhận mẫu theo thang 16 bit.
            for (d, s) in self.frame_in.iter_mut().zip(chunk) {
                *d = s * 32_768.0;
            }
            self.state.process_frame(&mut self.frame_out, &self.frame_in);
            if std::mem::take(&mut self.first) {
                out.extend(std::iter::repeat_n(0.0, DENOISE_FRAME));
            } else {
                out.extend(self.frame_out.iter().map(|v| (v / 32_768.0).clamp(-1.0, 1.0)));
            }
        }
        self.pending.drain(..whole);
    }
}

/// Bước lọc ồn của bản VAD. Test dùng `Identity` để đo riêng phần đổi tần số.
enum Stage {
    Rnnoise(Box<Denoiser>),
    #[cfg(test)]
    Identity,
}

/// Đường đi của bản VAD: lên 48 kHz, lọc ồn, về 16 kHz.
struct VadPath {
    up: MonoResampler,
    stage: Stage,
    down: MonoResampler,
    at48: Vec<f32>,
    clean48: Vec<f32>,
}

impl VadPath {
    fn new(format: AudioFormat, stage: Stage) -> Result<Self> {
        Ok(Self {
            up: MonoResampler::to_rate(format.sample_rate, format.channels, DENOISE_RATE)?,
            stage,
            down: MonoResampler::to_rate(DENOISE_RATE, 1, TARGET_RATE)?,
            at48: Vec::new(),
            clean48: Vec::new(),
        })
    }

    /// Ghi thêm mẫu 16 kHz đã lọc ồn (chưa khuếch đại) vào `out`.
    fn process(&mut self, interleaved: &[f32], out: &mut Vec<f32>) -> Result<()> {
        self.at48.clear();
        self.up.process(interleaved, &mut self.at48)?;
        self.clean48.clear();
        match &mut self.stage {
            Stage::Rnnoise(d) => d.process(&self.at48, &mut self.clean48),
            #[cfg(test)]
            Stage::Identity => self.clean48.extend_from_slice(&self.at48),
        }
        self.down.process(&self.clean48, out)
    }
}

/// Khuếch đại rồi chặn mềm, tại chỗ.
fn amplify(samples: &mut [f32], gain: f32) {
    for x in samples {
        *x = (*x * gain).tanh();
    }
}

pub struct MicChain {
    to16: MonoResampler,
    vad_path: Option<VadPath>,
    gain: f32,
    highpass: HighPass,
    highpass_vad: HighPass,
    /// Mẫu đã xử lý xong của hai bản, chưa ghép cặp (bản VAD tới chậm hơn).
    asr: Vec<f32>,
    vad: Vec<f32>,
    scratch: Vec<f32>,
}

impl MicChain {
    /// `noise_filter`: công tắc "Lọc tiếng ồn micro" (RNNoise cho bản VAD).
    pub fn new(format: AudioFormat, noise_filter: bool) -> Result<Self> {
        let vad_path = if noise_filter {
            Some(VadPath::new(format, Stage::Rnnoise(Box::default()))?)
        } else {
            None
        };
        Ok(Self {
            to16: MonoResampler::new(format.sample_rate, format.channels)?,
            vad_path,
            gain: 10f32.powf(MIC_GAIN_DB / 20.0),
            highpass: HighPass::new(TARGET_RATE, MIC_HIGHPASS_HZ),
            highpass_vad: HighPass::new(TARGET_RATE, MIC_HIGHPASS_HZ),
            asr: Vec::new(),
            vad: Vec::new(),
            scratch: Vec::new(),
        })
    }

    /// `interleaved`: mẫu thô của thiết bị (không cần chia hết cho số kênh). Ghi cùng số mẫu 16 kHz vào `out` (whisper) và
    /// `out_vad` (VAD).
    pub fn process(&mut self, interleaved: &[f32], out: &mut Vec<f32>, out_vad: &mut Vec<f32>) -> Result<()> {
        let from = self.asr.len();
        self.to16.process(interleaved, &mut self.asr)?;
        amplify(&mut self.asr[from..], self.gain);
        self.highpass.process(&mut self.asr[from..]);
        match &mut self.vad_path {
            None => self.vad.extend_from_slice(&self.asr[from..]),
            Some(path) => {
                self.scratch.clear();
                path.process(interleaved, &mut self.scratch)?;
                amplify(&mut self.scratch, self.gain);
                self.highpass_vad.process(&mut self.scratch);
                self.vad.extend_from_slice(&self.scratch);
            }
        }
        let n = self.asr.len().min(self.vad.len());
        out.extend(self.asr.drain(..n));
        out_vad.extend(self.vad.drain(..n));
        Ok(())
    }
}

/// Đọc ring buffer của nguồn micro và chạy [`MicChain`] (chế độ `mic`, QĐ1 của kế hoạch 02).
pub struct MicPreprocessor {
    consumer: rtrb::Consumer<f32>,
    chain: MicChain,
    raw: Vec<f32>,
}

impl MicPreprocessor {
    pub fn new(consumer: rtrb::Consumer<f32>, format: AudioFormat, noise_filter: bool) -> Result<Self> {
        Ok(Self {
            consumer,
            chain: MicChain::new(format, noise_filter)?,
            raw: Vec::new(),
        })
    }

    /// Đọc hết mẫu đang có, ghi thêm cùng số mẫu vào `out` (whisper) và `out_vad` (VAD).
    pub fn drain(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) -> Result<()> {
        self.raw.clear();
        let available = self.consumer.slots();
        if available > 0 {
            let chunk = self.consumer.read_chunk(available)?;
            let (a, b) = chunk.as_slices();
            self.raw.extend_from_slice(a);
            self.raw.extend_from_slice(b);
            chunk.commit_all();
        }
        self.chain.process(&self.raw, out, out_vad)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    fn format(sample_rate: u32, channels: u16) -> AudioFormat {
        AudioFormat { sample_rate, channels }
    }

    fn sine(rate: u32, hz: f32, amp: f32, seconds: f32) -> Vec<f32> {
        (0..(rate as f32 * seconds) as usize)
            .map(|i| amp * (2.0 * std::f32::consts::PI * hz * i as f32 / rate as f32).sin())
            .collect()
    }

    /// Chạy cả `input` qua chuỗi theo từng khối `block` mẫu (10 ms của thiết bị), như luồng thu.
    fn run(chain: &mut MicChain, input: &[f32], block: usize) -> (Vec<f32>, Vec<f32>) {
        let (mut out, mut vad) = (Vec::new(), Vec::new());
        for piece in input.chunks(block) {
            chain.process(piece, &mut out, &mut vad).unwrap();
            assert_eq!(out.len(), vad.len(), "hai bản luôn cùng độ dài");
        }
        (out, vad)
    }

    /// Lệch (mẫu) mà `b` đi sau `a` nhiều nhất về tương quan, trong ±`max`.
    fn lag(a: &[f32], b: &[f32], max: usize) -> isize {
        let n = a.len().min(b.len()) - max;
        let corr = |l: isize| -> f32 { (max..n).map(|i| a[i] * b[(i as isize + l) as usize]).sum() };
        (-(max as isize)..=max as isize)
            .max_by(|&x, &y| corr(x).total_cmp(&corr(y)))
            .unwrap()
    }

    #[test]
    fn the_denoiser_keeps_whole_frames_and_silences_the_first() {
        let mut d = Denoiser::new();
        let mut out = Vec::new();
        d.process(&[0.1; 700], &mut out);
        assert_eq!(out.len(), 480);
        assert!(out.iter().all(|&v| v == 0.0), "khung đầu là im lặng");
        d.process(&[0.1; 260], &mut out);
        assert_eq!(out.len(), 960, "phần lẻ 220 + 260 thành một khung");
    }

    /// Không lọc ồn: hai bản giống hệt nhau; giọng nhỏ (−46 dBFS) được đưa lên khoảng +20 dB.
    #[test]
    fn without_the_noise_filter_both_views_are_identical_and_amplified() {
        let mut chain = MicChain::new(format(48_000, 2), false).unwrap();
        let mono = sine(48_000, 440.0, 0.005, 1.0);
        let stereo: Vec<f32> = mono.iter().flat_map(|&v| [v, v]).collect();
        let (out, vad) = run(&mut chain, &stereo, 960);
        assert_eq!(out, vad);
        assert!((15_600..=16_000).contains(&out.len()), "{}", out.len());
        let gain = 20.0 * (rms(&out[4_000..12_000]) / rms(&mono[12_000..36_000])).log10();
        assert!((gain - MIC_GAIN_DB).abs() < 0.5, "{gain}");
    }

    /// Chặn mềm: tiếng rất to sau khuếch đại không vượt quá 1, tiếng nhỏ gần như tuyến tính. Lọc 80 Hz chạy sau bước này
    /// (như `mix-eval`), nên đầu ra cuối có thể vượt 1 một chút ở sườn của tiếng bị chặn; whisper vẫn nhận được.
    #[test]
    fn amplification_is_soft_limited() {
        let mut x = [0.9f32, -0.9, 0.001];
        amplify(&mut x, 10.0);
        assert!(x[0] < 1.0 && x[0] > 0.99 && x[1] > -1.0);
        assert!((x[2] - 0.01).abs() < 1e-5);
    }

    /// Lọc 80 Hz: 40 Hz giảm mạnh, 300 Hz gần như giữ nguyên (so với cùng mức đã khuếch đại).
    #[test]
    fn the_highpass_cuts_rumble_but_keeps_voice() {
        let level = |hz: f32| {
            let mut chain = MicChain::new(format(16_000, 1), false).unwrap();
            let (out, _) = run(&mut chain, &sine(16_000, hz, 0.005, 1.0), 160);
            20.0 * (rms(&out[8_000..]) / (0.005 * 10.0 / 2f32.sqrt())).log10()
        };
        assert!(level(40.0) < -6.0, "{}", level(40.0));
        assert!(level(300.0).abs() < 1.0, "{}", level(300.0));
    }

    /// Phần đổi tần số của bản VAD (lên 48 kHz rồi về 16 kHz) chỉ làm bản VAD trễ tối đa 20 ms so với bản whisper (QĐ3).
    #[test]
    fn the_vad_view_lags_by_at_most_20_ms() {
        let mut chain = MicChain::new(format(44_100, 1), false).unwrap();
        chain.vad_path = Some(VadPath::new(format(44_100, 1), Stage::Identity).unwrap());
        // Xung vuông 5 Hz biên độ nhỏ: có nhiều sườn để đo tương quan.
        let input: Vec<f32> = (0..44_100)
            .map(|i| if (i / 4_410) % 2 == 0 { 0.003 } else { -0.003 })
            .collect();
        let (out, vad) = run(&mut chain, &input, 441);
        let l = lag(&out, &vad, 480);
        assert!((0..=320).contains(&l), "lệch {l} mẫu");
    }

    /// RNNoise chỉ lọc bản VAD: chuỗi tiếng click làm bản VAD nhỏ hẳn (đo được −13,8 dB), bản whisper giữ nguyên như khi
    /// tắt lọc ồn.
    #[test]
    fn rnnoise_quiets_clicks_in_the_vad_view_only() {
        // Tiếng gõ tổng hợp: mỗi 150 ms một chùm nhiễu trắng băng rộng 10 ms, tắt dần (giả ngẫu nhiên LCG, cố định).
        let mut clicks = vec![0.0f32; 48_000 * 3];
        let mut seed = 12_345u32;
        for start in (4_800..clicks.len() - 480).step_by(7_200) {
            for (k, v) in clicks[start..start + 480].iter_mut().enumerate() {
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                let noise = (seed >> 8) as f32 / (1u32 << 24) as f32 * 2.0 - 1.0;
                *v = 0.05 * noise * (-(k as f32) / 96.0).exp();
            }
        }
        let mut filtered = MicChain::new(format(48_000, 1), true).unwrap();
        let (out, vad) = run(&mut filtered, &clicks, 480);
        let mut plain = MicChain::new(format(48_000, 1), false).unwrap();
        let (reference, _) = run(&mut plain, &clicks, 480);
        let n = out.len().min(reference.len());
        assert_eq!(out[..n], reference[..n], "bản whisper không bị lọc");
        let drop = 20.0 * (rms(&vad[8_000..]) / rms(&out[8_000..])).log10();
        assert!(drop < -6.0, "bản VAD chỉ giảm {drop} dB");
    }

    #[test]
    fn the_preprocessor_drains_the_ring_into_both_views() {
        let (mut producer, consumer) = rtrb::RingBuffer::new(48_000);
        let mut p = MicPreprocessor::new(consumer, format(16_000, 1), false).unwrap();
        for _ in 0..1_600 {
            producer.push(0.001).unwrap();
        }
        let (mut out, mut vad) = (Vec::new(), Vec::new());
        p.drain(&mut out, &mut vad).unwrap();
        assert_eq!(out.len(), 1_600);
        assert_eq!(out, vad);
    }
}
