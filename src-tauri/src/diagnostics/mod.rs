//! Báo cáo lỗi gửi về nhà phát triển (spec 2026-10-17-diagnostics-reports-design.md; kế hoạch bao-cao-loi-03).
//!
//! App tự gửi một báo cáo đã che dữ liệu cá nhân khi gặp lỗi của chính nó, và người dùng gửi tay được từ màn hình Giới thiệu.
//! Cam kết (spec §1, §2): không bao giờ có âm thanh, chữ chép lời, bản dịch, key, token, email, tên tài khoản hay đường dẫn
//! thư mục cá nhân trong báo cáo; không gửi trong lúc đang dịch; mỗi máy tối đa 1 báo cáo mỗi dấu vân tay mỗi 24 giờ và 5 báo
//! cáo mỗi ngày; bản debug không tự gửi trừ khi bật công tắc dev.
//!
//! - [`scrub`]: che dữ liệu và phát hiện dữ liệu còn sót (chung vector với server);
//! - [`logs`]: chọn dòng log đưa vào báo cáo; [`machine`]: hệ điều hành và chip;
//! - [`report`]: dựng JSON đúng hợp đồng của `POST /v1/diagnostics`, trong 64 KB, fail closed;
//! - [`queue`]: hàng đợi trên đĩa và giới hạn; [`send`]: gửi HTTP; [`marker`]: dấu vết của lần chạy trước (crash);
//! - [`reporter`]: lõi nối các phần trên, không phụ thuộc Tauri; file này là phần ghép với app (điểm kích hoạt, trạng thái
//!   quản lý bằng `app.manage`, lệnh `send_log_report`).

pub mod logs;
pub mod machine;
pub mod marker;
pub mod queue;
pub mod report;
pub mod reporter;
pub mod scrub;
pub mod send;

use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use asr_protocol::Backend;
use pipeline::supervisor::Which;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use self::logs::FileLogs;
use self::marker::{PreviousRun, RunFiles};
use self::queue::Queue;
use self::report::{Event, Facts, Kind};
use self::reporter::{Host, ManualError, Reporter};
use self::scrub::Params;
use self::send::{HttpReportApi, SendError};
use crate::errors::{self, CommandError};
use crate::license::{app as license_app, device};
use crate::models::machine as models_machine;
use crate::settings::UiLanguage;
use crate::state::{AppState, SessionStatus};

/// Chờ bấy nhiêu giây sau khi mở app rồi mới gửi lần đầu (spec §1).
pub const FIRST_SEND_DELAY_SECS: u64 = 10;
/// Nhịp kiểm hàng đợi để gửi, giây.
pub const FLUSH_EVERY_SECS: u64 = 30;
/// Chờ trước khi đọc log của một sự kiện, để dòng log của chính lỗi đó kịp ghi xuống file.
const LOG_FLUSH_DELAY: Duration = Duration::from_millis(500);

/// Biến môi trường của công tắc dev: đúng `true` thì bản debug tự gửi báo cáo lỗi (tới production, như mọi bản build). Chỉ bản
/// debug có biến này: bản phát hành không có mã đọc nó và không có cả tên biến (`release-check.mjs no-dev-gate` chặn nếu lọt
/// vào, cùng cơ chế với `AI_TRANSLATOR_DEV_PRO` ở `pro.rs`).
#[cfg(debug_assertions)]
pub const DEV_REPORTS_ENV: &str = "AI_TRANSLATOR_DEV_REPORTS";

/// Công tắc dev bật khi nào: chỉ giá trị đúng `true` (phân biệt hoa thường).
#[cfg(debug_assertions)]
fn switch_on(value: Option<&str>) -> bool {
    value == Some("true")
}

/// Công tắc dev đang bật: chỉ bản debug có `AI_TRANSLATOR_DEV_REPORTS=true`. Bản phát hành luôn `false`.
pub fn dev_reports() -> bool {
    #[cfg(debug_assertions)]
    {
        switch_on(std::env::var(DEV_REPORTS_ENV).ok().as_deref())
    }
    #[cfg(not(debug_assertions))]
    {
        false
    }
}

/// Bản build này cho phép báo cáo tự động không: bản phát hành luôn; bản debug chỉ khi công tắc dev bật. (Cài đặt
/// `sendErrorReports` của người dùng là điều kiện riêng.) Gửi tay không phụ thuộc điều này.
pub fn auto_allowed_in_this_build() -> bool {
    !cfg!(debug_assertions) || dev_reports()
}

/// Mã lỗi phiên dịch **có** gửi báo cáo: lỗi của chính app (spec §1).
pub const REPORTED_CODES: &[&str] = &[
    errors::SIDECAR_FAILED,
    errors::SIDECAR_MISSING,
    errors::SIDECAR_TAMPERED,
    errors::MODEL_BROKEN,
    errors::VAD_FAILED,
    errors::CAPTURE_FAILED,
    errors::DATA_UNAVAILABLE,
    errors::UNKNOWN,
];

/// Mã lỗi **không** gửi: do môi trường hay người dùng (quyền ghi âm, hạn mức, dùng thử, key, mạng, dung lượng, model chưa
/// tải…), lỗi phím tắt, cài đặt, mở file, cập nhật và chính lỗi gửi báo cáo. Test `every_error_code_is_classified_exactly_once`
/// buộc mọi mã trong `errors.rs` nằm đúng một trong hai danh sách: thêm mã mới thì phải quyết định.
pub const SKIPPED_CODES: &[&str] = &[
    errors::AUTOSTART_FAILED,
    errors::AUTOSTART_STILL_ENABLED,
    errors::OVERLAY_FAILED,
    errors::OPEN_FAILED,
    errors::UNSUPPORTED,
    errors::MODEL_MISSING,
    errors::AUDIO_PERMISSION,
    errors::APP_NOT_PLAYING,
    // Quyền micro, micro không có hay bị giữ (spec 2026-10-24-nguon-micro §7): do môi trường, như quyền ghi âm.
    errors::MIC_PERMISSION,
    errors::MIC_UNAVAILABLE,
    errors::QUOTA_EXHAUSTED,
    errors::TRIAL_ENDED,
    errors::TRIAL_NEEDS_NETWORK,
    errors::CLOCK_ROLLED_BACK,
    errors::LICENSE_CONFLICT,
    errors::LICENSE_INVALID,
    errors::LICENSE_NEEDS_REFRESH,
    errors::PRO_REQUIRED,
    errors::FILE_FAILED,
    errors::FILE_TOO_LARGE,
    errors::UPDATE_NOT_READY,
    errors::UPDATE_BUSY,
    errors::MODELS_NO_SOURCE,
    errors::MODELS_OFFLINE,
    errors::MODELS_MANIFEST_INVALID,
    errors::MODELS_UNKNOWN_PACK,
    errors::MODELS_APP_TOO_OLD,
    errors::MODELS_NO_SPACE,
    errors::MODELS_BUSY,
    errors::MODELS_IN_USE,
    errors::MODELS_DOWNLOAD_FAILED,
    errors::MODELS_CHECKSUM,
    errors::MODELS_DISK,
    errors::MODELS_UNSUPPORTED,
    errors::REPORT_FAILED,
    errors::REPORT_RATE_LIMITED,
    errors::REPORT_REJECTED,
    // Gõ dịch (spec 2026-10-17-go-dich §5): ô soạn tự báo; tiến trình phụ chết vẫn được báo qua `sidecar_died`.
    errors::COMPOSE_TOO_LONG,
    errors::COMPOSE_FAILED,
    errors::COMPOSE_UNAVAILABLE,
    errors::COPY_FAILED,
    // Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4): lỗi mạng hay lỗi của server, màn hình Hỗ trợ tự báo.
    errors::SUPPORT_OFFLINE,
    errors::SUPPORT_RATE_LIMITED,
    errors::SUPPORT_BUSY,
    errors::SUPPORT_DISABLED,
    errors::SUPPORT_CLOSED,
    errors::SUPPORT_EXPIRED,
    errors::SUPPORT_INVALID,
    // Đổi tên, gộp người nói (spec 2026-10-26-phan-biet-nguoi-noi §8.2): phiên đã dừng hay giọng không còn, giao diện tự báo.
    errors::SPEAKER_NOT_FOUND,
    errors::SPEAKER_SAME,
];

/// Mã lỗi này có gửi báo cáo không.
pub fn is_reported(code: &str) -> bool {
    REPORTED_CODES.contains(&code)
}

/// Backend GPU của `asr-worker` lần chạy gần nhất (`metal`, `vulkan`, `cpu`); `None` nếu chưa chạy lần nào. Quản lý bằng
/// `app.manage`, nên mỗi app (kể cả app giả của test) có bản riêng.
#[derive(Default)]
pub struct AsrBackendNote(Mutex<Option<&'static str>>);

/// `asr-worker` vừa sẵn sàng (`SidecarEvent::Ready`): nhớ backend thật của nó cho báo cáo.
pub fn note_asr_backend<R: Runtime>(app: &AppHandle<R>, backend: Option<Backend>) {
    if let Some(note) = app.try_state::<AsrBackendNote>() {
        *note.0.lock().unwrap() = backend.map(Backend::as_str);
    }
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// Gói bản quyền được phép gửi (không bao giờ có key).
const PLAN_CODES: [&str; 4] = ["free", "monthly", "six_months", "yearly"];

/// Những gì lõi cần biết về app, đọc từ trạng thái quản lý của Tauri mỗi lần dùng.
struct AppHost<R: Runtime> {
    app: AppHandle<R>,
    /// Bản build này cho phép báo cáo tự động (`auto_allowed_in_this_build`); test đặt `true`.
    build_allows_auto: bool,
    /// `device_id_hash` của máy, đọc một lần (hỏi hệ điều hành mã phần cứng).
    device_hash: OnceLock<Option<String>>,
}

impl<R: Runtime> AppHost<R> {
    fn new(app: AppHandle<R>, build_allows_auto: bool) -> Self {
        Self {
            app,
            build_allows_auto,
            device_hash: OnceLock::new(),
        }
    }
}

impl<R: Runtime> Host for AppHost<R> {
    fn auto_enabled(&self) -> bool {
        self.build_allows_auto
            && self
                .app
                .try_state::<AppState>()
                .is_some_and(|state| state.settings().send_error_reports)
    }

    /// Rảnh: không có phiên nào đang bắt đầu hay chạy. Dừng phiên giữ trạng thái `Running` cho tới khi xong (câu cuối còn
    /// được dịch), nên `Idle` và `Error` là lúc không còn gì dịch.
    fn translation_idle(&self) -> bool {
        self.app
            .try_state::<AppState>()
            .is_some_and(|state| matches!(state.status().session, SessionStatus::Idle | SessionStatus::Error))
    }

    fn facts(&self) -> Option<Facts> {
        let settings = self.app.try_state::<AppState>()?.settings();
        let device_id_hash = self
            .device_hash
            .get_or_init(|| device::hardware_id().ok().map(|id| device::hash_id(&id)))
            .clone()?;
        let system = machine::system_info();
        let model_pack = settings
            .model_tier
            .as_deref()
            .filter(|p| {
                p.len() <= 64
                    && p.chars()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
            })
            .map(str::to_string);
        let plan = license_app::view(&self.app)
            .map(|view| view.plan)
            .filter(|plan| PLAN_CODES.contains(&plan.as_str()));
        Some(Facts {
            app_version: self.app.package_info().version.to_string(),
            build: if cfg!(debug_assertions) { "debug" } else { "release" },
            os_name: system.os_name.to_string(),
            os_version: report::clean_meta(&system.os_version, 64).unwrap_or_else(|| "unknown".to_string()),
            arch: system.arch.to_string(),
            chip: system.chip.and_then(|chip| report::clean_meta(&chip, 128)),
            ram_mb: models_machine::total_ram_bytes().map(|bytes| bytes >> 20),
            gpu_backend: self
                .app
                .try_state::<AsrBackendNote>()
                .and_then(|note| *note.0.lock().unwrap())
                .map(str::to_string),
            model_pack,
            plan,
            ui_lang: match settings.ui_language {
                UiLanguage::En => "en",
                UiLanguage::Vi => "vi",
                UiLanguage::Ja => "ja",
                UiLanguage::Zh => "zh",
                UiLanguage::Ko => "ko",
            }
            .to_string(),
            device_id_hash,
        })
    }

    fn now(&self) -> i64 {
        unix_now()
    }
}

/// Cài báo cáo lỗi lúc khởi động (`setup`, sau khi đã có `AppState`, bản quyền và `Session`): tạo `Reporter`, cài panic hook,
/// phân loại lần chạy trước (báo `crash` nếu cần), đặt dấu "đang chạy" của lần này, và chạy luồng gửi nền.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let dir = app.path().app_local_data_dir()?.join("reports");
    let log_dir = app.path().app_log_dir()?;
    #[cfg(debug_assertions)]
    if dev_reports() {
        log::warn!("{DEV_REPORTS_ENV}=true: bản debug này TỰ GỬI báo cáo lỗi tới production (khi bật ở Cài đặt)");
    }
    let reporter = Arc::new(Reporter::new(
        Box::new(AppHost::new(app.clone(), auto_allowed_in_this_build())),
        Box::new(FileLogs { dir: log_dir }),
        Box::new(HttpReportApi::for_this_build()),
        Params::current(device::label()),
        Queue::new(dir.clone()),
        LOG_FLUSH_DELAY,
    ));
    app.manage(Arc::clone(&reporter));
    app.manage(AsrBackendNote::default());
    let files = RunFiles::new(dir);
    app.manage(files.clone());
    marker::install_panic_dump(files.clone());
    let now = unix_now();
    let previous = files.begin_run(
        now,
        marker::boot_time_secs(now),
        &app.package_info().version.to_string(),
    );
    report_previous_run(&reporter, previous, now);
    spawn_sender(reporter);
    Ok(())
}

/// Sự kiện `crash` của lần chạy trước, nếu có: panic (vị trí và câu panic từ `panic.json`) hay thoát không bình thường.
fn crash_event(previous: PreviousRun, now: i64) -> Option<Event> {
    match previous {
        PreviousRun::Panicked { at, location, message } => Some(Event {
            kind: Kind::Crash,
            code: Some("panic".to_string()),
            location,
            message,
            at,
        }),
        PreviousRun::Unclean { .. } => Some(Event {
            kind: Kind::Crash,
            code: Some("unclean_exit".to_string()),
            location: "unclean".to_string(),
            message: "app thoát không bình thường ở lần chạy trước".to_string(),
            at: now,
        }),
        PreviousRun::Clean | PreviousRun::RebootedSince => None,
    }
}

/// Báo `crash` của lần chạy trước trên luồng nền (đọc log và che mất cỡ chục mili giây, không làm chậm lúc khởi động).
fn report_previous_run(reporter: &Arc<Reporter>, previous: PreviousRun, now: i64) {
    let Some(event) = crash_event(previous, now) else {
        return;
    };
    let reporter = Arc::clone(reporter);
    std::thread::spawn(move || {
        reporter.record(event);
    });
}

/// Luồng gửi nền: đợi `FIRST_SEND_DELAY_SECS` rồi kiểm hàng đợi mỗi `FLUSH_EVERY_SECS`. Lõi chỉ gửi khi tự động bật và app rảnh.
fn spawn_sender(reporter: Arc<Reporter>) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(FIRST_SEND_DELAY_SECS));
        loop {
            reporter.flush();
            std::thread::sleep(Duration::from_secs(FLUSH_EVERY_SECS));
        }
    });
}

fn reporter_of<R: Runtime>(app: &AppHandle<R>) -> Option<Arc<Reporter>> {
    app.try_state::<Arc<Reporter>>().map(|r| Arc::clone(&r))
}

/// Phiên dịch dừng hay không bắt đầu được vì lỗi `code` (`session.rs`). Chỉ mã lỗi của chính app (`REPORTED_CODES`) và khi
/// tự động bật mới tạo luồng dựng báo cáo.
pub fn on_session_error<R: Runtime>(app: &AppHandle<R>, code: &str, message: &str) {
    if !is_reported(code) {
        return;
    }
    let Some(reporter) = reporter_of(app) else {
        return;
    };
    if !reporter.auto_enabled() {
        return;
    }
    let event = Event {
        kind: Kind::SessionError,
        code: Some(code.to_string()),
        location: String::new(),
        message: message.to_string(),
        at: unix_now(),
    };
    std::thread::spawn(move || {
        reporter.record(event);
    });
}

fn which_code(which: Which) -> &'static str {
    match which {
        Which::Asr => "asr",
        Which::Llama => "llama",
    }
}

/// Tiến trình phụ chết và được giám sát khởi động lại (`SidecarEvent::Restarting`). `failures` là số lần lỗi đang tính trong cửa
/// sổ 10 phút: 0 là lần đầu chạy quá giờ chờ (không phải một lần chết), không báo.
pub fn on_sidecar_died<R: Runtime>(app: &AppHandle<R>, which: Which, failures: usize, reason: &str) {
    if failures == 0 {
        return;
    }
    let Some(reporter) = reporter_of(app) else {
        return;
    };
    if !reporter.auto_enabled() {
        return;
    }
    let code = which_code(which);
    let event = Event {
        kind: Kind::SidecarDied,
        code: Some(code.to_string()),
        location: code.to_string(),
        message: reason.to_string(),
        at: unix_now(),
    };
    std::thread::spawn(move || {
        reporter.record(event);
    });
}

/// App thoát bình thường (`RunEvent::Exit`): xóa dấu "đang chạy". Phải làm trước mọi việc có thể thoát tiến trình ngay
/// (`updater::install_on_exit` trên Windows).
pub fn mark_clean_exit<R: Runtime>(app: &AppHandle<R>) {
    if let Some(files) = app.try_state::<RunFiles>() {
        files.end_run();
    }
}

/// Người dùng tắt báo cáo lỗi tự động (`actions::commit_settings`): bỏ các báo cáo đang chờ gửi.
pub fn purge_queue<R: Runtime>(app: &AppHandle<R>) {
    if let Some(reporter) = reporter_of(app) {
        reporter.purge();
    }
}

/// Kết quả của lệnh `send_log_report`: mã báo cáo để người dùng đọc cho bộ phận hỗ trợ.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ReportSent {
    pub id: String,
}

/// Mã lỗi giao diện cho một lỗi gửi tay.
fn manual_error(e: &ManualError) -> CommandError {
    let code = match e {
        ManualError::Send(SendError::RateLimited(_)) => errors::REPORT_RATE_LIMITED,
        ManualError::Send(SendError::Transient(_)) | ManualError::NoFacts => errors::REPORT_FAILED,
        ManualError::Send(SendError::Rejected { .. }) | ManualError::Build(_) => errors::REPORT_REJECTED,
    };
    CommandError::new(code, None, e.to_string())
}

/// Lệnh `send_log_report`: dựng và gửi một báo cáo ngay, kể cả khi tắt tự động và khi đang dịch (người dùng vừa bấm). Đọc log,
/// che và gửi mất vài giây: gọi từ luồng của `spawn_blocking`.
pub fn send_manual<R: Runtime>(app: &AppHandle<R>) -> Result<ReportSent, CommandError> {
    let reporter =
        reporter_of(app).ok_or_else(|| CommandError::new(errors::REPORT_FAILED, None, "chưa cài báo cáo lỗi"))?;
    reporter
        .send_manual()
        .map(|id| ReportSent { id })
        .map_err(|e| manual_error(&e))
}

/// Dựng `Reporter` cho app giả của test: máy thật (mã máy, RAM, chip) nhưng log và máy chủ do test đưa vào, và cho phép gửi tự
/// động dù đang là bản debug.
#[cfg(test)]
pub fn reporter_for_tests<R: Runtime>(
    app: &AppHandle<R>,
    logs: Box<dyn logs::LogSource>,
    api: Box<dyn send::ReportApi>,
    dir: std::path::PathBuf,
) -> Arc<Reporter> {
    Arc::new(Reporter::new(
        Box::new(AppHost::new(app.clone(), true)),
        logs,
        api,
        Params::default(),
        Queue::new(dir),
        Duration::ZERO,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::mock_app;

    #[test]
    fn every_error_code_is_classified_exactly_once() {
        let source = include_str!("../errors.rs");
        let declared = regex::Regex::new(r#"(?m)^pub const [A-Z_]+: &str = "([A-Za-z]+)";"#).unwrap();
        let codes: Vec<&str> = declared
            .captures_iter(source)
            .map(|c| c.get(1).unwrap().as_str())
            .collect();
        assert!(codes.len() > 40, "đọc được {} mã trong errors.rs", codes.len());
        for code in &codes {
            let times = REPORTED_CODES
                .iter()
                .chain(SKIPPED_CODES)
                .filter(|c| *c == code)
                .count();
            assert_eq!(
                times, 1,
                "mã `{code}` phải nằm đúng một trong REPORTED_CODES hay SKIPPED_CODES"
            );
        }
        for listed in REPORTED_CODES.iter().chain(SKIPPED_CODES) {
            assert!(codes.contains(listed), "`{listed}` không còn trong errors.rs");
        }
    }

    #[test]
    fn only_the_apps_own_errors_are_reported() {
        for code in [
            "sidecarFailed",
            "sidecarMissing",
            "sidecarTampered",
            "modelBroken",
            "vadFailed",
            "captureFailed",
            "dataUnavailable",
            "unknown",
        ] {
            assert!(is_reported(code), "{code}");
        }
        for code in [
            "audioPermission",
            "quotaExhausted",
            "trialEnded",
            "licenseInvalid",
            "modelsOffline",
            "modelsNoSpace",
            "modelMissing",
            "updateBusy",
            "reportFailed",
        ] {
            assert!(!is_reported(code), "{code}");
        }
    }

    #[test]
    fn the_previous_run_becomes_a_crash_event_only_when_the_app_is_to_blame() {
        let now = 1_790_812_800;
        let panicked = PreviousRun::Panicked {
            at: now - 9,
            location: "src-tauri/src/a.rs:1".into(),
            message: "boom".into(),
        };
        let event = crash_event(panicked, now).unwrap();
        assert_eq!(
            (event.kind, event.code.as_deref(), event.at),
            (Kind::Crash, Some("panic"), now - 9)
        );
        assert_eq!(
            (event.location.as_str(), event.message.as_str()),
            ("src-tauri/src/a.rs:1", "boom")
        );
        let unclean = crash_event(PreviousRun::Unclean { started_at: now - 500 }, now).unwrap();
        assert_eq!(
            (unclean.kind, unclean.code.as_deref(), unclean.location.as_str()),
            (Kind::Crash, Some("unclean_exit"), "unclean")
        );
        assert_eq!(unclean.at, now);
        assert_eq!(crash_event(PreviousRun::Clean, now), None);
        assert_eq!(crash_event(PreviousRun::RebootedSince, now), None);
    }

    #[test]
    fn manual_errors_map_to_the_three_ui_codes() {
        let code = |e: ManualError| manual_error(&e).code;
        assert_eq!(
            code(ManualError::Send(SendError::RateLimited(None))),
            "reportRateLimited"
        );
        assert_eq!(
            code(ManualError::Send(SendError::Transient("x".into()))),
            "reportFailed"
        );
        assert_eq!(code(ManualError::NoFacts), "reportFailed");
        assert_eq!(
            code(ManualError::Send(SendError::Rejected {
                status: 422,
                code: "rejected_sensitive".into()
            })),
            "reportRejected"
        );
        assert_eq!(
            code(ManualError::Build(report::BuildError::Sensitive("email"))),
            "reportRejected"
        );
        // Câu lỗi kèm cho bộ phận hỗ trợ không bao giờ chứa nội dung báo cáo.
        let e = manual_error(&ManualError::Build(report::BuildError::Sensitive("home_path")));
        assert!(
            e.message.contains("home_path") && !e.message.contains('/'),
            "{}",
            e.message
        );
    }

    /// Công tắc dev: chỉ đúng `true`; bản phát hành không có công tắc (kể cả khi biến môi trường được đặt). Chạy cả với
    /// `--release`.
    #[test]
    fn only_a_debug_build_with_the_switch_on_sends_automatically() {
        // Tên biến viết thẳng ở đây vì hằng `DEV_REPORTS_ENV` chỉ có ở bản debug, mà test này phải biên dịch cả ở bản release.
        let on = std::env::var("AI_TRANSLATOR_DEV_REPORTS").as_deref() == Ok("true");
        assert_eq!(dev_reports(), cfg!(debug_assertions) && on);
        assert_eq!(auto_allowed_in_this_build(), !cfg!(debug_assertions) || dev_reports());
        #[cfg(not(debug_assertions))]
        {
            assert!(!dev_reports());
            assert!(auto_allowed_in_this_build());
        }
    }

    #[cfg(debug_assertions)]
    #[test]
    fn the_switch_is_on_only_for_the_exact_value_true() {
        assert!(switch_on(Some("true")));
        for value in [
            None,
            Some(""),
            Some("1"),
            Some("TRUE"),
            Some("True"),
            Some("yes"),
            Some(" true"),
            Some("true "),
        ] {
            assert!(!switch_on(value), "{value:?}");
        }
    }

    #[test]
    fn the_host_follows_the_setting_the_build_and_the_session_state() {
        let app = mock_app();
        let host = AppHost::new(app.handle().clone(), true);
        assert!(!host.auto_enabled(), "cài mới: tắt cho tới khi người dùng bật");
        let mut settings = app.state::<AppState>().settings();
        settings.send_error_reports = true;
        app.state::<AppState>().replace_settings(&mut settings);
        assert!(host.auto_enabled());
        assert!(
            !AppHost::new(app.handle().clone(), false).auto_enabled(),
            "bản build không cho phép"
        );
        assert!(host.translation_idle());
        for (session, idle) in [
            (SessionStatus::Idle, true),
            (SessionStatus::Error, true),
            (SessionStatus::Starting, false),
            (SessionStatus::Running, false),
        ] {
            app.state::<AppState>().update_status(|s| s.session = session);
            assert_eq!(host.translation_idle(), idle, "{session:?}");
        }
    }

    #[test]
    fn the_hosts_facts_follow_the_contract() {
        let app = mock_app();
        let host = AppHost::new(app.handle().clone(), true);
        let Some(facts) = host.facts() else {
            // Máy không đọc được mã phần cứng (hiếm): lõi bỏ báo cáo, không lỗi.
            return;
        };
        assert_eq!(facts.device_id_hash.len(), 64);
        assert_eq!(facts.ui_lang, "vi");
        assert_eq!(facts.build, if cfg!(debug_assertions) { "debug" } else { "release" });
        assert!(facts.app_version.split('.').count() >= 3, "{}", facts.app_version);
        assert!(facts.plan.is_none(), "app giả chưa cài bản quyền");
        assert_eq!(facts.os_name, std::env::consts::OS);
    }

    /// Lần chạy trước chết (panic hay thoát không bình thường) thì lần mở này xếp hàng một báo cáo `crash`; thoát bình thường
    /// hay máy khởi động lại thì không.
    #[test]
    fn the_previous_run_is_reported_at_startup_only_when_the_app_crashed() {
        use crate::test_support::{enable_error_reports, install_reports};
        let wait_for = |rig: &crate::test_support::ReportRig, n: usize| {
            let started = std::time::Instant::now();
            while rig.reporter.pending_count() < n {
                assert!(
                    started.elapsed() < Duration::from_secs(10),
                    "chờ quá lâu: báo cáo crash"
                );
                std::thread::sleep(Duration::from_millis(20));
            }
        };
        let app = mock_app();
        let rig = install_reports(&app);
        enable_error_reports(&app);
        let now = unix_now();
        report_previous_run(&rig.reporter, PreviousRun::Clean, now);
        report_previous_run(&rig.reporter, PreviousRun::RebootedSince, now);
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(rig.reporter.pending_count(), 0);
        let panicked = PreviousRun::Panicked {
            at: now - 5,
            location: "src-tauri/src/a.rs:1".into(),
            message: "boom".into(),
        };
        report_previous_run(&rig.reporter, panicked, now);
        wait_for(&rig, 1);
        report_previous_run(&rig.reporter, PreviousRun::Unclean { started_at: now - 900 }, now);
        wait_for(&rig, 2);
        let reports: Vec<serde_json::Value> = rig
            .reporter
            .pending_reports()
            .iter()
            .map(|r| serde_json::from_str(r).unwrap())
            .collect();
        assert_eq!(
            (reports[0]["kind"].as_str(), reports[0]["code"].as_str()),
            (Some("crash"), Some("panic"))
        );
        assert_eq!(reports[0]["message"], "boom");
        assert_eq!(reports[1]["code"], "unclean_exit");
        assert_ne!(reports[0]["fingerprint"], reports[1]["fingerprint"]);
    }

    #[test]
    fn the_asr_backend_is_remembered_for_the_report() {
        let app = mock_app();
        app.manage(AsrBackendNote::default());
        let host = AppHost::new(app.handle().clone(), true);
        let Some(before) = host.facts() else {
            return;
        };
        assert_eq!(before.gpu_backend, None, "chưa có asr-worker nào chạy");
        note_asr_backend(app.handle(), Some(Backend::Metal));
        assert_eq!(host.facts().unwrap().gpu_backend.as_deref(), Some("metal"));
        note_asr_backend(app.handle(), Some(Backend::Cpu));
        assert_eq!(host.facts().unwrap().gpu_backend.as_deref(), Some("cpu"));
        note_asr_backend(app.handle(), None);
        assert_eq!(host.facts().unwrap().gpu_backend, None);
    }
}
