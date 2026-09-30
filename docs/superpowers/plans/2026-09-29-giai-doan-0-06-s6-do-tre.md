# Giai đoạn 0 · 06: S6 (độ trễ tổng thể, RAM, VRAM trên các máy tham chiếu)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:**
- Đo độ trễ theo đúng định nghĩa A2, cùng RAM, VRAM và CPU, cho hai gói model trên các máy tham chiếu (§13). Đây là giả định 4 và 5.
- Lấy số liệu cho cổng Giai đoạn 0:
  - máy khuyến nghị (kể cả M1 cơ bản 16 GB): p50 ≤ 2,0 giây;
  - máy tối thiểu: p50 ≤ 3,5 giây.

**Kiến trúc:** `latency-bench latency` phát lại một file WAV theo thời gian thực: khung 32 ms thứ i sẵn sàng ở thời điểm (i + 1) × 32 ms. Mỗi khung đi qua Silero VAD và bộ cắt đoạn trong tiến trình chính. Sau đó ba luồng chạy song song như trong app:
1. cắt đoạn;
2. gửi đoạn cho `asr-worker`;
3. dịch bằng `llama-server` qua `/v1/chat/completions` ở chế độ stream.

Mỗi câu được ghép với mốc dừng câu thật trong file truth, để tính:
- độ trễ tới lúc bản dịch hiện đủ;
- độ trễ tới chữ dịch đầu tiên.

Một luồng phụ lấy mẫu RAM và CPU của cả ba tiến trình mỗi 0,5 giây. Trên Windows, VRAM được lấy mẫu riêng bằng `vram-sample.ps1`.

**Công nghệ:**
- reqwest 0.13.5, dạng blocking, tắt TLS vì chỉ gọi 127.0.0.1.
- sysinfo 0.39.6; libc 0.2.189 (macOS, để đọc `phys_footprint`).
- llama.cpp b11146; Python 3 cho các script.

Tổng quan: `docs/superpowers/plans/2026-09-29-giai-doan-0-00-tong-quan.md`. Cần xong kế hoạch 02 (S4 đạt, tức gọi `/v1/chat/completions` được) và kế hoạch 03 (`asr-worker` chế độ B, `pipeline` phần 1, bộ clip A4). Task 1–7 làm trên Mac M4 Pro, Task 8 làm trên các máy tham chiếu.

---

### Task 1: Mẫu prompt Hy-MT2 trong Rust (TDD)

**Files:**
- Create: `crates/pipeline/src/prompt.rs`
- Modify: `crates/pipeline/src/lib.rs`

Mẫu prompt phải giống hệt `bench/phase0/mt/common.py` (kế hoạch 02), vì S4 đã kiểm chứng chính các chuỗi này:
- Có tiếng Trung ở một trong hai phía thì dùng mẫu tiếng Trung với tên ngôn ngữ tiếng Trung.
- Các trường hợp còn lại dùng mẫu tiếng Anh.

- [ ] **Step 1: Thêm module** vào `crates/pipeline/src/lib.rs`, ngay dưới `pub mod asr_client;`:

```rust
pub mod prompt;
```

- [ ] **Step 2: Viết test trước.** Tạo `crates/pipeline/src/prompt.rs` chỉ gồm phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_template_for_non_chinese_pairs() {
        assert_eq!(
            translation_prompt("Hello", Lang::En, Lang::Vi),
            "Translate the following text into Vietnamese. Note that you should only output the translated \
             result without any additional explanation:\n\nHello"
        );
    }

    #[test]
    fn chinese_template_when_source_is_chinese() {
        assert_eq!(
            translation_prompt("你好", Lang::Zh, Lang::Vi),
            "将以下文本翻译为越南语，注意只需要输出翻译后的结果，不要额外解释：\n\n你好"
        );
    }

    #[test]
    fn chinese_template_when_target_is_chinese() {
        assert!(translation_prompt("Xin chào", Lang::Vi, Lang::Zh).starts_with("将以下文本翻译为中文，"));
    }

    #[test]
    fn context_template_english() {
        let p = context_prompt("B", "A", Lang::Ja, Lang::Vi);
        assert!(p.starts_with("[Background Information]\nA\n\nPlease translate the following text into Vietnamese,"));
        assert!(p.ends_with("[Source Text]\nB"));
    }

    #[test]
    fn lang_codes_roundtrip() {
        for code in ["en", "zh", "ja", "ko", "vi"] {
            assert_eq!(Lang::from_code(code).unwrap().code(), code);
        }
        assert!(Lang::from_code("fr").is_none());
    }
}
```

- [ ] **Step 3: Chạy test để thấy lỗi**

Run: `cargo test -p pipeline prompt`
Expected: FAIL, lỗi biên dịch vì chưa có `Lang`, `translation_prompt`, `context_prompt`.

- [ ] **Step 4: Viết phần code** ở đầu `crates/pipeline/src/prompt.rs`:

```rust
//! Mẫu prompt lấy nguyên văn từ model card của Hy-MT2 (spec §6.5).

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lang {
    En,
    Zh,
    Ja,
    Ko,
    Vi,
}

impl Lang {
    pub fn from_code(code: &str) -> Option<Self> {
        match code {
            "en" => Some(Self::En),
            "zh" => Some(Self::Zh),
            "ja" => Some(Self::Ja),
            "ko" => Some(Self::Ko),
            "vi" => Some(Self::Vi),
            _ => None,
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::Zh => "zh",
            Self::Ja => "ja",
            Self::Ko => "ko",
            Self::Vi => "vi",
        }
    }

    /// Tên dùng trong mẫu tiếng Anh.
    fn english_name(self) -> &'static str {
        match self {
            Self::En => "English",
            Self::Zh => "Chinese",
            Self::Ja => "Japanese",
            Self::Ko => "Korean",
            Self::Vi => "Vietnamese",
        }
    }

    /// Tên dùng trong mẫu tiếng Trung, giống `run_mt.py` của benchmark 2026-09-29.
    fn chinese_name(self) -> &'static str {
        match self {
            Self::En => "英语",
            Self::Zh => "中文",
            Self::Ja => "日语",
            Self::Ko => "韩语",
            Self::Vi => "越南语",
        }
    }
}

fn uses_chinese_template(src: Lang, tgt: Lang) -> bool {
    src == Lang::Zh || tgt == Lang::Zh
}

/// Mẫu mặc định: có tiếng Trung ở một trong hai phía thì dùng mẫu tiếng Trung.
pub fn translation_prompt(text: &str, src: Lang, tgt: Lang) -> String {
    if uses_chinese_template(src, tgt) {
        format!(
            "将以下文本翻译为{}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}",
            tgt.chinese_name()
        )
    } else {
        format!(
            "Translate the following text into {}. Note that you should only output the translated result \
             without any additional explanation:\n\n{text}",
            tgt.english_name()
        )
    }
}

/// Mẫu "background information" của model card, dùng cho cờ thử nghiệm ngữ cảnh câu trước (spec §6.5).
pub fn context_prompt(text: &str, context: &str, src: Lang, tgt: Lang) -> String {
    if uses_chinese_template(src, tgt) {
        format!(
            "【背景信息】\n{context}\n\n请结合背景信息将以下文本翻译为{}。\n\n【待翻译文本】\n{text}",
            tgt.chinese_name()
        )
    } else {
        format!(
            "[Background Information]\n{context}\n\nPlease translate the following text into {}, taking the \
             provided background information into consideration.\n\n[Source Text]\n{text}",
            tgt.english_name()
        )
    }
}
```

- [ ] **Step 5: Chạy lại test**

Run: `cargo test -p pipeline`
Expected: PASS, `test result: ok. 24 passed` (19 của segmenter, 5 của prompt).

- [ ] **Step 6: Commit**

```bash
git add crates/pipeline
git commit -m "feat(pipeline): mẫu prompt Hy-MT2 (Anh, Trung, ngữ cảnh) giống S4"
```

### Task 2: Đọc stream SSE (TDD)

**Files:**
- Create: `crates/pipeline/src/sse.rs`
- Modify: `crates/pipeline/src/lib.rs`

Cách đọc từng dòng stream của `/v1/chat/completions`:
- `data: {...}` có `delta.content` thì trả phần chữ mới, kèm `finish_reason` nếu có (`stop`, hoặc `length` khi chạm `max_tokens`).
- `data: [DONE]` thì kết thúc.
- Dòng trống hoặc dòng không bắt đầu bằng `data:` thì bỏ qua.
- Chunk có `error` là lỗi.

- [ ] **Step 1: Thêm module** vào `crates/pipeline/src/lib.rs`, ngay dưới `pub mod segmenter;`:

```rust
pub mod sse;
```

- [ ] **Step 2: Viết test trước.** Tạo `crates/pipeline/src/sse.rs` chỉ gồm phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_delta() {
        let line = r#"data: {"choices":[{"index":0,"delta":{"content":"Xin"}}]}"#;
        let want = SseEvent::Delta {
            content: "Xin".into(),
            finish_reason: None,
        };
        assert_eq!(parse_sse_line(line).unwrap(), want);
    }

    #[test]
    fn finish_chunk_has_empty_delta_and_reason() {
        let line = r#"data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
        let want = SseEvent::Delta {
            content: String::new(),
            finish_reason: Some("stop".into()),
        };
        assert_eq!(parse_sse_line(line).unwrap(), want);
    }

    #[test]
    fn data_without_space_and_null_content() {
        let line = r#"data:{"choices":[{"delta":{"role":"assistant","content":null}}]}"#;
        let want = SseEvent::Delta {
            content: String::new(),
            finish_reason: None,
        };
        assert_eq!(parse_sse_line(line).unwrap(), want);
        assert_eq!(parse_sse_line("data:[DONE]\r").unwrap(), SseEvent::Done);
    }

    #[test]
    fn parses_done_and_ignores_other_lines() {
        assert_eq!(parse_sse_line("data: [DONE]").unwrap(), SseEvent::Done);
        assert_eq!(parse_sse_line("").unwrap(), SseEvent::Ignore);
        assert_eq!(parse_sse_line(": keep-alive").unwrap(), SseEvent::Ignore);
    }

    #[test]
    fn server_error_and_bad_json_are_errors() {
        assert!(parse_sse_line(r#"data: {"error":{"code":500,"message":"boom"}}"#).is_err());
        assert!(parse_sse_line("data: {\"choices\":[").is_err());
    }
}
```

- [ ] **Step 3: Chạy test để thấy lỗi**

Run: `cargo test -p pipeline sse`
Expected: FAIL, lỗi biên dịch vì chưa có `parse_sse_line` và `SseEvent`.

- [ ] **Step 4: Viết phần code** ở đầu `crates/pipeline/src/sse.rs`:

```rust
//! Đọc từng dòng Server-Sent Events của `/v1/chat/completions` với `stream: true`.

use anyhow::{Context, Result, bail};

#[derive(Debug, PartialEq, Eq)]
pub enum SseEvent {
    /// Phần chữ mới của bản dịch (có thể rỗng), kèm `finish_reason` nếu đây là gói cuối.
    Delta {
        content: String,
        finish_reason: Option<String>,
    },
    Done,
    /// Dòng trống, comment hoặc trường khác `data`.
    Ignore,
}

pub fn parse_sse_line(line: &str) -> Result<SseEvent> {
    let Some(data) = line.strip_prefix("data:") else {
        return Ok(SseEvent::Ignore);
    };
    let data = data.trim();
    if data == "[DONE]" {
        return Ok(SseEvent::Done);
    }
    let value: serde_json::Value =
        serde_json::from_str(data).with_context(|| format!("dòng SSE không phải JSON: {data:.200}"))?;
    if let Some(err) = value.get("error") {
        bail!("llama-server báo lỗi: {err}");
    }
    let choice = &value["choices"][0];
    Ok(SseEvent::Delta {
        content: choice["delta"]["content"].as_str().unwrap_or_default().to_string(),
        finish_reason: choice["finish_reason"].as_str().map(String::from),
    })
}
```

- [ ] **Step 5: Chạy lại test**

Run: `cargo test -p pipeline`
Expected: PASS, `test result: ok. 29 passed`

- [ ] **Step 6: Commit**

```bash
git add crates/pipeline
git commit -m "feat(pipeline): đọc stream SSE của llama-server"
```

### Task 3: Chạy và gọi `llama-server`

**Files:**
- Create: `crates/pipeline/src/llama.rs`
- Modify: `crates/pipeline/Cargo.toml` (thêm reqwest)
- Modify: `crates/pipeline/src/lib.rs` (bản cuối)

Lệnh chạy theo §6.5:
- `-m <gguf> --host 127.0.0.1 --port <cổng trống> --api-key <ngẫu nhiên> -c 2048 -np 1 -ngl auto --no-ui`.
- Cổng được chọn bằng cách mở rồi đóng một `TcpListener` ở cổng 0.
- API key sinh từ `RandomState` của thư viện chuẩn. Key này chỉ cần khó đoán với tiến trình khác trên máy, và không nằm trong app (§10.2).
- Chờ `/health` trả 200, tối đa 180 giây; mỗi lần hỏi timeout 2 giây.
- Client HTTP được dựng trước khi spawn, với `.no_proxy()`.
  - reqwest vẫn đọc `HTTP_PROXY`/`ALL_PROXY` kể cả khi tắt feature `system-proxy`. Nếu không chặn, prompt (tức bản chép lời) và API key sẽ đi qua proxy. Review lúc thực thi đã chứng minh bằng một proxy giả.
  - Đây cũng là lỗi đã sửa cho `common.py` ở kế hoạch 02.
- Stream kết thúc mà không có `[DONE]` là lỗi, vì bản dịch có thể bị cụt.
- `Translation` trả thêm `finish_reason`, để Task 5 phân biệt bản dịch chạm `max_tokens`.
- Lỗi HTTP kèm 500 ký tự đầu của thân response. Log của server mở ở chế độ append.

Mỗi lần dịch:
- gửi request stream với temperature 0, repeat penalty 1,05 và `cache_prompt`;
- ghi lại thời điểm chữ đầu tiên và lúc xong.

- [ ] **Step 1: Sửa `crates/pipeline/Cargo.toml`** thành bản cuối:

```toml
[package]
name = "pipeline"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

[dependencies]
anyhow.workspace = true
asr-protocol = { path = "../asr-protocol" }
candle-core = "0.11.0"
candle-onnx = "0.11.0"
reqwest = { version = "0.13.5", default-features = false, features = ["blocking", "json"] }
serde.workspace = true
serde_json.workspace = true

[dev-dependencies]
hound.workspace = true
```

- [ ] **Step 2: Tạo `crates/pipeline/src/llama.rs`**

```rust
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
```

- [ ] **Step 3: Sửa `crates/pipeline/src/lib.rs`** thành bản cuối:

```rust
pub mod asr_client;
pub mod llama;
pub mod prompt;
pub mod segmenter;
pub mod sse;
pub mod vad;
```

- [ ] **Step 4: Build, test, clippy**

Run: `cargo test -p pipeline && cargo clippy -p pipeline --all-targets -- -D warnings`
Expected: `test result: ok. 32 passed`; clippy không có cảnh báo.

- [ ] **Step 5: Commit**

```bash
git add crates/pipeline Cargo.lock
git commit -m "feat(pipeline): chạy llama-server theo §6.5 và dịch qua /v1/chat/completions (stream)"
```

### Task 4: Phân vị và ghép câu (TDD)

**Files:**
- Create: `crates/latency-bench/src/stats.rs`
- Modify: `crates/latency-bench/src/main.rs`

Hai hàm:
- `percentile`: nội suy tuyến tính, giống mặc định của `numpy.percentile`.
- `match_segments`: ghép mỗi câu thật với đoạn có `end_ms` gần mốc dừng câu nhất, trong phạm vi cho trước. Mỗi đoạn chỉ được ghép một lần.

- [ ] **Step 1: Thêm module** vào `crates/latency-bench/src/main.rs`, ngay dưới `mod asr_eval;`:

```rust
mod stats;
```

- [ ] **Step 2: Viết test trước.** Tạo `crates/latency-bench/src/stats.rs` chỉ gồm phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentile_interpolates() {
        let v = [1.0, 2.0, 3.0, 4.0];
        assert_eq!(percentile(&v, 50.0), Some(2.5));
        assert_eq!(percentile(&v, 0.0), Some(1.0));
        assert_eq!(percentile(&v, 100.0), Some(4.0));
        assert!((percentile(&v, 90.0).unwrap() - 3.7).abs() < 1e-6);
        assert_eq!(percentile(&[], 50.0), None);
    }

    fn utt(end_ms: u64) -> Utterance {
        Utterance {
            id: format!("u{end_ms}"),
            lang: "en".into(),
            start_ms: 0,
            end_ms,
            text: String::new(),
        }
    }

    #[test]
    fn matches_nearest_segment_end_once() {
        let utts = [utt(1_000), utt(5_000), utt(9_000)];
        let ends = [1_064, 4_960, 20_000];
        assert_eq!(match_segments(&utts, &ends, 1_000), vec![Some(0), Some(1), None]);
    }

    #[test]
    fn segment_is_not_reused() {
        let utts = [utt(1_000), utt(1_100)];
        let ends = [1_050];
        assert_eq!(match_segments(&utts, &ends, 1_000), vec![Some(0), None]);
    }

    #[test]
    fn percentile_sorts_unsorted_input() {
        // numpy.percentile([15, 20, 35, 40, 50], [0, 40, 90, 100]) == [15, 29, 46, 50]
        let v = [50.0, 15.0, 40.0, 20.0, 35.0];
        assert_eq!(percentile(&v, 0.0), Some(15.0));
        assert!((percentile(&v, 40.0).unwrap() - 29.0).abs() < 1e-4);
        assert!((percentile(&v, 90.0).unwrap() - 46.0).abs() < 1e-4);
        assert_eq!(percentile(&v, 100.0), Some(50.0));
        assert_eq!(percentile(&[7.0], 90.0), Some(7.0));
    }

    #[test]
    fn percentile_clamps_p_into_0_100() {
        let v = [1.0, 2.0, 3.0, 4.0];
        assert_eq!(percentile(&v, -10.0), Some(1.0));
        assert_eq!(percentile(&v, 250.0), Some(4.0));
    }

    #[test]
    fn match_window_is_inclusive_on_both_sides() {
        assert_eq!(match_segments(&[utt(5_000)], &[6_000], 1_000), vec![Some(0)]);
        assert_eq!(match_segments(&[utt(5_000)], &[4_000], 1_000), vec![Some(0)]);
        assert_eq!(match_segments(&[utt(5_000)], &[6_001], 1_000), vec![None]);
        assert_eq!(match_segments(&[utt(5_000)], &[3_999], 1_000), vec![None]);
    }

    #[test]
    fn picks_nearest_end_on_either_side() {
        // Câu dài hơn 8 s bị cắt cưỡng bức (max_segment_ms): đoạn cắt giữa câu cũng nằm trong phạm vi.
        assert_eq!(match_segments(&[utt(9_000)], &[8_200, 9_030], 1_000), vec![Some(1)]);
        assert_eq!(match_segments(&[utt(5_000)], &[4_900, 5_800], 1_000), vec![Some(0)]);
        assert_eq!(match_segments(&[utt(5_000)], &[4_200, 5_100], 1_000), vec![Some(1)]);
    }
}
```

- [ ] **Step 3: Chạy test để thấy lỗi**

Run: `cargo test -p latency-bench`
Expected: FAIL, lỗi biên dịch vì chưa có `percentile`, `Utterance`, `match_segments`.

- [ ] **Step 4: Viết phần code** ở đầu `crates/latency-bench/src/stats.rs`:

```rust
//! Phân vị và ghép đoạn với câu thật.

use serde::{Deserialize, Serialize};

/// Phân vị kiểu nội suy tuyến tính (giống `numpy.percentile` mặc định). `p` ngoài [0, 100] được kẹp về hai đầu.
pub fn percentile(values: &[f32], p: f32) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    let mut v = values.to_vec();
    v.sort_by(f32::total_cmp);
    let rank = (p.clamp(0.0, 100.0) / 100.0) * (v.len() - 1) as f32;
    let (lo, hi) = (rank.floor() as usize, rank.ceil() as usize);
    Some(v[lo] + (v[hi] - v[lo]) * (rank - lo as f32))
}

/// Một câu trong file mốc thật do `build_sessions.py` tạo.
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Utterance {
    pub id: String,
    pub lang: String,
    pub start_ms: u64,
    /// Thời điểm người nói thực sự dừng câu (spec A2).
    pub end_ms: u64,
    pub text: String,
}

/// Trả, với mỗi câu, chỉ số đoạn có `end_ms` gần mốc dừng câu nhất (trong phạm vi `max_ms`).
/// Mỗi đoạn chỉ được ghép với một câu.
///
/// Giả định: ghép tham lam theo thứ tự câu; đúng khi câu dài ít nhất khoảng 3 giây và cách nhau ít nhất 0,4 giây.
/// Câu ngắn hơn hoặc sát nhau hơn thì câu đi trước có thể lấy mất đoạn của câu sau.
pub fn match_segments(utterances: &[Utterance], segment_ends_ms: &[u64], max_ms: u64) -> Vec<Option<usize>> {
    let mut used = vec![false; segment_ends_ms.len()];
    utterances
        .iter()
        .map(|u| {
            let best = segment_ends_ms
                .iter()
                .enumerate()
                .filter(|(i, _)| !used[*i])
                .map(|(i, &end)| (i, end.abs_diff(u.end_ms)))
                .filter(|&(_, d)| d <= max_ms)
                .min_by_key(|&(_, d)| d)
                .map(|(i, _)| i);
            if let Some(i) = best {
                used[i] = true;
            }
            best
        })
        .collect()
}
```

- [ ] **Step 5: Chạy lại test**

Run: `cargo test -p latency-bench`
Expected: PASS, `test result: ok. 7 passed`. Lúc này `cargo build` còn cảnh báo các hàm chưa được dùng; Task 5 sẽ dùng chúng.

- [ ] **Step 6: Commit**

```bash
git add crates/latency-bench
git commit -m "feat(latency-bench): phân vị và ghép đoạn với mốc dừng câu"
```

### Task 5: `latency-bench latency`

**Files:**
- Create: `crates/latency-bench/src/latency.rs`
- Modify: `crates/latency-bench/Cargo.toml` (bản cuối)
- Modify: `crates/latency-bench/src/main.rs` (bản cuối)

Quy tắc giống app:
- Bỏ đoạn có `no_speech_prob > 0,6` (§6.4).
- Không dịch đoạn cùng ngôn ngữ với ngôn ngữ đích.
- Khi chỉ cho phép một ngôn ngữ thì dùng tối đa 100 token của đoạn trước làm prompt.
- `asr-worker` được làm nóng, và `llama-server` được gửi một request làm nóng, trước khi phát lại.

Kết quả JSON gồm:
- `summary`: `shown_p50_ms`, `shown_p90_ms`, `first_p50_ms`, và p50 của từng bước;
- `usage`: RSS lớn nhất, `phys_footprint` lớn nhất trên macOS, CPU trung bình của từng tiến trình;
- `config`: gồm cả `asr_decode_mode` và `asr_system_info`;
- chi tiết từng câu và từng đoạn.

- [ ] **Step 1: Sửa `crates/latency-bench/Cargo.toml`** thành bản cuối:

```toml
[package]
name = "latency-bench"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

[dependencies]
anyhow.workspace = true
asr-protocol = { path = "../asr-protocol" }
clap.workspace = true
hound.workspace = true
pipeline = { path = "../pipeline" }
serde.workspace = true
serde_json.workspace = true
sysinfo = "0.39.6"

[target.'cfg(target_os = "macos")'.dependencies]
libc = "0.2.189"
```

- [ ] **Step 2: Tạo `crates/latency-bench/src/latency.rs`**

```rust
//! Spike S6: đo độ trễ tổng thể theo đúng định nghĩa của A2.
//!
//! Phát lại một file WAV theo thời gian thực qua VAD, cắt câu, `asr-worker` và `llama-server`
//! (ba luồng chạy song song như trong app), rồi so với mốc dừng câu thật của từng câu.

use crate::stats::{Utterance, match_segments, percentile};
use anyhow::{Context, Result, bail};
use asr_protocol::{MAX_PCM_SAMPLES, MAX_PROMPT_TOKENS, MIN_PCM_SAMPLES, TranscribeRequest, audio_ctx_for_samples};
use pipeline::asr_client::AsrWorker;
use pipeline::llama::{LlamaServer, max_tokens_for};
use pipeline::prompt::{Lang, translation_prompt};
use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES, Segment, Segmenter, SegmenterConfig};
use pipeline::vad::SileroVad;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessesToUpdate, System};

/// Bỏ đoạn có `no_speech_prob > 0,6` (spec §6.4).
const NO_SPEECH_MAX: f32 = 0.6;
/// Cửa sổ (ms) ghép đoạn với mốc dừng câu thật, xem `match_segments`.
const MATCH_WINDOW_MS: u64 = 1_000;
/// Khung âm thanh tới trễ hơn thời gian thực quá ngưỡng này (ms) thì kết quả lệch cùng cỡ: báo cho người chạy.
const FEED_LAG_WARN_MS: f64 = 100.0;

// Lý do một đoạn không được dịch, ghi ở `SegmentRecord::skipped`.
/// `no_speech_prob` quá cao, hoặc chữ rỗng: app bỏ đoạn này (§6.4).
const SKIP_NO_SPEECH: &str = "no_speech";
/// Đoạn ngắn hơn `MIN_PCM_SAMPLES`: không gửi cho `asr-worker`.
const SKIP_TOO_SHORT: &str = "too_short";
/// Đoạn dài hơn `MAX_PCM_SAMPLES`: không gửi cho `asr-worker`.
const SKIP_TOO_LONG: &str = "too_long";
/// Bản dịch rỗng: không có gì để hiện.
const SKIP_EMPTY_TRANSLATION: &str = "empty_translation";
/// Ngôn ngữ nguồn trùng ngôn ngữ đích: hiện luôn bản chép lời (F2).
const SKIP_SAME_LANG: &str = "same_lang";
/// Ngôn ngữ ngoài tập của công cụ; ghi thành `lang_ngoai_tap:<mã>`.
const SKIP_OTHER_LANG: &str = "lang_ngoai_tap";
const SKIP_KINDS: [&str; 6] = [
    SKIP_NO_SPEECH,
    SKIP_TOO_SHORT,
    SKIP_TOO_LONG,
    SKIP_EMPTY_TRANSLATION,
    SKIP_SAME_LANG,
    SKIP_OTHER_LANG,
];

#[derive(clap::Args)]
pub struct LatencyArgs {
    /// WAV 16 kHz mono do `build_sessions.py` tạo.
    #[arg(long)]
    session: PathBuf,
    /// File mốc thật (JSON) đi kèm session.
    #[arg(long)]
    truth: PathBuf,
    #[arg(long)]
    asr_worker: PathBuf,
    #[arg(long)]
    asr_model: PathBuf,
    #[arg(long)]
    llama_server: PathBuf,
    #[arg(long)]
    mt_model: PathBuf,
    #[arg(long)]
    vad_model: PathBuf,
    #[arg(long, value_delimiter = ',', default_value = "en,zh,ja,ko,vi")]
    languages: Vec<String>,
    #[arg(long, default_value = "vi")]
    target: String,
    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    use_gpu: bool,
    #[arg(long, default_value_t = 4)]
    asr_threads: u32,
    /// Sàn cho audio_ctx, từ 0 đến 1500 (mặc định 0: không đặt sàn): audio_ctx = max(công thức, N), như
    /// `asr-eval --min-ctx`. Để đo S6 với mức sàn nếu S7 khuyến nghị.
    #[arg(long, default_value_t = 0, value_parser = clap::value_parser!(i32).range(0..=1500))]
    min_ctx: i32,
    #[arg(long, default_value_t = 300)]
    end_silence_ms: u64,
    /// Nhãn máy và gói model, ví dụ `m1-16gb-chuan`.
    #[arg(long)]
    label: String,
    #[arg(long)]
    out: PathBuf,
    #[arg(long, default_value = "logs")]
    log_dir: PathBuf,
    /// Tham số thêm cho llama-server, cách nhau bằng dấu cách, ví dụ "--no-repack".
    #[arg(long, default_value = "", allow_hyphen_values = true)]
    llama_args: String,
}

#[derive(Serialize, Clone, Debug, Default)]
struct SegmentRecord {
    id: u64,
    start_ms: u64,
    end_ms: u64,
    audio_ms: u64,
    closed_at_ms: f64,
    asr_done_at_ms: f64,
    lid_ms: f32,
    asr_ms: f32,
    lang: String,
    lang_prob: f32,
    text: String,
    no_speech_prob: f32,
    /// Số token của câu gốc theo `/tokenize`, và `max_tokens` đã gửi cho bản dịch (§6.5).
    src_tokens: Option<usize>,
    max_tokens: Option<u32>,
    mt_first_at_ms: Option<f64>,
    mt_done_at_ms: Option<f64>,
    translation: Option<String>,
    /// "stop", hoặc "length" khi bản dịch chạm `max_tokens` (bị cụt).
    finish_reason: Option<String>,
    /// Lúc phụ đề hiện đủ: xong bản dịch, hoặc xong chép lời nếu không cần dịch. `None` nếu đoạn bị bỏ
    /// (xem `is_dropped`): không có gì hiện ra nên không có độ trễ để đo.
    shown_at_ms: Option<f64>,
    first_shown_at_ms: Option<f64>,
    skipped: Option<String>,
}

#[derive(Serialize)]
struct UtteranceLatency {
    id: String,
    lang: String,
    end_ms: u64,
    segment_id: Option<u64>,
    /// Mốc dừng của đoạn ghép được trừ mốc dừng thật (ms). Lệch lớn nghĩa là mốc thật không khớp lúc người nói dừng
    /// (xem `build_sessions.py`), và độ trễ của câu đó lệch cùng cỡ: đoạn dừng sớm hơn mốc thật (âm) thì độ trễ bị đo
    /// thiếu, muộn hơn (dương) thì bị đo thừa.
    end_offset_ms: Option<i64>,
    shown_latency_ms: Option<f64>,
    first_latency_ms: Option<f64>,
    /// Đoạn ghép được có bản dịch. `false` nếu không ghép được đoạn nào.
    translated: bool,
    /// Lý do đoạn ghép được không có bản dịch, nếu có.
    skipped: Option<String>,
}

#[derive(Serialize, Default)]
struct ProcessUsage {
    peak_rss_mb: f64,
    /// macOS: `phys_footprint` (số Activity Monitor hiển thị), tính cả bộ nhớ Metal mà RSS bỏ sót, nhưng không
    /// tính trang của file model được mmap. Nền tảng khác để 0; VRAM trên Windows đo bằng `vram-sample.ps1`.
    peak_footprint_mb: f64,
    avg_cpu_percent: f64,
    samples: usize,
}

#[derive(Serialize)]
struct Report {
    label: String,
    machine: HashMap<String, String>,
    config: HashMap<String, String>,
    summary: HashMap<String, f64>,
    usage: HashMap<String, ProcessUsage>,
    utterances: Vec<UtteranceLatency>,
    segments: Vec<SegmentRecord>,
}

pub fn run(args: LatencyArgs) -> Result<()> {
    std::fs::create_dir_all(&args.log_dir)?;
    let target = Lang::from_code(&args.target).context("--target không hợp lệ")?;
    let truth: Vec<Utterance> = serde_json::from_reader(
        std::fs::File::open(&args.truth).with_context(|| format!("không mở được {}", args.truth.display()))?,
    )?;
    let samples = read_wav_16k_mono(&args.session)?;
    // Nạp VAD trước khi chạy tiến trình phụ: đường dẫn sai thì báo lỗi ngay mà không để lại server chạy dở,
    // và việc nạp không chiếm giờ của lượt phát lại.
    let mut vad = SileroVad::load(&args.vad_model)?;
    let mut segmenter = Segmenter::new(SegmenterConfig {
        end_silence_ms: args.end_silence_ms,
        ..Default::default()
    });

    let (mut asr, ready) = AsrWorker::spawn(
        &args.asr_worker,
        &args.asr_model,
        args.use_gpu,
        args.asr_threads,
        &args.log_dir.join(format!("asr-worker-{}.log", args.label)),
    )?;
    let asr_warmup_ms = asr.warmup()?;
    let llama_args: Vec<String> = args.llama_args.split_whitespace().map(String::from).collect();
    let llama = LlamaServer::spawn(
        &args.llama_server,
        &args.mt_model,
        &llama_args,
        &args.log_dir.join(format!("llama-server-{}.log", args.label)),
    )?;
    llama.translate(&translation_prompt("Hello.", Lang::En, target), 32)?; // làm nóng
    println!(
        "asr: {} ({}), chế độ giải mã {}, làm nóng {asr_warmup_ms:.0} ms",
        ready.backend, ready.whisper_version, ready.decode_mode
    );

    let pids = HashMap::from([
        ("latency-bench".to_string(), std::process::id()),
        ("asr-worker".to_string(), asr.pid()),
        ("llama-server".to_string(), llama.pid()),
    ]);
    let stop_sampler = Arc::new(AtomicBool::new(false));
    let sampler = spawn_sampler(pids, stop_sampler.clone());

    let (seg_tx, seg_rx) = mpsc::channel::<(Segment, f64)>();
    let (asr_tx, asr_rx) = mpsc::channel::<SegmentRecord>();
    let (rec_tx, rec_rx) = mpsc::channel::<SegmentRecord>();
    let origin = Instant::now();
    let now_ms = move || origin.elapsed().as_secs_f64() * 1000.0;

    let languages = args.languages.clone();
    let min_ctx = args.min_ctx;
    let asr_thread = std::thread::spawn(move || -> Result<()> {
        let mut prompts: HashMap<String, Vec<i32>> = HashMap::new();
        for (segment, closed_at_ms) in seg_rx {
            let mut rec = SegmentRecord {
                id: segment.id,
                start_ms: segment.start_ms,
                end_ms: segment.end_ms,
                audio_ms: segment.samples.len() as u64 * 1000 / 16_000,
                closed_at_ms,
                ..Default::default()
            };
            // Worker từ chối đoạn ngoài khoảng, và một lỗi làm dừng cả lượt đo: không gửi, chỉ ghi lại.
            if let Some(reason) = pcm_skip_reason(segment.samples.len()) {
                rec.skipped = Some(reason.into());
                rec.asr_done_at_ms = now_ms();
                asr_tx.send(rec)?;
                continue;
            }
            let pcm: Vec<i16> = segment
                .samples
                .iter()
                .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                .collect();
            let prompt_tokens = if languages.len() == 1 {
                prompts.get(&languages[0]).cloned().unwrap_or_default()
            } else {
                Vec::new()
            };
            let result = asr.transcribe(TranscribeRequest {
                segment_id: segment.id,
                audio_ctx: audio_ctx_for_samples(pcm.len()).max(min_ctx).min(1500),
                pcm,
                languages: languages.clone(),
                prompt_tokens,
            })?;
            rec.asr_done_at_ms = now_ms();
            let tokens = prompts.entry(result.lang.clone()).or_default();
            tokens.extend(&result.tokens);
            let excess = tokens.len().saturating_sub(MAX_PROMPT_TOKENS);
            tokens.drain(..excess);
            rec.lid_ms = result.lid_ms;
            rec.asr_ms = result.asr_ms;
            rec.lang = result.lang;
            rec.lang_prob = result.lang_prob;
            rec.text = result.text;
            rec.no_speech_prob = result.no_speech_prob;
            asr_tx.send(rec)?;
        }
        Ok(())
    });

    let mt_thread = std::thread::spawn(move || -> Result<()> {
        for mut rec in asr_rx {
            if rec.skipped.is_none() {
                match route(&rec, target) {
                    Err(reason) => rec.skipped = Some(reason),
                    Ok(src) => {
                        // Tính `max_tokens` theo §6.5. Lần gọi /tokenize nằm trong thời gian của bước dịch.
                        let src_tokens = llama.count_tokens(&rec.text)?;
                        let max_tokens = max_tokens_for(src_tokens);
                        let t = llama.translate(&translation_prompt(&rec.text, src, target), max_tokens)?;
                        let done = now_ms();
                        rec.src_tokens = Some(src_tokens);
                        rec.max_tokens = Some(max_tokens);
                        rec.mt_first_at_ms = Some(done - (t.total_ms - t.first_token_ms) as f64);
                        rec.mt_done_at_ms = Some(done);
                        rec.finish_reason = t.finish_reason;
                        if t.text.is_empty() {
                            rec.skipped = Some(SKIP_EMPTY_TRANSLATION.into());
                        } else {
                            rec.translation = Some(t.text);
                        }
                    }
                }
            }
            (rec.shown_at_ms, rec.first_shown_at_ms) = shown_times(&rec);
            rec_tx.send(rec)?;
        }
        Ok(())
    });

    // Phát lại theo thời gian thực: khung i sẵn sàng ở thời điểm (i + 1) × 32 ms, như khi thu thật.
    let mut max_lag = Duration::ZERO;
    let mut play = || -> Result<()> {
        for (i, frame) in samples.as_chunks::<FRAME_SAMPLES>().0.iter().enumerate() {
            let due = origin + Duration::from_millis((i as u64 + 1) * FRAME_MS);
            if let Some(wait) = due.checked_duration_since(Instant::now()) {
                std::thread::sleep(wait);
            }
            max_lag = max_lag.max(Instant::now().saturating_duration_since(due));
            let prob = vad.prob(frame)?;
            for segment in segmenter.push(frame, prob) {
                seg_tx.send((segment, now_ms()))?;
            }
        }
        if let Some(segment) = segmenter.flush() {
            seg_tx.send((segment, now_ms()))?;
        }
        Ok(())
    };
    let played = play();
    // Lỗi ở đây cũng phải đi qua bước đóng kênh và join bên dưới, để `asr-worker` và `llama-server` được dọn.
    // Thoát sớm thì tiến trình kết thúc trước khi hai luồng kịp `Drop`, và server bị bỏ lại chạy mồ côi.
    drop(seg_tx);
    let asr_result = asr_thread.join().expect("luồng ASR panic");
    let mt_result = mt_thread.join().expect("luồng MT panic");
    stop_sampler.store(true, Ordering::Relaxed);
    let usage = sampler.join().expect("luồng đo tài nguyên panic");
    // Báo lỗi của luồng ở cuối chuỗi trước: khi luồng MT chết, luồng ASR và luồng phát lại chỉ còn báo "kênh đã đóng"
    // ở lần gửi kế tiếp, che mất nguyên nhân thật. Ngược lại, khi luồng ASR chết thì luồng MT dừng bình thường.
    mt_result?;
    asr_result?;
    played?;

    let mut segments: Vec<SegmentRecord> = rec_rx.into_iter().collect();
    segments.sort_by_key(|s| s.id);
    let utterances = utterance_latencies(&truth, &segments);
    let mut summary = build_summary(&utterances, &segments);
    if summary["measured"] == 0.0 {
        bail!("không đo được câu nào (không ghép được với mốc thật, hoặc đoạn đều bị bỏ); kiểm tra file truth và VAD");
    }
    let feed_lag_max_ms = max_lag.as_secs_f64() * 1000.0;
    summary.insert("feed_lag_max_ms".into(), feed_lag_max_ms);

    let report = Report {
        label: args.label.clone(),
        machine: machine_info(),
        config: HashMap::from([
            ("asr_backend".to_string(), ready.backend),
            ("asr_decode_mode".to_string(), ready.decode_mode),
            ("whisper_version".to_string(), ready.whisper_version),
            ("asr_system_info".to_string(), ready.system_info),
            ("asr_model".to_string(), args.asr_model.display().to_string()),
            ("mt_model".to_string(), args.mt_model.display().to_string()),
            ("languages".to_string(), args.languages.join(",")),
            ("target".to_string(), args.target.clone()),
            ("end_silence_ms".to_string(), args.end_silence_ms.to_string()),
            ("min_ctx".to_string(), args.min_ctx.to_string()),
            ("llama_args".to_string(), args.llama_args.clone()),
        ]),
        summary,
        usage,
        utterances,
        segments,
    };
    serde_json::to_writer_pretty(std::fs::File::create(&args.out)?, &report)?;
    let s = &report.summary;
    println!(
        "{}: p50 = {:.0} ms, p90 = {:.0} ms, chữ đầu p50 = {:.0} ms, ghép được {}/{} câu",
        report.label, s["shown_p50_ms"], s["shown_p90_ms"], s["first_p50_ms"], s["matched"], s["utterances"]
    );
    println!(
        "  đo được {} câu; không ghép được {}, không có bản dịch {}; đoạn bị bỏ {}, bản dịch bị cụt (length) {}; \
         mốc dừng lệch tối đa {:.0} ms",
        s["measured"],
        s["unmatched"],
        s["no_translation"],
        s["segments_dropped"],
        s["finish_length"],
        s["end_offset_max_abs_ms"]
    );
    if feed_lag_max_ms > FEED_LAG_WARN_MS {
        println!(
            "  CẢNH BÁO: phát lại chậm hơn thời gian thực tới {feed_lag_max_ms:.0} ms (máy đang bận?); \
             độ trễ đo được bị lệch cùng cỡ"
        );
    }
    Ok(())
}

/// Lý do không gửi đoạn cho `asr-worker`: số mẫu ngoài khoảng worker nhận.
fn pcm_skip_reason(n_samples: usize) -> Option<&'static str> {
    if n_samples < MIN_PCM_SAMPLES {
        Some(SKIP_TOO_SHORT)
    } else if n_samples > MAX_PCM_SAMPLES {
        Some(SKIP_TOO_LONG)
    } else {
        None
    }
}

/// Quy tắc của app cho một đoạn đã chép lời: `Ok(ngôn ngữ nguồn)` nếu phải dịch, `Err(lý do)` nếu bỏ bước dịch.
fn route(rec: &SegmentRecord, target: Lang) -> Result<Lang, String> {
    if rec.no_speech_prob > NO_SPEECH_MAX || rec.text.trim().is_empty() {
        return Err(SKIP_NO_SPEECH.into());
    }
    match Lang::from_code(&rec.lang) {
        Some(src) if src == target => Err(SKIP_SAME_LANG.into()),
        Some(src) => Ok(src),
        None => Err(format!("{SKIP_OTHER_LANG}:{}", rec.lang)),
    }
}

/// Đoạn bị bỏ: app không hiện gì cho đoạn này, nên không có độ trễ để đo và không được tính là "hiện nhanh".
/// `same_lang` thì khác: app hiện luôn bản chép lời, nên có độ trễ (bằng lúc xong chép lời).
fn is_dropped(reason: &str) -> bool {
    matches!(
        reason,
        SKIP_NO_SPEECH | SKIP_TOO_SHORT | SKIP_TOO_LONG | SKIP_EMPTY_TRANSLATION
    )
}

/// Đoạn đã qua `asr-worker`. `too_short` và `too_long` bị loại từ trước nên `asr_ms` và `lid_ms` của chúng là 0.
fn was_transcribed(rec: &SegmentRecord) -> bool {
    !matches!(rec.skipped.as_deref(), Some(SKIP_TOO_SHORT | SKIP_TOO_LONG))
}

/// (Lúc hiện đủ, lúc hiện chữ đầu) của một đoạn đã xử lý xong; `None` nếu đoạn bị bỏ.
fn shown_times(rec: &SegmentRecord) -> (Option<f64>, Option<f64>) {
    if rec.skipped.as_deref().is_some_and(is_dropped) {
        return (None, None);
    }
    (
        Some(rec.mt_done_at_ms.unwrap_or(rec.asr_done_at_ms)),
        Some(rec.mt_first_at_ms.unwrap_or(rec.asr_done_at_ms)),
    )
}

/// Ghép từng câu thật với đoạn có mốc dừng gần nhất, rồi tính độ trễ từ lúc người nói dừng câu (A2).
fn utterance_latencies(truth: &[Utterance], segments: &[SegmentRecord]) -> Vec<UtteranceLatency> {
    let ends: Vec<u64> = segments.iter().map(|s| s.end_ms).collect();
    let matches = match_segments(truth, &ends, MATCH_WINDOW_MS);
    truth
        .iter()
        .zip(&matches)
        .map(|(u, m)| {
            let seg = m.map(|i| &segments[i]);
            let since_end = |t: f64| t - u.end_ms as f64;
            UtteranceLatency {
                id: u.id.clone(),
                lang: u.lang.clone(),
                end_ms: u.end_ms,
                segment_id: seg.map(|s| s.id),
                end_offset_ms: seg.map(|s| s.end_ms as i64 - u.end_ms as i64),
                shown_latency_ms: seg.and_then(|s| s.shown_at_ms).map(since_end),
                first_latency_ms: seg.and_then(|s| s.first_shown_at_ms).map(since_end),
                translated: seg.is_some_and(|s| s.translation.is_some()),
                skipped: seg.and_then(|s| s.skipped.clone()),
            }
        })
        .collect()
}

/// Bản tóm tắt của một lượt đo:
/// - `shown_*`, `first_*`: phân vị độ trễ trên các câu đo được (`measured`), tức câu ghép được với một đoạn không bị bỏ.
/// - `asr_*`, `lid_*`, `mt_*`: phân vị thời gian từng bước (ms), trên các đoạn đã qua bước đó.
/// - `utterances`: số câu thật; `matched`: số câu ghép được với một đoạn (kể cả đoạn bị bỏ); `unmatched`: số câu còn lại.
/// - `no_translation`: số câu ghép được với một đoạn không có bản dịch (đoạn bị bỏ, hoặc không cần dịch). Không gồm
///   câu không ghép được: không biết chúng ra sao, vì không có đoạn nào đại diện.
/// - `end_offset_max_abs_ms`: lệch lớn nhất giữa mốc dừng của đoạn và mốc thật, trên các câu ghép được.
/// - `segments`, `segments_translated`, `segments_dropped`; `skipped_<lý do>`: số đoạn theo từng lý do.
/// - `finish_length`: số bản dịch chạm `max_tokens` (bị cụt).
fn build_summary(utterances: &[UtteranceLatency], segments: &[SegmentRecord]) -> HashMap<String, f64> {
    let shown: Vec<f32> = utterances
        .iter()
        .filter_map(|u| u.shown_latency_ms)
        .map(|v| v as f32)
        .collect();
    let first: Vec<f32> = utterances
        .iter()
        .filter_map(|u| u.first_latency_ms)
        .map(|v| v as f32)
        .collect();
    let transcribed = || segments.iter().filter(|s| was_transcribed(s));
    let asr_ms: Vec<f32> = transcribed().map(|s| s.asr_ms).collect();
    let lid_ms: Vec<f32> = transcribed().map(|s| s.lid_ms).collect();
    let mt_ms: Vec<f32> = segments
        .iter()
        .filter_map(|s| s.mt_done_at_ms.map(|d| (d - s.asr_done_at_ms) as f32))
        .collect();
    let mut summary = HashMap::new();
    let mut put = |k: &str, v: Option<f32>| {
        if let Some(v) = v {
            summary.insert(k.to_string(), v as f64);
        }
    };
    put("shown_p50_ms", percentile(&shown, 50.0));
    put("shown_p90_ms", percentile(&shown, 90.0));
    put("first_p50_ms", percentile(&first, 50.0));
    put("asr_p50_ms", percentile(&asr_ms, 50.0));
    put("asr_p90_ms", percentile(&asr_ms, 90.0));
    put("lid_p50_ms", percentile(&lid_ms, 50.0));
    put("mt_p50_ms", percentile(&mt_ms, 50.0));
    put("mt_p90_ms", percentile(&mt_ms, 90.0));
    let offset_max = utterances.iter().filter_map(|u| u.end_offset_ms).map(i64::abs).max();
    put("end_offset_max_abs_ms", Some(offset_max.unwrap_or(0) as f32));

    let mut counts: Vec<(String, usize)> = vec![
        ("utterances".into(), utterances.len()),
        (
            "matched".into(),
            utterances.iter().filter(|u| u.segment_id.is_some()).count(),
        ),
        (
            "unmatched".into(),
            utterances.iter().filter(|u| u.segment_id.is_none()).count(),
        ),
        ("measured".into(), shown.len()),
        (
            "no_translation".into(),
            utterances
                .iter()
                .filter(|u| u.segment_id.is_some() && !u.translated)
                .count(),
        ),
        ("segments".into(), segments.len()),
        (
            "segments_translated".into(),
            segments.iter().filter(|s| s.translation.is_some()).count(),
        ),
        (
            "segments_dropped".into(),
            segments
                .iter()
                .filter(|s| s.skipped.as_deref().is_some_and(is_dropped))
                .count(),
        ),
        (
            "finish_length".into(),
            segments
                .iter()
                .filter(|s| s.finish_reason.as_deref() == Some("length"))
                .count(),
        ),
    ];
    for kind in SKIP_KINDS {
        // `lang_ngoai_tap:<mã>` tính vào `lang_ngoai_tap`.
        let n = segments
            .iter()
            .filter(|s| s.skipped.as_deref().and_then(|r| r.split(':').next()) == Some(kind))
            .count();
        counts.push((format!("skipped_{kind}"), n));
    }
    summary.extend(counts.into_iter().map(|(k, n)| (k, n as f64)));
    summary
}

fn read_wav_16k_mono(path: &PathBuf) -> Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path).with_context(|| format!("không mở được {}", path.display()))?;
    let spec = reader.spec();
    if spec.sample_rate != 16_000 || spec.channels != 1 || spec.bits_per_sample != 16 {
        bail!("{} phải là WAV 16 kHz, mono, 16-bit", path.display());
    }
    Ok(reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32768.0))
        .collect::<Result<_, _>>()?)
}

fn spawn_sampler(
    pids: HashMap<String, u32>,
    stop: Arc<AtomicBool>,
) -> std::thread::JoinHandle<HashMap<String, ProcessUsage>> {
    std::thread::spawn(move || {
        let mut sys = System::new();
        let list: Vec<Pid> = pids.values().map(|&p| Pid::from_u32(p)).collect();
        let mut usage: HashMap<String, ProcessUsage> =
            pids.keys().map(|k| (k.clone(), ProcessUsage::default())).collect();
        while !stop.load(Ordering::Relaxed) {
            sys.refresh_processes(ProcessesToUpdate::Some(&list), true);
            for (name, &pid) in &pids {
                if let (Some(p), Some(u)) = (sys.process(Pid::from_u32(pid)), usage.get_mut(name)) {
                    u.peak_rss_mb = u.peak_rss_mb.max(p.memory() as f64 / 1_048_576.0);
                    #[cfg(target_os = "macos")]
                    if let Some(mb) = phys_footprint_mb(pid) {
                        u.peak_footprint_mb = u.peak_footprint_mb.max(mb);
                    }
                    u.avg_cpu_percent += p.cpu_usage() as f64;
                    u.samples += 1;
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        for u in usage.values_mut() {
            if u.samples > 0 {
                u.avg_cpu_percent /= u.samples as f64;
            }
        }
        usage
    })
}

#[cfg(target_os = "macos")]
fn phys_footprint_mb(pid: u32) -> Option<f64> {
    let mut info = std::mem::MaybeUninit::<libc::rusage_info_v2>::zeroed();
    let ret = unsafe { libc::proc_pid_rusage(pid as i32, libc::RUSAGE_INFO_V2, info.as_mut_ptr().cast()) };
    (ret == 0).then(|| unsafe { info.assume_init() }.ri_phys_footprint as f64 / 1_048_576.0)
}

fn machine_info() -> HashMap<String, String> {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();
    HashMap::from([
        (
            "cpu".to_string(),
            sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default(),
        ),
        ("logical_cores".to_string(), sys.cpus().len().to_string()),
        (
            "physical_cores".to_string(),
            System::physical_core_count().map(|c| c.to_string()).unwrap_or_default(),
        ),
        (
            "ram_gb".to_string(),
            format!("{:.1}", sys.total_memory() as f64 / 1_073_741_824.0),
        ),
        ("os".to_string(), System::long_os_version().unwrap_or_default()),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Một đoạn đã xử lý xong như luồng MT làm: tính `shown_at_ms` từ các mốc và lý do bỏ.
    fn finished(mut rec: SegmentRecord) -> SegmentRecord {
        (rec.shown_at_ms, rec.first_shown_at_ms) = shown_times(&rec);
        rec
    }

    fn translated(end_ms: u64, asr_done: f64, first: f64, done: f64) -> SegmentRecord {
        finished(SegmentRecord {
            end_ms,
            asr_done_at_ms: asr_done,
            mt_first_at_ms: Some(first),
            mt_done_at_ms: Some(done),
            translation: Some("Xin chào".into()),
            finish_reason: Some("stop".into()),
            ..Default::default()
        })
    }

    fn skipped(end_ms: u64, asr_done: f64, reason: &str) -> SegmentRecord {
        finished(SegmentRecord {
            end_ms,
            asr_done_at_ms: asr_done,
            skipped: Some(reason.into()),
            ..Default::default()
        })
    }

    fn utt(id: &str, end_ms: u64) -> Utterance {
        Utterance {
            id: id.into(),
            lang: "en".into(),
            start_ms: 0,
            end_ms,
            text: String::new(),
        }
    }

    fn rec(lang: &str, text: &str, no_speech_prob: f32) -> SegmentRecord {
        SegmentRecord {
            lang: lang.into(),
            text: text.into(),
            no_speech_prob,
            ..Default::default()
        }
    }

    #[test]
    fn segments_outside_the_worker_range_are_not_sent() {
        assert_eq!(pcm_skip_reason(0), Some("too_short"));
        assert_eq!(pcm_skip_reason(MIN_PCM_SAMPLES - 1), Some("too_short"));
        assert_eq!(pcm_skip_reason(MIN_PCM_SAMPLES), None);
        assert_eq!(pcm_skip_reason(MAX_PCM_SAMPLES), None);
        assert_eq!(pcm_skip_reason(MAX_PCM_SAMPLES + 1), Some("too_long"));
    }

    #[test]
    fn route_follows_the_app_rules() {
        assert_eq!(route(&rec("en", "Hello", 0.0), Lang::Vi), Ok(Lang::En));
        assert_eq!(
            route(&rec("ko", "안녕", 0.6), Lang::Vi),
            Ok(Lang::Ko),
            "đúng ngưỡng thì chưa bỏ"
        );
        assert_eq!(route(&rec("en", "Hello", 0.61), Lang::Vi), Err("no_speech".into()));
        assert_eq!(route(&rec("en", "", 0.0), Lang::Vi), Err("no_speech".into()));
        assert_eq!(route(&rec("en", " \n", 0.0), Lang::Vi), Err("no_speech".into()));
        assert_eq!(route(&rec("vi", "Xin chào", 0.0), Lang::Vi), Err("same_lang".into()));
        assert_eq!(
            route(&rec("fr", "Bonjour", 0.0), Lang::Vi),
            Err("lang_ngoai_tap:fr".into())
        );
    }

    #[test]
    fn dropped_segments_have_no_shown_time() {
        for reason in ["no_speech", "too_short", "too_long", "empty_translation"] {
            let s = skipped(5_000, 5_400.0, reason);
            assert_eq!((s.shown_at_ms, s.first_shown_at_ms), (None, None), "{reason}");
        }
        // Cùng ngôn ngữ đích hoặc ngoài tập: app hiện luôn bản chép lời.
        for reason in ["same_lang", "lang_ngoai_tap:fr"] {
            let s = skipped(5_000, 5_400.0, reason);
            assert_eq!(
                (s.shown_at_ms, s.first_shown_at_ms),
                (Some(5_400.0), Some(5_400.0)),
                "{reason}"
            );
        }
        let t = translated(5_000, 5_400.0, 5_700.0, 6_500.0);
        assert_eq!((t.shown_at_ms, t.first_shown_at_ms), (Some(6_500.0), Some(5_700.0)));
    }

    #[test]
    fn utterance_latency_is_measured_from_the_true_end() {
        let segments = [translated(5_030, 5_400.0, 5_700.0, 6_500.0)];
        let u = &utterance_latencies(&[utt("a", 5_000)], &segments)[0];
        assert_eq!(u.segment_id, Some(0));
        assert_eq!(u.shown_latency_ms, Some(1_500.0));
        assert_eq!(u.first_latency_ms, Some(700.0));
        assert_eq!(u.end_offset_ms, Some(30)); // đoạn dừng sau mốc thật 30 ms
        assert!(u.translated);
        assert_eq!(u.skipped, None);
    }

    #[test]
    fn dropped_or_unmatched_utterances_have_no_latency_and_no_translation() {
        let segments = [skipped(5_030, 5_400.0, "no_speech")];
        let all = utterance_latencies(&[utt("a", 5_000), utt("b", 30_000)], &segments);
        let (dropped, unmatched) = (&all[0], &all[1]);
        assert_eq!(dropped.segment_id, Some(0));
        assert_eq!((dropped.shown_latency_ms, dropped.first_latency_ms), (None, None));
        assert!(!dropped.translated);
        assert_eq!(dropped.skipped.as_deref(), Some("no_speech"));
        assert_eq!(unmatched.segment_id, None);
        assert_eq!(unmatched.end_offset_ms, None);
        assert_eq!((unmatched.shown_latency_ms, unmatched.first_latency_ms), (None, None));
        assert!(!unmatched.translated);
        assert_eq!(unmatched.skipped, None);
    }

    #[test]
    fn same_lang_utterance_is_measured_but_has_no_translation() {
        let segments = [skipped(5_030, 5_400.0, "same_lang")];
        let u = &utterance_latencies(&[utt("a", 5_000)], &segments)[0];
        assert_eq!((u.shown_latency_ms, u.first_latency_ms), (Some(400.0), Some(400.0)));
        assert!(!u.translated);
    }

    #[test]
    fn summary_counts_dropped_skipped_and_truncated_separately() {
        let cut = |mut s: SegmentRecord| {
            s.finish_reason = Some("length".into());
            s
        };
        let mut segments = vec![
            translated(900, 1_600.0, 1_900.0, 2_500.0), // dừng sớm hơn mốc thật 100 ms
            cut(translated(5_020, 5_500.0, 5_800.0, 8_000.0)),
            skipped(9_010, 9_400.0, "no_speech"),
            skipped(20_000, 20_000.0, "too_short"), // không ghép với câu nào
            skipped(30_000, 30_500.0, "same_lang"),
            cut(translated(40_000, 40_400.0, 40_600.0, 41_000.0)), // không ghép với câu nào
        ];
        // (asr_ms, lid_ms) của từng đoạn; đoạn too_short chưa từng vào asr-worker nên là 0.
        let steps = [
            (100.0, 10.0),
            (300.0, 30.0),
            (200.0, 20.0),
            (0.0, 0.0),
            (50.0, 5.0),
            (250.0, 25.0),
        ];
        for (seg, (asr, lid)) in segments.iter_mut().zip(steps) {
            seg.asr_ms = asr;
            seg.lid_ms = lid;
        }
        let truth = [
            utt("a", 1_000),
            utt("b", 5_000),
            utt("c", 9_000),
            utt("d", 13_000),
            utt("e", 30_000),
        ];
        let utterances = utterance_latencies(&truth, &segments);
        let s = build_summary(&utterances, &segments);
        let get = |k: &str| s[k];
        assert_eq!(get("utterances"), 5.0);
        assert_eq!(get("matched"), 4.0); // d không có đoạn nào
        assert_eq!(get("unmatched"), 1.0);
        assert_eq!(get("measured"), 3.0); // a, b, e; c bị bỏ
        // Câu ghép được mà không có bản dịch: c bị bỏ, e cùng ngôn ngữ đích. Câu không ghép được (d) tính riêng.
        assert_eq!(get("no_translation"), 2.0);
        // Lệch giữa mốc dừng của đoạn và mốc thật: a -100, b +20, c +10, e 0.
        assert_eq!(get("end_offset_max_abs_ms"), 100.0);
        assert_eq!(get("segments"), 6.0);
        assert_eq!(get("segments_translated"), 3.0);
        assert_eq!(get("segments_dropped"), 2.0);
        assert_eq!(get("skipped_no_speech"), 1.0);
        assert_eq!(get("skipped_too_short"), 1.0);
        assert_eq!(get("skipped_same_lang"), 1.0);
        for zero in [
            "skipped_too_long",
            "skipped_empty_translation",
            "skipped_lang_ngoai_tap",
        ] {
            assert_eq!(get(zero), 0.0, "{zero}");
        }
        assert_eq!(get("finish_length"), 2.0); // hai bản cụt, một bản "stop"
        // Độ trễ đo được: a 1500, b 3000, e 500; chữ đầu: a 900, b 800, e 500 (tính từ mốc thật, không từ mốc đoạn).
        assert_eq!(get("shown_p50_ms"), 1_500.0);
        assert_eq!(get("first_p50_ms"), 800.0);
        // Các bước chỉ tính đoạn đã qua asr-worker: đoạn too_short không được kéo p50 xuống.
        assert_eq!(get("asr_p50_ms"), 200.0);
        assert_eq!(get("lid_p50_ms"), 20.0);
    }

    #[test]
    fn lang_outside_the_set_counts_under_one_key() {
        let segments = [
            skipped(1_000, 1_100.0, "lang_ngoai_tap:fr"),
            skipped(2_000, 2_100.0, "lang_ngoai_tap:de"),
        ];
        let utterances = utterance_latencies(&[utt("a", 1_000), utt("b", 2_000)], &segments);
        assert_eq!(build_summary(&utterances, &segments)["skipped_lang_ngoai_tap"], 2.0);
    }
}
```

- [ ] **Step 3: Sửa `crates/latency-bench/src/main.rs`** thành bản cuối:

```rust
//! Công cụ đo cho Giai đoạn 0: `latency` (S6) và `asr-eval` (S7, A4).

mod asr_eval;
mod latency;
mod stats;

use clap::Parser;

#[derive(Parser)]
enum Command {
    /// Đo độ trễ tổng thể trên một session phát lại theo thời gian thực.
    Latency(latency::LatencyArgs),
    /// Chép lời bộ clip A4 để tính WER/CER.
    AsrEval(asr_eval::AsrEvalArgs),
}

fn main() -> anyhow::Result<()> {
    match Command::parse() {
        Command::Latency(args) => latency::run(args),
        Command::AsrEval(args) => asr_eval::run(args),
    }
}
```

- [ ] **Step 4: Build, test, clippy, kiểm tra phụ thuộc**

Run:
```bash
cargo build --release -p latency-bench
cargo test && cargo clippy --all-targets -- -D warnings
cargo deny check && cargo audit
```
Expected:
- `cargo test` chạy các crate trong `crates/` và qua hết:
  - asr-protocol 14;
  - asr-worker 5 (bản không có feature);
  - audio-capture 11, cộng 16 ở `tests/edge.rs` (nếu đã làm kế hoạch 04);
  - pipeline 37, `vad_reference` 1 ignored;
  - latency-bench 15.
- clippy không có cảnh báo.
- `cargo deny check` in `advisories ok, bans ok, licenses ok, sources ok`.

- [ ] **Step 5: Commit**

```bash
git add crates/latency-bench Cargo.lock
git commit -m "feat(latency-bench): đo độ trễ tổng thể theo A2, kèm RAM và CPU"
```

### Task 6: Session phát lại và các script tổng hợp

**Files:**
- Create: `bench/phase0/latency/build_sessions.py`
- Create: `bench/phase0/latency/run_matrix.py`
- Create: `bench/phase0/latency/summarize.py`
- Create: `bench/phase0/latency/vram-sample.ps1`
- Create: `bench/phase0/latency/vram_peak.py`

Có sáu session, mỗi session khoảng 180 giây, ghép từ các clip băng rộng của bộ A4 (đã cắt im lặng ở hai đầu). Giữa các câu có khoảng lặng ngẫu nhiên 0,4–1,6 giây.
- Anh, Trung, Nhật, Hàn → Việt.
- Việt → Anh.
- `mixed`: xen kẽ Anh, Trung, Nhật, Hàn → Việt, để thử nhận diện ngôn ngữ.

Tập ngôn ngữ cho phép luôn là mặc định của F2 (`en,zh,ja,ko,vi`), để bước nhận diện ngôn ngữ chạy giống app.

**Mốc thật (truth)** của mỗi câu lấy bằng Silero VAD chạy trên onnxruntime, là bản tham chiếu độc lập với candle-onnx, giống `ref_probs.py`:
- bắt đầu là khung 32 ms đầu tiên, và dừng là khung cuối cùng, có xác suất ≥ 0,5;
- mỗi clip bắt đầu ở ranh giới khung 512 mẫu của session.

Lý do đổi: review lúc thực thi thấy cách cắt theo năng lượng trong kế hoạch cũ (RMS < 2% mức lớn nhất) cho mốc dừng trễ hơn lúc người nói dừng thật tới 1,6–2,5 giây ở các clip có đuôi nhiễu nền.

| Cách lấy mốc dừng | Số câu ghép được |
|---|---|
| Cắt theo năng lượng | 54/99 (tiếng Nhật 0/14) |
| Silero VAD | 96/99 |

Giới hạn đã biết:
- Mốc dừng lấy từ cùng loại model VAD mà app dùng. Nếu VAD bỏ sót một từ cuối rất nhỏ thì cả mốc lẫn pipeline cùng bỏ sót, nên độ trễ có thể bị đo thiếu một chút.
- 3/99 clip rất nhỏ (khoảng −60 dBFS), đứng sau tiếng to, không được VAD nhận ra. Ghi nhận cho MVP: cân nhắc chuẩn hóa mức âm lượng trước VAD.
- Kết quả có thêm `end_offset_ms` cho từng câu và `end_offset_max_abs_ms`, để kiểm mốc: lệch lớn là dấu hiệu mốc sai.

- [ ] **Step 1: Tạo `bench/phase0/latency/build_sessions.py`**

```python
"""S6: dựng các session phát lại cho `latency-bench latency`, từ clip băng rộng của bộ A4.

Mỗi session nối các clip đã cắt bỏ im lặng hai đầu, xen giữa là khoảng lặng ngẫu nhiên 0,4–1,6 giây,
và kèm file mốc thật: thời điểm bắt đầu và dừng của từng câu (spec A2).

Mốc bắt đầu và dừng của câu là khung 32 ms đầu và cuối mà Silero VAD cho xác suất ≥ 0,5, chạy bằng onnxruntime
(bản tham chiếu độc lập với candle-onnx trong crate `pipeline`, xem `bench/phase0/vad/ref_probs.py`). Không lấy mốc
theo năng lượng: nhiều clip còn đuôi nhiễu nền ổn định (có clip tiếng Nhật nhiễu chỉ thấp hơn tiếng nói 15 dB) hoặc một
tiếng click ở khung cuối, nên mốc trễ hơn lúc người nói dừng thật tới hơn 2 giây. Khi đó câu không ghép được với đoạn
nào, hoặc ghép được nhưng độ trễ bị đo thiếu.
Mỗi clip bắt đầu ở ranh giới khung 512 mẫu của session, để VAD trong session thấy đúng các khung như lúc dựng mốc.
Vài clip quá nhỏ (RMS dưới khoảng −55 dBFS) bị VAD trong session bỏ sót dù chạy riêng thì nhận ra; câu đó hiện là
"không ghép được" khi đo.

Dùng:  uv run --no-project --python 3.12 --with "numpy==2.5.3" --with "onnxruntime==1.30.0" \
         python bench/phase0/latency/build_sessions.py [--seconds 180]
Kết quả: bench/phase0/data/latency/<tên>.wav và <tên>.truth.json, cùng sessions.json (ngôn ngữ đích).
"""
import argparse
import json
import os
import random
import wave

import numpy as np
import onnxruntime as ort

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DATA = os.path.join(ROOT, "bench", "phase0", "data")
VAD_MODEL = os.path.join(ROOT, "models", "silero_vad_v6.2.3.onnx")
# Khung VAD: 512 mẫu = 32 ms ở 16 kHz, giống crates/pipeline/src/segmenter.rs.
FRAME = 512
# Tên session -> (ngôn ngữ của các câu, ngôn ngữ đích).
SESSIONS = {
    "en": (["en"], "vi"),
    "zh": (["zh"], "vi"),
    "ja": (["ja"], "vi"),
    "ko": (["ko"], "vi"),
    "vi": (["vi"], "en"),
    "mixed": (["en", "zh", "ja", "ko"], "vi"),
}


def read(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def trim(x, frame=320):
    """Bỏ im lặng hai đầu: khung 20 ms có RMS dưới 2% mức lớn nhất coi là im lặng."""
    n = len(x) // frame
    rms = np.sqrt((x[: n * frame].astype(np.float32).reshape(n, frame) ** 2).mean(axis=1))
    voiced = np.nonzero(rms > 0.02 * rms.max())[0]
    return x[voiced[0] * frame:(voiced[-1] + 1) * frame] if len(voiced) else x[:0]


def speech_frames(vad, x):
    """Chỉ số khung (512 mẫu) đầu và cuối mà Silero VAD cho xác suất ≥ 0,5, hoặc None nếu không có khung nào.

    Ghép 64 mẫu cuối của khung trước làm ngữ cảnh, giống OnnxWrapper của silero-vad và ref_probs.py.
    """
    audio = x.astype(np.float32) / 32768.0
    state = np.zeros((2, 1, 128), dtype=np.float32)
    context = np.zeros((1, 64), dtype=np.float32)
    sr = np.array(16000, dtype=np.int64)
    voiced = []
    for i in range(len(audio) // FRAME):
        chunk = audio[i * FRAME:(i + 1) * FRAME][None, :]
        out, state = vad.run(None, {"input": np.concatenate([context, chunk], axis=1), "state": state, "sr": sr})
        context = chunk[:, -64:]
        if float(out.reshape(-1)[0]) >= 0.5:
            voiced.append(i)
    return (voiced[0], voiced[-1]) if voiced else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=180)
    args = ap.parse_args()
    vad = ort.InferenceSession(VAD_MODEL, providers=["CPUExecutionProvider"])
    clips = [json.loads(line) for line in open(os.path.join(DATA, "asr", "manifest.jsonl"), encoding="utf-8")]
    clips = [c for c in clips if not c["narrowband"]]
    out_dir = os.path.join(DATA, "latency")
    os.makedirs(out_dir, exist_ok=True)
    index = {}
    for name, (langs, target) in SESSIONS.items():
        pool = [c for c in clips if c["lang"] in langs]
        missing = [lang for lang in langs if not any(c["lang"] == lang for c in pool)]
        if missing:
            print(f"bỏ qua session {name}: chưa có clip {missing}")
            continue
        rng = random.Random(name)
        rng.shuffle(pool)
        if len(langs) > 1:  # xen kẽ ngôn ngữ để thử nhận diện ngôn ngữ
            by_lang = {lang: [c for c in pool if c["lang"] == lang] for lang in langs}
            pool = [c for group in zip(*by_lang.values()) for c in group]
        audio, truth = [np.zeros(32 * FRAME, dtype=np.int16)], []  # 1,024 giây im lặng đầu session
        cursor = len(audio[0])
        for c in pool:
            x = trim(read(os.path.join(DATA, "asr", c["path"])))
            bounds = speech_frames(vad, x) if len(x) else None
            if bounds is None:
                continue
            first, last = bounds
            truth.append({"id": c["id"], "lang": c["lang"], "start_ms": (cursor + first * FRAME) * 1000 // 16000,
                          "end_ms": (cursor + (last + 1) * FRAME) * 1000 // 16000, "text": c["ref"]})
            pause = int(16000 * rng.uniform(0.4, 1.6))
            pause += -(cursor + len(x) + pause) % FRAME  # clip sau cũng bắt đầu ở ranh giới khung
            audio += [x, np.zeros(pause, dtype=np.int16)]
            cursor += len(x) + pause
            if cursor / 16000 >= args.seconds:
                break
        with wave.open(os.path.join(out_dir, f"{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(np.concatenate(audio).tobytes())
        with open(os.path.join(out_dir, f"{name}.truth.json"), "w", encoding="utf-8") as f:
            json.dump(truth, f, ensure_ascii=False, indent=1)
        # Tập ngôn ngữ nguồn luôn là mặc định của F2, để phép nhận diện ngôn ngữ giống app.
        index[name] = {"languages": "en,zh,ja,ko,vi", "target": target,
                       "utterances": len(truth), "seconds": round(cursor / 16000, 1)}
        print(name, index[name])
    with open(os.path.join(out_dir, "sessions.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Tạo `bench/phase0/latency/run_matrix.py`**

```python
"""S6: chạy `latency-bench latency` cho mọi session của một máy với một gói model.

Nhãn kết quả: <máy>-<hạng>-<gói>[-ctx<N>]-<session>, ví dụ `m1-16gb-khuyennghi-chuan-en`. `summarize.py` đọc hạng từ nhãn:
- `khuyennghi`, `toithieu`: so với A2 (§8);
- `thu`: chỉ để tham khảo.
`--min-ctx N` đặt sàn cho audio_ctx (0–1500) và thêm `ctx<N>` vào nhãn, để không ghi đè kết quả không sàn.

Gói:
- `chuan` = whisper turbo + Hy-MT2 Q8_0;
- `nhe` = whisper small + Q4_K_M;
- `lai` = turbo + Q4_K_M: phương án cho máy băng thông thấp ở §8.

Dùng (từ gốc repo, sau khi build latency-bench và asr-worker):
  python3 bench/phase0/latency/run_matrix.py --machine m4pro --tier khuyennghi --package chuan
  python bench\\phase0\\latency\\run_matrix.py --machine rtx4050 --tier khuyennghi --package chuan
Thêm `--use-gpu false` để chạy bằng CPU (khi đó trên Windows dùng `--asr-worker target\\asr-worker-cpu.exe`).

Trước mỗi session, script dừng nếu còn llama-server hoặc asr-worker đang chạy (báo pid): profile release đặt
`panic = "abort"` nên `Drop` không chạy khi panic, một lượt đo chết đột ngột có thể bỏ lại chúng, và chúng làm lệch
RAM, VRAM, CPU của lượt sau.
"""
import argparse
import csv
import glob
import io
import json
import os
import platform
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DATA = os.path.join(ROOT, "bench", "phase0", "data", "latency")
RESULTS = os.path.join(ROOT, "bench", "phase0", "results", "latency")
PACKAGES = {
    "chuan": ("ggml-large-v3-turbo-q5_0.bin", "Hy-MT2-1.8B-Q8_0.gguf"),
    "nhe": ("ggml-small-q5_1.bin", "Hy-MT2-1.8B-Q4_K_M.gguf"),
    "lai": ("ggml-large-v3-turbo-q5_0.bin", "Hy-MT2-1.8B-Q4_K_M.gguf"),
}
WINDOWS = platform.system() == "Windows"
# Tiến trình con của latency-bench. Trên Windows tên có đuôi .exe, và asr-worker có hậu tố (-vulkan, -cpu).
CHILD_PROCESSES = ("llama-server", "asr-worker")


def parse_pgrep(out):
    """Đầu ra của `pgrep -l`: mỗi dòng `<pid> <tên>`."""
    found = []
    for line in out.splitlines():
        parts = line.split(None, 1)
        if parts and parts[0].isdigit():
            found.append((int(parts[0]), parts[1] if len(parts) > 1 else "?"))
    return found


def parse_tasklist(out):
    """Đầu ra của `tasklist /FO CSV /NH`: mỗi dòng `"<tên>","<pid>",...`."""
    return [(int(r[1]), r[0]) for r in csv.reader(io.StringIO(out))
            if len(r) > 1 and r[1].isdigit() and r[0].lower().startswith(CHILD_PROCESSES)]


def stray_processes():
    """[(pid, tên)] của llama-server và asr-worker còn chạy. Trước mỗi session không được còn cái nào."""
    if WINDOWS:
        out = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, encoding="utf-8",
                             errors="replace", check=True).stdout
        return parse_tasklist(out)
    res = subprocess.run(["pgrep", "-l", "-x", "|".join(CHILD_PROCESSES)], capture_output=True, text=True)
    if res.returncode == 1:  # pgrep trả 1 khi không tiến trình nào khớp
        return []
    if res.returncode != 0:
        raise SystemExit(f"pgrep lỗi (mã {res.returncode}): {res.stderr.strip()}")
    return parse_pgrep(res.stdout)


def find_llama_server(variant):
    exe = "llama-server.exe" if WINDOWS else "llama-server"
    hits = glob.glob(os.path.join(ROOT, "tools", "llama-b11146", variant, "**", exe), recursive=True)
    if not hits:
        raise SystemExit(f"không thấy {exe} trong tools/llama-b11146/{variant}; chạy bench/phase0/fetch.py trước")
    return hits[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--machine", required=True, help="tên ngắn của máy, ví dụ m1-16gb, rtx4050")
    ap.add_argument("--tier", required=True, choices=["khuyennghi", "toithieu", "thu"])
    ap.add_argument("--package", required=True, choices=list(PACKAGES))
    ap.add_argument("--sessions", default="", help="danh sách cách nhau bằng dấu phẩy; mặc định là mọi session")
    ap.add_argument("--use-gpu", default="true", choices=["true", "false"])
    ap.add_argument("--asr-worker", default=os.path.join("target", "asr-worker-vulkan.exe") if WINDOWS
                    else os.path.join("target", "release", "asr-worker"))
    ap.add_argument("--llama-variant", default="win-vulkan-x64" if WINDOWS else "macos-arm64")
    ap.add_argument("--llama-args", default="",
                    help='viết liền bằng dấu =, ví dụ --llama-args=--no-repack khi thiếu RAM lúc chạy CPU (§8); '
                         'argparse không nhận "--llama-args --no-repack"')
    ap.add_argument("--min-ctx", type=int, default=0,
                    help="sàn cho audio_ctx, 0–1500 (mặc định 0: không đặt sàn); nhãn thêm ctx<N>")
    args = ap.parse_args()
    if not 0 <= args.min_ctx <= 1500:
        ap.error("--min-ctx phải từ 0 đến 1500")

    index = json.load(open(os.path.join(DATA, "sessions.json"), encoding="utf-8"))
    names = args.sessions.split(",") if args.sessions else list(index)
    asr_model, mt_model = PACKAGES[args.package]
    bench = os.path.join(ROOT, "target", "release", "latency-bench.exe" if WINDOWS else "latency-bench")
    os.makedirs(RESULTS, exist_ok=True)
    ctx = f"-ctx{args.min_ctx}" if args.min_ctx else ""
    for name in names:
        stray = stray_processes()
        if stray:
            listing = ", ".join(f"{proc} (pid {pid})" for pid, proc in stray)
            raise SystemExit(
                f"dừng trước session {name}: còn tiến trình sót lại: {listing}.\n"
                "Lượt đo trước có thể đã chết mà không dọn được tiến trình con (profile release đặt panic = abort nên "
                "Drop không chạy). Chúng chiếm RAM, VRAM và CPU, làm lệch lượt đo này.\n"
                "Tắt chúng rồi chạy lại: macOS `kill <pid>`, Windows `taskkill /F /PID <pid>`.")
        info = index[name]
        label = f"{args.machine}-{args.tier}-{args.package}{ctx}-{name}"
        cmd = [bench, "latency",
               "--session", os.path.join(DATA, f"{name}.wav"),
               "--truth", os.path.join(DATA, f"{name}.truth.json"),
               "--asr-worker", os.path.join(ROOT, args.asr_worker),
               "--asr-model", os.path.join(ROOT, "models", asr_model),
               "--llama-server", find_llama_server(args.llama_variant),
               "--mt-model", os.path.join(ROOT, "models", mt_model),
               "--vad-model", os.path.join(ROOT, "models", "silero_vad_v6.2.3.onnx"),
               "--languages", info["languages"], "--target", info["target"],
               "--use-gpu", args.use_gpu, "--label", label,
               "--out", os.path.join(RESULTS, f"{label}.json"),
               "--log-dir", os.path.join(DATA, "logs")]
        if args.llama_args:
            cmd.append(f"--llama-args={args.llama_args}")
        if args.min_ctx:
            cmd += ["--min-ctx", str(args.min_ctx)]
        print(f"== {label} ({info['seconds']} giây, {info['utterances']} câu)", flush=True)
        subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Tạo `bench/phase0/latency/summarize.py`**

```python
"""S6: gộp các file kết quả của `latency-bench latency` thành bảng, và so với A2.

Nhãn (--label) đặt theo mẫu <máy>-<hạng>-<gói>[-ctx<N>]-<session>, với hạng là `khuyennghi` hoặc `toithieu`,
ví dụ `m1-16gb-khuyennghi-chuan-en`.

Cột RAM lấy số lớn hơn giữa RSS và `phys_footprint` (chỉ có trên macOS) của từng tiến trình:
- RSS tính cả trang của file model được mmap (llama-server), còn `phys_footprint` thì không.
- `phys_footprint` tính bộ nhớ Metal (asr-worker), còn RSS thì không.
VRAM trên Windows xem file vram-*.csv của vram-sample.ps1.
Cột CPU: tổng CPU trung bình của latency-bench (đóng vai app), asr-worker và llama-server, tính theo phần trăm
của cả máy. §8 đặt mục tiêu ≤ 30% trên máy khuyến nghị.

Các cột đếm (file kết quả cũ chưa ghi thì hiện —):
- Ghép được: số câu ghép được với một đoạn, trên số câu thật. Câu không ghép được không có độ trễ.
- Câu không có bản dịch: trong các câu ghép được, số câu có đoạn bị bỏ hoặc không cần dịch (cùng ngôn ngữ đích).
- Đoạn bỏ qua: số đoạn theo lý do. `no_speech`, `too_short`, `too_long` (không gửi cho worker) và `empty_translation`
  là đoạn bị bỏ: không hiện gì nên không có độ trễ và không vào p50, p90. `same_lang` (hiện luôn bản chép lời) và
  `lang_ngoai_tap` thì có độ trễ.
- Cụt (length): bản dịch chạm max_tokens (§6.5), tức bị cắt cụt.
- Lệch mốc dừng: lệch lớn nhất giữa mốc dừng của đoạn ghép được và mốc dừng thật của câu. Cỡ vài trăm ms trở lên thì
  mốc thật không khớp lúc người nói dừng, và độ trễ của câu đó lệch cùng cỡ (xem build_sessions.py).
- Phát lại trễ: độ trễ lớn nhất của luồng phát lại so với thời gian thực. Cỡ vài chục ms trở lên thì máy đang bận
  và độ trễ đo được bị lệch cùng cỡ.

Dùng:  python3 bench/phase0/latency/summarize.py bench/phase0/results/latency/*.json
"""
import json
import os
import sys

A2 = {"khuyennghi": {"shown_p50_ms": 2000, "shown_p90_ms": 3000, "first_p50_ms": 1000},
      "toithieu": {"shown_p50_ms": 3500}}


def count(s, key):
    return f"{s[key]:.0f}" if key in s else "—"


def skipped(s):
    """Số đoạn bỏ qua theo lý do, chỉ liệt kê lý do có mặt."""
    reasons = {k[len("skipped_"):]: v for k, v in s.items() if k.startswith("skipped_")}
    if not reasons:
        return "—"
    return ", ".join(f"{r} {v:.0f}" for r, v in sorted(reasons.items()) if v) or "0"


def main():
    rows = []
    for path in sys.argv[1:]:
        r = json.load(open(path, encoding="utf-8"))
        tier = next((t for t in A2 if f"-{t}-" in r["label"]), None)
        s, u = r["summary"], r["usage"]
        checks = A2.get(tier, {})
        verdict = all(s.get(k, float("inf")) <= v for k, v in checks.items()) if checks else None
        cores = int(r["machine"].get("logical_cores") or 1)
        cpu_load = sum(p.get("avg_cpu_percent", 0) for p in u.values()) / cores
        rows.append((r["label"], r["machine"].get("cpu", ""), s, u, cpu_load, verdict))
    print("| Nhãn | Máy | p50 | p90 | Chữ đầu p50 | ASR p50 | LID p50 | Dịch p50 | RAM asr / llama (MB) | CPU cả máy "
          "| Ghép được | Câu không có bản dịch | Đoạn bỏ qua | Cụt (length) | Lệch mốc dừng (ms) "
          "| Phát lại trễ (ms) | A2 |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for label, cpu, s, u, cpu_load, verdict in sorted(rows):
        ram = " / ".join(f"{max(u.get(p, {}).get('peak_rss_mb', 0), u.get(p, {}).get('peak_footprint_mb', 0)):.0f}"
                         for p in ("asr-worker", "llama-server"))
        mark = "—" if verdict is None else ("đạt" if verdict else "**KHÔNG ĐẠT**")
        print(f"| {label} | {cpu} | {s['shown_p50_ms']:.0f} | {s['shown_p90_ms']:.0f} | {s['first_p50_ms']:.0f} | "
              f"{s['asr_p50_ms']:.0f} | {s['lid_p50_ms']:.0f} | {s.get('mt_p50_ms', 0):.0f} | {ram} | {cpu_load:.0f}% | "
              f"{s['matched']:.0f}/{s['utterances']:.0f} | {count(s, 'no_translation')} | {skipped(s)} | "
              f"{count(s, 'finish_length')} | {count(s, 'end_offset_max_abs_ms')} | "
              f"{count(s, 'feed_lag_max_ms')} | {mark} |")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Tạo `bench/phase0/latency/vram-sample.ps1`**

```powershell
# S6 trên Windows: lấy mẫu VRAM (dedicated và shared) của asr-worker và llama-server mỗi giây.
# Chạy trong một cửa sổ PowerShell riêng, song song với latency-bench; dừng bằng Ctrl+C.
#   powershell -ExecutionPolicy Bypass -File bench\phase0\latency\vram-sample.ps1 -Out bench\phase0\results\latency\vram-<nhãn>.csv
param(
    [string]$Out = "vram.csv",
    [int]$IntervalMs = 1000
)

"time,process,pid,dedicated_mb,shared_mb" | Out-File -Encoding utf8 $Out
while ($true) {
    $now = Get-Date -Format o
    foreach ($name in @("asr-worker*", "llama-server")) {
        foreach ($p in Get-Process -Name $name -ErrorAction SilentlyContinue) {
            $base = "\GPU Process Memory(pid_$($p.Id)_*)"
            $dedicated = (Get-Counter "$base\Dedicated Usage" -ErrorAction SilentlyContinue).CounterSamples |
                Measure-Object -Property CookedValue -Sum
            $shared = (Get-Counter "$base\Shared Usage" -ErrorAction SilentlyContinue).CounterSamples |
                Measure-Object -Property CookedValue -Sum
            "$now,$($p.ProcessName),$($p.Id),$([math]::Round($dedicated.Sum / 1MB, 1)),$([math]::Round($shared.Sum / 1MB, 1))" |
                Out-File -Append -Encoding utf8 $Out
        }
    }
    Start-Sleep -Milliseconds $IntervalMs
}
```

- [ ] **Step 5: Tạo `bench/phase0/latency/vram_peak.py`**

```python
"""S6 trên Windows: VRAM lớn nhất của từng tiến trình, từ file CSV của vram-sample.ps1.

Dùng:  python bench\\phase0\\latency\\vram_peak.py bench\\phase0\\results\\latency\\vram-<nhãn>.csv [...]
"""
import csv
import sys
from collections import defaultdict


def main():
    print("| File | Tiến trình | VRAM riêng lớn nhất (MB) | Bộ nhớ dùng chung lớn nhất (MB) |")
    print("|---|---|---|---|")
    for path in sys.argv[1:]:
        dedicated, shared = defaultdict(float), defaultdict(float)
        # Windows PowerShell 5.1 ghi UTF-8 có BOM.
        with open(path, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                name = row["process"]
                dedicated[name] = max(dedicated[name], float(row["dedicated_mb"]))
                shared[name] = max(shared[name], float(row["shared_mb"]))
        for name in sorted(dedicated):
            print(f"| {path} | {name} | {dedicated[name]:.0f} | {shared[name]:.0f} |")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Dựng session**

Run: `uv run --no-project --python 3.12 --with "numpy==2.5.3" --with "onnxruntime==1.30.0" python bench/phase0/latency/build_sessions.py --seconds 180`
Expected:
- Sáu dòng, mỗi dòng dạng `en {'languages': 'en,zh,ja,ko,vi', 'target': 'vi', 'utterances': <khoảng 15–20>, 'seconds': <khoảng 180>}`, lần lượt cho `en`, `zh`, `ja`, `ko`, `vi`, `mixed`. Session `vi` có `'target': 'en'`.
- Thư mục `bench/phase0/data/latency/` có `<tên>.wav`, `<tên>.truth.json` và `sessions.json`.

- [ ] **Step 7: Chạy thử một session ngắn**

Run: `python3 bench/phase0/latency/run_matrix.py --machine m4pro --tier thu --package nhe --sessions ko`
Expected:
- `asr: metal (1.8.3), chế độ giải mã shared, làm nóng … ms`.
- Dòng kết quả dạng `m4pro-thu-nhe-ko: p50 = … ms, p90 = … ms, chữ đầu p50 = … ms, ghép được N/N câu`, với N là số câu trong `sessions.json`.
- Dòng phụ ghi:
  - số câu đo được;
  - số câu không ghép được;
  - số câu không có bản dịch;
  - số đoạn bị bỏ, theo lý do;
  - số bản dịch bị cụt (`length`);
  - độ lệch mốc dừng lớn nhất.
- Lúc thực thi (máy bận, chỉ để tham khảo), session tiếng Hàn cho:
  - p50 666 ms, p90 892 ms, chữ đầu p50 508 ms;
  - ghép được 15/15 câu, mốc dừng lệch tối đa 64 ms;
  - ASR p50 112 ms, LID p50 3 ms, dịch p50 205 ms.

Nếu "ghép được" thấp hơn nhiều so với số câu, xem `end_offset_ms` và trường `segments` trong file kết quả: mốc dừng có thể sai, hoặc VAD gộp hai câu có khoảng lặng ngắn thành một đoạn.

Xóa file thử: `rm bench/phase0/results/latency/m4pro-thu-nhe-ko.json`

- [ ] **Step 8: Commit**

```bash
git add bench/phase0/latency
git commit -m "feat(bench): session phát lại S6, chạy theo máy và gói, tổng hợp và lấy mẫu VRAM"
```

### Task 7: Đo trên Mac M4 Pro (máy phát triển)

**Files:**
- Create: `bench/phase0/results/latency/m4pro-khuyennghi-{chuan,nhe}-*.json` (script sinh ra)

- [ ] **Step 1: Chạy hai gói** (mỗi gói khoảng 20 phút; không mở app nặng khác trong lúc đo). Build lại `asr-worker` đúng feature trước, phòng khi lần build gần nhất thiếu feature:

```bash
cargo build --release -p asr-worker --features metal,shared-encode
python3 bench/phase0/latency/run_matrix.py --machine m4pro --tier khuyennghi --package chuan
python3 bench/phase0/latency/run_matrix.py --machine m4pro --tier khuyennghi --package nhe
python3 bench/phase0/latency/summarize.py bench/phase0/results/latency/m4pro-*.json
```
Expected:
- Bảng 12 dòng.
- Theo §8, máy băng thông cao ở gói Chuẩn đạt A2 với dư địa lớn, nên cột A2 phải là `đạt` ở mọi dòng. Dòng nào `KHÔNG ĐẠT` thì xem chi tiết (ASR, LID, dịch) trước khi đo trên máy khác.

- [ ] **Step 2: Commit**

```bash
git add bench/phase0/results/latency/m4pro-*.json
git commit -m "test(bench): S6 trên Mac M4 Pro, gói Chuẩn và gói Nhẹ"
```

### Task 8: Đo trên các máy tham chiếu

Mỗi máy cần các thứ sau; không cần cài Rust:
- **Repo:** lấy bằng `git clone` hoặc `git bundle` (kế hoạch 01, Task 2, Step 4).
- **Python:** các script chạy được với `python3` có sẵn, riêng `fetch.py` cần Python 3.12 trở lên.
  - Mac mượn thường chỉ có `python3` 3.9 của Xcode Command Line Tools. Khi đó cài uv (`curl -LsSf https://astral.sh/uv/install.sh | sh`), mở terminal mới (hoặc `source $HOME/.local/bin/env`) để có lệnh `uv`, rồi chạy `uv run --no-project --python 3.12 python bench/phase0/fetch.py`.
  - Windows dùng Python 3.12, cài bằng `uv python install 3.12` hoặc winget.
- **Model và llama.cpp:** chạy `fetch.py` như trên. Script kiểm kích thước và SHA-256 của từng file, nên các máy chắc chắn dùng đúng bản với Mac.
- **Binary đã build, chép từ máy build:** Mac lấy từ M4 Pro; Windows lấy từ laptop đã build ở kế hoạch 03, Task 14. Việc này cũng kiểm luôn mức CPU cố định, vì binary build trên máy đời mới phải chạy được trên máy đời cũ (§6.12).
  - Mac: `target/release/latency-bench`, `target/release/asr-worker`.
  - Windows: `target\release\latency-bench.exe`, `target\asr-worker-vulkan.exe`, `target\asr-worker-cpu.exe`.
- **Session:** thư mục `bench/phase0/data/latency/`, chép từ M4 Pro.

Nhãn máy ngắn gọn, ví dụ `m1-16gb`, `m4-16gb`, `rtx4050`, `rtx3050`, `cpu8gb`, `igpu`. Trên Windows, mở thêm một cửa sổ PowerShell để lấy mẫu VRAM trong suốt lượt chạy, rồi dừng bằng Ctrl+C khi xong:

```powershell
powershell -ExecutionPolicy Bypass -File bench\phase0\latency\vram-sample.ps1 -Out bench\phase0\results\latency\vram-<máy>-<gói>.csv
```

- [ ] **Step 1: Mac M1 cơ bản 16 GB**

```bash
python3 bench/phase0/latency/run_matrix.py --machine m1-16gb --tier khuyennghi --package chuan
```
Nếu không đạt A2, chạy thêm phương án thứ hai ở §8 (turbo + Q4_K_M):

```bash
python3 bench/phase0/latency/run_matrix.py --machine m1-16gb --tier thu --package lai
```

- [ ] **Step 2: Mac chip cơ bản đời mới (M4 hoặc M5) 16 GB**

```bash
python3 bench/phase0/latency/run_matrix.py --machine m4-16gb --tier khuyennghi --package chuan
```

- [ ] **Step 3: Laptop Windows card rời 6 GB** (đang lấy mẫu VRAM)

```powershell
python bench\phase0\latency\run_matrix.py --machine rtx4050 --tier khuyennghi --package chuan
```

- [ ] **Step 4: Laptop Windows card rời 4 GB** (đang lấy mẫu VRAM). Đây là thí nghiệm để quyết định có nới ngưỡng VRAM 6 GB ở §6.7 không.

```powershell
python bench\phase0\latency\run_matrix.py --machine rtx3050 --tier thu --package chuan
python bench\phase0\latency\run_matrix.py --machine rtx3050 --tier thu --package nhe
```

- [ ] **Step 5: Máy Windows 8 GB, chỉ có CPU (máy tối thiểu)**

```powershell
python bench\phase0\latency\run_matrix.py --machine cpu8gb --tier toithieu --package nhe --use-gpu false `
  --asr-worker target\asr-worker-cpu.exe --llama-variant win-cpu-x64
```
Nếu hết RAM (máy chậm hẳn hoặc `llama-server` bị đóng), chạy lại với `--llama-args "--no-repack"` và ghi lại (§8).

- [ ] **Step 6: Laptop chỉ có GPU tích hợp** (nếu mượn được; giả định 4)

```powershell
python bench\phase0\latency\run_matrix.py --machine igpu --tier thu --package chuan
python bench\phase0\latency\run_matrix.py --machine igpu --tier thu --package nhe
```

- [ ] **Step 7: Mang kết quả về và commit** (từ mỗi máy, hoặc gom về Mac)

```bash
git add bench/phase0/results/latency
git commit -m "test(bench): S6 trên <máy>"
```

### Task 9: Tổng hợp S6

**Files:**
- Create: `bench/phase0/results/s6_latency.md`

- [ ] **Step 1: Tạo bảng**

Run:
```bash
python3 bench/phase0/latency/summarize.py bench/phase0/results/latency/*.json > bench/phase0/data/s6_table.md
python3 bench/phase0/latency/vram_peak.py bench/phase0/results/latency/vram-*.csv > bench/phase0/data/s6_vram.md
```

- [ ] **Step 2: Tạo `bench/phase0/results/s6_latency.md`** theo mẫu, dán hai bảng vào

```markdown
# S6: độ trễ, RAM, VRAM

Ngày <YYYY-MM-DD>. llama.cpp b11146, whisper.cpp 1.8.3 (có vá, chế độ B), session 180 giây × 6.

## Cổng Giai đoạn 0 (§13)

| Điều kiện | Máy | Kết quả |
|---|---|---|
| p50 ≤ 2,0 s trên máy khuyến nghị | M4 Pro, M1 16 GB, M4/M5 16 GB, RTX 6 GB | <p50 lớn nhất trong các session, đạt/không> |
| p90 ≤ 3,0 s và chữ đầu p50 ≤ 1,0 s trên máy khuyến nghị (A2) | như trên | |
| p50 ≤ 3,5 s trên máy tối thiểu | Windows 8 GB chỉ CPU | |

## Quyết định

- **M1 cơ bản:** <đạt với gói Chuẩn / không đạt → chọn phương án nào ở §8, kèm số của lượt `lai`>.
- **Ngưỡng VRAM gói Chuẩn (§6.7):** <giữ 6 GB / nới xuống, dựa trên VRAM lớn nhất đo được và kết quả card 4 GB>.
- **GPU tích hợp:** <có đề xuất gói Chuẩn không>.
- **RAM so với ước tính ở §8:** <bảng RAM thực đo theo gói>.
- **CPU ≤ 30% trên máy khuyến nghị (§8):** <đạt/không, máy nào vượt>.

## Bảng đầy đủ

<dán bench/phase0/data/s6_table.md>

## VRAM (Windows)

<dán bench/phase0/data/s6_vram.md>
```

- [ ] **Step 3: Commit**

```bash
git add bench/phase0/results/s6_latency.md
git commit -m "docs(bench): tổng hợp S6 và quyết định về hạng máy, ngưỡng VRAM"
```
