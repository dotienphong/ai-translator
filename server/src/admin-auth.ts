// Lớp kiểm request chung của Worker admin (§6.8 "Công cụ hỗ trợ"), dùng cho mọi route: thao tác (admin.ts), route đọc
// (admin-read.ts) và trang Web Admin (admin-assets.ts). Tách khỏi admin.ts theo spec Web Admin §3.3.
// Worker đặt sau Cloudflare Access ("Protect this Worker") và tự kiểm lại: request không qua Access thì không có
// ctx.access và bị từ chối (403); ngoài test (tức production), ACCESS_AUD là bắt buộc và phải khớp; không đọc được email
// người vận hành từ Access thì cũng 403. Request thay đổi dữ liệu phải là JSON cùng origin (chống CSRF).
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { EmailProvider } from "./email/provider";
import type { AdminEnv } from "./env";
import { fail } from "./http";
import type { PayOSProvider } from "./payment/payos";
import type { PaymentProvider } from "./payment/provider";
import type { KeyCheck } from "./token";

export interface AdminDeps {
  now(): number;
  payments: Record<string, PaymentProvider>;
  payos: Pick<PayOSProvider, "confirmWebhook">;
  email: EmailProvider;
  /** Bảng gói của Worker API cùng môi trường (qua service binding, QĐ34), chưa kiểm. */
  plans(): Promise<unknown>;
  /** Token ký thử bằng khóa dự phòng của Worker API (QĐ31). */
  keyCheck(): Promise<KeyCheck>;
}

export type AdminAppEnv = { Bindings: AdminEnv; Variables: { deps: AdminDeps; actor: string } };

/** Trình duyệt báo request đến từ trang khác (Sec-Fetch-Site không phải same-origin hay none). Không có header thì không chặn (cloudflared). */
export function crossSite(c: Context): boolean {
  const site = c.req.header("sec-fetch-site");
  return site !== undefined && site !== "same-origin" && site !== "none";
}

/** Gắn cho mọi route của `app`: kiểm Access và danh tính, chống CSRF, giới hạn body 16 KiB. */
export function useAdminAuth(app: Hono<AdminAppEnv>, makeDeps: (env: AdminEnv) => AdminDeps): void {
  app.use("*", async (c, next) => {
    const access = (c.executionCtx as ExecutionContext).access;
    const audRequired = c.env.ENVIRONMENT !== "test";
    if (!access || (audRequired && !c.env.ACCESS_AUD) || (c.env.ACCESS_AUD && access.aud !== c.env.ACCESS_AUD)) {
      return fail(c, 403, "forbidden");
    }
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (crossSite(c) || (origin && origin !== new URL(c.req.url).origin)) {
        return fail(c, 403, "forbidden");
      }
      if (!/^application\/json\s*(;|$)/i.test(c.req.header("content-type") ?? "")) {
        return fail(c, 415, "unsupported_media_type");
      }
    }
    // Không đọc được email người vận hành (Access lỗi, service token không có email…) thì từ chối: nhật ký phải có danh tính.
    let email: unknown;
    try {
      email = (await access.getIdentity())?.email;
    } catch {
      email = undefined;
    }
    if (typeof email !== "string" || email === "") return fail(c, 403, "forbidden");
    c.set("actor", `admin:${email}`);
    c.set("deps", makeDeps(c.env));
    await next();
  });
  app.use("*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, "invalid_request") }));
}
