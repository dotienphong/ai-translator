# Gõ dịch 03: phím tắt, cửa sổ thật, dán, trang ô soạn, spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bấm ⌃⌥G (Ctrl+Alt+G) ở app bất kỳ thì ô soạn thật hiện ra (NSPanel trên macOS, cửa sổ topmost trên Windows), gõ thì bản dịch hiện dần, Enter thì bản dịch được dán vào ô chat cũ. Kết thúc bằng spike S1–S3 trên Mac cùng chủ dự án: đây là **cổng** của cả tính năng.

**Architecture:** `HotkeyAction::Compose` đi qua đúng luật phím tắt sẵn có; tắt Gõ dịch (`compose.enabled = false`) thì phím không đăng ký, đổi phím lúc đó chỉ kiểm rồi lưu. Bước migrate `v2→v3` giữ phím người dùng đã tự đặt trùng `Ctrl+Alt+G`. Bản thật của trait `compose::Native` nằm ở `native_macos.rs` (NSPanel không kích hoạt app, `NSPasteboard`, `CGEventPost` ⌘V, quyền Trợ năng) và `native_windows.rs` (Win32 clipboard, `SetForegroundWindow`, `SendInput` Ctrl+V). Trang `compose.html` (React, Zustand) chỉ gọi lệnh `compose_*` và nghe `compose://*`.

**Tech Stack:** Rust 2024, Tauri 2.12, `tauri-nspanel` 2.1, `tauri-plugin-global-shortcut`, `objc2-app-kit` / `objc2-core-graphics` 0.3.2 (đã có trong đồ thị phụ thuộc, qua tao và tauri-nspanel), `windows` 0.62 (thêm feature), React 19, Zustand 5, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-17-go-dich-design.md` §0, §1.1–§1.4, §3.1, §3.5, §3.7, §4, §5, §7. Tổng quan và quy tắc chung: `docs/superpowers/plans/2026-10-17-go-dich-00-tong-quan.md` (đọc trước). Cần kế hoạch 01, 02 đã xong.

**Quy tắc chung:** như mục "Quy tắc chung cho mọi kế hoạch" của kế hoạch 00. Mã ở đây đã chạy thật ở commit `91802a6` của nhánh `go-dich-proto` (riêng `PASTE_DELAY` có thể đổi theo spike S2).

## Cấu trúc file

| File | Việc |
|---|---|
| Modify `src-tauri/src/hotkeys.rs` | `HotkeyAction::Compose`; `check_rebind`, `activate`, `deactivate`; `rebind` dùng `check_rebind` |
| Modify `src-tauri/src/settings/mod.rs` | `Hotkeys::compose`, `COMPOSE_HOTKEY`, `Settings::active_hotkeys` |
| Modify `src-tauri/src/settings/migrate.rs` | Bước `v2_to_v3`, phím dự phòng |
| Modify `src-tauri/src/hotkey_registry.rs` | `register_all` nhận danh sách phím; `set_active` |
| Modify `src-tauri/src/actions.rs` | Phím tắt mở ô soạn; bật/tắt Gõ dịch đăng ký hay gỡ phím; đổi phím khi đang tắt |
| Modify `src-tauri/src/lib.rs` | Tạo ô soạn lúc mở app; đăng ký `active_hotkeys` |
| Modify `src-tauri/src/window.rs` | Ô soạn mất focus hay bị đóng thì chỉ ẩn |
| Modify `src-tauri/src/overlay/mod.rs`, `src-tauri/src/overlay/macos.rs` | Cho ô soạn dùng lại `prevent_activation` |
| Modify `src-tauri/Cargo.toml`, `Cargo.lock` | `objc2-app-kit`, `objc2-core-graphics`, feature `NSGeometry`; feature Win32 |
| Create `src-tauri/src/compose/native_macos.rs` | Bản thật của `Native` trên macOS |
| Create `src-tauri/src/compose/native_windows.rs` | Bản thật của `Native` trên Windows |
| Modify `src-tauri/src/compose/mod.rs` | Chọn bản thật theo hệ điều hành; `compose::create` |
| Modify `src-tauri/src/compose/tests.rs` | Test phím tắt và bật/tắt |
| Modify `src/lib/ipc.ts` | `HotkeyAction` thêm `"compose"`; kiểu, lệnh, sự kiện của ô soạn |
| Create `src/lib/compose.ts`, `src/lib/compose.test.ts` | Phần thuần: phím, bản dịch đang hiện, nút của hộp lỗi |
| Create `src/store/compose.ts`, `src/store/compose.test.ts` | Store của ô soạn |
| Create `compose.html`, `src/windows/compose/compose.tsx`, `src/windows/compose/compose.css`; Modify `vite.config.ts` | Trang ô soạn |
| Modify `src/i18n/{en,vi,ja,zh,ko}.ts`, `src/store/app.test.ts`, `scripts/ui-preview/tauri-mock.ts` | Chuỗi mới; phím `compose` trong cài đặt mẫu |
| Create `bench/2026-10-17-go-dich/results/spike.md` | Biên bản spike S1–S3 |

Mỗi task kết thúc ở trạng thái biên dịch được và mọi test xanh, trừ một chỗ: sau Task 4 bản Windows chưa biên dịch được (thiếu `native_windows.rs`) tới hết Task 5, nên `scripts/check-windows.sh` chỉ chạy từ Task 5.

---

### Task 0: Kiểm nhánh và mốc xuất phát

**Files:** không sửa file.

- [ ] **Step 1: Kiểm nhánh và kế hoạch 02**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git status --short && ls src-tauri/src/compose/
```
Expected: `go-dich`, không có file đổi, thư mục có `detect.rs mod.rs target.rs tests.rs worker.rs`.

- [ ] **Step 2: Chạy mốc**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm build 2>&1 | tail -1 && cargo test --locked -p meeting-translator --lib 2>&1 | grep 'test result' && pnpm test 2>&1 | grep Tests
```
Expected: `✓ built`, `passed` = N0 + 36 (bản 2026-10-17: 679; **ghi là N2**), `Tests  297 passed` (T0). Có test đỏ thì dừng và báo.

---

### Task 1: Việc `compose` trong bộ phím tắt

**Files:**
- Modify: `src-tauri/src/hotkeys.rs`, `src-tauri/src/settings/mod.rs`, `src-tauri/src/actions.rs`
- Modify: `src/lib/ipc.ts`, `src/i18n/{en,vi,ja,zh,ko}.ts`, `src/store/app.test.ts`, `scripts/ui-preview/tauri-mock.ts`

Spec §0, §3.5: việc phím tắt thứ sáu, khóa `compose`, mặc định `Ctrl+Alt+G` (macOS hiện là ⌃⌥G), cùng nhóm ⌃⌥ với năm phím có sẵn. Phím tắt gọi `compose::toggle` (kế hoạch 02). Phía giao diện, nhóm Phím tắt hiện thêm dòng "Mở Gõ dịch" (`HotkeySettings.tsx` lặp qua `HOTKEY_ACTIONS` và đọc nhãn `hotkeys.<việc>`), nên phải có chuỗi `hotkeys.compose` ở năm từ điển.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src-tauri/src/hotkeys.rs`, khối `mod tests`, tìm đoạn (duy nhất):

```rust
    #[test]
    fn action_keys_match_settings_fields() {
        let keys: Vec<_> = HotkeyAction::ALL.iter().map(|a| a.key()).collect();
        assert_eq!(
            keys,
            ["toggleSession", "toggleOverlay", "toggleLock", "scrollUp", "scrollDown"]
        );
```

thay bằng:

```rust
    /// Spec 2026-10-17-go-dich §0: phím mặc định của Gõ dịch ở dạng chuẩn, cùng nhóm ⌃⌥, không trùng năm phím cũ.
    #[test]
    fn the_compose_default_is_canonical_and_distinct() {
        assert_eq!(canonical_of("Ctrl+Alt+G").unwrap(), "Ctrl+Alt+G");
        let mut all = DEFAULTS.to_vec();
        all.push((HotkeyAction::Compose, "Ctrl+Alt+G"));
        assert_eq!(check_all(&all), Ok(()));
    }

    #[test]
    fn action_keys_match_settings_fields() {
        let keys: Vec<_> = HotkeyAction::ALL.iter().map(|a| a.key()).collect();
        assert_eq!(
            keys,
            [
                "toggleSession",
                "toggleOverlay",
                "toggleLock",
                "scrollUp",
                "scrollDown",
                "compose"
            ]
        );
```

Trong `src-tauri/src/settings/mod.rs`, khối `mod tests`, tìm đoạn (duy nhất):

```rust
                "Ctrl+Alt+PageDown"
            ]
```

thay bằng:

```rust
                "Ctrl+Alt+PageDown",
                "Ctrl+Alt+G"
            ]
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib hotkeys 2>&1 | grep -E '^error' | head -3
```
Expected: `no variant or associated item named Compose found for enum HotkeyAction`.

- [ ] **Step 3: Việc `Compose`**

Trong `src-tauri/src/hotkeys.rs`, tìm đoạn (duy nhất):

```rust
    /// Cuộn phụ đề xuống câu mới hơn.
    ScrollDown,
}
```

thay bằng:

```rust
    /// Cuộn phụ đề xuống câu mới hơn.
    ScrollDown,
    /// Mở hoặc đóng ô soạn Gõ dịch (spec 2026-10-17-go-dich §1.1). Chỉ đăng ký khi bật Gõ dịch (`compose.enabled`).
    Compose,
}
```

Cùng file, tìm đoạn (duy nhất):

```rust
    pub const ALL: [HotkeyAction; 5] = [
        Self::ToggleSession,
        Self::ToggleOverlay,
        Self::ToggleLock,
        Self::ScrollUp,
        Self::ScrollDown,
    ];
```

thay bằng:

```rust
    pub const ALL: [HotkeyAction; 6] = [
        Self::ToggleSession,
        Self::ToggleOverlay,
        Self::ToggleLock,
        Self::ScrollUp,
        Self::ScrollDown,
        Self::Compose,
    ];
```

Cùng file, tìm dòng (duy nhất):

```rust
            Self::ScrollDown => "scrollDown",
```

thay bằng:

```rust
            Self::ScrollDown => "scrollDown",
            Self::Compose => "compose",
```

- [ ] **Step 4: Khóa `hotkeys.compose`**

Trong `src-tauri/src/settings/mod.rs`, tìm đoạn (duy nhất):

```rust
    pub scroll_up: String,
    pub scroll_down: String,
}
```

thay bằng:

```rust
    pub scroll_up: String,
    pub scroll_down: String,
    /// Mở ô soạn Gõ dịch (spec 2026-10-17-go-dich §0, §3.5). File của bản trước chưa có khóa này thì nhận mặc định, hay phím
    /// dự phòng khi người dùng đã tự đặt mặc định cho việc khác (bước migrate `v2→v3`).
    pub compose: String,
}
```

Cùng file, tìm dòng (duy nhất):

```rust
            HotkeyAction::ScrollDown => &self.scroll_down,
```

thay bằng:

```rust
            HotkeyAction::ScrollDown => &self.scroll_down,
            HotkeyAction::Compose => &self.compose,
```

Cùng file, tìm dòng (duy nhất):

```rust
            HotkeyAction::ScrollDown => self.scroll_down = accelerator,
```

thay bằng:

```rust
            HotkeyAction::ScrollDown => self.scroll_down = accelerator,
            HotkeyAction::Compose => self.compose = accelerator,
```

Cùng file, tìm dòng (duy nhất):

```rust
    pub fn bindings(&self) -> [(HotkeyAction, &str); 5] {
```

thay bằng:

```rust
    pub fn bindings(&self) -> [(HotkeyAction, &str); 6] {
```

Cùng file, tìm dòng (duy nhất):

```rust
const MAX_ID_LEN: usize = 512;
```

thay bằng:

```rust
const MAX_ID_LEN: usize = 512;
/// Phím tắt mặc định của Gõ dịch: ⌃⌥G trên macOS, Ctrl+Alt+G trên Windows (spec 2026-10-17-go-dich §0). Cùng nhóm ⌃⌥ với
/// các phím tắt có sẵn của app, rất ít app khác dùng.
pub const COMPOSE_HOTKEY: &str = "Ctrl+Alt+G";
```

Cùng file, trong `Settings::defaults`, tìm dòng (duy nhất):

```rust
                scroll_down: "Ctrl+Alt+PageDown".into(),
```

thay bằng:

```rust
                scroll_down: "Ctrl+Alt+PageDown".into(),
                compose: COMPOSE_HOTKEY.into(),
```

- [ ] **Step 5: Phím tắt mở ô soạn**

Trong `src-tauri/src/actions.rs`, tìm dòng (duy nhất):

```rust
use crate::{diagnostics, events, hotkey_registry, login_item, overlay, session, system, tray, updater, window};
```

thay bằng:

```rust
use crate::{
    compose, diagnostics, events, hotkey_registry, login_item, overlay, session, system, tray, updater, window,
};
```

Cùng file, trong `run_hotkey`, tìm đoạn (duy nhất):

```rust
            events::overlay_scroll(app, ScrollDirection::Down);
            Ok(())
        }
    };
```

thay bằng:

```rust
            events::overlay_scroll(app, ScrollDirection::Down);
            Ok(())
        }
        HotkeyAction::Compose => {
            compose::toggle(app);
            Ok(())
        }
    };
```

- [ ] **Step 6: Chạy Rust, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib 2>&1 | grep -E 'test result|FAILED|^error'
```
Expected: `test result: ok.` với `passed` = N2 + 1, không `FAILED`.

- [ ] **Step 7: Phía giao diện**

Trong `src/lib/ipc.ts`, tìm dòng (duy nhất):

```ts
export type HotkeyAction = "toggleSession" | "toggleOverlay" | "toggleLock" | "scrollUp" | "scrollDown";
```

thay bằng:

```ts
// "compose": mở ô soạn Gõ dịch (spec 2026-10-17-go-dich §1.1); chỉ đăng ký khi bật Gõ dịch.
export type HotkeyAction = "toggleSession" | "toggleOverlay" | "toggleLock" | "scrollUp" | "scrollDown" | "compose";
```

Cùng file, tìm đoạn (duy nhất):

```ts
  "scrollDown",
];
```

thay bằng:

```ts
  "scrollDown",
  "compose",
];
```

Trong `src/store/app.test.ts`, tìm đoạn (duy nhất):

```ts
    scrollDown: "Ctrl+Alt+PageDown",
  },
```

thay bằng:

```ts
    scrollDown: "Ctrl+Alt+PageDown",
    compose: "Ctrl+Alt+G",
  },
```

Trong `scripts/ui-preview/tauri-mock.ts`, tìm đoạn (duy nhất):

```ts
    scrollDown: "Ctrl+Alt+PageDown",
  },
```

thay bằng:

```ts
    scrollDown: "Ctrl+Alt+PageDown",
    compose: "Ctrl+Alt+G",
  },
```

Trong mỗi file dưới đây, tìm dòng `"hotkeys.scrollDown": …` (duy nhất trong file) và thêm ngay sau nó một dòng:

`src/i18n/en.ts`:
```ts
  "hotkeys.compose": "Open Type & Translate",
```

`src/i18n/vi.ts`:
```ts
  "hotkeys.compose": "Mở Gõ dịch",
```

`src/i18n/ja.ts`:
```ts
  "hotkeys.compose": "入力翻訳を開く",
```

`src/i18n/zh.ts`:
```ts
  "hotkeys.compose": "打开输入翻译",
```

`src/i18n/ko.ts`:
```ts
  "hotkeys.compose": "입력 번역 열기",
```

- [ ] **Step 8: Chạy giao diện**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec tsc --noEmit && echo TSC-OK && pnpm test 2>&1 | grep -E 'Tests|failed'
```
Expected: `TSC-OK`, `Tests  297 passed`.

- [ ] **Step 9: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/src/hotkeys.rs src-tauri/src/settings/mod.rs src-tauri/src/actions.rs src/lib/ipc.ts src/i18n src/store/app.test.ts scripts/ui-preview/tauri-mock.ts && git commit -q -m "feat(go-dich): phím tắt Gõ dịch, mặc định Ctrl+Alt+G" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: Bước migrate `v2→v3` giữ phím của người dùng

**Files:**
- Modify: `src-tauri/src/settings/migrate.rs`

QĐ4 của kế hoạch 00: file cài đặt thiếu `hotkeys.compose` vốn nhận mặc định khi ghép. Nhưng nếu người dùng đã tự đặt `Ctrl+Alt+G` (viết kiểu nào cũng vậy, ví dụ `control+alt+KeyG`) cho một việc khác, mặc định mới sẽ trùng và việc ghép cả nhóm phím tắt thất bại, nên phím của họ có thể bị kéo về mặc định. Bước `v2→v3` cho Gõ dịch phím dự phòng đầu tiên còn trống, theo thứ tự `Ctrl+Alt+Shift+G`, `Ctrl+Alt+Y`, `Ctrl+Alt+J`. File đã ở bản 3 thì bước này không chạy lại. Schema lên bản 3 nên file bản 2 được ghi lại.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src-tauri/src/settings/migrate.rs`, khối `mod tests`, tìm đoạn (duy nhất):

```rust
        assert!(loaded.needs_save(), "file bản 1 phải được ghi lại ở bản 2");
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(2));
```

thay bằng:

```rust
        assert!(loaded.needs_save(), "file bản 1 phải được ghi lại ở bản hiện tại");
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(CURRENT_SCHEMA_VERSION));
```

Cùng file, tìm đoạn (duy nhất, ở cuối file):

```rust
        assert_eq!(entries["sendErrorReports"], json!(false));
    }
}
```

thay bằng:

```rust
        assert_eq!(entries["sendErrorReports"], json!(false));
    }

    /// Spec 2026-10-17-go-dich §3.5: file bản 2 chưa có phím Gõ dịch thì nhận `Ctrl+Alt+G`, không bị coi là khóa hỏng.
    #[test]
    fn a_version_2_file_gets_the_compose_hotkey() {
        let raw = object(json!({
            "schemaVersion": 2,
            "hotkeys": { "toggleSession": "Ctrl+Alt+K", "scrollUp": "Ctrl+Alt+PageUp" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.compose, "Ctrl+Alt+G");
        assert_eq!(loaded.settings.hotkeys.toggle_session, "Ctrl+Alt+K");
        assert!(loaded.rejected.is_empty());
        assert!(loaded.needs_save(), "ghi lại ở bản 3");
    }

    /// Người dùng đã tự đặt `Ctrl+Alt+G` (viết kiểu nào cũng vậy) cho việc khác: giữ phím của họ, Gõ dịch nhận phím dự phòng
    /// đầu tiên còn trống. File bản 3 thì bước này không chạy lại.
    #[test]
    fn a_user_shortcut_on_ctrl_alt_g_is_kept() {
        let raw = object(json!({
            "schemaVersion": 2,
            "hotkeys": { "toggleLock": "control+alt+KeyG" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.toggle_lock, "Ctrl+Alt+G");
        assert_eq!(loaded.settings.hotkeys.compose, "Ctrl+Alt+Shift+G");
        assert!(loaded.rejected.is_empty());
        let raw = object(json!({
            "schemaVersion": 2,
            "hotkeys": { "toggleLock": "Ctrl+Alt+G", "toggleOverlay": "Ctrl+Alt+Shift+G" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.compose, "Ctrl+Alt+Y");
        assert_eq!(
            (
                loaded.settings.hotkeys.toggle_lock.as_str(),
                loaded.settings.hotkeys.toggle_overlay.as_str()
            ),
            ("Ctrl+Alt+G", "Ctrl+Alt+Shift+G")
        );
        let raw = object(json!({
            "schemaVersion": 3,
            "hotkeys": { "toggleLock": "Ctrl+Alt+J", "compose": "Ctrl+Alt+Q" },
        }));
        assert_eq!(load(raw, defaults()).settings.hotkeys.compose, "Ctrl+Alt+Q");
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib settings::migrate 2>&1 | grep -E 'panicked|test result' | head -4
```
Expected: hai test mới đỏ (`ghi lại ở bản 3`; phím của `a_user_shortcut_on_ctrl_alt_g_is_kept` không như mong đợi).

- [ ] **Step 3: Bước `v2_to_v3`**

Trong `src-tauri/src/settings/migrate.rs`, tìm dòng (duy nhất):

```rust
use super::{Hotkeys, Settings};
```

thay bằng:

```rust
use super::{COMPOSE_HOTKEY, Hotkeys, Settings};
```

Cùng file, tìm dòng (duy nhất):

```rust
pub const MIGRATIONS: &[Migration] = &[v0_to_v1, v1_to_v2];
```

thay bằng:

```rust
pub const MIGRATIONS: &[Migration] = &[v0_to_v1, v1_to_v2, v2_to_v3];
```

Cùng file, tìm dòng (duy nhất):

```rust
/// Khóa chỉ có lúc chạy, không đọc từ file và không ghi vào file (`Settings::revision`).
```

thay bằng:

```rust
/// Phím dự phòng của Gõ dịch, theo thứ tự, khi người dùng đã tự đặt [`COMPOSE_HOTKEY`] cho việc khác.
const COMPOSE_FALLBACKS: &[&str] = &["Ctrl+Alt+Shift+G", "Ctrl+Alt+Y", "Ctrl+Alt+J"];

/// Bản 3 thêm phím tắt Gõ dịch (`hotkeys.compose`, mặc định `Ctrl+Alt+G`; spec 2026-10-17-go-dich §3.5). File thiếu khóa thì
/// nhận mặc định khi ghép, không cần làm gì; riêng khi người dùng đã tự đặt `Ctrl+Alt+G` cho một việc khác, mặc định đó sẽ
/// trùng và việc ghép cả nhóm thất bại, nên khóa của người dùng có thể bị kéo về mặc định. Bước này giữ phím của người dùng: Gõ
/// dịch nhận phím dự phòng đầu tiên còn trống.
fn v2_to_v3(raw: &mut Map<String, Value>) {
    let Some(Value::Object(keys)) = raw.get_mut("hotkeys") else {
        return;
    };
    if keys.contains_key("compose") {
        return;
    }
    let used: Vec<String> = keys
        .values()
        .filter_map(Value::as_str)
        .filter_map(|accelerator| hotkeys::parse(accelerator).ok())
        .map(|(_, canonical)| canonical)
        .collect();
    if !used.iter().any(|u| u == COMPOSE_HOTKEY) {
        return;
    }
    if let Some(free) = COMPOSE_FALLBACKS.iter().find(|f| !used.iter().any(|u| u == *f)) {
        keys.insert("compose".into(), Value::String((*free).into()));
    }
}

/// Khóa chỉ có lúc chạy, không đọc từ file và không ghi vào file (`Settings::revision`).
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib 2>&1 | grep -E 'test result|FAILED'
```
Expected: `test result: ok.` với `passed` = N2 + 3, không `FAILED`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/src/settings/migrate.rs && git commit -q -m "feat(go-dich): migrate cài đặt lên bản 3, giữ phím người dùng đã đặt trùng Ctrl+Alt+G" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: Bật/tắt Gõ dịch đăng ký hay gỡ phím tắt

**Files:**
- Modify: `src-tauri/src/hotkeys.rs`, `src-tauri/src/settings/mod.rs`, `src-tauri/src/hotkey_registry.rs`, `src-tauri/src/actions.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/compose/tests.rs`

Spec §1.4, §3.5:
- Lúc mở app chỉ đăng ký phím của các việc đang bật (`Settings::active_hotkeys`: Gõ dịch tắt thì không có phím của nó).
- Đổi `compose.enabled` (qua `update_settings` hay nút "Luôn chỉ chép"… nói chung là `commit_settings`) thì đăng ký hay gỡ phím, sửa danh sách `hotkey_failures`; tắt thì đóng ô soạn nếu đang mở.
- Gõ dịch đang tắt mà đổi phím của nó thì chỉ kiểm (đọc được, có phím bổ trợ, không trùng việc khác) rồi lưu, không gọi hệ điều hành (`hotkeys::check_rebind`). `check_rebind` cũng là bước kiểm đầu của `rebind`.
- `Settings::validate` vẫn kiểm trùng cả sáu phím, kể cả khi Gõ dịch đang tắt.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src-tauri/src/hotkeys.rs`, khối `mod tests`, tìm đoạn (duy nhất, ở cuối file):

```rust
        assert!(registrar.calls.borrow().is_empty());
        assert_eq!(bound.get(HotkeyAction::ToggleLock), None);
    }
}
```

thay bằng:

```rust
        assert!(registrar.calls.borrow().is_empty());
        assert_eq!(bound.get(HotkeyAction::ToggleLock), None);
    }

    /// Spec 2026-10-17-go-dich §1.4: Gõ dịch đang tắt thì đổi phím chỉ kiểm (đọc được, có phím bổ trợ, không trùng) rồi lưu,
    /// không gọi hệ điều hành.
    #[test]
    fn a_disabled_action_is_checked_without_registering() {
        assert_eq!(
            check_rebind(&DEFAULTS, HotkeyAction::Compose, "control+alt+KeyJ"),
            Ok("Ctrl+Alt+J".into())
        );
        assert_eq!(
            check_rebind(&DEFAULTS, HotkeyAction::Compose, "Ctrl+Alt+T"),
            Err(HotkeyError::Duplicate)
        );
        assert_eq!(
            check_rebind(&DEFAULTS, HotkeyAction::Compose, "J"),
            Err(HotkeyError::NoModifier)
        );
    }

    /// Bật Gõ dịch thì đăng ký phím của nó (một lần), tắt thì gỡ; hệ điều hành từ chối thì báo `false` và không giữ gì.
    #[test]
    fn enabling_and_disabling_registers_and_unregisters() {
        let registrar = FakeRegistrar::default();
        let mut bound = started(&registrar);
        assert!(activate(&registrar, &mut bound, HotkeyAction::Compose, "Ctrl+Alt+G"));
        assert!(activate(&registrar, &mut bound, HotkeyAction::Compose, "Ctrl+Alt+G"));
        let g = parse("Ctrl+Alt+G").unwrap().0;
        assert_eq!(bound.action_for(g.id()), Some(HotkeyAction::Compose));
        deactivate(&registrar, &mut bound, HotkeyAction::Compose);
        deactivate(&registrar, &mut bound, HotkeyAction::Compose);
        assert_eq!(bound.get(HotkeyAction::Compose), None);
        assert_eq!(*registrar.calls.borrow(), ["+Ctrl+Alt+G", "-Ctrl+Alt+G"]);
        registrar.refuse("Ctrl+Alt+G");
        assert!(!activate(&registrar, &mut bound, HotkeyAction::Compose, "Ctrl+Alt+G"));
        assert_eq!(bound.get(HotkeyAction::Compose), None);
    }
}
```

Trong `src-tauri/src/settings/mod.rs`, khối `mod tests`, tìm đoạn (duy nhất):

```rust
    #[test]
    fn default_target_language_follows_every_ui_language() {
```

thay bằng:

```rust
    /// Spec 2026-10-17-go-dich §1.4: tắt Gõ dịch thì phím của nó không đăng ký (vẫn giữ trong cài đặt).
    #[test]
    fn the_compose_hotkey_is_active_only_while_compose_is_on() {
        let mut s = valid();
        let active = |s: &Settings| s.active_hotkeys().into_iter().map(|(a, _)| a).collect::<Vec<_>>();
        assert_eq!(active(&s), HotkeyAction::ALL);
        s.compose.enabled = false;
        assert_eq!(active(&s), &HotkeyAction::ALL[..5]);
        assert_eq!(s.hotkeys.compose, "Ctrl+Alt+G", "phím vẫn giữ");
        assert_eq!(s.validate(), Ok(()));
        s.hotkeys.compose = "Ctrl+Alt+T".into();
        rejects(s, "hotkeys.compose", Reason::Duplicate);
    }

    #[test]
    fn default_target_language_follows_every_ui_language() {
```

Trong `src-tauri/src/compose/tests.rs`, tìm dòng (duy nhất):

```rust
use tauri::Listener;
```

thay bằng:

```rust
use tauri::{Listener, Manager};
```

Cùng file, trong `without_permission_the_translation_is_only_copied`, tìm đoạn (duy nhất):

```rust
    use std::sync::atomic::Ordering;

    use tauri::Manager;

    use crate::test_support::FakeNative;
```

thay bằng:

```rust
    use std::sync::atomic::Ordering;

    use crate::test_support::FakeNative;
```

Cùng file, tìm đoạn (duy nhất, ở cuối file):

```rust
    assert_eq!(compose_calls(&app), ["hide", "hide"]);
    assert!(invoke(&compose, "compose_open_main", json!({ "screen": "about" })).is_err());
}
```

thay bằng:

```rust
    assert_eq!(compose_calls(&app), ["hide", "hide"]);
    assert!(invoke(&compose, "compose_open_main", json!({ "screen": "about" })).is_err());
}

/// Spec §1.1, §1.4: phím tắt Gõ dịch mở rồi đóng ô soạn; tắt Gõ dịch thì đóng ô soạn đang mở và bỏ phím đó khỏi danh sách phím
/// tắt không đăng ký được.
#[test]
fn the_hotkey_toggles_and_turning_compose_off_closes_it() {
    use crate::hotkeys::HotkeyAction;
    let app = mock_app();
    crate::actions::run_hotkey(app.handle(), HotkeyAction::Compose);
    assert_eq!(compose_calls(&app), ["show"]);
    app.state::<crate::state::AppState>()
        .update_status(|s| s.hotkey_failures = vec![HotkeyAction::Compose]);
    let main = window(&app, "main");
    let settings = invoke(
        &main,
        "update_settings",
        json!({ "patch": { "compose": { "enabled": false } } }),
    )
    .unwrap();
    assert_eq!(settings["compose"]["enabled"], false);
    assert_eq!(compose_calls(&app), ["show", "hide"]);
    let status = invoke(&main, "get_app_status", json!({})).unwrap();
    assert_eq!(status["hotkeyFailures"], json!([]));
}

/// Spec §1.4: Gõ dịch đang tắt thì đổi phím của nó chỉ kiểm và lưu (không đăng ký); phím trùng việc khác bị từ chối.
#[test]
fn a_disabled_compose_hotkey_is_only_checked_and_saved() {
    let app = mock_app();
    let main = window(&app, "main");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "compose": { "enabled": false } } }),
    )
    .unwrap();
    let settings = invoke(
        &main,
        "set_hotkey",
        json!({ "action": "compose", "accelerator": "control+alt+KeyJ" }),
    )
    .unwrap();
    assert_eq!(settings["hotkeys"]["compose"], "Ctrl+Alt+J");
    let error = invoke(
        &main,
        "set_hotkey",
        json!({ "action": "compose", "accelerator": "Ctrl+Alt+T" }),
    )
    .unwrap_err();
    assert!(error.contains("hotkeyDuplicate"), "{error}");
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib hotkeys 2>&1 | grep -E '^error' | head -4
```
Expected: lỗi biên dịch `cannot find function check_rebind` (`activate`, `deactivate`), `no method named active_hotkeys`.

- [ ] **Step 3: `check_rebind`, `activate`, `deactivate`**

Trong `src-tauri/src/hotkeys.rs`, trong `rebind`, tìm đoạn (duy nhất):

```rust
    let (shortcut, canonical) = parse(accelerator).map_err(|e| fail(e, bound))?;
    let next: Vec<(HotkeyAction, &str)> = current
        .iter()
        .map(|&(a, s)| if a == action { (a, canonical.as_str()) } else { (a, s) })
        .collect();
    check_all(&next).map_err(|(_, e)| fail(e, bound))?;
```

thay bằng:

```rust
    let canonical = check_rebind(current, action, accelerator).map_err(|e| fail(e, bound))?;
    let (shortcut, _) = parse(&canonical).map_err(|e| fail(e, bound))?;
```

Cùng file, tìm đoạn (duy nhất):

```rust
#[cfg(test)]
mod tests {
    use super::*;
```

thay bằng:

```rust
/// Kiểm phím mới của `action` mà không đăng ký với hệ điều hành: đọc được, có Ctrl, Alt hoặc Super, không trùng phím của việc
/// khác trong `current` (kể cả khi `current` chưa có `action`). Trả về dạng chuẩn. [`rebind`] dùng hàm này trước khi đăng ký;
/// việc đang tắt (Gõ dịch khi `compose.enabled = false`, spec 2026-10-17-go-dich §1.4) chỉ kiểm rồi lưu, bật lại thì mới đăng
/// ký ([`activate`]).
pub fn check_rebind(
    current: &[(HotkeyAction, &str)],
    action: HotkeyAction,
    accelerator: &str,
) -> Result<String, HotkeyError> {
    let (_, canonical) = parse(accelerator)?;
    let mut next: Vec<(HotkeyAction, &str)> = current.iter().copied().filter(|(a, _)| *a != action).collect();
    next.push((action, canonical.as_str()));
    check_all(&next).map_err(|(_, e)| e)?;
    Ok(canonical)
}

/// Đăng ký phím tắt của một việc vừa được bật (Gõ dịch). Đã đăng ký thì thôi. `false` khi phím không đọc được hay hệ điều
/// hành từ chối.
pub fn activate(registrar: &impl Registrar, bound: &mut Bound, action: HotkeyAction, accelerator: &str) -> bool {
    if bound.get(action).is_some() {
        return true;
    }
    match parse(accelerator) {
        Ok((shortcut, _)) if registrar.register(shortcut) => {
            bound.0.insert(action, shortcut);
            true
        }
        _ => false,
    }
}

/// Gỡ phím tắt của một việc vừa bị tắt. Chưa đăng ký thì thôi.
pub fn deactivate(registrar: &impl Registrar, bound: &mut Bound, action: HotkeyAction) {
    if let Some(shortcut) = bound.0.remove(&action) {
        registrar.unregister(shortcut);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
```

- [ ] **Step 4: `Settings::active_hotkeys`**

Trong `src-tauri/src/settings/mod.rs`, tìm dòng (duy nhất):

```rust
    /// Kiểm phạm vi mọi khóa. Phía Rust là nơi quyết định: giao diện gửi gì cũng qua đây (§10.2).
```

thay bằng:

```rust
    /// Phím tắt cần đăng ký với hệ điều hành: mọi việc, trừ Gõ dịch khi đang tắt (spec 2026-10-17-go-dich §1.4).
    pub fn active_hotkeys(&self) -> Vec<(HotkeyAction, &str)> {
        self.hotkeys
            .bindings()
            .into_iter()
            .filter(|(action, _)| *action != HotkeyAction::Compose || self.compose.enabled)
            .collect()
    }

    /// Kiểm phạm vi mọi khóa. Phía Rust là nơi quyết định: giao diện gửi gì cũng qua đây (§10.2).
```

- [ ] **Step 5: Đăng ký theo việc đang bật**

Trong `src-tauri/src/hotkey_registry.rs`, tìm dòng (duy nhất):

```rust
//! Đăng ký ba phím tắt toàn cục với hệ điều hành qua `tauri-plugin-global-shortcut`. Luật đổi phím
```

thay bằng:

```rust
//! Đăng ký các phím tắt toàn cục với hệ điều hành qua `tauri-plugin-global-shortcut`. Luật đổi phím
```

Cùng file, tìm đoạn (duy nhất):

```rust
/// Đăng ký cả ba phím tắt lúc khởi động. Trả về các việc không đăng ký được.
pub fn register_all<R: Runtime>(app: &AppHandle<R>, hotkeys: &Hotkeys) -> Vec<HotkeyAction> {
    let registry = app.state::<HotkeyRegistry>();
    let mut bound = registry.0.lock().unwrap();
    hotkeys::register_all(&OsRegistrar(app.global_shortcut()), &mut bound, &hotkeys.bindings())
}
```

thay bằng:

```rust
/// Đăng ký các phím tắt lúc khởi động (`Settings::active_hotkeys`: Gõ dịch đang tắt thì không có phím của nó). Trả về các việc
/// không đăng ký được.
pub fn register_all<R: Runtime>(app: &AppHandle<R>, bindings: &[(HotkeyAction, &str)]) -> Vec<HotkeyAction> {
    let registry = app.state::<HotkeyRegistry>();
    let mut bound = registry.0.lock().unwrap();
    hotkeys::register_all(&OsRegistrar(app.global_shortcut()), &mut bound, bindings)
}

/// Bật Gõ dịch thì đăng ký phím của nó, tắt thì gỡ (spec 2026-10-17-go-dich §1.4). `false` khi bật mà hệ điều hành từ chối.
/// App giả của test không có phím tắt (`HotkeyRegistry` chưa cài): không làm gì, trả `true`.
pub fn set_active<R: Runtime>(app: &AppHandle<R>, action: HotkeyAction, accelerator: &str, active: bool) -> bool {
    let Some(registry) = app.try_state::<HotkeyRegistry>() else {
        return true;
    };
    let mut bound = registry.0.lock().unwrap();
    let registrar = OsRegistrar(app.global_shortcut());
    if active {
        hotkeys::activate(&registrar, &mut bound, action, accelerator)
    } else {
        hotkeys::deactivate(&registrar, &mut bound, action);
        true
    }
}
```

Trong `src-tauri/src/lib.rs`, tìm dòng (duy nhất):

```rust
    let failures = hotkey_registry::register_all(&handle, &settings.hotkeys);
```

thay bằng:

```rust
    let failures = hotkey_registry::register_all(&handle, &settings.active_hotkeys());
```

- [ ] **Step 6: Bật/tắt và đổi phím khi đang tắt**

Trong `src-tauri/src/actions.rs`, tìm dòng (duy nhất):

```rust
use crate::hotkeys::HotkeyAction;
```

thay bằng:

```rust
use crate::hotkeys::{self, HotkeyAction};
```

Cùng file, tìm đoạn (duy nhất):

```rust
    if previous.send_error_reports && !next.send_error_reports {
        diagnostics::purge_queue(app);
    }
    next
}
```

thay bằng:

```rust
    if previous.send_error_reports && !next.send_error_reports {
        diagnostics::purge_queue(app);
    }
    if previous.compose.enabled != next.compose.enabled {
        sync_compose_hotkey(app, &next);
    }
    next
}

/// Bật hay tắt Gõ dịch (spec 2026-10-17-go-dich §1.4): đăng ký hay gỡ phím tắt của nó, cập nhật danh sách phím tắt không đăng
/// ký được; tắt thì đóng ô soạn nếu đang mở.
fn sync_compose_hotkey<R: Runtime>(app: &AppHandle<R>, settings: &Settings) {
    let action = HotkeyAction::Compose;
    let enabled = settings.compose.enabled;
    let registered = hotkey_registry::set_active(app, action, settings.hotkeys.get(action), enabled);
    app.state::<AppState>().update_status(|s| {
        s.hotkey_failures.retain(|a| *a != action);
        if enabled && !registered {
            s.hotkey_failures.push(action);
            s.hotkey_failures.sort();
        }
    });
    status_changed(app);
    if !enabled {
        compose::close(app);
    }
}
```

Cùng file, trong `set_hotkey`, tìm đoạn (duy nhất):

```rust
    let state = app.state::<AppState>();
    let mut next = state.settings();
    match hotkey_registry::rebind(app, &next.hotkeys, action, accelerator) {
```

thay bằng:

```rust
    let state = app.state::<AppState>();
    let mut next = state.settings();
    // Gõ dịch đang tắt: chỉ kiểm rồi lưu, không đăng ký; bật lại thì mới đăng ký (spec 2026-10-17-go-dich §1.4).
    if action == HotkeyAction::Compose && !next.compose.enabled {
        let canonical = hotkeys::check_rebind(&next.hotkeys.bindings(), action, accelerator)
            .map_err(|e| CommandError::hotkey(action, e))?;
        next.hotkeys.set(action, canonical);
        return Ok(commit_settings(app, next));
    }
    match hotkey_registry::rebind(app, &next.hotkeys, action, accelerator) {
```

- [ ] **Step 7: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib 2>&1 | grep -E 'test result|FAILED|^warning'
```
Expected: `test result: ok.` với `passed` = N2 + 8, không `FAILED`, không cảnh báo.

- [ ] **Step 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/src/hotkeys.rs src-tauri/src/settings/mod.rs src-tauri/src/hotkey_registry.rs src-tauri/src/actions.rs src-tauri/src/lib.rs src-tauri/src/compose/tests.rs && git commit -q -m "feat(go-dich): bật/tắt Gõ dịch đăng ký hay gỡ phím tắt, đổi phím khi đang tắt chỉ kiểm rồi lưu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: Ô soạn thật trên macOS

**Files:**
- Modify: `src-tauri/Cargo.toml`, `Cargo.lock`, `src-tauri/src/overlay/mod.rs`, `src-tauri/src/overlay/macos.rs`
- Create: `src-tauri/src/compose/native_macos.rs`
- Modify: `src-tauri/src/compose/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/window.rs`

Spec §3.1, §3.7, §4.1, §4.2 và QĐ5, QĐ6, QĐ9 của kế hoạch 00:
- NSPanel `ComposePanel` (`tauri-nspanel`): **không kích hoạt app** (`NonactivatingPanel`, cùng `_setPreventsActivation:` của thanh phụ đề) nhưng **nhận được bàn phím** (`can_become_key_window: true`), level `Status`, `canJoinAllSpaces` + `fullScreenAuxiliary`, có bóng, tạo ẩn sẵn lúc mở app. App chat vẫn là app phía trước suốt lúc ô soạn mở, nên ẩn ô soạn thì nó nhận lại bàn phím.
- Vị trí tính bằng AppKit: màn hình có con trỏ (`NSEvent::mouseLocation`, `NSScreen`), giữa theo chiều ngang, mép trên cách đỉnh 25% chiều cao màn hình, không cao hơn vùng làm việc.
- Dán: `NSPasteboard` (văn bản thuần), chờ `PASTE_DELAY` (120 ms, spike S2 chốt), rồi `CGEventPost` ⌘ + phím ra chữ "v" trên bố cục đang dùng (TIS + `UCKeyTranslate`, gọi trên luồng chính), không tìm được thì `kVK_ANSI_V`.
- Quyền Trợ năng: `AXIsProcessTrusted` mỗi lần dán; `AXIsProcessTrustedWithOptions` có hỏi khi bấm "Bật tự dán".
- Mọi thao tác trên panel chạy trên luồng chính (`on_main`: đang ở luồng chính thì chạy ngay, không thì `run_on_main_thread` và chờ tối đa 2 giây).
- Mất focus hay bị đóng (⌘W) thì chỉ ẩn như Esc (`window.rs`).

Hai crate mới của `src-tauri` đã có trong đồ thị phụ thuộc (tao, tauri-nspanel dùng), nên thêm vào không kéo crate nào mới: `Cargo.lock` chỉ thêm hai dòng tên vào danh sách phụ thuộc của `meeting-translator`. Bản thật của `Native` chỉ thử được trên máy thật: Task 9 (spike).

- [ ] **Step 1: Kiểm phiên bản (spec §3.7, quy tắc phiên bản của CLAUDE.md)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo search objc2-app-kit --limit 1 && cargo search objc2-core-graphics --limit 1 && grep -A1 -E '^name = "objc2-(app-kit|core-graphics|foundation)"$' Cargo.lock
```
Expected: crates.io có bản mới nhất `0.3.2` cho cả hai; `Cargo.lock` có đúng một bản `0.3.2` của mỗi crate `objc2-app-kit`, `objc2-core-graphics`, `objc2-foundation`. Nếu crates.io có bản `0.3.x` mới hơn: dùng bản đó cho cả hai dòng ở Step 2 và để cargo cập nhật lock (`cargo update -p objc2-app-kit -p objc2-core-graphics`), rồi kiểm lại vẫn chỉ một bản mỗi crate. Nếu có `0.4` trở lên: **không** dùng (tao và tauri-nspanel còn ở dòng 0.3; hai dòng trong một tiến trình thì kiểu `NSResponder`, `NSWindow` không dùng chung được), ghi lý do vào commit.

- [ ] **Step 2: Phụ thuộc**

Trong `src-tauri/Cargo.toml`, tìm dòng (duy nhất):

```toml
objc2-foundation = { version = "0.3.2", default-features = false, features = ["std", "NSString", "NSURL"] }
```

thay bằng:

```toml
objc2-foundation = { version = "0.3.2", default-features = false, features = ["std", "NSGeometry", "NSString", "NSURL"] }
```

Cùng file, tìm dòng (duy nhất):

```toml
tauri-nspanel = "2.1.0"
```

thay bằng:

```toml
tauri-nspanel = "2.1.0"
# Gõ dịch (compose/native_macos.rs, spec 2026-10-17-go-dich §3.1, §4.2): đặt ô soạn theo màn hình có con trỏ (NSScreen,
# NSEvent), chép bản dịch vào clipboard (NSPasteboard), gửi ⌘V (CGEvent). Cùng bản `Cargo.lock` đã có (qua tao, tauri-nspanel).
objc2-app-kit = { version = "0.3.2", default-features = false, features = ["std", "NSEvent", "NSPasteboard", "NSResponder", "NSScreen", "NSWindow"] }
objc2-core-graphics = { version = "0.3.2", default-features = false, features = ["std", "CGEvent", "CGEventSource", "CGEventTypes", "CGRemoteOperation"] }
```

Trong `Cargo.lock` (thư mục gốc của repo), trong khối `name = "meeting-translator"`, tìm đoạn (duy nhất):

```toml
 "objc2",
 "objc2-foundation",
 "objc2-service-management",
 "pipeline",
```

thay bằng:

```toml
 "objc2",
 "objc2-app-kit",
 "objc2-core-graphics",
 "objc2-foundation",
 "objc2-service-management",
 "pipeline",
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo metadata --locked --format-version 1 >/dev/null && echo LOCK-OK
```
Expected: `LOCK-OK` (lock khớp `Cargo.toml`, không phải tải gì thêm).

- [ ] **Step 3: Cho ô soạn dùng lại `prevent_activation`**

Trong `src-tauri/src/overlay/mod.rs`, tìm đoạn (duy nhất):

```rust
#[cfg(target_os = "macos")]
mod macos;
```

thay bằng:

```rust
#[cfg(target_os = "macos")]
pub(crate) mod macos;
```

Trong `src-tauri/src/overlay/macos.rs`, tìm dòng (duy nhất):

```rust
fn prevent_activation<R: Runtime>(panel: &dyn Panel<R>) {
```

thay bằng:

```rust
///
/// Ô soạn Gõ dịch dùng lại hàm này (`compose::native_macos`, spec 2026-10-17-go-dich §3.1): app chat phải còn là app phía
/// trước suốt lúc ô soạn mở.
pub(crate) fn prevent_activation<R: Runtime>(panel: &dyn Panel<R>) {
```

- [ ] **Step 4: `native_macos.rs`**

Tạo `src-tauri/src/compose/native_macos.rs`. Macro `tauri_panel!` tự nhập vài tên của AppKit (`NSEvent`, `NSPoint`…) vào module chứa nó, nên lớp panel nằm trong `mod panel` riêng (nếu không: lỗi E0252 tên bị nhập hai lần):

```rust
//! Ô soạn Gõ dịch trên macOS (spec 2026-10-17-go-dich §3.1, §4.2): NSPanel không kích hoạt app nhưng nhận được bàn phím (kiểu
//! Spotlight). App chat vẫn là app phía trước suốt lúc ô soạn mở, nên ẩn ô soạn thì cửa sổ của nó nhận lại bàn phím, không cần
//! nhớ cửa sổ trước. Dán: chép vào clipboard (`NSPasteboard`) rồi gửi ⌘V (`CGEventPost`), việc này cần quyền Trợ năng.
//!
//! Mọi thao tác trên panel chạy trên luồng chính: AppKit dừng app khi bị gọi từ luồng khác (xem `overlay::macos`).

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, mpsc};
use std::time::Duration;

use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::data::{CFData, CFDataRef};
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::string::{CFString, CFStringRef};
use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSPasteboard, NSPasteboardTypeString, NSResponder, NSScreen};
use objc2_core_graphics::{CGEvent, CGEventFlags, CGEventSource, CGEventSourceStateID, CGEventTapLocation};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl};
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask};

use super::{LABEL, MIN_HEIGHT, Native, WIDTH};
use crate::{navigation, overlay};
use panel::ComposePanel;

/// Lớp NSPanel của ô soạn. Để trong module riêng: macro tự nhập vài tên của AppKit (`NSEvent`, `NSPoint`…) vào module chứa nó.
mod panel {
    tauri_nspanel::tauri_panel! {
        panel!(ComposePanel {
            config: {
                // Khác thanh phụ đề: ô soạn phải nhận bàn phím. Panel không kích hoạt app nên app chat vẫn ở phía trước.
                can_become_key_window: true,
                is_floating_panel: true
            }
        })
    }
}

/// Chờ cửa sổ của app chat nhận lại bàn phím sau khi ô soạn ẩn, rồi mới gửi ⌘V (spec §4.1 bước 4). Spike S2 chốt con số.
const PASTE_DELAY: Duration = Duration::from_millis(120);
/// Mã phím V của bố cục ANSI (`kVK_ANSI_V`), khi không tìm được phím ra chữ "v" trên bố cục đang dùng.
const ANSI_V: u16 = 9;
/// Chờ luồng chính làm xong một việc trên panel tối đa chừng này.
const MAIN_WAIT: Duration = Duration::from_secs(2);
/// `kUCKeyActionDisplay`, `kUCKeyTranslateNoDeadKeysMask` của `UCKeyTranslate`.
const UC_KEY_ACTION_DISPLAY: u16 = 3;
const UC_NO_DEAD_KEYS: u32 = 1;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
    static kAXTrustedCheckOptionPrompt: CFStringRef;
}

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    fn TISCopyCurrentKeyboardLayoutInputSource() -> *mut c_void;
    fn TISGetInputSourceProperty(source: *mut c_void, key: CFStringRef) -> *const c_void;
    static kTISPropertyUnicodeKeyLayoutData: CFStringRef;
    fn LMGetKbdType() -> u8;
    fn UCKeyTranslate(
        layout: *const c_void,
        code: u16,
        action: u16,
        modifiers: u32,
        keyboard: u32,
        options: u32,
        dead: *mut u32,
        max: usize,
        len: *mut usize,
        chars: *mut u16,
    ) -> i32;
}

/// Bản thật của [`Native`] trên macOS.
pub struct MacNative<R: Runtime> {
    app: AppHandle<R>,
    visible: AtomicBool,
    /// Chiều cao giao diện xin gần nhất (px logic), dùng lại mỗi lần hiện.
    height: Mutex<f64>,
}

/// Tạo ô soạn ẩn, như thanh phụ đề (`overlay::macos::create`) nhưng nhận được bàn phím.
pub fn create<R: Runtime>(app: &AppHandle<R>, title: &str) -> tauri::Result<MacNative<R>> {
    let handle = app.clone();
    let panel = PanelBuilder::<_, ComposePanel<R>>::new(app, LABEL)
        .url(WebviewUrl::App("compose.html".into()))
        .title(title)
        .size(tauri::Size::Logical(tauri::LogicalSize::new(WIDTH, MIN_HEIGHT)))
        .resizable(false)
        .with_window(move |w| {
            w.decorations(false)
                .transparent(true)
                .focused(false)
                .visible(false)
                .on_new_window(navigation::new_window_handler(handle.clone()))
        })
        .level(PanelLevel::Status)
        .add_style_mask(StyleMask::empty().nonactivating_panel())
        .collection_behavior(CollectionBehavior::new().can_join_all_spaces().full_screen_auxiliary())
        .transparent(true)
        .has_shadow(true)
        .hides_on_deactivate(false)
        .becomes_key_only_if_needed(false)
        .no_activate(true)
        .build()?;
    overlay::macos::prevent_activation(&*panel);
    Ok(MacNative {
        app: app.clone(),
        visible: AtomicBool::new(false),
        height: Mutex::new(MIN_HEIGHT),
    })
}

/// Chạy `f` trên luồng chính và chờ kết quả (tối đa [`MAIN_WAIT`]). Đang ở luồng chính (phím tắt) thì chạy ngay, không chờ
/// chính mình.
fn on_main<R: Runtime, T: Send + 'static>(
    app: &AppHandle<R>,
    f: impl FnOnce(&AppHandle<R>) -> T + Send + 'static,
) -> Option<T> {
    if MainThreadMarker::new().is_some() {
        return Some(f(app));
    }
    let (tx, rx) = mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(f(&handle));
    })
    .ok()?;
    rx.recv_timeout(MAIN_WAIT).ok()
}

/// Khung của ô soạn trên một màn hình (spec §1.2), tọa độ AppKit (điểm, gốc ở góc dưới bên trái): giữa màn hình theo chiều
/// ngang; mép trên cách đỉnh màn hình 25% chiều cao màn hình, không cao hơn vùng làm việc (dưới menu bar).
fn frame_on(screen: NSRect, visible: NSRect, height: f64) -> NSRect {
    let x = screen.origin.x + (screen.size.width - WIDTH) / 2.0;
    let top = (screen.origin.y + screen.size.height * 0.75).min(visible.origin.y + visible.size.height);
    NSRect::new(NSPoint::new(x, top - height), NSSize::new(WIDTH, height))
}

fn contains(rect: NSRect, point: NSPoint) -> bool {
    point.x >= rect.origin.x
        && point.x < rect.origin.x + rect.size.width
        && point.y >= rect.origin.y
        && point.y < rect.origin.y + rect.size.height
}

/// Đưa bàn phím vào WebView của ô soạn: panel nhận phím rồi chuyển cho WKWebView, trang tự đặt con trỏ vào ô gõ.
fn focus_webview<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let handle = app.clone();
    let _ = window.with_webview(move |webview| {
        let Ok(panel) = handle.get_webview_panel(LABEL) else {
            return;
        };
        // SAFETY: `inner()` là WKWebView (một NSView, nên là NSResponder) còn sống của chính cửa sổ này; `with_webview` chạy
        // trên luồng chính.
        let view = unsafe { &*webview.inner().cast::<NSResponder>() };
        panel.make_first_responder(Some(view));
    });
}

/// Mã phím ra chữ "v" trên bố cục bàn phím đang dùng (Dvorak, AZERTY… khác ANSI), để ⌘V đúng là lệnh Dán. Phải gọi trên luồng
/// chính: các hàm TIS dừng app khi bị gọi từ luồng khác (macOS 14 trở lên).
fn v_keycode() -> Option<u16> {
    // SAFETY: các hàm Carbon dưới đây chỉ đọc bố cục bàn phím hiện tại; nguồn bố cục được trả lại (`CFType`, luật create) khi
    // ra khỏi hàm; dữ liệu `uchr` thuộc nguồn đó và chỉ được đọc trong lúc nguồn còn sống; bộ đệm chữ có kích thước đúng.
    unsafe {
        let source = TISCopyCurrentKeyboardLayoutInputSource();
        if source.is_null() {
            return None;
        }
        let source = CFType::wrap_under_create_rule(source as CFTypeRef);
        let data = TISGetInputSourceProperty(source.as_CFTypeRef() as *mut c_void, kTISPropertyUnicodeKeyLayoutData);
        if data.is_null() {
            return None;
        }
        let data = CFData::wrap_under_get_rule(data as CFDataRef);
        let layout = data.bytes().as_ptr().cast::<c_void>();
        let keyboard = u32::from(LMGetKbdType());
        (0u16..128).find(|&code| {
            let (mut dead, mut len, mut chars) = (0u32, 0usize, [0u16; 4]);
            let status = UCKeyTranslate(
                layout,
                code,
                UC_KEY_ACTION_DISPLAY,
                0,
                keyboard,
                UC_NO_DEAD_KEYS,
                &mut dead,
                chars.len(),
                &mut len,
                chars.as_mut_ptr(),
            );
            status == 0 && len == 1 && chars[0] == u16::from(b'v')
        })
    }
}

/// Gửi tổ hợp ⌘ + `key` (nhấn rồi nhả) vào app đang nhận bàn phím.
fn post_command_key(key: u16) {
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState);
    for down in [true, false] {
        let event = CGEvent::new_keyboard_event(source.as_deref(), key, down);
        CGEvent::set_flags(event.as_deref(), CGEventFlags::MaskCommand);
        CGEvent::post(CGEventTapLocation::SessionEventTap, event.as_deref());
    }
}

impl<R: Runtime> Native for MacNative<R> {
    fn show(&self) -> tauri::Result<()> {
        let height = *self.height.lock().unwrap_or_else(|e| e.into_inner());
        let shown = on_main(&self.app, move |app| {
            let Ok(panel) = app.get_webview_panel(LABEL) else {
                return false;
            };
            if let Some(mtm) = MainThreadMarker::new() {
                let mouse = NSEvent::mouseLocation();
                let screen = NSScreen::screens(mtm)
                    .iter()
                    .find(|s| contains(s.frame(), mouse))
                    .or_else(|| NSScreen::mainScreen(mtm));
                if let Some(screen) = screen {
                    panel
                        .as_panel()
                        .setFrame_display(frame_on(screen.frame(), screen.visibleFrame(), height), false);
                }
            }
            panel.show_and_make_key();
            focus_webview(app);
            true
        });
        self.visible.store(shown == Some(true), Ordering::SeqCst);
        Ok(())
    }

    fn hide(&self) -> tauri::Result<()> {
        self.visible.store(false, Ordering::SeqCst);
        on_main(&self.app, |app| {
            if let Ok(panel) = app.get_webview_panel(LABEL) {
                panel.hide();
            }
        });
        Ok(())
    }

    fn visible(&self) -> bool {
        self.visible.load(Ordering::SeqCst)
    }

    fn set_height(&self, height: f64) -> tauri::Result<()> {
        *self.height.lock().unwrap_or_else(|e| e.into_inner()) = height;
        on_main(&self.app, move |app| {
            if let Ok(panel) = app.get_webview_panel(LABEL) {
                let window = panel.as_panel();
                let frame = window.frame();
                let top = frame.origin.y + frame.size.height;
                let next = NSRect::new(NSPoint::new(frame.origin.x, top - height), NSSize::new(WIDTH, height));
                window.setFrame_display(next, true);
            }
        });
        Ok(())
    }

    fn trusted(&self) -> bool {
        // SAFETY: hàm của ApplicationServices, không tham số.
        unsafe { AXIsProcessTrusted() }
    }

    fn request_trust(&self) {
        // SAFETY: khóa là hằng của ApplicationServices (đọc theo luật get); từ điển sống tới hết lời gọi.
        let key = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
        let options = CFDictionary::from_CFType_pairs(&[(key, CFBoolean::true_value())]);
        // SAFETY: như trên.
        let trusted = unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) };
        log::info!("hỏi quyền Trợ năng; đã có quyền: {trusted}");
    }

    fn set_clipboard(&self, text: &str) -> Result<(), String> {
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();
        // SAFETY: hằng kiểu dữ liệu của AppKit.
        let kind = unsafe { NSPasteboardTypeString };
        if pasteboard.setString_forType(&NSString::from_str(text), kind) {
            Ok(())
        } else {
            Err("NSPasteboard không nhận chữ".into())
        }
    }

    fn paste(&self) -> bool {
        std::thread::sleep(PASTE_DELAY);
        let key = on_main(&self.app, |_| v_keycode()).flatten().unwrap_or(ANSI_V);
        post_command_key(key);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> NSRect {
        NSRect::new(NSPoint::new(x, y), NSSize::new(width, height))
    }

    /// Spec §1.2: giữa màn hình, mép trên ở 25% chiều cao tính từ đỉnh; màn hình thứ hai lệch gốc thì tính theo gốc của nó.
    #[test]
    fn the_panel_sits_in_the_upper_middle_of_the_screen() {
        let main = rect(0.0, 0.0, 1440.0, 900.0);
        let visible = rect(0.0, 0.0, 1440.0, 875.0);
        assert_eq!(frame_on(main, visible, 120.0), rect(440.0, 555.0, WIDTH, 120.0));
        let side = rect(1440.0, -200.0, 1920.0, 1080.0);
        assert_eq!(frame_on(side, side, 300.0), rect(2120.0, 310.0, WIDTH, 300.0));
        // Màn hình rất thấp: mép trên không cao hơn vùng làm việc.
        let short = rect(0.0, 0.0, 1024.0, 100.0);
        assert_eq!(frame_on(short, rect(0.0, 0.0, 1024.0, 60.0), 120.0).origin.y, -60.0);
        assert!(contains(main, NSPoint::new(0.0, 0.0)) && !contains(main, NSPoint::new(1440.0, 10.0)));
    }
}
```

- [ ] **Step 5: `compose::create`, tạo lúc mở app, đóng khi mất focus**

Trong `src-tauri/src/compose/mod.rs`, tìm dòng (duy nhất):

```rust
//! - `worker`: dịch từng dòng bằng đúng hàm dịch của phụ đề (spec §3.3).
```

thay bằng:

```rust
//! - `worker`: dịch từng dòng bằng đúng hàm dịch của phụ đề (spec §3.3).
//! - `native_macos`, `native_windows`: cửa sổ ô soạn và việc dán trên từng hệ điều hành (spec §3.1, §4.2, §4.3).
```

Cùng file, tìm đoạn (duy nhất):

```rust
pub mod worker;

#[cfg(test)]
mod tests;
```

thay bằng:

```rust
pub mod worker;

#[cfg(target_os = "macos")]
mod native_macos;
#[cfg(target_os = "macos")]
use native_macos as platform;

#[cfg(test)]
mod tests;
```

Cùng file, tìm dòng (duy nhất):

```rust
fn state<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::State<'_, Compose>, CommandError> {
```

thay bằng:

```rust
/// Tạo ô soạn ẩn sẵn lúc mở app (spec §3.1) và cài bản thật của [`Native`]. Gọi một lần ở `setup`, trên luồng chính.
pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let native = platform::create(app, &app.package_info().name)?;
    app.manage(Compose::new(Box::new(native)));
    Ok(())
}

fn state<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::State<'_, Compose>, CommandError> {
```

Trong `src-tauri/src/lib.rs`, tìm đoạn (duy nhất):

```rust
    overlay::create(&handle)?;
    let failures = hotkey_registry::register_all(&handle, &settings.active_hotkeys());
```

thay bằng:

```rust
    overlay::create(&handle)?;
    // Ô soạn Gõ dịch (spec 2026-10-17-go-dich §3.1): tạo ẩn sẵn, để bấm phím tắt là hiện ngay.
    compose::create(&handle)?;
    let failures = hotkey_registry::register_all(&handle, &settings.active_hotkeys());
```

Trong `src-tauri/src/window.rs`, tìm dòng (duy nhất):

```rust
use crate::{navigation, overlay, session};
```

thay bằng:

```rust
use crate::{compose, navigation, overlay, session};
```

Cùng file, tìm đoạn (duy nhất):

```rust
            overlay::remember_position(window.app_handle());
        }
        _ => {}
```

thay bằng:

```rust
            overlay::remember_position(window.app_handle());
        }
        // Ô soạn Gõ dịch (spec 2026-10-17-go-dich §1.3, §3.1): bấm ra ngoài (mất focus) thì đóng như Esc; ⌘W hay Alt+F4 cũng
        // chỉ đóng ô soạn, không hủy cửa sổ (tạo một lần lúc mở app).
        (compose::LABEL, WindowEvent::Focused(false)) => compose::close(window.app_handle()),
        (compose::LABEL, WindowEvent::CloseRequested { api, .. }) => {
            api.prevent_close();
            compose::close(window.app_handle());
        }
        _ => {}
```

- [ ] **Step 6: Chạy, thấy xanh (Mac)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib 2>&1 | grep -E 'test result|FAILED|^warning|^error' && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | grep -E '^(error|warning)|Finished'
```
Expected: `test result: ok.` với `passed` = N2 + 9 (có `the_panel_sits_in_the_upper_middle_of_the_screen`), clippy `Finished`. Bản Windows chưa biên dịch được cho tới Task 5.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/Cargo.toml Cargo.lock src-tauri/src/overlay src-tauri/src/compose src-tauri/src/lib.rs src-tauri/src/window.rs && git commit -q -m "feat(go-dich): ô soạn thật trên macOS (NSPanel không kích hoạt app, clipboard, ⌘V, quyền Trợ năng)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: Ô soạn thật trên Windows

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/compose/mod.rs`
- Create: `src-tauri/src/compose/native_windows.rs`

Spec §3.1, §4.3: cửa sổ không viền, topmost, không có nút ở taskbar, tạo ẩn sẵn. Trước khi hiện, nhớ cửa sổ đang ở phía trước (`GetForegroundWindow`). Vị trí tính bằng API của Tauri (vị trí con trỏ và khung màn hình cùng là pixel của desktop trên Windows). Dán: Win32 clipboard (`CF_UNICODETEXT`, thử mở 10 lần nếu app khác đang giữ), đưa cửa sổ đã nhớ về phía trước (`SetForegroundWindow`), chờ tối đa 300 ms; không về được thì chỉ chép (không gửi phím, để Ctrl+V không rơi vào cửa sổ khác); về được thì `SendInput` Ctrl+V. Không cần quyền. Chỉ biên dịch được bằng `scripts/check-windows.sh` trên Mac; chạy thật chờ máy Windows (nghiệm thu GD1, GD4–GD6 trên Windows).

- [ ] **Step 1: Feature của `windows`**

Trong `src-tauri/Cargo.toml`, tìm đoạn (duy nhất):

```toml
    "Win32_UI_WindowsAndMessaging",
] }
```

thay bằng:

```toml
    "Win32_UI_WindowsAndMessaging",
    # Gõ dịch (compose/native_windows.rs): clipboard (`OpenClipboard`, `GlobalAlloc`, `CF_UNICODETEXT`) và gửi Ctrl+V
    # (`SendInput`).
    "Win32_System_DataExchange",
    "Win32_System_Memory",
    "Win32_System_Ole",
    "Win32_UI_Input_KeyboardAndMouse",
] }
```

- [ ] **Step 2: `native_windows.rs`**

Tạo `src-tauri/src/compose/native_windows.rs` (`GlobalFree` nằm ở `Win32::Foundation`, không phải `Win32::System::Memory`):

```rust
//! Ô soạn Gõ dịch trên Windows (spec 2026-10-17-go-dich §3.1, §4.3): cửa sổ không viền, topmost, không có nút ở taskbar. Trước
//! khi hiện, nhớ cửa sổ đang ở phía trước; lúc dán thì đưa nó về phía trước rồi gửi Ctrl+V (`SendInput`). Không cần quyền gì.
//! App kia chạy quyền admin thì Windows chặn phím giả (UIPI) mà app không biết: bản dịch vẫn nằm trong clipboard. Cần Windows để
//! thử (nghiệm thu GD1, GD4–GD6 trên Windows).

use std::ffi::c_void;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindowBuilder};
use windows::Win32::Foundation::{GlobalFree, HANDLE, HWND};
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
use windows::Win32::System::Ole::CF_UNICODETEXT;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY, VK_CONTROL,
    VK_V,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsWindow, SetForegroundWindow};

use super::{LABEL, MIN_HEIGHT, Native, WIDTH};
use crate::navigation;

/// Chờ cửa sổ trước về phía trước tối đa chừng này rồi mới gửi Ctrl+V; quá thì chỉ chép (spec §4.3).
const FOREGROUND_WAIT: Duration = Duration::from_millis(300);

/// Bản thật của [`Native`] trên Windows.
pub struct WinNative<R: Runtime> {
    app: AppHandle<R>,
    /// Cửa sổ ở phía trước ngay trước khi ô soạn hiện, giữ dạng số để struct dùng được giữa các luồng.
    previous: Mutex<Option<isize>>,
    /// Chiều cao giao diện xin gần nhất (px logic), dùng lại mỗi lần hiện.
    height: Mutex<f64>,
}

/// Tạo ô soạn ẩn. Cờ đặt một lần ở đây, như thanh phụ đề (`overlay::windows`).
pub fn create<R: Runtime>(app: &AppHandle<R>, title: &str) -> tauri::Result<WinNative<R>> {
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("compose.html".into()))
        .title(title)
        .inner_size(WIDTH, MIN_HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .visible(false)
        .on_new_window(navigation::new_window_handler(app.clone()))
        .build()?;
    Ok(WinNative {
        app: app.clone(),
        previous: Mutex::new(None),
        height: Mutex::new(MIN_HEIGHT),
    })
}

/// Một lần nhấn hay nhả phím `vk`.
fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

impl<R: Runtime> WinNative<R> {
    fn height(&self) -> f64 {
        *self.height.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl<R: Runtime> Native for WinNative<R> {
    fn show(&self) -> tauri::Result<()> {
        let Some(window) = self.app.get_webview_window(LABEL) else {
            return Ok(());
        };
        // SAFETY: chỉ đọc cửa sổ đang ở phía trước.
        let foreground = unsafe { GetForegroundWindow() };
        if !foreground.is_invalid() && window.hwnd().ok() != Some(foreground) {
            *self.previous.lock().unwrap_or_else(|e| e.into_inner()) = Some(foreground.0 as isize);
        }
        // Màn hình có con trỏ chuột: trên Windows, vị trí con trỏ và khung màn hình cùng là pixel của toàn desktop (spec §1.2).
        let cursor = self.app.cursor_position()?;
        if let Some(monitor) = self.app.monitor_from_point(cursor.x, cursor.y)? {
            let scale = monitor.scale_factor();
            let (area, work) = (monitor.position(), monitor.work_area());
            let width = (WIDTH * scale).round();
            let height = (self.height() * scale).round();
            let x = f64::from(area.x) + (f64::from(monitor.size().width) - width) / 2.0;
            let y = (f64::from(area.y) + f64::from(monitor.size().height) * 0.25).max(f64::from(work.position.y));
            window.set_size(PhysicalSize::new(width as u32, height as u32))?;
            window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))?;
        }
        window.show()?;
        window.set_focus()
    }

    fn hide(&self) -> tauri::Result<()> {
        match self.app.get_webview_window(LABEL) {
            Some(window) => window.hide(),
            None => Ok(()),
        }
    }

    fn visible(&self) -> bool {
        self.app
            .get_webview_window(LABEL)
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false)
    }

    fn set_height(&self, height: f64) -> tauri::Result<()> {
        *self.height.lock().unwrap_or_else(|e| e.into_inner()) = height;
        let Some(window) = self.app.get_webview_window(LABEL) else {
            return Ok(());
        };
        let scale = window.scale_factor()?;
        let position = window.outer_position()?;
        window.set_size(PhysicalSize::new(
            (WIDTH * scale).round() as u32,
            (height * scale).round() as u32,
        ))?;
        window.set_position(position)
    }

    fn trusted(&self) -> bool {
        true
    }

    fn request_trust(&self) {}

    fn set_clipboard(&self, text: &str) -> Result<(), String> {
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: clipboard mở rồi đóng trong hàm này. Bộ nhớ cấp bằng `GlobalAlloc` đủ chỗ cho chữ cả số 0 cuối; sau khi
        // `SetClipboardData` thành công thì hệ thống giữ nó, chỉ giải phóng khi lời gọi đó lỗi.
        unsafe {
            let mut opened = false;
            for _ in 0..10 {
                if OpenClipboard(None).is_ok() {
                    opened = true;
                    break;
                }
                // App khác đang giữ clipboard: chờ một chút rồi thử lại.
                std::thread::sleep(Duration::from_millis(20));
            }
            if !opened {
                return Err("không mở được clipboard".into());
            }
            let result = (|| -> windows::core::Result<()> {
                EmptyClipboard()?;
                let memory = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2)?;
                let target = GlobalLock(memory).cast::<u16>();
                if target.is_null() {
                    let _ = GlobalFree(Some(memory));
                    return Err(windows::core::Error::from_thread());
                }
                std::ptr::copy_nonoverlapping(wide.as_ptr(), target, wide.len());
                let _ = GlobalUnlock(memory);
                if let Err(e) = SetClipboardData(u32::from(CF_UNICODETEXT.0), Some(HANDLE(memory.0))) {
                    let _ = GlobalFree(Some(memory));
                    return Err(e);
                }
                Ok(())
            })();
            let _ = CloseClipboard();
            result.map_err(|e| e.to_string())
        }
    }

    fn paste(&self) -> bool {
        let Some(previous) = *self.previous.lock().unwrap_or_else(|e| e.into_inner()) else {
            return false;
        };
        let hwnd = HWND(previous as *mut c_void);
        // SAFETY: `hwnd` được kiểm còn là cửa sổ trước khi dùng; các hàm dưới đây không giữ con trỏ nào sau lời gọi.
        unsafe {
            if !IsWindow(Some(hwnd)).as_bool() {
                return false;
            }
            let _ = SetForegroundWindow(hwnd);
            let started = Instant::now();
            while GetForegroundWindow() != hwnd {
                if started.elapsed() >= FOREGROUND_WAIT {
                    return false;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            let inputs = [
                key(VK_CONTROL, false),
                key(VK_V, false),
                key(VK_V, true),
                key(VK_CONTROL, true),
            ];
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) == inputs.len() as u32
        }
    }
}
```

- [ ] **Step 3: Chọn bản Windows**

Trong `src-tauri/src/compose/mod.rs`, tìm đoạn (duy nhất):

```rust
#[cfg(target_os = "macos")]
use native_macos as platform;
```

thay bằng:

```rust
#[cfg(target_os = "macos")]
use native_macos as platform;
#[cfg(not(target_os = "macos"))]
mod native_windows;
#[cfg(not(target_os = "macos"))]
use native_windows as platform;
```

- [ ] **Step 4: Clippy cho Windows (ngay trên Mac) và Mac**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && sh scripts/check-windows.sh --locked 2>&1 | grep -E '^(error|warning)|Finished' && cargo test --locked -p meeting-translator --lib 2>&1 | grep -E 'test result|FAILED'
```
Expected: `Finished`, không `error` hay `warning`; test Mac vẫn `passed` = N2 + 9. Lỗi kiểu `unresolved import windows::Win32::System::Memory::GlobalFree` nghĩa là chép sai dòng `use` (hàm đó ở `Win32::Foundation`).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/Cargo.toml src-tauri/src/compose && git commit -q -m "feat(go-dich): ô soạn thật trên Windows (topmost, clipboard Win32, SetForegroundWindow, SendInput)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: Kiểu dữ liệu và phần thuần của trang ô soạn

**Files:**
- Modify: `src/lib/ipc.ts`
- Create: `src/lib/compose.ts`, `src/lib/compose.test.ts`

`ipc.ts` phải khớp phía Rust (kế hoạch 02): `ComposeView`, `ComposeOutcome` (`kind`), `ComposeDone`, `ComposeDelta`, `ComposeSubmitted`, `ComposeMainScreen`, tám lệnh, bốn sự kiện. `src/lib/compose.ts` là phần thuần, có test:
- `keyAction`: Enter không kèm phím bổ trợ là dán (hay dịch lại), Esc là đóng; Shift+Enter (và Enter kèm Alt/Ctrl/⌘) để ô gõ tự xử lý; bộ gõ đang chọn chữ (`isComposing`, hay `keyCode` 229 của Safari/WebKit) thì mọi phím thuộc về bộ gõ (spec §1.3).
- `shownTranslation`: bản dịch đang hiện và có mờ không (spec §1.2).
- `errorScreen`: nút của hộp lỗi mở màn hình nào (spec §5): `model*` → Model; `trialEnded` → Nâng cấp; `license*` → Bản quyền; `sidecar*`, `composeUnavailable` → cửa sổ chính; lỗi tự sửa được (`composeTooLong`, `composeFailed`, `trialNeedsNetwork`, `clockRolledBack`…) thì không có nút.
- `pasteKeys`: ⌘V hay Ctrl+V để ghi trong lời nhắc.

- [ ] **Step 1: Kiểu trong `ipc.ts`**

Trong `src/lib/ipc.ts`, tìm đoạn (duy nhất):

```ts
// Phụ đề (spec §6.6, `pipeline::subtitle::Subtitle`).
export interface Subtitle {
```

thay bằng:

```ts
// Phần cài đặt của ô soạn Gõ dịch (`compose::ComposeView`, spec 2026-10-17-go-dich §1.2, §1.4), gửi kèm mỗi lần mở.
export interface ComposeView {
  uiLanguage: UiLanguage;
  theme: Theme;
  // Ngôn ngữ đang dịch sang, đã tính "Tự động".
  target: Lang;
  // Enter tự dán (Windows luôn; macOS theo cài đặt) hay chỉ chép.
  autoPaste: boolean;
  // Bản quyền đang chặn Gõ dịch: mã lỗi (`error.<mã>`); `null` là dùng được.
  blocked: string | null;
  platform: "macos" | "windows";
}

// Kết quả của một yêu cầu dịch (`compose::Outcome`).
export type ComposeOutcome =
  | { kind: "translated"; text: string }
  // Chữ gõ đã là ngôn ngữ đích: không dịch, Enter dán nguyên văn.
  | { kind: "sameLanguage" }
  | { kind: "failed"; code: string };

export interface ComposeDone {
  id: number;
  outcome: ComposeOutcome;
}

// Phần chữ dịch mới của dòng `line` (đánh số theo mọi dòng của chữ đã gửi, kể cả dòng trống); `reset`: bỏ phần đã hiện.
export interface ComposeDelta {
  id: number;
  line: number;
  text: string;
  reset: boolean;
}

// Kết quả của lệnh dán (`compose::Submitted`): đã dán; đã chép (người dùng tự dán); macOS chưa có quyền Trợ năng (đã chép, ô
// soạn còn mở để hiện hộp quyền).
export type ComposeSubmitted = "pasted" | "copied" | "needsPermission";
// Màn hình của cửa sổ chính mà nút của hộp lỗi mở (`compose::MainScreen`).
export type ComposeMainScreen = "models" | "upgrade" | "license" | "home";

// Phụ đề (spec §6.6, `pipeline::subtitle::Subtitle`).
export interface Subtitle {
```

Cùng file, tìm đoạn (duy nhất):

```ts
  verify_models: { args: { pack: string }; result: ModelsView };
}
```

thay bằng:

```ts
  verify_models: { args: { pack: string }; result: ModelsView };
  // Ô soạn Gõ dịch (spec 2026-10-17-go-dich §3.6), chỉ cửa sổ `compose` gọi được. `compose_translate` trả số của yêu cầu, kết
  // quả tới qua `compose://delta` và `compose://done`; `compose_submit` dán kết quả đã lưu của đúng yêu cầu đó (không nhận chữ).
  get_compose_view: { args: undefined; result: ComposeView };
  compose_translate: { args: { text: string }; result: number };
  compose_submit: { args: { id: number }; result: ComposeSubmitted };
  compose_close: { args: undefined; result: null };
  compose_resize: { args: { height: number }; result: null };
  compose_open_accessibility: { args: undefined; result: null };
  compose_copy_only: { args: undefined; result: null };
  compose_open_main: { args: { screen: ComposeMainScreen }; result: null };
}
```

Cùng file, tìm đoạn (duy nhất):

```ts
  "models://state": ModelsView;
}
```

thay bằng:

```ts
  "models://state": ModelsView;
  // Ô soạn Gõ dịch: mở (kèm phần cài đặt của nó), yêu cầu đang chờ nạp model, phần chữ dịch mới, kết quả.
  "compose://open": ComposeView;
  "compose://loading": { id: number };
  "compose://delta": ComposeDelta;
  "compose://done": ComposeDone;
}
```

- [ ] **Step 2: Viết test trước (đỏ)**

Tạo `src/lib/compose.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type ComposeKey, errorScreen, keyAction, pasteKeys, shownTranslation } from "./compose";

const press = (key: string, extra: Partial<ComposeKey> = {}): ComposeKey => ({
  key,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  isComposing: false,
  keyCode: 0,
  ...extra,
});

describe("keyAction (spec 2026-10-17-go-dich §1.3)", () => {
  it("Enter dán, Esc đóng", () => {
    expect(keyAction(press("Enter"))).toBe("enter");
    expect(keyAction(press("Escape"))).toBe("escape");
    expect(keyAction(press("a"))).toBeNull();
  });

  it("Shift+Enter và Enter kèm phím bổ trợ để ô gõ tự xử lý", () => {
    for (const mod of ["shiftKey", "altKey", "ctrlKey", "metaKey"] as const) {
      expect(keyAction(press("Enter", { [mod]: true })), mod).toBeNull();
    }
  });

  it("bộ gõ đang chọn chữ thì Enter và Esc thuộc về bộ gõ", () => {
    expect(keyAction(press("Enter", { isComposing: true }))).toBeNull();
    expect(keyAction(press("Enter", { keyCode: 229 }))).toBeNull();
    expect(keyAction(press("Escape", { isComposing: true }))).toBeNull();
  });
});

describe("shownTranslation (spec §1.2)", () => {
  const base = { text: "xin chào\n\nhẹn gặp", request: null, lines: [], outcome: null, previous: "" };

  it("kết quả của đúng chữ đang có thì hiện rõ", () => {
    const request = { id: 1, text: base.text };
    expect(shownTranslation({ ...base, request, outcome: { kind: "translated", text: "Hi\n\nSee you" } })).toEqual({
      text: "Hi\n\nSee you",
      stale: false,
    });
    expect(shownTranslation({ ...base, request, outcome: { kind: "sameLanguage" } })).toEqual({
      text: base.text,
      stale: false,
    });
  });

  it("đang dịch thì hiện phần đã về theo dòng, giữ dòng trống, mờ", () => {
    const request = { id: 2, text: base.text };
    expect(shownTranslation({ ...base, request, lines: ["Hi"] })).toEqual({ text: "Hi\n\n", stale: true });
  });

  it("chưa về gì, hay chữ đã đổi sau khi xong, thì hiện bản dịch đủ gần nhất, mờ", () => {
    const old = { id: 1, text: "xin" };
    expect(shownTranslation({ ...base, request: old, previous: "Hello" })).toEqual({ text: "Hello", stale: true });
    expect(
      shownTranslation({ ...base, request: old, outcome: { kind: "translated", text: "Hi" }, previous: "Hi" }),
    ).toEqual({ text: "Hi", stale: true });
  });
});

describe("errorScreen (spec §5)", () => {
  it("mỗi nhóm lỗi mở đúng màn hình", () => {
    expect(errorScreen("modelMissing")).toBe("models");
    expect(errorScreen("modelsBusy")).toBe("models");
    expect(errorScreen("trialEnded")).toBe("upgrade");
    expect(errorScreen("licenseConflict")).toBe("license");
    expect(errorScreen("sidecarFailed")).toBe("home");
    expect(errorScreen("composeUnavailable")).toBe("home");
  });

  it("lỗi tự sửa được thì không có nút", () => {
    for (const code of ["composeTooLong", "composeFailed", "trialNeedsNetwork", "clockRolledBack", "unknown"]) {
      expect(errorScreen(code), code).toBeNull();
    }
  });
});

describe("pasteKeys", () => {
  it("ghi đúng tổ hợp dán của từng hệ điều hành", () => {
    expect(pasteKeys("macos")).toBe("⌘V");
    expect(pasteKeys("windows")).toBe("Ctrl+V");
  });
});
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec vitest run src/lib/compose.test.ts 2>&1 | grep -E 'Failed|Error' | head -3
```
Expected: đỏ, `Failed to resolve import "./compose"`.

- [ ] **Step 3: Viết `compose.ts`**

Tạo `src/lib/compose.ts`:

```ts
import type { ComposeMainScreen, ComposeOutcome } from "./ipc";

// Phần thuần của ô soạn Gõ dịch (spec 2026-10-17-go-dich §1.2, §1.3, §5): phím nào làm gì, bản dịch nào đang hiện, nút nào của
// hộp lỗi mở màn hình nào.

export interface ComposeKey {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  // Bộ gõ đang chọn chữ (tiếng Nhật, Trung, Hàn…): Enter chỉ chốt chữ của bộ gõ. Safari báo `keyCode` 229 thay cho cờ này.
  isComposing: boolean;
  keyCode: number;
}

// Việc của một lần bấm phím trong ô gõ: Enter (không kèm phím bổ trợ) là dán hay dịch lại, Esc là đóng; Shift+Enter để ô gõ
// tự xuống dòng; mọi phím khi bộ gõ đang chọn chữ thuộc về bộ gõ (spec §1.3).
export function keyAction(e: ComposeKey): "enter" | "escape" | null {
  if (e.isComposing || e.keyCode === 229) return null;
  if (e.key === "Escape") return "escape";
  if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) return "enter";
  return null;
}

export interface Shown {
  text: string;
  // Chưa khớp chữ đang có (đang chờ hay đang dịch): hiện mờ.
  stale: boolean;
}

// Bản dịch đang hiện (spec §1.2): kết quả của đúng chữ đang có thì hiện rõ (đã là ngôn ngữ đích thì là chính chữ đó); đang dịch
// thì hiện phần đã về theo từng dòng (dòng trống của chữ đã gửi giữ nguyên); chưa về gì thì hiện bản dịch đủ gần nhất, mờ.
export function shownTranslation(s: {
  text: string;
  request: { id: number; text: string } | null;
  lines: readonly string[];
  outcome: ComposeOutcome | null;
  previous: string;
}): Shown {
  const current = s.request !== null && s.request.text === s.text;
  if (current && s.outcome?.kind === "translated") return { text: s.outcome.text, stale: false };
  if (current && s.outcome?.kind === "sameLanguage") return { text: s.text, stale: false };
  if (s.request && s.lines.length > 0) {
    const text = s.request.text
      .split("\n")
      .map((line, i) => (line.trim() === "" ? line : (s.lines[i] ?? "")))
      .join("\n");
    return { text, stale: true };
  }
  return { text: s.previous, stale: true };
}

// Nút của hộp lỗi (spec §5): lỗi về model mở Cài đặt › Model; hết dùng thử mở Nâng cấp; lỗi của key mở Cài đặt › Bản quyền; lỗi
// của bộ dịch mở cửa sổ chính; dòng quá dài hay dịch hỏng thì không có nút (sửa chữ hay Enter dịch lại).
export function errorScreen(code: string): ComposeMainScreen | null {
  if (code.startsWith("model")) return "models";
  if (code === "trialEnded") return "upgrade";
  if (code.startsWith("license")) return "license";
  if (code.startsWith("sidecar") || code === "composeUnavailable") return "home";
  return null;
}

// Tổ hợp dán của hệ điều hành, để ghi trong lời nhắc.
export function pasteKeys(platform: "macos" | "windows"): string {
  return platform === "macos" ? "⌘V" : "Ctrl+V";
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec tsc --noEmit && echo TSC-OK && pnpm test 2>&1 | grep -E 'Tests|failed'
```
Expected: `TSC-OK`, `Tests  306 passed` (T0 + 9).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src/lib/ipc.ts src/lib/compose.ts src/lib/compose.test.ts && git commit -q -m "feat(go-dich): kiểu IPC và phần thuần của ô soạn (phím, bản dịch đang hiện, nút của hộp lỗi)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 7: Store của ô soạn

**Files:**
- Create: `src/store/compose.ts`, `src/store/compose.test.ts`

Spec §1.1–§1.3, §4.2. Store Zustand (vanilla) nhận `Ipc` và bộ hẹn giờ (`Timers`, test dùng bản giả):
- Gõ thì hẹn 400 ms (`DEBOUNCE_MS`); hết hạn thì gửi **toàn bộ** chữ đang có (`compose_translate`), nhận số yêu cầu. Chữ đổi trong lúc chờ số thì bỏ yêu cầu đó (lần hẹn mới sẽ gửi chữ mới).
- Sự kiện của yêu cầu có thể tới **trước** khi lệnh trả số: giữ lại (`early`), có số thì áp.
- Enter: ô trống hay đang hiện hộp quyền thì đóng; bị chặn thì không làm gì; kết quả lỗi của đúng chữ đang có thì dịch lại; kết quả xong thì dán; chưa xong thì chờ (`pendingSubmit`, nếu chưa có yêu cầu nào đang chờ số thì dịch ngay), xong thì dán, lỗi thì thôi. **Không bao giờ dán câu gốc khi dịch lỗi.**
- Dán hay chép xong thì hết bản nháp; `needsPermission` thì hiện hộp quyền (bản dịch đã chép). Lệnh dán lỗi (yêu cầu đã cũ) thì giữ nguyên.
- Esc (và mọi lần đóng) giữ bản nháp; mở lại (`compose://open`) thì tăng `opened` (giao diện chọn sẵn bản nháp) và dịch lại nếu bản nháp chưa có kết quả hay kết quả lỗi.
- Lệnh dịch bị từ chối (quá 4000 ký tự) thì báo như một kết quả lỗi của đúng chữ đó.

- [ ] **Step 1: Viết test trước (đỏ)**

Tạo `src/store/compose.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { ComposeSubmitted, ComposeView } from "../lib/ipc";
import { DEBOUNCE_MS, type Timers, createComposeStore } from "./compose";

const VIEW: ComposeView = {
  uiLanguage: "vi",
  theme: "system",
  target: "en",
  autoPaste: true,
  blocked: null,
  platform: "macos",
};

// Hẹn giờ giả: ghi lại các lần hẹn, test tự cho chạy (`fire`).
function fakeTimers() {
  const pending = new Map<number, { run: () => void; ms: number }>();
  let next = 1;
  const timers: Timers = {
    set(run, ms) {
      const id = next++;
      pending.set(id, { run, ms });
      return id;
    },
    clear(handle) {
      pending.delete(handle as number);
    },
  };
  return {
    timers,
    pending: () => [...pending.values()].map((p) => p.ms),
    fire() {
      const runs = [...pending.values()];
      pending.clear();
      runs.forEach((p) => p.run());
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(submitted: ComposeSubmitted = "pasted", translate?: (text: string) => number | Promise<number>) {
  let id = 0;
  const f = fakeIpc({
    get_compose_view: () => VIEW,
    compose_translate: (args) => (translate ? translate(args.text) : ++id),
    compose_submit: () => submitted,
    compose_close: () => null,
    compose_open_accessibility: () => null,
    compose_copy_only: () => null,
    compose_open_main: () => null,
  });
  const t = fakeTimers();
  const store = createComposeStore(f.ipc, t.timers);
  const sent = (cmd: string) => f.calls.filter((c) => c.cmd === cmd).map((c) => c.args);
  return { ...f, t, store, sent };
}

describe("ô soạn Gõ dịch (spec 2026-10-17-go-dich §1)", () => {
  it("chờ ngừng gõ 400 ms rồi mới dịch toàn bộ chữ đang có", async () => {
    const { store, t, sent } = setup();
    await store.getState().init();
    store.getState().setText("Mai");
    store.getState().setText("Mai mình");
    expect(t.pending()).toEqual([DEBOUNCE_MS]);
    expect(sent("compose_translate")).toEqual([]);
    t.fire();
    await flush();
    expect(sent("compose_translate")).toEqual([{ text: "Mai mình" }]);
    expect(store.getState().request).toEqual({ id: 1, text: "Mai mình" });
    expect(store.getState().waiting).toBe(true);
  });

  it("chữ dịch về dần, rồi kết quả; Enter thì dán và hết bản nháp", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    store.getState().setText("Mai mình gửi");
    t.fire();
    await flush();
    emit("compose://delta", { id: 1, line: 0, text: "I'll", reset: false });
    emit("compose://delta", { id: 1, line: 0, text: " send", reset: false });
    expect(store.getState().lines).toEqual(["I'll send"]);
    emit("compose://done", { id: 1, outcome: { kind: "translated", text: "I'll send it." } });
    expect(store.getState().waiting).toBe(false);
    expect(store.getState().previous).toBe("I'll send it.");
    store.getState().enter();
    await flush();
    expect(sent("compose_submit")).toEqual([{ id: 1 }]);
    expect(store.getState().text).toBe("");
    expect(store.getState().request).toBeNull();
  });

  it("Enter khi chưa dịch xong thì dịch ngay, xong mới dán", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    store.getState().setText("Cảm ơn");
    store.getState().enter();
    expect(t.pending()).toEqual([]);
    expect(store.getState().pendingSubmit).toBe(true);
    await flush();
    expect(sent("compose_translate")).toEqual([{ text: "Cảm ơn" }]);
    expect(sent("compose_submit")).toEqual([]);
    emit("compose://done", { id: 1, outcome: { kind: "translated", text: "Thanks" } });
    await flush();
    expect(sent("compose_submit")).toEqual([{ id: 1 }]);
  });

  it("dịch lỗi thì Enter dịch lại, không bao giờ dán câu gốc", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    store.getState().setText("Cảm ơn");
    store.getState().enter();
    await flush();
    emit("compose://done", { id: 1, outcome: { kind: "failed", code: "composeFailed" } });
    expect(store.getState().pendingSubmit).toBe(false);
    store.getState().enter();
    await flush();
    expect(sent("compose_translate")).toHaveLength(2);
    expect(sent("compose_submit")).toEqual([]);
    expect(t.pending()).toEqual([]);
  });

  it("Enter ở ô trống thì đóng; Esc đóng mà giữ bản nháp; mở lại thì dịch lại cái chưa xong", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    store.getState().enter();
    expect(sent("compose_close")).toHaveLength(1);
    store.getState().setText("Mai mình gửi");
    t.fire();
    await flush();
    store.getState().escape();
    expect(sent("compose_close")).toHaveLength(2);
    expect(store.getState().text).toBe("Mai mình gửi");
    emit("compose://open", VIEW);
    expect(store.getState().opened).toBe(1);
    await flush();
    expect(sent("compose_translate")).toHaveLength(2);
  });

  it("mở lại khi bản dịch đã xong thì không dịch lại", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    store.getState().setText("Mai");
    t.fire();
    await flush();
    emit("compose://done", { id: 1, outcome: { kind: "translated", text: "Tomorrow" } });
    emit("compose://open", VIEW);
    await flush();
    expect(sent("compose_translate")).toHaveLength(1);
  });

  it("macOS chưa có quyền Trợ năng: đã chép, hộp quyền hiện, Enter đóng", async () => {
    const { store, t, emit, sent } = setup("needsPermission");
    await store.getState().init();
    store.getState().setText("Mai");
    t.fire();
    await flush();
    emit("compose://done", { id: 1, outcome: { kind: "translated", text: "Tomorrow" } });
    store.getState().enter();
    await flush();
    expect(store.getState().permission).toBe(true);
    expect(store.getState().text).toBe("");
    store.getState().enter();
    expect(sent("compose_close")).toHaveLength(1);
    expect(store.getState().permission).toBe(false);
  });

  it("Luôn chỉ chép: tắt tự dán rồi đóng; Bật tự dán: mở trang Trợ năng", async () => {
    const { store, sent } = setup();
    store.getState().copyOnly();
    store.getState().allowAutoPaste();
    expect(sent("compose_copy_only")).toHaveLength(1);
    expect(sent("compose_close")).toHaveLength(1);
    expect(sent("compose_open_accessibility")).toHaveLength(1);
  });

  it("bản quyền đang chặn thì Enter không làm gì", async () => {
    const { store, t, emit, sent } = setup();
    await store.getState().init();
    emit("compose://open", { ...VIEW, blocked: "trialEnded" });
    store.getState().setText("Mai");
    t.fire();
    await flush();
    emit("compose://done", { id: 1, outcome: { kind: "failed", code: "trialEnded" } });
    store.getState().enter();
    await flush();
    expect(sent("compose_translate")).toHaveLength(1);
    expect(sent("compose_submit")).toEqual([]);
  });

  it("sự kiện tới trước khi lệnh dịch trả số thì vẫn được áp", async () => {
    let resolve: (id: number) => void = () => {};
    const { store, t, emit } = setup("pasted", () => new Promise<number>((r) => (resolve = r)));
    await store.getState().init();
    store.getState().setText("Chào");
    t.fire();
    emit("compose://loading", { id: 7 });
    emit("compose://delta", { id: 7, line: 0, text: "Hi", reset: false });
    emit("compose://done", { id: 7, outcome: { kind: "translated", text: "Hi" } });
    resolve(7);
    await flush();
    expect(store.getState().lines).toEqual(["Hi"]);
    expect(store.getState().outcome).toEqual({ kind: "translated", text: "Hi" });
    expect(store.getState().loading).toBe(false);
  });

  it("lệnh dịch bị từ chối (quá 4000 ký tự) thì báo lỗi cho đúng chữ đó", async () => {
    const { store, t } = setup("pasted", () => {
      throw { code: "composeTooLong", field: null, message: "quá 4000 ký tự" };
    });
    await store.getState().init();
    store.getState().setText("x".repeat(4001));
    t.fire();
    await flush();
    expect(store.getState().outcome).toEqual({ kind: "failed", code: "composeTooLong" });
  });

  it("dòng dịch hỏng lần đầu thì bỏ phần đã hiện của dòng đó", async () => {
    const { store, t, emit } = setup();
    await store.getState().init();
    store.getState().setText("một\nhai");
    t.fire();
    await flush();
    emit("compose://delta", { id: 1, line: 1, text: "TWO??", reset: false });
    emit("compose://delta", { id: 1, line: 1, text: "", reset: true });
    emit("compose://delta", { id: 1, line: 1, text: "Two", reset: false });
    expect(store.getState().lines[1]).toBe("Two");
  });
});
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec vitest run src/store/compose.test.ts 2>&1 | grep -E 'Failed|Error' | head -3
```
Expected: đỏ, `Failed to resolve import "./compose"`.

- [ ] **Step 2: Viết store**

Tạo `src/store/compose.ts`:

```ts
import { createStore } from "zustand/vanilla";
import type {
  ComposeDelta,
  ComposeDone,
  ComposeMainScreen,
  ComposeOutcome,
  ComposeView,
  Ipc,
} from "../lib/ipc";

// Store của ô soạn Gõ dịch (spec 2026-10-17-go-dich §1). Cửa sổ `compose` chỉ gọi được các lệnh `compose_*` và nghe sự kiện
// `compose://*` (spec §3.6). Bản nháp và bản dịch chỉ nằm trong bộ nhớ của cửa sổ này (spec §6).

// Ngừng gõ chừng này thì dịch lại toàn bộ chữ đang có (spec §1.1 bước 3).
export const DEBOUNCE_MS = 400;

// Hẹn giờ, để test chạy không cần chờ thật.
export interface Timers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ComposeStoreState {
  view: ComposeView | null;
  // Bản nháp: giữ tới khi dán hay chép thành công; Esc hay bấm ra ngoài không làm mất (spec §1.2).
  text: string;
  // Yêu cầu dịch gần nhất: số do phía Rust trả, và đúng chữ đã gửi đi dịch.
  request: { id: number; text: string } | null;
  // Chữ dịch đang về của `request`, theo dòng của chữ đã gửi.
  lines: string[];
  // Kết quả của `request`; `null` khi chưa xong.
  outcome: ComposeOutcome | null;
  // Bản dịch đủ gần nhất: hiện mờ trong lúc chờ bản mới.
  previous: string;
  // Đang chờ dịch: gõ chưa ngừng đủ lâu, hay yêu cầu chưa xong.
  waiting: boolean;
  // Yêu cầu đang chờ nạp model ("Đang nạp model…").
  loading: boolean;
  // Đã bấm Enter khi bản dịch chưa xong: xong thì dán; dịch lỗi thì thôi (spec §1.3).
  pendingSubmit: boolean;
  // macOS, chưa có quyền Trợ năng: bản dịch đã chép, hiện hộp quyền (spec §4.2).
  permission: boolean;
  // Tăng mỗi lần ô soạn mở: giao diện đưa con trỏ vào ô gõ và chọn sẵn bản nháp.
  opened: number;
  init(): Promise<() => void>;
  setText(text: string): void;
  enter(): void;
  escape(): void;
  allowAutoPaste(): void;
  copyOnly(): void;
  openMain(screen: ComposeMainScreen): void;
}

// Mã lỗi trong lỗi của một lệnh (`CommandError`); lỗi lạ thì `unknown`.
function errorCode(e: unknown): string {
  return typeof e === "object" && e !== null && "code" in e && typeof e.code === "string" ? e.code : "unknown";
}

export function createComposeStore(ipc: Ipc, timers: Timers = realTimers) {
  let timer: unknown = null;
  // Số lệnh dịch đang chờ số yêu cầu. Sự kiện của yêu cầu có thể tới trước khi lệnh trả số: giữ lại, có số thì áp.
  let awaiting = 0;
  const early = new Map<number, { deltas: ComposeDelta[]; done: ComposeDone | null }>();
  const cancelTimer = () => {
    if (timer !== null) {
      timers.clear(timer);
      timer = null;
    }
  };
  const stash = (id: number) => {
    const entry = early.get(id) ?? { deltas: [], done: null };
    early.set(id, entry);
    return entry;
  };

  return createStore<ComposeStoreState>()((set, get) => {
    const applyDelta = (d: ComposeDelta) => {
      const lines = [...get().lines];
      lines[d.line] = d.reset ? "" : (lines[d.line] ?? "") + d.text;
      set({ lines });
    };

    // Dán kết quả của yêu cầu gần nhất. Dán hay chép xong thì bản nháp hết; chưa có quyền Trợ năng thì bản dịch đã chép, ô soạn
    // còn mở và hiện hộp quyền (spec §4.2). Lệnh lỗi (yêu cầu đã cũ) thì giữ nguyên: Enter lần nữa.
    const submit = async () => {
      const { request, outcome } = get();
      if (!request || !outcome || outcome.kind === "failed") return;
      set({ pendingSubmit: false });
      try {
        const submitted = await ipc.invoke("compose_submit", { id: request.id });
        set({
          text: "",
          request: null,
          lines: [],
          outcome: null,
          previous: "",
          waiting: false,
          permission: submitted === "needsPermission",
        });
      } catch {
        // Bản dịch không còn (đã có yêu cầu mới): giữ nguyên.
      }
    };

    const applyDone = (d: ComposeDone) => {
      const outcome = d.outcome;
      set({
        outcome,
        previous: outcome.kind === "translated" ? outcome.text : get().previous,
        waiting: false,
        loading: false,
      });
      if (!get().pendingSubmit) return;
      if (outcome.kind === "failed") set({ pendingSubmit: false });
      else void submit();
    };

    // Gửi chữ đang có đi dịch ngay (bỏ lần hẹn giờ đang chờ).
    const translate = async () => {
      cancelTimer();
      const text = get().text;
      if (text.trim() === "") return;
      set({ waiting: true, loading: false });
      awaiting += 1;
      try {
        const id = await ipc.invoke("compose_translate", { text });
        // Chữ đã đổi trong lúc chờ: lần hẹn giờ mới sẽ gửi chữ mới, bỏ yêu cầu này.
        if (get().text !== text) return;
        set({ request: { id, text }, lines: [], outcome: null });
        const held = early.get(id);
        early.clear();
        held?.deltas.forEach(applyDelta);
        if (held?.done) applyDone(held.done);
      } catch (e) {
        // Lệnh bị từ chối (ví dụ quá 4000 ký tự): báo như một kết quả lỗi của đúng chữ này.
        set({
          request: { id: -1, text },
          outcome: { kind: "failed", code: errorCode(e) },
          waiting: false,
          pendingSubmit: false,
        });
      } finally {
        awaiting -= 1;
      }
    };

    const close = () => {
      cancelTimer();
      set({ pendingSubmit: false, permission: false, waiting: false, loading: false });
      void ipc.invoke("compose_close").catch(() => {});
    };

    const opened = (view: ComposeView) => {
      const s = get();
      set({ view, permission: false, opened: s.opened + 1 });
      // Mở lại với bản nháp chưa có kết quả (đóng lúc đang dịch hủy yêu cầu đó) hay kết quả lỗi: dịch lại.
      const done = s.request?.text === s.text && s.outcome !== null && s.outcome.kind !== "failed";
      if (s.text.trim() !== "" && !done) void translate();
    };

    return {
      view: null,
      text: "",
      request: null,
      lines: [],
      outcome: null,
      previous: "",
      waiting: false,
      loading: false,
      pendingSubmit: false,
      permission: false,
      opened: 0,
      async init() {
        const offs = await Promise.all([
          ipc.listen("compose://open", opened),
          ipc.listen("compose://loading", (l) => {
            if (get().request?.id === l.id || awaiting > 0) set({ loading: true });
          }),
          ipc.listen("compose://delta", (d) => {
            if (get().request?.id === d.id) applyDelta(d);
            else if (awaiting > 0) stash(d.id).deltas.push(d);
          }),
          ipc.listen("compose://done", (d) => {
            if (get().request?.id === d.id) applyDone(d);
            else if (awaiting > 0) stash(d.id).done = d;
          }),
        ]);
        // Phần cài đặt mới hơn đã tới qua `compose://open` trong lúc chờ thì giữ bản đó.
        const view = await ipc.invoke("get_compose_view");
        if (!get().view) set({ view });
        return () => offs.forEach((off) => off());
      },
      setText(text) {
        cancelTimer();
        set({ text, pendingSubmit: false, permission: false });
        if (text.trim() === "") {
          set({ request: null, lines: [], outcome: null, previous: "", waiting: false, loading: false });
          return;
        }
        set({ waiting: true });
        timer = timers.set(() => {
          timer = null;
          void translate();
        }, DEBOUNCE_MS);
      },
      enter() {
        const s = get();
        if (s.permission || s.text.trim() === "") {
          close();
          return;
        }
        if (s.view?.blocked) return;
        const current = s.request?.text === s.text;
        if (current && s.outcome?.kind === "failed") {
          void translate();
          return;
        }
        if (current && s.outcome) {
          void submit();
          return;
        }
        set({ pendingSubmit: true });
        if (!current && awaiting === 0) void translate();
      },
      escape: close,
      allowAutoPaste() {
        void ipc.invoke("compose_open_accessibility").catch(() => {});
      },
      copyOnly() {
        void ipc.invoke("compose_copy_only").catch(() => {});
        close();
      },
      openMain(screen) {
        void ipc.invoke("compose_open_main", { screen }).catch(() => {});
      },
    };
  });
}
```

- [ ] **Step 3: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec tsc --noEmit && echo TSC-OK && pnpm test 2>&1 | grep -E 'Tests|failed'
```
Expected: `TSC-OK`, `Tests  318 passed` (T0 + 21).

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src/store/compose.ts src/store/compose.test.ts && git commit -q -m "feat(go-dich): store của ô soạn (chờ ngừng gõ, Enter dán hay dịch lại, giữ bản nháp)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 8: Trang ô soạn

**Files:**
- Create: `compose.html`, `src/windows/compose/compose.tsx`, `src/windows/compose/compose.css`
- Modify: `vite.config.ts`, `src/i18n/{en,vi,ja,zh,ko}.ts`

Spec §1.2, §1.3, §4.2, §5. Trang React của cửa sổ `compose` (QĐ12 của kế hoạch 00: đặt ở `src/windows/compose/` cạnh hai cửa sổ kia):
- Dòng đầu "Gõ dịch · → English" và trạng thái ("Đang nạp model…", "Đang dịch…", "Đã là English", hay trống; `aria-live`).
- Ô gõ nhiều dòng (`maxLength` 4000), tự cao tới 6 dòng rồi cuộn; mỗi lần mở: con trỏ vào ô gõ, bản nháp chọn sẵn (**và chọn lại khi trang nhận focus, chừng nào chưa gõ gì, bấm chuột hay bấm phím trong bản nháp**: Rust phát `compose://open` trước khi hiện panel, nên lệnh chọn đầu chạy khi trang chưa có focus và WebKit đặt con trỏ về đầu ô; không có phần này, mở lại ô khi còn bản nháp thì chữ mới chèn TRƯỚC bản nháp, đo ở Teams 2026-10-18 ra 62, 93, 124 ký tự). **Tắt sửa chính tả, tự sửa chữ, tự viết hoa** (`spellCheck={false}`, `autoCorrect`, `autoCapitalize`, `autoComplete` = off): thử tự động ở spike S2 thấy hộp gợi ý chữ của macOS ("Report ×") hiện ngay dưới con trỏ khi vừa gõ xong từ cuối và **nuốt phím Enter đầu tiên**, nên Enter không dán (phải bấm lần hai). Hỏng nhiều người gõ nhanh rồi Enter; sau khi tắt, 10/10 lượt dán ngay ở Enter đầu.
- Bản dịch (chọn và chép được), mờ khi chưa khớp chữ đang có.
- Chân ô: gợi ý phím (theo tự dán hay chỉ chép), hay hộp lỗi (`role="alert"`, có nút mở đúng màn hình khi có), hay hộp quyền Trợ năng (macOS: "Bật tự dán", "Luôn chỉ chép").
- Enter/Shift+Enter/bộ gõ theo `keyAction`; Esc ở bất kỳ đâu trong ô soạn (kể cả khi focus ở một nút) thì đóng.
- Chiều cao cửa sổ theo nội dung (`ResizeObserver`, mỗi khung hình nhiều nhất một lần `compose_resize`); `html`, `body` nền trong suốt, không đặt chiều cao cố định.
- Ngôn ngữ trang (`lang`, để WebView chọn font CJK) và sáng/tối theo `ComposeView`.

Mười sáu chuỗi `compose.*` ở năm từ điển. Xem trước bằng `scripts/ui-preview` và kiểm năm ngôn ngữ là kế hoạch 04.

- [ ] **Step 1: Entry HTML và Vite**

Tạo `compose.html` (thư mục gốc của repo, cạnh `overlay.html`):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Type &amp; Translate</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/windows/compose/compose.tsx"></script>
  </body>
</html>
```

Trong `vite.config.ts`, tìm dòng (duy nhất):

```ts
// Hai cửa sổ, mỗi cửa sổ một entry HTML riêng (spec §6.10).
```

thay bằng:

```ts
// Ba cửa sổ, mỗi cửa sổ một entry HTML riêng (spec §6.10): cửa sổ chính, thanh phụ đề, ô soạn Gõ dịch (spec 2026-10-17-go-dich
// §3.1).
```

Cùng file, tìm dòng (duy nhất):

```ts
        overlay: resolve(import.meta.dirname, "overlay.html"),
```

thay bằng:

```ts
        overlay: resolve(import.meta.dirname, "overlay.html"),
        compose: resolve(import.meta.dirname, "compose.html"),
```

- [ ] **Step 2: Chuỗi của ô soạn**

Trong mỗi file dưới đây, tìm dòng `"hotkeys.hint": …` (duy nhất trong file) và thêm ngay sau nó **một dòng trống rồi mười sáu dòng** (khối dưới đây bắt đầu bằng dòng trống; dòng trống sẵn có trước `"about.version"` giữ nguyên):

`src/i18n/en.ts`:
```ts

  "compose.title": "Type & Translate",
  "compose.placeholder": "Type your message…",
  "compose.loading": "Loading models…",
  "compose.translating": "Translating…",
  "compose.sameLanguage": "Already in {lang}",
  "compose.translation": "Translation",
  "compose.hint.paste": "Enter: paste · Shift+Enter: new line · Esc: close",
  "compose.hint.copy": "Enter: copy, then {keys} to paste · Shift+Enter: new line · Esc: close",
  "compose.permission": "Translation copied. To let AI Translator paste it for you, allow it in Accessibility.",
  "compose.permission.next": "Press Enter or Esc, then {keys} in the chat box.",
  "compose.permission.allow": "Turn on auto-paste",
  "compose.permission.copyOnly": "Always copy only",
  "compose.open.models": "Open model settings",
  "compose.open.upgrade": "Upgrade",
  "compose.open.license": "Open license settings",
  "compose.open.home": "Open AI Translator",
```

`src/i18n/vi.ts`:
```ts

  "compose.title": "Gõ dịch",
  "compose.placeholder": "Gõ tin nhắn…",
  "compose.loading": "Đang nạp model…",
  "compose.translating": "Đang dịch…",
  "compose.sameLanguage": "Đã là {lang}",
  "compose.translation": "Bản dịch",
  "compose.hint.paste": "Enter: dán · Shift+Enter: xuống dòng · Esc: đóng",
  "compose.hint.copy": "Enter: chép, rồi {keys} để dán · Shift+Enter: xuống dòng · Esc: đóng",
  "compose.permission": "Đã chép bản dịch. Muốn app tự dán, hãy cấp quyền Trợ năng cho AI Translator.",
  "compose.permission.next": "Bấm Enter hay Esc, rồi {keys} ở ô chat.",
  "compose.permission.allow": "Bật tự dán",
  "compose.permission.copyOnly": "Luôn chỉ chép",
  "compose.open.models": "Mở cài đặt Model",
  "compose.open.upgrade": "Nâng cấp",
  "compose.open.license": "Mở cài đặt Bản quyền",
  "compose.open.home": "Mở AI Translator",
```

`src/i18n/ja.ts`:
```ts

  "compose.title": "入力翻訳",
  "compose.placeholder": "メッセージを入力…",
  "compose.loading": "モデルを読み込んでいます…",
  "compose.translating": "翻訳中…",
  "compose.sameLanguage": "すでに{lang}です",
  "compose.translation": "翻訳",
  "compose.hint.paste": "Enter：貼り付け · Shift+Enter：改行 · Esc：閉じる",
  "compose.hint.copy": "Enter：コピー（{keys} で貼り付け） · Shift+Enter：改行 · Esc：閉じる",
  "compose.permission": "翻訳をコピーしました。自動で貼り付けるには、アクセシビリティで AI Translator を許可してください。",
  "compose.permission.next": "Enter か Esc を押してから、チャット欄で {keys} を押してください。",
  "compose.permission.allow": "自動貼り付けをオンにする",
  "compose.permission.copyOnly": "常にコピーのみ",
  "compose.open.models": "モデル設定を開く",
  "compose.open.upgrade": "アップグレード",
  "compose.open.license": "ライセンス設定を開く",
  "compose.open.home": "AI Translator を開く",
```

`src/i18n/zh.ts`:
```ts

  "compose.title": "输入翻译",
  "compose.placeholder": "输入消息…",
  "compose.loading": "正在加载模型…",
  "compose.translating": "正在翻译…",
  "compose.sameLanguage": "已经是{lang}",
  "compose.translation": "译文",
  "compose.hint.paste": "Enter：粘贴 · Shift+Enter：换行 · Esc：关闭",
  "compose.hint.copy": "Enter：复制，然后按 {keys} 粘贴 · Shift+Enter：换行 · Esc：关闭",
  "compose.permission": "译文已复制。若要让 AI Translator 自动粘贴，请在“辅助功能”中允许它。",
  "compose.permission.next": "按 Enter 或 Esc，然后在聊天框中按 {keys}。",
  "compose.permission.allow": "开启自动粘贴",
  "compose.permission.copyOnly": "始终只复制",
  "compose.open.models": "打开模型设置",
  "compose.open.upgrade": "升级",
  "compose.open.license": "打开许可证设置",
  "compose.open.home": "打开 AI Translator",
```

`src/i18n/ko.ts`:
```ts

  "compose.title": "입력 번역",
  "compose.placeholder": "메시지를 입력하세요…",
  "compose.loading": "모델을 불러오는 중…",
  "compose.translating": "번역 중…",
  "compose.sameLanguage": "이미 {lang}입니다",
  "compose.translation": "번역",
  "compose.hint.paste": "Enter: 붙여넣기 · Shift+Enter: 줄 바꿈 · Esc: 닫기",
  "compose.hint.copy": "Enter: 복사한 뒤 {keys}로 붙여넣기 · Shift+Enter: 줄 바꿈 · Esc: 닫기",
  "compose.permission": "번역을 복사했습니다. 자동으로 붙여넣으려면 손쉬운 사용에서 AI Translator를 허용하세요.",
  "compose.permission.next": "Enter나 Esc를 누른 뒤 채팅 입력란에서 {keys}를 누르세요.",
  "compose.permission.allow": "자동 붙여넣기 켜기",
  "compose.permission.copyOnly": "항상 복사만",
  "compose.open.models": "모델 설정 열기",
  "compose.open.upgrade": "업그레이드",
  "compose.open.license": "라이선스 설정 열기",
  "compose.open.home": "AI Translator 열기",
```

- [ ] **Step 3: CSS**

Tạo `src/windows/compose/compose.css`:

```css
/* Ô soạn Gõ dịch (spec 2026-10-17-go-dich §1.2): khung bo góc trên cửa sổ trong suốt, màu theo token của app (sáng, tối). Cao
   theo nội dung: không đặt chiều cao cố định cho `html`, `body`, `.compose` (cửa sổ đổi chiều cao theo khung này). */
html,
body {
  margin: 0;
  background: transparent;
  overflow: hidden;
}

/* Tiếng Hàn có dấu cách giữa các từ: xuống dòng ở dấu cách, không ngắt giữa âm tiết. */
:lang(ko) {
  word-break: keep-all;
}

.compose {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem 0.95rem 0.65rem;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

.compose header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 12px;
  color: var(--muted);
}

.compose .status {
  color: var(--accent-fg);
  white-space: nowrap;
}

.compose textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0;
  border: 0;
  outline: none;
  resize: none;
  overflow-y: auto;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 16px;
  line-height: 1.4;
}

.compose textarea::placeholder {
  color: var(--faint);
}

.compose .translation {
  padding-top: 0.6rem;
  border-top: 1px solid var(--border);
  font-size: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 9.8em;
  overflow-y: auto;
  user-select: text;
}

.compose .translation.stale {
  color: var(--faint);
}

.compose footer {
  font-size: 12px;
  color: var(--faint);
}

.compose .box {
  padding: 0.55rem 0.7rem;
  border-radius: var(--radius);
  background: var(--accent-soft);
  font-size: 13px;
}

.compose .box.error {
  background: var(--danger-soft);
  color: var(--danger);
}

.compose .box p {
  margin: 0;
}

.compose .box .hint {
  margin-top: 0.25rem;
  color: var(--muted);
}

.compose .actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.compose button {
  height: var(--control-h);
  padding: 0 0.8rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.compose button.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.compose button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
```

- [ ] **Step 4: Trang React**

Tạo `src/windows/compose/compose.tsx`:

```tsx
import "../../styles/tokens.css";
import "./compose.css";
import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useStore } from "zustand";
import { type MessageKey, type Params, errorKey, htmlLang, translate } from "../../i18n";
import { errorScreen, keyAction, pasteKeys, shownTranslation } from "../../lib/compose";
import { type ComposeMainScreen, tauriIpc as ipc } from "../../lib/ipc";
import { createComposeStore } from "../../store/compose";

const store = createComposeStore(ipc);
// Ngôn ngữ của trang (WebView chọn font CJK theo thuộc tính này) và giao diện sáng/tối theo Cài đặt › Chung; "system" thì theo
// hệ điều hành (`tokens.css`).
store.subscribe((state) => {
  if (!state.view) return;
  const root = document.documentElement;
  root.lang = htmlLang(state.view.uiLanguage);
  if (state.view.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = state.view.theme;
});
void store.getState().init();

// Ô gõ tự cao lên tối đa chừng này dòng rồi cuộn trong ô (spec 2026-10-17-go-dich §1.2).
const MAX_INPUT_LINES = 6;

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

function fit(el: HTMLTextAreaElement) {
  const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 22;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, line * MAX_INPUT_LINES)}px`;
}

// Nhãn nút của hộp lỗi theo màn hình nó mở (spec §5).
const OPEN_LABEL: Record<ComposeMainScreen, MessageKey> = {
  models: "compose.open.models",
  upgrade: "compose.open.upgrade",
  license: "compose.open.license",
  home: "compose.open.home",
};

// Ô soạn Gõ dịch (spec §1.2, §1.3): dòng đầu ghi ngôn ngữ đang dịch sang và trạng thái; ô gõ nhiều dòng; bản dịch (mờ khi chưa
// khớp chữ đang có); chân ô là gợi ý phím, hay hộp lỗi (kèm nút mở đúng màn hình), hay hộp quyền Trợ năng (macOS). Enter dán,
// Shift+Enter xuống dòng, Esc đóng; Enter khi bộ gõ đang chọn chữ thuộc về bộ gõ. Chiều cao cửa sổ theo nội dung.
function Compose() {
  const s = useStore(store);
  const input = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // Còn nguyên như lúc vừa mở (chưa gõ gì): bản nháp còn sót phải đang được chọn để chữ mới gõ đè lên.
  const untouched = useRef(false);
  // Mỗi lần mở: con trỏ vào ô gõ, bản nháp chọn sẵn để gõ đè được ngay.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    untouched.current = true;
    fit(el);
    el.focus();
    el.select();
  }, [s.opened]);
  // Sự kiện mở tới trước khi panel kịp nhận bàn phím (phía Rust phát `compose://open` rồi mới hiện và đưa phím vào WebView), nên
  // lệnh chọn ở trên chạy khi trang chưa có focus và WebKit đặt lại con trỏ về đầu ô: chữ gõ sau đó chèn vào trước bản nháp thay vì
  // thay nó (đo ở Teams 2026-10-18: mở lại ba lần cho 62, 93, 124 ký tự). Chọn lại đúng lúc trang nhận focus.
  useEffect(() => {
    const onFocus = () => {
      if (untouched.current) input.current?.select();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  // Chiều cao cửa sổ theo nội dung, mỗi khung hình nhiều nhất một lần; phía Rust giữ trong khoảng 120–420 px.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(el.getBoundingClientRect().height);
        void ipc.invoke("compose_resize", { height }).catch(() => {});
      });
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [s.view !== null]);
  // Esc ở bất kỳ đâu trong ô soạn, kể cả khi focus đang ở một nút.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      e.preventDefault();
      store.getState().escape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!s.view) return null;
  const view = s.view;
  const t = (key: MessageKey, params?: Params) => translate(view.uiLanguage, key, params);
  const lang = t(`lang.${view.target}`);
  const keys = pasteKeys(view.platform);
  const current = s.request?.text === s.text;
  const error = view.blocked ?? (current && s.outcome?.kind === "failed" ? s.outcome.code : null);
  const screen = error ? errorScreen(error) : null;
  const shown = shownTranslation(s);
  const status = s.loading
    ? t("compose.loading")
    : s.waiting || s.pendingSubmit
      ? t("compose.translating")
      : current && s.outcome?.kind === "sameLanguage"
        ? t("compose.sameLanguage", { lang })
        : "";
  return (
    <div ref={root} className="compose">
      <header>
        <span className="title">
          {t("compose.title")} · → {lang}
        </span>
        <span className="status" aria-live="polite">
          {status}
        </span>
      </header>
      <textarea
        ref={input}
        rows={1}
        maxLength={4000}
        // Tắt sửa chính tả, tự sửa chữ và tự viết hoa: hộp gợi ý chữ của macOS ("Report ×") hiện ngay dưới con trỏ khi vừa gõ xong
        // từ cuối và nuốt phím Enter đầu tiên (spike S2, 2026-10-17), nên Enter không dán. Chữ gõ ở đây là để dịch, không phải
        // văn bản cần chuẩn chính tả (tiếng Việt, tiếng Nhật… cũng không nên bị gạch đỏ).
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        value={s.text}
        placeholder={t("compose.placeholder")}
        aria-label={t("compose.title")}
        onChange={(e) => {
          untouched.current = false;
          fit(e.currentTarget);
          s.setText(e.currentTarget.value);
        }}
        // Bấm chuột hay phím nào khác phím bổ trợ là người dùng đã tự đặt con trỏ trong bản nháp: không chọn lại nữa.
        onMouseDown={() => {
          untouched.current = false;
        }}
        onKeyDown={(e) => {
          if (!MODIFIER_KEYS.has(e.key)) untouched.current = false;
          const action = keyAction({
            key: e.key,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            isComposing: e.nativeEvent.isComposing,
            keyCode: e.keyCode,
          });
          // Esc do listener của cửa sổ lo.
          if (action !== "enter") return;
          e.preventDefault();
          s.enter();
        }}
      />
      {shown.text !== "" && (
        <div className={shown.stale ? "translation stale" : "translation"} aria-label={t("compose.translation")}>
          {shown.text}
        </div>
      )}
      {s.permission ? (
        <div className="box" role="status">
          <p>{t("compose.permission")}</p>
          <p className="hint">{t("compose.permission.next", { keys })}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={s.allowAutoPaste}>
              {t("compose.permission.allow")}
            </button>
            <button type="button" onClick={s.copyOnly}>
              {t("compose.permission.copyOnly")}
            </button>
          </div>
        </div>
      ) : error ? (
        <div className="box error" role="alert">
          <p>{t(errorKey(error))}</p>
          {screen && (
            <div className="actions">
              <button type="button" onClick={() => s.openMain(screen)}>
                {t(OPEN_LABEL[screen])}
              </button>
            </div>
          )}
        </div>
      ) : (
        <footer>{view.autoPaste ? t("compose.hint.paste") : t("compose.hint.copy", { keys })}</footer>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Compose />
  </StrictMode>,
);
```

- [ ] **Step 5: Build và test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm build 2>&1 | tail -2 && ls dist/compose.html && pnpm test 2>&1 | grep -E 'Tests|failed'
```
Expected: `✓ built`, có `dist/compose.html`, `Tests  318 passed` (test từ điển kiểm năm từ điển cùng khóa và đúng hệ chữ).

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add compose.html vite.config.ts src/windows/compose src/i18n && git commit -q -m "feat(go-dich): trang ô soạn (ô gõ, bản dịch hiện dần, hộp lỗi, hộp quyền Trợ năng)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 9: Kiểm toàn bộ, rồi spike S1–S3 trên Mac (cổng)

**Files:**
- Create: `bench/2026-10-17-go-dich/results/spike.md`
- Modify (chỉ khi S2 cần): `src-tauri/src/compose/native_macos.rs` (`PASTE_DELAY`)

Spec §7. Spike cần **chủ dự án** ngồi máy: gõ bằng bộ gõ thật (Telex, EVKey hay OpenKey, bộ gõ Nhật), dùng các app chat thật, cấp quyền trong System Settings. Người thực thi chuẩn bị, chạy app, hướng dẫn từng bước, ghi biên bản. **Báo chủ dự án trước** khi chạy app hay thao tác tự động trên giao diện (họ đang dùng máy). Không xóa Keychain vault của app.

- [ ] **Step 1: Kiểm toàn bộ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo fmt --all -- --check && echo FMT-OK && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | grep -E '^(error|warning)|Finished' && sh scripts/check-windows.sh --locked 2>&1 | grep -E '^(error|warning)|Finished'
```
Expected: `FMT-OK`, hai lần `Finished`, không `error` (cảnh báo của build script `third_party/whisper-rs-sys` là sẵn có).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib 2>&1 | grep 'test result' && pnpm build 2>&1 | tail -1 && pnpm test 2>&1 | grep Tests && git status --short
```
Expected: `passed` = **N0 + 45** (bản 2026-10-17: 688), `✓ built`, `Tests  318 passed` (**T0 + 21**), không file nào chưa commit.

- [ ] **Step 2: Chuẩn bị chạy app dev**

Bản dev đọc tiến trình phụ ở `src-tauri/binaries/` (thư mục này của worktree đang trống) và model đã tải của máy (dùng chung với bản cài, vì cùng bundle id):

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cp /Users/dtphong/Desktop/software_business/ai-translator/src-tauri/binaries/* src-tauri/binaries/ && ls -la src-tauri/binaries/ && git status --short
```
Expected: có `asr-worker-aarch64-apple-darwin`, `llama-server-aarch64-apple-darwin`; `git status` rỗng (thư mục bị bỏ qua).

Gõ dịch dùng được ở mọi gói còn hiệu lực. Nếu máy đang ở Free đã hết dùng thử và không có key: tạo `.env` ở worktree **chỉ** với dòng `AI_TRANSLATOR_DEV_PRO=true` (công tắc của bản debug). **Không chép `.env` của thư mục chính**: file đó có khóa bí mật.

Hỏi chủ dự án trước khi chạy. Chạy bằng (giữ cửa sổ Terminal mở; thoát app bằng biểu tượng menu bar › Thoát):

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && scripts/run-dev-app.sh
```

Script mở app bằng `open` (quyền Trợ năng tính cho chính app, không phải Terminal) và ký bằng chứng thư cố định "AI Translator Dev", nên quyền đã cấp còn qua các lần build. Lần đầu dán, app chưa có quyền Trợ năng: hộp quyền hiện, bấm "Bật tự dán", bật "AI Translator Dev" trong System Settings › Quyền riêng tư & Bảo mật › Trợ năng.

- [ ] **Step 3: S1 — gõ trong NSPanel không kích hoạt app**

Chủ dự án làm, người thực thi ghi lại:
1. Mở TextEdit, đặt con trỏ trong văn bản, bấm ⌃⌥G. Ô soạn hiện giữa màn hình có con trỏ chuột, mép trên ở khoảng 25% chiều cao; TextEdit vẫn là app phía trước (menu bar ghi TextEdit); con trỏ nằm sẵn trong ô gõ.
2. Bộ gõ Telex có sẵn của macOS: gõ "Mai mình gửi báo cáo nhé". **Đạt khi** ra đúng từng chữ, không mất dấu, không lặp ký tự.
3. Như bước 2 với EVKey hoặc OpenKey (cái nào máy đang dùng).
4. Bộ gõ Nhật (Hiragana): gõ "kaigi", bấm Enter để chốt chữ. **Đạt khi** Enter chỉ chốt chữ của bộ gõ, ô soạn không dán; bấm Enter lần nữa mới dán.
5. Esc đóng ô; bấm ⌃⌥G lại: bản nháp còn, được chọn sẵn. Bấm ra ngoài ô soạn: ô đóng.

- [ ] **Step 4: S2 — bàn phím về đúng ô chat, ⌘V vào đúng chỗ**

Ở mỗi nơi: Messenger web trên Chrome, Slack, Zalo PC, khung chat của Zoom (trong một cuộc họp thử), và một app đang toàn màn hình (ví dụ Chrome toàn màn hình). Con trỏ ở ô chat → ⌃⌥G → gõ "Mai mình gửi báo cáo nhé" → chờ bản dịch → Enter. **Đạt khi** không cần bấm chuột, bản dịch vào đúng ô nhập của app đó, **không có gì bị gửi đi**; Enter lần 2 (của app chat) thì gửi.

Nơi nào dán hụt (chữ không vào, hay vào chỗ khác): tăng `PASTE_DELAY` trong `src-tauri/src/compose/native_macos.rs` lần lượt lên 200, rồi 300 ms, chạy lại script và thử lại nơi đó. Ghi số nhỏ nhất làm mọi nơi đạt. Nếu đổi:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib compose 2>&1 | grep 'test result' && git branch --show-current && git add src-tauri/src/compose/native_macos.rs && git commit -q -m "fix(go-dich): chờ <N> ms trước khi gửi ⌘V, theo spike S2" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
(thay `<N>` bằng số đã chốt, ví dụ `200`).

- [ ] **Step 5: S3 — quyền Trợ năng với bản ký ad-hoc (chỉ ghi nhận)**

Bản phát hành trên Mac đang ký ad-hoc (chưa có Developer ID). Báo trước chủ dự án: ký ad-hoc thì mỗi lần build lại, macOS hỏi lại Keychain (khoảng 5 lần) như mỗi lần cập nhật bản thật (đã chấp nhận); không xóa Keychain vault.
1. Thoát app. Chạy bản ký ad-hoc: `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && MT_DEV_SIGN_IDENTITY=- scripts/run-dev-app.sh`. Ghi: mục "AI Translator Dev" trong System Settings › Trợ năng còn bật không; dán thử: hộp quyền có hiện không (tức `AXIsProcessTrusted` là false).
2. Cấp quyền cho bản ad-hoc này (bật, hay gỡ mục cũ bằng nút "−" rồi thêm lại). Dán thử: đạt.
3. Thoát app, đổi một dòng chú thích bất kỳ trong `src-tauri/src/compose/mod.rs` để chữ ký đổi (không commit), chạy lại lệnh ở bước 1. Ghi: quyền còn không, mục trong System Settings trông thế nào (bật mà không có tác dụng?), các bước tối thiểu để bật lại.
4. Thử `tccutil reset Accessibility com.aitranslator.desktop` (không dùng `sudo`): có cần quyền admin không, chạy xong mục trong System Settings ra sao.
5. Trả lại chú thích đã đổi (`git checkout -- src-tauri/src/compose/mod.rs`), thoát app, chạy lại `scripts/run-dev-app.sh` (chứng thư cố định) và cấp lại quyền nếu cần.

- [ ] **Step 6: Biên bản**

Tạo `bench/2026-10-17-go-dich/results/spike.md` theo mẫu, điền kết quả thật (không đoán):

```markdown
# Spike Gõ dịch S1–S3 (spec 2026-10-17-go-dich §7)

**Ngày:** <ngày thử>
**Máy:** <máy, phiên bản macOS>
**Bản:** nhánh `go-dich`, commit <hash>, `scripts/run-dev-app.sh` (chứng thư "AI Translator Dev"; S3 ký ad-hoc)
**Người thử:** chủ dự án; ghi biên bản: <người thực thi>

| # | Kết quả | Ghi chú |
|---|---|---|
| S1 | Đạt / Không đạt | Telex có sẵn: …; EVKey/OpenKey: …; bộ gõ Nhật: … |
| S2 | Đạt / Không đạt | `PASTE_DELAY` chốt: … ms |
| S3 | (ghi nhận) | … |

## S1 — gõ trong NSPanel không kích hoạt app

<từng bước của Step 3 và kết quả>

## S2 — bàn phím về đúng ô chat, ⌘V vào đúng chỗ

| Nơi | Dán đúng ô | Không gửi nhầm | Ghi chú |
|---|---|---|---|
| Messenger web, Chrome | | | |
| Slack | | | |
| Zalo PC | | | |
| Zoom, khung chat | | | |
| App toàn màn hình (<app>) | | | |

## S3 — quyền Trợ năng với bản ký ad-hoc

<quan sát của Step 5; các bước tối thiểu để bật lại quyền sau khi chữ ký đổi; `tccutil` có cần admin không>

## Kết luận cho spec §4.2

<lời hướng dẫn bật lại quyền nên ghi gì; có gì cần sửa thiết kế>
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add bench/2026-10-17-go-dich/results/spike.md && git commit -q -m "docs(go-dich): biên bản spike S1–S3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

- [ ] **Step 7: Cổng**

- S1 và S2 đều đạt: báo chủ dự án kết quả (kèm `PASTE_DELAY` đã chốt và kết luận S3), rồi sang kế hoạch 04.
- S1 hay S2 không đạt: **dừng**. Không làm kế hoạch 04, 05. Báo chủ dự án theo mục "Nếu spike không đạt" dưới đây.

Xong spike: thoát app dev; kiểm không còn tiến trình do mình mở (`pgrep -fl "AI Translator Dev.app"`, `lsof -nP -iTCP:1420 -sTCP:LISTEN` phải rỗng).

---

## Nếu spike không đạt

Không tự sửa thiết kế. Ghi rõ hiện tượng vào biên bản rồi trình chủ dự án các hướng sau, kèm đánh đổi:

**S1 không đạt** (gõ Telex trong panel không kích hoạt app bị mất dấu, lặp chữ; hay Enter của bộ gõ Nhật bị coi là dán):
- Hướng 1: ô soạn **kích hoạt app** khi hiện (NSPanel thường, bỏ `NonactivatingPanel`). Trước khi hiện, nhớ app đang ở phía trước (`NSWorkspace.frontmostApplication`); lúc dán thì kích hoạt lại app đó rồi mới gửi ⌘V, như cách của Windows (spec §4.3). Đánh đổi: menu bar đổi sang AI Translator trong lúc gõ; dán phụ thuộc việc kích hoạt lại app trước có kịp không (cần chờ như Windows).
- Hướng 2: nếu chỉ một bộ gõ hỏng (ví dụ chỉ EVKey): ghi vào rủi ro đã biết và trang hỗ trợ, giữ thiết kế.

**S2 không đạt** (dán vào chỗ khác, hay phải bấm chuột):
- Chỉ hụt khi chờ ngắn: tăng `PASTE_DELAY` (tới 300 ms) là đủ, không phải sửa thiết kế.
- Bàn phím không về ô chat cũ dù chờ lâu: kích hoạt lại app trước một cách tường minh như Hướng 1 của S1.
- Hụt ở đúng một vài app (ví dụ app toàn màn hình): ghi lại để chủ dự án quyết giữ hay chuyển nơi đó sang chế độ "chỉ chép".

Mọi hướng đổi thiết kế phải sửa spec §3.1, §4.1, §4.2 và kế hoạch này trước khi code lại; chủ dự án duyệt.
