//! Tải một file model (spec §6.7, §9): HTTP Range để tải tiếp, ghi ra `*.part`, kiểm SHA-256 rồi mới đổi tên thành file
//! chính thức.
//!
//! - File tạm tên `<file>.<16 ký tự đầu của sha256>.part`: bản mới của cùng file (sha khác) không bao giờ tải tiếp trên
//!   phần dở của bản cũ.
//! - Tải tiếp: gửi `Range: bytes=<độ dài phần dở>-`. Server trả `206` đúng chỗ thì ghi nối; trả `200` (bỏ qua `Range`)
//!   thì ghi lại từ đầu; `Content-Range` lệch hay `416` thì xóa phần dở, lần thử sau tải lại từ đầu.
//! - SHA-256 tính dần trong lúc ghi; trạng thái băm giữ qua các lần thử, nên rớt mạng không phải băm lại phần đã có.
//! - Thử lại 3 lần khi lỗi mạng, lỗi HTTP hay sai SHA-256 (§9). Rớt mạng mà phần dở dài hơn mọi lần trước thì đếm lại
//!   từ đầu: mạng chập chờn mà vẫn tiến thì không bỏ cuộc giữa file 2 GB; server bỏ qua `Range` rồi lại rớt ở cùng chỗ
//!   thì không được tính là tiến, nên không thử lại mãi. Hết lượt thì báo lỗi, giữ phần dở để tải tiếp sau.
//! - Tạm dừng: luồng tải xem cờ [`Pause`] sau mỗi khối 64 KiB và trong lúc chờ thử lại; dừng thì giữ phần dở. Khi
//!   luồng đang chờ server (kết nối tối đa 15 giây, mỗi lần đọc tối đa 30 giây), tạm dừng có tác dụng sau lần chờ đó.
//! - Không có thời hạn cho cả file (file lớn), chỉ có thời hạn kết nối và thời hạn chờ mỗi lần đọc.
//! - Chỉ theo redirect sang `https` (tối đa 5 bước). Ngoại lệ duy nhất: chuỗi bắt đầu ở `http` tới máy này (server thử
//!   của test, `AT_MODELS_URL` của bản dev) thì được đi tiếp `http` tới máy này.

use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::{CONTENT_RANGE, RANGE};
use reqwest::{StatusCode, Url};
use sha2::{Digest, Sha256};

/// User-Agent chung, không mang thông tin của người dùng hay máy.
pub const USER_AGENT: &str = concat!("AI-Translator/", env!("CARGO_PKG_VERSION"));
const CHUNK: usize = 64 * 1024;
/// Số redirect tối đa trong một request.
pub const MAX_REDIRECTS: usize = 5;

/// URL tới chính máy này (`127.0.0.1`, `localhost`, `[::1]`).
pub fn is_loopback(url: &Url) -> bool {
    matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
}

/// Có theo redirect tới `next` không, khi chuỗi bắt đầu ở `first` và đây là bước thứ `hops` (bước đầu là 1: `reqwest`
/// đưa URL đang xét vào danh sách trước khi hỏi). Tối đa [`MAX_REDIRECTS`] bước (spec §6.7). Không bao giờ hạ từ
/// `https` xuống `http`.
pub fn redirect_allowed(first: &Url, next: &Url, hops: usize) -> bool {
    let local_http = first.scheme() == "http" && is_loopback(first) && next.scheme() == "http" && is_loopback(next);
    hops <= MAX_REDIRECTS && (next.scheme() == "https" || local_http)
}

/// Client HTTP cho manifest và model: proxy và chứng chỉ của hệ điều hành; redirect theo [`redirect_allowed`].
pub fn client() -> reqwest::Result<Client> {
    let policy = reqwest::redirect::Policy::custom(|attempt| {
        let first = attempt.previous().first().cloned();
        let hops = attempt.previous().len();
        match first {
            Some(first) if redirect_allowed(&first, attempt.url(), hops) => attempt.follow(),
            _ => attempt.error("redirect bị từ chối: chỉ theo redirect sang https"),
        }
    });
    Client::builder()
        .redirect(policy)
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(15))
        // Client đồng bộ: thời hạn này áp cho từng lần chờ (gửi request, mỗi lần đọc thân), không cho cả file.
        .timeout(Duration::from_secs(30))
        .build()
}

/// Một file cần tải.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileJob {
    pub url: Url,
    /// Đường dẫn file chính thức.
    pub dest: PathBuf,
    pub bytes: u64,
    pub sha256: String,
    /// Tải xong và đúng SHA-256 thì để nguyên ở `*.part`, không đổi tên thành `dest`: người gọi đổi tên mọi file của một
    /// lần tải cùng lúc, khi tất cả đã đủ (N-4 của review cuối 04). Lần tải sau thấy phần dở đã đủ thì chỉ băm lại.
    pub keep_part: bool,
}

impl FileJob {
    pub fn part(&self) -> PathBuf {
        part_path(&self.dest, &self.sha256)
    }
}

/// File tạm của bản `sha256` của file `dest`.
pub fn part_path(dest: &Path, sha256: &str) -> PathBuf {
    let name = dest
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let tag = sha256.get(..16).unwrap_or(sha256);
    dest.with_file_name(format!("{name}.{tag}.part"))
}

/// Cờ tạm dừng, dùng chung giữa luồng tải và lệnh của giao diện.
#[derive(Debug, Default)]
pub struct Pause(AtomicBool);

impl Pause {
    pub fn request(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn clear(&self) {
        self.0.store(false, Ordering::SeqCst);
    }

    pub fn requested(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum DownloadError {
    #[error("đã tạm dừng")]
    Paused,
    #[error("server trả HTTP {0}")]
    Http(u16),
    #[error("lỗi mạng: {0}")]
    Network(String),
    #[error("sai SHA-256")]
    Checksum,
    #[error("server gửi nhiều hơn kích thước trong manifest")]
    TooLong,
    #[error("không ghi được file: {0}")]
    Io(String),
}

impl DownloadError {
    fn retryable(&self) -> bool {
        !matches!(self, Self::Paused | Self::Io(_))
    }
}

/// Số lần thử lại và thời gian chờ trước mỗi lần.
#[derive(Clone, Debug)]
pub struct Retry {
    pub retries: u32,
    pub backoff: Vec<Duration>,
}

impl Default for Retry {
    fn default() -> Self {
        Self {
            retries: 3,
            backoff: [1, 5, 15].map(Duration::from_secs).to_vec(),
        }
    }
}

/// Băm của phần dở đã đọc: (độ dài, trạng thái băm).
type Hashed = Option<(u64, Sha256)>;

fn io(e: std::io::Error) -> DownloadError {
    DownloadError::Io(e.to_string())
}

fn hex(digest: &[u8]) -> String {
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Mở phần dở, cắt nếu dài hơn file, và lấy trạng thái băm của nó (dùng lại `cache` nếu còn đúng độ dài).
fn open_part(job: &FileJob, cache: &mut Hashed) -> Result<(File, u64, Sha256), DownloadError> {
    let path = job.part();
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&path)
        .map_err(io)?;
    let mut len = file.metadata().map_err(io)?.len();
    if len > job.bytes {
        file.set_len(0).map_err(io)?;
        len = 0;
    }
    let hasher = match cache.take() {
        Some((cached, hasher)) if cached == len => hasher,
        _ => {
            let mut hasher = Sha256::new();
            let mut buf = vec![0u8; CHUNK];
            file.seek(SeekFrom::Start(0)).map_err(io)?;
            let mut left = len;
            while left > 0 {
                let n = file.read(&mut buf).map_err(io)?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
                left = left.saturating_sub(n as u64);
            }
            hasher
        }
    };
    file.seek(SeekFrom::End(0)).map_err(io)?;
    Ok((file, len, hasher))
}

fn restart(file: &mut File, cache: &mut Hashed) -> Result<(), DownloadError> {
    file.set_len(0).map_err(io)?;
    file.seek(SeekFrom::Start(0)).map_err(io)?;
    *cache = None;
    Ok(())
}

/// Một lần thử: tải tiếp từ cuối phần dở.
fn attempt(
    client: &Client,
    job: &FileJob,
    pause: &Pause,
    cache: &mut Hashed,
    on_progress: &mut dyn FnMut(u64),
) -> Result<(), DownloadError> {
    (|| {
        let (mut file, mut len, mut hasher) = open_part(job, cache)?;
        if len < job.bytes {
            let mut request = client.get(job.url.clone());
            if len > 0 {
                request = request.header(RANGE, format!("bytes={len}-"));
            }
            let mut response = request.send().map_err(|e| DownloadError::Network(e.to_string()))?;
            match response.status() {
                StatusCode::PARTIAL_CONTENT => {
                    let starts_at = response
                        .headers()
                        .get(CONTENT_RANGE)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.strip_prefix("bytes "))
                        .and_then(|v| v.split('-').next())
                        .and_then(|v| v.parse::<u64>().ok());
                    if starts_at != Some(len) {
                        restart(&mut file, cache)?;
                        return Err(DownloadError::Network(format!("Content-Range lệch: {starts_at:?}")));
                    }
                }
                StatusCode::OK => {
                    restart(&mut file, cache)?;
                    len = 0;
                    hasher = Sha256::new();
                }
                status => {
                    if status == StatusCode::RANGE_NOT_SATISFIABLE {
                        restart(&mut file, cache)?;
                    }
                    *cache = Some((len, hasher));
                    return Err(DownloadError::Http(status.as_u16()));
                }
            }
            let mut buf = vec![0u8; CHUNK];
            loop {
                if pause.requested() {
                    file.flush().map_err(io)?;
                    *cache = Some((len, hasher));
                    return Err(DownloadError::Paused);
                }
                let n = match response.read(&mut buf) {
                    Ok(n) => n,
                    Err(e) => {
                        *cache = Some((len, hasher));
                        return Err(DownloadError::Network(e.to_string()));
                    }
                };
                if n == 0 {
                    break;
                }
                if len + n as u64 > job.bytes {
                    restart(&mut file, cache)?;
                    return Err(DownloadError::TooLong);
                }
                file.write_all(&buf[..n]).map_err(io)?;
                hasher.update(&buf[..n]);
                len += n as u64;
                on_progress(len);
            }
            if len < job.bytes {
                *cache = Some((len, hasher));
                return Err(DownloadError::Network("kết nối đóng trước khi đủ dữ liệu".into()));
            }
        }
        file.sync_all().map_err(io)?;
        drop(file);
        if hex(&hasher.finalize()) != job.sha256 {
            *cache = None;
            let _ = std::fs::remove_file(job.part());
            return Err(DownloadError::Checksum);
        }
        if !job.keep_part {
            std::fs::rename(job.part(), &job.dest).map_err(io)?;
        }
        Ok(())
    })()
}

/// Tải một file, thử lại theo `retry`. `sleep` chờ trước mỗi lần thử lại; trả `false` nếu bị tạm dừng trong lúc chờ.
pub fn download(
    client: &Client,
    job: &FileJob,
    pause: &Pause,
    retry: &Retry,
    sleep: &mut dyn FnMut(Duration) -> bool,
    on_progress: &mut dyn FnMut(u64),
) -> Result<(), DownloadError> {
    let part_len = || std::fs::metadata(job.part()).map(|m| m.len()).unwrap_or(0);
    let mut cache: Hashed = None;
    let mut failures = 0u32;
    // Phần dở dài nhất từng có: rớt mạng chỉ được tính là tiến khi vượt mức này.
    let mut best = part_len();
    loop {
        let result = attempt(client, job, pause, &mut cache, on_progress);
        let error = match result {
            Ok(()) => return Ok(()),
            Err(e) if !e.retryable() => return Err(e),
            Err(e) => e,
        };
        // Phần dở dài hơn mọi lần trước (rớt mạng giữa chừng): đếm lại. Sai SHA-256, gửi quá kích thước, `Content-Range`
        // lệch hay `416` đều xóa phần dở, lỗi HTTP khác không ghi gì, nên những lần đó luôn bị tính.
        let now = part_len();
        let progressed = now > best;
        best = best.max(now);
        failures = if progressed { 1 } else { failures + 1 };
        if failures > retry.retries {
            return Err(error);
        }
        log::warn!("tải {} lỗi ({error}), thử lại lần {failures}", job.url);
        let wait = retry
            .backoff
            .get(failures as usize - 1)
            .or(retry.backoff.last())
            .copied()
            .unwrap_or_default();
        if !sleep(wait) {
            return Err(DownloadError::Paused);
        }
    }
}

/// Chờ `wait`, xem cờ tạm dừng mỗi 100 ms.
pub fn sleep_unless_paused(pause: &Pause, wait: Duration) -> bool {
    let step = Duration::from_millis(100);
    let mut left = wait;
    while !left.is_zero() {
        if pause.requested() {
            return false;
        }
        let d = left.min(step);
        std::thread::sleep(d);
        left -= d;
    }
    !pause.requested()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::test_http::{FakeServer, Fault};

    struct Temp(PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn temp(name: &str) -> Temp {
        let dir = std::env::temp_dir().join(format!("mt-download-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Temp(dir)
    }

    /// 300 KiB không lặp lại, để `Corrupt` và tải tiếp ở giữa khối đều thấy được.
    fn content() -> Vec<u8> {
        (0..300 * 1024u32)
            .map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8)
            .collect()
    }

    fn setup(name: &str) -> (Temp, FakeServer, FileJob, Vec<u8>) {
        let t = temp(name);
        let server = FakeServer::start();
        let bytes = content();
        server.put("m/model.bin", &bytes);
        let job = FileJob {
            url: server.url("m/model.bin"),
            dest: t.0.join("model.bin"),
            bytes: bytes.len() as u64,
            sha256: hex(&Sha256::digest(&bytes)),
            keep_part: false,
        };
        (t, server, job, bytes)
    }

    /// Không chờ thật; ghi lại các lần chờ.
    fn run(
        job: &FileJob,
        pause: &Pause,
        waits: &mut Vec<Duration>,
        progress: &mut Vec<u64>,
    ) -> Result<(), DownloadError> {
        let client = client().unwrap();
        download(
            &client,
            job,
            pause,
            &Retry::default(),
            &mut |d| {
                waits.push(d);
                // Vòng thử lại không dừng (code đếm sai "có tiến triển") thì dừng như bấm Tạm dừng: test đỏ thay vì treo.
                waits.len() < 50
            },
            &mut |n| progress.push(n),
        )
    }

    fn ranges(server: &FakeServer) -> Vec<Option<String>> {
        server.requests().into_iter().map(|r| r.range).collect()
    }

    #[test]
    fn downloads_verifies_and_renames() {
        let (_t, server, job, bytes) = setup("fresh");
        let (mut waits, mut progress) = (Vec::new(), Vec::new());
        run(&job, &Pause::default(), &mut waits, &mut progress).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert!(!job.part().exists(), "không còn file .part");
        assert!(waits.is_empty());
        assert_eq!(progress.last(), Some(&job.bytes));
        assert!(progress.windows(2).all(|w| w[0] < w[1]));
        let requests = server.requests();
        assert_eq!(ranges(&server), [None]);
        assert!(requests[0].user_agent.as_deref().unwrap().starts_with("AI-Translator/"));
        assert_eq!(requests[0].path, "/m/model.bin");
    }

    #[test]
    fn the_part_file_is_named_after_the_sha256() {
        let job = FileJob {
            url: Url::parse("https://x.example/a.bin").unwrap(),
            dest: PathBuf::from("/m/a.bin"),
            bytes: 1,
            sha256: "0123456789abcdef".repeat(4),
            keep_part: false,
        };
        assert_eq!(job.part(), PathBuf::from("/m/a.bin.0123456789abcdef.part"));
    }

    /// N-4 của review cuối 04: `keep_part` để file đã đủ và đúng SHA-256 ở `*.part`; lần sau chỉ băm lại, không tải lại.
    #[test]
    fn a_kept_part_is_verified_but_not_renamed() {
        let (_t, server, job, bytes) = setup("keep");
        let job = FileJob { keep_part: true, ..job };
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert!(!job.dest.exists());
        assert_eq!(std::fs::read(job.part()).unwrap(), bytes);
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(server.requests().len(), 1, "phần dở đã đủ thì không tải lại");
    }

    /// Rớt mạng giữa chừng: lần thử sau gửi `Range` từ chỗ đã có, không tải lại từ đầu.
    #[test]
    fn a_dropped_connection_resumes_with_range() {
        let (_t, server, job, bytes) = setup("drop");
        server.fault(Fault::DropAfter(100_000));
        let (mut waits, mut progress) = (Vec::new(), Vec::new());
        run(&job, &Pause::default(), &mut waits, &mut progress).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [None, Some("bytes=100000-".into())]);
        assert_eq!(waits, [Duration::from_secs(1)]);
    }

    /// Phần dở từ lần chạy trước (tạm dừng, tắt app): tải tiếp từ cuối phần dở.
    #[test]
    fn an_existing_part_is_continued() {
        let (_t, server, job, bytes) = setup("part");
        std::fs::write(job.part(), &bytes[..3_000]).unwrap();
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [Some("bytes=3000-".into())]);
    }

    #[test]
    fn a_server_ignoring_range_restarts_from_zero() {
        let (_t, server, job, bytes) = setup("ignore");
        std::fs::write(job.part(), &bytes[..3_000]).unwrap();
        server.fault(Fault::IgnoreRange);
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [Some("bytes=3000-".into())]);
    }

    /// `206` mà `Content-Range` không bắt đầu đúng chỗ phần dở kết thúc: không ghi nối, lần sau tải lại từ đầu.
    #[test]
    fn a_partial_response_at_the_wrong_offset_restarts() {
        let (_t, server, job, bytes) = setup("wrongrange");
        std::fs::write(job.part(), &bytes[..3_000]).unwrap();
        server.fault(Fault::WrongRange);
        let mut waits = Vec::new();
        run(&job, &Pause::default(), &mut waits, &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [Some("bytes=3000-".into()), None]);
        assert_eq!(waits.len(), 1);
    }

    /// `416` cho phần dở: xóa phần dở, lần sau tải lại từ đầu (không gửi lại đúng `Range` cũ).
    #[test]
    fn range_not_satisfiable_restarts_from_zero() {
        let (_t, server, job, bytes) = setup("416");
        std::fs::write(job.part(), &bytes[..3_000]).unwrap();
        server.fault(Fault::Status(416));
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [Some("bytes=3000-".into()), None]);
    }

    /// Proxy bỏ qua `Range` rồi cắt kết nối ở cùng một chỗ: không tiến thêm, nên vẫn bỏ cuộc sau 3 lần thử lại.
    #[test]
    fn restarting_and_dropping_at_the_same_place_is_not_progress() {
        let (_t, server, job, _) = setup("noprogress");
        for _ in 0..10 {
            server.fault(Fault::IgnoreRangeDropAfter(50_000));
        }
        let result = run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new());
        assert!(matches!(result, Err(DownloadError::Network(_))), "{result:?}");
        assert_eq!(server.requests().len(), 4);
    }

    /// Q1 của review 04: không bao giờ theo redirect từ `https` xuống `http`; `http` chỉ được đi tiếp tới máy này khi
    /// chuỗi bắt đầu ở máy này.
    #[test]
    fn redirects_never_downgrade_to_http() {
        let url = |s: &str| Url::parse(s).unwrap();
        let cdn = url("https://cdn.example/models.json");
        assert!(redirect_allowed(&cdn, &url("https://r2.example/x.bin"), 1));
        assert!(!redirect_allowed(&cdn, &url("http://r2.example/x.bin"), 1));
        assert!(!redirect_allowed(&cdn, &url("http://127.0.0.1:9000/x.bin"), 1));
        let local = url("http://127.0.0.1:9000/models.json");
        assert!(redirect_allowed(&local, &url("http://localhost:9000/x.bin"), 1));
        assert!(redirect_allowed(&local, &url("https://cdn.example/x.bin"), 1));
        assert!(!redirect_allowed(&local, &url("http://cdn.example/x.bin"), 1));
        assert!(redirect_allowed(&cdn, &url("https://r2.example/x.bin"), MAX_REDIRECTS));
        assert!(!redirect_allowed(
            &cdn,
            &url("https://r2.example/x.bin"),
            MAX_REDIRECTS + 1
        ));
    }

    #[test]
    fn a_redirect_to_http_elsewhere_is_refused() {
        let (_t, server, job, bytes) = setup("redirect");
        server.fault(Fault::Redirect("/m/model.bin"));
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(server.requests().len(), 2, "theo redirect tới chính máy này");
        let (_t, server, job, _) = setup("redirect-out");
        for _ in 0..4 {
            server.fault(Fault::Redirect("http://192.0.2.1/m/model.bin"));
        }
        let result = run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new());
        assert!(
            matches!(&result, Err(DownloadError::Network(e)) if e.contains("redirect")),
            "{result:?}"
        );
        assert!(!job.dest.exists());
    }

    /// Phần dở hỏng mà đủ độ dài: sai SHA-256, xóa, tải lại từ đầu.
    #[test]
    fn a_full_but_wrong_part_is_downloaded_again() {
        let (_t, server, job, bytes) = setup("wrongpart");
        std::fs::write(job.part(), vec![0u8; bytes.len()]).unwrap();
        let mut waits = Vec::new();
        run(&job, &Pause::default(), &mut waits, &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [None], "lần đầu không cần request");
        assert_eq!(waits.len(), 1);
    }

    /// §9: sai SHA-256 thì thử lại; hỏng mãi thì báo lỗi, không để lại file nào.
    #[test]
    fn a_wrong_sha256_is_retried_then_reported() {
        let (_t, server, job, bytes) = setup("corrupt");
        server.fault(Fault::Corrupt);
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        let (_t, server, job, _) = setup("corrupt4");
        for _ in 0..4 {
            server.fault(Fault::Corrupt);
        }
        let mut waits = Vec::new();
        assert_eq!(
            run(&job, &Pause::default(), &mut waits, &mut Vec::new()),
            Err(DownloadError::Checksum)
        );
        assert!(!job.dest.exists() && !job.part().exists());
        assert_eq!(server.requests().len(), 4, "một lần đầu và 3 lần thử lại");
        assert_eq!(waits, [1, 5, 15].map(Duration::from_secs));
    }

    #[test]
    fn http_errors_are_retried_three_times() {
        let (_t, server, job, _) = setup("http");
        for _ in 0..4 {
            server.fault(Fault::Status(503));
        }
        assert_eq!(
            run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()),
            Err(DownloadError::Http(503))
        );
        assert_eq!(server.requests().len(), 4);
        let (_t, server, job, bytes) = setup("http404");
        server.put("m/model.bin", &bytes);
        let missing = FileJob {
            url: server.url("m/khong-co.bin"),
            ..job
        };
        assert_eq!(
            run(&missing, &Pause::default(), &mut Vec::new(), &mut Vec::new()),
            Err(DownloadError::Http(404))
        );
    }

    /// Mạng chập chờn nhưng mỗi lần vẫn nhận thêm dữ liệu: rớt 5 lần vẫn tải xong.
    #[test]
    fn progress_resets_the_retry_count() {
        let (_t, server, job, bytes) = setup("flaky");
        for _ in 0..5 {
            server.fault(Fault::DropAfter(40_000));
        }
        run(&job, &Pause::default(), &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(server.requests().len(), 6);
    }

    #[test]
    fn pause_keeps_the_part_and_resume_continues() {
        let (_t, server, job, bytes) = setup("pause");
        let pause = Pause::default();
        let client = client().unwrap();
        let result = download(&client, &job, &pause, &Retry::default(), &mut |_| true, &mut |n| {
            if n >= 100_000 {
                pause.request();
            }
        });
        assert_eq!(result, Err(DownloadError::Paused));
        let kept = std::fs::metadata(job.part()).unwrap().len();
        assert!((100_000..job.bytes).contains(&kept), "{kept}");
        assert!(!job.dest.exists());
        pause.clear();
        run(&job, &pause, &mut Vec::new(), &mut Vec::new()).unwrap();
        assert_eq!(std::fs::read(&job.dest).unwrap(), bytes);
        assert_eq!(ranges(&server), [None, Some(format!("bytes={kept}-"))]);
    }

    #[test]
    fn pausing_while_waiting_to_retry_stops() {
        let (_t, server, job, _) = setup("pausewait");
        server.fault(Fault::Status(500));
        let client = client().unwrap();
        let result = download(
            &client,
            &job,
            &Pause::default(),
            &Retry::default(),
            &mut |_| false,
            &mut |_| {},
        );
        assert_eq!(result, Err(DownloadError::Paused));
        let pause = Pause::default();
        pause.request();
        assert!(!sleep_unless_paused(&pause, Duration::from_secs(60)));
        pause.clear();
        assert!(sleep_unless_paused(&pause, Duration::from_millis(1)));
    }

    /// Server gửi nhiều hơn kích thước ghi trong manifest: dừng ngay, không ghi quá.
    #[test]
    fn more_bytes_than_the_manifest_says_is_an_error() {
        let (_t, server, job, _) = setup("long");
        let short = FileJob {
            bytes: 1_000,
            ..job.clone()
        };
        assert_eq!(
            run(&short, &Pause::default(), &mut Vec::new(), &mut Vec::new()),
            Err(DownloadError::TooLong)
        );
        assert!(std::fs::metadata(short.part()).unwrap().len() <= 1_000);
        assert_eq!(server.requests().len(), 4);
    }
}
