//! Client của tiến trình phụ `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.1–§4.3, §11). Không bao giờ chặn
//! pipeline: luồng VAD chỉ `try_send` vào kênh 4 đoạn của [`SpeakerLink`]; mọi việc với worker nằm trên các luồng riêng.
//!
//! Một luồng giám sát cho cả phiên ("speaker-client"), và cho mỗi lần chạy worker một luồng ghi, một luồng đọc, một luồng chép
//! stderr vào log:
//! - giám sát: chạy worker, chuyển đoạn từ kênh của luồng VAD sang luồng ghi (`try_send`, đầy thì bỏ), theo dõi chết và quá tải,
//!   khởi động lại;
//! - ghi: ghi khung xuống stdin của worker (có thể chặn khi worker chậm; chỉ chặn chính nó);
//! - đọc: đọc khung từ stdout, chuyển `Assign`, `Voices`, `Merged` cho luồng phụ đề bằng `try_send` vào kênh giới hạn
//!   (`UPDATE_CHANNEL_CAP`; đầy nghĩa là worker gửi dồn: coi như worker chết), báo giám sát.
//!
//! Luật:
//! - Kiểm binary và model trước mỗi lần chạy (`before_spawn`: app kiểm SHA-256, §10.2); từ chối thì tắt tới hết phiên. `Load`
//!   mang SHA-256 của model để worker băm lại đúng các byte nó đọc.
//! - Đường dẫn của binary, model, log đổi sang tuyệt đối ngay ở [`SpeakerLaunch::new`]: worker chạy với thư mục làm việc là thư
//!   mục của binary.
//! - `RAYON_NUM_THREADS=2` đặt trong môi trường của worker, không qua giao thức (§4.1).
//! - Chưa `Ready` thì đoạn tới bị bỏ. `Ready { model_ok: false }` hay lệch phiên bản giao thức: tắt tới hết phiên, không thử lại.
//! - Đoạn không bao giờ có nhãn (bỏ vì tới trước `Ready`, lúc chờ chạy lại, kênh tới worker đầy; worker chết khi đoạn còn chờ;
//!   worker báo `Error` cho đoạn) thì báo luồng phụ đề [`SpeakerUpdate::Unlabeled`] (N1 của rà soát cuối kế hoạch 02).
//! - Worker chết (thoát, khung hỏng, khung quá giới hạn, gửi dồn kể cả khung `Error`, `Ready` lặp lại, mã giọng quá
//!   [`MAX_VOICE_ID`]): chạy lại sau 1, 2, 5 s; chết lần thứ 3 trong phiên thì tắt
//!   tới hết phiên (nên với `max_deaths` 3 chỉ dùng 1 s và 2 s; QĐ 6 của kế hoạch 02). Mã giọng của lần chạy sau được cộng mã lớn
//!   nhất đã thấy, để "Người N" không trùng.
//! - Ghi thời gian khứ hồi của từng đoạn (gửi `Segment` tới lúc có trả lời) vào [`SpeakerHandle::round_trip_ms`] cho công cụ đo.
//! - Quá tải (§11): còn đoạn chưa có trả lời, hay luồng VAD vừa phải bỏ đoạn, liên tục 30 s (kể cả worker treo): kill worker,
//!   tắt tới hết phiên. Hàng chờ trống giữa hai đoạn tính theo mốc luồng đọc nhận trả lời, không theo lúc luồng giám sát thức
//!   (đoạn tới dày mà worker theo kịp thì không phải quá tải). Kế hoạch 04 thêm bậc "tạm dừng đọc tên" trước bước này.
//! - Tắt (kể cả khi hết phiên): kênh của luồng VAD đóng, luồng VAD thấy `Disconnected` và thôi chép âm thanh. Phụ đề chạy bình
//!   thường.
//! - Log chỉ có số đếm, mã lỗi, lý do; không có âm thanh hay tên người.

use crate::logfile;
use crate::process;
use crate::speaker::{LinkEnds, SpeakerLink, SpeakerUpdate, UPDATE_CHANNEL_CAP};
use speaker_protocol::{
    MAX_VOICES_ON_WIRE, PROTOCOL_VERSION, Request, Response, SegmentAudio, SpeakerConfig, VoiceInfo, read_frame,
    write_frame,
};
use std::collections::HashMap;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender, TryRecvError, TrySendError};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Số luồng tính toán của worker (spec §4.1; 1 luồng chỉ 69% đoạn nhúng xong trước 230 ms, `results/toc-do.md`).
pub const WORKER_THREADS: &str = "2";
/// Nhịp của luồng giám sát: chỉ để xét cờ dừng, hạn chờ `Ready` và mốc quá tải (30 s). Đoạn tới và kênh đoạn đóng (engine dừng)
/// đánh thức nó ngay; khứ hồi và lúc hàng chờ trống tính bằng mốc của luồng đọc (`Ctl::Answered`), không phụ thuộc nhịp này.
/// Thưa, để máy chạy pin không bị đánh thức 50 lần mỗi giây suốt buổi họp (N8 của rà soát cuối kế hoạch 02).
const TICK: Duration = Duration::from_millis(200);
/// Mã giọng lớn nhất worker được gửi. Worker đánh mã từ 1, mỗi giọng mới một mã; mã lớn hơn là worker hỏng, và nếu nhận thì khoảng
/// bù của lần chạy sau dồn mọi giọng mới về cùng một mã (N6 của rà soát cuối).
pub const MAX_VOICE_ID: u32 = 1_000_000;
/// Số khung `Error` mỗi lần chạy được ghi log từng khung; sau đó chỉ đếm, ghi tổng khi lần chạy kết thúc (N5 của rà soát cuối).
const ERRORS_LOGGED: usize = 3;
/// Số khung `Error` không có id đoạn (không đi qua kênh nhãn) tối đa mỗi lần chạy; quá thì coi như worker gửi dồn (N5).
const MAX_ERRORS_WITHOUT_SEGMENT: usize = 64;

/// Kiểm trước mỗi lần chạy worker (app: SHA-256 của binary và model). `Err` thì không chạy, tắt tới hết phiên.
pub type BeforeSpawn = Box<dyn Fn(&SpeakerLaunch) -> Result<(), String> + Send + Sync>;

/// Cách chạy `speaker-worker` cho một phiên.
#[derive(Clone, Debug)]
pub struct SpeakerLaunch {
    pub exe: PathBuf,
    pub model: PathBuf,
    /// SHA-256 của model mà app đã kiểm, gửi trong `Load` để worker băm lại byte nó đọc. `None`: model của bản dev, không kiểm.
    pub model_sha256: Option<String>,
    /// stderr của worker; mở nối tiếp và xoay vòng (`logfile`).
    pub log: PathBuf,
    pub config: SpeakerConfig,
    /// Chờ `Ready` sau `Load`; quá thì coi như worker chết.
    pub ready_timeout: Duration,
    /// Chờ trước lần chạy lại thứ 1, 2, 3… (lấy phần tử cuối cho các lần sau).
    pub backoff: Vec<Duration>,
    /// Chết chừng này lần trong phiên thì tắt tới hết phiên.
    pub max_deaths: usize,
    /// Chậm hơn thời gian thực liên tục chừng này thì tắt tới hết phiên.
    pub overload_after: Duration,
    /// Chờ worker tự thoát sau `Shutdown` trước khi kill.
    pub shutdown_grace: Duration,
    /// Biến môi trường thêm (test điều khiển worker giả).
    pub env: Vec<(String, String)>,
}

impl SpeakerLaunch {
    /// Đường dẫn tương đối đổi sang tuyệt đối theo thư mục làm việc hiện tại: worker chạy trong thư mục của binary (`command`), nên
    /// đường dẫn tương đối sẽ bị tìm theo thư mục đó (như `absolute` của `latency-bench session`).
    pub fn new(exe: &Path, model: &Path, log: &Path, config: SpeakerConfig) -> Self {
        let absolute = |p: &Path| std::path::absolute(p).unwrap_or_else(|_| p.to_path_buf());
        Self {
            exe: absolute(exe),
            model: absolute(model),
            model_sha256: None,
            log: absolute(log),
            config,
            ready_timeout: Duration::from_secs(30),
            backoff: vec![Duration::from_secs(1), Duration::from_secs(2), Duration::from_secs(5)],
            max_deaths: 3,
            overload_after: Duration::from_secs(30),
            shutdown_grace: Duration::from_secs(2),
            env: Vec::new(),
        }
    }
}

/// Vì sao nhận giọng tắt tới hết phiên (ghi log; không có tên hay âm thanh).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Disabled {
    Refused(String),
    Spawn(String),
    ModelBad,
    Version(u32),
    Deaths(usize),
    Overload,
}

#[derive(Default)]
struct State {
    ready: bool,
    disabled: Option<Disabled>,
    pid: Option<u32>,
    starts: usize,
    round_ms: Vec<f32>,
}

/// Nhìn trạng thái của client từ ngoài (test, `latency-bench`). App không cần nó.
#[derive(Clone, Default)]
pub struct SpeakerHandle(Arc<(Mutex<State>, Condvar)>);

impl SpeakerHandle {
    fn update(&self, f: impl FnOnce(&mut State)) {
        let (m, cv) = &*self.0;
        f(&mut m.lock().unwrap_or_else(|e| e.into_inner()));
        cv.notify_all();
    }

    fn get<T>(&self, f: impl FnOnce(&State) -> T) -> T {
        f(&self.0.0.lock().unwrap_or_else(|e| e.into_inner()))
    }

    /// Chờ worker sẵn sàng (hay client tắt) tối đa `timeout`; `true` khi đang sẵn sàng.
    pub fn wait_ready(&self, timeout: Duration) -> bool {
        let (m, cv) = &*self.0;
        let guard = m.lock().unwrap_or_else(|e| e.into_inner());
        let (guard, _) = cv
            .wait_timeout_while(guard, timeout, |s| !s.ready && s.disabled.is_none())
            .unwrap_or_else(|e| e.into_inner());
        guard.ready && guard.disabled.is_none()
    }

    pub fn disabled(&self) -> Option<Disabled> {
        self.get(|s| s.disabled.clone())
    }

    pub fn pid(&self) -> Option<u32> {
        self.get(|s| s.pid)
    }

    /// Số lần đã chạy worker trong phiên.
    pub fn starts(&self) -> usize {
        self.get(|s| s.starts)
    }

    /// Thời gian khứ hồi (ms) của từng đoạn đã có trả lời: từ lúc giám sát chuyển `Segment` cho luồng ghi tới lúc luồng đọc nhận
    /// `Assign` hay `Error` của đoạn đó (gồm chờ ghi, nhúng, phân cụm). Cho công cụ đo; app không dùng.
    pub fn round_trip_ms(&self) -> Vec<f32> {
        self.get(|s| s.round_ms.clone())
    }
}

/// Thả ra thì luồng giám sát tắt worker (không chờ ở đây).
struct StopOnDrop(Arc<AtomicBool>);

impl Drop for StopOnDrop {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

/// Chạy nhận giọng cho một phiên. Trả ngay (không chờ worker): [`SpeakerLink`] cho `Engine::start_with_speaker` (giữ client sống
/// qua `keep`), [`SpeakerHandle`] để nhìn trạng thái.
pub fn start(launch: SpeakerLaunch, before_spawn: BeforeSpawn) -> (SpeakerLink, SpeakerHandle) {
    let (mut link, ends) = SpeakerLink::pair();
    let stop = Arc::new(AtomicBool::new(false));
    let handle = SpeakerHandle::default();
    let spawned = {
        let (stop, handle) = (stop.clone(), handle.clone());
        std::thread::Builder::new()
            .name("speaker-client".into())
            .spawn(move || supervise(&launch, &before_spawn, ends, &stop, &handle))
    };
    if let Err(e) = spawned {
        // Closure (cùng `ends`) đã bị thả: luồng VAD thấy `Disconnected`.
        log::warn!("nhận giọng: không tạo được luồng client: {e}");
        handle.update(|s| s.disabled = Some(Disabled::Spawn(e.to_string())));
    }
    link.keep = Some(Box::new(StopOnDrop(stop)));
    (link, handle)
}

/// Lệnh chạy worker: thư mục làm việc là thư mục của binary, `RAYON_NUM_THREADS=2`, không tham số.
pub fn command(launch: &SpeakerLaunch) -> Command {
    let mut cmd = Command::new(&launch.exe);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("RAYON_NUM_THREADS", WORKER_THREADS)
        .envs(launch.env.iter().map(|(k, v)| (k, v)));
    if let Some(dir) = launch.exe.parent().filter(|d| !d.as_os_str().is_empty()) {
        cmd.current_dir(dir);
    }
    process::configure(&mut cmd);
    cmd
}

fn supervise(
    launch: &SpeakerLaunch,
    before_spawn: &BeforeSpawn,
    ends: LinkEnds,
    stop: &AtomicBool,
    handle: &SpeakerHandle,
) {
    let LinkEnds {
        segments,
        updates,
        offered_end_ms,
    } = ends;
    let max_voice = Arc::new(AtomicU32::new(0));
    let mut deaths = 0usize;
    let disabled = loop {
        if stop.load(Ordering::SeqCst) {
            break None;
        }
        if let Err(reason) = before_spawn(launch) {
            break Some(Disabled::Refused(reason));
        }
        // Kiểm toàn vẹn (băm cả thư mục) có thể lâu: phiên dừng trong lúc đó thì không chạy worker (N7 của rà soát cuối).
        if stop.load(Ordering::SeqCst) {
            break None;
        }
        let offset = max_voice.load(Ordering::SeqCst);
        let mut run = match Run::spawn(launch, updates.clone(), offset, max_voice.clone()) {
            Ok(run) => run,
            Err(e) => break Some(Disabled::Spawn(e)),
        };
        handle.update(|s| {
            s.pid = Some(run.pid);
            s.starts += 1;
        });
        let outcome = run.serve(launch, &segments, &updates, &offered_end_ms, stop, handle);
        for id in run.shutdown(launch.shutdown_grace) {
            lost(&updates, id);
        }
        handle.update(|s| {
            s.ready = false;
            s.pid = None;
        });
        match outcome {
            Outcome::Stopped => break None,
            Outcome::Disable(d) => break Some(d),
            Outcome::Died(why) => {
                deaths += 1;
                log::warn!("nhận giọng: speaker-worker chết lần {deaths}: {why}");
                if deaths >= launch.max_deaths {
                    break Some(Disabled::Deaths(deaths));
                }
                let wait = launch
                    .backoff
                    .get(deaths - 1)
                    .or(launch.backoff.last())
                    .copied()
                    .unwrap_or_default();
                if !wait_dropping(&segments, &updates, wait, stop) {
                    break None;
                }
            }
        }
    };
    if let Some(d) = disabled {
        log::warn!("nhận giọng: tắt tới hết phiên ({d:?})");
        handle.update(|s| s.disabled = Some(d));
    }
    // `segments` bị thả ở đây: luồng VAD thấy `Disconnected`.
}

/// Chờ `wait`, bỏ mọi đoạn tới trong lúc đó (và báo chúng không bao giờ có nhãn). `false` khi bị dừng hay engine đã đóng kênh.
fn wait_dropping(
    segments: &Receiver<SegmentAudio>,
    updates: &SyncSender<SpeakerUpdate>,
    wait: Duration,
    stop: &AtomicBool,
) -> bool {
    let until = Instant::now() + wait;
    loop {
        if stop.load(Ordering::SeqCst) {
            return false;
        }
        let left = until.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return true;
        }
        match segments.recv_timeout(left.min(TICK)) {
            Ok(seg) => lost(updates, seg.segment_id),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return false,
        }
    }
}

/// Đoạn `id` sẽ không bao giờ có nhãn (bỏ trước khi tới worker, hay worker không trả lời): báo luồng phụ đề (N1 của rà soát cuối
/// kế hoạch 02). `try_send`, không bao giờ chờ: kênh đầy (luồng phụ đề tụt lại xa) thì thôi, đoạn đó coi như nhãn đang tới.
fn lost(updates: &SyncSender<SpeakerUpdate>, id: u64) {
    let _ = updates.try_send(SpeakerUpdate::Unlabeled { segment_id: id });
}

/// Luồng đọc và luồng ghi báo luồng giám sát.
enum Ctl {
    Ready {
        version: u32,
        model_ok: bool,
    },
    /// Worker đã trả lời đoạn này (`Assign` hay `Error`), lúc luồng đọc nhận khung: khứ hồi và lúc hàng chờ trống không gồm nhịp
    /// thức của luồng giám sát.
    Answered(u64, Instant),
    Gone(String),
}

enum Outcome {
    Stopped,
    Disable(Disabled),
    Died(String),
}

/// Một lần chạy worker.
struct Run {
    child: Arc<Mutex<Child>>,
    pid: u32,
    to_writer: Option<SyncSender<Request>>,
    ctl: Receiver<Ctl>,
    threads: Vec<JoinHandle<()>>,
    /// Đoạn đã gửi, chưa có trả lời: id → lúc gửi.
    waiting: HashMap<u64, Instant>,
    /// Đầu quãng liền có đoạn chờ trả lời (`Some` khi và chỉ khi `waiting` khác rỗng), theo mốc gửi và mốc luồng đọc nhận trả
    /// lời, không theo lúc luồng giám sát thức: thức thưa (`TICK`) thì nó thường gửi đoạn mới trước khi thấy trả lời của đoạn cũ,
    /// dù hàng chờ đã trống ở giữa (rà soát lại sau N8).
    busy_since: Option<Instant>,
}

impl Run {
    fn spawn(
        launch: &SpeakerLaunch,
        updates: SyncSender<SpeakerUpdate>,
        offset: u32,
        max_voice: Arc<AtomicU32>,
    ) -> Result<Self, String> {
        let log = logfile::RotatingLog::open(&launch.log, logfile::MAX_BYTES, logfile::KEEP)
            .map_err(|e| format!("không mở được log {}: {e}", launch.log.display()))?;
        let mut cmd = command(launch);
        let mut child = process::spawn(&mut cmd, &launch.exe)
            .map_err(|e| format!("không chạy được {}: {e}", launch.exe.display()))?;
        let pid = child.id();
        let stdin = BufWriter::new(child.stdin.take().expect("stdin là pipe"));
        let stdout = BufReader::new(child.stdout.take().expect("stdout là pipe"));
        let (pump, _tail) = logfile::pump(child.stderr.take().expect("stderr là pipe"), log, Vec::new());
        let child = Arc::new(Mutex::new(child));
        let (to_writer, requests) = mpsc::sync_channel::<Request>(2);
        let (ctl_tx, ctl) = mpsc::channel::<Ctl>();
        let writer = {
            let ctl_tx = ctl_tx.clone();
            std::thread::Builder::new()
                .name("speaker-write".into())
                .spawn(move || write_loop(stdin, requests, ctl_tx))
        };
        let reader = std::thread::Builder::new()
            .name("speaker-read".into())
            .spawn(move || read_loop(stdout, updates, ctl_tx, offset, max_voice));
        let (writer, reader) = match (writer, reader) {
            (Ok(w), Ok(r)) => (w, r),
            (w, r) => {
                kill_and_release(&child, pid);
                drop(to_writer);
                for t in [w.ok(), r.ok(), Some(pump)].into_iter().flatten() {
                    let _ = t.join();
                }
                return Err("không tạo được luồng đọc hay ghi của speaker-worker".into());
            }
        };
        let run = Self {
            child,
            pid,
            to_writer: Some(to_writer),
            ctl,
            threads: vec![pump, writer, reader],
            waiting: HashMap::new(),
            busy_since: None,
        };
        let start = Request::Load {
            model_path: launch.model.display().to_string(),
            model_sha256: launch.model_sha256.clone(),
            config: launch.config.clone(),
        };
        let session = Request::SessionStart {
            unix_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| d.as_millis() as u64),
        };
        if let Some(w) = &run.to_writer {
            // Kênh 2 chỗ, luồng ghi chưa nhận gì: hai lần gửi này không chờ.
            let _ = w.try_send(start);
            let _ = w.try_send(session);
        }
        Ok(run)
    }

    /// Xử lý mọi tin đang chờ của luồng đọc và luồng ghi. `Some` khi lần chạy phải kết thúc.
    fn drain_ctl(
        &mut self,
        ready: &mut bool,
        received_end: &mut u64,
        offered_end_ms: &AtomicU64,
        started: Instant,
        handle: &SpeakerHandle,
    ) -> Option<Outcome> {
        loop {
            match self.ctl.try_recv() {
                Ok(Ctl::Ready { version, .. }) if version != PROTOCOL_VERSION => {
                    return Some(Outcome::Disable(Disabled::Version(version)));
                }
                Ok(Ctl::Ready { model_ok: false, .. }) => return Some(Outcome::Disable(Disabled::ModelBad)),
                Ok(Ctl::Ready { .. }) => {
                    *ready = true;
                    *received_end = offered_end_ms.load(Ordering::SeqCst);
                    handle.update(|s| s.ready = true);
                    log::info!(
                        "nhận giọng: speaker-worker sẵn sàng sau {} ms",
                        started.elapsed().as_millis()
                    );
                }
                Ok(Ctl::Answered(id, at)) => {
                    if let Some(sent) = self.waiting.remove(&id) {
                        let ms = at.saturating_duration_since(sent).as_secs_f32() * 1000.0;
                        handle.update(|s| s.round_ms.push(ms));
                    }
                    // Trả lời tới theo thứ tự: mọi đoạn còn chờ đều gửi sau `at` thì lúc `at` hàng chờ trống, quãng bận cũ hết ở đó.
                    if self.waiting.values().all(|&sent| sent > at) {
                        self.busy_since = self.waiting.values().min().copied();
                    }
                }
                Ok(Ctl::Gone(why)) => return Some(Outcome::Died(why)),
                Err(TryRecvError::Empty) => return None,
                Err(TryRecvError::Disconnected) => return Some(Outcome::Died("mất luồng đọc".into())),
            }
        }
    }

    fn serve(
        &mut self,
        launch: &SpeakerLaunch,
        segments: &Receiver<SegmentAudio>,
        updates: &SyncSender<SpeakerUpdate>,
        offered_end_ms: &AtomicU64,
        stop: &AtomicBool,
        handle: &SpeakerHandle,
    ) -> Outcome {
        let started = Instant::now();
        let mut ready = false;
        let mut received_end = offered_end_ms.load(Ordering::SeqCst);
        let mut behind_since: Option<Instant> = None;
        let (mut sent, mut dropped) = (0u64, 0u64);
        loop {
            if stop.load(Ordering::SeqCst) {
                return Outcome::Stopped;
            }
            if let Some(outcome) = self.drain_ctl(&mut ready, &mut received_end, offered_end_ms, started, handle) {
                return outcome;
            }
            if !ready && started.elapsed() >= launch.ready_timeout {
                return Outcome::Died(format!("không có Ready sau {:?}", launch.ready_timeout));
            }
            // Xét quá tải sau khi đã rút hết trả lời (`drain_ctl` ở trên), không ngay sau khi gửi đoạn.
            if ready {
                let behind = self.busy_since.is_some() || offered_end_ms.load(Ordering::SeqCst) > received_end;
                // `busy_since` muộn hơn `behind_since`: hàng chờ đã trống ở giữa, quãng chậm cũ đã hết.
                behind_since = behind.then(|| behind_since.max(self.busy_since).unwrap_or_else(Instant::now));
                if behind_since.is_some_and(|t| t.elapsed() >= launch.overload_after) {
                    log::warn!(
                        "nhận giọng: speaker-worker chậm hơn thời gian thực {:?} liền ({} đoạn chờ, đã gửi {sent}, bỏ {dropped})",
                        launch.overload_after,
                        self.waiting.len()
                    );
                    return Outcome::Disable(Disabled::Overload);
                }
            }
            match segments.recv_timeout(TICK) {
                Ok(seg) => {
                    received_end = received_end.max(seg.end_ms);
                    let id = seg.segment_id;
                    // `Ready` có thể vừa tới trong lúc chờ đoạn (luồng giám sát thức thưa): xét lại trước khi coi đoạn là tới sớm.
                    if !ready
                        && let Some(outcome) =
                            self.drain_ctl(&mut ready, &mut received_end, offered_end_ms, started, handle)
                    {
                        lost(updates, id);
                        return outcome;
                    }
                    if !ready {
                        dropped += 1;
                        lost(updates, id);
                    } else {
                        match self.to_writer.as_ref().map(|w| w.try_send(Request::Segment(seg))) {
                            Some(Ok(())) => {
                                let now = Instant::now();
                                self.waiting.insert(id, now);
                                self.busy_since.get_or_insert(now);
                                sent += 1;
                            }
                            Some(Err(TrySendError::Full(_))) => {
                                dropped += 1;
                                lost(updates, id);
                            }
                            Some(Err(TrySendError::Disconnected(_))) | None => {
                                lost(updates, id);
                                return Outcome::Died("mất luồng ghi".into());
                            }
                        }
                    }
                }
                Err(RecvTimeoutError::Timeout) => {}
                // Engine đã dừng: không còn đoạn nào.
                Err(RecvTimeoutError::Disconnected) => return Outcome::Stopped,
            }
        }
    }

    /// Gửi `Shutdown`, chờ worker thoát tối đa `grace` rồi kill; chờ các luồng của lần chạy này kết thúc. Trả id các đoạn đã gửi mà
    /// worker không bao giờ trả lời (theo thứ tự), để báo chúng không có nhãn.
    fn shutdown(mut self, grace: Duration) -> Vec<u64> {
        if let Some(w) = self.to_writer.take() {
            let _ = w.try_send(Request::Shutdown);
        }
        let deadline = Instant::now() + grace;
        let mut exited = false;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = self.child.lock().unwrap_or_else(|e| e.into_inner()).try_wait() {
                exited = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        if exited {
            process::release(self.pid);
        } else {
            kill_and_release(&self.child, self.pid);
        }
        for t in self.threads.drain(..) {
            let _ = t.join();
        }
        // Worker trả nốt các đoạn trước khi đọc `Shutdown`: luồng đọc đã chuyển những trả lời đó đi trước khi kết thúc.
        while let Ok(ctl) = self.ctl.try_recv() {
            if let Ctl::Answered(id, _) = ctl {
                self.waiting.remove(&id);
            }
        }
        let mut unanswered: Vec<u64> = self.waiting.drain().map(|(id, _)| id).collect();
        unanswered.sort_unstable();
        unanswered
    }
}

fn kill_and_release(child: &Mutex<Child>, pid: u32) {
    let mut c = child.lock().unwrap_or_else(|e| e.into_inner());
    let _ = c.kill();
    let _ = c.wait();
    process::release(pid);
}

fn write_loop(mut stdin: BufWriter<ChildStdin>, requests: Receiver<Request>, ctl: Sender<Ctl>) {
    for request in requests {
        if let Err(e) = write_frame(&mut stdin, &request) {
            let _ = ctl.send(Ctl::Gone(format!("ghi cho speaker-worker lỗi: {e}")));
            return;
        }
    }
}

fn read_loop(
    mut stdout: BufReader<ChildStdout>,
    updates: SyncSender<SpeakerUpdate>,
    ctl: Sender<Ctl>,
    offset: u32,
    max_voice: Arc<AtomicU32>,
) {
    let map = |v: u32| -> u32 {
        let id = v.saturating_add(offset);
        max_voice.fetch_max(id, Ordering::SeqCst);
        id
    };
    // Kênh tới luồng phụ đề có giới hạn: đầy nghĩa là worker gửi dồn (worker đúng chỉ gửi vài cập nhật mỗi đoạn), coi như worker
    // chết. Engine đã dừng (`Disconnected`) thì bỏ qua như trước. Không bao giờ chặn.
    let forward = |update: SpeakerUpdate| -> bool { !matches!(updates.try_send(update), Err(TrySendError::Full(_))) };
    let flooded = || format!("speaker-worker gửi cập nhật dồn dập (kênh tới luồng phụ đề đầy {UPDATE_CHANNEL_CAP})");
    let (mut got_ready, mut ready) = (false, false);
    let (mut errors, mut errors_without_segment) = (0usize, 0usize);
    let gone = loop {
        let response = match read_frame::<_, Response>(&mut stdout) {
            Ok(Some(r)) => r,
            Ok(None) => break "speaker-worker đóng stdout".to_string(),
            Err(e) => break format!("khung từ speaker-worker hỏng: {e}"),
        };
        if let Some(voice) = too_big_voice(&response) {
            break format!("mã giọng {voice} vượt {MAX_VOICE_ID}");
        }
        match response {
            Response::Ready { .. } if got_ready => break "Ready lặp lại".into(),
            Response::Ready {
                protocol_version,
                model_ok,
            } => {
                got_ready = true;
                ready = protocol_version == PROTOCOL_VERSION && model_ok;
                let _ = ctl.send(Ctl::Ready {
                    version: protocol_version,
                    model_ok,
                });
            }
            _ if !ready => break "khung trước Ready".into(),
            Response::Assign {
                segment_id,
                voice,
                confidence,
            } => {
                if !forward(SpeakerUpdate::Assign {
                    segment_id,
                    voice: voice.map(map),
                    confidence,
                }) {
                    break flooded();
                }
                let _ = ctl.send(Ctl::Answered(segment_id, Instant::now()));
            }
            Response::Voices { voices } if voices.len() > MAX_VOICES_ON_WIRE => {
                break format!("Voices có {} giọng", voices.len());
            }
            Response::Voices { voices } => {
                let voices = voices
                    .into_iter()
                    .map(|v| VoiceInfo {
                        voice: map(v.voice),
                        ..v
                    })
                    .collect();
                if !forward(SpeakerUpdate::Voices(voices)) {
                    break flooded();
                }
            }
            Response::Merged { from, into } => {
                if !forward(SpeakerUpdate::Merged {
                    from: map(from),
                    into: map(into),
                }) {
                    break flooded();
                }
            }
            Response::Error { segment_id, kind, .. } => {
                errors += 1;
                if errors <= ERRORS_LOGGED {
                    log::warn!("nhận giọng: speaker-worker báo {kind:?} cho đoạn {segment_id:?}");
                }
                match segment_id {
                    // Đoạn này không bao giờ có nhãn (N1 của rà soát cuối); đi qua kênh nhãn nên tính vào ngưỡng gửi dồn.
                    Some(id) => {
                        if !forward(SpeakerUpdate::Unlabeled { segment_id: id }) {
                            break flooded();
                        }
                        let _ = ctl.send(Ctl::Answered(id, Instant::now()));
                    }
                    None => {
                        errors_without_segment += 1;
                        if errors_without_segment > MAX_ERRORS_WITHOUT_SEGMENT {
                            break format!(
                                "speaker-worker gửi dồn khung Error không có đoạn (quá {MAX_ERRORS_WITHOUT_SEGMENT})"
                            );
                        }
                    }
                }
            }
        }
    };
    if errors > ERRORS_LOGGED {
        log::warn!(
            "nhận giọng: speaker-worker báo {errors} lỗi trong lần chạy này (log chỉ ghi {ERRORS_LOGGED} lỗi đầu)"
        );
    }
    let _ = ctl.send(Ctl::Gone(gone));
}

/// Mã giọng vượt [`MAX_VOICE_ID`] trong khung (worker hỏng; N6 của rà soát cuối).
fn too_big_voice(response: &Response) -> Option<u32> {
    let big = |v: &u32| *v > MAX_VOICE_ID;
    match response {
        Response::Assign { voice, .. } => voice.filter(big),
        Response::Voices { voices } => voices.iter().map(|v| v.voice).find(big),
        Response::Merged { from, into } => [*from, *into].into_iter().find(big),
        Response::Ready { .. } | Response::Error { .. } => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_worker_gets_two_threads_and_runs_in_its_folder() {
        let launch = SpeakerLaunch::new(
            Path::new("/app/binaries/speaker-worker"),
            Path::new("/m/eres2net.onnx"),
            Path::new("/l/speaker-worker.log"),
            SpeakerConfig::default(),
        );
        let cmd = command(&launch);
        // So với `exe.parent()` để đúng cả trên Windows (`absolute` thêm ổ đĩa).
        assert_eq!(cmd.get_current_dir(), launch.exe.parent());
        assert!(launch.exe.ends_with("app/binaries/speaker-worker"));
        assert_eq!(cmd.get_args().count(), 0, "mọi tham số đi qua `Load`");
        assert!(
            cmd.get_envs()
                .any(|(k, v)| k == "RAYON_NUM_THREADS" && v == Some(std::ffi::OsStr::new("2")))
        );
    }

    /// Worker chạy trong thư mục của binary: đường dẫn tương đối (như `target/release/speaker-worker` của công cụ đo) phải thành
    /// tuyệt đối trước, không thì hệ điều hành tìm theo thư mục mới và không chạy được.
    #[test]
    fn relative_paths_become_absolute_before_the_folder_changes() {
        let launch = SpeakerLaunch::new(
            Path::new("target/release/speaker-worker"),
            Path::new("models/eres2net.onnx"),
            Path::new("speaker-worker.log"),
            SpeakerConfig::default(),
        );
        let cmd = command(&launch);
        assert!(Path::new(cmd.get_program()).is_absolute(), "{:?}", cmd.get_program());
        assert!(cmd.get_current_dir().is_some_and(Path::is_absolute));
        assert!(launch.model.is_absolute() && launch.log.is_absolute());
        assert!(launch.exe.ends_with("target/release/speaker-worker"));
    }
}
