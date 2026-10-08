import { describe, expect, it } from "vitest";
import {
  daysLeft,
  fmtAgo,
  fmtBytes,
  fmtCompact,
  fmtDate,
  fmtDateTime,
  fmtDay,
  fmtDetail,
  fmtHm,
  fmtInt,
  fmtMonth,
  fmtVnd,
  isoOf,
  maskKey,
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
});

describe("format cho biểu đồ", () => {
  it("nhãn ngày và tháng, giờ phút GMT+7", () => {
    expect(fmtDay("2026-10-08")).toBe("08/10");
    expect(fmtMonth("2026-10")).toBe("10/2026");
    expect(fmtHm(T0)).toBe("07:00");
    expect(fmtHm(T0 + 61 * 60)).toBe("08:01");
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
