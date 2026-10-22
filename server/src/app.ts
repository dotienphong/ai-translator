// Worker API công khai (spec §6.8). Route nhận phụ thuộc qua `deps` để test thay được PayOS, Resend, đồng hồ.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { registerCheckout } from "./checkout";
import { type Deps, type DepsFactory, realDeps } from "./deps";
import { DIAGNOSTICS_PATH, registerDiagnostics } from "./diagnostics";
import type { ApiEnv } from "./env";
import { MAX_BODY_BYTES } from "./error-reports";
import { fail, isJsonContentType } from "./http";
import { registerLicenses } from "./licenses";
import { registerOrders } from "./orders";
import { registerSupport, supportCors } from "./support/routes";
import { registerZaloWebhook } from "./support/webhook";
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
  // CORS của khung chat trên website (spec 2026-10-22 §1): trước mọi middleware có thể trả lỗi (413, 415), để trình duyệt đọc được thân lỗi.
  app.use("/v1/support/*", supportCors);
  const smallBody = bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) => {
      // Webhook quá lớn bị từ chối thì cổng gửi lại vài lần rồi bỏ (hoàn tiền, tranh chấp không có đối soát đỡ): để lại dấu vết.
      if (c.req.path.startsWith("/v1/webhooks/")) console.warn(JSON.stringify({ event: "webhook_too_large", path: c.req.path }));
      return fail(c, 413, "invalid_request");
    },
  });
  // Báo cáo lỗi mang log nên có trần riêng (spec 2026-10-17 §3); mọi route khác của /v1 giữ 16 KiB.
  app.use("/v1/*", (c, next) => (c.req.path === DIAGNOSTICS_PATH ? next() : smallBody(c, next)));
  app.use(DIAGNOSTICS_PATH, bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => fail(c, 413, "invalid_request") }));
  // Webhook do cổng thanh toán gửi, có chữ ký riêng: không đòi content-type, để cổng đổi header cũng không làm mất đơn.
  app.use("/v1/*", async (c, next) => {
    const write = ["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method);
    if (write && !c.req.path.startsWith("/v1/webhooks/") && !isJsonContentType(c.req.header("content-type"))) {
      return fail(c, 415, "unsupported_media_type");
    }
    await next();
  });
  app.get("/v1/health", (c) => c.json({ ok: true }));
  // Trước registerOrders: route `/v1/webhooks/:provider` của cổng thanh toán bắt cả `/v1/webhooks/zalo` và trả 404 (Hono chọn route khớp đầu tiên).
  registerZaloWebhook(app);
  registerCheckout(app);
  registerOrders(app);
  registerLicenses(app);
  registerTrial(app);
  registerDiagnostics(app);
  registerSupport(app);
  app.notFound((c) => fail(c, 404, "not_found"));
  app.onError((err, c) => {
    console.error(JSON.stringify({ event: "unhandled", name: err.name, message: err.message }));
    return fail(c, 500, "internal");
  });
  return app;
}
