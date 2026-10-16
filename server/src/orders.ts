// Vòng đời đơn hàng sau khi tạo (§6.8, §9): webhook của cổng thanh toán, app hỏi trạng thái,
// cấp license mới, gia hạn hoặc đổi gói, gửi lại email chưa gửi được.
import type { Hono } from "hono";
import { alertIfChanged, raiseAlert } from "./alerts";
import type { AppEnv } from "./app";
import { auditIfChanged } from "./audit";
import { sha256Hex, timingSafeEqual } from "./crypto";
import { type Deps, sendLicenseMail } from "./deps";
import { clientIp, fail, tooMany } from "./http";
import { formatLicenseKey, generateLicenseKey } from "./license-key";
import type { WebhookEvent } from "./payment/provider";
import { computeGrant, type GrantTerms, isPlan, PLAN_NAMES, type PlanCode, type PlanTable, parsePlans } from "./plans";
import { hit } from "./ratelimit";

export interface OrderRow {
  order_code: number;
  provider: string;
  /** Mã của đơn ở cổng (paymentLinkId của PayOS, id phiên thanh toán của Creem); NULL khi cổng chưa trả lời lúc tạo. */
  provider_ref: string | null;
  status: string;
  plan: string;
  amount: number;
  amount_paid: number;
  currency: string;
  email: string | null;
  renew_license_id: string | null;
  license_id: string | null;
  created_at: number;
  /** Hạn của link thanh toán. */
  expires_at: number;
}

export interface Granted {
  licenseId: string;
  licenseKey: string;
  plan: PlanCode;
  expiresAt: number;
  kind: GrantTerms["kind"];
  convertedDays: number;
}

export async function loadOrder(db: D1Database, orderCode: number): Promise<OrderRow | null> {
  return db
    .prepare(
      `SELECT order_code, provider, provider_ref, status, plan, amount, amount_paid, currency, email, renew_license_id,
              license_id, created_at, expires_at
       FROM orders WHERE order_code = ?`,
    )
    .bind(orderCode)
    .first<OrderRow>();
}

/**
 * Thời điểm thanh toán của đơn (QĐ33): thời điểm cổng báo, kẹp trong khoảng từ lúc tạo link tới lúc link hết hạn,
 * và không muộn hơn lúc xử lý (`now`): đồng hồ của cổng chạy nhanh hơn Worker thì `cycle_anchor` vẫn không muộn hơn
 * `issued_at` của token đầu tiên (review cuối, N1). Cổng không báo thì dùng lúc xử lý, cũng kẹp như vậy.
 */
export function paymentTime(order: Pick<OrderRow, "created_at" | "expires_at">, reported: number | null, now: number): number {
  return Math.min(Math.max(reported ?? now, order.created_at), order.expires_at, now);
}

/** Số lần thử lại khi license bị một đơn khác đổi cùng lúc (QĐ32). */
const GRANT_ATTEMPTS = 5;

/**
 * Trạng thái mà đơn không bao giờ được áp lại: đã cấp (`paid`), hay license đã thu hồi nhận được tiền và đang chờ
 * người vận hành xử lý (`paid_needs_review`, QĐ37), hay đã hoàn tiền (`refunded`): người vận hành ghi là hoàn ngoài hệ thống,
 * hay cổng báo đã hoàn đủ (webhook hoàn tiền hay tranh chấp, handleRefund) ở bất kỳ trạng thái nào, kể cả trước khi cấp.
 * Nhờ vậy cấp tự động (webhook, đối soát) và cấp tay của admin đều từ chối đơn đã hoàn.
 */
export const SETTLED_STATUSES = ["paid", "paid_needs_review", "refunded"] as const;
const NOT_SETTLED = `status NOT IN (${SETTLED_STATUSES.map((x) => `'${x}'`).join(", ")})`;

export interface GrantOptions {
  /** Lúc xử lý: lúc ghi nhật ký và mốc anchor_applied_at của quota_fresh (QĐ35). */
  now: number;
  /** "Hiện tại" của luật mua thêm và đổi gói: thời điểm thanh toán (QĐ33). Thiếu thì dùng `now`. */
  paidAt?: number;
  amountPaid: number;
  actor: string;
  /** Chỉ cho test: chạy sau khi đọc license, trước khi ghi, để giả lập một đơn khác ghi chen vào. */
  beforeCommit?: () => Promise<void>;
  /**
   * Chỉ cho admin xử lý đơn `paid_needs_review` (QĐ37): cấp một license mới cho đơn, không đụng license đã thu hồi.
   * Khi đó điều kiện "đơn chưa áp" là `status = 'paid_needs_review'`.
   */
  resolveAsNewLicense?: boolean;
}

/** `needs_review`: license của đơn gia hạn hay đổi gói đã bị thu hồi; đơn chuyển sang `paid_needs_review` (QĐ37). */
export type GrantResult = Granted | "already_settled" | "needs_review";

/**
 * Áp một đơn đã trả tiền vào license theo luật mua thêm và đổi gói (src/plans.ts, computeGrant) rồi đánh dấu
 * đơn đã trả (QĐ8, QĐ32). Mọi câu lệnh của một lần ghi chạy trong một batch (một transaction của D1):
 * - mọi câu đều có điều kiện "đơn chưa paid", nên webhook gửi trùng, đối soát và admin chỉ có tác dụng một lần;
 * - đơn gia hạn hay đổi gói chỉ ghi khi license còn đúng `version` đã đọc, và câu đánh dấu đơn kiểm license đã
 *   mang dấu của chính đơn này (`last_order_code`). Một đơn khác của cùng license ghi chen vào thì lần ghi này
 *   không có tác dụng gì, và vòng lặp đọc lại rồi tính lại. Kết quả bằng đúng việc áp lần lượt từng đơn.
 * - license đã thu hồi thì câu ghi license không có tác dụng (`revoked_at IS NULL` nằm ngay trong câu `UPDATE`, nên
 *   không có khe hở giữa lúc thu hồi và lúc cấp); đơn chuyển sang `paid_needs_review` và có cảnh báo (QĐ37).
 * - "hiện tại" không sớm hơn `cycle_anchor` đang có của license: đơn trả sớm hơn mà được xử lý sau một đơn trả muộn
 *   hơn thì tính tại mốc của đơn kia, để `cycle_anchor` không bao giờ lùi.
 * Trả về `already_settled` nếu đơn đã được áp hay đã chuyển sang trạng thái không áp lại.
 */
export async function grantOrder(
  db: D1Database,
  plans: PlanTable,
  order: OrderRow,
  opts: GrantOptions,
): Promise<GrantResult> {
  if (!isPlan(order.plan)) throw new Error(`gói lạ trong đơn ${order.order_code}`);
  const plan = order.plan;
  const pending = opts.resolveAsNewLicense ? "status = 'paid_needs_review'" : NOT_SETTLED;
  const unpaid = `EXISTS (SELECT 1 FROM orders WHERE order_code = ?1 AND ${pending})`;
  for (let attempt = 0; attempt < GRANT_ATTEMPTS; attempt++) {
    let licenseId: string;
    let terms: GrantTerms;
    let write: D1PreparedStatement;
    let mark: D1PreparedStatement;
    let from: { plan: string; expires_at: number } | null = null;
    let at = opts.paidAt ?? opts.now;
    if (order.renew_license_id === null || opts.resolveAsNewLicense) {
      licenseId = crypto.randomUUID();
      terms = computeGrant(plans, null, plan, order.currency, opts.paidAt ?? opts.now);
      // cycle_anchor (?7) là thời điểm thanh toán; anchor_applied_at và created_at (?8) là lúc xử lý.
      write = db
        .prepare(
          `INSERT INTO licenses (id, license_key, email, plan, expires_at, cycle_anchor, anchor_applied_at, last_order_code, created_at)
           SELECT ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?1, ?8 WHERE ${unpaid}`,
        )
        .bind(order.order_code, licenseId, generateLicenseKey(), order.email, plan, terms.expires_at, terms.cycle_anchor, opts.now);
      // Đơn paid_needs_review đã có paid_at (lúc server xác nhận khách trả tiền): giữ nguyên khi admin cấp license mới.
      mark = db
        .prepare(
          `UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?2), amount_paid = ?3, license_id = ?4, grant_kind = ?5,
                  last_checked_at = ?2
           WHERE order_code = ?1 AND ${pending} AND EXISTS (SELECT 1 FROM licenses WHERE id = ?4 AND last_order_code = ?1)`,
        )
        .bind(order.order_code, opts.now, opts.amountPaid, licenseId, terms.kind);
    } else {
      licenseId = order.renew_license_id;
      const cur = await db
        .prepare("SELECT plan, expires_at, cycle_anchor, version FROM licenses WHERE id = ?")
        .bind(licenseId)
        .first<{ plan: PlanCode; expires_at: number; cycle_anchor: number; version: number }>();
      if (!cur) throw new Error(`không thấy license ${licenseId} của đơn ${order.order_code}`);
      from = { plan: cur.plan, expires_at: cur.expires_at };
      at = Math.max(opts.paidAt ?? opts.now, cur.cycle_anchor);
      terms = computeGrant(plans, cur, plan, order.currency, at);
      // Chu kỳ được đặt lại (đổi gói, mua lại sau khi hết hạn): ghi lúc server áp thay đổi, là mốc của
      // quota_fresh (QĐ35). Không dùng cycle_anchor làm mốc, vì nó là lúc trả tiền và webhook có thể tới muộn.
      const anchorReset = terms.kind === "change" || terms.cycle_anchor !== cur.cycle_anchor;
      write = db
        .prepare(
          `UPDATE licenses SET plan = ?2, expires_at = ?3, cycle_anchor = ?4, version = version + 1, last_order_code = ?1,
                  anchor_applied_at = CASE WHEN ?7 THEN ?8 ELSE anchor_applied_at END
           WHERE id = ?5 AND version = ?6 AND revoked_at IS NULL AND ${unpaid}`,
        )
        .bind(order.order_code, plan, terms.expires_at, terms.cycle_anchor, licenseId, cur.version, anchorReset ? 1 : 0, opts.now);
      mark = db
        .prepare(
          `UPDATE orders SET status = 'paid', paid_at = ?2, amount_paid = ?3, license_id = ?4, grant_kind = ?5, last_checked_at = ?2
           WHERE order_code = ?1 AND ${NOT_SETTLED}
             AND EXISTS (SELECT 1 FROM licenses WHERE id = ?4 AND last_order_code = ?1 AND version = ?6)`,
        )
        .bind(order.order_code, opts.now, opts.amountPaid, licenseId, terms.kind, cur.version + 1);
    }
    // Nhật ký đứng ngay sau câu đánh dấu đơn và chỉ ghi khi câu đó có tác dụng: cấp và ghi nhật ký cùng thành hoặc cùng không.
    const log = auditIfChanged(db, {
      at: opts.now,
      actor: opts.actor,
      action: terms.kind === "new" ? "license_issued" : terms.kind === "extend" ? "license_extended" : "license_plan_changed",
      licenseId,
      orderCode: order.order_code,
      detail: {
        plan,
        ...(from ? { from_plan: from.plan, from_expires_at: from.expires_at } : {}),
        expires_at: terms.expires_at,
        cycle_anchor: terms.cycle_anchor,
        converted_days: terms.converted_days,
        paid_at: at,
        amount_paid: opts.amountPaid,
        // Đơn vị của amount_paid (cent USD, đồng VND) để Web Admin hiển thị đúng.
        currency: order.currency,
      },
    });
    await opts.beforeCommit?.();
    const results = await db.batch([write, mark, log]);
    if (results[1]?.meta.changes !== 1) {
      if (order.renew_license_id !== null && !opts.resolveAsNewLicense) {
        // License đã thu hồi: không áp đơn, chuyển đơn sang chờ người vận hành (QĐ37). Chuyển trạng thái, nhật ký và
        // cảnh báo cùng một batch, nên không có trường hợp đơn đã chuyển mà cảnh báo bị mất.
        const [review] = await db.batch([
          db
            .prepare(
              `UPDATE orders SET status = 'paid_needs_review', paid_at = ?2, amount_paid = ?3, last_checked_at = ?2
               WHERE order_code = ?1 AND ${NOT_SETTLED}
                 AND EXISTS (SELECT 1 FROM licenses WHERE id = ?4 AND revoked_at IS NOT NULL)`,
            )
            .bind(order.order_code, opts.now, opts.amountPaid, licenseId),
          auditIfChanged(db, {
            at: opts.now,
            actor: opts.actor,
            action: "order_needs_review",
            licenseId,
            orderCode: order.order_code,
            detail: { reason: "license_revoked", plan, amount_paid: opts.amountPaid, currency: order.currency, paid_at: at },
          }),
          alertIfChanged(db, "order_needs_review", opts.now),
        ]);
        if (review?.meta.changes === 1) {
          console.warn(JSON.stringify({ event: "order_needs_review", order_code: order.order_code }));
          return "needs_review";
        }
      }
      const st = await db.prepare("SELECT status FROM orders WHERE order_code = ?").bind(order.order_code).first<{ status: string }>();
      if ((SETTLED_STATUSES as readonly string[]).includes(st?.status ?? "")) return "already_settled";
      continue; // license vừa bị một đơn khác đổi: đọc lại và tính lại
    }
    const lic = await db.prepare("SELECT license_key FROM licenses WHERE id = ?").bind(licenseId).first<{ license_key: string }>();
    if (!lic) throw new Error(`không thấy license ${licenseId} sau khi cấp`);
    return {
      licenseId,
      licenseKey: lic.license_key,
      plan,
      expiresAt: terms.expires_at,
      kind: terms.kind,
      convertedDays: terms.converted_days,
    };
  }
  throw new Error(`đơn ${order.order_code}: license bị đổi liên tục, thử lại sau`);
}

/** Loại thư theo kiểu cấp: license mới, gia hạn cùng gói, hay đổi gói. */
function mailKind(kind: Granted["kind"]) {
  return kind === "new" ? "purchase" : kind === "extend" ? "renewal" : "plan_change";
}

/** Giãn thời gian giữa các lần gửi lại sau lỗi tạm: 5 phút, 15 phút, 1 giờ, rồi mỗi 6 giờ (trong 24 giờ). */
export function emailRetryDelay(attempts: number): number {
  return [300, 900, 3600][attempts - 1] ?? 21600;
}

/**
 * Gửi email sau khi cấp; idempotency key theo đơn để Resend không gửi hai lần (kể cả khi cron gửi lại).
 * Lỗi tạm (401, 403, 409 concurrent_idempotent_requests, 429, 5xx, mạng) thì hẹn lần gửi lại; lỗi vĩnh viễn (400, 422)
 * thì thôi; 409 invalid_idempotent_request (lần gửi trước đã được nhận) thì coi là đã gửi.
 * Cảnh báo email_failed chỉ tạo ở lần lỗi đầu của mỗi đơn.
 */
export async function mailGranted(
  db: D1Database,
  deps: Pick<Deps, "now" | "email">,
  envName: string,
  order: Pick<OrderRow, "order_code" | "email">,
  g: Pick<Granted, "licenseKey" | "plan" | "expiresAt" | "kind">,
) {
  if (!order.email) return;
  const prev = await db
    .prepare("SELECT email_attempts FROM orders WHERE order_code = ?")
    .bind(order.order_code)
    .first<{ email_attempts: number }>();
  const attempts = (prev?.email_attempts ?? 0) + 1;
  const res = await sendLicenseMail(
    db,
    deps,
    order.email,
    mailKind(g.kind),
    [{ licenseKey: g.licenseKey, planName: PLAN_NAMES[g.plan], expiresAt: g.expiresAt }],
    { idempotencyKey: `${envName}-order-${order.order_code}`, alert: attempts === 1 },
  );
  const now = deps.now();
  let update: D1PreparedStatement;
  if (res.ok) {
    update = db
      .prepare("UPDATE orders SET email_attempts = ?, email_sent_at = ?, email_retry_at = NULL WHERE order_code = ?")
      .bind(attempts, now, order.order_code);
  } else if (res.permanent) {
    update = db
      .prepare("UPDATE orders SET email_attempts = ?, email_gave_up_at = ?, email_retry_at = NULL WHERE order_code = ?")
      .bind(attempts, now, order.order_code);
  } else {
    update = db
      .prepare("UPDATE orders SET email_attempts = ?, email_retry_at = ? WHERE order_code = ?")
      .bind(attempts, now + emailRetryDelay(attempts), order.order_code);
  }
  await update.run();
}

/**
 * `already_paid`: đơn đang `paid`. `already_settled`: đơn đã hoàn tiền (`refunded`); đơn đó có thể đã được cấp license trước
 * khi hoàn (license giữ nguyên, D5) hay chưa bao giờ được cấp. `needs_review`: đơn đang chờ người vận hành (`paid_needs_review`).
 */
export type FulfilResult = "granted" | "already_paid" | "already_settled" | "needs_review" | "not_paid" | "unknown_order";

/** Nhãn kết quả cho đơn đã ở trạng thái không áp lại. */
export function settledResult(status: string): "already_paid" | "already_settled" | "needs_review" {
  return status === "paid" ? "already_paid" : status === "paid_needs_review" ? "needs_review" : "already_settled";
}

async function orderStatus(db: D1Database, orderCode: number): Promise<string> {
  const row = await db.prepare("SELECT status FROM orders WHERE order_code = ?").bind(orderCode).first<{ status: string }>();
  return row?.status ?? "";
}

/**
 * Mã của đơn ở cổng lấy từ webhook đã ký (WebhookEvent `payment`, `providerRef`), cùng tên cổng của endpoint đã nhận nó.
 * Chỉ dùng khi đơn chưa lưu mã ở cổng.
 */
export interface ProviderRefHint {
  provider: string;
  providerRef: string;
}

/**
 * Hỏi cổng thanh toán của đơn (orders.provider) trạng thái thật rồi xử lý (§6.8): chỉ cấp khi status paid,
 * amountPaid ≥ amount và amount khớp đơn. Dùng chung cho webhook và đối soát. Lỗi mạng thì ném cho bên gọi.
 * - Đơn chưa có `provider_ref` (Worker dừng giữa lúc tạo phiên và lúc lưu mã phiên, hay mất phản hồi tạo phiên) mà webhook
 *   đúng chữ ký của chính cổng của đơn mang mã phiên (`hint`): hỏi cổng theo mã đó. Cổng kiểm mã phiên thuộc đúng đơn này
 *   (Creem: `request_id`) và ném lỗi nếu không, nên chỉ lưu mã khi đã hỏi được; lưu có điều kiện `provider_ref IS NULL`.
 * - Cổng báo đơn đã hoàn tiền (`refunded`, lớp phòng thủ): đơn thành `refunded` với nhật ký và cảnh báo `order_refunded`
 *   như webhook hoàn tiền (Q1), nguồn `provider_status`.
 */
export async function fulfilOrder(
  env: { DB: D1Database; ENVIRONMENT: string; PLANS?: unknown },
  deps: Deps,
  orderCode: number,
  actor: string,
  hint?: ProviderRefHint,
): Promise<FulfilResult> {
  const order = await loadOrder(env.DB, orderCode);
  if (!order) return "unknown_order";
  if ((SETTLED_STATUSES as readonly string[]).includes(order.status)) return settledResult(order.status);
  const provider = Object.hasOwn(deps.payments, order.provider) ? deps.payments[order.provider] : undefined;
  if (!provider) throw new Error(`không có cổng thanh toán ${order.provider}`);
  const now = deps.now();
  const hintedRef = order.provider_ref === null && hint?.provider === order.provider ? hint.providerRef : null;
  const st = await provider.getPaymentStatus({ orderCode, providerRef: order.provider_ref ?? hintedRef });
  // Số đã nhận ghi vào D1 (cột không có CHECK) không bao giờ âm hay NaN, ở mọi đường ghi dưới đây.
  const amountPaid = st.amountPaid > 0 ? st.amountPaid : 0;
  if (hintedRef !== null) {
    const filled = await env.DB.prepare("UPDATE orders SET provider_ref = ?2 WHERE order_code = ?1 AND provider_ref IS NULL")
      .bind(orderCode, hintedRef)
      .run();
    if (filled.meta.changes === 1) {
      console.warn(JSON.stringify({ event: "order_provider_ref_filled", order_code: orderCode, provider: order.provider }));
    }
  }
  const amountMatches = st.amount === order.amount;
  if (amountMatches && st.status === "paid" && amountPaid >= st.amount) {
    const plans = parsePlans(env.PLANS);
    if (!plans) throw new Error("bảng gói (PLANS) chưa cấu hình hoặc sai");
    const granted = await grantOrder(env.DB, plans, order, {
      now,
      paidAt: paymentTime(order, st.paidAt, now),
      amountPaid,
      actor,
    });
    if (granted === "already_settled") return settledResult(await orderStatus(env.DB, orderCode));
    // Đơn chờ người vận hành: không gửi thư key.
    if (granted === "needs_review") return "needs_review";
    await mailGranted(env.DB, deps, env.ENVIRONMENT, order, granted);
    return "granted";
  }
  // Cổng báo đã hoàn đủ: đơn thành refunded dù số tiền lệch (M-3, Q1: hoàn đủ thì refunded ở mọi trạng thái), để người vận hành không
  // cấp tay nhầm một đơn đã hoàn. Số tiền của cổng khác số tiền của đơn là bất thường: không cấp, để người vận hành xem (admin cấp
  // tay nếu đúng).
  const local = st.status === "refunded" ? "refunded" : !amountMatches ? "failed" : st.status === "paid" ? "underpaid" : st.status;
  const update = env.DB.prepare(
    `UPDATE orders SET status = ?2, amount_paid = ?3, last_checked_at = ?4 WHERE order_code = ?1 AND ${NOT_SETTLED}`,
  ).bind(orderCode, local, amountPaid, now);
  if (local === "refunded") {
    // Đơn khép vì hoàn tiền phải để lại dấu như webhook hoàn tiền (Q1): đổi trạng thái, nhật ký và cảnh báo cùng một batch, nhật
    // ký chỉ ghi khi câu đổi trạng thái có tác dụng, cảnh báo chỉ khi nhật ký vừa ghi.
    const [, log] = await env.DB.batch([
      update,
      auditIfChanged(env.DB, {
        at: now,
        actor,
        action: "order_refunded",
        licenseId: order.license_id ?? order.renew_license_id,
        orderCode,
        detail: {
          source: "provider_status",
          reason: "refund",
          full: true,
          prev_status: order.status,
          plan: order.plan,
          amount: order.amount,
          currency: order.currency,
          amount_paid: amountPaid,
          license_id: order.license_id ?? order.renew_license_id,
        },
      }),
      alertIfChanged(env.DB, "order_refunded", now),
    ]);
    if (log?.meta.changes === 1) {
      console.warn(
        JSON.stringify({
          event: "order_refund_event",
          order_code: orderCode,
          action: "order_refunded",
          prev_status: order.status,
          status_after: "refunded",
          source: "provider_status",
        }),
      );
    }
    return "not_paid";
  }
  const action = !amountMatches ? "order_amount_mismatch" : local === "underpaid" ? "order_underpaid" : null;
  if (action === null) {
    await update.run();
    return "not_paid";
  }
  // Cổng báo đã trả mà số tiền không như đơn: cảnh báo order_payment_review khi lệch số tiền (mọi cổng), hay khi đơn underpaid ở
  // mọi cổng trừ PayOS. PayOS underpaid là khách chuyển khoản thiếu: chuyển bù được và server tự cấp khi đủ, nên không cảnh báo
  // (spec §4.1, QĐ-8). Creem underpaid là mã giảm giá hay trả thấp hơn giá (Q4, D6): người vận hành cấp tay hay hoàn tiền.
  const review = !amountMatches || order.provider !== "payos";
  // Chỉ khi đổi thật (trạng thái hay số đã nhận khác dòng đang có): đổi đơn, nhật ký và cảnh báo trong cùng một batch; nhật ký chỉ
  // ghi khi câu đổi có tác dụng, cảnh báo chỉ khi nhật ký vừa ghi. Hỏi lại mà không có gì mới (webhook gửi lại, đối soát hỏi lại
  // đơn underpaid) thì chỉ có câu `update` cuối batch (ghi lúc hỏi).
  const [, log] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders SET status = ?2, amount_paid = ?3, last_checked_at = ?4
       WHERE order_code = ?1 AND ${NOT_SETTLED} AND (status <> ?2 OR amount_paid <> ?3)`,
    ).bind(orderCode, local, amountPaid, now),
    auditIfChanged(env.DB, {
      at: now,
      actor,
      action,
      orderCode,
      // `currency` để Web Admin hiển thị đúng đơn vị của các số tiền (cent USD, đồng VND). Dữ kiện của cổng (ReviewDetail: giảm
      // giá, số khách trả, thuế, trường hỏng) khi cổng có đặt.
      detail: { amount: order.amount, currency: order.currency, provider_amount: st.amount, amount_paid: amountPaid, ...st.reviewDetail },
    }),
    ...(review ? [alertIfChanged(env.DB, "order_payment_review", now)] : []),
    update,
  ]);
  if (!amountMatches && log?.meta.changes === 1) console.warn(JSON.stringify({ event: "order_amount_mismatch", order_code: orderCode }));
  return "not_paid";
}

/**
 * `refunded`: sự kiện này đổi đơn sang `refunded`; `noted`: chỉ ghi nhật ký và cảnh báo, trạng thái đơn không đổi;
 * `duplicate`: sự kiện (cùng mã) đã xử lý rồi, không ghi gì; `unknown_order`: không có đơn nào của cổng mang mã phiên này
 * (nhật ký và cảnh báo `payment_unmatched`, recordUnmatched; gửi lại cùng mã vẫn là `unknown_order` mà không ghi thêm).
 */
export type RefundResult = "refunded" | "noted" | "duplicate" | "unknown_order";

type RefundEvent = Extract<WebhookEvent, { kind: "refund" }>;

/** Tên nhật ký, cũng là loại cảnh báo, của một sự kiện hoàn tiền hay tranh chấp. */
function refundAction(event: RefundEvent): "order_disputed" | "order_refunded" | "order_partially_refunded" | "order_refund_unconfirmed" {
  if (event.reason === "dispute") return "order_disputed";
  if (event.refundStatus !== "succeeded") return "order_refund_unconfirmed";
  return event.full ? "order_refunded" : "order_partially_refunded";
}

/**
 * Webhook hoàn tiền hay tranh chấp (spec 2026-10-14 §4.4, đổi theo Q1 của chủ dự án ngày 2026-10-15). Tin payload đã kiểm chữ
 * ký, không hỏi lại cổng (Creem vẫn báo đơn `paid` sau khi hoàn). Không đụng license (D5).
 * - Mỗi sự kiện chưa thấy của một đơn đã biết, ở bất kỳ trạng thái nào, để lại đúng một nhật ký, một cảnh báo và một dòng log:
 *   tranh chấp là `order_disputed` (luôn, kể cả đơn đã `refunded`); hoàn tiền thành công là `order_refunded` (đủ) hay
 *   `order_partially_refunded`; lần hoàn chưa thành công (đang chờ, thất bại, thiếu trạng thái) là `order_refund_unconfirmed`.
 * - Cổng báo đã lấy lại đủ tiền (`full`) mà đơn chưa `refunded` thì đơn thành `refunded`, kể cả đơn chưa cấp (webhook hoàn tiền
 *   tới trước khi cấp): `refunded` thuộc SETTLED_STATUSES, nên sau đó không đường nào cấp key hay gửi thư cho đơn này nữa.
 * - Khử trùng theo mã sự kiện: cùng một batch (một transaction) gồm (i) câu đổi trạng thái, (ii) câu ghi nhật ký, đều chỉ có
 *   tác dụng khi nhật ký chưa có dòng nào của sự kiện này, rồi (iii) cảnh báo, chỉ ghi khi (ii) vừa ghi (`changes()` của câu
 *   ngay trước). Cổng gửi lại hay hai request chạy chồng: chỉ một lần có tác dụng. Thiếu mã sự kiện thì không khử trùng được
 *   (`= NULL` không bao giờ đúng): mỗi lần gửi là một sự kiện.
 */
export async function handleRefund(
  env: { DB: D1Database },
  deps: Pick<Deps, "now">,
  provider: string,
  event: RefundEvent,
  actor: string,
): Promise<RefundResult> {
  const db = env.DB;
  const order = await db
    .prepare(
      `SELECT order_code, status, plan, amount, currency, license_id, renew_license_id
       FROM orders WHERE provider = ? AND provider_ref = ?`,
    )
    .bind(provider, event.providerRef)
    .first<Pick<OrderRow, "order_code" | "status" | "plan" | "amount" | "currency" | "license_id" | "renew_license_id">>();
  if (!order) {
    console.warn(JSON.stringify({ event: "refund_unknown_order", provider, reason: event.reason, event_id: event.eventId }));
    // QĐ-7: hoàn tiền hay tranh chấp của phiên không thuộc đơn nào cũng để lại dấu (gửi lại cùng mã thì không ghi thêm).
    await recordUnmatched(db, deps.now(), provider, event, actor);
    return "unknown_order";
  }
  const now = deps.now();
  const action = refundAction(event);
  const detail = {
    event_id: event.eventId,
    reason: event.reason,
    provider_reason: event.providerReason,
    refund_status: event.refundStatus,
    full: event.full,
    refunded_amount: event.refundedAmount,
    provider_amount_paid: event.providerAmountPaid,
    prev_status: order.status,
    plan: order.plan,
    amount: order.amount,
    currency: order.currency,
    license_id: order.license_id ?? order.renew_license_id,
  };
  // ?1 mã đơn, ?2 mã sự kiện: dùng chung cho (i) và (ii).
  const unseen = "NOT EXISTS (SELECT 1 FROM audit_log WHERE order_code = ?1 AND json_extract(detail, '$.event_id') = ?2)";
  const [update, log] = await db.batch([
    db
      .prepare(`UPDATE orders SET status = 'refunded' WHERE order_code = ?1 AND status <> 'refunded' AND ?3 = 1 AND ${unseen}`)
      .bind(order.order_code, event.eventId, event.full ? 1 : 0),
    // Cột license_id (trang license ở Web Admin tra theo cột này) đọc ngay trong câu ghi, từ dòng đơn lúc ghi.
    db
      .prepare(
        `INSERT INTO audit_log (at, actor, action, license_id, order_code, detail)
         SELECT ?3, ?4, ?5, (SELECT COALESCE(license_id, renew_license_id) FROM orders WHERE order_code = ?1), ?1, ?6 WHERE ${unseen}`,
      )
      .bind(order.order_code, event.eventId, now, actor, action, JSON.stringify(detail)),
    // Đứng ngay sau câu ghi nhật ký: sự kiện đã thấy thì câu đó không ghi, nên cũng không có cảnh báo.
    alertIfChanged(db, action, now),
  ]);
  if (log?.meta.changes !== 1) return "duplicate";
  console.warn(
    JSON.stringify({
      event: "order_refund_event",
      order_code: order.order_code,
      action,
      prev_status: order.status,
      // Nhật ký đã ghi nên (i) đã chạy với cùng điều kiện khử trùng: `full` thì đơn chắc chắn đang `refunded`.
      status_after: event.full ? "refunded" : order.status,
      event_id: event.eventId,
    }),
  );
  return update?.meta.changes === 1 ? "refunded" : "noted";
}

/**
 * Webhook đúng chữ ký mà không khớp đơn nào (WebhookEvent `unmatched`; hoàn tiền/tranh chấp `unknown_order`; cò cấp có
 * `reportUnknownOrder` mà mã đơn không có trong D1): khách có thể đã trả tiền mà server không biết (link công khai, Storefront,
 * sản phẩm khác của tài khoản cổng). Một nhật ký `payment_unmatched` không gắn đơn (`detail`: cổng, loại sự kiện hay null, mã ở
 * cổng, mã sự kiện), một cảnh báo cùng tên và một dòng log. Khử trùng theo mã
 * sự kiện như handleRefund: câu ghi nhật ký chỉ có tác dụng khi chưa có nhật ký `payment_unmatched` nào của cùng cổng mang mã
 * này, cảnh báo đứng ngay sau nó trong cùng batch. Thiếu mã sự kiện thì mỗi lần gửi là một sự kiện. Trả về false nếu sự kiện đã
 * ghi rồi.
 */
export async function recordUnmatched(
  db: D1Database,
  now: number,
  provider: string,
  event: { eventType: string | null; providerRef: string | null; eventId: string | null },
  actor: string,
): Promise<boolean> {
  const detail = { provider, event_type: event.eventType, provider_ref: event.providerRef, event_id: event.eventId };
  const [log] = await db.batch([
    db
      .prepare(
        `INSERT INTO audit_log (at, actor, action, detail)
         SELECT ?1, ?2, 'payment_unmatched', ?3
         WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE order_code IS NULL AND action = 'payment_unmatched'
                             AND json_extract(detail, '$.event_id') = ?4 AND json_extract(detail, '$.provider') = ?5)`,
      )
      .bind(now, actor, JSON.stringify(detail), event.eventId, provider),
    alertIfChanged(db, "payment_unmatched", now),
  ]);
  if (log?.meta.changes !== 1) return false;
  console.warn(JSON.stringify({ event: "payment_unmatched", ...detail }));
  return true;
}

/**
 * Cron gửi lại email mua hàng gặp lỗi tạm, tới hạn hẹn, trong 24 giờ sau khi trả tiền, tối đa 20 đơn mỗi lần.
 * Trả về số đơn đã thử gửi.
 */
export async function retryUnsentEmails(env: { DB: D1Database; ENVIRONMENT: string }, deps: Deps): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT o.order_code, o.email, o.grant_kind, l.license_key, l.plan, l.expires_at
     FROM orders o JOIN licenses l ON l.id = o.license_id
     -- email_gave_up_at IS NULL là lớp phòng thủ: đơn đã thôi gửi luôn có email_retry_at NULL và email_attempts > 0.
     WHERE o.status = 'paid' AND o.email IS NOT NULL AND o.email_sent_at IS NULL AND o.email_gave_up_at IS NULL
       AND l.revoked_at IS NULL -- license đã thu hồi thì không gửi key nữa
       AND o.paid_at >= ?1 - 86400
       -- Đã hẹn gửi lại và tới hạn; hoặc chưa thử lần nào sau 5 phút (Worker dừng giữa lúc cấp và gửi).
       -- Không đụng đơn vừa cấp mà thư đang được gửi, để không gửi hai lần.
       AND ((o.email_retry_at IS NOT NULL AND o.email_retry_at <= ?1) OR (o.email_attempts = 0 AND o.paid_at <= ?1 - 300))
     ORDER BY o.paid_at LIMIT 20`,
  )
    .bind(deps.now())
    .all<{
      order_code: number;
      email: string;
      grant_kind: Granted["kind"];
      license_key: string;
      plan: PlanCode;
      expires_at: number;
    }>();
  for (const r of results) {
    // Lỗi ở một đơn (ví dụ D1 lỗi tạm) không chặn các đơn sau; đơn đó được thử lại ở lần cron sau.
    try {
      // Thư gửi lại mang gói và hạn hiện tại của license, có thể mới hơn lúc cấp.
      await mailGranted(env.DB, deps, env.ENVIRONMENT, r, {
        licenseKey: r.license_key,
        plan: r.plan,
        expiresAt: r.expires_at,
        kind: r.grant_kind,
      });
    } catch (err) {
      console.error(JSON.stringify({ event: "email_retry_failed", order_code: r.order_code, error: String(err) }));
    }
  }
  return results.length;
}

export function registerOrders(app: Hono<AppEnv>) {
  // Một endpoint webhook cho mỗi cổng: /v1/webhooks/payos, …; thêm cổng không phải sửa file này.
  app.post("/v1/webhooks/:provider", async (c) => {
    const deps = c.get("deps");
    const name = c.req.param("provider");
    const provider = Object.hasOwn(deps.payments, name) ? deps.payments[name] : undefined;
    if (!provider) return fail(c, 404, "not_found");
    // Thân thô: chữ ký của một số cổng (Creem) tính trên đúng nội dung thân nhận được, nên không parse trước khi kiểm.
    let rawBody: string;
    try {
      rawBody = await c.req.text();
    } catch (err) {
      // Bên gửi ngắt giữa chừng: lỗi của request, không phải của server (không 500). Cổng không nhận được 2xx nên sẽ gửi lại.
      console.warn(JSON.stringify({ event: "webhook_body_unreadable", provider: provider.name, error: String(err) }));
      return fail(c, 400, "invalid_request");
    }
    const event = await provider.verifyWebhook({ rawBody, headers: c.req.raw.headers });
    if (event === "malformed") {
      // Thân không đọc được thành sự kiện (review cuối, N2): không báo sai chữ ký, không tạo cảnh báo webhook_bad_signature
      // và không ghi D1. Với PayOS, thân không phải JSON vào đây khi chưa kiểm chữ ký, nên nhánh này không được tin hay ghi gì
      // ngoài dòng log.
      console.warn(JSON.stringify({ event: "webhook_malformed", provider: provider.name }));
      return fail(c, 400, "invalid_request");
    }
    if (!event) {
      console.warn(JSON.stringify({ event: "webhook_bad_signature", provider: provider.name }));
      // Cảnh báo không bao giờ đổi phản hồi: D1 lỗi lúc ghi cảnh báo thì vẫn trả 400 invalid_signature.
      try {
        await raiseAlert(c.env.DB, "webhook_bad_signature", deps.now());
      } catch (err) {
        console.error(
          JSON.stringify({ event: "webhook_alert_failed", provider: provider.name, kind: "webhook_bad_signature", error: String(err) }),
        );
      }
      return fail(c, 400, "invalid_signature");
    }
    if (event.kind === "ignore") return c.json({ ok: true, result: "ignored" });
    if (event.kind === "unmatched") {
      try {
        const recorded = await recordUnmatched(c.env.DB, deps.now(), name, event, "webhook");
        return c.json({ ok: true, result: recorded ? "unmatched" : "duplicate" });
      } catch (err) {
        // Cổng gửi lại webhook khi nhận mã khác 2xx: lần sau ghi được thì người vận hành vẫn được báo.
        console.error(JSON.stringify({ event: "webhook_unmatched_failed", provider: name, error: String(err) }));
        return fail(c, 503, "temporarily_unavailable");
      }
    }
    if (event.kind === "refund") {
      try {
        return c.json({ ok: true, result: await handleRefund(c.env, deps, name, event, "webhook") });
      } catch (err) {
        // Cổng gửi lại webhook khi nhận mã khác 2xx.
        console.error(JSON.stringify({ event: "webhook_refund_failed", provider: name, error: String(err) }));
        return fail(c, 503, "temporarily_unavailable");
      }
    }
    try {
      const hint = event.providerRef ? { provider: name, providerRef: event.providerRef } : undefined;
      const result = await fulfilOrder(c.env, deps, event.orderCode, "webhook", hint);
      // Cổng đặt reportUnknownOrder (Creem): mã đơn không có trong D1 thì người vận hành được báo như sự kiện không khớp đơn
      // (gửi lại cùng mã thì không ghi thêm). PayOS không đặt: mẫu confirm-webhook mang orderCode lạ, chỉ trả 200.
      if (result === "unknown_order" && event.reportUnknownOrder) {
        const unknown = { ...event.reportUnknownOrder, providerRef: event.providerRef ?? null };
        await recordUnmatched(c.env.DB, deps.now(), name, unknown, "webhook");
      }
      return c.json({ ok: true, result });
    } catch (err) {
      // Cổng gửi lại webhook khi nhận mã khác 2xx; đối soát mỗi 5 phút cũng sẽ xử lý đơn này.
      console.error(JSON.stringify({ event: "webhook_fulfil_failed", order_code: event.orderCode, error: String(err) }));
      return fail(c, 503, "temporarily_unavailable");
    }
  });

  // order_token đi trong header Authorization, không nằm trong URL, để không lọt vào log hay lịch sử (QĐ25).
  app.get("/v1/orders/:orderCode", async (c) => {
    const deps = c.get("deps");
    const orderCode = Number(c.req.param("orderCode"));
    // Scheme "Bearer" không phân biệt hoa thường (RFC 9110, mục 11.1).
    const token = /^bearer +([A-Za-z0-9_-]{43})$/i.exec(c.req.header("authorization") ?? "")?.[1];
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0 || !token) return fail(c, 404, "order_not_found");
    const rl = await hit(c.env, "order_poll", `${clientIp(c)}|${orderCode}`, deps.now());
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    const row = await c.env.DB.prepare(
      `SELECT o.order_code, o.order_token_hash, o.status, o.plan, o.amount, o.currency, o.expires_at,
              o.grant_kind, l.license_key, l.plan AS license_plan, l.expires_at AS license_expires_at
       FROM orders o LEFT JOIN licenses l ON l.id = o.license_id WHERE o.order_code = ?`,
    )
      .bind(orderCode)
      .first<{
        order_code: number;
        order_token_hash: string;
        status: string;
        plan: string;
        amount: number;
        currency: string;
        expires_at: number;
        grant_kind: string | null;
        license_key: string | null;
        license_plan: string | null;
        license_expires_at: number | null;
      }>();
    if (!row || !timingSafeEqual(row.order_token_hash, await sha256Hex(token))) return fail(c, 404, "order_not_found");
    const res: Record<string, unknown> = {
      order_code: row.order_code,
      status: row.status,
      plan: row.plan,
      amount: row.amount,
      currency: row.currency,
      expires_at: row.expires_at,
    };
    if (row.status === "paid" && row.license_key) {
      res.license_key = formatLicenseKey(row.license_key);
      // Gói và hạn hiện tại của license (có thể đã đổi tiếp bởi đơn sau), và kiểu cấp của chính đơn này.
      res.license_plan = row.license_plan;
      res.license_expires_at = row.license_expires_at;
      res.grant_kind = row.grant_kind;
    }
    return c.json(res);
  });
}
