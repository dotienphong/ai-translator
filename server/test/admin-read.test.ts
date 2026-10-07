import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
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
