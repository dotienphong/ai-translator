# Gõ dịch 02: luồng dịch, lệnh IPC, phân quyền — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phía Rust của Gõ dịch chạy đủ, chưa cần cửa sổ thật: cửa sổ `compose` xin dịch, nhận bản dịch hiện dần qua sự kiện, xin dán (chỉ dán chữ phía Rust đã lưu), đóng, đổi chiều cao, mở trang Trợ năng, chuyển sang "chỉ chép", mở cửa sổ chính ở đúng màn hình khi có lỗi. Tiến trình phụ được chuẩn bị đúng thứ tự VRAM. Ba cửa sổ chỉ gọi được lệnh của mình.

**Architecture:** `compose/worker.rs` dịch từng dòng bằng `pipeline::translate::translate`. `compose/mod.rs` giữ trạng thái `Compose` (yêu cầu gần nhất, cờ hủy, chữ để dán, hàng đợi của một luồng dịch nền) và gọi hệ điều hành qua trait `Native`. Bản thật của `Native` ở kế hoạch 03; ở đây chỉ có bản giả `test_support::FakeNative`. `session::with_compose_mt` chuẩn bị hai tiến trình phụ như `prewarm` rồi đưa bộ dịch cho Gõ dịch. Tám lệnh `compose_*` chỉ cửa sổ `compose` gọi được (`capabilities/compose.json`).

**Tech Stack:** Rust 2024, Tauri 2.12 (`MockRuntime` cho test), serde. Không thêm crate.

**Spec:** `docs/superpowers/specs/2026-10-17-go-dich-design.md` §1.2, §1.3, §1.5, §2.2, §3.2–§3.4, §3.6, §4.1, §4.2, §5, §6. Tổng quan và quy tắc chung: `docs/superpowers/plans/2026-10-17-go-dich-00-tong-quan.md` (đọc trước). Cần kế hoạch 01 đã xong.

**Quy tắc chung:** như mục "Quy tắc chung cho mọi kế hoạch" của kế hoạch 00. Mã ở đây đã chạy thật ở commit `2fddb55` của nhánh `go-dich-proto`.

## Cấu trúc file

| File | Việc |
|---|---|
| Create `src-tauri/src/compose/worker.rs` | Dịch từng dòng: đếm token trước, dịch lần lượt, hủy, thử lại |
| Modify `src-tauri/src/compose/mod.rs` | Trait `Native`, trạng thái `Compose`, kiểu gửi giao diện, mở/đóng/dịch/dán và việc của các lệnh |
| Create `src-tauri/src/compose/tests.rs` | Test cấp app qua lệnh của cửa sổ `compose` |
| Modify `src-tauri/src/session.rs` | `with_compose_mt`, `SessionDeps::sidecars_running`, bộ đếm `composing`, `wait_for_prewarm` chờ cả Gõ dịch |
| Modify `src-tauri/src/events.rs` | `compose://open`, `compose://loading`, `compose://delta`, `compose://done` (chỉ tới cửa sổ `compose`) |
| Modify `src-tauri/src/errors.rs`, `src-tauri/src/diagnostics/mod.rs` | `COPY_FAILED`, không gửi báo cáo lỗi |
| Modify `src-tauri/src/system.rs` | `SystemOpener::open_accessibility_settings`, `ACCESSIBILITY_URL` |
| Modify `src-tauri/src/commands.rs`, `src-tauri/build.rs` | Tám lệnh, `COMPOSE_COMMANDS`, app manifest |
| Create `src-tauri/capabilities/compose.json` | Quyền của cửa sổ `compose` |
| Modify `src-tauri/src/acl_tests.rs` | Danh sách cố định của `compose`, chặn chéo giữa ba cửa sổ, test trang Trợ năng |
| Modify `src-tauri/src/test_support.rs` | `FakeNative`, `compose_calls`, `Compose` trong app giả, `FakeSystem`, `FakeDeps::sidecars_running`, `all_logs` |

Thứ tự task: mỗi task kết thúc ở trạng thái biên dịch được và mọi test xanh. Hàm `with_compose_mt` (Task 3) và trạng thái `Compose` (Task 4) chỉ test được qua lệnh của cửa sổ `compose`, nên test của chúng nằm ở Task 7, sau khi có lệnh (Task 5) và quyền (Task 6).

---

### Task 0: Kiểm nhánh và mốc xuất phát

**Files:** không sửa file.

- [ ] **Step 1: Kiểm nhánh và kế hoạch 01**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git status --short && git log --oneline -8 | grep -c 'go-dich'
```
Expected: `go-dich`, không có file đổi, có các commit `feat(go-dich): …` của kế hoạch 01.

- [ ] **Step 2: Chạy mốc**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm build 2>&1 | tail -1 && cargo test --locked -p meeting-translator --lib 2>&1 | grep 'test result'
```
Expected: `✓ built`, `test result: ok.` với `passed` = N0 + 16 (bản 2026-10-17: 659). **Ghi số này là N1.** Có test đỏ thì dừng và báo.

---

### Task 1: Dịch từng dòng (`compose/worker.rs`)

**Files:**
- Create: `src-tauri/src/compose/worker.rs`
- Modify: `src-tauri/src/compose/mod.rs`

Spec §3.3: tách chữ gõ theo dòng; dòng chỉ có khoảng trắng giữ nguyên; mỗi dòng có chữ là một `Job` (không ngữ cảnh, không thuật ngữ) dịch bằng đúng `pipeline::translate::translate` của phụ đề (cùng prompt, hậu xử lý, ngưỡng "bản dịch quá dài", một lần thử lại). Mọi dòng được đếm token **trước** khi dịch dòng nào (quá 400 token thì báo `composeTooLong`, không dịch dở). Một dòng hỏng cả hai lần thì cả yêu cầu báo `composeFailed`. Cờ hủy được kiểm trước mỗi request và ở mỗi gói chữ.

Hậu xử lý của `translate` giữ khoảng trắng cuối mỗi gói chữ lại tới gói sau (để không còn khoảng trắng thừa ở cuối câu), nên các gói `Delta` có dạng `"XIN"`, `" CHÀO"`.

- [ ] **Step 1: Khai module**

Trong `src-tauri/src/compose/mod.rs`, tìm dòng (duy nhất):

```rust
pub mod target;
```

thay bằng:

```rust
pub mod target;
pub mod worker;
```

- [ ] **Step 2: Viết test trước (đỏ)**

Tạo `src-tauri/src/compose/worker.rs` **chỉ với phần đầu và khối test** (hàm thêm ở Step 4). Bộ dịch giả `UpperMt` "dịch" bằng cách viết hoa phần chữ sau dòng trống cuối của prompt:

```rust
//! Dịch chữ của ô soạn (spec 2026-10-17-go-dich §3.3) bằng đúng hàm dịch của phụ đề (`pipeline::translate::translate`): cùng
//! mẫu prompt, tham số sinh, hậu xử lý, ngưỡng "bản dịch quá dài" và lần thử lại (§6.5 của spec gốc). Không có ngữ cảnh, không
//! có thuật ngữ (spec §0: từ điển thuật ngữ hiện chỉ có một chiều, cho phụ đề).

use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, Ordering};

use pipeline::config::MtConfig;
use pipeline::prompt::Lang as MtLang;
use pipeline::translate::{self, Event, Job, Mt, MtError, Outcome};

use crate::errors;

#[cfg(test)]
mod tests {
    use pipeline::llama::{ChatRequest, StreamEnd};

    use super::*;

    /// Bộ dịch giả: "dịch" bằng cách viết hoa phần chữ sau dòng trống cuối của prompt (mẫu prompt kết thúc bằng `\n\n{text}`),
    /// stream từng từ. Dòng có chữ `HONG` thì mọi lần thử đều ra rỗng (hậu xử lý báo lỗi); dòng có chữ `SAP` thì server không
    /// dùng được nữa; `cancel_after` bật cờ hủy sau chừng ấy request.
    struct UpperMt<'a> {
        requests: usize,
        cancel_after: Option<(usize, &'a AtomicBool)>,
        counted: Vec<String>,
    }

    impl<'a> UpperMt<'a> {
        fn new() -> Self {
            Self {
                requests: 0,
                cancel_after: None,
                counted: Vec::new(),
            }
        }
    }

    impl Mt for UpperMt<'_> {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            self.counted.push(text.to_string());
            if text.contains("SAP") {
                return Err(MtError::Unavailable("sập".into()));
            }
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            req: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.requests += 1;
            if let Some((after, flag)) = self.cancel_after
                && self.requests > after
            {
                flag.store(true, Ordering::SeqCst);
            }
            let source = req.prompt.rsplit("\n\n").next().unwrap_or_default();
            let text = if source.contains("HONG") {
                String::new()
            } else {
                source.to_uppercase()
            };
            let words: Vec<String> = text.split_inclusive(' ').map(str::to_string).collect();
            for w in &words {
                if on_delta(w).is_break() {
                    break;
                }
            }
            Ok(StreamEnd {
                text: text.clone(),
                first_token_ms: 1.0,
                total_ms: 2.0,
                finish_reason: Some("stop".into()),
                completion_tokens: Some(words.len()),
                chunks: words.len(),
                cancelled: false,
            })
        }
    }

    fn run(mt: &mut UpperMt, text: &str, cancel: &AtomicBool) -> (Result<String, Stop>, Vec<String>) {
        let mut pieces = Vec::new();
        let result = translate_text(
            mt,
            &MtConfig::default(),
            text,
            MtLang::Vi,
            MtLang::En,
            cancel,
            &mut |piece| {
                pieces.push(match piece {
                    Piece::Delta { line, text } => format!("{line}:{text}"),
                    Piece::Retry { line } => format!("{line}:retry"),
                })
            },
        );
        (result, pieces)
    }

    #[test]
    fn each_line_is_translated_alone_and_blank_lines_are_kept() {
        let mut mt = UpperMt::new();
        let (result, pieces) = run(&mut mt, "xin chào\n\n  hẹn gặp lại  \n", &AtomicBool::new(false));
        assert_eq!(result, Ok("XIN CHÀO\n\nHẸN GẶP LẠI\n".to_string()));
        // Hậu xử lý giữ khoảng trắng cuối gói lại, tới gói sau mới hiện (§6.5: không để khoảng trắng thừa ở cuối).
        assert_eq!(pieces, ["0:XIN", "0: CHÀO", "2:HẸN", "2: GẶP", "2: LẠI"]);
        assert_eq!(mt.requests, 2, "dòng trống không gửi request");
    }

    #[test]
    fn every_line_is_counted_before_any_is_translated() {
        let mut mt = UpperMt::new();
        let long = vec!["từ"; MAX_LINE_TOKENS + 1].join(" ");
        let (result, pieces) = run(&mut mt, &format!("dòng đầu\n{long}"), &AtomicBool::new(false));
        assert_eq!(result, Err(Stop::Failed(errors::COMPOSE_TOO_LONG)));
        assert!(pieces.is_empty(), "không dịch dở dòng nào");
        assert_eq!(mt.requests, 0);
        let exact = vec!["từ"; MAX_LINE_TOKENS].join(" ");
        assert!(run(&mut UpperMt::new(), &exact, &AtomicBool::new(false)).0.is_ok());
    }

    #[test]
    fn a_failed_line_fails_the_whole_text_without_the_source() {
        let (result, pieces) = run(&mut UpperMt::new(), "ổn\nHONG", &AtomicBool::new(false));
        assert_eq!(result, Err(Stop::Failed(errors::COMPOSE_FAILED)));
        assert_eq!(
            pieces,
            ["0:ỔN", "1:retry"],
            "lần đầu hỏng thì báo thử lại cho đúng dòng"
        );
        let (result, _) = run(&mut UpperMt::new(), "SAP", &AtomicBool::new(false));
        assert_eq!(result, Err(Stop::Failed(errors::COMPOSE_UNAVAILABLE)));
    }

    #[test]
    fn a_cancel_stops_before_the_next_request() {
        let cancel = AtomicBool::new(true);
        let mut mt = UpperMt::new();
        assert_eq!(run(&mut mt, "một\nhai", &cancel).0, Err(Stop::Cancelled));
        assert_eq!(mt.requests, 0);
        let cancel = AtomicBool::new(false);
        let mut mt = UpperMt::new();
        mt.cancel_after = Some((1, &cancel));
        let (result, pieces) = run(&mut mt, "một\nhai", &cancel);
        assert_eq!(result, Err(Stop::Cancelled));
        assert_eq!(pieces, ["0:MỘT"], "dòng hai không hiện chữ nào");
    }

    #[test]
    fn whitespace_only_text_needs_no_request() {
        let mut mt = UpperMt::new();
        assert_eq!(
            run(&mut mt, " \n\t", &AtomicBool::new(false)).0,
            Ok(" \n\t".to_string())
        );
        assert!(mt.counted.is_empty() && mt.requests == 0);
    }
}
```

- [ ] **Step 3: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib compose::worker 2>&1 | grep -E '^error' | head -3
```
Expected: `cannot find function translate_text` (hay `cannot find type Stop`, `Piece`).

- [ ] **Step 4: Viết hàm**

Trong `src-tauri/src/compose/worker.rs`, tìm đoạn (duy nhất):

```rust
use crate::errors;

#[cfg(test)]
```

thay bằng:

```rust
use crate::errors;

/// Số token tối đa của một dòng (spec §1.2): prompt, dòng gốc và bản dịch (`max_tokens` tối đa 512) phải nằm gọn trong ngữ
/// cảnh 2048 token của `llama-server` (§6.5).
pub const MAX_LINE_TOKENS: usize = 400;

/// Dịch dừng giữa chừng.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stop {
    /// Có yêu cầu mới hơn, hay ô soạn đã đóng: không báo gì cho giao diện.
    Cancelled,
    /// Mã lỗi cho giao diện (`error.<mã>`).
    Failed(&'static str),
}

/// Việc trong lúc dịch, cho sự kiện `compose://delta`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Piece<'a> {
    /// Phần chữ dịch mới của dòng `line` (đánh số theo mọi dòng của chữ gõ, kể cả dòng trống).
    Delta { line: usize, text: &'a str },
    /// Lần dịch đầu của dòng `line` lỗi, sắp thử lại: bỏ phần chữ đã hiện của dòng đó.
    Retry { line: usize },
}

/// Dịch `text` từ `src` sang `tgt`. Tách theo `\n`: dòng chỉ có khoảng trắng giữ nguyên; dòng có chữ được dịch riêng (bỏ khoảng
/// trắng đầu và cuối dòng), lần lượt; kết quả ghép lại bằng đúng các dấu xuống dòng gốc. Mọi dòng được đếm token trước khi dịch
/// dòng nào: có dòng quá [`MAX_LINE_TOKENS`] thì báo `composeTooLong` ngay, không dịch dở.
///
/// Cờ `cancel` được kiểm trước mỗi request và ở mỗi gói chữ (cách hủy của bản dịch tạm, §6.5).
pub fn translate_text(
    mt: &mut dyn Mt,
    cfg: &MtConfig,
    text: &str,
    src: MtLang,
    tgt: MtLang,
    cancel: &AtomicBool,
    on_piece: &mut dyn FnMut(Piece),
) -> Result<String, Stop> {
    let lines: Vec<&str> = text.split('\n').collect();
    for line in lines.iter().map(|l| l.trim()).filter(|l| !l.is_empty()) {
        if cancel.load(Ordering::SeqCst) {
            return Err(Stop::Cancelled);
        }
        match mt.count_tokens(line) {
            Ok(n) if n > MAX_LINE_TOKENS => return Err(Stop::Failed(errors::COMPOSE_TOO_LONG)),
            Ok(_) => {}
            Err(MtError::Unavailable(_)) => return Err(Stop::Failed(errors::COMPOSE_UNAVAILABLE)),
            Err(MtError::Failed(_)) => return Err(Stop::Failed(errors::COMPOSE_FAILED)),
        }
    }
    let mut out = Vec::with_capacity(lines.len());
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            out.push((*line).to_string());
            continue;
        }
        let job = Job {
            text: trimmed,
            src,
            tgt,
            context: None,
            terms: &[],
            cancel: Some(cancel),
        };
        let outcome = translate::translate(mt, &job, cfg, &mut |event| {
            on_piece(match event {
                Event::Delta(text) => Piece::Delta { line: i, text },
                Event::Retry => Piece::Retry { line: i },
            });
            ControlFlow::Continue(())
        });
        match outcome {
            Outcome::Done(t) => out.push(t.text),
            Outcome::Cancelled => return Err(Stop::Cancelled),
            Outcome::Failed { .. } => return Err(Stop::Failed(errors::COMPOSE_FAILED)),
            Outcome::Unavailable(_) => return Err(Stop::Failed(errors::COMPOSE_UNAVAILABLE)),
        }
    }
    Ok(out.join("\n"))
}

#[cfg(test)]
```

- [ ] **Step 5: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib compose::worker 2>&1 | grep -E 'test result|FAILED'
```
Expected: `test result: ok. 5 passed`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/src/compose && git commit -q -m "feat(go-dich): dịch chữ của ô soạn từng dòng bằng hàm dịch của phụ đề" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: Mã `copyFailed` và trang Trợ năng

**Files:**
- Modify: `src-tauri/src/errors.rs`, `src-tauri/src/diagnostics/mod.rs`, `src-tauri/src/system.rs`, `src-tauri/src/test_support.rs`

`copyFailed` (không ghi được clipboard) dùng lại câu `error.copyFailed` sẵn có của giao diện (QĐ8 của kế hoạch 00) và không gửi báo cáo lỗi. Trang Trợ năng của System Settings mở qua `SystemOpener` như mọi việc mở ra ngoài app, để test chỉ chạm bản giả (spec §4.2).

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src-tauri/src/errors.rs`, khối test `every_error_code_has_ui_text`, tìm đoạn (duy nhất):

```rust
                COMPOSE_TOO_LONG,
                COMPOSE_FAILED,
                COMPOSE_UNAVAILABLE,
            ]
```

thay bằng:

```rust
                COMPOSE_TOO_LONG,
                COMPOSE_FAILED,
                COMPOSE_UNAVAILABLE,
                COPY_FAILED,
            ]
```

Trong `src-tauri/src/system.rs`, khối `mod tests`, tìm đoạn (duy nhất):

```rust
            self.push("open_audio_permission_settings")
        }
```

thay bằng:

```rust
            self.push("open_audio_permission_settings")
        }
        fn open_accessibility_settings(&self) -> Result<(), String> {
            self.push("open_accessibility_settings")
        }
```

Cùng file, tìm đoạn (duy nhất):

```rust
            https_only(AUDIO_PERMISSION_URL).is_err(),
            "link ngoài không mở được trang này"
        );
```

thay bằng:

```rust
            https_only(AUDIO_PERMISSION_URL).is_err(),
            "link ngoài không mở được trang này"
        );
        let url = Url::parse(ACCESSIBILITY_URL).unwrap();
        assert_eq!(url.scheme(), "x-apple.systempreferences");
        assert!(url.as_str().ends_with("?Privacy_Accessibility"));
        assert!(https_only(ACCESSIBILITY_URL).is_err());
```

Cùng file, tìm dòng (duy nhất):

```rust
        assert!(open_audio_permission_settings(app).is_err());
```

thay bằng:

```rust
        assert!(open_audio_permission_settings(app).is_err());
        assert!(open_accessibility_settings(app).is_err());
```

Cùng file, tìm dòng (duy nhất):

```rust
        open_audio_permission_settings(app).unwrap();
```

thay bằng:

```rust
        open_audio_permission_settings(app).unwrap();
        open_accessibility_settings(app).unwrap();
```

Cùng file, tìm đoạn (duy nhất):

```rust
                "open_audio_permission_settings",
            ]
```

thay bằng:

```rust
                "open_audio_permission_settings",
                "open_accessibility_settings",
            ]
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib system 2>&1 | grep -E '^error' | head -4
```
Expected: lỗi biên dịch `cannot find value COPY_FAILED`, `method open_accessibility_settings is not a member of trait`, `cannot find value ACCESSIBILITY_URL`.

- [ ] **Step 3: Mã lỗi**

Trong `src-tauri/src/errors.rs`, tìm đoạn (duy nhất):

```rust
/// `llama-server` không dùng được nữa (đã khởi động lại quá giới hạn, §6.5).
pub const COMPOSE_UNAVAILABLE: &str = "composeUnavailable";
```

thay bằng:

```rust
/// `llama-server` không dùng được nữa (đã khởi động lại quá giới hạn, §6.5).
pub const COMPOSE_UNAVAILABLE: &str = "composeUnavailable";
/// Không ghi được bản dịch vào clipboard. Cùng mã với lỗi sao chép của giao diện (`error.copyFailed`).
pub const COPY_FAILED: &str = "copyFailed";
```

Trong `src-tauri/src/diagnostics/mod.rs`, tìm đoạn (duy nhất):

```rust
    errors::COMPOSE_UNAVAILABLE,
];
```

thay bằng:

```rust
    errors::COMPOSE_UNAVAILABLE,
    errors::COPY_FAILED,
];
```

- [ ] **Step 4: `open_accessibility_settings`**

Trong `src-tauri/src/system.rs`, tìm dòng (duy nhất):

```rust
    fn open_audio_permission_settings(&self) -> Result<(), String>;
```

thay bằng:

```rust
    fn open_audio_permission_settings(&self) -> Result<(), String>;
    /// macOS: System Settings › Privacy & Security › Accessibility, quyền Gõ dịch cần để tự dán (spec 2026-10-17-go-dich §4.2).
    fn open_accessibility_settings(&self) -> Result<(), String>;
```

Cùng file, tìm dòng (duy nhất):

```rust
pub const AUDIO_PERMISSION_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture";
```

thay bằng:

```rust
pub const AUDIO_PERMISSION_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture";
/// macOS: trang "Accessibility" của System Settings (quyền gửi phím dán vào app khác, spec 2026-10-17-go-dich §4.2).
pub const ACCESSIBILITY_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
```

Cùng file, tìm đoạn (duy nhất):

```rust
            .open_url(AUDIO_PERMISSION_URL, None::<&str>)
            .map_err(|e| e.to_string())
    }
```

thay bằng:

```rust
            .open_url(AUDIO_PERMISSION_URL, None::<&str>)
            .map_err(|e| e.to_string())
    }

    fn open_accessibility_settings(&self) -> Result<(), String> {
        if !cfg!(target_os = "macos") {
            return Err("chỉ có trên macOS".into());
        }
        self.0
            .opener()
            .open_url(ACCESSIBILITY_URL, None::<&str>)
            .map_err(|e| e.to_string())
    }
```

Cùng file, tìm đoạn (duy nhất):

```rust
    with(app, |s| s.open_audio_permission_settings())
}
```

thay bằng:

```rust
    with(app, |s| s.open_audio_permission_settings())
}

pub fn open_accessibility_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with(app, |s| s.open_accessibility_settings())
}
```

Trong `src-tauri/src/test_support.rs`, tìm đoạn (duy nhất):

```rust
        self.push("open_audio_permission_settings".into())
    }
}
```

thay bằng:

```rust
        self.push("open_audio_permission_settings".into())
    }
    fn open_accessibility_settings(&self) -> Result<(), String> {
        self.push("open_accessibility_settings".into())
    }
}
```

- [ ] **Step 5: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib -- system:: every_error_code 2>&1 | grep -E 'test result|FAILED'
```
Expected: `test result: ok.`, không có `FAILED`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/src/errors.rs src-tauri/src/diagnostics/mod.rs src-tauri/src/system.rs src-tauri/src/test_support.rs && git commit -q -m "feat(go-dich): mã copyFailed và lệnh mở trang Trợ năng qua SystemOpener" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: Tiến trình phụ cho Gõ dịch (`session::with_compose_mt`)

**Files:**
- Modify: `src-tauri/src/session.rs`, `src-tauri/src/test_support.rs`

Spec §3.4 và QĐ2 của kế hoạch 00: client dịch (`SupervisedMt`) tự chạy `llama-server` một mình khi nó đang tắt. Nếu Gõ dịch dùng thẳng client dịch, sau 10 phút rảnh lần dịch kế sẽ chạy `llama-server` trước `asr-worker`, sai thứ tự VRAM của §5. Vì vậy mỗi lần dịch đều đi qua `with_compose_mt`:
1. đếm việc của Gõ dịch (`composing`) **trước** khi kiểm `ModelService::busy`, để `release_models` (trước khi xóa hay tải đè model) không bỏ sót lần nào;
2. app đang thoát thì báo `composeUnavailable`; đang tải, xóa hay kiểm gói model thì báo `modelsBusy`;
3. phiên đang bắt đầu hay đang chạy thì chuẩn bị theo gói của phiên đó;
4. chưa có tiến trình phụ nào chạy thì gọi `on_loading` (giao diện hiện "Đang nạp model…");
5. `prepare` (asr-worker trước, rồi llama-server), rồi đưa bộ dịch và cấu hình dịch cho `f`.

Test của phần này nằm ở Task 7 (`a_newer_request_replaces_the_older_one`, `a_missing_model_reaches_the_compose_window`, `releasing_models_waits_for_a_compose_request`, `every_request_prepares_the_sidecars_first`), vì cần lệnh của cửa sổ `compose`. Ở task này chỉ kiểm không hỏng gì.

- [ ] **Step 1: Import, trait, trường đếm**

Trong `src-tauri/src/session.rs`, tìm dòng (duy nhất):

```rust
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
```

thay bằng:

```rust
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
```

Cùng file, tìm dòng (duy nhất):

```rust
use pipeline::config::PipelineConfig;
```

thay bằng:

```rust
use pipeline::config::{MtConfig, PipelineConfig};
```

Cùng file, tìm đoạn (duy nhất):

```rust
    fn streaming_supported(&self) -> bool {
        true
    }
}
```

thay bằng:

```rust
    fn streaming_supported(&self) -> bool {
        true
    }
    /// Có tiến trình phụ nào đang chạy không. Gõ dịch báo "Đang nạp model…" khi chưa (spec 2026-10-17-go-dich §3.4).
    fn sidecars_running(&self) -> bool {
        true
    }
}
```

Cùng file, tìm đoạn (duy nhất):

```rust
    pack: Mutex<Option<String>>,
}
```

thay bằng:

```rust
    pack: Mutex<Option<String>>,
    /// Số việc của Gõ dịch đang dùng tiến trình phụ ([`with_compose_mt`]). `release_models` chờ các việc này như chờ lần chạy
    /// sẵn.
    composing: AtomicUsize,
}
```

Cùng file, tìm đoạn (duy nhất):

```rust
            pack: Mutex::new(None),
        }
```

thay bằng:

```rust
            pack: Mutex::new(None),
            composing: AtomicUsize::new(0),
        }
```

- [ ] **Step 2: `with_compose_mt`**

Cùng file, tìm dòng (duy nhất):

```rust
/// Thoát app (Thoát ở menu khay, §4.3). Không chờ khóa của tiến trình phụ (N1 của review 02c):
```

thay bằng:

```rust
/// Chạy `f` với bộ dịch của Gõ dịch và cấu hình dịch của gói đang dùng (spec 2026-10-17-go-dich §3.4). Trước đó chuẩn bị hai
/// tiến trình phụ như [`prewarm`]: `asr-worker` trước rồi `llama-server`, đúng thứ tự VRAM của §5. Client dịch tự chạy
/// `llama-server` khi nó đang tắt, nên không được dùng khi chưa chuẩn bị. Chưa có tiến trình phụ nào chạy (sắp phải nạp model)
/// thì gọi `on_loading` trước khi chuẩn bị.
///
/// Phiên đang bắt đầu hay đang chạy thì chuẩn bị theo gói của phiên đó, để không dựng bộ tiến trình phụ thứ hai cho gói vừa đổi
/// (như `prewarm`). Trong suốt việc này `release_models` chờ, như chờ lần chạy sẵn: đếm trước rồi mới kiểm
/// `ModelService::busy`, nên không bỏ sót lần nào. Chặn tới khi xong: gọi từ luồng nền.
pub fn with_compose_mt<R: Runtime, T>(
    app: &AppHandle<R>,
    on_loading: impl FnOnce(),
    f: impl FnOnce(&mut dyn Mt, &MtConfig) -> T,
) -> Result<T, CommandError> {
    let Some(session) = app.try_state::<Session>() else {
        return Err(CommandError::new(errors::COMPOSE_UNAVAILABLE, None, "chưa có phiên"));
    };
    session.composing.fetch_add(1, Ordering::SeqCst);
    let _done = Composing(&session.composing);
    if session.closing.load(Ordering::SeqCst) {
        return Err(CommandError::new(errors::COMPOSE_UNAVAILABLE, None, "app đang thoát"));
    }
    if app.try_state::<Arc<ModelService>>().is_some_and(|m| m.busy()) {
        return Err(CommandError::new(
            errors::MODELS_BUSY,
            None,
            "đang tải, xóa hay kiểm gói model",
        ));
    }
    let state = app.state::<AppState>();
    let mut settings = state.settings();
    let in_session = matches!(state.status().session, SessionStatus::Starting | SessionStatus::Running);
    if in_session {
        settings.model_tier = session.pack.lock().unwrap().clone();
    }
    if !session.deps.sidecars_running() {
        on_loading();
    }
    if let Err(e) = session.deps.prepare(&settings) {
        // Như lần chạy sẵn: bỏ "Đang nạp model…" ở cửa sổ chính. Phiên đang bắt đầu thì để phiên tự báo.
        if !in_session {
            state.update_status(|s| s.loading = None);
            changed(app);
        }
        return Err(e);
    }
    let mut mt = session.deps.mt();
    Ok(f(mt.as_mut(), &session.deps.pipeline_config().mt))
}

/// Bớt số việc của Gõ dịch khi [`with_compose_mt`] xong, kể cả khi `f` panic.
struct Composing<'a>(&'a AtomicUsize);

impl Drop for Composing<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Thoát app (Thoát ở menu khay, §4.3). Không chờ khóa của tiến trình phụ (N1 của review 02c):
```

- [ ] **Step 3: `release_models` chờ cả Gõ dịch**

Cùng file, tìm đoạn (duy nhất):

```rust
/// Chờ lần chạy sẵn đang nạp dở xong (tối đa [`PREWARM_WAIT`], hay tới khi app thoát). Trước khi tắt tiến trình phụ để
/// tải đè hay xóa model: nếu không, lần chạy sẵn còn chạy `llama-server` sau lần tắt (Q-A của review 04 lần 2). Người
/// gọi đã đặt việc đụng tới gói đang dùng (`ModelService::busy`), nên không lần chạy sẵn mới nào bắt đầu trong lúc chờ.
fn wait_for_prewarm(session: &Session) {
    let since = Instant::now();
    while session.is_prewarming() && !session.closing.load(Ordering::SeqCst) && since.elapsed() < PREWARM_WAIT {
```

thay bằng:

```rust
/// Chờ lần chạy sẵn đang nạp dở và các việc của Gõ dịch đang dở xong (tối đa [`PREWARM_WAIT`], hay tới khi app thoát).
/// Trước khi tắt tiến trình phụ để tải đè hay xóa model: nếu không, lần chạy sẵn (hay một lần dịch của Gõ dịch) còn chạy
/// `llama-server` sau lần tắt (Q-A của review 04 lần 2). Người gọi đã đặt việc đụng tới gói đang dùng (`ModelService::busy`),
/// nên không lần chạy sẵn hay việc Gõ dịch mới nào bắt đầu trong lúc chờ.
fn wait_for_prewarm(session: &Session) {
    let since = Instant::now();
    let busy = || session.is_prewarming() || session.composing.load(Ordering::SeqCst) > 0;
    while busy() && !session.closing.load(Ordering::SeqCst) && since.elapsed() < PREWARM_WAIT {
```

- [ ] **Step 4: `sidecars_running` của bản thật và bản giả**

Cùng file, tìm đoạn (duy nhất):

```rust
    fn models_in_use(&self) -> Vec<PathBuf> {
        let live = self.live.lock().unwrap();
```

thay bằng:

```rust
    fn sidecars_running(&self) -> bool {
        self.current().is_some_and(|m| m.running())
    }

    fn models_in_use(&self) -> Vec<PathBuf> {
        let live = self.live.lock().unwrap();
```

Trong `src-tauri/src/test_support.rs`, tìm đoạn (duy nhất):

```rust
        self.calls.lock().unwrap().push("streaming_supported");
        !self.slow_machine.load(Ordering::SeqCst)
    }
}
```

thay bằng:

```rust
        self.calls.lock().unwrap().push("streaming_supported");
        !self.slow_machine.load(Ordering::SeqCst)
    }

    /// Tiến trình phụ giả "chạy" từ lần `prepare` thành công đầu tiên.
    fn sidecars_running(&self) -> bool {
        self.prepare_error.is_none() && *self.prepares.lock().unwrap() > 0
    }
}
```

- [ ] **Step 5: Chạy, không hỏng gì**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib session 2>&1 | grep -E 'test result|FAILED|^error'
```
Expected: `test result: ok.`, không có `FAILED`, không có `error`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/src/session.rs src-tauri/src/test_support.rs && git commit -q -m "feat(go-dich): chuẩn bị tiến trình phụ đúng thứ tự cho mỗi lần dịch của Gõ dịch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: Trạng thái `Compose`, trait `Native`, sự kiện

**Files:**
- Modify: `src-tauri/src/compose/mod.rs`, `src-tauri/src/events.rs`, `src-tauri/src/test_support.rs`

Phần lõi của ô soạn (spec §1.2, §1.3, §3.3, §4.1, §4.2, §5):
- `open`: gửi `compose://open` kèm `ComposeView`, hiện, rồi chạy sẵn tiến trình phụ (trừ khi bản quyền đang chặn: QĐ3 của kế hoạch 00).
- `close`: hủy yêu cầu đang chạy rồi ẩn. `toggle`: đang mở thì đóng, đang đóng thì mở.
- `request`: từ chối chữ quá 4000 ký tự; hủy yêu cầu cũ; tăng số yêu cầu; gửi cho **một** luồng dịch nền (tạo ở lần đầu). Luồng đó bỏ qua yêu cầu đã bị hủy và bỏ kết quả của yêu cầu không còn là mới nhất.
- `submit`: chỉ dán chữ phía Rust đã lưu cho **đúng** yêu cầu gần nhất đã xong; không nhận chữ từ giao diện (spec §3.6). macOS bật tự dán mà chưa có quyền Trợ năng: đã chép, ô soạn **không** đóng, trả `needsPermission`.
- Log chỉ có số liệu (spec §6): `Gõ dịch: {ký tự} ký tự, {dòng} dòng, {ms} ms, {kết quả}`.

Bản thật của `Native` là kế hoạch 03; ở đây app giả dùng `FakeNative`.

- [ ] **Step 1: Viết `compose/mod.rs`**

Thay toàn bộ `src-tauri/src/compose/mod.rs` bằng (khai `mod tests;` ở Task 7, khi có file test):

```rust
//! Gõ dịch (spec 2026-10-17-go-dich-design.md): ô soạn nổi, người dùng gõ tin nhắn bằng tiếng của mình, app dịch rồi dán bản
//! dịch vào ô nhập của app đang dùng.
//!
//! - `target`: ngôn ngữ đích tự động, "tiếng người bên kia" (spec §2.1).
//! - `detect`: nhận diện ngôn ngữ của chữ gõ theo chữ viết (spec §2.2).
//! - `worker`: dịch từng dòng bằng đúng hàm dịch của phụ đề (spec §3.3).
//! - Phần ở đây: trạng thái của ô soạn, yêu cầu dịch (một luồng nền; yêu cầu mới hủy yêu cầu cũ), dán (spec §4), và việc của
//!   các lệnh `compose_*` (cửa sổ `compose`, spec §3.6). Thao tác trên cửa sổ và với hệ điều hành (hiện, ẩn, clipboard, gửi
//!   phím dán) đi qua trait [`Native`], để test dùng bản giả (`test_support::FakeNative`).
//!
//! Chữ gõ và bản dịch chỉ nằm trong bộ nhớ (spec §6): không ghi vào file nào, log chỉ có số liệu (số ký tự, số dòng, thời gian,
//! kết quả, mã lỗi).

pub mod detect;
pub mod target;
pub mod worker;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;

use pipeline::prompt::Lang as MtLang;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::settings::{Lang, Theme, UiLanguage};
use crate::state::AppState;
use crate::{actions, events, license, session, system};
use detect::Detected;
use worker::{Piece, Stop};

pub const LABEL: &str = "compose";
/// Chữ gõ dài tối đa, tính theo ký tự: giới hạn dữ liệu từ giao diện (spec §1.2; §10.2 của spec gốc).
pub const MAX_TEXT_CHARS: usize = 4000;
/// Bề rộng và chiều cao của ô soạn, px logic (spec §1.2). Giao diện xin đổi chiều cao theo nội dung, trong khoảng này.
pub const WIDTH: f64 = 560.0;
pub const MIN_HEIGHT: f64 = 120.0;
pub const MAX_HEIGHT: f64 = 420.0;

/// Thao tác trên cửa sổ ô soạn và với hệ điều hành. Bản thật ở `native_macos.rs`, `native_windows.rs` (kế hoạch 03); test dùng
/// bản giả ghi lại từng lần gọi.
pub trait Native: Send + Sync + 'static {
    /// Hiện ô soạn giữa màn hình đang có con trỏ chuột, mép trên ở 25% chiều cao màn hình (spec §1.2), rồi đưa bàn phím vào ô
    /// gõ. Windows nhớ cửa sổ đang ở phía trước trước khi hiện (spec §3.1).
    fn show(&self) -> tauri::Result<()>;
    /// Ẩn ô soạn; chờ tới khi đã ẩn.
    fn hide(&self) -> tauri::Result<()>;
    fn visible(&self) -> bool;
    /// Đổi chiều cao (px logic), giữ mép trên.
    fn set_height(&self, height: f64) -> tauri::Result<()>;
    /// Có quyền gửi phím vào app khác không: macOS là quyền Trợ năng (`AXIsProcessTrusted`), Windows luôn có. Hỏi lại mỗi lần,
    /// vì quyền có thể mất sau khi cập nhật (spec §4.2).
    fn trusted(&self) -> bool;
    /// macOS: hỏi quyền Trợ năng (`AXIsProcessTrustedWithOptions` có hỏi), để app hiện trong danh sách của System Settings.
    fn request_trust(&self);
    /// Ghi chữ vào clipboard, dạng văn bản thuần.
    fn set_clipboard(&self, text: &str) -> Result<(), String>;
    /// Gọi sau khi ô soạn đã ẩn: chờ cửa sổ của app trước nhận lại bàn phím (Windows: đưa nó về phía trước) rồi gửi phím dán.
    /// `false` khi không đưa được cửa sổ đó về: không gửi phím, người dùng tự dán từ clipboard.
    fn paste(&self) -> bool;
}

/// Phần cài đặt mà ô soạn cần (spec §1.2, §1.4), gửi kèm mỗi lần mở (`compose://open`) và qua lệnh `get_compose_view`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeView {
    pub ui_language: UiLanguage,
    pub theme: Theme,
    /// Ngôn ngữ đang dịch sang, đã tính "Tự động" (spec §2.1).
    pub target: Lang,
    /// Enter tự dán (Windows luôn; macOS theo `compose.autoPaste`) hay chỉ chép.
    pub auto_paste: bool,
    /// Bản quyền đang chặn Gõ dịch: mã lỗi (`trialEnded`…); `None` là dùng được (spec §1.5).
    pub blocked: Option<String>,
    /// `macos` hay `windows`: giao diện ghi ⌘V hay Ctrl+V.
    pub platform: &'static str,
}

/// Kết quả của một yêu cầu dịch, gửi qua `compose://done`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Outcome {
    /// Bản dịch đủ của mọi dòng.
    Translated { text: String },
    /// Chữ gõ chắc chắn đã là ngôn ngữ đích: không dịch; Enter dán nguyên văn (spec §2.2).
    SameLanguage,
    /// Không dịch được; `code` là mã lỗi (`error.<code>`). Enter dịch lại, không bao giờ dán câu gốc (spec §1.3).
    Failed { code: String },
}

/// `compose://done`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Done {
    pub id: u64,
    pub outcome: Outcome,
}

/// `compose://delta`: phần chữ dịch mới của một dòng; `reset` là lần dịch đầu của dòng đó hỏng, bỏ phần đã hiện.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Delta {
    pub id: u64,
    pub line: usize,
    pub text: String,
    pub reset: bool,
}

/// `compose://loading`: yêu cầu `id` đang chờ nạp model ("Đang nạp model…", spec §3.4).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Loading {
    pub id: u64,
}

/// Kết quả của lệnh dán (spec §4.1, §4.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Submitted {
    /// Đã ẩn ô soạn và gửi phím dán vào app trước.
    Pasted,
    /// Đã chép vào clipboard và ẩn ô soạn (tắt tự dán, hay không đưa được cửa sổ trước về): người dùng tự dán.
    Copied,
    /// macOS, bật tự dán mà chưa có quyền Trợ năng: đã chép, ô soạn không đóng, giao diện hiện hộp quyền (spec §4.2).
    NeedsPermission,
}

/// Màn hình của cửa sổ chính mà ô soạn mở được, từ nút của hộp lỗi (spec §5).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MainScreen {
    /// Cài đặt › Model (chưa có model, model hỏng, đang tải).
    Models,
    /// Nâng cấp (hết dùng thử).
    Upgrade,
    /// Cài đặt › Bản quyền (key xung đột, cần làm mới, bị thu hồi).
    License,
    /// Màn hình chính (lỗi khác).
    Home,
}

/// Trạng thái của Gõ dịch, quản lý bằng `app.manage`.
pub struct Compose {
    native: Box<dyn Native>,
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// Số của yêu cầu dịch gần nhất, tăng dần từ 1.
    latest: u64,
    /// Cờ hủy của yêu cầu đang chạy.
    cancel: Option<Arc<AtomicBool>>,
    /// Chữ để dán của yêu cầu gần nhất đã xong: bản dịch, hay chữ gốc khi đã là ngôn ngữ đích.
    ready: Option<(u64, String)>,
    /// Nơi gửi yêu cầu cho luồng dịch, tạo ở lần dịch đầu tiên.
    queue: Option<Sender<Request>>,
}

struct Request {
    id: u64,
    text: String,
    cancel: Arc<AtomicBool>,
}

impl Compose {
    pub fn new(native: Box<dyn Native>) -> Self {
        Self {
            native,
            inner: Mutex::new(Inner::default()),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Hủy yêu cầu đang chạy (nếu có): luồng dịch bỏ kết quả của nó.
    fn cancel_current(&self) {
        if let Some(cancel) = self.lock().cancel.take() {
            cancel.store(true, Ordering::SeqCst);
        }
    }
}

fn state<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::State<'_, Compose>, CommandError> {
    app.try_state::<Compose>()
        .ok_or_else(|| CommandError::new(errors::UNKNOWN, None, "chưa có ô soạn"))
}

/// Phần cài đặt của ô soạn lúc này.
pub fn view<R: Runtime>(app: &AppHandle<R>) -> ComposeView {
    let settings = app.state::<AppState>().settings();
    ComposeView {
        ui_language: settings.ui_language,
        theme: settings.theme,
        target: target::resolve(&settings),
        auto_paste: !cfg!(target_os = "macos") || settings.compose.auto_paste,
        blocked: license::app::compose_check(app).err().map(|e| e.code),
        platform: if cfg!(target_os = "macos") { "macos" } else { "windows" },
    }
}

/// Phím tắt Gõ dịch (spec §1.3): ô đang mở thì đóng (như Esc), đang đóng thì mở.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let Some(compose) = app.try_state::<Compose>() else {
        return;
    };
    if compose.native.visible() {
        close(app);
    } else {
        open(app);
    }
}

/// Mở ô soạn (spec §1.1 bước 2): gửi phần cài đặt của nó (`compose://open`) rồi hiện. Gõ dịch dùng được thì chạy sẵn hai tiến
/// trình phụ trên luồng nền (`session::prewarm`), để lần dịch đầu ít phải chờ nạp model.
pub fn open<R: Runtime>(app: &AppHandle<R>) {
    let Some(compose) = app.try_state::<Compose>() else {
        return;
    };
    let view = view(app);
    let usable = view.blocked.is_none();
    events::compose_open(app, &view);
    if let Err(e) = compose.native.show() {
        log::warn!("không hiện được ô soạn: {e}");
        return;
    }
    if usable {
        session::prewarm(app);
    }
}

/// Đóng ô soạn (Esc, phím tắt, bấm ra ngoài; spec §1.3): hủy yêu cầu dịch đang chạy rồi ẩn. Bản nháp nằm ở giao diện, không mất.
pub fn close<R: Runtime>(app: &AppHandle<R>) {
    let Some(compose) = app.try_state::<Compose>() else {
        return;
    };
    compose.cancel_current();
    if let Err(e) = compose.native.hide() {
        log::warn!("không ẩn được ô soạn: {e}");
    }
}

/// Đổi chiều cao của ô soạn theo nội dung (lệnh `compose_resize`), trong khoảng [`MIN_HEIGHT`]–[`MAX_HEIGHT`].
pub fn resize<R: Runtime>(app: &AppHandle<R>, height: f64) -> Result<(), CommandError> {
    if !height.is_finite() {
        return Err(CommandError::new(errors::UNKNOWN, None, "chiều cao không hợp lệ"));
    }
    state(app)?
        .native
        .set_height(height.clamp(MIN_HEIGHT, MAX_HEIGHT))
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))
}

/// Xin dịch `text` (lệnh `compose_translate`): trả số của yêu cầu; kết quả tới qua `compose://delta` và `compose://done` (spec
/// §3.3). Yêu cầu mới hủy yêu cầu đang chạy; chữ để dán của yêu cầu cũ không còn dùng được.
pub fn request<R: Runtime>(app: &AppHandle<R>, text: String) -> Result<u64, CommandError> {
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err(CommandError::new(errors::COMPOSE_TOO_LONG, None, "quá 4000 ký tự"));
    }
    let compose = state(app)?;
    let mut inner = compose.lock();
    if let Some(old) = inner.cancel.take() {
        old.store(true, Ordering::SeqCst);
    }
    inner.latest += 1;
    inner.ready = None;
    let id = inner.latest;
    let cancel = Arc::new(AtomicBool::new(false));
    inner.cancel = Some(cancel.clone());
    let queue = inner.queue.get_or_insert_with(|| spawn_worker(app.clone()));
    queue
        .send(Request { id, text, cancel })
        .map_err(|_| CommandError::new(errors::UNKNOWN, None, "luồng dịch đã dừng"))?;
    Ok(id)
}

/// Luồng dịch của ô soạn: lần lượt từng yêu cầu; yêu cầu đã bị hủy trước khi tới lượt thì bỏ qua.
fn spawn_worker<R: Runtime>(app: AppHandle<R>) -> Sender<Request> {
    let (tx, rx) = mpsc::channel::<Request>();
    std::thread::spawn(move || {
        for request in rx {
            if !request.cancel.load(Ordering::SeqCst) {
                run(&app, &request);
            }
        }
    });
    tx
}

fn run<R: Runtime>(app: &AppHandle<R>, request: &Request) {
    let started = Instant::now();
    let Some(outcome) = translate(app, request) else {
        return;
    };
    let Some(compose) = app.try_state::<Compose>() else {
        return;
    };
    {
        let mut inner = compose.lock();
        // Đã có yêu cầu mới hơn, hay ô soạn đã đóng: bỏ kết quả.
        if inner.latest != request.id || request.cancel.load(Ordering::SeqCst) {
            return;
        }
        inner.ready = match &outcome {
            Outcome::Translated { text } => Some((request.id, text.clone())),
            Outcome::SameLanguage => Some((request.id, request.text.clone())),
            Outcome::Failed { .. } => None,
        };
    }
    let kind = match &outcome {
        Outcome::Translated { .. } => "đã dịch",
        Outcome::SameLanguage => "đã là ngôn ngữ đích",
        Outcome::Failed { code } => code.as_str(),
    };
    // Chỉ số liệu, không bao giờ có chữ (spec §6).
    log::info!(
        "Gõ dịch: {} ký tự, {} dòng, {} ms, {kind}",
        request.text.chars().count(),
        request.text.split('\n').count(),
        started.elapsed().as_millis()
    );
    events::compose_done(
        app,
        &Done {
            id: request.id,
            outcome,
        },
    );
}

/// Dịch một yêu cầu. `None` khi yêu cầu bị hủy giữa chừng.
fn translate<R: Runtime>(app: &AppHandle<R>, request: &Request) -> Option<Outcome> {
    if let Err(e) = license::app::compose_check(app) {
        return Some(Outcome::Failed { code: e.code });
    }
    let tgt = target::resolve(&app.state::<AppState>().settings());
    let detected = detect::detect(&request.text);
    if detected == Detected::Sure(tgt) {
        return Some(Outcome::SameLanguage);
    }
    let src = detect::job_source(detected, tgt);
    let id = request.id;
    let translated = session::with_compose_mt(
        app,
        || events::compose_loading(app, &Loading { id }),
        |mt, cfg| {
            worker::translate_text(
                mt,
                cfg,
                &request.text,
                mt_lang(src),
                mt_lang(tgt),
                &request.cancel,
                &mut |piece| {
                    let (line, text, reset) = match piece {
                        Piece::Delta { line, text } => (line, text, false),
                        Piece::Retry { line } => (line, "", true),
                    };
                    events::compose_delta(
                        app,
                        &Delta {
                            id,
                            line,
                            text: text.to_string(),
                            reset,
                        },
                    );
                },
            )
        },
    );
    match translated {
        Err(e) => Some(Outcome::Failed { code: e.code }),
        Ok(Err(Stop::Cancelled)) => None,
        Ok(Err(Stop::Failed(code))) => Some(Outcome::Failed { code: code.into() }),
        Ok(Ok(text)) => Some(Outcome::Translated { text }),
    }
}

fn mt_lang(lang: Lang) -> MtLang {
    match lang {
        Lang::En => MtLang::En,
        Lang::Zh => MtLang::Zh,
        Lang::Ja => MtLang::Ja,
        Lang::Ko => MtLang::Ko,
        Lang::Vi => MtLang::Vi,
    }
}

/// Dán kết quả của yêu cầu `id` (lệnh `compose_submit`; spec §4.1). Chỉ dán chữ phía Rust đã lưu cho yêu cầu gần nhất đã xong,
/// không nhận chữ từ giao diện (spec §3.6), nên cửa sổ ô soạn không gửi được chữ tùy ý vào app khác. Chặn trong lúc chờ cửa sổ
/// trước nhận lại bàn phím: gọi từ luồng nền.
pub fn submit<R: Runtime>(app: &AppHandle<R>, id: u64) -> Result<Submitted, CommandError> {
    let compose = state(app)?;
    let text = match &compose.lock().ready {
        Some((ready, text)) if *ready == id => text.clone(),
        _ => {
            return Err(CommandError::new(
                errors::UNKNOWN,
                None,
                "chưa có kết quả của yêu cầu này",
            ));
        }
    };
    compose
        .native
        .set_clipboard(&text)
        .map_err(|e| CommandError::new(errors::COPY_FAILED, None, e))?;
    compose.lock().ready = None;
    let auto = !cfg!(target_os = "macos") || app.state::<AppState>().settings().compose.auto_paste;
    if auto && !compose.native.trusted() {
        return Ok(Submitted::NeedsPermission);
    }
    compose
        .native
        .hide()
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?;
    if !auto {
        return Ok(Submitted::Copied);
    }
    Ok(if compose.native.paste() {
        Submitted::Pasted
    } else {
        Submitted::Copied
    })
}

/// "Bật tự dán" ở hộp quyền (spec §4.2, chỉ macOS): hỏi quyền Trợ năng để app hiện trong danh sách, rồi mở trang Trợ năng của
/// System Settings (qua `SystemOpener`, như mọi việc mở ra ngoài app).
pub fn open_accessibility<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    if !cfg!(target_os = "macos") {
        return Err(CommandError::new(errors::UNSUPPORTED, None, "chỉ có trên macOS"));
    }
    state(app)?.native.request_trust();
    system::open_accessibility_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
}

/// "Luôn chỉ chép" ở hộp quyền (spec §4.2): tắt tự dán.
pub fn copy_only<R: Runtime>(app: &AppHandle<R>) {
    let mut next = app.state::<AppState>().settings();
    next.compose.auto_paste = false;
    actions::commit_settings(app, next);
}

/// Nút của hộp lỗi (spec §5): đóng ô soạn rồi mở cửa sổ chính ở màn hình cần làm.
pub fn open_main<R: Runtime>(app: &AppHandle<R>, screen: MainScreen) {
    close(app);
    let target = match screen {
        MainScreen::Models => events::Navigate {
            screen: "settings",
            settings_group: Some("model"),
        },
        MainScreen::Upgrade => events::Navigate {
            screen: "upgrade",
            settings_group: None,
        },
        MainScreen::License => events::Navigate {
            screen: "settings",
            settings_group: Some("license"),
        },
        MainScreen::Home => events::Navigate {
            screen: "home",
            settings_group: None,
        },
    };
    actions::open_main_at(app, target);
}
```

- [ ] **Step 2: Sự kiện `compose://*`**

Trong `src-tauri/src/events.rs`, tìm dòng (duy nhất):

```rust
use crate::overlay;
```

thay bằng:

```rust
use crate::compose::{self, ComposeView, Delta, Done, Loading};
use crate::overlay;
```

Cùng file, tìm dòng (duy nhất):

```rust
pub const OVERLAY_SCROLL: &str = "overlay://scroll";
```

thay bằng:

```rust
pub const OVERLAY_SCROLL: &str = "overlay://scroll";
/// Gõ dịch (spec 2026-10-17-go-dich §3.3), chỉ gửi cho cửa sổ `compose`: mở ô soạn kèm phần cài đặt của nó
/// (`compose::ComposeView`); yêu cầu đang chờ nạp model (`compose::Loading`); phần chữ dịch mới (`compose::Delta`); kết quả
/// (`compose::Done`).
pub const COMPOSE_OPEN: &str = "compose://open";
pub const COMPOSE_LOADING: &str = "compose://loading";
pub const COMPOSE_DELTA: &str = "compose://delta";
pub const COMPOSE_DONE: &str = "compose://done";
```

Cùng file, tìm dòng (duy nhất):

```rust
pub fn navigate<R: Runtime>(app: &AppHandle<R>, target: Navigate) {
```

thay bằng:

```rust
pub fn compose_open<R: Runtime>(app: &AppHandle<R>, view: &ComposeView) {
    emit(app, compose::LABEL, COMPOSE_OPEN, view);
}

pub fn compose_loading<R: Runtime>(app: &AppHandle<R>, loading: &Loading) {
    emit(app, compose::LABEL, COMPOSE_LOADING, loading);
}

pub fn compose_delta<R: Runtime>(app: &AppHandle<R>, delta: &Delta) {
    emit(app, compose::LABEL, COMPOSE_DELTA, delta);
}

pub fn compose_done<R: Runtime>(app: &AppHandle<R>, done: &Done) {
    emit(app, compose::LABEL, COMPOSE_DONE, done);
}

pub fn navigate<R: Runtime>(app: &AppHandle<R>, target: Navigate) {
```

- [ ] **Step 3: Bản giả `FakeNative` trong app giả**

Trong `src-tauri/src/test_support.rs`, tìm đoạn (duy nhất):

```rust
        self.push("open_accessibility_settings".into())
    }
}

/// Trạng thái của bản giả `FakeLoginItem`.
```

thay bằng:

```rust
        self.push("open_accessibility_settings".into())
    }
}

/// Bản giả của `compose::Native`: ghi lại từng lần gọi, dạng `show`, `hide`, `height 240`, `request_trust`, `clipboard <chữ>`,
/// `paste`. Có quyền Trợ năng và dán được, trừ khi test đổi `trusted`, `paste_ok`.
#[derive(Clone)]
pub struct FakeNative {
    pub calls: Arc<Mutex<Vec<String>>>,
    pub visible: Arc<AtomicBool>,
    pub trusted: Arc<AtomicBool>,
    pub paste_ok: Arc<AtomicBool>,
}

impl Default for FakeNative {
    fn default() -> Self {
        Self {
            calls: Arc::default(),
            visible: Arc::default(),
            trusted: Arc::new(AtomicBool::new(true)),
            paste_ok: Arc::new(AtomicBool::new(true)),
        }
    }
}

impl FakeNative {
    fn push(&self, call: String) {
        self.calls.lock().unwrap().push(call);
    }
}

impl crate::compose::Native for FakeNative {
    fn show(&self) -> tauri::Result<()> {
        self.visible.store(true, Ordering::SeqCst);
        self.push("show".into());
        Ok(())
    }
    fn hide(&self) -> tauri::Result<()> {
        self.visible.store(false, Ordering::SeqCst);
        self.push("hide".into());
        Ok(())
    }
    fn visible(&self) -> bool {
        self.visible.load(Ordering::SeqCst)
    }
    fn set_height(&self, height: f64) -> tauri::Result<()> {
        self.push(format!("height {height}"));
        Ok(())
    }
    fn trusted(&self) -> bool {
        self.trusted.load(Ordering::SeqCst)
    }
    fn request_trust(&self) {
        self.push("request_trust".into());
    }
    fn set_clipboard(&self, text: &str) -> Result<(), String> {
        self.push(format!("clipboard {text}"));
        Ok(())
    }
    fn paste(&self) -> bool {
        self.push("paste".into());
        self.paste_ok.load(Ordering::SeqCst)
    }
}

/// Trạng thái của bản giả `FakeLoginItem`.
```

Cùng file, trong `mock_app_full`, tìm đoạn (duy nhất):

```rust
    let surface = FakeSurface::default();
    let system = FakeSystem::default();
```

thay bằng:

```rust
    let surface = FakeSurface::default();
    let native = FakeNative::default();
    let system = FakeSystem::default();
```

Cùng file, tìm đoạn (duy nhất):

```rust
        .manage(surface)
        .manage(System(Box::new(system.clone())))
```

thay bằng:

```rust
        .manage(surface)
        .manage(crate::compose::Compose::new(Box::new(native.clone())))
        .manage(native)
        .manage(System(Box::new(system.clone())))
```

- [ ] **Step 4: Chạy, không hỏng gì**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib 2>&1 | grep -E 'test result|FAILED|^error|^warning: unused'
```
Expected: `test result: ok.` với `passed` = N1 + 5, không `FAILED`, không `error`, không cảnh báo `unused`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/src/compose/mod.rs src-tauri/src/events.rs src-tauri/src/test_support.rs && git commit -q -m "feat(go-dich): trạng thái ô soạn, trait Native, sự kiện compose://*" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: Tám lệnh `compose_*`

**Files:**
- Modify: `src-tauri/src/commands.rs`, `src-tauri/build.rs`

Spec §3.6. Lệnh dán nhận **số** của yêu cầu dịch, không nhận chữ. `compose_submit` là lệnh `async` chạy hàm chặn qua `data::blocking` (`spawn_blocking`), vì nó chờ cửa sổ của app trước nhận lại bàn phím. Mỗi lệnh phải có tên trong app manifest của `build.rs` (tauri-build sinh quyền `allow-<tên-lệnh>` từ đó; Task 6 cấp các quyền này cho cửa sổ `compose`).

- [ ] **Step 1: Lệnh**

Trong `src-tauri/src/commands.rs`, tìm dòng (duy nhất):

```rust
use crate::actions::{self, AudioSourceOption};
```

thay bằng:

```rust
use crate::actions::{self, AudioSourceOption};
use crate::compose;
```

Cùng file, tìm đoạn (duy nhất):

```rust
    blocking(app, crate::diagnostics::send_manual).await
}
```

thay bằng:

```rust
    blocking(app, crate::diagnostics::send_manual).await
}

// ---- Lệnh của cửa sổ `compose` (Gõ dịch, spec 2026-10-17-go-dich §3.6): chỉ đụng tới ô soạn và các việc của nó. Lệnh dán
// nhận số của yêu cầu dịch, không nhận chữ: cửa sổ này không gửi được chữ tùy ý vào app khác. ----

#[tauri::command]
pub fn get_compose_view<R: Runtime>(app: AppHandle<R>) -> compose::ComposeView {
    compose::view(&app)
}

/// Xin dịch chữ đang gõ; trả số của yêu cầu, kết quả tới qua `compose://delta` và `compose://done`.
#[tauri::command]
pub fn compose_translate<R: Runtime>(app: AppHandle<R>, text: String) -> Result<u64, CommandError> {
    compose::request(&app, text)
}

/// Enter lần 1: dán bản dịch của yêu cầu `id` vào ô nhập của app trước. Chờ cửa sổ đó nhận lại bàn phím: chạy trên luồng của
/// `spawn_blocking`.
#[tauri::command]
pub async fn compose_submit<R: Runtime>(app: AppHandle<R>, id: u64) -> Result<compose::Submitted, CommandError> {
    blocking(app, move |app| compose::submit(app, id)).await
}

/// Esc, bấm ra ngoài: đóng ô soạn.
#[tauri::command]
pub fn compose_close<R: Runtime>(app: AppHandle<R>) {
    compose::close(&app);
}

#[tauri::command]
pub fn compose_resize<R: Runtime>(app: AppHandle<R>, height: f64) -> Result<(), CommandError> {
    compose::resize(&app, height)
}

/// "Bật tự dán" (macOS): hỏi quyền Trợ năng và mở trang Trợ năng của System Settings.
#[tauri::command]
pub fn compose_open_accessibility<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    compose::open_accessibility(&app)
}

/// "Luôn chỉ chép": tắt tự dán.
#[tauri::command]
pub fn compose_copy_only<R: Runtime>(app: AppHandle<R>) {
    compose::copy_only(&app);
}

/// Nút của hộp lỗi: đóng ô soạn, mở cửa sổ chính ở màn hình cần làm.
#[tauri::command]
pub fn compose_open_main<R: Runtime>(app: AppHandle<R>, screen: compose::MainScreen) {
    compose::open_main(&app, screen);
}
```

Cùng file, tìm đoạn (duy nhất):

```rust
    "end_overlay_resize",
];
```

thay bằng:

```rust
    "end_overlay_resize",
];

/// Lệnh của cửa sổ `compose` (Gõ dịch).
pub const COMPOSE_COMMANDS: &[&str] = &[
    "get_compose_view",
    "compose_translate",
    "compose_submit",
    "compose_close",
    "compose_resize",
    "compose_open_accessibility",
    "compose_copy_only",
    "compose_open_main",
];
```

Cùng file, trong `handler`, tìm đoạn (duy nhất):

```rust
        end_overlay_resize,
        crate::models::commands::get_models_state,
```

thay bằng:

```rust
        end_overlay_resize,
        get_compose_view,
        compose_translate,
        compose_submit,
        compose_close,
        compose_resize,
        compose_open_accessibility,
        compose_copy_only,
        compose_open_main,
        crate::models::commands::get_models_state,
```

- [ ] **Step 2: App manifest**

Trong `src-tauri/build.rs`, tìm đoạn (duy nhất):

```rust
                "end_overlay_resize",
            ])),
```

thay bằng:

```rust
                "end_overlay_resize",
                "get_compose_view",
                "compose_translate",
                "compose_submit",
                "compose_close",
                "compose_resize",
                "compose_open_accessibility",
                "compose_copy_only",
                "compose_open_main",
            ])),
```

- [ ] **Step 3: Chạy, không hỏng gì**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib acl_tests 2>&1 | grep -E 'test result|FAILED|^error'
```
Expected: `test result: ok.` (chưa cửa sổ nào được cấp lệnh mới; Task 6 cấp).

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/src/commands.rs src-tauri/build.rs && git commit -q -m "feat(go-dich): tám lệnh compose_* và app manifest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: Phân quyền cửa sổ `compose`

**Files:**
- Create: `src-tauri/capabilities/compose.json`
- Modify: `src-tauri/src/acl_tests.rs`, `src-tauri/src/test_support.rs`

Spec §3.6: cửa sổ `compose` chỉ gọi được tám lệnh của nó cùng `core:event:allow-listen`/`allow-unlisten` (không kéo được cửa sổ, không zoom); cửa sổ `main` và `overlay` không gọi được lệnh của nó, và ngược lại. `compose_open_accessibility` có tác dụng ra ngoài app nên chỉ tới bản giả.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src-tauri/src/acl_tests.rs`, tìm đoạn (duy nhất):

```rust
use crate::commands::{MAIN_COMMANDS, OVERLAY_COMMANDS};
use crate::test_support::{denied, invoke, mock_app, system_calls, window};
```

thay bằng:

```rust
use crate::commands::{COMPOSE_COMMANDS, MAIN_COMMANDS, OVERLAY_COMMANDS};
use crate::test_support::{compose_calls, denied, invoke, mock_app, system_calls, window};
```

Cùng file, tìm đoạn (duy nhất):

```rust
const OVERLAY_CORE_PERMISSIONS: &[&str] = &[
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:window:allow-start-dragging",
];
```

thay bằng:

```rust
const OVERLAY_CORE_PERMISSIONS: &[&str] = &[
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:window:allow-start-dragging",
];
/// Ô soạn Gõ dịch: không kéo được (spec 2026-10-17-go-dich §1.2), đổi chiều cao qua lệnh của app.
const COMPOSE_CORE_PERMISSIONS: &[&str] = &["core:event:allow-listen", "core:event:allow-unlisten"];
```

Cùng file, tìm đoạn (duy nhất):

```rust
        "overlay chỉ đọc phần cài đặt của nó, nghe sự kiện, kéo, đổi kích thước và ẩn cửa sổ của chính nó"
    );
```

thay bằng:

```rust
        "overlay chỉ đọc phần cài đặt của nó, nghe sự kiện, kéo, đổi kích thước và ẩn cửa sổ của chính nó"
    );
    assert_eq!(
        permissions(include_str!("../capabilities/compose.json"), "compose"),
        expected(COMPOSE_COMMANDS, COMPOSE_CORE_PERMISSIONS),
        "ô soạn chỉ có các lệnh của Gõ dịch và nghe sự kiện"
    );
```

Cùng file, tìm dòng (duy nhất):

```rust
    assert_eq!(files, ["main.json", "overlay.json"], "không có capability nào khác");
```

thay bằng:

```rust
    assert_eq!(
        files,
        ["compose.json", "main.json", "overlay.json"],
        "không có capability nào khác"
    );
```

Cùng file, tìm dòng (duy nhất):

```rust
    for cmd in MAIN_COMMANDS.iter().chain(OVERLAY_COMMANDS) {
```

thay bằng:

```rust
    for cmd in MAIN_COMMANDS.iter().chain(OVERLAY_COMMANDS).chain(COMPOSE_COMMANDS) {
```

Cùng file, trong `each_window_only_reaches_its_own_commands`, tìm đoạn (duy nhất):

```rust
    // Không cửa sổ nào tự đọc ghi file cài đặt, bật tắt khởi động cùng hệ thống, mở URL hay đường dẫn,
    // tạo cửa sổ, di chuyển cửa sổ, phát sự kiện, hay đăng ký phím tắt.
    for cmd in FORBIDDEN {
        for window in [&main, &overlay] {
```

thay bằng:

```rust
    // Ô soạn Gõ dịch (spec 2026-10-17-go-dich §3.6): chỉ các lệnh của nó; hai cửa sổ kia không gọi được lệnh của nó.
    let compose = window(&app, "compose");
    let view = invoke(&compose, "get_compose_view", json!({})).expect("ô soạn đọc được phần của nó");
    assert_eq!(view["target"], "en");
    assert!(view.get("hotkeys").is_none(), "ô soạn không thấy cài đặt khác");
    for cmd in MAIN_COMMANDS.iter().chain(OVERLAY_COMMANDS) {
        let result = invoke(&compose, cmd, json!({}));
        assert!(denied(&result), "compose không được gọi {cmd}: {result:?}");
    }
    for cmd in COMPOSE_COMMANDS {
        for other in [&main, &overlay] {
            let result = invoke(other, cmd, json!({}));
            assert!(denied(&result), "{} không được gọi {cmd}: {result:?}", other.label());
        }
    }
    assert!(denied(&invoke(
        &compose,
        "plugin:webview|set_webview_zoom",
        json!({ "value": 1.2 })
    )));
    // Không cửa sổ nào tự đọc ghi file cài đặt, bật tắt khởi động cùng hệ thống, mở URL hay đường dẫn,
    // tạo cửa sổ, di chuyển cửa sổ, phát sự kiện, hay đăng ký phím tắt.
    for cmd in FORBIDDEN {
        for window in [&main, &overlay, &compose] {
```

Cùng file, tìm dòng (duy nhất):

```rust
/// Spec 2026-10-17 §5: nút "Gửi log cho hỗ trợ" chỉ cửa sổ chính gọi được. Lệnh bị chặn không tới máy chủ báo cáo; lệnh được phép
```

thay bằng:

```rust
/// Spec 2026-10-17-go-dich §4.2: "Bật tự dán" chỉ ô soạn gọi được; lệnh bị chặn không tới `SystemOpener` hay ô soạn giả; lệnh
/// được phép (macOS) hỏi quyền Trợ năng rồi mở đúng trang Trợ năng của System Settings, qua bản giả.
#[test]
fn only_the_compose_window_opens_the_accessibility_page() {
    let app = mock_app();
    for other in [window(&app, "main"), window(&app, "overlay"), window(&app, "stranger")] {
        let result = invoke(&other, "compose_open_accessibility", json!({}));
        assert!(denied(&result), "{} không được gọi: {result:?}", other.label());
    }
    assert!(system_calls(&app).is_empty() && compose_calls(&app).is_empty());
    let compose = window(&app, "compose");
    let result = invoke(&compose, "compose_open_accessibility", json!({}));
    if cfg!(target_os = "macos") {
        assert!(result.is_ok(), "{result:?}");
        assert_eq!(system_calls(&app), ["open_accessibility_settings"]);
        assert_eq!(compose_calls(&app), ["request_trust"]);
    } else {
        assert!(result.unwrap_err().contains("unsupported"));
        assert!(system_calls(&app).is_empty());
    }
}

/// Spec 2026-10-17 §5: nút "Gửi log cho hỗ trợ" chỉ cửa sổ chính gọi được. Lệnh bị chặn không tới máy chủ báo cáo; lệnh được phép
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib acl_tests 2>&1 | grep -E '^error' | head -3
```
Expected: lỗi biên dịch: không đọc được `../capabilities/compose.json`, không có `compose_calls` trong `test_support`.

- [ ] **Step 3: `compose_calls` và capability**

Trong `src-tauri/src/test_support.rs`, tìm đoạn (duy nhất):

```rust
    fn paste(&self) -> bool {
        self.push("paste".into());
        self.paste_ok.load(Ordering::SeqCst)
    }
}
```

thay bằng:

```rust
    fn paste(&self) -> bool {
        self.push("paste".into());
        self.paste_ok.load(Ordering::SeqCst)
    }
}

/// Các lần gọi tới ô soạn giả của app giả.
pub fn compose_calls(app: &tauri::App<MockRuntime>) -> Vec<String> {
    app.state::<FakeNative>().calls.lock().unwrap().clone()
}
```

Tạo `src-tauri/capabilities/compose.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "compose",
  "description": "Ô soạn Gõ dịch: đọc phần cài đặt của nó, xin dịch, dán bản dịch đã dịch, đóng và đổi chiều cao cửa sổ của chính nó, mở trang Trợ năng hay cửa sổ chính, nghe sự kiện (spec 2026-10-17-go-dich §3.6). Không cấp lệnh nào của cửa sổ khác hay của plugin.",
  "windows": ["compose"],
  "permissions": [
    "allow-get-compose-view",
    "allow-compose-translate",
    "allow-compose-submit",
    "allow-compose-close",
    "allow-compose-resize",
    "allow-compose-open-accessibility",
    "allow-compose-copy-only",
    "allow-compose-open-main",
    "core:event:allow-listen",
    "core:event:allow-unlisten"
  ]
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib acl_tests 2>&1 | grep -E 'test result|FAILED'
```
Expected: `test result: ok.`, có `only_the_compose_window_opens_the_accessibility_page`, không `FAILED`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/capabilities/compose.json src-tauri/src/acl_tests.rs src-tauri/src/test_support.rs && git commit -q -m "feat(go-dich): quyền của cửa sổ compose, chặn chéo giữa ba cửa sổ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 7: Test cấp app của ô soạn (gồm test log)

**Files:**
- Create: `src-tauri/src/compose/tests.rs`
- Modify: `src-tauri/src/compose/mod.rs`, `src-tauri/src/test_support.rs`

Mười bốn test chạy app bằng `MockRuntime` qua lệnh của cửa sổ `compose` (một test chỉ chạy trên macOS). Bộ dịch giả của `FakeDeps` dịch dòng nào cũng ra `"Xin chào mọi người."`. `PrepareGate` giữ `prepare` lại cho tới khi test mở cổng, để tạo cảnh "đang nạp model". Test log dùng `capture_logs` + `all_logs` (log của mọi luồng, vì luồng dịch là luồng riêng) và một dấu `RIENGTU-73519` không được xuất hiện trong log.

Các test này kiểm hành vi của Task 3–6. Nếu test nào đỏ, đối chiếu mã của task đó với `git show 2fddb55:<đường dẫn>`, đừng sửa test.

- [ ] **Step 1: `all_logs`**

Trong `src-tauri/src/test_support.rs`, tìm dòng (duy nhất):

```rust
/// Nguồn log của báo cáo lỗi trong app giả: `app.log` là log đã ghi lại ở trên; hai log tiến trình phụ rỗng.
```

thay bằng:

```rust
/// Mọi dòng log của cả tiến trình test (mọi luồng), từ lúc cài logger.
pub fn all_logs() -> Vec<String> {
    CAPTURED_LOG
        .lock()
        .unwrap()
        .iter()
        .map(|(_, line)| line.clone())
        .collect()
}

/// Nguồn log của báo cáo lỗi trong app giả: `app.log` là log đã ghi lại ở trên; hai log tiến trình phụ rỗng.
```

- [ ] **Step 2: Khai module test**

Trong `src-tauri/src/compose/mod.rs`, tìm đoạn (duy nhất):

```rust
pub mod worker;

use std::sync::atomic::{AtomicBool, Ordering};
```

thay bằng:

```rust
pub mod worker;

#[cfg(test)]
mod tests;

use std::sync::atomic::{AtomicBool, Ordering};
```

- [ ] **Step 3: Viết test**

Tạo `src-tauri/src/compose/tests.rs`:

```rust
//! Test Gõ dịch qua lệnh của cửa sổ `compose`, chạy bằng `MockRuntime` (spec 2026-10-17-go-dich §1.3, §1.5, §3, §4, §6). Bộ dịch
//! giả của `FakeDeps` dịch dòng nào cũng ra "Xin chào mọi người.".

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tauri::Listener;

use crate::errors;
use crate::events::{COMPOSE_DELTA, COMPOSE_DONE, COMPOSE_LOADING, COMPOSE_OPEN, NAVIGATE};
use crate::test_support::{
    FakeDeps, PrepareGate, all_logs, capture_logs, compose_calls, invoke, mock_app, mock_app_with, window,
};

const FAKE: &str = "Xin chào mọi người.";

type App = tauri::App<tauri::test::MockRuntime>;

/// Ghi lại payload của một sự kiện tới đúng cửa sổ `window`.
fn heard(window: &tauri::WebviewWindow<tauri::test::MockRuntime>, event: &str) -> Arc<Mutex<Vec<Value>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    window.listen(event, move |e| {
        sink.lock().unwrap().push(serde_json::from_str(e.payload()).unwrap())
    });
    received
}

/// Chờ tới khi `ok` đúng, tối đa 10 giây.
fn wait_until(what: &str, ok: impl Fn() -> bool) {
    let started = Instant::now();
    while !ok() {
        assert!(started.elapsed() < Duration::from_secs(10), "chờ quá lâu: {what}");
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// Xin dịch `text` từ cửa sổ `compose`; trả số của yêu cầu.
fn translate(app: &App, text: &str) -> u64 {
    let compose = window(app, "compose");
    invoke(&compose, "compose_translate", json!({ "text": text }))
        .unwrap()
        .as_u64()
        .unwrap()
}

/// Kết quả (`outcome`) của yêu cầu `id`, chờ tới khi có.
fn outcome_of(done: &Arc<Mutex<Vec<Value>>>, id: u64) -> Value {
    wait_until("có kết quả", || done.lock().unwrap().iter().any(|d| d["id"] == id));
    let all = done.lock().unwrap();
    all.iter().find(|d| d["id"] == id).unwrap()["outcome"].clone()
}

fn submit(app: &App, id: u64) -> Result<Value, String> {
    invoke(&window(app, "compose"), "compose_submit", json!({ "id": id }))
}

#[test]
fn a_message_is_translated_line_by_line_and_pasted() {
    let app = mock_app();
    let compose = window(&app, "compose");
    let done = heard(&compose, COMPOSE_DONE);
    let deltas = heard(&compose, COMPOSE_DELTA);
    let id = translate(&app, "Mai mình gửi báo cáo nhé\n\nCảm ơn");
    assert_eq!(
        outcome_of(&done, id),
        json!({ "kind": "translated", "text": format!("{FAKE}\n\n{FAKE}") })
    );
    let lines: Vec<u64> = deltas
        .lock()
        .unwrap()
        .iter()
        .map(|d| d["line"].as_u64().unwrap())
        .collect();
    assert!(
        lines.contains(&0) && lines.contains(&2) && !lines.contains(&1),
        "{lines:?}"
    );
    assert_eq!(submit(&app, id).unwrap(), "pasted");
    assert_eq!(
        compose_calls(&app),
        [format!("clipboard {FAKE}\n\n{FAKE}"), "hide".into(), "paste".into()]
    );
    assert!(submit(&app, id).is_err(), "bản dịch đã dán thì không dán lại");
}

/// Spec §2.2: câu chắc chắn đã là ngôn ngữ đích thì không dịch; Enter dán nguyên văn.
#[test]
fn text_already_in_the_target_language_is_pasted_as_is() {
    let app = mock_app();
    let main = window(&app, "main");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "compose": { "target": "vi" } } }),
    )
    .unwrap();
    let done = heard(&window(&app, "compose"), COMPOSE_DONE);
    let id = translate(&app, "Mai mình gửi báo cáo nhé");
    assert_eq!(outcome_of(&done, id), json!({ "kind": "sameLanguage" }));
    submit(&app, id).unwrap();
    assert_eq!(compose_calls(&app)[0], "clipboard Mai mình gửi báo cáo nhé");
}

/// Spec §3.3, §3.4: yêu cầu mới hủy yêu cầu đang chạy (kết quả của nó bị bỏ, không dán được); lần đầu chưa có tiến trình phụ
/// nào chạy thì báo "Đang nạp model…".
#[test]
fn a_newer_request_replaces_the_older_one() {
    let gate = Arc::new(PrepareGate::default());
    let app = mock_app_with(FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    });
    let compose = window(&app, "compose");
    let done = heard(&compose, COMPOSE_DONE);
    let loading = heard(&compose, COMPOSE_LOADING);
    let first = translate(&app, "Mai mình gửi");
    wait_until("lần dịch đầu chờ nạp model", || gate.waiting() == 1);
    let second = translate(&app, "Mai mình gửi báo cáo");
    assert_eq!(second, first + 1);
    gate.open();
    assert_eq!(outcome_of(&done, second)["kind"], "translated");
    std::thread::sleep(Duration::from_millis(100));
    assert!(
        done.lock().unwrap().iter().all(|d| d["id"] != first),
        "kết quả của yêu cầu cũ bị bỏ"
    );
    assert!(submit(&app, first).is_err());
    assert_eq!(*loading.lock().unwrap(), [json!({ "id": first })]);
}

/// Spec §1.2: quá 4000 ký tự thì lệnh từ chối; một dòng quá 400 token thì báo `composeTooLong`, không dịch dở.
#[test]
fn too_long_text_is_refused() {
    let app = mock_app();
    let compose = window(&app, "compose");
    let error = invoke(&compose, "compose_translate", json!({ "text": "a".repeat(4001) })).unwrap_err();
    assert!(error.contains(errors::COMPOSE_TOO_LONG), "{error}");
    let done = heard(&compose, COMPOSE_DONE);
    let id = translate(&app, &vec!["chữ"; 401].join(" "));
    assert_eq!(
        outcome_of(&done, id),
        json!({ "kind": "failed", "code": errors::COMPOSE_TOO_LONG })
    );
    assert!(submit(&app, id).is_err(), "lỗi thì không có gì để dán");
}

/// Spec §5: lỗi lúc chuẩn bị tiến trình phụ (ví dụ chưa tải model) tới ô soạn với đúng mã lỗi.
#[test]
fn a_missing_model_reaches_the_compose_window() {
    let app = mock_app_with(FakeDeps {
        prepare_error: Some(errors::MODEL_MISSING),
        ..FakeDeps::default()
    });
    let done = heard(&window(&app, "compose"), COMPOSE_DONE);
    let id = translate(&app, "Mai mình gửi");
    assert_eq!(
        outcome_of(&done, id),
        json!({ "kind": "failed", "code": errors::MODEL_MISSING })
    );
}

/// Spec §1.5: chưa có token dùng thử thì Gõ dịch bị chặn (`trialNeedsNetwork`) mà không gọi server; mở ô soạn khi bị chặn thì
/// không chạy sẵn tiến trình phụ.
#[test]
fn a_blocked_license_stops_compose_without_calling_the_server() {
    use crate::license::manager::tests::{FakeApi, license};
    use crate::license::store::tests::FakeVault;
    let deps = FakeDeps::default();
    let prepares = deps.prepares.clone();
    let app = mock_app_with(deps);
    let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
    crate::license::app::install_with(app.handle(), license(&api, &vault, crate::license::app::now()));
    let compose = window(&app, "compose");
    let view = invoke(&compose, "get_compose_view", json!({})).unwrap();
    assert_eq!(view["blocked"], errors::TRIAL_NEEDS_NETWORK);
    let done = heard(&compose, COMPOSE_DONE);
    let id = translate(&app, "Mai mình gửi");
    assert_eq!(
        outcome_of(&done, id),
        json!({ "kind": "failed", "code": errors::TRIAL_NEEDS_NETWORK })
    );
    super::open(app.handle());
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(*prepares.lock().unwrap(), 0, "bị chặn thì không nạp model");
    assert!(api.calls.lock().unwrap().is_empty(), "không gọi server");
}

/// Spec §1.1, §1.3: mở ô soạn gửi phần cài đặt của nó rồi hiện, và chạy sẵn tiến trình phụ; phím tắt lần nữa thì đóng.
#[test]
fn the_hotkey_opens_with_the_view_and_closes_again() {
    let deps = FakeDeps::default();
    let prepares = deps.prepares.clone();
    let app = mock_app_with(deps);
    let opened = heard(&window(&app, "compose"), COMPOSE_OPEN);
    super::toggle(app.handle());
    wait_until("đã gửi phần cài đặt", || opened.lock().unwrap().len() == 1);
    let view = opened.lock().unwrap()[0].clone();
    assert_eq!(view["target"], "en");
    assert_eq!(view["uiLanguage"], "vi");
    assert_eq!(view["blocked"], Value::Null);
    assert_eq!(view["autoPaste"], true);
    wait_until("chạy sẵn tiến trình phụ", || *prepares.lock().unwrap() == 1);
    super::toggle(app.handle());
    assert_eq!(compose_calls(&app), ["show", "hide"]);
}

/// Spec §1.3: đóng ô soạn hủy yêu cầu đang chạy; kết quả của nó không tới và không dán được.
#[test]
fn closing_cancels_the_request_in_flight() {
    let gate = Arc::new(PrepareGate::default());
    let app = mock_app_with(FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    });
    let compose = window(&app, "compose");
    let done = heard(&compose, COMPOSE_DONE);
    let id = translate(&app, "Mai mình gửi");
    wait_until("đang chờ nạp model", || gate.waiting() == 1);
    invoke(&compose, "compose_close", json!({})).unwrap();
    gate.open();
    std::thread::sleep(Duration::from_millis(200));
    assert!(done.lock().unwrap().is_empty());
    assert!(submit(&app, id).is_err());
    assert_eq!(compose_calls(&app), ["hide"]);
}

/// Spec §4.1, §4.2 (macOS): bật tự dán mà chưa có quyền Trợ năng thì chỉ chép và giữ ô soạn mở; tắt tự dán ("Luôn chỉ chép")
/// thì chép rồi đóng, không gửi phím; không đưa được cửa sổ trước về thì báo đã chép.
#[cfg(target_os = "macos")]
#[test]
fn without_permission_the_translation_is_only_copied() {
    use std::sync::atomic::Ordering;

    use tauri::Manager;

    use crate::test_support::FakeNative;

    let app = mock_app();
    let compose = window(&app, "compose");
    let done = heard(&compose, COMPOSE_DONE);
    let native = app.state::<FakeNative>().inner().clone();
    native.trusted.store(false, Ordering::SeqCst);
    let id = translate(&app, "Mai mình gửi");
    outcome_of(&done, id);
    assert_eq!(submit(&app, id).unwrap(), "needsPermission");
    assert_eq!(compose_calls(&app), [format!("clipboard {FAKE}")], "ô soạn không đóng");
    invoke(&compose, "compose_copy_only", json!({})).unwrap();
    let settings = app.state::<crate::state::AppState>().settings();
    assert!(!settings.compose.auto_paste);
    let id = translate(&app, "Mai mình gửi");
    outcome_of(&done, id);
    assert_eq!(submit(&app, id).unwrap(), "copied");
    assert_eq!(compose_calls(&app)[1..], [format!("clipboard {FAKE}"), "hide".into()]);
    native.trusted.store(true, Ordering::SeqCst);
    let main = window(&app, "main");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "compose": { "autoPaste": true } } }),
    )
    .unwrap();
    native.paste_ok.store(false, Ordering::SeqCst);
    let id = translate(&app, "Mai mình gửi");
    outcome_of(&done, id);
    assert_eq!(submit(&app, id).unwrap(), "copied", "cửa sổ trước không về được");
}

/// Spec §3.4: trong lúc Gõ dịch đang chuẩn bị hay dùng tiến trình phụ, `release_models` (trước khi xóa hay tải đè model) chờ.
#[test]
fn releasing_models_waits_for_a_compose_request() {
    let gate = Arc::new(PrepareGate::default());
    let deps = FakeDeps {
        prepare_gate: Some(gate.clone()),
        ..FakeDeps::default()
    };
    let releases = deps.releases.clone();
    let app = mock_app_with(deps);
    let done = heard(&window(&app, "compose"), COMPOSE_DONE);
    let id = translate(&app, "Mai mình gửi");
    wait_until("đang chờ nạp model", || gate.waiting() == 1);
    let handle = app.handle().clone();
    let release = std::thread::spawn(move || crate::session::release_models(&handle));
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(
        *releases.lock().unwrap(),
        0,
        "chưa tắt tiến trình phụ khi Gõ dịch còn dùng"
    );
    gate.open();
    release.join().unwrap();
    assert_eq!(*releases.lock().unwrap(), 1);
    assert_eq!(outcome_of(&done, id)["kind"], "translated");
}

/// Spec §3.4, §8.1: mỗi yêu cầu dịch đều chuẩn bị tiến trình phụ trước khi dùng bộ dịch. Bản thật chạm
/// `SidecarManager::touch()` ở bước này, nên luật tắt sau 10 phút rảnh tính lại từ đầu sau mỗi lần dịch.
#[test]
fn every_request_prepares_the_sidecars_first() {
    let deps = FakeDeps::default();
    let prepares = deps.prepares.clone();
    let app = mock_app_with(deps);
    let done = heard(&window(&app, "compose"), COMPOSE_DONE);
    for text in ["Mai mình gửi", "Cảm ơn cả nhóm"] {
        let id = translate(&app, text);
        assert_eq!(outcome_of(&done, id)["kind"], "translated");
    }
    assert_eq!(*prepares.lock().unwrap(), 2);
}

/// Spec §6: log chỉ có số liệu, không bao giờ có chữ đã gõ.
#[test]
fn logs_never_hold_what_was_typed() {
    capture_logs();
    let app = mock_app();
    let done = heard(&window(&app, "compose"), COMPOSE_DONE);
    let id = translate(&app, "Mật khẩu wifi là RIENGTU-73519 nhé");
    outcome_of(&done, id);
    let logs = all_logs();
    assert!(logs.iter().any(|l| l.contains("Gõ dịch:")), "có dòng số liệu");
    assert!(
        logs.iter().all(|l| !l.contains("RIENGTU-73519")),
        "log không có chữ đã gõ"
    );
}

/// Spec §1.2: chiều cao theo nội dung, trong khoảng 120–420 px.
#[test]
fn the_height_stays_within_bounds() {
    let app = mock_app();
    let compose = window(&app, "compose");
    for height in [50.0, 300.0, 9999.0] {
        invoke(&compose, "compose_resize", json!({ "height": height })).unwrap();
    }
    assert_eq!(compose_calls(&app), ["height 120", "height 300", "height 420"]);
}

/// Spec §5: nút của hộp lỗi đóng ô soạn rồi mở cửa sổ chính ở đúng màn hình.
#[test]
fn an_error_button_opens_the_right_screen() {
    let app = mock_app();
    let nav = heard(&window(&app, "main"), NAVIGATE);
    let compose = window(&app, "compose");
    invoke(&compose, "compose_open_main", json!({ "screen": "models" })).unwrap();
    invoke(&compose, "compose_open_main", json!({ "screen": "upgrade" })).unwrap();
    wait_until("đã mở hai màn hình", || nav.lock().unwrap().len() == 2);
    assert_eq!(
        *nav.lock().unwrap(),
        [
            json!({ "screen": "settings", "settingsGroup": "model" }),
            json!({ "screen": "upgrade", "settingsGroup": null }),
        ]
    );
    assert_eq!(compose_calls(&app), ["hide", "hide"]);
    assert!(invoke(&compose, "compose_open_main", json!({ "screen": "about" })).is_err());
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib compose:: 2>&1 | grep -E 'test result|FAILED'
```
Expected: `test result: ok.`; trên macOS 14 test của `compose::tests` cùng các test `compose::detect`, `compose::target`, `compose::worker` (tổng 28), không `FAILED`.

- [ ] **Step 5: Chạy lại test log riêng, mười lần**

Test log đọc log của mọi luồng, nên chạy lặp để chắc không chập chờn:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && for i in $(seq 1 10); do cargo test --locked -q -p meeting-translator --lib compose::tests 2>&1 | grep -E 'test result' ; done | sort | uniq -c
```
Expected: một dòng duy nhất `10 test result: ok. 14 passed …`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/src/compose src-tauri/src/test_support.rs && git commit -q -m "test(go-dich): test cấp app của ô soạn, log không có chữ đã gõ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 8: Kiểm toàn bộ

**Files:** không sửa file (trừ khi rustfmt đổi chỗ xuống dòng).

- [ ] **Step 1: rustfmt, clippy Mac, clippy Windows**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo fmt --all -- --check && echo FMT-OK
```
Expected: `FMT-OK`. Nếu có diff: `cargo fmt --all`, xem diff chỉ là chỗ xuống dòng, rồi commit `style(go-dich): rustfmt`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | grep -E '^(error|warning)|Finished'
```
Expected: `Finished`; không có `error` (cảnh báo của build script `third_party/whisper-rs-sys` là sẵn có).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && sh scripts/check-windows.sh --locked 2>&1 | grep -E '^(error|warning)|Finished'
```
Expected: `Finished`, không `error`. Trên Windows, test `without_permission_the_translation_is_only_copied` không biên dịch; các import nó cần nằm trong thân test nên không có import thừa.

- [ ] **Step 2: Đủ test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib 2>&1 | grep 'test result' && pnpm test 2>&1 | grep Tests
```
Expected: `passed` = **N0 + 36** (bản 2026-10-17: 679), `Tests  297 passed` (kế hoạch 02 không đổi giao diện).

- [ ] **Step 3: Không còn file chưa commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git status --short
```
Expected: rỗng. Xong kế hoạch 02; sang kế hoạch 03.
