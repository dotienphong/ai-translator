// Test đơn vị cho phần nhiều ngôn ngữ của website (spec 2026-10-22-website-ja-zh-ko-design): cấu hình ngôn ngữ, định dạng ngày
// và giá, thời lượng MP4, khung trang của một ngôn ngữ chưa mở (trang giả, không dựng cả site).
//   node --test test/i18n.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGS, LANG_CODES, PUBLISHED, CJK, VI_EN_ONLY, tagOf, homeOf, isHome, fromEn, formatDate } from "../src/langs.mjs";
import { PLANS, usd, vnd, planName, planSummary } from "../src/plans.mjs";
import { mp4DurationMs, videoMeta } from "../src/build/mp4.mjs";
import { S } from "../src/strings.mjs";

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

/** Một file MP4 tối giản: ftyp rồi moov chứa mvhd (phiên bản 0 hay 1) với timescale và duration cho trước. */
function fakeMp4({ version, timescale, duration }) {
  const box = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length);
    head.write(type, 4, "latin1");
    return Buffer.concat([head, body]);
  };
  const mvhd = Buffer.alloc(version === 1 ? 112 : 100);
  mvhd[0] = version;
  if (version === 1) {
    mvhd.writeUInt32BE(timescale, 20);
    mvhd.writeBigUInt64BE(BigInt(duration), 24);
  } else {
    mvhd.writeUInt32BE(timescale, 12);
    mvhd.writeUInt32BE(duration, 16);
  }
  return Buffer.concat([box("ftyp", Buffer.from("isom0000", "latin1")), box("moov", box("mvhd", mvhd))]);
}

test("mp4DurationMs đọc hộp mvhd (phiên bản 0 và 1); thiếu moov hay mvhd thì báo lỗi", () => {
  assert.equal(mp4DurationMs(fakeMp4({ version: 0, timescale: 1000, duration: 40494 })), 40494);
  assert.equal(mp4DurationMs(fakeMp4({ version: 1, timescale: 90000, duration: 3486487 })), 38739);
  assert.throws(() => mp4DurationMs(Buffer.from("00000008ftyp", "latin1")), /moov/);
});

test("videoMeta: thời lượng thật của video vi và en (làm tròn giây), dạng m:ss và ISO 8601", () => {
  assert.deepEqual(videoMeta("vi"), { seconds: 40, clock: "0:40", iso: "PT40S" });
  assert.deepEqual(videoMeta("en"), { seconds: 39, clock: "0:39", iso: "PT39S" });
});

test("strings.mjs: mỗi ngôn ngữ có đủ khóa như bản en (cùng cấu trúc, không chuỗi rỗng)", () => {
  const shape = (v) => (typeof v === "function" ? "fn" : Array.isArray(v) ? v.map(shape) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v);
  const empty = (v, at) => (typeof v === "string" ? (v.trim() ? [] : [at]) : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => empty(x, `${at}.${k}`)) : []);
  for (const l of LANG_CODES) {
    assert.deepEqual(shape(S[l]), shape(S.en), `${l}: khác cấu trúc bản en`);
    assert.deepEqual(empty(S[l], l), []);
  }
  assert.equal(S.ja.plans.usd("US$3.99"), "またはカードで US$3.99");
});
