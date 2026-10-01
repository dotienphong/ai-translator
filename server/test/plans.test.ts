import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { computeGrant, type LicenseTerms, parsePlans, type PlanTable } from "../src/plans";
import { DAY, T0 } from "./world";

// Bảng gói của môi trường dev (wrangler.jsonc), cũng là giá chính thức của spec §2.
const plans = parsePlans(env.PLANS) as PlanTable;

describe("bảng gói (biến PLANS)", () => {
  it("dev có đủ ba gói với hạn mức và giá của spec §2", () => {
    expect(plans).toEqual({
      pro: { quota_minutes_per_cycle: 1800, days_per_order: 30, prices: { VND: 50000 } },
      pro_x2: { quota_minutes_per_cycle: 6000, days_per_order: 30, prices: { VND: 150000 } },
      pro_x5: { quota_minutes_per_cycle: null, days_per_order: 30, prices: { VND: 500000 } },
    });
  });

  const ok = structuredClone(env.PLANS) as Record<string, Record<string, unknown>>;
  const bad = (edit: (p: Record<string, Record<string, unknown>>) => void) => {
    const p = structuredClone(ok);
    edit(p);
    return p;
  };
  it.each([
    ["thiếu biến", undefined],
    ["không phải object", "pro=50000"],
    ["thiếu một gói", bad((p) => delete p.pro_x5)],
    ["thừa gói lạ", bad((p) => (p.pro_12m = p.pro!))],
    ["hạn mức bằng 0", bad((p) => (p.pro!.quota_minutes_per_cycle = 0))],
    ["hạn mức là chuỗi", bad((p) => (p.pro!.quota_minutes_per_cycle = "1800"))],
    ["số ngày lẻ", bad((p) => (p.pro!.days_per_order = 30.5))],
    ["giá âm", bad((p) => (p.pro!.prices = { VND: -1 }))],
    ["loại tiền sai dạng", bad((p) => (p.pro!.prices = { vnd: 50000 }))],
    ["không có giá", bad((p) => (p.pro!.prices = {}))],
    ["các gói khác loại tiền", bad((p) => (p.pro!.prices = { USD: 2 }))],
  ])("sai (%s) thì null", (_why, raw) => {
    expect(parsePlans(raw)).toBeNull();
  });
});

describe("luật mua thêm và đổi gói (§6.8)", () => {
  const lic = (plan: LicenseTerms["plan"], daysLeft: number, anchor = T0 - 10 * DAY): LicenseTerms => ({
    plan,
    expires_at: T0 + Math.round(daysLeft * DAY),
    cycle_anchor: anchor,
  });

  it("license mới: 30 ngày từ hiện tại, cycle_anchor = hiện tại", () => {
    expect(computeGrant(plans, null, "pro_x2", "VND", T0)).toEqual({
      plan: "pro_x2",
      expires_at: T0 + 30 * DAY,
      cycle_anchor: T0,
      kind: "new",
      converted_days: 0,
    });
  });

  it("mua thêm cùng gói khi còn hạn: cộng 30 ngày vào hạn cũ, giữ cycle_anchor", () => {
    expect(computeGrant(plans, lic("pro", 12), "pro", "VND", T0)).toEqual({
      plan: "pro",
      expires_at: T0 + 42 * DAY,
      cycle_anchor: T0 - 10 * DAY,
      kind: "extend",
      converted_days: 0,
    });
  });

  it("mua thêm cùng gói ở biên hết hạn: hết hạn đúng lúc này là đã hết (chu kỳ mới); còn 1 giây là còn hạn (giữ chu kỳ)", () => {
    expect(computeGrant(plans, lic("pro", 0), "pro", "VND", T0)).toEqual({
      plan: "pro",
      expires_at: T0 + 30 * DAY,
      cycle_anchor: T0,
      kind: "extend",
      converted_days: 0,
    });
    expect(computeGrant(plans, { ...lic("pro", 0), expires_at: T0 + 1 }, "pro", "VND", T0)).toEqual({
      plan: "pro",
      expires_at: T0 + 1 + 30 * DAY,
      cycle_anchor: T0 - 10 * DAY,
      kind: "extend",
      converted_days: 0,
    });
  });

  it("mua thêm cùng gói khi đã hết hạn 10 ngày: 30 ngày từ hiện tại, không cộng nối hạn cũ", () => {
    expect(computeGrant(plans, lic("pro_x2", -10), "pro_x2", "VND", T0)).toEqual({
      plan: "pro_x2",
      expires_at: T0 + 30 * DAY,
      cycle_anchor: T0,
      kind: "extend",
      converted_days: 0,
    });
  });

  it("mua thêm cùng gói khi đã hết hạn: 30 ngày từ hiện tại, cycle_anchor = hiện tại", () => {
    expect(computeGrant(plans, lic("pro_x5", -3), "pro_x5", "VND", T0)).toMatchObject({
      expires_at: T0 + 30 * DAY,
      cycle_anchor: T0,
      kind: "extend",
    });
  });

  it("ví dụ lên gói của spec: Professional còn 20 ngày, mua X2 thì quy đổi 6 ngày, chạy 36 ngày", () => {
    expect(computeGrant(plans, lic("pro", 20), "pro_x2", "VND", T0)).toEqual({
      plan: "pro_x2",
      expires_at: T0 + 36 * DAY,
      cycle_anchor: T0,
      kind: "change",
      converted_days: 6,
    });
  });

  it("ví dụ xuống gói của spec: X2 còn 10 ngày, mua Professional thì quy đổi 30 ngày, chạy 60 ngày", () => {
    expect(computeGrant(plans, lic("pro_x2", 10), "pro", "VND", T0)).toMatchObject({
      expires_at: T0 + 60 * DAY,
      cycle_anchor: T0,
      converted_days: 30,
    });
  });

  it("ngày còn lại giữ phần lẻ rồi mới làm tròn xuống", () => {
    // X2 còn 10,5 ngày → 31,5 ngày Professional → 31.
    expect(computeGrant(plans, lic("pro_x2", 10.5), "pro", "VND", T0).converted_days).toBe(31);
    // X2 còn 0,4 ngày → 1,2 ngày Professional → 1.
    expect(computeGrant(plans, lic("pro_x2", 0.4), "pro", "VND", T0).converted_days).toBe(1);
    // Professional còn 1 giây trước 3 ngày: 2,99… × 50.000 / 150.000 < 1 → 0.
    expect(computeGrant(plans, { ...lic("pro", 3), expires_at: T0 + 3 * DAY - 1 }, "pro_x2", "VND", T0).converted_days).toBe(0);
    // Đúng 3 ngày → đúng 1 ngày X2, không bị sai số dấu phẩy động.
    expect(computeGrant(plans, lic("pro", 3), "pro_x2", "VND", T0).converted_days).toBe(1);
  });

  it("phép tính số nguyên chính xác: X5 (500.000 đ) còn 195 ngày đổi sang gói 3.000 đ ra đúng 32.500 ngày", () => {
    // 195 × 500.000 / 3.000 = 32.500 đúng. Tính bằng số thực (195 × (500.000 / 3.000)) ra 32.499,99… và làm tròn xuống thành 32.499.
    const cheap = structuredClone(plans);
    cheap.pro.prices.VND = 3000;
    expect(computeGrant(cheap, lic("pro_x5", 195), "pro", "VND", T0)).toMatchObject({
      converted_days: 32500,
      expires_at: T0 + (30 + 32500) * DAY,
    });
  });

  it("lên X5 và xuống từ X5", () => {
    expect(computeGrant(plans, lic("pro_x2", 25), "pro_x5", "VND", T0)).toMatchObject({ converted_days: 7, expires_at: T0 + 37 * DAY });
    expect(computeGrant(plans, lic("pro_x5", 2), "pro", "VND", T0)).toMatchObject({ converted_days: 20, expires_at: T0 + 50 * DAY });
  });

  it("license đã hết hạn mua gói khác: như license mới, không quy đổi", () => {
    expect(computeGrant(plans, lic("pro", -1), "pro_x2", "VND", T0)).toEqual({
      plan: "pro_x2",
      expires_at: T0 + 30 * DAY,
      cycle_anchor: T0,
      kind: "change",
      converted_days: 0,
    });
    // Hết hạn đúng lúc này cũng là hết hạn.
    expect(computeGrant(plans, lic("pro", 0), "pro_x2", "VND", T0).converted_days).toBe(0);
    // Đã hết hạn 10 ngày: không quy đổi số âm, hạn mới tính từ hiện tại.
    expect(computeGrant(plans, lic("pro_x5", -10), "pro", "VND", T0)).toEqual({
      plan: "pro",
      expires_at: T0 + 30 * DAY,
      cycle_anchor: T0,
      kind: "change",
      converted_days: 0,
    });
  });

  it("giá lấy theo bảng hiện hành", () => {
    const cheaper = structuredClone(plans);
    cheaper.pro_x2.prices.VND = 100000;
    expect(computeGrant(cheaper, lic("pro", 20), "pro_x2", "VND", T0).converted_days).toBe(10);
  });

  it("thiếu giá theo loại tiền của đơn thì báo lỗi", () => {
    expect(() => computeGrant(plans, lic("pro", 20), "pro_x2", "USD", T0)).toThrow(/USD/);
  });
});
