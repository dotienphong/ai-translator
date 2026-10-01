// Điểm vào của Worker admin (wrangler.admin.jsonc). Dùng chung D1 với Worker API; bảng gói và ký thử khóa dự phòng
// lấy từ Worker API qua service binding API (QĐ34).
import { createAdminApp } from "./admin";
import { nowSeconds, payosFromEnv } from "./deps";
import { ResendEmailProvider } from "./email/resend";
import type { AdminEnv } from "./env";

const app = createAdminApp((env) => {
  const payos = payosFromEnv(env);
  return {
    now: nowSeconds,
    payments: { payos },
    payos,
    email: new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }),
    plans: () => env.API.plans(),
    keyCheck: () => env.API.signKeyCheck(),
  };
});

export default { fetch: app.fetch } satisfies ExportedHandler<AdminEnv>;
