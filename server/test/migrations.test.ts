import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

// Chạy 0001 trên D1 trống riêng (MIGRATION_DB), ghi dữ liệu theo mã gói cũ, rồi chạy 0002 (spec 2026-10-07 §5.1).
const db = env.MIGRATION_DB;
const names = env.TEST_MIGRATIONS.map((m) => m.name);

it("có đúng hai migration theo thứ tự", () => {
  expect(names).toEqual(["0001_init.sql", "0002_three_plans_trials.sql"]);
});

it("0002 đổi mã gói, giữ dữ liệu, khóa ngoại, index và bộ đếm số đơn", async () => {
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 1));
  const lic = db.prepare(
    `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, version, created_at)
     VALUES (?, ?, 'a@example.com', ?, 100, 10, 10, 2, 1)`,
  );
  const order = db.prepare(
    `INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, license_id, status, created_at, expires_at)
     VALUES (?, 'h', 'payos', ?, ?, 'VND', 0, ?, 'paid', 0, 0)`,
  );
  await db.batch([
    lic.bind("L1", "K1", "pro"),
    lic.bind("L2", "K2", "pro_x2"),
    lic.bind("L3", "K3", "pro_x5"),
    db.prepare("INSERT INTO activations (id, license_id, device_id_hash, created_at, last_validated_at) VALUES ('A1', 'L3', 'd', 0, 0)"),
    db.prepare("INSERT INTO deactivations (license_id, activation_id, at, by) VALUES ('L3', 'A1', 5, 'user')"),
    order.bind(1_000_001, "pro", 50000, "L1"),
    order.bind(1_000_002, "pro_x2", 150000, "L2"),
    order.bind(1_000_003, "pro_x5", 500000, "L3"),
    // Đơn lớn nhất đã bị xóa: bộ đếm (1.000.004) lớn hơn order_code lớn nhất còn lại.
    order.bind(1_000_004, "pro", 50000, null),
    db.prepare("DELETE FROM orders WHERE order_code = 1000004"),
  ]);

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  expect((await db.prepare("SELECT id, plan, expires_at, cycle_anchor, version FROM licenses ORDER BY id").all()).results).toEqual([
    { id: "L1", plan: "monthly", expires_at: 100, cycle_anchor: 10, version: 2 },
    { id: "L2", plan: "monthly", expires_at: 100, cycle_anchor: 10, version: 2 },
    { id: "L3", plan: "yearly", expires_at: 100, cycle_anchor: 10, version: 2 },
  ]);
  expect((await db.prepare("SELECT order_code, plan, amount, license_id FROM orders ORDER BY order_code").all()).results).toEqual([
    { order_code: 1_000_001, plan: "monthly", amount: 50000, license_id: "L1" },
    { order_code: 1_000_002, plan: "monthly", amount: 150000, license_id: "L2" },
    { order_code: 1_000_003, plan: "yearly", amount: 500000, license_id: "L3" },
  ]);
  // Số đơn kế tiếp không lùi về 1.000.004 (đã dùng) hay 1.
  const next = await db
    .prepare(
      `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at)
       VALUES ('h', 'payos', 'monthly', 1, 'VND', 0, 'pending', 0, 0) RETURNING order_code`,
    )
    .first<{ order_code: number }>();
  expect(next?.order_code).toBe(1_000_005);

  expect(await db.prepare("SELECT id, license_id, device_id_hash FROM activations").all().then((r) => r.results)).toEqual([
    { id: "A1", license_id: "L3", device_id_hash: "d" },
  ]);
  expect(await db.prepare("SELECT id, license_id, activation_id, at, by FROM deactivations").all().then((r) => r.results)).toEqual([
    { id: 1, license_id: "L3", activation_id: "A1", at: 5, by: "user" },
  ]);
  const nextDeactivation = await db
    .prepare("INSERT INTO deactivations (license_id, activation_id, at, by) VALUES ('L3', 'A1', 6, 'user') RETURNING id")
    .first<{ id: number }>();
  expect(nextDeactivation?.id).toBe(2);

  // Khóa ngoại của activations, deactivations và orders vẫn trỏ về bảng licenses (không phải licenses_new hay bảng cũ).
  const fks = async (table: string) =>
    (await db.prepare(`SELECT "table" AS target FROM pragma_foreign_key_list('${table}')`).all<{ target: string }>()).results.map(
      (r) => r.target,
    );
  expect(await fks("activations")).toEqual(["licenses"]);
  expect((await fks("deactivations")).sort()).toEqual(["activations", "licenses"]);
  expect(await fks("orders")).toEqual(["licenses", "licenses"]);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);

  const indexes = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>())
    .results.map((r) => r.name);
  expect(indexes).toEqual([
    "activations_device",
    "activations_license",
    "audit_license",
    "audit_order",
    "deactivations_license",
    "licenses_email",
    "orders_email",
    "orders_pending",
  ]);
  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_new'").all()).results;
  expect(tables).toEqual([]);
});
