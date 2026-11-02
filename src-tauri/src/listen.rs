//! Nghe dịch trực tiếp (spec 2026-11-02-nghe-dich-truc-tiep): hạ âm lượng riêng của các ứng dụng khác khi người dùng bật nút trên
//! overlay, và trả lại khi tắt, khi lỗi, khi app thoát, hay (nếu app sập) ở lần mở sau.
//!
//! An toàn trước hết (spec §7): tính năng này là phụ, không bao giờ làm sập hay kẹt phần còn lại.
//! - Mặc định tắt. Mọi việc chạy trên **một luồng riêng** (`listen`), nơi `Ducker` và COM được dựng và dùng; luồng giao diện chỉ gửi
//!   lệnh qua kênh, không chờ.
//! - Mọi lời gọi vào backend bọc `catch_unwind`: panic hay lỗi ⇒ trả âm lượng, hạ cờ, báo `listenFailed` lên overlay, luồng sống
//!   tiếp (bật lại được). Không `unwrap`/`expect` trên đường chạy.
//! - Cờ [`is_engaged`] chỉ để đường thu biết đang hạ (bộ bù mức, Task 3); tắt thì đường thu không đổi gì.
//! - macOS: chưa hỗ trợ (spec §9): lệnh trả `supported: false`, không dựng luồng nào.

// Trên macOS (chưa hỗ trợ) phần dựng luồng thật chỉ có ở Windows nên nhiều hàm không được gọi: không để cảnh báo `dead_code` làm hỏng
// `clippy -D warnings` của CI macOS. Các test dùng backend giả nên vẫn chạy ở mọi nền tảng.
#![cfg_attr(not(windows), allow(dead_code))]

use crate::errors::CommandError;
use crate::state::SessionStatus;
use audio_ducking::{Backend, BackendError, Ducker};
use serde::Serialize;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Sự kiện báo trạng thái thật (kể cả lỗi) về overlay.
pub const STATE_EVENT: &str = "listen://state";
/// Mã lỗi hiện qua `error.<mã>` ở giao diện.
pub const FAILED: &str = "listenFailed";
pub const UNSUPPORTED: &str = "listenUnsupported";
/// Hỏi phiên mới mỗi 500 ms (spec §4).
const TICK: Duration = Duration::from_millis(500);
/// Chờ tối đa chừng này khi thoát để âm lượng được trả trước khi app đóng.
const EXIT_WAIT: Duration = Duration::from_millis(1500);
#[cfg_attr(not(windows), allow(dead_code))]
const JOURNAL_FILE: &str = "listen-duck.json";

static ENGAGED: AtomicBool = AtomicBool::new(false);

/// Đang "Nghe dịch" (tiếng họp bị hạ): đường thu bù mức. Một lần đọc nguyên tử, rẻ.
pub fn is_engaged() -> bool {
    ENGAGED.load(Ordering::Relaxed)
}

/// Bật/tắt cờ (chỉ luồng `listen` gọi, qua `spawn_worker`).
#[cfg_attr(not(test), allow(dead_code))]
pub fn set_engaged(engaged: bool) {
    ENGAGED.store(engaged, Ordering::SeqCst);
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ListenStatus {
    /// Nền tảng hỗ trợ (hiện chỉ Windows).
    pub supported: bool,
    pub active: bool,
}

/// Payload của [`STATE_EVENT`].
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ListenState {
    pub active: bool,
    pub error: Option<String>,
}

pub(crate) enum Cmd {
    /// Bật, hay đổi mức khi đang bật.
    On {
        level: u8,
    },
    Off,
    Shutdown,
}

/// Chạy `f` mà panic không lan ra: `None` nếu panic.
fn guarded<T>(f: impl FnOnce() -> T) -> Option<T> {
    catch_unwind(AssertUnwindSafe(f)).ok()
}

fn release<B: Backend>(ducker: &mut Option<Ducker<B>>) {
    if let Some(d) = ducker.as_mut() {
        let _ = guarded(|| d.release());
    }
}

fn fail<B: Backend>(ducker: &mut Option<Ducker<B>>, flag: &AtomicBool, report: &dyn Fn(ListenState)) {
    release(ducker);
    flag.store(false, Ordering::SeqCst);
    report(ListenState {
        active: false,
        error: Some(FAILED.into()),
    });
}

/// Mốc thời gian đơn điệu (ms) cho cờ "đang bận".
fn now_ms() -> u64 {
    static BASE: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    BASE.get_or_init(std::time::Instant::now).elapsed().as_millis() as u64 + 1
}

/// Luồng `listen` kẹt trong một lời gọi hệ thống (dịch vụ âm thanh treo) quá chừng này thì coi là hỏng (spec §7: thao tác COM có thời hạn).
const HUNG_AFTER_MS: u64 = 3_000;

/// `busy` ≠ 0 là mốc bắt đầu việc đang làm; quá `limit_ms` mà chưa xong là kẹt.
fn is_hung(busy: &AtomicU64, limit_ms: u64) -> bool {
    let since = busy.load(Ordering::SeqCst);
    since != 0 && now_ms().saturating_sub(since) > limit_ms
}

fn run_loop<B, F>(
    factory: F,
    rx: Receiver<Cmd>,
    tick: Duration,
    report: &dyn Fn(ListenState),
    flag: &AtomicBool,
    busy: &AtomicU64,
) where
    B: Backend,
    F: FnOnce() -> Result<Ducker<B>, BackendError>,
{
    busy.store(now_ms(), Ordering::SeqCst);
    let mut ducker = guarded(factory).and_then(Result::ok);
    if let Some(d) = ducker.as_mut() {
        // Trả những gì lần chạy trước (đã sập) còn bỏ lại.
        let _ = guarded(|| d.restore_stale());
    }
    busy.store(0, Ordering::SeqCst);
    loop {
        let event = rx.recv_timeout(tick);
        busy.store(now_ms(), Ordering::SeqCst);
        match event {
            Ok(Cmd::On { level }) => match ducker.as_mut().and_then(|d| guarded(|| d.engage(level))) {
                Some(Ok(())) => {
                    flag.store(true, Ordering::SeqCst);
                    report(ListenState {
                        active: true,
                        error: None,
                    });
                }
                _ => {
                    let no_backend = ducker.is_none();
                    fail(&mut ducker, flag, report);
                    if no_backend {
                        // Không dựng được backend: kết thúc luồng, để lần bật sau dựng lại từ đầu thay vì kẹt vĩnh viễn.
                        busy.store(0, Ordering::SeqCst);
                        return;
                    }
                }
            },
            Ok(Cmd::Off) => {
                release(&mut ducker);
                flag.store(false, Ordering::SeqCst);
                report(ListenState {
                    active: false,
                    error: None,
                });
            }
            Ok(Cmd::Shutdown) | Err(RecvTimeoutError::Disconnected) => {
                release(&mut ducker);
                flag.store(false, Ordering::SeqCst);
                busy.store(0, Ordering::SeqCst);
                return;
            }
            Err(RecvTimeoutError::Timeout) => {
                let engaged = ducker.as_ref().is_some_and(|d| d.is_engaged());
                if engaged && !matches!(ducker.as_mut().and_then(|d| guarded(|| d.tick())), Some(Ok(()))) {
                    fail(&mut ducker, flag, report);
                }
            }
        }
        busy.store(0, Ordering::SeqCst);
    }
}

/// Dựng luồng `listen` (xem [`spawn_worker_with`]), không theo dõi trạng thái bận.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn spawn_worker<B, F, R>(
    factory: F,
    tick: Duration,
    report: R,
    flag: &'static AtomicBool,
) -> (Sender<Cmd>, Receiver<()>)
where
    B: Backend,
    F: FnOnce() -> Result<Ducker<B>, BackendError> + Send + 'static,
    R: Fn(ListenState) + Send + 'static,
{
    spawn_worker_with(factory, tick, report, flag, Arc::new(AtomicU64::new(0)))
}

/// Dựng luồng `listen`. `factory` chạy **trong luồng đó** (COM và giao diện âm thanh không rời luồng dựng ra chúng). Trả kênh
/// gửi lệnh và kênh báo "đã dừng hẳn" (sau khi trả âm lượng). `busy` ≠ 0 trong lúc luồng đang làm một việc (để phát hiện kẹt).
/// Dựng luồng lỗi thì gửi lệnh sẽ lỗi, người gọi coi là tính năng hỏng.
pub(crate) fn spawn_worker_with<B, F, R>(
    factory: F,
    tick: Duration,
    report: R,
    flag: &'static AtomicBool,
    busy: Arc<AtomicU64>,
) -> (Sender<Cmd>, Receiver<()>)
where
    B: Backend,
    F: FnOnce() -> Result<Ducker<B>, BackendError> + Send + 'static,
    R: Fn(ListenState) + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    let (done_tx, done_rx) = mpsc::channel();
    let spawned = std::thread::Builder::new().name("listen".into()).spawn(move || {
        let _ = guarded(|| run_loop(factory, rx, tick, &report, flag, &busy));
        flag.store(false, Ordering::SeqCst);
        busy.store(0, Ordering::SeqCst);
        let _ = done_tx.send(());
    });
    if let Err(e) = spawned {
        log::warn!("không dựng được luồng Nghe dịch: {e}");
    }
    (tx, done_rx)
}

/// Lúc khởi động: một luồng ngắn trả âm lượng mà lần chạy trước (đã sập) bỏ lại trong sổ. Panic không lan ra.
pub(crate) fn spawn_restore<B, F>(factory: F) -> JoinHandle<()>
where
    B: Backend,
    F: FnOnce() -> Result<Ducker<B>, BackendError> + Send + 'static,
{
    std::thread::spawn(move || {
        let _ = guarded(|| {
            if let Ok(mut ducker) = factory() {
                ducker.restore_stale();
            }
        });
    })
}

pub(crate) struct Handle {
    tx: Sender<Cmd>,
    done: Receiver<()>,
    busy: Arc<AtomicU64>,
}

pub struct ListenService {
    pub(crate) inner: Mutex<Option<Handle>>,
    supported: bool,
    /// Trạng thái người dùng yêu cầu gần nhất. Xác nhận cũ của lệnh trước (ví dụ "đã tắt" tới sau khi người dùng đã bật lại) bị bỏ,
    /// để giao diện không tắt nhầm một lần bật mới ([`should_emit`]).
    desired: Arc<AtomicBool>,
}

impl Default for ListenService {
    fn default() -> Self {
        Self::with_supported(cfg!(windows))
    }
}

fn emit_state<R: Runtime>(app: &AppHandle<R>, state: &ListenState) {
    let _ = app.emit(STATE_EVENT, state);
}

/// Báo lỗi luôn được gửi; xác nhận bật/tắt chỉ gửi khi còn khớp với yêu cầu mới nhất.
pub(crate) fn should_emit(state: &ListenState, desired: bool) -> bool {
    state.error.is_some() || state.active == desired
}

#[cfg_attr(not(windows), allow(dead_code))]
fn journal_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_local_data_dir().ok().map(|d| d.join(JOURNAL_FILE))
}

#[cfg(windows)]
fn spawn_platform<R: Runtime>(app: &AppHandle<R>, desired: Arc<AtomicBool>) -> Option<Handle> {
    use audio_ducking::windows::{WasapiBackend, own_process_tree};
    let journal = journal_path(app)?;
    let app = app.clone();
    let busy = Arc::new(AtomicU64::new(0));
    let (tx, done) = spawn_worker_with(
        move || WasapiBackend::new().map(|b| Ducker::new(b, journal, Box::new(own_process_tree))),
        TICK,
        move |s| {
            if should_emit(&s, desired.load(Ordering::SeqCst)) {
                emit_state(&app, &s);
            }
        },
        &ENGAGED,
        busy.clone(),
    );
    Some(Handle { tx, done, busy })
}

#[cfg(not(windows))]
fn spawn_platform<R: Runtime>(_app: &AppHandle<R>, _desired: Arc<AtomicBool>) -> Option<Handle> {
    None
}

impl ListenService {
    pub fn with_supported(supported: bool) -> Self {
        Self {
            inner: Mutex::new(None),
            supported,
            desired: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn status(&self) -> ListenStatus {
        ListenStatus {
            supported: self.supported,
            active: is_engaged(),
        }
    }

    /// Bật hay tắt. Việc thật chạy ở luồng `listen`; trạng thái đúng (kể cả lỗi) tới qua [`STATE_EVENT`], giá trị trả về là yêu cầu.
    pub fn set<R: Runtime>(&self, app: &AppHandle<R>, enabled: bool, level: u8) -> Result<ListenStatus, CommandError> {
        if !self.supported {
            if enabled {
                emit_state(
                    app,
                    &ListenState {
                        active: false,
                        error: Some(UNSUPPORTED.into()),
                    },
                );
            }
            return Ok(self.status());
        }
        self.desired.store(enabled, Ordering::SeqCst);
        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        // Luồng kẹt trong lời gọi hệ thống: bỏ nó (không kill được), hạ cờ, báo lỗi; lần bật sau dựng luồng mới.
        if guard.as_ref().is_some_and(|h| is_hung(&h.busy, HUNG_AFTER_MS)) {
            *guard = None;
            set_engaged(false);
            self.desired.store(false, Ordering::SeqCst);
            emit_state(
                app,
                &ListenState {
                    active: false,
                    error: Some(FAILED.into()),
                },
            );
            return Ok(ListenStatus {
                supported: true,
                active: false,
            });
        }
        if guard.is_none() && !enabled {
            return Ok(self.status());
        }
        let cmd = |enabled: bool| if enabled { Cmd::On { level } } else { Cmd::Off };
        // Hai lần: luồng đã kết thúc (backend không dựng được lần trước) thì dựng lại một lần rồi gửi lại.
        let mut sent = false;
        for _ in 0..2 {
            if guard.is_none() {
                *guard = spawn_platform(app, self.desired.clone());
            }
            sent = guard.as_ref().is_some_and(|h| h.tx.send(cmd(enabled)).is_ok());
            if sent {
                break;
            }
            *guard = None;
        }
        if !sent {
            self.desired.store(false, Ordering::SeqCst);
            emit_state(
                app,
                &ListenState {
                    active: false,
                    error: Some(FAILED.into()),
                },
            );
            return Ok(ListenStatus {
                supported: true,
                active: false,
            });
        }
        Ok(ListenStatus {
            supported: true,
            active: enabled,
        })
    }

    /// App thoát: trả âm lượng trước khi đóng (chờ tối đa [`EXIT_WAIT`]).
    pub fn shutdown(&self) {
        let handle = self.inner.lock().unwrap_or_else(|e| e.into_inner()).take();
        if let Some(h) = handle
            && h.tx.send(Cmd::Shutdown).is_ok()
        {
            let _ = h.done.recv_timeout(EXIT_WAIT);
        }
    }
}

/// Phiên dịch dừng hay thanh phụ đề ẩn thì "Nghe dịch" phải tắt, kẻo tiếng họp bị hạ mà không có gì được đọc (rà soát cuối, C1).
/// `Starting` không tính: phiên đang khởi động chưa chạy nhưng cũng chưa dừng.
pub(crate) fn should_stop_listening(session: SessionStatus, overlay_visible: bool) -> bool {
    matches!(session, SessionStatus::Idle | SessionStatus::Error) || !overlay_visible
}

/// Gọi mỗi khi trạng thái app đổi (`events::status_changed`). Rẻ khi chưa bật: một lần đọc cờ nguyên tử.
pub fn on_status<R: Runtime>(app: &AppHandle<R>, status: &crate::state::AppStatus) {
    if !is_engaged() || !should_stop_listening(status.session, status.overlay_visible) {
        return;
    }
    if let Some(svc) = app.try_state::<ListenService>() {
        let _ = svc.set(app, false, 0);
    }
}

/// Lúc khởi động: nếu sổ khôi phục còn (lần chạy trước sập giữa lúc đang hạ), trả âm lượng ở một luồng ngắn. Không chặn khởi động.
pub fn restore_on_start<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(windows)]
    if let Some(journal) = journal_path(app).filter(|p| p.is_file()) {
        use audio_ducking::windows::WasapiBackend;
        // Luồng chạy ngầm, không join: không bao giờ làm chậm khởi động.
        drop(spawn_restore(move || {
            WasapiBackend::new().map(|b| Ducker::new(b, journal, Box::new(std::collections::HashSet::new)))
        }));
    }
    #[cfg(not(windows))]
    let _ = app;
}

/// App thoát: trả âm lượng đang hạ (nếu có) trước khi đóng.
pub fn release_on_exit<R: Runtime>(app: &AppHandle<R>) {
    if let Some(svc) = app.try_state::<ListenService>() {
        svc.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use audio_ducking::{Backend, BackendError, Ducker, SessionId, SessionInfo};
    use std::collections::HashSet;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicU32;
    use std::sync::mpsc::{Receiver, Sender};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    const TICK: Duration = Duration::from_millis(20);

    #[derive(Default)]
    struct World {
        sessions: Vec<SessionInfo>,
        fail_on: Option<String>,
        panic_on_sessions: bool,
        block_ms: u64,
    }

    #[derive(Clone, Default)]
    struct Fake(Arc<Mutex<World>>);

    impl Fake {
        fn world(&self) -> std::sync::MutexGuard<'_, World> {
            self.0.lock().unwrap_or_else(|e| e.into_inner())
        }
        fn add(&self, id: &str, pid: u32, volume: f32) {
            self.world().sessions.push(SessionInfo {
                id: SessionId(id.into()),
                pid,
                exe: format!("c:\\app{pid}.exe"),
                volume,
                muted: false,
            });
        }
        fn volume(&self, id: &str) -> Option<f32> {
            self.world().sessions.iter().find(|s| s.id.0 == id).map(|s| s.volume)
        }
    }

    impl Backend for Fake {
        fn sessions(&mut self) -> Result<Vec<SessionInfo>, BackendError> {
            let block = self.world().block_ms;
            if block > 0 {
                std::thread::sleep(Duration::from_millis(block));
            }
            let w = self.world();
            if w.panic_on_sessions {
                drop(w);
                panic!("backend giả panic");
            }
            Ok(w.sessions.clone())
        }
        fn set_volume(&mut self, id: &SessionId, scalar: f32) -> Result<(), BackendError> {
            let mut w = self.world();
            if w.fail_on.as_deref() == Some(id.0.as_str()) {
                return Err(BackendError::Failed("giả".into()));
            }
            match w.sessions.iter().position(|s| &s.id == id) {
                Some(i) => {
                    w.sessions[i].volume = scalar;
                    Ok(())
                }
                None => Err(BackendError::Gone),
            }
        }
    }

    fn temp_journal() -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        std::env::temp_dir().join(format!(
            "listen-test-{}-{}.json",
            std::process::id(),
            N.fetch_add(1, Ordering::SeqCst)
        ))
    }

    struct Rig {
        tx: Sender<Cmd>,
        done: Receiver<()>,
        fake: Fake,
        events: Arc<Mutex<Vec<ListenState>>>,
        flag: &'static AtomicBool,
    }

    fn rig(flag: &'static AtomicBool) -> Rig {
        let fake = Fake::default();
        fake.add("a1", 1, 1.0);
        fake.add("a3", 3, 0.8);
        fake.add("a4", 4, 0.5);
        let events = Arc::new(Mutex::new(Vec::new()));
        let journal = temp_journal();
        let backend = fake.clone();
        let sink = events.clone();
        let (tx, done) = spawn_worker(
            move || Ok(Ducker::new(backend, journal, Box::new(|| HashSet::from([1u32])))),
            TICK,
            move |s| sink.lock().unwrap_or_else(|e| e.into_inner()).push(s),
            flag,
        );
        Rig {
            tx,
            done,
            fake,
            events,
            flag,
        }
    }

    fn wait_for(what: &str, mut cond: impl FnMut() -> bool) {
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(3) {
            if cond() {
                return;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        panic!("hết giờ chờ: {what}");
    }

    impl Rig {
        fn last_event(&self) -> Option<ListenState> {
            self.events.lock().unwrap_or_else(|e| e.into_inner()).last().cloned()
        }
    }

    #[test]
    fn enabling_ducks_other_apps_and_raises_the_flag() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let r = rig(&FLAG);
        r.tx.send(Cmd::On { level: 10 }).unwrap();
        wait_for("cờ bật", || r.flag.load(Ordering::SeqCst));
        assert_eq!(r.fake.volume("a1"), Some(1.0), "app của mình không bị hạ");
        assert!((r.fake.volume("a3").unwrap() - 0.01).abs() < 1e-6);
        assert_eq!(
            r.last_event(),
            Some(ListenState {
                active: true,
                error: None
            })
        );
    }

    #[test]
    fn disabling_restores_volumes_and_clears_the_flag() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let r = rig(&FLAG);
        r.tx.send(Cmd::On { level: 10 }).unwrap();
        wait_for("bật", || r.flag.load(Ordering::SeqCst));
        r.tx.send(Cmd::Off).unwrap();
        wait_for("tắt", || !r.flag.load(Ordering::SeqCst));
        wait_for("trả âm lượng", || {
            (r.fake.volume("a3").unwrap() - 0.8).abs() < 1e-6
        });
        assert!((r.fake.volume("a4").unwrap() - 0.5).abs() < 1e-6);
        assert_eq!(
            r.last_event(),
            Some(ListenState {
                active: false,
                error: None
            })
        );
    }

    #[test]
    fn a_backend_error_turns_it_off_and_reports_listen_failed() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let r = rig(&FLAG);
        r.fake.world().fail_on = Some("a4".into());
        r.tx.send(Cmd::On { level: 10 }).unwrap();
        wait_for("báo lỗi", || r.last_event().is_some_and(|e| e.error.is_some()));
        assert!(!r.flag.load(Ordering::SeqCst));
        assert_eq!(
            r.last_event(),
            Some(ListenState {
                active: false,
                error: Some("listenFailed".into())
            })
        );
        assert!((r.fake.volume("a3").unwrap() - 0.8).abs() < 1e-6, "đã trả phiên hạ dở");
    }

    #[test]
    fn a_panic_in_the_backend_is_caught_and_the_worker_survives() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let r = rig(&FLAG);
        r.tx.send(Cmd::On { level: 10 }).unwrap();
        wait_for("bật", || r.flag.load(Ordering::SeqCst));
        r.fake.world().panic_on_sessions = true;
        wait_for("báo lỗi sau panic", || {
            r.last_event().is_some_and(|e| e.error.is_some())
        });
        assert!(!r.flag.load(Ordering::SeqCst));
        // Luồng vẫn sống: sửa backend rồi bật lại được.
        r.fake.world().panic_on_sessions = false;
        r.tx.send(Cmd::On { level: 10 }).unwrap();
        wait_for("bật lại", || r.flag.load(Ordering::SeqCst));
        assert_eq!(
            r.last_event(),
            Some(ListenState {
                active: true,
                error: None
            })
        );
    }

    #[test]
    fn new_sessions_are_ducked_on_the_next_tick() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let r = rig(&FLAG);
        r.tx.send(Cmd::On { level: 10 }).unwrap();
        wait_for("bật", || r.flag.load(Ordering::SeqCst));
        r.fake.add("a5", 5, 0.9);
        wait_for("phiên mới bị hạ", || {
            r.fake.volume("a5").is_some_and(|v| (v - 0.01).abs() < 1e-6)
        });
    }

    #[test]
    fn changing_the_level_while_active_keeps_the_original() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let r = rig(&FLAG);
        r.tx.send(Cmd::On { level: 10 }).unwrap();
        wait_for("bật", || r.flag.load(Ordering::SeqCst));
        r.tx.send(Cmd::On { level: 50 }).unwrap();
        wait_for("mức mới", || {
            r.fake.volume("a3").is_some_and(|v| (v - 0.25).abs() < 1e-6)
        });
        r.tx.send(Cmd::Off).unwrap();
        wait_for("trả về gốc", || {
            r.fake.volume("a3").is_some_and(|v| (v - 0.8).abs() < 1e-6)
        });
    }

    #[test]
    fn shutdown_releases_and_signals_done() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let r = rig(&FLAG);
        r.tx.send(Cmd::On { level: 10 }).unwrap();
        wait_for("bật", || r.flag.load(Ordering::SeqCst));
        r.tx.send(Cmd::Shutdown).unwrap();
        assert!(
            r.done.recv_timeout(Duration::from_secs(3)).is_ok(),
            "luồng không báo xong"
        );
        assert!(!r.flag.load(Ordering::SeqCst));
        assert!((r.fake.volume("a3").unwrap() - 0.8).abs() < 1e-6);
    }

    #[test]
    fn a_failing_factory_reports_the_error_and_the_worker_ends_so_it_can_be_respawned() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        let (tx, done) = spawn_worker(
            || -> Result<Ducker<Fake>, BackendError> { Err(BackendError::Failed("khởi tạo".into())) },
            TICK,
            move |s| sink.lock().unwrap_or_else(|e| e.into_inner()).push(s),
            &FLAG,
        );
        tx.send(Cmd::On { level: 10 }).unwrap();
        wait_for("báo lỗi", || {
            events
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .iter()
                .any(|e| e.error.is_some())
        });
        assert!(!FLAG.load(Ordering::SeqCst));
        // Luồng kết thúc (không kẹt vĩnh viễn): người gọi thấy kênh đóng và dựng lại ở lần bật sau.
        assert!(done.recv_timeout(Duration::from_secs(3)).is_ok());
        assert!(tx.send(Cmd::On { level: 10 }).is_err());
    }

    #[test]
    fn restore_on_start_gives_back_what_a_crashed_run_left() {
        let fake = Fake::default();
        fake.add("x", 3, 0.01);
        let journal = temp_journal();
        audio_ducking::journal::write(
            &journal,
            &[audio_ducking::journal::Entry {
                id: "x".into(),
                pid: 3,
                exe: "c:\\app3.exe".into(),
                original: 0.8,
                applied: 0.01,
                since: 0,
            }],
        )
        .unwrap();
        let backend = fake.clone();
        let handle = spawn_restore(move || Ok(Ducker::new(backend, journal, Box::new(HashSet::new))));
        handle.join().unwrap();
        assert!((fake.volume("x").unwrap() - 0.8).abs() < 1e-6);
    }

    #[test]
    fn restore_on_start_survives_a_panicking_backend() {
        let fake = Fake::default();
        fake.world().panic_on_sessions = true;
        let journal = temp_journal();
        audio_ducking::journal::write(
            &journal,
            &[audio_ducking::journal::Entry {
                id: "x".into(),
                pid: 3,
                exe: String::new(),
                original: 0.8,
                applied: 0.01,
                since: 0,
            }],
        )
        .unwrap();
        let handle = spawn_restore(move || Ok(Ducker::new(fake, journal, Box::new(HashSet::new))));
        assert!(handle.join().is_ok(), "panic lan ra ngoài luồng khôi phục");
    }

    #[test]
    fn an_unsupported_service_never_spawns_and_says_so() {
        let svc = ListenService::with_supported(false);
        assert_eq!(
            svc.status(),
            ListenStatus {
                supported: false,
                active: false
            }
        );
        assert!(svc.inner.lock().unwrap_or_else(|e| e.into_inner()).is_none());
    }

    #[test]
    fn the_wire_format_is_camel_case() {
        let status = serde_json::to_value(ListenStatus {
            supported: true,
            active: false,
        })
        .unwrap();
        assert_eq!(status, serde_json::json!({ "supported": true, "active": false }));
        let state = serde_json::to_value(ListenState {
            active: false,
            error: Some("listenFailed".into()),
        })
        .unwrap();
        assert_eq!(state, serde_json::json!({ "active": false, "error": "listenFailed" }));
    }

    #[test]
    fn a_stale_off_confirmation_is_dropped_after_a_newer_on_request() {
        // Người dùng tắt rồi bật ngay: xác nhận "đã tắt" của lệnh trước tới sau không được làm giao diện tắt nhầm.
        let off = ListenState {
            active: false,
            error: None,
        };
        let on = ListenState {
            active: true,
            error: None,
        };
        assert!(!should_emit(&off, true));
        assert!(should_emit(&on, true));
        assert!(!should_emit(&on, false));
        assert!(should_emit(&off, false));
        // Báo lỗi luôn tới.
        let err = ListenState {
            active: false,
            error: Some(FAILED.into()),
        };
        assert!(should_emit(&err, true) && should_emit(&err, false));
    }

    #[test]
    fn a_worker_stuck_in_a_system_call_is_reported_hung_and_recovers() {
        static FLAG: AtomicBool = AtomicBool::new(false);
        let fake = Fake::default();
        fake.add("a3", 3, 0.8);
        fake.world().block_ms = 400;
        let busy = Arc::new(AtomicU64::new(0));
        let backend = fake.clone();
        let (tx, _done) = spawn_worker_with(
            move || Ok(Ducker::new(backend, temp_journal(), Box::new(HashSet::new))),
            TICK,
            |_| {},
            &FLAG,
            busy.clone(),
        );
        // Lệnh bật làm backend chặn 400 ms (liệt kê phiên): đang bận.
        tx.send(Cmd::On { level: 10 }).unwrap();
        wait_for("bận", || busy.load(Ordering::SeqCst) != 0);
        std::thread::sleep(Duration::from_millis(120));
        assert!(is_hung(&busy, 50), "phải coi là kẹt khi quá hạn");
        assert!(!is_hung(&busy, 10_000), "chưa quá hạn dài thì chưa kẹt");
        // Hết chặn thì tự hết bận.
        fake.world().block_ms = 0;
        wait_for("hết bận", || busy.load(Ordering::SeqCst) == 0);
        assert!(!is_hung(&busy, 50));
        tx.send(Cmd::Shutdown).unwrap();
    }

    #[test]
    fn the_listen_state_follows_the_session_and_the_overlay() {
        // Rà soát cuối C1: phiên dừng hay thanh phụ đề ẩn thì "Nghe dịch" phải tắt.
        assert!(should_stop_listening(SessionStatus::Idle, true));
        assert!(should_stop_listening(SessionStatus::Error, true));
        assert!(should_stop_listening(SessionStatus::Running, false));
        assert!(should_stop_listening(SessionStatus::Starting, false));
        assert!(!should_stop_listening(SessionStatus::Running, true));
        assert!(!should_stop_listening(SessionStatus::Starting, true));
    }
}
