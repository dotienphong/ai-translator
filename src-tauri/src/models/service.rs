//! Dịch vụ model của app (spec F6, §4.1 bước 2–3, §4.3 nhóm Model, §6.7, §9): giữ manifest đã nhận, việc tải đang chạy,
//! và phát trạng thái cho cửa sổ chính qua sự kiện `models://state`.
//!
//! - Manifest: đọc bản đã lưu lúc khởi động, rồi tải bản mới nếu chưa có bản nào hay đã qua một ngày từ lần kiểm trước
//!   ([`ModelService::load`]). Lỗi mạng không xóa bản đang có.
//! - Tải một gói: chạy trên luồng riêng, từng file một ([`super::download`]); xong thì gói thành gói đang dùng
//!   (`modelTier`). Tiến trình phụ đang mở model bị tắt trước khi tải bản cập nhật đè lên file đang dùng.
//! - Gói mới dùng từ phiên sau: phiên đang chạy giữ gói cũ (`session.rs`, ghi chú 8 của review cuối 02).
//! - Bản cập nhật: manifest mới có bản khác của file thuộc gói đang dùng thì giao diện hỏi trước khi tải (§6.7); "Để
//!   sau" nhớ theo `sequence` của manifest.
//! - Phần thay được trong test (thư mục, URL, khóa, cấu hình máy, dung lượng trống, đồng hồ) nằm trong [`Config`].

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use pipeline::config::PipelineConfig;
use reqwest::Url;
use reqwest::blocking::Client;
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};

use super::download::{self, DownloadError, Pause, Retry};
use super::machine::{self, Machine};
use super::manifest::Localized;
use super::recommend::{self, Unsupported, Verdict};
use super::signed::{self, Signed, TrustedKey};
use super::source::{self, FetchError};
use super::store::{self, PackStatus, ResolveError, Store};
use crate::errors::{self, CommandError};
use crate::settings::Settings;
use crate::sidecar::paths::ModelFiles;
use crate::sidecar::probe::GpuInfo;
use crate::state::{AppState, SessionStatus};
use crate::{actions, session, window};

/// Sự kiện trạng thái model, chỉ gửi cửa sổ chính.
pub const STATE_EVENT: &str = "models://state";
/// Chừa thêm chừng này dung lượng trống ngoài phần còn phải tải (§6.7: "kích thước model cộng 1 GB").
pub const DISK_MARGIN: u64 = 1 << 30;
/// Báo tiến độ tải cho giao diện tối đa chừng này một lần.
const PROGRESS_EVERY: Duration = Duration::from_millis(250);

type MachineFn = dyn Fn(Option<&[GpuInfo]>) -> Machine + Send + Sync;
type FreeDiskFn = dyn Fn(&Path) -> Option<u64> + Send + Sync;
type NowFn = dyn Fn() -> u64 + Send + Sync;

pub struct Config {
    pub dir: PathBuf,
    pub source: Option<Url>,
    pub keys: Vec<TrustedKey>,
    pub app_version: String,
    pub retry: Retry,
    pub machine: Box<MachineFn>,
    pub free_disk: Box<FreeDiskFn>,
    /// Giờ hiện tại, giây Unix.
    pub now: Box<NowFn>,
}

impl Config {
    /// Cấu hình thật: `app_local_data_dir/models`, URL và khóa theo loại bản.
    pub fn live<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        Ok(Self {
            dir: app.path().app_local_data_dir()?.join("models"),
            source: source::manifest_url(),
            keys: signed::trusted_keys(),
            app_version: app.package_info().version.to_string(),
            retry: Retry::default(),
            machine: Box::new(machine::detect),
            free_disk: Box::new(machine::free_disk_bytes),
            now: Box::new(|| {
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0)
            }),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JobState {
    Idle,
    Downloading,
    Paused,
    Failed,
    Done,
}

/// Việc tải gần nhất.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub state: JobState,
    pub pack: Option<String>,
    pub done_bytes: u64,
    pub total_bytes: u64,
    /// Mã lỗi (`error.<mã>`) khi `state` là `failed`.
    pub error: Option<String>,
    /// Việc này tải đè file của gói đang dùng (bản cập nhật): trong lúc tải không bắt đầu phiên được.
    pub replaces_in_use: bool,
}

impl Job {
    fn idle() -> Self {
        Self {
            state: JobState::Idle,
            pack: None,
            done_bytes: 0,
            total_bytes: 0,
            error: None,
            replaces_in_use: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackView {
    pub id: String,
    pub name: Localized,
    pub note: Localized,
    pub bytes: u64,
    pub usable: bool,
    pub complete: bool,
    pub missing_bytes: u64,
    pub partial_bytes: u64,
    /// Gói cần app bản mới hơn (`min_app_version`).
    pub app_too_old: bool,
    /// Ổ còn đủ chỗ cho phần còn phải tải cộng 1 GB (§6.7). Không đọc được dung lượng trống thì coi là đủ.
    pub enough_space: bool,
}

/// Trạng thái gửi giao diện.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsView {
    pub rev: u64,
    pub has_source: bool,
    pub checking: bool,
    /// Mã lỗi của lần tải manifest gần nhất.
    pub manifest_error: Option<String>,
    pub sequence: Option<u64>,
    pub packs: Vec<PackView>,
    pub machine: Machine,
    pub verdict: Option<Verdict>,
    pub free_disk_bytes: Option<u64>,
    pub used_bytes: u64,
    pub job: Job,
    /// Gói đang dùng có bản mới trong manifest, người dùng chưa bấm "Để sau".
    pub update_available: bool,
}

struct Inner {
    manifest: Option<Signed>,
    /// Đã đọc bản manifest lưu trên đĩa chưa.
    loaded: bool,
    checking: bool,
    manifest_error: Option<String>,
    job: Job,
    /// Đang xóa hay kiểm một gói (`Some(true)`: gói đang dùng); đặt dưới khóa này cùng lúc kiểm "đang dịch", "đang tải"
    /// (N-10 của review 04 lần 2).
    maintenance: Option<bool>,
    rev: u64,
}

impl Inner {
    /// Có việc đang đụng tới file của gói đang dùng: tải bản cập nhật đè lên nó, hay xóa hoặc kiểm nó. Trong lúc đó không
    /// bắt đầu phiên và không chạy sẵn tiến trình phụ (QĐ15, Q-A của review 04 lần 2).
    fn touches_in_use(&self) -> bool {
        (self.job.state == JobState::Downloading && self.job.replaces_in_use) || self.maintenance == Some(true)
    }
}

/// Việc xóa hay kiểm đang chạy; hủy thì hết (`ModelService::begin_work`).
struct Work<'a>(&'a ModelService);

impl Drop for Work<'_> {
    fn drop(&mut self) {
        self.0.lock().maintenance = None;
    }
}

pub struct ModelService {
    cfg: Config,
    store: Store,
    /// Tạo lúc dùng lần đầu: client đồng bộ của reqwest giữ một luồng riêng.
    client: OnceLock<Option<Client>>,
    inner: Mutex<Inner>,
    pause: Arc<Pause>,
}

fn fetch_code(e: &FetchError) -> &'static str {
    match e {
        FetchError::Network(_) | FetchError::Http(_) => errors::MODELS_OFFLINE,
        FetchError::Signed(_) | FetchError::Rollback { .. } | FetchError::Conflict(_) => {
            errors::MODELS_MANIFEST_INVALID
        }
    }
}

fn download_code(e: &DownloadError) -> &'static str {
    match e {
        DownloadError::Checksum | DownloadError::TooLong => errors::MODELS_CHECKSUM,
        DownloadError::Io(_) => errors::MODELS_DISK,
        DownloadError::Http(_) | DownloadError::Network(_) | DownloadError::Paused => errors::MODELS_DOWNLOAD_FAILED,
    }
}

fn session_active<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<AppState>()
        .is_some_and(|s| matches!(s.status().session, SessionStatus::Starting | SessionStatus::Running))
}

fn selected<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    app.try_state::<AppState>().and_then(|s| s.settings().model_tier)
}

impl ModelService {
    pub fn new(cfg: Config) -> Self {
        Self {
            store: Store::new(&cfg.dir),
            cfg,
            client: OnceLock::new(),
            inner: Mutex::new(Inner {
                manifest: None,
                loaded: false,
                checking: false,
                manifest_error: None,
                job: Job::idle(),
                maintenance: None,
                rev: 0,
            }),
            pause: Arc::new(Pause::default()),
        }
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    fn client(&self) -> Option<&Client> {
        self.client
            .get_or_init(|| {
                download::client()
                    .map_err(|e| log::error!("không tạo được client HTTP: {e}"))
                    .ok()
            })
            .as_ref()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Đọc manifest đã lưu (một lần).
    fn ensure_loaded(&self) {
        let mut inner = self.lock();
        if !inner.loaded {
            inner.loaded = true;
            inner.manifest = self.store.load_manifest(&self.cfg.keys);
        }
    }

    pub fn manifest(&self) -> Option<Signed> {
        self.ensure_loaded();
        self.lock().manifest.clone()
    }

    /// Đang tải bản cập nhật đè lên file của gói đang dùng.
    /// Xem [`Inner::touches_in_use`].
    pub fn busy(&self) -> bool {
        self.lock().touches_in_use()
    }

    /// Bắt đầu phiên dịch: `begin` (đặt trạng thái `Starting`) chạy dưới khóa của dịch vụ, cùng khóa mà `download`,
    /// `delete`, `delete_all`, `verify` giữ lúc kiểm "đang dịch" rồi bắt đầu việc của chúng. Vì vậy hoặc phiên thấy việc
    /// đó và bị từ chối (`modelsBusy`), hoặc việc đó thấy phiên và bị từ chối (`modelsInUse`); không có trường hợp cả hai
    /// cùng chạy (Q-A của review 04 lần 2).
    pub fn begin_session<T>(&self, begin: impl FnOnce() -> T) -> Result<T, CommandError> {
        let inner = self.lock();
        if inner.touches_in_use() {
            return Err(CommandError::new(errors::MODELS_BUSY, None, "đang cập nhật model"));
        }
        Ok(begin())
    }

    /// Bắt đầu một việc xóa hay kiểm, dưới khóa của dịch vụ: từ chối khi việc đụng gói đang dùng mà phiên đang bắt đầu
    /// hay đang chạy (`modelsInUse`), hay khi đang tải hoặc đang có việc khác (`modelsBusy`).
    fn begin_work<R: Runtime>(&self, app: &AppHandle<R>, in_use: bool) -> Result<Work<'_>, CommandError> {
        let mut inner = self.lock();
        if in_use && session_active(app) {
            return Err(CommandError::new(errors::MODELS_IN_USE, None, "đang dịch bằng gói này"));
        }
        if inner.job.state == JobState::Downloading || inner.maintenance.is_some() {
            return Err(CommandError::new(errors::MODELS_BUSY, None, "đang tải"));
        }
        inner.maintenance = Some(in_use);
        Ok(Work(self))
    }

    /// Cấu hình máy, với kết quả dò GPU nếu đã có.
    fn machine<R: Runtime>(&self, app: &AppHandle<R>) -> Machine {
        let gpus = app
            .try_state::<crate::sidecar::GpuProbe>()
            .and_then(|p| p.get(Duration::ZERO))
            .map(|o| o.gpus);
        (self.cfg.machine)(gpus.as_deref())
    }

    /// Ổ có đủ chỗ cho gói không (phần còn phải tải cộng [`DISK_MARGIN`]).
    fn fits(&self, status: &PackStatus) -> Result<(), (u64, u64)> {
        let need = status.missing_bytes.saturating_sub(status.partial_bytes) + DISK_MARGIN;
        match (self.cfg.free_disk)(&self.cfg.dir) {
            Some(free) if !status.complete && free < need => Err((need, free)),
            _ => Ok(()),
        }
    }

    pub fn view<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        self.ensure_loaded();
        let machine = self.machine(app);
        let selected = selected(app);
        let state = self.store.state();
        let inner = self.lock();
        let manifest = inner.manifest.as_ref().map(|s| &s.manifest);
        let packs: Vec<PackView> = manifest
            .map(|m| {
                m.packs
                    .iter()
                    .map(|p| {
                        let status = self.store.pack_status(m, &p.id);
                        PackView {
                            id: p.id.clone(),
                            name: p.name.clone(),
                            note: p.note.clone(),
                            bytes: m.pack_bytes(&p.id),
                            usable: status.usable,
                            complete: status.complete,
                            missing_bytes: status.missing_bytes,
                            partial_bytes: status.partial_bytes,
                            app_too_old: !m.usable_by(&p.id, &self.cfg.app_version),
                            enough_space: self.fits(&status).is_ok(),
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();
        let update_available = match (manifest, &selected) {
            (Some(m), Some(pack)) => {
                let current = packs.iter().find(|p| &p.id == pack);
                current.is_some_and(|p| p.usable && !p.complete && !p.app_too_old)
                    && m.sequence > state.dismissed_sequence
            }
            _ => false,
        };
        ModelsView {
            rev: inner.rev,
            has_source: self.cfg.source.is_some(),
            checking: inner.checking,
            manifest_error: inner.manifest_error.clone(),
            sequence: manifest.map(|m| m.sequence),
            packs,
            verdict: manifest.map(|m| recommend::recommend(&machine, &m.recommend)),
            machine,
            free_disk_bytes: (self.cfg.free_disk)(&self.cfg.dir),
            used_bytes: self.store.used_bytes(),
            job: inner.job.clone(),
            update_available,
        }
    }

    /// Báo trạng thái mới cho cửa sổ chính.
    pub fn changed<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        self.lock().rev += 1;
        let view = self.view(app);
        if let Err(e) = app.emit_to(EventTarget::webview_window(window::MAIN), STATE_EVENT, &view) {
            log::warn!("không gửi được sự kiện {STATE_EVENT}: {e}");
        }
        view
    }

    /// Đọc manifest đã lưu; tải bản mới nếu chưa có bản nào hay đã tới lúc kiểm (tối đa mỗi ngày một lần, §6.7). Chặn
    /// trong lúc gọi mạng: gọi từ luồng nền.
    pub fn load<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        self.ensure_loaded();
        let (Some(url), Some(client)) = (self.cfg.source.clone(), self.client()) else {
            let mut inner = self.lock();
            if inner.manifest.is_none() {
                inner.manifest_error = Some(errors::MODELS_NO_SOURCE.into());
            }
            drop(inner);
            return self.changed(app);
        };
        let now = (self.cfg.now)();
        let due = self.lock().manifest.is_none() || source::due(&self.store.state(), now);
        if !due {
            return self.view(app);
        }
        self.lock().checking = true;
        self.changed(app);
        let fetched = source::fetch(client, &url, &self.cfg.keys);
        let outcome = fetched.and_then(|(raw, new)| {
            let current = self.lock().manifest.clone();
            let newer = source::accept(current.as_ref(), &new)?;
            if newer {
                self.store
                    .save_manifest(&raw)
                    .map_err(|e| FetchError::Network(format!("không lưu được manifest: {e}")))?;
            }
            Ok((newer, new))
        });
        let mut inner = self.lock();
        inner.checking = false;
        match outcome {
            Ok((newer, new)) => {
                if newer {
                    log::info!("nhận manifest model số {} (khóa {})", new.manifest.sequence, new.kid);
                    inner.manifest = Some(new);
                }
                inner.manifest_error = None;
                drop(inner);
                let mut state = self.store.state();
                state.last_check = Some(now);
                if let Err(e) = self.store.save_state(&state) {
                    log::warn!("không ghi được trạng thái kiểm manifest: {e}");
                }
            }
            Err(e) => {
                log::warn!("không cập nhật được manifest model: {e}");
                inner.manifest_error = Some(fetch_code(&e).into());
                drop(inner);
            }
        }
        self.changed(app)
    }

    /// Bắt đầu tải gói `pack` trên luồng riêng; xong thì gói đó thành gói đang dùng.
    pub fn download<R: Runtime>(self: &Arc<Self>, app: &AppHandle<R>, pack: &str) -> Result<ModelsView, CommandError> {
        let manifest = self
            .manifest()
            .ok_or_else(|| CommandError::new(errors::MODELS_NO_SOURCE, None, "chưa có manifest"))?;
        let m = &manifest.manifest;
        if m.pack(pack).is_none() {
            return Err(CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack));
        }
        if !m.usable_by(pack, &self.cfg.app_version) {
            return Err(CommandError::new(errors::MODELS_APP_TOO_OLD, Some("pack"), pack));
        }
        // Máy chưa được hỗ trợ thì không cho tải (chủ dự án quyết 2026-10-02; spec §8).
        if let Verdict::Unsupported { reason } = recommend::recommend(&self.machine(app), &m.recommend) {
            let field = match reason {
                Unsupported::LowRam => "lowRam",
                Unsupported::NoAvx2 => "noAvx2",
            };
            return Err(CommandError::new(
                errors::MODELS_UNSUPPORTED,
                Some(field),
                "máy chưa được hỗ trợ",
            ));
        }
        let url = self
            .cfg
            .source
            .clone()
            .ok_or_else(|| CommandError::new(errors::MODELS_NO_SOURCE, None, "chưa có URL manifest"))?;
        let todo: Vec<_> = m
            .files_of(pack)
            .into_iter()
            .filter(|f| !self.store.is_installed(f))
            .cloned()
            .collect();
        let status = self.store.pack_status(m, pack);
        // File sẽ đè lên file của gói đang dùng (cùng tên): bản cập nhật.
        let in_use: Vec<String> = selected(app)
            .map(|s| m.files_of(&s).iter().map(|f| f.file.clone()).collect())
            .unwrap_or_default();
        let replaces_in_use = todo
            .iter()
            .any(|f| in_use.contains(&f.file) && self.store.path(&f.file).exists());
        if let Err((need, free)) = self.fits(&status) {
            return Err(CommandError::new(
                errors::MODELS_NO_SPACE,
                None,
                format!("cần {need} byte, còn {free}"),
            ));
        }
        {
            let mut inner = self.lock();
            if inner.job.state == JobState::Downloading || inner.maintenance.is_some() {
                return Err(CommandError::new(errors::MODELS_BUSY, None, "đang tải"));
            }
            // Kiểm phiên dưới khóa của dịch vụ: phiên bắt đầu sau lúc này thì thấy `busy()` (N5 của review 04).
            if replaces_in_use && session_active(app) {
                return Err(CommandError::new(errors::MODELS_IN_USE, None, "đang dịch bằng gói này"));
            }
            inner.job = Job {
                state: JobState::Downloading,
                pack: Some(pack.to_string()),
                done_bytes: m.pack_bytes(pack) - status.missing_bytes + status.partial_bytes,
                total_bytes: m.pack_bytes(pack),
                error: None,
                replaces_in_use,
            };
        }
        self.pause.clear();
        let view = self.changed(app);
        let (service, app, pack) = (self.clone(), app.clone(), pack.to_string());
        std::thread::spawn(move || service.run_download(&app, &manifest, &url, &pack, todo));
        Ok(view)
    }

    fn run_download<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        manifest: &Signed,
        url: &Url,
        pack: &str,
        todo: Vec<super::manifest::FileEntry>,
    ) {
        let m = &manifest.manifest;
        // Tải đè file của gói đang dùng: tắt tiến trình phụ đang rảnh trước (Windows không cho đổi tên đè file đang mở).
        // Chạy ở luồng tải, không ở lệnh: tắt có thể phải chờ lần nạp model đang dở (Q2 của review 04).
        if self.lock().job.replaces_in_use {
            session::release_models(app);
        }
        let result = (|| -> Result<(), &'static str> {
            let client = self.client().ok_or(errors::MODELS_DOWNLOAD_FAILED)?;
            std::fs::create_dir_all(self.store.dir()).map_err(|_| errors::MODELS_DISK)?;
            for entry in &todo {
                let file_url = source::file_url(url, entry).ok_or(errors::MODELS_MANIFEST_INVALID)?;
                let job = self.store.job(entry, file_url);
                let part = std::fs::metadata(job.part()).map(|m| m.len()).unwrap_or(0);
                let before = self.lock().job.done_bytes.saturating_sub(part);
                let mut last = Instant::now();
                let pause = self.pause.clone();
                download::download(
                    client,
                    &job,
                    &self.pause,
                    &self.cfg.retry,
                    &mut |wait| download::sleep_unless_paused(&pause, wait),
                    &mut |n| {
                        self.lock().job.done_bytes = before + n;
                        if last.elapsed() >= PROGRESS_EVERY {
                            last = Instant::now();
                            self.changed(app);
                        }
                    },
                )
                .map_err(|e| {
                    log::warn!("tải {} không xong: {e}", entry.file);
                    if e == DownloadError::Paused {
                        "paused"
                    } else {
                        download_code(&e)
                    }
                })?;
                self.store.mark_installed(entry).map_err(|_| errors::MODELS_DISK)?;
                self.lock().job.done_bytes = before + entry.bytes;
            }
            Ok(())
        })();
        {
            let mut inner = self.lock();
            match result {
                Ok(()) => {
                    inner.job.state = JobState::Done;
                    inner.job.done_bytes = inner.job.total_bytes;
                }
                Err("paused") => inner.job.state = JobState::Paused,
                Err(code) => {
                    inner.job.state = JobState::Failed;
                    inner.job.error = Some(code.to_string());
                }
            }
        }
        if result.is_ok() {
            log::info!("đã tải xong gói model {pack}");
            if let Err(e) = self.store.cleanup(m) {
                log::warn!("không dọn được file model cũ: {e}");
            }
            actions::set_model_tier(app, Some(pack.to_string()));
        }
        self.changed(app);
    }

    pub fn pause<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        if self.lock().job.state == JobState::Downloading {
            self.pause.request();
        }
        self.view(app)
    }

    /// Dùng gói đã tải (gói mới có tác dụng từ phiên sau).
    pub fn select<R: Runtime>(&self, app: &AppHandle<R>, pack: &str) -> Result<Settings, CommandError> {
        let manifest = self
            .manifest()
            .ok_or_else(|| CommandError::new(errors::MODEL_MISSING, Some("pack"), "chưa có manifest"))?;
        if manifest.manifest.pack(pack).is_none() {
            return Err(CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack));
        }
        if !self.store.pack_status(&manifest.manifest, pack).usable {
            return Err(CommandError::new(errors::MODEL_MISSING, Some("pack"), pack));
        }
        Ok(actions::set_model_tier(app, Some(pack.to_string())))
    }

    /// Xóa một gói (giữ file còn dùng chung với gói khác đã tải).
    pub fn delete<R: Runtime>(&self, app: &AppHandle<R>, pack: &str) -> Result<ModelsView, CommandError> {
        let manifest = self
            .manifest()
            .ok_or_else(|| CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack))?;
        let m = &manifest.manifest;
        if m.pack(pack).is_none() {
            return Err(CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack));
        }
        let in_use = selected(app).as_deref() == Some(pack);
        let work = self.begin_work(app, in_use)?;
        if in_use {
            session::release_models(app);
        }
        let keep: Vec<&str> = m
            .packs
            .iter()
            .map(|p| p.id.as_str())
            .filter(|p| *p != pack && self.store.pack_status(m, p).usable)
            .collect();
        self.store
            .delete_pack(m, pack, &keep)
            .map_err(|e| CommandError::new(errors::MODELS_DISK, None, e.to_string()))?;
        {
            let mut inner = self.lock();
            if inner.job.pack.as_deref() == Some(pack) {
                inner.job = Job::idle();
            }
        }
        drop(work);
        Ok(self.changed(app))
    }

    /// "Xóa model và dữ liệu" (§4.3, A6): xóa cả thư mục model, bỏ gói đang dùng. Bản quyền và bộ đếm hạn mức trong
    /// kho khóa giữ nguyên (Q14). Manifest vẫn giữ trong bộ nhớ, để tải lại được ngay mà không cần mạng.
    pub fn delete_all<R: Runtime>(&self, app: &AppHandle<R>) -> Result<ModelsView, CommandError> {
        let work = self.begin_work(app, true)?;
        session::release_models(app);
        // Giữ lại manifest đã nhận: nó là mốc chống quay lui về manifest cũ (N3 của review 04).
        let saved = std::fs::read(self.store.path(store::MANIFEST)).ok();
        self.store
            .delete_all()
            .map_err(|e| CommandError::new(errors::MODELS_DISK, None, e.to_string()))?;
        if let Some(raw) = saved
            && let Err(e) = self.store.save_manifest(&raw)
        {
            log::warn!("không ghi lại được manifest: {e}");
        }
        self.lock().job = Job::idle();
        actions::set_model_tier(app, None);
        log::info!("đã xóa model và dữ liệu");
        drop(work);
        Ok(self.changed(app))
    }

    /// "Tải lại" (§4.3): băm lại file của gói; file hỏng bị bỏ, để lần tải sau chỉ tải lại chúng. Gói đang dùng thì tắt
    /// tiến trình phụ đang rảnh trước.
    pub fn verify<R: Runtime>(&self, app: &AppHandle<R>, pack: &str) -> Result<ModelsView, CommandError> {
        let manifest = self
            .manifest()
            .ok_or_else(|| CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack))?;
        if manifest.manifest.pack(pack).is_none() {
            return Err(CommandError::new(errors::MODELS_UNKNOWN_PACK, Some("pack"), pack));
        }
        let in_use = selected(app).as_deref() == Some(pack);
        let work = self.begin_work(app, in_use)?;
        if in_use {
            session::release_models(app);
        }
        let broken = self.store.verify_pack(&manifest.manifest, pack);
        if !broken.is_empty() {
            log::warn!("gói {pack} có file hỏng: {broken:?}");
        }
        drop(work);
        Ok(self.changed(app))
    }

    /// "Để sau" với bản cập nhật của manifest hiện tại.
    pub fn dismiss_update<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        if let Some(sequence) = self.manifest().map(|s| s.manifest.sequence) {
            let mut state = self.store.state();
            state.dismissed_sequence = sequence;
            if let Err(e) = self.store.save_state(&state) {
                log::warn!("không ghi được trạng thái model: {e}");
            }
        }
        self.changed(app)
    }

    /// File model của gói đang dùng, cho tiến trình phụ (§9: chỉ kiểm có file và đúng kích thước).
    pub fn resolve(&self, pack: Option<&str>) -> Result<ModelFiles, CommandError> {
        if self.busy() {
            return Err(CommandError::new(errors::MODELS_BUSY, None, "đang cập nhật model"));
        }
        let missing = |what: String| CommandError::new(errors::MODEL_MISSING, None, what);
        let pack = pack.ok_or_else(|| missing("chưa chọn gói".into()))?;
        let manifest = self.manifest().ok_or_else(|| missing("chưa có manifest".into()))?;
        self.store.resolve(&manifest.manifest, pack).map_err(|e| match e {
            ResolveError::Missing(_) => missing(e.to_string()),
            ResolveError::Broken(_) => CommandError::new(errors::MODEL_BROKEN, None, e.to_string()),
        })
    }

    /// Model nạp lỗi (§9): băm lại đầy đủ file của gói; file hỏng bị bỏ để người dùng tải lại.
    pub fn verify_selected<R: Runtime>(&self, app: &AppHandle<R>) {
        let (Some(pack), Some(manifest)) = (selected(app), self.manifest()) else {
            return;
        };
        let broken = self.store.verify_pack(&manifest.manifest, &pack);
        if !broken.is_empty() {
            log::warn!("gói {pack} có file hỏng: {broken:?}");
        }
        self.changed(app);
    }

    /// Ngưỡng của pipeline theo manifest (02a QĐ21).
    pub fn pipeline_config(&self) -> PipelineConfig {
        self.manifest()
            .map(|s| s.manifest.pipeline_config())
            .unwrap_or_default()
    }
}

/// Lúc khởi động: đọc manifest đã lưu và kiểm bản mới (tối đa mỗi ngày một lần), trên luồng nền.
pub fn check_on_startup<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Some(service) = app.try_state::<Arc<ModelService>>() {
            service.load(&app);
        }
    });
}

/// Model nạp lỗi (§9): băm lại file của gói đang dùng trên luồng nền.
pub fn verify_in_background<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Some(service) = app.try_state::<Arc<ModelService>>() {
            service.verify_selected(&app);
        }
    });
}

/// Báo trạng thái model mới (ví dụ khi `--probe` vừa có kết quả).
pub fn changed<R: Runtime>(app: &AppHandle<R>) {
    if let Some(service) = app.try_state::<Arc<ModelService>>() {
        service.changed(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    use serde_json::{Value, json};
    use sha2::Digest;
    use tauri::Listener;
    use tauri::test::MockRuntime;

    use crate::models::signed::tests::signed_with_test_key;
    use crate::models::store::tests::{content, real_sample};
    use crate::models::test_http::{FakeServer, Fault};
    use crate::test_support::{FakeDeps, MODELS_NOW, PrepareGate, invoke, mock_app_full, models_config, window};

    const DAY: u64 = 24 * 3600;

    struct Harness {
        app: tauri::App<MockRuntime>,
        server: FakeServer,
        clock: Arc<AtomicU64>,
        events: Arc<Mutex<Vec<Value>>>,
    }

    impl Harness {
        fn main(&self) -> tauri::WebviewWindow<MockRuntime> {
            window(&self.app, "main")
        }

        fn call(&self, cmd: &str, args: Value) -> Result<Value, String> {
            invoke(&self.main(), cmd, args)
        }

        fn service(&self) -> Arc<ModelService> {
            self.app.state::<Arc<ModelService>>().inner().clone()
        }

        fn dir(&self) -> PathBuf {
            self.service().store().dir().to_path_buf()
        }

        /// Chờ việc tải về trạng thái `state`.
        fn wait(&self, state: &str) -> Value {
            let started = Instant::now();
            loop {
                let view = self.call("get_models_state", json!({})).unwrap();
                if view["job"]["state"] == state {
                    return view;
                }
                assert!(started.elapsed() < Duration::from_secs(10), "chờ quá lâu: {view}");
                std::thread::sleep(Duration::from_millis(10));
            }
        }

        fn model_tier(&self) -> Value {
            self.call("get_settings", json!({})).unwrap()["modelTier"].clone()
        }

        fn tick_days(&self, days: u64) {
            self.clock.fetch_add(days * DAY, Ordering::SeqCst);
        }
    }

    /// Đặt manifest (ký bằng khóa test) và nội dung các file của nó lên server giả.
    fn publish(server: &FakeServer, body: &Value) {
        server.put("models.json", &signed_with_test_key(body));
        for f in body["files"].as_array().unwrap() {
            let (id, bytes) = (f["id"].as_str().unwrap(), f["bytes"].as_u64().unwrap());
            server.put(f["url"].as_str().unwrap(), &content(id, bytes));
        }
    }

    fn harness(change: impl FnOnce(&mut Config)) -> Harness {
        harness_with(FakeDeps::default(), change)
    }

    fn harness_with(deps: FakeDeps, change: impl FnOnce(&mut Config)) -> Harness {
        let server = FakeServer::start();
        publish(&server, &real_sample());
        let clock = Arc::new(AtomicU64::new(MODELS_NOW));
        let mut cfg = models_config(Some(server.url("models.json")), clock.clone());
        change(&mut cfg);
        let app = mock_app_full(deps, cfg);
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        app.listen_any(STATE_EVENT, move |e| {
            sink.lock().unwrap().push(serde_json::from_str(e.payload()).unwrap())
        });
        Harness {
            app,
            server,
            clock,
            events,
        }
    }

    fn manifest_requests(h: &Harness) -> usize {
        h.server.requests().iter().filter(|r| r.path == "/models.json").count()
    }

    /// §4.1 bước 2: lần đầu mở app tải manifest, liệt kê gói kèm dung lượng, và đề xuất gói theo máy.
    #[test]
    fn loads_the_manifest_and_recommends_a_pack() {
        let h = harness(|_| {});
        let view = h.call("get_models_state", json!({})).unwrap();
        assert_eq!(view["packs"], json!([]));
        assert_eq!(view["hasSource"], true);
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["sequence"], 3);
        assert_eq!(view["manifestError"], Value::Null);
        let packs = view["packs"].as_array().unwrap();
        assert_eq!(packs.len(), 2);
        assert_eq!(
            (&packs[0]["id"], &packs[0]["bytes"], &packs[0]["usable"]),
            (&json!("standard"), &json!(500 + 1900 + 20 + 10), &json!(false))
        );
        assert_eq!(packs[1]["name"], json!({ "vi": "Nhẹ", "en": "Lite" }));
        assert_eq!(view["verdict"], json!({ "kind": "recommend", "pack": "standard" }));
        assert_eq!(view["machine"]["ramMib"], 16_384);
        assert!(h.dir().join("manifest.json").exists(), "lưu để dùng khi không có mạng");
        let events = h.events.lock().unwrap();
        assert!(events.iter().any(|e| e["checking"] == true));
        assert_eq!(events.last().unwrap()["sequence"], 3);
    }

    /// §6.7: kiểm manifest tối đa mỗi ngày một lần.
    #[test]
    fn checks_the_manifest_at_most_once_a_day() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("load_models", json!({})).unwrap();
        assert_eq!(manifest_requests(&h), 1);
        h.clock.fetch_add(DAY - 1, Ordering::SeqCst);
        h.call("load_models", json!({})).unwrap();
        assert_eq!(manifest_requests(&h), 1);
        h.clock.fetch_add(1, Ordering::SeqCst);
        h.call("load_models", json!({})).unwrap();
        assert_eq!(manifest_requests(&h), 2);
        assert_eq!(
            h.service().store().state().last_check,
            Some(MODELS_NOW + DAY),
            "ghi lần kiểm"
        );
    }

    #[test]
    fn without_a_source_nothing_is_fetched() {
        let h = harness(|cfg| cfg.source = None);
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["manifestError"], "modelsNoSource");
        assert_eq!(view["hasSource"], false);
        assert!(h.server.requests().is_empty());
        assert_eq!(
            h.call("download_models", json!({ "pack": "lite" })).unwrap_err(),
            json!({ "code": "modelsNoSource", "field": null, "message": "chưa có manifest" }).to_string()
        );
    }

    /// Manifest bị sửa hay cũ hơn bị từ chối; bản đang có vẫn dùng được. Mất mạng cũng giữ bản đang có.
    #[test]
    fn a_bad_or_older_manifest_is_refused_and_the_old_one_kept() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        let mut tampered = signed_with_test_key(&real_sample());
        let at = tampered.len() / 2;
        tampered[at] ^= 1;
        h.server.put("models.json", &tampered);
        h.tick_days(1);
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["manifestError"], "modelsManifestInvalid");
        assert_eq!(view["sequence"], 3);
        let mut older = real_sample();
        older["sequence"] = 2.into();
        publish(&h.server, &older);
        h.tick_days(1);
        assert_eq!(
            h.call("load_models", json!({})).unwrap()["manifestError"],
            "modelsManifestInvalid"
        );
        h.server.fault(Fault::Status(503));
        h.tick_days(1);
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["manifestError"], "modelsOffline");
        assert_eq!(view["sequence"], 3);
    }

    /// §4.1 bước 3: tải xong là dùng được ngay (gói thành gói đang dùng).
    #[test]
    fn downloading_a_pack_makes_it_the_pack_in_use() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        let started = h.call("download_models", json!({ "pack": "lite" })).unwrap();
        assert_eq!(started["job"]["state"], "downloading");
        assert_eq!(started["job"]["totalBytes"], 200 + 1100 + 20 + 10);
        let done = h.wait("done");
        assert_eq!(done["job"]["doneBytes"], 200 + 1100 + 20 + 10);
        assert_eq!(h.model_tier(), "lite");
        let lite = &done["packs"][1];
        assert_eq!((&lite["usable"], &lite["complete"]), (&json!(true), &json!(true)));
        assert_eq!(
            done["packs"][0]["missingBytes"],
            500 + 1900,
            "VAD và giấy phép dùng chung"
        );
        assert_eq!(
            std::fs::read(h.dir().join("ggml-small-q5_1.bin")).unwrap(),
            content("whisper-small", 200)
        );
        let files = h.service().resolve(Some("lite")).unwrap();
        assert_eq!(files.mt, h.dir().join("Hy-MT2-1.8B-Q4_K_M.gguf"));
        assert_eq!(
            h.call("select_model_pack", json!({ "pack": "standard" })).unwrap_err(),
            json!({ "code": "modelMissing", "field": "pack", "message": "standard" }).to_string()
        );
        assert_eq!(
            h.call("update_settings", json!({ "patch": { "modelTier": "standard" } }))
                .unwrap_err(),
            json!({ "code": "readOnly", "field": "modelTier",
                    "message": "cài đặt `modelTier` không hợp lệ (ReadOnly)" })
            .to_string()
        );
        assert_eq!(
            h.call("download_models", json!({ "pack": "hybrid" })).unwrap_err(),
            json!({ "code": "modelsUnknownPack", "field": "pack", "message": "hybrid" }).to_string()
        );
    }

    /// §9: tải lỗi thì thử lại 3 lần rồi báo lỗi; bấm tải lần nữa thì tải tiếp từ phần đã có.
    #[test]
    fn a_failed_download_can_be_resumed() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.server.fault(Fault::DropAfter(100));
        for _ in 0..3 {
            h.server.fault(Fault::Status(503));
        }
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        let failed = h.wait("failed");
        assert_eq!(failed["job"]["error"], "modelsDownloadFailed");
        assert_eq!(failed["packs"][1]["partialBytes"], 100);
        assert_eq!(h.model_tier(), Value::Null);
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let ranges: Vec<_> = h
            .server
            .requests()
            .into_iter()
            .filter(|r| r.path.ends_with("ggml-small-q5_1.bin"))
            .map(|r| r.range)
            .collect();
        assert_eq!(ranges.first(), Some(&None));
        assert_eq!(
            ranges.last(),
            Some(&Some("bytes=100-".into())),
            "tải tiếp, không tải lại từ đầu"
        );
        assert_eq!(h.model_tier(), "lite");
    }

    #[test]
    fn a_wrong_sha256_is_reported() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        for _ in 0..4 {
            h.server.fault(Fault::Corrupt);
        }
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        assert_eq!(h.wait("failed")["job"]["error"], "modelsChecksum");
    }

    /// §6.7: trước khi tải, dung lượng trống phải đủ phần còn phải tải cộng 1 GB.
    #[test]
    fn a_download_needs_free_space_plus_one_gigabyte() {
        let h = harness(|cfg| cfg.free_disk = Box::new(|_| Some(DISK_MARGIN + 1_000)));
        h.call("load_models", json!({})).unwrap();
        let refused = h.call("download_models", json!({ "pack": "lite" })).unwrap_err();
        assert!(refused.contains("\"code\":\"modelsNoSpace\""), "{refused}");
        let h = harness(|cfg| cfg.free_disk = Box::new(|_| Some(DISK_MARGIN + 1_330)));
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
    }

    /// §6.7: có bản mới thì hỏi trước, không tự tải; "Để sau" nhớ theo số manifest; tải thì thay bản cũ.
    #[test]
    fn an_update_is_offered_not_downloaded() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let mut newer = real_sample();
        newer["sequence"] = 4.into();
        let q4 = &mut newer["files"][3];
        q4["version"] = "2".into();
        q4["bytes"] = 1_101.into();
        let sha = sha2::Sha256::digest(content("hy-mt2-q4", 1_101));
        q4["sha256"] = sha.iter().map(|b| format!("{b:02x}")).collect::<String>().into();
        publish(&h.server, &newer);
        h.tick_days(1);
        let requests = h.server.requests().len();
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["updateAvailable"], true);
        assert_eq!(view["packs"][1]["missingBytes"], 1_101);
        assert_eq!(
            h.server.requests().len(),
            requests + 1,
            "chỉ tải manifest, không tự tải model"
        );
        assert!(h.service().resolve(Some("lite")).is_ok(), "bản cũ vẫn dùng được");
        let view = h.call("dismiss_models_update", json!({})).unwrap();
        assert_eq!(view["updateAvailable"], false);
        newer["sequence"] = 5.into();
        publish(&h.server, &newer);
        h.tick_days(1);
        assert_eq!(h.call("load_models", json!({})).unwrap()["updateAvailable"], true);
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        let done = h.wait("done");
        assert_eq!(done["updateAvailable"], false);
        assert_eq!(
            std::fs::read(h.dir().join("Hy-MT2-1.8B-Q4_K_M.gguf")).unwrap(),
            content("hy-mt2-q4", 1_101)
        );
    }

    /// Đang dịch bằng gói thì không tải đè hay xóa gói đó (ghi chú 8 của review cuối 02).
    #[test]
    fn the_pack_in_use_is_not_replaced_during_a_session() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let mut newer = real_sample();
        newer["sequence"] = 4.into();
        newer["files"][3]["sha256"] = "cd".repeat(32).into();
        publish(&h.server, &newer);
        h.tick_days(1);
        h.call("load_models", json!({})).unwrap();
        h.call("toggle_session", json!({})).unwrap();
        let busy = |r: Result<Value, String>| r.unwrap_err().contains("\"code\":\"modelsInUse\"");
        assert!(busy(h.call("download_models", json!({ "pack": "lite" }))));
        assert!(busy(h.call("delete_models", json!({ "pack": "lite" }))));
        assert!(busy(h.call("delete_models_and_data", json!({}))));
        assert!(
            busy(h.call("verify_models", json!({ "pack": "lite" }))),
            "không băm lại gói đang dịch"
        );
        h.call("download_models", json!({ "pack": "standard" })).unwrap();
        h.wait("done");
        assert_eq!(h.model_tier(), "standard", "gói mới dùng từ phiên sau");
        h.call("toggle_session", json!({})).unwrap();
    }

    #[test]
    fn deleting_packs_and_everything() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        h.call("download_models", json!({ "pack": "standard" })).unwrap();
        h.wait("done");
        let view = h.call("delete_models", json!({ "pack": "standard" })).unwrap();
        assert_eq!(view["packs"][0]["usable"], false);
        assert_eq!(view["packs"][1]["complete"], true, "gói Nhẹ còn VAD và giấy phép");
        assert_eq!(h.model_tier(), "standard", "xóa gói đang dùng không tự đổi gói");
        h.call("select_model_pack", json!({ "pack": "lite" })).unwrap();
        assert_eq!(h.model_tier(), "lite");
        h.call(
            "add_glossary_entry",
            json!({ "source": "sprint", "target": "đợt chạy" }),
        )
        .unwrap();
        let view = h.call("delete_models_and_data", json!({})).unwrap();
        assert_eq!(
            h.call("list_glossary", json!({})).unwrap(),
            json!([]),
            "phần dữ liệu xóa bằng hàm của 03"
        );
        let left: Vec<String> = std::fs::read_dir(h.dir())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            left,
            ["manifest.json"],
            "chỉ còn manifest, mốc chống quay lui (N3 của review 04)"
        );
        assert_eq!(h.model_tier(), Value::Null);
        assert_eq!(view["packs"][1]["usable"], false);
        assert_eq!(view["sequence"], 3, "danh sách gói vẫn còn để tải lại");
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
    }

    /// §9: model nạp lỗi thì băm lại; file hỏng bị bỏ, gói hiện "chưa tải" để người dùng tải lại.
    #[test]
    fn a_broken_model_is_found_by_hashing_again() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let path = h.dir().join("Hy-MT2-1.8B-Q4_K_M.gguf");
        let mut bytes = std::fs::read(&path).unwrap();
        bytes[0] ^= 1;
        std::fs::write(&path, bytes).unwrap();
        assert!(
            h.service().resolve(Some("lite")).is_ok(),
            "lúc bắt đầu chỉ kiểm kích thước"
        );
        h.service().verify_selected(h.app.handle());
        let view = h.call("get_models_state", json!({})).unwrap();
        assert_eq!(view["packs"][1]["usable"], false);
        let missing = h.service().resolve(Some("lite")).unwrap_err();
        assert_eq!(missing.code, errors::MODEL_MISSING);
        std::fs::write(h.dir().join("ggml-small-q5_1.bin"), b"ngan").unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        std::fs::write(h.dir().join("ggml-small-q5_1.bin"), b"ngan").unwrap();
        assert_eq!(
            h.service().resolve(Some("lite")).unwrap_err().code,
            errors::MODEL_BROKEN,
            "sai kích thước"
        );
    }

    /// Gói Nhẹ với file nhận dạng lớn hơn (2 000 byte), để tải chậm đủ lâu cho test tạm dừng và bận.
    fn slow_sample() -> Value {
        let mut body = real_sample();
        let small = &mut body["files"][1];
        small["bytes"] = 2_000.into();
        let sha = sha2::Sha256::digest(content("whisper-small", 2_000));
        small["sha256"] = sha.iter().map(|b| format!("{b:02x}")).collect::<String>().into();
        body
    }

    fn slow_harness(deps: FakeDeps) -> Harness {
        let h = harness_with(deps, |_| {});
        publish(&h.server, &slow_sample());
        h.call("load_models", json!({})).unwrap();
        h
    }

    /// Chờ tới khi việc tải đã nhận được dữ liệu.
    fn wait_progress(h: &Harness) {
        let started = Instant::now();
        while h.call("get_models_state", json!({})).unwrap()["job"]["doneBytes"] == 0 {
            assert!(started.elapsed() < Duration::from_secs(10), "không có tiến độ");
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    /// §4.1 bước 3: tạm dừng rồi tải tiếp, từ chỗ đã dừng.
    #[test]
    fn pause_then_resume_continues_with_range() {
        let h = slow_harness(FakeDeps::default());
        h.server.fault(Fault::Slow(100));
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        wait_progress(&h);
        h.call("pause_models_download", json!({})).unwrap();
        let paused = h.wait("paused");
        assert_eq!(h.model_tier(), Value::Null);
        let kept = paused["packs"][1]["partialBytes"].as_u64().unwrap();
        assert!((1..2_000).contains(&kept), "{kept}");
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let ranges: Vec<_> = h
            .server
            .requests()
            .into_iter()
            .filter(|r| r.path.ends_with("ggml-small-q5_1.bin"))
            .map(|r| r.range)
            .collect();
        assert_eq!(ranges, [None, Some(format!("bytes={kept}-"))]);
        assert_eq!(h.model_tier(), "lite");
    }

    /// Đang tải thì không tải thêm, không xóa gói, không xóa hết (hai luồng không ghi cùng một file).
    #[test]
    fn nothing_else_runs_while_downloading() {
        let h = slow_harness(FakeDeps::default());
        h.server.fault(Fault::Slow(100));
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        let busy = |r: Result<Value, String>| r.unwrap_err().contains("\"code\":\"modelsBusy\"");
        assert!(busy(h.call("download_models", json!({ "pack": "standard" }))));
        assert!(busy(h.call("download_models", json!({ "pack": "lite" }))));
        assert!(busy(h.call("delete_models", json!({ "pack": "standard" }))));
        assert!(busy(h.call("delete_models_and_data", json!({}))));
        assert!(busy(h.call("verify_models", json!({ "pack": "lite" }))));
        h.wait("done");
    }

    /// Bản cập nhật của gói `standard` (đang dùng): file `whisper-turbo` cùng tên, khác nội dung, tải chậm.
    fn publish_update_of_standard(h: &Harness) {
        let mut newer = slow_sample();
        newer["sequence"] = 4.into();
        let turbo = &mut newer["files"][0];
        turbo["bytes"] = 2_000.into();
        let sha = sha2::Sha256::digest(content("whisper-turbo", 2_000));
        turbo["sha256"] = sha.iter().map(|b| format!("{b:02x}")).collect::<String>().into();
        publish(&h.server, &newer);
        h.tick_days(1);
        h.call("load_models", json!({})).unwrap();
        h.server.fault(Fault::Slow(100));
    }

    /// `toggle_session` như giao diện gọi, nhưng có hạn: code sai có thể làm lần bắt đầu phiên chờ mãi (lần chạy sẵn bị
    /// chặn ở cổng của test), khi đó test đỏ thay vì treo.
    fn toggle_within(h: &Harness) -> Result<Value, String> {
        let (main, (tx, rx)) = (h.main(), std::sync::mpsc::channel());
        std::thread::spawn(move || tx.send(invoke(&main, "toggle_session", json!({}))));
        rx.recv_timeout(Duration::from_secs(10))
            .expect("toggle_session không trả về")
    }

    fn wait_for(what: &str, done: impl Fn() -> bool) {
        let started = Instant::now();
        while !done() {
            assert!(started.elapsed() < Duration::from_secs(10), "chờ quá lâu: {what}");
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    /// Đang tải bản cập nhật của gói đang dùng: không bắt đầu phiên (QĐ15, chủ dự án quyết 2026-10-02), kiểm qua đường
    /// bắt đầu phiên thật (`toggle_session`, Q-A của review 04 lần 2); trước khi tải, tiến trình phụ đang rảnh được tắt
    /// để nhả file (QĐ16).
    #[test]
    fn updating_the_pack_in_use_blocks_sessions_and_releases_models() {
        let deps = FakeDeps::default();
        let (releases, prepares) = (deps.releases.clone(), deps.prepares.clone());
        let h = harness_with(deps, |_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "standard" })).unwrap();
        h.wait("done");
        assert_eq!(*releases.lock().unwrap(), 0, "tải gói mới không cần tắt gì");
        publish_update_of_standard(&h);
        let started = h.call("download_models", json!({ "pack": "standard" })).unwrap();
        assert_eq!(started["job"]["replacesInUse"], true);
        let refused = toggle_within(&h).unwrap_err();
        assert!(refused.contains("\"code\":\"modelsBusy\""), "{refused}");
        assert_eq!(
            *prepares.lock().unwrap(),
            0,
            "không chuẩn bị tiến trình phụ trong lúc tải đè"
        );
        let busy = h.service().resolve(Some("standard")).unwrap_err();
        assert_eq!(
            busy.code,
            errors::MODELS_BUSY,
            "lần chạy sẵn đã qua cổng thì dừng ở resolve, không nạp tiếp"
        );
        h.wait("done");
        assert_eq!(*releases.lock().unwrap(), 1);
        assert_eq!(h.call("toggle_session", json!({})).unwrap()["session"], "running");
        h.call("toggle_session", json!({})).unwrap();
        h.call("delete_models", json!({ "pack": "standard" })).unwrap();
        assert_eq!(*releases.lock().unwrap(), 2, "xóa gói đang dùng");
        h.call("delete_models_and_data", json!({})).unwrap();
        assert_eq!(*releases.lock().unwrap(), 3, "xóa hết");
    }

    /// Q-A của review 04 lần 2: lần chạy sẵn đang nạp dở thì việc tải đè chờ nó xong rồi mới tắt tiến trình phụ (nếu
    /// không, nó còn chạy `llama-server` sau lần tắt); trong lúc tải đè, lần chạy sẵn mới không chạy.
    #[test]
    fn an_update_waits_for_a_prewarm_in_progress_and_stops_new_ones() {
        let gate = Arc::new(PrepareGate::default());
        let deps = FakeDeps {
            prepare_gate: Some(gate.clone()),
            ..FakeDeps::default()
        };
        let (releases, prepares) = (deps.releases.clone(), deps.prepares.clone());
        let h = harness_with(deps, |_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "standard" })).unwrap();
        h.wait("done");
        crate::session::prewarm(h.app.handle());
        wait_for("lần chạy sẵn tới prepare", || gate.waiting() == 1);
        publish_update_of_standard(&h);
        h.call("download_models", json!({ "pack": "standard" })).unwrap();
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(*releases.lock().unwrap(), 0, "chờ lần chạy sẵn đang nạp");
        gate.open();
        wait_for("tắt tiến trình phụ", || *releases.lock().unwrap() == 1);
        assert_eq!(
            h.call("get_models_state", json!({})).unwrap()["job"]["state"],
            "downloading"
        );
        crate::session::prewarm(h.app.handle());
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(*prepares.lock().unwrap(), 1, "đang tải đè: không chạy sẵn");
        h.wait("done");
    }

    /// N-10 của review 04 lần 2: trong lúc xóa (có thể phải chờ lần chạy sẵn đang nạp dở), không bắt đầu phiên và không
    /// tải được.
    #[test]
    fn deleting_blocks_sessions_and_downloads_until_done() {
        let gate = Arc::new(PrepareGate::default());
        let deps = FakeDeps {
            prepare_gate: Some(gate.clone()),
            ..FakeDeps::default()
        };
        let h = harness_with(deps, |_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        crate::session::prewarm(h.app.handle());
        wait_for("lần chạy sẵn tới prepare", || gate.waiting() == 1);
        let (service, handle) = (h.service(), h.app.handle().clone());
        let deleting = std::thread::spawn(move || service.delete_all(&handle).map(|_| ()));
        wait_for("đang xóa", || h.service().busy());
        let busy = |r: Result<Value, String>| r.unwrap_err().contains("\"code\":\"modelsBusy\"");
        assert!(busy(toggle_within(&h)));
        assert!(busy(h.call("download_models", json!({ "pack": "standard" }))));
        gate.open();
        deleting.join().unwrap().unwrap();
        assert!(!h.service().busy());
    }

    #[test]
    fn a_pack_for_a_newer_app_is_refused() {
        let h = harness(|_| {});
        let mut body = real_sample();
        body["files"][1]["min_app_version"] = "9.0.0".into();
        publish(&h.server, &body);
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["packs"][1]["appTooOld"], true);
        let refused = h.call("download_models", json!({ "pack": "lite" })).unwrap_err();
        assert!(refused.contains("\"code\":\"modelsAppTooOld\""), "{refused}");
    }

    /// Chủ dự án quyết 2026-10-02: máy chưa được hỗ trợ thì không cho tải model; phía Rust từ chối lệnh.
    #[test]
    fn an_unsupported_machine_cannot_download() {
        for (ram, avx2, reason) in [(4_096, true, "lowRam"), (16_384, false, "noAvx2")] {
            let h = harness(|cfg| {
                cfg.machine = Box::new(move |_| crate::models::machine::Machine {
                    os: crate::models::manifest::Os::Windows,
                    ram_mib: ram,
                    avx2,
                    gpus: Vec::new(),
                    gpu_known: true,
                })
            });
            let view = h.call("load_models", json!({})).unwrap();
            assert_eq!(view["verdict"], json!({ "kind": "unsupported", "reason": reason }));
            let refused = h.call("download_models", json!({ "pack": "lite" })).unwrap_err();
            assert_eq!(
                refused,
                json!({ "code": "modelsUnsupported", "field": reason, "message": "máy chưa được hỗ trợ" }).to_string()
            );
            assert!(h.server.requests().iter().all(|r| r.path == "/models.json"));
        }
    }

    #[test]
    fn packs_that_do_not_fit_on_disk_are_marked() {
        let h = harness(|cfg| cfg.free_disk = Box::new(|_| Some(DISK_MARGIN + 1_400)));
        let view = h.call("load_models", json!({})).unwrap();
        assert_eq!(view["packs"][0]["enoughSpace"], false, "gói Chuẩn cần 2 430 byte");
        assert_eq!(view["packs"][1]["enoughSpace"], true);
    }

    /// Bản mới đổi tên file: tải xong thì file bản cũ bị dọn.
    #[test]
    fn an_update_with_a_new_file_name_removes_the_old_file() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let mut newer = real_sample();
        newer["sequence"] = 4.into();
        let q4 = &mut newer["files"][3];
        q4["file"] = "Hy-MT2-1.8B-Q4_K_M-v2.gguf".into();
        q4["url"] = "files/Hy-MT2-1.8B-Q4_K_M-v2.gguf".into();
        q4["bytes"] = 1_101.into();
        let sha = sha2::Sha256::digest(content("hy-mt2-q4", 1_101));
        q4["sha256"] = sha.iter().map(|b| format!("{b:02x}")).collect::<String>().into();
        publish(&h.server, &newer);
        h.tick_days(1);
        assert_eq!(h.call("load_models", json!({})).unwrap()["updateAvailable"], true);
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        assert!(h.dir().join("Hy-MT2-1.8B-Q4_K_M-v2.gguf").exists());
        assert!(!h.dir().join("Hy-MT2-1.8B-Q4_K_M.gguf").exists(), "bản cũ đã dọn");
    }

    /// "Tải lại" (N7 của review 04): băm lại, chỉ file hỏng phải tải lại; gói đang dùng không bị xóa trước.
    #[test]
    fn verifying_keeps_good_files_and_drops_broken_ones() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let view = h.call("verify_models", json!({ "pack": "lite" })).unwrap();
        assert_eq!(view["packs"][1]["complete"], true);
        let path = h.dir().join("Hy-MT2-1.8B-Q4_K_M.gguf");
        let mut bytes = std::fs::read(&path).unwrap();
        bytes[3] ^= 1;
        std::fs::write(&path, bytes).unwrap();
        let view = h.call("verify_models", json!({ "pack": "lite" })).unwrap();
        assert_eq!(view["packs"][1]["missingBytes"], 1_100, "chỉ file hỏng");
        let before = h.server.requests().len();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let fetched: Vec<_> = h.server.requests()[before..].iter().map(|r| r.path.clone()).collect();
        assert_eq!(fetched, ["/files/Hy-MT2-1.8B-Q4_K_M.gguf"]);
    }

    /// §9: phiên không bắt đầu được vì model nạp lỗi thì app băm lại file của gói đang dùng.
    #[test]
    fn a_session_failing_on_a_broken_model_hashes_the_pack_again() {
        let deps = FakeDeps {
            prepare_error: Some(errors::MODEL_BROKEN),
            ..FakeDeps::default()
        };
        let h = harness_with(deps, |_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        let path = h.dir().join("ggml-small-q5_1.bin");
        let mut bytes = std::fs::read(&path).unwrap();
        bytes[0] ^= 1;
        std::fs::write(&path, bytes).unwrap();
        let refused = h.call("toggle_session", json!({})).unwrap_err();
        assert!(refused.contains("\"code\":\"modelBroken\""), "{refused}");
        let started = Instant::now();
        while h.call("get_models_state", json!({})).unwrap()["packs"][1]["usable"] == true {
            assert!(started.elapsed() < Duration::from_secs(10), "không băm lại");
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(!path.exists(), "file hỏng bị xóa để tải lại");
    }

    #[test]
    fn pausing_without_a_download_does_nothing() {
        let h = harness(|_| {});
        let view = h.call("pause_models_download", json!({})).unwrap();
        assert_eq!(view["job"]["state"], "idle");
        assert!(!h.service().busy());
    }
}
