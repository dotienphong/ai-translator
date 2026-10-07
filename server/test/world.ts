// Dựng app với đồng hồ giả, PayOS giả, Resend giả và khóa ký test-1 của vector.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createApp } from "../src/app";
import { sha256Hex } from "../src/crypto";
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
      plan: opts.plan ?? "monthly",
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

  /**
   * "Khách B" (review cuối, Q1): một khách khác, để test ranh giới giữa các license và email. B mua bằng email riêng, có
   * 2 máy đang kích hoạt, 3 máy đã gỡ, và 4 lần tự gỡ trong 30 ngày (hơn ngưỡng 3 của luật khóa tạm). B không bị khóa,
   * vì máy cuối kích hoạt lại là máy B tự gỡ. Mọi request của B đi từ IP riêng, không đụng bộ đếm của test.
   */
  async function customerB() {
    const email = "khach-b@example.com";
    const { licenseKey } = await buy({ email, plan: "yearly" });
    const device = (n: number) => sha256Hex(`khach-b-${n}`);
    const ip = (n: number) => ({ "cf-connecting-ip": `192.0.2.${n}` });
    const activate = async (n: number) => {
      const r = await call("POST", "/v1/licenses/activate", { key: licenseKey, device_id_hash: await device(n), device_label: `Máy B${n}` }, ip(n));
      if (r.status !== 200) throw new Error(`khách B kích hoạt máy ${n}: ${r.status} ${JSON.stringify(r.body)}`);
      return r.body.activation_id as string;
    };
    const deactivate = async (id: string, n: number) => {
      const r = await call("POST", "/v1/licenses/deactivate", { key: licenseKey, activation_id: id }, ip(n));
      if (r.status !== 200) throw new Error(`khách B gỡ máy ${n}: ${r.status}`);
    };
    const deactivated: { id: string; deviceIdHash: string }[] = [];
    for (const n of [3, 4, 5]) {
      const id = await activate(n);
      await deactivate(id, n);
      deactivated.push({ id, deviceIdHash: await device(n) });
    }
    const b1 = await activate(1);
    const b2 = await activate(2);
    // Lần gỡ thứ 4 rồi kích hoạt lại đúng máy đó: trừ chính máy này thì còn 3 lần, chưa quá ngưỡng.
    await deactivate(b2, 2);
    if ((await activate(2)) !== b2) throw new Error("khách B: máy 2 không dùng lại activation cũ");
    const lic = await testEnv.DB.prepare("SELECT id FROM licenses WHERE email = ?").bind(email).first<{ id: string }>();
    return {
      email,
      licenseKey,
      licenseId: lic!.id,
      active: [
        { id: b1, deviceIdHash: await device(1), label: "Máy B1" },
        { id: b2, deviceIdHash: await device(2), label: "Máy B2" },
      ],
      deactivated,
    };
  }

  return { clock, payos, resend, deps, app, env: testEnv, call, buy, getOrder, customerB };
}
