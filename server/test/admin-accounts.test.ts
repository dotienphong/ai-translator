// Web Admin: API tài khoản (spec 2026-11-05 §7, §5.5): danh sách, chi tiết, gỡ gắn license, ẩn danh, xuất CSV.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { csvCell } from "../src/admin-accounts";
import { sha256Hex } from "../src/crypto";
import { makeAccount } from "./account-helpers";
import { auditCount, makeAdmin } from "./admin-harness";
import { resetDb } from "./db";
import { DAY, T0 } from "./world";

beforeEach(resetDb);

type Items = { items: Record<string, unknown>[]; next_cursor: string | null };

/** Chèn thẳng một license monthly; `accountId` gắn vào tài khoản. Id dạng UUID như thật. */
async function insertLicense(n: number, cols: { accountId?: string | null; expiresAt?: number; revokedAt?: number | null; plan?: string } = {}) {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await env.DB.prepare(
    `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at, revoked_at, account_id)
     VALUES (?, ?, 'khach@example.com', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, `K${String(n).padStart(27, "0")}`, cols.plan ?? "monthly", cols.expiresAt ?? T0 + 10 * DAY, T0, T0, T0, cols.revokedAt ?? null, cols.accountId ?? null)
    .run();
  return id;
}

const insertActivation = (licenseId: string, device: string, deactivatedAt: number | null = null) =>
  env.DB.prepare(
    "INSERT INTO activations (id, license_id, device_id_hash, device_label, created_at, last_validated_at, deactivated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), licenseId, device, `Máy ${device.slice(0, 4)}`, T0, T0, deactivatedAt)
    .run();

const insertTrial = (device: string, accountId: string | null, startedAt = T0, endsAt = T0 + 10 * DAY) =>
  env.DB.prepare("INSERT INTO trials (device_id_hash, started_at, ends_at, last_seen_at, account_id) VALUES (?, ?, ?, ?, ?)")
    .bind(device, startedAt, endsAt, startedAt, accountId)
    .run();

/** Chèn thẳng một tài khoản (không qua đăng nhập) với created_at tùy ý. */
async function insertAccount(email: string | null, cols: { createdAt?: number; trialEndsAt?: number | null; deletedAt?: number | null } = {}) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO accounts (id, google_sub, email, email_verified, consent_at, lang, created_at, last_login_at, trial_started_at, trial_ends_at, deleted_at)
     VALUES (?1, ?2, ?3, 1, ?4, 'vi', ?4, ?4, ?5, ?6, ?7)`,
  )
    .bind(id, `sub-${id}`, email, cols.createdAt ?? T0, cols.trialEndsAt === undefined || cols.trialEndsAt === null ? null : cols.trialEndsAt - 10 * DAY, cols.trialEndsAt ?? null, cols.deletedAt ?? null)
    .run();
  return id;
}

const auditRows = async () => (await env.DB.prepare("SELECT actor, action, license_id, detail FROM audit_log ORDER BY id").all<Record<string, string | null>>()).results;

describe("csvCell", () => {
  it("vô hiệu công thức: tiền tố ' khi ký tự đầu là =, +, -, @, tab hay CR", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+84901234567")).toBe("'+84901234567");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1")).toBe("'\t=1");
    // CR đứng đầu: vừa cần tiền tố vừa cần bọc nháy (có xuống dòng).
    expect(csvCell("\r=1")).toBe('"\'\r=1"');
  });

  it("bọc nháy kép và nhân đôi nháy kép khi có dấu phẩy, nháy kép hay xuống dòng", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
  });

  it("tiền tố áp lên giá trị gốc rồi mới bọc nháy: =a,b thành \"'=a,b\"", () => {
    expect(csvCell("=a,b")).toBe("\"'=a,b\"");
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });

  it("giá trị thường và rỗng giữ nguyên; dấu - hay + ở giữa không bị đổi", () => {
    expect(csvCell("an.nguyen@example.com")).toBe("an.nguyen@example.com");
    expect(csvCell("a-b+c@example.com")).toBe("a-b+c@example.com");
    expect(csvCell("")).toBe("");
  });
});

describe("Access: mọi route tài khoản cần danh tính", () => {
  it("không qua Access thì 403, không ghi nhật ký", async () => {
    const { adminCall, adminFetch } = makeAdmin();
    const id = await insertAccount("a@example.com");
    expect((await adminCall("/admin/accounts", { operator: null })).status).toBe(403);
    expect((await adminCall(`/admin/accounts/${id}`, { operator: null })).status).toBe(403);
    expect((await adminFetch("/admin/accounts/export.csv", { operator: null })).status).toBe(403);
    expect((await adminCall(`/admin/accounts/${id}/unlink-license`, { body: { license_id: "x" }, operator: null })).status).toBe(403);
    expect((await adminCall(`/admin/accounts/${id}/anonymize`, { body: {}, operator: null })).status).toBe(403);
    expect(await auditRows()).toEqual([]);
    expect(await env.DB.prepare("SELECT email, deleted_at FROM accounts").first()).toEqual({ email: "a@example.com", deleted_at: null });
  });

  it("email không có trong ADMIN_EMAILS thì 403 ở cả đọc lẫn ghi", async () => {
    const { adminCall, adminFetch } = makeAdmin({ ADMIN_EMAILS: "ops@example.com" });
    const id = await insertAccount("a@example.com");
    const operator = "ke-la@example.com";
    expect((await adminCall("/admin/accounts", { operator })).status).toBe(403);
    expect((await adminFetch("/admin/accounts/export.csv", { operator })).status).toBe(403);
    expect((await adminCall(`/admin/accounts/${id}/anonymize`, { body: {}, operator })).status).toBe(403);
    expect((await adminCall("/admin/accounts")).status).toBe(200);
  });

  it("Sec-Fetch-Site từ trang khác thì 403 ở route GET (có ghi nhật ký)", async () => {
    const { adminCall, adminFetch } = makeAdmin();
    const id = await insertAccount("a@example.com");
    const headers = { "sec-fetch-site": "cross-site" };
    expect((await adminCall("/admin/accounts", { headers })).status).toBe(403);
    expect((await adminCall(`/admin/accounts/${id}`, { headers })).status).toBe(403);
    expect((await adminFetch("/admin/accounts/export.csv", { headers })).status).toBe(403);
    expect(await auditRows()).toEqual([]);
  });
});

describe("GET /admin/accounts", () => {
  it("tìm theo một phần email, không phân biệt hoa thường (email lưu chữ thường); không có thì rỗng", async () => {
    const { adminCall } = makeAdmin();
    await insertAccount("nguyen.an@example.com");
    await insertAccount("tran.binh@example.com");
    await insertAccount("le.cuong@corp.test");
    const mixed = (await adminCall("/admin/accounts?q=NGUYEN.An")).body as unknown as Items;
    expect(mixed.items.map((i) => i.email)).toEqual(["nguyen.an@example.com"]);
    const domain = (await adminCall("/admin/accounts?q=@example.com")).body as unknown as Items;
    expect(domain.items.map((i) => i.email).sort()).toEqual(["nguyen.an@example.com", "tran.binh@example.com"]);
    expect(((await adminCall("/admin/accounts?q=khong-co")).body as unknown as Items).items).toEqual([]);
    // Ký tự đặc biệt của LIKE là chữ thường, không phải ký tự đại diện.
    expect(((await adminCall("/admin/accounts?q=%25")).body as unknown as Items).items).toEqual([]);
    expect(((await adminCall("/admin/accounts?q=_")).body as unknown as Items).items).toEqual([]);
  });

  it("q quá dài thì 400", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall(`/admin/accounts?q=${"a".repeat(300)}`)).toMatchObject({ status: 400, body: { error: "invalid_request", field: "q" } });
  });

  it("mỗi bộ lọc trả đúng nhóm; mỗi tài khoản thuộc đúng một nhóm", async () => {
    const { adminCall } = makeAdmin();
    const paid = await insertAccount("paid@example.com", { trialEndsAt: T0 + DAY });
    await insertLicense(1, { accountId: paid });
    const paidTrialOver = await insertAccount("paid2@example.com", { trialEndsAt: T0 - DAY });
    await insertLicense(2, { accountId: paidTrialOver });
    await insertAccount("active@example.com", { trialEndsAt: T0 + DAY });
    await insertAccount("ended@example.com", { trialEndsAt: T0 - DAY });
    await insertAccount("never@example.com");
    // License đã hết hạn hay đã thu hồi không tính là đã mua.
    const expired = await insertAccount("expired@example.com", { trialEndsAt: T0 - 20 * DAY });
    await insertLicense(3, { accountId: expired, expiresAt: T0 - DAY });
    const revoked = await insertAccount("revoked@example.com", { trialEndsAt: T0 + DAY });
    await insertLicense(4, { accountId: revoked, revokedAt: T0 - 1 });
    await insertAccount(null, { trialEndsAt: T0 + DAY, deletedAt: T0 - DAY });

    const emails = async (filter: string) =>
      ((await adminCall(`/admin/accounts?filter=${filter}`)).body as unknown as Items).items.map((i) => i.email as string | null).sort();
    expect(await emails("paid")).toEqual(["paid2@example.com", "paid@example.com"]);
    expect(await emails("trial_active")).toEqual(["active@example.com", "revoked@example.com"]);
    expect(await emails("trial_ended")).toEqual(["ended@example.com", "expired@example.com"]);
    expect(await emails("deleted")).toEqual([null]);
    // Không lọc: cả 8, kể cả tài khoản chưa từng dùng thử và tài khoản đã xóa.
    expect(((await adminCall("/admin/accounts")).body as unknown as Items).items).toHaveLength(8);
    expect(await adminCall("/admin/accounts?filter=bay-ba")).toMatchObject({ status: 400, body: { error: "invalid_request", field: "filter" } });
  });

  it("lọc và tìm kết hợp bằng AND", async () => {
    const { adminCall } = makeAdmin();
    await insertAccount("a.active@example.com", { trialEndsAt: T0 + DAY });
    await insertAccount("b.active@example.com", { trialEndsAt: T0 + DAY });
    await insertAccount("a.ended@example.com", { trialEndsAt: T0 - DAY });
    const res = (await adminCall("/admin/accounts?filter=trial_active&q=a.")).body as unknown as Items;
    expect(res.items.map((i) => i.email)).toEqual(["a.active@example.com"]);
  });

  it("mỗi dòng có email, ngày tạo, đăng nhập gần nhất, số license, số máy, trạng thái dùng thử; không lộ google_sub", async () => {
    const { w, adminCall } = makeAdmin();
    const d1 = await sha256Hex("d1");
    const d2 = await sha256Hex("d2");
    const d3 = await sha256Hex("d3");
    const acc = await makeAccount(w, d1, { email: "an@example.com", trialStartedAt: T0 - 3 * DAY, trialEndsAt: T0 + 7 * DAY });
    const lic = await insertLicense(1, { accountId: acc.accountId, plan: "yearly" });
    await insertLicense(2, { accountId: acc.accountId });
    await insertActivation(lic, d1);
    await insertActivation(lic, d2);
    await insertActivation(lic, d3, T0 - 1); // đã gỡ: không đếm
    await insertTrial(d1, acc.accountId); // cùng máy d1 với activation: đếm một lần
    await insertTrial(d3, acc.accountId);
    const res = (await adminCall("/admin/accounts")).body as unknown as Items;
    expect(res.items).toEqual([
      {
        id: acc.accountId,
        email: "an@example.com",
        created_at: T0,
        last_login_at: T0,
        deleted_at: null,
        trial_started_at: T0 - 3 * DAY,
        trial_ends_at: T0 + 7 * DAY,
        license_count: 2,
        device_count: 3,
        status: "paid",
      },
    ]);
    expect(res.next_cursor).toBeNull();
    expect(JSON.stringify(res)).not.toContain("sub-");
  });

  it("status theo nhóm: deleted, paid, trial_active, trial_ended, none", async () => {
    const { adminCall } = makeAdmin();
    const paid = await insertAccount("paid@example.com");
    await insertLicense(1, { accountId: paid });
    await insertAccount("active@example.com", { trialEndsAt: T0 + DAY });
    await insertAccount("ended@example.com", { trialEndsAt: T0 - DAY });
    await insertAccount("never@example.com");
    await insertAccount(null, { trialEndsAt: T0 + DAY, deletedAt: T0 });
    const items = ((await adminCall("/admin/accounts")).body as unknown as Items).items;
    const by = Object.fromEntries(items.map((i) => [String(i.email), i.status]));
    expect(by).toEqual({
      "paid@example.com": "paid",
      "active@example.com": "trial_active",
      "ended@example.com": "trial_ended",
      "never@example.com": "none",
      null: "deleted",
    });
  });

  it("phân trang 50 dòng mỗi trang, mới nhất trước, con trỏ keyset", async () => {
    const { adminCall } = makeAdmin();
    for (let i = 0; i < 51; i++) await insertAccount(`u${String(i).padStart(2, "0")}@example.com`, { createdAt: T0 + i });
    const first = (await adminCall("/admin/accounts")).body as unknown as Items;
    expect(first.items).toHaveLength(50);
    expect(first.items[0]?.email).toBe("u50@example.com");
    expect(first.next_cursor).toMatch(/^\d+_[0-9a-f-]+$/);
    const second = (await adminCall(`/admin/accounts?cursor=${encodeURIComponent(first.next_cursor!)}`)).body as unknown as Items;
    expect(second.items.map((i) => i.email)).toEqual(["u00@example.com"]);
    expect(second.next_cursor).toBeNull();
    expect(await adminCall("/admin/accounts?cursor=xyz")).toMatchObject({ status: 400, body: { field: "cursor" } });
  });

  it("ghi list_viewed không chứa email hay chuỗi tìm", async () => {
    const { adminCall } = makeAdmin();
    await insertAccount("bi.mat@example.com");
    await adminCall("/admin/accounts?q=bi.mat&filter=trial_active");
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "admin:ops@example.com", action: "list_viewed" });
    expect(JSON.parse(rows[0]!.detail!)).toEqual({ resource: "accounts", filters: { filter: "trial_active" }, count: 0 });
    expect(JSON.stringify(rows)).not.toContain("bi.mat");
  });
});

describe("GET /admin/accounts/:id", () => {
  it("trả tài khoản, license đã gắn (key che), máy và dòng trials; không lộ license của tài khoản khác", async () => {
    const { w, adminCall } = makeAdmin();
    const d1 = await sha256Hex("d1");
    const d2 = await sha256Hex("d2");
    const acc = await makeAccount(w, d1, { email: "an@example.com", trialStartedAt: T0 - DAY, trialEndsAt: T0 + 9 * DAY });
    const other = await makeAccount(w, d2, { email: "khac@example.com" });
    const lic = await insertLicense(1, { accountId: acc.accountId, plan: "yearly" });
    const otherLic = await insertLicense(2, { accountId: other.accountId });
    await insertActivation(lic, d1);
    await insertActivation(otherLic, d2);
    await insertTrial(d1, acc.accountId, T0 - DAY, T0 + 9 * DAY);
    await insertTrial(d2, other.accountId);

    const res = await adminCall(`/admin/accounts/${acc.accountId}`);
    expect(res.status).toBe(200);
    const body = res.body as {
      account: Record<string, unknown>;
      licenses: Record<string, unknown>[];
      activations: Record<string, unknown>[];
      trials: Record<string, unknown>[];
    };
    expect(body.account).toMatchObject({
      id: acc.accountId,
      email: "an@example.com",
      created_at: T0,
      last_login_at: T0,
      consent_at: T0,
      lang: "vi",
      trial_started_at: T0 - DAY,
      trial_ends_at: T0 + 9 * DAY,
      deleted_at: null,
      status: "paid",
    });
    expect(body.account).not.toHaveProperty("google_sub");
    expect(body.licenses).toHaveLength(1);
    // `email` của license là email lúc mua (khác email Google của tài khoản): UI hiện cả hai (spec §4).
    expect(body.licenses[0]).toMatchObject({ id: lic, email: "khach@example.com", plan: "yearly", expires_at: T0 + 10 * DAY, revoked_at: null, active_devices: 1 });
    // Key chỉ hiện dạng che (như danh sách license).
    expect(String(body.licenses[0]?.license_key)).toMatch(/\*|…|•/);
    expect(String(body.licenses[0]?.license_key)).not.toContain("K000000000000000000000000000");
    expect(body.activations).toHaveLength(1);
    expect(body.activations[0]).toMatchObject({ license_id: lic, device_id_hash: d1, device_label: expect.any(String), deactivated_at: null });
    expect(body.trials).toEqual([{ device_id_hash: d1, started_at: T0 - DAY, ends_at: T0 + 9 * DAY, last_seen_at: T0 - DAY }]);
  });

  it("tài khoản đã xóa vẫn xem được (email null, mốc dùng thử còn); không có thì 404", async () => {
    const { adminCall } = makeAdmin();
    const id = await insertAccount(null, { trialEndsAt: T0 - DAY, deletedAt: T0 - 1 });
    const res = await adminCall(`/admin/accounts/${id}`);
    expect(res.status).toBe(200);
    expect((res.body as { account: Record<string, unknown> }).account).toMatchObject({ email: null, deleted_at: T0 - 1, status: "deleted", trial_ends_at: T0 - DAY });
    expect(await adminCall(`/admin/accounts/${crypto.randomUUID()}`)).toMatchObject({ status: 404, body: { error: "account_not_found" } });
  });

  it("ghi account_viewed với account_id, không kèm email", async () => {
    const { adminCall } = makeAdmin();
    const id = await insertAccount("bi.mat@example.com");
    await adminCall(`/admin/accounts/${id}`);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "admin:ops@example.com", action: "account_viewed" });
    expect(JSON.parse(rows[0]!.detail!)).toEqual({ account_id: id });
    expect(JSON.stringify(rows)).not.toContain("bi.mat");
  });
});

describe("POST /admin/accounts/:id/unlink-license", () => {
  it("gỡ license khỏi tài khoản và ghi audit_log (account_license_unlinked) kèm license_id", async () => {
    const { adminCall } = makeAdmin();
    const acc = await insertAccount("an@example.com");
    const lic = await insertLicense(1, { accountId: acc });
    const keep = await insertLicense(2, { accountId: acc });
    const res = await adminCall(`/admin/accounts/${acc}/unlink-license`, { body: { license_id: lic, note: "khách báo gắn nhầm" } });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await env.DB.prepare("SELECT id, account_id FROM licenses ORDER BY id").all()).toMatchObject({
      results: [
        { id: lic, account_id: null },
        { id: keep, account_id: acc },
      ],
    });
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "admin:ops@example.com", action: "account_license_unlinked", license_id: lic });
    expect(JSON.parse(rows[0]!.detail!)).toEqual({ account_id: acc, note: "khách báo gắn nhầm" });
    // License giờ gắn được vào tài khoản khác (đường 409 license_linked_other_account của app đã được giải).
    expect(await adminCall(`/admin/accounts/${acc}/unlink-license`, { body: { license_id: lic } })).toMatchObject({ status: 404, body: { error: "license_not_linked" } });
  });

  it("license gắn tài khoản khác, chưa gắn hay không có thì 404, không đổi gì, không ghi nhật ký", async () => {
    const { adminCall } = makeAdmin();
    const a = await insertAccount("a@example.com");
    const b = await insertAccount("b@example.com");
    const ofB = await insertLicense(1, { accountId: b });
    const free = await insertLicense(2);
    for (const license_id of [ofB, free, crypto.randomUUID()]) {
      expect(await adminCall(`/admin/accounts/${a}/unlink-license`, { body: { license_id } })).toMatchObject({ status: 404, body: { error: "license_not_linked" } });
    }
    expect((await env.DB.prepare("SELECT account_id FROM licenses WHERE id = ?").bind(ofB).first())?.account_id).toBe(b);
    expect(await auditRows()).toEqual([]);
  });

  it("body sai thì 400; note sai (không phải chuỗi 1..500 ký tự) thì 400", async () => {
    const { adminCall } = makeAdmin();
    const a = await insertAccount("a@example.com");
    const lic = await insertLicense(1, { accountId: a });
    for (const body of [{}, { license_id: 5 }, { license_id: "" }, { license_id: "x".repeat(65) }, { license_id: lic, note: 5 }, { license_id: lic, note: "x".repeat(501) }, { license_id: lic, note: "  " }]) {
      expect(await adminCall(`/admin/accounts/${a}/unlink-license`, { body }), JSON.stringify(body)).toMatchObject({ status: 400, body: { error: "invalid_request" } });
    }
    expect((await env.DB.prepare("SELECT account_id FROM licenses").first())?.account_id).toBe(a);
    expect(await auditRows()).toEqual([]);
  });

  it("ghi nhật ký hỏng thì không gỡ gì", async () => {
    const { withFailingInsert } = await import("./db");
    const { adminCall } = makeAdmin();
    const a = await insertAccount("a@example.com");
    const lic = await insertLicense(1, { accountId: a });
    const res = await withFailingInsert("audit_log", "NEW.action = 'account_license_unlinked'", () =>
      adminCall(`/admin/accounts/${a}/unlink-license`, { body: { license_id: lic } }),
    );
    expect(res.status).toBe(500);
    expect((await env.DB.prepare("SELECT account_id FROM licenses").first())?.account_id).toBe(a);
  });
});

describe("POST /admin/accounts/:id/anonymize (luật xóa tài khoản, spec §5.5)", () => {
  it("email về NULL, deleted_at = now, gỡ license và máy dùng thử; GIỮ google_sub và mốc dùng thử", async () => {
    const { adminCall } = makeAdmin();
    const d1 = await sha256Hex("d1");
    const acc = await insertAccount("an@example.com", { trialEndsAt: T0 + 5 * DAY });
    const other = await insertAccount("khac@example.com");
    const lic = await insertLicense(1, { accountId: acc });
    const otherLic = await insertLicense(2, { accountId: other });
    await insertTrial(d1, acc, T0 - 5 * DAY, T0 + 5 * DAY);
    const before = await env.DB.prepare("SELECT google_sub, trial_started_at, trial_ends_at, created_at FROM accounts WHERE id = ?").bind(acc).first();

    const res = await adminCall(`/admin/accounts/${acc}/anonymize`, { body: { note: "yêu cầu xóa qua thư hỗ trợ" } });
    expect(res).toEqual({ status: 200, body: { ok: true, changed: true } });

    const row = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(acc).first<Record<string, unknown>>();
    expect(row).toMatchObject({ email: null, deleted_at: T0, ...before });
    expect((await env.DB.prepare("SELECT account_id FROM licenses WHERE id = ?").bind(lic).first())?.account_id).toBeNull();
    // Dòng trials của máy giữ nguyên mốc, chỉ bỏ liên kết tài khoản.
    expect(await env.DB.prepare("SELECT started_at, ends_at, account_id FROM trials").first()).toEqual({ started_at: T0 - 5 * DAY, ends_at: T0 + 5 * DAY, account_id: null });
    // Tài khoản khác không bị chạm.
    expect(await env.DB.prepare("SELECT email, deleted_at FROM accounts WHERE id = ?").bind(other).first()).toEqual({ email: "khac@example.com", deleted_at: null });
    expect((await env.DB.prepare("SELECT account_id FROM licenses WHERE id = ?").bind(otherLic).first())?.account_id).toBe(other);

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "admin:ops@example.com", action: "account_anonymized" });
    expect(JSON.parse(rows[0]!.detail!)).toEqual({ account_id: acc, licenses: 1, trials: 1, note: "yêu cầu xóa qua thư hỗ trợ" });
    expect(JSON.stringify(rows)).not.toContain("an@example.com");
  });

  it("gọi lần hai không đổi gì và không ghi thêm nhật ký", async () => {
    const { adminCall } = makeAdmin();
    const acc = await insertAccount("an@example.com");
    expect(await adminCall(`/admin/accounts/${acc}/anonymize`, { body: { note: "yêu cầu xóa" } })).toEqual({ status: 200, body: { ok: true, changed: true } });
    expect(JSON.parse((await auditRows())[0]!.detail!)).toEqual({ account_id: acc, licenses: 0, trials: 0, note: "yêu cầu xóa" });
    expect(await adminCall(`/admin/accounts/${acc}/anonymize`, { body: { note: "yêu cầu xóa" } })).toEqual({ status: 200, body: { ok: true, changed: false } });
    expect(await auditCount("account_anonymized")).toBe(1);
    // Mốc xóa không bị dời.
    expect((await env.DB.prepare("SELECT deleted_at FROM accounts").first())?.deleted_at).toBe(T0);
  });

  it("note là bắt buộc như /admin/erase: thiếu, rỗng, toàn khoảng trắng, không phải chuỗi hay quá 500 ký tự thì 400 invalid_request, không đổi gì", async () => {
    const { adminCall } = makeAdmin();
    const acc = await insertAccount("an@example.com");
    const lic = await insertLicense(1, { accountId: acc });
    for (const body of [{}, { note: "" }, { note: "   " }, { note: 5 }, { note: null }, { note: "x".repeat(501) }]) {
      expect(await adminCall(`/admin/accounts/${acc}/anonymize`, { body }), JSON.stringify(body)).toEqual({ status: 400, body: { error: "invalid_request" } });
    }
    // Không có body JSON nào cũng 400 (cùng mã với erase).
    expect((await adminCall(`/admin/accounts/${acc}/anonymize`, { method: "POST", rawBody: "" })).status).toBe(400);
    expect(await auditRows()).toEqual([]);
    expect(await env.DB.prepare("SELECT email, deleted_at FROM accounts").first()).toEqual({ email: "an@example.com", deleted_at: null });
    expect((await env.DB.prepare("SELECT account_id FROM licenses WHERE id = ?").bind(lic).first())?.account_id).toBe(acc);
  });

  it("tài khoản không có thì 404, không ghi nhật ký; note sai thì 400", async () => {
    const { adminCall } = makeAdmin();
    expect(await adminCall(`/admin/accounts/${crypto.randomUUID()}/anonymize`, { body: { note: "thử" } })).toMatchObject({ status: 404, body: { error: "account_not_found" } });
    const acc = await insertAccount("an@example.com");
    expect((await adminCall(`/admin/accounts/${acc}/anonymize`, { body: { note: 5 } })).status).toBe(400);
    expect(await auditRows()).toEqual([]);
    expect((await env.DB.prepare("SELECT deleted_at FROM accounts").first())?.deleted_at).toBeNull();
  });

  it("ghi nhật ký hỏng thì không ẩn danh gì", async () => {
    const { withFailingInsert } = await import("./db");
    const { adminCall } = makeAdmin();
    const acc = await insertAccount("an@example.com");
    const lic = await insertLicense(1, { accountId: acc });
    const res = await withFailingInsert("audit_log", "NEW.action = 'account_anonymized'", () => adminCall(`/admin/accounts/${acc}/anonymize`, { body: { note: "thử" } }));
    expect(res.status).toBe(500);
    expect(await env.DB.prepare("SELECT email, deleted_at FROM accounts").first()).toEqual({ email: "an@example.com", deleted_at: null });
    expect((await env.DB.prepare("SELECT account_id FROM licenses WHERE id = ?").bind(lic).first())?.account_id).toBe(acc);
  });
});

describe("GET /admin/accounts/export.csv", () => {
  it("đúng cột email,created_at,last_login_at,plan,trial_ends_at; chỉ tài khoản còn hoạt động; plan là gói đang có hay free", async () => {
    const { adminFetch } = makeAdmin();
    const paid = await insertAccount("paid@example.com", { createdAt: T0 - 3 * DAY, trialEndsAt: T0 + DAY });
    await insertLicense(1, { accountId: paid, plan: "yearly", expiresAt: T0 + 300 * DAY });
    await insertLicense(2, { accountId: paid, plan: "monthly" });
    await insertAccount("free@example.com", { createdAt: T0 - 2 * DAY });
    await insertAccount("ended@example.com", { createdAt: T0 - DAY, trialEndsAt: T0 - 1 });
    await insertAccount(null, { deletedAt: T0 });
    const res = await adminFetch("/admin/accounts/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="accounts-[0-9-]+\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text.split("\r\n")).toEqual([
      "email,created_at,last_login_at,plan,trial_ends_at",
      "paid@example.com,2026-09-28T00:00:00Z,2026-09-28T00:00:00Z,yearly,2026-10-02T00:00:00Z",
      "free@example.com,2026-09-29T00:00:00Z,2026-09-29T00:00:00Z,free,",
      "ended@example.com,2026-09-30T00:00:00Z,2026-09-30T00:00:00Z,free,2026-09-30T23:59:59Z",
      "",
    ]);
  });

  it("email bắt đầu bằng =, +, -, @ không thành công thức; email có dấu phẩy được bọc nháy", async () => {
    const { adminFetch } = makeAdmin();
    let t = T0;
    for (const email of ["=cmd|' /C calc'!A0@x.test", "+1@x.test", "-1@x.test", "@sum@x.test", '"a,b"@x.test']) await insertAccount(email, { createdAt: t++ });
    const text = await (await adminFetch("/admin/accounts/export.csv")).text();
    const lines = text.split("\r\n");
    expect(lines).toContain("'=cmd|' /C calc'!A0@x.test,2026-10-01T00:00:00Z,2026-10-01T00:00:00Z,free,");
    expect(lines).toContain("'+1@x.test,2026-10-01T00:00:01Z,2026-10-01T00:00:01Z,free,");
    expect(lines).toContain("'-1@x.test,2026-10-01T00:00:02Z,2026-10-01T00:00:02Z,free,");
    expect(lines).toContain("'@sum@x.test,2026-10-01T00:00:03Z,2026-10-01T00:00:03Z,free,");
    expect(lines).toContain('"""a,b""@x.test",2026-10-01T00:00:04Z,2026-10-01T00:00:04Z,free,');
    // Mọi dòng dữ liệu: ô đầu không bắt đầu bằng ký tự công thức.
    for (const line of lines.slice(1).filter(Boolean)) expect(line).not.toMatch(/^[=+\-@]/);
  });

  it("ghi audit_log accounts_exported (số dòng, không có dữ liệu hay email)", async () => {
    const { adminFetch } = makeAdmin();
    await insertAccount("bi.mat@example.com");
    await insertAccount("khac@example.com");
    await adminFetch("/admin/accounts/export.csv");
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "admin:ops@example.com", action: "accounts_exported" });
    expect(JSON.parse(rows[0]!.detail!)).toEqual({ count: 2 });
    expect(JSON.stringify(rows)).not.toContain("bi.mat");
    expect(JSON.stringify(rows)).not.toContain("khac@");
  });

  it("ghi nhật ký hỏng thì không trả dữ liệu", async () => {
    const { withFailingInsert } = await import("./db");
    const { adminFetch } = makeAdmin();
    await insertAccount("bi.mat@example.com");
    const res = await withFailingInsert("audit_log", "NEW.action = 'accounts_exported'", () => adminFetch("/admin/accounts/export.csv"));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("bi.mat");
  });

  it("không có tài khoản nào thì chỉ có dòng tiêu đề", async () => {
    const { adminFetch } = makeAdmin();
    expect(await (await adminFetch("/admin/accounts/export.csv")).text()).toBe("email,created_at,last_login_at,plan,trial_ends_at\r\n");
  });
});
