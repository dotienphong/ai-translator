//! Nhận giọng người nói trong app (spec 2026-10-26-phan-biet-nguoi-noi §4; kế hoạch 02): bật cho phiên nào, tìm `speaker-worker`
//! và model, kiểm SHA-256 trước mỗi lần chạy (§10.2), rồi chạy `pipeline::speaker_client` cho phiên. Phiên không chờ worker.
//!
//! **Kế hoạch 02: tính năng TẮT với người dùng cuối.** Chỉ bản debug bật được, bằng `AI_TRANSLATOR_DEV_SPEAKER=true` trong
//! `.env` (đọc qua `scripts/run-dev-app.sh`, cùng cơ chế `AI_TRANSLATOR_DEV_PRO`, spec 2026-10-04 §2). Mã đọc biến nằm sau
//! `cfg(debug_assertions)`; bản phát hành không có chuỗi tên biến (`release-check.mjs no-dev-gate` chặn). Kế hoạch 03 thay cờ này
//! bằng cài đặt `speakerDiarization` (mặc định bật).

use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use pipeline::speaker::SpeakerLink;
use pipeline::speaker_client::{self, BeforeSpawn, SpeakerLaunch};
use tauri::{AppHandle, Manager, Runtime};

use crate::models::service::ModelService;
use crate::sidecar::{integrity, paths};

/// Biến môi trường của cờ dev: đúng `true` thì bản debug chạy nhận giọng. Chỉ bản debug có biến này.
#[cfg(debug_assertions)]
pub const DEV_SPEAKER_ENV: &str = "AI_TRANSLATOR_DEV_SPEAKER";

/// Tên file model trong thư mục model của bản dev (`MT_MODELS_DIR` hay `<repo>/models`), dùng khi kho chưa có.
pub const DEV_MODEL_FILE: &str = "eres2net-sv-en-voxceleb-16k.onnx";

/// Nhận giọng có bật cho phiên mới không. Bản phát hành: luôn `false` ở kế hoạch 02.
pub fn enabled() -> bool {
    #[cfg(debug_assertions)]
    {
        switch_on(std::env::var(DEV_SPEAKER_ENV).ok().as_deref())
    }
    #[cfg(not(debug_assertions))]
    {
        false
    }
}

/// Chỉ giá trị đúng `true` (phân biệt hoa thường) là bật.
#[cfg(debug_assertions)]
fn switch_on(value: Option<&str>) -> bool {
    value == Some("true")
}

/// Chạy nhận giọng cho phiên vừa bắt đầu nếu bật; không chờ worker. Chưa có model trong kho thì tải nền (bản dev dùng model của
/// thư mục model dev nếu có). Lỗi gì cũng chỉ ghi log: phụ đề chạy như thường.
pub fn start_for_session<R: Runtime>(app: &AppHandle<R>) -> Option<SpeakerLink> {
    if !enabled() {
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
    let locks: Arc<Mutex<Vec<File>>> = Arc::default();
    let app = app.clone();
    let before_spawn: BeforeSpawn = Box::new(move |launch: &SpeakerLaunch| {
        let expected = launch.model_sha256.as_deref();
        // Model của kho hỏng mà đúng kích thước: bỏ để phiên sau tải lại (không thì tính năng tắt lặng lẽ mãi).
        let discard = || expected.is_some_and(|sha| models.discard_speaker_model(&app, sha));
        check_before_spawn(launch, expected, integrity::SIDECAR_HASHES, &locks, &discard)
    });
    let (link, _handle) = speaker_client::start(launch, before_spawn);
    log::info!("nhận giọng: bật cho phiên này");
    Some(link)
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

    /// Kế hoạch 02: bản phát hành không bao giờ bật nhận giọng (CI chạy test này ở bản release, bước "Test … ở bản release").
    #[cfg(not(debug_assertions))]
    #[test]
    fn release_builds_never_enable_speaker() {
        assert!(!enabled());
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
        // Binary sai: từ chối trước khi xét model, không bỏ model.
        std::fs::write(&launch.exe, b"da sua").unwrap();
        assert!(check_before_spawn(&launch, Some(&wrong), &table, &locks, &discard).is_err());
        assert_eq!(calls.get(), 1, "binary sai: không đụng model");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
