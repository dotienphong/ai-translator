// Worker API công khai (spec §6.8). Route nhận phụ thuộc qua `deps` để test thay được PayOS, Resend, đồng hồ.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { registerCheckout } from "./checkout";
import { type Deps, type DepsFactory, realDeps } from "./deps";
import type { ApiEnv } from "./env";
import { fail, isJsonContentType } from "./http";
import { registerLicenses } from "./licenses";
import { registerOrders } from "./orders";
import { registerTrial } from "./trial";

export type AppEnv = { Bindings: ApiEnv; Variables: { deps: Deps } };

export function createApp(makeDeps: DepsFactory = realDeps) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    // Chỉ HTTPS (§10.2). Riêng test (ENVIRONMENT=test, chỉ có trong vitest.config.ts) thì bỏ qua.
    if (c.env.ENVIRONMENT !== "test" && new URL(c.req.url).protocol !== "https:") return fail(c, 403, "forbidden");
    c.set("deps", makeDeps(c.env));
    await next();
  });
  app.use("/v1/*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, "invalid_request") }));
  // Webhook do cổng thanh toán gửi, có chữ ký riêng: không đòi content-type, để cổng đổi header cũng không làm mất đơn.
  app.use("/v1/*", async (c, next) => {
    const write = ["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method);
    if (write && !c.req.path.startsWith("/v1/webhooks/") && !isJsonContentType(c.req.header("content-type"))) {
      return fail(c, 415, "unsupported_media_type");
    }
    await next();
  });
  app.get("/v1/health", (c) => c.json({ ok: true }));
  registerCheckout(app);
  registerOrders(app);
  registerLicenses(app);
  registerTrial(app);
  app.notFound((c) => fail(c, 404, "not_found"));
  app.onError((err, c) => {
    console.error(JSON.stringify({ event: "unhandled", name: err.name, message: err.message }));
    return fail(c, 500, "internal");
  });
  return app;
}
