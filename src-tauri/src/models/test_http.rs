//! HTTP server giả cho test tải model (kế hoạch 04): chạy trong test trên `127.0.0.1`, cổng ngẫu nhiên, không cần mạng.
//! Hiểu `Range: bytes=N-`, ghi lại từng request, và giả được lỗi cho các request kế tiếp: rớt mạng giữa chừng, mã lỗi
//! HTTP, server bỏ qua `Range`, dữ liệu hỏng.

use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::{Arc, Mutex};

use reqwest::Url;

/// Lỗi giả cho một request.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fault {
    /// Hứa đủ `Content-Length` nhưng chỉ gửi chừng này byte rồi đóng kết nối (rớt mạng).
    DropAfter(usize),
    /// Trả mã lỗi này, không có nội dung.
    Status(u16),
    /// Bỏ qua `Range`, trả `200` cả file.
    IgnoreRange,
    /// Đổi một byte ở giữa phần gửi đi.
    Corrupt,
    /// Trả `206` từ sau chỗ được hỏi 500 byte, `Content-Range` ghi đúng chỗ bắt đầu thật (server hay proxy lỗi).
    WrongRange,
    /// Bỏ qua `Range`, trả `200` cả file, nhưng rớt sau chừng này byte (proxy cắt kết nối ở cùng một chỗ).
    IgnoreRangeDropAfter(usize),
    /// Trả `302` tới URL này (tương đối hay tuyệt đối).
    Redirect(&'static str),
    /// Gửi thân từng khối 100 byte, nghỉ chừng này mili giây giữa hai khối (mạng chậm, để test kịp tạm dừng).
    Slow(u64),
    /// Trả `200` không có `Content-Length`, thân gửi mãi (tới [`ENDLESS_BYTES`]) cho tới khi client đóng kết nối; số byte
    /// đã gửi được ghi lại (`endless_sent`).
    Endless,
}

/// Lỗi giả `Endless` dừng sau chừng này byte, để một client không giới hạn cũng không làm test treo.
pub const ENDLESS_BYTES: usize = 64 << 20;

/// Một request đã nhận.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Request {
    pub path: String,
    pub range: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Default)]
struct Shared {
    files: HashMap<String, Vec<u8>>,
    faults: VecDeque<Fault>,
    requests: Vec<Request>,
    endless_sent: usize,
}

pub struct FakeServer {
    base: Url,
    shared: Arc<Mutex<Shared>>,
}

impl FakeServer {
    pub fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("mở được cổng");
        let base = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
        let shared = Arc::new(Mutex::new(Shared::default()));
        let state = shared.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let state = state.clone();
                std::thread::spawn(move || serve(stream, &state));
            }
        });
        Self { base, shared }
    }

    /// Đặt nội dung cho đường dẫn `path` (không có `/` đầu).
    pub fn put(&self, path: &str, bytes: &[u8]) {
        self.shared
            .lock()
            .unwrap()
            .files
            .insert(format!("/{path}"), bytes.to_vec());
    }

    /// Lỗi giả cho request kế tiếp (mỗi lần gọi là một request, theo thứ tự).
    pub fn fault(&self, fault: Fault) {
        self.shared.lock().unwrap().faults.push_back(fault);
    }

    pub fn url(&self, path: &str) -> Url {
        self.base.join(path).unwrap()
    }

    pub fn requests(&self) -> Vec<Request> {
        self.shared.lock().unwrap().requests.clone()
    }

    /// Số byte lỗi giả `Endless` đã gửi được trước khi client đóng kết nối.
    pub fn endless_sent(&self) -> usize {
        self.shared.lock().unwrap().endless_sent
    }
}

fn serve(stream: TcpStream, shared: &Mutex<Shared>) {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() {
        return;
    }
    let path = line.split_whitespace().nth(1).unwrap_or("/").to_string();
    let (mut range, mut user_agent) = (None, None);
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).is_err() || header.trim().is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            match name.trim().to_ascii_lowercase().as_str() {
                "range" => range = Some(value.trim().to_string()),
                "user-agent" => user_agent = Some(value.trim().to_string()),
                _ => {}
            }
        }
    }
    let (file, fault) = {
        let mut s = shared.lock().unwrap();
        s.requests.push(Request {
            path: path.clone(),
            range: range.clone(),
            user_agent,
        });
        (s.files.get(&path).cloned(), s.faults.pop_front())
    };
    let mut out = stream;
    let head = |status: &str, extra: &str, len: usize| {
        format!("HTTP/1.1 {status}\r\nContent-Length: {len}\r\n{extra}Connection: close\r\n\r\n")
    };
    let Some(file) = file else {
        let _ = out.write_all(head("404 Not Found", "", 0).as_bytes());
        return;
    };
    if fault == Some(Fault::Endless) {
        let _ = out.write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n");
        let chunk = vec![b' '; 64 * 1024];
        let mut sent = 0;
        while sent < ENDLESS_BYTES && out.write_all(&chunk).is_ok() {
            sent += chunk.len();
        }
        shared.lock().unwrap().endless_sent = sent;
        return;
    }
    if let Some(Fault::Redirect(to)) = fault {
        let _ = out.write_all(head("302 Found", &format!("Location: {to}\r\n"), 0).as_bytes());
        return;
    }
    if let Some(Fault::Status(code)) = fault {
        let _ = out.write_all(head(&format!("{code} Fake"), "", 0).as_bytes());
        return;
    }
    if fault == Some(Fault::WrongRange) {
        let n = range
            .as_deref()
            .and_then(|r| r.strip_prefix("bytes=")?.strip_suffix('-')?.parse::<usize>().ok())
            .unwrap_or(0);
        let skip = (n + 500).min(file.len() - 1);
        let extra = format!("Content-Range: bytes {skip}-{}/{}\r\n", file.len() - 1, file.len());
        let _ = out.write_all(head("206 Partial Content", &extra, file.len() - skip).as_bytes());
        let _ = out.write_all(&file[skip..]);
        let _ = out.shutdown(Shutdown::Both);
        return;
    }
    let ignore = matches!(fault, Some(Fault::IgnoreRange | Fault::IgnoreRangeDropAfter(_)));
    let start = match &range {
        Some(r) if !ignore => r
            .strip_prefix("bytes=")
            .and_then(|r| r.strip_suffix('-'))
            .and_then(|n| n.parse::<usize>().ok()),
        _ => None,
    };
    let (status, extra, body) = match start {
        Some(n) if n >= file.len() => {
            let extra = format!("Content-Range: bytes */{}\r\n", file.len());
            let _ = out.write_all(head("416 Range Not Satisfiable", &extra, 0).as_bytes());
            return;
        }
        Some(n) => (
            "206 Partial Content",
            format!("Content-Range: bytes {n}-{}/{}\r\n", file.len() - 1, file.len()),
            file[n..].to_vec(),
        ),
        None => ("200 OK", String::new(), file),
    };
    let mut body = body;
    if fault == Some(Fault::Corrupt) && !body.is_empty() {
        let mid = body.len() / 2;
        body[mid] ^= 0xff;
    }
    let _ = out.write_all(head(status, &extra, body.len()).as_bytes());
    let send = match fault {
        Some(Fault::DropAfter(n) | Fault::IgnoreRangeDropAfter(n)) => &body[..n.min(body.len())],
        _ => &body[..],
    };
    if let Some(Fault::Slow(ms)) = fault {
        for chunk in send.chunks(100) {
            if out.write_all(chunk).and_then(|()| out.flush()).is_err() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(ms));
        }
    } else {
        let _ = out.write_all(send);
    }
    let _ = out.flush();
    let _ = out.shutdown(Shutdown::Both);
}
