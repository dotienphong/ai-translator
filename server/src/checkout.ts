// GET /v1/plans và POST /v1/checkout (§6.8): bảng gói và loại tiền đang bán; tạo đơn, gọi cổng thanh toán của loại tiền
// (VND: PayOS, USD: Creem), trả link thanh toán, chuỗi VietQR (null với Creem), order_token, và ước tính hạn mới của license
// khi gia hạn hay đổi gói.
import type { Context, Hono } from "hono";
import { authFailedAlert, raiseAlert } from "./alerts";
import type { AppEnv } from "./app";
import { audit } from "./audit";
import { b64urlEncode, randomBytes, sha256Hex } from "./crypto";
import type { Deps } from "./deps";
import { clientIp, fail, parseEmail, readJson, tooMany } from "./http";
import { parseLang } from "./lang";
import { normalizeLicenseKey } from "./license-key";
import { isProviderAuthFailure } from "./payment/provider";
import {
  computeGrant,
  isPlan,
  LEGACY_PLAN_CODES,
  offeredPlanCodes,
  PLAN_CODES,
  PLAN_NAMES,
  type PlanCode,
  type PlanTable,
  parsePlans,
} from "./plans";
import { failureBlock, hit, noteFailure } from "./ratelimit";

/** Link thanh toán của PayOS hết hạn sau 15 phút (`expiredAt` của PayOS); app hỏi trạng thái tối đa bằng thời gian này. */
export const CHECKOUT_TTL_SECONDS = 15 * 60;
/**
 * Đơn Creem (không có mã QR, khách mở trình duyệt) giữ 30 phút (spec 2026-10-14 D7). App hỏi mỗi 5 giây trong hạn rồi thưa
 * dần tới 24 giờ sau hạn (purchase.rs); test/node/app-server-constants.test.mjs giữ nhịp đó dưới hạn mức `order_poll`. Phiên
 * của Creem sống lâu hơn hạn này (spike S6, đo ở sandbox ngày 2026-10-16: vẫn trả được sau 35,5 phút; server không gửi hạn cho
 * Creem): khách trả muộn vẫn được cấp (webhook, đối soát), gói tính từ giờ trả thật (`paymentTime()` không kẹp đơn Creem về hạn này).
 */
export const CREEM_CHECKOUT_TTL_SECONDS = 30 * 60;
/** Một số ngân hàng chỉ nhận mô tả tối đa 9 ký tự (§14 giả định 7): "AT" + tối đa 7 chữ số. */
export const MAX_ORDER_CODE = 9_999_999;

/**
 * Loại tiền khách chọn và cổng bán loại tiền đó (spec 2026-10-14 §4.3). Thiếu `currency` trong request thì là VND qua PayOS:
 * app ≤ 0.1.9 không gửi và chỉ biết đơn có mã VietQR, nên chỉ app mới khai báo "USD" mới nhận đơn Creem.
 */
const SALES = {
  VND: { provider: "payos", ttl: CHECKOUT_TTL_SECONDS },
  USD: { provider: "creem", ttl: CREEM_CHECKOUT_TTL_SECONDS },
} as const;
export type SaleCurrency = keyof typeof SALES;

/** Mọi loại tiền server có cổng để bán, theo thứ tự của SALES. Nơi khác cần danh sách loại tiền (thống kê) lấy từ đây. */
export const SALE_CURRENCIES: readonly SaleCurrency[] = Object.keys(SALES) as SaleCurrency[];

const isCurrency = (v: unknown): v is SaleCurrency => typeof v === "string" && Object.hasOwn(SALES, v);

/**
 * Luật duy nhất "bán được loại tiền c lúc này", dùng cho cả GET /v1/plans (giá chào, loại tiền gợi ý) và POST /v1/checkout:
 * cổng của loại tiền có mặt (Creem cần khóa API và secret webhook), cổng đang bán (`sells !== false`: Creem cần đủ ba mã sản
 * phẩm), và MỌI gói trong PLANS có giá loại tiền đó.
 */
export function sellableCurrencies(deps: Pick<Deps, "payments">, plans: PlanTable): SaleCurrency[] {
  return SALE_CURRENCIES.filter((currency) => {
    const { provider } = SALES[currency];
    const gateway = Object.hasOwn(deps.payments, provider) ? deps.payments[provider] : undefined;
    if (!gateway || gateway.sells === false) return false;
    return PLAN_CODES.every((code) => Object.hasOwn(plans[code].prices, currency));
  });
}

/**
 * Loại tiền gợi ý cho màn hình Nâng cấp: VND cho khách ở Việt Nam hay khi không biết nước; USD cho khách nước khác, nếu bán
 * được USD. Chỉ là giá trị mặc định: người dùng chọn lại được. Nước lấy từ `request.cf.country` (Cloudflare điền), thiếu thì
 * từ header `CF-IPCountry` (Cloudflare chỉ thêm khi bật managed transform; chưa kiểm chứng client có giả được không, nhưng sai
 * cũng chỉ đổi lựa chọn mặc định).
 */
function suggestedCurrency(c: Context<AppEnv>, offered: SaleCurrency[]): SaleCurrency {
  if (!offered.includes("USD")) return "VND";
  const country = String(c.req.raw.cf?.country ?? c.req.header("cf-ipcountry") ?? "").toUpperCase();
  return country !== "" && country !== "VN" && country !== "XX" ? "USD" : "VND";
}

/** Mô tả chuyển khoản của đơn: "AT" (AI Translator) + số đơn, tối đa 9 ký tự. */
export function orderDescription(orderCode: number): string {
  return `AT${orderCode}`;
}

export function registerCheckout(app: Hono<AppEnv>) {
  // Bảng gói trả phí cho màn hình Nâng cấp của app (§4.3). Free không có ở đây: hạn mức Free là hằng số phía app.
  // `?plans=` là các mã gói app bán được: app cũ không gửi nên chỉ thấy gói cũ (spec 2026-10-13 §2.3).
  app.get("/v1/plans", (c) => {
    const plans = parsePlans(c.env.PLANS);
    if (!plans) return fail(c, 503, "pricing_not_configured");
    // Chỉ trả giá của loại tiền đang bán được (Creem chưa bán thì app không thấy USD). App cũ chỉ đọc `prices.VND`.
    const offered = sellableCurrencies(c.get("deps"), plans);
    return c.json({
      suggested_currency: suggestedCurrency(c, offered),
      plans: offeredPlanCodes(PLAN_CODES, LEGACY_PLAN_CODES, c.req.query("plans")).map((code) => ({
        code,
        name: PLAN_NAMES[code],
        quota_minutes_per_cycle: plans[code].quota_minutes_per_cycle,
        days_per_order: plans[code].days_per_order,
        prices: Object.fromEntries(Object.entries(plans[code].prices).filter(([currency]) => (offered as string[]).includes(currency))),
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
    const currency = body.currency === undefined ? "VND" : body.currency;
    if (!isCurrency(currency)) return fail(c, 400, "invalid_request", { field: "currency" });
    // Ngôn ngữ giao diện app lúc tạo đơn (spec 2026-10-23 §3), lưu để thư gửi key viết bằng ngôn ngữ đó. Thiếu, sai kiểu hay mã lạ
    // (app sau này có thêm ngôn ngữ mà server chưa biết) thì NULL: không bao giờ chặn việc mua vì ngôn ngữ thư.
    const lang = parseLang(body.lang);
    const { provider, ttl } = SALES[currency];

    // Cùng luật với GET /v1/plans: loại tiền không được chào thì không bán (503), kể cả khi app gửi thẳng.
    const plans = parsePlans(c.env.PLANS);
    if (!plans || !sellableCurrencies(deps, plans).includes(currency)) return fail(c, 503, "pricing_not_configured");
    // sellableCurrencies đã bảo đảm có cả hai; kiểm lại chỉ để TypeScript thu hẹp kiểu.
    const amount = plans[plan].prices[currency];
    const gateway = deps.payments[provider];
    if (amount === undefined || !gateway) return fail(c, 503, "pricing_not_configured");

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
      // Ước tính theo lúc tạo đơn; số chính thức tính theo thời điểm thanh toán (QĐ33). PayOS: paymentTime() kẹp trong hạn của đơn,
      // chênh nhau tối đa 15 phút. Creem: không kẹp (phiên vẫn trả được sau hạn của ta, spike S6), chênh nhau bằng độ trễ của khách.
      estimate = computeGrant(plans, lic, plan, currency, now);
    }

    const orderToken = b64urlEncode(randomBytes(32));
    const expiresAt = now + ttl;
    const row = await db
      .prepare(
        `INSERT INTO orders (order_token_hash, provider, plan, amount, currency, email, email_consent_at,
                             renew_license_id, lang, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING order_code`,
      )
      .bind(await sha256Hex(orderToken), provider, plan, amount, currency, email, now, renewLicenseId, lang, now, expiresAt)
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
      checkout = await gateway.createCheckout({
        orderCode,
        amount,
        currency,
        description: orderDescription(orderCode),
        returnUrl: `${origin}/v1/pay/return`,
        cancelUrl: `${origin}/v1/pay/cancel`,
        expiresAt,
        plan,
        email,
      });
    } catch (err) {
      await db.prepare("UPDATE orders SET status = 'failed' WHERE order_code = ?").bind(orderCode).run();
      console.error(JSON.stringify({ event: "checkout_failed", order_code: orderCode, provider, error: String(err) }));
      // Khóa API bị từ chối: mọi đơn mới của cổng này sẽ lỗi cho tới khi thay khóa, nên báo người vận hành (loại theo cổng). Cảnh báo
      // chỉ là phụ: lỗi ghi cảnh báo (D1) chỉ vào log, không bao giờ đổi phản hồi trả khách (luôn 502 payment_provider_error).
      const kind = authFailedAlert(provider);
      if (kind !== null && isProviderAuthFailure(err)) {
        try {
          await raiseAlert(db, kind, now);
        } catch (alertErr) {
          console.error(JSON.stringify({ event: "checkout_alert_failed", order_code: orderCode, provider, error: String(alertErr) }));
        }
      }
      return fail(c, 502, "payment_provider_error");
    }
    await db.prepare("UPDATE orders SET provider_ref = ? WHERE order_code = ?").bind(checkout.providerRef, orderCode).run();
    await audit(db, {
      at: now,
      actor: "api",
      action: "order_created",
      licenseId: renewLicenseId,
      orderCode,
      detail: { plan, amount, currency },
    });
    const res: Record<string, unknown> = {
      order_code: orderCode,
      order_token: orderToken,
      provider,
      checkout_url: checkout.checkoutUrl,
      // null với cổng không có mã QR (Creem): app mở checkout_url bằng trình duyệt.
      qr_code: checkout.qrCode,
      plan,
      amount,
      currency,
      expires_at: expiresAt,
    };
    if (estimate) {
      res.license_expires_at = estimate.expires_at;
      res.converted_days = estimate.converted_days;
    }
    return c.json(res, 201);
  });

  // Trang thanh toán chuyển về sau khi trả tiền (PayOS: returnUrl; Creem: success_url) hoặc hủy (chỉ PayOS: cancelUrl). App không
  // dựa vào trang này mà tự hỏi trạng thái đơn.
  app.get("/v1/pay/return", (c) =>
    c.html(
      page("success", {
        title: "Thanh toán thành công",
        titleEn: "Payment successful",
        note: "Hãy quay lại AI Translator, app sẽ tự kích hoạt gói của bạn trong giây lát.",
        noteEn: "Return to AI Translator; it will activate your plan automatically in a moment.",
        hint: "Bạn có thể đóng trang này.",
        hintEn: "You can close this page.",
      }),
    ),
  );
  app.get("/v1/pay/cancel", (c) =>
    c.html(
      page("cancel", {
        title: "Đã hủy thanh toán",
        titleEn: "Payment cancelled",
        note: "Bạn chưa bị trừ tiền. Có thể quay lại app để thanh toán lại bất cứ lúc nào.",
        noteEn: "You have not been charged. Return to the app to pay again at any time.",
        hint: "Bạn có thể đóng trang này.",
        hintEn: "You can close this page.",
      }),
    ),
  );
}

interface PageText {
  title: string;
  titleEn: string;
  note: string;
  noteEn: string;
  hint: string;
  hintEn: string;
}

// Màu và logo lấy từ src/styles/tokens.css và app-icon.svg để trang trông cùng một hệ thống với app.
const PAGE_CSS = `
:root{--bg:#f5f7fa;--surface:#fff;--border:#d6dbe3;--text:#141821;--muted:#566072;--accent:#1d63c9;--ok:#127a3e;--ok-bg:#e6f4ec;--warn:#a3261b;--warn-bg:#fdecea;--radius:.5rem;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#11141a;--surface:#1a1f28;--border:#2e3542;--text:#e8ebf0;--muted:#9aa4b5;--accent:#5b9bf0;--ok:#4cc38a;--ok-bg:#16301f;--warn:#ff8a7f;--warn-bg:#3a1c1a;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5;color:var(--text);background:var(--bg)}
main{width:100%;max-width:26rem;padding:2rem 1.5rem;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:calc(var(--radius)*2);box-shadow:0 8px 30px rgba(20,24,33,.08)}
.brand{display:inline-flex;align-items:center;gap:.75rem;margin-bottom:1.75rem;font-size:1.5rem;font-weight:700;color:var(--text)}
.brand svg{width:2.75rem;height:2.75rem}
.badge{display:grid;place-items:center;width:4.5rem;height:4.5rem;margin:0 auto 1.25rem;border-radius:50%}
.success .badge{color:var(--ok);background:var(--ok-bg)}
.cancel .badge{color:var(--warn);background:var(--warn-bg)}
.badge svg{width:2.5rem;height:2.5rem;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.badge path{stroke-dasharray:1;stroke-dashoffset:1;animation:draw .5s .15s ease-out forwards}
@keyframes draw{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){.badge path{animation:none;stroke-dashoffset:0}}
h1{margin:0 0 .5rem;font-size:1.5rem;line-height:1.3}
.success h1{color:var(--ok)}
.cancel h1{color:var(--warn)}
p{margin:0 0 .5rem}
.en{margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--border);color:var(--muted);font-size:.9rem}
.en h2{margin:0 0 .25rem;font-size:1rem;font-weight:600;color:var(--text)}
.hint{margin-top:1rem;font-size:.9rem;color:var(--muted)}
`;

const ICON_SVG = `<svg viewBox="212 272 600 492" aria-hidden="true"><path fill="#1d63c9" d="M332 272h360a120 120 0 0 1 120 120v160a120 120 0 0 1-120 120H430l-168 112 28-124a120 120 0 0 1-78-108V392a120 120 0 0 1 120-120z"/><g fill="#fff"><rect x="304" y="417" width="56" height="110" rx="28"/><rect x="394" y="367" width="56" height="210" rx="28"/><rect x="484" y="322" width="56" height="300" rx="28"/><rect x="574" y="367" width="56" height="210" rx="28"/><rect x="664" y="417" width="56" height="110" rx="28"/></g></svg>`;

const MARK: Record<"success" | "cancel", string> = {
  success: `<path pathLength="1" d="M5 13l4 4L19 7"/>`,
  cancel: `<path pathLength="1" d="M6 6l12 12M18 6L6 18"/>`,
};

function page(kind: "success" | "cancel", t: PageText): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>AI Translator</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main class="${kind}" role="status">
<div class="brand">${ICON_SVG}<span>AI Translator</span></div>
<div class="badge"><svg viewBox="0 0 24 24" aria-hidden="true">${MARK[kind]}</svg></div>
<h1>${t.title}</h1>
<p>${t.note}</p>
<p class="hint">${t.hint}</p>
<div class="en" lang="en"><h2>${t.titleEn}</h2><p>${t.noteEn}</p><p>${t.hintEn}</p></div>
</main>
</body>
</html>`;
}
