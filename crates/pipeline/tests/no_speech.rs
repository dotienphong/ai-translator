//! Việc cho MVP §6.4 (Đ12 của kế hoạch 00; Q11 của review 02b): `no_speech_prob` và `avg_logprob` của `asr-worker` thật
//! trên âm thanh không có tiếng nói, và luật lọc của app (`filter::verdict`) có bỏ được đoạn đó không. Đặt thêm
//! `MT_VAD_MODEL` thì in cả số đoạn mà VAD của app (Silero, luật cắt đoạn mặc định) cắt ra từ tín hiệu (0 nghĩa là trong
//! app tín hiệu đó không bao giờ tới `asr-worker`), và luật lọc dùng xác suất VAD trung bình của đoạn đầu như app. Tín hiệu
//! tổng hợp: im lặng, nhiễu trắng, nhiễu hồng, tiếng ù điện, tiếng gõ phím, hợp âm. Thêm file WAV bất kỳ (ví dụ clip nhạc
//! CC0) qua `NO_SPEECH_WAVS`, mỗi file 16 kHz mono 16-bit, cắt thành đoạn 8 giây như VAD (tối đa 10 đoạn mỗi file).
//!
//! Mỗi tín hiệu (hay đoạn 8 giây của file WAV) được gửi cho worker nguyên cả đoạn, không theo từng đoạn VAD cắt ra (N-4
//! của review 02 lần 2): VAD chỉ dùng để đếm số đoạn và lấy xác suất VAD của đoạn đầu. Trong app, worker chỉ nhận đoạn
//! VAD đã cắt; chữ bịa và `avg_logprob` của đoạn ngắn đó có thể khác số in ở đây.
//!
//! Đây là phép thử để chọn ngưỡng, không phải test hồi quy: không kiểm theo số đo, chỉ kiểm worker trả kết quả cho mọi
//! đoạn. Cần binary và model nên bị bỏ qua mặc định. Chạy từ gốc repo, một lần cho mỗi model:
//!
//! ```text
//! MT_ASR_WORKER=$PWD/target/release/asr-worker MT_ASR_MODEL=$PWD/models/ggml-large-v3-turbo-q5_0.bin \
//! MT_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx NO_SPEECH_WAVS=<clip.wav,…> \
//! cargo test -p pipeline --test no_speech -- --include-ignored --nocapture
//! ```
//!
//! Đổi file nhạc sang đúng định dạng trên Mac: `afconvert -f WAVE -d LEI16@16000 -c 1 vào.m4a ra.wav`.
//! Mỗi đoạn in một dòng JSON; dòng cuối là các đoạn mà app sẽ hiện thành phụ đề: `verdict` là `Speech`, và VAD có cắt ra
//! đoạn (khi đặt `MT_VAD_MODEL`).

use asr_protocol::{TranscribeRequest, audio_ctx_for_samples};
use pipeline::asr_client::{AsrLaunch, AsrWorker};
use pipeline::config::{FilterConfig, PipelineConfig};
use pipeline::filter::{Evidence, Verdict, compression_ratio, verdict};
use pipeline::segmenter::{FRAME_SAMPLES, Segment, Segmenter};
use pipeline::text::display_text;
use pipeline::vad::SileroVad;
use std::f32::consts::TAU;
use std::path::PathBuf;

const RATE: usize = 16_000;

/// Sinh số giả ngẫu nhiên tất định (xorshift), để mọi lần chạy cùng một tín hiệu.
struct Rng(u32);

impl Rng {
    /// Số thực trong [-1, 1).
    fn next(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        (self.0 as f32 / u32::MAX as f32) * 2.0 - 1.0
    }
}

fn scale_to_rms(mut x: Vec<f32>, rms: f32) -> Vec<f32> {
    let now = (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt();
    if now > 0.0 {
        x.iter_mut().for_each(|v| *v *= rms / now);
    }
    x
}

fn white(n: usize, rms: f32) -> Vec<f32> {
    let mut r = Rng(0x9e37_79b9);
    scale_to_rms((0..n).map(|_| r.next()).collect(), rms)
}

/// Nhiễu hồng theo bộ lọc của Paul Kellet (tiếng ồn nền kiểu quạt, điều hòa).
fn pink(n: usize, rms: f32) -> Vec<f32> {
    let mut r = Rng(0x85eb_ca6b);
    let mut b = [0.0f32; 7];
    let x = (0..n)
        .map(|_| {
            let w = r.next();
            b[0] = 0.99886 * b[0] + w * 0.0555179;
            b[1] = 0.99332 * b[1] + w * 0.0750759;
            b[2] = 0.96900 * b[2] + w * 0.153852;
            b[3] = 0.86650 * b[3] + w * 0.3104856;
            b[4] = 0.55000 * b[4] + w * 0.5329522;
            b[5] = -0.7616 * b[5] - w * 0.016898;
            let y = b.iter().sum::<f32>() + w * 0.5362;
            b[6] = w * 0.115926;
            y
        })
        .collect();
    scale_to_rms(x, rms)
}

/// Tiếng ù điện 50 Hz cùng các họa âm lẻ.
fn hum(n: usize, rms: f32) -> Vec<f32> {
    let x = (0..n)
        .map(|i| {
            let t = i as f32 / RATE as f32;
            [1.0, 3.0, 5.0, 7.0]
                .iter()
                .map(|k| (TAU * 50.0 * k * t).sin() / k)
                .sum()
        })
        .collect();
    scale_to_rms(x, rms)
}

/// Tiếng gõ phím: tiếng tách ngắn (nhiễu tắt dần trong 15 ms) cách nhau 120–250 ms.
fn typing(n: usize, rms: f32) -> Vec<f32> {
    let mut r = Rng(0xc2b2_ae35);
    let mut x = vec![0.0f32; n];
    let mut at = 0usize;
    while at < n {
        for (k, v) in x.iter_mut().skip(at).take(240).enumerate() {
            *v = r.next() * (-(k as f32) / 40.0).exp();
        }
        at += 1_920 + ((r.next() + 1.0) * 1_040.0) as usize;
    }
    scale_to_rms(x, rms)
}

/// Hợp âm La trưởng đổi nhịp mỗi nửa giây, có rung biên độ: thay cho nhạc khi chưa có clip.
fn chords(n: usize, rms: f32) -> Vec<f32> {
    let x = (0..n)
        .map(|i| {
            let t = i as f32 / RATE as f32;
            let root = if (i / (RATE / 2)).is_multiple_of(2) {
                220.0
            } else {
                293.66
            };
            let tremolo = 0.75 + 0.25 * (TAU * 5.0 * t).sin();
            [1.0, 1.26, 1.5].iter().map(|k| (TAU * root * k * t).sin()).sum::<f32>() * tremolo
        })
        .collect();
    scale_to_rms(x, rms)
}

fn signals() -> Vec<(String, Vec<f32>)> {
    let mut out = Vec::new();
    for secs in [3usize, 8] {
        let n = secs * RATE;
        out.push((format!("im lặng {secs}s"), vec![0.0; n]));
        out.push((format!("nhiễu trắng −60 dBFS {secs}s"), white(n, 0.001)));
        out.push((format!("nhiễu trắng −30 dBFS {secs}s"), white(n, 0.0316)));
        out.push((format!("nhiễu hồng −26 dBFS {secs}s"), pink(n, 0.05)));
        out.push((format!("ù điện 50 Hz −26 dBFS {secs}s"), hum(n, 0.05)));
        out.push((format!("gõ phím −30 dBFS {secs}s"), typing(n, 0.0316)));
        out.push((format!("hợp âm −20 dBFS {secs}s"), chords(n, 0.1)));
    }
    for path in std::env::var("NO_SPEECH_WAVS")
        .unwrap_or_default()
        .split(',')
        .filter(|p| !p.is_empty())
    {
        let mut reader = hound::WavReader::open(path).unwrap_or_else(|e| panic!("{path}: {e}"));
        let spec = reader.spec();
        assert!(
            spec.sample_rate == RATE as u32 && spec.channels == 1 && spec.bits_per_sample == 16,
            "{path}: cần 16 kHz mono 16-bit (xem đầu file)"
        );
        let x: Vec<f32> = reader.samples::<i16>().map(|s| s.unwrap() as f32 / 32768.0).collect();
        let name = std::path::Path::new(path)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        for (k, chunk) in x.chunks(8 * RATE).take(10).enumerate() {
            if chunk.len() >= RATE {
                out.push((format!("{name} #{k}"), chunk.to_vec()));
            }
        }
    }
    out
}

/// Các đoạn mà VAD và luật cắt đoạn mặc định của app cắt ra từ tín hiệu.
fn vad_segments(vad: &mut SileroVad, samples: &[f32]) -> Vec<Segment> {
    vad.reset().unwrap();
    let mut segmenter = Segmenter::new(PipelineConfig::default().segmenter);
    let mut out = Vec::new();
    for frame in samples.as_chunks::<FRAME_SAMPLES>().0 {
        let prob = vad.prob(frame).unwrap();
        out.extend(segmenter.push(frame, prob));
    }
    out.extend(segmenter.flush());
    out
}

fn env(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("đặt {name}")))
}

#[test]
#[ignore = "cần model và binary thật, xem đầu file"]
fn no_speech_signals_through_the_real_worker() {
    // Silero chạy bằng candle cần stack lớn hơn mặc định của luồng test ở bản debug (như luồng VAD của engine).
    std::thread::Builder::new()
        .stack_size(8 << 20)
        .spawn(run)
        .unwrap()
        .join()
        .unwrap();
}

fn run() {
    let log = std::env::temp_dir().join(format!("pipeline-no-speech-{}.log", std::process::id()));
    let (mut worker, ready) = AsrWorker::spawn(&AsrLaunch::new(&env("MT_ASR_WORKER"), &env("MT_ASR_MODEL"), &log))
        .expect("asr-worker chạy được");
    println!("{{\"backend\":\"{}\"}}", ready.backend.as_str());
    let cfg = FilterConfig::default();
    let mut vad = std::env::var_os("MT_VAD_MODEL").map(|p| SileroVad::load(std::path::Path::new(&p)).unwrap());
    let all = signals();
    let mut shown = Vec::new();
    for (id, (name, samples)) in all.iter().enumerate() {
        let pcm: Vec<i16> = samples
            .iter()
            .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .collect();
        let r = worker
            .transcribe(TranscribeRequest {
                segment_id: id as u64,
                audio_ctx: audio_ctx_for_samples(pcm.len()),
                prompt_tokens: Vec::new(),
                pcm,
                languages: ["en", "zh", "ja", "ko", "vi"].map(String::from).to_vec(),
                prev_lang: None,
            })
            .unwrap_or_else(|e| panic!("{name}: {e}"));
        let text = display_text(&r.lang, &r.text, &cfg);
        let cut = vad.as_mut().map(|vad| vad_segments(vad, samples));
        // Như app: đoạn có xác suất VAD và độ dài tiếng nói của nó. Không có VAD thì cả tín hiệu là một đoạn chắc chắn.
        let (vad_mean_prob, speech_ms) = match cut.as_deref() {
            Some([first, ..]) => (first.mean_prob, first.speech_ms),
            _ => (1.0, (samples.len() * 1000 / RATE) as u64),
        };
        let evidence = Evidence {
            no_speech_prob: r.no_speech_prob,
            avg_logprob: r.avg_logprob,
            vad_mean_prob,
            speech_ms,
        };
        let v = verdict(&evidence, &text, &cfg);
        let segments = cut.as_ref().map(Vec::len);
        println!(
            "{}",
            serde_json::json!({
                "signal": name, "lang": r.lang, "lang_prob": r.lang_prob, "no_speech_prob": r.no_speech_prob,
                "avg_logprob": r.avg_logprob, "vad_segments": segments,
                "vad_mean_prob": cut.as_ref().and_then(|c| c.first()).map(|s| s.mean_prob),
                "compression_ratio": compression_ratio(&text), "verdict": format!("{v:?}"), "text": text,
            })
        );
        if v == Verdict::Speech && segments != Some(0) {
            shown.push(name.clone());
        }
    }
    println!(
        "{{\"segments\":{},\"shown_as_subtitle\":{},\"shown\":{:?}}}",
        all.len(),
        shown.len(),
        shown
    );
    let _ = std::fs::remove_file(&log);
}
