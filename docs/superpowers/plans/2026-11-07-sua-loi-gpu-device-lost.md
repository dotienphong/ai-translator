# Kế hoạch sửa lỗi chọn GPU và mất thiết bị Vulkan (`2c556ad6da83c677`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-step. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa 3 nguyên nhân gốc của nhóm lỗi `2c556ad6da83c677` (`R-XPHA-DXYR` trên laptop có card rời 2 GB như NVIDIA GeForce MX250 kèm iGPU Intel UHD 620):
1. `asr-worker` không chọn nhầm card rời `< 2048 MiB` khi thiết bị đó nằm ở vị trí `index 0` trong danh sách Vulkan mà máy có iGPU ở vị trí sau.
2. App nhận diện card rời có VRAM `< 3 GiB` (như MX250 2 GB) đi kèm iGPU là cấu hình không đủ VRAM rời, để `llama-server` chạy trên CPU (`-ngl 0`) và không bật "Dịch khi nói" gây quá tải.
3. Giám sát `SidecarManager::with_llama` phát hiện lỗi mất thiết bị GPU (`ErrorDeviceLost` / `device lost`) hoặc hết VRAM (`OutOfDeviceMemory` / `out of memory`) trong kết quả HTTP 500 / SSE của `llama-server` (kể cả khi tiến trình chưa tự thoát và `/health` vẫn trả `200 OK`) để tự động khởi động lại `llama-server` và chuyển sang CPU sau 2 lần lỗi GPU liên tiếp.

**Architecture:** Thay đổi nhỏ, cô lập trong 3 module sẵn có (`crates/asr-worker/src/backend.rs`, `src-tauri/src/sidecar/probe.rs`, `crates/pipeline/src/supervisor.rs`). Không thay đổi giao thức IPC, không thêm thư viện, không dùng `unwrap`/`expect`/`panic!` trong đường chạy thật, và giữ nguyên hành vi của mọi cấu hình máy khác.

**Tech Stack:** Rust (`asr-worker`, `pipeline`, `src-tauri`).

**Ràng buộc bắt buộc từ người dùng:**
- Không làm ảnh hưởng tới bất kỳ tính năng có sẵn nào của app.
- Không được làm crash app (`panic = "abort"` ở bản release — tuyệt đối không thêm `unwrap()` / `expect()` / `panic!` vào code chạy thật).
- **KHÔNG ĐƯỢC COMMIT (`git commit`) khi chưa có sự cho phép rõ ràng của người dùng.**

---

### Task 1: Sửa `choose_gpu` trong `crates/asr-worker/src/backend.rs` ưu tiên iGPU khi không có card rời nào đủ 2048 MiB

**Files:**
- Modify: `crates/asr-worker/src/backend.rs:73-99`
- Test: `crates/asr-worker/src/backend.rs` (module `tests`)

- [ ] **Step 1: Viết unit test tái hiện lỗi `R-XPHA-DXYR` trong `crates/asr-worker/src/backend.rs`**

Thêm test vào cuối `mod tests` trong `crates/asr-worker/src/backend.rs`:

```rust
    /// Báo cáo thật `R-XPHA-DXYR`: Vulkan liệt kê MX250 (rời, 1900 MiB trống < 2048 MiB) ở vị trí 0 và Intel UHD 620
    /// (tích hợp) ở vị trí 1. Khi không có card rời nào đủ 2 GiB trống, phải chọn card tích hợp (1) thay vì quay về
    /// vị trí 0 (chính là chiếc MX250 vừa bị loại). Nếu máy chỉ có một card rời nhỏ duy nhất (không có iGPU) thì vẫn
    /// giữ vị trí 0.
    #[test]
    fn small_discrete_first_falls_back_to_integrated_gpu() {
        let list = [
            gpu("NVIDIA GeForce MX250", 1_900),
            igpu("Intel(R) UHD Graphics 620", 16_000),
        ];
        assert_eq!(choose(&list, None), Some((1, Reason::FirstDevice)));

        let single_small = [gpu("NVIDIA GeForce MX250", 1_900)];
        assert_eq!(choose(&single_small, None), Some((0, Reason::FirstDevice)));
    }
```

- [ ] **Step 2: Chạy test để xác nhận test mới fail với code hiện tại**

Run: `cargo test -p asr-worker small_discrete_first_falls_back_to_integrated_gpu`
Expected: FAIL (`left: Some((0, FirstDevice)), right: Some((1, FirstDevice))`).

- [ ] **Step 3: Sửa nhánh fallback trong `choose_gpu` (`crates/asr-worker/src/backend.rs`)**

Trong `crates/asr-worker/src/backend.rs`, cập nhật đoạn cuối của `choose_gpu`:

```rust
    if let Some((index, _)) = best_discrete {
        return Some(Choice {
            index,
            reason: Reason::DiscreteMostFree,
        });
    }
    let index = candidates.iter().position(|c| c.integrated).unwrap_or(0);
    Some(Choice {
        index,
        reason: Reason::FirstDevice,
    })
```

- [ ] **Step 4: Chạy toàn bộ unit test của `asr-worker`**

Run: `cargo test -p asr-worker`
Expected: PASS tất cả test (bao gồm các test cũ và `small_discrete_first_falls_back_to_integrated_gpu`).

---

### Task 2: Sửa `only_integrated_gpu` trong `src-tauri/src/sidecar/probe.rs` không tính card rời `< 3 GiB` VRAM là GPU rời đủ mạnh

**Files:**
- Modify: `src-tauri/src/sidecar/probe.rs:39-48`
- Test: `src-tauri/src/sidecar/probe.rs` (module `tests`)

- [ ] **Step 1: Viết unit test cho máy có card rời 2 GB + iGPU trong `src-tauri/src/sidecar/probe.rs`**

Thêm test vào `mod tests` trong `src-tauri/src/sidecar/probe.rs`:

```rust
    /// Báo cáo thật `R-XPHA-DXYR`: laptop có NVIDIA GeForce MX250 (rời, 2 GB VRAM) + Intel UHD 620 (tích hợp).
    /// Card rời 2 GB không đủ VRAM để gánh đồng thời `asr-worker` + `llama-server`, nên được coi như máy chỉ có iGPU
    /// (để `llama-server` chạy CPU và không bật "Dịch khi nói").
    #[test]
    fn small_discrete_2gb_with_integrated_counts_as_only_integrated() {
        let mx250_and_uhd = r#"{"ok":true,"backend":"vulkan","gpus":[
            {"name":"NVIDIA GeForce MX250","device_type":"discrete","device_local_bytes":2000000000},
            {"name":"Intel(R) UHD Graphics 620","device_type":"integrated","device_local_bytes":134217728}
        ]}"#;
        let out = parse_probe_json(mx250_and_uhd).unwrap();
        assert!(only_integrated_gpu(&out.gpus));
        assert!(too_slow_for_streaming(Some(&out), 8));
    }
```

- [ ] **Step 2: Chạy test để xác nhận test mới fail với code hiện tại**

Run: `cargo test --manifest-path src-tauri/Cargo.toml small_discrete_2gb_with_integrated_counts_as_only_integrated`
Expected: FAIL (`assertion failed: only_integrated_gpu(&out.gpus)`).

- [ ] **Step 3: Cập nhật `only_integrated_gpu` trong `src-tauri/src/sidecar/probe.rs`**

Thêm hằng số `MIN_DISCRETE_VRAM_BYTES` (3 GiB, phân tách rõ card rời 2 GB như MX130/MX250/MX330 với card rời 4 GB+ như GTX 1650 / RTX 3050) và cập nhật `only_integrated_gpu`:

```rust
/// Ngưỡng VRAM tối thiểu (3 GiB) để một card rời được tính là đủ sức chạy đồng thời `asr-worker` và `llama-server`
/// (hoặc bật "Dịch khi nói"). Các card rời 2 GB (như GeForce MX130/MX250/MX330) đi kèm iGPU sẽ được coi như máy chỉ có
/// iGPU để `llama-server` chạy trên CPU, tránh quá tải / `ErrorDeviceLost` (báo cáo `R-XPHA-DXYR`).
pub const MIN_DISCRETE_VRAM_BYTES: u64 = 3 << 30;

/// Máy có GPU tích hợp mà không có GPU rời nào đủ `MIN_DISCRETE_VRAM_BYTES` (hoặc không có GPU nào khác).
/// Dùng trên Windows để:
/// - Chạy `llama-server` bằng CPU (`-ngl 0`) để nhường iGPU cho `asr-worker` (spec GPU §6).
/// - Coi là máy yếu với tính năng "Dịch khi nói" (Q3 của review: một iGPU chạy đồng thời ba model không kịp).
pub fn only_integrated_gpu(gpus: &[GpuInfo]) -> bool {
    !gpus
        .iter()
        .any(|g| g.device_type == "discrete" && g.device_local_bytes >= MIN_DISCRETE_VRAM_BYTES)
        && gpus.iter().any(|g| g.device_type == "integrated")
}
```

- [ ] **Step 4: Chạy test của `src-tauri` cho `sidecar` và `session`**

Run: `cargo test --manifest-path src-tauri/Cargo.toml sidecar`
Expected: PASS tất cả test trong `sidecar::probe` và `sidecar::tests`.

---

### Task 3: Phát hiện `ErrorDeviceLost` và `OutOfMemory` trong `SidecarManager::with_llama` (`crates/pipeline/src/supervisor.rs`)

**Files:**
- Modify: `crates/pipeline/src/supervisor.rs:1020-1044` và hàm nhận diện lỗi ở cuối file
- Modify: `crates/pipeline/src/bin/fake_llama_server.rs` (thêm lệnh kịch bản `device_lost_on:<n>` cho test tích hợp)
- Test: `crates/pipeline/src/supervisor.rs` và `crates/pipeline/tests/lifecycle.rs`

- [ ] **Step 1: Thêm unit test cho `looks_device_lost` và test tích hợp cho `llama-server` trả HTTP 500 `ErrorDeviceLost`**

1. Trong `crates/pipeline/src/bin/fake_llama_server.rs`:
   - Thêm trường `device_lost_on: Option<u32>` vào `struct Plan`.
   - Trong `parse(line: &str)`: thêm nhánh `"device_lost_on" => plan.device_lost_on = value.parse().ok(),`.
   - Trong nhánh `"/v1/chat/completions"` (ngay sau `if plan.crash_on == Some(chats)`):
     ```rust
     if plan.device_lost_on == Some(chats) {
         respond(
             &stream,
             "500 Internal Server Error",
             "application/json",
             r#"{"error":{"code":500,"message":"decode() failed: vk::Device::getFenceStatus: ErrorDeviceLost","type":"server_error"}}"#,
         );
         continue;
     }
     ```
     (Tiến trình `fake_llama_server` vẫn sống và `/health` vẫn trả `200 OK`, tái hiện đúng 100% trạng thái của `llama-server` trong báo cáo `R-XPHA-DXYR`).

2. Trong `crates/pipeline/tests/lifecycle.rs`, thêm test tích hợp:
   ```rust
   /// Báo cáo thật `R-XPHA-DXYR`: `llama-server` gặp `vk::Device::getFenceStatus: ErrorDeviceLost` trên Vulkan, trả HTTP 500
   /// nhưng tiến trình chưa thoát và `/health` vẫn trả 200 OK. Giám sát phải coi đây là lỗi chết thiết bị GPU, tắt server
   /// hỏng, khởi động lại để dịch lại, và chuyển sang CPU sau 2 lần lỗi GPU liên tiếp.
   #[test]
   fn llama_server_device_lost_restarts_and_falls_back_to_cpu_after_two_failures() {
       let s = setup(
           "llama-device-lost",
           true,
           &[],
           &["device_lost_on:1", "device_lost_on:1", "ok"],
       );
       s.manager.ensure_started().unwrap();
       // Lần gọi `translate_hello` đầu: gặp ErrorDeviceLost lần 1 -> khởi động lại trên GPU -> thử lại (attempt 2) lại
       // gặp ErrorDeviceLost lần 2 -> chuyển sang CPU (`cpu Llama`) và khởi động lại trên CPU.
       // Vì `translate` chỉ thử tối đa 2 lần cho một câu, câu tiếp theo sẽ dịch thành công trên CPU (`ngl=0`).
       let first = translate_hello(&s);
       assert!(matches!(first, Outcome::Failed(_)), "{first:?}");
       match translate_hello(&s) {
           Outcome::Done(t) => assert_eq!(t.text, "VI: Hello there"),
           other => panic!("{other:?}"),
       }
       let names = s.events.names();
       assert!(names.contains(&"cpu Llama".to_string()), "{names:?}");
       assert_eq!(names.last().unwrap(), "ready Llama gpu=false", "{names:?}");
       assert_eq!(
           s.t.read("llama-events"),
           "start ngl=auto extra=\nchat 1 repeat=1.1 max=192\nstart ngl=auto extra=\nchat 1 repeat=1.1 max=192\nstart ngl=0 extra=\nchat 1 repeat=1.1 max=192\n"
       );
   }
   ```

- [ ] **Step 2: Chạy test tích hợp để xác nhận test mới fail với code hiện tại**

Run: `cargo test -p pipeline --test lifecycle llama_server_device_lost_restarts_and_falls_back_to_cpu_after_two_failures`
Expected: FAIL (vì `server.exited()` là `None` và `server.healthy()` là `true`, nên `llama-server` không được khởi động lại và không chuyển sang CPU).

- [ ] **Step 3: Thêm `looks_device_lost` và cập nhật `SidecarManager::with_llama` trong `crates/pipeline/src/supervisor.rs`**

1. Thêm hàm `looks_device_lost` ngay cạnh `looks_out_of_memory` trong `crates/pipeline/src/supervisor.rs`:
   ```rust
   /// Nhận diện lỗi mất thiết bị GPU (`VK_ERROR_DEVICE_LOST` / `ErrorDeviceLost` của Vulkan, Direct3D/Metal device lost)
   /// trong thông báo lỗi của `llama-server`. Khi thiết bị GPU đã mất, tiến trình `llama-server` có thể vẫn sống và trả
   /// `200 OK` ở `/health`, nhưng mọi lần `decode()` tiếp theo đều thất bại cho tới khi khởi động lại tiến trình.
   pub fn looks_device_lost(text: &str) -> bool {
       let lower = text.to_lowercase();
       lower.contains("errordevicelost") || lower.contains("device lost") || lower.contains("device_lost")
   }
   ```

2. Cập nhật nhánh `Err(e)` trong `SidecarManager::with_llama` (`crates/pipeline/src/supervisor.rs:1025-1033`):
   ```rust
           Err(e) => {
               let reason = format!("{e:#}");
               let oom = looks_out_of_memory(&reason);
               if oom {
                   self.events.on_event(&SidecarEvent::OutOfMemory { which: Which::Llama });
               }
               let dead = server.exited().is_some()
                   || looks_device_lost(&reason)
                   || oom
                   || !server.healthy();
               if dead {
                   self.after_llama_failure(&mut slot, &reason)
                       .map_err(|e| MtError::Unavailable(e.reason))?;
               }
               Err(MtError::Failed(reason))
           }
   ```

3. Thêm unit test cho `looks_device_lost` vào `mod tests` cuối `crates/pipeline/src/supervisor.rs`:
   ```rust
       #[test]
       fn detects_device_lost_messages() {
           assert!(looks_device_lost(
               "llama-server trả 500 Internal Server Error: {\"code\":500,\"message\":\"decode() failed: vk::Device::getFenceStatus: ErrorDeviceLost\"}"
           ));
           assert!(looks_device_lost("ggml_vulkan: device lost on Vulkan0"));
           assert!(!looks_device_lost("connection closed before message completed"));
       }
   ```

- [ ] **Step 4: Chạy test của `pipeline`**

Run: `cargo test -p pipeline`
Expected: PASS toàn bộ unit test và integration test trong `pipeline`.

---

### Task 4: Kiểm tra tổng thể toàn bộ workspace (Không commit khi chưa được phép)

**Files:**
- Không sửa thêm file nào; chạy kiểm tra toàn bộ test của workspace và `src-tauri`.

- [ ] **Step 1: Chạy toàn bộ test của workspace Cargo gốc**

Run: `cargo test`
Expected: PASS 100%, không có cảnh báo hay lỗi biên dịch.

- [ ] **Step 2: Chạy toàn bộ test của `src-tauri`**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS 100%, không ảnh hưởng tới bất kỳ tính năng hiện có nào.

- [ ] **Step 3: Kiểm tra `git status` và `git diff`, báo cáo kết quả cho người dùng**

Run: `git status --short`
Expected: Chỉ hiển thị các file đã lên kế hoạch sửa; **KHÔNG chạy `git commit`** cho tới khi người dùng cho phép.
