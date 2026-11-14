//! Dịch vụ tạo ghi chú (spec 2026-11-11-ghi-chu-cuoc-hop-design §3, §4, §8): **một việc tại một thời điểm**, chạy trên luồng
//! riêng `notes-job`, có tiến độ và hủy. Kết quả của phiên trong Lịch sử vào bảng `notes`; của phiên chưa lưu thì chỉ nằm
//! trong bộ nhớ.
//!
//! Mỗi lần `start` là một việc mới, có số việc tăng dần và cờ hủy riêng. Mọi thay đổi do luồng việc làm (tiến độ, kết quả, lỗi,
//! sự kiện) chỉ được làm khi việc đó vẫn là việc hiện tại và chưa bị hủy, nên một việc đã hủy mà xong muộn không bao giờ đè
//! trạng thái hay ghi chú của việc sau. Khóa của dịch vụ không bao giờ giữ trong lúc gọi engine hay phát sự kiện.
//!
//! Sự kiện `notes://changed` chỉ có mục tiêu, trạng thái, tiến độ và mã lỗi; log chỉ có số, nguồn và mã lỗi. Chữ chép lời,
//! prompt và chữ ghi chú không vào đó.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use super::chunk::{self, PromptLine};
use super::cloud::CloudNotes;
use super::engine::{Interrupt, NotesEngine, NotesError};
use super::job::{self, Outcome};
use super::keys;
use super::local::{LocalNotes, LocalSpec};
use super::quota::{self, FREE_NOTES};
use super::schema::{self, Notes};
use super::store::{self, Stored};
use crate::data::{self, TranscriptRef};
use crate::errors::{self, CommandError};
use crate::license::manager::TrialStatus;
use crate::models::service::{ModelService, NotesPackState, NotesReady};
use crate::settings::{NotesProvider, NotesTemplate, Settings, UiLanguage};
use crate::state::{AppState, SessionStatus};
use crate::transcript::history::HistoryError;
use crate::{db, events, pro};

/// Những gì quyết định có được bắt đầu tạo ghi chú không (xem [`decide`]).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Facts {
    /// Đang có việc tạo ghi chú chạy.
    pub busy: bool,
    /// Mục tiêu là phiên hiện tại (hay vừa dừng), không phải phiên trong Lịch sử.
    pub is_current: bool,
    pub session: SessionStatus,
    /// Số câu có chữ của bản chép lời.
    pub usable_lines: usize,
    pub pro: bool,
    pub trial: TrialStatus,
    /// Số lần Free đã dùng (`quota::used`).
    pub free_used: u32,
    pub provider: NotesProvider,
    pub consent: bool,
    pub has_key: bool,
    /// Trạng thái gói ghi chú trên máy (chỉ xét khi `provider` là `Local`).
    pub local: NotesPackState,
    /// Có phiên dịch đang `Starting`/`Running`, bất kể mục tiêu của ghi chú (model trên máy không chạy chung với phiên dịch).
    pub session_active: bool,
}

/// Được bắt đầu không, theo đúng thứ tự: bận → phiên hiện tại đang `Starting`/`Running` (không tóm tắt nửa phiên) → không
/// có câu → hạn mức (`quota::check`) → nguồn `Local` (gói không dùng được trên máy này → chưa tải → có phiên dịch đang chạy;
/// không cần đồng ý gửi ra ngoài hay key) → chưa đồng ý gửi Cloud → thiếu key. `Err` là mã lỗi.
pub fn decide(f: &Facts) -> Result<(), &'static str> {
    if f.busy {
        return Err(errors::NOTES_BUSY);
    }
    if f.is_current && matches!(f.session, SessionStatus::Starting | SessionStatus::Running) {
        return Err(errors::NOTES_SESSION_RUNNING);
    }
    if f.usable_lines == 0 {
        return Err(errors::NOTES_EMPTY);
    }
    quota::check(f.pro, f.trial, f.free_used)?;
    if f.provider == NotesProvider::Local {
        return match f.local {
            NotesPackState::Unavailable | NotesPackState::RamTooLow => Err(errors::NOTES_LOCAL_UNAVAILABLE),
            NotesPackState::Missing | NotesPackState::Downloading => Err(errors::NOTES_LOCAL_PACK_MISSING),
            NotesPackState::Installed if f.session_active => Err(errors::NOTES_LOCAL_SESSION_ACTIVE),
            NotesPackState::Installed => Ok(()),
        };
    }
    if !f.consent {
        return Err(errors::NOTES_CONSENT_REQUIRED);
    }
    if !f.has_key {
        return Err(errors::NOTES_KEY_MISSING);
    }
    Ok(())
}

/// Engine cần dựng cho một việc.
#[derive(Clone, Debug)]
pub enum EngineSpec {
    /// Nhà cung cấp cloud: nguồn, tên model, API key (nếu có).
    Cloud {
        provider: NotesProvider,
        model: String,
        key: Option<String>,
    },
    /// `llama-server` riêng của ghi chú trên máy.
    Local(LocalSpec),
}

/// Dựng engine cho một việc. Cờ hủy bật khi người dùng hủy hay phiên dịch bắt đầu: engine `Local` đang nạp model phải dừng
/// ngay. Test thay bằng engine giả.
pub type EngineFactory = Arc<dyn Fn(EngineSpec, &AtomicBool) -> Result<Box<dyn NotesEngine>, NotesError> + Send + Sync>;

/// Engine thật: `CloudNotes` với key của người dùng (không có key thì `KeyMissing`), hay `LocalNotes::start`.
pub fn live_factory() -> EngineFactory {
    Arc::new(
        |spec: EngineSpec, cancel: &AtomicBool| -> Result<Box<dyn NotesEngine>, NotesError> {
            match spec {
                EngineSpec::Cloud { provider, model, key } => {
                    let key = key.ok_or(NotesError::KeyMissing)?;
                    Ok(Box::new(CloudNotes::new(provider, &model, key)?))
                }
                EngineSpec::Local(spec) => Ok(Box::new(LocalNotes::start(&spec, cancel)?)),
            }
        },
    )
}

/// Trạng thái việc tạo ghi chú của một mục tiêu.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Idle,
    Running,
    /// Việc gần nhất của mục tiêu này lỗi; mã lỗi giữ tới lần `start` kế tiếp.
    Failed,
}

/// Nội dung của sự kiện `notes://changed`. Không có chữ ghi chú.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesChanged {
    pub target: TranscriptRef,
    pub status: JobStatus,
    /// `(xong, tổng)` của `job::run`.
    pub progress: Option<(usize, usize)>,
    /// Mã lỗi khi `status` là `failed`.
    pub error: Option<String>,
}

impl NotesChanged {
    pub(crate) fn idle(target: TranscriptRef) -> Self {
        Self {
            target,
            status: JobStatus::Idle,
            progress: None,
            error: None,
        }
    }
}

/// Ghi chú của một mục tiêu cho giao diện.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesView {
    pub target: TranscriptRef,
    pub status: JobStatus,
    pub progress: Option<(usize, usize)>,
    pub error: Option<String>,
    pub notes: Option<Stored>,
    /// Ghi chú đọc từ DB (phiên trong Lịch sử); `false` khi chỉ nằm trong bộ nhớ hay chưa có.
    pub persisted: bool,
    /// Số lần Free còn lại; `None` khi là Pro.
    pub free_left: Option<u32>,
}

/// Việc đang chạy.
struct Job {
    id: u64,
    target: TranscriptRef,
    cancel: Arc<AtomicBool>,
    progress: Option<(usize, usize)>,
    /// Việc dùng model trên máy: bị tạm dừng khi một phiên dịch bắt đầu (`NotesService::pause_for_session`).
    local: bool,
    /// Cách dừng ngay engine, đặt khi engine đã dựng xong.
    interrupt: Option<Interrupt>,
    /// Bật khi luồng việc đã bỏ engine (tiến trình của nó đã dừng).
    done: Arc<AtomicBool>,
}

enum Phase {
    Idle,
    Running(Job),
    Failed { target: TranscriptRef, code: String },
}

/// Ghi chú của phiên chưa lưu Lịch sử, kèm số `session` của bản chép lời nó thuộc về.
struct Memory {
    session: u64,
    stored: Stored,
}

struct Inner {
    next_id: u64,
    phase: Phase,
    memory: Option<Memory>,
    /// Tăng mỗi lần `forget` ("Xóa toàn bộ dữ liệu"): việc nào chép bản chép lời trước lần đó thì không được đăng ký.
    epoch: u64,
}

impl Inner {
    /// Việc `id` vẫn là việc hiện tại và chưa bị hủy.
    fn is_live(&self, id: u64) -> bool {
        matches!(&self.phase, Phase::Running(j) if j.id == id && !j.cancel.load(Ordering::SeqCst))
    }

    fn changed(&self, target: TranscriptRef) -> NotesChanged {
        match &self.phase {
            Phase::Running(j) if j.target == target => NotesChanged {
                target,
                status: JobStatus::Running,
                progress: j.progress,
                error: None,
            },
            Phase::Failed { target: t, code } if *t == target => NotesChanged {
                target,
                status: JobStatus::Failed,
                progress: None,
                error: Some(code.clone()),
            },
            _ => NotesChanged::idle(target),
        }
    }

    /// Bỏ việc đang chạy (bật cờ hủy, về `idle`). Trả mục tiêu của việc đã bỏ.
    fn stop(&mut self) -> Option<TranscriptRef> {
        match std::mem::replace(&mut self.phase, Phase::Idle) {
            Phase::Running(j) => {
                j.cancel.store(true, Ordering::SeqCst);
                Some(j.target)
            }
            other => {
                self.phase = other;
                None
            }
        }
    }
}

fn lock(inner: &Mutex<Inner>) -> MutexGuard<'_, Inner> {
    inner.lock().unwrap_or_else(PoisonError::into_inner)
}

fn refuse(code: &str) -> CommandError {
    CommandError::new(code, None, "không tạo được ghi chú")
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

fn settings_of<R: Runtime>(app: &AppHandle<R>) -> Settings {
    app.try_state::<AppState>()
        .map(|s| s.settings())
        .unwrap_or_else(|| Settings::defaults(UiLanguage::Vi))
}

/// Số lần Free đã dùng; không mở được kho khóa thì coi như đã hết (từ chối khi không chắc).
fn free_used<R: Runtime>(app: &AppHandle<R>) -> u32 {
    keys::with_keystore(app, quota::used).unwrap_or(FREE_NOTES)
}

/// Cách dựng engine, chạy trên luồng việc (dựng engine `Local` mất cả phút để nạp model): nhận cờ hủy của việc.
type Build = Box<dyn FnOnce(&AtomicBool) -> Result<Box<dyn NotesEngine>, NotesError> + Send>;

/// Bật `done` khi bị bỏ, sau mọi thứ khai báo sau nó trong cùng khối (nên sau khi engine đã bị bỏ).
struct DoneOnDrop(Arc<AtomicBool>);

impl Drop for DoneOnDrop {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

/// Chờ tối đa chừng này cho engine `Local` dừng hẳn khi phiên dịch bắt đầu (móc "trước phiên" được phép chờ).
const PAUSE_WAIT: std::time::Duration = std::time::Duration::from_secs(10);

/// Những gì luồng việc cần, chép lúc bắt đầu: luồng không đọc lại bản chép lời đang sống.
struct Work {
    id: u64,
    target: TranscriptRef,
    lines: Vec<PromptLine>,
    session: u64,
    started_at: u64,
    lang: String,
    provider: NotesProvider,
    model: String,
    template: NotesTemplate,
}

/// Việc test chen vào `start` ngay sau khi chép bản chép lời.
#[cfg(test)]
pub type SnapshotHook = Box<dyn FnOnce(&NotesService) + Send>;

/// Dịch vụ ghi chú, quản lý bằng `app.manage` (`notes::install`).
pub struct NotesService {
    factory: EngineFactory,
    inner: Arc<Mutex<Inner>>,
    #[cfg(test)]
    trial: Mutex<Option<TrialStatus>>,
    /// Test chen việc vào giữa lúc chép bản chép lời và lúc đăng ký việc.
    #[cfg(test)]
    after_snapshot: Mutex<Option<SnapshotHook>>,
    /// Test đặt gói ghi chú trên máy (app giả không có manifest): trạng thái và gói sẵn sàng.
    #[cfg(test)]
    local: Mutex<Option<(NotesPackState, Option<NotesReady>)>>,
    /// Số lần việc `Local` bỏ gói vì file sai SHA-256.
    #[cfg(test)]
    discarded: Arc<std::sync::atomic::AtomicUsize>,
}

impl NotesService {
    pub fn new(factory: EngineFactory) -> Self {
        Self {
            factory,
            inner: Arc::new(Mutex::new(Inner {
                next_id: 0,
                phase: Phase::Idle,
                memory: None,
                epoch: 0,
            })),
            #[cfg(test)]
            trial: Mutex::new(None),
            #[cfg(test)]
            after_snapshot: Mutex::new(None),
            #[cfg(test)]
            local: Mutex::new(None),
            #[cfg(test)]
            discarded: Arc::default(),
        }
    }

    /// Test đặt gói ghi chú trên máy.
    #[cfg(test)]
    pub fn set_local(&self, state: NotesPackState, ready: Option<NotesReady>) {
        *self.local.lock().unwrap_or_else(PoisonError::into_inner) = Some((state, ready));
    }

    /// Số lần việc `Local` đã bỏ gói hỏng.
    #[cfg(test)]
    pub fn discarded(&self) -> usize {
        self.discarded.load(Ordering::SeqCst)
    }

    /// Trạng thái gói ghi chú trên máy và, khi đã tải xong, gói để chạy.
    fn local_pack<R: Runtime>(&self, app: &AppHandle<R>) -> (NotesPackState, Option<NotesReady>) {
        #[cfg(test)]
        if let Some(forced) = self.local.lock().unwrap_or_else(PoisonError::into_inner).clone() {
            return forced;
        }
        match app.try_state::<Arc<ModelService>>() {
            Some(models) => (models.notes_pack().state, models.notes_ready()),
            None => (NotesPackState::Unavailable, None),
        }
    }

    /// Test đặt tình trạng dùng thử (app giả không có bản quyền thật).
    #[cfg(test)]
    pub fn set_after_snapshot(&self, hook: SnapshotHook) {
        *self.after_snapshot.lock().unwrap_or_else(PoisonError::into_inner) = Some(hook);
    }

    /// Có ghi chú nào trong bộ nhớ không (kể cả của phiên khác phiên hiện tại).
    #[cfg(test)]
    pub fn has_memory(&self) -> bool {
        lock(&self.inner).memory.is_some()
    }

    #[cfg(test)]
    pub fn set_trial(&self, trial: Option<TrialStatus>) {
        *self.trial.lock().unwrap_or_else(PoisonError::into_inner) = trial;
    }

    fn trial<R: Runtime>(&self, app: &AppHandle<R>) -> TrialStatus {
        #[cfg(test)]
        if let Some(trial) = *self.trial.lock().unwrap_or_else(PoisonError::into_inner) {
            return trial;
        }
        crate::license::app::view(app).map_or(TrialStatus::None, |v| v.trial.status)
    }

    /// Ghi chú và trạng thái việc của `target`. Phiên trong Lịch sử cần Pro.
    pub fn view<R: Runtime>(&self, app: &AppHandle<R>, target: TranscriptRef) -> Result<NotesView, CommandError> {
        let pro = pro::is_pro(app);
        let (changed, memory) = {
            let inner = lock(&self.inner);
            let memory = inner.memory.as_ref().map(|m| (m.session, m.stored.clone()));
            (inner.changed(target), memory)
        };
        let (notes, persisted) = match target {
            TranscriptRef::Current => {
                let t = data::current(app);
                match memory {
                    Some((session, stored)) if session == t.session => (Some(stored), false),
                    // Không đọc DB khi không có câu nào (chưa có phiên, hay vừa "Xóa toàn bộ dữ liệu": đọc DB sẽ tạo lại file).
                    _ if pro && !t.lines.is_empty() => {
                        let saved = db::with(app, |c| match store::session_for(c, t.started_at)? {
                            Some(id) => store::get(c, id),
                            None => Ok(None),
                        });
                        match saved {
                            Ok(notes) => {
                                let persisted = notes.is_some();
                                (notes, persisted)
                            }
                            Err(e) => {
                                log::warn!("không đọc được ghi chú đã lưu của phiên vừa dừng: {}", e.code);
                                (None, false)
                            }
                        }
                    }
                    _ => (None, false),
                }
            }
            TranscriptRef::History { id } => {
                pro::require(app)?;
                let notes = db::with(app, |c| store::get(c, id))?;
                let persisted = notes.is_some();
                (notes, persisted)
            }
        };
        Ok(NotesView {
            target,
            status: changed.status,
            progress: changed.progress,
            error: changed.error,
            notes,
            persisted,
            free_left: (!pro).then(|| FREE_NOTES.saturating_sub(free_used(app))),
        })
    }

    /// Bắt đầu tạo ghi chú cho `target` (`template` không truyền thì lấy `notes_template` của cài đặt). `force_local` dùng model
    /// trên máy cho lần này, bất kể nguồn dịch đang chọn.
    pub fn start<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        target: TranscriptRef,
        template: Option<NotesTemplate>,
        force_local: bool,
    ) -> Result<NotesView, CommandError> {
        let epoch = {
            let inner = lock(&self.inner);
            if matches!(inner.phase, Phase::Running(_)) {
                return Err(refuse(errors::NOTES_BUSY));
            }
            inner.epoch
        };
        // Phiên Lịch sử tự đòi Pro.
        let t = data::load(app, target)?;
        #[cfg(test)]
        {
            let hook = self
                .after_snapshot
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .take();
            if let Some(hook) = hook {
                hook(self);
            }
        }
        // Đọc trạng thái phiên sau khi đã chép bản chép lời: còn `idle` thì bản đã chép không phải nửa phiên đang chạy.
        let session = app
            .try_state::<AppState>()
            .map_or(SessionStatus::Idle, |s| s.status().session);
        let settings = settings_of(app);
        let pro = pro::is_pro(app);
        let provider = if force_local {
            NotesProvider::Local
        } else {
            NotesProvider::from_translation(settings.translation_provider)
        };
        let local = provider == NotesProvider::Local;
        let key = if local { None } else { keys::api_key(app, provider) };
        let (pack, ready) = if local {
            self.local_pack(app)
        } else {
            (NotesPackState::Unavailable, None)
        };
        let lines = chunk::lines_of(&t);
        let facts = Facts {
            busy: false,
            is_current: target == TranscriptRef::Current,
            session,
            usable_lines: lines.len(),
            pro,
            trial: self.trial(app),
            free_used: if pro { 0 } else { free_used(app) },
            provider,
            consent: settings.notes_cloud_consent,
            has_key: key.is_some(),
            local: pack,
            session_active: matches!(session, SessionStatus::Starting | SessionStatus::Running),
        };
        decide(&facts).map_err(refuse)?;
        let template = template.unwrap_or(settings.notes_template);
        // Cloud dựng ngay (lỗi từ chối ngay lúc bấm); Local dựng trên luồng việc vì nạp model mất cả phút và phải hủy được.
        let (model, build): (String, Build) = if local {
            let Some(ready) = ready else {
                return Err(refuse(errors::NOTES_LOCAL_PACK_MISSING));
            };
            let (factory, handle) = (self.factory.clone(), app.clone());
            #[cfg(test)]
            let discarded = self.discarded.clone();
            let model = ready.id.clone();
            let build: Build = Box::new(move |cancel: &AtomicBool| {
                let spec = local_spec(&handle, &ready)?;
                match factory(EngineSpec::Local(spec), cancel) {
                    Err(NotesError::ModelCorrupt) => {
                        discard_pack(&handle);
                        #[cfg(test)]
                        discarded.fetch_add(1, Ordering::SeqCst);
                        Err(NotesError::ModelCorrupt)
                    }
                    other => other,
                }
            });
            (model, build)
        } else {
            let model = match provider {
                NotesProvider::Openai => settings.openai_model.clone(),
                NotesProvider::Gemini => settings.gemini_model.clone(),
                NotesProvider::Deepseek => settings.deepseek_model.clone(),
                NotesProvider::Local => String::new(),
            };
            let spec = EngineSpec::Cloud {
                provider,
                model: model.clone(),
                key,
            };
            let engine = (self.factory)(spec, &AtomicBool::new(false)).map_err(|e| refuse(e.code()))?;
            (model, Box::new(move |_: &AtomicBool| Ok(engine)))
        };

        let cancel = Arc::new(AtomicBool::new(false));
        let done = Arc::new(AtomicBool::new(false));
        let (id, changed) = {
            let mut inner = lock(&self.inner);
            if matches!(inner.phase, Phase::Running(_)) {
                return Err(refuse(errors::NOTES_BUSY));
            }
            if inner.epoch != epoch {
                // Dữ liệu vừa bị xóa sau khi chép bản chép lời: bản đã chép không còn được dùng.
                log::info!("dữ liệu vừa bị xóa: không bắt đầu việc tạo ghi chú");
                return Err(refuse(errors::NOTES_EMPTY));
            }
            inner.next_id = inner.next_id.wrapping_add(1);
            let id = inner.next_id;
            inner.phase = Phase::Running(Job {
                id,
                target,
                cancel: cancel.clone(),
                progress: None,
                local,
                interrupt: None,
                done: done.clone(),
            });
            (id, inner.changed(target))
        };
        events::notes_changed(app, &changed);
        let work = Work {
            id,
            target,
            lines,
            session: t.session,
            started_at: t.started_at,
            lang: t.target_lang,
            provider,
            model,
            template,
        };
        let inner = self.inner.clone();
        let handle = app.clone();
        let spawned = std::thread::Builder::new()
            .name("notes-job".into())
            .spawn(move || run_job(&handle, &inner, build, &cancel, work, done));
        if spawned.is_err() {
            log::error!("không mở được luồng tạo ghi chú");
            if let Some(changed) = fail(&self.inner, id, errors::NOTES_ENGINE_FAILED) {
                events::notes_changed(app, &changed);
            }
            return Err(refuse(errors::NOTES_ENGINE_FAILED));
        }
        self.view(app, target)
    }

    /// Hủy việc đang chạy: về `idle` ngay, kết quả đến sau bị bỏ.
    pub fn cancel<R: Runtime>(&self, app: &AppHandle<R>) {
        let stopped = lock(&self.inner).stop();
        if let Some(target) = stopped {
            log::info!("đã hủy việc tạo ghi chú");
            events::notes_changed(app, &NotesChanged::idle(target));
        }
    }

    /// Một phiên dịch sắp bắt đầu (móc "trước phiên" của `ModelService`): phiên dịch luôn thắng, nên việc đang dùng model trên
    /// máy dừng ngay (kill `llama-server`) và kết thúc `failed` với `notesPausedForSession`; không lưu ghi chú, không tính lượt
    /// Free. Chờ tới khi tiến trình đó đã dừng (tối đa [`PAUSE_WAIT`]) để phiên không tranh GPU/RAM với nó. Việc Cloud không bị
    /// dừng. Không có việc nào hay việc không phải `Local` thì không làm gì.
    pub fn pause_for_session<R: Runtime>(&self, app: &AppHandle<R>) {
        let paused = {
            let mut inner = lock(&self.inner);
            let Phase::Running(job) = &inner.phase else {
                return;
            };
            if !job.local {
                return;
            }
            let (target, interrupt, done) = (job.target, job.interrupt.clone(), job.done.clone());
            job.cancel.store(true, Ordering::SeqCst);
            inner.phase = Phase::Failed {
                target,
                code: errors::NOTES_PAUSED_FOR_SESSION.to_string(),
            };
            (inner.changed(target), interrupt, done)
        };
        let (changed, interrupt, done) = paused;
        log::info!("tạm dừng việc tạo ghi chú trên máy vì phiên dịch bắt đầu");
        if let Some(interrupt) = interrupt {
            interrupt();
        }
        events::notes_changed(app, &changed);
        let since = Instant::now();
        while !done.load(Ordering::SeqCst) && since.elapsed() < PAUSE_WAIT {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }

    /// Lưu ghi chú người dùng sửa tay (dữ liệu từ giao diện: kiểm và làm sạch bằng `schema::validate_edit`, không lưu thô).
    pub fn save_edit<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        target: TranscriptRef,
        notes: Notes,
    ) -> Result<NotesView, CommandError> {
        {
            // Giữ khóa suốt lần sửa: không có việc nào bắt đầu hay xong xen giữa.
            let mut inner = lock(&self.inner);
            if matches!(inner.phase, Phase::Running(_)) {
                return Err(refuse(errors::NOTES_BUSY));
            }
            let t = data::load(app, target)?;
            let notes = schema::validate_edit(notes, t.lines.len())?;
            match target {
                TranscriptRef::Current => match inner.memory.as_mut() {
                    Some(m) if m.session == t.session => {
                        m.stored.body = notes;
                        m.stored.edited = true;
                    }
                    _ => {
                        let id = if pro::is_pro(app) && !t.lines.is_empty() {
                            db::with(app, |c| store::session_for(c, t.started_at))?
                        } else {
                            None
                        };
                        let Some(id) = id else {
                            return Err(refuse(errors::NOTES_EMPTY));
                        };
                        edit_saved(app, id, notes)?;
                    }
                },
                TranscriptRef::History { id } => edit_saved(app, id, notes)?,
            }
        }
        self.view(app, target)
    }

    /// Bỏ hết: hủy việc đang chạy, xóa trạng thái lỗi và ghi chú trong bộ nhớ ("Xóa toàn bộ dữ liệu").
    pub fn forget(&self) {
        let mut inner = lock(&self.inner);
        inner.stop();
        inner.phase = Phase::Idle;
        inner.memory = None;
        inner.epoch = inner.epoch.wrapping_add(1);
    }
}

/// Sửa ghi chú đã lưu của phiên `id`: giữ nguồn, model, ngôn ngữ, mẫu và giờ tạo.
fn edit_saved<R: Runtime>(app: &AppHandle<R>, id: i64, notes: Notes) -> Result<(), CommandError> {
    let Some(mut stored) = db::with(app, |c| store::get(c, id))? else {
        return Err(refuse(errors::NOTES_EMPTY));
    };
    stored.body = notes;
    stored.edited = true;
    if db::with(app, |c| store::put(c, id, &stored))? {
        Ok(())
    } else {
        Err(HistoryError::NotFound(id).into())
    }
}

/// Việc `id` lỗi với `code` (chỉ khi nó vẫn là việc hiện tại). Trả sự kiện cần phát.
fn fail(inner: &Mutex<Inner>, id: u64, code: &str) -> Option<NotesChanged> {
    let mut inner = lock(inner);
    if !inner.is_live(id) {
        return None;
    }
    let Phase::Running(job) = &inner.phase else {
        return None;
    };
    let target = job.target;
    inner.phase = Phase::Failed {
        target,
        code: code.to_string(),
    };
    Some(inner.changed(target))
}

/// File gói ghi chú băm ra sai SHA-256: bỏ gói (người dùng tải lại) và báo giao diện.
fn discard_pack<R: Runtime>(app: &AppHandle<R>) {
    if let Some(models) = app.try_state::<Arc<ModelService>>() {
        models.discard_notes_pack();
    }
    crate::models::service::changed(app);
}

/// Cách chạy `llama-server` cho gói ghi chú đã tải (kiểm binary, GPU, log): `sidecar::notes_local`.
#[cfg(not(test))]
fn local_spec<R: Runtime>(app: &AppHandle<R>, ready: &NotesReady) -> Result<LocalSpec, NotesError> {
    crate::sidecar::notes_local::spec(app, ready)
}

/// Test không có `llama-server` thật đã kiểm: engine giả nhận spec trỏ vào gói của test.
#[cfg(test)]
fn local_spec<R: Runtime>(_app: &AppHandle<R>, ready: &NotesReady) -> Result<LocalSpec, NotesError> {
    Ok(LocalSpec {
        exe: std::path::PathBuf::from("llama-server-test"),
        model: ready.path.clone(),
        model_sha256: ready.sha256.clone(),
        ctx: ready.ctx,
        ..LocalSpec::default()
    })
}

/// Thân của luồng `notes-job`.
fn run_job<R: Runtime>(
    app: &AppHandle<R>,
    inner: &Mutex<Inner>,
    build: Build,
    cancel: &AtomicBool,
    work: Work,
    done: Arc<AtomicBool>,
) {
    // Khai báo trước `engine`: bị bỏ sau engine, nên `done` chỉ bật khi engine (và tiến trình của nó) đã dừng.
    let _done = DoneOnDrop(done);
    let began = Instant::now();
    let engine = match build(cancel) {
        Ok(engine) => engine,
        Err(e) => {
            log::warn!(
                "không dựng được engine ghi chú: {} (nguồn {:?})",
                e.code(),
                work.provider
            );
            if let Some(changed) = fail(inner, work.id, e.code()) {
                events::notes_changed(app, &changed);
            }
            return;
        }
    };
    if let Some(interrupt) = engine.interrupter() {
        let mut guard = lock(inner);
        if let Phase::Running(job) = &mut guard.phase
            && job.id == work.id
        {
            job.interrupt = Some(interrupt);
        }
    }
    let mut progress = |done: usize, total: usize| {
        let changed = {
            let mut guard = lock(inner);
            match &mut guard.phase {
                Phase::Running(j) if j.id == work.id && !j.cancel.load(Ordering::SeqCst) => {
                    j.progress = Some((done, total));
                    let target = j.target;
                    Some(guard.changed(target))
                }
                _ => None,
            }
        };
        if let Some(changed) = changed {
            events::notes_changed(app, &changed);
        }
    };
    // Engine hỏng (panic) không được để dịch vụ kẹt ở `running`; nội dung panic không vào log hay sự kiện. Chỉ có tác dụng khi panic
    // unwind (dev, test): bản phát hành build `panic = "abort"`, panic làm app thoát ngay nên không còn dịch vụ nào để kẹt.
    let result = catch_unwind(AssertUnwindSafe(|| {
        job::run(
            &work.lines,
            &work.lang,
            work.template,
            engine.as_ref(),
            cancel,
            &mut progress,
        )
    }));
    let ms = began.elapsed().as_millis();
    let changed = match result {
        Err(_) => {
            log::error!("tạo ghi chú dừng bất thường (nguồn {:?}, {ms} ms)", work.provider);
            fail(inner, work.id, errors::NOTES_ENGINE_FAILED)
        }
        Ok(Err(e)) => {
            log::warn!("tạo ghi chú lỗi: {} (nguồn {:?}, {ms} ms)", e.code(), work.provider);
            fail(inner, work.id, e.code())
        }
        Ok(Ok(outcome)) => complete(app, inner, &work, outcome, ms),
    };
    if let Some(changed) = changed {
        events::notes_changed(app, &changed);
    }
}

/// Giữ ghi chú của phiên chưa lưu trong bộ nhớ, chỉ khi phiên đó vẫn là phiên hiện tại (`false`: một phiên mới đã bắt đầu,
/// ghi chú không còn chỗ hiện nên bỏ).
fn keep_in_memory<R: Runtime>(app: &AppHandle<R>, inner: &mut Inner, work: &Work, stored: Stored) -> bool {
    if data::current(app).session != work.session {
        return false;
    }
    inner.memory = Some(Memory {
        session: work.session,
        stored,
    });
    true
}

/// Việc xong: lưu kết quả (nếu việc vẫn là việc hiện tại) và tính một lần Free. Trả sự kiện cần phát.
fn complete<R: Runtime>(
    app: &AppHandle<R>,
    inner: &Mutex<Inner>,
    work: &Work,
    outcome: Outcome,
    ms: u128,
) -> Option<NotesChanged> {
    let pro = pro::is_pro(app);
    let stored = Stored {
        created_at: now_ms(),
        source: work.provider,
        model: work.model.clone(),
        lang: work.lang.clone(),
        template: work.template,
        body: outcome.notes,
        edited: false,
    };
    // Giữ khóa từ lúc kiểm "còn là việc hiện tại" tới lúc ghi xong: `cancel`/`forget` không xen giữa được, nên đã hủy thì
    // không có gì được ghi.
    let mut guard = lock(inner);
    if !guard.is_live(work.id) {
        log::info!("bỏ kết quả của việc tạo ghi chú đã hủy");
        return None;
    }
    let saved_id = match work.target {
        TranscriptRef::History { id } => Ok(Some(id)),
        TranscriptRef::Current if pro => db::with(app, |c| store::session_for(c, work.started_at)),
        TranscriptRef::Current => Ok(None),
    };
    let written = match saved_id {
        Ok(Some(id)) => db::with(app, |c| store::put(c, id, &stored)).inspect(|&kept| {
            if kept && guard.memory.as_ref().is_some_and(|m| m.session == work.session) {
                // Bản trong bộ nhớ của cùng phiên đã cũ: bản trong DB thay nó.
                guard.memory = None;
            }
        }),
        Ok(None) => Ok(keep_in_memory(app, &mut guard, work, stored)),
        Err(e) if work.target == TranscriptRef::Current => {
            // Không đọc được Lịch sử: giữ trong bộ nhớ như phiên chưa lưu, không mất kết quả.
            log::warn!("không tìm được phiên vừa dừng trong lịch sử: {}", e.code);
            Ok(keep_in_memory(app, &mut guard, work, stored))
        }
        Err(e) => Err(e),
    };
    let target = work.target;
    match written {
        Ok(true) => {
            if !pro {
                match keys::with_keystore(app, quota::bump) {
                    Some(Ok(_)) => {}
                    Some(Err(_)) | None => log::warn!("không tính được lần dùng ghi chú của Free"),
                }
            }
            log::info!(
                "đã tạo ghi chú: {} đoạn, {} đoạn hỏng, gộp cơ học {}, {ms} ms, nguồn {:?}",
                outcome.chunks,
                outcome.failed_chunks,
                outcome.reduce_fallback,
                work.provider
            );
            guard.phase = Phase::Idle;
        }
        Ok(false) => {
            // Phiên không còn (đã bị xóa, hay phiên mới đã thay phiên chưa lưu): bỏ kết quả, không báo lỗi, không tính lượt.
            log::info!("phiên không còn sau khi tạo ghi chú: bỏ kết quả");
            guard.phase = Phase::Idle;
        }
        Err(e) => {
            log::warn!("không lưu được ghi chú: {}", e.code);
            guard.phase = Phase::Failed { target, code: e.code };
        }
    }
    Some(guard.changed(target))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::atomic::AtomicBool;
    use std::sync::mpsc::{self, Receiver, Sender};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    use pipeline::subtitle::{Status, Subtitle};
    use tauri::test::MockRuntime;
    use tauri::{Listener, Manager};

    use super::*;
    use crate::cloud_mt::GEMINI_KEY_ENTRY;
    use crate::data::TranscriptRef;
    use crate::errors;
    use crate::events;
    use crate::license::manager::TrialStatus;
    use crate::models::service::{ModelService, NotesPackState, NotesReady};
    use crate::notes::engine::{Interrupt, Limits, NotesEngine, NotesError, NotesRequest};
    use crate::notes::schema::{Item, MAX_SUMMARY_CHARS, Notes};
    use crate::notes::{quota, store};
    use crate::security::keystore::Keystore;
    use crate::settings::NotesProvider;
    use crate::state::{AppState, SessionStatus};
    use crate::test_support::{mock_app, set_pro};
    use crate::transcript::history;
    use crate::transcript::store::TranscriptStore;

    fn ok() -> Facts {
        Facts {
            busy: false,
            is_current: true,
            session: SessionStatus::Idle,
            usable_lines: 5,
            pro: true,
            trial: TrialStatus::Ended,
            free_used: 0,
            provider: NotesProvider::Gemini,
            consent: true,
            has_key: true,
            local: NotesPackState::Installed,
            session_active: false,
        }
    }

    #[test]
    fn decide_checks_in_order() {
        assert_eq!(decide(&ok()), Ok(()));
        let all_wrong = Facts {
            busy: true,
            session: SessionStatus::Running,
            usable_lines: 0,
            pro: false,
            provider: NotesProvider::Local,
            consent: false,
            has_key: false,
            ..ok()
        };
        assert_eq!(decide(&all_wrong), Err(errors::NOTES_BUSY));
        assert_eq!(
            decide(&Facts {
                busy: false,
                ..all_wrong
            }),
            Err(errors::NOTES_SESSION_RUNNING)
        );
        assert_eq!(
            decide(&Facts {
                session: SessionStatus::Starting,
                ..ok()
            }),
            Err(errors::NOTES_SESSION_RUNNING)
        );
        assert_eq!(
            decide(&Facts {
                session: SessionStatus::Running,
                is_current: false,
                ..ok()
            }),
            Ok(())
        ); // phiên trong Lịch sử
        assert_eq!(
            decide(&Facts {
                usable_lines: 0,
                ..ok()
            }),
            Err(errors::NOTES_EMPTY)
        );
        assert_eq!(decide(&Facts { pro: false, ..ok() }), Err(errors::PRO_REQUIRED));
        assert_eq!(
            decide(&Facts {
                pro: false,
                trial: TrialStatus::Active,
                free_used: 3,
                ..ok()
            }),
            Err(errors::NOTES_FREE_USED_UP)
        );
        // Model trên máy đã tải: không cần đồng ý gửi ra ngoài hay API key.
        assert_eq!(
            decide(&Facts {
                provider: NotesProvider::Local,
                consent: false,
                has_key: false,
                ..ok()
            }),
            Ok(())
        );
        assert_eq!(
            decide(&Facts { consent: false, ..ok() }),
            Err(errors::NOTES_CONSENT_REQUIRED)
        );
        assert_eq!(
            decide(&Facts { has_key: false, ..ok() }),
            Err(errors::NOTES_KEY_MISSING)
        );
    }

    /// Nguồn `Local`: gói không dùng được → chưa tải → có phiên dịch đang chạy → được; các luật đứng trước giữ thứ tự.
    #[test]
    fn decide_local_rules() {
        use NotesPackState as P;
        let local = |state, session_active| Facts {
            provider: NotesProvider::Local,
            consent: false,
            has_key: false,
            local: state,
            session_active,
            ..ok()
        };
        let table = [
            (P::Unavailable, false, Err(errors::NOTES_LOCAL_UNAVAILABLE)),
            (P::Unavailable, true, Err(errors::NOTES_LOCAL_UNAVAILABLE)),
            (P::RamTooLow, false, Err(errors::NOTES_LOCAL_UNAVAILABLE)),
            (P::RamTooLow, true, Err(errors::NOTES_LOCAL_UNAVAILABLE)),
            (P::Missing, false, Err(errors::NOTES_LOCAL_PACK_MISSING)),
            (P::Missing, true, Err(errors::NOTES_LOCAL_PACK_MISSING)),
            (P::Downloading, false, Err(errors::NOTES_LOCAL_PACK_MISSING)),
            (P::Downloading, true, Err(errors::NOTES_LOCAL_PACK_MISSING)),
            (P::Installed, false, Ok(())),
            (P::Installed, true, Err(errors::NOTES_LOCAL_SESSION_ACTIVE)),
        ];
        for (state, active, want) in table {
            assert_eq!(
                decide(&local(state, active)),
                want,
                "{state:?}, phiên đang chạy: {active}"
            );
        }
        let installed = local(P::Installed, true);
        let running = Facts {
            session: SessionStatus::Running,
            ..installed
        };
        // Phiên hiện tại còn chạy thì vẫn là `notesSessionRunning` (luật cũ, đứng trước); phiên trong Lịch sử thì model trên máy
        // không chạy chung với phiên dịch.
        assert_eq!(decide(&running), Err(errors::NOTES_SESSION_RUNNING));
        assert_eq!(
            decide(&Facts {
                is_current: false,
                ..running
            }),
            Err(errors::NOTES_LOCAL_SESSION_ACTIVE)
        );
        assert_eq!(
            decide(&Facts {
                busy: true,
                ..installed
            }),
            Err(errors::NOTES_BUSY)
        );
        assert_eq!(
            decide(&Facts {
                usable_lines: 0,
                ..installed
            }),
            Err(errors::NOTES_EMPTY)
        );
        assert_eq!(
            decide(&Facts {
                pro: false,
                ..installed
            }),
            Err(errors::PRO_REQUIRED)
        );
    }

    // ---- Dịch vụ, với engine giả có cổng chặn ----

    /// Câu trả lời của một engine giả.
    enum Reply {
        Text(String),
        Fail(NotesError),
        Panic,
    }

    /// Kịch bản của một lần dựng engine: câu trả lời, và cổng (nếu có) mà `generate` chờ trước khi trả.
    struct Script {
        reply: Reply,
        gate: Option<Receiver<()>>,
        /// Đầu gửi của cổng: `interrupter` của engine giả mở cổng (như kill `llama-server` làm request đang chặn thoát).
        release: Option<Sender<()>>,
    }

    struct Fake {
        reply: Reply,
        gate: Option<Mutex<Receiver<()>>>,
        release: Option<Sender<()>>,
        killed: Arc<AtomicBool>,
        seen: Arc<Mutex<Vec<NotesRequest>>>,
    }

    impl NotesEngine for Fake {
        fn limits(&self) -> Limits {
            Limits {
                budget: 100_000,
                max_map: 800,
                max_reduce: 1500,
            }
        }
        fn count_tokens(&self, text: &str) -> usize {
            text.split_whitespace().count()
        }
        fn interrupter(&self) -> Option<Interrupt> {
            let (killed, release) = (self.killed.clone(), self.release.clone());
            Some(Arc::new(move || {
                killed.store(true, Ordering::SeqCst);
                if let Some(release) = &release {
                    let _ = release.send(());
                }
            }))
        }
        fn generate(&self, req: &NotesRequest, _cancel: &AtomicBool) -> Result<String, NotesError> {
            self.seen.lock().unwrap().push(req.clone());
            if let Some(gate) = &self.gate {
                // Không treo test mãi: quá 10 giây thì coi như cổng đã mở.
                let _ = gate.lock().unwrap().recv_timeout(Duration::from_secs(10));
            }
            match &self.reply {
                Reply::Text(s) => Ok(s.clone()),
                Reply::Fail(e) => Err(e.clone()),
                Reply::Panic => panic!("engine giả hỏng"),
            }
        }
    }

    /// Nơi test xếp kịch bản cho các lần dựng engine kế tiếp, và xem các yêu cầu engine đã nhận.
    #[derive(Clone, Default)]
    struct Engines {
        scripts: Arc<Mutex<VecDeque<Script>>>,
        seen: Arc<Mutex<Vec<NotesRequest>>>,
        /// Mỗi lần dựng engine: `local` hay `cloud:<nguồn>:<model>`.
        specs: Arc<Mutex<Vec<String>>>,
        /// Lỗi cho lần dựng engine kế tiếp (thay vì dựng).
        build_error: Arc<Mutex<Option<NotesError>>>,
        /// `interrupter` của một engine giả đã được gọi.
        killed: Arc<AtomicBool>,
    }

    impl Engines {
        fn factory(&self) -> EngineFactory {
            let me = self.clone();
            Arc::new(move |spec: EngineSpec, _cancel: &AtomicBool| {
                let name = match &spec {
                    EngineSpec::Cloud { provider, model, .. } => format!("cloud:{provider:?}:{model}"),
                    EngineSpec::Local(_) => "local".to_string(),
                };
                me.specs.lock().unwrap().push(name);
                if let Some(e) = me.build_error.lock().unwrap().take() {
                    return Err(e);
                }
                let script = me.scripts.lock().unwrap().pop_front().unwrap_or(Script {
                    reply: Reply::Text(json("s1")),
                    gate: None,
                    release: None,
                });
                Ok(Box::new(Fake {
                    reply: script.reply,
                    gate: script.gate.map(Mutex::new),
                    release: script.release,
                    killed: me.killed.clone(),
                    seen: me.seen.clone(),
                }) as Box<dyn NotesEngine>)
            })
        }
        fn fail_build(&self, error: NotesError) {
            *self.build_error.lock().unwrap() = Some(error);
        }
        /// Xếp một kịch bản có cổng; trả đầu gửi để mở cổng.
        fn gated(&self, reply: Reply) -> Sender<()> {
            let (tx, rx) = mpsc::channel();
            self.scripts.lock().unwrap().push_back(Script {
                reply,
                gate: Some(rx),
                release: Some(tx.clone()),
            });
            tx
        }
        fn push(&self, reply: Reply) {
            self.scripts.lock().unwrap().push_back(Script {
                reply,
                gate: None,
                release: None,
            });
        }
        fn requests(&self) -> usize {
            self.seen.lock().unwrap().len()
        }
    }

    fn json(summary: &str) -> String {
        format!(r#"{{"summary":"{summary}","decisions":[],"action_items":[],"open_questions":[]}}"#)
    }

    fn line(id: u64, text: &str) -> Subtitle {
        Subtitle {
            id,
            start_ms: 0,
            end_ms: 900,
            src_lang: "en".into(),
            src_text: text.into(),
            tgt_text: format!("{text} (vi)"),
            status: Status::Done,
            provisional: false,
            replaces: Vec::new(),
            speaker: None,
        }
    }

    /// G2: nguồn ghi chú chính là nguồn dịch đang chọn, không có cài đặt riêng.
    #[test]
    fn the_notes_source_follows_the_translation_provider() {
        use crate::settings::TranslationProvider as T;
        for (t, n) in [
            (T::Local, NotesProvider::Local),
            (T::Openai, NotesProvider::Openai),
            (T::Gemini, NotesProvider::Gemini),
            (T::Deepseek, NotesProvider::Deepseek),
        ] {
            assert_eq!(NotesProvider::from_translation(t), n);
        }
    }

    const STARTED_AT: u64 = 1_790_000_000_000;

    /// App giả: Pro (theo `pro`), nguồn Gemini đã đồng ý, có key Gemini, và một phiên ba câu vừa dừng. Mã test nạp câu vào
    /// `TranscriptStore`, module không ghi.
    fn setup(pro: bool) -> (tauri::App<MockRuntime>, Engines) {
        let app = mock_app();
        set_pro(&app, pro);
        let state = app.state::<AppState>();
        let mut s = state.settings();
        s.translation_provider = crate::settings::TranslationProvider::Gemini;
        s.notes_cloud_consent = true;
        state.replace_settings(&mut s);
        app.state::<Arc<Keystore>>()
            .set(GEMINI_KEY_ENTRY, b"AIza-test")
            .unwrap();
        let t = app.state::<TranscriptStore>();
        t.begin(1, STARTED_AT, "vi");
        for (i, text) in ["Hello.", "We ship Friday.", "Lan writes the notes."]
            .iter()
            .enumerate()
        {
            t.upsert(1, &line(1_000_001 + i as u64, text));
        }
        t.end(1, STARTED_AT + 60_000).unwrap();
        (app, Engines::default())
    }

    fn service(engines: &Engines) -> NotesService {
        NotesService::new(engines.factory())
    }

    fn save_to_history(app: &tauri::App<MockRuntime>) -> i64 {
        let t = app.state::<TranscriptStore>().snapshot();
        crate::db::with(app.handle(), |c| history::save(c, &t))
            .unwrap()
            .unwrap()
    }

    fn wait_until(what: &str, ok: impl Fn() -> bool) {
        let started = Instant::now();
        while !ok() {
            assert!(started.elapsed() < Duration::from_secs(10), "chờ quá lâu: {what}");
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    fn summary(view: &NotesView) -> Option<String> {
        view.notes.as_ref().map(|n| n.body.summary.clone())
    }

    fn record(app: &tauri::App<MockRuntime>) -> Arc<Mutex<Vec<String>>> {
        let got = Arc::new(Mutex::new(Vec::new()));
        let sink = got.clone();
        app.listen_any(events::NOTES_CHANGED, move |e| {
            sink.lock().unwrap().push(e.payload().to_string())
        });
        got
    }

    const CUR: TranscriptRef = TranscriptRef::Current;

    #[test]
    fn generate_stores_in_memory_for_an_unsaved_session() {
        let (app, engines) = setup(true);
        let events = record(&app);
        let svc = service(&engines);
        let gate = engines.gated(Reply::Text(json("s1")));
        let v = svc.start(app.handle(), CUR, None, false).unwrap();
        assert_eq!(v.status, JobStatus::Running);
        gate.send(()).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        let v = svc.view(app.handle(), CUR).unwrap();
        let n = v.notes.clone().unwrap();
        assert_eq!(
            (
                n.body.summary.as_str(),
                v.persisted,
                n.source,
                n.model.as_str(),
                v.status
            ),
            (
                "s1",
                false,
                NotesProvider::Gemini,
                "gemini-3.1-flash-lite",
                JobStatus::Idle
            )
        );
        assert_eq!((n.lang.as_str(), n.edited, v.free_left), ("vi", false, None));
        wait_until("đủ sự kiện", || events.lock().unwrap().len() >= 2);
        let events = events.lock().unwrap().clone();
        assert!(
            events.iter().all(|e| !e.contains("s1") && !e.contains("summary")),
            "{events:?}"
        );
        assert!(events.iter().any(|e| e.contains(r#""status":"running""#)), "{events:?}");
        assert!(events.iter().any(|e| e.contains(r#""status":"idle""#)), "{events:?}");
        // Không có gì vào DB: phiên chưa lưu Lịch sử.
        let ids = crate::db::with(app.handle(), |c| store::sessions_with_notes(c)).unwrap();
        assert!(ids.is_empty());
    }

    #[test]
    fn generate_persists_when_the_session_is_in_history() {
        let (app, engines) = setup(true);
        let id = save_to_history(&app);
        let svc = service(&engines);
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        let v = svc.view(app.handle(), CUR).unwrap();
        assert!(v.persisted);
        let saved = crate::db::with(app.handle(), |c| store::get(c, id)).unwrap();
        assert_eq!(saved, v.notes);
        let h = svc.view(app.handle(), TranscriptRef::History { id }).unwrap();
        assert_eq!((h.notes.clone(), h.persisted), (v.notes.clone(), true));
        // Sửa bản đã lưu: refs ngoài phạm vi bị lọc, `edited`, giữ nguồn và giờ tạo.
        let mut body = h.notes.clone().unwrap().body;
        body.decisions = vec![Item {
            text: "d".into(),
            refs: vec![2, 0, 7],
        }];
        let e = svc
            .save_edit(app.handle(), TranscriptRef::History { id }, body)
            .unwrap();
        let saved = crate::db::with(app.handle(), |c| store::get(c, id)).unwrap().unwrap();
        assert_eq!(e.notes.as_ref(), Some(&saved));
        assert_eq!((saved.body.decisions[0].refs.clone(), saved.edited), (vec![2], true));
        assert_eq!(
            (saved.created_at, saved.source),
            (v.notes.as_ref().unwrap().created_at, NotesProvider::Gemini)
        );
    }

    #[test]
    fn second_start_is_busy_and_cancel_discards() {
        let (app, engines) = setup(true);
        let svc = service(&engines);
        let gate = engines.gated(Reply::Text(json("s1")));
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("engine đang chạy", || engines.requests() == 1);
        let err = svc.start(app.handle(), CUR, None, false).unwrap_err();
        assert_eq!(err.code, errors::NOTES_BUSY);
        svc.cancel(app.handle());
        assert_eq!(svc.view(app.handle(), CUR).unwrap().status, JobStatus::Idle);
        gate.send(()).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!((v.notes, v.status), (None, JobStatus::Idle));
    }

    #[test]
    fn deleting_the_session_mid_job_drops_the_result() {
        let (app, engines) = setup(true);
        let id = save_to_history(&app);
        let svc = service(&engines);
        let target = TranscriptRef::History { id };
        let gate = engines.gated(Reply::Text(json("s1")));
        assert_eq!(
            svc.start(app.handle(), target, None, false).unwrap().status,
            JobStatus::Running
        );
        crate::db::with(app.handle(), |c| history::delete(c, id)).unwrap();
        gate.send(()).unwrap();
        wait_until("hết chạy", || {
            svc.view(app.handle(), target).unwrap().status == JobStatus::Idle
        });
        let v = svc.view(app.handle(), target).unwrap();
        assert_eq!((v.notes, v.error, v.persisted), (None, None, false));
        let ids = crate::db::with(app.handle(), |c| store::sessions_with_notes(c)).unwrap();
        assert!(ids.is_empty());
        assert_eq!(svc.view(app.handle(), CUR).unwrap().notes, None);
    }

    #[test]
    fn engine_error_becomes_failed_with_code() {
        let (app, engines) = setup(true);
        let svc = service(&engines);
        engines.push(Reply::Fail(NotesError::RateLimited));
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("lỗi", || {
            svc.view(app.handle(), CUR).unwrap().status == JobStatus::Failed
        });
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!((v.error.as_deref(), v.notes), (Some("notesRateLimited"), None));
    }

    #[test]
    fn free_counts_only_on_success() {
        let (app, engines) = setup(false);
        let svc = service(&engines);
        svc.set_trial(Some(TrialStatus::Active));
        let used = || crate::notes::keys::with_keystore(app.handle(), quota::used).unwrap();
        engines.push(Reply::Fail(NotesError::Offline));
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("lỗi", || {
            svc.view(app.handle(), CUR).unwrap().status == JobStatus::Failed
        });
        assert_eq!(used(), 0);
        assert_eq!(svc.view(app.handle(), CUR).unwrap().free_left, Some(3));
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        assert_eq!(used(), 1);
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!((v.free_left, v.persisted, v.status), (Some(2), false, JobStatus::Idle));
        // Hết dùng thử: cần Pro.
        svc.set_trial(Some(TrialStatus::Ended));
        let err = svc.start(app.handle(), CUR, None, false).unwrap_err();
        assert_eq!(err.code, errors::PRO_REQUIRED);
    }

    #[test]
    fn save_edit_validates_and_marks_edited() {
        let (app, engines) = setup(true);
        let svc = service(&engines);
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        let edit = Notes {
            summary: "sửa tay".into(),
            decisions: vec![Item {
                text: "d".into(),
                refs: vec![1, 99, 3, 1],
            }],
            ..Notes::default()
        };
        let v = svc.save_edit(app.handle(), CUR, edit).unwrap();
        let n = v.notes.clone().unwrap();
        assert_eq!(
            (
                n.body.summary.as_str(),
                n.body.decisions[0].refs.clone(),
                n.edited,
                v.persisted
            ),
            ("sửa tay", vec![1, 3], true, false)
        );
        assert_eq!(n.source, NotesProvider::Gemini);
        let long = Notes {
            summary: "x".repeat(MAX_SUMMARY_CHARS + 1),
            ..Notes::default()
        };
        let err = svc.save_edit(app.handle(), CUR, long).unwrap_err();
        assert_eq!(err.code, "outOfRange");
        assert_eq!(svc.view(app.handle(), CUR).unwrap().notes, Some(n));
        let gate = engines.gated(Reply::Text(json("s2")));
        svc.start(app.handle(), CUR, None, false).unwrap();
        let err = svc.save_edit(app.handle(), CUR, Notes::default()).unwrap_err();
        assert_eq!(err.code, errors::NOTES_BUSY);
        gate.send(()).unwrap();
    }

    fn status(app: &tauri::App<MockRuntime>, session: SessionStatus) {
        let mut s = app.state::<AppState>().status();
        s.session = session;
        events::status_changed(app.handle(), &s);
    }

    fn set_auto(app: &tauri::App<MockRuntime>, on: bool) {
        let state = app.state::<AppState>();
        let mut s = state.settings();
        s.notes_auto = on;
        state.replace_settings(&mut s);
    }

    #[test]
    fn auto_starts_when_a_session_stops() {
        let (app, engines) = setup(true);
        crate::notes::install_with(app.handle(), engines.factory());
        let svc = app.state::<NotesService>();
        set_auto(&app, true);
        status(&app, SessionStatus::Running);
        status(&app, SessionStatus::Idle);
        wait_until("engine nhận yêu cầu", || engines.requests() == 1);
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        // Tắt tự tạo: không có yêu cầu nào.
        set_auto(&app, false);
        status(&app, SessionStatus::Running);
        status(&app, SessionStatus::Idle);
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(engines.requests(), 1);
        // Phiên dừng vì lỗi: không tự tạo.
        set_auto(&app, true);
        status(&app, SessionStatus::Running);
        status(&app, SessionStatus::Error);
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(engines.requests(), 1);
        // Idle lặp lại (sau Error) không phải lúc phiên vừa dừng.
        status(&app, SessionStatus::Idle);
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(engines.requests(), 1);
    }

    #[test]
    fn forget_cancels_and_clears() {
        let (app, engines) = setup(true);
        crate::notes::install_with(app.handle(), engines.factory());
        let svc = app.state::<NotesService>();
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        let gate = engines.gated(Reply::Text(json("s2")));
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("engine đang chạy", || engines.requests() == 2);
        crate::notes::forget(app.handle());
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!((v.status, v.notes), (JobStatus::Idle, None));
        gate.send(()).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!((v.status, v.notes), (JobStatus::Idle, None));
    }

    /// Gói ghi chú trên máy đã tải xong, cho test.
    fn ready() -> NotesReady {
        NotesReady {
            id: "notes-qwen35-4b".into(),
            path: std::path::PathBuf::from("notes-test.gguf"),
            sha256: "ab".repeat(32),
            ctx: 16_384,
        }
    }

    /// Dịch vụ có gói ghi chú trên máy đã tải xong.
    fn local_service(engines: &Engines) -> NotesService {
        let svc = service(engines);
        svc.set_local(NotesPackState::Installed, Some(ready()));
        svc
    }

    /// `force_local` đổi nguồn của lần này sang model trên máy dù nguồn dịch là Gemini; ghi chú lưu nguồn `Local` và `id` của
    /// gói; không ép thì vẫn dùng engine cloud.
    #[test]
    fn force_local_uses_the_local_engine_even_with_a_cloud_provider() {
        let (app, engines) = setup(true);
        let svc = local_service(&engines);
        svc.start(app.handle(), CUR, None, true).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        assert_eq!(*engines.specs.lock().unwrap(), ["local"]);
        let stored = svc.view(app.handle(), CUR).unwrap().notes.unwrap();
        assert_eq!(
            (stored.source, stored.model.as_str()),
            (NotesProvider::Local, "notes-qwen35-4b")
        );
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("xong lần cloud", || {
            engines.specs.lock().unwrap().len() == 2 && svc.view(app.handle(), CUR).unwrap().status == JobStatus::Idle
        });
        let specs = engines.specs.lock().unwrap().clone();
        assert!(specs[1].starts_with("cloud:Gemini:"), "{specs:?}");
    }

    /// Chọn model trên máy mà chưa dùng được thì bị từ chối ngay, trước khi dựng engine.
    #[test]
    fn a_local_start_is_refused_before_any_engine_when_it_cannot_run() {
        let (app, engines) = setup(true);
        let svc = service(&engines);
        let refused = |svc: &NotesService, target| svc.start(app.handle(), target, None, true).unwrap_err().code;
        // Không có manifest (app giả): gói không có.
        assert_eq!(refused(&svc, CUR), errors::NOTES_LOCAL_UNAVAILABLE);
        svc.set_local(NotesPackState::RamTooLow, None);
        assert_eq!(refused(&svc, CUR), errors::NOTES_LOCAL_UNAVAILABLE);
        for state in [NotesPackState::Missing, NotesPackState::Downloading] {
            svc.set_local(state, None);
            assert_eq!(refused(&svc, CUR), errors::NOTES_LOCAL_PACK_MISSING, "{state:?}");
        }
        // Đã tải, nhưng có phiên dịch đang chạy: ghi chú của phiên trong Lịch sử cũng phải chờ.
        svc.set_local(NotesPackState::Installed, Some(ready()));
        let id = save_to_history(&app);
        app.state::<AppState>()
            .update_status(|s| s.session = SessionStatus::Running);
        assert_eq!(
            refused(&svc, TranscriptRef::History { id }),
            errors::NOTES_LOCAL_SESSION_ACTIVE
        );
        assert_eq!(engines.specs.lock().unwrap().len(), 0, "chưa dựng engine nào");
    }

    /// Phiên dịch bắt đầu thì việc ghi chú trên máy dừng ngay: engine bị ngắt, việc kết thúc `failed` với
    /// `notesPausedForSession`, không có ghi chú nào được lưu và không tính lượt Free.
    #[test]
    fn a_session_start_pauses_a_running_local_job() {
        let (app, engines) = setup(false);
        let svc = local_service(&engines);
        svc.set_trial(Some(TrialStatus::Active));
        let events = record(&app);
        let _gate = engines.gated(Reply::Text(json("s1")));
        svc.start(app.handle(), CUR, None, true).unwrap();
        wait_until("engine nhận yêu cầu", || engines.requests() >= 1);
        svc.pause_for_session(app.handle());
        assert!(engines.killed.load(Ordering::SeqCst), "engine phải bị ngắt");
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!(
            (v.status, v.error.as_deref(), v.notes.is_none(), v.free_left),
            (JobStatus::Failed, Some(errors::NOTES_PAUSED_FOR_SESSION), true, Some(3))
        );
        // Engine trả kết quả muộn (cổng đã mở): bị bỏ, không đè trạng thái, không lưu, không tính lượt.
        std::thread::sleep(Duration::from_millis(150));
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!(
            (v.status, v.notes.is_none(), v.free_left),
            (JobStatus::Failed, true, Some(3))
        );
        assert!(!svc.has_memory());
        assert!(
            events
                .lock()
                .unwrap()
                .iter()
                .any(|e| e.contains("notesPausedForSession")),
            "giao diện phải được báo"
        );
        // Tạo lại được sau khi họp xong.
        svc.start(app.handle(), CUR, None, true).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
    }

    /// Móc "trước phiên" của `ModelService` do `notes::install` cài: `begin_session` dừng việc ghi chú trên máy rồi mới bắt đầu.
    #[test]
    fn the_models_before_session_hook_pauses_the_local_job() {
        let (app, engines) = setup(true);
        crate::notes::install_with(app.handle(), engines.factory());
        let svc = app.state::<NotesService>();
        svc.set_local(NotesPackState::Installed, Some(ready()));
        let _gate = engines.gated(Reply::Text(json("s1")));
        svc.start(app.handle(), CUR, None, true).unwrap();
        wait_until("engine nhận yêu cầu", || engines.requests() >= 1);
        let begun = app.state::<Arc<ModelService>>().begin_session(|| "begin").unwrap();
        assert_eq!(begun, "begin");
        assert!(engines.killed.load(Ordering::SeqCst));
        assert_eq!(
            svc.view(app.handle(), CUR).unwrap().error.as_deref(),
            Some(errors::NOTES_PAUSED_FOR_SESSION)
        );
    }

    /// Việc Cloud không bị phiên dịch dừng.
    #[test]
    fn a_session_start_leaves_a_cloud_job_running() {
        let (app, engines) = setup(true);
        let svc = service(&engines);
        let gate = engines.gated(Reply::Text(json("s1")));
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("engine nhận yêu cầu", || engines.requests() >= 1);
        svc.pause_for_session(app.handle());
        assert!(!engines.killed.load(Ordering::SeqCst));
        assert_eq!(svc.view(app.handle(), CUR).unwrap().status, JobStatus::Running);
        gate.send(()).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        // Không có việc nào: không làm gì.
        svc.pause_for_session(app.handle());
        assert_eq!(svc.view(app.handle(), CUR).unwrap().status, JobStatus::Idle);
    }

    /// File gói băm ra sai SHA-256: gói bị bỏ (người dùng tải lại) và việc kết thúc `notesLocalPackMissing`.
    #[test]
    fn a_wrong_sha256_discards_the_pack_and_reports_it_missing() {
        let (app, engines) = setup(true);
        let svc = local_service(&engines);
        engines.fail_build(NotesError::ModelCorrupt);
        svc.start(app.handle(), CUR, None, true).unwrap();
        wait_until("lỗi", || {
            svc.view(app.handle(), CUR).unwrap().status == JobStatus::Failed
        });
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!(
            (v.error.as_deref(), v.notes.is_none()),
            (Some(errors::NOTES_LOCAL_PACK_MISSING), true)
        );
        assert_eq!(svc.discarded(), 1);
        assert_eq!(engines.requests(), 0);
    }

    /// Dựng engine trên máy lỗi khác (binary không đúng bản...) thì là lỗi engine, không bỏ gói.
    #[test]
    fn another_local_build_error_keeps_the_pack() {
        let (app, engines) = setup(true);
        let svc = local_service(&engines);
        engines.fail_build(NotesError::Engine("llama-server không đúng bản".into()));
        svc.start(app.handle(), CUR, None, true).unwrap();
        wait_until("lỗi", || {
            svc.view(app.handle(), CUR).unwrap().status == JobStatus::Failed
        });
        assert_eq!(
            svc.view(app.handle(), CUR).unwrap().error.as_deref(),
            Some(errors::NOTES_ENGINE_FAILED)
        );
        assert_eq!(svc.discarded(), 0);
    }

    #[test]
    fn a_panicking_engine_ends_failed_and_the_service_recovers() {
        let (app, engines) = setup(true);
        let svc = service(&engines);
        engines.push(Reply::Panic);
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("lỗi", || {
            svc.view(app.handle(), CUR).unwrap().status == JobStatus::Failed
        });
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!(v.error.as_deref(), Some(errors::NOTES_ENGINE_FAILED));
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        assert_eq!(svc.view(app.handle(), CUR).unwrap().error, None);
    }

    #[test]
    fn a_cancelled_job_finishing_late_does_not_touch_the_next_one() {
        let (app, engines) = setup(true);
        let events = record(&app);
        let svc = service(&engines);
        let old = engines.gated(Reply::Text(json("old")));
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("engine cũ đang chạy", || engines.requests() == 1);
        svc.cancel(app.handle());
        let new = engines.gated(Reply::Text(json("new")));
        assert_eq!(
            svc.start(app.handle(), CUR, None, false).unwrap().status,
            JobStatus::Running
        );
        // Việc cũ xong trước, trong lúc việc mới còn chạy: không đổi gì.
        wait_until("engine mới đang chạy", || engines.requests() == 2);
        old.send(()).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!((v.status, v.notes), (JobStatus::Running, None));
        let before = events.lock().unwrap().len();
        new.send(()).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!((summary(&v).as_deref(), v.status), (Some("new"), JobStatus::Idle));
        wait_until("sự kiện của việc mới", || {
            events.lock().unwrap().len() > before
        });
        assert!(
            events
                .lock()
                .unwrap()
                .iter()
                .all(|e| !e.contains("old") && !e.contains("new"))
        );
    }

    #[test]
    fn current_session_still_running_is_refused_before_any_request() {
        let (app, engines) = setup(true);
        let svc = service(&engines);
        for session in [SessionStatus::Running, SessionStatus::Starting] {
            app.state::<AppState>().update_status(|s| s.session = session);
            let err = svc.start(app.handle(), CUR, None, false).unwrap_err();
            assert_eq!(err.code, errors::NOTES_SESSION_RUNNING);
            assert_eq!(svc.view(app.handle(), CUR).unwrap().status, JobStatus::Idle);
        }
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(engines.requests(), 0);
    }

    // ---- Fix round 1 ----

    #[test]
    fn forget_between_snapshot_and_registration_starts_nothing() {
        let (app, engines) = setup(true);
        let svc = service(&engines);
        svc.set_after_snapshot(Box::new(|s: &NotesService| s.forget()));
        let err = svc.start(app.handle(), CUR, None, false).unwrap_err();
        assert_eq!(err.code, errors::NOTES_EMPTY);
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(engines.requests(), 0);
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!((v.status, v.notes), (JobStatus::Idle, None));
        assert!(!svc.has_memory());
        // Lần sau (không bị xóa xen giữa) vẫn chạy bình thường.
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
    }

    #[test]
    fn a_result_for_a_replaced_current_session_is_dropped_without_counting() {
        let (app, engines) = setup(false);
        let svc = service(&engines);
        svc.set_trial(Some(TrialStatus::Active));
        let used = || crate::notes::keys::with_keystore(app.handle(), quota::used).unwrap();
        let gate = engines.gated(Reply::Text(json("s1")));
        svc.start(app.handle(), CUR, None, false).unwrap();
        wait_until("engine đang chạy", || engines.requests() == 1);
        // Phiên mới bắt đầu trong lúc việc còn chạy (mã test ghi bản chép lời, như `session.rs`).
        app.state::<TranscriptStore>().begin(2, STARTED_AT + 120_000, "vi");
        gate.send(()).unwrap();
        wait_until("hết chạy", || {
            svc.view(app.handle(), CUR).unwrap().status == JobStatus::Idle
        });
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(used(), 0);
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!((v.free_left, v.notes, v.error), (Some(3), None, None));
        assert!(!svc.has_memory());
    }

    #[test]
    fn auto_start_runs_once_per_session() {
        let (app, engines) = setup(true);
        crate::notes::install_with(app.handle(), engines.factory());
        let svc = app.state::<NotesService>();
        set_auto(&app, true);
        status(&app, SessionStatus::Running);
        status(&app, SessionStatus::Idle);
        wait_until("engine nhận yêu cầu", || engines.requests() == 1);
        wait_until("có ghi chú", || {
            summary(&svc.view(app.handle(), CUR).unwrap()).is_some()
        });
        // Cùng phiên dừng lần nữa (trạng thái nhảy lại): không tạo lại.
        status(&app, SessionStatus::Running);
        status(&app, SessionStatus::Idle);
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(engines.requests(), 1);
        // Phiên mới: tạo cho phiên đó.
        let t = app.state::<TranscriptStore>();
        t.begin(2, STARTED_AT + 120_000, "vi");
        t.upsert(2, &line(2_000_001, "Next meeting."));
        t.end(2, STARTED_AT + 180_000).unwrap();
        status(&app, SessionStatus::Running);
        status(&app, SessionStatus::Idle);
        wait_until("engine nhận yêu cầu thứ hai", || engines.requests() == 2);
    }

    #[test]
    fn clear_all_data_cancels_before_the_wipe_so_no_db_is_recreated() {
        let (app, engines) = setup(true);
        let id = save_to_history(&app);
        crate::notes::install_with(app.handle(), engines.factory());
        let svc = app.state::<NotesService>();
        let gate = engines.gated(Reply::Text(json("s1")));
        svc.start(app.handle(), TranscriptRef::History { id }, None, false)
            .unwrap();
        wait_until("engine đang chạy", || engines.requests() == 1);
        let path = app.state::<crate::db::DataStore>().path();
        assert!(path.exists());
        crate::data::clear_all_data_with(app.handle(), |app| {
            app.state::<crate::db::DataStore>().wipe().map_err(CommandError::from)?;
            // Việc xong đúng lúc vừa xóa DB.
            gate.send(()).unwrap();
            std::thread::sleep(Duration::from_millis(300));
            Ok(())
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(100));
        assert!(!path.exists(), "việc đang chạy không được mở lại DB sau khi xóa");
        let v = svc.view(app.handle(), CUR).unwrap();
        assert_eq!((v.status, v.notes), (JobStatus::Idle, None));
    }
}
