//! Gộp về mono rồi resample (mặc định xuống 16 kHz) bằng rubato (spec §6.2).
//! Chạy ở luồng tiền xử lý, không chạy trong callback thu âm.

use anyhow::{Result, anyhow};
use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler, WindowFunction};

pub const TARGET_RATE: u32 = 16_000;

/// Số khung vào của mỗi khối resample: 10 ms âm thanh vào (spec 2026-10-10 §8, A3; trước là 1024 khung, khoảng 21 ms ở
/// 48 kHz).
/// - Khối 10 ms khớp chu kỳ thường gặp của thiết bị (CoreAudio, WASAPI), nên mỗi lần đọc là ra mẫu ngay, không chờ đủ
///   khối 21 ms.
/// - Khối FFT ra 160 mẫu ở mọi tần số vào thường gặp (48; 44,1; 96 kHz), nên bộ lọc chống alias như nhau: phẳng tới
///   7 kHz (lệch dưới 0,2 dB), −18 dB ở 7,5 kHz, chặn từ 60 dB trên 8 kHz (test bên dưới). Trước đó phẳng tới 7,5 kHz.
/// - Trễ của bộ lọc còn 5 ms (trước 10,7 ms ở 48 kHz, 15 ms ở 44,1 kHz).
/// - Tốn CPU không hơn: 60 giây 48 kHz stereo hết khoảng 12 ms, khối 1024 hết 17–19 ms (`cpu_cost_of_10_ms_blocks`).
///
/// Sàn 160 khung (10 ms tại 16 kHz, spec 2026-10-10 §8 A3): tần số vào dưới 16 kHz (hiếm — chủ yếu tai nghe Bluetooth
/// chế độ đàm thoại, HFP 8 kHz) mới chạm sàn này; không có sàn thì khối chỉ còn `rate/100` điểm, bộ lọc chống alias
/// ngắn đi và cắt vào dải thoại 300–3400 Hz (đo ở 8 kHz, khối 80: lệch đã tới −10 dB ở 3,4 kHz). Ở sàn 160, khối 8 kHz
/// thành 20 ms, trễ bộ lọc 10 ms, phẳng tới khoảng 3,5 kHz (lệch dưới 0,2 dB, cùng tiêu chí ở trên) — giữ trọn dải
/// thoại.
pub(crate) fn block_frames(input_rate: u32) -> usize {
    (input_rate.max(TARGET_RATE) / 100) as usize
}

pub struct MonoResampler {
    channels: usize,
    inner: Option<Fft<f32>>,
    /// Khung dở dang (chưa đủ số kênh) từ lần gọi trước.
    partial: Vec<f32>,
    pending: Vec<f32>,
    scratch: Vec<f32>,
}

impl MonoResampler {
    pub fn new(input_rate: u32, channels: u16) -> Result<Self> {
        Self::to_rate(input_rate, channels, TARGET_RATE)
    }

    /// Như `new`, nhưng ra tần số `output_rate`: chuỗi micro đưa âm thanh lên 48 kHz cho bộ lọc ồn rồi về 16 kHz (spec
    /// 2026-10-24-nguon-micro §5.7). Khối vào vẫn là [`block_frames`].
    pub fn to_rate(input_rate: u32, channels: u16, output_rate: u32) -> Result<Self> {
        Self::with_block(input_rate, channels, output_rate, block_frames(input_rate))
    }

    /// Như `to_rate`, với khối `block` khung vào (test so với khối cũ 1024).
    fn with_block(input_rate: u32, channels: u16, output_rate: u32, block: usize) -> Result<Self> {
        let inner = if input_rate == output_rate {
            None
        } else {
            // sub_chunks = 1: khối FFT đủ lớn để bộ lọc chống alias cắt gần tần số Nyquist của đầu ra.
            Some(
                Fft::<f32>::new_custom(
                    input_rate as usize,
                    output_rate as usize,
                    block,
                    1,
                    1,
                    WindowFunction::BlackmanHarris2,
                    FixedSync::Input,
                )
                .map_err(|e| anyhow!("không tạo được bộ resample: {e}"))?,
            )
        };
        Ok(Self {
            channels: channels.max(1) as usize,
            inner,
            partial: Vec::new(),
            pending: Vec::new(),
            scratch: Vec::new(),
        })
    }

    /// Nhận mẫu xen kẽ theo định dạng thiết bị (không cần chia hết cho số kênh),
    /// ghi thêm mẫu 16 kHz mono vào `out`.
    pub fn process(&mut self, interleaved: &[f32], out: &mut Vec<f32>) -> Result<()> {
        let scale = 1.0 / self.channels as f32;
        let mut input = interleaved;
        if !self.partial.is_empty() {
            let take = (self.channels - self.partial.len()).min(input.len());
            self.partial.extend_from_slice(&input[..take]);
            input = &input[take..];
            if self.partial.len() == self.channels {
                self.pending.push(self.partial.iter().sum::<f32>() * scale);
                self.partial.clear();
            }
        }
        let frames = input.chunks_exact(self.channels);
        let rest = frames.remainder();
        self.pending.extend(frames.map(|f| f.iter().sum::<f32>() * scale));
        self.partial.extend_from_slice(rest);
        let Some(resampler) = self.inner.as_mut() else {
            out.append(&mut self.pending);
            return Ok(());
        };
        let mut start = 0;
        loop {
            let need = resampler.input_frames_next();
            if self.pending.len() - start < need {
                break;
            }
            let cap = resampler.output_frames_max();
            self.scratch.resize(cap, 0.0);
            let input =
                InterleavedSlice::new(&self.pending[start..start + need], 1, need).map_err(|e| anyhow!("{e}"))?;
            let mut output = InterleavedSlice::new_mut(&mut self.scratch, 1, cap).map_err(|e| anyhow!("{e}"))?;
            let (_, written) = match resampler.process_into_buffer(&input, &mut output, None) {
                Ok(v) => v,
                Err(e) => {
                    // Bỏ các khối đã xử lý, để lần gọi sau không phát lại chúng.
                    self.pending.drain(..start);
                    return Err(anyhow!("resample lỗi: {e}"));
                }
            };
            out.extend_from_slice(&self.scratch[..written]);
            start += need;
        }
        self.pending.drain(..start);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(rate: u32, channels: u16, freq: f32, seconds: f32) -> Vec<f32> {
        let n = (rate as f32 * seconds) as usize;
        (0..n)
            .flat_map(|i| {
                let v = 0.5 * (2.0 * std::f32::consts::PI * freq * i as f32 / rate as f32).sin();
                std::iter::repeat_n(v, channels as usize)
            })
            .collect()
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
    }

    /// Chuỗi micro (spec 2026-10-24-nguon-micro §5.7) đưa âm thanh lên 48 kHz cho bộ lọc ồn rồi về 16 kHz: số mẫu đúng tỉ
    /// lệ (trừ phần trễ của bộ lọc, dưới 10 ms) và mức tín hiệu giữ nguyên.
    #[test]
    fn mono_audio_goes_up_to_48k_and_back() {
        let tone = sine(16_000, 1, 1_000.0, 1.0);
        let mut up = MonoResampler::to_rate(16_000, 1, 48_000).unwrap();
        let mut at48 = Vec::new();
        up.process(&tone, &mut at48).unwrap();
        assert!((47_520..=48_000).contains(&at48.len()), "{}", at48.len());
        let mut down = MonoResampler::to_rate(48_000, 1, 16_000).unwrap();
        let mut back = Vec::new();
        down.process(&at48, &mut back).unwrap();
        assert!((15_680..=16_000).contains(&back.len()), "{}", back.len());
        let (a, b) = (rms(&tone[4_000..12_000]), rms(&back[4_000..12_000]));
        assert!((20.0 * (b / a).log10()).abs() < 0.5, "{a} {b}");
    }

    #[test]
    fn the_same_rate_passes_through() {
        let mut r = MonoResampler::to_rate(48_000, 2, 48_000).unwrap();
        let mut out = Vec::new();
        r.process(&[0.25, 0.75, 0.5, 1.0], &mut out).unwrap();
        assert_eq!(out, [0.5, 0.75]);
    }

    #[test]
    fn stereo_48k_becomes_mono_16k_with_same_pitch_and_level() {
        let mut r = MonoResampler::new(48_000, 2).unwrap();
        let mut out = Vec::new();
        r.process(&sine(48_000, 2, 440.0, 1.0), &mut out).unwrap();
        assert!(out.len() > 15_000 && out.len() <= 16_000, "len = {}", out.len());
        // Bỏ phần khởi động của bộ lọc rồi so mức và tần số.
        let steady = &out[2_000..];
        assert!((rms(steady) - 0.5 / 2f32.sqrt()).abs() < 0.02);
        let crossings = steady.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count() as f32;
        let hz = crossings / (steady.len() as f32 / 16_000.0);
        assert!((hz - 440.0).abs() < 5.0, "hz = {hz}");
    }

    /// Mức (dB) của sóng sin `freq` sau khi resample từ `rate` stereo, so với mức vào; bỏ phần khởi động của bộ lọc.
    fn gain_db(rate: u32, freq: f32) -> f32 {
        let mut r = MonoResampler::new(rate, 2).unwrap();
        let mut out = Vec::new();
        r.process(&sine(rate, 2, freq, 1.0), &mut out).unwrap();
        let steady = &out[4_000..out.len() - 100];
        20.0 * (rms(steady) / (0.5 / 2f32.sqrt())).log10()
    }

    #[test]
    fn blocks_are_10_ms_of_input() {
        assert_eq!(block_frames(48_000), 480);
        assert_eq!(block_frames(44_100), 441);
        assert_eq!(block_frames(96_000), 960);
        assert_eq!(block_frames(8_000), 160); // chạm sàn: 8 kHz < 16 kHz
        assert_eq!(block_frames(50), 160); // chạm sàn: 50 Hz < 16 kHz
    }

    /// A3: khối 10 ms vẫn giữ nguyên dải tiếng nói và chặn alias, ở các tần số vào thường gặp.
    #[test]
    fn speech_band_is_flat_and_aliases_are_rejected() {
        for rate in [48_000, 44_100, 96_000] {
            for freq in [1_000.0, 6_000.0, 7_000.0] {
                let db = gain_db(rate, freq);
                assert!(db.abs() < 0.3, "{rate} Hz, {freq} Hz: {db:.2} dB");
            }
            for freq in [9_000.0, 12_000.0] {
                let db = gain_db(rate, freq);
                assert!(db < -55.0, "{rate} Hz, {freq} Hz: {db:.2} dB");
            }
        }
    }

    /// A3: sàn 160 khung giữ dải thoại 300–3400 Hz ở 8 kHz (tai nghe Bluetooth HFP) — không có sàn, khối chỉ 80 điểm sẽ
    /// cắt mất phần trên của dải này (đo được lệch tới −10 dB ở 3,4 kHz).
    #[test]
    fn the_8khz_floor_keeps_the_narrowband_speech_range() {
        let db = gain_db(8_000, 3_400.0);
        assert!(db.abs() < 0.3, "8000 Hz, 3400 Hz: {db:.2} dB");
    }

    /// A3: trễ của bộ lọc khoảng 5 ms (đỉnh xung lệch 80 mẫu 16 kHz), trước là 171 mẫu (10,7 ms) ở 48 kHz.
    #[test]
    fn the_filter_delay_is_about_5_ms() {
        for rate in [48_000u32, 44_100] {
            let mut r = MonoResampler::new(rate, 1).unwrap();
            let mut input = vec![0.0f32; rate as usize];
            input[rate as usize / 2] = 1.0;
            let mut out = Vec::new();
            r.process(&input, &mut out).unwrap();
            let peak = out
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.abs().total_cmp(&b.1.abs()))
                .unwrap()
                .0;
            let delay = peak as i64 - 8_000;
            assert!((76..=84).contains(&delay), "{rate} Hz: trễ {delay} mẫu");
        }
    }

    /// A3, điều kiện "CPU không tăng đáng kể": in thời gian resample 60 giây 48 kHz stereo với khối 10 ms và khối cũ
    /// 1024, theo các lần đọc 10 ms như thiết bị. Chạy tay ở bản release:
    /// `cargo test --release -p audio-capture cpu_cost_of_10_ms_blocks -- --ignored --nocapture`.
    #[test]
    #[ignore = "đo thời gian, chạy tay ở bản release"]
    fn cpu_cost_of_10_ms_blocks() {
        let input = sine(48_000, 2, 440.0, 60.0);
        let time = |block: usize| {
            let mut r = MonoResampler::with_block(48_000, 2, TARGET_RATE, block).unwrap();
            let mut out = Vec::new();
            let started = std::time::Instant::now();
            for piece in input.chunks(960) {
                r.process(piece, &mut out).unwrap();
            }
            started.elapsed()
        };
        let (new, old) = (time(block_frames(48_000)), time(1024));
        println!("60 giây 48 kHz stereo: khối 10 ms {new:?}, khối 1024 {old:?}");
        assert!(new < old * 2, "khối 10 ms tốn hơn gấp đôi khối 1024");
    }

    #[test]
    fn mono_16k_passes_through() {
        let mut r = MonoResampler::new(16_000, 1).unwrap();
        let input = sine(16_000, 1, 300.0, 0.1);
        let mut out = Vec::new();
        r.process(&input, &mut out).unwrap();
        assert_eq!(out, input);
    }
}
