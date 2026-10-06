# Chuyển sang tên miền `aitranslator.io.vn` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Task 3 đến 9 và một phần Task 11, 12 là việc của **chủ dự án** (Dashboard, `sudo`, tiền thật); agent chỉ soạn lệnh, hướng dẫn và kiểm kết quả bằng lệnh.

**Goal:** Đưa license server, nguồn cập nhật, model và email của AI Translator sang tên miền riêng `aitranslator.io.vn` (`api.`, `releases.`, `mail.`, `support@`), rồi đổi ba URL nhúng cứng trong app, trước khi phát bản beta cho người khác.

**Architecture:** Hạ tầng dựng và kiểm xong trước (app cũ và `workers.dev`, `r2.dev` vẫn chạy làm đường lui); chỉ khi mọi kiểm tra qua tên mới đạt mới đổi code app. Code chạm tới: Worker API (`custom_domain`, `reply_to`), cấu hình hai Worker, ba hằng `PRODUCTION_URL` của app, danh sách A7, tài liệu. Admin giữ `workers.dev`.

**Tech Stack:** Cloudflare (zone, Workers custom domain, R2 custom domain, Email Routing, WAF), Resend, PayOS, wrangler, Rust (app), TypeScript + vitest (server), Node `node:test`, Python `unittest` (A7).

Spec: `docs/superpowers/specs/2026-10-06-custom-domain-design.md`. Lệnh chạy từ gốc repo trừ khi ghi `cd server`. **Không push, không `wrangler deploy` ở Task 1 và 2.**

## Cấu trúc file

| File | Thay đổi | Task |
|---|---|---|
| `server/src/email/resend.ts` | `ResendConfig.replyTo`, gửi `reply_to` | 1 |
| `server/src/env.ts` | `EMAIL_REPLY_TO?` ở `ApiEnv` và `AdminEnv` | 1 |
| `server/src/deps.ts`, `server/src/admin-entry.ts` | truyền `replyTo` | 1 |
| `server/test/email.test.ts` | test `reply_to` | 1 |
| `server/wrangler.jsonc` | `routes` custom domain, `EMAIL_FROM`, `EMAIL_REPLY_TO` | 2 |
| `server/wrangler.admin.jsonc` | `API_ORIGIN`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | 2 |
| `server/test/node/wrangler-config.test.mjs` | khóa các giá trị trên | 2 |
| `src-tauri/src/license/client.rs`, `updater/source.rs`, `models/source.rs` | ba `PRODUCTION_URL` | 10 |
| `bench/phase1/results/acceptance/a7-allow.json` | hai máy chủ mới | 11 |
| `docs/release/phat-hanh.md` | mục 6 về tên miền | 11 |

## Thứ tự và cổng

`1 → 2` (code, làm ngay) · `3 → 4 → 5 → 6 → 7 → 8 → 9` (hạ tầng; **Task 3 phải xong trước mọi thứ**) · cổng: Task 9 đạt · `10 → 11 → 12 → 13` (đổi app). Chưa qua cổng thì không đụng ba hằng URL của app.

---

### Task 1: Email gửi kèm `Reply-To` (TDD)

**Files:**
- Modify: `server/src/email/resend.ts`, `server/src/env.ts`, `server/src/deps.ts`, `server/src/admin-entry.ts`
- Test: `server/test/email.test.ts`

Lý do: thư gửi từ `no-reply@mail.aitranslator.io.vn` không nhận thư; khách trả lời phải về `support@aitranslator.io.vn`.

- [ ] **Step 1: Viết test lỗi**

Trong `server/test/email.test.ts`, ngay sau test `"gửi đúng endpoint, header, idempotency key"` (kết thúc ở dòng `});` sau `expect(JSON.parse(init.body as string)).toEqual({...})`), thêm:

```ts
  it("có replyTo thì gửi thêm reply_to, không có thì không gửi trường đó", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = async (_url: string, init: RequestInit = {}) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response("{}");
    };
    const message = { to: "b@mt.test", subject: "S", text: "T" };
    await new ResendEmailProvider({ apiKey: "re_test", from: "a@mt.test", replyTo: "support@mt.test" }, fetchFn).send(message);
    await new ResendEmailProvider({ apiKey: "re_test", from: "a@mt.test" }, fetchFn).send(message);
    expect(bodies[0]).toEqual({ from: "a@mt.test", to: ["b@mt.test"], subject: "S", text: "T", reply_to: "support@mt.test" });
    expect(bodies[1]).not.toHaveProperty("reply_to");
  });
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd server && pnpm exec vitest run test/email.test.ts 2>&1 | tail -15`
Expected: FAIL ở test mới (`bodies[0]` thiếu `reply_to`); các test cũ đạt.

- [ ] **Step 3: Cài đặt**

`server/src/email/resend.ts`: thêm trường vào `ResendConfig`:

```ts
export interface ResendConfig {
  apiKey: string;
  from: string;
  /** Địa chỉ nhận trả lời (Reply-To); thiếu thì thư không có Reply-To. `| undefined` vì tsconfig bật exactOptionalPropertyTypes. */
  replyTo?: string | undefined;
}
```

và trong `send`, thay dòng `body: JSON.stringify({ from: this.cfg.from, to: [message.to], subject: message.subject, text: message.text }),` bằng việc dựng body trước lời gọi `fetchFn`:

```ts
    const body: Record<string, unknown> = {
      from: this.cfg.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    };
    if (this.cfg.replyTo) body.reply_to = this.cfg.replyTo;
```

(đặt khối này ngay trên dòng `const res = await this.fetchFn(...)`) và trong lời gọi dùng `body: JSON.stringify(body),`.

`server/src/env.ts`: ở cả `ApiEnv` và `AdminEnv`, ngay dưới dòng `EMAIL_FROM: string;` thêm:

```ts
  /** Địa chỉ nhận trả lời của thư gửi khách (Reply-To). Không bắt buộc. */
  EMAIL_REPLY_TO?: string;
```

`server/src/deps.ts` và `server/src/admin-entry.ts`: thay `new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })` bằng:

```ts
new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO })
```

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd server && pnpm typecheck && pnpm exec vitest run test/email.test.ts 2>&1 | tail -8`
Expected: typecheck không lỗi; test email đạt (số test cũ cộng 1).

- [ ] **Step 5: Commit**

```bash
git add server/src/email/resend.ts server/src/env.ts server/src/deps.ts server/src/admin-entry.ts server/test/email.test.ts
git commit -m "feat(server): thư gửi khách có Reply-To (EMAIL_REPLY_TO), để khách trả lời về support@

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cấu hình hai Worker cho tên miền riêng (chưa deploy)

**Files:**
- Modify: `server/wrangler.jsonc`, `server/wrangler.admin.jsonc`
- Test: `server/test/node/wrangler-config.test.mjs`

- [ ] **Step 1: Viết test lỗi**

Thêm vào cuối `server/test/node/wrangler-config.test.mjs`:

```js
test("tên miền riêng aitranslator.io.vn (spec 2026-10-06): route, email gửi và origin của Worker admin", () => {
  assert.deepEqual(api.routes, [{ pattern: "api.aitranslator.io.vn", custom_domain: true }]);
  for (const config of [api, admin]) {
    assert.equal(config.vars.EMAIL_FROM, "AI Translator <no-reply@mail.aitranslator.io.vn>");
    assert.equal(config.vars.EMAIL_REPLY_TO, "support@aitranslator.io.vn");
  }
  assert.equal(admin.vars.API_ORIGIN, `https://${api.routes[0].pattern}`);
  assert.equal("routes" in admin, false, "admin giữ workers.dev, không có route (spec 2026-10-06, mục 3)");
  assert.equal(api.workers_dev, true, "giữ workers_dev tạm làm đường lui cho bản cài cũ");
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd server && pnpm test:scripts 2>&1 | tail -12`
Expected: FAIL ở test mới (`api.routes` chưa có).

- [ ] **Step 3: Sửa `server/wrangler.jsonc`**

Thay hai dòng:

```jsonc
  // Chưa có tên miền đã xác thực (spec §15, Q1): dùng *.workers.dev. Có tên miền thì đổi sang route riêng và tắt workers_dev.
  "workers_dev": true,
```

bằng:

```jsonc
  // Tên miền riêng (spec 2026-10-06): Worker phục vụ api.aitranslator.io.vn. Giữ workers_dev tạm làm đường lui cho bản cài
  // cũ; tắt khi không còn bản cài nào dùng URL workers.dev.
  "workers_dev": true,
  "routes": [{ "pattern": "api.aitranslator.io.vn", "custom_domain": true }],
```

Thay hai dòng:

```jsonc
    // Đổi sang địa chỉ trên tên miền đã xác thực SPF, DKIM khi có Q1: Resend chỉ gửi được tới email của chủ tài khoản Resend.
    "EMAIL_FROM": "AI Translator <onboarding@resend.dev>",
```

bằng:

```jsonc
    // Tên miền gửi mail.aitranslator.io.vn đã xác thực ở Resend (SPF, DKIM); khách trả lời thư thì về EMAIL_REPLY_TO.
    "EMAIL_FROM": "AI Translator <no-reply@mail.aitranslator.io.vn>",
    "EMAIL_REPLY_TO": "support@aitranslator.io.vn",
```

- [ ] **Step 4: Sửa `server/wrangler.admin.jsonc`**

Thay `"EMAIL_FROM": "AI Translator <onboarding@resend.dev>",` bằng:

```jsonc
    "EMAIL_FROM": "AI Translator <no-reply@mail.aitranslator.io.vn>",
    "EMAIL_REPLY_TO": "support@aitranslator.io.vn",
```

và `"API_ORIGIN": "https://mt-license.dotienphong1993.workers.dev"` bằng `"API_ORIGIN": "https://api.aitranslator.io.vn"`; sửa dòng chú thích ngay trên `API_ORIGIN` thành `// Origin của Worker API (tên miền riêng, spec 2026-10-06); confirm-webhook chỉ nhận URL trên origin này.`

- [ ] **Step 5: Chạy, thấy đạt**

Run: `cd server && pnpm test:scripts 2>&1 | tail -8`
Expected: PASS.

Run: `cd server && pnpm check 2>&1 | tail -15`
Expected: `typecheck`, `vectors:check`, `test`, `test:scripts` và `dry-run` đều xanh. (Nếu `vitest` than phiền về `routes` hay `custom_domain` khi đọc `wrangler.jsonc`, báo lại nguyên lỗi; không bỏ route.)

- [ ] **Step 6: Commit**

```bash
git add server/wrangler.jsonc server/wrangler.admin.jsonc server/test/node/wrangler-config.test.mjs
git commit -m "feat(server): cấu hình tên miền riêng api.aitranslator.io.vn, email gửi từ mail. kèm Reply-To support@, admin trỏ API_ORIGIN mới (chưa deploy)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Bước 0: đưa tên miền vào Cloudflare (chủ dự án)

Hiện `aitranslator.io.vn` chưa được ủy quyền (máy chủ `.vn` trả `NXDOMAIN`). Mọi task sau cần zone này ở trạng thái **Active**.

- [ ] **Step 1: Hoàn tất đăng ký.** Ở nơi bạn mua tên miền: trạng thái hoạt động, đã xác minh danh tính với `.vn` nếu được yêu cầu.
- [ ] **Step 2: Thêm vào Cloudflare.** Dashboard Cloudflare (tài khoản đang dùng cho sản phẩm) › **Add a domain** › nhập `aitranslator.io.vn` › chọn gói **Free** › Continue (bỏ qua bản ghi DNS quét được nếu không có gì quan trọng). Ghi lại **hai nameserver** Cloudflare đưa.
- [ ] **Step 3: Đặt nameserver ở nhà đăng ký.** Thay toàn bộ nameserver hiện có bằng hai nameserver trên.
- [ ] **Step 4: Chờ và kiểm.** Chờ (vài phút đến vài giờ). Rồi:

  ```bash
  dig +short NS aitranslator.io.vn
  ```

  Expected: hai nameserver `*.ns.cloudflare.com`. Trên Cloudflare, trang Overview của zone báo **Active**.
- [ ] **Step 5: Ghi Zone ID** (cột phải của trang Overview; không bí mật) để dùng ở Task 7 nếu chọn cách dùng lệnh.
- [ ] **Step 6: Bật HTTPS.** SSL/TLS › Edge Certificates: **Always Use HTTPS** bật; **Minimum TLS Version** `TLS 1.2`.

Cổng: zone **Active** thì mới làm Task 4 trở đi.

---

### Task 4: Email Routing và `support@` (chủ dự án)

- [ ] **Step 1:** Cloudflare › zone `aitranslator.io.vn` › **Email** › **Email Routing** › **Get started**. Tạo địa chỉ `support`, đích là Gmail của bạn; mở thư xác nhận Cloudflare gửi tới Gmail và bấm xác thực. Bấm **Add records and enable** (Cloudflare tự thêm MX và SPF ở gốc).
- [ ] **Step 2: Kiểm DNS.**

  ```bash
  dig +short MX aitranslator.io.vn
  dig +short TXT aitranslator.io.vn
  ```

  Expected: ba bản ghi MX `route1.mx.cloudflare.net`, `route2…`, `route3…`; TXT chứa `v=spf1 include:_spf.mx.cloudflare.net ~all`.
- [ ] **Step 3: Kiểm thư.** Từ một hộp thư khác (không phải Gmail đích) gửi thư tới `support@aitranslator.io.vn`. Expected: thư tới Gmail đích trong vài phút (xem cả mục Spam).

---

### Task 5: Resend xác thực `mail.aitranslator.io.vn` và DMARC (chủ dự án)

- [ ] **Step 1:** Resend › **Domains** › **Add Domain**: `mail.aitranslator.io.vn`, vùng gửi gần Việt Nam nếu có (Singapore hoặc Tokyo). Resend liệt kê các bản ghi DNS (DKIM, SPF, MX cho bounce).
- [ ] **Step 2: Thêm bản ghi.** Dùng nút kết nối Cloudflare của Resend, hoặc thêm tay ở Cloudflare › DNS đúng như Resend liệt kê. Mọi bản ghi để **DNS only** (đám mây xám), không proxy. Không sửa MX hay SPF ở gốc (của Email Routing).
- [ ] **Step 3:** Bấm **Verify** trong Resend. Expected: domain **Verified** (DKIM và SPF xanh). Có thể mất vài phút.
- [ ] **Step 4: DMARC.** Cloudflare › DNS › thêm bản ghi TXT: Name `_dmarc`, Content `v=DMARC1; p=none; rua=mailto:support@aitranslator.io.vn`. Kiểm:

  ```bash
  dig +short TXT _dmarc.aitranslator.io.vn
  ```

  Expected: in đúng chuỗi trên.
- [ ] **Step 5: Khóa API.** Kiểm khóa `RESEND_API_KEY` đang dùng không bị giới hạn vào một domain khác (Resend › API Keys). Nếu bị giới hạn, tạo khóa mới cho phép domain này và nạp lại bằng `cd server && pnpm exec wrangler secret put RESEND_API_KEY` và `pnpm exec wrangler secret put RESEND_API_KEY -c wrangler.admin.jsonc` (người làm tự nhập, không dán vào chat).

---

### Task 6: Deploy hai Worker và kiểm API qua tên mới (chủ dự án chạy, agent kiểm)

**Cần trước:** Task 1, 2 xong; Task 3, 5 đạt. Mọi lệnh trong `server/`, trên máy đã `wrangler login`.

- [ ] **Step 1: Kiểm toàn bộ trước khi deploy**

  ```bash
  cd server && pnpm check
  ```

  Expected: xanh.
- [ ] **Step 2: Deploy Worker API**

  ```bash
  pnpm exec wrangler deploy
  ```

  Expected: có `Uploaded mt-license` và dòng `api.aitranslator.io.vn (custom domain)`. Nếu báo không tìm thấy zone hay không có quyền: `pnpm exec wrangler whoami` (đúng tài khoản chứa zone) rồi `pnpm exec wrangler login` lại; Task 3 phải Active.
- [ ] **Step 3: Deploy Worker admin**

  ```bash
  pnpm exec wrangler deploy -c wrangler.admin.jsonc
  ```

  Expected: `Uploaded mt-license-admin`, URL vẫn là `mt-license-admin.dotienphong1993.workers.dev`.
- [ ] **Step 4: Kiểm API (chứng chỉ có thể mất tới vài phút lần đầu)**

  ```bash
  API=https://api.aitranslator.io.vn
  curl -s "$API/v1/health"; echo
  curl -sI "$API/v1/health" | head -3
  [ "$(curl -s $API/v1/plans | shasum)" = "$(curl -s https://mt-license.dotienphong1993.workers.dev/v1/plans | shasum)" ] && echo "plans giống workers.dev"
  ```

  Expected: `{"ok":true}`; `HTTP/2 200`; `plans giống workers.dev`.
- [ ] **Step 5: Kiểm email gửi tới địa chỉ ngoài tài khoản Resend.** Dùng một địa chỉ email thứ hai của bạn (không phải email chủ tài khoản Resend):

  ```bash
  PADMIN=https://mt-license-admin.dotienphong1993.workers.dev
  cloudflared access login "$PADMIN"
  cloudflared access curl "$PADMIN/admin/licenses" -X POST -H 'content-type: application/json' \
    -d '{"email":"<địa chỉ thứ hai>","plan":"pro","note":"kiểm email tên miền mới"}'; echo
  ```

  Expected: `201` kèm `license_id`. Thư tới hộp thư **đến** (không spam) trong vài phút. Ở Gmail › menu ba chấm › **Show original**: `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`, `From: AI Translator <no-reply@mail.aitranslator.io.vn>`, `Reply-To: support@aitranslator.io.vn`. Trả lời thử thư: thư tới `support@` về Gmail đích.
- [ ] **Step 6: Thu hồi license thử**

  ```bash
  cloudflared access curl "$PADMIN/admin/licenses/<license_id>/revoke" -X POST -H 'content-type: application/json' -d '{"note":"license thử email"}'; echo
  ```

  Expected: `{"ok":true}`.

---

### Task 7: R2 custom domain `releases.aitranslator.io.vn` (chủ dự án)

- [ ] **Step 1: Kết nối domain.** Dashboard Cloudflare › **R2** › bucket `ai-translator-releases` › **Settings** › **Custom Domains** › **Connect Domain** › `releases.aitranslator.io.vn` › Continue › Connect. Chờ trạng thái **Active**. (Cách khác, nếu có: `cd server && pnpm exec wrangler r2 bucket domain add ai-translator-releases --domain releases.aitranslator.io.vn --zone-id <ZONE_ID>`.) Giữ nguyên `r2.dev`.
- [ ] **Step 2: Kiểm từng file model qua hai URL (tên mới phải khớp `r2.dev`)**

Chạy từ gốc repo (đoạn Python dưới đây không thụt lề, chép nguyên khối):

```bash
OLD=https://pub-a4be034c8c474a36b893a65e8f0b8365.r2.dev/models
NEW=https://releases.aitranslator.io.vn/models
python3 - "$OLD" "$NEW" <<'PY'
import json, sys, urllib.request
old, new = sys.argv[1:3]
files = json.load(open("scripts/models/released/body-2.json"))["files"]
def head(url):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "curl/8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.headers.get("content-length")
bad = 0
for f in files:
    a, b = head(f"{old}/{f['url']}"), head(f"{new}/{f['url']}")
    ok = a == b and a[0] == 200
    bad += not ok
    print("OK  " if ok else "LỆCH", f["url"], a, b)
print("tất cả đạt" if not bad else f"{bad} file lệch")
sys.exit(1 if bad else 0)
PY
```

Expected: mọi dòng `OK`, cuối cùng `tất cả đạt` (10 file).

- [ ] **Step 3: Kiểm `Range` và manifest**

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -r 0-1023 https://releases.aitranslator.io.vn/models/hy-mt2/Hy-MT2-1.8B-Q4_K_M.gguf
  curl -s https://releases.aitranslator.io.vn/models/models.json | head -c 120; echo
  curl -sI https://releases.aitranslator.io.vn/models/models.json | grep -i -E "^(cache-control|cf-cache-status|content-type)"
  ```

  Expected: `206`; đầu của phong bì manifest (`{"format":"ai-translator-models",…`); in ra `cache-control` (nếu có) và `cf-cache-status`. Ghi lại giá trị: manifest và `latest.json` không được bị cache lâu (manifest đăng bằng `publish-release.mjs` đặt `Cache-Control: no-cache`; riêng `models.json` hiện đăng bằng `rclone`, nếu thấy `cf-cache-status: HIT` ngay sau khi vừa đổi nội dung thì đặt lại `Cache-Control: no-cache` khi đăng bản sau).

---

### Task 8: Luật WAF chặn spam webhook (chủ dự án)

Kế hoạch 05 Task 21 Step 9a chưa đặt được vì `workers.dev` không phải zone. Giờ có zone riêng.

- [ ] **Step 1: Tạo luật.** Cloudflare › zone `aitranslator.io.vn` › **Security** › **Security rules** (hoặc **WAF** › tab **Rate limiting rules**) › **Create rule** › **Rate limiting rules**:
  - **Rule name:** `webhook-rate-limit`.
  - **If incoming requests match:** Field `URI Path`, Operator `starts with`, Value `/v1/webhooks/` (nếu gói Free không cho `starts with`, dùng `equals` với `/v1/webhooks/payos`).
  - **With the same characteristics:** `IP`. **When rate exceeds:** Requests `5`, Period `10 seconds`.
  - **Then take action:** `Block`; response type `Custom JSON`, code `429`, body `{"error":"rate_limited"}` (gói Free không chọn được thì để mặc định). **For duration:** `10 seconds`.
  - **Deploy.** Gói Free chỉ có một luật rate limit mỗi zone; luật này dùng hết suất đó.
- [ ] **Step 2: Thử**

  ```bash
  API=https://api.aitranslator.io.vn
  for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -w '%{http_code} ' -X POST "$API/v1/webhooks/payos" -H 'content-type: application/json' -d '{"data":{},"signature":"x"}'; done; echo
  ```

  Expected: năm số `400` rồi `429`. Chờ 10 giây, rồi `curl -s "$API/v1/health"` vẫn in `{"ok":true}` (luật chỉ áp cho đường webhook). Năm request đầu tạo cảnh báo `webhook_bad_signature (5)` trong log: đây là thử, không phải sự cố.

---

### Task 9: PayOS đăng ký lại webhook và giao dịch thật nhỏ qua tên mới (chủ dự án)

Đây là **cổng** trước khi đổi app: kiểm cả đường thanh toán, webhook, email và trang chuyển về, qua tên mới, không qua app.

- [ ] **Step 1: Đăng ký lại webhook**

  ```bash
  PADMIN=https://mt-license-admin.dotienphong1993.workers.dev
  API=https://api.aitranslator.io.vn
  cloudflared access login "$PADMIN"
  cloudflared access curl "$PADMIN/admin/payos/confirm-webhook" -X POST -H 'content-type: application/json' \
    -d "{\"webhook_url\":\"$API/v1/webhooks/payos\"}"; echo
  ```

  Expected: `{"ok":true,"webhook_url":"https://api.aitranslator.io.vn/v1/webhooks/payos"}`, và kênh trên my.payos.vn hiện đúng Webhook URL mới. Nếu lỗi vì URL ngoài origin cho phép: Task 6 Step 3 chưa deploy admin.
- [ ] **Step 2: Cấu hình kênh PayOS.** Trong my.payos.vn, nếu kênh có trường tên miền hay website thì đặt `https://aitranslator.io.vn`.
- [ ] **Step 3: Tạo đơn qua API.** Dùng một email **không phải** chủ tài khoản Resend:

  ```bash
  curl -s "$API/v1/checkout" -X POST -H 'content-type: application/json' \
    -d '{"plan":"pro","email":"<địa chỉ thứ hai>","consent":true}' > /tmp/at-order.json; python3 -c "import json;d=json.load(open('/tmp/at-order.json'));print(d['order_code'], d['amount'], d['checkout_url'])"
  ```

  Expected: mã đơn, `50000`, một URL `pay.payos.vn/...`. Mở URL đó trên trình duyệt, trả 50 000 đ bằng VietQR qua app ngân hàng.
- [ ] **Step 4: Kiểm trạng thái đơn**

  ```bash
  CODE=$(python3 -c "import json;print(json.load(open('/tmp/at-order.json'))['order_code'])")
  TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/at-order.json'))['order_token'])")
  curl -s "$API/v1/orders/$CODE" -H "authorization: Bearer $TOKEN"; echo
  ```

  Expected (sau khi trả tiền, vài giây): `"status":"paid"`, có `license_key`. Trình duyệt sau khi trả được PayOS chuyển về `https://api.aitranslator.io.vn/v1/pay/return` (trang có thương hiệu, không phải lỗi).
- [ ] **Step 5: Kiểm email.** Thư chứa key tới địa chỉ thứ hai, vào hộp thư **đến**, `SPF/DKIM/DMARC: PASS`, `Reply-To: support@aitranslator.io.vn`.
- [ ] **Step 6: Giữ key cho Task 12**, rồi xóa tệp tạm: `rm -f /tmp/at-order.json`. Chủ dự án tự hoàn tiền tay như các đơn thử trước.

**Cổng:** Task 6 (Step 4 và 5), 7, 8 và 9 đều đạt thì mới làm Task 10.

---

### Task 10: Đổi ba URL trong app

**Files:**
- Modify: `src-tauri/src/license/client.rs`, `src-tauri/src/updater/source.rs`, `src-tauri/src/models/source.rs`

- [ ] **Step 1: Sửa `license/client.rs`.** Thay:

```rust
/// Địa chỉ license server production (Worker `mt-license`, triển khai 2026-10-05; đổi sang tên miền riêng khi có T7). Để `None` thì app
/// chỉ dùng được token đã lưu và gói Free.
pub const PRODUCTION_URL: Option<&str> = Some("https://mt-license.dotienphong1993.workers.dev");
```

bằng:

```rust
/// Địa chỉ license server production (Worker `mt-license` trên tên miền riêng, spec 2026-10-06). Để `None` thì app
/// chỉ dùng được token đã lưu và gói Free.
pub const PRODUCTION_URL: Option<&str> = Some("https://api.aitranslator.io.vn");
```

- [ ] **Step 2: Sửa `updater/source.rs`.** Thay hai dòng:

```rust
/// URL gốc production: Task 12 của kế hoạch 07b điền khi có tên miền (T7) hay URL công khai của bucket production.
pub const PRODUCTION_URL: Option<&str> = Some("https://pub-a4be034c8c474a36b893a65e8f0b8365.r2.dev");
```

bằng:

```rust
/// URL gốc production: bucket R2 `ai-translator-releases` trên tên miền riêng (spec 2026-10-06).
pub const PRODUCTION_URL: Option<&str> = Some("https://releases.aitranslator.io.vn");
```

- [ ] **Step 3: Sửa `models/source.rs`.** Thay:

```rust
/// URL `models.json` production: kế hoạch 07 điền khi có tên miền (T7) và manifest ký trong CI (T3).
pub const PRODUCTION_URL: Option<&str> = Some("https://pub-a4be034c8c474a36b893a65e8f0b8365.r2.dev/models/models.json");
```

bằng:

```rust
/// URL `models.json` production: cùng bucket với bản cập nhật, trên tên miền riêng (spec 2026-10-06).
pub const PRODUCTION_URL: Option<&str> = Some("https://releases.aitranslator.io.vn/models/models.json");
```

- [ ] **Step 3b: Cổng `release-ready` còn đòi tên miền website** (bổ sung khi thực thi): `scripts/release/release-ready.mjs` báo lỗi nếu `EXTERNAL_HOSTS` trong `src-tauri/src/navigation.rs` chỉ có `pay.payos.vn`. Thêm `"aitranslator.io.vn"` (kèm chú thích "Website của sản phẩm …") và cập nhật `scripts/release/release-ready.test.mjs`: test "repo hiện tại đủ cấu hình production" và test "thiếu tên miền website trong EXTERNAL_HOSTS thì bị bắt".

- [ ] **Step 4: Kiểm không còn URL cũ trong mã app**

Run: `grep -rn "workers\.dev\|r2\.dev" src-tauri/src | grep -v "^src-tauri/src/.*test"`
Expected: không có dòng nào.

- [ ] **Step 5: Test**

Run: `cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -3 && cargo test -p meeting-translator --lib 2>&1 | grep -E "test result|FAILED"`
Expected: không lỗi định dạng hay cảnh báo; `test result: ok`, 0 failed.

Run: `node scripts/release/release-ready.mjs --base-url https://releases.aitranslator.io.vn`
Expected: in `đủ cấu hình production` (kiểm `RELEASES_BASE_URL` khớp `updater/source.rs`). Nếu báo lỗi vì lý do khác với URL (khóa, bản), báo lại nguyên văn.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/license/client.rs src-tauri/src/updater/source.rs src-tauri/src/models/source.rs
git commit -m "feat(app): license, bản cập nhật và manifest model trỏ tên miền riêng api. và releases.aitranslator.io.vn

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Danh sách A7, tài liệu và biến GitHub

**Files:**
- Modify: `bench/phase1/results/acceptance/a7-allow.json`, `docs/release/phat-hanh.md`

- [ ] **Step 1: Danh sách A7.** Chạy:

```bash
python3 - <<'EOF'
import json
p = "bench/phase1/results/acceptance/a7-allow.json"
a = json.load(open(p, encoding="utf-8"))
h = a["hosts"]
h["api.aitranslator.io.vn"] = h.pop("mt-license.dotienphong1993.workers.dev")
h["releases.aitranslator.io.vn"] = h.pop("pub-a4be034c8c474a36b893a65e8f0b8365.r2.dev")
a["_note"] = a["_note"].replace("license server mt-license (workers.dev)", "license server api.aitranslator.io.vn").replace("bucket R2 công khai", "bucket R2 releases.aitranslator.io.vn")
json.dump(a, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
open(p, "a").write("\n")
EOF
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py' 2>&1 | tail -3
grep -c "aitranslator.io.vn" bench/phase1/results/acceptance/a7-allow.json
```

Expected: `OK` (82 test); số dòng khớp là 4 trở lên (hai tên máy chủ cộng `_note`); không còn `workers.dev` hay `r2.dev` trong file.

- [ ] **Step 2: Mục 6 của `docs/release/phat-hanh.md`.** Thêm vào cuối file (sau một dòng trống):

```markdown

## 6. Tên miền riêng `aitranslator.io.vn`

Thiết kế: `docs/superpowers/specs/2026-10-06-custom-domain-design.md`. Kế hoạch: `docs/superpowers/plans/2026-10-06-chuyen-ten-mien.md`.

| Mục đích | Tên | Gắn với |
|---|---|---|
| License server (app gọi) | `api.aitranslator.io.vn` | Worker `mt-license`, route `custom_domain` trong `server/wrangler.jsonc` |
| Bản cập nhật và model | `releases.aitranslator.io.vn` | Bucket R2 `ai-translator-releases`, custom domain |
| Gửi email | `mail.aitranslator.io.vn` | Resend; From `no-reply@mail…`, Reply-To `support@aitranslator.io.vn` |
| Nhận email hỗ trợ | `support@aitranslator.io.vn` | Cloudflare Email Routing, chuyển về Gmail |
| Admin | `mt-license-admin.<subdomain>.workers.dev` | Worker admin sau Access (chưa chuyển sang tên miền) |

- Biến GitHub `RELEASES_BASE_URL` = `https://releases.aitranslator.io.vn` (Settings › Secrets and variables › Actions › Variables); `release-ready.mjs` kiểm khớp với `updater/source.rs`.
- Luật WAF `webhook-rate-limit` cho `/v1/webhooks/` đặt ở zone này (5 request mỗi 10 giây mỗi IP, 429).
- Webhook PayOS: `https://api.aitranslator.io.vn/v1/webhooks/payos` (đăng ký bằng `confirm-webhook`; `API_ORIGIN` của Worker admin phải là `https://api.aitranslator.io.vn`).
- Thư mới từ tên miền mới dễ vào spam lúc đầu: kiểm hộp thư thật sau mỗi thay đổi nội dung thư; DMARC đang `p=none`, siết `quarantine` sau vài tuần báo cáo sạch.
- Còn giữ `workers_dev` của Worker API và `r2.dev` của bucket làm đường lui cho bản cài cũ. Chỉ tắt khi không còn bản cài nào dùng URL cũ (và nhớ Worker admin vẫn dùng `workers.dev` của nó).
```

- [ ] **Step 3: Biến GitHub (chủ dự án).** Đặt `RELEASES_BASE_URL` = `https://releases.aitranslator.io.vn` ở Settings › Secrets and variables › Actions › **Variables** của repo `dotienphong/ai-translator` (hoặc `gh variable set RELEASES_BASE_URL --body https://releases.aitranslator.io.vn` với `GH_TOKEN` của dotienphong).

- [ ] **Step 4: Commit**

```bash
git add bench/phase1/results/acceptance/a7-allow.json docs/release/phat-hanh.md
git commit -m "docs: danh sách cho phép A7 và quy trình phát hành theo tên miền riêng aitranslator.io.vn

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Dựng bản mới và kiểm trên máy thật (chủ dự án thao tác, agent kiểm log)

- [ ] **Step 1: Dựng bản release ký ad-hoc** (sidecar đã có sẵn; mất khoảng 8 phút)

```bash
AI_TRANSLATOR_MAC_SIGNING=adhoc scripts/release/package-macos.sh 2>&1 | tail -6
codesign --verify --strict --deep -R "=identifier \"com.aitranslator.desktop\"" "target/release/bundle/macos/AI Translator.app" && echo SELFCHECK_OK
```

Expected: `.dmg` mới trong `target/release-out/`; `SELFCHECK_OK`.
- [ ] **Step 2: Cài.** Thoát hẳn app đang chạy (khay › Thoát; `pgrep -fl "AI Translator.app/Contents/MacOS" || echo "đã thoát hết"`), rồi:

```bash
rm -rf "/Applications/AI Translator.app" && ditto "target/release/bundle/macos/AI Translator.app" "/Applications/AI Translator.app"
```

Mở app; khoảng 5 hộp thoại Keychain và 1 quyền thu âm sẽ hiện lại (bản build mới): nhập mật khẩu và bấm **Always Allow**, cho phép quyền thu âm; **không bấm Hủy**.
- [ ] **Step 3: Kích hoạt và kiểm log.** Cài đặt › Bản quyền: nhập key nhận ở Task 9 (key mới, qua email), hiện **Professional**. Rồi:

```bash
grep -E "workers\.dev|r2\.dev" ~/Library/Logs/com.aitranslator.desktop/app.log | awk '$0 >= "[2026-10-06][12:00:00]"' | tail -3
grep -E "releases\.aitranslator\.io\.vn" ~/Library/Logs/com.aitranslator.desktop/app.log | tail -2 | cut -c1-200
```

Expected: dòng đầu không in gì (không còn `workers.dev` hay `r2.dev` kể từ bản mới; chỉnh giờ trong lệnh cho đúng giờ mở bản mới); dòng sau in cảnh báo kiểm cập nhật chứa `https://releases.aitranslator.io.vn/stable/latest.json` (chưa có bản đăng nên báo không kiểm được là bình thường).
- [ ] **Step 4: Dịch thử và tải model.** Bấm Bắt đầu với một nguồn âm thanh, thấy phụ đề (model đã có trên máy). Cài đặt › Model: kiểm có hiện "Có bản mới" hay lỗi mạng không (không được lỗi chứng chỉ hay 404 của `models.json`).
- [ ] **Step 5: A7 ngắn trên bản mới (khuyến nghị).** Làm theo `bench/phase1/acceptance/RUNBOOK-mac.md` mục A7 với dịch 5 phút: HAR phải chỉ có request tới `api.aitranslator.io.vn` (`/v1/licenses/validate`) và `releases.aitranslator.io.vn` (`/stable/latest.json`), `netaudit.py` báo `A7: ĐẠT`. Nhớ gỡ chứng chỉ mitmproxy sau đó và kiểm `security find-certificate -c mitmproxy /Library/Keychains/System.keychain`.
- [ ] **Step 6: Thu hồi license thử** của Task 9 (`POST /admin/licenses/<id>/revoke`) nếu không giữ.

---

### Task 13: Ghi nhận và dọn

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`, bộ nhớ dự án

- [ ] **Step 1: Bảng đối chiếu và T7.** Trong mục 5.3 của kế hoạch 00, dòng `T7` (Tên miền): đổi "Chưa có" thành "Đã có `aitranslator.io.vn` (2026-10-06), đã chuyển URL (kế hoạch `2026-10-06-chuyen-ten-mien.md`)". Trong khối quyết định ngày 2026-10-06 ở mục 8.3: thêm "Đã chuyển URL sang `api.` và `releases.` (ngày …)".
- [ ] **Step 2: Bộ nhớ.** Cập nhật `decisions-2026-10-06.md`: tên miền đã chuyển xong, còn lại tắt `workers.dev` và `r2.dev` khi không còn bản cài cũ, website, EULA.
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
git commit -m "docs(plan): ghi nhận đã chuyển URL sang tên miền riêng aitranslator.io.vn

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

## Việc để sau (ngoài kế hoạch này)

Tắt `workers_dev` của Worker API và `r2.dev` khi mọi bản cài đã chuyển; chuyển admin sang tên miền (cần ứng dụng Access mới, đổi `ACCESS_AUD`, rồi tắt `workers_dev` của admin); website `aitranslator.io.vn`; nội dung EULA và chính sách quyền riêng tư; siết DMARC lên `quarantine`.
