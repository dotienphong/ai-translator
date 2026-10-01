import { describe, expect, it } from "vitest";
import { hmacSha256Hex } from "../src/crypto";
import { objectSignatureData, PayOSProvider, parsePayOSTime } from "../src/payment/payos";
import { PaymentProviderError } from "../src/payment/provider";

// Dữ liệu mẫu và checksum key mẫu trong tài liệu PayOS
// (https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/).
const DOC_CHECKSUM_KEY = "1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675";
const DOC_WEBHOOK = {
  code: "00",
  desc: "success",
  success: true,
  data: {
    orderCode: 123,
    amount: 3000,
    description: "VQRIO123",
    accountNumber: "12345678",
    reference: "TF230204212323",
    transactionDateTime: "2023-02-04 18:25:00",
    currency: "VND",
    paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
    code: "00",
    desc: "Thành công",
    counterAccountBankId: "",
    counterAccountBankName: "",
    counterAccountName: "",
    counterAccountNumber: "",
    virtualAccountName: "",
    virtualAccountNumber: "",
  },
  signature: "412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03",
};

async function signed(data: Record<string, unknown>) {
  return { code: "00", desc: "success", data, signature: await hmacSha256Hex(DOC_CHECKSUM_KEY, objectSignatureData(data)) };
}

function provider(fetchFn: (url: string, init?: RequestInit) => Promise<Response>) {
  return new PayOSProvider(
    { baseUrl: "https://payos.test", clientId: "cid", apiKey: "akey", checksumKey: DOC_CHECKSUM_KEY },
    fetchFn,
  );
}

describe("PayOS: chữ ký webhook", () => {
  it("nhận webhook mẫu của tài liệu PayOS", async () => {
    expect(await provider(fetch).verifyWebhook(DOC_WEBHOOK)).toEqual({ orderCode: 123 });
  });

  it("từ chối webhook bị sửa số tiền", async () => {
    const body = { ...DOC_WEBHOOK, data: { ...DOC_WEBHOOK.data, amount: 3_000_000 } };
    expect(await provider(fetch).verifyWebhook(body)).toBeNull();
  });

  it("chữ ký ở mục schema của tài liệu (8d8640…) không khớp dữ liệu mẫu", async () => {
    const body = { ...DOC_WEBHOOK, signature: "8d8640d802576397a1ce45ebda7f835055768ac7ad2e0bfb77f9b8f12cca4c7f" };
    expect(await provider(fetch).verifyWebhook(body)).toBeNull();
  });

  it("đúng chữ ký mà orderCode không phải số nguyên: trả \"malformed\", không phải null (sai chữ ký) (review cuối, N2)", async () => {
    const p = provider(fetch);
    for (const orderCode of ["123", 1.5, null, -0.5]) {
      expect(await p.verifyWebhook(await signed({ ...DOC_WEBHOOK.data, orderCode }))).toBe("malformed");
    }
    const { orderCode: _drop, ...noCode } = DOC_WEBHOOK.data;
    expect(await p.verifyWebhook(await signed(noCode))).toBe("malformed");
    // Sai chữ ký thì vẫn là null, dù orderCode cũng sai dạng: chưa kiểm được chữ ký thì không tin nội dung.
    // (Chuỗi ký không phân biệt "123" với 123, nên đổi giá trị chứ không chỉ đổi kiểu.)
    expect(await p.verifyWebhook({ data: { ...DOC_WEBHOOK.data, orderCode: "124" }, signature: DOC_WEBHOOK.signature })).toBeNull();
  });

  it("từ chối body sai định dạng", async () => {
    const p = provider(fetch);
    expect(await p.verifyWebhook(null)).toBeNull();
    expect(await p.verifyWebhook("x")).toBeNull();
    expect(await p.verifyWebhook({ data: [], signature: "a" })).toBeNull();
    expect(await p.verifyWebhook({ data: DOC_WEBHOOK.data })).toBeNull();
  });

  it("chuỗi ký: xếp key, null thành rỗng, mảng thành JSON có key đã xếp", () => {
    expect(objectSignatureData({ b: 1, a: null, c: [{ y: 2, x: null }], d: undefined, e: "null" })).toBe(
      'a=&b=1&c=[{"x":null,"y":2}]&e=',
    );
  });
});

describe("PayOS: tạo link thanh toán", () => {
  const req = {
    orderCode: 42,
    amount: 2000,
    currency: "VND",
    description: "AT42",
    returnUrl: "https://example.com/v1/pay/return",
    cancelUrl: "https://example.com/v1/pay/cancel",
    expiresAt: 1_790_000_900,
  };
  const linkData = {
    bin: "970422",
    accountNumber: "113366668888",
    accountName: "TEST",
    amount: 2000,
    description: "AT42",
    orderCode: 42,
    currency: "VND",
    paymentLinkId: "plink42",
    status: "PENDING",
    checkoutUrl: "https://pay.payos.vn/web/plink42",
    qrCode: "000201010212...6304ABCD",
  };

  it("gửi đúng header, body và chữ ký; đọc checkoutUrl, qrCode", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const response = await signed(linkData);
    const p = provider(async (url, init = {}) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(response));
    });
    expect(await p.createCheckout(req)).toEqual({
      providerRef: "plink42",
      checkoutUrl: "https://pay.payos.vn/web/plink42",
      qrCode: "000201010212...6304ABCD",
    });
    const call = calls[0]!;
    expect(call.url).toBe("https://payos.test/v2/payment-requests");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["x-client-id"]).toBe("cid");
    expect(headers["x-api-key"]).toBe("akey");
    expect(headers["user-agent"]).toBe("license-server/1.0");
    expect(JSON.parse(call.init.body as string)).toEqual({
      amount: 2000,
      cancelUrl: req.cancelUrl,
      description: "AT42",
      orderCode: 42,
      returnUrl: req.returnUrl,
      expiredAt: 1_790_000_900,
      // Tính độc lập bằng node:crypto trên chuỗi amount=…&cancelUrl=…&description=…&orderCode=…&returnUrl=…
      signature: "3b642cc02e67ae879c756e689d7b0273c2888be77f562eb65cfe0cf120534c33",
    });
  });

  it("response sai chữ ký thì báo lỗi", async () => {
    const response = { ...(await signed(linkData)), signature: "0".repeat(64) };
    const p = provider(async () => new Response(JSON.stringify(response)));
    await expect(p.createCheckout(req)).rejects.toThrow(/chữ ký response/);
  });

  it("PayOS trả mã lỗi thì ném PaymentProviderError kèm mã", async () => {
    const p = provider(async () => new Response(JSON.stringify({ code: "231", desc: "Đơn thanh toán đã tồn tại", data: null })));
    const err = await p.createCheckout(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect((err as PaymentProviderError).code).toBe("231");
  });

  it("không nhận tiền khác VND", async () => {
    await expect(provider(fetch).createCheckout({ ...req, currency: "USD" })).rejects.toThrow(/USD/);
  });
});

describe("PayOS: trạng thái đơn", () => {
  const info = (status: string, amountPaid: number, orderCode = 42) => ({
    id: "plink42",
    orderCode,
    amount: 2000,
    amountPaid,
    amountRemaining: 2000 - amountPaid,
    status,
    createdAt: "2026-10-01T00:00:00.000Z",
    transactions: [
      { reference: "FT1", amount: amountPaid, counterAccountName: null, description: "AT42", transactionDateTime: "2026-10-01 07:05:00" },
    ],
    cancellationReason: null,
    canceledAt: null,
  });

  it("gọi GET /v2/payment-requests/{orderCode} và đổi trạng thái", async () => {
    const response = await signed(info("PAID", 2000));
    const urls: string[] = [];
    const p = provider(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(response));
    });
    expect(await p.getPaymentStatus(42)).toEqual({
      orderCode: 42,
      status: "paid",
      amount: 2000,
      amountPaid: 2000,
      paidAt: 1_790_812_800 + 300, // 07:05 giờ Việt Nam = 00:05 UTC ngày 2026-10-01
    });
    expect(urls).toEqual(["https://payos.test/v2/payment-requests/42"]);
  });

  it("thời điểm thanh toán là giao dịch muộn nhất; không có giao dịch thì null", async () => {
    const twice = {
      ...info("PAID", 2000),
      transactions: [
        { reference: "FT1", amount: 1500, transactionDateTime: "2026-10-01 07:05:00" },
        { reference: "FT2", amount: 500, transactionDateTime: "2026-10-02 09:00:00" },
      ],
    };
    const p1 = provider(async () => new Response(JSON.stringify(await signed(twice))));
    expect((await p1.getPaymentStatus(42)).paidAt).toBe(1_790_812_800 + 86400 + 2 * 3600);
    const none = { ...info("PENDING", 0), transactions: [] };
    const p2 = provider(async () => new Response(JSON.stringify(await signed(none))));
    expect((await p2.getPaymentStatus(42)).paidAt).toBeNull();
  });

  it("đọc transactionDateTime: giờ Việt Nam, hoặc ISO 8601 có múi giờ", () => {
    expect(parsePayOSTime("2026-10-01 07:00:00")).toBe(1_790_812_800);
    expect(parsePayOSTime("2026-10-01 00:30:00")).toBe(1_790_812_800 - 6.5 * 3600);
    expect(parsePayOSTime("2026-10-01T07:00:00+07:00")).toBe(1_790_812_800);
    expect(parsePayOSTime("2026-10-01T00:00:00.000Z")).toBe(1_790_812_800);
    expect(parsePayOSTime("2028-02-29T00:00:00Z")).toBe(Date.UTC(2028, 1, 29) / 1000);
    for (const bad of ["", "2026-02-30 10:00:00", "2026-10-01 24:00:00", "2026-10-01T07:00:00", "hôm nay", 1_790_812_800, null]) {
      expect(parsePayOSTime(bad)).toBeNull();
    }
  });

  it("ISO 8601 với ngày giờ không có thật thì null, như nhánh giờ Việt Nam (Date.parse tự cộng sang ngày sau)", () => {
    for (const bad of [
      "2026-02-30T10:00:00Z",
      "2026-02-29T10:00:00+07:00",
      "2026-04-31T10:00:00Z",
      "2026-13-01T10:00:00Z",
      "2026-00-10T10:00:00Z",
      "2026-10-00T10:00:00Z",
      "2026-10-01T24:00:00Z",
      "2026-10-01T10:60:00Z",
      "2026-10-01T10:00:60Z",
      "2026-10-01T10:00:00+24:00",
      "2026-10-01T10:00:00+07:60",
    ]) {
      expect(parsePayOSTime(bad), bad).toBeNull();
    }
  });

  it("đủ 7 trạng thái của PayOS: chỉ PAID thành paid", async () => {
    const expected = {
      PENDING: "pending",
      PROCESSING: "processing",
      PAID: "paid",
      UNDERPAID: "underpaid",
      CANCELLED: "cancelled",
      EXPIRED: "expired",
      FAILED: "failed",
    };
    for (const [payos, ours] of Object.entries(expected)) {
      const response = await signed(info(payos, payos === "PAID" ? 2000 : 0));
      const p = provider(async () => new Response(JSON.stringify(response)));
      expect((await p.getPaymentStatus(42)).status, payos).toBe(ours);
    }
  });

  it("trạng thái lạ hoặc sai orderCode thì báo lỗi", async () => {
    const odd = await signed(info("WEIRD", 0));
    await expect(provider(async () => new Response(JSON.stringify(odd))).getPaymentStatus(42)).rejects.toThrow();
    const other = await signed(info("PAID", 2000, 43));
    await expect(provider(async () => new Response(JSON.stringify(other))).getPaymentStatus(42)).rejects.toThrow(
      /orderCode/,
    );
  });

  it("HTTP 401 thì báo lỗi", async () => {
    const p = provider(async () => new Response(JSON.stringify({ code: "401", desc: "Unauthorized" }), { status: 401 }));
    await expect(p.getPaymentStatus(42)).rejects.toThrow(/401/);
  });

  it("lỗi mạng và quá thời gian chờ thành PaymentProviderError", async () => {
    const down = await provider(async () => Promise.reject(new TypeError("fetch failed"))).getPaymentStatus(42).catch((e: unknown) => e);
    expect(down).toBeInstanceOf(PaymentProviderError);
    expect(String(down)).toBe("PaymentProviderError: PayOS không trả lời (TypeError: fetch failed)");
    const slow = await provider(async () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")))
      .createCheckout({ orderCode: 42, amount: 2000, currency: "VND", description: "AT42", returnUrl: "https://e.test/r", cancelUrl: "https://e.test/c", expiresAt: 1 })
      .catch((e: unknown) => e);
    expect(slow).toBeInstanceOf(PaymentProviderError);
    expect(String(slow)).toBe("PaymentProviderError: PayOS không trả lời sau 10 giây");
    // Hai trường hợp này là "không liên lạc được": đối soát tính chung chuỗi với 5xx để dừng sớm.
    expect((down as PaymentProviderError).unreachable).toBe(true);
    expect((slow as PaymentProviderError).unreachable).toBe(true);
  });

  it("lỗi có trả lời (HTTP lỗi, không phải JSON, sai chữ ký, dữ liệu lạ) không phải unreachable, dù không có httpStatus", async () => {
    const errOf = (body: string, status = 200): Promise<PaymentProviderError> =>
      provider(async () => new Response(body, { status }))
        .getPaymentStatus(42)
        .then(
          () => {
            throw new Error("phải báo lỗi");
          },
          (e: unknown) => e as PaymentProviderError,
        );
    const http = await errOf(JSON.stringify({ code: "401", desc: "Unauthorized" }), 401);
    const notJson = await errOf("<html>", 502);
    const badSig = await errOf(JSON.stringify({ ...(await signed(info("PAID", 2000))), signature: "0".repeat(64) }));
    const odd = await errOf(JSON.stringify(await signed(info("WEIRD", 0))));
    for (const e of [http, notJson, badSig, odd]) {
      expect(e).toBeInstanceOf(PaymentProviderError);
      expect(e.unreachable).toBe(false);
    }
    expect([http.httpStatus, notJson.httpStatus, badSig.httpStatus, odd.httpStatus]).toEqual([401, 502, undefined, undefined]);
  });
});

describe("PayOS: confirm-webhook", () => {
  it("gửi webhookUrl", async () => {
    const bodies: unknown[] = [];
    const p = provider(async (url, init) => {
      bodies.push([url, JSON.parse(init?.body as string)]);
      return new Response(JSON.stringify({ code: "00", desc: "success", data: { webhookUrl: "https://w.test/hook" } }));
    });
    await p.confirmWebhook("https://w.test/hook");
    expect(bodies).toEqual([["https://payos.test/confirm-webhook", { webhookUrl: "https://w.test/hook" }]]);
  });
});
