//! Đối chiếu engine Rust (`ort`) với SDK `vieneu` trên model thật. Chỉ chạy khi bật feature `engine` và đặt biến môi trường:
//! `TTS_ONNX_DIR` (onnx_update/), `TTS_CODEC_DIR`, `TTS_ORT_LIB` (tùy chọn), `TTS_G2P_DICT` (sea_g2p.bin),
//! `TTS_REF` (ref_f32.npz) và `TTS_REF_JSON` (dump.json), sinh bằng `gen/dump_ref.py`.
//! Chạy: `cargo test -p tts-worker --features engine --release --test engine_ref -- --ignored --nocapture`.
#![cfg(feature = "engine")]

use std::path::PathBuf;
use tts_worker::engine::{Engine, GenParams};
use tts_worker::npz::read_npz;
use tts_worker::phonemize::Phonemizer;
use tts_worker::sampling::{Params, Rng};

fn env(k: &str) -> String {
    std::env::var(k).unwrap_or_else(|_| panic!("thiếu biến môi trường {k}"))
}

fn max_abs(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len(), "độ dài khác nhau");
    a.iter().zip(b).map(|(x, y)| (x - y).abs()).fold(0.0, f32::max)
}

#[test]
#[ignore = "cần model thật, xem đầu file"]
fn rust_engine_matches_reference_sdk() {
    let r = read_npz(&PathBuf::from(env("TTS_REF"))).unwrap();
    let meta: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(env("TTS_REF_JSON")).unwrap()).unwrap();
    let text = meta["text"].as_str().unwrap();
    let want_ph = meta["phonemes"].as_str().unwrap();

    let ph = Phonemizer::open(&env("TTS_G2P_DICT")).unwrap().phonemize(text);
    assert_eq!(ph, want_ph, "âm vị khác SDK");

    let lib = std::env::var("TTS_ORT_LIB").ok().map(PathBuf::from);
    let t0 = std::time::Instant::now();
    let mut eng = Engine::load(
        &PathBuf::from(env("TTS_ONNX_DIR")),
        &PathBuf::from(env("TTS_CODEC_DIR")),
        lib.as_deref(),
        0,
    )
    .unwrap();
    println!("nạp model: {:.2}s", t0.elapsed().as_secs_f32());

    let spk = &r["spk"].data;
    let ref_codes: Vec<i64> = r["refcodes"].data.iter().map(|&x| x as i64).collect();
    let anchor = eng.speaker_anchor(spk).unwrap();
    println!("anchor max|Δ| = {:e}", max_abs(&anchor, &r["anchor"].data));
    assert!(max_abs(&anchor, &r["anchor"].data) < 1e-4);

    let (rows, _) = eng.build_rows(&ph, &ref_codes).unwrap();
    let want_rows: Vec<i64> = r["rows"].data.iter().map(|&x| x as i64).collect();
    assert_eq!(rows, want_rows, "hàng prompt khác SDK");

    let emb = eng.embed_rows(&rows, &anchor);
    println!("embed max|Δ| = {:e}", max_abs(&emb, &r["emb"].data));
    assert!(max_abs(&emb, &r["emb"].data) < 1e-4);

    // Greedy (temperature 0) để kết quả xác định; giống tham số lúc sinh bản tham chiếu.
    let p = GenParams {
        sampling: Params {
            temperature: 0.0,
            top_k: 25,
            top_p: 0.95,
            rep_pen: 1.2,
        },
        rep_window: 64,
        max_new_frames: 300,
    };
    let t1 = std::time::Instant::now();
    let frames = eng.generate(emb, &anchor, &p, &mut Rng::new(0), &|| false).unwrap();
    let gen_s = t1.elapsed().as_secs_f32();
    let want_frames = r["codes"]
        .data
        .as_chunks::<16>()
        .0
        .iter()
        .map(|c| c.iter().map(|&x| x as i64).collect::<Vec<_>>())
        .collect::<Vec<_>>();
    let same = frames.iter().zip(&want_frames).filter(|(a, b)| a == b).count();
    println!(
        "khung: {} (SDK {}), giống hệt {}",
        frames.len(),
        want_frames.len(),
        same
    );
    for (i, (a, b)) in frames.iter().zip(&want_frames).enumerate() {
        if a != b {
            let n = a.iter().zip(b).filter(|(x, y)| x != y).count();
            println!(
                "  khung {i}: khác {n}/16 codebook, đầu tiên: rust {:?} sdk {:?}",
                &a[..4],
                &b[..4]
            );
        }
    }

    let t2 = std::time::Instant::now();
    let wav = eng.decode(&frames).unwrap();
    println!(
        "sinh khung {gen_s:.2}s, giải mã codec {:.2}s, {} mẫu = {:.2}s âm thanh",
        t2.elapsed().as_secs_f32(),
        wav.len(),
        wav.len() as f32 / 48000.0
    );
    if frames == want_frames {
        println!("wav max|Δ| = {:e}", max_abs(&wav, &r["wav"].data));
        assert!(max_abs(&wav, &r["wav"].data) < 1e-3);
    }
    // Codec dạng luồng (nhóm 4, 6, 8, 25 khung như lịch phát dần) phải cho đúng từng mẫu như giải mã một lần.
    let mut cs = eng.codec_stream_new().unwrap();
    let (mut streamed, mut i, mut j) = (Vec::new(), 0usize, 0usize);
    let t3 = std::time::Instant::now();
    while i < frames.len() {
        let k = [4usize, 6, 8, 25][j % 4].min(frames.len() - i);
        streamed.extend(eng.codec_stream_decode(&mut cs, &frames[i..i + k]).unwrap());
        i += k;
        j += 1;
    }
    println!(
        "codec dạng luồng: {} mẫu (một lần: {}), {:.2}s, max|Δ| = {:e}",
        streamed.len(),
        wav.len(),
        t3.elapsed().as_secs_f32(),
        if streamed.len() == wav.len() {
            max_abs(&streamed, &wav)
        } else {
            f32::NAN
        }
    );
    assert_eq!(streamed.len(), wav.len(), "độ dài khác giải mã một lần");
    assert!(max_abs(&streamed, &wav) < 1e-3, "luồng khác giải mã một lần");
    assert_eq!(frames.len(), want_frames.len(), "số khung khác SDK");
    assert_eq!(same, want_frames.len(), "có khung khác SDK");
}
