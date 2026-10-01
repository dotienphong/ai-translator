//! Pipeline của một phiên dịch (spec §5, §7): âm thanh 16 kHz mono vào, phụ đề ra. Không phụ thuộc Tauri: app nối vào qua
//! [`FrameSource`] và [`EventSink`] (`src-tauri/src/session.rs`), test nối vào bằng file WAV và tiến trình phụ giả.
//!
//! Các luồng (§7). Callback thu âm nằm ngoài crate này (`audio-capture`).
//! 1. Luồng VAD (stack 8 MiB, vì Silero chạy bằng candle cần hơn 1 MiB ở bản debug, §6.3): đọc âm thanh, đo mức âm lượng,
//!    phát hiện "không có âm thanh", chạy VAD và cắt đoạn, đưa đoạn vào hàng đợi nhận dạng.
//! 2. Luồng nhận dạng: lấy đoạn theo luật hàng đợi §7, dựng prompt theo ngôn ngữ, gọi `asr-worker`, áp luật bỏ đoạn.
//! 3. Luồng phụ đề: nơi duy nhất phát sự kiện phụ đề, nên thứ tự upsert và delta luôn đúng. Ghép câu (§6.3), hàng đợi dịch
//!    (§7), chỉ báo "Đang trễ", số đo của phiên, đếm phút cho hạn mức (§6.8).
//! 4. Luồng dịch: dịch từng câu (`translate`), gửi từng phần chữ về luồng phụ đề.
//!
//! Chọn luồng riêng và client đồng bộ, không dùng runtime tokio (kế hoạch 02, QĐ1): hai client đồng bộ của Giai đoạn 0 đã
//! được đo ở S6 và giữ nguyên; mỗi tiến trình phụ chỉ xử lý một yêu cầu một lúc (`-np 1`), nên async không thêm thông
//! lượng; crate `pipeline` không cần runtime nào, test chạy không cần Tauri.
//!
//! "Giờ" của phiên là giờ âm thanh: số mẫu đã đọc, đổi ra ms. Âm thanh thu thật chạy đúng tốc độ thời gian thực (trên
//! Windows, khoảng lặng được chèn im lặng, §6.1), nên giờ âm thanh bằng giờ thật; test phát file WAV nhanh hơn thời gian
//! thực mà luật vẫn như nhau. Riêng hạn dịch câu cuối khi dừng (`mt.stop_grace_ms`) tính bằng giờ thật, vì lúc đó âm
//! thanh đã ngừng.
//!
//! Ba cách kết thúc một phiên:
//! - [`Engine::stop`] (bấm Dừng): luồng VAD chốt đoạn đang dở; các đoạn và câu còn lại được xử lý tiếp như thường, trong
//!   một hạn chung `mt.stop_grace_ms` (3 giây) tính từ lúc bấm, nên câu cuối thường vẫn được dịch. Hết hạn thì câu đang
//!   dịch và câu chờ dịch thành `skipped`, và luồng phụ đề thoát ngay. Luồng nhận dạng và luồng dịch không được chờ: nếu
//!   tiến trình phụ đang treo, chúng tự kết thúc khi request hết thời gian chờ.
//! - Hết hạn mức (spec §6.8, "Khi chạm hạn mức"): [`EventSink::usage`] trả `Break`, hoặc app gọi
//!   [`Engine::exhaust_quota`]. Engine bỏ các đoạn chờ nhận dạng và các câu chờ dịch (`skipped`), chỉ dịch xong câu đang
//!   dịch (trong cùng hạn `mt.stop_grace_ms`), rồi báo [`Fatal::QuotaExhausted`]. Kế hoạch 06 nối bộ đếm vào đây.
//! - Lỗi không chạy tiếp được ([`Fatal`]): VAD, nguồn âm thanh, `asr-worker`, hoặc một luồng của engine dừng bất thường.
//!   App nhận [`EventSink::fatal`] rồi gọi `stop`.

use crate::config::{AudioConfig, FilterConfig, MtConfig, PipelineConfig};
use crate::filter::{Evidence, Verdict, pcm_skip, verdict};
use crate::metrics::SessionMetrics;
use crate::prompt::{Lang, translation_prompt};
use crate::prompt_history::PromptHistory;
use crate::queue::{AsrQueue, MtItem, MtQueue, PendingSegment, Popped, Ready};
use crate::segmenter::{FRAME_MS, FRAME_SAMPLES, Segmenter};
use crate::sentence::{OpenSentence, Piece, merge_window_ms};
use crate::subtitle::{Delta, Status, Subtitle};
use crate::supervisor::{Asr, AsrFailure};
use crate::text::display_text;
use crate::translate::{Event, Job, Mt, Outcome, translate};
use crate::vad::SileroVad;
use anyhow::Result;
use asr_protocol::{TranscribeRequest, audio_ctx_for_samples};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// Stack của luồng VAD (§6.3: từ 4 MiB).
const VAD_STACK_BYTES: usize = 8 << 20;
/// Luồng VAD gửi giờ âm thanh cho luồng phụ đề sau mỗi chừng này khung (96 ms).
const CLOCK_EVERY_FRAMES: u64 = 3;

#[derive(Clone, Debug)]
pub struct EngineConfig {
    pub pipeline: PipelineConfig,
    /// Mã ngôn ngữ Whisper được phép; một phần tử là khóa ngôn ngữ (F2).
    pub languages: Vec<String>,
    pub target: Lang,
    /// Cờ thử nghiệm `experimental.translationContext` (§6.5), mặc định tắt.
    pub translation_context: bool,
    /// Cộng vào id của mọi phụ đề, để id không trùng giữa các phiên của cùng một lần chạy app.
    pub id_base: u64,
}

/// Nguồn âm thanh 16 kHz mono.
pub trait FrameSource: Send {
    /// Thêm mẫu mới vào `out`, chờ tối đa `timeout` nếu chưa có. `Ok(false)`: hết luồng. `Err`: nguồn hỏng hẳn (app đã
    /// thử mở lại mà không được, 02c); engine báo [`Fatal::Audio`].
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool>;
}

/// Mẫu có sẵn trong bộ nhớ (file WAV), phát theo từng khối. `pace`: chờ giữa hai khối, để phát gần thời gian thực.
pub struct SampleSource {
    samples: Vec<f32>,
    pos: usize,
    chunk: usize,
    pace: Duration,
}

impl SampleSource {
    pub fn new(samples: Vec<f32>, chunk: usize, pace: Duration) -> Self {
        Self {
            samples,
            pos: 0,
            chunk: chunk.max(1),
            pace,
        }
    }
}

impl FrameSource for SampleSource {
    fn read(&mut self, out: &mut Vec<f32>, _timeout: Duration) -> Result<bool> {
        if self.pos >= self.samples.len() {
            return Ok(false);
        }
        if !self.pace.is_zero() {
            std::thread::sleep(self.pace);
        }
        let end = (self.pos + self.chunk).min(self.samples.len());
        out.extend_from_slice(&self.samples[self.pos..end]);
        self.pos = end;
        Ok(true)
    }
}

/// Xác suất có tiếng nói của một khung 512 mẫu.
pub trait VadModel {
    fn prob(&mut self, frame: &[f32]) -> Result<f32>;
}

impl VadModel for SileroVad {
    fn prob(&mut self, frame: &[f32]) -> Result<f32> {
        SileroVad::prob(self, frame)
    }
}

/// VAD theo năng lượng, cho test không cần model: RMS của khung vượt ngưỡng là tiếng nói.
pub struct EnergyVad {
    pub threshold_rms: f32,
}

impl VadModel for EnergyVad {
    fn prob(&mut self, frame: &[f32]) -> Result<f32> {
        Ok(if rms(frame) > self.threshold_rms { 0.9 } else { 0.0 })
    }
}

/// Dựng VAD trên chính luồng VAD (Silero phải được tạo và chạy trên luồng có stack lớn, §6.3).
pub type VadFactory = Box<dyn FnOnce() -> Result<Box<dyn VadModel>> + Send>;

fn rms(frame: &[f32]) -> f32 {
    (frame.iter().map(|x| x * x).sum::<f32>() / frame.len().max(1) as f32).sqrt()
}

/// Chỉ báo nhỏ của thanh phụ đề (§4.4, §9).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Indicators {
    /// Độ trễ vượt `lag_warn_ms` (6 giây): "Đang trễ".
    pub lagging: bool,
    /// Hơn 60 giây không có âm thanh vào: "Không nghe thấy âm thanh".
    pub no_audio: bool,
    /// `llama-server` không dùng được: phụ đề chỉ hiện câu gốc.
    pub translation_unavailable: bool,
}

/// Lý do phiên phải dừng.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fatal {
    /// Không nạp được VAD, VAD lỗi giữa chừng, hoặc luồng VAD dừng bất thường.
    Vad,
    /// Nguồn âm thanh hỏng hẳn (`FrameSource::read` trả lỗi).
    Audio,
    /// `asr-worker` không dùng được nữa (lỗi quá 5 lần trong 10 phút, §6.4), hoặc luồng nhận dạng dừng bất thường.
    Asr,
    /// Luồng phụ đề dừng bất thường.
    Internal,
    /// Chạm hạn mức (§6.8): app dừng phiên với lý do `quota_exhausted` (kế hoạch 06).
    QuotaExhausted,
}

/// Một lần đếm phút cho hạn mức (§6.8, "Cách đếm phút"): phụ đề `sub_id` vừa sang `done`, và `speech_ms` là phần tiếng nói
/// chưa được tính của nó (không gồm đệm, đoạn gộp cộng từng đoạn con). Câu được dịch lại sau khi ghép thêm đoạn chỉ tính
/// phần mới. `same_lang`, `failed`, `skipped`, `dropped` và đoạn bị lọc không bao giờ có `Usage`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Usage {
    pub sub_id: u64,
    pub speech_ms: u64,
}

/// Nơi nhận kết quả của pipeline. Gọi từ các luồng của engine.
pub trait EventSink: Send + Sync {
    fn subtitle(&self, subtitle: &Subtitle);
    fn delta(&self, delta: &Delta);
    /// Mức âm lượng vào (RMS, 0 tới 1), mỗi `level_interval_ms`.
    fn level(&self, rms: f32);
    fn indicators(&self, indicators: &Indicators);
    /// Phiên phải dừng và báo lỗi (§9). Gọi từ luồng của engine: đừng dừng engine ngay trong hàm này.
    fn fatal(&self, kind: Fatal, reason: &str);
    /// Phút vừa dịch xong, để bộ đếm hạn mức cộng (kế hoạch 06). Trả `Break` khi đã chạm hạn mức: engine dừng theo luật
    /// "Khi chạm hạn mức" rồi báo [`Fatal::QuotaExhausted`]. Mặc định không đếm gì.
    fn usage(&self, _usage: &Usage) -> ControlFlow<()> {
        ControlFlow::Continue(())
    }
}

/// Đếm thời gian im lặng liên tục (RMS dưới ngưỡng), kể cả phần im lặng được chèn khi Windows không trả gói dữ liệu (§9).
#[derive(Debug)]
pub struct SilenceMonitor {
    silent_ms: u64,
    cfg: AudioConfig,
}

impl SilenceMonitor {
    pub fn new(cfg: AudioConfig) -> Self {
        Self { silent_ms: 0, cfg }
    }

    /// Một khung; trả `true` khi đã im lặng từ `no_audio_after_ms` trở lên.
    pub fn push(&mut self, frame_rms: f32, frame_ms: u64) -> bool {
        if frame_rms < self.cfg.silent_rms {
            self.silent_ms += frame_ms;
        } else {
            self.silent_ms = 0;
        }
        self.silent_ms >= self.cfg.no_audio_after_ms
    }
}

enum AsrOutcome {
    Transcribed {
        ids: Vec<u64>,
        start_ms: u64,
        end_ms: u64,
        speech_ms: u64,
        lang: String,
        text: String,
        asr_ms: f32,
    },
    /// Luật bỏ đoạn loại (không có tiếng nói, câu ảo giác, chuỗi lặp, câu đệm, quá ngắn): không phụ đề, không cắt chuỗi
    /// ghép câu.
    Filtered {
        ids: Vec<u64>,
    },
    Dropped {
        ids: Vec<u64>,
        start_ms: u64,
        end_ms: u64,
    },
    Unavailable(String),
}

enum Msg {
    Queued {
        id: u64,
        start_ms: u64,
        end_ms: u64,
        closed_ms: u64,
    },
    Clock {
        now_ms: u64,
        speech_since: Option<u64>,
    },
    NoAudio(bool),
    Asr(AsrOutcome),
    AsrDone,
    MtDelta {
        sub_id: u64,
        version: u32,
        text: String,
    },
    MtRetry {
        sub_id: u64,
        version: u32,
    },
    MtDone {
        sub_id: u64,
        version: u32,
        outcome: Outcome,
    },
    /// Luồng dịch dừng bất thường.
    MtGone,
}

struct MtJob {
    sub_id: u64,
    version: u32,
    src: Lang,
    text: String,
    context: Option<String>,
    cancel: Arc<AtomicBool>,
}

/// Hàng đợi nhận dạng dùng chung giữa luồng VAD và luồng nhận dạng.
struct SharedQueue {
    state: Mutex<(AsrQueue, bool)>,
    ready: Condvar,
}

impl SharedQueue {
    fn new(queue: AsrQueue) -> Self {
        Self {
            state: Mutex::new((queue, false)),
            ready: Condvar::new(),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, (AsrQueue, bool)> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn push(&self, segment: PendingSegment) {
        let mut state = self.lock();
        if !state.1 {
            state.0.push(segment);
        }
        drop(state);
        self.ready.notify_one();
    }

    fn close(&self) {
        self.lock().1 = true;
        self.ready.notify_all();
    }

    /// Bỏ mọi đoạn đang chờ và đóng hàng (hết hạn mức). Trả số đoạn bị bỏ.
    fn clear(&self) -> usize {
        let mut state = self.lock();
        let mut n = 0;
        while state.0.pop(0).is_some() {
            n += 1;
        }
        state.1 = true;
        drop(state);
        self.ready.notify_all();
        n
    }

    /// Chờ đoạn kế tiếp; `None` khi đã đóng và hết đoạn.
    fn pop(&self, now_ms: &AtomicU64) -> Option<Popped> {
        let mut state = self.lock();
        loop {
            if let Some(p) = state.0.pop(now_ms.load(Ordering::SeqCst)) {
                return Some(p);
            }
            if state.1 {
                return None;
            }
            state = self.ready.wait(state).unwrap_or_else(|e| e.into_inner());
        }
    }
}

/// Cờ dùng chung giữa `Engine` và các luồng.
#[derive(Clone, Default)]
struct Flags {
    /// Luồng VAD ngừng đọc âm thanh.
    stop: Arc<AtomicBool>,
    /// Đã bấm Dừng: hạn `stop_grace_ms` bắt đầu.
    hurry: Arc<AtomicBool>,
    /// Hết hạn mức.
    quota: Arc<AtomicBool>,
}

pub struct Engine {
    flags: Flags,
    vad: Option<JoinHandle<()>>,
    /// Luồng nhận dạng và luồng dịch: chỉ `join` chờ chúng; `stop` thì không (xem đầu module).
    workers: Vec<JoinHandle<()>>,
    composer: Option<JoinHandle<SessionMetrics>>,
}

impl Engine {
    /// Chạy các luồng của một phiên. Luồng VAD (luồng duy nhất tự đọc âm thanh mãi) chạy sau cùng: nếu không tạo được
    /// một luồng, các luồng đã chạy thấy đầu vào của chúng đóng lại và tự kết thúc.
    pub fn start(
        cfg: EngineConfig,
        source: Box<dyn FrameSource>,
        vad: VadFactory,
        asr: Box<dyn Asr>,
        mt: Box<dyn Mt>,
        sink: Arc<dyn EventSink>,
    ) -> Result<Self> {
        let flags = Flags::default();
        let now_ms = Arc::new(AtomicU64::new(0));
        let queue = Arc::new(SharedQueue::new(AsrQueue::new(cfg.pipeline.queue.clone())));
        let (tx, rx) = mpsc::channel::<Msg>();
        let (jobs_tx, jobs_rx) = mpsc::channel::<MtJob>();
        let fail = |e: std::io::Error, flags: &Flags, queue: &SharedQueue| {
            flags.stop.store(true, Ordering::SeqCst);
            flags.hurry.store(true, Ordering::SeqCst);
            queue.close();
            anyhow::Error::from(e).context("không tạo được luồng của phiên dịch")
        };

        let mt_thread = {
            let (tx, mt_cfg, target, hurry) = (tx.clone(), cfg.pipeline.mt.clone(), cfg.target, flags.hurry.clone());
            std::thread::Builder::new()
                .name("mt".into())
                .spawn(move || {
                    let _guard = MtGuard(tx.clone());
                    mt_loop(mt, jobs_rx, &tx, &mt_cfg, target, &hurry)
                })
                .map_err(|e| fail(e, &flags, &queue))?
        };
        let asr_thread = {
            let (asr_queue, tx, now_ms) = (queue.clone(), tx.clone(), now_ms.clone());
            let (filter, languages) = (cfg.pipeline.filter.clone(), cfg.languages.clone());
            let max_prompt = cfg.pipeline.asr.max_prompt_tokens;
            std::thread::Builder::new()
                .name("asr".into())
                .spawn(move || {
                    let _guard = AsrGuard(tx.clone());
                    asr_loop(asr, &asr_queue, &tx, &now_ms, &filter, languages, max_prompt)
                })
                .map_err(|e| fail(e, &flags, &queue))?
        };
        let vad_pipeline = cfg.pipeline.clone();
        let composer = {
            let (composer_flags, asr_queue, sink) = (flags.clone(), queue.clone(), sink.clone());
            std::thread::Builder::new()
                .name("subtitles".into())
                .spawn(move || {
                    let _guard = ComposerGuard {
                        stop: composer_flags.stop.clone(),
                        sink: sink.clone(),
                    };
                    Composer::new(cfg, sink, jobs_tx, composer_flags, asr_queue).run(rx)
                })
                .map_err(|e| fail(e, &flags, &queue))?
        };
        let vad_thread = {
            let (stop, now_ms, queue2, sink) = (flags.stop.clone(), now_ms.clone(), queue.clone(), sink.clone());
            std::thread::Builder::new()
                .name("vad".into())
                .stack_size(VAD_STACK_BYTES)
                .spawn(move || {
                    let _guard = VadGuard {
                        queue: queue2.clone(),
                        sink: sink.clone(),
                    };
                    vad_loop(source, vad, &vad_pipeline, &queue2, &tx, &*sink, &now_ms, &stop)
                })
                .map_err(|e| fail(e, &flags, &queue))?
        };
        Ok(Self {
            flags,
            vad: Some(vad_thread),
            workers: vec![asr_thread, mt_thread],
            composer: Some(composer),
        })
    }

    /// Dừng phiên (bấm Dừng), xem đầu module. Trả về sau tối đa khoảng `mt.stop_grace_ms`. Trả số đo của phiên.
    pub fn stop(mut self) -> SessionMetrics {
        self.flags.hurry.store(true, Ordering::SeqCst);
        self.flags.stop.store(true, Ordering::SeqCst);
        let metrics = self.join_composer();
        self.workers.clear(); // không chờ: luồng nhận dạng và luồng dịch tự kết thúc
        metrics
    }

    /// Hết hạn mức (§6.8): bỏ hàng đợi, dịch xong câu đang dịch, rồi báo [`Fatal::QuotaExhausted`]. Không chặn.
    pub fn exhaust_quota(&self) {
        self.flags.quota.store(true, Ordering::SeqCst);
    }

    /// Chờ tới khi nguồn âm thanh tự hết và mọi đoạn đã xử lý xong (phát file WAV).
    pub fn join(mut self) -> SessionMetrics {
        let metrics = self.join_composer();
        for t in self.workers.drain(..) {
            let _ = t.join();
        }
        metrics
    }

    fn join_composer(&mut self) -> SessionMetrics {
        let metrics = match self.composer.take().map(JoinHandle::join) {
            Some(Ok(m)) => m,
            Some(Err(_)) => {
                log::error!("luồng phụ đề dừng bất thường");
                SessionMetrics::default()
            }
            None => SessionMetrics::default(),
        };
        // Luồng phụ đề đã thoát thì luồng VAD không còn ai nhận: dừng nó.
        self.flags.stop.store(true, Ordering::SeqCst);
        if let Some(vad) = self.vad.take() {
            let _ = vad.join();
        }
        metrics
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        if self.composer.is_some() {
            self.flags.hurry.store(true, Ordering::SeqCst);
            self.flags.stop.store(true, Ordering::SeqCst);
            self.join_composer();
        }
    }
}

/// Luồng VAD kết thúc (kể cả khi panic): đóng hàng đợi nhận dạng, để luồng nhận dạng không chờ mãi.
struct VadGuard {
    queue: Arc<SharedQueue>,
    sink: Arc<dyn EventSink>,
}

impl Drop for VadGuard {
    fn drop(&mut self) {
        self.queue.close();
        if std::thread::panicking() {
            self.sink.fatal(Fatal::Vad, "luồng VAD dừng bất thường");
        }
    }
}

/// Luồng nhận dạng kết thúc (kể cả khi panic): báo luồng phụ đề.
struct AsrGuard(Sender<Msg>);

impl Drop for AsrGuard {
    fn drop(&mut self) {
        if std::thread::panicking() {
            let _ = self.0.send(Msg::Asr(AsrOutcome::Unavailable(
                "luồng nhận dạng dừng bất thường".into(),
            )));
        }
        let _ = self.0.send(Msg::AsrDone);
    }
}

/// Luồng dịch panic: báo luồng phụ đề, để câu đang dịch không chờ mãi.
struct MtGuard(Sender<Msg>);

impl Drop for MtGuard {
    fn drop(&mut self) {
        if std::thread::panicking() {
            let _ = self.0.send(Msg::MtGone);
        }
    }
}

/// Luồng phụ đề panic: dừng luồng VAD và báo app.
struct ComposerGuard {
    stop: Arc<AtomicBool>,
    sink: Arc<dyn EventSink>,
}

impl Drop for ComposerGuard {
    fn drop(&mut self) {
        if std::thread::panicking() {
            self.stop.store(true, Ordering::SeqCst);
            self.sink.fatal(Fatal::Internal, "luồng phụ đề dừng bất thường");
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn vad_loop(
    mut source: Box<dyn FrameSource>,
    vad: VadFactory,
    cfg: &PipelineConfig,
    queue: &SharedQueue,
    tx: &Sender<Msg>,
    sink: &dyn EventSink,
    now_ms: &AtomicU64,
    stop: &AtomicBool,
) {
    let mut vad = match vad() {
        Ok(v) => v,
        Err(e) => {
            log::error!("không nạp được VAD: {e:#}");
            sink.fatal(Fatal::Vad, &format!("không nạp được VAD: {e:#}"));
            return;
        }
    };
    let mut segmenter = Segmenter::new(cfg.segmenter.clone());
    let mut silence = SilenceMonitor::new(cfg.audio.clone());
    let level_frames = (cfg.audio.level_interval_ms / FRAME_MS).max(1);
    let (mut buf, mut frames, mut no_audio) = (Vec::new(), 0u64, false);
    let mut level_sum = 0.0f32;
    let send_segment = |seg: crate::segmenter::Segment, closed_ms: u64| {
        let _ = tx.send(Msg::Queued {
            id: seg.id,
            start_ms: seg.start_ms,
            end_ms: seg.end_ms,
            closed_ms,
        });
        queue.push(PendingSegment::from(seg));
    };
    'outer: while !stop.load(Ordering::SeqCst) {
        match source.read(&mut buf, Duration::from_millis(20)) {
            Ok(true) => {}
            Ok(false) => break,
            Err(e) => {
                log::error!("nguồn âm thanh lỗi: {e:#}");
                sink.fatal(Fatal::Audio, &format!("nguồn âm thanh lỗi: {e:#}"));
                break;
            }
        }
        let mut consumed = 0;
        while buf.len() - consumed >= FRAME_SAMPLES {
            let frame = &buf[consumed..consumed + FRAME_SAMPLES];
            consumed += FRAME_SAMPLES;
            frames += 1;
            let now = frames * FRAME_MS;
            now_ms.store(now, Ordering::SeqCst);
            let frame_rms = rms(frame);
            level_sum += frame_rms;
            if frames.is_multiple_of(level_frames) {
                sink.level(level_sum / level_frames as f32);
                level_sum = 0.0;
            }
            let silent = silence.push(frame_rms, FRAME_MS);
            if silent != no_audio {
                no_audio = silent;
                let _ = tx.send(Msg::NoAudio(silent));
            }
            let prob = match vad.prob(frame) {
                Ok(p) => p,
                Err(e) => {
                    log::error!("VAD lỗi: {e:#}");
                    sink.fatal(Fatal::Vad, &format!("VAD lỗi: {e:#}"));
                    break 'outer;
                }
            };
            for seg in segmenter.push(frame, prob) {
                send_segment(seg, now);
            }
            if frames.is_multiple_of(CLOCK_EVERY_FRAMES) {
                let _ = tx.send(Msg::Clock {
                    now_ms: now,
                    speech_since: segmenter.open_start_ms(),
                });
            }
        }
        buf.drain(..consumed);
    }
    if let Some(seg) = segmenter.flush() {
        send_segment(seg, frames * FRAME_MS);
    }
    let _ = tx.send(Msg::Clock {
        now_ms: frames * FRAME_MS,
        speech_since: None,
    });
}

fn asr_loop(
    mut asr: Box<dyn Asr>,
    queue: &SharedQueue,
    tx: &Sender<Msg>,
    now_ms: &AtomicU64,
    filter: &FilterConfig,
    languages: Vec<String>,
    max_prompt_tokens: usize,
) {
    let mut history = PromptHistory::new(max_prompt_tokens);
    // Ngôn ngữ của đoạn được giữ lại gần nhất (§6.4). Khóa ngôn ngữ thì luôn là ngôn ngữ đó.
    let mut prev_lang = (languages.len() == 1).then(|| languages[0].clone());
    while let Some(popped) = queue.pop(now_ms) {
        let segment = match popped {
            Popped::Segment(s) => s,
            Popped::Dropped(s) => {
                let _ = tx.send(Msg::Asr(AsrOutcome::Dropped {
                    ids: s.ids,
                    start_ms: s.start_ms,
                    end_ms: s.end_ms,
                }));
                continue;
            }
        };
        if pcm_skip(segment.samples.len()).is_some() {
            let _ = tx.send(Msg::Asr(AsrOutcome::Filtered { ids: segment.ids }));
            continue;
        }
        let pcm: Vec<i16> = segment
            .samples
            .iter()
            .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .collect();
        let req = TranscribeRequest {
            segment_id: segment.ids[0],
            audio_ctx: audio_ctx_for_samples(pcm.len()),
            prompt_tokens: history.prompt_for(prev_lang.as_deref(), pcm.len()),
            pcm,
            languages: languages.clone(),
            prev_lang: prev_lang.clone(),
        };
        let outcome = match asr.transcribe(req) {
            Ok(r) => {
                let text = display_text(&r.lang, &r.text, filter);
                let evidence = Evidence {
                    no_speech_prob: r.no_speech_prob,
                    avg_logprob: r.avg_logprob,
                    vad_mean_prob: segment.mean_prob,
                    speech_ms: segment.speech_ms,
                };
                match verdict(&evidence, &text, filter) {
                    Verdict::Speech => {
                        history.push(&r.lang, &r.tokens);
                        prev_lang = Some(r.lang.clone());
                        AsrOutcome::Transcribed {
                            ids: segment.ids,
                            start_ms: segment.start_ms,
                            end_ms: segment.end_ms,
                            speech_ms: segment.speech_ms,
                            lang: r.lang,
                            text,
                            asr_ms: r.asr_ms + r.lid_ms,
                        }
                    }
                    Verdict::NoSpeech | Verdict::Hallucination | Verdict::Repetition | Verdict::Filler => {
                        AsrOutcome::Filtered { ids: segment.ids }
                    }
                }
            }
            Err(AsrFailure::Dropped(reason)) => {
                log::warn!("bỏ đoạn {:?}: {reason}", segment.ids);
                AsrOutcome::Dropped {
                    ids: segment.ids,
                    start_ms: segment.start_ms,
                    end_ms: segment.end_ms,
                }
            }
            Err(AsrFailure::Unavailable(reason)) => {
                let _ = tx.send(Msg::Asr(AsrOutcome::Unavailable(reason)));
                break;
            }
        };
        let _ = tx.send(Msg::Asr(outcome));
    }
}

fn mt_loop(
    mut mt: Box<dyn Mt>,
    jobs: Receiver<MtJob>,
    tx: &Sender<Msg>,
    cfg: &MtConfig,
    target: Lang,
    hurry: &AtomicBool,
) {
    // Làm nóng khi bắt đầu phiên (§6.5); lỗi ở đây không quan trọng, request thật sẽ báo lỗi của nó. Bấm Dừng thì bỏ
    // ngang lần làm nóng.
    let warmup = translation_prompt("Hello.", Lang::En, target);
    let req = crate::llama::ChatRequest {
        prompt: &warmup,
        max_tokens: 32,
        repeat_penalty: cfg.repeat_penalty,
    };
    if !hurry.load(Ordering::SeqCst)
        && let Err(e) = mt.stream(&req, &mut |_| {
            if hurry.load(Ordering::SeqCst) {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        })
    {
        log::warn!("làm nóng llama-server lỗi: {e}");
    }
    for job in jobs {
        let (sub_id, version) = (job.sub_id, job.version);
        let request = Job {
            text: &job.text,
            src: job.src,
            tgt: target,
            context: job.context.as_deref(),
        };
        let outcome = translate(&mut *mt, &request, cfg, &mut |event| {
            if job.cancel.load(Ordering::SeqCst) {
                return ControlFlow::Break(());
            }
            let msg = match event {
                Event::Delta(text) => Msg::MtDelta {
                    sub_id,
                    version,
                    text: text.to_string(),
                },
                Event::Retry => Msg::MtRetry { sub_id, version },
            };
            match tx.send(msg) {
                Ok(()) => ControlFlow::Continue(()),
                Err(_) => ControlFlow::Break(()),
            }
        });
        let _ = tx.send(Msg::MtDone {
            sub_id,
            version,
            outcome,
        });
    }
}

struct SubState {
    sub: Subtitle,
    version: u32,
    /// Câu đã chốt (không còn là câu đang mở).
    closed: bool,
    /// Tiếng nói của câu (không gồm đệm), và phần đã được tính cho hạn mức.
    speech_ms: u64,
    counted_ms: u64,
    /// Ngữ cảnh chụp lúc mở câu (cờ `translationContext`).
    context: Option<String>,
}

struct InFlight {
    sub_id: u64,
    version: u32,
    cancel: Arc<AtomicBool>,
}

struct Composer {
    cfg: EngineConfig,
    sink: Arc<dyn EventSink>,
    jobs: Option<Sender<MtJob>>,
    flags: Flags,
    asr_queue: Arc<SharedQueue>,
    window_ms: u64,
    stop_grace: Duration,
    now_ms: u64,
    speech_since: Option<u64>,
    /// Đoạn đã chốt ở VAD, chưa có kết quả nhận dạng: id → (start_ms, end_ms).
    pending: BTreeMap<u64, (u64, u64)>,
    open: Option<(OpenSentence, u64)>,
    subs: HashMap<u64, SubState>,
    queue: MtQueue,
    in_flight: Option<InFlight>,
    mt_unavailable: bool,
    indicators: Indicators,
    /// Câu gốc đã chốt gần nhất theo ngôn ngữ, cho cờ ngữ cảnh.
    previous: HashMap<String, String>,
    metrics: SessionMetrics,
    asr_done: bool,
    /// Lúc bấm Dừng (giờ thật), hoặc lúc chạm hạn mức.
    hurry_since: Option<Instant>,
    quota_hit: bool,
    /// Hết hạn dừng: luồng phụ đề thoát ngay, không chờ luồng nhận dạng hay luồng dịch.
    abandoned: bool,
}

impl Composer {
    fn new(
        cfg: EngineConfig,
        sink: Arc<dyn EventSink>,
        jobs: Sender<MtJob>,
        flags: Flags,
        asr_queue: Arc<SharedQueue>,
    ) -> Self {
        let window_ms = merge_window_ms(cfg.pipeline.segmenter.end_silence_ms, &cfg.pipeline.merge);
        let queue = MtQueue::new(cfg.pipeline.queue.clone());
        let stop_grace = Duration::from_millis(cfg.pipeline.mt.stop_grace_ms);
        Self {
            cfg,
            sink,
            jobs: Some(jobs),
            flags,
            asr_queue,
            window_ms,
            stop_grace,
            now_ms: 0,
            speech_since: None,
            pending: BTreeMap::new(),
            open: None,
            subs: HashMap::new(),
            queue,
            in_flight: None,
            mt_unavailable: false,
            indicators: Indicators::default(),
            previous: HashMap::new(),
            metrics: SessionMetrics::default(),
            asr_done: false,
            hurry_since: None,
            quota_hit: false,
            abandoned: false,
        }
    }

    fn run(mut self, rx: Receiver<Msg>) -> SessionMetrics {
        loop {
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(msg) => self.handle(msg),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            if self.step() {
                break;
            }
        }
        self.finish()
    }

    /// Xét cờ dừng và hạn mức, gửi câu kế tiếp đi dịch. Trả `true` khi luồng phụ đề phải thoát.
    fn step(&mut self) -> bool {
        self.check_flags();
        self.dispatch();
        self.abandoned
            || (self.asr_done && self.in_flight.is_none() && self.queue.is_empty())
            || (self.quota_hit && self.in_flight.is_none())
    }

    fn finish(mut self) -> SessionMetrics {
        self.finish_open();
        drop(self.jobs.take()); // luồng dịch thoát
        if self.quota_hit {
            self.sink.fatal(Fatal::QuotaExhausted, "đã dùng hết hạn mức");
        }
        log::info!("phiên dịch kết thúc: {}", self.metrics.summary());
        self.metrics
    }

    fn handle(&mut self, msg: Msg) {
        match msg {
            Msg::Queued {
                id,
                start_ms,
                end_ms,
                closed_ms,
            } => {
                self.metrics.segments += 1;
                self.metrics.vad_ms.push(closed_ms.saturating_sub(end_ms) as f32);
                self.pending.insert(id, (start_ms, end_ms));
            }
            Msg::Clock { now_ms, speech_since } => {
                self.now_ms = now_ms;
                self.speech_since = speech_since;
                self.close_open_after_window();
                self.update_lag();
            }
            Msg::NoAudio(no_audio) => {
                self.indicators.no_audio = no_audio;
                self.sink.indicators(&self.indicators);
            }
            Msg::Asr(outcome) => self.on_asr(outcome),
            Msg::AsrDone => {
                self.asr_done = true;
                self.finish_open();
            }
            Msg::MtDelta { sub_id, version, text } => {
                if self.is_current(sub_id, version)
                    && let Some(state) = self.subs.get_mut(&sub_id)
                {
                    state.sub.tgt_text.push_str(&text);
                    self.sink.delta(&Delta { id: sub_id, text });
                }
            }
            Msg::MtRetry { sub_id, version } => {
                if self.is_current(sub_id, version)
                    && let Some(state) = self.subs.get_mut(&sub_id)
                {
                    state.sub.tgt_text.clear();
                    self.sink.subtitle(&state.sub);
                }
            }
            Msg::MtDone {
                sub_id,
                version,
                outcome,
            } => self.on_mt_done(sub_id, version, outcome),
            Msg::MtGone => {
                log::error!("luồng dịch dừng bất thường");
                self.jobs = None;
                self.set_mt_unavailable();
                if let Some(f) = self.in_flight.take() {
                    self.settle(f.sub_id, Status::Failed, String::new());
                }
            }
        }
    }

    /// Tin nhắn của luồng dịch thuộc đúng câu đang dịch, và câu chưa đổi từ lúc gửi dịch.
    fn is_current(&self, sub_id: u64, version: u32) -> bool {
        self.in_flight
            .as_ref()
            .is_some_and(|f| f.sub_id == sub_id && f.version == version)
            && self.subs.get(&sub_id).is_some_and(|s| s.version == version)
    }

    fn on_asr(&mut self, outcome: AsrOutcome) {
        if self.quota_hit {
            // Hết hạn mức: đoạn chép lời xong muộn không còn được hiện hay dịch.
            if let AsrOutcome::Transcribed { ids, .. }
            | AsrOutcome::Filtered { ids }
            | AsrOutcome::Dropped { ids, .. } = &outcome
            {
                for id in ids {
                    self.pending.remove(id);
                }
            }
            return;
        }
        match outcome {
            AsrOutcome::Transcribed {
                ids,
                start_ms,
                end_ms,
                speech_ms,
                lang,
                text,
                asr_ms,
            } => {
                for id in &ids {
                    self.pending.remove(id);
                }
                self.metrics.asr_ms.push(asr_ms);
                let piece = Piece {
                    start_ms,
                    end_ms,
                    lang: &lang,
                    text: &text,
                };
                if lang == self.cfg.target.code() {
                    self.finish_open();
                    self.metrics.same_lang += 1;
                    let sub = Subtitle {
                        id: self.cfg.id_base + ids[0],
                        start_ms,
                        end_ms,
                        src_lang: lang.clone(),
                        src_text: text.clone(),
                        tgt_text: String::new(),
                        status: Status::SameLang,
                        provisional: false,
                        replaces: Vec::new(),
                    };
                    self.sink.subtitle(&sub);
                    return;
                }
                let window = self.window_ms;
                if let Some((open, sub_id)) = self.open.as_mut().filter(|(o, _)| o.accepts(&piece, window)) {
                    open.push(&piece);
                    let (sub_id, closed, joined) = (*sub_id, open.is_closed(), open.text().to_string());
                    self.metrics.merges += 1;
                    self.grow(sub_id, &joined, end_ms, speech_ms, closed);
                    if closed {
                        self.finish_open();
                    }
                } else {
                    self.finish_open();
                    let open = OpenSentence::new(&piece, &self.cfg.pipeline.merge);
                    let sub_id = self.cfg.id_base + ids[0];
                    let closed = open.is_closed();
                    let sub = Subtitle {
                        id: sub_id,
                        start_ms,
                        end_ms,
                        src_lang: lang.clone(),
                        src_text: text.clone(),
                        tgt_text: String::new(),
                        status: Status::AsrDone,
                        provisional: !closed,
                        replaces: Vec::new(),
                    };
                    self.sink.subtitle(&sub);
                    // Ngữ cảnh là câu chốt trước câu này, chụp ngay lúc mở câu (§6.5).
                    let context = self
                        .cfg
                        .translation_context
                        .then(|| self.previous.get(&lang).cloned())
                        .flatten();
                    self.subs.insert(
                        sub_id,
                        SubState {
                            sub,
                            version: 1,
                            closed,
                            speech_ms,
                            counted_ms: 0,
                            context,
                        },
                    );
                    self.enqueue(sub_id, 1, false);
                    if closed {
                        self.remember_previous(&lang, &text);
                    } else {
                        self.open = Some((open, sub_id));
                    }
                }
            }
            AsrOutcome::Filtered { ids } => {
                self.metrics.filtered += 1;
                for id in &ids {
                    self.pending.remove(id);
                }
            }
            AsrOutcome::Dropped { ids, start_ms, end_ms } => {
                self.metrics.dropped += 1;
                for id in &ids {
                    self.pending.remove(id);
                }
                // Mất âm thanh giữa chừng thì không ghép câu qua chỗ đó.
                self.finish_open();
                self.sink.subtitle(&Subtitle {
                    id: self.cfg.id_base + ids[0],
                    start_ms,
                    end_ms,
                    src_lang: String::new(),
                    src_text: String::new(),
                    tgt_text: String::new(),
                    status: Status::Dropped,
                    provisional: false,
                    replaces: Vec::new(),
                });
            }
            AsrOutcome::Unavailable(reason) => {
                log::error!("asr-worker không dùng được: {reason}");
                self.sink.fatal(Fatal::Asr, &reason);
            }
        }
    }

    /// Câu đang mở vừa được ghép thêm một đoạn: gửi lại phụ đề (tạm), và dịch lại cả câu.
    fn grow(&mut self, sub_id: u64, text: &str, end_ms: u64, speech_ms: u64, closed: bool) {
        let Some(state) = self.subs.get_mut(&sub_id) else {
            return;
        };
        state.version += 1;
        state.closed = closed;
        state.speech_ms += speech_ms;
        state.sub.src_text = text.to_string();
        state.sub.end_ms = end_ms;
        state.sub.tgt_text.clear();
        state.sub.status = Status::AsrDone;
        state.sub.provisional = !closed;
        let version = state.version;
        self.sink.subtitle(&state.sub);
        let in_flight = self.in_flight.as_ref().is_some_and(|f| f.sub_id == sub_id);
        if in_flight {
            // Bản dịch của câu cũ không còn đúng: hủy, đưa câu mới lên đầu hàng. Câu đã ghép thêm một lần trong lúc bản cũ
            // còn đang dịch thì đã có trong hàng: chỉ cập nhật mục đó, không thêm mục thứ hai.
            if let Some(f) = &self.in_flight {
                f.cancel.store(true, Ordering::SeqCst);
            }
            let total = state.speech_ms;
            if !self.queue.update(sub_id, text, end_ms, total, version) {
                self.enqueue(sub_id, version, true);
            }
        } else {
            let total = state.speech_ms;
            if !self.queue.update(sub_id, text, end_ms, total, version) {
                self.enqueue(sub_id, version, false);
            }
        }
    }

    fn enqueue(&mut self, sub_id: u64, version: u32, front: bool) {
        let Some(state) = self.subs.get(&sub_id) else { return };
        let item = MtItem {
            sub_id,
            version,
            lang: state.sub.src_lang.clone(),
            text: state.sub.src_text.clone(),
            start_ms: state.sub.start_ms,
            end_ms: state.sub.end_ms,
            speech_ms: state.speech_ms,
            context: state.context.clone(),
            enqueued_ms: self.now_ms,
            open: !state.closed,
            replaces: state.sub.replaces.clone(),
        };
        if front {
            self.queue.push_front(item);
            return;
        }
        for merged in self.queue.push(item) {
            let mut counted = 0;
            for id in &merged.replaces {
                if let Some(absorbed) = self.subs.remove(id) {
                    counted += absorbed.counted_ms;
                }
            }
            if let Some(state) = self.subs.get_mut(&merged.sub_id) {
                state.version = merged.version;
                state.speech_ms = merged.speech_ms;
                state.counted_ms += counted;
                state.sub.src_text = merged.text.clone();
                state.sub.end_ms = merged.end_ms;
                state.sub.replaces = merged.replaces.clone();
                self.sink.subtitle(&state.sub);
            }
        }
    }

    /// Chốt câu đang mở: không còn là phụ đề tạm.
    fn finish_open(&mut self) {
        let Some((open, sub_id)) = self.open.take() else { return };
        self.queue.close(sub_id);
        self.remember_previous(open.lang(), open.text());
        if let Some(state) = self.subs.get_mut(&sub_id) {
            state.closed = true;
            if state.sub.provisional {
                state.sub.provisional = false;
                self.sink.subtitle(&state.sub);
            }
            if matches!(state.sub.status, Status::Done | Status::Failed | Status::Skipped) {
                self.subs.remove(&sub_id);
            }
        }
    }

    fn remember_previous(&mut self, lang: &str, text: &str) {
        self.previous.insert(lang.to_string(), text.to_string());
    }

    /// Hết cửa sổ ghép mà không có tiếng nói mới thì chốt câu đang mở (§6.3).
    fn close_open_after_window(&mut self) {
        let Some((open, _)) = &self.open else { return };
        let deadline = open.last_end_ms() + self.window_ms;
        let speech_inside = self.speech_since.is_some_and(|s| s <= deadline)
            || self.pending.values().any(|&(start, _)| start <= deadline);
        if self.now_ms > deadline && !speech_inside {
            self.finish_open();
        }
    }

    /// Độ trễ = giờ hiện tại trừ `end_ms` của đoạn cũ nhất còn đang xử lý (§7).
    fn update_lag(&mut self) {
        let oldest = self
            .pending
            .values()
            .map(|&(_, end)| end)
            .chain(self.queue.iter().map(|i| i.end_ms))
            .chain(
                self.in_flight
                    .as_ref()
                    .and_then(|f| self.subs.get(&f.sub_id))
                    .map(|s| s.sub.end_ms),
            )
            .min();
        let lagging = oldest.is_some_and(|end| self.now_ms.saturating_sub(end) > self.cfg.pipeline.queue.lag_warn_ms);
        if lagging != self.indicators.lagging {
            self.indicators.lagging = lagging;
            self.sink.indicators(&self.indicators);
        }
    }

    fn set_mt_unavailable(&mut self) {
        self.mt_unavailable = true;
        if !self.indicators.translation_unavailable {
            self.indicators.translation_unavailable = true;
            self.sink.indicators(&self.indicators);
        }
    }

    /// Xét cờ của `Engine`: hết hạn mức, đã bấm Dừng, đã hết hạn dừng.
    fn check_flags(&mut self) {
        if self.flags.quota.load(Ordering::SeqCst) && !self.quota_hit {
            self.hit_quota();
        }
        if self.flags.hurry.load(Ordering::SeqCst) && self.hurry_since.is_none() {
            self.hurry_since = Some(Instant::now());
        }
        if self.hurry_since.is_some_and(|t| t.elapsed() >= self.stop_grace) && !self.abandoned {
            self.abandon();
        }
    }

    /// Chạm hạn mức (§6.8): dừng thu, bỏ đoạn chờ nhận dạng và câu chờ dịch, chỉ dịch xong câu đang dịch.
    fn hit_quota(&mut self) {
        log::info!("chạm hạn mức: dừng phiên");
        self.quota_hit = true;
        self.flags.stop.store(true, Ordering::SeqCst);
        self.asr_queue.clear();
        self.pending.clear();
        self.finish_open();
        while let Some(Ready::Translate(item) | Ready::Skip(item)) = self.queue.pop(self.now_ms) {
            self.settle(item.sub_id, Status::Skipped, String::new());
        }
        if self.hurry_since.is_none() {
            self.hurry_since = Some(Instant::now());
        }
    }

    /// Hết hạn dừng: câu đang dịch và câu chờ dịch thành `skipped`; luồng phụ đề thoát.
    fn abandon(&mut self) {
        self.abandoned = true;
        if let Some(f) = self.in_flight.take() {
            f.cancel.store(true, Ordering::SeqCst);
            self.settle(f.sub_id, Status::Skipped, String::new());
        }
        while let Some(Ready::Translate(item) | Ready::Skip(item)) = self.queue.pop(self.now_ms) {
            self.settle(item.sub_id, Status::Skipped, String::new());
        }
    }

    fn dispatch(&mut self) {
        while self.in_flight.is_none() && !self.quota_hit && !self.abandoned {
            let item = match self.queue.pop(self.now_ms) {
                None => return,
                Some(Ready::Translate(item)) if !self.mt_unavailable => item,
                Some(Ready::Translate(item)) => {
                    self.settle(item.sub_id, Status::Failed, String::new());
                    continue;
                }
                Some(Ready::Skip(item)) => {
                    self.settle(item.sub_id, Status::Skipped, String::new());
                    continue;
                }
            };
            let Some(state) = self.subs.get_mut(&item.sub_id) else {
                continue;
            };
            if state.version != item.version {
                continue; // mục cũ của một câu đã được ghép thêm: bản mới nằm ở mục khác của hàng
            }
            state.sub.status = Status::Translating;
            state.sub.tgt_text.clear();
            self.sink.subtitle(&state.sub);
            let cancel = Arc::new(AtomicBool::new(false));
            let job = MtJob {
                sub_id: item.sub_id,
                version: item.version,
                src: Lang::from_code(&item.lang).unwrap_or(Lang::En),
                text: item.text,
                context: item.context,
                cancel: cancel.clone(),
            };
            self.in_flight = Some(InFlight {
                sub_id: item.sub_id,
                version: item.version,
                cancel,
            });
            let sent = self.jobs.as_ref().is_some_and(|j| j.send(job).is_ok());
            if !sent {
                self.in_flight = None;
                self.set_mt_unavailable();
                self.settle(item.sub_id, Status::Failed, String::new());
            }
        }
    }

    fn on_mt_done(&mut self, sub_id: u64, version: u32, outcome: Outcome) {
        let ours = self
            .in_flight
            .as_ref()
            .is_some_and(|f| f.sub_id == sub_id && f.version == version);
        if !ours {
            return;
        }
        self.in_flight = None;
        if !self.subs.get(&sub_id).is_some_and(|s| s.version == version) {
            return; // câu đã được ghép thêm hay gộp: bản mới đang chờ dịch
        }
        match outcome {
            Outcome::Done(t) => {
                self.metrics.translated += 1;
                self.metrics.mt_ms.push(t.total_ms);
                self.settle(sub_id, Status::Done, t.text);
            }
            Outcome::Failed { reason, .. } => {
                log::warn!("dịch lỗi câu {sub_id}: {reason}");
                self.settle(sub_id, Status::Failed, String::new());
            }
            Outcome::Cancelled => self.settle(sub_id, Status::Skipped, String::new()),
            Outcome::Unavailable(reason) => {
                log::error!("llama-server không dùng được: {reason}");
                self.set_mt_unavailable();
                self.settle(sub_id, Status::Failed, String::new());
            }
        }
    }

    /// Kết thúc phần dịch của một phụ đề. `Done` thì đếm phút cho hạn mức (§6.8).
    fn settle(&mut self, sub_id: u64, status: Status, tgt_text: String) {
        let Some(state) = self.subs.get_mut(&sub_id) else {
            return;
        };
        let mut usage = None;
        match status {
            Status::Failed => self.metrics.failed += 1,
            Status::Skipped => self.metrics.skipped += 1,
            Status::Done => {
                self.metrics
                    .latency_ms
                    .push(self.now_ms.saturating_sub(state.sub.end_ms) as f32);
                let new_ms = state.speech_ms.saturating_sub(state.counted_ms);
                state.counted_ms = state.speech_ms;
                if new_ms > 0 {
                    self.metrics.translated_speech_ms += new_ms;
                    usage = Some(Usage {
                        sub_id,
                        speech_ms: new_ms,
                    });
                }
            }
            _ => {}
        }
        state.sub.status = status;
        state.sub.tgt_text = tgt_text;
        self.sink.subtitle(&state.sub);
        if state.closed {
            self.subs.remove(&sub_id);
        }
        if let Some(usage) = usage
            && self.sink.usage(&usage).is_break()
            && !self.quota_hit
        {
            self.hit_quota();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llama::{ChatRequest, StreamEnd};
    use crate::translate::{MtError, Translated};
    use asr_protocol::TranscribeResult;

    #[test]
    fn silence_is_reported_after_60_seconds() {
        let mut m = SilenceMonitor::new(AudioConfig::default());
        let frames_per_minute = 60_000 / FRAME_MS; // 1 875 khung
        for _ in 1..frames_per_minute {
            assert!(!m.push(0.0, FRAME_MS));
        }
        assert!(m.push(0.0, FRAME_MS), "khung thứ 1 875: đủ 60 giây im lặng");
        assert!(!m.push(0.1, FRAME_MS), "có âm thanh thì hết báo");
    }

    #[test]
    fn inserted_silence_counts_as_silence_but_quiet_speech_does_not() {
        let mut m = SilenceMonitor::new(AudioConfig {
            no_audio_after_ms: 64,
            ..AudioConfig::default()
        });
        assert!(!m.push(0.000_1, FRAME_MS));
        assert!(m.push(0.0, FRAME_MS));
        assert!(!m.push(0.001, FRAME_MS), "RMS 0,001 (khoảng −60 dBFS) vẫn là âm thanh");
    }

    #[test]
    fn energy_vad_and_sample_source() {
        let mut vad = EnergyVad { threshold_rms: 0.01 };
        assert_eq!(vad.prob(&[0.0; FRAME_SAMPLES]).unwrap(), 0.0);
        assert_eq!(vad.prob(&[0.2; FRAME_SAMPLES]).unwrap(), 0.9);
        let mut src = SampleSource::new(vec![0.5; 1_000], 400, Duration::ZERO);
        let mut out = Vec::new();
        while src.read(&mut out, Duration::ZERO).unwrap() {}
        assert_eq!(out.len(), 1_000);
    }

    // ---- Luồng phụ đề, nạp thẳng tin nhắn (Q2 của review 02b): tất định, không luồng, không tiến trình phụ. ----

    #[derive(Default)]
    struct Sink {
        subs: Mutex<Vec<Subtitle>>,
        indicators: Mutex<Vec<Indicators>>,
        fatal: Mutex<Vec<(Fatal, String)>>,
        usage: Mutex<Vec<Usage>>,
        /// Hạn mức (ms): tổng `usage` chạm số này thì trả `Break`.
        limit_ms: Option<u64>,
    }

    impl EventSink for Sink {
        fn subtitle(&self, s: &Subtitle) {
            self.subs.lock().unwrap().push(s.clone());
        }
        fn delta(&self, _: &Delta) {}
        fn level(&self, _: f32) {}
        fn indicators(&self, i: &Indicators) {
            self.indicators.lock().unwrap().push(i.clone());
        }
        fn fatal(&self, kind: Fatal, reason: &str) {
            self.fatal.lock().unwrap().push((kind, reason.to_string()));
        }
        fn usage(&self, u: &Usage) -> ControlFlow<()> {
            let mut all = self.usage.lock().unwrap();
            all.push(*u);
            let total: u64 = all.iter().map(|u| u.speech_ms).sum();
            match self.limit_ms {
                Some(limit) if total >= limit => ControlFlow::Break(()),
                _ => ControlFlow::Continue(()),
            }
        }
    }

    impl Sink {
        fn kinds(&self) -> Vec<Fatal> {
            self.fatal.lock().unwrap().iter().map(|(k, _)| *k).collect()
        }

        fn usage(&self) -> Vec<(u64, u64)> {
            self.usage
                .lock()
                .unwrap()
                .iter()
                .map(|u| (u.sub_id, u.speech_ms))
                .collect()
        }
    }

    struct Harness {
        c: Composer,
        jobs: Receiver<MtJob>,
        sink: Arc<Sink>,
        flags: Flags,
        asr_queue: Arc<SharedQueue>,
    }

    fn cfg() -> EngineConfig {
        EngineConfig {
            pipeline: PipelineConfig::default(),
            languages: vec!["en".into(), "vi".into()],
            target: Lang::Vi,
            translation_context: false,
            id_base: 0,
        }
    }

    fn harness_with(cfg: EngineConfig, sink: Sink) -> Harness {
        let sink = Arc::new(sink);
        let (jobs_tx, jobs) = mpsc::channel();
        let flags = Flags::default();
        let asr_queue = Arc::new(SharedQueue::new(AsrQueue::new(cfg.pipeline.queue.clone())));
        let c = Composer::new(cfg, sink.clone(), jobs_tx, flags.clone(), asr_queue.clone());
        Harness {
            c,
            jobs,
            sink,
            flags,
            asr_queue,
        }
    }

    fn harness() -> Harness {
        harness_with(cfg(), Sink::default())
    }

    fn done(text: &str) -> Outcome {
        Outcome::Done(Translated {
            text: text.into(),
            attempts: 1,
            source_tokens: 1,
            completion_tokens: Some(1),
            first_delta_ms: None,
            total_ms: 1.0,
        })
    }

    impl Harness {
        /// Nạp một tin nhắn như vòng lặp của luồng phụ đề; trả `true` khi luồng phụ đề sẽ thoát.
        fn feed(&mut self, msg: Msg) -> bool {
            self.c.handle(msg);
            self.c.step()
        }

        /// Đoạn `id` vừa chép lời xong; tiếng nói đúng bằng `start..end`.
        fn said(&mut self, id: u64, start_ms: u64, end_ms: u64, lang: &str, text: &str) -> bool {
            self.feed(Msg::Asr(AsrOutcome::Transcribed {
                ids: vec![id],
                start_ms,
                end_ms,
                speech_ms: end_ms - start_ms,
                lang: lang.into(),
                text: text.into(),
                asr_ms: 1.0,
            }))
        }

        fn job(&self) -> MtJob {
            self.jobs.try_recv().expect("phải có câu được gửi đi dịch")
        }

        fn no_job(&self) {
            assert!(self.jobs.try_recv().is_err(), "không được gửi thêm câu nào đi dịch");
        }

        fn finish(&mut self, job: &MtJob, outcome: Outcome) -> bool {
            self.feed(Msg::MtDone {
                sub_id: job.sub_id,
                version: job.version,
                outcome,
            })
        }

        fn last(&self, id: u64) -> Subtitle {
            self.sink
                .subs
                .lock()
                .unwrap()
                .iter()
                .rev()
                .find(|s| s.id == id)
                .cloned()
                .expect("phụ đề phải có")
        }

        fn statuses(&self, id: u64) -> Vec<Status> {
            let subs = self.sink.subs.lock().unwrap();
            let mut out: Vec<Status> = Vec::new();
            for s in subs.iter().filter(|s| s.id == id) {
                if out.last() != Some(&s.status) {
                    out.push(s.status);
                }
            }
            out
        }
    }

    /// Q1 của review 02b: ngữ cảnh là câu chốt ngay trước câu đó, chụp lúc mở câu; không phải câu mới nhất lúc gửi dịch.
    #[test]
    fn the_context_is_the_sentence_before_captured_when_it_opens() {
        let mut h = harness_with(
            EngineConfig {
                translation_context: true,
                ..cfg()
            },
            Sink::default(),
        );
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        assert_eq!(j1.context, None);
        h.said(2, 2_000, 3_000, "en", "Two.");
        h.said(3, 4_000, 5_000, "en", "Three.");
        h.said(4, 6_000, 7_000, "vi", "Xin chào."); // ngôn ngữ khác không đổi ngữ cảnh của tiếng Anh
        h.finish(&j1, done("Một."));
        let j2 = h.job();
        assert_eq!((j2.text.as_str(), j2.context.as_deref()), ("Two.", Some("One.")));
        h.finish(&j2, done("Hai."));
        assert_eq!(h.job().context.as_deref(), Some("Two."));
    }

    /// Hàng đợi dịch đầy: các câu chờ cùng ngôn ngữ gộp thành một phụ đề (`replaces`), tiếng nói cộng lại (§7).
    #[test]
    fn a_full_translation_queue_merges_the_waiting_subtitles() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        for (id, text) in [(2, "Two."), (3, "Three."), (4, "Four.")] {
            h.said(id, id * 2_000, id * 2_000 + 1_000, "en", text);
        }
        h.said(5, 10_000, 11_000, "en", "Five.");
        let merged = h.last(2);
        assert_eq!(
            (merged.src_text.as_str(), merged.replaces.clone(), merged.end_ms),
            ("Two. Three. Four.", vec![3, 4], 9_000)
        );
        h.finish(&j1, done("Một."));
        let j2 = h.job();
        assert_eq!((j2.sub_id, j2.text.as_str()), (2, "Two. Three. Four."));
        h.finish(&j2, done("Hai. Ba. Bốn."));
        assert_eq!(h.job().sub_id, 5);
        assert_eq!(h.sink.usage(), [(1, 1_000), (2, 3_000)]);
        assert_eq!(h.last(2).status, Status::Done);
    }

    /// Câu chờ dịch quá 20 giây thì chỉ hiện câu gốc (`skipped`, §7), và không tính phút.
    #[test]
    fn a_sentence_waiting_too_long_is_skipped() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.said(2, 1_500, 2_000, "en", "Two.");
        h.feed(Msg::Clock {
            now_ms: 20_500,
            speech_since: None,
        });
        h.finish(&j1, done("Một."));
        h.no_job();
        assert_eq!(h.statuses(2), [Status::AsrDone, Status::Skipped]);
        assert_eq!(h.c.metrics.skipped, 1);
        assert_eq!(h.sink.usage(), [(1, 1_000)]);
    }

    /// Dịch lỗi thì `failed`; `llama-server` không dùng được thì báo chỉ báo, và câu sau thành `failed` ngay. Không tính phút.
    #[test]
    fn failed_translations_and_an_unavailable_server() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.finish(
            &j1,
            Outcome::Failed {
                reason: "x".into(),
                attempts: 2,
                source_tokens: 1,
                completion_tokens: None,
            },
        );
        assert_eq!(h.last(1).status, Status::Failed);
        h.said(2, 2_000, 3_000, "en", "Two.");
        let j2 = h.job();
        h.finish(&j2, Outcome::Unavailable("bỏ cuộc".into()));
        assert!(
            h.sink
                .indicators
                .lock()
                .unwrap()
                .last()
                .unwrap()
                .translation_unavailable
        );
        h.said(3, 4_000, 5_000, "en", "Three.");
        h.no_job();
        assert_eq!(h.statuses(3), [Status::AsrDone, Status::Failed]);
        assert!(h.sink.usage().is_empty());
        assert_eq!(h.c.metrics.failed, 3);
    }

    /// Luồng dịch dừng bất thường: câu đang dịch thành `failed`, không chờ mãi.
    #[test]
    fn a_dead_translation_thread_fails_the_sentence() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let _j1 = h.job();
        h.feed(Msg::MtGone);
        assert_eq!(h.last(1).status, Status::Failed);
        assert!(h.c.in_flight.is_none());
    }

    /// Câu được ghép thêm đoạn khi đang dịch: hủy bản dịch cũ, dịch lại cả câu; phút tính đủ hai đoạn, mỗi đoạn một lần.
    #[test]
    fn a_sentence_that_grows_while_translating_is_retranslated() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.said(2, 1_300, 2_000, "en", "home.");
        assert!(j1.cancel.load(Ordering::SeqCst), "bản dịch cũ bị hủy");
        h.no_job();
        h.finish(&j1, Outcome::Cancelled);
        let j2 = h.job();
        assert_eq!((j2.sub_id, j2.version, j2.text.as_str()), (1, 2, "so we went home."));
        h.finish(&j2, done("chúng tôi về nhà."));
        assert_eq!(h.sink.usage(), [(1, 1_700)]);
        assert_eq!((h.c.metrics.translated, h.c.metrics.merges), (1, 1));
    }

    /// Q-A của review 02 lần 2: câu (chưa chốt, không có dấu kết thúc) được ghép thêm hai lần trong lúc bản đầu còn đang
    /// dịch. Hàng chỉ có một mục cho câu đó (bản mới nhất); bản dịch xong không bị một mục cũ đưa về `translating`.
    #[test]
    fn a_sentence_that_grows_twice_while_translating_ends_done() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we");
        let j1 = h.job();
        h.said(2, 1_300, 2_000, "en", "went");
        h.said(3, 2_300, 3_000, "en", "home");
        h.finish(&j1, Outcome::Cancelled);
        let j3 = h.job();
        assert_eq!((j3.sub_id, j3.version, j3.text.as_str()), (1, 3, "so we went home"));
        h.finish(&j3, done("chúng tôi về nhà"));
        h.no_job();
        let last = h.last(1);
        assert_eq!(
            (last.status, last.tgt_text.as_str()),
            (Status::Done, "chúng tôi về nhà")
        );
        assert_eq!(h.statuses(1).last(), Some(&Status::Done));
    }

    /// Nhỏ-2 của review 02 lần 3: câu đang chờ dịch (chưa gửi đi) được ghép thêm hai lần (tối đa, vì `max_segments` là 3):
    /// mục trong hàng được cập nhật tại chỗ, câu chỉ được gửi đi dịch một lần với bản mới nhất.
    #[test]
    fn a_waiting_sentence_that_grows_twice_is_translated_once() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.said(2, 1_500, 2_000, "en", "so we");
        h.said(3, 2_300, 2_800, "en", "went");
        h.said(4, 3_100, 3_500, "en", "home");
        h.no_job();
        h.finish(&j1, done("Một."));
        let j2 = h.job();
        assert_eq!((j2.sub_id, j2.version, j2.text.as_str()), (2, 3, "so we went home"));
        h.finish(&j2, done("chúng tôi về nhà"));
        h.no_job();
        let translating = h.statuses(2).iter().filter(|s| **s == Status::Translating).count();
        assert_eq!(translating, 1, "{:?}", h.statuses(2));
        assert_eq!(h.sink.usage(), [(1, 1_000), (2, 1_400)]);
    }

    /// Câu đã dịch xong rồi mới được ghép thêm: lần dịch lại chỉ tính phần mới (§6.8: mỗi đoạn tính một lần).
    #[test]
    fn a_retranslated_sentence_counts_only_the_new_speech() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đi"));
        h.said(2, 1_300, 2_000, "en", "home.");
        let j2 = h.job();
        h.finish(&j2, done("chúng tôi về nhà."));
        assert_eq!(
            h.statuses(1),
            [
                Status::AsrDone,
                Status::Translating,
                Status::Done,
                Status::AsrDone,
                Status::Translating,
                Status::Done
            ]
        );
        h.said(3, 3_000, 4_000, "vi", "Xin chào.");
        h.no_job();
        assert_eq!(h.sink.usage(), [(1, 1_000), (1, 700)]);
        assert_eq!(h.c.metrics.translated_speech_ms, 1_700, "same_lang không tính");
    }

    /// "Đang trễ" khi đoạn cũ nhất còn đang xử lý trễ quá 6 giây, tắt khi bắt kịp (§7).
    #[test]
    fn the_lag_indicator_follows_the_oldest_unfinished_segment() {
        let mut h = harness();
        h.feed(Msg::Queued {
            id: 1,
            start_ms: 0,
            end_ms: 1_000,
            closed_ms: 1_300,
        });
        let clock = |now_ms| Msg::Clock {
            now_ms,
            speech_since: None,
        };
        h.feed(clock(7_000));
        assert!(h.sink.indicators.lock().unwrap().is_empty(), "trễ đúng 6 giây chưa báo");
        h.feed(clock(7_100));
        assert!(h.sink.indicators.lock().unwrap().last().unwrap().lagging);
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.feed(clock(7_200));
        assert!(
            h.sink.indicators.lock().unwrap().last().unwrap().lagging,
            "câu đang dịch vẫn trễ"
        );
        h.finish(&j1, done("Một."));
        h.feed(clock(7_300));
        assert!(!h.sink.indicators.lock().unwrap().last().unwrap().lagging);
    }

    /// N3 của review 02b: bấm Dừng thì câu cuối vẫn được dịch trong hạn chung; hết hạn thì câu còn lại thành `skipped`.
    #[test]
    fn stop_translates_the_last_sentence_within_the_grace_period() {
        let mut config = cfg();
        config.pipeline.mt.stop_grace_ms = 300;
        let mut h = harness_with(config, Sink::default());
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.flags.hurry.store(true, Ordering::SeqCst);
        assert!(!h.c.step());
        assert!(!h.finish(&j1, done("Một.")), "còn trong hạn: chờ câu cuối");
        assert_eq!(h.last(1).status, Status::Done);
        h.said(2, 2_000, 3_000, "en", "Last.");
        let j2 = h.job();
        h.said(3, 4_000, 5_000, "en", "After.");
        std::thread::sleep(Duration::from_millis(350));
        assert!(h.c.step(), "hết hạn: luồng phụ đề thoát ngay");
        assert!(j2.cancel.load(Ordering::SeqCst));
        assert_eq!(h.last(2).status, Status::Skipped);
        assert_eq!(h.last(3).status, Status::Skipped);
        assert_eq!(h.sink.usage(), [(1, 1_000)]);
    }

    /// Chạm hạn mức (§6.8): bỏ đoạn chờ nhận dạng và câu chờ dịch, không hiện đoạn chép lời xong muộn, rồi báo
    /// `QuotaExhausted`.
    #[test]
    fn reaching_the_quota_drops_the_queues_and_reports_it() {
        let mut h = harness_with(
            cfg(),
            Sink {
                limit_ms: Some(1_000),
                ..Sink::default()
            },
        );
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.said(2, 2_000, 3_000, "en", "Two.");
        h.said(3, 4_000, 5_000, "en", "Three.");
        h.asr_queue.push(PendingSegment {
            ids: vec![4],
            start_ms: 6_000,
            end_ms: 7_000,
            speech_ms: 1_000,
            mean_prob: 0.9,
            speech_ratio: 1.0,
            samples: vec![0.0; 16_000],
        });
        assert!(h.finish(&j1, done("Một.")), "câu đang dịch xong là thoát");
        assert!(h.flags.stop.load(Ordering::SeqCst), "dừng thu âm thanh");
        assert!(
            h.asr_queue.pop(&AtomicU64::new(0)).is_none(),
            "hàng đợi nhận dạng đã bỏ và đóng"
        );
        assert_eq!(h.last(2).status, Status::Skipped);
        assert_eq!(h.last(3).status, Status::Skipped);
        h.said(5, 8_000, 9_000, "en", "Late.");
        assert!(!h.sink.subs.lock().unwrap().iter().any(|s| s.id == 5));
        h.no_job();
        let Harness { c, sink, .. } = h;
        c.finish();
        assert_eq!(sink.kinds(), [Fatal::QuotaExhausted]);
        assert_eq!(sink.usage(), [(1, 1_000)]);
    }

    /// App báo hết hạn mức từ ngoài (`Engine::exhaust_quota`) khi đang dịch: câu đang dịch vẫn được dịch xong.
    #[test]
    fn an_outside_quota_stop_lets_the_sentence_being_translated_finish() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.said(2, 2_000, 3_000, "en", "Two.");
        h.flags.quota.store(true, Ordering::SeqCst);
        assert!(!h.c.step(), "chờ câu đang dịch");
        assert_eq!(h.last(2).status, Status::Skipped);
        assert!(h.finish(&j1, done("Một.")));
        assert_eq!(h.last(1).status, Status::Done);
        let Harness { c, sink, .. } = h;
        c.finish();
        assert_eq!(sink.kinds(), [Fatal::QuotaExhausted]);
    }

    // ---- Engine đầy đủ với nhận dạng và dịch giả trong tiến trình (không cần tiến trình phụ). ----

    /// Chép lời mọi đoạn thành `<chữ>` cố định bằng tiếng Anh.
    struct ConstAsr(&'static str);

    impl Asr for ConstAsr {
        fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
            Ok(TranscribeResult {
                segment_id: req.segment_id,
                lang: "en".into(),
                lang_prob: 1.0,
                text: self.0.into(),
                tokens: vec![1, 2],
                no_speech_prob: 0.0,
                lid_ms: 0.0,
                asr_ms: 1.0,
                avg_logprob: -0.2,
            })
        }
    }

    struct PanicAsr;

    impl Asr for PanicAsr {
        fn transcribe(&mut self, _: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
            panic!("lỗi giả trong luồng nhận dạng")
        }
    }

    /// `llama-server` giả trong tiến trình: gửi một gói chữ mỗi `every`, tối đa `chunks` gói (`usize::MAX`: không bao giờ
    /// xong). Ghi lại lúc bên gọi dừng stream.
    struct SlowMt {
        every: Duration,
        chunks: usize,
        broke: Arc<AtomicBool>,
    }

    impl Mt for SlowMt {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            _req: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            let mut cancelled = false;
            for _ in 0..self.chunks {
                std::thread::sleep(self.every);
                if on_delta("x").is_break() {
                    self.broke.store(true, Ordering::SeqCst);
                    cancelled = true;
                    break;
                }
            }
            Ok(StreamEnd {
                text: "x".into(),
                first_token_ms: 1.0,
                total_ms: 1.0,
                finish_reason: (!cancelled).then(|| "stop".into()),
                completion_tokens: Some(1),
                chunks: 1,
                cancelled,
            })
        }
    }

    /// `llama-server` treo hẳn: stream không trả gói nào (tới khi test kết thúc).
    struct HungMt;

    impl Mt for HungMt {
        fn count_tokens(&mut self, _: &str) -> Result<usize, MtError> {
            Ok(1)
        }

        fn stream(
            &mut self,
            _: &ChatRequest,
            _: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            std::thread::sleep(Duration::from_secs(3_600));
            Err(MtError::Failed("treo".into()))
        }
    }

    fn quick_mt() -> Box<dyn Mt> {
        Box::new(SlowMt {
            every: Duration::ZERO,
            chunks: 1,
            broke: Arc::default(),
        })
    }

    /// 1 giây tiếng (sóng vuông biên độ 0,3) rồi `silence_ms` im lặng.
    fn speech_then_silence(silence_ms: usize) -> Vec<f32> {
        let mut s: Vec<f32> = (0..16_000).map(|i| if i % 40 < 20 { 0.3 } else { -0.3 }).collect();
        s.extend(std::iter::repeat_n(0.0, silence_ms * 16));
        s
    }

    fn energy() -> VadFactory {
        Box::new(|| Ok(Box::new(EnergyVad { threshold_rms: 0.01 }) as _))
    }

    fn start(
        source: Box<dyn FrameSource>,
        vad: VadFactory,
        asr: Box<dyn Asr>,
        mt: Box<dyn Mt>,
        config: EngineConfig,
    ) -> (Engine, Arc<Sink>) {
        let sink = Arc::new(Sink::default());
        let engine = Engine::start(config, source, vad, asr, mt, sink.clone()).unwrap();
        (engine, sink)
    }

    /// Nguồn phát mẫu cho sẵn rồi giữ luồng mở (như thu âm thật, chỉ dừng bằng `stop`).
    struct Live {
        samples: SampleSource,
    }

    impl FrameSource for Live {
        fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
            if !self.samples.read(out, timeout)? {
                std::thread::sleep(Duration::from_millis(5));
                out.extend(std::iter::repeat_n(0.0, 80));
            }
            Ok(true)
        }
    }

    fn live(samples: Vec<f32>) -> Box<dyn FrameSource> {
        Box::new(Live {
            samples: SampleSource::new(samples, 1_600, Duration::ZERO),
        })
    }

    /// Q5 của review 02b: VAD không nạp được thì báo lỗi, engine kết thúc.
    #[test]
    fn a_vad_that_does_not_load_is_fatal() {
        let vad: VadFactory = Box::new(|| Err(anyhow::anyhow!("model VAD hỏng")));
        let (engine, sink) = start(live(Vec::new()), vad, Box::new(ConstAsr("x")), quick_mt(), cfg());
        engine.join();
        assert_eq!(sink.kinds(), [Fatal::Vad]);
    }

    /// Q5: VAD lỗi giữa chừng cũng báo lỗi, không dừng lặng lẽ.
    #[test]
    fn a_vad_error_midway_is_fatal() {
        struct Broken;
        impl VadModel for Broken {
            fn prob(&mut self, _: &[f32]) -> Result<f32> {
                anyhow::bail!("candle lỗi")
            }
        }
        let vad: VadFactory = Box::new(|| Ok(Box::new(Broken) as _));
        let (engine, sink) = start(
            live(speech_then_silence(100)),
            vad,
            Box::new(ConstAsr("x")),
            quick_mt(),
            cfg(),
        );
        engine.join();
        assert_eq!(sink.kinds(), [Fatal::Vad]);
    }

    /// Q5: nguồn âm thanh hỏng hẳn thì báo `Audio`.
    #[test]
    fn a_broken_audio_source_is_fatal() {
        struct Broken;
        impl FrameSource for Broken {
            fn read(&mut self, _: &mut Vec<f32>, _: Duration) -> Result<bool> {
                anyhow::bail!("thiết bị đã rút")
            }
        }
        let (engine, sink) = start(Box::new(Broken), energy(), Box::new(ConstAsr("x")), quick_mt(), cfg());
        engine.join();
        assert_eq!(sink.kinds(), [Fatal::Audio]);
    }

    /// Q4 của review 02b: luồng VAD panic thì engine vẫn kết thúc (không treo) và báo lỗi.
    #[test]
    fn a_panicking_vad_thread_does_not_hang_the_engine() {
        struct Panics;
        impl FrameSource for Panics {
            fn read(&mut self, _: &mut Vec<f32>, _: Duration) -> Result<bool> {
                panic!("lỗi giả trong luồng VAD")
            }
        }
        let (engine, sink) = start(Box::new(Panics), energy(), Box::new(ConstAsr("x")), quick_mt(), cfg());
        engine.join();
        assert_eq!(sink.kinds(), [Fatal::Vad]);
    }

    /// Q4: luồng nhận dạng panic thì engine vẫn kết thúc và báo lỗi `Asr`.
    #[test]
    fn a_panicking_asr_thread_does_not_hang_the_engine() {
        let source = Box::new(SampleSource::new(speech_then_silence(1_000), 1_600, Duration::ZERO));
        let (engine, sink) = start(source, energy(), Box::new(PanicAsr), quick_mt(), cfg());
        engine.join();
        assert_eq!(sink.kinds(), [Fatal::Asr]);
    }

    /// Q6 của review 02b: `llama-server` treo giữa lúc dịch thì Dừng vẫn xong trong khoảng `stop_grace_ms`; câu đó
    /// thành `skipped`.
    #[test]
    fn stop_does_not_wait_for_a_hung_translation() {
        let mut config = cfg();
        config.pipeline.mt.stop_grace_ms = 300;
        let (engine, sink) = start(
            live(speech_then_silence(1_500)),
            energy(),
            Box::new(ConstAsr("Hello there.")),
            Box::new(HungMt),
            config,
        );
        let deadline = Instant::now() + Duration::from_secs(10);
        while !sink.subs.lock().unwrap().iter().any(|s| s.status == Status::AsrDone) {
            assert!(Instant::now() < deadline, "phải có phụ đề");
            std::thread::sleep(Duration::from_millis(10));
        }
        let started = Instant::now();
        engine.stop();
        assert!(started.elapsed() < Duration::from_secs(2), "{:?}", started.elapsed());
        let last = sink.subs.lock().unwrap().last().cloned().unwrap();
        assert_eq!(last.status, Status::Skipped);
    }

    /// Q6: lần làm nóng `llama-server` cũng dừng khi bấm Dừng.
    #[test]
    fn stop_breaks_the_warmup() {
        let broke = Arc::new(AtomicBool::new(false));
        let mt = Box::new(SlowMt {
            every: Duration::from_millis(10),
            chunks: usize::MAX,
            broke: broke.clone(),
        });
        let (engine, _sink) = start(live(Vec::new()), energy(), Box::new(ConstAsr("x")), mt, cfg());
        std::thread::sleep(Duration::from_millis(50));
        engine.stop();
        let deadline = Instant::now() + Duration::from_secs(2);
        while !broke.load(Ordering::SeqCst) {
            assert!(Instant::now() < deadline, "lần làm nóng phải dừng");
            std::thread::sleep(Duration::from_millis(5));
        }
    }
}
