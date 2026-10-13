import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { computeGrant, LEGACY_PLAN_CODES, type LicenseTerms, offeredPlanCodes, PLAN_CODES, parsePlans, type PlanTable } from "../src/plans";
import { DAY, T0 } from "./world";

// Bảng gói production (wrangler.jsonc), cũng là giá chính thức của spec 2026-10-07 §2.1 và spec 2026-10-13 §1.
const plans = parsePlans(env.PLANS) as PlanTable;

describe("bảng gói (biến PLANS)", () => {
  it("có đúng ba gói trả phí với hạn mức, số ngày và giá của spec 2026-10-07 §2.1 và spec 2026-10-13 §1", () => {
    expect(plans).toEqual({
      monthly: { quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50000 } },
      six_months: { quota_minutes_per_cycle: 6000, days_per_order: 180, prices: { VND: 269000 } },
      yearly: { quota_minutes_per_cycle: null, days_per_order: 365, prices: { VND: 500000 } },
    });
    // Thứ tự mã gói là thứ tự trong màn hình Nâng cấp: theo thời hạn.
    expect([...PLAN_CODES]).toEqual(["monthly", "six_months", "yearly"]);
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
    ["thiếu gói six_months", bad((p) => delete p.six_months)],
    ["thừa gói lạ", bad((p) => (p.pro = p.monthly!))],
    ["six_months có hạn mức bằng 0", bad((p) => (p.six_months!.quota_minutes_per_cycle = 0))],
    ["six_months có số ngày quá 366", bad((p) => (p.six_months!.days_per_order = 367))],
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

  describe("gói 6 Months (spec 2026-10-13 §1)", () => {
    it("license mới: 180 ngày từ hiện tại, cycle_anchor = hiện tại", () => {
      expect(computeGrant(plans, null, "six_months", "VND", T0)).toEqual({
        plan: "six_months",
        expires_at: T0 + 180 * DAY,
        cycle_anchor: T0,
        kind: "new",
        converted_days: 0,
      });
    });

    it("mua thêm cùng gói: còn hạn thì cộng 180 ngày vào hạn cũ và giữ cycle_anchor; đã hết hạn thì tính từ hiện tại", () => {
      expect(computeGrant(plans, lic("six_months", 100), "six_months", "VND", T0)).toEqual({
        plan: "six_months",
        expires_at: T0 + 280 * DAY,
        cycle_anchor: T0 - 10 * DAY,
        kind: "extend",
        converted_days: 0,
      });
      expect(computeGrant(plans, lic("six_months", -4), "six_months", "VND", T0)).toEqual({
        plan: "six_months",
        expires_at: T0 + 180 * DAY,
        cycle_anchor: T0,
        kind: "extend",
        converted_days: 0,
      });
    });

    it("ba ví dụ quy đổi của spec: Monthly còn 20 ngày → 22 ngày; Yearly còn 200 ngày → 183 ngày; 6 Months còn 100 ngày → Yearly 109 ngày", () => {
      // 20 × (50.000 / 30) / (269.000 / 180) = 22,30… → 22; 6 Months chạy 180 + 22 = 202 ngày.
      expect(computeGrant(plans, lic("monthly", 20), "six_months", "VND", T0)).toEqual({
        plan: "six_months",
        expires_at: T0 + 202 * DAY,
        cycle_anchor: T0,
        kind: "change",
        converted_days: 22,
      });
      // 200 × (500.000 / 365) / (269.000 / 180) = 183,33… → 183; 6 Months chạy 363 ngày.
      expect(computeGrant(plans, lic("yearly", 200), "six_months", "VND", T0)).toMatchObject({ expires_at: T0 + 363 * DAY, converted_days: 183 });
      // 100 × (269.000 / 180) / (500.000 / 365) = 109,09… → 109; Yearly chạy 365 + 109 = 474 ngày.
      expect(computeGrant(plans, lic("six_months", 100), "yearly", "VND", T0)).toMatchObject({ expires_at: T0 + 474 * DAY, converted_days: 109 });
    });

    it.each([
      ["monthly", "six_months", 111],
      ["six_months", "monthly", 89],
      ["six_months", "yearly", 109],
      ["yearly", "six_months", 91],
      ["monthly", "yearly", 121],
      ["yearly", "monthly", 82],
    ] as const)("đổi gói %s → %s khi còn 100 ngày: quy đổi %i ngày, làm tròn xuống", (from, to, converted) => {
      const grant = computeGrant(plans, lic(from, 100), to, "VND", T0);
      expect(grant).toMatchObject({ plan: to, kind: "change", cycle_anchor: T0, converted_days: converted });
      expect(grant.expires_at).toBe(T0 + (plans[to].days_per_order + converted) * DAY);
    });

    it("phép tính số nguyên chính xác ở biên với giá 269.000: đúng 269 ngày không bị hụt, thiếu 1 giây thì 268", () => {
      // 6 Months còn đúng 300 ngày → 300 × 269.000 × 30 / (50.000 × 180) = 269 đúng.
      expect(computeGrant(plans, lic("six_months", 300), "monthly", "VND", T0).converted_days).toBe(269);
      expect(computeGrant(plans, { ...lic("six_months", 300), expires_at: T0 + 300 * DAY - 1 }, "monthly", "VND", T0).converted_days).toBe(268);
    });

    it("license đã hết hạn mua 6 Months: như license mới, không quy đổi", () => {
      expect(computeGrant(plans, lic("monthly", -1), "six_months", "VND", T0)).toEqual({
        plan: "six_months",
        expires_at: T0 + 180 * DAY,
        cycle_anchor: T0,
        kind: "change",
        converted_days: 0,
      });
    });
  });
});

describe("danh sách gói theo khả năng của app (spec 2026-10-13 §2.3)", () => {
  const all = ["monthly", "six_months", "yearly"] as const;
  const legacy = ["monthly", "yearly"];
  const old = ["monthly", "yearly"];
  const full = ["monthly", "six_months", "yearly"];

  it("gói cũ của server là monthly và yearly", () => {
    expect([...LEGACY_PLAN_CODES]).toEqual(legacy);
  });

  it.each([
    ["không có tham số (app cũ)", undefined, old],
    ["tham số rỗng", "", old],
    ["app khai báo đủ ba gói", "monthly,six_months,yearly", full],
    ["chỉ khai báo gói mới: gói cũ vẫn luôn có", "six_months", full],
    ["thứ tự khai báo không đổi thứ tự kết quả", "yearly,six_months,monthly", full],
    ["khoảng trắng quanh mã", " monthly , six_months ", full],
    ["mã lạ bị bỏ qua", "six_months,pro,free,", full],
    ["khai báo thiếu gói cũ: gói cũ vẫn có", "monthly", old],
    ["rác", "%%%;;;", old],
    ["viết hoa không khớp", "SIX_MONTHS", old],
    ["dài quá 200 ký tự thì coi là rác", `six_months,${"x".repeat(200)}`, old],
  ])("%s → %j", (_why, requested, expected) => {
    expect(offeredPlanCodes(all, legacy, requested)).toEqual(expected);
  });

  it("dài đúng 200 ký tự vẫn đọc", () => {
    const requested = `six_months,${"x".repeat(189)}`;
    expect(requested).toHaveLength(200);
    expect(offeredPlanCodes(all, legacy, requested)).toEqual(full);
  });
});
