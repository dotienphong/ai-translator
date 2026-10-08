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

/**
 * Từ chối 403 và ghi MỘT dòng log lý do (đọc bằng `wrangler tail`). Phản hồi cho client vẫn chỉ là `forbidden`. Log chỉ có mã
 * lý do và vài dữ kiện không nhạy cảm (8 ký tự đầu của aud, tên các trường danh tính), không có email, token hay giá trị danh tính.
 */
function deny(c: Context, reason: string, extra: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ event: "admin_denied", reason, ...extra }));
  return fail(c, 403, "forbidden");
}

/**
 * Gắn cho mọi route của `app`: kiểm Access và danh tính, chống CSRF, giới hạn body 16 KiB.
 * Phải gọi trước mọi route và `registerX`: Hono không áp middleware cho route đăng ký trước nó, route đó sẽ mở hoàn toàn
 * mà không báo lỗi. Chỉ các middleware gắn header (không trả dữ liệu) được đứng trước.
 */
export function useAdminAuth(app: Hono<AdminAppEnv>, makeDeps: (env: AdminEnv) => AdminDeps): void {
  app.use("*", async (c, next) => {
    const access = (c.executionCtx as ExecutionContext).access;
    const audRequired = c.env.ENVIRONMENT !== "test";
    if (!access) return deny(c, "no_access");
    if (audRequired && !c.env.ACCESS_AUD) return deny(c, "aud_unset");
    if (c.env.ACCESS_AUD && access.aud !== c.env.ACCESS_AUD) {
      return deny(c, "aud_mismatch", { got: String(access.aud).slice(0, 8), want: c.env.ACCESS_AUD.slice(0, 8) });
    }
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (crossSite(c) || (origin && origin !== new URL(c.req.url).origin)) return deny(c, "cross_site");
      if (!/^application\/json\s*(;|$)/i.test(c.req.header("content-type") ?? "")) {
        return fail(c, 415, "unsupported_media_type");
      }
    }
    // Không đọc được email người vận hành (Access lỗi, service token không có email…) thì từ chối: nhật ký phải có danh tính.
    let identity: unknown;
    let identityError: string | undefined;
    try {
      identity = await access.getIdentity();
    } catch (err) {
      identityError = String(err);
    }
    const email = (identity as { email?: unknown } | undefined)?.email;
    if (typeof email !== "string" || email === "") {
      const keys = identity !== null && typeof identity === "object" ? Object.keys(identity) : undefined;
      return deny(c, "no_email", identityError !== undefined ? { identity_error: identityError } : { identity_keys: keys });
    }
    c.set("actor", `admin:${email}`);
    c.set("deps", makeDeps(c.env));
    await next();
  });
  app.use("*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => fail(c, 413, "invalid_request") }));
}
