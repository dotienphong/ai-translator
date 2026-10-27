//! Đọc, ghi WAV và căn thẳng hàng hai bản thu cho các lệnh đo của spike nguồn micro (spec 2026-10-24-nguon-micro §6.3).

use anyhow::{Context, Result, anyhow, bail};
use std::path::{Path, PathBuf};

type WavFileReader = hound::WavReader<std::io::BufReader<std::fs::File>>;

/// Đọc WAV bất kỳ tần số (16 hay 24 bit nguyên, hay 32 bit thực), gộp các kênh về mono. Trả mẫu trong [-1, 1] và tần số.
pub fn read_wav_mono(path: &Path) -> Result<(Vec<f32>, u32)> {
    let reader = hound::WavReader::open(path).with_context(|| format!("không mở được {}", path.display()))?;
    read_frames(reader, path, usize::MAX)
}

/// Như `read_wav_mono` nhưng chỉ đọc `frames` khung (mỗi khung một mẫu mỗi kênh) từ khung `start_frame`, không nạp cả file
/// vào bộ nhớ. Khoảng vượt cuối file thì chỉ trả phần còn lại; `start_frame` sau cuối file là lỗi.
pub fn read_wav_mono_range(path: &Path, start_frame: u32, frames: usize) -> Result<(Vec<f32>, u32)> {
    let mut reader = hound::WavReader::open(path).with_context(|| format!("không mở được {}", path.display()))?;
    let duration = reader.duration();
    if start_frame > duration {
        bail!(
            "{}: khung bắt đầu {start_frame} nằm sau cuối file ({duration} khung)",
            path.display()
        );
    }
    reader
        .seek(start_frame)
        .with_context(|| format!("không tua được {} tới khung {start_frame}", path.display()))?;
    read_frames(reader, path, frames)
}

/// Đọc tối đa `frames` khung từ vị trí hiện tại của `reader`, gộp các kênh về mono.
fn read_frames(mut reader: WavFileReader, path: &Path, frames: usize) -> Result<(Vec<f32>, u32)> {
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;
    let n = frames.saturating_mul(channels);
    let interleaved: Vec<f32> = match (spec.sample_format, spec.bits_per_sample) {
        (hound::SampleFormat::Float, 32) => reader.samples::<f32>().take(n).collect::<Result<_, _>>()?,
        (hound::SampleFormat::Int, 16) => reader
            .samples::<i16>()
            .take(n)
            .map(|s| s.map(|v| v as f32 / 32_768.0))
            .collect::<Result<_, _>>()?,
        (hound::SampleFormat::Int, 24) => reader
            .samples::<i32>()
            .take(n)
            .map(|s| s.map(|v| v as f32 / 8_388_608.0))
            .collect::<Result<_, _>>()?,
        (format, bits) => bail!("{}: định dạng {format:?} {bits} bit chưa hỗ trợ", path.display()),
    };
    let mono = interleaved
        .chunks_exact(channels)
        .map(|f| f.iter().sum::<f32>() / channels as f32)
        .collect();
    Ok((mono, spec.sample_rate))
}

/// Ghi WAV 16 kHz mono 16-bit (định dạng của `mic.wav`, `playback.wav`).
pub fn write_wav16(path: &Path, samples: &[f32]) -> Result<()> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16_000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut w = hound::WavWriter::create(path, spec).with_context(|| format!("không tạo được {}", path.display()))?;
    for &s in samples {
        w.write_sample((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)?;
    }
    w.finalize()?;
    Ok(())
}

/// Ghi WAV mono float32 ở tần số `rate` (đầu vào 48 kHz cho DeepFilterNet).
pub fn write_wav_f32(path: &Path, samples: &[f32], rate: u32) -> Result<()> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut w = hound::WavWriter::create(path, spec).with_context(|| format!("không tạo được {}", path.display()))?;
    for &s in samples {
        w.write_sample(s)?;
    }
    w.finalize()?;
    Ok(())
}

/// Resample cả một đoạn mono (bộ lọc FFT của `rubato`, như app). Bù độ trễ của bộ lọc; độ dài ra = độ dài vào × to / from.
pub fn resample(input: &[f32], from: u32, to: u32) -> Result<Vec<f32>> {
    use rubato::audioadapter_buffers::direct::InterleavedSlice;
    use rubato::{Fft, FixedSync, Resampler, WindowFunction};
    if from == to {
        return Ok(input.to_vec());
    }
    let block = (from / 100) as usize;
    let mut r = Fft::<f32>::new_custom(
        from as usize,
        to as usize,
        block,
        1,
        1,
        WindowFunction::BlackmanHarris2,
        FixedSync::Input,
    )
    .map_err(|e| anyhow!("không tạo được bộ resample: {e}"))?;
    let delay = r.output_delay();
    let mut padded = input.to_vec();
    padded.resize(input.len().div_ceil(block) * block + 2 * block, 0.0);
    let mut out = Vec::with_capacity(padded.len() * to as usize / from as usize + block);
    let mut scratch = vec![0f32; r.output_frames_max()];
    for chunk in padded.chunks_exact(block) {
        let inp = InterleavedSlice::new(chunk, 1, block).map_err(|e| anyhow!("{e}"))?;
        let cap = scratch.len();
        let mut outp = InterleavedSlice::new_mut(&mut scratch, 1, cap).map_err(|e| anyhow!("{e}"))?;
        let (_, written) = r
            .process_into_buffer(&inp, &mut outp, None)
            .map_err(|e| anyhow!("resample lỗi: {e}"))?;
        out.extend_from_slice(&scratch[..written]);
    }
    let want = input.len() * to as usize / from as usize;
    Ok(out.into_iter().skip(delay).take(want).collect())
}

/// Độ lệch (mẫu, bội của 16) của `signal` so với `reference`: `signal[n + lag] ≈ reference[n]`. Tìm trong
/// [−max_lag, max_lag] trên đường bao biên độ (trung bình |x| mỗi 1 ms) của 60 giây đầu.
pub fn best_lag(reference: &[f32], signal: &[f32], max_lag: usize) -> isize {
    const HOP: usize = 16;
    let envelope = |x: &[f32]| -> Vec<f32> {
        x.chunks(HOP)
            .take(60_000)
            .map(|c| c.iter().map(|v| v.abs()).sum::<f32>() / c.len() as f32)
            .collect()
    };
    let (r, s) = (envelope(reference), envelope(signal));
    let mean = |v: &[f32]| v.iter().sum::<f32>() / v.len().max(1) as f32;
    let (mr, ms) = (mean(&r), mean(&s));
    let max = (max_lag / HOP) as isize;
    let mut best = (0isize, f32::MIN);
    for lag in -max..=max {
        let (r0, s0) = if lag >= 0 {
            (0, lag as usize)
        } else {
            ((-lag) as usize, 0)
        };
        let n = r.len().saturating_sub(r0).min(s.len().saturating_sub(s0));
        if n == 0 {
            continue;
        }
        let score = (0..n).map(|i| (r[r0 + i] - mr) * (s[s0 + i] - ms)).sum::<f32>() / n as f32;
        if score > best.1 {
            best = (lag, score);
        }
    }
    best.0 * HOP as isize
}

/// Bù độ lệch tìm bằng [`best_lag`] rồi cắt hay đệm số 0 cho đủ `len` mẫu.
pub fn shift(signal: Vec<f32>, lag: isize, len: usize) -> Vec<f32> {
    let mut out: Vec<f32> = if lag >= 0 {
        signal.into_iter().skip(lag as usize).collect()
    } else {
        std::iter::repeat_n(0.0, (-lag) as usize).chain(signal).collect()
    };
    out.resize(len, 0.0);
    out
}

/// `latency-bench align`: căn một bản đã xử lý ngoài (ví dụ đầu ra của DeepFilterNet) thẳng hàng với `mic.wav`.
#[derive(clap::Args)]
pub struct AlignArgs {
    /// WAV chuẩn 16 kHz mono (`mic.wav` của cảnh).
    #[arg(long)]
    reference: PathBuf,
    /// WAV cần căn, tần số bất kỳ.
    #[arg(long)]
    input: PathBuf,
    /// WAV 16 kHz mono 16-bit, dài bằng `--reference`.
    #[arg(long)]
    out: PathBuf,
    #[arg(long, default_value_t = 500)]
    max_lag_ms: usize,
}

pub fn run_align(args: AlignArgs) -> Result<()> {
    let (reference, rate) = read_wav_mono(&args.reference)?;
    if rate != 16_000 {
        bail!("{} phải là 16 kHz", args.reference.display());
    }
    let (input, input_rate) = read_wav_mono(&args.input)?;
    let input = resample(&input, input_rate, 16_000)?;
    let lag = best_lag(&reference, &input, args.max_lag_ms * 16);
    println!("lệch {lag} mẫu ({} ms), đã bù", lag / 16);
    write_wav16(&args.out, &shift(input, lag, reference.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Tín hiệu giả ngẫu nhiên có đường bao thay đổi (các đợt tiếng ồn), tất định.
    fn bursts(n: usize) -> Vec<f32> {
        let mut state = 12345u32;
        (0..n)
            .map(|i| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                let noise = (state >> 8) as f32 / (1u32 << 24) as f32 - 0.5;
                if (i / 2_000) % 3 == 0 {
                    noise * 0.6
                } else {
                    noise * 0.02
                }
            })
            .collect()
    }

    #[test]
    fn best_lag_finds_a_delay_and_an_advance() {
        let reference = bursts(160_000);
        let mut delayed = vec![0.0; 320];
        delayed.extend_from_slice(&reference);
        assert_eq!(best_lag(&reference, &delayed, 8_000), 320);
        assert_eq!(best_lag(&delayed, &reference, 8_000), -320);
    }

    #[test]
    fn shift_undoes_the_lag() {
        let x: Vec<f32> = (0..10).map(|i| i as f32).collect();
        assert_eq!(
            shift(x.clone(), 2, 10),
            vec![2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 0.0, 0.0]
        );
        assert_eq!(shift(x, -2, 5), vec![0.0, 0.0, 0.0, 1.0, 2.0]);
    }

    #[test]
    fn resample_keeps_pitch_level_and_length() {
        let input: Vec<f32> = (0..48_000)
            .map(|i| 0.5 * (2.0 * std::f32::consts::PI * 1_000.0 * i as f32 / 48_000.0).sin())
            .collect();
        let out = resample(&input, 48_000, 16_000).unwrap();
        assert_eq!(out.len(), 16_000);
        let rms = |x: &[f32]| (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt();
        let ratio = rms(&out[1_000..15_000]) / rms(&input);
        assert!((0.98..=1.02).contains(&ratio), "{ratio}");
        assert_eq!(resample(&input, 48_000, 48_000).unwrap(), input);
    }

    #[test]
    fn wav16_round_trip() {
        let dir = std::env::temp_dir().join(format!("wavio-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.wav");
        write_wav16(&path, &[0.0, 0.5, -0.5]).unwrap();
        let (x, rate) = read_wav_mono(&path).unwrap();
        assert_eq!(rate, 16_000);
        assert!((x[1] - 0.5).abs() < 1e-3 && (x[2] + 0.5).abs() < 1e-3);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_wav_mono_range_reads_only_the_requested_frames() {
        let dir = std::env::temp_dir().join(format!("wavio-range-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.wav");
        let x: Vec<f32> = (0..100).map(|i| i as f32 / 200.0).collect();
        write_wav16(&path, &x).unwrap();
        let (all, _) = read_wav_mono(&path).unwrap();

        let (part, rate) = read_wav_mono_range(&path, 10, 5).unwrap();
        assert_eq!(rate, 16_000);
        assert_eq!(part, all[10..15]);
        // Khoảng vượt cuối file: chỉ phần còn lại.
        assert_eq!(read_wav_mono_range(&path, 95, 50).unwrap().0, all[95..]);
        // Bắt đầu đúng ở cuối file: không lỗi, không có mẫu nào.
        assert_eq!(read_wav_mono_range(&path, 100, 5).unwrap().0, Vec::<f32>::new());
        // Bắt đầu sau cuối file: lỗi, nêu tên file.
        let err = read_wav_mono_range(&path, 101, 5).unwrap_err();
        assert!(format!("{err:#}").contains("x.wav"), "{err:#}");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_wav_mono_range_counts_frames_not_samples_in_a_stereo_file() {
        let dir = std::env::temp_dir().join(format!("wavio-range-stereo-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("stereo.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 16_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut w = hound::WavWriter::create(&path, spec).unwrap();
        // Khung i: trái 100·i, phải 300·i; mono là trung bình 200·i.
        for i in 0..50i16 {
            w.write_sample(100 * i).unwrap();
            w.write_sample(300 * i).unwrap();
        }
        w.finalize().unwrap();

        let (part, _) = read_wav_mono_range(&path, 10, 5).unwrap();
        let expected: Vec<f32> = (10..15).map(|i| (200 * i) as f32 / 32_768.0).collect();
        assert_eq!(
            part, expected,
            "tua và đọc theo khung (mỗi khung hai mẫu), không theo mẫu"
        );
        assert_eq!(read_wav_mono_range(&path, 48, 10).unwrap().0.len(), 2);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
