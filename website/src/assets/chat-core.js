// Lõi chat hỗ trợ của website (spec chat hỗ trợ ngày 2026-10-22, mục 3; hợp đồng API và hợp đồng phía khách: kế hoạch
// 2026-10-22-chat-ho-tro-00-tong-quan). Không đụng DOM: khung chat (chat.js) và site.js (hỏi tin khi khung đóng, chấm đỏ) cùng
// dùng; test đơn vị ở test/chat-core.test.mjs. Chỉ gọi đúng máy chủ production, không có cách ghi đè URL (CLAUDE.md).

export const API = "https://api.aitranslator.io.vn";
export const STORE_KEY = "support.v1";
export const MAX_CHARS = 1000;
/** Hiện bộ đếm ký tự từ mức này (spec: "đếm ký tự khi gần 1000"). */
export const COUNT_FROM = 900;
/** Đang chờ trả lời: tin cuối là của khách và gửi trong 24 giờ qua (giây). */
export const WAIT_WINDOW = 24 * 60 * 60;
/** Nhịp hỏi tin mới (ms): khung mở 3 giây, 2 phút liền không có tin mới thì 15 giây; khung đóng mà đang chờ trả lời 60 giây. */
export const FAST = 3_000;
export const SLOW = 15_000;
export const IDLE_AFTER = 120_000;
export const WATCH = 60_000;
/** Nhận 429: chờ Retry-After nhưng không dưới 15 giây. Lỗi mạng: giãn dần 3 → 15 → 60 giây. */
export const MIN_RETRY = 15_000;
export const NET_BACKOFF = [3_000, 15_000, 60_000];

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Chữ khách gõ theo luật của server: \r\n và \r thành \n, tab thành dấu cách, bỏ ký tự điều khiển khác, bỏ khoảng trắng hai đầu. */
export function normalizeText(s) {
  return String(s).replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/[^\P{Cc}\n]/gu, "").trim();
}

/** Số ký tự theo code point (emoji tính 1), như server đếm. */
export const charCount = (s) => Array.from(s).length;

/** Chữ hợp lệ để gửi (1–1000 ký tự sau khi chuẩn hóa), hay null. */
export function validText(s) {
  const t = normalizeText(s);
  const n = charCount(t);
  return n >= 1 && n <= MAX_CHARS ? t : null;
}

/** Đọc bản lưu `{ token, lastId, waitingSince }` (chuỗi JSON); sai dạng thì null. */
export function parseState(raw) {
  if (typeof raw !== "string") return null;
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || typeof v.token !== "string" || !TOKEN.test(v.token)) return null;
  if (!Number.isSafeInteger(v.lastId) || v.lastId < 0) return null;
  if (v.waitingSince !== null && !(Number.isSafeInteger(v.waitingSince) && v.waitingSince > 0)) return null;
  return { token: v.token, lastId: v.lastId, waitingSince: v.waitingSince };
}

/** Đang chờ trả lời (khung đóng thì hỏi mỗi 60 giây): có cuộc chat, tin cuối là của khách, gửi trong 24 giờ qua. */
export const isWaiting = (state, nowSec) => Boolean(state && state.waitingSince !== null && nowSec - state.waitingSince < WAIT_WINDOW);

/**
 * Bản lưu trên trình duyệt (`localStorage`, khóa `support.v1`). Trình duyệt không cho đọc hay ghi (chế độ riêng tư, chặn dữ
 * liệu trang) thì giữ trong bộ nhớ: cuộc chat chỉ sống trong trang hiện tại. `getStorage` được gọi lại mỗi lần (truy cập
 * `localStorage` cũng có thể ném lỗi).
 */
export function createStore(getStorage) {
  let memory = null;
  let persistent = true;
  const storage = () => {
    if (!persistent) return null;
    try {
      return getStorage() ?? null;
    } catch {
      persistent = false;
      return null;
    }
  };
  return {
    load() {
      const s = storage();
      if (s) {
        try {
          memory = parseState(s.getItem(STORE_KEY));
        } catch {
          persistent = false;
        }
      }
      return memory;
    },
    save(state) {
      memory = state;
      const s = storage();
      if (!s) return;
      try {
        s.setItem(STORE_KEY, JSON.stringify(state));
      } catch {
        persistent = false;
      }
    },
    clear() {
      memory = null;
      const s = storage();
      if (!s) return;
      try {
        s.removeItem(STORE_KEY);
      } catch {
        persistent = false;
      }
    },
  };
}

/**
 * Gọi API chat (`fetchFn` là `fetch` của trình duyệt, hay bản giả trong test). Không bao giờ ném: thành công ra
 * `{ ok: true, status, data }`; lỗi ra `{ ok: false, status, error, retryAfter }` (`status` 0 và `error: "network"` khi không tới
 * được máy chủ; `retryAfter` là số giây của header Retry-After hay null).
 */
export function createApi(fetchFn) {
  async function call(method, path, { token = null, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const init = { method, headers, credentials: "omit" };
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body ?? {});
    }
    let res;
    try {
      res = await fetchFn(API + path, init);
    } catch {
      return { ok: false, status: 0, error: "network", retryAfter: null };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* thân không phải JSON (trang lỗi của cổng mạng) */
    }
    if (res.ok) return { ok: true, status: res.status, data };
    const ra = Number(res.headers.get("Retry-After"));
    return { ok: false, status: res.status, error: typeof data?.error === "string" ? data.error : `http_${res.status}`, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null };
  }
  return {
    status: () => call("GET", "/v1/support/status"),
    /** Tin đầu (chưa có token) gửi kèm `first` = `{ lang, source, page }`; các tin sau chỉ gửi `{ text }`. */
    send: (token, text, first) => (token ? call("POST", "/v1/support/messages", { token, body: { text } }) : call("POST", "/v1/support/messages", { body: { text, ...first } })),
    messages: (token, after) => call("GET", `/v1/support/messages?after=${after}`, { token }),
    setEmail: (token, email) => call("PUT", "/v1/support/email", { token, body: { email } }),
    remove: (token) => call("DELETE", "/v1/support/conversation", { token, body: {} }),
  };
}

/**
 * Việc phải làm với một kết quả của createApi (bảng mã lỗi của hợp đồng): "ok"; "reset" (401: xóa bản lưu, tin kế tiếp mở cuộc
 * mới); "closed" (403: cuộc chat bị chặn); "disabled" (503: chat tắt); "busy" (429 support_busy); "rate" (429 rate_limited);
 * "network" (không tới được máy chủ, hay 5xx khác); "invalid" (400, 413, 415: lỗi chung, không tự thử lại).
 */
export function outcome(r) {
  if (r.ok) return "ok";
  switch (r.error) {
    case "invalid_token":
      return "reset";
    case "conversation_closed":
      return "closed";
    case "support_disabled":
      return "disabled";
    case "support_busy":
      return "busy";
    case "rate_limited":
      return "rate";
  }
  if (r.status === 0 || r.status >= 500) return "network";
  if (r.status === 429) return "rate";
  if (r.status === 401) return "reset";
  if (r.status === 403) return "closed";
  return "invalid";
}
