//! In xác suất VAD của từng khung 32 ms cho một file WAV 16 kHz mono, dạng JSON, và thời gian chạy mỗi khung.
//! Dùng: cargo run --release -p pipeline --example vad_probe -- <model.onnx> <audio.wav> [--paced]
//! `--paced`: gọi đúng nhịp 32 ms như luồng thật, ngủ giữa các khung. Chạy liên tục cho số đo thấp hơn thực tế vài lần,
//! vì CPU luôn ở tần số cao và cache luôn nóng.
use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES};
use pipeline::vad::SileroVad;
use std::path::Path;
use std::time::{Duration, Instant};

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let paced = args.iter().any(|a| a == "--paced");
    let files: Vec<&String> = args.iter().filter(|a| !a.starts_with("--")).collect();
    let [model, wav] = files.as_slice() else {
        anyhow::bail!("dùng: vad_probe <model.onnx> <audio.wav> [--paced]");
    };
    let mut vad = SileroVad::load(Path::new(model))?;
    let mut reader = hound::WavReader::open(wav)?;
    anyhow::ensure!(
        reader.spec().sample_rate == 16_000 && reader.spec().channels == 1,
        "cần WAV 16 kHz mono"
    );
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32768.0))
        .collect::<Result<_, _>>()?;
    let frames = samples.as_chunks::<FRAME_SAMPLES>().0;
    anyhow::ensure!(!frames.is_empty(), "file ngắn hơn một khung ({FRAME_SAMPLES} mẫu)");
    let mut probs = Vec::with_capacity(frames.len());
    let mut times_ms = Vec::with_capacity(frames.len());
    let origin = Instant::now();
    for (i, frame) in frames.iter().enumerate() {
        if paced {
            let due = origin + Duration::from_millis(i as u64 * FRAME_MS);
            if let Some(wait) = due.checked_duration_since(Instant::now()) {
                std::thread::sleep(wait);
            }
        }
        let started = Instant::now();
        probs.push(vad.prob(frame)?);
        times_ms.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    let mean = times_ms.iter().sum::<f64>() / times_ms.len() as f64;
    times_ms.sort_by(f64::total_cmp);
    let at = |p: f64| times_ms[((times_ms.len() - 1) as f64 * p).round() as usize];
    eprintln!(
        "{} khung{}, trung bình {mean:.2} ms, p50 {:.2}, p99 {:.2}, lớn nhất {:.2} ms/khung",
        frames.len(),
        if paced { " (đúng nhịp 32 ms)" } else { "" },
        at(0.5),
        at(0.99),
        at(1.0)
    );
    println!("{}", serde_json::to_string(&probs)?);
    Ok(())
}
