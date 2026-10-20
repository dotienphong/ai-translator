# Phím tắt trong menu khay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu khay hiện phím tắt bên phải các mục Bắt đầu/Dừng dịch, Hiện/Ẩn phụ đề, Khóa/Mở khóa phụ đề, và có thêm mục "Mở Gõ dịch" (chỉ khi bật Gõ dịch).

**Architecture:** Dùng `accelerator` của `MenuItem` (native). Nội dung menu và quyết định "mục nào kèm phím nào" là hàm thuần ở `tray_menu.rs` (có test); `tray.rs` chỉ gắn vào `Menu` của Tauri và thử lại không kèm phím khi `muda` từ chối. Gõ dịch mở từ khay trên Windows chạy chế độ chỉ chép bằng cờ `copy_only` trong `compose/mod.rs`. Thiết kế: `docs/superpowers/specs/2026-10-20-tray-menu-shortcuts-design.md`.

**Tech Stack:** Rust, Tauri 2.12 (`tauri::menu`, `muda` 0.20), test bằng `MockRuntime`.

**Ràng buộc đã đo (2026-10-20):**
- `MenuItem::with_id(.., Some("Ctrl+Alt+T"))` chạy được trên luồng test (chỉ đọc chuỗi), kể cả phím hiếm.
- `muda::Menu::new` trên macOS chỉ chạy trên luồng chính, nên test đơn vị **không** dựng được `Menu`; phần `append` chỉ thử tay.
- `muda` báo lỗi khi `menu.append` một mục có phím không hỗ trợ, **trước** khi thêm mục (macOS `create_ns`, Windows `to_accel`), nên thử lại không kèm phím là an toàn. Windows không nhận phím Win (`Super`) làm accelerator.
- Mọi lệnh cargo chạy từ `src-tauri/` và gắn `cd <đường dẫn tuyệt đối> &&` vào đầu từng lệnh (Bash reset thư mục mỗi lệnh).
- Chưa commit (chủ dự án chưa cho phép); các bước "Commit" của mẫu bị bỏ.

---

### Task 1: Chuỗi `tray_compose` ở 5 ngôn ngữ

**Files:**
- Modify: `src-tauri/src/i18n.rs` (struct `Strings`, 5 hằng ngôn ngữ, `Strings::all`)

- [ ] **Step 1: Thêm trường vào struct, 5 hằng và `all()`**

Trong `struct Strings`, ngay sau `tray_unlock_overlay`:

```rust
    pub tray_compose: &'static str,
```

Trong từng hằng, ngay sau dòng `tray_unlock_overlay: ...,`:

| Hằng | Dòng thêm |
|---|---|
| `EN` | `tray_compose: "Open Type & Translate",` |
| `VI` | `tray_compose: "Mở Gõ dịch",` |
| `JA` | `tray_compose: "入力翻訳を開く",` |
| `ZH` | `tray_compose: "打开输入翻译",` |
| `KO` | `tray_compose: "입력 번역 열기",` |

Trong `Strings::all`, thêm `tray_compose,` sau `tray_unlock_overlay,` ở phần destructure và `("tray_compose", tray_compose),` sau `("tray_unlock_overlay", tray_unlock_overlay),` ở `vec!`.

- [ ] **Step 2: Chạy test i18n**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/src-tauri && cargo test --lib i18n::`
Expected: PASS (thiếu trường ở ngôn ngữ nào thì không biên dịch được; test sẵn có kiểm placeholder và chữ kana/hangul/hán).

---

### Task 2: `tray_menu.rs`: mục Gõ dịch, ánh xạ mục → phím

**Files:**
- Modify: `src-tauri/src/tray_menu.rs`

- [ ] **Step 1: Viết test trước (sẽ chưa biên dịch)**

Trong `mod tests`, thêm hai test và sửa các test cũ:

```rust
    #[test]
    fn compose_item_follows_the_setting() {
        let model = |compose_enabled| TrayModel {
            running: false,
            overlay_visible: true,
            locked: false,
            hotkeys_failed: false,
            update_ready: false,
            compose_enabled,
        };
        let on = lines(&menu_lines(&i18n::VI, model(true)));
        assert_eq!(
            on[..4],
            [
                ("session", "Bắt đầu dịch"),
                ("overlay-visible", "Ẩn phụ đề"),
                ("overlay-lock", "Khóa phụ đề (click xuyên qua)"),
                ("compose", "Mở Gõ dịch"),
            ]
        );
        let off = lines(&menu_lines(&i18n::VI, model(false)));
        assert!(!off.iter().any(|(id, _)| *id == "compose"), "tắt Gõ dịch thì không có mục");
    }

    #[test]
    fn shortcuts_follow_the_bindings_and_skip_what_failed() {
        use crate::hotkeys::HotkeyAction;
        let mut hotkeys = crate::settings::Settings::default().hotkeys;
        hotkeys.set(HotkeyAction::ToggleOverlay, "Ctrl+Alt+J".into());
        let key = |item, failed: &[HotkeyAction]| accelerator(item, &hotkeys, failed);
        assert_eq!(key(TrayItem::Session, &[]), Some("Ctrl+Alt+T"));
        assert_eq!(key(TrayItem::Overlay, &[]), Some("Ctrl+Alt+J"), "phím người dùng đã đổi");
        assert_eq!(key(TrayItem::Lock, &[]), Some("Ctrl+Alt+L"));
        assert_eq!(key(TrayItem::Compose, &[]), Some("Ctrl+Alt+G"));
        assert_eq!(
            key(TrayItem::Lock, &[HotkeyAction::ToggleLock]),
            None,
            "phím không đăng ký được thì không hiện"
        );
        assert_eq!(key(TrayItem::Session, &[HotkeyAction::ToggleLock]), Some("Ctrl+Alt+T"));
        for item in [
            TrayItem::HotkeyWarning,
            TrayItem::OpenMain,
            TrayItem::CheckForUpdates,
            TrayItem::RestartToUpdate,
            TrayItem::Quit,
        ] {
            assert_eq!(key(item, &[]), None, "{item:?}");
        }
    }
```

Sửa các test cũ cho khớp:
- Ba chỗ dựng `TrayModel { .. }` (`idle_menu_in_vietnamese`, `labels_follow_state_in_english`, `restart_to_update_only_when_idle`): thêm `compose_enabled: false,`. Kết quả mong đợi của chúng giữ nguyên.
- `all_lists_every_item_in_menu_order`: thêm nhánh `TrayItem::Compose => 4,`, đổi `OpenMain => 5`, `CheckForUpdates => 6`, `RestartToUpdate => 7`, `Quit => 8`, và `assert_eq!(TrayItem::ALL.len(), 9);`.

- [ ] **Step 2: Chạy để thấy lỗi biên dịch**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/src-tauri && cargo test --lib tray_menu:: 2>&1 | tail -20`
Expected: lỗi `no variant ... Compose`, `cannot find function accelerator`, `no field compose_enabled`.

- [ ] **Step 3: Cài đặt**

Đầu file, thêm import:

```rust
use crate::hotkeys::HotkeyAction;
use crate::i18n::Strings;
use crate::settings::Hotkeys;
```
(bỏ dòng `use crate::i18n::Strings;` cũ). Trong `enum TrayItem`, thêm `Compose,` sau `Lock,`. Trong `impl TrayItem`:

```rust
    pub const ALL: [TrayItem; 9] = [
        Self::HotkeyWarning,
        Self::Session,
        Self::Overlay,
        Self::Lock,
        Self::Compose,
        Self::OpenMain,
        Self::CheckForUpdates,
        Self::RestartToUpdate,
        Self::Quit,
    ];
```
`id()`: thêm `Self::Compose => "compose",` sau `Lock`. Thêm vào `impl TrayItem`:

```rust
    /// Việc có phím tắt toàn cục ứng với mục này; mục khác không có phím.
    pub fn hotkey_action(self) -> Option<HotkeyAction> {
        match self {
            Self::Session => Some(HotkeyAction::ToggleSession),
            Self::Overlay => Some(HotkeyAction::ToggleOverlay),
            Self::Lock => Some(HotkeyAction::ToggleLock),
            Self::Compose => Some(HotkeyAction::Compose),
            Self::HotkeyWarning | Self::OpenMain | Self::CheckForUpdates | Self::RestartToUpdate | Self::Quit => None,
        }
    }
```
Thêm hàm tự do (sau `impl TrayItem`):

```rust
/// Phím tắt hiện bên phải mục (spec 2026-10-20 §2): phím người dùng đang đặt. Không hiện khi mục không có phím, hay khi việc đó
/// không đăng ký được (`failed`): phím đó không chạy, hiện ra chỉ gây hiểu nhầm.
pub fn accelerator<'a>(item: TrayItem, hotkeys: &'a Hotkeys, failed: &[HotkeyAction]) -> Option<&'a str> {
    let action = item.hotkey_action()?;
    (!failed.contains(&action)).then(|| hotkeys.get(action))
}
```
`TrayModel`: thêm

```rust
    /// Gõ dịch đang bật (`compose.enabled`): phím của nó chỉ đăng ký khi bật, nên mục chỉ hiện khi bật.
    pub compose_enabled: bool,
```
`menu_lines`: sau `lines.push(Some((TrayItem::Lock, lock)));` thêm

```rust
    if model.compose_enabled {
        lines.push(Some((TrayItem::Compose, strings.tray_compose)));
    }
```

- [ ] **Step 4: Chạy test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/src-tauri && cargo test --lib tray_menu::`
Expected: PASS (riêng `tray.rs` chưa biên dịch được tới Task 3 nếu `TrayModel` thiếu trường; làm Task 3 ngay sau rồi mới chạy cả crate).

---

### Task 3: `tray.rs`: gắn phím vào menu, mục Gõ dịch

**Files:**
- Modify: `src-tauri/src/tray.rs`

- [ ] **Step 1: Viết test đọc phím (cuối file)**

```rust
#[cfg(test)]
mod tests {
    use tauri::menu::MenuItem;

    use crate::hotkeys::{self, HotkeyAction};
    use crate::settings::Settings;

    /// Phím app lưu (dạng chuẩn của `hotkeys::parse`) đều là chuỗi mà `muda` đọc được, nên `MenuItem` nhận làm accelerator.
    /// Chỉ kiểm bước đọc chuỗi: `Menu` của macOS chỉ dựng được trên luồng chính, test không thêm mục vào menu được.
    #[test]
    fn stored_hotkeys_are_readable_as_menu_accelerators() {
        let app = crate::test_support::mock_app();
        let defaults = Settings::default().hotkeys;
        let mut keys: Vec<String> = HotkeyAction::ALL.map(|action| defaults.get(action).to_string()).to_vec();
        for typed in [
            "control+alt+KeyT",
            "Ctrl+Alt+Digit1",
            "Ctrl+Alt+Backquote",
            "Ctrl+Shift+Alt+F10",
            "Super+Alt+Space",
            "Ctrl+Alt+ArrowUp",
        ] {
            keys.push(hotkeys::parse(typed).unwrap().1);
        }
        for key in keys {
            MenuItem::with_id(app.handle(), "x", "X", true, Some(key.as_str()))
                .unwrap_or_else(|e| panic!("{key}: {e}"));
        }
    }
}
```

- [ ] **Step 2: Cài đặt**

Sửa import:

```rust
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Runtime};

use crate::hotkeys::HotkeyAction;
use crate::i18n;
use crate::state::{AppState, SessionStatus};
use crate::tray_menu::{TrayItem, TrayModel, accelerator, menu_lines};
use crate::{actions, compose, events, updater, window};
```
(`Strings` không còn dùng ở đây.) Thay `model` và `build_menu` bằng:

```rust
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<(Menu<R>, String)> {
    let state = app.state::<AppState>();
    let (settings, status) = (state.settings(), state.status());
    let model = TrayModel {
        running: matches!(status.session, SessionStatus::Starting | SessionStatus::Running),
        overlay_visible: status.overlay_visible,
        locked: settings.overlay.locked,
        hotkeys_failed: !status.hotkey_failures.is_empty(),
        update_ready: status.update_ready.is_some(),
        compose_enabled: settings.compose.enabled,
    };
    let strings = i18n::strings(settings.ui_language);
    let menu = Menu::new(app)?;
    for line in menu_lines(strings, model) {
        match line {
            Some((item, text)) => {
                let key = accelerator(item, &settings.hotkeys, &status.hotkey_failures);
                append_item(app, &menu, item, text, key)?;
            }
            None => menu.append(&PredefinedMenuItem::separator(app)?)?,
        }
    }
    Ok((menu, strings.tooltip(&app.package_info().name, model.running)))
}

/// Thêm một mục vào menu, kèm phím tắt nếu có (spec 2026-10-20 §3). `muda` không nhận vài phím mà plugin phím tắt nhận (phím
/// numpad, media trên macOS; phím Win trên Windows) và báo lỗi lúc thêm mục, trước khi mục vào menu: thử lại không kèm phím,
/// để menu khay không bao giờ thiếu mục.
fn append_item<R: Runtime>(
    app: &AppHandle<R>,
    menu: &Menu<R>,
    item: TrayItem,
    text: &str,
    key: Option<&str>,
) -> tauri::Result<()> {
    if let Some(key) = key {
        match MenuItem::with_id(app, item.id(), text, true, Some(key)).and_then(|with_key| menu.append(&with_key)) {
            Ok(()) => return Ok(()),
            Err(e) => log::warn!("không gắn được phím {key} vào mục {} của menu khay: {e}", item.id()),
        }
    }
    menu.append(&MenuItem::with_id(app, item.id(), text, true, None::<&str>)?)
}
```
Trong `on_menu_event`, thêm sau nhánh `Lock`:

```rust
        Some(TrayItem::Compose) => compose::toggle_from_tray(app),
```

- [ ] **Step 3: Chạy test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/src-tauri && cargo test --lib tray`
Expected: PASS (cần Task 5 đã có `compose::toggle_from_tray`; nếu chưa, làm Task 5 trước rồi chạy).

---

### Task 4: `actions.rs`: dựng lại menu khi phím hay Gõ dịch đổi

**Files:**
- Modify: `src-tauri/src/actions.rs`

- [ ] **Step 1: Viết test (module `tests` ở cuối file; nếu đã có thì thêm vào)**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// Menu khay hiện chữ theo ngôn ngữ, trạng thái khóa, phím tắt và Gõ dịch (spec 2026-10-20 §2): đổi một trong số đó thì phải dựng lại.
    #[test]
    fn the_tray_menu_is_rebuilt_only_when_something_in_it_changes() {
        let base = Settings::default();
        assert!(!tray_needs_refresh(&base, &base.clone()));
        let mut other = base.clone();
        other.ui_language = if base.ui_language == crate::settings::UiLanguage::Vi {
            crate::settings::UiLanguage::En
        } else {
            crate::settings::UiLanguage::Vi
        };
        assert!(tray_needs_refresh(&base, &other), "ngôn ngữ");
        let mut other = base.clone();
        other.overlay.locked = !base.overlay.locked;
        assert!(tray_needs_refresh(&base, &other), "khóa");
        let mut other = base.clone();
        other.hotkeys.set(HotkeyAction::ToggleSession, "Ctrl+Alt+J".into());
        assert!(tray_needs_refresh(&base, &other), "phím tắt");
        let mut other = base.clone();
        other.compose.enabled = !base.compose.enabled;
        assert!(tray_needs_refresh(&base, &other), "Gõ dịch bật/tắt");
        let mut other = base.clone();
        other.save_history = !base.save_history;
        assert!(!tray_needs_refresh(&base, &other), "cài đặt không liên quan");
    }
}
```

- [ ] **Step 2: Cài đặt**

Thêm hàm (trước `commit_settings`):

```rust
/// Menu khay cần dựng lại không: chữ theo ngôn ngữ, mục khóa, phím tắt bên cạnh mục và mục Gõ dịch đều lấy từ cài đặt.
fn tray_needs_refresh(previous: &Settings, next: &Settings) -> bool {
    previous.ui_language != next.ui_language
        || previous.overlay.locked != next.overlay.locked
        || previous.hotkeys != next.hotkeys
        || previous.compose.enabled != next.compose.enabled
}
```
Trong `commit_settings`, thay

```rust
    if previous.ui_language != next.ui_language || previous.overlay.locked != next.overlay.locked {
        tray::refresh(app);
    }
```
bằng

```rust
    if tray_needs_refresh(&previous, &next) {
        tray::refresh(app);
    }
```

- [ ] **Step 3: Chạy test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/src-tauri && cargo test --lib actions::`
Expected: PASS.

---

### Task 5: `compose/mod.rs`: mở từ khay, chế độ chỉ chép trên Windows

**Files:**
- Modify: `src-tauri/src/compose/mod.rs` (`Inner`, `view`, `toggle`, `open`, `submit`)
- Test: `src-tauri/src/compose/tests.rs`

- [ ] **Step 1: Viết test**

Thêm vào `compose/tests.rs` (sau `the_hotkey_opens_with_the_view_and_closes_again`):

```rust
/// Spec 2026-10-20 §4: mở từ menu khay trên Windows không biết người dùng đang gõ ở cửa sổ nào (cửa sổ ở phía trước là của khay), nên
/// chỉ chép, không gửi phím dán; mở bằng phím tắt thì tự dán như thường.
#[test]
fn opened_from_the_tray_menu_it_only_copies_when_the_target_is_unknown() {
    let app = mock_app();
    let compose = window(&app, "compose");
    let opened = heard(&compose, COMPOSE_OPEN);
    let done = heard(&compose, COMPOSE_DONE);
    super::open_with(app.handle(), true);
    wait_until("đã gửi phần cài đặt", || opened.lock().unwrap().len() == 1);
    assert_eq!(opened.lock().unwrap()[0]["autoPaste"], false);
    let id = translate(&app, "Mai mình gửi");
    outcome_of(&done, id);
    assert_eq!(submit(&app, id).unwrap(), "copied");
    assert_eq!(compose_calls(&app), ["show".to_string(), format!("clipboard {FAKE}"), "hide".into()]);
    super::open_with(app.handle(), false);
    wait_until("đã gửi phần cài đặt lần hai", || opened.lock().unwrap().len() == 2);
    assert_eq!(opened.lock().unwrap()[1]["autoPaste"], true);
    let id = translate(&app, "Mai mình gửi");
    outcome_of(&done, id);
    assert_eq!(submit(&app, id).unwrap(), "pasted");
    assert_eq!(compose_calls(&app).last().map(String::as_str), Some("paste"));
}

/// Spec 2026-10-20 §2, §4: mục "Mở Gõ dịch" của menu khay mở rồi đóng ô soạn như phím tắt; chỉ Windows vào chế độ chỉ chép.
#[test]
fn the_tray_menu_item_toggles_like_the_hotkey() {
    let app = mock_app();
    let opened = heard(&window(&app, "compose"), COMPOSE_OPEN);
    super::toggle_from_tray(app.handle());
    wait_until("đã gửi phần cài đặt", || opened.lock().unwrap().len() == 1);
    assert_eq!(opened.lock().unwrap()[0]["autoPaste"], !cfg!(target_os = "windows"));
    super::toggle_from_tray(app.handle());
    assert_eq!(compose_calls(&app), ["show", "hide"]);
}
```

- [ ] **Step 2: Chạy để thấy lỗi biên dịch**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/src-tauri && cargo test --lib compose:: 2>&1 | tail -15`
Expected: lỗi `cannot find function open_with`, `toggle_from_tray`.

- [ ] **Step 3: Cài đặt**

`Inner`: thêm trường

```rust
    /// Lần mở này chỉ chép, không tự dán: mở từ menu khay trên Windows (spec 2026-10-20 §4). Đặt lại mỗi lần mở.
    copy_only: bool,
```
Thêm hàm (cạnh `view`):

```rust
/// Enter tự dán không: Windows luôn, macOS theo `compose.autoPaste`; lần mở chỉ chép (`Inner::copy_only`) thì không.
fn auto_paste<R: Runtime>(app: &AppHandle<R>) -> bool {
    let copy_only = app.try_state::<Compose>().is_some_and(|compose| compose.lock().copy_only);
    !copy_only && (!cfg!(target_os = "macos") || app.state::<AppState>().settings().compose.auto_paste)
}
```
`view()`: thay `auto_paste: !cfg!(target_os = "macos") || settings.compose.auto_paste,` bằng `auto_paste: auto_paste(app),`.

`submit()`: thay `let auto = !cfg!(target_os = "macos") || app.state::<AppState>().settings().compose.auto_paste;` bằng `let auto = auto_paste(app);`.

`toggle`/`open`:

```rust
/// Phím tắt Gõ dịch (spec §1.3): ô đang mở thì đóng (như Esc), đang đóng thì mở.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    toggle_with(app, false);
}

/// Mục "Mở Gõ dịch" của menu khay (spec 2026-10-20 §4). Windows: khi menu khay đóng, cửa sổ ở phía trước là của khay chứ không phải
/// app người dùng đang gõ, nên `Native::show` sẽ nhớ nhầm đích dán; lần mở này chỉ chép, người dùng tự dán. macOS: bấm icon menu
/// bar không đổi app ở phía trước, nên làm như phím tắt.
pub fn toggle_from_tray<R: Runtime>(app: &AppHandle<R>) {
    toggle_with(app, cfg!(target_os = "windows"));
}

fn toggle_with<R: Runtime>(app: &AppHandle<R>, copy_only: bool) {
    let Some(compose) = app.try_state::<Compose>() else {
        return;
    };
    if compose.native.visible() {
        close(app);
    } else {
        open_with(app, copy_only);
    }
}

pub fn open<R: Runtime>(app: &AppHandle<R>) {
    open_with(app, false);
}
```
Đổi thân `open` cũ thành `fn open_with<R: Runtime>(app: &AppHandle<R>, copy_only: bool)`, thêm dòng đầu sau `let Some(compose) = ... else { return };`:

```rust
    compose.lock().copy_only = copy_only;
```
(đặt **trước** `let view = view(app);`, vì `view()` đọc cờ). Giữ nguyên doc của `open` cho `open_with`.

- [ ] **Step 4: Chạy test**

Run: `cd /Users/dtphong/Desktop/software_business/ai-translator/src-tauri && cargo test --lib compose::`
Expected: PASS, kể cả các test Gõ dịch cũ.

---

### Task 6: Cập nhật spec, kiểm toàn bộ

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-go-dich-design.md` (§11), `docs/superpowers/specs/2026-10-20-tray-menu-shortcuts-design.md` (§3, §6)

- [ ] **Step 1: Sửa §11 của spec Gõ dịch**

Đổi dòng `- Mục Gõ dịch trong menu khay; dòng gợi ý phím tắt trên màn hình chính (có thể làm sau nếu người dùng không tìm ra tính năng).` thành `- Dòng gợi ý phím tắt trên màn hình chính (có thể làm sau nếu người dùng không tìm ra tính năng). Mục Gõ dịch trong menu khay đã làm: spec 2026-10-20-tray-menu-shortcuts-design.`

- [ ] **Step 2: Sửa spec mới cho khớp số đo**

Ở §3 thêm: trên Windows `muda` không nhận phím Win (`Super`) làm accelerator, nên phím kiểu `Win+…` không hiện ở menu (mục vẫn có, chỉ không kèm phím). Ở §6 thay hai gạch đầu về "dựng menu bằng runtime giả" bằng: test đọc chuỗi phím (`MenuItem::with_id`, chạy được trên luồng test) và ghi rõ phần `append` + thử lại không kèm phím chỉ thử tay, vì `Menu` của macOS chỉ dựng được trên luồng chính.

- [ ] **Step 3: Kiểm toàn bộ**

Run (lần lượt):
- `cd /Users/dtphong/Desktop/software_business/ai-translator/src-tauri && cargo fmt --check`
- `cd /Users/dtphong/Desktop/software_business/ai-translator/src-tauri && cargo clippy --all-targets -- -D warnings`
- `cd /Users/dtphong/Desktop/software_business/ai-translator/src-tauri && cargo test`
Expected: không lỗi, mọi test PASS (trước thay đổi: 747 test trong `--lib`).

---

### Task 7: Thử tay trên macOS

- [ ] **Step 1:** Báo trước cho chủ dự án (họ đang dùng máy), chạy bản dev theo `scripts/` của repo, mở menu khay, chụp ảnh: thấy `⌃⌥T`, `⌃⌥H`, `⌃⌥L`, `⌃⌥G` bên phải 4 mục; "Mở cửa sổ chính", "Kiểm tra cập nhật…", "Thoát" không có phím.
- [ ] **Step 2:** Đổi phím Gõ dịch ở Cài đặt › Phím tắt → menu đổi theo. Tắt Gõ dịch → mục biến mất. Đặt một phím `muda` không hỗ trợ (ví dụ `Ctrl+Alt+IntlBackslash` nếu app nhận) → mục vẫn hiện, không kèm phím, log có cảnh báo.
- [ ] **Step 3:** TextEdit ở phía trước → bấm "Mở Gõ dịch" ở menu khay → gõ → Enter → bản dịch được dán vào TextEdit.
- [ ] **Step 4:** Tắt tiến trình dev đã mở (app dev, Vite) và kiểm không còn tiến trình sót.
