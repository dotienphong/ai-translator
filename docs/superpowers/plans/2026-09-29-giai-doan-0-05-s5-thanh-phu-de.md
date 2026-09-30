# Giai đoạn 0 · 05: S5 (thanh phụ đề nổi trên app đang toàn màn hình)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Cho thanh phụ đề nổi trên app họp đang toàn màn hình, trên cả macOS và Windows (§4.4). Thanh phụ đề phải đạt các yêu cầu sau:
- Không lấy focus của app họp.
- Hiện trên mọi Space của macOS.
- Có chế độ khóa cho click xuyên qua.
- Ẩn/hiện và khóa được bằng phím tắt toàn cục.

**Kiến trúc:** App Tauri 2 tối thiểu có hai cửa sổ.
- `main`: cửa sổ điều khiển.
- `overlay`: thanh phụ đề. Trên macOS dùng NSPanel kiểu non-activating qua `tauri-nspanel`, mức `Status`, `canJoinAllSpaces` và `fullScreenAuxiliary`. Trên Windows dùng cửa sổ không viền, trong suốt, `always_on_top` và `skip_taskbar`.

Một luồng nền phát phụ đề mẫu (sự kiện `subtitle://upsert`) mỗi 1,5 giây, dòng thứ tư là phụ đề tạm. Mỗi cửa sổ chỉ có đúng các quyền nó cần (§10.2).

**Công nghệ:**
- Tauri 2.12.0, tauri-build 2.7.0, tauri-plugin-global-shortcut 2.4.0, tauri-nspanel 2.1.0 (feature `macos-private-api`).
- React 19.3.0, Vite 8.3.1, @vitejs/plugin-react 6.1.1, TypeScript 7.0.2.
- pnpm 12.6.0, Node 24.21.0.

Tổng quan: `docs/superpowers/plans/2026-09-29-giai-doan-0-00-tong-quan.md`. Cần xong kế hoạch 01. Task 1–3 làm trên Mac, Task 4 làm trên Windows.

---

### Task 1: Frontend (hai cửa sổ React)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `overlay.html`
- Create: `src/windows/main/main.tsx`, `src/windows/overlay/overlay.tsx`
- Create: `pnpm-lock.yaml` (pnpm sinh ra)

Kiểm tra tương thích theo §6.12, đã làm lúc lập kế hoạch:
- Vite 8.3 cần Node ^20.19 hoặc ≥ 22.12.
- @vitejs/plugin-react 6.1.1 chỉ bắt buộc peer `vite ^8`.
- @types/react(-dom) 19.3.0 khớp React 19.3.0.
- `@tauri-apps/api` và `@tauri-apps/cli` 2.12.0 cùng dòng với crate `tauri` 2.12.0.
- `tsconfig.json` chỉ kiểm tra kiểu thư mục `src/`, vì `vite.config.ts` cần `@types/node`.

- [ ] **Step 1: Tạo `package.json`**

```json
{
  "name": "meeting-translator",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": ">=24.21.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "2.12.0",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "2.12.0",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.1",
    "typescript": "7.0.2",
    "vite": "8.3.1"
  }
}
```

- [ ] **Step 2: Tạo `vite.config.ts`**

```ts
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Hai cửa sổ, mỗi cửa sổ một entry HTML riêng (spec §6.10).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        overlay: resolve(import.meta.dirname, "overlay.html"),
      },
    },
  },
});
```

- [ ] **Step 3: Tạo `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Tạo `index.html` và `overlay.html`**

`index.html`:

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <title>Meeting Translator — spike S5</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/windows/main/main.tsx"></script>
  </body>
</html>
```

`overlay.html`:

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <title>Phụ đề</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/windows/overlay/overlay.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Tạo `src/windows/main/main.tsx`**

```tsx
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

// Cửa sổ điều khiển cho spike S5: bật phụ đề mẫu, khóa click xuyên, đổi activation policy.
function App() {
  const [ticker, setTicker] = useState(false);
  const [locked, setLocked] = useState(false);
  const [accessory, setAccessory] = useState(false);

  // Phím tắt Ctrl+Alt+L cũng đổi trạng thái khóa: nghe lại để nút không bị lệch.
  useEffect(() => {
    const off = listen<boolean>("overlay://locked", (e) => setLocked(e.payload));
    return () => {
      off.then((f) => f());
    };
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", padding: 16, lineHeight: 1.8 }}>
      <h3>Spike S5: thanh phụ đề nổi</h3>
      <button onClick={async () => setTicker(await invoke<boolean>("toggle_ticker"))}>
        {ticker ? "Dừng" : "Bắt đầu"} phụ đề mẫu (Ctrl+Alt+T)
      </button>{" "}
      <button
        onClick={async () => {
          await invoke("set_locked", { locked: !locked });
          setLocked(!locked);
        }}
      >
        {locked ? "Mở khóa" : "Khóa"} phụ đề (Ctrl+Alt+L)
      </button>
      <p>Ctrl+Alt+H: ẩn/hiện phụ đề.</p>
      <label>
        <input
          type="checkbox"
          checked={accessory}
          onChange={async (e) => {
            await invoke("set_accessory", { accessory: e.target.checked });
            setAccessory(e.target.checked);
          }}
        />{" "}
        macOS: chạy dạng accessory (không có icon ở Dock)
      </label>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Tạo `src/windows/overlay/overlay.tsx`**

```tsx
import { listen } from "@tauri-apps/api/event";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

type Subtitle = { id: number; src_text: string; tgt_text: string; provisional: boolean };

// Thanh phụ đề: hiện 3 dòng gần nhất, phụ đề tạm màu nhạt hơn (spec §4.4).
function Overlay() {
  const [lines, setLines] = useState<Subtitle[]>([]);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const offSubtitle = listen<Subtitle>("subtitle://upsert", (e) =>
      setLines((prev) => {
        // Cập nhật tại chỗ (phụ đề tạm được thay), giữ thứ tự; dòng mới thì thêm vào cuối.
        const i = prev.findIndex((l) => l.id === e.payload.id);
        if (i >= 0) return prev.map((l, j) => (j === i ? e.payload : l));
        return [...prev, e.payload].slice(-3);
      }),
    );
    const offLocked = listen<boolean>("overlay://locked", (e) => setLocked(e.payload));
    return () => {
      offSubtitle.then((f) => f());
      offLocked.then((f) => f());
    };
  }, []);

  return (
    <div
      data-tauri-drag-region={locked ? undefined : "deep"}
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        overflow: "hidden",
        boxSizing: "border-box",
        padding: "8px 16px",
        borderRadius: 12,
        background: "rgba(0, 0, 0, 0.62)",
        color: "white",
        fontFamily: "system-ui",
        fontSize: 22,
        cursor: locked ? "default" : "move",
        outline: locked ? "none" : "1px dashed rgba(255,255,255,0.4)",
      }}
    >
      {lines.map((l) => (
        <div key={l.id} style={{ opacity: l.provisional ? 0.6 : 1 }}>
          <div style={{ fontSize: 13, opacity: 0.75 }}>{l.src_text}</div>
          <div>{l.tgt_text}</div>
        </div>
      ))}
    </div>
  );
}

document.body.style.margin = "0";
document.body.style.background = "transparent";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
```

- [ ] **Step 7: Cài, build, kiểm tra lỗ hổng**

Run: `pnpm install && pnpm build && pnpm audit`
Expected:
- `pnpm install` cài đúng các bản trong `package.json`.
- `pnpm build` chạy `tsc --noEmit` không lỗi, rồi `vite build` ra `dist/index.html`, `dist/overlay.html` và `dist/assets/…`, dòng cuối là `✓ built in …`.
- `pnpm audit` in `No known vulnerabilities found`.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts tsconfig.json index.html overlay.html src
git commit -m "feat(app): frontend React 19 cho spike S5 (cửa sổ điều khiển và thanh phụ đề)"
```

### Task 2: App Tauri

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/main.json`, `src-tauri/capabilities/overlay.json`
- Create: `src-tauri/src/main.rs`
- Create: `scripts/make_icon.py`, `app-icon.png`, `src-tauri/icons/`
- Modify: `Cargo.toml` (thêm `src-tauri` vào workspace)

Điểm chính:
- `macOSPrivateApi: true` để cửa sổ trong suốt được trên macOS. Vì vậy app không lên được Mac App Store, khớp D10.
- CSP chặt, chỉ cho `ipc:`.
- Ba phím tắt toàn cục: Ctrl+Alt+T bật hoặc tắt phụ đề mẫu, Ctrl+Alt+H ẩn hoặc hiện, Ctrl+Alt+L khóa hoặc mở khóa. Nếu không đăng ký được thì in lỗi ra stderr, app vẫn chạy.
- Khóa bằng `set_ignores_mouse_events` (NSPanel) hoặc `set_ignore_cursor_events` (Windows).
- `bundle.active: false`: spike chưa đóng gói.
- **Overlay trên macOS**, rút ra từ review lúc thực thi:
  - NSPanel được tạo từ một cửa sổ không viền, trong suốt, không focus, có `accept_first_mouse`.
  - Bit NonactivatingPanel được cộng thêm bằng `add_style_mask`. `StyleMask::borderless()` gán đè cả mask, nên nếu dùng nó thì panel mất tính non-activating và lấy focus của app họp.
  - Vùng kéo dùng `data-tauri-drag-region="deep"`, để bấm vào dòng chữ cũng kéo được.
- **Overlay trên Windows** có `focusable(false)`, để click hay phím tắt không lấy focus của app họp.
- **Quyền (§10.2):**
  - Command của app khai trong app manifest ở `build.rs`. Chưa có manifest thì command không qua ACL, và cửa sổ nào cũng gọi được.
  - Cửa sổ `main` chỉ được cấp đúng ba command, cộng quyền nghe sự kiện. Overlay không gọi được command nào.
  - Mỗi command mới phải thêm vào `commands(&[...])` và cấp `allow-<tên>` trong capability.
  - `build.rs` sinh `src-tauri/permissions/autogenerated/`, thư mục này đã được `.gitignore` bỏ qua.

- [ ] **Step 1: Tạo `src-tauri/Cargo.toml`**

```toml
[package]
name = "meeting-translator"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

[build-dependencies]
tauri-build = { version = "2.7.0", features = [] }

[dependencies]
serde_json.workspace = true
tauri = { version = "2.12.0", features = ["macos-private-api"] }
tauri-plugin-global-shortcut = "2.4.0"

[target.'cfg(target_os = "macos")'.dependencies]
tauri-nspanel = "2.1.0"
```

- [ ] **Step 2: Tạo `src-tauri/build.rs`**

```rust
fn main() {
    // Khai báo app manifest để command của app cũng qua ACL (spec §10.2): cửa sổ nào không được cấp
    // `allow-<command>` trong capabilities thì không gọi được.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "toggle_ticker",
            "set_locked",
            "set_accessory",
        ])),
    )
    .expect("tauri-build thất bại");
}
```

- [ ] **Step 3: Tạo `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Meeting Translator",
  "version": "0.1.0",
  "identifier": "dev.meetingtranslator.spike",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "label": "main",
        "title": "Meeting Translator — spike S5",
        "url": "index.html",
        "width": 560,
        "height": 320
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": false,
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

- [ ] **Step 4: Tạo hai file quyền**

`src-tauri/capabilities/main.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main",
  "description": "Cửa sổ chính: chỉ ba lệnh của spike và nghe sự kiện khóa (spec §10.2).",
  "windows": ["main"],
  "permissions": ["allow-toggle-ticker", "allow-set-locked", "allow-set-accessory", "core:event:allow-listen", "core:event:allow-unlisten"]
}
```

`src-tauri/capabilities/overlay.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "overlay",
  "description": "Thanh phụ đề: chỉ nhận sự kiện và kéo cửa sổ của chính nó; không gọi được lệnh nào của app (spec §10.2).",
  "windows": ["overlay"],
  "permissions": ["core:event:allow-listen", "core:event:allow-unlisten", "core:window:allow-start-dragging"]
}
```

- [ ] **Step 5: Tạo `src-tauri/src/main.rs`**

```rust
//! Spike S5: thanh phụ đề nổi trên app họp đang toàn màn hình (spec §4.4).
//! macOS dùng NSPanel kiểu non-activating (tauri-nspanel); Windows dùng cửa sổ topmost.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
tauri_nspanel::tauri_panel! {
    panel!(OverlayPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true
        }
    })
}

#[derive(Default)]
struct Flags {
    ticker: AtomicBool,
    locked: AtomicBool,
    hidden: AtomicBool,
}

const SAMPLES: &[(&str, &str)] = &[
    (
        "Good morning everyone, thanks for joining.",
        "Chào buổi sáng mọi người, cảm ơn đã tham gia.",
    ),
    (
        "Let's review the quarterly numbers first.",
        "Trước hết hãy xem lại số liệu quý.",
    ),
    (
        "我们下周需要完成测试。",
        "Tuần sau chúng ta cần hoàn thành việc kiểm thử.",
    ),
    (
        "来月の予算を確認させてください。",
        "Cho tôi xác nhận lại ngân sách tháng tới.",
    ),
];

#[tauri::command]
fn toggle_ticker(flags: tauri::State<'_, Arc<Flags>>) -> bool {
    !flags.ticker.fetch_xor(true, Ordering::Relaxed)
}

#[tauri::command]
fn set_locked(app: AppHandle, flags: tauri::State<'_, Arc<Flags>>, locked: bool) -> Result<(), String> {
    flags.locked.store(locked, Ordering::Relaxed);
    apply_lock(&app, locked).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_accessory(app: AppHandle, accessory: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let policy = if accessory {
            tauri::ActivationPolicy::Accessory
        } else {
            tauri::ActivationPolicy::Regular
        };
        app.set_activation_policy(policy).map_err(|e| e.to_string())?;
    }
    let _ = (app, accessory);
    Ok(())
}

fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::{CollectionBehavior, PanelBuilder, PanelLevel, StyleMask};
        let panel = PanelBuilder::<_, OverlayPanel>::new(app, "overlay")
            .url(WebviewUrl::App("overlay.html".into()))
            .size(tauri::Size::Logical(tauri::LogicalSize::new(900.0, 160.0)))
            // Tạo sẵn cửa sổ gốc không viền (Borderless|Resizable), WKWebView trong suốt,
            // không nhận key lúc tạo, chưa hiện; click đầu tiên vào panel không-key vẫn tới webview.
            .with_window(|w| {
                w.decorations(false)
                    .transparent(true)
                    .focused(false)
                    .visible(false)
                    .accept_first_mouse(true)
            })
            .level(PanelLevel::Status)
            // Chỉ OR thêm NonactivatingPanel. `StyleMask::borderless()` GÁN mask = 0 nên không được gọi sau.
            .add_style_mask(StyleMask::empty().nonactivating_panel())
            .collection_behavior(
                CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary()
                    .stationary(),
            )
            .transparent(true)
            .has_shadow(false)
            .hides_on_deactivate(false)
            .no_activate(true)
            .build()?;
        panel.show();
    }
    #[cfg(not(target_os = "macos"))]
    {
        tauri::WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
            .title("Phụ đề")
            .inner_size(900.0, 160.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .focused(false)
            .focusable(false) // WS_EX_NOACTIVATE: click/kéo không kích hoạt thanh phụ đề
            .build()?;
    }
    Ok(())
}

/// Chế độ khóa: cho click xuyên qua thanh phụ đề (spec §4.4).
fn apply_lock(app: &AppHandle, locked: bool) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel("overlay") {
            panel.set_ignores_mouse_events(locked);
        }
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("overlay") {
        window.set_ignore_cursor_events(locked)?;
    }
    app.emit("overlay://locked", locked)
}

fn toggle_visible(app: &AppHandle, flags: &Flags) -> tauri::Result<()> {
    let hide = !flags.hidden.fetch_xor(true, Ordering::Relaxed);
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel("overlay") {
            if hide { panel.hide() } else { panel.show() }
        }
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("overlay") {
        if hide { window.hide()? } else { window.show()? }
    }
    Ok(())
}

fn main() {
    let flags = Arc::new(Flags::default());
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    builder
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let flags = app.state::<Arc<Flags>>();
                    match shortcut.key {
                        Code::KeyT => {
                            flags.ticker.fetch_xor(true, Ordering::Relaxed);
                        }
                        Code::KeyH => {
                            let _ = toggle_visible(app, &flags);
                        }
                        Code::KeyL => {
                            let locked = !flags.locked.fetch_xor(true, Ordering::Relaxed);
                            let _ = apply_lock(app, locked);
                        }
                        _ => {}
                    }
                })
                .build(),
        )
        .manage(flags.clone())
        .invoke_handler(tauri::generate_handler![toggle_ticker, set_locked, set_accessory])
        .setup(move |app| {
            create_overlay(app.handle())?;
            // Phím tắt mặc định của F10; lỗi đăng ký nghĩa là đã có app khác giữ tổ hợp này.
            for code in [Code::KeyT, Code::KeyH, Code::KeyL] {
                if let Err(e) = app
                    .global_shortcut()
                    .register(Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), code))
                {
                    eprintln!("không đăng ký được Ctrl+Alt+{code:?}: {e}");
                }
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut n = 0u64;
                loop {
                    std::thread::sleep(Duration::from_millis(1500));
                    if !flags.ticker.load(Ordering::Relaxed) {
                        continue;
                    }
                    let (src, tgt) = SAMPLES[n as usize % SAMPLES.len()];
                    let payload =
                        serde_json::json!({ "id": n, "src_text": src, "tgt_text": tgt, "provisional": n % 4 == 3 });
                    let _ = handle.emit("subtitle://upsert", payload);
                    n += 1;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("lỗi khi chạy app");
}
```

- [ ] **Step 6: Tạo icon tạm**

Tạo `scripts/make_icon.py`:

```python
"""Tạo icon tạm 1024×1024 (PNG, hình tròn xanh trên nền trong suốt) cho spike S5.

Dùng:  python3 scripts/make_icon.py && pnpm tauri icon app-icon.png
Chỉ dùng thư viện chuẩn của Python. Tên và logo thật chưa chốt (spec §15).
"""
import struct
import zlib

SIZE = 1024
RADIUS = SIZE * 0.42
BLUE = bytes((32, 110, 200, 255))
CLEAR = bytes((0, 0, 0, 0))


def chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def main():
    rows = []
    for y in range(SIZE):
        row = bytearray([0])  # bộ lọc "None" cho mỗi hàng
        for x in range(SIZE):
            inside = (x - SIZE / 2) ** 2 + (y - SIZE / 2) ** 2 < RADIUS**2
            row += BLUE if inside else CLEAR
        rows.append(bytes(row))
    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)  # 8 bit mỗi kênh, RGBA
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
           + chunk(b"IEND", b""))
    with open("app-icon.png", "wb") as f:
        f.write(png)


if __name__ == "__main__":
    main()
```

Run:
```bash
python3 scripts/make_icon.py && pnpm tauri icon app-icon.png
rm -rf src-tauri/icons/android src-tauri/icons/ios
ls src-tauri/icons
```
Expected: có `32x32.png`, `128x128.png`, `icon.icns`, `icon.ico` (cùng các cỡ khác cho Windows).

- [ ] **Step 7: Thêm app vào workspace.** Trong `Cargo.toml` ở gốc repo, sửa khối `[workspace]` thành:

```toml
[workspace]
resolver = "3"
members = ["crates/*", "src-tauri"]
# `cargo build` và `cargo test` không kèm `-p` chỉ chạy các crate trong crates/. App Tauri chạy bằng `pnpm tauri dev`
# (binary từ `cargo build` là bản dev: không nhúng `dist/`, mà mở http://localhost:1420 do Vite phục vụ). Bản nhúng
# frontend thì build bằng `pnpm tauri build`, lệnh này tự chạy `pnpm build` trước.
default-members = ["crates/*"]
```

- [ ] **Step 8: Build, clippy, kiểm tra phụ thuộc**

Run:
```bash
cargo build -p meeting-translator
cargo clippy -p meeting-translator --all-targets -- -D warnings
cargo deny check && cargo audit
```
Expected:
- Build và clippy không lỗi, không cảnh báo.
- `cargo deny check` in `advisories ok, bans ok, licenses ok, sources ok`.
- `cargo audit` không báo lỗ hổng. Nó có thể in cảnh báo cho `glib` (unsound) và `proc-macro-error` (unmaintained): đây là phụ thuộc chỉ có trên Linux (gtk của Tauri), không vào bản build Mac hay Windows. `deny.toml` đã loại chúng bằng `targets`.

- [ ] **Step 9: Chạy thử**

Run: `pnpm tauri dev`
Expected:
- Mở cửa sổ "Meeting Translator — spike S5" và một thanh phụ đề trong suốt, viền nét đứt.
- Bấm "Bắt đầu phụ đề mẫu" thì cứ 1,5 giây có một dòng mới. Thanh giữ tối đa 3 dòng gần nhất, và dòng tạm (mỗi dòng thứ tư) nhạt hơn.

- [ ] **Step 10: Commit**

```bash
git add Cargo.toml Cargo.lock src-tauri scripts/make_icon.py app-icon.png
git commit -m "feat(app): spike S5 thanh phụ đề nổi (NSPanel trên macOS, topmost trên Windows)"
```

### Task 3: S5, ma trận thử trên macOS

**Files:**
- Create: `bench/phase0/results/s5_overlay.md`

Chạy `pnpm tauri dev`, bật phụ đề mẫu, rồi làm từng dòng.

Muốn thử cả bản release:
- Chạy `CARGO_PROFILE_RELEASE_LTO=false pnpm tauri build --no-bundle`, rồi chạy `target/release/meeting-translator`.
- Hành vi cửa sổ không phụ thuộc LTO, nên tắt LTO cho build nhanh hơn và tốn ít đĩa hơn.
- Đừng chạy binary do `cargo build` tạo ra: đó là bản dev, không nhúng `dist/`, và mở `http://localhost:1420`.

Review lúc thực thi đã sửa lỗi overlay không thật sự non-activating (`StyleMask::borderless()` gán đè cả mask). Nếu sau khi sửa mà dòng 7 hoặc 8 vẫn kích hoạt app, hãy ghi lại: AppKit có hành vi đã biết khi thêm NonactivatingPanel sau lúc tạo cửa sổ.

- [ ] **Step 1: Chạy từng dòng và điền cột kết quả**

| # | Tình huống | Đạt khi |
|---|---|---|
| 1 | Zoom đang chia sẻ màn hình, cửa sổ Zoom toàn màn hình (Space riêng) | thanh phụ đề hiện trên Zoom và vẫn cập nhật. Ghi thêm: người xem màn hình chia sẻ có thấy thanh không (đã đặt `content_protected`) |
| 2 | Google Meet trên Chrome, toàn màn hình | như dòng 1 |
| 3 | Google Meet trên Safari, toàn màn hình | như dòng 1 |
| 4 | Microsoft Teams, toàn màn hình | như dòng 1 |
| 4a | Cuộc gọi video Zalo PC, phóng to toàn màn hình | như dòng 1 |
| 5 | Keynote đang trình chiếu | ghi lại: thanh có hiện không (Keynote trình chiếu ở mức cửa sổ cao hơn) |
| 6 | Vuốt qua lại giữa các Space | thanh luôn hiện ở Space đang xem |
| 7 | Đang gõ trong ô chat của Zoom trong khi phụ đề cập nhật | chữ vẫn vào ô chat. Thanh không lấy focus, Zoom không mất trạng thái active |
| 8 | Chưa khóa: kéo thanh sang chỗ khác | kéo được |
| 9 | Ctrl+Alt+L để khóa, rồi click vào nút của Zoom nằm dưới thanh | click xuyên qua tới Zoom; viền nét đứt biến mất |
| 10 | Ctrl+Alt+H hai lần khi Zoom đang toàn màn hình | thanh ẩn rồi hiện lại, Zoom vẫn toàn màn hình |
| 11 | Tick "chạy dạng accessory", rồi làm lại dòng 1 và 7 | không có icon ở Dock; dòng 1 và 7 vẫn đạt |
| 12 | Hai màn hình, Zoom toàn màn hình ở màn hình phụ | ghi lại: thanh ở màn hình nào, có kéo sang được không |
| 13 | Phím tắt trùng (F10): lần lượt để Zoom, Teams, Meet (Chrome) active, bấm Ctrl+Alt+L, Ctrl+Alt+H, Ctrl+Alt+T | ghi lại phản ứng của cả thanh phụ đề lẫn app họp. Trên macOS phím tắt đăng ký không độc quyền: đăng ký vẫn thành công dù app khác (ví dụ Rectangle, Magnet) đang giữ tổ hợp đó, nên chỉ thử tay mới thấy trùng |

- [ ] **Step 2: Ghi `bench/phase0/results/s5_overlay.md`**: phiên bản macOS và các app, bảng trên với cột kết quả, ảnh chụp màn hình dòng 1 và 9 (lưu trong `bench/phase0/results/s5/`).

- [ ] **Step 3: Commit**

```bash
git add bench/phase0/results/s5_overlay.md bench/phase0/results/s5
git commit -m "test(bench): S5 thanh phụ đề trên macOS"
```

### Task 4: S5, ma trận thử trên Windows

Máy: laptop Windows 11 đã làm Task 2 của kế hoạch 01. Thêm Windows 10 nếu có.

- [ ] **Step 1: Cài và chạy** (PowerShell)

```powershell
pnpm install
pnpm tauri dev
```
Expected: như Task 2, Step 9. WebView2 đã có sẵn trên Windows 10/11 bản mới.

- [ ] **Step 2: Chạy từng dòng và điền cột kết quả**

| # | Tình huống | Đạt khi |
|---|---|---|
| 1 | Teams toàn màn hình (F11 hoặc nút phóng to cuộc họp) | thanh hiện trên Teams và vẫn cập nhật |
| 2 | Zoom toàn màn hình | như dòng 1 |
| 3 | Google Meet trên Chrome, rồi trên Edge, F11 | như dòng 1 ở cả hai trình duyệt |
| 3a | Cuộc gọi video Zalo PC, phóng to toàn màn hình | như dòng 1 |
| 4 | PowerPoint đang trình chiếu | ghi lại: thanh có hiện không |
| 5 | Video YouTube toàn màn hình | như dòng 1 |
| 6 | Đang gõ trong ô chat của Teams trong khi phụ đề cập nhật | chữ vẫn vào ô chat, thanh không lấy focus |
| 7 | Ctrl+Alt+L để khóa, rồi click xuyên qua thanh | click tới app bên dưới |
| 8 | Ctrl+Alt+H hai lần | ẩn rồi hiện lại, app họp không thoát toàn màn hình |
| 9 | Thanh tác vụ (taskbar) | không có nút cho thanh phụ đề |
| 10 | Màn hình scale 150% và hai màn hình | chữ nét, thanh không bị cắt; ghi lại hành vi khi kéo sang màn hình khác |
| 11 | Windows 10 (nếu có): lặp lại dòng 1, 6, 7 | như trên |
| 12 | Đang gõ trong ô chat của Teams, bấm Ctrl+Alt+L hoặc Ctrl+Alt+H rồi gõ tiếp | chữ vẫn vào Teams. Không đạt thì ghi lại: MVP phải gọi Win32 trực tiếp (`ShowWindow(SW_SHOWNA)`, `SetWindowLongPtrW`) |
| 13 | Phím tắt trùng (F10): lần lượt để Teams, Zoom, Meet active, bấm từng phím tắt | ghi lại phản ứng của cả hai app; nếu đăng ký phím tắt thất bại thì terminal in lỗi |

- [ ] **Step 3: Ghi kết quả Windows vào `bench/phase0/results/s5_overlay.md`** (thêm một mục riêng, ảnh chụp dòng 1 và 7), rồi commit

```powershell
git add bench/phase0/results/s5_overlay.md bench/phase0/results/s5
git commit -m "test(bench): S5 thanh phụ đề trên Windows"
```
