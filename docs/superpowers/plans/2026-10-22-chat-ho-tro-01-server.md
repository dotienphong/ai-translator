# Chat hỗ trợ 01: thử Zalo Bot và server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Worker `mt-license` nhận tin chat của khách (`/v1/support/*`), lưu D1, chuyển sang Zalo của chủ dự án qua Zalo Bot, nhận câu trả lời và lệnh qua webhook `POST /v1/webhooks/zalo`, gửi lại khi Zalo lỗi, gửi email câu trả lời cho khách đã rời đi, xóa cuộc chat sau 90 ngày.

**Architecture:** Module mới `server/src/support/` gồm các file nhỏ một việc: `text.ts` (kiểm input), `zalo.ts` (client HTTP của Zalo Bot), `store.ts` (D1), `format.ts` (chữ gửi Zalo), `owner.ts` (đọc lệnh của chủ dự án), `forward.ts` (chuyển tin), `routes.ts` (endpoint của khách và CORS), `webhook.ts` (webhook Zalo), `cron.ts` (việc định kỳ). Migration `0005_support_chat.sql` thêm ba bảng. `Deps` có thêm `zalo` để test thay Zalo bằng bản giả ở mức HTTP (như PayOS, Resend).

**Tech Stack:** TypeScript 7 strict, Hono 4.13 (`hono/cors`), Cloudflare Workers + D1 + binding Rate Limiting, vitest 4 với `@cloudflare/vitest-plugin`, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-22-chat-ho-tro-zalo-design.md` (mục 0, 1, 2, 6, 7, 8). **Hợp đồng API:** `docs/superpowers/plans/2026-10-22-chat-ho-tro-00-tong-quan.md`. Đọc cả hai trước khi làm.

**Quy tắc chung:** theo kế hoạch 00 (làm thẳng trên `main`, mọi lệnh bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/ai-translator &&`, kiểm `git branch --show-current` trước commit, chỉ `git add` đúng file, không push, không deploy, không đặt secret). Hai Worker không được kéo mã của nhau (`server/test/node/worker-split.test.mjs`): các file trong `src/support/` không nhập `../admin*`.

---

## Cấu trúc file

| File | Việc |
|---|---|
| Create `bench/2026-10-22-chat-ho-tro/spike.md` | Kết quả bước 0 (thử Zalo Bot) |
| Create `server/migrations/0005_support_chat.sql` | Ba bảng `support_conversations`, `support_messages`, `support_settings`, bốn index, hai dòng cài đặt mặc định |
| Create `server/src/support/text.ts` | Kiểu `Lang`, `Source`; `parseText`, `parseLang`, `parseSource`, `parsePage`, `parseContext`, `truncate`, `newToken`, `isTokenShape`, `newCode` |
| Create `server/src/support/zalo.ts` | `OwnerBot`, `HttpZaloBot`, `ZaloBotError`, `zaloFromEnv` |
| Create `server/src/support/store.ts` | Đọc ghi D1 của chat |
| Create `server/src/support/format.ts` | `headerLine`, `customerText`, `ago`, `listText`, `HELP_TEXT`, `BOT_TEXT` |
| Create `server/src/support/owner.ts` | `parseOwnerText` |
| Create `server/src/support/forward.ts` | `forwardConversation` |
| Create `server/src/support/routes.ts` | `supportCors`, `registerSupport` (5 endpoint của khách) |
| Create `server/src/support/webhook.ts` | `parseUpdate`, `handleOwnerUpdate`, `registerZaloWebhook` |
| Create `server/src/support/cron.ts` | `forwardPendingSupport`, `sendSupportEmails`, `pruneSupport` |
| Modify `server/src/env.ts` | Ba secret Zalo, binding `SUPPORT_POLL_LIMITER` |
| Modify `server/src/deps.ts` | `Deps.zalo`, `realDeps` |
| Modify `server/src/http.ts` | Bốn mã lỗi mới |
| Modify `server/src/ratelimit.ts` | Năm hạn mức `support_*` |
| Modify `server/src/alerts.ts` | Hai `AlertKind` mới |
| Modify `server/src/email/templates.ts` | `supportReplyEmail` |
| Modify `server/src/app.ts` | CORS, gắn route và webhook |
| Modify `server/src/reconcile.ts` | Ba bước cron của chat |
| Modify `server/wrangler.jsonc` | Ba secret bắt buộc, binding `ratelimits` |
| Modify `server/vitest.config.ts` | Secret giả của Zalo |
| Modify `server/test/db.ts`, `fakes.ts`, `world.ts`, `schema.test.ts`, `migrations.test.ts`, `node/wrangler-config.test.mjs` | Theo bảng mới, Zalo giả |
| Create `server/test/support-helpers.ts` | Hàm dùng chung cho test chat |
| Create `server/test/support-{text,zalo,store,format,owner,forward,routes,webhook,cron}.test.ts` | Test mới |
| Modify `docs/release/phat-hanh.md` | Secret Zalo ở mục 4; mục 11 mới (phần server) |
| Modify `docs/superpowers/specs/2026-10-22-chat-ho-tro-zalo-design.md` | Cột `emailed_owner_id` ở bảng mục 2.1 |

## Mốc số test

| Sau | `pnpm -C server test` | `pnpm -C server test:scripts` |
|---|---|---|
| Mốc (đo 2026-10-22 trên `main`) | 1523 (34 file) | 43 (42 đạt, 1 bỏ qua) |
| Task 2 | 1525 | 43 |
| Task 3 | 1525 | 44 (43 đạt) |
| Task 4 | 1533 | 44 |
| Task 5 | 1538 | 44 |
| Task 6 | 1547 | 44 |
| Task 7 | 1554 | 44 |
| Task 8 | 1559 | 44 |
| Task 9 | 1571 | 44 |
| Task 10 | 1577 | 44 |
| Task 11 | 1587 | 44 |
| Task 12 | 1593 | 44 |

---

### Task 0: Chuẩn bị

**Files:** không sửa file.

- [ ] **Step 1: Kiểm nhánh và cài phụ thuộc**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && pnpm -C server install --frozen-lockfile
```
Expected: dòng đầu `main`; cài xong không lỗi.

- [ ] **Step 2: Chạy mốc**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4 && pnpm -C server test:scripts 2>&1 | grep -E '^ℹ (tests|pass|fail)'
```
Expected: `tsc` không lỗi; `Tests  1523 passed (1523)`; `ℹ tests 43`, `ℹ pass 42`, `ℹ fail 0`. Số khác (phiên khác đã thêm test) thì ghi số mới làm mốc và cộng đúng phần chênh ở mọi task sau. Có test đỏ **trước** khi sửa gì thì dừng và báo.

---

### Task 1: Bước 0, thử Zalo Bot (cổng)

**Người làm:** Claude phiên chính (không giao subagent), vì cần chủ dự án thao tác trên Zalo. Không có mã nào phụ thuộc kết quả của task này ngoài `parseUpdate` (Task 11); các task 2–13 làm song song được, nhưng **không deploy, không phát hành gì trước khi cổng qua**.

**Files:**
- Create: `bench/2026-10-22-chat-ho-tro/spike.md`

- [ ] **Step 1: Nhờ chủ dự án tạo bot và để token ở file ngoài git**

Gửi chủ dự án đúng các bước sau rồi chờ trả lời:

1. Mở Zalo, tìm OA **Zalo Bot Manager**, chọn **Tạo bot**, đặt tên `Bot AI Translator` (tên phải bắt đầu bằng "Bot"). Zalo gửi Bot Token qua tin nhắn.
2. Nhắn cho bot một tin bất kỳ, ví dụ `xin chào`.
3. Tạo file `/Users/dtphong/Desktop/software_business/ai-translator/.env.zalo-spike` có đúng một dòng `ZALO_SPIKE_TOKEN=<token>`. Không dán token vào chat.
4. Xem mục **Giá gói** trong Zalo Bot Manager và chép lại hạn mức của gói miễn phí (số tin, số bot).

- [ ] **Step 2: Kiểm file token không vào git**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git check-ignore -v .env.zalo-spike && test -s .env.zalo-spike && echo co-file
```
Expected: dòng `.gitignore:28:.env*	.env.zalo-spike` rồi `co-file`. Không có dòng `.gitignore` thì dừng, không chạy tiếp.

- [ ] **Step 3: Đọc tin của chủ dự án bằng `getUpdates` (chưa đặt webhook nên dùng được)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && set -a && . ./.env.zalo-spike && set +a && curl -s -X POST "https://bot-api.zaloplatforms.com/bot${ZALO_SPIKE_TOKEN}/getUpdates" -H 'content-type: application/json' -d '{"timeout":"5"}' | python3 -m json.tool
```
Expected: JSON có `"ok": true`; trong `result` (ghi lại là object hay mảng) có `"event_name": "message.text.received"`, `message.chat.id`, `message.from.id`, `message.message_id` (ghi lại kiểu: chuỗi hay số), `message.text` = `xin chào`. Thêm dòng `ZALO_SPIKE_CHAT_ID=<message.chat.id>` vào `.env.zalo-spike` (bằng `printf 'ZALO_SPIKE_CHAT_ID=%s\n' '<id>' >> .env.zalo-spike`). Kết quả rỗng thì nhờ chủ dự án nhắn thêm một tin rồi chạy lại.

- [ ] **Step 4: Gửi ba tin thử và một tin quá dài**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && set -a && . ./.env.zalo-spike && set +a && S=$(mktemp -d) && \
python3 -c 'import json,os;print(json.dumps({"chat_id":os.environ["ZALO_SPIKE_CHAT_ID"],"text":"Kiểm tra 1: bot nhắn chủ động"}))' > "$S/t1.json" && \
python3 -c 'import json,os;print(json.dumps({"chat_id":os.environ["ZALO_SPIKE_CHAT_ID"],"text":"🆕 #K7Q · web · vi · /bang-gia/\nKiểm tra 2: tiếng Việt có dấu, emoji 👋✉️🗑⚠️✓"}))' > "$S/t2.json" && \
python3 -c 'import json,os;print(json.dumps({"chat_id":os.environ["ZALO_SPIKE_CHAT_ID"],"text":"Đ"*1998+"Hết"}))' > "$S/t3.json" && \
python3 -c 'import json,os;print(json.dumps({"chat_id":os.environ["ZALO_SPIKE_CHAT_ID"],"text":"x"*2001}))' > "$S/t4.json" && \
for f in t1 t2 t3 t4; do echo "== $f"; curl -s -w '\nHTTP %{http_code}\n' -X POST "https://bot-api.zaloplatforms.com/bot${ZALO_SPIKE_TOKEN}/sendMessage" -H 'content-type: application/json' --data-binary @"$S/$f.json"; done; rm -rf "$S"
```
Expected: `t1`, `t2`, `t3` đều `"ok":true` kèm `result.message_id`, `HTTP 200`; `t4` (2001 ký tự) bị từ chối: ghi nguyên văn thân lỗi và mã HTTP (để biết dạng `ok:false`). `t3` có đúng 2000 ký tự (1998 + 2). Hỏi chủ dự án: ba tin hiện đủ trong Zalo chưa, `t2` có giữ đúng dấu và xuống dòng không, `t3` có hiện chữ `Hết` ở cuối không.

- [ ] **Step 5: Xem dạng lỗi khi token sai**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && curl -s -w '\nHTTP %{http_code}\n' -X POST "https://bot-api.zaloplatforms.com/bot0:token-sai/sendMessage" -H 'content-type: application/json' -d '{"chat_id":"x","text":"x"}'
```
Expected: mã HTTP 401 (hay 4xx khác) và thân lỗi; ghi nguyên văn. `HttpZaloBot` (Task 5) coi mọi phản hồi không phải `2xx` có `ok: true` là lỗi, nên dạng nào cũng được xử lý; ghi lại để chẩn đoán sau này.

- [ ] **Step 6: Ghi kết quả**

Tạo `bench/2026-10-22-chat-ho-tro/spike.md` (không có token; chat_id chỉ ghi 4 ký tự cuối):

```markdown
# Bước 0: thử Zalo Bot (2026-10-22)

Kế hoạch `docs/superpowers/plans/2026-10-22-chat-ho-tro-01-server.md`, Task 1. Spec `2026-10-22-chat-ho-tro-zalo-design.md` mục 6.

| # | Điều kiểm | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | Bot nhắn chủ động cho chủ dự án | <đạt/không đạt> | `t1`, HTTP <mã> |
| 2 | Sau ít nhất 3 ngày không ai nhắn bot, bot vẫn nhắn được | <chưa kiểm: hẹn ngày YYYY-MM-DD> | Kiểm lại ở Step 7 |
| 3 | Dấu tiếng Việt, emoji, xuống dòng; đúng 2000 ký tự | <đạt/không đạt> | `t2`, `t3`; 2001 ký tự: HTTP <mã>, thân `<nguyên văn>` |
| 4 | Dạng sự kiện khớp tài liệu | <đạt/không đạt> | `result` là <object/mảng>; `message_id` là <chuỗi/số>; `chat.id` là <chuỗi/số> |
| 5 | Hạn mức gói miễn phí | <chép từ Zalo Bot Manager> | |

Thân lỗi khi token sai: HTTP <mã>, `<nguyên văn>`.

Dạng một sự kiện (đã che id và tên):

    <dán JSON của Step 3, thay id bằng "…1234", display_name bằng "Chủ dự án">

**Kết luận cổng:** <qua / dừng>. Điều 2 phải đạt trước khi bật chat (`docs/release/phat-hanh.md` mục 11).
```

- [ ] **Step 7: Hẹn kiểm điều 2**

Ghi ngày hôm nay + 3 vào bảng. Đến ngày đó (chủ dự án **không** nhắn bot trong khoảng giữa), chạy lại tin `t1` của Step 4 với chữ `Kiểm tra điều 2 sau 3 ngày`, hỏi chủ dự án đã nhận chưa, rồi sửa dòng 2 của bảng. Việc này không chặn các task 2–13, nhưng chặn bước bật chat ở runbook.

- [ ] **Step 8: Quyết cổng**

Điều 1, 3 hay 4 không đạt: **dừng mọi kế hoạch chat**, báo chủ dự án kèm `spike.md`. Điều 4 đạt nhưng dạng khác tài liệu (ví dụ `chat.id` là số): ghi rõ trong `spike.md`; `parseUpdate` ở Task 11 đã nhận cả chuỗi lẫn số, cả thân bọc trong `result` lẫn không bọc. `result` của webhook là mảng (khác `getUpdates`, chỉ biết sau khi deploy): sửa `parseUpdate` khi làm runbook bước 9.

- [ ] **Step 9: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add bench/2026-10-22-chat-ho-tro/spike.md && git commit -m "bench(chat-ho-tro): bước 0, thử Zalo Bot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `main`, commit thành công. **Không** commit `.env.zalo-spike`.

---

### Task 2: Migration 0005

**Files:**
- Create: `server/migrations/0005_support_chat.sql`
- Modify: `server/test/db.ts`, `server/test/schema.test.ts`, `server/test/migrations.test.ts`
- Modify: `docs/superpowers/specs/2026-10-22-chat-ho-tro-zalo-design.md`

- [ ] **Step 1: Viết test hỏng**

Trong `server/test/schema.test.ts`, tìm:

```ts
    "rate_limits",
    "trials",
  ]);
});
```

thay bằng:

```ts
    "rate_limits",
    "support_conversations",
    "support_messages",
    "support_settings",
    "trials",
  ]);
});

it("chat hỗ trợ: nguồn, ngôn ngữ, người gửi, trạng thái chỉ nhận giá trị đã biết; mã cuộc chat, token và message_id của Zalo là duy nhất", async () => {
  const conv = env.DB.prepare("INSERT INTO support_conversations (code, token_hash, source, lang, created_at, last_activity_at) VALUES (?, ?, ?, ?, 0, 0)");
  await expect(conv.bind("AAA", "h1", "email", "vi").run()).rejects.toThrow(/CHECK/);
  await expect(conv.bind("AAA", "h1", "web", "fr").run()).rejects.toThrow(/CHECK/);
  await conv.bind("AAA", "h1", "web", "vi").run();
  await expect(conv.bind("AAA", "h2", "app", "en").run()).rejects.toThrow(/UNIQUE/);
  await expect(conv.bind("BBB", "h1", "app", "en").run()).rejects.toThrow(/UNIQUE/);
  await expect(env.DB.prepare("UPDATE support_conversations SET status = 'deleted'").run()).rejects.toThrow(/CHECK/);
  expect(await env.DB.prepare("SELECT status, delivered_owner_id, emailed_owner_id, emailed_at FROM support_conversations").first()).toEqual({
    status: "open",
    delivered_owner_id: 0,
    emailed_owner_id: 0,
    emailed_at: null,
  });
  const id = (await env.DB.prepare("SELECT id FROM support_conversations").first<{ id: number }>())?.id;
  const msg = env.DB.prepare("INSERT INTO support_messages (conversation_id, sender, text, created_at, zalo_message_id) VALUES (?, ?, 'x', 0, ?)");
  await expect(msg.bind(id, "bot", null).run()).rejects.toThrow(/CHECK/);
  await msg.bind(id, "owner", "zm-1").run();
  await expect(msg.bind(id, "owner", "zm-1").run()).rejects.toThrow(/UNIQUE/);
  await msg.bind(id, "customer", null).run();
  await msg.bind(id, "customer", null).run();
  expect(await env.DB.prepare("SELECT COUNT(*) AS n, MIN(forward_attempts) AS a FROM support_messages").first()).toEqual({ n: 3, a: 0 });
});
```

Trong `server/test/migrations.test.ts`, tìm:

```ts
it("có đúng bốn migration theo thứ tự", () => {
  expect(names).toEqual([
    "0001_init.sql",
    "0002_three_plans_trials.sql",
    "0003_six_months_plan.sql",
    "0004_error_reports.sql",
  ]);
});
```

thay bằng:

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

Cũng trong file đó, ở test `0004 chỉ thêm hai bảng báo cáo lỗi…`, tìm:

```ts
  const licensesBefore = (await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  const after = await tables();
  expect(after.filter((t) => !t.name.startsWith("error_report"))).toEqual(before);
```

thay bằng:

```ts
  const licensesBefore = (await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results;

  // Chỉ áp tới 0004: 0005 có test riêng ở cuối file.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 4));

  const after = await tables();
  expect(after.filter((t) => !t.name.startsWith("error_report"))).toEqual(before);
```

Thêm vào **cuối** `server/test/migrations.test.ts`:

```ts
it("0005 chỉ thêm ba bảng chat hỗ trợ và bốn index; chat mặc định tắt; bảng cũ và dữ liệu cũ giữ nguyên", async () => {
  // D1 đang ở trạng thái sau 0004 (test trên chỉ áp bốn migration đầu).
  const tables = async () =>
    (
      await db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
        )
        .all<{ name: string; sql: string }>()
    ).results;
  const indexNames = async () =>
    (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map(
      (r) => r.name,
    );
  const before = await tables();
  const indexesBefore = await indexNames();
  const licensesBefore = (await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results;

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  const after = await tables();
  expect(after.filter((t) => !t.name.startsWith("support_"))).toEqual(before);
  expect(after.map((t) => t.name).filter((n) => n.startsWith("support_"))).toEqual(["support_conversations", "support_messages", "support_settings"]);
  expect(await indexNames()).toEqual(
    [
      ...indexesBefore,
      "support_conversations_activity",
      "support_conversations_customer",
      "support_messages_conversation",
      "support_messages_pending",
    ].sort(),
  );
  expect((await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results).toEqual(licensesBefore);
  expect((await db.prepare("SELECT key, value FROM support_settings ORDER BY key").all()).results).toEqual([
    { key: "enabled", value: "0" },
    { key: "zalo_fail_streak", value: "0" },
  ]);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
```

Trong `server/test/db.ts`, tìm:

```ts
    [
      "error_report_logs",
      "error_reports",
```

thay bằng:

```ts
    [
      "support_messages",
      "support_conversations",
      "support_settings",
      "error_report_logs",
      "error_reports",
```

- [ ] **Step 2: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server exec vitest run test/schema.test.ts test/migrations.test.ts 2>&1 | tail -15
```
Expected: FAIL; lỗi dạng `no such table: support_messages` (từ `resetDb`) và danh sách migration thiếu `0005_support_chat.sql`.

- [ ] **Step 3: Viết migration**

Tạo `server/migrations/0005_support_chat.sql`:

```sql
-- Chat hỗ trợ trên website và app, tin nhắn về Zalo của chủ dự án (spec 2026-10-22-chat-ho-tro-zalo-design.md §2.1).
-- Chỉ THÊM ba bảng và bốn index; không đổi bảng nào đã có, không nối với bảng license.
-- Cuộc chat tự xóa 90 ngày sau lần hoạt động cuối (cron */5: src/support/cron.ts, pruneSupport).
-- Worker cũ không biết các bảng này nên chạy đúng trên schema mới: áp migration này TRƯỚC khi deploy Worker mới.

CREATE TABLE support_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,              -- 3 ký tự hoa, bảng chữ không có 0, 1, I, O; chủ dự án ghi "#MÃ" khi trả lời
  token_hash TEXT NOT NULL UNIQUE,        -- SHA-256 hex của token khách giữ; server không lưu token gốc
  source TEXT NOT NULL CHECK (source IN ('web', 'app', 'app-debug')),
  lang TEXT NOT NULL CHECK (lang IN ('vi', 'en', 'ja', 'zh', 'ko')),
  page TEXT,                              -- đường dẫn trang lúc mở chat (web), không có query
  context TEXT,                           -- dòng thông tin máy (app), chỉ khi khách để tích
  email TEXT,                             -- khách tự để lại; không bao giờ gửi qua Zalo
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'blocked')),
  created_at INTEGER NOT NULL,
  last_customer_at INTEGER,
  last_owner_at INTEGER,
  last_activity_at INTEGER NOT NULL,      -- mốc giữ 90 ngày
  delivered_owner_id INTEGER NOT NULL DEFAULT 0,  -- id lớn nhất của tin chủ dự án khách đã nhận qua khung chat
  emailed_owner_id INTEGER NOT NULL DEFAULT 0,    -- id lớn nhất của tin chủ dự án đã gửi qua email
  emailed_at INTEGER                      -- lần cuối gửi email câu trả lời (tối đa một thư mỗi giờ)
);
CREATE INDEX support_conversations_activity ON support_conversations (last_activity_at);
CREATE INDEX support_conversations_customer ON support_conversations (last_customer_at);

CREATE TABLE support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,   -- tăng dần toàn hệ thống: con trỏ `after` của khách
  conversation_id INTEGER NOT NULL REFERENCES support_conversations (id),
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'owner')),
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  forwarded_at INTEGER,                   -- tin khách: lúc Zalo nhận (hay lúc đang giữ chỗ để gửi)
  forward_attempts INTEGER NOT NULL DEFAULT 0,
  zalo_message_id TEXT UNIQUE             -- tin chủ dự án: message_id của Zalo, chống ghi trùng khi Zalo gửi lại webhook
);
CREATE INDEX support_messages_conversation ON support_messages (conversation_id, id);
CREATE INDEX support_messages_pending ON support_messages (forwarded_at, created_at) WHERE sender = 'customer';

-- Cài đặt của chat: 'enabled' ('1' bật, '0' tắt; chủ dự án đổi bằng /bat, /tat), 'zalo_fail_streak' (số lần cron liền không chuyển được tin).
CREATE TABLE support_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO support_settings (key, value) VALUES ('enabled', '0'), ('zalo_fail_streak', '0');
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server test 2>&1 | tail -4
```
Expected: `Tests  1525 passed (1525)`.

- [ ] **Step 5: Ghi cột mới vào spec**

Trong `docs/superpowers/specs/2026-10-22-chat-ho-tro-zalo-design.md`, tìm:

```markdown
| `delivered_owner_id` | id lớn nhất của tin chủ dự án mà khách đã nhận qua polling |
| `emailed_at` | lần cuối gửi email câu trả lời |
```

thay bằng:

```markdown
| `delivered_owner_id` | id lớn nhất của tin chủ dự án mà khách đã nhận qua polling |
| `emailed_owner_id` | id lớn nhất của tin chủ dự án đã gửi qua email (thư sau chỉ gồm tin mới hơn) |
| `emailed_at` | lần cuối gửi email câu trả lời |
```

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/migrations/0005_support_chat.sql server/test/db.ts server/test/schema.test.ts server/test/migrations.test.ts docs/superpowers/specs/2026-10-22-chat-ho-tro-zalo-design.md && git commit -m "feat(server): migration 0005 cho chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Cấu hình: secret Zalo, binding Rate Limiting

**Files:**
- Modify: `server/src/env.ts`, `server/wrangler.jsonc`, `server/vitest.config.ts`, `server/test/node/wrangler-config.test.mjs`, `docs/release/phat-hanh.md`

- [ ] **Step 1: Viết test hỏng**

Trong `server/test/node/wrangler-config.test.mjs`, tìm:

```js
    "TOKEN_SIGNING_KEY_A",
    "TOKEN_SIGNING_KEY_B",
    "RATE_LIMIT_PEPPER",
  ]);
  for (const name of api.secrets.required) assert.equal(name in api.vars, false, name);
```

thay bằng:

```js
    "TOKEN_SIGNING_KEY_A",
    "TOKEN_SIGNING_KEY_B",
    "RATE_LIMIT_PEPPER",
    "ZALO_BOT_TOKEN",
    "ZALO_WEBHOOK_SECRET",
    "ZALO_OWNER_CHAT_ID",
  ]);
  for (const name of api.secrets.required) assert.equal(name in api.vars, false, name);
```

Thêm vào cuối file:

```js
test("chat hỗ trợ (spec 2026-10-22 §2.2): Worker API có binding Rate Limiting cho việc hỏi tin mới, 60 lần mỗi 60 giây; Worker admin không có", () => {
  assert.deepEqual(api.ratelimits, [{ name: "SUPPORT_POLL_LIMITER", namespace_id: "20261022", simple: { limit: 60, period: 60 } }]);
  assert.equal("ratelimits" in admin, false);
  assert.equal("ZALO_BOT_TOKEN" in (admin.vars ?? {}), false);
  assert.equal((admin.secrets?.required ?? []).some((n) => n.startsWith("ZALO_")), false);
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server test:scripts 2>&1 | grep -E '^not ok|^ℹ (tests|pass|fail)'
```
Expected: `not ok` ở test `secret bắt buộc có đủ…` và test mới; `ℹ tests 44`, `ℹ fail 2`.

- [ ] **Step 3: Sửa `wrangler.jsonc`**

Trong `server/wrangler.jsonc`, tìm:

```jsonc
// sách `secrets.required` ở cuối file (ba secret PayOS, khóa API và secret webhook của Creem, Resend, hai ô khóa ký, pepper);
```

thay bằng:

```jsonc
// sách `secrets.required` ở cuối file (ba secret PayOS, khóa API và secret webhook của Creem, Resend, hai ô khóa ký, pepper, ba
// secret Zalo Bot của chat hỗ trợ: token, secret webhook, chat_id của chủ dự án);
```

Tìm:

```jsonc
    "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "CREEM_API_KEY", "CREEM_WEBHOOK_SECRET", "RESEND_API_KEY", "TOKEN_SIGNING_KEY_A", "TOKEN_SIGNING_KEY_B", "RATE_LIMIT_PEPPER"]
```

thay bằng:

```jsonc
    "required": ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY", "CREEM_API_KEY", "CREEM_WEBHOOK_SECRET", "RESEND_API_KEY", "TOKEN_SIGNING_KEY_A", "TOKEN_SIGNING_KEY_B", "RATE_LIMIT_PEPPER", "ZALO_BOT_TOKEN", "ZALO_WEBHOOK_SECRET", "ZALO_OWNER_CHAT_ID"]
```

Tìm:

```jsonc
  "triggers": { "crons": ["*/5 * * * *"] }
```

thay bằng:

```jsonc
  // Chat hỗ trợ (spec 2026-10-22 §2.2): chặn hỏi tin mới quá nhanh mà không ghi D1 (bảng rate_limits tốn một lần ghi mỗi request).
  // Khóa là id cuộc chat; khách hỏi mỗi 3 giây nên 60 lần mỗi 60 giây còn dư cho vài tab. namespace_id là số tự chọn, duy nhất
  // trong tài khoản Cloudflare (tài khoản dùng chung với dự án khác: đừng đổi sang số nhỏ dễ trùng).
  "ratelimits": [{ "name": "SUPPORT_POLL_LIMITER", "namespace_id": "20261022", "simple": { "limit": 60, "period": 60 } }],
  "triggers": { "crons": ["*/5 * * * *"] }
```

- [ ] **Step 4: Sửa `env.ts`**

Trong `server/src/env.ts`, tìm:

```ts
export interface ApiEnv {
  DB: D1Database;
```

thay bằng:

```ts
export interface ApiEnv {
  DB: D1Database;
  /** Binding Rate Limiting cho việc hỏi tin mới của chat hỗ trợ (60 lần mỗi 60 giây mỗi cuộc chat). Thiếu thì không chặn. */
  SUPPORT_POLL_LIMITER?: RateLimit;
```

Tìm:

```ts
  /** Khóa HMAC cho bộ đếm giới hạn tần suất (ngẫu nhiên, 32 byte). */
  RATE_LIMIT_PEPPER: string;
  /** Email người vận hành nhận cảnh báo. Không bắt buộc; thiếu thì cảnh báo chỉ ghi log. */
  OPERATOR_EMAIL?: string;
}
```

thay bằng:

```ts
  /** Khóa HMAC cho bộ đếm giới hạn tần suất (ngẫu nhiên, 32 byte). */
  RATE_LIMIT_PEPPER: string;
  /** Email người vận hành nhận cảnh báo. Không bắt buộc; thiếu thì cảnh báo chỉ ghi log. */
  OPERATOR_EMAIL?: string;
  /** Token Zalo Bot của chat hỗ trợ (spec 2026-10-22 §1). Nằm trong URL gọi Zalo: không bao giờ ghi vào log hay lỗi. */
  ZALO_BOT_TOKEN: string;
  /** Secret của webhook Zalo Bot (8–256 ký tự); Zalo gửi lại trong header X-Bot-Api-Secret-Token. */
  ZALO_WEBHOOK_SECRET: string;
  /** chat_id của chủ dự án với bot: người duy nhất nhận tin của khách và được trả lời. Là secret vì repo công khai. */
  ZALO_OWNER_CHAT_ID: string;
}
```

- [ ] **Step 5: Secret giả cho test**

Trong `server/vitest.config.ts`, tìm:

```ts
  RATE_LIMIT_PEPPER: "test-pepper",
};
```

thay bằng:

```ts
  RATE_LIMIT_PEPPER: "test-pepper",
  // Khớp các hằng TEST_ZALO_* ở test/fakes.ts.
  ZALO_BOT_TOKEN: "test-zalo-token",
  ZALO_WEBHOOK_SECRET: "test-zalo-webhook-secret",
  ZALO_OWNER_CHAT_ID: "owner-chat-id",
};
```

- [ ] **Step 6: Runbook nêu ba secret mới (test `runbook docs/release/phat-hanh.md nêu mọi secret bắt buộc` đòi)**

Trong `docs/release/phat-hanh.md`, tìm:

```markdown
   Khi có tài khoản Creem thì mục 9 bước 5 ghi đè cả hai bằng giá trị thật.
```

thay bằng:

```markdown
   Khi có tài khoản Creem thì mục 9 bước 5 ghi đè cả hai bằng giá trị thật.

   Từ đợt chat hỗ trợ (mục 11), `secrets.required` của Worker API còn có `ZALO_BOT_TOKEN`, `ZALO_WEBHOOK_SECRET` và
   `ZALO_OWNER_CHAT_ID`: thiếu thì `wrangler deploy` từ chối. Cách tạo bot, lấy `chat_id` và đặt ba secret ở mục 11, bước 1 đến 3.
```

- [ ] **Step 7: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server test:scripts 2>&1 | grep -E '^ℹ (tests|pass|fail)' && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4 && (cd server && pnpm exec wrangler deploy --dry-run 2>&1 | grep -E 'SUPPORT_POLL_LIMITER|error|Error' | head -5)
```
Expected: `ℹ tests 44`, `ℹ pass 43`, `ℹ fail 0`; `tsc` không lỗi; `Tests  1525 passed (1525)`; dry-run không in dòng `error` nào (wrangler in bảng binding thì có `SUPPORT_POLL_LIMITER`). Dry-run báo `ratelimits` sai dạng thì đối chiếu `server/node_modules/wrangler/config-schema.json` (khóa `ratelimits`: `name`, `namespace_id` là chuỗi, `simple.limit`, `simple.period` là 10 hay 60).

- [ ] **Step 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/env.ts server/wrangler.jsonc server/vitest.config.ts server/test/node/wrangler-config.test.mjs docs/release/phat-hanh.md && git commit -m "feat(server): secret Zalo Bot và binding Rate Limiting cho chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Kiểm input (`support/text.ts`)

**Files:**
- Create: `server/src/support/text.ts`
- Test: `server/test/support-text.test.ts`

- [ ] **Step 1: Viết test hỏng**

Tạo `server/test/support-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  isTokenShape,
  MAX_TEXT,
  newCode,
  newToken,
  parseContext,
  parseLang,
  parsePage,
  parseSource,
  parseText,
  truncate,
} from "../src/support/text";

describe("chuẩn hóa input của chat hỗ trợ (spec 2026-10-22 §2.2)", () => {
  it("parseText: xuống dòng về \\n, tab thành dấu cách, bỏ ký tự điều khiển, bỏ khoảng trắng hai đầu", () => {
    expect(parseText("  Xin\r\nchào\rbạn\tơi\u0000\u0007\u007f  ")).toBe("Xin\nchào\nbạn ơi");
  });

  it("parseText: 1–1000 ký tự tính theo code point; rỗng, chỉ khoảng trắng hay không phải chuỗi thì null", () => {
    expect(parseText("😀".repeat(MAX_TEXT))).toBe("😀".repeat(MAX_TEXT));
    expect(parseText("😀".repeat(MAX_TEXT + 1))).toBeNull();
    expect(parseText("   \n\t ")).toBeNull();
    expect(parseText("")).toBeNull();
    expect(parseText(42)).toBeNull();
    expect(parseText(null)).toBeNull();
  });

  it("parseLang, parseSource: chỉ giá trị đã biết, phân biệt hoa thường", () => {
    expect(["vi", "en", "ja", "zh", "ko"].map((v) => parseLang(v))).toEqual(["vi", "en", "ja", "zh", "ko"]);
    expect(parseLang("fr")).toBeNull();
    expect(parseLang("VI")).toBeNull();
    expect(["web", "app", "app-debug"].map((v) => parseSource(v))).toEqual(["web", "app", "app-debug"]);
    expect(parseSource("admin")).toBeNull();
    expect(parseSource(undefined)).toBeNull();
  });

  it("parsePage: chỉ đường dẫn bắt đầu bằng đúng một dấu /, bỏ query và hash, tối đa 200 ký tự", () => {
    expect(parsePage("/bang-gia/?utm=x#goi")).toBe("/bang-gia/");
    expect(parsePage("/en/pricing/")).toBe("/en/pricing/");
    expect(parsePage(`/${"a".repeat(300)}`)).toBe(`/${"a".repeat(199)}`);
    expect(parsePage("https://evil.example/")).toBeNull();
    expect(parsePage("//evil.example/")).toBeNull();
    expect(parsePage("bang-gia")).toBeNull();
    expect(parsePage(null)).toBeNull();
  });

  it("parseContext: ký tự điều khiển thành dấu cách, gộp khoảng trắng, tối đa 300 ký tự; rỗng thì null", () => {
    expect(parseContext("AI Translator 0.2.4\n·  macOS 15.6\u0000")).toBe("AI Translator 0.2.4 · macOS 15.6");
    expect(parseContext("x".repeat(400))).toBe("x".repeat(300));
    expect(parseContext("  \n ")).toBeNull();
    expect(parseContext(7)).toBeNull();
  });

  it("truncate: giữ nguyên khi vừa, cắt theo code point và kết thúc bằng …", () => {
    expect(truncate("abc", 3)).toBe("abc");
    expect(truncate("abcd", 3)).toBe("ab…");
    expect(truncate("😀😀😀😀", 3)).toBe("😀😀…");
  });

  it("newToken: 43 ký tự base64url, mỗi lần khác nhau; isTokenShape chỉ nhận đúng dạng đó", () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
    expect(isTokenShape(a)).toBe(true);
    expect(isTokenShape(`${a}x`)).toBe(false);
    expect(isTokenShape(`${"a".repeat(42)}=`)).toBe(false);
  });

  it("newCode: 3 ký tự trong bảng chữ 32 ký tự không có 0, 1, I, O", () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(CODE_ALPHABET).not.toMatch(/[01IO]/);
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^[2-9A-HJ-NP-Z]{3}$/);
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server exec vitest run test/support-text.test.ts 2>&1 | tail -6
```
Expected: FAIL, `Failed to load url ../src/support/text` (hay `Cannot find module`).

- [ ] **Step 3: Viết mã**

Tạo `server/src/support/text.ts`:

```ts
// Kiểm và chuẩn hóa input của chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo-design.md §2.2; hợp đồng ở kế hoạch 00).
import { b64urlEncode, randomBytes } from "../crypto";

export type Lang = "vi" | "en" | "ja" | "zh" | "ko";
export type Source = "web" | "app" | "app-debug";

const LANGS: readonly string[] = ["vi", "en", "ja", "zh", "ko"];
const SOURCES: readonly string[] = ["web", "app", "app-debug"];

/** Độ dài tối đa một tin của khách (ký tự, đếm theo code point). */
export const MAX_TEXT = 1000;
/** Độ dài tối đa một tin gửi qua Zalo Bot (`sendMessage` nhận 1–2000 ký tự), cũng là trần một câu trả lời của chủ dự án. */
export const ZALO_MAX_TEXT = 2000;
/** Bảng chữ của mã cuộc chat: 32 ký tự, bỏ 0, 1, I, O để đọc không nhầm. 256 chia hết cho 32 nên `byte & 31` không lệch. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 3;
const MAX_PAGE = 200;
const MAX_CONTEXT = 300;

/** Giữ tối đa `max` ký tự đầu (code point). */
function clip(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("");
}

/** Cắt còn tối đa `max` ký tự (code point); bị cắt thì ký tự cuối là `…`. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

/**
 * Nội dung một tin: đổi xuống dòng về `\n`, tab thành dấu cách, bỏ ký tự điều khiển khác, bỏ khoảng trắng hai đầu. Rỗng hay dài
 * hơn `max` ký tự thì null.
 */
export function parseText(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== "string") return null;
  const text = v
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
    .trim();
  const length = Array.from(text).length;
  return length >= 1 && length <= max ? text : null;
}

export function parseLang(v: unknown): Lang | null {
  return typeof v === "string" && LANGS.includes(v) ? (v as Lang) : null;
}

export function parseSource(v: unknown): Source | null {
  return typeof v === "string" && SOURCES.includes(v) ? (v as Source) : null;
}

/** Trang lúc mở chat (chỉ web): phải bắt đầu bằng đúng một `/`; bỏ `?…`, `#…`, khoảng trắng và ký tự điều khiển; tối đa 200 ký tự. */
export function parsePage(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//")) return null;
  const path = (v.split(/[?#]/, 1)[0] ?? "").replace(/[\u0000- \u007f-\u009f]/g, "");
  return path.length > 0 ? clip(path, MAX_PAGE) : null;
}

/** Dòng thông tin máy (chỉ app): ký tự điều khiển thành dấu cách, gộp khoảng trắng, tối đa 300 ký tự. Rỗng thì null. */
export function parseContext(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = clip(v.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim(), MAX_CONTEXT).trim();
  return text.length > 0 ? text : null;
}

/** Token mới của cuộc chat: 32 byte ngẫu nhiên, base64url (43 ký tự). */
export function newToken(): string {
  return b64urlEncode(randomBytes(32));
}

export function isTokenShape(v: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(v);
}

/** Mã cuộc chat ngẫu nhiên (có thể trùng: store.ts sinh lại khi trùng). */
export function newCode(): string {
  return Array.from(randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET.charAt(b & 31)).join("");
}
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4
```
Expected: `tsc` không lỗi; `Tests  1533 passed (1533)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/support/text.ts server/test/support-text.test.ts && git commit -m "feat(server): kiểm input của chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client Zalo Bot và `Deps.zalo`

**Files:**
- Create: `server/src/support/zalo.ts`
- Modify: `server/src/deps.ts`, `server/test/fakes.ts`, `server/test/world.ts`
- Test: `server/test/support-zalo.test.ts`

- [ ] **Step 1: Thêm Zalo giả vào `test/fakes.ts`**

Thêm vào **cuối** `server/test/fakes.ts`:

```ts
/** Secret giả của Zalo Bot; khớp FAKE_SECRETS ở vitest.config.ts. */
export const TEST_ZALO_TOKEN = "test-zalo-token";
export const TEST_ZALO_WEBHOOK_SECRET = "test-zalo-webhook-secret";
export const TEST_ZALO_OWNER = "owner-chat-id";

/**
 * Zalo Bot giả ở mức HTTP (`sendMessage`): route chạy đúng code HttpZaloBot, chỉ thay hàm fetch. `down`: lỗi mạng, thông điệp
 * có cả URL (fetch thật có thể làm vậy, và URL chứa token); `failStatus`: Zalo trả mã lỗi HTTP; `okFalseWith200`: HTTP 200 mà
 * thân `ok: false`.
 */
export class FakeZalo {
  readonly sent: { chatId: string; text: string }[] = [];
  readonly urls: string[] = [];
  readonly contentTypes: (string | undefined)[] = [];
  down = false;
  failStatus: number | null = null;
  okFalseWith200 = false;

  readonly fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    this.urls.push(url);
    if (this.down) throw new TypeError(`fetch failed: ${url}`);
    if (this.failStatus !== null) return json({ ok: false, error_code: this.failStatus, description: "lỗi giả" }, this.failStatus);
    if (this.okFalseWith200) return json({ ok: false, error_code: 404, description: "lỗi giả" });
    this.contentTypes.push((init.headers as Record<string, string>)["content-type"]);
    const body = JSON.parse(init.body as string) as { chat_id: string; text: string };
    this.sent.push({ chatId: body.chat_id, text: body.text });
    return json({ ok: true, result: { message_id: crypto.randomUUID(), date: 1_790_812_800_000 } });
  };

  /** Văn bản các tin đã gửi thành công, theo thứ tự. */
  texts(): string[] {
    return this.sent.map((s) => s.text);
  }
}
```

- [ ] **Step 2: Viết test hỏng**

Tạo `server/test/support-zalo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HttpZaloBot, ZALO_API_BASE, ZaloBotError, zaloFromEnv } from "../src/support/zalo";
import { FakeZalo, TEST_ZALO_OWNER, TEST_ZALO_TOKEN } from "./fakes";

const bot = (zalo: FakeZalo) => new HttpZaloBot(TEST_ZALO_TOKEN, TEST_ZALO_OWNER, zalo.fetch);

describe("HttpZaloBot: gửi tin tới Zalo của chủ dự án (spec 2026-10-22 §2.3)", () => {
  it("gọi sendMessage của Zalo Bot với chat_id của chủ dự án, thân JSON văn bản thuần", async () => {
    const zalo = new FakeZalo();
    await bot(zalo).send("Xin chào 👋");
    expect(zalo.urls).toEqual([`${ZALO_API_BASE}/bot${TEST_ZALO_TOKEN}/sendMessage`]);
    expect(zalo.sent).toEqual([{ chatId: TEST_ZALO_OWNER, text: "Xin chào 👋" }]);
    expect(zalo.contentTypes).toEqual(["application/json"]);
  });

  it("Zalo trả mã lỗi HTTP: ZaloBotError có mã, thông điệp không chứa token", async () => {
    const zalo = new FakeZalo();
    zalo.failStatus = 401;
    const err = await bot(zalo)
      .send("x")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZaloBotError);
    expect((err as ZaloBotError).status).toBe(401);
    expect(String(err)).not.toContain(TEST_ZALO_TOKEN);
  });

  it("HTTP 200 mà thân không có ok: true thì coi là lỗi", async () => {
    const zalo = new FakeZalo();
    zalo.okFalseWith200 = true;
    await expect(bot(zalo).send("x")).rejects.toThrow(ZaloBotError);
  });

  it("lỗi mạng: ZaloBotError không có mã, không chứa URL hay token", async () => {
    const zalo = new FakeZalo();
    zalo.down = true;
    const err = await bot(zalo)
      .send("x")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZaloBotError);
    expect((err as ZaloBotError).status).toBeUndefined();
    expect(String(err)).not.toContain(TEST_ZALO_TOKEN);
    expect(String(err)).not.toContain("zaloplatforms");
  });

  it("zaloFromEnv: thiếu token hay chat_id thì không có bot", () => {
    expect(zaloFromEnv({ ZALO_BOT_TOKEN: "t", ZALO_OWNER_CHAT_ID: "c" })).toBeInstanceOf(HttpZaloBot);
    expect(zaloFromEnv({ ZALO_BOT_TOKEN: "", ZALO_OWNER_CHAT_ID: "c" })).toBeNull();
    expect(zaloFromEnv({ ZALO_BOT_TOKEN: "t", ZALO_OWNER_CHAT_ID: "" })).toBeNull();
  });
});
```

- [ ] **Step 3: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server exec vitest run test/support-zalo.test.ts 2>&1 | tail -6
```
Expected: FAIL, không tải được `../src/support/zalo`.

- [ ] **Step 4: Viết client**

Tạo `server/src/support/zalo.ts`:

```ts
// Gửi tin tới Zalo của chủ dự án qua Zalo Bot Platform, API chính thức của Zalo (spec 2026-10-22 §0, §2.3;
// https://bot.zapps.me/docs/apis/sendMessage/). Chỉ một người nhận: chat_id của chủ dự án (secret ZALO_OWNER_CHAT_ID).
// Token nằm trong đường dẫn URL nên lỗi không bao giờ kèm URL hay thông điệp gốc của fetch.

export const ZALO_API_BASE = "https://bot-api.zaloplatforms.com";
const TIMEOUT_MS = 10_000;

export interface OwnerBot {
  /** Gửi một tin văn bản thuần (1–2000 ký tự) tới Zalo của chủ dự án. Lỗi thì ném ZaloBotError. */
  send(text: string): Promise<void>;
}

export class ZaloBotError extends Error {
  override name = "ZaloBotError";

  constructor(
    message: string,
    /** Mã HTTP Zalo trả; không có nếu lỗi mạng hay quá thời gian chờ. */
    readonly status?: number,
  ) {
    super(message);
  }
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class HttpZaloBot implements OwnerBot {
  constructor(
    private readonly token: string,
    private readonly ownerChatId: string,
    private readonly fetchImpl: FetchFn = (url, init) => fetch(url, init),
  ) {}

  async send(text: string): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${ZALO_API_BASE}/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.ownerChatId, text }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Chỉ ghi tên lỗi: thông điệp của fetch có thể chứa URL, mà URL có token.
      throw new ZaloBotError(`không gọi được Zalo Bot (${err instanceof Error ? err.name : "lỗi lạ"})`);
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Thân không phải JSON: coi như lỗi ở dưới.
    }
    const ok = res.ok && typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === true;
    if (!ok) throw new ZaloBotError(`Zalo Bot từ chối tin (HTTP ${res.status})`, res.status);
  }
}

/** Bot thật của Worker API; thiếu token hay chat_id thì null (chat vẫn lưu tin, không chuyển được sang Zalo). */
export function zaloFromEnv(env: { ZALO_BOT_TOKEN?: string; ZALO_OWNER_CHAT_ID?: string }): OwnerBot | null {
  return env.ZALO_BOT_TOKEN && env.ZALO_OWNER_CHAT_ID ? new HttpZaloBot(env.ZALO_BOT_TOKEN, env.ZALO_OWNER_CHAT_ID) : null;
}
```

- [ ] **Step 5: Thêm `zalo` vào `Deps`**

Trong `server/src/deps.ts`, tìm:

```ts
import { importSigningKey, type KeyCheck, type SigningKey, signToken } from "./token";
```

thay bằng:

```ts
import { type OwnerBot, zaloFromEnv } from "./support/zalo";
import { importSigningKey, type KeyCheck, type SigningKey, signToken } from "./token";
```

Tìm:

```ts
  email: EmailProvider;
  signingKey(): Promise<SigningKey>;
}
```

thay bằng:

```ts
  email: EmailProvider;
  signingKey(): Promise<SigningKey>;
  /** Zalo Bot gửi tin tới chủ dự án (chat hỗ trợ, spec 2026-10-22); null khi thiếu secret. */
  zalo: OwnerBot | null;
}
```

Tìm:

```ts
    signingKey: () => (key ??= loadSigningKey(env)),
  };
}
```

thay bằng:

```ts
    signingKey: () => (key ??= loadSigningKey(env)),
    zalo: zaloFromEnv(env),
  };
}
```

- [ ] **Step 6: Zalo giả trong `world.ts`**

Trong `server/test/world.ts`, tìm:

```ts
import { importSigningKey } from "../src/token";
import {
  FakeCreem,
  FakePayOS,
  FakeResend,
  TEST_CHECKSUM_KEY,
  TEST_CREEM_API_KEY,
  TEST_CREEM_PRODUCTS,
  TEST_CREEM_WEBHOOK_SECRET,
} from "./fakes";
```

thay bằng:

```ts
import { HttpZaloBot } from "../src/support/zalo";
import { importSigningKey } from "../src/token";
import {
  FakeCreem,
  FakePayOS,
  FakeResend,
  FakeZalo,
  TEST_CHECKSUM_KEY,
  TEST_CREEM_API_KEY,
  TEST_CREEM_PRODUCTS,
  TEST_CREEM_WEBHOOK_SECRET,
  TEST_ZALO_OWNER,
  TEST_ZALO_TOKEN,
} from "./fakes";
```

Tìm:

```ts
  const resend = new FakeResend();
  const deps: Deps = {
```

thay bằng:

```ts
  const resend = new FakeResend();
  const zalo = new FakeZalo();
  const deps: Deps = {
```

Tìm:

```ts
    signingKey: async () => importSigningKey(await testSigningJwk("test-1")),
  };
```

thay bằng:

```ts
    signingKey: async () => importSigningKey(await testSigningJwk("test-1")),
    zalo: new HttpZaloBot(TEST_ZALO_TOKEN, TEST_ZALO_OWNER, zalo.fetch),
  };
```

Tìm:

```ts
  return { clock, payos, creem, resend, deps, app, env: testEnv, call, buy, buyCreem, getOrder, customerB };
```

thay bằng:

```ts
  return { clock, payos, creem, resend, zalo, deps, app, env: testEnv, call, buy, buyCreem, getOrder, customerB };
```

- [ ] **Step 7: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4 && pnpm -C server test:scripts 2>&1 | grep -E '^ℹ (tests|fail)'
```
Expected: `tsc` không lỗi; `Tests  1538 passed (1538)`; `ℹ tests 44`, `ℹ fail 0` (test tách Worker vẫn xanh: `deps.ts` chỉ nhập thêm `./support/zalo`).

- [ ] **Step 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/support/zalo.ts server/src/deps.ts server/test/fakes.ts server/test/world.ts server/test/support-zalo.test.ts && git commit -m "feat(server): client Zalo Bot cho chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: D1 của chat (`support/store.ts`)

**Files:**
- Create: `server/src/support/store.ts`
- Test: `server/test/support-store.test.ts`

- [ ] **Step 1: Viết test hỏng**

Tạo `server/test/support-store.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto";
import {
  addCustomerMessage,
  addOwnerMessage,
  conversationByCode,
  conversationByToken,
  createConversation,
  deleteConversation,
  getSetting,
  isEnabled,
  messagesAfter,
  openWithCustomerSince,
  recentConversations,
  setEmail,
  setSetting,
  setStatus,
} from "../src/support/store";
import { newToken } from "../src/support/text";
import { resetDb } from "./db";
import { T0 } from "./world";

beforeEach(resetDb);

const db = env.DB;
const web = { source: "web", lang: "vi", page: "/", context: null } as const;

async function conv(code?: string, now = T0) {
  const token = newToken();
  const makeCode = code === undefined ? undefined : (): string => code;
  return { token, c: await createConversation(db, await sha256Hex(token), web, now, makeCode) };
}

describe("D1 của chat hỗ trợ (migration 0005)", () => {
  it("createConversation: mã 3 ký tự, chỉ lưu mã băm của token; conversationByToken tìm lại, token lạ hay sai dạng thì null", async () => {
    const { token, c } = await conv();
    expect(c).toMatchObject({
      code: expect.stringMatching(/^[2-9A-HJ-NP-Z]{3}$/),
      source: "web",
      lang: "vi",
      page: "/",
      context: null,
      email: null,
      status: "open",
      created_at: T0,
      last_customer_at: null,
      last_owner_at: null,
      last_activity_at: T0,
      delivered_owner_id: 0,
      emailed_owner_id: 0,
      emailed_at: null,
    });
    expect(await db.prepare("SELECT token_hash FROM support_conversations").first()).toEqual({ token_hash: await sha256Hex(token) });
    expect((await conversationByToken(db, token))?.id).toBe(c.id);
    expect(await conversationByToken(db, newToken())).toBeNull();
    expect(await conversationByToken(db, "ngắn")).toBeNull();
  });

  it("createConversation: mã trùng thì sinh lại; trùng mãi thì báo lỗi", async () => {
    await conv("AAA");
    const codes = ["AAA", "BBB"];
    const second = await createConversation(db, await sha256Hex(newToken()), web, T0, () => codes.shift() ?? "ZZZ");
    expect(second.code).toBe("BBB");
    await expect(createConversation(db, await sha256Hex(newToken()), web, T0, () => "AAA")).rejects.toThrow(/mã cuộc chat/);
  });

  it("addCustomerMessage: cập nhật mốc của cuộc chat; messagesAfter trả tin sau con trỏ, tăng dần", async () => {
    const { c } = await conv();
    const m1 = await addCustomerMessage(db, c.id, "một", T0 + 10);
    const m2 = await addCustomerMessage(db, c.id, "hai", T0 + 20);
    expect(m1).toEqual({ id: m1.id, sender: "customer", text: "một", created_at: T0 + 10 });
    expect(m2.id).toBeGreaterThan(m1.id);
    expect(await db.prepare("SELECT last_customer_at, last_activity_at FROM support_conversations WHERE id = ?").bind(c.id).first()).toEqual({
      last_customer_at: T0 + 20,
      last_activity_at: T0 + 20,
    });
    expect((await messagesAfter(db, c.id, 0)).map((m) => m.text)).toEqual(["một", "hai"]);
    expect((await messagesAfter(db, c.id, m1.id)).map((m) => m.text)).toEqual(["hai"]);
  });

  it("addOwnerMessage: cùng message_id của Zalo thì chỉ ghi một lần và chỉ cập nhật mốc một lần", async () => {
    const { c } = await conv();
    expect(await addOwnerMessage(db, c.id, "Chào bạn", "zm-1", T0 + 5)).toBe(true);
    expect(await addOwnerMessage(db, c.id, "Chào bạn", "zm-1", T0 + 6)).toBe(false);
    expect((await messagesAfter(db, c.id, 0)).map((m) => [m.sender, m.text])).toEqual([["owner", "Chào bạn"]]);
    expect(await db.prepare("SELECT last_owner_at, last_activity_at FROM support_conversations WHERE id = ?").bind(c.id).first()).toEqual({
      last_owner_at: T0 + 5,
      last_activity_at: T0 + 5,
    });
  });

  it("conversationByCode không phân biệt hoa thường; setStatus, setEmail ghi đúng", async () => {
    const { c } = await conv("K7Q");
    expect((await conversationByCode(db, "k7q"))?.id).toBe(c.id);
    expect(await conversationByCode(db, "ZZZ")).toBeNull();
    await setStatus(db, c.id, "blocked");
    await setEmail(db, c.id, "khach@example.com", T0 + 9);
    expect(await conversationByCode(db, "K7Q")).toMatchObject({ status: "blocked", email: "khach@example.com", last_activity_at: T0 + 9 });
  });

  it("deleteConversation xóa cả tin của cuộc chat", async () => {
    const { c } = await conv();
    await addCustomerMessage(db, c.id, "x", T0);
    await deleteConversation(db, c.id);
    expect(await db.prepare("SELECT (SELECT COUNT(*) FROM support_conversations) AS c, (SELECT COUNT(*) FROM support_messages) AS m").first()).toEqual({
      c: 0,
      m: 0,
    });
  });

  it("openWithCustomerSince: chỉ cuộc chat đang mở có tin khách từ mốc trở đi, mới nhất trước", async () => {
    const a = (await conv("AAA")).c;
    const b = (await conv("BBB")).c;
    const old = (await conv("CCC")).c;
    const blocked = (await conv("DDD")).c;
    await addCustomerMessage(db, a.id, "a", T0 + 100);
    await addCustomerMessage(db, b.id, "b", T0 + 200);
    await addCustomerMessage(db, old.id, "c", T0 - 5000);
    await addCustomerMessage(db, blocked.id, "d", T0 + 300);
    await setStatus(db, blocked.id, "blocked");
    expect(await openWithCustomerSince(db, T0)).toEqual([
      { id: b.id, code: "BBB" },
      { id: a.id, code: "AAA" },
    ]);
  });

  it("recentConversations: nguồn, trạng thái, có email, tin cuối; mới nhất trước", async () => {
    const a = (await conv("AAA")).c;
    const b = (await conv("BBB")).c;
    await addCustomerMessage(db, a.id, "tin cũ", T0 + 1);
    await addOwnerMessage(db, a.id, "trả lời", "zm-a", T0 + 2);
    await addCustomerMessage(db, b.id, "tin b", T0 + 3);
    await setEmail(db, b.id, "b@example.com", T0 + 4);
    await setStatus(db, a.id, "blocked");
    expect(await recentConversations(db, T0)).toEqual([
      { code: "BBB", source: "web", status: "open", has_email: 1, last_activity_at: T0 + 4, last_text: "tin b" },
      { code: "AAA", source: "web", status: "blocked", has_email: 0, last_activity_at: T0 + 2, last_text: "trả lời" },
    ]);
  });

  it("support_settings: thiếu dòng thì chat tắt; setSetting ghi đè", async () => {
    expect(await isEnabled(db)).toBe(false);
    await setSetting(db, "enabled", "1");
    expect(await isEnabled(db)).toBe(true);
    await setSetting(db, "enabled", "0");
    expect(await getSetting(db, "enabled")).toBe("0");
    expect(await isEnabled(db)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server exec vitest run test/support-store.test.ts 2>&1 | tail -6
```
Expected: FAIL, không tải được `../src/support/store`.

- [ ] **Step 3: Viết mã**

Tạo `server/src/support/store.ts`:

```ts
// Đọc và ghi D1 của chat hỗ trợ (migration 0005; spec 2026-10-22 §2.1). Mọi câu đều có tham số, không ghép chuỗi từ input.
import { sha256Hex } from "../crypto";
import { isTokenShape, type Lang, newCode, type Source } from "./text";

export interface Conversation {
  id: number;
  code: string;
  source: Source;
  lang: Lang;
  page: string | null;
  context: string | null;
  email: string | null;
  status: "open" | "blocked";
  created_at: number;
  last_customer_at: number | null;
  last_owner_at: number | null;
  last_activity_at: number;
  delivered_owner_id: number;
  emailed_owner_id: number;
  emailed_at: number | null;
}

export interface SupportMessage {
  id: number;
  sender: "customer" | "owner";
  text: string;
  created_at: number;
}

export interface NewConversation {
  source: Source;
  lang: Lang;
  page: string | null;
  context: string | null;
}

/** Một dòng của lệnh /ds. `has_email` là 0 hay 1 (SQLite không có kiểu boolean). */
export interface RecentConversation {
  code: string;
  source: Source;
  status: "open" | "blocked";
  has_email: number;
  last_activity_at: number;
  last_text: string | null;
}

const COLUMNS =
  "id, code, source, lang, page, context, email, status, created_at, last_customer_at, last_owner_at, last_activity_at, delivered_owner_id, emailed_owner_id, emailed_at";
const CODE_ATTEMPTS = 8;

export async function conversationByToken(db: D1Database, token: string): Promise<Conversation | null> {
  if (!isTokenShape(token)) return null;
  return db.prepare(`SELECT ${COLUMNS} FROM support_conversations WHERE token_hash = ?`).bind(await sha256Hex(token)).first<Conversation>();
}

export function conversationById(db: D1Database, id: number): Promise<Conversation | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM support_conversations WHERE id = ?`).bind(id).first<Conversation>();
}

/** Tìm theo mã chủ dự án gõ, không phân biệt hoa thường. */
export function conversationByCode(db: D1Database, code: string): Promise<Conversation | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM support_conversations WHERE code = ?`).bind(code.toUpperCase()).first<Conversation>();
}

/** Tạo cuộc chat với mã chưa ai dùng: trùng thì sinh lại, tối đa 8 lần (32.768 mã, nên trùng mãi nghĩa là có lỗi). */
export async function createConversation(
  db: D1Database,
  tokenHash: string,
  input: NewConversation,
  now: number,
  makeCode: () => string = newCode,
): Promise<Conversation> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const row = await db
      .prepare(
        `INSERT INTO support_conversations (code, token_hash, source, lang, page, context, created_at, last_activity_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT (code) DO NOTHING
         RETURNING ${COLUMNS}`,
      )
      .bind(makeCode(), tokenHash, input.source, input.lang, input.page, input.context, now)
      .first<Conversation>();
    if (row) return row;
  }
  throw new Error("không sinh được mã cuộc chat chưa dùng");
}

export async function addCustomerMessage(db: D1Database, conversationId: number, text: string, now: number): Promise<SupportMessage> {
  const [inserted] = await db.batch([
    db
      .prepare("INSERT INTO support_messages (conversation_id, sender, text, created_at) VALUES (?1, 'customer', ?2, ?3) RETURNING id, sender, text, created_at")
      .bind(conversationId, text, now),
    db.prepare("UPDATE support_conversations SET last_customer_at = ?2, last_activity_at = ?2 WHERE id = ?1").bind(conversationId, now),
  ]);
  const row = inserted?.results[0] as SupportMessage | undefined;
  if (!row) throw new Error("không ghi được tin của khách");
  return row;
}

/** Tin của chủ dự án. `zaloMessageId` đã có (Zalo gửi lại webhook) thì không ghi gì và trả false. */
export async function addOwnerMessage(db: D1Database, conversationId: number, text: string, zaloMessageId: string, now: number): Promise<boolean> {
  const [inserted] = await db.batch([
    db
      .prepare(
        `INSERT INTO support_messages (conversation_id, sender, text, created_at, zalo_message_id) VALUES (?1, 'owner', ?2, ?3, ?4)
         ON CONFLICT (zalo_message_id) DO NOTHING`,
      )
      .bind(conversationId, text, now, zaloMessageId),
    // Chỉ khi câu trên vừa ghi một dòng (cùng cách với alertIfChanged ở alerts.ts).
    db.prepare("UPDATE support_conversations SET last_owner_at = ?2, last_activity_at = ?2 WHERE id = ?1 AND changes() = 1").bind(conversationId, now),
  ]);
  return inserted?.meta.changes === 1;
}

/** Tin có id lớn hơn `after`, tăng dần, tối đa `limit`. */
export async function messagesAfter(db: D1Database, conversationId: number, after: number, limit = 200): Promise<SupportMessage[]> {
  const { results } = await db
    .prepare("SELECT id, sender, text, created_at FROM support_messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT ?")
    .bind(conversationId, after, limit)
    .all<SupportMessage>();
  return results;
}

/** Khách đã nhận tới tin chủ dự án có id này (qua khung chat): cron không gửi email cho các tin đó nữa. */
export async function markDelivered(db: D1Database, conversationId: number, ownerMessageId: number): Promise<void> {
  await db
    .prepare("UPDATE support_conversations SET delivered_owner_id = MAX(delivered_owner_id, ?2) WHERE id = ?1")
    .bind(conversationId, ownerMessageId)
    .run();
}

export async function setEmail(db: D1Database, conversationId: number, email: string | null, now: number): Promise<void> {
  await db.prepare("UPDATE support_conversations SET email = ?2, last_activity_at = ?3 WHERE id = ?1").bind(conversationId, email, now).run();
}

export async function setStatus(db: D1Database, conversationId: number, status: "open" | "blocked"): Promise<void> {
  await db.prepare("UPDATE support_conversations SET status = ?2 WHERE id = ?1").bind(conversationId, status).run();
}

export async function deleteConversation(db: D1Database, conversationId: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM support_messages WHERE conversation_id = ?").bind(conversationId),
    db.prepare("DELETE FROM support_conversations WHERE id = ?").bind(conversationId),
  ]);
}

/** Cuộc chat đang mở có tin khách từ `since` trở đi, mới nhất trước (định tuyến câu trả lời không ghi mã). */
export async function openWithCustomerSince(db: D1Database, since: number): Promise<{ id: number; code: string }[]> {
  const { results } = await db
    .prepare("SELECT id, code FROM support_conversations WHERE status = 'open' AND last_customer_at >= ? ORDER BY last_customer_at DESC, id DESC")
    .bind(since)
    .all<{ id: number; code: string }>();
  return results;
}

/** Cuộc chat có hoạt động từ `since` trở đi, mới nhất trước, kèm tin cuối (lệnh /ds). */
export async function recentConversations(db: D1Database, since: number, limit = 20): Promise<RecentConversation[]> {
  const { results } = await db
    .prepare(
      `SELECT c.code, c.source, c.status, c.email IS NOT NULL AS has_email, c.last_activity_at,
              (SELECT m.text FROM support_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_text
       FROM support_conversations c
       WHERE c.last_activity_at >= ?
       ORDER BY c.last_activity_at DESC, c.id DESC
       LIMIT ?`,
    )
    .bind(since, limit)
    .all<RecentConversation>();
  return results;
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM support_settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO support_settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

/** Chat có đang bật không. Thiếu dòng (D1 trống trong test) thì coi là tắt, như mặc định của migration. */
export async function isEnabled(db: D1Database): Promise<boolean> {
  return (await getSetting(db, "enabled")) === "1";
}
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4
```
Expected: `tsc` không lỗi; `Tests  1547 passed (1547)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/support/store.ts server/test/support-store.test.ts && git commit -m "feat(server): D1 của chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Chữ gửi Zalo và đọc lệnh của chủ dự án

**Files:**
- Create: `server/src/support/format.ts`, `server/src/support/owner.ts`
- Test: `server/test/support-format.test.ts`, `server/test/support-owner.test.ts`

- [ ] **Step 1: Viết test hỏng**

Tạo `server/test/support-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ago, customerText, headerLine, listText } from "../src/support/format";
import type { RecentConversation } from "../src/support/store";

const conv = { code: "K7Q", source: "web", lang: "vi", page: "/bang-gia/", context: null } as const;

describe("chữ gửi tới Zalo (spec 2026-10-22 §2.3, §2.5)", () => {
  it("headerLine: mã, nguồn, ngôn ngữ, rồi trang hay thông tin máy, cách nhau bằng ·", () => {
    expect(headerLine(conv)).toBe("🆕 #K7Q · web · vi · /bang-gia/");
    expect(headerLine({ code: "M2D", source: "app", lang: "en", page: null, context: "AI Translator 0.2.4 · macOS 15.6" })).toBe(
      "🆕 #M2D · app · en · AI Translator 0.2.4 · macOS 15.6",
    );
    expect(headerLine({ code: "M2D", source: "app-debug", lang: "vi", page: null, context: null })).toBe("🆕 #M2D · app (debug) · vi");
  });

  it("customerText: tin đầu có dòng 🆕 rồi xuống dòng, tin sau chỉ có mã; không quá 2000 ký tự", () => {
    expect(customerText(conv, "Xin chào", true)).toBe("🆕 #K7Q · web · vi · /bang-gia/\nXin chào");
    expect(customerText(conv, "Cảm ơn", false)).toBe("#K7Q Cảm ơn");
    const long = customerText(conv, "y".repeat(1990), true);
    expect(Array.from(long)).toHaveLength(2000);
    expect(long.endsWith("…")).toBe(true);
  });

  it("ago: vừa xong, phút, giờ, ngày", () => {
    expect([0, 59, 60, 3599, 3600, 86399, 86400, 3 * 86400].map((s) => ago(s))).toEqual([
      "vừa xong",
      "vừa xong",
      "1 phút trước",
      "59 phút trước",
      "1 giờ trước",
      "23 giờ trước",
      "1 ngày trước",
      "3 ngày trước",
    ]);
  });

  it("listText: không có cuộc nào; có thì mỗi dòng mã · nguồn · bao lâu, dấu ✉️ và ⛔, 30 ký tự đầu của tin cuối", () => {
    expect(listText([], 1000)).toBe("Không có cuộc chat nào trong 7 ngày qua.");
    const rows: RecentConversation[] = [
      { code: "K7Q", source: "web", status: "open", has_email: 1, last_activity_at: 1000 - 60, last_text: "Cảm ơn, vậy mình mua 2 key nhé bạn ơi" },
      { code: "M2D", source: "app", status: "blocked", has_email: 0, last_activity_at: 1000 - 7200, last_text: "spam\nspam" },
      { code: "Z9Z", source: "app-debug", status: "open", has_email: 0, last_activity_at: 1000, last_text: null },
    ];
    expect(listText(rows, 1000)).toBe(
      [
        "Cuộc chat 7 ngày qua:",
        '#K7Q · web · 1 phút trước ✉️ · "Cảm ơn, vậy mình mua 2 key nh…"',
        '#M2D · app · 2 giờ trước ⛔ · "spam spam"',
        "#Z9Z · app (debug) · vừa xong",
      ].join("\n"),
    );
  });
});
```

Tạo `server/test/support-owner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseOwnerText } from "../src/support/owner";

describe("đọc tin chủ dự án gõ cho bot (spec 2026-10-22 §2.4, §2.5)", () => {
  it("câu trả lời: có mã ở đầu (không phân biệt hoa thường, nội dung có thể xuống dòng) hay không có mã", () => {
    expect(parseOwnerText("#K7Q Chào bạn")).toEqual({ kind: "reply", code: "K7Q", text: "Chào bạn" });
    expect(parseOwnerText("  #k7q\nDòng 1\nDòng 2 ")).toEqual({ kind: "reply", code: "K7Q", text: "Dòng 1\nDòng 2" });
    expect(parseOwnerText("#K7Q")).toEqual({ kind: "reply", code: "K7Q", text: "" });
    expect(parseOwnerText("Bạn thử lại nhé")).toEqual({ kind: "reply", code: null, text: "Bạn thử lại nhé" });
  });

  it("chỉ là mã khi đúng 3 ký tự chữ hay số và sau đó là khoảng trắng hay hết tin", () => {
    expect(parseOwnerText("#K7QX nội dung")).toEqual({ kind: "reply", code: null, text: "#K7QX nội dung" });
    expect(parseOwnerText("#1 ưu tiên")).toEqual({ kind: "reply", code: null, text: "#1 ưu tiên" });
    expect(parseOwnerText("#K7Q, nội dung")).toEqual({ kind: "reply", code: null, text: "#K7Q, nội dung" });
  });

  it("lệnh /ds, /chan, /mo (có hay không dấu #, gõ có dấu tiếng Việt cũng được), /tat, /bat; thiếu mã thì code null; lệnh lạ là trợ giúp", () => {
    expect(parseOwnerText("/ds")).toEqual({ kind: "list" });
    expect(parseOwnerText("/chan #k7q")).toEqual({ kind: "block", code: "K7Q" });
    expect(parseOwnerText("/chặn K7Q")).toEqual({ kind: "block", code: "K7Q" });
    expect(parseOwnerText("/mo #K7Q")).toEqual({ kind: "unblock", code: "K7Q" });
    expect(parseOwnerText("/mở #K7Q")).toEqual({ kind: "unblock", code: "K7Q" });
    expect(parseOwnerText("/chan")).toEqual({ kind: "block", code: null });
    expect(parseOwnerText("/TAT")).toEqual({ kind: "off" });
    expect(parseOwnerText("/tắt")).toEqual({ kind: "off" });
    expect(parseOwnerText("/tắt".normalize("NFD"))).toEqual({ kind: "off" });
    expect(parseOwnerText("/bat")).toEqual({ kind: "on" });
    expect(parseOwnerText("/bật")).toEqual({ kind: "on" });
    expect(parseOwnerText("/help")).toEqual({ kind: "help" });
    expect(parseOwnerText("/")).toEqual({ kind: "help" });
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server exec vitest run test/support-format.test.ts test/support-owner.test.ts 2>&1 | tail -6
```
Expected: FAIL, không tải được `../src/support/format` và `../src/support/owner`.

- [ ] **Step 3: Viết `format.ts`**

Tạo `server/src/support/format.ts`:

```ts
// Chữ gửi tới Zalo của chủ dự án (spec 2026-10-22 §2.3–2.5): văn bản thuần, tiếng Việt, tối đa 2000 ký tự mỗi tin.
// Email của khách không bao giờ có ở đây: không hàm nào nhận email (test support-webhook khóa điều này từ đầu tới cuối).
import type { Conversation, RecentConversation } from "./store";
import { truncate, ZALO_MAX_TEXT } from "./text";

const SOURCE_LABEL = { web: "web", app: "app", "app-debug": "app (debug)" } as const;

type Header = Pick<Conversation, "code" | "source" | "lang" | "page" | "context">;

/** Dòng mở đầu của tin đầu tiên mỗi cuộc chat. */
export function headerLine(conv: Header): string {
  return [`🆕 #${conv.code}`, SOURCE_LABEL[conv.source], conv.lang, conv.page, conv.context]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" · ");
}

/** Một tin của khách như chủ dự án thấy trong Zalo. */
export function customerText(conv: Header, text: string, first: boolean): string {
  return truncate(first ? `${headerLine(conv)}\n${text}` : `#${conv.code} ${text}`, ZALO_MAX_TEXT);
}

export function ago(seconds: number): string {
  if (seconds < 60) return "vừa xong";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
  return `${Math.floor(seconds / 86400)} ngày trước`;
}

/** Trả lời lệnh /ds. */
export function listText(rows: RecentConversation[], now: number): string {
  if (rows.length === 0) return "Không có cuộc chat nào trong 7 ngày qua.";
  const lines = rows.map((r) => {
    const marks = `${r.has_email ? " ✉️" : ""}${r.status === "blocked" ? " ⛔" : ""}`;
    const preview = r.last_text === null ? "" : ` · "${truncate(r.last_text.replace(/\s+/g, " "), 30)}"`;
    return `#${r.code} · ${SOURCE_LABEL[r.source]} · ${ago(now - r.last_activity_at)}${marks}${preview}`;
  });
  return truncate(["Cuộc chat 7 ngày qua:", ...lines].join("\n"), ZALO_MAX_TEXT);
}

export const HELP_TEXT = [
  "Trả lời khách: #MÃ nội dung (ví dụ: #K7Q Chào bạn…). Không ghi mã thì tin tới cuộc chat duy nhất vừa nhắn trong 30 phút qua.",
  "/ds: các cuộc chat 7 ngày qua",
  "/chan #MÃ: chặn cuộc chat (tin của khách đó không chuyển tới nữa)",
  "/mo #MÃ: bỏ chặn",
  "/tat, /bat: tắt hay bật chat trên website và app",
].join("\n");

/** Các câu bot trả lời chủ dự án. */
export const BOT_TEXT = {
  textOnly: "Chỉ gửi được chữ.",
  emptyReply: "Thiếu nội dung sau mã.",
  noneRecent: "Không có cuộc chat nào nhắn trong 30 phút qua. Ghi mã ở đầu tin, ví dụ: #K7Q nội dung",
  ambiguous: (codes: string[]) =>
    `⚠️ Có ${codes.length} cuộc chat vừa nhắn trong 30 phút qua (${codes.map((c) => `#${c}`).join(", ")}). Ghi mã ở đầu tin, ví dụ: #${codes[0] ?? "K7Q"} nội dung`,
  delivered: (code: string) => `✓ đã gửi tới #${code}`,
  noSuchCode: (code: string) => `Không có cuộc chat #${code}.`,
  blocked: (code: string) => `#${code} đang bị chặn (gõ /mo #${code} để mở).`,
  blockedOk: (code: string) => `Đã chặn #${code}: tin của khách này không chuyển tới nữa.`,
  unblockedOk: (code: string) => `Đã bỏ chặn #${code}.`,
  needCode: (command: string) => `Thiếu mã, ví dụ: ${command} #K7Q`,
  turnedOff: "Đã TẮT chat trên website và app. Khách thấy email support@ thay ô nhập. Gõ /bat để bật lại.",
  turnedOn: "Đã BẬT chat trên website và app.",
  emailSaved: (code: string) => `#${code} ✉️ khách đã để lại email`,
  deleted: (code: string) => `#${code} 🗑 khách đã xóa cuộc chat`,
} as const;
```

- [ ] **Step 4: Viết `owner.ts`**

Tạo `server/src/support/owner.ts`:

```ts
// Đọc tin chủ dự án gõ cho bot: lệnh hay câu trả lời (spec 2026-10-22 §2.4, §2.5).

export type OwnerAction =
  | { kind: "reply"; code: string | null; text: string }
  | { kind: "block" | "unblock"; code: string | null }
  | { kind: "list" | "off" | "on" | "help" };

/** Mã ở đầu tin: `#` + 3 chữ hay số, sau đó là khoảng trắng hay hết tin. */
const CODE_AT_START = /^#([A-Za-z0-9]{3})(?=\s|$)([\s\S]*)$/;
/** Mã làm tham số của lệnh, có hay không dấu `#`. */
const CODE_ARG = /^#?([A-Za-z0-9]{3})$/;
/** Lệnh và cách gõ có dấu tiếng Việt (bàn phím điện thoại hay tự thêm dấu). */
const COMMANDS: Record<string, "list" | "block" | "unblock" | "off" | "on"> = {
  "/ds": "list",
  "/chan": "block",
  "/chặn": "block",
  "/mo": "unblock",
  "/mở": "unblock",
  "/tat": "off",
  "/tắt": "off",
  "/bat": "on",
  "/bật": "on",
};

export function parseOwnerText(raw: string): OwnerAction {
  const text = raw.trim();
  if (text.startsWith("/")) {
    const [command = "", arg = ""] = text.split(/\s+/);
    const name = command.normalize("NFC").toLowerCase();
    const kind = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
    if (kind === "block" || kind === "unblock") return { kind, code: CODE_ARG.exec(arg)?.[1]?.toUpperCase() ?? null };
    return kind === undefined ? { kind: "help" } : { kind };
  }
  const m = CODE_AT_START.exec(text);
  if (m) return { kind: "reply", code: (m[1] ?? "").toUpperCase(), text: (m[2] ?? "").trim() };
  return { kind: "reply", code: null, text };
}
```

- [ ] **Step 5: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4
```
Expected: `tsc` không lỗi; `Tests  1554 passed (1554)`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/support/format.ts server/src/support/owner.ts server/test/support-format.test.ts server/test/support-owner.test.ts && git commit -m "feat(server): chữ gửi Zalo và lệnh của chủ dự án cho chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Chuyển tin khách sang Zalo (`support/forward.ts`)

**Files:**
- Create: `server/src/support/forward.ts`
- Test: `server/test/support-forward.test.ts`

- [ ] **Step 1: Viết test hỏng**

Tạo `server/test/support-forward.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../src/crypto";
import { forwardConversation } from "../src/support/forward";
import { addCustomerMessage, createConversation, type NewConversation, setStatus } from "../src/support/store";
import { newToken } from "../src/support/text";
import { HttpZaloBot } from "../src/support/zalo";
import { resetDb } from "./db";
import { FakeZalo, TEST_ZALO_OWNER, TEST_ZALO_TOKEN } from "./fakes";
import { T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

const db = env.DB;
const APP: NewConversation = { source: "app", lang: "vi", page: null, context: "AI Translator 0.2.4 · macOS 15.6" };
const HEADER = "🆕 #M2D · app · vi · AI Translator 0.2.4 · macOS 15.6";

async function setup() {
  const zalo = new FakeZalo();
  const bot = new HttpZaloBot(TEST_ZALO_TOKEN, TEST_ZALO_OWNER, zalo.fetch);
  const conv = await createConversation(db, await sha256Hex(newToken()), APP, T0, () => "M2D");
  return { zalo, bot, conv };
}

const rows = async () => (await db.prepare("SELECT text, forwarded_at, forward_attempts FROM support_messages ORDER BY id").all()).results;

describe("chuyển tin khách sang Zalo (spec 2026-10-22 §2.3)", () => {
  it("tin đầu có dòng 🆕 kèm thông tin máy, tin sau chỉ có mã; đánh dấu đã chuyển; gọi lại thì không gửi trùng", async () => {
    const { zalo, bot, conv } = await setup();
    await addCustomerMessage(db, conv.id, "Phụ đề không hiện", T0);
    await addCustomerMessage(db, conv.id, "Mình dùng Teams", T0 + 1);
    expect(await forwardConversation(db, bot, conv.id, T0 + 2)).toBe("sent");
    expect(zalo.texts()).toEqual([`${HEADER}\nPhụ đề không hiện`, "#M2D Mình dùng Teams"]);
    expect(await rows()).toEqual([
      { text: "Phụ đề không hiện", forwarded_at: T0 + 2, forward_attempts: 0 },
      { text: "Mình dùng Teams", forwarded_at: T0 + 2, forward_attempts: 0 },
    ]);
    expect(await forwardConversation(db, bot, conv.id, T0 + 3)).toBe("idle");
    expect(zalo.sent).toHaveLength(2);
  });

  it("Zalo lỗi: tin trở lại hàng chờ, đếm lần thử, tin sau không được gửi trước; lần sau gửi đúng thứ tự và tin đầu vẫn có dòng 🆕", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { zalo, bot, conv } = await setup();
    await addCustomerMessage(db, conv.id, "một", T0);
    await addCustomerMessage(db, conv.id, "hai", T0 + 1);
    zalo.failStatus = 500;
    expect(await forwardConversation(db, bot, conv.id, T0 + 2)).toBe("failed");
    expect(await rows()).toEqual([
      { text: "một", forwarded_at: null, forward_attempts: 1 },
      { text: "hai", forwarded_at: null, forward_attempts: 0 },
    ]);
    zalo.failStatus = null;
    expect(await forwardConversation(db, bot, conv.id, T0 + 300)).toBe("sent");
    expect(zalo.texts()).toEqual([`${HEADER}\nmột`, "#M2D hai"]);
  });

  it("cuộc chat bị chặn, hay không có bot (thiếu secret): không gửi gì", async () => {
    const { zalo, bot, conv } = await setup();
    await addCustomerMessage(db, conv.id, "spam", T0);
    expect(await forwardConversation(db, null, conv.id, T0)).toBe("idle");
    await setStatus(db, conv.id, "blocked");
    expect(await forwardConversation(db, bot, conv.id, T0)).toBe("idle");
    expect(zalo.sent).toEqual([]);
  });

  it("tin chờ quá 24 giờ thì không gửi nữa", async () => {
    const { zalo, bot, conv } = await setup();
    await addCustomerMessage(db, conv.id, "cũ", T0);
    expect(await forwardConversation(db, bot, conv.id, T0 + 86401)).toBe("idle");
    expect(zalo.sent).toEqual([]);
  });

  it("tin đã được giữ chỗ (forwarded_at đã đặt, ví dụ một request khác đang gửi) thì không gửi lại", async () => {
    const { zalo, bot, conv } = await setup();
    const m = await addCustomerMessage(db, conv.id, "một", T0);
    await db.prepare("UPDATE support_messages SET forwarded_at = ? WHERE id = ?").bind(T0, m.id).run();
    expect(await forwardConversation(db, bot, conv.id, T0 + 1)).toBe("idle");
    expect(zalo.sent).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server exec vitest run test/support-forward.test.ts 2>&1 | tail -6
```
Expected: FAIL, không tải được `../src/support/forward`.

- [ ] **Step 3: Viết mã**

Tạo `server/src/support/forward.ts`:

```ts
// Chuyển tin của khách sang Zalo của chủ dự án (spec 2026-10-22 §2.3). Gọi ngay sau khi khách gửi (waitUntil) và từ cron (tin còn chờ).
import { customerText } from "./format";
import { conversationById } from "./store";
import type { OwnerBot } from "./zalo";

/** Tin chờ quá 24 giờ thì thôi chuyển; tin vẫn còn trong cuộc chat của khách. */
export const FORWARD_WINDOW = 86400;
/** Trần số tin chuyển trong một lần gọi, để một cuộc chat không giữ request hay cron quá lâu. */
const MAX_PER_CALL = 25;

export type ForwardResult = "sent" | "failed" | "idle";

/**
 * Chuyển các tin khách còn chờ của một cuộc chat theo thứ tự id. Mỗi tin được giữ chỗ (đặt `forwarded_at`) trước khi gửi, nên
 * request và cron chạy chồng nhau không gửi trùng; gửi lỗi thì trả chỗ, tăng `forward_attempts` và dừng, để tin sau không đi
 * trước tin lỗi. Hai request của cùng một khách chen nhau từng mili giây vẫn có thể đảo thứ tự hai tin: chấp nhận.
 */
export async function forwardConversation(db: D1Database, zalo: OwnerBot | null, conversationId: number, now: number): Promise<ForwardResult> {
  if (!zalo) return "idle";
  const conv = await conversationById(db, conversationId);
  if (!conv || conv.status !== "open") return "idle";
  let result: ForwardResult = "idle";
  for (let i = 0; i < MAX_PER_CALL; i++) {
    const msg = await db
      .prepare(
        `SELECT id, text FROM support_messages
         WHERE conversation_id = ? AND sender = 'customer' AND forwarded_at IS NULL AND created_at >= ?
         ORDER BY id LIMIT 1`,
      )
      .bind(conversationId, now - FORWARD_WINDOW)
      .first<{ id: number; text: string }>();
    if (!msg) break;
    const claim = await db.prepare("UPDATE support_messages SET forwarded_at = ? WHERE id = ? AND forwarded_at IS NULL").bind(now, msg.id).run();
    if (claim.meta.changes !== 1) break;
    const first = await db
      .prepare("SELECT MIN(id) AS id FROM support_messages WHERE conversation_id = ? AND sender = 'customer'")
      .bind(conversationId)
      .first<{ id: number }>();
    try {
      await zalo.send(customerText(conv, msg.text, first?.id === msg.id));
      result = "sent";
    } catch (err) {
      await db
        .prepare("UPDATE support_messages SET forwarded_at = NULL, forward_attempts = forward_attempts + 1 WHERE id = ?")
        .bind(msg.id)
        .run();
      console.warn(JSON.stringify({ event: "support_forward_failed", conversation: conv.code, error: String(err) }));
      return "failed";
    }
  }
  return result;
}
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4
```
Expected: `tsc` không lỗi; `Tests  1559 passed (1559)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/support/forward.ts server/test/support-forward.test.ts && git commit -m "feat(server): chuyển tin chat hỗ trợ sang Zalo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Endpoint gửi tin, trạng thái, CORS

**Files:**
- Create: `server/src/support/routes.ts`, `server/test/support-helpers.ts`
- Modify: `server/src/http.ts`, `server/src/ratelimit.ts`, `server/src/alerts.ts`, `server/src/app.ts`
- Test: `server/test/support-routes.test.ts`

- [ ] **Step 1: Hàm dùng chung cho test**

Tạo `server/test/support-helpers.ts`:

```ts
// Hàm dùng chung cho test chat hỗ trợ: bật chat, mở cuộc chat như khách, giả tin chủ dự án gửi qua webhook Zalo.
import { env } from "cloudflare:workers";
import { sha256Hex } from "../src/crypto";
import { setSetting } from "../src/support/store";
import { TEST_ZALO_OWNER, TEST_ZALO_WEBHOOK_SECRET } from "./fakes";
import type { makeWorld } from "./world";

type World = ReturnType<typeof makeWorld>;

/** Chat mặc định tắt (migration 0005, và resetDb xóa cả bảng cài đặt): test cần gửi tin thì bật trước. */
export const enableChat = () => setSetting(env.DB, "enabled", "1");

export const firstMessage = (over: Record<string, unknown> = {}) => ({
  text: "Gói Monthly dùng được trên 2 máy không?",
  lang: "vi",
  source: "web",
  page: "/bang-gia/",
  ...over,
});

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Khách mở cuộc chat bằng tin đầu tiên. Ném lỗi nếu không phải 201, để test không chạy tiếp với token rỗng. */
export async function startChat(w: World, over: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const r = await w.call("POST", "/v1/support/messages", firstMessage(over), headers);
  if (r.status !== 201) throw new Error(`mở cuộc chat: ${r.status} ${JSON.stringify(r.body)}`);
  const token = r.body.token as string;
  const row = await env.DB.prepare("SELECT id, code FROM support_conversations WHERE token_hash = ?")
    .bind(await sha256Hex(token))
    .first<{ id: number; code: string }>();
  if (!row) throw new Error("không thấy cuộc chat vừa mở");
  return { token, id: row.id, code: row.code, message: r.body.message as { id: number; text: string } };
}

/** Sự kiện Zalo gửi tới webhook (dạng của tài liệu: bọc trong `result`). */
export function zaloUpdate(eventName: string, message: Record<string, unknown>, chatId: string = TEST_ZALO_OWNER) {
  return {
    ok: true,
    result: {
      event_name: eventName,
      message: {
        from: { id: chatId, display_name: "Chủ dự án", is_bot: false },
        chat: { id: chatId, chat_type: "PRIVATE" },
        message_id: crypto.randomUUID(),
        date: 1_790_812_800_000,
        ...message,
      },
    },
  };
}

export const ownerSays = (text: string, messageId: string = crypto.randomUUID(), chatId: string = TEST_ZALO_OWNER) =>
  zaloUpdate("message.text.received", { text, message_id: messageId }, chatId);

export const webhook = (w: World, body: unknown, secret: string = TEST_ZALO_WEBHOOK_SECRET) =>
  w.call("POST", "/v1/webhooks/zalo", body, { "x-bot-api-secret-token": secret });
```

- [ ] **Step 2: Viết test hỏng**

Tạo `server/test/support-routes.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex, sha256Hex } from "../src/crypto";
import { LIMITS } from "../src/ratelimit";
import { resetDb } from "./db";
import { auth, enableChat, firstMessage, startChat } from "./support-helpers";
import { makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;
const post = (w: World, body: unknown, headers: Record<string, string> = {}) => w.call("POST", "/v1/support/messages", body, headers);
const conversation = (id: number) =>
  env.DB.prepare("SELECT code, source, lang, page, context, email, status FROM support_conversations WHERE id = ?").bind(id).first();
const countConversations = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM support_conversations").first<{ n: number }>())?.n;

describe("POST /v1/support/messages và GET /v1/support/status (spec 2026-10-22 §2.2)", () => {
  it("status: chat tắt cho tới khi chủ dự án bật", async () => {
    const w = makeWorld();
    expect(await w.call("GET", "/v1/support/status")).toMatchObject({ status: 200, body: { enabled: false } });
    await enableChat();
    expect(await w.call("GET", "/v1/support/status")).toMatchObject({ status: 200, body: { enabled: true } });
  });

  it("chat tắt: 503 support_disabled, không lưu gì", async () => {
    const w = makeWorld();
    expect(await post(w, firstMessage())).toMatchObject({ status: 503, body: { error: "support_disabled" } });
    expect(await countConversations()).toBe(0);
  });

  it("tin đầu từ website: 201 kèm token và tin; lưu nguồn, ngôn ngữ, trang (bỏ query); Zalo nhận tin có dòng 🆕", async () => {
    const w = makeWorld();
    await enableChat();
    const r = await post(w, firstMessage({ page: "/bang-gia/?utm=fb", context: "không được lưu với web" }));
    expect(r.status).toBe(201);
    expect(r.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.body.message).toEqual({ id: expect.any(Number), sender: "customer", text: "Gói Monthly dùng được trên 2 máy không?", created_at: T0 });
    const row = await env.DB.prepare("SELECT code, source, lang, page, context, email, status, token_hash FROM support_conversations").first<{
      code: string;
    }>();
    expect(row).toMatchObject({
      source: "web",
      lang: "vi",
      page: "/bang-gia/",
      context: null,
      email: null,
      status: "open",
      token_hash: await sha256Hex(r.body.token as string),
    });
    expect(w.zalo.texts()).toEqual([`🆕 #${row?.code} · web · vi · /bang-gia/\nGói Monthly dùng được trên 2 máy không?`]);
  });

  it("tin đầu từ app: lưu thông tin máy, bỏ trang; bản debug ghi app (debug)", async () => {
    const w = makeWorld();
    await enableChat();
    const a = await startChat(w, { source: "app", page: "/x", context: "AI Translator 0.2.4 · macOS 15.6" });
    expect(await conversation(a.id)).toMatchObject({ source: "app", page: null, context: "AI Translator 0.2.4 · macOS 15.6" });
    const d = await startChat(w, { source: "app-debug", lang: "en", context: null });
    expect(await conversation(d.id)).toMatchObject({ source: "app-debug", lang: "en", page: null, context: null });
    expect(w.zalo.texts()[1]).toBe(`🆕 #${d.code} · app (debug) · en\nGói Monthly dùng được trên 2 máy không?`);
  });

  it("tin sau kèm token: 201 không có token mới, bỏ qua lang và source; Zalo nhận tin chỉ có mã", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    const r = await post(w, { text: "  Cảm ơn\r\nbạn  ", lang: "khác", source: "khác" }, auth(chat.token));
    expect(r).toMatchObject({ status: 201, body: { message: { sender: "customer", text: "Cảm ơn\nbạn" } } });
    expect("token" in r.body).toBe(false);
    expect(w.zalo.texts()[1]).toBe(`#${chat.code} Cảm ơn\nbạn`);
  });

  it("thân sai: 400 kèm field; thiếu Content-Type JSON: 415", async () => {
    const w = makeWorld();
    await enableChat();
    expect(await post(w, "không phải json")).toMatchObject({ status: 400, body: { error: "invalid_request", field: "body" } });
    expect(await post(w, firstMessage({ text: "   " }))).toMatchObject({ status: 400, body: { field: "text" } });
    expect(await post(w, firstMessage({ text: "x".repeat(1001) }))).toMatchObject({ status: 400, body: { field: "text" } });
    expect(await post(w, firstMessage({ lang: "fr" }))).toMatchObject({ status: 400, body: { field: "lang" } });
    expect(await post(w, firstMessage({ source: "admin" }))).toMatchObject({ status: 400, body: { field: "source" } });
    expect(await post(w, JSON.stringify(firstMessage()), { "content-type": "text/plain" })).toMatchObject({ status: 415 });
    expect(await countConversations()).toBe(0);
  });

  it("token sai: 401 invalid_token và tính là thất bại của IP; IP đã chạm ngưỡng thì 429", async () => {
    const w = makeWorld();
    await enableChat();
    const bad = { authorization: `Bearer ${"A".repeat(43)}` };
    expect(await post(w, { text: "x" }, bad)).toMatchObject({ status: 401, body: { error: "invalid_token" } });
    const bucket = `failure_ip:${await hmacSha256Hex("test-pepper", "203.0.113.10")}`;
    expect(await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = ?").bind(bucket).first()).toEqual({ count: 1 });
    await env.DB.prepare("UPDATE rate_limits SET count = ? WHERE bucket = ?").bind(LIMITS.failure_ip, bucket).run();
    const r = await post(w, { text: "x" }, bad);
    expect(r).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("cuộc chat bị chủ dự án chặn: 403 conversation_closed", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await env.DB.prepare("UPDATE support_conversations SET status = 'blocked' WHERE id = ?").bind(chat.id).run();
    expect(await post(w, { text: "x" }, auth(chat.token))).toMatchObject({ status: 403, body: { error: "conversation_closed" } });
  });

  it("giới hạn theo giờ: 5 cuộc chat mới mỗi IP, 20 tin tiếp theo mỗi cuộc chat", async () => {
    const w = makeWorld();
    await enableChat();
    for (let i = 0; i < LIMITS.support_new_ip; i++) await startChat(w);
    const sixth = await post(w, firstMessage());
    expect(sixth).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(sixth.headers.get("retry-after")).toBe("3600");
    const ip2 = { "cf-connecting-ip": "203.0.113.20" };
    const chat = await startChat(w, {}, ip2);
    for (let i = 0; i < LIMITS.support_msg_conv; i++) {
      expect((await post(w, { text: `tin ${i}` }, { ...auth(chat.token), ...ip2 })).status).toBe(201);
    }
    expect(await post(w, { text: "thêm" }, { ...auth(chat.token), ...ip2 })).toMatchObject({ status: 429, body: { error: "rate_limited" } });
  });

  it("trần toàn hệ thống: support_busy kèm Retry-After, một cảnh báo support_flood cho giờ đó, không lưu gì", async () => {
    const w = makeWorld();
    await enableChat();
    const bucket = `support_global:${await hmacSha256Hex("test-pepper", "all")}`;
    await env.DB.prepare("INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, ?)").bind(bucket, T0, LIMITS.support_global).run();
    const r = await post(w, firstMessage());
    expect(r).toMatchObject({ status: 429, body: { error: "support_busy" } });
    expect(r.headers.get("retry-after")).toBe("3600");
    expect((await post(w, firstMessage())).body.error).toBe("support_busy");
    expect((await env.DB.prepare("SELECT kind, count FROM ops_alerts").all()).results).toEqual([{ kind: "support_flood", count: 1 }]);
    expect(await countConversations()).toBe(0);
  });

  it("CORS: preflight từ website được phép; lỗi vẫn có header cho website; origin khác và route khác không có header CORS", async () => {
    const w = makeWorld();
    const origin = { origin: "https://aitranslator.io.vn" };
    const pre = await w.call("OPTIONS", "/v1/support/messages", undefined, {
      ...origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,authorization",
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://aitranslator.io.vn");
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET,POST,PUT,DELETE,OPTIONS");
    expect(pre.headers.get("access-control-allow-headers")).toBe("Content-Type,Authorization");
    expect(pre.headers.get("access-control-max-age")).toBe("86400");
    const off = await post(w, firstMessage(), origin);
    expect(off.status).toBe(503);
    expect(off.headers.get("access-control-allow-origin")).toBe("https://aitranslator.io.vn");
    expect(off.headers.get("access-control-expose-headers")).toBe("Retry-After");
    const evil = await w.call("GET", "/v1/support/status", undefined, { origin: "https://evil.example" });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    expect((await w.call("GET", "/v1/health", undefined, origin)).headers.get("access-control-allow-origin")).toBeNull();
  });

  it("Zalo lỗi lúc khách gửi: vẫn 201, tin nằm chờ để cron gửi lại", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.failStatus = 502;
    expect((await post(w, firstMessage())).status).toBe(201);
    expect(await env.DB.prepare("SELECT forwarded_at, forward_attempts FROM support_messages").first()).toEqual({ forwarded_at: null, forward_attempts: 1 });
  });
});
```

- [ ] **Step 3: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server exec vitest run test/support-routes.test.ts 2>&1 | tail -8
```
Expected: FAIL; các test nhận `404 not_found` (chưa có route).

- [ ] **Step 4: Mã lỗi, hạn mức, cảnh báo**

Trong `server/src/http.ts`, tìm:

```ts
  | "rejected_sensitive"
  | "internal";
```

thay bằng:

```ts
  | "rejected_sensitive"
  | "invalid_token"
  | "conversation_closed"
  | "support_busy"
  | "support_disabled"
  | "internal";
```

Trong `server/src/ratelimit.ts`, tìm:

```ts
  diag_global: 120,
} as const;
```

thay bằng:

```ts
  diag_global: 120,
  // Chat hỗ trợ (spec 2026-10-22 §2.7). Việc hỏi tin mới không đếm ở đây (mỗi lần đếm là một lần ghi D1): xem binding
  // SUPPORT_POLL_LIMITER ở wrangler.jsonc. support_global chạm ngưỡng thì có cảnh báo support_flood.
  support_msg_ip: 30,
  support_new_ip: 5,
  support_msg_conv: 20,
  support_email_conv: 5,
  support_global: 200,
} as const;
```

Trong `server/src/alerts.ts`, tìm:

```ts
  | "error_report_new"
  | "diagnostics_flood";
```

thay bằng:

```ts
  | "error_report_new"
  | "diagnostics_flood"
  | "support_zalo_failed"
  | "support_flood";
```

Tìm:

```ts
    "Mở Web Admin, trang Báo cáo lỗi để xem nguồn, xóa báo cáo rác nếu cần.",
};
```

thay bằng:

```ts
    "Mở Web Admin, trang Báo cáo lỗi để xem nguồn, xóa báo cáo rác nếu cần.",
  support_zalo_failed:
    "Chat hỗ trợ: 3 lần cron liền không chuyển được tin của khách sang Zalo (token Zalo Bot sai hay bị thu hồi, bot bị khóa, hay Zalo lỗi). " +
    'Tin vẫn được lưu và được thử lại trong 24 giờ; khách thấy "Đã gửi" nhưng bạn chưa nhận. Kiểm bot ở Zalo Bot Manager, đặt lại ' +
    "ZALO_BOT_TOKEN nếu cần (docs/release/phat-hanh.md mục 11). Muốn khung chat hiện email support@ trong lúc chờ: nhắn /tat cho bot, " +
    "hay chạy `wrangler d1 execute mt-license-production --remote --command \"UPDATE support_settings SET value = '0' WHERE key = 'enabled'\"`.",
  support_flood:
    'Chat hỗ trợ chạm trần toàn hệ thống (200 tin của khách mỗi giờ): có thể đang bị spam. Khách nhận "đang bận, hãy gửi email" tới hết giờ. ' +
    "Nhắn /ds cho bot để xem các cuộc chat, /chan #MÃ để chặn cuộc chat spam, hay /tat để tắt chat.",
};
```

- [ ] **Step 5: Viết route**

Tạo `server/src/support/routes.ts`:

```ts
// Endpoint của khung chat hỗ trợ trên website và trong app (spec 2026-10-22 §2.2; hợp đồng ở kế hoạch 00).
import type { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { raiseAlert } from "../alerts";
import type { AppEnv } from "../app";
import { sha256Hex } from "../crypto";
import { clientIp, fail, readJson, tooMany } from "../http";
import { failureBlock, hit, LIMITS, noteFailure } from "../ratelimit";
import { forwardConversation } from "./forward";
import { addCustomerMessage, type Conversation, conversationByToken, createConversation, isEnabled, type NewConversation } from "./store";
import { newToken, parseContext, parseLang, parsePage, parseSource, parseText } from "./text";

/** Origin duy nhất được gọi từ trình duyệt. App gọi qua Rust, không có header Origin. */
export const SUPPORT_ORIGIN = "https://aitranslator.io.vn";

/** CORS của `/v1/support/*`: chỉ origin của website; đặt trước mọi middleware có thể trả lỗi, để trình duyệt đọc được cả thân lỗi. */
export const supportCors = cors({
  origin: SUPPORT_ORIGIN,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Retry-After"],
  maxAge: 86400,
});

export type SupportContext = Context<AppEnv>;

export function bearer(c: SupportContext): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]+)$/.exec(c.req.header("authorization") ?? "");
  return m?.[1] ?? null;
}

/** Cuộc chat của token trong header. Sai thì trả response lỗi; token sai tính là một lần thất bại của IP (như key sai). */
export async function authed(c: SupportContext): Promise<Conversation | Response> {
  const token = bearer(c);
  const conv = token === null ? null : await conversationByToken(c.env.DB, token);
  if (conv) return conv;
  const now = c.get("deps").now();
  const ip = clientIp(c);
  await noteFailure(c.env, ip, now, "support_token");
  const wait = await failureBlock(c.env, ip, now);
  return wait > 0 ? tooMany(c, wait) : fail(c, 401, "invalid_token");
}

function busy(c: SupportContext, retryAfter: number) {
  c.header("retry-after", String(retryAfter));
  return fail(c, 429, "support_busy");
}

type Target = { kind: "existing"; conv: Conversation } | { kind: "new"; input: NewConversation };

export function registerSupport(app: Hono<AppEnv>) {
  app.get("/v1/support/status", async (c) => c.json({ enabled: await isEnabled(c.env.DB) }));

  app.post("/v1/support/messages", async (c) => {
    const db = c.env.DB;
    const deps = c.get("deps");
    const now = deps.now();
    if (!(await isEnabled(db))) return fail(c, 503, "support_disabled");
    const ip = clientIp(c);
    // Đếm trước khi đọc thân, như /v1/diagnostics: request sai cũng tốn hạn mức của IP.
    const perIp = await hit(c.env, "support_msg_ip", ip, now);
    if (!perIp.allowed) return tooMany(c, perIp.retryAfter);
    const body = await readJson(c);
    if (!body) return fail(c, 400, "invalid_request", { field: "body" });
    const text = parseText(body.text);
    if (text === null) return fail(c, 400, "invalid_request", { field: "text" });

    let target: Target;
    if (c.req.header("authorization") !== undefined) {
      const found = await authed(c);
      if (found instanceof Response) return found;
      if (found.status === "blocked") return fail(c, 403, "conversation_closed");
      const perConv = await hit(c.env, "support_msg_conv", String(found.id), now);
      if (!perConv.allowed) return tooMany(c, perConv.retryAfter);
      target = { kind: "existing", conv: found };
    } else {
      const lang = parseLang(body.lang);
      if (!lang) return fail(c, 400, "invalid_request", { field: "lang" });
      const source = parseSource(body.source);
      if (!source) return fail(c, 400, "invalid_request", { field: "source" });
      const perIpNew = await hit(c.env, "support_new_ip", ip, now);
      if (!perIpNew.allowed) return tooMany(c, perIpNew.retryAfter);
      const web = source === "web";
      target = { kind: "new", input: { source, lang, page: web ? parsePage(body.page) : null, context: web ? null : parseContext(body.context) } };
    }

    const global = await hit(c.env, "support_global", "all", now);
    if (!global.allowed) {
      // Đúng lần từ chối đầu tiên của giờ này: một cảnh báo, không phải mỗi request.
      if (global.count === LIMITS.support_global + 1) await raiseAlert(db, "support_flood", now);
      return busy(c, global.retryAfter);
    }

    let token: string | null = null;
    let conv: Conversation;
    if (target.kind === "existing") {
      conv = target.conv;
    } else {
      const fresh = newToken();
      conv = await createConversation(db, await sha256Hex(fresh), target.input, now);
      token = fresh;
    }
    const message = await addCustomerMessage(db, conv.id, text, now);
    c.executionCtx.waitUntil(
      forwardConversation(db, deps.zalo, conv.id, now).catch((err: unknown) =>
        console.error(JSON.stringify({ event: "support_forward_crashed", error: String(err) })),
      ),
    );
    return c.json(token === null ? { message } : { token, message }, 201);
  });
}
```

- [ ] **Step 6: Gắn vào app**

Trong `server/src/app.ts`, tìm:

```ts
import { registerOrders } from "./orders";
import { registerTrial } from "./trial";
```

thay bằng:

```ts
import { registerOrders } from "./orders";
import { registerSupport, supportCors } from "./support/routes";
import { registerTrial } from "./trial";
```

Tìm:

```ts
    c.set("deps", makeDeps(c.env));
    await next();
  });
```

thay bằng:

```ts
    c.set("deps", makeDeps(c.env));
    await next();
  });
  // CORS của khung chat trên website (spec 2026-10-22 §1): trước mọi middleware có thể trả lỗi (413, 415), để trình duyệt đọc được thân lỗi.
  app.use("/v1/support/*", supportCors);
```

Tìm:

```ts
  registerDiagnostics(app);
  app.notFound((c) => fail(c, 404, "not_found"));
```

thay bằng:

```ts
  registerDiagnostics(app);
  registerSupport(app);
  app.notFound((c) => fail(c, 404, "not_found"));
```

- [ ] **Step 7: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4
```
Expected: `tsc` không lỗi; `Tests  1571 passed (1571)`.

- [ ] **Step 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/support/routes.ts server/src/http.ts server/src/ratelimit.ts server/src/alerts.ts server/src/app.ts server/test/support-helpers.ts server/test/support-routes.test.ts && git commit -m "feat(server): endpoint gửi tin và trạng thái của chat hỗ trợ, CORS cho website" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Hỏi tin mới, để lại email, xóa cuộc chat

**Files:**
- Modify: `server/src/support/routes.ts`
- Test: `server/test/support-routes.test.ts`

- [ ] **Step 1: Viết test hỏng**

Trong `server/test/support-routes.test.ts`, tìm:

```ts
import { resetDb } from "./db";
import { auth, enableChat, firstMessage, startChat } from "./support-helpers";
```

thay bằng:

```ts
import { setSetting } from "../src/support/store";
import { resetDb, wrapDb } from "./db";
import { auth, enableChat, firstMessage, startChat } from "./support-helpers";
```

Thêm vào **cuối** file:

```ts
describe("GET /v1/support/messages, PUT /v1/support/email, DELETE /v1/support/conversation (spec 2026-10-22 §2.2)", () => {
  const get = (w: World, token: string, after: string | number = 0) =>
    w.call("GET", `/v1/support/messages?after=${after}`, undefined, auth(token));

  it("GET: tin sau con trỏ theo thứ tự, kèm enabled và status; đánh dấu khách đã nhận câu trả lời", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await env.DB.prepare("INSERT INTO support_messages (conversation_id, sender, text, created_at, zalo_message_id) VALUES (?, 'owner', 'Chào bạn', ?, 'zm-1')")
      .bind(chat.id, T0 + 5)
      .run();
    const r = await get(w, chat.token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      enabled: true,
      status: "open",
      messages: [
        { id: chat.message.id, sender: "customer", text: "Gói Monthly dùng được trên 2 máy không?", created_at: T0 },
        { id: expect.any(Number), sender: "owner", text: "Chào bạn", created_at: T0 + 5 },
      ],
    });
    const ownerId = (r.body.messages as { id: number }[])[1]?.id;
    expect(await env.DB.prepare("SELECT delivered_owner_id FROM support_conversations").first()).toEqual({ delivered_owner_id: ownerId });
    expect((await get(w, chat.token, ownerId ?? 0)).body.messages).toEqual([]);
  });

  it("GET không có tin mới: không ghi gì vào D1", async () => {
    const w0 = makeWorld();
    await enableChat();
    const chat = await startChat(w0);
    const { db, sql } = wrapDb(env.DB);
    const w = makeWorld({ DB: db });
    expect((await get(w, chat.token, chat.message.id)).status).toBe(200);
    expect(sql.filter((q) => /^\s*(INSERT|UPDATE|DELETE)/i.test(q))).toEqual([]);
  });

  it("GET: after sai thì 400; thiếu after là 0; bị chặn thì status closed; chat tắt thì enabled false", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    expect(await get(w, chat.token, "-1")).toMatchObject({ status: 400, body: { field: "after" } });
    expect(await get(w, chat.token, "abc")).toMatchObject({ status: 400, body: { field: "after" } });
    const noAfter = await w.call("GET", "/v1/support/messages", undefined, auth(chat.token));
    expect(noAfter.body.messages).toHaveLength(1);
    await env.DB.prepare("UPDATE support_conversations SET status = 'blocked'").run();
    await setSetting(env.DB, "enabled", "0");
    expect((await get(w, chat.token)).body).toMatchObject({ enabled: false, status: "closed" });
  });

  it("GET hỏi quá nhanh (binding Rate Limiting từ chối): 429 kèm Retry-After 60", async () => {
    const w0 = makeWorld();
    await enableChat();
    const chat = await startChat(w0);
    const w = makeWorld({ SUPPORT_POLL_LIMITER: { limit: async () => ({ success: false }) } });
    const r = await get(w, chat.token);
    expect(r).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(r.headers.get("retry-after")).toBe("60");
  });

  it("PUT email: lưu chữ thường, báo Zalo không kèm địa chỉ, cùng email thì không báo lại; null thì bỏ; sai 400; quá 5 lần mỗi giờ 429; bị chặn 403", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    const put = (email: unknown) => w.call("PUT", "/v1/support/email", { email }, auth(chat.token));
    expect(await put("Khach@Example.com")).toMatchObject({ status: 200, body: { ok: true } });
    expect(await conversation(chat.id)).toMatchObject({ email: "khach@example.com" });
    expect(w.zalo.texts()[1]).toBe(`#${chat.code} ✉️ khách đã để lại email`);
    expect(w.zalo.texts().join("\n")).not.toContain("khach@example.com");
    expect(await put("khach@example.com")).toMatchObject({ status: 200 });
    expect(w.zalo.sent).toHaveLength(2);
    expect(await put(null)).toMatchObject({ status: 200 });
    expect(await conversation(chat.id)).toMatchObject({ email: null });
    expect(await put("không-phải-email")).toMatchObject({ status: 400, body: { field: "email" } });
    expect(await put(undefined)).toMatchObject({ status: 400, body: { field: "email" } });
    expect(await put("x@example.com")).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    const other = await startChat(w);
    await env.DB.prepare("UPDATE support_conversations SET status = 'blocked' WHERE id = ?").bind(other.id).run();
    expect(await w.call("PUT", "/v1/support/email", { email: "a@example.com" }, auth(other.token))).toMatchObject({
      status: 403,
      body: { error: "conversation_closed" },
    });
  });

  it("DELETE: xóa cuộc chat và mọi tin, báo Zalo; token cũ thành 401", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    expect(await w.call("DELETE", "/v1/support/conversation", {}, auth(chat.token))).toMatchObject({ status: 200, body: { ok: true } });
    expect(await env.DB.prepare("SELECT (SELECT COUNT(*) FROM support_conversations) AS c, (SELECT COUNT(*) FROM support_messages) AS m").first()).toEqual({
      c: 0,
      m: 0,
    });
    expect(w.zalo.texts().at(-1)).toBe(`#${chat.code} 🗑 khách đã xóa cuộc chat`);
    expect((await get(w, chat.token)).body).toEqual({ error: "invalid_token" });
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server exec vitest run test/support-routes.test.ts 2>&1 | tail -8
```
Expected: 6 test mới FAIL (`404 not_found`), 12 test cũ vẫn qua.

- [ ] **Step 3: Viết ba route**

Trong `server/src/support/routes.ts`, tìm:

```ts
import { clientIp, fail, readJson, tooMany } from "../http";
import { failureBlock, hit, LIMITS, noteFailure } from "../ratelimit";
import { forwardConversation } from "./forward";
import { addCustomerMessage, type Conversation, conversationByToken, createConversation, isEnabled, type NewConversation } from "./store";
```

thay bằng:

```ts
import { clientIp, fail, parseEmail, readJson, tooMany } from "../http";
import { failureBlock, hit, LIMITS, noteFailure } from "../ratelimit";
import { BOT_TEXT } from "./format";
import { forwardConversation } from "./forward";
import {
  addCustomerMessage,
  type Conversation,
  conversationByToken,
  createConversation,
  deleteConversation,
  isEnabled,
  markDelivered,
  messagesAfter,
  type NewConversation,
  setEmail,
} from "./store";
```

Tìm:

```ts
function busy(c: SupportContext, retryAfter: number) {
```

thay bằng:

```ts
/** Số giây khách phải chờ khi hỏi tin mới quá nhanh (cửa sổ 60 giây của binding Rate Limiting). */
const POLL_RETRY_AFTER = 60;

/** Báo Zalo một việc của khách (đã để lại email, đã xóa cuộc chat). Không lưu, không gửi lại: lỗi thì chỉ ghi log. */
function notifyOwner(c: SupportContext, text: string): void {
  const zalo = c.get("deps").zalo;
  if (!zalo) return;
  c.executionCtx.waitUntil(
    zalo.send(text).catch((err: unknown) => console.warn(JSON.stringify({ event: "support_notify_failed", error: String(err) }))),
  );
}

function busy(c: SupportContext, retryAfter: number) {
```

Tìm:

```ts
    return c.json(token === null ? { message } : { token, message }, 201);
  });
}
```

thay bằng:

```ts
    return c.json(token === null ? { message } : { token, message }, 201);
  });

  // Hỏi tin mới: không ghi D1 khi không có câu trả lời mới (spec 2026-10-22 §2.2), không đi qua bảng rate_limits.
  app.get("/v1/support/messages", async (c) => {
    const found = await authed(c);
    if (found instanceof Response) return found;
    const limiter = c.env.SUPPORT_POLL_LIMITER;
    if (limiter && !(await limiter.limit({ key: String(found.id) })).success) return tooMany(c, POLL_RETRY_AFTER);
    const rawAfter = c.req.query("after") ?? "0";
    if (!/^\d{1,15}$/.test(rawAfter)) return fail(c, 400, "invalid_request", { field: "after" });
    const db = c.env.DB;
    const messages = await messagesAfter(db, found.id, Number(rawAfter));
    const lastOwner = messages.reduce((max, m) => (m.sender === "owner" && m.id > max ? m.id : max), 0);
    if (lastOwner > found.delivered_owner_id) await markDelivered(db, found.id, lastOwner);
    return c.json({ enabled: await isEnabled(db), status: found.status === "blocked" ? "closed" : "open", messages });
  });

  app.put("/v1/support/email", async (c) => {
    const found = await authed(c);
    if (found instanceof Response) return found;
    if (found.status === "blocked") return fail(c, 403, "conversation_closed");
    const now = c.get("deps").now();
    const perConv = await hit(c.env, "support_email_conv", String(found.id), now);
    if (!perConv.allowed) return tooMany(c, perConv.retryAfter);
    const body = await readJson(c);
    if (!body || !("email" in body)) return fail(c, 400, "invalid_request", { field: "email" });
    const email = body.email === null ? null : parseEmail(body.email);
    if (body.email !== null && email === null) return fail(c, 400, "invalid_request", { field: "email" });
    await setEmail(c.env.DB, found.id, email, now);
    // Chỉ báo là có email; địa chỉ không bao giờ đi qua Zalo (spec 2026-10-22 §2.3).
    if (email !== null && email !== found.email) notifyOwner(c, BOT_TEXT.emailSaved(found.code));
    return c.json({ ok: true });
  });

  app.delete("/v1/support/conversation", async (c) => {
    const found = await authed(c);
    if (found instanceof Response) return found;
    await deleteConversation(c.env.DB, found.id);
    if (found.status === "open") notifyOwner(c, BOT_TEXT.deleted(found.code));
    return c.json({ ok: true });
  });
}
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4
```
Expected: `tsc` không lỗi; `Tests  1577 passed (1577)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/support/routes.ts server/test/support-routes.test.ts && git commit -m "feat(server): hỏi tin mới, để lại email, xóa cuộc chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Webhook Zalo

**Files:**
- Create: `server/src/support/webhook.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/support-webhook.test.ts`

- [ ] **Step 1: Viết test hỏng**

Tạo `server/test/support-webhook.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEnabled } from "../src/support/store";
import { resetDb } from "./db";
import { auth, enableChat, ownerSays, startChat, webhook, zaloUpdate } from "./support-helpers";
import { makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;
const customerSees = async (w: World, token: string) =>
  ((await w.call("GET", "/v1/support/messages?after=0", undefined, auth(token))).body.messages as { sender: string; text: string }[]).map(
    (m) => `${m.sender}: ${m.text}`,
  );
const ownerRows = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM support_messages WHERE sender = 'owner'").first<{ n: number }>())?.n;
const NONE_RECENT = "Không có cuộc chat nào nhắn trong 30 phút qua. Ghi mã ở đầu tin, ví dụ: #K7Q nội dung";

describe("webhook Zalo POST /v1/webhooks/zalo (spec 2026-10-22 §2.4, §2.5)", () => {
  it("sai hay thiếu header secret: 403, không làm gì", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    expect((await webhook(w, ownerSays("/bat"), "sai-secret")).status).toBe(403);
    expect((await w.call("POST", "/v1/webhooks/zalo", ownerSays("/bat"))).status).toBe(403);
    expect(await isEnabled(env.DB)).toBe(false);
    expect(w.zalo.sent).toEqual([]);
  });

  it("thân không đọc được, thiếu trường, hay tin của người lạ: 200, không ghi, không trả lời", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    expect(await webhook(w, "không phải json")).toMatchObject({ status: 200, body: { ok: true } });
    expect(await webhook(w, { ok: true, result: { event_name: "message.text.received" } })).toMatchObject({ status: 200 });
    expect(await webhook(w, ownerSays("/bat", "zm-1", "nguoi-la"))).toMatchObject({ status: 200 });
    expect(await isEnabled(env.DB)).toBe(false);
    expect(w.zalo.sent).toEqual([]);
  });

  it("trả lời có mã (viết thường cũng được): khách thấy câu trả lời; bot không báo lại", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    expect(await webhook(w, ownerSays(`#${chat.code.toLowerCase()} Mỗi key dùng trên một máy nhé.`))).toMatchObject({ status: 200, body: { ok: true } });
    expect(await customerSees(w, chat.token)).toEqual(["customer: Gói Monthly dùng được trên 2 máy không?", "owner: Mỗi key dùng trên một máy nhé."]);
    expect(w.zalo.sent).toHaveLength(1);
  });

  it("mã không có, thiếu nội dung, hay cuộc chat bị chặn: bot báo, không ghi", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await webhook(w, ownerSays("#Z0Z chào"));
    await webhook(w, ownerSays(`#${chat.code}`));
    await env.DB.prepare("UPDATE support_conversations SET status = 'blocked'").run();
    await webhook(w, ownerSays(`#${chat.code} chào`));
    expect(w.zalo.texts().slice(1)).toEqual([
      "Không có cuộc chat #Z0Z.",
      "Thiếu nội dung sau mã.",
      `#${chat.code} đang bị chặn (gõ /mo #${chat.code} để mở).`,
    ]);
    expect(await ownerRows()).toBe(0);
  });

  it("không ghi mã: gửi tới cuộc chat duy nhất vừa nhắn trong 30 phút và báo ✓; không có cuộc nào hay có từ hai cuộc thì không đoán", async () => {
    const w = makeWorld();
    await enableChat();
    await webhook(w, ownerSays("Chào bạn"));
    expect(w.zalo.texts()).toEqual([NONE_RECENT]);
    const a = await startChat(w);
    w.clock.now = T0 + 60;
    await webhook(w, ownerSays("Chào bạn"));
    expect(w.zalo.texts().at(-1)).toBe(`✓ đã gửi tới #${a.code}`);
    expect(await customerSees(w, a.token)).toContain("owner: Chào bạn");
    w.clock.now = T0 + 120;
    const b = await startChat(w);
    await webhook(w, ownerSays("Bạn nào đấy?"));
    expect(w.zalo.texts().at(-1)).toBe(
      `⚠️ Có 2 cuộc chat vừa nhắn trong 30 phút qua (#${b.code}, #${a.code}). Ghi mã ở đầu tin, ví dụ: #${b.code} nội dung`,
    );
    expect(await ownerRows()).toBe(1);
    w.clock.now = T0 + 120 + 1801;
    await webhook(w, ownerSays("Còn ai không?"));
    expect(w.zalo.texts().at(-1)).toBe(NONE_RECENT);
  });

  it("Zalo gửi lại cùng message_id: chỉ ghi một lần, chỉ báo ✓ một lần", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    const update = ownerSays("Chào bạn", "zm-lap");
    await webhook(w, update);
    await webhook(w, update);
    expect(await ownerRows()).toBe(1);
    expect(w.zalo.texts().filter((t) => t.startsWith("✓"))).toEqual([`✓ đã gửi tới #${chat.code}`]);
  });

  it("ảnh, sticker, tin thoại: bot báo chỉ gửi được chữ", async () => {
    const w = makeWorld();
    await webhook(w, zaloUpdate("message.sticker.received", { sticker: "abc", url: "https://zalo.example/sticker.png" }));
    await webhook(w, zaloUpdate("message.image.received", { photo: "https://zalo.example/a.jpg", caption: "#K7Q xem ảnh" }));
    expect(w.zalo.texts()).toEqual(["Chỉ gửi được chữ.", "Chỉ gửi được chữ."]);
    expect(await ownerRows()).toBe(0);
  });

  it("lệnh /bat, /chan, /mo, /ds, /tat và lệnh lạ", async () => {
    const w = makeWorld();
    await webhook(w, ownerSays("/bat"));
    expect(await isEnabled(env.DB)).toBe(true);
    const chat = await startChat(w);
    await webhook(w, ownerSays(`/chan #${chat.code}`));
    expect(await env.DB.prepare("SELECT status FROM support_conversations").first()).toEqual({ status: "blocked" });
    await webhook(w, ownerSays(`/mo ${chat.code}`));
    expect(await env.DB.prepare("SELECT status FROM support_conversations").first()).toEqual({ status: "open" });
    await webhook(w, ownerSays("/chan"));
    await webhook(w, ownerSays("/ds"));
    await webhook(w, ownerSays("/tat"));
    expect(await isEnabled(env.DB)).toBe(false);
    await webhook(w, ownerSays("/giupvoi"));
    const texts = w.zalo.texts();
    expect(texts[0]).toBe("Đã BẬT chat trên website và app.");
    expect(texts.slice(2, 6)).toEqual([
      `Đã chặn #${chat.code}: tin của khách này không chuyển tới nữa.`,
      `Đã bỏ chặn #${chat.code}.`,
      "Thiếu mã, ví dụ: /chan #K7Q",
      `Cuộc chat 7 ngày qua:\n#${chat.code} · web · vừa xong · "Gói Monthly dùng được trên 2 …"`,
    ]);
    expect(texts[6]).toBe("Đã TẮT chat trên website và app. Khách thấy email support@ thay ô nhập. Gõ /bat để bật lại.");
    expect(texts[7]).toContain("/ds: các cuộc chat 7 ngày qua");
  });

  it("thân không bọc trong result (phòng Zalo đổi dạng) và chat_id dạng số vẫn đọc được", async () => {
    const w = makeWorld({ ZALO_OWNER_CHAT_ID: "123456" });
    const update = ownerSays("/bat", "zm-so", "123456").result;
    await webhook(w, { ...update, message: { ...update.message, chat: { id: 123456, chat_type: "PRIVATE" } } });
    expect(await isEnabled(env.DB)).toBe(true);
  });

  it("email khách để lại không bao giờ được ghép vào tin gửi Zalo (tin sau, lời báo email, /ds)", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await w.call("PUT", "/v1/support/email", { email: "rieng-tu@example.com" }, auth(chat.token));
    await w.call("POST", "/v1/support/messages", { text: "Mình gửi thêm" }, auth(chat.token));
    await webhook(w, ownerSays("/ds"));
    expect(w.zalo.texts()).toHaveLength(4);
    expect(w.zalo.texts().join("\n")).not.toContain("rieng-tu");
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server exec vitest run test/support-webhook.test.ts 2>&1 | tail -8
```
Expected: FAIL; webhook trả `404 not_found`.

- [ ] **Step 3: Viết webhook**

Tạo `server/src/support/webhook.ts`:

```ts
// Webhook của Zalo Bot (spec 2026-10-22 §2.4, §2.5): chủ dự án trả lời hay gõ lệnh cho bot; câu trả lời vào cuộc chat của khách.
// Chỉ xử lý khi header secret đúng VÀ người gửi là chủ dự án; bot có thể bị người lạ tìm thấy và nhắn vào.
import type { Hono } from "hono";
import type { AppEnv } from "../app";
import { timingSafeEqual } from "../crypto";
import type { Deps } from "../deps";
import { fail, isRecord, readJson } from "../http";
import { BOT_TEXT, HELP_TEXT, listText } from "./format";
import { parseOwnerText } from "./owner";
import { addOwnerMessage, conversationByCode, openWithCustomerSince, recentConversations, setSetting, setStatus } from "./store";
import { truncate, ZALO_MAX_TEXT } from "./text";

export const ZALO_WEBHOOK_PATH = "/v1/webhooks/zalo";
/** Câu trả lời không ghi mã chỉ tới cuộc chat có tin khách trong 30 phút qua. */
const RECENT_REPLY_WINDOW = 1800;
const LIST_WINDOW = 7 * 86400;

export interface ZaloUpdate {
  eventName: string;
  chatId: string;
  messageId: string;
  text: string | null;
}

function idOf(v: unknown): string | null {
  if (typeof v === "string" && v !== "") return v;
  return typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}

/** Đọc thân webhook. Tài liệu Zalo bọc sự kiện trong `result`; nhận cả dạng không bọc, id dạng chuỗi lẫn số. Thiếu trường thì null. */
export function parseUpdate(body: Record<string, unknown> | null): ZaloUpdate | null {
  if (!body) return null;
  const event = isRecord(body.result) ? body.result : body;
  const message = isRecord(event.message) ? event.message : null;
  const chat = message && isRecord(message.chat) ? message.chat : null;
  const chatId = chat ? idOf(chat.id) : null;
  const messageId = message ? idOf(message.message_id) : null;
  if (typeof event.event_name !== "string" || chatId === null || messageId === null) return null;
  const text = message !== null && typeof message.text === "string" ? message.text : null;
  return { eventName: event.event_name, chatId, messageId, text };
}

/** Bot trả lời chủ dự án. Lỗi thì chỉ ghi log: câu trả lời của bot không quan trọng bằng việc trả 200 cho Zalo. */
async function tell(deps: Deps, text: string): Promise<void> {
  if (!deps.zalo) return;
  try {
    await deps.zalo.send(truncate(text, ZALO_MAX_TEXT));
  } catch (err) {
    console.warn(JSON.stringify({ event: "support_bot_reply_failed", error: String(err) }));
  }
}

async function reply(db: D1Database, deps: Deps, code: string | null, text: string, messageId: string, now: number): Promise<void> {
  const body = truncate(text, ZALO_MAX_TEXT);
  if (code !== null) {
    const conv = await conversationByCode(db, code);
    if (!conv) return tell(deps, BOT_TEXT.noSuchCode(code));
    if (conv.status === "blocked") return tell(deps, BOT_TEXT.blocked(conv.code));
    if (body === "") return tell(deps, BOT_TEXT.emptyReply);
    await addOwnerMessage(db, conv.id, body, messageId, now);
    return;
  }
  if (body === "") return;
  const recent = await openWithCustomerSince(db, now - RECENT_REPLY_WINDOW);
  const [only] = recent;
  if (!only) return tell(deps, BOT_TEXT.noneRecent);
  // Từ hai cuộc chat trở lên: không đoán, để không gửi nhầm khách.
  if (recent.length > 1) return tell(deps, BOT_TEXT.ambiguous(recent.map((r) => r.code)));
  if (await addOwnerMessage(db, only.id, body, messageId, now)) await tell(deps, BOT_TEXT.delivered(only.code));
}

export async function handleOwnerUpdate(db: D1Database, deps: Deps, update: ZaloUpdate): Promise<void> {
  const now = deps.now();
  if (update.eventName !== "message.text.received" || update.text === null) return tell(deps, BOT_TEXT.textOnly);
  const action = parseOwnerText(update.text);
  switch (action.kind) {
    case "help":
      return tell(deps, HELP_TEXT);
    case "list":
      return tell(deps, listText(await recentConversations(db, now - LIST_WINDOW), now));
    case "on":
    case "off": {
      const on = action.kind === "on";
      await setSetting(db, "enabled", on ? "1" : "0");
      console.log(JSON.stringify({ event: "support_toggled", enabled: on }));
      return tell(deps, on ? BOT_TEXT.turnedOn : BOT_TEXT.turnedOff);
    }
    case "block":
    case "unblock": {
      const block = action.kind === "block";
      if (action.code === null) return tell(deps, BOT_TEXT.needCode(block ? "/chan" : "/mo"));
      const conv = await conversationByCode(db, action.code);
      if (!conv) return tell(deps, BOT_TEXT.noSuchCode(action.code));
      await setStatus(db, conv.id, block ? "blocked" : "open");
      return tell(deps, block ? BOT_TEXT.blockedOk(conv.code) : BOT_TEXT.unblockedOk(conv.code));
    }
    case "reply":
      return reply(db, deps, action.code, action.text, update.messageId, now);
  }
}

export function registerZaloWebhook(app: Hono<AppEnv>) {
  app.post(ZALO_WEBHOOK_PATH, async (c) => {
    const expected = c.env.ZALO_WEBHOOK_SECRET;
    const got = c.req.header("x-bot-api-secret-token") ?? "";
    if (!expected || !timingSafeEqual(got, expected)) {
      console.warn(JSON.stringify({ event: "zalo_webhook_bad_secret" }));
      return fail(c, 403, "forbidden");
    }
    const update = parseUpdate(await readJson(c));
    // Trả 200 cả khi không đọc được: trả lỗi thì Zalo có thể gửi lại mãi một thân hỏng.
    if (!update) {
      console.warn(JSON.stringify({ event: "zalo_webhook_unreadable" }));
      return c.json({ ok: true });
    }
    if (update.chatId !== c.env.ZALO_OWNER_CHAT_ID) {
      console.warn(JSON.stringify({ event: "zalo_webhook_stranger", event_name: update.eventName }));
      return c.json({ ok: true });
    }
    await handleOwnerUpdate(c.env.DB, c.get("deps"), update);
    return c.json({ ok: true });
  });
}
```

- [ ] **Step 4: Gắn vào app**

Trong `server/src/app.ts`, tìm:

```ts
import { registerSupport, supportCors } from "./support/routes";
```

thay bằng:

```ts
import { registerSupport, supportCors } from "./support/routes";
import { registerZaloWebhook } from "./support/webhook";
```

Tìm:

```ts
  registerSupport(app);
  app.notFound((c) => fail(c, 404, "not_found"));
```

thay bằng:

```ts
  registerSupport(app);
  registerZaloWebhook(app);
  app.notFound((c) => fail(c, 404, "not_found"));
```

- [ ] **Step 5: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4
```
Expected: `tsc` không lỗi; `Tests  1587 passed (1587)`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/support/webhook.ts server/src/app.ts server/test/support-webhook.test.ts && git commit -m "feat(server): webhook Zalo cho câu trả lời và lệnh của chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Việc định kỳ

**Files:**
- Create: `server/src/support/cron.ts`
- Modify: `server/src/email/templates.ts`, `server/src/reconcile.ts`
- Test: `server/test/support-cron.test.ts`

- [ ] **Step 1: Viết test hỏng**

Tạo `server/test/support-cron.test.ts`:

```ts
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcile } from "../src/reconcile";
import { forwardPendingSupport, pruneSupport, sendSupportEmails } from "../src/support/cron";
import { getSetting, setSetting } from "../src/support/store";
import { resetDb } from "./db";
import { auth, enableChat, ownerSays, startChat, webhook } from "./support-helpers";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

type World = ReturnType<typeof makeWorld>;
const FIRST = (code: string) => `🆕 #${code} · web · vi · /bang-gia/\nGói Monthly dùng được trên 2 máy không?`;
const leaveEmail = (w: World, token: string, email: string, headers: Record<string, string> = {}) =>
  w.call("PUT", "/v1/support/email", { email }, { ...auth(token), ...headers });

describe("việc định kỳ của chat hỗ trợ (spec 2026-10-22 §2.6)", () => {
  it("gửi lại tin chưa tới Zalo; gửi được thì đặt lại chuỗi lỗi", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.failStatus = 500;
    const chat = await startChat(w);
    await setSetting(env.DB, "zalo_fail_streak", "2");
    w.zalo.failStatus = null;
    w.clock.now = T0 + 300;
    await forwardPendingSupport(env.DB, w.deps, w.clock.now);
    expect(w.zalo.texts()).toEqual([FIRST(chat.code)]);
    expect(await getSetting(env.DB, "zalo_fail_streak")).toBe("0");
  });

  it("Zalo lỗi ở 3 lần cron liền thì có cảnh báo support_zalo_failed; 2 lần thì chưa", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.failStatus = 401;
    await startChat(w);
    for (const n of [1, 2]) {
      w.clock.now = T0 + 300 * n;
      await forwardPendingSupport(env.DB, w.deps, w.clock.now);
    }
    expect(await getSetting(env.DB, "zalo_fail_streak")).toBe("2");
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM ops_alerts").first()).toEqual({ n: 0 });
    w.clock.now = T0 + 900;
    await forwardPendingSupport(env.DB, w.deps, w.clock.now);
    expect((await env.DB.prepare("SELECT kind, count FROM ops_alerts").all()).results).toEqual([{ kind: "support_zalo_failed", count: 1 }]);
  });

  it("email câu trả lời: sau 2 phút khách chưa nhận thì một thư gộp; trong 1 giờ không gửi thư nữa; thư sau chỉ có tin mới; khách đã nhận qua khung chat thì không gửi", async () => {
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await leaveEmail(w, chat.token, "khach@example.com");
    await webhook(w, ownerSays(`#${chat.code} Câu một`));
    await webhook(w, ownerSays(`#${chat.code} Câu hai`));
    w.clock.now = T0 + 119;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
    w.clock.now = T0 + 120;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(1);
    expect(w.resend.sent).toHaveLength(1);
    expect(w.resend.sent[0]).toMatchObject({ to: ["khach@example.com"], subject: "Trả lời từ hỗ trợ AI Translator / Reply from AI Translator support" });
    expect(w.resend.sent[0]?.text).toContain("Câu một\n\nCâu hai");
    expect(w.resend.sent[0]?.idempotencyKey).toMatch(/^support-\d+-\d+$/);
    await webhook(w, ownerSays(`#${chat.code} Câu ba`));
    w.clock.now = T0 + 120 + 3599;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
    w.clock.now = T0 + 120 + 3600;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(1);
    expect(w.resend.sent[1]?.text).toContain("Câu ba");
    expect(w.resend.sent[1]?.text).not.toContain("Câu một");
    await webhook(w, ownerSays(`#${chat.code} Câu bốn`));
    await w.call("GET", "/v1/support/messages?after=0", undefined, auth(chat.token));
    w.clock.now = T0 + 120 + 3600 * 3;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
  });

  it("email lỗi tạm thì lần cron sau gửi lại; lỗi vĩnh viễn thì thôi, không gửi lại mãi", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    const chat = await startChat(w);
    await leaveEmail(w, chat.token, "khach@example.com");
    await webhook(w, ownerSays(`#${chat.code} Trả lời`));
    w.clock.now = T0 + 300;
    w.resend.down = true;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
    w.resend.down = false;
    w.clock.now = T0 + 600;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(1);
    const ip = { "cf-connecting-ip": "203.0.113.30" };
    const other = await startChat(w, {}, ip);
    await leaveEmail(w, other.token, "sai@example.com", ip);
    await webhook(w, ownerSays(`#${other.code} Trả lời`));
    w.resend.failStatus = 422;
    w.clock.now = T0 + 900;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
    w.resend.failStatus = null;
    w.clock.now = T0 + 900 + 7200;
    expect(await sendSupportEmails(env.DB, w.deps, w.clock.now)).toBe(0);
    expect(w.resend.sent.map((m) => m.to)).toEqual([["khach@example.com"]]);
  });

  it("xóa cuộc chat không có hoạt động trong 90 ngày, giữ cuộc chat còn mới", async () => {
    const w = makeWorld();
    await enableChat();
    await startChat(w);
    w.clock.now = T0 + 10 * DAY;
    const fresh = await startChat(w);
    await pruneSupport(env.DB, T0 + 90 * DAY + 1);
    expect((await env.DB.prepare("SELECT id FROM support_conversations").all()).results).toEqual([{ id: fresh.id }]);
    expect((await env.DB.prepare("SELECT DISTINCT conversation_id AS id FROM support_messages").all()).results).toEqual([{ id: fresh.id }]);
  });

  it("cron */5 (reconcile) chạy các việc của chat: tin chờ được gửi lại", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = makeWorld();
    await enableChat();
    w.zalo.down = true;
    const chat = await startChat(w);
    w.zalo.down = false;
    w.clock.now = T0 + 300;
    await reconcile(w.env, w.deps);
    expect(w.zalo.texts()).toEqual([FIRST(chat.code)]);
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server exec vitest run test/support-cron.test.ts 2>&1 | tail -6
```
Expected: FAIL, không tải được `../src/support/cron`.

- [ ] **Step 3: Mẫu thư**

Thêm vào **cuối** `server/src/email/templates.ts`:

```ts

/**
 * Thư gửi câu trả lời của hỗ trợ cho khách đã rời khung chat (chat hỗ trợ, spec 2026-10-22 §2.6). Song ngữ vi/en như thư key;
 * câu trả lời giữ nguyên văn chủ dự án gõ. Khách trả lời thư thì về support@ (Reply-To của Resend).
 */
export function supportReplyEmail(replies: string[]): { subject: string; text: string } {
  return {
    subject: `Trả lời từ hỗ trợ ${PRODUCT_NAME} / Reply from ${PRODUCT_NAME} support`,
    text: [
      `Bộ phận hỗ trợ ${PRODUCT_NAME} đã trả lời tin nhắn của bạn.`,
      `${PRODUCT_NAME} support has replied to your message.`,
      "",
      replies.join("\n\n"),
      "",
      "---",
      "Bạn có thể trả lời thư này, hoặc mở lại khung chat trên aitranslator.io.vn hay mục Hỗ trợ trong app.",
      "You can reply to this email, or reopen the chat on aitranslator.io.vn or in the app's Support screen.",
    ].join("\n"),
  };
}
```

- [ ] **Step 4: Viết cron**

Tạo `server/src/support/cron.ts`:

```ts
// Việc định kỳ của chat hỗ trợ trong cron */5 (spec 2026-10-22 §2.6): gửi lại tin chưa tới Zalo, gửi email câu trả lời cho
// khách đã rời khung chat, xóa cuộc chat quá 90 ngày.
import { raiseAlert } from "../alerts";
import type { Deps } from "../deps";
import { EmailProviderError, maskEmail } from "../email/provider";
import { supportReplyEmail } from "../email/templates";
import { FORWARD_WINDOW, forwardConversation } from "./forward";
import { getSetting, setSetting } from "./store";

/** Cuộc chat không có hoạt động trong 90 ngày thì bị xóa. */
export const KEEP_SECONDS = 90 * 86400;
/** Câu trả lời khách chưa nhận sau 2 phút thì gửi email (nếu khách để lại email). */
const EMAIL_AFTER = 120;
/** Tối đa một thư mỗi giờ cho mỗi cuộc chat. */
const EMAIL_EVERY = 3600;
const FAIL_STREAK_ALERT = 3;
const BATCH = 50;
const EMAIL_BATCH = 20;

/**
 * Gửi lại tin chờ của tối đa 50 cuộc chat. Gửi được ít nhất một tin thì đặt lại chuỗi lỗi; cả lần chạy chỉ có lỗi thì tăng chuỗi,
 * tới 3 thì cảnh báo support_zalo_failed (gộp theo giờ như mọi cảnh báo). Gặp lỗi ở một cuộc chat thì dừng: Zalo đang lỗi.
 */
export async function forwardPendingSupport(db: D1Database, deps: Pick<Deps, "zalo">, now: number): Promise<void> {
  if (!deps.zalo) return;
  const { results } = await db
    .prepare(
      `SELECT DISTINCT conversation_id AS id FROM support_messages
       WHERE sender = 'customer' AND forwarded_at IS NULL AND created_at >= ?
       ORDER BY conversation_id LIMIT ?`,
    )
    .bind(now - FORWARD_WINDOW, BATCH)
    .all<{ id: number }>();
  let sent = 0;
  let failed = false;
  for (const { id } of results) {
    const result = await forwardConversation(db, deps.zalo, id, now);
    if (result === "sent") sent++;
    if (result === "failed") {
      failed = true;
      break;
    }
  }
  if (sent > 0) {
    await setSetting(db, "zalo_fail_streak", "0");
  } else if (failed) {
    const streak = Number((await getSetting(db, "zalo_fail_streak")) ?? "0") + 1;
    await setSetting(db, "zalo_fail_streak", String(streak));
    if (streak >= FAIL_STREAK_ALERT) await raiseAlert(db, "support_zalo_failed", now);
  }
}

/** Gửi email câu trả lời chưa nhận cho khách có email. Trả số thư đã gửi. */
export async function sendSupportEmails(db: D1Database, deps: Pick<Deps, "email">, now: number): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.email, MAX(c.delivered_owner_id, c.emailed_owner_id) AS seen
       FROM support_conversations c
       WHERE c.email IS NOT NULL AND c.status = 'open'
         AND (c.emailed_at IS NULL OR c.emailed_at <= ?1 - ?3)
         AND EXISTS (SELECT 1 FROM support_messages m
                     WHERE m.conversation_id = c.id AND m.sender = 'owner'
                       AND m.id > MAX(c.delivered_owner_id, c.emailed_owner_id) AND m.created_at <= ?1 - ?2)
       ORDER BY c.id LIMIT ?4`,
    )
    .bind(now, EMAIL_AFTER, EMAIL_EVERY, EMAIL_BATCH)
    .all<{ id: number; email: string; seen: number }>();
  let sent = 0;
  for (const conv of results) {
    const { results: replies } = await db
      .prepare("SELECT id, text FROM support_messages WHERE conversation_id = ? AND sender = 'owner' AND id > ? ORDER BY id LIMIT 50")
      .bind(conv.id, conv.seen)
      .all<{ id: number; text: string }>();
    const last = replies.at(-1);
    if (!last) continue;
    const { subject, text } = supportReplyEmail(replies.map((r) => r.text));
    const markSent = () =>
      db.prepare("UPDATE support_conversations SET emailed_at = ?2, emailed_owner_id = ?3 WHERE id = ?1").bind(conv.id, now, last.id).run();
    try {
      await deps.email.send({ to: conv.email, subject, text, idempotencyKey: `support-${conv.id}-${last.id}` });
      await markSent();
      sent++;
    } catch (err) {
      const permanent = err instanceof EmailProviderError && err.permanent;
      const alreadySent = err instanceof EmailProviderError && err.alreadySent;
      console.error(JSON.stringify({ event: "support_email_failed", to: maskEmail(conv.email), permanent, already_sent: alreadySent, error: String(err) }));
      // Lỗi vĩnh viễn (địa chỉ sai) hay đã gửi rồi: đánh dấu để không thử lại mãi. Lỗi tạm: để lần cron sau.
      if (permanent || alreadySent) await markSent();
    }
  }
  return sent;
}

export async function pruneSupport(db: D1Database, now: number): Promise<void> {
  const cutoff = now - KEEP_SECONDS;
  await db.batch([
    db.prepare("DELETE FROM support_messages WHERE conversation_id IN (SELECT id FROM support_conversations WHERE last_activity_at < ?)").bind(cutoff),
    db.prepare("DELETE FROM support_conversations WHERE last_activity_at < ?").bind(cutoff),
  ]);
}
```

- [ ] **Step 5: Gắn vào cron**

Trong `server/src/reconcile.ts`, tìm:

```ts
// - gửi cảnh báo cho người vận hành; dọn bộ đếm cũ và báo cáo lỗi quá hạn (spec 2026-10-17 §3).
```

thay bằng:

```ts
// - gửi cảnh báo cho người vận hành; dọn bộ đếm cũ và báo cáo lỗi quá hạn (spec 2026-10-17 §3);
// - chat hỗ trợ: gửi lại tin chưa tới Zalo, gửi email câu trả lời, xóa cuộc chat quá 90 ngày (spec 2026-10-22 §2.6).
```

Tìm:

```ts
import { pruneRateLimits } from "./ratelimit";
```

thay bằng:

```ts
import { pruneRateLimits } from "./ratelimit";
import { forwardPendingSupport, pruneSupport, sendSupportEmails } from "./support/cron";
```

Tìm:

```ts
  let alertsSent = 0;
  await step("send_alerts", async () => {
```

thay bằng:

```ts
  // Trước send_alerts, để cảnh báo support_zalo_failed của lần này đi luôn trong lần gửi cảnh báo này.
  await step("support_forward", () => forwardPendingSupport(env.DB, deps, now));
  await step("support_emails", async () => {
    await sendSupportEmails(env.DB, deps, now);
  });
  let alertsSent = 0;
  await step("send_alerts", async () => {
```

Tìm:

```ts
  await step("prune_error_reports", () => pruneErrorReports(env.DB, now));
```

thay bằng:

```ts
  await step("prune_error_reports", () => pruneErrorReports(env.DB, now));
  await step("support_prune", () => pruneSupport(env.DB, now));
```

- [ ] **Step 6: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server typecheck && pnpm -C server test 2>&1 | tail -4
```
Expected: `tsc` không lỗi; `Tests  1593 passed (1593)`.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add server/src/support/cron.ts server/src/email/templates.ts server/src/reconcile.ts server/test/support-cron.test.ts && git commit -m "feat(server): việc định kỳ của chat hỗ trợ (gửi lại, email, xóa sau 90 ngày)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Runbook mục 11 (phần server) và kiểm toàn bộ

**Files:**
- Modify: `docs/release/phat-hanh.md`

- [ ] **Step 1: Thêm mục 11**

Thêm vào **cuối** `docs/release/phat-hanh.md` (sau đoạn **Đường lui** của mục 10, cách một dòng trống):

````markdown

## 11. Đợt thêm chat hỗ trợ (migration D1 0005)

Spec `2026-10-22-chat-ho-tro-zalo-design.md` (mục 1, 2, 7 và 8), kế hoạch `2026-10-22-chat-ho-tro-00-tong-quan.md` đến `2026-10-22-chat-ho-tro-04-phap-ly-noi-dung.md`. **Mỗi bước chỉ làm khi chủ dự án cho phép**; các lệnh ghi vào production và mọi lệnh có token Zalo do chủ dự án chạy (Claude không đặt secret). Thứ tự: Zalo Bot, secret, migration, Worker API (chat còn tắt), webhook, thử hai chiều, app, website, bật chat. Chạy trong `server/`; `PROD=https://api.aitranslator.io.vn`.

Vì sao thứ tự này: migration 0005 chỉ **thêm** ba bảng, không đổi bảng nào đã có, nên Worker cũ chạy đúng trên schema mới; Worker mới cần ba bảng và ba secret Zalo (thiếu secret thì `wrangler deploy` từ chối); `setWebhook` cần route đã có (Zalo thử URL ngay khi lưu); chat mặc định **tắt** (`support_settings.enabled = '0'`), nên trong lúc chờ app và website, không ai gửi được tin; app và website chỉ nói điều đã thật nên đi sau; bật chat là bước cuối, bằng lệnh `/bat` gửi cho bot.

**Điều kiện trước khi bắt đầu.**

- **Mã xong.** Kế hoạch 01 đến 04 đã làm và đã rà, `pnpm check` trong `server/` xanh trên `main`.
- **Bước 0 của kế hoạch 01 đạt** (`bench/2026-10-22-chat-ho-tro/spike.md`): điều 1, 3, 4. Điều 2 (bot vẫn nhắn được sau ít nhất 3 ngày không ai nhắn) có thể xong sau các bước server, nhưng **phải xong trước khi bật chat**.

1. **Tạo Zalo Bot** (bước 0 đã tạo thì dùng lại bot đó): Zalo › tìm OA **Zalo Bot Manager** › **Tạo bot** › tên `Bot AI Translator` (phải bắt đầu bằng "Bot"). Zalo gửi Bot Token qua tin nhắn. Không dán token vào chat với Claude, vào file trong repo hay vào lệnh có lưu lịch sử.

2. **Lấy `chat_id` của bạn.** Nhắn cho bot một tin bất kỳ, rồi (dòng `read` chờ bạn dán token, không hiện ra màn hình):

   ```bash
   read -rs ZALO_TOKEN && export ZALO_TOKEN
   curl -s -X POST "https://bot-api.zaloplatforms.com/bot${ZALO_TOKEN}/getUpdates" -H 'content-type: application/json' -d '{"timeout":"5"}'
   ```

   Expected: JSON có `"ok":true`, trong `result` có `"event_name":"message.text.received"` và `"chat":{"id":"<chat_id>",…}`. Chép `<chat_id>`. `getUpdates` không chạy khi bot đã có webhook: lúc đó gọi `deleteWebhook` (cùng dạng URL, thân `{}`) rồi chạy lại.

3. **Ba secret của Worker API** (giữ nguyên cửa sổ terminal tới bước 9, vì bước 8 cần `ZALO_HOOK`):

   ```bash
   ZALO_HOOK=$(openssl rand -hex 32)
   printf '%s' "$ZALO_TOKEN" | pnpm exec wrangler secret put ZALO_BOT_TOKEN
   printf '%s' "$ZALO_HOOK" | pnpm exec wrangler secret put ZALO_WEBHOOK_SECRET
   printf '%s' '<chat_id>' | pnpm exec wrangler secret put ZALO_OWNER_CHAT_ID
   ```

   Expected: mỗi lệnh kết thúc bằng `✨ Success! Uploaded secret <TÊN>`. Đặt secret lên Worker đang chạy bản cũ không đổi hành vi (bản cũ không đọc ba secret này).

4. **Kiểm trước khi áp (chỉ đọc), ghi lại kết quả để so sau:**

   ```bash
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name FROM sqlite_master WHERE name LIKE 'support_%'"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM licenses) AS licenses, (SELECT COUNT(*) FROM orders) AS orders, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
   ```

   Expected: `time-travel info` in mốc hiện tại (chép lại); câu thứ hai không trả dòng nào; chép lại ba số của câu thứ ba; `foreign_key_check` không trả dòng nào. Đã có bảng `support_%` thì dừng và báo: ai đó đã áp tay.

5. **Áp migration lên production:**

   ```bash
   pnpm exec wrangler d1 migrations apply mt-license-production --remote
   ```

   Expected: chỉ liệt kê `0005_support_chat.sql`, hỏi xác nhận (trả lời `y`), rồi `✅`. Lỗi thì dừng, không deploy Worker, báo chủ dự án.

6. **Kiểm sau khi áp:**

   ```bash
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT type, name FROM sqlite_master WHERE name LIKE 'support_%' ORDER BY type, name"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT key, value FROM support_settings ORDER BY key"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM licenses) AS licenses, (SELECT COUNT(*) FROM orders) AS orders, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq"
   ```

   Expected: bốn index (`support_conversations_activity`, `support_conversations_customer`, `support_messages_conversation`, `support_messages_pending`) và ba bảng (`support_conversations`, `support_messages`, `support_settings`); hai dòng cài đặt `enabled = 0`, `zalo_fail_streak = 0`; ba số **bằng đúng** bước 4. Lệch thì dừng.

7. **Deploy Worker API:**

   ```bash
   pnpm check && pnpm exec wrangler deploy
   curl -s "$PROD/v1/health"; echo
   curl -s "$PROD/v1/support/status"; echo
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$PROD/v1/webhooks/zalo"
   ```

   Expected: như mục 4 bước 9 (`Uploaded mt-license`, `schedule: */5 * * * *`, binding `SUPPORT_POLL_LIMITER`); `{"ok":true}`; `{"enabled":false}`; `403` (route có, từ chối vì thiếu header secret). **Kiểm cron chạy thật**: `pnpm exec wrangler tail mt-license --format pretty` qua một mốc 5 phút; Expected: có `{"event":"reconcile",…}` và **không có** `reconcile_step_failed` với `"step":"support_forward"`, `"support_emails"` hay `"support_prune"`. Không thấy cron thì `pnpm exec wrangler triggers deploy` rồi kiểm lại (sự cố 2026-10-07).

8. **Đặt webhook.** Trước tiên `dig @8.8.8.8 api.aitranslator.io.vn +short` phải in địa chỉ IP (sự cố DNSSEC của `io.vn` ngày 2026-10-22: `SERVFAIL` thì Zalo cũng không gọi được webhook; đợi rồi làm lại). Rồi:

   ```bash
   curl -s -X POST "https://bot-api.zaloplatforms.com/bot${ZALO_TOKEN}/setWebhook" -H 'content-type: application/json' -d "{\"url\":\"$PROD/v1/webhooks/zalo\",\"secret_token\":\"$ZALO_HOOK\"}"; echo
   curl -s -X POST "https://bot-api.zaloplatforms.com/bot${ZALO_TOKEN}/getWebhookInfo" -H 'content-type: application/json' -d '{}'; echo
   ```

   Expected: lệnh đầu `"ok":true` và `"verification":{"ok":true,…,"outcome":"webhook.ok",…}`; lệnh sau có `"url":"https://api.aitranslator.io.vn/v1/webhooks/zalo"`. `verification` không `ok` thì xem `hint`, sửa, chạy lại.

9. **Thử hai chiều, rồi tắt lại.** Nhắn `/bat` cho bot (bot trả `Đã BẬT chat trên website và app.`), rồi gửi một tin như khách:

   ```bash
   R=$(curl -s -H 'content-type: application/json' -d '{"text":"Tin thử sau triển khai","lang":"vi","source":"app-debug","context":"kiểm tra runbook mục 11"}' "$PROD/v1/support/messages"); echo "$R"
   T=$(printf '%s' "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
   ```

   Expected: JSON có `token` và `message`; Zalo của bạn nhận `🆕 #<MÃ> · app (debug) · vi · kiểm tra runbook mục 11` rồi dòng `Tin thử sau triển khai`. Trả lời bot `#<MÃ> Đã nhận`, rồi:

   ```bash
   curl -s -H "authorization: Bearer $T" "$PROD/v1/support/messages?after=0"; echo
   curl -s -X DELETE -H 'content-type: application/json' -H "authorization: Bearer $T" -d '{}' "$PROD/v1/support/conversation"; echo
   ```

   Expected: lệnh đầu có hai tin, tin thứ hai `"sender":"owner","text":"Đã nhận"`; lệnh sau `{"ok":true}` và Zalo nhận `#<MÃ> 🗑 khách đã xóa cuộc chat`. Nhắn `/ds` (bot trả `Không có cuộc chat nào trong 7 ngày qua.`), rồi `/tat` (bot trả `Đã TẮT chat…`); `curl -s "$PROD/v1/support/status"` in `{"enabled":false}`. Cuối cùng `unset ZALO_TOKEN ZALO_HOOK T R` và đóng terminal. Tin thử không về Zalo: xem `pnpm exec wrangler tail mt-license --format pretty` (sự kiện `support_forward_failed`), kiểm lại token ở bước 3. Câu trả lời không vào cuộc chat: xem sự kiện `zalo_webhook_*` trong tail; `zalo_webhook_unreadable` nghĩa là Zalo gửi dạng khác tài liệu (sửa `parseUpdate` ở `server/src/support/webhook.ts`, kèm test, rồi deploy lại).

<!-- kế hoạch 04: các bước app, website, bật chat và thử tay -->
````

- [ ] **Step 2: Kiểm toàn bộ server**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm -C server check 2>&1 | tail -12
```
Expected: `typecheck`, `vectors:check`, `test` (`Tests  1593 passed (1593)`), `test:scripts` (`ℹ fail 0`), `ui:check`, `dry-run` (hai lần `--dry-run: exiting now.`) đều xong không lỗi.

- [ ] **Step 3: Kiểm không lộ token và không còn chỗ giữ chỗ lạ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git grep -n -E 'zalo-spike|ZALO_SPIKE' -- . ':!docs/superpowers/plans' ; git status --short
```
Expected: lệnh đầu chỉ ra các dòng của `bench/2026-10-22-chat-ho-tro/spike.md` (nếu có nhắc tên file) và không có giá trị token nào; `git status` không có `.env.zalo-spike` (file đã bị bỏ qua).

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add docs/release/phat-hanh.md && git commit -m "docs(release): mục 11, triển khai server của chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tự rà (đã làm khi viết)

- **Phủ spec:** §2.1 (Task 2), §2.2 (Task 9, 10; hợp đồng 00), §2.3 (Task 7, 8; email không tới Zalo: test cuối Task 11 và test PUT email), §2.4 (Task 11), §2.5 (Task 7, 11), §2.6 (Task 12), §2.7 (Task 9: năm hạn mức, binding Task 3, cảnh báo Task 9 + 12), §1 secret và CORS (Task 3, 9), §6 bước 0 (Task 1), §7 bước 2 (Task 13). Phần app, website, pháp lý ở kế hoạch 02, 03, 04.
- **Tên nhất quán:** `OwnerBot.send`, `Deps.zalo`, `forwardConversation(db, zalo, id, now)`, `FORWARD_WINDOW`, `BOT_TEXT.*`, `TEST_ZALO_*` dùng giống nhau ở mọi task; route trả đúng thân của hợp đồng 00.
- **Không placeholder** ngoài các ô `<…>` của `spike.md` và runbook, là chỗ ghi kết quả thật hay giá trị của chủ dự án.
