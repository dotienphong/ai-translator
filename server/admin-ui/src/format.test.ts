import { describe, expect, it } from "vitest";
import {
  daysLeft,
  fmtAgo,
  fmtBytes,
  fmtCompact,
  fmtCompactMoney,
  fmtDate,
  fmtDateTime,
  fmtDay,
  fmtDetail,
  fmtHm,
  fmtInt,
  fmtMoney,
  fmtMonth,
  fmtUsd,
  fmtVnd,
  fmtWeekday,
  fmtWhen,
  isoOf,
  maskKey,
  parseIsoUtc,
  shortHash,
} from "./format";

/** 2026-10-01T00:00:00Z = 07:00 ngày 01/10/2026 giờ Việt Nam. */
const T0 = 1_790_812_800;
const DAY = 86400;

describe("format", () => {
  it("ngày giờ theo GMT+7", () => {
    expect(fmtDateTime(T0)).toBe("01/10/2026 07:00");
    expect(fmtDateTime(T0 + 1234)).toBe("01/10/2026 07:20");
    expect(fmtDate(T0 - 8 * 3600)).toBe("30/09/2026");
    expect(fmtDate(T0 - 7 * 3600)).toBe("01/10/2026");
    expect(fmtDateTime(null)).toBe("—");
  });

  it("tiền VND có dấu chấm ngăn nghìn", () => {
    expect(fmtVnd(500000)).toBe("500.000 đ");
    expect(fmtVnd(1234567)).toBe("1.234.567 đ");
    expect(fmtVnd(0)).toBe("0 đ");
  });

  it("tiền USD từ số cent: dấu phẩy thập phân, dấu chấm ngăn nghìn, luôn hai chữ số lẻ", () => {
    expect(fmtUsd(399)).toBe("$3,99");
    expect(fmtUsd(2199)).toBe("$21,99");
    expect(fmtUsd(3999)).toBe("$39,99");
    expect(fmtUsd(5)).toBe("$0,05");
    expect(fmtUsd(0)).toBe("$0,00");
    expect(fmtUsd(123456)).toBe("$1.234,56");
    expect(fmtUsd(-399)).toBe("-$3,99");
  });

  it("fmtUsd: ca biên 1, 99, 100 cent và 100.000 cent; số cent lẻ làm tròn trước khi tách đô la và cent", () => {
    expect([1, 99, 100, 100000].map(fmtUsd)).toEqual(["$0,01", "$0,99", "$1,00", "$1.000,00"]);
    // Không làm tròn thì ra "$3,99.6": cent lẻ chỉ đến từ phép tính ở phía gọi, nhưng không được in thành số hỏng.
    expect(fmtUsd(399.6)).toBe("$4,00");
  });

  it("fmtMoney theo loại tiền của đơn: VND là đồng, USD là cent; loại lạ thì số kèm mã", () => {
    expect(fmtMoney(50000, "VND")).toBe("50.000 đ");
    expect(fmtMoney(399, "USD")).toBe("$3,99");
    expect(fmtMoney(1000, "EUR")).toBe("1.000 EUR");
    // Thiếu loại tiền: coi là VND, không hiện "undefined".
    expect(fmtMoney(50000, undefined)).toBe("50.000 đ");
  });

  it("fmtMoney: loại tiền null hay chuỗi rỗng (phản hồi thiếu) cũng là VND, không hiện '50.000 null' hay '50.000 '", () => {
    expect(fmtMoney(50000, null)).toBe("50.000 đ");
    expect(fmtMoney(50000, "")).toBe("50.000 đ");
    // Mã khác thì vẫn là mã lạ (phân biệt hoa thường: server chỉ ghi USD hoa).
    expect(fmtMoney(1000, "usd")).toBe("1.000 usd");
  });

  it("còn N ngày, làm tròn lên", () => {
    expect(daysLeft(T0 + 365 * DAY, T0)).toBe("còn 365 ngày");
    expect(daysLeft(T0 + 1, T0)).toBe("còn 1 ngày");
    expect(daysLeft(T0, T0)).toBe("đã hết hạn");
  });

  it("che key và rút gọn mã máy", () => {
    expect(maskKey("K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB")).toBe("K7Q2-…-9XMB");
    expect(maskKey("K7Q2-…-9XMB")).toBe("K7Q2-…-9XMB");
    expect(shortHash("3fa1" + "0".repeat(56) + "c09e")).toBe("3fa1…c09e");
  });

  it("detail của nhật ký: JSON thành khóa: giá trị", () => {
    expect(fmtDetail('{"note":"bù","days":1}')).toBe("note: bù · days: 1");
    expect(fmtDetail('{"filters":{"status":"paid"}}')).toBe('filters: {"status":"paid"}');
    expect(fmtDetail("khong-phai-json")).toBe("khong-phai-json");
    expect(fmtDetail(null)).toBe("");
  });

  it("detail của nhật ký có currency: các khóa tiền in theo loại tiền (cent thành đô la), không in cent thô", () => {
    expect(fmtDetail('{"reason":"refund","amount":3999,"refunded_amount":1000,"provider_amount_paid":4299,"currency":"USD"}')).toBe(
      "reason: refund · amount: $39,99 · refunded_amount: $10,00 · provider_amount_paid: $42,99 · currency: USD",
    );
    expect(fmtDetail('{"plan":"yearly","amount":500000,"currency":"VND"}')).toBe("plan: yearly · amount: 500.000 đ · currency: VND");
  });

  it("detail: mọi khóa tiền của đơn Creem bị giữ (số khách trả, thuế, giảm giá) in như tiền; khóa khác và giá trị không phải số giữ nguyên", () => {
    const d = JSON.stringify({
      amount: 3999,
      provider_amount: 3999,
      amount_paid: 3000,
      has_discount: true,
      provider_discount_amount: 999,
      provider_amount_paid: 3300,
      provider_tax_amount: 300,
      provider_malformed_fields: ["order.discount"],
      days: 365,
      refunded_amount: null,
    });
    expect(fmtDetail(d, "USD")).toBe(
      'amount: $39,99 · provider_amount: $39,99 · amount_paid: $30,00 · has_discount: true · provider_discount_amount: $9,99 · provider_amount_paid: $33,00 · provider_tax_amount: $3,00 · provider_malformed_fields: ["order.discount"] · days: 365 · refunded_amount: null',
    );
  });

  it("detail không có currency: không đoán loại tiền (cent thô như cũ); trang đơn biết loại tiền thì truyền vào, currency của chính dòng được ưu tiên", () => {
    const d = '{"amount":3999,"amount_paid":2000}';
    expect(fmtDetail(d)).toBe("amount: 3999 · amount_paid: 2000");
    expect(fmtDetail(d, null)).toBe("amount: 3999 · amount_paid: 2000");
    expect(fmtDetail(d, "")).toBe("amount: 3999 · amount_paid: 2000");
    expect(fmtDetail(d, "USD")).toBe("amount: $39,99 · amount_paid: $20,00");
    expect(fmtDetail('{"amount":500000,"currency":"VND"}', "USD")).toBe("amount: 500.000 đ · currency: VND");
  });
});

describe("format cho biểu đồ", () => {
  it("nhãn ngày và tháng, giờ phút GMT+7", () => {
    expect(fmtDay("2026-10-08")).toBe("08/10");
    expect(fmtMonth("2026-10")).toBe("10/2026");
    expect(fmtHm(T0)).toBe("07:00");
    expect(fmtHm(T0 + 61 * 60)).toBe("08:01");
  });

  it("số gọn của trục tiền theo loại tiền: USD nhập cent, ra đô la; VND như fmtCompact", () => {
    expect([0, 100, 399, 5000, 150000, 4_000_000].map((c) => fmtCompactMoney(c, "USD"))).toEqual(["$0", "$1", "$4", "$50", "$1,5k", "$40k"]);
    expect(fmtCompactMoney(1_500_000, "VND")).toBe("1,5tr");
    // Vạch lẻ dưới 1.000 có dấu phẩy kiểu Việt (không phải "2.5").
    expect(fmtCompact(2.5)).toBe("2,5");
  });

  it("số gọn của trục tiền: số âm giữ dấu trừ trước ký hiệu ($ có dấu trừ đứng trước); loại tiền lạ không bị chia 100 như cent", () => {
    expect(fmtCompactMoney(-150000, "USD")).toBe("-$1,5k");
    expect(fmtCompactMoney(-1_500_000, "VND")).toBe("-1,5tr");
    // Chỉ USD là cent: loại khác (hay mã lạ) giữ nguyên số, không thành "$"...
    expect(fmtCompactMoney(150000, "EUR")).toBe("150k");
    expect(fmtCompactMoney(150000, "USD")).not.toBe(fmtCompactMoney(150000, "EUR"));
  });

  it("số gọn cho trục biểu đồ: nghìn là k, triệu là tr, dấu phẩy thập phân", () => {
    expect([0, 950, 1000, 1500, 50000, 1_000_000, 1_500_000, 12_000_000].map(fmtCompact)).toEqual([
      "0",
      "950",
      "1k",
      "1,5k",
      "50k",
      "1tr",
      "1,5tr",
      "12tr",
    ]);
    // Doanh thu tháng hàng tỷ: "1,2tỷ", không phải "1200tr"
    expect([999_000_000, 1_200_000_000, 25_000_000_000].map(fmtCompact)).toEqual(["999tr", "1,2tỷ", "25tỷ"]);
  });
  it("fmtWeekday: thứ trong tuần theo giờ Việt Nam", () => {
    // 2026-10-05 17:30 UTC là 00:30 thứ Ba 06/10 ở Việt Nam
    expect(fmtWeekday(Date.UTC(2026, 9, 5, 17, 30) / 1000)).toBe("Thứ Ba");
    expect(fmtWeekday(Date.UTC(2026, 9, 4, 5, 0) / 1000)).toBe("Chủ nhật");
    expect(fmtWeekday(Date.UTC(2026, 9, 5, 5, 0) / 1000)).toBe("Thứ Hai");
  });
});

describe("fmtBytes", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [1023, "1023 B"],
    [1024, "1 KB"],
    [1536, "1,5 KB"],
    [1024 * 1024 - 1, "1 MB"],
    [1024 * 1024, "1 MB"],
    [574041195, "547,4 MB"],
    [1024 ** 3 - 1, "1 GB"],
    [1024 ** 3, "1 GB"],
    [3.5 * 1024 ** 3, "3,5 GB"],
    [1024 ** 4, "1024 GB"],
  ])("%d byte thành %s", (n, text) => {
    expect(fmtBytes(n)).toBe(text);
  });

  it("số âm hay không hữu hạn thì không ném lỗi", () => {
    expect(fmtBytes(-5)).toBe("0 B");
    expect(fmtBytes(Number.NaN)).toBe("0 B");
  });
});

describe("fmtInt, fmtAgo, isoOf", () => {
  it("số nguyên có dấu chấm ngăn nghìn", () => {
    expect([0, 7, 999, 1000, 1204, 1_234_567].map(fmtInt)).toEqual(["0", "7", "999", "1.000", "1.204", "1.234.567"]);
  });

  /** 2026-10-01T00:00:00Z = 07:00 ngày 01/10/2026 GMT+7. */
  const NOW = 1_790_812_800;
  it.each([
    [NOW, "vừa xong"],
    [NOW - 59, "vừa xong"],
    [NOW + 30, "vừa xong"],
    [NOW - 60, "1 phút trước"],
    [NOW - 59 * 60, "59 phút trước"],
    [NOW - 3600, "1 giờ trước"],
    [NOW - 2 * 3600 - 5, "2 giờ trước"],
    [NOW - 86399, "23 giờ trước"],
    [NOW - 86400, "1 ngày trước"],
    [NOW - 29 * 86400, "29 ngày trước"],
    [NOW - 30 * 86400, "01/09/2026"],
    [NOW + 2 * 86400, "03/10/2026"],
  ])("%d so với mốc thành %s", (sec, text) => {
    expect(fmtAgo(sec, NOW)).toBe(text);
  });

  it("ISO cho <time dateTime>", () => {
    expect(isoOf(NOW)).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("giờ chính xác ngắn và số ngày lớn", () => {
  it("fmtWhen: cùng ngày giờ Việt Nam thì chỉ HH:mm; khác ngày thì đủ ngày giờ", () => {
    // T0 = 07:00 ngày 01/10/2026 (GMT+7).
    expect(fmtWhen(T0 + 3600, T0 + 7200)).toBe("08:00");
    expect(fmtWhen(T0 - 8 * 3600, T0)).toBe("30/09/2026 23:00");
    expect(fmtWhen(T0 - 2 * DAY, T0)).toBe("29/09/2026 07:00");
  });

  it("daysLeft có dấu ngăn nghìn", () => {
    expect(daysLeft(T0 + 3650 * DAY, T0)).toBe("còn 3.650 ngày");
  });
});

describe("parseIsoUtc (chuỗi ISO của server)", () => {
  const UTC_5H = Date.UTC(2026, 9, 8, 5, 0, 0);
  it.each([
    ["2026-10-08T05:00:00Z", UTC_5H],
    ["2026-10-08T05:00:00", UTC_5H],
    ["2026-10-08 05:00:00", UTC_5H],
    ["2026-10-08T05:00", UTC_5H],
    ["2026-10-08T05:00:00.000", UTC_5H],
    ["2026-10-08T12:00:00+07:00", UTC_5H],
    ["Thu, 08 Oct 2026 05:00:00 GMT", UTC_5H],
  ])("%s", (s, ms) => {
    expect(parseIsoUtc(s)).toBe(ms);
  });

  it("không đọc được thì NaN", () => {
    expect(parseIsoUtc("không phải ngày")).toBeNaN();
  });
});
