// Gửi email qua API HTTP của Resend. Tài liệu đã đọc (2026-10-01):
// - https://resend.com/docs/api-reference/emails/send-email  (POST https://api.resend.com/emails, Idempotency-Key)
// - https://resend.com/docs/api-reference/introduction  (bắt buộc User-Agent, thiếu thì 403; 10 request/giây)
import type { FetchFn } from "../payment/payos";
import { type EmailMessage, type EmailProvider, EmailProviderError } from "./provider";

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly cfg: ResendConfig,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.cfg.apiKey}`,
      "content-type": "application/json",
      "user-agent": "license-server/1.0",
    };
    if (message.idempotencyKey) headers["idempotency-key"] = message.idempotencyKey;
    const res = await this.fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({ from: this.cfg.from, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Không đưa body vào lỗi: body có thể lặp lại địa chỉ người nhận.
      throw new EmailProviderError(`Resend trả HTTP ${res.status}`, res.status);
    }
  }
}
