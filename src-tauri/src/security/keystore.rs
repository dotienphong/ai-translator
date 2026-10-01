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
//! - Test dùng `Keystore::mock`, không đụng kho khóa thật. Đọc ghi Keychain thật bằng binary vừa
//!   build lại có thể bật hộp thoại hỏi quyền (mục 6.8 của kế hoạch 00), nên test thật để `#[ignore]`.

use std::collections::HashMap;
use std::sync::Arc;

use keyring_core::{CredentialStore, Error};

/// Credential Manager giới hạn 2560 byte mỗi mục; giữ một giới hạn chung cho cả hai hệ điều hành.
pub const MAX_SECRET_BYTES: usize = 2048;
const MAX_NAME_LEN: usize = 64;

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
}

impl Keystore {
    /// Kho khóa thật của hệ điều hành.
    pub fn os(service: &str) -> Result<Self, KeystoreError> {
        Ok(Self {
            modifiers: PLATFORM_MODIFIERS,
            ..Self::with_store(service, platform_store()?)
        })
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
        }
    }

    /// Đọc một mục; `None` nếu chưa có.
    pub fn get(&self, name: &str) -> Result<Option<Vec<u8>>, KeystoreError> {
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
        self.entry(name)?.set_secret(secret).map_err(map_error)
    }

    /// Xóa một mục; trả `false` nếu mục chưa có.
    pub fn delete(&self, name: &str) -> Result<bool, KeystoreError> {
        match self.entry(name)?.delete_credential() {
            Ok(()) => Ok(true),
            Err(Error::NoEntry) => Ok(false),
            Err(e) => Err(map_error(e)),
        }
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

    /// Chạy tay (người): `cargo test -p meeting-translator --lib os_keystore -- --ignored`.
    /// Ghi, đọc rồi xóa một mục thật trong Keychain hoặc Credential Manager.
    #[test]
    #[ignore = "đụng kho khóa thật của hệ điều hành; có thể bật hộp thoại hỏi quyền"]
    fn os_keystore_roundtrip() {
        let ks = Keystore::os(SERVICE).unwrap();
        let name = format!("test-{}", std::process::id());
        ks.set(&name, b"gia-tri-thu").unwrap();
        assert_eq!(ks.get(&name).unwrap(), Some(b"gia-tri-thu".to_vec()));
        assert!(ks.delete(&name).unwrap());
        assert_eq!(ks.get(&name).unwrap(), None);
    }
}
