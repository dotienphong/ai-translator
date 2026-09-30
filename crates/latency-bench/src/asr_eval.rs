//! Chép lời từng clip của bộ A4 qua `asr-worker`, ghi kết quả để `score_asr.py` tính WER/CER.

use anyhow::{Context, Result, bail};
use asr_protocol::{TranscribeRequest, audio_ctx_for_samples};
use pipeline::asr_client::AsrWorker;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::time::Instant;

#[derive(clap::Args)]
pub struct AsrEvalArgs {
    /// JSONL do `build_clips.py` tạo: mỗi dòng có id, lang, path (tương đối với file manifest), ref.
    #[arg(long)]
    manifest: PathBuf,
    #[arg(long)]
    asr_worker: PathBuf,
    #[arg(long)]
    asr_model: PathBuf,
    #[arg(long, value_delimiter = ',', default_value = "en,zh,ja,ko,vi")]
    languages: Vec<String>,
    /// Khóa ngôn ngữ theo nhãn của clip thay vì tự nhận diện.
    #[arg(long)]
    lock_language: bool,
    /// Dùng cửa sổ mã hóa 30 giây đầy đủ (audio_ctx = 1500), để so với cách rút ngắn.
    #[arg(long)]
    full_ctx: bool,
    /// Sàn cho audio_ctx, từ 0 đến 1500 (mặc định 0: không đặt sàn): audio_ctx = max(công thức, N).
    /// Để thử đặt sàn, vì turbo lặp câu ở đoạn ngắn khi audio_ctx theo công thức 50 × số giây + 64.
    /// Không dùng chung với `--full-ctx`.
    #[arg(
        long,
        default_value_t = 0,
        value_parser = clap::value_parser!(i32).range(0..=1500),
        conflicts_with = "full_ctx"
    )]
    min_ctx: i32,
    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    use_gpu: bool,
    #[arg(long, default_value_t = 4)]
    threads: u32,
    #[arg(long)]
    out: PathBuf,
    #[arg(long, default_value = "logs")]
    log_dir: PathBuf,
}

#[derive(Deserialize)]
struct Clip {
    id: String,
    lang: String,
    path: String,
}

#[derive(Serialize)]
struct Output {
    id: String,
    lang_ref: String,
    lang_hyp: String,
    lang_prob: f32,
    hyp: String,
    /// Đoạn có giá trị > 0,6 sẽ bị app bỏ (§6.4); trên clip có tiếng nói thì phải hiếm.
    no_speech_prob: f32,
    lid_ms: f32,
    asr_ms: f32,
    /// Thời gian ngoài whisper: mã hóa khung, truyền qua pipe, giải mã khung (giả định 10, §14).
    ipc_ms: f32,
    audio_ms: u64,
    decode_mode: String,
}

pub fn run(args: AsrEvalArgs) -> Result<()> {
    std::fs::create_dir_all(&args.log_dir)?;
    let base = args
        .manifest
        .parent()
        .context("manifest không có thư mục cha")?
        .to_path_buf();
    let (mut worker, ready) = AsrWorker::spawn(
        &args.asr_worker,
        &args.asr_model,
        args.use_gpu,
        args.threads,
        &args.log_dir.join("asr-eval.log"),
    )?;
    worker.warmup()?;
    println!(
        "asr: {} ({}), chế độ giải mã {}\n{}",
        ready.backend, ready.whisper_version, ready.decode_mode, ready.system_info
    );
    let mut out = std::fs::File::create(&args.out)?;
    for (i, line) in BufReader::new(std::fs::File::open(&args.manifest)?).lines().enumerate() {
        let clip: Clip = serde_json::from_str(&line?)?;
        let mut reader = hound::WavReader::open(base.join(&clip.path))?;
        let spec = reader.spec();
        if spec.sample_rate != 16_000 || spec.channels != 1 || spec.bits_per_sample != 16 {
            bail!("{} phải là WAV 16 kHz, mono, 16-bit", clip.path);
        }
        let pcm: Vec<i16> = reader.samples::<i16>().collect::<Result<_, _>>()?;
        let audio_ms = pcm.len() as u64 * 1000 / 16_000;
        let audio_ctx = if args.full_ctx {
            1500
        } else {
            audio_ctx_for_samples(pcm.len()).max(args.min_ctx).min(1500)
        };
        let languages = if args.lock_language {
            vec![clip.lang.clone()]
        } else {
            args.languages.clone()
        };
        let started = Instant::now();
        let r = worker.transcribe(TranscribeRequest {
            segment_id: i as u64,
            pcm,
            languages,
            prompt_tokens: Vec::new(),
            audio_ctx,
        })?;
        let ipc_ms = started.elapsed().as_secs_f32() * 1000.0 - r.lid_ms - r.asr_ms;
        let row = Output {
            id: clip.id,
            lang_ref: clip.lang,
            lang_hyp: r.lang,
            lang_prob: r.lang_prob,
            hyp: r.text,
            no_speech_prob: r.no_speech_prob,
            lid_ms: r.lid_ms,
            asr_ms: r.asr_ms,
            ipc_ms,
            audio_ms,
            decode_mode: ready.decode_mode.clone(),
        };
        writeln!(out, "{}", serde_json::to_string(&row)?)?;
        if (i + 1) % 20 == 0 {
            println!("{} clip", i + 1);
        }
    }
    Ok(())
}
