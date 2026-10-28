//! In ranh giới đoạn VAD đúng như app cắt (SileroVad + Segmenter với PipelineConfig mặc định), mỗi dòng "start_ms end_ms".
use pipeline::config::PipelineConfig;
use pipeline::segmenter::{Segmenter, SegmenterConfig, FRAME_SAMPLES};
use pipeline::vad::SileroVad;
use std::io::Write;

fn run() -> anyhow::Result<()> {
    let a: Vec<String> = std::env::args().collect();
    let (vad_path, wav, end_ms, out) = (&a[1], &a[2], a[3].parse::<u64>()?, &a[4]);
    let mut vad = SileroVad::load(std::path::Path::new(vad_path))?;
    let cfg = PipelineConfig::default();
    let mut seg = Segmenter::new(SegmenterConfig { end_silence_ms: end_ms, ..cfg.segmenter.clone() });
    let mut r = hound::WavReader::open(wav)?;
    assert_eq!(r.spec().sample_rate, 16000);
    let s: Vec<f32> = r.samples::<i16>().map(|x| x.unwrap() as f32 / 32768.0).collect();
    let mut f = std::fs::File::create(out)?;
    for fr in s.chunks_exact(FRAME_SAMPLES) {
        let p = vad.prob(fr)?;
        for g in seg.push(fr, p) {
            writeln!(f, "{} {}", g.start_ms, g.end_ms)?;
        }
    }
    if let Some(g) = seg.flush() {
        writeln!(f, "{} {}", g.start_ms, g.end_ms)?;
    }
    Ok(())
}

fn main() -> anyhow::Result<()> {
    std::thread::Builder::new().stack_size(8 << 20).spawn(run)?.join().unwrap()
}
