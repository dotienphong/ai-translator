import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "./db";
import { makeWorld } from "./world";

beforeEach(resetDb);

const INJECTIONS = ["' OR '1'='1", "1; DROP TABLE licenses; --", '"); DELETE FROM orders; --', "\u0000", "𝕏".repeat(40)];

describe("bảo mật license server (§10.2, §11)", () => {
  it("input độc hại bị từ chối, bảng không đổi", async () => {
    const w = makeWorld();
    const { licenseKey } = await w.buy();
    for (const bad of INJECTIONS) {
      const activate = await w.call("POST", "/v1/licenses/activate", { key: bad, device_id_hash: bad, device_label: bad });
      expect(activate.status).toBe(400);
      const validate = await w.call("POST", "/v1/licenses/validate", { key: licenseKey, activation_id: bad });
      expect(validate.status).toBe(400);
      const recover = await w.call("POST", "/v1/licenses/recover", { email: bad });
      expect(recover.status).toBe(400);
      const checkout = await w.call("POST", "/v1/checkout", { plan: bad, email: "a@example.com", consent: true });
      expect(checkout.status).toBe(400);
      const order = await w.call("GET", `/v1/orders/${encodeURIComponent(bad)}`, undefined, {
        authorization: `Bearer ${encodeURIComponent(bad)}`,
      });
      expect(order.status).toBe(404);
    }
    const counts = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM licenses) AS l, (SELECT COUNT(*) FROM orders) AS o",
    ).first();
    expect(counts).toEqual({ l: 1, o: 1 });
  });

  it("Worker API không có /admin", async () => {
    expect((await makeWorld().call("GET", "/admin/lookup?email=a@example.com")).status).toBe(404);
  });

  it("lỗi của PayOS không lộ ra response", async () => {
    const w = makeWorld();
    w.payos.down = true;
    const res = await w.call("POST", "/v1/checkout", { plan: "pro", email: "a@example.com", consent: true });
    expect(res.body).toEqual({ error: "payment_provider_error" });
  });
});
