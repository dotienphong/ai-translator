// Test đơn vị cho phần nhiều ngôn ngữ của website (spec 2026-10-22-website-ja-zh-ko-design): cấu hình ngôn ngữ, định dạng ngày
// và giá, thời lượng MP4, khung trang của một ngôn ngữ chưa mở (trang giả, không dựng cả site).
//   node --test test/i18n.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { LANGS, LANG_CODES, PUBLISHED, CJK, VI_EN_ONLY, tagOf, homeOf, isHome, fromEn, formatDate } from "../src/langs.mjs";
import { PLANS, usd, vnd, planName, planSummary } from "../src/plans.mjs";
import { mp4DurationMs, videoMeta } from "../src/build/mp4.mjs";
import { S } from "../src/strings.mjs";
import { renderPage, glue } from "../src/build/layout.mjs";
import { plansGrid, dataFlow, demoVideo } from "../src/build/components.mjs";
import { softwareApplication, videoObject } from "../src/build/schema.mjs";

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

/** ctx tối giản cho renderPage: một nhóm trang "features" đủ năm ngôn ngữ. */
function fakeCtx() {
  const group = [
    { id: "features", lang: "vi", path: "/tinh-nang/" },
    { id: "features", lang: "en", path: "/en/features/" },
    { id: "features", lang: "ja", path: "/ja/features/" },
    { id: "features", lang: "zh", path: "/zh/features/" },
    { id: "features", lang: "ko", path: "/ko/features/" },
  ].map((p) => ({ ...p, title: "機能一覧のテストページ", description: "テスト用の説明文です。".repeat(4), body: "<h1>テスト</h1><p>本文</p>" }));
  const byId = new Map([["features", group]]);
  return { page: (lang) => group.find((p) => p.lang === lang), ctx: { pages: group, byId, assets: { css: "/a.css", js: "/a.js" }, langs: ["vi", "en", "ja", "zh", "ko"] } };
}

test("renderPage của trang tiếng Trung: lang zh-Hans, hreflang theo thẻ, og:locale, menu năm ngôn ngữ trỏ đúng trang, trang chủ /zh/", () => {
  const { page, ctx } = fakeCtx();
  const html = renderPage(page("zh"), ctx);
  assert.match(html, /^<!doctype html>\n<html lang="zh-Hans">/);
  for (const [tag, href] of [["vi", "/tinh-nang/"], ["en", "/en/features/"], ["ja", "/ja/features/"], ["zh-Hans", "/zh/features/"], ["ko", "/ko/features/"]]) {
    assert.ok(html.includes(`<link rel="alternate" hreflang="${tag}" href="https://aitranslator.io.vn${href}">`), `thiếu hreflang ${tag}`);
    assert.ok(html.includes(`<a href="${href}" hreflang="${tag}" lang="${tag}"`), `menu thiếu ${tag}`);
  }
  assert.ok(html.includes('<meta property="og:locale" content="zh_CN">'));
  assert.ok(html.includes('<meta property="og:locale:alternate" content="ja_JP">'));
  assert.ok(html.includes('<a href="/zh/features/" hreflang="zh-Hans" lang="zh-Hans" aria-current="true">中文</a>'));
  assert.ok(html.includes('<a class="brand" href="/zh/"'), "logo phải về /zh/");
  assert.ok(html.includes('<summary aria-label="语言: 中文">'));
  assert.ok(html.includes("<time datetime="), "dòng cập nhật ở chân trang");
});

test("glue: nhãn bảng theo ngôn ngữ", () => {
  const html = glue('<div class="table-wrap"><table><tr><th scope="col"></th></tr></table></div>', "ja");
  assert.ok(html.includes('aria-label="データ表 1"'));
  assert.ok(html.includes('<span class="sr-only">項目</span>'));
});

test("plansGrid tiếng Nhật: tên gói tiếng Anh, giá VND, dòng thẻ US$, nút tới /ja/download/", () => {
  const html = plansGrid("ja", { ctaLabel: "ダウンロード" });
  assert.deepEqual([...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1]), ["Free", "Monthly", "6 Months", "Yearly"]);
  assert.ok(html.includes("<b>無料</b>") && html.includes("<b>50,000 ₫</b>"));
  assert.ok(html.includes('<p class="usd">またはカードで US$3.99</p>'));
  assert.equal((html.match(/href="\/ja\/download\/"/g) ?? []).length, 4);
});

test("dataFlow và softwareApplication đọc chuỗi theo ngôn ngữ; app nêu đủ năm ngôn ngữ giao diện", () => {
  assert.ok(dataFlow("ko").includes("내 컴퓨터에서 실행되는 AI"));
  const ctx = { byId: new Map([["pricing", [{ lang: "ja", path: "/ja/pricing/" }]], ["download", [{ lang: "ja", path: "/ja/download/" }]], ["guide", [{ lang: "ja", path: "/ja/guide/" }]]]) };
  const app = softwareApplication("ja", ctx);
  assert.equal(app["@id"], "https://aitranslator.io.vn/ja/#software");
  assert.equal(app.url, "https://aitranslator.io.vn/ja/");
  assert.equal(app.installUrl, "https://aitranslator.io.vn/ja/download/");
  assert.deepEqual(app.inLanguage, ["vi", "en", "ja", "zh-Hans", "ko"]);
  assert.ok(app.offers.some((o) => o.priceCurrency === "USD" && o.description.includes("税抜")));
  assert.equal(app.screenshot[0].url, "https://aitranslator.io.vn/assets/img/app/overlay-default.ja.webp");
});

test("videoObject tự lấy thời lượng từ file; demoVideo có nút phát ẩn sẵn kèm nhãn và thời lượng", () => {
  const v = videoObject({ lang: "vi", name: "x", description: "y", uploadDate: "2026-10-21" });
  assert.equal(v.duration, "PT40S");
  assert.equal(v["@id"], "https://aitranslator.io.vn/#demo-video");
  assert.equal(v.inLanguage, "vi");
  const html = demoVideo({ lang: "en", label: "Demo", fallback: "Download" });
  assert.match(html, /<figure class="shot video reveal" data-video>/);
  assert.match(html, /<video controls preload="none" playsinline width="1920" height="1200" poster="/);
  assert.match(html, /<button class="video-play" type="button" hidden aria-label="Play the demo video \(0:39, with sound\)">/);
  assert.ok(html.includes('<span class="video-play-label" aria-hidden="true">Watch the demo · 0:39 · with sound</span>'));
});

test("WEBSITE_PREVIEW_LANGS thêm ngôn ngữ đang dịch khi dựng cục bộ; lệnh deploy bỏ qua; mã lạ thì báo lỗi", () => {
  const run = (env, extra = []) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", 'const { PUBLISHED } = await import("./src/langs.mjs"); console.log(PUBLISHED.join(","))', "--", ...extra], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const base = run({ WEBSITE_PREVIEW_LANGS: "" });
  const order = (list) => LANG_CODES.filter((l) => list.includes(l)).join(",");
  assert.equal(run({ WEBSITE_PREVIEW_LANGS: "ja,ko" }), order([...base.split(","), "ja", "ko"]));
  assert.equal(run({ WEBSITE_PREVIEW_LANGS: "ja" }, ["--deploy"]), base);
  assert.throws(() => run({ WEBSITE_PREVIEW_LANGS: "fr" }), /ngôn ngữ lạ fr/);
});
