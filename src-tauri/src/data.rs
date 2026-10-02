//! Việc của các lệnh về dữ liệu người dùng (§4.3): bản chép lời, lịch sử, xuất file. Tính năng Pro hỏi `pro::require`
//! trước mọi việc khác (Đ6). Mọi việc ở đây có thể chặn (mở DB lần đầu chờ kho khóa, hộp thoại lưu file), nên lệnh gọi
//! chúng là lệnh `async` chạy việc trên luồng của `spawn_blocking`, không trên luồng chính.

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::settings::{Invalid, Reason};
use crate::state::AppState;
use crate::transcript::export::{self, Format, SrtText};
use crate::transcript::history::{self, SessionSummary};
use crate::transcript::store::{Transcript, TranscriptStore};
use crate::{db, files, i18n, pro};

/// Bản chép lời nào: của phiên hiện tại (hoặc vừa dừng), hay một phiên trong lịch sử.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TranscriptRef {
    Current,
    History { id: i64 },
}

/// Chạy `f` trên luồng của `spawn_blocking`.
pub async fn blocking<R: Runtime, T: Send + 'static>(
    app: AppHandle<R>,
    f: impl FnOnce(&AppHandle<R>) -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(move || f(&app))
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
}

pub fn current<R: Runtime>(app: &AppHandle<R>) -> Transcript {
    app.try_state::<TranscriptStore>()
        .map(|t| t.snapshot())
        .unwrap_or_default()
}

/// Bản chép lời theo `source`. Xem lịch sử là tính năng Pro.
pub fn load<R: Runtime>(app: &AppHandle<R>, source: TranscriptRef) -> Result<Transcript, CommandError> {
    match source {
        TranscriptRef::Current => Ok(current(app)),
        TranscriptRef::History { id } => {
            pro::require(app)?;
            db::with(app, |c| history::get(c, id))
        }
    }
}

/// Độ lệch múi giờ lớn nhất giao diện được gửi: ±18 giờ (giới hạn của ISO 8601). Ngoài khoảng này là dữ liệu hỏng, trả lỗi
/// `outOfRange` (§10.2: kiểm phạm vi mọi dữ liệu từ giao diện; N4 của review 03).
pub const MAX_UTC_OFFSET_MINUTES: i32 = 18 * 60;

fn check_offset(utc_offset_minutes: i32) -> Result<(), CommandError> {
    if (-MAX_UTC_OFFSET_MINUTES..=MAX_UTC_OFFSET_MINUTES).contains(&utc_offset_minutes) {
        Ok(())
    } else {
        Err(Invalid::new("utcOffsetMinutes", Reason::OutOfRange).into())
    }
}

fn strings<R: Runtime>(app: &AppHandle<R>) -> &'static i18n::Strings {
    i18n::strings(app.state::<AppState>().settings().ui_language)
}

/// Chữ TXT của bản chép lời, để sao chép (sao chép không phải tính năng Pro, F4).
pub fn transcript_text<R: Runtime>(
    app: &AppHandle<R>,
    source: TranscriptRef,
    utc_offset_minutes: i32,
) -> Result<String, CommandError> {
    check_offset(utc_offset_minutes)?;
    let t = load(app, source)?;
    Ok(export::txt(&t, utc_offset_minutes, strings(app)))
}

/// Xuất ra file (Pro): hỏi chỗ lưu rồi ghi. Trả đường dẫn đã ghi, `None` nếu người dùng hủy.
pub fn export_transcript<R: Runtime>(
    app: &AppHandle<R>,
    source: TranscriptRef,
    format: Format,
    srt_text: SrtText,
    utc_offset_minutes: i32,
) -> Result<Option<String>, CommandError> {
    pro::require(app)?;
    check_offset(utc_offset_minutes)?;
    let t = load(app, source)?;
    let s = strings(app);
    let (content, kind) = match format {
        Format::Txt => (export::txt(&t, utc_offset_minutes, s), files::TXT),
        Format::Srt => (export::srt(&t, srt_text, s), files::SRT),
        Format::Markdown => (export::markdown(&t, utc_offset_minutes, s), files::MARKDOWN),
    };
    files::save_as(app, &export::file_name(&t, format, utc_offset_minutes), kind, &content)
}

pub fn list_history<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<SessionSummary>, CommandError> {
    pro::require(app)?;
    db::with(app, |c| history::list(c))
}

pub fn delete_history_session<R: Runtime>(app: &AppHandle<R>, id: i64) -> Result<(), CommandError> {
    pro::require(app)?;
    db::with(app, |c| history::delete(c, id))
}

pub fn clear_history<R: Runtime>(app: &AppHandle<R>) -> Result<usize, CommandError> {
    pro::require(app)?;
    db::with(app, |c| history::clear(c))
}
