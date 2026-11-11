//! Việc của các lệnh về dữ liệu người dùng (§4.3): bản chép lời, lịch sử, xuất file, từ điển thuật ngữ, xóa toàn bộ dữ liệu,
//! bảng debug. Tính năng Pro hỏi `pro::require` trước mọi việc khác (Đ6). Mọi việc ở đây có thể chặn (mở DB lần đầu chờ kho khóa, hộp thoại lưu file), nên lệnh gọi
//! chúng là lệnh `async` chạy việc trên luồng của `spawn_blocking`, không trên luồng chính.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::db::DataStore;
use crate::debug::{DebugLog, DebugSession};
use crate::errors::{self, CommandError};
use crate::glossary::{self, GlossaryEntry, ImportReport};
use crate::notes::{self, render, schema::Notes, service::NotesService};
use crate::settings::{Invalid, Reason};
use crate::state::AppState;
use crate::transcript::export::{self, Format, SrtText};
use crate::transcript::history::{self, SessionSummary};
use crate::transcript::store::{Transcript, TranscriptStore};
use crate::{db, files, i18n, pro};

/// Bản chép lời nào: của phiên hiện tại (hoặc vừa dừng), hay một phiên trong lịch sử.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
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

/// Xuất ra file (Pro): hỏi chỗ lưu rồi ghi. `srt_speakers`: SRT có tên người nói. Trả đường dẫn đã ghi, `None` nếu người dùng hủy.
pub fn export_transcript<R: Runtime>(
    app: &AppHandle<R>,
    source: TranscriptRef,
    format: Format,
    srt_text: SrtText,
    srt_speakers: bool,
    utc_offset_minutes: i32,
) -> Result<Option<String>, CommandError> {
    pro::require(app)?;
    check_offset(utc_offset_minutes)?;
    let t = load(app, source)?;
    let s = strings(app);
    let (content, kind) = match format {
        Format::Txt => (export::txt(&t, utc_offset_minutes, s), files::TXT),
        Format::Srt => (export::srt(&t, srt_text, srt_speakers, s), files::SRT),
        Format::Markdown => (export::markdown(&t, utc_offset_minutes, s), files::MARKDOWN),
    };
    files::save_as(app, &export::file_name(&t, format, utc_offset_minutes), kind, &content)
}

// ---- Ghi chú cuộc họp bằng AI (spec 2026-11-11-ghi-chu-cuoc-hop §7): chữ để sao chép, xuất file, danh sách phiên có ghi chú. ----

/// Dịch vụ ghi chú do `notes::install` cài. Chưa cài (chỉ xảy ra ở app giả của test) là lỗi chung, không phải panic.
pub(crate) fn notes_service<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::State<'_, NotesService>, CommandError> {
    app.try_state::<NotesService>()
        .ok_or_else(|| CommandError::new(errors::UNKNOWN, None, "dịch vụ ghi chú chưa được cài"))
}

/// Ghi chú của `target`, hoặc `notesEmpty` khi chưa có. Phiên trong Lịch sử cần Pro (do `NotesService::view` đòi).
fn notes_of<R: Runtime>(app: &AppHandle<R>, target: TranscriptRef) -> Result<Notes, CommandError> {
    notes_service(app)?
        .view(app, target)?
        .notes
        .map(|stored| stored.body)
        .ok_or_else(|| CommandError::new(errors::NOTES_EMPTY, None, "chưa có ghi chú"))
}

/// Markdown của ghi chú, để sao chép (mọi gói: Free chỉ có ghi chú của phiên vừa dừng).
pub fn notes_text<R: Runtime>(app: &AppHandle<R>, target: TranscriptRef) -> Result<String, CommandError> {
    Ok(render::markdown(&notes_of(app, target)?, strings(app)))
}

/// Xuất ghi chú ra file (Pro): hỏi chỗ lưu rồi ghi. Chỉ có TXT và Markdown; SRT không có nghĩa với ghi chú. Tên file gợi ý là
/// tên file bản chép lời của phiên với tiền tố `transcript` đổi thành `notes`. Trả đường dẫn đã ghi, `None` nếu người dùng hủy.
pub fn export_notes<R: Runtime>(
    app: &AppHandle<R>,
    target: TranscriptRef,
    format: Format,
    utc_offset_minutes: i32,
) -> Result<Option<String>, CommandError> {
    pro::require(app)?;
    check_offset(utc_offset_minutes)?;
    let kind = match format {
        Format::Txt => files::TXT,
        Format::Markdown => files::MARKDOWN,
        Format::Srt => return Err(Invalid::new("format", Reason::OutOfRange).into()),
    };
    let notes = notes_of(app, target)?;
    let s = strings(app);
    let content = match format {
        Format::Markdown => render::markdown(&notes, s),
        _ => render::txt(&notes, s),
    };
    let t = load(app, target)?;
    let name = export::file_name(&t, format, utc_offset_minutes);
    let name = name
        .strip_prefix("transcript")
        .map_or_else(|| name.clone(), |rest| format!("notes{rest}"));
    files::save_as(app, &name, kind, &content)
}

/// Mã các phiên trong Lịch sử đã có ghi chú (Pro), để màn Lịch sử đánh dấu.
pub fn list_notes_sessions<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<i64>, CommandError> {
    pro::require(app)?;
    db::with(app, |c| notes::store::sessions_with_notes(c))
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

// ---- Từ điển thuật ngữ (F5, Pro). Mỗi lần sửa thì nạp lại bản của luồng dịch, nên câu dịch sau dùng ngay. ----

pub fn list_glossary<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<GlossaryEntry>, CommandError> {
    pro::require(app)?;
    db::with(app, |c| glossary::list(c))
}

pub fn add_glossary_entry<R: Runtime>(
    app: &AppHandle<R>,
    source: &str,
    target: &str,
) -> Result<GlossaryEntry, CommandError> {
    pro::require(app)?;
    let entry = db::with(app, |c| glossary::add(c, source, target))?;
    glossary::reload(app);
    Ok(entry)
}

pub fn update_glossary_entry<R: Runtime>(
    app: &AppHandle<R>,
    id: i64,
    source: &str,
    target: &str,
) -> Result<GlossaryEntry, CommandError> {
    pro::require(app)?;
    let entry = db::with(app, |c| glossary::update(c, id, source, target))?;
    glossary::reload(app);
    Ok(entry)
}

pub fn delete_glossary_entry<R: Runtime>(app: &AppHandle<R>, id: i64) -> Result<(), CommandError> {
    pro::require(app)?;
    db::with(app, |c| glossary::delete(c, id))?;
    glossary::reload(app);
    Ok(())
}

/// Hỏi một file CSV rồi nhập. `None` nếu người dùng hủy.
pub fn import_glossary_csv<R: Runtime>(app: &AppHandle<R>) -> Result<Option<ImportReport>, CommandError> {
    pro::require(app)?;
    let Some(bytes) = files::open_bytes(app, files::CSV)? else {
        return Ok(None);
    };
    let report = db::with(app, |c| glossary::import_csv(c, &bytes))?;
    glossary::reload(app);
    Ok(Some(report))
}

/// Hỏi chỗ lưu rồi ghi cả từ điển ra CSV. Trả đường dẫn, `None` nếu người dùng hủy.
pub fn export_glossary_csv<R: Runtime>(app: &AppHandle<R>) -> Result<Option<String>, CommandError> {
    pro::require(app)?;
    let text = db::with(app, |c| glossary::export_csv(c))?;
    files::save_as(app, "glossary.csv", files::CSV, &text)
}

/// Nút "Xóa toàn bộ dữ liệu" (§4.3, Quyền riêng tư): xóa file DB (lịch sử và từ điển) cùng khóa của nó, và bản chép lời
/// trong bộ nhớ. Không phải tính năng Pro: người đã về Free vẫn xóa được dữ liệu cũ. Không đụng trạng thái bản quyền,
/// bộ đếm hạn mức (mục khác của kho khóa) hay file cài đặt. Kế hoạch 04 gọi hàm này cho nút "Xóa model và dữ liệu".
pub fn clear_all_data<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    clear_all_data_with(app, |app| {
        if let Some(store) = app.try_state::<DataStore>() {
            store.wipe().map_err(|e| {
                log::error!("không xóa được dữ liệu: {e}");
                CommandError::from(e)
            })?;
        }
        Ok(())
    })
}

/// Thân của [`clear_all_data`] với bước xóa DB cho trước (test chen việc vào đúng lúc xóa, để kiểm thứ tự các bước).
pub(crate) fn clear_all_data_with<R: Runtime>(
    app: &AppHandle<R>,
    wipe: impl FnOnce(&AppHandle<R>) -> Result<(), CommandError>,
) -> Result<(), CommandError> {
    // Ghi chú trước tiên, cả khi xóa DB lỗi: việc tạo ghi chú đang chạy bị hủy trước khi xóa, nên không xong muộn rồi mở lại
    // DB (tạo lại file và khóa) sau khi đã xóa.
    crate::notes::forget(app);
    wipe(app)?;
    if let Some(transcript) = app.try_state::<TranscriptStore>() {
        transcript.clear();
    }
    // Lần nữa sau khi bỏ bản chép lời: việc nào bắt đầu giữa hai lần (đã chép câu cũ) cũng bị hủy hay bị từ chối.
    crate::notes::forget(app);
    // Tên người dùng đặt cho người nói cũng đã bỏ (QĐ 18 của kế hoạch 03 phân biệt người nói): hai cửa sổ vẽ lại nhãn tự động.
    crate::speaker::emit_roster(app);
    // Không nạp lại từ DB ở đây: đọc DB sẽ tạo ngay file và khóa mới.
    glossary::forget(app);
    log::info!("đã xóa toàn bộ lịch sử và từ điển theo yêu cầu của người dùng");
    Ok(())
}

/// Số đo của các phiên gần nhất, cho bảng debug ẩn (§7).
pub fn debug_sessions<R: Runtime>(app: &AppHandle<R>) -> Vec<DebugSession> {
    app.try_state::<DebugLog>().map(|l| l.sessions()).unwrap_or_default()
}
