// Worker API công khai (spec §6.8). Route nhận phụ thuộc qua `deps` để test thay được PayOS, Resend, đồng hồ.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { registerCheckout } from "./checkout";
import { type Deps, type DepsFactory, realDeps } from "./deps";
import type { ApiEnv } from "./env";
import { fail } from "./http";
import { registerLicenses } from "./licenses";
import { registerOrders } from "./orders";

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
  app.get("/v1/health", (c) => c.json({ ok: true }));
  registerCheckout(app);
  registerOrders(app);
  registerLicenses(app);
  app.notFound((c) => fail(c, 404, "not_found"));
  app.onError((err, c) => {
    console.error(JSON.stringify({ event: "unhandled", name: err.name, message: err.message }));
    return fail(c, 500, "internal");
  });
  return app;
}
