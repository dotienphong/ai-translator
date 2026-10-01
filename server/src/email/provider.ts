// Interface gửi email (spec §6.8, "Gửi email"): đổi dịch vụ chỉ cần một cài đặt mới.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Cùng khóa thì dịch vụ chỉ gửi một lần (Resend giữ khóa 24 giờ). */
  idempotencyKey?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export class EmailProviderError extends Error {
  override name = "EmailProviderError";

  constructor(
    message: string,
    /** Mã HTTP của dịch vụ gửi thư; không có nếu lỗi mạng. */
    readonly status?: number,
  ) {
    super(message);
  }

  /**
   * Chỉ 400 và 422 là lỗi vĩnh viễn (thư sai dạng, địa chỉ nhận không hợp lệ): gửi lại cũng không được.
   * 401, 403 (API key bị khóa, tên miền chưa xác thực: sửa cấu hình xong thì gửi được), 409
   * (concurrent_idempotent_requests, Resend ghi "Retry later"), 429, 5xx và lỗi mạng là lỗi tạm.
   */
  get permanent(): boolean {
    return this.status === 400 || this.status === 422;
  }
}

/** Che email khi ghi log (§6.5 của kế hoạch 00): giữ ký tự đầu và tên miền. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.charAt(0)}***${email.slice(at)}`;
}
