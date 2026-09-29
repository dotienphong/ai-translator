//! In xác suất VAD của từng khung 32 ms cho một file WAV 16 kHz mono, dạng JSON.
//! Dùng: cargo run -p pipeline --example vad_probe -- <model.onnx> <audio.wav>
use pipeline::segmenter::FRAME_SAMPLES;
use pipeline::vad::SileroVad;
use std::path::Path;
use std::time::Instant;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let mut vad = SileroVad::load(Path::new(&args[1]))?;
    let mut reader = hound::WavReader::open(&args[2])?;
    anyhow::ensure!(
        reader.spec().sample_rate == 16_000 && reader.spec().channels == 1,
        "cần WAV 16 kHz mono"
    );
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32768.0))
        .collect::<Result<_, _>>()?;
    let started = Instant::now();
    let probs: Vec<f32> = samples
        .as_chunks::<FRAME_SAMPLES>()
        .0
        .iter()
        .map(|f| vad.prob(f))
        .collect::<anyhow::Result<_>>()?;
    eprintln!(
        "{} khung, trung bình {:.2} ms/khung",
        probs.len(),
        started.elapsed().as_secs_f64() * 1000.0 / probs.len() as f64
    );
    println!("{}", serde_json::to_string(&probs)?);
    Ok(())
}
