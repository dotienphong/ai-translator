//! Kho khóa của hệ điều hành (spec §10.2, Đ5 của kế hoạch 00): Keychain trên macOS, Credential
//! Manager trên Windows, qua `keyring-core`.
//!
//! Người dùng sau: kế hoạch 03 lưu khóa SQLCipher; kế hoạch 06 lưu trạng thái bản quyền và quota.
//! Mỗi kế hoạch tự đặt tên mục (hằng số `&str`) của mình.
//!
//! - Mọi mục nằm dưới cùng một "service" là bundle identifier của app (`app.config().identifier`),
//!   để khi Q1 chốt identifier thì chỉ đổi ở một chỗ (R17).
//! - Windows: mục lưu với `persistence = Local` (chỉ trên máy này), không dùng mặc định `Enterprise`
//!   (đi theo hồ sơ roaming của tài khoản domain sang máy khác), vì trạng thái bản quyền và quota gắn
//!   với từng máy (spec §6.8).
//! - Không ghi giá trị bí mật vào log, kể cả khi lỗi.
//! - **macOS gộp mọi giá trị vào một mục Keychain duy nhất** (`VAULT_ENTRY`, spec
//!   2026-10-09-macos-update-prompts-research.md, lựa chọn B). Bản ký ad-hoc đổi `cdhash` sau mỗi bản cập nhật, nên macOS hỏi
//!   lại quyền truy cập *từng mục* Keychain; một mục chung thì chỉ hỏi một lần. Các mục riêng của bản cũ được đọc và chép
//!   vào mục chung khi gặp lần đầu (mỗi mục cũ vẫn hỏi một lần, đúng lần cập nhật đầu tiên lên bản này); xem `VaultDoc`.
//!   Windows giữ từng mục riêng (Credential Manager không hỏi gì khi cập nhật, và giới hạn 2560 byte mỗi mục).
//! - Test dùng `Keystore::mock`, không đụng kho khóa thật. Đọc ghi Keychain thật bằng binary vừa
//!   build lại có thể bật hộp thoại hỏi quyền (mục 6.8 của kế hoạch 00), nên test thật để `#[ignore]`.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::{Arc, Mutex};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use keyring_core::{CredentialStore, Error};
use serde::{Deserialize, Serialize};

/// Credential Manager giới hạn 2560 byte mỗi mục; giữ một giới hạn chung cho cả hai hệ điều hành.
pub const MAX_SECRET_BYTES: usize = 2048;
const MAX_NAME_LEN: usize = 64;

/// Tên mục Keychain chứa mọi giá trị khi ở chế độ gộp. Hợp lệ theo `Keystore::entry`, nhưng tên này nằm ngoài không gian tên
/// của các giá trị (chúng nằm trong `VaultDoc`), nên không thể trùng.
const VAULT_ENTRY: &str = "vault";

/// Kho khóa thật của hệ điều hành có gộp một mục không: chỉ macOS.
pub const AGGREGATE_OS_ITEMS: bool = cfg!(target_os = "macos");

/// Nhiều `Keystore` gộp (db.rs và license/app.rs mỗi nơi một `Keystore::os`) cùng đọc-sửa-ghi một mục: khóa chung cho cả tiến
/// trình, để hai lần ghi cùng lúc không làm mất nhau.
static VAULT_LOCK: Mutex<()> = Mutex::new(());

/// Nội dung mục chung (JSON). `items`: tên → giá trị (base64). `legacy_done`: tên đã xử lý xong với mục riêng của bản cũ
/// (đã chép sang, đã ghi đè, hay đã xóa); không bao giờ đọc lại mục riêng của tên đó, để mục cũ còn sót không "sống lại" sau
/// khi bị xóa (việc xóa mục riêng cũ có thể thất bại nếu người dùng từ chối hộp thoại).
#[derive(Default, Serialize, Deserialize)]
struct VaultDoc {
    #[serde(default)]
    items: BTreeMap<String, String>,
    #[serde(default)]
    legacy_done: BTreeSet<String>,
}

/// Tùy chọn của store gốc khi tạo từng mục (modifier của `keyring-core`).
#[cfg(windows)]
pub const PLATFORM_MODIFIERS: &[(&str, &str)] = &[("persistence", "Local")];
#[cfg(not(windows))]
pub const PLATFORM_MODIFIERS: &[(&str, &str)] = &[];

#[derive(Debug, thiserror::Error)]
pub enum KeystoreError {
    #[error("tên mục kho khóa không hợp lệ: {0:?}")]
    InvalidName(String),
    #[error("giá trị quá lớn cho kho khóa ({0} byte, tối đa {MAX_SECRET_BYTES})")]
    TooLarge(usize),
    #[error("không truy cập được kho khóa của hệ điều hành: {0}")]
    Access(String),
    #[error("lỗi kho khóa của hệ điều hành: {0}")]
    Platform(String),
}

pub struct Keystore {
    service: String,
    store: Arc<CredentialStore>,
    modifiers: &'static [(&'static str, &'static str)],
    /// Gộp mọi giá trị vào một mục chung (xem tài liệu đầu file).
    aggregate: bool,
}

impl Keystore {
    /// Kho khóa thật của hệ điều hành.
    pub fn os(service: &str) -> Result<Self, KeystoreError> {
        let ks = Self {
            modifiers: PLATFORM_MODIFIERS,
            ..Self::with_store(service, platform_store()?)
        };
        Ok(if AGGREGATE_OS_ITEMS { ks.aggregated() } else { ks })
    }

    /// Chuyển sang chế độ gộp một mục chung.
    pub fn aggregated(mut self) -> Self {
        self.aggregate = true;
        self
    }

    /// Kho khóa trong bộ nhớ, cho test. Dữ liệu mất khi `Keystore` bị hủy.
    pub fn mock(service: &str) -> Self {
        Self::with_store(
            service,
            keyring_core::mock::Store::new().expect("mock store luôn tạo được"),
        )
    }

    pub fn with_store(service: &str, store: Arc<CredentialStore>) -> Self {
        Self {
            service: service.to_string(),
            store,
            modifiers: &[],
            aggregate: false,
        }
    }

    /// Đọc một mục; `None` nếu chưa có.
    pub fn get(&self, name: &str) -> Result<Option<Vec<u8>>, KeystoreError> {
        if self.aggregate {
            return self.vault_get(name);
        }
        match self.entry(name)?.get_secret() {
            Ok(secret) => Ok(Some(secret)),
            Err(Error::NoEntry) => Ok(None),
            Err(e) => Err(map_error(e)),
        }
    }

    /// Ghi đè một mục.
    pub fn set(&self, name: &str, secret: &[u8]) -> Result<(), KeystoreError> {
        if secret.len() > MAX_SECRET_BYTES {
            return Err(KeystoreError::TooLarge(secret.len()));
        }
        if self.aggregate {
            return self.vault_set(name, secret);
        }
        self.entry(name)?.set_secret(secret).map_err(map_error)
    }

    /// Xóa một mục; trả `false` nếu mục chưa có.
    pub fn delete(&self, name: &str) -> Result<bool, KeystoreError> {
        if self.aggregate {
            return self.vault_delete(name);
        }
        match self.entry(name)?.delete_credential() {
            Ok(()) => Ok(true),
            Err(Error::NoEntry) => Ok(false),
            Err(e) => Err(map_error(e)),
        }
    }

    // ---- Chế độ gộp: mọi hàm dưới đây chạy trong `VAULT_LOCK` ----

    fn lock() -> std::sync::MutexGuard<'static, ()> {
        VAULT_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Đọc mục chung; chưa có thì là tài liệu rỗng. Nội dung hỏng là lỗi, không bị ghi đè (mất dữ liệu âm thầm tệ hơn lỗi).
    fn load_vault(&self) -> Result<VaultDoc, KeystoreError> {
        match self.entry(VAULT_ENTRY)?.get_secret() {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|_| KeystoreError::Platform("mục chung của kho khóa bị hỏng".into())),
            Err(Error::NoEntry) => Ok(VaultDoc::default()),
            Err(e) => Err(map_error(e)),
        }
    }

    fn save_vault(&self, doc: &VaultDoc) -> Result<(), KeystoreError> {
        let bytes = serde_json::to_vec(doc).map_err(|e| KeystoreError::Platform(e.to_string()))?;
        self.entry(VAULT_ENTRY)?.set_secret(&bytes).map_err(map_error)
    }

    fn vault_get(&self, name: &str) -> Result<Option<Vec<u8>>, KeystoreError> {
        self.entry(name)?; // kiểm tên
        let _guard = Self::lock();
        let mut doc = self.load_vault()?;
        if let Some(encoded) = doc.items.get(name) {
            return STANDARD
                .decode(encoded)
                .map(Some)
                .map_err(|_| KeystoreError::Platform("mục chung của kho khóa bị hỏng".into()));
        }
        if doc.legacy_done.contains(name) {
            return Ok(None);
        }
        // Mục riêng của bản cũ: đọc (macOS có thể hỏi một lần), chép vào mục chung.
        match self.entry(name)?.get_secret() {
            Ok(secret) => {
                doc.items.insert(name.to_string(), STANDARD.encode(&secret));
                doc.legacy_done.insert(name.to_string());
                // Chép không được (ví dụ mục chung bị khóa) thì vẫn trả giá trị đã đọc; lần sau thử lại.
                let _ = self.save_vault(&doc);
                Ok(Some(secret))
            }
            Err(Error::NoEntry) => Ok(None),
            Err(e) => Err(map_error(e)),
        }
    }

    fn vault_set(&self, name: &str, secret: &[u8]) -> Result<(), KeystoreError> {
        self.entry(name)?;
        let _guard = Self::lock();
        let mut doc = self.load_vault()?;
        doc.items.insert(name.to_string(), STANDARD.encode(secret));
        doc.legacy_done.insert(name.to_string());
        self.save_vault(&doc)
    }

    fn vault_delete(&self, name: &str) -> Result<bool, KeystoreError> {
        self.entry(name)?;
        let _guard = Self::lock();
        let mut doc = self.load_vault()?;
        let mut existed = doc.items.remove(name).is_some();
        if !doc.legacy_done.contains(name) {
            // Mục riêng của bản cũ: xóa nếu còn. Lỗi khác "không có" (ví dụ người dùng từ chối) vẫn coi là có, và `legacy_done`
            // ngăn nó sống lại.
            match self.entry(name)?.delete_credential() {
                Err(Error::NoEntry) => {}
                _ => existed = true,
            }
        }
        if existed {
            doc.legacy_done.insert(name.to_string());
            self.save_vault(&doc)?;
        }
        Ok(existed)
    }

    fn entry(&self, name: &str) -> Result<keyring_core::Entry, KeystoreError> {
        let valid = !name.is_empty()
            && name.len() <= MAX_NAME_LEN
            && name
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b));
        if !valid {
            return Err(KeystoreError::InvalidName(name.to_string()));
        }
        let modifiers: HashMap<&str, &str> = self.modifiers.iter().copied().collect();
        self.store
            .build(&self.service, name, (!modifiers.is_empty()).then_some(&modifiers))
            .map_err(map_error)
    }
}

#[cfg(target_os = "macos")]
fn platform_store() -> Result<Arc<CredentialStore>, KeystoreError> {
    let store: Arc<CredentialStore> = apple_native_keyring_store::keychain::Store::new().map_err(map_error)?;
    Ok(store)
}

#[cfg(windows)]
fn platform_store() -> Result<Arc<CredentialStore>, KeystoreError> {
    let store: Arc<CredentialStore> = windows_native_keyring_store::Store::new().map_err(map_error)?;
    Ok(store)
}

#[cfg(not(any(target_os = "macos", windows)))]
fn platform_store() -> Result<Arc<CredentialStore>, KeystoreError> {
    Err(KeystoreError::Platform("chỉ hỗ trợ macOS và Windows (spec D3)".into()))
}

/// Đổi lỗi của keyring sang lỗi của app. Chỉ giữ thông báo chữ; `BadEncoding` và `BadDataFormat`
/// có kèm byte của giá trị, nên không dùng `Debug` của lỗi gốc.
fn map_error(error: Error) -> KeystoreError {
    match error {
        Error::NoStorageAccess(e) => KeystoreError::Access(e.to_string()),
        other => KeystoreError::Platform(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use keyring_core::api::CredentialStoreApi;

    use super::*;

    const SERVICE: &str = "com.aitranslator.desktop.test";

    #[test]
    fn set_get_delete_roundtrip() {
        let ks = Keystore::mock(SERVICE);
        assert_eq!(ks.get("db-key").unwrap(), None);
        ks.set("db-key", &[1, 2, 3]).unwrap();
        assert_eq!(ks.get("db-key").unwrap(), Some(vec![1, 2, 3]));
        ks.set("db-key", b"moi").unwrap();
        assert_eq!(ks.get("db-key").unwrap(), Some(b"moi".to_vec()), "ghi đè giá trị cũ");
        assert!(ks.delete("db-key").unwrap());
        assert_eq!(ks.get("db-key").unwrap(), None);
        assert!(!ks.delete("db-key").unwrap(), "xóa mục chưa có không phải lỗi");
    }

    #[test]
    fn items_are_separated_by_name_and_service() {
        let store = keyring_core::mock::Store::new().unwrap();
        let app = Keystore::with_store(SERVICE, store.clone());
        let other = Keystore::with_store("other.app", store);
        app.set("license.state", b"a").unwrap();
        app.set("quota", b"b").unwrap();
        assert_eq!(app.get("license.state").unwrap(), Some(b"a".to_vec()));
        assert_eq!(app.get("quota").unwrap(), Some(b"b".to_vec()));
        assert_eq!(other.get("quota").unwrap(), None);
    }

    #[test]
    fn rejects_bad_names_and_large_values() {
        let ks = Keystore::mock(SERVICE);
        for name in ["", "Db-Key", "db key", "khóa", &"a".repeat(65)] {
            assert!(
                matches!(ks.set(name, b"x"), Err(KeystoreError::InvalidName(_))),
                "{name:?}"
            );
        }
        assert!(matches!(
            ks.set("big", &[0; MAX_SECRET_BYTES + 1]),
            Err(KeystoreError::TooLarge(2049))
        ));
        ks.set("big", &[0; MAX_SECRET_BYTES]).unwrap();
    }

    #[test]
    fn accepts_names_at_the_bounds() {
        let ks = Keystore::mock(SERVICE);
        let longest = "a".repeat(MAX_NAME_LEN);
        for name in [longest.as_str(), "license_state", "a.b-c_d9"] {
            ks.set(name, b"x").unwrap_or_else(|e| panic!("{name:?}: {e}"));
            assert_eq!(ks.get(name).unwrap(), Some(b"x".to_vec()), "{name:?}");
        }
    }

    #[test]
    fn platform_errors_are_reported() {
        let ks = Keystore::mock(SERVICE);
        let entry = ks.entry("db-key").unwrap();
        let mock: &keyring_core::mock::Cred = entry.as_any().downcast_ref().unwrap();
        mock.set_error(Error::NoStorageAccess("bị khóa".into()));
        assert!(matches!(ks.get("db-key"), Err(KeystoreError::Access(_))));
        assert_eq!(ks.get("db-key").unwrap(), None, "lỗi giả chỉ áp cho một lần gọi");
    }

    #[test]
    fn windows_items_stay_on_this_machine() {
        let expected: &[(&str, &str)] = if cfg!(windows) {
            &[("persistence", "Local")]
        } else {
            &[]
        };
        assert_eq!(PLATFORM_MODIFIERS, expected);
    }

    // ---- Chế độ gộp một mục (macOS, spec 2026-10-09-macos-update-prompts-research.md, lựa chọn B) ----

    type MockStore = Arc<keyring_core::mock::Store>;

    fn legacy(store: &MockStore) -> Keystore {
        Keystore::with_store(SERVICE, store.clone())
    }

    fn aggregated(store: &MockStore) -> Keystore {
        Keystore::with_store(SERVICE, store.clone()).aggregated()
    }

    fn raw(store: &MockStore, name: &str) -> Result<Vec<u8>, Error> {
        store.build(SERVICE, name, None).unwrap().get_secret()
    }

    #[test]
    fn aggregated_set_get_delete_roundtrip() {
        let store = keyring_core::mock::Store::new().unwrap();
        let ks = aggregated(&store);
        assert_eq!(ks.get("db-key").unwrap(), None);
        ks.set("db-key", &[1, 2, 3]).unwrap();
        assert_eq!(ks.get("db-key").unwrap(), Some(vec![1, 2, 3]));
        ks.set("db-key", b"moi").unwrap();
        assert_eq!(ks.get("db-key").unwrap(), Some(b"moi".to_vec()), "ghi đè giá trị cũ");
        assert!(ks.delete("db-key").unwrap());
        assert_eq!(ks.get("db-key").unwrap(), None);
        assert!(!ks.delete("db-key").unwrap(), "xóa mục chưa có không phải lỗi");
    }

    #[test]
    fn aggregated_keeps_every_secret_in_one_os_item() {
        let store = keyring_core::mock::Store::new().unwrap();
        let ks = aggregated(&store);
        for (name, value) in [("db-key", b"a".as_slice()), ("license", b"b"), ("quota-free", b"c")] {
            ks.set(name, value).unwrap();
        }
        for name in ["db-key", "license", "quota-free"] {
            assert!(matches!(raw(&store, name), Err(Error::NoEntry)), "{name} không được có mục riêng");
        }
        assert!(raw(&store, VAULT_ENTRY).is_ok(), "chỉ có một mục chung");
    }

    #[test]
    fn aggregated_reading_a_missing_name_creates_nothing() {
        let store = keyring_core::mock::Store::new().unwrap();
        assert_eq!(aggregated(&store).get("license").unwrap(), None);
        assert!(matches!(raw(&store, VAULT_ENTRY), Err(Error::NoEntry)));
    }

    #[test]
    fn aggregated_adopts_old_separate_items_on_first_read() {
        let store = keyring_core::mock::Store::new().unwrap();
        let old = legacy(&store);
        old.set("license", b"token-cu").unwrap();
        old.set("quota-free", b"dem-cu").unwrap();

        let ks = aggregated(&store);
        assert_eq!(ks.get("license").unwrap(), Some(b"token-cu".to_vec()));
        // Đã chép vào mục chung: xóa mục riêng cũ đi vẫn đọc được.
        old.delete("license").unwrap();
        assert_eq!(aggregated(&store).get("license").unwrap(), Some(b"token-cu".to_vec()));
        // Mục cũ chưa đọc thì vẫn nhận được sau đó.
        assert_eq!(ks.get("quota-free").unwrap(), Some(b"dem-cu".to_vec()));
    }

    #[test]
    fn aggregated_a_new_write_wins_over_an_old_separate_item() {
        let store = keyring_core::mock::Store::new().unwrap();
        legacy(&store).set("license", b"cu").unwrap();
        let ks = aggregated(&store);
        ks.set("license", b"moi").unwrap();
        assert_eq!(ks.get("license").unwrap(), Some(b"moi".to_vec()));
        assert!(ks.delete("license").unwrap());
        assert_eq!(ks.get("license").unwrap(), None, "mục riêng cũ không được sống lại");
    }

    #[test]
    fn aggregated_a_deleted_name_does_not_come_back_from_an_old_item() {
        let store = keyring_core::mock::Store::new().unwrap();
        legacy(&store).set("license", b"cu").unwrap();
        let ks = aggregated(&store);
        assert!(ks.delete("license").unwrap(), "có mục cũ nên là có xóa");
        // Giả lập việc xóa mục riêng cũ thất bại (người dùng từ chối hộp thoại): mục cũ vẫn còn.
        legacy(&store).set("license", b"cu").unwrap();
        assert_eq!(ks.get("license").unwrap(), None);
        assert_eq!(aggregated(&store).get("license").unwrap(), None);
    }

    #[test]
    fn aggregated_old_items_of_another_service_are_not_adopted() {
        let store = keyring_core::mock::Store::new().unwrap();
        Keystore::with_store("other.app", store.clone()).set("license", b"x").unwrap();
        assert_eq!(aggregated(&store).get("license").unwrap(), None);
    }

    #[test]
    fn aggregated_validates_names_and_sizes_like_the_plain_store() {
        let store = keyring_core::mock::Store::new().unwrap();
        let ks = aggregated(&store);
        for name in ["", "Db-Key", "db key", "khóa", &"a".repeat(65)] {
            assert!(matches!(ks.set(name, b"x"), Err(KeystoreError::InvalidName(_))), "{name:?}");
            assert!(matches!(ks.get(name), Err(KeystoreError::InvalidName(_))), "{name:?}");
            assert!(matches!(ks.delete(name), Err(KeystoreError::InvalidName(_))), "{name:?}");
        }
        assert!(matches!(ks.set("big", &[0; MAX_SECRET_BYTES + 1]), Err(KeystoreError::TooLarge(2049))));
        ks.set("big", &[0; MAX_SECRET_BYTES]).unwrap();
        assert_eq!(ks.get("big").unwrap().unwrap().len(), MAX_SECRET_BYTES);
        assert!(raw(&store, VAULT_ENTRY).is_ok());
    }

    #[test]
    fn aggregated_service_names_do_not_mix() {
        let store = keyring_core::mock::Store::new().unwrap();
        let a = Keystore::with_store(SERVICE, store.clone()).aggregated();
        let b = Keystore::with_store("other.app", store).aggregated();
        a.set("quota", b"a").unwrap();
        b.set("quota", b"b").unwrap();
        assert_eq!(a.get("quota").unwrap(), Some(b"a".to_vec()));
        assert_eq!(b.get("quota").unwrap(), Some(b"b".to_vec()));
    }

    #[test]
    fn aggregated_platform_errors_are_reported_and_nothing_is_lost() {
        let store = keyring_core::mock::Store::new().unwrap();
        let ks = aggregated(&store);
        ks.set("license", b"giu").unwrap();
        let entry = ks.entry(VAULT_ENTRY).unwrap();
        let mock: &keyring_core::mock::Cred = entry.as_any().downcast_ref().unwrap();
        mock.set_error(Error::NoStorageAccess("bị khóa".into()));
        assert!(matches!(ks.get("license"), Err(KeystoreError::Access(_))));
        mock.set_error(Error::NoStorageAccess("bị khóa".into()));
        assert!(matches!(ks.set("quota", b"x"), Err(KeystoreError::Access(_))));
        assert_eq!(ks.get("license").unwrap(), Some(b"giu".to_vec()), "lỗi tạm không làm mất dữ liệu");
        assert_eq!(ks.get("quota").unwrap(), None, "lần ghi lỗi không để lại gì");
    }

    #[test]
    fn aggregated_a_corrupt_shared_item_is_an_error_and_is_not_overwritten() {
        let store = keyring_core::mock::Store::new().unwrap();
        let ks = aggregated(&store);
        store.build(SERVICE, VAULT_ENTRY, None).unwrap().set_secret(b"khong phai json").unwrap();
        assert!(matches!(ks.get("license"), Err(KeystoreError::Platform(_))));
        assert!(matches!(ks.set("license", b"x"), Err(KeystoreError::Platform(_))));
        assert_eq!(raw(&store, VAULT_ENTRY).unwrap(), b"khong phai json".to_vec());
    }

    #[test]
    fn aggregated_two_keystores_writing_at_once_lose_nothing() {
        let store = keyring_core::mock::Store::new().unwrap();
        let handles: Vec<_> = (0..8)
            .map(|t| {
                let store = store.clone();
                std::thread::spawn(move || {
                    // Mỗi luồng một Keystore riêng, như `db.rs` và `license/app.rs` mỗi nơi một `Keystore::os`.
                    let ks = Keystore::with_store(SERVICE, store).aggregated();
                    for i in 0..15 {
                        ks.set(&format!("t{t}-{i}"), format!("{t}:{i}").as_bytes()).unwrap();
                    }
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        let ks = aggregated(&store);
        for t in 0..8 {
            for i in 0..15 {
                assert_eq!(ks.get(&format!("t{t}-{i}")).unwrap(), Some(format!("{t}:{i}").into_bytes()), "t{t}-{i}");
            }
        }
    }

    #[test]
    fn the_os_store_is_aggregated_only_on_macos() {
        // Windows: Credential Manager không hỏi gì khi cập nhật và giới hạn 2560 byte mỗi mục, nên giữ từng mục riêng.
        assert_eq!(AGGREGATE_OS_ITEMS, cfg!(target_os = "macos"));
    }

    /// Chạy tay (người), chỉ macOS: `cargo test -p meeting-translator --lib os_keystore_one_item -- --ignored`.
    /// Ghi 5 giá trị qua kho khóa thật rồi kiểm trong Keychain chỉ có MỘT mục (`vault`); xóa sạch khi xong.
    #[test]
    #[ignore = "đụng Keychain thật; chỉ macOS"]
    fn os_keystore_one_item() {
        if !AGGREGATE_OS_ITEMS {
            return;
        }
        let service = format!("{SERVICE}.one-item-{}", std::process::id());
        let ks = Keystore::os(&service).unwrap();
        let names = ["db-key", "license", "license-seen", "license-trial", "quota-free"];
        for name in names {
            ks.set(name, name.as_bytes()).unwrap();
        }
        let find = |account: &str| {
            std::process::Command::new("security")
                .args(["find-generic-password", "-s", &service, "-a", account])
                .output()
                .unwrap()
                .status
                .success()
        };
        assert!(find(VAULT_ENTRY), "phải có mục chung");
        for name in names {
            assert!(!find(name), "{name} không được có mục riêng trong Keychain");
            assert_eq!(ks.get(name).unwrap(), Some(name.as_bytes().to_vec()));
        }
        for name in names {
            assert!(ks.delete(name).unwrap());
        }
        // Dọn mục chung (không có API công khai để xóa nó qua `Keystore`).
        ks.entry(VAULT_ENTRY).unwrap().delete_credential().unwrap();
        assert!(!find(VAULT_ENTRY));
    }

    /// Chạy tay (người): `cargo test -p meeting-translator --lib os_keystore -- --ignored`.
    /// Ghi, đọc rồi xóa một mục thật trong Keychain hoặc Credential Manager. Có biến môi trường
    /// `KEYSTORE_KEEP` thì không xóa, để xem mục bằng `cmdkey /list` (Task 25 của kế hoạch 01); người thử tự xóa.
    #[test]
    #[ignore = "đụng kho khóa thật của hệ điều hành; có thể bật hộp thoại hỏi quyền"]
    fn os_keystore_roundtrip() {
        let ks = Keystore::os(SERVICE).unwrap();
        let name = format!("test-{}", std::process::id());
        ks.set(&name, b"gia-tri-thu").unwrap();
        assert_eq!(ks.get(&name).unwrap(), Some(b"gia-tri-thu".to_vec()));
        // Windows: mục chỉ nằm trên máy này (`CRED_PERSIST_LOCAL_MACHINE`), không đi theo hồ sơ roaming.
        #[cfg(windows)]
        assert_eq!(
            ks.entry(&name).unwrap().get_attributes().unwrap()["persistence"],
            "Local"
        );
        if std::env::var_os("KEYSTORE_KEEP").is_some() {
            println!("giữ lại mục {name} của service {SERVICE}");
            return;
        }
        assert!(ks.delete(&name).unwrap());
        assert_eq!(ks.get(&name).unwrap(), None);
    }
}
