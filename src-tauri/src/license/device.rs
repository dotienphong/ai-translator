//! Mã máy gửi cho license server (spec §6.8): `device_id_hash` là SHA-256 (64 chữ số hex thường) của ID phần cứng, và
//! `device_label` là tên máy để người dùng nhận ra máy trong danh sách khi key đã đủ 2 máy (`409 device_limit`).
//!
//! - macOS: ID phần cứng là IOPlatformUUID, đọc bằng `gethostuuid` (cùng giá trị `ioreg` hiện), dạng chữ hoa có gạch nối.
//! - Windows: `MachineGuid` ở `HKLM\SOFTWARE\Microsoft\Cryptography` (khung 64 bit), nguyên văn như registry lưu. Cần
//!   Windows để thử (06b, task Windows).
//!
//! Chuỗi đem băm là hợp đồng với mọi bản app sau này: đổi cách viết (hoa, thường, có gạch nối hay không) thì máy đã kích
//! hoạt thành máy mới, tốn thêm một suất kích hoạt.

use sha2::{Digest, Sha256};

/// Độ dài tối đa của tên máy, như server cắt (`parseDeviceLabel`).
const MAX_LABEL_CHARS: usize = 64;

/// `device_id_hash` của chuỗi ID phần cứng.
pub fn hash_id(hardware_id: &str) -> String {
    Sha256::digest(hardware_id.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Tên máy gửi lên server: bỏ ký tự điều khiển, cắt khoảng trắng, tối đa 64 ký tự; bỏ đuôi `.local` của macOS. Rỗng thì
/// `None` (server lưu `null`).
pub fn clean_label(raw: &str) -> Option<String> {
    let raw = raw.trim().strip_suffix(".local").unwrap_or(raw.trim());
    let label: String = raw.chars().filter(|c| !c.is_control()).take(MAX_LABEL_CHARS).collect();
    let label = label.trim().to_string();
    (!label.is_empty()).then_some(label)
}

/// ID phần cứng của máy này.
pub fn hardware_id() -> Result<String, String> {
    platform::hardware_id()
}

/// Tên máy này, đã làm sạch.
pub fn label() -> Option<String> {
    clean_label(&platform::raw_label())
}

#[cfg(target_os = "macos")]
mod platform {
    pub fn hardware_id() -> Result<String, String> {
        let mut id = [0u8; 16];
        let wait = libc::timespec { tv_sec: 1, tv_nsec: 0 };
        // SAFETY: `id` đủ 16 byte như `uuid_t`; `wait` sống suốt lời gọi.
        let rc = unsafe { libc::gethostuuid(id.as_mut_ptr(), &wait) };
        if rc != 0 {
            return Err(format!("gethostuuid lỗi {}", std::io::Error::last_os_error()));
        }
        let h: String = id.iter().map(|b| format!("{b:02X}")).collect();
        Ok(format!(
            "{}-{}-{}-{}-{}",
            &h[..8],
            &h[8..12],
            &h[12..16],
            &h[16..20],
            &h[20..]
        ))
    }

    pub fn raw_label() -> String {
        let mut buf = [0u8; 256];
        // SAFETY: `buf` đủ chỗ; `gethostname` ghi tối đa `buf.len()` byte.
        let rc = unsafe { libc::gethostname(buf.as_mut_ptr().cast(), buf.len()) };
        if rc != 0 {
            return String::new();
        }
        let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
        String::from_utf8_lossy(&buf[..end]).into_owned()
    }
}

#[cfg(windows)]
mod platform {
    use windows::Win32::System::Registry::{HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6464KEY, RegGetValueW};
    use windows::core::w;

    pub fn hardware_id() -> Result<String, String> {
        let mut buf = [0u16; 128];
        let mut size = std::mem::size_of_val(&buf) as u32;
        // SAFETY: `buf` và `size` sống suốt lời gọi; `size` là số byte của `buf`.
        let rc = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                w!("SOFTWARE\\Microsoft\\Cryptography"),
                w!("MachineGuid"),
                // Khung 64 bit của registry, kể cả khi tiến trình là 32 bit.
                RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut size),
            )
        };
        if rc.is_err() {
            return Err(format!("không đọc được MachineGuid: {rc:?}"));
        }
        let chars = (size as usize / 2).saturating_sub(1);
        Ok(String::from_utf16_lossy(&buf[..chars.min(buf.len())]))
    }

    pub fn raw_label() -> String {
        std::env::var("COMPUTERNAME").unwrap_or_default()
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn hardware_id() -> Result<String, String> {
        Err("chỉ hỗ trợ macOS và Windows (spec D3)".into())
    }

    pub fn raw_label() -> String {
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_hash_is_64_lowercase_hex_digits_like_the_server_wants() {
        let h = hash_id("11481334-7115-5291-BC6B-AFE810450A15");
        assert_eq!(h.len(), 64);
        assert!(h.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
        assert_eq!(
            hash_id(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn labels_are_cleaned_like_the_server_does() {
        assert_eq!(
            clean_label("Phong-MacBook-Pro.local").as_deref(),
            Some("Phong-MacBook-Pro")
        );
        assert_eq!(clean_label("  Máy\u{7}\tvăn phòng \n").as_deref(), Some("Máyvăn phòng"));
        assert_eq!(clean_label(" \u{1} "), None);
        assert_eq!(clean_label(&"á".repeat(80)).unwrap().chars().count(), 64);
    }

    /// Đọc ID thật của máy (không cần quyền gì): cùng giá trị `ioreg` hiện, và đọc hai lần ra một.
    #[cfg(target_os = "macos")]
    #[test]
    fn the_hardware_id_is_the_platform_uuid() {
        let id = hardware_id().unwrap();
        assert_eq!(id, hardware_id().unwrap());
        let out = std::process::Command::new("/usr/sbin/ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
            .unwrap();
        let text = String::from_utf8_lossy(&out.stdout);
        let line = text.lines().find(|l| l.contains("IOPlatformUUID")).unwrap();
        assert!(line.contains(&format!("\"{id}\"")), "{line} / {id}");
        assert!(label().is_some());
    }
}
