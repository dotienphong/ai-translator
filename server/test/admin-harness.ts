// Bộ dựng test cho Worker admin: app admin dùng đồng hồ, PayOS và Resend giả của makeWorld; Access giả qua ctx.access.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createAdminApp } from "../src/admin";
import { signKeyCheck } from "../src/deps";
import type { AdminEnv, ApiEnv } from "../src/env";
import { PayOSProvider } from "../src/payment/payos";
import type { KeyCheck } from "../src/token";
import { TEST_CHECKSUM_KEY } from "./fakes";
import { testSigningJwk } from "./keys";
import { makeWorld } from "./world";

export const ADMIN = "https://admin.test";
export const API_ORIGIN = "https://mt-license.example.workers.dev";

export interface AdminCall {
  method?: string;
  body?: unknown;
  /** null: request không đi qua Access (không có ctx.access). */
  operator?: string | null;
  aud?: string;
  headers?: Record<string, string>;
  rawBody?: string;
  /** Thay getIdentity() của Access (mặc định trả `{ email: operator }`). */
  getIdentity?: () => Promise<unknown>;
}

/** Môi trường của Worker API với hai khóa test của vector: ô A (test-1) đang ký, ô B (test-2) dự phòng. */
export async function apiKeyEnv(): Promise<ApiEnv> {
  return { ...env, TOKEN_SIGNING_KEY_A: await testSigningJwk("test-1"), TOKEN_SIGNING_KEY_B: await testSigningJwk("test-2") };
}

export interface AdminOpts {
  /** Thay cho service binding API.plans() (mặc định: biến PLANS của Worker API trong test). */
  plans?: () => Promise<unknown>;
  keyCheck?: () => Promise<KeyCheck>;
}

export function makeAdmin(adminEnv: Partial<AdminEnv> = {}, opts: AdminOpts = {}) {
  const w = makeWorld();
  const payos = new PayOSProvider(
    { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: TEST_CHECKSUM_KEY },
    w.payos.fetch,
  );
  const admin = createAdminApp(() => ({
    now: () => w.clock.now,
    payments: { payos },
    payos,
    email: w.deps.email,
    plans: opts.plans ?? (async () => env.PLANS),
    keyCheck: opts.keyCheck ?? (async () => signKeyCheck(await apiKeyEnv(), w.clock.now)),
  }));
  const fullEnv = { ...env, API_ORIGIN, ...adminEnv } as AdminEnv;

  /** Gọi Worker admin, trả Response gốc (để đọc header, trang HTML). */
  async function adminFetch(path: string, opts: AdminCall = {}): Promise<Response> {
    const { method = opts.body === undefined && opts.rawBody === undefined ? "GET" : "POST", operator = "ops@example.com", aud = "aud-1" } = opts;
    const ctx = createExecutionContext();
    if (operator !== null) {
      Object.defineProperty(ctx, "access", { value: { aud, getIdentity: opts.getIdentity ?? (async () => ({ email: operator })) } });
    }
    const headers: Record<string, string> = method === "GET" ? {} : { "content-type": "application/json" };
    const init: RequestInit = { method, headers: { ...headers, ...opts.headers } };
    if (opts.rawBody !== undefined) init.body = opts.rawBody;
    else if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    const res = await admin.fetch(new Request(`${ADMIN}${path}`, init), fullEnv, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }

  async function adminCall(path: string, opts: AdminCall = {}) {
    const res = await adminFetch(path, opts);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }
  return { w, adminCall, adminFetch };
}

export const licenseRow = () => env.DB.prepare("SELECT * FROM licenses").first<Record<string, unknown>>();
export const auditCount = async (action: string) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = ?").bind(action).first<{ n: number }>())?.n;
export const lastAudit = () => env.DB.prepare("SELECT actor, action, order_code, detail FROM audit_log ORDER BY id DESC LIMIT 1").first();
