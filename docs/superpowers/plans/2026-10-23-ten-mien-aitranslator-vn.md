# Tên miền chính thức aitranslator.vn: kế hoạch thực thi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi tên miền của hệ thống trong repo đổi từ `aitranslator.io.vn` sang `aitranslator.vn`; tên cũ chỉ còn ở các chỗ cố ý (chuyển hướng, chạy song song cho app cũ).

**Architecture:** Spec `docs/superpowers/specs/2026-10-23-ten-mien-aitranslator-vn-design.md`. Làm thẳng trên `main` (chủ dự án yêu cầu). Worker `mt-license` nhận cả hai tên `api.`; CORS chat nhận cả hai origin website; một Worker chuyển hướng mới (`website/src/redirect.mjs`) thay Worker www. Còn lại là thay chuỗi, có test khóa giá trị mới. Không deploy, không push, không đẩy tag trong kế hoạch này.

**Tech Stack:** Rust (Tauri), TypeScript (Hono trên Cloudflare Workers, vitest), Node `node:test` (website, scripts), wrangler 4.148.0.

**Quy ước:** mỗi lệnh shell bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/ai-translator &&` (Bash đặt lại thư mục sau mỗi lệnh). Kiểm `git branch --show-current` là `main` trước mỗi commit. Commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Server: CORS chat nhận origin mới và origin cũ

**Files:**
- Modify: `server/src/support/routes.ts:25-31`
- Test: `server/test/support-routes.test.ts:138-158`, `:333-345`

- [ ] **Step 1: Sửa test CORS thành hai origin.** Trong ca "CORS: preflight từ website được phép…", đổi `origin` thành `https://aitranslator.vn` và mọi `toBe("https://aitranslator.io.vn")` thành `toBe("https://aitranslator.vn")`; thêm cuối ca:

```ts
    // Origin cũ (aitranslator.io.vn) vẫn được trong khoảng giữa lần deploy server và lần deploy website (spec 2026-10-23 §2.4).
    const old = await w.call("GET", "/v1/support/status", undefined, { origin: "https://aitranslator.io.vn" });
    expect(old.headers.get("access-control-allow-origin")).toBe("https://aitranslator.io.vn");
```

Ca ở dòng 333–345 đổi origin sang `https://aitranslator.vn` tương tự.

- [ ] **Step 2: Chạy, phải đỏ.** `cd server && pnpm exec vitest run test/support-routes.test.ts` → FAIL (`access-control-allow-origin` là `null` với origin mới).

- [ ] **Step 3: Sửa mã.**

```ts
/** Origin được gọi từ trình duyệt: website. App gọi qua Rust, không có header Origin. Tên cũ `aitranslator.io.vn` chỉ để chat
 * không gãy trong vài phút giữa lần deploy server và lần deploy website; sau đó tên cũ chuyển hướng 301 nên không trang nào ở
 * origin đó còn tải được (spec 2026-10-23-ten-mien-aitranslator-vn §2.4). */
export const SUPPORT_ORIGINS = ["https://aitranslator.vn", "https://aitranslator.io.vn"];

/** CORS của `/v1/support/*`: chỉ origin của website; đặt trước mọi middleware có thể trả lỗi, để trình duyệt đọc được cả thân lỗi. */
export const supportCors = cors({
  origin: SUPPORT_ORIGINS,
```

- [ ] **Step 4: Chạy lại, phải xanh.** Cùng lệnh → PASS.

### Task 2: Server: cấu hình Worker, thư, Web Admin, fixture

**Files:**
- Modify: `server/wrangler.jsonc`, `server/wrangler.admin.jsonc`, `server/src/email/strings.ts`, `server/src/email/templates.ts`, `server/src/email/layout.ts`, `server/admin-ui/src/pages/ToolsPage.tsx`, `server/admin-ui/src/dev/Gallery.tsx`, `server/admin-ui/scripts/csp-check.mjs`, `server/admin-ui/dev/fake-api.ts`, `server/test/fixtures/creem/*.real.json`, `server/test/fixtures/creem/README.md`, `server/test/vectors/scrub-v1.json`
- Test: `server/test/node/wrangler-config.test.mjs:315-325`, `server/test/email.test.ts`, `server/test/admin-ops.test.ts`, `server/test/support-routes.test.ts`, `server/admin-ui/src/**/*.test.tsx`, `server/admin-ui/src/api/endpoints.test.ts`

- [ ] **Step 1: Test cấu hình trước.** Thay ca "tên miền riêng aitranslator.io.vn (spec 2026-10-06)…" bằng:

```js
test("tên miền aitranslator.vn (spec 2026-10-23): API nhận hai tên, email gửi, origin và tên miền của admin", () => {
  // Tên cũ chạy song song cho app ≤ 0.2.6 (license client không theo redirect); tên mới đứng đầu.
  assert.deepEqual(api.routes, [
    { pattern: "api.aitranslator.vn", custom_domain: true },
    { pattern: "api.aitranslator.io.vn", custom_domain: true },
  ]);
  for (const config of [api, admin]) {
    assert.equal(config.vars.EMAIL_FROM, "AI Translator <no-reply@mail.aitranslator.vn>");
    assert.equal(config.vars.EMAIL_REPLY_TO, "support@aitranslator.vn");
  }
  assert.equal(admin.vars.API_ORIGIN, `https://${api.routes[0].pattern}`);
  assert.equal(admin.vars.RELEASES_BASE_URL, "https://releases.aitranslator.vn");
  assert.deepEqual(admin.routes, [{ pattern: "admin.aitranslator.vn", custom_domain: true }], "tên cũ của admin do Worker chuyển hướng giữ");
  assert.equal(admin.workers_dev, false, "admin chỉ còn tên miền riêng, workers.dev tắt từ 2026-10-08");
  assert.equal(api.workers_dev, true, "giữ workers_dev tạm làm đường lui cho bản cài cũ");
});
```

Chạy `cd server && node --test test/node/wrangler-config.test.mjs` → FAIL.

- [ ] **Step 2: Sửa hai file wrangler.** `server/wrangler.jsonc`: `"routes": [{ "pattern": "api.aitranslator.vn", "custom_domain": true }, { "pattern": "api.aitranslator.io.vn", "custom_domain": true }]`, chú thích nói tên cũ giữ cho app ≤ 0.2.6; `EMAIL_FROM`, `EMAIL_REPLY_TO` mới. `server/wrangler.admin.jsonc`: route `admin.aitranslator.vn`, `API_ORIGIN`, `RELEASES_BASE_URL`, `EMAIL_FROM`, `EMAIL_REPLY_TO` mới; chú thích cập nhật. Chạy lại → PASS.

- [ ] **Step 3: Thay chuỗi ở phần còn lại của `server/`.**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && grep -rIl "aitranslator\.io\.vn" server --exclude-dir=node_modules --exclude-dir=dist \
  | grep -v -e "server/wrangler.jsonc" -e "server/src/support/routes.ts" -e "server/test/support-routes.test.ts" -e "server/test/node/wrangler-config.test.mjs" \
  | xargs sed -i '' 's/aitranslator\.io\.vn/aitranslator.vn/g'
```

README fixture Creem thêm câu: "Ngày 2026-10-23 chuỗi `success_url` đổi tên miền sang `api.aitranslator.vn` (spec 2026-10-23); test tự ký thân nên không ảnh hưởng chữ ký." Chú thích nói "tên miền riêng (spec 2026-10-06)" trong `wrangler.jsonc` sửa thành spec 2026-10-23.

- [ ] **Step 4: Kiểm.** `cd server && pnpm check` (typecheck, lint, vitest, node test) → mọi test xanh. `cd server/admin-ui && pnpm test && pnpm build` → xanh (CSP check chạy trong build nếu có).

- [ ] **Step 5: Commit** `feat(server): tên miền aitranslator.vn, API nhận cả tên cũ cho app đã cài`.

### Task 3: App: URL production, tên miền mở bằng trình duyệt, chuỗi hỗ trợ

**Files:**
- Modify: `src-tauri/src/license/client.rs:22`, `src-tauri/src/updater/source.rs:15`, `src-tauri/src/models/source.rs:21`, `src-tauri/src/navigation.rs:22-33,370-410`, `src-tauri/src/diagnostics/send.rs:240`, `src/i18n/{vi,en,ja,zh,ko}.ts`, `scripts/release/release-ready.mjs:73`
- Test: `src/windows/main/screens/SupportChat.test.ts:184`, `scripts/release/release-ready.test.mjs:60-90`, test trong các file Rust trên

- [ ] **Step 1: Test trước.** Đổi các test Rust (`navigation.rs` ca "Website của sản phẩm…": URL đúng `https://aitranslator.vn/`; danh sách bị chặn `http://aitranslator.vn/`, `https://www.aitranslator.vn/`, `https://admin.aitranslator.vn/`, `https://aitranslator.vn:8443/`, `https://aitranslator.vn.evil.example/`, `https://user@aitranslator.vn/`, `https://vn/`, **thêm** `https://aitranslator.io.vn/` (tên cũ không còn trong danh sách)), `diagnostics/send.rs:240` (`https://api.aitranslator.vn`), `SupportChat.test.ts:184`, `release-ready.test.mjs` (regex `aitranslator\.vn`, chuỗi `www.aitranslator.vn`). Chạy `cd src-tauri && cargo test --lib navigation diagnostics::send` → FAIL.

- [ ] **Step 2: Sửa mã.** Ba hằng `PRODUCTION_URL`; `EXTERNAL_HOSTS` là `"aitranslator.vn"` (chú thích: tên miền chính thức từ spec 2026-10-23; tên cũ chuyển hướng về đây nên không cần trong danh sách); chuỗi năm file i18n; `release-ready.mjs` kiểm `"aitranslator.vn"`:

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && sed -i '' 's/aitranslator\.io\.vn/aitranslator.vn/g; s/aitranslator\\\.io\\\.vn/aitranslator\\.vn/g' \
  src-tauri/src/license/client.rs src-tauri/src/updater/source.rs src-tauri/src/models/source.rs src-tauri/src/navigation.rs \
  src-tauri/src/diagnostics/send.rs src/i18n/vi.ts src/i18n/en.ts src/i18n/ja.ts src/i18n/zh.ts src/i18n/ko.ts \
  src/windows/main/screens/SupportChat.test.ts scripts/release/release-ready.mjs scripts/release/release-ready.test.mjs
```

rồi sửa tay `"https://io.vn/"` → `"https://vn/"` và thêm `"https://aitranslator.io.vn/"` vào danh sách bị chặn.

- [ ] **Step 3: Kiểm.** `cd src-tauri && cargo test --lib` → xanh; `pnpm exec vitest run` (gốc repo) → xanh; `node --test scripts/release/*.test.mjs` → xanh; `cd src-tauri && cargo clippy --all-targets -- -D warnings` → sạch.

- [ ] **Step 4: Commit** `feat(app): dùng tên miền aitranslator.vn cho license, cập nhật, model, liên kết và email hỗ trợ`.

### Task 4: Website: Worker chuyển hướng thay Worker www

**Files:**
- Create: `website/src/redirect.mjs`, `website/wrangler.redirect.jsonc`, `website/test/redirect.test.mjs`
- Delete: `website/src/www-redirect.mjs`, `website/wrangler.www.jsonc`
- Modify: `website/package.json` (script `deploy`), `website/wrangler.jsonc`

- [ ] **Step 1: Test.**

```js
// Worker chuyển hướng (spec 2026-10-23-ten-mien-aitranslator-vn §2.3): bốn tên → tên chính thức, 301, giữ đường dẫn và query.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker, { TARGETS } from "../src/redirect.mjs";

const go = (url, method = "GET") => worker.fetch(new Request(url, { method }));

test("tên cũ và www về aitranslator.vn, giữ đường dẫn và query, mọi phương thức", async () => {
  for (const host of ["aitranslator.io.vn", "www.aitranslator.io.vn", "www.aitranslator.vn"]) {
    for (const method of ["GET", "HEAD", "POST"]) {
      const r = await go(`https://${host}/tai-xuong/?a=1&b=2`, method);
      assert.equal(r.status, 301, `${method} ${host}`);
      assert.equal(r.headers.get("location"), "https://aitranslator.vn/tai-xuong/?a=1&b=2");
      assert.equal(r.headers.get("cache-control"), "public, max-age=3600");
    }
  }
  assert.equal((await go("https://aitranslator.io.vn/install.sh")).headers.get("location"), "https://aitranslator.vn/install.sh");
  assert.equal((await go("http://aitranslator.io.vn")).headers.get("location"), "https://aitranslator.vn/");
});

test("admin cũ về admin.aitranslator.vn", async () => {
  const r = await go("https://admin.aitranslator.io.vn/orders?q=1");
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "https://admin.aitranslator.vn/orders?q=1");
});

test("tên lạ trả 404, không chuyển hướng mở", async () => {
  for (const url of ["https://evil.example/x", "https://api.aitranslator.io.vn/v1/health", "https://aitranslator.vn/"]) {
    const r = await go(url);
    assert.equal(r.status, 404, url);
    assert.equal(r.headers.get("location"), null);
  }
});

test("cấu hình wrangler gắn đúng bốn tên của bảng, và site chỉ còn tên chính thức", async () => {
  const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");
  const redirect = JSON.parse(strip(await readFile(new URL("../wrangler.redirect.jsonc", import.meta.url), "utf8")));
  const site = JSON.parse(strip(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8")));
  assert.deepEqual(redirect.routes.map((r) => r.pattern).sort(), Object.keys(TARGETS).sort());
  assert.ok(redirect.routes.every((r) => r.custom_domain === true));
  assert.equal(redirect.workers_dev, false);
  assert.deepEqual(site.routes, [{ pattern: "aitranslator.vn", custom_domain: true }]);
});
```

Chạy `cd website && node --test test/redirect.test.mjs` → FAIL (không có module).

- [ ] **Step 2: Mã.** `website/src/redirect.mjs`:

```js
// Chuyển hướng về tên miền chính thức (spec 2026-10-23-ten-mien-aitranslator-vn §2.3): www và tên miền cũ aitranslator.io.vn.
// 301 vĩnh viễn cho mọi phương thức, giữ đường dẫn và query. Tên không có trong bảng trả 404 (không thành máy chuyển hướng mở).
// api. và releases. của tên cũ KHÔNG ở đây: chúng vẫn chạy song song cho app ≤ 0.2.6.
export const TARGETS = {
  "www.aitranslator.vn": "https://aitranslator.vn",
  "aitranslator.io.vn": "https://aitranslator.vn",
  "www.aitranslator.io.vn": "https://aitranslator.vn",
  "admin.aitranslator.io.vn": "https://admin.aitranslator.vn",
};

export default {
  fetch(request) {
    const url = new URL(request.url);
    const target = Object.hasOwn(TARGETS, url.hostname) ? TARGETS[url.hostname] : null;
    if (!target) return new Response("Not found", { status: 404 });
    return new Response(null, {
      status: 301,
      headers: { location: `${target}${url.pathname}${url.search}`, "cache-control": "public, max-age=3600" },
    });
  },
};
```

`website/wrangler.redirect.jsonc`: `name` `ai-translator-redirect`, `main` `src/redirect.mjs`, `compatibility_date` `2026-09-26`, `workers_dev: false`, `preview_urls: false`, `routes` bốn tên `custom_domain: true`, chú thích nói cách wrangler chuyển tên từ Worker khác (spec §2.3) và xóa `ai-translator-www` sau lần đầu. `website/wrangler.jsonc`: route `aitranslator.vn`. `package.json` `deploy`: `node src/build/build.mjs --deploy && wrangler deploy && wrangler deploy -c wrangler.redirect.jsonc && node tools/indexnow.mjs`. `git rm website/src/www-redirect.mjs website/wrangler.www.jsonc`.

- [ ] **Step 3:** chạy lại → PASS.

### Task 5: Website: mã, script cài, nội dung năm ngôn ngữ, văn bản pháp lý

**Files:** mọi file trong `website/` còn `aitranslator.io.vn` (trừ `src/redirect.mjs`, `wrangler.redirect.jsonc`, `test/redirect.test.mjs`), `docs/legal/{eula,privacy}.{vi,en}.md`, `docs/legal/README.md`.

- [ ] **Step 1: Thay chuỗi.**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && grep -rIl "aitranslator\.io\.vn\|aitranslator\\\\\.io\\\\\.vn" website docs/legal --exclude-dir=node_modules --exclude-dir=dist \
  | grep -v -e "website/src/redirect.mjs" -e "website/wrangler.redirect.jsonc" -e "website/test/redirect.test.mjs" \
  | xargs sed -i '' 's/aitranslator\.io\.vn/aitranslator.vn/g; s/aitranslator\\\.io\\\.vn/aitranslator\\.vn/g'
```

- [ ] **Step 2: Văn bản pháp lý lên phiên bản.** EULA: `**Phiên bản 1.4, hiệu lực từ 23/10/2026.**` / `**Version 1.4, effective 23 October 2026. …**`. Chính sách: 1.7 cùng ngày. Chính sách mục 4 thêm sau danh sách (vi): "Các bản ứng dụng trước 0.2.7 kết nối tới cùng các máy chủ trên dưới tên miền cũ `aitranslator.io.vn` của chúng tôi; website ở tên cũ tự chuyển sang `aitranslator.vn`." (en: "App versions before 0.2.7 connect to the same servers under our former domain `aitranslator.io.vn`; the website at the former domain redirects to `aitranslator.vn`."). `docs/legal/README.md`: dòng đầu (EULA 1.4, chính sách 1.7, 2026-10-23), đoạn mới "EULA 1.4 và chính sách 1.7 đổi tên miền…" theo spec 2026-10-23, mục "Đổi ngày hiệu lực" thêm "Với EULA 1.4 và chính sách 1.7, ở kế hoạch `2026-10-23-ten-mien-aitranslator-vn.md`".

- [ ] **Step 3: Ảnh OG.** `cd website && node tools/og/render.mjs contact` (tên nhóm của ảnh Liên hệ trong `SET`) → ghi lại `src/assets/og/contact*.png`; xem ảnh bằng Read để chắc chữ `support@aitranslator.vn`.

- [ ] **Step 4: Ảnh chụp app.** Tìm cảnh có thể hiện tên miền: `grep -n "support\|legal\|about" scripts/ui-preview/shoot.mjs website/src/assets/img/app/manifest.json`. Xem từng ảnh nghi ngờ bằng Read; ảnh nào có chữ tên miền thì chụp lại theo `website/README.md` (Vite cổng 1430, `node scripts/ui-preview/shoot.mjs <tên>`).

- [ ] **Step 5: Kiểm.** `cd website && pnpm test` → xanh (gồm test sitemap, CSP `connect-src 'self' https://api.aitranslator.vn`, hreflang, llms.txt, install script). `pnpm exec vitest run src/lib` (gốc repo, test văn bản pháp lý của app) → xanh.

- [ ] **Step 6: Commit** `feat(website,legal): tên miền aitranslator.vn, Worker chuyển hướng tên cũ, EULA 1.4 và chính sách 1.7`.

### Task 6: Quay lại năm video giới thiệu

**Files:** `scripts/demo-video/script*.json`, `website/src/assets/video/ai-translator-demo.{vi,en,ja,zh,ko}.{mp4,webp}`

- [ ] **Step 1:** `sed -i '' 's/aitranslator\.io\.vn/aitranslator.vn/g' scripts/demo-video/script*.json`.
- [ ] **Step 2:** Xem `docs/superpowers/plans/2026-10-21-demo-video-desktop.md` và `2026-10-22-website-ja-zh-ko-02-anh.md` để biết kịch bản nào ra file nào của website và cách sinh poster `.webp`. Chạy trang xem trước cổng 1432 (`node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1432`, chạy nền), rồi `node scripts/demo-video/render.mjs --script desktop.<lang>` cho từng ngôn ngữ website đang dùng.
- [ ] **Step 3:** Mở `target/demo-video/checks.<kịch bản>.json` (mọi kiểm `ok`); trích khung cuối bằng `ffmpeg -sseof -1 -i <mp4> -frames:v 1 <png>` và xem bằng Read: chữ `aitranslator.vn`. Chép mp4 và poster vào `website/src/assets/video/` theo đúng tên cũ. Tắt Vite.
- [ ] **Step 4:** `cd website && pnpm test` (test `video-facade` kiểm kích thước, poster) → xanh. Commit `chore(video): quay lại video giới thiệu với tên miền aitranslator.vn`.

### Task 7: Script, tài liệu, kết quả đo

**Files:** `scripts/models/*.mjs`, `bench/**`, `docs/**`, `README.md`, `CLAUDE.md`, đổi tên `bench/phase1/results/acceptance/a7-mac-aitranslator-io-vn.{md,json}`.

- [ ] **Step 1: Đổi tên file đo A7.** `git mv` hai file sang `a7-mac-aitranslator-vn.{md,json}`.
- [ ] **Step 2: Thay chuỗi** ở mọi file còn lại, trừ spec và kế hoạch này:

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git grep -lI -e "aitranslator\.io\.vn" -e 'aitranslator\\\.io\\\.vn' -e "aitranslator-io-vn" -- . \
  ':!docs/superpowers/specs/2026-10-23-ten-mien-aitranslator-vn-design.md' ':!docs/superpowers/plans/2026-10-23-ten-mien-aitranslator-vn.md' \
  ':!website/src/redirect.mjs' ':!website/wrangler.redirect.jsonc' ':!website/test/redirect.test.mjs' \
  ':!server/wrangler.jsonc' ':!server/src/support/routes.ts' ':!server/test/support-routes.test.ts' ':!server/test/node/wrangler-config.test.mjs' \
  ':!src-tauri/src/navigation.rs' ':!docs/legal/privacy.vi.md' ':!docs/legal/privacy.en.md' \
  | xargs sed -i '' 's/aitranslator\.io\.vn/aitranslator.vn/g; s/aitranslator\\\.io\\\.vn/aitranslator\\.vn/g; s/aitranslator-io-vn/aitranslator-vn/g'
```

- [ ] **Step 3: Tài liệu đang dùng.** `CLAUDE.md`: dòng Website ghi `aitranslator.vn` và thêm "tên cũ `aitranslator.io.vn` chuyển hướng 301; `api.`, `releases.` của tên cũ chạy song song cho app ≤ 0.2.6 (spec 2026-10-23)". `website/README.md`: bảng lệnh `pnpm deploy` nói Worker `ai-translator-redirect`. `docs/release/phat-hanh.md`: thêm mục "Chuyển sang `aitranslator.vn`" với các bước của spec §3 (lệnh cụ thể: `wrangler r2 bucket domain add ai-translator-releases --domain releases.aitranslator.vn --zone-id <ID>`, `wrangler secret put OPERATOR_EMAIL`, `curl` nghiệm thu của spec §4), và mục 6 (bảng tên miền) ghi tên mới cộng hàng "tên cũ".
- [ ] **Step 4: Kiểm.** `node --test scripts/models/*.test.mjs scripts/release/*.test.mjs` → xanh. Commit `docs: tên miền aitranslator.vn ở mọi tài liệu, kết quả đo và runbook chuyển tên miền`.

### Task 8: Kiểm cuối

- [ ] **Step 1: grep.** `git grep -n -e "aitranslator\.io\.vn" -e 'aitranslator\\\.io\\\.vn' -e "aitranslator-io-vn"`: chỉ còn các file ở spec §2.8 (spec, kế hoạch này, runbook mục chuyển, `CLAUDE.md`, Worker chuyển hướng và test, `server/wrangler.jsonc` và test, CORS và test, `navigation.rs` ca chặn tên cũ, chính sách mục 4, README văn bản pháp lý nếu nhắc đoạn đó).
- [ ] **Step 2: Toàn bộ test.** `cd server && pnpm check`; `cd server/admin-ui && pnpm test`; `pnpm exec vitest run` (gốc); `cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings`; `cd website && pnpm test`; `node --test scripts/**/*.test.mjs`; `pnpm check-i18n` nếu có. Mọi lệnh xanh.
- [ ] **Step 3: Build website** `cd website && pnpm build` rồi `grep -rl "aitranslator\.io\.vn" dist/` chỉ còn trang chính sách quyền riêng tư (câu mục 4).
