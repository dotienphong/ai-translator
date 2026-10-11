//! `latency-bench session` (spec 2026-10-10 §8 A1, §10.1; H7 của kế hoạch 00): chạy đúng `pipeline::Engine` của app trên
//! một session S6, phát WAV theo thời gian thực, với `asr-worker` và `llama-server` thật qua `SidecarManager` (dựng như
//! `src-tauri/src/sidecar/mod.rs` trên macOS: chế độ giải mã B bắt buộc, cấu hình mặc định), ghi mọi sự kiện kèm giờ thật
//! rồi tính các chỉ số của §10.1.
//!
//! Khác `latency` (S6 cũ): không mô phỏng luồng nào, mọi luật (cắt đoạn, ghép câu, hàng đợi, hủy, hậu xử lý) là code của
//! app. Đầu ra là JSON có `args`, `machine`, `usage`, `summary`, `run`, `utterances`, `events`. Log của hai tiến trình phụ
//! nằm cạnh file kết quả: `<tên>.asr-worker.log`, `<tên>.llama-server.log`.

use crate::latency::{ProcessUsage, machine_info, public_path, read_wav_16k_mono, repo_root, spawn_sampler};
use crate::session_metrics::{Recorded, Summary, Timed, UtteranceResult, evaluate, ms, ratio4, summarize};
use crate::stats::{Utterance, percentile};
use anyhow::{Context, Result, anyhow, bail};
use asr_protocol::{TranscribeRequest, TranscribeResult};
use pipeline::config::{AsrConfig, MtConfig, PipelineConfig, SupervisorConfig};
use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, FrameSource, Indicators, SampleSource, VadModel};
use pipeline::llama::{ChatRequest, StreamEnd};
use pipeline::prompt::Lang;
use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES};
use pipeline::subtitle::{Delta, Subtitle};
use pipeline::supervisor::{
    Asr, AsrFailure, AsrSpec, LlamaSpec, SidecarEvent, SidecarEvents, SidecarManager, SidecarSpec, SystemClock, Which,
};
use pipeline::translate::{Mt, MtError};
use pipeline::vad::SileroVad;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::io::Write;
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Phát lại chậm hơn lịch quá ngưỡng này (ms) thì số đo lệch cùng cỡ: báo cho người chạy (như `latency`).
const FEED_LAG_WARN_MS: f64 = 100.0;

/// Tham số của `latency-bench session` (H9). VAD là `models/silero_vad_v6.2.3.onnx` ở gốc repo, như app.
#[derive(clap::Args, Debug)]
pub struct SessionArgs {
    /// WAV 16 kHz mono của session (`bench/phase0/data/latency/<tên>.wav`).
    #[arg(long)]
    pub wav: PathBuf,
    /// Mốc thật của session (`<tên>.truth.json`).
    #[arg(long)]
    pub truth: PathBuf,
    #[arg(long)]
    pub asr_worker: PathBuf,
    #[arg(long)]
    pub asr_model: PathBuf,
    #[arg(long)]
    pub llama_server: PathBuf,
    #[arg(long)]
    pub mt_model: PathBuf,
    #[arg(long, value_delimiter = ',', default_value = "en,zh,ja,ko,vi")]
    pub languages: Vec<String>,
    #[arg(long, default_value = "vi")]
    pub target: String,
    /// Ngưỡng im lặng đóng đoạn (`vadEndSilenceMs`; mặc định của app là 50 ms).
    #[arg(long, default_value_t = 50)]
    pub end_silence_ms: u64,
    /// File JSON kết quả.
    #[arg(long)]
    pub out: PathBuf,
}

/// `EventSink` ghi mọi sự kiện kèm giờ thật (ms từ `origin`, làm tròn 0,1 ms). Mức âm lượng bỏ qua; lỗi làm phiên dừng ghi
/// riêng (`fatal`), vì không phải sự kiện của giao diện.
struct Recorder {
    origin: Instant,
    events: Mutex<Vec<Timed>>,
    fatal: Mutex<Vec<String>>,
}

impl Recorder {
    fn new(origin: Instant) -> Self {
        Self {
            origin,
            events: Mutex::new(Vec::new()),
            fatal: Mutex::new(Vec::new()),
        }
    }

    fn push(&self, ev: Recorded) {
        let mut events = self.events.lock().unwrap_or_else(|e| e.into_inner());
        // Lấy giờ khi đã giữ khóa, để thứ tự trong danh sách cũng là thứ tự thời gian.
        let t_ms = (self.origin.elapsed().as_micros() as f64 / 100.0).round() / 10.0;
        events.push(Timed { t_ms, ev });
    }

    fn take(&self) -> (Vec<Timed>, Vec<String>) {
        (
            std::mem::take(&mut *self.events.lock().unwrap_or_else(|e| e.into_inner())),
            std::mem::take(&mut *self.fatal.lock().unwrap_or_else(|e| e.into_inner())),
        )
    }
}

impl EventSink for Recorder {
    fn subtitle(&self, subtitle: &Subtitle) {
        self.push(Recorded::Subtitle(subtitle.clone()));
    }

    fn delta(&self, delta: &Delta) {
        self.push(Recorded::Delta(delta.clone()));
    }

    fn level(&self, _rms: f32) {}

    fn indicators(&self, indicators: &Indicators) {
        self.push(Recorded::Indicators(indicators.clone()));
    }

    fn fatal(&self, kind: Fatal, reason: &str) {
        self.fatal
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(format!("{kind:?}: {reason}"));
    }
}

/// Bọc `Asr` của app: cộng thời gian chép lời mà worker báo (`asr_ms` + `lid_ms`), cho mức bận (§10.1).
struct TimedAsr {
    inner: Box<dyn Asr>,
    busy_us: Arc<AtomicU64>,
}

impl Asr for TimedAsr {
    fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
        let result = self.inner.transcribe(req);
        if let Ok(r) = &result {
            self.busy_us
                .fetch_add(((r.asr_ms + r.lid_ms) * 1000.0) as u64, Ordering::Relaxed);
        }
        result
    }
}

/// Bọc `Mt` của app: cộng thời gian thật của mỗi lần stream bản dịch (kể cả lần làm nóng đầu phiên), cho mức bận (§10.1).
struct TimedMt {
    inner: Box<dyn Mt>,
    busy_us: Arc<AtomicU64>,
}

impl Mt for TimedMt {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        self.inner.count_tokens(text)
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        let started = Instant::now();
        let result = self.inner.stream(req, on_delta);
        self.busy_us
            .fetch_add(started.elapsed().as_micros() as u64, Ordering::Relaxed);
        result
    }
}

/// Phát `SampleSource` đúng thời gian thực: khung thứ k (32 ms) sẵn sàng lúc `origin + (k + 1) × 32 ms`, như khi thu
/// thật và như `latency`. Theo lịch tuyệt đối nên không trôi dần (ngủ một khoảng cố định sau mỗi khung thì trễ cộng dồn).
/// Ghi độ trễ lớn nhất so với lịch.
struct Paced {
    inner: SampleSource,
    origin: Instant,
    frames: u64,
    lag_max_us: Arc<AtomicU64>,
}

impl Paced {
    fn new(samples: Vec<f32>, origin: Instant, lag_max_us: Arc<AtomicU64>) -> Self {
        Self {
            inner: SampleSource::new(samples, FRAME_SAMPLES, Duration::ZERO),
            origin,
            frames: 0,
            lag_max_us,
        }
    }
}

impl FrameSource for Paced {
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
        let due = self.origin + Duration::from_millis((self.frames + 1) * FRAME_MS);
        if let Some(wait) = due.checked_duration_since(Instant::now()) {
            std::thread::sleep(wait);
        }
        let lag = Instant::now().saturating_duration_since(due).as_micros() as u64;
        self.lag_max_us.fetch_max(lag, Ordering::Relaxed);
        self.frames += 1;
        self.inner.read(out, timeout)
    }
}

/// Sự kiện của giám sát tiến trình phụ: thiết bị thật của `asr-worker`, số lần khởi động lại.
#[derive(Default)]
struct SidecarLog(Mutex<Vec<SidecarEvent>>);

impl SidecarEvents for SidecarLog {
    fn on_event(&self, event: &SidecarEvent) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).push(event.clone());
    }
}

impl SidecarLog {
    fn asr_backend(&self) -> String {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .find_map(|e| match e {
                SidecarEvent::Ready {
                    which: Which::Asr,
                    backend: Some(b),
                    ..
                } => Some(b.as_str().to_string()),
                _ => None,
            })
            .unwrap_or_default()
    }

    fn restarts(&self) -> usize {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .filter(|e| matches!(e, SidecarEvent::Restarting { .. }))
            .count()
    }
}

/// Đường dẫn tuyệt đối: tiến trình phụ chạy với thư mục làm việc là thư mục chứa binary của nó (`asr_client::command`,
/// `llama::command`), nên đường dẫn tương đối không dùng được.
fn absolute(path: &Path) -> PathBuf {
    std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Log của một tiến trình phụ, cạnh file kết quả: `x.json` thành `x.asr-worker.log`.
fn log_path(out: &Path, which: &str) -> PathBuf {
    absolute(out).with_extension(format!("{which}.log"))
}

/// Cách chạy hai tiến trình phụ, như `sidecar::prepare` của app trên macOS: một bản `asr-worker` cho cả GPU và CPU, chỉ
/// nhận chế độ giải mã B, `llama-server` không có tham số thêm, ngưỡng mặc định.
fn sidecar_spec(args: &SessionArgs) -> SidecarSpec {
    SidecarSpec {
        asr: AsrSpec {
            exe_gpu: Some(absolute(&args.asr_worker)),
            exe_cpu: absolute(&args.asr_worker),
            model: absolute(&args.asr_model),
            log: log_path(&args.out, "asr-worker"),
            first_run: false,
            require_shared: true,
            env: Vec::new(),
        },
        llama: LlamaSpec {
            exe: absolute(&args.llama_server),
            model: absolute(&args.mt_model),
            log: log_path(&args.out, "llama-server"),
            extra_args: Vec::new(),
            first_run: false,
            env: Vec::new(),
        },
        supervisor: SupervisorConfig::default(),
        asr_config: AsrConfig::default(),
        mt_config: MtConfig::default(),
    }
}

/// Pid của tiến trình đo và hai tiến trình phụ đang chạy (theo danh sách tiến trình phụ của `pipeline::process`).
fn sidecar_pids() -> HashMap<String, u32> {
    let mut pids = HashMap::from([("latency-bench".to_string(), std::process::id())]);
    for pid in pipeline::process::live() {
        let Some(entry) = pipeline::process::entry(pid) else {
            continue;
        };
        let name = entry
            .exe
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        for sidecar in ["asr-worker", "llama-server"] {
            if name.starts_with(sidecar) {
                pids.insert(sidecar.to_string(), pid);
            }
        }
    }
    pids
}

/// Dòng `asr-worker: backend=… flash_attn=… decode_mode=…` cuối cùng trong log của worker (lượt đo có bật flash attention
/// không, A5).
fn worker_flags(log: &Path) -> Option<String> {
    let text = std::fs::read_to_string(log).ok()?;
    let line = text.lines().rev().find(|l| l.contains("asr-worker: backend="))?;
    Some(line[line.find("asr-worker: backend=")?..].trim().to_string())
}

/// CPU cả máy, phần trăm, như S6 (`bench/phase0/latency/summarize.py`): tổng CPU trung bình của các tiến trình đo (mỗi
/// số là phần trăm của một lõi) chia số lõi logic.
fn machine_cpu_percent(usage: &HashMap<String, ProcessUsage>, logical_cores: usize) -> Option<f64> {
    (logical_cores > 0 && !usage.is_empty())
        .then(|| usage.values().map(|u| u.avg_cpu_percent).sum::<f64>() / logical_cores as f64)
}

/// Số câu truth không được `pieces_of` (`session_metrics`) gán phần nguồn nào (`UtteranceResult::units == 0`): một
/// đoạn VAD đã phủ qua ranh giới hai câu (hay gặp khi ngưỡng đóng đoạn lớn), câu trước mất hết phần và bị loại khỏi
/// mọi số đo mà không ai biết (rà soát chất lượng sau Task 1, A1).
fn count_utterances_without_pieces(utterances: &[UtteranceResult]) -> usize {
    utterances.iter().filter(|u| u.units == 0).count()
}

fn vad_model() -> PathBuf {
    repo_root()
        .unwrap_or_default()
        .join("models")
        .join("silero_vad_v6.2.3.onnx")
}

fn args_map(args: &SessionArgs, vad_model: &Path) -> BTreeMap<String, String> {
    BTreeMap::from([
        ("wav".to_string(), public_path(&args.wav)),
        ("truth".to_string(), public_path(&args.truth)),
        ("asr_worker".to_string(), public_path(&args.asr_worker)),
        ("asr_model".to_string(), public_path(&args.asr_model)),
        ("llama_server".to_string(), public_path(&args.llama_server)),
        ("mt_model".to_string(), public_path(&args.mt_model)),
        ("vad_model".to_string(), public_path(vad_model)),
        ("languages".to_string(), args.languages.join(",")),
        ("target".to_string(), args.target.clone()),
        ("end_silence_ms".to_string(), args.end_silence_ms.to_string()),
    ])
}

/// Số đo thêm của lượt chạy, ngoài các khóa của H7 (khóa `run` của file JSON).
#[derive(Debug, Default, Serialize)]
struct RunInfo {
    session_ms: f64,
    /// Tổng `asr_ms` + `lid_ms` của mọi lần chép lời, và tổng thời gian stream bản dịch: tử số của `busy_ratio`.
    asr_busy_ms: f64,
    mt_busy_ms: f64,
    /// p50 của thời gian chép lời một đoạn và dịch một câu (`SessionMetrics::asr_ms`, `mt_ms`).
    asr_p50_ms: Option<f64>,
    mt_p50_ms: Option<f64>,
    merges: usize,
    /// Số câu có A2, số đơn vị của các bản chép cuối, số đơn vị không bao giờ có chữ dịch.
    measured: usize,
    words: usize,
    words_untranslated: usize,
    /// Số câu truth bị loại khỏi mọi số đo vì không được gán phần nguồn nào (`count_utterances_without_pieces`).
    utterances_without_pieces: usize,
    /// Bộ đếm của engine (`pipeline::metrics::SessionMetrics`), theo lần xảy ra: đoạn bị luật lọc (không tiếng nói, ảo
    /// giác, lặp, câu đệm); đoạn bị bỏ ở bước nhận dạng (chờ quá `queue.asr_drop_after_ms` hoặc worker báo lỗi); đoạn
    /// cùng ngôn ngữ đích (không dịch); lần dịch xong; lần dịch lỗi; câu bị bỏ bước dịch (chờ quá
    /// `queue.mt_skip_after_ms`, chỉ hiện câu gốc — KHÔNG phải câu đổi trong lúc đang dịch, trường hợp đó được dịch lại).
    filtered: usize,
    dropped: usize,
    same_lang: usize,
    translated: usize,
    failed: usize,
    skipped: usize,
    feed_lag_max_ms: f64,
    sidecar_restarts: usize,
}

#[derive(Serialize)]
struct Report {
    args: BTreeMap<String, String>,
    machine: BTreeMap<String, String>,
    usage: HashMap<String, ProcessUsage>,
    summary: Summary,
    run: RunInfo,
    utterances: Vec<UtteranceResult>,
    events: Vec<Timed>,
}

pub fn run(args: SessionArgs) -> Result<()> {
    if let Some(dir) = args.out.parent().filter(|d| !d.as_os_str().is_empty()) {
        std::fs::create_dir_all(dir)?;
    }
    let target = Lang::from_code(&args.target).context("--target không hợp lệ")?;
    let truth: Vec<Utterance> = serde_json::from_reader(
        std::fs::File::open(&args.truth).with_context(|| format!("không mở được {}", args.truth.display()))?,
    )?;
    let samples = read_wav_16k_mono(&args.wav)?;
    let vad_path = vad_model();
    // Nạp VAD trước khi chạy tiến trình phụ, như `latency`: đường dẫn sai thì báo ngay, và việc nạp không chiếm giờ phát.
    let vad = SileroVad::load(&vad_path)?;
    // Bản release đặt `panic = "abort"`: hook này kill tiến trình phụ trước khi abort, như app.
    pipeline::process::install_panic_hook();
    let sidecars = Arc::new(SidecarLog::default());
    let manager = SidecarManager::new(sidecar_spec(&args), Arc::new(SystemClock::default()), sidecars.clone());
    manager
        .ensure_started()
        .map_err(|e| anyhow!("không chạy được tiến trình phụ: {e}"))?;
    manager.begin_session();
    let stop_sampler = Arc::new(AtomicBool::new(false));
    let sampler = spawn_sampler(sidecar_pids(), stop_sampler.clone());

    let mut pipeline = PipelineConfig::default();
    pipeline.segmenter.end_silence_ms = args.end_silence_ms;
    let config = EngineConfig {
        pipeline,
        languages: args.languages.clone(),
        target,
        translation_context: false,
        id_base: 0,
        glossary: Default::default(),
        // Cờ `--streaming` (Task 16 của kế hoạch 02) nối hai trường này.
        streaming_supported: false,
        streaming_enabled: false,
    };
    let asr_busy = Arc::new(AtomicU64::new(0));
    let mt_busy = Arc::new(AtomicU64::new(0));
    let lag_max = Arc::new(AtomicU64::new(0));
    let origin = Instant::now();
    let recorder = Arc::new(Recorder::new(origin));
    let engine = Engine::start(
        config,
        Box::new(Paced::new(samples, origin, lag_max.clone())),
        Box::new(move || Ok(Box::new(vad) as Box<dyn VadModel>)),
        Box::new(TimedAsr {
            inner: Box::new(manager.asr()),
            busy_us: asr_busy.clone(),
        }),
        Box::new(TimedMt {
            inner: Box::new(manager.mt()),
            busy_us: mt_busy.clone(),
        }),
        recorder.clone(),
    )?;
    let metrics = engine.join();
    let session_ms = origin.elapsed().as_secs_f64() * 1000.0;
    manager.end_session();
    stop_sampler.store(true, Ordering::Relaxed);
    let usage = sampler.join().map_err(|_| anyhow!("luồng đo tài nguyên panic"))?;
    // Tắt tường minh, không chỉ dựa vào `Drop for SidecarManager` (gọi `stop(false)`, chạy khi đây là bản sao `Arc`
    // cuối cùng — đúng hôm nay vì `engine.join()` đã join hết các luồng giữ `Arc` khác). Nếu sau này một luồng khác
    // còn giữ bản sao lúc này, `drop(manager)` sẽ không phải lần cuối, không tắt được tiến trình phụ, để sót
    // `llama-server` mồ côi. `idle=false`: lượt đo đã xong hẳn (không phải tạm rảnh chờ phiên sau như
    // `release_models`), đúng nhánh "app thoát" mà `Drop` vẫn dùng.
    manager.stop(false);
    drop(manager); // đã tắt ở dòng trên; chỉ còn nhả bản sao Arc cuối cùng

    let (events, fatal) = recorder.take();
    let utterances = evaluate(&truth, &events);
    let utterances_without_pieces = count_utterances_without_pieces(&utterances);
    let machine_map = machine_info();
    let cores = machine_map
        .get("logical_cores")
        .and_then(|c| c.parse().ok())
        .unwrap_or(0);
    let run = RunInfo {
        session_ms: ms(session_ms),
        asr_busy_ms: ms(asr_busy.load(Ordering::Relaxed) as f64 / 1000.0),
        mt_busy_ms: ms(mt_busy.load(Ordering::Relaxed) as f64 / 1000.0),
        asr_p50_ms: percentile(&metrics.asr_ms, 50.0).map(|v| ms(f64::from(v))),
        mt_p50_ms: percentile(&metrics.mt_ms, 50.0).map(|v| ms(f64::from(v))),
        merges: metrics.merges,
        measured: utterances.iter().filter(|u| u.a2_shown_ms.is_some()).count(),
        words: utterances.iter().map(|u| u.units).sum(),
        words_untranslated: utterances.iter().map(|u| u.units - u.word_lag_tentative_ms.len()).sum(),
        utterances_without_pieces,
        filtered: metrics.filtered,
        dropped: metrics.dropped,
        same_lang: metrics.same_lang,
        translated: metrics.translated,
        failed: metrics.failed,
        skipped: metrics.skipped,
        feed_lag_max_ms: ms(lag_max.load(Ordering::Relaxed) as f64 / 1000.0),
        sidecar_restarts: sidecars.restarts(),
    };
    let mut summary = summarize(&truth, &events);
    summary.segments = Some(metrics.segments as f64);
    summary.busy_ratio = (session_ms > 0.0).then(|| ratio4((run.asr_busy_ms + run.mt_busy_ms) / session_ms));
    summary.cpu_percent = machine_cpu_percent(&usage, cores).map(ms);
    // Chế độ thường không chép từng phần; kế hoạch 02 điền ba khóa này khi bật chế độ dịch trong lúc nói.
    summary.partials = Some(0.0);
    let mut machine: BTreeMap<String, String> = machine_map.into_iter().collect();
    machine.insert("asr_backend".into(), sidecars.asr_backend());
    machine.insert(
        "asr_worker".into(),
        worker_flags(&log_path(&args.out, "asr-worker")).unwrap_or_default(),
    );
    let report = Report {
        args: args_map(&args, &vad_path),
        machine,
        usage,
        summary,
        run,
        utterances,
        events,
    };
    // Ghi file trước khi báo lỗi: lượt đo hỏng vẫn còn sự kiện để xem.
    let file = std::fs::File::create(&args.out).with_context(|| format!("không tạo được {}", args.out.display()))?;
    let mut writer = std::io::BufWriter::new(file);
    serde_json::to_writer(&mut writer, &report)?;
    writer.flush()?;
    let name = args.out.file_stem().unwrap_or_default().to_string_lossy();
    print_summary(&name, &report.summary);
    if report.run.feed_lag_max_ms > FEED_LAG_WARN_MS {
        println!(
            "  CẢNH BÁO: phát lại chậm hơn thời gian thực tới {:.0} ms (máy đang bận?); số đo lệch cùng cỡ",
            report.run.feed_lag_max_ms
        );
    }
    if report.run.sidecar_restarts > 0 {
        println!(
            "  CẢNH BÁO: tiến trình phụ khởi động lại {} lần trong lượt đo",
            report.run.sidecar_restarts
        );
    }
    if report.run.utterances_without_pieces > 0 {
        println!(
            "  CẢNH BÁO: {} câu không được gán phần chữ nguồn nào (đoạn VAD có thể đã phủ qua ranh giới câu, thường \
             gặp khi ngưỡng im lặng lớn); số đo bị lệch",
            report.run.utterances_without_pieces
        );
    }
    if report.run.failed + report.run.skipped > 0 {
        println!(
            "  CẢNH BÁO: {} câu dịch thất bại hoặc bị bỏ qua trong lượt đo",
            report.run.failed + report.run.skipped
        );
    }
    if !fatal.is_empty() {
        bail!("engine dừng vì lỗi: {}", fatal.join("; "));
    }
    Ok(())
}

fn print_summary(name: &str, s: &Summary) {
    let v = |x: Option<f64>| x.map_or("—".to_string(), |x| format!("{x:.0}"));
    println!(
        "{name}: A2 p50 {} ms, p90 {} ms; đầu câu → chữ dịch p50 {} ms, p90 {} ms; trễ theo từ: tạm p50 {} ms, ổn \
         định p50 {} ms; {} câu, {} đoạn",
        v(s.a2_p50_ms),
        v(s.a2_p90_ms),
        v(s.first_from_start_p50_ms),
        v(s.first_from_start_p90_ms),
        v(s.word_lag_tentative_p50_ms),
        v(s.word_lag_stable_p50_ms),
        v(s.utterances),
        v(s.segments),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[derive(Parser)]
    struct Cli {
        #[command(flatten)]
        args: SessionArgs,
    }

    fn args(extra: &[&str]) -> SessionArgs {
        let base = [
            "latency-bench",
            "--wav",
            "s.wav",
            "--truth",
            "s.truth.json",
            "--asr-worker",
            "bin/asr-worker",
            "--asr-model",
            "models/a.bin",
            "--llama-server",
            "bin/llama-server",
            "--mt-model",
            "models/m.gguf",
            "--out",
            "out/x.json",
        ];
        Cli::parse_from(base.iter().chain(extra)).args
    }

    /// Dựng như app trên macOS: chỉ nhận chế độ giải mã B, một bản `asr-worker` cho cả GPU và CPU, đường dẫn tuyệt đối (tiến
    /// trình phụ chạy trong thư mục chứa binary), log theo tên file kết quả. Mặc định: ngưỡng 50 ms như app.
    #[test]
    fn the_sidecars_are_set_up_like_the_app() {
        let a = args(&[]);
        assert_eq!(a.end_silence_ms, 50);
        assert_eq!(a.languages, ["en", "zh", "ja", "ko", "vi"]);
        let spec = sidecar_spec(&a);
        assert!(spec.asr.require_shared);
        assert_eq!(spec.asr.exe_gpu.as_ref(), Some(&spec.asr.exe_cpu));
        for p in [
            &spec.asr.exe_cpu,
            &spec.asr.model,
            &spec.llama.exe,
            &spec.llama.model,
            &spec.asr.log,
        ] {
            assert!(p.is_absolute(), "{}", p.display());
        }
        assert!(spec.asr.log.ends_with("out/x.asr-worker.log"));
        assert!(spec.llama.log.ends_with("out/x.llama-server.log"));
        assert!(spec.llama.extra_args.is_empty());
        assert_eq!(spec.mt_config, MtConfig::default());
        assert_eq!(args(&["--end-silence-ms", "400"]).end_silence_ms, 400);
    }

    #[test]
    fn the_recorder_keeps_events_in_order_and_fatal_errors_apart() {
        let recorder = Recorder::new(Instant::now());
        recorder.delta(&Delta {
            id: 3,
            text: "Xin".into(),
        });
        recorder.level(0.5);
        recorder.indicators(&Indicators::default());
        recorder.fatal(Fatal::Asr, "hỏng");
        let (events, fatal) = recorder.take();
        assert_eq!(events.len(), 2, "mức âm lượng không được ghi");
        assert!(matches!(events[0].ev, Recorded::Delta(_)));
        assert!(matches!(events[1].ev, Recorded::Indicators(_)));
        assert!(events[0].t_ms <= events[1].t_ms);
        assert_eq!(fatal, ["Asr: hỏng"]);
    }

    #[test]
    fn the_paced_source_releases_one_frame_every_32_ms() {
        let lag = Arc::new(AtomicU64::new(0));
        let origin = Instant::now();
        let mut source = Paced::new(vec![0.1; FRAME_SAMPLES * 3], origin, lag.clone());
        let mut out = Vec::new();
        for _ in 0..3 {
            assert!(source.read(&mut out, Duration::from_millis(20)).unwrap());
        }
        let elapsed = origin.elapsed();
        assert_eq!(out.len(), FRAME_SAMPLES * 3);
        assert!(elapsed >= Duration::from_millis(96), "{elapsed:?}");
        assert!(elapsed < Duration::from_secs(2), "{elapsed:?}");
        assert!(!source.read(&mut out, Duration::from_millis(20)).unwrap(), "hết mẫu");
    }

    #[test]
    fn machine_cpu_is_the_sum_over_the_logical_cores() {
        let usage = HashMap::from([
            (
                "asr-worker".to_string(),
                ProcessUsage {
                    avg_cpu_percent: 30.0,
                    ..ProcessUsage::default()
                },
            ),
            (
                "llama-server".to_string(),
                ProcessUsage {
                    avg_cpu_percent: 10.0,
                    ..ProcessUsage::default()
                },
            ),
        ]);
        assert_eq!(machine_cpu_percent(&usage, 8), Some(5.0));
        assert_eq!(machine_cpu_percent(&usage, 0), None);
        assert_eq!(machine_cpu_percent(&HashMap::new(), 8), None);
    }

    #[test]
    fn the_worker_flags_are_the_last_line_written() {
        let dir = std::env::temp_dir().join(format!("latency-bench-session-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let log = dir.join("x.asr-worker.log");
        std::fs::write(
            &log,
            "whisper_init_state: …\nasr-worker: backend=metal flash_attn=off decode_mode=shared\nasr-worker: \
             primer=off\nasr-worker: backend=metal flash_attn=on decode_mode=shared\nggml_metal_free: deallocating\n",
        )
        .unwrap();
        assert_eq!(
            worker_flags(&log).as_deref(),
            Some("asr-worker: backend=metal flash_attn=on decode_mode=shared")
        );
        assert_eq!(worker_flags(&dir.join("khong-co.log")), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// N-2 của rà soát chất lượng sau Task 1 (A1): một đoạn VAD phủ qua ranh giới hai câu truth làm câu trước mất hết
    /// phần (`units == 0`) và bị loại khỏi mọi số đo; đếm được để tự báo, không âm thầm làm méo số liệu.
    #[test]
    fn utterances_without_pieces_are_the_ones_with_zero_units() {
        let u = |units: usize| UtteranceResult {
            units,
            ..UtteranceResult::default()
        };
        let utterances = [u(0), u(3), u(0), u(1)];
        assert_eq!(count_utterances_without_pieces(&utterances), 2);
        assert_eq!(count_utterances_without_pieces(&[]), 0);
        assert_eq!(count_utterances_without_pieces(&[u(5)]), 0);
    }
}
