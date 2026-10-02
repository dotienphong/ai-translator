//! Từ điển thuật ngữ của người dùng (F5, tính năng Pro): lưu trong DB mã hóa (`db.rs`, bảng `glossary`), không trong file
//! cài đặt (§6.9). Tối đa 500 cặp; thêm, sửa, xóa; nhập và xuất CSV (§4.3).
//!
//! - Chữ nguồn và bản dịch được cắt khoảng trắng hai đầu, không rỗng, tối đa 200 ký tự, không có ký tự điều khiển (xuống
//!   dòng làm hỏng prompt, vì mẫu "terminology" ghi mỗi cặp một dòng).
//! - Hai mục không được trùng chữ nguồn sau khi chuẩn hóa (`pipeline::glossary::normalize`: NFC, chữ thường), đúng như
//!   cách luồng dịch so khớp.
//! - CSV: hai cột `source,target`, dòng đầu là tên cột, mã UTF-8 có BOM để Excel mở đúng tiếng Việt. Nhập: bỏ BOM, bỏ
//!   dòng tên cột nếu có, chữ nguồn đã có thì cập nhật bản dịch, chữ nguồn mới thì thêm tới khi đủ 500, dòng không hợp lệ
//!   thì bỏ qua và đếm; cả lần nhập là một transaction.
//! - Chặn công thức khi mở bằng Excel (N1 của review 03): khi xuất, ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm một dấu
//!   `'` ở đầu ([`guard`]); khi nhập, bỏ đúng một dấu `'` đó ([`unguard`]), nên nhập rồi xuất lại vẫn giữ nguyên thuật ngữ.
//! - Luồng dịch dùng bản trong bộ nhớ ([`ActiveGlossary`]): nạp lúc bắt đầu phiên và sau mỗi lần sửa ([`reload`]); gói
//!   Free thì rỗng (`pro::is_pro`).

use std::time::{SystemTime, UNIX_EPOCH};

use pipeline::glossary::{Glossary, SharedGlossary, Term, normalize};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::db::{self, DbError};
use crate::errors::CommandError;
use crate::pro;

pub const MAX_ENTRIES: usize = 500;
pub const MAX_TERM_CHARS: usize = 200;
const BOM: char = '\u{feff}';
const HEADER: [&str; 2] = ["source", "target"];

/// Một cặp thuật ngữ như giao diện thấy.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GlossaryEntry {
    pub id: i64,
    pub source: String,
    pub target: String,
}

/// Kết quả một lần nhập CSV.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct ImportReport {
    pub added: usize,
    /// Chữ nguồn đã có, bản dịch được thay.
    pub updated: usize,
    /// Dòng không hợp lệ (thiếu cột, rỗng, quá dài, có ký tự điều khiển).
    pub skipped: usize,
    /// Dòng hợp lệ bị bỏ vì từ điển đã đủ 500 cặp.
    pub over_limit: usize,
}

/// Lỗi của một thao tác trên từ điển. Đổi sang `CommandError` với mã `glossary…` và trường bị lỗi.
#[derive(Debug, thiserror::Error)]
pub enum GlossaryError {
    #[error("{0} rỗng")]
    Empty(&'static str),
    #[error("{0} dài quá {MAX_TERM_CHARS} ký tự")]
    TooLong(&'static str),
    #[error("{0} có ký tự điều khiển")]
    InvalidChar(&'static str),
    #[error("chữ nguồn đã có trong từ điển")]
    Duplicate,
    #[error("từ điển đã đủ {MAX_ENTRIES} cặp")]
    Full,
    #[error("không có mục {0}")]
    NotFound(i64),
    #[error("file CSV không đọc được: {0}")]
    Csv(String),
    #[error(transparent)]
    Db(#[from] DbError),
}

impl From<rusqlite::Error> for GlossaryError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Db(DbError::Sql(e))
    }
}

impl From<GlossaryError> for CommandError {
    fn from(e: GlossaryError) -> Self {
        let message = e.to_string();
        let (code, field) = match e {
            GlossaryError::Empty(field) => ("glossaryEmpty", Some(field)),
            GlossaryError::TooLong(field) => ("glossaryTooLong", Some(field)),
            GlossaryError::InvalidChar(field) => ("glossaryInvalidChar", Some(field)),
            GlossaryError::Duplicate => ("glossaryDuplicate", Some("source")),
            GlossaryError::Full => ("glossaryFull", None),
            GlossaryError::NotFound(_) => ("glossaryNotFound", None),
            GlossaryError::Csv(_) => ("csvInvalid", None),
            GlossaryError::Db(e) => return CommandError::from(e),
        };
        CommandError::new(code, field, message)
    }
}

/// Mã lỗi của module này, để test kiểm mỗi mã có câu báo lỗi trong i18n.
pub const ERROR_CODES: &[&str] = &[
    "glossaryEmpty",
    "glossaryTooLong",
    "glossaryInvalidChar",
    "glossaryDuplicate",
    "glossaryFull",
    "glossaryNotFound",
    "csvInvalid",
];

/// Cắt khoảng trắng và kiểm một ô; `field` là `source` hoặc `target`.
fn clean(field: &'static str, value: &str) -> Result<String, GlossaryError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(GlossaryError::Empty(field));
    }
    if value.chars().count() > MAX_TERM_CHARS {
        return Err(GlossaryError::TooLong(field));
    }
    if value.chars().any(char::is_control) {
        return Err(GlossaryError::InvalidChar(field));
    }
    Ok(value.to_string())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

fn count(conn: &Connection) -> Result<usize, GlossaryError> {
    Ok(conn.query_row("SELECT count(*) FROM glossary", [], |r| r.get::<_, i64>(0))? as usize)
}

fn id_of_key(conn: &Connection, key: &str) -> Result<Option<i64>, GlossaryError> {
    Ok(conn
        .query_row("SELECT id FROM glossary WHERE match_key = ?1", [key], |r| r.get(0))
        .optional()?)
}

pub fn list(conn: &Connection) -> Result<Vec<GlossaryEntry>, GlossaryError> {
    let mut stmt = conn.prepare("SELECT id, source, target FROM glossary ORDER BY id")?;
    let rows = stmt.query_map([], |r| {
        Ok(GlossaryEntry {
            id: r.get(0)?,
            source: r.get(1)?,
            target: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn add(conn: &Connection, source: &str, target: &str) -> Result<GlossaryEntry, GlossaryError> {
    let (source, target) = (clean("source", source)?, clean("target", target)?);
    let key = normalize(&source);
    if id_of_key(conn, &key)?.is_some() {
        return Err(GlossaryError::Duplicate);
    }
    if count(conn)? >= MAX_ENTRIES {
        return Err(GlossaryError::Full);
    }
    conn.execute(
        "INSERT INTO glossary (source, target, match_key, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![source, target, key, now_ms()],
    )?;
    Ok(GlossaryEntry {
        id: conn.last_insert_rowid(),
        source,
        target,
    })
}

pub fn update(conn: &Connection, id: i64, source: &str, target: &str) -> Result<GlossaryEntry, GlossaryError> {
    let (source, target) = (clean("source", source)?, clean("target", target)?);
    let key = normalize(&source);
    if id_of_key(conn, &key)?.is_some_and(|other| other != id) {
        return Err(GlossaryError::Duplicate);
    }
    let changed = conn.execute(
        "UPDATE glossary SET source = ?1, target = ?2, match_key = ?3 WHERE id = ?4",
        params![source, target, key, id],
    )?;
    if changed == 0 {
        return Err(GlossaryError::NotFound(id));
    }
    Ok(GlossaryEntry { id, source, target })
}

pub fn delete(conn: &Connection, id: i64) -> Result<(), GlossaryError> {
    if conn.execute("DELETE FROM glossary WHERE id = ?1", [id])? == 0 {
        return Err(GlossaryError::NotFound(id));
    }
    Ok(())
}

/// Ô này Excel sẽ đọc như công thức (bắt đầu bằng `=`, `+`, `-`, `@`), hoặc là một ô đã được [`guard`] (một dấu `'` rồi
/// tới một ô như vậy): cần thêm dấu `'` khi xuất.
fn needs_guard(cell: &str) -> bool {
    match cell.chars().next() {
        Some('=' | '+' | '-' | '@') => true,
        Some('\'') => needs_guard(&cell[1..]),
        _ => false,
    }
}

/// Ô khi xuất CSV: thêm `'` ở đầu nếu Excel sẽ đọc ô như công thức.
pub fn guard(cell: &str) -> String {
    if needs_guard(cell) {
        format!("'{cell}")
    } else {
        cell.to_string()
    }
}

/// Ngược của [`guard`] khi nhập CSV: bỏ một dấu `'` ở đầu nếu phần còn lại là ô cần chặn.
pub fn unguard(cell: String) -> String {
    match cell.strip_prefix('\'') {
        Some(rest) if needs_guard(rest) => rest.to_string(),
        _ => cell,
    }
}

/// Ghi cả từ điển ra CSV (UTF-8 có BOM, dòng đầu là tên cột).
pub fn export_csv(conn: &Connection) -> Result<String, GlossaryError> {
    let mut out = csv::Writer::from_writer(Vec::new());
    out.write_record(HEADER)
        .map_err(|e| GlossaryError::Csv(e.to_string()))?;
    for e in list(conn)? {
        out.write_record([guard(&e.source), guard(&e.target)])
            .map_err(|e| GlossaryError::Csv(e.to_string()))?;
    }
    let bytes = out.into_inner().map_err(|e| GlossaryError::Csv(e.to_string()))?;
    let text = String::from_utf8(bytes).map_err(|e| GlossaryError::Csv(e.to_string()))?;
    Ok(format!("{BOM}{text}"))
}

/// Nhập CSV vào từ điển đang có (xem đầu module). File không phải UTF-8 (ví dụ Excel lưu theo bảng mã của Windows) thì
/// lỗi `csvInvalid`, không nhập gì. Bộ đọc CSV dễ dãi: ngoặc kép chưa đóng ở cuối file thì lấy tới hết file.
pub fn import_csv(conn: &mut Connection, bytes: &[u8]) -> Result<ImportReport, GlossaryError> {
    // Bộ đọc của `csv` tự bỏ BOM ở đầu file.
    let text = std::str::from_utf8(bytes).map_err(|e| GlossaryError::Csv(format!("không phải UTF-8: {e}")))?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(text.as_bytes());
    let mut rows = Vec::new();
    for record in reader.records() {
        rows.push(record.map_err(|e| GlossaryError::Csv(e.to_string()))?);
    }
    let is_header = |r: &csv::StringRecord| {
        r.len() >= 2
            && HEADER
                .iter()
                .zip(r.iter())
                .all(|(h, v)| v.trim().eq_ignore_ascii_case(h))
    };
    let skip = usize::from(rows.first().is_some_and(is_header));
    let tx = conn.transaction()?;
    let mut report = ImportReport::default();
    let mut total = count(&tx)?;
    for row in &rows[skip..] {
        let (Some(source), Some(target)) = (row.get(0), row.get(1)) else {
            report.skipped += 1;
            continue;
        };
        let (Ok(source), Ok(target)) = (clean("source", source), clean("target", target)) else {
            report.skipped += 1;
            continue;
        };
        let (source, target) = (unguard(source), unguard(target));
        let key = normalize(&source);
        match id_of_key(&tx, &key)? {
            Some(id) => {
                tx.execute(
                    "UPDATE glossary SET target = ?1 WHERE id = ?2 AND target <> ?1",
                    params![target, id],
                )?;
                report.updated += 1;
            }
            None if total >= MAX_ENTRIES => report.over_limit += 1,
            None => {
                tx.execute(
                    "INSERT INTO glossary (source, target, match_key, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![source, target, key, now_ms()],
                )?;
                total += 1;
                report.added += 1;
            }
        }
    }
    tx.commit()?;
    Ok(report)
}

/// Từ điển của luồng dịch, dùng chung cho mọi phiên. Quản lý bằng `app.manage`.
#[derive(Default)]
pub struct ActiveGlossary(pub SharedGlossary);

/// Gói về Free: luồng dịch thôi dùng thuật ngữ ngay, từ câu sau (N11 của review 03). Không đọc DB.
pub fn forget<R: Runtime>(app: &AppHandle<R>) {
    if let Some(active) = app.try_state::<ActiveGlossary>() {
        *active.0.write().unwrap_or_else(|e| e.into_inner()) = Glossary::default();
    }
}

/// Nạp lại từ điển của luồng dịch: Pro thì đọc DB, Free thì rỗng. Đọc DB lỗi thì để rỗng và ghi log (phiên vẫn dịch,
/// chỉ không có thuật ngữ). Gọi lúc bắt đầu phiên và sau mỗi lần sửa từ điển.
pub fn reload<R: Runtime>(app: &AppHandle<R>) {
    let Some(active) = app.try_state::<ActiveGlossary>() else {
        return;
    };
    let next = if pro::is_pro(app) {
        match db::with(app, |c| list(c)) {
            Ok(entries) => Glossary::new(entries.into_iter().map(|e| Term {
                source: e.source,
                target: e.target,
            })),
            Err(e) => {
                log::warn!("không nạp được từ điển thuật ngữ: {}", e.message);
                Glossary::default()
            }
        }
    } else {
        Glossary::default()
    };
    *active.0.write().unwrap_or_else(|e| e.into_inner()) = next;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_with_key;

    fn conn(name: &str) -> (Connection, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("mt-glossary-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        (open_with_key(&dir.join("data.db"), &[9; 32]).unwrap(), dir)
    }

    fn code(e: GlossaryError) -> (String, Option<String>) {
        let e = CommandError::from(e);
        (e.code, e.field)
    }

    #[test]
    fn add_update_delete_and_list() {
        let (c, dir) = conn("crud");
        let api = add(&c, "  API ", " giao diện lập trình ").unwrap();
        assert_eq!(
            (api.source.as_str(), api.target.as_str()),
            ("API", "giao diện lập trình")
        );
        let sprint = add(&c, "sprint", "đợt chạy").unwrap();
        let sprint = update(&c, sprint.id, "Sprint", "chặng nước rút").unwrap();
        assert_eq!(list(&c).unwrap(), [api.clone(), sprint.clone()]);
        delete(&c, api.id).unwrap();
        assert_eq!(list(&c).unwrap(), [sprint]);
        assert_eq!(code(delete(&c, api.id).unwrap_err()).0, "glossaryNotFound");
        assert_eq!(code(update(&c, 999, "x", "y").unwrap_err()).0, "glossaryNotFound");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn duplicates_follow_the_matching_rules() {
        let (c, dir) = conn("dup");
        // "Đà Nẵng" ở dạng tổ hợp (NFD): à = a + dấu huyền, ẵ = a + dấu trăng + dấu ngã.
        let nfd = "Đa\u{300} Na\u{306}\u{303}ng";
        let first = add(&c, "Đà Nẵng", "Da Nang").unwrap();
        assert_eq!(
            code(add(&c, &nfd.to_uppercase(), "x").unwrap_err()),
            ("glossaryDuplicate".to_string(), Some("source".to_string()))
        );
        let other = add(&c, "Hội An", "Hoi An").unwrap();
        assert_eq!(
            code(update(&c, other.id, "đà nẵng", "x").unwrap_err()).0,
            "glossaryDuplicate"
        );
        update(&c, first.id, "ĐÀ NẴNG", "Đà Nẵng city").unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn values_are_checked() {
        let (c, dir) = conn("check");
        let field = |e| code(e).1.unwrap();
        assert_eq!(code(add(&c, "  ", "x").unwrap_err()).0, "glossaryEmpty");
        assert_eq!(field(add(&c, "x", "").unwrap_err()), "target");
        assert_eq!(code(add(&c, &"a".repeat(201), "x").unwrap_err()).0, "glossaryTooLong");
        add(&c, &"ế".repeat(200), "x").unwrap();
        assert_eq!(code(add(&c, "a\nb", "x").unwrap_err()).0, "glossaryInvalidChar");
        assert_eq!(field(add(&c, "ab", "x\ty").unwrap_err()), "target");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn at_most_500_entries() {
        let (c, dir) = conn("full");
        for i in 0..MAX_ENTRIES {
            add(&c, &format!("term {i}"), "x").unwrap();
        }
        assert_eq!(code(add(&c, "one more", "x").unwrap_err()).0, "glossaryFull");
        let first = list(&c).unwrap()[0].id;
        update(&c, first, "renamed", "y").unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn csv_roundtrip_keeps_commas_quotes_and_vietnamese() {
        let (mut c, dir) = conn("csv");
        add(&c, "Q1, Q2", "quý 1, quý 2").unwrap();
        add(&c, "say \"hi\"", "nói \"chào\"").unwrap();
        add(&c, "会議", "cuộc họp").unwrap();
        let text = export_csv(&c).unwrap();
        assert!(text.starts_with("\u{feff}source,target\n"), "{text:?}");
        assert!(text.contains("\"Q1, Q2\",\"quý 1, quý 2\"\n"), "{text:?}");
        assert!(text.contains("\"say \"\"hi\"\"\",\"nói \"\"chào\"\"\"\n"), "{text:?}");
        let (mut other, other_dir) = conn("csv-other");
        let report = import_csv(&mut other, text.as_bytes()).unwrap();
        assert_eq!(
            report,
            ImportReport {
                added: 3,
                ..Default::default()
            }
        );
        let pairs = |c: &Connection| -> Vec<(String, String)> {
            list(c).unwrap().into_iter().map(|e| (e.source, e.target)).collect()
        };
        assert_eq!(pairs(&other), pairs(&c));
        let again = import_csv(&mut c, text.as_bytes()).unwrap();
        assert_eq!((again.added, again.updated), (0, 3), "nhập lại cùng file: chỉ cập nhật");
        std::fs::remove_dir_all(dir).unwrap();
        std::fs::remove_dir_all(other_dir).unwrap();
    }

    /// N1 của review 03: Excel không chạy công thức từ file xuất ra; nhập lại thì được đúng thuật ngữ cũ.
    #[test]
    fn csv_cells_that_excel_reads_as_formulas_are_guarded() {
        assert_eq!(guard("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
        for (cell, out) in [
            ("+1", "'+1"),
            ("-ish", "'-ish"),
            ("@home", "'@home"),
            ("'=x", "''=x"),
            ("a=b", "a=b"),
        ] {
            assert_eq!(guard(cell), out);
            assert_eq!(unguard(out.to_string()), cell);
        }
        assert_eq!(unguard("'abc".into()), "'abc", "dấu ' của người dùng thì giữ");
        assert_eq!(unguard("'".into()), "'");
        let (c, dir) = conn("formula");
        add(&c, "=1+1", "-sum").unwrap();
        add(&c, "'@x", "y").unwrap();
        let text = export_csv(&c).unwrap();
        assert!(text.contains("'=1+1,'-sum\n"), "{text:?}");
        assert!(text.contains("''@x,y\n"), "{text:?}");
        let (mut other, other_dir) = conn("formula-other");
        import_csv(&mut other, text.as_bytes()).unwrap();
        let pairs = |c: &Connection| -> Vec<(String, String)> {
            list(c).unwrap().into_iter().map(|e| (e.source, e.target)).collect()
        };
        assert_eq!(pairs(&other), pairs(&c));
        std::fs::remove_dir_all(dir).unwrap();
        std::fs::remove_dir_all(other_dir).unwrap();
    }

    #[test]
    fn import_updates_existing_terms_and_counts_bad_rows() {
        let (mut c, dir) = conn("import");
        add(&c, "API", "giao diện").unwrap();
        let text = "API,giao diện lập trình\r\nsprint,đợt chạy\r\nchỉ một cột\r\n ,rỗng\r\nbacklog,việc tồn\r\n";
        let report = import_csv(&mut c, text.as_bytes()).unwrap();
        assert_eq!(
            report,
            ImportReport {
                added: 2,
                updated: 1,
                skipped: 2,
                over_limit: 0
            }
        );
        let api = list(&c).unwrap().into_iter().find(|e| e.source == "API").unwrap();
        assert_eq!(
            api.target, "giao diện lập trình",
            "không có dòng tên cột thì dòng đầu là dữ liệu"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn import_stops_adding_at_500_and_a_file_that_is_not_utf8_imports_nothing() {
        let (mut c, dir) = conn("import-full");
        let mut text = String::from("Source,Target\n");
        for i in 0..MAX_ENTRIES + 3 {
            text.push_str(&format!("term {i},x\n"));
        }
        let report = import_csv(&mut c, text.as_bytes()).unwrap();
        assert_eq!((report.added, report.over_limit), (MAX_ENTRIES, 3));
        assert_eq!(list(&c).unwrap().len(), MAX_ENTRIES);
        let (mut empty, empty_dir) = conn("import-bad");
        // "Hội nghị" theo bảng mã Windows-1258: không phải UTF-8.
        let err = import_csv(&mut empty, b"H\xf4i ngh\xf2,conference\n").unwrap_err();
        assert_eq!(code(err).0, "csvInvalid");
        assert!(list(&empty).unwrap().is_empty());
        std::fs::remove_dir_all(dir).unwrap();
        std::fs::remove_dir_all(empty_dir).unwrap();
    }
}
