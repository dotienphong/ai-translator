//! Gói model giọng đọc trên máy (spec 2026-11-02-doc-ban-dich-tts-design): thư mục `tts` trong thư mục model, nơi
//! [`crate::tts`] tìm 13 file model theo đường dẫn tương đối. Khác kho chính ([`super::store`]) ở chỗ gói có thư mục con
//! và cả gói dùng chung một lần "đã đủ".
//!
//! - `tts/installed.json`: các file đã tải xong và đúng SHA-256 (`path`, `sha256`, `bytes`). Một file chỉ vào đây sau khi cả
//!   gói đã đủ và đổi tên xong. Lúc bắt đầu chỉ so bản ghi với manifest và kích thước file (không băm lại ~500 MB).
//! - Phần đang tải là `<tên file>.<16 ký tự đầu SHA-256>.part` cạnh file đích; tải tiếp được khi rớt mạng.
//! - Kho chính chỉ dọn file ở gốc thư mục model (`Store::cleanup`), nên thư mục `tts` không bị đụng tới; "Xóa model và dữ
//!   liệu" xóa cả thư mục model nên xóa luôn cả gói giọng đọc.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::download::{FileJob, part_path};
use super::manifest::{TtsFile, TtsPack};

/// Tên thư mục con của gói giọng đọc trong thư mục model (`crate::tts::model_root` dùng cùng tên).
pub const DIR: &str = "tts";
const INSTALLED: &str = "installed.json";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Record {
    path: String,
    sha256: String,
    bytes: u64,
}

#[derive(Clone, Debug)]
pub struct TtsStore {
    root: PathBuf,
}

impl TtsStore {
    /// `models_dir`: thư mục model của kho chính.
    pub fn new(models_dir: &Path) -> Self {
        Self {
            root: models_dir.join(DIR),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Đường dẫn file trên đĩa (đường dẫn trong manifest ngăn bằng `/`).
    pub fn dest(&self, file: &TtsFile) -> PathBuf {
        file.path.split('/').fold(self.root.clone(), |dir, seg| dir.join(seg))
    }

    fn records(&self) -> Vec<Record> {
        std::fs::read(self.root.join(INSTALLED))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    fn save(&self, list: &[Record]) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.root)?;
        let tmp = self.root.join(format!("{INSTALLED}.tmp"));
        std::fs::write(&tmp, serde_json::to_vec_pretty(list)?)?;
        std::fs::rename(tmp, self.root.join(INSTALLED))
    }

    /// File đã tải với đúng bản trong manifest và còn đủ kích thước trên đĩa.
    pub fn is_installed(&self, file: &TtsFile) -> bool {
        self.records()
            .iter()
            .any(|r| r.path == file.path && r.sha256 == file.sha256 && r.bytes == file.bytes)
            && std::fs::metadata(self.dest(file)).is_ok_and(|m| m.is_file() && m.len() == file.bytes)
    }

    /// Các file của gói chưa có (hay còn bản cũ).
    pub fn missing<'a>(&self, pack: &'a TtsPack) -> Vec<&'a TtsFile> {
        pack.files.iter().filter(|f| !self.is_installed(f)).collect()
    }

    /// Việc tải cho một file; `keep_part`: giữ ở `*.part` tới khi cả gói đủ ([`Self::commit`]).
    pub fn job(&self, file: &TtsFile, url: reqwest::Url) -> FileJob {
        FileJob {
            url,
            dest: self.dest(file),
            bytes: file.bytes,
            sha256: file.sha256.clone(),
            keep_part: true,
        }
    }

    pub fn part(&self, file: &TtsFile) -> PathBuf {
        part_path(&self.dest(file), &file.sha256)
    }

    /// Số byte còn phải tải, trừ phần dở đã có.
    pub fn remaining_bytes(&self, pack: &TtsPack) -> u64 {
        self.missing(pack)
            .iter()
            .map(|f| {
                let part = std::fs::metadata(self.part(f)).map(|m| m.len()).unwrap_or(0);
                f.bytes.saturating_sub(part.min(f.bytes))
            })
            .sum()
    }

    /// Đổi tên mọi phần dở đã đủ thành file chính thức rồi ghi bản ghi. Cả gói đổi tên cùng lúc để `crate::tts::locate_files`
    /// không bao giờ thấy một gói nửa cũ nửa mới ở lần tải trọn gói đầu tiên.
    pub fn commit(&self, files: &[&TtsFile]) -> std::io::Result<()> {
        for file in files {
            let dest = self.dest(file);
            if let Some(dir) = dest.parent() {
                std::fs::create_dir_all(dir)?;
            }
            std::fs::rename(self.part(file), &dest)?;
        }
        let mut list = self.records();
        list.retain(|r| !files.iter().any(|f| f.path == r.path));
        list.extend(files.iter().map(|f| Record {
            path: f.path.clone(),
            sha256: f.sha256.clone(),
            bytes: f.bytes,
        }));
        self.save(&list)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::store::tests::temp;

    fn file(path: &str, bytes: u64) -> TtsFile {
        TtsFile {
            path: path.into(),
            url: format!("tts/{path}"),
            bytes,
            sha256: "ab".repeat(32),
        }
    }

    fn pack(files: Vec<TtsFile>) -> TtsPack {
        TtsPack {
            id: "vieneu".into(),
            version: "1".into(),
            license_id: "Apache-2.0".into(),
            min_app_version: "0.1.0".into(),
            files,
        }
    }

    #[test]
    fn nested_paths_map_under_the_tts_dir() {
        let t = temp("tts-dest");
        let store = TtsStore::new(&t.0);
        let f = file("moss-codec/sub/a.bin", 3);
        assert_eq!(
            store.dest(&f),
            t.0.join("tts").join("moss-codec").join("sub").join("a.bin")
        );
        assert!(
            store
                .part(&f)
                .starts_with(t.0.join("tts").join("moss-codec").join("sub"))
        );
        assert!(store.part(&f).to_string_lossy().ends_with(".part"));
    }

    /// Chỉ vào `installed.json` sau khi cả gói đổi tên xong; thiếu file, sai kích thước hay bản ghi cũ thì còn "thiếu".
    #[test]
    fn a_file_counts_only_after_commit_and_while_it_keeps_its_size() {
        let t = temp("tts-commit");
        let store = TtsStore::new(&t.0);
        let (a, b) = (file("a.bin", 3), file("dir/b.bin", 2));
        let p = pack(vec![a.clone(), b.clone()]);
        assert_eq!(store.missing(&p).len(), 2);
        std::fs::create_dir_all(store.part(&b).parent().unwrap()).unwrap();
        std::fs::write(store.part(&a), b"abc").unwrap();
        std::fs::write(store.part(&b), b"xy").unwrap();
        assert_eq!(store.remaining_bytes(&p), 0, "phần dở đã đủ");
        assert_eq!(store.missing(&p).len(), 2, "chưa commit thì chưa có");
        store.commit(&[&a, &b]).unwrap();
        assert!(store.missing(&p).is_empty());
        assert_eq!(std::fs::read(store.dest(&b)).unwrap(), b"xy");
        assert!(!store.part(&a).exists(), "phần dở đã đổi tên");
        // Sai kích thước trên đĩa: coi như thiếu.
        std::fs::write(store.dest(&a), b"a").unwrap();
        assert_eq!(store.missing(&p), vec![&a]);
        // Manifest đổi bản (SHA-256 khác): file cũ thành thiếu, bản ghi của file kia giữ nguyên.
        let mut newer = pack(vec![file("a.bin", 3), b.clone()]);
        newer.files[0].sha256 = "cd".repeat(32);
        let ok_b = &newer.files[1];
        assert!(store.is_installed(ok_b));
        assert_eq!(store.missing(&newer).len(), 1, "chỉ a.bin (đổi bản)");
    }

    #[test]
    fn remaining_bytes_subtracts_partial_downloads() {
        let t = temp("tts-remaining");
        let store = TtsStore::new(&t.0);
        let a = file("a.bin", 10);
        let p = pack(vec![a.clone(), file("b.bin", 5)]);
        std::fs::create_dir_all(store.root()).unwrap();
        std::fs::write(store.part(&a), b"1234").unwrap();
        assert_eq!(store.remaining_bytes(&p), 6 + 5);
    }

    #[test]
    fn a_broken_installed_json_means_nothing_is_installed() {
        let t = temp("tts-broken");
        let store = TtsStore::new(&t.0);
        std::fs::create_dir_all(store.root()).unwrap();
        std::fs::write(store.root().join("installed.json"), b"{khong phai json").unwrap();
        let a = file("a.bin", 1);
        std::fs::write(store.dest(&a), b"a").unwrap();
        assert!(!store.is_installed(&a));
    }
}
