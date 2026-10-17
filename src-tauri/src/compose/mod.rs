//! Gõ dịch (spec 2026-10-17-go-dich-design.md): ô soạn nổi, người dùng gõ tin nhắn bằng tiếng của mình, app dịch rồi dán bản
//! dịch vào ô nhập của app đang dùng.
//!
//! - `target`: ngôn ngữ đích tự động, "tiếng người bên kia" (spec §2.1).
//! - `detect`: nhận diện ngôn ngữ của chữ gõ theo chữ viết (spec §2.2).
//! - `worker`: dịch từng dòng bằng đúng hàm dịch của phụ đề (spec §3.3).
//! - `native_macos`, `native_windows`: cửa sổ ô soạn và việc dán trên từng hệ điều hành (spec §3.1, §4.2, §4.3).
//! - Phần ở đây: trạng thái của ô soạn, yêu cầu dịch (một luồng nền; yêu cầu mới hủy yêu cầu cũ), dán (spec §4), và việc của
//!   các lệnh `compose_*` (cửa sổ `compose`, spec §3.6). Thao tác trên cửa sổ và với hệ điều hành (hiện, ẩn, clipboard, gửi
//!   phím dán) đi qua trait [`Native`], để test dùng bản giả (`test_support::FakeNative`).
//!
//! Chữ gõ và bản dịch chỉ nằm trong bộ nhớ (spec §6): không ghi vào file nào, log chỉ có số liệu (số ký tự, số dòng, thời gian,
//! kết quả, mã lỗi).

pub mod detect;
pub mod target;
pub mod worker;

#[cfg(target_os = "macos")]
mod native_macos;
#[cfg(target_os = "macos")]
use native_macos as platform;

#[cfg(test)]
mod tests;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;

use pipeline::prompt::Lang as MtLang;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::settings::{Lang, Theme, UiLanguage};
use crate::state::AppState;
use crate::{actions, events, license, session, system};
use detect::Detected;
use worker::{Piece, Stop};

pub const LABEL: &str = "compose";
/// Chữ gõ dài tối đa, tính theo ký tự: giới hạn dữ liệu từ giao diện (spec §1.2; §10.2 của spec gốc).
pub const MAX_TEXT_CHARS: usize = 4000;
/// Bề rộng và chiều cao của ô soạn, px logic (spec §1.2). Giao diện xin đổi chiều cao theo nội dung, trong khoảng này.
pub const WIDTH: f64 = 560.0;
pub const MIN_HEIGHT: f64 = 120.0;
pub const MAX_HEIGHT: f64 = 420.0;

/// Thao tác trên cửa sổ ô soạn và với hệ điều hành. Bản thật ở `native_macos.rs`, `native_windows.rs` (kế hoạch 03); test dùng
/// bản giả ghi lại từng lần gọi.
pub trait Native: Send + Sync + 'static {
    /// Hiện ô soạn giữa màn hình đang có con trỏ chuột, mép trên ở 25% chiều cao màn hình (spec §1.2), rồi đưa bàn phím vào ô
    /// gõ. Windows nhớ cửa sổ đang ở phía trước trước khi hiện (spec §3.1).
    fn show(&self) -> tauri::Result<()>;
    /// Ẩn ô soạn; chờ tới khi đã ẩn.
    fn hide(&self) -> tauri::Result<()>;
    fn visible(&self) -> bool;
    /// Đổi chiều cao (px logic), giữ mép trên.
    fn set_height(&self, height: f64) -> tauri::Result<()>;
    /// Có quyền gửi phím vào app khác không: macOS là quyền Trợ năng (`AXIsProcessTrusted`), Windows luôn có. Hỏi lại mỗi lần,
    /// vì quyền có thể mất sau khi cập nhật (spec §4.2).
    fn trusted(&self) -> bool;
    /// macOS: hỏi quyền Trợ năng (`AXIsProcessTrustedWithOptions` có hỏi), để app hiện trong danh sách của System Settings.
    fn request_trust(&self);
    /// Ghi chữ vào clipboard, dạng văn bản thuần.
    fn set_clipboard(&self, text: &str) -> Result<(), String>;
    /// Gọi sau khi ô soạn đã ẩn: chờ cửa sổ của app trước nhận lại bàn phím (Windows: đưa nó về phía trước) rồi gửi phím dán.
    /// `false` khi không đưa được cửa sổ đó về: không gửi phím, người dùng tự dán từ clipboard.
    fn paste(&self) -> bool;
}

/// Phần cài đặt mà ô soạn cần (spec §1.2, §1.4), gửi kèm mỗi lần mở (`compose://open`) và qua lệnh `get_compose_view`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeView {
    pub ui_language: UiLanguage,
    pub theme: Theme,
    /// Ngôn ngữ đang dịch sang, đã tính "Tự động" (spec §2.1).
    pub target: Lang,
    /// Enter tự dán (Windows luôn; macOS theo `compose.autoPaste`) hay chỉ chép.
    pub auto_paste: bool,
    /// Bản quyền đang chặn Gõ dịch: mã lỗi (`trialEnded`…); `None` là dùng được (spec §1.5).
    pub blocked: Option<String>,
    /// `macos` hay `windows`: giao diện ghi ⌘V hay Ctrl+V.
    pub platform: &'static str,
}

/// Kết quả của một yêu cầu dịch, gửi qua `compose://done`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Outcome {
    /// Bản dịch đủ của mọi dòng.
    Translated { text: String },
    /// Chữ gõ chắc chắn đã là ngôn ngữ đích: không dịch; Enter dán nguyên văn (spec §2.2).
    SameLanguage,
    /// Không dịch được; `code` là mã lỗi (`error.<code>`). Enter dịch lại, không bao giờ dán câu gốc (spec §1.3).
    Failed { code: String },
}

/// `compose://done`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Done {
    pub id: u64,
    pub outcome: Outcome,
}

/// `compose://delta`: phần chữ dịch mới của một dòng; `reset` là lần dịch đầu của dòng đó hỏng, bỏ phần đã hiện.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Delta {
    pub id: u64,
    pub line: usize,
    pub text: String,
    pub reset: bool,
}

/// `compose://loading`: yêu cầu `id` đang chờ nạp model ("Đang nạp model…", spec §3.4).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Loading {
    pub id: u64,
}

/// Kết quả của lệnh dán (spec §4.1, §4.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Submitted {
    /// Đã ẩn ô soạn và gửi phím dán vào app trước.
    Pasted,
    /// Đã chép vào clipboard và ẩn ô soạn (tắt tự dán, hay không đưa được cửa sổ trước về): người dùng tự dán.
    Copied,
    /// macOS, bật tự dán mà chưa có quyền Trợ năng: đã chép, ô soạn không đóng, giao diện hiện hộp quyền (spec §4.2).
    NeedsPermission,
}

/// Màn hình của cửa sổ chính mà ô soạn mở được, từ nút của hộp lỗi (spec §5).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MainScreen {
    /// Cài đặt › Model (chưa có model, model hỏng, đang tải).
    Models,
    /// Nâng cấp (hết dùng thử).
    Upgrade,
    /// Cài đặt › Bản quyền (key xung đột, cần làm mới, bị thu hồi).
    License,
    /// Màn hình chính (lỗi khác).
    Home,
}

/// Trạng thái của Gõ dịch, quản lý bằng `app.manage`.
pub struct Compose {
    native: Box<dyn Native>,
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// Số của yêu cầu dịch gần nhất, tăng dần từ 1.
    latest: u64,
    /// Cờ hủy của yêu cầu đang chạy.
    cancel: Option<Arc<AtomicBool>>,
    /// Chữ để dán của yêu cầu gần nhất đã xong: bản dịch, hay chữ gốc khi đã là ngôn ngữ đích.
    ready: Option<(u64, String)>,
    /// Nơi gửi yêu cầu cho luồng dịch, tạo ở lần dịch đầu tiên.
    queue: Option<Sender<Request>>,
}

struct Request {
    id: u64,
    text: String,
    cancel: Arc<AtomicBool>,
}

impl Compose {
    pub fn new(native: Box<dyn Native>) -> Self {
        Self {
            native,
            inner: Mutex::new(Inner::default()),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Hủy yêu cầu đang chạy (nếu có): luồng dịch bỏ kết quả của nó.
    fn cancel_current(&self) {
        if let Some(cancel) = self.lock().cancel.take() {
            cancel.store(true, Ordering::SeqCst);
        }
    }
}

/// Tạo ô soạn ẩn sẵn lúc mở app (spec §3.1) và cài bản thật của [`Native`]. Gọi một lần ở `setup`, trên luồng chính.
pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let native = platform::create(app, &app.package_info().name)?;
    app.manage(Compose::new(Box::new(native)));
    Ok(())
}

fn state<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::State<'_, Compose>, CommandError> {
    app.try_state::<Compose>()
        .ok_or_else(|| CommandError::new(errors::UNKNOWN, None, "chưa có ô soạn"))
}

/// Phần cài đặt của ô soạn lúc này.
pub fn view<R: Runtime>(app: &AppHandle<R>) -> ComposeView {
    let settings = app.state::<AppState>().settings();
    ComposeView {
        ui_language: settings.ui_language,
        theme: settings.theme,
        target: target::resolve(&settings),
        auto_paste: !cfg!(target_os = "macos") || settings.compose.auto_paste,
        blocked: license::app::compose_check(app).err().map(|e| e.code),
        platform: if cfg!(target_os = "macos") { "macos" } else { "windows" },
    }
}

/// Phím tắt Gõ dịch (spec §1.3): ô đang mở thì đóng (như Esc), đang đóng thì mở.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let Some(compose) = app.try_state::<Compose>() else {
        return;
    };
    if compose.native.visible() {
        close(app);
    } else {
        open(app);
    }
}

/// Mở ô soạn (spec §1.1 bước 2): gửi phần cài đặt của nó (`compose://open`) rồi hiện. Gõ dịch dùng được thì chạy sẵn hai tiến
/// trình phụ trên luồng nền (`session::prewarm`), để lần dịch đầu ít phải chờ nạp model.
pub fn open<R: Runtime>(app: &AppHandle<R>) {
    let Some(compose) = app.try_state::<Compose>() else {
        return;
    };
    let view = view(app);
    let usable = view.blocked.is_none();
    events::compose_open(app, &view);
    if let Err(e) = compose.native.show() {
        log::warn!("không hiện được ô soạn: {e}");
        return;
    }
    if usable {
        session::prewarm(app);
    }
}

/// Đóng ô soạn (Esc, phím tắt, bấm ra ngoài; spec §1.3): hủy yêu cầu dịch đang chạy rồi ẩn. Bản nháp nằm ở giao diện, không mất.
pub fn close<R: Runtime>(app: &AppHandle<R>) {
    let Some(compose) = app.try_state::<Compose>() else {
        return;
    };
    compose.cancel_current();
    if let Err(e) = compose.native.hide() {
        log::warn!("không ẩn được ô soạn: {e}");
    }
}

/// Đổi chiều cao của ô soạn theo nội dung (lệnh `compose_resize`), trong khoảng [`MIN_HEIGHT`]–[`MAX_HEIGHT`].
pub fn resize<R: Runtime>(app: &AppHandle<R>, height: f64) -> Result<(), CommandError> {
    if !height.is_finite() {
        return Err(CommandError::new(errors::UNKNOWN, None, "chiều cao không hợp lệ"));
    }
    state(app)?
        .native
        .set_height(height.clamp(MIN_HEIGHT, MAX_HEIGHT))
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))
}

/// Xin dịch `text` (lệnh `compose_translate`): trả số của yêu cầu; kết quả tới qua `compose://delta` và `compose://done` (spec
/// §3.3). Yêu cầu mới hủy yêu cầu đang chạy; chữ để dán của yêu cầu cũ không còn dùng được.
pub fn request<R: Runtime>(app: &AppHandle<R>, text: String) -> Result<u64, CommandError> {
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err(CommandError::new(errors::COMPOSE_TOO_LONG, None, "quá 4000 ký tự"));
    }
    let compose = state(app)?;
    let mut inner = compose.lock();
    if let Some(old) = inner.cancel.take() {
        old.store(true, Ordering::SeqCst);
    }
    inner.latest += 1;
    inner.ready = None;
    let id = inner.latest;
    let cancel = Arc::new(AtomicBool::new(false));
    inner.cancel = Some(cancel.clone());
    let queue = inner.queue.get_or_insert_with(|| spawn_worker(app.clone()));
    queue
        .send(Request { id, text, cancel })
        .map_err(|_| CommandError::new(errors::UNKNOWN, None, "luồng dịch đã dừng"))?;
    Ok(id)
}

/// Luồng dịch của ô soạn: lần lượt từng yêu cầu; yêu cầu đã bị hủy trước khi tới lượt thì bỏ qua.
fn spawn_worker<R: Runtime>(app: AppHandle<R>) -> Sender<Request> {
    let (tx, rx) = mpsc::channel::<Request>();
    std::thread::spawn(move || {
        for request in rx {
            if !request.cancel.load(Ordering::SeqCst) {
                run(&app, &request);
            }
        }
    });
    tx
}

fn run<R: Runtime>(app: &AppHandle<R>, request: &Request) {
    let started = Instant::now();
    let Some(outcome) = translate(app, request) else {
        return;
    };
    let Some(compose) = app.try_state::<Compose>() else {
        return;
    };
    {
        let mut inner = compose.lock();
        // Đã có yêu cầu mới hơn, hay ô soạn đã đóng: bỏ kết quả.
        if inner.latest != request.id || request.cancel.load(Ordering::SeqCst) {
            return;
        }
        inner.ready = match &outcome {
            Outcome::Translated { text } => Some((request.id, text.clone())),
            Outcome::SameLanguage => Some((request.id, request.text.clone())),
            Outcome::Failed { .. } => None,
        };
    }
    let kind = match &outcome {
        Outcome::Translated { .. } => "đã dịch",
        Outcome::SameLanguage => "đã là ngôn ngữ đích",
        Outcome::Failed { code } => code.as_str(),
    };
    // Chỉ số liệu, không bao giờ có chữ (spec §6).
    log::info!(
        "Gõ dịch: {} ký tự, {} dòng, {} ms, {kind}",
        request.text.chars().count(),
        request.text.split('\n').count(),
        started.elapsed().as_millis()
    );
    events::compose_done(
        app,
        &Done {
            id: request.id,
            outcome,
        },
    );
}

/// Dịch một yêu cầu. `None` khi yêu cầu bị hủy giữa chừng.
fn translate<R: Runtime>(app: &AppHandle<R>, request: &Request) -> Option<Outcome> {
    if let Err(e) = license::app::compose_check(app) {
        return Some(Outcome::Failed { code: e.code });
    }
    let tgt = target::resolve(&app.state::<AppState>().settings());
    let detected = detect::detect(&request.text);
    if detected == Detected::Sure(tgt) {
        return Some(Outcome::SameLanguage);
    }
    let src = detect::job_source(detected, tgt);
    let id = request.id;
    let translated = session::with_compose_mt(
        app,
        || events::compose_loading(app, &Loading { id }),
        |mt, cfg| {
            worker::translate_text(
                mt,
                cfg,
                &request.text,
                mt_lang(src),
                mt_lang(tgt),
                &request.cancel,
                &mut |piece| {
                    let (line, text, reset) = match piece {
                        Piece::Delta { line, text } => (line, text, false),
                        Piece::Retry { line } => (line, "", true),
                    };
                    events::compose_delta(
                        app,
                        &Delta {
                            id,
                            line,
                            text: text.to_string(),
                            reset,
                        },
                    );
                },
            )
        },
    );
    match translated {
        Err(e) => Some(Outcome::Failed { code: e.code }),
        Ok(Err(Stop::Cancelled)) => None,
        Ok(Err(Stop::Failed(code))) => Some(Outcome::Failed { code: code.into() }),
        Ok(Ok(text)) => Some(Outcome::Translated { text }),
    }
}

fn mt_lang(lang: Lang) -> MtLang {
    match lang {
        Lang::En => MtLang::En,
        Lang::Zh => MtLang::Zh,
        Lang::Ja => MtLang::Ja,
        Lang::Ko => MtLang::Ko,
        Lang::Vi => MtLang::Vi,
    }
}

/// Dán kết quả của yêu cầu `id` (lệnh `compose_submit`; spec §4.1). Chỉ dán chữ phía Rust đã lưu cho yêu cầu gần nhất đã xong,
/// không nhận chữ từ giao diện (spec §3.6), nên cửa sổ ô soạn không gửi được chữ tùy ý vào app khác. Chặn trong lúc chờ cửa sổ
/// trước nhận lại bàn phím: gọi từ luồng nền.
pub fn submit<R: Runtime>(app: &AppHandle<R>, id: u64) -> Result<Submitted, CommandError> {
    let compose = state(app)?;
    let text = match &compose.lock().ready {
        Some((ready, text)) if *ready == id => text.clone(),
        _ => {
            return Err(CommandError::new(
                errors::UNKNOWN,
                None,
                "chưa có kết quả của yêu cầu này",
            ));
        }
    };
    compose
        .native
        .set_clipboard(&text)
        .map_err(|e| CommandError::new(errors::COPY_FAILED, None, e))?;
    compose.lock().ready = None;
    let auto = !cfg!(target_os = "macos") || app.state::<AppState>().settings().compose.auto_paste;
    if auto && !compose.native.trusted() {
        return Ok(Submitted::NeedsPermission);
    }
    compose
        .native
        .hide()
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?;
    if !auto {
        return Ok(Submitted::Copied);
    }
    Ok(if compose.native.paste() {
        Submitted::Pasted
    } else {
        Submitted::Copied
    })
}

/// "Bật tự dán" ở hộp quyền (spec §4.2, chỉ macOS): hỏi quyền Trợ năng để app hiện trong danh sách, rồi mở trang Trợ năng của
/// System Settings (qua `SystemOpener`, như mọi việc mở ra ngoài app).
pub fn open_accessibility<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    if !cfg!(target_os = "macos") {
        return Err(CommandError::new(errors::UNSUPPORTED, None, "chỉ có trên macOS"));
    }
    state(app)?.native.request_trust();
    system::open_accessibility_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
}

/// "Luôn chỉ chép" ở hộp quyền (spec §4.2): tắt tự dán.
pub fn copy_only<R: Runtime>(app: &AppHandle<R>) {
    let mut next = app.state::<AppState>().settings();
    next.compose.auto_paste = false;
    actions::commit_settings(app, next);
}

/// Nút của hộp lỗi (spec §5): đóng ô soạn rồi mở cửa sổ chính ở màn hình cần làm.
pub fn open_main<R: Runtime>(app: &AppHandle<R>, screen: MainScreen) {
    close(app);
    let target = match screen {
        MainScreen::Models => events::Navigate {
            screen: "settings",
            settings_group: Some("model"),
        },
        MainScreen::Upgrade => events::Navigate {
            screen: "upgrade",
            settings_group: None,
        },
        MainScreen::License => events::Navigate {
            screen: "settings",
            settings_group: Some("license"),
        },
        MainScreen::Home => events::Navigate {
            screen: "home",
            settings_group: None,
        },
    };
    actions::open_main_at(app, target);
}
