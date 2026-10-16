import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { creemReaderFromEnv, realAdminDeps } from "../src/admin-deps";
import { hmacSha256Hex } from "../src/crypto";
import { creemFromEnv, type Deps, realDeps } from "../src/deps";
import type { AdminEnv, ApiEnv } from "../src/env";
import { CREEM_CHECKOUT_HOST, CreemProvider, parseProductIds } from "../src/payment/creem";
import { PaymentProviderError } from "../src/payment/provider";
import type { PlanCode } from "../src/plans";
import { FakeCreem, TEST_CREEM_API_KEY, TEST_CREEM_PRODUCTS, TEST_CREEM_WEBHOOK_SECRET } from "./fakes";
// Thân thật của Creem sandbox ngày 2026-10-16 (test/fixtures/creem/README.md), đúng từng byte.
import createCheckoutReal from "./fixtures/creem/create-checkout.real.json?raw";
import getPaidReal from "./fixtures/creem/get-checkout.paid.real.json?raw";
import getPendingReal from "./fixtures/creem/get-checkout.pending.real.json?raw";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function provider(fetchFn: FetchFn, apiKey = TEST_CREEM_API_KEY) {
  return new CreemProvider(
    { baseUrl: "https://creem.test", apiKey, webhookSecret: TEST_CREEM_WEBHOOK_SECRET, productIds: { ...TEST_CREEM_PRODUCTS } },
    fetchFn,
  );
}

const req = {
  orderCode: 1000042,
  amount: 399,
  currency: "USD",
  description: "AT1000042",
  returnUrl: "https://license.test/v1/pay/return",
  cancelUrl: "https://license.test/v1/pay/cancel",
  expiresAt: 1_790_814_600,
  plan: "monthly" as PlanCode,
  email: "buyer@example.com",
};

describe("Creem: tạo phiên thanh toán", () => {
  it("gửi đúng khóa API, sản phẩm của gói, request_id là mã đơn, giá tính bằng cent; trả link và không có mã QR", async () => {
    const fake = new FakeCreem();
    const result = await provider(fake.fetch).createCheckout(req);
    expect(result).toEqual({ providerRef: "ch_fake1", checkoutUrl: "https://checkout.creem.io/ch_fake1", qrCode: null });
    expect(fake.requests).toEqual([
      {
        method: "POST",
        path: "/v1/checkouts",
        apiKey: TEST_CREEM_API_KEY,
        body: {
          product_id: "prod_monthly",
          request_id: "1000042",
          custom_price: 399,
          success_url: "https://license.test/v1/pay/return",
          customer: { email: "buyer@example.com" },
          metadata: { order_code: "1000042", plan: "monthly" },
        },
      },
    ]);
    expect(fake.checkouts.get("ch_fake1")).toMatchObject({ requestId: "1000042", customPrice: 399, email: "buyer@example.com" });
  });

  it.each([
    ["monthly", 399, "prod_monthly"],
    ["six_months", 2199, "prod_six_months"],
    ["yearly", 3999, "prod_yearly"],
  ] as const)("gói %s: sản phẩm %s theo bảng mã sản phẩm, giá %i cent", async (plan, amount, productId) => {
    const fake = new FakeCreem();
    await provider(fake.fetch).createCheckout({ ...req, plan, amount });
    expect(fake.requests[0]?.body).toMatchObject({ product_id: productId, custom_price: amount });
  });

  it("không nhận tiền khác USD, và không gọi mạng", async () => {
    const fake = new FakeCreem();
    await expect(provider(fake.fetch).createCheckout({ ...req, currency: "VND" })).rejects.toThrow(/VND/);
    expect(fake.requests).toHaveLength(0);
  });

  it("gói chưa có mã sản phẩm: lỗi rõ ràng, không gọi mạng", async () => {
    const fake = new FakeCreem();
    const p = new CreemProvider(
      { baseUrl: "https://creem.test", apiKey: TEST_CREEM_API_KEY, webhookSecret: "s", productIds: { ...TEST_CREEM_PRODUCTS, yearly: "" } },
      fake.fetch,
    );
    await expect(p.createCheckout({ ...req, plan: "yearly" })).rejects.toThrow(/yearly/);
    expect(fake.requests).toHaveLength(0);
  });

  it.each([
    ["ngoài tên miền thanh toán", "https://evil.example/ch_1"],
    ["http thay vì https", "http://checkout.creem.io/ch_1"],
    ["tên miền con đổi chỗ", "https://checkout.creem.io.evil.example/ch_1"],
    ["có userinfo", "https://user@checkout.creem.io/ch_1"],
    ["cổng lạ", "https://checkout.creem.io:8443/ch_1"],
    ["không phải URL", "không-phải-url"],
  ])("checkout_url %s: từ chối, không bao giờ đưa URL đó cho app", async (_why, url) => {
    const p = provider(async () => new Response(JSON.stringify({ id: "ch_1", checkout_url: url, status: "pending" })));
    await expect(p.createCheckout(req)).rejects.toThrow(PaymentProviderError);
  });

  it("response thiếu id hay checkout_url: lỗi", async () => {
    for (const body of [{ checkout_url: "https://checkout.creem.io/ch_1" }, { id: "ch_1" }, { id: 7, checkout_url: "https://checkout.creem.io/ch_1" }]) {
      const p = provider(async () => new Response(JSON.stringify(body)));
      await expect(p.createCheckout(req)).rejects.toThrow(/id hoặc checkout_url/);
    }
  });

  it("khóa API sai: lỗi mang mã HTTP 403 và trace_id để hỏi hỗ trợ", async () => {
    const fake = new FakeCreem();
    const err = await provider(fake.fetch, "ck_sai").createCheckout(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect((err as PaymentProviderError).httpStatus).toBe(403);
    expect((err as PaymentProviderError).unreachable).toBe(false);
    expect(String(err)).toContain("trace-auth");
  });

  it("HTTP lỗi khác và phản hồi không phải JSON: lỗi có mã HTTP, không phải unreachable", async () => {
    const bad = provider(async () => new Response(JSON.stringify({ trace_id: "t1", status: 400, error: "x" }), { status: 400 }));
    expect(((await bad.createCheckout(req).catch((e: unknown) => e)) as PaymentProviderError).httpStatus).toBe(400);
    const html = provider(async () => new Response("<html>502</html>", { status: 502 }));
    const err = (await html.createCheckout(req).catch((e: unknown) => e)) as PaymentProviderError;
    expect(err.httpStatus).toBe(502);
    expect(err.unreachable).toBe(false);
  });

  it("lỗi mạng và quá thời gian chờ: unreachable, để đối soát dừng sớm", async () => {
    const down = (await provider(async () => Promise.reject(new TypeError("fetch failed"))).createCheckout(req).catch((e: unknown) => e)) as PaymentProviderError;
    expect(String(down)).toBe("PaymentProviderError: Creem không trả lời (TypeError: fetch failed)");
    expect(down.unreachable).toBe(true);
    const slow = (await provider(async () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")))
      .createCheckout(req)
      .catch((e: unknown) => e)) as PaymentProviderError;
    expect(String(slow)).toBe("PaymentProviderError: Creem không trả lời sau 10 giây");
    expect(slow.unreachable).toBe(true);
  });

  it("tên miền trang thanh toán là hằng của provider", () => {
    expect(CREEM_CHECKOUT_HOST).toBe("checkout.creem.io");
  });
});

describe("Creem: trạng thái đơn", () => {
  /** Tạo một phiên cho đơn 1000042 (gói Monthly, 3,99 USD) và trả về provider cùng tham chiếu để hỏi lại. */
  async function started() {
    const fake = new FakeCreem();
    const p = provider(fake.fetch);
    const { providerRef } = await p.createCheckout(req);
    return { fake, p, ref: { orderCode: req.orderCode, providerRef } };
  }

  it("hỏi đúng GET /v1/checkouts?checkout_id=…; phiên chưa trả: pending, giá là custom_price, chưa nhận đồng nào", async () => {
    const { fake, p, ref } = await started();
    expect(await p.getPaymentStatus(ref)).toEqual({ orderCode: 1000042, status: "pending", amount: 399, amountPaid: 0, paidAt: null });
    expect(fake.requests.at(-1)).toMatchObject({ method: "GET", path: "/v1/checkouts?checkout_id=ch_fake1", apiKey: TEST_CREEM_API_KEY, body: null });
  });

  it("khách đã trả: paid, amount là giá niêm yết, amountPaid không gồm thuế dù khách trả thêm thuế", async () => {
    const { fake, p, ref } = await started();
    fake.pay(ref.providerRef!, 80);
    expect(await p.getPaymentStatus(ref)).toEqual({ orderCode: 1000042, status: "paid", amount: 399, amountPaid: 399, paidAt: null });
  });

  it.each([
    ["processing", "processing"],
    ["expired", "expired"],
  ] as const)("phiên Creem %s thành %s", async (creem, ours) => {
    const { fake, p, ref } = await started();
    fake.setStatus(ref.providerRef!, creem);
    expect((await p.getPaymentStatus(ref)).status).toBe(ours);
  });

  it.each([
    ["paid", "paid"],
    ["partially_refunded", "paid"],
    ["refunded", "refunded"],
    ["pending", "processing"],
  ])("phiên đã hoàn tất mà đơn là %s: %s", async (orderStatus, ours) => {
    const { fake, p, ref } = await started();
    fake.pay(ref.providerRef!);
    fake.setOrderStatus(ref.providerRef!, orderStatus);
    const st = await p.getPaymentStatus(ref);
    expect(st.status).toBe(ours);
    expect(st.amount).toBe(399);
  });

  it("phiên đã hoàn tất mà chưa có đơn: processing (hỏi lại sau), giá vẫn là custom_price", async () => {
    const { fake, p, ref } = await started();
    fake.setStatus(ref.providerRef!, "completed");
    expect(await p.getPaymentStatus(ref)).toMatchObject({ status: "processing", amount: 399, amountPaid: 0 });
  });

  it("amountPaid lấy sub_total; thiếu sub_total thì lấy amount", async () => {
    const entity = (order: Record<string, unknown>) =>
      new Response(JSON.stringify({ id: "ch_1", status: "completed", request_id: "1000042", custom_price: 399, order: { currency: "USD", status: "paid", ...order } }));
    const ref = { orderCode: 1000042, providerRef: "ch_1" };
    expect(await provider(async () => entity({ amount: 399, sub_total: 399, amount_paid: 479 })).getPaymentStatus(ref)).toMatchObject({ amount: 399, amountPaid: 399 });
    expect(await provider(async () => entity({ amount: 399, amount_paid: 479 })).getPaymentStatus(ref)).toMatchObject({ amount: 399, amountPaid: 399 });
  });

  it.each([
    ["chưa có mã phiên", { orderCode: 1000042, providerRef: null }],
  ])("%s: lỗi, không gọi mạng", async (_why, ref) => {
    const fake = new FakeCreem();
    await expect(provider(fake.fetch).getPaymentStatus(ref)).rejects.toThrow(/chưa có mã phiên/);
    expect(fake.requests).toHaveLength(0);
  });

  it("request_id của phiên khác mã đơn: lỗi (không bao giờ cấp nhầm đơn)", async () => {
    const { p } = await started();
    await expect(p.getPaymentStatus({ orderCode: 1000043, providerRef: "ch_fake1" })).rejects.toThrow(/request_id/);
  });

  it.each([
    ["trạng thái phiên lạ", { id: "ch_1", status: "chờ", request_id: "1000042", custom_price: 399 }],
    // Trạng thái ĐƠN lạ ("disputed", thiếu, null) không còn là lỗi: giữ đơn (A5d, describe "gia cố ... hardening A5").
    // Đơn chưa thu tiền (hay đã hoàn): loại tiền lạ, số tiền hỏng là lỗi. Đơn đã trả thì giữ đơn thay vì ném (A5b, A5c; describe
    // "gia cố ... hardening A5").
    ["đơn chưa thu tiền không phải USD", { id: "ch_1", status: "completed", request_id: "1000042", custom_price: 399, order: { amount: 399, currency: "EUR", status: "pending" } }],
    ["đơn đã hoàn không phải USD", { id: "ch_1", status: "completed", request_id: "1000042", custom_price: 399, order: { amount: 399, currency: "usd", status: "refunded" } }],
    ["phiên hết hạn, đơn chưa thu tiền không phải USD", { id: "ch_1", status: "expired", request_id: "1000042", custom_price: 399, order: { amount: 399, status: "pending" } }],
    ["số tiền của đơn chưa thu tiền không phải số nguyên", { id: "ch_1", status: "completed", request_id: "1000042", custom_price: 399, order: { amount: 3.99, currency: "USD", status: "pending" } }],
    ["phiên chưa trả mà thiếu custom_price", { id: "ch_1", status: "pending", request_id: "1000042" }],
  ])("%s: PaymentProviderError", async (_why, body) => {
    const p = provider(async () => new Response(JSON.stringify(body)));
    await expect(p.getPaymentStatus({ orderCode: 1000042, providerRef: "ch_1" })).rejects.toThrow(PaymentProviderError);
  });

  it("phiên không tồn tại (404), khóa sai (403), lỗi tạm (500): PaymentProviderError mang mã HTTP", async () => {
    const { fake, p, ref } = await started();
    expect(((await p.getPaymentStatus({ ...ref, providerRef: "ch_khong_co" }).catch((e: unknown) => e)) as PaymentProviderError).httpStatus).toBe(404);
    fake.statusFailures = [500];
    expect(((await p.getPaymentStatus(ref).catch((e: unknown) => e)) as PaymentProviderError).httpStatus).toBe(500);
    const wrongKey = provider(fake.fetch, "ck_sai");
    expect(((await wrongKey.getPaymentStatus(ref).catch((e: unknown) => e)) as PaymentProviderError).httpStatus).toBe(403);
  });

  it("lỗi mạng và quá thời gian chờ: unreachable; hàng đợi lỗi hết thì trả lời bình thường", async () => {
    const { fake, p, ref } = await started();
    fake.statusFailures = ["network", "timeout"];
    expect(((await p.getPaymentStatus(ref).catch((e: unknown) => e)) as PaymentProviderError).unreachable).toBe(true);
    expect(((await p.getPaymentStatus(ref).catch((e: unknown) => e)) as PaymentProviderError).unreachable).toBe(true);
    expect((await p.getPaymentStatus(ref)).status).toBe("pending");
  });
});

describe("Creem: thân THẬT của Creem sandbox ngày 2026-10-16 (test/fixtures/creem/README.md)", () => {
  /** Phiên của lần đo: mã đơn 9000001, gói Monthly 3,99 USD. */
  const ref = { orderCode: 9000001, providerRef: "ch_491X90hRbNHfL1fKCEZYCt" };
  const answering = (raw: string): FetchFn => async () => new Response(raw, { status: 200, headers: { "content-type": "application/json" } });

  it.each([
    ["phiên chưa trả (không có order)", getPendingReal, { orderCode: 9000001, status: "pending", amount: 399, amountPaid: 0, paidAt: null }],
    // (S6) Giờ trả là `order.updated_at` ("2026-10-16T14:47:31.536Z", làm tròn xuống giây), không phải `order.created_at` (lúc mở trang).
    ["phiên đã trả (order đủ amount, sub_total, tax_amount 0, amount_paid; không có trường giảm giá)", getPaidReal, { orderCode: 9000001, status: "paid", amount: 399, amountPaid: 399, paidAt: 1792162051 }],
  ])("GET /v1/checkouts, %s: đọc đúng, không rơi vào nhánh giữ đơn hay dữ liệu hỏng", async (_why, raw, expected) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await provider(answering(raw)).getPaymentStatus(ref)).toEqual(expected);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  /** GET thật đã trả, `order.updated_at` thay bằng `updatedAt` (`undefined`: bỏ trường), cùng các trường khác của order nếu cần. */
  const paidWith = (updatedAt: unknown, order: Record<string, unknown> = {}) => {
    const body = JSON.parse(getPaidReal) as { order: Record<string, unknown> };
    return JSON.stringify({ ...body, order: { ...body.order, updated_at: updatedAt, ...order } });
  };

  it.each([
    ["mili giây bị làm tròn xuống", "2026-10-16T14:47:31.999Z", 1792162051],
    ["không có phần lẻ của giây", "2026-10-16T14:47:31Z", 1792162051],
    ["múi giờ +07:00 (cùng một lúc)", "2026-10-16T21:47:31.536+07:00", 1792162051],
    ["đúng mốc 2020-01-01", "2020-01-01T00:00:00Z", 1577836800],
  ])("(S6) giờ trả đọc từ order.updated_at (%s)", async (_why, updatedAt, paidAt) => {
    expect(await provider(answering(paidWith(updatedAt))).getPaymentStatus(ref)).toMatchObject({ status: "paid", paidAt });
  });

  it.each([
    ["thiếu", undefined],
    ["null", null],
    ["là số (mili giây)", 1792162051536],
    ["chuỗi không phải ngày giờ", "hôm qua"],
    ["chỉ có ngày", "2026-10-16"],
    ["không có múi giờ (giờ địa phương mơ hồ)", "2026-10-16T14:47:31.536"],
    ["ngày không có thật", "2026-02-30T10:00:00Z"],
    ["trước năm 2020", "2019-12-31T23:59:59Z"],
    ["xa trong tương lai (từ năm 2100)", "2100-01-01T00:00:00Z"],
  ])("(S6) order.updated_at %s: vẫn paid, paidAt null (server dùng lúc xử lý)", async (_why, updatedAt) => {
    expect(await provider(answering(paidWith(updatedAt))).getPaymentStatus(ref)).toEqual({ orderCode: 9000001, status: "paid", amount: 399, amountPaid: 399, paidAt: null });
  });

  it("(S6) đơn bị giữ (underpaid: trả thiếu, có giảm giá, dữ liệu hỏng) hay đã hoàn (refunded): paidAt null dù có order.updated_at hợp lệ", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (const order of [{ amount_paid: 300 }, { discount: "dis_1", discount_amount: 99 }, { currency: "EUR" }]) {
        expect(await provider(answering(paidWith("2026-10-16T14:47:31.536Z", order))).getPaymentStatus(ref)).toMatchObject({ status: "underpaid", paidAt: null });
      }
      expect(await provider(answering(paidWith("2026-10-16T14:47:31.536Z", { status: "refunded" }))).getPaymentStatus(ref)).toMatchObject({ status: "refunded", paidAt: null });
    } finally {
      warn.mockRestore();
    }
  });

  it("GET thật trả request_id của đơn khác: lỗi (không cấp nhầm)", async () => {
    await expect(provider(answering(getPaidReal)).getPaymentStatus({ ...ref, orderCode: 9000002 })).rejects.toThrow(/request_id/);
  });

  it("POST /v1/checkouts thật: đọc được id và checkout_url (không có request_id hay order); host sandbox creem.io/test/… KHÔNG phải host thanh toán production nên bị từ chối, host production thì nhận", async () => {
    const created = JSON.parse(createCheckoutReal) as Record<string, unknown>;
    expect(created).not.toHaveProperty("request_id");
    expect(created.checkout_url).toBe("https://creem.io/test/checkout/prod_6Os0IAgPEv0IhPIv6led8L/ch_491X90hRbNHfL1fKCEZYCt");
    await expect(provider(answering(createCheckoutReal)).createCheckout(req)).rejects.toThrow(/ngoài tên miền thanh toán/);
    const production = createCheckoutReal.replace("https://creem.io/test/checkout/", `https://${CREEM_CHECKOUT_HOST}/test/checkout/`);
    expect(await provider(answering(production)).createCheckout(req)).toEqual({
      providerRef: "ch_491X90hRbNHfL1fKCEZYCt",
      checkoutUrl: `https://${CREEM_CHECKOUT_HOST}/test/checkout/prod_6Os0IAgPEv0IhPIv6led8L/ch_491X90hRbNHfL1fKCEZYCt`,
      qrCode: null,
    });
  });
});

describe("Creem: cấu hình", () => {
  const ids = { monthly: "prod_aaa111", six_months: "prod_bbb222", yearly: "prod_ccc333" };

  it("CREEM_PRODUCT_IDS đúng ba gói với ba mã prod_… khác nhau thì đọc được", () => {
    expect(parseProductIds(ids)).toEqual(ids);
  });

  it.each([
    ["thiếu biến", undefined],
    ["không phải object", "prod_aaa111"],
    ["là mảng", ["prod_aaa111"]],
    ["chưa điền (chuỗi rỗng)", { monthly: "", six_months: "", yearly: "" }],
    ["một gói chưa điền", { ...ids, yearly: "" }],
    ["thiếu gói", { monthly: ids.monthly, yearly: ids.yearly }],
    ["thừa gói lạ", { ...ids, pro: "prod_ddd444" }],
    ["không có tiền tố prod_", { ...ids, monthly: "aaa111" }],
    ["có ký tự lạ", { ...ids, monthly: "prod_aaa 111" }],
    ["không phải chuỗi", { ...ids, monthly: 7 }],
    ["hai gói trùng mã", { ...ids, yearly: ids.six_months }],
    ["ba gói cùng một mã", { monthly: ids.monthly, six_months: ids.monthly, yearly: ids.monthly }],
  ])("CREEM_PRODUCT_IDS %s: null (không bán USD)", (_why, raw) => {
    expect(parseProductIds(raw)).toBeNull();
  });

  const full = { CREEM_BASE_URL: "https://creem.test", CREEM_API_KEY: "ck", CREEM_WEBHOOK_SECRET: "ws", CREEM_PRODUCT_IDS: ids };

  it("đủ cấu hình thì dựng được provider tên creem, bán được (tạo phiên mới)", () => {
    const p = creemFromEnv(full);
    expect(p?.name).toBe("creem");
    expect(p?.sells).toBe(true);
  });

  it.each([
    ["thiếu khóa API", { CREEM_API_KEY: "" }],
    ["thiếu secret webhook", { CREEM_WEBHOOK_SECRET: "" }],
  ])("%s: không dựng provider (webhook Creem 404)", (_why, patch) => {
    expect(creemFromEnv({ ...full, ...patch })).toBeNull();
  });

  it.each([
    ["chưa điền mã sản phẩm (tắt bán thẻ khẩn cấp)", { monthly: "", six_months: "", yearly: "" }],
    ["thiếu biến mã sản phẩm", undefined],
    ["điền dở", { ...ids, yearly: "" }],
    ["hai gói trùng mã", { ...ids, yearly: ids.monthly }],
  ])("có khóa API và secret webhook mà %s: dựng provider chỉ xử lý (sells false: webhook, trạng thái, hoàn tiền; không tạo phiên)", (_why, productIds) => {
    const p = creemFromEnv({ ...full, CREEM_PRODUCT_IDS: productIds });
    expect(p?.name).toBe("creem");
    expect(p?.sells).toBe(false);
  });

  it("realDeps: PayOS luôn có; cổng creem có khi có khóa API và secret webhook, bán khi đủ ba mã sản phẩm (không đọc mã sản phẩm của repo)", () => {
    const deps = (patch: Partial<ApiEnv>) => realDeps({ ...env, ...full, ...patch } as ApiEnv);
    const gates = (patch: Partial<ApiEnv>) => Object.keys(deps(patch).payments).sort();
    expect(gates({})).toEqual(["creem", "payos"]);
    expect(deps({}).payments.creem?.sells).toBe(true);
    const unsold = { CREEM_PRODUCT_IDS: { monthly: "", six_months: "", yearly: "" } };
    expect(gates(unsold)).toEqual(["creem", "payos"]);
    expect(deps(unsold).payments.creem?.sells).toBe(false);
    expect(gates({ CREEM_API_KEY: "" })).toEqual(["payos"]);
    expect(gates({ CREEM_WEBHOOK_SECRET: "" })).toEqual(["payos"]);
    // PayOS không khai báo `sells`: bán được (checkout.ts chỉ chặn khi `sells === false`).
    expect(deps({}).payments.payos?.sells).toBeUndefined();
  });

  it("creemFromEnv nối đúng dây: secret webhook kiểm chữ ký; gốc API, khóa API và mã sản phẩm của gói đi tới Creem", async () => {
    const p = creemFromEnv(full)!;
    const raw = JSON.stringify({ id: "evt_1", eventType: "checkout.completed", object: { id: "ch_1", request_id: "42" } });
    const signed = new Headers({ "creem-signature": await hmacSha256Hex(full.CREEM_WEBHOOK_SECRET, raw) });
    expect(await p.verifyWebhook({ rawBody: raw, headers: signed })).toMatchObject({ kind: "payment", orderCode: 42 });
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({ id: "ch_1", checkout_url: "https://checkout.creem.io/ch_1" })));
    try {
      await p.createCheckout(req);
      expect(spy).toHaveBeenCalledTimes(1);
      const [url, init] = spy.mock.calls[0] ?? [];
      expect(url).toBe(`${full.CREEM_BASE_URL}/v1/checkouts`);
      expect(new Headers(init?.headers).get("x-api-key")).toBe(full.CREEM_API_KEY);
      expect(JSON.parse(String(init?.body))).toMatchObject({ product_id: ids.monthly });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Creem: cổng chỉ đọc của Worker admin", () => {
  const reader = { CREEM_BASE_URL: "https://creem.test", CREEM_API_KEY: "ck" };
  const readOnly = (fetchFn: FetchFn) => new CreemProvider({ baseUrl: "https://creem.test", apiKey: TEST_CREEM_API_KEY }, fetchFn);

  it("creemReaderFromEnv chỉ cần gốc API và khóa API (không secret webhook, không mã sản phẩm); thiếu khóa API thì null", () => {
    expect(creemReaderFromEnv(reader)?.name).toBe("creem");
    expect(creemReaderFromEnv({ ...reader, CREEM_API_KEY: "" })).toBeNull();
  });

  it("creemReaderFromEnv trả kiểu hẹp (chỉ name và getPaymentStatus): không tạo phiên, không nhận webhook; đặt nhầm vào Deps.payments của Worker API thì tsc đỏ", () => {
    const gate = creemReaderFromEnv(reader);
    // @ts-expect-error cổng chỉ đọc không có createCheckout (thêm vào kiểu trả về thì dòng này đỏ ở `pnpm typecheck`)
    void gate?.createCheckout;
    // @ts-expect-error Deps.payments của Worker API cần đủ PaymentProvider (tạo phiên, nhận webhook): kiểu hẹp không gán vào được
    const wrong: Deps["payments"] = { creem: gate! };
    void wrong;
  });

  it("hỏi được trạng thái phiên chỉ với khóa API", async () => {
    const fake = new FakeCreem();
    const { providerRef } = await provider(fake.fetch).createCheckout(req);
    expect(await readOnly(fake.fetch).getPaymentStatus({ orderCode: req.orderCode, providerRef })).toEqual({
      orderCode: 1000042,
      status: "pending",
      amount: 399,
      amountPaid: 0,
      paidAt: null,
    });
  });

  it("không bán (sells false), không tạo được phiên (lỗi PaymentProviderError rõ ràng, không phải TypeError); webhook không kiểm được chữ ký nên null như sai chữ ký; không gọi mạng", async () => {
    const fake = new FakeCreem();
    expect(readOnly(fake.fetch).sells).toBe(false);
    const created = readOnly(fake.fetch).createCheckout(req);
    // `rejects.toThrow(/monthly/)` vẫn xanh với TypeError "reading 'monthly'" nếu ai đó bỏ `?.`: phải đúng lớp lỗi và đúng câu.
    await expect(created).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(created).rejects.toThrow(/chưa có sản phẩm cho gói monthly/);
    // Ký đúng bằng secret thật vẫn null: cổng không có secret thì không bao giờ tin webhook (và không ném lỗi thành 500).
    const raw = JSON.stringify({ id: "evt_1", eventType: "checkout.completed", object: { id: "ch_1", request_id: "42" } });
    const signed = new Headers({ "creem-signature": await hmacSha256Hex(TEST_CREEM_WEBHOOK_SECRET, raw) });
    expect(await readOnly(fake.fetch).verifyWebhook({ rawBody: raw, headers: signed })).toBeNull();
    expect(fake.requests).toHaveLength(0);
  });
});

describe("realAdminDeps: dây nối thật của Worker admin (admin-entry.ts chỉ gọi hàm này)", () => {
  const adminEnv = (patch: Partial<AdminEnv> = {}) =>
    ({ ...env, CREEM_BASE_URL: "https://api.creem.io", CREEM_API_KEY: "ck", ...patch }) as unknown as AdminEnv;

  it("PayOS luôn có; cổng creem chỉ có khi có khóa API Creem (Worker admin không cần secret webhook hay mã sản phẩm)", () => {
    const gates = (patch: Partial<AdminEnv>) => Object.keys(realAdminDeps(adminEnv(patch)).payments).sort();
    expect(gates({})).toEqual(["creem", "payos"]);
    expect(gates({ CREEM_API_KEY: "" })).toEqual(["payos"]);
    expect(realAdminDeps(adminEnv()).payments.creem?.getPaymentStatus).toBeTypeOf("function");
  });

  it("cổng creem hỏi đúng gốc API, đúng khóa API và không theo chuyển hướng (redirect: manual); kết quả là trạng thái phiên đã đọc", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({ id: "ch_9", request_id: "42", status: "pending", custom_price: 399 })));
    try {
      const gate = realAdminDeps(adminEnv()).payments.creem!;
      expect(await gate.getPaymentStatus({ orderCode: 42, providerRef: "ch_9" })).toEqual({
        orderCode: 42,
        status: "pending",
        amount: 399,
        amountPaid: 0,
        paidAt: null,
      });
      expect(spy).toHaveBeenCalledTimes(1);
      const [url, init] = spy.mock.calls[0] ?? [];
      expect(url).toBe("https://api.creem.io/v1/checkouts?checkout_id=ch_9");
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("x-api-key")).toBe("ck");
      expect(init?.redirect).toBe("manual");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Creem: đơn có giảm giá hay trả thấp hơn giá không bao giờ thành paid (Q4, D6)", () => {
  /** Phiên của đơn 1000042 (Monthly, 3,99 USD) mà khách đã trả theo `pay` của FakeCreem. */
  async function paid(tax: number, discount: Parameters<FakeCreem["pay"]>[2] = {}, amountIncludesTax = false) {
    const fake = new FakeCreem();
    fake.amountIncludesTax = amountIncludesTax;
    const p = provider(fake.fetch);
    const { providerRef } = await p.createCheckout(req);
    fake.pay(providerRef, tax, discount);
    return p.getPaymentStatus({ orderCode: req.orderCode, providerRef });
  }
  /** Phiên đã hoàn tất với đơn `order` (Creem trả nguyên văn), custom_price 399 trừ khi ghi đè. */
  const completed = (order: Record<string, unknown>, session: Record<string, unknown> = {}) =>
    provider(
      async () =>
        new Response(
          JSON.stringify({ id: "ch_1", status: "completed", request_id: "1000042", custom_price: 399, ...session, order: { currency: "USD", status: "paid", ...order } }),
        ),
    ).getPaymentStatus({ orderCode: 1000042, providerRef: "ch_1" });
  /** Kết quả của đơn bị giữ (underpaid) của đơn 1000042, kèm dữ kiện của Creem cho nhật ký (`reviewDetail`). */
  const held = (amount: number, amountPaid: number, reviewDetail: Record<string, unknown>) => ({
    orderCode: 1000042,
    status: "underpaid",
    amount,
    amountPaid,
    paidAt: null,
    reviewDetail,
  });

  it("discount_amount 100, thuế 100 (amount_paid 399 bằng giá): underpaid; amountPaid 299 là phần đã nhận thuộc về giá (amount_paid − tax_amount), không phải giá", async () => {
    expect(await paid(100, { discountAmount: 100 })).toEqual(
      held(399, 299, { has_discount: true, provider_discount_amount: 100, provider_amount_paid: 399, provider_tax_amount: 100 }),
    );
  });

  it("chỉ có mã giảm giá (discount \"dis_1\", discount_amount 0, trả đủ): underpaid, amountPaid 399; không chép mã giảm giá vào dữ kiện (chỉ có/không)", async () => {
    expect(await paid(0, { discountId: "dis_1" })).toEqual(
      held(399, 399, { has_discount: true, provider_discount_amount: 0, provider_amount_paid: 399, provider_tax_amount: 0 }),
    );
  });

  it.each([
    ["amount vẫn là giá", { amount: 399, sub_total: 399, amount_paid: 300 }, {}, 399, { has_discount: false, provider_amount_paid: 300 }],
    ["Creem ghi đơn theo số đã giảm (amount 300)", { amount: 300, sub_total: 300, amount_paid: 300 }, {}, 300, { has_discount: false, provider_amount_paid: 300 }],
    [
      "thiếu custom_price: so với sub_total (amount của đơn đã gồm thuế; amount_paid 384 − thuế 84 = 300; kết quả vẫn là giá 399)",
      { amount: 483, sub_total: 399, tax_amount: 84, amount_paid: 384 },
      { custom_price: undefined },
      399,
      { has_discount: false, provider_amount_paid: 384, provider_tax_amount: 84 },
    ],
    ["thiếu custom_price và sub_total: so với amount", { amount: 399, amount_paid: 300 }, { custom_price: undefined }, 399, { has_discount: false, provider_amount_paid: 300 }],
  ])("không có trường giảm giá mà phần đã trả thuộc về giá 300 < giá mong đợi 399 (%s): underpaid, amountPaid 300", async (_why, order, session, amount, detail) => {
    expect(await completed(order, session)).toEqual(held(amount, 300, detail));
  });

  it.each([
    ["amount không gồm thuế", { amount: 399, sub_total: 399, tax_amount: 84, amount_paid: 433 }],
    ["amount đã gồm thuế", { amount: 483, sub_total: 399, tax_amount: 84, amount_paid: 433 }],
  ])("(I-1) giảm 50 ≤ thuế 84 mà Creem không ghi trường giảm giá nào: amount_paid 433 ≥ giá 399 nhưng 433 − 84 = 349 < 399, underpaid, amountPaid 349 (%s)", async (_why, order) => {
    expect(await completed(order)).toEqual(held(399, 349, { has_discount: false, provider_amount_paid: 433, provider_tax_amount: 84 }));
  });

  it("(I-1) đúng mẫu OrderEntity của OpenAPI (amount 2000 = sub_total 1800 + thuế 200, giảm 100, amount_paid 1900): 1900 − 200 = 1700 < 1800, underpaid, amountPaid 1700", async () => {
    const order = { amount: 2000, sub_total: 1800, tax_amount: 200, discount: "dis_1234567890", discount_amount: 100, amount_due: 1900, amount_paid: 1900 };
    expect(await completed(order, { custom_price: 1800 })).toEqual({
      orderCode: 1000042,
      status: "underpaid",
      amount: 1800,
      amountPaid: 1700,
      paidAt: null,
      reviewDetail: { has_discount: true, provider_discount_amount: 100, provider_amount_paid: 1900, provider_tax_amount: 200 },
    });
  });

  it.each([false, true])("FakeCreem (order.amount gồm thuế: %s): giảm 50 ở nước thuế 84 thì underpaid, amountPaid 349; chỉ có thuế thì paid, amountPaid 399", async (includesTax) => {
    expect(await paid(84, { discountAmount: 50, discountId: "dis_small" }, includesTax)).toEqual(
      held(399, 349, { has_discount: true, provider_discount_amount: 50, provider_amount_paid: 433, provider_tax_amount: 84 }),
    );
    expect(await paid(84, {}, includesTax)).toEqual({ orderCode: 1000042, status: "paid", amount: 399, amountPaid: 399, paidAt: null });
  });

  it.each([
    ["giảm 100% (amount_paid 0)", { amount: 399, sub_total: 399, tax_amount: 0, discount: "dis_full", discount_amount: 399, amount_paid: 0 }, 0, { provider_discount_amount: 399, provider_amount_paid: 0, provider_tax_amount: 0 }],
    ["amount_paid 50 nhỏ hơn thuế 84 (50 − 84 < 0)", { amount: 399, sub_total: 399, tax_amount: 84, discount_amount: 433, amount_paid: 50 }, 0, { provider_discount_amount: 433, provider_amount_paid: 50, provider_tax_amount: 84 }],
    ["thiếu amount_paid (không biết đã thu bao nhiêu)", { amount: 399, sub_total: 399, discount: "dis_1" }, 0, {}],
    ["amount_paid null", { amount: 399, sub_total: 399, discount: "dis_1", amount_paid: null }, 0, {}],
  ])("(I-3) có giảm giá, %s: underpaid, amountPaid là phần đã nhận thuộc về giá, kẹp ≥ 0, 0 khi không biết số đã thu (không ghi giá)", async (_why, order, amountPaid, detail) => {
    expect(await completed(order)).toEqual(held(399, amountPaid, { has_discount: true, ...detail }));
  });

  it.each([
    ["đối tượng DiscountEntity", { id: "dis_1", discountCode: "HOLIDAY2024", type: "fixed", amount: 0 }],
    ["mã chuỗi", "dis_1"],
  ])("(I-2) chỉ phiên mang giảm giá (discount cấp phiên là %s), đơn không ghi gì và trả đủ: underpaid, amountPaid 399", async (_why, discount) => {
    expect(await completed({ amount: 399, sub_total: 399, amount_paid: 399 }, { discount })).toEqual(held(399, 399, { has_discount: true, provider_amount_paid: 399 }));
  });

  it("(I-2) FakeCreem: phiên mang đối tượng giảm giá (discount cấp phiên), đơn không có mã hay số giảm: underpaid", async () => {
    expect(await paid(0, { checkoutDiscount: true })).toEqual(
      held(399, 399, { has_discount: true, provider_discount_amount: 0, provider_amount_paid: 399, provider_tax_amount: 0 }),
    );
  });

  it("có thuế (amount_paid 483 > 399), không giảm giá: paid, amountPaid 399 (không gồm thuế)", async () => {
    expect(await paid(84)).toEqual({ orderCode: 1000042, status: "paid", amount: 399, amountPaid: 399, paidAt: null });
  });

  it.each([
    ["amount không gồm thuế", { amount: 399, sub_total: 399, tax_amount: 84, amount_paid: 483 }, {}, 399],
    ["amount đã gồm thuế (kết quả vẫn là giá 399: so khớp bằng sub_total)", { amount: 483, sub_total: 399, tax_amount: 84, amount_paid: 483 }, {}, 399],
    ["discount null, discount_amount 0", { amount: 399, sub_total: 399, discount: null, discount_amount: 0, amount_paid: 399 }, {}, 399],
    ["discount chuỗi rỗng", { amount: 399, sub_total: 399, discount: "", amount_paid: 399 }, {}, 399],
    ["thiếu amount_paid", { amount: 399, sub_total: 399 }, {}, 399],
    ["discount cấp phiên null, tax_amount null", { amount: 399, sub_total: 399, tax_amount: null, amount_paid: 399 }, { discount: null }, 399],
    ["discount cấp phiên chuỗi rỗng", { amount: 399, sub_total: 399, amount_paid: 399 }, { discount: "" }, 399],
  ])("không giảm giá, trả đủ (%s): paid, amountPaid 399", async (_why, order, session, amount) => {
    expect(await completed(order, session)).toEqual({ orderCode: 1000042, status: "paid", amount, amountPaid: 399, paidAt: null });
  });

  it("đơn Creem báo refunded mà có giảm giá: vẫn refunded (đường đóng đơn đã hoàn), không thành underpaid", async () => {
    expect(await completed({ amount: 399, sub_total: 399, status: "refunded", discount: "dis_1", discount_amount: 100, amount_paid: 299 })).toMatchObject({
      status: "refunded",
    });
  });

  it.each([
    // Phiên pending/processing mà đơn đã trả thì KHÔNG còn ở đây: giữ đơn (A5d, test "phiên chưa xong mà đơn đã trả").
    ["phiên processing, đơn chưa thu tiền (pending)", { status: "processing" }, { status: "pending" }, "processing"],
    ["phiên pending, đơn chưa thu tiền (pending)", { status: "pending" }, { status: "pending" }, "pending"],
    ["phiên đã hoàn tất mà đơn chưa thu tiền (pending)", {}, { status: "pending" }, "processing"],
    ["phiên hết hạn (expired), đơn chưa thu tiền", { status: "expired" }, { status: "pending" }, "expired"],
  ])("(gác status paid) %s: giữ trạng thái %s, không bao giờ thành underpaid dù có discount/discount_amount", async (_why, session, order, status) => {
    const discounted = { amount: 399, sub_total: 399, discount: "dis_1", discount_amount: 100, amount_paid: 299, ...order };
    expect(await completed(discounted, session)).toEqual({ orderCode: 1000042, status, amount: 399, amountPaid: 0, paidAt: null });
  });

  it.each([
    ["pending", "paid"],
    ["processing", "paid"],
    ["pending", "partially_refunded"],
    ["processing", "partially_refunded"],
  ])(
    "(A5d) phiên %s mà đơn %s (tiền đã thu, phiên chưa chuyển): giữ đơn underpaid, amountPaid 0, trường hỏng checkout.status, một dòng log; không trả pending/processing (đơn sẽ hết hạn im lặng)",
    async (sessionStatus, orderStatus) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const order = { amount: 399, sub_total: 399, tax_amount: 0, discount_amount: 0, amount_paid: 399, status: orderStatus };
        expect(await completed(order, { status: sessionStatus })).toEqual(
          held(399, 0, { has_discount: false, provider_discount_amount: 0, provider_amount_paid: 399, provider_tax_amount: 0, provider_malformed_fields: ["checkout.status"] }),
        );
        expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
          { event: "creem_malformed_paid_session", order_code: 1000042, provider_ref: "ch_1", fields: ["checkout.status"] },
        ]);
      } finally {
        warn.mockRestore();
      }
    },
  );

  it("(M-1) custom_price của phiên thấp hơn giá (0) mà khách trả 0, không trường giảm giá: underpaid (ngưỡng không bao giờ thấp hơn giá niêm yết), không paid", async () => {
    expect(await completed({ amount: 399, sub_total: 399, amount_paid: 0 }, { custom_price: 0 })).toEqual(held(399, 0, { has_discount: false, provider_amount_paid: 0 }));
    expect(await completed({ amount: 399, sub_total: 399, amount_paid: 100 }, { custom_price: 100 })).toEqual(held(399, 100, { has_discount: false, provider_amount_paid: 100 }));
  });
});

describe("Creem: gia cố đọc phản hồi của call() và getPaymentStatus (hardening A5)", () => {
  const ref = { orderCode: 1000042, providerRef: "ch_1" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  /** Phiên chưa trả như Creem trả lại (GET), đã nhận đúng mã đơn và giá ta gửi. */
  const session = (over: Record<string, unknown> = {}) => ({ id: "ch_1", status: "pending", request_id: "1000042", custom_price: 399, ...over });
  /** Phản hồi của POST tạo phiên. */
  const created = (over: Record<string, unknown> = {}) => ({
    id: "ch_1",
    status: "pending",
    request_id: "1000042",
    custom_price: 399,
    checkout_url: "https://checkout.creem.io/ch_1",
    ...over,
  });
  /** Phiên đã hoàn tất với đơn `order` (mặc định đã trả đủ 399, không thuế, không giảm giá). */
  const withOrder = (order: Record<string, unknown> = {}, over: Record<string, unknown> = {}) =>
    session({ status: "completed", order: { currency: "USD", status: "paid", amount: 399, ...order }, ...over });
  const create = (body: unknown) => provider(async () => reply(body)).createCheckout(req);
  const ask = (body: unknown) => provider(async () => reply(body)).getPaymentStatus(ref);
  /** Hàm fetch giống `fetchFn` nhưng bỏ một header của yêu cầu (thử thiếu khóa API, thiếu content-type). */
  const without =
    (fetchFn: FetchFn, header: string): FetchFn =>
    (url, init) => {
      const headers = new Headers(init?.headers);
      headers.delete(header);
      return fetchFn(url, { ...init, headers });
    };
  async function caught(promise: Promise<unknown>): Promise<PaymentProviderError> {
    try {
      await promise;
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentProviderError);
      return err as PaymentProviderError;
    }
    throw new Error("đáng lẽ phải ném PaymentProviderError");
  }

  describe("call(): chuyển hướng, mã lỗi, quá thời gian", () => {
    it.each([300, 301, 302, 303, 307, 308, 399])(
      "HTTP %i: yêu cầu gửi redirect \"manual\"; trả lỗi chuyển hướng có mã HTTP, không đọc thân, không phải unreachable (cả POST lẫn GET)",
      async (status) => {
        for (const method of ["POST", "GET"] as const) {
          const seen: (RequestInit["redirect"] | undefined)[] = [];
          const responses: Response[] = [];
          const p = provider(async (_url, init) => {
            seen.push(init?.redirect);
            const res = new Response("{}", { status, headers: { location: "https://evil.example/steal" } });
            vi.spyOn(res, "json");
            responses.push(res);
            return res;
          });
          const err = await caught(method === "POST" ? p.createCheckout(req) : p.getPaymentStatus(ref));
          expect(seen).toEqual(["manual"]);
          expect(err.httpStatus).toBe(status);
          expect(err.unreachable).toBe(false);
          expect(err.message).toBe(`Creem chuyển hướng (HTTP ${status})`);
          expect(responses[0]?.json).not.toHaveBeenCalled();
        }
      },
    );

    it("thiếu khóa API: 401 (khác 403 của khóa sai) cả khi tạo phiên lẫn khi hỏi trạng thái; có trace_id, không phải unreachable", async () => {
      const fake = new FakeCreem();
      const post = await caught(provider(without(fake.fetch, "x-api-key")).createCheckout(req));
      expect(post).toMatchObject({ httpStatus: 401, unreachable: false, message: "Creem lỗi HTTP 401 (trace_id trace-401)" });
      expect(fake.checkouts.size).toBe(0);
      const { providerRef } = await provider(fake.fetch).createCheckout(req);
      const get = await caught(provider(without(fake.fetch, "x-api-key")).getPaymentStatus({ orderCode: req.orderCode, providerRef }));
      expect(get).toMatchObject({ httpStatus: 401, unreachable: false, message: "Creem lỗi HTTP 401 (trace_id trace-401)" });
      const wrong = await caught(provider(fake.fetch, "ck_sai").getPaymentStatus({ orderCode: req.orderCode, providerRef }));
      expect(wrong.httpStatus).toBe(403);
    });

    it("tạo phiên gặp 429 hay 5xx: lỗi mang mã HTTP (không phải unreachable); lần sau tạo được và mã phiên vẫn là ch_fake1", async () => {
      const fake = new FakeCreem();
      const p = provider(fake.fetch);
      fake.createFailures = [429, 503, 500];
      for (const status of [429, 503, 500]) {
        const err = await caught(p.createCheckout(req));
        expect(err).toMatchObject({ httpStatus: status, unreachable: false, message: `Creem lỗi HTTP ${status} (trace_id trace-fail)` });
      }
      expect(fake.checkouts.size).toBe(0);
      expect((await p.createCheckout(req)).providerRef).toBe("ch_fake1");
    });

    it("hỏi trạng thái gặp 429 hay 5xx: lỗi mang mã HTTP (không phải unreachable)", async () => {
      const fake = new FakeCreem();
      const p = provider(fake.fetch);
      const { providerRef } = await p.createCheckout(req);
      fake.statusFailures = [429, 502, 500];
      for (const status of [429, 502, 500]) {
        const err = await caught(p.getPaymentStatus({ orderCode: req.orderCode, providerRef }));
        expect(err).toMatchObject({ httpStatus: status, unreachable: false, message: `Creem lỗi HTTP ${status} (trace_id trace-fail)` });
      }
    });

    it("thân JSON gửi đi thiếu content-type: Creem trả 400, lỗi mang mã HTTP 400; provider luôn gửi content-type nên các ca khác không gặp", async () => {
      const fake = new FakeCreem();
      const err = await caught(provider(without(fake.fetch, "content-type")).createCheckout(req));
      expect(err).toMatchObject({ httpStatus: 400, unreachable: false });
      expect(fake.checkouts.size).toBe(0);
      expect((await provider(fake.fetch).createCheckout(req)).providerRef).toBe("ch_fake1");
    });

    it("quá thời gian lúc ĐỌC thân (không phải lúc nối): unreachable, không có mã HTTP, câu như lúc nối (cả POST lẫn GET)", async () => {
      const slowBody = async () => {
        const res = new Response("{}");
        vi.spyOn(res, "json").mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
        return res;
      };
      for (const err of [await caught(provider(slowBody).createCheckout(req)), await caught(provider(slowBody).getPaymentStatus(ref))]) {
        expect(err.unreachable).toBe(true);
        expect(err.httpStatus).toBeUndefined();
        expect(err.message).toBe("Creem không trả lời sau 10 giây");
      }
    });

    it("thân không đọc được vì lý do khác (không phải quá thời gian): giữ mã HTTP, không phải unreachable", async () => {
      const err = await caught(provider(async () => new Response("<html>ok?</html>", { status: 200 })).createCheckout(req));
      expect(err).toMatchObject({ httpStatus: 200, unreachable: false, message: "Creem trả HTTP 200 không phải JSON" });
    });

    it("truyền signal hết hạn sau 10 giây cho fetch (cả POST lẫn GET)", async () => {
      const signals: (AbortSignal | null | undefined)[] = [];
      const spy = (body: unknown): FetchFn => async (_url, init) => {
        signals.push(init?.signal);
        return reply(body);
      };
      await provider(spy(created())).createCheckout(req);
      await provider(spy(session())).getPaymentStatus(ref);
      expect(signals).toHaveLength(2);
      for (const signal of signals) {
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal?.aborted).toBe(false);
      }
    });

    it.each([
      ["mảng", []],
      ["chuỗi", "chào"],
      ["null", null],
      ["số", 5],
    ])("HTTP 200 mà thân JSON là %s (không phải đối tượng): lỗi, không đoán (cả POST lẫn GET)", async (_why, body) => {
      for (const err of [await caught(create(body)), await caught(ask(body))]) {
        expect(err).toMatchObject({ httpStatus: 200, unreachable: false });
        expect(err.message).toMatch(/không phải đối tượng/);
      }
    });

    it("không bao giờ đưa khóa API, email khách, hay chữ lạ của Creem (thân lỗi, trace_id, giá trị trường) vào thông điệp lỗi", async () => {
      // Địa chỉ email nguyên vẹn và khóa API nguyên vẹn không bao giờ có mặt (chữ lạ bị cắt 32 ký tự và "@" bị che thành "?").
      const spies = [TEST_CREEM_API_KEY, req.email, "buyer@"];
      const attacker = `${req.email} ${TEST_CREEM_API_KEY}`;
      const fake = new FakeCreem();
      const { providerRef } = await provider(fake.fetch).createCheckout(req);
      const mine = { orderCode: req.orderCode, providerRef };
      const failures: Promise<unknown>[] = [
        provider(without(fake.fetch, "x-api-key")).createCheckout(req),
        provider(fake.fetch, "ck_sai").createCheckout(req),
        // 400 mà Creem trích dữ liệu của khách vào `message` và trace_id: chỉ trace_id hợp lệ được ghi lại.
        provider(async () => reply({ trace_id: "t-1", status: 400, error: "Bad Request", message: [`email ${attacker} sai`] }, 400)).createCheckout(req),
        provider(async () => reply({ trace_id: attacker, status: 400, error: "Bad Request" }, 400)).createCheckout(req),
        provider(async () => reply({ trace_id: "x".repeat(500), status: 500, error: "x" }, 500)).createCheckout(req),
        provider(async () => new Response(`<html>${attacker}</html>`, { status: 502 })).createCheckout(req),
        provider(async () => new Response(null, { status: 307, headers: { location: `https://evil.example/?e=${req.email}` } })).createCheckout(req),
        create(created({ id: attacker })),
        create(created({ checkout_url: `https://${req.email}@evil.example/${TEST_CREEM_API_KEY}` })),
        ask(session({ id: attacker })),
        ask(session({ request_id: attacker })),
        ask(session({ status: attacker })),
        // Trạng thái ĐƠN lạ thì giữ đơn, không ném (A5d): chữ lạ ở đó được kiểm ở test "mọi trường tiền đều hỏng và chứa chữ lạ".
        // Đơn chưa thu tiền: loại tiền lạ, số tiền hỏng vẫn là lỗi. Đơn đã trả (kể cả phiên expired mà đơn đã trả) thì giữ đơn thay vì
        // ném (test "mọi trường tiền đều hỏng và chứa chữ lạ").
        ask(withOrder({ status: "pending", currency: attacker })),
        ask(withOrder({ status: "pending", amount: attacker })),
        ask(withOrder({ status: "pending", sub_total: attacker })),
        ask(session({ order: attacker })),
        provider(fake.fetch, "ck_sai").getPaymentStatus(mine),
      ];
      const errors = await Promise.all(failures.map(caught));
      expect(errors).toHaveLength(failures.length);
      for (const err of errors) {
        for (const secret of spies) expect(String(err)).not.toContain(secret);
        expect(err.message.length).toBeLessThan(200);
      }
    });
  });

  describe("createCheckout: kiểm dữ liệu trước và sau khi gọi", () => {
    it.each([
      ["https://checkout.creem.io@evil.com/x"],
      ["javascript:alert(1)"],
      ["https://evil.com/ch_1"],
      ["//checkout.creem.io/ch_1"],
      ["https://checkout.creem.io:8443/ch_1"],
    ])("checkout_url %s: lỗi nói rõ ngoài tên miền thanh toán", async (url) => {
      const err = await caught(create(created({ checkout_url: url })));
      expect(err.message).toMatch(/ngoài tên miền thanh toán/);
    });

    it.each([
      ["https://checkout.creem.io:443/ch_1", "https://checkout.creem.io/ch_1"],
      ["https://CHECKOUT.CREEM.IO/ch_1", "https://checkout.creem.io/ch_1"],
      ["https://Checkout.Creem.io:443/a%20b?x=1#f", "https://checkout.creem.io/a%20b?x=1#f"],
      // Dấu gạch chéo ngược là dấu phân cách đường dẫn với https: máy chủ vẫn là checkout.creem.io; địa chỉ chuẩn hóa không còn mập mờ.
      ["https://checkout.creem.io\\@evil.com/ch_1", "https://checkout.creem.io/@evil.com/ch_1"],
    ])("checkout_url %s được nhận và trả về dạng chuẩn hóa %s (app và server cùng thấy một địa chỉ)", async (url, normalized) => {
      expect((await create(created({ checkout_url: url }))).checkoutUrl).toBe(normalized);
    });

    it.each([
      ["rỗng", ""],
      ["có khoảng trắng", "ch 1"],
      ["có dấu gạch chéo", "ch/1"],
      ["có ký tự điều khiển", "ch_1\n"],
      ["dài hơn 128 ký tự", "c".repeat(129)],
      ["có dấu hỏi (chèn tham số)", "ch_1?x=1"],
      ["không phải chuỗi", 7],
    ])("id phiên %s: lỗi (id vào provider_ref và URL hỏi trạng thái)", async (_why, id) => {
      const err = await caught(create(created({ id })));
      expect(err.message).toMatch(/id/);
    });

    it.each(["ch_1", "ch-1", "CH_Ab-9", "c".repeat(128)])("id phiên %s: nhận", async (id) => {
      expect((await create(created({ id }))).providerRef).toBe(id);
    });

    it.each([
      ["thấp hơn 100 cent", 99],
      ["bằng 0", 0],
      ["âm", -399],
      ["có phần lẻ", 399.5],
      ["không phải số", Number.NaN],
      ["quá lớn", 100_000_000],
      ["vô hạn", Number.POSITIVE_INFINITY],
    ])("amount %s: lỗi trước khi gọi mạng", async (_why, amount) => {
      const fake = new FakeCreem();
      const err = await caught(provider(fake.fetch).createCheckout({ ...req, amount }));
      expect(err.httpStatus).toBeUndefined();
      expect(err.unreachable).toBe(false);
      expect(fake.requests).toHaveLength(0);
    });

    it.each([100, 399, 99_999_999])("amount %i cent: nằm trong khoảng 100..99.999.999, gửi đi nguyên văn", async (amount) => {
      const fake = new FakeCreem();
      await provider(fake.fetch).createCheckout({ ...req, amount });
      expect(fake.requests[0]?.body).toMatchObject({ custom_price: amount });
    });

    it("(SP2) custom_price Creem trả lại khớp số đã gửi (như thân thật ở sandbox: 399): nhận, không log", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(await create(created({ custom_price: 399 }))).toEqual({ providerRef: "ch_1", checkoutUrl: "https://checkout.creem.io/ch_1", qrCode: null });
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it.each([
      ["khác số đã gửi (999: như giá mặc định của sản phẩm)", 999],
      ["thấp hơn số đã gửi (398)", 398],
      ["cao hơn một cent (400)", 400],
      ["là chuỗi", "399"],
      ["null", null],
      ["có phần lẻ", 399.5],
      ["là đối tượng", { amount: 399 }],
    ])("(SP2) custom_price Creem trả lại %s: lỗi, không trả link cho khách", async (_why, customPrice) => {
      const err = await caught(create(created({ custom_price: customPrice })));
      expect(err.message).toMatch(/custom_price/);
      expect(err.message).not.toContain("checkout.creem.io");
    });

    it("(SP2) phản hồi không có custom_price: nhận (server chỉ cấp theo GET), một dòng log creem_checkout_no_custom_price chỉ có mã đơn", async () => {
      const { custom_price: _dropped, ...withoutPrice } = created();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(await create(withoutPrice)).toEqual({ providerRef: "ch_1", checkoutUrl: "https://checkout.creem.io/ch_1", qrCode: null });
        expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([{ event: "creem_checkout_no_custom_price", order_code: 1000042 }]);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe("getPaymentStatus: ca mâu thuẫn là lỗi, không xếp êm", () => {
    it("providerRef rỗng: lỗi, không gọi mạng (không bao giờ hỏi checkout_id=)", async () => {
      const fake = new FakeCreem();
      await expect(provider(fake.fetch).getPaymentStatus({ orderCode: 1000042, providerRef: "" })).rejects.toThrow(/chưa có mã phiên/);
      expect(fake.requests).toHaveLength(0);
    });

    it.each([
      ["id của phiên khác", { id: "ch_2" }],
      ["thiếu id", { id: undefined }],
      ["id không phải chuỗi", { id: 1 }],
    ])("phiên trả về có %s: lỗi (không bao giờ cấp theo phiên không phải cái ta hỏi)", async (_why, over) => {
      const err = await caught(ask(withOrder({}, over)));
      expect(err).toMatchObject({ httpStatus: undefined, unreachable: false });
      expect(err.message).toMatch(/phiên khác|id/);
    });

    it("request_id: thiếu (null, vắng) khác với của đơn khác (chuỗi lạ, kiểu số); thông điệp phân biệt hai ca và kèm giá trị lạ", async () => {
      for (const over of [{ request_id: undefined }, { request_id: null }]) {
        expect((await caught(ask(withOrder({}, over)))).message).toBe("Creem trả phiên thiếu request_id");
      }
      const other = await caught(ask(withOrder({}, { request_id: "1000043" })));
      expect(other.message).toBe('Creem trả request_id của đơn khác ("1000043")');
      const numeric = await caught(ask(withOrder({}, { request_id: 42 })));
      expect(numeric.message).toBe("Creem trả request_id của đơn khác (42)");
      // (M-6) Số trùng với mã đơn mà là kiểu số (không phải chuỗi ta gửi): vẫn là lỗi; so bằng String() hai vế là cho qua nhầm.
      const sameNumber = await caught(ask(withOrder({}, { request_id: 1000042 })));
      expect(sameNumber.message).toBe("Creem trả request_id của đơn khác (1000042)");
      const long = await caught(ask(withOrder({}, { request_id: "9".repeat(100) })));
      expect(long.message).toBe(`Creem trả request_id của đơn khác ("${"9".repeat(32)}")`);
    });

    it.each([
      ["email", "buyer@example.com"],
      ["có \"@\" sau 32 ký tự đầu", `${"x".repeat(40)}@example.com`],
      ["có khoảng trắng", "Nguyen Van A"],
      ["có xuống dòng", "a\nb"],
      ["có tab", "a\tb"],
    ])("(M-7) giá trị lạ là chuỗi %s: thông điệp ghi [đã che], không ghi chữ nào của giá trị (kể cả dạng đã thay ký tự)", async (_why, value) => {
      const err = await caught(ask(withOrder({}, { request_id: value })));
      expect(err.message).toBe("Creem trả request_id của đơn khác ([đã che])");
      expect((await caught(ask(session({ status: value })))).message).toBe("Creem trả trạng thái phiên không đọc được ([đã che])");
    });

    it.each([
      ["chuỗi", "x"],
      ["mảng", []],
      ["số", 7],
      ["true", true],
    ])("order là %s (không phải đối tượng): lỗi, không coi là chưa có đơn", async (_why, order) => {
      for (const status of ["completed", "pending", "expired"]) {
        const err = await caught(ask(session({ status, order })));
        expect(err.message).toMatch(/order/);
      }
    });

    it.each([
      ["order null", { order: null }],
      ["không có order", {}],
    ])("phiên đã hoàn tất mà %s: processing (hỏi lại sau), giá là custom_price", async (_why, over) => {
      expect(await ask(session({ status: "completed", ...over }))).toEqual({ orderCode: 1000042, status: "processing", amount: 399, amountPaid: 0, paidAt: null });
    });

    it.each(["paid", "partially_refunded"])(
      "(A5c) phiên hết hạn (expired) mà đơn %s (tiền đã thu, mâu thuẫn): KHÔNG ném lỗi, không trả expired (đối soát sẽ bỏ đơn); giữ đơn underpaid, amountPaid 0, trường hỏng checkout.status, một dòng log creem_malformed_paid_session",
      async (orderStatus) => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
          const order = { currency: "USD", status: orderStatus, amount: 399, sub_total: 399, tax_amount: 84, discount_amount: 0, amount_paid: 483 };
          expect(await ask(session({ status: "expired", order }))).toEqual({
            orderCode: 1000042,
            status: "underpaid",
            amount: 399,
            amountPaid: 0,
            paidAt: null,
            reviewDetail: {
              has_discount: false,
              provider_discount_amount: 0,
              provider_amount_paid: 483,
              provider_tax_amount: 84,
              provider_malformed_fields: ["checkout.status"],
            },
          });
          expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
            { event: "creem_malformed_paid_session", order_code: 1000042, provider_ref: "ch_1", fields: ["checkout.status"] },
          ]);
        } finally {
          warn.mockRestore();
        }
      },
    );

    it("(A5c) phiên expired mà đơn đã trả và loại tiền lạ: giữ đơn, cả hai trường trong danh sách hỏng", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(await ask(session({ status: "expired", order: { currency: "EUR", status: "paid", amount: 399 } }))).toMatchObject({
          status: "underpaid",
          amountPaid: 0,
          reviewDetail: { provider_malformed_fields: ["checkout.status", "order.currency"] },
        });
      } finally {
        warn.mockRestore();
      }
    });

    it.each([
      ["không có đơn", undefined],
      ["đơn chưa thu tiền (pending)", "pending"],
      ["đơn đã hoàn đủ (refunded)", "refunded"],
    ])("phiên hết hạn (expired) %s: expired như cũ, amount 399, amountPaid 0", async (_why, orderStatus) => {
      const order = orderStatus === undefined ? {} : { order: { currency: "USD", status: orderStatus, amount: 399 } };
      expect(await ask(session({ status: "expired", ...order }))).toEqual({ orderCode: 1000042, status: "expired", amount: 399, amountPaid: 0, paidAt: null });
    });

    it("trạng thái lạ của PHIÊN: lỗi kèm giá trị lạ (cắt 32 ký tự)", async () => {
      expect((await caught(ask(session({ status: "chờ" })))).message).toBe('Creem trả trạng thái phiên không đọc được ("ch?")');
      expect((await caught(ask(session({ status: "x".repeat(50) })))).message).toBe(`Creem trả trạng thái phiên không đọc được ("${"x".repeat(32)}")`);
      expect((await caught(ask(withOrder({}, { status: "partialRefund" })))).message).toBe('Creem trả trạng thái phiên không đọc được ("partialRefund")');
    });

    it.each([
      ["completed", ["order.status"]],
      ["expired", ["checkout.status", "order.status"]],
      ["pending", ["checkout.status", "order.status"]],
      ["processing", ["checkout.status", "order.status"]],
    ])(
      "(A5d) phiên %s mà trạng thái ĐƠN lạ, thiếu hay null (có thể đã thu tiền): KHÔNG ném lỗi; giữ đơn underpaid, amountPaid 0, trường hỏng %j, một dòng log mỗi lần hỏi",
      async (sessionStatus, fields) => {
        for (const orderStatus of ["partialRefund", "disputed", "x".repeat(50), undefined, null, 7]) {
          const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
          try {
            expect(await ask(session({ status: sessionStatus, order: { currency: "USD", amount: 399, status: orderStatus } }))).toEqual({
              orderCode: 1000042,
              status: "underpaid",
              amount: 399,
              amountPaid: 0,
              paidAt: null,
              reviewDetail: { has_discount: false, provider_malformed_fields: fields },
            });
            expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
              { event: "creem_malformed_paid_session", order_code: 1000042, provider_ref: "ch_1", fields },
            ]);
          } finally {
            warn.mockRestore();
          }
        }
      },
    );
  });

  describe("getPaymentStatus: số tiền (amount, amountPaid)", () => {
    it.each([
      ["phiên pending, chưa có đơn", session(), "pending", 399, 0],
      ["phiên processing", session({ status: "processing" }), "processing", 399, 0],
      ["đơn paid", withOrder({ status: "paid" }), "paid", 399, 399],
      ["đơn partially_refunded", withOrder({ status: "partially_refunded" }), "paid", 399, 399],
      ["đơn refunded (tiền đã nhận rồi hoàn)", withOrder({ status: "refunded" }), "refunded", 399, 399],
      ["đơn pending (phiên đã hoàn tất, chưa thu tiền)", withOrder({ status: "pending" }), "processing", 399, 0],
    ])("amountPaid theo trạng thái: %s", async (_why, body, status, amount, amountPaid) => {
      expect(await ask(body)).toEqual({ orderCode: 1000042, status, amount, amountPaid, paidAt: null });
    });

    it.each([
      ["amount không gồm thuế", { amount: 399, sub_total: 399, tax_amount: 84, amount_paid: 483 }],
      ["amount đã gồm thuế", { amount: 483, sub_total: 399, tax_amount: 84, amount_paid: 483 }],
    ])("so khớp và amountPaid theo sub_total ?? amount, đúng cả hai cách hiểu amount của Creem (%s): amount 399, amountPaid 399, paid", async (_why, order) => {
      expect(await ask(withOrder(order))).toEqual({ orderCode: 1000042, status: "paid", amount: 399, amountPaid: 399, paidAt: null });
    });

    it("thiếu sub_total (vắng hay null) thì dùng amount; có sub_total thì amount của đơn không được dùng", async () => {
      for (const subTotal of [undefined, null]) {
        expect(await ask(withOrder({ amount: 399, sub_total: subTotal }))).toMatchObject({ amount: 399, amountPaid: 399 });
      }
      // Đơn 3,50 USD mà ta bán 3,99: số khớp với đơn của ta là 350 (không phải 399), nên fulfilOrder báo lệch tiền, không cấp.
      expect(await ask(withOrder({ amount: 399, sub_total: 350, amount_paid: 430 }))).toEqual({
        orderCode: 1000042,
        status: "paid",
        amount: 350,
        amountPaid: 350,
        paidAt: null,
      });
    });

    it.each([
      ["chuỗi", "399"],
      ["chuỗi \"0\"", "0"],
      ["số âm", -1],
      ["số lẻ", 350.5],
      ["true", true],
      ["đối tượng", {}],
    ])("đơn chưa thu tiền (pending) hay đã hoàn (refunded) mà sub_total có mặt và là %s: lỗi như A5 (không thay lặng lẽ bằng amount)", async (_why, subTotal) => {
      for (const status of ["pending", "refunded"]) {
        const err = await caught(ask(withOrder({ status, sub_total: subTotal })));
        expect(err.message).toMatch(/sub_total/);
      }
    });

    /** Hỏi phiên `body` với console.warn bị bắt: kết quả, các dòng log JSON đã parse và nguyên văn. */
    async function askLogged(body: unknown) {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const result = await ask(body);
        const raw = warn.mock.calls.map((c) => String(c[0]));
        return { result, raw, logs: raw.map((line) => JSON.parse(line) as Record<string, unknown>) };
      } finally {
        warn.mockRestore();
      }
    }
    const malformedLog = (fields: string[]) => ({ event: "creem_malformed_paid_session", order_code: 1000042, provider_ref: "ch_1", fields });

    it.each([
      // [ca, trường của đơn, trường của phiên, tên trường hỏng, có dấu hiệu giảm giá, amount kỳ vọng]
      ["(A5c) currency là \"usd\" (chữ thường)", { currency: "usd" }, {}, ["order.currency"], false, 399],
      ["(A5c) currency là EUR", { currency: "EUR" }, {}, ["order.currency"], false, 399],
      ["(A5c) thiếu currency", { currency: undefined }, {}, ["order.currency"], false, 399],
      ["(A5c) currency null", { currency: null }, {}, ["order.currency"], false, 399],
      ["(A5c) currency là số", { currency: 840 }, {}, ["order.currency"], false, 399],
      ["sub_total là chuỗi", { sub_total: "399" }, {}, ["order.sub_total"], false, 399],
      ["sub_total là chuỗi \"0\"", { sub_total: "0" }, {}, ["order.sub_total"], false, 399],
      ["sub_total âm", { sub_total: -1 }, {}, ["order.sub_total"], false, 399],
      ["sub_total lẻ", { sub_total: 350.5 }, {}, ["order.sub_total"], false, 399],
      ["sub_total là true", { sub_total: true }, {}, ["order.sub_total"], false, 399],
      ["sub_total là đối tượng", { sub_total: {} }, {}, ["order.sub_total"], false, 399],
      ["amount là chuỗi, sub_total hợp lệ", { amount: "399", sub_total: 399 }, {}, ["order.amount"], false, 399],
      ["thiếu amount, sub_total hợp lệ", { amount: undefined, sub_total: 399 }, {}, ["order.amount"], false, 399],
      ["amount lẻ, không có sub_total (không còn giá nào đọc được)", { amount: 3.99 }, {}, ["order.amount"], false, 0],
      ["amount âm, không có sub_total", { amount: -399 }, {}, ["order.amount"], false, 0],
      ["tax_amount là chuỗi", { tax_amount: "84" }, {}, ["order.tax_amount"], false, 399],
      ["tax_amount âm", { tax_amount: -1 }, {}, ["order.tax_amount"], false, 399],
      ["tax_amount lẻ", { tax_amount: 8.4 }, {}, ["order.tax_amount"], false, 399],
      ["discount là số", { discount: 7 }, {}, ["order.discount"], true, 399],
      ["discount là đối tượng (không phải mã chuỗi như OpenAPI ghi)", { discount: { id: "dis_1" } }, {}, ["order.discount"], true, 399],
      ["discount_amount là chữ", { discount_amount: "100" }, {}, ["order.discount_amount"], true, 399],
      ["discount_amount là chữ \"0\"", { discount_amount: "0" }, {}, ["order.discount_amount"], true, 399],
      ["discount_amount là số lẻ", { discount_amount: 99.5 }, {}, ["order.discount_amount"], true, 399],
      ["discount_amount âm", { discount_amount: -100 }, {}, ["order.discount_amount"], true, 399],
      ["amount_paid là chữ", { amount_paid: "483" }, {}, ["order.amount_paid"], false, 399],
      ["amount_paid âm", { amount_paid: -1 }, {}, ["order.amount_paid"], false, 399],
      ["amount_paid là số lẻ", { amount_paid: 398.5 }, {}, ["order.amount_paid"], false, 399],
      ["custom_price của phiên là chữ", {}, { custom_price: "399" }, ["checkout.custom_price"], false, 399],
      ["custom_price của phiên âm", {}, { custom_price: -399 }, ["checkout.custom_price"], false, 399],
      ["discount cấp phiên là số", {}, { discount: 7 }, ["checkout.discount"], true, 399],
      ["discount cấp phiên là mảng", {}, { discount: [] }, ["checkout.discount"], true, 399],
      ["discount cấp phiên là true", {}, { discount: true }, ["checkout.discount"], true, 399],
    ] as const)(
      "(A5b) đơn đã trả mà %s: KHÔNG ném lỗi; giữ đơn (underpaid, amountPaid 0: không biết đã thu bao nhiêu), dữ kiện ghi tên trường hỏng, một dòng log creem_malformed_paid_session",
      async (_why, order, over, fields, hasDiscount, amount) => {
        const { result, logs } = await askLogged(withOrder(order, over));
        expect(result).toEqual({
          orderCode: 1000042,
          status: "underpaid",
          amount,
          amountPaid: 0,
          paidAt: null,
          reviewDetail: { has_discount: hasDiscount, provider_malformed_fields: [...fields] },
        });
        expect(logs).toEqual([malformedLog([...fields])]);
      },
    );

    it("(A5b) trường hỏng cùng trường đọc được: vẫn giữ với amountPaid 0; dữ kiện có cả số đọc được lẫn tên trường hỏng", async () => {
      const { result, logs } = await askLogged(withOrder({ sub_total: 399, discount_amount: "50", tax_amount: 84, amount_paid: 433 }));
      expect(result).toEqual({
        orderCode: 1000042,
        status: "underpaid",
        amount: 399,
        amountPaid: 0,
        paidAt: null,
        reviewDetail: { has_discount: true, provider_amount_paid: 433, provider_tax_amount: 84, provider_malformed_fields: ["order.discount_amount"] },
      });
      expect(logs).toEqual([malformedLog(["order.discount_amount"])]);
    });

    it("(A5b) mọi trường tiền đều hỏng và chứa chữ lạ (email, khóa API): kết quả và dòng log chỉ có tên trường (thứ tự cố định), không chép giá trị nào", async () => {
      const attacker = `${req.email} ${TEST_CREEM_API_KEY}`;
      const order = {
        status: attacker,
        currency: attacker,
        amount: attacker,
        sub_total: attacker,
        tax_amount: attacker,
        discount: { email: req.email },
        discount_amount: attacker,
        amount_paid: attacker,
      };
      const { result, raw, logs } = await askLogged(withOrder(order, { custom_price: attacker, discount: 7 }));
      const fields = [
        "order.status",
        "order.currency",
        "order.amount",
        "order.sub_total",
        "order.tax_amount",
        "order.discount",
        "order.discount_amount",
        "order.amount_paid",
        "checkout.custom_price",
        "checkout.discount",
      ];
      expect(result).toEqual({
        orderCode: 1000042,
        status: "underpaid",
        amount: 0,
        amountPaid: 0,
        paidAt: null,
        reviewDetail: { has_discount: true, provider_malformed_fields: fields },
      });
      expect(logs).toEqual([malformedLog(fields)]);
      for (const secret of [TEST_CREEM_API_KEY, req.email, "buyer@"]) {
        expect(JSON.stringify(result)).not.toContain(secret);
        expect(raw.join("\n")).not.toContain(secret);
      }
    });

    it("(A5b) đơn đã trả đủ, dữ liệu đúng kiểu: không có dòng log creem_malformed_paid_session, không có reviewDetail", async () => {
      const { result, logs } = await askLogged(withOrder({ sub_total: 399, tax_amount: 84, discount: null, discount_amount: 0, amount_paid: 483 }));
      expect(result).toEqual({ orderCode: 1000042, status: "paid", amount: 399, amountPaid: 399, paidAt: null });
      expect(logs).toEqual([]);
    });

    it("các trường giảm giá, thuế và trả tiền đều null (Creem trả null khi không có): như vắng, đơn paid đủ", async () => {
      expect(
        await ask(withOrder({ sub_total: null, tax_amount: null, discount: null, discount_amount: null, amount_paid: null }, { custom_price: null, discount: null })),
      ).toEqual({
        orderCode: 1000042,
        status: "paid",
        amount: 399,
        amountPaid: 399,
        paidAt: null,
      });
    });

    it("đơn refunded mà trường giảm giá hỏng: vẫn refunded (đường đóng đơn đã hoàn không bị chặn; chỉ đơn đã trả mới cần phép kiểm giảm giá)", async () => {
      expect(await ask(withOrder({ status: "refunded", discount_amount: "x", amount_paid: -1, discount: 7 }))).toMatchObject({ status: "refunded", amount: 399, amountPaid: 399 });
    });
  });
});
