//! Nhận giọng người nói trong app (spec 2026-10-26-phan-biet-nguoi-noi §4; kế hoạch 02, 03): bật cho phiên nào, tìm `speaker-worker`
//! và model, kiểm SHA-256 trước mỗi lần chạy (§10.2), rồi chạy `pipeline::speaker_client` cho phiên. Phiên không chờ worker.
//!
//! **Bản phát hành (kế hoạch 07, QĐ 2):** [`enabled`] theo bảng hệ điều hành đã nghiệm thu ([`ships_on`]): macOS bật, Windows theo
//! [`SHIPS_ON_WINDOWS`] (`true` từ 0.5.2, sau khi đo trên máy Windows i5), hệ điều hành khác tắt. Bản phát hành không đọc biến môi trường
//! nào. Công tắc dev: chỉ bản debug, `AI_TRANSLATOR_DEV_SPEAKER=true` trong `.env` (đọc qua `scripts/run-dev-app.sh`, cùng cơ chế
//! `AI_TRANSLATOR_DEV_PRO`, spec 2026-10-04 §2); mã đọc biến nằm sau `cfg(debug_assertions)`, bản phát hành không có chuỗi tên
//! biến (`release-check.mjs no-dev-gate` chặn). Bản này có mã tính năng chưa có nghĩa là tính năng đang chạy: model nhận giọng chỉ
//! có khi manifest có mục `speaker` ([`crate::models::service::ModelService::speaker_offered`]); chưa có thì mọi thứ "ngủ" như
//! bản không có tính năng. Bỏ mục đó khỏi manifest là cách tắt khẩn từ xa. Cài đặt `speakerDiarization` (mặc định bật): phiên có
//! nhận giọng khi [`active`], tức công tắc nội bộ bật **và** cài đặt bật.

use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use pipeline::speaker::SpeakerLink;
use pipeline::speaker_client::{self, BeforeSpawn, SpeakerHandle, SpeakerLaunch};
use speaker_protocol::NamesSetup;
use tauri::{AppHandle, Manager, Runtime};

use crate::actions;
use crate::errors::{self, CommandError};
use crate::events;
use crate::models::service::ModelService;
use crate::settings::{Invalid, Reason, Settings, UiLanguage};
use crate::sidecar::{integrity, paths};
use crate::state::AppState;
use crate::transcript::speakers::{RosterView, SpeakerError};
use crate::transcript::store::TranscriptStore;

/// Biến môi trường của cờ dev: đúng `true` thì bản debug chạy nhận giọng. Chỉ bản debug có biến này.
#[cfg(debug_assertions)]
pub const DEV_SPEAKER_ENV: &str = "AI_TRANSLATOR_DEV_SPEAKER";

/// File dấu `AXEnhancedUserInterface` (QĐ 8, 28 của kế hoạch 04) trong thư mục dữ liệu của app, tách theo loại build.
pub const EUI_MARKER_FILE: &str = eui_marker_file(cfg!(debug_assertions));

/// Bản phát hành: `speaker-eui.json`. Bản debug: `speaker-eui-dev.json` (như `data-dev.db`, `db::db_file_name`): bản dev và bản cài
/// cùng identifier nên cùng thư mục dữ liệu; tách file để worker của bản này không trả EUI mà worker của bản kia đang giữ.
pub const fn eui_marker_file(debug: bool) -> &'static str {
    if debug {
        "speaker-eui-dev.json"
    } else {
        "speaker-eui.json"
    }
}

#[cfg(target_os = "macos")]
pub mod eui_macos;
pub mod health;
pub mod recipes;

/// Tên file model trong thư mục model của bản dev (`MT_MODELS_DIR` hay `<repo>/models`), dùng khi kho chưa có.
pub const DEV_MODEL_FILE: &str = "eres2net-sv-en-voxceleb-16k.onnx";

/// Bản phát hành có tính năng trên Windows không. Bật ở 0.5.2 sau khi có số đo A-spk4 và A-spk5 trên máy Windows i5 (nhận giọng bằng
/// ONNX Runtime đi kèm, `results/11-onnxruntime-windows.md`) và bản ghi cây UI Automation thật của Teams (bảng người tham dự và phụ
/// đề trực tiếp, `results/05-windows.md`). Tắt lại ở bản sau là đổi hằng này (docs/release/phat-hanh.md, mục 16.8, lớp 3).
pub const SHIPS_ON_WINDOWS: bool = true;

/// Bản phát hành có tính năng trên hệ điều hành `os` (`std::env::consts::OS`) không.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn ships_on(os: &str) -> bool {
    match os {
        "macos" => true,
        "windows" => SHIPS_ON_WINDOWS,
        _ => false,
    }
}

/// Bản này có tính năng không (công tắc nội bộ). Bản phát hành: theo bảng hệ điều hành ([`ships_on`]); bản debug: theo cờ dev.
pub fn enabled() -> bool {
    #[cfg(debug_assertions)]
    {
        switch_on(std::env::var(DEV_SPEAKER_ENV).ok().as_deref())
    }
    #[cfg(not(debug_assertions))]
    {
        ships_on(std::env::consts::OS)
    }
}

/// Chỉ giá trị đúng `true` (phân biệt hoa thường) là bật.
#[cfg(debug_assertions)]
fn switch_on(value: Option<&str>) -> bool {
    value == Some("true")
}

/// Phiên mới có nhận giọng không: bản này có tính năng ([`enabled`]) và người dùng bật "Phân biệt người nói" (spec §8.3).
pub fn active(settings: &Settings) -> bool {
    wanted(enabled(), settings)
}

/// Phần quyết định của [`active`], nhận công tắc nội bộ làm tham số: trong `cargo test` [`enabled`] luôn `false` (không có cờ dev),
/// nên test cần hàm này để thử nhánh "bản có tính năng" (rà soát lần 2, A-N2).
fn wanted(enabled: bool, settings: &Settings) -> bool {
    enabled && settings.speaker_diarization
}

/// Client nhận giọng của phiên gần nhất, để tắt giữa phiên ([`turn_off`]). `start_for_session` thay ở mỗi phiên.
#[derive(Default)]
pub struct Running(Mutex<Option<SpeakerHandle>>);

/// Chạy nhận giọng cho phiên vừa bắt đầu nếu bật; không chờ worker. Chưa có model trong kho thì tải nền (bản dev dùng model của
/// thư mục model dev nếu có). Lỗi gì cũng chỉ ghi log: phụ đề chạy như thường.
pub fn start_for_session<R: Runtime>(app: &AppHandle<R>) -> Option<SpeakerLink> {
    let settings = app.try_state::<AppState>()?.settings();
    if !active(&settings) {
        return None;
    }
    let models = app.try_state::<Arc<ModelService>>()?.inner().clone();
    let (model, sha256) = match models.speaker_model() {
        Some((path, sha)) => (path, Some(sha)),
        None => {
            models.download_speaker_model_in_background(app);
            match dev_model(tauri::is_dev(), &paths::dev_models_dir()) {
                Some(path) => (path, None),
                None => {
                    log::info!("nhận giọng: chưa có model, phiên này không bật");
                    return None;
                }
            }
        }
    };
    let dir = paths::binaries_dir().ok()?;
    let exe = dir.join(paths::file_name(
        paths::SPEAKER_WORKER,
        paths::TARGET,
        tauri::is_dev(),
        cfg!(windows),
    ));
    let log = app.path().app_log_dir().ok()?.join("speaker-worker.log");
    let mut launch = SpeakerLaunch::new(&exe, &model, &log, models.speaker_config());
    // Worker băm lại đúng các byte nó đọc (`Load.model_sha256`): file bị thay sau lần kiểm dưới đây cũng bị từ chối.
    launch.model_sha256 = sha256;
    launch.names = names_setup(app, &settings);
    let locks: Arc<Mutex<Vec<File>>> = Arc::default();
    let check_app = app.clone();
    let before_spawn: BeforeSpawn = Box::new(move |launch: &SpeakerLaunch| {
        let expected = launch.model_sha256.as_deref();
        // Model của kho hỏng mà đúng kích thước: bỏ để phiên sau tải lại (không thì tính năng tắt lặng lẽ mãi).
        let discard = || expected.is_some_and(|sha| models.discard_speaker_model(&check_app, sha));
        check_before_spawn(launch, expected, integrity::SIDECAR_HASHES, &locks, &discard)
    });
    let (link, handle) = speaker_client::start(launch, before_spawn);
    log::info!("nhận giọng: bật cho phiên này");
    keep_running(app, &handle);
    Some(link)
}

/// Phần tên của `Load` (kế hoạch 04, 06): công tắc "Lấy tên", công thức đang có (bản build sẵn hay bản tải về đã kiểm chữ ký, xem
/// [`recipes`]), file dấu.
fn names_setup<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> NamesSetup {
    NamesSetup {
        enabled: settings.speaker_names,
        recipe_json: recipes::body(app),
        eui_marker: app
            .path()
            .app_local_data_dir()
            .ok()
            .map(|d| d.join(EUI_MARKER_FILE).display().to_string()),
    }
}

/// Người dùng đổi "Lấy tên" (Cài đặt › Phụ đề › Người nói): worker của phiên đang chạy bật hay tắt đọc tên ngay (spec §8.3). Tắt thì
/// app tự xóa tên tự động, người tham dự, dòng mời ở bảng người nói và phát lại bảng, không chờ worker (worker có thể đã chết hay bị
/// tắt vì quá tải; QĐ 31).
pub fn names_changed<R: Runtime>(app: &AppHandle<R>, on: bool) {
    if let Some(running) = app.try_state::<Running>()
        && let Some(handle) = running.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref()
    {
        handle.set_names(on);
        log::info!("đọc tên: người dùng {} \"Lấy tên\"", if on { "bật" } else { "tắt" });
    }
    let Some(store) = app.try_state::<TranscriptStore>() else {
        return;
    };
    if on {
        store.allow_names();
    } else if let Some(view) = store.clear_names() {
        events::speaker_roster(app, &view);
    }
}

/// Người dùng tắt "Phân biệt người nói" (Cài đặt › Phụ đề; QĐ 8 của kế hoạch 03): dừng worker của phiên ngay (không chạy lại tới hết
/// phiên), bỏ bảng người nói và báo hai cửa sổ thôi vẽ nhãn. Bật lại thì có tác dụng từ phiên sau. Không có phiên thì chỉ bỏ bảng
/// người nói của phiên vừa dừng. Chỉ phát bảng rỗng khi bảng vừa bỏ có giọng: bản "ngủ" (không phiên nào có giọng) không phát sự kiện mới nào (QĐ 9).
pub fn turn_off<R: Runtime>(app: &AppHandle<R>) {
    let handle = app
        .try_state::<Running>()
        .and_then(|r| r.0.lock().unwrap_or_else(|e| e.into_inner()).take());
    if let Some(handle) = handle
        && !handle.is_stopped()
    {
        handle.stop();
        log::info!("nhận giọng: người dùng tắt, dừng worker của phiên");
    }
    if let Some(store) = app.try_state::<TranscriptStore>()
        && let Some(view) = store.speakers_off()
    {
        events::speaker_roster(app, &view);
    }
}

/// Giữ handle của phiên để tắt được giữa phiên ([`turn_off`]). Người dùng vừa tắt công tắc trong lúc phiên đang bắt đầu (`turn_off` chưa
/// thấy handle, rà soát A-N3): dừng ngay, để không phân tích giọng khi người dùng đã tắt (ưu tiên 3). Đọc cài đặt **sau** khi giữ
/// handle, nên mọi lần tắt hoặc thấy handle, hoặc bị lần đọc này thấy.
fn keep_running<R: Runtime>(app: &AppHandle<R>, handle: &SpeakerHandle) {
    keep_running_with(app, handle, enabled());
}

/// [`keep_running`] với công tắc nội bộ làm tham số (để test, xem [`wanted`]).
fn keep_running_with<R: Runtime>(app: &AppHandle<R>, handle: &SpeakerHandle, enabled: bool) {
    if let Some(running) = app.try_state::<Running>() {
        *running.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle.clone());
    }
    let on = app
        .try_state::<AppState>()
        .is_some_and(|s| wanted(enabled, &s.settings()));
    if !on {
        handle.stop();
        log::info!("nhận giọng: công tắc đã tắt lúc phiên bắt đầu, dừng worker");
    }
}

/// Phiên dừng (`session::stop_engine`): bỏ handle của phiên (client đã dừng cùng `SpeakerLink`), để lần tắt công tắc sau đó không dừng
/// nhầm và không ghi log sai (rà soát A-N4).
pub fn session_ended<R: Runtime>(app: &AppHandle<R>) {
    health::note_session_ended(app);
    if let Some(running) = app.try_state::<Running>()
        && let Some(handle) = running.0.lock().unwrap_or_else(|e| e.into_inner()).take()
    {
        handle.stop();
    }
}

/// Ngôn ngữ giao diện vừa đổi: nhãn "Người N" theo ngôn ngữ mới (spec §9: nhãn tính sẵn ở phía Rust).
pub fn language_changed<R: Runtime>(app: &AppHandle<R>, lang: UiLanguage) {
    let Some(store) = app.try_state::<TranscriptStore>() else {
        return;
    };
    store.set_ui_language(lang);
    if store.has_speakers() {
        events::speaker_roster(app, &store.roster_view());
    }
}

/// Gửi lại bảng người nói hiện có cho hai cửa sổ (sau "Xóa toàn bộ dữ liệu", QĐ 18), chỉ khi phiên có giọng: bản phát hành (không có
/// nhận giọng) không phát sự kiện mới nào (QĐ 9).
pub fn emit_roster<R: Runtime>(app: &AppHandle<R>) {
    if let Some(store) = app.try_state::<TranscriptStore>()
        && store.has_speakers()
    {
        events::speaker_roster(app, &store.roster_view());
    }
}

/// Nút "Mở Cài đặt" của dòng mời cấp quyền trên thanh phụ đề (spec §6.7, §8.4): hiện cửa sổ chính ở Cài đặt › Phụ đề và cuộn tới
/// nhóm Người nói. Không đọc hay đổi dữ liệu gì (việc menu khay vốn làm được).
pub fn open_settings<R: Runtime>(app: &AppHandle<R>) {
    actions::open_main_at(
        app,
        events::Navigate {
            screen: "settings",
            settings_group: Some("subtitles"),
            focus: Some("speakers"),
        },
    );
}

// ---- Đổi tên, gộp (spec 2026-10-26-phan-biet-nguoi-noi §8.2) trong phiên đang chạy. Không phải tính năng Pro. Chỉ một lần khóa ngắn
// của `TranscriptStore`, nên lệnh chạy thẳng, không qua `spawn_blocking`. ----

/// Lỗi của đổi tên, gộp cho giao diện; thông báo không có tên người.
fn speaker_error(e: SpeakerError) -> CommandError {
    match e {
        SpeakerError::TooLong => Invalid::new("name", Reason::TooLong).into(),
        SpeakerError::Same => CommandError::new(errors::SPEAKER_SAME, None, e.to_string()),
        SpeakerError::NotFound => CommandError::new(errors::SPEAKER_NOT_FOUND, None, e.to_string()),
    }
}

/// Đổi tên một giọng, áp cho mọi câu của giọng trong phiên; phát bảng mới cho hai cửa sổ. Tên không vào log.
pub fn rename<R: Runtime>(app: &AppHandle<R>, id: u32, name: &str) -> Result<RosterView, CommandError> {
    let store = app
        .try_state::<TranscriptStore>()
        .ok_or_else(|| speaker_error(SpeakerError::NotFound))?;
    let view = store.rename_speaker(id, name).map_err(speaker_error)?;
    events::speaker_roster(app, &view);
    Ok(view)
}

/// Gộp tay giọng `from` vào `into` (chỉ đổi cách hiện, không gửi worker); phát bảng mới cho hai cửa sổ.
pub fn merge<R: Runtime>(app: &AppHandle<R>, from: u32, into: u32) -> Result<RosterView, CommandError> {
    let store = app
        .try_state::<TranscriptStore>()
        .ok_or_else(|| speaker_error(SpeakerError::NotFound))?;
    let view = store.merge_speakers(from, into).map_err(speaker_error)?;
    events::speaker_roster(app, &view);
    Ok(view)
}

/// Model của thư mục model dev, chỉ ở bản dev.
fn dev_model(dev: bool, dir: &Path) -> Option<PathBuf> {
    let path = dir.join(DEV_MODEL_FILE);
    (dev && path.is_file()).then_some(path)
}

/// Kiểm trước mỗi lần chạy worker (spec §4.1, §10.2), như `before_spawn` của `asr-worker`: cả thư mục của binary bằng
/// [`integrity::verify`] (mọi file trong bảng SHA-256 build sẵn khớp, không để người khác ghi, binary có trong bảng, không có
/// thư viện lạ); model khớp SHA-256 của manifest (`None`: model dev, không kiểm). Windows giữ handle chỉ cho đọc của các file
/// tới lần kiểm sau (`locks`, thay bản cũ). Binary chỉ là bản đóng gói cùng app (không bao giờ tải từ mạng): sai là từ chối.
///
/// Model sai SHA-256: `discard` bỏ nó khỏi kho (`ModelService::discard_speaker_model`, trả `true` khi đã bỏ) để phiên sau tải
/// lại, vì kho chỉ so kích thước lúc bắt đầu phiên nên file hỏng mà đúng kích thước sẽ bị từ chối mãi.
fn check_before_spawn(
    launch: &SpeakerLaunch,
    model_sha256: Option<&str>,
    table: &[(&str, &str)],
    locks: &Mutex<Vec<File>>,
    discard: &dyn Fn() -> bool,
) -> Result<(), String> {
    let dir = launch.exe.parent().ok_or("speaker-worker không có thư mục")?;
    let verified = integrity::verify(dir, &[launch.exe.as_path()], table).map_err(|e| e.to_string())?;
    if !verified.locks.is_empty() {
        *locks.lock().unwrap_or_else(|e| e.into_inner()) = verified.locks;
    }
    if let Some(expected) = model_sha256 {
        let actual =
            integrity::sha256_file(&launch.model).map_err(|e| format!("không đọc được model nhận giọng: {e}"))?;
        if actual != expected {
            let next = if discard() {
                "đã xóa, phiên sau tải lại"
            } else {
                "chưa bỏ được, phiên sau thử lại"
            };
            return Err(format!(
                "model nhận giọng khác bản trong manifest (file hỏng hay bị thay): {next}"
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-speaker-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Kế hoạch 07, QĐ 2: bản phát hành bật nhận giọng trên đúng các hệ điều hành đã nghiệm thu, và chỉ ở đó.
    #[test]
    fn the_release_ships_on_the_audited_platforms_only() {
        assert!(ships_on("macos"));
        assert_eq!(ships_on("windows"), SHIPS_ON_WINDOWS);
        assert!(!ships_on("linux"));
        assert!(!ships_on(""));
    }

    /// Chỉ chạy ở bản release (`cargo test --release`, CI): công tắc của bản phát hành đúng bằng bảng hệ điều hành, không đọc biến môi trường.
    #[cfg(not(debug_assertions))]
    #[test]
    fn release_builds_follow_the_platform_table_not_the_environment() {
        assert_eq!(enabled(), ships_on(std::env::consts::OS));
    }

    /// Bản debug (`cargo test` thường): chỉ bật khi có cờ dev; giá trị khác `true` không bật.
    #[cfg(debug_assertions)]
    #[test]
    fn debug_builds_stay_opt_in() {
        assert!(!switch_on(None));
        assert!(!switch_on(Some("1")));
        assert!(!switch_on(Some("TRUE")));
        assert!(switch_on(Some("true")));
    }

    #[cfg(debug_assertions)]
    #[test]
    fn the_dev_switch_needs_exactly_true() {
        assert!(switch_on(Some("true")));
        for off in [None, Some("1"), Some("TRUE"), Some("true "), Some("")] {
            assert!(!switch_on(off), "{off:?}");
        }
    }

    #[test]
    fn the_repo_model_is_used_only_by_dev_builds() {
        let dir = temp("dev-model");
        assert_eq!(dev_model(true, &dir), None, "chưa có file");
        std::fs::write(dir.join(DEV_MODEL_FILE), b"onnx").unwrap();
        assert_eq!(dev_model(true, &dir), Some(dir.join(DEV_MODEL_FILE)));
        assert_eq!(dev_model(false, &dir), None, "bản phát hành chỉ dùng kho model");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Thư mục có `speaker-worker` (quyền 0o755) và model; trả thư mục, cách chạy, bảng SHA-256 build sẵn, SHA-256 của model.
    fn worker_dir(name: &str) -> (PathBuf, SpeakerLaunch, [(String, String); 1], String) {
        let dir = temp(name);
        let (exe, model) = (dir.join("speaker-worker"), dir.join("eres2net.onnx"));
        std::fs::write(&exe, b"worker").unwrap();
        std::fs::write(&model, b"model").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            // `integrity::verify` từ chối file nhóm hay người khác ghi được: không phụ thuộc umask của máy chạy test.
            std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let table_owned = [("speaker-worker".to_string(), integrity::sha256_file(&exe).unwrap())];
        let model_sha = integrity::sha256_file(&model).unwrap();
        let launch = SpeakerLaunch::new(
            &exe,
            &model,
            &dir.join("w.log"),
            speaker_protocol::SpeakerConfig::default(),
        );
        (dir, launch, table_owned, model_sha)
    }

    fn borrowed(table: &[(String, String)]) -> Vec<(&str, &str)> {
        table.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect()
    }

    /// Spec §4.1, §10.2: không chạy binary lạ, thư viện lạ cạnh binary, hay model khác bản manifest. Kiểm như `before_spawn` của
    /// `asr-worker` (cả thư mục, trước mỗi lần chạy).
    #[test]
    fn the_binary_and_the_model_are_checked_before_each_run() {
        let (dir, launch, table_owned, model_sha) = worker_dir("check");
        let table = borrowed(&table_owned);
        let locks = Mutex::new(Vec::new());
        let keep = || false;
        assert_eq!(
            check_before_spawn(&launch, Some(&model_sha), &table, &locks, &keep),
            Ok(())
        );
        assert_eq!(
            check_before_spawn(&launch, None, &table, &locks, &keep),
            Ok(()),
            "model dev: không kiểm SHA-256"
        );
        let wrong = "00".repeat(32);
        assert!(
            check_before_spawn(&launch, Some(&wrong), &table, &locks, &keep)
                .unwrap_err()
                .contains("khác bản trong manifest")
        );
        assert!(
            check_before_spawn(&launch, Some(&model_sha), &[], &locks, &keep)
                .unwrap_err()
                .contains("không có trong danh sách")
        );
        // Thư viện lạ cạnh binary (có thể bị nạp thay thư viện thật): từ chối, như `asr-worker`.
        std::fs::write(dir.join("libggml-la.dylib"), b"x").unwrap();
        assert!(
            check_before_spawn(&launch, Some(&model_sha), &table, &locks, &keep)
                .unwrap_err()
                .contains("libggml-la.dylib")
        );
        std::fs::remove_file(dir.join("libggml-la.dylib")).unwrap();
        // Nhả khóa file đã kiểm (`check_before_spawn` giữ chúng mở để không ai thay được): Windows không cho ghi đè file đang mở.
        locks.lock().unwrap().clear();
        std::fs::write(&launch.exe, b"da sua").unwrap();
        assert!(
            check_before_spawn(&launch, Some(&model_sha), &table, &locks, &keep)
                .unwrap_err()
                .contains("khác bản build sẵn")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Model trong kho hỏng mà đúng kích thước (`ModelService::speaker_model` chỉ so kích thước nên vẫn đưa nó ra): từ chối với
    /// lỗi rõ và bỏ file (`discard`), để phiên sau tải lại thay vì tắt lặng lẽ mãi. Model đúng, model dev hay binary sai thì không
    /// đụng tới model.
    #[test]
    fn a_model_with_the_wrong_sha256_is_discarded_for_a_new_download() {
        let (dir, launch, table_owned, model_sha) = worker_dir("discard");
        let table = borrowed(&table_owned);
        let locks = Mutex::new(Vec::new());
        let calls = std::cell::Cell::new(0);
        let discard = || {
            calls.set(calls.get() + 1);
            true
        };
        assert_eq!(
            check_before_spawn(&launch, Some(&model_sha), &table, &locks, &discard),
            Ok(())
        );
        assert_eq!(check_before_spawn(&launch, None, &table, &locks, &discard), Ok(()));
        assert_eq!(calls.get(), 0, "model đúng hay model dev: không bỏ");
        let wrong = "00".repeat(32);
        let err = check_before_spawn(&launch, Some(&wrong), &table, &locks, &discard).unwrap_err();
        assert!(
            err.contains("khác bản trong manifest") && err.contains("phiên sau tải lại"),
            "{err}"
        );
        assert_eq!(calls.get(), 1);
        let busy = || false;
        let err = check_before_spawn(&launch, Some(&wrong), &table, &locks, &busy).unwrap_err();
        assert!(err.contains("chưa bỏ được"), "{err}");
        // Binary sai: từ chối trước khi xét model, không bỏ model. Nhả khóa file đã kiểm trước (Windows không cho ghi đè file đang mở).
        locks.lock().unwrap().clear();
        std::fs::write(&launch.exe, b"da sua").unwrap();
        assert!(check_before_spawn(&launch, Some(&wrong), &table, &locks, &discard).is_err());
        assert_eq!(calls.get(), 1, "binary sai: không đụng model");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Kế hoạch 03 (QĐ 9): cài đặt "Phân biệt người nói" bật sẵn; tắt thì không phiên nào có nhận giọng; bật thì theo công tắc nội bộ
    /// của bản này (bản phát hành: theo bảng hệ điều hành).
    #[test]
    fn the_settings_switch_only_turns_speaker_off() {
        let mut s = Settings::defaults(UiLanguage::Vi);
        assert!(s.speaker_diarization && s.speaker_names, "bật sẵn (spec §8.3)");
        assert_eq!(active(&s), enabled());
        assert!(wanted(true, &s), "bản có tính năng, cài đặt bật");
        assert!(!wanted(false, &s), "bản không có tính năng");
        s.speaker_diarization = false;
        assert!(!active(&s));
        assert!(!wanted(true, &s), "cài đặt tắt thắng công tắc nội bộ");
    }

    /// Kế hoạch 03, sửa ở kế hoạch 07: bản phát hành chạy nhận giọng đúng ở hệ điều hành đã nghiệm thu khi cài đặt bật, và không bao
    /// giờ khi cài đặt tắt (CI chạy test này ở bản release, bộ lọc `speaker::`).
    #[cfg(not(debug_assertions))]
    #[test]
    fn release_builds_activate_speaker_per_platform_table_and_settings() {
        let mut s = Settings::defaults(UiLanguage::Vi);
        assert_eq!(active(&s), ships_on(std::env::consts::OS));
        s.speaker_diarization = false;
        assert!(!active(&s));
    }

    /// Các bảng `speaker://roster` mà cửa sổ `label` nhận được.
    fn rosters(app: &tauri::App<tauri::test::MockRuntime>, label: &str) -> Arc<Mutex<Vec<String>>> {
        use tauri::Listener;
        let got = Arc::new(Mutex::new(Vec::new()));
        let sink = got.clone();
        crate::test_support::window(app, label).listen(events::SPEAKER_ROSTER, move |e| {
            sink.lock().unwrap().push(e.payload().to_string());
        });
        got
    }

    fn wait_for(got: &Mutex<Vec<String>>, n: usize) -> Vec<String> {
        let since = std::time::Instant::now();
        while got.lock().unwrap().len() < n {
            assert!(
                since.elapsed() < std::time::Duration::from_secs(10),
                "chưa nhận đủ {n} bảng"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        got.lock().unwrap().clone()
    }

    /// Phiên 1 của app giả có một giọng ("Người 1").
    fn one_voice(app: &tauri::App<tauri::test::MockRuntime>) {
        use pipeline::subtitle::{Roster, RosterVoice};
        let store = app.state::<TranscriptStore>();
        store.begin(1, 0, "vi");
        store.set_ui_language(UiLanguage::Vi);
        let view = store.roster(
            1,
            &Roster {
                voices: vec![RosterVoice { id: 1, room: false }],
            },
        );
        assert!(view.is_some());
    }

    /// QĐ 20 của kế hoạch 04 (rà soát B-N12 của 03): cửa sổ chính mở hay tải lại giữa phiên thì nhận lại bảng người nói (có người
    /// tham dự) ngay khi đọc bản chép lời.
    #[test]
    fn reading_the_transcript_sends_the_roster_again() {
        let app = crate::test_support::mock_app();
        one_voice(&app);
        let to_main = rosters(&app, crate::window::MAIN);
        let main = crate::test_support::window(&app, crate::window::MAIN);
        crate::test_support::invoke(&main, "get_transcript", serde_json::json!({})).unwrap();
        assert_eq!(wait_for(&to_main, 1).len(), 1);
    }

    /// QĐ 8: tắt "Phân biệt người nói" giữa phiên thì dừng worker ngay, bỏ bảng người nói, hai cửa sổ nhận bảng rỗng.
    #[test]
    fn turning_the_switch_off_mid_session_stops_the_worker_and_clears_the_labels() {
        let app = crate::test_support::mock_app();
        one_voice(&app);
        let handle = SpeakerHandle::default();
        *app.state::<Running>().0.lock().unwrap() = Some(handle.clone());
        let (to_main, to_overlay) = (rosters(&app, crate::window::MAIN), rosters(&app, crate::overlay::LABEL));
        let mut next = app.state::<AppState>().settings();
        next.speaker_diarization = false;
        crate::actions::commit_settings(app.handle(), next);
        assert!(handle.is_stopped(), "worker của phiên bị dừng");
        assert!(app.state::<Running>().0.lock().unwrap().is_none());
        for got in [wait_for(&to_main, 1), wait_for(&to_overlay, 1)] {
            let view: serde_json::Value = serde_json::from_str(&got[0]).unwrap();
            assert_eq!(view["voices"], serde_json::json!([]), "{view}");
            assert!(
                view["rev"].as_u64().unwrap() > 1,
                "bảng mới hơn bảng của giọng đầu: {view}"
            );
        }
        assert!(app.state::<TranscriptStore>().roster_view().voices.is_empty());
    }

    /// QĐ 9, rà soát mã 03, mục 2: tắt công tắc khi phiên chưa có giọng nào (mọi phiên của bản "ngủ", vì bản đó không có
    /// nhận giọng) thì không phát `speaker://roster`: không có nhãn nào cần xóa.
    #[test]
    fn turning_the_switch_off_without_voices_announces_nothing() {
        let app = crate::test_support::mock_app();
        let (to_main, to_overlay) = (rosters(&app, crate::window::MAIN), rosters(&app, crate::overlay::LABEL));
        app.state::<TranscriptStore>().begin(1, 0, "vi");
        let mut next = app.state::<AppState>().settings();
        next.speaker_diarization = false;
        crate::actions::commit_settings(app.handle(), next);
        std::thread::sleep(std::time::Duration::from_millis(100));
        assert!(to_main.lock().unwrap().is_empty(), "cửa sổ chính");
        assert!(to_overlay.lock().unwrap().is_empty(), "thanh phụ đề");
    }

    /// Rà soát A-N3: công tắc tắt đúng lúc phiên đang bắt đầu (trước khi handle được giữ, `turn_off` chưa thấy nó): worker vừa chạy
    /// bị dừng ngay. Thử như bản có tính năng (`enabled = true`; trong `cargo test` [`enabled`] luôn `false`), nên test đỏ nếu
    /// `keep_running` bỏ qua cài đặt (rà soát lần 2, A-N2) hay dừng cả khi cài đặt bật.
    #[test]
    fn a_worker_started_after_the_switch_went_off_is_stopped_at_once() {
        let app = crate::test_support::mock_app();
        let kept = SpeakerHandle::default();
        keep_running_with(app.handle(), &kept, true);
        assert!(!kept.is_stopped(), "cài đặt bật: worker chạy tiếp");
        let mut next = app.state::<AppState>().settings();
        next.speaker_diarization = false;
        crate::actions::commit_settings(app.handle(), next);
        assert!(kept.is_stopped(), "tắt giữa phiên: `turn_off` dừng worker đang giữ");
        let late = SpeakerHandle::default();
        keep_running_with(app.handle(), &late, true);
        assert!(late.is_stopped(), "worker bắt đầu sau khi tắt: dừng ngay");
        assert!(
            app.state::<Running>().0.lock().unwrap().is_some(),
            "vẫn giữ tới khi phiên dừng"
        );
    }

    /// Rà soát A-N4: phiên dừng thì bỏ handle; tắt công tắc sau đó không dừng nhầm handle cũ, không ghi log sai.
    #[test]
    fn a_stopped_session_leaves_no_worker_handle_behind() {
        let app = crate::test_support::mock_app();
        let handle = SpeakerHandle::default();
        *app.state::<Running>().0.lock().unwrap() = Some(handle.clone());
        session_ended(app.handle());
        assert!(app.state::<Running>().0.lock().unwrap().is_none());
        assert!(handle.is_stopped());
    }

    /// QĐ 9: "Xóa toàn bộ dữ liệu" chỉ phát `speaker://roster` khi phiên có giọng (bản "ngủ" không phát sự kiện mới).
    #[test]
    fn clearing_data_announces_speakers_only_when_there_are_some() {
        let app = crate::test_support::mock_app();
        let to_main = rosters(&app, crate::window::MAIN);
        emit_roster(app.handle());
        std::thread::sleep(std::time::Duration::from_millis(100));
        assert!(to_main.lock().unwrap().is_empty(), "chưa có giọng: không phát");
        one_voice(&app);
        emit_roster(app.handle());
        assert_eq!(wait_for(&to_main, 1).len(), 1);
    }

    /// Spec §9: nhãn "Người N" tính sẵn theo ngôn ngữ giao diện; đổi ngôn ngữ thì hai cửa sổ nhận nhãn mới.
    #[test]
    fn a_new_ui_language_relabels_the_automatic_names() {
        let app = crate::test_support::mock_app();
        one_voice(&app);
        let to_main = rosters(&app, crate::window::MAIN);
        let mut next = app.state::<AppState>().settings();
        next.ui_language = UiLanguage::En;
        crate::actions::commit_settings(app.handle(), next);
        let got = wait_for(&to_main, 1);
        assert!(got[0].contains(r#""label":"Speaker 1""#), "{got:?}");
    }

    /// QĐ 9: giao diện chỉ hiện nhóm Cài đặt "Người nói" khi bản này có tính năng.
    #[test]
    fn the_app_info_says_whether_the_speaker_settings_show() {
        let app = crate::test_support::mock_app();
        let main = crate::test_support::window(&app, crate::window::MAIN);
        let info = crate::test_support::invoke(&main, "get_app_info", serde_json::json!({})).unwrap();
        assert_eq!(info["speakerAvailable"], serde_json::json!(enabled()));
    }

    /// Rà soát A-N11: lỗi của đổi tên, gộp có mã riêng, câu báo đúng việc; thông báo không có tên người.
    #[test]
    fn rename_and_merge_errors_have_their_own_codes() {
        assert_eq!(speaker_error(SpeakerError::Same).code, crate::errors::SPEAKER_SAME);
        assert_eq!(
            speaker_error(SpeakerError::NotFound).code,
            crate::errors::SPEAKER_NOT_FOUND
        );
        let long = speaker_error(SpeakerError::TooLong);
        assert_eq!((long.code.as_str(), long.field.as_deref()), ("tooLong", Some("name")));
    }

    /// Kế hoạch 04: phiên mang công thức build sẵn (hợp lệ), công tắc "Lấy tên" và file dấu `AXEnhancedUserInterface`.
    #[test]
    fn the_session_launch_carries_the_builtin_recipe_and_the_names_switch() {
        let app = crate::test_support::mock_app();
        let mut s = Settings::defaults(UiLanguage::Vi);
        let n = names_setup(app.handle(), &s);
        assert!(n.enabled, "bật sẵn (spec §8.3)");
        assert!(speaker_recipe::parse(&n.recipe_json).is_ok_and(|r| r.dropped.is_empty()));
        assert!(n.eui_marker.as_deref().is_some_and(|p| p.ends_with(EUI_MARKER_FILE)));
        s.speaker_names = false;
        assert!(!names_setup(app.handle(), &s).enabled);
    }

    /// QĐ 28 (rà soát B-Q6, B-N13): bản dev và bản cài dùng chung thư mục dữ liệu nên file dấu tách theo loại build (như `data-dev.db`).
    #[test]
    fn the_eui_marker_file_depends_on_the_build() {
        assert_eq!(eui_marker_file(true), "speaker-eui-dev.json");
        assert_eq!(eui_marker_file(false), "speaker-eui.json");
        assert_eq!(EUI_MARKER_FILE, eui_marker_file(cfg!(debug_assertions)));
    }

    /// Spec §8.3: tắt "Lấy tên" giữa phiên thì worker thôi đọc tên ngay (client gửi `SetNames`); bật lại cũng vậy.
    #[test]
    fn the_names_switch_reaches_the_running_worker() {
        let app = crate::test_support::mock_app();
        let handle = SpeakerHandle::default();
        handle.set_names(true);
        *app.state::<Running>().0.lock().unwrap() = Some(handle.clone());
        let mut next = app.state::<AppState>().settings();
        next.speaker_names = false;
        crate::actions::commit_settings(app.handle(), next.clone());
        assert!(!handle.names_wanted());
        next.speaker_names = true;
        crate::actions::commit_settings(app.handle(), next);
        assert!(handle.names_wanted());
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §10: báo cáo lỗi biết tên người tham dự và nhãn có tên của bảng người nói hiện có (để che), không
    /// tính nhãn "Người N".
    #[test]
    fn the_error_report_host_knows_the_names_in_the_roster() {
        use pipeline::subtitle::{NamedVoice, Names};
        let app = crate::test_support::mock_app();
        one_voice(&app);
        let host = crate::diagnostics::host_of(app.handle());
        assert!(host.known_names().is_empty(), "chưa có tên: nhãn là Người 1");
        let names = Names {
            voices: vec![NamedVoice {
                id: 1,
                name: "Lan Nguyễn".into(),
                room_index: None,
            }],
            participants: vec!["Lan Nguyễn".into(), "Minh Trần".into()],
        };
        assert!(app.state::<TranscriptStore>().names(1, &names).is_some());
        let mut known = host.known_names();
        known.sort();
        known.dedup();
        assert_eq!(known, ["Lan Nguyễn", "Minh Trần"]);
    }

    /// QĐ 31: tắt "Lấy tên" thì app tự xóa tên tự động và người tham dự rồi phát bảng (không chờ worker; ở đây không có worker nào);
    /// tên tới sau lúc tắt bị bỏ; bật lại thì tên tự động được nhận trở lại.
    #[test]
    fn turning_names_off_clears_the_roster_and_turning_them_on_accepts_names_again() {
        use pipeline::subtitle::{NamedVoice, Names};
        let app = crate::test_support::mock_app();
        one_voice(&app);
        let store = app.state::<TranscriptStore>();
        let names = Names {
            voices: vec![NamedVoice {
                id: 1,
                name: "Lan Nguyễn".into(),
                room_index: None,
            }],
            participants: vec!["Lan Nguyễn".into(), "Minh Trần".into()],
        };
        assert!(store.names(1, &names).is_some());
        assert_eq!(store.roster_view().voices[0].label, "Lan Nguyễn");
        let to_main = rosters(&app, crate::window::MAIN);
        let mut next = app.state::<AppState>().settings();
        next.speaker_names = false;
        crate::actions::commit_settings(app.handle(), next.clone());
        let got = wait_for(&to_main, 1);
        let view: serde_json::Value = serde_json::from_str(&got[0]).unwrap();
        assert_eq!(view["voices"][0]["label"], "Người 1", "{view}");
        assert_eq!(view["participants"], serde_json::json!([]), "{view}");
        assert!(store.names(1, &names).is_none(), "đang tắt: bỏ tên tới sau");
        next.speaker_names = true;
        crate::actions::commit_settings(app.handle(), next);
        assert!(store.names(1, &names).is_some(), "bật lại: nhận tên");
        assert_eq!(store.roster_view().voices[0].label, "Lan Nguyễn");
    }
}
