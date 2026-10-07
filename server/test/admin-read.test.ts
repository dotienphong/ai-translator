import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto";
import { reconcile } from "../src/reconcile";
import { lastAudit, makeAdmin } from "./admin-harness";
import { resetDb } from "./db";
import { DAY, T0 } from "./world";

beforeEach(resetDb);

type Page = { items: Record<string, unknown>[]; next_cursor: string | null };

/** 00:00 ngày 01/10/2026 giờ VN (T0 là 07:00 ngày đó), và 00:00 ngày 02/10 giờ VN: ranh giới ngày của bộ lọc from/to. */
const START = T0 - 7 * 3600;
const B = START + DAY;

/** Chèn thẳng một đơn pending có `created_at` cho trước (đủ cột NOT NULL của orders). */
const insertOrder = (createdAt: number) =>
  env.DB.prepare(
    "INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email_consent_at, status, created_at, expires_at) VALUES ('h', 'payos', 'monthly', 50000, 'VND', ?, 'pending', ?, ?)",
  ).bind(createdAt, createdAt, createdAt + 900);

/** Chèn thẳng một dòng nhật ký action `thu`, actor `api`, có `at` cho trước. */
const insertAudit = (at: number, actor = "api", action = "thu") =>
  env.DB.prepare("INSERT INTO audit_log (at, actor, action) VALUES (?, ?, ?)").bind(at, actor, action);

/** Chèn thẳng một license monthly còn hạn (không qua đơn); `cols` đặt locked_at, revoked_at. */
const insertLicense = (n: number, email: string, cols: { locked_at?: number; revoked_at?: number } = {}) =>
  env.DB.prepare(
    "INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at, locked_at, revoked_at) VALUES (?, ?, ?, 'monthly', ?, ?, ?, ?, ?, ?)",
  ).bind(`lic-${n}`, `L${String(n).padStart(27, "0")}`, email, T0 + DAY, T0, T0, T0, cols.locked_at ?? null, cols.revoked_at ?? null);

/** Chèn thẳng một máy đang kích hoạt (deactivated_at NULL) cho license `lic-${n}`. */
const insertActivation = (n: number, device: number) =>
  env.DB.prepare(
    "INSERT INTO activations (id, license_id, device_id_hash, device_label, created_at, last_validated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(`act-${n}-${device}`, `lic-${n}`, `dev-${n}-${device}`, `Máy ${device}`, T0, T0);

const auditTotal = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first<{ n: number }>())!.n;

/** Tạo `n` đơn pending (checkout), email khác nhau. */
async function checkouts(w: ReturnType<typeof makeAdmin>["w"], n: number, plan = "monthly") {
  for (let i = 0; i < n; i++) {
    const r = await w.call("POST", "/v1/checkout", { plan, email: `k${i}@example.com`, consent: true }, { "cf-connecting-ip": `198.51.100.${i + 1}` });
    if (r.status !== 201) throw new Error(`checkout ${r.status}`);
  }
}

/** Đọc hết mọi trang của một danh sách theo next_cursor. */
async function allPages(adminCall: ReturnType<typeof makeAdmin>["adminCall"], path: string) {
  const seen: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const res = await adminCall(cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path);
    expect(res.status).toBe(200);
    const page = res.body as unknown as Page;
    seen.push(...page.items);
    cursor = page.next_cursor;
    pages++;
  } while (cursor);
  return { seen, pages };
}

describe("GET /admin/orders", () => {
  it("mới nhất trước, 50 dòng mỗi trang, con trỏ không trùng không sót", async () => {
    const { w, adminCall } = makeAdmin();
    await checkouts(w, 55);
    const first = (await adminCall("/admin/orders")).body as unknown as Page;
    expect(first.items).toHaveLength(50);
    expect(first.items[0]).toMatchObject({ order_code: 55, status: "pending", plan: "monthly", email: "k54@example.com" });
    expect(first.items[0]).not.toHaveProperty("order_token_hash");
    expect(first.next_cursor).toBe("6");
    const { seen, pages } = await allPages(adminCall, "/admin/orders");
    expect(pages).toBe(2);
    expect(seen.map((o) => o.order_code)).toEqual(Array.from({ length: 55 }, (_, i) => 55 - i));
  });

  it("lọc theo status, plan, khoảng ngày tạo (GMT+7, `to` tính hết ngày)", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy({ plan: "yearly" }); // đơn 1, paid, 07:00 ngày 01/10 giờ VN
    w.clock.now = T0 + DAY; // 07:00 ngày 02/10
    await checkouts(w, 1); // đơn 2, pending
    const codes = async (q: string) => ((await adminCall(`/admin/orders?${q}`)).body as unknown as Page).items.map((o) => o.order_code);
    expect(await codes("status=paid")).toEqual([1]);
    expect(await codes("plan=monthly")).toEqual([2]);
    expect(await codes("from=2026-10-02")).toEqual([2]);
    expect(await codes("to=2026-10-01")).toEqual([1]);
    expect(await codes("from=2026-10-01&to=2026-10-02")).toEqual([2, 1]);
    expect(await codes("status=")).toEqual([2, 1]);
  });

  it("bộ lọc sai thì 400 kèm field, không ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    for (const [q, field] of [
      ["status=xyz", "status"],
      ["plan=pro", "plan"],
      ["from=2026-13-01", "from"],
      ["to=2026-02-30", "to"],
      ["from=01-10-2026", "from"],
      ["cursor=abc", "cursor"],
    ]) {
      expect(await adminCall(`/admin/orders?${q}`), q).toMatchObject({ status: 400, body: { error: "invalid_request", field } });
    }
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first()).toEqual({ n: 0 });
  });

  it("from > to thì 400 field to, không ghi nhật ký; from = to hợp lệ", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/orders?from=2026-10-03&to=2026-10-02")).toMatchObject({ status: 400, body: { error: "invalid_request", field: "to" } });
    expect(await auditTotal()).toBe(0);
    expect((await adminCall("/admin/orders?from=2026-10-02&to=2026-10-02")).status).toBe(200);
  });

  it("ranh giới ngày theo GMT+7: 00:00 ngày 02/10 giờ VN thuộc ngày 02/10, một giây trước thuộc ngày 01/10", async () => {
    const { adminCall } = makeAdmin();
    await env.DB.batch([insertOrder(B - 1), insertOrder(B)]); // đơn 1 (B - 1) và đơn 2 (B)
    const codes = async (q: string) => ((await adminCall(`/admin/orders?${q}`)).body as unknown as Page).items.map((o) => o.order_code);
    expect(await codes("from=2026-10-02")).toEqual([2]);
    expect(await codes("to=2026-10-01")).toEqual([1]);
    expect(await codes("from=2026-10-01&to=2026-10-01")).toEqual([1]);
    expect(await codes("from=2026-10-02&to=2026-10-02")).toEqual([2]);
  });

  it("ghi một dòng list_viewed, không chép email; GET từ trang khác thì 403; không qua Access thì 403", async () => {
    const { w, adminCall } = makeAdmin();
    await checkouts(w, 2);
    await adminCall("/admin/orders?status=pending");
    const log = await lastAudit();
    expect(log).toMatchObject({ actor: "admin:ops@example.com", action: "list_viewed" });
    expect(JSON.parse((log as { detail: string }).detail)).toEqual({ resource: "orders", filters: { status: "pending" }, count: 2 });
    expect((log as { detail: string }).detail).not.toContain("@");
    for (const site of ["cross-site", "same-site"]) {
      expect((await adminCall("/admin/orders", { headers: { "sec-fetch-site": site } })).status).toBe(403);
    }
    expect((await adminCall("/admin/orders", { operator: null })).status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'list_viewed'").first()).toEqual({ n: 1 });
  });
});

describe("GET /admin/audit", () => {
  it("mới nhất trước; mặc định ẩn các dòng xem và tra cứu; include_views=1 thì hiện", async () => {
    const { w, adminCall } = makeAdmin();
    await w.buy();
    await adminCall("/admin/lookup", { body: { email: "buyer@example.com" } });
    const actions = async (q = "") => ((await adminCall(`/admin/audit${q}`)).body as unknown as Page).items.map((a) => a.action);
    const plain = await actions();
    expect(plain).not.toContain("lookup");
    expect(plain).not.toContain("list_viewed");
    expect(plain).toContain("license_issued");
    const all = await actions("?include_views=1");
    expect(all.slice(0, 2)).toEqual(["list_viewed", "lookup"]);
  });

  it("lọc theo action, actor (admin = mọi actor bắt đầu admin:), order_code, ngày", async () => {
    const { w, adminCall } = makeAdmin();
    const { orderCode } = await w.buy();
    const id = (await env.DB.prepare("SELECT id FROM licenses").first<{ id: string }>())!.id;
    await adminCall(`/admin/licenses/${id}/extend`, { body: { days: 1, note: "bù" } });
    const page = async (q: string) => ((await adminCall(`/admin/audit?${q}`)).body as unknown as Page).items;
    expect((await page("action=license_extended_manually")).map((a) => a.actor)).toEqual(["admin:ops@example.com"]);
    expect((await page("actor=admin")).map((a) => a.action)).toEqual(["license_extended_manually"]);
    expect((await page(`order_code=${orderCode}`)).every((a) => a.order_code === orderCode)).toBe(true);
    expect((await page(`order_code=${orderCode}`)).length).toBeGreaterThan(0);
    expect(await page("from=2026-10-02")).toEqual([]);
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toMatchObject({ resource: "audit", filters: { from: "2026-10-02" } });
    await adminCall("/admin/audit?actor=admin");
    const detail = (await lastAudit() as { detail: string }).detail;
    expect(JSON.parse(detail)).toMatchObject({ filters: { actor: "admin" } });
    expect(detail).not.toContain("@");
    expect(await adminCall("/admin/audit?order_code=abc")).toMatchObject({ status: 400, body: { field: "order_code" } });
  });

  it("actor chỉ nhận api, webhook, reconcile, admin; mỗi giá trị chỉ trả đúng nhóm của nó", async () => {
    const { adminCall } = makeAdmin();
    await env.DB.batch([
      insertAudit(T0, "api"),
      insertAudit(T0 + 1, "webhook"),
      insertAudit(T0 + 2, "reconcile"),
      insertAudit(T0 + 3, "admin:ops@example.com"),
      insertAudit(T0 + 4, "admin:khac@example.com"),
    ]);
    const actors = async (actor: string) =>
      ((await adminCall(`/admin/audit?action=thu&actor=${actor}`)).body as unknown as Page).items.map((a) => a.actor);
    expect(await actors("api")).toEqual(["api"]);
    expect(await actors("webhook")).toEqual(["webhook"]);
    expect(await actors("reconcile")).toEqual(["reconcile"]);
    expect(await actors("admin")).toEqual(["admin:khac@example.com", "admin:ops@example.com"]);
  });

  it("actor ngoài bốn giá trị cố định (kể cả email, dạng admin:<email>) thì 400 field actor, không ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    await adminCall("/admin/orders"); // có sẵn một dòng list_viewed để thấy số dòng không tăng
    const before = await auditTotal();
    for (const actor of ["ops@example.com", encodeURIComponent("admin:ops@example.com"), "khac", "Admin", "admin:"]) {
      expect(await adminCall(`/admin/audit?actor=${actor}`), actor).toMatchObject({ status: 400, body: { error: "invalid_request", field: "actor" } });
    }
    expect(await auditTotal()).toBe(before);
  });

  it("action phải khớp ^[a-z][a-z0-9_]{0,63}$ (email không khớp), sai thì 400 field action, không ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    await adminCall("/admin/orders");
    const before = await auditTotal();
    for (const action of ["a@b.com", "List_Viewed", "1abc", "a-b", "a".repeat(65), "a".repeat(70)]) {
      expect(await adminCall(`/admin/audit?action=${action}`), action).toMatchObject({ status: 400, body: { error: "invalid_request", field: "action" } });
    }
    expect(await auditTotal()).toBe(before);
    expect((await adminCall(`/admin/audit?action=${"a".repeat(64)}`)).status).toBe(200);
  });

  it("lọc đúng một action xem (không include_views) thì không bị ẩn: action=list_viewed trả các dòng đã ghi", async () => {
    const { adminCall } = makeAdmin();
    await adminCall("/admin/orders");
    await adminCall("/admin/orders?status=paid");
    const page = (await adminCall("/admin/audit?action=list_viewed")).body as unknown as Page;
    expect(page.items.map((a) => a.action)).toEqual(["list_viewed", "list_viewed"]);
    expect(JSON.parse(page.items[1]!.detail as string)).toMatchObject({ resource: "orders", filters: {} });
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toMatchObject({ resource: "audit", filters: { action: "list_viewed" } });
    // Action khác trong nhóm xem cũng vậy; action ngoài nhóm không bị ảnh hưởng.
    expect(((await adminCall("/admin/audit?action=lookup")).body as unknown as Page).items).toEqual([]);
    expect(((await adminCall("/admin/audit")).body as unknown as Page).items).toEqual([]);
  });

  it("from > to thì 400 field to, không ghi nhật ký; from = to hợp lệ", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/audit?from=2026-10-03&to=2026-10-02")).toMatchObject({ status: 400, body: { error: "invalid_request", field: "to" } });
    expect(await auditTotal()).toBe(0);
    expect((await adminCall("/admin/audit?from=2026-10-02&to=2026-10-02")).status).toBe(200);
  });

  it("ranh giới ngày theo GMT+7: 00:00 ngày 02/10 giờ VN thuộc ngày 02/10, một giây trước thuộc ngày 01/10", async () => {
    const { adminCall } = makeAdmin();
    await env.DB.batch([insertAudit(B - 1), insertAudit(B)]);
    const ats = async (q: string) => ((await adminCall(`/admin/audit?action=thu&${q}`)).body as unknown as Page).items.map((a) => a.at);
    expect(await ats("from=2026-10-02")).toEqual([B]);
    expect(await ats("to=2026-10-01")).toEqual([B - 1]);
    expect(await ats("from=2026-10-01&to=2026-10-01")).toEqual([B - 1]);
    expect(await ats("from=2026-10-02&to=2026-10-02")).toEqual([B]);
  });

  it("phân trang theo id", async () => {
    const { adminCall } = makeAdmin();
    await env.DB.batch(
      Array.from({ length: 60 }, (_, i) =>
        env.DB.prepare("INSERT INTO audit_log (at, actor, action) VALUES (?, 'api', 'thu')").bind(T0 + i),
      ),
    );
    const { seen, pages } = await allPages(adminCall, "/admin/audit?action=thu");
    expect(pages).toBe(2);
    expect(seen).toHaveLength(60);
    expect(new Set(seen.map((a) => a.id)).size).toBe(60);
  });
});

describe("GET /admin/licenses", () => {
  /** Ba license: A còn hạn (monthly), B yearly đang xung đột, C đã thu hồi; thêm D đã hết hạn và E đang khóa. */
  async function fiveLicenses() {
    const ctx = makeAdmin();
    const { w } = ctx;
    await w.buy({ email: "a@example.com" });
    w.clock.now = T0 + 10;
    const b = await w.customerB();
    w.clock.now = T0 + 20;
    await w.buy({ email: "c@example.com" });
    w.clock.now = T0 + 30;
    await w.buy({ email: "d@example.com" });
    w.clock.now = T0 + 40;
    await w.buy({ email: "e@example.com" });
    const id = async (email: string) => (await env.DB.prepare("SELECT id FROM licenses WHERE email = ?").bind(email).first<{ id: string }>())!.id;
    await env.DB.prepare("UPDATE licenses SET revoked_at = ? WHERE email = 'c@example.com'").bind(T0 + 50).run();
    await env.DB.prepare("UPDATE licenses SET expires_at = ? WHERE email = 'd@example.com'").bind(T0 + 50).run();
    await env.DB.prepare("UPDATE licenses SET locked_at = ? WHERE email = 'e@example.com'").bind(T0 + 50).run();
    w.clock.now = T0 + 100;
    return { ...ctx, b, id };
  }

  it("mới nhất trước, key đã che, kèm số máy đang kích hoạt", async () => {
    const { adminCall, b } = await fiveLicenses();
    const page = (await adminCall("/admin/licenses")).body as unknown as Page;
    expect(page.items.map((l) => l.email)).toEqual(["e@example.com", "d@example.com", "c@example.com", b.email, "a@example.com"]);
    const lb = page.items[3]!;
    expect(lb).toMatchObject({ plan: "yearly", active_devices: 2 });
    const raw = b.licenseKey.replace(/-/g, "");
    expect(lb.license_key).toBe(`${raw.slice(0, 4)}-…-${raw.slice(-4)}`);
    expect(JSON.stringify(page)).not.toContain(raw);
    expect(page.next_cursor).toBeNull();
  });

  it("lọc theo trạng thái và gói", async () => {
    const { adminCall, b } = await fiveLicenses();
    const emails = async (q: string) => ((await adminCall(`/admin/licenses?${q}`)).body as unknown as Page).items.map((l) => l.email);
    expect(await emails("state=active")).toEqual(["e@example.com", b.email, "a@example.com"]);
    expect(await emails("state=expired")).toEqual(["d@example.com"]);
    expect(await emails("state=revoked")).toEqual(["c@example.com"]);
    expect(await emails("state=locked")).toEqual(["e@example.com"]);
    expect(await emails("state=conflict")).toEqual([b.email]);
    expect(await emails("plan=yearly")).toEqual([b.email]);
    expect(await adminCall("/admin/licenses?state=xyz")).toMatchObject({ status: 400, body: { field: "state" } });
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({ resource: "licenses", filters: { plan: "yearly" }, count: 1 });
  });

  it("phân trang theo (created_at, id), kể cả khi nhiều license cùng created_at", async () => {
    const { adminCall } = makeAdmin();
    await env.DB.batch(
      Array.from({ length: 53 }, (_, i) =>
        env.DB.prepare(
          "INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES (?, ?, NULL, 'monthly', ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), `K${String(i).padStart(27, "0")}`, T0 + DAY, T0, T0, i < 30 ? T0 : T0 + 1),
      ),
    );
    const { seen, pages } = await allPages(adminCall, "/admin/licenses");
    expect(pages).toBe(2);
    expect(new Set(seen.map((l) => l.id)).size).toBe(53);
  });
});

describe("GET /admin/trials", () => {
  it("mới nhất trước, cờ purchased theo activation của máy, lọc đang dùng / đã hết", async () => {
    const { w, adminCall } = makeAdmin();
    const d1 = await sha256Hex("trial-1");
    const d2 = await sha256Hex("trial-2");
    await w.call("POST", "/v1/trial", { device_id_hash: d1 });
    w.clock.now = T0 + 11 * DAY;
    await w.call("POST", "/v1/trial", { device_id_hash: d2 });
    const { licenseKey } = await w.buy();
    await w.call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: d1, device_label: "Máy 1" });
    const page = (await adminCall("/admin/trials")).body as unknown as Page;
    expect(page.items.map((t) => [t.device_id_hash, t.purchased])).toEqual([
      [d2, false],
      [d1, true],
    ]);
    expect(page.items[1]).toMatchObject({ started_at: T0, ends_at: T0 + 10 * DAY });
    const hashes = async (q: string) => ((await adminCall(`/admin/trials?${q}`)).body as unknown as Page).items.map((t) => t.device_id_hash);
    expect(await hashes("state=active")).toEqual([d2]);
    expect(await hashes("state=ended")).toEqual([d1]);
    expect(await adminCall("/admin/trials?state=x")).toMatchObject({ status: 400, body: { field: "state" } });
    expect(await adminCall("/admin/trials?cursor=khong_hop_le!")).toMatchObject({ status: 400, body: { field: "cursor" } });
  });
});

describe("GET /admin/queue", () => {
  it("không có việc gì: sáu nhóm đều rỗng; ghi queue_viewed", async () => {
    const { adminCall } = makeAdmin();
    const res = await adminCall("/admin/queue");
    expect(res.status).toBe(200);
    for (const g of ["needs_review", "underpaid", "email_failed", "locked", "conflict", "alerts"]) {
      expect(res.body[g], g).toEqual({ count: 0, items: [] });
    }
    expect(await lastAudit()).toMatchObject({ action: "queue_viewed" });
  });

  it("đủ sáu nhóm, đúng điều kiện từng nhóm (mỗi điều kiện có một dòng đối chứng nằm ngoài nhóm)", async () => {
    const { w, adminCall } = makeAdmin();
    const b = await w.customerB(); // license xung đột
    await w.buy({ email: "khoa@example.com" }); // sẽ khóa tạm; đơn trả từ 2 ngày trước, thư đã gửi: không phải email_failed
    await w.buy({ email: "thu@example.com" }); // sẽ thiếu tiền (gần đây)
    await w.buy({ email: "cu@example.com" }); // sẽ thiếu tiền (quá 30 ngày)
    await w.buy({ email: "mail@example.com" }); // email key bỏ cuộc
    await w.buy({ email: "review@example.com" }); // paid_needs_review, cũng có email_gave_up_at: không phải email_failed
    await w.buy({ email: "bien@example.com" }); // thiếu tiền, tạo đúng 30 ngày trước: còn trong nhóm
    const db = env.DB;
    await db.prepare("UPDATE licenses SET locked_at = ? WHERE email = 'khoa@example.com'").bind(T0).run();
    await db.prepare("UPDATE orders SET paid_at = ? WHERE email = 'khoa@example.com'").bind(T0 - 2 * DAY).run();
    await db.prepare("UPDATE orders SET status = 'underpaid', created_at = ? WHERE email = 'thu@example.com'").bind(T0).run();
    await db.prepare("UPDATE orders SET status = 'underpaid', created_at = ? WHERE email = 'cu@example.com'").bind(T0 - 31 * DAY).run();
    await db.prepare("UPDATE orders SET status = 'underpaid', created_at = ? WHERE email = 'bien@example.com'").bind(T0 - 30 * DAY).run();
    await db.prepare("UPDATE orders SET email_sent_at = NULL, email_gave_up_at = ? WHERE email = 'mail@example.com'").bind(T0).run();
    await db
      .prepare("UPDATE orders SET status = 'paid_needs_review', email_sent_at = NULL, email_gave_up_at = ? WHERE email = 'review@example.com'")
      .bind(T0)
      .run();
    await db.batch([
      insertLicense(1, "khoa-thuhoi@example.com", { locked_at: T0, revoked_at: T0 }), // vừa khóa tạm vừa thu hồi: không lên locked
      insertLicense(2, "thuhoi-2may@example.com", { revoked_at: T0 }), // thu hồi mà còn 2 máy: không lên conflict
      insertActivation(2, 1),
      insertActivation(2, 2),
      insertLicense(3, "mot-may@example.com"), // đúng 1 máy đang kích hoạt: không lên conflict
      insertActivation(3, 1),
      db.prepare("INSERT INTO ops_alerts (kind, window_start, count, notified_count) VALUES ('webhook_bad_signature', ?, 3, 1)").bind(T0),
      db.prepare("INSERT INTO ops_alerts (kind, window_start, count, notified_count) VALUES ('email_failed', ?, 2, 2)").bind(T0),
    ]);
    const q = (await adminCall("/admin/queue")).body as Record<string, { count: number; items: Record<string, unknown>[] }>;
    expect(q.needs_review!.items.map((o) => o.email)).toEqual(["review@example.com"]);
    expect(q.underpaid!.items.map((o) => o.email)).toEqual(["bien@example.com", "thu@example.com"]);
    expect(q.email_failed!.items.map((o) => o.email)).toEqual(["mail@example.com"]);
    expect(q.locked!.items.map((l) => l.email)).toEqual(["khoa@example.com"]);
    expect(q.conflict!.items.map((l) => [l.email, l.active_devices])).toEqual([[b.email, 2]]);
    expect(String(q.conflict!.items[0]!.license_key)).toContain("-…-");
    expect(q.alerts!.items).toEqual([{ kind: "webhook_bad_signature", window_start: T0, count: 3, notified_count: 1 }]);
    expect(q.needs_review!.items[0]).not.toHaveProperty("order_token_hash");
    expect(JSON.parse((await lastAudit() as { detail: string }).detail)).toEqual({
      needs_review: 1,
      underpaid: 2,
      email_failed: 1,
      locked: 1,
      conflict: 1,
      alerts: 1,
    });
  });

  describe("nhóm email_failed: đơn đã trả mà khách chưa nhận thư key", () => {
    /** Email các đơn đang ở nhóm email_failed. */
    const failedEmails = async (adminCall: ReturnType<typeof makeAdmin>["adminCall"]) =>
      ((await adminCall("/admin/queue")).body as unknown as Record<string, Page>).email_failed!.items.map((o) => o.email);
    const licenseId = async (email: string) => (await env.DB.prepare("SELECT id FROM licenses WHERE email = ?").bind(email).first<{ id: string }>())!.id;

    it("Resend trả 422 thì lên nhóm; admin gửi lại thất bại (502) vẫn ở nhóm, thành công thì rời nhóm", async () => {
      const { w, adminCall } = makeAdmin();
      w.resend.failStatus = 422;
      await w.buy({ email: "loi@example.com" });
      w.resend.failStatus = null;
      await w.buy({ email: "tot@example.com" });
      const id = await licenseId("loi@example.com");
      // Lần gửi lại thành công của admin từ trước lúc cron bỏ cuộc (ví dụ cho kỳ mua trước) không làm đơn này rời nhóm.
      await env.DB.prepare("INSERT INTO audit_log (at, actor, action, license_id, detail) VALUES (?, 'admin:ops@example.com', 'key_resent', ?, '{\"sent\":true}')")
        .bind(T0 - 1, id)
        .run();
      expect(await failedEmails(adminCall)).toEqual(["loi@example.com"]);
      w.clock.now = T0 + 60;
      w.resend.down = true;
      expect((await adminCall(`/admin/licenses/${id}/resend`, { body: {} })).status).toBe(502);
      expect(await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'key_resent' AND at = ?").bind(T0 + 60).first()).toEqual({ detail: '{"sent":false}' });
      expect(await failedEmails(adminCall)).toEqual(["loi@example.com"]);
      w.resend.down = false;
      expect((await adminCall(`/admin/licenses/${id}/resend`, { body: {} })).status).toBe(200);
      expect(await failedEmails(adminCall)).toEqual([]);
      // Gửi lại thành công của license khác không đụng tới đơn này.
      await env.DB.prepare("DELETE FROM audit_log WHERE action = 'key_resent'").run();
      expect(await failedEmails(adminCall)).toEqual(["loi@example.com"]);
      expect((await adminCall(`/admin/licenses/${await licenseId("tot@example.com")}/resend`, { body: {} })).status).toBe(200);
      expect(await failedEmails(adminCall)).toEqual(["loi@example.com"]);
    });

    it("lỗi tạm 500 liên tục: giờ 23 sau paid_at chưa lên, quá 24 giờ (cron thôi gửi) thì lên; admin gửi lại thành công thì rời", async () => {
      const { w, adminCall } = makeAdmin();
      w.resend.down = true;
      await w.buy({ email: "tam@example.com" });
      for (let hours = 1; hours <= 23; hours++) {
        w.clock.now = T0 + hours * 3600;
        await reconcile(w.env, w.deps); // cron mỗi giờ: Resend vẫn trả 500
        expect(await failedEmails(adminCall), `giờ ${hours}`).toEqual([]);
      }
      const row = await env.DB.prepare("SELECT email_attempts, email_sent_at, email_gave_up_at FROM orders").first<Record<string, number | null>>();
      expect(row!.email_attempts).toBeGreaterThan(3); // cron đã thử nhiều lần
      expect(row).toMatchObject({ email_sent_at: null, email_gave_up_at: null }); // cron không bao giờ đặt email_gave_up_at
      // Đúng 24 giờ sau paid_at: cron còn được thử lần cuối, chưa phải việc của người vận hành.
      w.clock.now = T0 + DAY;
      await env.DB.prepare("UPDATE orders SET email_retry_at = ?").bind(T0 + DAY).run();
      expect((await reconcile(w.env, w.deps)).emails_retried).toBe(1);
      expect(await failedEmails(adminCall)).toEqual([]);
      w.clock.now = T0 + DAY + 1;
      expect(await failedEmails(adminCall)).toEqual(["tam@example.com"]);
      w.clock.now = T0 + 30 * 3600; // lần hẹn kế tiếp đã tới hạn mà cron không gửi nữa
      expect((await reconcile(w.env, w.deps)).emails_retried).toBe(0);
      expect(await failedEmails(adminCall)).toEqual(["tam@example.com"]);
      w.resend.down = false;
      const id = await licenseId("tam@example.com");
      expect((await adminCall(`/admin/licenses/${id}/resend`, { body: {} })).status).toBe(200);
      expect(await failedEmails(adminCall)).toEqual([]);
    });

    it("đơn đã ẩn danh (email NULL) và đơn refunded có email_gave_up_at không lên nhóm", async () => {
      const { w, adminCall } = makeAdmin();
      w.resend.failStatus = 422;
      await w.buy({ email: "an1@example.com" }); // bỏ cuộc ngay
      w.resend.failStatus = null;
      w.resend.down = true;
      await w.buy({ email: "an2@example.com" }); // lỗi tạm, rồi quá 24 giờ
      await w.buy({ email: "hoan@example.com" });
      w.resend.down = false;
      await env.DB.prepare("UPDATE orders SET email_sent_at = NULL, email_gave_up_at = ? WHERE email = 'hoan@example.com'").bind(T0).run();
      w.clock.now = T0 + DAY + 1;
      expect(await failedEmails(adminCall)).toEqual(["hoan@example.com", "an2@example.com", "an1@example.com"]);
      await env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE email = 'hoan@example.com'").run();
      expect(await failedEmails(adminCall)).toEqual(["an2@example.com", "an1@example.com"]);
      for (const email of ["an1@example.com", "an2@example.com"]) {
        expect((await adminCall("/admin/erase", { body: { email, note: "yêu cầu xóa" } })).status).toBe(200);
      }
      expect(await failedEmails(adminCall)).toEqual([]);
    });
  });

  it("mỗi nhóm tối đa 20 dòng, count là tổng thật", async () => {
    const { w, adminCall } = makeAdmin();
    await checkouts(w, 25);
    await env.DB.prepare("UPDATE orders SET status = 'paid_needs_review'").run();
    const q = (await adminCall("/admin/queue")).body as Record<string, { count: number; items: unknown[] }>;
    expect(q.needs_review!.count).toBe(25);
    expect(q.needs_review!.items).toHaveLength(20);
  });

  it("GET từ trang khác thì 403", async () => {
    const { adminCall } = makeAdmin();
    expect((await adminCall("/admin/queue", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await adminCall("/admin/summary", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
  });
});

describe("GET /admin/summary", () => {
  it("doanh thu hôm nay theo ngày GMT+7, đơn đã trả 7 ngày, license còn hạn; ghi summary_viewed", async () => {
    const { w, adminCall } = makeAdmin();
    w.clock.now = T0 - 8 * 3600; // 23:00 ngày 30/09 giờ VN: hôm qua
    await w.buy({ email: "homqua@example.com" });
    w.clock.now = T0 - 6 * 3600; // 01:00 ngày 01/10 giờ VN: hôm nay
    await w.buy({ email: "homnay@example.com", plan: "yearly" });
    w.clock.now = T0 - 9 * DAY; // ngoài 7 ngày
    await w.buy({ email: "cu@example.com" });
    await env.DB.prepare("UPDATE licenses SET revoked_at = ? WHERE email = 'cu@example.com'").bind(T0 - 9 * DAY).run();
    w.clock.now = T0;
    const res = await adminCall("/admin/summary");
    expect(res).toEqual({
      status: 200,
      body: { revenue_today: 500000, currency: "VND", paid_orders_7d: 2, active_licenses: 2 },
    });
    expect(await lastAudit()).toMatchObject({ action: "summary_viewed", detail: null });
  });

  it("từng điều kiện: chỉ đơn paid tính doanh thu, ranh giới 00:00 GMT+7, cửa sổ 7 ngày đóng ở đầu, license phải chưa thu hồi và còn hạn", async () => {
    const { w, adminCall } = makeAdmin();
    const buyAt = (at: number, email: string, plan = "monthly") => {
      w.clock.now = at;
      return w.buy({ email, plan });
    };
    await buyAt(START, "dung0@example.com", "yearly"); // đúng 00:00 hôm nay giờ VN: tính vào hôm nay
    await buyAt(START - 1, "truoc0@example.com"); // một giây trước 00:00: hôm qua
    await buyAt(T0 - 3600, "homnay@example.com"); // 06:00 hôm nay
    await buyAt(T0 - 1800, "hoan@example.com"); // trả trong ngày rồi hoàn: không tính doanh thu
    await buyAt(T0 - 1200, "review@example.com"); // trả trong ngày, chờ xử lý: không tính doanh thu
    await buyAt(T0 - 7 * DAY, "bien7@example.com"); // đúng 7 ngày trước: còn trong cửa sổ
    await buyAt(T0 - 7 * DAY - 1, "ngoai7@example.com"); // một giây ngoài cửa sổ
    await buyAt(T0 - 40 * DAY, "hethan@example.com"); // license đã hết hạn
    await env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE email = 'hoan@example.com'").run();
    await env.DB.prepare("UPDATE orders SET status = 'paid_needs_review' WHERE email = 'review@example.com'").run();
    await env.DB.prepare("UPDATE licenses SET revoked_at = ? WHERE email IN ('hoan@example.com', 'review@example.com')").bind(T0 - 600).run();
    w.clock.now = T0;
    expect(await adminCall("/admin/summary")).toEqual({
      status: 200,
      // Doanh thu: dung0 (500000) + homnay (50000). 7 ngày: dung0, truoc0, homnay, bien7. License còn hạn: dung0, truoc0, homnay, bien7, ngoai7.
      body: { revenue_today: 550000, currency: "VND", paid_orders_7d: 4, active_licenses: 5 },
    });
  });
});
