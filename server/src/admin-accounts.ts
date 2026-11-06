// Web Admin: tài khoản Google (spec 2026-11-05-dang-nhap-google-design.md §7, §5.5, §8). Cùng Worker admin, sau Access như mọi route /admin/*
// (useAdminAuth gắn cho cả app trước khi gọi hàm đăng ký này).
//   GET  /admin/accounts?q&filter&cursor     danh sách (listRoute): tìm theo một phần email, lọc theo trạng thái
//   GET  /admin/accounts/export.csv          xuất email, created_at, last_login_at, plan, trial_ends_at (ghi nhật ký accounts_exported)
//   GET  /admin/accounts/:id                 chi tiết: license đã gắn, máy, dòng trials
//   POST /admin/accounts/:id/unlink-license  gỡ gắn license (khi app báo 409 license_linked_other_account)
//   POST /admin/accounts/:id/anonymize       xóa/ẩn danh tài khoản theo luật mục 5.5
// Nhật ký (audit_log) mới: account_viewed (xem chi tiết, thuộc VIEW_ACTIONS), account_license_unlinked, account_anonymized, accounts_exported.
// Email KHÔNG BAO GIỜ vào URL, `detail` của nhật ký hay log: tìm theo email qua tham số `q` chỉ dùng để lọc, không ghi lại; nhật ký chỉ có account_id.
// Route /admin/accounts/export.csv phải đăng ký TRƯỚC /admin/accounts/:id, nếu không `:id` nuốt "export.csv".
import type { Hono } from "hono";
import { type AdminAppEnv, crossSite } from "./admin-auth";
import { type Bind, listRoute } from "./admin-read";
import { audit, auditIfChanged } from "./audit";
import { fail, readJson } from "./http";
import { maskLicenseKey } from "./license-key";

type Row = Record<string, unknown>;

/** Trần độ dài chuỗi tìm: email dài tối đa 254 ký tự. */
const MAX_QUERY = 254;
/** Id license/tài khoản chỉ dùng làm tham số bind; chặn chuỗi dài vô lý. */
const MAX_ID = 64;

/** Điều kiện "tài khoản `a` có license đang hiệu lực": chưa thu hồi và chưa hết hạn tại `now` (một tham số bind: now). */
const HAS_PAID = "EXISTS (SELECT 1 FROM licenses pl WHERE pl.account_id = a.id AND pl.revoked_at IS NULL AND pl.expires_at > ?)";

export const ACCOUNT_FILTERS = ["paid", "trial_active", "trial_ended", "deleted"] as const;

/**
 * Trạng thái của tài khoản: mỗi tài khoản đúng một nhóm, ưu tiên deleted > paid > trial_active > trial_ended > none. Bộ lọc `filter` của danh sách
 * (SQL ở dưới) và `status` trả về (hàm này) phải cùng một định nghĩa.
 */
export type AccountStatus = "deleted" | "paid" | "trial_active" | "trial_ended" | "none";

export function accountStatus(a: { deleted_at: unknown; paid_until: unknown; trial_ends_at: unknown }, now: number): AccountStatus {
  if (a.deleted_at !== null) return "deleted";
  if (typeof a.paid_until === "number" && a.paid_until > now) return "paid";
  if (typeof a.trial_ends_at === "number") return a.trial_ends_at > now ? "trial_active" : "trial_ended";
  return "none";
}

/**
 * Một ô CSV an toàn (OWASP "CSV injection"): ký tự đầu là `=`, `+`, `-`, `@`, tab hay CR thì thêm tiền tố `'` để Excel/Sheets không coi là công thức;
 * có dấu phẩy, nháy kép hay xuống dòng thì bọc nháy kép và nhân đôi nháy kép bên trong. Tiền tố áp lên giá trị gốc TRƯỚC khi bọc nháy.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Giây Unix thành "YYYY-MM-DDTHH:MM:SSZ" (UTC); null/không phải số thì chuỗi rỗng. */
function isoOrEmpty(sec: unknown): string {
  return typeof sec === "number" ? new Date(sec * 1000).toISOString().replace(".000Z", "Z") : "";
}

/** `note` bắt buộc (lý do thao tác, cùng luật với `noteBody` của admin.ts): chuỗi 1..500 ký tự sau khi cắt khoảng trắng, sai hay thiếu thì null. */
function requiredNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const note = v.trim();
  return note.length > 0 && note.length <= 500 ? note : null;
}

/** `note` tùy chọn (lý do thao tác): vắng thì {note: undefined}; có thì phải là chuỗi 1..500 ký tự sau khi cắt khoảng trắng, sai thì null. */
function optionalNote(v: unknown): { note: string | undefined } | null {
  if (v === undefined) return { note: undefined };
  if (typeof v !== "string") return null;
  const note = v.trim();
  return note.length > 0 && note.length <= 500 ? { note } : null;
}

export function registerAdminAccounts(app: Hono<AdminAppEnv>): void {
  listRoute(app, "/admin/accounts", {
    resource: "accounts",
    filters(f, now) {
      // Email lưu chữ thường nên chuỗi tìm cũng hạ chữ thường; `instr` thay LIKE để %, _ là ký tự thường. Không ghi `q` vào `f.applied`
      // (nhật ký list_viewed không được chứa email).
      const q = f.get("q");
      if (q !== undefined) {
        const needle = q.trim().toLowerCase();
        if (needle.length > MAX_QUERY) return "q";
        if (needle.length > 0) f.add("instr(a.email, ?) > 0", needle);
      }
      const clauses: Record<string, [string, ...Bind[]]> = {
        paid: [`a.deleted_at IS NULL AND ${HAS_PAID}`, now],
        trial_active: [`a.deleted_at IS NULL AND a.trial_ends_at > ? AND NOT ${HAS_PAID}`, now, now],
        trial_ended: [`a.deleted_at IS NULL AND a.trial_ends_at <= ? AND NOT ${HAS_PAID}`, now, now],
        deleted: ["a.deleted_at IS NOT NULL"],
      };
      return f.oneOf("filter", ACCOUNT_FILTERS, (v) => clauses[v]!) ? null : "filter";
    },
    // Số license: mọi license đang gắn. Số máy: máy khác nhau trong các dòng trials của tài khoản và các máy đang kích hoạt license đã gắn.
    // paid_until (license chưa thu hồi hạn xa nhất) chỉ để tính status ở map, không trả ra.
    select: `SELECT a.id, a.email, a.created_at, a.last_login_at, a.deleted_at, a.trial_started_at, a.trial_ends_at,
      (SELECT COUNT(*) FROM licenses l WHERE l.account_id = a.id) AS license_count,
      (SELECT COUNT(*) FROM (
         SELECT t.device_id_hash FROM trials t WHERE t.account_id = a.id
         UNION
         SELECT ac.device_id_hash FROM activations ac JOIN licenses l ON l.id = ac.license_id WHERE l.account_id = a.id AND ac.deactivated_at IS NULL
       )) AS device_count,
      (SELECT MAX(l.expires_at) FROM licenses l WHERE l.account_id = a.id AND l.revoked_at IS NULL) AS paid_until
      FROM accounts a`,
    order: "ORDER BY a.created_at DESC, a.id DESC",
    cursor(raw) {
      const m = /^(\d{1,15})_([0-9a-f-]{1,64})$/.exec(raw);
      if (!m) return null;
      const t = Number(m[1]);
      return ["(a.created_at < ? OR (a.created_at = ? AND a.id < ?))", t, t, m[2]!];
    },
    next: (r) => `${r.created_at}_${r.id}`,
    map(r, now) {
      const { paid_until, ...rest } = r;
      return { ...rest, status: accountStatus({ deleted_at: r.deleted_at, paid_until, trial_ends_at: r.trial_ends_at }, now) };
    },
  });

  // Xuất CSV cho người vận hành (liên hệ về dịch vụ): chỉ tài khoản còn hoạt động. `plan` là gói của license đang hiệu lực hạn xa nhất, không có thì "free".
  // Nhật ký ghi TRƯỚC khi trả dữ liệu: ghi lỗi thì không có dữ liệu nào ra khỏi server. Nhật ký chỉ có số dòng, không có dữ liệu.
  app.get("/admin/accounts/export.csv", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const now = c.get("deps").now();
    const { results } = await c.env.DB.prepare(
      `SELECT a.email, a.created_at, a.last_login_at, a.trial_ends_at,
         (SELECT l.plan FROM licenses l WHERE l.account_id = a.id AND l.revoked_at IS NULL AND l.expires_at > ?
          ORDER BY l.expires_at DESC, l.id LIMIT 1) AS plan
       FROM accounts a WHERE a.deleted_at IS NULL AND a.email IS NOT NULL ORDER BY a.created_at, a.id`,
    )
      .bind(now)
      .all<Row>();
    await audit(c.env.DB, { at: now, actor: c.get("actor"), action: "accounts_exported", detail: { count: results.length } });
    const lines = [
      "email,created_at,last_login_at,plan,trial_ends_at",
      ...results.map((r) =>
        [String(r.email), isoOrEmpty(r.created_at), isoOrEmpty(r.last_login_at), String(r.plan ?? "free"), isoOrEmpty(r.trial_ends_at)].map(csvCell).join(","),
      ),
    ];
    return c.body(`${lines.join("\r\n")}\r\n`, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="accounts-${new Date(now * 1000).toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    });
  });

  app.get("/admin/accounts/:id", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const db = c.env.DB;
    const now = c.get("deps").now();
    const id = c.req.param("id");
    const account = await db
      .prepare(
        "SELECT id, email, created_at, last_login_at, consent_at, lang, trial_started_at, trial_ends_at, deleted_at FROM accounts WHERE id = ?",
      )
      .bind(id)
      .first<Row>();
    if (!account) return fail(c, 404, "account_not_found");
    const [licenses, activations, trials] = await db.batch<Row>([
      db
        .prepare(
          `SELECT l.id, l.email, l.license_key, l.plan, l.expires_at, l.created_at, l.revoked_at, l.locked_at,
             (SELECT COUNT(*) FROM activations a WHERE a.license_id = l.id AND a.deactivated_at IS NULL) AS active_devices
           FROM licenses l WHERE l.account_id = ? ORDER BY l.created_at, l.id`,
        )
        .bind(id),
      db
        .prepare(
          `SELECT ac.id, ac.license_id, ac.device_id_hash, ac.device_label, ac.created_at, ac.last_validated_at, ac.deactivated_at
           FROM activations ac JOIN licenses l ON l.id = ac.license_id WHERE l.account_id = ? ORDER BY ac.created_at, ac.id`,
        )
        .bind(id),
      db.prepare("SELECT device_id_hash, started_at, ends_at, last_seen_at FROM trials WHERE account_id = ? ORDER BY started_at, device_id_hash").bind(id),
    ]);
    const lics = (licenses?.results ?? []).map((l) => ({ ...l, license_key: maskLicenseKey(String(l.license_key)) }));
    const paidUntil = (licenses?.results ?? []).reduce<number | null>(
      (max, l) => (l.revoked_at === null && typeof l.expires_at === "number" && (max === null || l.expires_at > max) ? l.expires_at : max),
      null,
    );
    await audit(db, { at: now, actor: c.get("actor"), action: "account_viewed", detail: { account_id: id } });
    return c.json({
      account: { ...account, status: accountStatus({ deleted_at: account.deleted_at, paid_until: paidUntil, trial_ends_at: account.trial_ends_at }, now) },
      licenses: lics,
      activations: activations?.results ?? [],
      trials: trials?.results ?? [],
    });
  });

  // Gỡ gắn một license khỏi tài khoản (người vận hành giải 409 license_linked_other_account của app). License không gắn vào đúng tài khoản này
  // (đã gỡ, gắn tài khoản khác, không có) thì 404 và không đổi gì. Nhật ký cùng batch, chỉ ghi khi thật sự gỡ.
  app.post("/admin/accounts/:id/unlink-license", async (c) => {
    const body = await readJson(c);
    const licenseId = typeof body?.license_id === "string" && body.license_id.length > 0 && body.license_id.length <= MAX_ID ? body.license_id : null;
    if (!licenseId) return fail(c, 400, "invalid_request", { field: "license_id" });
    const parsed = optionalNote(body?.note);
    if (!parsed) return fail(c, 400, "invalid_request", { field: "note" });
    const db = c.env.DB;
    const accountId = c.req.param("id");
    const [unlinked] = await db.batch([
      db.prepare("UPDATE licenses SET account_id = NULL WHERE id = ?1 AND account_id = ?2").bind(licenseId, accountId),
      auditIfChanged(db, {
        at: c.get("deps").now(),
        actor: c.get("actor"),
        action: "account_license_unlinked",
        licenseId,
        detail: { account_id: accountId, ...(parsed.note !== undefined ? { note: parsed.note } : {}) },
      }),
    ]);
    if (unlinked?.meta.changes !== 1) return fail(c, 404, "license_not_linked");
    return c.json({ ok: true });
  });

  // Xóa/ẩn danh tài khoản theo luật mục 5.5: email NULL, deleted_at = now, gỡ license và máy dùng thử; GIỮ google_sub, trial_started_at,
  // trial_ends_at (và started_at/ends_at của dòng trials) để xóa rồi đăng nhập lại không có thêm lần dùng thử. `note` bắt buộc như /admin/erase
  // (400 invalid_request không kèm field). Nhật ký đứng đầu batch và đếm đúng các dòng sẽ đổi; tài khoản đã xóa thì không đổi gì và không ghi
  // (`changed: false`).
  app.post("/admin/accounts/:id/anonymize", async (c) => {
    const note = requiredNote((await readJson(c))?.note);
    if (note === null) return fail(c, 400, "invalid_request");
    const db = c.env.DB;
    const id = c.req.param("id");
    const exists = await db.prepare("SELECT 1 AS ok FROM accounts WHERE id = ?").bind(id).first();
    if (!exists) return fail(c, 404, "account_not_found");
    const now = c.get("deps").now();
    const [logged] = await db.batch([
      db
        .prepare(
          `INSERT INTO audit_log (at, actor, action, detail)
           SELECT ?1, ?2, 'account_anonymized', json_object('account_id', ?3,
             'licenses', (SELECT COUNT(*) FROM licenses WHERE account_id = ?3),
             'trials', (SELECT COUNT(*) FROM trials WHERE account_id = ?3),
             'note', ?4)
           WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?3 AND deleted_at IS NULL)`,
        )
        .bind(now, c.get("actor"), id, note),
      db.prepare("UPDATE licenses SET account_id = NULL WHERE account_id = ?").bind(id),
      db.prepare("UPDATE trials SET account_id = NULL WHERE account_id = ?").bind(id),
      db.prepare("UPDATE accounts SET email = NULL, deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL").bind(now, id),
    ]);
    return c.json({ ok: true, changed: logged?.meta.changes === 1 });
  });
}

/**
 * Tài khoản Google có email khớp (cho `Tra cứu` theo email, spec §7). Khớp nguyên email như license và đơn: `email` đã qua parseEmail (chữ thường),
 * `accounts.email` luôn chữ thường; tài khoản đã xóa có email NULL nên không bao giờ khớp. Chỉ trả id, email, hai mốc và trạng thái.
 */
export async function lookupAccountsByEmail(db: D1Database, email: string, now: number): Promise<Row[]> {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.email, a.created_at, a.last_login_at, a.deleted_at, a.trial_ends_at,
         (SELECT MAX(l.expires_at) FROM licenses l WHERE l.account_id = a.id AND l.revoked_at IS NULL) AS paid_until
       FROM accounts a WHERE a.email = ? ORDER BY a.created_at, a.id`,
    )
    .bind(email)
    .all<Row>();
  return results.map((r) => ({
    id: r.id,
    email: r.email,
    created_at: r.created_at,
    last_login_at: r.last_login_at,
    status: accountStatus({ deleted_at: r.deleted_at, paid_until: r.paid_until, trial_ends_at: r.trial_ends_at }, now),
  }));
}
