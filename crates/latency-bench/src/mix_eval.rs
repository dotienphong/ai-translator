//! `latency-bench mix-eval` (spec 2026-10-24-nguon-micro §6.3): với mỗi phương án, dựng luồng cho whisper và luồng cho VAD
//! từ bản thu hai file của một cảnh (trộn thẳng, nhường lời, khử vọng, lọc ồn, lọc 80 Hz), cắt đoạn bằng đúng `Segmenter`
//! và Silero của app (VAD nghe luồng VAD, đoạn lấy âm thanh từ luồng whisper), chép lời bằng `asr-worker`, áp luật lọc
//! của app, rồi ghi mỗi đoạn một dòng JSONL để `score_mix.py` chấm.
//!
//! Không chạy hàng đợi, ghép câu hay bước dịch của engine: chỉ đo chữ, nên chạy nhanh hơn thời gian thực. Không dùng
//! prompt của đoạn trước (như `asr-eval`); giữ ngôn ngữ đoạn trước như app.

use crate::wavio::{read_wav_mono, write_wav16};
use anyhow::{Context, Result, bail};
use asr_protocol::{TranscribeRequest, audio_ctx_for_samples};
use audio_capture::duck::{DuckingMixer, GateParams};
use audio_capture::highpass::HighPass;
use pipeline::asr_client::{AsrLaunch, AsrWorker};
use pipeline::config::PipelineConfig;
use pipeline::filter::{Evidence, Verdict, is_short, pcm_skip, verdict};
use pipeline::segmenter::{FRAME_SAMPLES, Segmenter, SegmenterConfig};
use pipeline::text::display_text;
use pipeline::vad::SileroVad;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Playback,
    Mic,
    Both,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GateSpec {
    pub threshold_dbfs: f32,
    /// `null`: tắt hẳn micro khi hạ.
    pub duck_db: Option<f32>,
    pub hold_ms: u32,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct VadSpec {
    pub threshold: f32,
    pub min_speech_ms: u64,
}

impl Default for VadSpec {
    fn default() -> Self {
        Self {
            threshold: 0.5,
            min_speech_ms: 250,
        }
    }
}

fn default_mic() -> String {
    "mic.wav".into()
}

fn yes() -> bool {
    true
}

/// Một phương án. File của micro tính trong thư mục cảnh.
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Variant {
    pub name: String,
    pub mode: Mode,
    /// Micro cho whisper (ví dụ `mic.wav`, `mic-aec.wav`).
    #[serde(default = "default_mic")]
    pub mic: String,
    /// Micro cho VAD (ví dụ `mic-rnnoise.wav`); không có thì dùng `mic`.
    #[serde(default)]
    pub mic_vad: Option<String>,
    /// Whisper cũng nghe bản của VAD (lớp 3: "cả hai cùng nghe bản đã lọc").
    #[serde(default)]
    pub whisper_hears_vad: bool,
    /// Lọc 80 Hz trên micro (lớp 1).
    #[serde(default = "yes")]
    pub highpass: bool,
    /// Nhường lời; không có thì trộn thẳng.
    #[serde(default)]
    pub gate: Option<GateSpec>,
    #[serde(default)]
    pub vad: VadSpec,
    /// Khuếch đại cố định cả hai bản micro (dB), trước mọi lớp khác; dương thì qua bộ chặn mềm `tanh` để tiếng gõ to không
    /// bị xén cứng. Đo xem giọng ở xa có cần tự cân mức không (Task 16: giọng thật ở 1 m chỉ khoảng −45 dBFS).
    #[serde(default)]
    pub gain_db: f32,
    /// Tự cân mức (AGC): mức đích của tiếng nói, dBFS. Có thì dùng thay `gain_db` (xem [`agc`]).
    #[serde(default)]
    pub agc_target_dbfs: Option<f32>,
}

/// Tự cân mức đơn giản cho micro (đo ở spike, sau Task 16): theo khung 10 ms, theo dõi mức nền (xuống ngay, lên chậm
/// khoảng 5 dB/giây) và mức tiếng nói (chỉ cập nhật ở khung cao hơn nền từ 10 dB, hằng số khoảng 200 ms). Độ khuếch đại
/// tiến dần tới `target − mức tiếng nói` (tối đa 0,2 dB mỗi khung), kẹp trong [0, `max_gain_db`], rồi chặn mềm `tanh`.
/// Tiếng gõ to làm mức tiếng nói đo được tăng, nên khuếch đại tự giảm. Trả về chuỗi hệ số (tuyến tính) cho từng mẫu.
pub fn agc_gains(x: &[f32], target_dbfs: f32, max_gain_db: f32) -> Vec<f32> {
    const FRAME: usize = 160;
    // Mức nền khởi đầu bằng khung đầu tiên: khởi đầu quá thấp thì tiếng ồn nền bị coi là tiếng nói mấy giây đầu.
    let mut floor: Option<f32> = None;
    let mut speech = target_dbfs;
    let mut gain_db = 0.0f32;
    let mut gains = Vec::with_capacity(x.len());
    for frame in x.chunks(FRAME) {
        let rms = (frame.iter().map(|v| v * v).sum::<f32>() / frame.len() as f32).sqrt();
        let level = 20.0 * rms.max(1e-9).log10();
        let f = match floor {
            Some(f) if level >= f => f + 0.05,
            _ => level,
        };
        floor = Some(f);
        if level > f + 10.0 {
            speech += 0.05 * (level - speech);
        }
        let want = (target_dbfs - speech).clamp(0.0, max_gain_db);
        gain_db += (want - gain_db).clamp(-0.2, 0.2);
        let g = 10f32.powf(gain_db / 20.0);
        gains.extend(std::iter::repeat_n(g, frame.len()));
    }
    gains
}

/// Áp [`agc_gains`] rồi chặn mềm (dùng trong test; `build_views` áp cùng hệ số cho hai bản micro).
#[cfg(test)]
fn agc(x: &[f32], target_dbfs: f32, max_gain_db: f32) -> Vec<f32> {
    agc_gains(x, target_dbfs, max_gain_db)
        .iter()
        .zip(x)
        .map(|(g, v)| (v * g).tanh())
        .collect()
}

/// Luồng cho whisper và luồng cho VAD của một phương án, cùng độ dài.
pub fn build_views(v: &Variant, playback: &[f32], mic: &[f32], mic_vad: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let mut mic = mic.to_vec();
    let mut mic_vad = mic_vad.to_vec();
    let len = mic.len().min(mic_vad.len());
    mic.truncate(len);
    mic_vad.truncate(len);
    if let Some(target) = v.agc_target_dbfs {
        // Hệ số tính trên bản cho whisper, áp cùng một chuỗi cho bản VAD để hai bản vẫn thẳng hàng về mức.
        let gains = agc_gains(&mic, target, 30.0);
        for (x, g) in mic.iter_mut().zip(&gains) {
            *x = (*x * g).tanh();
        }
        for (x, g) in mic_vad.iter_mut().zip(&gains) {
            *x = (*x * g).tanh();
        }
    } else if v.gain_db > 0.0 {
        let g = 10f32.powf(v.gain_db / 20.0);
        for x in mic.iter_mut().chain(mic_vad.iter_mut()) {
            *x = (*x * g).tanh();
        }
    }
    if v.highpass {
        HighPass::new(16_000, 80.0).process(&mut mic);
        HighPass::new(16_000, 80.0).process(&mut mic_vad);
    }
    if v.whisper_hears_vad {
        mic.clone_from(&mic_vad);
    }
    match v.mode {
        Mode::Playback => (playback.to_vec(), playback.to_vec()),
        Mode::Mic => (mic, mic_vad),
        Mode::Both => {
            let params = v.gate.map_or(GateParams::OFF, |g| GateParams {
                threshold_dbfs: g.threshold_dbfs,
                duck_db: g.duck_db.unwrap_or(f32::NEG_INFINITY),
                hold_ms: g.hold_ms,
            });
            // Offline: ghép theo chỉ số, không phát riêng phần dư giữa chừng.
            let mut mixer = DuckingMixer::new(params, usize::MAX);
            mixer.push_playback(playback);
            mixer.push_mic(&mic, &mic_vad);
            let (mut asr, mut vad) = (Vec::new(), Vec::new());
            mixer.flush_into(&mut asr, &mut vad);
            (asr, vad)
        }
    }
}

#[derive(clap::Args)]
pub struct MixEvalArgs {
    /// Thư mục cảnh: `mic.wav`, có thể có `playback.wav` và các file do `denoise`, `aec`, `align` sinh ra.
    #[arg(long)]
    scene: PathBuf,
    /// File JSON: mảng phương án (`make_variants.py`).
    #[arg(long)]
    variants: PathBuf,
    #[arg(long)]
    asr_worker: PathBuf,
    #[arg(long)]
    asr_model: PathBuf,
    /// `silero_vad_v6.2.3.onnx` (thư mục `models/` của thư mục chính).
    #[arg(long)]
    vad_model: PathBuf,
    #[arg(long, value_delimiter = ',', default_value = "en,zh,ja,ko,vi")]
    languages: Vec<String>,
    /// Thư mục kết quả: mỗi phương án một `<name>.jsonl`. Phương án đã có file thì bỏ qua, nên chạy tiếp được.
    #[arg(long)]
    out: PathBuf,
    /// Ghi thêm `<name>.asr.wav`, `<name>.vad.wav` để nghe lại.
    #[arg(long)]
    save_wav: bool,
    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    use_gpu: bool,
    #[arg(long, default_value_t = 4)]
    threads: u32,
}

#[derive(Serialize)]
struct Row<'a> {
    variant: &'a str,
    seg: u64,
    start_ms: u64,
    end_ms: u64,
    speech_ms: u64,
    mean_prob: f32,
    speech_ratio: f32,
    lang: String,
    lang_prob: f32,
    text: String,
    /// `Speech`, `NoSpeech`, `Hallucination`, `Repetition`, `Filler`, hay `TooShort` (không gửi worker).
    verdict: String,
    /// Câu ngắn theo `filter::is_short`: `score_mix.py` dò ngưỡng `ShortUnsure` trên các dòng này mà không chép lời lại.
    short: bool,
    no_speech_prob: f32,
    avg_logprob: f32,
    asr_ms: f32,
}

fn load(scene: &Path, name: &str) -> Result<Vec<f32>> {
    let path = scene.join(name);
    let (x, rate) = read_wav_mono(&path)?;
    if rate != 16_000 {
        bail!("{} phải là 16 kHz", path.display());
    }
    Ok(x)
}

pub fn run(args: MixEvalArgs) -> Result<()> {
    let variants: Vec<Variant> = serde_json::from_reader(
        std::fs::File::open(&args.variants).with_context(|| format!("không mở được {}", args.variants.display()))?,
    )?;
    std::fs::create_dir_all(&args.out)?;
    let base = PipelineConfig::default();
    let log = args.out.join("asr-worker.log");
    let launch = AsrLaunch {
        use_gpu: args.use_gpu,
        n_threads: args.threads,
        request_timeout: crate::latency::TOOL_REQUEST_TIMEOUT,
        ..AsrLaunch::new(&args.asr_worker, &args.asr_model, &log)
    };
    let (mut worker, ready) = AsrWorker::spawn(&launch)?;
    worker.warmup()?;
    println!("asr: {} ({})", ready.backend.as_str(), ready.whisper_version);
    for v in &variants {
        let out_path = args.out.join(format!("{}.jsonl", v.name));
        if out_path.exists() {
            println!("{}: đã có, bỏ qua", v.name);
            continue;
        }
        let playback = if v.mode == Mode::Mic {
            Vec::new()
        } else {
            load(&args.scene, "playback.wav")?
        };
        let (mic, mic_vad) = if v.mode == Mode::Playback {
            (Vec::new(), Vec::new())
        } else {
            let mic = load(&args.scene, &v.mic)?;
            let mic_vad = match &v.mic_vad {
                Some(name) => load(&args.scene, name)?,
                None => mic.clone(),
            };
            (mic, mic_vad)
        };
        let (asr_view, vad_view) = build_views(v, &playback, &mic, &mic_vad);
        if args.save_wav {
            write_wav16(&args.out.join(format!("{}.asr.wav", v.name)), &asr_view)?;
            write_wav16(&args.out.join(format!("{}.vad.wav", v.name)), &vad_view)?;
        }
        let mut vad = SileroVad::load(&args.vad_model)?;
        let mut segmenter = Segmenter::new(SegmenterConfig {
            threshold: v.vad.threshold,
            min_speech_ms: v.vad.min_speech_ms,
            end_silence_ms: 50,
            ..base.segmenter.clone()
        });
        let mut segments = Vec::new();
        for i in 0..asr_view.len().min(vad_view.len()) / FRAME_SAMPLES {
            let frame = i * FRAME_SAMPLES..(i + 1) * FRAME_SAMPLES;
            let prob = vad.prob(&vad_view[frame.clone()])?;
            segments.extend(segmenter.push(&asr_view[frame], prob));
        }
        segments.extend(segmenter.flush());

        let mut part = out_path.clone().into_os_string();
        part.push(".part");
        let part = PathBuf::from(part);
        let mut file = std::io::BufWriter::new(std::fs::File::create(&part)?);
        let mut prev_lang: Option<String> = None;
        let (mut kept, total) = (0usize, segments.len());
        for s in segments {
            let mut row = Row {
                variant: &v.name,
                seg: s.id,
                start_ms: s.start_ms,
                end_ms: s.end_ms,
                speech_ms: s.speech_ms,
                mean_prob: s.mean_prob,
                speech_ratio: s.speech_ratio,
                lang: String::new(),
                lang_prob: 0.0,
                text: String::new(),
                verdict: "TooShort".into(),
                short: false,
                no_speech_prob: 0.0,
                avg_logprob: 0.0,
                asr_ms: 0.0,
            };
            if pcm_skip(s.samples.len()).is_none() {
                let pcm: Vec<i16> = s
                    .samples
                    .iter()
                    .map(|&x| (x.clamp(-1.0, 1.0) * 32_767.0) as i16)
                    .collect();
                let r = worker.transcribe(TranscribeRequest {
                    segment_id: s.id,
                    audio_ctx: audio_ctx_for_samples(pcm.len()),
                    pcm,
                    languages: args.languages.clone(),
                    prompt_tokens: Vec::new(),
                    prev_lang: prev_lang.clone(),
                })?;
                let text = display_text(&r.lang, &r.text, &base.filter);
                let ev = Evidence {
                    no_speech_prob: r.no_speech_prob,
                    avg_logprob: r.avg_logprob,
                    vad_mean_prob: s.mean_prob,
                    speech_ms: s.speech_ms,
                };
                let found = verdict(&ev, &text, &base.filter);
                if found == Verdict::Speech {
                    prev_lang = Some(r.lang.clone());
                    kept += 1;
                }
                row.short = is_short(&text, &base.filter);
                row.verdict = format!("{found:?}");
                row.lang = r.lang;
                row.lang_prob = r.lang_prob;
                row.text = text;
                row.no_speech_prob = r.no_speech_prob;
                row.avg_logprob = r.avg_logprob;
                row.asr_ms = r.asr_ms + r.lid_ms;
            }
            writeln!(file, "{}", serde_json::to_string(&row)?)?;
        }
        file.flush()?;
        drop(file);
        std::fs::rename(&part, &out_path)?;
        println!("{}: {total} đoạn, giữ {kept}", v.name);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn variant(json: &str) -> Variant {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn defaults() {
        let v = variant(r#"{"name": "x", "mode": "mic"}"#);
        assert_eq!(v.mic, "mic.wav");
        assert!(v.highpass && v.gate.is_none() && v.mic_vad.is_none() && !v.whisper_hears_vad);
        assert_eq!(v.vad, VadSpec::default());
    }

    #[test]
    fn mic_mode_gives_the_vad_file_to_the_vad_only() {
        let v = variant(r#"{"name": "x", "mode": "mic", "highpass": false}"#);
        let (asr, vad) = build_views(&v, &[], &[0.1; 100], &[0.0; 100]);
        assert!(asr.iter().all(|&s| s == 0.1));
        assert!(vad.iter().all(|&s| s == 0.0));
        let v = variant(r#"{"name": "x", "mode": "mic", "highpass": false, "whisper_hears_vad": true}"#);
        let (asr, _) = build_views(&v, &[], &[0.1; 100], &[0.0; 100]);
        assert!(asr.iter().all(|&s| s == 0.0));
    }

    #[test]
    fn both_without_a_gate_is_a_plain_sum_over_the_longer_file() {
        let v = variant(r#"{"name": "x", "mode": "both", "highpass": false}"#);
        let (asr, vad) = build_views(&v, &[0.2; 100], &[0.1; 120], &[0.1; 120]);
        assert_eq!(asr.len(), 120);
        assert_eq!(vad.len(), 120);
        assert!((asr[50] - 0.3).abs() < 1e-6);
        assert!((asr[110] - 0.1).abs() < 1e-6);
    }

    #[test]
    fn both_with_a_gate_ducks_the_mic() {
        let v = variant(
            r#"{"name": "x", "mode": "both", "highpass": false,
                "gate": {"threshold_dbfs": -45, "duck_db": -20, "hold_ms": 300}}"#,
        );
        let (asr, _) = build_views(&v, &[0.1; 1_600], &[0.5; 1_600], &[0.5; 1_600]);
        assert!((asr[1_000] - 0.15).abs() < 1e-5, "{}", asr[1_000]);
    }

    #[test]
    fn gain_amplifies_the_mic_with_a_soft_limit() {
        let v = variant(r#"{"name": "x", "mode": "mic", "highpass": false, "gain_db": 20}"#);
        let (asr, vad) = build_views(&v, &[], &[0.01, 0.5, -0.5], &[0.01, 0.5, -0.5]);
        // Tiếng nhỏ: gần đúng ×10.
        assert!((asr[0] - 0.1).abs() < 0.002, "{}", asr[0]);
        // Tiếng to: bị chặn mềm dưới 1, giữ dấu.
        assert!(asr[1] > 0.99 && asr[1] < 1.0 && asr[2] < -0.99);
        assert_eq!(asr, vad);
    }

    #[test]
    fn agc_raises_quiet_speech_towards_the_target_and_not_the_noise_floor() {
        // 1 giây nền −60 dBFS, rồi 4 giây "tiếng nói" −45 dBFS (sin 300 Hz).
        let mut x: Vec<f32> = (0..16_000).map(|i| if i % 2 == 0 { 0.001 } else { -0.001 }).collect();
        x.extend((0..64_000).map(|i| 0.0079 * (2.0 * std::f32::consts::PI * 300.0 * i as f32 / 16_000.0).sin()));
        let out = agc(&x, -23.0, 30.0);
        let db = |s: &[f32]| 20.0 * ((s.iter().map(|v| v * v).sum::<f32>() / s.len() as f32).sqrt()).log10();
        // Nền chưa có tiếng nói: không khuếch đại.
        assert!(
            (db(&out[..16_000]) - db(&x[..16_000])).abs() < 1.0,
            "{}",
            db(&out[..16_000])
        );
        // Giây cuối: tiếng nói đã được đưa lên gần −23 dBFS (RMS sin −45 dBFS → khoảng −26 dBFS sau tanh).
        let tail = db(&out[64_000..]);
        assert!((-28.0..=-20.0).contains(&tail), "{tail}");
    }

    #[test]
    fn playback_mode_ignores_the_mic() {
        let v = variant(r#"{"name": "x", "mode": "playback"}"#);
        let (asr, vad) = build_views(&v, &[0.2; 10], &[0.9; 10], &[0.9; 10]);
        assert_eq!(asr, vec![0.2; 10]);
        assert_eq!(vad, vec![0.2; 10]);
    }
}
