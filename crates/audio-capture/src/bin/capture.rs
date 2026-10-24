//! Công cụ cho spike S1 (macOS), S2 (Windows) và S-M1 (spec 2026-10-24-nguon-micro §6.1).
//!
//! - Không có `--mic`, `--mic-only`: thu âm thanh hệ thống N giây, ghi ra WAV 16 kHz mono, in RMS từng giây (như S1, S2).
//! - Có `--mic` hay `--mic-only`: `--out` là thư mục cảnh. Ghi riêng, chưa trộn: `playback.wav` (âm thanh máy, 16 kHz
//!   mono), `mic.wav` (micro, 16 kHz mono), `mic-raw.wav` (micro ở tần số của thiết bị, mono float32, cho lệnh
//!   `latency-bench denoise`) và `meta.json` (định dạng, số liệu, lệch giữa hai luồng, giờ thật của lời nhắc `--cues`).

use anyhow::Result;
use audio_capture::mix::Mixer2;
use audio_capture::preprocess::RING_SAMPLES;
use audio_capture::resample::{MonoResampler, TARGET_RATE};
use audio_capture::{AudioSource, CaptureStats};
use clap::Parser;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

const SILENT_RMS: f32 = 0.000_5;

#[derive(Parser)]
struct Args {
    #[arg(long, default_value_t = 20)]
    seconds: u64,
    /// File WAV (chỉ âm thanh máy), hoặc thư mục cảnh khi có `--mic` hay `--mic-only`.
    #[arg(long)]
    out: PathBuf,
    /// macOS: chỉ thu một app theo pid. Mặc định thu toàn hệ thống, trừ chính công cụ này.
    #[arg(long)]
    pid: Option<i32>,
    /// Windows: console, communications, hoặc both (chế độ tự động của §6.1: thu thêm thiết bị
    /// Communications khi nó khác thiết bị Console).
    #[arg(long, default_value = "console")]
    role: String,
    /// Thu thêm micro: `--mic` (micro mặc định, hay giá trị rỗng) hoặc `--mic <id>` (UID trên macOS, id endpoint trên
    /// Windows; xem `mic-probe devices`).
    #[arg(long, num_args = 0..=1, default_missing_value = "")]
    mic: Option<String>,
    /// Chỉ thu micro, không thu âm thanh máy.
    #[arg(long)]
    mic_only: bool,
    /// Lời nhắc theo giờ (JSON: `[{"at_s": 0, "label": "go-phim", "say": "Gõ phím laptop"}]`): in đúng giờ, ghi giờ thật
    /// (theo đồng hồ của `mic.wav`) vào `meta.json`.
    #[arg(long)]
    cues: Option<PathBuf>,
}

fn main() -> Result<()> {
    let args = Args::parse();
    if args.mic.is_some() || args.mic_only {
        scene(&args)
    } else {
        playback_only(&args)
    }
}

type Source = (Box<dyn AudioSource>, Arc<CaptureStats>);
type Input = (rtrb::Consumer<f32>, MonoResampler, Vec<f32>);

/// Đọc hết mẫu đang có trong ring buffer vào `out` (xóa `out` trước).
fn read_all(consumer: &mut rtrb::Consumer<f32>, out: &mut Vec<f32>) -> Result<()> {
    out.clear();
    let available = consumer.slots();
    if available > 0 {
        let chunk = consumer.read_chunk(available)?;
        let (a, b) = chunk.as_slices();
        out.extend_from_slice(a);
        out.extend_from_slice(b);
        chunk.commit_all();
    }
    Ok(())
}

fn write16<W: std::io::Write + std::io::Seek>(w: &mut hound::WavWriter<W>, samples: &[f32]) -> Result<()> {
    for &s in samples {
        w.write_sample((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)?;
    }
    Ok(())
}

fn spec16() -> hound::WavSpec {
    hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    }
}

/// S1, S2: chỉ âm thanh máy, trộn hai thiết bị nếu có, một file WAV.
fn playback_only(args: &Args) -> Result<()> {
    let mut sources = make_sources(args)?;
    let stats: Vec<Arc<CaptureStats>> = sources.iter().map(|(_, s)| s.clone()).collect();
    let mut inputs: Vec<Input> = Vec::new();
    for (source, _) in sources.iter_mut() {
        let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
        // start() có thể chờ lâu: macOS hiện hộp thoại xin quyền ở lần đầu, và với tapautostart
        // AudioDeviceStart chờ tới khi có app phát tiếng. In trước để biết đang kẹt ở đâu.
        println!("đang khởi động nguồn (macOS: có thể đang chờ trả lời hộp thoại quyền, hoặc chờ app phát tiếng)...");
        source.start(producer)?;
        let format = source.format();
        println!("nguồn: {} Hz, {} kênh", format.sample_rate, format.channels);
        inputs.push((
            consumer,
            MonoResampler::new(format.sample_rate, format.channels)?,
            Vec::new(),
        ));
    }
    let mut wav = hound::WavWriter::create(&args.out, spec16())?;
    let mut mixer = Mixer2::new(TARGET_RATE as usize / 10);
    let mut second = Vec::with_capacity(TARGET_RATE as usize);
    let (mut seconds_done, mut silent_seconds) = (0u64, 0u64);
    let started = Instant::now();
    let (mut raw, mut mixed) = (Vec::new(), Vec::new());
    while started.elapsed() < Duration::from_secs(args.seconds) {
        std::thread::sleep(Duration::from_millis(20));
        for (consumer, resampler, mono) in inputs.iter_mut() {
            read_all(consumer, &mut raw)?;
            resampler.process(&raw, mono)?;
        }
        mix_playback(&mut inputs, &mut mixer, &mut mixed);
        write16(&mut wav, &mixed)?;
        for &s in &mixed {
            second.push(s);
            if second.len() == TARGET_RATE as usize {
                let rms = (second.iter().map(|x| x * x).sum::<f32>() / second.len() as f32).sqrt();
                seconds_done += 1;
                if rms < SILENT_RMS {
                    silent_seconds += 1;
                }
                println!(
                    "giây {seconds_done:>3}: rms = {rms:.4}{}",
                    if rms < SILENT_RMS { "  (im lặng)" } else { "" }
                );
                second.clear();
            }
        }
    }
    for (source, _) in sources.iter_mut() {
        source.stop();
    }
    wav.finalize()?;
    println!(
        "xong: {seconds_done} giây, {silent_seconds} giây im lặng, file {}",
        args.out.display()
    );
    let elapsed = started.elapsed().as_secs_f64();
    for (i, s) in stats.iter().enumerate() {
        let [frames, inserted, skipped, dropped, rejected] = s.snapshot();
        println!(
            "nguồn {i}: {frames} khung nhận (≈ {:.0} khung/giây, so với tần số ở dòng `nguồn:`), {inserted} khung im lặng chèn thêm, {skipped} khung bỏ, {dropped} mẫu rơi, {rejected} lượt IO bị từ chối",
            frames as f64 / elapsed
        );
    }
    Ok(())
}

/// Trộn các luồng âm thanh máy (một hay hai thiết bị) vào `out` (xóa `out` trước).
fn mix_playback(inputs: &mut [Input], mixer: &mut Mixer2, out: &mut Vec<f32>) {
    out.clear();
    match inputs {
        [] => {}
        [(_, _, only)] => out.append(only),
        [(_, _, a), (_, _, b)] => {
            mixer.push_a(a);
            mixer.push_b(b);
            a.clear();
            b.clear();
            mixer.drain_into(out);
        }
        _ => unreachable!("tối đa hai thiết bị phát"),
    }
}

/// Gộp mẫu xen kẽ về mono, giữ khung dở dang cho lần sau.
struct Downmix {
    channels: usize,
    partial: Vec<f32>,
}

impl Downmix {
    fn process(&mut self, interleaved: &[f32], out: &mut Vec<f32>) {
        self.partial.extend_from_slice(interleaved);
        let whole = self.partial.len() / self.channels * self.channels;
        out.extend(
            self.partial[..whole]
                .chunks_exact(self.channels)
                .map(|f| f.iter().sum::<f32>() / self.channels as f32),
        );
        self.partial.drain(..whole);
    }
}

#[derive(Deserialize)]
struct Cue {
    at_s: f64,
    label: String,
    say: String,
}

#[derive(Serialize)]
struct CueAt {
    label: String,
    say: String,
    /// Giờ thật, tính theo số mẫu đã ghi vào `mic.wav`.
    at_ms: u64,
}

#[derive(Serialize)]
struct Format {
    sample_rate: u32,
    channels: u16,
}

#[derive(Serialize)]
struct SourceStats {
    role: &'static str,
    frames: u64,
    silence_inserted: u64,
    skipped: u64,
    dropped: u64,
    rejected_cycles: u64,
}

#[derive(Serialize)]
struct Meta {
    seconds: u64,
    mic: Format,
    playback: Option<Format>,
    /// Số mẫu 16 kHz đã ghi của mỗi file.
    playback_samples: u64,
    mic_samples: u64,
    /// Mỗi giây một cặp `[giây, số mẫu playback − số mẫu mic]`: lệch đồng hồ giữa hai luồng (spec §5.1, §6.4).
    drift: Vec<[i64; 2]>,
    cues: Vec<CueAt>,
    stats: Vec<SourceStats>,
}

fn source_stats(role: &'static str, s: &CaptureStats) -> SourceStats {
    let [frames, silence_inserted, skipped, dropped, rejected_cycles] = s.snapshot();
    SourceStats {
        role,
        frames,
        silence_inserted,
        skipped,
        dropped,
        rejected_cycles,
    }
}

/// S-M1: âm thanh máy (trừ khi `--mic-only`) và micro, mỗi luồng một file, chưa trộn.
fn scene(args: &Args) -> Result<()> {
    std::fs::create_dir_all(&args.out)?;
    let cues: Vec<Cue> = match &args.cues {
        Some(p) => serde_json::from_reader(std::fs::File::open(p)?)?,
        None => Vec::new(),
    };
    let mut playback: Vec<Source> = if args.mic_only { Vec::new() } else { make_sources(args)? };
    let mic_stats = Arc::new(CaptureStats::default());
    let mut mic = audio_capture::mic_source(args.mic.clone().filter(|s| !s.is_empty()), mic_stats.clone())?;

    let mut inputs: Vec<Input> = Vec::new();
    let mut playback_format = None;
    for (source, _) in playback.iter_mut() {
        let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
        println!("đang khởi động âm thanh máy (macOS: có thể đang chờ app phát tiếng)...");
        source.start(producer)?;
        let f = source.format();
        println!("âm thanh máy: {} Hz, {} kênh", f.sample_rate, f.channels);
        playback_format = Some(Format {
            sample_rate: f.sample_rate,
            channels: f.channels,
        });
        inputs.push((consumer, MonoResampler::new(f.sample_rate, f.channels)?, Vec::new()));
    }
    let (producer, mut mic_consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
    println!("đang mở micro (macOS: lần đầu có thể hỏi quyền Micro)...");
    mic.start(producer)?;
    let mf = mic.format();
    println!("micro: {} Hz, {} kênh", mf.sample_rate, mf.channels);
    let mut mic_resampler = MonoResampler::new(mf.sample_rate, mf.channels)?;
    let mut downmix = Downmix {
        channels: mf.channels.max(1) as usize,
        partial: Vec::new(),
    };

    let raw_spec = hound::WavSpec {
        channels: 1,
        sample_rate: mf.sample_rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut playback_wav = if inputs.is_empty() {
        None
    } else {
        Some(hound::WavWriter::create(args.out.join("playback.wav"), spec16())?)
    };
    let mut mic_wav = hound::WavWriter::create(args.out.join("mic.wav"), spec16())?;
    let mut raw_wav = hound::WavWriter::create(args.out.join("mic-raw.wav"), raw_spec)?;

    let mut mixer = Mixer2::new(TARGET_RATE as usize / 10);
    let (mut raw, mut mixed, mut mic_mono, mut mic16) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let (mut playback_samples, mut mic_samples) = (0u64, 0u64);
    let (mut next_cue, mut cues_at) = (0usize, Vec::new());
    let (mut drift, mut next_drift) = (Vec::new(), 1u64);
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(args.seconds) {
        std::thread::sleep(Duration::from_millis(20));
        for (consumer, resampler, mono) in inputs.iter_mut() {
            read_all(consumer, &mut raw)?;
            resampler.process(&raw, mono)?;
        }
        mix_playback(&mut inputs, &mut mixer, &mut mixed);
        if let Some(w) = playback_wav.as_mut() {
            write16(w, &mixed)?;
        }
        playback_samples += mixed.len() as u64;

        read_all(&mut mic_consumer, &mut raw)?;
        mic_mono.clear();
        downmix.process(&raw, &mut mic_mono);
        for &s in &mic_mono {
            raw_wav.write_sample(s)?;
        }
        mic16.clear();
        mic_resampler.process(&raw, &mut mic16)?;
        write16(&mut mic_wav, &mic16)?;
        mic_samples += mic16.len() as u64;

        let elapsed = started.elapsed().as_secs_f64();
        while next_cue < cues.len() && elapsed >= cues[next_cue].at_s {
            let c = &cues[next_cue];
            println!("\n▶▶ {}\n", c.say);
            cues_at.push(CueAt {
                label: c.label.clone(),
                say: c.say.clone(),
                at_ms: mic_samples * 1000 / TARGET_RATE as u64,
            });
            next_cue += 1;
        }
        if !inputs.is_empty() && elapsed >= next_drift as f64 {
            drift.push([next_drift as i64, playback_samples as i64 - mic_samples as i64]);
            next_drift += 1;
        }
    }
    for (source, _) in playback.iter_mut() {
        source.stop();
    }
    mic.stop();
    if let Some(w) = playback_wav {
        w.finalize()?;
    }
    mic_wav.finalize()?;
    raw_wav.finalize()?;
    let mut stats: Vec<SourceStats> = playback.iter().map(|(_, s)| source_stats("playback", s)).collect();
    stats.push(source_stats("mic", &mic_stats));
    let meta = Meta {
        seconds: args.seconds,
        mic: Format {
            sample_rate: mf.sample_rate,
            channels: mf.channels,
        },
        playback: playback_format,
        playback_samples,
        mic_samples,
        drift,
        cues: cues_at,
        stats,
    };
    std::fs::write(args.out.join("meta.json"), serde_json::to_string_pretty(&meta)?)?;
    println!(
        "xong: {} giây micro, {} giây âm thanh máy, thư mục {}",
        mic_samples / TARGET_RATE as u64,
        playback_samples / TARGET_RATE as u64,
        args.out.display()
    );
    Ok(())
}

#[cfg(target_os = "macos")]
fn make_sources(args: &Args) -> Result<Vec<Source>> {
    use audio_capture::macos::{MacTapSource, TapTarget};
    let target = args
        .pid
        .map_or(TapTarget::SystemExceptSelf, |pid| TapTarget::Processes(vec![pid]));
    let stats = Arc::new(CaptureStats::default());
    Ok(vec![(Box::new(MacTapSource::new(target, stats.clone())), stats)])
}

#[cfg(windows)]
fn make_sources(args: &Args) -> Result<Vec<Source>> {
    use audio_capture::windows::{Endpoint, LoopbackSource, Role, default_endpoint_id};
    let roles = match args.role.as_str() {
        "console" => vec![Role::Console],
        "communications" => vec![Role::Communications],
        "both" if default_endpoint_id(Role::Console)? == default_endpoint_id(Role::Communications)? => {
            println!("Console và Communications là cùng một thiết bị, chỉ thu một lần");
            vec![Role::Console]
        }
        "both" => vec![Role::Console, Role::Communications],
        other => anyhow::bail!("role không hợp lệ: {other}"),
    };
    Ok(roles
        .into_iter()
        .map(|role| {
            let stats = Arc::new(CaptureStats::default());
            (
                Box::new(LoopbackSource::new(Endpoint::Default(role), stats.clone())) as Box<dyn AudioSource>,
                stats,
            )
        })
        .collect())
}

#[cfg(not(any(target_os = "macos", windows)))]
fn make_sources(_args: &Args) -> Result<Vec<Source>> {
    anyhow::bail!("chỉ hỗ trợ macOS và Windows")
}
