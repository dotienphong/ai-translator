//! Kho model trên máy (spec §6.7, §9): thư mục `models` trong `app_local_data_dir`, nằm ngoài thư mục cài đặt.
//!
//! - File model, LICENSE và NOTICE đặt cạnh nhau, tên theo trường `file` của manifest; phần đang tải là `*.part`.
//! - `manifest.json`: nguyên văn manifest đã ký được nhận gần nhất. Đọc lại thì kiểm chữ ký lại; hỏng thì coi như
//!   chưa có.
//! - `installed.json`: các file đã tải xong và đúng SHA-256 (`id`, `file`, `sha256`, `bytes`, `version`). Một file
//!   chỉ vào đây sau khi kiểm SHA-256 và đổi tên xong.
//! - `state.json`: lần kiểm manifest gần nhất (để kiểm tối đa mỗi ngày một lần) và bản manifest người dùng đã bấm
//!   "Để sau".
//! - Lúc bắt đầu phiên chỉ kiểm file có và đúng kích thước theo `installed.json` (§9); SHA-256 đầy đủ kiểm sau khi tải
//!   xong và khi nạp model lỗi ([`Store::verify_pack`]).
//! - File của gói vẫn dùng được khi manifest mới có bản khác của nó (cùng `id`, khác `sha256`): đó là bản cập nhật đang
//!   chờ người dùng đồng ý tải.

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::download::{FileJob, part_path};
use super::manifest::{FileEntry, Kind, Manifest, is_safe_file_name};
use super::signed::{self, Signed, TrustedKey};
use crate::sidecar::integrity::sha256_file;
use crate::sidecar::paths::ModelFiles;

pub const MANIFEST: &str = "manifest.json";
const INSTALLED: &str = "installed.json";
const STATE: &str = "state.json";

/// Một file đã tải xong và đúng SHA-256.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Installed {
    pub id: String,
    pub file: String,
    pub sha256: String,
    pub bytes: u64,
    pub version: String,
}

impl Installed {
    pub fn from_entry(entry: &FileEntry) -> Self {
        Self {
            id: entry.id.clone(),
            file: entry.file.clone(),
            sha256: entry.sha256.clone(),
            bytes: entry.bytes,
            version: entry.version.clone(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoreState {
    /// Lần kiểm manifest thành công gần nhất (giây Unix).
    #[serde(default)]
    pub last_check: Option<u64>,
    /// Người dùng đã bấm "Để sau" với bản cập nhật của manifest này.
    #[serde(default)]
    pub dismissed_sequence: u64,
}

/// Tình trạng một gói trên máy.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PackStatus {
    /// Mọi file của gói đã có (có thể là bản cũ hơn manifest): dùng được.
    pub usable: bool,
    /// Mọi file của gói đã có đúng bản trong manifest.
    pub complete: bool,
    /// Số byte còn phải tải để gói `complete` (kể cả bản cập nhật), chưa trừ phần dở.
    pub missing_bytes: u64,
    /// Số byte đã có trong các file `*.part` của gói.
    pub partial_bytes: u64,
}

/// File model thiếu (`Missing`) hay sai kích thước (`Broken`) lúc bắt đầu phiên.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum ResolveError {
    #[error("chưa tải {0}")]
    Missing(String),
    #[error("{0} sai kích thước")]
    Broken(String),
}

pub struct Store {
    dir: PathBuf,
}

/// Ghi file mới rồi đổi tên đè lên file cũ, để tắt app giữa chừng không để lại file JSON dở.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    let mut file = std::fs::File::create(&tmp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    std::fs::rename(tmp, path)
}

impl Store {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn path(&self, file: &str) -> PathBuf {
        self.dir.join(file)
    }

    fn ensure_dir(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.dir)
    }

    /// Manifest đã nhận gần nhất, kiểm chữ ký lại bằng `keys`.
    pub fn load_manifest(&self, keys: &[TrustedKey]) -> Option<Signed> {
        let bytes = std::fs::read(self.path(MANIFEST)).ok()?;
        match signed::verify(&bytes, keys) {
            Ok(signed) => Some(signed),
            Err(e) => {
                log::warn!("bỏ manifest đã lưu: {e}");
                None
            }
        }
    }

    pub fn save_manifest(&self, raw: &[u8]) -> std::io::Result<()> {
        self.ensure_dir()?;
        write_atomic(&self.path(MANIFEST), raw)
    }

    /// Các file đã tải. Bản ghi có tên file không an toàn (file bị sửa tay) bị bỏ qua, vì tên này được dùng làm đường
    /// dẫn để đọc và xóa.
    pub fn installed(&self) -> Vec<Installed> {
        std::fs::read(self.path(INSTALLED))
            .ok()
            .and_then(|b| serde_json::from_slice::<Vec<Installed>>(&b).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|i| is_safe_file_name(&i.file))
            .collect()
    }

    fn save_installed(&self, list: &[Installed]) -> std::io::Result<()> {
        self.ensure_dir()?;
        write_atomic(&self.path(INSTALLED), &serde_json::to_vec_pretty(list)?)
    }

    /// Ghi một file vừa tải xong (thay bản cũ cùng `id`).
    pub fn mark_installed(&self, entry: &FileEntry) -> std::io::Result<()> {
        let mut list = self.installed();
        list.retain(|i| i.id != entry.id);
        list.push(Installed::from_entry(entry));
        self.save_installed(&list)
    }

    /// Bỏ các file khỏi danh sách đã tải (file trên đĩa không đụng tới).
    pub fn forget(&self, ids: &[String]) -> std::io::Result<()> {
        let mut list = self.installed();
        list.retain(|i| !ids.contains(&i.id));
        self.save_installed(&list)
    }

    pub fn state(&self) -> StoreState {
        std::fs::read(self.path(STATE))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn save_state(&self, state: &StoreState) -> std::io::Result<()> {
        self.ensure_dir()?;
        write_atomic(&self.path(STATE), &serde_json::to_vec_pretty(state)?)
    }

    /// Bản đã tải của file có `id`, nếu file còn trên đĩa và đúng kích thước đã ghi.
    fn present(&self, list: &[Installed], id: &str) -> Option<Installed> {
        list.iter()
            .find(|i| i.id == id)
            .filter(|i| std::fs::metadata(self.path(&i.file)).is_ok_and(|m| m.len() == i.bytes))
            .cloned()
    }

    /// File đã có đúng bản này trong manifest.
    pub fn is_installed(&self, entry: &FileEntry) -> bool {
        self.present(&self.installed(), &entry.id)
            .is_some_and(|i| i.sha256 == entry.sha256)
    }

    /// Việc tải một file vào kho này.
    pub fn job(&self, entry: &FileEntry, url: reqwest::Url) -> FileJob {
        FileJob {
            url,
            dest: self.path(&entry.file),
            bytes: entry.bytes,
            sha256: entry.sha256.clone(),
            keep_part: false,
        }
    }

    /// File tạm khi đang tải bản này của file.
    pub fn part(&self, entry: &FileEntry) -> PathBuf {
        part_path(&self.path(&entry.file), &entry.sha256)
    }

    fn part_len(&self, entry: &FileEntry) -> u64 {
        std::fs::metadata(self.part(entry)).map(|m| m.len()).unwrap_or(0)
    }

    pub fn pack_status(&self, manifest: &Manifest, pack: &str) -> PackStatus {
        let list = self.installed();
        let files = manifest.files_of(pack);
        let mut status = PackStatus {
            usable: !files.is_empty(),
            complete: !files.is_empty(),
            ..PackStatus::default()
        };
        for entry in files {
            match self.present(&list, &entry.id) {
                Some(i) if i.sha256 == entry.sha256 => {}
                Some(_) => {
                    status.complete = false;
                    status.missing_bytes += entry.bytes;
                    status.partial_bytes += self.part_len(entry);
                }
                None => {
                    status.usable = false;
                    status.complete = false;
                    status.missing_bytes += entry.bytes;
                    status.partial_bytes += self.part_len(entry);
                }
            }
        }
        status
    }

    /// File model của gói để chạy phiên (§9: chỉ kiểm có file và đúng kích thước).
    pub fn resolve(&self, manifest: &Manifest, pack: &str) -> Result<ModelFiles, ResolveError> {
        let list = self.installed();
        let pick = |kind: Kind| -> Result<PathBuf, ResolveError> {
            let entry = manifest
                .files_of(pack)
                .into_iter()
                .find(|f| f.kind == kind)
                .ok_or_else(|| ResolveError::Missing(format!("{pack}/{kind:?}")))?;
            let record = list
                .iter()
                .find(|i| i.id == entry.id)
                .ok_or_else(|| ResolveError::Missing(entry.file.clone()))?;
            let path = self.path(&record.file);
            match std::fs::metadata(&path) {
                Ok(m) if m.len() == record.bytes => Ok(path),
                Ok(_) => Err(ResolveError::Broken(record.file.clone())),
                Err(_) => Err(ResolveError::Missing(record.file.clone())),
            }
        };
        Ok(ModelFiles {
            asr: pick(Kind::Asr)?,
            mt: pick(Kind::Mt)?,
            vad: pick(Kind::Vad)?,
        })
    }

    /// Băm lại đầy đủ các file đã tải của gói (khi nạp model lỗi, §9). File sai SHA-256 bị xóa khỏi danh sách đã tải và
    /// khỏi đĩa, để gói hiện "chưa tải" và người dùng tải lại. Trả `id` các file hỏng.
    pub fn verify_pack(&self, manifest: &Manifest, pack: &str) -> Vec<String> {
        let list = self.installed();
        let mut broken = Vec::new();
        for entry in manifest.files_of(pack) {
            let Some(record) = list.iter().find(|i| i.id == entry.id) else {
                continue;
            };
            let path = self.path(&record.file);
            if sha256_file(&path).ok().as_deref() != Some(record.sha256.as_str()) {
                log::warn!("{} sai SHA-256, cần tải lại", record.file);
                let _ = std::fs::remove_file(&path);
                broken.push(record.id.clone());
            }
        }
        if !broken.is_empty()
            && let Err(e) = self.forget(&broken)
        {
            log::warn!("không ghi được {INSTALLED}: {e}");
        }
        broken
    }

    /// Xóa các file của gói, trừ file còn dùng chung với gói trong `keep` (VAD, giấy phép). Phần dở cũng xóa.
    pub fn delete_pack(&self, manifest: &Manifest, pack: &str, keep: &[&str]) -> std::io::Result<()> {
        let shared: HashSet<&str> = keep
            .iter()
            .filter(|k| **k != pack)
            .flat_map(|k| manifest.files_of(k))
            .map(|f| f.id.as_str())
            .collect();
        let doomed: Vec<String> = manifest
            .files_of(pack)
            .into_iter()
            .filter(|f| !shared.contains(f.id.as_str()))
            .map(|f| f.id.clone())
            .collect();
        let list = self.installed();
        for entry in manifest.files_of(pack) {
            if !doomed.contains(&entry.id) {
                continue;
            }
            for name in list.iter().filter(|i| i.id == entry.id).map(|i| i.file.clone()) {
                remove_if_exists(&self.path(&name))?;
            }
            remove_if_exists(&self.path(&entry.file))?;
            remove_if_exists(&self.part(entry))?;
        }
        self.forget(&doomed)
    }

    /// Xóa cả thư mục model ("Xóa model và dữ liệu", A6).
    pub fn delete_all(&self) -> std::io::Result<()> {
        match std::fs::remove_dir_all(&self.dir) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }

    /// Dọn file không còn ai dùng: model bản cũ sau khi cập nhật, phần dở của bản không còn trong manifest. Chỉ gọi khi
    /// không tiến trình phụ nào đang mở model.
    pub fn cleanup(&self, manifest: &Manifest) -> std::io::Result<()> {
        let list = self.installed();
        let mut keep: HashSet<String> = [MANIFEST, INSTALLED, STATE].map(String::from).into();
        keep.extend(list.iter().map(|i| i.file.clone()));
        for entry in &manifest.files {
            if let Some(name) = self.part(entry).file_name() {
                keep.insert(name.to_string_lossy().into_owned());
            }
        }
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return Ok(());
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.path().is_file() && !keep.contains(&name) {
                log::info!("xóa file model không còn dùng: {name}");
                remove_if_exists(&entry.path())?;
            }
        }
        Ok(())
    }

    /// Tổng dung lượng các file trong thư mục model.
    pub fn used_bytes(&self) -> u64 {
        std::fs::read_dir(&self.dir)
            .map(|entries| {
                entries
                    .flatten()
                    .filter_map(|e| e.metadata().ok())
                    .filter(|m| m.is_file())
                    .map(|m| m.len())
                    .sum()
            })
            .unwrap_or(0)
    }
}

fn remove_if_exists(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::models::manifest::tests::sample;
    use crate::models::signed::tests::{signed_with_test_key, test_keys};
    use serde_json::Value;
    use sha2::{Digest, Sha256};

    pub(crate) struct Temp(pub PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    pub(crate) fn temp(name: &str) -> Temp {
        let dir = std::env::temp_dir().join(format!("mt-store-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        Temp(dir)
    }

    /// Nội dung giả của một file model, theo `id` (cùng `id` thì cùng nội dung).
    pub(crate) fn content(id: &str, bytes: u64) -> Vec<u8> {
        (0..bytes)
            .map(|i| (i as u8) ^ id.len() as u8 ^ id.as_bytes()[0])
            .collect()
    }

    /// Manifest mẫu với `bytes` và `sha256` khớp [`content`].
    pub(crate) fn real_sample() -> Value {
        let mut value = sample();
        for f in value["files"].as_array_mut().unwrap() {
            let bytes = f["bytes"].as_u64().unwrap();
            let sha = Sha256::digest(content(f["id"].as_str().unwrap(), bytes));
            f["sha256"] = Value::String(sha.iter().map(|b| format!("{b:02x}")).collect());
        }
        value
    }

    fn manifest(value: &Value) -> Manifest {
        Manifest::parse(&serde_json::to_vec(value).unwrap()).unwrap()
    }

    /// Đặt file của gói vào kho như đã tải xong.
    pub(crate) fn install(store: &Store, m: &Manifest, pack: &str) {
        std::fs::create_dir_all(store.dir()).unwrap();
        for f in m.files_of(pack) {
            std::fs::write(store.path(&f.file), content(&f.id, f.bytes)).unwrap();
            store.mark_installed(f).unwrap();
        }
    }

    #[test]
    fn the_saved_manifest_is_verified_again_on_load() {
        let t = temp("manifest");
        let store = Store::new(&t.0);
        assert!(store.load_manifest(&test_keys()).is_none());
        let raw = signed_with_test_key(&sample());
        store.save_manifest(&raw).unwrap();
        assert_eq!(store.load_manifest(&test_keys()).unwrap().manifest.sequence, 3);
        assert!(store.load_manifest(&test_keys()[1..]).is_none(), "khóa khác");
        let mut tampered = raw.clone();
        let at = tampered.len() / 2;
        tampered[at] ^= 1;
        std::fs::write(store.path(MANIFEST), tampered).unwrap();
        assert!(store.load_manifest(&test_keys()).is_none(), "file đã lưu bị sửa");
    }

    #[test]
    fn pack_status_follows_installed_files() {
        let t = temp("status");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        let lite = store.pack_status(&m, "lite");
        assert!(!lite.usable && !lite.complete);
        assert_eq!(lite.missing_bytes, m.pack_bytes("lite"));
        install(&store, &m, "lite");
        let lite = store.pack_status(&m, "lite");
        assert!(lite.usable && lite.complete);
        assert_eq!(lite.missing_bytes, 0);
        // File đã ghi là đã tải mà sai kích thước (bị cắt): không còn tính là có.
        let q4 = t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf");
        let full = std::fs::read(&q4).unwrap();
        std::fs::write(&q4, &full[..10]).unwrap();
        assert!(!store.pack_status(&m, "lite").usable);
        std::fs::write(&q4, &full).unwrap();
        let standard = store.pack_status(&m, "standard");
        assert!(!standard.usable);
        assert_eq!(standard.missing_bytes, 500 + 1900, "VAD và giấy phép dùng chung đã có");
        // Phần dở của file Q8_0.
        let q8 = m.files.iter().find(|f| f.id == "hy-mt2-q8").unwrap();
        std::fs::write(store.part(q8), [0u8; 700]).unwrap();
        assert_eq!(store.pack_status(&m, "standard").partial_bytes, 700);
    }

    /// §9: lúc bắt đầu phiên chỉ kiểm có file và đúng kích thước.
    #[test]
    fn resolve_checks_presence_and_size() {
        let t = temp("resolve");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        assert_eq!(
            store.resolve(&m, "lite"),
            Err(ResolveError::Missing("ggml-small-q5_1.bin".into()))
        );
        install(&store, &m, "lite");
        let files = store.resolve(&m, "lite").unwrap();
        assert_eq!(files.asr, t.0.join("ggml-small-q5_1.bin"));
        assert_eq!(files.mt, t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf"));
        assert_eq!(files.vad, t.0.join("silero_vad_v6.2.3.onnx"));
        std::fs::write(t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf"), b"ngan").unwrap();
        assert_eq!(
            store.resolve(&m, "lite"),
            Err(ResolveError::Broken("Hy-MT2-1.8B-Q4_K_M.gguf".into()))
        );
        std::fs::remove_file(t.0.join("silero_vad_v6.2.3.onnx")).unwrap();
        install(&store, &m, "lite");
        std::fs::remove_file(t.0.join("silero_vad_v6.2.3.onnx")).unwrap();
        assert_eq!(
            store.resolve(&m, "lite"),
            Err(ResolveError::Missing("silero_vad_v6.2.3.onnx".into()))
        );
    }

    /// Manifest mới có bản khác của một file: gói vẫn dùng được bản cũ, và cần tải phần khác.
    #[test]
    fn a_newer_manifest_leaves_the_pack_usable_with_an_update_pending() {
        let t = temp("update");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        install(&store, &m, "lite");
        let mut newer = real_sample();
        newer["sequence"] = 4.into();
        newer["files"][3]["sha256"] = "cd".repeat(32).into();
        newer["files"][3]["version"] = "2".into();
        let newer = manifest(&newer);
        let status = store.pack_status(&newer, "lite");
        assert!(status.usable && !status.complete);
        assert_eq!(status.missing_bytes, 1100);
        assert!(store.resolve(&newer, "lite").is_ok());
        assert!(!store.is_installed(&newer.files[3]));
        assert!(store.is_installed(&newer.files[1]));
    }

    #[test]
    fn verify_pack_drops_files_with_a_wrong_sha256() {
        let t = temp("verify");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        install(&store, &m, "lite");
        assert!(store.verify_pack(&m, "lite").is_empty());
        let mut q4 = std::fs::read(t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf")).unwrap();
        q4[10] ^= 1;
        std::fs::write(t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf"), q4).unwrap();
        assert_eq!(store.verify_pack(&m, "lite"), ["hy-mt2-q4"]);
        assert!(!t.0.join("Hy-MT2-1.8B-Q4_K_M.gguf").exists());
        assert!(
            store.installed().iter().all(|i| i.id != "hy-mt2-q4"),
            "bỏ khỏi installed.json"
        );
        assert!(!store.pack_status(&m, "lite").usable);
        assert_eq!(store.pack_status(&m, "lite").missing_bytes, 1100);
    }

    #[test]
    fn deleting_a_pack_keeps_files_shared_with_another() {
        let t = temp("delete");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        install(&store, &m, "lite");
        install(&store, &m, "standard");
        let q8 = m.files.iter().find(|f| f.id == "hy-mt2-q8").unwrap();
        let part = store.part(q8);
        std::fs::write(&part, b"do").unwrap();
        store.delete_pack(&m, "standard", &["lite"]).unwrap();
        assert!(store.pack_status(&m, "lite").complete);
        assert!(!store.pack_status(&m, "standard").usable);
        assert!(!t.0.join("ggml-large-v3-turbo-q5_0.bin").exists());
        assert!(!part.exists());
        assert!(t.0.join("silero_vad_v6.2.3.onnx").exists());
        store.delete_pack(&m, "lite", &[]).unwrap();
        assert!(store.installed().is_empty());
        assert!(!t.0.join("silero_vad_v6.2.3.onnx").exists());
        store.save_manifest(b"{}").unwrap();
        store.delete_all().unwrap();
        assert!(!t.0.exists());
        store.delete_all().unwrap();
    }

    #[test]
    fn cleanup_removes_old_versions_and_stale_parts() {
        let t = temp("cleanup");
        let store = Store::new(&t.0);
        let m = manifest(&real_sample());
        install(&store, &m, "lite");
        store.save_state(&StoreState::default()).unwrap();
        std::fs::write(t.0.join("Hy-MT2-1.8B-Q4_K_M-cu.gguf"), b"ban cu").unwrap();
        std::fs::write(t.0.join("x.bin.0000000000000000.part"), b"do dang").unwrap();
        let q8 = m.files.iter().find(|f| f.id == "hy-mt2-q8").unwrap();
        let current = store.part(q8);
        std::fs::write(&current, b"dang tai").unwrap();
        let before = store.used_bytes();
        store.cleanup(&m).unwrap();
        assert!(!t.0.join("Hy-MT2-1.8B-Q4_K_M-cu.gguf").exists());
        assert!(!t.0.join("x.bin.0000000000000000.part").exists());
        assert!(current.exists(), "phần dở của bản đang có trong manifest");
        assert!(store.pack_status(&m, "lite").complete);
        assert!(t.0.join("state.json").exists());
        assert!(store.used_bytes() < before);
    }

    #[test]
    fn state_round_trips_and_survives_garbage() {
        let t = temp("state");
        let store = Store::new(&t.0);
        assert_eq!(store.state(), StoreState::default());
        let state = StoreState {
            last_check: Some(1_790_000_000),
            dismissed_sequence: 4,
        };
        store.save_state(&state).unwrap();
        assert_eq!(store.state(), state);
        std::fs::write(t.0.join("state.json"), "hỏng").unwrap();
        assert_eq!(store.state(), StoreState::default());
        std::fs::write(t.0.join("installed.json"), "hỏng").unwrap();
        assert!(store.installed().is_empty());
        let unsafe_record = serde_json::json!([
            { "id": "a", "file": "../ngoai.bin", "sha256": "ab".repeat(32), "bytes": 1, "version": "1" },
            { "id": "b", "file": "b.bin", "sha256": "ab".repeat(32), "bytes": 1, "version": "1" }
        ]);
        std::fs::write(t.0.join("installed.json"), unsafe_record.to_string()).unwrap();
        let ids: Vec<String> = store.installed().into_iter().map(|i| i.id).collect();
        assert_eq!(ids, ["b"], "tên file không an toàn bị bỏ qua");
    }
}
