# Email theo ngôn ngữ app, dạng HTML — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thư gửi khách (license key, trả lời chat hỗ trợ) viết bằng ngôn ngữ app của khách, phần tiếng Anh ở dưới (app tiếng Anh thì chỉ tiếng Anh), dạng HTML đẹp kèm bản chữ thuần.

**Architecture:** App 0.2.5 gửi `lang` (ngôn ngữ giao diện) khi tạo đơn và khi lấy lại key. Server lưu `orders.lang` (migration 0006), chọn ngôn ngữ thư bằng một hàm `mailLang(lang, currency)` (không biết ngôn ngữ thì USD ra tiếng Anh, còn lại tiếng Việt), dựng thư bằng ba file mới trong `server/src/email/` (`strings.ts` chữ 5 ngôn ngữ, `layout.ts` khung HTML, `templates.ts` ráp thư) và gửi cả `html` lẫn `text` qua Resend. Chính sách quyền riêng tư lên 1.6.

**Tech Stack:** Cloudflare Workers + D1, Hono 4.13, TypeScript 7 strict, vitest 4 với `@cloudflare/vitest-plugin`, `node --test` cho test script; app Rust 2024 + Tauri 2; website JS thuần, test `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-23-email-theo-ngon-ngu-design.md`. Đọc spec trước khi làm. Bản mẫu thư đã duyệt: https://claude.ai/artifact/TkNhF57MUGmb6DctvdMKCj.

**Quy tắc:**
- Làm trong worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu`, nhánh `email-theo-ngon-ngu`. Shell reset thư mục sau mỗi lệnh, nên **mọi lệnh bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`**. Đặt `WT=/Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu` trong đầu mỗi lệnh nếu tiện, nhưng đừng bao giờ chạy lệnh trong thư mục chính `/Users/dtphong/Desktop/software_business/ai-translator` (phiên khác đang dùng).
- Trước mỗi commit chạy `git branch --show-current` (phải ra `email-theo-ngon-ngu`). Chỉ `git add` đúng các file của task, không `git add -A`.
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Không merge, không push, không deploy, không đặt secret, không phát hành.** Chủ dự án quyết và tự chạy các việc đó (runbook mục 12 ở Task 10).
- Server: `pnpm typecheck`, `pnpm test`, `pnpm test:scripts` (trong `server/`). TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- Chú thích trong mã bằng tiếng Việt, theo giọng các file kế bên.
- Không thêm thư viện nào (CLAUDE.md, spec gốc §6.12). Thấy cần thì dừng và hỏi.
- Website: không nêu công nghệ lõi (`website/README.md`); sửa một trang thì sửa đủ các bản ngôn ngữ.

---

### Task 0: Chuẩn bị worktree và mốc test

**Files:** không đổi file nào.

- [ ] **Step 1: Đúng nhánh, cây sạch**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git status --short && git log --oneline -2
```
Expected: `email-theo-ngon-ngu`; `git status` không in gì; commit đầu là `docs(spec): email theo ngôn ngữ app …` (và có thể có commit kế hoạch này).

- [ ] **Step 2: Cài thư viện (theo lockfile, không đổi phiên bản)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && pnpm install --frozen-lockfile && pnpm -C server install --frozen-lockfile && pnpm -C website install --frozen-lockfile
```
Expected: ba lần cài xong, không lỗi, `git status --short` vẫn trống.

- [ ] **Step 3: Thư mục sidecar cho build Rust**

`src-tauri/binaries/` bị `.gitignore` nên worktree mới không có. Tạo thư mục rỗng:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && mkdir -p src-tauri/binaries && ls -d src-tauri/binaries
```
Nếu ở Task 8 `cargo` báo thiếu file sidecar, chép từ thư mục chính: `cp -R /Users/dtphong/Desktop/software_business/ai-translator/src-tauri/binaries/. src-tauri/binaries/` (chỉ đọc thư mục chính, không chạy lệnh nào khác ở đó).

- [ ] **Step 4: Ghi mốc test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm typecheck && pnpm test 2>&1 | grep -E 'Test Files|Tests ' && pnpm test:scripts 2>&1 | grep -E '^ℹ (tests|pass|fail)'
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/website && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail|skipped)'
```
Expected: mọi thứ đạt, `fail 0`. Ghi lại các số (`Tests N passed` của server, `ℹ tests` của test:scripts và website) để so ở Task 11. Có test đỏ sẵn thì dừng, báo.

---

### Task 1: Một chỗ cho năm mã ngôn ngữ (`server/src/lang.ts`)

Kiểu `Lang` và `parseLang` đang nằm trong `server/src/support/text.ts` (chat hỗ trợ). Thư, checkout và recover cũng cần, nên chuyển ra file chung; `support/text.ts` xuất lại để các chỗ import cũ (`support/routes.ts`, `support/store.ts`, `test/support-text.test.ts`) không phải đổi.

**Files:**
- Create: `server/src/lang.ts`
- Modify: `server/src/support/text.ts:4-8` và `:62-64`
- Test: `server/test/lang.test.ts` (mới)

- [ ] **Step 1: Viết test hỏng**

Tạo `server/test/lang.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LANGS, parseLang } from "../src/lang";
import { parseLang as parseSupportLang } from "../src/support/text";

describe("năm mã ngôn ngữ giao diện (src/lang.ts)", () => {
  it("parseLang chỉ nhận đúng một trong năm mã, chữ thường; còn lại null", () => {
    expect(LANGS).toEqual(["vi", "en", "ja", "zh", "ko"]);
    expect(LANGS.map((v) => parseLang(v))).toEqual(["vi", "en", "ja", "zh", "ko"]);
    for (const bad of ["fr", "VI", "", " vi", null, undefined, 5, {}]) expect(parseLang(bad)).toBeNull();
  });

  it("chat hỗ trợ dùng chính hàm này, không có danh sách mã thứ hai", () => {
    expect(parseSupportLang).toBe(parseLang);
  });
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm exec vitest run test/lang.test.ts 2>&1 | tail -5
```
Expected: FAIL, không tìm thấy `../src/lang`.

- [ ] **Step 3: Tạo `server/src/lang.ts`**

```ts
// Năm ngôn ngữ giao diện của app và website (spec 2026-10-12-ui-ja-zh-ko-design.md). Dùng chung cho chat hỗ trợ, ngôn ngữ lưu
// trên đơn và ngôn ngữ thư gửi khách (spec 2026-10-23-email-theo-ngon-ngu-design.md).
export type Lang = "vi" | "en" | "ja" | "zh" | "ko";

export const LANGS: readonly Lang[] = ["vi", "en", "ja", "zh", "ko"];

/** Đúng một trong năm mã (chữ thường); mọi giá trị khác là null. */
export function parseLang(v: unknown): Lang | null {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v) ? (v as Lang) : null;
}
```

- [ ] **Step 4: `support/text.ts` dùng lại `lang.ts`**

Trong `server/src/support/text.ts`, thay:

```ts
export type Lang = "vi" | "en" | "ja" | "zh" | "ko";
export type Source = "web" | "app" | "app-debug";

const LANGS: readonly string[] = ["vi", "en", "ja", "zh", "ko"];
const SOURCES: readonly string[] = ["web", "app", "app-debug"];
```

bằng:

```ts
export { type Lang, parseLang } from "../lang";
export type Source = "web" | "app" | "app-debug";

const SOURCES: readonly string[] = ["web", "app", "app-debug"];
```

và xóa hàm cũ:

```ts
export function parseLang(v: unknown): Lang | null {
  return typeof v === "string" && LANGS.includes(v) ? (v as Lang) : null;
}

```

- [ ] **Step 5: Chạy test và typecheck, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm typecheck && pnpm exec vitest run test/lang.test.ts test/support-text.test.ts test/support-routes.test.ts 2>&1 | grep -E 'Test Files|Tests '
```
Expected: typecheck không lỗi; mọi test đạt.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add server/src/lang.ts server/src/support/text.ts server/test/lang.test.ts && git commit -m "refactor(server): năm mã ngôn ngữ ở một chỗ (src/lang.ts), chat hỗ trợ dùng lại" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0006, cột `orders.lang`

**Files:**
- Create: `server/migrations/0006_order_lang.sql`
- Modify: `server/src/orders.ts` (`OrderRow`, `loadOrder`, import)
- Test: `server/test/migrations.test.ts`, `server/test/orders.test.ts`

- [ ] **Step 1: Viết test hỏng (migration)**

Trong `server/test/migrations.test.ts`:

Thay

```ts
it("có đúng năm migration theo thứ tự", () => {
  expect(names).toEqual([
    "0001_init.sql",
    "0002_three_plans_trials.sql",
    "0003_six_months_plan.sql",
    "0004_error_reports.sql",
    "0005_support_chat.sql",
  ]);
});
```

bằng

```ts
it("có đúng sáu migration theo thứ tự", () => {
  expect(names).toEqual([
    "0001_init.sql",
    "0002_three_plans_trials.sql",
    "0003_six_months_plan.sql",
    "0004_error_reports.sql",
    "0005_support_chat.sql",
    "0006_order_lang.sql",
  ]);
});
```

Trong test `0005 chỉ thêm bốn bảng chat hỗ trợ …`, thay

```ts
  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  const after = await tables();
  expect(after.filter((t) => !t.name.startsWith("support_"))).toEqual(before);
```

bằng

```ts
  // Chỉ áp tới 0005: 0006 có test riêng ở cuối file.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 5));

  const after = await tables();
  expect(after.filter((t) => !t.name.startsWith("support_"))).toEqual(before);
```

Thêm vào **cuối file**:

```ts
it("0006 chỉ thêm cột orders.lang (NULL được, chỉ năm mã); đơn cũ giữ nguyên với lang NULL; bảng khác và bộ đếm số đơn không đổi", async () => {
  // D1 đang ở trạng thái sau 0005 (test trên chỉ áp năm migration đầu).
  const tables = async () =>
    (
      await db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
        )
        .all<{ name: string; sql: string }>()
    ).results;
  const before = await tables();
  const ordersBefore = (await db.prepare("SELECT * FROM orders ORDER BY order_code").all()).results;
  const seq = () => db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'orders'").first();
  const seqBefore = await seq();

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  const after = await tables();
  expect(after.filter((t) => t.name !== "orders")).toEqual(before.filter((t) => t.name !== "orders"));
  expect((await db.prepare("SELECT * FROM orders ORDER BY order_code").all()).results).toEqual(
    ordersBefore.map((o) => ({ ...o, lang: null })),
  );
  expect(await seq()).toEqual(seqBefore);
  const insert = (lang: unknown) =>
    db
      .prepare(
        `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at, lang)
         VALUES ('h', 'payos', 'monthly', 1, 'VND', 0, 'failed', 0, 0, ?)`,
      )
      .bind(lang);
  await expect(insert("fr").run()).rejects.toThrow(/CHECK/);
  await expect(insert("VI").run()).rejects.toThrow(/CHECK/);
  await insert("ja").run();
  await insert(null).run();
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
```

- [ ] **Step 2: Viết test hỏng (`loadOrder` đọc `lang`)**

Thêm vào **cuối** `server/test/orders.test.ts`:

```ts
describe("ngôn ngữ lưu trên đơn (spec 2026-10-23)", () => {
  it("loadOrder đọc cả lang; đơn không có ngôn ngữ thì NULL", async () => {
    const w = makeWorld();
    const { orderCode } = await checkout(w);
    expect((await loadOrder(env.DB, orderCode))!.lang).toBeNull();
    await env.DB.prepare("UPDATE orders SET lang = 'ja' WHERE order_code = ?").bind(orderCode).run();
    expect((await loadOrder(env.DB, orderCode))!.lang).toBe("ja");
  });
});
```

- [ ] **Step 3: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm exec vitest run test/migrations.test.ts test/orders.test.ts -t "migration|0006|ngôn ngữ lưu trên đơn" 2>&1 | grep -E 'FAIL|✓|×|Tests ' | head -20
```
Expected: test "có đúng sáu migration", "0006 …" và "loadOrder đọc cả lang …" đỏ (chưa có file migration, chưa có cột).

- [ ] **Step 4: Tạo migration**

Tạo `server/migrations/0006_order_lang.sql`:

```sql
-- Email theo ngôn ngữ app (spec 2026-10-23-email-theo-ngon-ngu-design.md §3): ngôn ngữ giao diện app lúc tạo đơn, để thư gửi key
-- (lần đầu và các lần cron gửi lại) viết bằng ngôn ngữ đó, phần tiếng Anh ở dưới. NULL với đơn cũ, đơn của app ≤ 0.2.4 (không gửi
-- `lang`) và đơn đã ẩn danh theo email; khi đó thư đoán theo loại tiền (USD ra tiếng Anh, còn lại tiếng Việt).
-- Chỉ THÊM một cột cho phép NULL, không dựng lại bảng: Worker cũ không đọc cột này nên chạy đúng trên schema mới (áp migration
-- trước khi deploy Worker mới), và bộ đếm số đơn (sqlite_sequence) không bị đụng: PayOS nhớ mọi orderCode đã dùng.
ALTER TABLE orders ADD COLUMN lang TEXT CHECK (lang IN ('vi', 'en', 'ja', 'zh', 'ko'));
```

- [ ] **Step 5: `OrderRow` và `loadOrder` có `lang`**

Trong `server/src/orders.ts`:

Thêm import (giữ thứ tự chữ cái của các dòng import, đặt sau dòng `import { clientIp, fail, tooMany } from "./http";`):

```ts
import type { Lang } from "./lang";
```

Trong `interface OrderRow`, thay

```ts
  email: string | null;
  renew_license_id: string | null;
```

bằng

```ts
  email: string | null;
  /** Ngôn ngữ giao diện app lúc tạo đơn (spec 2026-10-23); NULL với đơn của app ≤ 0.2.4 và đơn đã ẩn danh theo email. */
  lang: Lang | null;
  renew_license_id: string | null;
```

Trong `loadOrder`, thay

```ts
      `SELECT order_code, provider, provider_ref, status, plan, amount, amount_paid, currency, email, renew_license_id,
              license_id, created_at, expires_at
```

bằng

```ts
      `SELECT order_code, provider, provider_ref, status, plan, amount, amount_paid, currency, email, lang, renew_license_id,
              license_id, created_at, expires_at
```

- [ ] **Step 6: Chạy toàn bộ test server và typecheck, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm typecheck && pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
```
Expected: typecheck không lỗi; `Tests` = mốc Task 0 + 4 (lang.test 2, migration 0006 1, orders 1; test "năm/sáu migration" chỉ đổi tên), không `FAIL`. Một test cũ đỏ vì so cả hàng `orders` (thêm khóa `lang`) thì sửa test đó cho có `lang: null`, ghi lại trong commit.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add server/migrations/0006_order_lang.sql server/src/orders.ts server/test/migrations.test.ts server/test/orders.test.ts && git commit -m "feat(server): migration 0006 thêm orders.lang (ngôn ngữ giao diện app lúc tạo đơn)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Resend gửi kèm `html`

**Files:**
- Modify: `server/src/email/provider.ts` (`EmailMessage`), `server/src/email/resend.ts` (`send`)
- Modify: `server/test/fakes.ts` (`SentEmail`, `FakeResend`)
- Test: `server/test/email.test.ts`

- [ ] **Step 1: Viết test hỏng**

Trong `server/test/email.test.ts`, trong `describe("Resend", …)`, thêm ngay sau test `"có replyTo thì gửi thêm reply_to, …"`:

```ts
  it("có html thì gửi html cùng text (thư HTML kèm bản chữ thuần, spec 2026-10-23 D4); không có thì không gửi trường đó", async () => {
    const bodies: Record<string, unknown>[] = [];
    const p = new ResendEmailProvider({ apiKey: "re_test", from: "a@mt.test" }, async (_url: string, init: RequestInit = {}) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response("{}");
    });
    await p.send({ to: "b@mt.test", subject: "S", text: "T", html: "<p>H</p>" });
    await p.send({ to: "b@mt.test", subject: "S", text: "T" });
    expect(bodies[0]).toEqual({ from: "a@mt.test", to: ["b@mt.test"], subject: "S", text: "T", html: "<p>H</p>" });
    expect(bodies[1]).not.toHaveProperty("html");
  });
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm exec vitest run test/email.test.ts -t "có html" 2>&1 | grep -E '✓|×|FAIL|Tests '
```
Expected: FAIL (body không có `html`).

- [ ] **Step 3: Thêm `html` vào `EmailMessage` và `ResendEmailProvider`**

Trong `server/src/email/provider.ts`, thay

```ts
  subject: string;
  text: string;
  /** Cùng khóa thì dịch vụ chỉ gửi một lần (Resend giữ khóa 24 giờ). */
```

bằng

```ts
  subject: string;
  text: string;
  /** Bản HTML; có thì hộp thư hiện bản này, `text` là bản dự phòng cho hộp thư không hiện HTML (spec 2026-10-23 D4). */
  html?: string;
  /** Cùng khóa thì dịch vụ chỉ gửi một lần (Resend giữ khóa 24 giờ). */
```

Trong `server/src/email/resend.ts`, thay

```ts
    if (this.cfg.replyTo) body.reply_to = this.cfg.replyTo;
```

bằng

```ts
    if (message.html) body.html = message.html;
    if (this.cfg.replyTo) body.reply_to = this.cfg.replyTo;
```

- [ ] **Step 4: `FakeResend` ghi lại `html`**

Trong `server/test/fakes.ts`, thay

```ts
export interface SentEmail {
  to: string[];
  subject: string;
  text: string;
  idempotencyKey: string | null;
}
```

bằng

```ts
export interface SentEmail {
  to: string[];
  subject: string;
  text: string;
  /** Bản HTML của thư; null nếu thư chỉ có chữ thuần (thư cảnh báo cho người vận hành). */
  html: string | null;
  idempotencyKey: string | null;
}
```

và thay

```ts
    const body = JSON.parse(init.body as string) as { to: string[]; subject: string; text: string };
    const headers = init.headers as Record<string, string>;
    this.sent.push({ to: body.to, subject: body.subject, text: body.text, idempotencyKey: headers["idempotency-key"] ?? null });
```

bằng

```ts
    const body = JSON.parse(init.body as string) as { to: string[]; subject: string; text: string; html?: string };
    const headers = init.headers as Record<string, string>;
    this.sent.push({
      to: body.to,
      subject: body.subject,
      text: body.text,
      html: body.html ?? null,
      idempotencyKey: headers["idempotency-key"] ?? null,
    });
```

- [ ] **Step 5: Chạy toàn bộ test server và typecheck, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm typecheck && pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
```
Expected: không lỗi, không `FAIL`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add server/src/email/provider.ts server/src/email/resend.ts server/test/fakes.ts server/test/email.test.ts && git commit -m "feat(server): Resend gửi kèm bản HTML khi thư có" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Thư mới (chữ 5 ngôn ngữ, khung HTML), chọn ngôn ngữ ở mọi nơi gửi

Thay `templates.ts` bằng ba file. Đổi chữ ký `licenseEmail(lang, kind, entries)`, `supportReplyEmail(lang, replies)`, `sendLicenseMail(db, deps, to, lang, kind, entries, opts)` và sửa mọi chỗ gọi trong cùng task (đổi chữ ký mà để chỗ gọi cũ là test hỏng ở chỗ khác). Ở task này:
- thư mua, gia hạn, đổi gói (`mailGranted`, cả cron gửi lại) theo `mailLang(order.lang, order.currency)` (cách cuối cùng);
- thư trả lời hỗ trợ theo `support_conversations.lang` (cách cuối cùng);
- Web Admin "Cấp key tay" dùng `"vi"` (cách cuối cùng, spec D3);
- lấy lại key và Web Admin "Gửi lại key" tạm dùng `"vi"` (giữ hành vi cũ: Việt trên, Anh dưới); Task 6 và Task 7 đổi.

**Files:**
- Create: `server/src/email/strings.ts`, `server/src/email/layout.ts`
- Rewrite: `server/src/email/templates.ts`
- Modify: `server/src/deps.ts` (`sendLicenseMail`), `server/src/orders.ts` (`mailGranted`, `retryUnsentEmails`), `server/src/licenses.ts` (recover), `server/src/admin.ts` (cấp tay, gửi lại), `server/src/support/cron.ts` (`sendSupportEmails`)
- Test: `server/test/email.test.ts`, `server/test/orders.test.ts`, `server/test/admin.test.ts`, `server/test/support-cron.test.ts`
- Create: `server/test/node/email-strings.test.mjs`

- [ ] **Step 1: Viết test hỏng cho nội dung thư**

Trong `server/test/email.test.ts`, thay dòng import

```ts
import { licenseEmail } from "../src/email/templates";
```

bằng

```ts
import { type LicenseEmailKind, MAIL, pick } from "../src/email/strings";
import { licenseEmail, mailLang, supportReplyEmail } from "../src/email/templates";
import { type Lang, LANGS } from "../src/lang";
```

Thay **toàn bộ** khối `describe("nội dung email", () => { … });` (từ dòng `describe("nội dung email", () => {` tới hết file) bằng:

```ts
describe("nội dung email (spec 2026-10-23)", () => {
  // 2026-10-31T17:30:00Z là 01/11/2026 ở Việt Nam.
  const yearly = { licenseKey: "0123456789ABCDEFGHJKMNPQRSTR", planName: "Yearly", expiresAt: Date.UTC(2026, 9, 31, 17, 30) / 1000 };
  const monthly = { licenseKey: "ABCDEFGHJKMNPQRSTVWXYZ012345", planName: "Monthly", expiresAt: Date.UTC(2026, 10, 22, 3) / 1000 };
  const KINDS: LicenseEmailKind[] = ["purchase", "renewal", "plan_change", "recover", "resend"];

  it("mailLang: có ngôn ngữ thì dùng; không có thì đơn USD ra tiếng Anh, còn lại tiếng Việt", () => {
    expect(mailLang("ja", "VND")).toBe("ja");
    expect(mailLang("vi", "USD")).toBe("vi");
    expect(mailLang(null, "USD")).toBe("en");
    expect(mailLang(null, "VND")).toBe("vi");
    expect(mailLang(null, null)).toBe("vi");
  });

  it("thư tiếng Việt: tiêu đề và bản chữ thuần đầy đủ, Việt trên, Anh dưới", () => {
    const { subject, text } = licenseEmail("vi", "purchase", [yearly]);
    expect(subject).toBe("License key AI Translator của bạn / Your AI Translator license key");
    expect(text).toBe(
      [
        "AI Translator",
        "",
        "Cảm ơn bạn đã mua AI Translator",
        "Đây là license key của bạn.",
        "",
        "    0123-4567-89AB-CDEF-GHJK-MNPQ-RSTR",
        "    Gói Yearly · Hết hạn 01/11/2026",
        "",
        "Kích hoạt trên máy của bạn",
        "  1. Mở AI Translator.",
        "  2. Vào Cài đặt › Bản quyền.",
        "  3. Dán key rồi bấm Kích hoạt.",
        "",
        "Mỗi key dùng trên 1 máy. Hãy giữ thư này để kích hoạt lại khi cài lại máy hay chuyển sang máy khác.",
        "Hướng dẫn chi tiết: https://aitranslator.io.vn/huong-dan/mua-va-kich-hoat-key/",
        "Cần giúp? Trả lời thư này, chúng tôi sẽ hồi âm.",
        "",
        "─".repeat(28),
        "English",
        "",
        "Thank you for buying AI Translator",
        "Your license key is shown above.",
        "  Yearly · Expires 1 Nov 2026",
        "",
        "Activate on your computer",
        "  1. Open AI Translator.",
        "  2. Go to Settings › License.",
        "  3. Paste the key and click Activate.",
        "",
        "Each key works on 1 computer. Keep this email to activate again after reinstalling or moving to another computer.",
        "Step-by-step guide: https://aitranslator.io.vn/en/guide/buy-and-activate/",
        "Need help? Reply to this email.",
        "",
        "--",
        "AI Translator · aitranslator.io.vn",
        "",
      ].join("\n"),
    );
  });

  it("tiêu đề: <ngôn ngữ của khách> / <tiếng Anh>; app tiếng Anh thì chỉ tiếng Anh", () => {
    expect(licenseEmail("ja", "purchase", [yearly]).subject).toBe("AI Translator のライセンスキー / Your AI Translator license key");
    expect(licenseEmail("zh", "renewal", [yearly]).subject).toBe("你的 AI Translator 套餐已续期 / Your AI Translator plan is renewed");
    expect(licenseEmail("ko", "plan_change", [yearly]).subject).toBe("AI Translator 플랜이 변경되었습니다 / Your AI Translator plan has changed");
    expect(licenseEmail("vi", "renewal", [yearly]).subject).toBe("Đã gia hạn gói AI Translator / Your AI Translator plan is renewed");
    expect(licenseEmail("en", "purchase", [yearly]).subject).toBe("Your AI Translator license key");
    expect(supportReplyEmail("ko", ["x"]).subject).toBe("AI Translator 지원팀의 답변 / Reply from AI Translator support");
    expect(supportReplyEmail("vi", ["x"]).subject).toBe("Trả lời từ hỗ trợ AI Translator / Reply from AI Translator support");
    expect(supportReplyEmail("en", ["x"]).subject).toBe("Reply from AI Translator support");
  });

  it("HTML: lang của trang, key, ngày theo ngôn ngữ, link hướng dẫn đúng ngôn ngữ, phần tiếng Anh ở dưới; app tiếng Anh thì không có phần dưới", () => {
    const { html } = licenseEmail("ja", "purchase", [yearly]);
    expect(html).toMatch(/^<!doctype html>\n<html lang="ja">/);
    expect(html).toContain("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTR");
    expect(html).toContain("2026年11月1日");
    expect(html).toContain('href="https://aitranslator.io.vn/ja/guide/buy-and-activate/"');
    expect(html).toContain('href="https://aitranslator.io.vn/en/guide/buy-and-activate/"');
    expect(html).toContain('<td class="pad" lang="en"');
    expect(html).toContain("1 Nov 2026");
    expect(html.indexOf("ライセンスキーをお送りします。")).toBeLessThan(html.indexOf("Your license key is shown above."));
    const en = licenseEmail("en", "purchase", [yearly]).html;
    expect(en).toMatch(/<html lang="en">/);
    expect(en).not.toContain('<td class="pad" lang="en"');
    expect(en).toContain("Here is your license key.");
    expect(en).not.toContain("shown above");
  });

  it("dòng xem trước ẩn (preheader): gói và ngày hết hạn, không có key", () => {
    const { html } = licenseEmail("ja", "purchase", [yearly]);
    const preheader = /<div style="display:none;[^"]*">([^<]*)<\/div>/.exec(html)?.[1];
    expect(preheader).toBe("プラン Yearly · 有効期限 2026年11月1日");
  });

  it("ngày hết hạn (giờ Việt Nam) viết theo thói quen của từng ngôn ngữ", () => {
    const text = (lang: Lang) => licenseEmail(lang, "resend", [yearly]).text;
    expect(text("vi")).toContain("Hết hạn 01/11/2026");
    expect(text("en")).toContain("Expires 1 Nov 2026");
    expect(text("ja")).toContain("有効期限 2026年11月1日");
    expect(text("zh")).toContain("到期时间 2026年11月1日");
    expect(text("ko")).toContain("만료일 2026년 11월 1일");
  });

  it("các bước kích hoạt chỉ ở thư mua, lấy lại, gửi lại; thư gia hạn và đổi gói nói key giữ nguyên", () => {
    for (const kind of ["purchase", "recover", "resend"] as const) {
      const { text, html } = licenseEmail("vi", kind, [yearly]);
      expect(text).toContain("  2. Vào Cài đặt › Bản quyền.");
      expect(text).toContain("  2. Go to Settings › License.");
      expect(html).toContain("Kích hoạt trên máy của bạn");
    }
    for (const kind of ["renewal", "plan_change"] as const) {
      const { text, html } = licenseEmail("vi", kind, [yearly]);
      expect(text).not.toContain("Cài đặt › Bản quyền");
      expect(html).not.toContain("Kích hoạt trên máy của bạn");
      expect(text).toContain("Key giữ nguyên, không cần kích hoạt lại.");
      expect(text).toContain("stays the same; no need to activate it again.");
    }
  });

  it("nhiều key: mỗi key một ô; tiếng Anh dùng số nhiều", () => {
    const two = licenseEmail("en", "recover", [yearly, monthly]);
    expect(two.subject).toBe("Your AI Translator license keys");
    expect(two.text).toContain("Here are the active license keys for this email.");
    expect(two.html.match(/class="keybox"/g)).toHaveLength(2);
    expect(licenseEmail("en", "recover", [yearly]).subject).toBe("Your AI Translator license key");
    const vi = licenseEmail("vi", "recover", [yearly, monthly]).text;
    expect(vi).toContain("The active license keys for this email are shown above.");
    expect(vi).toContain("  Yearly · Expires 1 Nov 2026\n  Monthly · Expires 22 Nov 2026");
  });

  it("thư trả lời hỗ trợ: escape HTML, giữ xuống dòng; bản chữ thuần giữ nguyên văn; tiếng Anh ở dưới", () => {
    const reply = `Thử <script>alert("x")</script> & 'y'\nDòng hai`;
    const { html, text } = supportReplyEmail("vi", [reply, "Câu hai"]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("Thử &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;\nDòng hai");
    expect(html).toContain("white-space:pre-wrap");
    expect(text).toContain(`  Thử <script>alert("x")</script> & 'y'\n  Dòng hai\n\n  Câu hai`);
    expect(text).toContain("AI Translator support has replied to your message (above).");
    expect(html.indexOf("Bộ phận hỗ trợ AI Translator đã trả lời tin nhắn của bạn.")).toBeLessThan(html.indexOf("(above)"));
  });

  it("mỗi key một máy (spec 2026-10-07 §1); không còn tên tạm; không lộ công nghệ lõi hay dịch vụ gửi thư; không ảnh, không script", () => {
    for (const lang of LANGS) {
      const mails = [...KINDS.map((kind) => licenseEmail(lang, kind, [yearly])), supportReplyEmail(lang, ["x"])];
      for (const { subject, html, text } of mails) {
        const all = `${subject}\n${html}\n${text}`;
        expect(all).not.toMatch(/2 máy|2 computers|Meeting Translator/);
        expect(all).not.toMatch(/Resend|Cloudflare|Whisper|Hy-MT|llama|ggml|Tauri|Hono|<img|<script/i);
      }
    }
  });

  it("đủ chữ ở cả năm ngôn ngữ: không chuỗi rỗng, đúng ba bước", () => {
    for (const lang of LANGS) {
      const s = MAIL[lang];
      for (const kind of [...KINDS, "support"] as const) {
        for (const field of [s.subject, s.heading, s.lead]) expect(pick(field[kind], 1).length, `${lang} ${kind}`).toBeGreaterThan(0);
      }
      expect(s.steps).toHaveLength(3);
    }
  });

  it("che email trong log", () => {
    expect(maskEmail("buyer@example.com")).toBe("b***@example.com");
    expect(maskEmail("x")).toBe("***");
  });
});
```

- [ ] **Step 2: Viết test hỏng: chữ trong thư khớp giao diện app và website**

Tạo `server/test/node/email-strings.test.mjs`:

```js
// Chữ trong thư gửi khách (server/src/email/strings.ts) phải khớp giao diện app và website (spec 2026-10-23 §2, D6): tên mục
// Cài đặt › Bản quyền, nút Kích hoạt và màn hình Hỗ trợ đúng như app hiện ở từng ngôn ngữ (src/i18n/*.ts), và link hướng dẫn trỏ
// đúng trang mua và kích hoạt key của website ở ngôn ngữ đó. Đổi chữ ở app hay đổi đường dẫn trang thì test này đỏ. Node tự bỏ kiểu
// của file .ts (type stripping), nên test đọc thẳng file nguồn. Chạy bằng `pnpm test:scripts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const LANGS = ["vi", "en", "ja", "zh", "ko"];
const { MAIL } = await import(new URL("../../src/email/strings.ts", import.meta.url));
const ui = Object.fromEntries(
  await Promise.all(LANGS.map(async (l) => [l, (await import(new URL(`../../../src/i18n/${l}.ts`, import.meta.url)))[l]])),
);

test("các bước kích hoạt và câu cuối của thư hỗ trợ dùng đúng chữ của giao diện app", () => {
  for (const l of LANGS) {
    const s = MAIL[l];
    const t = ui[l];
    for (const key of ["nav.settings", "settings.group.license"]) {
      assert.ok(s.steps[1].includes(t[key]), `${l}: bước 2 "${s.steps[1]}" thiếu "${t[key]}" (${key})`);
    }
    const button = t["settings.license.activate.button"];
    assert.ok(s.steps[2].includes(button), `${l}: bước 3 "${s.steps[2]}" thiếu "${button}"`);
    assert.ok(s.supportOutro.includes(t["nav.support"]), `${l}: câu cuối thư hỗ trợ thiếu "${t["nav.support"]}"`);
  }
});

test("link hướng dẫn trỏ đúng trang mua và kích hoạt key của website ở từng ngôn ngữ", () => {
  for (const l of LANGS) {
    const page = readFileSync(new URL(`../../../website/src/content/${l}/guide-license.mjs`, import.meta.url), "utf8");
    const path = /^ {2}path: "([^"]+)"/m.exec(page)?.[1];
    assert.equal(MAIL[l].guidePath, path, `${l}: guidePath khác path của website/src/content/${l}/guide-license.mjs`);
  }
});
```

- [ ] **Step 3: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm exec vitest run test/email.test.ts 2>&1 | tail -5; node --test test/node/email-strings.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail)|ERR_MODULE_NOT_FOUND' | head
```
Expected: vitest FAIL (không có `../src/email/strings`); node test lỗi `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Tạo `server/src/email/strings.ts`**

```ts
// Chữ của thư gửi khách, năm ngôn ngữ (spec 2026-10-23-email-theo-ngon-ngu-design.md, Phụ lục A). Tên mục và nút lấy đúng chữ của
// giao diện app (src/i18n/*.ts: nav.settings, settings.group.license, settings.license.activate.button, nav.support): đổi chữ ở app
// thì đổi ở đây (test/node/email-strings.test.mjs kiểm). Bản ja, zh, ko không có người bản ngữ duyệt (spec D6).
import type { Lang } from "../lang";

/** Gốc website; link trong thư chỉ trỏ về đây, không thêm tham số theo dõi. */
export const SITE_URL = "https://aitranslator.io.vn";

export type LicenseEmailKind = "purchase" | "renewal" | "plan_change" | "recover" | "resend";
export type MailKind = LicenseEmailKind | "support";

/** Chữ đổi theo số key: chỉ tiếng Anh có số nhiều (thư lấy lại key có thể có nhiều key). */
export type Counted = string | { one: string; many: string };

export function pick(text: Counted, count: number): string {
  return typeof text === "string" ? text : count > 1 ? text.many : text.one;
}

export interface MailStrings {
  /** Ngày (tháng 1–12) viết theo thói quen của ngôn ngữ. */
  date(y: number, m: number, d: number): string;
  subject: Record<MailKind, Counted>;
  /** Tiêu đề lớn trong thư. */
  heading: Record<MailKind, Counted>;
  /** Câu dẫn dưới tiêu đề lớn. */
  lead: Record<MailKind, Counted>;
  /** Nhãn nhỏ trên tiêu đề lớn. */
  eyebrow: { license: string; support: string };
  plan: string;
  expires: string;
  stepsTitle: string;
  steps: readonly [string, string, string];
  /** Mỗi key một máy, hãy giữ thư này. */
  note: string;
  /** Chữ của link tới trang mua và kích hoạt key trên website, và đường dẫn của trang đó ở ngôn ngữ này. */
  guide: string;
  guidePath: string;
  help: string;
  /** Câu cuối của thư trả lời hỗ trợ. */
  supportOutro: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MAIL: Record<Lang, MailStrings> = {
  vi: {
    date: (y, m, d) => `${pad(d)}/${pad(m)}/${y}`,
    subject: {
      purchase: "License key AI Translator của bạn",
      renewal: "Đã gia hạn gói AI Translator",
      plan_change: "Đã đổi gói AI Translator",
      recover: "License key AI Translator của bạn",
      resend: "License key AI Translator của bạn",
      support: "Trả lời từ hỗ trợ AI Translator",
    },
    heading: {
      purchase: "Cảm ơn bạn đã mua AI Translator",
      renewal: "Gói của bạn đã được gia hạn",
      plan_change: "Gói của bạn đã được đổi",
      recover: "License key của bạn",
      resend: "License key của bạn",
      support: "Hỗ trợ đã trả lời bạn",
    },
    lead: {
      purchase: "Đây là license key của bạn.",
      renewal: "Cảm ơn bạn đã gia hạn. Key giữ nguyên, không cần kích hoạt lại.",
      plan_change: "Cảm ơn bạn. Key giữ nguyên, không cần kích hoạt lại.",
      recover: "Đây là license key còn hạn của email này.",
      resend: "Đây là license key của bạn, gửi lại theo yêu cầu.",
      support: "Bộ phận hỗ trợ AI Translator đã trả lời tin nhắn của bạn.",
    },
    eyebrow: { license: "License key", support: "Hỗ trợ" },
    plan: "Gói",
    expires: "Hết hạn",
    stepsTitle: "Kích hoạt trên máy của bạn",
    steps: ["Mở AI Translator.", "Vào Cài đặt › Bản quyền.", "Dán key rồi bấm Kích hoạt."],
    note: "Mỗi key dùng trên 1 máy. Hãy giữ thư này để kích hoạt lại khi cài lại máy hay chuyển sang máy khác.",
    guide: "Hướng dẫn chi tiết",
    guidePath: "/huong-dan/mua-va-kich-hoat-key/",
    help: "Cần giúp? Trả lời thư này, chúng tôi sẽ hồi âm.",
    supportOutro: "Trả lời thư này để nhắn tiếp, hoặc mở lại khung chat trên aitranslator.io.vn hay mục Hỗ trợ trong app.",
  },
  en: {
    date: (y, m, d) => `${d} ${MONTHS_EN[m - 1]} ${y}`,
    subject: {
      purchase: "Your AI Translator license key",
      renewal: "Your AI Translator plan is renewed",
      plan_change: "Your AI Translator plan has changed",
      recover: { one: "Your AI Translator license key", many: "Your AI Translator license keys" },
      resend: { one: "Your AI Translator license key", many: "Your AI Translator license keys" },
      support: "Reply from AI Translator support",
    },
    heading: {
      purchase: "Thank you for buying AI Translator",
      renewal: "Your plan is renewed",
      plan_change: "Your plan has changed",
      recover: { one: "Your license key", many: "Your license keys" },
      resend: { one: "Your license key", many: "Your license keys" },
      support: "Support has replied",
    },
    lead: {
      purchase: "Here is your license key.",
      renewal: "Thank you for renewing. Your key stays the same; no need to activate it again.",
      plan_change: "Thank you. Your key stays the same; no need to activate it again.",
      recover: { one: "Here is the active license key for this email.", many: "Here are the active license keys for this email." },
      resend: { one: "Here is your license key, sent again as you asked.", many: "Here are your license keys, sent again as you asked." },
      support: "AI Translator support has replied to your message.",
    },
    eyebrow: { license: "License key", support: "Support" },
    plan: "Plan",
    expires: "Expires",
    stepsTitle: "Activate on your computer",
    steps: ["Open AI Translator.", "Go to Settings › License.", "Paste the key and click Activate."],
    note: "Each key works on 1 computer. Keep this email to activate again after reinstalling or moving to another computer.",
    guide: "Step-by-step guide",
    guidePath: "/en/guide/buy-and-activate/",
    help: "Need help? Reply to this email.",
    supportOutro: "Reply to this email to continue, or reopen the chat on aitranslator.io.vn or in the app's Support screen.",
  },
  ja: {
    date: (y, m, d) => `${y}年${m}月${d}日`,
    subject: {
      purchase: "AI Translator のライセンスキー",
      renewal: "AI Translator のプランを更新しました",
      plan_change: "AI Translator のプランを変更しました",
      recover: "AI Translator のライセンスキー",
      resend: "AI Translator のライセンスキー",
      support: "AI Translator サポートからの返信",
    },
    heading: {
      purchase: "AI Translator をご購入いただきありがとうございます",
      renewal: "プランを更新しました",
      plan_change: "プランを変更しました",
      recover: "ライセンスキー",
      resend: "ライセンスキー",
      support: "サポートから返信がありました",
    },
    lead: {
      purchase: "ライセンスキーをお送りします。",
      renewal: "ご更新ありがとうございます。キーは変わらないため、もう一度有効化する必要はありません。",
      plan_change: "ありがとうございます。キーは変わらないため、もう一度有効化する必要はありません。",
      recover: "このメールアドレスで有効なライセンスキーをお送りします。",
      resend: "ご依頼により、ライセンスキーを再送します。",
      support: "AI Translator サポートがあなたのメッセージに返信しました。",
    },
    eyebrow: { license: "ライセンスキー", support: "サポート" },
    plan: "プラン",
    expires: "有効期限",
    stepsTitle: "お使いのパソコンで有効化",
    steps: ["AI Translator を開きます。", "設定 › ライセンス を開きます。", "キーを貼り付けて「有効化」をクリックします。"],
    note: "1 つのキーは 1 台のパソコンで使えます。再インストールやパソコンの買い替えのときに有効化し直せるよう、このメールを保管してください。",
    guide: "詳しい手順",
    guidePath: "/ja/guide/buy-and-activate/",
    help: "ご不明な点は、このメールに返信してください。",
    supportOutro: "このメールに返信して続けるか、aitranslator.io.vn またはアプリの「サポート」画面からチャットを再開できます。",
  },
  zh: {
    date: (y, m, d) => `${y}年${m}月${d}日`,
    subject: {
      purchase: "你的 AI Translator 许可证密钥",
      renewal: "你的 AI Translator 套餐已续期",
      plan_change: "你的 AI Translator 套餐已更改",
      recover: "你的 AI Translator 许可证密钥",
      resend: "你的 AI Translator 许可证密钥",
      support: "AI Translator 客服的回复",
    },
    heading: {
      purchase: "感谢你购买 AI Translator",
      renewal: "你的套餐已续期",
      plan_change: "你的套餐已更改",
      recover: "你的许可证密钥",
      resend: "你的许可证密钥",
      support: "客服已回复你",
    },
    lead: {
      purchase: "以下是你的许可证密钥。",
      renewal: "感谢续期。密钥保持不变，无需重新激活。",
      plan_change: "谢谢。密钥保持不变，无需重新激活。",
      recover: "以下是此邮箱名下仍有效的许可证密钥。",
      resend: "应你的要求，再次发送你的许可证密钥。",
      support: "AI Translator 客服已回复你的消息。",
    },
    eyebrow: { license: "许可证密钥", support: "客服" },
    plan: "套餐",
    expires: "到期时间",
    stepsTitle: "在你的电脑上激活",
    steps: ["打开 AI Translator。", "进入“设置 › 许可证”。", "粘贴密钥，然后点击“激活”。"],
    note: "每个密钥只能在 1 台电脑上使用。请保留此邮件，以便重装系统或更换电脑后重新激活。",
    guide: "详细步骤",
    guidePath: "/zh/guide/buy-and-activate/",
    help: "需要帮助？直接回复此邮件即可。",
    supportOutro: "你可以直接回复此邮件，或在 aitranslator.io.vn 或应用的“客服”页面重新打开聊天。",
  },
  ko: {
    date: (y, m, d) => `${y}년 ${m}월 ${d}일`,
    subject: {
      purchase: "AI Translator 라이선스 키",
      renewal: "AI Translator 플랜이 갱신되었습니다",
      plan_change: "AI Translator 플랜이 변경되었습니다",
      recover: "AI Translator 라이선스 키",
      resend: "AI Translator 라이선스 키",
      support: "AI Translator 지원팀의 답변",
    },
    heading: {
      purchase: "AI Translator를 구매해 주셔서 감사합니다",
      renewal: "플랜이 갱신되었습니다",
      plan_change: "플랜이 변경되었습니다",
      recover: "라이선스 키",
      resend: "라이선스 키",
      support: "지원팀이 답변했습니다",
    },
    lead: {
      purchase: "라이선스 키를 보내 드립니다.",
      renewal: "갱신해 주셔서 감사합니다. 키는 그대로이므로 다시 활성화할 필요가 없습니다.",
      plan_change: "감사합니다. 키는 그대로이므로 다시 활성화할 필요가 없습니다.",
      recover: "이 이메일로 구매한 유효한 라이선스 키입니다.",
      resend: "요청하신 라이선스 키를 다시 보내 드립니다.",
      support: "AI Translator 지원팀이 메시지에 답변했습니다.",
    },
    eyebrow: { license: "라이선스 키", support: "지원" },
    plan: "플랜",
    expires: "만료일",
    stepsTitle: "컴퓨터에서 활성화하기",
    steps: ["AI Translator를 엽니다.", "설정 › 라이선스로 이동합니다.", "키를 붙여 넣고 활성화를 클릭합니다."],
    note: "키 하나는 컴퓨터 1대에서 사용할 수 있습니다. 다시 설치하거나 컴퓨터를 바꿀 때 다시 활성화할 수 있도록 이 이메일을 보관하세요.",
    guide: "자세한 안내",
    guidePath: "/ko/guide/buy-and-activate/",
    help: "도움이 필요하면 이 이메일에 회신하세요.",
    supportOutro: "이 이메일에 회신하거나, aitranslator.io.vn 또는 앱의 지원 화면에서 채팅을 다시 열 수 있습니다.",
  },
};

/** Câu dẫn của phần tiếng Anh nằm dưới phần ngôn ngữ của khách: trỏ lên key ở trên, không lặp lại key. */
export const EN_BELOW: Record<MailKind, Counted> = {
  purchase: { one: "Your license key is shown above.", many: "Your license keys are shown above." },
  renewal: "Thank you for renewing. Your key (above) stays the same; no need to activate it again.",
  plan_change: "Your plan has changed. Your key (above) stays the same; no need to activate it again.",
  recover: { one: "The active license key for this email is shown above.", many: "The active license keys for this email are shown above." },
  resend: { one: "Your license key is shown above, sent again as you asked.", many: "Your license keys are shown above, sent again as you asked." },
  support: "AI Translator support has replied to your message (above).",
};
```

- [ ] **Step 5: Tạo `server/src/email/layout.ts`**

```ts
// Khung HTML của thư gửi khách (spec 2026-10-23 §2): bảng lồng, kiểu đặt inline, không ảnh (hộp thư chặn ảnh từ xa, tải ảnh là
// một cách theo dõi người đọc), không font web, không script. Mọi chữ động đi qua escapeHtml; link chỉ trỏ tới SITE_URL. Màu theo
// website (website/src/assets/site.css). Khối <style> lo màn hình hẹp và hộp thư tối (Apple Mail, iOS Mail, Outlook cho Mac);
// Gmail bỏ qua khối này và tự đảo màu, nên bản sáng vẫn phải đọc được khi bị đảo.
import type { Lang } from "../lang";
import { SITE_URL } from "./strings";

const C = {
  bg: "#f1f5fb",
  card: "#ffffff",
  line: "#dfe7f2",
  lineStrong: "#c6d3e6",
  ink: "#0b1322",
  ink2: "#3d4a63",
  ink3: "#6b7891",
  brand: "#1d63c9",
  brandInk: "#0f4aa3",
  brandSoft: "#e7f0ff",
};
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Hiragino Sans','Yu Gothic','PingFang SC','Microsoft YaHei','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
const MONO = "'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

// Màn hình ≤ 600 px: key 34 ký tự cỡ 14 px vừa một dòng ở 375 px. Bảng màu tối theo website.
const STYLE = [
  "body{margin:0;padding:0;-webkit-text-size-adjust:100%}",
  "@media (max-width:600px){.card{border-radius:0!important;border-left:0!important;border-right:0!important}.pad{padding-left:20px!important;padding-right:20px!important}.key{font-size:14px!important;letter-spacing:0!important}.outer{padding:0!important}}",
  "@media (prefers-color-scheme:dark){.bg{background:#080d18!important}.card{background:#111a2d!important;border-color:#1f2c47!important}.ink{color:#eef3fb!important}.ink2{color:#c3cde0!important}.ink3{color:#98a5bf!important}.keybox{background:#12274a!important;border-color:#2b3b5c!important}.key{color:#8fc0ff!important}.soft{background:#0c1322!important;border-color:#1f2c47!important}.rule{border-color:#1f2c47!important}.num{background:#12274a!important;color:#8fc0ff!important}a{color:#8fc0ff!important}}",
].join("\n");

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}

/** Cả thư. `rows` là các hàng `<tr>` của thẻ thư: mainRow, rồi RULE_ROW và englishRow, hay END_ROW khi không có phần tiếng Anh. */
export function emailPage(lang: Lang, subject: string, preheader: string, rows: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
${STYLE}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:${C.bg};">
<tr><td align="center" class="outer" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:14px;font-family:${FONT};">
<tr><td class="pad" style="padding:24px 32px 0;"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${C.brand};vertical-align:middle;"></span><span class="ink" style="font-size:15px;font-weight:700;color:${C.ink};vertical-align:middle;letter-spacing:.2px;">&nbsp;AI Translator</span></td></tr>
${rows}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FONT};">
<tr><td class="ink3" align="center" style="padding:18px 20px 0;font-size:12px;line-height:18px;color:${C.ink3};">AI Translator · <a href="${SITE_URL}/" style="color:${C.ink3};text-decoration:underline;">aitranslator.io.vn</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Phần ngôn ngữ của khách. */
export const mainRow = (inner: string) => `<tr><td class="pad" style="padding:20px 32px 8px;">${inner}</td></tr>`;
/** Đường kẻ giữa phần ngôn ngữ của khách và phần tiếng Anh. */
export const RULE_ROW = `<tr><td class="pad" style="padding:8px 32px 0;"><div class="rule" style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:0;">&nbsp;</div></td></tr>`;
/** Phần tiếng Anh ở dưới. */
export const englishRow = (inner: string) => `<tr><td class="pad" lang="en" style="padding:20px 32px 26px;">${inner}</td></tr>`;
/** Khoảng trống cuối thẻ khi thư chỉ có tiếng Anh. */
export const END_ROW = `<tr><td style="height:18px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

export const eyebrow = (text: string) =>
  `<p class="ink3" style="margin:0 0 6px;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:${C.ink3};">${escapeHtml(text)}</p>`;

export const heading = (text: string) =>
  `<h1 class="ink" style="margin:0 0 10px;font-size:22px;line-height:30px;font-weight:700;color:${C.ink};">${escapeHtml(text)}</h1>`;

export const subheading = (text: string) =>
  `<h2 class="ink" style="margin:0 0 8px;font-size:16px;line-height:22px;font-weight:700;color:${C.ink};">${escapeHtml(text)}</h2>`;

/** Một đoạn; mảng thì mỗi phần tử một dòng. `small`: chữ 14 px; `muted`: chữ mờ; `last`: không cách dưới. */
export function para(lines: string | readonly string[], opts: { small?: boolean; muted?: boolean; last?: boolean } = {}): string {
  const [size, lineHeight] = opts.small ? ([14, 22] as const) : ([15, 24] as const);
  const [cls, color] = opts.muted ? (["ink3", C.ink3] as const) : (["ink2", C.ink2] as const);
  const text = (typeof lines === "string" ? [lines] : lines).map(escapeHtml).join("<br>");
  return `<p class="${cls}" style="margin:0 0 ${opts.last ? 0 : 14}px;font-size:${size}px;line-height:${lineHeight}px;color:${color};">${text}</p>`;
}

/** Link tới một trang của website (href ghép từ SITE_URL trong mã, không lấy từ dữ liệu của khách). */
export const linkPara = (href: string, label: string) =>
  `<p style="margin:0 0 14px;font-size:14px;line-height:22px;"><a href="${escapeHtml(href)}" style="color:${C.brand};text-decoration:none;font-weight:600;">${escapeHtml(label)} →</a></p>`;

/** Ô key: key chữ đơn cách (một lần chạm chọn cả key) và dòng "Gói **Monthly** · Hết hạn **22/11/2026**". */
export function keyBox(key: string, details: readonly (readonly [string, string])[]): string {
  const line = details
    .map(([label, value]) => `${escapeHtml(label)} <b class="ink" style="color:${C.ink};">${escapeHtml(value)}</b>`)
    .join(" &nbsp;·&nbsp; ");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr><td class="keybox" align="center" style="background:${C.brandSoft};border:1px solid ${C.lineStrong};border-radius:10px;padding:16px 14px;">
<div class="key" style="font-family:${MONO};font-size:19px;font-weight:600;letter-spacing:1.2px;color:${C.brandInk};-webkit-user-select:all;user-select:all;">${escapeHtml(key)}</div>
<div class="ink2" style="margin-top:8px;font-size:13px;line-height:20px;color:${C.ink2};">${line}</div>
</td></tr></table>`;
}

/** Các bước đánh số trong vòng tròn (phần ngôn ngữ của khách). */
export function stepList(title: string, steps: readonly string[]): string {
  const rows = steps
    .map(
      (t, i) =>
        `<tr><td valign="top" style="padding:0 12px 10px 0;width:24px;"><div class="num" style="width:24px;height:24px;border-radius:12px;background:${C.brandSoft};color:${C.brandInk};font-size:13px;font-weight:700;line-height:24px;text-align:center;">${i + 1}</div></td><td class="ink" valign="top" style="padding:2px 0 10px;font-size:15px;line-height:21px;color:${C.ink};">${escapeHtml(t)}</td></tr>`,
    )
    .join("\n");
  return `<p class="ink" style="margin:8px 0 12px;font-size:15px;line-height:22px;font-weight:700;color:${C.ink};">${escapeHtml(title)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;">${rows}</table>`;
}

/** Các bước gọn "1. … 2. … 3. …" (phần tiếng Anh ở dưới). */
export function compactSteps(title: string, steps: readonly string[]): string {
  const body = [`<b class="ink" style="color:${C.ink};">${escapeHtml(title)}</b>`, ...steps.map((t, i) => `${i + 1}. ${escapeHtml(t)}`)].join("<br>");
  return `<p class="ink2" style="margin:0 0 14px;font-size:14px;line-height:22px;color:${C.ink2};">${body}</p>`;
}

/** Một câu trả lời của hỗ trợ: giữ nguyên văn và xuống dòng như người vận hành gõ. */
export const replyBox = (text: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr><td class="soft ink" style="background:${C.bg};border:1px solid ${C.line};border-radius:10px;padding:14px 16px;font-size:15px;line-height:23px;color:${C.ink};white-space:pre-wrap;">${escapeHtml(text)}</td></tr></table>`;
```

- [ ] **Step 6: Viết lại `server/src/email/templates.ts`**

Thay toàn bộ nội dung file bằng:

```ts
// Thư gửi khách: thư license key và thư trả lời chat hỗ trợ, viết bằng ngôn ngữ app của khách, phần tiếng Anh ở dưới (app tiếng
// Anh thì chỉ tiếng Anh). Mỗi thư có bản HTML (layout.ts) và bản chữ thuần cùng nội dung (spec 2026-10-23-email-theo-ngon-ngu-design.md).
import type { Lang } from "../lang";
import { formatLicenseKey } from "../license-key";
import {
  compactSteps,
  END_ROW,
  emailPage,
  englishRow,
  eyebrow,
  heading,
  keyBox,
  linkPara,
  mainRow,
  para,
  RULE_ROW,
  replyBox,
  stepList,
  subheading,
} from "./layout";
import { EN_BELOW, type LicenseEmailKind, MAIL, type MailStrings, pick, SITE_URL } from "./strings";

export type { LicenseEmailKind } from "./strings";

export interface LicenseEmailEntry {
  licenseKey: string;
  /** Tên hiển thị của gói (src/plans.ts, PLAN_NAMES), giữ tiếng Anh ở mọi ngôn ngữ như giao diện app. */
  planName: string;
  expiresAt: number;
}

export interface Email {
  subject: string;
  html: string;
  text: string;
}

/**
 * Ngôn ngữ thư (spec 2026-10-23 §1, D2): ngôn ngữ app đã biết; không có (app ≤ 0.2.4, key cấp tay) thì đơn USD ra tiếng Anh, còn
 * lại tiếng Việt (Việt trên, Anh dưới, như thư trước đợt này).
 */
export function mailLang(lang: Lang | null, currency: string | null): Lang {
  if (lang) return lang;
  return currency === "USD" ? "en" : "vi";
}

/** Thư mua, lấy lại và gửi lại có các bước kích hoạt; thư gia hạn và đổi gói thì key giữ nguyên, không cần kích hoạt lại. */
const WITH_STEPS: ReadonlySet<LicenseEmailKind> = new Set<LicenseEmailKind>(["purchase", "recover", "resend"]);
const RULE_TEXT = "─".repeat(28);
const FOOTER_TEXT = ["", "--", "AI Translator · aitranslator.io.vn", ""];

/** Ngày hết hạn theo giờ Việt Nam (UTC+7, không đổi theo mùa), viết theo ngôn ngữ. */
function dateIn(s: MailStrings, epochSeconds: number): string {
  const vn = new Date((epochSeconds + 7 * 3600) * 1000);
  return s.date(vn.getUTCFullYear(), vn.getUTCMonth() + 1, vn.getUTCDate());
}

const guideUrl = (s: MailStrings) => `${SITE_URL}${s.guidePath}`;
const numbered = (steps: readonly string[]) => steps.map((t, i) => `  ${i + 1}. ${t}`);

export function licenseEmail(lang: Lang, kind: LicenseEmailKind, entries: readonly LicenseEmailEntry[]): Email {
  const s = MAIL[lang];
  const en = MAIL.en;
  const n = entries.length;
  const below = lang !== "en";
  const steps = WITH_STEPS.has(kind);
  const subject = below ? `${pick(s.subject[kind], n)} / ${pick(en.subject[kind], n)}` : pick(en.subject[kind], n);
  const enLines = entries.map((e) => `${e.planName} · ${en.expires} ${dateIn(en, e.expiresAt)}`);

  const main = [
    eyebrow(s.eyebrow.license),
    heading(pick(s.heading[kind], n)),
    para(pick(s.lead[kind], n)),
    ...entries.map((e) =>
      keyBox(formatLicenseKey(e.licenseKey), [
        [s.plan, e.planName],
        [s.expires, dateIn(s, e.expiresAt)],
      ]),
    ),
    steps ? stepList(s.stepsTitle, s.steps) : "",
    para(s.note, { small: true }),
    linkPara(guideUrl(s), s.guide),
    para(s.help, { small: true, muted: true, last: true }),
  ];
  const english = [
    eyebrow("English"),
    subheading(pick(en.heading[kind], n)),
    para(pick(EN_BELOW[kind], n), { small: true }),
    para(enLines, { small: true }),
    steps ? compactSteps(en.stepsTitle, en.steps) : "",
    para(en.note, { small: true }),
    linkPara(guideUrl(en), en.guide),
    para(en.help, { small: true, muted: true, last: true }),
  ];
  const rows = [mainRow(main.filter(Boolean).join("\n")), ...(below ? [RULE_ROW, englishRow(english.filter(Boolean).join("\n"))] : [END_ROW])];
  // Dòng xem trước hiện cả ở thông báo trên điện thoại, nên chỉ có gói và hạn, không có key.
  const first = entries[0];
  const preheader = first ? `${s.plan} ${first.planName} · ${s.expires} ${dateIn(s, first.expiresAt)}` : pick(s.lead[kind], n);

  const text = ["AI Translator", "", pick(s.heading[kind], n), pick(s.lead[kind], n), ""];
  entries.forEach((e, i) => {
    if (i > 0) text.push("");
    text.push(`    ${formatLicenseKey(e.licenseKey)}`, `    ${s.plan} ${e.planName} · ${s.expires} ${dateIn(s, e.expiresAt)}`);
  });
  text.push("");
  if (steps) text.push(s.stepsTitle, ...numbered(s.steps), "");
  text.push(s.note, `${s.guide}: ${guideUrl(s)}`, s.help);
  if (below) {
    text.push("", RULE_TEXT, "English", "", pick(en.heading[kind], n), pick(EN_BELOW[kind], n), ...enLines.map((l) => `  ${l}`), "");
    if (steps) text.push(en.stepsTitle, ...numbered(en.steps), "");
    text.push(en.note, `${en.guide}: ${guideUrl(en)}`, en.help);
  }
  text.push(...FOOTER_TEXT);
  return { subject, html: emailPage(lang, subject, preheader, rows.join("\n")), text: text.join("\n") };
}

/**
 * Thư gửi câu trả lời của hỗ trợ cho khách đã rời khung chat (chat hỗ trợ, spec 2026-10-22 §2.6), viết bằng ngôn ngữ của cuộc chat.
 * Câu trả lời giữ nguyên văn người vận hành gõ. Khách trả lời thư thì về support@ (Reply-To của Resend).
 */
export function supportReplyEmail(lang: Lang, replies: readonly string[]): Email {
  const s = MAIL[lang];
  const en = MAIL.en;
  const below = lang !== "en";
  const subject = below ? `${pick(s.subject.support, 1)} / ${pick(en.subject.support, 1)}` : pick(en.subject.support, 1);
  const main = [
    eyebrow(s.eyebrow.support),
    heading(pick(s.heading.support, 1)),
    para(pick(s.lead.support, 1)),
    ...replies.map(replyBox),
    para(s.supportOutro, { small: true, last: true }),
  ];
  const english = [
    eyebrow("English"),
    subheading(pick(en.heading.support, 1)),
    para(pick(EN_BELOW.support, 1), { small: true }),
    para(en.supportOutro, { small: true, last: true }),
  ];
  const rows = [mainRow(main.join("\n")), ...(below ? [RULE_ROW, englishRow(english.join("\n"))] : [END_ROW])];

  const text = ["AI Translator", "", pick(s.heading.support, 1), pick(s.lead.support, 1), ""];
  replies.forEach((r, i) => {
    if (i > 0) text.push("");
    text.push(...r.split("\n").map((l) => (l ? `  ${l}` : "")));
  });
  text.push("", s.supportOutro);
  if (below) text.push("", RULE_TEXT, "English", "", pick(en.heading.support, 1), pick(EN_BELOW.support, 1), en.supportOutro);
  text.push(...FOOTER_TEXT);
  return { subject, html: emailPage(lang, subject, pick(s.lead.support, 1), rows.join("\n")), text: text.join("\n") };
}
```

- [ ] **Step 7: `sendLicenseMail` nhận ngôn ngữ, gửi kèm HTML**

Trong `server/src/deps.ts`:

Thay import

```ts
import { type LicenseEmailEntry, type LicenseEmailKind, licenseEmail } from "./email/templates";
import type { ApiEnv } from "./env";
```

bằng

```ts
import { type LicenseEmailEntry, type LicenseEmailKind, licenseEmail } from "./email/templates";
import type { ApiEnv } from "./env";
import type { Lang } from "./lang";
```

Thay

```ts
/**
 * Gửi email chứa key. Resend báo idempotency key đã dùng (409 invalid_idempotent_request) thì coi là đã gửi.
```

bằng

```ts
/**
 * Gửi email chứa key, viết bằng `lang` (phần tiếng Anh ở dưới, trừ khi `lang` là tiếng Anh; chọn `lang` bằng `mailLang`, spec
 * 2026-10-23). Resend báo idempotency key đã dùng (409 invalid_idempotent_request) thì coi là đã gửi.
```

Thay

```ts
  to: string,
  kind: LicenseEmailKind,
  entries: LicenseEmailEntry[],
  opts: { idempotencyKey?: string; alert?: boolean } = {},
): Promise<MailResult> {
  const { subject, text } = licenseEmail(kind, entries);
  try {
    const key = opts.idempotencyKey;
    await deps.email.send(key ? { to, subject, text, idempotencyKey: key } : { to, subject, text });
```

bằng

```ts
  to: string,
  lang: Lang,
  kind: LicenseEmailKind,
  entries: LicenseEmailEntry[],
  opts: { idempotencyKey?: string; alert?: boolean } = {},
): Promise<MailResult> {
  const { subject, html, text } = licenseEmail(lang, kind, entries);
  try {
    const key = opts.idempotencyKey;
    await deps.email.send(key ? { to, subject, text, html, idempotencyKey: key } : { to, subject, text, html });
```

- [ ] **Step 8: Thư mua, gia hạn, đổi gói theo ngôn ngữ của đơn (`orders.ts`)**

Trong `server/src/orders.ts`:

Thêm import, sau dòng `import { type Deps, sendLicenseMail } from "./deps";`:

```ts
import { mailLang } from "./email/templates";
```

Thay

```ts
 * Gửi email sau khi cấp; idempotency key theo đơn để Resend không gửi hai lần (kể cả khi cron gửi lại).
```

bằng

```ts
 * Gửi email sau khi cấp, bằng ngôn ngữ app lúc tạo đơn (đơn không có ngôn ngữ thì đoán theo loại tiền, spec 2026-10-23 §1);
 * idempotency key theo đơn để Resend không gửi hai lần (kể cả khi cron gửi lại).
```

Thay

```ts
  order: Pick<OrderRow, "order_code" | "email">,
```

bằng

```ts
  order: Pick<OrderRow, "order_code" | "email" | "lang" | "currency">,
```

Thay

```ts
  const res = await sendLicenseMail(
    db,
    deps,
    order.email,
    mailKind(g.kind),
```

bằng

```ts
  const res = await sendLicenseMail(
    db,
    deps,
    order.email,
    mailLang(order.lang, order.currency),
    mailKind(g.kind),
```

Trong `retryUnsentEmails`, thay

```ts
    `SELECT o.order_code, o.email, o.grant_kind, l.license_key, l.plan, l.expires_at
```

bằng

```ts
    `SELECT o.order_code, o.email, o.lang, o.currency, o.grant_kind, l.license_key, l.plan, l.expires_at
```

và thay

```ts
    .all<{
      order_code: number;
      email: string;
      grant_kind: Granted["kind"];
```

bằng

```ts
    .all<{
      order_code: number;
      email: string;
      lang: Lang | null;
      currency: string;
      grant_kind: Granted["kind"];
```

- [ ] **Step 9: Các chỗ gọi khác**

`server/src/licenses.ts` (recover), thay

```ts
        await sendLicenseMail(
          db,
          deps,
          email,
          "recover",
```

bằng

```ts
        await sendLicenseMail(
          db,
          deps,
          email,
          "vi",
          "recover",
```

`server/src/admin.ts`, cấp key tay, thay

```ts
    await sendLicenseMail(c.env.DB, deps, email, "purchase", [{ licenseKey: key, planName: PLAN_NAMES[plan], expiresAt }]);
```

bằng

```ts
    // Cấp tay không qua app nên không biết ngôn ngữ của khách: tiếng Việt, phần tiếng Anh ở dưới (spec 2026-10-23 D3).
    await sendLicenseMail(c.env.DB, deps, email, "vi", "purchase", [{ licenseKey: key, planName: PLAN_NAMES[plan], expiresAt }]);
```

`server/src/admin.ts`, gửi lại key, thay

```ts
    const { ok: sent } = await sendLicenseMail(c.env.DB, deps, lic.email, "resend", [
```

bằng

```ts
    const { ok: sent } = await sendLicenseMail(c.env.DB, deps, lic.email, "vi", "resend", [
```

`server/src/support/cron.ts`, thay import

```ts
import { supportReplyEmail } from "../email/templates";
```

bằng

```ts
import { supportReplyEmail } from "../email/templates";
import type { Lang } from "../lang";
```

thay

```ts
    `SELECT c.id, c.email, MAX(c.delivered_owner_id, c.emailed_owner_id) AS seen
```

bằng

```ts
    `SELECT c.id, c.email, c.lang, MAX(c.delivered_owner_id, c.emailed_owner_id) AS seen
```

thay

```ts
    .all<{ id: number; email: string; seen: number }>();
```

bằng

```ts
    .all<{ id: number; email: string; lang: Lang; seen: number }>();
```

thay

```ts
    const { subject, text } = supportReplyEmail(replies.map((r) => r.text));
```

bằng

```ts
    // Thư viết bằng ngôn ngữ của cuộc chat (app gửi ngôn ngữ giao diện, website gửi ngôn ngữ trang), tiếng Anh ở dưới (spec 2026-10-23).
    const { subject, html, text } = supportReplyEmail(conv.lang, replies.map((r) => r.text));
```

và thay

```ts
      await deps.email.send({ to: conv.email, subject, text, idempotencyKey: `support-${conv.id}-${last.id}` });
```

bằng

```ts
      await deps.email.send({ to: conv.email, subject, text, html, idempotencyKey: `support-${conv.id}-${last.id}` });
```

Kiểm còn chỗ gọi nào chưa sửa:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm typecheck
```
Expected: không lỗi. Có lỗi ở chỗ gọi nào khác thì sửa theo cùng cách (thêm ngôn ngữ).

- [ ] **Step 10: Test thư hỗ trợ theo ngôn ngữ của cuộc chat**

Trong `server/test/support-cron.test.ts`, thêm ngay sau test `"email câu trả lời: sau 2 phút khách chưa nhận thì một thư gộp; …"`:

```ts
  it("thư trả lời viết bằng ngôn ngữ của cuộc chat, tiếng Anh ở dưới (spec 2026-10-23); chat tiếng Anh thì chỉ tiếng Anh", async () => {
    const w = makeWorld();
    await enableChat();
    const ip = { "cf-connecting-ip": "203.0.113.77" };
    const ko = await startChat(w, { lang: "ko" });
    await leaveEmail(w, ko.token, "ko@example.com");
    const en = await startChat(w, { lang: "en" }, ip);
    await leaveEmail(w, en.token, "en@example.com", ip);
    await webhook(w, ownerSays(`#${ko.code} 안녕하세요`));
    await webhook(w, ownerSays(`#${en.code} Hello`));
    w.clock.now = T0 + 120;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(2);
    const byTo = Object.fromEntries(w.resend.sent.map((m) => [m.to[0], m]));
    expect(byTo["ko@example.com"]?.subject).toBe("AI Translator 지원팀의 답변 / Reply from AI Translator support");
    expect(byTo["ko@example.com"]?.html).toMatch(/<html lang="ko">/);
    expect(byTo["ko@example.com"]?.text).toContain("  안녕하세요");
    expect(byTo["en@example.com"]?.subject).toBe("Reply from AI Translator support");
    expect(byTo["en@example.com"]?.text).not.toContain("(above)");
  });
```

- [ ] **Step 11: Sửa các test cũ so chữ của thư cũ**

Dạng thư đổi, nên các khẳng định dưới phải đổi theo (giá trị mới là chữ trong `strings.ts`). Dùng Edit với **replace_all** trong từng file, đúng số chỗ ghi trong ngoặc:

`server/test/orders.test.ts`:
- `"Đã gia hạn AI Translator / AI Translator renewed"` → `"Đã gia hạn gói AI Translator / Your AI Translator plan is renewed"` (1 chỗ)
- `"Đã đổi gói AI Translator / AI Translator plan changed"` → `"Đã đổi gói AI Translator / Your AI Translator plan has changed"` (2 chỗ)
- `toContain("Yearly, hết hạn")` → `toContain("Gói Yearly · Hết hạn")` (1 chỗ)
- `toContain("6 Months, hết hạn")` → `toContain("Gói 6 Months · Hết hạn")` (2 chỗ)

`server/test/admin.test.ts`:
- `toContain("Yearly, hết hạn")` → `toContain("Gói Yearly · Hết hạn")` (1 chỗ)
- `toContain("6 Months, hết hạn")` → `toContain("Gói 6 Months · Hết hạn")` (1 chỗ)

`server/test/support-cron.test.ts`:
- `toContain("Câu một\n\nCâu hai")` → `toContain("  Câu một\n\n  Câu hai")` (1 chỗ; bản chữ thuần thụt mỗi dòng câu trả lời 2 dấu cách)

Kiểm không còn chữ cũ:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && grep -rn 'AI Translator renewed\|plan changed"\|, hết hạn"\|"Câu một' test/ ; echo "grep xong"
```
Expected: chỉ in `grep xong` (dòng `toContain("  Câu một…` có hai dấu cách nên không khớp `"Câu một`).

- [ ] **Step 12: Chạy toàn bộ test server, test script và typecheck, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm typecheck && pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL' && pnpm test:scripts 2>&1 | grep -E '^ℹ (tests|pass|fail)'
```
Expected: không `FAIL`; `ℹ fail 0`, `ℹ tests` = mốc Task 0 + 2. Test nào khác còn so chữ thư cũ thì sửa giá trị mong đợi theo chữ mới (không sửa mã cho khớp test cũ), liệt kê trong commit.

- [ ] **Step 13: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add server/src/email/strings.ts server/src/email/layout.ts server/src/email/templates.ts server/src/deps.ts server/src/orders.ts server/src/licenses.ts server/src/admin.ts server/src/support/cron.ts server/test/email.test.ts server/test/orders.test.ts server/test/admin.test.ts server/test/support-cron.test.ts server/test/node/email-strings.test.mjs && git commit -m "feat(server): thư HTML kèm chữ thuần theo ngôn ngữ app, tiếng Anh ở dưới (thư key theo đơn, thư hỗ trợ theo cuộc chat)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Checkout lưu `lang`; thư mua theo đơn

**Files:**
- Modify: `server/src/checkout.ts` (`POST /v1/checkout`)
- Modify: `server/test/world.ts` (`buy`, `buyCreem` nhận `lang`)
- Test: `server/test/checkout.test.ts`, `server/test/orders.test.ts`, `server/test/reconcile.test.ts`

- [ ] **Step 1: `buy` và `buyCreem` của test nhận `lang`**

Trong `server/test/world.ts`:

Thay

```ts
  async function buy(opts: { plan?: string; email?: string; licenseKey?: string } = {}) {
```

bằng

```ts
  async function buy(opts: { plan?: string; email?: string; licenseKey?: string; lang?: string } = {}) {
```

và trong `buy`, thay

```ts
    if (opts.licenseKey) req.license_key = opts.licenseKey;
    const co = await call("POST", "/v1/checkout", req);
    if (co.status !== 201) throw new Error(`checkout ${co.status} ${JSON.stringify(co.body)}`);
    const orderCode = co.body.order_code as number;
    payos.pay(orderCode);
```

bằng

```ts
    if (opts.licenseKey) req.license_key = opts.licenseKey;
    if (opts.lang) req.lang = opts.lang;
    const co = await call("POST", "/v1/checkout", req);
    if (co.status !== 201) throw new Error(`checkout ${co.status} ${JSON.stringify(co.body)}`);
    const orderCode = co.body.order_code as number;
    payos.pay(orderCode);
```

Thay

```ts
  async function buyCreem(opts: { plan?: string; email?: string; licenseKey?: string; tax?: number } = {}) {
```

bằng

```ts
  async function buyCreem(opts: { plan?: string; email?: string; licenseKey?: string; tax?: number; lang?: string } = {}) {
```

và trong `buyCreem`, thay

```ts
    if (opts.licenseKey) req.license_key = opts.licenseKey;
    const co = await call("POST", "/v1/checkout", req);
    if (co.status !== 201) throw new Error(`checkout ${co.status} ${JSON.stringify(co.body)}`);
    const orderCode = co.body.order_code as number;
    const checkoutId = creem.checkoutIdOf(orderCode);
```

bằng

```ts
    if (opts.licenseKey) req.license_key = opts.licenseKey;
    if (opts.lang) req.lang = opts.lang;
    const co = await call("POST", "/v1/checkout", req);
    if (co.status !== 201) throw new Error(`checkout ${co.status} ${JSON.stringify(co.body)}`);
    const orderCode = co.body.order_code as number;
    const checkoutId = creem.checkoutIdOf(orderCode);
```

- [ ] **Step 2: Viết test hỏng**

`server/test/checkout.test.ts`, thêm vào cuối `describe("POST /v1/checkout", …)` (trước dấu `});` đóng khối đó):

```ts
  it("lưu ngôn ngữ giao diện app (spec 2026-10-23): mã hợp lệ thì lưu; thiếu, sai kiểu hay mã lạ thì NULL mà vẫn tạo đơn", async () => {
    const w = makeWorld();
    const cases: [unknown, string | null][] = [
      ["ja", "ja"],
      ["vi", "vi"],
      [undefined, null],
      ["fr", null],
      ["VI", null],
      [5, null],
      [null, null],
    ];
    for (const [lang, stored] of cases) {
      const res = await w.call("POST", "/v1/checkout", lang === undefined ? valid : { ...valid, lang });
      expect(res.status, String(lang)).toBe(201);
      const row = await env.DB.prepare("SELECT lang FROM orders WHERE order_code = ?").bind(res.body.order_code as number).first();
      expect(row, String(lang)).toEqual({ lang: stored });
    }
  });
```

`server/test/orders.test.ts`, thêm vào **cuối file**:

```ts
describe("thư theo ngôn ngữ của đơn (spec 2026-10-23)", () => {
  it("đơn có lang: thư mua viết bằng ngôn ngữ đó, tiếng Anh ở dưới, có bản HTML", async () => {
    const w = makeWorld();
    await w.buy({ lang: "ja" });
    const mail = w.resend.sent.at(-1)!;
    expect(mail.subject).toBe("AI Translator のライセンスキー / Your AI Translator license key");
    expect(mail.html).toMatch(/<html lang="ja">/);
    expect(mail.text).toContain("ライセンスキーをお送りします。");
    expect(mail.text).toContain("Your license key is shown above.");
  });

  it("app cũ không gửi lang: đơn VND ra tiếng Việt (Việt trên, Anh dưới), đơn USD chỉ tiếng Anh", async () => {
    const w = makeWorld();
    await w.buy();
    expect(w.resend.sent.at(-1)!.subject).toBe("License key AI Translator của bạn / Your AI Translator license key");
    await w.buyCreem({ email: "card@example.com" });
    const card = w.resend.sent.at(-1)!;
    expect(card.subject).toBe("Your AI Translator license key");
    expect(card.text).not.toContain("Cảm ơn");
  });

  it("lang thắng loại tiền: đơn USD từ app tiếng Việt vẫn viết tiếng Việt", async () => {
    const w = makeWorld();
    await w.buyCreem({ lang: "vi" });
    expect(w.resend.sent.at(-1)!.subject).toBe("License key AI Translator của bạn / Your AI Translator license key");
  });

  it("thư gia hạn theo ngôn ngữ của đơn gia hạn, không theo đơn mua trước", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy({ lang: "ja" });
    const { orderCode } = await checkout(w, { license_key: licenseKey, lang: "ko" });
    w.payos.pay(orderCode);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    expect(w.resend.sent.at(-1)!.subject).toBe("AI Translator 플랜이 갱신되었습니다 / Your AI Translator plan is renewed");
  });
});
```

`server/test/reconcile.test.ts`, thêm ngay sau test `"đơn đã cấp mà chưa thử gửi thư lần nào (Worker dừng giữa chừng): cron gửi sau 5 phút"`:

```ts
  it("cron gửi lại thư bằng ngôn ngữ lưu trên đơn (spec 2026-10-23)", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true, lang: "zh" });
    const orderCode = res.body.order_code as number;
    w.payos.pay(orderCode);
    w.resend.down = true;
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(orderCode));
    w.resend.down = false;
    w.clock.now = T0 + 300;
    expect((await reconcile(w.env, w.deps)).emails_retried).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]!.subject).toBe("你的 AI Translator 许可证密钥 / Your AI Translator license key");
  });
```

- [ ] **Step 3: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm exec vitest run test/checkout.test.ts test/orders.test.ts test/reconcile.test.ts -t "ngôn ngữ|lang" 2>&1 | grep -E '✓|×|Tests ' | head -20
```
Expected: test checkout lưu lang đỏ (`lang` luôn NULL); "đơn có lang", "lang thắng loại tiền", "thư gia hạn theo ngôn ngữ", "cron gửi lại thư bằng ngôn ngữ" đỏ; "app cũ không gửi lang" xanh (đã đúng từ Task 4).

- [ ] **Step 4: Checkout lưu `lang`**

Trong `server/src/checkout.ts`:

Thêm import, sau dòng `import { clientIp, fail, parseEmail, readJson, tooMany } from "./http";`:

```ts
import { parseLang } from "./lang";
```

Thay

```ts
    const currency = body.currency === undefined ? "VND" : body.currency;
    if (!isCurrency(currency)) return fail(c, 400, "invalid_request", { field: "currency" });
```

bằng

```ts
    const currency = body.currency === undefined ? "VND" : body.currency;
    if (!isCurrency(currency)) return fail(c, 400, "invalid_request", { field: "currency" });
    // Ngôn ngữ giao diện app lúc tạo đơn (spec 2026-10-23 §3), lưu để thư gửi key viết bằng ngôn ngữ đó. Thiếu, sai kiểu hay mã lạ
    // (app sau này có thêm ngôn ngữ mà server chưa biết) thì NULL: không bao giờ chặn việc mua vì ngôn ngữ thư.
    const lang = parseLang(body.lang);
```

Thay

```ts
        `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email, email_consent_at,
                             renew_license_id, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING order_code`,
      )
      .bind(await sha256Hex(orderToken), provider, plan, amount, currency, email, now, renewLicenseId, now, expiresAt)
```

bằng

```ts
        `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email, email_consent_at,
                             renew_license_id, lang, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING order_code`,
      )
      .bind(await sha256Hex(orderToken), provider, plan, amount, currency, email, now, renewLicenseId, lang, now, expiresAt)
```

- [ ] **Step 5: Chạy toàn bộ test server và typecheck, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm typecheck && pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
```
Expected: không `FAIL`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add server/src/checkout.ts server/test/world.ts server/test/checkout.test.ts server/test/orders.test.ts server/test/reconcile.test.ts && git commit -m "feat(server): checkout lưu ngôn ngữ app vào đơn, thư mua và gia hạn viết theo ngôn ngữ đó" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Lấy lại key theo `lang` của request

**Files:**
- Modify: `server/src/licenses.ts` (`POST /v1/licenses/recover`)
- Test: `server/test/recover.test.ts`

- [ ] **Step 1: Viết test hỏng**

Trong `server/test/recover.test.ts`, thêm ngay sau test `"gửi mọi key còn hiệu lực của email vào chính email đó"`:

```ts
  it("thư viết bằng ngôn ngữ app gửi kèm (spec 2026-10-23), không theo đơn đã mua; thiếu hay mã lạ thì tiếng Việt", async () => {
    const w = makeWorld();
    await w.buy({ email: "buyer@example.com", lang: "ja" });
    w.resend.sent.length = 0;
    await w.call("POST", "/v1/licenses/recover", { email: "buyer@example.com", lang: "ko" });
    await w.call("POST", "/v1/licenses/recover", { email: "buyer@example.com", lang: "fr" });
    await w.call("POST", "/v1/licenses/recover", { email: "buyer@example.com" });
    expect(w.resend.sent.map((m) => m.subject)).toEqual([
      "AI Translator 라이선스 키 / Your AI Translator license key",
      "License key AI Translator của bạn / Your AI Translator license key",
      "License key AI Translator của bạn / Your AI Translator license key",
    ]);
  });
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm exec vitest run test/recover.test.ts 2>&1 | grep -E '✓|×|Tests '
```
Expected: test mới đỏ (thư đầu là tiếng Việt).

- [ ] **Step 3: Đọc `lang` của request**

Trong `server/src/licenses.ts`:

Thay import

```ts
import { type Deps, sendLicenseMail } from "./deps";
```

bằng

```ts
import { type Deps, sendLicenseMail } from "./deps";
import { mailLang } from "./email/templates";
```

và thêm, sau dòng `import { clientIp, fail, parseDeviceIdHash, parseDeviceLabel, parseEmail, parseUuid, readJson, tooMany } from "./http";`:

```ts
import { parseLang } from "./lang";
```

Thay

```ts
    const byIp = await hit(c.env, "recover_ip", clientIp(c), now);
    const byEmail = await hit(c.env, "recover_email", email, now);
    if (!byIp.allowed || !byEmail.allowed) return tooMany(c, Math.max(byIp.retryAfter, byEmail.retryAfter));
```

bằng

```ts
    const byIp = await hit(c.env, "recover_ip", clientIp(c), now);
    const byEmail = await hit(c.env, "recover_email", email, now);
    if (!byIp.allowed || !byEmail.allowed) return tooMany(c, Math.max(byIp.retryAfter, byEmail.retryAfter));
    // Ngôn ngữ giao diện app gửi kèm (spec 2026-10-23 §3): chỉ để chọn ngôn ngữ thư, không lưu. Thiếu hay mã lạ thì tiếng Việt.
    const lang = mailLang(parseLang(body?.lang), null);
```

và thay

```ts
          email,
          "vi",
          "recover",
```

bằng

```ts
          email,
          lang,
          "recover",
```

- [ ] **Step 4: Chạy toàn bộ test server và typecheck, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm typecheck && pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
```
Expected: không `FAIL`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add server/src/licenses.ts server/test/recover.test.ts && git commit -m "feat(server): thư lấy lại key viết theo ngôn ngữ app gửi kèm" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Web Admin "Gửi lại key" theo đơn gần nhất; ẩn danh xóa `lang`

**Files:**
- Modify: `server/src/admin.ts` (`POST /admin/licenses/:id/resend`, `POST /admin/erase`)
- Test: `server/test/admin.test.ts`

- [ ] **Step 1: Viết test hỏng**

Trong `server/test/admin.test.ts`, thêm ngay sau test `"gửi lại key vào email của license và ghi nhật ký"`:

```ts
  it("gửi lại key: thư theo ngôn ngữ của đơn mới nhất của key; key cấp tay (không có đơn) thì tiếng Việt (spec 2026-10-23 §1)", async () => {
    const { w, adminCall } = makeAdmin();
    const { licenseKey } = await w.buy({ lang: "ja" });
    // Gia hạn từ app tiếng Trung: đơn mới nhất của key là đơn này.
    const re = await w.call("POST", "/v1/checkout", { plan: "monthly", email: "buyer@example.com", consent: true, license_key: licenseKey, lang: "zh" });
    w.payos.pay(re.body.order_code as number);
    await w.call("POST", "/v1/webhooks/payos", await w.payos.webhookBody(re.body.order_code as number));
    const id = (await licenseRow())!.id as string;
    w.resend.sent.length = 0;
    await adminCall(`/admin/licenses/${id}/resend`, { body: {} });
    expect(w.resend.sent[0]!.subject).toBe("你的 AI Translator 许可证密钥 / Your AI Translator license key");
    const created = await adminCall("/admin/licenses", { body: { email: "gift@example.com", plan: "monthly", note: "tặng" } });
    expect(w.resend.sent.at(-1)!.subject).toBe("License key AI Translator của bạn / Your AI Translator license key");
    await adminCall(`/admin/licenses/${created.body.license_id as string}/resend`, { body: {} });
    expect(w.resend.sent.at(-1)!.subject).toBe("License key AI Translator của bạn / Your AI Translator license key");
  });

  it("gửi lại key của đơn USD từ app cũ (không có lang): chỉ tiếng Anh", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buyCreem();
    const id = (await licenseRow())!.id as string;
    w.resend.sent.length = 0;
    await adminCall(`/admin/licenses/${id}/resend`, { body: {} });
    expect(w.resend.sent[0]!.subject).toBe("Your AI Translator license key");
  });
```

Trong `describe("Q9: xóa dữ liệu cá nhân theo email", …)`, thêm ngay sau test `"bỏ email và device_label, giữ số liệu kế toán, key vẫn dùng được"`:

```ts
  it("xóa luôn ngôn ngữ lưu trên đơn (spec 2026-10-23 §3); đơn của email khác giữ nguyên", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy({ email: "erase@example.com", lang: "ja" });
    await w.buy({ email: "keep@example.com", lang: "ko" });
    await adminCall("/admin/erase", { body: { email: "erase@example.com", note: "yêu cầu xóa" } });
    const rows = await env.DB.prepare("SELECT email, lang FROM orders ORDER BY order_code").all();
    expect(rows.results).toEqual([
      { email: null, lang: null },
      { email: "keep@example.com", lang: "ko" },
    ]);
  });
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm exec vitest run test/admin.test.ts -t "gửi lại key|ngôn ngữ lưu trên đơn" 2>&1 | grep -E '✓|×|Tests '
```
Expected: ba test mới đỏ (gửi lại key luôn tiếng Việt; ẩn danh còn `lang: "ja"`).

- [ ] **Step 3: Sửa `admin.ts`**

Thêm import, sau dòng `import { sendLicenseMail } from "./deps";`:

```ts
import { mailLang } from "./email/templates";
```

và sau dòng `import { fail, isRecord, parseDeviceIdHash, parseEmail, parseUuid, readJson } from "./http";`:

```ts
import type { Lang } from "./lang";
```

Trong `app.post("/admin/licenses/:id/resend", …)`, thay

```ts
    if (!lic.email) return fail(c, 400, "invalid_request", { field: "email" });
    const { ok: sent } = await sendLicenseMail(c.env.DB, deps, lic.email, "vi", "resend", [
```

bằng

```ts
    if (!lic.email) return fail(c, 400, "invalid_request", { field: "email" });
    // Ngôn ngữ thư theo đơn mới nhất đã cấp cho key này (spec 2026-10-23 §1); key cấp tay không có đơn nào thì tiếng Việt.
    const last = await c.env.DB.prepare("SELECT lang, currency FROM orders WHERE license_id = ? ORDER BY order_code DESC LIMIT 1")
      .bind(id)
      .first<{ lang: Lang | null; currency: string }>();
    const lang = mailLang(last?.lang ?? null, last?.currency ?? null);
    const { ok: sent } = await sendLicenseMail(c.env.DB, deps, lic.email, lang, "resend", [
```

Trong `app.post("/admin/erase", …)`, thay

```ts
      db.prepare("UPDATE orders SET email = NULL WHERE email = ?").bind(email),
```

bằng

```ts
      // Bỏ cả ngôn ngữ lưu trên đơn (spec 2026-10-23 §3): chính sách mục 7 chỉ giữ dòng đơn ở mức kế toán.
      db.prepare("UPDATE orders SET email = NULL, lang = NULL WHERE email = ?").bind(email),
```

- [ ] **Step 4: Chạy toàn bộ test server và typecheck, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm typecheck && pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL'
```
Expected: không `FAIL`; test ẩn danh cũ (`{ activations: 1, licenses: 1, orders: 1 }`) vẫn xanh (số dòng đổi không đổi).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add server/src/admin.ts server/test/admin.test.ts && git commit -m "feat(server): Web Admin gửi lại key theo ngôn ngữ của đơn gần nhất; ẩn danh theo email xóa cả ngôn ngữ trên đơn" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: App gửi `lang` khi tạo đơn và khi lấy lại key

**Files:**
- Modify: `src-tauri/src/license/client.rs` (trait `LicenseApi`, `HttpApi::checkout`, `HttpApi::recover`, test)
- Modify: `src-tauri/src/license/purchase.rs` (`start`, test)
- Modify: `src-tauri/src/license/manager.rs` (`FakeApi` trong test)
- Modify: `src-tauri/src/license/app.rs` (`start_checkout`, `recover`, hàm `ui_lang`)

- [ ] **Step 1: Viết test hỏng (client)**

Trong `src-tauri/src/license/client.rs` (module test):

Thay toàn bộ test `checkout_sends_consent_the_currency_and_the_key_only_when_renewing`:

```rust
    #[test]
    fn checkout_sends_consent_the_currency_and_the_key_only_when_renewing() {
        let body = r#"{"order_code":7,"order_token":"t","checkout_url":"https://pay.payos.vn/web/x","qr_code":"000201","plan":"monthly","amount":50000,"currency":"VND","expires_at":9}"#;
        let (base, seen) = serve(vec![(201, vec![], body), (201, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        let order = api.checkout("monthly", "a@b.vn", None, "VND").result.unwrap();
        assert_eq!(order.order_code, 7);
        // Server cũ (≤ 0.1.9) không có `provider`: không đoán, để nơi dùng coi là PayOS.
        assert_eq!((order.qr_code.as_deref(), order.provider), (Some("000201"), None));
        api.checkout("monthly", "a@b.vn", Some("KEY"), "VND").result.unwrap();
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            reqs[0].body,
            json!({ "plan": "monthly", "email": "a@b.vn", "consent": true, "currency": "VND" })
        );
        assert_eq!(reqs[1].body["license_key"], "KEY");
    }
```

bằng

```rust
    /// Ngôn ngữ giao diện đi kèm đơn (spec 2026-10-23 §4) để server viết thư gửi key bằng ngôn ngữ đó.
    #[test]
    fn checkout_sends_consent_the_currency_the_ui_language_and_the_key_only_when_renewing() {
        let body = r#"{"order_code":7,"order_token":"t","checkout_url":"https://pay.payos.vn/web/x","qr_code":"000201","plan":"monthly","amount":50000,"currency":"VND","expires_at":9}"#;
        let (base, seen) = serve(vec![(201, vec![], body), (201, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        let order = api.checkout("monthly", "a@b.vn", None, "VND", "ja").result.unwrap();
        assert_eq!(order.order_code, 7);
        // Server cũ (≤ 0.1.9) không có `provider`: không đoán, để nơi dùng coi là PayOS.
        assert_eq!((order.qr_code.as_deref(), order.provider), (Some("000201"), None));
        api.checkout("monthly", "a@b.vn", Some("KEY"), "VND", "vi").result.unwrap();
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            reqs[0].body,
            json!({ "plan": "monthly", "email": "a@b.vn", "consent": true, "currency": "VND", "lang": "ja" })
        );
        assert_eq!((reqs[1].body["license_key"].as_str(), reqs[1].body["lang"].as_str()), (Some("KEY"), Some("vi")));
    }

    /// Lấy lại key gửi kèm ngôn ngữ giao diện (spec 2026-10-23 §4); server chỉ dùng để chọn ngôn ngữ thư.
    #[test]
    fn recover_sends_the_email_and_the_ui_language() {
        let (base, seen) = serve(vec![(200, vec![], r#"{"ok":true}"#)]);
        let api = HttpApi::new(accept_base(&base, true));
        api.recover("a@b.vn", "ko").result.unwrap();
        let req = seen.lock().unwrap()[0].clone();
        assert_eq!(req.path, "/v1/licenses/recover");
        assert_eq!(req.body, json!({ "email": "a@b.vn", "lang": "ko" }));
    }
```

Trong test `a_card_checkout_has_no_qr_code_and_names_its_provider`, thay

```rust
        let order = api.checkout("monthly", "a@b.vn", None, "USD").result.unwrap();
```

bằng

```rust
        let order = api.checkout("monthly", "a@b.vn", None, "USD", "en").result.unwrap();
```

Trong test có dòng `let Err(ApiError::Server(e)) = api.recover("a@b.vn").result else {`, thay dòng đó bằng

```rust
        let Err(ApiError::Server(e)) = api.recover("a@b.vn", "vi").result else {
```

- [ ] **Step 2: Viết test hỏng (purchase)**

Trong `src-tauri/src/license/purchase.rs` (module test), thêm ngay sau test `a_new_order_draws_the_qr_and_is_kept_for_polling` (sau dấu `}` đóng test đó):

```rust
    /// Ngôn ngữ giao diện đi kèm đơn (spec 2026-10-23 §4): `start` chuyển nguyên mã cho server.
    #[test]
    fn a_checkout_carries_the_ui_language() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "monthly", "a@b.vn", true, false, "VND", "ja").unwrap();
        assert_eq!(api.calls.lock().unwrap()[0], "checkout monthly a@b.vn - ja");
    }
```

Thêm tham số `"vi"` vào mọi lời gọi `start(&l, …)` có sẵn trong test của `purchase.rs` (khoảng 22 chỗ, mọi chỗ đều trên một dòng và kết thúc bằng `"VND")`, `"USD")` hay `currency)`):

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/src-tauri && perl -pi -e 's/(start\(&l, [^;\n]*?, (?:"VND"|"USD"|currency))\)/$1, "vi")/g' src/license/purchase.rs && grep -c 'start(&l, ' src/license/purchase.rs && grep -n 'start(&l, ' src/license/purchase.rs | grep -v '"vi")\|"ja")'
```
Expected: số đếm bằng số lời gọi (≈ 23 kể cả test mới); lệnh `grep -v` cuối không in dòng nào (mọi lời gọi đã có ngôn ngữ).

- [ ] **Step 3: Chạy, thấy đỏ (không biên dịch)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && cargo test --locked -p meeting-translator --lib license:: 2>&1 | grep -E '^error|this method takes|this function takes' | head -5
```
Expected: lỗi biên dịch về số tham số của `checkout`, `recover`, `start`.

- [ ] **Step 4: Trait và `HttpApi`**

Trong `src-tauri/src/license/client.rs`, thay

```rust
    /// `currency`: `VND` (VietQR qua PayOS) hay `USD` (thẻ qua Creem; spec 2026-10-14 D4).
    fn checkout(&self, plan: &str, email: &str, license_key: Option<&str>, currency: &str) -> Reply<Checkout>;
```

bằng

```rust
    /// `currency`: `VND` (VietQR qua PayOS) hay `USD` (thẻ qua Creem; spec 2026-10-14 D4). `lang`: mã ngôn ngữ giao diện (`vi`,
    /// `en`, `ja`, `zh`, `ko`), server lưu vào đơn để viết thư gửi key bằng ngôn ngữ đó (spec 2026-10-23).
    fn checkout(&self, plan: &str, email: &str, license_key: Option<&str>, currency: &str, lang: &str) -> Reply<Checkout>;
```

thay

```rust
    fn recover(&self, email: &str) -> Reply<()>;
```

bằng

```rust
    /// `lang`: như ở `checkout`; server chỉ dùng để chọn ngôn ngữ thư, không lưu.
    fn recover(&self, email: &str, lang: &str) -> Reply<()>;
```

thay

```rust
    fn checkout(&self, plan: &str, email: &str, license_key: Option<&str>, currency: &str) -> Reply<Checkout> {
        let mut body = json!({ "plan": plan, "email": email, "consent": true, "currency": currency });
```

bằng

```rust
    fn checkout(&self, plan: &str, email: &str, license_key: Option<&str>, currency: &str, lang: &str) -> Reply<Checkout> {
        let mut body = json!({ "plan": plan, "email": email, "consent": true, "currency": currency, "lang": lang });
```

và thay

```rust
    fn recover(&self, email: &str) -> Reply<()> {
        unit(self.call::<Ok200>("POST", "/v1/licenses/recover", Some(json!({ "email": email })), None))
    }
```

bằng

```rust
    fn recover(&self, email: &str, lang: &str) -> Reply<()> {
        let body = json!({ "email": email, "lang": lang });
        unit(self.call::<Ok200>("POST", "/v1/licenses/recover", Some(body), None))
    }
```

- [ ] **Step 5: `FakeApi` của test (`manager.rs`)**

Trong `src-tauri/src/license/manager.rs`, thay

```rust
        fn checkout(&self, plan: &str, email: &str, key: Option<&str>, currency: &str) -> Reply<Checkout> {
            // Ghi loại tiền chỉ khi không phải VND, để các dòng ghi của đơn VietQR giữ nguyên.
            let currency = if currency == "VND" {
                String::new()
            } else {
                format!(" {currency}")
            };
            self.calls
                .lock()
                .unwrap()
                .push(format!("checkout {plan} {email} {}{currency}", key.unwrap_or("-")));
```

bằng

```rust
        fn checkout(&self, plan: &str, email: &str, key: Option<&str>, currency: &str, lang: &str) -> Reply<Checkout> {
            // Ghi loại tiền chỉ khi không phải VND, và ngôn ngữ chỉ khi không phải vi, để các dòng ghi của đơn VietQR từ app
            // tiếng Việt giữ nguyên.
            let currency = if currency == "VND" {
                String::new()
            } else {
                format!(" {currency}")
            };
            let lang = if lang == "vi" { String::new() } else { format!(" {lang}") };
            self.calls
                .lock()
                .unwrap()
                .push(format!("checkout {plan} {email} {}{currency}{lang}", key.unwrap_or("-")));
```

và thay

```rust
        fn recover(&self, _: &str) -> Reply<()> {
```

bằng

```rust
        fn recover(&self, _: &str, _: &str) -> Reply<()> {
```

- [ ] **Step 6: `purchase::start` nhận ngôn ngữ**

Trong `src-tauri/src/license/purchase.rs`, thay

```rust
/// Tạo đơn bằng loại tiền `currency` (`VND` hay `USD`). `renew`: gia hạn hay đổi gói key đang có (cần đã kích hoạt). Thiếu ô
/// đồng ý thì từ chối, không gọi server (§10.1).
pub fn start(
    license: &License,
    plan: &str,
    email: &str,
    consent: bool,
    renew: bool,
    currency: &str,
) -> Result<CheckoutView, LicenseError> {
```

bằng

```rust
/// Tạo đơn bằng loại tiền `currency` (`VND` hay `USD`). `renew`: gia hạn hay đổi gói key đang có (cần đã kích hoạt). `lang`: mã
/// ngôn ngữ giao diện, để server viết thư gửi key bằng ngôn ngữ đó (spec 2026-10-23). Thiếu ô đồng ý thì từ chối, không gọi
/// server (§10.1).
pub fn start(
    license: &License,
    plan: &str,
    email: &str,
    consent: bool,
    renew: bool,
    currency: &str,
    lang: &str,
) -> Result<CheckoutView, LicenseError> {
```

và thay

```rust
    let reply = license.api().checkout(plan, &email, key.as_deref(), currency);
```

bằng

```rust
    let reply = license.api().checkout(plan, &email, key.as_deref(), currency, lang);
```

- [ ] **Step 7: Lệnh của app lấy ngôn ngữ giao diện (`app.rs`)**

Trong `src-tauri/src/license/app.rs`, thêm import sau dòng `use crate::security::keystore::Keystore;`:

```rust
use crate::settings::UiLanguage;
```

Thêm hàm, ngay trước `pub fn start_checkout<R: Runtime>(`:

```rust
/// Mã ngôn ngữ giao diện lúc khách bấm (`vi`, `en`, `ja`, `zh`, `ko`), gửi kèm tạo đơn và lấy lại key để server viết thư gửi key
/// bằng ngôn ngữ đó (spec 2026-10-23-email-theo-ngon-ngu-design.md §4). Cùng mã app gửi ở chat hỗ trợ.
fn ui_lang<R: Runtime>(app: &AppHandle<R>) -> &'static str {
    crate::support::lang_code(app.try_state::<AppState>().map_or(UiLanguage::En, |state| state.settings().ui_language))
}

```

Thay

```rust
    let view =
        purchase::start(&*license_or_error(app)?, plan, email, consent, renew, currency).map_err(command_error)?;
```

bằng

```rust
    let view = purchase::start(&*license_or_error(app)?, plan, email, consent, renew, currency, ui_lang(app))
        .map_err(command_error)?;
```

Thay

```rust
    let reply = license.api().recover(email.trim());
```

bằng

```rust
    let reply = license.api().recover(email.trim(), ui_lang(app));
```

- [ ] **Step 8: Định dạng, chạy test, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && cargo fmt --all && cargo test --locked -p meeting-translator --lib license:: 2>&1 | grep -E '^test result|FAILED|panicked' | head
```
Expected: `test result: ok.`, không `FAILED`. `cargo fmt` có thể xuống dòng các chữ ký dài, giữ nguyên kết quả của nó.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | tail -3 && cargo test --locked -p meeting-translator --lib 2>&1 | grep -E '^test result|FAILED'
```
Expected: clippy không cảnh báo (dòng cuối `Finished`); `test result: ok.`.

- [ ] **Step 9: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add src-tauri/src/license/client.rs src-tauri/src/license/purchase.rs src-tauri/src/license/manager.rs src-tauri/src/license/app.rs && git commit -m "feat(app): gửi ngôn ngữ giao diện khi tạo đơn và khi lấy lại key, để thư viết theo ngôn ngữ đó" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Chính sách (nội dung 1.6), trang Dữ liệu và bảo mật năm ngôn ngữ, hợp đồng API trong spec gốc

Dòng phiên bản của chính sách **vẫn ghi 1.5** ở task này; Task 12 (ngày phát hành) mới đổi thành 1.6 kèm ngày hiệu lực.

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`, `docs/legal/README.md`
- Modify: `website/src/content/{vi,en,ja,zh,ko}/data-security.mjs`
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (bảng API §6.8)
- Test: `website/test/site.test.mjs`

- [ ] **Step 1: Viết test hỏng (website)**

Thêm vào **cuối** `website/test/site.test.mjs`:

```js
// ---- Email theo ngôn ngữ app (spec 2026-10-23-email-theo-ngon-ngu-design §5): chính sách 1.6, Dữ liệu và bảo mật năm ngôn ngữ ----

test("chính sách quyền riêng tư nêu ngôn ngữ giao diện lưu trên đơn (mục 5) và bị bỏ khi xóa theo email (mục 7)", () => {
  const errors = [
    ...sectionErrors("/chinh-sach-quyen-rieng-tu/", {
      5: ["ngôn ngữ giao diện của ứng dụng lúc mua", "gửi thư bằng ngôn ngữ của bạn"],
      7: ["cùng ngôn ngữ giao diện lưu trên đơn hàng"],
    }),
    ...sectionErrors("/en/privacy/", {
      5: ["interface language at purchase", "email you in your language"],
      7: ["the interface language stored on your orders"],
    }),
  ];
  assert.deepEqual(errors, []);
});

test("Dữ liệu và bảo mật (năm ngôn ngữ): app gửi ngôn ngữ giao diện khi mua và khôi phục key; máy chủ lưu nó trên đơn để gửi thư đúng ngôn ngữ", () => {
  const needs = {
    "/bao-mat-du-lieu/": ["email và ngôn ngữ giao diện của app khi bạn mua hoặc khôi phục key", "ngôn ngữ giao diện của app lúc mua", "gửi thư bằng ngôn ngữ của bạn"],
    "/en/data-security/": ["interface language when you buy or recover a key", "interface language at purchase", "emailing you in your language"],
    "/ja/data-security/": ["メールアドレスとアプリの表示言語も", "購入時のアプリの表示言語", "お使いの言語でのメール送付"],
    "/zh/data-security/": ["你的邮箱和应用的界面语言", "购买时应用的界面语言", "用你的语言发送邮件"],
    "/ko/data-security/": ["이메일과 앱의 인터페이스 언어도", "구매 시 앱의 인터페이스 언어", "사용자의 언어로 이메일 발송"],
  };
  const errors = [];
  for (const [urlPath, list] of Object.entries(needs)) {
    const text = textOf(htmlByPath.get(urlPath));
    for (const needle of list) if (!text.includes(needle)) errors.push(`${urlPath}: thiếu "${needle}"`);
  }
  assert.deepEqual(errors, []);
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/website && node --test --test-name-pattern 'ngôn ngữ giao diện' test/site.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail)'
```
Expected: `ℹ tests 2`, `ℹ fail 2`.

- [ ] **Step 3: Chính sách tiếng Việt**

Trong `docs/legal/privacy.vi.md`, thay

```
| Đơn hàng: mã đơn, gói, số tiền và loại tiền, thời điểm thanh toán, trạng thái, mã phiên thanh toán của cổng (PayOS hay Creem) | Cấp và gia hạn license; đối soát; nghĩa vụ kế toán |
```

bằng

```
| Đơn hàng: mã đơn, gói, số tiền và loại tiền, thời điểm thanh toán, trạng thái, mã phiên thanh toán của cổng (PayOS hay Creem), ngôn ngữ giao diện của ứng dụng lúc mua | Cấp và gia hạn license; đối soát; nghĩa vụ kế toán; gửi thư bằng ngôn ngữ của bạn |
```

và thay

```
- **bỏ** email và tên máy của bạn;
```

bằng

```
- **bỏ** email và tên máy của bạn, cùng ngôn ngữ giao diện lưu trên đơn hàng;
```

- [ ] **Step 4: Chính sách tiếng Anh**

Trong `docs/legal/privacy.en.md`, thay

```
| Orders: order code, plan, amount and currency, payment time, status, the payment gateway's session ID (PayOS or Creem) | Issue and renew licenses; reconciliation; accounting obligations |
```

bằng

```
| Orders: order code, plan, amount and currency, payment time, status, the payment gateway's session ID (PayOS or Creem), the app's interface language at purchase | Issue and renew licenses; reconciliation; accounting obligations; email you in your language |
```

và thay

```
- **remove** your email and computer name;
```

bằng

```
- **remove** your email and computer name, and the interface language stored on your orders;
```

- [ ] **Step 5: README pháp lý**

Trong `docs/legal/README.md`, thay

```
> **Chưa được luật sư hay kế toán xem.**
```

bằng (thêm một đoạn và một dòng trống phía trên, giữ nguyên phần còn lại của dòng cũ):

```
**Chính sách 1.6 thêm ngôn ngữ của thư** theo spec `2026-10-23-email-theo-ngon-ngu-design.md` (mục 5): app gửi ngôn ngữ giao diện (`vi`, `en`, `ja`, `zh`, `ko`) khi tạo đơn và khi khôi phục key; máy chủ lưu ngôn ngữ đó trên đơn (`orders.lang`) để thư gửi key, kể cả các lần gửi lại, viết bằng ngôn ngữ của khách, phần tiếng Anh ở dưới (chính sách mục 5, dòng "Đơn hàng"); ngôn ngữ gửi kèm khôi phục key chỉ dùng để chọn ngôn ngữ thư, không lưu. Xóa theo email bỏ luôn ngôn ngữ trên đơn (mục 7, dòng "bỏ"), nên danh sách "giữ lại" không đổi. Không thêm bên xử lý, không thêm kết nối mạng (cùng request tới `api.aitranslator.io.vn`). **EULA không đổi** (giữ bản 1.3). Ngày hiệu lực của chính sách 1.6 đặt theo mục "Đổi ngày hiệu lực" lúc phát hành bản app gửi ngôn ngữ (0.2.5). Website (trang Dữ liệu và bảo mật, năm ngôn ngữ) nói cùng điều đó.

> **Chưa được luật sư hay kế toán xem.**
```

Trong mục "Đổi ngày hiệu lực", bước 1, thay

```
Với chính sách 1.5, ở kế hoạch `2026-10-22-chat-ho-tro-04-phap-ly-noi-dung.md`, Task 10.
```

bằng

```
Với chính sách 1.5, ở kế hoạch `2026-10-22-chat-ho-tro-04-phap-ly-noi-dung.md`, Task 10. Với chính sách 1.6, ở kế hoạch `2026-10-23-email-theo-ngon-ngu.md`, Task 12.
```

- [ ] **Step 6: Trang Dữ liệu và bảo mật, năm ngôn ngữ**

Mỗi file hai chỗ: hàng `api.aitranslator.io.vn` của bảng kết nối mạng, và hàng "Đơn hàng" của bảng dữ liệu máy chủ.

`website/src/content/vi/data-security.mjs`:
- `thêm email khi bạn mua hoặc khôi phục key` → `thêm email và ngôn ngữ giao diện của app khi bạn mua hoặc khôi phục key`
- `mã phiên thanh toán của cổng (PayOS hay Creem)</th><td>Cấp và gia hạn license, đối soát, kế toán</td>` → `mã phiên thanh toán của cổng (PayOS hay Creem), ngôn ngữ giao diện của app lúc mua</th><td>Cấp và gia hạn license, đối soát, kế toán, gửi thư bằng ngôn ngữ của bạn</td>`

`website/src/content/en/data-security.mjs`:
- `plus your email when you buy or recover a key` → `plus your email and the app's interface language when you buy or recover a key`
- `the payment gateway's session ID (PayOS or Creem)</th><td>Issuing and renewing licenses, reconciliation, accounting</td>` → `the payment gateway's session ID (PayOS or Creem), the app's interface language at purchase</th><td>Issuing and renewing licenses, reconciliation, accounting, emailing you in your language</td>`

`website/src/content/ja/data-security.mjs`:
- `購入時とキーの再送時にはメールアドレスも。` → `購入時とキーの再送時にはメールアドレスとアプリの表示言語も。`
- `（PayOS または Creem）</th><td>ライセンスの発行と更新、照合、会計</td>` → `（PayOS または Creem）、購入時のアプリの表示言語</th><td>ライセンスの発行と更新、照合、会計、お使いの言語でのメール送付</td>`

`website/src/content/zh/data-security.mjs`:
- `购买或找回密钥时还有你的邮箱；` → `购买或找回密钥时还有你的邮箱和应用的界面语言；`
- `（PayOS 或 Creem）</th><td>签发和续期许可证、对账、会计</td>` → `（PayOS 或 Creem）、购买时应用的界面语言</th><td>签发和续期许可证、对账、会计、用你的语言发送邮件</td>`

`website/src/content/ko/data-security.mjs`:
- `구매하거나 키를 다시 받을 때는 이메일도.` → `구매하거나 키를 다시 받을 때는 이메일과 앱의 인터페이스 언어도.`
- `(PayOS 또는 Creem)</th><td>라이선스 발급과 연장, 대사, 회계</td>` → `(PayOS 또는 Creem), 구매 시 앱의 인터페이스 언어</th><td>라이선스 발급과 연장, 대사, 회계, 사용자의 언어로 이메일 발송</td>`

Mỗi chuỗi cũ phải xuất hiện đúng một lần trong file của nó (Edit báo lỗi nếu không). Ngày cập nhật của trang lấy từ git (`website/src/content/index.mjs`), không sửa tay trường `modified`.

- [ ] **Step 7: Hợp đồng API trong spec gốc §6.8**

Trong `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`, thay

```
email, consent: true, license_key?}` | `consent` là ô đồng ý xử lý email (§10.1)
```

bằng

```
email, consent: true, license_key?, lang?}` | `lang` là mã ngôn ngữ giao diện app (`vi`, `en`, `ja`, `zh`, `ko`), lưu vào đơn để thư gửi key viết bằng ngôn ngữ đó; thiếu hay mã lạ thì lưu NULL, không từ chối (spec `2026-10-23-email-theo-ngon-ngu-design.md`). `consent` là ô đồng ý xử lý email (§10.1)
```

và thay

```
| `POST /v1/licenses/recover` `{email}` | Gửi lại mọi key còn hiệu lực của email này vào chính email đó.
```

bằng

```
| `POST /v1/licenses/recover` `{email, lang?}` | Gửi lại mọi key còn hiệu lực của email này vào chính email đó, thư viết bằng `lang` (không lưu; thiếu hay mã lạ thì tiếng Việt, spec `2026-10-23-email-theo-ngon-ngu-design.md`).
```

- [ ] **Step 8: Chạy test website và test app đọc văn bản pháp lý, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/website && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail|skipped)'
```
Expected: `ℹ fail 0`; `ℹ tests` = mốc Task 0 + 2.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep -E 'Tests '
```
Expected: mọi test đạt.

- [ ] **Step 9: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add docs/legal/privacy.vi.md docs/legal/privacy.en.md docs/legal/README.md website/src/content/vi/data-security.mjs website/src/content/en/data-security.mjs website/src/content/ja/data-security.mjs website/src/content/zh/data-security.mjs website/src/content/ko/data-security.mjs website/test/site.test.mjs docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && git commit -m "docs(legal): nội dung chính sách 1.6 (ngôn ngữ giao diện lưu trên đơn để gửi thư đúng ngôn ngữ), Dữ liệu và bảo mật năm ngôn ngữ, hợp đồng API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Runbook phát hành, mục 12

**Files:**
- Modify: `docs/release/phat-hanh.md` (thêm mục 12 ở cuối file)

- [ ] **Step 1: Xem cuối file để nối đúng chỗ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && grep -n '^## ' docs/release/phat-hanh.md | tail -3 && tail -3 docs/release/phat-hanh.md
```
Expected: mục cuối là `## 11. Đợt thêm chat hỗ trợ (migration D1 0005)`.

- [ ] **Step 2: Thêm mục 12 vào cuối `docs/release/phat-hanh.md`**

Nối vào cuối file (sau một dòng trống):

````markdown
## 12. Đợt email theo ngôn ngữ app (migration D1 0006)

Spec `2026-10-23-email-theo-ngon-ngu-design.md` (mục 6), kế hoạch `2026-10-23-email-theo-ngon-ngu.md`. **Mỗi bước chỉ làm khi chủ dự án cho phép**; các lệnh ghi vào production do chủ dự án chạy. Thứ tự: migration, Worker API, Worker admin, thử thư thật, app 0.2.5 cùng chính sách 1.6, website. Chạy trong `server/`; `PROD` và `PADMIN` như mục 4.

Vì sao thứ tự này: migration 0006 chỉ **thêm** cột `orders.lang` (cho phép NULL, không dựng lại bảng), Worker cũ không đọc cột này nên chạy đúng trên schema mới; Worker API mới ghi và đọc `orders.lang`, Worker admin mới đọc nó (Gửi lại key) và xóa nó (ẩn danh theo email), nên cả hai chỉ lên sau migration. Server cũ bỏ qua trường `lang` lạ, nên app 0.2.5 lên trước server cũng không lỗi, nhưng chỉ server mới lưu được. Chính sách 1.6 nói máy chủ lưu ngôn ngữ trên đơn: máy chủ chỉ lưu khi app 0.2.5 gửi lên, nên app phát hành cùng chính sách 1.6; website nói điều đã thật nên đi sau.

**Điều kiện trước khi bắt đầu:** mã của kế hoạch đã gộp vào `main` (chủ dự án quyết lúc nào), CI xanh, `pnpm check` trong `server/` xanh trên `main`.

1. **Kiểm trước khi áp (chỉ đọc), ghi lại kết quả để so sau.**

   ```bash
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA table_info(orders)"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq"
   ```

   Expected: `time-travel info` in mốc hiện tại (chép lại); `table_info` **không** có dòng `lang` (có rồi thì dừng và báo: ai đó đã áp tay); chép lại `orders` và `orders_seq`.

2. **Áp migration lên production:**

   ```bash
   pnpm exec wrangler d1 migrations apply mt-license-production --remote
   ```

   Expected: chỉ liệt kê `0006_order_lang.sql`, hỏi xác nhận (trả lời `y`), rồi `✅`. Lỗi thì dừng, không deploy Worker, báo chủ dự án.

3. **Kiểm sau khi áp:**

   ```bash
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA table_info(orders)"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq, (SELECT COUNT(*) FROM orders WHERE lang IS NOT NULL) AS with_lang"
   ```

   Expected: `table_info` có dòng `lang` (`TEXT`, `notnull` 0); `orders` và `orders_seq` **bằng đúng** bước 1 (số đơn không được lùi: PayOS nhớ mọi `orderCode` đã dùng); `with_lang` bằng `0`. Lệch thì dừng, không deploy.

4. **Deploy Worker API:**

   ```bash
   pnpm check && pnpm exec wrangler deploy
   curl -s "$PROD/v1/health"; echo
   ```

   Expected: như mục 4 bước 9 (`Uploaded mt-license`, `schedule: */5 * * * *`, `{"ok":true}`). **Kiểm cron chạy thật** như mục 4 bước 9 (`pnpm exec wrangler tail mt-license --format pretty` qua một mốc 5 phút, thấy log `{"event":"reconcile",…}`); không thấy cron thì `pnpm exec wrangler triggers deploy` rồi kiểm lại (sự cố 2026-10-07).

5. **Deploy Worker admin** (ngay sau bước 4):

   ```bash
   pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
   curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/admin/whoami"
   ```

   Expected: như mục 4 bước 10 (khi chưa đăng nhập Access thì không phải `5xx`).

6. **Thử thư thật, trước khi phát hành app.** Dùng email của chủ dự án đang có key còn hạn. Mỗi email chỉ được lấy lại key 3 lần mỗi giờ, nên chạy ba ngôn ngữ trước, hai ngôn ngữ sau ít nhất một giờ:

   ```bash
   E='<email của chủ dự án>'
   for L in vi ja en; do curl -s -H 'content-type: application/json' -d "{\"email\":\"$E\",\"lang\":\"$L\"}" "$PROD/v1/licenses/recover"; echo; done
   # sau ít nhất một giờ:
   for L in zh ko; do curl -s -H 'content-type: application/json' -d "{\"email\":\"$E\",\"lang\":\"$L\"}" "$PROD/v1/licenses/recover"; echo; done
   ```

   Expected: mỗi lệnh in `{"ok":true}`; tới hộp thư năm thư. Xem ở Gmail (web và điện thoại) và Apple Mail (sáng và tối): tiêu đề `<ngôn ngữ> / <tiếng Anh>` (thư `en` chỉ tiếng Anh); phần tiếng Anh ở dưới đường kẻ (trừ thư `en`); key nằm trong ô xanh, chạm một lần chọn được cả key; "Hướng dẫn chi tiết" mở đúng trang của ngôn ngữ đó; không có ảnh bị chặn hay chữ vỡ. Thư hiện như chữ thuần ở hộp thư nào thì ghi lại tên hộp thư đó.

7. **Đặt ngày chính sách 1.6** theo kế hoạch `2026-10-23-email-theo-ngon-ngu.md`, Task 12, **trước khi build app**, rồi **phát hành app 0.2.5** theo mục 2.

8. **Deploy website** sau khi bản app đã lên R2 (kiểm R2 ở mục 2): `cd ../website && pnpm deploy`. Ngày hiệu lực chính sách 1.6 không được muộn hơn ngày deploy.

9. **Thử tay với app 0.2.5:** đổi giao diện sang tiếng Nhật, Cài đặt › Bản quyền › "Mất key?" › gửi lại key: thư tiếng Nhật, tiếng Anh ở dưới. Khi có đơn thật đầu tiên từ app 0.2.5, kiểm D1: `pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT order_code, lang, currency, status FROM orders ORDER BY order_code DESC LIMIT 5"`: đơn mới có `lang` đúng ngôn ngữ giao diện của người mua.

**Đường lui.** Thư lỗi hay xấu ở hộp thư nào đó: `pnpm exec wrangler rollback` (Worker API) về bản trước đợt này, thư quay về chữ thuần Việt trên, Anh dưới; cột `orders.lang` ở lại (Worker cũ không đọc), app 0.2.5 vẫn gửi `lang` và server cũ bỏ qua. Worker admin lỗi: `pnpm exec wrangler rollback -c wrangler.admin.jsonc`; sau khi lùi Worker admin, ẩn danh theo email **không** xóa `orders.lang`, nên chạy thêm `UPDATE orders SET lang = NULL WHERE email IS NULL AND lang IS NOT NULL` (đơn có email NULL là đơn đã ẩn danh). Migration 0006 không cần lùi: chỉ thêm một cột cho phép NULL.
````

- [ ] **Step 3: Kiểm**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && grep -n '^## 12\.' docs/release/phat-hanh.md && grep -c '0006_order_lang.sql' docs/release/phat-hanh.md
```
Expected: một dòng `## 12. Đợt email theo ngôn ngữ app (migration D1 0006)`; số đếm ≥ 1.

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add docs/release/phat-hanh.md && git commit -m "docs(release): mục 12, đợt email theo ngôn ngữ app (migration 0006, thử thư thật, app 0.2.5, chính sách 1.6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Kiểm toàn bộ và xem thư thật bằng mắt

**Files:** không đổi file nào (trừ khi phải sửa lỗi tìm ra; sửa thì thêm test và commit riêng).

- [ ] **Step 1: Server, đủ bộ kiểm như trước khi deploy**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && pnpm check 2>&1 | grep -E 'Tests |^ℹ (tests|pass|fail)|error|FAIL|Total Upload' | head -20
```
Expected: typecheck sạch; `vectors:check` không in khác biệt; vitest không `FAIL`; `test:scripts` `ℹ fail 0`; `ui:check` xanh; hai `dry-run` in `Total Upload`. So số test với mốc Task 0: vitest tăng đúng số test mới của Task 1–7, `test:scripts` tăng 2.

- [ ] **Step 2: Website**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/website && pnpm test 2>&1 | grep -E '^ℹ (tests|pass|fail|skipped)' && pnpm build 2>&1 | tail -2
```
Expected: `ℹ fail 0`; build xong không lỗi.

- [ ] **Step 3: App**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && cargo fmt --all -- --check && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | tail -1 && sh scripts/check-windows.sh --locked 2>&1 | tail -2 && cargo test --locked -p meeting-translator --lib 2>&1 | grep -E '^test result' && pnpm build 2>&1 | tail -1 && pnpm test 2>&1 | grep -E 'Tests ' && node scripts/ui-preview/check-i18n.mjs 2>&1 | tail -1
```
Expected: mọi lệnh xanh (`check-windows.sh` cần target Windows đã cài; thiếu thì ghi lại và báo, không bỏ qua im lặng).

- [ ] **Step 4: Dựng sáu thư mẫu từ mã thật**

Node tự bỏ kiểu của file `.ts`; một hook nhỏ cho Node tìm module viết không đuôi (`../lang` → `../lang.ts`) như bundler của Worker. Script nằm trong thư mục tạm, không commit.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/server && T=$(mktemp -d) && echo "$T" && cat > "$T/hooks.mjs" <<'EOF'
// Cho Node tìm module TypeScript viết không đuôi (`../lang` → `../lang.ts`), như bundler của Worker.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context);
    throw err;
  }
}
EOF
cat > "$T/register.mjs" <<'EOF'
import { register } from "node:module";
register("./hooks.mjs", import.meta.url);
EOF
cat > "$T/render.mjs" <<'EOF'
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const dir = process.argv[2];
const { licenseEmail, supportReplyEmail } = await import(pathToFileURL(`${process.cwd()}/src/email/templates.ts`).href);
const exp = (y, m, d) => Date.UTC(y, m - 1, d, 10) / 1000;
const k1 = "7QKM3XRT9WAZ4HNC2VPD8FJB6YGE";
const k2 = "K4TR8MZQ2XHW9NBA7CJV3PDF6EGY";
const mails = {
  "ja-mua": licenseEmail("ja", "purchase", [{ licenseKey: k1, planName: "Monthly", expiresAt: exp(2026, 11, 22) }]),
  "vi-mua": licenseEmail("vi", "purchase", [{ licenseKey: k1, planName: "Monthly", expiresAt: exp(2026, 11, 22) }]),
  "en-mua": licenseEmail("en", "purchase", [{ licenseKey: k1, planName: "Yearly", expiresAt: exp(2027, 10, 23) }]),
  "zh-giahan": licenseEmail("zh", "renewal", [{ licenseKey: k1, planName: "6 Months", expiresAt: exp(2027, 4, 21) }]),
  "vi-laylai": licenseEmail("vi", "recover", [
    { licenseKey: k1, planName: "Monthly", expiresAt: exp(2026, 11, 22) },
    { licenseKey: k2, planName: "Yearly", expiresAt: exp(2027, 6, 2) },
  ]),
  "ko-hotro": supportReplyEmail("ko", ["안녕하세요! 설정 › 오디오에서 다시 시작해 보세요.\n그래도 안 되면 이 이메일에 회신해 주세요.", "Zoom 회의에서도 같은 방법으로 됩니다."]),
};
for (const [name, m] of Object.entries(mails)) {
  writeFileSync(`${dir}/${name}.html`, m.html);
  writeFileSync(`${dir}/${name}.txt`, `${m.subject}\n\n${m.text}`);
}
console.log(`đã ghi ${Object.keys(mails).length} thư vào ${dir}`);
EOF
node --import "$T/register.mjs" "$T/render.mjs" "$T"
```
Expected: in đường dẫn thư mục tạm (chép lại, dùng ở bước sau) và `đã ghi 6 thư vào <thư mục>`. Lỗi cú pháp TypeScript Node không bỏ được (ví dụ `enum`) ở module nào thì báo, không sửa mã server cho riêng bước này.

- [ ] **Step 5: Chụp thư ở ba cỡ và hai chế độ màu**

Thay `<THƯ MỤC TẠM>` bằng đường dẫn in ở bước 4.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && T='<THƯ MỤC TẠM>' && cat > "$T/shoot.mjs" <<'EOF'
import { launch } from "/Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/website/tools/browser/cdp.mjs";
const dir = process.argv[2];
const b = await launch();
for (const name of ["ja-mua", "vi-mua", "en-mua", "zh-giahan", "vi-laylai", "ko-hotro"]) {
  for (const [suffix, opts] of [["", { width: 760, height: 900 }], ["-dien-thoai", { width: 375, height: 800, mobile: true }], ["-toi", { width: 760, height: 900, dark: true }]]) {
    const p = await b.newPage(opts);
    await p.goto(`file://${dir}/${name}.html`);
    await new Promise((r) => setTimeout(r, 300));
    await p.screenshot(`${dir}/${name}${suffix}.png`, { full: true });
    await p.close();
  }
}
await b.close();
EOF
node "$T/shoot.mjs" "$T" && ls "$T"/*.png | wc -l
```
Expected: `18`.

- [ ] **Step 6: Xem ảnh, so với bản mẫu đã duyệt**

Mở (Read) các ảnh `ja-mua.png`, `ja-mua-dien-thoai.png`, `ko-hotro-toi.png`, `vi-laylai.png`, `en-mua.png` trong thư mục tạm, và đọc `vi-mua.txt`, `ko-hotro.txt`. So với bản mẫu https://claude.ai/artifact/TkNhF57MUGmb6DctvdMKCj:
- đầu thư ô vuông xanh và chữ "AI Translator"; nhãn nhỏ, tiêu đề lớn, câu dẫn;
- key trong ô xanh nhạt, **một dòng** ở cỡ điện thoại (375 px); dưới key là gói và hạn;
- ba bước trong vòng tròn số (không có ở `zh-giahan`); link "Hướng dẫn chi tiết →";
- đường kẻ rồi phần tiếng Anh nhỏ hơn (không có ở `en-mua`);
- `vi-laylai` có hai ô key; `ko-hotro` có hai ô trả lời, giữ xuống dòng;
- chế độ tối: nền tối, chữ sáng, ô key xanh đậm.

Lệch bố cục so với bản mẫu thì sửa `layout.ts` (kèm test nếu là lỗi logic), chạy lại bước 4–5, commit riêng. Xong thì xóa thư mục tạm: `rm -rf '<THƯ MỤC TẠM>'`.

- [ ] **Step 7: Cây làm việc sạch, liệt kê commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git status --short && git log --oneline main..HEAD
```
Expected: `git status` trống; các commit của Task 1–10 (và commit sửa nếu có). Không merge, không push: báo chủ dự án kết quả và chờ quyết định.

---

### Task 12: Ngày phát hành: chính sách lên 1.6 và ngày hiệu lực

**Chỉ làm khi chủ dự án đã cho phép phát hành 0.2.5**, vào ngày phát hành, **trước khi nâng phiên bản và build app** (`docs/legal/README.md`, "Đổi ngày hiệu lực"; runbook mục 12 bước 7). Làm trên nhánh mà bản phát hành sẽ build (thường là `main` sau khi đã gộp; kiểm `git branch --show-current` và đường dẫn thư mục trước). Lệnh dưới lấy **ngày hôm nay theo giờ Việt Nam** (cùng múi giờ test sitemap dùng). EULA không đổi (giữ 1.3, ngày 2026-10-16).

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`, `docs/legal/README.md`, `website/test/site.test.mjs`

Các lệnh dưới viết cho worktree; nếu làm trên thư mục khác thì thay đường dẫn ở đầu mỗi lệnh.

- [ ] **Step 1: Sửa test trước: chính sách 1.6, ngày không sớm hơn 2026-10-23**

Trong `website/test/site.test.mjs`:

Thay

```js
test("chính sách quyền riêng tư 1.5 nêu Creem là bên bán lại (merchant of record), dữ liệu gửi và Creem tự thu, Creem giữ dữ liệu ngoài yêu cầu xóa, và website trong danh sách kết nối", () => {
```

bằng

```js
test("chính sách quyền riêng tư 1.6 nêu Creem là bên bán lại (merchant of record), dữ liệu gửi và Creem tự thu, Creem giữ dữ liệu ngoài yêu cầu xóa, và website trong danh sách kết nối", () => {
```

Thay

```js
  const viNeeds = ["Phiên bản 1.5", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "điền sẵn trang thanh toán", "số thẻ", "loại tiền"];
  const enNeeds = ["Version 1.5", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "pre-fill the payment page", "card number", "currency"];
```

bằng

```js
  const viNeeds = ["Phiên bản 1.6", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "điền sẵn trang thanh toán", "số thẻ", "loại tiền"];
  const enNeeds = ["Version 1.6", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "pre-fill the payment page", "card number", "currency"];
```

Thay

```js
  // EULA giữ bản 1.3, ngày 2026-10-16; chính sách lên 1.5 (chat hỗ trợ) với ngày hiệu lực SAU ngày của bản 1.4 (2026-10-18): ngày chưa
  // được đặt (còn ngày của bản 1.4) thì test đỏ. Đặt bản và ngày bằng lệnh ở kế hoạch chat-ho-tro-04, Task 10, trước khi build app.
  const privacyHead = docHeader(docs["privacy.vi.md"]);
  if (!/^\*\*Phiên bản 1\.3,/m.test(docs["eula.vi.md"]) || privacyHead?.version !== "1.5") errors.push("giữ EULA 1.3 và chính sách 1.5");
  if (!privacyHead || privacyHead.iso <= "2026-10-18") {
    errors.push(`chính sách 1.5 phải có ngày hiệu lực sau 2026-10-18 (ngày của bản 1.4), đang ghi ${privacyHead?.iso}: đặt ngày phát hành thật (docs/legal/README.md, "Đổi ngày hiệu lực")`);
  }
```

bằng

```js
  // EULA giữ bản 1.3, ngày 2026-10-16; chính sách lên 1.6 (ngôn ngữ của thư) với ngày hiệu lực không sớm hơn ngày của bản 1.5
  // (2026-10-23). Đặt bản và ngày bằng lệnh ở kế hoạch 2026-10-23-email-theo-ngon-ngu, Task 12, trước khi build app.
  const privacyHead = docHeader(docs["privacy.vi.md"]);
  if (!/^\*\*Phiên bản 1\.3,/m.test(docs["eula.vi.md"]) || privacyHead?.version !== "1.6") errors.push("giữ EULA 1.3 và chính sách 1.6");
  if (!privacyHead || privacyHead.iso < "2026-10-23") {
    errors.push(`chính sách 1.6 phải có ngày hiệu lực từ 2026-10-23 (ngày của bản 1.5) trở đi, đang ghi ${privacyHead?.iso}: đặt ngày phát hành thật (docs/legal/README.md, "Đổi ngày hiệu lực")`);
  }
```

Thay

```js
test("Dữ liệu và bảo mật khớp Chính sách quyền riêng tư 1.5: dòng phiên bản lấy từ docs/legal, hàng Creem, mục xóa dữ liệu, email gửi Creem viết chủ động, dấu phẩy", () => {
```

bằng

```js
test("Dữ liệu và bảo mật khớp Chính sách quyền riêng tư 1.6: dòng phiên bản lấy từ docs/legal, hàng Creem, mục xóa dữ liệu, email gửi Creem viết chủ động, dấu phẩy", () => {
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/website && node --test --test-name-pattern 'chính sách quyền riêng tư 1.6 nêu Creem|văn bản pháp lý \(điều khoản' test/site.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)|giữ EULA 1.3 và chính sách 1.6'
```
Expected: `ℹ fail 2` (hay `ℹ fail` ≥ 1 nếu tên test thứ hai khác); có dòng `giữ EULA 1.3 và chính sách 1.6`.

- [ ] **Step 3: Đặt 1.6 và ngày ở bốn nơi, bằng một lệnh**

Script tạm ở thư mục tạm (ngoài repo, không commit), chạy với ngày hôm nay theo giờ Việt Nam, rồi xóa. Mỗi chuỗi cũ phải xuất hiện đúng một lần, nên chạy lần hai thì báo lỗi và không đổi gì thêm.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && T=$(mktemp -d) && cat > "$T/dat-ngay-chinh-sach-1-6.mjs" <<'EOF'
// Đặt chính sách quyền riêng tư 1.6 (ngôn ngữ của thư) và ngày hiệu lực ở mọi nơi trong repo. Chạy: node dat-ngay-chinh-sach-1-6.mjs <thư mục repo> <YYYY-MM-DD>
import { readFileSync, writeFileSync } from "node:fs";

const [repo, iso] = process.argv.slice(2);
if (!repo || !/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) throw new Error("cách dùng: node dat-ngay-chinh-sach-1-6.mjs <thư mục repo> <YYYY-MM-DD>");
const [y, m, d] = iso.split("-");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const vi = `${d}/${m}/${y}`;
const en = `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;

// Mỗi chuỗi cũ phải xuất hiện đúng một lần: chạy lại lần hai (đã đổi rồi) thì báo lỗi, không đổi gì thêm.
function edit(file, from, to) {
  const path = `${repo}/${file}`;
  const text = readFileSync(path, "utf8");
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`${file}: "${from}" xuất hiện ${n} lần (cần đúng 1)`);
  writeFileSync(path, text.replace(from, () => to));
}

edit("docs/legal/privacy.vi.md", "**Phiên bản 1.5, hiệu lực từ 23/10/2026.**", `**Phiên bản 1.6, hiệu lực từ ${vi}.**`);
edit(
  "docs/legal/privacy.en.md",
  "**Version 1.5, effective 23 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**",
  `**Version 1.6, effective ${en}. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**`,
);
edit(
  "docs/legal/README.md",
  "**EULA phiên bản 1.3 (hiệu lực từ 2026-10-16) và chính sách quyền riêng tư phiên bản 1.5 (hiệu lực từ 2026-10-23)**",
  `**EULA phiên bản 1.3 (hiệu lực từ 2026-10-16) và chính sách quyền riêng tư phiên bản 1.6 (hiệu lực từ ${iso})**`,
);
edit("docs/legal/README.md", "chính sách quyền riêng tư 2026-10-23 (bản 1.5).", `chính sách quyền riêng tư ${iso} (bản 1.6).`);
console.log(`đã đặt chính sách 1.6, hiệu lực ${iso} (${vi} / ${en})`);
EOF
node "$T/dat-ngay-chinh-sach-1-6.mjs" "$PWD" "$(TZ=Asia/Ho_Chi_Minh date +%F)"; rm -rf "$T"
```
Expected: một dòng `đã đặt chính sách 1.6, hiệu lực <ngày hôm nay> (<dd/mm/yyyy> / <d tháng yyyy>)`. Lỗi `xuất hiện 0 lần` nghĩa là lệnh đã chạy rồi, hay dòng phiên bản không còn là 1.5, 23/10/2026.

- [ ] **Step 4: Kiểm ngày nhất quán, chạy test, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && grep -n '^\*\*Phiên bản\|^\*\*Version' docs/legal/privacy.vi.md docs/legal/privacy.en.md && grep -c 'chính sách quyền riêng tư phiên bản 1.6' docs/legal/README.md
```
Expected: hai dòng phiên bản `1.6` cùng một ngày; `1`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)'
```
Expected: `ℹ fail 0`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep -E 'Tests '
```
Expected: mọi test đạt.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/email-theo-ngon-ngu && git branch --show-current && git add docs/legal/privacy.vi.md docs/legal/privacy.en.md docs/legal/README.md website/test/site.test.mjs && git commit -m "docs(legal): chính sách quyền riêng tư lên bản 1.6, đặt ngày hiệu lực theo ngày phát hành" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Sau đó mới nâng phiên bản và build app theo `docs/release/phat-hanh.md` mục 2 (runbook mục 12 bước 7). Website deploy (bước 8) do chủ dự án chạy khi 0.2.5 đã lên R2.

---

## Tự rà

**Phủ spec:**
- §1 ngôn ngữ từng loại thư và `mailLang`: Task 4 (hàm, thư mua/gia hạn/đổi gói theo đơn kể cả cron, thư hỗ trợ theo cuộc chat, cấp tay `vi`), Task 5 (checkout lưu `lang`, test đơn USD không `lang` ra tiếng Anh, cron gửi lại theo đơn), Task 6 (recover), Task 7 (gửi lại key theo đơn mới nhất; key cấp tay không có đơn thì `vi`).
- §2 dạng thư: Task 4 (`layout.ts`: bảng lồng, kiểu inline, không ảnh, không script, escape, link chỉ SITE_URL, màu website, màn hình hẹp, chế độ tối, `<html lang>`, `lang="en"` cho phần dưới, preheader không có key; `templates.ts`: các bước chỉ ở purchase/recover/resend, số nhiều tiếng Anh theo số key, ngày theo ngôn ngữ, bản chữ thuần cùng nội dung; `strings.ts`: Phụ lục A). Task 11 xem bằng mắt so với bản mẫu.
- §3 server: migration 0006 (Task 2), checkout/recover nhận `lang` mà không bao giờ trả 400 vì nó (Task 5, 6), `lang.ts` dùng chung (Task 1), `EmailMessage.html` + Resend (Task 3), bốn chỗ gọi `mailGranted` dùng `order.lang`/`currency` qua `OrderRow` và `retryUnsentEmails` (Task 2, 4), ẩn danh xóa `lang` (Task 7), tổ chức mã ba file (Task 4).
- §4 app: Task 8 (`checkout`, `recover` gửi `lang` từ `settings.ui_language` qua `support::lang_code`; không đổi giao diện).
- §5 pháp lý và website: Task 9 (nội dung 1.6, README, Dữ liệu và bảo mật năm ngôn ngữ, cả hàng kết nối `api.` vì app gửi thêm ngôn ngữ), Task 12 (phiên bản và ngày). Spec gốc §6.8: câu "văn bản thuần" đã sửa ở commit spec; bảng hợp đồng API ở Task 9.
- §6 triển khai: Task 10 (runbook mục 12, có thử thư thật năm ngôn ngữ theo giới hạn 3 lần mỗi giờ, đường lui).
- §7 test: các test liệt kê ở spec nằm ở Task 1–9; test so khóa đủ năm ngôn ngữ (Task 4, cả kiểu TypeScript lẫn test chạy); test chặn tên công nghệ lõi trong thư (Task 4); chữ trong thư khớp giao diện app và đường dẫn website (Task 4, `email-strings.test.mjs`).

**Quyết định nhỏ của kế hoạch (spec không nói):**
- Recover và Web Admin "Gửi lại key" tạm dùng `"vi"` ở Task 4 (giữ hành vi cũ) rồi đổi ở Task 6, 7, để mỗi task để lại bộ test xanh.
- Bản chữ thuần thụt mỗi dòng câu trả lời hỗ trợ 2 dấu cách (theo spec mục 2); test cũ của cron hỗ trợ đổi theo.
- Chính sách mục 7 dòng "bỏ" thêm ngôn ngữ lưu trên đơn, cho khớp việc ẩn danh xóa `lang`.
- Ngày 1.6 được phép trùng ngày 1.5 (2026-10-23) nếu phát hành ngay hôm nay.
