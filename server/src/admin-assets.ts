// Trang Web Admin (spec 2026-10-07 Web Admin §2): SPA build từ admin-ui/, phục vụ qua binding ASSETS. wrangler.admin.jsonc
// đặt run_worker_first: true, nên mọi request, kể cả file tĩnh, đi qua middleware kiểm Access (admin-auth.ts) trước khi tới đây.
// Header bảo mật gắn cho mọi phản hồi của Worker admin (trang, JSON, 403).
import type { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AdminAppEnv } from "./admin-auth";
import { fail } from "./http";

export const ADMIN_SECURE_HEADERS: Parameters<typeof secureHeaders>[0] = {
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
  },
  referrerPolicy: "no-referrer",
  xFrameOptions: "DENY",
};

/** Đăng ký SAU mọi route /admin/*: GET còn lại (trừ /admin…) là trang của SPA. */
export function registerAssets(app: Hono<AdminAppEnv>): void {
  app.get("*", async (c) => {
    const path = c.req.path;
    if (path === "/admin" || path.startsWith("/admin/") || !c.env.ASSETS) return fail(c, 404, "not_found");
    const res = await c.env.ASSETS.fetch(c.req.raw);
    // Header của phản hồi từ binding không sửa được; chép sang Response mới để middleware gắn header bảo mật.
    return new Response(res.body, res);
  });
}
