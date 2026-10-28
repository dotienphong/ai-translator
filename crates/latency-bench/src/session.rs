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
use crate::session_replay::Replay;
use crate::stats::{Utterance, percentile};
use anyhow::{Context, Result, anyhow, bail};
use asr_protocol::{TranscribeRequest, TranscribeResult};
use pipeline::config::{AsrConfig, LangAgree, MtConfig, PipelineConfig, StreamingConfig, SupervisorConfig};
use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, FrameSource, Indicators, SampleSource, VadModel};
use pipeline::llama::{ChatRequest, StreamEnd};
use pipeline::metrics::SessionMetrics;
use pipeline::prompt::Lang;
use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES};
use pipeline::subtitle::{Delta, LiveEnd, LiveLine, Subtitle};
use pipeline::supervisor::{
    Asr, AsrFailure, AsrSpec, LlamaSpec, SidecarEvent, SidecarEvents, SidecarManager, SidecarSpec, SystemClock, Which,
};
use pipeline::translate::{Mt, MtError};
use pipeline::vad::SileroVad;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap};
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
    /// Ngưỡng im lặng đóng đoạn (`vadEndSilenceMs`; mặc định của app là 50 ms; 0.2.9–0.2.10 là 100 ms).
    #[arg(long, default_value_t = 50)]
    pub end_silence_ms: u64,
    /// Bật chế độ dịch trong lúc nói (kế hoạch 02): `streaming_supported` và `streaming_enabled` của engine.
    #[arg(long)]
    pub streaming: bool,
    /// `streaming.end_silence_ms` (spec 2026-10-10 §4.7); mặc định theo `StreamingConfig::default()`.
    #[arg(long, value_parser = clap::value_parser!(u64).range(50..=2000))]
    pub streaming_end_silence_ms: Option<u64>,
    /// (n, k) theo tiếng nguồn, dạng `en:2:1,zh:2:2`: thay mục cùng tiếng của `streaming.tgt_agree` (spec §4.4).
    #[arg(long)]
    pub tgt_agree: Option<String>,
    /// File JSON kết quả.
    #[arg(long)]
    pub out: PathBuf,
    /// Họ mẫu prompt của `--mt-model` (`hy-mt2`, hay `lmt` cho gói Nhanh), như trường `prompt` của manifest.
    #[arg(long, default_value = "hy-mt2", value_parser = ["hy-mt2", "lmt"])]
    pub prompt: String,
    /// `speaker-worker` (binary): bật nhận giọng như app (spec 2026-10-26-phan-biet-nguoi-noi §4.3). Không có thì tắt.
    #[arg(long, requires = "speaker_model")]
    pub speaker_worker: Option<PathBuf>,
    /// Model nhúng giọng (`eres2net-sv-en-voxceleb-16k.onnx`), đi cùng `--speaker-worker`.
    #[arg(long, requires = "speaker_worker")]
    pub speaker_model: Option<PathBuf>,
    /// Bật đọc tên với công thức này (kế hoạch 04 Task 18): như app khi "Lấy tên" bật. `khong-app.recipes.json` (không app nào) đo
    /// phần tốn của đường tên mà không đọc app nào trên máy.
    #[arg(long, requires = "speaker_worker")]
    pub speaker_names_recipe: Option<PathBuf>,
    /// Ghi RSS của các tiến trình phụ mỗi 5 s vào file TSV (soak test, spec §11, §14).
    #[arg(long)]
    pub rss_trace: Option<PathBuf>,
    /// Kịch bản dịch quá tải (Task 4 Step 5): chờ thêm chừng này ms trước mỗi lần dịch (kể cả lần làm nóng), để dịch chậm hơn
    /// lời nói trên máy nhanh. 0 = như app. Lượt có cờ này không dùng để so tải hay độ trễ A2.
    #[arg(long, default_value_t = 0)]
    pub mt_extra_ms: u64,
}

/// Họ prompt của lượt đo (clap đã kiểm giá trị).
fn prompt_family(args: &SessionArgs) -> pipeline::prompt::PromptFamily {
    pipeline::prompt::PromptFamily::from_code(&args.prompt).expect("clap đã kiểm giá trị")
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

    fn live(&self, line: &LiveLine) {
        self.push(Recorded::Live(line.clone()));
    }

    fn live_end(&self, end: &LiveEnd) {
        self.push(Recorded::LiveEnd(*end));
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
    extra: Duration,
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
        if !self.extra.is_zero() {
            std::thread::sleep(self.extra);
        }
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
        mt_config: MtConfig {
            prompt_family: prompt_family(args),
            ..MtConfig::default()
        },
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
        for sidecar in ["asr-worker", "llama-server", "speaker-worker"] {
            if name.starts_with(sidecar) {
                pids.insert(sidecar.to_string(), pid);
            }
        }
    }
    pids
}

/// Số đo nhận giọng của lượt chạy (khóa `run`).
fn speaker_counts(
    metrics: &SessionMetrics,
    disabled: Option<pipeline::speaker_client::Disabled>,
) -> (usize, usize, usize, Option<String>) {
    (
        metrics.speaker_assigns,
        metrics.speaker_on_time,
        metrics.speaker_late,
        disabled.map(|d| format!("{d:?}")),
    )
}

/// p50, p90 (ms), số lần ≤ 230 ms và tổng số lần khứ hồi.
fn round_trip_stats(values: &[f32]) -> (Option<f64>, Option<f64>, usize, usize) {
    (
        percentile(values, 50.0).map(|v| ms(f64::from(v))),
        percentile(values, 90.0).map(|v| ms(f64::from(v))),
        values.iter().filter(|&&v| v <= 230.0).count(),
        values.len(),
    )
}

/// Vết RSS của các tiến trình phụ (`asr-worker`, `llama-server`, `speaker-worker`) mỗi 5 s, TSV `t_s, name, pid, rss_mb`
/// (MB = 10^6 byte). Tìm lại pid ở mỗi lần: tiến trình phụ có thể đã chạy lại.
fn spawn_rss_trace(path: PathBuf, stop: Arc<AtomicBool>) -> std::thread::JoinHandle<Result<()>> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    std::thread::spawn(move || {
        let mut out = std::io::BufWriter::new(std::fs::File::create(&path)?);
        writeln!(out, "t_s\tname\tpid\trss_mb")?;
        let (t0, mut sys) = (Instant::now(), System::new());
        while !stop.load(Ordering::Relaxed) {
            for (name, pid) in sidecar_pids().into_iter().filter(|(n, _)| n != "latency-bench") {
                let p = Pid::from_u32(pid);
                sys.refresh_processes_specifics(
                    ProcessesToUpdate::Some(&[p]),
                    true,
                    ProcessRefreshKind::nothing().with_memory(),
                );
                if let Some(process) = sys.process(p) {
                    writeln!(
                        out,
                        "{:.0}\t{name}\t{pid}\t{:.1}",
                        t0.elapsed().as_secs_f64(),
                        process.memory() as f64 / 1e6
                    )?;
                }
            }
            out.flush()?;
            for _ in 0..50 {
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
        Ok(())
    })
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

/// `--tgt-agree en:2:1,zh:2:2` thành các `LangAgree` (spec 2026-10-10 §4.4).
fn parse_tgt_agree(text: &str) -> Result<Vec<LangAgree>> {
    text.split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| {
            let parts: Vec<&str> = item.split(':').collect();
            let &[lang, n, k] = parts.as_slice() else {
                bail!("--tgt-agree: \"{item}\" phải có dạng <tiếng>:<n>:<k>");
            };
            Ok(LangAgree {
                lang: lang.to_string(),
                n: n.parse().with_context(|| format!("--tgt-agree: n của \"{item}\""))?,
                k: k.parse().with_context(|| format!("--tgt-agree: k của \"{item}\""))?,
            })
        })
        .collect()
}

/// Cấu hình của chế độ dịch trong lúc nói theo các cờ (kế hoạch 02, H9): ngưỡng ngắt câu riêng và (n, k) theo tiếng. Phần
/// `streaming` sau đó phải hợp lệ như khi nạp từ manifest; chỉ xét phần này, vì ngưỡng người dùng 50 ms của app nằm ngoài
/// khoảng manifest của `segmenter.end_silence_ms`.
fn apply_streaming(args: &SessionArgs, pipeline: &mut PipelineConfig) -> Result<()> {
    if let Some(ms) = args.streaming_end_silence_ms {
        pipeline.streaming.end_silence_ms = ms;
    }
    if let Some(text) = &args.tgt_agree {
        for agree in parse_tgt_agree(text)? {
            match pipeline.streaming.tgt_agree.iter_mut().find(|a| a.lang == agree.lang) {
                Some(slot) => *slot = agree,
                None => pipeline.streaming.tgt_agree.push(agree),
            }
        }
    }
    let probe = PipelineConfig {
        streaming: pipeline.streaming.clone(),
        ..PipelineConfig::default()
    };
    probe
        .validate()
        .map_err(|key| anyhow!("cấu hình dịch trong lúc nói không hợp lệ: {key}"))
}

/// Cấu hình engine của lượt đo: mặc định của app, ngưỡng người dùng, và các cờ của chế độ dịch trong lúc nói (kế hoạch 02,
/// H9). Cờ sai thì báo lỗi ở đây, trước khi chạy tiến trình phụ.
fn engine_config(args: &SessionArgs, target: Lang) -> Result<EngineConfig> {
    let mut pipeline = PipelineConfig::default();
    pipeline.segmenter.end_silence_ms = args.end_silence_ms;
    pipeline.mt.prompt_family = prompt_family(args);
    apply_streaming(args, &mut pipeline)?;
    Ok(EngineConfig {
        pipeline,
        languages: args.languages.clone(),
        target,
        translation_context: false,
        id_base: 0,
        glossary: Default::default(),
        // `--streaming`: máy coi như đủ sức, công tắc bật (kế hoạch 02); không có cờ thì chạy đúng chế độ thường.
        streaming_supported: args.streaming,
        streaming_enabled: args.streaming,
    })
}

/// Các khóa `summary` của chế độ dịch trong lúc nói (kế hoạch 02, H9): số lần chép từng phần có kết quả, p50 của nhịp T
/// sau mỗi vòng, và việc đã tự tắt (1 hay 0; `None` khi không chạy `--streaming`).
fn fill_streaming_summary(summary: &mut Summary, metrics: &SessionMetrics, streaming: bool) {
    summary.partials = Some(metrics.partials as f64);
    summary.cadence_p50_ms = percentile(&metrics.cadence_ms, 50.0).map(|v| ms(f64::from(v)));
    summary.streaming_auto_off = streaming.then(|| f64::from(u8::from(metrics.streaming_auto_off)));
}

/// Số đo của dòng đang nói cho khóa `run` (kế hoạch 02, H9): số dòng đang nói khác nhau (theo `id`, vì một dòng phát nhiều
/// sự kiện `live` khi cập nhật); mẫu và tử của `stable_flicker_ratio` (để gộp nhiều session).
fn fill_live_counts(run: &mut RunInfo, events: &[Timed]) {
    let replay = Replay::new(events);
    run.live_lines = events
        .iter()
        .filter_map(|e| match &e.ev {
            Recorded::Live(l) => Some(l.id),
            _ => None,
        })
        .collect::<BTreeSet<_>>()
        .len();
    run.final_units = replay.final_translated_units();
    run.stable_changed_units = replay.changed_stable_units();
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
        ("streaming".to_string(), args.streaming.to_string()),
        (
            "streaming_end_silence_ms".to_string(),
            args.streaming_end_silence_ms
                .unwrap_or(StreamingConfig::default().end_silence_ms)
                .to_string(),
        ),
        (
            "tgt_agree".to_string(),
            args.tgt_agree.clone().unwrap_or_else(|| "mặc định".into()),
        ),
        (
            "speaker_worker".to_string(),
            args.speaker_worker
                .as_deref()
                .map(public_path)
                .unwrap_or_else(|| "tắt".into()),
        ),
        (
            "speaker_model".to_string(),
            args.speaker_model.as_deref().map(public_path).unwrap_or_default(),
        ),
        (
            "speaker_names_recipe".to_string(),
            args.speaker_names_recipe
                .as_deref()
                .map(public_path)
                .unwrap_or_else(|| "tắt".into()),
        ),
        ("mt_extra_ms".to_string(), args.mt_extra_ms.to_string()),
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
    /// Chế độ dịch trong lúc nói (kế hoạch 02): số dòng đang nói khác nhau; số đơn vị của mọi bản dịch cuối và số đơn vị phần
    /// dịch ổn định mà bản cuối thay đổi (mẫu và tử của `stable_flicker_ratio`, để gộp nhiều session).
    live_lines: usize,
    final_units: usize,
    stable_changed_units: usize,
    /// Nhận giọng (kế hoạch 02b): số `Assign`, số tới khi đoạn còn chờ nhận dạng (nhãn có ngay ở lần phát đầu), số tới muộn; lý do
    /// client tắt giữa chừng, nếu có.
    speaker_assigns: usize,
    speaker_on_time: usize,
    speaker_late: usize,
    speaker_disabled: Option<String>,
    /// Khứ hồi của nhãn khi chạy cùng `asr-worker`, `llama-server` (gửi `Segment` → có trả lời, `SpeakerHandle::round_trip_ms`):
    /// p50, p90 (ms), số đoạn xong ≤ 230 ms trên số đoạn có trả lời (spec §4.4, §11).
    speaker_round_p50_ms: Option<f64>,
    speaker_round_p90_ms: Option<f64>,
    speaker_round_within_230: usize,
    speaker_round_count: usize,
    /// Hàng đợi dịch (QĐ 12 của kế hoạch 02): số câu bị gộp vào câu khác, số lần gộp hai câu đã biết khác giọng, số câu chờ dịch
    /// nhiều nhất cùng lúc, câu chờ lâu nhất (ms, giờ âm thanh). Ghi cả khi tắt nhận giọng để so.
    mt_merges: usize,
    mt_merges_across_voices: usize,
    mt_queue_max: usize,
    mt_wait_max_ms: u64,
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
    let config = engine_config(&args, target)?;
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
    // Nhận giọng như app; lượt đo chờ worker sẵn sàng (app thì không) để số đo gồm cả nó từ đầu.
    let speaker = match (&args.speaker_worker, &args.speaker_model) {
        (Some(exe), Some(model)) => {
            let mut launch = pipeline::speaker_client::SpeakerLaunch::new(
                exe,
                model,
                &log_path(&args.out, "speaker-worker"),
                speaker_protocol::SpeakerConfig::default(),
            );
            if let Some(path) = &args.speaker_names_recipe {
                launch.names = speaker_protocol::NamesSetup {
                    enabled: true,
                    recipe_json: std::fs::read_to_string(path)
                        .with_context(|| format!("không đọc được công thức {}", path.display()))?,
                    eui_marker: None,
                };
            }
            let (link, handle) = pipeline::speaker_client::start(launch, Box::new(|_| Ok(())));
            if !handle.wait_ready(Duration::from_secs(60)) {
                bail!("speaker-worker không sẵn sàng: {:?}", handle.disabled());
            }
            Some((link, handle))
        }
        _ => None,
    };
    let (speaker_link, speaker_handle) = match speaker {
        Some((link, handle)) => (Some(link), Some(handle)),
        None => (None, None),
    };
    let stop_sampler = Arc::new(AtomicBool::new(false));
    let sampler = spawn_sampler(sidecar_pids(), stop_sampler.clone());
    let trace = args
        .rss_trace
        .clone()
        .map(|path| spawn_rss_trace(path, stop_sampler.clone()));

    let asr_busy = Arc::new(AtomicU64::new(0));
    let mt_busy = Arc::new(AtomicU64::new(0));
    let lag_max = Arc::new(AtomicU64::new(0));
    let origin = Instant::now();
    let recorder = Arc::new(Recorder::new(origin));
    let engine = Engine::start_with_speaker(
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
            extra: Duration::from_millis(args.mt_extra_ms),
        }),
        recorder.clone(),
        speaker_link,
    )?;
    let metrics = engine.join();
    let session_ms = origin.elapsed().as_secs_f64() * 1000.0;
    manager.end_session();
    stop_sampler.store(true, Ordering::Relaxed);
    let usage = sampler.join().map_err(|_| anyhow!("luồng đo tài nguyên panic"))?;
    if let Some(trace) = trace {
        trace.join().map_err(|_| anyhow!("luồng ghi vết RSS panic"))??;
    }
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
    let mut run = RunInfo {
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
        ..RunInfo::default()
    };
    (
        run.speaker_assigns,
        run.speaker_on_time,
        run.speaker_late,
        run.speaker_disabled,
    ) = speaker_counts(&metrics, speaker_handle.as_ref().and_then(|h| h.disabled()));
    let rounds = speaker_handle.as_ref().map(|h| h.round_trip_ms()).unwrap_or_default();
    (
        run.speaker_round_p50_ms,
        run.speaker_round_p90_ms,
        run.speaker_round_within_230,
        run.speaker_round_count,
    ) = round_trip_stats(&rounds);
    (run.mt_merges, run.mt_merges_across_voices) = (metrics.mt_merges, metrics.mt_merges_across_voices);
    (run.mt_queue_max, run.mt_wait_max_ms) = (metrics.mt_queue_max, metrics.mt_wait_max_ms);
    fill_live_counts(&mut run, &events);
    let mut summary = summarize(&truth, &events);
    summary.segments = Some(metrics.segments as f64);
    summary.busy_ratio = (session_ms > 0.0).then(|| ratio4((run.asr_busy_ms + run.mt_busy_ms) / session_ms));
    summary.cpu_percent = machine_cpu_percent(&usage, cores).map(ms);
    fill_streaming_summary(&mut summary, &metrics, args.streaming);
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
    if report.run.speaker_assigns > 0 || report.run.speaker_disabled.is_some() {
        println!(
            "  nhận giọng: {} nhãn ({} trước khi có chữ, {} muộn); khứ hồi p50 {:?} ms, p90 {:?} ms, ≤ 230 ms: {}/{}{}",
            report.run.speaker_assigns,
            report.run.speaker_on_time,
            report.run.speaker_late,
            report.run.speaker_round_p50_ms,
            report.run.speaker_round_p90_ms,
            report.run.speaker_round_within_230,
            report.run.speaker_round_count,
            report
                .run
                .speaker_disabled
                .as_deref()
                .map(|d| format!("; tắt giữa chừng: {d}"))
                .unwrap_or_default()
        );
    }
    println!(
        "  hàng đợi dịch: gộp {} câu ({} lần khác giọng), {} câu bỏ bước dịch; dài nhất {} câu, chờ lâu nhất {} ms",
        report.run.mt_merges,
        report.run.mt_merges_across_voices,
        report.run.skipped,
        report.run.mt_queue_max,
        report.run.mt_wait_max_ms
    );
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
    use crate::session_replay::tests::merged_sentence;
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

    fn try_args(extra: &[&str]) -> Result<SessionArgs, clap::Error> {
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
        Cli::try_parse_from(base.iter().chain(extra)).map(|c| c.args)
    }

    #[test]
    fn the_speaker_flags_come_together() {
        assert!(args(&[]).speaker_worker.is_none());
        assert!(try_args(&["--speaker-worker", "s"]).is_err());
        assert!(try_args(&["--speaker-model", "e.onnx"]).is_err());
        let a = args(&[
            "--speaker-worker",
            "s",
            "--speaker-model",
            "e.onnx",
            "--rss-trace",
            "t.tsv",
        ]);
        assert_eq!(a.speaker_model.as_deref(), Some(Path::new("e.onnx")));
        assert_eq!(a.rss_trace.as_deref(), Some(Path::new("t.tsv")));
        assert_eq!(
            args_map(&a, Path::new("v.onnx"))["speaker_worker"],
            public_path(Path::new("s"))
        );
        assert_eq!(args_map(&args(&[]), Path::new("v.onnx"))["speaker_worker"], "tắt");
    }

    #[test]
    fn the_names_recipe_flag_turns_names_on_and_is_recorded() {
        let a = args(&[
            "--speaker-worker",
            "w",
            "--speaker-model",
            "e.onnx",
            "--speaker-names-recipe",
            "r.json",
        ]);
        assert_eq!(a.speaker_names_recipe.as_deref(), Some(Path::new("r.json")));
        // `public_path` trả đường dẫn tính từ gốc repo (`cargo test` chạy trong `crates/latency-bench`), như test `speaker_worker` so
        // với `public_path(Path::new("s"))`. KHÔNG bỏ `public_path` cho test xanh: file JSON kết quả được commit, đường dẫn tuyệt đối
        // có tên thư mục người dùng (rà soát B-C1).
        assert_eq!(
            args_map(&a, Path::new("v.onnx"))["speaker_names_recipe"],
            public_path(Path::new("r.json"))
        );
        assert_eq!(args_map(&args(&[]), Path::new("v.onnx"))["speaker_names_recipe"], "tắt");
    }

    #[test]
    fn speaker_counts_come_from_the_engine_metrics() {
        let metrics = SessionMetrics {
            speaker_assigns: 10,
            speaker_on_time: 8,
            speaker_late: 2,
            ..SessionMetrics::default()
        };
        assert_eq!(
            speaker_counts(&metrics, Some(pipeline::speaker_client::Disabled::Overload)),
            (10, 8, 2, Some("Overload".to_string()))
        );
        assert_eq!(speaker_counts(&SessionMetrics::default(), None), (0, 0, 0, None));
    }

    /// Mốc 230 ms của spec §4.4, §11, đo khi chạy cùng hai tiến trình phụ (`SpeakerHandle::round_trip_ms`).
    #[test]
    fn round_trips_are_summarized_against_230_ms() {
        let (p50, p90, within, total) = round_trip_stats(&[100.0, 200.0, 300.0]);
        assert_eq!((p50, within, total), (Some(200.0), 2, 3));
        assert!(p90.is_some_and(|v| v > 200.0 && v <= 300.0));
        assert_eq!(round_trip_stats(&[]), (None, None, 0, 0));
    }

    /// Kịch bản dịch quá tải (Task 4 Step 5, QĐ 12 của file 02): `--mt-extra-ms` cộng vào mỗi lần dịch; mặc định 0 (như app);
    /// ghi vào `args` của file kết quả.
    #[test]
    fn the_overload_flag_defaults_to_the_app_speed() {
        assert_eq!(args(&[]).mt_extra_ms, 0);
        let a = args(&["--mt-extra-ms", "2000"]);
        assert_eq!(a.mt_extra_ms, 2_000);
        assert_eq!(args_map(&a, Path::new("v.onnx"))["mt_extra_ms"], "2000");
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
        let lmt = args(&["--prompt", "lmt"]);
        assert_eq!(
            sidecar_spec(&lmt).mt_config.prompt_family,
            pipeline::prompt::PromptFamily::Lmt
        );
        let config = engine_config(&lmt, Lang::Vi).unwrap();
        assert_eq!(config.pipeline.mt.prompt_family, pipeline::prompt::PromptFamily::Lmt);
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

    /// `--tgt-agree en:3:1,zh:2:2` (kế hoạch 02, H9).
    #[test]
    fn tgt_agree_is_parsed_per_language() {
        assert_eq!(
            parse_tgt_agree("en:3:1, zh:2:2").unwrap(),
            [
                LangAgree {
                    lang: "en".into(),
                    n: 3,
                    k: 1
                },
                LangAgree {
                    lang: "zh".into(),
                    n: 2,
                    k: 2
                }
            ]
        );
        assert!(parse_tgt_agree("en:3").is_err());
        assert!(parse_tgt_agree("en:x:1").is_err());
        assert!(parse_tgt_agree("en:3:1:0").is_err(), "thừa phần");
        assert!(parse_tgt_agree("").unwrap().is_empty());
    }

    /// Ba cờ của chế độ dịch trong lúc nói đặt `PipelineConfig.streaming`; ngưỡng người dùng giữ nguyên; giá trị vô lý bị từ
    /// chối (n ngoài khoảng, hay mã tiếng ngoài 5 mã của `Lang::from_code` — Task 1, commit `e388300`); không có cờ thì
    /// cấu hình mặc định.
    #[test]
    fn the_streaming_flags_set_the_streaming_config() {
        let a = args(&[
            "--streaming",
            "--streaming-end-silence-ms",
            "200",
            "--tgt-agree",
            "ja:3:3,ko:2:0",
        ]);
        assert!(a.streaming);
        let mut p = PipelineConfig::default();
        p.segmenter.end_silence_ms = a.end_silence_ms;
        apply_streaming(&a, &mut p).unwrap();
        assert_eq!(p.streaming.end_silence_ms, 200);
        assert_eq!(
            (
                p.streaming.agree_for("ja"),
                p.streaming.agree_for("ko"),
                p.streaming.agree_for("en")
            ),
            ((3, 3), (2, 0), (2, 1))
        );
        assert_eq!(p.segmenter.end_silence_ms, 50, "ngưỡng người dùng giữ nguyên");
        let bad = args(&["--tgt-agree", "en:9:1"]);
        assert!(
            apply_streaming(&bad, &mut PipelineConfig::default()).is_err(),
            "n ngoài 2..=5"
        );
        let unknown_lang = args(&["--tgt-agree", "fr:2:0"]);
        assert!(
            apply_streaming(&unknown_lang, &mut PipelineConfig::default()).is_err(),
            "\"fr\" không phải 1 trong 5 mã của Lang::from_code"
        );
        let plain = args(&[]);
        assert!(!plain.streaming);
        let mut p = PipelineConfig::default();
        apply_streaming(&plain, &mut p).unwrap();
        assert_eq!(p.streaming, StreamingConfig::default());
    }

    #[test]
    fn the_recorder_keeps_live_events() {
        let recorder = Recorder::new(Instant::now());
        recorder.live(&LiveLine {
            id: 4,
            tgt_tail: "chúng tôi".into(),
            ..LiveLine::default()
        });
        recorder.live_end(&LiveEnd { id: 4 });
        let (events, _) = recorder.take();
        let json = serde_json::to_value(&events).unwrap();
        assert_eq!(
            (
                json[0]["kind"].as_str(),
                json[0]["id"].as_u64(),
                json[0]["tgt_tail"].as_str()
            ),
            (Some("live"), Some(4), Some("chúng tôi"))
        );
        assert_eq!(
            (json[1]["kind"].as_str(), json[1]["id"].as_u64()),
            (Some("live_end"), Some(4))
        );
    }

    /// `--streaming` bật cả hai công tắc của engine; ngưỡng và (n, k) của các cờ tới đúng cấu hình engine nhận (Task 19 đo
    /// theo lưới các cờ này); không có cờ thì chạy đúng chế độ thường với cấu hình mặc định; cờ sai thì báo lỗi.
    #[test]
    fn the_engine_config_carries_the_streaming_flags() {
        let on = engine_config(
            &args(&[
                "--streaming",
                "--streaming-end-silence-ms",
                "600",
                "--tgt-agree",
                "en:3:1",
            ]),
            Lang::Vi,
        )
        .unwrap();
        assert_eq!((on.streaming_supported, on.streaming_enabled), (true, true));
        assert_eq!(
            (
                on.pipeline.streaming.end_silence_ms,
                on.pipeline.streaming.agree_for("en")
            ),
            (600, (3, 1))
        );
        assert_eq!(on.pipeline.segmenter.end_silence_ms, 50, "ngưỡng người dùng");
        let off = engine_config(&args(&[]), Lang::Vi).unwrap();
        assert_eq!((off.streaming_supported, off.streaming_enabled), (false, false));
        assert_eq!(off.pipeline.streaming, StreamingConfig::default());
        assert!(engine_config(&args(&["--tgt-agree", "en:9:1"]), Lang::Vi).is_err());
    }

    /// Ba khóa `summary` của chế độ dịch trong lúc nói (kế hoạch 02, H9) lấy từ số đo của engine; `streaming_auto_off` là 1
    /// hay 0 khi chạy `--streaming`, `null` khi không.
    #[test]
    fn the_streaming_summary_keys_come_from_the_engine_metrics() {
        let metrics = |partials: usize, cadence_ms: Vec<f32>, streaming_auto_off: bool| SessionMetrics {
            partials,
            cadence_ms,
            streaming_auto_off,
            ..SessionMetrics::default()
        };
        let keys = |m: &SessionMetrics, streaming: bool| {
            let mut s = Summary::default();
            fill_streaming_summary(&mut s, m, streaming);
            (s.partials, s.cadence_p50_ms, s.streaming_auto_off)
        };
        assert_eq!(
            keys(&metrics(7, vec![900.0, 1_000.0, 1_500.0], true), true),
            (Some(7.0), Some(1_000.0), Some(1.0))
        );
        assert_eq!(
            keys(&metrics(3, Vec::new(), false), true),
            (Some(3.0), None, Some(0.0)),
            "chưa tự tắt là 0, không phải null"
        );
        assert_eq!(
            keys(&metrics(0, Vec::new(), true), false),
            (Some(0.0), None, None),
            "không chạy --streaming: null"
        );
    }

    /// Số đo của dòng đang nói cho khóa `run` (kế hoạch 02, H9): `live_lines` đếm dòng khác nhau theo `id` (dòng 2 phát hai
    /// sự kiện `live`); `final_units` là số đơn vị của mọi bản dịch cuối ("chúng tôi về nhà." là 4); `stable_changed_units`
    /// là số đơn vị phần ổn định bị bản cuối đổi (ở đây 0).
    #[test]
    fn the_run_counts_live_lines_by_id_and_the_flicker_units() {
        let live = |t_ms: f64, id: u64| Timed {
            t_ms,
            ev: Recorded::Live(LiveLine {
                id,
                ..LiveLine::default()
            }),
        };
        let mut events = merged_sentence(true);
        events.extend([
            live(6_000.0, 2),
            live(6_100.0, 2),
            live(6_200.0, 3),
            Timed {
                t_ms: 6_300.0,
                ev: Recorded::LiveEnd(LiveEnd { id: 2 }),
            },
        ]);
        let mut run = RunInfo::default();
        fill_live_counts(&mut run, &events);
        assert_eq!((run.live_lines, run.final_units, run.stable_changed_units), (2, 4, 0));
    }

    /// `args` của file JSON ghi ba cờ của chế độ dịch trong lúc nói (kế hoạch 02, H9); ngưỡng là giá trị hiệu lực: không có
    /// cờ thì mặc định của `StreamingConfig`.
    #[test]
    fn the_args_record_the_streaming_flags() {
        let keys = |extra: &[&str]| {
            let m = args_map(&args(extra), Path::new("models/vad.onnx"));
            [&m["streaming"], &m["streaming_end_silence_ms"], &m["tgt_agree"]].map(String::clone)
        };
        assert_eq!(
            keys(&[
                "--streaming",
                "--streaming-end-silence-ms",
                "200",
                "--tgt-agree",
                "ja:3:3"
            ]),
            ["true", "200", "ja:3:3"]
        );
        assert_eq!(
            keys(&[]),
            [
                "false".to_string(),
                StreamingConfig::default().end_silence_ms.to_string(),
                "mặc định".to_string()
            ]
        );
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
