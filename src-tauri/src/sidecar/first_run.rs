//! "Lần đầu chạy một binary mới" (spec §6.5): sau khi cài hoặc cập nhật, macOS kiểm tra binary khoảng 15 giây trước khi nó
//! chạy. App nhớ SHA-256 của các binary đã từng chạy tới `Ready` (file `sidecars-seen.json` trong thư mục dữ liệu); binary
//! có băm chưa gặp là lần đầu: chờ lâu hơn, không tính là lỗi, giao diện báo "Đang chuẩn bị lần đầu".

use std::path::Path;

pub fn is_first_run(seen_file: &Path, hash: &str) -> bool {
    !read(seen_file).iter().any(|h| h == hash)
}

pub fn mark_seen(seen_file: &Path, hash: &str) -> std::io::Result<()> {
    let mut seen = read(seen_file);
    if seen.iter().any(|h| h == hash) {
        return Ok(());
    }
    seen.push(hash.to_string());
    // Chỉ giữ vài bản gần nhất: mỗi lần cập nhật app có binary mới.
    let excess = seen.len().saturating_sub(8);
    seen.drain(..excess);
    if let Some(dir) = seen_file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(seen_file, serde_json::to_string(&seen)?)
}

fn read(seen_file: &Path) -> Vec<String> {
    std::fs::read_to_string(seen_file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_binary_is_new_until_it_has_run_once() {
        let dir = std::env::temp_dir().join(format!("mt-first-run-{}", std::process::id()));
        let file = dir.join("sub/sidecars-seen.json");
        assert!(is_first_run(&file, "aaa"));
        mark_seen(&file, "aaa").unwrap();
        assert!(!is_first_run(&file, "aaa"));
        assert!(is_first_run(&file, "bbb"), "bản cập nhật có băm mới");
        for i in 0..10 {
            mark_seen(&file, &format!("h{i}")).unwrap();
        }
        assert!(is_first_run(&file, "aaa"), "chỉ nhớ 8 bản gần nhất");
        assert!(!is_first_run(&file, "h9"));
        std::fs::write(&file, "hỏng").unwrap();
        assert!(is_first_run(&file, "h9"), "file hỏng thì coi như chưa gặp");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
