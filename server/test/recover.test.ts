import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./db";
import { DAY, makeWorld, T0 } from "./world";

beforeEach(resetDb);

describe("POST /v1/licenses/recover", () => {
  it("gửi mọi key còn hiệu lực của email vào chính email đó", async () => {
    const w = makeWorld();
    const a = await w.buy({ email: "buyer@example.com" });
    const b = await w.buy({ email: "buyer@example.com", plan: "pro_x2" });
    const revoked = await w.buy({ email: "buyer@example.com" });
    await env.DB.prepare("UPDATE licenses SET revoked_at = 1 WHERE license_key = ?")
      .bind(revoked.licenseKey.replace(/-/g, ""))
      .run();
    w.resend.sent.length = 0;
    const res = await w.call("POST", "/v1/licenses/recover", { email: "BUYER@example.com" });
    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    expect(w.resend.sent).toHaveLength(1);
    const mail = w.resend.sent[0]!;
    expect(mail.to).toEqual(["buyer@example.com"]);
    expect(mail.text).toContain(a.licenseKey);
    expect(mail.text).toContain(b.licenseKey);
    expect(mail.text).not.toContain(revoked.licenseKey);
  });

  it("email không có key: vẫn 200 với cùng body, không gửi gì", async () => {
    const w = makeWorld();
    const res = await w.call("POST", "/v1/licenses/recover", { email: "nobody@example.com" });
    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    expect(w.resend.sent).toHaveLength(0);
  });

  it("key đã hết hạn không được gửi", async () => {
    const w = makeWorld();
    await w.buy({ email: "old@example.com" });
    w.resend.sent.length = 0;
    w.clock.now = T0 + 31 * DAY;
    await w.call("POST", "/v1/licenses/recover", { email: "old@example.com" });
    expect(w.resend.sent).toHaveLength(0);
  });

  it("quá 3 lần mỗi giờ mỗi email thì 429", async () => {
    const w = makeWorld();
    for (let i = 0; i < 3; i++) {
      const r = await w.call("POST", "/v1/licenses/recover", { email: "x@example.com" }, { "cf-connecting-ip": `198.51.100.${i}` });
      expect(r.status).toBe(200);
    }
    const res = await w.call("POST", "/v1/licenses/recover", { email: "x@example.com" }, { "cf-connecting-ip": "198.51.100.9" });
    expect(res.status).toBe(429);
  });

  it("email sai định dạng thì 400", async () => {
    const res = await makeWorld().call("POST", "/v1/licenses/recover", { email: "abc" });
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_request", field: "email" } });
  });
});
