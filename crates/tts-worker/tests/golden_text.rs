//! Đối chiếu `frames`, `text`, `speech` với SDK `vieneu` (bản tham chiếu). Sinh lại bằng
//! `python3 crates/tts-worker/gen/golden_text.py` từ gốc repo (cần `pip install vieneu`).

use serde::Deserialize;
use tts_worker::frames::{is_cue_only, max_expected_frames, syllable_count};
use tts_worker::speech::{babble_suspect, count_speech_bursts, edge_silence, pause_pad_samples};
use tts_worker::text::split_into_sentences;

#[derive(Deserialize)]
struct FrameCase {
    phonemes: String,
    syl: usize,
    cue: bool,
    cap: usize,
}
#[derive(Deserialize)]
struct SentCase {
    text: String,
    out: Vec<String>,
}
#[derive(Deserialize)]
struct Spec(u32, usize, Vec<(usize, usize, f32)>);
#[derive(Deserialize)]
struct WaveCase {
    lead: usize,
    tail: usize,
    bursts: usize,
}
#[derive(Deserialize)]
struct PadCase {
    i: usize,
    j: usize,
    pause: f32,
    pad: usize,
}
#[derive(Deserialize)]
struct BabbleCase {
    ph: String,
    wi: usize,
    cap: usize,
    nf: Option<usize>,
    suspect: bool,
    syl: usize,
    bursts: usize,
    n_frames: usize,
}
#[derive(Deserialize)]
struct Golden {
    frames: Vec<FrameCase>,
    sentences: Vec<SentCase>,
    specs: Vec<Spec>,
    waves: Vec<WaveCase>,
    pads: Vec<PadCase>,
    babble: Vec<BabbleCase>,
}

fn golden() -> Golden {
    serde_json::from_str(include_str!("golden_text.json")).expect("golden_text.json")
}

/// Sóng giả xác định (LCG số nguyên), giống `lcg_wave` trong gen/golden_text.py.
fn lcg_wave(spec: &Spec) -> Vec<f32> {
    let Spec(seed, n, segs) = spec;
    let mut x: u64 = u64::from(*seed);
    let mut amp = vec![0.0004f32; *n];
    for (a, b, g) in segs {
        for v in &mut amp[*a..(*b).min(*n)] {
            *v = *g;
        }
    }
    (0..*n)
        .map(|i| {
            x = (x * 1_664_525 + 1_013_904_223) % (1u64 << 32);
            let r = ((x >> 8) & 0xFFFF) as f32 / 32768.0 - 1.0;
            r * amp[i]
        })
        .collect()
}

#[test]
fn frames_match_reference_sdk() {
    for (n, c) in golden().frames.iter().enumerate() {
        assert_eq!(
            syllable_count(&c.phonemes),
            c.syl,
            "ca {n} syllable_count({:?})",
            c.phonemes
        );
        assert_eq!(is_cue_only(&c.phonemes), c.cue, "ca {n} is_cue_only({:?})", c.phonemes);
        assert_eq!(
            max_expected_frames(&c.phonemes),
            c.cap,
            "ca {n} max_expected_frames({:?})",
            c.phonemes
        );
    }
}

#[test]
fn sentence_split_matches_reference_sdk() {
    for (n, c) in golden().sentences.iter().enumerate() {
        assert_eq!(split_into_sentences(&c.text), c.out, "ca {n}: {:?}", c.text);
    }
}

#[test]
fn speech_measures_match_reference_sdk() {
    let g = golden();
    let waves: Vec<Vec<f32>> = g.specs.iter().map(lcg_wave).collect();
    for (k, c) in g.waves.iter().enumerate() {
        assert_eq!(
            edge_silence(&waves[k], 48_000),
            (c.lead, c.tail),
            "sóng {k}: edge_silence"
        );
        assert_eq!(count_speech_bursts(&waves[k], 48_000), c.bursts, "sóng {k}: số cụm");
    }
    for c in &g.pads {
        assert_eq!(
            pause_pad_samples(&waves[c.i], &waves[c.j], 48_000, c.pause),
            c.pad,
            "pad {}->{}",
            c.i,
            c.j
        );
    }
    for (n, c) in g.babble.iter().enumerate() {
        let r = babble_suspect(&waves[c.wi], 48_000, &c.ph, c.cap, c.nf);
        assert_eq!(
            (r.suspect, r.syllables, r.bursts, r.n_frames),
            (c.suspect, c.syl, c.bursts, c.n_frames),
            "babble ca {n}: ph={:?} sóng {} cap {} nf {:?}",
            c.ph,
            c.wi,
            c.cap,
            c.nf
        );
    }
}
