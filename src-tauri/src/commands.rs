//! Lệnh `invoke` của giao diện. Mỗi lệnh phải có trong ba chỗ, test `acl_tests` giữ chúng khớp nhau:
//! 1. `handler()` bên dưới;
//! 2. `build.rs` (app manifest, để lệnh đi qua ACL);
//! 3. `capabilities/main.json` hoặc `capabilities/overlay.json` (quyền `allow-<tên-lệnh>`).
//!
//! Lệnh generic theo `R: Runtime` để test ACL chạy được với `MockRuntime`.
//! Dữ liệu từ giao diện luôn được kiểm kiểu (serde) và phạm vi (`Settings::validate`) trước khi dùng.

use serde_json::Value;
use tauri::{AppHandle, Runtime, State};

use crate::actions::{self, AudioSourceOption};
use crate::data::{self, TranscriptRef, blocking};
use crate::debug::DebugSession;
use crate::errors::{self, CommandError};
use crate::glossary::{GlossaryEntry, ImportReport};
use crate::hotkeys::HotkeyAction;
use crate::settings::Settings;
use crate::state::{AppInfo, AppState, AppStatus, OverlayView};
use crate::transcript::export::{Format, SrtText};
use crate::transcript::history::SessionSummary;
use crate::transcript::store::Transcript;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub fn update_settings<R: Runtime>(app: AppHandle<R>, patch: Value) -> Result<Settings, CommandError> {
    actions::update_settings(&app, &patch)
}

#[tauri::command]
pub fn set_hotkey<R: Runtime>(
    app: AppHandle<R>,
    action: HotkeyAction,
    accelerator: String,
) -> Result<Settings, CommandError> {
    actions::set_hotkey(&app, action, &accelerator)
}

#[tauri::command]
pub fn get_app_status(state: State<'_, AppState>) -> AppStatus {
    state.status()
}

/// Bắt đầu phiên thật (chạy tiến trình phụ, mở nguồn âm thanh) có thể chặn vài chục giây, nên không chạy trên luồng
/// chính: lệnh `async` chạy trên runtime của Tauri, việc chặn chạy trên luồng của `spawn_blocking`.
#[tauri::command]
pub async fn toggle_session<R: Runtime>(app: AppHandle<R>) -> Result<AppStatus, CommandError> {
    tauri::async_runtime::spawn_blocking(move || actions::toggle_session(&app))
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
}

#[tauri::command]
pub fn set_overlay_visible<R: Runtime>(app: AppHandle<R>, visible: bool) -> Result<AppStatus, CommandError> {
    actions::set_overlay_visible(&app, visible)
}

#[tauri::command]
pub fn set_overlay_locked<R: Runtime>(app: AppHandle<R>, locked: bool) -> Result<Settings, CommandError> {
    actions::set_overlay_locked(&app, locked)
}

#[tauri::command]
pub fn get_app_info<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        name: app.package_info().name.clone(),
        version: app.package_info().version.to_string(),
        identifier: app.config().identifier.clone(),
        platform: if cfg!(target_os = "macos") { "macos" } else { "windows" },
        launched_at_login: state.launched_at_login(),
    }
}

#[tauri::command]
pub fn open_log_dir<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_log_dir(&app)
}

#[tauri::command]
pub fn open_taskbar_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_taskbar_settings(&app)
}

#[tauri::command]
pub fn open_login_items_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_login_items_settings(&app)
}

/// Hỏi Core Audio hay WASAPI có thể chậm: lệnh `async` để không chặn luồng chính.
#[tauri::command]
pub async fn list_audio_sources() -> Result<Vec<AudioSourceOption>, CommandError> {
    tauri::async_runtime::spawn_blocking(actions::list_audio_sources)
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
}

#[tauri::command]
pub fn open_audio_permission_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_audio_permission_settings(&app)
}

// ---- Bản chép lời, lịch sử, xuất file (kế hoạch 03, F4). Lệnh chạm DB hay hộp thoại là `async` (xem `data.rs`). ----

/// Bản chép lời của phiên hiện tại hoặc vừa dừng, trong bộ nhớ.
#[tauri::command]
pub fn get_transcript<R: Runtime>(app: AppHandle<R>) -> Transcript {
    data::current(&app)
}

/// Chữ TXT để sao chép. `utc_offset_minutes`: độ lệch múi giờ của máy, để ghi giờ địa phương.
#[tauri::command]
pub async fn transcript_text<R: Runtime>(
    app: AppHandle<R>,
    source: TranscriptRef,
    utc_offset_minutes: i32,
) -> Result<String, CommandError> {
    blocking(app, move |app| data::transcript_text(app, source, utc_offset_minutes)).await
}

/// Xuất ra file (Pro). Trả đường dẫn đã ghi, `null` nếu người dùng bấm Hủy ở hộp thoại lưu.
#[tauri::command]
pub async fn export_transcript<R: Runtime>(
    app: AppHandle<R>,
    source: TranscriptRef,
    format: Format,
    srt_text: SrtText,
    utc_offset_minutes: i32,
) -> Result<Option<String>, CommandError> {
    blocking(app, move |app| {
        data::export_transcript(app, source, format, srt_text, utc_offset_minutes)
    })
    .await
}

#[tauri::command]
pub async fn list_history<R: Runtime>(app: AppHandle<R>) -> Result<Vec<SessionSummary>, CommandError> {
    blocking(app, data::list_history).await
}

#[tauri::command]
pub async fn get_history_session<R: Runtime>(app: AppHandle<R>, id: i64) -> Result<Transcript, CommandError> {
    blocking(app, move |app| data::load(app, TranscriptRef::History { id })).await
}

#[tauri::command]
pub async fn delete_history_session<R: Runtime>(app: AppHandle<R>, id: i64) -> Result<(), CommandError> {
    blocking(app, move |app| data::delete_history_session(app, id)).await
}

/// Xóa mọi phiên trong lịch sử (Pro). Trả số phiên đã xóa.
#[tauri::command]
pub async fn clear_history<R: Runtime>(app: AppHandle<R>) -> Result<usize, CommandError> {
    blocking(app, data::clear_history).await
}

// ---- Từ điển thuật ngữ (F5, Pro), quyền riêng tư, bảng debug. ----

#[tauri::command]
pub async fn list_glossary<R: Runtime>(app: AppHandle<R>) -> Result<Vec<GlossaryEntry>, CommandError> {
    blocking(app, data::list_glossary).await
}

#[tauri::command]
pub async fn add_glossary_entry<R: Runtime>(
    app: AppHandle<R>,
    source: String,
    target: String,
) -> Result<GlossaryEntry, CommandError> {
    blocking(app, move |app| data::add_glossary_entry(app, &source, &target)).await
}

#[tauri::command]
pub async fn update_glossary_entry<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    source: String,
    target: String,
) -> Result<GlossaryEntry, CommandError> {
    blocking(app, move |app| data::update_glossary_entry(app, id, &source, &target)).await
}

#[tauri::command]
pub async fn delete_glossary_entry<R: Runtime>(app: AppHandle<R>, id: i64) -> Result<(), CommandError> {
    blocking(app, move |app| data::delete_glossary_entry(app, id)).await
}

/// Nhập CSV (Pro). `null` nếu người dùng bấm Hủy ở hộp thoại mở file.
#[tauri::command]
pub async fn import_glossary_csv<R: Runtime>(app: AppHandle<R>) -> Result<Option<ImportReport>, CommandError> {
    blocking(app, data::import_glossary_csv).await
}

/// Xuất CSV (Pro). Trả đường dẫn đã ghi, `null` nếu người dùng bấm Hủy.
#[tauri::command]
pub async fn export_glossary_csv<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, CommandError> {
    blocking(app, data::export_glossary_csv).await
}

/// Nút "Xóa toàn bộ dữ liệu": lịch sử và từ điển (§4.3).
#[tauri::command]
pub async fn clear_all_data<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    blocking(app, data::clear_all_data).await
}

/// Số đo của các phiên gần nhất, cho bảng debug ẩn (§7).
#[tauri::command]
pub fn get_debug_sessions<R: Runtime>(app: AppHandle<R>) -> Vec<DebugSession> {
    data::debug_sessions(&app)
}

/// Lệnh duy nhất cửa sổ `overlay` gọi được, chỉ đọc (§10.2).
#[tauri::command]
pub fn get_overlay_view(state: State<'_, AppState>) -> OverlayView {
    OverlayView::from_settings(&state.settings())
}

/// Lệnh của cửa sổ `main`.
pub const MAIN_COMMANDS: &[&str] = &[
    "get_settings",
    "update_settings",
    "set_hotkey",
    "get_app_status",
    "toggle_session",
    "set_overlay_visible",
    "set_overlay_locked",
    "get_app_info",
    "open_log_dir",
    "open_taskbar_settings",
    "open_login_items_settings",
    "list_audio_sources",
    "open_audio_permission_settings",
    "get_transcript",
    "transcript_text",
    "export_transcript",
    "list_history",
    "get_history_session",
    "delete_history_session",
    "clear_history",
    "list_glossary",
    "add_glossary_entry",
    "update_glossary_entry",
    "delete_glossary_entry",
    "import_glossary_csv",
    "export_glossary_csv",
    "clear_all_data",
    "get_debug_sessions",
];

/// Lệnh của cửa sổ `overlay`.
pub const OVERLAY_COMMANDS: &[&str] = &["get_overlay_view"];

pub fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        get_settings,
        update_settings,
        set_hotkey,
        get_app_status,
        toggle_session,
        set_overlay_visible,
        set_overlay_locked,
        get_app_info,
        open_log_dir,
        open_taskbar_settings,
        open_login_items_settings,
        list_audio_sources,
        open_audio_permission_settings,
        get_transcript,
        transcript_text,
        export_transcript,
        list_history,
        get_history_session,
        delete_history_session,
        clear_history,
        list_glossary,
        add_glossary_entry,
        update_glossary_entry,
        delete_glossary_entry,
        import_glossary_csv,
        export_glossary_csv,
        clear_all_data,
        get_debug_sessions,
        get_overlay_view,
    ]
}
