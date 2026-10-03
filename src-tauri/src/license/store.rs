//! Trạng thái bản quyền và hạn mức trong kho khóa của hệ điều hành (spec §6.8 "Lưu bộ đếm", §10.2): Keychain trên macOS,
//! Credential Manager trên Windows (`persistence = Local`). Không lưu file thường.
//!
//! Mục của kho khóa (mỗi mục một JSON nhỏ, dưới giới hạn 2048 byte của `Keystore`):
//! - `license`: key đã kích hoạt, `activation_id`, token mới nhất, lần `validate` thành công gần nhất (giờ máy);
//! - `license-order`: đơn đang chờ thanh toán (`order_code`, `order_token`), để mở lại app vẫn hỏi tiếp (§6.8 bước 5);
//! - `license-seen`: giờ máy lớn nhất từng thấy và header `Date` mới nhất của server ([`Seen`]);
//! - `quota-free`: bộ đếm Free của ngày;
//! - `quota-paid-<băm>`: bộ đếm của một khóa (`license_id`, `activation_id`, mốc đầu chu kỳ, `quota_epoch`);
//! - `quota-mark-<băm>`: bản ghi đánh dấu của một activation (`license_id`, `activation_id`).
//!
//! Tên mục có phần băm (32 chữ số hex đầu của SHA-256) vì kho khóa giới hạn tên 64 ký tự; nội dung mục vẫn mang đủ khóa,
//! và bộ đếm chỉ được dùng khi khóa trong nội dung khớp. Thứ tự ghi của luật hạn mức (bộ đếm trước, bản ghi đánh dấu sau)
//! nằm ở [`write_paid`].
//!
//! Đọc lỗi (kho khóa bị từ chối, mục hỏng) khác với "chưa có": [`StoreError`] để nơi gọi áp luật chặt (coi như đã hết
//! hạn mức), không coi là bắt đầu từ 0.

use serde::Serialize;
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};

use super::quota::{FreeCounter, Marker, PaidCounter, PaidKey, PaidState, Seen};
use crate::security::keystore::Keystore;

pub const LICENSE: &str = "license";
pub const ORDER: &str = "license-order";
pub const SEEN: &str = "license-seen";
pub const FREE: &str = "quota-free";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum StoreError {
    #[error("không đọc ghi được kho khóa: {0}")]
    Keystore(String),
    #[error("mục `{0}` của kho khóa hỏng")]
    Corrupt(String),
}

/// Nơi lưu: kho khóa thật, hay bản giả trong test.
pub trait Vault: Send + Sync {
    fn get(&self, name: &str) -> Result<Option<Vec<u8>>, String>;
    fn set(&self, name: &str, value: &[u8]) -> Result<(), String>;
    fn delete(&self, name: &str) -> Result<(), String>;
}

impl Vault for Keystore {
    fn get(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
        Keystore::get(self, name).map_err(|e| e.to_string())
    }

    fn set(&self, name: &str, value: &[u8]) -> Result<(), String> {
        Keystore::set(self, name, value).map_err(|e| e.to_string())
    }

    fn delete(&self, name: &str) -> Result<(), String> {
        Keystore::delete(self, name).map(|_| ()).map_err(|e| e.to_string())
    }
}

/// Key đã kích hoạt trên máy này.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct LicenseRecord {
    /// Dạng lưu trữ (28 ký tự).
    pub key: String,
    pub activation_id: String,
    /// Token mới nhất server cấp.
    pub token: String,
    /// Giờ máy của lần `activate` hay `validate` thành công gần nhất (giây Unix).
    pub validated_at: i64,
    /// Kết luận gần nhất của server về license này (`license_expired`, `license_revoked`), nhớ qua lần mở app sau kể cả khi
    /// offline. Token mới từ server xóa nó.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verdict: Option<Verdict>,
}

/// Kết luận của server khi `validate`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Expired,
    Revoked,
}

/// Đơn đang chờ thanh toán.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct PendingOrder {
    pub order_code: i64,
    pub order_token: String,
    pub plan: String,
    /// Hết hạn của link thanh toán (giây Unix).
    pub expires_at: i64,
    /// Đơn gia hạn hay đổi gói (có `license_key`): khi đã trả tiền thì `validate`, không `activate`.
    pub renewal: bool,
    /// Trang thanh toán của PayOS, để mở lại bằng trình duyệt (không nhận URL từ giao diện).
    pub checkout_url: String,
    /// Chuỗi VietQR thô, để vẽ lại mã QR khi mở lại màn hình Nâng cấp.
    pub qr_code: String,
}

fn short_hash(parts: &[&str]) -> String {
    let mut h = Sha256::new();
    for p in parts {
        h.update((p.len() as u64).to_le_bytes());
        h.update(p.as_bytes());
    }
    h.finalize()[..16].iter().map(|b| format!("{b:02x}")).collect()
}

pub fn paid_name(key: &PaidKey) -> String {
    let start = key.cycle_start.to_string();
    let epoch = key.epoch.to_string();
    format!(
        "quota-paid-{}",
        short_hash(&[&key.license_id, &key.activation_id, &start, &epoch])
    )
}

pub fn marker_name(license_id: &str, activation_id: &str) -> String {
    format!("quota-mark-{}", short_hash(&[license_id, activation_id]))
}

pub fn read<T: DeserializeOwned>(vault: &dyn Vault, name: &str) -> Result<Option<T>, StoreError> {
    match vault.get(name).map_err(StoreError::Keystore)? {
        None => Ok(None),
        Some(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| StoreError::Corrupt(name.into())),
    }
}

pub fn write<T: Serialize>(vault: &dyn Vault, name: &str, value: &T) -> Result<(), StoreError> {
    let bytes = serde_json::to_vec(value).map_err(|_| StoreError::Corrupt(name.into()))?;
    vault.set(name, &bytes).map_err(StoreError::Keystore)
}

pub fn delete(vault: &dyn Vault, name: &str) -> Result<(), StoreError> {
    vault.delete(name).map_err(StoreError::Keystore)
}

/// Bộ đếm của khóa `key`, chỉ khi nội dung mục mang đúng khóa đó.
pub fn read_paid(vault: &dyn Vault, key: &PaidKey) -> Result<Option<PaidCounter>, StoreError> {
    Ok(read::<PaidCounter>(vault, &paid_name(key))?.filter(|c| c.key == *key))
}

pub fn read_marker(vault: &dyn Vault, license_id: &str, activation_id: &str) -> Result<Option<Marker>, StoreError> {
    read(vault, &marker_name(license_id, activation_id))
}

/// Ghi kết quả của `quota::resolve_paid`: bộ đếm trước, bản ghi đánh dấu sau (spec §6.8 "Thứ tự ghi"). App bị tắt giữa
/// hai lần ghi thì lần sau còn bộ đếm, nên luật "đã có bộ đếm" dùng lại nó, không coi là mất bản ghi.
pub fn write_paid(vault: &dyn Vault, state: &PaidState) -> Result<(), StoreError> {
    if state.write_counter {
        write(vault, &paid_name(&state.counter.key), &state.counter)?;
    }
    if state.write_marker {
        let key = &state.counter.key;
        write(
            vault,
            &marker_name(&key.license_id, &key.activation_id),
            &Marker::of(key),
        )?;
    }
    Ok(())
}

/// Cộng phút vào bộ đếm đã có rồi ghi lại.
pub fn save_paid(vault: &dyn Vault, counter: &PaidCounter) -> Result<(), StoreError> {
    write(vault, &paid_name(&counter.key), counter)
}

pub fn read_free(vault: &dyn Vault) -> Result<Option<FreeCounter>, StoreError> {
    read(vault, FREE)
}

pub fn read_seen(vault: &dyn Vault) -> Result<Seen, StoreError> {
    Ok(read(vault, SEEN)?.unwrap_or_default())
}

#[cfg(test)]
pub mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::*;
    use crate::license::quota::{Resolution, resolve_paid};
    use crate::license::token::{Claims, Plan};

    /// Kho giả: ghi lại thứ tự các lần ghi; có thể cho lỗi đọc hay lỗi ghi một mục.
    #[derive(Default)]
    pub struct FakeVault {
        pub items: Mutex<HashMap<String, Vec<u8>>>,
        pub writes: Mutex<Vec<String>>,
        pub fail_reads: Mutex<bool>,
        pub fail_writes_of: Mutex<Option<String>>,
    }

    impl Vault for FakeVault {
        fn get(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
            if *self.fail_reads.lock().unwrap() {
                return Err("bị từ chối".into());
            }
            Ok(self.items.lock().unwrap().get(name).cloned())
        }

        fn set(&self, name: &str, value: &[u8]) -> Result<(), String> {
            if self
                .fail_writes_of
                .lock()
                .unwrap()
                .as_deref()
                .is_some_and(|p| name.starts_with(p))
            {
                return Err("bị tắt giữa chừng".into());
            }
            self.writes.lock().unwrap().push(name.into());
            self.items.lock().unwrap().insert(name.into(), value.to_vec());
            Ok(())
        }

        fn delete(&self, name: &str) -> Result<(), String> {
            self.items.lock().unwrap().remove(name);
            Ok(())
        }
    }

    pub fn claims() -> Claims {
        Claims {
            kid: "test-1".into(),
            license_id: "lic".into(),
            activation_id: "act".into(),
            activation_created_at: 1_790_812_800,
            device_id_hash: "dev".into(),
            plan: Plan::Pro,
            expires_at: 1_790_812_800 + 30 * 86_400,
            cycle_anchor: 1_790_812_800,
            quota_minutes_per_cycle: Some(1800),
            quota_epoch: 0,
            quota_fresh: false,
            issued_at: 1_790_812_800 + 3600,
            refresh_before: 1_790_812_800 + 15 * 86_400,
        }
    }

    #[test]
    fn the_counter_is_written_before_the_marker() {
        let vault = FakeVault::default();
        let state = resolve_paid(&claims(), true, None, None);
        write_paid(&vault, &state).unwrap();
        let key = PaidKey::of(&claims());
        assert_eq!(
            *vault.writes.lock().unwrap(),
            [paid_name(&key), marker_name("lic", "act")]
        );
        assert_eq!(read_paid(&vault, &key).unwrap().unwrap().used_ms, 0);
        assert_eq!(read_marker(&vault, "lic", "act").unwrap(), Some(Marker::of(&key)));
    }

    /// App bị tắt sau khi ghi bộ đếm mà trước khi ghi bản ghi đánh dấu: lần sau vẫn dùng bộ đếm đó.
    #[test]
    fn a_crash_after_the_counter_write_keeps_the_counter() {
        let vault = FakeVault::default();
        *vault.fail_writes_of.lock().unwrap() = Some("quota-mark-".into());
        let state = resolve_paid(&claims(), true, None, None);
        assert!(write_paid(&vault, &state).is_err());
        *vault.fail_writes_of.lock().unwrap() = None;
        let key = PaidKey::of(&claims());
        let existing = read_paid(&vault, &key).unwrap();
        let again = resolve_paid(
            &claims(),
            false,
            existing,
            read_marker(&vault, "lic", "act").unwrap().as_ref(),
        );
        assert_eq!((again.resolution, again.write_marker), (Resolution::Existing, true));
    }

    #[test]
    fn names_fit_the_keystore_and_a_counter_is_only_used_for_its_own_key() {
        let key = PaidKey::of(&claims());
        let name = paid_name(&key);
        assert!(name.len() <= 64 && name.starts_with("quota-paid-"), "{name}");
        assert!(marker_name("lic", "act").len() <= 64);
        let mut other = key.clone();
        other.epoch = 1;
        assert_ne!(paid_name(&other), name);
        // Mục mang khóa khác (bị sửa, hay trùng băm) thì không dùng.
        let vault = FakeVault::default();
        write(
            &vault,
            &name,
            &PaidCounter {
                key: other,
                used_ms: 1,
                lost: false,
            },
        )
        .unwrap();
        assert_eq!(read_paid(&vault, &key).unwrap(), None);
    }

    #[test]
    fn read_errors_and_corrupt_items_are_not_the_same_as_missing() {
        let vault = FakeVault::default();
        assert_eq!(read_free(&vault).unwrap(), None);
        vault.items.lock().unwrap().insert(FREE.into(), b"{".to_vec());
        assert_eq!(read_free(&vault), Err(StoreError::Corrupt(FREE.into())));
        *vault.fail_reads.lock().unwrap() = true;
        assert!(matches!(read_seen(&vault), Err(StoreError::Keystore(_))));
    }

    /// Hai nút xóa dữ liệu (§4.3; 04 thêm "Xóa model và dữ liệu", cũng gọi `data::clear_all_data`) chỉ xóa `data.db` và mục
    /// `db-key`: bản quyền, đơn đang chờ và bộ đếm hạn mức trong cùng kho khóa giữ nguyên (Q14 của 03).
    #[test]
    fn wiping_user_data_keeps_the_license_and_the_quota_counters() {
        let keys = keyring_core::mock::Store::new().unwrap();
        let service = "com.aitranslator.desktop.test";
        let ks = Keystore::with_store(service, keys.clone());
        let dir = std::env::temp_dir().join(format!("mt-license-wipe-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = crate::db::DataStore::new(dir.clone(), Ok(Keystore::with_store(service, keys)));
        db.with(|_| Ok::<_, crate::db::DbError>(())).unwrap();
        assert!(ks.get(crate::db::KEY_NAME).unwrap().is_some());
        let names = [LICENSE, ORDER, SEEN, FREE, "quota-paid-0123", "quota-mark-0123"];
        for name in names {
            ks.set(name, b"{}").unwrap();
        }
        db.wipe().unwrap();
        assert_eq!(ks.get(crate::db::KEY_NAME).unwrap(), None, "khóa DB bị xóa");
        for name in names {
            assert_eq!(ks.get(name).unwrap().as_deref(), Some(&b"{}"[..]), "{name} giữ nguyên");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Với kho khóa trong bộ nhớ của `keyring-core`: mục lớn nhất (bản ghi license có token thật) vừa giới hạn 2048 byte.
    #[test]
    fn a_license_record_with_a_real_token_fits_the_keystore() {
        let ks = Keystore::mock("com.aitranslator.desktop.test");
        let vectors: serde_json::Value =
            serde_json::from_str(include_str!("../../../server/test/vectors/token-v1.json")).unwrap();
        let record = LicenseRecord {
            key: "0123456789ABCDEFGHJKMNPQRST5".into(),
            activation_id: "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60".into(),
            token: vectors["tokens"][0]["token"].as_str().unwrap().into(),
            validated_at: 1_790_816_400,
            verdict: Some(Verdict::Revoked),
        };
        write(&ks, LICENSE, &record).unwrap();
        assert_eq!(read::<LicenseRecord>(&ks, LICENSE).unwrap(), Some(record));
    }
}
