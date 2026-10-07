import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { computeGrant, type LicenseTerms, parsePlans, type PlanTable } from "../src/plans";
import { DAY, T0 } from "./world";

// Bảng gói production (wrangler.jsonc), cũng là giá chính thức của spec 2026-10-07 §2.1.
const plans = parsePlans(env.PLANS) as PlanTable;

describe("bảng gói (biến PLANS)", () => {
  it("có đúng hai gói trả phí với hạn mức, số ngày và giá của spec 2026-10-07 §2.1", () => {
    expect(plans).toEqual({
      monthly: { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } },
      yearly: { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } },
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
    ["không phải object", "monthly=50000"],
    ["thiếu một gói", bad((p) => delete p.yearly)],
    ["thừa gói lạ", bad((p) => (p.pro = p.monthly!))],
    ["hạn mức bằng 0", bad((p) => (p.monthly!.quota_minutes_per_cycle = 0))],
    ["hạn mức là chuỗi", bad((p) => (p.monthly!.quota_minutes_per_cycle = "3000"))],
    ["số ngày lẻ", bad((p) => (p.monthly!.days_per_order = 30.5))],
    ["số ngày quá 366", bad((p) => (p.yearly!.days_per_order = 367))],
    ["giá âm", bad((p) => (p.monthly!.prices = { VND: -1 }))],
    ["loại tiền sai dạng", bad((p) => (p.monthly!.prices = { vnd: 50000 }))],
    ["không có giá", bad((p) => (p.monthly!.prices = {}))],
    ["các gói khác loại tiền", bad((p) => (p.monthly!.prices = { USD: 2 }))],
  ])("sai (%s) thì null", (_why, raw) => {
    expect(parsePlans(raw)).toBeNull();
  });
});

describe("luật mua thêm và đổi gói (§6.8, spec 2026-10-07 §2.3)", () => {
  const lic = (plan: LicenseTerms["plan"], daysLeft: number, anchor = T0 - 10 * DAY): LicenseTerms => ({
    plan,
    expires_at: T0 + Math.round(daysLeft * DAY),
    cycle_anchor: anchor,
  });

  it("license mới: số ngày của gói từ hiện tại, cycle_anchor = hiện tại", () => {
    expect(computeGrant(plans, null, "monthly", "VND", T0)).toEqual({
      plan: "monthly",
      expires_at: T0 + 30 * DAY,
      cycle_anchor: T0,
      kind: "new",
      converted_days: 0,
    });
    expect(computeGrant(plans, null, "yearly", "VND", T0)).toEqual({
      plan: "yearly",
      expires_at: T0 + 365 * DAY,
      cycle_anchor: T0,
      kind: "new",
      converted_days: 0,
    });
  });

  it("mua thêm cùng gói khi còn hạn: cộng số ngày của gói vào hạn cũ, giữ cycle_anchor", () => {
    expect(computeGrant(plans, lic("monthly", 12), "monthly", "VND", T0)).toEqual({
      plan: "monthly",
      expires_at: T0 + 42 * DAY,
      cycle_anchor: T0 - 10 * DAY,
      kind: "extend",
      converted_days: 0,
    });
    expect(computeGrant(plans, lic("yearly", 100), "yearly", "VND", T0)).toEqual({
      plan: "yearly",
      expires_at: T0 + 465 * DAY,
      cycle_anchor: T0 - 10 * DAY,
      kind: "extend",
      converted_days: 0,
    });
  });

  it("mua thêm cùng gói ở biên hết hạn: hết hạn đúng lúc này là đã hết (chu kỳ mới); còn 1 giây là còn hạn (giữ chu kỳ)", () => {
    expect(computeGrant(plans, lic("monthly", 0), "monthly", "VND", T0)).toEqual({
      plan: "monthly",
      expires_at: T0 + 30 * DAY,
      cycle_anchor: T0,
      kind: "extend",
      converted_days: 0,
    });
    expect(computeGrant(plans, { ...lic("monthly", 0), expires_at: T0 + 1 }, "monthly", "VND", T0)).toEqual({
      plan: "monthly",
      expires_at: T0 + 1 + 30 * DAY,
      cycle_anchor: T0 - 10 * DAY,
      kind: "extend",
      converted_days: 0,
    });
  });

  it("mua thêm cùng gói khi đã hết hạn: số ngày của gói từ hiện tại, cycle_anchor = hiện tại, không cộng nối hạn cũ", () => {
    expect(computeGrant(plans, lic("monthly", -10), "monthly", "VND", T0)).toEqual({
      plan: "monthly",
      expires_at: T0 + 30 * DAY,
      cycle_anchor: T0,
      kind: "extend",
      converted_days: 0,
    });
    expect(computeGrant(plans, lic("yearly", -3), "yearly", "VND", T0)).toMatchObject({
      expires_at: T0 + 365 * DAY,
      cycle_anchor: T0,
      kind: "extend",
    });
  });

  it("ví dụ lên gói của spec: Monthly còn 20 ngày, mua Yearly thì quy đổi 24 ngày, chạy 389 ngày", () => {
    // 20 × (50.000 / 30) / (500.000 / 365) = 24,33… → 24.
    expect(computeGrant(plans, lic("monthly", 20), "yearly", "VND", T0)).toEqual({
      plan: "yearly",
      expires_at: T0 + 389 * DAY,
      cycle_anchor: T0,
      kind: "change",
      converted_days: 24,
    });
  });

  it("ví dụ xuống gói của spec: Yearly còn 200 ngày, mua Monthly thì quy đổi 164 ngày, chạy 194 ngày", () => {
    // 200 × (500.000 / 365) / (50.000 / 30) = 164,38… → 164.
    expect(computeGrant(plans, lic("yearly", 200), "monthly", "VND", T0)).toEqual({
      plan: "monthly",
      expires_at: T0 + 194 * DAY,
      cycle_anchor: T0,
      kind: "change",
      converted_days: 164,
    });
  });

  it("ngày còn lại giữ phần lẻ rồi mới làm tròn xuống", () => {
    // Yearly còn 10,5 ngày → 10,5 × 30 × 500.000 / (365 × 50.000) = 8,63… → 8.
    expect(computeGrant(plans, lic("yearly", 10.5), "monthly", "VND", T0).converted_days).toBe(8);
    // Monthly còn 0,9 ngày → 0,9 × 365 × 50.000 / (30 × 500.000) = 1,095 → 1.
    expect(computeGrant(plans, lic("monthly", 0.9), "yearly", "VND", T0).converted_days).toBe(1);
  });

  it("phép tính số nguyên chính xác ở biên: kết quả đúng số nguyên không bị hụt, thiếu 1 giây thì làm tròn xuống", () => {
    // Monthly còn đúng 60 ngày → 60 × 365 × 50.000 / (30 × 500.000) = 73 đúng.
    expect(computeGrant(plans, lic("monthly", 60), "yearly", "VND", T0).converted_days).toBe(73);
    expect(computeGrant(plans, { ...lic("monthly", 60), expires_at: T0 + 60 * DAY - 1 }, "yearly", "VND", T0).converted_days).toBe(72);
    // Yearly còn đúng 365 ngày → 365 × 30 × 500.000 / (365 × 50.000) = 300 đúng. Tính bằng số thực
    // (365 × (500.000 / 365) / (50.000 / 30)) có thể ra 299,99… và làm tròn xuống thành 299.
    expect(computeGrant(plans, lic("yearly", 365), "monthly", "VND", T0).converted_days).toBe(300);
    expect(computeGrant(plans, { ...lic("yearly", 365), expires_at: T0 + 365 * DAY - 1 }, "monthly", "VND", T0).converted_days).toBe(299);
  });

  it("license đã hết hạn mua gói khác: như license mới, không quy đổi", () => {
    expect(computeGrant(plans, lic("monthly", -1), "yearly", "VND", T0)).toEqual({
      plan: "yearly",
      expires_at: T0 + 365 * DAY,
      cycle_anchor: T0,
      kind: "change",
      converted_days: 0,
    });
    // Hết hạn đúng lúc này cũng là hết hạn.
    expect(computeGrant(plans, lic("monthly", 0), "yearly", "VND", T0).converted_days).toBe(0);
    // Đã hết hạn 10 ngày: không quy đổi số âm, hạn mới tính từ hiện tại.
    expect(computeGrant(plans, lic("yearly", -10), "monthly", "VND", T0)).toEqual({
      plan: "monthly",
      expires_at: T0 + 30 * DAY,
      cycle_anchor: T0,
      kind: "change",
      converted_days: 0,
    });
  });

  it("giá lấy theo bảng hiện hành", () => {
    const cheaper = structuredClone(plans);
    cheaper.yearly.prices.VND = 365000;
    // 20 × 365 × 50.000 / (30 × 365.000) = 33,33… → 33.
    expect(computeGrant(cheaper, lic("monthly", 20), "yearly", "VND", T0).converted_days).toBe(33);
  });

  it("số ngày mỗi đơn lấy theo bảng hiện hành", () => {
    const shorter = structuredClone(plans);
    shorter.monthly.days_per_order = 15;
    // Monthly 50.000 đ cho 15 ngày: 20 × 365 × 50.000 / (15 × 500.000) = 48,67 → 48.
    expect(computeGrant(shorter, lic("monthly", 20), "yearly", "VND", T0).converted_days).toBe(48);
  });

  it("thiếu giá theo loại tiền của đơn thì báo lỗi", () => {
    expect(() => computeGrant(plans, lic("monthly", 20), "yearly", "USD", T0)).toThrow(/USD/);
  });
});
