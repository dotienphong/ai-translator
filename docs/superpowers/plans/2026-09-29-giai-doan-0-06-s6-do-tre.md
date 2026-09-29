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
Expected: PASS, `test result: ok. 12 passed` (7 của segmenter, 5 của prompt).

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
- `data: {...}` có `delta.content` thì trả phần chữ mới.
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
        assert_eq!(parse_sse_line(line).unwrap(), SseEvent::Delta("Xin".into()));
    }

    #[test]
    fn finish_chunk_has_empty_delta() {
        let line = r#"data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
        assert_eq!(parse_sse_line(line).unwrap(), SseEvent::Delta(String::new()));
    }

    #[test]
    fn parses_done_and_ignores_other_lines() {
        assert_eq!(parse_sse_line("data: [DONE]").unwrap(), SseEvent::Done);
        assert_eq!(parse_sse_line("").unwrap(), SseEvent::Ignore);
        assert_eq!(parse_sse_line(": keep-alive").unwrap(), SseEvent::Ignore);
    }

    #[test]
    fn server_error_is_an_error() {
        let line = r#"data: {"error":{"code":500,"message":"boom"}}"#;
        assert!(parse_sse_line(line).is_err());
    }
}
```

- [ ] **Step 3: Chạy test để thấy lỗi**

Run: `cargo test -p pipeline sse`
Expected: FAIL, lỗi biên dịch vì chưa có `parse_sse_line` và `SseEvent`.

- [ ] **Step 4: Viết phần code** ở đầu `crates/pipeline/src/sse.rs`:

```rust
//! Đọc từng dòng Server-Sent Events của `/v1/chat/completions` với `stream: true`.

use anyhow::{Result, bail};

#[derive(Debug, PartialEq, Eq)]
pub enum SseEvent {
    /// Phần chữ mới của bản dịch (có thể rỗng, ví dụ ở gói chứa `finish_reason`).
    Delta(String),
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
    let value: serde_json::Value = serde_json::from_str(data)?;
    if let Some(err) = value.get("error") {
        bail!("llama-server báo lỗi: {err}");
    }
    let content = value["choices"][0]["delta"]["content"].as_str().unwrap_or_default();
    Ok(SseEvent::Delta(content.to_string()))
}
```

- [ ] **Step 5: Chạy lại test**

Run: `cargo test -p pipeline`
Expected: PASS, `test result: ok. 16 passed`

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
- `-m <gguf> --host 127.0.0.1 --port <cổng trống> --api-key <ngẫu nhiên> -c 2048 -np 1 -ngl auto --no-webui`.
- Cổng được chọn bằng cách mở rồi đóng một `TcpListener` ở cổng 0.
- API key sinh từ `RandomState` của thư viện chuẩn. Key này chỉ cần khó đoán với tiến trình khác trên máy, và không nằm trong app (§10.2).
- Chờ `/health` trả 200, tối đa 180 giây.

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
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

pub struct LlamaServer {
    child: Child,
    base_url: String,
    api_key: String,
    http: reqwest::blocking::Client,
}

#[derive(Debug, Clone)]
pub struct Translation {
    pub text: String,
    /// Từ lúc gửi request tới khi nhận chữ đầu tiên.
    pub first_token_ms: f32,
    pub total_ms: f32,
}

impl LlamaServer {
    /// Lệnh chạy theo §6.5. `extra_args` dùng để thử tham số khác trong spike.
    pub fn spawn(exe: &Path, model: &Path, extra_args: &[String], stderr_log: &Path) -> Result<Self> {
        let port = TcpListener::bind("127.0.0.1:0")?.local_addr()?.port();
        let api_key = random_key();
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
            .args(["-c", "2048", "-np", "1", "-ngl", "auto", "--no-webui"])
            .args(extra_args)
            .stdout(Stdio::null())
            .stderr(Stdio::from(File::create(stderr_log)?))
            .spawn()
            .with_context(|| format!("không chạy được {}", exe.display()))?;
        let http = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()?;
        let mut server = Self {
            child,
            base_url: format!("http://127.0.0.1:{port}"),
            api_key,
            http,
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
                bail!("llama-server thoát sớm: {status}");
            }
            if let Ok(resp) = self.http.get(format!("{}/health", self.base_url)).send()
                && resp.status().is_success()
            {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        bail!("llama-server không sẵn sàng sau {timeout:?}")
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
        let resp = self
            .http
            .post(format!("{}/v1/chat/completions", self.base_url))
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()?
            .error_for_status()?;
        let mut text = String::new();
        let mut first_token_ms = None;
        for line in BufReader::new(resp).lines() {
            match parse_sse_line(&line?)? {
                SseEvent::Delta(delta) => {
                    if !delta.is_empty() && first_token_ms.is_none() {
                        first_token_ms = Some(started.elapsed().as_secs_f32() * 1000.0);
                    }
                    text.push_str(&delta);
                }
                SseEvent::Done => break,
                SseEvent::Ignore => {}
            }
        }
        let total_ms = started.elapsed().as_secs_f32() * 1000.0;
        Ok(Translation {
            text: text.trim().to_string(),
            first_token_ms: first_token_ms.unwrap_or(total_ms),
            total_ms,
        })
    }
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
Expected: `test result: ok. 16 passed`; clippy không có cảnh báo.

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
}
```

- [ ] **Step 3: Chạy test để thấy lỗi**

Run: `cargo test -p latency-bench`
Expected: FAIL, lỗi biên dịch vì chưa có `percentile`, `Utterance`, `match_segments`.

- [ ] **Step 4: Viết phần code** ở đầu `crates/latency-bench/src/stats.rs`:

```rust
//! Phân vị và ghép đoạn với câu thật.

use serde::{Deserialize, Serialize};

/// Phân vị kiểu nội suy tuyến tính (giống `numpy.percentile` mặc định). `p` trong [0, 100].
pub fn percentile(values: &[f32], p: f32) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    let mut v = values.to_vec();
    v.sort_by(f32::total_cmp);
    let rank = (p / 100.0) * (v.len() - 1) as f32;
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
Expected: PASS, `test result: ok. 3 passed`. Lúc này `cargo build` còn cảnh báo các hàm chưa được dùng; Task 5 sẽ dùng chúng.

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
use asr_protocol::{TranscribeRequest, audio_ctx_for_samples};
use pipeline::asr_client::AsrWorker;
use pipeline::llama::LlamaServer;
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
/// Tối đa 100 token của đoạn trước làm prompt (spec §6.4).
const PROMPT_TOKENS: usize = 100;

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
    mt_first_at_ms: Option<f64>,
    mt_done_at_ms: Option<f64>,
    translation: Option<String>,
    /// Lúc phụ đề hiện đủ: xong bản dịch, hoặc xong chép lời nếu không cần dịch.
    shown_at_ms: f64,
    first_shown_at_ms: f64,
    skipped: Option<String>,
}

#[derive(Serialize)]
struct UtteranceLatency {
    id: String,
    lang: String,
    end_ms: u64,
    segment_id: Option<u64>,
    shown_latency_ms: Option<f64>,
    first_latency_ms: Option<f64>,
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
    let truth: Vec<Utterance> = serde_json::from_reader(std::fs::File::open(&args.truth)?)?;
    let samples = read_wav_16k_mono(&args.session)?;

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
    let asr_thread = std::thread::spawn(move || -> Result<()> {
        let mut prompts: HashMap<String, Vec<i32>> = HashMap::new();
        for (segment, closed_at_ms) in seg_rx {
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
                audio_ctx: audio_ctx_for_samples(pcm.len()),
                pcm,
                languages: languages.clone(),
                prompt_tokens,
            })?;
            let tokens = prompts.entry(result.lang.clone()).or_default();
            tokens.extend(&result.tokens);
            let excess = tokens.len().saturating_sub(PROMPT_TOKENS);
            tokens.drain(..excess);
            asr_tx.send(SegmentRecord {
                id: segment.id,
                start_ms: segment.start_ms,
                end_ms: segment.end_ms,
                audio_ms: segment.samples.len() as u64 * 1000 / 16_000,
                closed_at_ms,
                asr_done_at_ms: now_ms(),
                lid_ms: result.lid_ms,
                asr_ms: result.asr_ms,
                lang: result.lang,
                lang_prob: result.lang_prob,
                text: result.text,
                no_speech_prob: result.no_speech_prob,
                ..Default::default()
            })?;
        }
        Ok(())
    });

    let mt_thread = std::thread::spawn(move || -> Result<()> {
        for mut rec in asr_rx {
            let src = Lang::from_code(&rec.lang);
            if rec.no_speech_prob > NO_SPEECH_MAX || rec.text.is_empty() {
                rec.skipped = Some("no_speech".into());
            } else if src == Some(target) {
                rec.skipped = Some("same_lang".into());
            } else if let Some(src) = src {
                let t = llama.translate(&translation_prompt(&rec.text, src, target), 512)?;
                let done = now_ms();
                rec.mt_first_at_ms = Some(done - (t.total_ms - t.first_token_ms) as f64);
                rec.mt_done_at_ms = Some(done);
                rec.translation = Some(t.text);
            } else {
                rec.skipped = Some(format!("lang_ngoai_tap:{}", rec.lang));
            }
            rec.shown_at_ms = rec.mt_done_at_ms.unwrap_or(rec.asr_done_at_ms);
            rec.first_shown_at_ms = rec.mt_first_at_ms.unwrap_or(rec.asr_done_at_ms);
            rec_tx.send(rec)?;
        }
        Ok(())
    });

    // Phát lại theo thời gian thực: khung i sẵn sàng ở thời điểm (i + 1) × 32 ms, như khi thu thật.
    let mut vad = SileroVad::load(&args.vad_model)?;
    let mut segmenter = Segmenter::new(SegmenterConfig {
        end_silence_ms: args.end_silence_ms,
        ..Default::default()
    });
    for (i, frame) in samples.as_chunks::<FRAME_SAMPLES>().0.iter().enumerate() {
        let due = origin + Duration::from_millis((i as u64 + 1) * FRAME_MS);
        if let Some(wait) = due.checked_duration_since(Instant::now()) {
            std::thread::sleep(wait);
        }
        let prob = vad.prob(frame)?;
        for segment in segmenter.push(frame, prob) {
            seg_tx.send((segment, now_ms()))?;
        }
    }
    if let Some(segment) = segmenter.flush() {
        seg_tx.send((segment, now_ms()))?;
    }
    drop(seg_tx);
    asr_thread.join().expect("luồng ASR panic")?;
    mt_thread.join().expect("luồng MT panic")?;
    stop_sampler.store(true, Ordering::Relaxed);
    let usage = sampler.join().expect("luồng đo tài nguyên panic");

    let mut segments: Vec<SegmentRecord> = rec_rx.into_iter().collect();
    segments.sort_by_key(|s| s.id);
    let ends: Vec<u64> = segments.iter().map(|s| s.end_ms).collect();
    let matches = match_segments(&truth, &ends, 1_000);
    let utterances: Vec<UtteranceLatency> = truth
        .iter()
        .zip(&matches)
        .map(|(u, m)| {
            let seg = m.map(|i| &segments[i]);
            UtteranceLatency {
                id: u.id.clone(),
                lang: u.lang.clone(),
                end_ms: u.end_ms,
                segment_id: seg.map(|s| s.id),
                shown_latency_ms: seg.map(|s| s.shown_at_ms - u.end_ms as f64),
                first_latency_ms: seg.map(|s| s.first_shown_at_ms - u.end_ms as f64),
            }
        })
        .collect();

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
    if shown.is_empty() {
        bail!("không ghép được câu nào với mốc thật; kiểm tra file truth và VAD");
    }
    let stage = |f: &dyn Fn(&SegmentRecord) -> Option<f32>| -> Vec<f32> { segments.iter().filter_map(f).collect() };
    let asr_ms = stage(&|s| Some(s.asr_ms));
    let lid_ms = stage(&|s| Some(s.lid_ms));
    let mt_ms = stage(&|s| s.mt_done_at_ms.map(|d| (d - s.asr_done_at_ms) as f32));
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
    summary.insert("utterances".into(), truth.len() as f64);
    summary.insert("matched".into(), shown.len() as f64);
    summary.insert("segments".into(), segments.len() as f64);

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
            ("llama_args".to_string(), args.llama_args.clone()),
        ]),
        summary,
        usage,
        utterances,
        segments,
    };
    serde_json::to_writer_pretty(std::fs::File::create(&args.out)?, &report)?;
    println!(
        "{}: p50 = {:.0} ms, p90 = {:.0} ms, chữ đầu p50 = {:.0} ms, ghép được {}/{} câu",
        report.label,
        report.summary["shown_p50_ms"],
        report.summary["shown_p90_ms"],
        report.summary["first_p50_ms"],
        shown.len(),
        truth.len()
    );
    Ok(())
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
  - asr-protocol 6;
  - asr-worker 5 (bản không có feature);
  - audio-capture 11 (nếu đã làm kế hoạch 04);
  - pipeline 16 và 1;
  - latency-bench 3.
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

- [ ] **Step 1: Tạo `bench/phase0/latency/build_sessions.py`**

```python
"""S6: dựng các session phát lại cho `latency-bench latency`, từ clip băng rộng của bộ A4.

Mỗi session nối các clip đã cắt bỏ im lặng hai đầu, xen giữa là khoảng lặng ngẫu nhiên 0,4–1,6 giây,
và kèm file mốc thật: thời điểm bắt đầu và dừng của từng câu (spec A2).

Dùng:  uv run --no-project --python 3.12 --with "numpy==2.5.3" python bench/phase0/latency/build_sessions.py [--seconds 180]
Kết quả: bench/phase0/data/latency/<tên>.wav và <tên>.truth.json, cùng sessions.json (ngôn ngữ đích).
"""
import argparse
import json
import os
import random
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=180)
    args = ap.parse_args()
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
        audio, truth = [np.zeros(16000, dtype=np.int16)], []
        cursor = 16000
        for c in pool:
            x = trim(read(os.path.join(DATA, "asr", c["path"])))
            if len(x) == 0:
                continue
            truth.append({"id": c["id"], "lang": c["lang"], "start_ms": cursor * 1000 // 16000,
                          "end_ms": (cursor + len(x)) * 1000 // 16000, "text": c["ref"]})
            pause = np.zeros(int(16000 * rng.uniform(0.4, 1.6)), dtype=np.int16)
            audio += [x, pause]
            cursor += len(x) + len(pause)
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

Nhãn kết quả: <máy>-<hạng>-<gói>-<session>, ví dụ `m1-16gb-khuyennghi-chuan-en`. `summarize.py` đọc hạng từ nhãn:
- `khuyennghi`, `toithieu`: so với A2 (§8);
- `thu`: chỉ để tham khảo.

Gói:
- `chuan` = whisper turbo + Hy-MT2 Q8_0;
- `nhe` = whisper small + Q4_K_M;
- `lai` = turbo + Q4_K_M: phương án cho máy băng thông thấp ở §8.

Dùng (từ gốc repo, sau khi build latency-bench và asr-worker):
  python3 bench/phase0/latency/run_matrix.py --machine m4pro --tier khuyennghi --package chuan
  python bench\\phase0\\latency\\run_matrix.py --machine rtx4050 --tier khuyennghi --package chuan
Thêm `--use-gpu false` để chạy bằng CPU (khi đó trên Windows dùng `--asr-worker target\\asr-worker-cpu.exe`).
"""
import argparse
import glob
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
    ap.add_argument("--llama-args", default="", help='ví dụ "--no-repack" khi thiếu RAM lúc chạy CPU (§8)')
    args = ap.parse_args()

    index = json.load(open(os.path.join(DATA, "sessions.json"), encoding="utf-8"))
    names = args.sessions.split(",") if args.sessions else list(index)
    asr_model, mt_model = PACKAGES[args.package]
    bench = os.path.join(ROOT, "target", "release", "latency-bench.exe" if WINDOWS else "latency-bench")
    os.makedirs(RESULTS, exist_ok=True)
    for name in names:
        info = index[name]
        label = f"{args.machine}-{args.tier}-{args.package}-{name}"
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
        print(f"== {label} ({info['seconds']} giây, {info['utterances']} câu)", flush=True)
        subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Tạo `bench/phase0/latency/summarize.py`**

```python
"""S6: gộp các file kết quả của `latency-bench latency` thành bảng, và so với A2.

Nhãn (--label) đặt theo mẫu <máy>-<hạng>-<gói>-<session>, với hạng là `khuyennghi` hoặc `toithieu`,
ví dụ `m1-16gb-khuyennghi-chuan-en`.

Cột RAM lấy số lớn hơn giữa RSS và `phys_footprint` (chỉ có trên macOS) của từng tiến trình:
- RSS tính cả trang của file model được mmap (llama-server), còn `phys_footprint` thì không.
- `phys_footprint` tính bộ nhớ Metal (asr-worker), còn RSS thì không.
VRAM trên Windows xem file vram-*.csv của vram-sample.ps1.
Cột CPU: tổng CPU trung bình của latency-bench (đóng vai app), asr-worker và llama-server, tính theo phần trăm
của cả máy. §8 đặt mục tiêu ≤ 30% trên máy khuyến nghị.

Dùng:  python3 bench/phase0/latency/summarize.py bench/phase0/results/latency/*.json
"""
import json
import os
import sys

A2 = {"khuyennghi": {"shown_p50_ms": 2000, "shown_p90_ms": 3000, "first_p50_ms": 1000},
      "toithieu": {"shown_p50_ms": 3500}}


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
          "| Ghép được | A2 |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for label, cpu, s, u, cpu_load, verdict in sorted(rows):
        ram = " / ".join(f"{max(u.get(p, {}).get('peak_rss_mb', 0), u.get(p, {}).get('peak_footprint_mb', 0)):.0f}"
                         for p in ("asr-worker", "llama-server"))
        mark = "—" if verdict is None else ("đạt" if verdict else "**KHÔNG ĐẠT**")
        print(f"| {label} | {cpu} | {s['shown_p50_ms']:.0f} | {s['shown_p90_ms']:.0f} | {s['first_p50_ms']:.0f} | "
              f"{s['asr_p50_ms']:.0f} | {s['lid_p50_ms']:.0f} | {s.get('mt_p50_ms', 0):.0f} | {ram} | {cpu_load:.0f}% | "
              f"{s['matched']:.0f}/{s['utterances']:.0f} | {mark} |")


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

Run: `uv run --no-project --python 3.12 --with "numpy==2.5.3" python bench/phase0/latency/build_sessions.py --seconds 180`
Expected:
- Sáu dòng, mỗi dòng dạng `en {'languages': 'en,zh,ja,ko,vi', 'target': 'vi', 'utterances': <khoảng 15–20>, 'seconds': <khoảng 180>}`, lần lượt cho `en`, `zh`, `ja`, `ko`, `vi`, `mixed`. Session `vi` có `'target': 'en'`.
- Thư mục `bench/phase0/data/latency/` có `<tên>.wav`, `<tên>.truth.json` và `sessions.json`.

- [ ] **Step 7: Chạy thử một session ngắn**

Run: `python3 bench/phase0/latency/run_matrix.py --machine m4pro --tier thu --package nhe --sessions ko`
Expected:
- `asr: metal (1.8.3), chế độ giải mã shared, làm nóng … ms`.
- Dòng kết quả dạng `m4pro-thu-nhe-ko: p50 = … ms, p90 = … ms, chữ đầu p50 = … ms, ghép được N/N câu`, với N là số câu trong `sessions.json`.
- Lúc lập kế hoạch, một session tiếng Hàn 50 giây cho p50 672 ms, p90 831 ms và chữ đầu p50 494 ms.

Nếu "ghép được" thấp hơn nhiều so với số câu, xem trường `segments` trong file kết quả: có thể VAD gộp hai câu có khoảng lặng ngắn thành một đoạn.

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
