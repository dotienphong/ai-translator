//! So xác suất VAD của candle-onnx với onnxruntime (bench/phase0/vad/ref_probs.py), rồi chạy dài để bắt rò bộ nhớ.
//! Cần model và file tham chiếu nên mặc định bị bỏ qua. Chạy lại mỗi khi nâng candle-core hoặc candle-onnx.
//! Đường dẫn phải là tuyệt đối, vì cargo chạy test trong thư mục của crate:
//!   SILERO_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx VAD_TEST_WAV=$PWD/... VAD_REF_JSON=$PWD/... \
//!     cargo test -p pipeline --test vad_reference -- --include-ignored

use pipeline::segmenter::FRAME_SAMPLES;
use pipeline::vad::SileroVad;
use std::path::Path;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("chưa đặt {name} (xem doc đầu file)"))
}

#[test]
#[ignore = "cần SILERO_VAD_MODEL, VAD_TEST_WAV, VAD_REF_JSON"]
fn candle_matches_onnxruntime() {
    let expected: Vec<f32> = serde_json::from_reader(std::fs::File::open(env("VAD_REF_JSON")).unwrap()).unwrap();
    let mut vad = SileroVad::load(Path::new(&env("SILERO_VAD_MODEL"))).unwrap();
    let mut reader = hound::WavReader::open(env("VAD_TEST_WAV")).unwrap();
    let spec = reader.spec();
    assert!(
        spec.sample_rate == 16_000 && spec.channels == 1 && spec.bits_per_sample == 16,
        "cần WAV 16 kHz mono 16-bit"
    );
    let samples: Vec<f32> = reader.samples::<i16>().map(|s| s.unwrap() as f32 / 32768.0).collect();
    let frames = samples.as_chunks::<FRAME_SAMPLES>().0;
    let got: Vec<f32> = frames.iter().map(|f| vad.prob(f).unwrap()).collect();
    assert_eq!(got.len(), expected.len());
    // So từng khung: `NaN <= x` là false nên NaN cũng bị bắt.
    for (i, (g, e)) in got.iter().zip(&expected).enumerate() {
        assert!((g - e).abs() <= 1e-4, "khung {i}: candle {g}, onnxruntime {e}");
    }

    // Chạy thêm 4.000 khung (khoảng 2 phút) rồi reset: nếu state còn giữ đồ thị tính của các khung trước thì bộ nhớ
    // phình to, và việc hủy chuỗi đó làm tràn stack của luồng test (2 MiB).
    for f in frames.iter().cycle().take(4_000) {
        assert!(vad.prob(f).unwrap().is_finite());
    }
    vad.reset().unwrap();

    // Sau reset phải ra kết quả giống hệt lúc mới nạp.
    let again: Vec<f32> = frames.iter().map(|f| vad.prob(f).unwrap()).collect();
    assert!(again == got, "sau reset kết quả khác lúc mới nạp");
}
