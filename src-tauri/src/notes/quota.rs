//! Bộ đếm số lần tạo ghi chú của gói Free (spec 2026-11-11-ghi-chu-cuoc-hop-design): 3 lần trong thời gian dùng thử.
//! Số đếm nằm trong kho khóa của hệ điều hành, không nằm trong `settings.json`, để người dùng không sửa tay được.

use crate::errors;
use crate::license::manager::TrialStatus;
use crate::security::keystore::{Keystore, KeystoreError};

/// Số lần tạo ghi chú của gói Free trong thời gian dùng thử.
pub const FREE_NOTES: u32 = 3;
/// Mục kho khóa giữ số lần đã dùng (chữ số ASCII).
pub const FREE_ENTRY: &str = "notes-free-used";

/// Có được tạo ghi chú không. Pro: luôn được. Free: chỉ khi còn dùng thử và chưa hết `FREE_NOTES` lần;
/// hết dùng thử hay chưa có dùng thử thì cần Pro.
pub fn check(pro: bool, trial: TrialStatus, used: u32) -> Result<(), &'static str> {
    if pro {
        return Ok(());
    }
    match trial {
        TrialStatus::Active if used < FREE_NOTES => Ok(()),
        TrialStatus::Active => Err(errors::NOTES_FREE_USED_UP),
        TrialStatus::Ended | TrialStatus::None => Err(errors::PRO_REQUIRED),
    }
}

/// Số lần đã dùng. Chưa có mục: 0. Không đọc được hay không phải số: `FREE_NOTES` (từ chối khi không chắc).
pub fn used(ks: &Keystore) -> u32 {
    match ks.get(FREE_ENTRY) {
        Ok(None) => 0,
        Ok(Some(bytes)) => parse(&bytes),
        Err(_) => FREE_NOTES,
    }
}

/// Chỉ nhận chuỗi chữ số ASCII (không dấu, không khoảng trắng, không rỗng); khác đi là `FREE_NOTES`.
fn parse(bytes: &[u8]) -> u32 {
    std::str::from_utf8(bytes)
        .ok()
        .filter(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
        .and_then(|s| s.parse().ok())
        .unwrap_or(FREE_NOTES)
}

/// Tính thêm một lần dùng và trả số mới. Mục hỏng được ghi đè từ `FREE_NOTES`, nên không bao giờ mở lại hạn mức.
pub fn bump(ks: &Keystore) -> Result<u32, KeystoreError> {
    let next = used(ks).saturating_add(1);
    ks.set(FREE_ENTRY, next.to_string().as_bytes())?;
    Ok(next)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::errors;
    use crate::license::manager::TrialStatus;
    use crate::security::keystore::Keystore;

    #[test]
    fn free_rule() {
        assert_eq!(check(true, TrialStatus::Ended, 99), Ok(()));
        assert_eq!(check(false, TrialStatus::Active, 2), Ok(()));
        assert_eq!(check(false, TrialStatus::Active, 3), Err(errors::NOTES_FREE_USED_UP));
        assert_eq!(check(false, TrialStatus::Ended, 0), Err(errors::PRO_REQUIRED));
        assert_eq!(check(false, TrialStatus::None, 0), Err(errors::PRO_REQUIRED));
    }

    #[test]
    fn counter_lives_in_the_keystore_and_fails_closed() {
        let ks = Keystore::mock("t");
        assert_eq!(used(&ks), 0);
        assert_eq!((bump(&ks).unwrap(), bump(&ks).unwrap(), used(&ks)), (1, 2, 2));
        ks.set(FREE_ENTRY, b"garbage").unwrap();
        assert_eq!(used(&ks), FREE_NOTES);
    }

    #[test]
    fn unreadable_entry_counts_as_used_up() {
        let ks = Keystore::mock("t");
        for raw in [
            &b"-1"[..],
            b"",
            b" 2",
            b"2 ",
            b"+1",
            b"1.5",
            b"99999999999999999999",
            &[0xff, 0xfe],
        ] {
            ks.set(FREE_ENTRY, raw).unwrap();
            assert_eq!(used(&ks), FREE_NOTES, "mục {raw:?}");
        }
        ks.set(FREE_ENTRY, b"2").unwrap();
        assert_eq!(used(&ks), 2);
        // Số đúng nhưng lớn hơn hạn mức vẫn đọc nguyên (check sẽ từ chối).
        ks.set(FREE_ENTRY, b"7").unwrap();
        assert_eq!(used(&ks), 7);
    }

    #[test]
    fn bump_stores_ascii_digits() {
        let ks = Keystore::mock("t");
        assert_eq!(bump(&ks).unwrap(), 1);
        assert_eq!(ks.get(FREE_ENTRY).unwrap(), Some(b"1".to_vec()));
    }
}
