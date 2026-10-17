# Gõ dịch 04: nhóm Cài đặt, quyền Trợ năng, trang xem trước — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cửa sổ chính có nhóm Cài đặt "Gõ dịch" (bật/tắt, "Dịch sang" với "Tự động (đang là …)", và trên macOS: tự dán cùng trạng thái quyền Trợ năng và nút mở trang Trợ năng). Trang xem trước có đủ các cảnh của ô soạn và nhóm Cài đặt mới, kiểm được ở năm ngôn ngữ giao diện.

**Architecture:** Hai lệnh mới của cửa sổ `main`: `get_accessibility_trusted` (đọc `compose::Native::trusted`, hỏi hệ thống mỗi lần) và `open_accessibility_settings` (cùng việc với `compose_open_accessibility` của ô soạn). `autoTarget` là bản TypeScript của `compose::target::auto_target`, để nhóm Cài đặt ghi "Tự động (đang là English)". Store của cửa sổ chính giữ `accessibilityTrusted`, đọc lại khi mở nhóm và mỗi khi cửa sổ được focus lại (người dùng bật quyền ở System Settings rồi quay về). IPC giả của `scripts/ui-preview` dựng ô soạn ở từng trạng thái bằng đúng đường của giao diện thật.

**Tech Stack:** Rust 2024, Tauri 2.12, React 19, Zustand 5, Vitest 5, Vite (trang xem trước), Chrome không đầu (`check-i18n.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-17-go-dich-design.md` §1.4, §2.1, §3.6, §4.2, §8.1 (giao diện). Tổng quan và quy tắc chung: `docs/superpowers/plans/2026-10-17-go-dich-00-tong-quan.md` (đọc trước). Cần kế hoạch 03 đã xong **và đã qua cổng spike** (S1, S2 đạt).

**Quy tắc chung:** như mục "Quy tắc chung cho mọi kế hoạch" của kế hoạch 00. Mã ở đây đã chạy thật ở commit `9da931b` của nhánh `go-dich-proto`.

## Cấu trúc file

| File | Việc |
|---|---|
| Modify `src-tauri/src/compose/mod.rs` | `accessibility_trusted` |
| Modify `src-tauri/src/commands.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json` | Hai lệnh mới của cửa sổ chính |
| Modify `src-tauri/src/acl_tests.rs`, `src-tauri/src/compose/tests.rs` | Lệnh mở trang Trợ năng của cửa sổ chính chỉ tới bản giả; đọc quyền |
| Modify `src/lib/compose.ts`, `src/lib/compose.test.ts` | `autoTarget` |
| Modify `src/lib/ipc.ts` | Hai lệnh; nhóm Cài đặt `"compose"` |
| Modify `src/store/app.ts`, `src/store/app.test.ts` | `accessibilityTrusted`, `loadAccessibility`, `openAccessibilitySettings` |
| Create `src/windows/main/settings/ComposeSettings.tsx` | Nhóm Cài đặt "Gõ dịch" |
| Modify `src/windows/main/screens/SettingsScreen.tsx` | Thêm nhóm, đứng sau "Phụ đề" |
| Modify `src/i18n/{en,vi,ja,zh,ko}.ts` | Mười hai chuỗi của nhóm Cài đặt |
| Modify `scripts/ui-preview/tauri-mock.ts`, `scripts/ui-preview/check-i18n.mjs` | Trang `compose.html` giả, cảnh của nhóm Cài đặt và ô soạn |

---

### Task 0: Kiểm nhánh, cổng spike, mốc xuất phát

**Files:** không sửa file.

- [ ] **Step 1: Cổng spike**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git status --short && sed -n '/^| S1 /p;/^| S2 /p' bench/2026-10-17-go-dich/results/spike.md
```
Expected: `go-dich`, không có file đổi, dòng S1 và S2 của biên bản đều ghi `Đạt`. Không có biên bản hay có dòng `Không đạt`: **dừng**, đây là việc của mục "Nếu spike không đạt" ở kế hoạch 03.

- [ ] **Step 2: Chạy mốc**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm build 2>&1 | tail -1 && cargo test --locked -p meeting-translator --lib 2>&1 | grep 'test result' && pnpm test 2>&1 | grep Tests
```
Expected: `✓ built`, `passed` = N0 + 45 (bản 2026-10-17: 688; **ghi là N3**), `Tests  318 passed` (T0 + 21; **ghi là T3**).

---

### Task 1: Hai lệnh quyền Trợ năng của cửa sổ chính

**Files:**
- Modify: `src-tauri/src/compose/mod.rs`, `src-tauri/src/commands.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json`, `src-tauri/src/acl_tests.rs`, `src-tauri/src/compose/tests.rs`

QĐ7 của kế hoạch 00: mục trạng thái quyền ở Cài đặt › Gõ dịch (spec §1.4) cần đọc quyền và mở trang Trợ năng từ cửa sổ chính. Lệnh `compose_open_accessibility` của ô soạn chỉ cửa sổ `compose` gọi được, nên thêm hai lệnh cho cửa sổ `main`:
- `get_accessibility_trusted() → bool`: macOS hỏi hệ thống mỗi lần (`Native::trusted`); Windows luôn `true`; app chưa có ô soạn thì `true`.
- `open_accessibility_settings()`: hỏi quyền (để app hiện trong danh sách) rồi mở trang Trợ năng qua `SystemOpener`; Windows báo `unsupported`. Lệnh có tác dụng ra ngoài app nên vào danh sách `OPENER_COMMANDS` của `acl_tests`.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src-tauri/src/compose/tests.rs`, tìm đoạn (duy nhất, ở cuối file):

```rust
    assert!(error.contains("hotkeyDuplicate"), "{error}");
}
```

thay bằng:

```rust
    assert!(error.contains("hotkeyDuplicate"), "{error}");
}

/// Spec §1.4: Cài đặt › Gõ dịch đọc được trạng thái quyền Trợ năng (macOS hỏi hệ thống mỗi lần).
#[test]
fn the_main_window_reads_the_accessibility_permission() {
    use std::sync::atomic::Ordering;

    use crate::test_support::FakeNative;

    let app = mock_app();
    let main = window(&app, "main");
    assert_eq!(invoke(&main, "get_accessibility_trusted", json!({})).unwrap(), true);
    app.state::<FakeNative>().trusted.store(false, Ordering::SeqCst);
    assert_eq!(invoke(&main, "get_accessibility_trusted", json!({})).unwrap(), false);
}
```

Trong `src-tauri/src/acl_tests.rs`, tìm đoạn (duy nhất):

```rust
    "open_audio_permission_settings",
];
```

thay bằng:

```rust
    "open_audio_permission_settings",
    "open_accessibility_settings",
];
```

Cùng file, trong `outside_effects_only_reach_the_fake_opener`, tìm đoạn (duy nhất):

```rust
            "open_audio_permission_settings",
        ]
    } else {
```

thay bằng:

```rust
            "open_audio_permission_settings",
            "open_accessibility_settings",
        ]
    } else {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib -- the_main_window_reads outside_effects 2>&1 | grep -E 'panicked|test result' | head -4
```
Expected: hai test đỏ (lệnh `get_accessibility_trusted` không có; lệnh `open_accessibility_settings` của cửa sổ chính bị chặn).

- [ ] **Step 3: `accessibility_trusted` và hai lệnh**

Trong `src-tauri/src/compose/mod.rs`, tìm đoạn (duy nhất):

```rust
/// "Bật tự dán" ở hộp quyền (spec §4.2, chỉ macOS): hỏi quyền Trợ năng để app hiện trong danh sách, rồi mở trang Trợ năng của
/// System Settings (qua `SystemOpener`, như mọi việc mở ra ngoài app).
```

thay bằng:

```rust
/// Có quyền tự dán không, cho Cài đặt › Gõ dịch (spec §1.4): macOS hỏi hệ thống mỗi lần (quyền có thể vừa được bật hay vừa mất
/// sau khi cập nhật); Windows không cần quyền.
pub fn accessibility_trusted<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<Compose>().is_none_or(|c| c.native.trusted())
}

/// "Bật tự dán" ở hộp quyền và "Mở cài đặt Trợ năng" ở Cài đặt › Gõ dịch (spec §1.4, §4.2, chỉ macOS): hỏi quyền Trợ năng để
/// app hiện trong danh sách, rồi mở trang Trợ năng của System Settings (qua `SystemOpener`, như mọi việc mở ra ngoài app).
```

Trong `src-tauri/src/commands.rs`, tìm đoạn (duy nhất):

```rust
    actions::open_audio_permission_settings(&app)
}
```

thay bằng:

```rust
    actions::open_audio_permission_settings(&app)
}

/// Cài đặt › Gõ dịch (spec 2026-10-17-go-dich §1.4): đã có quyền Trợ năng chưa (macOS); Windows không cần quyền nên luôn `true`.
#[tauri::command]
pub fn get_accessibility_trusted<R: Runtime>(app: AppHandle<R>) -> bool {
    compose::accessibility_trusted(&app)
}

/// Nút "Mở cài đặt Trợ năng" ở Cài đặt › Gõ dịch (macOS): hỏi quyền rồi mở trang Trợ năng của System Settings.
#[tauri::command]
pub fn open_accessibility_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    compose::open_accessibility(&app)
}
```

Cùng file, trong `MAIN_COMMANDS`, tìm dòng (duy nhất):

```rust
    "open_audio_permission_settings",
```

thay bằng:

```rust
    "open_audio_permission_settings",
    "get_accessibility_trusted",
    "open_accessibility_settings",
```

Cùng file, trong `handler`, tìm dòng (duy nhất):

```rust
        open_audio_permission_settings,
```

thay bằng:

```rust
        open_audio_permission_settings,
        get_accessibility_trusted,
        open_accessibility_settings,
```

Trong `src-tauri/build.rs`, tìm dòng (duy nhất):

```rust
                "open_audio_permission_settings",
```

thay bằng:

```rust
                "open_audio_permission_settings",
                "get_accessibility_trusted",
                "open_accessibility_settings",
```

Trong `src-tauri/capabilities/main.json`, tìm dòng (duy nhất):

```json
    "allow-open-audio-permission-settings",
```

thay bằng:

```json
    "allow-open-audio-permission-settings",
    "allow-get-accessibility-trusted",
    "allow-open-accessibility-settings",
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib 2>&1 | grep -E 'test result|FAILED'
```
Expected: `test result: ok.` với `passed` = N3 + 1, không `FAILED` (cả `acl_tests::capabilities_grant_exactly_the_fixed_lists`: `main.json` khớp `MAIN_COMMANDS`).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src-tauri/src/compose src-tauri/src/commands.rs src-tauri/build.rs src-tauri/capabilities/main.json src-tauri/src/acl_tests.rs && git commit -q -m "feat(go-dich): cửa sổ chính đọc quyền Trợ năng và mở trang Trợ năng" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: `autoTarget` phía giao diện

**Files:**
- Modify: `src/lib/compose.ts`, `src/lib/compose.test.ts`

Spec §1.4, §2.1: ô "Dịch sang" ghi "Tự động (đang là English)", nên giao diện cần đúng luật của `compose::target::auto_target` (kế hoạch 01, Task 2). Test dùng **cùng các trường hợp** với test phía Rust; đổi luật thì sửa cả hai nơi.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src/lib/compose.test.ts`, tìm đoạn (duy nhất):

```ts
import { type ComposeKey, errorScreen, keyAction, pasteKeys, shownTranslation } from "./compose";

const press = (key: string, extra: Partial<ComposeKey> = {}): ComposeKey => ({
```

thay bằng:

```ts
import { type ComposeKey, autoTarget, errorScreen, keyAction, pasteKeys, shownTranslation } from "./compose";
import { LANGS, type Lang } from "./ipc";

// Cùng các trường hợp với test của `compose::target` phía Rust (spec 2026-10-17-go-dich §2.1).
describe("autoTarget", () => {
  const auto = (targetLanguage: Lang, sourceLanguages: Lang[], sourceLock: Lang | null = null) =>
    autoTarget({ targetLanguage, sourceLanguages, sourceLock });
  const ALL = [...LANGS];

  it("người bên kia nói English trừ khi phụ đề cho biết khác", () => {
    expect(auto("vi", ALL)).toBe("en");
    expect(auto("vi", ALL, "ja")).toBe("ja");
    expect(auto("vi", ["vi", "ko"])).toBe("ko");
    expect(auto("vi", ["zh"])).toBe("zh");
    expect(auto("vi", ["en", "ja"])).toBe("en");
    expect(auto("vi", ALL, "vi")).toBe("en");
  });

  it("phụ đề dịch sang English thì người bên kia nói tiếng Việt", () => {
    expect(auto("en", ALL)).toBe("vi");
    expect(auto("en", ["en", "ja", "vi"])).toBe("vi");
    expect(auto("en", ALL, "zh")).toBe("zh");
    expect(auto("ja", ALL)).toBe("en");
  });
});

const press = (key: string, extra: Partial<ComposeKey> = {}): ComposeKey => ({
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec vitest run src/lib/compose.test.ts 2>&1 | grep -E 'autoTarget|FAIL' | head -3
```
Expected: đỏ (`autoTarget is not a function`, hay lỗi import).

- [ ] **Step 2: Viết hàm**

Trong `src/lib/compose.ts`, tìm đoạn (duy nhất):

```ts
import type { ComposeMainScreen, ComposeOutcome } from "./ipc";

// Phần thuần của ô soạn Gõ dịch (spec 2026-10-17-go-dich §1.2, §1.3, §5): phím nào làm gì, bản dịch nào đang hiện, nút nào của
// hộp lỗi mở màn hình nào.
```

thay bằng:

```ts
import type { ComposeMainScreen, ComposeOutcome, Lang, Settings } from "./ipc";

// Phần thuần của Gõ dịch (spec 2026-10-17-go-dich §1.2, §1.3, §2.1, §5): ngôn ngữ đích "Tự động", phím nào làm gì trong ô soạn,
// bản dịch nào đang hiện, nút nào của hộp lỗi mở màn hình nào.

// Ngôn ngữ đích "Tự động" ("tiếng người bên kia", spec §2.1), cùng luật với `compose::target::auto_target` phía Rust: tập ngôn
// ngữ nguồn của phụ đề (ngôn ngữ đang khóa, hay cả tập) bỏ ngôn ngữ đích của phụ đề mà còn đúng một ngôn ngữ thì dịch sang ngôn
// ngữ đó; không thì English, riêng khi phụ đề đang dịch sang English thì Tiếng Việt. Cài đặt › Gõ dịch ghi kết quả này.
export function autoTarget(settings: Pick<Settings, "targetLanguage" | "sourceLanguages" | "sourceLock">): Lang {
  const candidates = settings.sourceLock ? [settings.sourceLock] : settings.sourceLanguages;
  const others = candidates.filter((lang) => lang !== settings.targetLanguage);
  const only = others.length === 1 ? others[0] : undefined;
  if (only) return only;
  return settings.targetLanguage === "en" ? "vi" : "en";
}
```

- [ ] **Step 3: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec tsc --noEmit && echo TSC-OK && pnpm test 2>&1 | grep -E 'Tests|failed'
```
Expected: `TSC-OK`, `Tests  320 passed` (T3 + 2).

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src/lib/compose.ts src/lib/compose.test.ts && git commit -q -m "feat(go-dich): ngôn ngữ đích Tự động phía giao diện, cùng luật với Rust" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: Store của cửa sổ chính đọc quyền Trợ năng

**Files:**
- Modify: `src/lib/ipc.ts`, `src/store/app.ts`, `src/store/app.test.ts`

`accessibilityTrusted` (`null` là chưa đọc). `loadAccessibility` đọc lặng lẽ: lỗi thì giữ trạng thái cũ, không hiện thanh báo lỗi (nhóm Cài đặt vẫn có nút mở trang Trợ năng). `openAccessibilitySettings` đi qua `run` như các nút mở System Settings khác (lỗi thì hiện ở thanh báo lỗi).

- [ ] **Step 1: Kiểu hai lệnh**

Trong `src/lib/ipc.ts`, tìm dòng (duy nhất):

```ts
  open_audio_permission_settings: { args: undefined; result: null };
```

thay bằng:

```ts
  open_audio_permission_settings: { args: undefined; result: null };
  // Cài đặt › Gõ dịch (macOS): đã có quyền Trợ năng chưa (Windows luôn `true`); mở trang Trợ năng của System Settings.
  get_accessibility_trusted: { args: undefined; result: boolean };
  open_accessibility_settings: { args: undefined; result: null };
```

- [ ] **Step 2: Viết test trước (đỏ)**

Trong `src/store/app.test.ts`, tìm dòng (duy nhất):

```ts
    open_audio_permission_settings: () => null,
```

thay bằng:

```ts
    open_audio_permission_settings: () => null,
    get_accessibility_trusted: () => false,
    open_accessibility_settings: () => null,
```

Cùng file, tìm dòng (duy nhất):

```ts
  it("tên nguồn cho màn hình chính: đọc một lần, lặng lẽ (không hiện lỗi, không xóa lỗi đang có)", async () => {
```

thay bằng:

```ts
  // Spec 2026-10-17-go-dich §1.4: Cài đặt › Gõ dịch đọc trạng thái quyền Trợ năng và mở được trang Trợ năng.
  it("đọc quyền Trợ năng và mở trang Trợ năng", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    expect(store.getState().accessibilityTrusted).toBeNull();
    await store.getState().loadAccessibility();
    expect(store.getState().accessibilityTrusted).toBe(false);
    await store.getState().openAccessibilitySettings();
    expect(fake.calls.at(-1)?.cmd).toBe("open_accessibility_settings");
    expect(store.getState().error).toBeNull();
  });

  it("tên nguồn cho màn hình chính: đọc một lần, lặng lẽ (không hiện lỗi, không xóa lỗi đang có)", async () => {
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec vitest run src/store/app.test.ts 2>&1 | grep -E 'Tests|FAIL' | head -3
```
Expected: đỏ, test "đọc quyền Trợ năng và mở trang Trợ năng" lỗi (`loadAccessibility is not a function`).

- [ ] **Step 3: Store**

Trong `src/store/app.ts`, tìm đoạn (duy nhất):

```ts
  // Phiên bản cập nhật mà người dùng đã bấm "Để sau" (chỉ trong lần chạy này; menu khay vẫn còn mục khởi động lại).
  updateDismissed: string | null;
```

thay bằng:

```ts
  // Phiên bản cập nhật mà người dùng đã bấm "Để sau" (chỉ trong lần chạy này; menu khay vẫn còn mục khởi động lại).
  updateDismissed: string | null;
  // macOS: đã có quyền Trợ năng chưa (Cài đặt › Gõ dịch, spec 2026-10-17-go-dich §1.4); `null` là chưa đọc.
  accessibilityTrusted: boolean | null;
```

Cùng file, tìm đoạn (duy nhất):

```ts
  openAudioPermissionSettings(): Promise<void>;
  loadAudioSources(): Promise<void>;
```

thay bằng:

```ts
  openAudioPermissionSettings(): Promise<void>;
  // Đọc lại quyền Trợ năng (lúc mở nhóm Cài đặt "Gõ dịch" và mỗi khi cửa sổ được focus lại). Lặng lẽ: lỗi thì giữ trạng thái cũ.
  loadAccessibility(): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  loadAudioSources(): Promise<void>;
```

Cùng file, tìm đoạn (duy nhất):

```ts
      updateDismissed: null,

      // Lỗi ở bất kỳ bước nào thì gỡ các listener đã đăng ký rồi ném lỗi tiếp cho bên gọi (`main.tsx` hiện câu báo).
```

thay bằng:

```ts
      updateDismissed: null,
      accessibilityTrusted: null,

      // Lỗi ở bất kỳ bước nào thì gỡ các listener đã đăng ký rồi ném lỗi tiếp cho bên gọi (`main.tsx` hiện câu báo).
```

Cùng file, tìm dòng (duy nhất):

```ts
      async loadAudioSourceNames() {
```

thay bằng:

```ts
      async loadAccessibility() {
        try {
          set({ accessibilityTrusted: await ipc.invoke("get_accessibility_trusted") });
        } catch {
          // Giữ trạng thái cũ; nhóm Cài đặt vẫn có nút mở trang Trợ năng.
        }
      },

      async openAccessibilitySettings() {
        await run(
          () => ipc.invoke("open_accessibility_settings"),
          () => {},
        );
      },

      async loadAudioSourceNames() {
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec tsc --noEmit && echo TSC-OK && pnpm test 2>&1 | grep -E 'Tests|failed'
```
Expected: `TSC-OK`, `Tests  321 passed` (T3 + 3).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src/lib/ipc.ts src/store/app.ts src/store/app.test.ts && git commit -q -m "feat(go-dich): store của cửa sổ chính đọc quyền Trợ năng" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: Nhóm Cài đặt "Gõ dịch"

**Files:**
- Modify: `src/lib/ipc.ts`, `src/windows/main/screens/SettingsScreen.tsx`, `src/i18n/{en,vi,ja,zh,ko}.ts`
- Create: `src/windows/main/settings/ComposeSettings.tsx`

Spec §1.4. Nhóm đứng ngay sau "Phụ đề" (hợp đồng của kế hoạch 00):
- Công tắc "Bật Gõ dịch" (gợi ý ghi phím tắt hiện tại theo cách viết của hệ điều hành, `formatAccelerator`; tắt thì gỡ phím, kế hoạch 03 Task 3).
- "Dịch sang": "Tự động (đang là …)" theo `autoTarget`, hay một trong năm ngôn ngữ.
- Chỉ macOS: công tắc "Tự dán vào ô đang gõ"; khi bật thì thêm dòng "Quyền Trợ năng" ("Đã cấp." / "Chưa cấp. …", câu chưa cấp có hướng dẫn gỡ rồi thêm lại sau khi cập nhật) và nút "Mở cài đặt Trợ năng". Đọc quyền khi mở nhóm và mỗi khi cửa sổ được focus lại.
- Phím tắt đổi ở nhóm Phím tắt (dòng "Mở Gõ dịch" đã có từ kế hoạch 03).

Câu "Chưa cấp" theo kết luận của spike S3 (biên bản `bench/2026-10-17-go-dich/results/spike.md`): nếu S3 cho thấy cách bật lại quyền khác "xóa khỏi danh sách rồi thêm lại", sửa câu `settings.compose.permission.missing` ở năm từ điển cho đúng và ghi vào commit.

- [ ] **Step 1: Nhóm `compose`**

Trong `src/lib/ipc.ts`, tìm dòng (duy nhất):

```ts
export type SettingsGroup = "general" | "subtitles" | "audio" | "model" | "hotkeys" | "license" | "privacy";
```

thay bằng:

```ts
// "compose": nhóm Cài đặt "Gõ dịch" (spec 2026-10-17-go-dich §1.4).
export type SettingsGroup =
  | "general"
  | "subtitles"
  | "compose"
  | "audio"
  | "model"
  | "hotkeys"
  | "license"
  | "privacy";
```

- [ ] **Step 2: Chuỗi**

Trong mỗi file dưới đây, tìm dòng `"settings.group.subtitles": …` (duy nhất trong file) và thêm ngay sau nó một dòng:

`src/i18n/en.ts`:
```ts
  "settings.group.compose": "Type & Translate",
```

`src/i18n/vi.ts`:
```ts
  "settings.group.compose": "Gõ dịch",
```

`src/i18n/ja.ts`:
```ts
  "settings.group.compose": "入力翻訳",
```

`src/i18n/zh.ts`:
```ts
  "settings.group.compose": "输入翻译",
```

`src/i18n/ko.ts`:
```ts
  "settings.group.compose": "입력 번역",
```

Trong mỗi file dưới đây, tìm dòng `"settings.license.description": …` (duy nhất trong file) và thêm ngay sau nó mười một dòng:

`src/i18n/en.ts`:
```ts
  "settings.compose.enabled": "Turn on Type & Translate",
  "settings.compose.enabled.hint": "In any chat box, press {hotkey}, type your message and press Enter: the translation is pasted into the chat box. Press Enter again to send. Change the shortcut under Shortcuts.",
  "settings.compose.target": "Translate into",
  "settings.compose.target.auto": "Automatic (now {lang})",
  "settings.compose.target.hint": "Automatic uses the language of the people you talk to, from the subtitle settings: the meeting language if there is only one, otherwise English (Vietnamese when the subtitles are in English).",
  "settings.compose.autoPaste": "Paste into the chat box automatically",
  "settings.compose.autoPaste.hint": "Needs the Accessibility permission. When off, Enter only copies the translation and you paste it with ⌘V.",
  "settings.compose.permission": "Accessibility permission",
  "settings.compose.permission.granted": "Granted.",
  "settings.compose.permission.missing": "Not granted. Turn on AI Translator in Accessibility. If it is on but still shows as not granted (often after an update), remove it from the list and add it again.",
  "settings.compose.permission.open": "Open Accessibility settings",
```

`src/i18n/vi.ts`:
```ts
  "settings.compose.enabled": "Bật Gõ dịch",
  "settings.compose.enabled.hint": "Ở ô chat bất kỳ, bấm {hotkey}, gõ tin nhắn rồi Enter: bản dịch được dán vào ô chat. Enter lần nữa để gửi. Đổi phím ở nhóm Phím tắt.",
  "settings.compose.target": "Dịch sang",
  "settings.compose.target.auto": "Tự động (đang là {lang})",
  "settings.compose.target.hint": "Tự động lấy tiếng của người bên kia theo cài đặt phụ đề: ngôn ngữ của cuộc họp nếu chỉ có một, không thì English (Tiếng Việt khi phụ đề đang dịch sang English).",
  "settings.compose.autoPaste": "Tự dán vào ô đang gõ",
  "settings.compose.autoPaste.hint": "Cần quyền Trợ năng. Tắt thì Enter chỉ chép bản dịch, bạn tự dán bằng ⌘V.",
  "settings.compose.permission": "Quyền Trợ năng",
  "settings.compose.permission.granted": "Đã cấp.",
  "settings.compose.permission.missing": "Chưa cấp. Hãy bật AI Translator trong Trợ năng. Nếu đã bật mà vẫn báo chưa cấp (thường sau khi cập nhật), hãy xóa app khỏi danh sách rồi thêm lại.",
  "settings.compose.permission.open": "Mở cài đặt Trợ năng",
```

`src/i18n/ja.ts`:
```ts
  "settings.compose.enabled": "入力翻訳をオンにする",
  "settings.compose.enabled.hint": "チャット欄で {hotkey} を押し、メッセージを入力して Enter を押すと、翻訳がチャット欄に貼り付けられます。もう一度 Enter を押すと送信されます。ショートカットは「ショートカット」で変更できます。",
  "settings.compose.target": "翻訳先の言語",
  "settings.compose.target.auto": "自動（現在：{lang}）",
  "settings.compose.target.hint": "自動では、字幕の設定から相手の言語を使います。会議の言語が 1 つだけならその言語、それ以外は English（字幕が English の場合は Tiếng Việt）です。",
  "settings.compose.autoPaste": "チャット欄に自動で貼り付ける",
  "settings.compose.autoPaste.hint": "アクセシビリティの許可が必要です。オフにすると、Enter は翻訳をコピーするだけになり、⌘V で貼り付けます。",
  "settings.compose.permission": "アクセシビリティの許可",
  "settings.compose.permission.granted": "許可済みです。",
  "settings.compose.permission.missing": "許可されていません。アクセシビリティで AI Translator をオンにしてください。オンなのに許可されていないと表示される場合（アップデート後によくあります）は、一覧から削除してから追加し直してください。",
  "settings.compose.permission.open": "アクセシビリティ設定を開く",
```

`src/i18n/zh.ts`:
```ts
  "settings.compose.enabled": "开启输入翻译",
  "settings.compose.enabled.hint": "在任意聊天框中按 {hotkey}，输入消息后按 Enter，译文会粘贴到聊天框中。再按一次 Enter 即可发送。可在“快捷键”中更改快捷键。",
  "settings.compose.target": "目标语言",
  "settings.compose.target.auto": "自动（当前：{lang}）",
  "settings.compose.target.hint": "自动会根据字幕设置使用对方的语言：会议只有一种语言时用该语言，否则用 English（字幕为 English 时用 Tiếng Việt）。",
  "settings.compose.autoPaste": "自动粘贴到聊天框",
  "settings.compose.autoPaste.hint": "需要“辅助功能”权限。关闭后，按 Enter 只会复制译文，需要用 ⌘V 粘贴。",
  "settings.compose.permission": "辅助功能权限",
  "settings.compose.permission.granted": "已授权。",
  "settings.compose.permission.missing": "未授权。请在“辅助功能”中开启 AI Translator。如果已经开启却仍显示未授权（常见于更新后），请将它从列表中删除后再重新添加。",
  "settings.compose.permission.open": "打开辅助功能设置",
```

`src/i18n/ko.ts`:
```ts
  "settings.compose.enabled": "입력 번역 켜기",
  "settings.compose.enabled.hint": "아무 채팅 입력란에서 {hotkey}를 누르고 메시지를 입력한 뒤 Enter를 누르면 번역이 채팅 입력란에 붙여넣어집니다. Enter를 한 번 더 누르면 전송됩니다. 단축키는 단축키 설정에서 바꿀 수 있습니다.",
  "settings.compose.target": "번역 언어",
  "settings.compose.target.auto": "자동(현재: {lang})",
  "settings.compose.target.hint": "자동은 자막 설정에서 상대방의 언어를 가져옵니다. 회의 언어가 하나뿐이면 그 언어, 아니면 English(자막이 English이면 Tiếng Việt)입니다.",
  "settings.compose.autoPaste": "채팅 입력란에 자동으로 붙여넣기",
  "settings.compose.autoPaste.hint": "손쉬운 사용 권한이 필요합니다. 끄면 Enter는 번역을 복사만 하고, ⌘V로 직접 붙여넣어야 합니다.",
  "settings.compose.permission": "손쉬운 사용 권한",
  "settings.compose.permission.granted": "허용되었습니다.",
  "settings.compose.permission.missing": "허용되지 않았습니다. 손쉬운 사용에서 AI Translator를 켜세요. 이미 켰는데도 허용되지 않았다고 나오면(업데이트 후에 흔함) 목록에서 지운 뒤 다시 추가하세요.",
  "settings.compose.permission.open": "손쉬운 사용 설정 열기",
```

- [ ] **Step 3: Component**

Tạo `src/windows/main/settings/ComposeSettings.tsx`:

```tsx
import { useEffect } from "react";
import { Field } from "../../../components/Field";
import { autoTarget } from "../../../lib/compose";
import { formatAccelerator } from "../../../lib/hotkeys";
import { type ComposeTarget, LANGS } from "../../../lib/ipc";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Gõ dịch" (spec 2026-10-17-go-dich §1.4): công tắc bật (tắt thì gỡ phím tắt, phím vẫn giữ), ngôn ngữ đích ("Tự
// động" ghi rõ đang là ngôn ngữ nào), và chỉ trên macOS: tự dán cùng trạng thái quyền Trợ năng (đọc lại mỗi khi cửa sổ được
// focus lại, vì người dùng bật quyền ở System Settings rồi quay về). Phím tắt đổi ở nhóm Phím tắt.
export function ComposeSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const trusted = useApp((s) => s.accessibilityTrusted);
  const update = useApp((s) => s.updateSettings);
  const loadAccessibility = useApp((s) => s.loadAccessibility);
  const openAccessibility = useApp((s) => s.openAccessibilitySettings);
  const mac = info?.platform === "macos";
  useEffect(() => {
    if (!mac) return;
    void loadAccessibility();
    const onFocus = () => void loadAccessibility();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [mac, loadAccessibility]);
  if (!settings || !info) return null;
  const compose = settings.compose;
  const hotkey = formatAccelerator(settings.hotkeys.compose, info.platform);
  return (
    <div className="card list">
      <Field
        label={t("settings.compose.enabled")}
        htmlFor="compose-enabled"
        hint={t("settings.compose.enabled.hint", { hotkey })}
        hintId="compose-enabled-hint"
      >
        <input
          id="compose-enabled"
          className="switch"
          type="checkbox"
          checked={compose.enabled}
          aria-describedby="compose-enabled-hint"
          onChange={(e) => void update({ compose: { enabled: e.target.checked } })}
        />
      </Field>
      <Field
        label={t("settings.compose.target")}
        htmlFor="compose-target"
        hint={t("settings.compose.target.hint")}
        hintId="compose-target-hint"
      >
        <select
          id="compose-target"
          value={compose.target}
          aria-describedby="compose-target-hint"
          onChange={(e) => void update({ compose: { target: e.target.value as ComposeTarget } })}
        >
          <option value="auto">{t("settings.compose.target.auto", { lang: t(`lang.${autoTarget(settings)}`) })}</option>
          {LANGS.map((lang) => (
            <option key={lang} value={lang}>
              {t(`lang.${lang}`)}
            </option>
          ))}
        </select>
      </Field>
      {mac && (
        <Field
          label={t("settings.compose.autoPaste")}
          htmlFor="compose-auto-paste"
          hint={t("settings.compose.autoPaste.hint")}
          hintId="compose-auto-paste-hint"
        >
          <input
            id="compose-auto-paste"
            className="switch"
            type="checkbox"
            checked={compose.autoPaste}
            aria-describedby="compose-auto-paste-hint"
            onChange={(e) => void update({ compose: { autoPaste: e.target.checked } })}
          />
        </Field>
      )}
      {mac && compose.autoPaste && (
        <Field
          label={t("settings.compose.permission")}
          hint={t(trusted ? "settings.compose.permission.granted" : "settings.compose.permission.missing")}
        >
          <button onClick={() => void openAccessibility()}>{t("settings.compose.permission.open")}</button>
        </Field>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Thêm vào màn hình Cài đặt**

Trong `src/windows/main/screens/SettingsScreen.tsx`, tìm dòng (duy nhất):

```tsx
import { AudioSettings } from "../settings/AudioSettings";
```

thay bằng:

```tsx
import { AudioSettings } from "../settings/AudioSettings";
import { ComposeSettings } from "../settings/ComposeSettings";
```

Cùng file, tìm dòng (duy nhất):

```tsx
const GROUPS: readonly SettingsGroup[] = ["general", "subtitles", "audio", "model", "hotkeys", "license", "privacy"];
```

thay bằng:

```tsx
const GROUPS: readonly SettingsGroup[] = [
  "general",
  "subtitles",
  "compose",
  "audio",
  "model",
  "hotkeys",
  "license",
  "privacy",
];
```

Cùng file, tìm dòng (duy nhất):

```tsx
        {group === "subtitles" && <SubtitleSettings />}
```

thay bằng:

```tsx
        {group === "subtitles" && <SubtitleSettings />}
        {group === "compose" && <ComposeSettings />}
```

- [ ] **Step 5: Build và test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm build 2>&1 | tail -1 && pnpm test 2>&1 | grep -E 'Tests|failed'
```
Expected: `✓ built`, `Tests  321 passed` (T0 + 24).

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add src/lib/ipc.ts src/windows/main src/i18n && git commit -q -m "feat(go-dich): nhóm Cài đặt Gõ dịch (bật, dịch sang, tự dán, quyền Trợ năng)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: Trang xem trước và kiểm năm ngôn ngữ

**Files:**
- Modify: `scripts/ui-preview/tauri-mock.ts`, `scripts/ui-preview/check-i18n.mjs`

Spec §8.1 (giao diện). IPC giả của `scripts/ui-preview`:
- Cài đặt › Gõ dịch: tham số `ax=0` (macOS chưa cấp quyền), `platform=windows` (không có mục tự dán).
- `compose.html`: `state=empty|typing|loading|done|same|failed|blocked|permission|reopen`, `paste=0`, `theme=dark`. Trừ `empty`, trang tự gõ chữ mẫu (theo ngôn ngữ giao diện) rồi để giao diện đi đúng đường thật: chờ 400 ms, xin dịch, nhận sự kiện; `permission` còn bấm Enter; `reopen` còn mở lại ô khi bản nháp đang có (như Esc rồi ⌃⌥G).

`check-i18n.mjs` thêm ba cảnh của nhóm Cài đặt và mười một cảnh của ô soạn (cửa sổ 560×420, nền trong suốt, chờ 1200 ms). Điều kiện "con trỏ nằm sẵn trong ô gõ" dùng `document.activeElement` vì `:focus` không khớp khi chính trang không được focus (Chrome không đầu). Ảnh PNG ở `target/ui-preview/ui-ja-zh-ko/` (không commit).

- [ ] **Step 1: IPC giả**

Trong `scripts/ui-preview/tauri-mock.ts`, tìm dòng (duy nhất):

```ts
//     overlay.html: live=alone|extends|final|provisional (mẫu dòng đang nói, xem `LIVE_SAMPLE`; cần session=running)
```

thay bằng:

```ts
//     overlay.html: live=alone|extends|final|provisional (mẫu dòng đang nói, xem `LIVE_SAMPLE`; cần session=running)
//   Gõ dịch (spec 2026-10-17-go-dich): Cài đặt › Gõ dịch: ax=0 (macOS chưa cấp quyền Trợ năng)
//     compose.html: state=empty|typing|loading|done|same|failed|blocked|permission|reopen (mặc định empty; trừ empty, trang tự gõ
//     chữ mẫu rồi để giao diện đi đúng đường thật: chờ 400 ms, xin dịch, nhận chữ dịch; permission còn bấm Enter; reopen còn mở
//     lại ô khi bản nháp đang có, như Esc rồi ⌃⌥G)  paste=0 (tắt tự dán)
```

Cùng file, tìm đoạn (duy nhất):

```ts
  Commands,
  LicenseView,
```

thay bằng:

```ts
  Commands,
  ComposeOutcome,
  ComposeView,
  LicenseView,
```

Cùng file, tìm dòng (duy nhất):

```ts
function overlayView() {
```

thay bằng:

```ts
// ---------------------------------------------------------------- ô soạn Gõ dịch (compose.html)

const composeState = param("state", "empty");
let composeId = 0;

// Chữ mẫu theo ngôn ngữ giao diện: [chữ gõ, bản dịch]. Ngôn ngữ đích "Tự động" là English, riêng giao diện English thì Tiếng Việt.
const COMPOSE_SAMPLE: Record<UiLang, [string, string]> = {
  vi: ["Mai mình gửi báo cáo nhé.\n\nCảm ơn cả nhóm!", "I'll send the report tomorrow.\n\nThanks, everyone!"],
  en: ["I'll send the report tomorrow.\n\nThanks, everyone!", "Mai mình gửi báo cáo nhé.\n\nCảm ơn cả nhóm!"],
  ja: ["明日レポートを送ります。\n\n皆さん、ありがとうございます！", "I'll send the report tomorrow.\n\nThanks, everyone!"],
  zh: ["我明天发报告。\n\n谢谢大家！", "I'll send the report tomorrow.\n\nThanks, everyone!"],
  ko: ["내일 보고서를 보낼게요.\n\n다들 고마워요!", "I'll send the report tomorrow.\n\nThanks, everyone!"],
};

function composeView(): ComposeView {
  return {
    uiLanguage: lang,
    theme: settings.theme,
    target: lang === "en" ? "vi" : "en",
    autoPaste: param("paste") !== "0",
    blocked: composeState === "blocked" ? "trialEnded" : null,
    platform,
  };
}

// Kết quả của một lần xin dịch theo `state=`, tới qua sự kiện như phía Rust (sau lệnh, không cùng lúc).
function composeAnswer(id: number) {
  const [, translation] = pick(COMPOSE_SAMPLE);
  if (composeState === "loading") return emit("compose://loading", { id });
  if (composeState === "typing") {
    return emit("compose://delta", { id, line: 0, text: translation.split("\n")[0]!.slice(0, 14), reset: false });
  }
  if (composeState !== "same" && composeState !== "failed") {
    translation.split("\n").forEach((text, line) => text && emit("compose://delta", { id, line, text, reset: false }));
  }
  const outcome: ComposeOutcome =
    composeState === "same"
      ? { kind: "sameLanguage" }
      : composeState === "failed"
        ? { kind: "failed", code: "composeFailed" }
        : { kind: "translated", text: translation };
  emit("compose://done", { id, outcome });
}

function overlayView() {
```

Cùng file, tìm dòng (duy nhất):

```ts
  get_app_info: () => info,
```

thay bằng:

```ts
  get_app_info: () => info,
  get_accessibility_trusted: () => param("ax") !== "0",
  open_accessibility_settings: () => null,
  get_compose_view: () => composeView(),
  compose_translate: () => {
    const id = ++composeId;
    setTimeout(() => composeAnswer(id), 60);
    return id;
  },
  compose_submit: () => (composeState === "permission" ? "needsPermission" : param("paste") === "0" ? "copied" : "pasted"),
  compose_close: () => null,
  compose_resize: () => null,
  compose_open_accessibility: () => null,
  compose_copy_only: () => null,
  compose_open_main: () => null,
```

Cùng file, tìm đoạn (duy nhất):

```ts
  if (location.pathname.endsWith("overlay.html")) {
    // Trạng thái và phụ đề tới thanh phụ đề qua sự kiện, như phía Rust.
```

thay bằng:

```ts
  if (location.pathname.endsWith("compose.html")) {
    emit("compose://open", composeView());
    const input = document.querySelector("textarea");
    if (input && composeState !== "empty") {
      // Gõ chữ mẫu như người dùng: đặt giá trị bằng setter gốc (React theo dõi giá trị) rồi bắn sự kiện `input`.
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(input, pick(COMPOSE_SAMPLE)[0]);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (composeState === "permission") {
        setTimeout(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })), 700);
      }
      if (composeState === "reopen") setTimeout(() => emit("compose://open", composeView()), 700);
    }
  }
  if (location.pathname.endsWith("overlay.html")) {
    // Trạng thái và phụ đề tới thanh phụ đề qua sự kiện, như phía Rust.
```

- [ ] **Step 2: Cảnh mới của `check-i18n.mjs`**

Trong `scripts/ui-preview/check-i18n.mjs`, tìm dòng (duy nhất):

```js
// lỗi). Ảnh PNG cho người kiểm xem ở target/ui-preview/ui-ja-zh-ko/ (không commit). Điều kiện nào sai
```

thay bằng:

```js
// lỗi). Gõ dịch (spec 2026-10-17-go-dich §1.2–§1.4): nhóm Cài đặt "Gõ dịch" (macOS có quyền, chưa có quyền; Windows không có mục
// tự dán), và ô soạn (compose.html, 560×420) ở từng trạng thái: trống, đang dịch, đang nạp model, đã dịch, đã là ngôn ngữ đích,
// lỗi, bị chặn vì bản quyền, hộp quyền Trợ năng, chỉ chép, giao diện tối. Ảnh PNG cho người kiểm xem ở
// target/ui-preview/ui-ja-zh-ko/ (không commit). Điều kiện nào sai
```

Cùng file, tìm dòng (duy nhất):

```js
  ["settings-privacy-off", "screen=settings&group=privacy&reports=0"],
```

thay bằng:

```js
  ["settings-privacy-off", "screen=settings&group=privacy&reports=0"],
  // Gõ dịch (spec 2026-10-17-go-dich §1.4): macOS đã cấp quyền Trợ năng, chưa cấp (ax=0); Windows không có mục tự dán.
  ["settings-compose", "screen=settings&group=compose"],
  ["settings-compose-noax", "screen=settings&group=compose&ax=0"],
  ["settings-compose-windows", "screen=settings&group=compose&platform=windows"],
```

Cùng file, tìm dòng (duy nhất):

```js
const OVERLAYS = [
```

thay bằng:

```js
// Ô soạn Gõ dịch (compose.html): [tên, tham số URL, điều kiện riêng]. Trang tự gõ chữ mẫu (trừ `empty`) rồi chờ dịch như thật,
// nên chờ thêm trước khi kiểm.
const has = (selector, what) => [`!!document.querySelector(${JSON.stringify(selector)})`, what];
const COMPOSES = [
  [
    "compose-empty",
    "state=empty",
    // `:focus` không khớp khi chính trang không được focus (Chrome không đầu); `activeElement` thì vẫn đúng.
    [
      [`document.activeElement?.tagName === "TEXTAREA"`, "con trỏ nằm sẵn trong ô gõ"],
      has("footer", "có gợi ý phím"),
      // Hộp gợi ý chữ của macOS nuốt phím Enter đầu tiên khi còn sửa chính tả (spike S2): ô gõ phải tắt.
      [`(() => { const t = document.querySelector("textarea"); return t?.spellcheck === false && t?.getAttribute("autocorrect") === "off"; })()`, "ô gõ tắt sửa chính tả và tự sửa chữ"],
    ],
  ],
  [
    "compose-reopen",
    "state=reopen",
    // Esc rồi ⌃⌥G: bản nháp còn đó phải được chọn sẵn để chữ mới gõ đè (đo ở Teams 2026-10-18: không chọn thì chữ mới chèn trước
    // bản nháp, mở lại ba lần ra 62, 93, 124 ký tự). WebKit đặt lại con trỏ về đầu ô khi trang nhận focus sau lệnh chọn, nên giả
    // lập đúng thế rồi bắn `focus`; đã bấm chuột hay bấm phím trong bản nháp (người dùng tự đặt con trỏ) thì không chọn lại.
    [
      [
        `(() => { const t = document.querySelector("textarea"); t.setSelectionRange(0, 0); window.dispatchEvent(new Event("focus")); return t.value.length > 0 && t.selectionStart === 0 && t.selectionEnd === t.value.length; })()`,
        "mở lại khi còn bản nháp: bản nháp được chọn sẵn kể cả khi trang nhận focus sau đó",
      ],
      [
        `(() => { const t = document.querySelector("textarea"); t.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); t.setSelectionRange(2, 2); window.dispatchEvent(new Event("focus")); return t.selectionStart === 2 && t.selectionEnd === 2; })()`,
        "đã bấm phím di chuyển trong bản nháp thì không chọn lại",
      ],
    ],
  ],
  ["compose-typing", "state=typing", [has(".translation.stale", "bản dịch đang về hiện mờ")]],
  ["compose-loading", "state=loading", [has(".status:not(:empty)", "dòng trạng thái báo đang nạp model")]],
  ["compose-done", "state=done", [has(".translation:not(.stale)", "bản dịch đủ hiện rõ")]],
  ["compose-same", "state=same", [has(".status:not(:empty)", "báo đã là ngôn ngữ đích")]],
  ["compose-failed", "state=failed", [has(".box.error", "có hộp lỗi")]],
  ["compose-blocked", "state=blocked", [has(".box.error button", "hộp lỗi có nút Nâng cấp")]],
  [
    "compose-permission",
    "state=permission",
    [[`document.querySelectorAll(".box:not(.error) button").length === 2`, "hộp quyền có hai nút"]],
  ],
  ["compose-copy", "state=done&paste=0", [[`document.querySelector("footer")?.textContent.includes("⌘V") === true`, "gợi ý ghi ⌘V"]]],
  ["compose-dark", "state=done&theme=dark", [[`document.documentElement.dataset.theme === "dark"`, "giao diện tối"]]],
];

const OVERLAYS = [
```

Cùng file, tìm dòng (duy nhất):

```js
    for (const [name, query] of OVERLAYS) {
```

thay bằng:

```js
    for (const [name, query, extras] of COMPOSES) {
      if (!wanted(name)) continue;
      const url = `${BASE}/compose.html?${query}&lang=${lang}`;
      await visit(browser, lang, { name: "560x420", width: 560, height: 420 }, name, url, { prepare: "1", wait: 1200, transparent: true }, extras);
    }
    for (const [name, query] of OVERLAYS) {
```

- [ ] **Step 3: Kiểu và test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec tsc --noEmit && echo TSC-OK && pnpm test 2>&1 | grep -E 'Tests|failed'
```
Expected: `TSC-OK`, `Tests  321 passed`.

- [ ] **Step 4: Chạy trang xem trước và kiểm năm ngôn ngữ**

Chạy Vite của trang xem trước ở cổng 1431 (chạy nền; nhớ tắt ở Step 6):

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431
```

Khi Vite sẵn sàng:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && ONLY=settings-compose,compose,settings-hotkeys node scripts/ui-preview/check-i18n.mjs vi en ja zh ko 2>&1 | tail -15
```
Expected: không có dòng lỗi, thoát mã 0. Điều kiện nào sai thì sửa mã cho khớp bản nháp (`git show 9da931b:<đường dẫn>`), không nới điều kiện.

- [ ] **Step 5: Xem ảnh**

Mở và xem bằng mắt (công cụ đọc ảnh) ít nhất: `target/ui-preview/ui-ja-zh-ko/` các ảnh `compose-done`, `compose-permission`, `compose-blocked`, `compose-dark` ở `vi` và `ja`; `settings-compose` và `settings-compose-noax` ở `vi`. Kiểm: chữ không tràn, khung bo góc đủ, bản dịch rõ hay mờ đúng trạng thái, nút đúng chỗ, dòng "Mở Gõ dịch" ở nhóm Phím tắt. Ghi những gì thấy vào báo cáo của task.

- [ ] **Step 6: Tắt Vite, commit**

Tắt tiến trình Vite đã chạy ở Step 4 (dừng lệnh nền đó), rồi kiểm cổng đã đóng:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && (lsof -nP -iTCP:1431 -sTCP:LISTEN || echo CONG-1431-DA-DONG) && git branch --show-current && git add scripts/ui-preview/tauri-mock.ts scripts/ui-preview/check-i18n.mjs && git commit -q -m "test(go-dich): trang xem trước của ô soạn và nhóm Cài đặt, kiểm năm ngôn ngữ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```
Expected: `CONG-1431-DA-DONG`, rồi commit.

---

### Task 6: Kiểm toàn bộ

**Files:** không sửa file (trừ khi rustfmt đổi chỗ xuống dòng).

- [ ] **Step 1: rustfmt, clippy Mac, clippy Windows**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo fmt --all -- --check && echo FMT-OK && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | grep -E '^(error|warning)|Finished' && sh scripts/check-windows.sh --locked 2>&1 | grep -E '^(error|warning)|Finished'
```
Expected: `FMT-OK`, hai lần `Finished`, không `error`.

- [ ] **Step 2: Đủ test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && cargo test --locked -p meeting-translator --lib 2>&1 | grep 'test result' && pnpm build 2>&1 | tail -1 && pnpm test 2>&1 | grep Tests && git status --short
```
Expected: `passed` = **N0 + 46** (bản 2026-10-17: 689), `✓ built`, `Tests  321 passed` (**T0 + 24**), không file nào chưa commit. Xong kế hoạch 04; sang kế hoạch 05.
