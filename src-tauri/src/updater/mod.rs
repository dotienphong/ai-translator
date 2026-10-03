//! Tự cập nhật app (F9, spec §6.11; kế hoạch 07b) bằng `tauri-plugin-updater`.
//!
//! - `source`: URL gốc và khóa công khai của bản build này; thiếu một trong hai thì tắt tự cập nhật.
//! - `backend`: kiểm manifest của kênh, tải và kiểm chữ ký (plugin); test dùng bản giả.
//! - Ở đây: kiểm sau khi mở app 1 phút rồi mỗi 24 giờ (giờ máy lùi thì kiểm lại), đổi kênh thì kiểm ngay; có bản mới
//!   thì tải nền vào `app_local_data_dir/updates/`, rồi báo `AppStatus::update_ready`. Cài ở lần thoát kế tiếp do người
//!   dùng chủ động (Thoát ở menu khay, [`user_quits`]), không cài khi hệ điều hành đóng app (tắt máy, đăng xuất: bộ cài có
//!   thể bị kill giữa chừng); [`install_on_exit`] chạy sau khi đã kill tiến trình phụ và lưu lịch sử. Khi app rảnh, cửa
//!   sổ chính và menu khay mời khởi động lại ([`restart_to_update`], đi qua `AppHandle::request_restart`, không bị chặn
//!   thoát).
//! - Trước khi cài, so SHA-256 của file trên đĩa với SHA-256 của đúng các byte đã kiểm chữ ký lúc tải: plugin không kiểm
//!   chữ ký lúc cài, nên file bị thay trong lúc chờ (vài giờ, vài ngày) thì không cài, xóa.
//! - Lỗi mạng hay lỗi tải thì thử lại ở lần thức kế tiếp (mỗi giờ), không hiện gì.
//! - Plugin chỉ dùng từ Rust: không cửa sổ nào được cấp lệnh của plugin (`acl_tests`).
//! - `requireSignedVersion` bật trong `tauri.conf.json`: chữ ký phải gắn đúng phiên bản mà manifest báo, để manifest
//!   bị sửa không ghép được số phiên bản mới với bộ cài cũ.

pub mod backend;
pub mod source;

use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::models::service::ModelService;
use crate::settings::UpdateChannel;
use crate::state::{AppState, SessionStatus};
use crate::{actions, overlay, session};
use backend::{Backend, Downloaded, Install, PluginBackend};
use sha2::{Digest, Sha256};
use source::Source;

/// Kiểm lại sau chừng này giây (§6.11: mỗi 24 giờ).
pub const CHECK_EVERY_SECS: u64 = 24 * 3600;
/// Lần kiểm đầu sau khi mở app: chờ một chút để không tranh mạng với các việc lúc khởi động.
pub const FIRST_CHECK_AFTER: Duration = Duration::from_secs(60);
/// Luồng nền thức dậy mỗi giờ để xem đã tới hạn chưa (máy ngủ thì đồng hồ đơn điệu dừng, nên so theo giờ máy).
pub const WAKE_EVERY: Duration = Duration::from_secs(3600);

/// Plugin với khóa công khai của bản build này (chuỗi rỗng khi chưa có khóa; khi đó app không bao giờ gọi plugin).
pub fn plugin<R: Runtime>() -> TauriPlugin<R, tauri_plugin_updater::Config> {
    let pubkey = source::for_this_build().map(|s| s.pubkey).unwrap_or_default();
    tauri_plugin_updater::Builder::new().pubkey(pubkey).build()
}

/// Đã tới lúc kiểm chưa: chưa kiểm được lần nào, đã qua 24 giờ, hay giờ máy lùi về trước lần kiểm.
pub fn due(last: Option<u64>, now: u64) -> bool {
    last.is_none_or(|last| now < last || now - last >= CHECK_EVERY_SECS)
}

/// Bản đã tải, chữ ký đúng, chờ cài.
struct Pending {
    version: String,
    channel: UpdateChannel,
    file: PathBuf,
    installer: Box<dyn Install>,
    /// SHA-256 của các byte đã kiểm chữ ký lúc tải.
    sha256: [u8; 32],
}

#[derive(Default)]
struct Inner {
    /// Lần kiểm thành công gần nhất (giây Unix) và kênh của lần đó.
    last_check: Option<u64>,
    checked_channel: Option<UpdateChannel>,
    pending: Option<Pending>,
    /// Người dùng chủ động thoát hay khởi động lại để cập nhật: chỉ khi đó mới cài lúc thoát.
    user_exit: bool,
    /// Đang khởi động lại để cập nhật: Windows cho bộ cài mở lại app sau khi cài.
    restart: bool,
    woken: bool,
}

/// Trạng thái tự cập nhật, quản lý bằng `app.manage(Arc<Updater>)`; không có khi tự cập nhật tắt.
pub struct Updater {
    source: Source,
    backend: Box<dyn Backend>,
    dir: PathBuf,
    now: Box<dyn Fn() -> u64 + Send + Sync>,
    inner: Mutex<Inner>,
    wake: Condvar,
}

impl Updater {
    /// `dir`: nơi ghi bản đã tải. Bản tải ở lần chạy trước bị xóa: nó chỉ cài được qua đối tượng của plugin trong bộ
    /// nhớ, và lần chạy này sẽ kiểm lại.
    pub fn new(
        source: Source,
        backend: Box<dyn Backend>,
        dir: PathBuf,
        now: Box<dyn Fn() -> u64 + Send + Sync>,
    ) -> Self {
        let _ = std::fs::remove_dir_all(&dir);
        Self {
            source,
            backend,
            dir,
            now,
            inner: Mutex::new(Inner::default()),
            wake: Condvar::new(),
        }
    }

    /// Phiên bản đã tải xong, chờ cài.
    pub fn ready(&self) -> Option<String> {
        self.inner.lock().unwrap().pending.as_ref().map(|p| p.version.clone())
    }

    /// Một lượt của luồng nền với kênh đang chọn. Trả `true` khi bản chờ cài đổi (phải báo lại giao diện).
    pub fn tick(&self, channel: UpdateChannel) -> bool {
        let mut changed = false;
        {
            let mut inner = self.inner.lock().unwrap();
            // Đổi kênh: bản đã tải của kênh cũ không cài nữa (ví dụ từ beta về stable).
            if inner.pending.as_ref().is_some_and(|p| p.channel != channel) {
                drop_pending(&mut inner);
                changed = true;
            }
            if inner.checked_channel == Some(channel) && !due(inner.last_check, (self.now)()) {
                return changed;
            }
        }
        let endpoint = source::endpoint(&self.source.base, channel);
        let found = match self.backend.check(&endpoint, channel) {
            Ok(found) => found,
            Err(e) => {
                log::warn!("không kiểm được bản cập nhật ({endpoint}): {e}");
                return changed;
            }
        };
        let Some(found) = found else {
            self.checked(channel);
            // Không có bản nào mới hơn bản đang chạy: bản đã tải (nếu có) đã bị rút khỏi kênh, không cài nữa.
            let mut inner = self.inner.lock().unwrap();
            if inner.pending.is_some() {
                log::info!("bản cập nhật đã tải không còn trong kênh, bỏ");
                drop_pending(&mut inner);
                changed = true;
            }
            return changed;
        };
        let version = found.version().to_string();
        if self.ready().as_deref() == Some(version.as_str()) {
            self.checked(channel);
            return changed;
        }
        log::info!("có bản cập nhật {version}, đang tải");
        let file = self.dir.join(format!("{version}.bin"));
        match found.download(&file) {
            Ok(Downloaded { installer, sha256 }) => {
                self.checked(channel);
                let mut inner = self.inner.lock().unwrap();
                drop_pending(&mut inner);
                inner.pending = Some(Pending {
                    version,
                    channel,
                    file,
                    installer,
                    sha256,
                });
                true
            }
            Err(e) => {
                log::warn!("không tải được bản cập nhật {version}: {e}");
                changed
            }
        }
    }

    fn checked(&self, channel: UpdateChannel) {
        let mut inner = self.inner.lock().unwrap();
        inner.last_check = Some((self.now)());
        inner.checked_channel = Some(channel);
    }

    /// Đánh thức luồng nền (đổi kênh).
    pub fn wake(&self) {
        self.inner.lock().unwrap().woken = true;
        self.wake.notify_all();
    }

    /// Chờ tới khi bị đánh thức hay hết `timeout`.
    pub fn wait(&self, timeout: Duration) {
        let inner = self.inner.lock().unwrap();
        let (mut inner, _) = self.wake.wait_timeout_while(inner, timeout, |i| !i.woken).unwrap();
        inner.woken = false;
    }

    /// Cài bản đã tải (lúc app thoát). Windows: hàm không trả về khi bộ cài chạy được (plugin thoát tiến trình).
    pub fn install_pending(&self) {
        let (pending, restart) = {
            let mut inner = self.inner.lock().unwrap();
            if inner.pending.is_some() && !inner.user_exit {
                log::info!("app thoát không do người dùng (tắt máy, đăng xuất): không cài, lần mở sau kiểm lại");
                return;
            }
            (inner.pending.take(), inner.restart)
        };
        let Some(pending) = pending else { return };
        log::info!("cài bản cập nhật {}", pending.version);
        let result = std::fs::read(&pending.file)
            .map_err(|e| e.to_string())
            .and_then(|bytes| {
                if <[u8; 32]>::from(Sha256::digest(&bytes)) != pending.sha256 {
                    return Err("file trên đĩa khác bản đã kiểm chữ ký lúc tải, không cài".into());
                }
                pending.installer.install(&bytes, restart)
            });
        if let Err(e) = result {
            log::error!("không cài được bản cập nhật {}: {e}", pending.version);
        }
        let _ = std::fs::remove_file(&pending.file);
    }

    /// Người dùng chủ động thoát (menu khay): lần thoát này được cài bản đã tải.
    pub fn allow_install(&self) {
        self.inner.lock().unwrap().user_exit = true;
    }

    fn set_restart(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.user_exit = true;
        inner.restart = true;
    }
}

fn drop_pending(inner: &mut Inner) {
    if let Some(old) = inner.pending.take() {
        let _ = std::fs::remove_file(&old.file);
    }
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Bật tự cập nhật khi bản build này có nguồn (URL gốc và khóa), rồi chạy luồng nền. Gọi một lần trong `setup`, sau khi
/// có `AppState`.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(source) = source::for_this_build() else {
        log::info!("tự cập nhật tắt: bản build này chưa có URL gốc hay khóa công khai");
        return Ok(());
    };
    let dir = app.path().app_local_data_dir()?.join("updates");
    let updater = Arc::new(Updater::new(
        source,
        Box::new(PluginBackend(app.clone())),
        dir,
        Box::new(unix_now),
    ));
    app.manage(updater.clone());
    let app = app.clone();
    std::thread::spawn(move || {
        updater.wait(FIRST_CHECK_AFTER);
        loop {
            let channel = app.state::<AppState>().settings().update_channel;
            if updater.tick(channel) {
                publish(&app);
            }
            updater.wait(WAKE_EVERY);
        }
    });
    Ok(())
}

/// Ghi phiên bản chờ cài vào trạng thái app, báo giao diện và menu khay.
pub fn publish<R: Runtime>(app: &AppHandle<R>) {
    let ready = app.try_state::<Arc<Updater>>().and_then(|u| u.ready());
    app.state::<AppState>().update_status(|s| s.update_ready = ready);
    actions::status_changed(app);
}

/// Người dùng vừa đổi kênh cập nhật: kiểm ngay.
pub fn channel_changed<R: Runtime>(app: &AppHandle<R>) {
    if let Some(updater) = app.try_state::<Arc<Updater>>() {
        updater.wake();
    }
}

/// Người dùng chọn Thoát (menu khay): cho phép cài bản đã tải lúc thoát.
pub fn user_quits<R: Runtime>(app: &AppHandle<R>) {
    if let Some(updater) = app.try_state::<Arc<Updater>>() {
        updater.allow_install();
    }
}

/// Lúc app thoát (`RunEvent::Exit`), sau khi đã kill tiến trình phụ và lưu lịch sử. Chỉ cài khi người dùng chủ động thoát
/// hay khởi động lại để cập nhật.
pub fn install_on_exit<R: Runtime>(app: &AppHandle<R>) {
    if let Some(updater) = app.try_state::<Arc<Updater>>() {
        updater.install_pending();
    }
}

/// Khởi động lại để cập nhật (cửa sổ chính, menu khay). Chỉ khi đã có bản tải xong và app rảnh: không đang dịch, không
/// đang tải model. Dừng như Thoát ở menu khay rồi gọi `restart` (bản thật: `AppHandle::request_restart`; test truyền
/// bản giả). `RunEvent::Exit` sau đó cài bản mới.
pub fn restart_to_update<R: Runtime>(app: &AppHandle<R>, restart: fn(&AppHandle<R>)) -> Result<(), CommandError> {
    let Some(updater) = app.try_state::<Arc<Updater>>() else {
        return Err(CommandError::new(errors::UPDATE_NOT_READY, None, "tự cập nhật tắt"));
    };
    if updater.ready().is_none() {
        return Err(CommandError::new(
            errors::UPDATE_NOT_READY,
            None,
            "chưa có bản cập nhật đã tải",
        ));
    }
    let session = app.state::<AppState>().status().session;
    let models_busy = app.try_state::<Arc<ModelService>>().is_some_and(|m| m.busy());
    if !matches!(session, SessionStatus::Idle | SessionStatus::Error) || models_busy {
        return Err(CommandError::new(
            errors::UPDATE_BUSY,
            None,
            format!("đang dịch hay đang tải model ({session:?}, model: {models_busy})"),
        ));
    }
    updater.set_restart();
    overlay::remember_position(app);
    log::info!("khởi động lại để cập nhật");
    let app = app.clone();
    std::thread::spawn(move || {
        session::shutdown(&app);
        restart(&app);
    });
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::path::Path;
    use std::sync::atomic::{AtomicU64, Ordering};

    use backend::Found;
    use reqwest::Url;

    pub const NOW: u64 = 1_790_000_000;

    /// Kết quả giả cho một lần `check`.
    pub enum Answer {
        Newer(&'static str),
        NewerButDownloadFails(&'static str),
        UpToDate,
        Offline,
    }

    /// Mọi việc bản giả ghi lại: `check <url>`, `download <phiên bản>`, `install <phiên bản> <nội dung> <restart>`.
    pub type Log = Arc<Mutex<Vec<String>>>;

    pub struct FakeBackend {
        answers: Mutex<VecDeque<Answer>>,
        log: Log,
    }

    impl Backend for FakeBackend {
        fn check(&self, endpoint: &Url, _channel: UpdateChannel) -> Result<Option<Box<dyn Found>>, String> {
            self.log.lock().unwrap().push(format!("check {endpoint}"));
            match self.answers.lock().unwrap().pop_front().unwrap_or(Answer::UpToDate) {
                Answer::Newer(v) => Ok(Some(Box::new(FakeFound(v, true, self.log.clone())))),
                Answer::NewerButDownloadFails(v) => Ok(Some(Box::new(FakeFound(v, false, self.log.clone())))),
                Answer::UpToDate => Ok(None),
                Answer::Offline => Err("mất mạng".into()),
            }
        }
    }

    struct FakeFound(&'static str, bool, Log);

    impl Found for FakeFound {
        fn version(&self) -> &str {
            self.0
        }

        fn download(self: Box<Self>, dest: &Path) -> Result<Downloaded, String> {
            self.2.lock().unwrap().push(format!("download {}", self.0));
            if !self.1 {
                return Err("rớt mạng".into());
            }
            let bytes = format!("bộ cài {}", self.0);
            backend::write_atomically(dest, bytes.as_bytes())?;
            Ok(Downloaded {
                installer: Box::new(FakeInstall(self.0, self.2)),
                sha256: Sha256::digest(bytes.as_bytes()).into(),
            })
        }
    }

    struct FakeInstall(&'static str, Log);

    impl Install for FakeInstall {
        fn install(&self, bytes: &[u8], restart: bool) -> Result<(), String> {
            let text = String::from_utf8_lossy(bytes);
            self.1
                .lock()
                .unwrap()
                .push(format!("install {} [{text}] restart={restart}", self.0));
            Ok(())
        }
    }

    /// Updater với bản giả, thư mục tạm riêng, đồng hồ `clock`.
    pub fn fake(answers: Vec<Answer>, clock: Arc<AtomicU64>) -> (Updater, Log, PathBuf) {
        fake_with_log(answers, clock, Log::default())
    }

    /// Như [`fake`], ghi vào `log` có sẵn (test của app ghi cả việc khác vào cùng chỗ, để so thứ tự).
    pub fn fake_with_log(answers: Vec<Answer>, clock: Arc<AtomicU64>, log: Log) -> (Updater, Log, PathBuf) {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "mt-updates-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        let source = Source {
            base: Url::parse("https://releases.example.com/desktop/").unwrap(),
            pubkey: "khóa".into(),
        };
        let backend = FakeBackend {
            answers: Mutex::new(answers.into()),
            log: log.clone(),
        };
        let updater = Updater::new(
            source,
            Box::new(backend),
            dir.clone(),
            Box::new(move || clock.load(Ordering::SeqCst)),
        );
        (updater, log, dir)
    }

    fn take(log: &Log) -> Vec<String> {
        std::mem::take(&mut *log.lock().unwrap())
    }

    const STABLE: &str = "check https://releases.example.com/desktop/stable/latest.json";
    const BETA: &str = "check https://releases.example.com/desktop/beta/latest.json";

    #[test]
    fn due_after_a_day_or_when_the_clock_goes_back() {
        assert!(due(None, NOW));
        assert!(!due(Some(NOW), NOW + CHECK_EVERY_SECS - 1));
        assert!(due(Some(NOW), NOW + CHECK_EVERY_SECS));
        assert!(due(Some(NOW), NOW - 1));
    }

    #[test]
    fn checks_once_a_day_and_downloads_each_version_once() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, dir) = fake(vec![Answer::Newer("0.2.0"), Answer::Newer("0.2.0")], clock.clone());
        assert!(u.tick(UpdateChannel::Stable));
        assert_eq!(take(&log), [STABLE, "download 0.2.0"]);
        assert_eq!(u.ready().as_deref(), Some("0.2.0"));
        assert_eq!(std::fs::read_to_string(dir.join("0.2.0.bin")).unwrap(), "bộ cài 0.2.0");
        clock.store(NOW + CHECK_EVERY_SECS - 1, Ordering::SeqCst);
        assert!(!u.tick(UpdateChannel::Stable));
        assert!(take(&log).is_empty(), "chưa tới 24 giờ thì không gọi mạng");
        clock.store(NOW + CHECK_EVERY_SECS, Ordering::SeqCst);
        assert!(!u.tick(UpdateChannel::Stable), "manifest vẫn báo 0.2.0: không tải lại");
        assert_eq!(take(&log), [STABLE]);
    }

    #[test]
    fn a_newer_release_replaces_the_downloaded_one() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, dir) = fake(vec![Answer::Newer("0.2.0"), Answer::Newer("0.2.1")], clock.clone());
        u.tick(UpdateChannel::Stable);
        clock.store(NOW + CHECK_EVERY_SECS, Ordering::SeqCst);
        assert!(u.tick(UpdateChannel::Stable));
        assert_eq!(u.ready().as_deref(), Some("0.2.1"));
        assert!(!dir.join("0.2.0.bin").exists());
        assert!(dir.join("0.2.1.bin").exists());
        assert_eq!(take(&log), [STABLE, "download 0.2.0", STABLE, "download 0.2.1"]);
    }

    #[test]
    fn network_errors_retry_at_the_next_wake_and_keep_the_download() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, _dir) = fake(
            vec![
                Answer::Offline,
                Answer::NewerButDownloadFails("0.2.0"),
                Answer::Newer("0.2.0"),
                Answer::Offline,
            ],
            clock.clone(),
        );
        assert!(!u.tick(UpdateChannel::Stable));
        assert!(!u.tick(UpdateChannel::Stable), "lỗi tải: chưa có gì để cài");
        assert_eq!(u.ready(), None);
        assert!(
            u.tick(UpdateChannel::Stable),
            "lần thức sau thử lại ngay, không chờ 24 giờ"
        );
        clock.store(NOW + CHECK_EVERY_SECS, Ordering::SeqCst);
        assert!(!u.tick(UpdateChannel::Stable));
        assert_eq!(u.ready().as_deref(), Some("0.2.0"), "mất mạng không bỏ bản đã tải");
        assert_eq!(
            take(&log),
            [STABLE, STABLE, "download 0.2.0", STABLE, "download 0.2.0", STABLE]
        );
    }

    #[test]
    fn a_release_pulled_from_the_channel_is_not_installed() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, _log, dir) = fake(vec![Answer::Newer("0.2.0"), Answer::UpToDate], clock.clone());
        u.tick(UpdateChannel::Stable);
        clock.store(NOW + CHECK_EVERY_SECS, Ordering::SeqCst);
        assert!(u.tick(UpdateChannel::Stable));
        assert_eq!(u.ready(), None);
        assert!(!dir.join("0.2.0.bin").exists());
    }

    #[test]
    fn switching_channel_drops_the_download_and_checks_at_once() {
        let clock = Arc::new(AtomicU64::new(NOW));
        // Kênh mới không kiểm được (mất mạng): bản đã tải của kênh cũ vẫn phải bỏ.
        let (u, log, dir) = fake(vec![Answer::Newer("0.3.0-beta.1"), Answer::Offline], clock);
        u.tick(UpdateChannel::Beta);
        assert_eq!(take(&log), [BETA, "download 0.3.0-beta.1"]);
        assert!(u.tick(UpdateChannel::Stable), "bản beta đã tải bị bỏ khi về stable");
        assert_eq!(u.ready(), None);
        assert!(!dir.join("0.3.0-beta.1.bin").exists());
        assert_eq!(take(&log), [STABLE], "kiểm kênh mới ngay, không chờ 24 giờ");
    }

    #[test]
    fn installs_the_downloaded_file_once_and_cleans_up() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, dir) = fake(vec![Answer::Newer("0.2.0")], clock);
        u.allow_install();
        u.install_pending();
        assert!(take(&log).is_empty(), "chưa có bản nào thì không cài gì");
        u.tick(UpdateChannel::Stable);
        take(&log);
        u.install_pending();
        assert_eq!(take(&log), ["install 0.2.0 [bộ cài 0.2.0] restart=false"]);
        assert!(!dir.join("0.2.0.bin").exists());
        u.install_pending();
        assert!(take(&log).is_empty(), "chỉ cài một lần");
    }

    #[test]
    fn exiting_without_the_user_asking_installs_nothing() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, dir) = fake(vec![Answer::Newer("0.2.0")], clock);
        u.tick(UpdateChannel::Stable);
        take(&log);
        u.install_pending();
        assert!(take(&log).is_empty(), "tắt máy, đăng xuất: không cài");
        assert_eq!(u.ready().as_deref(), Some("0.2.0"));
        assert!(dir.join("0.2.0.bin").exists());
    }

    #[test]
    fn a_file_changed_on_disk_is_never_installed() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, log, dir) = fake(vec![Answer::Newer("0.2.0")], clock);
        u.tick(UpdateChannel::Stable);
        take(&log);
        std::fs::write(dir.join("0.2.0.bin"), "bộ cài khác").unwrap();
        u.allow_install();
        u.install_pending();
        assert!(take(&log).is_empty(), "không cài file đã bị thay");
        assert!(!dir.join("0.2.0.bin").exists(), "file bị thay đã xóa");
        assert_eq!(u.ready(), None);
    }

    #[test]
    fn a_new_run_forgets_the_previous_download() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, _log, dir) = fake(vec![Answer::Newer("0.2.0")], clock.clone());
        u.tick(UpdateChannel::Stable);
        assert!(dir.join("0.2.0.bin").exists());
        let source = u.source.clone();
        let again = Updater::new(
            source,
            Box::new(FakeBackend {
                answers: Mutex::default(),
                log: Log::default(),
            }),
            dir.clone(),
            Box::new(|| NOW),
        );
        assert_eq!(again.ready(), None);
        assert!(!dir.exists());
    }

    #[test]
    fn wake_ends_the_wait_early() {
        let clock = Arc::new(AtomicU64::new(NOW));
        let (u, _log, _dir) = fake(vec![], clock);
        let u = Arc::new(u);
        let waiter = u.clone();
        let started = std::time::Instant::now();
        let handle = std::thread::spawn(move || waiter.wait(Duration::from_secs(30)));
        std::thread::sleep(Duration::from_millis(50));
        u.wake();
        handle.join().unwrap();
        assert!(started.elapsed() < Duration::from_secs(10));
        let started = std::time::Instant::now();
        u.wait(Duration::from_millis(50));
        assert!(
            started.elapsed() >= Duration::from_millis(50),
            "đánh thức chỉ có tác dụng một lần"
        );
    }
}
