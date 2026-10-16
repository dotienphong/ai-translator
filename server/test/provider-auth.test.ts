// Lỗi khóa API của cổng thanh toán (hardening A6): chỉ HTTP 401/403 có thân JSON của chính cổng mới là "khóa bị từ chối".
// 403 HTML của tường lửa hay CDN, 3xx, lỗi mạng, quá thời gian chờ, 4xx/5xx khác không bao giờ thành cảnh báo khóa.
import { describe, expect, it, vi } from "vitest";
import { CreemProvider } from "../src/payment/creem";
import { PayOSProvider } from "../src/payment/payos";
import { isProviderAuthFailure, PaymentProviderError } from "../src/payment/provider";
import { FakeCreem, TEST_CHECKSUM_KEY, TEST_CREEM_API_KEY, TEST_CREEM_PRODUCTS, TEST_CREEM_WEBHOOK_SECRET } from "./fakes";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

describe("isProviderAuthFailure: bảng đơn vị", () => {
  const err = (httpStatus?: number, jsonBody?: boolean) => new PaymentProviderError("x", undefined, httpStatus, false, jsonBody);

  it.each([
    [401, true, true],
    [403, true, true],
    // Tường lửa hay CDN chặn trước khi tới cổng: cùng mã nhưng không phải thân của cổng.
    [401, false, false],
    [403, false, false],
    [400, true, false],
    [404, true, false],
    [429, true, false],
    [500, true, false],
    [502, true, false],
    [200, true, false],
    [307, true, false],
  ])("HTTP %i, thân JSON của cổng %s: %s", (status, jsonBody, expected) => {
    expect(isProviderAuthFailure(err(status, jsonBody))).toBe(expected);
  });

  it("jsonBody mặc định false: lỗi dựng không khai báo thân JSON không bao giờ là lỗi khóa", () => {
    expect(isProviderAuthFailure(new PaymentProviderError("x", undefined, 401))).toBe(false);
    expect(isProviderAuthFailure(new PaymentProviderError("x", undefined, 403))).toBe(false);
    expect(new PaymentProviderError("x").jsonBody).toBe(false);
  });

  it("không có mã HTTP (lỗi mạng, quá thời gian chờ, dữ liệu lạ) không phải lỗi khóa", () => {
    expect(isProviderAuthFailure(err(undefined, true))).toBe(false);
    expect(isProviderAuthFailure(new PaymentProviderError("x", undefined, undefined, true, true))).toBe(false);
  });

  it("lỗi không phải PaymentProviderError, hay không phải lỗi, không phải lỗi khóa", () => {
    expect(isProviderAuthFailure(new Error("401"))).toBe(false);
    expect(isProviderAuthFailure(Object.assign(new Error("x"), { httpStatus: 401, jsonBody: true }))).toBe(false);
    expect(isProviderAuthFailure({ httpStatus: 401, jsonBody: true })).toBe(false);
    for (const v of ["401", 401, null, undefined]) expect(isProviderAuthFailure(v)).toBe(false);
  });
});

/** Kết quả của một lần gọi cổng thất bại: những gì isProviderAuthFailure và các nơi gọi (đối soát) đọc. */
async function outcome(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    expect(e).toBeInstanceOf(PaymentProviderError);
    const err = e as PaymentProviderError;
    return { httpStatus: err.httpStatus, jsonBody: err.jsonBody, unreachable: err.unreachable, auth: isProviderAuthFailure(err) };
  }
  throw new Error("đáng lẽ phải ném PaymentProviderError");
}

const jsonRes = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const htmlRes = (status: number) => new Response("<html><body>Forbidden</body></html>", { status, headers: { "content-type": "text/html" } });

describe("Creem: chỉ thân JSON kiểu Creem (có trace_id) mới là lỗi khóa", () => {
  const creem = (fetchFn: FetchFn, apiKey = TEST_CREEM_API_KEY) =>
    new CreemProvider(
      { baseUrl: "https://creem.test", apiKey, webhookSecret: TEST_CREEM_WEBHOOK_SECRET, productIds: { ...TEST_CREEM_PRODUCTS } },
      fetchFn,
    );
  const req = {
    orderCode: 1000042,
    amount: 399,
    currency: "USD",
    description: "AT1000042",
    returnUrl: "https://license.test/v1/pay/return",
    cancelUrl: "https://license.test/v1/pay/cancel",
    expiresAt: 1_790_814_600,
    plan: "monthly" as const,
    email: "buyer@example.com",
  };
  const ref = { orderCode: 1000042, providerRef: "ch_1" };
  /** Cả hai đường gọi Creem: POST tạo phiên và GET hỏi phiên đều đi qua call(). */
  const calls: [string, (p: CreemProvider) => Promise<unknown>][] = [
    ["tạo phiên", (p) => p.createCheckout(req)],
    ["hỏi trạng thái", (p) => p.getPaymentStatus(ref)],
  ];
  const errorBody = (status: number) => ({ trace_id: "trace-x", status, error: "Error", message: ["m"], timestamp: 1728734325927 });

  describe.each(calls)("%s", (_name, call) => {
    it.each([
      ["401 thân JSON của Creem", () => jsonRes(errorBody(401), 401), 401, true, true],
      ["403 thân JSON của Creem", () => jsonRes(errorBody(403), 403), 403, true, true],
      ["403 HTML của tường lửa hay CDN", () => htmlRes(403), 403, false, false],
      ["401 HTML", () => htmlRes(401), 401, false, false],
      ["403 chuỗi rỗng", () => new Response("", { status: 403 }), 403, false, false],
      ["403 JSON không có trace_id ({})", () => jsonRes({}, 403), 403, false, false],
      ["403 JSON có error mà không có trace_id", () => jsonRes({ status: 403, error: "Forbidden" }, 403), 403, false, false],
      ["403 JSON mà trace_id không phải chuỗi", () => jsonRes({ trace_id: 42 }, 403), 403, false, false],
      ["403 thân JSON là mảng", () => jsonRes([{ trace_id: "t" }], 403), 403, false, false],
      ["403 thân JSON là chuỗi", () => jsonRes("Forbidden", 403), 403, false, false],
      ["403 thân JSON là null", () => jsonRes(null, 403), 403, false, false],
      ["400 thân JSON của Creem", () => jsonRes(errorBody(400), 400), 400, true, false],
      ["404 thân JSON của Creem", () => jsonRes(errorBody(404), 404), 404, true, false],
      ["429 thân JSON của Creem", () => jsonRes(errorBody(429), 429), 429, true, false],
      ["500 thân JSON của Creem", () => jsonRes(errorBody(500), 500), 500, true, false],
      ["502 HTML", () => htmlRes(502), 502, false, false],
      ["307 chuyển hướng", () => new Response("{}", { status: 307, headers: { location: "https://evil.example" } }), 307, false, false],
      ["200 thân không phải JSON", () => new Response("<html>ok</html>", { status: 200 }), 200, false, false],
      ["200 thân JSON là mảng", () => jsonRes([], 200), 200, false, false],
    ] as const)("%s", async (_why, respond, httpStatus, jsonBody, auth) => {
      const got = await outcome(() => call(creem(async () => respond())));
      expect(got).toEqual({ httpStatus, jsonBody, unreachable: false, auth });
    });

    it("lỗi mạng và quá thời gian chờ (lúc nối hay lúc đọc thân): unreachable, không có mã HTTP, không phải lỗi khóa", async () => {
      const slowBody: FetchFn = async () => {
        const res = new Response("{}");
        vi.spyOn(res, "json").mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
        return res;
      };
      const failures: FetchFn[] = [
        async () => Promise.reject(new TypeError("fetch failed")),
        async () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
        slowBody,
      ];
      for (const f of failures) {
        expect(await outcome(() => call(creem(f)))).toEqual({ httpStatus: undefined, jsonBody: false, unreachable: true, auth: false });
      }
    });
  });

  it("FakeCreem: thiếu khóa (401) và khóa sai (403) là lỗi khóa; 500 và 429 của cổng thì không", async () => {
    const fake = new FakeCreem();
    const missing = (init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.delete("x-api-key");
      return { ...init, headers };
    };
    expect(await outcome(() => creem((url, init) => fake.fetch(url, missing(init))).createCheckout(req))).toMatchObject({ httpStatus: 401, jsonBody: true, auth: true });
    expect(await outcome(() => creem(fake.fetch, "ck_sai").createCheckout(req))).toMatchObject({ httpStatus: 403, jsonBody: true, auth: true });
    expect(await outcome(() => creem(fake.fetch, "ck_sai").getPaymentStatus(ref))).toMatchObject({ httpStatus: 403, jsonBody: true, auth: true });
    fake.createFailures = [500, 429];
    expect(await outcome(() => creem(fake.fetch).createCheckout(req))).toMatchObject({ httpStatus: 500, jsonBody: true, auth: false });
    expect(await outcome(() => creem(fake.fetch).createCheckout(req))).toMatchObject({ httpStatus: 429, jsonBody: true, auth: false });
  });
});

describe("PayOS: chỉ thân JSON kiểu PayOS (có code dạng chuỗi) mới là lỗi khóa; luồng thanh toán PayOS không đổi", () => {
  const payos = (fetchFn: FetchFn) =>
    new PayOSProvider({ baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: TEST_CHECKSUM_KEY }, fetchFn);
  const req = {
    orderCode: 42,
    amount: 2000,
    currency: "VND",
    description: "AT42",
    returnUrl: "https://example.com/v1/pay/return",
    cancelUrl: "https://example.com/v1/pay/cancel",
    expiresAt: 1_790_000_900,
    plan: "monthly" as const,
    email: "buyer@example.com",
  };
  const ref = { orderCode: 42, providerRef: null };
  const calls: [string, (p: PayOSProvider) => Promise<unknown>][] = [
    ["tạo link", (p) => p.createCheckout(req)],
    ["hỏi trạng thái", (p) => p.getPaymentStatus(ref)],
  ];
  const envelope = (code: string, desc: string) => ({ code, desc, data: null });

  describe.each(calls)("%s", (_name, call) => {
    it.each([
      ["401 thân JSON của PayOS", () => jsonRes(envelope("401", "Unauthorized"), 401), 401, true, true],
      ["403 thân JSON của PayOS", () => jsonRes(envelope("403", "Forbidden"), 403), 403, true, true],
      ["403 HTML của tường lửa hay CDN", () => htmlRes(403), 403, false, false],
      ["401 HTML", () => htmlRes(401), 401, false, false],
      ["403 JSON không có code ({})", () => jsonRes({}, 403), 403, false, false],
      ["403 JSON có message mà không có code", () => jsonRes({ message: "blocked" }, 403), 403, false, false],
      ["403 JSON mà code không phải chuỗi", () => jsonRes({ code: 403, desc: "x" }, 403), 403, false, false],
      ["400 thân JSON của PayOS", () => jsonRes(envelope("400", "Bad"), 400), 400, true, false],
      ["404 thân JSON của PayOS", () => jsonRes(envelope("404", "Not found"), 404), 404, true, false],
      ["429 thân JSON của PayOS", () => jsonRes(envelope("429", "Slow down"), 429), 429, true, false],
      ["500 thân JSON của PayOS", () => jsonRes(envelope("500", "Oops"), 500), 500, true, false],
      ["502 HTML", () => htmlRes(502), 502, false, false],
      // PayOS báo nhiều lỗi nghiệp vụ bằng HTTP 200 kèm code khác "00": không có mã 401/403 nên không phải lỗi khóa.
      ["200 kèm code lỗi nghiệp vụ", () => jsonRes(envelope("231", "Đơn thanh toán đã tồn tại"), 200), 200, true, false],
      ["200 thân không phải JSON", () => new Response("<html>ok</html>", { status: 200 }), 200, false, false],
    ] as const)("%s", async (_why, respond, httpStatus, jsonBody, auth) => {
      const got = await outcome(() => call(payos(async () => respond())));
      expect(got).toEqual({ httpStatus, jsonBody, unreachable: false, auth });
    });

    it("lỗi mạng và quá thời gian chờ: unreachable, không phải lỗi khóa", async () => {
      for (const f of [
        async () => Promise.reject(new TypeError("fetch failed")),
        async () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
      ] as FetchFn[]) {
        expect(await outcome(() => call(payos(f)))).toEqual({ httpStatus: undefined, jsonBody: false, unreachable: true, auth: false });
      }
    });
  });

  it("thông điệp lỗi và mã của PayOS giữ nguyên (chỉ thêm phân loại, không đổi luồng)", async () => {
    let err: unknown;
    try {
      await payos(async () => jsonRes(envelope("401", "Unauthorized"), 401)).getPaymentStatus(ref);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect(err).toMatchObject({ message: "PayOS lỗi HTTP 401: Unauthorized", code: "401", httpStatus: 401 });
  });
});
