// Gửi tin tới Zalo của chủ dự án qua Zalo Bot Platform, API chính thức của Zalo (spec 2026-10-22 §0, §2.3;
// https://bot.zapps.me/docs/apis/sendMessage/). Chỉ một người nhận: chat_id của chủ dự án (secret ZALO_OWNER_CHAT_ID).
// Token nằm trong đường dẫn URL nên lỗi không bao giờ kèm URL hay thông điệp gốc của fetch.

import { fitUtf16, ZALO_MAX_TEXT } from "./text";

export const ZALO_API_BASE = "https://bot-api.zaloplatforms.com";
const TIMEOUT_MS = 10_000;

export interface OwnerBot {
  /** Gửi một tin văn bản thuần (1–2000 ký tự) tới Zalo của chủ dự án. Lỗi thì ném ZaloBotError. */
  send(text: string): Promise<void>;
}

export class ZaloBotError extends Error {
  override name = "ZaloBotError";

  constructor(
    message: string,
    /** Mã HTTP Zalo trả; không có nếu lỗi mạng hay quá thời gian chờ. */
    readonly status?: number,
  ) {
    super(message);
  }
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class HttpZaloBot implements OwnerBot {
  constructor(
    private readonly token: string,
    private readonly ownerChatId: string,
    private readonly fetchImpl: FetchFn = (url, init) => fetch(url, init),
  ) {}

  async send(text: string): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${ZALO_API_BASE}/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.ownerChatId, text: fitUtf16(text, ZALO_MAX_TEXT) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Không theo chuyển hướng (cùng cách với payment/creem.ts): mọi 3xx thành lỗi HTTP ở dưới.
        redirect: "manual",
      });
    } catch (err) {
      // Chỉ ghi tên lỗi: thông điệp của fetch có thể chứa URL, mà URL có token.
      throw new ZaloBotError(`không gọi được Zalo Bot (${err instanceof Error ? err.name : "lỗi lạ"})`);
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Thân không phải JSON: coi như lỗi ở dưới.
    }
    const ok = res.ok && typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === true;
    if (!ok) throw new ZaloBotError(`Zalo Bot từ chối tin (HTTP ${res.status})`, res.status);
  }
}

/** Bot thật của Worker API; thiếu token hay chat_id thì null (chat vẫn lưu tin, không chuyển được sang Zalo). */
export function zaloFromEnv(env: { ZALO_BOT_TOKEN?: string; ZALO_OWNER_CHAT_ID?: string }): OwnerBot | null {
  return env.ZALO_BOT_TOKEN && env.ZALO_OWNER_CHAT_ID ? new HttpZaloBot(env.ZALO_BOT_TOKEN, env.ZALO_OWNER_CHAT_ID) : null;
}
