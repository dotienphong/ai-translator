//! Sổ khôi phục (spec 2026-11-02-nghe-dich-truc-tiep §4): mỗi phiên đã bị hạ ghi (id, pid, exe, âm lượng gốc, âm lượng đã đặt)
//! ra đĩa **trước khi** đổi, để app sập giữa chừng vẫn trả được ở lần mở sau. Đọc hỏng, cụt, rỗng hay không có file đều là
//! "không có mục nào", không bao giờ lỗi.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Entry {
    pub id: String,
    pub pid: u32,
    pub exe: String,
    pub original: f32,
    pub applied: f32,
    /// Lúc ghi (giây Unix) để bỏ mục quá cũ; sổ của bản đầu không có trường này (`0` = không rõ, không hết hạn).
    #[serde(default)]
    pub since: u64,
}

/// Mục chưa khớp được phiên nào (app đã đóng) được giữ tối đa chừng này: Windows nhớ âm lượng theo app nên lần mở sau còn cần trả.
pub const MAX_AGE_SECS: u64 = 7 * 86_400;

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn is_expired(entry: &Entry, now: u64) -> bool {
    entry.since != 0 && now.saturating_sub(entry.since) > MAX_AGE_SECS
}

#[derive(Serialize, Deserialize)]
struct File {
    version: u32,
    entries: Vec<Entry>,
}

fn tmp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(".tmp");
    path.with_file_name(name)
}

/// Ghi nguyên tử: file tạm rồi đổi tên.
pub fn write(path: &Path, entries: &[Entry]) -> std::io::Result<()> {
    let body = serde_json::to_vec(&File {
        version: VERSION,
        entries: entries.to_vec(),
    })
    .map_err(std::io::Error::other)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = tmp_path(path);
    std::fs::write(&tmp, body)?;
    std::fs::rename(&tmp, path)
}

/// Mục trong sổ; mọi lỗi (không có file, JSON hỏng, sai phiên bản) cho mảng rỗng.
pub fn read(path: &Path) -> Vec<Entry> {
    let Ok(bytes) = std::fs::read(path) else {
        return Vec::new();
    };
    match serde_json::from_slice::<File>(&bytes) {
        Ok(f) if f.version == VERSION => f.entries,
        _ => Vec::new(),
    }
}

/// Xóa sổ; không có file thì thôi.
pub fn remove(path: &Path) {
    let _ = std::fs::remove_file(path);
    let _ = std::fs::remove_file(tmp_path(path));
}
