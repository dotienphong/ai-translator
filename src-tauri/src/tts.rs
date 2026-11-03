//! Giọng đọc bản dịch (spec 2026-11-02-doc-ban-dich-tts-design): nối `tts-client` (quản lý tiến trình `tts-worker`) với giao diện.
//!
//! - **Mặc định không có tác dụng.** Tính năng chỉ hiện khi có đủ binary `tts-worker` đã đóng gói (và qua kiểm SHA-256 như mọi tiến
//!   trình phụ, §10.2) và gói model giọng đọc. Thiếu một trong hai thì [`status`] báo `available: false` và không chạy gì.
//! - Chạy lười: worker chỉ chạy khi giao diện gọi [`warmup`] hay [`speak`]; rảnh 5 phút thì `tts-client` tắt nó.
//! - Âm thanh đi về giao diện qua `Channel` (nhị phân, PCM `i16` little-endian 48 kHz mono) và phát bằng Web Audio, nên app không
//!   thêm thư viện âm thanh native. Thông báo kết thúc đi cùng kênh dạng JSON (`{"kind":"done"}` / `{"kind":"failed","code":…}`).
//! - **Chặn thu khi đang đọc** (spec §5): Windows thu mọi âm thanh máy qua loopback (§6.1), nên tiếng đọc của chính app sẽ bị nhận
//!   dạng thành phụ đề giả. Trong lúc đọc, `capture::Pre::drain` thay mẫu của dòng nhận dạng và VAD bằng 0 ([`is_playing`]); dòng thời
//!   gian giữ nguyên, VAD coi như im lặng. Cờ tự hết hạn (không thể kẹt ở "đang đọc"): [`mark_playing`] chỉ gia hạn một khoảng ngắn.
//! - Log chỉ có số đếm và lý do, không có chữ hay âm thanh.

use crate::errors::CommandError;
use crate::models::service::ModelService;
use crate::sidecar::{integrity, paths};
use pipeline::process;
use serde::Serialize;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Manager, Runtime};
use tts_client::{Config, Event, Failure, Language, Spawner, TtsClient};

/// Tên tiến trình phụ (file theo quy ước `paths::file_name`).
pub const WORKER: &str = "tts-worker";
/// Chữ cần đọc dài tối đa chừng này byte (khớp giới hạn của giao thức).
pub const MAX_TEXT_BYTES: usize = 4_000;
/// Mỗi lần giao diện gia hạn cờ chặn thu tối đa chừng này (ms): cờ không thể kẹt lâu nếu giao diện hỏng.
const MAX_MARK_MS: u64 = 15_000;
/// Khoảng đệm cộng thêm khi chính backend gia hạn theo mỗi khung âm thanh gửi đi (ms).
const BACKEND_MARGIN_MS: u64 = 400;

static BASE: OnceLock<Instant> = OnceLock::new();
/// Mốc (ms từ `BASE`) tới khi cờ chặn thu còn hiệu lực.
static PLAYING_UNTIL_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    BASE.get_or_init(Instant::now).elapsed().as_millis() as u64
}

/// Gia hạn cờ chặn thu thêm `ms` (tối đa [`MAX_MARK_MS`]). Chỉ kéo dài, không rút ngắn.
pub fn mark_playing(ms: u64) {
    PLAYING_UNTIL_MS.fetch_max(now_ms() + ms.min(MAX_MARK_MS), Ordering::SeqCst);
}

/// Bỏ cờ chặn thu ngay (người dùng dừng đọc, hay hết câu).
pub fn clear_playing() {
    PLAYING_UNTIL_MS.store(0, Ordering::SeqCst);
}

/// App đang đọc ra loa: `capture::Pre::drain` thay mẫu mới bằng 0. Một lần đọc nguyên tử, rẻ.
pub fn is_playing() -> bool {
    now_ms() < PLAYING_UNTIL_MS.load(Ordering::Relaxed)
}

/// Các file cần có để đọc được.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TtsFiles {
    pub exe: PathBuf,
    pub onnx_dir: PathBuf,
    pub codec_dir: PathBuf,
    pub g2p_dict: PathBuf,
    pub voices: PathBuf,
    pub ort_lib: PathBuf,
}

const MODEL_FILES: &[&str] = &[
    "vieneu-v3-turbo/onnx_update/config.json",
    "vieneu-v3-turbo/onnx_update/tokenizer.json",
    "vieneu-v3-turbo/onnx_update/vieneu_prefill.onnx",
    "vieneu-v3-turbo/onnx_update/vieneu_decode_step.onnx",
    "vieneu-v3-turbo/onnx_update/vieneu_acoustic_cached.onnx",
    "vieneu-v3-turbo/onnx_update/vieneu_backbone_shared.data",
    "vieneu-v3-turbo/onnx_update/vieneu_v3_heads.npz",
    "moss-codec/moss_audio_tokenizer_decode_full.onnx",
    "moss-codec/moss_audio_tokenizer_decode_step.onnx",
    "moss-codec/moss_audio_tokenizer_decode_shared.data",
    "moss-codec/codec_browser_onnx_meta.json",
    "sea_g2p.bin",
    "voices_v3_turbo.json",
];

fn ort_lib_name() -> &'static str {
    if cfg!(windows) {
        "onnxruntime.dll"
    } else if cfg!(target_os = "macos") {
        "libonnxruntime.dylib"
    } else {
        "libonnxruntime.so"
    }
}

/// Tìm đủ file; lý do thiếu là mã ngắn cho giao diện: `workerMissing`, `modelMissing`, `runtimeMissing`.
pub fn locate_files(exe: &Path, root: &Path, dev: bool) -> Result<TtsFiles, &'static str> {
    if !exe.is_file() {
        return Err("workerMissing");
    }
    if MODEL_FILES.iter().any(|f| !root.join(f).is_file()) {
        return Err("modelMissing");
    }
    // ONNX Runtime đi cạnh binary (bản phát hành, đã băm cùng binary); bản dev cho đặt trong thư mục model.
    let beside = exe.parent().map(|d| d.join(ort_lib_name())).filter(|p| p.is_file());
    let in_root = Some(root.join(ort_lib_name())).filter(|p| p.is_file());
    // Bản dev: `binaries/onnxruntime.dll` là của speaker-worker (khác phiên bản), nên bản trong thư mục model được ưu tiên.
    let ort_lib = if dev { in_root.or(beside) } else { beside.or(in_root) }.ok_or("runtimeMissing")?;
    Ok(TtsFiles {
        exe: exe.to_path_buf(),
        onnx_dir: root.join("vieneu-v3-turbo/onnx_update"),
        codec_dir: root.join("moss-codec"),
        g2p_dict: root.join("sea_g2p.bin"),
        voices: root.join("voices_v3_turbo.json"),
        ort_lib,
    })
}

fn model_root<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    if tauri::is_dev() {
        Some(paths::dev_models_dir().join("tts"))
    } else {
        app.path()
            .app_local_data_dir()
            .ok()
            .map(|d| d.join("models").join("tts"))
    }
}

fn locate<R: Runtime>(app: &AppHandle<R>) -> Result<TtsFiles, &'static str> {
    let dir = paths::binaries_dir().map_err(|_| "workerMissing")?;
    let exe = dir.join(paths::file_name(WORKER, paths::TARGET, tauri::is_dev(), cfg!(windows)));
    let root = model_root(app).ok_or("modelMissing")?;
    locate_files(&exe, &root, tauri::is_dev())
}

fn err(code: &str, message: impl Into<String>) -> CommandError {
    CommandError {
        code: code.to_string(),
        field: None,
        message: message.into(),
    }
}

/// Cách chạy worker: kiểm SHA-256 như mọi tiến trình phụ (`integrity::verify`), chạy trong Job Object / process group
/// (`pipeline::process`), stdout riêng cho giao thức, stderr vào `tts-worker.log`.
fn spawner(files: TtsFiles, log: Option<PathBuf>) -> Spawner {
    let locks: Arc<Mutex<Vec<File>>> = Arc::default();
    Arc::new(move || {
        let dir = files
            .exe
            .parent()
            .ok_or_else(|| io::Error::other("tts-worker không có thư mục"))?;
        let verified = integrity::verify(dir, &[files.exe.as_path()], integrity::SIDECAR_HASHES)
            .map_err(|e| io::Error::other(e.to_string()))?;
        if !verified.locks.is_empty() {
            *locks.lock().unwrap_or_else(|e| e.into_inner()) = verified.locks;
        }
        let mut cmd = Command::new(&files.exe);
        cmd.arg("--model-dir")
            .arg(&files.onnx_dir)
            .arg("--codec-dir")
            .arg(&files.codec_dir)
            .arg("--g2p-dict")
            .arg(&files.g2p_dict)
            .arg("--voices")
            .arg(&files.voices)
            .arg("--ort-lib")
            .arg(&files.ort_lib);
        process::configure(&mut cmd);
        let stderr = log
            .as_ref()
            .and_then(|p| std::fs::OpenOptions::new().create(true).append(true).open(p).ok())
            .map_or_else(Stdio::null, Stdio::from);
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(stderr);
        process::spawn(&mut cmd, &files.exe)
    })
}

/// Client của app: tạo ở lần dùng đầu tiên, giữ tới khi thoát.
#[derive(Default)]
pub struct TtsService {
    client: Mutex<Option<Arc<TtsClient>>>,
}

impl TtsService {
    fn existing(&self) -> Option<Arc<TtsClient>> {
        self.client.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn client<R: Runtime>(&self, app: &AppHandle<R>) -> Result<Arc<TtsClient>, CommandError> {
        let mut guard = self.client.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(c) = guard.as_ref() {
            return Ok(c.clone());
        }
        let files = locate(app).map_err(|why| err("ttsUnavailable", why))?;
        let log = app.path().app_log_dir().ok().map(|d| d.join("tts-worker.log"));
        let mut cfg = Config::new(spawner(files, log));
        cfg.notice = Arc::new(|m| log::info!("giọng đọc: {m}"));
        cfg.on_exit = Arc::new(process::release);
        let client = Arc::new(TtsClient::new(cfg));
        *guard = Some(client.clone());
        Ok(client)
    }

    /// Tắt worker khi app thoát (Job Object cũng dọn nếu app chết đột ngột).
    pub fn shutdown(&self) {
        if let Some(c) = self.client.lock().unwrap_or_else(|e| e.into_inner()).take() {
            c.shutdown();
        }
    }
}

/// Trạng thái cho giao diện: có hiện nút nghe không.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsStatus {
    /// Có binary và model, và chưa bị tắt tới hết phiên.
    pub available: bool,
    /// Worker đang chạy (đã hay đang nạp model).
    pub running: bool,
    /// `workerMissing`, `modelMissing`, `runtimeMissing` khi thiếu file; `downloading` khi đang tải gói model giọng đọc về
    /// (manifest có khóa `tts`); `waiting` khi manifest có gói mà việc tải chưa chạy (đang tải gói ASR, ổ thiếu chỗ…) và sẽ thử
    /// lại; `disabled` khi đã bị tắt tới hết phiên.
    pub reason: Option<String>,
    /// Phần trăm đã tải (0–100) khi `reason` là `downloading`.
    pub progress: Option<u8>,
}

/// Phần trăm `done / total`, 0 khi `total` là 0, tối đa 100.
fn percent(done: u64, total: u64) -> u8 {
    if total == 0 {
        return 0;
    }
    (u128::from(done.min(total)) * 100 / u128::from(total)) as u8
}

pub fn status<R: Runtime>(app: &AppHandle<R>, svc: &TtsService) -> TtsStatus {
    if let Err(why) = locate(app) {
        let missing = |reason: &str, progress: Option<u8>| TtsStatus {
            available: false,
            running: false,
            reason: Some(reason.to_string()),
            progress,
        };
        let models = app.try_state::<Arc<ModelService>>();
        if let Some((done, total)) = models.as_ref().and_then(|m| m.tts_progress()) {
            return missing("downloading", Some(percent(done, total)));
        }
        // Thiếu model mà manifest có gói: bắt đầu (hay thử lại) việc tải; giao diện hỏi lại cho tới khi xong.
        if why == "modelMissing"
            && !tauri::is_dev()
            && let Some(models) = models
            && models.tts_offered()
        {
            models.download_tts_pack_in_background();
            return match models.tts_progress() {
                Some((done, total)) => missing("downloading", Some(percent(done, total))),
                None => missing("waiting", None),
            };
        }
        return missing(why, None);
    }
    let client = svc.existing();
    let disabled = client.as_ref().and_then(|c| c.disabled_reason()).is_some();
    TtsStatus {
        available: !disabled,
        running: client.as_ref().is_some_and(|c| c.is_running()),
        reason: disabled.then(|| "disabled".to_string()),
        progress: None,
    }
}

/// Nạp worker sẵn (mất vài giây ở lần đầu), không chờ kết quả.
pub fn warmup<R: Runtime>(app: &AppHandle<R>, svc: &TtsService) -> Result<(), CommandError> {
    svc.client(app)?.warmup(|r| {
        if let Err(f) = r {
            log::info!("giọng đọc: nạp sẵn không được ({})", failure_code(&f));
        }
    });
    Ok(())
}

fn failure_code(f: &Failure) -> &'static str {
    match f {
        Failure::Cancelled => "cancelled",
        Failure::ModelMissing => "modelMissing",
        Failure::BadRequest => "badRequest",
        Failure::Inference => "inference",
        Failure::WorkerDied => "workerDied",
        Failure::Disabled(_) => "disabled",
    }
}

fn parse_lang(lang: &str) -> Result<Language, CommandError> {
    match lang {
        "vi" => Ok(Language::Vi),
        "en" => Ok(Language::En),
        other => Err(err(
            "ttsUnsupportedLanguage",
            format!("chỉ đọc tiếng Việt và tiếng Anh, nhận {other:?}"),
        )),
    }
}

/// Đọc một câu. Âm thanh và thông báo kết thúc đi qua `on_event`; trả `id` để hủy. Câu đang đọc (nếu có) bị hủy.
pub fn speak<R: Runtime>(
    app: &AppHandle<R>,
    svc: &TtsService,
    lang: &str,
    text: &str,
    on_event: Channel<InvokeResponseBody>,
) -> Result<u64, CommandError> {
    let lang = parse_lang(lang)?;
    if text.trim().is_empty() || text.len() > MAX_TEXT_BYTES {
        return Err(err("ttsBadText", "chữ rỗng hoặc quá dài"));
    }
    let client = svc.client(app)?;
    Ok(client.speak(lang, text, None, move |event| match event {
        Event::Audio(pcm) => {
            // 48 kHz: số mẫu / 48 = ms. Gia hạn cờ chặn thu theo đúng độ dài âm thanh vừa gửi.
            mark_playing(pcm.len() as u64 / 48 + BACKEND_MARGIN_MS);
            let bytes: Vec<u8> = pcm.iter().flat_map(|s| s.to_le_bytes()).collect();
            let _ = on_event.send(InvokeResponseBody::Raw(bytes));
        }
        Event::Done => {
            let _ = on_event.send(InvokeResponseBody::Json(r#"{"kind":"done"}"#.to_string()));
        }
        Event::Failed(f) => {
            let body = serde_json::json!({ "kind": "failed", "code": failure_code(&f) }).to_string();
            let _ = on_event.send(InvokeResponseBody::Json(body));
        }
    }))
}

pub fn cancel(svc: &TtsService, id: u64) {
    if let Some(c) = svc.existing() {
        c.cancel(id);
    }
}

/// Dừng mọi câu đang đọc và bỏ cờ chặn thu.
pub fn stop(svc: &TtsService) {
    if let Some(c) = svc.existing() {
        c.cancel_all();
    }
    clear_playing();
}

/// Dùng cho test: chờ một chút rồi kiểm cờ.
#[cfg(test)]
fn sleep_ms(ms: u64) {
    std::thread::sleep(std::time::Duration::from_millis(ms));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-tts-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn touch(root: &Path, rel: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, b"x").unwrap();
    }

    #[test]
    fn playing_flag_expires_and_clears() {
        clear_playing();
        assert!(!is_playing());
        mark_playing(60);
        assert!(is_playing());
        sleep_ms(120);
        assert!(!is_playing(), "tự hết hạn, không thể kẹt");
        mark_playing(10_000);
        assert!(is_playing());
        clear_playing();
        assert!(!is_playing());
    }

    #[test]
    fn mark_only_extends_and_is_capped() {
        clear_playing();
        mark_playing(10_000);
        let long = PLAYING_UNTIL_MS.load(Ordering::SeqCst);
        mark_playing(10); // không rút ngắn
        assert_eq!(PLAYING_UNTIL_MS.load(Ordering::SeqCst), long);
        clear_playing();
        mark_playing(10_000_000);
        assert!(
            PLAYING_UNTIL_MS.load(Ordering::SeqCst) <= now_ms() + MAX_MARK_MS + 5,
            "bị chặn ở MAX_MARK_MS"
        );
        clear_playing();
    }

    #[test]
    fn locate_reports_the_first_missing_piece() {
        let dir = temp("locate");
        let exe = dir.join("bin").join("tts-worker.exe");
        let root = dir.join("models");
        assert_eq!(locate_files(&exe, &root, false), Err("workerMissing"));
        touch(&dir, "bin/tts-worker.exe");
        assert_eq!(locate_files(&exe, &root, false), Err("modelMissing"));
        for f in MODEL_FILES {
            touch(&root, f);
        }
        assert_eq!(locate_files(&exe, &root, false), Err("runtimeMissing"));
        touch(&root, ort_lib_name());
        let files = locate_files(&exe, &root, false).unwrap();
        assert_eq!(files.ort_lib, root.join(ort_lib_name()));
        assert_eq!(files.onnx_dir, root.join("vieneu-v3-turbo/onnx_update"));
        // ONNX Runtime cạnh binary được ưu tiên hơn bản trong thư mục model.
        touch(&dir, &format!("bin/{}", ort_lib_name()));
        assert_eq!(
            locate_files(&exe, &root, false).unwrap().ort_lib,
            dir.join("bin").join(ort_lib_name())
        );
        // Bản dev thì ngược lại.
        assert_eq!(
            locate_files(&exe, &root, true).unwrap().ort_lib,
            root.join(ort_lib_name())
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn download_percent_is_clamped() {
        assert_eq!(percent(0, 0), 0);
        assert_eq!(percent(0, 100), 0);
        assert_eq!(percent(1, 3), 33);
        assert_eq!(percent(520 << 20, 520 << 20), 100);
        assert_eq!(percent(u64::MAX, 10), 100, "không vượt 100");
        assert_eq!(percent(u64::MAX / 2, u64::MAX), 49, "không tràn số");
    }

    #[test]
    fn only_vietnamese_and_english_can_be_read() {
        assert!(parse_lang("vi").is_ok());
        assert!(parse_lang("en").is_ok());
        for l in ["ja", "zh", "ko", "", "VI"] {
            assert_eq!(parse_lang(l).unwrap_err().code, "ttsUnsupportedLanguage");
        }
    }

    #[test]
    fn failure_codes_are_stable() {
        assert_eq!(failure_code(&Failure::Cancelled), "cancelled");
        assert_eq!(failure_code(&Failure::Disabled("x".into())), "disabled");
        assert_eq!(failure_code(&Failure::WorkerDied), "workerDied");
    }
}
