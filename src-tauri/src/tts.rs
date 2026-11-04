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
//! - Giọng, tốc độ, khoảng nghỉ, âm lượng (spec 2026-11-04-giong-doc §6): đọc từ cài đặt ở mỗi câu và kẹp vào khoảng hợp lệ
//!   trước khi gửi worker; âm lượng không vào worker mà nhân vào PCM ở đây ([`apply_volume`]), nên overlay cũng theo.
//! - Log chỉ có số đếm và lý do, không có chữ hay âm thanh.

use crate::errors::CommandError;
use crate::models::service::ModelService;
use crate::settings::{self, Settings};
use crate::sidecar::{integrity, paths};
use crate::state::AppState;
use pipeline::process;
use serde::Serialize;
use std::fs::File;
use std::io;
use std::ops::RangeInclusive;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, mpsc};
use std::time::{Duration, Instant};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Manager, Runtime};
use tts_client::{Config, Event, Failure, Language, Spawner, SpeakOptions, TtsClient};

/// Tên tiến trình phụ (file theo quy ước `paths::file_name`).
pub const WORKER: &str = "tts-worker";
/// Chữ cần đọc dài tối đa chừng này byte (khớp giới hạn của giao thức).
pub const MAX_TEXT_BYTES: usize = 4_000;
/// Mỗi lần giao diện gia hạn cờ chặn thu tối đa chừng này (ms): cờ không thể kẹt lâu nếu giao diện hỏng.
const MAX_MARK_MS: u64 = 15_000;
/// Khoảng đệm cộng thêm khi chính backend gia hạn theo mỗi khung âm thanh gửi đi (ms).
const BACKEND_MARGIN_MS: u64 = 400;
/// Chờ worker trả danh sách giọng tối đa chừng này (worker chỉ đọc file giọng, không nạp model).
const LIST_VOICES_TIMEOUT: Duration = Duration::from_secs(10);

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

/// Danh sách giọng của gói giọng đọc đã cài, cho màn hình "Giọng đọc" (spec 2026-11-04-giong-doc §6).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsVoices {
    pub names: Vec<String>,
    /// Giọng dùng khi cài đặt để `None` (hay tên không còn trong gói).
    pub default: String,
}

/// Client của app: tạo ở lần dùng đầu tiên, giữ tới khi thoát.
#[derive(Default)]
pub struct TtsService {
    client: Mutex<Option<Arc<TtsClient>>>,
    /// Danh sách giọng đã hỏi worker, giữ tới khi gói giọng đổi ([`on_changed`]) hay client được dựng lại.
    voices: Mutex<Option<TtsVoices>>,
    /// Tăng mỗi lần bỏ danh sách đã lưu: kết quả của lần hỏi bắt đầu trước đó không được lưu đè.
    voices_generation: AtomicU64,
}

impl TtsService {
    fn existing(&self) -> Option<Arc<TtsClient>> {
        self.client.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn cached_voices(&self) -> Option<TtsVoices> {
        self.voices.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn voices_generation(&self) -> u64 {
        self.voices_generation.load(Ordering::SeqCst)
    }

    /// Lưu danh sách hỏi được, trừ khi đã bị bỏ (gói đổi) từ lúc bắt đầu hỏi.
    fn store_voices(&self, generation: u64, voices: TtsVoices) {
        let mut guard = self.voices.lock().unwrap_or_else(|e| e.into_inner());
        if self.voices_generation() == generation {
            *guard = Some(voices);
        }
    }

    /// Bỏ danh sách giọng đã lưu; lần hỏi sau đọc lại file giọng.
    fn forget_voices(&self) {
        let mut guard = self.voices.lock().unwrap_or_else(|e| e.into_inner());
        self.voices_generation.fetch_add(1, Ordering::SeqCst);
        *guard = None;
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
        self.forget_voices();
        Ok(client)
    }

    /// Tắt worker khi app thoát (Job Object cũng dọn nếu app chết đột ngột).
    pub fn shutdown(&self) {
        if let Some(c) = self.client.lock().unwrap_or_else(|e| e.into_inner()).take() {
            c.shutdown();
        }
        self.forget_voices();
    }
}

/// Gói giọng đọc vừa đổi (`events::tts_changed`): bỏ danh sách giọng đã lưu. Rẻ khi chưa có dịch vụ.
pub fn on_changed<R: Runtime>(app: &AppHandle<R>) {
    if let Some(svc) = app.try_state::<TtsService>() {
        svc.forget_voices();
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
            models.download_tts_pack_in_background(app);
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

/// Nhân âm lượng `percent`% (0–100) vào PCM, làm tròn ra xa 0. Chỉ giảm, không khuếch đại: từ 100 trở lên giữ nguyên, nên
/// không tràn và không méo tiếng (spec 2026-11-04-giong-doc §6).
pub fn apply_volume(pcm: &mut [i16], percent: u8) {
    if percent >= settings::TTS_VOLUME_MAX {
        return;
    }
    let p = i32::from(percent);
    for s in pcm.iter_mut() {
        let x = i32::from(*s) * p;
        // |x / 100| ≤ |s| vì p < 100, nên kết quả luôn nằm trong `i16`.
        *s = ((x + if x >= 0 { 50 } else { -50 }) / 100) as i16;
    }
}

/// Kẹp `v` vào `range`; giá trị không hữu hạn (`NaN`, vô cực) thành 1,0 (bình thường). Worker từ chối khung lệnh có giá trị
/// ngoài khoảng, nên mọi giá trị gửi đi phải qua đây.
fn clamp_or_neutral(v: f32, range: &RangeInclusive<f32>) -> f32 {
    if v.is_finite() {
        v.clamp(*range.start(), *range.end())
    } else {
        1.0
    }
}

/// Tên giọng gửi được cho worker: rỗng hay dài quá giới hạn thì `None` (giọng mặc định của gói).
fn usable_voice(voice: Option<String>) -> Option<String> {
    voice.filter(|v| !v.is_empty() && v.len() <= settings::TTS_VOICE_MAX_BYTES)
}

/// Tùy chọn đọc từ tham số của nút Nghe thử (hay cài đặt): giọng hợp lệ, tốc độ và khoảng nghỉ đã kẹp.
fn preview_options(voice: Option<String>, speed: f32, pause: f32) -> SpeakOptions {
    SpeakOptions::new(
        usable_voice(voice),
        clamp_or_neutral(speed, &settings::TTS_SPEED),
        clamp_or_neutral(pause, &settings::TTS_PAUSE),
    )
}

/// Tùy chọn đọc theo cài đặt: giọng theo ngôn ngữ của câu, tốc độ và khoảng nghỉ kẹp vào khoảng hợp lệ (file cài đặt sửa tay
/// sai vẫn đọc bình thường).
fn options_for(settings: &Settings, lang: Language) -> SpeakOptions {
    let (saved, default) = match lang {
        Language::Vi => (settings.tts_voice_vi.clone(), crate::settings::TTS_DEFAULT_VOICE_VI),
        Language::En => (settings.tts_voice_en.clone(), crate::settings::TTS_DEFAULT_VOICE_EN),
    };
    let mut options = preview_options(saved, settings.tts_speed, settings.tts_pause);
    // Chưa chọn giọng (file cài đặt của bản trước lưu `null`) hay tên không dùng được: giọng mặc định của ngôn ngữ.
    options.voice.get_or_insert_with(|| default.to_string());
    options
}

fn check_text(text: &str) -> Result<(), CommandError> {
    if text.trim().is_empty() || text.len() > MAX_TEXT_BYTES {
        return Err(err("ttsBadText", "chữ rỗng hoặc quá dài"));
    }
    Ok(())
}

/// Đọc một câu theo cài đặt giọng đọc hiện tại. Âm thanh và thông báo kết thúc đi qua `on_event`; trả `id` để hủy. Câu đang
/// đọc (nếu có) bị hủy. Chưa có `AppState` (test dựng app không có trạng thái) thì đọc như mặc định.
pub fn speak<R: Runtime>(
    app: &AppHandle<R>,
    svc: &TtsService,
    lang: &str,
    text: &str,
    on_event: Channel<InvokeResponseBody>,
) -> Result<u64, CommandError> {
    let lang = parse_lang(lang)?;
    check_text(text)?;
    let (opts, volume) = match app.try_state::<AppState>() {
        Some(state) => {
            let s = state.settings();
            (options_for(&s, lang), s.tts_volume)
        }
        None => (SpeakOptions::default(), settings::TTS_VOLUME_MAX),
    };
    start(app, svc, lang, text, opts, volume, on_event)
}

/// Nút Nghe thử (spec 2026-11-04-giong-doc §6): như [`speak`] nhưng dùng giá trị đang chỉnh trên màn hình, chưa cần lưu (cũng
/// kẹp như cài đặt).
#[allow(clippy::too_many_arguments)]
pub fn preview<R: Runtime>(
    app: &AppHandle<R>,
    svc: &TtsService,
    lang: &str,
    text: &str,
    voice: Option<String>,
    speed: f32,
    pause: f32,
    volume: u8,
    on_event: Channel<InvokeResponseBody>,
) -> Result<u64, CommandError> {
    let lang = parse_lang(lang)?;
    check_text(text)?;
    let opts = preview_options(voice, speed, pause);
    start(app, svc, lang, text, opts, volume, on_event)
}

fn start<R: Runtime>(
    app: &AppHandle<R>,
    svc: &TtsService,
    lang: Language,
    text: &str,
    opts: SpeakOptions,
    volume: u8,
    on_event: Channel<InvokeResponseBody>,
) -> Result<u64, CommandError> {
    let client = svc.client(app)?;
    Ok(client.speak(lang, text, opts, move |event| match event {
        Event::Audio(mut pcm) => {
            // Âm lượng áp ở đây nên cửa sổ chính lẫn overlay (Nghe dịch) đều theo.
            apply_volume(&mut pcm, volume);
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

/// Danh sách giọng của gói đã cài (lưu lại tới khi gói đổi). Chặn tới khi worker trả lời (tối đa [`LIST_VOICES_TIMEOUT`]),
/// nên lệnh gọi hàm này chạy trên luồng của `spawn_blocking`. Thiếu worker/model hay worker không trả lời: `ttsUnavailable`.
pub fn list_voices<R: Runtime>(app: &AppHandle<R>, svc: &TtsService) -> Result<TtsVoices, CommandError> {
    if let Some(v) = svc.cached_voices() {
        return Ok(v);
    }
    let client = svc.client(app)?;
    let generation = svc.voices_generation();
    let (tx, rx) = mpsc::channel();
    client.list_voices(move |r| {
        let _ = tx.send(r);
    });
    match rx.recv_timeout(LIST_VOICES_TIMEOUT) {
        Ok(Ok(list)) => {
            let voices = TtsVoices {
                names: list.names,
                default: list.default,
            };
            svc.store_voices(generation, voices.clone());
            Ok(voices)
        }
        Ok(Err(f)) => Err(err("ttsUnavailable", failure_code(&f))),
        Err(_) => Err(err("ttsUnavailable", "worker không trả danh sách giọng")),
    }
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
    fn apply_volume_scales_and_never_overflows() {
        let src = [0i16, 1, -1, 3, -3, 1_000, -1_000, i16::MAX, i16::MIN];
        let mut full = src;
        apply_volume(&mut full, 100);
        assert_eq!(full, src, "100% giữ nguyên từng mẫu");
        let mut over = src;
        apply_volume(&mut over, 255);
        assert_eq!(over, src, "trên 100% không khuếch đại");
        let mut half = src;
        apply_volume(&mut half, 50);
        assert_eq!(half, [0, 1, -1, 2, -2, 500, -500, 16_384, -16_384], "làm tròn ra xa 0");
        let mut mute = src;
        apply_volume(&mut mute, 0);
        assert!(mute.iter().all(|&s| s == 0));
        for p in 0..=100u8 {
            let mut edge = [i16::MAX, i16::MIN];
            apply_volume(&mut edge, p); // không panic, không tràn
            assert!(edge[0] >= 0 && edge[1] <= 0);
        }
    }

    #[test]
    fn options_default_settings_are_neutral() {
        let s = Settings::defaults(crate::settings::UiLanguage::Vi);
        for lang in [Language::Vi, Language::En] {
            let o = options_for(&s, lang);
            assert_eq!(o.speed, 1.0);
            assert_eq!(o.pause_scale, 1.0);
        }
        assert_eq!(s.tts_volume, 100);
        assert_eq!(options_for(&s, Language::Vi).voice.as_deref(), Some("Thục Đoan"));
        assert_eq!(options_for(&s, Language::En).voice.as_deref(), Some("Đức Trí"));
    }

    #[test]
    fn options_use_the_language_default_when_no_voice_was_saved() {
        // File cài đặt của bản trước lưu `null`: đọc bằng giọng mặc định của ngôn ngữ, không phải giọng mặc định của gói.
        let mut s = Settings::defaults(crate::settings::UiLanguage::Vi);
        s.tts_voice_vi = None;
        s.tts_voice_en = None;
        assert_eq!(options_for(&s, Language::Vi).voice.as_deref(), Some("Thục Đoan"));
        assert_eq!(options_for(&s, Language::En).voice.as_deref(), Some("Đức Trí"));
    }

    #[test]
    fn options_pick_voice_by_language() {
        let mut s = Settings::defaults(crate::settings::UiLanguage::Vi);
        s.tts_voice_vi = Some("Ngọc Huyền".into());
        s.tts_voice_en = Some("Minh Quân".into());
        s.tts_speed = 1.2;
        s.tts_pause = 1.5;
        let vi = options_for(&s, Language::Vi);
        let en = options_for(&s, Language::En);
        assert_eq!(vi.voice.as_deref(), Some("Ngọc Huyền"));
        assert_eq!(en.voice.as_deref(), Some("Minh Quân"));
        assert_eq!((vi.speed, vi.pause_scale), (1.2, 1.5));
        assert_eq!((en.speed, en.pause_scale), (1.2, 1.5));
    }

    #[test]
    fn options_clamp_bad_values() {
        let mut s = Settings::defaults(crate::settings::UiLanguage::Vi);
        s.tts_speed = f32::NAN;
        s.tts_pause = -1.0;
        let o = options_for(&s, Language::Vi);
        assert_eq!((o.speed, o.pause_scale), (1.0, 0.5));
        s.tts_speed = 9.0;
        s.tts_pause = f32::INFINITY;
        let o = options_for(&s, Language::Vi);
        assert_eq!((o.speed, o.pause_scale), (1.3, 1.0));
        s.tts_speed = 0.1;
        s.tts_pause = 99.0;
        let o = options_for(&s, Language::Vi);
        assert_eq!((o.speed, o.pause_scale), (0.8, 2.0));
        assert_eq!(clamp_or_neutral(f32::NEG_INFINITY, &settings::TTS_SPEED), 1.0);
    }

    #[test]
    fn options_drop_voice_names_the_worker_would_reject() {
        // Tên rỗng hay quá dài (file cài đặt sửa tay, hay giao diện gửi lên) mà gửi đi thì worker từ chối khung lệnh:
        // rơi về giọng mặc định thay vì hỏng (spec 2026-11-04-giong-doc §3.4).
        let mut s = Settings::defaults(crate::settings::UiLanguage::Vi);
        s.tts_voice_vi = Some(String::new());
        s.tts_voice_en = Some("x".repeat(settings::TTS_VOICE_MAX_BYTES + 1));
        assert_eq!(options_for(&s, Language::Vi).voice.as_deref(), Some("Thục Đoan"));
        assert_eq!(options_for(&s, Language::En).voice.as_deref(), Some("Đức Trí"));
        let longest = "x".repeat(settings::TTS_VOICE_MAX_BYTES);
        assert_eq!(preview_options(Some(longest.clone()), 1.0, 1.0).voice, Some(longest));
        let o = preview_options(Some(String::new()), f32::NAN, 7.0);
        assert_eq!((o.voice, o.speed, o.pause_scale), (None, 1.0, 2.0));
    }

    #[test]
    fn voice_cache_is_dropped_when_the_pack_changes() {
        let svc = TtsService::default();
        let list = TtsVoices {
            names: vec!["A".into(), "B".into()],
            default: "A".into(),
        };
        let generation = svc.voices_generation();
        svc.store_voices(generation, list.clone());
        assert_eq!(svc.cached_voices(), Some(list.clone()));
        svc.forget_voices();
        assert_eq!(svc.cached_voices(), None);
        // Kết quả của lần hỏi bắt đầu trước khi gói đổi không được lưu lại.
        svc.store_voices(generation, list.clone());
        assert_eq!(svc.cached_voices(), None);
        svc.store_voices(svc.voices_generation(), list.clone());
        assert_eq!(svc.cached_voices(), Some(list));
        svc.shutdown();
        assert_eq!(svc.cached_voices(), None, "dựng lại client thì hỏi lại");
    }

    #[test]
    fn voices_serialize_in_camel_case() {
        let v = TtsVoices {
            names: vec!["A".into()],
            default: "A".into(),
        };
        assert_eq!(
            serde_json::to_value(&v).unwrap(),
            serde_json::json!({ "names": ["A"], "default": "A" })
        );
    }

    #[test]
    fn failure_codes_are_stable() {
        assert_eq!(failure_code(&Failure::Cancelled), "cancelled");
        assert_eq!(failure_code(&Failure::Disabled("x".into())), "disabled");
        assert_eq!(failure_code(&Failure::WorkerDied), "workerDied");
    }
}
