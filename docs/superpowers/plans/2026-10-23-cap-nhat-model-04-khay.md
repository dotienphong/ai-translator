# Cập nhật model, kế hoạch 04: dấu chấm trên khay và mục menu (app 0.2.6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** icon khay có dấu chấm khi có bản app mới đã tải xong hay gói model đang dùng có bản mới; menu khay có mục "Có bản cập nhật gói model" mở cửa sổ chính ở Home.

**Architecture:** luật hiện mục và dấu chấm nằm ở `tray_menu.rs` (thuần, có test). Hàm vẽ dấu chấm lên ảnh RGBA nằm ở module mới `tray_badge.rs` (thuần, có test theo điểm ảnh). `tray.rs` nối hai phần: đọc cờ model từ `ModelService::tray_update`, đặt lại icon chỉ khi trạng thái dấu chấm đổi. `ModelService::changed()` gọi `tray::refresh` để cờ model tới khay.

**Tech Stack:** Rust, Tauri 2.12 (`tauri::image::Image`, `TrayIcon::set_icon`, `set_icon_as_template`).

**Spec:** `docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md` mục 6. Độc lập với kế hoạch 01–03.

**Quy ước:** `W=/Users/dtphong/Desktop/software_business/meeting-translator-work/cap-nhat-model`. Mọi lệnh bắt đầu bằng `cd $W &&` (shell trở về thư mục chính sau mỗi lệnh). Không push, không đẩy tag.

---

## Cấu trúc file

| File | Việc |
|---|---|
| Tạo `src-tauri/src/tray_badge.rs` | `BadgeStyle`, `with_badge`: vẽ dấu chấm lên ảnh RGBA |
| Sửa `src-tauri/src/lib.rs` | khai báo `pub mod tray_badge;` |
| Sửa `src-tauri/src/tray_menu.rs` | `TrayItem::ModelUpdate`, `TrayModel.model_update`, `has_badge` |
| Sửa `src-tauri/src/i18n.rs` | chuỗi `tray_model_update` cho năm ngôn ngữ |
| Sửa `src-tauri/src/models/service.rs` | `tray_update`, `changed()` gọi `tray::refresh` |
| Sửa `src-tauri/src/actions.rs` | `tray_needs_refresh` xét thêm `model_tier` |
| Sửa `src-tauri/src/tray.rs` | icon có dấu chấm, `TrayBadge`, mục menu mới |
| Sửa `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | §4.5 số chuỗi Rust, §6.7 và §6.11 luật dấu chấm |

---

### Task 1: Hàm vẽ dấu chấm

**Files:**
- Create: `src-tauri/src/tray_badge.rs`
- Modify: `src-tauri/src/lib.rs` (sau dòng `pub mod tray;`)

- [ ] **Step 1: Viết module kèm test (test trước, hàm để `todo!()`)**

Tạo `src-tauri/src/tray_badge.rs`:

```rust
//! Dấu chấm trên icon khay khi có bản cập nhật (spec 2026-10-23-cap-nhat-model-tu-dong §6.2). Vẽ lên ảnh RGBA của icon gốc
//! lúc chạy, không thêm file ảnh.

/// Kiểu dấu chấm theo loại icon.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BadgeStyle {
    /// macOS: icon template đơn sắc (hệ thống chỉ dùng kênh alpha). Chấm đặc, khoét viền trong suốt quanh chấm để tách khỏi
    /// hình khung phụ đề; hệ thống tự tô màu theo menu bar sáng, tối.
    Template,
    /// Windows: icon màu của app. Chấm đỏ có viền trắng.
    Color,
}

const INK: [u8; 4] = [0, 0, 0, 0xFF];
const CLEAR: [u8; 4] = [0, 0, 0, 0];
const RED: [u8; 4] = [0xE5, 0x48, 0x4D, 0xFF];
const WHITE: [u8; 4] = [0xFF, 0xFF, 0xFF, 0xFF];

/// Bán kính chấm và độ dày viền theo cạnh ngắn của icon. Template 44 px: chấm bán kính 5, viền 2. Color: đường kính khoảng
/// 35% cạnh.
fn geometry(style: BadgeStyle, size: f32) -> (f32, f32) {
    match style {
        BadgeStyle::Template => (size * 5.0 / 44.0, size * 2.0 / 44.0),
        BadgeStyle::Color => (size * 0.175, size * 0.06),
    }
}

/// Ảnh RGBA mới có dấu chấm ở góc trên phải (chấm và viền nằm gọn trong ảnh). `rgba` dài đúng `width * height * 4`.
pub fn with_badge(rgba: &[u8], width: u32, height: u32, style: BadgeStyle) -> Vec<u8> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn px(img: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
        let i = ((y * width + x) * 4) as usize;
        img[i..i + 4].try_into().unwrap()
    }

    /// Template 44 px: tâm chấm ở (37, 7), bán kính 5, viền tới 7.
    #[test]
    fn template_dot_is_ink_with_a_clear_ring() {
        let (w, h) = (44, 44);
        let base = vec![0x11; (w * h * 4) as usize];
        let out = with_badge(&base, w, h, BadgeStyle::Template);
        assert_eq!(out.len(), base.len());
        assert_eq!(px(&out, w, 36, 6), INK, "tâm chấm");
        assert_eq!(px(&out, w, 30, 6), CLEAR, "viền (cách tâm 6,5)");
        assert_eq!(px(&out, w, 29, 6), [0x11; 4], "ngoài viền (cách tâm 7,5)");
        assert_eq!(px(&out, w, 0, 43), [0x11; 4], "góc dưới trái không đổi");
    }

    /// Color 32 px: bán kính 5,6, viền 1,92, tâm khoảng (24,48; 7,52).
    #[test]
    fn color_dot_is_red_with_a_white_ring() {
        let (w, h) = (32, 32);
        let base = vec![0x22; (w * h * 4) as usize];
        let out = with_badge(&base, w, h, BadgeStyle::Color);
        assert_eq!(px(&out, w, 24, 7), RED, "tâm chấm");
        assert_eq!(px(&out, w, 17, 7), WHITE, "viền (cách tâm khoảng 6,98)");
        assert_eq!(px(&out, w, 16, 7), [0x22; 4], "ngoài viền (cách tâm khoảng 7,98)");
        assert_eq!(px(&out, w, 0, 31), [0x22; 4], "góc dưới trái không đổi");
    }

    /// Mọi cỡ icon thường gặp: chấm và viền nằm gọn trong ảnh (không tràn mép), góc trên phải có chấm.
    #[test]
    fn the_badge_fits_common_icon_sizes() {
        for size in [16u32, 22, 32, 44, 64, 128, 256] {
            for style in [BadgeStyle::Template, BadgeStyle::Color] {
                let base = vec![0x33; (size * size * 4) as usize];
                let out = with_badge(&base, size, size, style);
                let (radius, ring) = geometry(style, size as f32);
                let cx = size as f32 - radius - ring;
                let cy = radius + ring;
                assert!(cx + radius + ring <= size as f32 + 1e-3 && cy - radius - ring >= -1e-3, "{size} {style:?}");
                let dot = if style == BadgeStyle::Template { INK } else { RED };
                assert_eq!(px(&out, size, cx as u32, cy as u32), dot, "{size} {style:?}");
            }
        }
    }

    #[test]
    #[should_panic(expected = "ảnh RGBA sai kích thước")]
    fn a_buffer_of_the_wrong_size_is_a_bug() {
        with_badge(&[0; 12], 2, 2, BadgeStyle::Color);
    }
}
```

Thêm vào `src-tauri/src/lib.rs` ngay sau dòng `pub mod tray;`:

```rust
pub mod tray_badge;
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd $W && cargo test --locked -p meeting-translator --lib tray_badge`
Expected: FAIL (panic `not yet implemented`), riêng `a_buffer_of_the_wrong_size_is_a_bug` hỏng vì panic sai thông điệp.

- [ ] **Step 3: Viết hàm**

Thay thân `with_badge` bằng:

```rust
pub fn with_badge(rgba: &[u8], width: u32, height: u32, style: BadgeStyle) -> Vec<u8> {
    assert_eq!(rgba.len(), (width * height * 4) as usize, "ảnh RGBA sai kích thước");
    let (radius, ring) = geometry(style, width.min(height) as f32);
    let (cx, cy) = (width as f32 - radius - ring, radius + ring);
    let (dot, edge) = match style {
        BadgeStyle::Template => (INK, CLEAR),
        BadgeStyle::Color => (RED, WHITE),
    };
    let mut out = rgba.to_vec();
    for y in 0..height {
        for x in 0..width {
            let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            let color = if d <= radius {
                dot
            } else if d <= radius + ring {
                edge
            } else {
                continue;
            };
            let i = ((y * width + x) * 4) as usize;
            out[i..i + 4].copy_from_slice(&color);
        }
    }
    out
}
```

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd $W && cargo test --locked -p meeting-translator --lib tray_badge`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd $W && git add src-tauri/src/tray_badge.rs src-tauri/src/lib.rs && git commit -m "feat(tray): hàm vẽ dấu chấm lên icon khay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chuỗi "Có bản cập nhật gói model" năm ngôn ngữ

**Files:**
- Modify: `src-tauri/src/i18n.rs`

- [ ] **Step 1: Thêm trường và chuỗi**

Trong `pub struct Strings`, ngay sau trường `tray_restart_to_update` (và chú thích của nó), thêm:

```rust
    /// Gói model đang dùng có bản mới và app rảnh (spec 2026-10-23-cap-nhat-model-tu-dong §6.1): mở cửa sổ chính ở Home.
    pub tray_model_update: &'static str,
```

Trong từng hằng, ngay sau dòng `tray_restart_to_update: …,`:

| Hằng | Dòng thêm |
|---|---|
| `EN` | `tray_model_update: "Model pack update available",` |
| `VI` | `tray_model_update: "Có bản cập nhật gói model",` |
| `JA` | `tray_model_update: "モデルパックの更新があります",` |
| `ZH` | `tray_model_update: "模型包有可用更新",` |
| `KO` | `tray_model_update: "모델 팩 업데이트가 있습니다",` |

Trong `fn all`, thêm `tray_model_update,` vào phần phân rã ngay sau `tray_restart_to_update,`, và `("tray_model_update", tray_model_update),` vào `vec!` ngay sau dòng `("tray_restart_to_update", tray_restart_to_update),`.

- [ ] **Step 2: Chạy test của i18n**

Run: `cd $W && cargo test --locked -p meeting-translator --lib i18n`
Expected: mọi test qua (`every_string_is_filled_in_every_language`, `other_languages_are_actually_translated`, `cjk_strings_are_written_in_their_own_script`…).

- [ ] **Step 3: Commit**

```bash
cd $W && git add src-tauri/src/i18n.rs && git commit -m "feat(tray): chuỗi mục cập nhật gói model năm ngôn ngữ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Mục menu và luật dấu chấm

**Files:**
- Modify: `src-tauri/src/tray_menu.rs`
- Modify: `src-tauri/src/tray.rs:20-27` (chỉ thêm trường để còn biên dịch được; phần còn lại ở Task 5)

- [ ] **Step 1: Viết test trước**

Trong `mod tests` của `tray_menu.rs`:

1. Thêm `model_update: false,` vào **mọi** literal `TrayModel { … }` có sẵn (các test `idle_menu_in_vietnamese`, `labels_follow_state_in_english`, `restart_to_update_only_when_idle`, `compose_item_follows_the_setting`, và literal khác nếu có: tìm bằng `grep -n "TrayModel {" src-tauri/src/tray_menu.rs`).
2. Trong `all_lists_every_item_in_menu_order`, đổi bảng vị trí và độ dài:

```rust
            let position = match item {
                TrayItem::HotkeyWarning => 0,
                TrayItem::Session => 1,
                TrayItem::Overlay => 2,
                TrayItem::Lock => 3,
                TrayItem::Compose => 4,
                TrayItem::OpenMain => 5,
                TrayItem::CheckForUpdates => 6,
                TrayItem::ModelUpdate => 7,
                TrayItem::RestartToUpdate => 8,
                TrayItem::Quit => 9,
            };
            assert_eq!(position, index, "{item:?}");
        }
        assert_eq!(TrayItem::ALL.len(), 10);
```

3. Thêm test mới cuối `mod tests`:

```rust
    /// Spec 2026-10-23 §6.1: mục cập nhật gói model và dấu chấm chỉ khi rảnh; dấu chấm khi có ít nhất một mục cập nhật.
    #[test]
    fn model_update_item_and_badge_follow_state() {
        let model = |running, model_update, update_ready| TrayModel {
            running,
            overlay_visible: false,
            locked: false,
            hotkeys_failed: false,
            update_ready,
            compose_enabled: false,
            model_update,
        };
        assert_eq!(
            lines(&menu_lines(&i18n::VI, model(false, true, true)))[4..],
            [
                ("open-main", "Mở cửa sổ chính"),
                ("check-updates", "Kiểm tra cập nhật…"),
                ("---", "---"),
                ("model-update", "Có bản cập nhật gói model"),
                ("restart-to-update", "Khởi động lại để cập nhật"),
                ("quit", "Thoát")
            ]
        );
        assert!(
            !lines(&menu_lines(&i18n::VI, model(true, true, false)))
                .iter()
                .any(|(id, _)| *id == "model-update"),
            "đang dịch thì không hiện"
        );
        assert!(has_badge(model(false, true, false)), "chỉ có bản model mới");
        assert!(has_badge(model(false, false, true)), "chỉ có bản app mới");
        assert!(!has_badge(model(false, false, false)));
        assert!(!has_badge(model(true, true, true)), "đang dịch thì không có dấu chấm");
    }
```

- [ ] **Step 2: Chạy test, phải không biên dịch được**

Run: `cd $W && cargo test --locked -p meeting-translator --lib tray_menu`
Expected: lỗi biên dịch (`no variant ModelUpdate`, `no field model_update`, `cannot find function has_badge`).

- [ ] **Step 3: Sửa `tray_menu.rs`**

Trong `enum TrayItem`, thêm `ModelUpdate,` ngay trước `RestartToUpdate,`. Đổi `ALL`:

```rust
    pub const ALL: [TrayItem; 10] = [
        Self::HotkeyWarning,
        Self::Session,
        Self::Overlay,
        Self::Lock,
        Self::Compose,
        Self::OpenMain,
        Self::CheckForUpdates,
        Self::ModelUpdate,
        Self::RestartToUpdate,
        Self::Quit,
    ];
```

Trong `fn id`, thêm nhánh `Self::ModelUpdate => "model-update",` ngay trước nhánh `RestartToUpdate`. Trong `fn hotkey_action`, đổi nhánh cuối:

```rust
            Self::HotkeyWarning
            | Self::OpenMain
            | Self::CheckForUpdates
            | Self::ModelUpdate
            | Self::RestartToUpdate
            | Self::Quit => None,
```

Trong `struct TrayModel`, thêm cuối:

```rust
    /// Gói model đang dùng có bản mới, người dùng chưa bấm "Để sau", không đang tải (spec 2026-10-23 §6.1).
    pub model_update: bool,
```

Trong `menu_lines`, thay khối:

```rust
    if model.update_ready && !model.running {
        lines.push(Some((TrayItem::RestartToUpdate, strings.tray_restart_to_update)));
    }
```

bằng:

```rust
    // Mục cập nhật chỉ hiện khi không dịch (§6.11 "app đang rảnh"), để không làm phiền giữa cuộc họp.
    if !model.running {
        if model.model_update {
            lines.push(Some((TrayItem::ModelUpdate, strings.tray_model_update)));
        }
        if model.update_ready {
            lines.push(Some((TrayItem::RestartToUpdate, strings.tray_restart_to_update)));
        }
    }
```

Thêm hàm ngay sau `menu_lines`:

```rust
/// Icon khay có dấu chấm khi menu có ít nhất một mục cập nhật (spec 2026-10-23 §6.1).
pub fn has_badge(model: TrayModel) -> bool {
    !model.running && (model.update_ready || model.model_update)
}
```

Trong `src-tauri/src/tray.rs`, literal `TrayModel { … }` của `build_menu`: thêm tạm `model_update: false,` (Task 5 thay bằng giá trị thật).

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd $W && cargo test --locked -p meeting-translator --lib tray_menu`
Expected: mọi test qua, gồm `model_update_item_and_badge_follow_state`.

- [ ] **Step 5: Commit**

```bash
cd $W && git add src-tauri/src/tray_menu.rs src-tauri/src/tray.rs && git commit -m "feat(tray): mục cập nhật gói model và luật dấu chấm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cờ model cho khay

**Files:**
- Modify: `src-tauri/src/models/service.rs` (`changed`, thêm `tray_update`, test)
- Modify: `src-tauri/src/actions.rs:19-24` và test `the_tray_menu_is_rebuilt_only_when_something_in_it_changes`

- [ ] **Step 1: Viết test trước**

Trong `mod tests` của `service.rs`, ngay sau test `an_update_is_offered_not_downloaded`, thêm:

```rust
    /// Spec 2026-10-23 §6.1: mục khay và dấu chấm theo `updateAvailable` của cửa sổ chính.
    #[test]
    fn the_tray_offers_a_model_update_like_the_main_window() {
        let h = harness(|_| {});
        h.call("load_models", json!({})).unwrap();
        h.call("download_models", json!({ "pack": "lite" })).unwrap();
        h.wait("done");
        assert!(!h.service().tray_update(h.app.handle()), "chưa có bản mới");
        let mut newer = real_sample();
        newer["sequence"] = 4.into();
        let q4 = &mut newer["files"][3];
        q4["version"] = "2".into();
        q4["bytes"] = 1_101.into();
        let sha = sha2::Sha256::digest(content("hy-mt2-q4", 1_101));
        q4["sha256"] = sha.iter().map(|b| format!("{b:02x}")).collect::<String>().into();
        publish(&h.server, &newer);
        h.tick_days(1);
        h.call("load_models", json!({})).unwrap();
        assert!(h.service().tray_update(h.app.handle()), "có bản mới");
        h.call("dismiss_models_update", json!({})).unwrap();
        assert!(!h.service().tray_update(h.app.handle()), "đã bấm Để sau");
    }
```

Trong test `the_tray_menu_is_rebuilt_only_when_something_in_it_changes` của `actions.rs`, thêm trước khối "cài đặt không liên quan":

```rust
        let mut other = base.clone();
        other.model_tier = Some("standard".into());
        assert!(tray_needs_refresh(&base, &other), "gói model đang dùng");
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd $W && cargo test --locked -p meeting-translator --lib the_tray_`
Expected: lỗi biên dịch `no method named tray_update`; sau khi có hàm thì test của `actions.rs` hỏng ở "gói model đang dùng".

- [ ] **Step 3: Sửa code**

Trong `service.rs`, thêm ngay sau `pub fn view`:

```rust
    /// Có hiện mục "Có bản cập nhật gói model" và dấu chấm trên khay không (spec 2026-10-23 §6.1): như thông báo trong cửa
    /// sổ chính (`update_available`), trừ lúc đang tải.
    pub fn tray_update<R: Runtime>(&self, app: &AppHandle<R>) -> bool {
        let view = self.view(app);
        view.update_available && view.job.state != JobState::Downloading
    }
```

Đổi `changed` thành:

```rust
    /// Báo trạng thái mới cho cửa sổ chính và menu khay.
    pub fn changed<R: Runtime>(&self, app: &AppHandle<R>) -> ModelsView {
        self.lock().rev += 1;
        let view = self.view(app);
        if let Err(e) = app.emit_to(EventTarget::webview_window(window::MAIN), STATE_EVENT, &view) {
            log::warn!("không gửi được sự kiện {STATE_EVENT}: {e}");
        }
        // Gọi khi không giữ khóa nào: menu khay đọc lại `tray_update`.
        crate::tray::refresh(app);
        view
    }
```

Trong `actions.rs`:

```rust
fn tray_needs_refresh(previous: &Settings, next: &Settings) -> bool {
    previous.ui_language != next.ui_language
        || previous.overlay.locked != next.overlay.locked
        || previous.hotkeys != next.hotkeys
        || previous.compose.enabled != next.compose.enabled
        || previous.model_tier != next.model_tier
}
```

Sửa chú thích của test đó: "Menu khay hiện chữ theo ngôn ngữ, trạng thái khóa, phím tắt, Gõ dịch (spec 2026-10-20 §2) và có bản mới của gói model đang dùng (spec 2026-10-23 §6.1): đổi một trong số đó thì phải dựng lại."

- [ ] **Step 4: Chạy test, phải qua**

Run: `cd $W && cargo test --locked -p meeting-translator --lib the_tray_ && cargo test --locked -p meeting-translator --lib models::service`
Expected: mọi test qua.

- [ ] **Step 5: Commit**

```bash
cd $W && git add src-tauri/src/models/service.rs src-tauri/src/actions.rs && git commit -m "feat(tray): cờ bản model mới cho menu khay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Nối vào khay thật

**Files:**
- Modify: `src-tauri/src/tray.rs`

- [ ] **Step 1: Sửa `tray.rs`**

Đầu file, đổi phần `use`:

```rust
use std::sync::{Arc, Mutex};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager, Runtime};

use crate::hotkeys::HotkeyAction;
use crate::i18n;
use crate::models::service::ModelService;
use crate::state::{AppState, SessionStatus};
use crate::tray_badge::{BadgeStyle, with_badge};
use crate::tray_menu::{TrayItem, TrayModel, accelerator, has_badge, menu_lines};
use crate::{actions, compose, events, updater, window};
```

Đổi `build_menu` để trả thêm trạng thái dấu chấm:

```rust
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<(Menu<R>, String, bool)> {
    let state = app.state::<AppState>();
    let (settings, status) = (state.settings(), state.status());
    // Đọc sau khi đã có bản sao cài đặt và trạng thái: `tray_update` khóa ModelService rồi đọc lại AppState.
    let model_update = app
        .try_state::<Arc<ModelService>>()
        .is_some_and(|models| models.tray_update(app));
    let model = TrayModel {
        running: matches!(status.session, SessionStatus::Starting | SessionStatus::Running),
        overlay_visible: status.overlay_visible,
        locked: settings.overlay.locked,
        hotkeys_failed: !status.hotkey_failures.is_empty(),
        update_ready: status.update_ready.is_some(),
        compose_enabled: settings.compose.enabled,
        model_update,
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
    Ok((menu, strings.tooltip(&app.package_info().name, model.running), has_badge(model)))
}
```

Thêm, ngay trước `pub fn create`:

```rust
/// Dấu chấm đang hiện trên icon: chỉ đặt lại icon khi nó đổi, để icon không nháy mỗi lần dựng lại menu.
struct TrayBadge(Mutex<bool>);

/// Icon khay theo hệ điều hành, có dấu chấm khi `badge` (spec 2026-10-23 §6.2). macOS: icon template đơn sắc.
#[cfg(target_os = "macos")]
fn tray_icon<R: Runtime>(_app: &AppHandle<R>, badge: bool) -> Option<Image<'static>> {
    Some(badged(tauri::include_image!("icons/tray-template.png"), badge, BadgeStyle::Template))
}

/// Windows: icon màu của app; không có thì `None` (Tauri dùng icon mặc định, không có dấu chấm).
#[cfg(not(target_os = "macos"))]
fn tray_icon<R: Runtime>(app: &AppHandle<R>, badge: bool) -> Option<Image<'static>> {
    // `Image::to_owned` (hàm riêng của Image) chép điểm ảnh ra bản `'static`.
    Some(badged(app.default_window_icon()?.clone().to_owned(), badge, BadgeStyle::Color))
}

fn badged(base: Image<'static>, badge: bool, style: BadgeStyle) -> Image<'static> {
    if !badge {
        return base;
    }
    let (width, height) = (base.width(), base.height());
    Image::new_owned(with_badge(base.rgba(), width, height, style), width, height)
}

fn set_badge<R: Runtime>(app: &AppHandle<R>, tray: &TrayIcon<R>, badge: bool) {
    let Some(shown) = app.try_state::<TrayBadge>() else { return };
    let mut shown = shown.0.lock().unwrap_or_else(|e| e.into_inner());
    if *shown == badge {
        return;
    }
    if let Some(icon) = tray_icon(app, badge) {
        if let Err(e) = tray.set_icon(Some(icon)) {
            log::warn!("không đặt được icon khay: {e}");
            return;
        }
        #[cfg(target_os = "macos")]
        if let Err(e) = tray.set_icon_as_template(true) {
            log::warn!("không đặt được icon khay dạng template: {e}");
        }
    }
    *shown = badge;
}
```

Đổi `create` thành:

```rust
pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let (menu, tooltip, badge) = build_menu(app)?;
    app.manage(TrayBadge(Mutex::new(badge)));
    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(tooltip)
        .on_menu_event(|app, event| on_menu_event(app, event.id().as_ref()));
    let builder = match tray_icon(app, badge) {
        Some(icon) => builder.icon(icon),
        None => builder,
    };
    // macOS: icon đơn sắc dạng template, hệ thống tự đổi màu theo menu bar sáng hay tối; bấm chuột
    // trái mở menu như mọi icon menu bar. Windows: icon màu của app; bấm chuột trái mở cửa sổ chính,
    // chuột phải mở menu.
    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true);
    #[cfg(not(target_os = "macos"))]
    let builder = {
        use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
        builder
            .show_menu_on_left_click(false)
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    window::show_main(tray.app_handle());
                }
            })
    };
    builder.build(app)?;
    Ok(())
}
```

Đổi `refresh`:

```rust
/// Dựng lại menu, chú thích và dấu chấm theo trạng thái hiện tại.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    match build_menu(app) {
        Ok((menu, tooltip, badge)) => {
            let _ = tray.set_menu(Some(menu));
            let _ = tray.set_tooltip(Some(tooltip));
            set_badge(app, &tray, badge);
        }
        Err(e) => log::warn!("không dựng lại được menu khay: {e}"),
    }
}
```

Trong `on_menu_event`, thêm nhánh ngay trước nhánh `RestartToUpdate`:

```rust
        // Thông báo "Có bản mới của gói…" nằm ở Home (spec 2026-10-23 §6.1).
        Some(TrayItem::ModelUpdate) => actions::open_main_at(
            app,
            events::Navigate {
                screen: "home",
                settings_group: None,
            },
        ),
```

- [ ] **Step 2: Biên dịch và chạy toàn bộ test của crate app**

Run: `cd $W && cargo clippy -p meeting-translator --all-targets --locked -- -D warnings && cargo test --locked -p meeting-translator`
Expected: không cảnh báo; mọi test qua. Nếu `clone().to_owned()` báo lỗi kiểu hay cảnh báo `clippy::redundant_clone`, dùng `Image::new_owned(icon.rgba().to_vec(), icon.width(), icon.height())` với `let icon = app.default_window_icon()?;` thay cho dòng đó.

- [ ] **Step 3: Kiểm Windows biên dịch được (nhánh `cfg(not(macos))`)**

Run: `cd $W && scripts/check-windows.sh` (đọc đầu file để biết cách dùng; nếu script đòi điều kiện máy không có, ghi lại và để CI Windows kiểm).
Expected: biên dịch được cho Windows.

- [ ] **Step 4: Commit**

```bash
cd $W && git add src-tauri/src/tray.rs && git commit -m "feat(tray): dấu chấm trên icon khay và mục mở thông báo gói model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Spec chính

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

- [ ] **Step 1: Sửa ba chỗ**

1. §4.5, dòng "**Chuỗi phía Rust** (menu khay, chú thích khay, file xuất bản chép lời, 21 chuỗi)": đổi "21 chuỗi" thành "23 chuỗi" (đếm bằng số dòng trong `vec!` của `Strings::all`: `grep -c '("' src-tauri/src/i18n.rs` trong khối đó; sửa theo số đếm thật).
2. §6.7, cuối gạch đầu dòng "**Cập nhật model:**" (sau câu "Có bản mới thì hỏi người dùng, không tự tải."), thêm câu: "Từ 0.2.6, khi gói đang dùng có bản mới (người dùng chưa bấm Để sau, không đang tải) và app không dịch, icon khay có dấu chấm và menu khay có mục "Có bản cập nhật gói model", bấm thì mở cửa sổ chính ở Home (spec 2026-10-23-cap-nhat-model-tu-dong §6)."
3. §6.11, cuối gạch đầu dòng "Kiểm tra lúc khởi động và mỗi 24 giờ. …": thêm câu: "Từ 0.2.6, lúc có lời mời này icon khay có dấu chấm (macOS: chấm đơn sắc theo menu bar; Windows: chấm đỏ), cùng luật với bản model mới (§6.7)."

- [ ] **Step 2: Commit**

```bash
cd $W && git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && git commit -m "docs(spec): luật dấu chấm trên khay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Kiểm toàn bộ và thử tay trên Mac

- [ ] **Step 1: Kiểm tự động**

```bash
cd $W && cargo fmt --all -- --check
cd $W && cargo clippy --workspace --all-targets --locked -- -D warnings
cd $W && cargo test --workspace --locked
cd $W && pnpm install --frozen-lockfile && pnpm test && pnpm build
```

Expected: tất cả xanh. Sửa lỗi nào thì commit riêng.

- [ ] **Step 2: Thử tay (báo chủ dự án trước khi làm)**

Bản dev dùng chung bundle id và thư mục model với app thật của chủ dự án. Nhắn trước: "Tôi sẽ thoát app thật, sao lưu rồi sửa tạm `installed.json` trong `~/Library/Application Support/com.aitranslator.desktop/models/` để giả lập có bản model mới, thử dấu chấm khay, rồi trả lại bản sao lưu; trong lúc đó đừng mở app thật."

Giả lập bằng cách sửa SHA đã cài, không đổi tên file: đổi tên làm file "không có", gói thành "không dùng được"
(`usable = false`) nên `updateAvailable` là false và không có dấu chấm. Sửa `sha256` trong `installed.json` (giữ `bytes`)
thì gói vẫn dùng được nhưng "chưa đủ" (`usable && !complete`), đúng như khi manifest có bản mới.

1. Thoát app thật. Đọc `settings.json` (thư mục dữ liệu app) lấy `modelTier`; đọc `models/models.json` để biết `id` file MT của gói đó, và `models/state.json` để chắc `dismissed_sequence` nhỏ hơn `sequence` của manifest (bằng thì đặt tạm `dismissed_sequence` nhỏ hơn và ghi lại giá trị cũ).
2. `cp installed.json installed.json.thu-khay` (và `state.json` nếu sửa ở bước 1); sửa `sha256` của mục MT đó trong `installed.json` thành 64 chữ `0`, giữ nguyên `bytes`.
3. Chạy bản dev theo `scripts/run-dev-app.sh` (đọc đầu script). Chờ cửa sổ chính.
4. Chụp màn hình menu bar (`screencapture -R <vùng góc trên phải> …`) và đọc ảnh: có dấu chấm ở icon AI Translator. Bấm icon: menu có "Có bản cập nhật gói model" ngay trên "Thoát". Bấm mục đó: cửa sổ chính mở ở Home, có thanh "Có bản mới của gói…". Không bấm "Tải ngay".
5. Bấm "Để sau": dấu chấm mất, mục menu mất.
6. Thoát bản dev. Trả `installed.json.thu-khay` (và `state.json` nếu đã sửa) về chỗ cũ. Mở lại app thật, kiểm gói vẫn sẵn sàng và không có thông báo "Có bản mới…".
7. Tắt mọi tiến trình đã mở (bản dev, Vite cổng 1420).

Ghi kết quả (ảnh chụp, đạt/không) vào báo cáo cho chủ dự án.

- [ ] **Step 3: Không phát hành trong kế hoạch này**

Phát hành 0.2.6 theo quy trình năm bước khi chủ dự án cho phép (nâng bốn file phiên bản, đợi CI, hỏi rồi đẩy tag).
