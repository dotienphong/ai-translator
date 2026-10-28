//! Dấu các app mà bộ đọc đã bật `AXEnhancedUserInterface` (spec §6.2, §6.8; QĐ 8 của kế hoạch 04): ghi trước khi bật, xóa sau khi
//! trả, để lần chạy sau (worker, hay app lúc mở) trả lại nếu worker bị giết giữa chừng. File JSON nhỏ (`EuiMarker` của giao thức),
//! ghi qua file tạm rồi đổi tên. Không có tên người; lỗi chỉ ghi loại lỗi (đường dẫn có tên thư mục người dùng).

use std::io;
use std::path::Path;

use speaker_protocol::{EuiEntry, EuiMarker};

/// Các mục trong file; không có file hay file hỏng thì rỗng.
pub fn read(path: &Path) -> Vec<EuiEntry> {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<EuiMarker>(&b).ok())
        .map(|m| m.entries)
        .unwrap_or_default()
}

fn write(path: &Path, entries: &[EuiEntry]) -> io::Result<()> {
    if entries.is_empty() {
        return match std::fs::remove_file(path) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        };
    }
    let body = serde_json::to_vec(&EuiMarker {
        entries: entries.to_vec(),
    })
    .map_err(io::Error::other)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, body)?;
    std::fs::rename(&tmp, path)
}

pub fn add(path: &Path, entry: EuiEntry) -> io::Result<()> {
    let mut entries = read(path);
    if !entries.contains(&entry) {
        entries.push(entry);
    }
    write(path, &entries)
}

pub fn remove(path: &Path, pid: i32) -> io::Result<()> {
    let mut entries = read(path);
    entries.retain(|e| e.pid != pid);
    write(path, &entries)
}

/// Kết quả đọc `AXEnhancedUserInterface` của app trong một mục dấu (rà soát lần 3): đang bật; đọc được mà không phải bật (`false`,
/// hay không có giá trị Boolean); không đọc được (app họp treo quá hạn chờ 0,2 s, mã -25204, hay lỗi khác).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EuiRead {
    On,
    NotOn,
    Unknown,
}

impl EuiRead {
    /// Từ giá trị đã đọc được (`None`: không có giá trị Boolean).
    pub fn from_value(v: Option<bool>) -> Self {
        if v == Some(true) { Self::On } else { Self::NotOn }
    }
}

/// Việc với một mục dấu, theo lần đọc trước khi trả. App (`speaker::eui_macos`) dùng cùng luật.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EuiStep {
    /// Đang bật: đặt lại `false` rồi đọc lại ([`reset_done`]).
    Reset,
    /// Không phải bật: mục xong việc, bỏ khỏi dấu, không đặt gì.
    Drop,
    /// Không đọc được: giữ mục để lần sau thử lại, không đặt gì.
    Keep,
}

pub fn step_for(read: EuiRead) -> EuiStep {
    match read {
        EuiRead::On => EuiStep::Reset,
        EuiRead::NotOn => EuiStep::Drop,
        EuiRead::Unknown => EuiStep::Keep,
    }
}

/// Sau khi đặt `false`: đọc lại thấy không phải bật thì xong (bỏ mục); còn bật hay không đọc được thì giữ mục.
pub fn reset_done(after: EuiRead) -> bool {
    after == EuiRead::NotOn
}

#[cfg(test)]
mod tests {
    use super::*;
    use speaker_protocol::MeetingApp;

    #[test]
    fn entries_are_added_once_and_the_file_goes_when_empty() {
        let dir = std::env::temp_dir().join(format!("eui-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("speaker-eui.json");
        let teams = EuiEntry {
            pid: 42,
            app: MeetingApp::Teams,
        };
        let chrome = EuiEntry {
            pid: 7,
            app: MeetingApp::MeetChrome,
        };
        assert!(read(&path).is_empty(), "chưa có file");
        add(&path, teams).unwrap();
        add(&path, teams).unwrap();
        add(&path, chrome).unwrap();
        assert_eq!(read(&path), [teams, chrome]);
        remove(&path, 42).unwrap();
        assert_eq!(read(&path), [chrome]);
        remove(&path, 7).unwrap();
        assert!(!path.exists(), "hết mục thì xóa file");
        std::fs::write(&path, b"{hong").unwrap();
        assert!(read(&path).is_empty(), "file hỏng: coi như không có");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Rà soát lần 2 B-N-D và lần 3: ba kết quả đọc. Đang bật: đặt lại; đọc được mà không phải bật: bỏ mục, không đặt gì (không đặt
    /// `false` lặp lại mỗi lần chạy, có thể tắt chế độ mà VoiceOver bật sau này); không đọc được (app họp treo quá hạn chờ, lỗi): giữ
    /// mục để lần sau thử lại, không đặt gì.
    #[test]
    fn eui_reads_decide_reset_drop_or_keep() {
        assert_eq!(step_for(EuiRead::On), EuiStep::Reset);
        assert_eq!(step_for(EuiRead::NotOn), EuiStep::Drop);
        assert_eq!(
            step_for(EuiRead::Unknown),
            EuiStep::Keep,
            "app treo quá hạn chờ: giữ mục"
        );
        assert_eq!(EuiRead::from_value(Some(true)), EuiRead::On);
        assert_eq!(EuiRead::from_value(Some(false)), EuiRead::NotOn);
        assert_eq!(EuiRead::from_value(None), EuiRead::NotOn, "không có giá trị Boolean");
        assert!(reset_done(EuiRead::NotOn));
        assert!(
            !reset_done(EuiRead::On) && !reset_done(EuiRead::Unknown),
            "còn bật hay không đọc lại được: giữ mục"
        );
    }
}
