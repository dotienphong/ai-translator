// Thuê bao tự gia hạn của Creem (spec 2026-11-05-creem-tu-dong-gia-han-design.md): ghi thuê bao khi đơn đầu được cấp, áp từng kỳ
// `subscription.paid` vào license, theo dõi trạng thái (hủy, quá hạn, tạm dừng), trạng thái và link hủy cho app.
//
// Nguyên tắc (giống phần còn lại của server): webhook đã ký là nguồn sự kiện, mọi ghi tiền đều idempotent, trường không đọc được
// thì giữ lại cho người vận hành xem chứ không đoán. Khóa chống trùng kỳ là `subscriptions.paid_through` (hết kỳ đã thu) cộng
// `orders.provider_ref = "<mã thuê bao>@<hết kỳ>"` (index duy nhất một phần, migration 0009), nên sự kiện gửi lại, đến sai thứ tự
// hay chạy chồng đều không cấp hai lần.
import type { Hono } from "hono";
import { alertIfChanged, raiseAlert } from "./alerts";
import type { AppEnv } from "./app";
import { audit, auditIfChanged } from "./audit";
import { b64urlEncode, randomBytes, sha256Hex } from "./crypto";
import type { Deps } from "./deps";
import { clientIp, fail, readJson, tooMany } from "./http";
import { normalizeLicenseKey } from "./license-key";
import { grantOrder, loadOrder, mailGranted, paymentTime } from "./orders";
import type { SubscriptionRef, SubscriptionStatus, WebhookEvent } from "./payment/provider";
import { DAY_SECONDS, isPlan, type PlanCode, type PlanTable, parsePlans } from "./plans";
import { failureBlock, hit, noteFailure } from "./ratelimit";

type SubscriptionEvent = Extract<WebhookEvent, { kind: "subscription" }>;

export interface SubscriptionRow {
  provider_ref: string;
  license_id: string;
  plan: PlanCode;
  customer_ref: string | null;
  status: SubscriptionStatus;
  paid_through: number;
  last_event_at: number;
}

/**
 * Trạng thái còn đang (hay sắp) thu tiền: license có thuê bao như vậy thì không mua thêm (POST /v1/checkout trả 409
 * `subscription_active`, D11) và không nhận thư nhắc gia hạn (D12 chỉ cho `active` và `past_due`, xem reminders.ts).
 */
export const BLOCKING_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused"] as const;
const BLOCKING_SQL = BLOCKING_STATUSES.map((s) => `'${s}'`).join(", ");

/**
 * Một kỳ mới khi hết kỳ trong sự kiện lớn hơn `paid_through` ít nhất chừng này. Kỳ thật dài từ 28 ngày; còn lệch giữa hai lần đọc
 * cùng một kỳ (ước lượng khi thiếu hạn kỳ ở kỳ đầu, làm tròn múi giờ) chỉ vài ngày. 7 ngày nằm giữa hai bên.
 */
export const NEW_PERIOD_MIN_ADVANCE = 7 * DAY_SECONDS;
/** Sự kiện chưa gắn được thuê bao mà đã cũ hơn mức này (gần lần gửi lại cuối của Creem, 6 giờ) thì cảnh báo người vận hành. */
const UNLINKED_ALERT_AFTER = 3 * 3600;

export async function loadSubscription(db: D1Database, ref: string): Promise<SubscriptionRow | null> {
  return db
    .prepare("SELECT provider_ref, license_id, plan, customer_ref, status, paid_through, last_event_at FROM subscriptions WHERE provider_ref = ?")
    .bind(ref)
    .first<SubscriptionRow>();
}

/** Thuê bao đang chặn mua thêm của license (BLOCKING_STATUSES), hay null. */
export async function blockingSubscription(db: D1Database, licenseId: string): Promise<SubscriptionRow | null> {
  return db
    .prepare(
      `SELECT provider_ref, license_id, plan, customer_ref, status, paid_through, last_event_at FROM subscriptions
       WHERE license_id = ? AND status IN (${BLOCKING_SQL}) ORDER BY updated_at DESC, provider_ref LIMIT 1`,
    )
    .bind(licenseId)
    .first<SubscriptionRow>();
}

/** Thuê bao gần nhất của license (mọi trạng thái), cho màn hình trạng thái trong app. */
export async function latestSubscription(db: D1Database, licenseId: string): Promise<SubscriptionRow | null> {
  return db
    .prepare(
      `SELECT provider_ref, license_id, plan, customer_ref, status, paid_through, last_event_at FROM subscriptions
       WHERE license_id = ? ORDER BY updated_at DESC, provider_ref LIMIT 1`,
    )
    .bind(licenseId)
    .first<SubscriptionRow>();
}

export type LinkResult = "linked" | "exists" | "skipped";

/**
 * Ghi thuê bao của một đơn đầu đã được cấp (`paid`). Gọi từ fulfilOrder (phiên mang `subscription`) và từ route webhook
 * (`checkout.completed` mang `subscription`). Idempotent: thuê bao đã có thì giữ nguyên (chỉ bổ sung mã khách nếu còn thiếu).
 * `skipped`: đơn không phải đơn thuê bao đã cấp (không `auto_renew`, chưa `paid`, chưa có license, không phải Creem).
 * Thiếu hết kỳ trong payload (U3) thì ước lượng bằng giờ cấp + số ngày của gói; `NEW_PERIOD_MIN_ADVANCE` che sai số này.
 */
export async function linkSubscription(
  db: D1Database,
  plans: PlanTable,
  now: number,
  orderCode: number,
  sub: SubscriptionRef,
): Promise<LinkResult> {
  const order = await db
    .prepare("SELECT license_id, plan, auto_renew, status, paid_at FROM orders WHERE order_code = ? AND provider = 'creem'")
    .bind(orderCode)
    .first<{ license_id: string | null; plan: string; auto_renew: number; status: string; paid_at: number | null }>();
  if (!order || order.auto_renew !== 1 || order.status !== "paid" || order.license_id === null || !isPlan(order.plan)) return "skipped";
  const estimate = (order.paid_at ?? now) + plans[order.plan].days_per_order * DAY_SECONDS;
  const [insert] = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO subscriptions (provider_ref, license_id, plan, customer_ref, status, paid_through, last_event_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?)`,
      )
      .bind(sub.ref, order.license_id, order.plan, sub.customerRef, sub.periodEnd ?? estimate, now, now),
    auditIfChanged(db, {
      at: now,
      actor: "webhook",
      action: "subscription_linked",
      licenseId: order.license_id,
      orderCode,
      detail: { subscription: sub.ref, plan: order.plan, period_end: sub.periodEnd, period_end_estimated: sub.periodEnd === null },
    }),
  ]);
  if (insert?.meta.changes === 1) return "linked";
  if (sub.customerRef !== null) {
    await db
      .prepare("UPDATE subscriptions SET customer_ref = ?2, updated_at = ?3 WHERE provider_ref = ?1 AND customer_ref IS NULL")
      .bind(sub.ref, sub.customerRef, now)
      .run();
  }
  return "exists";
}

/**
 * `unknown_subscription`: chưa có thuê bao này (sự kiện tới trước đơn đầu): route trả 503 để Creem gửi lại. `status`: chỉ cập nhật
 * trạng thái. `same_period`: kỳ đã cấp (lần trả đầu, hay gửi lại). `renewed`: đã cấp kỳ mới. `held`: kỳ mới nhưng không cấp tự động
 * (tiền lệch hay hạn kỳ không đọc được): đơn/nhật ký/cảnh báo cho người vận hành. `needs_review`: license đã thu hồi (QĐ37).
 */
export type SubscriptionResult = "unknown_subscription" | "status" | "same_period" | "renewed" | "held" | "needs_review";

interface SubscriptionEnv {
  DB: D1Database;
  ENVIRONMENT: string;
  PLANS?: unknown;
}

/** Xử lý một sự kiện `subscription.*` đã kiểm chữ ký (route webhook). Lỗi hạ tầng thì ném: route trả 503, Creem gửi lại. */
export async function handleSubscriptionEvent(env: SubscriptionEnv, deps: Deps, event: SubscriptionEvent): Promise<SubscriptionResult> {
  const db = env.DB;
  const now = deps.now();
  const sub = await loadSubscription(db, event.subscriptionRef);
  if (!sub) {
    console.warn(JSON.stringify({ event: "subscription_unlinked", subscription: event.subscriptionRef, event_type: event.eventType }));
    // Gần hết lần gửi lại mà vẫn chưa có thuê bao: khách có thể đã bị trừ tiền mà license không được gia hạn.
    if (event.eventAt !== null && now - event.eventAt >= UNLINKED_ALERT_AFTER) {
      await audit(db, {
        at: now,
        actor: "webhook",
        action: "subscription_unlinked",
        detail: { subscription: event.subscriptionRef, event_type: event.eventType, event_id: event.eventId },
      });
      await raiseAlert(db, "subscription_review", now);
    }
    return "unknown_subscription";
  }

  // Trạng thái: chỉ áp sự kiện không cũ hơn sự kiện đã áp (Creem có thể gửi sai thứ tự).
  const at = event.eventAt ?? now;
  const [update, statusLog] = await db.batch([
    db
      .prepare(
        `UPDATE subscriptions SET status = ?2, last_event_at = ?3, customer_ref = COALESCE(customer_ref, ?4), updated_at = ?5
         WHERE provider_ref = ?1 AND last_event_at <= ?3 AND (status <> ?2 OR customer_ref IS NULL)`,
      )
      .bind(sub.provider_ref, event.status, at, event.customerRef, now),
    auditIfChanged(db, {
      at: now,
      actor: "webhook",
      action: "subscription_status",
      licenseId: sub.license_id,
      detail: { subscription: sub.provider_ref, from: sub.status, to: event.status, event_type: event.eventType, event_id: event.eventId },
    }),
  ]);
  void update;
  void statusLog;
  // Cập nhật mốc sự kiện cả khi trạng thái không đổi (để sự kiện cũ hơn đến sau không đảo lại trạng thái).
  await db
    .prepare("UPDATE subscriptions SET last_event_at = ?2 WHERE provider_ref = ?1 AND last_event_at < ?2")
    .bind(sub.provider_ref, at)
    .run();

  if (event.eventType !== "subscription.paid") return "status";
  if (event.periodEnd === null) {
    await hold(db, now, sub, event, "period_unreadable");
    return "held";
  }
  if (event.periodEnd < sub.paid_through + NEW_PERIOD_MIN_ADVANCE) return "same_period";
  return renew(env, deps, now, sub, event, event.periodEnd);
}

/** Sự kiện thu tiền không áp được tự động và không có đơn để giữ: nhật ký + cảnh báo `subscription_review`, 200 cho Creem. */
async function hold(db: D1Database, now: number, sub: SubscriptionRow, event: SubscriptionEvent, reason: string): Promise<void> {
  await audit(db, {
    at: now,
    actor: "webhook",
    action: "subscription_period_unreadable",
    licenseId: sub.license_id,
    detail: { subscription: sub.provider_ref, reason, event_type: event.eventType, event_id: event.eventId },
  });
  await raiseAlert(db, "subscription_review", now);
}

/** Lý do một kỳ thu tiền không được cấp tự động (D8), hay null nếu đủ điều kiện. Trường thiếu không chặn (U4). */
function reviewReason(event: SubscriptionEvent, priceUsd: number): string | null {
  const tx = event.transaction;
  if (!tx) return null;
  if (tx.status !== null && tx.status !== "paid") return "transaction_status";
  if (tx.currency !== null && tx.currency !== "USD") return "currency";
  if (tx.hasDiscount) return "discount";
  if (tx.amountPaid !== null && tx.amountPaid - (tx.taxAmount ?? 0) < priceUsd) return "underpaid";
  return null;
}

async function renew(
  env: SubscriptionEnv,
  deps: Deps,
  now: number,
  sub: SubscriptionRow,
  event: SubscriptionEvent,
  periodEnd: number,
): Promise<SubscriptionResult> {
  const db = env.DB;
  const plans = parsePlans(env.PLANS);
  if (!plans) throw new Error("bảng gói (PLANS) chưa cấu hình hoặc sai");
  if (!isPlan(sub.plan)) throw new Error(`gói lạ trong thuê bao ${sub.provider_ref}`);
  const price = plans[sub.plan].prices.USD;
  if (price === undefined) throw new Error(`gói ${sub.plan} không có giá USD`);
  const lic = await db
    .prepare("SELECT email FROM licenses WHERE id = ?")
    .bind(sub.license_id)
    .first<{ email: string | null }>();
  if (!lic) throw new Error(`không thấy license ${sub.license_id} của thuê bao ${sub.provider_ref}`);
  // Ngôn ngữ thư và mốc đồng ý lấy từ đơn thuê bao đầu của license.
  const first = await db
    .prepare(
      "SELECT lang, email_consent_at FROM orders WHERE license_id = ? AND provider = 'creem' AND auto_renew = 1 ORDER BY order_code LIMIT 1",
    )
    .bind(sub.license_id)
    .first<{ lang: string | null; email_consent_at: number }>();

  // Đơn gia hạn của kỳ này: provider_ref tất định nên gửi lại/chạy chồng gặp đúng đơn đó (index duy nhất, migration 0009).
  const ref = `${sub.provider_ref}@${periodEnd}`;
  const inserted = await db
    .prepare(
      `INSERT INTO orders (order_token_hash, provider, provider_ref, plan, amount, currency, email, email_consent_at, renew_license_id,
                           lang, status, auto_renew, created_at, expires_at)
       VALUES (?, 'creem', ?, ?, ?, 'USD', ?, ?, ?, ?, 'pending', 1, ?, ?) ON CONFLICT DO NOTHING RETURNING order_code`,
    )
    .bind(
      await sha256Hex(b64urlEncode(randomBytes(32))),
      ref,
      sub.plan,
      price,
      lic.email,
      first?.email_consent_at ?? now,
      sub.license_id,
      first?.lang ?? null,
      now,
      now,
    )
    .first<{ order_code: number }>();
  const orderCode =
    inserted?.order_code ??
    (
      await db
        .prepare("SELECT order_code FROM orders WHERE provider = 'creem' AND auto_renew = 1 AND provider_ref = ?")
        .bind(ref)
        .first<{ order_code: number }>()
    )?.order_code;
  if (orderCode === undefined) throw new Error(`không tạo được đơn gia hạn ${ref}`);
  const order = await loadOrder(db, orderCode);
  if (!order) throw new Error(`không đọc lại được đơn gia hạn ${orderCode}`);
  const advance = db
    .prepare("UPDATE subscriptions SET paid_through = MAX(paid_through, ?2), updated_at = ?3 WHERE provider_ref = ?1")
    .bind(sub.provider_ref, periodEnd, now);

  const reason = reviewReason(event, price);
  if (reason !== null) {
    // Tiền lệch/giảm giá/giao dịch chưa paid: giữ đơn (underpaid) và báo người vận hành như đơn Creem lệch giá (Q4, D6 spec Creem);
    // KHÔNG cấp. Kỳ này coi như đã ghi nhận (paid_through tiến) để sự kiện gửi lại không tạo thêm việc.
    const tx = event.transaction;
    await db.batch([
      db
        .prepare(
          `UPDATE orders SET status = 'underpaid', amount_paid = ?2, last_checked_at = ?3
           WHERE order_code = ?1 AND status NOT IN ('paid', 'paid_needs_review', 'refunded')`,
        )
        .bind(orderCode, Math.max(0, Math.min(price, (tx?.amountPaid ?? 0) - (tx?.taxAmount ?? 0))), now),
      auditIfChanged(db, {
        at: now,
        actor: "webhook",
        action: "order_underpaid",
        licenseId: sub.license_id,
        orderCode,
        detail: {
          amount: price,
          currency: "USD",
          provider_amount: price,
          amount_paid: Math.max(0, (tx?.amountPaid ?? 0) - (tx?.taxAmount ?? 0)),
          subscription: sub.provider_ref,
          period_end: periodEnd,
          transaction: tx?.ref ?? null,
          reason,
          has_discount: tx?.hasDiscount ?? false,
        },
      }),
      alertIfChanged(db, "order_payment_review", now),
      advance,
    ]);
    return "held";
  }

  const amountPaid = price;
  const granted = await grantOrder(db, plans, order, {
    now,
    paidAt: paymentTime(order, event.transaction?.paidAt ?? null, now),
    amountPaid,
    actor: "webhook",
    subscriptionPeriodEnd: periodEnd,
  });
  await advance.run();
  if (granted === "already_settled") return "same_period";
  if (granted === "needs_review") return "needs_review";
  await audit(db, {
    at: now,
    actor: "webhook",
    action: "subscription_renewed",
    licenseId: sub.license_id,
    orderCode,
    detail: { subscription: sub.provider_ref, period_end: periodEnd, expires_at: granted.expiresAt, transaction: event.transaction?.ref ?? null },
  });
  await mailGranted(db, deps, env.ENVIRONMENT, order, granted);
  return "renewed";
}

/** Phản hồi trạng thái tự gia hạn cho app (POST /v1/subscription). */
export interface SubscriptionStatusView {
  auto_renew: boolean;
  status: SubscriptionStatus | null;
  plan: PlanCode | null;
  /** Hết kỳ đã thu (giây Unix): kỳ sau trừ tiền vào khoảng này. null khi không có thuê bao. */
  renews_at: number | null;
}

function view(row: SubscriptionRow | null): SubscriptionStatusView {
  if (!row) return { auto_renew: false, status: null, plan: null, renews_at: null };
  // "Tự gia hạn đang bật" = còn trừ tiền được: không tính đã hủy, đã hết, hay hủy cuối kỳ.
  const on = (BLOCKING_STATUSES as readonly string[]).includes(row.status);
  return { auto_renew: on, status: row.status, plan: row.plan, renews_at: row.paid_through };
}

export function registerSubscriptions(app: Hono<AppEnv>) {
  // Trạng thái tự gia hạn của license, và (manage: true) link cổng khách hàng Creem để xem/hủy. Dùng key như /v1/checkout: key sai
  // tính vào bộ đếm thất bại của IP. Không lộ gì ngoài trạng thái của chính license đó.
  app.post("/v1/subscription", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const rl = await hit(c.env, "checkout_ip", clientIp(c), now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    const wait = await failureBlock(c.env, clientIp(c), now);
    if (wait > 0) return tooMany(c, wait);
    const body = await readJson(c);
    if (!body) return fail(c, 400, "invalid_request");
    const key = typeof body.license_key === "string" ? normalizeLicenseKey(body.license_key) : null;
    if (!key) {
      await noteFailure(c.env, clientIp(c), now, "subscription");
      return fail(c, 400, "invalid_request", { field: "license_key" });
    }
    const lic = await db.prepare("SELECT id, revoked_at FROM licenses WHERE license_key = ?").bind(key).first<{ id: string; revoked_at: number | null }>();
    if (!lic) {
      await noteFailure(c.env, clientIp(c), now, "subscription");
      return fail(c, 404, "invalid_key");
    }
    const row = await latestSubscription(db, lic.id);
    const res: Record<string, unknown> = { ...view(row) };
    if (body.manage === true) {
      if (!row || row.customer_ref === null) return fail(c, 404, "no_subscription");
      const gateway = Object.hasOwn(deps.payments, "creem") ? deps.payments.creem : undefined;
      if (!gateway?.createPortalLink) return fail(c, 503, "temporarily_unavailable");
      try {
        res.portal_url = await gateway.createPortalLink(row.customer_ref);
      } catch (err) {
        console.error(JSON.stringify({ event: "subscription_portal_failed", subscription: row.provider_ref, error: String(err) }));
        return fail(c, 502, "payment_provider_error");
      }
    }
    return c.json(res);
  });
}
