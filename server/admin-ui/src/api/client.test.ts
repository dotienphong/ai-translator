import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, call, SESSION_EXPIRED_EVENT } from "./client";
import { queryString } from "./endpoints";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("không có lỗi");
}

describe("call", () => {
  it("POST gửi JSON, redirect manual; GET không có body", async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await call("POST", "/admin/licenses/x/revoke", { note: "lý do" });
    await call("GET", "/admin/queue");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/admin/licenses/x/revoke");
    expect(init).toMatchObject({ method: "POST", redirect: "manual", credentials: "same-origin", body: '{"note":"lý do"}' });
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    const [, getInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(getInit.body).toBeUndefined();
    expect((getInit.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });

  it("lỗi JSON của server thành câu tiếng Việt kèm trạng thái và trường", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "already_paid", status: "paid" }, 409)));
    const e = await failure(call("POST", "/admin/orders/1/grant", { note: "x" }));
    expect(e).toMatchObject({ status: 409, code: "already_paid" });
    expect(e.message).toBe("Đơn đã được cấp trước đó (trạng thái hiện tại: paid)");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_request", field: "state" }, 400)));
    expect((await failure(call("GET", "/admin/licenses?state=x"))).message).toBe("Dữ liệu gửi lên không hợp lệ (trường state)");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "payment_provider_error", message: "PayOS 500" }, 502)));
    expect((await failure(call("GET", "/admin/orders/1/payment-status"))).message).toBe("Cổng thanh toán lỗi (PayOS 500)");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "la_hoan_toan" }, 400)));
    expect((await failure(call("GET", "/admin/queue"))).message).toBe("Lỗi không rõ (la_hoan_toan)");
  });

  it("404 not_found: server trả cả khi license đã ở trạng thái đó, nên câu lỗi nhắc tải lại", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "not_found" }, 404)));
    const e = await failure(call("POST", "/admin/licenses/x/unlock", { note: "x" }));
    expect(e).toMatchObject({ status: 404, code: "not_found" });
    expect(e.message).toBe("Không tìm thấy, hoặc đã ở trạng thái đó. Tải lại trang để xem trạng thái mới");
  });

  it("phiên Access hết hạn: opaqueredirect hay trang HTML; phát sự kiện", async () => {
    const seen = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, seen);
    vi.stubGlobal("fetch", vi.fn(async () => ({ type: "opaqueredirect", status: 0, ok: false, headers: new Headers() }) as Response));
    expect(await failure(call("GET", "/admin/queue"))).toMatchObject({ code: "session_expired" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } })));
    const e = await failure(call("GET", "/admin/queue"));
    expect(e.code).toBe("session_expired");
    expect(e.message).toBe("Phiên đăng nhập hết hạn. Tải lại trang để đăng nhập lại");
    for (const status of [401, 403]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>login</html>", { status, headers: { "content-type": "text/html" } })));
      expect(await failure(call("GET", "/admin/queue"))).toMatchObject({ status, code: "session_expired" });
    }
    expect(seen).toHaveBeenCalledTimes(4);
    window.removeEventListener(SESSION_EXPIRED_EVENT, seen);
  });

  it("lỗi mạng, và lỗi không phải JSON khác (502 HTML của Cloudflare)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect((await failure(call("GET", "/admin/queue"))).message).toBe("Không kết nối được máy chủ");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502, headers: { "content-type": "text/html" } })));
    expect(await failure(call("GET", "/admin/queue"))).toMatchObject({ code: "http_502", message: "Máy chủ trả lỗi 502" });
  });
});

describe("call: JSON hỏng vẫn thành ApiError", () => {
  const withBody = (body: string, status: number) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "content-type": "application/json" } })));

  it("JSON cụt", async () => {
    withBody('{"er', 200);
    expect(await failure(call("GET", "/admin/queue"))).toMatchObject({ status: 200, code: "http_200" });
    withBody('{"er', 502);
    expect(await failure(call("GET", "/admin/queue"))).toMatchObject({ status: 502, code: "http_502" });
  });

  it("JSON hợp lệ nhưng không phải object", async () => {
    withBody("null", 500);
    expect(await failure(call("GET", "/admin/queue"))).toMatchObject({ status: 500, code: "http_500" });
    withBody("[1,2]", 200);
    expect(await failure(call("GET", "/admin/queue"))).toMatchObject({ status: 200, code: "http_200" });
    withBody('"chuoi"', 200);
    expect(await failure(call("GET", "/admin/queue"))).toMatchObject({ code: "http_200" });
  });
});

describe("queryString", () => {
  it("bỏ tham số rỗng, mã hóa giá trị", () => {
    expect(queryString({ status: "paid", plan: "", cursor: undefined })).toBe("?status=paid");
    expect(queryString({ actor: "admin" })).toBe("?actor=admin");
    expect(queryString({})).toBe("");
  });
});
