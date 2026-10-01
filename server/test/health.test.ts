import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("GET /v1/health trả 200", async () => {
  const res = await exports.default.fetch("https://example.com/v1/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
