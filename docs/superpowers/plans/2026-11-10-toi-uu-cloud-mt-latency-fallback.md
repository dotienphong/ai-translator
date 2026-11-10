# Tối ưu sâu mã nguồn Cloud MT (Gemini & ChatGPT): Giảm độ trễ và Tự phục hồi Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảm độ trễ khi dịch cuộc họp bằng Gemini/ChatGPT, tránh cảnh báo "Đang trễ", và nâng cấp cơ chế Fallback từ khóa cứng một lần sang tự phục hồi (resilient circuit breaker) để không bị tự động chuyển vĩnh viễn sang Local khi chỉ gặp lỗi mạng/rate-limit tạm thời.

**Architecture:** 
1. Tối ưu gom câu (`CLOUD_MIN_END_SILENCE_MS`) và cấu hình hàng đợi (`mt_max_waiting`, `lag_warn_ms`) trong `session.rs` khi nguồn dịch là Cloud để giảm 50% số lượng request HTTP và ngăn dồn ứ hàng đợi.
2. Nâng `REQUEST_TIMEOUT` lên 12s và tối ưu tham số sinh (`max_tokens`, `thinkingConfig`) trong `cloud_mt.rs`.
3. Nâng cấp `FallbackMt` với cơ chế phân loại lỗi: lỗi sai key (401/403) lập tức khóa Local; lỗi tạm thời (429, timeout, rớt mạng) thì dự phòng câu đó sang Local nhưng chỉ khóa vĩnh viễn cả phiên sau 3 lần thất bại liên tiếp (consecutive failures threshold).

**Tech Stack:** Rust (`src-tauri`, `pipeline`), Tauri 2, reqwest blocking HTTP client, Vitest / Cargo test.

**Spec:** `docs/superpowers/specs/2026-11-07-cloud-mt-fallback-design.md`

## Global Constraints

- Mặc định `translationProvider = "local"` cho người dùng mới và cũ; không đổi hành vi mặc định của Local.
- API Key chỉ lưu trong OS `Keystore`, không ghi ra log, không ghi vào `settings.json`.
- Mọi thao tác lỗi mạng tuyệt đối không dùng `unwrap()`/`expect()` để không gây crash app.
- Khi nguồn dịch Cloud gặp lỗi, câu thoại hiện tại luôn được hoàn tất bằng `Local` (0 giây gián đoạn hiển thị phụ đề).
- Mọi thay đổi phải vượt qua toàn bộ test suite của `cargo test --manifest-path src-tauri/Cargo.toml`.

## Review Focus

1. **Người nói nhanh liên tục tạo nhiều câu ngắn:** `CLOUD_MIN_END_SILENCE_MS = 500ms` và `mt_max_waiting = 2` đảm bảo các câu liên tiếp được gộp sớm, không bắn dồn dập 25-35 req/phút lên Cloud.
2. **Lỗi HTTP 429 hoặc timeout 1 câu đơn lẻ:** Không khóa chết cờ `fell_back = true` cho cả phiên; câu bị lỗi được dịch mượt mà bằng Local, câu sau tự động thử lại Cloud.
3. **Lỗi sai API Key (HTTP 401 / 403):** Lập tức khóa vĩnh viễn fallback sang Local và kích hoạt `on_fallback()`, không thử lại vô ích.
4. **Mạng rớt liên tục ≥ 3 câu:** Khóa vĩnh viễn fallback sang Local và phát thông báo `Local (dự phòng)` lên giao diện để người dùng nắm được.
5. **Đổi nguồn dịch hoặc API Key trong Cài đặt:** Reset bộ đếm lỗi và trạng thái fallback về ban đầu như cũ.

---

### Task 1: Tối ưu gom câu và cấu hình hàng đợi khi dùng Cloud MT

**Files:**
- Modify: `src-tauri/src/session.rs`
- Test: `src-tauri/src/session.rs`

**Interfaces:**
- Produces:
  - `src-tauri/src/session.rs::CLOUD_MIN_END_SILENCE_MS = 500`
  - `src-tauri/src/session.rs::CLOUD_MT_MAX_WAITING = 2`
  - `src-tauri/src/session.rs::CLOUD_LAG_WARN_MS = 9000`
  - Cập nhật `engine_config(settings, ...)` áp dụng các thông số trên khi `cloud_active = true`.

- [ ] **Step 1: Viết test kiểm tra thông số `engine_config` khi bật Cloud MT**

Trong `src-tauri/src/session.rs` (module `tests`), thêm test `engine_config_adapts_queue_and_silence_for_cloud_mt`:

```rust
#[test]
fn engine_config_adapts_queue_and_silence_for_cloud_mt() {
    let mut s = Settings::default();
    s.translation_provider = TranslationProvider::Gemini;
    s.vad_end_silence_ms = 50; // Người dùng để mặc định 50ms của Local
    let cfg = engine_config(
        &s,
        &CapturePlan::Playback { source: AudioSource::default() },
        PipelineConfig::default(),
        0,
        Arc::new(std::sync::RwLock::new(pipeline::glossary::Glossary::default())),
        true,
    );
    assert_eq!(cfg.pipeline.segmenter.end_silence_ms, 500);
    assert_eq!(cfg.pipeline.queue.mt_max_waiting, 2);
    assert_eq!(cfg.pipeline.queue.lag_warn_ms, 9000);
}
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml session::tests::engine_config_adapts_queue_and_silence_for_cloud_mt`
Expected: FAIL (vì hiện tại `end_silence_ms` là 300, `mt_max_waiting` là 3, `lag_warn_ms` là 6000).

- [ ] **Step 3: Cập nhật `CLOUD_MIN_END_SILENCE_MS` và `engine_config` trong `src-tauri/src/session.rs`**

- Nâng hằng số:
  ```rust
  const CLOUD_MIN_END_SILENCE_MS: u64 = 500;
  const CLOUD_MT_MAX_WAITING: usize = 2;
  const CLOUD_LAG_WARN_MS: u64 = 9_000;
  ```
- Trong `engine_config`:
  ```rust
  let cloud_active = settings.translation_provider != TranslationProvider::Local;
  if cloud_active {
      pipeline.segmenter.end_silence_ms = pipeline.segmenter.end_silence_ms.max(CLOUD_MIN_END_SILENCE_MS);
      pipeline.queue.mt_max_waiting = CLOUD_MT_MAX_WAITING;
      pipeline.queue.lag_warn_ms = CLOUD_LAG_WARN_MS;
  }
  ```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml session::tests::engine_config_adapts_queue_and_silence_for_cloud_mt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/session.rs
git commit -m "perf(pipeline): optimize sentence bundling and queue limits for cloud mt"
```

---

### Task 2: Nâng timeout và tối ưu tham số sinh token cho Gemini / OpenAI

**Files:**
- Modify: `src-tauri/src/cloud_mt.rs`
- Test: `src-tauri/src/cloud_mt.rs`

**Interfaces:**
- Produces:
  - `src-tauri/src/cloud_mt.rs::REQUEST_TIMEOUT = Duration::from_secs(12)`
  - `src-tauri/src/cloud_mt.rs::build_gemini_native_body(model, prompt, max_tokens)`: tối ưu `maxOutputTokens` theo độ dài đầu vào (`(max_tokens * 2).clamp(128, 512)`).

- [ ] **Step 1: Viết test cho `build_gemini_native_body` với `maxOutputTokens` linh hoạt**

Cập nhật test `gemini_native_body_and_sse_parser_handle_all_models_and_thoughts` trong `src-tauri/src/cloud_mt.rs`:

```rust
#[test]
fn gemini_native_body_clamps_max_output_tokens_appropriately() {
    let b_short = build_gemini_native_body("gemini-flash-lite-latest", "Hi", 32);
    assert_eq!(b_short["generationConfig"]["maxOutputTokens"], 128);

    let b_long = build_gemini_native_body("gemini-flash-lite-latest", "A long sentence...", 300);
    assert_eq!(b_long["generationConfig"]["maxOutputTokens"], 512);
}
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud_mt::tests::gemini_native_body_clamps_max_output_tokens_appropriately`
Expected: FAIL (vì trước đó luôn cố định là 512).

- [ ] **Step 3: Cập nhật `REQUEST_TIMEOUT` và `build_gemini_native_body` trong `src-tauri/src/cloud_mt.rs`**

- Tăng timeout:
  ```rust
  const REQUEST_TIMEOUT: Duration = Duration::from_secs(12);
  ```
- Tối ưu `max_output`:
  ```rust
  fn build_gemini_native_body(model: &str, prompt: &str, max_tokens: u32) -> serde_json::Value {
      let max_output = (max_tokens * 2).clamp(128, 512);
      ...
  ```
- Với OpenAI trong `CloudMt::stream`:
  ```rust
  "max_tokens": (req.max_tokens * 2).clamp(128, 512),
  ```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud_mt::tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud_mt.rs
git commit -m "perf(cloud_mt): increase request timeout to 12s and optimize output token limits"
```

---

### Task 3: Cơ chế Resilient Fallback (Circuit Breaker & Tự phục hồi sau lỗi tạm thời)

**Files:**
- Modify: `src-tauri/src/cloud_mt.rs`
- Test: `src-tauri/src/cloud_mt.rs`

**Interfaces:**
- Produces:
  - Phân loại lỗi Cloud trong `CloudMt::stream`: phân biệt lỗi vĩnh viễn (HTTP 401/403) và lỗi tạm thời (HTTP 429, timeout, đứt mạng).
  - `FallbackMt`: thêm bộ đếm `consecutive_failures: Arc<AtomicUsize>`. Ngưỡng `MAX_CONSECUTIVE_FAILURES = 3`.
  - Khi gặp lỗi tạm thời: câu đó fallback ngay lập tức sang Local (`local.stream`), tăng `consecutive_failures`. Nếu `consecutive_failures < 3`, cờ `fell_back` KHÔNG bị bật vĩnh viễn, câu tiếp theo vẫn gọi Cloud.
  - Khi gọi Cloud thành công: reset `consecutive_failures` về 0.
  - Khi gặp lỗi vĩnh viễn (401/403 hoặc thiếu key) HOẶC `consecutive_failures >= 3`: kích hoạt `fell_back = true` vĩnh viễn và gọi `on_fallback()`.

- [ ] **Step 1: Viết test cho hành vi Resilient Fallback trong `src-tauri/src/cloud_mt.rs`**

Thêm các test cases:
1. `transient_cloud_error_falls_back_for_current_sentence_but_recovers_on_next`:
   - Câu 1: Cloud giả lập trả lỗi 429 -> câu 1 dịch bằng Local thành công, `fell_back` vẫn là `false`.
   - Câu 2: Cloud giả lập trả về thành công -> câu 2 dịch bằng Cloud thành công, `consecutive_failures` về 0.
2. `three_consecutive_transient_errors_trigger_permanent_fallback`:
   - 3 câu liên tiếp đều lỗi -> kích hoạt permanent fallback `fell_back = true`, gọi `on_fallback()`.
3. `auth_error_401_triggers_immediate_permanent_fallback`:
   - Lỗi HTTP 401 ngay câu đầu -> lập tức kích hoạt `fell_back = true` và `on_fallback()` mà không cần chờ 3 lần.

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud_mt::tests::transient_cloud_error_falls_back_for_current_sentence_but_recovers_on_next`
Expected: FAIL (vì hiện tại lỗi 1 lần là khóa vĩnh viễn).

- [ ] **Step 3: Cài đặt logic Resilient Fallback trong `src-tauri/src/cloud_mt.rs`**

- Định nghĩa mã lỗi hoặc kiểm tra chuỗi lỗi `is_fatal_auth_error(err)` (chứa `"HTTP 401"` hoặc `"HTTP 403"`).
- Thêm hằng số `MAX_CONSECUTIVE_FAILURES: usize = 3`.
- Bổ sung `consecutive_failures: Arc<AtomicUsize>` vào `FallbackMt`.
- Cập nhật hàm `stream_with_cloud`:
  ```rust
  match cloud.stream(req, &mut |chunk| ...) {
      Ok(end) => {
          consecutive_failures.store(0, Ordering::SeqCst);
          return Ok(end);
      }
      Err(err) => {
          let fatal = is_fatal_auth_error(&err);
          let fails = consecutive_failures.fetch_add(1, Ordering::SeqCst) + 1;
          if fatal || fails >= MAX_CONSECUTIVE_FAILURES {
              Self::do_fallback(fell_back, on_fallback);
          }
          if !emitted {
              return local.stream(req, on_delta);
          }
          return Err(err);
      }
  }
  ```

- [ ] **Step 4: Chạy lại toàn bộ test suite của `cloud_mt`**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud_mt::tests`
Expected: Tất cả các test cũ và mới đều PASS (100% green).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud_mt.rs
git commit -m "feat(cloud_mt): implement resilient fallback with automatic recovery on transient errors"
```

---

### Task 4: Chạy toàn bộ kiểm thử tích hợp (End-to-End Verification)

**Files:**
- Toàn bộ repo

- [ ] **Step 1: Chạy kiểm thử toàn bộ Rust crates**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS toàn bộ.

- [ ] **Step 2: Chạy kiểm thử TypeScript / Frontend**

Run: `pnpm test`
Expected: PASS toàn bộ.

- [ ] **Step 3: Kiểm tra build hoàn tất**

Run: `pnpm build`
Expected: Build thành công không có lỗi type hay bundle.

