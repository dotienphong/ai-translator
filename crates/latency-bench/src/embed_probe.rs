//! Lệnh `embed-probe` (kế hoạch 01 phân biệt người nói, Task 9b): nhúng lặp lại một đoạn WAV bằng `Embedder` để đo thời gian
//! và CPU mỗi lần nhúng; RSS đỉnh đo bên ngoài bằng `/usr/bin/time -l`. Chỉ đọc đúng đoạn cần đo khỏi WAV (không nạp cả file),
//! để RSS đỉnh không gồm bộ nhớ của file.

use std::path::PathBuf;
use std::time::Instant;

use anyhow::{Result, anyhow, ensure};
use clap::Args;
use speaker_worker::embed::{Embedder, MAX_SAMPLES, MIN_SAMPLES, cosine};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use crate::speaker_eval::seconds_to_samples;
use crate::stats::percentile;

const RATE: u32 = 16_000;

#[derive(Args)]
pub struct EmbedProbeArgs {
    /// WAV 16 kHz (gộp về mono).
    #[arg(long)]
    wav: PathBuf,
    /// Model nhúng giọng (file ONNX ERes2Net do `prepare_model.py` tạo).
    #[arg(long)]
    speaker_model: PathBuf,
    /// Giây bắt đầu của đoạn trong WAV.
    #[arg(long)]
    start_s: f64,
    /// Độ dài đoạn (giây).
    #[arg(long)]
    seconds: f64,
    /// Số lần nhúng liên tiếp trên cùng đoạn (≥ 1).
    #[arg(long)]
    repeat: usize,
    /// Nhúng theo cửa sổ dài chừng này giây (`Embedder::embed_windowed`) thay vì cả đoạn (`Embedder::embed`).
    #[arg(long)]
    window_s: Option<f64>,
    /// Sau vòng đo, nhúng cả đoạn bằng `embed` và in cosine với nhúng theo cửa sổ (cần `--window-s`). Lượt nhúng thêm này tốn
    /// bộ nhớ của cả đoạn, nên RSS đỉnh của lần chạy có cờ này không dùng để so.
    #[arg(long, requires = "window_s")]
    cosine: bool,
}

/// Mẫu bắt đầu (khung tua của WAV), số mẫu của đoạn và số mẫu của cửa sổ, từ các cờ tính bằng giây. Đoạn phải dài từ
/// `MIN_SAMPLES` tới `MAX_SAMPLES` (8 s): `embed` chỉ dùng 8 s đầu, nên đoạn dài hơn sẽ làm sai độ dài và % CPU in ra.
fn segment_samples(start_s: f64, seconds: f64, window_s: Option<f64>) -> Result<(u32, usize, Option<usize>)> {
    let start = seconds_to_samples(start_s, "--start-s", 0, usize::MAX)?;
    let start = u32::try_from(start).map_err(|_| anyhow!("--start-s quá lớn: {start_s} s"))?;
    let len = seconds_to_samples(seconds, "--seconds", MIN_SAMPLES, MAX_SAMPLES)?;
    let window = window_s
        .map(|w| seconds_to_samples(w, "--window-s", MIN_SAMPLES, usize::MAX))
        .transpose()?;
    Ok((start, len, window))
}

/// Thời gian CPU (user + sys) đã dùng của chính tiến trình này (mọi luồng), qua `sysinfo` như `latency.rs` (macOS, Windows,
/// Linux), độ phân giải 1 ms.
struct ProcessCpu {
    sys: System,
    pid: Pid,
}

impl ProcessCpu {
    fn new() -> Result<Self> {
        let pid = sysinfo::get_current_pid().map_err(|e| anyhow!("không lấy được pid: {e}"))?;
        Ok(Self {
            sys: System::new(),
            pid,
        })
    }

    /// CPU tích lũy (ms) từ lúc tiến trình khởi động; `None` khi không đọc được.
    fn ms(&mut self) -> Option<f64> {
        self.sys.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[self.pid]),
            false,
            ProcessRefreshKind::nothing().with_cpu(),
        );
        self.sys.process(self.pid).map(|p| p.accumulated_cpu_time() as f64)
    }
}

pub fn run(args: EmbedProbeArgs) -> Result<()> {
    ensure!(args.repeat >= 1, "--repeat phải ≥ 1");
    let (start_frame, len, window) = segment_samples(args.start_s, args.seconds, args.window_s)?;
    let (samples, rate) = crate::wavio::read_wav_mono_range(&args.wav, start_frame, len)?;
    ensure!(rate == RATE, "{}: cần WAV 16 kHz, nhận {rate} Hz", args.wav.display());
    ensure!(
        samples.len() == len,
        "{}: đoạn [{}, {}) s vượt cuối file (chỉ đọc được {} mẫu)",
        args.wav.display(),
        args.start_s,
        args.start_s + args.seconds,
        samples.len()
    );
    let embedder = Embedder::load(&args.speaker_model)?;
    let embed = |x: &[f32]| match window {
        Some(w) => embedder.embed_windowed(x, w),
        None => embedder.embed(x),
    };

    let mut ms = Vec::with_capacity(args.repeat);
    let mut last = Vec::new();
    let mut cpu = ProcessCpu::new()?;
    let cpu_before = cpu.ms();
    for _ in 0..args.repeat {
        let t0 = Instant::now();
        last = embed(&samples)?;
        ms.push(t0.elapsed().as_secs_f64() as f32 * 1000.0);
    }
    let cpu_after = cpu.ms();

    let mut line = format!(
        "độ dài {} s, {} lần; p50 {:.1} ms, p90 {:.1} ms",
        args.seconds,
        args.repeat,
        percentile(&ms, 50.0).unwrap_or(0.0),
        percentile(&ms, 90.0).unwrap_or(0.0),
    );
    match (cpu_before, cpu_after) {
        (Some(a), Some(b)) => {
            let per = (b - a) / args.repeat as f64;
            line += &format!(
                "; CPU {per:.1} ms mỗi lần ({:.1}% một lõi so với độ dài đoạn)",
                per / (args.seconds * 10.0)
            );
        }
        _ => line += "; không đọc được CPU của tiến trình",
    }
    if args.cosine {
        let whole = embedder.embed(&samples)?;
        line += &format!("; cosine so với nhúng cả đoạn: {:.6}", cosine(&last, &whole));
    }
    println!("{line}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segment_samples_accepts_up_to_max_samples_and_rejects_bad_values() {
        assert_eq!(
            segment_samples(120.0, 8.0, None).unwrap(),
            (1_920_000, MAX_SAMPLES, None)
        );
        assert_eq!(segment_samples(0.0, 2.0, Some(1.0)).unwrap(), (0, 32_000, Some(16_000)));
        // `embed` chỉ dùng 8 s đầu: đoạn dài hơn thì dòng in (độ dài, % CPU) sẽ sai, nên từ chối.
        let err = segment_samples(120.0, 8.5, None).unwrap_err().to_string();
        assert!(err.contains("--seconds") && err.contains("8 s"), "{err}");
        assert!(segment_samples(120.0, 0.4, None).is_err());
        assert!(segment_samples(-1.0, 2.0, None).is_err());
        assert!(segment_samples(f64::NAN, 2.0, None).is_err());
        assert!(segment_samples(0.0, 2.0, Some(0.25)).is_err());
        // Khung bắt đầu phải vừa `u32` (vị trí tua của WAV).
        assert!(segment_samples(400_000.0, 2.0, None).is_err());
    }

    #[test]
    fn process_cpu_time_grows_with_work() {
        let mut cpu = ProcessCpu::new().unwrap();
        let a = cpu.ms().unwrap();
        let mut x = 0u64;
        let t0 = Instant::now();
        while t0.elapsed().as_millis() < 50 {
            x = std::hint::black_box(x.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1));
        }
        let b = cpu.ms().unwrap();
        assert!(b - a >= 20.0, "CPU tăng {} ms sau 50 ms bận", b - a);
    }
}
