//! Client của `tts-worker`: một luồng giám sát duy nhất giữ toàn bộ trạng thái (tiến trình, các yêu cầu đang chờ), nhận lệnh từ
//! giao diện và khung trả lời từ luồng đọc qua cùng một kênh, nên không có khóa lồng nhau.
//!
//! Luật (spec 2026-11-02-doc-ban-dich-tts-design §4):
//! - Chạy lười: chưa có yêu cầu thì không có tiến trình. Lần đọc đầu hoặc [`TtsClient::warmup`] mới chạy worker.
//! - Mỗi lúc chỉ đọc một câu: câu mới tới thì câu đang đọc bị hủy ([`Failure::Cancelled`]) và câu mới vào hàng; worker xử lý
//!   `Cancel` ngay cả khi đang sinh.
//! - Worker chết (thoát, khung hỏng, lệch phiên bản giao thức): mọi yêu cầu đang chờ nhận [`Failure::WorkerDied`]; lần yêu cầu
//!   sau chạy lại sau 1, 2, 5 s; chết `max_deaths` lần thì tắt tới hết phiên ([`Failure::Disabled`]). Lệch phiên bản giao thức hay
//!   chạy không được thì tắt ngay, không thử lại.
//! - Rảnh quá `idle_timeout` thì tắt worker (nhả khoảng 0,5 GB RAM); yêu cầu sau sẽ chạy lại.
//! - Hàm gọi lại (`on_event`) chạy trên luồng giám sát: phải nhẹ và không chặn (gửi vào kênh rồi thoát).
//! - Log chỉ có số đếm và lý do, không có chữ hay âm thanh.

#![forbid(unsafe_code)]

use std::collections::HashMap;
use std::io::{self, BufReader};
use std::process::{Child, ChildStdin};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tts_protocol::{ErrorKind, Lang, PROTOCOL_VERSION, Request, Response, read_frame, write_frame};

pub use tts_protocol::Lang as Language;

/// Chạy một tiến trình worker mới với stdin và stdout là ống (`Stdio::piped()`); stderr do app quyết định.
pub type Spawner = Arc<dyn Fn() -> io::Result<Child> + Send + Sync>;

/// Thông báo trạng thái cho app (log, biểu tượng), không chứa chữ của người dùng.
pub type Notice = Arc<dyn Fn(&str) + Send + Sync>;

/// Gọi với pid của tiến trình worker sau khi nó đã được `wait` (app dùng để bỏ ghi nhận pidfile).
pub type ExitHook = Arc<dyn Fn(u32) + Send + Sync>;

type WarmupCb = Box<dyn FnOnce(Result<(), Failure>) + Send>;
type SpeakCb = Box<dyn FnMut(Event) + Send>;

pub struct Config {
    pub spawn: Spawner,
    pub idle_timeout: Duration,
    pub ready_timeout: Duration,
    pub max_deaths: u32,
    pub restart_delays: Vec<Duration>,
    pub notice: Notice,
    pub on_exit: ExitHook,
}

impl Config {
    pub fn new(spawn: Spawner) -> Self {
        Self {
            spawn,
            idle_timeout: Duration::from_secs(300),
            ready_timeout: Duration::from_secs(15),
            max_deaths: 3,
            restart_delays: vec![Duration::from_secs(1), Duration::from_secs(2), Duration::from_secs(5)],
            notice: Arc::new(|_| {}),
            on_exit: Arc::new(|_| {}),
        }
    }
}

/// Lý do một yêu cầu không xong.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Failure {
    /// Bị hủy (người dùng bấm câu khác, hoặc [`TtsClient::cancel`]).
    Cancelled,
    /// Model chưa cài hoặc hỏng.
    ModelMissing,
    /// Chữ không hợp lệ (rỗng, quá dài).
    BadRequest,
    /// Lỗi khi suy luận.
    Inference,
    /// Worker chết giữa chừng; yêu cầu sau sẽ thử chạy lại.
    WorkerDied,
    /// Đã tắt tới hết phiên (chết nhiều lần, lệch phiên bản giao thức hay không chạy được); kèm lý do.
    Disabled(String),
}

/// Sự kiện của một yêu cầu đọc.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Event {
    /// PCM 48 kHz mono `i16`.
    Audio(Vec<i16>),
    Done,
    Failed(Failure),
}

enum Cmd {
    Speak {
        id: u64,
        lang: Lang,
        text: String,
        voice: Option<String>,
        cb: Box<dyn FnMut(Event) + Send>,
    },
    Warmup {
        id: u64,
        cb: Box<dyn FnOnce(Result<(), Failure>) + Send>,
    },
    Cancel(u64),
    CancelAll,
    Shutdown,
}

enum Ev {
    Cmd(Cmd),
    Resp(u64, Response),
    Eof(u64),
}

pub struct TtsClient {
    tx: Sender<Ev>,
    next_id: AtomicU64,
    disabled: Arc<Mutex<Option<String>>>,
    running: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

enum Pending {
    Speak(SpeakCb),
    Warmup(Option<WarmupCb>),
}

struct Proc {
    generation: u64,
    child: Child,
    stdin: ChildStdin,
    reader: Option<JoinHandle<()>>,
    ready: bool,
    spawned: Instant,
    /// Yêu cầu chờ `Ready` rồi mới gửi.
    queued: Vec<Request>,
}

struct Core {
    cfg: Config,
    tx: Sender<Ev>,
    proc: Option<Proc>,
    pending: HashMap<u64, Pending>,
    deaths: u32,
    next_spawn_not_before: Instant,
    generation: u64,
    last_activity: Instant,
    disabled: Arc<Mutex<Option<String>>>,
    running: Arc<AtomicBool>,
}

impl TtsClient {
    pub fn new(cfg: Config) -> Self {
        let (tx, rx) = mpsc::channel::<Ev>();
        let disabled = Arc::new(Mutex::new(None));
        let running = Arc::new(AtomicBool::new(false));
        let mut core = Core {
            cfg,
            tx: tx.clone(),
            proc: None,
            pending: HashMap::new(),
            deaths: 0,
            next_spawn_not_before: Instant::now(),
            generation: 0,
            last_activity: Instant::now(),
            disabled: disabled.clone(),
            running: running.clone(),
        };
        let handle = thread::Builder::new()
            .name("tts-client".into())
            .spawn(move || core.run(rx))
            .expect("không tạo được luồng tts-client");
        Self {
            tx,
            next_id: AtomicU64::new(1),
            disabled,
            running,
            thread: Mutex::new(Some(handle)),
        }
    }

    /// Đọc một câu. Trả `id` để hủy; sự kiện đi qua `on_event` trên luồng giám sát (phải nhẹ). Câu đang đọc (nếu có) bị hủy.
    pub fn speak(
        &self,
        lang: Lang,
        text: &str,
        voice: Option<String>,
        mut on_event: impl FnMut(Event) + Send + 'static,
    ) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        if let Some(reason) = self.disabled.lock().unwrap().clone() {
            on_event(Event::Failed(Failure::Disabled(reason)));
            return id;
        }
        let cmd = Cmd::Speak {
            id,
            lang,
            text: text.to_string(),
            voice,
            cb: Box::new(on_event),
        };
        if self.tx.send(Ev::Cmd(cmd)).is_err() {
            // Luồng giám sát đã thoát (đã `shutdown`): không có ai nhận, bỏ qua.
        }
        id
    }

    /// Nạp model sẵn; `on_done` nhận kết quả khi worker báo xong.
    pub fn warmup(&self, on_done: impl FnOnce(Result<(), Failure>) + Send + 'static) {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        if let Some(reason) = self.disabled.lock().unwrap().clone() {
            on_done(Err(Failure::Disabled(reason)));
            return;
        }
        let _ = self.tx.send(Ev::Cmd(Cmd::Warmup {
            id,
            cb: Box::new(on_done),
        }));
    }

    pub fn cancel(&self, id: u64) {
        let _ = self.tx.send(Ev::Cmd(Cmd::Cancel(id)));
    }

    pub fn cancel_all(&self) {
        let _ = self.tx.send(Ev::Cmd(Cmd::CancelAll));
    }

    /// Có worker đang chạy (đã nạp model hoặc đang nạp).
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// `Some(lý do)` khi đã tắt tới hết phiên.
    pub fn disabled_reason(&self) -> Option<String> {
        self.disabled.lock().unwrap().clone()
    }

    /// Tắt worker và dừng luồng giám sát; chặn tới khi xong. Gọi nhiều lần cũng được.
    pub fn shutdown(&self) {
        let _ = self.tx.send(Ev::Cmd(Cmd::Shutdown));
        if let Some(h) = self.thread.lock().unwrap().take() {
            let _ = h.join();
        }
    }
}

impl Drop for TtsClient {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl Core {
    fn note(&self, msg: &str) {
        (self.cfg.notice)(msg);
    }

    fn run(&mut self, rx: mpsc::Receiver<Ev>) {
        loop {
            let wait = self.next_wakeup();
            match rx.recv_timeout(wait) {
                Ok(Ev::Cmd(Cmd::Shutdown)) => {
                    self.fail_all(Failure::Cancelled);
                    self.stop_proc(true);
                    return;
                }
                Ok(Ev::Cmd(c)) => self.on_cmd(c),
                Ok(Ev::Resp(gen_, r)) => self.on_resp(gen_, r),
                Ok(Ev::Eof(gen_)) => self.on_eof(gen_),
                Err(RecvTimeoutError::Timeout) => self.on_tick(),
                Err(RecvTimeoutError::Disconnected) => {
                    self.fail_all(Failure::Cancelled);
                    self.stop_proc(true);
                    return;
                }
            }
        }
    }

    fn next_wakeup(&self) -> Duration {
        let mut w = Duration::from_secs(1);
        if let Some(p) = &self.proc {
            if !p.ready {
                let left = self.cfg.ready_timeout.saturating_sub(p.spawned.elapsed());
                w = w.min(left.max(Duration::from_millis(10)));
            } else if self.pending.is_empty() {
                let left = self.cfg.idle_timeout.saturating_sub(self.last_activity.elapsed());
                w = w.min(left.max(Duration::from_millis(10)));
            }
        }
        w
    }

    fn on_tick(&mut self) {
        if let Some(p) = &self.proc {
            if !p.ready && p.spawned.elapsed() >= self.cfg.ready_timeout {
                self.note("worker không báo Ready kịp hạn");
                self.worker_died("không báo Ready kịp hạn");
            } else if p.ready && self.pending.is_empty() && self.last_activity.elapsed() >= self.cfg.idle_timeout {
                self.note("tắt worker vì rảnh");
                self.stop_proc(true);
            }
        }
    }

    fn disable(&mut self, reason: &str) {
        self.note(&format!("tắt giọng đọc tới hết phiên: {reason}"));
        *self.disabled.lock().unwrap() = Some(reason.to_string());
        self.fail_all(Failure::Disabled(reason.to_string()));
        self.stop_proc(false);
    }

    fn fail_all(&mut self, f: Failure) {
        for (_, p) in self.pending.drain() {
            match p {
                Pending::Speak(mut cb) => cb(Event::Failed(f.clone())),
                Pending::Warmup(Some(cb)) => cb(Err(f.clone())),
                Pending::Warmup(None) => {}
            }
        }
    }

    fn stop_proc(&mut self, graceful: bool) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(mut p) = self.proc.take() {
            if graceful {
                let _ = write_frame(&mut p.stdin, &Request::Shutdown);
                drop(p.stdin);
                // Chờ thoát gọn tối đa 2 s rồi kill.
                let t0 = Instant::now();
                loop {
                    match p.child.try_wait() {
                        Ok(Some(_)) => break,
                        Ok(None) if t0.elapsed() < Duration::from_secs(2) => thread::sleep(Duration::from_millis(20)),
                        _ => {
                            let _ = p.child.kill();
                            let _ = p.child.wait();
                            break;
                        }
                    }
                }
            } else {
                drop(p.stdin);
                let _ = p.child.kill();
                let _ = p.child.wait();
            }
            (self.cfg.on_exit)(p.child.id());
            if let Some(r) = p.reader.take() {
                let _ = r.join();
            }
        }
    }

    /// Worker chết: mọi yêu cầu chờ nhận `WorkerDied`; đếm lần chết, tắt tới hết phiên nếu quá số lần.
    fn worker_died(&mut self, why: &str) {
        self.note(&format!("worker chết: {why}"));
        self.stop_proc(false);
        self.deaths += 1;
        if self.deaths >= self.cfg.max_deaths {
            self.disable("worker chết quá nhiều lần");
            return;
        }
        let idx = (self.deaths as usize - 1).min(self.cfg.restart_delays.len().saturating_sub(1));
        let delay = self
            .cfg
            .restart_delays
            .get(idx)
            .copied()
            .unwrap_or(Duration::from_secs(1));
        self.next_spawn_not_before = Instant::now() + delay;
        self.fail_all(Failure::WorkerDied);
    }

    fn ensure_proc(&mut self) -> bool {
        if self.proc.is_some() {
            return true;
        }
        let now = Instant::now();
        if now < self.next_spawn_not_before {
            thread::sleep(self.next_spawn_not_before - now);
        }
        match (self.cfg.spawn)() {
            Ok(mut child) => {
                let (Some(stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
                    let _ = child.kill();
                    self.disable("không mở được ống stdin/stdout của worker");
                    return false;
                };
                self.generation += 1;
                let gen_ = self.generation;
                let tx = self.tx.clone();
                let reader = thread::Builder::new()
                    .name("tts-client-reader".into())
                    .spawn(move || {
                        let mut r = BufReader::new(stdout);
                        while let Ok(Some(resp)) = read_frame::<Response, _>(&mut r) {
                            if resp.validate().is_err() || tx.send(Ev::Resp(gen_, resp)).is_err() {
                                break;
                            }
                        }
                        let _ = tx.send(Ev::Eof(gen_));
                    })
                    .ok();
                self.proc = Some(Proc {
                    generation: gen_,
                    child,
                    stdin,
                    reader,
                    ready: false,
                    spawned: Instant::now(),
                    queued: Vec::new(),
                });
                self.running.store(true, Ordering::SeqCst);
                true
            }
            Err(e) => {
                self.disable(&format!("không chạy được worker: {e}"));
                false
            }
        }
    }

    fn send(&mut self, req: Request) {
        let died = match &mut self.proc {
            Some(p) if p.ready => write_frame(&mut p.stdin, &req).is_err(),
            Some(p) => {
                p.queued.push(req);
                false
            }
            None => false,
        };
        if died {
            self.worker_died("ghi xuống worker lỗi");
        }
    }

    fn on_cmd(&mut self, cmd: Cmd) {
        self.last_activity = Instant::now();
        if let Some(reason) = self.disabled.lock().unwrap().clone() {
            match cmd {
                Cmd::Speak { mut cb, .. } => cb(Event::Failed(Failure::Disabled(reason))),
                Cmd::Warmup { cb, .. } => cb(Err(Failure::Disabled(reason))),
                _ => {}
            }
            return;
        }
        match cmd {
            Cmd::Speak {
                id,
                lang,
                text,
                voice,
                mut cb,
            } => {
                // Chỉ đọc một câu mỗi lúc: hủy câu đang đọc.
                let old: Vec<u64> = self
                    .pending
                    .iter()
                    .filter(|(_, p)| matches!(p, Pending::Speak(_)))
                    .map(|(k, _)| *k)
                    .collect();
                for o in old {
                    self.send(Request::Cancel { id: o });
                }
                if !self.ensure_proc() {
                    cb(Event::Failed(Failure::Disabled(
                        self.disabled
                            .lock()
                            .unwrap()
                            .clone()
                            .unwrap_or_else(|| "không chạy được worker".into()),
                    )));
                    return;
                }
                self.pending.insert(id, Pending::Speak(cb));
                self.send(Request::Speak { id, lang, text, voice });
            }
            Cmd::Warmup { id, cb } => {
                if !self.ensure_proc() {
                    cb(Err(Failure::Disabled(
                        self.disabled
                            .lock()
                            .unwrap()
                            .clone()
                            .unwrap_or_else(|| "không chạy được worker".into()),
                    )));
                    return;
                }
                self.pending.insert(id, Pending::Warmup(Some(cb)));
                self.send(Request::Warmup { id });
            }
            Cmd::Cancel(id) => {
                if self.pending.contains_key(&id) {
                    self.send(Request::Cancel { id });
                }
            }
            Cmd::CancelAll => {
                let ids: Vec<u64> = self.pending.keys().copied().collect();
                for id in ids {
                    self.send(Request::Cancel { id });
                }
            }
            Cmd::Shutdown => {}
        }
    }

    fn on_resp(&mut self, gen_: u64, resp: Response) {
        if self.proc.as_ref().is_none_or(|p| p.generation != gen_) {
            return; // trả lời của lần chạy cũ
        }
        self.last_activity = Instant::now();
        match resp {
            Response::Ready { protocol } => {
                if protocol != PROTOCOL_VERSION {
                    self.disable(&format!(
                        "lệch phiên bản giao thức (worker {protocol}, app {PROTOCOL_VERSION})"
                    ));
                    return;
                }
                let queued = {
                    let p = self.proc.as_mut().expect("đã kiểm");
                    p.ready = true;
                    std::mem::take(&mut p.queued)
                };
                for r in queued {
                    self.send(r);
                }
            }
            Response::Audio { id, pcm, .. } => {
                if let Some(Pending::Speak(cb)) = self.pending.get_mut(&id) {
                    cb(Event::Audio(pcm));
                }
            }
            Response::Done { id } => {
                self.deaths = 0;
                match self.pending.remove(&id) {
                    Some(Pending::Speak(mut cb)) => cb(Event::Done),
                    Some(Pending::Warmup(Some(cb))) => cb(Ok(())),
                    _ => {}
                }
            }
            Response::Failed { id, kind } => {
                let f = match kind {
                    ErrorKind::Cancelled => Failure::Cancelled,
                    ErrorKind::ModelMissing => Failure::ModelMissing,
                    ErrorKind::BadRequest => Failure::BadRequest,
                    ErrorKind::Inference => Failure::Inference,
                };
                match self.pending.remove(&id) {
                    Some(Pending::Speak(mut cb)) => cb(Event::Failed(f.clone())),
                    Some(Pending::Warmup(Some(cb))) => cb(Err(f.clone())),
                    _ => {}
                }
                // Thiếu model là lỗi cấu hình, không phải worker hỏng: không chạy lại vô ích.
                if f == Failure::ModelMissing {
                    self.disable("model giọng đọc chưa cài hoặc hỏng");
                }
            }
        }
    }

    fn on_eof(&mut self, gen_: u64) {
        if self.proc.as_ref().is_some_and(|p| p.generation == gen_) {
            self.worker_died("worker đóng stdout");
        }
    }
}
