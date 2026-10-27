//! SQLite mã hóa bằng SQLCipher (spec §6.6, §10.2): từ điển thuật ngữ và lịch sử chép lời. File `data.db` (bản debug:
//! `data-dev.db`, xem [`db_file_name`]) nằm trong thư mục dữ liệu cục bộ của app (`app_local_data_dir`): macOS là
//! `~/Library/Application Support/<bundle-id>/` (cạnh `settings.json`), Windows là `%LOCALAPPDATA%\<bundle-id>\`, không
//! đi theo hồ sơ roaming, cùng chỗ với khóa của nó (kho khóa Windows lưu `persistence = Local`).
//!
//! - **Khóa:** 32 byte ngẫu nhiên (`getrandom`), lưu dạng hex trong kho khóa của hệ điều hành, mục `db-key` (bản debug:
//!   `db-key-dev`, xem [`key_name`]). SQLCipher nhận thẳng khóa thô (`PRAGMA key = "x'…'"`), không qua PBKDF2, nên mở nhanh.
//!   Khóa không bao giờ vào log.
//! - **Mở lúc cần:** chỉ mở (và chỉ đọc kho khóa) ở lần đầu một tính năng cần tới DB, nên người dùng Free không bao giờ
//!   chạm tới Keychain vì DB.
//! - **Mất khóa hoặc khóa sai** (kho khóa bị xóa, file chép từ máy khác): không đọc được file nữa. File cũ được đổi tên
//!   thành `<tên file>.unreadable-<giây Unix>` để bộ phận hỗ trợ còn xem được, rồi app tạo DB mới. **Kho khóa lỗi** (người
//!   dùng từ chối hộp thoại Keychain, Credential Manager không mở được): trả lỗi, không đụng tới file.
//! - **Schema:** `PRAGMA user_version` là số phiên bản; [`MIGRATIONS`] chạy lần lượt trong một transaction. File của bản
//!   app mới hơn (số lớn hơn) thì từ chối mở, không sửa gì.
//! - **Xóa:** [`DataStore::wipe`] đóng kết nối, xóa file (cả journal và các bản `<tên file>.unreadable-*`) và mục khóa. Hai
//!   nút "Xóa toàn bộ dữ liệu" (kế hoạch 03) và "Xóa model và dữ liệu" (kế hoạch 04) đều gọi hàm này; trạng thái bản quyền
//!   và bộ đếm hạn mức nằm ở mục khác của kho khóa nên không bị xóa (§4.3).
//! - macOS dùng CommonCrypto; Windows dùng OpenSSL build tĩnh từ mã nguồn (`openssl-src`), xem `Cargo.toml`.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, ErrorCode};
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::security::keystore::Keystore;

/// Tên file DB trong thư mục dữ liệu của app, theo loại build ([`db_file_name`]). Mọi chỗ cần tên file (đường dẫn, journal,
/// `<tên>.unreadable-*`, log) lấy từ đây.
pub const DB_FILE: &str = db_file_name(cfg!(debug_assertions));

/// Bản phát hành: `data.db`. Bản debug (bản dev, `scripts/run-dev-app.sh`): `data-dev.db`. Bản dev ký bằng đúng
/// `identifier` của bản phát hành nên dùng chung thư mục dữ liệu, kho khóa và quyền hệ thống với app đã cài; file DB và
/// mục khóa DB ([`key_name`]) là riêng, để migration của nhánh đang làm không nâng `data.db` của app đã cài (bản cũ hơn
/// gặp DB của bản mới hơn thì từ chối mở, [`DbError::Newer`]) và "Xóa toàn bộ dữ liệu" ở bản dev không xóa khóa của app đã
/// cài. Lịch sử và từ điển của bản dev vì vậy tách riêng, bắt đầu rỗng (QĐ 22 của kế hoạch 03 phân biệt người nói).
pub const fn db_file_name(debug: bool) -> &'static str {
    if debug { "data-dev.db" } else { "data.db" }
}

/// Tên mục khóa DB trong kho khóa (dưới service là bundle identifier, `keystore.rs`), theo loại build ([`key_name`]).
pub const KEY_NAME: &str = key_name(cfg!(debug_assertions));

/// Bản phát hành: `db-key`. Bản debug: `db-key-dev`, đi cùng file `data-dev.db` ([`db_file_name`]). "Xóa toàn bộ dữ liệu"
/// ([`DataStore::wipe`]) xóa mục khóa này; nếu bản dev dùng chung `db-key` thì bấm nút ở bản dev làm app đã cài mất khóa
/// của `data.db` (lần mở sau đổi tên file thành `.unreadable-*` và tạo DB rỗng: mất Lịch sử thật). Các mục khác của kho
/// khóa (bản quyền, bộ đếm hạn mức, dấu di trú) vẫn dùng chung, không thuộc DB.
pub const fn key_name(debug: bool) -> &'static str {
    if debug { "db-key-dev" } else { "db-key" }
}
const KEY_BYTES: usize = 32;

/// `MIGRATIONS[i]` nâng DB từ phiên bản `i` lên `i + 1`. Thêm bước mới ở cuối, không sửa bước cũ.
pub const MIGRATIONS: &[&str] = &[
    // 0 → 1: từ điển thuật ngữ (F5) và lịch sử chép lời (F4).
    "CREATE TABLE glossary (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        -- Khóa so trùng: NFC, chữ thường (`pipeline::glossary::normalize`).
        match_key TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE sessions (
        id INTEGER PRIMARY KEY,
        -- Giờ Unix, ms.
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        target_lang TEXT NOT NULL
    );
    CREATE TABLE lines (
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        src_lang TEXT NOT NULL,
        src_text TEXT NOT NULL,
        tgt_text TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (session_id, seq)
    ) WITHOUT ROWID;",
    // 1 → 2: nhãn người nói của từng câu (spec 2026-10-26-phan-biet-nguoi-noi §9): nhãn lúc dừng phiên (sau đổi tên, gộp), rỗng khi
    // chưa xác định hay phiên không có nhận giọng. Vẫn trong SQLCipher, vẫn chỉ khi có Pro và bật "Lưu lịch sử".
    "ALTER TABLE lines ADD COLUMN speaker TEXT;",
];

pub const SCHEMA_VERSION: i64 = MIGRATIONS.len() as i64;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("không dùng được kho khóa: {0}")]
    Keystore(String),
    #[error("lỗi SQLite: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("lỗi file: {0}")]
    Io(#[from] std::io::Error),
    #[error("dữ liệu do bản app mới hơn ghi (schema {0})")]
    Newer(i64),
    #[error("không tạo được khóa ngẫu nhiên: {0}")]
    Random(String),
}

impl From<DbError> for CommandError {
    fn from(e: DbError) -> Self {
        CommandError::new(errors::DATA_UNAVAILABLE, None, e.to_string())
    }
}

/// Cài `DataStore` của app: file trong thư mục dữ liệu cục bộ của app, khóa trong kho khóa của hệ điều hành. Chưa mở gì
/// ở đây. Gọi một lần ở `setup`.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let dir = app.path().app_local_data_dir()?;
    let keystore = Keystore::os(&app.config().identifier).map_err(|e| e.to_string());
    app.manage(DataStore::new(dir, keystore));
    Ok(())
}

/// Chạy `f` với DB của app. Lỗi (của DB hay của `f`) thành `CommandError`; chưa cài `DataStore` thì `dataUnavailable`.
pub fn with<R: Runtime, T, E>(
    app: &AppHandle<R>,
    f: impl FnOnce(&mut Connection) -> Result<T, E>,
) -> Result<T, CommandError>
where
    E: From<DbError> + Into<CommandError> + std::fmt::Display,
{
    let store = app
        .try_state::<DataStore>()
        .ok_or_else(|| CommandError::new(errors::DATA_UNAVAILABLE, None, "chưa cài DataStore"))?;
    store.with(f).map_err(|e| {
        log::warn!("thao tác với DB lỗi: {e}");
        e.into()
    })
}

/// DB của app, mở lúc cần. Quản lý bằng `app.manage`.
pub struct DataStore {
    dir: PathBuf,
    keystore: Result<Keystore, String>,
    conn: Mutex<Option<Connection>>,
}

impl DataStore {
    /// `dir`: thư mục dữ liệu của app. `keystore`: kho khóa của hệ điều hành (test dùng `Keystore::mock`); `Err` khi không
    /// tạo được kho khóa, khi đó mọi lần dùng DB đều báo lỗi.
    pub fn new(dir: PathBuf, keystore: Result<Keystore, String>) -> Self {
        Self {
            dir,
            keystore,
            conn: Mutex::new(None),
        }
    }

    pub fn path(&self) -> PathBuf {
        self.dir.join(DB_FILE)
    }

    /// Chạy `f` với kết nối, mở DB nếu chưa mở. Các lần gọi chạy lần lượt (một kết nối, giữ khóa trong lúc chạy).
    pub fn with<T, E: From<DbError>>(&self, f: impl FnOnce(&mut Connection) -> Result<T, E>) -> Result<T, E> {
        let mut slot = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        if slot.is_none() {
            *slot = Some(self.open()?);
        }
        f(slot.as_mut().expect("vừa mở"))
    }

    /// Xóa hẳn dữ liệu: đóng kết nối, xóa file DB (cả file journal) và mục khóa của build này ([`KEY_NAME`]). Lần dùng sau tạo
    /// DB mới với khóa mới.
    pub fn wipe(&self) -> Result<(), DbError> {
        let mut slot = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(conn) = slot.take() {
            conn.close().map_err(|(_, e)| e)?;
        }
        // Cả các bản đã đổi tên vì không đọc được (`set_aside`): chúng vẫn chứa dữ liệu đã mã hóa, đọc lại được nếu khóa cũ
        // xuất hiện lại (Keychain khôi phục từ bản sao lưu). "Xóa toàn bộ dữ liệu" thì không để lại gì (Q2 của review 03).
        let mut paths = vec![self.path(), journal_path(&self.path())];
        if let Ok(entries) = std::fs::read_dir(&self.dir) {
            let prefix = format!("{DB_FILE}.unreadable-");
            paths.extend(
                entries
                    .flatten()
                    .filter(|e| e.file_name().to_string_lossy().starts_with(&prefix))
                    .map(|e| e.path()),
            );
        }
        for path in paths {
            match std::fs::remove_file(&path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
        self.keystore()?
            .delete(KEY_NAME)
            .map_err(|e| DbError::Keystore(e.to_string()))?;
        Ok(())
    }

    fn keystore(&self) -> Result<&Keystore, DbError> {
        self.keystore.as_ref().map_err(|e| DbError::Keystore(e.clone()))
    }

    fn open(&self) -> Result<Connection, DbError> {
        let keystore = self.keystore()?;
        let stored = keystore.get(KEY_NAME).map_err(|e| DbError::Keystore(e.to_string()))?;
        let path = self.path();
        // Không có khóa mà file đã có thì khóa mới không mở được file: nhánh `NotADatabase` bên dưới đổi tên file cũ.
        let key = match stored.as_deref().and_then(parse_key) {
            Some(key) => key,
            None => {
                let key = new_key()?;
                keystore
                    .set(KEY_NAME, to_hex(&key).as_bytes())
                    .map_err(|e| DbError::Keystore(e.to_string()))?;
                key
            }
        };
        std::fs::create_dir_all(&self.dir)?;
        match open_with_key(&path, &key) {
            Err(DbError::Sql(e)) if e.sqlite_error_code() == Some(ErrorCode::NotADatabase) => {
                log::warn!("khóa không mở được {}: tạo DB mới", log_name(&path));
                set_aside(&path)?;
                open_with_key(&path, &key)
            }
            other => other,
        }
    }
}

/// Mở (hoặc tạo) file `path` bằng khóa thô `key`, kiểm khóa ngay, rồi nâng schema.
pub fn open_with_key(path: &Path, key: &[u8; KEY_BYTES]) -> Result<Connection, DbError> {
    let conn = Connection::open(path)?;
    // Chuỗi hex chỉ có [0-9a-f], nên ghép thẳng vào câu lệnh được.
    conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", to_hex(key)))?;
    // Sai khóa thì câu lệnh đầu tiên đọc file trả `NotADatabase`.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))?;
    // Dữ liệu bị xóa được ghi đè bằng số 0, không còn nằm lại trong các trang trống của file. Khóa ngoại (xóa phiên thì
    // xóa các câu) đã bật sẵn: SQLCipher build kèm với `SQLITE_DEFAULT_FOREIGN_KEYS=1` (libsqlite3-sys).
    conn.execute_batch("PRAGMA secure_delete = ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), DbError> {
    migrate_steps(conn, MIGRATIONS)
}

/// Nâng schema bằng `steps` (của app này là [`MIGRATIONS`]; test đưa `&MIGRATIONS[..1]` để đóng vai app ≤ 0.3.1).
fn migrate_steps(conn: &Connection, steps: &[&str]) -> Result<(), DbError> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version > steps.len() as i64 {
        return Err(DbError::Newer(version));
    }
    for (i, step) in steps.iter().enumerate().skip(version as usize) {
        // Mỗi bước một transaction: lỗi giữa chừng thì không còn nửa schema.
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(step)?;
        tx.pragma_update(None, "user_version", i as i64 + 1)?;
        tx.commit()?;
    }
    Ok(())
}

/// Đổi tên file không đọc được (và file journal của nó) thành `<tên>.unreadable-<giây Unix>`, không ghi đè bản cũ hơn.
fn set_aside(path: &Path) -> Result<PathBuf, DbError> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let target = (0..)
        .map(|n| {
            let mut name = path.as_os_str().to_owned();
            name.push(format!(".unreadable-{now}"));
            if n > 0 {
                name.push(format!("-{n}"));
            }
            PathBuf::from(name)
        })
        .find(|candidate| !candidate.exists())
        .expect("dãy vô hạn");
    std::fs::rename(path, &target)?;
    let journal = journal_path(path);
    if journal.exists() {
        std::fs::remove_file(journal)?;
    }
    log::warn!("đã đổi tên DB không đọc được thành {}", log_name(&target));
    Ok(target)
}

/// Tên file để ghi log: không ghi đường dẫn, vì đường dẫn có tên tài khoản của hệ điều hành và log do người dùng tự gửi
/// khi cần hỗ trợ (N-3 của review cuối 03).
fn log_name(path: &Path) -> String {
    path.file_name()
        .map_or_else(|| DB_FILE.to_owned(), |name| name.to_string_lossy().into_owned())
}

fn journal_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push("-journal");
    PathBuf::from(name)
}

fn new_key() -> Result<[u8; KEY_BYTES], DbError> {
    let mut key = [0u8; KEY_BYTES];
    getrandom::fill(&mut key).map_err(|e| DbError::Random(e.to_string()))?;
    Ok(key)
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Khóa trong kho khóa: đúng 64 chữ số hex. Giá trị khác coi như không có khóa.
fn parse_key(stored: &[u8]) -> Option<[u8; KEY_BYTES]> {
    let text = std::str::from_utf8(stored).ok()?;
    if text.len() != KEY_BYTES * 2 || !text.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let mut key = [0u8; KEY_BYTES];
    for (i, byte) in key.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&text[2 * i..2 * i + 2], 16).ok()?;
    }
    Some(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use keyring_core::api::CredentialStoreApi;
    use keyring_core::mock::Store as MockStore;
    use std::sync::Arc;

    const SERVICE: &str = "com.aitranslator.desktop.test";

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-db-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn store(dir: &Path, keys: &Arc<MockStore>) -> DataStore {
        DataStore::new(dir.to_path_buf(), Ok(keystore(keys)))
    }

    fn keystore(keys: &Arc<MockStore>) -> Keystore {
        Keystore::with_store(SERVICE, keys.clone())
    }

    /// `DataStore::with` với lỗi là `DbError` (để suy ra kiểu lỗi trong test).
    fn run<T>(db: &DataStore, f: impl FnOnce(&mut Connection) -> Result<T, DbError>) -> Result<T, DbError> {
        db.with(f)
    }

    fn tables(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect()
    }

    #[test]
    fn a_new_database_is_encrypted_and_has_the_schema() {
        let dir = temp_dir("new");
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        let (names, version) = run(&db, |c| {
            Ok((
                tables(c),
                c.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))?,
            ))
        })
        .unwrap();
        assert_eq!(names, ["glossary", "lines", "sessions"]);
        assert_eq!(version, SCHEMA_VERSION);
        let secure = db
            .with(|c| Ok::<i64, DbError>(c.query_row("PRAGMA secure_delete", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(secure, 1, "dữ liệu bị xóa được ghi đè (QĐ5)");
        let header = std::fs::read(db.path()).unwrap();
        assert_ne!(
            &header[..16],
            b"SQLite format 3\0",
            "file không có header SQLite thường"
        );
        let stored = keystore(&keys).get(KEY_NAME).unwrap().unwrap();
        assert_eq!(stored.len(), 64);
        assert!(parse_key(&stored).is_some());
        // Dọn dẹp cố gắng hết sức: Windows không xóa được file DB khi kết nối còn mở; `temp_dir` đã xóa thư mục
        // này ở đầu lần chạy sau.
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_file_cannot_be_read_without_the_right_key() {
        let dir = temp_dir("nokey");
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        run(&db, |c| {
            c.execute("INSERT INTO sessions VALUES (1, 0, 0, 'vi')", [])?;
            Ok(())
        })
        .unwrap();
        let plain = Connection::open(db.path()).unwrap();
        let err = plain
            .query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))
            .unwrap_err();
        assert_eq!(err.sqlite_error_code(), Some(ErrorCode::NotADatabase));
        let wrong = open_with_key(&db.path(), &[7; KEY_BYTES]).unwrap_err();
        assert!(
            matches!(&wrong, DbError::Sql(e) if e.sqlite_error_code() == Some(ErrorCode::NotADatabase)),
            "{wrong}"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Spec §11 ("Bảo mật"): mở file lịch sử bằng công cụ SQLite bên ngoài thì không đọc được. Chạy được khi máy có
    /// `sqlite3` (macOS có sẵn ở `/usr/bin/sqlite3`); không có thì bỏ qua.
    #[test]
    fn the_sqlite3_tool_cannot_read_the_file() {
        let Ok(output) = std::process::Command::new("sqlite3").arg("-version").output() else {
            println!("không có sqlite3, bỏ qua");
            return;
        };
        assert!(output.status.success());
        let dir = temp_dir("cli");
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        run(&db, |c| {
            c.execute(
                "INSERT INTO glossary (source, target, match_key, created_at) VALUES ('API', 'giao diện lập trình', 'api', 0)",
                [],
            )?;
            Ok(())
        })
        .unwrap();
        let output = std::process::Command::new("sqlite3")
            .arg(db.path())
            .arg("SELECT target FROM glossary")
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(!output.status.success());
        assert!(stderr.contains("file is not a database"), "{stderr}");
        assert!(!String::from_utf8_lossy(&output.stdout).contains("giao diện"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reopening_uses_the_same_key() {
        let dir = temp_dir("reopen");
        let keys = MockStore::new().unwrap();
        run(&store(&dir, &keys), |c| {
            c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
            Ok(())
        })
        .unwrap();
        let count = run(&store(&dir, &keys), |c| {
            Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?)
        })
        .unwrap();
        assert_eq!(count, 1);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_lost_key_moves_the_old_file_aside() {
        let dir = temp_dir("lost");
        let keys = MockStore::new().unwrap();
        run(&store(&dir, &keys), |c| {
            c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
            Ok(())
        })
        .unwrap();
        assert!(keystore(&keys).delete(KEY_NAME).unwrap());
        let count = run(&store(&dir, &keys), |c| {
            Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?)
        })
        .unwrap();
        assert_eq!(count, 0, "DB mới, rỗng");
        let aside: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with(&format!("{DB_FILE}.unreadable-")))
            .collect();
        assert_eq!(aside.len(), 1, "file cũ được giữ lại để hỗ trợ xem: {aside:?}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_wrong_key_also_moves_the_old_file_aside() {
        let dir = temp_dir("wrong");
        std::fs::create_dir_all(&dir).unwrap();
        drop(open_with_key(&dir.join(DB_FILE), &[1; KEY_BYTES]).unwrap());
        let keys = MockStore::new().unwrap();
        keystore(&keys)
            .set(KEY_NAME, to_hex(&[2; KEY_BYTES]).as_bytes())
            .unwrap();
        let names = run(&store(&dir, &keys), |c| Ok(tables(c))).unwrap();
        assert_eq!(names, ["glossary", "lines", "sessions"]);
        assert_eq!(
            std::fs::read_dir(&dir).unwrap().count(),
            2,
            "{DB_FILE} mới và bản cũ đã đổi tên"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keystore_errors_leave_the_file_alone() {
        let dir = temp_dir("denied");
        let keys = MockStore::new().unwrap();
        run(&store(&dir, &keys), |_| Ok(())).unwrap();
        let before = std::fs::read(dir.join(DB_FILE)).unwrap();
        let entry = keys.build(SERVICE, KEY_NAME, None).unwrap();
        let cred: &keyring_core::mock::Cred = entry.as_any().downcast_ref().unwrap();
        cred.set_error(keyring_core::Error::NoStorageAccess("người dùng từ chối".into()));
        let err = run(&store(&dir, &keys), |_| Ok(())).unwrap_err();
        assert!(matches!(err, DbError::Keystore(_)), "{err}");
        assert_eq!(std::fs::read(dir.join(DB_FILE)).unwrap(), before);
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        let none = DataStore::new(dir.clone(), Err("không có kho khóa".into()));
        assert!(matches!(run(&none, |_| Ok(())), Err(DbError::Keystore(_))));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_database_of_a_newer_app_is_refused() {
        let dir = temp_dir("newer");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        let conn = open_with_key(&path, &[3; KEY_BYTES]).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {};", SCHEMA_VERSION + 1))
            .unwrap();
        drop(conn);
        let err = open_with_key(&path, &[3; KEY_BYTES]).unwrap_err();
        assert!(matches!(err, DbError::Newer(v) if v == SCHEMA_VERSION + 1), "{err}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §9: DB của bản trước (phiên bản 1) được nâng lên: cột `speaker` thêm vào `lines`, rỗng ở
    /// các câu cũ; phiên cũ và câu cũ còn nguyên.
    #[test]
    fn an_old_database_gains_an_empty_speaker_column() {
        let dir = temp_dir("v1");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        let key = [7u8; KEY_BYTES];
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", to_hex(&key)))
                .unwrap();
            conn.execute_batch(MIGRATIONS[0]).unwrap();
            conn.execute_batch(
                "PRAGMA user_version = 1;
                 INSERT INTO sessions (id, started_at, ended_at, target_lang) VALUES (1, 0, 1000, 'vi');
                 INSERT INTO lines (session_id, seq, start_ms, end_ms, src_lang, src_text, tgt_text, status)
                 VALUES (1, 0, 0, 900, 'en', 'Hello', 'Xin chào', 'done');",
            )
            .unwrap();
        }
        let conn = open_with_key(&path, &key).unwrap();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!((version, SCHEMA_VERSION), (2, 2));
        let (text, speaker): (String, Option<String>) = conn
            .query_row("SELECT tgt_text, speaker FROM lines WHERE session_id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!((text.as_str(), speaker), ("Xin chào", None));
        drop(conn);
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Kết nối tới `path` bằng khóa `key`, chưa nâng schema (như lúc app mở file trước `migrate`).
    fn raw(path: &Path, key: &[u8; KEY_BYTES]) -> Connection {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", to_hex(key)))
            .unwrap();
        conn
    }

    /// DB như app ≤ 0.3.1 để lại (phiên bản 1, dựng bằng đúng `migrate` với một bước): từ điển hai mục, hai phiên, ba câu.
    fn version_1_database(path: &Path, key: &[u8; KEY_BYTES]) {
        let conn = raw(path, key);
        migrate_steps(&conn, &MIGRATIONS[..1]).unwrap();
        conn.execute_batch(
            "INSERT INTO glossary (source, target, match_key, created_at) VALUES ('API', 'giao diện lập trình', 'api', 5);
             INSERT INTO glossary (source, target, match_key, created_at) VALUES ('Sprint', 'chặng', 'sprint', 6);
             INSERT INTO sessions (id, started_at, ended_at, target_lang) VALUES (1, 0, 1000, 'vi');
             INSERT INTO sessions (id, started_at, ended_at, target_lang) VALUES (4, 2000, 9000, 'ja');
             INSERT INTO lines (session_id, seq, start_ms, end_ms, src_lang, src_text, tgt_text, status) VALUES
                 (1, 0, 0, 900, 'en', 'Hello', 'Xin chào', 'done'),
                 (1, 1, 900, 1500, 'en', '', '', 'dropped'),
                 (4, 0, 0, 700, 'en', 'Thanks', 'ありがとう', 'done');",
        )
        .unwrap();
        conn.close().map_err(|(_, e)| e).unwrap();
    }

    /// Mọi dòng của câu truy vấn `sql`, mỗi ô ở dạng `Debug` của giá trị SQLite (để so từng ô trước và sau migration).
    fn dump(conn: &Connection, sql: &str) -> Vec<Vec<String>> {
        let mut stmt = conn.prepare(sql).unwrap();
        let columns = stmt.column_count();
        stmt.query_map([], |r| {
            (0..columns)
                .map(|i| r.get::<_, rusqlite::types::Value>(i).map(|v| format!("{v:?}")))
                .collect()
        })
        .unwrap()
        .map(Result::unwrap)
        .collect()
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §9, QĐ 19 của kế hoạch 03: nâng DB của người dùng (phiên bản 1) không mất gì: từng ô
    /// của `glossary`, `sessions`, `lines` còn nguyên, `speaker` rỗng ở mọi câu cũ, `lines` vẫn `WITHOUT ROWID` và xóa phiên vẫn
    /// xóa câu. Mở lại lần nữa không chạy lại migration (cột không thêm hai lần, không lỗi).
    #[test]
    fn upgrading_keeps_every_old_row_and_runs_once() {
        let dir = temp_dir("v1-rows");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        let key = [8u8; KEY_BYTES];
        version_1_database(&path, &key);
        let queries = [
            "SELECT id, source, target, match_key, created_at FROM glossary ORDER BY id",
            "SELECT id, started_at, ended_at, target_lang FROM sessions ORDER BY id",
            "SELECT session_id, seq, start_ms, end_ms, src_lang, src_text, tgt_text, status FROM lines
             ORDER BY session_id, seq",
        ];
        let before: Vec<_> = {
            let conn = raw(&path, &key);
            queries.iter().map(|q| dump(&conn, q)).collect()
        };
        assert_eq!(before.iter().map(Vec::len).collect::<Vec<_>>(), [2, 2, 3]);
        // Lần đầu nâng 1 → 2; lần sau `user_version` đã là 2, không chạy bước nào.
        for round in 0..2 {
            let conn = open_with_key(&path, &key).unwrap();
            let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
            assert_eq!(version, 2, "lần mở {round}");
            let after: Vec<_> = queries.iter().map(|q| dump(&conn, q)).collect();
            assert_eq!(after, before, "lần mở {round}: dữ liệu cũ còn nguyên");
            assert_eq!(
                dump(&conn, "SELECT speaker FROM lines"),
                vec![vec!["Null".to_string()]; 3],
                "câu cũ không có nhãn"
            );
            let speaker_columns = dump(
                &conn,
                "SELECT type, \"notnull\", dflt_value FROM pragma_table_info('lines') WHERE name = 'speaker'",
            );
            assert_eq!(
                speaker_columns,
                [[r#"Text("TEXT")"#, "Integer(0)", "Null"]],
                "một cột TEXT, rỗng được, không mặc định"
            );
            drop(conn);
        }
        let conn = open_with_key(&path, &key).unwrap();
        let sql: String = conn
            .query_row("SELECT sql FROM sqlite_master WHERE name = 'lines'", [], |r| r.get(0))
            .unwrap();
        assert!(sql.contains("WITHOUT ROWID"), "{sql}");
        conn.execute("DELETE FROM sessions WHERE id = 1", []).unwrap();
        let left: i64 = conn.query_row("SELECT count(*) FROM lines", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 1, "khóa ngoại vẫn chạy: xóa phiên thì xóa câu của nó");
        drop(conn);
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Rà soát mã 03, mục 7: bước 1 → 2 hỏng giữa chừng (sau khi `ALTER TABLE` đã chạy) thì cả bước quay lui: DB vẫn ở phiên bản 1,
    /// không có cột `speaker`, mọi ô cũ còn nguyên; lần mở sau thử lại từ đầu.
    #[test]
    fn a_second_migration_failing_halfway_leaves_version_1() {
        let dir = temp_dir("v2-fails");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        let key = [5u8; KEY_BYTES];
        version_1_database(&path, &key);
        let queries = [
            "SELECT * FROM glossary ORDER BY id",
            "SELECT * FROM sessions ORDER BY id",
            "SELECT * FROM lines ORDER BY session_id, seq",
        ];
        let conn = raw(&path, &key);
        let before: Vec<_> = queries.iter().map(|q| dump(&conn, q)).collect();
        let broken = "ALTER TABLE lines ADD COLUMN speaker TEXT; SELECT * FROM no_such_table;";
        let err = migrate_steps(&conn, &[MIGRATIONS[0], broken]).unwrap_err();
        assert!(matches!(err, DbError::Sql(_)), "{err}");
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 1);
        assert_eq!(
            dump(
                &conn,
                "SELECT name FROM pragma_table_info('lines') WHERE name = 'speaker'"
            ),
            Vec::<Vec<String>>::new(),
            "ALTER TABLE quay lui"
        );
        let after: Vec<_> = queries.iter().map(|q| dump(&conn, q)).collect();
        assert_eq!(after, before);
        drop(conn);
        let conn = open_with_key(&path, &key).unwrap();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 2, "lần mở sau nâng được");
        drop(conn);
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Rà soát mã 03, mục 7: migration số 2 lỗi trên DB của người dùng (ở đây: cột `speaker` đã có, `ALTER TABLE` báo trùng cột; đời
    /// thật là đĩa đầy, file bị khóa…) thì `DataStore` báo lỗi mà không đổi tên file thành `.unreadable-*` (chỉ làm vậy khi khóa không
    /// mở được file, `NotADatabase`) và không tạo DB mới: DB vẫn ở phiên bản 1, dữ liệu còn nguyên, lần dùng sau thử lại.
    #[test]
    fn a_failed_migration_keeps_the_users_file() {
        let dir = temp_dir("v2-keep-file");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        let key = [4u8; KEY_BYTES];
        version_1_database(&path, &key);
        raw(&path, &key)
            .execute_batch("ALTER TABLE lines ADD COLUMN speaker INTEGER;")
            .unwrap();
        let rows = "SELECT * FROM lines ORDER BY session_id, seq";
        let before = dump(&raw(&path, &key), rows);
        let keys = MockStore::new().unwrap();
        keystore(&keys).set(KEY_NAME, to_hex(&key).as_bytes()).unwrap();
        let db = store(&dir, &keys);
        for attempt in 0..2 {
            let err = run(&db, |_| Ok(())).unwrap_err();
            assert!(
                matches!(&err, DbError::Sql(e) if e.sqlite_error_code() != Some(ErrorCode::NotADatabase)),
                "lần {attempt}: {err}"
            );
        }
        let mut names: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, [DB_FILE], "không đổi tên, không tạo file mới");
        let conn = raw(&path, &key);
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 1);
        assert_eq!(dump(&conn, rows), before);
        assert_eq!(
            keystore(&keys).get(KEY_NAME).unwrap().as_deref(),
            Some(to_hex(&key).as_bytes()),
            "khóa giữ nguyên"
        );
        drop(conn);
        let _ = std::fs::remove_dir_all(dir);
    }

    /// QĐ 19 của kế hoạch 03: app ≤ 0.3.1 (cùng hàm `migrate`, chỉ có `MIGRATIONS[0]`) gặp DB đã nâng lên phiên bản 2 thì từ
    /// chối mở (`Newer(2)`) và không sửa gì. Hành vi biết trước của mọi lần nâng schema; app không tự hạ phiên bản.
    #[test]
    fn an_app_with_only_the_first_migration_refuses_a_version_2_database() {
        let dir = temp_dir("v2-old-app");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        let key = [6u8; KEY_BYTES];
        version_1_database(&path, &key);
        drop(open_with_key(&path, &key).unwrap());
        let bytes = std::fs::read(&path).unwrap();
        let conn = raw(&path, &key);
        let err = migrate_steps(&conn, &MIGRATIONS[..1]).unwrap_err();
        assert!(matches!(err, DbError::Newer(2)), "{err}");
        drop(conn);
        assert_eq!(std::fs::read(&path).unwrap(), bytes, "file không đổi");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn wipe_removes_the_file_and_the_key() {
        let dir = temp_dir("wipe");
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        run(&db, |c| {
            c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
            Ok(())
        })
        .unwrap();
        // Bản đã đổi tên vì mất khóa (`set_aside`) và journal cũng mất: thư mục không còn file nào (Q2 của review 03).
        std::fs::write(dir.join(format!("{DB_FILE}.unreadable-1")), b"cu").unwrap();
        std::fs::write(dir.join(format!("{DB_FILE}.unreadable-1-1")), b"cu hon").unwrap();
        std::fs::write(journal_path(&db.path()), b"journal").unwrap();
        db.wipe().unwrap();
        assert!(!db.path().exists());
        assert_eq!(
            std::fs::read_dir(&dir).unwrap().count(),
            0,
            "không còn file nào của dữ liệu cũ"
        );
        assert_eq!(keystore(&keys).get(KEY_NAME).unwrap(), None);
        let count = run(&db, |c| {
            Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?)
        })
        .unwrap();
        assert_eq!(count, 0, "lần dùng sau tạo DB mới");
        db.wipe().unwrap();
        db.wipe().unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn set_aside_keeps_older_copies_and_drops_the_journal() {
        let dir = temp_dir("aside");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        std::fs::write(&path, b"lan 1").unwrap();
        std::fs::write(journal_path(&path), b"journal").unwrap();
        let first = set_aside(&path).unwrap();
        assert!(!journal_path(&path).exists(), "journal của file cũ không còn dùng được");
        std::fs::write(&path, b"lan 2").unwrap();
        let second = set_aside(&path).unwrap();
        assert_ne!(first, second, "không ghi đè bản cũ hơn");
        assert_eq!(std::fs::read(&first).unwrap(), b"lan 1");
        assert_eq!(std::fs::read(&second).unwrap(), b"lan 2");
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// QĐ 22 của kế hoạch 03 (phân biệt người nói): tên file theo loại build.
    #[test]
    fn the_file_name_depends_on_the_build() {
        assert_eq!(db_file_name(false), "data.db");
        assert_eq!(db_file_name(true), "data-dev.db");
    }

    /// Bản phát hành giữ đúng tên file cũ: Lịch sử và từ điển của người dùng ở đó (CI chạy test này ở bản release,
    /// bước "Test … ở bản release").
    #[cfg(not(debug_assertions))]
    #[test]
    fn release_builds_keep_data_db() {
        assert_eq!(DB_FILE, "data.db");
    }

    #[cfg(debug_assertions)]
    #[test]
    fn debug_builds_use_their_own_file() {
        assert_eq!(DB_FILE, "data-dev.db");
    }

    /// QĐ 22 của kế hoạch 03: bản dev dùng chung thư mục dữ liệu và khóa với app đã cài, nhưng không mở, không nâng, không
    /// đổi tên, không xóa file của app đã cài (cả khi "Xóa toàn bộ dữ liệu" ở bản dev).
    #[cfg(debug_assertions)]
    #[test]
    fn a_debug_build_leaves_the_installed_apps_files_alone() {
        let dir = temp_dir("dev-file");
        std::fs::create_dir_all(&dir).unwrap();
        // Byte không phải DB: mở bằng bất kỳ khóa nào cũng `NotADatabase`, tức bị đổi tên; nên byte còn nguyên nghĩa là
        // bản dev không mở file này.
        let installed = [
            ("data.db", &b"du lieu cua app da cai"[..]),
            ("data.db-journal", &b"journal cua app da cai"[..]),
            ("data.db.unreadable-1", &b"ban cu cua app da cai"[..]),
        ];
        for (name, bytes) in installed {
            std::fs::write(dir.join(name), bytes).unwrap();
        }
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        assert_eq!(db.path(), dir.join("data-dev.db"));
        run(&db, |c| {
            c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
            Ok(())
        })
        .unwrap();
        assert!(dir.join("data-dev.db").exists(), "bản dev tạo file riêng");
        for (name, bytes) in installed {
            assert_eq!(std::fs::read(dir.join(name)).unwrap(), bytes, "{name} không đổi");
        }
        db.wipe().unwrap();
        assert!(!dir.join("data-dev.db").exists());
        for (name, bytes) in installed {
            assert_eq!(
                std::fs::read(dir.join(name)).unwrap(),
                bytes,
                "{name} còn sau khi xóa dữ liệu của bản dev"
            );
        }
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), installed.len());
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// QĐ 22 của kế hoạch 03: tên mục khóa theo loại build, đi cùng tên file.
    #[test]
    fn the_key_name_depends_on_the_build() {
        assert_eq!(key_name(false), "db-key");
        assert_eq!(key_name(true), "db-key-dev");
    }

    /// Bản phát hành giữ đúng mục khóa cũ: khóa của `data.db` của người dùng nằm ở đó (CI chạy test này ở bản release).
    #[cfg(not(debug_assertions))]
    #[test]
    fn release_builds_keep_db_key() {
        assert_eq!(KEY_NAME, "db-key");
    }

    #[cfg(debug_assertions)]
    #[test]
    fn debug_builds_use_their_own_key() {
        assert_eq!(KEY_NAME, "db-key-dev");
    }

    /// QĐ 22 của kế hoạch 03: bản dev dùng chung kho khóa với app đã cài nhưng mục khóa riêng. Mở DB và "Xóa toàn bộ dữ
    /// liệu" ở bản dev không đổi mục `db-key` và `data.db` của app đã cài (nếu xóa nhầm `db-key`, lần mở sau app đã cài đổi
    /// tên `data.db` thành `.unreadable-*` và tạo DB rỗng: mất Lịch sử thật).
    #[cfg(debug_assertions)]
    #[test]
    fn a_debug_build_leaves_the_installed_apps_key_alone() {
        let dir = temp_dir("dev-key");
        std::fs::create_dir_all(&dir).unwrap();
        let keys = MockStore::new().unwrap();
        // App đã cài: DB thật `data.db` với một dòng dữ liệu, và khóa của nó ở mục `db-key`.
        let installed_key = [9u8; KEY_BYTES];
        let installed_hex = to_hex(&installed_key);
        let conn = open_with_key(&dir.join("data.db"), &installed_key).unwrap();
        conn.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])
            .unwrap();
        conn.close().map_err(|(_, e)| e).unwrap();
        keystore(&keys).set("db-key", installed_hex.as_bytes()).unwrap();
        let installed_db = std::fs::read(dir.join("data.db")).unwrap();

        // Mở DB ở bản dev: tạo mục khóa riêng, không đổi mục của app đã cài.
        let db = store(&dir, &keys);
        run(&db, |c| {
            c.execute("INSERT INTO sessions VALUES (1, 30, 40, 'en')", [])?;
            Ok(())
        })
        .unwrap();
        let dev_key = keystore(&keys)
            .get("db-key-dev")
            .unwrap()
            .expect("bản dev tạo mục khóa riêng");
        assert!(parse_key(&dev_key).is_some());
        assert_ne!(
            dev_key,
            installed_hex.as_bytes(),
            "khóa của bản dev là khóa mới, không dùng lại khóa app đã cài"
        );
        assert_eq!(
            keystore(&keys).get("db-key").unwrap().unwrap(),
            installed_hex.as_bytes()
        );
        assert_eq!(std::fs::read(dir.join("data.db")).unwrap(), installed_db);

        // "Xóa toàn bộ dữ liệu" ở bản dev: chỉ dữ liệu và khóa của bản dev mất.
        db.wipe().unwrap();
        assert_eq!(keystore(&keys).get("db-key-dev").unwrap(), None);
        assert!(!dir.join("data-dev.db").exists());
        assert_eq!(
            keystore(&keys).get("db-key").unwrap().unwrap(),
            installed_hex.as_bytes()
        );
        assert_eq!(std::fs::read(dir.join("data.db")).unwrap(), installed_db);
        // App đã cài vẫn mở được DB của nó bằng khóa của nó, dữ liệu còn nguyên.
        let reopened = open_with_key(&dir.join("data.db"), &installed_key).unwrap();
        let rows: i64 = reopened
            .query_row("SELECT count(*) FROM sessions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1);
        drop(reopened);
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// N-3 của review cuối 03: log chỉ có tên file, không có đường dẫn (đường dẫn chứa tên tài khoản của hệ điều hành).
    #[test]
    fn the_log_names_only_the_file() {
        let path =
            Path::new("/Users/someone/Library/Application Support/com.aitranslator.desktop/data.db.unreadable-17");
        assert_eq!(log_name(path), "data.db.unreadable-17");
        assert_eq!(log_name(Path::new("data.db")), "data.db");
        assert!(!log_name(path).contains("someone"));
    }

    /// N7 của review 03: SQLCipher dùng đúng thư viện mật mã của từng hệ điều hành (QĐ1). Máy build có `OPENSSL_DIR` thì
    /// `libsqlite3-sys` có thể link OpenSSL động cả trên macOS: test này đỏ.
    #[test]
    fn the_cipher_provider_matches_the_platform() {
        let dir = temp_dir("provider");
        std::fs::create_dir_all(&dir).unwrap();
        let conn = open_with_key(&dir.join(DB_FILE), &[4; KEY_BYTES]).unwrap();
        let provider: String = conn.query_row("PRAGMA cipher_provider", [], |r| r.get(0)).unwrap();
        let version: String = conn
            .query_row("PRAGMA cipher_provider_version", [], |r| r.get(0))
            .unwrap();
        if cfg!(target_os = "macos") {
            assert_eq!(provider, "commoncrypto");
        } else if cfg!(windows) {
            assert_eq!(provider, "openssl");
            assert!(version.starts_with("OpenSSL 3.6.3"), "{version}");
        }
        drop(conn);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keys_are_64_hex_digits() {
        let key = new_key().unwrap();
        assert_eq!(parse_key(to_hex(&key).as_bytes()), Some(key));
        assert_eq!(parse_key(b"zz"), None);
        assert_eq!(parse_key("g".repeat(64).as_bytes()), None);
        assert_eq!(parse_key("+f".repeat(32).as_bytes()), None, "from_str_radix nhận dấu +");
        let multibyte = format!("a{}", "ế".repeat(21));
        assert_eq!(multibyte.len(), 64);
        assert_eq!(
            parse_key(multibyte.as_bytes()),
            None,
            "không cắt giữa một ký tự nhiều byte"
        );
        assert_ne!(new_key().unwrap(), key, "hai khóa ngẫu nhiên khác nhau");
    }
}
