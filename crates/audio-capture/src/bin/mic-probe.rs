//! Spike S-M4 (spec 2026-10-24-nguon-micro §6.4): kiểm hành vi quyền micro và nguồn micro trên máy thật.
//!
//! macOS: chạy qua `MicProbe.app` (`crates/audio-capture/macos/make-app.sh mic-probe`), vì quyền Micro tính theo app đang
//! chạy; chạy thẳng binary từ Terminal thì quyền lại tính cho Terminal.
//!
//! - `devices`: liệt kê micro (tên, loại kết nối, mặc định).
//! - `status`: trạng thái quyền micro (macOS: `AVCaptureDevice`; Windows: khóa `ConsentStore\microphone`).
//! - `request`: macOS, xin quyền (hiện hộp thoại nếu chưa hỏi), chờ trả lời tối đa 60 giây; Windows in trạng thái hiện có.
//! - `listen [--seconds N] [--id ID]`: mở micro N giây, in mỗi giây RMS và tỉ lệ mẫu bằng 0 tuyệt đối; mở lỗi thì in
//!   nguyên văn lỗi (mã HRESULT hay OSStatus).

use anyhow::Result;
use audio_capture::CaptureStats;
use audio_capture::preprocess::RING_SAMPLES;
use clap::{Parser, Subcommand};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Parser)]
struct Args {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    Devices,
    Status,
    Request,
    Listen {
        #[arg(long, default_value_t = 5)]
        seconds: u64,
        #[arg(long)]
        id: Option<String>,
    },
}

fn main() -> Result<()> {
    match Args::parse().cmd {
        Cmd::Devices => devices(),
        Cmd::Status => status(),
        Cmd::Request => request(),
        Cmd::Listen { seconds, id } => listen(seconds, id),
    }
}

fn devices() -> Result<()> {
    for d in audio_capture::list_input_devices()? {
        println!(
            "{}{} [{}] id={}",
            if d.is_default { "* " } else { "  " },
            d.name,
            d.transport.as_str(),
            d.id
        );
    }
    Ok(())
}

fn status() -> Result<()> {
    println!("quyền micro: {:?}", audio_capture::mic_permission());
    Ok(())
}

fn request() -> Result<()> {
    let answer = audio_capture::request_mic_permission(Duration::from_secs(60))?;
    println!("trả lời: {answer:?}");
    Ok(())
}

fn listen(seconds: u64, id: Option<String>) -> Result<()> {
    let stats = Arc::new(CaptureStats::default());
    let mut source = audio_capture::mic_source(id, stats.clone())?;
    let (producer, mut consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
    let started = Instant::now();
    if let Err(e) = source.start(producer) {
        println!("mở micro lỗi sau {} ms: {e:#}", started.elapsed().as_millis());
        return Ok(());
    }
    let format = source.format();
    println!(
        "micro: {} Hz, {} kênh (mở mất {} ms)",
        format.sample_rate,
        format.channels,
        started.elapsed().as_millis()
    );
    let per_second = format.sample_rate as usize * format.channels.max(1) as usize;
    let mut pending = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(seconds);
    let mut n = 0;
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
        let available = consumer.slots();
        if available > 0 {
            let chunk = consumer.read_chunk(available)?;
            let (a, b) = chunk.as_slices();
            pending.extend_from_slice(a);
            pending.extend_from_slice(b);
            chunk.commit_all();
        }
        while pending.len() >= per_second {
            let second: Vec<f32> = pending.drain(..per_second).collect();
            n += 1;
            let rms = (second.iter().map(|x| x * x).sum::<f32>() / second.len() as f32).sqrt();
            let zeros = second.iter().filter(|&&x| x == 0.0).count() as f32 / second.len() as f32;
            println!(
                "giây {n}: rms = {rms:.5} ({:.1} dBFS), mẫu bằng 0: {:.1}%",
                20.0 * rms.max(1e-9).log10(),
                zeros * 100.0
            );
        }
    }
    let failed = source.failed();
    source.stop();
    let [frames, inserted, _, dropped, rejected] = stats.snapshot();
    println!(
        "xong: {frames} khung, {inserted} khung im lặng chèn, {dropped} mẫu rơi, {rejected} lượt IO bị từ chối, failed = {failed}"
    );
    Ok(())
}
