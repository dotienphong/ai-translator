//! Lịch sử chép lời (F4, §4.3 "Lịch sử", tính năng Pro): bản chép lời của các phiên đã dừng, lưu trong DB mã hóa (`db.rs`,
//! bảng `sessions` và `lines`). Chỉ lưu khi bật "Lưu lịch sử" (mặc định tắt, §10.1) và đang là Pro; lưu một lần khi phiên
//! dừng, trong một transaction. Phiên không có câu nào thì không lưu. Xóa từng phiên hoặc xóa tất cả.
//!
//! App bị tắt đột ngột giữa phiên (Force Quit, mất điện) thì mất phiên đó: lịch sử chỉ ghi khi phiên dừng.

use pipeline::subtitle::{Status, Subtitle};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use super::store::Transcript;
use crate::db::{self, DbError};
use crate::errors::CommandError;
use crate::pro;
use crate::state::AppState;

/// Số ký tự tối đa của câu xem trước trong danh sách.
const PREVIEW_CHARS: usize = 80;

/// Một phiên trong danh sách Lịch sử.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: i64,
    pub started_at: u64,
    pub ended_at: u64,
    pub target_lang: String,
    pub lines: usize,
    /// Câu gốc đầu tiên, cắt còn 80 ký tự.
    pub preview: String,
}

#[derive(Debug, thiserror::Error)]
pub enum HistoryError {
    #[error("không có phiên {0} trong lịch sử")]
    NotFound(i64),
    #[error(transparent)]
    Db(#[from] DbError),
}

impl From<rusqlite::Error> for HistoryError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Db(DbError::Sql(e))
    }
}

impl From<HistoryError> for CommandError {
    fn from(e: HistoryError) -> Self {
        match e {
            HistoryError::NotFound(_) => CommandError::new(NOT_FOUND, None, e.to_string()),
            HistoryError::Db(e) => e.into(),
        }
    }
}

pub const NOT_FOUND: &str = "historyNotFound";

fn status_name(status: Status) -> String {
    serde_json::to_value(status)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default()
}

fn status_from(name: &str) -> Status {
    serde_json::from_value(serde_json::Value::String(name.to_string())).unwrap_or(Status::Done)
}

/// Lưu bản chép lời của một phiên đã dừng. Trả id của phiên trong lịch sử; `None` nếu phiên không có câu nào.
pub fn save(conn: &mut Connection, t: &Transcript) -> Result<Option<i64>, HistoryError> {
    if t.lines.is_empty() {
        return Ok(None);
    }
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO sessions (started_at, ended_at, target_lang) VALUES (?1, ?2, ?3)",
        params![
            t.started_at as i64,
            t.ended_at.unwrap_or(t.started_at) as i64,
            t.target_lang
        ],
    )?;
    let id = tx.last_insert_rowid();
    {
        let mut insert = tx.prepare(
            "INSERT INTO lines (session_id, seq, start_ms, end_ms, src_lang, src_text, tgt_text, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for (seq, line) in t.lines.iter().enumerate() {
            insert.execute(params![
                id,
                seq as i64,
                line.start_ms as i64,
                line.end_ms as i64,
                line.src_lang,
                line.src_text,
                line.tgt_text,
                status_name(line.status)
            ])?;
        }
    }
    tx.commit()?;
    Ok(Some(id))
}

/// Mọi phiên đã lưu, mới nhất trước.
pub fn list(conn: &Connection) -> Result<Vec<SessionSummary>, HistoryError> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.started_at, s.ended_at, s.target_lang,
                (SELECT count(*) FROM lines l WHERE l.session_id = s.id),
                (SELECT src_text FROM lines l WHERE l.session_id = s.id AND src_text <> '' ORDER BY seq LIMIT 1)
         FROM sessions s ORDER BY s.started_at DESC, s.id DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        let preview: Option<String> = r.get(5)?;
        Ok(SessionSummary {
            id: r.get(0)?,
            started_at: r.get::<_, i64>(1)? as u64,
            ended_at: r.get::<_, i64>(2)? as u64,
            target_lang: r.get(3)?,
            lines: r.get::<_, i64>(4)? as usize,
            preview: preview.unwrap_or_default().chars().take(PREVIEW_CHARS).collect(),
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Bản chép lời của phiên `id` (để xem, sao chép, xuất). `session` của kết quả là 0: đây không phải phiên của lần chạy này.
pub fn get(conn: &Connection, id: i64) -> Result<Transcript, HistoryError> {
    let meta: Option<(i64, i64, String)> = conn
        .query_row(
            "SELECT started_at, ended_at, target_lang FROM sessions WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    let Some((started_at, ended_at, target_lang)) = meta else {
        return Err(HistoryError::NotFound(id));
    };
    let mut stmt = conn.prepare(
        "SELECT seq, start_ms, end_ms, src_lang, src_text, tgt_text, status FROM lines WHERE session_id = ?1 ORDER BY seq",
    )?;
    let lines = stmt.query_map([id], |r| {
        Ok(Subtitle {
            id: r.get::<_, i64>(0)? as u64,
            start_ms: r.get::<_, i64>(1)? as u64,
            end_ms: r.get::<_, i64>(2)? as u64,
            src_lang: r.get(3)?,
            src_text: r.get(4)?,
            tgt_text: r.get(5)?,
            status: status_from(&r.get::<_, String>(6)?),
            provisional: false,
            replaces: Vec::new(),
        })
    })?;
    Ok(Transcript {
        session: 0,
        started_at: started_at as u64,
        ended_at: Some(ended_at as u64),
        target_lang,
        lines: lines.collect::<Result<_, _>>()?,
    })
}

pub fn delete(conn: &Connection, id: i64) -> Result<(), HistoryError> {
    if conn.execute("DELETE FROM sessions WHERE id = ?1", [id])? == 0 {
        return Err(HistoryError::NotFound(id));
    }
    Ok(())
}

/// Xóa mọi phiên đã lưu. Trả số phiên đã xóa.
pub fn clear(conn: &Connection) -> Result<usize, HistoryError> {
    Ok(conn.execute("DELETE FROM sessions", [])?)
}

/// Phiên vừa dừng: lưu vào lịch sử nếu bật "Lưu lịch sử" và đang là Pro. Lỗi chỉ ghi log (không có chữ chép lời), phiên
/// vẫn dừng bình thường.
pub fn save_if_enabled<R: Runtime>(app: &AppHandle<R>, t: &Transcript) {
    let enabled = app.try_state::<AppState>().is_some_and(|s| s.settings().save_history);
    if !enabled || !pro::is_pro(app) {
        return;
    }
    match db::with(app, |c| save(c, t)) {
        Ok(Some(id)) => log::info!("đã lưu phiên vào lịch sử ({} câu, id {id})", t.lines.len()),
        Ok(None) => {}
        Err(e) => log::error!("không lưu được lịch sử: {} ({})", e.code, e.message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_with_key;

    fn conn(name: &str) -> (Connection, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("mt-history-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        (open_with_key(&dir.join("data.db"), &[5; 32]).unwrap(), dir)
    }

    fn line(id: u64, src: &str, tgt: &str, status: Status) -> Subtitle {
        Subtitle {
            id,
            start_ms: id * 1_000,
            end_ms: id * 1_000 + 900,
            src_lang: "en".into(),
            src_text: src.into(),
            tgt_text: tgt.into(),
            status,
            provisional: false,
            replaces: Vec::new(),
        }
    }

    fn transcript(started_at: u64, first: &str) -> Transcript {
        Transcript {
            session: 3,
            started_at,
            ended_at: Some(started_at + 60_000),
            target_lang: "vi".into(),
            lines: vec![
                line(1_000_001, "", "", Status::Dropped),
                line(1_000_002, first, "Xin chào.", Status::Done),
                line(1_000_005, "Xin chào.", "", Status::SameLang),
                line(1_000_007, "Oops", "", Status::Failed),
            ],
        }
    }

    #[test]
    fn a_saved_session_reads_back_with_its_lines_and_statuses() {
        let (mut c, dir) = conn("roundtrip");
        let t = transcript(1_000, "Hello.");
        let id = save(&mut c, &t).unwrap().unwrap();
        let back = get(&c, id).unwrap();
        assert_eq!((back.session, back.started_at, back.ended_at), (0, 1_000, Some(61_000)));
        let statuses: Vec<Status> = back.lines.iter().map(|l| l.status).collect();
        assert_eq!(
            statuses,
            [Status::Dropped, Status::Done, Status::SameLang, Status::Failed]
        );
        assert_eq!(back.lines[1].tgt_text, "Xin chào.");
        assert_eq!(back.lines[1].start_ms, 1_000_002_000, "giữ nguyên mốc thời gian");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_list_is_newest_first_with_a_preview() {
        let (mut c, dir) = conn("list");
        let long = "a".repeat(100);
        let old = save(&mut c, &transcript(1_000, "Old meeting.")).unwrap().unwrap();
        let new = save(&mut c, &transcript(9_000, &long)).unwrap().unwrap();
        let empty = Transcript {
            lines: Vec::new(),
            ..transcript(5_000, "")
        };
        assert_eq!(
            save(&mut c, &empty).unwrap(),
            None,
            "phiên không có câu nào thì không lưu"
        );
        let list = list(&c).unwrap();
        assert_eq!(list.iter().map(|s| s.id).collect::<Vec<_>>(), [new, old]);
        assert_eq!(list[1].preview, "Old meeting.", "bỏ qua câu rỗng của đoạn bị bỏ");
        assert_eq!(list[0].preview.chars().count(), 80);
        assert_eq!((list[1].lines, list[1].target_lang.as_str()), (4, "vi"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn delete_one_or_all() {
        let (mut c, dir) = conn("delete");
        let a = save(&mut c, &transcript(1_000, "A")).unwrap().unwrap();
        let b = save(&mut c, &transcript(2_000, "B")).unwrap().unwrap();
        delete(&c, a).unwrap();
        assert_eq!(CommandError::from(delete(&c, a).unwrap_err()).code, NOT_FOUND);
        assert_eq!(CommandError::from(get(&c, a).unwrap_err()).code, NOT_FOUND);
        let lines: i64 = c
            .query_row("SELECT count(*) FROM lines WHERE session_id = ?1", [a], |r| r.get(0))
            .unwrap();
        assert_eq!(lines, 0, "xóa phiên thì xóa cả các câu");
        assert_eq!(get(&c, b).unwrap().lines.len(), 4);
        assert_eq!(clear(&c).unwrap(), 1);
        assert!(list(&c).unwrap().is_empty());
        let lines: i64 = c.query_row("SELECT count(*) FROM lines", [], |r| r.get(0)).unwrap();
        assert_eq!(lines, 0);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
