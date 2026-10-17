//! Thông tin hệ điều hành và CPU cho báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2). RAM lấy từ
//! `models::machine::total_ram_bytes` (đã có), backend GPU từ sự kiện của tiến trình phụ; ở đây chỉ phần còn thiếu.

/// Tên hệ điều hành, phiên bản, kiến trúc và tên chip hay CPU.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SystemInfo {
    /// `macos` hay `windows` (`std::env::consts::OS`).
    pub os_name: &'static str,
    pub os_version: String,
    /// `aarch64` hay `x86_64` (`std::env::consts::ARCH`).
    pub arch: &'static str,
    /// `Apple M4 Pro`, `Intel(R) Core(TM) i7-1185G7 @ 3.00GHz`…
    pub chip: Option<String>,
}

pub fn system_info() -> SystemInfo {
    SystemInfo {
        os_name: std::env::consts::OS,
        os_version: platform::os_version().unwrap_or_else(|| "unknown".to_string()),
        arch: std::env::consts::ARCH,
        chip: platform::chip(),
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::CStr;

    /// Đọc một chuỗi của `sysctlbyname`.
    fn sysctl_string(name: &CStr) -> Option<String> {
        let mut len: usize = 0;
        // SAFETY: lần gọi đầu chỉ hỏi độ dài (không có vùng nhớ ra); `len` sống suốt lời gọi.
        let rc = unsafe { libc::sysctlbyname(name.as_ptr(), std::ptr::null_mut(), &mut len, std::ptr::null_mut(), 0) };
        if rc != 0 || len == 0 {
            return None;
        }
        let mut buf = vec![0u8; len];
        // SAFETY: `buf` đủ `len` byte và sống suốt lời gọi.
        let rc = unsafe {
            libc::sysctlbyname(
                name.as_ptr(),
                buf.as_mut_ptr().cast(),
                &mut len,
                std::ptr::null_mut(),
                0,
            )
        };
        if rc != 0 {
            return None;
        }
        buf.truncate(len);
        while buf.last() == Some(&0) {
            buf.pop();
        }
        String::from_utf8(buf).ok().filter(|s| !s.is_empty())
    }

    pub fn os_version() -> Option<String> {
        sysctl_string(c"kern.osproductversion")
    }

    pub fn chip() -> Option<String> {
        sysctl_string(c"machdep.cpu.brand_string")
    }
}

#[cfg(windows)]
mod platform {
    use windows::Win32::System::Registry::{HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RegGetValueW};
    use windows::core::{PCWSTR, w};

    /// Đọc một giá trị chuỗi của `HKLM`.
    fn registry_string(subkey: PCWSTR, value: PCWSTR) -> Option<String> {
        let mut buf = [0u16; 256];
        let mut size = std::mem::size_of_val(&buf) as u32;
        // SAFETY: `buf` và `size` sống suốt lời gọi; `size` là số byte của `buf`.
        let rc = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                subkey,
                value,
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut size),
            )
        };
        if rc.is_err() {
            return None;
        }
        let chars = (size as usize / 2).saturating_sub(1);
        let text = String::from_utf16_lossy(&buf[..chars.min(buf.len())]);
        Some(text.trim().to_string()).filter(|s| !s.is_empty())
    }

    /// Windows báo `10.0` cho cả Windows 10 và 11; số bản dựng (`26100`) mới phân biệt được.
    pub fn os_version() -> Option<String> {
        registry_string(
            w!("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"),
            w!("CurrentBuildNumber"),
        )
        .map(|build| format!("10.0.{build}"))
    }

    pub fn chip() -> Option<String> {
        registry_string(
            w!("HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0"),
            w!("ProcessorNameString"),
        )
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn os_version() -> Option<String> {
        None
    }

    pub fn chip() -> Option<String> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_basic_facts_are_filled_in_on_a_supported_os() {
        let info = system_info();
        assert!(!info.os_name.is_empty() && !info.arch.is_empty());
        if cfg!(any(target_os = "macos", windows)) {
            assert_ne!(info.os_version, "unknown");
            assert!(info.chip.as_deref().is_some_and(|c| !c.is_empty()), "{info:?}");
        }
        if cfg!(target_os = "macos") {
            assert_eq!(info.os_name, "macos");
            assert!(info.os_version.split('.').count() >= 2, "{}", info.os_version);
        }
    }
}
