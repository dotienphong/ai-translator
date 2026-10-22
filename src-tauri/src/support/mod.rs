//! Chat hỗ trợ trong app (spec 2026-10-22-chat-ho-tro-zalo-design.md §4; kế hoạch chat-ho-tro-03). Khách nhắn ở màn hình Hỗ trợ,
//! tin tới Zalo của chủ dự án qua license server (`api.`); câu trả lời về bằng cách hỏi tin mới định kỳ. Dùng được với mọi người
//! dùng, kể cả Free và chưa có license.
//!
//! - [`api`]: gọi `/v1/support/*` (production, không theo redirect, lỗi không kèm URL hay token);
//! - [`store`]: `support.json` (token, con trỏ, đang chờ trả lời, chấm đỏ);
//! - [`cadence`]: luật nhịp hỏi tin (hàm thuần); [`chat`]: lõi, không phụ thuộc Tauri;
//! - [`context`]: dòng thông tin máy gửi kèm tin đầu tiên (không bao giờ có key, email, mã máy, tên máy, tên người dùng);
//! - file này: phần ghép với app (trạng thái quản lý bằng `app.manage`, luồng hỏi nền, sự kiện `support://view`, việc của các
//!   lệnh `support_*`).

pub mod api;
pub mod cadence;
pub mod chat;
pub mod context;
pub mod store;

use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};

use self::api::{ApiError, HttpSupportApi};
use self::chat::{Chat, Host, NewConversation, SupportView};
use self::context::MachineFacts;
use self::store::Store;
use crate::errors::{self, CommandError};
use crate::models::service::ModelService;
use crate::settings::UiLanguage;
use crate::state::{AppState, SessionStatus};

/// Nguồn ghi trong cuộc chat. Bản debug cũng nối production (CLAUDE.md), nên ghi `app-debug` để chủ dự án nhận ra tin thử.
pub fn source() -> &'static str {
    if cfg!(debug_assertions) { "app-debug" } else { "app" }
}

/// Mã ngôn ngữ giao diện gửi kèm cuộc chat mới (`lang` của hợp đồng).
pub fn lang_code(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::En => "en",
        UiLanguage::Vi => "vi",
        UiLanguage::Ja => "ja",
        UiLanguage::Zh => "zh",
        UiLanguage::Ko => "ko",
    }
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// Những gì lõi cần biết về app, đọc từ trạng thái quản lý của Tauri mỗi lần dùng.
struct AppHost<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> Host for AppHost<R> {
    fn now(&self) -> i64 {
        unix_now()
    }

    /// Đang dịch: có phiên đang bắt đầu hay chạy (dừng phiên giữ `Running` tới khi câu cuối dịch xong).
    fn translating(&self) -> bool {
        self.app
            .try_state::<AppState>()
            .is_some_and(|state| matches!(state.status().session, SessionStatus::Starting | SessionStatus::Running))
    }

    /// Cửa sổ chính đang hiện: không ẩn xuống khay, không thu nhỏ. Chưa có cửa sổ thì coi như không hiện.
    fn window_visible(&self) -> bool {
        self.app
            .get_webview_window(crate::window::MAIN)
            .is_some_and(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
    }

    fn changed(&self, view: &SupportView) {
        crate::events::support_view(&self.app, view);
    }
}

/// Cài chat hỗ trợ lúc khởi động (`setup`, sau khi đã có `AppState`): đọc `support.json` và chạy luồng hỏi nền. Chưa từng dùng chat
/// thì luồng chỉ ngủ, không kết nối gì.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let path = app.path().app_local_data_dir()?.join("support.json");
    let chat = Arc::new(Chat::new(
        Box::new(AppHost { app: app.clone() }),
        Box::new(HttpSupportApi::for_this_build()),
        Store::new(path),
    ));
    app.manage(Arc::clone(&chat));
    spawn_poller(chat);
    Ok(())
}

/// Luồng hỏi tin: mỗi vòng hỏi server nếu tới hạn rồi ngủ tới nhịp sau hay tới khi một lệnh đánh thức (`Chat::step`). Có tên để
/// nhận ra trong báo cáo sự cố. Không bọc `catch_unwind`: bản phát hành build `panic = "abort"` (`Cargo.toml`), panic ở đâu cũng
/// dừng cả app, nên bọc chỉ che lỗi ở bản debug mà không có tác dụng ở bản phát hành.
fn spawn_poller(chat: Arc<Chat>) {
    let spawned = std::thread::Builder::new().name("support-chat".into()).spawn(move || {
        loop {
            chat.step();
        }
    });
    if let Err(e) = spawned {
        log::error!("không mở được luồng hỏi tin hỗ trợ: {e}");
    }
}

fn chat_of<R: Runtime>(app: &AppHandle<R>) -> Result<Arc<Chat>, CommandError> {
    app.try_state::<Arc<Chat>>()
        .map(|chat| Arc::clone(&chat))
        .ok_or_else(|| CommandError::new(errors::SUPPORT_OFFLINE, None, "chưa cài chat hỗ trợ"))
}

/// Mã lỗi giao diện của một lỗi gọi server.
pub fn command_error(e: &ApiError) -> CommandError {
    let (code, field) = match e {
        ApiError::NotConfigured | ApiError::Network(_) => (errors::SUPPORT_OFFLINE, None),
        ApiError::RateLimited(_) => (errors::SUPPORT_RATE_LIMITED, None),
        ApiError::Busy(_) => (errors::SUPPORT_BUSY, None),
        ApiError::Disabled => (errors::SUPPORT_DISABLED, None),
        ApiError::Closed => (errors::SUPPORT_CLOSED, None),
        ApiError::InvalidToken => (errors::SUPPORT_EXPIRED, None),
        ApiError::Invalid { field, .. } => (errors::SUPPORT_INVALID, field.as_deref()),
    };
    CommandError::new(code, field, e.to_string())
}

/// Lệnh `support_screen`.
pub fn screen<R: Runtime>(app: &AppHandle<R>, open: bool) -> Result<SupportView, CommandError> {
    Ok(chat_of(app)?.screen(open))
}

/// Lệnh `support_fetch`.
pub fn fetch<R: Runtime>(app: &AppHandle<R>) -> Result<SupportView, CommandError> {
    chat_of(app)?.fetch().map_err(|e| command_error(&e))
}

/// Lệnh `support_send`. `with_machine_info`: ô "Gửi kèm thông tin máy" đang tích; chỉ có tác dụng ở tin đầu tiên của một cuộc chat.
pub fn send<R: Runtime>(app: &AppHandle<R>, text: &str, with_machine_info: bool) -> Result<SupportView, CommandError> {
    let chat = chat_of(app)?;
    let ui = app
        .try_state::<AppState>()
        .map_or(UiLanguage::En, |state| state.settings().ui_language);
    let first = NewConversation {
        lang: lang_code(ui),
        source: source(),
        context: (with_machine_info && !chat.has_conversation()).then(|| machine_line(app)),
    };
    chat.send(text, &first).map_err(|e| command_error(&e))
}

/// Lệnh `support_set_email`.
pub fn set_email<R: Runtime>(app: &AppHandle<R>, email: Option<&str>) -> Result<(), CommandError> {
    chat_of(app)?.set_email(email).map_err(|e| command_error(&e))
}

/// Lệnh `support_delete`.
pub fn delete<R: Runtime>(app: &AppHandle<R>) -> Result<SupportView, CommandError> {
    chat_of(app)?.delete().map_err(|e| command_error(&e))
}

/// Tên gói model theo ngôn ngữ giao diện (manifest có tên vi và en, như `localized` của giao diện); manifest không có gói này
/// thì mã gói.
fn pack_name<R: Runtime>(app: &AppHandle<R>, id: &str, ui: UiLanguage) -> String {
    app.try_state::<Arc<ModelService>>()
        .and_then(|models| models.manifest())
        .and_then(|signed| signed.manifest.packs.into_iter().find(|p| p.id == id))
        .map_or_else(
            || id.to_string(),
            |p| if ui == UiLanguage::Vi { p.name.vi } else { p.name.en },
        )
}

/// Đọc máy thật cho dòng thông tin máy. Chỉ đọc những thứ `MachineFacts` có chỗ.
fn machine_facts<R: Runtime>(app: &AppHandle<R>) -> MachineFacts {
    let settings = app.try_state::<AppState>().map(|state| state.settings());
    let ui = settings.as_ref().map_or(UiLanguage::En, |s| s.ui_language);
    let system = crate::diagnostics::machine::system_info();
    let probe = app
        .try_state::<crate::sidecar::GpuProbe>()
        .and_then(|probe| probe.get(Duration::ZERO));
    MachineFacts {
        app_name: app.package_info().name.clone(),
        app_version: app.package_info().version.to_string(),
        os_name: system.os_name,
        os_version: system.os_version,
        chip: system.chip,
        ram_bytes: crate::models::machine::total_ram_bytes(),
        gpus: context::gpu_names(probe.as_ref()),
        plan: crate::license::app::view(app).map(|view| view.plan),
        model_pack: settings
            .as_ref()
            .and_then(|s| s.model_tier.clone())
            .map(|id| pack_name(app, &id, ui)),
        ui_lang: lang_code(ui),
    }
}

/// Lệnh `support_machine_info`: dòng thông tin máy, để giao diện hiện nguyên văn cạnh ô tích.
pub fn machine_line<R: Runtime>(app: &AppHandle<R>) -> String {
    context::line(&machine_facts(app))
}

/// Dựng `Chat` cho app giả của test: app thật (trạng thái phiên, cửa sổ, sự kiện) nhưng server và file do test đưa vào, không có
/// luồng hỏi nền (test tự gọi `tick`).
#[cfg(test)]
pub fn chat_for_tests<R: Runtime>(
    app: &AppHandle<R>,
    api: Box<dyn api::SupportApi>,
    path: std::path::PathBuf,
) -> Arc<Chat> {
    Arc::new(Chat::new(Box::new(AppHost { app: app.clone() }), api, Store::new(path)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::device;
    use crate::test_support::{install_support, mock_app, window};

    #[test]
    fn a_debug_build_marks_its_messages() {
        assert_eq!(source(), if cfg!(debug_assertions) { "app-debug" } else { "app" });
    }

    #[test]
    fn server_errors_map_to_the_ui_codes() {
        let code = |e: ApiError| command_error(&e).code;
        assert_eq!(code(ApiError::Network("x".into())), "supportOffline");
        assert_eq!(code(ApiError::NotConfigured), "supportOffline");
        assert_eq!(code(ApiError::RateLimited(15)), "supportRateLimited");
        assert_eq!(code(ApiError::Busy(15)), "supportBusy");
        assert_eq!(code(ApiError::Disabled), "supportDisabled");
        assert_eq!(code(ApiError::Closed), "supportClosed");
        assert_eq!(code(ApiError::InvalidToken), "supportExpired");
        let e = command_error(&ApiError::Invalid {
            status: 0,
            code: "invalid_request".into(),
            field: Some("email".into()),
        });
        assert_eq!((e.code.as_str(), e.field.as_deref()), ("supportInvalid", Some("email")));
    }

    #[test]
    fn the_host_follows_the_session_and_the_main_window() {
        let app = mock_app();
        let host = AppHost {
            app: app.handle().clone(),
        };
        assert!(!host.window_visible(), "chưa có cửa sổ chính");
        window(&app, "main");
        assert!(host.window_visible());
        for (session, translating) in [
            (SessionStatus::Idle, false),
            (SessionStatus::Error, false),
            (SessionStatus::Starting, true),
            (SessionStatus::Running, true),
        ] {
            app.state::<AppState>().update_status(|s| s.session = session);
            assert_eq!(host.translating(), translating, "{session:?}");
        }
    }

    /// Spec §4: dòng thông tin máy không bao giờ có key, email của license, mã máy, tên máy hay tên người dùng.
    #[test]
    fn the_machine_line_never_carries_identity() {
        let app = mock_app();
        let line = machine_line(app.handle());
        let version = app.package_info().version.to_string();
        assert!(
            line.starts_with(&format!("{} {version} · ", app.package_info().name)),
            "{line}"
        );
        assert!(line.ends_with(" · UI vi"), "{line}");
        assert!(line.chars().count() <= context::MAX_CHARS);
        assert!(!line.contains('@'), "không có email: {line}");
        if let Ok(id) = device::hardware_id() {
            assert!(
                !line.contains(&id) && !line.contains(&device::hash_id(&id)),
                "không có mã máy: {line}"
            );
        }
        if let Some(label) = device::label().filter(|l| l.chars().count() >= 6) {
            assert!(!line.contains(&label), "không có tên máy: {line}");
        }
        for var in ["USER", "USERNAME"] {
            if let Some(user) = std::env::var(var).ok().filter(|u| u.chars().count() >= 6) {
                assert!(!line.contains(&user), "không có tên người dùng: {line}");
            }
        }
    }

    /// Chưa từng nhắn: các lệnh mà màn hình Hỗ trợ gọi khi mở (`support_screen`, `support_fetch`, `support_machine_info`) không tạo
    /// request nào (kế hoạch 04: "chưa từng nhắn thì app không kết nối gì cho chat").
    #[test]
    fn opening_the_screen_without_a_conversation_makes_no_request() {
        let app = mock_app();
        let rig = install_support(&app);
        window(&app, "main");
        assert!(!screen(app.handle(), true).unwrap().has_conversation);
        assert!(!fetch(app.handle()).unwrap().has_conversation);
        machine_line(app.handle());
        screen(app.handle(), false).unwrap();
        assert!(rig.api.calls().is_empty(), "{:?}", rig.api.calls());
    }

    /// Lệnh gửi tin đầu tiên kèm đúng ngôn ngữ giao diện, nguồn của bản build, và dòng thông tin máy chỉ khi để tích.
    #[test]
    fn the_first_message_carries_the_ui_language_the_build_and_the_machine_line_only_when_ticked() {
        let app = mock_app();
        let rig = install_support(&app);
        send(app.handle(), "Chào", false).unwrap();
        let openings = rig.api.openings();
        assert_eq!((openings[0].lang, openings[0].source), ("vi", source()));
        assert_eq!(openings[0].context, None, "bỏ tích thì không gửi thông tin máy");
        delete(app.handle()).unwrap();
        send(app.handle(), "Chào", true).unwrap();
        assert_eq!(
            rig.api.openings()[1].context.as_deref(),
            Some(machine_line(app.handle()).as_str())
        );
        send(app.handle(), "Thêm", true).unwrap();
        assert_eq!(rig.api.openings().len(), 2, "tin sau không gửi lại thông tin máy");
    }
}
