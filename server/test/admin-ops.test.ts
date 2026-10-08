import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { lastAudit, makeAdmin } from "./admin-harness";
import { resetDb, wrapDb } from "./db";

beforeEach(resetDb);

interface AlertItem {
  kind: string;
  window_start: number;
  count: number;
  notified_count: number;
  notified_at: number | null;
}
interface AlertsBody {
  items: AlertItem[];
  total: number;
  pending: number;
}

const alert = (kind: string, windowStart: number, count: number, notifiedCount = 0, notifiedAt: number | null = null) =>
  env.DB.prepare("INSERT INTO ops_alerts (kind, window_start, count, notified_count, notified_at) VALUES (?, ?, ?, ?, ?)").bind(
    kind,
    windowStart,
    count,
    notifiedCount,
    notifiedAt,
  );

const auditCount = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log").first<{ n: number }>())?.n;

describe("GET /admin/alerts", () => {
  it("bảng rỗng: items [], total 0, pending 0", async () => {
    const { adminCall } = makeAdmin();
    const res = await adminCall("/admin/alerts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0, pending: 0 });
  });

  it("mới nhất trước (window_start giảm dần), cùng giờ thì theo kind tăng dần; đủ năm trường mỗi dòng", async () => {
    await env.DB.batch([
      alert("webhook_failed", 1000, 2, 2, 1100),
      alert("email_failed", 3000, 1),
      alert("webhook_failed", 3000, 5, 1),
      alert("cron_stalled", 2000, 3, 0),
    ]);
    const { adminCall } = makeAdmin();
    const body = (await adminCall("/admin/alerts")).body as unknown as AlertsBody;
    expect(body.items.map((i) => [i.kind, i.window_start])).toEqual([
      ["email_failed", 3000],
      ["webhook_failed", 3000],
      ["cron_stalled", 2000],
      ["webhook_failed", 1000],
    ]);
    expect(body.items[1]).toEqual({ kind: "webhook_failed", window_start: 3000, count: 5, notified_count: 1, notified_at: null });
    expect(body.items[3]).toEqual({ kind: "webhook_failed", window_start: 1000, count: 2, notified_count: 2, notified_at: 1100 });
  });

  it("notified_at null được giữ nguyên là null (không đổi thành 0 hay bỏ trường)", async () => {
    await alert("a", 10, 1).run();
    const { adminCall } = makeAdmin();
    const item = ((await adminCall("/admin/alerts")).body as unknown as AlertsBody).items[0];
    expect(item).toHaveProperty("notified_at", null);
  });

  it("hơn 200 dòng: items cắt còn 200 dòng mới nhất, total vẫn là tổng thật, pending đếm cả phần bị cắt", async () => {
    const stmts: D1PreparedStatement[] = [];
    for (let i = 1; i <= 205; i++) stmts.push(alert("k", i, 1)); // 205 dòng, đều chưa báo
    await env.DB.batch(stmts);
    const { adminCall } = makeAdmin();
    const body = (await adminCall("/admin/alerts")).body as unknown as AlertsBody;
    expect(body.items).toHaveLength(200);
    expect(body.items[0]?.window_start).toBe(205);
    expect(body.items[199]?.window_start).toBe(6);
    expect(body.total).toBe(205);
    expect(body.pending).toBe(205);
  });

  it("pending: chỉ đếm count > notified_count; bằng nhau không tính; không phụ thuộc bị cắt ở 200", async () => {
    await env.DB.batch([
      alert("a", 1, 3, 0), // chưa báo
      alert("a", 2, 3, 2), // báo thiếu
      alert("a", 3, 3, 3), // đã báo hết
      alert("a", 4, 1, 1), // đã báo hết
      alert("b", 4, 4, 0),
    ]);
    const { adminCall } = makeAdmin();
    const body = (await adminCall("/admin/alerts")).body as unknown as AlertsBody;
    expect(body.total).toBe(5);
    expect(body.pending).toBe(3);
  });

  it("ghi đúng một dòng nhật ký alerts_viewed, không detail, không email", async () => {
    await alert("a", 1, 1).run();
    const { adminCall } = makeAdmin();
    expect((await adminCall("/admin/alerts")).status).toBe(200);
    expect(await lastAudit()).toMatchObject({ actor: "admin:ops@example.com", action: "alerts_viewed", order_code: null, detail: null });
    expect(await auditCount()).toBe(1);
  });

  it("403 khi request từ trang khác hay không qua Access, và không ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall("/admin/alerts", { headers: { "sec-fetch-site": "cross-site" } })).toMatchObject({ status: 403, body: { error: "forbidden" } });
    expect((await adminCall("/admin/alerts", { operator: null })).status).toBe(403);
    expect(await auditCount()).toBe(0);
  });

  it("D1 lỗi: 500 và KHÔNG ghi alerts_viewed (chỉ ghi nhật ký sau khi tính xong)", async () => {
    const { db } = wrapDb(env.DB, (q) => q.includes("FROM ops_alerts"));
    const { adminFetch } = makeAdmin({ DB: db });
    const res = await adminFetch("/admin/alerts");
    expect(res.status).toBe(500);
    expect(await auditCount()).toBe(0);
  });

  it("hai truy vấn chạy trong MỘT db.batch (số liệu nhất quán)", async () => {
    let batches = 0;
    const real = env.DB;
    const db = new Proxy(real, {
      get(target, prop) {
        if (prop === "batch") {
          return (stmts: D1PreparedStatement[]) => {
            batches++;
            return target.batch(stmts);
          };
        }
        const v: unknown = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const { adminFetch } = makeAdmin({ DB: db });
    expect((await adminFetch("/admin/alerts")).status).toBe(200);
    expect(batches).toBe(1);
  });

  it("phản hồi không được lưu đệm: Cache-Control no-store", async () => {
    const { adminFetch } = makeAdmin();
    expect((await adminFetch("/admin/alerts")).headers.get("cache-control")).toBe("no-store");
  });

  it("alerts_viewed ẩn khỏi /admin/audit mặc định, hiện khi include_views=1 hay lọc đúng action đó", async () => {
    const { adminCall } = makeAdmin();
    await adminCall("/admin/alerts");
    const actions = async (q = "") =>
      ((await adminCall(`/admin/audit${q}`)).body as unknown as { items: { action: string }[] }).items.map((i) => i.action);
    expect(await actions()).not.toContain("alerts_viewed");
    expect(await actions("?include_views=1")).toContain("alerts_viewed");
    expect(await actions("?action=alerts_viewed")).toEqual(["alerts_viewed"]);
  });
});
