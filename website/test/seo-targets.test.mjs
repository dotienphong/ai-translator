// Kiểm SEO từ khóa livestream, dịch live, dịch thời gian thực (spec 2026-10-25-seo-livestream-tu-khoa-design.md):
//  - 17 cụm chủ dự án yêu cầu đều có trang đích và có mặt đúng chỗ (title, H1, H2, mô tả, thân trang);
//  - hai trang mới nói thẳng giới hạn (chỉ máy tính, chỉ phụ đề cho người xem, không ghi hình) và số đo kèm điều kiện;
//  - không trang vi/en nào nói "đã thử" TikTok, YouTube hay Facebook khi chưa kiểm (LIVE_TESTED, kế hoạch 06);
//  - chân trang nêu nhãn hiệu; menu, chân trang, trang Giải pháp và llms.txt liên kết tới hai trang mới.
//   node --test test/seo-targets.test.mjs        (đang viết dở, thiếu trang ja/zh/ko: ALLOW_PARTIAL=1)
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PUBLISHED, fromEn } from "../src/langs.mjs";

process.env.WEBSITE_DIST ??= mkdtempSync(path.join(tmpdir(), "seo-targets-"));
const { build, DIST } = await import("../src/build/build.mjs");
const { pages } = await import("../src/content/index.mjs");
const { SITE, T, NAV, FOOTER } = await import("../src/site.mjs");

const PARTIAL = process.env.ALLOW_PARTIAL === "1";
/** Ngôn ngữ được kiểm: đủ các ngôn ngữ đã mở; đang viết dở thì chỉ vi và en. */
const LANGS = PARTIAL ? ["vi", "en"] : PUBLISHED;

const html = new Map();
before(async () => {
  await build();
  for (const p of pages) html.set(p.path, readFileSync(path.join(DIST, p.path, "index.html"), "utf8"));
});

const pageOf = (id, lang) => pages.find((p) => p.id === id && p.lang === lang);
const htmlOf = (id, lang) => {
  const p = pageOf(id, lang);
  assert.ok(p, `không có trang ${id} bản ${lang}`);
  return html.get(p.path);
};

const LS_VI = "/giai-phap/dich-livestream/";
const LS_EN = "/en/solutions/livestream-translation/";
const TT_VI = "/giai-phap/dich-live-tiktok/";
const TT_EN = "/en/solutions/tiktok-live-translation/";
const lsPath = (lang) => (lang === "vi" ? LS_VI : fromEn(LS_EN, lang));
const ttPath = (lang) => (lang === "vi" ? TT_VI : fromEn(TT_EN, lang));

const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const text = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const mainOf = (h) => /<main id="main">([\s\S]*)<\/main>/.exec(h)?.[1] ?? "";
/** So sánh cụm không phân biệt hoa thường và dấu gạch ngang ("real-time" = "real time"). */
const norm = (s) => s.normalize("NFC").toLowerCase().replace(/[‐-―-]/g, " ").replace(/\s+/g, " ").trim();

/** Chỗ trong trang mà một cụm đích phải có: mỗi hàm trả danh sách chuỗi chữ thuần. */
const WHERE = {
  title: (h) => [decode(/<title>([^<]*)<\/title>/.exec(h)?.[1] ?? "")],
  description: (h) => [decode(/<meta name="description" content="([^"]*)"/.exec(h)?.[1] ?? "")],
  h1: (h) => [...mainOf(h).matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => text(m[1])),
  h2: (h) => [...mainOf(h).matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1])),
  body: (h) => [text(mainOf(h))],
};

/** 17 cụm chủ dự án yêu cầu (2026-10-25), nguyên văn. */
const REQUESTED = [
  "dịch livestream ra tiếng việt", "dịch live trực tiếp", "dịch livestream trực tiếp", "dịch live tiktok", "dịch live", "dịch livestream",
  "real time translator", "live video translator", "ai meeting translator", "real-time translation", "ai translator", "ai live translator",
  "live meeting translation", "real time translation", "video translator", "realtime translation", "real-time translator for meetings",
];

/** Cụm → trang đích → chỗ phải có (spec mục 1). Đổi title, H1 hay mô tả của các trang này thì test báo nếu mất cụm. */
export const SEO_TARGETS = [
  { phrase: "dịch livestream ra tiếng Việt", lang: "vi", id: "solutions-livestream", where: ["title", "h1"] },
  { phrase: "dịch livestream trực tiếp", lang: "vi", id: "solutions-livestream", where: ["h2"] },
  { phrase: "dịch livestream", lang: "vi", id: "solutions-livestream", where: ["title", "h1", "h2"] },
  { phrase: "dịch live trực tiếp", lang: "vi", id: "solutions-livestream", where: ["body"] },
  { phrase: "dịch live", lang: "vi", id: "solutions-livestream", where: ["body"] },
  { phrase: "dịch live tiktok", lang: "vi", id: "solutions-tiktok-live", where: ["title", "h1"] },
  { phrase: "dịch livestream", lang: "vi", id: "home", where: ["title", "body"] },
  { phrase: "live video translator", lang: "en", id: "solutions-livestream", where: ["title", "h1"] },
  { phrase: "real time translation", lang: "en", id: "solutions-livestream", where: ["body"] },
  { phrase: "realtime translation", lang: "en", id: "solutions-livestream", where: ["body"] },
  { phrase: "real-time translator", lang: "en", id: "home", where: ["title"] },
  { phrase: "real-time translation", lang: "en", id: "home", where: ["description"] },
  { phrase: "ai live translator", lang: "en", id: "home", where: ["body"] },
  { phrase: "ai translator", lang: "en", id: "home", where: ["title"] },
  { phrase: "ai meeting translator", lang: "en", id: "solutions-meetings", where: ["title", "h1"] },
  { phrase: "real-time translator for meetings", lang: "en", id: "solutions-meetings", where: ["body"] },
  { phrase: "live meeting translation", lang: "en", id: "solutions-meetings", where: ["body"] },
  { phrase: "video translator", lang: "en", id: "solutions-webinar", where: ["body"] },
];

test("17 cụm từ khóa chủ dự án yêu cầu đều có mục trong SEO_TARGETS", () => {
  const have = new Set(SEO_TARGETS.map((t) => norm(t.phrase)));
  assert.deepEqual(REQUESTED.filter((r) => !have.has(norm(r))), []);
});

for (const t of SEO_TARGETS) {
  test(`cụm "${t.phrase}" (${t.lang}) có ở ${t.id}: ${t.where.join(", ")}`, () => {
    const h = htmlOf(t.id, t.lang);
    for (const where of t.where) {
      const found = WHERE[where](h).some((s) => norm(s).includes(norm(t.phrase)));
      assert.ok(found, `${pageOf(t.id, t.lang).path}: "${t.phrase}" không có ở ${where}`);
    }
  });
}

/** Câu bắt buộc có ở hai trang mới: giới hạn nói thẳng, số đo kèm điều kiện, câu "chưa thử riêng". Chữ khớp từng chữ với thân trang. */
const NEEDS = {
  "solutions-livestream": {
    vi: ["Bạn xem live bằng điện thoại", "Bạn là người phát live", "không ghi âm hay ghi hình", "không chạy trên điện thoại", "0,76–1,03 giây", "Mac M4 Pro", "Chúng tôi chưa thử riêng từng nền tảng livestream"],
    en: ["You watch on a phone", "You are the one streaming", "does not record audio or video", "not on phones", "0.76–1.03 seconds", "Mac M4 Pro", "We have not tested each livestream platform"],
    // ja/zh/ko (chỉ kiểm khi không đặt ALLOW_PARTIAL): số đo và điều kiện đo không được rớt khi dịch; các câu giới hạn do người dịch giữ và kế hoạch 05 Task 5 đọc lại bằng mắt.
    ja: ["Mac M4 Pro", "0.76", "1.03"],
    zh: ["Mac M4 Pro", "0.76", "1.03"],
    ko: ["Mac M4 Pro", "0.76", "1.03"],
  },
  "solutions-tiktok-live": {
    vi: ["Bạn xem TikTok LIVE bằng điện thoại", "Bạn là người phát live", "không ghi âm hay ghi hình", "không chạy trên điện thoại", "Chúng tôi chưa thử riêng TikTok LIVE", "không liên kết với TikTok"],
    en: ["You watch TikTok Live on a phone", "You are the one streaming", "does not record audio or video", "not on phones", "We have not tested TikTok Live itself", "not affiliated with TikTok"],
  },
};

for (const [id, byLang] of Object.entries(NEEDS)) {
  for (const lang of LANGS.filter((l) => byLang[l])) {
    test(`${id} (${lang}) nói thẳng giới hạn và điều kiện đo`, () => {
      const body = text(mainOf(htmlOf(id, lang)));
      const errors = byLang[lang].filter((n) => !body.includes(n)).map((n) => `${id} (${lang}): thiếu "${n}"`);
      assert.deepEqual(errors, []);
    });
  }
}

/** Đổi thành true CHỈ khi kế hoạch 06 (V1) đạt và kết quả đã ghi ở docs/release/seo-theo-doi.md; lúc đó viết lại các câu "chưa thử". */
const LIVE_TESTED = false;
/** Câu nói đã thử một nền tảng livestream. Nối "đã thử … TikTok" trong một câu cũng bị bắt: viết hai câu riêng (xem kế hoạch 00). */
const CLAIM = {
  vi: /đã (?:thử|kiểm tra|chạy)[^.]{0,80}?(?:TikTok|YouTube|Facebook)/iu,
  en: /\b(?:we|team)\s+(?:have\s+|has\s+|already\s+)?(?:tested|tried|checked)\b[^.]{0,80}?(?:TikTok|YouTube|Facebook)/i,
};
const claimsLiveTested = (lang, s) => CLAIM[lang]?.test(s) ?? false;

test("luật STALE_LIVE bắt câu nói đã thử nền tảng livestream và không bắt câu trung thực", () => {
  assert.ok(claimsLiveTested("vi", "Chúng tôi đã thử với TikTok LIVE và YouTube."));
  assert.ok(claimsLiveTested("vi", "Chúng tôi đã thử với video phát trong trình duyệt, cả TikTok LIVE."));
  assert.ok(claimsLiveTested("en", "We have tested it with TikTok Live."));
  assert.ok(claimsLiveTested("en", "We tested it on YouTube livestreams."));
  assert.ok(!claimsLiveTested("vi", "Chúng tôi đã thử với video phát trong trình duyệt. Chúng tôi chưa thử riêng TikTok LIVE."));
  assert.ok(!claimsLiveTested("en", "We have tested it with videos playing in a browser. We have not tested TikTok Live itself."));
  assert.ok(!claimsLiveTested("en", "We have not tested TikTok Live itself; what we have tested is described on the livestream translation page."));
});

test("không trang vi/en nào nói đã thử TikTok, YouTube hay Facebook Live (LIVE_TESTED = false)", () => {
  if (LIVE_TESTED) return;
  const errors = [];
  for (const p of pages.filter((x) => x.lang === "vi" || x.lang === "en")) {
    const m = CLAIM[p.lang].exec(text(mainOf(html.get(p.path))));
    if (m) errors.push(`${p.path}: …${m[0].slice(0, 120)}…`);
  }
  assert.deepEqual(errors, []);
});

test("chân trang năm ngôn ngữ nêu TikTok, YouTube, Facebook trong câu nhãn hiệu", () => {
  const errors = [];
  for (const lang of PUBLISHED) {
    const h = htmlOf("home", lang);
    const footer = h.slice(h.indexOf("<footer"));
    for (const name of ["TikTok", "YouTube", "Facebook"]) {
      if (!T[lang].trademark.includes(name)) errors.push(`${lang}: T.trademark thiếu ${name}`);
      if (!footer.includes(name)) errors.push(`${lang}: chân trang thiếu ${name}`);
    }
  }
  assert.deepEqual(errors, []);
});

for (const lang of LANGS) {
  test(`menu Giải pháp và chân trang (${lang}) liên kết tới hai trang mới`, () => {
    const nav = NAV[lang].flatMap((i) => i.children ?? []).map((c) => c.href);
    const foot = FOOTER[lang].flatMap((c) => c.links).map((l) => l.href);
    const errors = [];
    for (const href of [lsPath(lang), ttPath(lang)]) {
      if (!nav.includes(href)) errors.push(`${lang}: menu thiếu ${href}`);
      if (!foot.includes(href)) errors.push(`${lang}: chân trang thiếu ${href}`);
    }
    assert.deepEqual(errors, []);
  });

  test(`trang Giải pháp (${lang}) có thẻ tới hai trang mới; hai trang mới liên kết với nhau`, () => {
    const hub = htmlOf("solutions", lang);
    const errors = [];
    for (const href of [lsPath(lang), ttPath(lang)]) if (!hub.includes(`href="${href}"`)) errors.push(`${lang}: trang Giải pháp thiếu ${href}`);
    if (!htmlOf("solutions-livestream", lang).includes(`href="${ttPath(lang)}"`)) errors.push(`${lang}: trang livestream không liên kết tới trang TikTok`);
    if (!htmlOf("solutions-tiktok-live", lang).includes(`href="${lsPath(lang)}"`)) errors.push(`${lang}: trang TikTok không liên kết tới trang livestream`);
    assert.deepEqual(errors, []);
  });

  test(`Trang chủ, Tính năng, Hỏi đáp và Webinar (${lang}) dẫn tới trang dịch livestream`, () => {
    const errors = [];
    for (const id of ["home", "features", "faq", "solutions-webinar"]) {
      if (!htmlOf(id, lang).includes(`href="${lsPath(lang)}"`)) errors.push(`${lang}: ${id} không liên kết tới ${lsPath(lang)}`);
    }
    assert.deepEqual(errors, []);
  });
}

const faqCount = (h) =>
  [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => JSON.parse(m[1])["@graph"])
    .filter((n) => n["@type"] === "FAQPage")
    .reduce((s, n) => s + n.mainEntity.length, 0);

for (const lang of LANGS) {
  test(`hai trang mới (${lang}) có FAQPage JSON-LD: 6 câu (livestream), 4 câu (TikTok)`, () => {
    assert.equal(faqCount(htmlOf("solutions-livestream", lang)), 6);
    assert.equal(faqCount(htmlOf("solutions-tiktok-live", lang)), 4);
  });
}

const HOME_FAQ_Q = { vi: "Dịch livestream ra tiếng Việt được không?", en: "Can I translate a livestream into my language?" };
for (const lang of LANGS.filter((l) => HOME_FAQ_Q[l])) {
  test(`Trang chủ (${lang}) có câu hỏi đáp về livestream`, () => {
    assert.ok(htmlOf("home", lang).includes(`<summary>${HOME_FAQ_Q[lang]}</summary>`), `${lang}: trang chủ thiếu câu "${HOME_FAQ_Q[lang]}"`);
  });
}

test("llms.txt liệt kê hai trang mới bản vi và en", () => {
  const llms = readFileSync(path.join(DIST, "llms.txt"), "utf8");
  const errors = [LS_VI, LS_EN, TT_VI, TT_EN].filter((p) => !llms.includes(`${SITE.origin}${p}`)).map((p) => `llms.txt thiếu ${p}`);
  assert.deepEqual(errors, []);
});
