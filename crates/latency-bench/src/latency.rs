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
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessesToUpdate, System};

/// Bỏ đoạn có `no_speech_prob > 0,6` (spec §6.4).
const NO_SPEECH_MAX: f32 = 0.6;
/// Cửa sổ (ms) ghép đoạn với mốc dừng câu thật, xem `match_segments`.
const MATCH_WINDOW_MS: u64 = 1_000;
/// Khung âm thanh tới trễ hơn thời gian thực quá ngưỡng này (ms) thì kết quả lệch cùng cỡ: báo cho người chạy.
const FEED_LAG_WARN_MS: f64 = 100.0;

// Lý do một đoạn không được dịch, ghi ở `SegmentRecord::skipped`.
/// `no_speech_prob` quá cao, hoặc chữ rỗng: app bỏ đoạn này (§6.4).
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
    asr_done_at_ms: f64,
    lid_ms: f32,
    asr_ms: f32,
    lang: String,
    lang_prob: f32,
    text: String,
    no_speech_prob: f32,
    /// Số token của câu gốc theo `/tokenize`, và `max_tokens` đã gửi cho bản dịch (§6.5).
    src_tokens: Option<usize>,
    max_tokens: Option<u32>,
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
    /// Mốc dừng của đoạn ghép được trừ mốc dừng thật (ms). Lệch lớn nghĩa là mốc thật không khớp lúc người nói dừng
    /// (xem `build_sessions.py`), và độ trễ của câu đó lệch cùng cỡ: đoạn dừng sớm hơn mốc thật (âm) thì độ trễ bị đo
    /// thiếu, muộn hơn (dương) thì bị đo thừa.
    end_offset_ms: Option<i64>,
    shown_latency_ms: Option<f64>,
    first_latency_ms: Option<f64>,
    /// Đoạn ghép được có bản dịch. `false` nếu không ghép được đoạn nào.
    translated: bool,
    /// Lý do đoạn ghép được không có bản dịch, nếu có.
    skipped: Option<String>,
}

#[derive(Serialize, Default)]
struct ProcessUsage {
    peak_rss_mb: f64,
    /// macOS: `phys_footprint` (số Activity Monitor hiển thị), tính cả bộ nhớ Metal mà RSS bỏ sót, nhưng không
    /// tính trang của file model được mmap. Nền tảng khác để 0; VRAM trên Windows đo bằng `vram-sample.ps1`.
    peak_footprint_mb: f64,
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
    let asr_thread = std::thread::spawn(move || -> Result<()> {
        let mut prompts: HashMap<String, Vec<i32>> = HashMap::new();
        for (segment, closed_at_ms) in seg_rx {
            let mut rec = SegmentRecord {
                id: segment.id,
                start_ms: segment.start_ms,
                end_ms: segment.end_ms,
                audio_ms: segment.samples.len() as u64 * 1000 / 16_000,
                closed_at_ms,
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
            asr_tx.send(rec)?;
        }
        Ok(())
    });

    let mt_thread = std::thread::spawn(move || -> Result<()> {
        for mut rec in asr_rx {
            if rec.skipped.is_none() {
                match route(&rec, target) {
                    Err(reason) => rec.skipped = Some(reason),
                    Ok(src) => {
                        // Tính `max_tokens` theo §6.5. Lần gọi /tokenize nằm trong thời gian của bước dịch.
                        let src_tokens = llama.count_tokens(&rec.text)?;
                        let max_tokens = max_tokens_for(src_tokens);
                        let t = llama.translate(&translation_prompt(&rec.text, src, target), max_tokens)?;
                        let done = now_ms();
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
    stop_sampler.store(true, Ordering::Relaxed);
    let usage = sampler.join().expect("luồng đo tài nguyên panic");
    // Báo lỗi của luồng ở cuối chuỗi trước: khi luồng MT chết, luồng ASR và luồng phát lại chỉ còn báo "kênh đã đóng"
    // ở lần gửi kế tiếp, che mất nguyên nhân thật. Ngược lại, khi luồng ASR chết thì luồng MT dừng bình thường.
    mt_result?;
    asr_result?;
    played?;

    let mut segments: Vec<SegmentRecord> = rec_rx.into_iter().collect();
    segments.sort_by_key(|s| s.id);
    let utterances = utterance_latencies(&truth, &segments);
    let mut summary = build_summary(&utterances, &segments);
    if summary["measured"] == 0.0 {
        bail!("không đo được câu nào (không ghép được với mốc thật, hoặc đoạn đều bị bỏ); kiểm tra file truth và VAD");
    }
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
            ("asr_model".to_string(), args.asr_model.display().to_string()),
            ("mt_model".to_string(), args.mt_model.display().to_string()),
            ("languages".to_string(), args.languages.join(",")),
            ("target".to_string(), args.target.clone()),
            ("end_silence_ms".to_string(), args.end_silence_ms.to_string()),
            ("min_ctx".to_string(), args.min_ctx.to_string()),
            ("llama_args".to_string(), args.llama_args.clone()),
        ]),
        summary,
        usage,
        utterances,
        segments,
    };
    serde_json::to_writer_pretty(std::fs::File::create(&args.out)?, &report)?;
    let s = &report.summary;
    println!(
        "{}: p50 = {:.0} ms, p90 = {:.0} ms, chữ đầu p50 = {:.0} ms, ghép được {}/{} câu",
        report.label, s["shown_p50_ms"], s["shown_p90_ms"], s["first_p50_ms"], s["matched"], s["utterances"]
    );
    println!(
        "  đo được {} câu; không ghép được {}, không có bản dịch {}; đoạn bị bỏ {}, bản dịch bị cụt (length) {}; \
         mốc dừng lệch tối đa {:.0} ms",
        s["measured"],
        s["unmatched"],
        s["no_translation"],
        s["segments_dropped"],
        s["finish_length"],
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

/// Quy tắc của app cho một đoạn đã chép lời: `Ok(ngôn ngữ nguồn)` nếu phải dịch, `Err(lý do)` nếu bỏ bước dịch.
fn route(rec: &SegmentRecord, target: Lang) -> Result<Lang, String> {
    if rec.no_speech_prob > NO_SPEECH_MAX || rec.text.trim().is_empty() {
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
fn utterance_latencies(truth: &[Utterance], segments: &[SegmentRecord]) -> Vec<UtteranceLatency> {
    let ends: Vec<u64> = segments.iter().map(|s| s.end_ms).collect();
    let matches = match_segments(truth, &ends, MATCH_WINDOW_MS);
    truth
        .iter()
        .zip(&matches)
        .map(|(u, m)| {
            let seg = m.map(|i| &segments[i]);
            let since_end = |t: f64| t - u.end_ms as f64;
            UtteranceLatency {
                id: u.id.clone(),
                lang: u.lang.clone(),
                end_ms: u.end_ms,
                segment_id: seg.map(|s| s.id),
                end_offset_ms: seg.map(|s| s.end_ms as i64 - u.end_ms as i64),
                shown_latency_ms: seg.and_then(|s| s.shown_at_ms).map(since_end),
                first_latency_ms: seg.and_then(|s| s.first_shown_at_ms).map(since_end),
                translated: seg.is_some_and(|s| s.translation.is_some()),
                skipped: seg.and_then(|s| s.skipped.clone()),
            }
        })
        .collect()
}

/// Bản tóm tắt của một lượt đo:
/// - `shown_*`, `first_*`: phân vị độ trễ trên các câu đo được (`measured`), tức câu ghép được với một đoạn không bị bỏ.
/// - `asr_*`, `lid_*`, `mt_*`: phân vị thời gian từng bước (ms), trên các đoạn đã qua bước đó.
/// - `utterances`: số câu thật; `matched`: số câu ghép được với một đoạn (kể cả đoạn bị bỏ); `unmatched`: số câu còn lại.
/// - `no_translation`: số câu ghép được với một đoạn không có bản dịch (đoạn bị bỏ, hoặc không cần dịch). Không gồm
///   câu không ghép được: không biết chúng ra sao, vì không có đoạn nào đại diện.
/// - `end_offset_max_abs_ms`: lệch lớn nhất giữa mốc dừng của đoạn và mốc thật, trên các câu ghép được.
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
    let mt_ms: Vec<f32> = segments
        .iter()
        .filter_map(|s| s.mt_done_at_ms.map(|d| (d - s.asr_done_at_ms) as f32))
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

fn spawn_sampler(
    pids: HashMap<String, u32>,
    stop: Arc<AtomicBool>,
) -> std::thread::JoinHandle<HashMap<String, ProcessUsage>> {
    std::thread::spawn(move || {
        let mut sys = System::new();
        let list: Vec<Pid> = pids.values().map(|&p| Pid::from_u32(p)).collect();
        let mut usage: HashMap<String, ProcessUsage> =
            pids.keys().map(|k| (k.clone(), ProcessUsage::default())).collect();
        while !stop.load(Ordering::Relaxed) {
            sys.refresh_processes(ProcessesToUpdate::Some(&list), true);
            for (name, &pid) in &pids {
                if let (Some(p), Some(u)) = (sys.process(Pid::from_u32(pid)), usage.get_mut(name)) {
                    u.peak_rss_mb = u.peak_rss_mb.max(p.memory() as f64 / 1_048_576.0);
                    #[cfg(target_os = "macos")]
                    if let Some(mb) = phys_footprint_mb(pid) {
                        u.peak_footprint_mb = u.peak_footprint_mb.max(mb);
                    }
                    u.avg_cpu_percent += p.cpu_usage() as f64;
                    u.samples += 1;
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        for u in usage.values_mut() {
            if u.samples > 0 {
                u.avg_cpu_percent /= u.samples as f64;
            }
        }
        usage
    })
}

#[cfg(target_os = "macos")]
fn phys_footprint_mb(pid: u32) -> Option<f64> {
    let mut info = std::mem::MaybeUninit::<libc::rusage_info_v2>::zeroed();
    let ret = unsafe { libc::proc_pid_rusage(pid as i32, libc::RUSAGE_INFO_V2, info.as_mut_ptr().cast()) };
    (ret == 0).then(|| unsafe { info.assume_init() }.ri_phys_footprint as f64 / 1_048_576.0)
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
            text: String::new(),
        }
    }

    fn rec(lang: &str, text: &str, no_speech_prob: f32) -> SegmentRecord {
        SegmentRecord {
            lang: lang.into(),
            text: text.into(),
            no_speech_prob,
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
        assert_eq!(route(&rec("en", "Hello", 0.0), Lang::Vi), Ok(Lang::En));
        assert_eq!(
            route(&rec("ko", "안녕", 0.6), Lang::Vi),
            Ok(Lang::Ko),
            "đúng ngưỡng thì chưa bỏ"
        );
        assert_eq!(route(&rec("en", "Hello", 0.61), Lang::Vi), Err("no_speech".into()));
        assert_eq!(route(&rec("en", "", 0.0), Lang::Vi), Err("no_speech".into()));
        assert_eq!(route(&rec("en", " \n", 0.0), Lang::Vi), Err("no_speech".into()));
        assert_eq!(route(&rec("vi", "Xin chào", 0.0), Lang::Vi), Err("same_lang".into()));
        assert_eq!(
            route(&rec("fr", "Bonjour", 0.0), Lang::Vi),
            Err("lang_ngoai_tap:fr".into())
        );
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
        let u = &utterance_latencies(&[utt("a", 5_000)], &segments)[0];
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
        let all = utterance_latencies(&[utt("a", 5_000), utt("b", 30_000)], &segments);
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
    fn same_lang_utterance_is_measured_but_has_no_translation() {
        let segments = [skipped(5_030, 5_400.0, "same_lang")];
        let u = &utterance_latencies(&[utt("a", 5_000)], &segments)[0];
        assert_eq!((u.shown_latency_ms, u.first_latency_ms), (Some(400.0), Some(400.0)));
        assert!(!u.translated);
    }

    #[test]
    fn summary_counts_dropped_skipped_and_truncated_separately() {
        let cut = |mut s: SegmentRecord| {
            s.finish_reason = Some("length".into());
            s
        };
        let mut segments = vec![
            translated(900, 1_600.0, 1_900.0, 2_500.0), // dừng sớm hơn mốc thật 100 ms
            cut(translated(5_020, 5_500.0, 5_800.0, 8_000.0)),
            skipped(9_010, 9_400.0, "no_speech"),
            skipped(20_000, 20_000.0, "too_short"), // không ghép với câu nào
            skipped(30_000, 30_500.0, "same_lang"),
            cut(translated(40_000, 40_400.0, 40_600.0, 41_000.0)), // không ghép với câu nào
        ];
        // (asr_ms, lid_ms) của từng đoạn; đoạn too_short chưa từng vào asr-worker nên là 0.
        let steps = [
            (100.0, 10.0),
            (300.0, 30.0),
            (200.0, 20.0),
            (0.0, 0.0),
            (50.0, 5.0),
            (250.0, 25.0),
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
            utt("e", 30_000),
        ];
        let utterances = utterance_latencies(&truth, &segments);
        let s = build_summary(&utterances, &segments);
        let get = |k: &str| s[k];
        assert_eq!(get("utterances"), 5.0);
        assert_eq!(get("matched"), 4.0); // d không có đoạn nào
        assert_eq!(get("unmatched"), 1.0);
        assert_eq!(get("measured"), 3.0); // a, b, e; c bị bỏ
        // Câu ghép được mà không có bản dịch: c bị bỏ, e cùng ngôn ngữ đích. Câu không ghép được (d) tính riêng.
        assert_eq!(get("no_translation"), 2.0);
        // Lệch giữa mốc dừng của đoạn và mốc thật: a -100, b +20, c +10, e 0.
        assert_eq!(get("end_offset_max_abs_ms"), 100.0);
        assert_eq!(get("segments"), 6.0);
        assert_eq!(get("segments_translated"), 3.0);
        assert_eq!(get("segments_dropped"), 2.0);
        assert_eq!(get("skipped_no_speech"), 1.0);
        assert_eq!(get("skipped_too_short"), 1.0);
        assert_eq!(get("skipped_same_lang"), 1.0);
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
        assert_eq!(get("asr_p50_ms"), 200.0);
        assert_eq!(get("lid_p50_ms"), 20.0);
    }

    #[test]
    fn lang_outside_the_set_counts_under_one_key() {
        let segments = [
            skipped(1_000, 1_100.0, "lang_ngoai_tap:fr"),
            skipped(2_000, 2_100.0, "lang_ngoai_tap:de"),
        ];
        let utterances = utterance_latencies(&[utt("a", 1_000), utt("b", 2_000)], &segments);
        assert_eq!(build_summary(&utterances, &segments)["skipped_lang_ngoai_tap"], 2.0);
    }
}
