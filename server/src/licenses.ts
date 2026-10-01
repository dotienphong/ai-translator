// /v1/licenses/* (§6.8, §10.2): kích hoạt tối đa 2 máy, làm mới token, gỡ máy, gửi lại key.
import type { Context, Hono } from "hono";
import { raiseAlert } from "./alerts";
import type { AppEnv } from "./app";
import { audit, auditStatement } from "./audit";
import { type Deps, sendLicenseMail } from "./deps";
import { clientIp, fail, parseDeviceIdHash, parseDeviceLabel, parseEmail, parseUuid, readJson, tooMany } from "./http";
import { normalizeLicenseKey } from "./license-key";
import { PLAN_NAMES, type PlanCode, type PlanTable, parsePlans } from "./plans";
import { failureBlock, hit, noteFailure } from "./ratelimit";
import { REFRESH_WINDOW_SECONDS, signToken } from "./token";

export const MAX_DEVICES = 2;
/** Trong 30 ngày có hơn 3 lần gỡ (kể cả gỡ từ xa) rồi kích hoạt máy khác thì khóa tạm key (§10.2). */
export const DEACTIVATION_WINDOW_SECONDS = 30 * 86400;
export const MAX_DEACTIVATIONS_IN_WINDOW = 3;

interface LicenseRow {
  id: string;
  plan: PlanCode;
  expires_at: number;
  cycle_anchor: number;
  anchor_applied_at: number;
  revoked_at: number | null;
  locked_at: number | null;
  lock_cleared_at: number | null;
}

interface ActivationRow {
  id: string;
  device_id_hash: string;
  device_label: string | null;
  last_validated_at: number;
}

/** Phần của activation mà token cần. */
interface TokenActivation {
  id: string;
  device_id_hash: string;
  created_at: number;
  quota_epoch: number;
}

const ACT_COLUMNS = "id, device_id_hash, created_at, quota_epoch";
/** Token cấp trong khoảng này sau mốc bắt đầu bộ đếm mới mang quota_fresh = true (QĐ35). */
export const QUOTA_FRESH_SECONDS = 15 * 60;

type KeyLookup = { ok: true; key: string; lic: LicenseRow | null } | { ok: false };

/** Chuẩn hóa key rồi tra license. Key sai định dạng thì ok: false. */
async function findLicense(db: D1Database, rawKey: unknown): Promise<KeyLookup> {
  const key = typeof rawKey === "string" ? normalizeLicenseKey(rawKey) : null;
  if (!key) return { ok: false };
  const lic = await db
    .prepare("SELECT id, plan, expires_at, cycle_anchor, anchor_applied_at, revoked_at, locked_at, lock_cleared_at FROM licenses WHERE license_key = ?")
    .bind(key)
    .first<LicenseRow>();
  return { ok: true, key, lic };
}

/**
 * Ký token theo gói và hạn hiện tại của license; hạn mức lấy theo bảng gói hiện hành.
 * quota_fresh (QĐ35): true khi token cấp trong 15 phút sau mốc muộn nhất trong ba mốc:
 * - lúc tạo activation;
 * - lúc cấp token đầu tiên sau khi admin tăng quota_epoch (epoch_window_start, ghi nguyên tử ngay dưới đây);
 * - lúc server đặt lại cycle_anchor (anchor_applied_at: lúc xử lý đơn đổi gói hay mua lại sau khi hết hạn).
 */
async function issueToken(db: D1Database, deps: Deps, plans: PlanTable, lic: LicenseRow, act: TokenActivation) {
  const key = await deps.signingKey();
  const now = deps.now();
  // Một câu lệnh: nếu đang chờ thì mở cửa sổ từ bây giờ; luôn trả mốc hiện có. Hai request chạy cùng lúc thấy cùng một mốc.
  const epoch = await db
    .prepare(
      `UPDATE activations SET epoch_window_start = CASE WHEN epoch_pending = 1 THEN ?1 ELSE epoch_window_start END,
              epoch_pending = 0
       WHERE id = ?2 RETURNING epoch_window_start`,
    )
    .bind(now, act.id)
    .first<{ epoch_window_start: number | null }>();
  const freshFrom = Math.max(act.created_at, epoch?.epoch_window_start ?? 0, lic.anchor_applied_at);
  const claims = {
    kid: key.kid,
    license_id: lic.id,
    activation_id: act.id,
    activation_created_at: act.created_at,
    device_id_hash: act.device_id_hash,
    plan: lic.plan,
    expires_at: lic.expires_at,
    cycle_anchor: lic.cycle_anchor,
    quota_minutes_per_cycle: plans[lic.plan].quota_minutes_per_cycle,
    quota_epoch: act.quota_epoch,
    quota_fresh: now < freshFrom + QUOTA_FRESH_SECONDS,
    issued_at: now,
    refresh_before: now + REFRESH_WINDOW_SECONDS,
  };
  const token = await signToken(key, claims);
  const { kid: _kid, license_id: _lid, device_id_hash: _dev, issued_at: _iat, ...fields } = claims;
  return { token, ...fields };
}

/** Lỗi chung khi key không dùng được; trả null nếu license còn hiệu lực. */
function licenseProblem(c: Context, lic: LicenseRow, now: number) {
  if (lic.revoked_at !== null) return fail(c, 403, "license_revoked");
  if (now >= lic.expires_at) return fail(c, 403, "license_expired", { expires_at: lic.expires_at });
  return null;
}

async function activeActivations(db: D1Database, licenseId: string): Promise<ActivationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, device_id_hash, device_label, last_validated_at FROM activations
       WHERE license_id = ? AND deactivated_at IS NULL ORDER BY created_at`,
    )
    .bind(licenseId)
    .all<ActivationRow>();
  return results;
}

async function activeById(db: D1Database, activationId: string, licenseId: string) {
  return db
    .prepare(`SELECT ${ACT_COLUMNS} FROM activations WHERE id = ? AND license_id = ? AND deactivated_at IS NULL`)
    .bind(activationId, licenseId)
    .first<TokenActivation>();
}

/** Dòng activation của máy này với license này, đang kích hoạt hay đã gỡ (mỗi cặp có đúng một dòng). */
async function rowFor(db: D1Database, licenseId: string, deviceIdHash: string) {
  return db
    .prepare(`SELECT ${ACT_COLUMNS}, deactivated_at FROM activations WHERE license_id = ? AND device_id_hash = ?`)
    .bind(licenseId, deviceIdHash)
    .first<TokenActivation & { deactivated_at: number | null }>();
}

/**
 * Key sai định dạng, không tồn tại, hay activation lạ: đếm vào ngưỡng thất bại của IP (QĐ7).
 * IP đã chạm ngưỡng thì mọi request có key bị 429 tới hết giờ.
 */
async function blocked(c: Context<AppEnv>, now: number) {
  const wait = await failureBlock(c.env, clientIp(c), now);
  return wait > 0 ? tooMany(c, wait) : null;
}

export function registerLicenses(app: Hono<AppEnv>) {
  app.post("/v1/licenses/activate", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const ip = clientIp(c);
    const rl = await hit(c.env, "activate_ip", ip, now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    const stop = await blocked(c, now);
    if (stop) return stop;
    const body = await readJson(c);
    const deviceIdHash = parseDeviceIdHash(body?.device_id_hash);
    const deviceLabel = parseDeviceLabel(body?.device_label);
    if (!body || !deviceIdHash || !deviceLabel) return fail(c, 400, "invalid_request");
    const found = await findLicense(db, body.key);
    if (!found.ok || !found.lic) {
      await noteFailure(c.env, ip, now, "activate");
      return found.ok ? fail(c, 404, "invalid_key") : fail(c, 400, "invalid_request", { field: "key" });
    }
    const lic = found.lic;
    const problem = licenseProblem(c, lic, now);
    if (problem) return problem;
    const plans = parsePlans(c.env.PLANS);
    if (!plans) return fail(c, 503, "pricing_not_configured");

    const row = await rowFor(db, lic.id, deviceIdHash);
    if (row && row.deactivated_at === null) {
      // Cài lại app trên cùng máy: dùng lại activation, không tốn suất.
      await db
        .prepare("UPDATE activations SET device_label = ?, last_validated_at = ? WHERE id = ?")
        .bind(deviceLabel, now, row.id)
        .run();
      return c.json(await issueToken(db, deps, plans, lic, row));
    }

    // Mọi máy không đang kích hoạt, kể cả máy từng dùng key này, đều qua kiểm khóa tạm (QĐ10).
    if (lic.locked_at !== null) return fail(c, 423, "license_locked");
    const since = Math.max(now - DEACTIVATION_WINDOW_SECONDS, lic.lock_cleared_at ?? 0);
    // Số lần người dùng gỡ trong 30 ngày, trừ các lần gỡ chính máy đang xin kích hoạt:
    // gỡ rồi kích hoạt lại cùng một máy không bị khóa, còn xoay vòng giữa nhiều máy thì bị.
    // Đếm trên bảng deactivations, vì kích hoạt lại dùng lại dòng activation cũ (QĐ35).
    const recent = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM deactivations d JOIN activations a ON a.id = d.activation_id
         WHERE d.license_id = ? AND d.by = 'user' AND d.at > ? AND a.device_id_hash <> ?`,
      )
      .bind(lic.id, since, deviceIdHash)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) > MAX_DEACTIVATIONS_IN_WINDOW) {
      await db.batch([
        db.prepare("UPDATE licenses SET locked_at = ? WHERE id = ?").bind(now, lic.id),
        auditStatement(db, {
          at: now,
          actor: "api",
          action: "license_locked",
          licenseId: lic.id,
          detail: { deactivations: recent?.n },
        }),
      ]);
      console.warn(JSON.stringify({ event: "license_locked", license_id: lic.id }));
      await raiseAlert(db, "license_locked", now);
      return fail(c, 423, "license_locked");
    }

    // Điều kiện đếm suất nằm ngay trong câu lệnh, nên hai máy kích hoạt cùng lúc không vượt được 2 suất.
    const slotFree = `(SELECT COUNT(*) FROM activations WHERE license_id = ?2 AND deactivated_at IS NULL) < ${MAX_DEVICES}`;
    let changed: D1Result;
    let action: string;
    let activationId: string;
    if (row) {
      // Máy từng kích hoạt rồi gỡ: dùng lại đúng dòng cũ, giữ activation_id, created_at, quota_epoch,
      // và không đặt lại cờ quota_fresh (QĐ35).
      activationId = row.id;
      action = "reactivated";
      changed = await db
        .prepare(
          `UPDATE activations SET deactivated_at = NULL, deactivated_by = NULL, device_label = ?3, last_validated_at = ?4
           WHERE id = ?1 AND license_id = ?2 AND deactivated_at IS NOT NULL AND ${slotFree}`,
        )
        .bind(row.id, lic.id, deviceLabel, now)
        .run();
    } else {
      // ON CONFLICT DO NOTHING: cùng một máy gửi hai request cùng lúc thì request sau dùng lại dòng của request trước.
      activationId = crypto.randomUUID();
      action = "activated";
      changed = await db
        .prepare(
          `INSERT INTO activations (id, license_id, device_id_hash, device_label, created_at, last_validated_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE ${slotFree}
           ON CONFLICT DO NOTHING`,
        )
        .bind(activationId, lic.id, deviceIdHash, deviceLabel, now)
        .run();
    }
    if (changed.meta.changes !== 1) {
      const raced = await rowFor(db, lic.id, deviceIdHash);
      if (raced && raced.deactivated_at === null) return c.json(await issueToken(db, deps, plans, lic, raced));
      const list = await activeActivations(db, lic.id);
      return fail(c, 409, "device_limit", {
        activations: list.map((a) => ({
          activation_id: a.id,
          device_label: a.device_label,
          last_validated_at: a.last_validated_at,
        })),
      });
    }
    await audit(db, { at: now, actor: "api", action, licenseId: lic.id, detail: { activation_id: activationId } });
    const act = await activeById(db, activationId, lic.id);
    if (!act) throw new Error(`không thấy activation ${activationId} vừa kích hoạt`);
    return c.json(await issueToken(db, deps, plans, lic, act));
  });

  app.post("/v1/licenses/validate", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const ip = clientIp(c);
    const blockedFor = await failureBlock(c.env, ip, now);
    const body = await readJson(c);
    const activationId = parseUuid(body?.activation_id);
    const found: KeyLookup = body ? await findLicense(db, body.key) : { ok: false };
    const lic = found.ok ? found.lic : null;
    const act = lic && activationId ? await activeById(db, activationId, lic.id) : null;
    // IP đang bị chặn vì thất bại nhiều (QĐ7): chỉ cho qua key hợp lệ kèm activation đang hoạt động và khớp.
    // Mọi request khác trả 429, kể cả key thật mà activation sai, để kẻ dò không phân biệt được key thật với key giả.
    if (blockedFor > 0 && !act) return tooMany(c, blockedFor);
    if (!body || !activationId) return fail(c, 400, "invalid_request");
    if (!found.ok) {
      await noteFailure(c.env, ip, now, "validate");
      return fail(c, 400, "invalid_request", { field: "key" });
    }
    // Đếm theo key đã chuẩn hóa, nên đổi 0↔O hay 1↔I/L không tạo được bộ đếm mới.
    const rl = await hit(c.env, "validate_key", found.key, now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    if (!lic) {
      await noteFailure(c.env, ip, now, "validate");
      return fail(c, 404, "invalid_key");
    }
    // Máy bị gỡ từ xa về Free ở lần validate kế tiếp (§6.8).
    if (!act) {
      await noteFailure(c.env, ip, now, "validate");
      return fail(c, 404, "activation_not_found");
    }
    const problem = licenseProblem(c, lic, now);
    if (problem) return problem;
    const plans = parsePlans(c.env.PLANS);
    if (!plans) return fail(c, 503, "pricing_not_configured");
    await db.prepare("UPDATE activations SET last_validated_at = ? WHERE id = ?").bind(now, act.id).run();
    return c.json(await issueToken(db, deps, plans, lic, act));
  });

  app.post("/v1/licenses/deactivate", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const ip = clientIp(c);
    const rl = await hit(c.env, "deactivate_ip", ip, now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    const blockedFor = await failureBlock(c.env, ip, now);
    const body = await readJson(c);
    const activationId = parseUuid(body?.activation_id);
    const found: KeyLookup = body ? await findLicense(db, body.key) : { ok: false };
    const lic = found.ok ? found.lic : null;
    const act = lic && activationId ? await activeById(db, activationId, lic.id) : null;
    // Như validate: IP đang bị chặn chỉ gỡ được activation đang hoạt động của đúng key đó.
    if (blockedFor > 0 && !act) return tooMany(c, blockedFor);
    if (!body || !activationId) return fail(c, 400, "invalid_request");
    if (!found.ok || !lic) {
      await noteFailure(c.env, ip, now, "deactivate");
      return found.ok ? fail(c, 404, "invalid_key") : fail(c, 400, "invalid_request", { field: "key" });
    }
    if (!act) {
      const known = await db
        .prepare("SELECT 1 AS x FROM activations WHERE id = ? AND license_id = ?")
        .bind(activationId, lic.id)
        .first();
      if (known) return c.json({ ok: true });
      await noteFailure(c.env, ip, now, "deactivate");
      return fail(c, 404, "activation_not_found");
    }
    // Gỡ máy không xóa dòng activation; mỗi lần gỡ ghi một dòng deactivations cho luật khóa tạm.
    // Ghi log trước, với điều kiện activation còn đang kích hoạt, nên hai lần gỡ chạy cùng lúc chỉ ghi một dòng.
    await db.batch([
      db
        .prepare(
          `INSERT INTO deactivations (license_id, activation_id, at, by)
           SELECT ?1, ?2, ?3, 'user' WHERE EXISTS (SELECT 1 FROM activations WHERE id = ?2 AND deactivated_at IS NULL)`,
        )
        .bind(lic.id, act.id, now),
      db
        .prepare("UPDATE activations SET deactivated_at = ?, deactivated_by = 'user' WHERE id = ? AND deactivated_at IS NULL")
        .bind(now, act.id),
      auditStatement(db, { at: now, actor: "api", action: "deactivated", licenseId: lic.id, detail: { activation_id: act.id } }),
    ]);
    return c.json({ ok: true });
  });

  app.post("/v1/licenses/recover", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const body = await readJson(c);
    const email = parseEmail(body?.email);
    if (!email) return fail(c, 400, "invalid_request", { field: "email" });
    const byIp = await hit(c.env, "recover_ip", clientIp(c), now);
    const byEmail = await hit(c.env, "recover_email", email, now);
    if (!byIp.allowed || !byEmail.allowed) return tooMany(c, Math.max(byIp.retryAfter, byEmail.retryAfter));
    // Tra và gửi sau khi trả lời, để thời gian phản hồi không lộ email nào có key.
    c.executionCtx.waitUntil(
      (async () => {
        const { results } = await db
          .prepare(
            "SELECT license_key, plan, expires_at FROM licenses WHERE email = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY expires_at",
          )
          .bind(email, now)
          .all<{ license_key: string; plan: PlanCode; expires_at: number }>();
        if (results.length === 0) return;
        await sendLicenseMail(
          db,
          deps,
          email,
          "recover",
          results.map((r) => ({ licenseKey: r.license_key, planName: PLAN_NAMES[r.plan], expiresAt: r.expires_at })),
        );
      })(),
    );
    return c.json({ ok: true });
  });
}
