// Dựng tài khoản và token tài khoản thẳng trong D1 (không đi qua luồng đăng nhập Google) cho test account và trial.
import { env } from "cloudflare:workers";
import { signAccountToken } from "../src/token";
import type { makeWorld } from "./world";

export interface TestAccount {
  accountId: string;
  deviceIdHash: string;
  token: string;
  bearer: Record<string, string>;
}

/** Tạo một dòng `accounts` còn hoạt động và ký token tài khoản gắn với `deviceIdHash`. `sub` khác nhau cho tài khoản khác nhau. */
export async function makeAccount(
  w: ReturnType<typeof makeWorld>,
  deviceIdHash: string,
  opts: { sub?: string; email?: string; trialStartedAt?: number | null; trialEndsAt?: number | null } = {},
): Promise<TestAccount> {
  const accountId = crypto.randomUUID();
  const now = w.clock.now;
  await env.DB.prepare(
    `INSERT INTO accounts (id, google_sub, email, email_verified, consent_at, lang, created_at, last_login_at, trial_started_at, trial_ends_at)
     VALUES (?1, ?2, ?3, 1, ?4, 'vi', ?4, ?4, ?5, ?6)`,
  )
    .bind(accountId, opts.sub ?? `sub-${accountId}`, opts.email ?? "nguoi.dung@example.com", now, opts.trialStartedAt ?? null, opts.trialEndsAt ?? null)
    .run();
  const token = await accountToken(w, accountId, deviceIdHash);
  return { accountId, deviceIdHash, token, bearer: { authorization: `Bearer ${token}` } };
}

async function accountToken(w: ReturnType<typeof makeWorld>, accountId: string, deviceIdHash: string): Promise<string> {
  const key = await w.deps.signingKey();
  return signAccountToken(key, { typ: "account", kid: key.kid, account_id: accountId, device_id_hash: deviceIdHash, issued_at: w.clock.now });
}

/** Header Authorization cho một tài khoản đã có, trên một máy khác (đăng nhập cùng tài khoản ở máy thứ hai). */
export async function makeAccountToken(w: ReturnType<typeof makeWorld>, accountId: string, deviceIdHash: string): Promise<Record<string, string>> {
  return { authorization: `Bearer ${await accountToken(w, accountId, deviceIdHash)}` };
}

export const accountRow = (accountId: string) =>
  env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(accountId).first<Record<string, unknown>>();
