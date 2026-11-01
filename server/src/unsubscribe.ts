// Link "Ngừng nhận thư nhắc gia hạn" trong thư nhắc (src/reminders.ts). Nằm ngoài /v1: người bấm là người đọc thư, không phải app,
// nên route nhận form thường (không phải JSON) và trả trang HTML nhỏ.
// - GET chỉ hiện trang có một nút xác nhận: trình quét link của hộp thư mở link thư tự động nhưng không bấm nút, nên không ngừng nhận thay khách.
// - POST ghi mã băm email vào reminder_optouts. Mã trong link do server ký (HMAC), nên không ai ngừng nhận thay người khác được.
// Chỉ chặn thư nhắc gia hạn; thư key và thư giao dịch khác không bị ảnh hưởng.
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "./app";
import { clientIp } from "./http";
import { hit } from "./ratelimit";
import { verifyUnsubscribeToken } from "./reminders";

const PAGE_HEADERS = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  // Trang tự chứa: không script, không tài nguyên ngoài, form chỉ gửi về chính nó.
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function page(title: string, vi: string, en: string, form?: { token: string; button: string }): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
  const button = form
    ? `<form method="post" action="/email/unsubscribe"><input type="hidden" name="t" value="${esc(form.token)}"><button type="submit">${esc(form.button)}</button></form>`
    : "";
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
body{margin:0;background:#f1f5fb;color:#0b1322;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:480px;margin:48px auto;padding:28px 24px;background:#fff;border:1px solid #dfe7f2;border-radius:14px}
h1{margin:0 0 12px;font-size:20px;line-height:28px}
p{margin:0 0 14px;color:#3d4a63}
p.en{font-size:14px;color:#6b7891}
button{font:inherit;font-weight:700;color:#fff;background:#1d63c9;border:0;border-radius:10px;padding:12px 24px;cursor:pointer}
button:focus-visible{outline:2px solid #0f4aa3;outline-offset:2px}
@media (prefers-color-scheme:dark){body{background:#080d18;color:#eef3fb}main{background:#111a2d;border-color:#1f2c47}p{color:#c3cde0}p.en{color:#98a5bf}}
</style>
</head>
<body>
<main>
<h1>${esc(title)}</h1>
<p>${esc(vi)}</p>
<p class="en">${esc(en)}</p>
${button}
</main>
</body>
</html>`;
}

const html = (c: Context, body: string, status: 200 | 400 | 429 = 200) => c.html(body, status, PAGE_HEADERS);

export function registerUnsubscribe(app: Hono<AppEnv>) {
  const invalid = page(
    "Liên kết không hợp lệ / Invalid link",
    "Liên kết này không đúng hoặc đã bị cắt ngắn. Hãy trả lời thư nhắc gia hạn, chúng tôi sẽ xử lý giúp bạn.",
    "This link is not valid or was cut short. Reply to the reminder email and we will take care of it.",
  );

  app.get("/email/unsubscribe", async (c) => {
    const deps = c.get("deps");
    const rl = await hit(c.env, "unsub_ip", clientIp(c), deps.now());
    if (!rl.allowed) return html(c, page("Thử lại sau / Try again later", "Quá nhiều yêu cầu. Hãy thử lại sau ít phút.", "Too many requests. Please try again in a few minutes."), 429);
    const token = c.req.query("t") ?? "";
    if ((await verifyUnsubscribeToken(c.env.RATE_LIMIT_PEPPER, token)) === null) return html(c, invalid, 400);
    return html(
      c,
      page(
        "Ngừng nhận thư nhắc gia hạn? / Stop renewal reminders?",
        "Bạn sẽ không nhận thư nhắc gia hạn nữa. Thư gửi license key và thư giao dịch vẫn được gửi như bình thường.",
        "You will no longer receive renewal reminders. Emails with your license key and other transactional emails are not affected.",
        { token, button: "Ngừng nhận / Stop reminders" },
      ),
    );
  });

  app.post(
    "/email/unsubscribe",
    bodyLimit({ maxSize: 2048, onError: (c) => html(c, invalid, 400) }),
    async (c) => {
      const deps = c.get("deps");
      const now = deps.now();
      const rl = await hit(c.env, "unsub_ip", clientIp(c), now);
      if (!rl.allowed) return html(c, page("Thử lại sau / Try again later", "Quá nhiều yêu cầu. Hãy thử lại sau ít phút.", "Too many requests. Please try again in a few minutes."), 429);
      let token = "";
      try {
        const form = await c.req.parseBody();
        token = typeof form.t === "string" ? form.t : "";
      } catch {
        return html(c, invalid, 400);
      }
      const hash = await verifyUnsubscribeToken(c.env.RATE_LIMIT_PEPPER, token);
      if (hash === null) return html(c, invalid, 400);
      await c.env.DB.prepare("INSERT OR IGNORE INTO reminder_optouts (email_hash, at) VALUES (?, ?)").bind(hash, now).run();
      return html(
        c,
        page(
          "Đã ngừng nhận / Unsubscribed",
          "Bạn sẽ không nhận thư nhắc gia hạn nữa. Cảm ơn bạn đã dùng AI Translator.",
          "You will no longer receive renewal reminders. Thank you for using AI Translator.",
        ),
      );
    },
  );
}
