// Route tài khoản (spec 2026-11-05 §5.1, §5.5, §5.6), đều cần token tài khoản trong header Authorization: Bearer.
//   POST /v1/account/link-license  gắn license vào tài khoản (chỉ từ máy đang kích hoạt license đó)
//   POST /v1/account/delete        xóa tài khoản (giữ google_sub và mốc dùng thử để chống lách "mỗi tài khoản một lần dùng thử")
// Không bao giờ ghi vào log: token, key, email.
import type { Context, Hono } from "hono";
import type { AppEnv } from "./app";
import { b64urlDecode } from "./crypto";
import { loadSigningKey } from "./deps";
import { clientIp, fail, parseDeviceIdHash, parseUuid, readJson, tooMany } from "./http";
import { normalizeLicenseKey } from "./license-key";
import { failureBlock, hit, noteFailure } from "./ratelimit";
import { verifyAccountToken } from "./token";

/** Trần độ dài token: token thật dưới 400 ký tự; chặn chuỗi khổng lồ trước khi giải mã. */
const MAX_TOKEN_LENGTH = 2048;
const decoder = new TextDecoder();

/** Đọc `kid` và `device_id_hash` từ phần claims của token, CHƯA kiểm chữ ký (chỉ để chọn khóa và máy cần kiểm). Hỏng thì null. */
function peekClaims(token: string): { kid: string; deviceIdHash: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json: unknown = JSON.parse(decoder.decode(b64urlDecode(parts[1] ?? "")));
    if (typeof json !== "object" || json === null) return null;
    const c = json as Record<string, unknown>;
    return typeof c.kid === "string" && typeof c.device_id_hash === "string" ? { kid: c.kid, deviceIdHash: c.device_id_hash } : null;
  } catch {
    return null;
  }
}

/**
 * Xác thực token tài khoản trong header Authorization: Bearer. Đúng thì trả `{accountId, deviceIdHash}`; sai (thiếu header, token hỏng,
 * sai chữ ký, sai máy, tài khoản không còn hay đã xóa) thì trả sẵn Response `401 invalid_token`, route chỉ việc `return` nó.
 *
 * `deviceIdHash`: máy mà request nói là của mình (vd. `/v1/trial` gửi trong body); token gắn với máy khác thì `wrong_device`. Bỏ trống thì
 * chấp nhận máy ghi trong token (chữ ký vẫn được kiểm), và `deviceIdHash` trả về là máy đó.
 *
 * Token không có hạn dùng (spec §5.2), nên ở đây luôn tra D1: tài khoản phải còn và chưa `deleted_at`.
 */
export async function authenticateAccount(
  c: Context<AppEnv>,
  deviceIdHash?: string,
): Promise<{ accountId: string; deviceIdHash: string } | Response> {
  const deny = (reason?: "wrong_device") => fail(c, 401, "invalid_token", reason ? { reason } : {});
  const match = /^Bearer ([^\s]+)$/i.exec(c.req.header("authorization") ?? "");
  const token = match?.[1];
  if (!token || token.length > MAX_TOKEN_LENGTH) return deny();
  const peek = peekClaims(token);
  if (!peek) return deny();

  // Token không hết hạn nên phải kiểm được cả khi đã đổi khóa ký (TOKEN_SIGNING_SLOT): thử khóa đang ký, rồi ô còn lại nếu kid khác.
  const active = await c.get("deps").signingKey();
  const publicKeys: Record<string, string> = { [active.kid]: active.publicKey };
  if (peek.kid !== active.kid) {
    try {
      const other = await loadSigningKey(c.env, "next");
      publicKeys[other.kid] = other.publicKey;
    } catch {
      // Ô còn lại thiếu hay hỏng: kid lạ thì bị từ chối như unknown_kid.
    }
  }
  const verified = await verifyAccountToken(token, publicKeys, { deviceIdHash: deviceIdHash ?? peek.deviceIdHash });
  if (!verified.ok) return deny(verified.error === "wrong_device" ? "wrong_device" : undefined);

  const account = await c.env.DB.prepare("SELECT deleted_at FROM accounts WHERE id = ?")
    .bind(verified.claims.account_id)
    .first<{ deleted_at: number | null }>();
  if (!account || account.deleted_at !== null) return deny();
  return { accountId: verified.claims.account_id, deviceIdHash: verified.claims.device_id_hash };
}

export function registerAccount(app: Hono<AppEnv>) {
  app.post("/v1/account/link-license", async (c) => {
    const deps = c.get("deps");
    const db = c.env.DB;
    const now = deps.now();
    const ip = clientIp(c);
    const rl = await hit(c.env, "account_ip", ip, now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    const auth = await authenticateAccount(c);
    if (auth instanceof Response) return auth;
    const body = await readJson(c);
    const key = typeof body?.key === "string" ? normalizeLicenseKey(body.key) : null;
    if (!key) return fail(c, 400, "invalid_request", { field: "key" });
    const activationId = parseUuid(body?.activation_id);
    if (!activationId) return fail(c, 400, "invalid_request", { field: "activation_id" });

    // Dò key qua endpoint này tính vào ngưỡng thất bại của IP như validate/deactivate (QĐ7); IP đang bị chặn thì dừng ở đây.
    const blockedFor = await failureBlock(c.env, ip, now);
    if (blockedFor > 0) return tooMany(c, blockedFor);
    const lic = await db.prepare("SELECT id FROM licenses WHERE license_key = ?").bind(key).first<{ id: string }>();
    if (!lic) {
      await noteFailure(c.env, ip, now, "link_license");
      return fail(c, 404, "invalid_key");
    }
    const act = await db
      .prepare("SELECT device_id_hash, deactivated_at FROM activations WHERE id = ? AND license_id = ?")
      .bind(activationId, lic.id)
      .first<{ device_id_hash: string; deactivated_at: number | null }>();
    if (!act) {
      await noteFailure(c.env, ip, now, "link_license");
      return fail(c, 404, "activation_not_found");
    }
    // Máy đã gỡ không phải đang dò key (như deactivate): không tính thất bại.
    if (act.deactivated_at !== null) return fail(c, 404, "activation_not_found");
    // Chỉ máy đang kích hoạt license mới gắn được: activation của máy khác (token chép sang máy khác cũng vậy) thì từ chối.
    if (act.device_id_hash !== auth.deviceIdHash) return fail(c, 401, "invalid_token", { reason: "wrong_device" });

    // Một câu lệnh nguyên tử: chỉ gắn khi chưa gắn hay đã gắn đúng tài khoản này (idempotent). Gắn tài khoản khác thì không đổi gì.
    const linked = await db
      .prepare("UPDATE licenses SET account_id = ?1 WHERE id = ?2 AND (account_id IS NULL OR account_id = ?1) RETURNING id")
      .bind(auth.accountId, lic.id)
      .first<{ id: string }>();
    if (!linked) return fail(c, 409, "license_linked_other_account");
    return c.json({ ok: true });
  });

  app.post("/v1/account/delete", async (c) => {
    const deps = c.get("deps");
    const now = deps.now();
    const rl = await hit(c.env, "account_ip", clientIp(c), now);
    if (!rl.allowed) return tooMany(c, rl.retryAfter);
    // Body không bắt buộc. Có `device_id_hash` thì token phải gắn đúng máy đó; không có thì chấp nhận máy ghi trong token.
    const body = await readJson(c);
    let deviceIdHash: string | undefined;
    if (body && body.device_id_hash !== undefined) {
      const parsed = parseDeviceIdHash(body.device_id_hash);
      if (!parsed) return fail(c, 400, "invalid_request", { field: "device_id_hash" });
      deviceIdHash = parsed;
    }
    const auth = await authenticateAccount(c, deviceIdHash);
    if (auth instanceof Response) return auth;
    // Một giao dịch (spec §5.5): xóa email, đánh dấu xóa, gỡ liên kết license và máy dùng thử. GIỮ google_sub, trial_started_at,
    // trial_ends_at để xóa rồi đăng nhập lại không có thêm lần dùng thử; trials.started_at/ends_at của máy cũng giữ nguyên.
    const db = c.env.DB;
    await db.batch([
      db.prepare("UPDATE accounts SET email = NULL, deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL").bind(now, auth.accountId),
      db.prepare("UPDATE licenses SET account_id = NULL WHERE account_id = ?").bind(auth.accountId),
      db.prepare("UPDATE trials SET account_id = NULL WHERE account_id = ?").bind(auth.accountId),
    ]);
    return c.json({ ok: true });
  });
}
