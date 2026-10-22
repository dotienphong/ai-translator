// Test đơn vị cho phần nhiều ngôn ngữ của website (spec 2026-10-22-website-ja-zh-ko-design): cấu hình ngôn ngữ, định dạng ngày
// và giá, thời lượng MP4, khung trang của một ngôn ngữ chưa mở (trang giả, không dựng cả site).
//   node --test test/i18n.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGS, LANG_CODES, PUBLISHED, CJK, VI_EN_ONLY, tagOf, homeOf, isHome, fromEn, formatDate } from "../src/langs.mjs";
import { PLANS, usd, vnd, planName, planSummary } from "../src/plans.mjs";

test("LANGS: năm ngôn ngữ, thẻ BCP 47 (tiếng Trung giản thể là zh-Hans), tiền tố, og:locale, tên bản ngữ", () => {
  assert.deepEqual(LANG_CODES, ["vi", "en", "ja", "zh", "ko"]);
  assert.deepEqual(LANG_CODES.map(tagOf), ["vi", "en", "ja", "zh-Hans", "ko"]);
  assert.deepEqual(LANG_CODES.map(homeOf), ["/", "/en/", "/ja/", "/zh/", "/ko/"]);
  assert.deepEqual(LANG_CODES.map((l) => LANGS[l].ogLocale), ["vi_VN", "en_US", "ja_JP", "zh_CN", "ko_KR"]);
  assert.deepEqual(LANG_CODES.map((l) => LANGS[l].name), ["Tiếng Việt", "English", "日本語", "中文", "한국어"]);
  assert.ok(PUBLISHED.includes("vi") && PUBLISHED.includes("en"));
  assert.deepEqual([...CJK], ["ja", "zh", "ko"]);
  assert.deepEqual([...VI_EN_ONLY], ["terms", "privacy"]);
});

test("isHome và fromEn", () => {
  for (const p of ["/", "/en/", "/ja/", "/zh/", "/ko/"]) assert.equal(isHome(p), true, p);
  for (const p of ["/en/pricing/", "/bang-gia/", "/ja/faq/"]) assert.equal(isHome(p), false, p);
  assert.equal(fromEn("/en/guide/quick-start/", "ja"), "/ja/guide/quick-start/");
  assert.equal(fromEn("/en/", "ko"), "/ko/");
  assert.throws(() => fromEn("/bang-gia/", "zh"), /không phải đường dẫn tiếng Anh/);
});

test("formatDate theo ngôn ngữ", () => {
  assert.equal(formatDate("2026-10-09", "vi"), "09/10/2026");
  assert.equal(formatDate("2026-10-09", "en"), "9 October 2026");
  assert.equal(formatDate("2026-10-09", "ja"), "2026年10月9日");
  assert.equal(formatDate("2026-10-09", "zh"), "2026年10月9日");
  assert.equal(formatDate("2026-10-09", "ko"), "2026년 10월 9일");
});

test("giá theo ngôn ngữ: VND và USD (ja/zh/ko viết US$ để không nhầm với yên, nhân dân tệ)", () => {
  assert.equal(vnd(50000, "vi"), "50.000 ₫");
  assert.equal(vnd(50000, "en"), "50,000 ₫");
  for (const l of ["ja", "zh", "ko"]) {
    assert.equal(vnd(269000, l), "269,000 ₫", l);
    assert.equal(usd(399, l), "US$3.99", l);
    assert.equal(usd(3999, l), "US$39.99", l);
  }
  assert.equal(usd(399, "vi"), "3,99 USD");
  assert.equal(usd(399, "en"), "$3.99");
  assert.equal(vnd(0, "ja"), "0 ₫");
});

test("tên gói: tiếng Việt dùng nameVi, mọi ngôn ngữ khác dùng tên tiếng Anh như app; mô tả gói có đủ năm ngôn ngữ", () => {
  const monthly = PLANS.find((p) => p.code === "monthly");
  assert.equal(planName(monthly, "vi"), monthly.nameVi);
  for (const l of ["en", "ja", "zh", "ko"]) assert.equal(planName(monthly, l), "Monthly");
  for (const p of PLANS) for (const l of ["vi", "en", "ja", "zh", "ko"]) assert.ok(planSummary(p, l)?.length > 5, `${p.code} ${l}`);
  assert.equal(planSummary(monthly, "en"), monthly.summaryEn);
});
