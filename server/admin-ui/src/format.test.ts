import { describe, expect, it } from "vitest";
import { daysLeft, fmtDate, fmtDateTime, fmtDetail, fmtVnd, maskKey, shortHash } from "./format";

/** 2026-10-01T00:00:00Z = 07:00 ngày 01/10/2026 giờ Việt Nam. */
const T0 = 1_790_812_800;
const DAY = 86400;

describe("format", () => {
  it("ngày giờ theo GMT+7", () => {
    expect(fmtDateTime(T0)).toBe("01/10/2026 07:00");
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
