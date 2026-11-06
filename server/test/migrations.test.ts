import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

// Chạy 0001 trên D1 trống riêng (MIGRATION_DB), ghi dữ liệu theo mã gói cũ, rồi chạy 0002 (spec 2026-10-07 §5.1), rồi 0003
// (spec 2026-10-13 §2.2). Các test chạy lần lượt trên cùng một D1, nên thứ tự của chúng là một phần của bài kiểm.
const db = env.MIGRATION_DB;
const names = env.TEST_MIGRATIONS.map((m) => m.name);

it("có đúng mười migration theo thứ tự", () => {
  expect(names).toEqual([
    "0001_init.sql",
    "0002_three_plans_trials.sql",
    "0003_six_months_plan.sql",
    "0004_error_reports.sql",
    "0005_support_chat.sql",
    "0006_order_lang.sql",
    "0007_speaker_health.sql",
    "0008_expiry_reminders.sql",
    "0009_creem_subscriptions.sql",
    "0010_accounts.sql",
  ]);
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

  // Chỉ 0001 và 0002: test này kiểm riêng 0002; 0003 có test riêng ở cuối file.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 2));

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

it("0002 ánh xạ đủ ba mã cũ; mã khác giữ nguyên để CHECK chặn (chạy lại trên dữ liệu đã đổi không đổi gì)", async () => {
  // Lấy đúng biểu thức CASE trong file migration (có hai chỗ: licenses và orders, phải giống hệt nhau) rồi chạy trên
  // bảng thăm dò. Không thể chạy 0002 trên license đã là 'monthly'/'yearly': CHECK của 0001 không cho ghi mã đó.
  const sql = env.TEST_MIGRATIONS.find((m) => m.name === "0002_three_plans_trials.sql")!.queries.join("\n");
  const cases = sql.match(/CASE plan[\s\S]*?END/g) ?? [];
  expect(cases).toHaveLength(2);
  expect(cases[0]).toBe(cases[1]);
  await db.prepare("CREATE TABLE plan_probe (plan TEXT)").run();
  const codes = ["pro", "pro_x2", "pro_x5", "monthly", "yearly", "mã_lạ"];
  await db.batch(codes.map((c) => db.prepare("INSERT INTO plan_probe (plan) VALUES (?)").bind(c)));
  const mapped = await db.prepare(`SELECT plan, ${cases[0]} AS mapped FROM plan_probe`).all<{ plan: string; mapped: string }>();
  expect(Object.fromEntries(mapped.results.map((r) => [r.plan, r.mapped]))).toEqual({
    pro: "monthly",
    pro_x2: "monthly",
    pro_x5: "yearly",
    monthly: "monthly",
    yearly: "yearly",
    // Mã lạ không bị gộp vào gói nào: ghi vào bảng mới thì CHECK từ chối, migration dừng thay vì tặng nhầm gói.
    mã_lạ: "mã_lạ",
  });
  await db.prepare("DROP TABLE plan_probe").run();
  await expect(
    db
      .prepare("INSERT INTO licenses (id, license_key, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES ('Lx', 'Kx', 'mã_lạ', 1, 0, 0, 0)")
      .run(),
  ).rejects.toThrow(/CHECK/);
});


it("0003 nới CHECK mã gói: giữ nguyên dữ liệu, khóa ngoại, index, bộ đếm; schema chỉ khác chuỗi CHECK", async () => {
  // D1 đang ở trạng thái sau 0002 (hai test trên chỉ áp hai migration đầu) và còn dữ liệu của test đầu.
  const sqlOf = async () =>
    Object.fromEntries(
      (
        await db
          .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('licenses', 'orders', 'activations', 'deactivations')")
          .all<{ name: string; sql: string }>()
      ).results.map((r) => [r.name, r.sql]),
    );
  const indexesOf = async () =>
    (await db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results;
  const dump = async () => ({
    licenses: (await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results,
    orders: (await db.prepare("SELECT * FROM orders ORDER BY order_code").all()).results,
    activations: (await db.prepare("SELECT * FROM activations ORDER BY id").all()).results,
    deactivations: (await db.prepare("SELECT * FROM deactivations ORDER BY id").all()).results,
  });
  const sequences = async () =>
    Object.fromEntries(
      (await db.prepare("SELECT name, seq FROM sqlite_sequence WHERE name IN ('orders', 'deactivations')").all<{ name: string; seq: number }>()).results.map(
        (r) => [r.name, r.seq],
      ),
    );
  const insertLicense = (id: string, plan: string) =>
    db.prepare(
      `INSERT INTO licenses (id, license_key, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES ('${id}', 'K-${id}', '${plan}', 1, 0, 0, 0)`,
    );

  // Trước 0003: mã six_months chưa vào được.
  await expect(insertLicense("Lx", "six_months").run()).rejects.toThrow(/CHECK/);

  // Thêm dòng có MỌI cột khác nhau (và cả giá trị NULL) để việc chép sai cột lộ ra.
  await db.batch([
    db.prepare(
      `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, version, last_order_code, created_at, revoked_at, locked_at, lock_cleared_at)
       VALUES ('L4', 'K4', 'full@example.com', 'yearly', 101, 102, 103, 4, 1000010, 105, 106, 107, 108)`,
    ),
    db.prepare(
      `INSERT INTO orders (order_code, order_token_hash, provider, provider_ref, plan, amount, currency, email, email_consent_at, renew_license_id, license_id, grant_kind, status, amount_paid, created_at, expires_at, paid_at, last_checked_at, email_sent_at, email_attempts, email_retry_at, email_gave_up_at)
       VALUES (1000020, 'hash-20', 'payos', 'ref-20', 'monthly', 50000, 'VND', 'full@example.com', 11, 'L4', 'L4', 'change', 'paid', 49000, 12, 13, 14, 15, 16, 6, 17, 18)`,
    ),
    db.prepare(
      `INSERT INTO activations (id, license_id, device_id_hash, device_label, quota_epoch, epoch_pending, epoch_window_start, created_at, last_validated_at, deactivated_at, deactivated_by)
       VALUES ('A4', 'L4', 'device-4', 'Máy 4', 2, 1, 21, 22, 23, 24, 'admin')`,
    ),
    db.prepare("INSERT INTO deactivations (license_id, activation_id, at, by) VALUES ('L4', 'A4', 25, 'admin')"),
    // Đơn và lần gỡ lớn nhất đã bị xóa: bộ đếm lớn hơn khóa lớn nhất còn lại, đúng tình trạng production sau khi xóa dòng
    // thử. Thiếu ca này thì khi chép dòng SQLite tự dựng lại bộ đếm từ khóa lớn nhất, và test xanh dù 0003 không giữ bộ đếm.
    db.prepare(
      `INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at)
       VALUES (1000030, 'hash-30', 'payos', 'monthly', 50000, 'VND', 0, 'pending', 0, 0)`,
    ),
    db.prepare("DELETE FROM orders WHERE order_code = 1000030"),
    db.prepare("INSERT INTO deactivations (license_id, activation_id, at, by) VALUES ('L4', 'A4', 27, 'user')"),
    db.prepare("DELETE FROM deactivations WHERE at = 27"),
  ]);

  const schemaBefore = await sqlOf();
  const indexesBefore = await indexesOf();
  const dataBefore = await dump();
  const seqBefore = await sequences();
  expect(dataBefore.licenses.length).toBeGreaterThanOrEqual(4);
  expect(dataBefore.orders.length).toBeGreaterThanOrEqual(4);
  // Điều kiện để test có sức phân biệt: hai bộ đếm lớn hơn khóa lớn nhất còn lại (nếu không, SQLite tự dựng đúng bộ đếm).
  const maxOf = async (sql: string) => (await db.prepare(sql).first<{ m: number }>())!.m;
  expect(seqBefore.orders).toBeGreaterThan(await maxOf("SELECT MAX(order_code) AS m FROM orders"));
  expect(seqBefore.deactivations).toBeGreaterThan(await maxOf("SELECT MAX(id) AS m FROM deactivations"));

  // Chỉ áp 0003: 0004 thêm index riêng và có test riêng ở cuối file.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 3));

  // Dữ liệu: từng dòng, từng cột giữ nguyên (không đổi mã gói nào).
  expect(await dump()).toEqual(dataBefore);
  // Schema: giống hệt sau 0002, chỉ khác chuỗi CHECK của licenses và orders.
  const old = "CHECK (plan IN ('monthly', 'yearly'))";
  const next = "CHECK (plan IN ('monthly', 'six_months', 'yearly'))";
  const schemaAfter = await sqlOf();
  expect(schemaBefore.licenses).toContain(old);
  expect(schemaBefore.orders).toContain(old);
  expect(schemaAfter).toEqual({
    licenses: schemaBefore.licenses!.replace(old, next),
    orders: schemaBefore.orders!.replace(old, next),
    activations: schemaBefore.activations,
    deactivations: schemaBefore.deactivations,
  });
  expect(await indexesOf()).toEqual(indexesBefore);
  expect((await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_new'").all()).results).toEqual([]);

  // Khóa ngoại vẫn trỏ về bảng licenses (không phải licenses_new hay bảng cũ).
  const fks = async (table: string) =>
    (await db.prepare(`SELECT "table" AS target FROM pragma_foreign_key_list('${table}')`).all<{ target: string }>()).results.map((r) => r.target);
  expect(await fks("activations")).toEqual(["licenses"]);
  expect((await fks("deactivations")).sort()).toEqual(["activations", "licenses"]);
  expect(await fks("orders")).toEqual(["licenses", "licenses"]);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);

  // Bộ đếm số đơn và số lần gỡ không lùi: số kế tiếp là số đã dùng cộng một (PayOS không cho dùng lại orderCode).
  expect(await sequences()).toEqual(seqBefore);
  const nextOrder = await db
    .prepare(
      `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at)
       VALUES ('h', 'payos', 'six_months', 269000, 'VND', 0, 'pending', 0, 0) RETURNING order_code`,
    )
    .first<{ order_code: number }>();
  expect(nextOrder?.order_code).toBe(seqBefore.orders! + 1);
  const nextDeactivation = await db
    .prepare("INSERT INTO deactivations (license_id, activation_id, at, by) VALUES ('L4', 'A4', 26, 'user') RETURNING id")
    .first<{ id: number }>();
  expect(nextDeactivation?.id).toBe(seqBefore.deactivations! + 1);

  // Sau 0003: six_months vào được cả hai bảng; mã gói lạ (kể cả mã cũ của trước 0002) vẫn bị CHECK chặn.
  await insertLicense("L5", "six_months").run();
  expect(await db.prepare("SELECT plan FROM licenses WHERE id = 'L5'").first()).toEqual({ plan: "six_months" });
  for (const code of ["pro", "free", "Six_Months", ""]) {
    await expect(insertLicense("Ly", code).run()).rejects.toThrow(/CHECK/);
  }
  await expect(
    db
      .prepare("INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES ('h', 'payos', 'pro', 1, 'VND', 0, 'pending', 0, 0)")
      .run(),
  ).rejects.toThrow(/CHECK/);
});

it("0004 chỉ thêm hai bảng báo cáo lỗi và ba index; bảng cũ và dữ liệu cũ giữ nguyên", async () => {
  // D1 đang ở trạng thái sau 0003 (test trên chỉ áp ba migration đầu).
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

  // Chỉ áp tới 0004: 0005 có test riêng ở cuối file.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 4));

  const after = await tables();
  expect(after.filter((t) => !t.name.startsWith("error_report"))).toEqual(before);
  expect(after.map((t) => t.name).sort()).toEqual([...before.map((t) => t.name), "error_report_logs", "error_reports"].sort());
  expect(await indexNames()).toEqual(
    [...indexesBefore, "error_reports_device", "error_reports_fingerprint", "error_reports_received"].sort(),
  );
  expect((await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results).toEqual(licensesBefore);

  const report = (id: string, kind: string) =>
    db
      .prepare(
        `INSERT INTO error_reports (id, received_at, occurred_at, kind, code, fingerprint, build, app_version, os_name, os_version, arch,
                                    chip, ram_mb, gpu_backend, model_pack, plan, ui_lang, device_id_hash, message)
         VALUES (?, 1, 1, ?, 'x', '0123456789abcdef', 'release', '0.1.10', 'macos', '15.6', 'aarch64', 'Apple M4 Pro', 24576, 'metal',
                 'standard', 'free', 'vi', ?, 'm')`,
      )
      .bind(id, kind, "d".repeat(64));
  await expect(report("R-AAAA-BBBB", "khac").run()).rejects.toThrow(/CHECK/);
  await report("R-AAAA-BBBB", "crash").run();
  await db.prepare("INSERT INTO error_report_logs (id, app_log, asr_log, llama_log) VALUES ('R-AAAA-BBBB', 'a', 'b', 'c')").run();
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});

it("0005 chỉ thêm bốn bảng chat hỗ trợ và bốn index; chat mặc định tắt; bảng cũ và dữ liệu cũ giữ nguyên", async () => {
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

  // Chỉ áp tới 0005: 0006 có test riêng ở cuối file.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 5));

  const after = await tables();
  expect(after.filter((t) => !t.name.startsWith("support_"))).toEqual(before);
  expect(after.map((t) => t.name).filter((n) => n.startsWith("support_"))).toEqual(["support_conversations", "support_messages", "support_settings", "support_zalo_updates"]);
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

  // Chỉ áp tới 0006: 0007 có test riêng ở cuối file.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 6));

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

it("0007 chỉ thêm bảng speaker_health và hai index; bảng cũ giữ nguyên; trạng thái, app họp, canary chỉ nhận giá trị đã biết; mỗi khóa một dòng", async () => {
  // D1 đang ở trạng thái sau 0006 (test trên chỉ áp sáu migration đầu).
  const tables = async () =>
    (
      await db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
        )
        .all<{ name: string; sql: string }>()
    ).results;
  const indexNames = async () =>
    (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);
  const before = await tables();
  const indexesBefore = await indexNames();

  // Chỉ 0001 đến 0007: 0008 và 0009 có test riêng ở cuối file.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 7));

  const after = await tables();
  expect(after.filter((t) => t.name !== "speaker_health")).toEqual(before);
  expect(after.map((t) => t.name)).toContain("speaker_health");
  expect(await indexNames()).toEqual([...indexesBefore, "speaker_health_app", "speaker_health_received"].sort());
  const insert = (state: string, app: string, canary: number, device = "d") =>
    db
      .prepare(
        `INSERT INTO speaker_health (device_id_hash, day, meeting_app, meeting_version, canary, received_at, build, app_version, os_name,
                                     os_version, arch, recipe_version, state, minutes_ok, minutes_total, learned, patterns)
         VALUES (?4, '2026-10-01', ?2, '1', ?3, 0, 'release', '0.3.2', 'macos', '15', 'arm64', 1, ?1, 1, 1, 0, '[]')`,
      )
      .bind(state, app, canary, device);
  await expect(insert("broken", "teams", 0).run()).rejects.toThrow(/CHECK/);
  await expect(insert("ok", "webex", 0).run()).rejects.toThrow(/CHECK/);
  await expect(insert("ok", "teams", 2).run()).rejects.toThrow(/CHECK/);
  await insert("ok", "teams", 0).run();
  await expect(insert("no_names", "teams", 0).run()).rejects.toThrow(/UNIQUE|PRIMARY/);
  await insert("ok", "teams", 1).run();
  await insert("ok", "teams", 0, "d2").run();
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});

it("0008 chỉ thêm expiry_reminders, reminder_optouts và index licenses_expires; bảng cũ giữ nguyên; trạng thái chỉ nhận giá trị đã biết; mỗi (license, mốc hạn) một dòng", async () => {
  // D1 đang ở trạng thái sau 0007.
  const tables = async () =>
    (
      await db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
        )
        .all<{ name: string; sql: string }>()
    ).results;
  const indexNames = async () =>
    (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);
  const before = await tables();
  const indexesBefore = await indexNames();

  // Chỉ 0001 đến 0008: 0009 có test riêng ngay dưới.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 8));

  const after = await tables();
  const added = ["expiry_reminders", "reminder_optouts"];
  expect(after.filter((t) => !added.includes(t.name))).toEqual(before);
  expect(after.map((t) => t.name)).toEqual(expect.arrayContaining(added));
  expect(await indexNames()).toEqual([...indexesBefore, "expiry_reminders_pending", "licenses_expires"].sort());

  const insert = (status: string, cycle: number) =>
    db.prepare("INSERT INTO expiry_reminders (license_id, status, cycle, created_at) VALUES ('L1', ?, ?, 0)").bind(status, cycle);
  await expect(insert("queued", 100).run()).rejects.toThrow(/CHECK/);
  await insert("pending", 100).run();
  await expect(insert("pending", 100).run()).rejects.toThrow(/UNIQUE|PRIMARY/);
  await insert("pending", 200).run(); // hạn khác (đã gia hạn rồi lại gần hết hạn) là dòng khác
  await db.prepare("INSERT INTO reminder_optouts (email_hash, at) VALUES ('h', 0)").run();
  await expect(db.prepare("INSERT INTO reminder_optouts (email_hash, at) VALUES ('h', 1)").run()).rejects.toThrow(/UNIQUE|PRIMARY/);
  // Không có khóa ngoại tới licenses: thư nhắc không cản việc xóa hay ẩn danh license.
  expect((await db.prepare("PRAGMA foreign_key_list(expiry_reminders)").all()).results).toEqual([]);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});

it("0009 chỉ thêm cột orders.auto_renew (mặc định 0, chỉ 0 hay 1) và bảng subscriptions; đơn cũ giữ nguyên; mỗi kỳ thuê bao một đơn", async () => {
  // D1 đang ở trạng thái sau 0008.
  const tables = async () =>
    (
      await db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
        )
        .all<{ name: string; sql: string }>()
    ).results;
  const indexNames = async () =>
    (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);
  const insertOrder = (code: number, ref: string | null, autoRenew?: number) =>
    db
      .prepare(
        `INSERT INTO orders (order_code, order_token_hash, provider, provider_ref, plan, amount, currency, email_consent_at, status, created_at, expires_at${autoRenew === undefined ? "" : ", auto_renew"})
         VALUES (?, 'h', 'creem', ?, 'monthly', 399, 'USD', 0, 'paid', 0, 0${autoRenew === undefined ? "" : ", ?"})`,
      )
      .bind(...(autoRenew === undefined ? [code, ref] : [code, ref, autoRenew]));
  await insertOrder(9_100_001, "ch_old").run(); // đơn có từ trước 0009
  const before = await tables();
  const indexesBefore = await indexNames();

  // Chỉ 0001 đến 0009: 0010 có test riêng ngay dưới.
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 9));

  const after = await tables();
  expect(after.filter((t) => !["orders", "subscriptions"].includes(t.name))).toEqual(before.filter((t) => t.name !== "orders"));
  expect(after.map((t) => t.name)).toContain("subscriptions");
  // orders chỉ khác đúng một cột thêm ở cuối.
  const ordersBefore = before.find((t) => t.name === "orders")!.sql;
  const ordersAfter = after.find((t) => t.name === "orders")!.sql;
  expect(ordersAfter.startsWith(ordersBefore.slice(0, -1))).toBe(true);
  expect(ordersAfter).toContain("auto_renew INTEGER NOT NULL DEFAULT 0");
  expect(await indexNames()).toEqual([...indexesBefore, "orders_subscription_ref", "subscriptions_license"].sort());

  // Đơn cũ giữ nguyên, auto_renew = 0.
  expect(await db.prepare("SELECT order_code, provider_ref, auto_renew FROM orders WHERE order_code = 9100001").first()).toEqual({
    order_code: 9_100_001,
    provider_ref: "ch_old",
    auto_renew: 0,
  });
  await expect(insertOrder(9_100_002, "ch_bad", 2).run()).rejects.toThrow(/CHECK/);

  // Index duy nhất một phần: chỉ ràng buộc đơn thuê bao có provider_ref; đơn một lần cùng provider_ref không bị chặn.
  await insertOrder(9_100_003, "sub_1@100", 1).run();
  await expect(insertOrder(9_100_004, "sub_1@100", 1).run()).rejects.toThrow(/UNIQUE/);
  await insertOrder(9_100_005, "sub_1@200", 1).run(); // kỳ khác là đơn khác
  await insertOrder(9_100_006, null, 1).run();
  await insertOrder(9_100_007, null, 1).run(); // chưa có provider_ref thì không ràng buộc
  await insertOrder(9_100_008, "ch_dup", 0).run();
  await insertOrder(9_100_009, "ch_dup", 0).run(); // đơn một lần: không ràng buộc

  const sub = db.prepare(
    "INSERT INTO subscriptions (provider_ref, license_id, plan, status, paid_through, last_event_at, created_at, updated_at) VALUES (?, 'L1', 'monthly', 'active', 1, 1, 1, 1)",
  );
  await sub.bind("sub_1").run();
  await expect(sub.bind("sub_1").run()).rejects.toThrow(/UNIQUE|PRIMARY/);
  // Không có khóa ngoại: xóa hay ẩn danh license không bị bảng này chặn.
  expect((await db.prepare("PRAGMA foreign_key_list(subscriptions)").all()).results).toEqual([]);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});

it("migration 0010 giữ nguyên dữ liệu cũ: chỉ thêm accounts, login_attempts, hai cột account_id (NULL) và bốn index", async () => {
  // D1 đang ở trạng thái sau 0009 (test trên chỉ áp chín migration đầu) và còn dữ liệu của các test trước.
  const tables = async () =>
    (
      await db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
        )
        .all<{ name: string; sql: string }>()
    ).results;
  const indexNames = async () =>
    (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);

  // 13 license (kèm activation và đơn) và 90 máy dùng thử, tất cả dòng khác nhau để chép sai dòng hay sai cột lộ ra.
  const lic = db.prepare(
    `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, version, created_at)
     VALUES (?1, ?2, ?3, 'monthly', ?4, 10, 10, 2, 1)`,
  );
  const act = db.prepare(
    "INSERT INTO activations (id, license_id, device_id_hash, created_at, last_validated_at) VALUES (?1, ?2, ?3, 0, 0)",
  );
  const ord = db.prepare(
    `INSERT INTO orders (order_code, order_token_hash, provider, plan, amount, currency, email_consent_at, license_id, status, created_at, expires_at)
     VALUES (?1, 'h', 'payos', 'monthly', 50000, 'VND', 0, ?2, 'paid', 0, 0)`,
  );
  const trial = db.prepare("INSERT INTO trials (device_id_hash, started_at, ends_at, last_seen_at) VALUES (?1, ?2, ?3, ?4)");
  const seed: D1PreparedStatement[] = [];
  for (let i = 1; i <= 13; i++) {
    const id = `M${String(i).padStart(2, "0")}`;
    seed.push(lic.bind(id, `KM-${id}`, `m${i}@example.com`, 1000 + i));
    seed.push(act.bind(`AM${i}`, id, `dev-m${i}`));
    seed.push(ord.bind(7_000_000 + i, id));
  }
  for (let i = 1; i <= 90; i++) seed.push(trial.bind(`trial-${String(i).padStart(3, "0")}`, 100 + i, 200 + i, 300 + i));
  await db.batch(seed);

  const countsOf = async () =>
    Object.fromEntries(
      await Promise.all(
        (await tables()).map(async (t) => [t.name, (await db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).first<{ n: number }>())!.n] as const),
      ),
    );
  const before = await tables();
  const indexesBefore = await indexNames();
  const countsBefore = await countsOf();
  const licensesBefore = (await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results;
  const trialsBefore = (await db.prepare("SELECT * FROM trials ORDER BY device_id_hash").all()).results;
  const ordersBefore = (await db.prepare("SELECT * FROM orders ORDER BY order_code").all()).results;
  const activationsBefore = (await db.prepare("SELECT * FROM activations ORDER BY id").all()).results;
  expect(countsBefore.licenses).toBeGreaterThanOrEqual(13);
  expect(countsBefore.trials).toBe(90);
  expect(countsBefore.activations).toBeGreaterThanOrEqual(13);
  expect(countsBefore.orders).toBeGreaterThanOrEqual(13);

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  // Số dòng từng bảng cũ không đổi; hai bảng mới trống.
  const { accounts, login_attempts, ...oldCounts } = await countsOf();
  expect(oldCounts).toEqual(countsBefore);
  expect([accounts, login_attempts]).toEqual([0, 0]);
  const after = await tables();
  expect(after.map((t) => t.name)).toEqual([...before.map((t) => t.name), "accounts", "login_attempts"].sort());

  // Dữ liệu từng dòng, từng cột giữ nguyên; cột mới account_id của trials và licenses đều NULL.
  expect((await db.prepare("SELECT * FROM licenses ORDER BY id").all()).results).toEqual(licensesBefore.map((r) => ({ ...r, account_id: null })));
  expect((await db.prepare("SELECT * FROM trials ORDER BY device_id_hash").all()).results).toEqual(trialsBefore.map((r) => ({ ...r, account_id: null })));
  expect((await db.prepare("SELECT * FROM orders ORDER BY order_code").all()).results).toEqual(ordersBefore);
  expect((await db.prepare("SELECT * FROM activations ORDER BY id").all()).results).toEqual(activationsBefore);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM trials WHERE account_id IS NULL").first()).toEqual({ n: 90 });
  expect(await db.prepare("SELECT COUNT(*) AS n FROM licenses WHERE account_id IS NOT NULL").first()).toEqual({ n: 0 });

  // Bảng cũ khác licenses và trials giữ nguyên câu lệnh tạo; licenses và trials chỉ dài thêm đúng một cột ở cuối.
  const changed = ["licenses", "trials"];
  expect(after.filter((t) => ![...changed, "accounts", "login_attempts"].includes(t.name))).toEqual(before.filter((t) => !changed.includes(t.name)));
  for (const name of changed) {
    const was = before.find((t) => t.name === name)!.sql;
    const now = after.find((t) => t.name === name)!.sql;
    expect(now).toContain(", account_id TEXT REFERENCES accounts (id)");
    expect(now.replace(", account_id TEXT REFERENCES accounts (id)", "")).toBe(was);
  }
  expect(await indexNames()).toEqual([...indexesBefore, "accounts_email", "licenses_account", "login_attempts_expires", "trials_account"].sort());

  // Khóa ngoại trỏ đúng bảng accounts; không còn khóa ngoại hỏng.
  const fks = async (table: string) =>
    (await db.prepare(`SELECT "table" AS target FROM pragma_foreign_key_list('${table}')`).all<{ target: string }>()).results.map((r) => r.target);
  expect(await fks("trials")).toEqual(["accounts"]);
  expect(await fks("login_attempts")).toEqual(["accounts"]);
  expect(await fks("licenses")).toContain("accounts");
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});

it("migration 0010 tạo accounts.google_sub duy nhất (email không duy nhất, được NULL)", async () => {
  const insert = (id: string, sub: string, email: string | null) =>
    db
      .prepare(
        `INSERT INTO accounts (id, google_sub, email, email_verified, consent_at, created_at, last_login_at)
         VALUES (?, ?, ?, 1, 1, 1, 1)`,
      )
      .bind(id, sub, email);
  await insert("acc-1", "sub-1", "a@example.com").run();
  await expect(insert("acc-2", "sub-1", "b@example.com").run()).rejects.toThrow(/UNIQUE/);
  await expect(insert("acc-1", "sub-3", "c@example.com").run()).rejects.toThrow(/UNIQUE|PRIMARY/);
  // Khóa là google_sub, không phải email: hai tài khoản trùng email vẫn vào được (và email NULL sau khi xóa tài khoản).
  await insert("acc-4", "sub-4", "a@example.com").run();
  await insert("acc-5", "sub-5", null).run();
  // Các cột bắt buộc, các cột còn lại mặc định NULL (chưa dùng thử, chưa xóa).
  expect(await db.prepare("SELECT trial_started_at, trial_ends_at, deleted_at, lang FROM accounts WHERE id = 'acc-1'").first()).toEqual({
    trial_started_at: null,
    trial_ends_at: null,
    deleted_at: null,
    lang: null,
  });
  await expect(
    db.prepare("INSERT INTO accounts (id, google_sub, consent_at, created_at, last_login_at) VALUES ('acc-6', 'sub-6', 1, 1, 1)").run(),
  ).rejects.toThrow(/NOT NULL/);
});

it("migration 0010: login_attempts.status từ chối giá trị lạ; account_id phải trỏ tới tài khoản có thật", async () => {
  const insert = (id: string, status: string, accountId: string | null = null) =>
    db
      .prepare(
        `INSERT INTO login_attempts (id, state_hash, nonce_hash, challenge, code_verifier, device_id_hash, consent_at, status, account_id, created_at, expires_at)
         VALUES (?, 'sh', 'nh', 'ch', 'cv', 'dev', 1, ?, ?, 1, 601)`,
      )
      .bind(id, status, accountId);
  for (const status of ["pending", "done", "denied", "failed", "claimed"]) await insert(`ok-${status}`, status).run();
  for (const status of ["expired", "PENDING", "", "cancelled"]) {
    await expect(insert(`bad-${status}`, status).run()).rejects.toThrow(/CHECK/);
  }
  await insert("with-account", "done", "acc-1").run();
  await expect(insert("no-account", "done", "acc-không-có").run()).rejects.toThrow(/FOREIGN KEY/);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
