# Windows `.exe` Fallback Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm khối Cách 2 tải trực tiếp bộ cài `.exe` (`AI Translator_<version>_x64-setup.exe`) ngay bên dưới 3 bước PowerShell trên tab Windows của trang Tải xuống (5 ngôn ngữ), tự động cập nhật theo phiên bản phát hành mỗi khi chạy `pnpm deploy`.

**Architecture:** `website/src/release.mjs` sinh thông tin bộ cài Windows (`winInstallerOf(version)` gồm `file`, `url`, `sums`) từ `SITE.version` (vốn lấy từ `stable/latest.json` trên R2 và đối chiếu `SHA256SUMS-windows.txt` lúc `pnpm deploy`). `website/src/content/<lang>/download.mjs` hiển thị khối `.panel-alt` ngay dưới `.flow` của tab Windows kèm nút tải `.exe`, liên kết `SHA256SUMS-windows.txt` và hướng dẫn qua SmartScreen.

**Tech Stack:** Node.js (ESM), HTML/CSS tĩnh trong `website/`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-07-windows-exe-download-design.md`

## Global Constraints

- Không gọi mạng phía trình duyệt tới `releases.aitranslator.vn` (giữ nguyên CSP trong `website/src/build/build.mjs`).
- Giữ nguyên cấu trúc đồng bộ giữa `en` và `ja`/`zh`/`ko` theo `website/test/i18n-content.test.mjs` (cùng số thẻ `h2`/`h3`, cùng danh sách `id`, cùng danh sách `href`, cùng số câu FAQ, không có 5 từ Latin liên tiếp ngoài `<code>`).
- Giữ nguyên 3 bước PowerShell trong `.flow > li` ở đầu tab Windows để các kiểm thử trong `website/test/download-page.test.mjs` tiếp tục xanh.

## Review Focus

- Khoảng trắng trong tên file `AI Translator_<version>_x64-setup.exe` trên URL phải được mã hóa thành `%20` (`https://releases.aitranslator.vn/<version>/AI%20Translator_<version>_x64-setup.exe`), khớp với `scripts/release/check-site-pin.mjs` và `install.ps1`.
- Ở màn hình hẹp (320px), nút tải chứa tên file dài `AI Translator_0.6.10_x64-setup.exe` không được làm tràn ngang trang (`download-page.test.mjs`).
- Chữ trên nút tải ở các bản `ja`/`zh`/`ko` phải bọc tên file trong `<code>` để không vi phạm bài kiểm 5 từ Latin liên tiếp trong `i18n-content.test.mjs`.

---

### Task 1: Thêm `winInstallerOf(version)` vào `release.mjs` và `SITE.winInstaller` vào `site.mjs`

**Files:**
- Modify: `website/src/release.mjs:87-94`
- Modify: `website/src/site.mjs:3-22`
- Test: `website/test/release.test.mjs`

**Interfaces:**
- Produces: `winInstallerOf(version: string) -> { file: string, url: string, sums: string }` in `website/src/release.mjs`, `SITE.winInstaller` in `website/src/site.mjs`.

- [x] **Step 1: Write the failing test in `website/test/release.test.mjs`**

```js
test("winInstallerOf: trả tên file, URL tải .exe (%20 cho khoảng trắng) và URL SHA256SUMS-windows.txt của đúng phiên bản", () => {
  const w = winInstallerOf("1.2.3");
  assert.deepEqual(w, {
    file: "AI Translator_1.2.3_x64-setup.exe",
    url: `${RELEASES_URL}/1.2.3/AI%20Translator_1.2.3_x64-setup.exe`,
    sums: `${RELEASES_URL}/1.2.3/SHA256SUMS-windows.txt`,
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test website/test/release.test.mjs`
Expected: FAIL with `winInstallerOf` not exported.

- [x] **Step 3: Implement `winInstallerOf(version)` in `website/src/release.mjs` and expose `SITE.winInstaller` in `website/src/site.mjs`**

In `website/src/release.mjs`, define `export function winInstallerOf(version)` using `installerFiles(version).win` and replacing spaces with `%20` in `url`. In `website/src/site.mjs`, import `winInstallerOf` and set `winInstaller: winInstallerOf(release.version)` on `SITE`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test website/test/release.test.mjs`
Expected: PASS

---

### Task 2: Thêm khối Cách 2 tải `.exe` vào trang Tải xuống (5 ngôn ngữ) và CSS

**Files:**
- Modify: `website/src/assets/site.css`
- Modify: `website/src/content/vi/download.mjs`
- Modify: `website/src/content/en/download.mjs`
- Modify: `website/src/content/ja/download.mjs`
- Modify: `website/src/content/zh/download.mjs`
- Modify: `website/src/content/ko/download.mjs`
- Test: `website/test/download-page.test.mjs`, `website/test/i18n-content.test.mjs`, `website/test/site.test.mjs`

**Interfaces:**
- Consumes: `SITE.winInstaller` from `website/src/site.mjs`.

- [x] **Step 1: Add test assertions in `website/test/download-page.test.mjs`**

Verify that `#cai-windows` / `#install-windows` contains the `.panel-alt` secondary download block with `a[href="${SITE.winInstaller.url}"]` and `a[href="${SITE.winInstaller.sums}"]` matching the current version in `src-tauri/tauri.conf.json`.

- [x] **Step 2: Implement `.panel-alt` styles in `website/src/assets/site.css` and update `download.mjs` in `vi`, `en`, `ja`, `zh`, `ko`**

Add `.panel-alt` in `website/src/assets/site.css` (with responsive wrapping so `320px` screens never overflow horizontally) and add the secondary `.exe` download section and updated FAQ answers in `website/src/content/{vi,en,ja,zh,ko}/download.mjs`.

- [x] **Step 3: Run the website test suite**

Run: `pnpm -C website test`
Expected: PASS on all test files (`release.test.mjs`, `download-page.test.mjs`, `i18n-content.test.mjs`, `site.test.mjs`, etc.).
