//! Kiểm SHA-256 của tiến trình phụ và thư viện đi kèm trước khi chạy (spec §10.2, "Thay tiến trình phụ, hoặc chèn thư
//! viện giả"; Đ15 của kế hoạch 00). Danh sách băm sinh lúc build từ `src-tauri/binaries/` (build.rs); kế hoạch 07 bảo đảm
//! CI sinh danh sách từ đúng các file phát hành.
//!
//! Ngoài các file trong bảng, thư mục không được có file dạng thư viện lạ (`.dll`, `.dylib`, `.so`, hay tên bắt đầu bằng
//! `libggml-`, `ggml-`): `llama-server` b11146 tự nạp mọi backend ggml nó thấy trong thư mục của nó (`ggml_backend_load_all`),
//! nên một thư viện thả thêm vào đó sẽ chạy trong tiến trình phụ (đã thử ở review 02c). Unix: file trong bảng mà nhóm hay
//! người khác ghi được thì cũng từ chối.
//!
//! Khoảng hở giữa lúc kiểm và lúc chạy (TOCTOU): trên Windows, mọi file đã kiểm được mở với share mode chỉ cho đọc và giữ
//! handle ([`Verified::locks`]), nên không ai sửa, đổi tên hay xóa được chúng khi app còn giữ. Trên macOS dựa vào chữ ký
//! và library validation của bản phát hành (kế hoạch 07).

use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::fs::File;
use std::io::Read;
use std::path::Path;

include!(concat!(env!("OUT_DIR"), "/sidecar_hashes.rs"));

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum IntegrityError {
    #[error("thiếu {0}")]
    Missing(String),
    #[error("{0} không có trong danh sách build sẵn")]
    Unverified(String),
    #[error("{0} khác bản build sẵn")]
    Tampered(String),
    #[error("{0} để người khác ghi được")]
    Writable(String),
}

/// Kết quả kiểm: băm của từng file thực thi được hỏi, và (Windows) handle chỉ cho đọc của mọi file trong bảng. Giữ
/// `locks` tới khi không cần chạy tiến trình phụ nữa.
#[derive(Debug)]
pub struct Verified {
    pub hashes: Vec<String>,
    pub locks: Vec<File>,
}

/// Mở file để kiểm. Windows: share mode chỉ `FILE_SHARE_READ`, nên khi handle còn mở thì không ai ghi, đổi tên hay xóa
/// được file (tiến trình phụ vẫn chạy được, vì Windows chỉ cần quyền đọc).
fn open_locked(path: &Path) -> std::io::Result<File> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_SHARE_READ: u32 = 0x1;
        options.share_mode(FILE_SHARE_READ);
    }
    options.open(path)
}

fn sha256_of(file: &mut File) -> std::io::Result<String> {
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().fold(String::new(), |mut s, b| {
        let _ = write!(s, "{b:02x}");
        s
    }))
}

pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    sha256_of(&mut File::open(path)?)
}

/// Tên có dạng thư viện mà `llama-server` hay hệ điều hành có thể nạp.
pub fn looks_like_library(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".dll")
        || lower.ends_with(".dylib")
        || lower.ends_with(".so")
        || lower.contains(".so.")
        || lower.starts_with("libggml-")
        || lower.starts_with("ggml-")
}

#[cfg(unix)]
fn writable_by_others(file: &File) -> bool {
    use std::os::unix::fs::PermissionsExt;
    file.metadata().is_ok_and(|m| m.permissions().mode() & 0o022 != 0)
}

#[cfg(not(unix))]
fn writable_by_others(_: &File) -> bool {
    false
}

/// Kiểm mọi file trong `table` (tên file trong `dir`, SHA-256), mọi file thực thi trong `required` phải có trong bảng, và
/// không có thư viện lạ trong `dir`. Trả băm của từng file thực thi trong `required`, theo thứ tự.
pub fn verify(dir: &Path, required: &[&Path], table: &[(&str, &str)]) -> Result<Verified, IntegrityError> {
    let name = |p: &Path| {
        p.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    };
    let mut hashes = Vec::new();
    for exe in required {
        let exe_name = name(exe);
        match table.iter().find(|(n, _)| *n == exe_name) {
            Some((_, hash)) => hashes.push(hash.to_string()),
            None if exe.is_file() => return Err(IntegrityError::Unverified(exe_name)),
            None => return Err(IntegrityError::Missing(exe_name)),
        }
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            if looks_like_library(&file) && !table.iter().any(|(n, _)| *n == file) {
                return Err(IntegrityError::Unverified(file));
            }
        }
    }
    let mut locks = Vec::new();
    for (file, expected) in table {
        let mut handle = open_locked(&dir.join(file)).map_err(|_| IntegrityError::Missing(file.to_string()))?;
        if writable_by_others(&handle) {
            return Err(IntegrityError::Writable(file.to_string()));
        }
        let actual = sha256_of(&mut handle).map_err(|_| IntegrityError::Missing(file.to_string()))?;
        if actual != *expected {
            return Err(IntegrityError::Tampered(file.to_string()));
        }
        if cfg!(windows) {
            locks.push(handle);
        }
    }
    Ok(Verified { hashes, locks })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Temp(std::path::PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn setup(name: &str) -> (Temp, Vec<(String, String)>) {
        let dir = std::env::temp_dir().join(format!("mt-integrity-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut table = Vec::new();
        for (file, bytes) in [
            ("asr-worker", &b"worker"[..]),
            ("llama-server", b"server"),
            ("libggml.0.dylib", b"lib"),
        ] {
            let path = dir.join(file);
            std::fs::write(&path, bytes).unwrap();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            }
            table.push((file.to_string(), sha256_file(&path).unwrap()));
        }
        (Temp(dir), table)
    }

    fn borrowed(table: &[(String, String)]) -> Vec<(&str, &str)> {
        table.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect()
    }

    #[test]
    fn sha256_matches_shasum() {
        let (t, _) = setup("known");
        // `printf worker | shasum -a 256`
        assert_eq!(
            sha256_file(&t.0.join("asr-worker")).unwrap(),
            "87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e"
        );
    }

    /// N-7 của review 02 lần 2 (Windows, N2(c) của review 02c): khi `Verified::locks` còn giữ, không ai mở được file để
    /// ghi, đổi tên hay xóa, nhưng binary vẫn chạy được.
    #[cfg(windows)]
    #[test]
    fn verified_files_are_read_only_while_locked_but_still_run() {
        let dir = std::env::temp_dir().join(format!("mt-integrity-lock-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let t = Temp(dir.clone());
        let system = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        let exe = t.0.join("asr-worker.exe");
        std::fs::copy(std::path::Path::new(&system).join(r"System32\whoami.exe"), &exe).unwrap();
        let table = [("asr-worker.exe".to_string(), sha256_file(&exe).unwrap())];
        let verified = verify(&t.0, &[&exe], &borrowed(&table)).unwrap();
        assert_eq!(verified.locks.len(), 1);
        assert!(
            std::fs::OpenOptions::new().write(true).open(&exe).is_err(),
            "không mở để ghi được"
        );
        assert!(
            std::fs::rename(&exe, t.0.join("khac.exe")).is_err(),
            "không đổi tên được"
        );
        assert!(std::fs::remove_file(&exe).is_err(), "không xóa được");
        let ran = std::process::Command::new(&exe).output().unwrap();
        assert!(ran.status.success(), "binary vẫn chạy được");
        drop(verified);
        assert!(
            std::fs::OpenOptions::new().write(true).open(&exe).is_ok(),
            "bỏ khóa thì ghi được"
        );
    }

    #[test]
    fn untouched_files_pass_and_return_the_executable_hashes() {
        let (t, table) = setup("ok");
        let verified = verify(
            &t.0,
            &[&t.0.join("asr-worker"), &t.0.join("llama-server")],
            &borrowed(&table),
        )
        .unwrap();
        assert_eq!(verified.hashes, [table[0].1.clone(), table[1].1.clone()]);
        assert_eq!(verified.locks.len(), if cfg!(windows) { 3 } else { 0 });
    }

    #[test]
    fn a_changed_library_or_executable_is_refused() {
        let (t, table) = setup("tampered");
        std::fs::write(t.0.join("libggml.0.dylib"), b"LIB").unwrap();
        let err = verify(&t.0, &[&t.0.join("asr-worker")], &borrowed(&table)).unwrap_err();
        assert_eq!(err, IntegrityError::Tampered("libggml.0.dylib".into()));
        for exe in ["asr-worker", "llama-server"] {
            let (t, table) = setup(&format!("exe-{exe}"));
            std::fs::write(t.0.join(exe), b"EVIL").unwrap();
            let err = verify(&t.0, &[&t.0.join(exe)], &borrowed(&table)).unwrap_err();
            assert_eq!(err, IntegrityError::Tampered(exe.into()), "thay chính file {exe}");
        }
    }

    /// N2(b) của review 02c: thư viện thả thêm vào thư mục (llama-server sẽ tự nạp) bị từ chối.
    #[test]
    fn an_extra_library_in_the_folder_is_refused() {
        for extra in ["libggml-cuda-x.so", "ggml-cpu-x.dll", "libfoo.dylib", "libbar.so.1"] {
            let (t, table) = setup(&format!("extra-{extra}"));
            std::fs::write(t.0.join(extra), b"x").unwrap();
            let err = verify(&t.0, &[&t.0.join("asr-worker")], &borrowed(&table)).unwrap_err();
            assert_eq!(err, IntegrityError::Unverified(extra.into()));
        }
        assert!(!looks_like_library("asr-worker"));
        assert!(!looks_like_library("notes.txt"));
    }

    #[cfg(unix)]
    #[test]
    fn a_file_others_can_write_is_refused() {
        use std::os::unix::fs::PermissionsExt;
        let (t, table) = setup("writable");
        std::fs::set_permissions(t.0.join("llama-server"), std::fs::Permissions::from_mode(0o775)).unwrap();
        let err = verify(&t.0, &[&t.0.join("asr-worker")], &borrowed(&table)).unwrap_err();
        assert_eq!(err, IntegrityError::Writable("llama-server".into()));
    }

    #[test]
    fn unknown_or_missing_files_are_refused() {
        let (t, table) = setup("unknown");
        std::fs::write(t.0.join("other"), b"x").unwrap();
        let t2 = borrowed(&table);
        assert_eq!(
            verify(&t.0, &[&t.0.join("other")], &t2).unwrap_err(),
            IntegrityError::Unverified("other".into())
        );
        assert_eq!(
            verify(&t.0, &[&t.0.join("nowhere")], &t2).unwrap_err(),
            IntegrityError::Missing("nowhere".into())
        );
        std::fs::remove_file(t.0.join("llama-server")).unwrap();
        assert_eq!(
            verify(&t.0, &[&t.0.join("asr-worker")], &t2).unwrap_err(),
            IntegrityError::Missing("llama-server".into())
        );
    }
}
