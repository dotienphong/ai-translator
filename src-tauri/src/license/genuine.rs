//! App tự kiểm chữ ký số của chính nó lúc khởi động (spec §10.2, "Sửa hoặc ký lại file của app"):
//! - macOS: `SecStaticCodeCheckValidity` trên gói `.app` đang chạy, kiểm cả code lồng bên trong (tiến trình phụ, dylib),
//!   với yêu cầu chứng thư Developer ID của đúng Team ID;
//! - Windows: `WinVerifyTrust` trên file `.exe` đang chạy, rồi so tên chủ chứng thư của người ký. Cần Windows để thử.
//!
//! Chữ ký không hợp lệ thì app chỉ chạy Free và báo "Bản cài không chính hãng" kèm link tải chính thức. Bản debug bỏ qua
//! bước này. Team ID và tên chủ chứng thư thật chờ tài khoản (T1, T2): kế hoạch 07 đặt biến môi trường lúc build trong CI
//! (`AI_TRANSLATOR_TEAM_ID`, `AI_TRANSLATOR_SIGNER`). Bản phát hành build thiếu biến này thì coi là không chính hãng
//! (quên cấu hình thì khóa, không mở cho không).

/// Team ID của Apple Developer, đặt lúc build bản phát hành (kế hoạch 07).
pub const TEAM_ID: Option<&str> = option_env!("AI_TRANSLATOR_TEAM_ID");
/// Tên chủ chứng thư ký mã trên Windows, đặt lúc build bản phát hành (kế hoạch 07).
pub const SIGNER: Option<&str> = option_env!("AI_TRANSLATOR_SIGNER");

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Genuineness {
    Genuine,
    /// Kèm lý do, chỉ để ghi log.
    NotGenuine(String),
    /// Bản debug không kiểm.
    Skipped,
}

/// Yêu cầu chữ ký của macOS cho một Team ID: chứng thư Developer ID do Apple cấp, đúng Team ID.
pub fn team_requirement(team_id: &str) -> Option<String> {
    let ok = team_id.len() == 10 && team_id.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit());
    ok.then(|| format!("anchor apple generic and certificate leaf[subject.OU] = \"{team_id}\""))
}

/// Kiểm bản đang chạy.
pub fn check_this_build() -> Genuineness {
    if cfg!(debug_assertions) {
        return Genuineness::Skipped;
    }
    platform::check_self()
}

#[cfg(target_os = "macos")]
pub mod platform {
    use std::path::Path;
    use std::str::FromStr;

    use core_foundation::url::CFURL;
    use security_framework::os::macos::code_signing::{Flags, SecCode, SecRequirement, SecStaticCode};

    use super::{Genuineness, TEAM_ID, team_requirement};

    /// Kiểm chữ ký của code ở `path` (file thực thi hay gói `.app`) theo `requirement` (cú pháp của `codesign`).
    pub fn check_path(path: &Path, requirement: &str) -> Result<(), String> {
        let requirement = SecRequirement::from_str(requirement).map_err(|e| format!("yêu cầu sai: {e}"))?;
        let url = CFURL::from_path(path, path.is_dir()).ok_or("đường dẫn không hợp lệ")?;
        let code = SecStaticCode::from_path(&url, Flags::NONE).map_err(|e| e.to_string())?;
        code.check_validity(Flags::CHECK_NESTED_CODE | Flags::STRICT_VALIDATE, &requirement)
            .map_err(|e| e.to_string())
    }

    pub fn check_self() -> Genuineness {
        let Some(requirement) = TEAM_ID.and_then(team_requirement) else {
            return Genuineness::NotGenuine("bản phát hành thiếu Team ID".into());
        };
        let path = match SecCode::for_self(Flags::NONE).and_then(|c| c.path(Flags::NONE)) {
            Ok(url) => url.to_path(),
            Err(e) => return Genuineness::NotGenuine(e.to_string()),
        };
        let Some(path) = path else {
            return Genuineness::NotGenuine("không biết đường dẫn của app".into());
        };
        match check_path(&path, &requirement) {
            Ok(()) => Genuineness::Genuine,
            Err(e) => Genuineness::NotGenuine(e),
        }
    }
}

#[cfg(windows)]
pub mod platform {
    use windows::Win32::Foundation::{HANDLE, HWND};
    use windows::Win32::Security::Cryptography::{CERT_NAME_SIMPLE_DISPLAY_TYPE, CertGetNameStringW};
    use windows::Win32::Security::WinTrust::{
        WINTRUST_ACTION_GENERIC_VERIFY_V2, WINTRUST_DATA, WINTRUST_DATA_0, WINTRUST_FILE_INFO, WTD_CHOICE_FILE,
        WTD_REVOKE_NONE, WTD_STATEACTION_CLOSE, WTD_STATEACTION_VERIFY, WTD_UI_NONE, WTHelperGetProvSignerFromChain,
        WTHelperProvDataFromStateData, WinVerifyTrust,
    };
    use windows::core::PCWSTR;

    use super::{Genuineness, SIGNER};

    /// Kiểm chữ ký Authenticode của file và trả tên chủ chứng thư của người ký.
    pub fn signer_of(path: &std::path::Path) -> Result<String, String> {
        let wide: Vec<u16> = path.as_os_str().encode_wide_null();
        let mut file = WINTRUST_FILE_INFO {
            cbStruct: std::mem::size_of::<WINTRUST_FILE_INFO>() as u32,
            pcwszFilePath: PCWSTR(wide.as_ptr()),
            hFile: HANDLE::default(),
            pgKnownSubject: std::ptr::null_mut(),
        };
        let mut data = WINTRUST_DATA {
            cbStruct: std::mem::size_of::<WINTRUST_DATA>() as u32,
            dwUIChoice: WTD_UI_NONE,
            fdwRevocationChecks: WTD_REVOKE_NONE,
            dwUnionChoice: WTD_CHOICE_FILE,
            Anonymous: WINTRUST_DATA_0 { pFile: &mut file },
            dwStateAction: WTD_STATEACTION_VERIFY,
            ..Default::default()
        };
        let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
        // SAFETY: `file`, `wide`, `data` sống tới hết hàm; đóng trạng thái bằng `WTD_STATEACTION_CLOSE` ở dưới.
        let status = unsafe { WinVerifyTrust(HWND::default(), &mut action, (&mut data as *mut WINTRUST_DATA).cast()) };
        let name = if status == 0 {
            // SAFETY: trạng thái hợp lệ sau `WTD_STATEACTION_VERIFY` thành công; con trỏ do wintrust quản lý.
            unsafe {
                let provider = WTHelperProvDataFromStateData(data.hWVTStateData);
                let signer = WTHelperGetProvSignerFromChain(provider, 0, false, 0);
                if signer.is_null() || (*signer).csCertChain == 0 {
                    Err("không có người ký".to_string())
                } else {
                    let cert = (*(*signer).pasCertChain).pCert;
                    let mut buf = [0u16; 256];
                    let n = CertGetNameStringW(cert, CERT_NAME_SIMPLE_DISPLAY_TYPE, 0, None, Some(&mut buf));
                    Ok(String::from_utf16_lossy(&buf[..(n as usize).saturating_sub(1)]))
                }
            }
        } else {
            Err(format!("WinVerifyTrust trả 0x{status:08x}"))
        };
        data.dwStateAction = WTD_STATEACTION_CLOSE;
        // SAFETY: đóng trạng thái đã mở ở trên.
        let _ = unsafe { WinVerifyTrust(HWND::default(), &mut action, (&mut data as *mut WINTRUST_DATA).cast()) };
        name
    }

    trait EncodeWideNull {
        fn encode_wide_null(&self) -> Vec<u16>;
    }

    impl EncodeWideNull for std::ffi::OsStr {
        fn encode_wide_null(&self) -> Vec<u16> {
            use std::os::windows::ffi::OsStrExt;
            self.encode_wide().chain([0]).collect()
        }
    }

    pub fn check_self() -> Genuineness {
        let Some(expected) = SIGNER else {
            return Genuineness::NotGenuine("bản phát hành thiếu tên người ký".into());
        };
        let exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(e) => return Genuineness::NotGenuine(e.to_string()),
        };
        match signer_of(&exe) {
            Ok(name) if name == expected => Genuineness::Genuine,
            Ok(name) => Genuineness::NotGenuine(format!("người ký khác: {name}")),
            Err(e) => Genuineness::NotGenuine(e),
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
pub mod platform {
    use super::Genuineness;

    pub fn check_self() -> Genuineness {
        Genuineness::NotGenuine("chỉ hỗ trợ macOS và Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_team_requirement_only_takes_a_real_team_id() {
        assert_eq!(
            team_requirement("ABCDE12345").as_deref(),
            Some("anchor apple generic and certificate leaf[subject.OU] = \"ABCDE12345\"")
        );
        assert_eq!(team_requirement("abc\" or true"), None);
        assert_eq!(team_requirement(""), None);
        if cfg!(debug_assertions) {
            assert_eq!(check_this_build(), Genuineness::Skipped, "bản debug bỏ qua");
        } else if TEAM_ID.is_none() && SIGNER.is_none() {
            // Bản phát hành build thiếu Team ID (chưa qua CI của 07): không chính hãng, chỉ chạy Free.
            assert!(matches!(check_this_build(), Genuineness::NotGenuine(_)));
        }
    }

    /// Trên máy thật, không cần quyền gì: `/bin/ls` do Apple ký nên qua yêu cầu `anchor apple`, nhưng không qua yêu cầu
    /// Team ID của một nhà phát triển; file không ký thì lỗi.
    #[cfg(target_os = "macos")]
    #[test]
    fn signatures_are_checked_against_the_requirement() {
        use std::path::Path;
        let ls = Path::new("/bin/ls");
        platform::check_path(ls, "anchor apple").unwrap();
        assert!(platform::check_path(ls, &team_requirement("ABCDE12345").unwrap()).is_err());
        let unsigned = std::env::temp_dir().join(format!("mt-unsigned-{}", std::process::id()));
        std::fs::write(&unsigned, b"#!/bin/sh\necho hi\n").unwrap();
        assert!(platform::check_path(&unsigned, "anchor apple").is_err());
        std::fs::remove_file(unsigned).unwrap();
    }
}
