//! Chạy `llama-server` và gọi `/v1/chat/completions` ở chế độ stream (spec §6.5).

use crate::sse::{SseEvent, parse_sse_line};
use anyhow::{Context, Result, bail};
use std::collections::hash_map::RandomState;
use std::fs::File;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

pub struct LlamaServer {
    child: Child,
    base_url: String,
    api_key: String,
    http: reqwest::blocking::Client,
    log_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct Translation {
    pub text: String,
    /// Từ lúc gửi request tới khi nhận chunk đầu tiên có ký tự không phải khoảng trắng. Bản dịch không có chữ nào
    /// thì bằng `total_ms`.
    pub first_token_ms: f32,
    pub total_ms: f32,
    /// "stop", hoặc "length" khi chạm `max_tokens` (bản dịch bị cụt).
    pub finish_reason: Option<String>,
}

impl LlamaServer {
    /// Lệnh chạy theo §6.5. `extra_args` dùng để thử tham số khác trong spike.
    pub fn spawn(exe: &Path, model: &Path, extra_args: &[String], stderr_log: &Path) -> Result<Self> {
        // Chỉ gọi 127.0.0.1: reqwest vẫn đọc HTTP_PROXY/ALL_PROXY kể cả khi tắt feature `system-proxy`,
        // nên phải tắt proxy tường minh, giống `ProxyHandler({})` trong common.py.
        // Dựng client trước khi chạy tiến trình, để lỗi ở đây không bỏ lại server mồ côi.
        let http = reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(120))
            .build()?;
        let port = TcpListener::bind("127.0.0.1:0")?.local_addr()?.port();
        let api_key = random_key();
        // Ghi nối tiếp như common.py: chạy lại cùng nhãn không xóa log của lần server vừa chết.
        let log = File::options()
            .create(true)
            .append(true)
            .open(stderr_log)
            .with_context(|| format!("không mở được {}", stderr_log.display()))?;
        let child = Command::new(exe)
            .arg("-m")
            .arg(model)
            .args([
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
                "--api-key",
                &api_key,
            ])
            .args(["-c", "2048", "-np", "1", "-ngl", "auto", "--no-ui"])
            .args(extra_args)
            .stdout(Stdio::null())
            .stderr(Stdio::from(log))
            .spawn()
            .with_context(|| format!("không chạy được {}", exe.display()))?;
        let mut server = Self {
            child,
            base_url: format!("http://127.0.0.1:{port}"),
            api_key,
            http,
            log_path: stderr_log.to_path_buf(),
        };
        server.wait_healthy(Duration::from_secs(180))?;
        Ok(server)
    }

    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    fn wait_healthy(&mut self, timeout: Duration) -> Result<()> {
        let started = Instant::now();
        while started.elapsed() < timeout {
            if let Some(status) = self.child.try_wait()? {
                bail!("llama-server thoát sớm ({status}), xem log {}", self.log_path.display());
            }
            // Mỗi lần hỏi chỉ chờ 2 giây, để tổng thời gian chờ không vượt `timeout` quá nhiều.
            if let Ok(resp) = self
                .http
                .get(format!("{}/health", self.base_url))
                .timeout(Duration::from_secs(2))
                .send()
                && resp.status().is_success()
            {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        bail!(
            "llama-server không sẵn sàng sau {timeout:?}, xem log {}",
            self.log_path.display()
        )
    }

    /// Dịch một prompt đã dựng sẵn (xem `prompt.rs`). Tham số sinh theo §6.5.
    pub fn translate(&self, prompt: &str, max_tokens: u32) -> Result<Translation> {
        let body = serde_json::json!({
            "messages": [{ "role": "user", "content": prompt }],
            "stream": true,
            "temperature": 0.0,
            "repeat_penalty": 1.05,
            "max_tokens": max_tokens,
            "cache_prompt": true,
        });
        let started = Instant::now();
        let resp = self.post("/v1/chat/completions", &body)?;
        read_stream(BufReader::new(resp), started)
    }

    /// Số token của `text` theo tokenizer của model (`POST /tokenize`, giống `count_tokens` trong `common.py`),
    /// để tính `max_tokens` theo [`max_tokens_for`].
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
            .json(body)
            .send()?;
        let status = resp.status();
        if !status.is_success() {
            let detail: String = resp.text().unwrap_or_default().chars().take(500).collect();
            bail!("llama-server {path} trả HTTP {status}: {detail}");
        }
        Ok(resp)
    }
}

/// Số token tối đa của bản dịch theo §6.5: min(4 × số token câu gốc + 32, 512).
pub fn max_tokens_for(source_tokens: usize) -> u32 {
    const CAP: usize = 512;
    source_tokens.saturating_mul(4).saturating_add(32).min(CAP) as u32
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

/// Đọc stream tới `[DONE]`. Tách khỏi `translate` để test được bằng dữ liệu mẫu, không cần server.
fn read_stream(reader: impl BufRead, started: Instant) -> Result<Translation> {
    let mut text = String::new();
    let mut first_token_ms = None;
    let mut finish_reason = None;
    let mut done = false;
    for line in reader.lines() {
        match parse_sse_line(&line?)? {
            SseEvent::Delta {
                content,
                finish_reason: reason,
            } => {
                // Chunk chỉ có khoảng trắng hay xuống dòng (model hay mở đầu bằng "\n") chưa phải chữ dịch:
                // hậu xử lý (§6.5) sẽ cắt chúng, nên người xem chưa thấy gì.
                if first_token_ms.is_none() && !content.trim().is_empty() {
                    first_token_ms = Some(started.elapsed().as_secs_f32() * 1000.0);
                }
                text.push_str(&content);
                finish_reason = reason.or(finish_reason);
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
            text.chars().count()
        );
    }
    let total_ms = started.elapsed().as_secs_f32() * 1000.0;
    Ok(Translation {
        text: text.trim().to_string(),
        first_token_ms: first_token_ms.unwrap_or(total_ms),
        total_ms,
        finish_reason,
    })
}

impl Drop for LlamaServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Khóa ngẫu nhiên cho `--api-key`. `RandomState` lấy seed từ bộ sinh số ngẫu nhiên của hệ điều hành.
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

    #[test]
    fn stream_without_done_is_an_error() {
        let body = format!("{ROLE}data: {{\"choices\":[{{\"delta\":{{\"content\":\"Xin\"}}}}]}}\n\n");
        let err = read_stream(body.as_bytes(), Instant::now()).unwrap_err();
        assert!(err.to_string().contains("[DONE]"), "{err}");
    }

    #[test]
    fn stream_keeps_text_and_finish_reason() {
        let body = format!(
            "{ROLE}data: {{\"choices\":[{{\"delta\":{{\"content\":\"Xin\"}}}}]}}\n\n: keep-alive\n\n\
             data:{{\"choices\":[{{\"delta\":{{\"content\":\" chào \"}}}}]}}\r\n\r\n\
             data: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"length\"}}]}}\n\ndata: [DONE]\n\n"
        );
        let t = read_stream(body.as_bytes(), Instant::now()).unwrap();
        assert_eq!(t.text, "Xin chào");
        assert_eq!(t.finish_reason.as_deref(), Some("length"));
        assert!(t.first_token_ms <= t.total_ms);
    }

    #[test]
    fn error_chunk_mid_stream_is_an_error() {
        let body = format!("{ROLE}data: {{\"error\":{{\"code\":500,\"message\":\"boom\"}}}}\n\n");
        assert!(read_stream(body.as_bytes(), Instant::now()).is_err());
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
        let t = read_stream(BufReader::new(Paced(events)), Instant::now()).unwrap();
        assert_eq!(t.text, "Xin");
        assert!(
            t.first_token_ms >= 80.0,
            "chữ đầu tới sau 80 ms, nhưng first_token_ms = {}",
            t.first_token_ms
        );
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

    #[test]
    fn max_tokens_follow_spec_formula() {
        // §6.5: min(4 × số token câu gốc + 32, 512).
        assert_eq!(max_tokens_for(0), 32);
        assert_eq!(max_tokens_for(10), 72);
        assert_eq!(max_tokens_for(119), 508);
        assert_eq!(max_tokens_for(120), 512);
        assert_eq!(max_tokens_for(121), 512);
        assert_eq!(max_tokens_for(usize::MAX), 512);
    }

    #[test]
    fn whitespace_only_stream_has_no_first_token() {
        let events = VecDeque::from([
            (Duration::ZERO, content_event("\n")),
            (Duration::from_millis(20), content_event(" ")),
            (Duration::ZERO, b"data: [DONE]\n\n".to_vec()),
        ]);
        let t = read_stream(BufReader::new(Paced(events)), Instant::now()).unwrap();
        assert_eq!(t.text, "");
        // Không có chữ nào: mốc "chữ đầu" rơi về lúc kết thúc, không phải lúc chunk trắng đầu tiên tới.
        assert_eq!(t.first_token_ms, t.total_ms);
        assert!(t.total_ms >= 20.0);
    }
}
