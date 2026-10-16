import { describe, expect, it, vi } from "vitest";
import { hmacSha256Hex } from "../src/crypto";
import { CREEM_SIGNATURE_HEADER, verifyCreemWebhook } from "../src/payment/creem-webhook";
// Thân thô thật do Creem sandbox gửi ngày 2026-10-16 (test/fixtures/creem/README.md): đúng từng byte, test tự ký bằng SECRET.
import checkoutCompletedReal from "./fixtures/creem/checkout.completed.real.json?raw";
import refundCreatedReal from "./fixtures/creem/refund.created.real.json?raw";

const SECRET = "whsec_test_secret_không_dùng_ở_đâu_khác";

/** Payload `checkout.completed` rút gọn theo ví dụ trong tài liệu Creem (https://docs.creem.io/code/webhooks). */
function completed(requestId: unknown) {
  return {
    id: "evt_5WHHcZPv7VS0YUsberIuOz",
    eventType: "checkout.completed",
    created_at: 1728734325927,
    object: {
      id: "ch_4l0N34kxo16AhRKUHFUuXr",
      object: "checkout",
      request_id: requestId,
      order: { id: "ord_4aDwWXjMLpes4Kj4XqNnUA", amount: 399, currency: "USD", status: "paid", type: "onetime" },
      status: "completed",
    },
  };
}

/** Webhook thô như route đưa cho provider: ký bằng SECRET trừ khi `header` hay `secret` được chỉ định. */
async function hook(body: unknown, opts: { secret?: string; header?: string | null; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const headers = new Headers();
  const signature = opts.header === undefined ? await hmacSha256Hex(opts.secret ?? SECRET, raw) : opts.header;
  if (signature !== null) headers.set(CREEM_SIGNATURE_HEADER, signature);
  return { rawBody: raw, headers };
}

/** Mã phiên và mã sự kiện của payload `completed`. */
const CHECKOUT_ID = "ch_4l0N34kxo16AhRKUHFUuXr";
const COMPLETED_EVENT_ID = "evt_5WHHcZPv7VS0YUsberIuOz";

describe("Creem: chữ ký webhook", () => {
  it("đúng chữ ký, request_id là mã đơn: trả cò cấp license cho đơn đó, kèm mã phiên (object.id) đã ký", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(completed("1000042")))).toEqual({
      kind: "payment",
      orderCode: 1000042,
      providerRef: CHECKOUT_ID,
      reportUnknownOrder: { eventType: "checkout.completed", eventId: COMPLETED_EVENT_ID },
    });
  });

  it("đáp án biết trước: HMAC-SHA256 hex của thân thô tính độc lập bằng Python", async () => {
    const raw = '{"id":"evt_1","eventType":"checkout.completed","object":{"id":"ch_1","request_id":"42"}}';
    const headers = new Headers({ [CREEM_SIGNATURE_HEADER]: "002d694ce2ad7baa476c3a16e22206781402d023096c4f664bbac80efab5ad81" });
    expect(await verifyCreemWebhook("whsec_known_answer", { rawBody: raw, headers })).toEqual({
      kind: "payment",
      orderCode: 42,
      providerRef: "ch_1",
      reportUnknownOrder: { eventType: "checkout.completed", eventId: "evt_1" },
    });
    expect(await verifyCreemWebhook("whsec_khac", { rawBody: raw, headers })).toBeNull();
  });

  it("đáp án biết trước có chữ Unicode (tiếng Việt dựng sẵn và emoji ngoài BMP): HMAC tính trên byte UTF-8 của thân thô", async () => {
    // Thân viết bằng escape để trình soạn thảo không đổi dạng chuẩn hóa Unicode (ễ là U+1EC5 dựng sẵn, NFC).
    const raw = '{"eventType":"checkout.completed","object":{"request_id":"42","customer":{"name":"Nguy\u1EC5n V\u0103n A \u{1F600}"}}}';
    const headers = new Headers({ [CREEM_SIGNATURE_HEADER]: "bc59b9bc8f9107256720ad7c4bde45f34874035fe1064c5caecfc84d0d6cd52b" });
    // Không có object.id: vẫn là cò cấp, mã phiên null (server dùng mã phiên đã lưu lúc tạo đơn).
    expect(await verifyCreemWebhook("whsec_known_answer", { rawBody: raw, headers })).toEqual({
      kind: "payment",
      orderCode: 42,
      providerRef: null,
      reportUnknownOrder: { eventType: "checkout.completed", eventId: null },
    });
    expect(await verifyCreemWebhook("whsec_known_answer", { rawBody: raw.normalize("NFD"), headers })).toBeNull();
  });

  it("chữ ký hex viết hoa vẫn nhận (HMAC hex không phân biệt hoa thường)", async () => {
    const raw = JSON.stringify(completed("7"));
    const upper = (await hmacSha256Hex(SECRET, raw)).toUpperCase();
    expect(await verifyCreemWebhook(SECRET, await hook(null, { raw, header: ` ${upper} ` }))).toEqual({
      kind: "payment",
      orderCode: 7,
      providerRef: CHECKOUT_ID,
      reportUnknownOrder: { eventType: "checkout.completed", eventId: COMPLETED_EVENT_ID },
    });
  });

  it("thiếu header, header rỗng, header không phải hex: null (sai chữ ký)", async () => {
    const body = completed("7");
    expect(await verifyCreemWebhook(SECRET, await hook(body, { header: null }))).toBeNull();
    expect(await verifyCreemWebhook(SECRET, await hook(body, { header: "" }))).toBeNull();
    expect(await verifyCreemWebhook(SECRET, await hook(body, { header: "zz-not-hex" }))).toBeNull();
  });

  it("sai secret: null", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(completed("7"), { secret: "secret-khac" }))).toBeNull();
  });

  it.each(["{", "", "[]"])("sai chữ ký mà thân %j cũng không phải sự kiện: null (kiểm chữ ký trước khi đọc thân), không phải \"malformed\"", async (raw) => {
    expect(await verifyCreemWebhook(SECRET, await hook(null, { raw, header: "f".repeat(64) }))).toBeNull();
  });

  it("secret rỗng (cấu hình hỏng): null, không ném lỗi (Web Crypto từ chối khóa HMAC rỗng bằng DataError)", async () => {
    const raw = JSON.stringify(completed("7"));
    expect(await verifyCreemWebhook("", await hook(null, { raw, header: "0".repeat(64) }))).toBeNull();
    expect(await verifyCreemWebhook("", await hook(null, { raw, header: null }))).toBeNull();
  });

  it("thân bị sửa sau khi ký (đổi số tiền hay mã đơn): null", async () => {
    const original = JSON.stringify(completed("7"));
    const signature = await hmacSha256Hex(SECRET, original);
    for (const tampered of [original.replace('"amount":399', '"amount":1'), original.replace('"7"', '"8"'), `${original} `]) {
      expect(await verifyCreemWebhook(SECRET, await hook(null, { raw: tampered, header: signature }))).toBeNull();
    }
  });

  it("đúng chữ ký mà thân không phải JSON: \"malformed\", không phải null (không phải giả mạo)", async () => {
    for (const raw of ["{", "", "không phải json", '{"eventType":']) {
      expect(await verifyCreemWebhook(SECRET, await hook(null, { raw })), raw).toBe("malformed");
    }
  });

  it.each([
    ["null", "null", null, null],
    ["mảng", "[]", null, null],
    ["số", "42", null, null],
    ["object thiếu eventType", '{"object":{}}', null, null],
    ["eventType không phải chuỗi", '{"id":"evt_so","eventType":7,"object":{"id":"ch_so"}}', "ch_so", "evt_so"],
    ["Creem đổi tên trường eventType", '{"id":"evt_doi","event_type":"checkout.completed","object":{"id":"ch_doi","request_id":"1"}}', "ch_doi", "evt_doi"],
  ])(
    "đúng chữ ký mà thân JSON không phải sự kiện đọc được (%s): \"unmatched\" với loại sự kiện null, mã đối tượng và mã sự kiện nếu có (route trả 200 và cảnh báo, không im lặng 400)",
    async (_why, raw, providerRef, eventId) => {
      expect(await verifyCreemWebhook(SECRET, await hook(null, { raw }))).toEqual({ kind: "unmatched", eventType: null, providerRef, eventId });
    },
  );

  it.each([
    ["số, không phải chuỗi", 42],
    ["null", null],
    ["thiếu", undefined],
    ["không phải số (ví dụ trong tài liệu Creem; link công khai, Storefront)", "my-request-id"],
    ["chữ", "abc"],
    ["số 0", "0"],
    ["số 0 đầu", "007"],
    ["số âm", "-5"],
    ["số thập phân", "1.5"],
    ["quá lớn", "9".repeat(17)],
    ["vượt số nguyên an toàn (2^53)", "9007199254740992"],
    ["có khoảng trắng", " 42"],
  ])("checkout.completed mà request_id %s: \"unmatched\" mang loại sự kiện, mã phiên và mã sự kiện (route trả 200 và cảnh báo)", async (_why, requestId) => {
    expect(await verifyCreemWebhook(SECRET, await hook(completed(requestId)))).toEqual({
      kind: "unmatched",
      eventType: "checkout.completed",
      providerRef: CHECKOUT_ID,
      eventId: COMPLETED_EVENT_ID,
    });
  });

  it("request_id là số nguyên an toàn lớn nhất (2^53 - 1): vẫn là cò cấp", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(completed("9007199254740991")))).toEqual({
      kind: "payment",
      orderCode: 9007199254740991,
      providerRef: CHECKOUT_ID,
      reportUnknownOrder: { eventType: "checkout.completed", eventId: COMPLETED_EVENT_ID },
    });
  });

  it("checkout.completed thiếu object, hay mã phiên/mã sự kiện sai dạng: \"unmatched\" với các mã đó null; request_id đúng mà mã phiên sai dạng: cò cấp, mã phiên null", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(null, { raw: '{"eventType":"checkout.completed"}' }))).toEqual({
      kind: "unmatched",
      eventType: "checkout.completed",
      providerRef: null,
      eventId: null,
    });
    const odd = { ...completed("abc"), id: 42, object: { ...completed("abc").object, id: "" } };
    expect(await verifyCreemWebhook(SECRET, await hook(odd))).toEqual({ kind: "unmatched", eventType: "checkout.completed", providerRef: null, eventId: null });
    const longRef = { ...completed("7"), object: { ...completed("7").object, id: `ch_${"x".repeat(126)}` } };
    expect(await verifyCreemWebhook(SECRET, await hook(longRef))).toEqual({
      kind: "payment",
      orderCode: 7,
      providerRef: null,
      reportUnknownOrder: { eventType: "checkout.completed", eventId: COMPLETED_EVENT_ID },
    });
  });

  it("sự kiện server không dùng: ignore (route trả 200, không hỏi gì thêm), kể cả khi không có object; mỗi lần một dòng log webhook_ignored", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (const eventType of ["subscription.paid", "subscription.active", "credits.granted"]) {
        expect(await verifyCreemWebhook(SECRET, await hook({ ...completed("7"), eventType }))).toEqual({ kind: "ignore" });
      }
      expect(await verifyCreemWebhook(SECRET, await hook(null, { raw: '{"eventType":"subscription.paid"}' }))).toEqual({ kind: "ignore" });
      expect(await verifyCreemWebhook(SECRET, await hook(null, { raw: '{"eventType":"subscription.paid","object":"sub_1"}' }))).toEqual({ kind: "ignore" });
      expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])).event_type)).toEqual([
        "subscription.paid",
        "subscription.active",
        "credits.granted",
        "subscription.paid",
        "subscription.paid",
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  /**
   * Payload `refund.created` rút gọn theo hình dạng thật (fixtures/creem/refund.created.real.json): số của lần hoàn ở
   * `refund_amount`; `transaction` là ảnh chụp lúc phát sự kiện (`status` "paid", `refunded_amount` null).
   */
  function refundEvent(
    eventType: string,
    patch: { id?: unknown; checkout?: unknown; transaction?: unknown; status?: unknown; reason?: unknown; refund_amount?: unknown } = {},
  ) {
    return {
      id: "id" in patch ? patch.id : "evt_61eTsJHUgInFw2BQKhTiPV",
      eventType,
      created_at: 1728734351631,
      object: {
        id: "ref_3DB9NQFvk18TJwSqd0N6bd",
        object: "refund",
        status: "status" in patch ? patch.status : "succeeded",
        refund_amount: "refund_amount" in patch ? patch.refund_amount : 1210,
        refund_currency: "EUR",
        reason: "reason" in patch ? patch.reason : "requested_by_customer",
        transaction: "transaction" in patch ? patch.transaction : { id: "tran_1", amount: 1000, amount_paid: 1210, status: "paid", refunded_amount: null },
        checkout: "checkout" in patch ? patch.checkout : { id: "ch_4l0N34kxo16AhRKUHFUuXr", request_id: "1000042", status: "completed" },
      },
    };
  }

  /** Payload thật `refund.created` đã parse, đổi vài trường (`undefined` thì bỏ hẳn trường đó), để ký lại bằng SECRET. */
  function realRefund(object: Record<string, unknown> = {}, transaction: Record<string, unknown> = {}, order: Record<string, unknown> = {}) {
    const body = JSON.parse(refundCreatedReal) as { object: Record<string, unknown> & { transaction: object; order: object } };
    return {
      ...body,
      object: {
        ...body.object,
        ...object,
        transaction: { ...body.object.transaction, ...transaction },
        order: { ...body.object.order, ...order },
      },
    };
  }

  /** Cò hoàn tiền của payload thật (hoàn đủ 399 cent của đơn thử 3,99 USD). */
  const REAL_REFUND = {
    kind: "refund",
    eventType: "refund.created",
    providerRef: "ch_491X90hRbNHfL1fKCEZYCt",
    reason: "refund",
    full: true,
    eventId: "evt_6LprlBm83BiXo9APW4YxcY",
    refundedAmount: 399,
    providerAmountPaid: 399,
    refundStatus: "succeeded",
    providerReason: "requested_by_customer",
  };

  it("payload thật checkout.completed (Creem sandbox 2026-10-16), ký đúng từng byte: cò cấp cho đơn theo request_id, kèm mã phiên và mã sự kiện", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(null, { raw: checkoutCompletedReal }))).toEqual({
      kind: "payment",
      orderCode: 9000001,
      providerRef: "ch_491X90hRbNHfL1fKCEZYCt",
      reportUnknownOrder: { eventType: "checkout.completed", eventId: "evt_5pT3n1Rw2Dkzfl6sRwAtqu" },
    });
  });

  it("payload thật refund.created hoàn đủ (transaction là ảnh chụp: refunded_amount null, status paid): số hoàn lấy từ object.refund_amount, full = true", async () => {
    // Tiền đề của phép đo: số đã hoàn KHÔNG nằm ở giao dịch (mẫu tài liệu), mà ở chính đối tượng refund.
    const parsed = JSON.parse(refundCreatedReal) as { object: { refund_amount: unknown; transaction: { refunded_amount: unknown; status: unknown; amount_paid: unknown } } };
    expect(parsed.object.transaction).toMatchObject({ refunded_amount: null, status: "paid", amount_paid: 399 });
    expect(parsed.object.refund_amount).toBe(399);
    expect(await verifyCreemWebhook(SECRET, await hook(null, { raw: refundCreatedReal }))).toEqual(REAL_REFUND);
  });

  it.each([
    ["hoàn thiếu một cent (398 < 399)", { refund_amount: 398 }, {}, {}, { full: false, refundedAmount: 398 }],
    ["hoàn nhiều hơn số đã trả (400)", { refund_amount: 400 }, {}, {}, { full: true, refundedAmount: 400 }],
    ["refund_amount 0", { refund_amount: 0 }, {}, {}, { full: false, refundedAmount: 0 }],
    ["thiếu refund_amount, giao dịch cũng null: không biết số hoàn", { refund_amount: undefined }, {}, {}, { full: false, refundedAmount: null }],
    ["thiếu refund_amount, giao dịch có refunded_amount (dự phòng)", { refund_amount: undefined }, { refunded_amount: 399 }, {}, { full: true, refundedAmount: 399 }],
    ["refund_amount null, giao dịch có refunded_amount một phần (dự phòng)", { refund_amount: null }, { refunded_amount: 100 }, {}, { full: false, refundedAmount: 100 }],
    ["refund_amount là chuỗi: dùng dự phòng", { refund_amount: "399" }, { refunded_amount: 399 }, {}, { full: true, refundedAmount: 399 }],
    ["refund_amount âm: dùng dự phòng (null)", { refund_amount: -399 }, {}, {}, { full: false, refundedAmount: null }],
    ["refund_amount lẻ: dùng dự phòng (null)", { refund_amount: 399.5 }, {}, {}, { full: false, refundedAmount: null }],
    ["refund_amount có mà giao dịch mang số khác: tin refund_amount", { refund_amount: 100 }, { refunded_amount: 399 }, {}, { full: false, refundedAmount: 100 }],
    ["giao dịch thiếu amount_paid: dùng order.amount_paid", {}, { amount_paid: undefined }, {}, { full: true, providerAmountPaid: 399 }],
    ["giao dịch thiếu amount_paid, đơn trả 500: so với 500", {}, { amount_paid: undefined }, { amount_paid: 500 }, { full: false, providerAmountPaid: 500 }],
    ["không có amount_paid ở đâu: không biết số đã trả", {}, { amount_paid: undefined }, { amount_paid: undefined }, { full: false, providerAmountPaid: null }],
    ["lần hoàn đang chờ (status pending), đủ tiền", { status: "pending" }, {}, {}, { full: false, refundStatus: "pending", refundedAmount: 399 }],
  ])("payload thật refund.created, %s", async (_why, object, transaction, order, expected) => {
    expect(await verifyCreemWebhook(SECRET, await hook(realRefund(object, transaction, order)))).toEqual({ ...REAL_REFUND, ...expected });
  });

  /**
   * Payload `dispute.created` rút gọn theo ví dụ trong tài liệu Creem (code_webhooks.md, mục dispute.created): đối tượng tranh
   * chấp KHÔNG có `status` hay `reason`, và phiên trong đó KHÔNG có `request_id` hay `metadata`.
   */
  function disputeEvent(patch: Record<string, unknown> = {}) {
    return {
      id: "evt_6mfLDL7P0NYwYQqCrICvDH",
      eventType: "dispute.created",
      created_at: 1750941264812,
      object: {
        id: "disp_6vSsOdTANP5PhOzuDlUuXE",
        object: "dispute",
        amount: 1331,
        currency: "EUR",
        transaction: { id: "tran_4", amount: 1100, amount_paid: 1331, status: "chargeback", refunded_amount: 1331 },
        checkout: { id: "ch_1bJMvqGGzHIftf4ewLXJeq", object: "checkout", product: "prod_3", units: 1, status: "completed" },
        order: { id: "ord_57", amount: 1100, currency: "EUR", status: "paid" },
        ...patch,
      },
    };
  }

  it("refund.created hoàn đủ (đã hoàn ≥ đã trả): trả cò hoàn tiền với mã phiên, full = true và đủ dữ kiện cho nhật ký", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created")))).toEqual({
      kind: "refund",
      eventType: "refund.created",
      providerRef: "ch_4l0N34kxo16AhRKUHFUuXr",
      reason: "refund",
      full: true,
      eventId: "evt_61eTsJHUgInFw2BQKhTiPV",
      refundedAmount: 1210,
      providerAmountPaid: 1210,
      refundStatus: "succeeded",
      providerReason: "requested_by_customer",
    });
  });

  it("dispute.created theo đúng payload mẫu (không status, không request_id): reason dispute, full = true, refundStatus null", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(disputeEvent()))).toEqual({
      kind: "refund",
      eventType: "dispute.created",
      providerRef: "ch_1bJMvqGGzHIftf4ewLXJeq",
      reason: "dispute",
      full: true,
      eventId: "evt_6mfLDL7P0NYwYQqCrICvDH",
      refundedAmount: 1331,
      providerAmountPaid: 1331,
      refundStatus: null,
      providerReason: null,
    });
    // Tranh chấp coi như tiền đã bị lấy lại: một trường `status` lạ (nếu có) không đổi luật, và không thành refundStatus.
    expect(await verifyCreemWebhook(SECRET, await hook(disputeEvent({ status: "failed" })))).toMatchObject({ full: true, refundStatus: null });
  });

  it("refund.created mà phiên không có request_id: vẫn đọc được (tra đơn theo mã phiên, không theo request_id)", async () => {
    const noRequestId = refundEvent("refund.created", { checkout: { id: "ch_4l0N34kxo16AhRKUHFUuXr" } });
    expect(await verifyCreemWebhook(SECRET, await hook(noRequestId))).toMatchObject({ kind: "refund", providerRef: "ch_4l0N34kxo16AhRKUHFUuXr", full: true });
  });

  it("mã sự kiện (body.id) thiếu, rỗng, không phải chuỗi hay dài hơn 128 ký tự: eventId null (không khử trùng được, vẫn xử lý)", async () => {
    for (const id of [undefined, "", 42, `evt_${"x".repeat(125)}`]) {
      expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", { id }))), String(id)).toMatchObject({
        kind: "refund",
        eventId: null,
        full: true,
      });
    }
    const max = `evt_${"x".repeat(124)}`;
    expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", { id: max })))).toMatchObject({ eventId: max });
  });

  it("dữ kiện phụ sai dạng: lý do và trạng thái dài cắt còn 64 ký tự; thiếu giao dịch hay số tiền là chuỗi thì số tiền null; status không phải chuỗi thì null", async () => {
    const long = await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", { reason: "r".repeat(100), status: "s".repeat(100) })));
    expect(long).toMatchObject({ providerReason: "r".repeat(64), refundStatus: "s".repeat(64), full: false });
    expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", { reason: 7 })))).toMatchObject({ providerReason: null });
    expect(
      await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", { transaction: undefined, refund_amount: undefined, status: 7 }))),
    ).toMatchObject({
      full: false,
      refundedAmount: null,
      providerAmountPaid: null,
      refundStatus: null,
    });
    const strings = refundEvent("refund.created", { refund_amount: "1210", transaction: { amount_paid: "1210", refunded_amount: "1210" }, status: "pending" });
    expect(await verifyCreemWebhook(SECRET, await hook(strings))).toMatchObject({
      full: false,
      refundedAmount: null,
      providerAmountPaid: null,
      refundStatus: "pending",
    });
  });

  it.each([
    ["hoàn một phần", { refund_amount: 500 }],
    ["hoàn chưa thành công (status khác succeeded)", { status: "failed" }],
    ["thiếu status", { status: undefined }],
    ["thiếu giao dịch (không biết số đã trả)", { transaction: undefined }],
    ["giao dịch thiếu số tiền", { transaction: { status: "paid" } }],
    ["số tiền là chuỗi", { refund_amount: "1210", transaction: { amount_paid: "1210", refunded_amount: "1210" } }],
    ["đơn không có tiền (amount_paid 0)", { refund_amount: 0, transaction: { amount_paid: 0, refunded_amount: 0 } }],
  ])("refund.created %s: full = false (chỉ cảnh báo, không đổi đơn)", async (_why, patch) => {
    expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", patch)))).toMatchObject({ kind: "refund", full: false });
  });

  it.each([
    ["thiếu checkout", { checkout: undefined }],
    ["checkout là số", { checkout: 7 }],
    ["checkout là mảng", { checkout: ["ch_1"] }],
    ["checkout null", { checkout: null }],
    ["checkout là chuỗi rỗng", { checkout: "" }],
    ["checkout là chuỗi dài hơn 128 ký tự", { checkout: `ch_${"x".repeat(126)}` }],
    ["checkout.id không phải chuỗi", { checkout: { id: 7 } }],
    ["checkout.id rỗng", { checkout: { id: "" } }],
    ["checkout.id dài hơn 128 ký tự", { checkout: { id: `ch_${"x".repeat(126)}` } }],
  ])("refund.created %s: \"unmatched\" mang mã của lần hoàn (object.id) và mã sự kiện (route trả 200 và cảnh báo)", async (_why, patch) => {
    expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", patch)))).toEqual({
      kind: "unmatched",
      eventType: "refund.created",
      providerRef: "ref_3DB9NQFvk18TJwSqd0N6bd",
      eventId: "evt_61eTsJHUgInFw2BQKhTiPV",
    });
  });

  it.each([
    ["có dấu hỏi (chèn tham số)", "ch_1?x=1"],
    ["có dấu &", "ch_1&checkout_id=ch_2"],
    ["có khoảng trắng", "ch 1"],
    ["có dấu gạch chéo", "ch/1"],
    ["có xuống dòng", "ch_1\n"],
    ["có dấu %", "ch_%2F"],
    ["chữ ngoài ASCII", "ch_phiên"],
  ])(
    "(M-10) mã phiên trong webhook %s (sai mẫu CHECKOUT_ID [A-Za-z0-9_-]{1,128}): không bao giờ thành providerRef (server không hỏi Creem theo mã này, không lưu vào đơn)",
    async (_why, ref) => {
      // checkout.completed có request_id đúng: vẫn là cò cấp (server hỏi theo mã phiên đã lưu của đơn), mã phiên null.
      const payment = { ...completed("1000042"), object: { ...completed("1000042").object, id: ref } };
      expect(await verifyCreemWebhook(SECRET, await hook(payment))).toEqual({
        kind: "payment",
        orderCode: 1000042,
        providerRef: null,
        reportUnknownOrder: { eventType: "checkout.completed", eventId: COMPLETED_EVENT_ID },
      });
      // Hoàn tiền và tranh chấp tra đơn theo mã phiên: sai mẫu thì không tra được, "unmatched" (cảnh báo người vận hành).
      for (const checkout of [ref, { id: ref }]) {
        expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", { checkout })))).toMatchObject({
          kind: "unmatched",
          eventType: "refund.created",
          providerRef: "ref_3DB9NQFvk18TJwSqd0N6bd",
        });
        expect(await verifyCreemWebhook(SECRET, await hook(disputeEvent({ checkout })))).toMatchObject({ kind: "unmatched", eventType: "dispute.created" });
      }
    },
  );

  it("checkout là chuỗi mã phiên (không phải object): tin như checkout.id, vì cùng nằm trong thân đã ký (refund và dispute)", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", { checkout: "ch_chuoi" })))).toMatchObject({
      kind: "refund",
      eventType: "refund.created",
      providerRef: "ch_chuoi",
      full: true,
    });
    const max = `ch_${"x".repeat(125)}`;
    expect(await verifyCreemWebhook(SECRET, await hook(refundEvent("refund.created", { checkout: max })))).toMatchObject({ kind: "refund", providerRef: max });
    expect(await verifyCreemWebhook(SECRET, await hook(disputeEvent({ checkout: "ch_tc" })))).toMatchObject({
      kind: "refund",
      eventType: "dispute.created",
      providerRef: "ch_tc",
      reason: "dispute",
    });
  });

  it("dispute.created thiếu checkout, refund.created không có object: \"unmatched\" (mã tranh chấp; không có mã nào thì null)", async () => {
    expect(await verifyCreemWebhook(SECRET, await hook(disputeEvent({ checkout: undefined })))).toEqual({
      kind: "unmatched",
      eventType: "dispute.created",
      providerRef: "disp_6vSsOdTANP5PhOzuDlUuXE",
      eventId: "evt_6mfLDL7P0NYwYQqCrICvDH",
    });
    expect(await verifyCreemWebhook(SECRET, await hook(null, { raw: '{"id":"evt_r","eventType":"refund.created"}' }))).toEqual({
      kind: "unmatched",
      eventType: "refund.created",
      providerRef: null,
      eventId: "evt_r",
    });
  });
});
