// Binding, biến và secret của hai Worker. Secret khai báo ở `secrets.required` trong wrangler*.jsonc,
// nên `wrangler deploy` báo lỗi nếu thiếu (tên biến chốt ở kế hoạch 05, theo mục 6.5 của kế hoạch 00).

export interface ApiEnv {
  DB: D1Database;
  /** "production" (cố định trong wrangler.jsonc) | "test" (chỉ vitest.config.ts) */
  ENVIRONMENT: string;
  /** Bảng gói trả phí (src/plans.ts): hạn mức, số ngày mỗi đơn, giá theo loại tiền. Đọc bằng parsePlans. */
  PLANS?: unknown;
  /** Ô khóa đang ký token: "a" hoặc "b" (QĐ29). Ô còn lại là khóa dự phòng. */
  TOKEN_SIGNING_SLOT: string;
  PAYOS_BASE_URL: string;
  EMAIL_FROM: string;
  /** Địa chỉ nhận trả lời của thư gửi khách (Reply-To). Không bắt buộc. */
  EMAIL_REPLY_TO?: string;
  // Secret
  PAYOS_CLIENT_ID: string;
  PAYOS_API_KEY: string;
  PAYOS_CHECKSUM_KEY: string;
  RESEND_API_KEY: string;
  /** JWK Ed25519 khóa riêng, có `kid` (scripts/gen-token-key.mjs), ở hai ô A và B. */
  TOKEN_SIGNING_KEY_A: string;
  TOKEN_SIGNING_KEY_B: string;
  /** Khóa HMAC cho bộ đếm giới hạn tần suất (ngẫu nhiên, 32 byte). */
  RATE_LIMIT_PEPPER: string;
  /** Email người vận hành nhận cảnh báo. Không bắt buộc; thiếu thì cảnh báo chỉ ghi log. */
  OPERATOR_EMAIL?: string;
}

/** Các hàm Worker API mở cho Worker admin qua service binding (src/index.ts, AdminRpc; QĐ34). */
export interface ApiRpc {
  /** Biến PLANS của Worker API, chưa kiểm; Worker admin tự kiểm lại bằng parsePlans. */
  plans(): Promise<unknown>;
  /** Token ký thử bằng khóa dự phòng (QĐ31). */
  signKeyCheck(): Promise<{ slot: string; kid: string; token: string }>;
}

export interface AdminEnv {
  DB: D1Database;
  ENVIRONMENT: string;
  PAYOS_BASE_URL: string;
  EMAIL_FROM: string;
  /** Địa chỉ nhận trả lời của thư gửi khách (Reply-To). Không bắt buộc. */
  EMAIL_REPLY_TO?: string;
  /** Audience tag của ứng dụng Access. Bắt buộc khi ENVIRONMENT khác "test"; trống thì mọi request bị 403. */
  ACCESS_AUD?: string;
  /** Origin của Worker API cùng môi trường; confirm-webhook chỉ nhận URL webhook trên origin này. */
  API_ORIGIN?: string;
  /** Service binding tới entrypoint AdminRpc của Worker API cùng môi trường. */
  API: ApiRpc;
  // Secret
  PAYOS_CLIENT_ID: string;
  PAYOS_API_KEY: string;
  PAYOS_CHECKSUM_KEY: string;
  RESEND_API_KEY: string;
}
