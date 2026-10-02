//! SQLite mã hóa bằng SQLCipher (spec §6.6, §10.2): từ điển thuật ngữ và lịch sử chép lời. File `data.db` nằm trong thư
//! mục dữ liệu cục bộ của app (`app_local_data_dir`): macOS là `~/Library/Application Support/<bundle-id>/` (cạnh
//! `settings.json`), Windows là `%LOCALAPPDATA%\<bundle-id>\`, không đi theo hồ sơ roaming, cùng chỗ với khóa của nó
//! (kho khóa Windows lưu `persistence = Local`).
//!
//! - **Khóa:** 32 byte ngẫu nhiên (`getrandom`), lưu dạng hex trong kho khóa của hệ điều hành, mục `db-key`. SQLCipher nhận
//!   thẳng khóa thô (`PRAGMA key = "x'…'"`), không qua PBKDF2, nên mở nhanh. Khóa không bao giờ vào log.
//! - **Mở lúc cần:** chỉ mở (và chỉ đọc kho khóa) ở lần đầu một tính năng cần tới DB, nên người dùng Free không bao giờ
//!   chạm tới Keychain vì DB.
//! - **Mất khóa hoặc khóa sai** (kho khóa bị xóa, file chép từ máy khác): không đọc được file nữa. File cũ được đổi tên
//!   thành `data.db.unreadable-<giây Unix>` để bộ phận hỗ trợ còn xem được, rồi app tạo DB mới. **Kho khóa lỗi** (người
//!   dùng từ chối hộp thoại Keychain, Credential Manager không mở được): trả lỗi, không đụng tới file.
//! - **Schema:** `PRAGMA user_version` là số phiên bản; [`MIGRATIONS`] chạy lần lượt trong một transaction. File của bản
//!   app mới hơn (số lớn hơn) thì từ chối mở, không sửa gì.
//! - **Xóa:** [`DataStore::wipe`] đóng kết nối, xóa file (cả journal và các bản `data.db.unreadable-*`) và mục khóa. Hai
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

pub const DB_FILE: &str = "data.db";
/// Tên mục trong kho khóa (dưới service là bundle identifier, `keystore.rs`).
pub const KEY_NAME: &str = "db-key";
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

/// Chạy `f` với DB của app. Chưa cài `DataStore` thì lỗi `dataUnavailable`.
pub fn with<R: Runtime, T>(
    app: &AppHandle<R>,
    f: impl FnOnce(&mut Connection) -> Result<T, DbError>,
) -> Result<T, CommandError> {
    let store = app
        .try_state::<DataStore>()
        .ok_or_else(|| CommandError::new(errors::DATA_UNAVAILABLE, None, "chưa cài DataStore"))?;
    store.with(f).map_err(|e| {
        log::error!("DB lỗi: {e}");
        CommandError::from(e)
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
    pub fn with<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T, DbError>) -> Result<T, DbError> {
        let mut slot = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        if slot.is_none() {
            *slot = Some(self.open()?);
        }
        f(slot.as_mut().expect("vừa mở"))
    }

    /// Xóa hẳn dữ liệu: đóng kết nối, xóa file DB (cả file journal) và mục khóa. Lần dùng sau tạo DB mới với khóa mới.
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
                log::warn!("khóa không mở được {}: tạo DB mới", path.display());
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
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version > SCHEMA_VERSION {
        return Err(DbError::Newer(version));
    }
    for (i, step) in MIGRATIONS.iter().enumerate().skip(version as usize) {
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
    log::warn!("đã đổi tên DB không đọc được thành {}", target.display());
    Ok(target)
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
        let (names, version) = db
            .with(|c| {
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
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_file_cannot_be_read_without_the_right_key() {
        let dir = temp_dir("nokey");
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        db.with(|c| {
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
        std::fs::remove_dir_all(dir).unwrap();
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
        db.with(|c| {
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
        store(&dir, &keys)
            .with(|c| {
                c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
                Ok(())
            })
            .unwrap();
        let count = store(&dir, &keys)
            .with(|c| Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?))
            .unwrap();
        assert_eq!(count, 1);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_lost_key_moves_the_old_file_aside() {
        let dir = temp_dir("lost");
        let keys = MockStore::new().unwrap();
        store(&dir, &keys)
            .with(|c| {
                c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
                Ok(())
            })
            .unwrap();
        assert!(keystore(&keys).delete(KEY_NAME).unwrap());
        let count = store(&dir, &keys)
            .with(|c| Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?))
            .unwrap();
        assert_eq!(count, 0, "DB mới, rỗng");
        let aside: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with("data.db.unreadable-"))
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
        let names = store(&dir, &keys).with(|c| Ok(tables(c))).unwrap();
        assert_eq!(names, ["glossary", "lines", "sessions"]);
        assert_eq!(
            std::fs::read_dir(&dir).unwrap().count(),
            2,
            "data.db mới và bản cũ đã đổi tên"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keystore_errors_leave_the_file_alone() {
        let dir = temp_dir("denied");
        let keys = MockStore::new().unwrap();
        store(&dir, &keys).with(|_| Ok(())).unwrap();
        let before = std::fs::read(dir.join(DB_FILE)).unwrap();
        let entry = keys.build(SERVICE, KEY_NAME, None).unwrap();
        let cred: &keyring_core::mock::Cred = entry.as_any().downcast_ref().unwrap();
        cred.set_error(keyring_core::Error::NoStorageAccess("người dùng từ chối".into()));
        let err = store(&dir, &keys).with(|_| Ok(())).unwrap_err();
        assert!(matches!(err, DbError::Keystore(_)), "{err}");
        assert_eq!(std::fs::read(dir.join(DB_FILE)).unwrap(), before);
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        let none = DataStore::new(dir.clone(), Err("không có kho khóa".into()));
        assert!(matches!(none.with(|_| Ok(())), Err(DbError::Keystore(_))));
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

    #[test]
    fn wipe_removes_the_file_and_the_key() {
        let dir = temp_dir("wipe");
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        db.with(|c| {
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
        let count = db
            .with(|c| Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?))
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
