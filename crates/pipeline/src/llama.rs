//! Chạy `llama-server` và gọi `/v1/chat/completions` ở chế độ stream (spec §6.5).
//!
//! - Lệnh chạy theo §6.5: `LLAMA_API_KEY=<ngẫu nhiên> llama-server -m <gguf> --host 127.0.0.1 --port <cổng trống> -c 2048
//!   -np 1 -ngl auto --no-ui`. API key đi qua biến môi trường, chỉ đặt cho tiến trình `llama-server`, không qua tham số
//!   dòng lệnh (hiện ra trong `ps`). Key tạo mới mỗi lần chạy và chỉ nằm trong RAM; không bao giờ vào log hay `Debug`.
//!   stderr của server đi qua `logfile::pump`, có che key, nên server lỡ in key thì `llama-server.log` vẫn không có.
//! - Chạy bằng CPU (§9, chuyển sang CPU): `-ngl 0` thay cho `-ngl auto`. Không bao giờ truyền `-ngl 99`.
//! - Mỗi gói SSE của `llama-server` b11146 chứa đúng một token (đã kiểm lúc lập kế hoạch 02: 24 gói chữ, `predicted_n`
//!   24), nên hậu xử lý đếm gói để đo độ dài bản dịch trong lúc stream.

use crate::logfile;
use crate::process;
use crate::sse::{SseEvent, parse_sse_line};
use anyhow::{Context, Result, bail};
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

/// Tên biến môi trường mang API key (b11146 nhận cả `--api-key` lẫn biến này).
pub const API_KEY_ENV: &str = "LLAMA_API_KEY";

/// Cách chạy một `llama-server`.
#[derive(Clone, Debug)]
pub struct LlamaLaunch {
    pub exe: PathBuf,
    pub model: PathBuf,
    /// stderr của server; mở nối tiếp và xoay vòng cả khi đang chạy (`logfile`).
    pub log: PathBuf,
    /// `false`: chạy bằng CPU (`-ngl 0`).
    pub use_gpu: bool,
    /// Tham số thêm, ví dụ `--no-repack` khi thiếu RAM lúc chạy bằng CPU (§8).
    pub extra_args: Vec<String>,
    /// Chờ `/health` báo sẵn sàng.
    pub ready_timeout: Duration,
    /// Timeout của một request (cả stream).
    pub request_timeout: Duration,
    /// Biến môi trường thêm cho server (test dùng để điều khiển server giả).
    pub env: Vec<(String, String)>,
}

impl LlamaLaunch {
    pub fn new(exe: &Path, model: &Path, log: &Path) -> Self {
        Self {
            exe: exe.to_path_buf(),
            model: model.to_path_buf(),
            log: log.to_path_buf(),
            use_gpu: true,
            extra_args: Vec::new(),
            ready_timeout: Duration::from_secs(180),
            request_timeout: Duration::from_secs(120),
            env: Vec::new(),
        }
    }
}

/// Lệnh chạy theo §6.5. Tách riêng để test kiểm được tham số và biến môi trường mà không cần chạy server.
///
/// **Không bao giờ log lệnh này** (`{cmd:?}`, `log::debug!("{:?}", cmd)`…): `Debug` của `Command` in cả biến môi trường,
/// tức in luôn API key. Thư mục làm việc là thư mục chứa binary, để không thư viện nào được tìm ở thư mục làm việc của app.
pub fn command(launch: &LlamaLaunch, port: u16, api_key: &str) -> Command {
    let mut cmd = Command::new(&launch.exe);
    cmd.arg("-m")
        .arg(&launch.model)
        .args(["--host", "127.0.0.1", "--port", &port.to_string()])
        .args(["-c", "2048", "-np", "1"])
        .args(["-ngl", if launch.use_gpu { "auto" } else { "0" }])
        .arg("--no-ui")
        .args(&launch.extra_args)
        .envs(launch.env.iter().map(|(k, v)| (k, v)))
        .env(API_KEY_ENV, api_key)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    if let Some(dir) = launch.exe.parent().filter(|d| !d.as_os_str().is_empty()) {
        cmd.current_dir(dir);
    }
    process::configure(&mut cmd);
    cmd
}

/// Một request dịch.
#[derive(Clone, Copy, Debug)]
pub struct ChatRequest<'a> {
    pub prompt: &'a str,
    pub max_tokens: u32,
    pub repeat_penalty: f64,
}

/// Kết thúc một stream.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StreamEnd {
    /// Chữ đã nhận, nguyên văn (chưa hậu xử lý).
    pub text: String,
    /// Từ lúc gửi request tới gói đầu có ký tự không phải khoảng trắng; không có chữ nào thì bằng `total_ms`.
    pub first_token_ms: f32,
    pub total_ms: f32,
    /// "stop", hoặc "length" khi chạm `max_tokens` (bản dịch bị cụt). `None` nếu bị hủy giữa chừng.
    pub finish_reason: Option<String>,
    /// `timings.predicted_n` của gói cuối, nếu server gửi.
    pub completion_tokens: Option<usize>,
    /// Số gói có chữ (khác rỗng) đã nhận.
    pub chunks: usize,
    /// Bên gọi dừng stream giữa chừng (`on_delta` trả `Break`).
    pub cancelled: bool,
}

/// Bản dịch đã xong, dạng cũ của Phase 0 (`latency-bench`).
#[derive(Debug, Clone)]
pub struct Translation {
    pub text: String,
    pub first_token_ms: f32,
    pub total_ms: f32,
    pub finish_reason: Option<String>,
}

/// `llama-server` không báo sẵn sàng trong thời gian chờ (khác với chết lúc khởi động). Lần đầu chạy, giám sát không tính
/// lần này là một lần lỗi (§6.5).
#[derive(Debug, thiserror::Error)]
#[error("llama-server không sẵn sàng sau {timeout:?}, xem log {log}")]
pub struct NotReady {
    pub timeout: Duration,
    pub log: String,
}

/// Lỗi khởi động có phải vì quá thời gian chờ `/health` không.
pub fn is_not_ready(e: &anyhow::Error) -> bool {
    e.downcast_ref::<NotReady>().is_some()
}

pub struct LlamaServer {
    child: std::sync::Arc<std::sync::Mutex<Child>>,
    pid: u32,
    /// Luồng chép stderr vào log (che key); kết thúc khi server thoát.
    pump: Option<std::thread::JoinHandle<()>>,
    tail: logfile::Tail,
    base_url: String,
    api_key: String,
    http: reqwest::blocking::Client,
    log_path: PathBuf,
    request_timeout: Duration,
}

// Debug viết tay: không in API key.
impl std::fmt::Debug for LlamaServer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LlamaServer")
            .field("pid", &self.pid)
            .field("base_url", &self.base_url)
            .field("api_key", &"<ẩn>")
            .finish()
    }
}

impl LlamaServer {
    pub fn spawn(launch: &LlamaLaunch) -> Result<Self> {
        Self::spawn_with(launch, &mut |_| {})
    }

    /// Như [`LlamaServer::spawn`]; `on_spawn` nhận cách kill server ngay khi tiến trình chạy, trước khi chờ `/health`.
    pub fn spawn_with(launch: &LlamaLaunch, on_spawn: &mut dyn FnMut(process::Killer)) -> Result<Self> {
        // Chỉ gọi 127.0.0.1: reqwest vẫn đọc HTTP_PROXY/ALL_PROXY kể cả khi tắt feature `system-proxy`,
        // nên phải tắt proxy tường minh, giống `ProxyHandler({})` trong common.py.
        // Không giữ kết nối để dùng lại: b11146 đóng kết nối ngay sau mỗi response stream dù báo `Keep-Alive`, nên request
        // kế tiếp (`/tokenize` của câu sau) gửi trên kết nối cũ trước khi thấy nó bị đóng sẽ lỗi "connection closed before
        // message completed". Mở kết nối mới tới 127.0.0.1 tốn không đáng kể so với một lần dịch.
        // Dựng client trước khi chạy tiến trình, để lỗi ở đây không bỏ lại server mồ côi.
        let http = reqwest::blocking::Client::builder()
            .no_proxy()
            .pool_max_idle_per_host(0)
            .timeout(launch.request_timeout)
            .build()?;
        let port = TcpListener::bind("127.0.0.1:0")?.local_addr()?.port();
        let api_key = random_key();
        let log = logfile::RotatingLog::open(&launch.log, logfile::MAX_BYTES, logfile::KEEP)
            .with_context(|| format!("không mở được {}", launch.log.display()))?;
        let mut child = process::spawn(&mut command(launch, port, &api_key), &launch.exe)
            .with_context(|| format!("không chạy được {}", launch.exe.display()))?;
        let stderr = child.stderr.take().expect("stderr là pipe");
        let (pump, tail) = logfile::pump(stderr, log, vec![api_key.clone()]);
        let mut server = Self {
            pid: child.id(),
            child: std::sync::Arc::new(std::sync::Mutex::new(child)),
            pump: Some(pump),
            tail,
            base_url: format!("http://127.0.0.1:{port}"),
            api_key,
            http,
            log_path: launch.log.clone(),
            request_timeout: launch.request_timeout,
        };
        on_spawn(server.killer());
        if let Err(e) = server.wait_healthy(launch.ready_timeout) {
            // Kill rồi chờ luồng chép log đọc hết, để lỗi mang đủ các dòng cuối (hết bộ nhớ, lỗi GPU…).
            let tail = server.tail.clone();
            drop(server);
            let lines = tail.lines();
            return Err(match crate::asr_client::with_tail(String::new(), &lines) {
                t if t.is_empty() => e,
                t => e.context(t.trim_start_matches("; ").to_string()),
            });
        }
        Ok(server)
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    fn child(&self) -> std::sync::MutexGuard<'_, Child> {
        self.child.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Kill server từ luồng khác, kể cả khi luồng đang dùng nó chặn giữa request.
    pub fn killer(&self) -> process::Killer {
        process::Killer::new(self.child.clone())
    }

    /// `http://127.0.0.1:<cổng>`.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Vài dòng cuối của stderr, đã che key.
    pub fn log_tail(&self) -> Vec<String> {
        self.tail.lines()
    }

    /// Mã thoát nếu server đã chết.
    pub fn exited(&mut self) -> Option<ExitStatus> {
        self.child().try_wait().ok().flatten()
    }

    /// `/health` trả 200 (không cần API key). 503 khi đang nạp model.
    pub fn healthy(&self) -> bool {
        self.http
            .get(format!("{}/health", self.base_url))
            .timeout(Duration::from_secs(2))
            .send()
            .is_ok_and(|r| r.status().is_success())
    }

    fn wait_healthy(&mut self, timeout: Duration) -> Result<()> {
        let started = Instant::now();
        while started.elapsed() < timeout {
            if let Some(status) = self.child().try_wait()? {
                bail!("llama-server thoát sớm ({status}), xem log {}", self.log_path.display());
            }
            // Mỗi lần hỏi chỉ chờ 2 giây, để tổng thời gian chờ không vượt `timeout` quá nhiều.
            if self.healthy() {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        Err(NotReady {
            timeout,
            log: self.log_path.display().to_string(),
        }
        .into())
    }

    /// Dịch một prompt với tham số sinh của §6.5, stream tới hết. `on_delta` nhận từng gói chữ; trả `Break` để dừng
    /// (đóng kết nối, server thôi sinh token).
    pub fn stream(&self, req: &ChatRequest, on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>) -> Result<StreamEnd> {
        let body = serde_json::json!({
            "messages": [{ "role": "user", "content": req.prompt }],
            "stream": true,
            "temperature": 0.0,
            "repeat_penalty": req.repeat_penalty,
            "max_tokens": req.max_tokens,
            "cache_prompt": true,
        });
        let started = Instant::now();
        let resp = self.post("/v1/chat/completions", &body)?;
        read_stream(BufReader::new(resp), started, on_delta).with_context(|| {
            format!(
                "đọc bản dịch từ llama-server thất bại, xem log {}",
                self.log_path.display()
            )
        })
    }

    /// Dạng của Phase 0: repeat penalty 1,05, đọc tới hết, cắt khoảng trắng hai đầu.
    pub fn translate(&self, prompt: &str, max_tokens: u32) -> Result<Translation> {
        let req = ChatRequest {
            prompt,
            max_tokens,
            repeat_penalty: 1.05,
        };
        let end = self.stream(&req, &mut |_| ControlFlow::Continue(()))?;
        Ok(Translation {
            text: end.text.trim().to_string(),
            first_token_ms: end.first_token_ms,
            total_ms: end.total_ms,
            finish_reason: end.finish_reason,
        })
    }

    /// Số token của `text` theo tokenizer của model (`POST /tokenize`, giống `count_tokens` trong `common.py`),
    /// để tính `max_tokens` (§6.5).
    pub fn count_tokens(&self, text: &str) -> Result<usize> {
        let resp = self.post("/tokenize", &serde_json::json!({ "content": text }))?;
        parse_token_count(&resp.text()?)
    }

    /// POST JSON kèm API key. Trả lỗi kèm 500 ký tự đầu của thân response khi HTTP không thành công.
    fn post(&self, path: &str, body: &serde_json::Value) -> Result<reqwest::blocking::Response> {
        let resp = self
            .http
            .post(format!("{}{path}", self.base_url))
            .bearer_auth(&self.api_key)
            .timeout(self.request_timeout)
            .json(body)
            .send()
            .with_context(|| {
                format!(
                    "không gọi được llama-server {path}, xem log {}",
                    self.log_path.display()
                )
            })?;
        let status = resp.status();
        if !status.is_success() {
            let detail: String = resp.text().unwrap_or_default().chars().take(500).collect();
            bail!("llama-server {path} trả HTTP {status}: {detail}");
        }
        Ok(resp)
    }
}

/// Đếm phần tử của `tokens` trong phản hồi của `/tokenize`. Tách khỏi `count_tokens` để test được không cần server.
fn parse_token_count(body: &str) -> Result<usize> {
    let value: serde_json::Value =
        serde_json::from_str(body).with_context(|| format!("phản hồi /tokenize không phải JSON: {body:.200}"))?;
    let tokens = value["tokens"]
        .as_array()
        .with_context(|| format!("phản hồi /tokenize không có mảng `tokens`: {body:.200}"))?;
    Ok(tokens.len())
}

/// Đọc stream tới `[DONE]`, hoặc tới khi `on_delta` trả `Break`. Tách khỏi `stream` để test được bằng dữ liệu mẫu, không
/// cần server.
fn read_stream(
    reader: impl BufRead,
    started: Instant,
    on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
) -> Result<StreamEnd> {
    let mut end = StreamEnd::default();
    let mut first_token_ms = None;
    let mut done = false;
    for line in reader.lines() {
        match parse_sse_line(&line?)? {
            SseEvent::Delta {
                content,
                finish_reason,
                completion_tokens,
            } => {
                // Gói chỉ có khoảng trắng hay xuống dòng (model hay mở đầu bằng "\n") chưa phải chữ dịch:
                // hậu xử lý (§6.5) sẽ cắt chúng, nên người xem chưa thấy gì.
                if first_token_ms.is_none() && !content.trim().is_empty() {
                    first_token_ms = Some(started.elapsed().as_secs_f32() * 1000.0);
                }
                end.finish_reason = finish_reason.or(end.finish_reason);
                end.completion_tokens = completion_tokens.or(end.completion_tokens);
                if !content.is_empty() {
                    end.chunks += 1;
                    end.text.push_str(&content);
                    if on_delta(&content).is_break() {
                        end.cancelled = true;
                        done = true;
                        break;
                    }
                }
            }
            SseEvent::Done => {
                done = true;
                break;
            }
            SseEvent::Ignore => {}
        }
    }
    if !done {
        bail!(
            "stream kết thúc mà không có [DONE] (đã nhận {} ký tự): bản dịch có thể bị cụt",
            end.text.chars().count()
        );
    }
    end.total_ms = started.elapsed().as_secs_f32() * 1000.0;
    end.first_token_ms = first_token_ms.unwrap_or(end.total_ms);
    Ok(end)
}

impl Drop for LlamaServer {
    fn drop(&mut self) {
        {
            let mut child = self.child();
            let _ = child.kill();
            let _ = child.wait();
        }
        process::release(self.pid);
        if let Some(pump) = self.pump.take() {
            let _ = pump.join();
        }
    }
}

/// Khóa ngẫu nhiên 128 bit cho `LLAMA_API_KEY`. `RandomState` lấy seed từ bộ sinh số ngẫu nhiên của hệ điều hành.
fn random_key() -> String {
    (0..2)
        .map(|i| {
            let mut h = RandomState::new().build_hasher();
            h.write_u64(i);
            format!("{:016x}", h.finish())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::io::Read;

    const ROLE: &str = "data: {\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":null}}]}\n\n";

    fn read_all(body: impl BufRead) -> Result<StreamEnd> {
        read_stream(body, Instant::now(), &mut |_| ControlFlow::Continue(()))
    }

    #[test]
    fn stream_without_done_is_an_error() {
        let body = format!("{ROLE}data: {{\"choices\":[{{\"delta\":{{\"content\":\"Xin\"}}}}]}}\n\n");
        let err = read_all(body.as_bytes()).unwrap_err();
        assert!(err.to_string().contains("[DONE]"), "{err}");
    }

    #[test]
    fn stream_keeps_text_finish_reason_and_token_count() {
        let body = format!(
            "{ROLE}data: {{\"choices\":[{{\"delta\":{{\"content\":\"Xin\"}}}}]}}\n\n: keep-alive\n\n\
             data:{{\"choices\":[{{\"delta\":{{\"content\":\" chào \"}}}}]}}\r\n\r\n\
             data: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"length\"}}],\"timings\":{{\"predicted_n\":2}}}}\n\n\
             data: [DONE]\n\n"
        );
        let end = read_all(body.as_bytes()).unwrap();
        assert_eq!(end.text, "Xin chào ", "chữ nguyên văn, hậu xử lý làm sau");
        assert_eq!(end.finish_reason.as_deref(), Some("length"));
        assert_eq!((end.completion_tokens, end.chunks, end.cancelled), (Some(2), 2, false));
        assert!(end.first_token_ms <= end.total_ms);
    }

    #[test]
    fn breaking_from_the_callback_cancels_the_stream() {
        let chunk = |c: &str| format!("data: {{\"choices\":[{{\"delta\":{{\"content\":\"{c}\"}}}}]}}\n\n");
        let body = format!("{}{}{}", chunk("a"), chunk("b"), chunk("c"));
        let mut seen = Vec::new();
        let end = read_stream(body.as_bytes(), Instant::now(), &mut |c| {
            seen.push(c.to_string());
            if seen.len() == 2 {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        })
        .unwrap();
        assert_eq!(seen, ["a", "b"]);
        assert!(end.cancelled && end.finish_reason.is_none());
        assert_eq!(end.text, "ab");
    }

    #[test]
    fn error_chunk_mid_stream_is_an_error() {
        let body = format!("{ROLE}data: {{\"error\":{{\"code\":500,\"message\":\"boom\"}}}}\n\n");
        assert!(read_all(body.as_bytes()).is_err());
    }

    /// Đọc từng đoạn byte, mỗi đoạn tới sau một khoảng chờ: giả lập stream chậm mà không cần server.
    /// Mỗi đoạn phải gồm trọn các dòng và nhỏ hơn bộ đệm của `BufReader`.
    struct Paced(VecDeque<(Duration, Vec<u8>)>);

    impl Read for Paced {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let Some((wait, chunk)) = self.0.pop_front() else {
                return Ok(0);
            };
            std::thread::sleep(wait);
            buf[..chunk.len()].copy_from_slice(&chunk);
            Ok(chunk.len())
        }
    }

    fn content_event(content: &str) -> Vec<u8> {
        let chunk = serde_json::json!({ "choices": [{ "delta": { "content": content } }] });
        format!("data: {chunk}\n\n").into_bytes()
    }

    #[test]
    fn first_token_skips_whitespace_only_chunks() {
        let wait = Duration::from_millis(80);
        let events = VecDeque::from([
            (Duration::ZERO, ROLE.as_bytes().to_vec()),
            (Duration::ZERO, content_event("\n")),
            (Duration::ZERO, content_event(" \u{3000}")),
            (wait, content_event("Xin")),
            (Duration::ZERO, b"data: [DONE]\n\n".to_vec()),
        ]);
        let end = read_all(BufReader::new(Paced(events))).unwrap();
        assert_eq!(end.text.trim(), "Xin");
        assert!(
            end.first_token_ms >= 80.0,
            "chữ đầu tới sau 80 ms, nhưng first_token_ms = {}",
            end.first_token_ms
        );
    }

    #[test]
    fn whitespace_only_stream_has_no_first_token() {
        let events = VecDeque::from([
            (Duration::ZERO, content_event("\n")),
            (Duration::from_millis(20), content_event(" ")),
            (Duration::ZERO, b"data: [DONE]\n\n".to_vec()),
        ]);
        let end = read_all(BufReader::new(Paced(events))).unwrap();
        assert_eq!(end.text.trim(), "");
        // Không có chữ nào: mốc "chữ đầu" rơi về lúc kết thúc, không phải lúc gói trắng đầu tiên tới.
        assert_eq!(end.first_token_ms, end.total_ms);
        assert!(end.total_ms >= 20.0);
    }

    #[test]
    fn token_count_is_length_of_tokens_array() {
        assert_eq!(parse_token_count(r#"{"tokens":[1,22,333]}"#).unwrap(), 3);
        assert_eq!(parse_token_count(r#"{"tokens":[]}"#).unwrap(), 0);
    }

    #[test]
    fn token_count_rejects_bodies_without_tokens() {
        assert!(parse_token_count("").is_err());
        assert!(parse_token_count("<html>502 Bad Gateway</html>").is_err());
        assert!(parse_token_count(r#"{"error":{"code":401,"message":"Invalid API Key"}}"#).is_err());
        assert!(parse_token_count(r#"{"tokens":"abc"}"#).is_err());
    }

    fn launch() -> LlamaLaunch {
        LlamaLaunch::new(
            Path::new("/app/llama-server"),
            Path::new("/models/mt.gguf"),
            Path::new("/logs/llama.log"),
        )
    }

    fn args(cmd: &Command) -> Vec<String> {
        cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect()
    }

    #[test]
    fn api_key_goes_through_the_environment_not_the_command_line() {
        let key = "0123456789abcdef0123456789abcdef";
        let cmd = command(&launch(), 18_000, key);
        let args = args(&cmd);
        assert!(
            args.iter().all(|a| !a.contains(key)),
            "key không được nằm trong tham số: {args:?}"
        );
        assert!(!args.iter().any(|a| a == "--api-key"));
        let env: Vec<_> = cmd.get_envs().collect();
        assert_eq!(
            env,
            [(std::ffi::OsStr::new(API_KEY_ENV), Some(std::ffi::OsStr::new(key)))]
        );
    }

    #[test]
    fn command_follows_the_spec() {
        let cmd = command(&launch(), 18_000, "k");
        assert_eq!(
            cmd.get_current_dir(),
            Some(Path::new("/app")),
            "chạy trong thư mục của binary"
        );
        assert_eq!(
            args(&cmd),
            [
                "-m",
                "/models/mt.gguf",
                "--host",
                "127.0.0.1",
                "--port",
                "18000",
                "-c",
                "2048",
                "-np",
                "1",
                "-ngl",
                "auto",
                "--no-ui"
            ]
        );
    }

    #[test]
    fn cpu_mode_and_extra_args() {
        let cpu = LlamaLaunch {
            use_gpu: false,
            extra_args: vec!["--no-repack".into()],
            ..launch()
        };
        let args = args(&command(&cpu, 18_000, "k"));
        let ngl = args.iter().position(|a| a == "-ngl").unwrap();
        assert_eq!(args[ngl + 1], "0");
        assert_eq!(args.last().map(String::as_str), Some("--no-repack"));
        assert!(!args.iter().any(|a| a == "99"), "không bao giờ -ngl 99 (§6.5)");
    }

    #[test]
    fn random_keys_are_128_bit_hex_and_differ() {
        let (a, b) = (random_key(), random_key());
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }
}
