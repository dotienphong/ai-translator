import { beforeEach, describe, expect, it } from "vitest";
import { dayWindow, monthWindow, vnDayKey } from "../src/admin-stats";
import { resetDb } from "./db";

beforeEach(resetDb);

/** Giây Unix của một thời điểm theo giờ GMT+7. */
const vn = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000 - 7 * 3600;

describe("cửa sổ ngày và tháng GMT+7", () => {
  it("vnDayKey: 23:59:59 và 00:00:00 GMT+7 là hai ngày khác nhau, dù cùng ngày UTC", () => {
    expect(vnDayKey(vn(2026, 9, 30, 23, 59, 59))).toBe("2026-09-30");
    expect(vnDayKey(vn(2026, 10, 1, 0, 0, 0))).toBe("2026-10-01");
  });

  it("dayWindow: 30 ngày kết thúc hôm nay, tăng dần, qua ranh giới tháng và năm", () => {
    const w = dayWindow(vn(2027, 1, 5, 12), 30);
    expect(w.keys).toHaveLength(30);
    expect(w.keys[0]).toBe("2026-12-07");
    expect(w.keys[29]).toBe("2027-01-05");
    expect(w.keys).toContain("2026-12-31");
    expect(w.start).toBe(vn(2026, 12, 7));
  });

  it("dayWindow: tháng 2 năm nhuận có ngày 29", () => {
    expect(dayWindow(vn(2028, 3, 2, 8), 5).keys).toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02"]);
  });

  it("monthWindow: 12 tháng kết thúc tháng này, qua năm; mốc đầu tháng theo GMT+7", () => {
    const w = monthWindow(vn(2027, 2, 10, 9), 12);
    expect(w.keys).toEqual([
      "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
      "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02",
    ]);
    expect(w.start).toBe(vn(2026, 3, 1));
    expect(w.thisStart).toBe(vn(2027, 2, 1));
    expect(w.lastStart).toBe(vn(2027, 1, 1));
  });

  it("monthWindow: 00:30 GMT+7 ngày 1 đã là tháng mới (theo UTC vẫn là tháng trước)", () => {
    const w = monthWindow(vn(2026, 10, 1, 0, 30), 2);
    expect(w.keys).toEqual(["2026-09", "2026-10"]);
    expect(w.thisStart).toBe(vn(2026, 10, 1));
  });
});
