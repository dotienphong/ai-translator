//! So xác suất VAD của candle-onnx với onnxruntime (bench/phase0/vad/ref_probs.py).
//! Chạy khi có đủ ba biến môi trường, nếu không thì bỏ qua. Đường dẫn phải là tuyệt đối, vì cargo chạy test
//! trong thư mục của crate:
//!   SILERO_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx VAD_TEST_WAV=$PWD/... VAD_REF_JSON=$PWD/... \
//!     cargo test -p pipeline --test vad_reference

use pipeline::segmenter::FRAME_SAMPLES;
use pipeline::vad::SileroVad;
use std::path::Path;

#[test]
fn candle_matches_onnxruntime() {
    let (Ok(model), Ok(wav), Ok(reference)) = (
        std::env::var("SILERO_VAD_MODEL"),
        std::env::var("VAD_TEST_WAV"),
        std::env::var("VAD_REF_JSON"),
    ) else {
        eprintln!("bỏ qua: chưa đặt SILERO_VAD_MODEL, VAD_TEST_WAV, VAD_REF_JSON");
        return;
    };
    let expected: Vec<f32> = serde_json::from_reader(std::fs::File::open(reference).unwrap()).unwrap();
    let mut vad = SileroVad::load(Path::new(&model)).unwrap();
    let mut reader = hound::WavReader::open(wav).unwrap();
    let samples: Vec<f32> = reader.samples::<i16>().map(|s| s.unwrap() as f32 / 32768.0).collect();
    let got: Vec<f32> = samples
        .as_chunks::<FRAME_SAMPLES>()
        .0
        .iter()
        .map(|f| vad.prob(f).unwrap())
        .collect();
    assert_eq!(got.len(), expected.len());
    let max_diff = got
        .iter()
        .zip(&expected)
        .map(|(a, b)| (a - b).abs())
        .fold(0.0f32, f32::max);
    assert!(max_diff <= 1e-4, "chênh lệch lớn nhất {max_diff}");
}
