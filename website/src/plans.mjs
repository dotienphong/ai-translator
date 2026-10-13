// Gói Free dùng thử và ba gói trả phí (spec 2026-10-07-three-plans-single-device-design.md; six_months thêm ở spec
// 2026-10-13-six-months-plan-design.md). Giá và hạn mức PHẢI khớp server/wrangler.jsonc;
// test/site.test.mjs đối chiếu hai nơi nên đổi giá ở server mà quên website sẽ làm test đỏ.
export const PLANS = [
  {
    code: "free",
    nameVi: "Free",
    nameEn: "Free",
    priceVnd: 0,
    minutesPerCycle: null,
    minutesPerDay: 30,
    days: 10,
    summaryVi: "Dùng thử 10 ngày, 30 phút mỗi ngày, mỗi máy một lần.",
    summaryEn: "10-day trial, 30 minutes per day, once per device.",
  },
  {
    code: "monthly",
    nameVi: "Monthly",
    nameEn: "Monthly",
    priceVnd: 50000,
    minutesPerCycle: 3000,
    days: 30,
    summaryVi: "50 giờ dịch mỗi 30 ngày, đầy đủ tính năng Pro.",
    summaryEn: "50 hours of translation per 30 days, all Pro features.",
  },
  {
    code: "six_months",
    nameVi: "6 Months",
    nameEn: "6 Months",
    priceVnd: 269000,
    minutesPerCycle: 6000,
    days: 180,
    summaryVi: "100 giờ dịch mỗi 30 ngày trong 180 ngày, đầy đủ tính năng Pro.",
    summaryEn: "100 hours of translation per 30 days for 180 days, all Pro features.",
  },
  {
    code: "yearly",
    nameVi: "Yearly",
    nameEn: "Yearly",
    priceVnd: 500000,
    minutesPerCycle: null,
    days: 365,
    summaryVi: "Không giới hạn thời lượng dịch trong 365 ngày, đầy đủ tính năng Pro.",
    summaryEn: "Unlimited translation time for 365 days, all Pro features.",
  },
];

export const vnd = (n, lang = "vi") =>
  n === 0 ? "0 ₫" : new Intl.NumberFormat(lang === "vi" ? "vi-VN" : "en-US").format(n) + " ₫";
