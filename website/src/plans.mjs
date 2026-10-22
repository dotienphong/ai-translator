// Gói Free dùng thử và ba gói trả phí (spec 2026-10-07-three-plans-single-device-design.md; six_months thêm ở spec
// 2026-10-13-six-months-plan-design.md; giá USD ở spec 2026-10-14-creem-international-payment-design.md D2). Giá VND, giá USD
// (đơn vị cent, chưa gồm thuế) và hạn mức PHẢI khớp server/wrangler.jsonc; test/site.test.mjs đối chiếu hai nơi nên đổi giá
// ở server mà quên website sẽ làm test đỏ.
export const PLANS = [
  {
    code: "free",
    nameVi: "Free",
    nameEn: "Free",
    priceVnd: 0,
    priceUsdCents: 0,
    minutesPerCycle: null,
    minutesPerDay: 30,
    days: 10,
    summaryVi: "Dùng thử 10 ngày, 30 phút mỗi ngày, mỗi máy một lần.",
    summaryEn: "10-day trial, 30 minutes per day, once per device.",
    summaryJa: "10 日間のお試し、1 日 30 分、1 台につき 1 回。",
    summaryZh: "试用 10 天，每天 30 分钟，每台设备一次。",
    summaryKo: "10일 체험, 하루 30분, 기기당 1회.",
  },
  {
    code: "monthly",
    nameVi: "Monthly",
    nameEn: "Monthly",
    priceVnd: 50000,
    priceUsdCents: 399,
    minutesPerCycle: 3000,
    days: 30,
    summaryVi: "50 giờ dịch mỗi 30 ngày, đầy đủ tính năng Pro.",
    summaryEn: "50 hours of translation per 30 days, all Pro features.",
    summaryJa: "30 日ごとに 50 時間の翻訳、Pro 機能すべて。",
    summaryZh: "每 30 天 50 小时翻译，全部 Pro 功能。",
    summaryKo: "30일마다 50시간 번역, 모든 Pro 기능.",
  },
  {
    code: "six_months",
    nameVi: "6 Months",
    nameEn: "6 Months",
    priceVnd: 269000,
    priceUsdCents: 2199,
    minutesPerCycle: 6000,
    days: 180,
    summaryVi: "100 giờ dịch mỗi 30 ngày trong 180 ngày, đầy đủ tính năng Pro.",
    summaryEn: "100 hours of translation per 30 days for 180 days, all Pro features.",
    summaryJa: "180 日間、30 日ごとに 100 時間の翻訳、Pro 機能すべて。",
    summaryZh: "180 天内每 30 天 100 小时翻译，全部 Pro 功能。",
    summaryKo: "180일 동안 30일마다 100시간 번역, 모든 Pro 기능.",
  },
  {
    code: "yearly",
    nameVi: "Yearly",
    nameEn: "Yearly",
    priceVnd: 500000,
    priceUsdCents: 3999,
    minutesPerCycle: null,
    days: 365,
    summaryVi: "Không giới hạn thời lượng dịch trong 365 ngày, đầy đủ tính năng Pro.",
    summaryEn: "Unlimited translation time for 365 days, all Pro features.",
    summaryJa: "365 日間、翻訳時間は無制限、Pro 機能すべて。",
    summaryZh: "365 天内翻译时长不限，全部 Pro 功能。",
    summaryKo: "365일 동안 번역 시간 무제한, 모든 Pro 기능.",
  },
];

const NUMBER_LOCALE = { vi: "vi-VN", en: "en-US", ja: "ja-JP", zh: "zh-CN", ko: "ko-KR" };

export const vnd = (n, lang = "vi") => (n === 0 ? "0 ₫" : new Intl.NumberFormat(NUMBER_LOCALE[lang]).format(n) + " ₫");

/** Giá USD từ số cent, chưa gồm thuế: tiếng Việt "3,99 USD", tiếng Anh "$3.99", tiếng Nhật, Trung, Hàn "US$3.99" (không nhầm với yên, nhân dân tệ). */
export const usd = (cents, lang = "vi") => {
  const n = (cents / 100).toFixed(2);
  if (lang === "vi") return `${n.replace(".", ",")} USD`;
  return lang === "en" ? `$${n}` : `US$${n}`;
};

/** Tên gói như app hiện: tiếng Việt dùng nameVi, mọi ngôn ngữ khác dùng tên tiếng Anh (app ja/zh/ko cũng ghi "Monthly"…). */
export const planName = (plan, lang) => (lang === "vi" ? plan.nameVi : plan.nameEn);

/** Mô tả một câu của gói theo ngôn ngữ (summaryVi, summaryEn, summaryJa, summaryZh, summaryKo). */
export const planSummary = (plan, lang) => plan[`summary${lang[0].toUpperCase()}${lang.slice(1)}`];
