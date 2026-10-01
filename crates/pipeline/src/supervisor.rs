//! Vòng đời và giám sát hai tiến trình phụ (spec §5, §6.4, §6.5, §9; Đ2 của kế hoạch 00).
//!
//! - Thứ tự: `asr-worker` chạy trước (`Load` rồi `Warmup`); `llama-server` chạy sau khi `asr-worker` đã nạp model, để
//!   `--fit` thấy đúng VRAM còn trống.
//! - Lỗi (crash, treo quá thời gian, không khởi động được): khởi động lại, chờ 1, 2, 5 giây giữa các lần. Quá 5 lần trong
//!   10 phút thì bỏ cuộc: `asr-worker` thì dừng dịch và báo lỗi; `llama-server` thì phụ đề chỉ hiện câu gốc.
//! - `asr-worker`: đoạn đang xử lý được gửi lại một lần; lỗi nữa thì đoạn đó bị bỏ (`dropped`). Worker trả `Error` cho
//!   một đoạn mà vẫn sống thì không khởi động lại, đoạn đó bị bỏ.
//! - Chuyển sang CPU: crash 2 lần liên tiếp khi đang dùng GPU; hoặc bản GPU không khởi động được, hay lỗi lúc nạp model
//!   (Windows: `asr-worker-vulkan` thiếu `vulkan-1.dll`); hoặc worker báo thiết bị thật là CPU (`Ready.backend`). Đã
//!   chuyển thì giữ CPU tới khi app tắt. `asr-worker` chạy bằng CPU (kể cả khi không dò thấy GPU dùng được) thì
//!   `llama-server` cũng chạy bằng CPU (`-ngl 0`) từ lần khởi động kế tiếp của nó (§9, "GPU khởi tạo lỗi").
//! - Lần đầu chạy một binary mới: chờ `Ready` hay `/health` lâu hơn (`first_run_ready_timeout_ms`, từ 30 giây). Quá thời
//!   gian chờ đó không bị tính là một lần lỗi và không chuyển sang CPU (§6.5): chạy lại với thời gian chờ thường.
//! - Trước mỗi lần chạy một tiến trình phụ (kể cả khởi động lại bên trong giám sát), app kiểm binary qua
//!   [`SidecarEvents::before_spawn`] (SHA-256, §10.2, QĐ17). Kiểm lỗi thì bỏ cuộc ngay, không thử lại.
//! - Không có phiên dịch nào trong 10 phút thì tắt cả hai (`tick`).
//! - App thoát ([`SidecarManager::shutdown`]): không chờ khóa nào. Cờ `closing` làm mọi lần khởi động sau đó trả lỗi
//!   ngay, lần chờ giữa hai lần khởi động bị ngắt, và tiến trình phụ đang chạy (cả khi đang nạp model hay đang treo giữa
//!   request) bị kill qua [`process::Killer`]. Luồng đang dùng tiến trình phụ đó nhận lỗi và tự trả khóa.
//!
//! Mọi thời gian chờ đi qua `Clock`, nên test chạy với đồng hồ giả, không chờ thật.

use crate::asr_client::{AsrLaunch, AsrWorker, ReadyInfo};
use crate::config::{AsrConfig, MtConfig, SupervisorConfig};
use crate::llama::{ChatRequest, LlamaLaunch, LlamaServer, StreamEnd, is_not_ready};
use crate::process;
use crate::translate::{Mt, MtError};
use asr_protocol::{Backend, DecodeMode, ErrorKind, TranscribeRequest, TranscribeResult};
use std::collections::VecDeque;
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Lần chờ ngắt được: sau [`Wake::wake`], mọi lần chờ đang dở và sau đó trả về ngay.
#[derive(Default)]
pub struct Wake {
    woken: Mutex<bool>,
    cv: Condvar,
}

impl Wake {
    pub fn wake(&self) {
        *lock(&self.woken) = true;
        self.cv.notify_all();
    }

    pub fn is_woken(&self) -> bool {
        *lock(&self.woken)
    }

    /// Chờ tối đa `d`; trả `true` nếu bị ngắt.
    pub fn wait(&self, d: Duration) -> bool {
        let guard = lock(&self.woken);
        let (guard, _) = self
            .cv
            .wait_timeout_while(guard, d, |woken| !*woken)
            .unwrap_or_else(|e| e.into_inner());
        *guard
    }
}

/// Đồng hồ cho mọi thời gian chờ của phần giám sát.
pub trait Clock: Send + Sync {
    fn now_ms(&self) -> u64;
    /// Chờ `d`, hoặc tới khi `wake` bị ngắt.
    fn sleep(&self, d: Duration, wake: &Wake);
}

pub struct SystemClock {
    origin: Instant,
}

impl Default for SystemClock {
    fn default() -> Self {
        Self { origin: Instant::now() }
    }
}

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        self.origin.elapsed().as_millis() as u64
    }

    fn sleep(&self, d: Duration, wake: &Wake) {
        wake.wait(d);
    }
}

/// Đồng hồ giả cho test: `sleep` cộng thẳng vào giờ hiện tại và ghi lại, không chờ thật.
#[derive(Default)]
pub struct FakeClock {
    now: AtomicU64,
    sleeps: Mutex<Vec<u64>>,
}

impl FakeClock {
    pub fn advance(&self, d: Duration) {
        self.now.fetch_add(d.as_millis() as u64, Ordering::SeqCst);
    }

    /// Các lần `sleep` đã gọi, tính bằng ms.
    pub fn sleeps(&self) -> Vec<u64> {
        lock(&self.sleeps).clone()
    }
}

impl Clock for FakeClock {
    fn now_ms(&self) -> u64 {
        self.now.load(Ordering::SeqCst)
    }

    fn sleep(&self, d: Duration, _wake: &Wake) {
        lock(&self.sleeps).push(d.as_millis() as u64);
        self.advance(d);
    }
}

/// Quyết định sau một lần lỗi.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Restart { after_ms: u64, use_gpu: bool },
    GiveUp,
}

/// Luật khởi động lại, không đụng tới tiến trình nào (test riêng được).
#[derive(Debug)]
pub struct RestartTracker {
    cfg: SupervisorConfig,
    failures: VecDeque<u64>,
    gpu_failures_in_a_row: u32,
}

impl RestartTracker {
    pub fn new(cfg: SupervisorConfig) -> Self {
        Self {
            cfg,
            failures: VecDeque::new(),
            gpu_failures_in_a_row: 0,
        }
    }

    /// Một lần lỗi lúc `now_ms`. `on_gpu`: đang chạy bằng GPU. `during_start`: lỗi xảy ra khi khởi động hay nạp model,
    /// lúc đó chuyển sang CPU ngay (§6.4).
    pub fn on_failure(&mut self, now_ms: u64, on_gpu: bool, during_start: bool) -> Decision {
        while self
            .failures
            .front()
            .is_some_and(|&t| now_ms.saturating_sub(t) >= self.cfg.failure_window_ms)
        {
            self.failures.pop_front();
        }
        self.failures.push_back(now_ms);
        if self.failures.len() > self.cfg.max_failures {
            return Decision::GiveUp;
        }
        let mut use_gpu = on_gpu;
        if on_gpu {
            self.gpu_failures_in_a_row += 1;
            if during_start || self.gpu_failures_in_a_row >= self.cfg.gpu_failures_to_cpu {
                use_gpu = false;
            }
        }
        Decision::Restart {
            after_ms: self.backoff(self.failures.len()),
            use_gpu,
        }
    }

    /// Thời gian chờ trước lần chạy lại thứ `n` (từ 1).
    fn backoff(&self, n: usize) -> u64 {
        let backoff = &self.cfg.backoff_ms;
        backoff[n.saturating_sub(1).min(backoff.len() - 1)]
    }

    /// Số lần lỗi còn trong cửa sổ.
    pub fn failures(&self) -> usize {
        self.failures.len()
    }

    /// Một yêu cầu thành công: số lần crash liên tiếp trên GPU về 0.
    pub fn on_success(&mut self) {
        self.gpu_failures_in_a_row = 0;
    }

    /// Người dùng thử lại (bấm Bắt đầu): quên các lần lỗi cũ.
    pub fn reset(&mut self) {
        self.failures.clear();
        self.gpu_failures_in_a_row = 0;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Which {
    Asr,
    Llama,
}

/// Vì sao giám sát bỏ cuộc với một tiến trình phụ. App chọn mã lỗi theo đây (02c).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GiveUpCause {
    /// Quá `max_failures` lần lỗi trong `failure_window_ms`.
    Failures,
    /// Model không nạp được ngay cả bằng CPU: model hỏng (§9: đề nghị tải lại).
    ModelLoad,
    /// `asr-worker` thiếu chế độ giải mã B.
    NoSharedMode,
    /// Binary không qua bước kiểm của app ([`SidecarEvents::before_spawn`]): `sidecarTampered`.
    Tampered,
    /// App đang thoát.
    Closing,
}

/// Sự kiện để app hiện trạng thái (§4.2, §9). Không chứa API key hay nội dung chép lời.
#[derive(Clone, Debug, PartialEq)]
pub enum SidecarEvent {
    Starting {
        which: Which,
        /// Lần đầu chạy binary này: giao diện báo "Đang chuẩn bị lần đầu" (§6.5).
        first_run: bool,
    },
    Ready {
        which: Which,
        use_gpu: bool,
        /// Thiết bị thật của `asr-worker`; `None` với `llama-server`.
        backend: Option<Backend>,
        first_run: bool,
    },
    Restarting {
        which: Which,
        /// Số lần lỗi đang tính trong cửa sổ 10 phút (lần đầu chạy quá giờ không tính).
        failures: usize,
        after_ms: u64,
        reason: String,
    },
    /// "Đang chạy bằng CPU (chậm hơn)" (§9).
    CpuFallback {
        which: Which,
    },
    /// Tiến trình phụ báo hết bộ nhớ: app đề xuất gói Nhẹ (§9).
    OutOfMemory {
        which: Which,
    },
    GaveUp {
        which: Which,
        cause: GiveUpCause,
        reason: String,
    },
    Stopped {
        which: Which,
        idle: bool,
    },
}

/// Nơi app nhận sự kiện của giám sát và kiểm binary trước khi chạy.
pub trait SidecarEvents: Send + Sync {
    fn on_event(&self, event: &SidecarEvent);

    /// Gọi ngay trước mỗi lần chạy `exe`, kể cả mọi lần khởi động lại. App kiểm SHA-256 ở đây (§10.2); trả `Err` thì
    /// giám sát không chạy binary đó và bỏ cuộc với [`GiveUpCause::Tampered`].
    fn before_spawn(&self, _which: Which, _exe: &Path) -> Result<(), String> {
        Ok(())
    }

    /// `exe` chưa từng chạy tới `Ready` trên máy này (vừa cài hay cập nhật). Giám sát hỏi trước lần chạy đầu tiên của mỗi
    /// binary, kể cả binary chỉ chạy sau khi chuyển sang CPU (Windows: `asr-worker-cpu`), cộng với `first_run` của spec.
    fn is_first_run(&self, _which: Which, _exe: &Path) -> bool {
        false
    }
}

/// Bỏ qua mọi sự kiện, không kiểm binary.
pub struct NoEvents;

impl SidecarEvents for NoEvents {
    fn on_event(&self, _: &SidecarEvent) {}
}

#[derive(Clone, Debug)]
pub struct AsrSpec {
    /// Bản chạy GPU. macOS chỉ có một bản (Metal và CPU): đặt `exe_gpu` và `exe_cpu` cùng một file. Windows:
    /// `asr-worker-vulkan` và `asr-worker-cpu`; không dò thấy GPU dùng được (`--probe`) thì `exe_gpu` là `None`, và
    /// `llama-server` cũng chạy bằng CPU.
    pub exe_gpu: Option<PathBuf>,
    pub exe_cpu: PathBuf,
    pub model: PathBuf,
    pub log: PathBuf,
    pub first_run: bool,
    /// Bản phát hành chỉ nhận chế độ B (§6.4, "Việc cho MVP").
    pub require_shared: bool,
    pub env: Vec<(String, String)>,
}

#[derive(Clone, Debug)]
pub struct LlamaSpec {
    pub exe: PathBuf,
    pub model: PathBuf,
    pub log: PathBuf,
    pub extra_args: Vec<String>,
    pub first_run: bool,
    pub env: Vec<(String, String)>,
}

#[derive(Clone, Debug)]
pub struct SidecarSpec {
    pub asr: AsrSpec,
    pub llama: LlamaSpec,
    pub supervisor: SupervisorConfig,
    pub asr_config: AsrConfig,
    pub mt_config: MtConfig,
}

/// Lỗi của một đoạn khi chép lời.
#[derive(Clone, Debug, PartialEq, thiserror::Error)]
pub enum AsrFailure {
    /// Đoạn này bị bỏ (`dropped`): lỗi cả sau khi gửi lại, hoặc worker trả `Error` cho đoạn.
    #[error("bỏ đoạn: {0}")]
    Dropped(String),
    /// `asr-worker` không dùng được nữa: dừng dịch, báo lỗi (§9).
    #[error("asr-worker không dùng được: {0}")]
    Unavailable(String),
}

/// Nhận dạng giọng nói, như luồng nhận dạng của `engine` cần. Bản thật là [`SupervisedAsr`].
pub trait Asr: Send {
    fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure>;
}

#[derive(Clone, Debug, PartialEq, thiserror::Error)]
#[error("{which:?} không khởi động được: {reason}")]
pub struct StartError {
    pub which: Which,
    pub cause: GiveUpCause,
    pub reason: String,
}

/// Dấu hiệu hết bộ nhớ trong thông báo lỗi hay log của tiến trình phụ. Cùng danh sách với `asr_worker::engine::classify`,
/// vì `llama-server` không có mã lỗi riêng cho việc này.
pub fn looks_out_of_memory(text: &str) -> bool {
    const OOM: [&str; 5] = [
        "out of memory",
        "failed to allocate",
        "cannot allocate",
        "outofdevicememory",
        "insufficient memory",
    ];
    let text = text.to_lowercase();
    OOM.iter().any(|m| text.contains(m))
}

struct AsrSlot {
    worker: Option<AsrWorker>,
    tracker: RestartTracker,
    use_gpu: bool,
    first_run: bool,
    /// Binary đã được hỏi `is_first_run`: mỗi binary chỉ được chờ lâu một lần.
    asked_first_run: Vec<PathBuf>,
    gave_up: Option<(GiveUpCause, String)>,
}

struct LlamaSlot {
    server: Option<LlamaServer>,
    tracker: RestartTracker,
    /// Quyết định GPU của riêng `llama-server` (theo `--probe`, và luật 2 lần lỗi liên tiếp trên GPU). Lần chạy thật dùng
    /// GPU khi cờ này bật **và** `asr-worker` không chạy bằng CPU, tính lại ở mỗi lần chạy (Q5-1 của review 02 lần 5).
    use_gpu: bool,
    /// Lần chạy gần nhất có dùng GPU không (`None`: chưa chạy lần nào).
    last_gpu: Option<bool>,
    first_run: bool,
    asked_first_run: Vec<PathBuf>,
    gave_up: Option<(GiveUpCause, String)>,
}

/// Lần đầu thấy `exe` thì hỏi app nó có phải lần đầu chạy không. Lần chạy đầu của spec (`first_run`) cũng chỉ áp cho binary
/// đầu tiên được chạy.
fn ask_first_run(events: &dyn SidecarEvents, which: Which, exe: &Path, asked: &mut Vec<PathBuf>, first_run: &mut bool) {
    if asked.iter().any(|p| p == exe) {
        return;
    }
    if asked.is_empty() {
        *first_run |= events.is_first_run(which, exe);
    } else {
        *first_run = events.is_first_run(which, exe);
    }
    asked.push(exe.to_path_buf());
}

struct Activity {
    sessions: usize,
    last_active_ms: u64,
}

/// Cách kill tiến trình phụ đang chạy (hay đang nạp model) của mỗi bên. Khóa này không bao giờ bị giữ lâu.
#[derive(Default)]
struct Killers {
    asr: Option<process::Killer>,
    llama: Option<process::Killer>,
}

/// Một lần chạy `asr-worker` lỗi.
struct AsrStartFailure {
    reason: String,
    kind: Option<ErrorKind>,
    timed_out: bool,
}

pub struct SidecarManager {
    spec: SidecarSpec,
    clock: Arc<dyn Clock>,
    events: Arc<dyn SidecarEvents>,
    asr: Mutex<AsrSlot>,
    llama: Mutex<LlamaSlot>,
    activity: Mutex<Activity>,
    killers: Mutex<Killers>,
    /// App đang thoát: không chạy thêm gì nữa.
    closing: AtomicBool,
    /// Ngắt lần chờ giữa hai lần khởi động khi app thoát.
    wake: Wake,
    asr_running: AtomicBool,
    llama_running: AtomicBool,
    /// `asr-worker` đang chạy bằng CPU: `llama-server` cũng chạy bằng CPU từ lần khởi động kế tiếp.
    asr_on_cpu: AtomicBool,
    backend: Mutex<Option<Backend>>,
    /// Người dùng vừa bấm Bắt đầu: lần khởi động kế tiếp quên việc bỏ cuộc trước đó.
    retry_asr: AtomicBool,
    retry_llama: AtomicBool,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl SidecarManager {
    pub fn new(spec: SidecarSpec, clock: Arc<dyn Clock>, events: Arc<dyn SidecarEvents>) -> Arc<Self> {
        let gpu = spec.asr.exe_gpu.is_some();
        let asr = AsrSlot {
            worker: None,
            tracker: RestartTracker::new(spec.supervisor.clone()),
            use_gpu: gpu,
            first_run: spec.asr.first_run,
            asked_first_run: Vec::new(),
            gave_up: None,
        };
        let llama = LlamaSlot {
            server: None,
            tracker: RestartTracker::new(spec.supervisor.clone()),
            use_gpu: gpu,
            last_gpu: None,
            first_run: spec.llama.first_run,
            asked_first_run: Vec::new(),
            gave_up: None,
        };
        let now = clock.now_ms();
        Arc::new(Self {
            spec,
            clock,
            events,
            asr: Mutex::new(asr),
            llama: Mutex::new(llama),
            activity: Mutex::new(Activity {
                sessions: 0,
                last_active_ms: now,
            }),
            killers: Mutex::new(Killers::default()),
            closing: AtomicBool::new(false),
            wake: Wake::default(),
            asr_running: AtomicBool::new(false),
            llama_running: AtomicBool::new(false),
            asr_on_cpu: AtomicBool::new(!gpu),
            backend: Mutex::new(None),
            retry_asr: AtomicBool::new(false),
            retry_llama: AtomicBool::new(false),
        })
    }

    fn emit(&self, event: SidecarEvent) {
        log::info!("tiến trình phụ: {event:?}");
        self.events.on_event(&event);
    }

    fn closing(&self) -> bool {
        self.closing.load(Ordering::SeqCst)
    }

    fn closing_error(which: Which) -> StartError {
        StartError {
            which,
            cause: GiveUpCause::Closing,
            reason: "app đang thoát".into(),
        }
    }

    /// Chạy cả hai theo đúng thứ tự, nếu chưa chạy. Chặn tới khi cả hai sẵn sàng; gọi từ luồng nền.
    pub fn ensure_started(&self) -> Result<(), StartError> {
        self.touch();
        {
            let mut asr = lock(&self.asr);
            self.start_asr(&mut asr)?;
        }
        let mut llama = lock(&self.llama);
        self.start_llama(&mut llama)
    }

    /// Có hoạt động (mở cửa sổ chính, dịch): lùi mốc tắt khi rảnh.
    pub fn touch(&self) {
        lock(&self.activity).last_active_ms = self.clock.now_ms();
    }

    /// Người dùng bấm Bắt đầu: lần khởi động kế tiếp của mỗi tiến trình phụ quên việc bỏ cuộc trước đó và thử lại từ đầu
    /// (người dùng có thể đã sửa nguyên nhân: tải lại model, cài lại app). App gọi hàm này **trước** khi chuẩn bị tiến trình
    /// phụ cho phiên (R3-1 của review 02 lần 3); lần chạy sẵn khi mở cửa sổ chính thì không. Không chờ khóa nào.
    pub fn allow_retry(&self) {
        self.retry_asr.store(true, Ordering::SeqCst);
        self.retry_llama.store(true, Ordering::SeqCst);
    }

    /// Một phiên dịch bắt đầu: không tắt tiến trình phụ khi rảnh cho tới khi phiên kết thúc. Không chờ khóa của tiến trình
    /// phụ (có thể đang nạp model).
    pub fn begin_session(&self) {
        let mut a = lock(&self.activity);
        a.sessions += 1;
        a.last_active_ms = self.clock.now_ms();
    }

    pub fn end_session(&self) {
        let mut a = lock(&self.activity);
        a.sessions = a.sessions.saturating_sub(1);
        a.last_active_ms = self.clock.now_ms();
    }

    /// Gọi định kỳ. Không có phiên nào và rảnh quá `idle_shutdown_ms` thì tắt cả hai; trả `true` nếu vừa tắt.
    pub fn tick(&self) -> bool {
        let idle = {
            let a = lock(&self.activity);
            a.sessions == 0
                && self.clock.now_ms().saturating_sub(a.last_active_ms) >= self.spec.supervisor.idle_shutdown_ms
        };
        if !idle || !self.running() || self.closing() {
            return false;
        }
        self.stop(true);
        true
    }

    /// Có tiến trình phụ nào đang chạy không. Không chờ khóa nào.
    pub fn running(&self) -> bool {
        self.asr_running.load(Ordering::SeqCst) || self.llama_running.load(Ordering::SeqCst)
    }

    /// App thoát: bật cờ `closing`, ngắt lần chờ đang dở, kill tiến trình phụ đang chạy. Trả về ngay, không chờ khóa
    /// của tiến trình phụ; luồng đang dùng tiến trình phụ nhận lỗi rồi tự dọn.
    pub fn shutdown(&self) {
        self.closing.store(true, Ordering::SeqCst);
        self.wake.wake();
        let killers = std::mem::take(&mut *lock(&self.killers));
        for killer in [killers.llama, killers.asr].into_iter().flatten() {
            killer.kill();
        }
    }

    /// Giữ cách kill tiến trình vừa chạy. App đã bắt đầu thoát ([`SidecarManager::shutdown`] đã lấy hết `killers`) thì
    /// kill luôn, không giữ: kiểm `closing` dưới cùng khóa với `shutdown`, nên không tiến trình nào lọt ra.
    fn remember(&self, which: Which, killer: process::Killer) {
        let mut killers = lock(&self.killers);
        if self.closing() {
            drop(killers);
            killer.kill();
            return;
        }
        match which {
            Which::Asr => killers.asr = Some(killer),
            Which::Llama => killers.llama = Some(killer),
        }
    }

    /// Tắt cả hai: rảnh quá lâu (`idle`), hoặc app thoát. Khi app thoát, kill trước ([`SidecarManager::shutdown`]) rồi
    /// mới lấy khóa, nên không phải chờ hết lần nạp model hay request đang dở.
    pub fn stop(&self, idle: bool) {
        if !idle {
            self.shutdown();
        }
        // Bỏ `killers` cùng lúc lấy tiến trình ra khỏi slot (dưới khóa của slot), để không lần chạy mới nào xen vào giữa.
        let server = {
            let mut slot = lock(&self.llama);
            let server = slot.server.take();
            if server.is_some() {
                self.llama_running.store(false, Ordering::SeqCst);
                lock(&self.killers).llama = None;
            }
            server
        };
        if let Some(server) = server {
            drop(server);
            self.emit(SidecarEvent::Stopped {
                which: Which::Llama,
                idle,
            });
        }
        let worker = {
            let mut slot = lock(&self.asr);
            let worker = slot.worker.take();
            if worker.is_some() {
                self.asr_running.store(false, Ordering::SeqCst);
                lock(&self.killers).asr = None;
            }
            worker
        };
        if let Some(worker) = worker {
            drop(worker);
            self.emit(SidecarEvent::Stopped {
                which: Which::Asr,
                idle,
            });
        }
    }

    /// Thiết bị thật của `asr-worker` lần chạy gần nhất. Không chờ khóa của tiến trình phụ.
    pub fn asr_backend(&self) -> Option<Backend> {
        *lock(&self.backend)
    }

    fn asr_exe(&self, slot: &AsrSlot) -> PathBuf {
        match (&self.spec.asr.exe_gpu, slot.use_gpu) {
            (Some(gpu), true) => gpu.clone(),
            _ => self.spec.asr.exe_cpu.clone(),
        }
    }

    fn asr_launch(&self, slot: &AsrSlot, exe: &Path) -> AsrLaunch {
        let spec = &self.spec.asr;
        let ready_ms = if slot.first_run {
            self.spec.supervisor.first_run_ready_timeout_ms
        } else {
            self.spec.supervisor.ready_timeout_ms
        };
        AsrLaunch {
            use_gpu: slot.use_gpu,
            n_threads: self.spec.asr_config.n_threads,
            ready_timeout: Duration::from_millis(ready_ms),
            request_timeout: Duration::from_millis(self.spec.asr_config.timeout_ms),
            shutdown_grace: Duration::from_millis(self.spec.supervisor.shutdown_grace_ms),
            env: spec.env.clone(),
            ..AsrLaunch::new(exe, &spec.model, &spec.log)
        }
    }

    /// Bỏ cuộc: ghi lý do, báo app.
    fn give_up(
        &self,
        which: Which,
        gave_up: &mut Option<(GiveUpCause, String)>,
        cause: GiveUpCause,
        reason: String,
    ) -> StartError {
        *gave_up = Some((cause, reason.clone()));
        self.emit(SidecarEvent::GaveUp {
            which,
            cause,
            reason: reason.clone(),
        });
        StartError { which, cause, reason }
    }

    /// Một lần chạy `asr-worker`: `Load`, rồi `Warmup`.
    fn spawn_asr(&self, launch: &AsrLaunch) -> Result<(AsrWorker, ReadyInfo), AsrStartFailure> {
        let mut remember = |k: process::Killer| self.remember(Which::Asr, k);
        AsrWorker::spawn_with(launch, &mut remember)
            .and_then(|(mut worker, ready)| worker.warmup().map(|_| (worker, ready)))
            .map_err(|e| {
                lock(&self.killers).asr = None;
                AsrStartFailure {
                    reason: e.to_string(),
                    kind: e.kind(),
                    timed_out: e.is_timeout(),
                }
            })
    }

    /// Chạy `asr-worker` nếu chưa chạy, khởi động lại theo luật khi lỗi.
    fn start_asr(&self, slot: &mut AsrSlot) -> Result<(), StartError> {
        if self.retry_asr.swap(false, Ordering::SeqCst) && slot.gave_up.take().is_some() {
            // Người dùng bấm thử lại sau khi bỏ cuộc (với mọi lý do): bắt đầu lại từ quyết định ban đầu, kể cả GPU theo
            // `--probe`, vì nguyên nhân có thể không phải GPU (model hỏng đã được tải lại). GPU vẫn lỗi thì luật 2 lần lỗi
            // liên tiếp chuyển CPU lại (Q4-2 của review 02 lần 4). Chưa bỏ cuộc thì giữ CPU như cũ.
            slot.tracker.reset();
            let gpu = self.spec.asr.exe_gpu.is_some();
            slot.use_gpu = gpu;
            self.asr_on_cpu.store(!gpu, Ordering::SeqCst);
        }
        while slot.worker.is_none() {
            if self.closing() {
                return Err(Self::closing_error(Which::Asr));
            }
            if let Some((cause, reason)) = &slot.gave_up {
                return Err(StartError {
                    which: Which::Asr,
                    cause: *cause,
                    reason: reason.clone(),
                });
            }
            let exe = self.asr_exe(slot);
            if let Err(reason) = self.events.before_spawn(Which::Asr, &exe) {
                return Err(self.give_up(Which::Asr, &mut slot.gave_up, GiveUpCause::Tampered, reason));
            }
            ask_first_run(
                &*self.events,
                Which::Asr,
                &exe,
                &mut slot.asked_first_run,
                &mut slot.first_run,
            );
            self.emit(SidecarEvent::Starting {
                which: Which::Asr,
                first_run: slot.first_run,
            });
            let failure = match self.spawn_asr(&self.asr_launch(slot, &exe)) {
                Ok((worker, ready)) => {
                    if self.closing() {
                        drop(worker);
                        return Err(Self::closing_error(Which::Asr));
                    }
                    if self.spec.asr.require_shared && ready.decode_mode != DecodeMode::Shared {
                        let reason = "asr-worker không có chế độ giải mã B (build thiếu feature shared-encode)";
                        return Err(self.give_up(
                            Which::Asr,
                            &mut slot.gave_up,
                            GiveUpCause::NoSharedMode,
                            reason.into(),
                        ));
                    }
                    let first_run = std::mem::take(&mut slot.first_run);
                    if slot.use_gpu && !ready.backend.is_gpu() {
                        // Xin GPU mà worker chạy bằng CPU: không có GPU dùng được.
                        slot.use_gpu = false;
                        self.emit(SidecarEvent::CpuFallback { which: Which::Asr });
                    }
                    self.asr_on_cpu.store(!slot.use_gpu, Ordering::SeqCst);
                    *lock(&self.backend) = Some(ready.backend);
                    slot.worker = Some(worker);
                    self.asr_running.store(true, Ordering::SeqCst);
                    self.emit(SidecarEvent::Ready {
                        which: Which::Asr,
                        use_gpu: slot.use_gpu,
                        backend: Some(ready.backend),
                        first_run,
                    });
                    return Ok(());
                }
                Err(failure) => failure,
            };
            if self.closing() {
                return Err(Self::closing_error(Which::Asr));
            }
            if failure.kind == Some(ErrorKind::OutOfMemory) || looks_out_of_memory(&failure.reason) {
                self.emit(SidecarEvent::OutOfMemory { which: Which::Asr });
            }
            if failure.kind == Some(ErrorKind::ModelLoad) && !slot.use_gpu {
                // Model hỏng: khởi động lại không giúp gì (§9: đề nghị tải lại, kế hoạch 04).
                return Err(self.give_up(Which::Asr, &mut slot.gave_up, GiveUpCause::ModelLoad, failure.reason));
            }
            if failure.timed_out && std::mem::take(&mut slot.first_run) {
                self.first_run_timeout(Which::Asr, &slot.tracker, &failure.reason);
                continue;
            }
            self.after_asr_failure(slot, &failure.reason, true)?;
        }
        Ok(())
    }

    /// Lần đầu chạy mà quá thời gian chờ: không tính là một lần lỗi (§6.5), chạy lại với thời gian chờ thường.
    fn first_run_timeout(&self, which: Which, tracker: &RestartTracker, reason: &str) {
        let after_ms = tracker.backoff(1);
        self.emit(SidecarEvent::Restarting {
            which,
            failures: tracker.failures(),
            after_ms,
            reason: format!("lần đầu chạy quá thời gian chờ, không tính là lỗi: {reason}"),
        });
        self.clock.sleep(Duration::from_millis(after_ms), &self.wake);
    }

    /// Ghi một lần lỗi của `asr-worker`, chờ theo luật (hoặc bỏ cuộc).
    fn after_asr_failure(&self, slot: &mut AsrSlot, reason: &str, during_start: bool) -> Result<(), StartError> {
        if slot.worker.take().is_some() {
            self.asr_running.store(false, Ordering::SeqCst);
        }
        lock(&self.killers).asr = None;
        if self.closing() {
            return Err(Self::closing_error(Which::Asr));
        }
        let was_gpu = slot.use_gpu;
        match slot.tracker.on_failure(self.clock.now_ms(), was_gpu, during_start) {
            Decision::GiveUp => {
                let reason = format!(
                    "quá {} lần lỗi trong 10 phút: {reason}",
                    self.spec.supervisor.max_failures
                );
                Err(self.give_up(Which::Asr, &mut slot.gave_up, GiveUpCause::Failures, reason))
            }
            Decision::Restart { after_ms, use_gpu } => {
                if was_gpu && !use_gpu {
                    slot.use_gpu = false;
                    self.asr_on_cpu.store(true, Ordering::SeqCst);
                    self.emit(SidecarEvent::CpuFallback { which: Which::Asr });
                }
                self.emit(SidecarEvent::Restarting {
                    which: Which::Asr,
                    failures: slot.tracker.failures(),
                    after_ms,
                    reason: reason.to_string(),
                });
                self.clock.sleep(Duration::from_millis(after_ms), &self.wake);
                if self.closing() {
                    return Err(Self::closing_error(Which::Asr));
                }
                Ok(())
            }
        }
    }

    /// Chép lời một đoạn: khởi động worker nếu cần; worker chết thì khởi động lại và gửi lại đoạn một lần.
    pub fn transcribe(&self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
        if self.closing() {
            return Err(AsrFailure::Unavailable("app đang thoát".into()));
        }
        self.touch();
        let mut slot = lock(&self.asr);
        let mut last = String::new();
        for _attempt in 0..2 {
            self.start_asr(&mut slot)
                .map_err(|e| AsrFailure::Unavailable(e.reason))?;
            let worker = slot.worker.as_mut().expect("vừa khởi động");
            match worker.transcribe(req.clone()) {
                Ok(result) => {
                    slot.tracker.on_success();
                    return Ok(result);
                }
                // Hết bộ nhớ lúc chép lời (thường là bộ nhớ GPU): báo app (§9: đề xuất gói Nhẹ) và tính là một lần lỗi
                // như khi worker chết, nên 2 lần liên tiếp trên GPU thì chuyển CPU; khởi động lại rồi gửi lại đoạn.
                Err(e) if e.kind() == Some(ErrorKind::OutOfMemory) => {
                    self.emit(SidecarEvent::OutOfMemory { which: Which::Asr });
                    last = e.to_string();
                    self.after_asr_failure(&mut slot, &last, false)
                        .map_err(|e| AsrFailure::Unavailable(e.reason))?;
                }
                // Worker trả `Error` khác cho đoạn mà vẫn sống: bỏ đoạn, không khởi động lại.
                Err(e) if !e.is_crash() => return Err(AsrFailure::Dropped(e.to_string())),
                Err(e) => {
                    last = e.to_string();
                    self.after_asr_failure(&mut slot, &last, false)
                        .map_err(|e| AsrFailure::Unavailable(e.reason))?;
                }
            }
        }
        Err(AsrFailure::Dropped(format!("lỗi cả sau khi gửi lại: {last}")))
    }

    fn start_llama(&self, slot: &mut LlamaSlot) -> Result<(), StartError> {
        if self.retry_llama.swap(false, Ordering::SeqCst) && slot.gave_up.take().is_some() {
            // Như `start_asr`: thử lại từ quyết định ban đầu (`-ngl` theo `--probe`); `asr-worker` đang chạy bằng CPU thì
            // `llama-server` vẫn theo nó ngay dưới đây.
            slot.tracker.reset();
            slot.use_gpu = self.spec.asr.exe_gpu.is_some();
        }
        while slot.server.is_none() {
            if self.closing() {
                return Err(Self::closing_error(Which::Llama));
            }
            if let Some((cause, reason)) = &slot.gave_up {
                return Err(StartError {
                    which: Which::Llama,
                    cause: *cause,
                    reason: reason.clone(),
                });
            }
            let spec = &self.spec.llama;
            if let Err(reason) = self.events.before_spawn(Which::Llama, &spec.exe) {
                return Err(self.give_up(Which::Llama, &mut slot.gave_up, GiveUpCause::Tampered, reason));
            }
            ask_first_run(
                &*self.events,
                Which::Llama,
                &spec.exe,
                &mut slot.asked_first_run,
                &mut slot.first_run,
            );
            // `asr-worker` đang chạy bằng CPU thì `llama-server` chạy theo, nhưng chỉ cho lần chạy này: `asr-worker` về GPU
            // (thử lại sau khi bỏ cuộc) thì lần chạy kế tiếp của `llama-server` cũng về GPU. Báo `CpuFallback` khi lần chạy
            // này bằng CPU mà lần trước dùng GPU (hay là lần đầu).
            let gpu = slot.use_gpu && !self.asr_on_cpu.load(Ordering::SeqCst);
            if slot.use_gpu && !gpu && slot.last_gpu != Some(false) {
                self.emit(SidecarEvent::CpuFallback { which: Which::Llama });
            }
            slot.last_gpu = Some(gpu);
            self.emit(SidecarEvent::Starting {
                which: Which::Llama,
                first_run: slot.first_run,
            });
            let ready_ms = if slot.first_run {
                self.spec.supervisor.first_run_ready_timeout_ms
            } else {
                self.spec.supervisor.ready_timeout_ms
            };
            let launch = LlamaLaunch {
                use_gpu: gpu,
                extra_args: spec.extra_args.clone(),
                ready_timeout: Duration::from_millis(ready_ms),
                request_timeout: Duration::from_millis(self.spec.mt_config.request_timeout_ms),
                env: spec.env.clone(),
                ..LlamaLaunch::new(&spec.exe, &spec.model, &spec.log)
            };
            let mut remember = |k: process::Killer| self.remember(Which::Llama, k);
            match LlamaServer::spawn_with(&launch, &mut remember) {
                Ok(server) => {
                    if self.closing() {
                        drop(server);
                        return Err(Self::closing_error(Which::Llama));
                    }
                    let first_run = std::mem::take(&mut slot.first_run);
                    slot.server = Some(server);
                    self.llama_running.store(true, Ordering::SeqCst);
                    self.emit(SidecarEvent::Ready {
                        which: Which::Llama,
                        use_gpu: gpu,
                        backend: None,
                        first_run,
                    });
                }
                Err(e) => {
                    lock(&self.killers).llama = None;
                    if self.closing() {
                        return Err(Self::closing_error(Which::Llama));
                    }
                    let reason = format!("{e:#}");
                    if looks_out_of_memory(&reason) {
                        self.emit(SidecarEvent::OutOfMemory { which: Which::Llama });
                    }
                    if is_not_ready(&e) && std::mem::take(&mut slot.first_run) {
                        self.first_run_timeout(Which::Llama, &slot.tracker, &reason);
                        continue;
                    }
                    self.after_llama_failure(slot, &reason)?;
                }
            }
        }
        Ok(())
    }

    /// Ghi một lần lỗi của `llama-server`. Khác `asr-worker`: lỗi lúc khởi động không chuyển CPU ngay (llama.cpp tự dùng
    /// CPU khi không có GPU); chỉ 2 lần lỗi liên tiếp trên GPU mới chạy lại với `-ngl 0`.
    fn after_llama_failure(&self, slot: &mut LlamaSlot, reason: &str) -> Result<(), StartError> {
        if slot.server.take().is_some() {
            self.llama_running.store(false, Ordering::SeqCst);
        }
        lock(&self.killers).llama = None;
        if self.closing() {
            return Err(Self::closing_error(Which::Llama));
        }
        // Chỉ lỗi khi thật sự chạy bằng GPU mới tính vào luật chuyển CPU của riêng `llama-server`.
        let was_gpu = slot.last_gpu == Some(true);
        match slot.tracker.on_failure(self.clock.now_ms(), was_gpu, false) {
            Decision::GiveUp => {
                let reason = format!(
                    "quá {} lần lỗi trong 10 phút: {reason}",
                    self.spec.supervisor.max_failures
                );
                Err(self.give_up(Which::Llama, &mut slot.gave_up, GiveUpCause::Failures, reason))
            }
            Decision::Restart { after_ms, use_gpu } => {
                if was_gpu && !use_gpu {
                    slot.use_gpu = false;
                    slot.last_gpu = Some(false);
                    self.emit(SidecarEvent::CpuFallback { which: Which::Llama });
                }
                self.emit(SidecarEvent::Restarting {
                    which: Which::Llama,
                    failures: slot.tracker.failures(),
                    after_ms,
                    reason: reason.to_string(),
                });
                self.clock.sleep(Duration::from_millis(after_ms), &self.wake);
                if self.closing() {
                    return Err(Self::closing_error(Which::Llama));
                }
                Ok(())
            }
        }
    }

    /// Chạy một request tới `llama-server`. Server chết hoặc không còn trả lời `/health` thì tính là một lần lỗi và chờ theo
    /// luật; request này báo `Failed` (bên dịch thử lại một lần, lúc đó server đã được chạy lại).
    fn with_llama<T>(&self, f: impl FnOnce(&mut LlamaServer) -> anyhow::Result<T>) -> Result<T, MtError> {
        if self.closing() {
            return Err(MtError::Unavailable("app đang thoát".into()));
        }
        self.touch();
        let mut slot = lock(&self.llama);
        self.start_llama(&mut slot)
            .map_err(|e| MtError::Unavailable(e.reason))?;
        let server = slot.server.as_mut().expect("vừa khởi động");
        match f(server) {
            Ok(v) => {
                slot.tracker.on_success();
                Ok(v)
            }
            Err(e) => {
                let reason = format!("{e:#}");
                let dead = server.exited().is_some() || !server.healthy();
                if dead {
                    self.after_llama_failure(&mut slot, &reason)
                        .map_err(|e| MtError::Unavailable(e.reason))?;
                }
                Err(MtError::Failed(reason))
            }
        }
    }

    /// Bản giám sát của `asr-worker` cho `engine`.
    pub fn asr(self: &Arc<Self>) -> SupervisedAsr {
        SupervisedAsr(self.clone())
    }

    /// Bản giám sát của `llama-server` cho `engine` và `translate`.
    pub fn mt(self: &Arc<Self>) -> SupervisedMt {
        SupervisedMt(self.clone())
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        self.stop(false);
    }
}

pub struct SupervisedAsr(Arc<SidecarManager>);

impl Asr for SupervisedAsr {
    fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
        self.0.transcribe(req)
    }
}

pub struct SupervisedMt(Arc<SidecarManager>);

impl Mt for SupervisedMt {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        // Gọi hàm của chính `LlamaServer`, không phải `Mt::count_tokens` (cùng tên, trả `MtError`).
        self.0.with_llama(|s| LlamaServer::count_tokens(s, text))
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        self.0.with_llama(|s| LlamaServer::stream(s, req, on_delta))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tracker() -> RestartTracker {
        RestartTracker::new(SupervisorConfig::default())
    }

    fn restart(after_ms: u64, use_gpu: bool) -> Decision {
        Decision::Restart { after_ms, use_gpu }
    }

    #[test]
    fn backoff_is_1_2_5_seconds_then_5() {
        let mut t = tracker();
        let got: Vec<Decision> = (0..5).map(|i| t.on_failure(i * 10_000, false, false)).collect();
        assert_eq!(
            got,
            [
                restart(1_000, false),
                restart(2_000, false),
                restart(5_000, false),
                restart(5_000, false),
                restart(5_000, false)
            ]
        );
    }

    #[test]
    fn more_than_5_failures_in_10_minutes_gives_up() {
        let mut t = tracker();
        for i in 0..5 {
            assert_ne!(t.on_failure(i * 60_000, false, false), Decision::GiveUp);
        }
        assert_eq!(t.on_failure(5 * 60_000, false, false), Decision::GiveUp);
    }

    #[test]
    fn failures_older_than_the_window_do_not_count() {
        let mut t = tracker();
        for i in 0..5 {
            t.on_failure(i * 1_000, false, false);
        }
        // Lỗi thứ 6 tới 10 phút sau lỗi đầu: lỗi đầu đã ra khỏi cửa sổ, còn 5 lần.
        assert_eq!(t.on_failure(600_000, false, false), restart(5_000, false));
    }

    #[test]
    fn two_gpu_crashes_in_a_row_switch_to_cpu() {
        let mut t = tracker();
        assert_eq!(t.on_failure(0, true, false), restart(1_000, true));
        assert_eq!(t.on_failure(10_000, true, false), restart(2_000, false));
        // Có một yêu cầu thành công ở giữa thì không còn "liên tiếp".
        let mut t = tracker();
        t.on_failure(0, true, false);
        t.on_success();
        assert_eq!(t.on_failure(10_000, true, false), restart(2_000, true));
    }

    #[test]
    fn a_gpu_failure_while_starting_switches_to_cpu_at_once() {
        let mut t = tracker();
        assert_eq!(t.on_failure(0, true, true), restart(1_000, false));
    }

    #[test]
    fn fake_clock_sleeps_without_waiting() {
        let clock = FakeClock::default();
        let started = Instant::now();
        clock.sleep(Duration::from_secs(600), &Wake::default());
        assert_eq!((clock.now_ms(), clock.sleeps()), (600_000, vec![600_000]));
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    /// Đồng hồ thật: lần chờ giữa hai lần khởi động bị ngắt ngay khi app thoát, và mọi lần chờ sau đó trả về ngay.
    #[test]
    fn a_real_backoff_is_cut_short_by_wake() {
        let wake = Arc::new(Wake::default());
        let clock = SystemClock::default();
        let waker = {
            let wake = wake.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(50));
                wake.wake();
            })
        };
        let started = Instant::now();
        clock.sleep(Duration::from_secs(30), &wake);
        assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
        waker.join().unwrap();
        assert!(wake.is_woken());
        let started = Instant::now();
        clock.sleep(Duration::from_secs(30), &wake);
        assert!(started.elapsed() < Duration::from_secs(1), "đã ngắt thì không chờ nữa");
    }

    #[test]
    fn out_of_memory_is_recognised_in_llama_logs() {
        assert!(looks_out_of_memory(
            "llama-server thoát sớm (exit status: 1); stderr cuối: llama_model_load: error loading model: unable to \
             allocate Metal buffer: out of memory"
        ));
        assert!(looks_out_of_memory("ggml_vulkan: ErrorOutOfDeviceMemory"));
        assert!(!looks_out_of_memory("llama-server thoát sớm (exit status: 1)"));
    }
}
