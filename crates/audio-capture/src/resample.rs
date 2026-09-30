//! Gộp về mono rồi resample xuống 16 kHz bằng rubato (spec §6.2).
//! Chạy ở luồng tiền xử lý, không chạy trong callback thu âm.

use anyhow::{Result, anyhow};
use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler, WindowFunction};

pub const TARGET_RATE: u32 = 16_000;
const CHUNK: usize = 1024;

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
        let inner = if input_rate == TARGET_RATE {
            None
        } else {
            // sub_chunks = 1: khối FFT đủ lớn để bộ lọc chống alias cắt gần 8 kHz.
            Some(
                Fft::<f32>::new_custom(
                    input_rate as usize,
                    TARGET_RATE as usize,
                    CHUNK,
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
            let (_, written) = resampler
                .process_into_buffer(&input, &mut output, None)
                .map_err(|e| anyhow!("resample lỗi: {e}"))?;
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

    #[test]
    fn mono_16k_passes_through() {
        let mut r = MonoResampler::new(16_000, 1).unwrap();
        let input = sine(16_000, 1, 300.0, 0.1);
        let mut out = Vec::new();
        r.process(&input, &mut out).unwrap();
        assert_eq!(out, input);
    }
}
