//! Đọc ghi file cài đặt bằng `tauri-plugin-store` (spec §6.9).
//!
//! File nằm ở thư mục dữ liệu của app (`BaseDirectory::AppData`): trên macOS là
//! `~/Library/Application Support/<bundle-id>/settings.json`, trên Windows là
//! `%APPDATA%\<bundle-id>\settings.json`. Store tự ghi file sau 300 ms kể từ lần sửa cuối, và ghi
//! lần cuối khi app thoát.
//!
//! Giao diện không gọi thẳng được lệnh của plugin (capabilities không cấp `store:*`); mọi thay đổi
//! đi qua lệnh `update_settings`, nơi phía Rust kiểm phạm vi.
//!
//! Việc ghi đi qua trait `SettingsFile`: app thật cài bản ghi vào store ở `setup` (`install`); app giả
//! của test dùng bản giả (`test_support::FakeSettingsFile`), vì đăng ký `tauri-plugin-store` trong test
//! sẽ ghi vào thư mục cài đặt thật của app. Chưa cài thì `save` trả lỗi, không panic.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::{StoreBuilder, StoreExt};

use super::Settings;
use super::migrate::{self, FileMeta, Loaded};

pub const STORE_FILE: &str = "settings.json";
const AUTO_SAVE: Duration = Duration::from_millis(300);

/// Mở store và đọc cài đặt, kèm migrate từ schema cũ.
pub fn load<R: Runtime>(app: &AppHandle<R>, defaults: Settings) -> Result<Loaded, tauri_plugin_store::Error> {
    let path = tauri_plugin_store::resolve_store_path(app, STORE_FILE)?;
    match backup_if_corrupt(&path) {
        Ok(Some(backup)) => log::warn!("file cài đặt hỏng, đã đổi tên thành {}", backup.display()),
        Ok(None) => {}
        Err(e) => log::warn!("không kiểm được file cài đặt: {e}"),
    }
    let store = StoreBuilder::new(app, STORE_FILE).auto_save(AUTO_SAVE).build()?;
    let raw: Map<String, Value> = store.entries().into_iter().collect();
    Ok(migrate::load(raw, defaults))
}

/// Nơi ghi các mục của file cài đặt.
pub trait SettingsFile: Send + Sync + 'static {
    fn write(&self, entries: Vec<(String, Value)>) -> Result<(), String>;
}

/// `SettingsFile` đang dùng, quản lý bằng `app.manage`.
pub struct Writer(pub Box<dyn SettingsFile>);

struct StoreFile<R: Runtime>(AppHandle<R>);

impl<R: Runtime> SettingsFile for StoreFile<R> {
    fn write(&self, entries: Vec<(String, Value)>) -> Result<(), String> {
        let store = self.0.store(STORE_FILE).map_err(|e| e.to_string())?;
        for (key, value) in entries {
            store.set(key, value);
        }
        Ok(())
    }
}

/// Cài bản ghi vào store. Gọi một lần ở đầu `setup`.
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    app.manage(Writer(Box::new(StoreFile(app.clone()))));
}

fn write<R: Runtime>(app: &AppHandle<R>, entries: Vec<(String, Value)>) -> Result<(), String> {
    match app.try_state::<Writer>() {
        Some(writer) => writer.0.write(entries),
        None => Err("chưa cài SettingsFile".into()),
    }
}

/// Ghi mọi khóa của `settings` vào store. Khóa lạ đã có trong file (của bản app mới hơn) giữ nguyên;
/// khóa bản mới hơn ghi mà bản này không đọc được thì ghi lại giá trị thô (`FileMeta::preserved`).
pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &Settings, meta: &FileMeta) -> Result<(), String> {
    write(app, migrate::to_entries(settings, meta))
}

/// Chỉ ghi khóa `overlay`. Dùng khi thanh phụ đề di chuyển: lúc kéo, sự kiện đến dồn dập, nên không
/// ghi lại mọi khóa (mỗi lần ghi một khóa, store phát một sự kiện `store://change`).
pub fn save_overlay<R: Runtime>(app: &AppHandle<R>, settings: &Settings, meta: &FileMeta) -> Result<(), String> {
    let entries = migrate::to_entries(settings, meta)
        .into_iter()
        .filter(|(k, _)| k == "overlay")
        .collect();
    write(app, entries)
}

/// `tauri-plugin-store` bỏ qua file không đọc được và mở store rỗng; lần ghi sau sẽ đè mất file.
/// Vì vậy trước khi mở store, file không phải object JSON thì đổi tên thành `settings.json.corrupt`
/// để người dùng hay bộ phận hỗ trợ còn xem lại được. Trả về đường dẫn bản đã đổi tên, nếu có.
pub fn backup_if_corrupt(path: &Path) -> std::io::Result<Option<PathBuf>> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    if serde_json::from_slice::<Map<String, Value>>(&bytes).is_ok() {
        return Ok(None);
    }
    let mut backup = path.as_os_str().to_owned();
    backup.push(".corrupt");
    let backup = PathBuf::from(backup);
    std::fs::rename(path, &backup)?;
    Ok(Some(backup))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-settings-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn corrupt_file_is_renamed() {
        let dir = temp_dir("corrupt");
        let path = dir.join(STORE_FILE);
        std::fs::write(&path, b"{\"uiLanguage\": \"vi\",").unwrap();
        let backup = backup_if_corrupt(&path).unwrap().unwrap();
        assert_eq!(backup, dir.join("settings.json.corrupt"));
        assert!(!path.exists());
        assert_eq!(std::fs::read(&backup).unwrap(), b"{\"uiLanguage\": \"vi\",");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[derive(Clone, Default)]
    struct Recorder(std::sync::Arc<std::sync::Mutex<Vec<Vec<String>>>>);

    impl SettingsFile for Recorder {
        fn write(&self, entries: Vec<(String, Value)>) -> Result<(), String> {
            self.0
                .lock()
                .unwrap()
                .push(entries.into_iter().map(|(k, _)| k).collect());
            Ok(())
        }
    }

    #[test]
    fn saving_without_a_settings_file_fails_instead_of_panicking() {
        let app = tauri::test::mock_app();
        let settings = Settings::defaults(crate::settings::UiLanguage::Vi);
        assert!(save(app.handle(), &settings, &FileMeta::current()).is_err());
        assert!(save_overlay(app.handle(), &settings, &FileMeta::current()).is_err());
    }

    #[test]
    fn save_writes_every_key_and_save_overlay_only_overlay() {
        let app = tauri::test::mock_app();
        let recorder = Recorder::default();
        app.manage(Writer(Box::new(recorder.clone())));
        let settings = Settings::defaults(crate::settings::UiLanguage::Vi);
        save(app.handle(), &settings, &FileMeta::current()).unwrap();
        save_overlay(app.handle(), &settings, &FileMeta::current()).unwrap();
        let writes = recorder.0.lock().unwrap();
        assert!(writes[0].contains(&"schemaVersion".to_string()));
        assert!(writes[0].contains(&"overlay".to_string()));
        assert!(writes[0].contains(&"launchAtLogin".to_string()));
        assert_eq!(writes[1], ["overlay"]);
    }

    #[test]
    fn valid_or_missing_file_is_left_alone() {
        let dir = temp_dir("valid");
        let path = dir.join(STORE_FILE);
        assert_eq!(backup_if_corrupt(&path).unwrap(), None);
        std::fs::write(&path, b"{\"schemaVersion\": 1}").unwrap();
        assert_eq!(backup_if_corrupt(&path).unwrap(), None);
        assert!(path.exists());
        // Mảng JSON không phải object của store: coi là hỏng.
        std::fs::write(&path, b"[1, 2]").unwrap();
        assert!(backup_if_corrupt(&path).unwrap().is_some());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
