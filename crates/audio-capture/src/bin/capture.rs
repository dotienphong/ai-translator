//! Công cụ cho spike S1 (macOS) và S2 (Windows): thu âm thanh hệ thống trong N giây,
//! ghi ra WAV 16 kHz mono, và in mức âm lượng (RMS) của từng giây.

use anyhow::Result;
use audio_capture::mix::Mixer2;
use audio_capture::resample::{MonoResampler, TARGET_RATE};
use audio_capture::{AudioSource, CaptureStats};
use clap::Parser;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// 48 kHz × 2 kênh × 30 giây (spec §6.1).
const RING_SAMPLES: usize = 48_000 * 2 * 30;
const SILENT_RMS: f32 = 0.000_5;

#[derive(Parser)]
struct Args {
    #[arg(long, default_value_t = 20)]
    seconds: u64,
    #[arg(long)]
    out: PathBuf,
    /// macOS: chỉ thu một app theo pid. Mặc định thu toàn hệ thống, trừ chính công cụ này.
    #[arg(long)]
    pid: Option<i32>,
    /// Windows: console, communications, hoặc both (chế độ tự động của §6.1: thu thêm thiết bị
    /// Communications khi nó khác thiết bị Console).
    #[arg(long, default_value = "console")]
    role: String,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let mut sources = make_sources(&args)?;
    let stats: Vec<Arc<CaptureStats>> = sources.iter().map(|(_, s)| s.clone()).collect();
    let mut consumers = Vec::new();
    let mut resamplers = Vec::new();
    for (source, _) in sources.iter_mut() {
        let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
        // start() có thể chờ lâu: macOS hiện hộp thoại xin quyền ở lần đầu, và với tapautostart
        // AudioDeviceStart chờ tới khi có app phát tiếng. In trước để biết đang kẹt ở đâu.
        println!("đang khởi động nguồn (macOS: có thể đang chờ trả lời hộp thoại quyền, hoặc chờ app phát tiếng)...");
        source.start(producer)?;
        let format = source.format();
        println!("nguồn: {} Hz, {} kênh", format.sample_rate, format.channels);
        resamplers.push(MonoResampler::new(format.sample_rate, format.channels)?);
        consumers.push(consumer);
    }

    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut wav = hound::WavWriter::create(&args.out, spec)?;
    let mut mixer = Mixer2::new(TARGET_RATE as usize / 10);
    let mut second = Vec::with_capacity(TARGET_RATE as usize);
    let (mut seconds_done, mut silent_seconds) = (0u64, 0u64);
    let started = Instant::now();
    let mut raw = Vec::new();
    let mut mono: Vec<Vec<f32>> = vec![Vec::new(); consumers.len()];

    while started.elapsed() < Duration::from_secs(args.seconds) {
        std::thread::sleep(Duration::from_millis(20));
        for (i, consumer) in consumers.iter_mut().enumerate() {
            raw.clear();
            let available = consumer.slots();
            if available > 0 {
                let chunk = consumer.read_chunk(available)?;
                let (a, b) = chunk.as_slices();
                raw.extend_from_slice(a);
                raw.extend_from_slice(b);
                chunk.commit_all();
            }
            resamplers[i].process(&raw, &mut mono[i])?;
        }
        let mut mixed = Vec::new();
        if mono.len() == 1 {
            mixed.append(&mut mono[0]);
        } else {
            mixer.push_a(&mono[0]);
            mixer.push_b(&mono[1]);
            mono.iter_mut().for_each(Vec::clear);
            mixer.drain_into(&mut mixed);
        }
        for s in mixed {
            wav.write_sample((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)?;
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

type Source = (Box<dyn AudioSource>, Arc<CaptureStats>);

#[cfg(target_os = "macos")]
fn make_sources(args: &Args) -> Result<Vec<Source>> {
    use audio_capture::macos::{MacTapSource, TapTarget};
    let target = args.pid.map_or(TapTarget::SystemExceptSelf, TapTarget::Process);
    let stats = Arc::new(CaptureStats::default());
    Ok(vec![(Box::new(MacTapSource::new(target, stats.clone())), stats)])
}

#[cfg(windows)]
fn make_sources(args: &Args) -> Result<Vec<Source>> {
    use audio_capture::windows::{LoopbackSource, Role, default_endpoint_id};
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
                Box::new(LoopbackSource::new(role, stats.clone())) as Box<dyn AudioSource>,
                stats,
            )
        })
        .collect())
}

#[cfg(not(any(target_os = "macos", windows)))]
fn make_sources(_args: &Args) -> Result<Vec<Source>> {
    anyhow::bail!("chỉ hỗ trợ macOS và Windows")
}
