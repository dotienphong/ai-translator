import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { resetDb } from "./db";

beforeEach(resetDb);

it("migration tạo đủ bảng", async () => {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  ).all<{ name: string }>();
  expect(results.map((r) => r.name)).toEqual([
    "activations",
    "audit_log",
    "d1_migrations",
    "deactivations",
    "error_report_logs",
    "error_reports",
    "licenses",
    "ops_alerts",
    "orders",
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

it("mỗi máy chỉ có một dòng activation cho một license, kể cả sau khi gỡ", async () => {
  await env.DB.prepare(
    "INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES ('L1', 'K1', NULL, 'monthly', 1, 0, 0, 0)",
  ).run();
  const insert = env.DB.prepare(
    "INSERT INTO activations (id, license_id, device_id_hash, created_at, last_validated_at) VALUES (?, 'L1', 'd', 0, 0)",
  );
  await insert.bind("A1").run();
  await expect(insert.bind("A2").run()).rejects.toThrow(/UNIQUE/);
  await env.DB.prepare("UPDATE activations SET deactivated_at = 1 WHERE id = 'A1'").run();
  await expect(insert.bind("A3").run()).rejects.toThrow(/UNIQUE/);
  expect(await env.DB.prepare("SELECT quota_epoch, epoch_pending, epoch_window_start FROM activations WHERE id = 'A1'").first()).toEqual({
    quota_epoch: 0,
    epoch_pending: 0,
    epoch_window_start: null,
  });
});

it("license và đơn chỉ nhận mã gói đã biết", async () => {
  const lic = env.DB.prepare(
    "INSERT INTO licenses (id, license_key, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES ('L2', 'K2', ?, 1, 0, 0, 0)",
  );
  await expect(lic.bind("pro_1m").run()).rejects.toThrow(/CHECK/);
  await expect(lic.bind("pro_x5").run()).rejects.toThrow(/CHECK/);
  await lic.bind("yearly").run();
  const order = env.DB.prepare(
    `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at)
     VALUES ('h', 'payos', ?, 1, 'VND', 0, 'pending', 0, 0)`,
  );
  await expect(order.bind("free").run()).rejects.toThrow(/CHECK/);
  await expect(order.bind("pro").run()).rejects.toThrow(/CHECK/);
  await order.bind("monthly").run();
});
