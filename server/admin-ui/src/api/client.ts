// Gọi API của Worker admin: cùng origin, sau Cloudflare Access (spec Web Admin §4.5, §4.6). Mọi lỗi thành ApiError
// mang câu tiếng Việt. Phiên Access hết hạn thì phát sự kiện SESSION_EXPIRED_EVENT để App hiện thanh báo.

export const SESSION_EXPIRED_EVENT = "admin:session-expired";

const MESSAGES: Record<string, string> = {
  invalid_request: "Dữ liệu gửi lên không hợp lệ",
  forbidden: "Không có quyền. Thử tải lại trang",
  not_found: "Không tìm thấy, hoặc đã ở trạng thái đó. Tải lại trang để xem trạng thái mới",
  order_not_found: "Không tìm thấy đơn",
  activation_not_found: "Không tìm thấy máy (có thể đã gỡ)",
  pricing_not_configured: "Worker API chưa có cấu hình bảng gói (PLANS)",
  payment_provider_error: "Cổng thanh toán lỗi",
  temporarily_unavailable: "Chưa gửi được email, thử lại sau",
  key_check_failed: "Ký thử bằng khóa dự phòng thất bại",
  needs_review: "Đơn cần xử lý bằng nút Cấp key mới hoặc Ghi đã hoàn tiền (license của đơn đã bị thu hồi)",
  already_paid: "Đơn đã được cấp trước đó",
  already_settled: "Đơn đã khép",
  not_needs_review: "Đơn không ở trạng thái chờ xử lý",
  unsupported_media_type: "Yêu cầu sai định dạng",
  rate_limited: "Quá nhiều yêu cầu, thử lại sau",
  internal: "Lỗi máy chủ",
  network: "Không kết nối được máy chủ",
  session_expired: "Phiên đăng nhập hết hạn. Tải lại trang để đăng nhập lại",
};

export function errorMessage(code: string, body: Record<string, unknown> = {}): string {
  const http = /^http_(\d+)$/.exec(code);
  const base = MESSAGES[code] ?? (http ? `Máy chủ trả lỗi ${http[1]}` : `Lỗi không rõ (${code})`);
  const extra: string[] = [];
  if (typeof body.field === "string") extra.push(`trường ${body.field}`);
  if (typeof body.status === "string") extra.push(`trạng thái hiện tại: ${body.status}`);
  if (typeof body.message === "string") extra.push(body.message);
  return extra.length > 0 ? `${base} (${extra.join("; ")})` : base;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: Record<string, unknown>;
  constructor(status: number, code: string, body: Record<string, unknown> = {}) {
    super(errorMessage(code, body));
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  const init: RequestInit = { method, headers, redirect: "manual", credentials: "same-origin" };
  if (method === "POST") {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body ?? {});
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "network");
  }
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  // Phiên hết hạn: Access chuyển hướng sang trang đăng nhập (với redirect "manual" là opaqueredirect), hoặc trả trang HTML.
  if (res.type === "opaqueredirect" || (!isJson && (res.ok || res.status === 401 || res.status === 403))) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(res.status, "session_expired");
  }
  if (!isJson) throw new ApiError(res.status, `http_${res.status}`);
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = await res.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("không phải object");
    data = parsed as Record<string, unknown>;
  } catch {
    // JSON cụt hay không phải object: coi như lỗi HTTP thường, không để SyntaxError/TypeError lọt ra ngoài.
    throw new ApiError(res.status, `http_${res.status}`);
  }
  if (!res.ok) {
    throw new ApiError(res.status, typeof data.error === "string" ? data.error : `http_${res.status}`, data);
  }
  return data as T;
}
