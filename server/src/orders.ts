// Vòng đời đơn hàng sau khi tạo (§6.8, §9): webhook của cổng thanh toán, app hỏi trạng thái,
// cấp license mới, gia hạn hoặc đổi gói, gửi lại email chưa gửi được.
import type { Hono } from "hono";
import { raiseAlert } from "./alerts";
import type { AppEnv } from "./app";
import { audit } from "./audit";
import { sha256Hex, timingSafeEqual } from "./crypto";
import { type Deps, sendLicenseMail } from "./deps";
import { clientIp, fail, tooMany } from "./http";
import { formatLicenseKey, generateLicenseKey } from "./license-key";
import { computeGrant, type GrantTerms, isPlan, PLAN_NAMES, type PlanCode, type PlanTable, parsePlans } from "./plans";
import { hit } from "./ratelimit";

export interface OrderRow {
  order_code: number;
  provider: string;
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
      `SELECT order_code, provider, status, plan, amount, amount_paid, currency, email, renew_license_id, license_id,
              created_at, expires_at
       FROM orders WHERE order_code = ?`,
    )
    .bind(orderCode)
    .first<OrderRow>();
}

/**
 * Thời điểm thanh toán của đơn (QĐ33): thời điểm cổng báo, kẹp trong khoảng từ lúc tạo link tới lúc link hết hạn.
 * Cổng không báo thì dùng lúc xử lý, cũng kẹp như vậy.
 */
export function paymentTime(order: Pick<OrderRow, "created_at" | "expires_at">, reported: number | null, now: number): number {
  return Math.min(Math.max(reported ?? now, order.created_at), order.expires_at);
}

/** Số lần thử lại khi license bị một đơn khác đổi cùng lúc (QĐ32). */
const GRANT_ATTEMPTS = 5;

/**
 * Trạng thái mà đơn không bao giờ được áp lại: đã cấp (`paid`), hay license đã thu hồi nhận được tiền và đang chờ
 * người vận hành xử lý (`paid_needs_review`, QĐ37), hay người vận hành đã ghi là hoàn tiền ngoài hệ thống (`refunded`).
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
      mark = db
        .prepare(
          `UPDATE orders SET status = 'paid', paid_at = ?2, amount_paid = ?3, license_id = ?4, grant_kind = ?5, last_checked_at = ?2
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
    await opts.beforeCommit?.();
    const results = await db.batch([write, mark]);
    if (results[1]?.meta.changes !== 1) {
      if (order.renew_license_id !== null && !opts.resolveAsNewLicense) {
        // License đã thu hồi: không áp đơn, chuyển đơn sang chờ người vận hành (QĐ37).
        const review = await db
          .prepare(
            `UPDATE orders SET status = 'paid_needs_review', paid_at = ?2, amount_paid = ?3, last_checked_at = ?2
             WHERE order_code = ?1 AND ${NOT_SETTLED}
               AND EXISTS (SELECT 1 FROM licenses WHERE id = ?4 AND revoked_at IS NOT NULL)`,
          )
          .bind(order.order_code, opts.now, opts.amountPaid, licenseId)
          .run();
        if (review.meta.changes === 1) {
          console.warn(JSON.stringify({ event: "order_needs_review", order_code: order.order_code }));
          await raiseAlert(db, "order_needs_review", opts.now);
          await audit(db, {
            at: opts.now,
            actor: opts.actor,
            action: "order_needs_review",
            licenseId,
            orderCode: order.order_code,
            detail: { reason: "license_revoked", plan, amount_paid: opts.amountPaid, paid_at: at },
          });
          return "needs_review";
        }
      }
      const st = await db.prepare("SELECT status FROM orders WHERE order_code = ?").bind(order.order_code).first<{ status: string }>();
      if ((SETTLED_STATUSES as readonly string[]).includes(st?.status ?? "")) return "already_settled";
      continue; // license vừa bị một đơn khác đổi: đọc lại và tính lại
    }
    const lic = await db.prepare("SELECT license_key FROM licenses WHERE id = ?").bind(licenseId).first<{ license_key: string }>();
    if (!lic) throw new Error(`không thấy license ${licenseId} sau khi cấp`);
    await audit(db, {
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
      },
    });
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
 * Lỗi tạm (401, 403, 409, 429, 5xx, mạng) thì hẹn lần gửi lại; lỗi vĩnh viễn (400, 422) thì thôi.
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

export type FulfilResult = "granted" | "already_paid" | "needs_review" | "not_paid" | "unknown_order";

/**
 * Hỏi cổng thanh toán của đơn (orders.provider) trạng thái thật rồi xử lý (§6.8): chỉ cấp khi status paid,
 * amountPaid ≥ amount và amount khớp đơn. Dùng chung cho webhook và đối soát. Lỗi mạng thì ném cho bên gọi.
 */
export async function fulfilOrder(
  env: { DB: D1Database; ENVIRONMENT: string; PLANS?: unknown },
  deps: Deps,
  orderCode: number,
  actor: string,
): Promise<FulfilResult> {
  const order = await loadOrder(env.DB, orderCode);
  if (!order) return "unknown_order";
  if (order.status === "paid_needs_review") return "needs_review";
  if ((SETTLED_STATUSES as readonly string[]).includes(order.status)) return "already_paid";
  const provider = Object.hasOwn(deps.payments, order.provider) ? deps.payments[order.provider] : undefined;
  if (!provider) throw new Error(`không có cổng thanh toán ${order.provider}`);
  const now = deps.now();
  const st = await provider.getPaymentStatus(orderCode);
  const amountMatches = st.amount === order.amount;
  if (amountMatches && st.status === "paid" && st.amountPaid >= st.amount) {
    const plans = parsePlans(env.PLANS);
    if (!plans) throw new Error("bảng gói (PLANS) chưa cấu hình hoặc sai");
    const granted = await grantOrder(env.DB, plans, order, {
      now,
      paidAt: paymentTime(order, st.paidAt, now),
      amountPaid: st.amountPaid,
      actor,
    });
    if (granted === "already_settled") return "already_paid";
    // Đơn chờ người vận hành: không gửi thư key.
    if (granted === "needs_review") return "needs_review";
    await mailGranted(env.DB, deps, env.ENVIRONMENT, order, granted);
    return "granted";
  }
  // Số tiền của cổng khác số tiền của đơn là bất thường: không cấp, để người vận hành xem (admin cấp tay nếu đúng).
  const local = !amountMatches ? "failed" : st.status === "paid" ? "underpaid" : st.status;
  const changed = await env.DB.prepare(
    `UPDATE orders SET status = ?2, amount_paid = ?3, last_checked_at = ?4 WHERE order_code = ?1 AND ${NOT_SETTLED}`,
  )
    .bind(orderCode, local, st.amountPaid, now)
    .run();
  const action = !amountMatches ? "order_amount_mismatch" : local === "underpaid" ? "order_underpaid" : null;
  if (action && changed.meta.changes === 1 && (order.status !== local || order.amount_paid !== st.amountPaid)) {
    if (!amountMatches) console.warn(JSON.stringify({ event: "order_amount_mismatch", order_code: orderCode }));
    await audit(env.DB, {
      at: now,
      actor,
      action,
      orderCode,
      detail: { amount: order.amount, provider_amount: st.amount, amount_paid: st.amountPaid },
    });
  }
  return "not_paid";
}

/** Cron gửi lại email mua hàng gặp lỗi tạm, tới hạn hẹn, trong 24 giờ sau khi trả tiền, tối đa 20 đơn mỗi lần. */
export async function retryUnsentEmails(env: { DB: D1Database; ENVIRONMENT: string }, deps: Deps): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT o.order_code, o.email, o.grant_kind, l.license_key, l.plan, l.expires_at
     FROM orders o JOIN licenses l ON l.id = o.license_id
     -- email_gave_up_at IS NULL là lớp phòng thủ: đơn đã thôi gửi luôn có email_retry_at NULL và email_attempts > 0.
     WHERE o.status = 'paid' AND o.email IS NOT NULL AND o.email_sent_at IS NULL AND o.email_gave_up_at IS NULL
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
    // Thư gửi lại mang gói và hạn hiện tại của license, có thể mới hơn lúc cấp.
    await mailGranted(env.DB, deps, env.ENVIRONMENT, r, {
      licenseKey: r.license_key,
      plan: r.plan,
      expiresAt: r.expires_at,
      kind: r.grant_kind,
    });
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
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, "invalid_request");
    }
    const event = await provider.verifyWebhook(body);
    if (!event) {
      console.warn(JSON.stringify({ event: "webhook_bad_signature", provider: provider.name }));
      await raiseAlert(c.env.DB, "webhook_bad_signature", deps.now());
      return fail(c, 400, "invalid_signature");
    }
    try {
      const result = await fulfilOrder(c.env, deps, event.orderCode, "webhook");
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
