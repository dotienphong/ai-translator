// Dây nối phụ thuộc thật của Worker admin (PayOS, cổng Creem chỉ đọc, email, service binding API). Tách khỏi deps.ts vì deps.ts
// dùng chung với Worker API: nếu deps.ts nhập admin-ops hay admin-auth thì mã admin (và mọi tác dụng phụ ở cấp module của nó) nằm
// trong đồ thị nhập của Worker API, chỉ nhờ esbuild loại bớt. test/node/worker-split.test.mjs chặn deps.ts nhập `./admin*`.
import type { AdminDeps } from "./admin-auth";
import { defaultFetchPublic } from "./admin-ops";
import { nowSeconds, payosFromEnv } from "./deps";
import { ResendEmailProvider } from "./email/resend";
import type { AdminEnv } from "./env";
import { CreemProvider } from "./payment/creem";
import type { PaymentProvider } from "./payment/provider";

/**
 * Cổng Creem của Worker admin: chỉ hỏi trạng thái phiên (xem trạng thái đơn), nên chỉ cần gốc API và khóa API; không giữ
 * secret webhook, không biết mã sản phẩm. null khi khóa API rỗng (secret bị xóa hay đặt rỗng sau deploy: thiếu hẳn thì
 * `secrets.required` của wrangler.admin.jsonc đã chặn deploy).
 * Kiểu trả về cố ý hẹp (chỉ `name` và `getPaymentStatus`, không tạo phiên, không nhận webhook): đặt nhầm cổng này vào
 * Deps.payments của Worker API thì `tsc` đỏ (test/creem.test.ts ghim bằng `@ts-expect-error`) thay vì để mọi đơn USD trả 502.
 */
export function creemReaderFromEnv(
  env: Pick<AdminEnv, "CREEM_BASE_URL" | "CREEM_API_KEY">,
): Pick<PaymentProvider, "name" | "getPaymentStatus"> | null {
  if (!env.CREEM_API_KEY) return null;
  return new CreemProvider({ baseUrl: env.CREEM_BASE_URL, apiKey: env.CREEM_API_KEY });
}

/** Cổng thanh toán của Worker admin theo tên (orders.provider): PayOS luôn có; creem khi đã dựng được cổng chỉ đọc. */
export function adminPayments(
  payos: Pick<PaymentProvider, "getPaymentStatus">,
  creem: Pick<PaymentProvider, "getPaymentStatus"> | null,
): AdminDeps["payments"] {
  return { payos, ...(creem ? { creem } : {}) };
}

/** Phụ thuộc thật của Worker admin (admin-entry.ts chỉ gọi hàm này). Test: creem.test.ts ("realAdminDeps") và admin.test.ts ("điểm vào thật"). */
export function realAdminDeps(env: AdminEnv): AdminDeps {
  const payos = payosFromEnv(env);
  return {
    now: nowSeconds,
    payments: adminPayments(payos, creemReaderFromEnv(env)),
    payos,
    email: new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO }),
    plans: () => env.API.plans(),
    keyCheck: () => env.API.signKeyCheck(),
    fetchPublic: defaultFetchPublic,
  };
}
