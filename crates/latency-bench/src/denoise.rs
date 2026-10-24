//! `latency-bench denoise` (spec 2026-10-24-nguon-micro §5.7 lớp 2, §6.3): lọc ồn micro bằng RNNoise (`nnnoiseless`) cho
//! bản VAD. Đọc `mic-raw.wav` (tần số của thiết bị, do `capture --mic` ghi), đưa về 48 kHz, lọc từng khung 10 ms, đưa về
//! 16 kHz, căn thẳng hàng với `mic.wav` và ghi WAV 16 kHz mono 16-bit dài bằng `mic.wav`. In thêm chi phí CPU (thời gian xử
//! lý chia thời lượng âm thanh).

use crate::wavio::{best_lag, read_wav_mono, resample, shift, write_wav_f32, write_wav16};
use anyhow::Result;
use std::path::PathBuf;
use std::time::Instant;

#[derive(clap::Args)]
pub struct DenoiseArgs {
    /// `mic-raw.wav` của cảnh.
    #[arg(long)]
    input: PathBuf,
    /// `mic.wav` của cảnh: đầu ra được căn thẳng hàng với file này và dài bằng nó.
    #[arg(long)]
    reference: PathBuf,
    /// WAV kết quả, ví dụ `mic-rnnoise.wav`.
    #[arg(long)]
    out: PathBuf,
    /// Ghi thêm bản 48 kHz chưa lọc (đầu vào cho DeepFilterNet), để hai bộ lọc nhận cùng một đầu vào.
    #[arg(long)]
    write_48k: Option<PathBuf>,
}

/// RNNoise trên âm thanh 48 kHz trong [-1, 1]. Khung đầu có tiếng "fade-in" của mạng nên được thay bằng im lặng (khuyến
/// nghị của `nnnoiseless`). Độ dài ra bằng độ dài vào.
pub fn rnnoise(input: &[f32]) -> Vec<f32> {
    use nnnoiseless::DenoiseState;
    const N: usize = DenoiseState::FRAME_SIZE;
    let mut state = DenoiseState::new();
    let mut out = Vec::with_capacity(input.len() + N);
    let (mut frame_in, mut frame_out) = ([0f32; N], [0f32; N]);
    for (i, chunk) in input.chunks(N).enumerate() {
        frame_in.fill(0.0);
        // nnnoiseless nhận mẫu theo thang 16 bit.
        for (d, s) in frame_in.iter_mut().zip(chunk) {
            *d = s * 32_768.0;
        }
        state.process_frame(&mut frame_out, &frame_in);
        if i == 0 {
            out.extend(std::iter::repeat_n(0.0, N));
        } else {
            out.extend(frame_out.iter().map(|v| (v / 32_768.0).clamp(-1.0, 1.0)));
        }
    }
    out.truncate(input.len());
    out
}

pub fn run(args: DenoiseArgs) -> Result<()> {
    let (raw, rate) = read_wav_mono(&args.input)?;
    let at48 = resample(&raw, rate, 48_000)?;
    if let Some(path) = &args.write_48k {
        write_wav_f32(path, &at48, 48_000)?;
    }
    let started = Instant::now();
    let denoised = rnnoise(&at48);
    let cost = started.elapsed().as_secs_f64() / (at48.len() as f64 / 48_000.0);
    println!(
        "RNNoise: {:.2}% một nhân (thời gian xử lý / thời lượng âm thanh)",
        cost * 100.0
    );
    let (reference, _) = read_wav_mono(&args.reference)?;
    let at16 = resample(&denoised, 48_000, 16_000)?;
    let lag = best_lag(&reference, &at16, 8_000);
    println!("lệch so với {}: {lag} mẫu, đã bù", args.reference.display());
    write_wav16(&args.out, &shift(at16, lag, reference.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    #[test]
    fn output_has_the_input_length_and_the_first_frame_is_silent() {
        let input = vec![0.1f32; 48_000];
        let out = rnnoise(&input);
        assert_eq!(out.len(), input.len());
        assert!(out[..480].iter().all(|&v| v == 0.0));
    }

    /// Tiếng ồn nền nhỏ và đều (−60 dBFS) bị hạ mạnh sau khi mạng thích nghi. Tiếng ồn trắng to (−25 dBFS) thì RNNoise
    /// chỉ hạ còn khoảng 70% (đo khi viết lệnh này), vì nó lấn vào dải tiếng nói: mức lọc thật trên tiếng gõ phím, tiếng
    /// bút đo ở kế hoạch nguồn micro 01, Task 19.
    #[test]
    fn quiet_steady_noise_is_strongly_reduced() {
        let mut state = 7u32;
        let noise: Vec<f32> = (0..192_000)
            .map(|_| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                ((state >> 8) as f32 / (1u32 << 24) as f32 - 0.5) * 0.002
            })
            .collect();
        let out = rnnoise(&noise);
        let tail = 96_000..192_000;
        assert!(
            rms(&out[tail.clone()]) < 0.1 * rms(&noise[tail]),
            "{} / {}",
            rms(&out[96_000..]),
            rms(&noise[96_000..])
        );
    }
}
