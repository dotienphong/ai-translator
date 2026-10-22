# Bong bóng chat 3D, viền nhấp nháy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay bong bóng mở chat tròn phẳng trên website bằng bong bóng thoại 3D xanh-ngọc có ba chấm, viền nhấp nháy rõ 15 giây đầu rồi dịu lại, rõ lại khi có trả lời mới, dừng khi khung mở, đứng yên khi người dùng chọn giảm chuyển động.

**Architecture:** Chỉ đổi phần HTML trong nút do `site.js` chèn và khối CSS bong bóng trong `site.css`; hiệu ứng là hai `@keyframes` đổi `box-shadow`, chọn bằng `aria-expanded` và `:has(.chat-dot:not([hidden]))`. Không script mới, CSP không đổi.

**Tech Stack:** JS thuần, CSS (`color-mix`, `:has`), test Node + Chrome không đầu (`website/tools/browser/cdp.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-23-bong-bong-chat-3d-design.md`.

**Quy tắc:** làm thẳng trên `main`; mọi lệnh bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/ai-translator &&`; kiểm `git branch --show-current` trước commit; chỉ `git add` đúng file; commit hai dòng `-m`, dòng hai `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Không deploy (chủ dự án duyệt ảnh trước). Không nhắc Zalo trong `website/src/assets/`.

**Mốc test** (`cd website && pnpm test`): 209 (207 đạt, 2 bỏ qua). Sau Task 1: 210 (208 đạt).

---

### Task 1: Bong bóng 3D và hiệu ứng viền

**Files:**
- Modify: `website/src/assets/site.js` (dòng tạo `.chat-root`)
- Modify: `website/src/assets/site.css` (khối "Chat hỗ trợ: bong bóng")
- Test: `website/test/chat-widget.test.mjs`

- [ ] **Step 1: Viết test hỏng**

Trong `website/test/chat-widget.test.mjs`, tìm:

```js
test("tắt JavaScript: không có bong bóng", { skip }, async () => {
```

thêm **ngay trước** dòng đó:

```js
test("bong bóng 3D (spec 2026-10-23): ba chấm thay biểu tượng cũ; viền nhấp nháy khi khung đóng, rõ lại khi có trả lời mới, dừng khi khung mở; giảm chuyển động thì đứng yên", { skip }, async () => {
  const anim = (p) => p.eval(`getComputedStyle(document.querySelector(".chat-bubble")).animationName`);
  const { p } = await freshPage("/");
  assert.deepEqual(
    await p.eval(`(() => { const b = document.querySelector(".chat-bubble"); return { dots: b.querySelectorAll(".chat-bubble-dots i").length, oldIcon: Boolean(b.querySelector("svg")) }; })()`),
    { dots: 3, oldIcon: false },
  );
  assert.equal(await anim(p), "chat-glow, chat-glow-soft");
  await p.eval(`document.querySelector(".chat-dot").hidden = false`);
  assert.equal(await anim(p), "chat-glow");
  await p.eval(`document.querySelector(".chat-dot").hidden = true`);
  await p.click(".chat-bubble");
  await until(p, `document.querySelector(".chat-bubble").getAttribute("aria-expanded") === "true"`);
  assert.equal(await anim(p), "none");
  assert.deepEqual(realErrors(p), []);
  await p.close();
  const { p: still } = await freshPage("/", { reduceMotion: true });
  assert.equal(await anim(still), "none");
  assert.match(await still.eval(`getComputedStyle(document.querySelector(".chat-bubble")).boxShadow`), /3px/);
  await still.close();
});

```

- [ ] **Step 2: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern 'bong bóng 3D' test/chat-widget.test.mjs 2>&1 | grep -E 'ℹ (pass|fail)|expected|actual' | head -6
```
Expected: `ℹ fail 1` (ba chấm `0`, còn `svg`).

- [ ] **Step 3: Đổi HTML của nút**

Trong `website/src/assets/site.js`, tìm:

```js
    wrap.innerHTML = '<button class="chat-bubble" type="button" aria-expanded="false" aria-controls="chat-panel"><svg class="icon" aria-hidden="true" focusable="false"><use href="#i-message"/></svg><span class="chat-dot" hidden></span></button>';
```

thay bằng:

```js
    wrap.innerHTML = '<button class="chat-bubble" type="button" aria-expanded="false" aria-controls="chat-panel"><span class="chat-bubble-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="chat-dot" hidden></span></button>';
```

- [ ] **Step 4: CSS bong bóng 3D**

Trong `website/src/assets/site.css`, tìm:

```css
.chat-bubble { position: relative; display: grid; place-items: center; width: 56px; height: 56px; padding: 0; border: 0; border-radius: 50%; background: var(--brand); color: var(--on-brand); box-shadow: var(--shadow-md); cursor: pointer; transition: transform .15s var(--ease), background .15s; }
.chat-bubble:hover { background: var(--brand-hover); transform: translateY(-1px); }
.chat-bubble .icon { width: 26px; height: 26px; }
.chat-dot { position: absolute; top: 2px; right: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--danger); box-shadow: 0 0 0 2px var(--bg); }
```

thay bằng:

```css
/* Bong bóng thoại 3D (spec 2026-10-23-bong-bong-chat-3d): gradient xanh sang ngọc, điểm sáng kính (::before), đuôi ở góc dưới phải
   (::after), ba chấm trắng. Viền ngọc nhấp nháy rõ 15 giây đầu (9 chu kỳ 1,6 giây) rồi dịu lại (chu kỳ 4 giây) mãi; có trả lời mới
   (chấm đỏ hiện) thì rõ lại; khung chat mở thì dừng; giảm chuyển động thì đứng yên với viền tĩnh. */
.chat-bubble {
  --chat-depth: 0 12px 24px -8px color-mix(in srgb, var(--brand) 60%, transparent), inset 0 -5px 10px rgba(0, 30, 60, .35), inset 0 2px 2px rgba(255, 255, 255, .5);
  --chat-glow: color-mix(in srgb, var(--accent) 50%, transparent);
  --chat-glow-soft: color-mix(in srgb, var(--accent) 28%, transparent);
  position: relative; display: grid; place-items: center; width: 64px; height: 56px; padding: 0; border: 0; border-radius: 22px 22px 10px 22px;
  background: linear-gradient(145deg, color-mix(in srgb, var(--brand) 70%, #fff) 0%, var(--brand) 45%, var(--accent) 100%);
  color: #fff; box-shadow: var(--chat-depth); cursor: pointer; transition: transform .15s var(--ease), filter .15s;
  animation: chat-glow 1.6s ease-in-out 9, chat-glow-soft 4s ease-in-out 14.4s infinite;
}
.chat-bubble::before { content: ""; position: absolute; left: 10px; top: 5px; width: 34px; height: 13px; border-radius: 50%; background: linear-gradient(180deg, rgba(255, 255, 255, .6), rgba(255, 255, 255, 0)); pointer-events: none; }
.chat-bubble::after { content: ""; position: absolute; right: 6px; bottom: -7px; width: 16px; height: 12px; background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 75%, var(--brand)), var(--accent)); clip-path: polygon(0 0, 100% 100%, 45% 0); pointer-events: none; }
.chat-bubble:hover { transform: translateY(-2px); filter: brightness(1.06); }
.chat-bubble[aria-expanded="true"] { animation: none; }
.chat-bubble:has(.chat-dot:not([hidden])):not([aria-expanded="true"]) { animation: chat-glow 1.6s ease-in-out infinite; }
.chat-bubble-dots { position: relative; display: flex; gap: 5px; }
.chat-bubble-dots i { width: 7px; height: 7px; border-radius: 50%; background: #fff; box-shadow: 0 1px 1px rgba(0, 0, 0, .25); }
.chat-dot { position: absolute; top: -4px; right: -4px; width: 15px; height: 15px; border-radius: 50%; background: var(--danger); box-shadow: 0 0 0 2px var(--bg), 0 2px 4px rgba(0, 0, 0, .3); }
@keyframes chat-glow { 0%, 100% { box-shadow: var(--chat-depth), 0 0 0 0 transparent; } 50% { box-shadow: var(--chat-depth), 0 0 0 6px var(--chat-glow); } }
@keyframes chat-glow-soft { 0%, 100% { box-shadow: var(--chat-depth), 0 0 0 0 transparent; } 50% { box-shadow: var(--chat-depth), 0 0 0 4px var(--chat-glow-soft); } }
@media (prefers-reduced-motion: reduce) {
  .chat-bubble, .chat-bubble:has(.chat-dot:not([hidden])):not([aria-expanded="true"]) { animation: none; box-shadow: var(--chat-depth), 0 0 0 3px var(--chat-glow); }
  .chat-bubble[aria-expanded="true"] { box-shadow: var(--chat-depth); }
}
```

- [ ] **Step 5: Chạy, thấy qua; cả bộ xanh**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern 'bong bóng 3D' test/chat-widget.test.mjs 2>&1 | grep -E 'ℹ (pass|fail)' && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)' && pnpm build 2>&1 | tail -1 && grep -ril zalo src/assets/ | wc -l
```
Expected: `ℹ pass 1`, `ℹ fail 0`; cả bộ `ℹ tests 210`, `ℹ pass 208`, `ℹ fail 0`, `ℹ skipped 2`; `Đã sinh 119 trang`; `0`. Nếu test cũ về vị trí (`right: 16, bottom: 16`) hay khoảng chân trang đỏ vì cỡ mới, sửa CSS (không sửa kỳ vọng vị trí) và ghi lại.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add website/src/assets/site.js website/src/assets/site.css website/test/chat-widget.test.mjs && git commit -m "feat(website): bong bóng chat 3D xanh-ngọc, viền nhấp nháy rồi dịu lại, rõ lại khi có trả lời" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Ảnh để chủ dự án duyệt

**Files:** không sửa file trong repo (ảnh ghi ra thư mục tạm).

- [ ] **Step 1: Chụp bốn ảnh** (máy tính sáng/tối, điện thoại 375 px sáng, có chấm đỏ) bằng một script tạm ngoài repo dùng `website/tools/browser/cdp.mjs` và `src/serve.mjs` trên bản build mới (`pnpm build` trước), chụp vùng góc dưới phải (khoảng 320×220 px quanh `.chat-root`) và cả trang ở điện thoại, lưu vào thư mục tạm, rồi gửi chủ dự án đường dẫn ảnh. Không deploy cho tới khi chủ dự án đồng ý.
