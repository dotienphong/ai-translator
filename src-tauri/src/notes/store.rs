//! Ghi chú đã dựng của từng phiên trong lịch sử (spec 2026-11-11-ghi-chu-cuoc-hop-design §5): bảng `notes` trong DB mã
//! hóa (`db.rs`, migration 2 → 3), mỗi phiên một bản. Xóa phiên thì xóa luôn ghi chú (`ON DELETE CASCADE`, cùng cơ chế
//! khóa ngoại mà bảng `lines` đang dựa vào).
//!
//! Nội dung ghi chú là chữ chép lời của người dùng: không vào log, không vào thông báo lỗi.

use rusqlite::{Connection, OptionalExtension, params, types::Value};
use serde::{Deserialize, Serialize};

use super::schema::Notes;
use crate::db::DbError;
use crate::settings::{NotesProvider, NotesTemplate};

/// Một ghi chú đã lưu cùng nơi nó từ đâu tới.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stored {
    /// Giờ Unix (ms) lúc dựng xong.
    pub created_at: u64,
    pub source: NotesProvider,
    /// Tên model đã dùng (rỗng được).
    pub model: String,
    /// Ngôn ngữ của ghi chú.
    pub lang: String,
    pub template: NotesTemplate,
    pub body: Notes,
    /// Người dùng đã sửa tay.
    pub edited: bool,
}

/// Lỗi chuyển đổi giá trị trước khi ghi, thành lỗi DB (không có nội dung ghi chú trong thông báo).
fn conversion(e: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> DbError {
    DbError::Sql(rusqlite::Error::ToSqlConversionFailure(e.into()))
}

/// Tên chữ thường của một biến thể enum, đúng như serde viết (không tự gõ tên để khỏi lệch với `settings`).
fn name_of<T: Serialize>(value: &T) -> Result<String, DbError> {
    match serde_json::to_value(value).map_err(conversion)? {
        serde_json::Value::String(name) => Ok(name),
        _ => Err(conversion("biến thể enum không ra chuỗi")),
    }
}

/// Ngược lại của [`name_of`]; tên lạ (DB của bản khác, dữ liệu hỏng) thì `None`.
fn from_name<T: for<'de> Deserialize<'de>>(name: &str) -> Option<T> {
    serde_json::from_value(serde_json::Value::String(name.to_owned())).ok()
}

/// Ghi (hoặc thay) ghi chú của phiên `session_id`. `Ok(false)`: phiên không còn trong lịch sử (đã xóa), không ghi gì.
/// Kiểm phiên và ghi nằm trong một câu lệnh nên phiên bị xóa giữa chừng không thành lỗi khóa ngoại.
pub fn put(conn: &Connection, session_id: i64, s: &Stored) -> Result<bool, DbError> {
    let created_at = i64::try_from(s.created_at).map_err(conversion)?;
    let source = name_of(&s.source)?;
    let template = name_of(&s.template)?;
    let body_json = serde_json::to_string(&s.body).map_err(conversion)?;
    let written = conn.execute(
        "INSERT INTO notes (session_id, created_at, source, model, lang, template, body_json, edited)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ?1)
         ON CONFLICT(session_id) DO UPDATE SET
             created_at = excluded.created_at,
             source = excluded.source,
             model = excluded.model,
             lang = excluded.lang,
             template = excluded.template,
             body_json = excluded.body_json,
             edited = excluded.edited",
        params![
            session_id,
            created_at,
            source,
            s.model,
            s.lang,
            template,
            body_json,
            i64::from(s.edited)
        ],
    )?;
    Ok(written > 0)
}

/// Ghi chú của phiên `session_id`; `None` khi chưa có hay dòng đã hỏng (JSON không đọc được, tên nguồn hay mẫu lạ, số
/// âm). Dòng hỏng chỉ ghi một dòng cảnh báo cố định, không kèm nội dung.
pub fn get(conn: &Connection, session_id: i64) -> Result<Option<Stored>, DbError> {
    let row = conn
        .query_row(
            "SELECT created_at, source, model, lang, template, body_json, edited FROM notes WHERE session_id = ?1",
            [session_id],
            |r| {
                Ok([
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                ])
            },
        )
        .optional()?;
    let Some(row) = row else {
        return Ok(None);
    };
    let stored = parse(row);
    if stored.is_none() {
        log::warn!("ghi chú của một phiên trong lịch sử bị hỏng, bỏ qua");
    }
    Ok(stored)
}

/// Một dòng của bảng `notes` thành [`Stored`]; `None` khi sai kiểu, sai giá trị hay JSON không đúng hình.
fn parse(row: [Value; 7]) -> Option<Stored> {
    let [created_at, source, model, lang, template, body_json, edited] = row;
    let (
        Value::Integer(created_at),
        Value::Text(source),
        Value::Text(model),
        Value::Text(lang),
        Value::Text(template),
        Value::Text(body_json),
        Value::Integer(edited),
    ) = (created_at, source, model, lang, template, body_json, edited)
    else {
        return None;
    };
    Some(Stored {
        created_at: u64::try_from(created_at).ok()?,
        source: from_name(&source)?,
        model,
        lang,
        template: from_name(&template)?,
        body: serde_json::from_str(&body_json).ok()?,
        edited: edited != 0,
    })
}

/// Phiên có `started_at` đúng bằng giá trị cho; trùng thì lấy phiên mới nhất (id lớn nhất). Cho phiên vừa dừng tìm lại
/// id của nó trong lịch sử.
pub fn session_for(conn: &Connection, started_at: u64) -> Result<Option<i64>, DbError> {
    let Ok(started_at) = i64::try_from(started_at) else {
        return Ok(None);
    };
    Ok(conn
        .query_row(
            "SELECT id FROM sessions WHERE started_at = ?1 ORDER BY id DESC LIMIT 1",
            [started_at],
            |r| r.get(0),
        )
        .optional()?)
}

/// Id các phiên đã có ghi chú, tăng dần.
pub fn sessions_with_notes(conn: &Connection) -> Result<Vec<i64>, DbError> {
    let mut stmt = conn.prepare("SELECT session_id FROM notes ORDER BY session_id")?;
    let ids = stmt.query_map([], |r| r.get(0))?.collect::<Result<Vec<i64>, _>>()?;
    Ok(ids)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::db::open_with_key;
    use crate::transcript::{history, store::Transcript};
    use pipeline::subtitle::{Status, Subtitle};

    fn conn(name: &str) -> (Connection, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("mt-notes-store-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        (open_with_key(&dir.join(crate::db::DB_FILE), &[6; 32]).unwrap(), dir)
    }

    fn transcript_at(started_at: u64) -> Transcript {
        Transcript {
            session: 3,
            started_at,
            ended_at: Some(started_at + 60_000),
            target_lang: "vi".into(),
            lines: vec![Subtitle {
                id: 1_000_001,
                start_ms: 0,
                end_ms: 900,
                src_lang: "en".into(),
                src_text: "Hello.".into(),
                tgt_text: "Xin chào.".into(),
                status: Status::Done,
                provisional: false,
                replaces: Vec::new(),
                speaker: None,
            }],
            speakers: Vec::new(),
            speakers_rev: 0,
        }
    }

    fn transcript() -> Transcript {
        transcript_at(1_000)
    }

    fn stored(summary: &str) -> Stored {
        Stored {
            created_at: 1_700_000_000_000,
            source: NotesProvider::Gemini,
            model: "gemini-3.1-flash-lite".into(),
            lang: "vi".into(),
            template: NotesTemplate::Meeting,
            body: Notes {
                summary: summary.into(),
                ..Notes::default()
            },
            edited: false,
        }
    }

    #[test]
    fn put_get_replace() {
        let (mut c, dir) = conn("put-get");
        let id = history::save(&mut c, &transcript()).unwrap().unwrap();
        assert_eq!(get(&c, id).unwrap(), None);
        assert!(put(&c, id, &stored("s1")).unwrap());
        assert!(
            put(
                &c,
                id,
                &Stored {
                    edited: true,
                    ..stored("s2")
                }
            )
            .unwrap()
        );
        let got = get(&c, id).unwrap().unwrap();
        assert_eq!(
            (got.body.summary.as_str(), got.edited, got.source, got.template),
            ("s2", true, NotesProvider::Gemini, NotesTemplate::Meeting)
        );
        assert_eq!(sessions_with_notes(&c).unwrap(), [id]);
        assert_eq!(session_for(&c, transcript().started_at).unwrap(), Some(id));
        assert_eq!(session_for(&c, 1).unwrap(), None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn deleting_the_session_deletes_its_note_and_put_on_a_missing_session_is_false() {
        let (mut c, dir) = conn("delete");
        let id = history::save(&mut c, &transcript()).unwrap().unwrap();
        put(&c, id, &stored("s")).unwrap();
        history::delete(&c, id).unwrap();
        assert_eq!(get(&c, id).unwrap(), None);
        assert!(!put(&c, id, &stored("late")).unwrap());
        assert_eq!(get(&c, id).unwrap(), None);
        assert_eq!(sessions_with_notes(&c).unwrap(), Vec::<i64>::new());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn every_field_and_every_provider_and_template_round_trips() {
        let (mut c, dir) = conn("round-trip");
        let id = history::save(&mut c, &transcript()).unwrap().unwrap();
        for source in [
            NotesProvider::Local,
            NotesProvider::Openai,
            NotesProvider::Gemini,
            NotesProvider::Deepseek,
        ] {
            for template in [NotesTemplate::Meeting, NotesTemplate::Lecture, NotesTemplate::Brief] {
                let s = Stored {
                    created_at: 42,
                    source,
                    model: "m".into(),
                    lang: "ja".into(),
                    template,
                    body: Notes {
                        summary: "Tóm tắt".into(),
                        decisions: vec![crate::notes::schema::Item {
                            text: "Chốt".into(),
                            refs: vec![1, 2],
                        }],
                        action_items: vec![crate::notes::schema::ActionItem {
                            text: "Làm".into(),
                            owner: "Lan".into(),
                            due: "thứ Sáu".into(),
                            refs: vec![3],
                        }],
                        open_questions: Vec::new(),
                        raw: true,
                    },
                    edited: true,
                };
                assert!(put(&c, id, &s).unwrap());
                assert_eq!(get(&c, id).unwrap(), Some(s), "{source:?} / {template:?}");
            }
        }
        let (src, tpl): (String, String) = c
            .query_row("SELECT source, template FROM notes", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(
            (src.as_str(), tpl.as_str()),
            ("deepseek", "brief"),
            "chữ thường như serde"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_note_with_corrupt_json_reads_as_none() {
        let (mut c, dir) = conn("corrupt-json");
        let id = history::save(&mut c, &transcript()).unwrap().unwrap();
        put(&c, id, &stored("s")).unwrap();
        c.execute("UPDATE notes SET body_json = '{not json' WHERE session_id = ?1", [id])
            .unwrap();
        assert_eq!(get(&c, id).unwrap(), None);
        c.execute("UPDATE notes SET body_json = '[1, 2]' WHERE session_id = ?1", [id])
            .unwrap();
        assert_eq!(get(&c, id).unwrap(), None, "JSON đúng nhưng không phải Notes");
        assert_eq!(
            sessions_with_notes(&c).unwrap(),
            [id],
            "dòng vẫn còn, chỉ không đọc được"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_note_with_an_unknown_source_or_template_reads_as_none() {
        let (mut c, dir) = conn("unknown-name");
        let id = history::save(&mut c, &transcript()).unwrap().unwrap();
        put(&c, id, &stored("s")).unwrap();
        c.execute("UPDATE notes SET source = 'claude' WHERE session_id = ?1", [id])
            .unwrap();
        assert_eq!(get(&c, id).unwrap(), None);
        put(&c, id, &stored("s")).unwrap();
        assert!(get(&c, id).unwrap().is_some());
        c.execute("UPDATE notes SET template = 'poem' WHERE session_id = ?1", [id])
            .unwrap();
        assert_eq!(get(&c, id).unwrap(), None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_negative_created_at_reads_as_none_and_a_huge_one_is_not_written() {
        let (mut c, dir) = conn("created-at");
        let id = history::save(&mut c, &transcript()).unwrap().unwrap();
        put(&c, id, &stored("s")).unwrap();
        c.execute("UPDATE notes SET created_at = -1 WHERE session_id = ?1", [id])
            .unwrap();
        assert_eq!(get(&c, id).unwrap(), None);
        let huge = Stored {
            created_at: u64::MAX,
            ..stored("huge")
        };
        assert!(put(&c, id, &huge).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_newest_session_wins_when_started_at_is_shared() {
        let (mut c, dir) = conn("same-start");
        let first = history::save(&mut c, &transcript_at(5_000)).unwrap().unwrap();
        let second = history::save(&mut c, &transcript_at(5_000)).unwrap().unwrap();
        let other = history::save(&mut c, &transcript_at(9_000)).unwrap().unwrap();
        assert!(first < second && second < other);
        assert_eq!(session_for(&c, 5_000).unwrap(), Some(second));
        assert_eq!(session_for(&c, 9_000).unwrap(), Some(other));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn sessions_with_notes_are_listed_by_ascending_id() {
        let (mut c, dir) = conn("list");
        let a = history::save(&mut c, &transcript_at(1_000)).unwrap().unwrap();
        let b = history::save(&mut c, &transcript_at(2_000)).unwrap().unwrap();
        let without = history::save(&mut c, &transcript_at(3_000)).unwrap().unwrap();
        let d = history::save(&mut c, &transcript_at(4_000)).unwrap().unwrap();
        for id in [d, a, b] {
            put(&c, id, &stored("s")).unwrap();
        }
        assert_eq!(sessions_with_notes(&c).unwrap(), [a, b, d]);
        assert_eq!(get(&c, without).unwrap(), None);
        let _ = std::fs::remove_dir_all(dir);
    }
}
