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
//! Chọn luồng riêng và client đồng bộ, không dùng runtime tokio (kế hoạch 02, QĐ1): hai client đồng bộ của Phase 0 đã
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
use crate::glossary::SharedGlossary;
use crate::metrics::SessionMetrics;
use crate::prompt::Lang;
use crate::prompt_history::PromptHistory;
use crate::queue::{AsrQueue, MtItem, MtQueue, PartialRequest, PendingSegment, Popped, Ready};
use crate::segmenter::{FRAME_MS, FRAME_SAMPLES, Segmenter, SegmenterConfig};
use crate::sentence::{OpenSentence, Piece, joiner, merge_window_ms};
use crate::streaming::{
    Cadence, PartialScheduler, Split, Stabilizer, split_units, strip_terminal_punct, uses_char_units,
};
use crate::subtitle::{Delta, LiveEnd, LiveLine, Status, Subtitle};
use crate::supervisor::{Asr, AsrFailure};
use crate::text::display_text;
use crate::translate::{Event, Job, Mt, MtError, Outcome, translate, translate_live};
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
    /// Từ điển thuật ngữ (F5, §6.5). Luồng dịch đọc bản mới nhất ở mỗi câu, nên app sửa từ điển giữa phiên thì câu sau
    /// dùng ngay. Gói Free: app đưa từ điển rỗng.
    pub glossary: SharedGlossary,
    /// Máy đủ sức cho chế độ dịch trong lúc nói (app quyết lúc bắt đầu phiên, spec 2026-10-10 §5 "Tắt ngay từ đầu phiên").
    pub streaming_supported: bool,
    /// Công tắc của người dùng lúc bắt đầu phiên (`translateWhileSpeaking`); đổi giữa phiên bằng `set_streaming_enabled`.
    pub streaming_enabled: bool,
}

/// Nguồn âm thanh 16 kHz mono.
pub trait FrameSource: Send {
    /// Thêm mẫu mới vào `out`, chờ tối đa `timeout` nếu chưa có. `Ok(false)`: hết luồng. `Err`: nguồn hỏng hẳn (app đã
    /// thử mở lại mà không được, 02c); engine báo [`Fatal::Audio`].
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool>;

    /// Như `read`, kèm bản cho VAD (spec 2026-10-24-nguon-micro §5.8): `vad_out` nhận cùng số mẫu với phần mới của `out`,
    /// thẳng hàng theo chỉ số. Nguồn micro cho VAD nghe bản đã lọc ồn, còn whisper nghe bản chưa lọc. Bản mặc định chép
    /// phần mới của `out`.
    fn read_with_vad(&mut self, out: &mut Vec<f32>, vad_out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
        let from = out.len();
        let more = self.read(out, timeout)?;
        vad_out.extend_from_slice(&out[from..]);
        Ok(more)
    }
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
    /// Phiên này dịch sau mỗi câu vì máy chưa đủ nhanh (bị tắt từ đầu, hay tự tắt) — spec 2026-10-10 §6.3. Serde:
    /// `streamingUnavailable`.
    pub streaming_unavailable: bool,
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
    /// Dòng đang nói đổi (spec 2026-10-10 §6.2). Mặc định bỏ qua.
    fn live(&self, _line: &LiveLine) {}
    /// Gỡ dòng đang nói (lượt cuối đã chốt, đoạn bị lọc hay bỏ, chế độ tự tắt, dừng phiên). Mặc định bỏ qua.
    fn live_end(&self, _end: &LiveEnd) {}
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
    /// Một lần chép từng phần của đoạn đang mở (spec 2026-10-10 §4.1).
    Partial(PartialText),
    Unavailable(String),
}

/// Kết quả một lần chép từng phần (spec 2026-10-10 §4.1).
struct PartialText {
    /// Id đoạn (chưa cộng `id_base`): id mà đoạn nhận khi đóng.
    seg: u64,
    start_ms: u64,
    /// Giờ âm thanh lúc chụp (cuối phần âm thanh đã chép).
    upto_ms: u64,
    lang: String,
    /// `None`: bị bộ lọc ảo giác loại (§4.1), không cập nhật dòng đang nói.
    text: Option<String>,
    /// `asr_ms` + `lid_ms` của worker.
    asr_ms: f32,
    /// Lúc luồng VAD tạo yêu cầu (giờ thật): mốc đầu của vòng cập nhật (§5).
    requested: Instant,
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
    /// Ngưỡng im lặng đóng đoạn mà luồng VAD đang dùng: lúc bắt đầu, và mỗi khi đổi (chỉ khi không có đoạn mở; H6).
    Threshold(u64),
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
    /// Một gói chữ của bản tạm `job` (spec 2026-10-10 §4.3), đã qua hậu xử lý.
    LiveDelta {
        job: u64,
        text: String,
    },
    /// Bản tạm `job` kết thúc; `finished`: lúc xong (giờ thật), cho vòng cập nhật (§5).
    LiveDone {
        job: u64,
        outcome: Outcome,
        finished: Instant,
    },
    /// Luồng dịch dừng bất thường.
    MtGone,
    /// Lần làm nóng đầu phiên cho thấy `llama-server` không dùng được: báo ngay, không chờ câu đầu tiên.
    MtUnavailable(String),
}

struct MtJob {
    sub_id: u64,
    version: u32,
    src: Lang,
    text: String,
    context: Option<String>,
    cancel: Arc<AtomicBool>,
}

/// Bản tạm của dòng đang nói (spec 2026-10-10 §4.3).
struct LiveJob {
    /// Số thứ tự của việc: luồng phụ đề chỉ nhận tin nhắn của việc đang chạy.
    job: u64,
    src: Lang,
    /// Chữ nguồn đem dịch: chữ của lần chép mới nhất, nối sau câu được nối tiếp (nếu có).
    text: String,
    context: Option<String>,
    /// Phần dịch đã chốt (§4.4), không có khoảng trắng cuối.
    prefill: Option<String>,
    cancel: Arc<AtomicBool>,
}

/// Việc cho luồng dịch (QĐ4 của kế hoạch 02): một câu của lượt cuối, hay một bản tạm.
enum Work {
    Final(MtJob),
    Live(LiveJob),
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

    /// Đặt yêu cầu chép từng phần, thay yêu cầu đang chờ (spec 2026-10-10 §4.1). Hàng đã đóng thì bỏ.
    fn push_partial(&self, partial: PartialRequest) {
        let mut state = self.lock();
        if !state.1 {
            state.0.set_partial(partial);
        }
        drop(state);
        self.ready.notify_one();
    }

    /// Còn đoạn đóng chờ nhận dạng.
    fn has_waiting_segments(&self) -> bool {
        self.lock().0.has_waiting_segments()
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

/// Chế độ dịch trong lúc người nói chưa dừng (spec 2026-10-10 §5, §6.3; H6): dùng chung giữa `Engine`, luồng VAD và luồng
/// phụ đề.
#[derive(Debug, Default)]
struct Streaming {
    /// Máy đủ sức (`EngineConfig::streaming_supported`).
    supported: AtomicBool,
    /// Công tắc của người dùng (`EngineConfig::streaming_enabled`, `Engine::set_streaming_enabled`).
    enabled: AtomicBool,
    /// Đã tự tắt vì máy không theo kịp (§5), tới hết phiên.
    auto_off: AtomicBool,
    /// Nhịp T hiện tại (ms): luồng phụ đề tính (`Cadence`), luồng VAD đọc.
    cadence_ms: AtomicU64,
}

impl Streaming {
    /// Chế độ đang có hiệu lực (H6) = máy đủ sức, công tắc bật, chưa tự tắt.
    fn active(&self) -> bool {
        self.supported.load(Ordering::SeqCst)
            && self.enabled.load(Ordering::SeqCst)
            && !self.auto_off.load(Ordering::SeqCst)
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
    /// Chế độ dịch trong lúc nói.
    streaming: Arc<Streaming>,
}

impl Flags {
    fn new(cfg: &EngineConfig) -> Self {
        let flags = Self::default();
        flags
            .streaming
            .supported
            .store(cfg.streaming_supported, Ordering::SeqCst);
        flags.streaming.enabled.store(cfg.streaming_enabled, Ordering::SeqCst);
        flags
            .streaming
            .cadence_ms
            .store(cfg.pipeline.streaming.initial_cadence_ms, Ordering::SeqCst);
        flags
    }
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
        let flags = Flags::new(&cfg);
        let now_ms = Arc::new(AtomicU64::new(0));
        let queue = Arc::new(SharedQueue::new(AsrQueue::new(cfg.pipeline.queue.clone())));
        let (tx, rx) = mpsc::channel::<Msg>();
        let (jobs_tx, jobs_rx) = mpsc::channel::<Work>();
        let fail = |e: std::io::Error, flags: &Flags, queue: &SharedQueue| {
            flags.stop.store(true, Ordering::SeqCst);
            flags.hurry.store(true, Ordering::SeqCst);
            queue.close();
            anyhow::Error::from(e).context("không tạo được luồng của phiên dịch")
        };

        let mt_thread = {
            let (tx, mt_cfg, target, hurry) = (tx.clone(), cfg.pipeline.mt.clone(), cfg.target, flags.hurry.clone());
            let glossary = cfg.glossary.clone();
            std::thread::Builder::new()
                .name("mt".into())
                .spawn(move || {
                    let _guard = MtGuard(tx.clone());
                    mt_loop(mt, jobs_rx, &tx, &mt_cfg, target, &hurry, &glossary)
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
            let streaming = flags.streaming.clone();
            std::thread::Builder::new()
                .name("vad".into())
                .stack_size(VAD_STACK_BYTES)
                .spawn(move || {
                    let _guard = VadGuard {
                        queue: queue2.clone(),
                        sink: sink.clone(),
                    };
                    vad_loop(
                        source,
                        vad,
                        &vad_pipeline,
                        &queue2,
                        &tx,
                        &*sink,
                        &now_ms,
                        &stop,
                        &streaming,
                    )
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

    /// Bật/tắt chế độ dịch trong lúc nói giữa phiên (công tắc `translateWhileSpeaking`, spec 2026-10-10 §6.3): có tác dụng
    /// từ đoạn kế tiếp, vì luồng VAD chỉ đọc cờ này khi chưa có đoạn mở (H6). Đã tự tắt (§5) thì bật lại không có tác dụng.
    pub fn set_streaming_enabled(&self, on: bool) {
        self.flags.streaming.enabled.store(on, Ordering::SeqCst);
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

/// Ngưỡng im lặng đóng đoạn đang dùng (H6, spec 2026-10-10 §4.7): ở chế độ dịch trong lúc nói là giá trị lớn hơn của
/// `segmenter.end_silence_ms` (`vadEndSilenceMs` của người dùng) và `streaming.end_silence_ms`; chế độ thường giữ nguyên.
fn end_silence_for(cfg: &PipelineConfig, streaming: bool) -> u64 {
    if streaming {
        cfg.segmenter.end_silence_ms.max(cfg.streaming.end_silence_ms)
    } else {
        cfg.segmenter.end_silence_ms
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
    streaming: &Streaming,
) {
    let mut vad = match vad() {
        Ok(v) => v,
        Err(e) => {
            log::error!("không nạp được VAD: {e:#}");
            sink.fatal(Fatal::Vad, &format!("không nạp được VAD: {e:#}"));
            return;
        }
    };
    // Chế độ dịch trong lúc nói và ngưỡng đóng đoạn được chốt cho từng đoạn, ở các khung chưa có đoạn mở (H6; QĐ2 của kế
    // hoạch 02): đổi công tắc giữa phiên có tác dụng từ đoạn kế tiếp.
    let mut seg_streaming = streaming.active();
    let mut end_silence = end_silence_for(cfg, seg_streaming);
    let mut segmenter = Segmenter::new(SegmenterConfig {
        end_silence_ms: end_silence,
        ..cfg.segmenter.clone()
    });
    let mut scheduler = PartialScheduler::new(&cfg.streaming, cfg.segmenter.min_speech_ms, end_silence);
    let _ = tx.send(Msg::Threshold(end_silence));
    let mut silence = SilenceMonitor::new(cfg.audio.clone());
    let level_frames = (cfg.audio.level_interval_ms / FRAME_MS).max(1);
    // `buf`: bản cho whisper (mức âm lượng, `SilenceMonitor`, `Segmenter`); `vad_buf`: bản cho VAD, thẳng hàng theo chỉ số.
    let (mut buf, mut vad_buf, mut frames, mut no_audio) = (Vec::new(), Vec::new(), 0u64, false);
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
        match source.read_with_vad(&mut buf, &mut vad_buf, Duration::from_millis(20)) {
            Ok(true) => {}
            Ok(false) => break,
            Err(e) => {
                log::error!("nguồn âm thanh lỗi: {e:#}");
                sink.fatal(Fatal::Audio, &format!("nguồn âm thanh lỗi: {e:#}"));
                break;
            }
        }
        let mut consumed = 0;
        let ready = buf.len().min(vad_buf.len());
        while ready - consumed >= FRAME_SAMPLES {
            let frame = &buf[consumed..consumed + FRAME_SAMPLES];
            let vad_frame = &vad_buf[consumed..consumed + FRAME_SAMPLES];
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
            let prob = match vad.prob(vad_frame) {
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
            match segmenter.open_progress() {
                None => {
                    seg_streaming = streaming.active();
                    let wanted = end_silence_for(cfg, seg_streaming);
                    if wanted != end_silence {
                        end_silence = wanted;
                        segmenter.set_end_silence_ms(wanted);
                        scheduler.set_end_silence_ms(wanted);
                        let _ = tx.send(Msg::Threshold(wanted));
                    }
                }
                // Chép từng phần đoạn đang mở (spec 2026-10-10 §4.1): theo nhịp T, và khi vừa hết tiếng nói. Tự tắt thì dừng
                // ngay, kể cả giữa đoạn (§5).
                Some(open) if seg_streaming && !streaming.auto_off.load(Ordering::SeqCst) => {
                    let cadence_ms = streaming.cadence_ms.load(Ordering::SeqCst);
                    if scheduler
                        .decide(open, now, cadence_ms, queue.has_waiting_segments())
                        .is_some()
                        && let Some(snap) = segmenter.open_snapshot()
                    {
                        queue.push_partial(PartialRequest {
                            id: snap.id,
                            start_ms: snap.start_ms,
                            upto_ms: now,
                            speech_ms: snap.speech_ms,
                            mean_prob: snap.mean_prob,
                            samples: snap.samples,
                            requested: Instant::now(),
                        });
                    }
                }
                Some(_) => {}
            }
            if frames.is_multiple_of(CLOCK_EVERY_FRAMES) {
                let _ = tx.send(Msg::Clock {
                    now_ms: now,
                    speech_since: segmenter.open_start_ms(),
                });
            }
        }
        buf.drain(..consumed);
        vad_buf.drain(..consumed);
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
    // Ngôn ngữ của đoạn đang mở, từ lần chép từng phần được giữ đầu tiên (QĐ8 của kế hoạch 02): (id đoạn, ngôn ngữ).
    let mut partial_lang: Option<(u64, String)> = None;
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
            Popped::Partial(p) => {
                let next = transcribe_partial(
                    &mut *asr,
                    p,
                    tx,
                    filter,
                    &languages,
                    &history,
                    prev_lang.as_deref(),
                    &mut partial_lang,
                );
                if next.is_break() {
                    break;
                }
                continue;
            }
        };
        if pcm_skip(segment.samples.len()).is_some() {
            let _ = tx.send(Msg::Asr(AsrOutcome::Filtered { ids: segment.ids }));
            continue;
        }
        let pcm = to_pcm(&segment.samples);
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

/// Âm thanh 16 kHz mono sang PCM 16 bit cho `asr-worker`.
fn to_pcm(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect()
}

/// Một lần chép từng phần (spec 2026-10-10 §4.1): đúng `TranscribeRequest` của lượt cuối (`audio_ctx`, `prompt_tokens`,
/// `prev_lang` tính như lượt cuối); ngôn ngữ cho phép ở lần đầu của đoạn, rồi khóa vào ngôn ngữ của lần được giữ đầu tiên
/// (QĐ8 của kế hoạch 02); kết quả qua đúng bộ lọc ảo giác. Không đổi lịch sử prompt hay ngôn ngữ của đoạn trước (chỉ lượt
/// cuối đổi). Lỗi thì bỏ, không gửi lại (QĐ9). `Break` khi `asr-worker` không dùng được nữa. Log chỉ có id.
#[allow(clippy::too_many_arguments)]
fn transcribe_partial(
    asr: &mut dyn Asr,
    p: PartialRequest,
    tx: &Sender<Msg>,
    filter: &FilterConfig,
    languages: &[String],
    history: &PromptHistory,
    prev_lang: Option<&str>,
    partial_lang: &mut Option<(u64, String)>,
) -> ControlFlow<()> {
    if pcm_skip(p.samples.len()).is_some() {
        return ControlFlow::Continue(());
    }
    let pcm = to_pcm(&p.samples);
    let locked = partial_lang
        .as_ref()
        .filter(|(id, _)| *id == p.id)
        .map(|(_, lang)| vec![lang.clone()]);
    let req = TranscribeRequest {
        segment_id: p.id,
        audio_ctx: audio_ctx_for_samples(pcm.len()),
        prompt_tokens: history.prompt_for(prev_lang, pcm.len()),
        pcm,
        languages: locked.unwrap_or_else(|| languages.to_vec()),
        prev_lang: prev_lang.map(str::to_string),
    };
    match asr.transcribe(req) {
        Ok(r) => {
            let text = display_text(&r.lang, &r.text, filter);
            let evidence = Evidence {
                no_speech_prob: r.no_speech_prob,
                avg_logprob: r.avg_logprob,
                vad_mean_prob: p.mean_prob,
                speech_ms: p.speech_ms,
            };
            let kept = verdict(&evidence, &text, filter) == Verdict::Speech;
            if kept && partial_lang.as_ref().is_none_or(|(id, _)| *id != p.id) {
                *partial_lang = Some((p.id, r.lang.clone()));
            }
            let _ = tx.send(Msg::Asr(AsrOutcome::Partial(PartialText {
                seg: p.id,
                start_ms: p.start_ms,
                upto_ms: p.upto_ms,
                lang: r.lang,
                text: kept.then_some(text),
                asr_ms: r.asr_ms + r.lid_ms,
                requested: p.requested,
            })));
            ControlFlow::Continue(())
        }
        Err(AsrFailure::Dropped(reason)) => {
            log::warn!("bỏ lần chép từng phần của đoạn {}: {reason}", p.id);
            ControlFlow::Continue(())
        }
        Err(AsrFailure::Unavailable(reason)) => {
            let _ = tx.send(Msg::Asr(AsrOutcome::Unavailable(reason)));
            ControlFlow::Break(())
        }
    }
}

fn mt_loop(
    mut mt: Box<dyn Mt>,
    jobs: Receiver<Work>,
    tx: &Sender<Msg>,
    cfg: &MtConfig,
    target: Lang,
    hurry: &AtomicBool,
    glossary: &SharedGlossary,
) {
    // Làm nóng khi bắt đầu phiên (§6.5); lỗi request ở đây không quan trọng, request thật sẽ báo lỗi của nó. Server không
    // dùng được (khởi động không nổi, §6.5) thì báo ngay để thanh phụ đề hiện "Dịch không khả dụng" từ đầu phiên, thay vì
    // chỉ hiện câu gốc đến khi câu đầu tiên xong. Bấm Dừng thì bỏ ngang lần làm nóng.
    let warmup = crate::prompt::build(
        cfg.prompt_family,
        crate::prompt::PromptKind::Plain,
        "Hello.",
        Lang::En,
        target,
    );
    let req = crate::llama::ChatRequest {
        prompt: &warmup,
        max_tokens: 32,
        repeat_penalty: cfg.repeat_penalty,
        prefill: None,
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
        if let MtError::Unavailable(reason) = e {
            let _ = tx.send(Msg::MtUnavailable(reason));
        }
    }
    for work in jobs {
        match work {
            Work::Final(job) => translate_final(&mut *mt, &job, tx, cfg, target, glossary),
            Work::Live(job) => translate_live_job(&mut *mt, &job, tx, cfg, target, glossary),
        }
    }
}

/// Một câu của lượt cuối (§6.5): gửi từng phần chữ về luồng phụ đề.
fn translate_final(
    mt: &mut dyn Mt,
    job: &MtJob,
    tx: &Sender<Msg>,
    cfg: &MtConfig,
    target: Lang,
    glossary: &SharedGlossary,
) {
    let (sub_id, version) = (job.sub_id, job.version);
    // Thuật ngữ có trong câu, theo bản từ điển lúc bắt đầu dịch câu này (§6.5).
    let terms = glossary.read().map(|g| g.matches(&job.text)).unwrap_or_default();
    let request = Job {
        text: &job.text,
        src: job.src,
        tgt: target,
        context: job.context.as_deref(),
        terms: &terms,
        // Luồng phụ đề bật cờ khi câu được ghép thêm hay khi hết hạn dừng: `translate` kiểm ở mọi gói (H1).
        cancel: Some(job.cancel.as_ref()),
    };
    let outcome = translate(mt, &request, cfg, &mut |event| {
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

/// Bản tạm của dòng đang nói (spec 2026-10-10 §4.3): `translate_live` kèm prefill; gửi từng gói và lúc xong về luồng phụ đề.
/// Luồng phụ đề bật cờ hủy khi có lần chép mới hơn hay khi việc của lượt cuối cần chạy (§4.6).
fn translate_live_job(
    mt: &mut dyn Mt,
    job: &LiveJob,
    tx: &Sender<Msg>,
    cfg: &MtConfig,
    target: Lang,
    glossary: &SharedGlossary,
) {
    let id = job.job;
    let terms = glossary.read().map(|g| g.matches(&job.text)).unwrap_or_default();
    let request = Job {
        text: &job.text,
        src: job.src,
        tgt: target,
        context: job.context.as_deref(),
        terms: &terms,
        cancel: Some(job.cancel.as_ref()),
    };
    let outcome = translate_live(mt, &request, job.prefill.as_deref(), cfg, &mut |event| match event {
        Event::Delta(text) => match tx.send(Msg::LiveDelta {
            job: id,
            text: text.to_string(),
        }) {
            Ok(()) => ControlFlow::Continue(()),
            Err(_) => ControlFlow::Break(()),
        },
        Event::Retry => ControlFlow::Continue(()),
    });
    let _ = tx.send(Msg::LiveDone {
        job: id,
        outcome,
        finished: Instant::now(),
    });
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
    /// Bản dịch của phiên bản trước, vẫn đang hiện trên màn hình trong lúc phiên bản mới (sau khi ghép câu) đang dịch.
    held: Option<String>,
    /// Chữ của bản dịch mới nhận được trong lúc `held` còn hiện.
    fresh: String,
}

struct InFlight {
    sub_id: u64,
    version: u32,
    cancel: Arc<AtomicBool>,
}

/// Dòng đang nói của một đoạn VAD đang mở (spec 2026-10-10 §4.2–§4.5).
struct Live {
    /// Trạng thái của dòng (id đã cộng `id_base`, `extends`, ngôn ngữ, chữ dịch). Phần nguồn được dựng lúc phát (QĐ6); dòng
    /// đã đóng băng thì phần nguồn dựng một lần lúc đóng băng, giữ ở đây.
    line: LiveLine,
    /// Bản đã phát gần nhất.
    emitted: Option<LiveLine>,
    /// Chốt chữ nguồn của riêng đoạn: LocalAgreement-2, giữ lại `src_holdback_*` đơn vị cuối (§4.2).
    src: Stabilizer,
    src_split: Split,
    /// Chốt phần dịch: LocalAgreement-n, giữ lại k đơn vị cuối, (n, k) theo tiếng nguồn (§4.4).
    tgt: Stabilizer,
    target: &'static str,
    agree: (usize, usize),
    /// Chữ của lần chép từng phần mới nhất, và mốc của nó.
    text: String,
    start_ms: u64,
    upto_ms: u64,
    /// Số lần chép từng phần đã nhận.
    generation: u64,
    /// Bản tạm đang stream: chữ đã nhận (gồm phần prefill được stream lại), và đã thay chữ đang hiện chưa (QĐ7).
    streaming: String,
    switched: bool,
    /// Kết quả nhận dạng lượt cuối của đoạn đã tới: không nhận gì thêm, chờ phụ đề chốt (QĐ5).
    frozen: bool,
}

impl Live {
    fn new(id: u64, lang: &str, holdback: usize, target: &'static str, agree: (usize, usize)) -> Self {
        Self {
            line: LiveLine {
                id,
                src_lang: lang.to_string(),
                ..LiveLine::default()
            },
            emitted: None,
            src: Stabilizer::new(lang, 2, holdback),
            src_split: Split::default(),
            tgt: Stabilizer::new(target, agree.0, agree.1),
            target,
            agree,
            text: String::new(),
            start_ms: 0,
            upto_ms: 0,
            generation: 0,
            streaming: String::new(),
            switched: false,
            frozen: false,
        }
    }

    /// Câu đã là ngôn ngữ đích: không dịch, dòng chỉ hiện câu gốc (§4.3).
    fn same_lang(&self) -> bool {
        self.line.src_lang == self.target
    }

    /// Chữ nguồn đem dịch đã khác hẳn (đổi câu được nối tiếp), hay dịch không còn dùng được: phần dịch chốt lại từ đầu.
    fn reset_target(&mut self) {
        self.tgt = Stabilizer::new(self.target, self.agree.0, self.agree.1);
        self.line.tgt_stable.clear();
        self.line.tgt_tail.clear();
        self.line.tgt_src_units = 0;
        self.streaming.clear();
        self.switched = false;
    }
}

/// Bản tạm đang dịch (tối đa một, spec §4.6).
struct LiveFlight {
    job: u64,
    seg: u64,
    /// Lần chép từng phần (đếm theo đoạn) mà bản tạm này dịch, và câu được nối tiếp lúc gửi.
    generation: u64,
    extends: Option<u64>,
    cancel: Arc<AtomicBool>,
    /// Lúc luồng VAD tạo yêu cầu chép từng phần đó: mốc đầu của vòng cập nhật (§5).
    requested: Instant,
    /// Số đơn vị của chữ nguồn đem dịch (`LiveLine::tgt_src_units`).
    src_units: u32,
}

/// Bản tạm chờ gửi đi dịch: lần chép mới nhất của một đoạn (yêu cầu mới thắng, §4.6).
struct LiveWant {
    seg: u64,
    generation: u64,
    requested: Instant,
}

/// Phần nguồn (ổn định, tạm) của dòng `live`: chữ của riêng đoạn (§4.2) nối sau `base` như khi ghép (QĐ6 của kế hoạch
/// 02). `base`: chữ của câu được nối tiếp, chưa gồm đoạn này; `None` thì chỉ có chữ của đoạn.
fn live_source(live: &Live, base: Option<&str>) -> (String, String) {
    let (stable, tail) = (&live.src_split.stable, &live.src_split.tail);
    let Some(base) = base.map(str::trim_end) else {
        return (stable.clone(), tail.clone());
    };
    let join = joiner(&live.line.src_lang);
    if stable.is_empty() {
        let tail = if tail.is_empty() {
            String::new()
        } else {
            format!("{join}{tail}")
        };
        (base.to_string(), tail)
    } else {
        (format!("{base}{join}{stable}"), tail.clone())
    }
}

struct Composer {
    cfg: EngineConfig,
    sink: Arc<dyn EventSink>,
    jobs: Option<Sender<Work>>,
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
    /// Dòng đang nói theo id đoạn (chưa cộng `id_base`).
    lives: BTreeMap<u64, Live>,
    /// Phụ đề → các đoạn có dòng đang nói chờ phụ đề đó chốt để gỡ (QĐ5 của kế hoạch 02).
    live_waiting: HashMap<u64, Vec<u64>>,
    /// Đoạn lớn nhất đã có kết quả nhận dạng lượt cuối: bản chép từng phần của đoạn không lớn hơn số này tới muộn, bỏ.
    last_final_seg: Option<u64>,
    live_flight: Option<LiveFlight>,
    live_want: Option<LiveWant>,
    /// Số bản tạm đã gửi (đánh số `LiveJob::job`).
    live_jobs: u64,
    /// Nhịp T và tự tắt (§5).
    cadence: Cadence,
}

impl Composer {
    fn new(
        cfg: EngineConfig,
        sink: Arc<dyn EventSink>,
        jobs: Sender<Work>,
        flags: Flags,
        asr_queue: Arc<SharedQueue>,
    ) -> Self {
        let window_ms = merge_window_ms(cfg.pipeline.segmenter.end_silence_ms, &cfg.pipeline.merge);
        let queue = MtQueue::new(cfg.pipeline.queue.clone());
        let stop_grace = Duration::from_millis(cfg.pipeline.mt.stop_grace_ms);
        let cadence = Cadence::new(&cfg.pipeline.streaming);
        // Máy chưa đủ sức cho chế độ dịch trong lúc nói: báo ngay đầu phiên (H6; spec 2026-10-10 §5, §6.3).
        let indicators = Indicators {
            streaming_unavailable: !cfg.streaming_supported,
            ..Indicators::default()
        };
        if indicators.streaming_unavailable {
            sink.indicators(&indicators);
        }
        // Chỉ ghi chế độ (không có chữ nào), để log của phiên cho biết số đo thuộc chế độ nào.
        log::info!(
            "dịch trong lúc nói: {} lúc bắt đầu phiên (máy đủ sức: {})",
            if flags.streaming.active() { "bật" } else { "tắt" },
            cfg.streaming_supported
        );
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
            indicators,
            previous: HashMap::new(),
            metrics: SessionMetrics::default(),
            asr_done: false,
            hurry_since: None,
            quota_hit: false,
            abandoned: false,
            lives: BTreeMap::new(),
            live_waiting: HashMap::new(),
            last_final_seg: None,
            live_flight: None,
            live_want: None,
            live_jobs: 0,
            cadence,
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
        self.dispatch_live();
        self.abandoned
            || (self.asr_done && self.in_flight.is_none() && self.queue.is_empty())
            || (self.quota_hit && self.in_flight.is_none())
    }

    fn finish(mut self) -> SessionMetrics {
        self.finish_open();
        // Dừng phiên: gỡ mọi dòng đang nói còn lại (spec 2026-10-10 §6.2).
        self.end_all_lives();
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
            Msg::Threshold(end_silence_ms) => {
                // Cửa sổ ghép theo ngưỡng đã cắt các đoạn từ giờ (H6; spec 2026-10-10 §4.7).
                self.window_ms = merge_window_ms(end_silence_ms, &self.cfg.pipeline.merge);
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
                    if let Some(held_chars) = state.held.as_ref().map(|h| h.chars().count()) {
                        // Bản cũ còn hiện (A2): bản mới chỉ thay vào khi đã dài ít nhất bằng nó.
                        state.fresh.push_str(&text);
                        if state.fresh.chars().count() >= held_chars {
                            state.held = None;
                            state.sub.tgt_text = std::mem::take(&mut state.fresh);
                            self.sink.subtitle(&state.sub);
                        }
                    } else {
                        state.sub.tgt_text.push_str(&text);
                        self.sink.delta(&Delta { id: sub_id, text });
                    }
                }
            }
            Msg::MtRetry { sub_id, version } => {
                if self.is_current(sub_id, version)
                    && let Some(state) = self.subs.get_mut(&sub_id)
                {
                    if state.held.is_some() {
                        // Chữ mới chưa từng hiện: bỏ nó, bản cũ vẫn hiện.
                        state.fresh.clear();
                    } else {
                        state.sub.tgt_text.clear();
                        self.sink.subtitle(&state.sub);
                    }
                }
            }
            Msg::MtDone {
                sub_id,
                version,
                outcome,
            } => self.on_mt_done(sub_id, version, outcome),
            Msg::LiveDelta { job, text } => self.on_live_delta(job, &text),
            Msg::LiveDone { job, outcome, finished } => self.on_live_done(job, outcome, finished),
            Msg::MtGone => {
                log::error!("luồng dịch dừng bất thường");
                self.jobs = None;
                self.live_flight = None;
                self.set_mt_unavailable();
                if let Some(f) = self.in_flight.take() {
                    self.settle(f.sub_id, Status::Failed, String::new());
                }
            }
            Msg::MtUnavailable(reason) => {
                log::error!("llama-server không dùng được ngay từ lần làm nóng: {reason}");
                self.set_mt_unavailable();
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
                self.last_final_seg = self.last_final_seg.max(ids.last().copied());
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
                    // Câu đã là ngôn ngữ đích: phụ đề cuối hiện ngay, gỡ dòng đang nói (spec 2026-10-10 §4.5).
                    self.end_lives(&ids);
                    return;
                }
                let window = self.window_ms;
                if let Some((open, sub_id)) = self.open.as_mut().filter(|(o, _)| o.accepts(&piece, window)) {
                    open.push(&piece);
                    let (sub_id, closed, joined) = (*sub_id, open.is_closed(), open.text().to_string());
                    self.metrics.merges += 1;
                    self.grow(sub_id, &ids, &joined, end_ms, speech_ms, closed);
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
                            held: None,
                            fresh: String::new(),
                        },
                    );
                    if let Some(state) = self.subs.get(&sub_id) {
                        self.sink.subtitle(&state.sub);
                    }
                    // Dòng đang nói của các đoạn này giờ thay chỗ phụ đề mới tới khi nó chốt; phát ngay sau upsert (QĐ5).
                    self.freeze_lives(&ids, sub_id, None);
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
                self.last_final_seg = self.last_final_seg.max(ids.last().copied());
                self.end_lives(&ids);
            }
            AsrOutcome::Dropped { ids, start_ms, end_ms } => {
                self.metrics.dropped += 1;
                for id in &ids {
                    self.pending.remove(id);
                }
                self.last_final_seg = self.last_final_seg.max(ids.last().copied());
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
                self.end_lives(&ids);
            }
            AsrOutcome::Partial(p) => self.on_partial(p),
            AsrOutcome::Unavailable(reason) => {
                log::error!("asr-worker không dùng được: {reason}");
                self.sink.fatal(Fatal::Asr, &reason);
            }
        }
    }

    /// Câu đang mở vừa được ghép thêm các đoạn `segs`: gửi lại phụ đề (tạm) mà vẫn giữ bản dịch đang hiện (A2, H2), rồi dịch
    /// lại cả câu. Dòng đang nói của các đoạn đó đóng băng ngay sau upsert, chờ câu chốt (QĐ5 của kế hoạch 02).
    fn grow(&mut self, sub_id: u64, segs: &[u64], text: &str, end_ms: u64, speech_ms: u64, closed: bool) {
        let Some(state) = self.subs.get_mut(&sub_id) else {
            return;
        };
        state.version += 1;
        state.closed = closed;
        state.speech_ms += speech_ms;
        // Chữ của câu trước khi ghép các đoạn này: dòng đang nói của chúng đóng băng trên chữ đó (QĐ5, QĐ6).
        let before = std::mem::replace(&mut state.sub.src_text, text.to_string());
        state.sub.end_ms = end_ms;
        // A2: không xóa bản dịch đang hiện; giữ nó tới khi bản dịch của câu mới dài ít nhất bằng nó. Chữ mới của phiên bản
        // cũ (nếu đang giữ) không còn đúng.
        if !state.sub.tgt_text.is_empty() {
            state.held = Some(state.sub.tgt_text.clone());
        }
        state.fresh.clear();
        state.sub.status = Status::AsrDone;
        state.sub.provisional = !closed;
        let (version, total) = (state.version, state.speech_ms);
        self.sink.subtitle(&state.sub);
        self.freeze_lives(segs, sub_id, Some(&before));
        let in_flight = self.in_flight.as_ref().is_some_and(|f| f.sub_id == sub_id);
        if in_flight {
            // Bản dịch của câu cũ không còn đúng: hủy, đưa câu mới lên đầu hàng. Câu đã ghép thêm một lần trong lúc bản cũ
            // còn đang dịch thì đã có trong hàng: chỉ cập nhật mục đó, không thêm mục thứ hai.
            if let Some(f) = &self.in_flight {
                f.cancel.store(true, Ordering::SeqCst);
            }
            if !self.queue.update(sub_id, text, end_ms, total, version) {
                self.enqueue(sub_id, version, true);
            }
        } else if !self.queue.update(sub_id, text, end_ms, total, version) {
            self.enqueue(sub_id, version, false);
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
                // Dòng đang nói chờ câu bị gộp giờ chờ câu gộp (QĐ5 của kế hoạch 02).
                if let Some(segs) = self.live_waiting.remove(id) {
                    self.live_waiting.entry(merged.sub_id).or_default().extend(segs);
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
            // Bấm Dừng: thôi dịch bản tạm (spec 2026-10-10 §6.2). Dòng đang nói còn lại được gỡ khi phụ đề cuối của nó chốt
            // trong hạn dừng, hay khi luồng phụ đề kết thúc.
            self.stop_live_work();
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
        self.stop_live_work();
        self.end_all_lives();
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
        self.stop_live_work();
        self.end_all_lives();
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
            if state.held.is_none() {
                state.sub.tgt_text.clear();
            }
            self.sink.subtitle(&state.sub);
            // Việc của lượt cuối luôn đi trước (spec 2026-10-10 §4.6): bản tạm đang dịch dừng ngay, luồng dịch làm câu này
            // ngay sau đó.
            if let Some(f) = &self.live_flight {
                f.cancel.store(true, Ordering::SeqCst);
            }
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
            let sent = self.jobs.as_ref().is_some_and(|j| j.send(Work::Final(job)).is_ok());
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

    /// Kết thúc phần dịch của một phụ đề. `Done` thì đếm phút cho hạn mức (§6.8). Dòng đang nói chờ phụ đề này được gỡ ngay
    /// sau upsert (spec 2026-10-10 §4.5).
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
        state.held = None;
        state.fresh.clear();
        state.sub.status = status;
        state.sub.tgt_text = tgt_text;
        self.sink.subtitle(&state.sub);
        if state.closed {
            self.subs.remove(&sub_id);
        }
        self.end_waiting_lives(sub_id);
        if let Some(usage) = usage
            && self.sink.usage(&usage).is_break()
            && !self.quota_hit
        {
            self.hit_quota();
        }
    }

    /// Một lần chép từng phần có kết quả (spec 2026-10-10 §4.1–§4.3): cập nhật dòng đang nói của đoạn, rồi xin dịch lần chép
    /// này (yêu cầu mới thắng, §4.6). Bỏ khi bị lọc, khi lượt cuối của đoạn đã có, khi chế độ đã tự tắt, khi đang dừng, hết
    /// hạn mức hay hết hạn dừng.
    fn on_partial(&mut self, p: PartialText) {
        self.metrics.partials += 1;
        self.metrics.partial_asr_ms.push(p.asr_ms);
        let late = self.last_final_seg.is_some_and(|last| p.seg <= last);
        if late
            || self.flags.streaming.auto_off.load(Ordering::SeqCst)
            || self.hurry_since.is_some()
            || self.quota_hit
            || self.abandoned
        {
            return;
        }
        let Some(text) = p.text else { return };
        let streaming = &self.cfg.pipeline.streaming;
        let holdback = if uses_char_units(&p.lang) {
            streaming.src_holdback_chars
        } else {
            streaming.src_holdback_words
        };
        let agree = streaming.agree_for(&p.lang);
        let target = self.cfg.target.code();
        let id = self.cfg.id_base + p.seg;
        let live = self
            .lives
            .entry(p.seg)
            .or_insert_with(|| Live::new(id, &p.lang, holdback, target, agree));
        if live.frozen {
            return;
        }
        if live.line.src_lang != p.lang {
            // Ngôn ngữ chỉ đổi được khi lần chép trước bị lọc (QĐ8): bắt đầu lại dòng với ngôn ngữ mới.
            *live = Live::new(id, &p.lang, holdback, target, agree);
        }
        live.generation += 1;
        live.src_split = live.src.push(&text);
        live.text = text;
        live.start_ms = p.start_ms;
        live.upto_ms = p.upto_ms;
        let (generation, same_lang) = (live.generation, live.same_lang());
        self.refresh_extends(p.seg);
        if !same_lang && !self.mt_unavailable {
            // Yêu cầu mới thắng (§4.6): hủy bản tạm đang dịch; lần chép mới nhất được gửi đi khi rảnh (`dispatch_live`).
            if let Some(f) = &self.live_flight {
                f.cancel.store(true, Ordering::SeqCst);
            }
            self.live_want = Some(LiveWant {
                seg: p.seg,
                generation,
                requested: p.requested,
            });
        }
        self.emit_live(p.seg, false);
    }

    /// Phụ đề tạm mà dòng `live` nối tiếp (spec §4.3): câu đang mở nhận được đoạn này theo luật ghép §6.3 (cùng ngôn ngữ của
    /// lần chép từng phần, chưa chốt, chưa đạt trần, trong cửa sổ ghép). Dòng đã là ngôn ngữ đích không nối tiếp: lượt cuối
    /// của nó là `same_lang`.
    fn live_extends(&self, live: &Live) -> Option<u64> {
        if live.line.src_lang == self.cfg.target.code() {
            return None;
        }
        let piece = Piece {
            start_ms: live.start_ms,
            end_ms: live.upto_ms,
            lang: &live.line.src_lang,
            text: &live.text,
        };
        self.open
            .as_ref()
            .filter(|(o, _)| o.accepts(&piece, self.window_ms))
            .map(|(_, id)| *id)
    }

    /// Xét lại phụ đề tạm mà dòng của đoạn `seg` nối tiếp (câu đang mở có thể đã chốt, hay vừa được ghép thêm đoạn trước).
    /// Đổi thì chữ nguồn đem dịch đã khác: phần dịch chốt lại từ đầu.
    fn refresh_extends(&mut self, seg: u64) {
        let Some(live) = self.lives.get(&seg).filter(|l| !l.frozen) else {
            return;
        };
        let extends = self.live_extends(live);
        if let Some(live) = self.lives.get_mut(&seg)
            && live.line.extends != extends
        {
            live.line.extends = extends;
            live.reset_target();
        }
    }

    /// Phát dòng đang nói của đoạn `seg` nếu có đổi (hay luôn phát, `force`). Nối tiếp câu A thì phần nguồn gồm chữ hiện tại
    /// của A (chưa gồm đoạn này), nối như khi ghép (QĐ6 của kế hoạch 02). Dòng đã đóng băng giữ phần nguồn dựng lúc đóng
    /// băng (`freeze_lives`): lúc đó chữ của A đã gồm lượt cuối của chính đoạn này.
    fn emit_live(&mut self, seg: u64, force: bool) {
        let Some(live) = self.lives.get(&seg) else { return };
        let mut line = live.line.clone();
        if !live.frozen {
            let base = line
                .extends
                .and_then(|id| self.subs.get(&id))
                .map(|s| s.sub.src_text.as_str());
            (line.src_stable, line.src_tail) = live_source(live, base);
        }
        if force || live.emitted.as_ref() != Some(&line) {
            self.sink.live(&line);
            if let Some(live) = self.lives.get_mut(&seg) {
                live.emitted = Some(line);
            }
        }
    }

    /// Kết quả nhận dạng lượt cuối của các đoạn `segs` vừa thành phụ đề `sub_id` (phụ đề mới, hay câu được ghép thêm): dòng
    /// đang nói của các đoạn đó đóng băng, được phát lại một lần với `extends` là phụ đề đó (`None` nếu đó chính là id của
    /// dòng), và chờ phụ đề đó chốt để gỡ (QĐ5). Bản tạm của các đoạn đó không còn cần. Gọi ngay sau upsert tạo ra phần chữ
    /// của các đoạn đó.
    ///
    /// Dòng giữ chữ đang hiện của đoạn (spec §4.5): phần ổn định và phần tạm của lần chép từng phần cuối, nối sau `before`,
    /// chữ của câu `sub_id` trước khi ghép các đoạn đó (`None` với phụ đề mới). Không dựng từ chữ hiện tại của câu: chữ đó
    /// đã gồm lượt cuối của chính các đoạn này, chữ của đoạn sẽ bị lặp.
    ///
    /// `extends` đổi so với lúc dịch bản tạm gần nhất (hiếm: câu đang mở vừa chốt vì quá trần, hay LID đổi) thì phần dịch
    /// không còn khớp chữ nguồn mới — chốt lại từ đầu, cùng luật với `refresh_extends`.
    fn freeze_lives(&mut self, segs: &[u64], sub_id: u64, before: Option<&str>) {
        for &seg in segs {
            self.forget_live_work(seg);
            let Some(live) = self.lives.get_mut(&seg) else {
                continue;
            };
            live.frozen = true;
            let extends = (live.line.id != sub_id).then_some(sub_id);
            if live.line.extends != extends {
                live.reset_target();
            }
            live.line.extends = extends;
            (live.line.src_stable, live.line.src_tail) = live_source(live, live.line.extends.and(before));
            self.live_waiting.entry(sub_id).or_default().push(seg);
            self.emit_live(seg, true);
        }
    }

    /// Gỡ dòng đang nói của các đoạn `segs`, nếu có (spec §4.5, §6.2); bản tạm của chúng không còn cần.
    fn end_lives(&mut self, segs: &[u64]) {
        for &seg in segs {
            self.forget_live_work(seg);
            if self.lives.remove(&seg).is_some() {
                self.sink.live_end(&LiveEnd {
                    id: self.cfg.id_base + seg,
                });
            }
        }
    }

    /// Phụ đề `sub_id` vừa chốt: gỡ các dòng đang nói chờ nó.
    fn end_waiting_lives(&mut self, sub_id: u64) {
        if let Some(segs) = self.live_waiting.remove(&sub_id) {
            self.end_lives(&segs);
        }
    }

    /// Gỡ mọi dòng đang nói (tự tắt, hết hạn mức, hết hạn dừng, luồng phụ đề kết thúc).
    fn end_all_lives(&mut self) {
        self.live_waiting.clear();
        let segs: Vec<u64> = self.lives.keys().copied().collect();
        self.end_lives(&segs);
    }

    /// Đoạn `seg` không còn cần bản tạm: hủy bản tạm đang dịch của nó, bỏ yêu cầu đang chờ.
    fn forget_live_work(&mut self, seg: u64) {
        if let Some(f) = self.live_flight.as_ref().filter(|f| f.seg == seg) {
            f.cancel.store(true, Ordering::SeqCst);
        }
        if self.live_want.as_ref().is_some_and(|w| w.seg == seg) {
            self.live_want = None;
        }
    }

    /// Gửi bản tạm mới nhất đi dịch (spec 2026-10-10 §4.6): tối đa một bản tạm một lúc; chỉ khi không có việc của lượt cuối
    /// đang chạy hay đang chờ; không gửi khi dịch không khả dụng, đang dừng, hết hạn mức hay chế độ đã tự tắt.
    fn dispatch_live(&mut self) {
        if self.live_flight.is_some()
            || self.in_flight.is_some()
            || !self.queue.is_empty()
            || self.mt_unavailable
            || self.quota_hit
            || self.abandoned
            || self.hurry_since.is_some()
            || self.flags.streaming.auto_off.load(Ordering::SeqCst)
        {
            return;
        }
        let Some(want) = self.live_want.take() else { return };
        // Câu được nối tiếp có thể đã đổi từ lần chép đó (đã chốt, hay vừa được ghép thêm đoạn trước): phát lại ngay nếu
        // refresh_extends vừa đổi extends hay xóa phần dịch cũ (reset_target), để thanh phụ đề không giữ chỗ cũ.
        self.refresh_extends(want.seg);
        self.emit_live(want.seg, false);
        let Some(live) = self.lives.get(&want.seg).filter(|l| !l.frozen && !l.same_lang()) else {
            return;
        };
        let lang = live.line.src_lang.clone();
        let extended = live.line.extends.and_then(|id| self.subs.get(&id));
        let text = match extended {
            Some(state) => format!("{}{}{}", state.sub.src_text.trim_end(), joiner(&lang), live.text.trim()),
            None => live.text.trim().to_string(),
        };
        // Ngữ cảnh như lượt cuối (cờ `translationContext`): của câu được nối tiếp, hay câu chốt gần nhất cùng ngôn ngữ.
        let context = match extended {
            Some(state) => state.context.clone(),
            None => self
                .cfg
                .translation_context
                .then(|| self.previous.get(&lang).cloned())
                .flatten(),
        };
        let prefill = Some(live.tgt.stable_text()).filter(|p| !p.is_empty());
        let src_units = split_units(&text, &lang).len() as u32;
        let extends = live.line.extends;
        self.live_jobs += 1;
        let cancel = Arc::new(AtomicBool::new(false));
        let job = LiveJob {
            job: self.live_jobs,
            src: Lang::from_code(&lang).unwrap_or(Lang::En),
            text,
            context,
            prefill,
            cancel: cancel.clone(),
        };
        if self.jobs.as_ref().is_some_and(|j| j.send(Work::Live(job)).is_ok()) {
            self.live_flight = Some(LiveFlight {
                job: self.live_jobs,
                seg: want.seg,
                generation: want.generation,
                extends,
                cancel,
                requested: want.requested,
                src_units,
            });
            self.clear_live_stream(want.seg);
        } else {
            self.set_mt_unavailable();
        }
    }

    /// Một gói của bản tạm đang dịch (QĐ7 của kế hoạch 02): bản mới chỉ thay chữ đang hiện khi phần đã nhận dài ít nhất bằng
    /// chữ đang hiện (đếm ký tự); từ đó hiện dần. Dấu kết câu ở cuối không hiện (§4.3).
    fn on_live_delta(&mut self, job: u64, text: &str) {
        let Some(flight) = self.live_flight.as_ref().filter(|f| f.job == job) else {
            return;
        };
        let (seg, src_units, extends) = (flight.seg, flight.src_units, flight.extends);
        let Some(live) = self
            .lives
            .get_mut(&seg)
            .filter(|l| !l.frozen && l.line.extends == extends)
        else {
            return;
        };
        live.streaming.push_str(text);
        let incoming = strip_terminal_punct(&live.streaming);
        let shown = live.line.tgt_stable.chars().count() + live.line.tgt_tail.chars().count();
        if !live.switched && incoming.chars().count() < shown {
            return;
        }
        let split = live.tgt.preview(incoming);
        live.switched = true;
        live.line.tgt_stable = split.stable;
        live.line.tgt_tail = split.tail;
        live.line.tgt_src_units = src_units;
        self.emit_live(seg, false);
    }

    /// Bản tạm kết thúc. Xong thì chốt phần dịch (LocalAgreement-n, §4.4), hiện, và tính một vòng cập nhật (§5); bị hủy hay
    /// lỗi thì giữ chữ đang hiện và không tính vòng (§7); bị hủy mà chưa có lần chép mới hơn thì dịch lại lần chép đó khi
    /// rảnh. Kết quả dịch theo câu nối tiếp cũ (đã đổi) không được hiện.
    fn on_live_done(&mut self, job: u64, outcome: Outcome, finished: Instant) {
        let Some(flight) = self.live_flight.take_if(|f| f.job == job) else {
            return;
        };
        let current = self
            .lives
            .get(&flight.seg)
            .is_some_and(|l| !l.frozen && l.line.extends == flight.extends);
        match outcome {
            Outcome::Done(t) => {
                if current && let Some(live) = self.lives.get_mut(&flight.seg) {
                    let split = live.tgt.push(strip_terminal_punct(&t.text));
                    live.line.tgt_stable = split.stable;
                    live.line.tgt_tail = split.tail;
                    live.line.tgt_src_units = flight.src_units;
                    live.streaming.clear();
                    live.switched = false;
                    self.emit_live(flight.seg, false);
                }
                // Vòng cập nhật: từ lúc luồng VAD tạo yêu cầu chép từng phần tới lúc bản tạm của nó xong (§5).
                let cycle_ms = finished.saturating_duration_since(flight.requested).as_secs_f32() * 1000.0;
                self.record_cycle(cycle_ms);
            }
            Outcome::Cancelled => {
                let latest = self
                    .lives
                    .get(&flight.seg)
                    .is_some_and(|l| l.generation == flight.generation);
                if current && latest && self.live_want.is_none() {
                    self.live_want = Some(LiveWant {
                        seg: flight.seg,
                        generation: flight.generation,
                        requested: flight.requested,
                    });
                }
                self.clear_live_stream(flight.seg);
            }
            Outcome::Failed { .. } => self.clear_live_stream(flight.seg),
            Outcome::Unavailable(reason) => {
                log::error!("llama-server không dùng được: {reason}");
                self.set_mt_unavailable();
                // Dòng đang nói chỉ hiện câu gốc (spec §7).
                let segs: Vec<u64> = self
                    .lives
                    .iter()
                    .filter(|(_, l)| !l.frozen)
                    .map(|(&seg, _)| seg)
                    .collect();
                for seg in segs {
                    if let Some(live) = self.lives.get_mut(&seg) {
                        live.reset_target();
                    }
                    self.emit_live(seg, false);
                }
            }
        }
    }

    /// Bỏ phần đang stream của bản tạm (không thành, hay vừa gửi bản mới), giữ chữ đang hiện (§7).
    fn clear_live_stream(&mut self, seg: u64) {
        if let Some(live) = self.lives.get_mut(&seg) {
            live.streaming.clear();
            live.switched = false;
        }
    }

    /// Một vòng cập nhật xong (spec §5): nhịp T mới cho luồng VAD, ghi số đo; máy không theo kịp thì tự tắt.
    fn record_cycle(&mut self, cycle_ms: f32) {
        self.cadence.record(cycle_ms);
        let cadence_ms = self.cadence.cadence_ms();
        self.flags.streaming.cadence_ms.store(cadence_ms, Ordering::SeqCst);
        self.metrics.live_cycle_ms.push(cycle_ms);
        self.metrics.cadence_ms.push(cadence_ms as f32);
        if self.cadence.too_slow() && !self.flags.streaming.auto_off.load(Ordering::SeqCst) {
            self.turn_streaming_off();
        }
    }

    /// Máy không theo kịp (spec §5): chế độ này tắt tới hết phiên. Luồng VAD thấy cờ ngay (thôi chép từng phần) và trở về
    /// ngưỡng người dùng từ đoạn kế tiếp; mọi dòng đang nói được gỡ; chỉ báo "dịch sau mỗi câu" bật (§6.3). Log chỉ có số.
    fn turn_streaming_off(&mut self) {
        self.flags.streaming.auto_off.store(true, Ordering::SeqCst);
        self.metrics.streaming_auto_off = true;
        log::warn!(
            "dịch trong lúc nói tự tắt tới hết phiên: {} vòng cập nhật, nhịp {} ms",
            self.metrics.live_cycle_ms.len(),
            self.cadence.cadence_ms()
        );
        self.stop_live_work();
        self.end_all_lives();
        if !self.indicators.streaming_unavailable {
            self.indicators.streaming_unavailable = true;
            self.sink.indicators(&self.indicators);
        }
    }

    /// Thôi dịch bản tạm: hủy bản đang dịch, bỏ yêu cầu chờ.
    fn stop_live_work(&mut self) {
        if let Some(f) = &self.live_flight {
            f.cancel.store(true, Ordering::SeqCst);
        }
        self.live_want = None;
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

    /// Luồng dịch đưa thuật ngữ có trong câu vào prompt theo mẫu "terminology" (§6.5); sửa từ điển giữa phiên thì câu sau
    /// dùng ngay bản mới; câu không có thuật ngữ nào giữ prompt mặc định.
    #[test]
    fn the_translation_thread_puts_matching_terms_into_the_prompt() {
        use crate::glossary::{Glossary, Term};
        use crate::prompt::{terminology_prompt, translation_prompt};
        use std::sync::RwLock;

        struct Recording(Arc<Mutex<Vec<String>>>);
        impl Mt for Recording {
            fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
                Ok(text.split_whitespace().count())
            }
            fn stream(
                &mut self,
                req: &ChatRequest,
                on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
            ) -> Result<StreamEnd, MtError> {
                self.0.lock().unwrap().push(req.prompt.to_string());
                let _ = on_delta("Xong");
                Ok(StreamEnd {
                    text: "Xong".into(),
                    finish_reason: Some("stop".into()),
                    chunks: 1,
                    ..StreamEnd::default()
                })
            }
        }
        let term = |source: &str, target: &str| Term {
            source: source.into(),
            target: target.into(),
        };
        let prompts = Arc::new(Mutex::new(Vec::new()));
        let glossary: SharedGlossary = Arc::new(RwLock::new(Glossary::new([term("sprint", "đợt chạy")])));
        let (jobs_tx, jobs_rx) = mpsc::channel::<Work>();
        let (tx, rx) = mpsc::channel::<Msg>();
        let thread = {
            let (mt, glossary) = (Box::new(Recording(prompts.clone())), glossary.clone());
            std::thread::spawn(move || {
                mt_loop(
                    mt,
                    jobs_rx,
                    &tx,
                    &MtConfig::default(),
                    Lang::Vi,
                    &AtomicBool::new(false),
                    &glossary,
                )
            })
        };
        let translate_one = |sub_id: u64, text: &str| {
            let cancel = Arc::new(AtomicBool::new(false));
            jobs_tx
                .send(Work::Final(MtJob {
                    sub_id,
                    version: 0,
                    src: Lang::En,
                    text: text.into(),
                    context: None,
                    cancel,
                }))
                .unwrap();
            loop {
                if let Msg::MtDone { sub_id: done, .. } = rx.recv().unwrap()
                    && done == sub_id
                {
                    break;
                }
            }
        };
        translate_one(1, "The sprint starts today");
        *glossary.write().unwrap() = Glossary::new([term("sprint", "đợt chạy"), term("demo", "buổi trình diễn")]);
        translate_one(2, "A demo after the sprint");
        translate_one(3, "Nothing to look up");
        drop(jobs_tx);
        thread.join().unwrap();
        let prompts = prompts.lock().unwrap();
        assert_eq!(prompts.len(), 4, "làm nóng rồi ba câu");
        assert_eq!(
            prompts[1],
            terminology_prompt(
                "The sprint starts today",
                &[term("sprint", "đợt chạy")],
                Lang::En,
                Lang::Vi
            )
        );
        assert_eq!(
            prompts[2],
            terminology_prompt(
                "A demo after the sprint",
                &[term("sprint", "đợt chạy"), term("demo", "buổi trình diễn")],
                Lang::En,
                Lang::Vi
            ),
            "từ điển mới; mục dài hơn trước"
        );
        assert_eq!(prompts[3], translation_prompt("Nothing to look up", Lang::En, Lang::Vi));
    }

    // ---- Luồng phụ đề, nạp thẳng tin nhắn (Q2 của review 02b): tất định, không luồng, không tiến trình phụ. ----

    #[derive(Default)]
    struct Sink {
        subs: Mutex<Vec<Subtitle>>,
        lives: Mutex<Vec<LiveLine>>,
        live_ends: Mutex<Vec<u64>>,
        /// Thứ tự chung của upsert, `live` và `live_end` (`"upsert 1"`, `"live 1"`, `"end 1"`).
        trail: Mutex<Vec<String>>,
        deltas: Mutex<Vec<Delta>>,
        indicators: Mutex<Vec<Indicators>>,
        fatal: Mutex<Vec<(Fatal, String)>>,
        usage: Mutex<Vec<Usage>>,
        /// Hạn mức (ms): tổng `usage` chạm số này thì trả `Break`.
        limit_ms: Option<u64>,
    }

    impl EventSink for Sink {
        fn subtitle(&self, s: &Subtitle) {
            self.trail.lock().unwrap().push(format!("upsert {}", s.id));
            self.subs.lock().unwrap().push(s.clone());
        }
        fn delta(&self, d: &Delta) {
            self.deltas.lock().unwrap().push(d.clone());
        }
        fn level(&self, _: f32) {}
        fn indicators(&self, i: &Indicators) {
            self.indicators.lock().unwrap().push(i.clone());
        }
        fn fatal(&self, kind: Fatal, reason: &str) {
            self.fatal.lock().unwrap().push((kind, reason.to_string()));
        }
        fn live(&self, l: &LiveLine) {
            self.trail.lock().unwrap().push(format!("live {}", l.id));
            self.lives.lock().unwrap().push(l.clone());
        }
        fn live_end(&self, e: &LiveEnd) {
            self.trail.lock().unwrap().push(format!("end {}", e.id));
            self.live_ends.lock().unwrap().push(e.id);
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
        jobs: Receiver<Work>,
        sink: Arc<Sink>,
        flags: Flags,
        asr_queue: Arc<SharedQueue>,
        /// Mốc giờ thật của test: lúc "luồng VAD" tạo mọi yêu cầu chép từng phần.
        t0: Instant,
    }

    /// Máy đủ sức nhưng công tắc tắt: chế độ dịch trong lúc nói không có hiệu lực, engine chạy như chế độ thường.
    fn cfg() -> EngineConfig {
        EngineConfig {
            pipeline: PipelineConfig::default(),
            languages: vec!["en".into(), "vi".into()],
            target: Lang::Vi,
            translation_context: false,
            id_base: 0,
            glossary: SharedGlossary::default(),
            streaming_supported: true,
            streaming_enabled: false,
        }
    }

    fn harness_with(cfg: EngineConfig, sink: Sink) -> Harness {
        let sink = Arc::new(sink);
        let (jobs_tx, jobs) = mpsc::channel();
        let flags = Flags::new(&cfg);
        let asr_queue = Arc::new(SharedQueue::new(AsrQueue::new(cfg.pipeline.queue.clone())));
        let c = Composer::new(cfg, sink.clone(), jobs_tx, flags.clone(), asr_queue.clone());
        Harness {
            c,
            jobs,
            sink,
            flags,
            asr_queue,
            t0: Instant::now(),
        }
    }

    fn harness() -> Harness {
        harness_with(cfg(), Sink::default())
    }

    /// Chế độ dịch trong lúc nói có hiệu lực (máy đủ sức, công tắc bật).
    fn live_harness() -> Harness {
        harness_with(
            EngineConfig {
                streaming_enabled: true,
                ..cfg()
            },
            Sink::default(),
        )
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

        /// Một lần chép từng phần của đoạn `seg` có kết quả (`None`: bị bộ lọc ảo giác loại).
        fn partial(&mut self, seg: u64, start_ms: u64, upto_ms: u64, lang: &str, text: Option<&str>) -> bool {
            self.feed(Msg::Asr(AsrOutcome::Partial(PartialText {
                seg,
                start_ms,
                upto_ms,
                lang: lang.into(),
                text: text.map(String::from),
                asr_ms: 200.0,
                requested: self.t0,
            })))
        }

        fn last_live(&self, id: u64) -> LiveLine {
            self.sink
                .lives
                .lock()
                .unwrap()
                .iter()
                .rev()
                .find(|l| l.id == id)
                .cloned()
                .expect("dòng đang nói phải có")
        }

        fn live_count(&self) -> usize {
            self.sink.lives.lock().unwrap().len()
        }

        fn live_ends(&self) -> Vec<u64> {
            self.sink.live_ends.lock().unwrap().clone()
        }

        fn trail(&self) -> Vec<String> {
            self.sink.trail.lock().unwrap().clone()
        }

        /// Câu kế tiếp của lượt cuối được gửi đi dịch; bản tạm gửi trước nó (nếu có) bị bỏ qua.
        fn job(&self) -> MtJob {
            loop {
                match self.jobs.try_recv() {
                    Ok(Work::Final(j)) => return j,
                    Ok(Work::Live(_)) => continue,
                    Err(_) => panic!("phải có câu được gửi đi dịch"),
                }
            }
        }

        /// Không có câu nào của lượt cuối được gửi đi dịch (bản tạm không tính).
        fn no_job(&self) {
            while let Ok(work) = self.jobs.try_recv() {
                assert!(matches!(work, Work::Live(_)), "không được gửi thêm câu nào đi dịch");
            }
        }

        /// Bản tạm kế tiếp được gửi đi dịch.
        fn live_job(&self) -> LiveJob {
            match self.jobs.try_recv() {
                Ok(Work::Live(j)) => j,
                Ok(Work::Final(j)) => panic!("cần bản tạm, có câu {} của lượt cuối", j.sub_id),
                Err(_) => panic!("phải có bản tạm được gửi đi dịch"),
            }
        }

        /// Không có việc nào (lượt cuối hay bản tạm) được gửi đi dịch.
        fn nothing_sent(&self) {
            assert!(self.jobs.try_recv().is_err(), "không được gửi việc nào đi dịch");
        }

        /// Luồng dịch gửi một gói của bản tạm `job`.
        fn live_delta(&mut self, job: &LiveJob, text: &str) -> bool {
            self.feed(Msg::LiveDelta {
                job: job.job,
                text: text.into(),
            })
        }

        /// Bản tạm `job` kết thúc `after_ms` sau lúc tạo yêu cầu chép từng phần (`t0`).
        fn live_done(&mut self, job: &LiveJob, outcome: Outcome, after_ms: u64) -> bool {
            self.feed(Msg::LiveDone {
                job: job.job,
                outcome,
                finished: self.t0 + Duration::from_millis(after_ms),
            })
        }

        /// Luồng dịch gửi một phần chữ của `job`.
        fn delta(&mut self, job: &MtJob, text: &str) -> bool {
            self.feed(Msg::MtDelta {
                sub_id: job.sub_id,
                version: job.version,
                text: text.into(),
            })
        }

        /// Chữ dịch của mọi upsert của phụ đề `id`, theo thứ tự.
        fn tgt_texts(&self, id: u64) -> Vec<String> {
            self.sink
                .subs
                .lock()
                .unwrap()
                .iter()
                .filter(|s| s.id == id)
                .map(|s| s.tgt_text.clone())
                .collect()
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

    /// Lần làm nóng đầu phiên báo `llama-server` không dùng được: chỉ báo bật ngay, câu đầu tiên không được gửi đi dịch.
    #[test]
    fn an_unavailable_server_at_warmup_raises_the_indicator_before_any_sentence() {
        let mut h = harness();
        h.feed(Msg::MtUnavailable("quá 5 lần lỗi".into()));
        assert!(
            h.sink
                .indicators
                .lock()
                .unwrap()
                .last()
                .unwrap()
                .translation_unavailable
        );
        h.said(1, 0, 1_000, "en", "One.");
        h.no_job();
        assert_eq!(h.statuses(1), [Status::AsrDone, Status::Failed]);
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

    /// A2 (spec 2026-10-10 §8; H2 của kế hoạch 00): câu được ghép thêm đoạn thì bản dịch đang hiện không bị xóa; bản dịch
    /// mới chỉ thay vào khi đã dài ít nhất bằng nó (đếm ký tự), bằng một upsert; từ đó chữ mới tới bằng delta như thường.
    #[test]
    fn a_merge_keeps_the_shown_translation_until_the_new_one_is_as_long() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.delta(&j1, "chúng tôi");
        h.delta(&j1, " đã đi");
        h.finish(&j1, done("chúng tôi đã đi"));
        h.said(2, 1_300, 2_000, "en", "home.");
        let j2 = h.job();
        assert_eq!((j2.version, j2.text.as_str()), (2, "so we went home."));
        let grown = h.last(1);
        assert_eq!(
            (grown.status, grown.tgt_text.as_str()),
            (Status::Translating, "chúng tôi đã đi"),
            "bản cũ vẫn hiện"
        );
        let deltas_before = h.sink.deltas.lock().unwrap().len();
        h.delta(&j2, "chúng tôi");
        h.delta(&j2, " về");
        assert_eq!(
            h.last(1).tgt_text,
            "chúng tôi đã đi",
            "bản mới (12 ký tự) còn ngắn hơn bản cũ (15)"
        );
        h.delta(&j2, " nhà.");
        assert_eq!(h.last(1).tgt_text, "chúng tôi về nhà.", "đủ dài: thay vào bằng upsert");
        assert_eq!(
            h.sink.deltas.lock().unwrap().len(),
            deltas_before,
            "chữ của bản mới chưa đi bằng delta"
        );
        h.delta(&j2, " Xong");
        let last_delta = h.sink.deltas.lock().unwrap().last().cloned().unwrap();
        assert_eq!(
            (last_delta.id, last_delta.text.as_str()),
            (1, " Xong"),
            "sau khi thay: delta như thường"
        );
        h.finish(&j2, done("chúng tôi về nhà. Xong"));
        assert_eq!(h.last(1).tgt_text, "chúng tôi về nhà. Xong");
        let tgts = h.tgt_texts(1);
        let first = tgts.iter().position(|t| !t.is_empty()).unwrap();
        assert!(
            tgts[first..].iter().all(|t| !t.is_empty()),
            "không lúc nào xóa trắng: {tgts:?}"
        );
    }

    /// A2: câu được ghép thêm khi bản dịch đầu còn đang tới: phần đã hiện được giữ, cả lúc câu chờ luồng dịch trả bản cũ
    /// (đã hủy) lẫn lúc gửi đi dịch lại.
    #[test]
    fn a_sentence_growing_mid_translation_keeps_the_partial_text() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.delta(&j1, "chúng tôi");
        h.said(2, 1_300, 2_000, "en", "home.");
        assert!(j1.cancel.load(Ordering::SeqCst));
        let waiting = h.last(1);
        assert_eq!(
            (waiting.status, waiting.tgt_text.as_str()),
            (Status::AsrDone, "chúng tôi")
        );
        h.finish(&j1, Outcome::Cancelled);
        let j2 = h.job();
        assert_eq!(h.last(1).tgt_text, "chúng tôi", "gửi đi dịch không xóa bản đang giữ");
        h.delta(&j2, "chúng tôi về nhà.");
        assert_eq!(h.last(1).tgt_text, "chúng tôi về nhà.");
    }

    /// A2: lần dịch đầu của câu mới hỏng (thử lại) trong lúc đang giữ bản cũ: chỉ bỏ chữ mới, bản cũ vẫn hiện; lần thử lại
    /// đếm lại từ đầu.
    #[test]
    fn a_retry_while_holding_drops_only_the_fresh_text() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đã đi"));
        h.said(2, 1_300, 2_000, "en", "home.");
        let j2 = h.job();
        h.delta(&j2, "rác rác rác");
        h.feed(Msg::MtRetry {
            sub_id: 1,
            version: j2.version,
        });
        assert_eq!(h.last(1).tgt_text, "chúng tôi đã đi");
        h.delta(&j2, "chúng tôi về nhà.");
        assert_eq!(h.last(1).tgt_text, "chúng tôi về nhà.");
    }

    /// A2: trạng thái cuối không bao giờ mang bản đang giữ: dịch hỏng thì chữ dịch rỗng, bản mới ngắn hơn thì là bản mới.
    #[test]
    fn settling_drops_the_held_translation() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đã đi"));
        h.said(2, 1_300, 2_000, "en", "home");
        let j2 = h.job();
        h.finish(
            &j2,
            Outcome::Failed {
                reason: "x".into(),
                attempts: 2,
                source_tokens: 1,
                completion_tokens: None,
            },
        );
        let failed = h.last(1);
        assert_eq!((failed.status, failed.tgt_text.as_str()), (Status::Failed, ""));
        h.said(3, 2_300, 3_000, "en", "now.");
        let j3 = h.job();
        h.finish(&j3, done("về"));
        let last = h.last(1);
        assert_eq!((last.status, last.tgt_text.as_str()), (Status::Done, "về"));
    }

    /// A2: `settle` bỏ hẳn `held`: câu đang giữ mà dịch hỏng, rồi được ghép tiếp, thì chữ mới đi bằng delta ngay.
    #[test]
    fn a_failed_held_sentence_that_grows_again_streams_at_once() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đã đi"));
        h.said(2, 1_300, 2_000, "en", "home");
        let j2 = h.job();
        h.finish(
            &j2,
            Outcome::Failed {
                reason: "x".into(),
                attempts: 2,
                source_tokens: 1,
                completion_tokens: None,
            },
        );
        h.said(3, 2_300, 3_000, "en", "now.");
        let j3 = h.job();
        h.delta(&j3, "về");
        let last = h.sink.deltas.lock().unwrap().last().cloned();
        assert_eq!(last.map(|d| (d.id, d.text)), Some((1, "về".to_string())));
    }

    /// A2: ghép lần hai khi bản mới còn dở: chữ dở bị bỏ, tin của job đã hủy bị bỏ, bản giữ vẫn là bản gốc.
    #[test]
    fn a_sentence_growing_twice_while_holding_drops_the_stale_fresh_text() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đã đi"));
        h.said(2, 1_300, 2_000, "en", "home");
        let j2 = h.job();
        h.delta(&j2, "chúng tôi");
        h.said(3, 2_300, 3_000, "en", "now");
        h.delta(&j2, " về nhà bây giờ rồi đó");
        h.finish(&j2, done("chúng tôi về nhà bây giờ rồi đó"));
        let j3 = h.job();
        assert_eq!((j3.version, h.last(1).tgt_text.as_str()), (3, "chúng tôi đã đi"));
        h.delta(&j3, "giờ chúng tôi về");
        assert_eq!(h.last(1).tgt_text, "giờ chúng tôi về");
    }

    /// A2: bản mới (xong) ngắn hơn bản đang giữ: bản cũ còn hiện tới lúc xong, rồi trạng thái cuối là bản mới.
    #[test]
    fn a_shorter_new_translation_replaces_the_held_one_when_done() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("vậy là chúng tôi đã đi"));
        h.said(2, 1_300, 2_000, "en", "home.");
        let j2 = h.job();
        h.delta(&j2, "về nhà.");
        assert_eq!(h.last(1).tgt_text, "vậy là chúng tôi đã đi");
        h.finish(&j2, done("về nhà."));
        let last = h.last(1);
        assert_eq!((last.status, last.tgt_text.as_str()), (Status::Done, "về nhà."));
    }

    /// H1: luồng dịch truyền cờ hủy của câu cho `translate`, nên câu bị hủy dừng ngay cả khi hậu xử lý chưa hiện chữ nào
    /// (server chỉ trả khoảng trắng).
    #[test]
    fn the_translation_thread_stops_a_cancelled_job_while_text_is_held() {
        struct Blank {
            calls: usize,
            sent: Arc<AtomicU64>,
        }
        impl Mt for Blank {
            fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
                Ok(text.split_whitespace().count())
            }
            fn stream(
                &mut self,
                _: &ChatRequest,
                on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
            ) -> Result<StreamEnd, MtError> {
                self.calls += 1;
                if self.calls == 1 {
                    return Ok(StreamEnd::default()); // lần làm nóng
                }
                for _ in 0..10_000 {
                    self.sent.fetch_add(1, Ordering::SeqCst);
                    std::thread::sleep(Duration::from_millis(1));
                    if on_delta(" ").is_break() {
                        return Ok(StreamEnd {
                            cancelled: true,
                            ..StreamEnd::default()
                        });
                    }
                }
                Ok(StreamEnd::default())
            }
        }
        let sent = Arc::new(AtomicU64::new(0));
        let (jobs_tx, jobs_rx) = mpsc::channel::<Work>();
        let (tx, rx) = mpsc::channel::<Msg>();
        let mt = Box::new(Blank {
            calls: 0,
            sent: sent.clone(),
        });
        let thread = std::thread::spawn(move || {
            mt_loop(
                mt,
                jobs_rx,
                &tx,
                &MtConfig::default(),
                Lang::Vi,
                &AtomicBool::new(false),
                &SharedGlossary::default(),
            )
        });
        let cancel = Arc::new(AtomicBool::new(false));
        jobs_tx
            .send(Work::Final(MtJob {
                sub_id: 1,
                version: 1,
                src: Lang::En,
                text: "Hello there".into(),
                context: None,
                cancel: cancel.clone(),
            }))
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while sent.load(Ordering::SeqCst) < 5 {
            assert!(Instant::now() < deadline, "stream phải bắt đầu");
            std::thread::sleep(Duration::from_millis(1));
        }
        cancel.store(true, Ordering::SeqCst);
        let outcome = loop {
            match rx
                .recv_timeout(Duration::from_secs(2))
                .expect("câu bị hủy phải xong trong 2 giây")
            {
                Msg::MtDone { outcome, .. } => break outcome,
                _ => continue,
            }
        };
        assert_eq!(outcome, Outcome::Cancelled);
        assert!(sent.load(Ordering::SeqCst) < 10_000);
        drop(jobs_tx);
        thread.join().unwrap();
    }

    /// H6: máy chưa đủ sức thì chỉ báo "dịch sau mỗi câu" bật ngay đầu phiên, công tắc bật hay tắt cũng vậy (công tắc
    /// mặc định bật, spec 2026-10-10 §6.3); máy đủ sức thì không có sự kiện nào.
    #[test]
    fn an_unsupported_machine_reports_streaming_unavailable_at_the_start() {
        for enabled in [false, true] {
            let h = harness_with(
                EngineConfig {
                    streaming_supported: false,
                    streaming_enabled: enabled,
                    ..cfg()
                },
                Sink::default(),
            );
            let indicators = h.sink.indicators.lock().unwrap().clone();
            assert_eq!(
                indicators,
                [Indicators {
                    streaming_unavailable: true,
                    ..Indicators::default()
                }],
                "công tắc {enabled}"
            );
            assert!(!h.flags.streaming.active(), "công tắc {enabled}");
        }
        assert!(harness().sink.indicators.lock().unwrap().is_empty());
    }

    /// Cờ "dịch sau mỗi câu" giữ suốt phiên: chỉ báo phát sau vẫn mang nó, vì app thay cả `Indicators` mỗi lần nhận.
    #[test]
    fn streaming_unavailable_stays_on_in_later_indicators() {
        let mut h = harness_with(
            EngineConfig {
                streaming_supported: false,
                ..cfg()
            },
            Sink::default(),
        );
        h.c.handle(Msg::NoAudio(true));
        assert_eq!(
            h.sink.indicators.lock().unwrap().last(),
            Some(&Indicators {
                no_audio: true,
                streaming_unavailable: true,
                ..Indicators::default()
            })
        );
    }

    /// Spec 2026-10-10 §6.3: công tắc đổi được giữa phiên; tự tắt thì bật lại cũng không có hiệu lực (§5).
    #[test]
    fn the_streaming_switch_can_change_mid_session() {
        let config = EngineConfig {
            streaming_enabled: true,
            ..cfg()
        };
        let (engine, _sink) = start(live(Vec::new()), energy(), Box::new(ConstAsr("x")), quick_mt(), config);
        assert!(engine.flags.streaming.active());
        engine.set_streaming_enabled(false);
        assert!(!engine.flags.streaming.active());
        engine.set_streaming_enabled(true);
        assert!(engine.flags.streaming.active());
        engine.flags.streaming.auto_off.store(true, Ordering::SeqCst);
        assert!(!engine.flags.streaming.active());
        engine.set_streaming_enabled(false);
        engine.set_streaming_enabled(true);
        assert!(!engine.flags.streaming.active(), "đã tự tắt thì tới hết phiên");
        engine.stop();
    }

    /// H6: chế độ có hiệu lực = máy đủ sức && công tắc && chưa tự tắt. Hai cờ khác nhau, nên nhầm `streaming_supported`
    /// với `streaming_enabled` (ở `Flags::new`, `Streaming::active` hay `set_streaming_enabled`) lộ ra.
    #[test]
    fn the_switch_takes_effect_only_on_a_supported_machine() {
        for (supported, enabled) in [(false, true), (false, false), (true, false)] {
            let config = EngineConfig {
                streaming_supported: supported,
                streaming_enabled: enabled,
                ..cfg()
            };
            let (engine, _sink) = start(live(Vec::new()), energy(), Box::new(ConstAsr("x")), quick_mt(), config);
            assert!(!engine.flags.streaming.active(), "{supported} {enabled}");
            engine.set_streaming_enabled(true);
            assert_eq!(engine.flags.streaming.active(), supported, "{supported} {enabled}");
            engine.stop();
        }
    }

    #[test]
    fn indicators_name_streaming_unavailable_in_camel_case() {
        let i = Indicators {
            streaming_unavailable: true,
            ..Indicators::default()
        };
        assert_eq!(
            serde_json::to_value(&i).unwrap(),
            serde_json::json!({
                "lagging": false, "noAudio": false, "translationUnavailable": false, "streamingUnavailable": true
            })
        );
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

    // ---- Dịch trong lúc người nói chưa dừng (spec 2026-10-10), phía chữ nguồn. ----

    /// Bản chép từng phần thành dòng đang nói (spec 2026-10-10 §4.2): phần ổn định là phần chung của hai lần liền nhau trừ
    /// từ cuối, không rút lại; bị lọc thì không cập nhật; id là id mà đoạn nhận khi đóng.
    #[test]
    fn partials_become_a_live_line_with_a_stable_prefix() {
        let mut h = live_harness();
        h.partial(4, 1_000, 2_000, "en", Some("so we"));
        let l = h.last_live(4);
        assert_eq!(
            (
                l.id,
                l.extends,
                l.src_lang.as_str(),
                l.src_stable.as_str(),
                l.src_tail.as_str()
            ),
            (4, None, "en", "", "so we")
        );
        h.partial(4, 1_000, 3_000, "en", Some("so we went"));
        let l = h.last_live(4);
        assert_eq!((l.src_stable.as_str(), l.src_tail.as_str()), ("so", " we went"));
        h.partial(4, 1_000, 4_000, "en", Some("so they went home"));
        let l = h.last_live(4);
        assert_eq!(
            (l.src_stable.as_str(), l.src_tail.as_str()),
            ("so", " they went home"),
            "phần ổn định không rút lại"
        );
        assert_eq!(
            (l.tgt_stable.as_str(), l.tgt_tail.as_str()),
            ("", ""),
            "chưa có phần dịch"
        );
        let before = h.live_count();
        h.partial(4, 1_000, 4_500, "en", None);
        assert_eq!(h.live_count(), before, "bị lọc: không cập nhật");
        assert_eq!((h.c.metrics.partials, h.c.metrics.partial_asr_ms.len()), (4, 4));
        h.no_job();
    }

    /// Đoạn mở nối tiếp câu đang mở (cùng tiếng, chưa chốt, trong cửa sổ ghép; §4.3): `extends` là phụ đề đó, và phần nguồn
    /// gồm chữ của câu đó, nối như khi ghép (QĐ6).
    #[test]
    fn a_live_line_extends_the_open_sentence() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let _j1 = h.job();
        h.partial(2, 1_300, 2_300, "en", Some("home and"));
        let l = h.last_live(2);
        assert_eq!(
            (l.extends, l.src_stable.as_str(), l.src_tail.as_str()),
            (Some(1), "so we went", " home and")
        );
        h.partial(2, 1_300, 2_800, "en", Some("home and then"));
        let l = h.last_live(2);
        assert_eq!(
            (l.src_stable.as_str(), l.src_tail.as_str()),
            ("so we went home", " and then")
        );
        h.partial(3, 9_000, 10_000, "en", Some("later"));
        assert_eq!(h.last_live(3).extends, None, "ngoài cửa sổ ghép");
    }

    /// Lượt cuối (§4.5, QĐ5): khi kết quả nhận dạng lượt cuối tới, dòng được phát lại một lần ngay sau upsert tạo phụ đề và
    /// đóng băng (bản chép tới muộn bị bỏ); dòng được gỡ khi phụ đề đó chốt.
    #[test]
    fn the_final_subtitle_replaces_the_live_line_when_it_settles() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let count = h.live_count();
        h.said(1, 0, 1_500, "en", "So we went.");
        let trail = h.trail();
        assert_eq!(
            trail[trail.len() - 3..],
            ["upsert 1", "live 1", "upsert 1"],
            "phát lại ngay sau upsert tạo phụ đề, trước khi gửi đi dịch"
        );
        assert_eq!(h.live_count(), count + 1);
        assert_eq!(h.last_live(1).extends, None, "phụ đề mới có chính id của dòng");
        h.partial(1, 0, 1_400, "en", Some("so we went"));
        assert_eq!(h.live_count(), count + 1, "đóng băng: bỏ bản chép tới muộn");
        assert!(h.live_ends().is_empty(), "lượt cuối chưa dịch xong: dòng vẫn hiện");
        let j1 = h.job();
        h.finish(&j1, done("Chúng tôi đã đi."));
        assert_eq!(h.live_ends(), [1]);
        let trail = h.trail();
        assert_eq!(
            trail[trail.len() - 2..],
            ["upsert 1", "end 1"],
            "gỡ sau upsert chốt phụ đề"
        );
    }

    /// Đoạn được ghép vào câu đang mở: dòng phát lại với `extends` là câu đó ngay sau upsert của câu, và được gỡ khi câu (đã
    /// ghép) chốt, không phải khi bản dịch cũ (bị hủy) báo xong.
    #[test]
    fn a_merged_final_ends_the_live_line_when_the_grown_sentence_settles() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.partial(2, 1_300, 2_000, "en", Some("home"));
        h.said(2, 1_300, 2_000, "en", "home.");
        let trail = h.trail();
        assert_eq!(trail[trail.len() - 2..], ["upsert 1", "live 2"]);
        assert_eq!(h.last_live(2).extends, Some(1));
        h.finish(&j1, Outcome::Cancelled);
        let j2 = h.job();
        assert!(h.live_ends().is_empty());
        h.finish(&j2, done("chúng tôi về nhà."));
        assert_eq!(h.live_ends(), [2]);
    }

    /// Đóng băng khi đoạn được ghép vào câu đang mở (§4.5, QĐ5, QĐ6): dòng phát lại đúng chữ nguồn đang hiện. Lúc đó chữ của
    /// câu đã gồm lượt cuối của chính đoạn này, nên phần nguồn nối sau chữ của câu trước khi ghép, không lặp chữ của đoạn.
    #[test]
    fn a_merged_final_freezes_the_shown_source_without_repeating_it() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        h.partial(2, 1_300, 2_000, "en", Some("home"));
        let shown = h.last_live(2);
        assert_eq!(
            (shown.extends, shown.src_stable.as_str(), shown.src_tail.as_str()),
            (Some(1), "so we went", " home")
        );
        let count = h.live_count();
        h.said(2, 1_300, 2_000, "en", "home.");
        assert_eq!(h.last(1).src_text, "so we went home.");
        assert_eq!(h.live_count(), count + 1, "phát lại một lần lúc đóng băng");
        assert_eq!(
            h.last_live(2),
            shown,
            "giữ chữ đang hiện, không thành \"so we went home. home\""
        );

        // Đoạn đã có phần ổn định.
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        h.partial(2, 1_300, 2_000, "en", Some("home and"));
        h.partial(2, 1_300, 2_500, "en", Some("home and then"));
        let shown = h.last_live(2);
        assert_eq!(
            (shown.src_stable.as_str(), shown.src_tail.as_str()),
            ("so we went home", " and then")
        );
        h.said(2, 1_300, 2_600, "en", "home and then.");
        assert_eq!(h.last_live(2), shown);
    }

    /// Câu ghép từ ba đoạn: hai lần đóng băng liên tiếp cho cùng một câu. Mỗi dòng giữ chữ đang hiện của nó; dòng của đoạn
    /// sau nối tiếp câu đã gồm lượt cuối của đoạn trước; dòng đã đóng băng không được phát lại; không lần phát nào lặp chữ.
    #[test]
    fn each_freeze_of_a_three_segment_sentence_keeps_its_shown_source() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "one two");
        h.partial(2, 1_300, 2_300, "en", Some("three four"));
        h.partial(2, 1_300, 2_800, "en", Some("three four five"));
        let shown2 = h.last_live(2);
        assert_eq!(
            (shown2.extends, shown2.src_stable.as_str(), shown2.src_tail.as_str()),
            (Some(1), "one two three", " four five")
        );
        h.said(2, 1_300, 2_900, "en", "three four five");
        assert_eq!(h.last_live(2), shown2);
        h.partial(3, 3_200, 4_200, "en", Some("six seven"));
        h.partial(3, 3_200, 4_700, "en", Some("six seven eight"));
        let shown3 = h.last_live(3);
        assert_eq!(
            (shown3.extends, shown3.src_stable.as_str(), shown3.src_tail.as_str()),
            (Some(1), "one two three four five six", " seven eight")
        );
        let count = h.live_count();
        h.said(3, 3_200, 4_800, "en", "six seven eight.");
        assert_eq!(h.last(1).src_text, "one two three four five six seven eight.");
        assert_eq!(h.live_count(), count + 1, "chỉ dòng 3 được phát lại");
        assert_eq!(h.last_live(3), shown3);
        assert_eq!(h.last_live(2), shown2);
        for l in h.sink.lives.lock().unwrap().iter() {
            let src = format!("{}{}", l.src_stable, l.src_tail);
            assert!("one two three four five six seven eight".starts_with(&src), "{l:?}");
        }
    }

    /// `extends` đổi lúc đóng băng: dòng vẫn giữ chữ đang hiện của đoạn, chỉ phần đầu theo câu mà dòng giờ thay chỗ (§6.1).
    /// Câu đang mở không nhận lượt cuối (quá trần 15 giây): phụ đề mới, dòng chỉ còn chữ của đoạn, câu cũ hiện lại riêng. Lần
    /// chép nhận nhầm là tiếng đích (không nối tiếp) mà lượt cuối ghép vào câu đang mở: dòng thay chỗ câu đó, nên có chữ của
    /// câu trước khi ghép.
    #[test]
    fn a_freeze_that_changes_extends_keeps_the_segment_text_after_the_new_prefix() {
        let mut h = live_harness();
        h.said(1, 0, 8_000, "en", "a long one");
        h.partial(2, 8_100, 9_000, "en", Some("and more"));
        h.partial(2, 8_100, 9_500, "en", Some("and more stuff"));
        let l = h.last_live(2);
        assert_eq!(
            (l.extends, l.src_stable.as_str(), l.src_tail.as_str()),
            (Some(1), "a long one and", " more stuff")
        );
        h.said(2, 8_100, 16_000, "en", "and more stuff");
        assert_eq!(h.last(2).src_text, "and more stuff", "phụ đề mới");
        let l = h.last_live(2);
        assert_eq!(
            (l.extends, l.src_stable.as_str(), l.src_tail.as_str()),
            (None, "and", " more stuff")
        );

        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        h.partial(2, 1_300, 2_000, "vi", Some("home"));
        assert_eq!(h.last_live(2).extends, None, "tiếng đích không nối tiếp");
        h.said(2, 1_300, 2_000, "en", "home.");
        assert_eq!(h.last(1).src_text, "so we went home.");
        let l = h.last_live(2);
        assert_eq!(
            (l.extends, l.src_stable.as_str(), l.src_tail.as_str()),
            (Some(1), "so we went", " home")
        );
    }

    /// Câu bị gộp ở hàng đợi dịch (§7 spec chính): dòng đang chờ câu đó chuyển sang câu gộp.
    #[test]
    fn a_sentence_merged_in_the_translation_queue_hands_its_live_lines_over() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.said(2, 2_000, 3_000, "en", "Two.");
        h.partial(3, 4_000, 4_500, "en", Some("Three"));
        h.said(3, 4_000, 5_000, "en", "Three.");
        h.said(4, 6_000, 7_000, "en", "Four.");
        h.said(5, 8_000, 9_000, "en", "Five.");
        assert_eq!(h.last(2).replaces, vec![3, 4], "hàng đầy: 2, 3, 4 gộp thành 2");
        h.finish(&j1, done("Một."));
        let j2 = h.job();
        assert_eq!(j2.sub_id, 2);
        assert!(h.live_ends().is_empty());
        h.finish(&j2, done("Hai. Ba. Bốn."));
        assert_eq!(h.live_ends(), [3]);
    }

    /// Đoạn bị lọc hay bị bỏ ở lượt cuối: gỡ dòng ngay (§4.5, §7). Câu đã là ngôn ngữ đích: dòng chỉ hiện câu gốc, và được
    /// gỡ ngay khi có phụ đề `same_lang`.
    #[test]
    fn filtered_dropped_and_same_language_segments_end_their_live_line() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("thank you"));
        h.feed(Msg::Asr(AsrOutcome::Filtered { ids: vec![1] }));
        assert_eq!(h.live_ends(), [1]);
        h.partial(2, 2_000, 3_000, "en", Some("so we"));
        h.feed(Msg::Asr(AsrOutcome::Dropped {
            ids: vec![2],
            start_ms: 2_000,
            end_ms: 3_500,
        }));
        assert_eq!(h.live_ends(), [1, 2]);
        assert_eq!(h.last(2).status, Status::Dropped);
        h.partial(3, 4_000, 5_000, "vi", Some("xin chào"));
        let l = h.last_live(3);
        assert_eq!(
            (l.extends, l.src_tail.as_str(), l.tgt_tail.as_str()),
            (None, "xin chào", "")
        );
        h.said(3, 4_000, 5_000, "vi", "Xin chào.");
        assert_eq!(h.live_ends(), [1, 2, 3]);
        h.no_job();
    }

    /// Luồng phụ đề kết thúc (dừng phiên): gỡ mọi dòng còn lại (§6.2).
    #[test]
    fn the_end_of_the_session_ends_every_live_line() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        h.partial(2, 2_000, 3_000, "en", Some("and"));
        let Harness { c, sink, .. } = h;
        c.finish();
        assert_eq!(sink.live_ends.lock().unwrap().clone(), [1, 2]);
    }

    /// Ngưỡng đóng đoạn đang dùng (H6, spec 2026-10-10 §4.7): ở chế độ này là giá trị lớn hơn của ngưỡng người dùng và
    /// `streaming.end_silence_ms`; chế độ thường giữ ngưỡng người dùng.
    #[test]
    fn the_end_silence_follows_the_mode() {
        let mut p = PipelineConfig::default();
        p.segmenter.end_silence_ms = 300;
        // Đặt rõ, không dựa vào mặc định (Task 21 đổi mặc định theo quyết định ở cổng).
        p.streaming.end_silence_ms = 400;
        assert_eq!((end_silence_for(&p, false), end_silence_for(&p, true)), (300, 400));
        p.segmenter.end_silence_ms = 800;
        assert_eq!(end_silence_for(&p, true), 800, "lấy giá trị lớn hơn");
    }

    /// Cửa sổ ghép theo ngưỡng mà luồng VAD báo (H6): ngưỡng 400 ms cho cửa sổ 800 ms, nên đoạn bắt đầu 750 ms sau đoạn trước
    /// vẫn được ghép; ngưỡng 300 ms (cửa sổ 700 ms) thì không.
    #[test]
    fn the_merge_window_follows_the_threshold_of_the_vad_thread() {
        for (threshold, merges) in [(300, 0), (400, 1)] {
            let mut h = harness();
            h.feed(Msg::Threshold(threshold));
            h.said(1, 0, 1_000, "en", "so we went");
            h.said(2, 1_750, 2_500, "en", "home");
            assert_eq!(h.c.metrics.merges, merges, "ngưỡng {threshold} ms");
        }
    }

    // ---- Dịch trong lúc người nói chưa dừng: bản dịch tạm (spec 2026-10-10 §4.3–§4.6, §5). ----

    /// Bản tạm (§4.3–§4.4): chữ nguồn là lần chép mới nhất; phần dịch ổn định (LocalAgreement-2, giữ lại 1 từ với nguồn
    /// tiếng Anh) là prefill của lần sau; dấu kết câu ở cuối không hiện; `tgt_src_units` là số đơn vị nguồn đã dịch.
    #[test]
    fn live_translations_are_stabilized_and_prefilled() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let j1 = h.live_job();
        assert_eq!(
            (j1.text.as_str(), j1.prefill.as_deref(), j1.src),
            ("so we", None, Lang::En)
        );
        h.live_done(&j1, done("chúng tôi."), 600);
        let l = h.last_live(1);
        assert_eq!(
            (l.tgt_stable.as_str(), l.tgt_tail.as_str(), l.tgt_src_units),
            ("", "chúng tôi", 2)
        );
        h.partial(1, 0, 2_000, "en", Some("so we went"));
        let j2 = h.live_job();
        assert_eq!(j2.prefill, None, "một bản dịch xong chưa đủ để chốt");
        h.live_done(&j2, done("chúng tôi đã đi"), 700);
        let l = h.last_live(1);
        assert_eq!(
            (l.tgt_stable.as_str(), l.tgt_tail.as_str(), l.tgt_src_units),
            ("chúng", " tôi đã đi", 3)
        );
        h.partial(1, 0, 3_000, "en", Some("so we went home"));
        let j3 = h.live_job();
        assert_eq!(
            (j3.text.as_str(), j3.prefill.as_deref()),
            ("so we went home", Some("chúng"))
        );
    }

    /// Bản tạm đang stream chỉ thay chữ đang hiện khi đã dài ít nhất bằng nó (QĐ7), rồi hiện dần từng gói.
    #[test]
    fn a_streaming_live_translation_takes_over_once_it_is_as_long() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let j1 = h.live_job();
        h.live_done(&j1, done("chúng tôi"), 500);
        h.partial(1, 0, 2_000, "en", Some("so we went"));
        let j2 = h.live_job();
        h.live_delta(&j2, "chúng");
        assert_eq!(h.last_live(1).tgt_tail, "chúng tôi", "bản mới còn ngắn hơn");
        h.live_delta(&j2, " tôi");
        assert_eq!(h.last_live(1).tgt_tail, "chúng tôi");
        h.live_delta(&j2, " đã");
        assert_eq!(h.last_live(1).tgt_tail, "chúng tôi đã");
        h.live_delta(&j2, " đi.");
        assert_eq!(h.last_live(1).tgt_tail, "chúng tôi đã đi", "dấu chấm cuối không hiện");
    }

    /// Việc của lượt cuối luôn đi trước (§4.6): bản tạm đang dịch bị hủy; không gửi bản tạm nào khi lượt cuối còn việc; bản
    /// tạm bị hủy được dịch lại (bằng lần chép mới nhất) khi rảnh; vòng bị hủy không tính.
    #[test]
    fn final_translations_go_first() {
        let mut h = live_harness();
        h.partial(2, 3_000, 4_000, "en", Some("and then we"));
        let l1 = h.live_job();
        h.said(1, 0, 1_000, "en", "One.");
        assert!(l1.cancel.load(Ordering::SeqCst), "bản tạm bị hủy");
        let j1 = h.job();
        h.live_done(&l1, Outcome::Cancelled, 100);
        h.nothing_sent();
        h.partial(2, 3_000, 5_000, "en", Some("and then we went"));
        h.nothing_sent();
        h.finish(&j1, done("Một."));
        let l2 = h.live_job();
        assert_eq!(l2.text, "and then we went", "lần chép mới nhất");
        assert!(h.c.metrics.live_cycle_ms.is_empty(), "vòng bị hủy không tính");
    }

    /// Yêu cầu mới thắng (§4.6): lần chép mới tới khi bản tạm đang dịch thì hủy bản đó; xong thì gửi lần mới nhất.
    #[test]
    fn the_newest_partial_wins() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.partial(1, 0, 1_500, "en", Some("so we went"));
        assert!(l1.cancel.load(Ordering::SeqCst));
        h.nothing_sent();
        h.partial(1, 0, 1_800, "en", Some("so we went home"));
        h.live_done(&l1, Outcome::Cancelled, 50);
        assert_eq!(h.live_job().text, "so we went home");
        h.nothing_sent();
    }

    /// Bản tạm lỗi: giữ chữ đang hiện, không thử lại, không tính vòng (§7).
    #[test]
    fn a_failed_live_translation_keeps_the_shown_text() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.live_done(&l1, done("chúng tôi"), 400);
        h.partial(1, 0, 2_000, "en", Some("so we went"));
        let l2 = h.live_job();
        h.live_delta(&l2, "chúng tôi đã");
        h.live_done(
            &l2,
            Outcome::Failed {
                reason: "x".into(),
                attempts: 1,
                source_tokens: 3,
                completion_tokens: None,
            },
            500,
        );
        assert_eq!(h.last_live(1).tgt_tail, "chúng tôi đã", "giữ chữ đang hiện");
        h.nothing_sent();
        assert_eq!(h.c.metrics.live_cycle_ms, [400.0]);
    }

    /// Nhịp T (§5): sau 3 vòng, T = 1,5 × trung vị, ghi vào cờ dùng chung cho luồng VAD.
    #[test]
    fn completed_cycles_set_the_cadence() {
        let mut h = live_harness();
        assert_eq!(h.flags.streaming.cadence_ms.load(Ordering::SeqCst), 1_000);
        for (i, (text, cycle)) in [("so", 500u64), ("so we", 700), ("so we went", 600)]
            .into_iter()
            .enumerate()
        {
            h.partial(1, 0, 1_000 + i as u64 * 500, "en", Some(text));
            let job = h.live_job();
            h.live_done(&job, done("chúng tôi"), cycle);
        }
        assert_eq!(h.flags.streaming.cadence_ms.load(Ordering::SeqCst), 900);
        assert_eq!(h.c.metrics.live_cycle_ms, [500.0, 700.0, 600.0]);
        assert_eq!(h.c.metrics.cadence_ms, [1_000.0, 1_000.0, 900.0]);
    }

    /// Dòng nối tiếp câu A (§4.3, QĐ6): chữ nguồn đem dịch là A nối với chữ của đoạn; `tgt_src_units` đếm cả câu nối.
    #[test]
    fn a_live_job_for_an_extended_sentence_translates_the_joined_text() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đã đi"));
        h.partial(2, 1_300, 2_000, "en", Some("home and"));
        let l = h.live_job();
        assert_eq!(
            (l.text.as_str(), l.prefill.as_deref(), l.src),
            ("so we went home and", None, Lang::En)
        );
        h.live_done(&l, done("chúng tôi đã về nhà và"), 300);
        let line = h.last_live(2);
        assert_eq!(
            (line.extends, line.tgt_tail.as_str(), line.tgt_src_units),
            (Some(1), "chúng tôi đã về nhà và", 5)
        );
    }

    /// Đóng băng làm đổi `extends` (câu đang mở không nhận lượt cuối vì quá trần 15 giây: phụ đề mới, `extends` thành `None`):
    /// phần dịch tạm đã dịch theo chữ nguồn có câu cũ ở đầu, không còn khớp chữ nguồn mới của dòng, nên bị xóa (chốt lại từ
    /// đầu, cùng luật với `refresh_extends`). Đóng băng không đổi `extends` (đoạn được ghép vào câu đang mở) thì dòng giữ
    /// nguyên phần dịch đang hiện.
    #[test]
    fn freezing_with_a_changed_extends_clears_the_stale_translation() {
        let mut h = live_harness();
        h.said(1, 0, 8_000, "en", "a long one");
        let j1 = h.job();
        h.finish(&j1, done("một câu dài"));
        h.partial(2, 8_100, 9_000, "en", Some("and more"));
        let l1 = h.live_job();
        assert_eq!(l1.text, "a long one and more");
        h.live_done(&l1, done("một câu dài và hơn"), 300);
        h.partial(2, 8_100, 9_500, "en", Some("and more stuff"));
        let l2 = h.live_job();
        assert_eq!(l2.text, "a long one and more stuff");
        h.live_done(&l2, done("một câu dài và hơn nữa"), 300);
        let shown = h.last_live(2);
        assert_eq!(
            (
                shown.extends,
                shown.tgt_stable.as_str(),
                shown.tgt_tail.as_str(),
                shown.tgt_src_units
            ),
            (Some(1), "một câu dài và", " hơn nữa", 6)
        );
        h.said(2, 8_100, 16_000, "en", "and more stuff");
        assert_eq!(h.last(2).src_text, "and more stuff", "phụ đề mới");
        let l = h.last_live(2);
        assert_eq!(
            (
                l.extends,
                l.src_stable.as_str(),
                l.src_tail.as_str(),
                l.tgt_stable.as_str(),
                l.tgt_tail.as_str(),
                l.tgt_src_units
            ),
            (None, "and", " more stuff", "", "", 0),
            "bản dịch cũ (có \"một câu dài\" ở đầu) không còn hiện"
        );

        // `extends` không đổi lúc đóng băng: giữ phần dịch đang hiện.
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đã đi"));
        h.partial(2, 1_300, 2_000, "en", Some("home and"));
        let l = h.live_job();
        h.live_done(&l, done("chúng tôi đã về nhà và"), 300);
        let shown = h.last_live(2);
        assert_eq!(
            (shown.extends, shown.tgt_tail.as_str()),
            (Some(1), "chúng tôi đã về nhà và")
        );
        h.said(2, 1_300, 2_100, "en", "home and.");
        assert_eq!(h.last(1).src_text, "so we went home and.");
        assert_eq!(h.last_live(2), shown);
    }

    /// [review] Dòng thôi nối tiếp câu 1 trong lúc bản tạm (dịch "câu 1 + đoạn") đang chạy (lần chép mới vượt trần 15 giây):
    /// gói chữ và kết quả của bản tạm đó tới sau đều bị bỏ; bản kế tiếp dịch riêng chữ của đoạn, không prefill.
    #[test]
    fn review_results_for_the_old_extends_are_dropped() {
        let mut h = live_harness();
        h.said(1, 0, 8_000, "en", "a long one");
        let j1 = h.job();
        h.finish(&j1, done("một câu dài"));
        h.partial(2, 8_100, 9_000, "en", Some("and more"));
        let l1 = h.live_job();
        assert_eq!(l1.text, "a long one and more");
        h.partial(2, 8_100, 16_000, "en", Some("and more stuff"));
        assert!(l1.cancel.load(Ordering::SeqCst));
        assert_eq!(h.last_live(2).extends, None, "quá trần: không nối tiếp nữa");
        h.live_delta(&l1, "một câu dài và hơn");
        h.live_done(&l1, done("một câu dài và hơn"), 300);
        let l = h.last_live(2);
        assert_eq!((l.extends, l.tgt_stable.as_str(), l.tgt_tail.as_str()), (None, "", ""));
        let l2 = h.live_job();
        assert_eq!((l2.text.as_str(), l2.prefill.as_deref()), ("and more stuff", None));
    }

    /// [review] Lượt cuối của đoạn bị lọc: dòng bị gỡ, bản tạm đang dịch của nó bị hủy ngay (không phí luồng dịch).
    #[test]
    fn review_a_filtered_final_cancels_the_live_translation() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.feed(Msg::Asr(AsrOutcome::Filtered { ids: vec![1] }));
        assert!(l1.cancel.load(Ordering::SeqCst), "bản tạm của dòng đã gỡ bị hủy");
        assert_eq!(h.live_ends(), [1]);
        h.live_done(&l1, Outcome::Cancelled, 100);
        h.nothing_sent();
    }

    /// [review] Bản tạm đang stream thay chữ đang hiện: `tgt_src_units` là số đơn vị nguồn của bản đó (dùng để đo, QĐ10).
    #[test]
    fn review_a_streaming_takeover_reports_its_source_units() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let j1 = h.live_job();
        h.live_done(&j1, done("chúng tôi"), 500);
        assert_eq!(h.last_live(1).tgt_src_units, 2);
        h.partial(1, 0, 2_000, "en", Some("so we went"));
        let j2 = h.live_job();
        h.live_delta(&j2, "chúng tôi đã");
        let l = h.last_live(1);
        assert_eq!((l.tgt_tail.as_str(), l.tgt_src_units), ("chúng tôi đã", 3));
    }

    /// [review] Lần chép mới vượt trần 15 giây nên dòng thôi nối tiếp câu 1: phần dịch (ổn định và tạm, của "câu 1 + đoạn")
    /// bị xóa ngay, và bản tạm kế tiếp dịch riêng chữ của đoạn, không prefill phần dịch cũ (cùng luật `refresh_extends`).
    #[test]
    fn review_leaving_the_open_sentence_restarts_the_translation() {
        let mut h = live_harness();
        h.said(1, 0, 8_000, "en", "a long one");
        let j1 = h.job();
        h.finish(&j1, done("một câu dài"));
        h.partial(2, 8_100, 9_000, "en", Some("and more"));
        let l1 = h.live_job();
        h.live_done(&l1, done("một câu dài và hơn"), 300);
        h.partial(2, 8_100, 9_500, "en", Some("and more stuff"));
        let l2 = h.live_job();
        h.live_done(&l2, done("một câu dài và hơn nữa"), 300);
        assert_eq!(h.last_live(2).tgt_stable, "một câu dài và");
        h.partial(2, 8_100, 16_000, "en", Some("and more stuff here"));
        let l = h.last_live(2);
        assert_eq!(
            (l.extends, l.tgt_stable.as_str(), l.tgt_tail.as_str(), l.tgt_src_units),
            (None, "", "", 0)
        );
        let l3 = h.live_job();
        assert_eq!((l3.text.as_str(), l3.prefill.as_deref()), ("and more stuff here", None));
    }

    /// [review] (n, k) của phần dịch theo tiếng nguồn (§4.4): nguồn tiếng Hàn cần 3 bản dịch xong khớp nhau và giữ lại 2 từ
    /// (đích tiếng Việt thì 2 và 1).
    #[test]
    fn review_the_translation_agreement_follows_the_source_language() {
        let mut h = live_harness();
        let steps = [
            ("저는 오늘", "tôi hôm nay đi", ""),
            ("저는 오늘 학교에", "tôi hôm nay đi học", ""),
            ("저는 오늘 학교에 갑니다", "tôi hôm nay đi học ở", "tôi hôm"),
        ];
        for (i, (text, translation, stable)) in steps.into_iter().enumerate() {
            h.partial(1, 0, 1_000 + i as u64 * 500, "ko", Some(text));
            let l = h.live_job();
            h.live_done(&l, done(translation), 300);
            assert_eq!(h.last_live(1).tgt_stable, stable, "sau bản dịch thứ {}", i + 1);
        }
    }

    /// [review] Lần chép từng phần mang theo lúc luồng VAD tạo yêu cầu (mốc đầu của vòng cập nhật, §5), không phải lúc chép
    /// xong.
    #[test]
    fn review_a_partial_carries_the_time_it_was_requested() {
        let (queue, rx, thread) = asr_thread(ScriptedAsr {
            replies: vec![Ok(("en", "so we went"))],
            seen: Arc::default(),
        });
        let p = partial_request(7, 1_500);
        let requested = p.requested.checked_sub(Duration::from_millis(400)).unwrap();
        put_partial(&queue, PartialRequest { requested, ..p });
        let AsrOutcome::Partial(t) = next_asr(&rx) else {
            panic!("phải là chép từng phần")
        };
        assert_eq!(t.requested, requested);
        queue.close();
        thread.join().unwrap();
    }

    /// [review] Đóng băng làm `extends` đổi từ `None` sang `Some` (lần chép từng phần khóa tiếng Pháp nên không nối tiếp câu
    /// 1, lượt cuối nhận là tiếng Anh nên được ghép vào câu 1): phần dịch tạm (dịch riêng chữ của đoạn) không còn khớp chữ
    /// nguồn mới của dòng (câu 1 nối chữ của đoạn), phải bị xóa.
    #[test]
    fn review_freezing_from_none_to_some_extends_clears_the_translation() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đã đi"));
        h.partial(2, 1_300, 2_000, "fr", Some("à la maison"));
        let l = h.live_job();
        assert_eq!(l.text, "à la maison", "không nối tiếp câu 1 (khác ngôn ngữ)");
        h.live_done(&l, done("về nhà"), 300);
        let shown = h.last_live(2);
        assert_eq!((shown.extends, shown.tgt_tail.as_str()), (None, "về nhà"));
        h.said(2, 1_300, 2_100, "en", "home.");
        assert_eq!(h.last(1).src_text, "so we went home.", "lượt cuối được ghép vào câu 1");
        let l = h.last_live(2);
        assert_eq!(
            (l.extends, l.tgt_stable.as_str(), l.tgt_tail.as_str(), l.tgt_src_units),
            (Some(1), "", "", 0)
        );
    }

    /// `llama-server` không dùng được (§7): báo chỉ báo, dòng đang nói chỉ còn câu gốc, không gửi bản tạm nào nữa.
    #[test]
    fn an_unavailable_server_leaves_live_lines_with_the_source_only() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.live_done(&l1, done("chúng tôi"), 300);
        h.partial(1, 0, 2_000, "en", Some("so we went"));
        let l2 = h.live_job();
        h.live_done(&l2, Outcome::Unavailable("quá 5 lần".into()), 300);
        let l = h.last_live(1);
        assert_eq!((l.tgt_stable.as_str(), l.tgt_tail.as_str()), ("", ""));
        assert!(
            h.sink
                .indicators
                .lock()
                .unwrap()
                .last()
                .unwrap()
                .translation_unavailable
        );
        h.partial(1, 0, 3_000, "en", Some("so we went home"));
        h.nothing_sent();
    }

    /// Luồng dịch chạy bản tạm bằng `translate_live`: prefill đi kèm request, chữ về bằng `LiveDelta`, kết thúc bằng
    /// `LiveDone` có thời điểm xong.
    #[test]
    fn the_translation_thread_runs_live_jobs_with_the_prefill() {
        struct Echo(Arc<Mutex<Vec<Option<String>>>>);
        impl Mt for Echo {
            fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
                Ok(text.split_whitespace().count())
            }
            fn stream(
                &mut self,
                req: &ChatRequest,
                on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
            ) -> Result<StreamEnd, MtError> {
                self.0.lock().unwrap().push(req.prefill.map(String::from));
                let mut text = String::new();
                for chunk in [req.prefill.unwrap_or("chúng"), " tôi"] {
                    text.push_str(chunk);
                    if on_delta(chunk).is_break() {
                        return Ok(StreamEnd {
                            text,
                            cancelled: true,
                            ..StreamEnd::default()
                        });
                    }
                }
                Ok(StreamEnd {
                    text,
                    finish_reason: Some("stop".into()),
                    chunks: 2,
                    ..StreamEnd::default()
                })
            }
        }
        let prefills = Arc::new(Mutex::new(Vec::new()));
        let (jobs_tx, jobs_rx) = mpsc::channel::<Work>();
        let (tx, rx) = mpsc::channel::<Msg>();
        let thread = {
            let mt = Box::new(Echo(prefills.clone()));
            std::thread::spawn(move || {
                mt_loop(
                    mt,
                    jobs_rx,
                    &tx,
                    &MtConfig::default(),
                    Lang::Vi,
                    &AtomicBool::new(false),
                    &SharedGlossary::default(),
                )
            })
        };
        let before = Instant::now();
        jobs_tx
            .send(Work::Live(LiveJob {
                job: 7,
                src: Lang::En,
                text: "so we went".into(),
                context: None,
                prefill: Some("chúng".into()),
                cancel: Arc::default(),
            }))
            .unwrap();
        let mut deltas = Vec::new();
        let (outcome, finished) = loop {
            match rx.recv_timeout(Duration::from_secs(5)).expect("phải có kết quả") {
                Msg::LiveDelta { job: 7, text } => deltas.push(text),
                Msg::LiveDone {
                    job: 7,
                    outcome,
                    finished,
                } => break (outcome, finished),
                _ => {}
            }
        };
        assert_eq!(deltas, ["chúng", " tôi"]);
        assert!(
            matches!(outcome, Outcome::Done(ref t) if t.text == "chúng tôi"),
            "{outcome:?}"
        );
        assert!(finished >= before);
        drop(jobs_tx);
        thread.join().unwrap();
        assert_eq!(
            *prefills.lock().unwrap(),
            [None, Some("chúng".to_string())],
            "lần làm nóng rồi bản tạm"
        );
    }

    /// Tự tắt (spec §5): đủ 8 vòng mà trung vị quá 1 300 ms thì chế độ này tắt tới hết phiên: cờ cho luồng VAD, chỉ báo, gỡ
    /// mọi dòng, bỏ bản chép tới sau, không gửi bản tạm nào nữa.
    #[test]
    fn slow_cycles_turn_the_mode_off_for_the_session() {
        let mut h = live_harness();
        for i in 0..8u64 {
            let text = format!("so we went {i}");
            h.partial(1, 0, 1_000 + i * 300, "en", Some(text.as_str()));
            let job = h.live_job();
            h.live_done(&job, done("chúng tôi"), 1_400);
        }
        assert!(h.flags.streaming.auto_off.load(Ordering::SeqCst));
        assert!(!h.flags.streaming.active());
        assert!(h.c.metrics.streaming_auto_off);
        assert!(h.sink.indicators.lock().unwrap().last().unwrap().streaming_unavailable);
        assert_eq!(h.live_ends(), [1]);
        let count = h.live_count();
        h.partial(2, 5_000, 6_000, "en", Some("new words"));
        assert_eq!(h.live_count(), count, "đã tự tắt: bỏ bản chép");
        h.nothing_sent();
    }

    /// Bấm Dừng: bản tạm đang dịch dừng, không gửi bản tạm mới, bỏ bản chép tới sau; dòng còn lại được gỡ khi luồng phụ đề
    /// kết thúc (§6.2).
    #[test]
    fn stopping_cancels_live_work_and_ends_the_lines_at_exit() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.flags.hurry.store(true, Ordering::SeqCst);
        assert!(!h.c.step());
        assert!(l1.cancel.load(Ordering::SeqCst));
        h.live_done(&l1, Outcome::Cancelled, 10);
        let count = h.live_count();
        h.partial(1, 0, 1_500, "en", Some("so we went"));
        assert_eq!(h.live_count(), count, "đang dừng: bỏ bản chép");
        h.nothing_sent();
        assert!(h.live_ends().is_empty());
        let Harness { c, sink, .. } = h;
        c.finish();
        assert_eq!(sink.live_ends.lock().unwrap().clone(), [1]);
    }

    /// Hết hạn mức: gỡ mọi dòng ngay, hủy bản tạm.
    #[test]
    fn reaching_the_quota_ends_every_live_line() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.flags.quota.store(true, Ordering::SeqCst);
        h.c.step();
        assert!(l1.cancel.load(Ordering::SeqCst));
        assert_eq!(h.live_ends(), [1]);
        h.nothing_sent();
    }

    /// Hết hạn dừng: gỡ mọi dòng ngay.
    #[test]
    fn the_end_of_the_stop_grace_ends_every_live_line() {
        let mut config = cfg();
        config.streaming_enabled = true;
        config.pipeline.mt.stop_grace_ms = 0;
        let mut h = harness_with(config, Sink::default());
        h.partial(1, 0, 1_000, "en", Some("so we"));
        h.flags.hurry.store(true, Ordering::SeqCst);
        assert!(h.c.step(), "hết hạn: luồng phụ đề thoát");
        assert_eq!(h.live_ends(), [1]);
    }

    // ---- Luồng nhận dạng: chép từng phần (spec 2026-10-10 §4.1). ----

    /// Mọi yêu cầu đã gửi: (id, số mẫu, ngôn ngữ cho phép, ngôn ngữ đoạn trước, số token prompt).
    type Seen = Arc<Mutex<Vec<(u64, usize, Vec<String>, Option<String>, usize)>>>;

    /// Nhận dạng giả theo kịch bản; ghi mọi yêu cầu vào `seen`.
    struct ScriptedAsr {
        replies: Vec<Result<(&'static str, &'static str), AsrFailure>>,
        seen: Seen,
    }

    impl Asr for ScriptedAsr {
        fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
            self.seen.lock().unwrap().push((
                req.segment_id,
                req.pcm.len(),
                req.languages.clone(),
                req.prev_lang.clone(),
                req.prompt_tokens.len(),
            ));
            let (lang, text) = self.replies.remove(0)?;
            Ok(TranscribeResult {
                segment_id: req.segment_id,
                lang: lang.into(),
                lang_prob: 1.0,
                text: text.into(),
                tokens: vec![1, 2, 3],
                no_speech_prob: 0.0,
                lid_ms: 1.0,
                asr_ms: 2.0,
                avg_logprob: -0.2,
            })
        }
    }

    /// Yêu cầu chép từng phần của đoạn `id`, `ms` mili giây âm thanh từ mốc 1 000 ms.
    fn partial_request(id: u64, ms: u64) -> PartialRequest {
        PartialRequest {
            id,
            start_ms: 1_000,
            upto_ms: 1_000 + ms,
            speech_ms: ms,
            mean_prob: 0.9,
            samples: vec![0.1; ms as usize * 16],
            requested: Instant::now(),
        }
    }

    fn put_partial(queue: &SharedQueue, p: PartialRequest) {
        queue.lock().0.set_partial(p);
        queue.ready.notify_one();
    }

    /// `asr_loop` trên luồng riêng, ngôn ngữ cho phép en và vi.
    fn asr_thread(asr: ScriptedAsr) -> (Arc<SharedQueue>, Receiver<Msg>, JoinHandle<()>) {
        let queue = Arc::new(SharedQueue::new(AsrQueue::new(crate::config::QueueConfig::default())));
        let (tx, rx) = mpsc::channel::<Msg>();
        let thread = {
            let queue = queue.clone();
            std::thread::spawn(move || {
                asr_loop(
                    Box::new(asr),
                    &queue,
                    &tx,
                    &AtomicU64::new(0),
                    &FilterConfig::default(),
                    vec!["en".into(), "vi".into()],
                    100,
                )
            })
        };
        (queue, rx, thread)
    }

    fn next_asr(rx: &Receiver<Msg>) -> AsrOutcome {
        match rx
            .recv_timeout(Duration::from_secs(5))
            .expect("phải có kết quả nhận dạng")
        {
            Msg::Asr(outcome) => outcome,
            _ => panic!("chỉ có kết quả nhận dạng"),
        }
    }

    /// Chép từng phần (QĐ8 của kế hoạch 02): cùng yêu cầu như lượt cuối; lần đầu của đoạn dùng mọi ngôn ngữ cho phép, từ lần
    /// được giữ đầu tiên thì khóa ngôn ngữ đó; không đổi prompt hay ngôn ngữ của đoạn trước; bị lọc thì không có chữ.
    #[test]
    fn partials_use_the_final_request_and_lock_the_language_per_segment() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let (queue, rx, thread) = asr_thread(ScriptedAsr {
            replies: vec![
                Ok(("en", "Thank you for watching")),
                Ok(("en", "so we went")),
                Ok(("en", "so we went home")),
                Ok(("en", "So we went home.")),
                Ok(("en", "and then")),
            ],
            seen: seen.clone(),
        });
        put_partial(&queue, partial_request(7, 1_000));
        let AsrOutcome::Partial(p) = next_asr(&rx) else {
            panic!("phải là chép từng phần")
        };
        assert_eq!((p.seg, p.text), (7, None), "câu ảo giác bị lọc");
        put_partial(&queue, partial_request(7, 1_500));
        let AsrOutcome::Partial(p) = next_asr(&rx) else {
            panic!("phải là chép từng phần")
        };
        assert_eq!(
            (
                p.seg,
                p.start_ms,
                p.upto_ms,
                p.lang.as_str(),
                p.text.as_deref(),
                p.asr_ms
            ),
            (7, 1_000, 2_500, "en", Some("so we went"), 3.0)
        );
        put_partial(&queue, partial_request(7, 2_000));
        let AsrOutcome::Partial(p) = next_asr(&rx) else {
            panic!("phải là chép từng phần")
        };
        assert_eq!(p.text.as_deref(), Some("so we went home"));
        queue.push(PendingSegment {
            ids: vec![7],
            start_ms: 1_000,
            end_ms: 3_200,
            speech_ms: 2_200,
            mean_prob: 0.9,
            speech_ratio: 1.0,
            samples: vec![0.1; 40_000],
        });
        assert!(matches!(next_asr(&rx), AsrOutcome::Transcribed { ids, .. } if ids == [7]));
        put_partial(&queue, partial_request(8, 1_000));
        assert!(matches!(next_asr(&rx), AsrOutcome::Partial(p) if p.seg == 8));
        queue.close();
        thread.join().unwrap();
        let seen = seen.lock().unwrap();
        assert_eq!(
            (seen[0].0, seen[0].1),
            (7, 16_000),
            "id của đoạn mở, âm thanh của ảnh chụp"
        );
        let langs: Vec<Vec<String>> = seen.iter().map(|s| s.2.clone()).collect();
        assert_eq!(
            langs,
            [
                vec!["en", "vi"],
                vec!["en", "vi"],
                vec!["en"],
                vec!["en", "vi"],
                vec!["en", "vi"]
            ]
        );
        let prev: Vec<Option<&str>> = seen.iter().map(|s| s.3.as_deref()).collect();
        assert_eq!(
            prev,
            [None, None, None, None, Some("en")],
            "chỉ lượt cuối đổi ngôn ngữ đoạn trước"
        );
        let prompts: Vec<usize> = seen.iter().map(|s| s.4).collect();
        assert_eq!(prompts, [0, 0, 0, 0, 3], "chỉ lượt cuối vào lịch sử prompt");
    }

    /// Lần chép từng phần lỗi thì bỏ, không gửi lại (spec §4.1, §7; QĐ9); lần sau vẫn chép.
    #[test]
    fn a_failed_partial_is_dropped_without_a_resend() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let (queue, rx, thread) = asr_thread(ScriptedAsr {
            replies: vec![Err(AsrFailure::Dropped("lỗi giả".into())), Ok(("en", "so we went"))],
            seen: seen.clone(),
        });
        put_partial(&queue, partial_request(3, 1_000));
        let deadline = Instant::now() + Duration::from_secs(5);
        while seen.lock().unwrap().is_empty() {
            assert!(Instant::now() < deadline, "lần đầu phải được gửi");
            std::thread::sleep(Duration::from_millis(1));
        }
        put_partial(&queue, partial_request(3, 1_500));
        assert!(
            matches!(next_asr(&rx), AsrOutcome::Partial(p) if p.upto_ms == 2_500),
            "lần lỗi không có kết quả"
        );
        queue.close();
        thread.join().unwrap();
        assert_eq!(seen.lock().unwrap().len(), 2, "không gửi lại");
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

    /// Nguồn có bản VAD riêng (spec 2026-10-24-nguon-micro §5.8): bản cho whisper là `samples`, bản cho VAD toàn im lặng
    /// hoặc giống hệt bản whisper.
    struct TwoViews {
        samples: SampleSource,
        vad_silent: bool,
    }

    impl FrameSource for TwoViews {
        fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
            self.samples.read(out, timeout)
        }

        fn read_with_vad(&mut self, out: &mut Vec<f32>, vad_out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
            let from = out.len();
            let more = self.samples.read(out, timeout)?;
            if self.vad_silent {
                vad_out.extend(std::iter::repeat_n(0.0, out.len() - from));
            } else {
                vad_out.extend_from_slice(&out[from..]);
            }
            Ok(more)
        }
    }

    /// VAD chỉ nghe bản VAD: bản đó im lặng thì không đoạn nào được mở, dù bản cho whisper có tiếng. Bản VAD có tiếng thì
    /// đoạn được mở và whisper nhận âm thanh của bản whisper.
    #[test]
    fn the_vad_listens_to_its_own_view() {
        for vad_silent in [true, false] {
            let seen = Arc::new(Mutex::new(Vec::new()));
            let source = Box::new(TwoViews {
                samples: SampleSource::new(speech_then_silence(1_500), 1_600, Duration::ZERO),
                vad_silent,
            });
            let (engine, _sink) = start(source, energy(), Box::new(RecordingAsr(seen.clone())), quick_mt(), cfg());
            engine.join();
            let seen = seen.lock().unwrap().clone();
            if vad_silent {
                assert!(seen.is_empty(), "{seen:?}");
            } else {
                assert_eq!(seen.len(), 1, "{seen:?}");
            }
        }
    }

    /// Bản mặc định của `read_with_vad`: bản VAD là bản sao phần mới của `out`.
    #[test]
    fn by_default_the_vad_view_copies_the_new_samples() {
        let mut source = SampleSource::new(vec![0.1, 0.2, 0.3], 2, Duration::ZERO);
        let (mut out, mut vad) = (vec![9.0], Vec::new());
        assert!(source.read_with_vad(&mut out, &mut vad, Duration::ZERO).unwrap());
        assert_eq!((out.as_slice(), vad.as_slice()), (&[9.0, 0.1, 0.2][..], &[0.1, 0.2][..]));
    }

    /// Chép lời mọi đoạn thành "so we went home"; ghi (id đoạn, số mẫu) của mọi yêu cầu.
    struct RecordingAsr(Arc<Mutex<Vec<(u64, usize)>>>);

    impl Asr for RecordingAsr {
        fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
            self.0.lock().unwrap().push((req.segment_id, req.pcm.len()));
            ConstAsr("so we went home").transcribe(req)
        }
    }

    /// Luồng VAD (spec 2026-10-10 §4.1): chế độ có hiệu lực thì gửi lần chép từng phần của đoạn đang mở (cùng id mà đoạn
    /// nhận khi đóng, âm thanh ngắn hơn) trước lượt cuối, và dòng đang nói được gỡ khi phụ đề chốt; chế độ tắt thì không có
    /// lần nào và không có dòng nào.
    #[test]
    fn the_vad_thread_sends_partials_of_the_open_segment() {
        for enabled in [true, false] {
            let seen = Arc::new(Mutex::new(Vec::new()));
            let config = EngineConfig {
                streaming_enabled: enabled,
                ..cfg()
            };
            // 2 giây tiếng rồi 1,5 giây im lặng, phát nhanh gấp 20 lần thời gian thực.
            let mut samples = speech_then_silence(0);
            samples.extend(speech_then_silence(1_500));
            let source = Box::new(SampleSource::new(samples, 1_600, Duration::from_millis(5)));
            let (engine, sink) = start(
                source,
                energy(),
                Box::new(RecordingAsr(seen.clone())),
                quick_mt(),
                config,
            );
            engine.join();
            let seen = seen.lock().unwrap().clone();
            if !enabled {
                assert_eq!(seen.len(), 1, "chỉ lượt cuối: {seen:?}");
                assert!(sink.lives.lock().unwrap().is_empty());
                continue;
            }
            assert!(seen.len() >= 2, "{seen:?}");
            let (id, final_len) = *seen.last().unwrap();
            assert!(seen.iter().all(|&(i, _)| i == id), "{seen:?}");
            assert!(seen[..seen.len() - 1].iter().all(|&(_, n)| n < final_len), "{seen:?}");
            assert!(!sink.lives.lock().unwrap().is_empty());
            assert_eq!(sink.live_ends.lock().unwrap().clone(), [id]);
        }
    }

    /// Nguồn phát từng khung theo kịch bản (`true`: tiếng nói, sóng vuông biên độ 0,3; `false`: im lặng). Trước khi phát khung
    /// thứ `i` (đếm từ 0), và một lần cuối trước khi hết luồng, gọi `before(i)`: lúc đó luồng VAD đã xử lý xong khung `i - 1`.
    struct Scripted<F> {
        frames: Vec<bool>,
        next: usize,
        before: F,
    }

    impl<F: FnMut(u64) + Send> FrameSource for Scripted<F> {
        fn read(&mut self, out: &mut Vec<f32>, _: Duration) -> Result<bool> {
            (self.before)(self.next as u64);
            let Some(&speech) = self.frames.get(self.next) else {
                return Ok(false);
            };
            self.next += 1;
            let v = if speech { 0.3 } else { 0.0 };
            out.extend((0..FRAME_SAMPLES).map(|i| if i % 40 < 20 { v } else { -v }));
            Ok(true)
        }
    }

    /// Mỗi cặp (n, m): n khung tiếng nói rồi m khung im lặng.
    fn script(parts: &[(usize, usize)]) -> Vec<bool> {
        parts
            .iter()
            .flat_map(|&(n, m)| std::iter::repeat_n(true, n).chain(std::iter::repeat_n(false, m)))
            .collect()
    }

    /// Một lần chạy `vad_loop` ngay trên luồng test (không có luồng nhận dạng): các ngưỡng đã báo, các đoạn đóng (id, im lặng
    /// từ hết tiếng nói tới lúc đóng, ms) và các lần chép từng phần (id, start_ms, upto_ms, số mẫu).
    struct VadRun {
        thresholds: Vec<u64>,
        closed: Vec<(u64, u64)>,
        partials: Vec<(u64, u64, u64, usize)>,
    }

    /// Chạy `vad_loop` trên `frames` với ngưỡng người dùng 50 ms (như app) và `streaming.end_silence_ms` 400 (13 khung).
    /// Trước khung `i`: nếu `drain(i)` thì lấy hết hàng đợi như luồng nhận dạng rảnh (ghi lại các lần chép từng phần), rồi gọi
    /// `at(i, chế độ)` để đổi công tắc hay tự tắt.
    fn run_vad(
        frames: Vec<bool>,
        start_on: bool,
        queue: Arc<SharedQueue>,
        drain: impl Fn(u64) -> bool + Send + 'static,
        at: impl Fn(u64, &Streaming) + Send + 'static,
    ) -> VadRun {
        let mut p = PipelineConfig::default();
        p.segmenter.end_silence_ms = 50;
        p.streaming.end_silence_ms = 400;
        let streaming = Arc::new(Streaming::default());
        streaming.supported.store(true, Ordering::SeqCst);
        streaming.enabled.store(start_on, Ordering::SeqCst);
        streaming
            .cadence_ms
            .store(p.streaming.initial_cadence_ms, Ordering::SeqCst);
        let partials = Arc::new(Mutex::new(Vec::new()));
        let before = {
            let (streaming, queue, partials) = (streaming.clone(), queue.clone(), partials.clone());
            move |i: u64| {
                if drain(i) {
                    while let Some(popped) = queue.lock().0.pop(0) {
                        if let Popped::Partial(r) = popped {
                            partials
                                .lock()
                                .unwrap()
                                .push((r.id, r.start_ms, r.upto_ms, r.samples.len()));
                        }
                    }
                }
                at(i, &streaming);
            }
        };
        let source = Box::new(Scripted {
            frames,
            next: 0,
            before,
        });
        let (tx, rx) = mpsc::channel();
        let (now_ms, stop) = (AtomicU64::new(0), AtomicBool::new(false));
        vad_loop(
            source,
            energy(),
            &p,
            &queue,
            &tx,
            &Sink::default(),
            &now_ms,
            &stop,
            &streaming,
        );
        drop(tx);
        let (mut thresholds, mut closed) = (Vec::new(), Vec::new());
        for msg in rx {
            match msg {
                Msg::Threshold(ms) => thresholds.push(ms),
                Msg::Queued {
                    id, end_ms, closed_ms, ..
                } => closed.push((id, closed_ms - end_ms)),
                _ => {}
            }
        }
        let partials = partials.lock().unwrap().clone();
        VadRun {
            thresholds,
            closed,
            partials,
        }
    }

    fn empty_queue() -> Arc<SharedQueue> {
        Arc::new(SharedQueue::new(AsrQueue::new(PipelineConfig::default().queue)))
    }

    /// QĐ2 của kế hoạch 02 (H6; spec 2026-10-10 §4.1, §4.7, §5, §6.3): chế độ và ngưỡng đóng đoạn được chốt cho cả đoạn đang
    /// mở. Đổi công tắc giữa một đoạn chỉ có tác dụng từ đoạn kế tiếp (ngưỡng, `Threshold`, chép từng phần); tự tắt dừng chép
    /// từng phần ngay, nhưng đoạn đang mở vẫn đóng theo ngưỡng của nó. Ngưỡng người dùng 50 ms (2 khung) không có lần chép khi
    /// vừa hết tiếng nói, nên bật chế độ giữa phiên phải báo ngưỡng mới cho `PartialScheduler`.
    #[test]
    fn the_mode_and_the_threshold_hold_for_the_whole_open_segment() {
        // Mỗi đoạn: 60 khung tiếng nói (1 920 ms) rồi 30 khung im lặng. Lần chép theo nhịp đầu tiên ở khung tiếng nói thứ 32
        // (1 024 ms tiếng nói), lần chép khi vừa hết tiếng nói ở khung im lặng thứ hai; đệm trước 7 khung (trừ đầu phiên).
        // Bật lúc bắt đầu; tắt giữa đoạn 0, bật lại giữa đoạn 1, tự tắt giữa đoạn 2 sau lần chép theo nhịp đầu tiên.
        let at = |i, s: &Streaming| match i {
            30 => s.enabled.store(false, Ordering::SeqCst),
            120 => s.enabled.store(true, Ordering::SeqCst),
            215 => s.auto_off.store(true, Ordering::SeqCst),
            _ => {}
        };
        let run = run_vad(
            script(&[(60, 30), (60, 30), (60, 30)]),
            true,
            empty_queue(),
            |_| true,
            at,
        );
        assert_eq!(run.thresholds, [400, 50, 400, 50], "lúc bắt đầu, rồi mỗi khi đổi");
        // 400 ms là 13 khung (416 ms), 50 ms là 2 khung (64 ms).
        assert_eq!(run.closed, [(0, 416), (1, 64), (2, 416)]);
        assert_eq!(
            run.partials,
            [
                (0, 0, 1_024, 32 * 512),
                (0, 0, 1_984, 62 * 512),
                (2, 5_760, 6_784, (7 + 32) * 512)
            ]
        );

        // Tắt lúc bắt đầu, bật giữa đoạn 0: đoạn 0 không chép từng phần và đóng sau 64 ms; đoạn 1 có cả hai loại lần chép.
        let at = |i, s: &Streaming| {
            if i == 30 {
                s.enabled.store(true, Ordering::SeqCst);
            }
        };
        let run = run_vad(script(&[(60, 30), (60, 30)]), false, empty_queue(), |_| true, at);
        assert_eq!(run.thresholds, [50, 400]);
        assert_eq!(run.closed, [(0, 64), (1, 416)]);
        assert_eq!(
            run.partials,
            [(1, 2_880, 3_904, (7 + 32) * 512), (1, 2_880, 4_864, (7 + 62) * 512)]
        );
    }

    /// Spec 2026-10-10 §4.1: còn đoạn đóng chờ nhận dạng thì luồng VAD không chép từng phần; hàng vừa trống thì chép ngay.
    #[test]
    fn no_partial_is_scheduled_while_a_closed_segment_waits() {
        let queue = empty_queue();
        queue.push(PendingSegment::from(crate::segmenter::Segment {
            id: 99,
            start_ms: 0,
            end_ms: 0,
            speech_ms: 0,
            mean_prob: 0.9,
            speech_ratio: 1.0,
            samples: vec![0.0; FRAME_SAMPLES],
        }));
        // Luồng nhận dạng bận tới trước khung 40 (đoạn đóng 99 còn chờ), rồi lấy hết hàng đợi.
        let run = run_vad(script(&[(60, 0)]), true, queue, |i| i >= 40, |_, _| {});
        // Đủ điều kiện từ khung 31 (1 024 ms tiếng nói) nhưng phải chờ hàng trống: chép ở khung 40.
        assert_eq!(run.partials, [(0, 0, 1_312, 41 * 512)]);
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
