// GET /v1/plans và POST /v1/checkout (§6.8): bảng gói đang bán; tạo đơn, gọi cổng thanh toán,
// trả link, chuỗi VietQR, order_token, và ước tính hạn mới của license khi gia hạn hay đổi gói.
import type { Hono } from "hono";
import type { AppEnv } from "./app";
import { audit } from "./audit";
import { b64urlEncode, randomBytes, sha256Hex } from "./crypto";
import { clientIp, fail, parseEmail, readJson, tooMany } from "./http";
import { normalizeLicenseKey } from "./license-key";
import { computeGrant, isPlan, PLAN_CODES, PLAN_NAMES, parsePlans, type PlanCode } from "./plans";
import { failureBlock, hit, noteFailure } from "./ratelimit";

/** Link thanh toán hết hạn sau 15 phút (`expiredAt` của PayOS); app hỏi trạng thái tối đa bằng thời gian này. */
export const CHECKOUT_TTL_SECONDS = 15 * 60;
/** Một số ngân hàng chỉ nhận mô tả tối đa 9 ký tự (§14 giả định 7): "AT" + tối đa 7 chữ số. */
export const MAX_ORDER_CODE = 9_999_999;
const CURRENCY = "VND";
/** MVP chỉ bán bằng VND qua PayOS; Giai đoạn 2 chọn cổng theo loại tiền. */
const CHECKOUT_PROVIDER = "payos";

/** Mô tả chuyển khoản của đơn: "AT" (AI Translator) + số đơn, tối đa 9 ký tự. */
export function orderDescription(orderCode: number): string {
  return `AT${orderCode}`;
}

export function registerCheckout(app: Hono<AppEnv>) {
  // Bảng gói trả phí cho màn hình Nâng cấp của app (§4.3). Free không có ở đây: hạn mức Free là hằng số phía app.
  app.get("/v1/plans", (c) => {
    const plans = parsePlans(c.env.PLANS);
    if (!plans) return fail(c, 503, "pricing_not_configured");
    return c.json({
      plans: PLAN_CODES.map((code) => ({
        code,
        name: PLAN_NAMES[code],
        quota_minutes_per_cycle: plans[code].quota_minutes_per_cycle,
        days_per_order: plans[code].days_per_order,
        prices: plans[code].prices,
      })),
    });
  });

  app.post("/v1/checkout", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const rl = await hit(c.env, "checkout_ip", clientIp(c), now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);

    const body = await readJson(c);
    if (!body) return fail(c, 400, "invalid_request");
    const { plan, license_key: licenseKeyInput, consent } = body;
    const email = parseEmail(body.email);
    if (!isPlan(plan)) return fail(c, 400, "invalid_request", { field: "plan" });
    if (!email) return fail(c, 400, "invalid_request", { field: "email" });
    if (consent !== true) return fail(c, 400, "invalid_request", { field: "consent" });

    const plans = parsePlans(c.env.PLANS);
    const amount = plans?.[plan].prices[CURRENCY];
    if (!plans || amount === undefined) return fail(c, 503, "pricing_not_configured");

    let renewLicenseId: string | null = null;
    let estimate: ReturnType<typeof computeGrant> | null = null;
    if (licenseKeyInput !== undefined) {
      const wait = await failureBlock(c.env, clientIp(c), now);
      if (wait > 0) return tooMany(c, wait);
      const key = typeof licenseKeyInput === "string" ? normalizeLicenseKey(licenseKeyInput) : null;
      if (!key) {
        await noteFailure(c.env, clientIp(c), now, "checkout");
        return fail(c, 400, "invalid_request", { field: "license_key" });
      }
      const lic = await db
        .prepare("SELECT id, plan, expires_at, cycle_anchor, revoked_at FROM licenses WHERE license_key = ?")
        .bind(key)
        .first<{ id: string; plan: PlanCode; expires_at: number; cycle_anchor: number; revoked_at: number | null }>();
      if (!lic) {
        await noteFailure(c.env, clientIp(c), now, "checkout");
        return fail(c, 404, "invalid_key");
      }
      if (lic.revoked_at !== null) return fail(c, 403, "license_revoked");
      renewLicenseId = lic.id;
      // Ước tính theo lúc tạo đơn; số chính thức tính theo thời điểm thanh toán (QĐ33), chênh nhau tối đa 15 phút.
      estimate = computeGrant(plans, lic, plan, CURRENCY, now);
    }

    const orderToken = b64urlEncode(randomBytes(32));
    const expiresAt = now + CHECKOUT_TTL_SECONDS;
    const row = await db
      .prepare(
        `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email, email_consent_at,
                             renew_license_id, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING order_code`,
      )
      .bind(await sha256Hex(orderToken), CHECKOUT_PROVIDER, plan, amount, CURRENCY, email, now, renewLicenseId, now, expiresAt)
      .first<{ order_code: number }>();
    if (!row) throw new Error("không tạo được đơn");
    const orderCode = row.order_code;
    if (orderCode > MAX_ORDER_CODE) {
      await db.prepare("UPDATE orders SET status = 'failed' WHERE order_code = ?").bind(orderCode).run();
      console.error(JSON.stringify({ event: "order_code_exhausted", order_code: orderCode }));
      return fail(c, 503, "order_code_exhausted");
    }

    const origin = new URL(c.req.url).origin;
    let checkout;
    try {
      checkout = await deps.payments[CHECKOUT_PROVIDER]!.createCheckout({
        orderCode,
        amount,
        currency: CURRENCY,
        description: orderDescription(orderCode),
        returnUrl: `${origin}/v1/pay/return`,
        cancelUrl: `${origin}/v1/pay/cancel`,
        expiresAt,
      });
    } catch (err) {
      await db.prepare("UPDATE orders SET status = 'failed' WHERE order_code = ?").bind(orderCode).run();
      console.error(JSON.stringify({ event: "checkout_failed", order_code: orderCode, error: String(err) }));
      return fail(c, 502, "payment_provider_error");
    }
    await db.prepare("UPDATE orders SET provider_ref = ? WHERE order_code = ?").bind(checkout.providerRef, orderCode).run();
    await audit(db, {
      at: now,
      actor: "api",
      action: "order_created",
      licenseId: renewLicenseId,
      orderCode,
      detail: { plan, amount, currency: CURRENCY },
    });
    const res: Record<string, unknown> = {
      order_code: orderCode,
      order_token: orderToken,
      checkout_url: checkout.checkoutUrl,
      qr_code: checkout.qrCode,
      plan,
      amount,
      currency: CURRENCY,
      expires_at: expiresAt,
    };
    if (estimate) {
      res.license_expires_at = estimate.expires_at;
      res.converted_days = estimate.converted_days;
    }
    return c.json(res, 201);
  });

  // Trang PayOS chuyển về sau khi trả tiền hoặc hủy. App không dựa vào trang này mà tự hỏi trạng thái đơn.
  const page = (vi: string, en: string) =>
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AI Translator</title><p>${vi}</p><p>${en}</p>`;
  app.get("/v1/pay/return", (c) =>
    c.html(page("Đã nhận thanh toán. Hãy quay lại app, app sẽ tự kích hoạt.", "Payment received. Return to the app; it activates automatically.")),
  );
  app.get("/v1/pay/cancel", (c) =>
    c.html(page("Đã hủy thanh toán. Bạn có thể đóng trang này.", "Payment cancelled. You can close this page.")),
  );
}
