import { describe, expect, it } from "vitest";
import type { AuditRow } from "../api/types";
import { hasOtherTimeSource, maxShortenDays, orderGrantEffect, refundCase, unlinkedShortenedDays } from "./refund-kit";

// Hàm thuần của thẻ hoàn tiền ở trang đơn (C1-T7, Q2): đơn đã cộng bao nhiêu ngày vào license nào (theo dòng cấp của nhật ký
// đơn) và thẻ nào hợp với đơn đã hoàn. Mốc thời gian cố định, không phụ thuộc đồng hồ thật.

const T = 1_790_812_800; // 01/10/2026 07:00 giờ Việt Nam
const D = 86400;
const LIC = "33333333-3333-4333-8333-333333333333";
const CODE = 1000015;

let id = 100;
function row(action: string, detail: object | string | null, over: Partial<AuditRow> = {}): AuditRow {
  return {
    id: id++,
    at: T,
    actor: "webhook",
    action,
    license_id: LIC,
    order_code: CODE,
    detail: detail === null ? null : typeof detail === "string" ? detail : JSON.stringify(detail),
    ...over,
  };
}
const order = (paid_at: number | null = T + 90) => ({ order_code: CODE, paid_at });

describe("orderGrantEffect: đơn đã cộng bao nhiêu ngày (bảng sáu ca)", () => {
  it.each([
    [
      "mua mới: từ lúc trả tới hạn sau đơn",
      [row("license_issued", { plan: "yearly", expires_at: T + 365 * D, cycle_anchor: T, paid_at: T })],
      { kind: "new", fromPlan: null, fromExpiresAt: null, toExpiresAt: T + 365 * D, daysAdded: 365, remainingDays: 365 },
    ],
    [
      "gia hạn khi license còn hạn: từ hạn trước đơn",
      [row("license_extended", { plan: "yearly", from_plan: "yearly", from_expires_at: T + 100 * D, expires_at: T + 465 * D, paid_at: T })],
      { kind: "extend", fromPlan: "yearly", fromExpiresAt: T + 100 * D, toExpiresAt: T + 465 * D, daysAdded: 365, remainingDays: 365 },
    ],
    [
      "gia hạn khi license đã hết hạn lúc trả: từ lúc trả, không từ hạn cũ",
      [row("license_extended", { plan: "monthly", from_plan: "monthly", from_expires_at: T - 10 * D, expires_at: T + 30 * D, paid_at: T })],
      { kind: "extend", fromPlan: "monthly", fromExpiresAt: T - 10 * D, toExpiresAt: T + 30 * D, daysAdded: 30, remainingDays: 30 },
    ],
    [
      "đổi gói: số ngày quy đổi đổi theo gói nên không tính",
      [row("license_plan_changed", { plan: "yearly", from_plan: "monthly", from_expires_at: T + 20 * D, expires_at: T + 383 * D, paid_at: T })],
      { kind: "change", fromPlan: "monthly", fromExpiresAt: T + 20 * D, toExpiresAt: T + 383 * D, daysAdded: null, remainingDays: null },
    ],
  ])("%s", (_name, rows, expected) => {
    expect(orderGrantEffect(order(), rows)).toEqual({
      applied: true,
      licenseId: LIC,
      plan: expected.kind === "extend" && expected.fromPlan === "monthly" ? "monthly" : "yearly",
      shortenedDays: 0,
      lastShortenedAt: null,
      // Lúc ghi dòng cấp và mốc "lúc trả" server dùng để tính hạn (detail.paid_at).
      grantAt: T,
      paidBase: T,
      ...expected,
    });
  });

  it("chưa áp (nhật ký không có dòng cấp của đơn): { applied: false }", () => {
    const rows = [row("order_refunded", { event_id: "evt_1", full: true }), row("order_created", { plan: "yearly" }, { license_id: null })];
    expect(orderGrantEffect(order(null), rows)).toEqual({ applied: false });
    expect(orderGrantEffect(order(null), [])).toEqual({ applied: false });
  });

  it("đã rút một phần rồi đủ: cộng detail.days của các dòng rút ngắn mang mã đơn này, thời điểm là lần rút cuối", () => {
    const grant = row("license_extended", { plan: "yearly", from_expires_at: T + 100 * D, expires_at: T + 465 * D, paid_at: T });
    const first = row("license_shortened_manually", { days: 100, order_code: CODE, note: "x" }, { actor: "admin:ops@example.com", at: T + 5 * D });
    const partial = orderGrantEffect(order(), [first, grant]);
    expect(partial).toMatchObject({ applied: true, daysAdded: 365, shortenedDays: 100, remainingDays: 265, lastShortenedAt: T + 5 * D });
    const second = row("license_shortened_manually", { days: 265, order_code: CODE }, { actor: "admin:ops@example.com", at: T + 6 * D });
    expect(orderGrantEffect(order(), [second, first, grant])).toMatchObject({ shortenedDays: 365, remainingDays: 0, lastShortenedAt: T + 6 * D });
    // Rút quá số ngày đơn cộng (ghi tay nhầm): còn lại không âm.
    const extra = row("license_shortened_manually", { days: 30 }, { at: T + 7 * D });
    expect(orderGrantEffect(order(), [extra, second, first, grant])).toMatchObject({ shortenedDays: 395, remainingDays: 0 });
  });

  it("bỏ dòng của đơn khác, dòng rút ngắn không có số ngày hợp lệ; thiếu paid_at trong detail thì dùng paid_at của đơn", () => {
    const rows = [
      row("license_issued", { expires_at: T + 30 * D, paid_at: T }, { order_code: 1000012 }),
      row("license_shortened_manually", { days: 7 }, { order_code: 1000012 }),
      row("license_shortened_manually", { days: "7" }),
      row("license_shortened_manually", { days: -3 }),
      row("license_shortened_manually", "không phải JSON"),
      row("license_issued", { plan: "yearly", expires_at: T + 90 + 365 * D }),
    ];
    expect(orderGrantEffect(order(T + 90), rows)).toMatchObject({ applied: true, kind: "new", daysAdded: 365, shortenedDays: 0 });
  });

  it("hai dòng cấp của cùng đơn (vd cấp key mới sau khi license cũ bị thu hồi): lấy dòng MỚI NHẤT, kể cả khi nó đứng sau trong danh sách", () => {
    const older = row("license_extended", { plan: "yearly", from_expires_at: T, expires_at: T + 365 * D, paid_at: T }, { at: T, license_id: "66666666-6666-4666-8666-666666666666" });
    const newer = row("license_issued", { plan: "yearly", expires_at: T + 10 * D + 365 * D, paid_at: T + 10 * D }, { at: T + 10 * D });
    for (const rows of [[newer, older], [older, newer]]) {
      expect(orderGrantEffect(order(), rows)).toMatchObject({ kind: "new", licenseId: LIC, grantAt: T + 10 * D, daysAdded: 365 });
    }
  });

  it("dòng cấp có detail hỏng: vẫn là đã áp, nhưng không tính được số ngày", () => {
    expect(orderGrantEffect(order(), [row("license_extended", "{hỏng")])).toMatchObject({
      applied: true,
      kind: "extend",
      licenseId: LIC,
      toExpiresAt: null,
      daysAdded: null,
      remainingDays: null,
    });
  });
});

describe("maxShortenDays: số ngày nhiều nhất còn rút được mà hạn mới vẫn sau bây giờ (như server), kẹp 3650", () => {
  it.each([
    [T + 365 * D, T, 364],
    [T + 365 * D + 1, T, 365],
    [T + D, T, 0],
    [T + D + 1, T, 1],
    [T - D, T, 0],
    [T + 5000 * D, T, 3650],
  ])("hạn %i, bây giờ %i: %i ngày", (expires, now, expected) => {
    expect(maxShortenDays(expires, now)).toBe(expected);
  });
});

describe("refundCase: thẻ của đơn đã hoàn tiền", () => {
  const NOW = T + 3 * D;
  const live = { id: LIC, revoked_at: null, expires_at: T + 465 * D };
  const extendRows = [row("license_extended", { plan: "yearly", from_plan: "yearly", from_expires_at: T + 100 * D, expires_at: T + 465 * D, paid_at: T })];
  const newRows = [row("license_issued", { plan: "yearly", expires_at: T + 365 * D, paid_at: T })];
  const applied = { license_id: LIC };

  it("chưa áp: thẻ chưa áp dù license gia hạn của đơn còn hạn (I1-T7 a)", () => {
    expect(refundCase({ license_id: null }, orderGrantEffect(order(null), []), live, NOW)).toEqual({ kind: "not_applied" });
    // Nhật ký chưa tải mà đơn không có license_id: server chỉ ghi license_id khi cấp, nên biết ngay là chưa áp.
    expect(refundCase({ license_id: null }, null, live, NOW)).toEqual({ kind: "not_applied" });
  });

  it("đơn có license mà nhật ký chưa tải: chờ", () => {
    expect(refundCase(applied, null, live, NOW)).toEqual({ kind: "waiting" });
  });

  it("đã rút đủ: thẻ đã rút ngắn (kể cả khi license sau đó hết hạn)", () => {
    const rows = [row("license_shortened_manually", { days: 365 }, { at: T + 2 * D }), ...extendRows];
    const e = orderGrantEffect(order(), rows);
    // Hạn hiện tại đúng bằng hạn sau đơn trừ phần đã rút: không có gì cộng thêm sau đó.
    const after = { ...live, expires_at: T + 100 * D };
    expect(refundCase(applied, e, after, NOW)).toEqual({ kind: "shortened", days: 365, at: T + 2 * D, expiresAt: T + 100 * D, grew: false, unlinkedDays: 0 });
    expect(refundCase(applied, e, { ...live, expires_at: NOW - 1 }, NOW)).toEqual({ kind: "shortened", days: 365, at: T + 2 * D, expiresAt: NOW - 1, grew: false, unlinkedDays: 0 });
    // M6: sau lần rút, hạn lại dài ra (gia hạn tay trả lại, hay đơn khác): thẻ nhắc kiểm tra.
    expect(refundCase(applied, e, { ...live, expires_at: T + 130 * D }, NOW)).toMatchObject({ kind: "shortened", grew: true, expiresAt: T + 130 * D });
    expect(refundCase(applied, e, undefined, NOW)).toEqual({ kind: "shortened", days: 365, at: T + 2 * D, expiresAt: null, grew: false, unlinkedDays: 0 });
  });

  it.each([
    ["đã thu hồi", { ...live, revoked_at: T + D }],
    ["đã hết hạn", { ...live, expires_at: NOW }],
    ["không có trong kết quả tra cứu", undefined],
  ])("license %s: thẻ đã ghi là hoàn tiền", (_why, license) => {
    expect(refundCase(applied, orderGrantEffect(order(), extendRows), license, NOW)).toEqual({ kind: "inactive" });
  });

  it("gia hạn, license còn hạn: rút đúng số ngày còn lại của đơn", () => {
    expect(refundCase(applied, orderGrantEffect(order(), extendRows), live, NOW)).toEqual({
      kind: "keep_others",
      licenseId: LIC,
      remaining: 365,
      shortenDays: 365,
      capped: false,
      otherTime: true,
    });
  });

  it("gia hạn khi license đã hết hạn lúc trả, khách đã dùng 3 ngày: chỉ rút được tới bây giờ (kẹp theo hạn hiện tại)", () => {
    const rows = [row("license_extended", { plan: "yearly", from_expires_at: T - 10 * D, expires_at: T + 365 * D, paid_at: T })];
    expect(refundCase(applied, orderGrantEffect(order(), rows), { ...live, expires_at: T + 365 * D }, NOW)).toEqual({
      kind: "keep_others",
      licenseId: LIC,
      remaining: 365,
      shortenDays: 361,
      capped: true,
      // M3: license đã hết hạn lúc đơn áp vào và không được cộng gì sau đó: không còn thời gian của đơn khác.
      otherTime: false,
    });
    // Sau đó license được cộng thêm (đơn khác, gia hạn tay): lại có thời gian của nguồn khác.
    expect(refundCase(applied, orderGrantEffect(order(), rows), { ...live, expires_at: T + 400 * D }, NOW)).toMatchObject({ kind: "keep_others", otherTime: true });
  });

  it("mua mới: chưa biết license còn đơn đã trả khác thì chờ; chỉ đơn này: only_order; có đơn khác: keep_others", () => {
    const e = orderGrantEffect(order(), newRows);
    const lic = { ...live, expires_at: T + 365 * D };
    expect(refundCase(applied, e, lic, NOW)).toEqual({ kind: "checking", licenseId: LIC });
    expect(refundCase(applied, e, lic, NOW, false)).toEqual({ kind: "only_order", licenseId: LIC, remaining: 365, shortenDays: 361, capped: true, otherTime: false });
    expect(refundCase(applied, e, lic, NOW, true)).toEqual({ kind: "keep_others", licenseId: LIC, remaining: 365, shortenDays: 361, capped: true, otherTime: true });
  });

  it("mua mới mà hạn hiện tại dài hơn hạn sau đơn (đã được cộng thêm, kể cả khi dòng gia hạn đã trôi khỏi 50 dòng nhật ký): còn nguồn khác, không cần tra đơn (m2)", () => {
    const e = orderGrantEffect(order(), newRows);
    expect(refundCase(applied, e, { ...live, expires_at: T + 395 * D }, NOW)).toMatchObject({ kind: "keep_others", otherTime: true });
    expect(refundCase(applied, e, { ...live, expires_at: T + 395 * D }, NOW, false)).toMatchObject({ kind: "keep_others", otherTime: true });
  });

  it("rút ngắn không kèm mã đơn đủ phần còn lại và hạn hiện tại không dài ra: coi như đã rút đủ, ghi số ngày rút ngoài đơn (I-1)", () => {
    const e = orderGrantEffect(order(), extendRows);
    // Hạn sau đơn T+465D, rút 365 ngày ngoài đơn → T+100D.
    expect(refundCase(applied, e, { ...live, expires_at: T + 100 * D }, NOW, undefined, 365)).toEqual({
      kind: "shortened",
      days: 365,
      at: null,
      expiresAt: T + 100 * D,
      grew: false,
      unlinkedDays: 365,
    });
    // Hạn dài hơn hạn sau các lần rút (đã được cộng lại): chưa coi là đủ.
    expect(refundCase(applied, e, { ...live, expires_at: T + 130 * D }, NOW, undefined, 365)).toMatchObject({ kind: "keep_others" });
    // Rút ngoài đơn chưa đủ phần của đơn: chưa coi là đủ.
    expect(refundCase(applied, e, { ...live, expires_at: T + 365 * D }, NOW, undefined, 100)).toMatchObject({ kind: "keep_others" });
  });

  it("đổi gói: thẻ đổi gói (không điền sẵn số ngày)", () => {
    const rows = [row("license_plan_changed", { plan: "yearly", from_plan: "monthly", from_expires_at: T + 20 * D, expires_at: T + 383 * D, paid_at: T })];
    expect(refundCase(applied, orderGrantEffect(order(), rows), live, NOW)).toEqual({ kind: "change", licenseId: LIC });
  });

  it("đơn có license_id mà nhật ký không có dòng cấp, hay dòng cấp hỏng: không tính được số ngày", () => {
    expect(refundCase(applied, orderGrantEffect(order(), []), live, NOW)).toEqual({ kind: "unknown_days", licenseId: LIC });
    expect(refundCase(applied, orderGrantEffect(order(), [row("license_extended", "{hỏng")]), live, NOW)).toEqual({ kind: "unknown_days", licenseId: LIC });
  });

  it("rút còn thiếu một phần: số ngày điền sẵn là phần còn lại", () => {
    const rows = [row("license_shortened_manually", { days: 100 }, { at: T + D }), ...extendRows];
    expect(refundCase(applied, orderGrantEffect(order(), rows), live, NOW)).toMatchObject({ kind: "keep_others", remaining: 265, shortenDays: 265 });
  });
});

describe("unlinkedShortenedDays: rút ngắn không kèm mã đơn (ở trang license) từ một mốc (I-2)", () => {
  const lrow = (at: number, action: string, order_code: number | null, detail: object | string | null) => ({
    at,
    actor: "admin:ops@example.com",
    action,
    order_code,
    detail: detail === null ? null : typeof detail === "string" ? detail : JSON.stringify(detail),
  });
  it("cộng detail.days của các dòng license_shortened_manually không có mã đơn, từ mốc trở đi", () => {
    const rows = [
      lrow(T + 5 * D, "license_shortened_manually", null, { days: 300, from_expires_at: 1, expires_at: 0 }),
      lrow(T + 4 * D, "license_shortened_manually", null, { days: 65 }),
      lrow(T + 3 * D, "license_shortened_manually", CODE, { days: 10, order_code: CODE }), // có mã đơn: thẻ đơn đã tính
      lrow(T + 2 * D, "license_extended_manually", null, { days: 30 }),
      lrow(T - D, "license_shortened_manually", null, { days: 7 }), // trước mốc
      lrow(T + 6 * D, "license_shortened_manually", null, "hỏng"),
    ];
    expect(unlinkedShortenedDays(rows, T)).toBe(365);
    expect(unlinkedShortenedDays(rows, T - D)).toBe(372);
    expect(unlinkedShortenedDays([], T)).toBe(0);
  });
});

describe("hasOtherTimeSource: license mua mới còn nguồn thời gian khác ngoài đơn này (M4)", () => {
  const paidOther = { order_code: 1000099, status: "paid" as const, license_id: LIC };
  const lrow = (action: string, order_code: number | null) => ({ at: T, actor: "admin:ops@example.com", action, order_code, detail: null });
  it.each([
    ["chỉ đơn này", [], [{ order_code: CODE, status: "refunded" as const, license_id: LIC }], false],
    ["đơn khác đã trả trên license này", [], [paidOther], true],
    ["đơn khác đã trả nhưng áp vào license khác (cấp key mới)", [], [{ ...paidOther, license_id: "55555555-5555-4555-8555-555555555555" }], false],
    ["đơn khác chưa trả hay đã hoàn", [], [{ ...paidOther, status: "pending" as const }, { ...paidOther, status: "refunded" as const }], false],
    ["người vận hành đã gia hạn tay", [lrow("license_extended_manually", null)], [], true],
    ["cấp tay cho đơn khác", [lrow("order_granted_manually", 1000099)], [], true],
    ["cấp tay chính đơn này", [lrow("order_granted_manually", CODE)], [], false],
    ["dòng khác (kích hoạt máy)", [lrow("activated", null)], [], false],
  ])("%s", (_name, audit, orders, expected) => {
    expect(hasOtherTimeSource(CODE, LIC, audit, orders)).toBe(expected);
  });
});
