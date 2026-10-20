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
//! - **macOS dùng `/usr/bin/security` làm người đọc và ghi Keychain** (`keychain_cli`, spec
//!   2026-10-20-macos-keychain-security-cli-design.md). Bản ký ad-hoc đổi `cdhash` sau mỗi bản cập nhật nên macOS hỏi lại quyền
//!   của mọi mục do chính app tạo; mục do `security` (Apple ký, không đổi theo bản của app) tạo thì không bị hỏi. Mục của các
//!   bản trước (API Keychain, gộp một mục `vault` từ 0.1.1, hoặc từng mục riêng của 0.1.0) được chép sang **một lần**, rồi kho
//!   cũ không bao giờ được mở lại (mở lại sau một lần cập nhật sẽ hỏi lại): xem [`Keystore::with_legacy`].
//! - Test dùng `Keystore::mock`, không đụng kho khóa thật. Đọc ghi Keychain thật bằng binary vừa
//!   build lại có thể bật hộp thoại hỏi quyền (mục 6.8 của kế hoạch 00), nên test thật để `#[ignore]`.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use keyring_core::{CredentialStore, Error};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
use super::keychain_cli::SecurityCliStore;

/// Credential Manager giới hạn 2560 byte mỗi mục; giữ một giới hạn chung cho cả hai hệ điều hành.
pub const MAX_SECRET_BYTES: usize = 2048;
const MAX_NAME_LEN: usize = 64;

/// Tên mục Keychain cũ (bản 0.1.1 trở đi) chứa mọi giá trị. Chỉ còn được đọc để di trú.
const VAULT_ENTRY: &str = "vault";

/// Tên mục dấu "đã di trú xong" trong kho mới. Ký tự `@` không có trong tên hợp lệ (`Keystore::entry`) nên không thể trùng
/// với giá trị nào của app.
const MIGRATED_MARKER: &str = "@migrated";

/// Nhiều `Keystore` (db.rs và license/app.rs mỗi nơi một `Keystore::os`) có thể gặp lần dùng đầu tiên cùng lúc: chỉ một
/// bên di trú, bên kia thấy dấu và đi tiếp. Khóa chung cho cả tiến trình.
static MIGRATION_LOCK: Mutex<()> = Mutex::new(());

/// Nội dung mục cũ `vault` (JSON). `items`: tên → giá trị (base64). `legacy_done`: tên đã xử lý xong với mục riêng của 0.1.0
/// (đã chép sang, đã ghi đè, hay đã xóa): mục riêng còn sót của tên đó là bản cũ, không được chép (kẻo "sống lại").
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
    /// Kho cũ cần chép sang `store` một lần (macOS). `None`: không có gì để di trú.
    legacy: Option<Arc<CredentialStore>>,
    /// Đã biết việc di trú xong (thấy dấu trong `store`, hoặc vừa làm xong). Chỉ để khỏi gọi `store` kiểm dấu ở mọi thao tác.
    migrated: AtomicBool,
}

impl Keystore {
    /// Kho khóa thật của hệ điều hành.
    pub fn os(service: &str) -> Result<Self, KeystoreError> {
        #[cfg(target_os = "macos")]
        {
            Ok(Self::with_store(service, SecurityCliStore::new()).with_legacy(legacy_store()?))
        }
        #[cfg(not(target_os = "macos"))]
        {
            Ok(Self {
                modifiers: PLATFORM_MODIFIERS,
                ..Self::with_store(service, platform_store()?)
            })
        }
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
            legacy: None,
            migrated: AtomicBool::new(false),
        }
    }

    /// Đặt kho cũ để di trú: ở thao tác đầu tiên mà `store` chưa có dấu `@migrated`, mọi giá trị của kho cũ được chép sang
    /// `store` (không đè giá trị đã có, mỗi lần ghi có đọc lại kiểm), rồi mới ghi dấu. Có dấu rồi thì kho cũ không bao giờ
    /// được mở nữa. Lỗi ở bất kỳ bước nào là lỗi của thao tác đang chạy và không ghi dấu; không có chỗ nào coi lỗi là "rỗng".
    pub fn with_legacy(mut self, legacy: Arc<CredentialStore>) -> Self {
        self.legacy = Some(legacy);
        self
    }

    /// Đọc một mục; `None` nếu chưa có.
    pub fn get(&self, name: &str) -> Result<Option<Vec<u8>>, KeystoreError> {
        let entry = self.entry(name)?;
        self.ensure_migrated()?;
        match entry.get_secret() {
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
        let entry = self.entry(name)?;
        self.ensure_migrated()?;
        entry.set_secret(secret).map_err(map_error)
    }

    /// Xóa một mục; trả `false` nếu mục chưa có.
    pub fn delete(&self, name: &str) -> Result<bool, KeystoreError> {
        let entry = self.entry(name)?;
        self.ensure_migrated()?;
        match entry.delete_credential() {
            Ok(()) => Ok(true),
            Err(Error::NoEntry) => Ok(false),
            Err(e) => Err(map_error(e)),
        }
    }

    /// Bảo đảm dữ liệu của kho cũ (nếu có) đã nằm trong kho chính trước khi thao tác. Chạy trong khóa chung của tiến trình;
    /// sau lần đầu thành công chỉ còn một phép so cờ trong bộ nhớ.
    fn ensure_migrated(&self) -> Result<(), KeystoreError> {
        let Some(legacy) = &self.legacy else {
            return Ok(());
        };
        if self.migrated.load(Ordering::Acquire) {
            return Ok(());
        }
        let _guard = MIGRATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        if self.migrated.load(Ordering::Acquire) {
            return Ok(());
        }
        let marker = self
            .store
            .build(&self.service, MIGRATED_MARKER, None)
            .map_err(map_error)?;
        match marker.get_secret() {
            Ok(_) => {}
            Err(Error::NoEntry) => self.migrate(legacy.as_ref(), &marker)?,
            Err(e) => return Err(map_error(e)),
        }
        self.migrated.store(true, Ordering::Release);
        Ok(())
    }

    /// Chép mọi giá trị của kho cũ sang kho chính rồi ghi dấu. Dấu ghi SAU CÙNG: lỗi giữa chừng thì không có dấu và lần sau
    /// làm lại (bỏ qua tên đã chép, nên không bao giờ đè giá trị mới hơn).
    fn migrate(&self, legacy: &CredentialStore, marker: &keyring_core::Entry) -> Result<(), KeystoreError> {
        let snapshot = read_legacy(legacy, &self.service)?;
        let mut copied = 0usize;
        for (name, value) in &snapshot {
            // Mục lạ trong kho cũ (tên hay độ lớn app không bao giờ tạo ra) thì bỏ qua.
            let Ok(entry) = self.entry(name) else { continue };
            if value.len() > MAX_SECRET_BYTES {
                continue;
            }
            match entry.get_secret() {
                Ok(_) => continue,
                Err(Error::NoEntry) => {}
                Err(e) => return Err(map_error(e)),
            }
            entry.set_secret(value).map_err(map_error)?;
            copied += 1;
        }
        marker.set_secret(b"1").map_err(map_error)?;
        log::info!("kho khóa: đã chép {copied} mục từ Keychain cũ sang kho mới");
        Ok(())
    }

    fn entry(&self, name: &str) -> Result<keyring_core::Entry, KeystoreError> {
        if !valid_name(name) {
            return Err(KeystoreError::InvalidName(name.to_string()));
        }
        let modifiers: HashMap<&str, &str> = self.modifiers.iter().copied().collect();
        self.store
            .build(&self.service, name, (!modifiers.is_empty()).then_some(&modifiers))
            .map_err(map_error)
    }
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_NAME_LEN
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b))
}

/// Đọc toàn bộ giá trị của kho cũ, chỉ đọc (không ghi, không xóa). Mọi lỗi là lỗi: không bao giờ trả "rỗng" khi chưa chắc, vì
/// "rỗng" làm app tạo khóa DB mới (mất lịch sử) hoặc coi như hết hạn mức.
///
/// Liệt kê tên bằng `search` (chỉ thuộc tính, macOS không hỏi), rồi đọc bí mật: `vault` (một hộp thoại) và các mục riêng của
/// 0.1.0 chưa được chép (mỗi mục một hộp thoại, như lần di trú 0.1.0 → 0.1.1). Mục riêng nằm trong `items` hay `legacy_done`
/// của `vault` là bản cũ đã chép hoặc đã xóa: bỏ qua, không mở (mở sẽ hỏi vô ích).
fn read_legacy(legacy: &CredentialStore, service: &str) -> Result<BTreeMap<String, Vec<u8>>, KeystoreError> {
    let corrupt = || KeystoreError::Platform("mục chung cũ của kho khóa bị hỏng".into());
    let mut has_vault = false;
    let mut separate = BTreeSet::new();
    for entry in legacy
        .search(&HashMap::from([("service", service)]))
        .map_err(map_error)?
    {
        // Mục không cho biết service và tên thì không biết có phải của app không: lỗi, không bỏ qua (bỏ qua có thể bỏ sót dữ liệu).
        let Some((entry_service, account)) = entry.get_specifiers() else {
            return Err(vanished("mục cũ của kho khóa không cho biết tên"));
        };
        // Kho giả của test so khớp theo chuỗi con: lọc lại cho đúng service.
        if entry_service != service {
            continue;
        }
        if account == VAULT_ENTRY {
            has_vault = true;
        } else if valid_name(&account) {
            separate.insert(account);
        }
        // Tên không hợp lệ thì bỏ qua: app không bao giờ tạo ra (`Keystore::entry` chặn từ 0.1.0), nên không phải dữ liệu của app.
    }

    let mut found = BTreeMap::new();
    let mut done = BTreeSet::new();
    if has_vault {
        match legacy
            .build(service, VAULT_ENTRY, None)
            .map_err(map_error)?
            .get_secret()
        {
            Ok(bytes) => {
                let doc: VaultDoc = serde_json::from_slice(&bytes).map_err(|_| corrupt())?;
                for (name, encoded) in doc.items {
                    found.insert(name, STANDARD.decode(encoded).map_err(|_| corrupt())?);
                }
                done = doc.legacy_done;
            }
            // Vừa được liệt kê mà đọc lại "không có": coi là rỗng thì dấu được ghi mà không chép gì, dữ liệu cũ bị bỏ lại mãi
            // (khóa DB mới, hết hạn mức). Lỗi: lần sau liệt kê lại và quyết định trên dữ liệu thật.
            Err(Error::NoEntry) => {
                return Err(vanished(
                    "mục chung cũ của kho khóa biến mất giữa lúc liệt kê và lúc đọc",
                ));
            }
            Err(e) => return Err(map_error(e)),
        }
    }
    for name in separate {
        if found.contains_key(&name) || done.contains(&name) {
            continue;
        }
        match legacy.build(service, &name, None).map_err(map_error)?.get_secret() {
            Ok(secret) => {
                found.insert(name, secret);
            }
            Err(Error::NoEntry) => {
                return Err(vanished(
                    "mục riêng cũ của kho khóa biến mất giữa lúc liệt kê và lúc đọc",
                ));
            }
            Err(e) => return Err(map_error(e)),
        }
    }
    Ok(found)
}

fn vanished(message: &str) -> KeystoreError {
    KeystoreError::Platform(message.to_string())
}

/// Kho API Keychain của các bản trước, chỉ để đọc khi di trú.
#[cfg(target_os = "macos")]
fn legacy_store() -> Result<Arc<CredentialStore>, KeystoreError> {
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
    use std::any::Any;

    use keyring_core::api::CredentialStoreApi;
    use keyring_core::{Entry, Result as KeyringResult};

    use super::*;
    use crate::security::keychain_cli::SecurityCliStore as CliStore;
    use crate::security::keychain_cli::fake::{FakeSecurity, Fault};

    const SERVICE: &str = "com.aitranslator.desktop.test";
    /// Service thật của mục do `security` tạo (hậu tố cố định của `keychain_cli`).
    const PRIMARY: &str = "com.aitranslator.desktop.test.security";

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

    // ---- Di trú từ kho cũ (macOS, spec 2026-10-20-macos-keychain-security-cli-design.md §4.3) ----

    /// Kho cũ giả có ghi lại mọi lần mở: chứng minh khi nào app có (và không) đụng tới kho cũ, vì mở mục cũ sau một lần cập
    /// nhật là chỗ macOS hỏi lại mật khẩu.
    struct Spy {
        inner: Arc<keyring_core::mock::Store>,
        log: Mutex<Vec<String>>,
        /// Lần liệt kê kế tiếp trả lỗi này (một lần).
        search_error: Mutex<Option<Error>>,
    }

    impl Spy {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                inner: keyring_core::mock::Store::new().unwrap(),
                log: Mutex::new(Vec::new()),
                search_error: Mutex::new(None),
            })
        }

        fn fail_next_search(&self, error: Error) {
            *self.search_error.lock().unwrap() = Some(error);
        }

        fn log(&self) -> Vec<String> {
            self.log.lock().unwrap().clone()
        }

        /// Số lần mở mục cũ có tên `account`.
        fn opened(&self, account: &str) -> usize {
            let suffix = format!("/{account}");
            self.log().iter().filter(|l| l.ends_with(&suffix)).count()
        }

        fn searches(&self) -> usize {
            self.log().iter().filter(|l| l.as_str() == "search").count()
        }

        /// Mục cũ `vault` (JSON), như bản 0.1.1 trở đi để lại.
        fn seed_vault(&self, items: &[(&str, &[u8])], done: &[&str]) {
            let doc = VaultDoc {
                items: items.iter().map(|(n, v)| (n.to_string(), STANDARD.encode(v))).collect(),
                legacy_done: done.iter().map(|s| s.to_string()).collect(),
            };
            self.seed_raw(VAULT_ENTRY, &serde_json::to_vec(&doc).unwrap());
        }

        fn seed_raw(&self, account: &str, value: &[u8]) {
            self.inner
                .build(SERVICE, account, None)
                .unwrap()
                .set_secret(value)
                .unwrap();
        }

        /// Lần đọc kế tiếp của mục cũ này sẽ lỗi (như người dùng bấm Deny).
        fn fail_next_read_of(&self, account: &str, error: Error) {
            let entry = self.inner.build(SERVICE, account, None).unwrap();
            let mock: &keyring_core::mock::Cred = entry.as_any().downcast_ref().unwrap();
            mock.set_error(error);
        }
    }

    impl CredentialStoreApi for Spy {
        fn vendor(&self) -> String {
            "spy".to_string()
        }

        fn id(&self) -> String {
            "spy".to_string()
        }

        fn build(&self, service: &str, user: &str, modifiers: Option<&HashMap<&str, &str>>) -> KeyringResult<Entry> {
            self.log.lock().unwrap().push(format!("build {service}/{user}"));
            self.inner.build(service, user, modifiers)
        }

        fn search(&self, spec: &HashMap<&str, &str>) -> KeyringResult<Vec<Entry>> {
            self.log.lock().unwrap().push("search".to_string());
            if let Some(error) = self.search_error.lock().unwrap().take() {
                return Err(error);
            }
            self.inner.search(spec)
        }

        fn as_any(&self) -> &dyn Any {
            self
        }
    }

    fn fresh() -> (Arc<FakeSecurity>, Arc<Spy>) {
        (Arc::new(FakeSecurity::new()), Spy::new())
    }

    /// `Keystore` như bản macOS: kho chính chạy qua `security` giả, kho cũ là `Spy`.
    fn cli(fake: &Arc<FakeSecurity>, legacy: &Arc<Spy>) -> Keystore {
        Keystore::with_store(SERVICE, CliStore::with_runner(fake.clone())).with_legacy(legacy.clone())
    }

    /// `Keystore` chỉ nhìn vào kho mới, không có kho cũ: để kiểm dữ liệu thật sự đã nằm trong kho mới.
    fn new_store_only(fake: &Arc<FakeSecurity>) -> Keystore {
        Keystore::with_store(SERVICE, CliStore::with_runner(fake.clone()))
    }

    fn only_the_marker(fake: &FakeSecurity) -> bool {
        fake.keys() == vec![(PRIMARY.to_string(), MIGRATED_MARKER.to_string())]
    }

    #[test]
    fn a_fresh_install_writes_only_the_marker_and_opens_no_old_item() {
        let (fake, legacy) = fresh();
        let ks = cli(&fake, &legacy);
        assert_eq!(ks.get("license").unwrap(), None);
        assert!(only_the_marker(&fake), "{:?}", fake.keys());
        assert_eq!(
            legacy.log(),
            vec!["search".to_string()],
            "chỉ liệt kê tên, không mở mục nào (không hỏi)"
        );
    }

    #[test]
    fn the_old_vault_is_copied_on_first_use() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(
            &[("db-key", b"khoa"), ("license", b"token"), ("quota-free", b"dem")],
            &[],
        );
        let ks = cli(&fake, &legacy);
        assert_eq!(ks.get("license").unwrap(), Some(b"token".to_vec()));
        let new_only = new_store_only(&fake);
        assert_eq!(new_only.get("db-key").unwrap(), Some(b"khoa".to_vec()));
        assert_eq!(new_only.get("license").unwrap(), Some(b"token".to_vec()));
        assert_eq!(new_only.get("quota-free").unwrap(), Some(b"dem".to_vec()));
        assert_eq!(legacy.opened("vault"), 1, "mục cũ chỉ mở một lần");
    }

    #[test]
    fn old_copies_listed_as_done_are_not_brought_back() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("db-key", b"khoa")], &["license"]);
        legacy.seed_raw("license", b"ban-cu-da-xoa");
        let ks = cli(&fake, &legacy);
        assert_eq!(
            ks.get("license").unwrap(),
            None,
            "mục riêng cũ trong legacy_done không được sống lại"
        );
        assert_eq!(ks.get("db-key").unwrap(), Some(b"khoa".to_vec()));
        assert_eq!(legacy.opened("license"), 0, "không mở mục cũ đã xử lý (sẽ hỏi vô ích)");
    }

    #[test]
    fn a_vault_value_wins_over_an_old_separate_item() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("license", b"moi")], &[]);
        legacy.seed_raw("license", b"cu");
        assert_eq!(cli(&fake, &legacy).get("license").unwrap(), Some(b"moi".to_vec()));
    }

    #[test]
    fn separate_items_from_version_0_1_0_are_adopted() {
        // Đi thẳng từ 0.1.0 (từng mục riêng, chưa có `vault`) lên bản này.
        let (fake, legacy) = fresh();
        legacy.seed_raw("db-key", b"khoa");
        legacy.seed_raw("license", b"token");
        legacy.seed_raw("quota-paid-abc", b"dem-tra-phi");
        let ks = cli(&fake, &legacy);
        assert_eq!(ks.get("db-key").unwrap(), Some(b"khoa".to_vec()));
        let new_only = new_store_only(&fake);
        assert_eq!(new_only.get("license").unwrap(), Some(b"token".to_vec()));
        assert_eq!(
            new_only.get("quota-paid-abc").unwrap(),
            Some(b"dem-tra-phi".to_vec()),
            "kể cả tên có hậu tố động, không nằm trong danh sách cố định"
        );
    }

    #[test]
    fn items_of_another_service_in_the_old_store_are_not_adopted() {
        let (fake, legacy) = fresh();
        legacy
            .inner
            .build("other.app", "license", None)
            .unwrap()
            .set_secret(b"cua-app-khac")
            .unwrap();
        legacy
            .inner
            .build(PRIMARY, "license", None)
            .unwrap()
            .set_secret(b"cua-kho-moi")
            .unwrap();
        assert_eq!(cli(&fake, &legacy).get("license").unwrap(), None);
        assert!(only_the_marker(&fake));
    }

    #[test]
    fn a_value_already_in_the_new_store_is_never_overwritten() {
        let (fake, legacy) = fresh();
        new_store_only(&fake).set("license", b"MOI").unwrap();
        legacy.seed_vault(&[("license", b"CU"), ("db-key", b"khoa")], &[]);
        let ks = cli(&fake, &legacy);
        assert_eq!(ks.get("license").unwrap(), Some(b"MOI".to_vec()));
        assert_eq!(
            ks.get("db-key").unwrap(),
            Some(b"khoa".to_vec()),
            "tên chưa có thì vẫn được chép"
        );
    }

    #[test]
    fn the_old_store_is_never_opened_again_after_the_marker() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("license", b"token")], &[]);
        let ks = cli(&fake, &legacy);
        assert_eq!(ks.get("license").unwrap(), Some(b"token".to_vec()));
        let log_after_migration = legacy.log();
        ks.set("quota-free", b"1").unwrap();
        assert_eq!(ks.get("quota-free").unwrap(), Some(b"1".to_vec()));
        assert_eq!(ks.get("khong-co").unwrap(), None);
        assert!(ks.delete("license").unwrap());
        // Lần chạy sau (hay bản cập nhật sau): một Keystore mới chỉ kiểm dấu rồi đi tiếp.
        let next_launch = cli(&fake, &legacy);
        assert_eq!(next_launch.get("quota-free").unwrap(), Some(b"1".to_vec()));
        assert_eq!(
            legacy.log(),
            log_after_migration,
            "mở kho cũ sau một lần cập nhật sẽ bị hỏi lại"
        );
    }

    #[test]
    fn a_deleted_value_does_not_come_back_from_the_old_store() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("license", b"token")], &[]);
        let ks = cli(&fake, &legacy);
        assert!(ks.delete("license").unwrap(), "xóa lần đầu chép rồi xóa: có mục");
        assert_eq!(ks.get("license").unwrap(), None);
        assert_eq!(
            cli(&fake, &legacy).get("license").unwrap(),
            None,
            "kể cả sau lần chạy mới"
        );
    }

    #[test]
    fn a_refused_old_read_is_an_error_leaves_no_marker_and_can_be_retried() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("license", b"token")], &[]);
        legacy.fail_next_read_of(VAULT_ENTRY, Error::NoStorageAccess("người dùng từ chối".into()));
        let ks = cli(&fake, &legacy);
        assert!(matches!(ks.get("license"), Err(KeystoreError::Access(_))));
        assert!(fake.keys().is_empty(), "không ghi gì, kể cả dấu: {:?}", fake.keys());
        // Lần sau (người dùng bấm Always Allow, lỗi giả đã hết): cùng Keystore thử lại, không nhớ nhầm là đã xong.
        assert_eq!(ks.get("license").unwrap(), Some(b"token".to_vec()));
        assert!(fake.keys().iter().any(|(_, a)| a == MIGRATED_MARKER));
    }

    #[test]
    fn a_failed_copy_leaves_no_marker_and_the_retry_finishes_without_rewriting() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("db-key", b"khoa"), ("license", b"token")], &[]);
        // Hai lần: lỗi còn nguyên sau cả một lần thử lại của kho chính.
        fake.fail_times("-a \"license\"", 2, Fault::Exit(1));
        let ks = cli(&fake, &legacy);
        assert!(matches!(ks.get("license"), Err(KeystoreError::Platform(_))));
        assert!(
            !fake.keys().iter().any(|(_, a)| a == MIGRATED_MARKER),
            "chép lỗi thì không được ghi dấu"
        );
        assert_eq!(ks.get("license").unwrap(), Some(b"token".to_vec()), "thử lại thì xong");
        assert!(fake.keys().iter().any(|(_, a)| a == MIGRATED_MARKER));
        let writes_of_db_key = fake
            .calls()
            .iter()
            .filter(|c| c.args == ["-i"] && c.stdin.as_deref().is_some_and(|s| s.contains("-a \"db-key\"")))
            .count();
        assert_eq!(writes_of_db_key, 1, "mục đã chép ở lần đầu không bị ghi lại");
    }

    #[test]
    fn a_marker_that_cannot_be_read_blocks_the_operation_and_never_touches_the_old_store() {
        // Không đọc được dấu không có nghĩa là "chưa di trú": phải là lỗi, không được mở kho cũ (sẽ hỏi) hay ghi gì.
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("license", b"token")], &[]);
        fake.fail_times("find-generic-password", 2, Fault::Exit(1));
        let ks = cli(&fake, &legacy);
        assert!(matches!(ks.get("license"), Err(KeystoreError::Platform(_))));
        assert!(legacy.log().is_empty(), "đã mở kho cũ: {:?}", legacy.log());
        assert!(fake.keys().is_empty());
        assert_eq!(
            ks.get("license").unwrap(),
            Some(b"token".to_vec()),
            "hết lỗi thì di trú bình thường"
        );
    }

    #[test]
    fn a_marker_that_cannot_be_written_leaves_the_data_copied_and_a_retry_completes() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("db-key", b"khoa"), ("license", b"token")], &[]);
        fake.fail_times("-a \"@migrated\"", 2, Fault::Exit(1));
        let ks = cli(&fake, &legacy);
        assert!(matches!(ks.get("license"), Err(KeystoreError::Platform(_))));
        assert!(
            !fake.keys().iter().any(|(_, a)| a == MIGRATED_MARKER),
            "ghi dấu lỗi thì không có dấu"
        );
        assert_eq!(ks.get("license").unwrap(), Some(b"token".to_vec()));
        assert!(fake.keys().iter().any(|(_, a)| a == MIGRATED_MARKER));
        let writes_of = |name: &str| {
            fake.calls()
                .iter()
                .filter(|c| {
                    c.args == ["-i"]
                        && c.stdin
                            .as_deref()
                            .is_some_and(|s| s.contains(&format!("-a \"{name}\"")) && s.contains("add-generic"))
                })
                .count()
        };
        assert_eq!(writes_of("db-key"), 1, "mục đã chép không bị ghi lại ở lần thử lại");
        assert_eq!(writes_of("license"), 1);
    }

    #[test]
    fn an_old_store_that_cannot_be_listed_is_an_error_and_leaves_no_marker() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("license", b"token")], &[]);
        legacy.fail_next_search(Error::NoStorageAccess("không liệt kê được".into()));
        let ks = cli(&fake, &legacy);
        assert!(matches!(ks.get("license"), Err(KeystoreError::Access(_))));
        assert!(fake.keys().is_empty());
        assert_eq!(ks.get("license").unwrap(), Some(b"token".to_vec()));
    }

    #[test]
    fn a_listed_vault_that_vanishes_before_it_is_read_is_an_error_not_an_empty_store() {
        // Coi là rỗng thì dấu được ghi mà không chép gì: dữ liệu cũ bị bỏ lại mãi mãi (khóa DB mới, hết hạn mức).
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("license", b"token")], &[]);
        legacy.fail_next_read_of(VAULT_ENTRY, Error::NoEntry);
        let ks = cli(&fake, &legacy);
        assert!(matches!(ks.get("license"), Err(KeystoreError::Platform(_))));
        assert!(fake.keys().is_empty(), "không được ghi dấu: {:?}", fake.keys());
        assert_eq!(ks.get("license").unwrap(), Some(b"token".to_vec()));
    }

    #[test]
    fn a_listed_separate_item_that_vanishes_before_it_is_read_is_an_error() {
        let (fake, legacy) = fresh();
        legacy.seed_raw("license", b"token");
        legacy.fail_next_read_of("license", Error::NoEntry);
        let ks = cli(&fake, &legacy);
        assert!(matches!(ks.get("license"), Err(KeystoreError::Platform(_))));
        assert!(fake.keys().is_empty(), "không được ghi dấu: {:?}", fake.keys());
        assert_eq!(ks.get("license").unwrap(), Some(b"token".to_vec()));
    }

    #[test]
    fn a_write_as_the_first_operation_still_migrates_first_and_the_new_value_wins() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("license", b"CU"), ("db-key", b"khoa")], &[]);
        let ks = cli(&fake, &legacy);
        ks.set("license", b"MOI").unwrap();
        assert_eq!(ks.get("license").unwrap(), Some(b"MOI".to_vec()));
        assert_eq!(
            ks.get("db-key").unwrap(),
            Some(b"khoa".to_vec()),
            "tên khác vẫn được chép"
        );
        assert_eq!(legacy.opened("vault"), 1);
        assert!(ks.delete("license").unwrap());
        assert_eq!(ks.get("license").unwrap(), None, "không sống lại từ kho cũ");
        assert_eq!(legacy.opened("vault"), 1, "không mở lại kho cũ");
    }

    #[test]
    fn a_corrupt_old_vault_is_an_error_and_leaves_no_marker() {
        let (fake, legacy) = fresh();
        legacy.seed_raw(VAULT_ENTRY, b"khong phai json");
        let ks = cli(&fake, &legacy);
        assert!(matches!(ks.get("license"), Err(KeystoreError::Platform(_))));
        assert!(matches!(ks.set("license", b"x"), Err(KeystoreError::Platform(_))));
        assert!(fake.keys().is_empty());
    }

    #[test]
    fn names_that_are_not_valid_for_the_app_are_not_copied() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("Ten Xau", b"x"), ("db-key", b"khoa")], &[]);
        let ks = cli(&fake, &legacy);
        assert_eq!(ks.get("db-key").unwrap(), Some(b"khoa".to_vec()));
        assert_eq!(fake.keys().len(), 2, "chỉ db-key và dấu: {:?}", fake.keys());
    }

    #[test]
    fn an_invalid_name_never_touches_the_old_store() {
        let (fake, legacy) = fresh();
        let ks = cli(&fake, &legacy);
        assert!(matches!(ks.get("Ten Xau"), Err(KeystoreError::InvalidName(_))));
        assert!(matches!(ks.set("Ten Xau", b"x"), Err(KeystoreError::InvalidName(_))));
        assert!(matches!(ks.delete("Ten Xau"), Err(KeystoreError::InvalidName(_))));
        assert!(legacy.log().is_empty());
        assert_eq!(fake.call_count(), 0);
    }

    #[test]
    fn many_keystores_starting_together_migrate_once() {
        let (fake, legacy) = fresh();
        legacy.seed_vault(&[("db-key", b"khoa"), ("license", b"token")], &[]);
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let (fake, legacy) = (fake.clone(), legacy.clone());
                std::thread::spawn(move || {
                    // Mỗi luồng một Keystore riêng, như `db.rs` và `license/app.rs` mỗi nơi một `Keystore::os`.
                    let ks = cli(&fake, &legacy);
                    (ks.get("db-key").unwrap(), ks.get("license").unwrap())
                })
            })
            .collect();
        for h in handles {
            assert_eq!(h.join().unwrap(), (Some(b"khoa".to_vec()), Some(b"token".to_vec())));
        }
        assert_eq!(legacy.opened("vault"), 1, "chỉ một bên mở kho cũ (một hộp thoại)");
        assert_eq!(legacy.searches(), 1);
    }

    #[test]
    fn after_migration_each_operation_is_exactly_one_security_call() {
        // Bộ đếm hạn mức ghi sau mỗi phụ đề dịch xong, trên luồng engine: mỗi lần chạy `security` tốn khoảng 20 ms.
        let (fake, legacy) = fresh();
        let ks = cli(&fake, &legacy);
        ks.get("license").unwrap(); // di trú
        let base = fake.call_count();
        ks.get("license").unwrap();
        assert_eq!(fake.call_count() - base, 1, "đọc: một lần gọi");
        ks.set("license", b"x").unwrap();
        assert_eq!(fake.call_count() - base, 2, "ghi: một lần gọi (ghi kèm đọc lại)");
        ks.delete("license").unwrap();
        assert_eq!(fake.call_count() - base, 3, "xóa: một lần gọi");
    }

    #[test]
    fn a_plain_keystore_never_migrates() {
        let store = keyring_core::mock::Store::new().unwrap();
        let ks = Keystore::with_store(SERVICE, store.clone());
        ks.set("license", b"x").unwrap();
        assert!(
            matches!(
                store.build(SERVICE, MIGRATED_MARKER, None).unwrap().get_secret(),
                Err(Error::NoEntry)
            ),
            "không có kho cũ thì không có dấu"
        );
    }

    #[test]
    fn the_os_keystore_migrates_from_the_old_api_store_only_on_macos() {
        let ks = Keystore::os(SERVICE).unwrap();
        assert_eq!(ks.legacy.is_some(), cfg!(target_os = "macos"));
    }

    // ---- Chạy tay trên Keychain thật (macOS) ----

    /// Chạy tay (người), chỉ macOS: `cargo test -p meeting-translator --lib os_keystore_security_cli -- --ignored`.
    /// Ghi vài giá trị qua kho khóa thật rồi kiểm bằng chính `security` rằng chúng nằm ở service `<service>.security`, không
    /// có mục nào ở service gốc; xóa sạch khi xong.
    #[test]
    #[ignore = "đụng Keychain thật; chỉ macOS"]
    fn os_keystore_security_cli_roundtrip() {
        if !cfg!(target_os = "macos") {
            return;
        }
        let service = format!("{SERVICE}.cli-{}", std::process::id());
        let ks = Keystore::os(&service).unwrap();
        let names = ["db-key", "license", "license-seen", "quota-free"];
        for name in names {
            ks.set(name, name.as_bytes()).unwrap();
        }
        let security = |args: &[&str]| {
            std::process::Command::new("/usr/bin/security")
                .args(args)
                .output()
                .unwrap()
        };
        let primary = format!("{service}.security");
        for name in names {
            let out = security(&["find-generic-password", "-s", &primary, "-a", name, "-w"]);
            assert!(out.status.success(), "{name} phải nằm ở service {primary}");
            assert!(
                String::from_utf8_lossy(&out.stdout).starts_with("v1:"),
                "{name} phải có tiền tố v1:"
            );
            assert!(
                !security(&["find-generic-password", "-s", &service, "-a", name])
                    .status
                    .success(),
                "{name} không được có mục ở service gốc (mục cũ do API tạo)"
            );
            assert_eq!(ks.get(name).unwrap(), Some(name.as_bytes().to_vec()));
        }
        for name in names {
            assert!(ks.delete(name).unwrap());
            assert_eq!(ks.get(name).unwrap(), None);
        }
        // Giá trị lớn nhất app lưu (2048 byte, đủ mọi giá trị byte): dòng `security -i` dài nhất mà ta gửi (khoảng 2,9 KB).
        let big: Vec<u8> = (0..MAX_SECRET_BYTES).map(|i| (i % 256) as u8).collect();
        ks.set("big", &big).unwrap();
        assert_eq!(ks.get("big").unwrap(), Some(big));
        assert!(ks.delete("big").unwrap());
        // Dọn dấu (không có API công khai để xóa nó qua `Keystore`).
        assert!(
            security(&["delete-generic-password", "-s", &primary, "-a", MIGRATED_MARKER])
                .status
                .success()
        );
        assert!(
            !security(&["find-generic-password", "-s", &primary]).status.success(),
            "còn sót mục"
        );
    }

    /// Chạy tay (người), chỉ macOS: `cargo test -p meeting-translator --lib os_keystore_parallel -- --ignored`.
    /// Nhiều `Keystore` (như `db.rs` và `license/app.rs`, mỗi nơi một cái) ghi song song qua `security` thật: 8 luồng ghi mục riêng
    /// và 4 luồng tranh cùng MỘT mục. Không lần ghi nào được báo lỗi: khóa ghi chung giữ cho lần đọc lại không thấy giá trị của
    /// luồng khác (không có khóa thì phép đo thật cho 55 lệch trên 100 lần).
    #[test]
    #[ignore = "đụng Keychain thật; chỉ macOS"]
    fn os_keystore_parallel_writes() {
        if !cfg!(target_os = "macos") {
            return;
        }
        let service = format!("{SERVICE}.par-{}", std::process::id());
        let handles: Vec<_> = (0..12)
            .map(|t| {
                let service = service.clone();
                std::thread::spawn(move || {
                    let ks = Keystore::os(&service).unwrap();
                    let name = if t < 8 {
                        format!("own-{t}")
                    } else {
                        "shared".to_string()
                    };
                    (0..15)
                        .filter(|i| ks.set(&name, format!("{t}:{i}").as_bytes()).is_err())
                        .count()
                })
            })
            .collect();
        let errors: usize = handles.into_iter().map(|h| h.join().unwrap()).sum();
        let ks = Keystore::os(&service).unwrap();
        for t in 0..8 {
            assert_eq!(
                ks.get(&format!("own-{t}")).unwrap(),
                Some(format!("{t}:14").into_bytes()),
                "mục riêng của luồng {t} phải giữ giá trị ghi cuối"
            );
            ks.delete(&format!("own-{t}")).unwrap();
        }
        ks.delete("shared").unwrap();
        let primary = format!("{service}.security");
        let cleaned = std::process::Command::new("/usr/bin/security")
            .args(["delete-generic-password", "-s", &primary, "-a", MIGRATED_MARKER])
            .status()
            .unwrap();
        assert!(cleaned.success(), "không xóa được dấu");
        assert_eq!(errors, 0, "có lần ghi báo lỗi khi chạy song song");
    }

    /// Dùng cho `bench/2026-10-20-keychain-security-cli/run.sh`, không chạy một mình: chạy các bước trên Keychain thật bằng các
    /// bản binary có `cdhash` khác nhau (giả lập các bản cập nhật). Nếu macOS hỏi thì lệnh treo và script đo cắt sau vài giây.
    ///
    /// - `write`, `read`, `clean`: ghi, đọc và dọn một giá trị thử qua kho mới.
    /// - `seed-legacy`: tạo mục cũ bằng API Keychain như bản 0.1.x (một `vault` và một mục riêng).
    /// - `read-migrated`: đọc qua `Keystore::os`; lần đầu di trú từ mục cũ (cùng binary với `seed-legacy` nên không hỏi), các
    ///   lần sau ở binary khác không được mở kho cũ.
    /// - `clean-legacy`: xóa mục cũ do `seed-legacy` tạo.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "đụng Keychain thật; chỉ macOS; do script đo gọi"]
    fn os_keystore_probe() {
        let (Ok(service), Ok(mode)) = (std::env::var("PROBE_SERVICE"), std::env::var("PROBE_MODE")) else {
            return;
        };
        let ks = Keystore::os(&service).unwrap();
        match mode.as_str() {
            "write" => ks.set("probe", b"gia-tri-do").unwrap(),
            "read" => assert_eq!(ks.get("probe").unwrap(), Some(b"gia-tri-do".to_vec())),
            "seed-legacy" => {
                let legacy = legacy_store().unwrap();
                let doc = VaultDoc {
                    items: BTreeMap::from([("probe".to_string(), STANDARD.encode(b"gia-tri-cu"))]),
                    legacy_done: BTreeSet::new(),
                };
                legacy
                    .build(&service, VAULT_ENTRY, None)
                    .unwrap()
                    .set_secret(&serde_json::to_vec(&doc).unwrap())
                    .unwrap();
                legacy
                    .build(&service, "probe-sep", None)
                    .unwrap()
                    .set_secret(b"rieng-cu")
                    .unwrap();
            }
            "read-migrated" => {
                assert_eq!(ks.get("probe").unwrap(), Some(b"gia-tri-cu".to_vec()));
                assert_eq!(ks.get("probe-sep").unwrap(), Some(b"rieng-cu".to_vec()));
            }
            "clean-legacy" => {
                let legacy = legacy_store().unwrap();
                for account in [VAULT_ENTRY, "probe-sep"] {
                    legacy
                        .build(&service, account, None)
                        .unwrap()
                        .delete_credential()
                        .unwrap();
                }
            }
            "clean" => {
                for name in ["probe", "probe-sep"] {
                    ks.delete(name).unwrap();
                }
                let primary = format!("{service}.security");
                let status = std::process::Command::new("/usr/bin/security")
                    .args(["delete-generic-password", "-s", &primary, "-a", MIGRATED_MARKER])
                    .status()
                    .unwrap();
                assert!(status.success(), "không xóa được dấu");
            }
            other => panic!("PROBE_MODE không hợp lệ: {other}"),
        }
    }
}
