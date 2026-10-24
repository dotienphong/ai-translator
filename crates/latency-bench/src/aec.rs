//! `latency-bench aec` (spec 2026-10-24-nguon-micro §6.3, phương án C): khử vọng micro bằng AEC3 của `sonora`, dùng
//! `playback.wav` làm tham chiếu. Cả hai ở 16 kHz, khung 10 ms; mỗi khung xử lý render trước rồi capture, như hướng dẫn
//! của `sonora`. Ghi `mic-aec.wav` dài bằng `mic.wav`.

use crate::wavio::{read_wav_mono, write_wav16};
use anyhow::{Result, anyhow, bail};
use std::path::PathBuf;
use std::time::Instant;

#[derive(clap::Args)]
pub struct AecArgs {
    /// `playback.wav` của cảnh (tham chiếu).
    #[arg(long)]
    playback: PathBuf,
    /// `mic.wav` của cảnh.
    #[arg(long)]
    mic: PathBuf,
    /// WAV kết quả, ví dụ `mic-aec.wav`.
    #[arg(long)]
    out: PathBuf,
    /// Độ trễ ước lượng giữa phát và thu (ms, 0–500); lấy từ đo độ trễ vọng ở `score_mix.py --echo-delay`.
    #[arg(long, default_value_t = 0)]
    delay_ms: i32,
}

/// Khử vọng `mic` theo tham chiếu `playback` (cùng 16 kHz). Độ dài ra bằng `mic`.
pub fn cancel(playback: &[f32], mic: &[f32], delay_ms: i32) -> Result<Vec<f32>> {
    use sonora::config::EchoCanceller;
    use sonora::{AudioProcessing, Config, StreamConfig};
    const N: usize = 160;
    let config = Config {
        echo_canceller: Some(EchoCanceller::default()),
        ..Default::default()
    };
    let mut apm = AudioProcessing::builder()
        .config(config)
        .capture_config(StreamConfig::new(16_000, 1))
        .render_config(StreamConfig::new(16_000, 1))
        .build();
    let mut out = Vec::with_capacity(mic.len() + N);
    let (mut render_out, mut capture_out) = ([0f32; N], [0f32; N]);
    for i in 0..mic.len().div_ceil(N) {
        let mut render = [0f32; N];
        let mut capture = [0f32; N];
        for j in 0..N {
            render[j] = playback.get(i * N + j).copied().unwrap_or(0.0);
            capture[j] = mic.get(i * N + j).copied().unwrap_or(0.0);
        }
        apm.process_render_f32(&[&render], &mut [&mut render_out])
            .map_err(|e| anyhow!("render: {e:?}"))?;
        // Bị kẹp vào [0, 500] thì sonora báo lỗi nhưng vẫn xử lý: bỏ qua lỗi này.
        let _ = apm.set_stream_delay_ms(delay_ms);
        apm.process_capture_f32(&[&capture], &mut [&mut capture_out])
            .map_err(|e| anyhow!("capture: {e:?}"))?;
        out.extend_from_slice(&capture_out);
    }
    out.truncate(mic.len());
    Ok(out)
}

pub fn run(args: AecArgs) -> Result<()> {
    let (playback, p_rate) = read_wav_mono(&args.playback)?;
    let (mic, m_rate) = read_wav_mono(&args.mic)?;
    if p_rate != 16_000 || m_rate != 16_000 {
        bail!("playback và mic phải là 16 kHz");
    }
    let started = Instant::now();
    let out = cancel(&playback, &mic, args.delay_ms)?;
    let cost = started.elapsed().as_secs_f64() / (mic.len() as f64 / 16_000.0);
    println!(
        "AEC3: {:.2}% một nhân (thời gian xử lý / thời lượng âm thanh)",
        cost * 100.0
    );
    write_wav16(&args.out, &out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    #[test]
    fn a_pure_echo_is_strongly_reduced() {
        // Tham chiếu: tiếng ồn 6 giây. Micro: tiếng vọng = tham chiếu trễ 40 ms, nhỏ đi một nửa; không có giọng gần.
        let mut state = 99u32;
        let playback: Vec<f32> = (0..96_000)
            .map(|_| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                ((state >> 8) as f32 / (1u32 << 24) as f32 - 0.5) * 0.4
            })
            .collect();
        let mut mic = vec![0.0f32; 640];
        mic.extend(playback.iter().map(|v| v * 0.5));
        mic.truncate(playback.len());
        let out = cancel(&playback, &mic, 40).unwrap();
        assert_eq!(out.len(), mic.len());
        let tail = 64_000..96_000;
        assert!(
            rms(&out[tail.clone()]) < 0.3 * rms(&mic[tail]),
            "{} / {}",
            rms(&out[64_000..]),
            rms(&mic[64_000..])
        );
    }
}
