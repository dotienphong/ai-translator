//! File log của tiến trình phụ (spec §6.4, "Việc cho MVP"): mở ở chế độ append để giữ log của lần chạy trước khi tiến
//! trình phụ khởi động lại (log crash), và xoay vòng để file không lớn mãi.
//!
//! Log của tiến trình phụ là stderr của `asr-worker` và `llama-server`: whisper.cpp, llama.cpp và ggml ghi thông số model,
//! thiết bị và lỗi, không ghi âm thanh hay nội dung chép lời. App chỉ ghi vào đây qua tiến trình phụ.
//!
//! stderr đi qua một pipe tới luồng [`pump`] của app, không đi thẳng vào file. Nhờ vậy app xoay file cả khi tiến trình phụ
//! đang chạy, che các chuỗi bí mật (API key của `llama-server`) nếu tiến trình phụ lỡ in ra, và giữ vài dòng cuối để
//! phân loại lỗi khi tiến trình phụ khởi động hỏng (hết bộ nhớ, lỗi GPU).

use std::collections::VecDeque;
use std::fs::{File, OpenOptions};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

/// Mỗi file tối đa 1 MB, giữ 3 file cũ (`.1` mới nhất tới `.3` cũ nhất), giống cách xoay log của app (kế hoạch 01, QĐ14).
pub const MAX_BYTES: u64 = 1_000_000;
pub const KEEP: usize = 3;
/// Số dòng cuối giữ trong RAM để phân loại lỗi.
pub const TAIL_LINES: usize = 20;
/// Chuỗi thay cho bí mật trong log.
pub const REDACTED: &str = "<ẩn>";
/// Mỗi dòng stderr giữ tối đa chừng này byte; phần sau bị bỏ, để một tiến trình phụ in một dòng dài vô tận không làm
/// app hết bộ nhớ.
pub const MAX_LINE_BYTES: usize = 64 * 1024;
/// Ghi thêm vào cuối dòng bị cắt.
pub const CUT_MARK: &str = " …(dòng dài quá 64 KiB, phần sau đã bỏ)";

fn rotated(path: &Path, n: usize) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(format!(".{n}"));
    PathBuf::from(name)
}

/// Đổi `path` thành `path.1`, các file cũ lùi một số, file thứ `keep + 1` bị xóa.
fn shift(path: &Path, keep: usize) -> io::Result<()> {
    let _ = std::fs::remove_file(rotated(path, keep));
    for n in (1..keep).rev() {
        let from = rotated(path, n);
        if from.exists() {
            std::fs::rename(&from, rotated(path, n + 1))?;
        }
    }
    std::fs::rename(path, rotated(path, 1))
}

/// File log xoay vòng: ghi nối tiếp, và trước khi một dòng làm file vượt `max_bytes` thì xoay. Một dòng dài hơn
/// `max_bytes` vẫn được ghi trọn vào một file mới.
pub struct RotatingLog {
    path: PathBuf,
    max_bytes: u64,
    keep: usize,
    file: Option<File>,
    size: u64,
}

impl RotatingLog {
    /// Mở `path` để ghi nối tiếp; file đã lớn hơn `max_bytes` thì xoay trước.
    pub fn open(path: &Path, max_bytes: u64, keep: usize) -> io::Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut log = Self {
            path: path.to_path_buf(),
            max_bytes,
            keep,
            file: None,
            size: std::fs::metadata(path).map(|m| m.len()).unwrap_or(0),
        };
        if log.size > max_bytes {
            log.rotate()?;
        }
        log.reopen()?;
        Ok(log)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn reopen(&mut self) -> io::Result<()> {
        self.file = Some(OpenOptions::new().create(true).append(true).open(&self.path)?);
        self.size = std::fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0);
        Ok(())
    }

    /// Đóng file trước khi đổi tên: Windows không cho đổi tên file đang mở.
    fn rotate(&mut self) -> io::Result<()> {
        self.file = None;
        if self.keep == 0 {
            std::fs::remove_file(&self.path).or_else(|e| match e.kind() {
                io::ErrorKind::NotFound => Ok(()),
                _ => Err(e),
            })?;
        } else if self.path.exists() {
            shift(&self.path, self.keep)?;
        }
        self.size = 0;
        Ok(())
    }

    pub fn write_line(&mut self, line: &[u8]) -> io::Result<()> {
        let len = line.len() as u64;
        if self.size > 0 && self.size + len > self.max_bytes {
            // Xoay hỏng (ví dụ người dùng đang mở file trên Windows) thì ghi tiếp vào file cũ.
            let rotated = self.rotate();
            self.reopen()?;
            rotated?;
        }
        if self.file.is_none() {
            self.reopen()?;
        }
        let file = self.file.as_mut().expect("vừa mở");
        file.write_all(line)?;
        self.size += len;
        Ok(())
    }
}

/// Vài dòng cuối của stderr một tiến trình phụ, đã che bí mật.
#[derive(Clone, Default)]
pub struct Tail(Arc<Mutex<VecDeque<String>>>);

impl Tail {
    pub fn lines(&self) -> Vec<String> {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .cloned()
            .collect()
    }

    fn push(&self, line: String) {
        let mut q = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if q.len() == TAIL_LINES {
            q.pop_front();
        }
        q.push_back(line);
    }
}

/// Luồng đọc stderr của tiến trình phụ từng dòng tới khi gặp EOF (tiến trình phụ thoát): che mọi chuỗi trong `secrets`,
/// ghi vào `log`, giữ [`TAIL_LINES`] dòng cuối. Ghi file lỗi thì vẫn đọc tiếp, để pipe không đầy làm tiến trình phụ treo.
pub fn pump(source: impl Read + Send + 'static, mut log: RotatingLog, secrets: Vec<String>) -> (JoinHandle<()>, Tail) {
    let tail = Tail::default();
    let keep = tail.clone();
    let handle = std::thread::spawn(move || {
        let mut reader = BufReader::new(source);
        let mut buf = Vec::new();
        let mut warned = false;
        // Dòng bị cắt thì bỏ thêm chừng này byte ở cuối phần giữ lại, để không còn sót nửa đầu của một bí mật nằm vắt qua
        // chỗ cắt (bí mật trọn vẹn trong phần giữ lại vẫn được che như thường).
        let longest_secret = secrets.iter().map(String::len).max().unwrap_or(0);
        loop {
            buf.clear();
            match (&mut reader).take(MAX_LINE_BYTES as u64).read_until(b'\n', &mut buf) {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
            let cut = buf.len() == MAX_LINE_BYTES && buf.last() != Some(&b'\n');
            if cut {
                skip_line(&mut reader);
                buf.truncate(MAX_LINE_BYTES.saturating_sub(longest_secret));
            }
            let mut line = String::from_utf8_lossy(&buf).into_owned();
            for secret in secrets.iter().filter(|s| !s.is_empty()) {
                if line.contains(secret.as_str()) {
                    line = line.replace(secret.as_str(), REDACTED);
                }
            }
            if cut {
                line.push_str(CUT_MARK);
                line.push('\n');
            }
            if let Err(e) = log.write_line(line.as_bytes())
                && !warned
            {
                warned = true;
                log::warn!("không ghi được {}: {e}", log.path().display());
            }
            keep.push(line.trim_end().to_string());
        }
    });
    (handle, tail)
}

/// Bỏ phần còn lại của dòng hiện tại (tới hết `\n`), không giữ trong RAM.
fn skip_line(reader: &mut impl BufRead) {
    loop {
        let (done, used) = match reader.fill_buf() {
            Ok([]) | Err(_) => return,
            Ok(chunk) => match chunk.iter().position(|&b| b == b'\n') {
                Some(i) => (true, i + 1),
                None => (false, chunk.len()),
            },
        };
        reader.consume(used);
        if done {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn temp(name: &str) -> TempDir {
        let dir = std::env::temp_dir().join(format!("pipeline-logfile-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        TempDir(dir)
    }

    #[test]
    fn a_large_file_is_rotated_on_open() {
        let dir = temp("open");
        let log = dir.0.join("logs/asr-worker.log");
        std::fs::create_dir_all(log.parent().unwrap()).unwrap();
        std::fs::write(&log, [b'x'; 120]).unwrap();
        RotatingLog::open(&log, 100, 2).unwrap().write_line(b"new\n").unwrap();
        assert_eq!(std::fs::read(&log).unwrap(), b"new\n");
        assert_eq!(std::fs::metadata(rotated(&log, 1)).unwrap().len(), 120);
    }

    /// Xoay cả khi đang chạy: một lần chạy dài không làm file vượt giới hạn.
    #[test]
    fn rotates_while_running_and_keeps_only_the_newest_old_files() {
        let dir = temp("running");
        let log = dir.0.join("llama-server.log");
        let mut f = RotatingLog::open(&log, 25, 2).unwrap();
        for round in 1..=4u8 {
            f.write_line(&[b'0' + round; 20]).unwrap();
        }
        assert_eq!(std::fs::read(&log).unwrap(), [b'4'; 20]);
        assert_eq!(std::fs::read(rotated(&log, 1)).unwrap(), [b'3'; 20]);
        assert_eq!(std::fs::read(rotated(&log, 2)).unwrap(), [b'2'; 20]);
        assert!(!rotated(&log, 3).exists(), "chỉ giữ 2 file cũ");
        // Lần mở sau (tiến trình phụ khởi động lại) ghi nối tiếp file đang dở.
        RotatingLog::open(&log, 25, 2).unwrap().write_line(b"5").unwrap();
        assert_eq!(std::fs::metadata(&log).unwrap().len(), 21);
    }

    #[test]
    fn the_pump_redacts_secrets_and_keeps_the_last_lines() {
        let dir = temp("pump");
        let path = dir.0.join("llama-server.log");
        let mut input = String::new();
        for i in 0..30 {
            input.push_str(&format!("line {i}\n"));
        }
        input.push_str("env LLAMA_API_KEY=k3y-s3cr3t, again k3y-s3cr3t\n");
        input.push_str("no newline at the end");
        let log = RotatingLog::open(&path, MAX_BYTES, KEEP).unwrap();
        let (handle, tail) = pump(std::io::Cursor::new(input.into_bytes()), log, vec!["k3y-s3cr3t".into()]);
        handle.join().unwrap();
        let written = std::fs::read_to_string(&path).unwrap();
        assert!(!written.contains("k3y-s3cr3t"), "{written}");
        assert!(written.contains("LLAMA_API_KEY=<ẩn>, again <ẩn>"));
        assert!(written.ends_with("line 29\nenv LLAMA_API_KEY=<ẩn>, again <ẩn>\nno newline at the end"));
        let lines = tail.lines();
        assert_eq!(lines.len(), TAIL_LINES);
        assert_eq!(lines.first().map(String::as_str), Some("line 12"));
        assert_eq!(lines.last().map(String::as_str), Some("no newline at the end"));
    }

    /// Nhỏ của review 02 lần 2: dòng dài quá 64 KiB bị cắt, phần sau bỏ đi; bí mật nằm trọn trong phần giữ lại vẫn được
    /// che, và bí mật vắt qua chỗ cắt (15 byte trước chỗ cắt, dài 21 byte) không sót nửa nào (Q-2 của review 02 lần 3).
    #[test]
    fn a_very_long_line_is_cut_without_leaking_half_a_secret() {
        let dir = temp("long");
        let path = dir.0.join("llama-server.log");
        let secret = "k3y-s3cr3t-0123456789";
        assert_eq!(secret.len(), 21);
        let mut input = format!("api={secret} ");
        input.push_str(&"x".repeat(MAX_LINE_BYTES - 15 - input.len()));
        input.push_str(secret);
        input.push_str(&"y".repeat(3 * MAX_LINE_BYTES));
        input.push_str("\nnext line\n");
        let log = RotatingLog::open(&path, 10 * MAX_BYTES, KEEP).unwrap();
        let (handle, tail) = pump(std::io::Cursor::new(input.into_bytes()), log, vec![secret.into()]);
        handle.join().unwrap();
        let written = std::fs::read_to_string(&path).unwrap();
        let first = written.lines().next().unwrap();
        assert!(first.len() <= MAX_LINE_BYTES + CUT_MARK.len(), "{}", first.len());
        assert!(first.starts_with("api=<ẩn> "), "bí mật trọn vẹn được che");
        assert!(first.ends_with(CUT_MARK));
        assert!(!written.contains("k3y"), "không sót phần nào của bí mật");
        assert!(!written.contains('y'), "phần sau chỗ cắt bị bỏ");
        assert!(written.ends_with("\nnext line\n"));
        assert_eq!(tail.lines().last().map(String::as_str), Some("next line"));
    }
}
