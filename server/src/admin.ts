// Worker admin (§6.8 "Công cụ hỗ trợ"): các thao tác của người vận hành và `lookup`. Lớp kiểm Access, danh tính và chống
// CSRF ở admin-auth.ts; route chỉ đọc ở admin-read.ts; trang Web Admin ở admin-assets.ts.
// Mọi thao tác, kể cả tra cứu, đều ghi audit_log với actor "admin:<email người vận hành>". Thao tác thất bại có ý nghĩa
// (cổng thanh toán lỗi, ký thử lỗi, URL webhook bị từ chối, 409) cũng ghi, không kèm câu lỗi gốc. Không ghi: whoami
// (chỉ trả email của chính người vận hành), request không qua Access hay chống CSRF, và các request sai input hay không
// tìm thấy khác (400, 404).
import { type Context, Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { ADMIN_SECURE_HEADERS, registerAssets } from "./admin-assets";
import { type AdminAppEnv, type AdminDeps, crossSite, useAdminAuth } from "./admin-auth";
import { registerAdminRead } from "./admin-read";
import { audit, auditIfChanged, auditStatement } from "./audit";
import { sendLicenseMail } from "./deps";
import type { AdminEnv } from "./env";
import { fail, isRecord, parseDeviceIdHash, parseEmail, parseUuid, readJson } from "./http";
import { formatLicenseKey, generateLicenseKey, normalizeLicenseKey } from "./license-key";
import { grantOrder, loadOrder, mailGranted, settledResult } from "./orders";
import { PaymentProviderError } from "./payment/provider";
import { computeGrant, isPlan, PLAN_NAMES, type PlanCode, type PlanTable, parsePlans } from "./plans";
import type { KeyCheck } from "./token";

function parseNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const note = v.trim();
  return note.length > 0 && note.length <= 500 ? note : null;
}

/** Một license và mọi đơn đã áp hay đang áp vào nó (license_id hoặc renew_license_id), cho `lookup` theo key hay id. */
async function licenseWithOrders(db: D1Database, id: string) {
  const orders = (
    await db.prepare("SELECT * FROM orders WHERE license_id = ?1 OR renew_license_id = ?1 ORDER BY order_code").bind(id).all()
  ).results;
  return { licenseIds: [id], orders };
}

export function createAdminApp(makeDeps: (env: AdminEnv) => AdminDeps) {
  const app = new Hono<AdminAppEnv>();
  // Đứng trước lớp kiểm Access để cả phản hồi 403 cũng có header bảo mật.
  app.use("*", secureHeaders(ADMIN_SECURE_HEADERS));
  // Dữ liệu của /admin/* có email khách: không để trình duyệt hay proxy giữ lại (kể cả 403, 404).
  app.use("/admin/*", async (c, next) => {
    await next();
    c.header("cache-control", "no-store");
  });
  useAdminAuth(app, makeDeps);
  registerAdminRead(app);

  /** Bảng gói lấy từ Worker API; thiếu hay sai thì null (route trả 503 pricing_not_configured). */
  async function plansOf(c: Context<AdminAppEnv>): Promise<PlanTable | null> {
    return parsePlans(await c.get("deps").plans());
  }

  /** Đọc body có `note` bắt buộc (lý do thao tác, để ghi nhật ký). */
  async function noteBody(c: Context) {
    const body = await readJson(c);
    const note = parseNote(body?.note);
    return body && note ? { body, note } : null;
  }

  // Để kiểm Access bằng trình duyệt: không trả dữ liệu nào ngoài email của chính người vận hành.
  app.get("/admin/whoami", (c) => c.json({ operator: c.get("actor").slice("admin:".length) }));

  // Tra cứu bằng POST: email nằm trong body, không nằm trong URL (URL có thể lọt vào log).
  app.post("/admin/lookup", async (c) => {
    const db = c.env.DB;
    const body = await readJson(c);
    let licenseIds: string[] = [];
    let orders: Record<string, unknown>[] = [];
    let by: "email" | "order_code" | "device" | "license_key" | "license_id";
    let orderCode: number | null = null;
    // Tra theo máy (spec 2026-10-07 §3.1): dùng thử của máy và các license từng kích hoạt trên máy. Chỉ đọc.
    let trial: Record<string, unknown> | null | undefined;
    if (body?.device_id_hash !== undefined) {
      const d = parseDeviceIdHash(body.device_id_hash);
      if (!d) return fail(c, 400, "invalid_request", { field: "device_id_hash" });
      by = "device";
      trial = await db.prepare("SELECT started_at, ends_at, last_seen_at FROM trials WHERE device_id_hash = ?").bind(d).first();
      const acts = await db
        .prepare("SELECT DISTINCT license_id FROM activations WHERE device_id_hash = ? ORDER BY license_id")
        .bind(d)
        .all<{ license_id: string }>();
      licenseIds = acts.results.map((r) => r.license_id);
    } else if (body?.license_key !== undefined) {
      const key = typeof body.license_key === "string" ? normalizeLicenseKey(body.license_key) : null;
      if (!key) return fail(c, 400, "invalid_request", { field: "license_key" });
      by = "license_key";
      const found = await db.prepare("SELECT id FROM licenses WHERE license_key = ?").bind(key).first<{ id: string }>();
      if (found) ({ licenseIds, orders } = await licenseWithOrders(db, found.id));
    } else if (body?.license_id !== undefined) {
      const id = parseUuid(body.license_id);
      if (!id) return fail(c, 400, "invalid_request", { field: "license_id" });
      by = "license_id";
      const found = await db.prepare("SELECT id FROM licenses WHERE id = ?").bind(id).first<{ id: string }>();
      if (found) ({ licenseIds, orders } = await licenseWithOrders(db, found.id));
    } else if (body?.email !== undefined) {
      const e = parseEmail(body.email);
      if (!e) return fail(c, 400, "invalid_request", { field: "email" });
      by = "email";
      orders = (await db.prepare("SELECT * FROM orders WHERE email = ? ORDER BY order_code").bind(e).all()).results;
      const lic = await db.prepare("SELECT id FROM licenses WHERE email = ?").bind(e).all<{ id: string }>();
      licenseIds = lic.results.map((r) => r.id);
    } else if (Number.isSafeInteger(body?.order_code) && (body?.order_code as number) > 0) {
      by = "order_code";
      orderCode = body?.order_code as number;
      orders = (await db.prepare("SELECT * FROM orders WHERE order_code = ?").bind(orderCode).all()).results;
    } else {
      return fail(c, 400, "invalid_request", { field: "email|order_code|device_id_hash" });
    }
    for (const o of orders) {
      for (const k of ["license_id", "renew_license_id"]) {
        const id = o[k];
        if (typeof id === "string" && !licenseIds.includes(id)) licenseIds.push(id);
      }
      delete o.order_token_hash;
    }
    const licenses = [];
    for (const id of licenseIds) {
      const lic = await db.prepare("SELECT * FROM licenses WHERE id = ?").bind(id).first<Record<string, unknown>>();
      if (!lic) continue;
      const acts = await db.prepare("SELECT * FROM activations WHERE license_id = ? ORDER BY created_at").bind(id).all();
      const log = await db
        .prepare("SELECT at, actor, action, order_code, detail FROM audit_log WHERE license_id = ? ORDER BY id DESC LIMIT 50")
        .bind(id)
        .all();
      licenses.push({
        ...lic,
        license_key: formatLicenseKey(String(lic.license_key)),
        // Xung đột: từ 2 máy đang kích hoạt (spec 2026-10-07 §4.1). Gỡ máy bằng thao tác gỡ activation sẵn có.
        conflict: acts.results.filter((a) => a.deactivated_at === null).length > 1,
        activations: acts.results,
        audit: log.results,
      });
    }
    await audit(db, {
      at: c.get("deps").now(),
      actor: c.get("actor"),
      action: "lookup",
      orderCode,
      detail:
        trial === undefined
          ? { by, licenses: licenses.length, orders: orders.length }
          : { by, licenses: licenses.length, trial: trial !== null },
    });
    return c.json(trial === undefined ? { licenses, orders } : { licenses, orders, trial });
  });

  // GET nhưng có tác dụng phụ (ghi nhật ký, gọi PayOS): chặn request mà trình duyệt báo là từ trang khác.
  app.get("/admin/orders/:orderCode/payment-status", async (c) => {
    if (crossSite(c)) return fail(c, 403, "forbidden");
    const deps = c.get("deps");
    const orderCode = Number(c.req.param("orderCode"));
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0) return fail(c, 400, "invalid_request");
    const order = await loadOrder(c.env.DB, orderCode);
    if (!order) return fail(c, 404, "order_not_found");
    const provider = Object.hasOwn(deps.payments, order.provider) ? deps.payments[order.provider] : undefined;
    if (!provider) return fail(c, 502, "payment_provider_error", { message: `không có cổng ${order.provider}` });
    await audit(c.env.DB, { at: deps.now(), actor: c.get("actor"), action: "payment_status_viewed", orderCode });
    try {
      return c.json(await provider.getPaymentStatus(orderCode));
    } catch (err) {
      return fail(c, 502, "payment_provider_error", { message: String(err) });
    }
  });

  // Cấp tay cho đơn đã có, ví dụ khách chuyển thiếu rồi chuyển bù (§6.8, §9). Cùng luật mua thêm và đổi gói
  // với webhook (grantOrder); "hiện tại" là lúc thao tác, kể cả với đơn underpaid đã chuyển bù (spec §6.8, QĐ33).
  app.post("/admin/orders/:orderCode/grant", async (c) => {
    const deps = c.get("deps");
    const input = await noteBody(c);
    const orderCode = Number(c.req.param("orderCode"));
    if (!input || !Number.isSafeInteger(orderCode)) return fail(c, 400, "invalid_request");
    const now = deps.now();
    const order = await loadOrder(c.env.DB, orderCode);
    if (!order) return fail(c, 404, "order_not_found");
    const plans = await plansOf(c);
    if (!plans) return fail(c, 503, "pricing_not_configured");
    const granted = await grantOrder(c.env.DB, plans, order, {
      now,
      paidAt: now,
      amountPaid: order.amount_paid,
      actor: c.get("actor"),
    });
    // Đơn đã khép thì không cấp tay được. Nhãn như FulfilResult: already_paid (đơn đã cấp), already_settled (đã hoàn
    // tiền), needs_review (đang chờ xử lý, QĐ37). Lần cấp tay làm đơn chuyển sang paid_needs_review (license của đơn đã bị
    // thu hồi) cũng trả needs_review; xử lý bằng /resolve.
    if (granted === "already_settled" || granted === "needs_review") {
      const status = granted === "needs_review" ? "paid_needs_review" : ((await loadOrder(c.env.DB, orderCode))?.status ?? "");
      const error = granted === "needs_review" ? "needs_review" : settledResult(status);
      await audit(c.env.DB, {
        at: now,
        actor: c.get("actor"),
        action: "order_grant_rejected",
        orderCode,
        detail: { error, status, note: input.note },
      });
      return c.json({ error, status }, 409);
    }
    await audit(c.env.DB, {
      at: now,
      actor: c.get("actor"),
      action: "order_granted_manually",
      licenseId: granted.licenseId,
      orderCode,
      detail: { note: input.note },
    });
    await mailGranted(c.env.DB, deps, c.env.ENVIRONMENT, order, granted);
    return c.json({
      license_id: granted.licenseId,
      license_key: formatLicenseKey(granted.licenseKey),
      plan: granted.plan,
      expires_at: granted.expiresAt,
      grant_kind: granted.kind,
      converted_days: granted.convertedDays,
    });
  });

  // Xử lý đơn paid_needs_review (license đã thu hồi mà nhận được tiền, QĐ37). Hai cách:
  // - "grant_new_license": cấp một license mới cho đơn (key mới, gói của đơn, số ngày của gói từ lúc thao tác), gửi key
  //   qua email;
  //   license đã thu hồi giữ nguyên;
  // - "refunded": ghi là đã hoàn tiền ngoài hệ thống; đơn thành refunded.
  app.post("/admin/orders/:orderCode/resolve", async (c) => {
    const deps = c.get("deps");
    const input = await noteBody(c);
    const orderCode = Number(c.req.param("orderCode"));
    const action = input?.body.action;
    if (!input || !Number.isSafeInteger(orderCode) || (action !== "grant_new_license" && action !== "refunded")) {
      return fail(c, 400, "invalid_request");
    }
    const now = deps.now();
    const db = c.env.DB;
    const order = await loadOrder(db, orderCode);
    if (!order) return fail(c, 404, "order_not_found");
    /** 409: đơn không ở trạng thái chờ xử lý, hay vừa được xử lý ở một lần thao tác chạy cùng lúc. Ghi nhật ký rồi trả. */
    const rejected = async (status: string) => {
      await audit(db, {
        at: now,
        actor: c.get("actor"),
        action: "order_resolve_rejected",
        orderCode,
        detail: { action, error: "not_needs_review", status, note: input.note },
      });
      return c.json({ error: "not_needs_review", status }, 409);
    };
    if (order.status !== "paid_needs_review") return rejected(order.status);
    if (action === "refunded") {
      const [res] = await db.batch([
        db.prepare("UPDATE orders SET status = 'refunded' WHERE order_code = ? AND status = 'paid_needs_review'").bind(orderCode),
        // Hai lần thao tác chạy cùng lúc: chỉ lần đổi được trạng thái mới ghi nhật ký.
        auditIfChanged(db, {
          at: now,
          actor: c.get("actor"),
          action: "order_refunded_outside",
          licenseId: order.renew_license_id,
          orderCode,
          detail: { note: input.note },
        }),
      ]);
      if (res?.meta.changes !== 1) return rejected((await loadOrder(db, orderCode))?.status ?? "");
      return c.json({ order_code: orderCode, status: "refunded" });
    }
    const plans = await plansOf(c);
    if (!plans) return fail(c, 503, "pricing_not_configured");
    const granted = await grantOrder(db, plans, order, {
      now,
      paidAt: now,
      amountPaid: order.amount_paid,
      actor: c.get("actor"),
      resolveAsNewLicense: true,
    });
    if (typeof granted === "string") return rejected((await loadOrder(db, orderCode))?.status ?? "");
    await audit(db, {
      at: now,
      actor: c.get("actor"),
      action: "order_review_granted",
      licenseId: granted.licenseId,
      orderCode,
      detail: { revoked_license_id: order.renew_license_id, note: input.note },
    });
    await mailGranted(db, deps, c.env.ENVIRONMENT, order, granted);
    return c.json({
      order_code: orderCode,
      status: "paid",
      license_id: granted.licenseId,
      license_key: formatLicenseKey(granted.licenseKey),
      plan: granted.plan,
      expires_at: granted.expiresAt,
    });
  });

  // Cấp license mới không qua đơn (ví dụ bù cho khách), gửi key qua email.
  app.post("/admin/licenses", async (c) => {
    const deps = c.get("deps");
    const input = await noteBody(c);
    const email = parseEmail(input?.body.email);
    const plan = input?.body.plan;
    if (!input || !email || !isPlan(plan)) return fail(c, 400, "invalid_request");
    const plans = await plansOf(c);
    if (!plans) return fail(c, 503, "pricing_not_configured");
    const now = deps.now();
    const id = crypto.randomUUID();
    const key = generateLicenseKey();
    const terms = computeGrant(plans, null, plan, "VND", now);
    const expiresAt = terms.expires_at;
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(id, key, email, plan, expiresAt, terms.cycle_anchor, now, now),
      auditStatement(c.env.DB, {
        at: now,
        actor: c.get("actor"),
        action: "license_issued_manually",
        licenseId: id,
        detail: { plan, note: input.note },
      }),
    ]);
    await sendLicenseMail(c.env.DB, deps, email, "purchase", [{ licenseKey: key, planName: PLAN_NAMES[plan], expiresAt }]);
    return c.json({ license_id: id, license_key: formatLicenseKey(key), plan, expires_at: expiresAt }, 201);
  });

  // Gia hạn tay N ngày, giữ gói. Như mua thêm cùng gói: license đã hết hạn thì cộng từ bây giờ và đặt lại cycle_anchor.
  app.post("/admin/licenses/:id/extend", async (c) => {
    const deps = c.get("deps");
    const input = await noteBody(c);
    const days = input?.body.days;
    if (!input || !Number.isSafeInteger(days) || (days as number) < 1 || (days as number) > 3650) {
      return fail(c, 400, "invalid_request");
    }
    const now = deps.now();
    const id = c.req.param("id");
    const [res] = await c.env.DB.batch([
      // Vế phải của SET dùng giá trị cũ của dòng, nên CASE so với expires_at trước khi cộng.
      c.env.DB.prepare(
        `UPDATE licenses SET cycle_anchor = CASE WHEN expires_at <= ?1 THEN ?1 ELSE cycle_anchor END,
                anchor_applied_at = CASE WHEN expires_at <= ?1 THEN ?1 ELSE anchor_applied_at END,
                expires_at = MAX(expires_at, ?1) + ?2, version = version + 1 WHERE id = ?3`,
      ).bind(now, (days as number) * 86400, id),
      auditIfChanged(c.env.DB, {
        at: now,
        actor: c.get("actor"),
        action: "license_extended_manually",
        licenseId: id,
        detail: { days, note: input.note },
      }),
    ]);
    if (res?.meta.changes !== 1) return fail(c, 404, "not_found");
    const lic = await c.env.DB.prepare("SELECT expires_at, cycle_anchor FROM licenses WHERE id = ?")
      .bind(id)
      .first<{ expires_at: number; cycle_anchor: number }>();
    return c.json({ license_id: id, expires_at: lic?.expires_at, cycle_anchor: lic?.cycle_anchor });
  });

  /** Thao tác một câu UPDATE trên license kèm nhật ký: unlock, revoke. Câu UPDATE không đổi dòng nào thì không ghi nhật ký. */
  function licenseAction(path: string, action: string, sql: string) {
    app.post(`/admin/licenses/:id/${path}`, async (c) => {
      const input = await noteBody(c);
      if (!input) return fail(c, 400, "invalid_request");
      const now = c.get("deps").now();
      const id = c.req.param("id");
      const [res] = await c.env.DB.batch([
        c.env.DB.prepare(sql).bind(now, id),
        auditIfChanged(c.env.DB, { at: now, actor: c.get("actor"), action, licenseId: id, detail: { note: input.note } }),
      ]);
      if (res?.meta.changes !== 1) return fail(c, 404, "not_found");
      return c.json({ ok: true });
    });
  }
  // Mở khóa: các lần gỡ trước lúc mở khóa không còn tính vào ngưỡng 2 lần gỡ/30 ngày.
  // Chỉ khi key đang bị khóa; không thì không có gì để gỡ, không đặt lại lock_cleared_at và không ghi nhật ký.
  licenseAction(
    "unlock",
    "license_unlocked",
    "UPDATE licenses SET locked_at = NULL, lock_cleared_at = ?1 WHERE id = ?2 AND locked_at IS NOT NULL",
  );
  licenseAction("revoke", "license_revoked", "UPDATE licenses SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL");

  app.post("/admin/licenses/:id/resend", async (c) => {
    const deps = c.get("deps");
    const id = c.req.param("id");
    const lic = await c.env.DB.prepare("SELECT license_key, email, plan, expires_at FROM licenses WHERE id = ?")
      .bind(id)
      .first<{ license_key: string; email: string | null; plan: PlanCode; expires_at: number }>();
    if (!lic) return fail(c, 404, "not_found");
    if (!lic.email) return fail(c, 400, "invalid_request", { field: "email" });
    const { ok: sent } = await sendLicenseMail(c.env.DB, deps, lic.email, "resend", [
      { licenseKey: lic.license_key, planName: PLAN_NAMES[lic.plan], expiresAt: lic.expires_at },
    ]);
    await audit(c.env.DB, { at: deps.now(), actor: c.get("actor"), action: "key_resent", licenseId: id, detail: { sent } });
    return sent ? c.json({ ok: true }) : fail(c, 502, "temporarily_unavailable");
  });

  app.post("/admin/activations/:id/deactivate", async (c) => {
    const input = await noteBody(c);
    if (!input) return fail(c, 400, "invalid_request");
    const now = c.get("deps").now();
    const id = c.req.param("id");
    const act = await c.env.DB.prepare("SELECT license_id FROM activations WHERE id = ? AND deactivated_at IS NULL")
      .bind(id)
      .first<{ license_id: string }>();
    if (!act) return fail(c, 404, "activation_not_found");
    // by = 'admin' nên không tính vào ngưỡng khóa tạm. Dòng activation giữ lại (QĐ35).
    // Hai lần gỡ chạy cùng lúc: chỉ lần đổi được dòng activation mới ghi deactivations và nhật ký.
    const [, gone] = await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO deactivations (license_id, activation_id, at, by)
         SELECT ?1, ?2, ?3, 'admin' WHERE EXISTS (SELECT 1 FROM activations WHERE id = ?2 AND deactivated_at IS NULL)`,
      ).bind(act.license_id, id, now),
      c.env.DB.prepare("UPDATE activations SET deactivated_at = ?, deactivated_by = 'admin' WHERE id = ? AND deactivated_at IS NULL").bind(now, id),
      auditIfChanged(c.env.DB, {
        at: now,
        actor: c.get("actor"),
        action: "deactivated_by_admin",
        licenseId: act.license_id,
        detail: { activation_id: id, note: input.note },
      }),
    ]);
    if (gone?.meta.changes !== 1) return fail(c, 404, "activation_not_found");
    return c.json({ ok: true });
  });

  // Reset hạn mức của một máy (QĐ35): tăng quota_epoch và đánh dấu "đang chờ". Token đầu tiên cấp sau đó mở cửa sổ
  // quota_fresh 15 phút (src/licenses.ts). Ở lần validate sau, app nhận epoch mới và bắt đầu bộ đếm mới.
  // Chỉ làm khi khách liên hệ, ví dụ mất bản ghi bộ đếm.
  app.post("/admin/activations/:id/reset-quota", async (c) => {
    const input = await noteBody(c);
    if (!input) return fail(c, 400, "invalid_request");
    const now = c.get("deps").now();
    const id = c.req.param("id");
    const db = c.env.DB;
    // Nhật ký cùng batch với lệnh ghi, lấy license_id và quota_epoch mới từ chính dòng vừa đổi.
    const [updated] = await db.batch([
      db
        .prepare(
          `UPDATE activations SET quota_epoch = quota_epoch + 1, epoch_pending = 1, epoch_window_start = NULL
           WHERE id = ? RETURNING license_id, quota_epoch`,
        )
        .bind(id),
      db
        .prepare(
          `INSERT INTO audit_log (at, actor, action, license_id, detail)
           SELECT ?1, ?2, 'quota_reset', license_id, json_object('activation_id', id, 'quota_epoch', quota_epoch, 'note', ?3)
           FROM activations WHERE id = ?4 AND changes() = 1`,
        )
        .bind(now, c.get("actor"), input.note, id),
    ]);
    const row = (updated?.results as { license_id: string; quota_epoch: number }[] | undefined)?.[0];
    if (!row) return fail(c, 404, "activation_not_found");
    return c.json({ activation_id: id, quota_epoch: row.quota_epoch });
  });

  // Ký thử một token bằng khóa dự phòng (spec §6.8, §10.2; QĐ31). Người vận hành kiểm token này bằng
  // scripts/verify-token.mjs với keys/public-keys.json. Token không dùng được làm bản quyền.
  app.post("/admin/keys/test-sign", async (c) => {
    let check: KeyCheck;
    try {
      check = await c.get("deps").keyCheck();
    } catch (err) {
      // Nhật ký không chép câu lỗi: lỗi đọc JWK (JSON.parse) có thể trích một đoạn secret. Câu lỗi chỉ trả cho người vận hành.
      await audit(c.env.DB, { at: c.get("deps").now(), actor: c.get("actor"), action: "key_check_failed" });
      return fail(c, 503, "key_check_failed", { message: String(err) });
    }
    await audit(c.env.DB, {
      at: c.get("deps").now(),
      actor: c.get("actor"),
      action: "key_check_signed",
      detail: { slot: check.slot, kid: check.kid },
    });
    return c.json(check);
  });

  // Q9: ẩn danh dữ liệu cá nhân theo email. Giữ đơn hàng ở mức kế toán cần (số tiền, ngày, gói, mã đơn),
  // bỏ email và device_label. License vẫn dùng được nhưng không khôi phục được qua email nữa.
  app.post("/admin/erase", async (c) => {
    const input = await noteBody(c);
    const email = parseEmail(input?.body.email);
    if (!input || !email) return fail(c, 400, "invalid_request");
    const now = c.get("deps").now();
    const db = c.env.DB;
    const activationsOf = "device_label IS NOT NULL AND license_id IN (SELECT id FROM licenses WHERE email = ?3)";
    // Nhật ký đứng đầu batch (cùng transaction), đếm đúng các dòng ba câu sau sẽ đổi; ghi nhật ký lỗi thì không xóa gì.
    const [, acts, lics, ords] = await db.batch([
      db
        .prepare(
          `INSERT INTO audit_log (at, actor, action, detail)
           SELECT ?1, ?2, 'personal_data_erased', json_object(
             'activations', (SELECT COUNT(*) FROM activations WHERE ${activationsOf}),
             'licenses', (SELECT COUNT(*) FROM licenses WHERE email = ?3),
             'orders', (SELECT COUNT(*) FROM orders WHERE email = ?3),
             'note', ?4)`,
        )
        .bind(now, c.get("actor"), email, input.note),
      db.prepare(`UPDATE activations SET device_label = NULL WHERE ${activationsOf.replaceAll("?3", "?")}`).bind(email),
      db.prepare("UPDATE licenses SET email = NULL WHERE email = ?").bind(email),
      db.prepare("UPDATE orders SET email = NULL WHERE email = ?").bind(email),
    ]);
    const counts = { activations: acts?.meta.changes ?? 0, licenses: lics?.meta.changes ?? 0, orders: ords?.meta.changes ?? 0 };
    return c.json(counts);
  });

  // Chỉ nhận URL webhook trên đúng Worker API của môi trường này (API_ORIGIN), để không ai trỏ webhook đi nơi khác.
  app.post("/admin/payos/confirm-webhook", async (c) => {
    const body = await readJson(c);
    const raw = isRecord(body) && typeof body.webhook_url === "string" ? body.webhook_url : "";
    let url: URL | null = null;
    try {
      url = new URL(raw);
    } catch {
      url = null;
    }
    const apiOrigin = c.env.API_ORIGIN ?? "";
    // URL.origin bỏ qua phần userinfo ("user:pass@"), nên phải kiểm riêng.
    if (
      !url ||
      !apiOrigin ||
      url.origin !== apiOrigin ||
      url.username ||
      url.password ||
      url.pathname !== "/v1/webhooks/payos" ||
      url.search ||
      url.hash
    ) {
      // Không ghi URL bị từ chối: có thể chứa userinfo ("user:pass@").
      await audit(c.env.DB, {
        at: c.get("deps").now(),
        actor: c.get("actor"),
        action: "payos_webhook_confirm_failed",
        detail: { reason: "invalid_webhook_url" },
      });
      return fail(c, 400, "invalid_request", { field: "webhook_url" });
    }
    try {
      await c.get("deps").payos.confirmWebhook(url.href);
    } catch (err) {
      // URL đã kiểm (đúng API_ORIGIN, không userinfo). Ghi mã lỗi của cổng, không ghi câu lỗi (`desc` của PayOS).
      const pe = err instanceof PaymentProviderError ? err : null;
      await audit(c.env.DB, {
        at: c.get("deps").now(),
        actor: c.get("actor"),
        action: "payos_webhook_confirm_failed",
        detail: {
          reason: "payment_provider_error",
          url: url.href,
          ...(pe?.httpStatus !== undefined ? { http_status: pe.httpStatus } : {}),
          ...(pe?.code !== undefined ? { provider_code: pe.code } : {}),
        },
      });
      return fail(c, 502, "payment_provider_error", { message: String(err) });
    }
    await audit(c.env.DB, {
      at: c.get("deps").now(),
      actor: c.get("actor"),
      action: "payos_webhook_confirmed",
      detail: { url: url.href },
    });
    return c.json({ ok: true, webhook_url: url.href });
  });

  registerAssets(app);
  app.notFound((c) => fail(c, 404, "not_found"));
  app.onError((err, c) => {
    console.error(JSON.stringify({ event: "admin_unhandled", name: err.name, message: err.message }));
    return fail(c, 500, "internal");
  });
  return app;
}
