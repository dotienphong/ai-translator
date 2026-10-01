// Dựng app với đồng hồ giả, PayOS giả, Resend giả và khóa ký test-1 của vector.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createApp } from "../src/app";
import type { Deps } from "../src/deps";
import { ResendEmailProvider } from "../src/email/resend";
import type { ApiEnv } from "../src/env";
import { PayOSProvider } from "../src/payment/payos";
import { importSigningKey } from "../src/token";
import { FakePayOS, FakeResend, TEST_CHECKSUM_KEY } from "./fakes";
import { testSigningJwk } from "./keys";

/** 2026-10-01T00:00:00Z */
export const T0 = 1_790_812_800;
export const DAY = 86400;

export interface CallResult {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

export function makeWorld(envOverride: Partial<ApiEnv> = {}) {
  const clock = { now: T0 };
  const payos = new FakePayOS(TEST_CHECKSUM_KEY, () => clock.now);
  const resend = new FakeResend();
  const deps: Deps = {
    now: () => clock.now,
    payments: {
      payos: new PayOSProvider(
        { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: TEST_CHECKSUM_KEY },
        payos.fetch,
      ),
    },
    email: new ResendEmailProvider({ apiKey: "re_test", from: "AI Translator <noreply@mt.test>" }, resend.fetch),
    signingKey: async () => importSigningKey(await testSigningJwk("test-1")),
  };
  const app = createApp(() => deps);
  const testEnv: ApiEnv = { ...env, ...envOverride };

  async function call(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<CallResult> {
    const init: RequestInit = {
      method,
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10", ...headers },
    };
    if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`https://license.test${path}`, init), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { text };
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  /** Mua trọn một đơn: checkout, khách trả đủ tiền, PayOS gửi webhook. Trả về key đã cấp. */
  async function buy(opts: { plan?: string; email?: string; licenseKey?: string } = {}) {
    const req: Record<string, unknown> = {
      plan: opts.plan ?? "pro",
      email: opts.email ?? "buyer@example.com",
      consent: true,
    };
    if (opts.licenseKey) req.license_key = opts.licenseKey;
    const co = await call("POST", "/v1/checkout", req);
    if (co.status !== 201) throw new Error(`checkout ${co.status} ${JSON.stringify(co.body)}`);
    const orderCode = co.body.order_code as number;
    payos.pay(orderCode);
    const wh = await call("POST", "/v1/webhooks/payos", await payos.webhookBody(orderCode));
    if (wh.status !== 200) throw new Error(`webhook ${wh.status}`);
    const order = await getOrder(orderCode, co.body.order_token as string);
    return { orderCode, orderToken: co.body.order_token as string, licenseKey: order.body.license_key as string };
  }

  /** App hỏi trạng thái đơn: order_token trong header Authorization. */
  function getOrder(orderCode: number | string, token: string) {
    return call("GET", `/v1/orders/${orderCode}`, undefined, { authorization: `Bearer ${token}` });
  }

  return { clock, payos, resend, deps, app, env: testEnv, call, buy, getOrder };
}
