# Giai đoạn 1 · 02d: Pipeline trong app — client tiến trình phụ, dịch một câu, giám sát

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Phần thứ hai của kế hoạch 02 (mục 2.2 của kế hoạch 00), ngay sau 02a (file này tách khỏi 02a vì 02a quá dài; thứ tự làm là 02a → 02d → 02b → 02c):
- client `asr-worker` và `llama-server` bản 2: `LLAMA_API_KEY` qua biến môi trường, log xoay vòng cả khi đang chạy, thư mục làm việc là thư mục của binary, process group và Job Object, pidfile để dọn tiến trình phụ còn sót sau Force Quit;
- dịch theo §6.5: hậu xử lý trong lúc stream, ngưỡng tỉ lệ token, thử lại một lần; tiến trình phụ giả cho test; khóa API không lộ ra log hay `Debug`;
- vòng đời và giám sát hai tiến trình phụ (Đ2): thứ tự chạy, kiểm sức khỏe, khởi động lại và gửi lại đoạn, chuyển sang CPU (lan cả sang `llama-server`), tắt sau 10 phút rảnh, kiểm SHA-256 trước mỗi lần chạy, và thoát app không phải chờ tiến trình phụ.

**Kiến trúc:** Như 02a.

**Công nghệ:** Như 02a (bảng "Phiên bản đã chốt").

Đọc trước 02a (`docs/superpowers/plans/2026-10-01-giai-doan-1-02a-pipeline-crate.md`): các mục "Phiên bản đã chốt", "Cách đọc kế hoạch này", "Kiểm bằng mutation lúc lập kế hoạch", "Dòng của bảng đối chiếu", "Quyết định", "Điểm cần chủ dự án quyết" và "Đã sửa theo review" áp cho file này. Làm file này sau khi 02a đã commit hết.

---

## Task 1: Client tiến trình phụ bản 2

Chuẩn bị mọi thứ mà phần giám sát (Task 3) cần từ hai client (dòng 82, 110, 116, 126, 128, 132–134, 143, 250; QĐ3, QĐ8):
- `prompt_history.rs`: prompt theo ngôn ngữ, tối đa 100 token, và cắt bớt để không hạ trần token của worker (QĐ3).
- `logfile.rs`: stderr của tiến trình phụ đi qua một pipe tới luồng `pump` của app: ghi vào `RotatingLog` (append, xoay cả khi đang chạy khi quá 1 MB, giữ 3 bản cũ), che chuỗi bí mật (khóa API của `llama-server`), giữ 20 dòng cuối để phân loại lỗi khởi động. Mỗi dòng giữ tối đa 64 KiB: phần sau bị bỏ, và bỏ thêm một đoạn ở cuối phần giữ lại bằng độ dài của bí mật dài nhất, để không sót nửa bí mật nằm vắt qua chỗ cắt (Nhỏ của review 02 lần 2); test kiểm cả bí mật trọn vẹn trong phần giữ lại vẫn được che (Q-2 của review 02 lần 3).
- `process.rs` (QĐ8): process group và hook panic trên macOS, Job Object trên Windows; `spawn` ghi nhận mọi tiến trình phụ (cả vào pidfile `sidecars-live.json` khi app đặt `set_pidfile`); `reap_orphans` kill tiến trình mà lần chạy trước bỏ lại (Force Quit) chỉ khi đủ bốn điều kiện: thời điểm bắt đầu, đường dẫn binary, thư mục cho phép và process group (test cho từng điều kiện, kể cả tiến trình không còn là trưởng group và binary khác nằm trong thư mục cho phép; Q4 của review 02 lần 2; binary chạy qua symlink thì pidfile ghi đường dẫn thật, N5 của review 02 lần 3), và dựa vào plugin single-instance của 01 (không có bản app nào khác đang chạy); `begin_shutdown` và `kill_all` cho lúc app thoát. `tests/shutdown.rs` (binary riêng, vì cờ thoát là toàn cục) và `asr-worker/tests/stdin_eof.rs` (worker tự thoát khi stdin đóng).
- `llama.rs` bản 2:
  - `LlamaLaunch` gom mọi tham số chạy;
  - `command()` dựng đúng lệnh của §6.5, khóa API qua `LLAMA_API_KEY`, không bao giờ có `--api-key`, thư mục làm việc là thư mục chứa binary (QĐ17); comment ghi rõ không bao giờ log `{cmd:?}` (`Debug` của `Command` in cả biến môi trường);
  - `-ngl 0` khi chạy bằng CPU, thêm `extra_args`;
  - `ChatRequest` (`repeat_penalty` là `f64`, QĐ13);
  - `stream` gửi từng phần chữ qua callback, dừng được giữa chừng (`ControlFlow`), trả `StreamEnd`.
- `asr_client.rs` bản 2: `AsrLaunch`, lỗi có loại (`AsrError::Worker` mang `ErrorKind`, `AsrError::Crashed`), hết thời gian chờ thì kill worker; worker chết lúc nạp thì lỗi kèm 5 dòng cuối của stderr; thư mục làm việc là thư mục chứa binary.
- `Cargo.toml` của `pipeline` thêm feature `Win32_System_Threading` của `windows` (Job Object cần), nên clippy cho target Windows sạch ngay từ task này (#5 của review 02a).
- `sse.rs` đọc thêm `timings.predicted_n`. `config.rs` thêm thời gian chờ cho request dịch.
- `latency-bench` dùng API mới, không đổi hành vi; công cụ đo đặt thời gian chờ dài cho mỗi request (`TOOL_REQUEST_TIMEOUT`, 600 giây), vì không có phần giám sát.

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Test (tạo): `crates/asr-worker/tests/stdin_eof.rs`
- Sửa: `crates/latency-bench/src/asr_eval.rs`
- Sửa: `crates/latency-bench/src/latency.rs`
- Sửa: `crates/pipeline/Cargo.toml`
- Sửa: `crates/pipeline/src/asr_client.rs`
- Sửa: `crates/pipeline/src/config.rs`
- Sửa: `crates/pipeline/src/lib.rs`
- Sửa: `crates/pipeline/src/llama.rs`
- Tạo: `crates/pipeline/src/logfile.rs`
- Tạo: `crates/pipeline/src/process.rs`
- Tạo: `crates/pipeline/src/prompt_history.rs`
- Sửa: `crates/pipeline/src/sse.rs`
- Test (tạo): `crates/pipeline/tests/shutdown.rs`
- Tạo: `scripts/fake-pkg-config`

- [ ] **Step 1: Thêm phụ thuộc và khai báo module**

Sửa `crates/pipeline/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/Cargo.toml
+++ b/crates/pipeline/Cargo.toml
@@ -10,12 +10,26 @@
 asr-protocol = { path = "../asr-protocol" }
 candle-core = "0.11.0"
 candle-onnx = "0.11.0"
+# Đổi phồn thể sang giản thể (spec §6.4, "Việc cho MVP"): bảng của OpenCC (Apache-2.0), thuần Rust.
 ferrous-opencc = { version = "0.4.0", default-features = false, features = ["t2s-conversion"] }
 log = "0.4.34"
 miniz_oxide = { version = "0.9.1", default-features = false, features = ["with-alloc"] }
 reqwest = { version = "0.13.5", default-features = false, features = ["blocking", "json"] }
 serde.workspace = true
 serde_json.workspace = true
+thiserror.workspace = true
+
+[target.'cfg(unix)'.dependencies]
+libc = "0.2.189"
+
+[target.'cfg(windows)'.dependencies]
+# Job Object để tiến trình phụ không bị bỏ lại khi app chết (spec §5). Cùng bản với `audio-capture`.
+windows = { version = "0.62.2", features = [
+    "Win32_Foundation",
+    "Win32_Security",
+    "Win32_System_JobObjects",
+    "Win32_System_Threading",
+] }
 
 [dev-dependencies]
 hound.workspace = true
```

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -2,7 +2,10 @@
 pub mod config;
 pub mod filter;
 pub mod llama;
+pub mod logfile;
+pub mod process;
 pub mod prompt;
+pub mod prompt_history;
 pub mod segmenter;
 pub mod sentence;
 pub mod sse;
```

- [ ] **Step 2: Viết test**

Tạo `crates/asr-worker/tests/stdin_eof.rs`:

```rust
//! `asr-worker` tự thoát khi stdin đóng (spec §5): app bị kill hẳn (Force Quit) thì pipe stdin đóng, và worker không bị bỏ
//! lại, kể cả khi chưa nạp model hay vừa trả lời một yêu cầu.

use asr_protocol::{ErrorKind, Request, Response, read_frame, write_frame};
use std::io::BufReader;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn exits_within(child: &mut std::process::Child, limit: Duration) -> std::process::ExitStatus {
    let deadline = Instant::now() + limit;
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            return status;
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            panic!("asr-worker không thoát sau {limit:?} khi stdin đóng");
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn closing_stdin_ends_the_worker() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_asr-worker"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    write_frame(&mut stdin, &Request::Warmup).unwrap();
    match read_frame::<_, Response>(&mut stdout).unwrap() {
        Some(Response::Error { kind, .. }) => assert_eq!(kind, ErrorKind::NotLoaded),
        other => panic!("phản hồi lạ: {other:?}"),
    }
    drop(stdin);
    let status = exits_within(&mut child, Duration::from_secs(5));
    assert!(status.success(), "{status}");
}
```

Sửa `crates/pipeline/src/asr_client.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/asr_client.rs
+++ b/crates/pipeline/src/asr_client.rs
@@ -148,3 +148,30 @@
         let _ = self.child.wait();
     }
 }
+
+#[cfg(test)]
+mod tests {
+    use super::*;
+
+    #[test]
+    fn the_worker_runs_in_the_folder_of_its_binary() {
+        let launch = AsrLaunch::new(
+            Path::new("/app/binaries/asr-worker"),
+            Path::new("/m.bin"),
+            Path::new("/l.log"),
+        );
+        let cmd = command(&launch);
+        assert_eq!(cmd.get_current_dir(), Some(Path::new("/app/binaries")));
+        assert_eq!(cmd.get_args().count(), 0, "mọi tham số đi qua `Load`");
+    }
+
+    #[test]
+    fn errors_carry_the_last_non_empty_stderr_lines() {
+        let tail: Vec<String> = (1..=7).map(|i| format!("l{i}")).chain([String::new()]).collect();
+        assert_eq!(
+            with_tail("worker chết".into(), &tail),
+            "worker chết; stderr cuối: l3 | l4 | l5 | l6 | l7"
+        );
+        assert_eq!(with_tail("x".into(), &[]), "x");
+    }
+}
```

Sửa `crates/pipeline/src/config.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/config.rs
+++ b/crates/pipeline/src/config.rs
@@ -510,6 +510,18 @@
         assert_eq!(c.validate(), Ok(()));
     }
 
+    #[test]
+    fn max_tokens_follow_spec_formula() {
+        // §6.5: min(4 × số token câu gốc + 32, 512).
+        let mt = MtConfig::default();
+        assert_eq!(mt.max_tokens_for(0), 32);
+        assert_eq!(mt.max_tokens_for(10), 72);
+        assert_eq!(mt.max_tokens_for(119), 508);
+        assert_eq!(mt.max_tokens_for(120), 512);
+        assert_eq!(mt.max_tokens_for(121), 512);
+        assert_eq!(mt.max_tokens_for(usize::MAX), 512);
+    }
+
     /// Manifest chỉ ghi khóa muốn đổi: khóa thiếu lấy mặc định, khóa lạ bị bỏ qua.
     #[test]
     fn a_partial_manifest_keeps_the_other_defaults() {
```

Sửa `crates/pipeline/src/llama.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/llama.rs
+++ b/crates/pipeline/src/llama.rs
@@ -238,30 +238,55 @@
 
     const ROLE: &str = "data: {\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":null}}]}\n\n";
 
+    fn read_all(body: impl BufRead) -> Result<StreamEnd> {
+        read_stream(body, Instant::now(), &mut |_| ControlFlow::Continue(()))
+    }
+
     #[test]
     fn stream_without_done_is_an_error() {
         let body = format!("{ROLE}data: {{\"choices\":[{{\"delta\":{{\"content\":\"Xin\"}}}}]}}\n\n");
-        let err = read_stream(body.as_bytes(), Instant::now()).unwrap_err();
+        let err = read_all(body.as_bytes()).unwrap_err();
         assert!(err.to_string().contains("[DONE]"), "{err}");
     }
 
     #[test]
-    fn stream_keeps_text_and_finish_reason() {
+    fn stream_keeps_text_finish_reason_and_token_count() {
         let body = format!(
             "{ROLE}data: {{\"choices\":[{{\"delta\":{{\"content\":\"Xin\"}}}}]}}\n\n: keep-alive\n\n\
              data:{{\"choices\":[{{\"delta\":{{\"content\":\" chào \"}}}}]}}\r\n\r\n\
-             data: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"length\"}}]}}\n\ndata: [DONE]\n\n"
-        );
-        let t = read_stream(body.as_bytes(), Instant::now()).unwrap();
-        assert_eq!(t.text, "Xin chào");
-        assert_eq!(t.finish_reason.as_deref(), Some("length"));
-        assert!(t.first_token_ms <= t.total_ms);
+             data: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"length\"}}],\"timings\":{{\"predicted_n\":2}}}}\n\n\
+             data: [DONE]\n\n"
+        );
+        let end = read_all(body.as_bytes()).unwrap();
+        assert_eq!(end.text, "Xin chào ", "chữ nguyên văn, hậu xử lý làm sau");
+        assert_eq!(end.finish_reason.as_deref(), Some("length"));
+        assert_eq!((end.completion_tokens, end.chunks, end.cancelled), (Some(2), 2, false));
+        assert!(end.first_token_ms <= end.total_ms);
+    }
+
+    #[test]
+    fn breaking_from_the_callback_cancels_the_stream() {
+        let chunk = |c: &str| format!("data: {{\"choices\":[{{\"delta\":{{\"content\":\"{c}\"}}}}]}}\n\n");
+        let body = format!("{}{}{}", chunk("a"), chunk("b"), chunk("c"));
+        let mut seen = Vec::new();
+        let end = read_stream(body.as_bytes(), Instant::now(), &mut |c| {
+            seen.push(c.to_string());
+            if seen.len() == 2 {
+                ControlFlow::Break(())
+            } else {
+                ControlFlow::Continue(())
+            }
+        })
+        .unwrap();
+        assert_eq!(seen, ["a", "b"]);
+        assert!(end.cancelled && end.finish_reason.is_none());
+        assert_eq!(end.text, "ab");
     }
 
     #[test]
     fn error_chunk_mid_stream_is_an_error() {
         let body = format!("{ROLE}data: {{\"error\":{{\"code\":500,\"message\":\"boom\"}}}}\n\n");
-        assert!(read_stream(body.as_bytes(), Instant::now()).is_err());
+        assert!(read_all(body.as_bytes()).is_err());
     }
 
     /// Đọc từng đoạn byte, mỗi đoạn tới sau một khoảng chờ: giả lập stream chậm mà không cần server.
@@ -294,38 +319,13 @@
             (wait, content_event("Xin")),
             (Duration::ZERO, b"data: [DONE]\n\n".to_vec()),
         ]);
-        let t = read_stream(BufReader::new(Paced(events)), Instant::now()).unwrap();
-        assert_eq!(t.text, "Xin");
+        let end = read_all(BufReader::new(Paced(events))).unwrap();
+        assert_eq!(end.text.trim(), "Xin");
         assert!(
-            t.first_token_ms >= 80.0,
+            end.first_token_ms >= 80.0,
             "chữ đầu tới sau 80 ms, nhưng first_token_ms = {}",
-            t.first_token_ms
-        );
-    }
-
-    #[test]
-    fn token_count_is_length_of_tokens_array() {
-        assert_eq!(parse_token_count(r#"{"tokens":[1,22,333]}"#).unwrap(), 3);
-        assert_eq!(parse_token_count(r#"{"tokens":[]}"#).unwrap(), 0);
-    }
-
-    #[test]
-    fn token_count_rejects_bodies_without_tokens() {
-        assert!(parse_token_count("").is_err());
-        assert!(parse_token_count("<html>502 Bad Gateway</html>").is_err());
-        assert!(parse_token_count(r#"{"error":{"code":401,"message":"Invalid API Key"}}"#).is_err());
-        assert!(parse_token_count(r#"{"tokens":"abc"}"#).is_err());
-    }
-
-    #[test]
-    fn max_tokens_follow_spec_formula() {
-        // §6.5: min(4 × số token câu gốc + 32, 512).
-        assert_eq!(max_tokens_for(0), 32);
-        assert_eq!(max_tokens_for(10), 72);
-        assert_eq!(max_tokens_for(119), 508);
-        assert_eq!(max_tokens_for(120), 512);
-        assert_eq!(max_tokens_for(121), 512);
-        assert_eq!(max_tokens_for(usize::MAX), 512);
+            end.first_token_ms
+        );
     }
 
     #[test]
@@ -335,10 +335,103 @@
             (Duration::from_millis(20), content_event(" ")),
             (Duration::ZERO, b"data: [DONE]\n\n".to_vec()),
         ]);
-        let t = read_stream(BufReader::new(Paced(events)), Instant::now()).unwrap();
-        assert_eq!(t.text, "");
-        // Không có chữ nào: mốc "chữ đầu" rơi về lúc kết thúc, không phải lúc chunk trắng đầu tiên tới.
-        assert_eq!(t.first_token_ms, t.total_ms);
-        assert!(t.total_ms >= 20.0);
-    }
-}
+        let end = read_all(BufReader::new(Paced(events))).unwrap();
+        assert_eq!(end.text.trim(), "");
+        // Không có chữ nào: mốc "chữ đầu" rơi về lúc kết thúc, không phải lúc gói trắng đầu tiên tới.
+        assert_eq!(end.first_token_ms, end.total_ms);
+        assert!(end.total_ms >= 20.0);
+    }
+
+    #[test]
+    fn token_count_is_length_of_tokens_array() {
+        assert_eq!(parse_token_count(r#"{"tokens":[1,22,333]}"#).unwrap(), 3);
+        assert_eq!(parse_token_count(r#"{"tokens":[]}"#).unwrap(), 0);
+    }
+
+    #[test]
+    fn token_count_rejects_bodies_without_tokens() {
+        assert!(parse_token_count("").is_err());
+        assert!(parse_token_count("<html>502 Bad Gateway</html>").is_err());
+        assert!(parse_token_count(r#"{"error":{"code":401,"message":"Invalid API Key"}}"#).is_err());
+        assert!(parse_token_count(r#"{"tokens":"abc"}"#).is_err());
+    }
+
+    fn launch() -> LlamaLaunch {
+        LlamaLaunch::new(
+            Path::new("/app/llama-server"),
+            Path::new("/models/mt.gguf"),
+            Path::new("/logs/llama.log"),
+        )
+    }
+
+    fn args(cmd: &Command) -> Vec<String> {
+        cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect()
+    }
+
+    #[test]
+    fn api_key_goes_through_the_environment_not_the_command_line() {
+        let key = "0123456789abcdef0123456789abcdef";
+        let cmd = command(&launch(), 18_000, key);
+        let args = args(&cmd);
+        assert!(
+            args.iter().all(|a| !a.contains(key)),
+            "key không được nằm trong tham số: {args:?}"
+        );
+        assert!(!args.iter().any(|a| a == "--api-key"));
+        let env: Vec<_> = cmd.get_envs().collect();
+        assert_eq!(
+            env,
+            [(std::ffi::OsStr::new(API_KEY_ENV), Some(std::ffi::OsStr::new(key)))]
+        );
+    }
+
+    #[test]
+    fn command_follows_the_spec() {
+        let cmd = command(&launch(), 18_000, "k");
+        assert_eq!(
+            cmd.get_current_dir(),
+            Some(Path::new("/app")),
+            "chạy trong thư mục của binary"
+        );
+        assert_eq!(
+            args(&cmd),
+            [
+                "-m",
+                "/models/mt.gguf",
+                "--host",
+                "127.0.0.1",
+                "--port",
+                "18000",
+                "-c",
+                "2048",
+                "-np",
+                "1",
+                "-ngl",
+                "auto",
+                "--no-ui"
+            ]
+        );
+    }
+
+    #[test]
+    fn cpu_mode_and_extra_args() {
+        let cpu = LlamaLaunch {
+            use_gpu: false,
+            extra_args: vec!["--no-repack".into()],
+            ..launch()
+        };
+        let args = args(&command(&cpu, 18_000, "k"));
+        let ngl = args.iter().position(|a| a == "-ngl").unwrap();
+        assert_eq!(args[ngl + 1], "0");
+        assert_eq!(args.last().map(String::as_str), Some("--no-repack"));
+        assert!(!args.iter().any(|a| a == "99"), "không bao giờ -ngl 99 (§6.5)");
+    }
+
+    #[test]
+    fn random_keys_are_128_bit_hex_and_differ() {
+        let (a, b) = (random_key(), random_key());
+        assert_eq!(a.len(), 32);
+        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
+        assert_ne!(a, b);
+    }
+}
```

Tạo `crates/pipeline/src/logfile.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! File log của tiến trình phụ (spec §6.4, "Việc cho MVP"): mở ở chế độ append để giữ log của lần chạy trước khi tiến
//! trình phụ khởi động lại (log crash), và xoay vòng để file không lớn mãi.
//!
//! Log của tiến trình phụ là stderr của `asr-worker` và `llama-server`: whisper.cpp, llama.cpp và ggml ghi thông số model,
//! thiết bị và lỗi, không ghi âm thanh hay nội dung chép lời. App chỉ ghi vào đây qua tiến trình phụ.
//!
//! stderr đi qua một pipe tới luồng [`pump`] của app, không đi thẳng vào file. Nhờ vậy app xoay file cả khi tiến trình phụ
//! đang chạy, che các chuỗi bí mật (API key của `llama-server`) nếu tiến trình phụ lỡ in ra, và giữ vài dòng cuối để
//! phân loại lỗi khi tiến trình phụ khởi động hỏng (hết bộ nhớ, lỗi GPU).

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
```

Tạo `crates/pipeline/src/prompt_history.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Prompt khởi đầu cho `asr-worker` (spec §6.4, "Giải mã"): tối đa 100 token cuối của các đoạn trước cùng ngôn ngữ, giữ ở
//! tiến trình chính. Đoạn bị luật bỏ đoạn loại ra thì không vào đây (§6.4, "Lọc lỗi ảo giác").
//!
//! Việc cho MVP ở §6.4 ("Luật lặp khi prompt dài"): worker cho mỗi đoạn tối đa min(224 − độ dài prompt, 16 + 20 × số giây)
//! token mới. Prompt đủ 100 token (105 kể cả token đặc biệt) hạ trần còn 119, nên câu chép đôi dài từ 60 token không bị
//! luật lặp 2 bản bắt. Vì vậy app chỉ gửi phần prompt không làm trần theo độ dài bị hạ: trần của worker luôn là
//! `16 + 20 × số giây`, có prompt hay không. Đoạn 3 giây vẫn có đủ 100 token, đoạn 8,4 giây (8 giây cộng đệm) còn 35 token,
//! đoạn gộp 12 giây của hàng đợi (§7) không có prompt.

#[cfg(test)]
mod tests {
    use super::*;

    const SECOND: usize = SAMPLE_RATE as usize;

    #[test]
    fn budget_keeps_the_audio_cap_of_the_worker() {
        assert_eq!(prompt_budget(3 * SECOND, 100), 100); // trần 76: còn chỗ cho đủ 100
        assert_eq!(prompt_budget(134_400, 100), 35); // 8,4 giây: trần 184, 219 − 184 = 35
        assert_eq!(prompt_budget(12 * SECOND, 100), 0); // đoạn gộp 12 giây: trần 256 > 219
        for n in [SECOND, 5 * SECOND, 134_400, 10 * SECOND] {
            let k = prompt_budget(n, 100);
            // Công thức trần của worker với prompt k token: min(224 − (k + 5), 16 + 20 × giây).
            let cap_with_prompt = (TEXT_CTX_HALF - (k + 5)).min(audio_token_cap(n));
            assert_eq!(cap_with_prompt, audio_token_cap(n), "{n} mẫu");
        }
    }

    #[test]
    fn history_is_per_language_and_keeps_the_last_tokens() {
        let mut h = PromptHistory::new(100);
        h.push("en", &(0..80).collect::<Vec<i32>>());
        h.push("en", &(80..130).collect::<Vec<i32>>());
        h.push("vi", &[7, 8]);
        let en = h.prompt_for(Some("en"), 3 * SECOND);
        assert_eq!(en.len(), 100);
        assert_eq!((en[0], en[99]), (30, 129));
        assert_eq!(h.prompt_for(Some("vi"), 3 * SECOND), [7, 8]);
        assert!(h.prompt_for(Some("ja"), 3 * SECOND).is_empty());
        assert!(h.prompt_for(None, 3 * SECOND).is_empty());
    }

    #[test]
    fn long_segments_get_the_tail_of_the_history() {
        let mut h = PromptHistory::new(100);
        h.push("en", &(0..100).collect::<Vec<i32>>());
        let p = h.prompt_for(Some("en"), 134_400);
        assert_eq!(p, (65..100).collect::<Vec<i32>>());
        assert!(h.prompt_for(Some("en"), 12 * SECOND).is_empty());
    }
}
```

Sửa `crates/pipeline/src/sse.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/sse.rs
+++ b/crates/pipeline/src/sse.rs
@@ -44,16 +44,19 @@
         let want = SseEvent::Delta {
             content: "Xin".into(),
             finish_reason: None,
+            completion_tokens: None,
         };
         assert_eq!(parse_sse_line(line).unwrap(), want);
     }
 
     #[test]
-    fn finish_chunk_has_empty_delta_and_reason() {
-        let line = r#"data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
+    fn finish_chunk_has_empty_delta_reason_and_token_count() {
+        // Gói cuối thật của llama-server b11146 (rút gọn): `timings.predicted_n` là số token đã sinh.
+        let line = r#"data: {"choices":[{"finish_reason":"stop","index":0,"delta":{}}],"timings":{"prompt_n":32,"predicted_n":24}}"#;
         let want = SseEvent::Delta {
             content: String::new(),
             finish_reason: Some("stop".into()),
+            completion_tokens: Some(24),
         };
         assert_eq!(parse_sse_line(line).unwrap(), want);
     }
@@ -64,6 +67,7 @@
         let want = SseEvent::Delta {
             content: String::new(),
             finish_reason: None,
+            completion_tokens: None,
         };
         assert_eq!(parse_sse_line(line).unwrap(), want);
         assert_eq!(parse_sse_line("data:[DONE]\r").unwrap(), SseEvent::Done);
```

Tạo `crates/pipeline/tests/shutdown.rs`:

```rust
//! `process::begin_shutdown` bật một cờ toàn cục của tiến trình, nên test nằm ở binary riêng: test khác không bị ảnh hưởng.

#![cfg(unix)]

use pipeline::process::{begin_shutdown, configure, kill_all, live, shutting_down, spawn};
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

fn sleep_cmd() -> Command {
    let mut cmd = Command::new("/bin/sleep");
    cmd.arg("30");
    configure(&mut cmd);
    cmd
}

/// Lúc app thoát: sau `begin_shutdown`, giám sát đang khởi động lại không chạy thêm được tiến trình nào, và `kill_all`
/// dọn hết tiến trình đã chạy.
#[test]
fn after_begin_shutdown_nothing_starts_and_kill_all_cleans_up() {
    let exe = Path::new("/bin/sleep");
    let mut child = spawn(&mut sleep_cmd(), exe).unwrap();
    assert!(!shutting_down());
    begin_shutdown();
    assert!(shutting_down());
    let err = spawn(&mut sleep_cmd(), exe).unwrap_err();
    assert!(err.to_string().contains("đang thoát"), "{err}");
    assert_eq!(live(), [child.id()], "lần chạy bị từ chối không được ghi nhận");
    kill_all();
    let deadline = Instant::now() + Duration::from_secs(5);
    while child.try_wait().unwrap().is_none() {
        assert!(Instant::now() < deadline, "kill_all phải giết tiến trình phụ");
        std::thread::sleep(Duration::from_millis(10));
    }
}
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --lib`
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0583]: file not found for module `process`
error[E0425]: cannot find type `StreamEnd` in this scope
error[E0433]: cannot find type `ControlFlow` in this scope
error[E0425]: cannot find type `LlamaLaunch` in this scope
error[E0425]: cannot find value `API_KEY_ENV` in this scope
error[E0422]: cannot find struct, variant or union type `LlamaLaunch` in this scope
```

- [ ] **Step 4: Viết code**

Sửa `crates/latency-bench/src/asr_eval.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/asr_eval.rs
+++ b/crates/latency-bench/src/asr_eval.rs
@@ -2,7 +2,7 @@
 
 use anyhow::{Context, Result, bail};
 use asr_protocol::{MAX_PCM_SAMPLES, MIN_PCM_SAMPLES, TranscribeRequest, audio_ctx_for_samples};
-use pipeline::asr_client::AsrWorker;
+use pipeline::asr_client::{AsrLaunch, AsrWorker};
 use serde::{Deserialize, Serialize};
 use std::io::{BufRead, BufReader, BufWriter, Write};
 use std::path::PathBuf;
@@ -95,7 +95,13 @@
     let part = PathBuf::from(part);
     // Log theo lượt: bắt đầu lượt mới thì xóa log cũ cùng tên. Client vẫn mở append để giữ log khi worker khởi động lại.
     std::fs::File::create(&log).with_context(|| format!("không tạo được log {}", log.display()))?;
-    let (mut worker, ready) = AsrWorker::spawn(&args.asr_worker, &args.asr_model, args.use_gpu, args.threads, &log)?;
+    let launch = AsrLaunch {
+        use_gpu: args.use_gpu,
+        n_threads: args.threads,
+        request_timeout: crate::latency::TOOL_REQUEST_TIMEOUT,
+        ..AsrLaunch::new(&args.asr_worker, &args.asr_model, &log)
+    };
+    let (mut worker, ready) = AsrWorker::spawn(&launch)?;
     worker.warmup()?;
     println!(
         "asr: {} ({}), chế độ giải mã {}\n{}",
```

Sửa `crates/latency-bench/src/latency.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/latency.rs
+++ b/crates/latency-bench/src/latency.rs
@@ -6,10 +6,10 @@
 use crate::stats::{Utterance, match_segments, percentile};
 use anyhow::{Context, Result, bail};
 use asr_protocol::{MAX_PROMPT_TOKENS, MIN_AUDIO_CTX, TranscribeRequest, audio_ctx_for_samples};
-use pipeline::asr_client::AsrWorker;
+use pipeline::asr_client::{AsrLaunch, AsrWorker};
 use pipeline::config::{FilterConfig, PipelineConfig};
 use pipeline::filter::{Evidence, PcmSkip, Verdict, pcm_skip, verdict};
-use pipeline::llama::{LlamaServer, max_tokens_for};
+use pipeline::llama::{LlamaLaunch, LlamaServer};
 use pipeline::prompt::{Lang, translation_prompt};
 use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES, Segment, Segmenter, SegmenterConfig};
 use pipeline::sentence::{OpenSentence, Piece, merge_window_ms, plan_merge};
@@ -30,6 +30,8 @@
 const FEED_LAG_WARN_MS: f64 = 100.0;
 /// Đoạn có mốc dừng sớm hơn mốc VAD của câu quá ngưỡng này (ms) thì câu bị gắn cờ `early_stop`.
 const EARLY_STOP_MS: i64 = 200;
+/// Timeout của một yêu cầu tới tiến trình phụ trong công cụ đo: rất rộng, vì đây không phải chỗ phát hiện worker treo.
+pub const TOOL_REQUEST_TIMEOUT: Duration = Duration::from_secs(600);
 
 // Lý do một đoạn không được dịch, ghi ở `SegmentRecord::skipped`.
 /// Đoạn không có tiếng nói theo luật `no_speech_prob` và `avg_logprob` (`pipeline::filter::is_no_speech`), hoặc chữ rỗng:
@@ -222,21 +224,29 @@
         ..config.segmenter.clone()
     });
 
-    let (mut asr, ready) = AsrWorker::spawn(
-        &args.asr_worker,
-        &args.asr_model,
-        args.use_gpu,
-        args.asr_threads,
-        &args.log_dir.join(format!("asr-worker-{}.log", args.label)),
-    )?;
+    let asr_launch = AsrLaunch {
+        use_gpu: args.use_gpu,
+        n_threads: args.asr_threads,
+        // Công cụ đo không kill worker vì chậm: máy tham chiếu chạy bằng CPU có thể mất lâu với đoạn dài.
+        request_timeout: TOOL_REQUEST_TIMEOUT,
+        ..AsrLaunch::new(
+            &args.asr_worker,
+            &args.asr_model,
+            &args.log_dir.join(format!("asr-worker-{}.log", args.label)),
+        )
+    };
+    let (mut asr, ready) = AsrWorker::spawn(&asr_launch)?;
     let asr_warmup_ms = asr.warmup()?;
-    let llama_args: Vec<String> = args.llama_args.split_whitespace().map(String::from).collect();
-    let llama = LlamaServer::spawn(
-        &args.llama_server,
-        &args.mt_model,
-        &llama_args,
-        &args.log_dir.join(format!("llama-server-{}.log", args.label)),
-    )?;
+    let llama_launch = LlamaLaunch {
+        extra_args: args.llama_args.split_whitespace().map(String::from).collect(),
+        request_timeout: TOOL_REQUEST_TIMEOUT,
+        ..LlamaLaunch::new(
+            &args.llama_server,
+            &args.mt_model,
+            &args.log_dir.join(format!("llama-server-{}.log", args.label)),
+        )
+    };
+    let llama = LlamaServer::spawn(&llama_launch)?;
     llama.translate(&translation_prompt("Hello.", Lang::En, target), 32)?; // làm nóng
     println!(
         "asr: {} ({}), chế độ giải mã {}, làm nóng {asr_warmup_ms:.0} ms",
@@ -267,6 +277,7 @@
     let merge_config = config.merge.clone();
     let filter_config = config.filter.clone();
     let asr_filter_config = config.filter.clone();
+    let mt_config = config.mt.clone();
     let asr_thread = std::thread::spawn(move || -> Result<()> {
         let mut prompts: HashMap<String, Vec<i32>> = HashMap::new();
         // Ngôn ngữ của đoạn đã chép lời trước đó, kể cả đoạn bị bỏ: đúng trạng thái mà `asr-worker` của Giai đoạn 0 tự giữ,
@@ -352,7 +363,7 @@
                         };
                         // Tính `max_tokens` theo §6.5, trên cả câu. Lần gọi /tokenize nằm trong thời gian của bước dịch.
                         let src_tokens = llama.count_tokens(&source)?;
-                        let max_tokens = max_tokens_for(src_tokens);
+                        let max_tokens = mt_config.max_tokens_for(src_tokens);
                         let t = llama.translate(&translation_prompt(&source, src, target), max_tokens)?;
                         let done = now_ms();
                         rec.merged_segments = Some(merged);
```

Thay toàn bộ `crates/pipeline/src/asr_client.rs` bằng:

```rust
//! Chạy và nói chuyện với tiến trình phụ `asr-worker` qua stdin/stdout (spec §6.4).
//!
//! Lỗi chia hai loại, để bên giám sát (`supervisor`) biết khi nào phải khởi động lại worker:
//! - `AsrError::Worker`: worker trả `Error` cho yêu cầu (vẫn sống), kèm `ErrorKind`;
//! - `AsrError::Crashed`: worker chết, pipe hỏng, khung sai, lệch phiên bản giao thức, hoặc quá thời gian chờ (worker
//!   bị kill). Luồng giao thức không còn dùng được.

use crate::logfile;
use crate::process;
use asr_protocol::{
    Backend, DecodeMode, ErrorKind, PROTOCOL_VERSION, Request, Response, TranscribeRequest, TranscribeResult,
    read_frame, write_frame,
};
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum AsrError {
    #[error("asr-worker báo lỗi {kind:?}: {message}")]
    Worker { kind: ErrorKind, message: String },
    #[error("asr-worker không dùng được nữa: {0}")]
    Crashed(String),
}

impl AsrError {
    pub fn is_crash(&self) -> bool {
        matches!(self, Self::Crashed(_))
    }

    pub fn kind(&self) -> Option<ErrorKind> {
        match self {
            Self::Worker { kind, .. } => Some(*kind),
            Self::Crashed(_) => None,
        }
    }
}

/// Cách chạy một `asr-worker`.
#[derive(Clone, Debug)]
pub struct AsrLaunch {
    pub exe: PathBuf,
    pub model: PathBuf,
    /// stderr của worker (log của whisper.cpp); mở nối tiếp và xoay vòng cả khi đang chạy (`logfile`).
    pub log: PathBuf,
    pub use_gpu: bool,
    pub n_threads: u32,
    /// Chờ `Ready` sau `Load` (§6.5: lần đầu chạy binary mới thì chờ lâu hơn).
    pub ready_timeout: Duration,
    /// Chờ kết quả của một `Transcribe` hay `Warmup`; quá thì kill worker (§9).
    pub request_timeout: Duration,
    /// Chờ worker tự thoát sau `Shutdown` trước khi kill.
    pub shutdown_grace: Duration,
    /// Biến môi trường thêm cho worker (test dùng để điều khiển worker giả).
    pub env: Vec<(String, String)>,
}

impl AsrLaunch {
    pub fn new(exe: &Path, model: &Path, log: &Path) -> Self {
        Self {
            exe: exe.to_path_buf(),
            model: model.to_path_buf(),
            log: log.to_path_buf(),
            use_gpu: true,
            n_threads: 4,
            ready_timeout: Duration::from_secs(180),
            request_timeout: Duration::from_secs(30),
            shutdown_grace: Duration::from_secs(5),
            env: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReadyInfo {
    /// Thiết bị worker thật sự dùng (spec §6.4), không phải thiết bị được yêu cầu.
    pub backend: Backend,
    /// Chế độ B (`Shared`) hoặc chế độ A (`Split`), spec §6.4.
    pub decode_mode: DecodeMode,
    pub whisper_version: String,
    pub system_info: String,
}

pub struct AsrWorker {
    child: Arc<Mutex<Child>>,
    pid: u32,
    /// Luồng chép stderr vào log; kết thúc khi worker thoát.
    pump: Option<std::thread::JoinHandle<()>>,
    tail: logfile::Tail,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    /// Đường dẫn file log của worker, để thông báo lỗi chỉ chỗ xem log.
    log: PathBuf,
    request_timeout: Duration,
    shutdown_grace: Duration,
}

impl AsrWorker {
    /// Chạy worker, gửi `Load`, chờ `Ready` và kiểm phiên bản giao thức. Worker chết lúc nạp thì lỗi kèm vài dòng cuối
    /// của stderr (log của whisper.cpp, không có âm thanh hay chữ chép lời), để phân loại được lỗi GPU và hết bộ nhớ.
    pub fn spawn(launch: &AsrLaunch) -> Result<(Self, ReadyInfo), AsrError> {
        let crashed = |e: String| AsrError::Crashed(e);
        let log = logfile::RotatingLog::open(&launch.log, logfile::MAX_BYTES, logfile::KEEP)
            .map_err(|e| crashed(format!("không mở được log {}: {e}", launch.log.display())))?;
        let mut cmd = command(launch);
        let mut child = process::spawn(&mut cmd, &launch.exe)
            .map_err(|e| crashed(format!("không chạy được {}: {e}", launch.exe.display())))?;
        let pid = child.id();
        let stdin = BufWriter::new(child.stdin.take().expect("stdin là pipe"));
        let stdout = BufReader::new(child.stdout.take().expect("stdout là pipe"));
        let (pump, tail) = logfile::pump(child.stderr.take().expect("stderr là pipe"), log, Vec::new());
        let mut worker = Self {
            child: Arc::new(Mutex::new(child)),
            pid,
            pump: Some(pump),
            tail: tail.clone(),
            stdin,
            stdout,
            log: launch.log.clone(),
            request_timeout: launch.request_timeout,
            shutdown_grace: launch.shutdown_grace,
        };
        let load = Request::Load {
            model_path: launch.model.display().to_string(),
            use_gpu: launch.use_gpu,
            n_threads: launch.n_threads,
        };
        let ready = match worker.call(&load, launch.ready_timeout) {
            Ok(r) => r,
            Err(AsrError::Crashed(e)) => {
                drop(worker); // chờ worker thoát và luồng chép log đọc hết stderr
                return Err(crashed(with_tail(e, &tail.lines())));
            }
            Err(e) => return Err(e),
        };
        match ready {
            Response::Ready { protocol_version, .. } if protocol_version != PROTOCOL_VERSION => Err(crashed(format!(
                "asr-worker dùng giao thức phiên bản {protocol_version}, app cần {PROTOCOL_VERSION}: build lại cả hai cùng lúc"
            ))),
            Response::Ready {
                backend,
                decode_mode,
                whisper_version,
                system_info,
                ..
            } => Ok((
                worker,
                ReadyInfo {
                    backend,
                    decode_mode,
                    whisper_version,
                    system_info,
                },
            )),
            Response::Error { kind, message, .. } => Err(AsrError::Worker { kind, message }),
            other => Err(crashed(format!("phản hồi không mong đợi cho `Load`: {other:?}"))),
        }
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// Vài dòng cuối của stderr.
    pub fn log_tail(&self) -> Vec<String> {
        self.tail.lines()
    }

    pub fn warmup(&mut self) -> Result<f32, AsrError> {
        match self.call(&Request::Warmup, self.request_timeout)? {
            Response::WarmupDone { millis } => Ok(millis),
            Response::Error { kind, message, .. } => Err(AsrError::Worker { kind, message }),
            other => Err(AsrError::Crashed(format!(
                "phản hồi không mong đợi cho `Warmup`: {other:?}"
            ))),
        }
    }

    pub fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrError> {
        let id = req.segment_id;
        match self.call(&Request::Transcribe(req), self.request_timeout)? {
            Response::Result(r) if r.segment_id == id => Ok(r),
            Response::Result(r) => Err(AsrError::Crashed(format!(
                "asr-worker trả kết quả đoạn {} khi đang chờ đoạn {id}",
                r.segment_id
            ))),
            Response::Error { kind, message, .. } => Err(AsrError::Worker { kind, message }),
            other => Err(AsrError::Crashed(format!("phản hồi không mong đợi: {other:?}"))),
        }
    }

    /// Gửi một yêu cầu và chờ phản hồi, tối đa `timeout`. Quá thời gian thì kill worker: lệnh đọc đang chặn nhận EOF
    /// ngay, và lỗi trả về là `Crashed`.
    fn call(&mut self, req: &Request, timeout: Duration) -> Result<Response, AsrError> {
        let (done_tx, done_rx) = mpsc::channel::<()>();
        let timed_out = Arc::new(AtomicBool::new(false));
        let watchdog = {
            let child = self.child.clone();
            let timed_out = timed_out.clone();
            std::thread::spawn(move || {
                if let Err(RecvTimeoutError::Timeout) = done_rx.recv_timeout(timeout) {
                    timed_out.store(true, Ordering::SeqCst);
                    let _ = child.lock().unwrap_or_else(|e| e.into_inner()).kill();
                }
            })
        };
        let res = write_frame(&mut self.stdin, req)
            .map_err(|e| format!("gửi yêu cầu cho asr-worker: {e}"))
            .and_then(|()| read_frame(&mut self.stdout).map_err(|e| format!("đọc phản hồi của asr-worker: {e}")))
            .and_then(|r| r.ok_or_else(|| "asr-worker đóng stdout".to_string()));
        let _ = done_tx.send(());
        let _ = watchdog.join();
        res.map_err(|e| {
            if timed_out.load(Ordering::SeqCst) {
                return AsrError::Crashed(format!("asr-worker không trả lời sau {timeout:?}, đã kill"));
            }
            // Lỗi pipe thường là do worker vừa chết: chờ ngắn để lấy mã thoát (tiến trình có thể chưa kịp thành zombie).
            let deadline = Instant::now() + Duration::from_millis(200);
            while Instant::now() < deadline {
                if let Ok(Some(status)) = self.child.lock().unwrap_or_else(|e| e.into_inner()).try_wait() {
                    return AsrError::Crashed(format!(
                        "{e}; asr-worker đã thoát ({status}), xem {}",
                        self.log.display()
                    ));
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            AsrError::Crashed(e)
        })
    }
}

/// Lệnh chạy worker. Thư mục làm việc là thư mục chứa binary, để không thư viện nào được tìm ở thư mục làm việc của app.
pub fn command(launch: &AsrLaunch) -> Command {
    let mut cmd = Command::new(&launch.exe);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .envs(launch.env.iter().map(|(k, v)| (k, v)));
    if let Some(dir) = launch.exe.parent().filter(|d| !d.as_os_str().is_empty()) {
        cmd.current_dir(dir);
    }
    process::configure(&mut cmd);
    cmd
}

/// Thêm tối đa 5 dòng cuối của stderr vào thông báo lỗi.
pub fn with_tail(message: String, tail: &[String]) -> String {
    let last: Vec<&str> = tail
        .iter()
        .rev()
        .filter(|l| !l.trim().is_empty())
        .take(5)
        .map(String::as_str)
        .collect();
    if last.is_empty() {
        return message;
    }
    let joined: Vec<&str> = last.into_iter().rev().collect();
    format!("{message}; stderr cuối: {}", joined.join(" | "))
}

impl Drop for AsrWorker {
    fn drop(&mut self) {
        let _ = write_frame(&mut self.stdin, &Request::Shutdown);
        let mut child = self.child.lock().unwrap_or_else(|e| e.into_inner());
        // Worker treo (ví dụ driver GPU lỗi) thì không chờ mãi: sau `shutdown_grace` thì kill.
        let deadline = Instant::now() + self.shutdown_grace;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = child.try_wait() {
                process::release(self.pid);
                drop(child);
                self.join_pump();
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = child.kill();
        let _ = child.wait();
        process::release(self.pid);
        drop(child);
        self.join_pump();
    }
}

impl AsrWorker {
    /// Worker đã thoát nên stderr đã đóng: luồng chép log kết thúc ngay sau khi đọc hết.
    fn join_pump(&mut self) {
        if let Some(pump) = self.pump.take() {
            let _ = pump.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_worker_runs_in_the_folder_of_its_binary() {
        let launch = AsrLaunch::new(
            Path::new("/app/binaries/asr-worker"),
            Path::new("/m.bin"),
            Path::new("/l.log"),
        );
        let cmd = command(&launch);
        assert_eq!(cmd.get_current_dir(), Some(Path::new("/app/binaries")));
        assert_eq!(cmd.get_args().count(), 0, "mọi tham số đi qua `Load`");
    }

    #[test]
    fn errors_carry_the_last_non_empty_stderr_lines() {
        let tail: Vec<String> = (1..=7).map(|i| format!("l{i}")).chain([String::new()]).collect();
        assert_eq!(
            with_tail("worker chết".into(), &tail),
            "worker chết; stderr cuối: l3 | l4 | l5 | l6 | l7"
        );
        assert_eq!(with_tail("x".into(), &[]), "x");
    }
}
```

Sửa `crates/pipeline/src/llama.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/llama.rs
+++ b/crates/pipeline/src/llama.rs
@@ -1,83 +1,204 @@
 //! Chạy `llama-server` và gọi `/v1/chat/completions` ở chế độ stream (spec §6.5).
-
+//!
+//! - Lệnh chạy theo §6.5: `LLAMA_API_KEY=<ngẫu nhiên> llama-server -m <gguf> --host 127.0.0.1 --port <cổng trống> -c 2048
+//!   -np 1 -ngl auto --no-ui`. API key đi qua biến môi trường, chỉ đặt cho tiến trình `llama-server`, không qua tham số
+//!   dòng lệnh (hiện ra trong `ps`). Key tạo mới mỗi lần chạy và chỉ nằm trong RAM; không bao giờ vào log hay `Debug`.
+//!   stderr của server đi qua `logfile::pump`, có che key, nên server lỡ in key thì `llama-server.log` vẫn không có.
+//! - Chạy bằng CPU (§9, chuyển sang CPU): `-ngl 0` thay cho `-ngl auto`. Không bao giờ truyền `-ngl 99`.
+//! - Mỗi gói SSE của `llama-server` b11146 chứa đúng một token (đã kiểm lúc lập kế hoạch 02: 24 gói chữ, `predicted_n`
+//!   24), nên hậu xử lý đếm gói để đo độ dài bản dịch trong lúc stream.
+
+use crate::logfile;
+use crate::process;
 use crate::sse::{SseEvent, parse_sse_line};
 use anyhow::{Context, Result, bail};
 use std::collections::hash_map::RandomState;
-use std::fs::File;
 use std::hash::{BuildHasher, Hasher};
 use std::io::{BufRead, BufReader};
 use std::net::TcpListener;
+use std::ops::ControlFlow;
 use std::path::{Path, PathBuf};
-use std::process::{Child, Command, Stdio};
+use std::process::{Child, Command, ExitStatus, Stdio};
 use std::time::{Duration, Instant};
+
+/// Tên biến môi trường mang API key (b11146 nhận cả `--api-key` lẫn biến này).
+pub const API_KEY_ENV: &str = "LLAMA_API_KEY";
+
+/// Cách chạy một `llama-server`.
+#[derive(Clone, Debug)]
+pub struct LlamaLaunch {
+    pub exe: PathBuf,
+    pub model: PathBuf,
+    /// stderr của server; mở nối tiếp và xoay vòng cả khi đang chạy (`logfile`).
+    pub log: PathBuf,
+    /// `false`: chạy bằng CPU (`-ngl 0`).
+    pub use_gpu: bool,
+    /// Tham số thêm, ví dụ `--no-repack` khi thiếu RAM lúc chạy bằng CPU (§8).
+    pub extra_args: Vec<String>,
+    /// Chờ `/health` báo sẵn sàng.
+    pub ready_timeout: Duration,
+    /// Timeout của một request (cả stream).
+    pub request_timeout: Duration,
+}
+
+impl LlamaLaunch {
+    pub fn new(exe: &Path, model: &Path, log: &Path) -> Self {
+        Self {
+            exe: exe.to_path_buf(),
+            model: model.to_path_buf(),
+            log: log.to_path_buf(),
+            use_gpu: true,
+            extra_args: Vec::new(),
+            ready_timeout: Duration::from_secs(180),
+            request_timeout: Duration::from_secs(120),
+        }
+    }
+}
+
+/// Lệnh chạy theo §6.5. Tách riêng để test kiểm được tham số và biến môi trường mà không cần chạy server.
+///
+/// **Không bao giờ log lệnh này** (`{cmd:?}`, `log::debug!("{:?}", cmd)`…): `Debug` của `Command` in cả biến môi trường,
+/// tức in luôn API key. Thư mục làm việc là thư mục chứa binary, để không thư viện nào được tìm ở thư mục làm việc của app.
+pub fn command(launch: &LlamaLaunch, port: u16, api_key: &str) -> Command {
+    let mut cmd = Command::new(&launch.exe);
+    cmd.arg("-m")
+        .arg(&launch.model)
+        .args(["--host", "127.0.0.1", "--port", &port.to_string()])
+        .args(["-c", "2048", "-np", "1"])
+        .args(["-ngl", if launch.use_gpu { "auto" } else { "0" }])
+        .arg("--no-ui")
+        .args(&launch.extra_args)
+        .env(API_KEY_ENV, api_key)
+        .stdin(Stdio::null())
+        .stdout(Stdio::null())
+        .stderr(Stdio::piped());
+    if let Some(dir) = launch.exe.parent().filter(|d| !d.as_os_str().is_empty()) {
+        cmd.current_dir(dir);
+    }
+    process::configure(&mut cmd);
+    cmd
+}
+
+/// Một request dịch.
+#[derive(Clone, Copy, Debug)]
+pub struct ChatRequest<'a> {
+    pub prompt: &'a str,
+    pub max_tokens: u32,
+    pub repeat_penalty: f32,
+}
+
+/// Kết thúc một stream.
+#[derive(Clone, Debug, Default, PartialEq)]
+pub struct StreamEnd {
+    /// Chữ đã nhận, nguyên văn (chưa hậu xử lý).
+    pub text: String,
+    /// Từ lúc gửi request tới gói đầu có ký tự không phải khoảng trắng; không có chữ nào thì bằng `total_ms`.
+    pub first_token_ms: f32,
+    pub total_ms: f32,
+    /// "stop", hoặc "length" khi chạm `max_tokens` (bản dịch bị cụt). `None` nếu bị hủy giữa chừng.
+    pub finish_reason: Option<String>,
+    /// `timings.predicted_n` của gói cuối, nếu server gửi.
+    pub completion_tokens: Option<usize>,
+    /// Số gói có chữ (khác rỗng) đã nhận.
+    pub chunks: usize,
+    /// Bên gọi dừng stream giữa chừng (`on_delta` trả `Break`).
+    pub cancelled: bool,
+}
+
+/// Bản dịch đã xong, dạng cũ của Giai đoạn 0 (`latency-bench`).
+#[derive(Debug, Clone)]
+pub struct Translation {
+    pub text: String,
+    pub first_token_ms: f32,
+    pub total_ms: f32,
+    pub finish_reason: Option<String>,
+}
 
 pub struct LlamaServer {
     child: Child,
+    /// Luồng chép stderr vào log (che key); kết thúc khi server thoát.
+    pump: Option<std::thread::JoinHandle<()>>,
+    tail: logfile::Tail,
     base_url: String,
     api_key: String,
     http: reqwest::blocking::Client,
     log_path: PathBuf,
-}
-
-#[derive(Debug, Clone)]
-pub struct Translation {
-    pub text: String,
-    /// Từ lúc gửi request tới khi nhận chunk đầu tiên có ký tự không phải khoảng trắng. Bản dịch không có chữ nào
-    /// thì bằng `total_ms`.
-    pub first_token_ms: f32,
-    pub total_ms: f32,
-    /// "stop", hoặc "length" khi chạm `max_tokens` (bản dịch bị cụt).
-    pub finish_reason: Option<String>,
+    request_timeout: Duration,
+}
+
+// Debug viết tay: không in API key.
+impl std::fmt::Debug for LlamaServer {
+    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
+        f.debug_struct("LlamaServer")
+            .field("pid", &self.child.id())
+            .field("base_url", &self.base_url)
+            .field("api_key", &"<ẩn>")
+            .finish()
+    }
 }
 
 impl LlamaServer {
-    /// Lệnh chạy theo §6.5. `extra_args` dùng để thử tham số khác trong spike.
-    pub fn spawn(exe: &Path, model: &Path, extra_args: &[String], stderr_log: &Path) -> Result<Self> {
+    pub fn spawn(launch: &LlamaLaunch) -> Result<Self> {
         // Chỉ gọi 127.0.0.1: reqwest vẫn đọc HTTP_PROXY/ALL_PROXY kể cả khi tắt feature `system-proxy`,
         // nên phải tắt proxy tường minh, giống `ProxyHandler({})` trong common.py.
         // Dựng client trước khi chạy tiến trình, để lỗi ở đây không bỏ lại server mồ côi.
         let http = reqwest::blocking::Client::builder()
             .no_proxy()
-            .timeout(Duration::from_secs(120))
+            .timeout(launch.request_timeout)
             .build()?;
         let port = TcpListener::bind("127.0.0.1:0")?.local_addr()?.port();
         let api_key = random_key();
-        // Ghi nối tiếp như common.py: chạy lại cùng nhãn không xóa log của lần server vừa chết.
-        let log = File::options()
-            .create(true)
-            .append(true)
-            .open(stderr_log)
-            .with_context(|| format!("không mở được {}", stderr_log.display()))?;
-        let child = Command::new(exe)
-            .arg("-m")
-            .arg(model)
-            .args([
-                "--host",
-                "127.0.0.1",
-                "--port",
-                &port.to_string(),
-                "--api-key",
-                &api_key,
-            ])
-            .args(["-c", "2048", "-np", "1", "-ngl", "auto", "--no-ui"])
-            .args(extra_args)
-            .stdout(Stdio::null())
-            .stderr(Stdio::from(log))
-            .spawn()
-            .with_context(|| format!("không chạy được {}", exe.display()))?;
+        let log = logfile::RotatingLog::open(&launch.log, logfile::MAX_BYTES, logfile::KEEP)
+            .with_context(|| format!("không mở được {}", launch.log.display()))?;
+        let mut child = process::spawn(&mut command(launch, port, &api_key), &launch.exe)
+            .with_context(|| format!("không chạy được {}", launch.exe.display()))?;
+        let stderr = child.stderr.take().expect("stderr là pipe");
+        let (pump, tail) = logfile::pump(stderr, log, vec![api_key.clone()]);
         let mut server = Self {
             child,
+            pump: Some(pump),
+            tail,
             base_url: format!("http://127.0.0.1:{port}"),
             api_key,
             http,
-            log_path: stderr_log.to_path_buf(),
+            log_path: launch.log.clone(),
+            request_timeout: launch.request_timeout,
         };
-        server.wait_healthy(Duration::from_secs(180))?;
+        if let Err(e) = server.wait_healthy(launch.ready_timeout) {
+            // Kill rồi chờ luồng chép log đọc hết, để lỗi mang đủ các dòng cuối (hết bộ nhớ, lỗi GPU…).
+            let tail = server.tail.clone();
+            drop(server);
+            bail!(crate::asr_client::with_tail(format!("{e:#}"), &tail.lines()));
+        }
         Ok(server)
     }
 
     pub fn pid(&self) -> u32 {
         self.child.id()
+    }
+
+    /// `http://127.0.0.1:<cổng>`.
+    pub fn base_url(&self) -> &str {
+        &self.base_url
+    }
+
+    /// Vài dòng cuối của stderr, đã che key.
+    pub fn log_tail(&self) -> Vec<String> {
+        self.tail.lines()
+    }
+
+    /// Mã thoát nếu server đã chết.
+    pub fn exited(&mut self) -> Option<ExitStatus> {
+        self.child.try_wait().ok().flatten()
+    }
+
+    /// `/health` trả 200 (không cần API key). 503 khi đang nạp model.
+    pub fn healthy(&self) -> bool {
+        self.http
+            .get(format!("{}/health", self.base_url))
+            .timeout(Duration::from_secs(2))
+            .send()
+            .is_ok_and(|r| r.status().is_success())
     }
 
     fn wait_healthy(&mut self, timeout: Duration) -> Result<()> {
@@ -87,13 +208,7 @@
                 bail!("llama-server thoát sớm ({status}), xem log {}", self.log_path.display());
             }
             // Mỗi lần hỏi chỉ chờ 2 giây, để tổng thời gian chờ không vượt `timeout` quá nhiều.
-            if let Ok(resp) = self
-                .http
-                .get(format!("{}/health", self.base_url))
-                .timeout(Duration::from_secs(2))
-                .send()
-                && resp.status().is_success()
-            {
+            if self.healthy() {
                 return Ok(());
             }
             std::thread::sleep(Duration::from_millis(200));
@@ -104,19 +219,20 @@
         )
     }
 
-    /// Dịch một prompt đã dựng sẵn (xem `prompt.rs`). Tham số sinh theo §6.5.
-    pub fn translate(&self, prompt: &str, max_tokens: u32) -> Result<Translation> {
+    /// Dịch một prompt với tham số sinh của §6.5, stream tới hết. `on_delta` nhận từng gói chữ; trả `Break` để dừng
+    /// (đóng kết nối, server thôi sinh token).
+    pub fn stream(&self, req: &ChatRequest, on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>) -> Result<StreamEnd> {
         let body = serde_json::json!({
-            "messages": [{ "role": "user", "content": prompt }],
+            "messages": [{ "role": "user", "content": req.prompt }],
             "stream": true,
             "temperature": 0.0,
-            "repeat_penalty": 1.05,
-            "max_tokens": max_tokens,
+            "repeat_penalty": req.repeat_penalty,
+            "max_tokens": req.max_tokens,
             "cache_prompt": true,
         });
         let started = Instant::now();
         let resp = self.post("/v1/chat/completions", &body)?;
-        read_stream(BufReader::new(resp), started).with_context(|| {
+        read_stream(BufReader::new(resp), started, on_delta).with_context(|| {
             format!(
                 "đọc bản dịch từ llama-server thất bại, xem log {}",
                 self.log_path.display()
@@ -124,8 +240,24 @@
         })
     }
 
+    /// Dạng của Giai đoạn 0: repeat penalty 1,05, đọc tới hết, cắt khoảng trắng hai đầu.
+    pub fn translate(&self, prompt: &str, max_tokens: u32) -> Result<Translation> {
+        let req = ChatRequest {
+            prompt,
+            max_tokens,
+            repeat_penalty: 1.05,
+        };
+        let end = self.stream(&req, &mut |_| ControlFlow::Continue(()))?;
+        Ok(Translation {
+            text: end.text.trim().to_string(),
+            first_token_ms: end.first_token_ms,
+            total_ms: end.total_ms,
+            finish_reason: end.finish_reason,
+        })
+    }
+
     /// Số token của `text` theo tokenizer của model (`POST /tokenize`, giống `count_tokens` trong `common.py`),
-    /// để tính `max_tokens` theo [`max_tokens_for`].
+    /// để tính `max_tokens` (§6.5).
     pub fn count_tokens(&self, text: &str) -> Result<usize> {
         let resp = self.post("/tokenize", &serde_json::json!({ "content": text }))?;
         parse_token_count(&resp.text()?)
@@ -137,6 +269,7 @@
             .http
             .post(format!("{}{path}", self.base_url))
             .bearer_auth(&self.api_key)
+            .timeout(self.request_timeout)
             .json(body)
             .send()
             .with_context(|| {
@@ -154,12 +287,6 @@
     }
 }
 
-/// Số token tối đa của bản dịch theo §6.5: min(4 × số token câu gốc + 32, 512).
-pub fn max_tokens_for(source_tokens: usize) -> u32 {
-    const CAP: usize = 512;
-    source_tokens.saturating_mul(4).saturating_add(32).min(CAP) as u32
-}
-
 /// Đếm phần tử của `tokens` trong phản hồi của `/tokenize`. Tách khỏi `count_tokens` để test được không cần server.
 fn parse_token_count(body: &str) -> Result<usize> {
     let value: serde_json::Value =
@@ -170,25 +297,39 @@
     Ok(tokens.len())
 }
 
-/// Đọc stream tới `[DONE]`. Tách khỏi `translate` để test được bằng dữ liệu mẫu, không cần server.
-fn read_stream(reader: impl BufRead, started: Instant) -> Result<Translation> {
-    let mut text = String::new();
+/// Đọc stream tới `[DONE]`, hoặc tới khi `on_delta` trả `Break`. Tách khỏi `stream` để test được bằng dữ liệu mẫu, không
+/// cần server.
+fn read_stream(
+    reader: impl BufRead,
+    started: Instant,
+    on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
+) -> Result<StreamEnd> {
+    let mut end = StreamEnd::default();
     let mut first_token_ms = None;
-    let mut finish_reason = None;
     let mut done = false;
     for line in reader.lines() {
         match parse_sse_line(&line?)? {
             SseEvent::Delta {
                 content,
-                finish_reason: reason,
+                finish_reason,
+                completion_tokens,
             } => {
-                // Chunk chỉ có khoảng trắng hay xuống dòng (model hay mở đầu bằng "\n") chưa phải chữ dịch:
+                // Gói chỉ có khoảng trắng hay xuống dòng (model hay mở đầu bằng "\n") chưa phải chữ dịch:
                 // hậu xử lý (§6.5) sẽ cắt chúng, nên người xem chưa thấy gì.
                 if first_token_ms.is_none() && !content.trim().is_empty() {
                     first_token_ms = Some(started.elapsed().as_secs_f32() * 1000.0);
                 }
-                text.push_str(&content);
-                finish_reason = reason.or(finish_reason);
+                end.finish_reason = finish_reason.or(end.finish_reason);
+                end.completion_tokens = completion_tokens.or(end.completion_tokens);
+                if !content.is_empty() {
+                    end.chunks += 1;
+                    end.text.push_str(&content);
+                    if on_delta(&content).is_break() {
+                        end.cancelled = true;
+                        done = true;
+                        break;
+                    }
+                }
             }
             SseEvent::Done => {
                 done = true;
@@ -200,26 +341,26 @@
     if !done {
         bail!(
             "stream kết thúc mà không có [DONE] (đã nhận {} ký tự): bản dịch có thể bị cụt",
-            text.chars().count()
-        );
-    }
-    let total_ms = started.elapsed().as_secs_f32() * 1000.0;
-    Ok(Translation {
-        text: text.trim().to_string(),
-        first_token_ms: first_token_ms.unwrap_or(total_ms),
-        total_ms,
-        finish_reason,
-    })
+            end.text.chars().count()
+        );
+    }
+    end.total_ms = started.elapsed().as_secs_f32() * 1000.0;
+    end.first_token_ms = first_token_ms.unwrap_or(end.total_ms);
+    Ok(end)
 }
 
 impl Drop for LlamaServer {
     fn drop(&mut self) {
         let _ = self.child.kill();
         let _ = self.child.wait();
-    }
-}
-
-/// Khóa ngẫu nhiên cho `--api-key`. `RandomState` lấy seed từ bộ sinh số ngẫu nhiên của hệ điều hành.
+        process::release(self.child.id());
+        if let Some(pump) = self.pump.take() {
+            let _ = pump.join();
+        }
+    }
+}
+
+/// Khóa ngẫu nhiên 128 bit cho `LLAMA_API_KEY`. `RandomState` lấy seed từ bộ sinh số ngẫu nhiên của hệ điều hành.
 fn random_key() -> String {
     (0..2)
         .map(|i| {
```

Thêm vào `crates/pipeline/src/logfile.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
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
```

Tạo `crates/pipeline/src/process.rs`:

```rust
//! Chạy tiến trình phụ sao cho chúng không bị bỏ lại khi app chết (spec §5, "Việc cho MVP").
//!
//! App chính build với `panic = "abort"`, nên `Drop` không chạy khi app panic.
//! - macOS (Unix): mỗi tiến trình phụ là trưởng một process group riêng. [`install_panic_hook`] thêm một hook chạy trước khi
//!   abort, gửi `SIGKILL` cho mọi group còn sống. `asr-worker` còn tự thoát khi stdin đóng, kể cả khi app bị kill hẳn.
//! - Windows: mọi tiến trình phụ vào một Job Object có `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. App chết bằng bất kỳ cách nào
//!   thì handle của job đóng, và Windows kill cả job. Tiến trình phụ chạy với `CREATE_NO_WINDOW`, vì app là ứng dụng GUI
//!   nên tiến trình console con sẽ bật cửa sổ console.
//!
//! App bị `SIGKILL` (Force Quit) hay crash vì tín hiệu thì hook không chạy, và `llama-server` còn lại. Vì vậy trên macOS
//! mỗi tiến trình phụ còn được ghi vào một pidfile (`set_pidfile`, thường là `sidecars-live.json` trong thư mục dữ liệu
//! của app). Lần mở app sau, [`reap_orphans`] đọc file đó và kill tiến trình còn sót, chỉ khi đủ bốn điều kiện: binary
//! ghi trong file nằm trong thư mục tiến trình phụ của app, và tiến trình đang chạy ở pid đó có cùng thời điểm bắt đầu,
//! cùng đường dẫn binary, và vẫn là trưởng group của nó. Pid có thể đã được cấp lại cho tiến trình khác, nên thiếu một
//! điều kiện là không kill.
//!
//! Pidfile là của một bản app đang chạy: plugin single-instance (kế hoạch 01) bảo đảm chỉ một bản app chạy mỗi lúc, nên
//! khi `setup` của bản mới gọi [`reap_orphans`], mọi mục trong file là của một lần chạy đã chết.
//!
//! Lúc app thoát, [`begin_shutdown`] bật cờ toàn cục: từ đó [`spawn`] luôn trả lỗi, nên giám sát đang khởi động lại không
//! thể chạy thêm tiến trình sau [`kill_all`].

use serde::{Deserialize, Serialize};
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, Once};
use std::time::{Duration, Instant};

/// Một tiến trình phụ, như ghi trong pidfile.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub pid: u32,
    /// Thời điểm tiến trình bắt đầu, micro giây từ epoch (macOS: `pbi_start_tvsec`, `pbi_start_tvusec`). 0 nếu không đọc
    /// được: mục đó không bao giờ bị kill ở lần mở sau.
    pub start_us: u64,
    /// Đường dẫn thật (đã `canonicalize`) của binary.
    pub exe: PathBuf,
}

struct Registry {
    entries: Vec<Entry>,
    pidfile: Option<PathBuf>,
}

static LIVE: Mutex<Registry> = Mutex::new(Registry {
    entries: Vec::new(),
    pidfile: None,
});
static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

fn registry() -> MutexGuard<'static, Registry> {
    LIVE.lock().unwrap_or_else(|e| e.into_inner())
}

impl Registry {
    fn save(&self) {
        if let Some(path) = &self.pidfile
            && let Err(e) = write_pidfile(path, &self.entries)
        {
            log::warn!("không ghi được {}: {e}", path.display());
        }
    }
}

/// Đặt cờ cho lệnh chạy tiến trình phụ, trước `spawn`.
pub fn configure(cmd: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

/// Chạy một tiến trình phụ và ghi nhận nó: vào Job Object (Windows), vào danh sách để hook panic dọn, và vào pidfile.
/// Kiểm cờ thoát, chạy và ghi nhận dưới cùng một khóa với [`kill_all`], nên không tiến trình nào lọt ra sau khi app đã
/// dọn. `exe` là binary của lệnh, ghi vào pidfile.
pub fn spawn(cmd: &mut Command, exe: &Path) -> io::Result<Child> {
    let mut reg = registry();
    if SHUTTING_DOWN.load(Ordering::SeqCst) {
        return Err(io::Error::other("app đang thoát, không chạy thêm tiến trình phụ"));
    }
    let child = cmd.spawn()?;
    #[cfg(windows)]
    if let Err(e) = job::assign(&child) {
        log::warn!("không đưa được tiến trình phụ {} vào Job Object: {e}", child.id());
    }
    let pid = child.id();
    reg.entries.push(Entry {
        pid,
        start_us: start_time_us(pid).unwrap_or(0),
        exe: std::fs::canonicalize(exe).unwrap_or_else(|_| exe.to_path_buf()),
    });
    reg.save();
    Ok(child)
}

/// Bỏ ghi nhận sau khi tiến trình phụ đã thoát và được `wait`: pid có thể được cấp lại cho tiến trình khác.
pub fn release(pid: u32) {
    let mut reg = registry();
    let before = reg.entries.len();
    reg.entries.retain(|e| e.pid != pid);
    if reg.entries.len() != before {
        reg.save();
    }
}

/// Các tiến trình phụ đang được ghi nhận (để test và để log lúc thoát).
pub fn live() -> Vec<u32> {
    let mut pids: Vec<u32> = registry().entries.iter().map(|e| e.pid).collect();
    pids.sort_unstable();
    pids
}

/// Mục đang được ghi nhận của `pid`, nếu có.
pub fn entry(pid: u32) -> Option<Entry> {
    registry().entries.iter().find(|e| e.pid == pid).cloned()
}

/// Từ giờ ghi danh sách tiến trình phụ vào `path` (ghi file tạm rồi đổi tên). Gọi ở `setup`, sau [`reap_orphans`].
pub fn set_pidfile(path: &Path) {
    let mut reg = registry();
    reg.pidfile = Some(path.to_path_buf());
    reg.save();
}

/// Ghi `entries` vào `path`: ghi file tạm cạnh đó rồi `rename`, để lần mở sau không đọc phải file ghi dở.
pub fn write_pidfile(path: &Path, entries: &[Entry]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, serde_json::to_vec(entries).map_err(io::Error::other)?)?;
    std::fs::rename(&tmp, path)
}

/// Kill các tiến trình phụ mà lần chạy trước của app bỏ lại (Force Quit), theo pidfile ở `path`. Trả về pid đã kill.
/// Chỉ kill mục khớp cả thời điểm bắt đầu, đường dẫn binary và process group (xem đầu module), và binary nằm trong
/// `allowed_dir` (thư mục tiến trình phụ của app): pidfile có bị sửa cũng không làm app kill tiến trình nào khác. File
/// thiếu hay hỏng thì không làm gì. Trên Windows luôn trả rỗng: Job Object đã kill tiến trình phụ khi app chết.
pub fn reap_orphans(path: &Path, allowed_dir: &Path) -> Vec<u32> {
    let allowed = std::fs::canonicalize(allowed_dir).unwrap_or_else(|_| allowed_dir.to_path_buf());
    let Ok(bytes) = std::fs::read(path) else {
        return Vec::new();
    };
    let entries: Vec<Entry> = match serde_json::from_slice(&bytes) {
        Ok(entries) => entries,
        Err(e) => {
            log::warn!("bỏ qua {}: {e}", path.display());
            return Vec::new();
        }
    };
    let mut killed = Vec::new();
    for e in entries {
        if e.exe.starts_with(&allowed) && is_orphan_of_ours(&e) {
            log::warn!(
                "kill tiến trình phụ còn sót từ lần chạy trước: pid {} ({})",
                e.pid,
                e.exe.display()
            );
            kill_group(e.pid);
            killed.push(e.pid);
        }
    }
    killed
}

/// Tiến trình `e.pid` vẫn đúng là tiến trình đã ghi: cùng thời điểm bắt đầu, cùng binary, và vẫn là trưởng group.
fn is_orphan_of_ours(e: &Entry) -> bool {
    if e.start_us == 0 || start_time_us(e.pid) != Some(e.start_us) {
        return false;
    }
    if exe_path(e.pid).as_deref() != Some(e.exe.as_path()) {
        return false;
    }
    #[cfg(unix)]
    {
        // SAFETY: `getpgid` chỉ đọc.
        let pgid = unsafe { libc::getpgid(e.pid as libc::pid_t) };
        pgid == e.pid as libc::pid_t
    }
    #[cfg(not(unix))]
    false
}

/// Thời điểm bắt đầu của tiến trình `pid`, micro giây từ epoch.
#[cfg(target_os = "macos")]
pub fn start_time_us(pid: u32) -> Option<u64> {
    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
    let size = size_of::<libc::proc_bsdinfo>() as libc::c_int;
    // SAFETY: `info` đủ chỗ cho `PROC_PIDTBSDINFO`; hàm chỉ ghi vào đó.
    let n = unsafe {
        libc::proc_pidinfo(
            pid as libc::c_int,
            libc::PROC_PIDTBSDINFO,
            0,
            (&mut info as *mut libc::proc_bsdinfo).cast(),
            size,
        )
    };
    (n == size).then(|| info.pbi_start_tvsec * 1_000_000 + info.pbi_start_tvusec)
}

#[cfg(not(target_os = "macos"))]
pub fn start_time_us(_pid: u32) -> Option<u64> {
    None
}

/// Đường dẫn binary của tiến trình `pid`.
#[cfg(target_os = "macos")]
fn exe_path(pid: u32) -> Option<PathBuf> {
    use std::os::unix::ffi::OsStrExt;
    let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: `buf` có đúng `PROC_PIDPATHINFO_MAXSIZE` byte.
    let n = unsafe { libc::proc_pidpath(pid as libc::c_int, buf.as_mut_ptr().cast(), buf.len() as u32) };
    (n > 0).then(|| PathBuf::from(std::ffi::OsStr::from_bytes(&buf[..n as usize])))
}

#[cfg(not(target_os = "macos"))]
fn exe_path(_pid: u32) -> Option<PathBuf> {
    None
}

/// Bật cờ thoát: từ giờ [`spawn`] luôn trả lỗi. Gọi trước [`kill_all`] lúc app thoát.
pub fn begin_shutdown() {
    SHUTTING_DOWN.store(true, Ordering::SeqCst);
}

pub fn shutting_down() -> bool {
    SHUTTING_DOWN.load(Ordering::SeqCst)
}

/// Gọi một lần lúc app khởi động: khi panic, kill mọi tiến trình phụ còn sống trước khi abort.
pub fn install_panic_hook() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            kill_all_from_panic();
            previous(info);
        }));
    });
}

/// Kill mọi tiến trình phụ đang được ghi nhận. Trên Windows không cần: Job Object kill cả job khi app thoát.
pub fn kill_all() {
    for e in &registry().entries {
        kill_group(e.pid);
    }
}

/// Như [`kill_all`], nhưng không chờ khóa quá 200 ms: luồng đang panic có thể chính là luồng giữ khóa.
fn kill_all_from_panic() {
    let deadline = Instant::now() + Duration::from_millis(200);
    loop {
        match LIVE.try_lock() {
            Ok(reg) => {
                reg.entries.iter().for_each(|e| kill_group(e.pid));
                return;
            }
            Err(std::sync::TryLockError::Poisoned(p)) => {
                p.into_inner().entries.iter().for_each(|e| kill_group(e.pid));
                return;
            }
            Err(std::sync::TryLockError::WouldBlock) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(std::sync::TryLockError::WouldBlock) => return,
        }
    }
}

/// Unix: gửi `SIGKILL` cho cả group của tiến trình phụ `pid` (group có id bằng pid vì `process_group(0)`).
pub fn kill_group(pid: u32) {
    #[cfg(unix)]
    // SAFETY: `killpg` chỉ gửi tín hiệu.
    unsafe {
        libc::killpg(pid as libc::pid_t, libc::SIGKILL);
    }
    #[cfg(windows)]
    let _ = pid;
}

#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use std::sync::OnceLock;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation, SetInformationJobObject,
    };
    use windows::core::PCWSTR;

    /// Handle của job, giữ tới hết đời tiến trình (không bao giờ đóng: đóng là kill hết tiến trình phụ).
    struct Job(HANDLE);
    // SAFETY: handle của kernel object dùng được từ mọi luồng.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    fn job() -> windows::core::Result<&'static Job> {
        static JOB: OnceLock<Result<Job, windows::core::Error>> = OnceLock::new();
        JOB.get_or_init(|| {
            // SAFETY: tạo job không tên; `info` sống tới hết lệnh gọi.
            unsafe {
                let handle = CreateJobObjectW(None, PCWSTR::null())?;
                let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const std::ffi::c_void,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )?;
                Ok(Job(handle))
            }
        })
        .as_ref()
        .map_err(Clone::clone)
    }

    pub fn assign(child: &Child) -> windows::core::Result<()> {
        let job = job()?;
        // SAFETY: handle của `child` còn hiệu lực trong lúc `child` còn sống.
        unsafe { AssignProcessToJobObject(job.0, HANDLE(child.as_raw_handle())) }
    }
}

// Test chỉ có trên Unix: trên Windows, việc dọn tiến trình phụ là của Job Object (cần máy Windows để thử).
#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn sleeper() -> Child {
        let exe = Path::new("/bin/sleep");
        let mut cmd = Command::new(exe);
        cmd.arg("30");
        configure(&mut cmd);
        spawn(&mut cmd, exe).unwrap()
    }

    fn wait_killed(child: &mut Child) -> Option<i32> {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if let Some(status) = child.try_wait().unwrap() {
                use std::os::unix::process::ExitStatusExt;
                return status.signal();
            }
            if Instant::now() > deadline {
                return None;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    struct TempDir(PathBuf);
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn temp(name: &str) -> TempDir {
        let dir = std::env::temp_dir().join(format!("pipeline-process-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        TempDir(dir)
    }

    #[test]
    fn a_child_leads_its_own_process_group_and_is_killed_with_it() {
        let mut child = sleeper();
        let pid = child.id();
        assert!(live().contains(&pid));
        // SAFETY: chỉ đọc pgid của tiến trình con.
        let pgid = unsafe { libc::getpgid(pid as libc::pid_t) };
        assert_eq!(pgid, pid as libc::pid_t, "tiến trình phụ là trưởng group của nó");
        // Chỉ kill đúng tiến trình này: test khác chạy song song cũng có tiến trình phụ đang được ghi nhận.
        kill_group(pid);
        assert_eq!(
            wait_killed(&mut child),
            Some(libc::SIGKILL),
            "kill_group phải giết được tiến trình phụ"
        );
        release(pid);
        assert!(!live().contains(&pid));
    }

    /// N5 của review 02 lần 3: binary chạy qua một symlink thì pidfile ghi đường dẫn thật, để lần sau so được với
    /// `proc_pidpath`.
    #[cfg(target_os = "macos")]
    #[test]
    fn a_binary_run_through_a_symlink_is_recorded_by_its_real_path() {
        let dir = temp("symlink");
        std::fs::create_dir_all(&dir.0).unwrap();
        let link = dir.0.join("sleep-link");
        std::os::unix::fs::symlink("/bin/sleep", &link).unwrap();
        let mut cmd = Command::new(&link);
        cmd.arg("30");
        configure(&mut cmd);
        let mut child = spawn(&mut cmd, &link).unwrap();
        let e = entry(child.id()).unwrap();
        assert_eq!(e.exe, std::fs::canonicalize("/bin/sleep").unwrap());
        kill_group(child.id());
        wait_killed(&mut child);
        release(child.id());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn the_pidfile_entry_names_the_start_time_and_the_real_binary() {
        let mut child = sleeper();
        let e = entry(child.id()).unwrap();
        assert!(e.start_us > 0);
        assert_eq!(start_time_us(child.id()), Some(e.start_us));
        assert_eq!(e.exe, std::fs::canonicalize("/bin/sleep").unwrap());
        assert_eq!(exe_path(child.id()).as_deref(), Some(e.exe.as_path()));
        kill_group(child.id());
        wait_killed(&mut child);
        release(child.id());
    }

    /// Lần mở sau chỉ kill tiến trình còn đúng là tiến trình đã ghi.
    #[cfg(target_os = "macos")]
    #[test]
    fn orphans_are_reaped_only_when_everything_matches() {
        let dir = temp("reap");
        let file = dir.0.join("sidecars-live.json");
        let mut child = sleeper();
        let real = entry(child.id()).unwrap();
        let wrong_start = Entry {
            start_us: real.start_us + 1,
            ..real.clone()
        };
        // Binary khác nhưng cũng nằm trong thư mục cho phép: chỉ phép so đường dẫn binary chặn được.
        let wrong_exe = Entry {
            exe: std::fs::canonicalize("/bin/ls").unwrap(),
            ..real.clone()
        };
        let unknown_start = Entry {
            start_us: 0,
            ..real.clone()
        };
        let bin = std::fs::canonicalize("/bin").unwrap();
        for e in [wrong_start, wrong_exe, unknown_start] {
            write_pidfile(&file, std::slice::from_ref(&e)).unwrap();
            assert_eq!(reap_orphans(&file, &bin), Vec::<u32>::new(), "{e:?}");
            assert_eq!(child.try_wait().unwrap(), None, "không được kill: {e:?}");
        }
        write_pidfile(&file, std::slice::from_ref(&real)).unwrap();
        // Đúng tiến trình nhưng binary nằm ngoài thư mục tiến trình phụ của app: không kill.
        assert_eq!(reap_orphans(&file, &dir.0), Vec::<u32>::new());
        assert_eq!(child.try_wait().unwrap(), None);
        assert_eq!(reap_orphans(&file, &bin), vec![real.pid]);
        assert_eq!(wait_killed(&mut child), Some(libc::SIGKILL));
        release(real.pid);
        // File thiếu hay hỏng thì không làm gì.
        std::fs::write(&file, b"{oops").unwrap();
        assert!(reap_orphans(&file, &bin).is_empty());
        assert!(reap_orphans(&dir.0.join("missing.json"), &bin).is_empty());
    }

    /// PF1 của review 02 lần 2: cùng pid, thời điểm bắt đầu và binary, nhưng tiến trình không còn là trưởng group (ở đây
    /// một tiến trình không chạy qua `configure`, nằm trong group của test): không kill.
    #[cfg(target_os = "macos")]
    #[test]
    fn a_process_that_does_not_lead_its_group_is_not_reaped() {
        let dir = temp("reap-group");
        let file = dir.0.join("sidecars-live.json");
        let mut child = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let pid = child.id();
        let e = Entry {
            pid,
            start_us: start_time_us(pid).unwrap(),
            exe: std::fs::canonicalize("/bin/sleep").unwrap(),
        };
        assert_eq!(exe_path(pid).as_deref(), Some(e.exe.as_path()));
        write_pidfile(&file, std::slice::from_ref(&e)).unwrap();
        assert!(reap_orphans(&file, &std::fs::canonicalize("/bin").unwrap()).is_empty());
        assert_eq!(child.try_wait().unwrap(), None, "không được kill");
        let _ = child.kill();
        let _ = child.wait();
    }

    /// PF5 của review 02 lần 2: mỗi lần [`spawn`] ghi ngay pidfile (nếu đã đặt), và [`release`] bỏ mục đó.
    #[test]
    fn spawn_and_release_rewrite_the_pidfile() {
        let dir = temp("pidfile");
        let file = dir.0.join("sidecars-live.json");
        set_pidfile(&file);
        let read = || -> Vec<u32> {
            let entries: Vec<Entry> = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
            entries.iter().map(|e| e.pid).collect()
        };
        let mut child = sleeper();
        let pid = child.id();
        let listed = read().contains(&pid);
        kill_group(pid);
        wait_killed(&mut child);
        release(pid);
        let after = read().contains(&pid);
        registry().pidfile = None;
        assert!(listed, "spawn phải ghi pid vào pidfile");
        assert!(!after, "release phải bỏ pid khỏi pidfile");
    }

    #[test]
    fn the_pidfile_is_replaced_whole() {
        let dir = temp("write");
        let file = dir.0.join("data/sidecars-live.json");
        let e = Entry {
            pid: 7,
            start_us: 1,
            exe: PathBuf::from("/x"),
        };
        write_pidfile(&file, &[e.clone(), e.clone()]).unwrap();
        write_pidfile(&file, std::slice::from_ref(&e)).unwrap();
        let back: Vec<Entry> = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
        assert_eq!(back, [e]);
        let names: Vec<_> = std::fs::read_dir(file.parent().unwrap()).unwrap().collect();
        assert_eq!(names.len(), 1, "không để lại file tạm");
    }
}
```

Thêm vào `crates/pipeline/src/prompt_history.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use asr_protocol::SAMPLE_RATE;
use std::collections::{HashMap, VecDeque};

/// Nửa ngữ cảnh văn bản của Whisper (`n_text_ctx / 2`, mọi model Whisper đều là 448 / 2).
pub const TEXT_CTX_HALF: usize = 224;
/// `<|startofprev|>` cộng 4 token SOT, ngôn ngữ, task, notimestamps (xem `asr-worker/src/shared.rs`).
const PROMPT_OVERHEAD: usize = 5;

/// Trần token mới theo độ dài đoạn, đúng công thức của `asr-worker` (`max_new_tokens` trong `shared.rs`).
fn audio_token_cap(n_samples: usize) -> usize {
    16 + n_samples * 20 / SAMPLE_RATE as usize
}

/// Số token prompt tối đa cho một đoạn `n_samples` mẫu, để `224 − (prompt + 5) ≥ 16 + 20 × số giây`.
pub fn prompt_budget(n_samples: usize, max_tokens: usize) -> usize {
    (TEXT_CTX_HALF - PROMPT_OVERHEAD)
        .saturating_sub(audio_token_cap(n_samples))
        .min(max_tokens)
}

#[derive(Debug, Default)]
pub struct PromptHistory {
    per_lang: HashMap<String, VecDeque<i32>>,
    max_tokens: usize,
}

impl PromptHistory {
    pub fn new(max_tokens: usize) -> Self {
        Self {
            per_lang: HashMap::new(),
            max_tokens,
        }
    }

    /// Thêm token của một đoạn đã được giữ lại.
    pub fn push(&mut self, lang: &str, tokens: &[i32]) {
        let history = self.per_lang.entry(lang.to_string()).or_default();
        history.extend(tokens);
        let excess = history.len().saturating_sub(self.max_tokens);
        history.drain(..excess);
    }

    /// Prompt cho đoạn kế tiếp: token cuối của ngôn ngữ `prev_lang` (ngôn ngữ của đoạn trước), cắt theo `prompt_budget`.
    /// Worker chỉ dùng prompt này nếu đoạn mới vẫn là `prev_lang`.
    pub fn prompt_for(&self, prev_lang: Option<&str>, n_samples: usize) -> Vec<i32> {
        let Some(history) = prev_lang.and_then(|l| self.per_lang.get(l)) else {
            return Vec::new();
        };
        let take = prompt_budget(n_samples, self.max_tokens).min(history.len());
        history.iter().skip(history.len() - take).copied().collect()
    }
}
```

Sửa `crates/pipeline/src/sse.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/sse.rs
+++ b/crates/pipeline/src/sse.rs
@@ -4,10 +4,12 @@
 
 #[derive(Debug, PartialEq, Eq)]
 pub enum SseEvent {
-    /// Phần chữ mới của bản dịch (có thể rỗng), kèm `finish_reason` nếu đây là gói cuối.
+    /// Phần chữ mới của bản dịch (có thể rỗng), kèm `finish_reason` nếu đây là gói cuối. Gói cuối của `llama-server` còn có
+    /// `timings.predicted_n`: số token đã sinh.
     Delta {
         content: String,
         finish_reason: Option<String>,
+        completion_tokens: Option<usize>,
     },
     Done,
     /// Dòng trống, comment hoặc trường khác `data`.
@@ -31,6 +33,7 @@
     Ok(SseEvent::Delta {
         content: choice["delta"]["content"].as_str().unwrap_or_default().to_string(),
         finish_reason: choice["finish_reason"].as_str().map(String::from),
+        completion_tokens: value["timings"]["predicted_n"].as_u64().map(|n| n as usize),
     })
 }
 
```

Tạo `scripts/fake-pkg-config`:

```bash
#!/bin/sh
# pkg-config giả, chỉ dùng cho scripts/check-windows.sh. candle-core 0.11 luôn kéo `tokenizers` với feature `onig`, nên
# `onig_sys` biên dịch thư viện C oniguruma cho target Windows, mà Mac không có header của MSVC. Với
# RUSTONIG_DYNAMIC_LIBONIG=1, build script của onig_sys hỏi pkg-config trước: script này trả lời như đã có oniguruma
# (kèm một oniguruma.h rỗng), nên không có gì phải biên dịch. `cargo check` và `cargo clippy` không link, nên thư viện
# giả không bao giờ được dùng. Không dùng script này để build bản chạy thật.
inc="${TMPDIR:-/tmp}/meeting-translator-fake-onig"
mkdir -p "$inc"
: > "$inc/oniguruma.h"
for arg in "$@"; do
  case "$arg" in
    --modversion) echo "6.9.10"; exit 0 ;;
    --libs|--cflags) echo "-I$inc -lonig"; exit 0 ;;
  esac
done
exit 0
```

Run: `chmod +x scripts/fake-pkg-config`

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p pipeline && cargo test -p asr-worker --test stdin_eof && cargo test -p latency-bench`
Expected (`pipeline`, rồi `stdin_eof.rs`, rồi `latency-bench`):

```text
test result: ok. 93 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

```text
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s
```

```text
test result: ok. 28 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.66s
```

- [ ] **Step 6: Clippy (cả target Windows) và định dạng**

Run:
```bash
cargo clippy -p pipeline -p latency-bench --all-targets -- -D warnings
RC_x86_64_pc_windows_msvc=$PWD/scripts/fake-llvm-rc PKG_CONFIG_x86_64_pc_windows_msvc=$PWD/scripts/fake-pkg-config \
  PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1 \
  cargo clippy -p pipeline --target x86_64-pc-windows-msvc --all-targets -- -D warnings
cargo fmt --all -- --check
```
Expected: không có cảnh báo, `cargo fmt` không in gì. Dòng cuối của lệnh thứ hai:

```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 17.32s
```

- [ ] **Step 7: Commit**

```bash
git add Cargo.lock \
  crates/asr-worker/tests/stdin_eof.rs \
  crates/latency-bench/src/asr_eval.rs \
  crates/latency-bench/src/latency.rs \
  crates/pipeline/Cargo.toml \
  crates/pipeline/src/asr_client.rs \
  crates/pipeline/src/config.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/llama.rs \
  crates/pipeline/src/logfile.rs \
  crates/pipeline/src/process.rs \
  crates/pipeline/src/prompt_history.rs \
  crates/pipeline/src/sse.rs \
  crates/pipeline/tests/shutdown.rs \
  scripts/fake-pkg-config
git commit -m "feat(pipeline): client asr-worker và llama-server bản 2, log xoay vòng, dọn tiến trình phụ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Tiến trình phụ giả, hậu xử lý bản dịch, dịch một câu

Dịch một câu đúng §6.5 (dòng 144–148, 247; QĐ11, QĐ12, QĐ14):
- `bin/fake_asr_worker.rs`, `bin/fake_llama_server.rs`: hai tiến trình phụ giả nói đúng giao thức thật, điều khiển bằng file kịch bản và biến môi trường (đầu mỗi file ghi các lệnh). Test lấy đường dẫn qua `env!("CARGO_BIN_EXE_…")`.
- `tests/clients.rs`: hai client của Task 1 chạy với tiến trình phụ giả: báo thiết bị thật, lệch phiên bản, lỗi nạp model có loại, crash và thiếu DLL, kết quả mang sai id đoạn (P5 của review 02a), worker treo bị kill, stream với khóa lấy từ biến môi trường, chế độ CPU (`-ngl 0`, `extra_args`), server chết lúc khởi động, server hết bộ nhớ (lỗi mang đuôi log). Test `the_api_key_never_reaches_a_log` kiểm khóa không lộ ra `Debug`, log của app, `llama-server.log` (kể cả khi server in khóa ra stderr), đuôi log và log sự kiện; test bỏ qua `real_llama_server_requires_the_api_key` chạy `llama-server` b11146 thật: không có khóa thì 401, có thì 200 (#6 của review 02a).
- `postprocess.rs`: hậu xử lý trong lúc stream (nhãn, ngoặc kép, khoảng trắng, tỉ lệ token đếm theo gói SSE, xuống dòng kiểu lời giải thích, rỗng, bị cắt ở `max_tokens`).
- `translate.rs`: trait `Mt` (bản thật là `LlamaServer`, giám sát ở Task 3 bọc lại), `translate()` dựng prompt, tính `max_tokens`, stream qua hậu xử lý, thử lại một lần với repeat penalty 1,15.
- `config.rs`, `llama.rs`: chỉnh nhỏ cho hai phần trên.

**Files:**
- Tạo: `crates/pipeline/src/bin/fake_asr_worker.rs`
- Tạo: `crates/pipeline/src/bin/fake_llama_server.rs`
- Sửa: `crates/pipeline/src/config.rs`
- Sửa: `crates/pipeline/src/lib.rs`
- Sửa: `crates/pipeline/src/llama.rs`
- Tạo: `crates/pipeline/src/postprocess.rs`
- Tạo: `crates/pipeline/src/translate.rs`
- Test (tạo): `crates/pipeline/tests/clients.rs`

- [ ] **Step 1: Khai báo module**

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -3,6 +3,7 @@
 pub mod filter;
 pub mod llama;
 pub mod logfile;
+pub mod postprocess;
 pub mod process;
 pub mod prompt;
 pub mod prompt_history;
@@ -10,4 +11,5 @@
 pub mod sentence;
 pub mod sse;
 pub mod text;
+pub mod translate;
 pub mod vad;
```

- [ ] **Step 2: Viết test**

Tạo `crates/pipeline/src/postprocess.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Hậu xử lý bản dịch ngay trong lúc stream (spec §6.5, "Hậu xử lý"), để phụ đề hiện dần từng chữ mà không lộ nhãn hay
//! lời giải thích.
//!
//! - Cắt khoảng trắng ở hai đầu; chuỗi khoảng trắng ở giữa gộp thành một dấu cách.
//! - Giữ lại phần đầu cho tới khi chắc không phải nhãn ("Translation:", "译文："…); nhãn thì bỏ.
//! - Ngoặc kép mở ở đầu (khi câu gốc không mở bằng ngoặc kép) không được hiện trong lúc stream; lúc kết thúc, nếu ngoặc
//!   kép đó bao quanh cả bản dịch thì bỏ cả cặp, còn không (ngoặc đóng nằm giữa câu) thì trả nó lại vào bản cuối. Trên S7,
//!   5/1240 bản dịch mở bằng ngoặc kép, không bản nào là ngoặc bao quanh: cả 5 được giữ nguyên.
//! - Vi phạm thì dừng stream ngay: quá ngưỡng tỉ lệ token (đếm gói SSE, mỗi gói một token), xuống dòng rồi viết tiếp khi
//!   câu gốc không có xuống dòng (dấu hiệu lời giải thích; S7 không có bản dịch đúng nào như vậy), bị cắt ở `max_tokens`,
//!   hoặc rỗng.

#[cfg(test)]
mod tests {
    use super::*;

    /// Đưa các gói vào, trả (các phần đã hiện, kết quả cuối).
    fn run(source: &str, chunks: &[&str], max: Option<usize>) -> (Vec<String>, Result<String, Violation>) {
        let mut pp = PostProcessor::new(source, max);
        let mut shown = Vec::new();
        for c in chunks {
            match pp.push(c) {
                Step::Emit(d) => shown.push(d),
                Step::Hold => {}
                Step::Stop(v) => return (shown, Err(v)),
            }
        }
        let end = pp.finish(Some("stop"));
        (shown, end)
    }

    #[test]
    fn plain_translation_streams_word_by_word() {
        let (shown, end) = run("Good morning", &["\n", "Chào", " buổi", "  sáng", " "], None);
        assert_eq!(shown, ["Chào", " buổi", " sáng"]);
        assert_eq!(end.unwrap(), "Chào buổi sáng");
    }

    #[test]
    fn labels_are_held_back_and_removed() {
        let (shown, end) = run("Hello", &["Trans", "lation", ":", " Xin", " chào"], None);
        assert_eq!(shown, ["Xin", " chào"]);
        assert_eq!(end.unwrap(), "Xin chào");
        let (_, end) = run("你好", &["译文：", "Xin chào"], None);
        assert_eq!(end.unwrap(), "Xin chào");
        let (_, end) = run("Hi", &["BẢN DỊCH:", " Chào"], None);
        assert_eq!(end.unwrap(), "Chào");
    }

    #[test]
    fn a_word_that_only_looks_like_a_label_is_released() {
        let (shown, end) = run("La traduction est difficile", &["Translation", " is", " hard"], None);
        assert_eq!(shown, ["Translation is", " hard"]);
        assert_eq!(end.unwrap(), "Translation is hard");
    }

    #[test]
    fn surrounding_quotes_are_removed_when_the_source_has_none() {
        let (shown, end) = run("Let's go", &["“", "Đi", " thôi", "”"], None);
        assert_eq!(
            shown,
            ["Đi", " thôi"],
            "ngoặc mở không hiện, ngoặc đóng cuối được giữ lại"
        );
        assert_eq!(end.unwrap(), "Đi thôi");
        let (_, end) = run("Go", &["\"Đi.\""], None);
        assert_eq!(end.unwrap(), "Đi.");
    }

    #[test]
    fn quotes_that_do_not_surround_the_whole_text_are_kept() {
        // Như ja-vi-892 ở S7: ngoặc đóng nằm giữa câu.
        let chunks = ["“Cốc", " cốc.", " Có", " ai", " không?”", " Cô", " thì", " thầm."];
        let (shown, end) = run("コンコン。「誰かいますか？」彼女はささやいた。", &chunks, None);
        assert_eq!(shown.concat(), "Cốc cốc. Có ai không?” Cô thì thầm.");
        assert_eq!(
            end.unwrap(),
            "“Cốc cốc. Có ai không?” Cô thì thầm.",
            "bản cuối trả lại ngoặc mở"
        );
    }

    #[test]
    fn quotes_of_the_source_are_kept() {
        let (_, end) = run("\"Hello\"", &["\"", "Xin chào", "\""], None);
        assert_eq!(end.unwrap(), "\"Xin chào\"");
    }

    #[test]
    fn too_many_tokens_stop_the_stream() {
        let (shown, end) = run("Hi", &["a", " b", " c", " d"], Some(3));
        assert_eq!(shown, ["a", " b", " c"]);
        assert_eq!(end, Err(Violation::TooLong));
    }

    #[test]
    fn a_new_line_followed_by_more_text_is_an_explanation() {
        let (shown, end) = run("Hi", &["Chào", "\n", "\n", "(Giải", " thích)"], None);
        assert_eq!(shown, ["Chào"]);
        assert_eq!(end, Err(Violation::Explanation));
        // Xuống dòng ở cuối rồi hết: không phải lời giải thích.
        let (_, end) = run("Hi", &["Chào", "\n"], None);
        assert_eq!(end.unwrap(), "Chào");
        // Câu gốc có xuống dòng thì bản dịch được xuống dòng (gộp thành dấu cách khi hiện).
        let (_, end) = run("a\nb", &["x", "\n", "y"], None);
        assert_eq!(end.unwrap(), "x y");
    }

    #[test]
    fn truncated_or_empty_results_are_violations() {
        let mut pp = PostProcessor::new("Hi", None);
        assert_eq!(pp.push("Chào"), Step::Emit("Chào".into()));
        assert_eq!(pp.finish(Some("length")), Err(Violation::Truncated));
        let (_, end) = run("Hi", &["\n", " "], None);
        assert_eq!(end, Err(Violation::Empty));
        let (_, end) = run("Hi", &["Translation:"], None);
        assert_eq!(end, Err(Violation::Empty));
        // Stream kết thúc giữa một tiền tố của nhãn: vẫn là chữ.
        let (_, end) = run("Hi", &["Trans"], None);
        assert_eq!(end.unwrap(), "Trans");
    }
}
```

Tạo `crates/pipeline/src/translate.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Dịch một câu theo §6.5: dựng prompt, tính số token tối đa, stream qua hậu xử lý, thử lại một lần với repeat penalty
//! cao hơn khi bản dịch lỗi, rồi mới báo "chưa dịch được". App (luồng dịch của `engine`) và `latency-bench mt-eval` (A3,
//! Đ4 của kế hoạch 00) dùng đúng hàm này.

#[cfg(test)]
mod tests {
    use super::*;

    /// Server giả: mỗi request trả một danh sách gói định sẵn, và ghi lại tham số đã nhận.
    struct Scripted {
        replies: Vec<Result<(Vec<&'static str>, &'static str), MtError>>,
        requests: Vec<(String, u32, f64)>,
    }

    impl Mt for Scripted {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            req: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.requests
                .push((req.prompt.to_string(), req.max_tokens, req.repeat_penalty));
            let (chunks, finish) = self.replies.remove(0)?;
            let mut end = StreamEnd::default();
            for c in chunks {
                end.chunks += 1;
                end.text.push_str(c);
                if on_delta(c).is_break() {
                    end.cancelled = true;
                    return Ok(end);
                }
            }
            end.finish_reason = Some(finish.into());
            Ok(end)
        }
    }

    fn job(text: &str) -> Job<'_> {
        Job {
            text,
            src: Lang::En,
            tgt: Lang::Vi,
            context: None,
        }
    }

    fn run(mt: &mut Scripted, job: &Job) -> (Vec<String>, Outcome) {
        let mut events = Vec::new();
        let outcome = translate(mt, job, &MtConfig::default(), &mut |e| {
            events.push(match e {
                Event::Delta(d) => d.to_string(),
                Event::Retry => "<retry>".into(),
            });
            ControlFlow::Continue(())
        });
        (events, outcome)
    }

    #[test]
    fn a_good_translation_is_streamed_and_done() {
        let mut mt = Scripted {
            replies: vec![Ok((vec!["Chào", " buổi", " sáng"], "stop"))],
            requests: vec![],
        };
        let (events, outcome) = run(&mut mt, &job("Good morning"));
        assert_eq!(events, ["Chào", " buổi", " sáng"]);
        let Outcome::Done(t) = outcome else {
            panic!("{outcome:?}")
        };
        assert_eq!((t.text.as_str(), t.attempts, t.source_tokens), ("Chào buổi sáng", 1, 2));
        // Prompt của app và tham số sinh của §6.5: 2 token nguồn → max_tokens 40, repeat penalty 1,05.
        assert_eq!(
            mt.requests,
            [(translation_prompt("Good morning", Lang::En, Lang::Vi), 40, 1.05)]
        );
    }

    #[test]
    fn a_rambling_translation_is_cut_and_retried_with_a_higher_penalty() {
        // 10 token nguồn, Anh→Việt 4,4: tối đa 44 gói.
        let source = "one two three four five six seven eight nine ten";
        let long: Vec<&str> = std::iter::repeat_n(" x", 60).collect();
        let mut mt = Scripted {
            replies: vec![Ok((long, "stop")), Ok((vec!["một", " hai"], "stop"))],
            requests: vec![],
        };
        let (events, outcome) = run(&mut mt, &job(source));
        assert_eq!(events.iter().filter(|e| *e == "<retry>").count(), 1);
        assert_eq!(events.last().map(String::as_str), Some(" hai"));
        let Outcome::Done(t) = outcome else {
            panic!("{outcome:?}")
        };
        assert_eq!((t.text.as_str(), t.attempts), ("một hai", 2));
        let penalties: Vec<f64> = mt.requests.iter().map(|r| r.2).collect();
        assert_eq!(penalties, [1.05, 1.15]);
    }

    #[test]
    fn short_sources_are_not_held_to_the_ratio() {
        // 2 token nguồn (< 10): 60 gói vẫn được, chỉ chịu hạn mức sinh 40 token của server.
        let long: Vec<&str> = std::iter::repeat_n(" x", 30).collect();
        let mut mt = Scripted {
            replies: vec![Ok((long, "stop"))],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hi there"));
        assert!(
            matches!(outcome, Outcome::Done(ref t) if t.attempts == 1),
            "{outcome:?}"
        );
    }

    #[test]
    fn two_failures_give_failed_and_the_source_is_shown() {
        let mut mt = Scripted {
            replies: vec![
                Ok((vec!["Chào", "\n", "Giải thích"], "stop")),
                Ok((vec!["Chào", " bạn"], "length")),
            ],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hello"));
        match outcome {
            Outcome::Failed { reason, attempts, .. } => {
                assert_eq!(attempts, 2);
                assert_eq!(reason, "bị cắt ở max_tokens");
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_request_error_is_retried_once_and_unavailable_stops_at_once() {
        let mut mt = Scripted {
            replies: vec![Err(MtError::Failed("mất kết nối".into())), Ok((vec!["Chào"], "stop"))],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hello"));
        assert!(
            matches!(outcome, Outcome::Done(ref t) if t.attempts == 2),
            "{outcome:?}"
        );
        let mut mt = Scripted {
            replies: vec![Err(MtError::Unavailable("quá 5 lần".into()))],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hello"));
        assert_eq!(outcome, Outcome::Unavailable("quá 5 lần".into()));
    }

    #[test]
    fn the_caller_can_cancel() {
        let mut mt = Scripted {
            replies: vec![Ok((vec!["Chào", " buổi", " sáng"], "stop"))],
            requests: vec![],
        };
        let outcome = translate(&mut mt, &job("Good morning"), &MtConfig::default(), &mut |_| {
            ControlFlow::Break(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
    }

    #[test]
    fn context_uses_the_background_template() {
        let mut mt = Scripted {
            replies: vec![Ok((vec!["B"], "stop"))],
            requests: vec![],
        };
        let with_context = Job {
            context: Some("câu trước"),
            ..job("next")
        };
        run(&mut mt, &with_context);
        assert!(mt.requests[0].0.starts_with("[Background Information]\ncâu trước"));
    }
}
```

Tạo `crates/pipeline/tests/clients.rs`:

````rust
//! Client của hai tiến trình phụ (spec §6.4, §6.5), chạy với tiến trình phụ giả (`src/bin/fake_*.rs`): không cần model.

use asr_protocol::{Backend, DecodeMode, ErrorKind, TranscribeRequest};
use pipeline::asr_client::{AsrError, AsrLaunch, AsrWorker};
use pipeline::llama::{ChatRequest, LlamaLaunch, LlamaServer};
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};
use std::time::Duration;

/// Logger của binary test này: giữ mọi bản ghi `log`, để test kiểm rằng API key không lọt vào log của app.
struct Capture;

static CAPTURED: Mutex<Vec<String>> = Mutex::new(Vec::new());

impl log::Log for Capture {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }
    fn log(&self, record: &log::Record) {
        CAPTURED
            .lock()
            .unwrap()
            .push(format!("{} {}", record.target(), record.args()));
    }
    fn flush(&self) {}
}

fn capture_logs() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        log::set_logger(&Capture).unwrap();
        log::set_max_level(log::LevelFilter::Trace);
    });
}

const FAKE_ASR: &str = env!("CARGO_BIN_EXE_fake_asr_worker");
const FAKE_LLAMA: &str = env!("CARGO_BIN_EXE_fake_llama_server");

/// Thư mục tạm riêng của một test, xóa khi xong.
struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("pipeline-clients-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }

    fn plan(&self, name: &str, lines: &[&str]) -> PathBuf {
        let path = self.path(name);
        std::fs::write(&path, lines.join("\n")).unwrap();
        path
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn asr_launch(t: &Temp, plan: &[&str]) -> AsrLaunch {
    AsrLaunch {
        env: vec![
            ("FAKE_ASR_PLAN".into(), t.plan("asr-plan", plan).display().to_string()),
            ("FAKE_ASR_LOG".into(), t.path("asr-events").display().to_string()),
        ],
        request_timeout: Duration::from_millis(500),
        ..AsrLaunch::new(
            Path::new(FAKE_ASR),
            Path::new("/model.bin"),
            &t.path("logs/asr-worker.log"),
        )
    }
}

fn request(id: u64) -> TranscribeRequest {
    TranscribeRequest {
        segment_id: id,
        pcm: vec![0; 16_000],
        languages: vec!["en".into(), "vi".into()],
        prompt_tokens: vec![1, 2, 3],
        audio_ctx: 512,
        prev_lang: Some("vi".into()),
    }
}

#[test]
fn asr_worker_transcribes_and_reports_the_real_backend() {
    let t = Temp::new("asr-ok");
    let (mut worker, ready) = AsrWorker::spawn(&asr_launch(&t, &["backend:cpu"])).unwrap();
    assert_eq!((ready.backend, ready.decode_mode), (Backend::Cpu, DecodeMode::Shared));
    assert_eq!(worker.warmup().unwrap(), 1.0);
    let r = worker.transcribe(request(7)).unwrap();
    assert_eq!((r.segment_id, r.lang.as_str(), r.text.as_str()), (7, "en", "đoạn 7"));
    drop(worker);
    let events = std::fs::read_to_string(t.path("asr-events")).unwrap();
    assert_eq!(events, "start use_gpu=true\nwarmup\ntranscribe 7 prev=vi prompt=3\n");
}

#[test]
fn a_worker_of_another_protocol_version_is_refused() {
    let t = Temp::new("asr-version");
    let err = AsrWorker::spawn(&asr_launch(&t, &["version:1"]))
        .map(|_| ())
        .unwrap_err();
    assert!(err.is_crash() && err.to_string().contains("phiên bản 1"), "{err}");
}

#[test]
fn load_errors_keep_their_kind() {
    let t = Temp::new("asr-oom");
    let err = AsrWorker::spawn(&asr_launch(&t, &["load_error:OutOfMemory"]))
        .map(|_| ())
        .unwrap_err();
    assert_eq!(err.kind(), Some(ErrorKind::OutOfMemory));
}

#[test]
fn a_crash_or_a_missing_dll_is_a_crash_with_the_exit_status() {
    let t = Temp::new("asr-crash");
    let (mut worker, _) = AsrWorker::spawn(&asr_launch(&t, &["crash_on:1"])).unwrap();
    let err = worker.transcribe(request(1)).unwrap_err();
    assert!(err.is_crash(), "{err}");
    assert!(err.to_string().contains("exit status: 3"), "{err}");
    // Windows thiếu vulkan-1.dll: tiến trình thoát trước khi nói gì (STATUS_DLL_NOT_FOUND). Mã giả ở đây là 135.
    let err = AsrWorker::spawn(&asr_launch(&t, &["exit_at_start:135"]))
        .map(|_| ())
        .unwrap_err();
    assert!(err.is_crash(), "{err}");
}

/// Kết quả mang id của đoạn khác: luồng giao thức đã lệch, phải coi như worker hỏng.
#[test]
fn a_result_for_another_segment_is_a_crash() {
    let t = Temp::new("asr-wrong-id");
    let (mut worker, _) = AsrWorker::spawn(&asr_launch(&t, &["wrong_id_on:2"])).unwrap();
    assert_eq!(worker.transcribe(request(1)).unwrap().segment_id, 1);
    let err = worker.transcribe(request(2)).unwrap_err();
    assert!(err.is_crash(), "{err}");
    assert!(
        err.to_string().contains("kết quả đoạn 1002 khi đang chờ đoạn 2"),
        "{err}"
    );
}

#[test]
fn a_hung_worker_is_killed_after_the_timeout() {
    let t = Temp::new("asr-hang");
    let (mut worker, _) = AsrWorker::spawn(&asr_launch(&t, &["hang_on:1"])).unwrap();
    let started = std::time::Instant::now();
    let err = worker.transcribe(request(1)).unwrap_err();
    assert!(
        matches!(&err, AsrError::Crashed(m) if m.contains("không trả lời")),
        "{err}"
    );
    assert!(started.elapsed() < Duration::from_secs(5));
}

fn llama_launch(t: &Temp, plan: &[&str]) -> LlamaLaunch {
    LlamaLaunch {
        env: vec![
            (
                "FAKE_LLAMA_PLAN".into(),
                t.plan("llama-plan", plan).display().to_string(),
            ),
            ("FAKE_LLAMA_LOG".into(), t.path("llama-events").display().to_string()),
        ],
        ready_timeout: Duration::from_secs(10),
        ..LlamaLaunch::new(
            Path::new(FAKE_LLAMA),
            Path::new("/mt.gguf"),
            &t.path("logs/llama-server.log"),
        )
    }
}

#[test]
fn llama_server_streams_deltas_with_the_key_from_the_environment() {
    let t = Temp::new("llama-ok");
    let server = LlamaServer::spawn(&llama_launch(&t, &["ok"])).unwrap();
    assert!(server.healthy());
    assert_eq!(server.count_tokens("xin chào các bạn").unwrap(), 4);
    let mut deltas = Vec::new();
    let req = ChatRequest {
        prompt: "Translate the following text into Vietnamese.\n\nGood morning everyone",
        max_tokens: 64,
        repeat_penalty: 1.05,
    };
    let end = server
        .stream(&req, &mut |d| {
            deltas.push(d.to_string());
            ControlFlow::Continue(())
        })
        .unwrap();
    assert_eq!(deltas, ["VI:", " Good", " morning", " everyone"]);
    assert_eq!(end.text, "VI: Good morning everyone");
    assert_eq!(
        (end.finish_reason.as_deref(), end.completion_tokens, end.chunks),
        (Some("stop"), Some(4), 4)
    );
    drop(server);
    let events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert_eq!(events, "start ngl=auto extra=\nchat 1 repeat=1.05 max=64\n");
}

/// API key không lộ ra `Debug`, log của app, `llama-server.log` (kể cả khi server in key ra stderr) hay log sự kiện.
#[test]
fn the_api_key_never_reaches_a_log() {
    capture_logs();
    let t = Temp::new("llama-key");
    let mut launch = llama_launch(&t, &["leak_key"]);
    launch
        .env
        .push(("FAKE_LLAMA_KEY_FILE".into(), t.path("key").display().to_string()));
    let server = LlamaServer::spawn(&launch).unwrap();
    let key = std::fs::read_to_string(t.path("key")).unwrap();
    assert_eq!(key.len(), 32);
    server.translate("Translate.\n\nhello", 16).unwrap();
    let debug = format!("{server:?}");
    assert!(debug.contains("<ẩn>") && !debug.contains(&key), "{debug}");
    let tail = server.log_tail().join("\n");
    drop(server);
    let log = std::fs::read_to_string(t.path("logs/llama-server.log")).unwrap();
    assert!(log.contains("LLAMA_API_KEY=<ẩn>"), "server có in key, đã bị che: {log}");
    assert!(!log.contains(&key), "{log}");
    assert!(!tail.contains(&key), "{tail}");
    let events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert!(!events.contains(&key), "{events}");
    let captured = CAPTURED.lock().unwrap().join("\n");
    assert!(!captured.contains(&key), "{captured}");
}

/// Server không đủ bộ nhớ để nạp model: lỗi mang các dòng cuối của log, để giám sát nhận ra hết bộ nhớ.
#[test]
fn a_server_that_runs_out_of_memory_reports_the_log_tail() {
    let t = Temp::new("llama-oom");
    let err = LlamaServer::spawn(&llama_launch(&t, &["oom_at_start"])).unwrap_err();
    let msg = format!("{err:#}");
    assert!(msg.contains("thoát sớm") && msg.contains("out of memory"), "{msg}");
}

/// Với `llama-server` b11146 thật: request không có key bị từ chối (401), có key thì được (200). Cần binary và model:
///
/// ```text
/// MT_LLAMA_SERVER=$PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
/// MT_LLAMA_MODEL=$PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf \
/// cargo test -p pipeline --test clients real_llama_server -- --include-ignored
/// ```
#[test]
#[ignore = "cần llama-server b11146 và model"]
fn real_llama_server_requires_the_api_key() {
    let exe = PathBuf::from(std::env::var("MT_LLAMA_SERVER").expect("MT_LLAMA_SERVER"));
    let model = PathBuf::from(std::env::var("MT_LLAMA_MODEL").expect("MT_LLAMA_MODEL"));
    let t = Temp::new("llama-real");
    let launch = LlamaLaunch {
        ready_timeout: Duration::from_secs(180),
        ..LlamaLaunch::new(&exe, &model, &t.path("llama-server.log"))
    };
    let server = LlamaServer::spawn(&launch).unwrap();
    let http = reqwest::blocking::Client::builder().no_proxy().build().unwrap();
    let url = format!("{}/tokenize", server.base_url());
    let status = http
        .post(&url)
        .json(&serde_json::json!({ "content": "hi" }))
        .send()
        .unwrap()
        .status();
    assert_eq!(status.as_u16(), 401, "không có key");
    assert!(server.count_tokens("xin chào").unwrap() > 0, "có key: 200");
}

#[test]
fn cpu_mode_passes_ngl_0_and_extra_args() {
    let t = Temp::new("llama-cpu");
    let launch = LlamaLaunch {
        use_gpu: false,
        extra_args: vec!["--no-repack".into()],
        ..llama_launch(&t, &["ok"])
    };
    drop(LlamaServer::spawn(&launch).unwrap());
    let events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert_eq!(events.lines().next(), Some("start ngl=0 extra=--no-repack"));
}

#[test]
fn a_server_that_dies_at_start_is_reported() {
    let t = Temp::new("llama-dead");
    let err = LlamaServer::spawn(&llama_launch(&t, &["exit_at_start:1"])).unwrap_err();
    assert!(err.to_string().contains("thoát sớm"), "{err}");
}
````

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --lib`
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0425]: cannot find type `Violation` in this scope
error[E0425]: cannot find type `MtError` in this scope
error[E0405]: cannot find trait `Mt` in this scope
error[E0425]: cannot find type `ChatRequest` in this scope
error[E0425]: cannot find type `ControlFlow` in this scope
error[E0425]: cannot find type `StreamEnd` in this scope
```

Run: `cargo test -p pipeline --test clients`
Expected: biên dịch lỗi, vì chưa có hai binary giả (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error: environment variable `CARGO_BIN_EXE_fake_asr_worker` not defined at compile time
error: environment variable `CARGO_BIN_EXE_fake_llama_server` not defined at compile time
error[E0560]: struct `LlamaLaunch` has no field named `env`
error[E0609]: no field `env` on type `LlamaLaunch`
```

- [ ] **Step 4: Viết code**

Tạo `crates/pipeline/src/bin/fake_asr_worker.rs`:

```rust
//! `asr-worker` giả, chỉ dùng trong test của `pipeline` (kế hoạch 00, mục 6.3: tiến trình phụ giả). Nói đúng giao thức của
//! `asr-protocol`, không cần model hay GPU.
//!
//! Điều khiển bằng biến môi trường:
//! - `FAKE_ASR_PLAN`: file kịch bản. Mỗi lần tiến trình chạy lấy dòng đầu (rồi bỏ dòng đó khỏi file); hết dòng thì là `ok`.
//!   Một dòng gồm các lệnh cách nhau bằng dấu cách:
//!   - `ok`: chạy bình thường;
//!   - `exit_at_start:<mã>`: thoát ngay với mã này (như thiếu `vulkan-1.dll`);
//!   - `load_error:<ModelLoad|OutOfMemory|GpuInit>`: trả `Error` cho `Load`;
//!   - `version:<n>`: `Ready` báo phiên bản giao thức `n`;
//!   - `backend:<cpu|metal|vulkan>`: thiết bị báo trong `Ready` (mặc định metal nếu xin GPU, cpu nếu không);
//!   - `mode:split`: báo chế độ A;
//!   - `crash_on:<n>`: thoát với mã 3, không trả lời, khi nhận `Transcribe` thứ `n` của lần chạy này;
//!   - `hang_on:<n>`: treo khi nhận `Transcribe` thứ `n`;
//!   - `wrong_id_on:<n>`: kết quả của `Transcribe` thứ `n` mang id đoạn cộng 1000;
//!   - `slow_ms:<ms>`: chờ chừng này trước khi trả mỗi kết quả `Transcribe` (để test hàng đợi tất định).
//! - `FAKE_ASR_LOG`: file ghi nối tiếp các sự kiện (`start use_gpu=…`, `transcribe <id> prev=<ngôn ngữ> prompt=<số token>`).
//! - `FAKE_ASR_TEXTS`: file, mỗi dòng `<ngôn ngữ>\t<chữ>`; đoạn có id `i` trả dòng `i % số dòng`. Thêm `\t!nospeech` ở cuối
//!   dòng thì trả `no_speech_prob` 0,9 và `avg_logprob` −1,5. Không đặt thì trả `đoạn <id>` bằng ngôn ngữ đầu tiên được phép.

use asr_protocol::{
    Backend, DecodeMode, ErrorKind, PROTOCOL_VERSION, Request, Response, TranscribeResult, read_frame, write_frame,
};
use std::io::{BufReader, BufWriter, Write};

struct Plan {
    exit_at_start: Option<i32>,
    load_error: Option<ErrorKind>,
    version: u32,
    backend: Option<Backend>,
    mode: DecodeMode,
    crash_on: Option<u32>,
    hang_on: Option<u32>,
    wrong_id_on: Option<u32>,
    slow_ms: u64,
}

fn next_plan_line() -> String {
    let Some(path) = std::env::var_os("FAKE_ASR_PLAN") else {
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
    let mut plan = Plan {
        exit_at_start: None,
        load_error: None,
        version: PROTOCOL_VERSION,
        backend: None,
        mode: DecodeMode::Shared,
        crash_on: None,
        hang_on: None,
        wrong_id_on: None,
        slow_ms: 0,
    };
    for word in line.split_whitespace() {
        let (key, value) = word.split_once(':').unwrap_or((word, ""));
        match key {
            "ok" => {}
            "exit_at_start" => plan.exit_at_start = value.parse().ok(),
            "load_error" => {
                plan.load_error = Some(match value {
                    "OutOfMemory" => ErrorKind::OutOfMemory,
                    "GpuInit" => ErrorKind::GpuInit,
                    _ => ErrorKind::ModelLoad,
                })
            }
            "version" => plan.version = value.parse().expect("số phiên bản"),
            "backend" => {
                plan.backend = Some(match value {
                    "cpu" => Backend::Cpu,
                    "vulkan" => Backend::Vulkan,
                    _ => Backend::Metal,
                })
            }
            "mode" if value == "split" => plan.mode = DecodeMode::Split,
            "crash_on" => plan.crash_on = value.parse().ok(),
            "hang_on" => plan.hang_on = value.parse().ok(),
            "wrong_id_on" => plan.wrong_id_on = value.parse().ok(),
            "slow_ms" => plan.slow_ms = value.parse().expect("số ms"),
            other => panic!("lệnh kịch bản lạ: {other}"),
        }
    }
    plan
}

fn log(line: &str) {
    if let Some(path) = std::env::var_os("FAKE_ASR_LOG") {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("mở log giả");
        writeln!(f, "{line}").unwrap();
    }
}

fn texts() -> Vec<(String, String, bool)> {
    let Some(path) = std::env::var_os("FAKE_ASR_TEXTS") else {
        return Vec::new();
    };
    std::fs::read_to_string(path)
        .expect("đọc FAKE_ASR_TEXTS")
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| {
            let mut parts = l.split('\t');
            let lang = parts.next().unwrap_or("en").to_string();
            let text = parts.next().unwrap_or("").to_string();
            (lang, text, parts.next() == Some("!nospeech"))
        })
        .collect()
}

fn main() {
    let plan = parse(&next_plan_line());
    if let Some(code) = plan.exit_at_start {
        std::process::exit(code);
    }
    let texts = texts();
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = BufWriter::new(std::io::stdout().lock());
    let mut loaded = false;
    let mut transcribes = 0u32;
    while let Ok(Some(request)) = read_frame::<_, Request>(&mut input) {
        let response = match request {
            Request::Load { use_gpu, .. } => {
                log(&format!("start use_gpu={use_gpu}"));
                match plan.load_error {
                    Some(kind) => Response::Error {
                        segment_id: None,
                        kind,
                        message: format!("lỗi giả {kind:?}"),
                    },
                    None => {
                        loaded = true;
                        Response::Ready {
                            protocol_version: plan.version,
                            backend: plan
                                .backend
                                .unwrap_or(if use_gpu { Backend::Metal } else { Backend::Cpu }),
                            decode_mode: plan.mode,
                            whisper_version: "giả".into(),
                            system_info: String::new(),
                        }
                    }
                }
            }
            Request::Warmup => {
                log("warmup");
                Response::WarmupDone { millis: 1.0 }
            }
            Request::Transcribe(req) => {
                transcribes += 1;
                log(&format!(
                    "transcribe {} prev={} prompt={}",
                    req.segment_id,
                    req.prev_lang.as_deref().unwrap_or("-"),
                    req.prompt_tokens.len()
                ));
                if plan.crash_on == Some(transcribes) {
                    std::process::exit(3);
                }
                if plan.hang_on == Some(transcribes) {
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(60));
                    }
                }
                if plan.slow_ms > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(plan.slow_ms));
                }
                let reply_id = if plan.wrong_id_on == Some(transcribes) {
                    req.segment_id + 1000
                } else {
                    req.segment_id
                };
                if !loaded {
                    Response::Error {
                        segment_id: Some(req.segment_id),
                        kind: ErrorKind::NotLoaded,
                        message: "chưa nạp model".into(),
                    }
                } else {
                    let (lang, text, nospeech) = if texts.is_empty() {
                        (req.languages[0].clone(), format!("đoạn {}", req.segment_id), false)
                    } else {
                        texts[req.segment_id as usize % texts.len()].clone()
                    };
                    let tokens: Vec<i32> = (1..=text.split_whitespace().count() as i32).collect();
                    Response::Result(TranscribeResult {
                        segment_id: reply_id,
                        lang,
                        lang_prob: 1.0,
                        text,
                        tokens,
                        no_speech_prob: if nospeech { 0.9 } else { 0.0 },
                        lid_ms: 1.0,
                        asr_ms: 1.0,
                        avg_logprob: if nospeech { -1.5 } else { -0.2 },
                    })
                }
            }
            Request::Shutdown => break,
        };
        if write_frame(&mut output, &response).is_err() {
            break;
        }
    }
}
```

Tạo `crates/pipeline/src/bin/fake_llama_server.rs`:

```rust
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
//!   - `leak_key`: in tham số dòng lệnh và `LLAMA_API_KEY=<key>` ra stderr, như một bản server lỡ log khóa.
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
            respond(&stream, "200 OK", "application/json", r#"{"status":"ok"}"#);
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
                if plan.delay_ms == 0 && plan.stall_after.is_none() {
                    respond(&stream, "200 OK", "text/event-stream", &sse);
                } else {
                    stream_slowly(&stream, &sse, &plan);
                }
            }
            _ => respond(&stream, "404 Not Found", "text/plain", "không có"),
        }
    }
}
```

Sửa `crates/pipeline/src/config.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/config.rs
+++ b/crates/pipeline/src/config.rs
@@ -183,9 +183,9 @@
 #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
 #[serde(default)]
 pub struct MtConfig {
-    pub repeat_penalty: f32,
+    pub repeat_penalty: f64,
     /// Lần thử lại duy nhất dùng repeat penalty cao hơn: với temperature 0, giữ nguyên tham số thì ra y hệt lần trước.
-    pub retry_repeat_penalty: f32,
+    pub retry_repeat_penalty: f64,
     /// Số token tối đa = min(`max_tokens_per_source_token` × số token câu gốc + `max_tokens_extra`, `max_tokens_cap`).
     pub max_tokens_per_source_token: u32,
     pub max_tokens_extra: u32,
```

Sửa `crates/pipeline/src/llama.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/llama.rs
+++ b/crates/pipeline/src/llama.rs
@@ -39,6 +39,8 @@
     pub ready_timeout: Duration,
     /// Timeout của một request (cả stream).
     pub request_timeout: Duration,
+    /// Biến môi trường thêm cho server (test dùng để điều khiển server giả).
+    pub env: Vec<(String, String)>,
 }
 
 impl LlamaLaunch {
@@ -51,6 +53,7 @@
             extra_args: Vec::new(),
             ready_timeout: Duration::from_secs(180),
             request_timeout: Duration::from_secs(120),
+            env: Vec::new(),
         }
     }
 }
@@ -68,6 +71,7 @@
         .args(["-ngl", if launch.use_gpu { "auto" } else { "0" }])
         .arg("--no-ui")
         .args(&launch.extra_args)
+        .envs(launch.env.iter().map(|(k, v)| (k, v)))
         .env(API_KEY_ENV, api_key)
         .stdin(Stdio::null())
         .stdout(Stdio::null())
@@ -84,7 +88,7 @@
 pub struct ChatRequest<'a> {
     pub prompt: &'a str,
     pub max_tokens: u32,
-    pub repeat_penalty: f32,
+    pub repeat_penalty: f64,
 }
 
 /// Kết thúc một stream.
```

Thêm vào `crates/pipeline/src/postprocess.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
/// Nhãn đầu câu hay gặp, viết thường. So khớp không phân biệt hoa thường.
const LABELS: &[&str] = &[
    "translation:",
    "translated text:",
    "translated:",
    "bản dịch:",
    "dịch:",
    "译文：",
    "译文:",
    "翻译：",
    "翻译:",
    "翻訳：",
    "訳文：",
    "번역:",
    "번역：",
];

/// Cặp ngoặc kép mở và đóng.
const QUOTES: &[(char, char)] = &[
    ('"', '"'),
    ('“', '”'),
    ('«', '»'),
    ('「', '」'),
    ('『', '』'),
    ('‘', '’'),
    ('\'', '\''),
];

fn opening_quote(c: char) -> Option<(char, char)> {
    QUOTES.iter().copied().find(|&(open, _)| open == c)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Violation {
    /// Quá ngưỡng tỉ lệ token của cặp ngôn ngữ.
    TooLong,
    /// Xuống dòng rồi viết tiếp, khi câu gốc không có xuống dòng.
    Explanation,
    /// Chạm `max_tokens` (`finish_reason` là "length").
    Truncated,
    /// Không có chữ nào.
    Empty,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    /// Phần chữ mới được hiện (không rỗng).
    Emit(String),
    /// Chưa có gì để hiện.
    Hold,
    /// Dừng stream.
    Stop(Violation),
}

#[derive(Debug)]
pub struct PostProcessor {
    source_opens_with_quote: bool,
    source_has_newline: bool,
    raw: String,
    /// Đã qua phần đầu (nhãn, ngoặc mở): `body_start` là byte đầu của phần thân trong `raw`.
    body_start: Option<usize>,
    quote: Option<(char, char)>,
    emitted: String,
    chunks: usize,
    max_chunks: Option<usize>,
}

impl PostProcessor {
    /// `max_chunks`: số gói (token) tối đa trước khi coi là quá dài; `None` là không kiểm tỉ lệ.
    pub fn new(source: &str, max_chunks: Option<usize>) -> Self {
        let source = source.trim();
        Self {
            source_opens_with_quote: source.chars().next().and_then(opening_quote).is_some(),
            source_has_newline: source.contains('\n'),
            raw: String::new(),
            body_start: None,
            quote: None,
            emitted: String::new(),
            chunks: 0,
            max_chunks,
        }
    }

    /// Nhận một gói chữ của stream.
    pub fn push(&mut self, chunk: &str) -> Step {
        self.chunks += 1;
        if self.max_chunks.is_some_and(|max| self.chunks > max) {
            return Step::Stop(Violation::TooLong);
        }
        self.raw.push_str(chunk);
        if self.body_start.is_none() && !self.decide_head() {
            return Step::Hold;
        }
        match self.visible() {
            Err(v) => Step::Stop(v),
            // Phần hiện luôn nối dài phần đã hiện (chỉ phần đuôi được giữ lại); phòng hờ thì không hiện gì thêm.
            Ok(visible) if !visible.starts_with(&self.emitted) => Step::Hold,
            Ok(visible) => {
                let delta = visible[self.emitted.len()..].to_string();
                if delta.is_empty() {
                    Step::Hold
                } else {
                    self.emitted.push_str(&delta);
                    Step::Emit(delta)
                }
            }
        }
    }

    /// Kết thúc stream. Trả bản dịch cuối, có thể khác phần đã hiện ở chỗ ngoặc kép (xem đầu file).
    pub fn finish(&self, finish_reason: Option<&str>) -> Result<String, Violation> {
        if finish_reason == Some("length") {
            return Err(Violation::Truncated);
        }
        let Some(start) = self.body_start else {
            // Stream kết thúc khi còn đang giữ phần đầu: chỉ có khoảng trắng, nhãn, hay tiền tố của nhãn.
            let head = self.raw.trim();
            let lower = head.to_lowercase();
            return if head.is_empty() || LABELS.iter().any(|l| lower == *l) {
                Err(Violation::Empty)
            } else {
                Ok(collapse(head))
            };
        };
        let body = collapse(self.raw[start..].trim());
        let text = match self.quote {
            Some((open, close)) => match body.strip_suffix(close) {
                // Ngoặc bao quanh cả câu: bên trong không còn ngoặc đóng cùng loại.
                Some(inner) if !inner.contains(close) => inner.trim_end().to_string(),
                _ => format!("{open}{body}"),
            },
            None => body,
        };
        if text.is_empty() {
            Err(Violation::Empty)
        } else {
            Ok(text)
        }
    }

    /// Bỏ khoảng trắng đầu, nhãn và ngoặc mở. Trả `false` nếu còn phải chờ thêm chữ mới biết.
    fn decide_head(&mut self) -> bool {
        let lead = self.raw.len() - self.raw.trim_start().len();
        let mut start = lead;
        let head = &self.raw[start..];
        if head.is_empty() {
            return false;
        }
        let lower = head.to_lowercase();
        if let Some(label) = LABELS.iter().find(|l| lower.starts_with(**l)) {
            // `to_lowercase` có thể đổi độ dài byte với vài chữ; nhãn ở đây giữ nguyên độ dài khi viết thường.
            start += label.len();
            start += self.raw[start..].len() - self.raw[start..].trim_start().len();
        } else if LABELS.iter().any(|l| l.starts_with(&lower)) {
            return false;
        }
        let rest = &self.raw[start..];
        let Some(first) = rest.chars().next() else {
            return false;
        };
        if !self.source_opens_with_quote
            && let Some(pair) = opening_quote(first)
        {
            self.quote = Some(pair);
            start += first.len_utf8();
        }
        self.body_start = Some(start);
        true
    }

    /// Phần thân được phép hiện: khoảng trắng gộp, khoảng trắng cuối và ngoặc đóng cuối (khi đã giấu ngoặc mở) còn giữ lại.
    fn visible(&self) -> Result<String, Violation> {
        let body = &self.raw[self.body_start.expect("đã qua phần đầu")..];
        let body = body.trim_start();
        let trimmed = body.trim_end();
        if !self.source_has_newline && trimmed.contains('\n') {
            return Err(Violation::Explanation);
        }
        let mut text = collapse(trimmed);
        if let Some((_, close)) = self.quote
            && text.ends_with(close)
        {
            text.pop();
        }
        Ok(text)
    }
}

/// Gộp mọi chuỗi khoảng trắng thành một dấu cách.
fn collapse(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
```

Thêm vào `crates/pipeline/src/translate.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::config::MtConfig;
use crate::llama::{ChatRequest, LlamaServer, StreamEnd};
use crate::postprocess::{PostProcessor, Step, Violation};
use crate::prompt::{Lang, context_prompt, translation_prompt};
use std::ops::ControlFlow;
use std::time::Instant;

/// Lỗi phía server dịch.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum MtError {
    /// Server không dùng được nữa (đã khởi động lại quá giới hạn, §6.5): phụ đề chỉ hiện câu gốc.
    #[error("llama-server không dùng được: {0}")]
    Unavailable(String),
    /// Request này lỗi (mất kết nối, stream cụt…); bên giám sát đã lo khởi động lại nếu cần.
    #[error("request dịch lỗi: {0}")]
    Failed(String),
}

/// Server dịch. `LlamaServer` là bản thật; `supervisor` bọc nó để tự khởi động lại; test dùng bản giả.
pub trait Mt: Send {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError>;
    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError>;
}

impl Mt for LlamaServer {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        LlamaServer::count_tokens(self, text).map_err(|e| MtError::Failed(format!("{e:#}")))
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        LlamaServer::stream(self, req, on_delta).map_err(|e| MtError::Failed(format!("{e:#}")))
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Job<'a> {
    pub text: &'a str,
    pub src: Lang,
    pub tgt: Lang,
    /// Câu trước, khi bật cờ thử nghiệm `experimental.translationContext` (§6.5).
    pub context: Option<&'a str>,
}

/// Sự kiện trong lúc dịch, cho luồng phụ đề.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event<'a> {
    /// Phần chữ mới đã qua hậu xử lý.
    Delta(&'a str),
    /// Lần đầu lỗi, sắp thử lại: phần chữ đã hiện không còn đúng.
    Retry,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Translated {
    pub text: String,
    /// 1, hoặc 2 nếu phải thử lại.
    pub attempts: u8,
    pub source_tokens: usize,
    pub completion_tokens: Option<usize>,
    /// Từ lúc bắt đầu tới chữ đầu tiên được hiện, và tới lúc xong (cả hai lần thử nếu có).
    pub first_delta_ms: Option<f32>,
    pub total_ms: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    Done(Translated),
    /// Cả hai lần đều lỗi: hiện câu gốc, đánh dấu "chưa dịch được".
    Failed {
        reason: String,
        attempts: u8,
        source_tokens: usize,
        completion_tokens: Option<usize>,
    },
    /// Bên gọi dừng giữa chừng (câu đã được ghép thêm, sẽ dịch lại).
    Cancelled,
    Unavailable(String),
}

fn describe(v: Violation) -> &'static str {
    match v {
        Violation::TooLong => "quá ngưỡng tỉ lệ token",
        Violation::Explanation => "có lời giải thích",
        Violation::Truncated => "bị cắt ở max_tokens",
        Violation::Empty => "rỗng",
    }
}

pub fn translate(
    mt: &mut dyn Mt,
    job: &Job,
    cfg: &MtConfig,
    on_event: &mut dyn FnMut(Event) -> ControlFlow<()>,
) -> Outcome {
    let started = Instant::now();
    let prompt = match job.context {
        Some(context) => context_prompt(job.text, context, job.src, job.tgt),
        None => translation_prompt(job.text, job.src, job.tgt),
    };
    let source_tokens = match mt.count_tokens(job.text) {
        Ok(n) => n,
        Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
        Err(MtError::Failed(e)) => {
            return Outcome::Failed {
                reason: e,
                attempts: 0,
                source_tokens: 0,
                completion_tokens: None,
            };
        }
    };
    let max_tokens = cfg.max_tokens_for(source_tokens);
    // Cách 2 của Q4: chỉ áp tỉ lệ khi câu gốc đủ dài; câu ngắn hơn chỉ chịu hạn mức sinh.
    let max_chunks = cfg
        .ratio_for(job.src.code(), job.tgt.code())
        .filter(|_| source_tokens >= cfg.ratio_min_source_tokens)
        .map(|ratio| (ratio as f64 * source_tokens as f64).floor() as usize);
    let mut reason = String::new();
    let mut completion_tokens = None;
    let mut first_delta_ms = None;
    for (attempt, repeat_penalty) in [(1u8, cfg.repeat_penalty), (2, cfg.retry_repeat_penalty)] {
        if attempt == 2 {
            if on_event(Event::Retry).is_break() {
                return Outcome::Cancelled;
            }
            // Phần đã hiện ở lần đầu bị bỏ: "chữ đầu tiên" tính lại theo lần thử này.
            first_delta_ms = None;
        }
        let mut pp = PostProcessor::new(job.text, max_chunks);
        let mut violation = None;
        let mut cancelled = false;
        let req = ChatRequest {
            prompt: &prompt,
            max_tokens,
            repeat_penalty,
        };
        let result = mt.stream(&req, &mut |chunk| match pp.push(chunk) {
            Step::Emit(delta) => {
                first_delta_ms.get_or_insert_with(|| started.elapsed().as_secs_f32() * 1000.0);
                if on_event(Event::Delta(&delta)).is_break() {
                    cancelled = true;
                    ControlFlow::Break(())
                } else {
                    ControlFlow::Continue(())
                }
            }
            Step::Hold => ControlFlow::Continue(()),
            Step::Stop(v) => {
                violation = Some(v);
                ControlFlow::Break(())
            }
        });
        let end = match result {
            Ok(end) => end,
            Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
            Err(MtError::Failed(e)) => {
                reason = e;
                continue;
            }
        };
        if cancelled {
            return Outcome::Cancelled;
        }
        completion_tokens = end.completion_tokens.or(Some(end.chunks));
        let finished = match violation {
            Some(v) => Err(v),
            None => pp.finish(end.finish_reason.as_deref()),
        };
        match finished {
            Ok(text) => {
                return Outcome::Done(Translated {
                    text,
                    attempts: attempt,
                    source_tokens,
                    completion_tokens,
                    first_delta_ms,
                    total_ms: started.elapsed().as_secs_f32() * 1000.0,
                });
            }
            Err(v) => reason = describe(v).to_string(),
        }
    }
    Outcome::Failed {
        reason,
        attempts: 2,
        source_tokens,
        completion_tokens,
    }
}
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p pipeline`
Expected:

```text
test result: ok. 109 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 11 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 1.14s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src/lib.rs (target/debug/deps/pipeline-901454d330477dd2)
     Running unittests src/bin/fake_asr_worker.rs (target/debug/deps/fake_asr_worker-b11221de58f4122f)
     Running unittests src/bin/fake_llama_server.rs (target/debug/deps/fake_llama_server-d5d453cb8d0fce77)
     Running tests/clients.rs (target/debug/deps/clients-79f5008458d238c8)
     Running tests/shutdown.rs (target/debug/deps/shutdown-8294228bcb944e13)
     Running tests/vad_reference.rs (target/debug/deps/vad_reference-c2808b28efa7e0e7)
```

Run (cần `llama-server` b11146 và model của Giai đoạn 0):
```bash
MT_LLAMA_SERVER=$PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
MT_LLAMA_MODEL=$PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf \
  cargo test -p pipeline --test clients real_llama_server -- --include-ignored
```
Expected:

```text
test real_llama_server_requires_the_api_key ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 11 filtered out; finished in 1.05s
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p pipeline -p latency-bench --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 7: Commit**

```bash
git add crates/pipeline/src/bin/fake_asr_worker.rs \
  crates/pipeline/src/bin/fake_llama_server.rs \
  crates/pipeline/src/config.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/llama.rs \
  crates/pipeline/src/postprocess.rs \
  crates/pipeline/src/translate.rs \
  crates/pipeline/tests/clients.rs
git commit -m "feat(pipeline): dịch một câu theo §6.5, hậu xử lý khi stream, tiến trình phụ giả" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: Giám sát hai tiến trình phụ

`supervisor.rs` (Đ2; dòng 78–81, 101, 106, 108, 113, 119, 134–136, 227, 234–237; QĐ7, QĐ17):
- `RestartTracker`: luật thuần cho một tiến trình phụ (chờ 1, 2, 5 giây; bỏ cuộc khi quá 5 lần trong 10 phút; chuyển CPU sau 2 lần lỗi liên tiếp khi dùng GPU).
- `SidecarManager`:
  - chạy `asr-worker` (`Load` rồi `Warmup`) rồi mới chạy `llama-server`; đọc `Ready.backend` và `decode_mode` (bản phát hành chỉ nhận chế độ B, `require_shared`); khởi động lại và gửi lại đoạn; `llama-server` chạy `-ngl 0` khi không có GPU hay khi `asr-worker` đã sang CPU;
  - trước mỗi lần chạy hỏi app `SidecarEvents::before_spawn` (kiểm SHA-256) và `is_first_run`; bỏ cuộc có lý do `GiveUpCause`; `allow_retry` (người dùng bấm Bắt đầu) cho lần khởi động kế tiếp quên việc bỏ cuộc và bắt đầu lại từ quyết định ban đầu về GPU (Q4-2 của review 02 lần 4), tách khỏi `begin_session` (chỉ đếm phiên; R3-1 của review 02 lần 3);
  - lần đầu chạy quá giờ không tính là lỗi; `llama-server` hết bộ nhớ lúc khởi động thì phát `OutOfMemory`; `asr-worker` báo `OutOfMemory` lúc chép lời thì phát `OutOfMemory` và tính là một lần lỗi trên GPU (Q1 của review 02 lần 2);
  - `shutdown` cho lúc app thoát: không chờ khóa, ngắt lần chờ (`Wake`), kill tiến trình đang chạy qua `process::Killer`; tiến trình vừa chạy mà app đã bắt đầu thoát thì kill ngay; `stop` bỏ `Killer` cùng khóa với slot; `running()` không khóa;
  - phát `SidecarEvent` để app hiện trạng thái; tắt khi rảnh 10 phút (`tick`).
- `asr_client.rs`, `llama.rs`: `spawn_with` đưa `Killer` ra ngay khi tiến trình chạy (trước khi chờ `Ready` hay `/health`); `AsrError::TimedOut` và `llama::NotReady` tách "quá thời gian chờ" khỏi "chết", cho luật lần đầu chạy. Hai tiến trình phụ giả thêm lệnh `error_on` (kèm loại lỗi, ví dụ `error_on:1:OutOfMemory`), `load_delay_ms` và `health_delay_ms`.
- `SupervisedAsr` và `SupervisedMt`: bọc hai client thành trait `Asr` và `Mt` cho engine (02b, Task 2).
- `Clock`: `SystemClock` cho app (chờ ngắt được), `FakeClock` cho test.
- `tests/lifecycle.rs` (dòng 296): đúng thứ tự, crash và khởi động lại, gửi lại đoạn, worker báo lỗi mà vẫn sống thì không khởi động lại (S8), model hỏng trên CPU thì bỏ cuộc (S12), chuyển CPU, `llama-server` theo sang CPU, không có GPU thì cả hai chạy CPU (kể cả khi dịch trước lúc `asr-worker` chạy lần nào; khi đó `running()` vẫn đúng và tắt khi rảnh vẫn tắt được), bỏ cuộc rồi chỉ thử lại sau `allow_retry` (cả `asr-worker` lẫn `llama-server`; `Tampered` thì SHA-256 được kiểm lại; model nạp lỗi rồi thử lại thì cả hai chạy lại bằng GPU; cờ thử lại chỉ dùng một lần; trên máy không có GPU thì thử lại vẫn bằng CPU; đã chuyển CPU mà chưa bỏ cuộc thì giữ CPU), `llama-server` giữ CPU của riêng nó qua các lần chạy lại, còn CPU do đi theo `asr-worker` thì về GPU khi `asr-worker` về GPU (Q5-1 của review 02 lần 5), lần đầu chạy (kể cả quá giờ không tính lỗi, và binary CPU mới), kiểm binary trước mọi lần chạy, binary bị sửa thì không chạy, app thoát lúc worker treo hay đang nạp model trả về ngay, request tới muộn sau khi thoát không chạy lại gì (không có cả sự kiện `Starting`), khóa API không lọt vào sự kiện, tắt sau 10 phút; hết bộ nhớ lúc chép lời (lần đầu khởi động lại trên GPU, lần thứ hai liên tiếp mới chuyển CPU: Q-1 của review 02 lần 3) và lúc `llama-server` khởi động; `shutdown` ngắt lần chờ trước khi khởi động lại của cả hai tiến trình phụ và lần chờ sau lần đầu chạy quá giờ (Q-3); `running()` trả về ngay dù một luồng đang giữ khóa trong lúc nạp model (Q3 của review 02 lần 2). Tiến trình phụ là bản giả; đồng hồ là đồng hồ giả, trừ test ngắt lần chờ (đồng hồ thật, backoff 60 giây, test kết thúc ngay khi `shutdown`).

**Files:**
- Sửa: `crates/pipeline/src/asr_client.rs`
- Sửa: `crates/pipeline/src/bin/fake_asr_worker.rs`
- Sửa: `crates/pipeline/src/bin/fake_llama_server.rs`
- Sửa: `crates/pipeline/src/lib.rs`
- Sửa: `crates/pipeline/src/llama.rs`
- Sửa: `crates/pipeline/src/process.rs`
- Tạo: `crates/pipeline/src/supervisor.rs`
- Test (sửa): `crates/pipeline/tests/clients.rs`
- Test (tạo): `crates/pipeline/tests/lifecycle.rs`

- [ ] **Step 1: Khai báo module**

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -10,6 +10,7 @@
 pub mod segmenter;
 pub mod sentence;
 pub mod sse;
+pub mod supervisor;
 pub mod text;
 pub mod translate;
 pub mod vad;
```

- [ ] **Step 2: Viết test**

Tạo `crates/pipeline/src/supervisor.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Vòng đời và giám sát hai tiến trình phụ (spec §5, §6.4, §6.5, §9; Đ2 của kế hoạch 00).
//!
//! - Thứ tự: `asr-worker` chạy trước (`Load` rồi `Warmup`); `llama-server` chạy sau khi `asr-worker` đã nạp model, để
//!   `--fit` thấy đúng VRAM còn trống.
//! - Lỗi (crash, treo quá thời gian, không khởi động được): khởi động lại, chờ 1, 2, 5 giây giữa các lần. Quá 5 lần trong
//!   10 phút thì bỏ cuộc: `asr-worker` thì dừng dịch và báo lỗi; `llama-server` thì phụ đề chỉ hiện câu gốc.
//! - `asr-worker`: đoạn đang xử lý được gửi lại một lần; lỗi nữa thì đoạn đó bị bỏ (`dropped`). Worker trả `Error` cho
//!   một đoạn mà vẫn sống thì không khởi động lại, đoạn đó bị bỏ.
//! - Chuyển sang CPU: crash 2 lần liên tiếp khi đang dùng GPU; hoặc bản GPU không khởi động được, hay lỗi lúc nạp model
//!   (Windows: `asr-worker-vulkan` thiếu `vulkan-1.dll`); hoặc worker báo thiết bị thật là CPU (`Ready.backend`). Đã
//!   chuyển thì giữ CPU tới khi app tắt. `asr-worker` chạy bằng CPU (kể cả khi không dò thấy GPU dùng được) thì
//!   `llama-server` cũng chạy bằng CPU (`-ngl 0`) từ lần khởi động kế tiếp của nó (§9, "GPU khởi tạo lỗi").
//! - Lần đầu chạy một binary mới: chờ `Ready` hay `/health` lâu hơn (`first_run_ready_timeout_ms`, từ 30 giây). Quá thời
//!   gian chờ đó không bị tính là một lần lỗi và không chuyển sang CPU (§6.5): chạy lại với thời gian chờ thường.
//! - Trước mỗi lần chạy một tiến trình phụ (kể cả khởi động lại bên trong giám sát), app kiểm binary qua
//!   [`SidecarEvents::before_spawn`] (SHA-256, §10.2, QĐ17). Kiểm lỗi thì bỏ cuộc ngay, không thử lại.
//! - Không có phiên dịch nào trong 10 phút thì tắt cả hai (`tick`).
//! - App thoát ([`SidecarManager::shutdown`]): không chờ khóa nào. Cờ `closing` làm mọi lần khởi động sau đó trả lỗi
//!   ngay, lần chờ giữa hai lần khởi động bị ngắt, và tiến trình phụ đang chạy (cả khi đang nạp model hay đang treo giữa
//!   request) bị kill qua [`process::Killer`]. Luồng đang dùng tiến trình phụ đó nhận lỗi và tự trả khóa.
//!
//! Mọi thời gian chờ đi qua `Clock`, nên test chạy với đồng hồ giả, không chờ thật.

#[cfg(test)]
mod tests {
    use super::*;

    fn tracker() -> RestartTracker {
        RestartTracker::new(SupervisorConfig::default())
    }

    fn restart(after_ms: u64, use_gpu: bool) -> Decision {
        Decision::Restart { after_ms, use_gpu }
    }

    #[test]
    fn backoff_is_1_2_5_seconds_then_5() {
        let mut t = tracker();
        let got: Vec<Decision> = (0..5).map(|i| t.on_failure(i * 10_000, false, false)).collect();
        assert_eq!(
            got,
            [
                restart(1_000, false),
                restart(2_000, false),
                restart(5_000, false),
                restart(5_000, false),
                restart(5_000, false)
            ]
        );
    }

    #[test]
    fn more_than_5_failures_in_10_minutes_gives_up() {
        let mut t = tracker();
        for i in 0..5 {
            assert_ne!(t.on_failure(i * 60_000, false, false), Decision::GiveUp);
        }
        assert_eq!(t.on_failure(5 * 60_000, false, false), Decision::GiveUp);
    }

    #[test]
    fn failures_older_than_the_window_do_not_count() {
        let mut t = tracker();
        for i in 0..5 {
            t.on_failure(i * 1_000, false, false);
        }
        // Lỗi thứ 6 tới 10 phút sau lỗi đầu: lỗi đầu đã ra khỏi cửa sổ, còn 5 lần.
        assert_eq!(t.on_failure(600_000, false, false), restart(5_000, false));
    }

    #[test]
    fn two_gpu_crashes_in_a_row_switch_to_cpu() {
        let mut t = tracker();
        assert_eq!(t.on_failure(0, true, false), restart(1_000, true));
        assert_eq!(t.on_failure(10_000, true, false), restart(2_000, false));
        // Có một yêu cầu thành công ở giữa thì không còn "liên tiếp".
        let mut t = tracker();
        t.on_failure(0, true, false);
        t.on_success();
        assert_eq!(t.on_failure(10_000, true, false), restart(2_000, true));
    }

    #[test]
    fn a_gpu_failure_while_starting_switches_to_cpu_at_once() {
        let mut t = tracker();
        assert_eq!(t.on_failure(0, true, true), restart(1_000, false));
    }

    #[test]
    fn fake_clock_sleeps_without_waiting() {
        let clock = FakeClock::default();
        let started = Instant::now();
        clock.sleep(Duration::from_secs(600), &Wake::default());
        assert_eq!((clock.now_ms(), clock.sleeps()), (600_000, vec![600_000]));
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    /// Đồng hồ thật: lần chờ giữa hai lần khởi động bị ngắt ngay khi app thoát, và mọi lần chờ sau đó trả về ngay.
    #[test]
    fn a_real_backoff_is_cut_short_by_wake() {
        let wake = Arc::new(Wake::default());
        let clock = SystemClock::default();
        let waker = {
            let wake = wake.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(50));
                wake.wake();
            })
        };
        let started = Instant::now();
        clock.sleep(Duration::from_secs(30), &wake);
        assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
        waker.join().unwrap();
        assert!(wake.is_woken());
        let started = Instant::now();
        clock.sleep(Duration::from_secs(30), &wake);
        assert!(started.elapsed() < Duration::from_secs(1), "đã ngắt thì không chờ nữa");
    }

    #[test]
    fn out_of_memory_is_recognised_in_llama_logs() {
        assert!(looks_out_of_memory(
            "llama-server thoát sớm (exit status: 1); stderr cuối: llama_model_load: error loading model: unable to \
             allocate Metal buffer: out of memory"
        ));
        assert!(looks_out_of_memory("ggml_vulkan: ErrorOutOfDeviceMemory"));
        assert!(!looks_out_of_memory("llama-server thoát sớm (exit status: 1)"));
    }
}
```

Sửa `crates/pipeline/tests/clients.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/tests/clients.rs
+++ b/crates/pipeline/tests/clients.rs
@@ -157,7 +157,7 @@
     let started = std::time::Instant::now();
     let err = worker.transcribe(request(1)).unwrap_err();
     assert!(
-        matches!(&err, AsrError::Crashed(m) if m.contains("không trả lời")),
+        matches!(&err, AsrError::TimedOut(m) if m.contains("không trả lời sau")),
         "{err}"
     );
     assert!(started.elapsed() < Duration::from_secs(5));
```

Tạo `crates/pipeline/tests/lifecycle.rs`:

```rust
//! Vòng đời hai tiến trình phụ (spec §11, "Test tích hợp"): khởi động đúng thứ tự, crash, tự khởi động lại, gửi lại đoạn
//! đang xử lý, chuyển sang CPU sau 2 lần crash khi dùng GPU, bỏ cuộc sau hơn 5 lần lỗi trong 10 phút, tắt sau 10 phút
//! không dịch, kiểm binary trước mỗi lần chạy, và app thoát không phải chờ tiến trình phụ. Tiến trình phụ là bản giả
//! (`src/bin/fake_*.rs`); mọi thời gian chờ của giám sát đi qua `FakeClock`, không chờ thật. Vài test về thời gian chờ
//! của chính tiến trình phụ (lần đầu chạy, app thoát giữa lúc nạp model) chờ thật dưới 1 giây.

use asr_protocol::TranscribeRequest;
use pipeline::config::{AsrConfig, MtConfig, SupervisorConfig};
use pipeline::prompt::Lang;
use pipeline::supervisor::{
    AsrFailure, AsrSpec, Clock, FakeClock, GiveUpCause, LlamaSpec, SidecarEvent, SidecarEvents, SidecarManager,
    SidecarSpec, Which,
};
use pipeline::translate::{Job, Outcome, translate};
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const FAKE_ASR: &str = env!("CARGO_BIN_EXE_fake_asr_worker");
const FAKE_LLAMA: &str = env!("CARGO_BIN_EXE_fake_llama_server");

struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("pipeline-lifecycle-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }

    fn read(&self, name: &str) -> String {
        std::fs::read_to_string(self.path(name)).unwrap_or_default()
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[derive(Default)]
struct Recorder {
    events: Mutex<Vec<SidecarEvent>>,
    /// Các lần app được hỏi trước khi chạy một binary.
    checked: Mutex<Vec<(Which, PathBuf)>>,
    /// Binary của bên này không qua bước kiểm (như sai SHA-256).
    reject: Mutex<Option<Which>>,
    /// Các binary chưa từng chạy tới `Ready` (lần đầu chạy).
    new_binaries: Mutex<Vec<PathBuf>>,
    /// Các lần giám sát hỏi `is_first_run`.
    asked: Mutex<Vec<PathBuf>>,
}

impl SidecarEvents for Recorder {
    fn on_event(&self, e: &SidecarEvent) {
        self.events.lock().unwrap().push(e.clone());
    }

    fn before_spawn(&self, which: Which, exe: &Path) -> Result<(), String> {
        self.checked.lock().unwrap().push((which, exe.to_path_buf()));
        match *self.reject.lock().unwrap() {
            Some(w) if w == which => Err(format!("{} có SHA-256 khác bảng của app", exe.display())),
            _ => Ok(()),
        }
    }

    fn is_first_run(&self, _which: Which, exe: &Path) -> bool {
        self.asked.lock().unwrap().push(exe.to_path_buf());
        self.new_binaries.lock().unwrap().iter().any(|p| p == exe)
    }
}

impl Recorder {
    fn events(&self) -> Vec<SidecarEvent> {
        self.events.lock().unwrap().clone()
    }

    fn checked(&self) -> Vec<Which> {
        self.checked.lock().unwrap().iter().map(|(w, _)| *w).collect()
    }

    /// Tên ngắn của từng sự kiện, theo thứ tự.
    fn names(&self) -> Vec<String> {
        self.events()
            .iter()
            .map(|e| match e {
                SidecarEvent::Starting { which, .. } => format!("start {which:?}"),
                SidecarEvent::Ready { which, use_gpu, .. } => format!("ready {which:?} gpu={use_gpu}"),
                SidecarEvent::Restarting { which, after_ms, .. } => format!("restart {which:?} {after_ms}"),
                SidecarEvent::CpuFallback { which } => format!("cpu {which:?}"),
                SidecarEvent::OutOfMemory { which } => format!("oom {which:?}"),
                SidecarEvent::GaveUp { which, cause, .. } => format!("gave-up {which:?} {cause:?}"),
                SidecarEvent::Stopped { which, idle } => format!("stopped {which:?} idle={idle}"),
            })
            .collect()
    }
}

struct Setup {
    t: Temp,
    clock: Arc<FakeClock>,
    events: Arc<Recorder>,
    manager: Arc<SidecarManager>,
}

/// `gpu`: có bản GPU (như macOS, hoặc Windows khi `--probe` thấy GPU dùng được).
fn setup(name: &str, gpu: bool, asr_plan: &[&str], llama_plan: &[&str]) -> Setup {
    setup_with(name, gpu, asr_plan, llama_plan, false)
}

/// `first_run`: lần đầu chạy hai binary này (sau khi cài hoặc cập nhật).
fn setup_with(name: &str, gpu: bool, asr_plan: &[&str], llama_plan: &[&str], first_run: bool) -> Setup {
    setup_spec(name, gpu, asr_plan, llama_plan, |spec| {
        spec.asr.first_run = first_run;
        spec.llama.first_run = first_run;
    })
}

/// Như `setup`, rồi `edit` sửa cấu hình trước khi dựng `SidecarManager`.
fn setup_spec(
    name: &str,
    gpu: bool,
    asr_plan: &[&str],
    llama_plan: &[&str],
    edit: impl FnOnce(&mut SidecarSpec),
) -> Setup {
    setup_clock(name, gpu, asr_plan, llama_plan, edit, None)
}

/// Như `setup_spec`; `clock` thay `FakeClock` (vài test cần lần chờ thật, ngắt được bằng `Wake`).
fn setup_clock(
    name: &str,
    gpu: bool,
    asr_plan: &[&str],
    llama_plan: &[&str],
    edit: impl FnOnce(&mut SidecarSpec),
    clock: Option<Arc<dyn Clock>>,
) -> Setup {
    let t = Temp::new(name);
    std::fs::write(t.path("asr-plan"), asr_plan.join("\n")).unwrap();
    std::fs::write(t.path("llama-plan"), llama_plan.join("\n")).unwrap();
    let asr_env = vec![
        ("FAKE_ASR_PLAN".into(), t.path("asr-plan").display().to_string()),
        ("FAKE_ASR_LOG".into(), t.path("asr-events").display().to_string()),
    ];
    let llama_env = vec![
        ("FAKE_LLAMA_PLAN".into(), t.path("llama-plan").display().to_string()),
        ("FAKE_LLAMA_LOG".into(), t.path("llama-events").display().to_string()),
    ];
    let mut spec = SidecarSpec {
        asr: AsrSpec {
            exe_gpu: gpu.then(|| PathBuf::from(FAKE_ASR)),
            exe_cpu: PathBuf::from(FAKE_ASR),
            model: PathBuf::from("/models/asr.bin"),
            log: t.path("logs/asr-worker.log"),
            first_run: false,
            require_shared: true,
            env: asr_env,
        },
        llama: LlamaSpec {
            exe: PathBuf::from(FAKE_LLAMA),
            model: PathBuf::from("/models/mt.gguf"),
            log: t.path("logs/llama-server.log"),
            extra_args: Vec::new(),
            first_run: false,
            env: llama_env,
        },
        supervisor: SupervisorConfig {
            ready_timeout_ms: 10_000,
            first_run_ready_timeout_ms: 30_000,
            shutdown_grace_ms: 1_000,
            ..SupervisorConfig::default()
        },
        asr_config: AsrConfig {
            timeout_ms: 10_000,
            ..AsrConfig::default()
        },
        mt_config: MtConfig::default(),
    };
    edit(&mut spec);
    let fake = Arc::new(FakeClock::default());
    let events = Arc::new(Recorder::default());
    let manager = SidecarManager::new(spec, clock.unwrap_or_else(|| fake.clone()), events.clone());
    let clock = fake;
    Setup {
        t,
        clock,
        events,
        manager,
    }
}

fn request(id: u64) -> TranscribeRequest {
    TranscribeRequest {
        segment_id: id,
        pcm: vec![0; 16_000],
        languages: vec!["en".into()],
        prompt_tokens: Vec::new(),
        audio_ctx: 512,
        prev_lang: Some("en".into()),
    }
}

#[test]
fn asr_worker_starts_first_and_llama_server_after_it_is_ready() {
    let s = setup("order", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    assert_eq!(
        s.events.names(),
        ["start Asr", "ready Asr gpu=true", "start Llama", "ready Llama gpu=true"]
    );
    // Worker đã nạp model và làm nóng trước khi server dịch chạy.
    assert_eq!(s.t.read("asr-events"), "start use_gpu=true\nwarmup\n");
    assert_eq!(s.t.read("llama-events"), "start ngl=auto extra=\n");
    assert!(s.clock.sleeps().is_empty());
}

#[test]
fn the_first_run_of_new_binaries_is_reported_once() {
    let s = setup_with("first-run", true, &["crash_on:1", "ok"], &[], true);
    s.manager.ensure_started().unwrap();
    let firsts: Vec<(String, bool)> = s
        .events
        .events()
        .iter()
        .filter_map(|e| match e {
            SidecarEvent::Starting { which, first_run } => Some((format!("start {which:?}"), *first_run)),
            SidecarEvent::Ready { which, first_run, .. } => Some((format!("ready {which:?}"), *first_run)),
            _ => None,
        })
        .collect();
    let expect = |n: &str, f: bool| (n.to_string(), f);
    assert_eq!(
        firsts,
        [
            expect("start Asr", true),
            expect("ready Asr", true),
            expect("start Llama", true),
            expect("ready Llama", true)
        ]
    );
    // Khởi động lại sau đó không còn là lần đầu: chờ `Ready` theo thời gian thường.
    s.manager.transcribe(request(1)).unwrap();
    assert!(s.events.events().iter().any(|e| matches!(
        e,
        SidecarEvent::Starting {
            which: Which::Asr,
            first_run: false
        }
    )));
}

#[test]
fn a_crash_restarts_the_worker_after_1_second_and_resends_the_segment() {
    let s = setup("resend", true, &["crash_on:1", "ok"], &[]);
    let r = s.manager.transcribe(request(5)).unwrap();
    assert_eq!(r.segment_id, 5);
    assert_eq!(s.clock.sleeps(), [1_000]);
    let transcribes = s.t.read("asr-events").matches("transcribe 5 ").count();
    assert_eq!(transcribes, 2, "đoạn đang xử lý được gửi lại đúng một lần");
    assert!(s.events.names().contains(&"restart Asr 1000".to_string()));
}

#[test]
fn a_segment_that_fails_again_is_dropped_and_the_next_one_works() {
    let s = setup("drop", false, &["crash_on:1", "crash_on:1", "ok"], &[]);
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(matches!(err, AsrFailure::Dropped(_)), "{err:?}");
    assert_eq!(s.clock.sleeps(), [1_000, 2_000]);
    assert_eq!(s.manager.transcribe(request(2)).unwrap().segment_id, 2);
}

#[test]
fn two_crashes_in_a_row_on_the_gpu_switch_to_the_cpu() {
    let s = setup("cpu", true, &["crash_on:1", "crash_on:1", "ok"], &[]);
    assert!(s.manager.transcribe(request(1)).is_err());
    assert!(s.events.names().contains(&"cpu Asr".to_string()));
    s.manager.transcribe(request(2)).unwrap();
    let starts: Vec<&str> =
        s.t.read("asr-events")
            .leak()
            .lines()
            .filter(|l| l.starts_with("start"))
            .collect();
    assert_eq!(
        starts,
        ["start use_gpu=true", "start use_gpu=true", "start use_gpu=false"]
    );
}

#[test]
fn a_gpu_worker_that_cannot_start_falls_back_to_the_cpu_at_once() {
    // Windows: asr-worker-vulkan thoát ngay vì thiếu vulkan-1.dll (mã giả 135).
    let s = setup("no-vulkan", true, &["exit_at_start:135", "ok"], &[]);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    assert_eq!(names[..4], ["start Asr", "cpu Asr", "restart Asr 1000", "start Asr"]);
    assert_eq!(names[4], "ready Asr gpu=false");
    assert_eq!(s.t.read("asr-events").lines().next(), Some("start use_gpu=false"));
}

#[test]
fn a_worker_whose_real_device_is_the_cpu_switches_to_cpu_mode() {
    let s = setup("real-cpu", true, &["backend:cpu"], &[]);
    s.manager.ensure_started().unwrap();
    assert!(s.events.names().contains(&"cpu Asr".to_string()));
    assert_eq!(s.manager.asr_backend(), Some(asr_protocol::Backend::Cpu));
}

#[test]
fn out_of_memory_is_reported_and_the_gpu_is_dropped() {
    let s = setup("oom", true, &["load_error:OutOfMemory", "ok"], &[]);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    assert_eq!(names[1..3], ["oom Asr", "cpu Asr"]);
}

#[test]
fn a_worker_without_mode_b_is_refused() {
    let s = setup("split", false, &["mode:split"], &[]);
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Asr, GiveUpCause::NoSharedMode));
    assert!(s.events.names().contains(&"gave-up Asr NoSharedMode".to_string()));
}

#[test]
fn more_than_5_failures_in_10_minutes_stop_the_translation() {
    let plan = ["crash_on:1"; 7];
    let s = setup("give-up", false, &plan, &[]);
    assert!(matches!(s.manager.transcribe(request(1)), Err(AsrFailure::Dropped(_))));
    assert!(matches!(s.manager.transcribe(request(2)), Err(AsrFailure::Dropped(_))));
    let err = s.manager.transcribe(request(3)).unwrap_err();
    assert!(matches!(err, AsrFailure::Unavailable(_)), "{err:?}");
    assert_eq!(s.clock.sleeps(), [1_000, 2_000, 5_000, 5_000, 5_000]);
    // Đã bỏ cuộc thì không chạy lại nữa, cho tới khi người dùng bấm Bắt đầu (`allow_retry`), kể cả khi nguyên nhân đã
    // được sửa; một phiên bắt đầu (`begin_session`) không phải là thử lại (R3-1 của review 02 lần 3).
    assert!(matches!(
        s.manager.transcribe(request(4)),
        Err(AsrFailure::Unavailable(_))
    ));
    std::fs::write(s.t.path("asr-plan"), "ok").unwrap();
    s.manager.begin_session();
    assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Failures);
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    assert!(s.manager.transcribe(request(5)).is_ok());
}

#[test]
fn both_sidecars_stop_after_10_minutes_without_translating() {
    let s = setup("idle", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    s.clock.advance(Duration::from_secs(9 * 60 + 59));
    assert!(!s.manager.tick());
    assert!(s.manager.running());
    s.clock.advance(Duration::from_secs(1));
    assert!(s.manager.tick());
    assert!(!s.manager.running());
    let names = s.events.names();
    assert_eq!(
        names[names.len() - 2..],
        ["stopped Llama idle=true", "stopped Asr idle=true"]
    );
}

#[test]
fn a_running_session_keeps_the_sidecars() {
    let s = setup("session", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    s.manager.begin_session();
    s.clock.advance(Duration::from_secs(30 * 60));
    assert!(!s.manager.tick(), "đang dịch thì không tắt");
    s.manager.end_session();
    s.clock.advance(Duration::from_secs(10 * 60));
    assert!(s.manager.tick(), "10 phút sau khi dừng phiên thì tắt");
}

fn translate_hello(s: &Setup) -> Outcome {
    let job = Job {
        text: "Hello there",
        src: Lang::En,
        tgt: Lang::Vi,
        context: None,
    };
    let mut mt = s.manager.mt();
    translate(&mut mt, &job, &MtConfig::default(), &mut |_| ControlFlow::Continue(()))
}

#[test]
fn a_llama_server_crash_restarts_it_and_the_translation_is_retried() {
    let s = setup("llama-crash", true, &[], &["crash_on:1", "ok"]);
    s.manager.ensure_started().unwrap();
    match translate_hello(&s) {
        Outcome::Done(t) => assert_eq!((t.text.as_str(), t.attempts), ("VI: Hello there", 2)),
        other => panic!("{other:?}"),
    }
    assert_eq!(s.clock.sleeps(), [1_000]);
}

#[test]
fn after_more_than_5_server_failures_only_the_source_is_shown() {
    // Lần 1: server chết giữa request dịch. Năm lần sau: server thoát ngay khi chạy. Lỗi thứ 6 trong 10 phút: bỏ cuộc.
    let mut plan = vec!["crash_on:1"];
    plan.extend(["exit_at_start:1"; 5]);
    let s = setup("llama-give-up", true, &[], &plan);
    let outcome = translate_hello(&s);
    assert!(matches!(outcome, Outcome::Unavailable(_)), "{outcome:?}");
    assert_eq!(s.clock.sleeps(), [1_000, 2_000, 5_000, 5_000, 5_000]);
    assert!(s.events.names().contains(&"gave-up Llama Failures".to_string()));
}

/// S8 của review: worker trả `Error` cho một đoạn mà vẫn sống thì chỉ bỏ đoạn đó, không khởi động lại, không gửi lại.
#[test]
fn a_worker_error_for_one_segment_drops_it_without_a_restart() {
    let s = setup("worker-error", true, &["error_on:1"], &[]);
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(
        matches!(&err, AsrFailure::Dropped(m) if m.contains("lỗi giả khi chép lời")),
        "{err:?}"
    );
    assert_eq!(s.manager.transcribe(request(2)).unwrap().segment_id, 2);
    let log = s.t.read("asr-events");
    assert_eq!(log.matches("start ").count(), 1, "{log}");
    assert_eq!(log.matches("transcribe 1 ").count(), 1, "không gửi lại: {log}");
    assert!(s.clock.sleeps().is_empty());
    assert!(!s.events.names().iter().any(|n| n.starts_with("restart")));
}

/// Q1 của review 02 lần 2: worker báo `OutOfMemory` lúc chép lời (thường là hết bộ nhớ GPU). Không bỏ đoạn như lỗi
/// thường: báo app (§9: đề xuất gói Nhẹ), tính là một lần lỗi trên GPU, khởi động lại rồi gửi lại đoạn; hai lần liên tiếp
/// thì chuyển CPU.
#[test]
fn out_of_memory_while_transcribing_counts_as_a_gpu_failure() {
    let s = setup(
        "oom-transcribe",
        true,
        &["error_on:1:OutOfMemory", "error_on:1:OutOfMemory", "ok"],
        &[],
    );
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(
        matches!(&err, AsrFailure::Dropped(m) if m.contains("gửi lại")),
        "{err:?}"
    );
    assert_eq!(s.manager.transcribe(request(2)).unwrap().segment_id, 2);
    // Lần hết bộ nhớ đầu chỉ khởi động lại trên GPU; lần thứ hai liên tiếp mới chuyển CPU (§9; Q-1 của review 02 lần 3).
    let names = s.events.names();
    assert_eq!(
        names,
        [
            "start Asr",
            "ready Asr gpu=true",
            "oom Asr",
            "restart Asr 1000",
            "start Asr",
            "ready Asr gpu=true",
            "oom Asr",
            "cpu Asr",
            "restart Asr 2000",
            "start Asr",
            "ready Asr gpu=false",
        ]
    );
    let log = s.t.read("asr-events");
    assert_eq!(log.matches("transcribe 1 ").count(), 2, "gửi lại một lần: {log}");
}

/// O1 của review 02 lần 2: `llama-server` hết bộ nhớ lúc nạp model (dòng lỗi của ggml ở stderr): báo app, rồi chạy lại.
#[test]
fn llama_server_out_of_memory_at_start_is_reported() {
    let s = setup("oom-llama", true, &["ok"], &["oom_at_start", "ok"]);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    let oom = names
        .iter()
        .position(|n| n == "oom Llama")
        .expect("có sự kiện hết bộ nhớ");
    assert!(names[oom + 1].starts_with("restart Llama"), "{names:?}");
    assert_eq!(names.last().unwrap(), "ready Llama gpu=true", "{names:?}");
}

/// S12 của review: model không nạp được khi đã chạy bằng CPU là model hỏng: bỏ cuộc ngay, không thử lại.
#[test]
fn a_model_that_does_not_load_on_the_cpu_gives_up_at_once() {
    let s = setup("model-cpu", false, &["load_error:ModelLoad", "ok"], &[]);
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Asr, GiveUpCause::ModelLoad));
    assert_eq!(s.events.names(), ["start Asr", "gave-up Asr ModelLoad"]);
    assert!(s.clock.sleeps().is_empty());
    // Bản GPU nạp lỗi thì thử bằng CPU một lần trước, rồi mới bỏ cuộc.
    let s = setup(
        "model-gpu",
        true,
        &["load_error:ModelLoad", "load_error:ModelLoad"],
        &[],
    );
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!(err.cause, GiveUpCause::ModelLoad);
    assert_eq!(
        s.events.names(),
        [
            "start Asr",
            "cpu Asr",
            "restart Asr 1000",
            "start Asr",
            "gave-up Asr ModelLoad"
        ]
    );
}

/// Không dò thấy GPU dùng được (Windows, `--probe`): `llama-server` cũng chạy bằng CPU.
#[test]
fn without_a_gpu_both_sidecars_run_on_the_cpu() {
    let s = setup("no-gpu", false, &[], &[]);
    s.manager.ensure_started().unwrap();
    assert_eq!(s.t.read("asr-events").lines().next(), Some("start use_gpu=false"));
    assert_eq!(s.t.read("llama-events"), "start ngl=0 extra=\n");
    assert!(s.events.names().contains(&"ready Llama gpu=false".to_string()));
    // Dịch trước khi `asr-worker` chạy lần nào (chỉ `llama-server` được khởi động): vẫn bằng CPU. Chỉ một tiến trình
    // chạy thì `running()` vẫn là `true`, và tắt khi rảnh vẫn tắt được nó (N6 của review 02 lần 3).
    let s = setup("no-gpu-mt-first", false, &[], &[]);
    assert!(matches!(translate_hello(&s), Outcome::Done(_)));
    assert_eq!(s.t.read("asr-events"), "");
    assert_eq!(s.t.read("llama-events").lines().next(), Some("start ngl=0 extra="));
    assert!(s.manager.running());
    s.clock.advance(Duration::from_secs(10 * 60));
    assert!(s.manager.tick());
    assert!(!s.manager.running());
}

/// `asr-worker` chuyển sang CPU vì GPU lỗi: `llama-server` chạy sau đó cũng bằng CPU (§9).
#[test]
fn llama_server_follows_the_worker_to_the_cpu() {
    let s = setup("follow-cpu", true, &["exit_at_start:135", "ok"], &[]);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    assert_eq!(
        names[names.len() - 3..],
        ["cpu Llama", "start Llama", "ready Llama gpu=false"]
    );
    assert_eq!(s.t.read("llama-events"), "start ngl=0 extra=\n");
}

/// App kiểm binary (SHA-256) trước mọi lần chạy, kể cả lần khởi động lại bên trong giám sát (QĐ17).
#[test]
fn every_start_is_checked_first() {
    let s = setup("checked", true, &["crash_on:1", "ok"], &["crash_on:1", "ok"]);
    s.manager.ensure_started().unwrap();
    s.manager.transcribe(request(1)).unwrap();
    assert!(matches!(translate_hello(&s), Outcome::Done(_)));
    assert_eq!(s.events.checked(), [Which::Asr, Which::Llama, Which::Asr, Which::Llama]);
}

/// Binary không qua bước kiểm thì không bao giờ được chạy: bỏ cuộc ngay với `Tampered`.
#[test]
fn a_binary_that_fails_the_check_is_never_started() {
    let s = setup("tampered", true, &["crash_on:1", "ok"], &[]);
    s.manager.ensure_started().unwrap();
    *s.events.reject.lock().unwrap() = Some(Which::Asr);
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(
        matches!(&err, AsrFailure::Unavailable(m) if m.contains("SHA-256")),
        "{err:?}"
    );
    assert_eq!(
        s.t.read("asr-events").matches("start ").count(),
        1,
        "không chạy lại binary bị sửa"
    );
    assert!(s.events.names().contains(&"gave-up Asr Tampered".to_string()));
    let s = setup("tampered-llama", true, &[], &[]);
    *s.events.reject.lock().unwrap() = Some(Which::Llama);
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Llama, GiveUpCause::Tampered));
    assert_eq!(s.t.read("llama-events"), "");
}

/// Lần đầu chạy, quá thời gian chờ dài không bị tính là một lần lỗi và không chuyển sang CPU (§6.5).
#[test]
fn a_slow_first_start_is_not_counted_as_a_failure() {
    let s = setup_spec(
        "first-slow",
        true,
        &["load_delay_ms:3000", "ok"],
        &["health_delay_ms:3000", "ok"],
        |spec| {
            spec.asr.first_run = true;
            spec.llama.first_run = true;
            spec.supervisor.first_run_ready_timeout_ms = 300;
        },
    );
    s.manager.ensure_started().unwrap();
    let restarts: Vec<(Which, usize)> = s
        .events
        .events()
        .iter()
        .filter_map(|e| match e {
            SidecarEvent::Restarting { which, failures, .. } => Some((*which, *failures)),
            _ => None,
        })
        .collect();
    assert_eq!(restarts, [(Which::Asr, 0), (Which::Llama, 0)]);
    let names = s.events.names();
    assert!(!names.iter().any(|n| n.starts_with("cpu")), "{names:?}");
    assert!(names.contains(&"ready Asr gpu=true".to_string()));
    assert_eq!(
        s.t.read("llama-events"),
        "start ngl=auto extra=\nstart ngl=auto extra=\n"
    );
}

/// Sau khi app thoát, một request tới muộn không chạy lại tiến trình phụ nào.
#[test]
fn after_shutdown_a_late_request_starts_nothing() {
    let s = setup("late", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    s.manager.stop(false);
    assert!(!s.manager.running());
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(matches!(err, AsrFailure::Unavailable(_)), "{err:?}");
    assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Closing);
    assert!(matches!(translate_hello(&s), Outcome::Unavailable(_)));
    assert_eq!(s.t.read("asr-events").matches("start ").count(), 1);
    assert_eq!(s.t.read("llama-events").matches("start ").count(), 1);
    // Không có lần khởi động nào sau khi thoát, kể cả lần bị kill ngay sau khi chạy (tiến trình giả có thể chưa kịp ghi
    // gì): giám sát báo `Starting` trước mỗi lần chạy.
    let names = s.events.names();
    assert_eq!(names.iter().filter(|n| n.starts_with("start ")).count(), 2, "{names:?}");
}

/// Chờ tới khi file sự kiện của tiến trình phụ giả có `needle`, tối đa 10 giây.
fn wait_for(s: &Setup, file: &str, needle: &str) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !s.t.read(file).contains(needle) {
        assert!(Instant::now() < deadline, "không thấy {needle:?} trong {file}");
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// App thoát khi worker đang treo giữa một đoạn: không phải chờ hết thời gian chờ của request.
#[test]
fn shutdown_does_not_wait_for_a_hung_request() {
    let s = setup_spec("hung", true, &["hang_on:1"], &[], |spec| {
        spec.asr_config.timeout_ms = 120_000;
    });
    s.manager.ensure_started().unwrap();
    let manager = s.manager.clone();
    let busy = std::thread::spawn(move || manager.transcribe(request(1)));
    wait_for(&s, "asr-events", "transcribe 1 ");
    let started = Instant::now();
    s.manager.stop(false);
    let result = busy.join().unwrap();
    assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
    assert!(matches!(result, Err(AsrFailure::Unavailable(_))), "{result:?}");
    assert!(!s.manager.running());
}

/// App thoát khi worker đang nạp model (lần đầu mở app, `prewarm`): trả về ngay, không chờ `Ready`.
#[test]
fn shutdown_does_not_wait_for_a_model_that_is_loading() {
    let s = setup_spec("loading", true, &["load_delay_ms:60000"], &[], |spec| {
        spec.supervisor.ready_timeout_ms = 120_000;
    });
    let manager = s.manager.clone();
    let starting = std::thread::spawn(move || manager.ensure_started());
    wait_for(&s, "asr-events", "start use_gpu=true");
    let started = Instant::now();
    s.manager.shutdown();
    let result = starting.join().unwrap();
    assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
    assert_eq!(result.unwrap_err().cause, GiveUpCause::Closing);
    assert!(!s.manager.running());
    assert_eq!(
        s.t.read("llama-events"),
        "",
        "không chạy llama-server sau khi app thoát"
    );
}

/// Key của `llama-server` không lọt vào sự kiện của giám sát, kể cả khi server in key ra stderr rồi chết.
#[test]
fn the_api_key_never_reaches_sidecar_events() {
    let s = setup_spec("key-events", true, &[], &["leak_key crash_on:1", "leak_key"], |spec| {
        // Thư mục tạm của test là thư mục cha của `logs/`.
        let key_file = spec.llama.log.parent().unwrap().with_file_name("key");
        spec.llama
            .env
            .push(("FAKE_LLAMA_KEY_FILE".into(), key_file.display().to_string()));
    });
    s.manager.ensure_started().unwrap();
    assert!(matches!(translate_hello(&s), Outcome::Done(_)));
    let key = s.t.read("key");
    assert_eq!(key.len(), 32);
    let events = format!("{:?}", s.events.events());
    assert!(events.contains("restart") || events.contains("Restarting"), "{events}");
    assert!(!events.contains(&key), "{events}");
    let log = s.t.read("logs/llama-server.log");
    assert!(log.contains("LLAMA_API_KEY=<ẩn>") && !log.contains(&key), "{log}");
}

/// Windows: `asr-worker-cpu` chỉ chạy sau khi chuyển sang CPU. Nếu nó là binary mới (vừa cài), lần chạy đó cũng được chờ
/// như lần đầu, và giám sát hỏi app đúng một lần cho mỗi binary.
#[test]
fn a_new_cpu_binary_gets_its_own_first_run() {
    let s = setup_spec("cpu-first-run", true, &["exit_at_start:135", "ok"], &[], |spec| {
        // Hai binary khác nhau như trên Windows; bản CPU là một bản sao của worker giả.
        let cpu = spec.asr.log.parent().unwrap().with_file_name("asr-worker-cpu");
        std::fs::copy(FAKE_ASR, &cpu).unwrap();
        spec.asr.exe_cpu = cpu;
    });
    let cpu = s.t.path("asr-worker-cpu");
    s.events.new_binaries.lock().unwrap().push(cpu.clone());
    s.manager.ensure_started().unwrap();
    let starts: Vec<bool> = s
        .events
        .events()
        .iter()
        .filter_map(|e| match e {
            SidecarEvent::Starting {
                which: Which::Asr,
                first_run,
            } => Some(*first_run),
            _ => None,
        })
        .collect();
    assert_eq!(starts, [false, true], "bản GPU đã từng chạy, bản CPU thì chưa");
    let asked = s.events.asked.lock().unwrap().clone();
    assert_eq!(asked, [PathBuf::from(FAKE_ASR), cpu, PathBuf::from(FAKE_LLAMA)]);
}

/// Q3 của review 02 lần 2: app thoát giữa lần chờ trước khi khởi động lại (backoff 60 giây, đồng hồ thật): `shutdown`
/// ngắt lần chờ, `ensure_started` trả lỗi ngay, không chạy thêm tiến trình nào.
#[test]
fn shutdown_interrupts_the_backoff_before_a_restart() {
    let s = setup_clock(
        "wake",
        false,
        &["exit_at_start:1", "ok"],
        &[],
        |spec| spec.supervisor.backoff_ms = vec![60_000],
        Some(Arc::new(pipeline::supervisor::SystemClock::default())),
    );
    let manager = s.manager.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || tx.send(manager.ensure_started()).unwrap());
    let started = Instant::now();
    while !s.events.names().iter().any(|n| n.starts_with("restart Asr")) {
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "không thấy lần chờ: {:?}",
            s.events.names()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    s.manager.shutdown();
    let err = rx
        .recv_timeout(Duration::from_secs(5))
        .expect("shutdown ngắt được lần chờ")
        .unwrap_err();
    assert_eq!(err.cause, GiveUpCause::Closing);
    assert_eq!(s.t.read("asr-plan"), "ok", "không chạy lại worker sau khi app thoát");
}

/// Q3 của review 02 lần 2: `running()` không chờ khóa của tiến trình phụ, kể cả khi một luồng đang giữ khóa đó suốt lúc
/// nạp model (ở đây 5 giây).
#[test]
fn running_does_not_wait_for_a_model_that_is_loading() {
    let s = setup("running", false, &["load_delay_ms:5000"], &[]);
    let manager = s.manager.clone();
    std::thread::spawn(move || {
        let _ = manager.ensure_started();
    });
    let started = Instant::now();
    while !s.events.names().iter().any(|n| n == "start Asr") {
        assert!(started.elapsed() < Duration::from_secs(10));
        std::thread::sleep(Duration::from_millis(10));
    }
    let manager = s.manager.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || tx.send(manager.running()).unwrap());
    let running = rx.recv_timeout(Duration::from_secs(2)).expect("running() trả về ngay");
    assert!(!running, "chưa có tiến trình nào tới Ready");
    s.manager.shutdown();
}

/// Q-3 của review 02 lần 3: như `shutdown_interrupts_the_backoff_before_a_restart`, với `llama-server`.
#[test]
fn shutdown_interrupts_the_backoff_of_llama_server() {
    let s = setup_clock(
        "wake-llama",
        false,
        &["ok"],
        &["exit_at_start:1", "ok"],
        |spec| spec.supervisor.backoff_ms = vec![60_000],
        Some(Arc::new(pipeline::supervisor::SystemClock::default())),
    );
    let manager = s.manager.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || tx.send(manager.ensure_started()).unwrap());
    let started = Instant::now();
    while !s.events.names().iter().any(|n| n.starts_with("restart Llama")) {
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "không thấy lần chờ: {:?}",
            s.events.names()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    s.manager.shutdown();
    let err = rx
        .recv_timeout(Duration::from_secs(5))
        .expect("shutdown ngắt được lần chờ")
        .unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Llama, GiveUpCause::Closing));
    assert_eq!(
        s.t.read("llama-plan"),
        "ok",
        "không chạy lại llama-server sau khi app thoát"
    );
}

/// Lần đầu chạy quá giờ cũng chờ trước khi chạy lại; app thoát lúc đó thì trả về ngay (C6 của review 02 lần 3).
#[test]
fn shutdown_interrupts_the_wait_after_a_slow_first_start() {
    let s = setup_clock(
        "wake-first",
        false,
        &["load_delay_ms:3000", "ok"],
        &[],
        |spec| {
            spec.asr.first_run = true;
            spec.supervisor.first_run_ready_timeout_ms = 300;
            spec.supervisor.backoff_ms = vec![60_000];
        },
        Some(Arc::new(pipeline::supervisor::SystemClock::default())),
    );
    let manager = s.manager.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || tx.send(manager.ensure_started()).unwrap());
    let started = Instant::now();
    while !s.events.names().iter().any(|n| n.starts_with("restart Asr")) {
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "không thấy lần chờ: {:?}",
            s.events.names()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    s.manager.shutdown();
    let err = rx
        .recv_timeout(Duration::from_secs(5))
        .expect("shutdown ngắt được lần chờ")
        .unwrap_err();
    assert_eq!(err.cause, GiveUpCause::Closing);
}

/// Q4-2 của review 02 lần 4: bản GPU nạp model lỗi thì chuyển CPU, rồi `ModelLoad` trên CPU thì bỏ cuộc (model hỏng).
/// Người dùng tải lại model rồi bấm Bắt đầu (`allow_retry`): cả hai tiến trình phụ chạy lại từ đầu bằng GPU, không giữ CPU
/// của lần bỏ cuộc.
#[test]
fn a_retry_after_giving_up_starts_again_on_the_gpu() {
    let s = setup(
        "retry-gpu",
        true,
        &["load_error:ModelLoad", "load_error:ModelLoad", "ok"],
        &[],
    );
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Asr, GiveUpCause::ModelLoad));
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    let after = names.iter().position(|n| n == "gave-up Asr ModelLoad").unwrap() + 1;
    assert_eq!(
        names[after..],
        ["start Asr", "ready Asr gpu=true", "start Llama", "ready Llama gpu=true"]
    );
    assert_eq!(s.t.read("llama-events").lines().next(), Some("start ngl=auto extra="));
    // Máy không có GPU dùng được (GP4, GP5 của review 02 lần 5): thử lại vẫn bằng CPU, và không báo chuyển CPU.
    let s = setup("retry-no-gpu", false, &["load_error:ModelLoad", "ok"], &[]);
    assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::ModelLoad);
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    let asr = s.t.read("asr-events");
    let starts: Vec<&str> = asr.lines().filter(|l| l.starts_with("start")).collect();
    assert_eq!(starts, ["start use_gpu=false", "start use_gpu=false"]);
    assert_eq!(s.t.read("llama-events"), "start ngl=0 extra=\n");
    assert!(
        !s.events.names().iter().any(|n| n.starts_with("cpu ")),
        "{:?}",
        s.events.names()
    );
}

/// Q4-1 của review 02 lần 4: `llama-server` bỏ cuộc (hơn 5 lần lỗi), rồi người dùng bấm Bắt đầu: chạy lại được, và từ
/// quyết định ban đầu (GPU), dù trước đó đã sang `-ngl 0` vì lỗi liên tiếp.
#[test]
fn llama_server_is_retried_after_giving_up() {
    let s = setup("retry-llama", true, &["ok"], &["exit_at_start:1"; 6]);
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!((err.which, err.cause), (Which::Llama, GiveUpCause::Failures));
    assert!(s.events.names().contains(&"cpu Llama".to_string()));
    std::fs::write(s.t.path("llama-plan"), "ok").unwrap();
    s.manager.begin_session();
    assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Failures);
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    assert_eq!(s.events.names().last().unwrap(), "ready Llama gpu=true");
    assert_eq!(s.t.read("llama-events").lines().last(), Some("start ngl=auto extra="));
}

/// Q4-1 của review 02 lần 4: binary bị sửa thì bỏ cuộc (`Tampered`); cài lại rồi bấm Bắt đầu thì SHA-256 được kiểm lại
/// (`before_spawn`) và tiến trình phụ chạy.
#[test]
fn a_tampered_sidecar_is_checked_again_on_retry() {
    for which in [Which::Asr, Which::Llama] {
        let s = setup(&format!("retry-tampered-{which:?}"), true, &[], &[]);
        *s.events.reject.lock().unwrap() = Some(which);
        let err = s.manager.ensure_started().unwrap_err();
        assert_eq!((err.which, err.cause), (which, GiveUpCause::Tampered));
        let checked = s.events.checked().len();
        assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Tampered);
        assert_eq!(s.events.checked().len(), checked, "chưa bấm thử lại thì không kiểm lại");
        // Bấm thử lại mà binary vẫn bị sửa: kiểm lại đúng một lần, rồi lại bỏ cuộc; cờ thử lại chỉ dùng một lần, không
        // thành vòng lặp (RL1, RL2 của review 02 lần 5).
        s.manager.allow_retry();
        assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Tampered);
        assert_eq!(s.events.checked().len(), checked + 1);
        assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Tampered);
        assert_eq!(s.events.checked().len(), checked + 1);
        *s.events.reject.lock().unwrap() = None;
        s.manager.allow_retry();
        s.manager.ensure_started().unwrap();
        assert_eq!(s.events.checked().len(), checked + 2 + usize::from(which == Which::Asr));
    }
}

/// Q5-1 của review 02 lần 5, kịch bản 1: `llama-server` tự lỗi 2 lần liên tiếp trên GPU thì giữ CPU của riêng nó, kể cả
/// khi `asr-worker` chạy lại bằng GPU; mỗi lần nó tới `Ready` đều báo `gpu=false`, để app giữ chỉ báo CPU.
#[test]
fn llama_server_keeps_its_own_cpu_fallback_across_restarts() {
    let s = setup(
        "llama-own-cpu",
        true,
        &["ok", "ok"],
        &["exit_at_start:1", "exit_at_start:1", "ok", "ok"],
    );
    s.manager.ensure_started().unwrap();
    s.manager.stop(true);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    let restart = names.iter().position(|n| n == "stopped Asr idle=true").unwrap() + 1;
    assert_eq!(
        names[restart..],
        [
            "start Asr",
            "ready Asr gpu=true",
            "start Llama",
            "ready Llama gpu=false"
        ]
    );
    assert_eq!(
        s.t.read("llama-events")
            .lines()
            .filter_map(|l| l.split_whitespace().nth(1))
            .collect::<Vec<_>>(),
        ["ngl=auto", "ngl=auto", "ngl=0", "ngl=0"]
    );
}

/// Q5-1 của review 02 lần 5, kịch bản 2: `llama-server` chạy CPU chỉ vì đi theo `asr-worker`. `asr-worker` bỏ cuộc trên
/// CPU, người dùng bấm thử lại, `asr-worker` về GPU: lần chạy kế tiếp của `llama-server` cũng về GPU.
#[test]
fn llama_server_follows_the_worker_back_to_the_gpu() {
    // `llama-server` còn lỗi hai lần trong lúc chạy CPU theo `asr-worker`: hai lần đó không tính là lỗi GPU của nó.
    let s = setup(
        "follow-back",
        true,
        &["exit_at_start:1", "ok"],
        &["exit_at_start:1", "exit_at_start:1", "ok"],
    );
    s.manager.ensure_started().unwrap();
    assert!(s.events.names().contains(&"cpu Llama".to_string()));
    assert_eq!(s.t.read("llama-events").lines().last(), Some("start ngl=0 extra="));
    s.manager.stop(true);
    std::fs::write(s.t.path("asr-plan"), ["exit_at_start:1"; 6].join("\n")).unwrap();
    assert_eq!(s.manager.ensure_started().unwrap_err().cause, GiveUpCause::Failures);
    std::fs::write(s.t.path("asr-plan"), "ok").unwrap();
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    assert_eq!(names[names.len() - 2..], ["start Llama", "ready Llama gpu=true"]);
    assert_eq!(s.t.read("llama-events").lines().last(), Some("start ngl=auto extra="));
}

/// GP6 của review 02 lần 5: đã chuyển CPU vì lỗi mà chưa bỏ cuộc thì bấm Bắt đầu không đưa về GPU.
#[test]
fn a_retry_without_giving_up_keeps_the_cpu() {
    let s = setup("retry-keeps-cpu", true, &["crash_on:1", "crash_on:1", "ok"], &[]);
    assert!(matches!(s.manager.transcribe(request(1)), Err(AsrFailure::Dropped(_))));
    assert!(s.events.names().contains(&"cpu Asr".to_string()));
    s.manager.allow_retry();
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    let cpu = names.iter().position(|n| n == "cpu Asr").unwrap();
    assert!(names[cpu..].contains(&"ready Asr gpu=false".to_string()), "{names:?}");
    assert!(
        !names[cpu..].contains(&"ready Asr gpu=true".to_string()),
        "vẫn CPU: {names:?}"
    );
}
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --test lifecycle`
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0432]: unresolved imports `pipeline::supervisor::AsrFailure`, `pipeline::supervisor::AsrSpec`, `pipeline::supervisor::Clock`, `pipeline::supervisor::FakeClock`, `pipeline::supervisor::GiveUpCause`, `pipeline::supervisor::LlamaSpec`, `pipeline::supervisor::SidecarEvent`, `pipeline::supervisor::SidecarEvents`, `pipeline::supervisor::SidecarManager`, `pipeline::supervisor::SidecarSpec`, `pipeline::supervisor::Which`
error[E0433]: cannot find `SystemClock` in `supervisor`
```

- [ ] **Step 4: Viết code**

Sửa `crates/pipeline/src/asr_client.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/asr_client.rs
+++ b/crates/pipeline/src/asr_client.rs
@@ -2,8 +2,10 @@
 //!
 //! Lỗi chia hai loại, để bên giám sát (`supervisor`) biết khi nào phải khởi động lại worker:
 //! - `AsrError::Worker`: worker trả `Error` cho yêu cầu (vẫn sống), kèm `ErrorKind`;
-//! - `AsrError::Crashed`: worker chết, pipe hỏng, khung sai, lệch phiên bản giao thức, hoặc quá thời gian chờ (worker
-//!   bị kill). Luồng giao thức không còn dùng được.
+//! - `AsrError::Crashed`: worker chết, pipe hỏng, khung sai, hoặc lệch phiên bản giao thức;
+//! - `AsrError::TimedOut`: quá thời gian chờ, worker đã bị kill.
+//!
+//! Hai loại sau đều làm luồng giao thức không còn dùng được (`is_crash`).
 
 use crate::logfile;
 use crate::process;
@@ -25,17 +27,23 @@
     Worker { kind: ErrorKind, message: String },
     #[error("asr-worker không dùng được nữa: {0}")]
     Crashed(String),
+    #[error("asr-worker không trả lời: {0}")]
+    TimedOut(String),
 }
 
 impl AsrError {
     pub fn is_crash(&self) -> bool {
-        matches!(self, Self::Crashed(_))
+        matches!(self, Self::Crashed(_) | Self::TimedOut(_))
+    }
+
+    pub fn is_timeout(&self) -> bool {
+        matches!(self, Self::TimedOut(_))
     }
 
     pub fn kind(&self) -> Option<ErrorKind> {
         match self {
             Self::Worker { kind, .. } => Some(*kind),
-            Self::Crashed(_) => None,
+            Self::Crashed(_) | Self::TimedOut(_) => None,
         }
     }
 }
@@ -103,6 +111,15 @@
     /// Chạy worker, gửi `Load`, chờ `Ready` và kiểm phiên bản giao thức. Worker chết lúc nạp thì lỗi kèm vài dòng cuối
     /// của stderr (log của whisper.cpp, không có âm thanh hay chữ chép lời), để phân loại được lỗi GPU và hết bộ nhớ.
     pub fn spawn(launch: &AsrLaunch) -> Result<(Self, ReadyInfo), AsrError> {
+        Self::spawn_with(launch, &mut |_| {})
+    }
+
+    /// Như [`AsrWorker::spawn`]; `on_spawn` nhận cách kill worker ngay khi tiến trình chạy, trước khi chờ `Ready`, để
+    /// bên giám sát dừng được cả một worker đang nạp model (app thoát giữa lúc chuẩn bị).
+    pub fn spawn_with(
+        launch: &AsrLaunch,
+        on_spawn: &mut dyn FnMut(process::Killer),
+    ) -> Result<(Self, ReadyInfo), AsrError> {
         let crashed = |e: String| AsrError::Crashed(e);
         let log = logfile::RotatingLog::open(&launch.log, logfile::MAX_BYTES, logfile::KEEP)
             .map_err(|e| crashed(format!("không mở được log {}: {e}", launch.log.display())))?;
@@ -124,6 +141,7 @@
             request_timeout: launch.request_timeout,
             shutdown_grace: launch.shutdown_grace,
         };
+        on_spawn(worker.killer());
         let load = Request::Load {
             model_path: launch.model.display().to_string(),
             use_gpu: launch.use_gpu,
@@ -134,6 +152,10 @@
             Err(AsrError::Crashed(e)) => {
                 drop(worker); // chờ worker thoát và luồng chép log đọc hết stderr
                 return Err(crashed(with_tail(e, &tail.lines())));
+            }
+            Err(AsrError::TimedOut(e)) => {
+                drop(worker);
+                return Err(AsrError::TimedOut(with_tail(e, &tail.lines())));
             }
             Err(e) => return Err(e),
         };
@@ -170,6 +192,11 @@
         self.tail.lines()
     }
 
+    /// Kill worker từ luồng khác, kể cả khi luồng đang dùng nó chặn giữa request.
+    pub fn killer(&self) -> process::Killer {
+        process::Killer::new(self.child.clone())
+    }
+
     pub fn warmup(&mut self) -> Result<f32, AsrError> {
         match self.call(&Request::Warmup, self.request_timeout)? {
             Response::WarmupDone { millis } => Ok(millis),
@@ -216,7 +243,7 @@
         let _ = watchdog.join();
         res.map_err(|e| {
             if timed_out.load(Ordering::SeqCst) {
-                return AsrError::Crashed(format!("asr-worker không trả lời sau {timeout:?}, đã kill"));
+                return AsrError::TimedOut(format!("không trả lời sau {timeout:?}, đã kill"));
             }
             // Lỗi pipe thường là do worker vừa chết: chờ ngắn để lấy mã thoát (tiến trình có thể chưa kịp thành zombie).
             let deadline = Instant::now() + Duration::from_millis(200);
```

Sửa `crates/pipeline/src/bin/fake_asr_worker.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/bin/fake_asr_worker.rs
+++ b/crates/pipeline/src/bin/fake_asr_worker.rs
@@ -13,7 +13,9 @@
 //!   - `crash_on:<n>`: thoát với mã 3, không trả lời, khi nhận `Transcribe` thứ `n` của lần chạy này;
 //!   - `hang_on:<n>`: treo khi nhận `Transcribe` thứ `n`;
 //!   - `wrong_id_on:<n>`: kết quả của `Transcribe` thứ `n` mang id đoạn cộng 1000;
-//!   - `slow_ms:<ms>`: chờ chừng này trước khi trả mỗi kết quả `Transcribe` (để test hàng đợi tất định).
+//!   - `slow_ms:<ms>`: chờ chừng này trước khi trả mỗi kết quả `Transcribe` (để test hàng đợi tất định);
+//!   - `error_on:<n>[:<OutOfMemory|Internal>]`: trả `Error` (mặc định `Internal`) cho `Transcribe` thứ `n`, vẫn sống;
+//!   - `load_delay_ms:<ms>`: chờ chừng này trước khi trả lời `Load` (nạp model chậm, như lần đầu chạy trên macOS).
 //! - `FAKE_ASR_LOG`: file ghi nối tiếp các sự kiện (`start use_gpu=…`, `transcribe <id> prev=<ngôn ngữ> prompt=<số token>`).
 //! - `FAKE_ASR_TEXTS`: file, mỗi dòng `<ngôn ngữ>\t<chữ>`; đoạn có id `i` trả dòng `i % số dòng`. Thêm `\t!nospeech` ở cuối
 //!   dòng thì trả `no_speech_prob` 0,9 và `avg_logprob` −1,5. Không đặt thì trả `đoạn <id>` bằng ngôn ngữ đầu tiên được phép.
@@ -33,6 +35,9 @@
     hang_on: Option<u32>,
     wrong_id_on: Option<u32>,
     slow_ms: u64,
+    error_on: Option<u32>,
+    error_kind: ErrorKind,
+    load_delay_ms: u64,
 }
 
 fn next_plan_line() -> String {
@@ -58,6 +63,9 @@
         hang_on: None,
         wrong_id_on: None,
         slow_ms: 0,
+        error_on: None,
+        error_kind: ErrorKind::Internal,
+        load_delay_ms: 0,
     };
     for word in line.split_whitespace() {
         let (key, value) = word.split_once(':').unwrap_or((word, ""));
@@ -84,6 +92,15 @@
             "hang_on" => plan.hang_on = value.parse().ok(),
             "wrong_id_on" => plan.wrong_id_on = value.parse().ok(),
             "slow_ms" => plan.slow_ms = value.parse().expect("số ms"),
+            "error_on" => {
+                let (n, kind) = value.split_once(':').unwrap_or((value, "Internal"));
+                plan.error_on = n.parse().ok();
+                plan.error_kind = match kind {
+                    "OutOfMemory" => ErrorKind::OutOfMemory,
+                    _ => ErrorKind::Internal,
+                };
+            }
+            "load_delay_ms" => plan.load_delay_ms = value.parse().expect("số ms"),
             other => panic!("lệnh kịch bản lạ: {other}"),
         }
     }
@@ -132,6 +149,7 @@
         let response = match request {
             Request::Load { use_gpu, .. } => {
                 log(&format!("start use_gpu={use_gpu}"));
+                std::thread::sleep(std::time::Duration::from_millis(plan.load_delay_ms));
                 match plan.load_error {
                     Some(kind) => Response::Error {
                         segment_id: None,
@@ -185,6 +203,12 @@
                         segment_id: Some(req.segment_id),
                         kind: ErrorKind::NotLoaded,
                         message: "chưa nạp model".into(),
+                    }
+                } else if plan.error_on == Some(transcribes) {
+                    Response::Error {
+                        segment_id: Some(req.segment_id),
+                        kind: plan.error_kind,
+                        message: "lỗi giả khi chép lời".into(),
                     }
                 } else {
                     let (lang, text, nospeech) = if texts.is_empty() {
```

Sửa `crates/pipeline/src/bin/fake_llama_server.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/bin/fake_llama_server.rs
+++ b/crates/pipeline/src/bin/fake_llama_server.rs
@@ -12,7 +12,8 @@
 //!   - `delay_ms:<ms>`: chờ chừng này trước mỗi gói SSE (để test hủy và hàng đợi tất định);
 //!   - `stall_after:<n>`: gửi `n` gói chữ rồi ngừng, không đóng kết nối (server treo giữa lúc sinh);
 //!   - `oom_at_start`: in ra stderr dòng lỗi hết bộ nhớ của ggml rồi thoát với mã 1, như khi không đủ VRAM để nạp model;
-//!   - `leak_key`: in tham số dòng lệnh và `LLAMA_API_KEY=<key>` ra stderr, như một bản server lỡ log khóa.
+//!   - `leak_key`: in tham số dòng lệnh và `LLAMA_API_KEY=<key>` ra stderr, như một bản server lỡ log khóa;
+//!   - `health_delay_ms:<ms>`: `/health` trả 503 (đang nạp model) cho tới chừng này ms sau khi chạy.
 //! - `FAKE_LLAMA_LOG`: file ghi nối tiếp các sự kiện (`start ngl=…`, `chat <n> repeat=<p> max=<m>`). Không ghi API key.
 //! - `FAKE_LLAMA_KEY_FILE`: file nhận đúng API key, chỉ để test kiểm rằng key không lộ ở chỗ khác.
 
@@ -31,6 +32,7 @@
     stall_after: Option<usize>,
     oom_at_start: bool,
     leak_key: bool,
+    health_delay_ms: u64,
 }
 
 fn next_plan_line() -> String {
@@ -61,6 +63,7 @@
             "stall_after" => plan.stall_after = value.parse().ok(),
             "oom_at_start" => plan.oom_at_start = true,
             "leak_key" => plan.leak_key = true,
+            "health_delay_ms" => plan.health_delay_ms = value.parse().expect("số ms"),
             other => panic!("lệnh kịch bản lạ: {other}"),
         }
     }
@@ -156,6 +159,7 @@
             .and_then(|i| args.get(i + 1))
             .cloned()
     };
+    let started = std::time::Instant::now();
     let plan = parse(&next_plan_line());
     log(&format!(
         "start ngl={} extra={}",
@@ -195,7 +199,16 @@
         let Ok(stream) = stream else { continue };
         let Some(req) = read_request(&stream) else { continue };
         if req.method == "GET" && req.path == "/health" {
-            respond(&stream, "200 OK", "application/json", r#"{"status":"ok"}"#);
+            if started.elapsed() < std::time::Duration::from_millis(plan.health_delay_ms) {
+                respond(
+                    &stream,
+                    "503 Service Unavailable",
+                    "application/json",
+                    r#"{"error":"Loading model"}"#,
+                );
+            } else {
+                respond(&stream, "200 OK", "application/json", r#"{"status":"ok"}"#);
+            }
             continue;
         }
         if req.authorization.as_deref() != Some(&format!("Bearer {key}")) {
```

Sửa `crates/pipeline/src/llama.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/llama.rs
+++ b/crates/pipeline/src/llama.rs
@@ -118,8 +118,23 @@
     pub finish_reason: Option<String>,
 }
 
+/// `llama-server` không báo sẵn sàng trong thời gian chờ (khác với chết lúc khởi động). Lần đầu chạy, giám sát không tính
+/// lần này là một lần lỗi (§6.5).
+#[derive(Debug, thiserror::Error)]
+#[error("llama-server không sẵn sàng sau {timeout:?}, xem log {log}")]
+pub struct NotReady {
+    pub timeout: Duration,
+    pub log: String,
+}
+
+/// Lỗi khởi động có phải vì quá thời gian chờ `/health` không.
+pub fn is_not_ready(e: &anyhow::Error) -> bool {
+    e.downcast_ref::<NotReady>().is_some()
+}
+
 pub struct LlamaServer {
-    child: Child,
+    child: std::sync::Arc<std::sync::Mutex<Child>>,
+    pid: u32,
     /// Luồng chép stderr vào log (che key); kết thúc khi server thoát.
     pump: Option<std::thread::JoinHandle<()>>,
     tail: logfile::Tail,
@@ -134,7 +149,7 @@
 impl std::fmt::Debug for LlamaServer {
     fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
         f.debug_struct("LlamaServer")
-            .field("pid", &self.child.id())
+            .field("pid", &self.pid)
             .field("base_url", &self.base_url)
             .field("api_key", &"<ẩn>")
             .finish()
@@ -143,6 +158,11 @@
 
 impl LlamaServer {
     pub fn spawn(launch: &LlamaLaunch) -> Result<Self> {
+        Self::spawn_with(launch, &mut |_| {})
+    }
+
+    /// Như [`LlamaServer::spawn`]; `on_spawn` nhận cách kill server ngay khi tiến trình chạy, trước khi chờ `/health`.
+    pub fn spawn_with(launch: &LlamaLaunch, on_spawn: &mut dyn FnMut(process::Killer)) -> Result<Self> {
         // Chỉ gọi 127.0.0.1: reqwest vẫn đọc HTTP_PROXY/ALL_PROXY kể cả khi tắt feature `system-proxy`,
         // nên phải tắt proxy tường minh, giống `ProxyHandler({})` trong common.py.
         // Dựng client trước khi chạy tiến trình, để lỗi ở đây không bỏ lại server mồ côi.
@@ -159,7 +179,8 @@
         let stderr = child.stderr.take().expect("stderr là pipe");
         let (pump, tail) = logfile::pump(stderr, log, vec![api_key.clone()]);
         let mut server = Self {
-            child,
+            pid: child.id(),
+            child: std::sync::Arc::new(std::sync::Mutex::new(child)),
             pump: Some(pump),
             tail,
             base_url: format!("http://127.0.0.1:{port}"),
@@ -168,17 +189,31 @@
             log_path: launch.log.clone(),
             request_timeout: launch.request_timeout,
         };
+        on_spawn(server.killer());
         if let Err(e) = server.wait_healthy(launch.ready_timeout) {
             // Kill rồi chờ luồng chép log đọc hết, để lỗi mang đủ các dòng cuối (hết bộ nhớ, lỗi GPU…).
             let tail = server.tail.clone();
             drop(server);
-            bail!(crate::asr_client::with_tail(format!("{e:#}"), &tail.lines()));
+            let lines = tail.lines();
+            return Err(match crate::asr_client::with_tail(String::new(), &lines) {
+                t if t.is_empty() => e,
+                t => e.context(t.trim_start_matches("; ").to_string()),
+            });
         }
         Ok(server)
     }
 
     pub fn pid(&self) -> u32 {
-        self.child.id()
+        self.pid
+    }
+
+    fn child(&self) -> std::sync::MutexGuard<'_, Child> {
+        self.child.lock().unwrap_or_else(|e| e.into_inner())
+    }
+
+    /// Kill server từ luồng khác, kể cả khi luồng đang dùng nó chặn giữa request.
+    pub fn killer(&self) -> process::Killer {
+        process::Killer::new(self.child.clone())
     }
 
     /// `http://127.0.0.1:<cổng>`.
@@ -193,7 +228,7 @@
 
     /// Mã thoát nếu server đã chết.
     pub fn exited(&mut self) -> Option<ExitStatus> {
-        self.child.try_wait().ok().flatten()
+        self.child().try_wait().ok().flatten()
     }
 
     /// `/health` trả 200 (không cần API key). 503 khi đang nạp model.
@@ -208,7 +243,7 @@
     fn wait_healthy(&mut self, timeout: Duration) -> Result<()> {
         let started = Instant::now();
         while started.elapsed() < timeout {
-            if let Some(status) = self.child.try_wait()? {
+            if let Some(status) = self.child().try_wait()? {
                 bail!("llama-server thoát sớm ({status}), xem log {}", self.log_path.display());
             }
             // Mỗi lần hỏi chỉ chờ 2 giây, để tổng thời gian chờ không vượt `timeout` quá nhiều.
@@ -217,10 +252,11 @@
             }
             std::thread::sleep(Duration::from_millis(200));
         }
-        bail!(
-            "llama-server không sẵn sàng sau {timeout:?}, xem log {}",
-            self.log_path.display()
-        )
+        Err(NotReady {
+            timeout,
+            log: self.log_path.display().to_string(),
+        }
+        .into())
     }
 
     /// Dịch một prompt với tham số sinh của §6.5, stream tới hết. `on_delta` nhận từng gói chữ; trả `Break` để dừng
@@ -355,9 +391,12 @@
 
 impl Drop for LlamaServer {
     fn drop(&mut self) {
-        let _ = self.child.kill();
-        let _ = self.child.wait();
-        process::release(self.child.id());
+        {
+            let mut child = self.child();
+            let _ = child.kill();
+            let _ = child.wait();
+        }
+        process::release(self.pid);
         if let Some(pump) = self.pump.take() {
             let _ = pump.join();
         }
```

Sửa `crates/pipeline/src/process.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/process.rs
+++ b/crates/pipeline/src/process.rs
@@ -228,6 +228,21 @@
 #[cfg(not(target_os = "macos"))]
 fn exe_path(_pid: u32) -> Option<PathBuf> {
     None
+}
+
+/// Cách kill một tiến trình phụ từ luồng khác, không cần khóa của bên đang dùng nó (ví dụ giám sát dừng một worker đang
+/// treo giữa request). Giữ chung `Child` với client, nên không bao giờ kill nhầm một pid đã được cấp lại.
+#[derive(Clone)]
+pub struct Killer(pub(crate) std::sync::Arc<Mutex<Child>>);
+
+impl Killer {
+    pub fn new(child: std::sync::Arc<Mutex<Child>>) -> Self {
+        Self(child)
+    }
+
+    pub fn kill(&self) {
+        let _ = self.0.lock().unwrap_or_else(|e| e.into_inner()).kill();
+    }
 }
 
 /// Bật cờ thoát: từ giờ [`spawn`] luôn trả lỗi. Gọi trước [`kill_all`] lúc app thoát.
```

Thêm vào `crates/pipeline/src/supervisor.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::asr_client::{AsrLaunch, AsrWorker, ReadyInfo};
use crate::config::{AsrConfig, MtConfig, SupervisorConfig};
use crate::llama::{ChatRequest, LlamaLaunch, LlamaServer, StreamEnd, is_not_ready};
use crate::process;
use crate::translate::{Mt, MtError};
use asr_protocol::{Backend, DecodeMode, ErrorKind, TranscribeRequest, TranscribeResult};
use std::collections::VecDeque;
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Lần chờ ngắt được: sau [`Wake::wake`], mọi lần chờ đang dở và sau đó trả về ngay.
#[derive(Default)]
pub struct Wake {
    woken: Mutex<bool>,
    cv: Condvar,
}

impl Wake {
    pub fn wake(&self) {
        *lock(&self.woken) = true;
        self.cv.notify_all();
    }

    pub fn is_woken(&self) -> bool {
        *lock(&self.woken)
    }

    /// Chờ tối đa `d`; trả `true` nếu bị ngắt.
    pub fn wait(&self, d: Duration) -> bool {
        let guard = lock(&self.woken);
        let (guard, _) = self
            .cv
            .wait_timeout_while(guard, d, |woken| !*woken)
            .unwrap_or_else(|e| e.into_inner());
        *guard
    }
}

/// Đồng hồ cho mọi thời gian chờ của phần giám sát.
pub trait Clock: Send + Sync {
    fn now_ms(&self) -> u64;
    /// Chờ `d`, hoặc tới khi `wake` bị ngắt.
    fn sleep(&self, d: Duration, wake: &Wake);
}

pub struct SystemClock {
    origin: Instant,
}

impl Default for SystemClock {
    fn default() -> Self {
        Self { origin: Instant::now() }
    }
}

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        self.origin.elapsed().as_millis() as u64
    }

    fn sleep(&self, d: Duration, wake: &Wake) {
        wake.wait(d);
    }
}

/// Đồng hồ giả cho test: `sleep` cộng thẳng vào giờ hiện tại và ghi lại, không chờ thật.
#[derive(Default)]
pub struct FakeClock {
    now: AtomicU64,
    sleeps: Mutex<Vec<u64>>,
}

impl FakeClock {
    pub fn advance(&self, d: Duration) {
        self.now.fetch_add(d.as_millis() as u64, Ordering::SeqCst);
    }

    /// Các lần `sleep` đã gọi, tính bằng ms.
    pub fn sleeps(&self) -> Vec<u64> {
        lock(&self.sleeps).clone()
    }
}

impl Clock for FakeClock {
    fn now_ms(&self) -> u64 {
        self.now.load(Ordering::SeqCst)
    }

    fn sleep(&self, d: Duration, _wake: &Wake) {
        lock(&self.sleeps).push(d.as_millis() as u64);
        self.advance(d);
    }
}

/// Quyết định sau một lần lỗi.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Restart { after_ms: u64, use_gpu: bool },
    GiveUp,
}

/// Luật khởi động lại, không đụng tới tiến trình nào (test riêng được).
#[derive(Debug)]
pub struct RestartTracker {
    cfg: SupervisorConfig,
    failures: VecDeque<u64>,
    gpu_failures_in_a_row: u32,
}

impl RestartTracker {
    pub fn new(cfg: SupervisorConfig) -> Self {
        Self {
            cfg,
            failures: VecDeque::new(),
            gpu_failures_in_a_row: 0,
        }
    }

    /// Một lần lỗi lúc `now_ms`. `on_gpu`: đang chạy bằng GPU. `during_start`: lỗi xảy ra khi khởi động hay nạp model,
    /// lúc đó chuyển sang CPU ngay (§6.4).
    pub fn on_failure(&mut self, now_ms: u64, on_gpu: bool, during_start: bool) -> Decision {
        while self
            .failures
            .front()
            .is_some_and(|&t| now_ms.saturating_sub(t) >= self.cfg.failure_window_ms)
        {
            self.failures.pop_front();
        }
        self.failures.push_back(now_ms);
        if self.failures.len() > self.cfg.max_failures {
            return Decision::GiveUp;
        }
        let mut use_gpu = on_gpu;
        if on_gpu {
            self.gpu_failures_in_a_row += 1;
            if during_start || self.gpu_failures_in_a_row >= self.cfg.gpu_failures_to_cpu {
                use_gpu = false;
            }
        }
        Decision::Restart {
            after_ms: self.backoff(self.failures.len()),
            use_gpu,
        }
    }

    /// Thời gian chờ trước lần chạy lại thứ `n` (từ 1).
    fn backoff(&self, n: usize) -> u64 {
        let backoff = &self.cfg.backoff_ms;
        backoff[n.saturating_sub(1).min(backoff.len() - 1)]
    }

    /// Số lần lỗi còn trong cửa sổ.
    pub fn failures(&self) -> usize {
        self.failures.len()
    }

    /// Một yêu cầu thành công: số lần crash liên tiếp trên GPU về 0.
    pub fn on_success(&mut self) {
        self.gpu_failures_in_a_row = 0;
    }

    /// Người dùng thử lại (bấm Bắt đầu): quên các lần lỗi cũ.
    pub fn reset(&mut self) {
        self.failures.clear();
        self.gpu_failures_in_a_row = 0;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Which {
    Asr,
    Llama,
}

/// Vì sao giám sát bỏ cuộc với một tiến trình phụ. App chọn mã lỗi theo đây (02c).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GiveUpCause {
    /// Quá `max_failures` lần lỗi trong `failure_window_ms`.
    Failures,
    /// Model không nạp được ngay cả bằng CPU: model hỏng (§9: đề nghị tải lại).
    ModelLoad,
    /// `asr-worker` thiếu chế độ giải mã B.
    NoSharedMode,
    /// Binary không qua bước kiểm của app ([`SidecarEvents::before_spawn`]): `sidecarTampered`.
    Tampered,
    /// App đang thoát.
    Closing,
}

/// Sự kiện để app hiện trạng thái (§4.2, §9). Không chứa API key hay nội dung chép lời.
#[derive(Clone, Debug, PartialEq)]
pub enum SidecarEvent {
    Starting {
        which: Which,
        /// Lần đầu chạy binary này: giao diện báo "Đang chuẩn bị lần đầu" (§6.5).
        first_run: bool,
    },
    Ready {
        which: Which,
        use_gpu: bool,
        /// Thiết bị thật của `asr-worker`; `None` với `llama-server`.
        backend: Option<Backend>,
        first_run: bool,
    },
    Restarting {
        which: Which,
        /// Số lần lỗi đang tính trong cửa sổ 10 phút (lần đầu chạy quá giờ không tính).
        failures: usize,
        after_ms: u64,
        reason: String,
    },
    /// "Đang chạy bằng CPU (chậm hơn)" (§9).
    CpuFallback {
        which: Which,
    },
    /// Tiến trình phụ báo hết bộ nhớ: app đề xuất gói Nhẹ (§9).
    OutOfMemory {
        which: Which,
    },
    GaveUp {
        which: Which,
        cause: GiveUpCause,
        reason: String,
    },
    Stopped {
        which: Which,
        idle: bool,
    },
}

/// Nơi app nhận sự kiện của giám sát và kiểm binary trước khi chạy.
pub trait SidecarEvents: Send + Sync {
    fn on_event(&self, event: &SidecarEvent);

    /// Gọi ngay trước mỗi lần chạy `exe`, kể cả mọi lần khởi động lại. App kiểm SHA-256 ở đây (§10.2); trả `Err` thì
    /// giám sát không chạy binary đó và bỏ cuộc với [`GiveUpCause::Tampered`].
    fn before_spawn(&self, _which: Which, _exe: &Path) -> Result<(), String> {
        Ok(())
    }

    /// `exe` chưa từng chạy tới `Ready` trên máy này (vừa cài hay cập nhật). Giám sát hỏi trước lần chạy đầu tiên của mỗi
    /// binary, kể cả binary chỉ chạy sau khi chuyển sang CPU (Windows: `asr-worker-cpu`), cộng với `first_run` của spec.
    fn is_first_run(&self, _which: Which, _exe: &Path) -> bool {
        false
    }
}

/// Bỏ qua mọi sự kiện, không kiểm binary.
pub struct NoEvents;

impl SidecarEvents for NoEvents {
    fn on_event(&self, _: &SidecarEvent) {}
}

#[derive(Clone, Debug)]
pub struct AsrSpec {
    /// Bản chạy GPU. macOS chỉ có một bản (Metal và CPU): đặt `exe_gpu` và `exe_cpu` cùng một file. Windows:
    /// `asr-worker-vulkan` và `asr-worker-cpu`; không dò thấy GPU dùng được (`--probe`) thì `exe_gpu` là `None`, và
    /// `llama-server` cũng chạy bằng CPU.
    pub exe_gpu: Option<PathBuf>,
    pub exe_cpu: PathBuf,
    pub model: PathBuf,
    pub log: PathBuf,
    pub first_run: bool,
    /// Bản phát hành chỉ nhận chế độ B (§6.4, "Việc cho MVP").
    pub require_shared: bool,
    pub env: Vec<(String, String)>,
}

#[derive(Clone, Debug)]
pub struct LlamaSpec {
    pub exe: PathBuf,
    pub model: PathBuf,
    pub log: PathBuf,
    pub extra_args: Vec<String>,
    pub first_run: bool,
    pub env: Vec<(String, String)>,
}

#[derive(Clone, Debug)]
pub struct SidecarSpec {
    pub asr: AsrSpec,
    pub llama: LlamaSpec,
    pub supervisor: SupervisorConfig,
    pub asr_config: AsrConfig,
    pub mt_config: MtConfig,
}

/// Lỗi của một đoạn khi chép lời.
#[derive(Clone, Debug, PartialEq, thiserror::Error)]
pub enum AsrFailure {
    /// Đoạn này bị bỏ (`dropped`): lỗi cả sau khi gửi lại, hoặc worker trả `Error` cho đoạn.
    #[error("bỏ đoạn: {0}")]
    Dropped(String),
    /// `asr-worker` không dùng được nữa: dừng dịch, báo lỗi (§9).
    #[error("asr-worker không dùng được: {0}")]
    Unavailable(String),
}

/// Nhận dạng giọng nói, như luồng nhận dạng của `engine` cần. Bản thật là [`SupervisedAsr`].
pub trait Asr: Send {
    fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure>;
}

#[derive(Clone, Debug, PartialEq, thiserror::Error)]
#[error("{which:?} không khởi động được: {reason}")]
pub struct StartError {
    pub which: Which,
    pub cause: GiveUpCause,
    pub reason: String,
}

/// Dấu hiệu hết bộ nhớ trong thông báo lỗi hay log của tiến trình phụ. Cùng danh sách với `asr_worker::engine::classify`,
/// vì `llama-server` không có mã lỗi riêng cho việc này.
pub fn looks_out_of_memory(text: &str) -> bool {
    const OOM: [&str; 5] = [
        "out of memory",
        "failed to allocate",
        "cannot allocate",
        "outofdevicememory",
        "insufficient memory",
    ];
    let text = text.to_lowercase();
    OOM.iter().any(|m| text.contains(m))
}

struct AsrSlot {
    worker: Option<AsrWorker>,
    tracker: RestartTracker,
    use_gpu: bool,
    first_run: bool,
    /// Binary đã được hỏi `is_first_run`: mỗi binary chỉ được chờ lâu một lần.
    asked_first_run: Vec<PathBuf>,
    gave_up: Option<(GiveUpCause, String)>,
}

struct LlamaSlot {
    server: Option<LlamaServer>,
    tracker: RestartTracker,
    /// Quyết định GPU của riêng `llama-server` (theo `--probe`, và luật 2 lần lỗi liên tiếp trên GPU). Lần chạy thật dùng
    /// GPU khi cờ này bật **và** `asr-worker` không chạy bằng CPU, tính lại ở mỗi lần chạy (Q5-1 của review 02 lần 5).
    use_gpu: bool,
    /// Lần chạy gần nhất có dùng GPU không (`None`: chưa chạy lần nào).
    last_gpu: Option<bool>,
    first_run: bool,
    asked_first_run: Vec<PathBuf>,
    gave_up: Option<(GiveUpCause, String)>,
}

/// Lần đầu thấy `exe` thì hỏi app nó có phải lần đầu chạy không. Lần chạy đầu của spec (`first_run`) cũng chỉ áp cho binary
/// đầu tiên được chạy.
fn ask_first_run(events: &dyn SidecarEvents, which: Which, exe: &Path, asked: &mut Vec<PathBuf>, first_run: &mut bool) {
    if asked.iter().any(|p| p == exe) {
        return;
    }
    if asked.is_empty() {
        *first_run |= events.is_first_run(which, exe);
    } else {
        *first_run = events.is_first_run(which, exe);
    }
    asked.push(exe.to_path_buf());
}

struct Activity {
    sessions: usize,
    last_active_ms: u64,
}

/// Cách kill tiến trình phụ đang chạy (hay đang nạp model) của mỗi bên. Khóa này không bao giờ bị giữ lâu.
#[derive(Default)]
struct Killers {
    asr: Option<process::Killer>,
    llama: Option<process::Killer>,
}

/// Một lần chạy `asr-worker` lỗi.
struct AsrStartFailure {
    reason: String,
    kind: Option<ErrorKind>,
    timed_out: bool,
}

pub struct SidecarManager {
    spec: SidecarSpec,
    clock: Arc<dyn Clock>,
    events: Arc<dyn SidecarEvents>,
    asr: Mutex<AsrSlot>,
    llama: Mutex<LlamaSlot>,
    activity: Mutex<Activity>,
    killers: Mutex<Killers>,
    /// App đang thoát: không chạy thêm gì nữa.
    closing: AtomicBool,
    /// Ngắt lần chờ giữa hai lần khởi động khi app thoát.
    wake: Wake,
    asr_running: AtomicBool,
    llama_running: AtomicBool,
    /// `asr-worker` đang chạy bằng CPU: `llama-server` cũng chạy bằng CPU từ lần khởi động kế tiếp.
    asr_on_cpu: AtomicBool,
    backend: Mutex<Option<Backend>>,
    /// Người dùng vừa bấm Bắt đầu: lần khởi động kế tiếp quên việc bỏ cuộc trước đó.
    retry_asr: AtomicBool,
    retry_llama: AtomicBool,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl SidecarManager {
    pub fn new(spec: SidecarSpec, clock: Arc<dyn Clock>, events: Arc<dyn SidecarEvents>) -> Arc<Self> {
        let gpu = spec.asr.exe_gpu.is_some();
        let asr = AsrSlot {
            worker: None,
            tracker: RestartTracker::new(spec.supervisor.clone()),
            use_gpu: gpu,
            first_run: spec.asr.first_run,
            asked_first_run: Vec::new(),
            gave_up: None,
        };
        let llama = LlamaSlot {
            server: None,
            tracker: RestartTracker::new(spec.supervisor.clone()),
            use_gpu: gpu,
            last_gpu: None,
            first_run: spec.llama.first_run,
            asked_first_run: Vec::new(),
            gave_up: None,
        };
        let now = clock.now_ms();
        Arc::new(Self {
            spec,
            clock,
            events,
            asr: Mutex::new(asr),
            llama: Mutex::new(llama),
            activity: Mutex::new(Activity {
                sessions: 0,
                last_active_ms: now,
            }),
            killers: Mutex::new(Killers::default()),
            closing: AtomicBool::new(false),
            wake: Wake::default(),
            asr_running: AtomicBool::new(false),
            llama_running: AtomicBool::new(false),
            asr_on_cpu: AtomicBool::new(!gpu),
            backend: Mutex::new(None),
            retry_asr: AtomicBool::new(false),
            retry_llama: AtomicBool::new(false),
        })
    }

    fn emit(&self, event: SidecarEvent) {
        log::info!("tiến trình phụ: {event:?}");
        self.events.on_event(&event);
    }

    fn closing(&self) -> bool {
        self.closing.load(Ordering::SeqCst)
    }

    fn closing_error(which: Which) -> StartError {
        StartError {
            which,
            cause: GiveUpCause::Closing,
            reason: "app đang thoát".into(),
        }
    }

    /// Chạy cả hai theo đúng thứ tự, nếu chưa chạy. Chặn tới khi cả hai sẵn sàng; gọi từ luồng nền.
    pub fn ensure_started(&self) -> Result<(), StartError> {
        self.touch();
        {
            let mut asr = lock(&self.asr);
            self.start_asr(&mut asr)?;
        }
        let mut llama = lock(&self.llama);
        self.start_llama(&mut llama)
    }

    /// Có hoạt động (mở cửa sổ chính, dịch): lùi mốc tắt khi rảnh.
    pub fn touch(&self) {
        lock(&self.activity).last_active_ms = self.clock.now_ms();
    }

    /// Người dùng bấm Bắt đầu: lần khởi động kế tiếp của mỗi tiến trình phụ quên việc bỏ cuộc trước đó và thử lại từ đầu
    /// (người dùng có thể đã sửa nguyên nhân: tải lại model, cài lại app). App gọi hàm này **trước** khi chuẩn bị tiến trình
    /// phụ cho phiên (R3-1 của review 02 lần 3); lần chạy sẵn khi mở cửa sổ chính thì không. Không chờ khóa nào.
    pub fn allow_retry(&self) {
        self.retry_asr.store(true, Ordering::SeqCst);
        self.retry_llama.store(true, Ordering::SeqCst);
    }

    /// Một phiên dịch bắt đầu: không tắt tiến trình phụ khi rảnh cho tới khi phiên kết thúc. Không chờ khóa của tiến trình
    /// phụ (có thể đang nạp model).
    pub fn begin_session(&self) {
        let mut a = lock(&self.activity);
        a.sessions += 1;
        a.last_active_ms = self.clock.now_ms();
    }

    pub fn end_session(&self) {
        let mut a = lock(&self.activity);
        a.sessions = a.sessions.saturating_sub(1);
        a.last_active_ms = self.clock.now_ms();
    }

    /// Gọi định kỳ. Không có phiên nào và rảnh quá `idle_shutdown_ms` thì tắt cả hai; trả `true` nếu vừa tắt.
    pub fn tick(&self) -> bool {
        let idle = {
            let a = lock(&self.activity);
            a.sessions == 0
                && self.clock.now_ms().saturating_sub(a.last_active_ms) >= self.spec.supervisor.idle_shutdown_ms
        };
        if !idle || !self.running() || self.closing() {
            return false;
        }
        self.stop(true);
        true
    }

    /// Có tiến trình phụ nào đang chạy không. Không chờ khóa nào.
    pub fn running(&self) -> bool {
        self.asr_running.load(Ordering::SeqCst) || self.llama_running.load(Ordering::SeqCst)
    }

    /// App thoát: bật cờ `closing`, ngắt lần chờ đang dở, kill tiến trình phụ đang chạy. Trả về ngay, không chờ khóa
    /// của tiến trình phụ; luồng đang dùng tiến trình phụ nhận lỗi rồi tự dọn.
    pub fn shutdown(&self) {
        self.closing.store(true, Ordering::SeqCst);
        self.wake.wake();
        let killers = std::mem::take(&mut *lock(&self.killers));
        for killer in [killers.llama, killers.asr].into_iter().flatten() {
            killer.kill();
        }
    }

    /// Giữ cách kill tiến trình vừa chạy. App đã bắt đầu thoát ([`SidecarManager::shutdown`] đã lấy hết `killers`) thì
    /// kill luôn, không giữ: kiểm `closing` dưới cùng khóa với `shutdown`, nên không tiến trình nào lọt ra.
    fn remember(&self, which: Which, killer: process::Killer) {
        let mut killers = lock(&self.killers);
        if self.closing() {
            drop(killers);
            killer.kill();
            return;
        }
        match which {
            Which::Asr => killers.asr = Some(killer),
            Which::Llama => killers.llama = Some(killer),
        }
    }

    /// Tắt cả hai: rảnh quá lâu (`idle`), hoặc app thoát. Khi app thoát, kill trước ([`SidecarManager::shutdown`]) rồi
    /// mới lấy khóa, nên không phải chờ hết lần nạp model hay request đang dở.
    pub fn stop(&self, idle: bool) {
        if !idle {
            self.shutdown();
        }
        // Bỏ `killers` cùng lúc lấy tiến trình ra khỏi slot (dưới khóa của slot), để không lần chạy mới nào xen vào giữa.
        let server = {
            let mut slot = lock(&self.llama);
            let server = slot.server.take();
            if server.is_some() {
                self.llama_running.store(false, Ordering::SeqCst);
                lock(&self.killers).llama = None;
            }
            server
        };
        if let Some(server) = server {
            drop(server);
            self.emit(SidecarEvent::Stopped {
                which: Which::Llama,
                idle,
            });
        }
        let worker = {
            let mut slot = lock(&self.asr);
            let worker = slot.worker.take();
            if worker.is_some() {
                self.asr_running.store(false, Ordering::SeqCst);
                lock(&self.killers).asr = None;
            }
            worker
        };
        if let Some(worker) = worker {
            drop(worker);
            self.emit(SidecarEvent::Stopped {
                which: Which::Asr,
                idle,
            });
        }
    }

    /// Thiết bị thật của `asr-worker` lần chạy gần nhất. Không chờ khóa của tiến trình phụ.
    pub fn asr_backend(&self) -> Option<Backend> {
        *lock(&self.backend)
    }

    fn asr_exe(&self, slot: &AsrSlot) -> PathBuf {
        match (&self.spec.asr.exe_gpu, slot.use_gpu) {
            (Some(gpu), true) => gpu.clone(),
            _ => self.spec.asr.exe_cpu.clone(),
        }
    }

    fn asr_launch(&self, slot: &AsrSlot, exe: &Path) -> AsrLaunch {
        let spec = &self.spec.asr;
        let ready_ms = if slot.first_run {
            self.spec.supervisor.first_run_ready_timeout_ms
        } else {
            self.spec.supervisor.ready_timeout_ms
        };
        AsrLaunch {
            use_gpu: slot.use_gpu,
            n_threads: self.spec.asr_config.n_threads,
            ready_timeout: Duration::from_millis(ready_ms),
            request_timeout: Duration::from_millis(self.spec.asr_config.timeout_ms),
            shutdown_grace: Duration::from_millis(self.spec.supervisor.shutdown_grace_ms),
            env: spec.env.clone(),
            ..AsrLaunch::new(exe, &spec.model, &spec.log)
        }
    }

    /// Bỏ cuộc: ghi lý do, báo app.
    fn give_up(
        &self,
        which: Which,
        gave_up: &mut Option<(GiveUpCause, String)>,
        cause: GiveUpCause,
        reason: String,
    ) -> StartError {
        *gave_up = Some((cause, reason.clone()));
        self.emit(SidecarEvent::GaveUp {
            which,
            cause,
            reason: reason.clone(),
        });
        StartError { which, cause, reason }
    }

    /// Một lần chạy `asr-worker`: `Load`, rồi `Warmup`.
    fn spawn_asr(&self, launch: &AsrLaunch) -> Result<(AsrWorker, ReadyInfo), AsrStartFailure> {
        let mut remember = |k: process::Killer| self.remember(Which::Asr, k);
        AsrWorker::spawn_with(launch, &mut remember)
            .and_then(|(mut worker, ready)| worker.warmup().map(|_| (worker, ready)))
            .map_err(|e| {
                lock(&self.killers).asr = None;
                AsrStartFailure {
                    reason: e.to_string(),
                    kind: e.kind(),
                    timed_out: e.is_timeout(),
                }
            })
    }

    /// Chạy `asr-worker` nếu chưa chạy, khởi động lại theo luật khi lỗi.
    fn start_asr(&self, slot: &mut AsrSlot) -> Result<(), StartError> {
        if self.retry_asr.swap(false, Ordering::SeqCst) && slot.gave_up.take().is_some() {
            // Người dùng bấm thử lại sau khi bỏ cuộc (với mọi lý do): bắt đầu lại từ quyết định ban đầu, kể cả GPU theo
            // `--probe`, vì nguyên nhân có thể không phải GPU (model hỏng đã được tải lại). GPU vẫn lỗi thì luật 2 lần lỗi
            // liên tiếp chuyển CPU lại (Q4-2 của review 02 lần 4). Chưa bỏ cuộc thì giữ CPU như cũ.
            slot.tracker.reset();
            let gpu = self.spec.asr.exe_gpu.is_some();
            slot.use_gpu = gpu;
            self.asr_on_cpu.store(!gpu, Ordering::SeqCst);
        }
        while slot.worker.is_none() {
            if self.closing() {
                return Err(Self::closing_error(Which::Asr));
            }
            if let Some((cause, reason)) = &slot.gave_up {
                return Err(StartError {
                    which: Which::Asr,
                    cause: *cause,
                    reason: reason.clone(),
                });
            }
            let exe = self.asr_exe(slot);
            if let Err(reason) = self.events.before_spawn(Which::Asr, &exe) {
                return Err(self.give_up(Which::Asr, &mut slot.gave_up, GiveUpCause::Tampered, reason));
            }
            ask_first_run(
                &*self.events,
                Which::Asr,
                &exe,
                &mut slot.asked_first_run,
                &mut slot.first_run,
            );
            self.emit(SidecarEvent::Starting {
                which: Which::Asr,
                first_run: slot.first_run,
            });
            let failure = match self.spawn_asr(&self.asr_launch(slot, &exe)) {
                Ok((worker, ready)) => {
                    if self.closing() {
                        drop(worker);
                        return Err(Self::closing_error(Which::Asr));
                    }
                    if self.spec.asr.require_shared && ready.decode_mode != DecodeMode::Shared {
                        let reason = "asr-worker không có chế độ giải mã B (build thiếu feature shared-encode)";
                        return Err(self.give_up(
                            Which::Asr,
                            &mut slot.gave_up,
                            GiveUpCause::NoSharedMode,
                            reason.into(),
                        ));
                    }
                    let first_run = std::mem::take(&mut slot.first_run);
                    if slot.use_gpu && !ready.backend.is_gpu() {
                        // Xin GPU mà worker chạy bằng CPU: không có GPU dùng được.
                        slot.use_gpu = false;
                        self.emit(SidecarEvent::CpuFallback { which: Which::Asr });
                    }
                    self.asr_on_cpu.store(!slot.use_gpu, Ordering::SeqCst);
                    *lock(&self.backend) = Some(ready.backend);
                    slot.worker = Some(worker);
                    self.asr_running.store(true, Ordering::SeqCst);
                    self.emit(SidecarEvent::Ready {
                        which: Which::Asr,
                        use_gpu: slot.use_gpu,
                        backend: Some(ready.backend),
                        first_run,
                    });
                    return Ok(());
                }
                Err(failure) => failure,
            };
            if self.closing() {
                return Err(Self::closing_error(Which::Asr));
            }
            if failure.kind == Some(ErrorKind::OutOfMemory) || looks_out_of_memory(&failure.reason) {
                self.emit(SidecarEvent::OutOfMemory { which: Which::Asr });
            }
            if failure.kind == Some(ErrorKind::ModelLoad) && !slot.use_gpu {
                // Model hỏng: khởi động lại không giúp gì (§9: đề nghị tải lại, kế hoạch 04).
                return Err(self.give_up(Which::Asr, &mut slot.gave_up, GiveUpCause::ModelLoad, failure.reason));
            }
            if failure.timed_out && std::mem::take(&mut slot.first_run) {
                self.first_run_timeout(Which::Asr, &slot.tracker, &failure.reason);
                continue;
            }
            self.after_asr_failure(slot, &failure.reason, true)?;
        }
        Ok(())
    }

    /// Lần đầu chạy mà quá thời gian chờ: không tính là một lần lỗi (§6.5), chạy lại với thời gian chờ thường.
    fn first_run_timeout(&self, which: Which, tracker: &RestartTracker, reason: &str) {
        let after_ms = tracker.backoff(1);
        self.emit(SidecarEvent::Restarting {
            which,
            failures: tracker.failures(),
            after_ms,
            reason: format!("lần đầu chạy quá thời gian chờ, không tính là lỗi: {reason}"),
        });
        self.clock.sleep(Duration::from_millis(after_ms), &self.wake);
    }

    /// Ghi một lần lỗi của `asr-worker`, chờ theo luật (hoặc bỏ cuộc).
    fn after_asr_failure(&self, slot: &mut AsrSlot, reason: &str, during_start: bool) -> Result<(), StartError> {
        if slot.worker.take().is_some() {
            self.asr_running.store(false, Ordering::SeqCst);
        }
        lock(&self.killers).asr = None;
        if self.closing() {
            return Err(Self::closing_error(Which::Asr));
        }
        let was_gpu = slot.use_gpu;
        match slot.tracker.on_failure(self.clock.now_ms(), was_gpu, during_start) {
            Decision::GiveUp => {
                let reason = format!(
                    "quá {} lần lỗi trong 10 phút: {reason}",
                    self.spec.supervisor.max_failures
                );
                Err(self.give_up(Which::Asr, &mut slot.gave_up, GiveUpCause::Failures, reason))
            }
            Decision::Restart { after_ms, use_gpu } => {
                if was_gpu && !use_gpu {
                    slot.use_gpu = false;
                    self.asr_on_cpu.store(true, Ordering::SeqCst);
                    self.emit(SidecarEvent::CpuFallback { which: Which::Asr });
                }
                self.emit(SidecarEvent::Restarting {
                    which: Which::Asr,
                    failures: slot.tracker.failures(),
                    after_ms,
                    reason: reason.to_string(),
                });
                self.clock.sleep(Duration::from_millis(after_ms), &self.wake);
                if self.closing() {
                    return Err(Self::closing_error(Which::Asr));
                }
                Ok(())
            }
        }
    }

    /// Chép lời một đoạn: khởi động worker nếu cần; worker chết thì khởi động lại và gửi lại đoạn một lần.
    pub fn transcribe(&self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
        if self.closing() {
            return Err(AsrFailure::Unavailable("app đang thoát".into()));
        }
        self.touch();
        let mut slot = lock(&self.asr);
        let mut last = String::new();
        for _attempt in 0..2 {
            self.start_asr(&mut slot)
                .map_err(|e| AsrFailure::Unavailable(e.reason))?;
            let worker = slot.worker.as_mut().expect("vừa khởi động");
            match worker.transcribe(req.clone()) {
                Ok(result) => {
                    slot.tracker.on_success();
                    return Ok(result);
                }
                // Hết bộ nhớ lúc chép lời (thường là bộ nhớ GPU): báo app (§9: đề xuất gói Nhẹ) và tính là một lần lỗi
                // như khi worker chết, nên 2 lần liên tiếp trên GPU thì chuyển CPU; khởi động lại rồi gửi lại đoạn.
                Err(e) if e.kind() == Some(ErrorKind::OutOfMemory) => {
                    self.emit(SidecarEvent::OutOfMemory { which: Which::Asr });
                    last = e.to_string();
                    self.after_asr_failure(&mut slot, &last, false)
                        .map_err(|e| AsrFailure::Unavailable(e.reason))?;
                }
                // Worker trả `Error` khác cho đoạn mà vẫn sống: bỏ đoạn, không khởi động lại.
                Err(e) if !e.is_crash() => return Err(AsrFailure::Dropped(e.to_string())),
                Err(e) => {
                    last = e.to_string();
                    self.after_asr_failure(&mut slot, &last, false)
                        .map_err(|e| AsrFailure::Unavailable(e.reason))?;
                }
            }
        }
        Err(AsrFailure::Dropped(format!("lỗi cả sau khi gửi lại: {last}")))
    }

    fn start_llama(&self, slot: &mut LlamaSlot) -> Result<(), StartError> {
        if self.retry_llama.swap(false, Ordering::SeqCst) && slot.gave_up.take().is_some() {
            // Như `start_asr`: thử lại từ quyết định ban đầu (`-ngl` theo `--probe`); `asr-worker` đang chạy bằng CPU thì
            // `llama-server` vẫn theo nó ngay dưới đây.
            slot.tracker.reset();
            slot.use_gpu = self.spec.asr.exe_gpu.is_some();
        }
        while slot.server.is_none() {
            if self.closing() {
                return Err(Self::closing_error(Which::Llama));
            }
            if let Some((cause, reason)) = &slot.gave_up {
                return Err(StartError {
                    which: Which::Llama,
                    cause: *cause,
                    reason: reason.clone(),
                });
            }
            let spec = &self.spec.llama;
            if let Err(reason) = self.events.before_spawn(Which::Llama, &spec.exe) {
                return Err(self.give_up(Which::Llama, &mut slot.gave_up, GiveUpCause::Tampered, reason));
            }
            ask_first_run(
                &*self.events,
                Which::Llama,
                &spec.exe,
                &mut slot.asked_first_run,
                &mut slot.first_run,
            );
            // `asr-worker` đang chạy bằng CPU thì `llama-server` chạy theo, nhưng chỉ cho lần chạy này: `asr-worker` về GPU
            // (thử lại sau khi bỏ cuộc) thì lần chạy kế tiếp của `llama-server` cũng về GPU. Báo `CpuFallback` khi lần chạy
            // này bằng CPU mà lần trước dùng GPU (hay là lần đầu).
            let gpu = slot.use_gpu && !self.asr_on_cpu.load(Ordering::SeqCst);
            if slot.use_gpu && !gpu && slot.last_gpu != Some(false) {
                self.emit(SidecarEvent::CpuFallback { which: Which::Llama });
            }
            slot.last_gpu = Some(gpu);
            self.emit(SidecarEvent::Starting {
                which: Which::Llama,
                first_run: slot.first_run,
            });
            let ready_ms = if slot.first_run {
                self.spec.supervisor.first_run_ready_timeout_ms
            } else {
                self.spec.supervisor.ready_timeout_ms
            };
            let launch = LlamaLaunch {
                use_gpu: gpu,
                extra_args: spec.extra_args.clone(),
                ready_timeout: Duration::from_millis(ready_ms),
                request_timeout: Duration::from_millis(self.spec.mt_config.request_timeout_ms),
                env: spec.env.clone(),
                ..LlamaLaunch::new(&spec.exe, &spec.model, &spec.log)
            };
            let mut remember = |k: process::Killer| self.remember(Which::Llama, k);
            match LlamaServer::spawn_with(&launch, &mut remember) {
                Ok(server) => {
                    if self.closing() {
                        drop(server);
                        return Err(Self::closing_error(Which::Llama));
                    }
                    let first_run = std::mem::take(&mut slot.first_run);
                    slot.server = Some(server);
                    self.llama_running.store(true, Ordering::SeqCst);
                    self.emit(SidecarEvent::Ready {
                        which: Which::Llama,
                        use_gpu: gpu,
                        backend: None,
                        first_run,
                    });
                }
                Err(e) => {
                    lock(&self.killers).llama = None;
                    if self.closing() {
                        return Err(Self::closing_error(Which::Llama));
                    }
                    let reason = format!("{e:#}");
                    if looks_out_of_memory(&reason) {
                        self.emit(SidecarEvent::OutOfMemory { which: Which::Llama });
                    }
                    if is_not_ready(&e) && std::mem::take(&mut slot.first_run) {
                        self.first_run_timeout(Which::Llama, &slot.tracker, &reason);
                        continue;
                    }
                    self.after_llama_failure(slot, &reason)?;
                }
            }
        }
        Ok(())
    }

    /// Ghi một lần lỗi của `llama-server`. Khác `asr-worker`: lỗi lúc khởi động không chuyển CPU ngay (llama.cpp tự dùng
    /// CPU khi không có GPU); chỉ 2 lần lỗi liên tiếp trên GPU mới chạy lại với `-ngl 0`.
    fn after_llama_failure(&self, slot: &mut LlamaSlot, reason: &str) -> Result<(), StartError> {
        if slot.server.take().is_some() {
            self.llama_running.store(false, Ordering::SeqCst);
        }
        lock(&self.killers).llama = None;
        if self.closing() {
            return Err(Self::closing_error(Which::Llama));
        }
        // Chỉ lỗi khi thật sự chạy bằng GPU mới tính vào luật chuyển CPU của riêng `llama-server`.
        let was_gpu = slot.last_gpu == Some(true);
        match slot.tracker.on_failure(self.clock.now_ms(), was_gpu, false) {
            Decision::GiveUp => {
                let reason = format!(
                    "quá {} lần lỗi trong 10 phút: {reason}",
                    self.spec.supervisor.max_failures
                );
                Err(self.give_up(Which::Llama, &mut slot.gave_up, GiveUpCause::Failures, reason))
            }
            Decision::Restart { after_ms, use_gpu } => {
                if was_gpu && !use_gpu {
                    slot.use_gpu = false;
                    slot.last_gpu = Some(false);
                    self.emit(SidecarEvent::CpuFallback { which: Which::Llama });
                }
                self.emit(SidecarEvent::Restarting {
                    which: Which::Llama,
                    failures: slot.tracker.failures(),
                    after_ms,
                    reason: reason.to_string(),
                });
                self.clock.sleep(Duration::from_millis(after_ms), &self.wake);
                if self.closing() {
                    return Err(Self::closing_error(Which::Llama));
                }
                Ok(())
            }
        }
    }

    /// Chạy một request tới `llama-server`. Server chết hoặc không còn trả lời `/health` thì tính là một lần lỗi và chờ theo
    /// luật; request này báo `Failed` (bên dịch thử lại một lần, lúc đó server đã được chạy lại).
    fn with_llama<T>(&self, f: impl FnOnce(&mut LlamaServer) -> anyhow::Result<T>) -> Result<T, MtError> {
        if self.closing() {
            return Err(MtError::Unavailable("app đang thoát".into()));
        }
        self.touch();
        let mut slot = lock(&self.llama);
        self.start_llama(&mut slot)
            .map_err(|e| MtError::Unavailable(e.reason))?;
        let server = slot.server.as_mut().expect("vừa khởi động");
        match f(server) {
            Ok(v) => {
                slot.tracker.on_success();
                Ok(v)
            }
            Err(e) => {
                let reason = format!("{e:#}");
                let dead = server.exited().is_some() || !server.healthy();
                if dead {
                    self.after_llama_failure(&mut slot, &reason)
                        .map_err(|e| MtError::Unavailable(e.reason))?;
                }
                Err(MtError::Failed(reason))
            }
        }
    }

    /// Bản giám sát của `asr-worker` cho `engine`.
    pub fn asr(self: &Arc<Self>) -> SupervisedAsr {
        SupervisedAsr(self.clone())
    }

    /// Bản giám sát của `llama-server` cho `engine` và `translate`.
    pub fn mt(self: &Arc<Self>) -> SupervisedMt {
        SupervisedMt(self.clone())
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        self.stop(false);
    }
}

pub struct SupervisedAsr(Arc<SidecarManager>);

impl Asr for SupervisedAsr {
    fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
        self.0.transcribe(req)
    }
}

pub struct SupervisedMt(Arc<SidecarManager>);

impl Mt for SupervisedMt {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        // Gọi hàm của chính `LlamaServer`, không phải `Mt::count_tokens` (cùng tên, trả `MtError`).
        self.0.with_llama(|s| LlamaServer::count_tokens(s, text))
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        self.0.with_llama(|s| LlamaServer::stream(s, req, on_delta))
    }
}
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p pipeline`
Expected:

```text
test result: ok. 117 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.24s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 11 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.53s
test result: ok. 38 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.86s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src/lib.rs (target/debug/deps/pipeline-901454d330477dd2)
     Running unittests src/bin/fake_asr_worker.rs (target/debug/deps/fake_asr_worker-b11221de58f4122f)
     Running unittests src/bin/fake_llama_server.rs (target/debug/deps/fake_llama_server-d5d453cb8d0fce77)
     Running tests/clients.rs (target/debug/deps/clients-79f5008458d238c8)
     Running tests/lifecycle.rs (target/debug/deps/lifecycle-3343c457a743e8de)
     Running tests/shutdown.rs (target/debug/deps/shutdown-8294228bcb944e13)
     Running tests/vad_reference.rs (target/debug/deps/vad_reference-c2808b28efa7e0e7)
```

- [ ] **Step 6: Clippy (cả target Windows) và định dạng**

Run:
```bash
cargo clippy -p pipeline --all-targets -- -D warnings
RC_x86_64_pc_windows_msvc=$PWD/scripts/fake-llvm-rc PKG_CONFIG_x86_64_pc_windows_msvc=$PWD/scripts/fake-pkg-config \
  PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1 \
  cargo clippy -p pipeline --target x86_64-pc-windows-msvc --all-targets -- -D warnings
cargo fmt --all -- --check
```
Expected: không có cảnh báo, `cargo fmt` không in gì. Dòng cuối của lệnh thứ hai:

```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.43s
```

- [ ] **Step 7: Commit**

```bash
git add crates/pipeline/src/asr_client.rs \
  crates/pipeline/src/bin/fake_asr_worker.rs \
  crates/pipeline/src/bin/fake_llama_server.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/llama.rs \
  crates/pipeline/src/process.rs \
  crates/pipeline/src/supervisor.rs \
  crates/pipeline/tests/clients.rs \
  crates/pipeline/tests/lifecycle.rs
git commit -m "feat(pipeline): giám sát hai tiến trình phụ: khởi động lại, chuyển CPU, tắt khi rảnh (Đ2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Phần client và giám sát xong ở đây. Đi tiếp `docs/superpowers/plans/2026-10-01-giai-doan-1-02b-pipeline-engine.md`.
