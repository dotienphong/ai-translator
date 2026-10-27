//! Lệnh `speaker-eval` (spec 2026-10-26-phan-biet-nguoi-noi §12, A-spk1, A-spk2): cắt đoạn đúng như app (`SileroVad` +
//! `Segmenter`), nhúng phần tiếng nói của từng đoạn, phân cụm trực tuyến; ghi mỗi đoạn một dòng JSON để `score_spk.py` chấm
//! với RTTM. `--embeddings-out` lưu đoạn và nhúng để chạy lại phân cụm với ngưỡng khác (`--embeddings-in`, không cần model).
//! Khi hai giọng được gộp, nhãn của các đoạn trước cũng đổi, như giao diện sẽ làm.
//! `--worker` chạy nhận giọng bằng tiến trình `speaker-worker` thật (giao thức, B', A2 4 s đầu) qua `pipeline::speaker_client`,
//! như app (kế hoạch 02b): kết quả, thời gian khứ hồi, RSS và CPU là của worker.

use std::io::{BufWriter, Write};
use std::ops::Range;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, ensure};
use clap::Args;
use pipeline::config::PipelineConfig;
use pipeline::segmenter::{FRAME_SAMPLES, Segmenter, SegmenterConfig};
use pipeline::speaker::SpeakerUpdate;
use pipeline::speaker_client::{self, SpeakerLaunch};
use pipeline::vad::SileroVad;
use serde::{Deserialize, Serialize};
use speaker_protocol::{MAX_EMBED_SAMPLES, SegmentAudio, Source, pcm_from_f32};
use speaker_worker::cluster::{OnlineClusterer, SpeakerConfig};
use speaker_worker::embed::{Embedder, MIN_SAMPLES};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use crate::stats::percentile;

#[derive(Args)]
pub struct SpeakerEvalArgs {
    /// WAV 16 kHz (gộp về mono). Không cần khi có `--embeddings-in` (hai cờ này không dùng cùng nhau).
    #[arg(long, conflicts_with = "embeddings_in")]
    wav: Option<PathBuf>,
    /// Model VAD Silero (file ONNX). Cần khi có `--wav`.
    #[arg(long)]
    vad_model: Option<PathBuf>,
    /// Model nhúng giọng (file ONNX ERes2Net do `prepare_model.py` tạo). Cần khi có `--wav`.
    #[arg(long)]
    speaker_model: Option<PathBuf>,
    /// Ngưỡng im lặng chốt đoạn (mặc định của app: 50 ms).
    #[arg(long, default_value_t = 50)]
    end_silence_ms: u64,
    /// Lưu các đoạn và nhúng ra file JSON (`<tên>.emb.json`) để chạy lại phân cụm bằng `--embeddings-in`.
    #[arg(long)]
    embeddings_out: Option<PathBuf>,
    /// Đọc đoạn và nhúng từ file JSON do `--embeddings-out` tạo, bỏ qua VAD và model nhúng (không cần `--wav`). Thời gian
    /// nhúng trong tóm tắt khi đó là số đã lưu trong cache.
    #[arg(long)]
    embeddings_in: Option<PathBuf>,
    /// File JSONL kết quả, mỗi đoạn một dòng (`start_ms`, `end_ms`, `voice`, `confidence`, `embed_ms`).
    #[arg(long)]
    out: PathBuf,
    /// Cosine tối thiểu để vào một giọng đã có (mặc định của app: `SpeakerConfig::default()`).
    #[arg(long)]
    theta: Option<f32>,
    /// Cosine giữa hai tâm giọng để tự gộp (mặc định của app: `SpeakerConfig::default()`); giá trị lớn hơn 1, ví dụ 1,1, là
    /// không bao giờ gộp.
    #[arg(long)]
    merge_theta: Option<f32>,
    /// Thời lượng tiếng nói tối thiểu (ms) của mỗi giọng để được xét gộp (mặc định của app).
    #[arg(long)]
    merge_min_ms: Option<u64>,
    /// Thời lượng tối thiểu (ms) của đoạn để được mở giọng mới (mặc định của app).
    #[arg(long)]
    min_new_ms: Option<u64>,
    /// Nhúng theo cửa sổ dài chừng này giây rồi lấy trung bình (`Embedder::embed_windowed`; Task 9b, cách A). Không có cờ thì
    /// nhúng cả đoạn như app.
    #[arg(long, conflicts_with = "embeddings_in")]
    window_s: Option<f64>,
    /// Chỉ nhúng tối đa chừng này giây tiếng nói của mỗi đoạn (Task 9b, cách A2); thời lượng dùng cho phân cụm vẫn là thời
    /// lượng thật của đoạn. Không có cờ thì nhúng cả đoạn như app.
    #[arg(long, conflicts_with = "embeddings_in")]
    max_embed_s: Option<f64>,
    /// Phần nào của đoạn dài được nhúng khi có `--max-embed-s`: đầu đoạn hay giữa đoạn. `conflicts_with` cần riêng: clap bỏ qua
    /// `requires` khi cờ được đòi (`--max-embed-s`) xung đột với một cờ đang có (`--embeddings-in`).
    #[arg(
        long,
        value_enum,
        default_value_t = EmbedFrom::Head,
        requires = "max_embed_s",
        conflicts_with = "embeddings_in"
    )]
    embed_from: EmbedFrom,
    /// Nhận giọng bằng tiến trình `speaker-worker` thật (đường dẫn binary) thay vì trong tiến trình này: mỗi đoạn gửi tối đa 4 s
    /// đầu phần tiếng nói kèm thời lượng thật, như app. Cần `--wav`, `--vad-model`, `--speaker-model`.
    /// `embed_from` phải có trong danh sách: clap bỏ qua `requires = "max_embed_s"` của nó khi `--max-embed-s` xung đột với cờ
    /// đang có (như ghi chú ở `embed_from`); giá trị mặc định của `--embed-from` không tính là có cờ.
    #[arg(long, conflicts_with_all = ["embeddings_in", "embeddings_out", "window_s", "max_embed_s", "embed_from"])]
    worker: Option<PathBuf>,
}

/// Phần của đoạn dài được nhúng khi giới hạn độ dài nhúng (`--max-embed-s`).
#[derive(Clone, Copy, Debug, PartialEq, clap::ValueEnum)]
enum EmbedFrom {
    /// Các mẫu đầu đoạn.
    Head,
    /// Các mẫu ở giữa đoạn (bỏ đều hai đầu).
    Middle,
}

/// Số giây của cờ `flag` (tên cờ, cho thông báo lỗi) đổi sang số mẫu 16 kHz, làm tròn. Lỗi khi không hữu hạn hay ngoài
/// khoảng `[min, max]` mẫu (`max` = `usize::MAX` là không giới hạn trên). Dùng chung cho `speaker-eval` và `embed-probe`.
pub(crate) fn seconds_to_samples(seconds: f64, flag: &str, min: usize, max: usize) -> Result<usize> {
    let to_s = |n: usize| n as f64 / 16_000.0;
    let n = seconds * 16_000.0;
    let in_range = seconds.is_finite() && n >= min as f64 && (max == usize::MAX || n <= max as f64);
    if max == usize::MAX {
        ensure!(in_range, "{flag} phải ≥ {} s, nhận {seconds}", to_s(min));
    } else {
        ensure!(
            in_range,
            "{flag} phải trong khoảng {} đến {} s, nhận {seconds}",
            to_s(min),
            to_s(max)
        );
    }
    Ok(n.round() as usize)
}

/// Cửa sổ hay giới hạn độ dài nhúng: không ngắn hơn `MIN_SAMPLES` của `Embedder`, vì phần ngắn hơn không nhúng được.
fn seconds_to_embed_samples(seconds: Option<f64>, flag: &str) -> Result<Option<usize>> {
    seconds
        .map(|s| seconds_to_samples(s, flag, MIN_SAMPLES, usize::MAX))
        .transpose()
}

fn max_embed_samples(seconds: Option<f64>) -> Result<Option<usize>> {
    seconds_to_embed_samples(seconds, "--max-embed-s")
}

fn window_samples(seconds: Option<f64>) -> Result<Option<usize>> {
    seconds_to_embed_samples(seconds, "--window-s")
}

/// Khoảng mẫu (tính trong đoạn dài `len` mẫu) được nhúng: cả đoạn khi không giới hạn hay đoạn không dài hơn `max`; không thì
/// `max` mẫu đầu (`Head`) hay `max` mẫu ở giữa (`Middle`, phần dư lẻ thì đầu bỏ ít hơn cuối một mẫu).
fn embed_span(len: usize, max: Option<usize>, from: EmbedFrom) -> Range<usize> {
    match max {
        Some(max) if len > max => {
            let start = match from {
                EmbedFrom::Head => 0,
                EmbedFrom::Middle => (len - max) / 2,
            };
            start..start + max
        }
        _ => 0..len,
    }
}

#[derive(Serialize, Deserialize)]
struct CachedSegment {
    start_ms: u64,
    end_ms: u64,
    embedding: Option<Vec<f32>>,
    embed_ms: f64,
}

/// Thời lượng đoạn; đoạn có `end_ms` nhỏ hơn `start_ms` (không có trong dữ liệu đã qua `check_segments`) tính là 0.
fn duration_ms(s: &CachedSegment) -> u64 {
    s.end_ms.saturating_sub(s.start_ms)
}

/// Kiểm cache: mọi đoạn có `end_ms >= start_ms`. Thông báo lỗi nêu số thứ tự đoạn (từ 1).
fn check_segments(segments: &[CachedSegment]) -> Result<()> {
    for (i, s) in segments.iter().enumerate() {
        ensure!(
            s.end_ms >= s.start_ms,
            "đoạn thứ {} có end_ms {} nhỏ hơn start_ms {}",
            i + 1,
            s.end_ms,
            s.start_ms
        );
    }
    Ok(())
}

fn read_cache(path: &Path) -> Result<Vec<CachedSegment>> {
    let file = std::fs::File::open(path).with_context(|| format!("không mở được cache nhúng {}", path.display()))?;
    let segments: Vec<CachedSegment> = serde_json::from_reader(std::io::BufReader::new(file))
        .with_context(|| format!("không đọc được cache nhúng (JSON sai) {}", path.display()))?;
    check_segments(&segments).with_context(|| format!("cache nhúng {} không hợp lệ", path.display()))?;
    Ok(segments)
}

/// Phân cụm trực tuyến các đoạn theo thứ tự và đổi nhãn các đoạn trước khi hai giọng được gộp (như giao diện sẽ làm).
/// Trả nhãn và độ tin của từng đoạn, cùng số giọng còn sống.
fn label_segments(cfg: SpeakerConfig, segments: &[CachedSegment]) -> (Vec<(Option<u32>, f32)>, usize) {
    let mut clusterer = OnlineClusterer::new(cfg);
    let mut voices: Vec<(Option<u32>, f32)> = Vec::with_capacity(segments.len());
    for s in segments {
        let a = clusterer.assign(duration_ms(s), s.embedding.as_deref());
        for &(from, into) in &a.merged {
            for (v, _) in voices.iter_mut() {
                if *v == Some(from) {
                    *v = Some(into);
                }
            }
        }
        voices.push((a.voice, a.confidence));
    }
    (voices, clusterer.voice_count())
}

/// Ghi qua `BufWriter` rồi `flush` tường minh. `BufWriter` bỏ qua lỗi ghi ở lần flush khi `drop`, nên nếu để nó tự flush thì lỗi
/// ghi (ca thật là đĩa đầy, ENOSPC) làm file bị cắt mà lệnh vẫn thoát mã 0. Lỗi ở bất cứ bước ghi nào cũng mang tên file.
/// `ulimit -f` không phải ca này: trên macOS, vượt giới hạn làm hệ điều hành giết tiến trình bằng SIGXFSZ (mã thoát 153, file
/// còn nguyên phần đã ghi) chứ không trả lỗi ghi về cho chương trình.
fn write_through<W: Write>(inner: W, path: &Path, body: impl FnOnce(&mut BufWriter<W>) -> Result<()>) -> Result<()> {
    let mut out = BufWriter::new(inner);
    body(&mut out).with_context(|| format!("không ghi được {}", path.display()))?;
    out.flush()
        .with_context(|| format!("không ghi được {}", path.display()))
}

/// Tạo file `path` (`what` mô tả file trong thông báo lỗi tạo) rồi ghi bằng `write_through`.
fn write_file(path: &Path, what: &str, body: impl FnOnce(&mut BufWriter<std::fs::File>) -> Result<()>) -> Result<()> {
    let file = std::fs::File::create(path).with_context(|| format!("không tạo được {what}{}", path.display()))?;
    write_through(file, path, body)
}

/// Ngưỡng của lượt chạy: mặc định của app, đè bằng các cờ.
fn speaker_config(args: &SpeakerEvalArgs) -> SpeakerConfig {
    let mut cfg = SpeakerConfig::default();
    if let Some(v) = args.theta {
        cfg.theta = v;
    }
    if let Some(v) = args.merge_theta {
        cfg.merge_theta = v;
    }
    if let Some(v) = args.merge_min_ms {
        cfg.merge_min_ms = v;
    }
    if let Some(v) = args.min_new_ms {
        cfg.min_new_ms = v;
    }
    cfg
}

pub fn run(args: SpeakerEvalArgs) -> Result<()> {
    if let Some(worker) = &args.worker {
        return worker_eval(&args, worker);
    }
    let segments: Vec<CachedSegment> = match &args.embeddings_in {
        Some(p) => read_cache(p)?,
        None => embed_all(&args)?,
    };
    if let Some(p) = &args.embeddings_out {
        write_file(p, "cache nhúng ", |out| Ok(serde_json::to_writer(out, &segments)?))?;
    }
    let cfg = speaker_config(&args);
    let (voices, voice_count) = label_segments(cfg, &segments);
    write_file(&args.out, "", |out| {
        for (s, (voice, confidence)) in segments.iter().zip(&voices) {
            writeln!(
                out,
                "{}",
                serde_json::json!({
                    "start_ms": s.start_ms, "end_ms": s.end_ms, "voice": voice,
                    "confidence": confidence, "embed_ms": s.embed_ms,
                })
            )?;
        }
        Ok(())
    })?;
    let embedded: Vec<&CachedSegment> = segments.iter().filter(|s| s.embedding.is_some()).collect();
    let ms: Vec<f32> = embedded.iter().map(|s| s.embed_ms as f32).collect();
    let speech_ms: u64 = embedded.iter().map(|s| duration_ms(s)).sum();
    let total: f64 = embedded.iter().map(|s| s.embed_ms).sum();
    println!(
        "{} đoạn, {} có nhúng, {} giọng; nhúng p50 {:.1} ms, p90 {:.1} ms; thời gian nhúng / thời lượng tiếng nói của các đoạn có nhúng {:.1}%{}",
        segments.len(),
        embedded.len(),
        voice_count,
        percentile(&ms, 50.0).unwrap_or(0.0),
        percentile(&ms, 90.0).unwrap_or(0.0),
        if speech_ms > 0 {
            total / speech_ms as f64 * 100.0
        } else {
            0.0
        },
        if args.embeddings_in.is_some() {
            " (thời gian nhúng đọc từ cache)"
        } else {
            ""
        },
    );
    Ok(())
}

/// Mẫu của cả bản ghi và ranh giới tiếng nói `(start_ms, end_ms)` của từng đoạn.
type Cut = (Vec<f32>, Vec<(u64, u64)>);

/// Đọc WAV và cắt đoạn đúng như app (`SileroVad` + `Segmenter`). Trả mẫu và ranh giới tiếng nói (ms) của từng đoạn.
fn cut(args: &SpeakerEvalArgs) -> Result<Cut> {
    let wav = args.wav.as_ref().context("thiếu --wav")?;
    let (samples, rate) = crate::wavio::read_wav_mono(wav)?;
    ensure!(rate == 16_000, "{}: cần WAV 16 kHz, nhận {rate} Hz", wav.display());
    let mut vad = SileroVad::load(args.vad_model.as_ref().context("thiếu --vad-model")?)?;
    let config = PipelineConfig::default();
    let mut segmenter = Segmenter::new(SegmenterConfig {
        end_silence_ms: args.end_silence_ms,
        ..config.segmenter.clone()
    });
    let mut bounds = Vec::new();
    for frame in samples.as_chunks::<FRAME_SAMPLES>().0 {
        let p = vad.prob(frame)?;
        bounds.extend(segmenter.push(frame, p).into_iter().map(|s| (s.start_ms, s.end_ms)));
    }
    bounds.extend(segmenter.flush().map(|s| (s.start_ms, s.end_ms)));
    Ok((samples, bounds))
}

fn embed_all(args: &SpeakerEvalArgs) -> Result<Vec<CachedSegment>> {
    let window = window_samples(args.window_s)?;
    let max_embed = max_embed_samples(args.max_embed_s)?;
    let (samples, bounds) = cut(args)?;
    let embedder = Embedder::load(args.speaker_model.as_ref().context("thiếu --speaker-model")?)?;
    let min_ms = SpeakerConfig::default().min_embed_ms;
    bounds
        .into_iter()
        .map(|(start_ms, end_ms)| {
            if end_ms.saturating_sub(start_ms) < min_ms {
                return Ok(CachedSegment {
                    start_ms,
                    end_ms,
                    embedding: None,
                    embed_ms: 0.0,
                });
            }
            let a = (start_ms * 16) as usize;
            let b = ((end_ms * 16) as usize).min(samples.len());
            let speech = &samples[a..b];
            let speech = &speech[embed_span(speech.len(), max_embed, args.embed_from)];
            let t0 = Instant::now();
            let e = match window {
                Some(w) => embedder.embed_windowed(speech, w)?,
                None => embedder.embed(speech)?,
            };
            Ok(CachedSegment {
                start_ms,
                end_ms,
                embedding: Some(e),
                embed_ms: t0.elapsed().as_secs_f64() * 1000.0,
            })
        })
        .collect()
}

/// Một đoạn qua worker: ranh giới, nhãn, độ tin, thời gian khứ hồi (gửi `Segment` tới lúc nhận `Assign`, gồm nhúng).
struct WorkerRow {
    start_ms: u64,
    end_ms: u64,
    voice: Option<u32>,
    confidence: f32,
    round_ms: f64,
}

/// Hai giọng được gộp: nhãn của các đoạn trước đổi theo.
fn relabel(rows: &mut [WorkerRow], from: u32, into: u32) {
    for r in rows.iter_mut().filter(|r| r.voice == Some(from)) {
        r.voice = Some(into);
    }
}

/// RSS đỉnh (MB, 10^6 byte) và CPU (ms) của một tiến trình từ lúc bắt đầu tới lúc dừng đo, lấy mẫu mỗi 100 ms bằng `sysinfo`
/// (macOS, Windows).
struct WorkerUsage {
    stop: Arc<AtomicBool>,
    thread: std::thread::JoinHandle<(f64, u64)>,
}

impl WorkerUsage {
    fn start(pid: u32) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let thread = std::thread::spawn(move || {
            let (mut sys, pid) = (System::new(), Pid::from_u32(pid));
            let kind = ProcessRefreshKind::nothing().with_memory().with_cpu();
            let (mut peak, mut first, mut last) = (0.0f64, None, 0u64);
            loop {
                sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[pid]), false, kind);
                if let Some(p) = sys.process(pid) {
                    peak = peak.max(p.memory() as f64 / 1e6);
                    last = p.accumulated_cpu_time();
                    first.get_or_insert(last);
                }
                if flag.load(Ordering::SeqCst) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            (peak, last.saturating_sub(first.unwrap_or(last)))
        });
        Self { stop, thread }
    }

    fn stop(self) -> (f64, u64) {
        self.stop.store(true, Ordering::SeqCst);
        self.thread.join().unwrap_or((0.0, 0))
    }
}

/// Chế độ `--worker`: mỗi đoạn gửi tuần tự (chờ `Assign` rồi mới gửi đoạn sau, nên không bao giờ quá tải), ghi JSONL như chế độ
/// trong tiến trình (`embed_ms` là thời gian khứ hồi).
fn worker_eval(args: &SpeakerEvalArgs, worker: &Path) -> Result<()> {
    let (samples, bounds) = cut(args)?;
    let model = args.speaker_model.as_ref().context("thiếu --speaker-model")?;
    let log = args.out.with_extension("speaker-worker.log");
    // `SpeakerLaunch::new` đổi đường dẫn tương đối (như `target/release/speaker-worker`) sang tuyệt đối: worker chạy trong thư mục
    // của binary (file 02 Task 13).
    let mut launch = SpeakerLaunch::new(worker, model, &log, speaker_config(args));
    launch.overload_after = Duration::from_secs(3_600);
    let (link, handle) = speaker_client::start(launch, Box::new(|_| Ok(())));
    ensure!(
        handle.wait_ready(Duration::from_secs(60)),
        "speaker-worker không sẵn sàng: {:?}",
        handle.disabled()
    );
    let usage = WorkerUsage::start(handle.pid().context("không có pid của speaker-worker")?);
    let mut rows: Vec<WorkerRow> = Vec::with_capacity(bounds.len());
    for (i, &(start_ms, end_ms)) in bounds.iter().enumerate() {
        let a = ((start_ms * 16) as usize).min(samples.len());
        let b = ((end_ms * 16) as usize).min(samples.len());
        let speech = &samples[a..b];
        let t0 = Instant::now();
        link.segments
            .send(SegmentAudio {
                segment_id: i as u64,
                start_ms,
                end_ms,
                source: Source::System,
                pcm: pcm_from_f32(&speech[..speech.len().min(MAX_EMBED_SAMPLES)]),
            })
            .context("speaker-worker đã tắt")?;
        loop {
            match link
                .updates
                .recv_timeout(Duration::from_secs(30))
                .context("speaker-worker không trả lời")?
            {
                SpeakerUpdate::Assign {
                    segment_id,
                    voice,
                    confidence,
                } if segment_id == i as u64 => {
                    rows.push(WorkerRow {
                        start_ms,
                        end_ms,
                        voice,
                        confidence,
                        round_ms: t0.elapsed().as_secs_f64() * 1000.0,
                    });
                    break;
                }
                SpeakerUpdate::Merged { from, into } => relabel(&mut rows, from, into),
                _ => {}
            }
        }
    }
    // `Merged` tới sau `Assign` của đoạn cuối: áp nốt (worker gửi chúng ngay sau `Assign`; 200 ms không có gì thì thôi).
    while let Ok(update) = link.updates.recv_timeout(Duration::from_millis(200)) {
        if let SpeakerUpdate::Merged { from, into } = update {
            relabel(&mut rows, from, into);
        }
    }
    let (peak_mb, cpu_ms) = usage.stop();
    // Worker chết giữa lượt thì client chạy lại và cộng khoảng bù vào mã giọng: kết quả không so được với mốc, nên báo lỗi
    // thay vì ghi số lệch.
    ensure!(
        handle.starts() == 1 && handle.disabled().is_none(),
        "speaker-worker chạy lại hay tắt giữa lượt (chạy {} lần, {:?}): kết quả không dùng được",
        handle.starts(),
        handle.disabled()
    );
    drop(link);
    write_file(&args.out, "", |out| {
        for r in &rows {
            writeln!(
                out,
                "{}",
                serde_json::json!({
                    "start_ms": r.start_ms, "end_ms": r.end_ms, "voice": r.voice,
                    "confidence": r.confidence, "embed_ms": r.round_ms,
                })
            )?;
        }
        Ok(())
    })?;
    let min_ms = speaker_config(args).min_embed_ms;
    let embedded: Vec<&WorkerRow> = rows.iter().filter(|r| r.end_ms - r.start_ms >= min_ms).collect();
    let ms: Vec<f32> = embedded.iter().map(|r| r.round_ms as f32).collect();
    let speech_ms: u64 = embedded.iter().map(|r| r.end_ms - r.start_ms).sum();
    let mut voices: Vec<u32> = rows.iter().filter_map(|r| r.voice).collect();
    voices.sort_unstable();
    voices.dedup();
    println!(
        "{} đoạn, {} có nhúng, {} giọng; khứ hồi p50 {:.1} ms, p90 {:.1} ms; xong ≤ 230 ms: {}/{}; speaker-worker RSS đỉnh {:.1} MB, CPU {:.2}% một lõi so với thời lượng tiếng nói của các đoạn có nhúng",
        rows.len(),
        embedded.len(),
        voices.len(),
        percentile(&ms, 50.0).unwrap_or(0.0),
        percentile(&ms, 90.0).unwrap_or(0.0),
        ms.iter().filter(|&&m| m <= 230.0).count(),
        ms.len(),
        peak_mb,
        if speech_ms > 0 {
            cpu_ms as f64 / speech_ms as f64 * 100.0
        } else {
            0.0
        },
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use speaker_worker::embed::MAX_SAMPLES;

    /// Nơi ghi hỏng như đĩa đầy (ENOSPC): `write` lỗi khi tổng byte ghi vượt `limit`.
    struct FailAfter {
        limit: usize,
        written: usize,
    }

    impl Write for FailAfter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            if self.written + buf.len() > self.limit {
                return Err(std::io::Error::other("hết chỗ ghi"));
            }
            self.written += buf.len();
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn write_through_reports_an_error_that_only_shows_at_the_final_flush() {
        // Ít byte nên `BufWriter` giữ hết trong bộ đệm: `writeln!` đều thành công, lỗi chỉ lộ ra ở lần flush cuối.
        // Bản cũ để `drop` nuốt lỗi này nên file bị cắt mà lệnh vẫn thoát mã 0.
        let path = Path::new("thu-muc/ra.jsonl");
        let err = write_through(FailAfter { limit: 0, written: 0 }, path, |o| {
            writeln!(o, "{{}}")?;
            Ok(())
        })
        .unwrap_err();
        let text = format!("{err:#}");
        assert!(text.contains("không ghi được thu-muc/ra.jsonl"), "{text}");
        assert!(text.contains("hết chỗ ghi"), "{text}");
    }

    #[test]
    fn write_through_names_the_file_when_a_write_fails_midway() {
        // Nhiều hơn bộ đệm (8 KiB) nên `writeln!` tự đẩy xuống nơi ghi và lỗi lộ ra giữa chừng.
        let path = Path::new("cache.emb.json");
        let err = write_through(FailAfter { limit: 10, written: 0 }, path, |o| {
            for _ in 0..100 {
                writeln!(o, "{}", "x".repeat(1000))?;
            }
            Ok(())
        })
        .unwrap_err();
        let text = format!("{err:#}");
        assert!(text.contains("không ghi được cache.emb.json"), "{text}");
        assert!(text.contains("hết chỗ ghi"), "{text}");
    }

    #[test]
    fn write_through_writes_everything_and_flushes_on_success() {
        let mut sink = Vec::new();
        write_through(&mut sink, Path::new("ra.jsonl"), |o| {
            writeln!(o, "một")?;
            writeln!(o, "hai")?;
            Ok(())
        })
        .unwrap();
        assert_eq!(String::from_utf8(sink).unwrap(), "một\nhai\n");
    }

    /// Đoạn dài `ms` mili giây, bắt đầu ở 0, có nhúng 3 chiều (`OnlineClusterer` không ép 192 chiều).
    fn seg(ms: u64, embedding: [f32; 3]) -> CachedSegment {
        CachedSegment {
            start_ms: 0,
            end_ms: ms,
            embedding: Some(embedding.to_vec()),
            embed_ms: 1.0,
        }
    }

    fn distinct_labels(labels: &[(Option<u32>, f32)]) -> usize {
        let mut v: Vec<_> = labels.iter().filter_map(|(v, _)| *v).collect();
        v.sort_unstable();
        v.dedup();
        v.len()
    }

    /// Tính tay: A = (1, 0, 0), D = (0,8; 0,6; 0), cùng độ dài 1, nên cosine(A, D) = 0,8.
    /// Đoạn 1 (3000 ms, A) mở giọng 1. Đoạn 2 (4000 ms, D): theta = 0,9 nên D (0,8 < 0,9) không vào giọng 1 mà mở giọng 2 (4000 ms
    /// ≥ min_new_ms 1500). Cả hai giọng có ≥ merge_min_ms 3000 (giọng 1 đúng 3000) và 0,8 ≥ merge_theta 0,7 nên gộp. Giọng 1 có ít
    /// thời lượng hơn (3000 < 4000) nên giọng 1 gộp vào giọng 2, không phải ngược lại. `OnlineClusterer` tự đổi nhãn của đoạn đang
    /// xét (đoạn 2 vốn đã là 2); nhãn 1 của đoạn 1 chỉ được đổi thành 2 nhờ vòng đổi nhãn trong `label_segments`.
    #[test]
    fn merge_relabels_the_earlier_segment_into_the_surviving_voice() {
        let cfg = SpeakerConfig {
            theta: 0.9,
            merge_theta: 0.7,
            merge_min_ms: 3000,
            ..SpeakerConfig::default()
        };
        let d = [0.8, 0.6, 0.0];
        let segs = [seg(3000, [1.0, 0.0, 0.0]), seg(4000, d)];

        let mut direct = OnlineClusterer::new(cfg.clone());
        assert_eq!(direct.assign(3000, segs[0].embedding.as_deref()).voice, Some(1));
        let second = direct.assign(4000, segs[1].embedding.as_deref());
        assert_eq!((second.voice, second.merged), (Some(2), vec![(1, 2)]));

        let (labels, alive) = label_segments(cfg, &segs);
        assert_eq!(labels, vec![(Some(2), 1.0), (Some(2), 1.0)]);
        assert_eq!(alive, 1);
    }

    /// Gộp dây chuyền, vector và thời lượng của `merges_chain_a_into_b_then_b_into_c` (crates/speaker-worker/src/cluster.rs):
    /// A = (1, 0, 0), B = (0,8; 0,6; 0), C = (0, 1, 0); theta 0,85; merge_theta 0,5; merge_min_ms 3000.
    /// Ba đoạn đầu (3000 ms A, 2000 ms B, 40 000 ms C) mở ba giọng 1, 2, 3 và chưa gộp. Đoạn thứ tư (28 000 ms B) vào giọng 2,
    /// kích hoạt gộp 1 vào 2 rồi 2 vào 3; đoạn thứ năm (2000 ms C) vào giọng 3. Nhãn của mọi đoạn trước phải đổi theo về 3.
    #[test]
    fn chain_merge_relabels_every_earlier_segment() {
        let cfg = SpeakerConfig {
            theta: 0.85,
            merge_theta: 0.5,
            merge_min_ms: 3000,
            ..SpeakerConfig::default()
        };
        let (a, b, c) = ([1.0, 0.0, 0.0], [0.8, 0.6, 0.0], [0.0, 1.0, 0.0]);
        let segs = [seg(3000, a), seg(2000, b), seg(40_000, c), seg(28_000, b), seg(2000, c)];

        let (before, alive) = label_segments(cfg.clone(), &segs[..3]);
        assert_eq!(
            before.iter().map(|l| l.0).collect::<Vec<_>>(),
            vec![Some(1), Some(2), Some(3)]
        );
        assert_eq!((alive, distinct_labels(&before)), (3, 3));

        let (labels, alive) = label_segments(cfg, &segs);
        assert!(labels.iter().all(|l| l.0 == Some(3)), "{labels:?}");
        assert_eq!(alive, 1);
        assert_eq!(distinct_labels(&labels), alive);
    }

    /// Đoạn 1 (300 ms, không nhúng) khi chưa có giọng nào thì không có nhãn; đoạn 2 (2000 ms) mở giọng 1; đoạn 3 (300 ms, không
    /// nhúng) sau một đoạn đã có giọng thì lấy giọng của đoạn trước (1) với độ tin 0, không mở giọng mới.
    #[test]
    fn short_or_missing_embeddings_take_the_previous_voice() {
        let none = || CachedSegment {
            start_ms: 0,
            end_ms: 300,
            embedding: None,
            embed_ms: 0.0,
        };
        let (labels, alive) = label_segments(SpeakerConfig::default(), &[none(), seg(2000, [1.0, 0.0, 0.0]), none()]);
        assert_eq!(labels, vec![(None, 0.0), (Some(1), 1.0), (Some(1), 0.0)]);
        assert_eq!(alive, 1);
    }

    #[derive(clap::Parser)]
    struct Cli {
        #[command(flatten)]
        args: SpeakerEvalArgs,
    }

    fn try_parse(extra: &[&str]) -> Result<SpeakerEvalArgs, clap::Error> {
        let base = ["speaker-eval", "--out", "ra.jsonl"];
        <Cli as clap::Parser>::try_parse_from(base.iter().chain(extra)).map(|c| c.args)
    }

    #[test]
    fn embed_from_conflicts_with_embeddings_in_and_requires_max_embed_s() {
        // Với cache nhúng, phần nhúng đã cố định: `--embed-from` không có tác dụng nên phải bị từ chối, không im lặng bỏ qua.
        let err = try_parse(&["--embeddings-in", "x.emb.json", "--embed-from", "middle"]).err();
        assert!(err.is_some(), "--embed-from cùng --embeddings-in phải lỗi");
        assert!(try_parse(&["--wav", "a.wav", "--embed-from", "middle"]).is_err());
        let args = try_parse(&["--wav", "a.wav", "--max-embed-s", "4", "--embed-from", "middle"]).unwrap();
        assert_eq!(args.embed_from, EmbedFrom::Middle);
        // Giá trị mặc định của `--embed-from` không tính là có cờ.
        assert_eq!(
            try_parse(&["--embeddings-in", "x.emb.json"]).unwrap().embed_from,
            EmbedFrom::Head
        );
    }

    #[test]
    fn seconds_to_samples_rounds_and_checks_the_range() {
        assert_eq!(seconds_to_samples(2.0, "--x", 0, usize::MAX).unwrap(), 32_000);
        assert_eq!(seconds_to_samples(120.00003, "--x", 0, usize::MAX).unwrap(), 1_920_000);
        assert_eq!(
            seconds_to_samples(0.5, "--x", MIN_SAMPLES, MAX_SAMPLES).unwrap(),
            MIN_SAMPLES
        );
        assert_eq!(
            seconds_to_samples(8.0, "--x", MIN_SAMPLES, MAX_SAMPLES).unwrap(),
            MAX_SAMPLES
        );
        for bad in [-1.0, 0.49, 8.01, f64::NAN, f64::INFINITY] {
            let err = seconds_to_samples(bad, "--seconds", MIN_SAMPLES, MAX_SAMPLES)
                .unwrap_err()
                .to_string();
            assert!(err.contains("--seconds"), "{bad}: {err}");
        }
        let err = seconds_to_samples(-1.0, "--start-s", 0, usize::MAX)
            .unwrap_err()
            .to_string();
        assert!(err.contains("--start-s") && err.contains("≥ 0"), "{err}");
    }

    #[test]
    fn embed_span_keeps_the_whole_segment_without_a_cap_or_when_it_is_short_enough() {
        assert_eq!(embed_span(50_000, None, EmbedFrom::Head), 0..50_000);
        assert_eq!(embed_span(50_000, None, EmbedFrom::Middle), 0..50_000);
        assert_eq!(embed_span(48_000, Some(48_000), EmbedFrom::Head), 0..48_000);
        assert_eq!(embed_span(30_000, Some(48_000), EmbedFrom::Middle), 0..30_000);
    }

    #[test]
    fn embed_span_takes_the_first_or_the_middle_samples_of_a_long_segment() {
        assert_eq!(embed_span(128_000, Some(48_000), EmbedFrom::Head), 0..48_000);
        // Giữa: bỏ (128 000 − 48 000) / 2 = 40 000 mẫu mỗi đầu.
        assert_eq!(embed_span(128_000, Some(48_000), EmbedFrom::Middle), 40_000..88_000);
        // Phần dư lẻ: đầu bỏ ít hơn cuối một mẫu.
        assert_eq!(embed_span(48_001, Some(48_000), EmbedFrom::Middle), 0..48_000);
        assert_eq!(embed_span(48_003, Some(48_000), EmbedFrom::Middle), 1..48_001);
    }

    #[test]
    fn max_embed_samples_rejects_a_cap_shorter_than_the_embedding_minimum() {
        assert_eq!(max_embed_samples(None).unwrap(), None);
        assert_eq!(max_embed_samples(Some(3.0)).unwrap(), Some(48_000));
        assert_eq!(max_embed_samples(Some(0.5)).unwrap(), Some(8_000));
        let err = max_embed_samples(Some(0.4)).unwrap_err().to_string();
        assert!(err.contains("--max-embed-s"), "{err}");
        assert!(max_embed_samples(Some(f64::NAN)).is_err());
    }

    #[test]
    fn window_samples_rejects_a_window_shorter_than_the_embedding_minimum() {
        assert_eq!(window_samples(None).unwrap(), None);
        assert_eq!(window_samples(Some(2.0)).unwrap(), Some(32_000));
        let err = window_samples(Some(0.25)).unwrap_err().to_string();
        assert!(err.contains("--window-s"), "{err}");
    }

    #[test]
    fn check_segments_names_the_bad_segment_number() {
        let good = |a, b| CachedSegment {
            start_ms: a,
            end_ms: b,
            embedding: None,
            embed_ms: 0.0,
        };
        assert!(check_segments(&[good(0, 100), good(100, 100), good(90, 300)]).is_ok());
        let err = check_segments(&[good(0, 100), good(500, 400)]).unwrap_err().to_string();
        assert!(err.contains("đoạn thứ 2"), "{err}");
        assert!(err.contains("500") && err.contains("400"), "{err}");
    }

    #[test]
    fn segment_with_reversed_bounds_has_zero_duration() {
        // Dữ liệu đã qua `check_segments` thì không xảy ra; `saturating_sub` chỉ để không panic khi gọi trực tiếp.
        let reversed = CachedSegment {
            start_ms: 500,
            end_ms: 400,
            embedding: Some(vec![1.0, 0.0, 0.0]),
            embed_ms: 1.0,
        };
        assert_eq!(duration_ms(&reversed), 0);
        let (labels, _) = label_segments(SpeakerConfig::default(), &[reversed]);
        assert_eq!(labels, vec![(None, 0.0)]);
    }

    #[test]
    fn worker_mode_needs_a_wav_and_conflicts_with_in_process_flags() {
        assert!(try_parse(&["--wav", "a.wav", "--worker", "w"]).is_ok());
        for extra in [
            &["--embeddings-out", "x.emb.json"][..],
            &["--window-s", "2"],
            &["--max-embed-s", "4"],
            &["--embed-from", "middle"],
            &["--max-embed-s", "4", "--embed-from", "middle"],
        ] {
            let mut args = vec!["--wav", "a.wav", "--worker", "w"];
            args.extend(extra);
            assert!(try_parse(&args).is_err(), "{extra:?}");
        }
        assert!(try_parse(&["--embeddings-in", "x.emb.json", "--worker", "w"]).is_err());
    }

    /// `Merged` của worker đổi nhãn các đoạn trước, như giao diện sẽ làm (và như `label_segments` của chế độ trong tiến trình).
    #[test]
    fn merges_relabel_earlier_rows() {
        let row = |voice| WorkerRow {
            start_ms: 0,
            end_ms: 1_000,
            voice,
            confidence: 1.0,
            round_ms: 1.0,
        };
        let mut rows = vec![row(Some(1)), row(Some(2)), row(None), row(Some(2))];
        relabel(&mut rows, 2, 1);
        assert_eq!(
            rows.iter().map(|r| r.voice).collect::<Vec<_>>(),
            [Some(1), Some(1), None, Some(1)]
        );
    }

    #[test]
    fn the_config_takes_the_threshold_flags() {
        let args = try_parse(&["--wav", "a.wav", "--theta", "0.4", "--merge-theta", "1.1"]).unwrap();
        let c = speaker_config(&args);
        assert_eq!((c.theta, c.merge_theta), (0.4, 1.1));
        assert_eq!(c.min_new_ms, SpeakerConfig::default().min_new_ms);
    }
}
