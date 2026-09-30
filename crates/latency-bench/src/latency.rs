//! Spike S6: đo độ trễ tổng thể theo đúng định nghĩa của A2.
//!
//! Phát lại một file WAV theo thời gian thực qua VAD, cắt câu, `asr-worker` và `llama-server`
//! (ba luồng chạy song song như trong app), rồi so với mốc dừng câu thật của từng câu.

use crate::stats::{Utterance, match_segments, percentile};
use anyhow::{Context, Result, bail};
use asr_protocol::{MAX_PCM_SAMPLES, MAX_PROMPT_TOKENS, MIN_PCM_SAMPLES, TranscribeRequest, audio_ctx_for_samples};
use pipeline::asr_client::AsrWorker;
use pipeline::llama::{LlamaServer, max_tokens_for};
use pipeline::prompt::{Lang, translation_prompt};
use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES, Segment, Segmenter, SegmenterConfig};
use pipeline::vad::SileroVad;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessesToUpdate, System};

/// Luật bỏ đoạn "không có tiếng nói" của OpenAI Whisper (spec §6.4): bỏ khi `no_speech_prob` lớn hơn ngưỡng này **và**
/// `avg_logprob` nhỏ hơn `AVG_LOGPROB_MIN`. Chỉ dùng `no_speech_prob` thì bỏ nhầm câu đúng: một câu tiếng Hàn có
/// `no_speech_prob` 0,62 mà `avg_logprob` −0,25. Với whisper small trên FLEURS, `avg_logprob` ở phân vị 1 là −0,64; với
/// turbo, `no_speech_prob` luôn cỡ 1e-11 nên luật không bao giờ bỏ đoạn nào.
const NO_SPEECH_MAX: f32 = 0.6;
/// Ngưỡng `avg_logprob` của cùng luật trên (`logprob_threshold` mặc định của OpenAI Whisper).
const AVG_LOGPROB_MIN: f32 = -1.0;
/// Cửa sổ (ms) ghép đoạn với mốc dừng câu thật, xem `match_segments`.
const MATCH_WINDOW_MS: u64 = 1_000;
/// Khung âm thanh tới trễ hơn thời gian thực quá ngưỡng này (ms) thì kết quả lệch cùng cỡ: báo cho người chạy.
const FEED_LAG_WARN_MS: f64 = 100.0;
/// Đoạn có mốc dừng sớm hơn mốc VAD của câu quá ngưỡng này (ms) thì câu bị gắn cờ `early_stop`.
const EARLY_STOP_MS: i64 = 200;
/// Dấu câu kết thúc của §6.3. Đúng chữ của spec: đuôi như `."` hay `」` chưa được xử lý riêng.
const SENTENCE_END: [char; 6] = ['.', '?', '!', '。', '？', '！'];
/// Trần của một câu ghép (§6.3): 15 giây âm thanh hoặc 3 đoạn.
const MERGE_MAX_SPEECH_MS: u64 = 15_000;
const MERGE_MAX_SEGMENTS: usize = 3;

// Lý do một đoạn không được dịch, ghi ở `SegmentRecord::skipped`.
/// Đoạn không có tiếng nói theo luật `no_speech_prob` và `avg_logprob` (xem `NO_SPEECH_MAX`), hoặc chữ rỗng: app bỏ đoạn
/// này (§6.4).
const SKIP_NO_SPEECH: &str = "no_speech";
/// Đoạn ngắn hơn `MIN_PCM_SAMPLES`: không gửi cho `asr-worker`.
const SKIP_TOO_SHORT: &str = "too_short";
/// Đoạn dài hơn `MAX_PCM_SAMPLES`: không gửi cho `asr-worker`.
const SKIP_TOO_LONG: &str = "too_long";
/// Bản dịch rỗng: không có gì để hiện.
const SKIP_EMPTY_TRANSLATION: &str = "empty_translation";
/// Ngôn ngữ nguồn trùng ngôn ngữ đích: hiện luôn bản chép lời (F2).
const SKIP_SAME_LANG: &str = "same_lang";
/// Ngôn ngữ ngoài tập của công cụ; ghi thành `lang_ngoai_tap:<mã>`.
const SKIP_OTHER_LANG: &str = "lang_ngoai_tap";
const SKIP_KINDS: [&str; 6] = [
    SKIP_NO_SPEECH,
    SKIP_TOO_SHORT,
    SKIP_TOO_LONG,
    SKIP_EMPTY_TRANSLATION,
    SKIP_SAME_LANG,
    SKIP_OTHER_LANG,
];

#[derive(clap::Args)]
pub struct LatencyArgs {
    /// WAV 16 kHz mono do `build_sessions.py` tạo.
    #[arg(long)]
    session: PathBuf,
    /// File mốc thật (JSON) đi kèm session.
    #[arg(long)]
    truth: PathBuf,
    #[arg(long)]
    asr_worker: PathBuf,
    #[arg(long)]
    asr_model: PathBuf,
    #[arg(long)]
    llama_server: PathBuf,
    #[arg(long)]
    mt_model: PathBuf,
    #[arg(long)]
    vad_model: PathBuf,
    #[arg(long, value_delimiter = ',', default_value = "en,zh,ja,ko,vi")]
    languages: Vec<String>,
    #[arg(long, default_value = "vi")]
    target: String,
    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    use_gpu: bool,
    #[arg(long, default_value_t = 4)]
    asr_threads: u32,
    /// Sàn cho audio_ctx, từ 0 đến 1500 (mặc định 0: không đặt sàn): audio_ctx = max(công thức, N), như
    /// `asr-eval --min-ctx`. Để đo S6 với mức sàn nếu S7 khuyến nghị.
    #[arg(long, default_value_t = 0, value_parser = clap::value_parser!(i32).range(0..=1500))]
    min_ctx: i32,
    #[arg(long, default_value_t = 300)]
    end_silence_ms: u64,
    /// Mô phỏng ghép câu và phụ đề tạm của §6.3 (mặc định bật): đoạn sau bắt đầu nói trong cửa sổ ghép thì nối chữ rồi
    /// dịch lại cả câu. `--merge false` dịch từng đoạn riêng, để so ảnh hưởng của việc ghép.
    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    merge: bool,
    /// Nhãn máy và gói model, ví dụ `m1-16gb-chuan`.
    #[arg(long)]
    label: String,
    #[arg(long)]
    out: PathBuf,
    #[arg(long, default_value = "logs")]
    log_dir: PathBuf,
    /// Tham số thêm cho llama-server, cách nhau bằng dấu cách, ví dụ "--no-repack".
    #[arg(long, default_value = "", allow_hyphen_values = true)]
    llama_args: String,
}

#[derive(Serialize, Clone, Debug, Default)]
struct SegmentRecord {
    id: u64,
    start_ms: u64,
    end_ms: u64,
    audio_ms: u64,
    closed_at_ms: f64,
    /// Lúc luồng ASR nhận đoạn (sau thời gian chờ hàng đợi) và lúc xong chép lời.
    asr_started_at_ms: f64,
    asr_done_at_ms: f64,
    lid_ms: f32,
    asr_ms: f32,
    lang: String,
    lang_prob: f32,
    text: String,
    no_speech_prob: f32,
    /// Trung bình log-xác suất của các token văn bản, cùng `no_speech_prob` quyết định bỏ đoạn.
    avg_logprob: f32,
    /// Số đoạn trong câu đã dịch ở bước này (1 nếu không ghép; tối đa 3), và chữ nguồn của cả câu ghép (§6.3).
    merged_segments: Option<usize>,
    translated_source: Option<String>,
    /// Số token của `translated_source` theo `/tokenize`, và `max_tokens` đã gửi cho bản dịch (§6.5).
    src_tokens: Option<usize>,
    max_tokens: Option<u32>,
    /// Lúc luồng MT nhận đoạn (sau thời gian chờ hàng đợi), lúc chữ dịch đầu tiên tới và lúc dịch xong.
    mt_started_at_ms: Option<f64>,
    mt_first_at_ms: Option<f64>,
    mt_done_at_ms: Option<f64>,
    translation: Option<String>,
    /// "stop", hoặc "length" khi bản dịch chạm `max_tokens` (bị cụt).
    finish_reason: Option<String>,
    /// Lúc phụ đề hiện đủ: xong bản dịch, hoặc xong chép lời nếu không cần dịch. `None` nếu đoạn bị bỏ
    /// (xem `is_dropped`): không có gì hiện ra nên không có độ trễ để đo.
    shown_at_ms: Option<f64>,
    first_shown_at_ms: Option<f64>,
    skipped: Option<String>,
}

#[derive(Serialize)]
struct UtteranceLatency {
    id: String,
    lang: String,
    end_ms: u64,
    segment_id: Option<u64>,
    /// Mốc dừng của đoạn ghép được trừ mốc VAD của câu (`vad_end_ms`; truth cũ không có thì `end_ms`), tính bằng ms. Đoạn
    /// của Segmenter dừng theo VAD nên độ lệch này kiểm việc ghép câu với đoạn; nó không gồm phần tinh chỉnh của `end_ms`
    /// (xem `build_sessions.py`), vốn có chủ ý. Lệch lớn nghĩa là mốc của session không khớp lúc VAD trong pipeline dừng,
    /// và độ trễ của câu đó lệch cùng cỡ.
    end_offset_ms: Option<i64>,
    /// Đoạn dừng sớm hơn mốc VAD quá `EARLY_STOP_MS`: đoạn bị cắt sớm hoặc ghép nhầm, độ trễ của câu này đáng ngờ.
    early_stop: bool,
    shown_latency_ms: Option<f64>,
    first_latency_ms: Option<f64>,
    /// Ngôn ngữ LID nhận diện cho đoạn ghép được, và có khác ngôn ngữ thật của câu không.
    lid: Option<String>,
    lid_mismatch: bool,
    /// LID nhầm sang ngôn ngữ đích: đoạn bị `same_lang`, app chỉ hiện chữ gốc (sai ngôn ngữ) rất nhanh, nên độ trễ là
    /// `None` thay vì được tính là "hiện nhanh".
    lid_to_target: bool,
    /// Số đoạn trong câu ghép mà đoạn cuối của câu này được dịch cùng (1 nếu không ghép).
    merged_segments: Option<usize>,
    /// Đoạn ghép được có bản dịch. `false` nếu không ghép được đoạn nào.
    translated: bool,
    /// Lý do đoạn ghép được không có bản dịch, nếu có.
    skipped: Option<String>,
}

#[derive(Serialize, Default)]
struct ProcessUsage {
    peak_rss_mb: f64,
    /// macOS: `phys_footprint` (số Activity Monitor hiển thị), tính cả bộ nhớ Metal mà RSS bỏ sót, nhưng không
    /// tính trang của file model được mmap. Là đỉnh từ lúc tiến trình khởi động, nên gồm cả lúc nạp model (`peak_rss_mb`
    /// thì chỉ từ lúc bắt đầu lấy mẫu). Nền tảng khác để 0; VRAM trên Windows đo bằng `vram-sample.ps1`.
    peak_footprint_mb: f64,
    /// CPU trung bình trong lúc phát lại, phần trăm của một lõi: thời gian CPU tích lũy chia thời gian thực.
    avg_cpu_percent: f64,
    samples: usize,
}

#[derive(Serialize)]
struct Report {
    label: String,
    machine: HashMap<String, String>,
    config: HashMap<String, String>,
    summary: HashMap<String, f64>,
    usage: HashMap<String, ProcessUsage>,
    utterances: Vec<UtteranceLatency>,
    segments: Vec<SegmentRecord>,
}

pub fn run(args: LatencyArgs) -> Result<()> {
    std::fs::create_dir_all(&args.log_dir)?;
    let target = Lang::from_code(&args.target).context("--target không hợp lệ")?;
    let truth: Vec<Utterance> = serde_json::from_reader(
        std::fs::File::open(&args.truth).with_context(|| format!("không mở được {}", args.truth.display()))?,
    )?;
    let samples = read_wav_16k_mono(&args.session)?;
    // Nạp VAD trước khi chạy tiến trình phụ: đường dẫn sai thì báo lỗi ngay mà không để lại server chạy dở,
    // và việc nạp không chiếm giờ của lượt phát lại.
    let mut vad = SileroVad::load(&args.vad_model)?;
    let mut segmenter = Segmenter::new(SegmenterConfig {
        end_silence_ms: args.end_silence_ms,
        ..Default::default()
    });

    let (mut asr, ready) = AsrWorker::spawn(
        &args.asr_worker,
        &args.asr_model,
        args.use_gpu,
        args.asr_threads,
        &args.log_dir.join(format!("asr-worker-{}.log", args.label)),
    )?;
    let asr_warmup_ms = asr.warmup()?;
    let llama_args: Vec<String> = args.llama_args.split_whitespace().map(String::from).collect();
    let llama = LlamaServer::spawn(
        &args.llama_server,
        &args.mt_model,
        &llama_args,
        &args.log_dir.join(format!("llama-server-{}.log", args.label)),
    )?;
    llama.translate(&translation_prompt("Hello.", Lang::En, target), 32)?; // làm nóng
    println!(
        "asr: {} ({}), chế độ giải mã {}, làm nóng {asr_warmup_ms:.0} ms",
        ready.backend, ready.whisper_version, ready.decode_mode
    );

    kill_children_on_panic(vec![asr.pid(), llama.pid()]);
    let pids = HashMap::from([
        ("latency-bench".to_string(), std::process::id()),
        ("asr-worker".to_string(), asr.pid()),
        ("llama-server".to_string(), llama.pid()),
    ]);
    let stop_sampler = Arc::new(AtomicBool::new(false));
    let sampler = spawn_sampler(pids, stop_sampler.clone());

    let (seg_tx, seg_rx) = mpsc::channel::<(Segment, f64)>();
    let (asr_tx, asr_rx) = mpsc::channel::<SegmentRecord>();
    let (rec_tx, rec_rx) = mpsc::channel::<SegmentRecord>();
    let origin = Instant::now();
    let now_ms = move || origin.elapsed().as_secs_f64() * 1000.0;

    let languages = args.languages.clone();
    let min_ctx = args.min_ctx;
    let merge = args.merge;
    let merge_window = merge_window_ms(args.end_silence_ms);
    let asr_thread = std::thread::spawn(move || -> Result<()> {
        let mut prompts: HashMap<String, Vec<i32>> = HashMap::new();
        for (segment, closed_at_ms) in seg_rx {
            let mut rec = SegmentRecord {
                id: segment.id,
                start_ms: segment.start_ms,
                end_ms: segment.end_ms,
                audio_ms: segment.samples.len() as u64 * 1000 / 16_000,
                closed_at_ms,
                asr_started_at_ms: now_ms(),
                ..Default::default()
            };
            // Worker từ chối đoạn ngoài khoảng, và một lỗi làm dừng cả lượt đo: không gửi, chỉ ghi lại.
            if let Some(reason) = pcm_skip_reason(segment.samples.len()) {
                rec.skipped = Some(reason.into());
                rec.asr_done_at_ms = now_ms();
                asr_tx.send(rec)?;
                continue;
            }
            let pcm: Vec<i16> = segment
                .samples
                .iter()
                .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                .collect();
            let prompt_tokens = if languages.len() == 1 {
                prompts.get(&languages[0]).cloned().unwrap_or_default()
            } else {
                Vec::new()
            };
            let result = asr.transcribe(TranscribeRequest {
                segment_id: segment.id,
                audio_ctx: audio_ctx_for_samples(pcm.len()).max(min_ctx).min(1500),
                pcm,
                languages: languages.clone(),
                prompt_tokens,
            })?;
            rec.asr_done_at_ms = now_ms();
            let tokens = prompts.entry(result.lang.clone()).or_default();
            tokens.extend(&result.tokens);
            let excess = tokens.len().saturating_sub(MAX_PROMPT_TOKENS);
            tokens.drain(..excess);
            rec.lid_ms = result.lid_ms;
            rec.asr_ms = result.asr_ms;
            rec.lang = result.lang;
            rec.lang_prob = result.lang_prob;
            rec.text = result.text;
            rec.no_speech_prob = result.no_speech_prob;
            rec.avg_logprob = result.avg_logprob;
            asr_tx.send(rec)?;
        }
        Ok(())
    });

    let mt_thread = std::thread::spawn(move || -> Result<()> {
        let mut open: Option<OpenSentence> = None;
        for mut rec in asr_rx {
            let mt_started = now_ms();
            if rec.skipped.is_none() {
                match route(&rec, target) {
                    Err(reason) => {
                        // Đoạn hiện luôn chữ gốc (cùng ngôn ngữ đích, hoặc ngoài tập) cắt chuỗi ghép; đoạn bị bỏ thì không.
                        if !is_dropped(&reason) {
                            open = None;
                        }
                        rec.skipped = Some(reason);
                    }
                    Ok(src) => {
                        rec.mt_started_at_ms = Some(mt_started);
                        // Ghép câu (§6.3): đoạn bắt đầu nói trong cửa sổ ghép thì dịch lại cả câu, không chỉ đoạn này.
                        let (merged, source) = if merge {
                            plan_merge(&mut open, &rec, src, merge_window)
                        } else {
                            (1, rec.text.trim().to_string())
                        };
                        // Tính `max_tokens` theo §6.5, trên cả câu. Lần gọi /tokenize nằm trong thời gian của bước dịch.
                        let src_tokens = llama.count_tokens(&source)?;
                        let max_tokens = max_tokens_for(src_tokens);
                        let t = llama.translate(&translation_prompt(&source, src, target), max_tokens)?;
                        let done = now_ms();
                        rec.merged_segments = Some(merged);
                        rec.translated_source = Some(source);
                        rec.src_tokens = Some(src_tokens);
                        rec.max_tokens = Some(max_tokens);
                        rec.mt_first_at_ms = Some(done - (t.total_ms - t.first_token_ms) as f64);
                        rec.mt_done_at_ms = Some(done);
                        rec.finish_reason = t.finish_reason;
                        if t.text.is_empty() {
                            rec.skipped = Some(SKIP_EMPTY_TRANSLATION.into());
                        } else {
                            rec.translation = Some(t.text);
                        }
                    }
                }
            }
            (rec.shown_at_ms, rec.first_shown_at_ms) = shown_times(&rec);
            rec_tx.send(rec)?;
        }
        Ok(())
    });

    // Phát lại theo thời gian thực: khung i sẵn sàng ở thời điểm (i + 1) × 32 ms, như khi thu thật.
    let mut max_lag = Duration::ZERO;
    let mut play = || -> Result<()> {
        for (i, frame) in samples.as_chunks::<FRAME_SAMPLES>().0.iter().enumerate() {
            let due = origin + Duration::from_millis((i as u64 + 1) * FRAME_MS);
            if let Some(wait) = due.checked_duration_since(Instant::now()) {
                std::thread::sleep(wait);
            }
            max_lag = max_lag.max(Instant::now().saturating_duration_since(due));
            let prob = vad.prob(frame)?;
            for segment in segmenter.push(frame, prob) {
                seg_tx.send((segment, now_ms()))?;
            }
        }
        if let Some(segment) = segmenter.flush() {
            seg_tx.send((segment, now_ms()))?;
        }
        Ok(())
    };
    let played = play();
    // Lỗi ở đây cũng phải đi qua bước đóng kênh và join bên dưới, để `asr-worker` và `llama-server` được dọn.
    // Thoát sớm thì tiến trình kết thúc trước khi hai luồng kịp `Drop`, và server bị bỏ lại chạy mồ côi.
    drop(seg_tx);
    let asr_result = asr_thread.join().expect("luồng ASR panic");
    let mt_result = mt_thread.join().expect("luồng MT panic");
    // Hai tiến trình con đã thoát và được thu dọn: bỏ hook, kẻo panic về sau giết nhầm tiến trình khác vừa được cấp lại pid.
    drop(std::panic::take_hook());
    stop_sampler.store(true, Ordering::Relaxed);
    let usage = sampler.join().expect("luồng đo tài nguyên panic");
    // Báo lỗi của luồng ở cuối chuỗi trước: khi luồng MT chết, luồng ASR và luồng phát lại chỉ còn báo "kênh đã đóng"
    // ở lần gửi kế tiếp, che mất nguyên nhân thật. Ngược lại, khi luồng ASR chết thì luồng MT dừng bình thường.
    mt_result?;
    asr_result?;
    played?;

    let mut segments: Vec<SegmentRecord> = rec_rx.into_iter().collect();
    segments.sort_by_key(|s| s.id);
    let utterances = utterance_latencies(&truth, &segments, target);
    let mut summary = build_summary(&utterances, &segments);
    let feed_lag_max_ms = max_lag.as_secs_f64() * 1000.0;
    summary.insert("feed_lag_max_ms".into(), feed_lag_max_ms);

    let report = Report {
        label: args.label.clone(),
        machine: machine_info(),
        config: HashMap::from([
            ("asr_backend".to_string(), ready.backend),
            ("asr_decode_mode".to_string(), ready.decode_mode),
            ("whisper_version".to_string(), ready.whisper_version),
            ("asr_system_info".to_string(), ready.system_info),
            ("asr_model".to_string(), public_path(&args.asr_model)),
            ("mt_model".to_string(), public_path(&args.mt_model)),
            ("llama_server".to_string(), public_path(&args.llama_server)),
            ("languages".to_string(), args.languages.join(",")),
            ("target".to_string(), args.target.clone()),
            ("end_silence_ms".to_string(), args.end_silence_ms.to_string()),
            ("merge".to_string(), args.merge.to_string()),
            ("merge_window_ms".to_string(), merge_window.to_string()),
            ("min_ctx".to_string(), args.min_ctx.to_string()),
            (
                "llama_args".to_string(),
                public_args(repo_root().as_deref(), &args.llama_args),
            ),
        ]),
        summary,
        usage,
        utterances,
        segments,
    };
    // Ghi file trước khi kiểm: lượt đo không ra câu nào vẫn còn đoạn và lý do để xem.
    let out = std::fs::File::create(&args.out).with_context(|| format!("không tạo được {}", args.out.display()))?;
    serde_json::to_writer_pretty(out, &report)?;
    let s = &report.summary;
    if s["measured"] == 0.0 {
        bail!(
            "không đo được câu nào (không ghép được với mốc thật, đoạn đều bị bỏ, hoặc LID nhầm sang ngôn ngữ đích); \
             kiểm tra file truth và VAD. Chi tiết ở {}",
            args.out.display()
        );
    }
    println!(
        "{}: p50 = {:.0} ms, p90 = {:.0} ms, chữ đầu p50 = {:.0} ms, ghép được {}/{} câu",
        report.label, s["shown_p50_ms"], s["shown_p90_ms"], s["first_p50_ms"], s["matched"], s["utterances"]
    );
    println!(
        "  đo được {} câu; không ghép được {}, không có bản dịch {}, LID nhầm {} (sang ngôn ngữ đích {}); đoạn bị bỏ {}, \
         bản dịch bị cụt (length) {}; ghép câu {} lần; mốc dừng lệch tối đa {:.0} ms",
        s["measured"],
        s["unmatched"],
        s["no_translation"],
        s["lid_mismatch"],
        s["lid_to_target"],
        s["segments_dropped"],
        s["finish_length"],
        s["merges"],
        s["end_offset_max_abs_ms"]
    );
    if feed_lag_max_ms > FEED_LAG_WARN_MS {
        println!(
            "  CẢNH BÁO: phát lại chậm hơn thời gian thực tới {feed_lag_max_ms:.0} ms (máy đang bận?); \
             độ trễ đo được bị lệch cùng cỡ"
        );
    }
    Ok(())
}

/// Bản release đặt `panic = "abort"`: `Drop` không chạy khi panic, nên `asr-worker` và `llama-server` bị bỏ lại chạy mồ côi,
/// chiếm RAM và làm lệch lượt đo sau. Hook này chạy trước khi abort để dọn chúng.
fn kill_children_on_panic(pids: Vec<u32>) {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        for &pid in &pids {
            kill_process(pid);
        }
        default_hook(info);
    }));
}

fn kill_process(pid: u32) {
    let pid = pid.to_string();
    #[cfg(unix)]
    let _ = std::process::Command::new("kill").args(["-KILL", &pid]).status();
    #[cfg(windows)]
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/PID", &pid])
        .output();
}

/// Lý do không gửi đoạn cho `asr-worker`: số mẫu ngoài khoảng worker nhận.
fn pcm_skip_reason(n_samples: usize) -> Option<&'static str> {
    if n_samples < MIN_PCM_SAMPLES {
        Some(SKIP_TOO_SHORT)
    } else if n_samples > MAX_PCM_SAMPLES {
        Some(SKIP_TOO_LONG)
    } else {
        None
    }
}

/// Cửa sổ ghép của §6.3: max(700 ms, `vadEndSilenceMs` + 400 ms).
fn merge_window_ms(end_silence_ms: u64) -> u64 {
    (end_silence_ms + 400).max(700)
}

/// Đoạn kết thúc bằng dấu câu kết thúc thì câu đã chốt: không còn là phụ đề tạm.
fn ends_sentence(text: &str) -> bool {
    text.trim_end().ends_with(SENTENCE_END)
}

/// Câu đang mở theo §6.3: các đoạn liên tiếp đã ghép và chưa chốt. Mọi mốc thời gian là mốc tiếng nói
/// (`Segment::start_ms` và `end_ms`, không gồm đệm), nên cửa sổ tính từ lúc hết tiếng nói của đoạn trước tới lúc có
/// tiếng nói của đoạn sau.
struct OpenSentence {
    /// Ngôn ngữ nhận diện của các đoạn. Đoạn sau khác ngôn ngữ thì không ghép.
    lang: String,
    /// Chỗ nối chữ: tiếng Trung và tiếng Nhật không có dấu cách giữa các từ.
    joiner: &'static str,
    text: String,
    segments: usize,
    /// Tổng thời lượng tiếng nói, không tính đệm và không tính khoảng nghỉ giữa các đoạn.
    speech_ms: u64,
    /// Lúc hết tiếng nói của đoạn cuối.
    last_end_ms: u64,
    /// Đoạn cuối kết thúc bằng dấu câu kết thúc: câu đã chốt.
    closed: bool,
}

impl OpenSentence {
    fn new(first: &SegmentRecord, lang: Lang) -> Self {
        Self {
            lang: first.lang.clone(),
            joiner: if matches!(lang, Lang::Zh | Lang::Ja) { "" } else { " " },
            text: first.text.trim().to_string(),
            segments: 1,
            speech_ms: first.end_ms.saturating_sub(first.start_ms),
            last_end_ms: first.end_ms,
            closed: ends_sentence(&first.text),
        }
    }

    /// `next` ghép được vào câu này không. Đoạn cắt cưỡng bức (8 giây) bắt đầu đúng chỗ đoạn trước kết thúc, nên
    /// khoảng cách bằng 0. Đạt trần thì chốt câu, đoạn sau mở câu mới.
    fn accepts(&self, next: &SegmentRecord, window_ms: u64) -> bool {
        !self.closed
            && next.lang == self.lang
            && next.start_ms.saturating_sub(self.last_end_ms) <= window_ms
            && self.segments < MERGE_MAX_SEGMENTS
            && self.speech_ms + next.end_ms.saturating_sub(next.start_ms) <= MERGE_MAX_SPEECH_MS
    }

    fn push(&mut self, next: &SegmentRecord) {
        self.text = format!("{}{}{}", self.text.trim_end(), self.joiner, next.text.trim());
        self.segments += 1;
        self.speech_ms += next.end_ms.saturating_sub(next.start_ms);
        self.last_end_ms = next.end_ms;
        self.closed = ends_sentence(&next.text);
    }
}

/// Đoạn vừa chép lời xong và cần dịch: ghép vào câu đang mở nếu được, không thì mở câu mới.
/// Trả (số đoạn trong câu, chữ nguồn của cả câu để dịch).
fn plan_merge(open: &mut Option<OpenSentence>, rec: &SegmentRecord, src: Lang, window_ms: u64) -> (usize, String) {
    match open.as_mut().filter(|o| o.accepts(rec, window_ms)) {
        Some(o) => o.push(rec),
        None => *open = Some(OpenSentence::new(rec, src)),
    }
    let o = open.as_ref().expect("vừa ghép hoặc vừa mở câu");
    (o.segments, o.text.clone())
}

/// Quy tắc của app cho một đoạn đã chép lời: `Ok(ngôn ngữ nguồn)` nếu phải dịch, `Err(lý do)` nếu bỏ bước dịch.
fn route(rec: &SegmentRecord, target: Lang) -> Result<Lang, String> {
    let no_speech = rec.no_speech_prob > NO_SPEECH_MAX && rec.avg_logprob < AVG_LOGPROB_MIN;
    if no_speech || rec.text.trim().is_empty() {
        return Err(SKIP_NO_SPEECH.into());
    }
    match Lang::from_code(&rec.lang) {
        Some(src) if src == target => Err(SKIP_SAME_LANG.into()),
        Some(src) => Ok(src),
        None => Err(format!("{SKIP_OTHER_LANG}:{}", rec.lang)),
    }
}

/// Đoạn bị bỏ: app không hiện gì cho đoạn này, nên không có độ trễ để đo và không được tính là "hiện nhanh".
/// `same_lang` thì khác: app hiện luôn bản chép lời, nên có độ trễ (bằng lúc xong chép lời).
fn is_dropped(reason: &str) -> bool {
    matches!(
        reason,
        SKIP_NO_SPEECH | SKIP_TOO_SHORT | SKIP_TOO_LONG | SKIP_EMPTY_TRANSLATION
    )
}

/// Đoạn đã qua `asr-worker`. `too_short` và `too_long` bị loại từ trước nên `asr_ms` và `lid_ms` của chúng là 0.
fn was_transcribed(rec: &SegmentRecord) -> bool {
    !matches!(rec.skipped.as_deref(), Some(SKIP_TOO_SHORT | SKIP_TOO_LONG))
}

/// (Lúc hiện đủ, lúc hiện chữ đầu) của một đoạn đã xử lý xong; `None` nếu đoạn bị bỏ.
fn shown_times(rec: &SegmentRecord) -> (Option<f64>, Option<f64>) {
    if rec.skipped.as_deref().is_some_and(is_dropped) {
        return (None, None);
    }
    (
        Some(rec.mt_done_at_ms.unwrap_or(rec.asr_done_at_ms)),
        Some(rec.mt_first_at_ms.unwrap_or(rec.asr_done_at_ms)),
    )
}

/// Ghép từng câu thật với đoạn có mốc dừng gần nhất, rồi tính độ trễ từ lúc người nói dừng câu (A2).
/// Độ trễ tính tới lúc bản dịch của đoạn đó hiện ra; đoạn là đoạn cuối của câu ghép thì bản dịch là của cả câu ghép.
fn utterance_latencies(truth: &[Utterance], segments: &[SegmentRecord], target: Lang) -> Vec<UtteranceLatency> {
    let ends: Vec<u64> = segments.iter().map(|s| s.end_ms).collect();
    let matches = match_segments(truth, &ends, MATCH_WINDOW_MS);
    truth
        .iter()
        .zip(&matches)
        .map(|(u, m)| {
            let seg = m.map(|i| &segments[i]);
            let since_end = |t: f64| t - u.end_ms as f64;
            let end_offset_ms = seg.map(|s| s.end_ms as i64 - u.vad_end_ms.unwrap_or(u.end_ms) as i64);
            let lid = seg.map(|s| s.lang.clone()).filter(|l| !l.is_empty());
            // LID nhầm sang ngôn ngữ đích: câu thật không phải tiếng đích mà đoạn bị `same_lang`. Không tính "hiện nhanh".
            let lid_to_target =
                u.lang != target.code() && seg.is_some_and(|s| s.skipped.as_deref() == Some(SKIP_SAME_LANG));
            let visible = |t: Option<f64>| t.filter(|_| !lid_to_target).map(since_end);
            UtteranceLatency {
                id: u.id.clone(),
                lang: u.lang.clone(),
                end_ms: u.end_ms,
                segment_id: seg.map(|s| s.id),
                end_offset_ms,
                early_stop: end_offset_ms.is_some_and(|o| o < -EARLY_STOP_MS),
                shown_latency_ms: visible(seg.and_then(|s| s.shown_at_ms)),
                first_latency_ms: visible(seg.and_then(|s| s.first_shown_at_ms)),
                lid_mismatch: lid.as_ref().is_some_and(|l| *l != u.lang),
                lid,
                lid_to_target,
                merged_segments: seg.and_then(|s| s.merged_segments),
                translated: seg.is_some_and(|s| s.translation.is_some()),
                skipped: seg.and_then(|s| s.skipped.clone()),
            }
        })
        .collect()
}

/// Bản tóm tắt của một lượt đo:
/// - `shown_*`, `first_*`: phân vị độ trễ trên các câu đo được (`measured`), tức câu ghép được với một đoạn không bị bỏ.
/// - `asr_*`, `lid_*`, `mt_*`: phân vị thời gian phục vụ của từng bước (ms), trên các đoạn đã qua bước đó; `mt_*` tính từ
///   lúc luồng MT nhận đoạn (gồm /tokenize) tới lúc dịch xong.
/// - `asr_wait_*`, `mt_wait_*`: phân vị thời gian chờ hàng đợi trước luồng ASR và luồng MT (ms). Ở p50 thường là 0; đuôi
///   (p90) mới cho thấy các đoạn xếp hàng.
/// - `utterances`: số câu thật; `matched`: số câu ghép được với một đoạn (kể cả đoạn bị bỏ); `unmatched`: số câu còn lại.
/// - `no_translation`: số câu ghép được với một đoạn không có bản dịch (đoạn bị bỏ, hoặc không cần dịch). Không gồm
///   câu không ghép được: không biết chúng ra sao, vì không có đoạn nào đại diện.
/// - `end_offset_max_abs_ms`: lệch lớn nhất giữa mốc dừng của đoạn và mốc VAD của câu (`vad_end_ms`), trên các câu ghép
///   được; `early_stop`: số câu có đoạn dừng sớm hơn mốc VAD quá `EARLY_STOP_MS`.
/// - `lid_mismatch`: số câu ghép được mà LID nhận diện khác ngôn ngữ thật; `lid_to_target`: trong đó số câu bị nhận
///   diện thành ngôn ngữ đích (đoạn `same_lang`), nên không có độ trễ.
/// - `merges`: số đoạn đã được ghép vào một câu đang mở (§6.3), tức số lần dịch lại cả câu.
/// - `segments`, `segments_translated`, `segments_dropped`; `skipped_<lý do>`: số đoạn theo từng lý do.
/// - `finish_length`: số bản dịch chạm `max_tokens` (bị cụt).
fn build_summary(utterances: &[UtteranceLatency], segments: &[SegmentRecord]) -> HashMap<String, f64> {
    let shown: Vec<f32> = utterances
        .iter()
        .filter_map(|u| u.shown_latency_ms)
        .map(|v| v as f32)
        .collect();
    let first: Vec<f32> = utterances
        .iter()
        .filter_map(|u| u.first_latency_ms)
        .map(|v| v as f32)
        .collect();
    let transcribed = || segments.iter().filter(|s| was_transcribed(s));
    let asr_ms: Vec<f32> = transcribed().map(|s| s.asr_ms).collect();
    let lid_ms: Vec<f32> = transcribed().map(|s| s.lid_ms).collect();
    // Thời gian chờ hàng đợi tách khỏi thời gian phục vụ: chờ ở luồng ASR là từ lúc đoạn đóng tới lúc được nhận, chờ ở luồng
    // MT là từ lúc chép lời xong tới lúc được nhận; thời gian dịch là từ lúc được nhận (gồm /tokenize) tới lúc dịch xong.
    let asr_wait: Vec<f32> = transcribed()
        .map(|s| (s.asr_started_at_ms - s.closed_at_ms) as f32)
        .collect();
    let mt_wait: Vec<f32> = segments
        .iter()
        .filter_map(|s| s.mt_started_at_ms.map(|t| (t - s.asr_done_at_ms) as f32))
        .collect();
    let mt_ms: Vec<f32> = segments
        .iter()
        .filter_map(|s| Some((s.mt_done_at_ms? - s.mt_started_at_ms?) as f32))
        .collect();
    let mut summary = HashMap::new();
    let mut put = |k: &str, v: Option<f32>| {
        if let Some(v) = v {
            summary.insert(k.to_string(), v as f64);
        }
    };
    put("shown_p50_ms", percentile(&shown, 50.0));
    put("shown_p90_ms", percentile(&shown, 90.0));
    put("first_p50_ms", percentile(&first, 50.0));
    put("asr_p50_ms", percentile(&asr_ms, 50.0));
    put("asr_p90_ms", percentile(&asr_ms, 90.0));
    put("lid_p50_ms", percentile(&lid_ms, 50.0));
    put("mt_p50_ms", percentile(&mt_ms, 50.0));
    put("mt_p90_ms", percentile(&mt_ms, 90.0));
    put("asr_wait_p50_ms", percentile(&asr_wait, 50.0));
    put("asr_wait_p90_ms", percentile(&asr_wait, 90.0));
    put("mt_wait_p50_ms", percentile(&mt_wait, 50.0));
    put("mt_wait_p90_ms", percentile(&mt_wait, 90.0));
    let offset_max = utterances.iter().filter_map(|u| u.end_offset_ms).map(i64::abs).max();
    put("end_offset_max_abs_ms", Some(offset_max.unwrap_or(0) as f32));

    let mut counts: Vec<(String, usize)> = vec![
        ("utterances".into(), utterances.len()),
        (
            "matched".into(),
            utterances.iter().filter(|u| u.segment_id.is_some()).count(),
        ),
        (
            "unmatched".into(),
            utterances.iter().filter(|u| u.segment_id.is_none()).count(),
        ),
        ("measured".into(), shown.len()),
        (
            "lid_mismatch".into(),
            utterances.iter().filter(|u| u.lid_mismatch).count(),
        ),
        (
            "lid_to_target".into(),
            utterances.iter().filter(|u| u.lid_to_target).count(),
        ),
        ("early_stop".into(), utterances.iter().filter(|u| u.early_stop).count()),
        (
            "merges".into(),
            segments
                .iter()
                .filter(|s| s.merged_segments.is_some_and(|n| n > 1))
                .count(),
        ),
        (
            "no_translation".into(),
            utterances
                .iter()
                .filter(|u| u.segment_id.is_some() && !u.translated)
                .count(),
        ),
        ("segments".into(), segments.len()),
        (
            "segments_translated".into(),
            segments.iter().filter(|s| s.translation.is_some()).count(),
        ),
        (
            "segments_dropped".into(),
            segments
                .iter()
                .filter(|s| s.skipped.as_deref().is_some_and(is_dropped))
                .count(),
        ),
        (
            "finish_length".into(),
            segments
                .iter()
                .filter(|s| s.finish_reason.as_deref() == Some("length"))
                .count(),
        ),
    ];
    for kind in SKIP_KINDS {
        // `lang_ngoai_tap:<mã>` tính vào `lang_ngoai_tap`.
        let n = segments
            .iter()
            .filter(|s| s.skipped.as_deref().and_then(|r| r.split(':').next()) == Some(kind))
            .count();
        counts.push((format!("skipped_{kind}"), n));
    }
    summary.extend(counts.into_iter().map(|(k, n)| (k, n as f64)));
    summary
}

/// Gốc repo, suy ra từ vị trí crate lúc build (`<repo>/crates/latency-bench`).
fn repo_root() -> Option<PathBuf> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)?
        .canonicalize()
        .ok()
}

/// Đường dẫn để ghi vào file kết quả: tương đối so với gốc repo nếu nằm trong repo, không thì chỉ tên file. Luôn dùng dấu
/// `/`. Đường dẫn tuyệt đối chứa tên người dùng máy, mà file kết quả được commit.
fn relative_to(root: Option<&Path>, path: &Path) -> String {
    match root.and_then(|r| path.strip_prefix(r).ok()) {
        Some(rel) if !rel.as_os_str().is_empty() => rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/"),
        _ => path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
    }
}

fn public_path(path: &Path) -> String {
    public_path_in(repo_root().as_deref(), path)
}

/// Đường dẫn của `path` tính từ gốc repo, kể cả khi đi qua symlink: tìm thư mục cha (hoặc chính nó) của đường dẫn nguyên
/// dạng mà khi giải symlink trùng với `root`, rồi lấy phần còn lại, không giải symlink trong repo. Nhờ vậy `models` là
/// symlink ra ngoài repo vẫn ghi `models/...`, và gốc repo nằm sau symlink (như `/var` trên macOS) cũng không sao. Không nằm
/// trong repo thì chỉ ghi tên file. Các file này đã tồn tại và đã được dùng khi ghi kết quả.
fn public_path_in(root: Option<&Path>, path: &Path) -> String {
    let lexical = std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
    let inside = root.and_then(|r| {
        let repo = lexical.ancestors().find(|a| a.canonicalize().is_ok_and(|c| c == r))?;
        Some(r.join(lexical.strip_prefix(repo).ok()?))
    });
    inside.map_or_else(|| relative_to(None, path), |p| relative_to(root, &p))
}

/// Tham số thêm cho llama-server để ghi vào file kết quả: đường dẫn tuyệt đối (đứng riêng hoặc sau dấu `=`) đổi như
/// `relative_to`, phần còn lại giữ nguyên.
fn public_args(root: Option<&Path>, args: &str) -> String {
    let public = |token: &str| match token.split_once('=') {
        Some((flag, value)) if Path::new(value).is_absolute() => {
            format!("{flag}={}", relative_to(root, Path::new(value)))
        }
        _ if Path::new(token).is_absolute() => relative_to(root, Path::new(token)),
        _ => token.to_string(),
    };
    args.split_whitespace().map(public).collect::<Vec<_>>().join(" ")
}

fn read_wav_16k_mono(path: &PathBuf) -> Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path).with_context(|| format!("không mở được {}", path.display()))?;
    let spec = reader.spec();
    if spec.sample_rate != 16_000 || spec.channels != 1 || spec.bits_per_sample != 16 {
        bail!("{} phải là WAV 16 kHz, mono, 16-bit", path.display());
    }
    Ok(reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32768.0))
        .collect::<Result<_, _>>()?)
}

/// CPU trung bình, tính bằng phần trăm của một lõi (nhiều lõi thì vượt 100): thời gian CPU tích lũy chia thời gian thực.
fn cpu_percent(cpu_ms: u64, wall: Duration) -> f64 {
    let wall_ms = wall.as_secs_f64() * 1000.0;
    if wall_ms > 0.0 {
        cpu_ms as f64 / wall_ms * 100.0
    } else {
        0.0
    }
}

/// Một mẫu thời gian CPU của một tiến trình: lúc lấy mẫu và thời gian CPU tích lũy (ms).
#[derive(Clone, Copy)]
struct CpuSample {
    at: Instant,
    cpu_ms: u64,
}

fn spawn_sampler(
    pids: HashMap<String, u32>,
    stop: Arc<AtomicBool>,
) -> std::thread::JoinHandle<HashMap<String, ProcessUsage>> {
    std::thread::spawn(move || {
        let mut sys = System::new();
        let list: Vec<Pid> = pids.values().map(|&p| Pid::from_u32(p)).collect();
        let mut usage: HashMap<String, ProcessUsage> =
            pids.keys().map(|k| (k.clone(), ProcessUsage::default())).collect();
        // Mẫu đầu và mẫu cuối của từng tiến trình: (lúc lấy mẫu, thời gian CPU tích lũy, ms). Không dùng `cpu_usage`: sysinfo
        // trên macOS giữ nguyên số cũ khi tiến trình rảnh, nên trung bình các mẫu bị lệch.
        let mut cpu: HashMap<String, (CpuSample, CpuSample)> = HashMap::new();
        while !stop.load(Ordering::Relaxed) {
            sys.refresh_processes(ProcessesToUpdate::Some(&list), true);
            let now = Instant::now();
            for (name, &pid) in &pids {
                if let (Some(p), Some(u)) = (sys.process(Pid::from_u32(pid)), usage.get_mut(name)) {
                    u.peak_rss_mb = u.peak_rss_mb.max(p.memory() as f64 / 1_048_576.0);
                    #[cfg(target_os = "macos")]
                    if let Some(mb) = peak_footprint_mb(pid) {
                        u.peak_footprint_mb = u.peak_footprint_mb.max(mb);
                    }
                    let sample = CpuSample {
                        at: now,
                        cpu_ms: p.accumulated_cpu_time(),
                    };
                    cpu.entry(name.clone())
                        .and_modify(|e| e.1 = sample)
                        .or_insert((sample, sample));
                    u.samples += 1;
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        for (name, u) in &mut usage {
            if let Some(&(first, last)) = cpu.get(name) {
                u.avg_cpu_percent = cpu_percent(
                    last.cpu_ms.saturating_sub(first.cpu_ms),
                    last.at.duration_since(first.at),
                );
            }
        }
        usage
    })
}

/// macOS: `phys_footprint` đỉnh của tiến trình từ lúc khởi động (`ri_lifetime_max_phys_footprint`), nên gồm cả lúc nạp model
/// mà bộ lấy mẫu (chạy sau khi nạp xong) không thấy.
#[cfg(target_os = "macos")]
fn peak_footprint_mb(pid: u32) -> Option<f64> {
    let mut info = std::mem::MaybeUninit::<libc::rusage_info_v4>::zeroed();
    // SAFETY: với flavor RUSAGE_INFO_V4, `proc_pid_rusage` ghi tối đa `size_of::<rusage_info_v4>()` byte vào vùng nhớ này.
    // Struct chỉ gồm u64 và mảng u8 nên toàn số 0 cũng là giá trị hợp lệ.
    let ret = unsafe { libc::proc_pid_rusage(pid as i32, libc::RUSAGE_INFO_V4, info.as_mut_ptr().cast()) };
    if ret != 0 {
        return None;
    }
    // SAFETY: vùng nhớ đã được khởi tạo bằng số 0, và `proc_pid_rusage` vừa ghi đè (xem trên).
    let info = unsafe { info.assume_init() };
    Some(info.ri_phys_footprint.max(info.ri_lifetime_max_phys_footprint) as f64 / 1_048_576.0)
}

fn machine_info() -> HashMap<String, String> {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();
    HashMap::from([
        (
            "cpu".to_string(),
            sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default(),
        ),
        ("logical_cores".to_string(), sys.cpus().len().to_string()),
        (
            "physical_cores".to_string(),
            System::physical_core_count().map(|c| c.to_string()).unwrap_or_default(),
        ),
        (
            "ram_gb".to_string(),
            format!("{:.1}", sys.total_memory() as f64 / 1_073_741_824.0),
        ),
        ("os".to_string(), System::long_os_version().unwrap_or_default()),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Một đoạn đã xử lý xong như luồng MT làm: tính `shown_at_ms` từ các mốc và lý do bỏ.
    fn finished(mut rec: SegmentRecord) -> SegmentRecord {
        (rec.shown_at_ms, rec.first_shown_at_ms) = shown_times(&rec);
        rec
    }

    fn translated(end_ms: u64, asr_done: f64, first: f64, done: f64) -> SegmentRecord {
        finished(SegmentRecord {
            end_ms,
            asr_done_at_ms: asr_done,
            mt_first_at_ms: Some(first),
            mt_done_at_ms: Some(done),
            translation: Some("Xin chào".into()),
            finish_reason: Some("stop".into()),
            ..Default::default()
        })
    }

    fn skipped(end_ms: u64, asr_done: f64, reason: &str) -> SegmentRecord {
        finished(SegmentRecord {
            end_ms,
            asr_done_at_ms: asr_done,
            skipped: Some(reason.into()),
            ..Default::default()
        })
    }

    fn utt(id: &str, end_ms: u64) -> Utterance {
        Utterance {
            id: id.into(),
            lang: "en".into(),
            start_ms: 0,
            end_ms,
            vad_end_ms: None,
            text: String::new(),
        }
    }

    /// Câu có mốc dừng đã tinh chỉnh (`end_ms`) và mốc VAD (`vad_end_ms`), như file truth của `build_sessions.py`.
    fn utt_vad(id: &str, end_ms: u64, vad_end_ms: u64) -> Utterance {
        Utterance {
            vad_end_ms: Some(vad_end_ms),
            ..utt(id, end_ms)
        }
    }

    fn utt_in(id: &str, lang: &str, end_ms: u64) -> Utterance {
        Utterance {
            lang: lang.into(),
            ..utt(id, end_ms)
        }
    }

    /// Đoạn với ngôn ngữ mà LID nhận diện.
    fn in_lang(mut rec: SegmentRecord, lang: &str) -> SegmentRecord {
        rec.lang = lang.into();
        rec
    }

    /// Một đoạn tiếng Anh chưa chép lời xong, chỉ có mốc tiếng nói (không gồm đệm) và chữ, để thử ghép câu.
    fn piece(start_ms: u64, end_ms: u64, text: &str) -> SegmentRecord {
        SegmentRecord {
            start_ms,
            end_ms,
            audio_ms: end_ms - start_ms + 448, // gồm đệm 2 × 224 ms
            lang: "en".into(),
            text: text.into(),
            ..Default::default()
        }
    }

    fn rec(lang: &str, text: &str, no_speech_prob: f32, avg_logprob: f32) -> SegmentRecord {
        SegmentRecord {
            lang: lang.into(),
            text: text.into(),
            no_speech_prob,
            avg_logprob,
            ..Default::default()
        }
    }

    #[test]
    fn segments_outside_the_worker_range_are_not_sent() {
        assert_eq!(pcm_skip_reason(0), Some("too_short"));
        assert_eq!(pcm_skip_reason(MIN_PCM_SAMPLES - 1), Some("too_short"));
        assert_eq!(pcm_skip_reason(MIN_PCM_SAMPLES), None);
        assert_eq!(pcm_skip_reason(MAX_PCM_SAMPLES), None);
        assert_eq!(pcm_skip_reason(MAX_PCM_SAMPLES + 1), Some("too_long"));
    }

    #[test]
    fn route_follows_the_app_rules() {
        assert_eq!(route(&rec("en", "Hello", 0.0, -0.3), Lang::Vi), Ok(Lang::En));
        assert_eq!(route(&rec("en", "", 0.0, 0.0), Lang::Vi), Err("no_speech".into()));
        assert_eq!(route(&rec("en", " \n", 0.0, -0.3), Lang::Vi), Err("no_speech".into()));
        assert_eq!(
            route(&rec("vi", "Xin chào", 0.0, -0.3), Lang::Vi),
            Err("same_lang".into())
        );
        assert_eq!(
            route(&rec("fr", "Bonjour", 0.0, -0.3), Lang::Vi),
            Err("lang_ngoai_tap:fr".into())
        );
    }

    #[test]
    fn no_speech_needs_both_a_high_no_speech_prob_and_a_low_avg_logprob() {
        let drops = |no_speech: f32, logprob: f32| route(&rec("ko", "안녕", no_speech, logprob), Lang::Vi).is_err();
        // Luật của OpenAI Whisper: bỏ khi cả hai điều kiện cùng đúng.
        assert!(drops(0.9, -1.5));
        // `no_speech` cao mà chữ chắc chắn (câu tiếng Hàn đúng có no_speech 0,62 và avg_logprob −0,25): giữ.
        assert!(!drops(0.62, -0.25));
        assert!(!drops(1.0, -0.5));
        // `no_speech` thấp mà chữ kém chắc chắn: giữ (turbo có no_speech khoảng 1e-11 nên không bao giờ bị bỏ).
        assert!(!drops(0.0, -3.0));
        assert!(!drops(1e-11, -3.0));
        // Biên: đúng 0,6 chưa quá ngưỡng, đúng −1,0 chưa dưới ngưỡng.
        assert!(!drops(0.6, -1.5));
        assert!(!drops(0.9, -1.0));
        assert!(drops(0.61, -1.01));
        // Lý do bỏ vẫn tên `no_speech`.
        assert_eq!(route(&rec("ko", "안녕", 0.9, -1.5), Lang::Vi), Err("no_speech".into()));
    }

    #[test]
    fn dropped_segments_have_no_shown_time() {
        for reason in ["no_speech", "too_short", "too_long", "empty_translation"] {
            let s = skipped(5_000, 5_400.0, reason);
            assert_eq!((s.shown_at_ms, s.first_shown_at_ms), (None, None), "{reason}");
        }
        // Cùng ngôn ngữ đích hoặc ngoài tập: app hiện luôn bản chép lời.
        for reason in ["same_lang", "lang_ngoai_tap:fr"] {
            let s = skipped(5_000, 5_400.0, reason);
            assert_eq!(
                (s.shown_at_ms, s.first_shown_at_ms),
                (Some(5_400.0), Some(5_400.0)),
                "{reason}"
            );
        }
        let t = translated(5_000, 5_400.0, 5_700.0, 6_500.0);
        assert_eq!((t.shown_at_ms, t.first_shown_at_ms), (Some(6_500.0), Some(5_700.0)));
    }

    #[test]
    fn utterance_latency_is_measured_from_the_true_end() {
        let segments = [translated(5_030, 5_400.0, 5_700.0, 6_500.0)];
        let u = &utterance_latencies(&[utt("a", 5_000)], &segments, Lang::Vi)[0];
        assert_eq!(u.segment_id, Some(0));
        assert_eq!(u.shown_latency_ms, Some(1_500.0));
        assert_eq!(u.first_latency_ms, Some(700.0));
        assert_eq!(u.end_offset_ms, Some(30)); // đoạn dừng sau mốc thật 30 ms
        assert!(u.translated);
        assert_eq!(u.skipped, None);
    }

    #[test]
    fn dropped_or_unmatched_utterances_have_no_latency_and_no_translation() {
        let segments = [skipped(5_030, 5_400.0, "no_speech")];
        let all = utterance_latencies(&[utt("a", 5_000), utt("b", 30_000)], &segments, Lang::Vi);
        let (dropped, unmatched) = (&all[0], &all[1]);
        assert_eq!(dropped.segment_id, Some(0));
        assert_eq!((dropped.shown_latency_ms, dropped.first_latency_ms), (None, None));
        assert!(!dropped.translated);
        assert_eq!(dropped.skipped.as_deref(), Some("no_speech"));
        assert_eq!(unmatched.segment_id, None);
        assert_eq!(unmatched.end_offset_ms, None);
        assert_eq!((unmatched.shown_latency_ms, unmatched.first_latency_ms), (None, None));
        assert!(!unmatched.translated);
        assert_eq!(unmatched.skipped, None);
    }

    #[test]
    fn same_lang_utterance_in_the_target_language_is_measured_but_has_no_translation() {
        // Câu thật là tiếng Việt, đích là tiếng Việt: app hiện luôn bản chép lời, độ trễ là lúc xong chép lời.
        let segments = [in_lang(skipped(5_030, 5_400.0, "same_lang"), "vi")];
        let u = &utterance_latencies(&[utt_in("a", "vi", 5_000)], &segments, Lang::Vi)[0];
        assert_eq!((u.shown_latency_ms, u.first_latency_ms), (Some(400.0), Some(400.0)));
        assert!(!u.translated);
        assert!(!u.lid_mismatch && !u.lid_to_target);
    }

    #[test]
    fn lid_error_into_the_target_language_is_not_a_fast_display() {
        // Câu thật là tiếng Anh nhưng LID nhận diện là tiếng Việt (đích): app chỉ hiện chữ gốc, rất nhanh và sai ngôn ngữ.
        let segments = [in_lang(skipped(5_030, 5_400.0, "same_lang"), "vi")];
        let u = &utterance_latencies(&[utt("a", 5_000)], &segments, Lang::Vi)[0];
        assert_eq!(u.segment_id, Some(0));
        assert_eq!((u.shown_latency_ms, u.first_latency_ms), (None, None));
        assert_eq!(u.lid.as_deref(), Some("vi"));
        assert!(u.lid_mismatch && u.lid_to_target);
        assert!(!u.translated);
    }

    #[test]
    fn lid_error_to_another_language_keeps_the_latency_but_counts_as_mismatch() {
        let segments = [in_lang(translated(5_030, 5_400.0, 5_700.0, 6_500.0), "ja")];
        let u = &utterance_latencies(&[utt_in("a", "ko", 5_000)], &segments, Lang::Vi)[0];
        assert_eq!(u.shown_latency_ms, Some(1_500.0));
        assert!(u.lid_mismatch);
        assert!(!u.lid_to_target);
    }

    #[test]
    fn summary_counts_dropped_skipped_and_truncated_separately() {
        let cut = |mut s: SegmentRecord| {
            s.finish_reason = Some("length".into());
            s
        };
        let mut segments = vec![
            in_lang(translated(900, 1_600.0, 1_900.0, 2_500.0), "en"), // dừng sớm hơn mốc thật 100 ms
            in_lang(cut(translated(5_020, 5_500.0, 5_800.0, 8_000.0)), "en"),
            in_lang(skipped(9_010, 9_400.0, "no_speech"), "en"),
            skipped(20_000, 20_000.0, "too_short"), // không ghép với câu nào
            in_lang(skipped(30_000, 30_500.0, "same_lang"), "vi"),
            in_lang(cut(translated(40_000, 40_400.0, 40_600.0, 41_000.0)), "en"), // không ghép với câu nào
            in_lang(skipped(50_000, 50_100.0, "same_lang"), "vi"), // câu thật là tiếng Anh: LID nhầm sang đích
        ];
        // (asr_ms, lid_ms) của từng đoạn; đoạn too_short chưa từng vào asr-worker nên là 0.
        let steps = [
            (100.0, 10.0),
            (300.0, 30.0),
            (200.0, 20.0),
            (0.0, 0.0),
            (50.0, 5.0),
            (250.0, 25.0),
            (60.0, 6.0),
        ];
        for (seg, (asr, lid)) in segments.iter_mut().zip(steps) {
            seg.asr_ms = asr;
            seg.lid_ms = lid;
        }
        let truth = [
            utt("a", 1_000),
            utt("b", 5_000),
            utt("c", 9_000),
            utt("d", 13_000),
            utt_in("e", "vi", 30_000),
            utt("f", 50_000),
        ];
        let utterances = utterance_latencies(&truth, &segments, Lang::Vi);
        let s = build_summary(&utterances, &segments);
        let get = |k: &str| s[k];
        assert_eq!(get("utterances"), 6.0);
        assert_eq!(get("matched"), 5.0); // d không có đoạn nào
        assert_eq!(get("unmatched"), 1.0);
        assert_eq!(get("measured"), 3.0); // a, b, e; c bị bỏ, f do LID nhầm sang đích
        // Câu ghép được mà không có bản dịch: c bị bỏ, e cùng ngôn ngữ đích, f bị LID nhầm. Câu không ghép được (d)
        // tính riêng.
        assert_eq!(get("no_translation"), 3.0);
        assert_eq!(get("lid_mismatch"), 1.0); // chỉ f
        assert_eq!(get("lid_to_target"), 1.0);
        // Lệch giữa mốc dừng của đoạn và mốc thật: a -100, b +20, c +10, e 0, f 0.
        assert_eq!(get("end_offset_max_abs_ms"), 100.0);
        assert_eq!(get("early_stop"), 0.0);
        assert_eq!(get("segments"), 7.0);
        assert_eq!(get("segments_translated"), 3.0);
        assert_eq!(get("segments_dropped"), 2.0);
        assert_eq!(get("skipped_no_speech"), 1.0);
        assert_eq!(get("skipped_too_short"), 1.0);
        assert_eq!(get("skipped_same_lang"), 2.0);
        for zero in [
            "skipped_too_long",
            "skipped_empty_translation",
            "skipped_lang_ngoai_tap",
        ] {
            assert_eq!(get(zero), 0.0, "{zero}");
        }
        assert_eq!(get("finish_length"), 2.0); // hai bản cụt, một bản "stop"
        // Độ trễ đo được: a 1500, b 3000, e 500; chữ đầu: a 900, b 800, e 500 (tính từ mốc thật, không từ mốc đoạn).
        assert_eq!(get("shown_p50_ms"), 1_500.0);
        assert_eq!(get("first_p50_ms"), 800.0);
        // Các bước chỉ tính đoạn đã qua asr-worker: đoạn too_short không được kéo p50 xuống.
        assert_eq!(get("asr_p50_ms"), 150.0);
        assert_eq!(get("lid_p50_ms"), 15.0);
    }

    #[test]
    fn merge_window_is_measured_from_speech_end_to_next_speech_start() {
        let open = OpenSentence::new(&piece(1_000, 4_000, "so we went to"), Lang::En);
        // Hết tiếng ở 4 000 ms: bắt đầu nói lại ở 4 700 là đúng cửa sổ 700 ms, ở 4 701 là quá 1 ms.
        assert!(open.accepts(&piece(4_700, 6_000, "the market"), 700));
        assert!(!open.accepts(&piece(4_701, 6_000, "the market"), 700));
    }

    #[test]
    fn padding_does_not_widen_the_window() {
        // `audio_ms` gồm đệm 2 × 224 ms; cửa sổ chỉ tính theo mốc tiếng nói `start_ms` và `end_ms`.
        let open = OpenSentence::new(&piece(1_000, 4_000, "so we went to"), Lang::En);
        let next = piece(4_701, 6_000, "the market");
        assert!(next.audio_ms > next.end_ms - next.start_ms);
        assert!(!open.accepts(&next, 700));
    }

    #[test]
    fn forced_cut_pieces_touch_and_merge() {
        // Cắt cưỡng bức ở 8 giây: đoạn sau bắt đầu đúng chỗ đoạn trước kết thúc, khoảng cách bằng 0.
        let open = OpenSentence::new(&piece(0, 8_000, "a long sentence that"), Lang::En);
        assert!(open.accepts(&piece(8_000, 12_000, "keeps going"), 700));
    }

    #[test]
    fn merge_window_follows_end_silence() {
        assert_eq!(merge_window_ms(200), 700);
        assert_eq!(merge_window_ms(300), 700);
        assert_eq!(merge_window_ms(301), 701);
        assert_eq!(merge_window_ms(800), 1_200);
    }

    #[test]
    fn sentence_is_capped_at_three_segments() {
        let mut open = OpenSentence::new(&piece(0, 2_000, "one"), Lang::En);
        let two = piece(2_100, 4_000, "two");
        let three = piece(4_100, 6_000, "three");
        assert!(open.accepts(&two, 700));
        open.push(&two);
        assert!(open.accepts(&three, 700)); // mới 2 đoạn: còn chỗ
        open.push(&three);
        assert_eq!(open.segments, 3);
        assert!(!open.accepts(&piece(6_100, 7_000, "four"), 700)); // đủ 3 đoạn: đoạn sau mở câu mới
    }

    #[test]
    fn sentence_is_capped_at_15_seconds_of_speech() {
        let open = OpenSentence::new(&piece(0, 8_000, "x"), Lang::En); // 8 giây tiếng nói
        assert!(open.accepts(&piece(8_100, 15_000, "y"), 700)); // tổng 14,9 giây
        assert!(open.accepts(&piece(8_100, 15_100, "y"), 700)); // đúng 15 giây: còn được
        assert!(!open.accepts(&piece(8_100, 15_101, "y"), 700)); // 15,001 giây: quá trần
    }

    #[test]
    fn speech_duration_counts_only_speech_not_the_pauses_between_pieces() {
        let mut open = OpenSentence::new(&piece(0, 5_000, "x"), Lang::En);
        open.push(&piece(5_600, 10_600, "y")); // hai khoảng nói 5 giây, nghỉ 0,6 giây: tiếng nói 10 giây
        assert!(open.accepts(&piece(11_200, 16_200, "z"), 700)); // 10 + 5 = 15 giây tiếng nói, dù cả câu trải 16,2 giây
    }

    #[test]
    fn terminal_punctuation_closes_the_sentence() {
        for end in [".", "?", "!", "。", "？", "！", ". ", "?\n"] {
            let open = OpenSentence::new(&piece(0, 2_000, &format!("đã xong{end}")), Lang::En);
            assert!(!open.accepts(&piece(2_100, 3_000, "câu sau"), 700), "{end:?}");
        }
        for end in ["", ",", ";", ":", "，", "、", " và"] {
            let open = OpenSentence::new(&piece(0, 2_000, &format!("còn tiếp{end}")), Lang::En);
            assert!(open.accepts(&piece(2_100, 3_000, "câu sau"), 700), "{end:?}");
        }
    }

    #[test]
    fn only_the_last_piece_decides_whether_the_sentence_is_closed() {
        let mut open = OpenSentence::new(&piece(0, 2_000, "Xong rồi."), Lang::En);
        assert!(!open.accepts(&piece(2_100, 3_000, "tiếp"), 700));
        // Câu mở mà đoạn đầu có dấu chấm giữa chừng (ví dụ "Mr. Smith") vẫn ghép tiếp nếu đoạn cuối không có.
        open = OpenSentence::new(&piece(0, 2_000, "Mr. Smith said"), Lang::En);
        open.push(&piece(2_100, 3_000, "that it was done."));
        assert!(!open.accepts(&piece(3_100, 4_000, "next"), 700));
    }

    #[test]
    fn different_language_does_not_merge() {
        let open = OpenSentence::new(&piece(0, 2_000, "hello"), Lang::En);
        let mut next = piece(2_100, 3_000, "xin chào");
        next.lang = "vi".into();
        assert!(!open.accepts(&next, 700));
    }

    #[test]
    fn merged_source_is_the_whole_sentence() {
        let mut open = None;
        let a = piece(0, 3_000, "We walked to the");
        let b = piece(3_400, 6_000, "market yesterday.");
        let c = piece(6_200, 8_000, "Then we ate.");
        assert_eq!(
            plan_merge(&mut open, &a, Lang::En, 700),
            (1, "We walked to the".to_string())
        );
        assert_eq!(
            plan_merge(&mut open, &b, Lang::En, 700),
            (2, "We walked to the market yesterday.".to_string())
        );
        // `b` kết thúc bằng dấu chấm: câu đã chốt, `c` mở câu mới.
        assert_eq!(
            plan_merge(&mut open, &c, Lang::En, 700),
            (1, "Then we ate.".to_string())
        );
    }

    #[test]
    fn a_piece_outside_the_window_starts_a_new_sentence() {
        let mut open = None;
        plan_merge(&mut open, &piece(0, 3_000, "first part"), Lang::En, 700);
        let late = piece(3_701, 5_000, "second part");
        assert_eq!(
            plan_merge(&mut open, &late, Lang::En, 700),
            (1, "second part".to_string())
        );
    }

    #[test]
    fn chinese_and_japanese_join_without_a_space() {
        for (lang, code) in [(Lang::Zh, "zh"), (Lang::Ja, "ja")] {
            let mut open = None;
            let mut a = piece(0, 3_000, "我们走到 ");
            let mut b = piece(3_200, 5_000, " 市场");
            (a.lang, b.lang) = (code.into(), code.into());
            plan_merge(&mut open, &a, lang, 700);
            assert_eq!(
                plan_merge(&mut open, &b, lang, 700),
                (2, "我们走到市场".to_string()),
                "{code}"
            );
        }
    }

    #[test]
    fn other_languages_join_with_one_space() {
        for (lang, code) in [(Lang::En, "en"), (Lang::Ko, "ko"), (Lang::Vi, "vi")] {
            let mut open = None;
            let mut a = piece(0, 3_000, "một hai ");
            let mut b = piece(3_200, 5_000, " ba bốn");
            (a.lang, b.lang) = (code.into(), code.into());
            plan_merge(&mut open, &a, lang, 700);
            assert_eq!(
                plan_merge(&mut open, &b, lang, 700),
                (2, "một hai ba bốn".to_string()),
                "{code}"
            );
        }
    }

    #[test]
    fn end_offset_is_measured_against_the_vad_mark_but_latency_against_the_refined_end() {
        // Mốc thật đã tinh chỉnh sớm hơn mốc VAD 80 ms; đoạn của Segmenter dừng theo VAD nên khớp mốc VAD.
        let segments = [translated(5_080, 5_400.0, 5_700.0, 6_500.0)];
        let u = &utterance_latencies(&[utt_vad("a", 5_000, 5_080)], &segments, Lang::Vi)[0];
        assert_eq!(u.end_offset_ms, Some(0));
        assert_eq!(u.shown_latency_ms, Some(1_500.0)); // độ trễ vẫn tính từ mốc đã tinh chỉnh
        assert_eq!(u.first_latency_ms, Some(700.0));
        assert!(!u.early_stop);
        // Truth cũ không có `vad_end_ms`: lệch tính so với `end_ms`.
        let u = &utterance_latencies(&[utt("a", 5_000)], &segments, Lang::Vi)[0];
        assert_eq!(u.end_offset_ms, Some(80));
    }

    #[test]
    fn early_stop_and_summary_offset_use_the_vad_mark() {
        // Mốc đã tinh chỉnh 5 000, mốc VAD 5 100. Đoạn dừng ở 4 899: sớm hơn mốc VAD 201 ms (gắn cờ), dù chỉ sớm hơn mốc
        // tinh chỉnh 101 ms. Đoạn dừng ở 10 050 khớp mốc VAD ở câu thứ hai, dù muộn hơn mốc tinh chỉnh 50 ms.
        let segments = [
            translated(4_899, 5_400.0, 5_700.0, 6_500.0),
            translated(10_050, 10_400.0, 10_700.0, 11_500.0),
        ];
        let truth = [utt_vad("a", 5_000, 5_100), utt_vad("b", 10_000, 10_050)];
        let all = utterance_latencies(&truth, &segments, Lang::Vi);
        assert_eq!((all[0].end_offset_ms, all[0].early_stop), (Some(-201), true));
        assert_eq!((all[1].end_offset_ms, all[1].early_stop), (Some(0), false));
        let s = build_summary(&all, &segments);
        assert_eq!(s["end_offset_max_abs_ms"], 201.0);
        assert_eq!(s["early_stop"], 1.0);
    }

    #[test]
    fn early_stop_is_flagged_beyond_200_ms() {
        // Đoạn dừng sớm hơn mốc thật đúng 200 ms thì chưa gắn cờ, 201 ms thì gắn: độ trễ của câu đó bị đo thiếu.
        let segments = [
            translated(4_800, 5_400.0, 5_700.0, 6_500.0),
            translated(9_799, 10_400.0, 10_700.0, 11_500.0),
        ];
        let all = utterance_latencies(&[utt("a", 5_000), utt("b", 10_000)], &segments, Lang::Vi);
        assert_eq!((all[0].end_offset_ms, all[0].early_stop), (Some(-200), false));
        assert_eq!((all[1].end_offset_ms, all[1].early_stop), (Some(-201), true));
        assert_eq!(build_summary(&all, &segments)["early_stop"], 1.0);
    }

    #[test]
    fn queue_waits_are_separated_from_service_times() {
        // Đoạn đóng lúc 1 000, asr-worker nhận lúc 1 300 (chờ 300), xong lúc 1 500; luồng MT nhận lúc 1 900 (chờ 400),
        // dịch xong lúc 2 400 (phục vụ 500).
        let mut a = translated(900, 1_500.0, 1_700.0, 2_400.0);
        (a.closed_at_ms, a.asr_started_at_ms, a.mt_started_at_ms) = (1_000.0, 1_300.0, Some(1_900.0));
        // Đoạn không phải chờ gì.
        let mut b = translated(5_000, 6_000.0, 6_100.0, 6_300.0);
        (b.closed_at_ms, b.asr_started_at_ms, b.mt_started_at_ms) = (5_500.0, 5_500.0, Some(6_000.0));
        let segments = [a, b];
        let s = build_summary(
            &utterance_latencies(&[utt("a", 1_000), utt("b", 5_000)], &segments, Lang::Vi),
            &segments,
        );
        assert_eq!(s["asr_wait_p50_ms"], 150.0); // (300 + 0) / 2
        assert_eq!(s["mt_wait_p50_ms"], 200.0); // (400 + 0) / 2
        assert_eq!(s["mt_p50_ms"], 400.0); // (500 + 300) / 2: chỉ thời gian dịch, không gồm thời gian chờ
        assert_eq!(s["mt_wait_p90_ms"], 360.0); // nội suy giữa 0 và 400 ở hạng 0,9
    }

    #[test]
    fn cpu_percent_is_cpu_time_over_wall_time() {
        assert_eq!(cpu_percent(500, Duration::from_secs(1)), 50.0);
        assert_eq!(cpu_percent(3_000, Duration::from_secs(2)), 150.0); // nhiều lõi: trên 100% của một lõi
        assert_eq!(cpu_percent(0, Duration::from_secs(10)), 0.0); // tiến trình rảnh: 0, không giữ số cũ
        assert_eq!(cpu_percent(10, Duration::ZERO), 0.0);
    }

    #[test]
    fn result_paths_are_relative_to_the_repo_or_just_the_file_name() {
        let root = Some(Path::new("/home/dev/meeting-translator"));
        let rel = |p: &str| relative_to(root, Path::new(p));
        assert_eq!(
            rel("/home/dev/meeting-translator/models/ggml-small-q5_1.bin"),
            "models/ggml-small-q5_1.bin"
        );
        assert_eq!(
            rel("/home/dev/meeting-translator/tools/llama-b11146/macos-arm64/llama-b11146/llama-server"),
            "tools/llama-b11146/macos-arm64/llama-b11146/llama-server"
        );
        // Ngoài repo: chỉ tên file, không lộ thư mục cha (có thể chứa tên người dùng).
        assert_eq!(rel("/Users/somebody/models/x.gguf"), "x.gguf");
        // Cùng tiền tố chuỗi nhưng là thư mục khác: không phải trong repo.
        assert_eq!(rel("/home/dev/meeting-translator-old/models/x.bin"), "x.bin");
        // Không biết gốc repo, hoặc đường dẫn không tuyệt đối: chỉ tên file.
        assert_eq!(
            relative_to(None, Path::new("/home/dev/meeting-translator/models/x.bin")),
            "x.bin"
        );
        assert_eq!(rel("models/x.bin"), "x.bin");
        assert_eq!(rel("/home/dev/meeting-translator"), "meeting-translator");
    }

    #[test]
    fn public_path_keeps_the_repo_relative_name_through_symlinks() {
        /// Xóa thư mục thử kể cả khi một assert bên dưới thất bại.
        struct TempDir(PathBuf);
        impl Drop for TempDir {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let tmp = TempDir(std::env::temp_dir().join(format!("latency-bench-paths-{}", std::process::id())));
        let _ = std::fs::remove_dir_all(&tmp.0);
        let (repo, outside) = (tmp.0.join("repo"), tmp.0.join("outside"));
        std::fs::create_dir_all(repo.join("tools")).unwrap();
        std::fs::create_dir_all(outside.join("models")).unwrap();
        std::fs::write(outside.join("models/big.gguf"), b"x").unwrap();
        std::fs::write(repo.join("tools/server"), b"x").unwrap();
        let root = repo.canonicalize().unwrap();
        let public = |p: &Path| public_path_in(Some(&root), p);
        // Thư mục tmp trên macOS nằm sau symlink (/var -> /private/var): đường dẫn nguyên dạng khác đường dẫn đã giải symlink.
        assert_eq!(public(&repo.join("tools/server")), "tools/server");
        assert_eq!(public(&root.join("tools/server")), "tools/server");
        // Ngoài repo: chỉ tên file.
        assert_eq!(public(&outside.join("models/big.gguf")), "big.gguf");
        #[cfg(unix)]
        {
            // `models` trong repo là symlink ra ngoài repo: vẫn ghi `models/big.gguf`, giống các máy không dùng symlink.
            std::os::unix::fs::symlink(outside.join("models"), repo.join("models")).unwrap();
            assert_eq!(public(&repo.join("models/big.gguf")), "models/big.gguf");
            assert_eq!(public(&root.join("models/big.gguf")), "models/big.gguf");
        }
    }

    #[test]
    fn llama_args_keep_flags_but_not_absolute_paths() {
        let root = Some(Path::new("/home/dev/meeting-translator"));
        assert_eq!(public_args(root, "--no-repack -t 4"), "--no-repack -t 4");
        assert_eq!(public_args(root, ""), "");
        assert_eq!(
            public_args(root, "--model-draft /Users/somebody/m/draft.gguf -t 4"),
            "--model-draft draft.gguf -t 4"
        );
        assert_eq!(
            public_args(
                root,
                "--model-draft=/home/dev/meeting-translator/models/d.gguf --no-repack"
            ),
            "--model-draft=models/d.gguf --no-repack"
        );
    }

    #[test]
    fn lang_outside_the_set_counts_under_one_key() {
        let segments = [
            skipped(1_000, 1_100.0, "lang_ngoai_tap:fr"),
            skipped(2_000, 2_100.0, "lang_ngoai_tap:de"),
        ];
        let utterances = utterance_latencies(&[utt("a", 1_000), utt("b", 2_000)], &segments, Lang::Vi);
        assert_eq!(build_summary(&utterances, &segments)["skipped_lang_ngoai_tap"], 2.0);
    }
}
