//! Chép lời từng clip của bộ A4 qua `asr-worker`, ghi kết quả để `score_asr.py` tính WER/CER.

use anyhow::{Context, Result, bail};
use asr_protocol::{MAX_PCM_SAMPLES, MIN_PCM_SAMPLES, TranscribeRequest, audio_ctx_for_samples};
use pipeline::asr_client::{AsrLaunch, AsrWorker};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, BufWriter, Write};
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
    /// Sàn thêm cho audio_ctx, từ 0 đến 1500: audio_ctx = max(audio_ctx_for_samples, N). Công thức đã có sàn
    /// `MIN_AUDIO_CTX` (512), nên N ≤ 512 không có tác dụng. Muốn so với mốc không sàn thì dùng kết quả đã lưu,
    /// hoặc build lại từ commit trước af5b41a. Không dùng chung với `--full-ctx`.
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
    /// File kết quả JSONL. Ghi ra `<out>.part` rồi mới đổi tên khi chạy xong, nên lượt chạy dở không ghi đè file cũ.
    #[arg(long)]
    out: PathBuf,
    /// Thư mục log của worker. Mỗi lượt ghi vào `<tên file --out bỏ đuôi>.log`, ví dụ `out-thu-ko.jsonl` thành
    /// `out-thu-ko.log`, nên các lượt chạy với `--out` khác nhau không ghi đè log của nhau. Chạy lại với cùng
    /// `--out` thì log cũ bị xóa.
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
    /// Đoạn có giá trị > 0,6 và `avg_logprob` < −1 bị app bỏ (spec §6.4, "Lọc lỗi ảo giác"); trên clip có tiếng nói thì
    /// phải hiếm.
    no_speech_prob: f32,
    /// Trung bình log-xác suất của các token văn bản, không tính EOT (0 nếu không có token); xem
    /// `TranscribeResult::avg_logprob`.
    avg_logprob: f32,
    lid_ms: f32,
    asr_ms: f32,
    /// Thời gian ngoài whisper: mã hóa khung, truyền qua pipe, giải mã khung (giả định 10, §14).
    ipc_ms: f32,
    audio_ms: u64,
    /// `audio_ctx` đã gửi cho worker, để phân tích lỗi lặp câu theo cửa sổ mã hóa.
    audio_ctx: i32,
    /// Số token worker trả về.
    n_tokens: usize,
    decode_mode: String,
}

pub fn run(args: AsrEvalArgs) -> Result<()> {
    std::fs::create_dir_all(&args.log_dir)?;
    let base = args
        .manifest
        .parent()
        .context("manifest không có thư mục cha")?
        .to_path_buf();
    let stem = args.out.file_stem().context("--out phải là đường dẫn tới một file")?;
    let log = args.log_dir.join(format!("{}.log", stem.to_string_lossy()));
    let mut part = args.out.clone().into_os_string();
    part.push(".part");
    let part = PathBuf::from(part);
    // Log theo lượt: bắt đầu lượt mới thì xóa log cũ cùng tên. Client vẫn mở append để giữ log khi worker khởi động lại.
    std::fs::File::create(&log).with_context(|| format!("không tạo được log {}", log.display()))?;
    let launch = AsrLaunch {
        use_gpu: args.use_gpu,
        n_threads: args.threads,
        request_timeout: crate::latency::TOOL_REQUEST_TIMEOUT,
        ..AsrLaunch::new(&args.asr_worker, &args.asr_model, &log)
    };
    let (mut worker, ready) = AsrWorker::spawn(&launch)?;
    worker.warmup()?;
    println!(
        "asr: {} ({}), chế độ giải mã {}\n{}",
        ready.backend.as_str(),
        ready.whisper_version,
        ready.decode_mode.as_str(),
        ready.system_info
    );
    let manifest = std::fs::File::open(&args.manifest)
        .with_context(|| format!("không mở được manifest {}", args.manifest.display()))?;
    let mut out =
        BufWriter::new(std::fs::File::create(&part).with_context(|| format!("không tạo được {}", part.display()))?);
    // Ngôn ngữ của clip trước: đúng trạng thái mà `asr-worker` của Phase 0 tự giữ, để mốc A4 so được với lượt mới
    // (chỉ có tác dụng ở clip có xác suất ngôn ngữ dưới 0,5, cột `lid_fallback` của score_asr.py).
    let mut prev_lang: Option<String> = None;
    for (i, line) in BufReader::new(manifest).lines().enumerate() {
        let n = i + 1; // số dòng trong manifest
        let line = line.with_context(|| format!("manifest dòng {n}"))?;
        let clip: Clip = serde_json::from_str(&line).with_context(|| format!("manifest dòng {n}"))?;
        let path = base.join(&clip.path);
        let mut reader = hound::WavReader::open(&path)
            .with_context(|| format!("clip {} (dòng {n}): không đọc được {}", clip.id, path.display()))?;
        let spec = reader.spec();
        if spec.sample_rate != 16_000 || spec.channels != 1 || spec.bits_per_sample != 16 {
            bail!(
                "clip {} (dòng {n}): {} phải là WAV 16 kHz, mono, 16-bit",
                clip.id,
                clip.path
            );
        }
        let pcm: Vec<i16> = reader
            .samples::<i16>()
            .collect::<Result<_, _>>()
            .with_context(|| format!("clip {} (dòng {n}): lỗi đọc mẫu từ {}", clip.id, path.display()))?;
        // Kiểm trước khi gửi: worker từ chối đoạn ngoài khoảng này, và một lỗi làm dừng cả lượt.
        if !(MIN_PCM_SAMPLES..=MAX_PCM_SAMPLES).contains(&pcm.len()) {
            bail!(
                "clip {} (dòng {n}): {} mẫu, ngoài khoảng worker nhận [{MIN_PCM_SAMPLES}, {MAX_PCM_SAMPLES}]",
                clip.id,
                pcm.len()
            );
        }
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
        let r = worker
            .transcribe(TranscribeRequest {
                segment_id: i as u64,
                pcm,
                languages,
                prompt_tokens: Vec::new(),
                audio_ctx,
                prev_lang: prev_lang.clone(),
            })
            .with_context(|| format!("clip {} (dòng {n})", clip.id))?;
        prev_lang = Some(r.lang.clone());
        let ipc_ms = started.elapsed().as_secs_f32() * 1000.0 - r.lid_ms - r.asr_ms;
        let row = Output {
            id: clip.id,
            lang_ref: clip.lang,
            lang_hyp: r.lang,
            lang_prob: r.lang_prob,
            hyp: r.text,
            no_speech_prob: r.no_speech_prob,
            avg_logprob: r.avg_logprob,
            lid_ms: r.lid_ms,
            asr_ms: r.asr_ms,
            ipc_ms,
            audio_ms,
            audio_ctx,
            n_tokens: r.tokens.len(),
            decode_mode: ready.decode_mode.as_str().to_string(),
        };
        writeln!(out, "{}", serde_json::to_string(&row)?)?;
        if n % 20 == 0 {
            println!("{n} clip");
        }
    }
    out.flush()?;
    drop(out);
    std::fs::rename(&part, &args.out)
        .with_context(|| format!("không đổi tên {} thành {}", part.display(), args.out.display()))?;
    Ok(())
}
