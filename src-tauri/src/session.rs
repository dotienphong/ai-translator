//! Phiên dịch (spec §4.2, §12): nối `audio-capture` và `pipeline` vào app. Thay `session_stub.rs` của kế hoạch 01.
//!
//! - Bắt đầu (nút, phím tắt, khay): hiện thanh phụ đề, chạy hai tiến trình phụ nếu chưa chạy ("Đang nạp model…"), mở nguồn
//!   âm thanh, chạy `pipeline::engine`. Mọi việc này chặn lâu nên không bao giờ chạy trên luồng chính.
//! - Bấm lần nữa khi đang chuẩn bị là Hủy: trạng thái về `idle` ngay; lần bắt đầu đang dở thấy cờ hủy thì không chạy
//!   phiên (kiểm cả sau khi đã dựng engine, cùng khóa với trạng thái).
//! - Dừng: engine chốt đoạn đang dở, dịch nốt câu cuối trong khoảng 3 giây, rồi dừng; tiến trình phụ còn chạy thêm 10 phút
//!   (§5).
//! - Lỗi làm phiên dừng (tiến trình phụ bỏ cuộc, không mở được nguồn âm thanh, thiếu quyền): trạng thái `error` kèm mã lỗi.
//!   Lỗi của một phiên cũ (tới muộn) không chạm phiên mới.
//! - Thoát app ([`shutdown`]): không chờ tiến trình phụ đang nạp model hay đang treo; kill chúng.
//! - Phụ đề đi qua hai sự kiện của §6.6 (`subtitle://upsert`, `subtitle://delta`), mức âm lượng qua `audio://level` (chỉ
//!   cửa sổ chính), chỉ báo (trễ, không có âm thanh) qua `app://status`.
//! - Hạn mức (§6.8): engine báo phút đã dịch qua `EventSink::usage`; kế hoạch 06 nối bộ đếm vào [`TauriSink`]. Hết hạn mức
//!   thì engine dừng với `Fatal::QuotaExhausted`, mã lỗi `quotaExhausted`.
//!
//! Phần bên ngoài (tiến trình phụ, nguồn âm thanh, VAD) đi qua `SessionDeps`: app dùng `LiveDeps`, test dùng bản giả
//! (`test_support.rs`), nên luồng bắt đầu, hủy, dừng, lỗi, thoát test được bằng `MockRuntime`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use pipeline::config::PipelineConfig;
use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, FrameSource, Indicators, VadFactory};
use pipeline::glossary::SharedGlossary;
use pipeline::prompt::Lang as MtLang;
use pipeline::subtitle::{Delta, Subtitle};
use pipeline::supervisor::{Asr, GiveUpCause, SidecarEvent, SidecarEvents, SidecarManager, SystemClock, Which};
use pipeline::translate::Mt;
use pipeline::vad::SileroVad;
use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};

use crate::capture::{CaptureEvent, LiveCapture, OnEvent};
use crate::debug::{DebugLog, DebugSession};
use crate::errors::{self, CommandError};
use crate::glossary::{self, ActiveGlossary};
use crate::settings::{AudioSource, Lang, ModelTier, Settings};
use crate::sidecar::{self, first_run, integrity};
use crate::state::{AppState, AppStatus, Loading, SessionStatus};
use crate::transcript::history;
use crate::transcript::store::TranscriptStore;
use crate::{actions, events, overlay, window};

/// Chu kỳ gọi `SessionDeps::tick` (tắt tiến trình phụ khi rảnh 10 phút). Để ngoài `PipelineConfig`: chỉ là nhịp kiểm, mốc
/// 10 phút nằm ở `supervisor.idle_shutdown_ms`.
const TICK_EVERY: Duration = Duration::from_secs(30);
/// Id phụ đề của phiên thứ n bắt đầu từ `n × ID_STRIDE` (không trùng giữa các phiên của một lần chạy app).
const ID_STRIDE: u64 = 1_000_000;
/// Thoát app: chờ lần bắt đầu hay dừng phiên đang dở tối đa chừng này (tiến trình phụ đã bị kill nên nó trả về nhanh).
const SHUTDOWN_WAIT: Duration = Duration::from_secs(2);

/// Những gì một phiên cần từ bên ngoài.
pub trait SessionDeps: Send + Sync {
    /// Chạy hai tiến trình phụ nếu chưa chạy, theo gói model trong cài đặt; chặn tới khi cả hai sẵn sàng.
    fn prepare(&self, settings: &Settings) -> Result<(), CommandError>;
    fn asr(&self) -> Box<dyn Asr>;
    fn mt(&self) -> Box<dyn Mt>;
    fn vad(&self) -> VadFactory;
    /// Mở nguồn âm thanh. Việc của nguồn tới sau (nguồn chạy trên luồng riêng) đi qua `on_event`. `include_self`: xem
    /// [`StartOptions`].
    fn capture(&self, source: &AudioSource, include_self: bool, on_event: OnEvent) -> Box<dyn FrameSource>;
    /// Người dùng bấm Bắt đầu: tiến trình phụ đã bỏ cuộc được thử lại từ đầu (người dùng có thể đã sửa nguyên nhân). Gọi
    /// trước `prepare` của lần bắt đầu; lần chạy sẵn khi mở cửa sổ chính (`prewarm`) thì không (R3-1 của review 02 lần 3).
    fn allow_retry(&self) {}
    fn begin_session(&self) {}
    fn end_session(&self) {}
    /// Trước khi bắt đầu một phiên: hạn mức còn 0 thì từ chối (§6.8, "Khi chạm hạn mức"). Kế hoạch 06 cài bằng bộ đếm phút
    /// của license; mặc định cho bắt đầu.
    fn check_quota(&self) -> Result<(), CommandError> {
        Ok(())
    }
    /// Gọi định kỳ: tắt tiến trình phụ sau 10 phút không dịch.
    fn tick(&self) {}
    /// Thoát app, bước 1: từ giờ không chạy thêm tiến trình phụ nào, kill các tiến trình đang chạy. Không chờ gì.
    fn shutdown(&self) {}
    /// Thoát app, bước cuối: kill mọi tiến trình phụ còn sót.
    fn kill_all(&self) {}
    /// Mã lỗi khi `asr-worker` không dùng được nữa giữa phiên.
    fn asr_failure_code(&self) -> &'static str {
        errors::SIDECAR_FAILED
    }
}

/// Trạng thái phiên, quản lý bằng `tauri::Manager::manage`.
pub struct Session {
    deps: Arc<dyn SessionDeps>,
    engine: Mutex<Option<Engine>>,
    /// Gắn engine của phiên, dừng và dừng vì lỗi lần lượt từng việc một. Không giữ trong lúc chuẩn bị tiến trình phụ (có
    /// thể 60–180 giây), để Hủy rồi bấm Bắt đầu lại có phản hồi ngay (Q-E của review 02 lần 2).
    gate: Mutex<()>,
    /// Số của lần bắt đầu hiện tại. Hủy (hay thoát app) tăng số này: lần bắt đầu đang chuẩn bị thấy số đã đổi thì thôi,
    /// không chạm tới lần bắt đầu mới.
    attempt: AtomicU64,
    /// App đang thoát: không bắt đầu phiên mới.
    closing: AtomicBool,
    sessions: AtomicU64,
    /// Đang có một luồng `prewarm` chạy: mở lại cửa sổ chính trong lúc nạp model không tạo thêm luồng (N3 của review cuối
    /// 02).
    prewarming: AtomicBool,
}

impl Session {
    pub fn new(deps: Arc<dyn SessionDeps>) -> Self {
        Self {
            deps,
            engine: Mutex::new(None),
            gate: Mutex::new(()),
            attempt: AtomicU64::new(0),
            closing: AtomicBool::new(false),
            sessions: AtomicU64::new(0),
            prewarming: AtomicBool::new(false),
        }
    }

    /// Có engine đang chạy không (cho test).
    pub fn has_engine(&self) -> bool {
        self.engine.lock().unwrap().is_some()
    }

    /// Có luồng `prewarm` đang chạy không (cho test).
    pub fn is_prewarming(&self) -> bool {
        self.prewarming.load(Ordering::SeqCst)
    }
}

fn code_of(settings: Lang) -> &'static str {
    match settings {
        Lang::En => "en",
        Lang::Zh => "zh",
        Lang::Ja => "ja",
        Lang::Ko => "ko",
        Lang::Vi => "vi",
    }
}

/// Cấu hình của engine từ cài đặt (§6.9): ngôn ngữ, độ nhạy ngắt câu, cờ ngữ cảnh; và từ điển thuật ngữ dùng chung.
pub fn engine_config(settings: &Settings, id_base: u64, glossary: SharedGlossary) -> EngineConfig {
    let mut pipeline = PipelineConfig::default();
    pipeline.segmenter.end_silence_ms = u64::from(settings.vad_end_silence_ms);
    let languages = match settings.source_lock {
        Some(lang) => vec![code_of(lang).to_string()],
        None => settings
            .source_languages
            .iter()
            .map(|l| code_of(*l).to_string())
            .collect(),
    };
    EngineConfig {
        pipeline,
        languages,
        target: MtLang::from_code(code_of(settings.target_language)).expect("năm ngôn ngữ của F2"),
        translation_context: settings.experimental.translation_context,
        id_base,
        glossary,
    }
}

/// Mã lỗi của một lý do dừng của engine.
pub fn fatal_code(kind: Fatal, asr_code: &'static str) -> &'static str {
    match kind {
        Fatal::Vad => errors::VAD_FAILED,
        Fatal::Audio => errors::CAPTURE_FAILED,
        Fatal::Asr => asr_code,
        Fatal::Internal => errors::UNKNOWN,
        Fatal::QuotaExhausted => errors::QUOTA_EXHAUSTED,
    }
}

fn changed<R: Runtime>(app: &AppHandle<R>) -> AppStatus {
    actions::status_changed(app)
}

/// Hiện thanh phụ đề (§4.2) trên luồng chính: NSPanel chỉ đổi được từ luồng chính.
fn show_overlay<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    if let Err(e) = app.run_on_main_thread(move || {
        if let Err(e) = overlay::set_visible(&handle, true) {
            log::warn!("không hiện được thanh phụ đề: {e}");
        }
    }) {
        log::warn!("không hiện được thanh phụ đề: {e}");
    }
}

/// Báo lỗi của lần bắt đầu số `attempt`, trừ khi người dùng đã hủy lần đó (trạng thái đã về `idle`, hay đã sang lần sau).
fn start_failed<R: Runtime>(app: &AppHandle<R>, attempt: u64, code: &str) -> AppStatus {
    let session = app.state::<Session>();
    app.state::<AppState>().update_status(|s| {
        if s.session == SessionStatus::Starting && session.attempt.load(Ordering::SeqCst) == attempt {
            s.session = SessionStatus::Error;
            s.session_error = Some(code.to_string());
        }
        s.loading = None;
    });
    changed(app)
}

/// Tùy chọn của một phiên.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct StartOptions {
    /// Thu cả âm thanh của chính app: cho bước "Nghe thử" (§4.1 bước 6), khi app tự phát một câu mẫu. Kế hoạch 03 dùng
    /// (Đ16 của kế hoạch 00). Chỉ có tác dụng trên macOS với nguồn toàn hệ thống.
    pub include_self: bool,
}

/// Bắt đầu phiên với nguồn âm thanh trong cài đặt. Chặn tới khi phiên chạy (hoặc lỗi, hoặc bị hủy): gọi từ luồng nền.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
    start_with(app, StartOptions::default())
}

/// Như [`start`], với tùy chọn.
pub fn start_with<R: Runtime>(app: &AppHandle<R>, options: StartOptions) -> Result<AppStatus, CommandError> {
    let session = app.state::<Session>();
    let state = app.state::<AppState>();
    if session.closing.load(Ordering::SeqCst) {
        return Ok(state.status());
    }
    if let Err(e) = session.deps.check_quota() {
        let refused = state.update_status(|s| {
            if matches!(s.session, SessionStatus::Starting | SessionStatus::Running) {
                return false;
            }
            s.session = SessionStatus::Error;
            s.session_error = Some(e.code.clone());
            true
        });
        if refused {
            changed(app);
            return Err(e);
        }
        return Ok(state.status());
    }
    let mut attempt = 0;
    let begun = state.update_status(|s| {
        if matches!(s.session, SessionStatus::Starting | SessionStatus::Running) {
            return false;
        }
        attempt = session.attempt.fetch_add(1, Ordering::SeqCst) + 1;
        s.session = SessionStatus::Starting;
        s.session_error = None;
        s.indicators = Indicators::default();
        s.permission_suspected = false;
        s.waiting_for_app = false;
        s.overlay_visible = true;
        true
    });
    if !begun {
        return Ok(state.status());
    }
    let current = || session.attempt.load(Ordering::SeqCst) == attempt;
    show_overlay(app);
    changed(app);
    let settings = state.settings();
    session.deps.allow_retry();
    if let Err(e) = session.deps.prepare(&settings) {
        if !current() {
            // Lần đã hủy: sự kiện của tiến trình phụ có thể đã đặt lại chỉ báo "Đang nạp model"; không có gì đang nạp
            // nữa thì bỏ nó (Nhỏ-7 của review 02 lần 3).
            state.update_status(|s| {
                if s.session != SessionStatus::Starting {
                    s.loading = None;
                }
            });
            return Ok(changed(app));
        }
        log::error!("không bắt đầu được phiên: {} ({})", e.code, e.message);
        start_failed(app, attempt, &e.code);
        return Err(e);
    }
    if !current() {
        return Ok(state.status());
    }
    // Từ điển thuật ngữ theo gói và theo DB lúc này (§6.5, F5); đọc DB có thể chờ kho khóa nên làm trước khi giữ khóa.
    glossary::reload(app);
    let glossary = app
        .try_state::<ActiveGlossary>()
        .map(|g| g.0.clone())
        .unwrap_or_default();
    // Từ đây tới lúc gắn engine thì giữ khóa (nhanh: chỉ mở nguồn và tạo luồng): lỗi của nguồn âm thanh tới ngay lúc mở
    // (`fail`, trên luồng riêng) chờ tới khi engine đã gắn rồi mới dừng nó.
    let _gate = session.gate.lock().unwrap();
    if !current() {
        return Ok(state.status());
    }
    let n = session.sessions.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some(transcript) = app.try_state::<TranscriptStore>() {
        transcript.begin(n, now_ms(), code_of(settings.target_language));
    }
    let source = session
        .deps
        .capture(&settings.audio_source, options.include_self, capture_events(app, n));
    let sink = Arc::new(TauriSink {
        app: app.clone(),
        session: n,
        asr_code: session.deps.clone(),
    });
    let engine = match Engine::start(
        engine_config(&settings, n * ID_STRIDE, glossary),
        source,
        session.deps.vad(),
        session.deps.asr(),
        session.deps.mt(),
        sink,
    ) {
        Ok(engine) => engine,
        Err(e) => {
            // Không tạo được luồng của phiên: lỗi bên trong app, không phải lỗi nguồn âm thanh (N-1 của review 02 lần 2).
            let e = CommandError::new(errors::UNKNOWN, None, format!("{e:#}"));
            log::error!("không chạy được pipeline: {}", e.message);
            start_failed(app, attempt, &e.code);
            return Err(e);
        }
    };
    // Kiểm hủy lần cuối, cùng khóa với trạng thái: Hủy tới sau bước này thì gặp trạng thái `running` và là Dừng.
    let running = state.update_status(|s| {
        if !current() || s.session != SessionStatus::Starting {
            return false;
        }
        s.session = SessionStatus::Running;
        s.loading = None;
        true
    });
    if !running {
        engine.stop();
        log::info!("hủy phiên dịch {n} lúc đang bắt đầu");
        return Ok(state.status());
    }
    *session.engine.lock().unwrap() = Some(engine);
    session.deps.begin_session();
    log::info!("bắt đầu phiên dịch {n}");
    Ok(changed(app))
}

/// Việc của nguồn âm thanh phiên `n` sang trạng thái của app.
fn capture_events<R: Runtime>(app: &AppHandle<R>, n: u64) -> OnEvent {
    let app = app.clone();
    Box::new(move |event| match event {
        CaptureEvent::Failed { code, message } => {
            let app = app.clone();
            std::thread::spawn(move || fail(&app, n, code, &message));
        }
        CaptureEvent::PermissionSuspected(suspected) => {
            let current = app.state::<Session>().sessions.load(Ordering::SeqCst) == n;
            if current {
                app.state::<AppState>()
                    .update_status(|s| s.permission_suspected = suspected);
                changed(&app);
            }
        }
        CaptureEvent::WaitingForApp(waiting) => {
            let current = app.state::<Session>().sessions.load(Ordering::SeqCst) == n;
            if current {
                app.state::<AppState>().update_status(|s| s.waiting_for_app = waiting);
                changed(&app);
            }
        }
    })
}

/// Dừng engine (nếu có), báo cho tiến trình phụ, chốt bản chép lời của phiên. Không đổi trạng thái. Trả `false` nếu
/// không có engine nào chạy.
fn stop_engine<R: Runtime>(app: &AppHandle<R>, session: &Session) -> bool {
    let engine = session.engine.lock().unwrap().take();
    let Some(engine) = engine else {
        return false;
    };
    let metrics = engine.stop();
    // Số đo của phiên vào log và bảng debug ẩn, không có chữ chép lời (§7, Đ17).
    log::info!("kết thúc phiên dịch: {}", metrics.summary());
    let n = session.sessions.load(Ordering::SeqCst);
    if let Some(debug) = app.try_state::<DebugLog>() {
        debug.record(DebugSession::new(n, now_ms(), &metrics));
    }
    session.deps.end_session();
    // Lưu lịch sử nếu bật "Lưu lịch sử" và là Pro (F4). Chạy ngay ở đây, cả khi thoát app, để không mất phiên cuối.
    end_transcript(app, session);
    true
}

/// Chốt bản chép lời của phiên hiện tại và lưu lịch sử nếu được (`history::save_if_enabled`). `TranscriptStore::end` chỉ
/// trả bản chép lời một lần mỗi phiên, nên gọi lại không lưu hai lần.
fn end_transcript<R: Runtime>(app: &AppHandle<R>, session: &Session) {
    let ended = app
        .try_state::<TranscriptStore>()
        .and_then(|t| t.end(session.sessions.load(Ordering::SeqCst), now_ms()));
    if let Some(transcript) = ended {
        history::save_if_enabled(app, &transcript);
    }
}

/// App thoát mà không qua Thoát ở menu khay: máy tắt, khởi động lại, đăng xuất (macOS cho thoát ngay, `quit_guard`), app
/// tự khởi động lại để cập nhật (§4.3, §6.11). Gọi ở `RunEvent::Exit`: lưu lịch sử của phiên đang chạy như khi bấm Dừng
/// (QĐ15), không chờ engine hay khóa của phiên (Q3 của review 03). Thoát ở menu khay đã lưu ở [`shutdown`], nên lần gọi
/// này không làm gì.
pub fn save_on_exit<R: Runtime>(app: &AppHandle<R>) {
    if let Some(session) = app.try_state::<Session>() {
        end_transcript(app, &session);
    }
}

/// Giờ Unix, ms.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// Dừng phiên (bấm Dừng). Thanh phụ đề giữ nguyên để người dùng còn đọc được các dòng cuối.
pub fn stop<R: Runtime>(app: &AppHandle<R>) -> AppStatus {
    let session = app.state::<Session>();
    let _gate = session.gate.lock().unwrap();
    stop_engine(app, &session);
    app.state::<AppState>().update_status(|s| {
        s.session = SessionStatus::Idle;
        s.loading = None;
        s.indicators = Indicators::default();
        s.permission_suspected = false;
        s.waiting_for_app = false;
    });
    changed(app)
}

/// Dừng phiên `n` vì lỗi (§9). Gọi từ luồng riêng, không từ luồng của engine. Phiên đó đã dừng (người dùng bấm Dừng,
/// hay đã sang phiên khác) thì bỏ qua.
fn fail<R: Runtime>(app: &AppHandle<R>, n: u64, code: &str, message: &str) {
    let session = app.state::<Session>();
    let _gate = session.gate.lock().unwrap();
    if session.sessions.load(Ordering::SeqCst) != n || !stop_engine(app, &session) {
        return;
    }
    log::error!("phiên dịch dừng vì lỗi {code}: {message}");
    app.state::<AppState>().update_status(|s| {
        s.session = SessionStatus::Error;
        s.session_error = Some(code.to_string());
        s.loading = None;
    });
    changed(app);
}

/// Nút, phím tắt, khay: bắt đầu khi chưa dịch; dừng khi đang dịch; đang chuẩn bị thì Hủy (về `idle` ngay).
pub fn toggle<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
    let session = app.state::<Session>();
    let state = app.state::<AppState>();
    let cancelled = state.update_status(|s| {
        if s.session != SessionStatus::Starting {
            return false;
        }
        session.attempt.fetch_add(1, Ordering::SeqCst);
        s.session = SessionStatus::Idle;
        s.loading = None;
        true
    });
    if cancelled {
        log::info!("hủy lần bắt đầu phiên");
        return Ok(changed(app));
    }
    match state.status().session {
        SessionStatus::Idle | SessionStatus::Error => start(app),
        SessionStatus::Running => Ok(stop(app)),
        SessionStatus::Starting => Ok(state.status()),
    }
}

/// Mở cửa sổ chính: chạy sẵn hai tiến trình phụ trên luồng nền (§5, Đ19). Đang có một lần chạy sẵn thì thôi.
pub fn prewarm<R: Runtime>(app: &AppHandle<R>) {
    let Some(session) = app.try_state::<Session>() else {
        return;
    };
    if session.prewarming.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let session = app.state::<Session>();
        let settings = app.state::<AppState>().settings();
        let result = session.deps.prepare(&settings);
        session.prewarming.store(false, Ordering::SeqCst);
        if let Err(e) = result {
            log::warn!("chưa chạy được tiến trình phụ: {} ({})", e.code, e.message);
            app.state::<AppState>().update_status(|s| s.loading = None);
            changed(&app);
        }
    });
}

/// Thoát app (Thoát ở menu khay, §4.3). Không chờ khóa của tiến trình phụ (N1 của review 02c):
/// 1. đặt cờ hủy, chặn mọi lần chạy tiến trình phụ mới và kill các tiến trình đang chạy (`SessionDeps::shutdown`), nên
///    lần bắt đầu phiên hay lần chạy sẵn đang chờ nạp model trả về ngay;
/// 2. chờ tối đa 2 giây để lấy khóa phiên, dừng engine nếu có;
/// 3. kill mọi tiến trình phụ còn sót.
pub fn shutdown<R: Runtime>(app: &AppHandle<R>) {
    let session = app.state::<Session>();
    session.closing.store(true, Ordering::SeqCst);
    session.attempt.fetch_add(1, Ordering::SeqCst);
    session.deps.shutdown();
    let deadline = Instant::now() + SHUTDOWN_WAIT;
    loop {
        match session.gate.try_lock() {
            Ok(_gate) => {
                stop_engine(app, &session);
                break;
            }
            Err(_) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => {
                log::warn!("thoát lúc phiên còn đang bắt đầu hay dừng: không chờ nữa");
                break;
            }
        }
    }
    session.deps.kill_all();
}

/// Luồng nền gọi `tick` định kỳ.
pub fn spawn_ticker<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(TICK_EVERY);
            app.state::<Session>().deps.tick();
        }
    });
}

/// Kết quả của engine sang giao diện và sang bản chép lời trong bộ nhớ (§6.6). Kế hoạch 06 thêm `usage` (đếm phút cho hạn
/// mức, §6.8) ở đây.
struct TauriSink<R: Runtime> {
    app: AppHandle<R>,
    session: u64,
    asr_code: Arc<dyn SessionDeps>,
}

impl<R: Runtime> EventSink for TauriSink<R> {
    fn subtitle(&self, subtitle: &Subtitle) {
        if let Some(transcript) = self.app.try_state::<TranscriptStore>() {
            transcript.upsert(self.session, subtitle);
        }
        let _ = self.app.emit(events::SUBTITLE_UPSERT, subtitle);
    }

    fn delta(&self, delta: &Delta) {
        if let Some(transcript) = self.app.try_state::<TranscriptStore>() {
            transcript.delta(self.session, delta);
        }
        let _ = self.app.emit(events::SUBTITLE_DELTA, delta);
    }

    fn level(&self, rms: f32) {
        // Chỉ cửa sổ chính vẽ mức âm lượng.
        let _ = self
            .app
            .emit_to(EventTarget::webview_window(window::MAIN), events::AUDIO_LEVEL, rms);
    }

    fn indicators(&self, indicators: &Indicators) {
        self.app
            .state::<AppState>()
            .update_status(|s| s.indicators = indicators.clone());
        changed(&self.app);
    }

    fn fatal(&self, kind: Fatal, reason: &str) {
        let code = fatal_code(kind, self.asr_code.asr_failure_code());
        let (app, n, reason) = (self.app.clone(), self.session, reason.to_string());
        std::thread::spawn(move || fail(&app, n, code, &reason));
    }
}

/// Sự kiện của tiến trình phụ sang trạng thái của app, cộng bước kiểm SHA-256 trước mỗi lần chạy (QĐ17) và "lần đầu chạy".
struct StatusEvents<R: Runtime> {
    app: AppHandle<R>,
    dir: PathBuf,
    hashes: Vec<(PathBuf, String)>,
    seen_file: PathBuf,
    /// Binary vừa chạy của mỗi bên (để ghi "đã chạy" khi nó tới `Ready`).
    last_exe: Mutex<[Option<PathBuf>; 2]>,
    /// Windows: handle chỉ cho đọc của lần kiểm gần nhất (`integrity::Verified::locks`), giữ suốt đời app.
    locks: Mutex<Vec<std::fs::File>>,
    /// Lý do bỏ cuộc gần nhất của `asr-worker`.
    asr_gave_up: Arc<Mutex<Option<GiveUpCause>>>,
    /// Mỗi tiến trình phụ (`slot`) đang chạy bằng CPU không: theo `Ready.use_gpu` của lần chạy gần nhất, và bật ngay khi có
    /// `CpuFallback`. Chỉ báo "Đang chạy bằng CPU" hiện khi có ít nhất một cờ bật (Q5-1 của review 02 lần 5).
    on_cpu: Mutex<[bool; 2]>,
    /// Mỗi tiến trình phụ (`slot`) đang nạp không: bật ở `Starting`, tắt ở `Ready` hay `GaveUp` của chính nó. Chỉ báo "Đang
    /// nạp model…" hiện khi có ít nhất một cờ bật, nên tiến trình phụ khởi động lại giữa phiên hay bỏ cuộc không làm chỉ báo
    /// kẹt (Q1 của review cuối 02).
    loading: Mutex<[Option<Loading>; 2]>,
}

impl<R: Runtime> StatusEvents<R> {
    /// Đặt cờ CPU của `which` rồi tính lại chỉ báo chung.
    fn set_cpu(&self, which: Which, cpu: bool) {
        let mut flags = self.on_cpu.lock().unwrap();
        flags[slot(which)] = cpu;
        let any = flags.iter().any(|&f| f);
        self.app.state::<AppState>().update_status(|s| s.cpu_fallback = any);
    }

    /// Đặt cờ "đang nạp" của `which` rồi tính lại chỉ báo chung: bên nào nạp lần đầu thì báo `FirstRun`.
    fn set_loading(&self, which: Which, loading: Option<Loading>) {
        let mut flags = self.loading.lock().unwrap();
        flags[slot(which)] = loading;
        let shown = if flags.contains(&Some(Loading::FirstRun)) {
            Some(Loading::FirstRun)
        } else {
            flags.iter().flatten().next().copied()
        };
        self.app.state::<AppState>().update_status(|s| s.loading = shown);
    }
}

fn slot(which: Which) -> usize {
    match which {
        Which::Asr => 0,
        Which::Llama => 1,
    }
}

impl<R: Runtime> StatusEvents<R> {
    fn hash_of(&self, exe: &Path) -> Option<&str> {
        self.hashes.iter().find(|(p, _)| p == exe).map(|(_, h)| h.as_str())
    }
}

impl<R: Runtime> SidecarEvents for StatusEvents<R> {
    fn on_event(&self, event: &SidecarEvent) {
        let state = self.app.state::<AppState>();
        match event {
            SidecarEvent::Starting { which, first_run } => self.set_loading(
                *which,
                Some(if *first_run { Loading::FirstRun } else { Loading::Model }),
            ),
            SidecarEvent::Ready { which, first_run, .. } => {
                let exe = self.last_exe.lock().unwrap()[slot(*which)].clone();
                if *first_run
                    && let Some(hash) = exe.as_deref().and_then(|e| self.hash_of(e))
                    && let Err(e) = first_run::mark_seen(&self.seen_file, hash)
                {
                    log::warn!("không ghi được {}: {e}", self.seen_file.display());
                }
                self.set_loading(*which, None);
                // Chỉ báo CPU theo từng tiến trình phụ: tiến trình này chạy lại bằng GPU (bấm thử lại sau khi bỏ cuộc, Q4-2 của
                // review 02 lần 4) chỉ tắt cờ của chính nó (Q5-1 của review 02 lần 5).
                if let SidecarEvent::Ready { use_gpu, .. } = event {
                    self.set_cpu(*which, !*use_gpu);
                }
            }
            SidecarEvent::CpuFallback { which } => self.set_cpu(*which, true),
            SidecarEvent::OutOfMemory { .. } => state.update_status(|s| s.suggest_lite = true),
            SidecarEvent::GaveUp { which, cause, .. } => {
                if *which == Which::Asr {
                    *self.asr_gave_up.lock().unwrap() = Some(*cause);
                }
                self.set_loading(*which, None);
            }
            SidecarEvent::Restarting { .. } | SidecarEvent::Stopped { .. } => return,
        }
        changed(&self.app);
    }

    fn before_spawn(&self, which: Which, exe: &Path) -> Result<(), String> {
        self.last_exe.lock().unwrap()[slot(which)] = Some(exe.to_path_buf());
        let verified = integrity::verify(&self.dir, &[exe], integrity::SIDECAR_HASHES).map_err(|e| e.to_string())?;
        if !verified.locks.is_empty() {
            *self.locks.lock().unwrap() = verified.locks;
        }
        Ok(())
    }

    fn is_first_run(&self, _which: Which, exe: &Path) -> bool {
        self.hash_of(exe)
            .is_some_and(|h| first_run::is_first_run(&self.seen_file, h))
    }
}

struct Live {
    manager: Arc<SidecarManager>,
    tier: Option<ModelTier>,
    vad_model: PathBuf,
}

/// Phần bên ngoài thật: tiến trình phụ (`pipeline::supervisor`), nguồn âm thanh (`capture`), Silero VAD.
pub struct LiveDeps<R: Runtime> {
    app: AppHandle<R>,
    live: Mutex<Option<Live>>,
    asr_gave_up: Arc<Mutex<Option<GiveUpCause>>>,
}

impl<R: Runtime> LiveDeps<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self {
            app,
            live: Mutex::new(None),
            asr_gave_up: Arc::default(),
        }
    }

    /// Giám sát hiện tại. Khóa `live` chỉ giữ trong lúc clone, không bao giờ trong lúc chờ tiến trình phụ.
    fn current(&self) -> Option<Arc<SidecarManager>> {
        self.live.lock().unwrap().as_ref().map(|l| l.manager.clone())
    }

    fn manager(&self) -> Arc<SidecarManager> {
        self.current().expect("prepare() chạy trước")
    }
}

impl<R: Runtime> SessionDeps for LiveDeps<R> {
    fn prepare(&self, settings: &Settings) -> Result<(), CommandError> {
        let running = {
            let live = self.live.lock().unwrap();
            live.as_ref()
                .filter(|l| l.tier == settings.model_tier)
                .map(|l| l.manager.clone())
        };
        if let Some(manager) = running.filter(|m| m.running()) {
            manager.touch();
            return Ok(());
        }
        // Kiểm SHA-256 lúc chuẩn bị; giám sát còn kiểm lại trước mỗi lần chạy tiến trình phụ (`before_spawn`).
        let prepared = sidecar::prepare(&self.app, settings)?;
        let manager = {
            let mut live = self.live.lock().unwrap();
            // Đổi gói model thì dựng lại; tiến trình cũ tắt khi phiên cuối còn dùng nó kết thúc (`SidecarManager` bị hủy).
            if live.as_ref().is_none_or(|l| l.tier != prepared.tier) {
                *self.asr_gave_up.lock().unwrap() = None;
                let events = Arc::new(StatusEvents {
                    app: self.app.clone(),
                    dir: prepared.dir.clone(),
                    hashes: prepared.hashes.clone(),
                    seen_file: prepared.seen_file.clone(),
                    last_exe: Mutex::new([None, None]),
                    locks: Mutex::new(prepared.locks),
                    asr_gave_up: self.asr_gave_up.clone(),
                    on_cpu: Mutex::new([false, false]),
                    loading: Mutex::new([None, None]),
                });
                let manager = SidecarManager::new(prepared.spec, Arc::new(SystemClock::default()), events);
                *live = Some(Live {
                    manager,
                    tier: prepared.tier,
                    vad_model: prepared.vad_model,
                });
            }
            live.as_ref().expect("vừa dựng").manager.clone()
        };
        manager
            .ensure_started()
            .map_err(|e| CommandError::new(sidecar::give_up_code(e.cause), None, e.to_string()))
    }

    fn asr(&self) -> Box<dyn Asr> {
        Box::new(self.manager().asr())
    }

    fn mt(&self) -> Box<dyn Mt> {
        Box::new(self.manager().mt())
    }

    fn vad(&self) -> VadFactory {
        let path = self
            .live
            .lock()
            .unwrap()
            .as_ref()
            .map(|l| l.vad_model.clone())
            .unwrap_or_default();
        Box::new(move || Ok(Box::new(SileroVad::load(&path)?) as _))
    }

    fn capture(&self, source: &AudioSource, include_self: bool, on_event: OnEvent) -> Box<dyn FrameSource> {
        Box::new(LiveCapture::open(source.clone(), include_self, on_event))
    }

    fn allow_retry(&self) {
        // Lý do bỏ cuộc của lần trước không còn đúng: giám sát cũng quên nó (N-6 của review 02 lần 2, R3-1 của lần 3).
        *self.asr_gave_up.lock().unwrap() = None;
        if let Some(manager) = self.current() {
            manager.allow_retry();
        }
    }

    fn begin_session(&self) {
        self.manager().begin_session();
    }

    fn end_session(&self) {
        self.manager().end_session();
    }

    fn tick(&self) {
        if let Some(manager) = self.current()
            && manager.tick()
        {
            log::info!("tắt tiến trình phụ sau 10 phút không dịch");
        }
    }

    fn shutdown(&self) {
        pipeline::process::begin_shutdown();
        if let Some(manager) = self.current() {
            manager.shutdown();
        }
    }

    fn kill_all(&self) {
        pipeline::process::kill_all();
    }

    fn asr_failure_code(&self) -> &'static str {
        self.asr_gave_up
            .lock()
            .unwrap()
            .map_or(errors::SIDECAR_FAILED, sidecar::give_up_code)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::UiLanguage;

    /// Đếm số lần giám sát hỏi trước khi chạy một tiến trình phụ.
    #[derive(Default)]
    struct CountSpawns(Mutex<usize>);

    impl SidecarEvents for CountSpawns {
        fn on_event(&self, _: &SidecarEvent) {}
        fn before_spawn(&self, _: Which, _: &Path) -> Result<(), String> {
            *self.0.lock().unwrap() += 1;
            Ok(())
        }
    }

    /// Q4-1 của review 02 lần 4: `LiveDeps::allow_retry` cho đúng `SidecarManager` đang dùng thử lại. Tiến trình phụ trỏ
    /// tới một binary không có nên lỗi ngay; `max_failures` 0 nên bỏ cuộc ở lần lỗi đầu.
    #[test]
    fn allow_retry_reaches_the_live_manager() {
        use pipeline::config::{AsrConfig, MtConfig, SupervisorConfig};
        use pipeline::supervisor::{AsrSpec, FakeClock, LlamaSpec, SidecarSpec};
        let missing = PathBuf::from("/khong/co/asr-worker");
        let spec = SidecarSpec {
            asr: AsrSpec {
                exe_gpu: None,
                exe_cpu: missing.clone(),
                model: PathBuf::from("/khong/co/model.bin"),
                log: std::env::temp_dir().join(format!("mt-allow-retry-{}.log", std::process::id())),
                first_run: false,
                require_shared: false,
                env: Vec::new(),
            },
            llama: LlamaSpec {
                exe: missing,
                model: PathBuf::from("/khong/co/mt.gguf"),
                log: std::env::temp_dir().join(format!("mt-allow-retry-llama-{}.log", std::process::id())),
                extra_args: Vec::new(),
                first_run: false,
                env: Vec::new(),
            },
            supervisor: SupervisorConfig {
                max_failures: 0,
                ..SupervisorConfig::default()
            },
            asr_config: AsrConfig::default(),
            mt_config: MtConfig::default(),
        };
        let spawns = Arc::new(CountSpawns::default());
        let manager = SidecarManager::new(spec, Arc::new(FakeClock::default()), spawns.clone());
        let app = tauri::test::mock_app();
        let deps = LiveDeps::new(app.handle().clone());
        *deps.live.lock().unwrap() = Some(Live {
            manager: manager.clone(),
            tier: None,
            vad_model: PathBuf::new(),
        });
        assert_eq!(manager.ensure_started().unwrap_err().cause, GiveUpCause::Failures);
        assert_eq!(manager.ensure_started().unwrap_err().cause, GiveUpCause::Failures);
        assert_eq!(*spawns.0.lock().unwrap(), 1, "đã bỏ cuộc thì không chạy lại");
        deps.allow_retry();
        assert!(manager.ensure_started().is_err());
        assert_eq!(*spawns.0.lock().unwrap(), 2, "bấm Bắt đầu thì thử lại");
    }

    /// Q4-2 của review 02 lần 4: `asr-worker` chạy lại được bằng GPU thì bỏ chỉ báo "Đang chạy bằng CPU".
    #[test]
    fn a_gpu_ready_clears_the_cpu_fallback_note() {
        let app = crate::test_support::mock_app();
        let events = status_events(&app);
        let state = app.state::<AppState>();
        events.on_event(&SidecarEvent::CpuFallback { which: Which::Asr });
        assert!(state.status().cpu_fallback);
        let ready = |which, use_gpu| SidecarEvent::Ready {
            which,
            use_gpu,
            backend: None,
            first_run: false,
        };
        events.on_event(&ready(Which::Asr, false));
        events.on_event(&ready(Which::Llama, true));
        assert!(state.status().cpu_fallback, "vẫn chạy bằng CPU");
        events.on_event(&ready(Which::Asr, true));
        assert!(!state.status().cpu_fallback);
        // Q5-1 của review 02 lần 5, kịch bản 1: `llama-server` tự sang CPU, rồi `asr-worker` chạy lại bằng GPU: chỉ báo
        // còn, vì `llama-server` vẫn chạy bằng CPU.
        events.on_event(&SidecarEvent::CpuFallback { which: Which::Llama });
        events.on_event(&ready(Which::Llama, false));
        events.on_event(&ready(Which::Asr, true));
        events.on_event(&ready(Which::Llama, false));
        assert!(state.status().cpu_fallback, "llama-server vẫn chạy -ngl 0");
        // Kịch bản 2: `llama-server` về GPU ở lần chạy kế tiếp thì chỉ báo tắt.
        events.on_event(&ready(Which::Llama, true));
        assert!(!state.status().cpu_fallback);
        // Máy không có GPU dùng được: `Ready` bằng CPU ngay lần đầu cũng bật chỉ báo.
        events.on_event(&ready(Which::Asr, false));
        assert!(state.status().cpu_fallback);
    }

    /// `StatusEvents` không kiểm binary, dùng trong test sự kiện của tiến trình phụ.
    fn status_events(app: &tauri::App<tauri::test::MockRuntime>) -> StatusEvents<tauri::test::MockRuntime> {
        StatusEvents {
            app: app.handle().clone(),
            dir: PathBuf::new(),
            hashes: Vec::new(),
            seen_file: PathBuf::new(),
            last_exe: Mutex::new([None, None]),
            locks: Mutex::new(Vec::new()),
            asr_gave_up: Arc::default(),
            on_cpu: Mutex::new([false, false]),
            loading: Mutex::new([None, None]),
        }
    }

    fn starting(which: Which, first_run: bool) -> SidecarEvent {
        SidecarEvent::Starting { which, first_run }
    }

    fn ready(which: Which) -> SidecarEvent {
        SidecarEvent::Ready {
            which,
            use_gpu: true,
            backend: None,
            first_run: false,
        }
    }

    /// Q1 của review cuối 02, kịch bản 1: `asr-worker` khởi động lại giữa phiên (`transcribe` → `start_asr`) thì "Đang nạp
    /// model…" tắt khi nó `Ready`, không chờ `llama-server`.
    #[test]
    fn an_asr_restart_mid_session_clears_the_loading_note_when_ready() {
        let app = crate::test_support::mock_app();
        let events = status_events(&app);
        let state = app.state::<AppState>();
        for event in [
            starting(Which::Asr, false),
            ready(Which::Asr),
            starting(Which::Llama, false),
            ready(Which::Llama),
        ] {
            events.on_event(&event);
        }
        assert_eq!(state.status().loading, None, "khởi động bình thường");
        events.on_event(&starting(Which::Asr, false));
        assert_eq!(state.status().loading, Some(Loading::Model));
        events.on_event(&ready(Which::Asr));
        assert_eq!(state.status().loading, None, "asr-worker đã chạy lại xong");
        // Hai bên cùng nạp: một bên xong thì chỉ báo còn, tới khi bên kia xong. Bên nào nạp lần đầu thì giữ `FirstRun`.
        events.on_event(&starting(Which::Asr, false));
        events.on_event(&starting(Which::Llama, true));
        assert_eq!(state.status().loading, Some(Loading::FirstRun));
        events.on_event(&ready(Which::Llama));
        assert_eq!(state.status().loading, Some(Loading::Model), "asr-worker vẫn đang nạp");
        events.on_event(&ready(Which::Asr));
        assert_eq!(state.status().loading, None);
    }

    /// Q1 của review cuối 02, kịch bản 2: `llama-server` chết giữa phiên và khởi động lại không được thì không còn báo "Đang
    /// nạp model…" cùng lúc với "Dịch không khả dụng".
    #[test]
    fn a_llama_give_up_mid_session_clears_the_loading_note() {
        let app = crate::test_support::mock_app();
        let events = status_events(&app);
        let state = app.state::<AppState>();
        events.on_event(&starting(Which::Llama, false));
        assert_eq!(state.status().loading, Some(Loading::Model));
        events.on_event(&SidecarEvent::GaveUp {
            which: Which::Llama,
            cause: GiveUpCause::Failures,
            reason: "quá 3 lần lỗi".into(),
        });
        assert_eq!(state.status().loading, None);
        // Bỏ cuộc của một bên không tắt chỉ báo của bên kia đang nạp.
        events.on_event(&starting(Which::Asr, false));
        events.on_event(&starting(Which::Llama, false));
        events.on_event(&SidecarEvent::GaveUp {
            which: Which::Llama,
            cause: GiveUpCause::Failures,
            reason: "quá 3 lần lỗi".into(),
        });
        assert_eq!(state.status().loading, Some(Loading::Model), "asr-worker vẫn đang nạp");
        events.on_event(&ready(Which::Asr));
        assert_eq!(state.status().loading, None);
    }

    /// N-6 của review 02 lần 2: bấm Bắt đầu thì quên lý do bỏ cuộc cũ, mã lỗi giữa phiên về mặc định.
    #[test]
    fn a_new_start_forgets_why_the_worker_gave_up() {
        let app = tauri::test::mock_app();
        let deps = LiveDeps::new(app.handle().clone());
        *deps.asr_gave_up.lock().unwrap() = Some(GiveUpCause::Tampered);
        assert_eq!(deps.asr_failure_code(), errors::SIDECAR_TAMPERED);
        deps.allow_retry();
        assert_eq!(deps.asr_failure_code(), errors::SIDECAR_FAILED);
    }

    #[test]
    fn the_engine_follows_the_language_and_pause_settings() {
        let mut settings = Settings::defaults(UiLanguage::Vi);
        settings.vad_end_silence_ms = 500;
        let cfg = engine_config(&settings, 3_000_000, SharedGlossary::default());
        assert_eq!(cfg.languages, ["en", "zh", "ja", "ko", "vi"]);
        assert_eq!(cfg.target, MtLang::Vi);
        assert_eq!(cfg.pipeline.segmenter.end_silence_ms, 500);
        assert!(!cfg.translation_context);
        assert_eq!(cfg.id_base, 3_000_000);
        settings.source_lock = Some(Lang::Ja);
        settings.target_language = Lang::En;
        settings.experimental.translation_context = true;
        let cfg = engine_config(&settings, 0, SharedGlossary::default());
        assert_eq!(cfg.languages, ["ja"], "khóa ngôn ngữ nguồn thì bỏ nhận diện (§6.4)");
        assert_eq!(cfg.target, MtLang::En);
        assert!(cfg.translation_context);
    }

    #[test]
    fn every_fatal_reason_has_an_error_code() {
        let codes: Vec<&str> = [
            Fatal::Vad,
            Fatal::Audio,
            Fatal::Asr,
            Fatal::Internal,
            Fatal::QuotaExhausted,
        ]
        .into_iter()
        .map(|k| fatal_code(k, errors::SIDECAR_TAMPERED))
        .collect();
        assert_eq!(
            codes,
            [
                errors::VAD_FAILED,
                errors::CAPTURE_FAILED,
                errors::SIDECAR_TAMPERED,
                errors::UNKNOWN,
                errors::QUOTA_EXHAUSTED
            ]
        );
    }
}
