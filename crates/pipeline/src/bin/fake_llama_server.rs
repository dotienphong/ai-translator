//! `llama-server` giả, chỉ dùng trong test của `pipeline`. Nhận đúng tham số dòng lệnh và API của `llama-server` mà app
//! dùng (§6.5): `/health`, `/tokenize`, `/v1/chat/completions` với `stream: true`, API key trong `LLAMA_API_KEY`.
//!
//! Bản dịch giả: `VI: ` rồi chữ nguồn (phần sau dòng trống cuối cùng của prompt), mỗi từ một gói SSE. Điều khiển bằng biến
//! môi trường:
//! - `FAKE_LLAMA_PLAN`: file kịch bản, mỗi lần chạy lấy dòng đầu như `fake_asr_worker`. Lệnh:
//!   - `ok`; `exit_at_start:<mã>`;
//!   - `crash_on:<n>`: thoát với mã 3 khi nhận request dịch thứ `n` của lần chạy này, không trả lời;
//!   - `ramble`: bản dịch dài gấp 20 lần chữ nguồn (để thử ngưỡng tỉ lệ token);
//!   - `ramble_once`: như `ramble` nhưng chỉ ở request dịch đầu tiên;
//!   - `label`: thêm `Translation: ` vào đầu bản dịch; `quote`: bọc bản dịch trong ngoặc kép;
//!   - `delay_ms:<ms>`: chờ chừng này trước mỗi gói SSE (để test hủy và hàng đợi tất định);
//!   - `stall_after:<n>`: gửi `n` gói chữ rồi ngừng, không đóng kết nối (server treo giữa lúc sinh);
//!   - `oom_at_start`: in ra stderr dòng lỗi hết bộ nhớ của ggml rồi thoát với mã 1, như khi không đủ VRAM để nạp model;
//!   - `leak_key`: in tham số dòng lệnh và `LLAMA_API_KEY=<key>` ra stderr, như một bản server lỡ log khóa;
//!   - `health_delay_ms:<ms>`: `/health` trả 503 (đang nạp model) cho tới chừng này ms sau khi chạy;
//!   - `close_after_stream`: trả bản dịch không kèm `Connection: close` (mặc định HTTP/1.1 là giữ kết nối), rồi đóng kết
//!     nối mà không trả lời request kế tiếp gửi trên đó. Giống `llama-server` b11146: nó đóng kết nối ngay sau mỗi response
//!     stream dù báo `Keep-Alive: timeout=5, max=100`; client gửi request kế tiếp trên kết nối cũ trước khi thấy kết nối
//!     bị đóng thì nhận "connection closed before message completed". Server giả chờ request kế tiếp rồi mới đóng, để
//!     cuộc đua này xảy ra chắc chắn.
//! - `FAKE_LLAMA_LOG`: file ghi nối tiếp các sự kiện (`start ngl=…`, `chat <n> repeat=<p> max=<m>`). Không ghi API key.
//! - `FAKE_LLAMA_KEY_FILE`: file nhận đúng API key, chỉ để test kiểm rằng key không lộ ở chỗ khác.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};

#[derive(Default)]
struct Plan {
    exit_at_start: Option<i32>,
    crash_on: Option<u32>,
    ramble: bool,
    ramble_once: bool,
    label: bool,
    quote: bool,
    delay_ms: u64,
    stall_after: Option<usize>,
    oom_at_start: bool,
    leak_key: bool,
    health_delay_ms: u64,
    close_after_stream: bool,
}

fn next_plan_line() -> String {
    let Some(path) = std::env::var_os("FAKE_LLAMA_PLAN") else {
        return "ok".into();
    };
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines = text.lines();
    let first = lines.next().unwrap_or("ok").to_string();
    let rest: Vec<&str> = lines.collect();
    std::fs::write(&path, rest.join("\n")).expect("ghi lại kịch bản");
    first
}

fn parse(line: &str) -> Plan {
    let mut plan = Plan::default();
    for word in line.split_whitespace() {
        let (key, value) = word.split_once(':').unwrap_or((word, ""));
        match key {
            "ok" => {}
            "exit_at_start" => plan.exit_at_start = value.parse().ok(),
            "crash_on" => plan.crash_on = value.parse().ok(),
            "ramble" => plan.ramble = true,
            "ramble_once" => plan.ramble_once = true,
            "label" => plan.label = true,
            "quote" => plan.quote = true,
            "delay_ms" => plan.delay_ms = value.parse().expect("số ms"),
            "stall_after" => plan.stall_after = value.parse().ok(),
            "oom_at_start" => plan.oom_at_start = true,
            "leak_key" => plan.leak_key = true,
            "health_delay_ms" => plan.health_delay_ms = value.parse().expect("số ms"),
            "close_after_stream" => plan.close_after_stream = true,
            other => panic!("lệnh kịch bản lạ: {other}"),
        }
    }
    plan
}

fn log(line: &str) {
    if let Some(path) = std::env::var_os("FAKE_LLAMA_LOG") {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("mở log giả");
        writeln!(f, "{line}").unwrap();
    }
}

struct HttpRequest {
    method: String,
    path: String,
    authorization: Option<String>,
    body: String,
}

fn read_request(stream: &TcpStream) -> Option<HttpRequest> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let (method, path) = (parts.next()?.to_string(), parts.next()?.to_string());
    let (mut length, mut authorization) = (0usize, None);
    loop {
        let mut header = String::new();
        reader.read_line(&mut header).ok()?;
        let header = header.trim_end();
        if header.is_empty() {
            break;
        }
        let (name, value) = header.split_once(':')?;
        match name.to_ascii_lowercase().as_str() {
            "content-length" => length = value.trim().parse().ok()?,
            "authorization" => authorization = Some(value.trim().to_string()),
            _ => {}
        }
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body).ok()?;
    Some(HttpRequest {
        method,
        path,
        authorization,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
}

fn respond(mut stream: &TcpStream, status: &str, content_type: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

/// Gửi từng gói SSE, chờ `delay_ms` trước mỗi gói; với `stall_after`, ngừng sau chừng đó gói chữ và giữ kết nối.
fn stream_slowly(mut stream: &TcpStream, sse: &str, plan: &Plan) {
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        sse.len()
    );
    for (i, event) in sse.split_inclusive("\n\n").enumerate() {
        if plan.stall_after == Some(i) {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(60));
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(plan.delay_ms));
        if stream
            .write_all(event.as_bytes())
            .and_then(|()| stream.flush())
            .is_err()
        {
            return; // bên gọi đã đóng kết nối (hủy)
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let arg = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let started = std::time::Instant::now();
    let plan = parse(&next_plan_line());
    log(&format!(
        "start ngl={} extra={}",
        arg("-ngl").unwrap_or_default(),
        args.iter()
            .skip_while(|a| *a != "--no-ui")
            .skip(1)
            .cloned()
            .collect::<Vec<_>>()
            .join(" ")
    ));
    if let Some(code) = plan.exit_at_start {
        std::process::exit(code);
    }
    if plan.oom_at_start {
        eprintln!("ggml_backend_metal_buffer_type_alloc_buffer: error: failed to allocate buffer, size = 1100.00 MiB");
        eprintln!("llama_model_load: error loading model: unable to allocate Metal buffer: out of memory");
        std::process::exit(1);
    }
    let key = std::env::var("LLAMA_API_KEY").unwrap_or_default();
    if key.is_empty() {
        eprintln!("thiếu LLAMA_API_KEY");
        std::process::exit(2);
    }
    if let Some(path) = std::env::var_os("FAKE_LLAMA_KEY_FILE") {
        std::fs::write(path, &key).expect("ghi key cho test");
    }
    if plan.leak_key {
        eprintln!("main: argv = {args:?}");
        eprintln!("main: env LLAMA_API_KEY={key}");
    }
    let host = arg("--host").expect("--host");
    let port = arg("--port").expect("--port");
    let listener = TcpListener::bind(format!("{host}:{port}")).expect("mở cổng");
    let mut chats = 0u32;
    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        let Some(req) = read_request(&stream) else { continue };
        if req.method == "GET" && req.path == "/health" {
            if started.elapsed() < std::time::Duration::from_millis(plan.health_delay_ms) {
                respond(
                    &stream,
                    "503 Service Unavailable",
                    "application/json",
                    r#"{"error":"Loading model"}"#,
                );
            } else {
                respond(&stream, "200 OK", "application/json", r#"{"status":"ok"}"#);
            }
            continue;
        }
        if req.authorization.as_deref() != Some(&format!("Bearer {key}")) {
            respond(
                &stream,
                "401 Unauthorized",
                "application/json",
                r#"{"error":"Invalid API Key"}"#,
            );
            continue;
        }
        let body: serde_json::Value = serde_json::from_str(&req.body).unwrap_or_default();
        match req.path.as_str() {
            "/tokenize" => {
                let n = body["content"].as_str().unwrap_or("").split_whitespace().count();
                let tokens: Vec<usize> = (1..=n).collect();
                respond(
                    &stream,
                    "200 OK",
                    "application/json",
                    &serde_json::json!({ "tokens": tokens }).to_string(),
                );
            }
            "/v1/chat/completions" => {
                chats += 1;
                log(&format!(
                    "chat {chats} repeat={} max={}",
                    body["repeat_penalty"], body["max_tokens"]
                ));
                if plan.crash_on == Some(chats) {
                    std::process::exit(3);
                }
                let prompt = body["messages"][0]["content"].as_str().unwrap_or("");
                let source = prompt.rsplit("\n\n").next().unwrap_or("");
                let mut words: Vec<String> = vec!["VI:".into()];
                words.extend(source.split_whitespace().map(String::from));
                if plan.ramble || (plan.ramble_once && chats == 1) {
                    let copy = words.clone();
                    for _ in 0..19 {
                        words.extend(copy.iter().cloned());
                    }
                }
                if plan.quote {
                    words[0] = format!("\"{}", words[0]);
                    let last = words.len() - 1;
                    words[last] = format!("{}\"", words[last]);
                }
                if plan.label {
                    words.insert(0, "Translation:".into());
                }
                let max = body["max_tokens"].as_u64().unwrap_or(512) as usize;
                let finish = if words.len() > max { "length" } else { "stop" };
                words.truncate(max);
                let mut sse = String::new();
                for (i, w) in words.iter().enumerate() {
                    let piece = if i == 0 { w.clone() } else { format!(" {w}") };
                    let chunk = serde_json::json!({ "choices": [{ "index": 0, "delta": { "content": piece } }] });
                    sse.push_str(&format!("data: {chunk}\n\n"));
                }
                let last = serde_json::json!({
                    "choices": [{ "index": 0, "delta": {}, "finish_reason": finish }],
                    "timings": { "predicted_n": words.len() },
                });
                sse.push_str(&format!("data: {last}\n\ndata: [DONE]\n\n"));
                if plan.close_after_stream {
                    let mut s = &stream;
                    let _ = write!(
                        s,
                        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\n\r\n{sse}",
                        sse.len()
                    );
                    // Chờ request kế tiếp trên kết nối này (client đóng kết nối thì thôi chờ), rồi đóng mà không trả lời.
                    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                    if let Some(next) = read_request(&stream) {
                        log(&format!("dropped {}", next.path));
                    }
                } else if plan.delay_ms == 0 && plan.stall_after.is_none() {
                    respond(&stream, "200 OK", "text/event-stream", &sse);
                } else {
                    stream_slowly(&stream, &sse, &plan);
                }
            }
            _ => respond(&stream, "404 Not Found", "text/plain", "không có"),
        }
    }
}
