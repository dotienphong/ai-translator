// Kiểm SEO từ khóa livestream, dịch live, dịch thời gian thực (spec 2026-10-25-seo-livestream-tu-khoa-design.md):
//  - 17 cụm chủ dự án yêu cầu đều có trang đích và có mặt đúng chỗ (title, H1, H2, mô tả, thân trang);
//  - hai trang mới nói thẳng giới hạn (chỉ máy tính, chỉ phụ đề cho người xem, không ghi hình) và số đo kèm điều kiện;
//  - không trang nào nói "đã thử" TikTok, YouTube hay Facebook khi chưa kiểm (LIVE_TESTED, kế hoạch 06): quét title, mô tả, thân trang, JSON-LD;
//  - chân trang nêu nhãn hiệu; menu, chân trang, trang Giải pháp và llms.txt liên kết tới hai trang mới.
//   node --test test/seo-targets.test.mjs        (đang viết dở, thiếu trang ja/zh/ko: ALLOW_PARTIAL=1)
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PUBLISHED, fromEn } from "../src/langs.mjs";
import { esc } from "../src/build/markdown.mjs";

// File này luôn dựng vào thư mục tạm riêng (gán thẳng, không `??=`): dùng chung WEBSITE_DIST với site.test.mjs thì hai tiến trình dựng đè lên nhau.
process.env.WEBSITE_DIST = mkdtempSync(path.join(tmpdir(), "seo-targets-"));
const { build, DIST } = await import("../src/build/build.mjs");
const { pages } = await import("../src/content/index.mjs");
const { SITE, T, NAV, FOOTER } = await import("../src/site.mjs");

const PARTIAL = process.env.ALLOW_PARTIAL === "1";
/** Ngôn ngữ được kiểm: đủ các ngôn ngữ đã mở; đang viết dở thì chỉ vi và en. */
const CHECKED_LANGS = PARTIAL ? ["vi", "en"] : PUBLISHED;

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

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
/** Giải mã một lượt (không giải mã hai lần: "&amp;lt;" phải ra "&lt;"). */
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, k) => ENTITIES[k]);
const text = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().normalize("NFC");
const mainOf = (h) => {
  const m = /<main id="main">([\s\S]*)<\/main>/.exec(h);
  assert.ok(m, 'thiếu <main id="main"> trong trang (đổi layout thì sửa mainOf)');
  return m[1];
};
/** So sánh cụm không phân biệt hoa thường và dấu gạch ngang ("real-time" = "real time"). */
const norm = (s) => s.normalize("NFC").toLowerCase().replace(/[‐-―-]/g, " ").replace(/\s+/g, " ").trim();
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** `exact`: cụm phải đứng thành từ riêng (không nằm trong từ dài hơn, "dịch live" không khớp "dịch livestream"). */
const contains = (s, phrase, exact) => {
  const a = norm(s);
  const b = norm(phrase);
  return exact ? new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegExp(b)}(?![\p{L}\p{N}])`, "u").test(a) : a.includes(b);
};

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

/**
 * Cụm → trang đích → chỗ phải có (spec mục 1). Đổi title, H1 hay mô tả của các trang này thì test báo nếu mất cụm.
 * Một dòng có `exact: true` thì cụm phải đứng thành từ riêng (xem `contains`).
 * Lưu ý: cụm ngắn được thỏa bởi cụm dài hơn (vd "dịch livestream" có trong "dịch livestream ra tiếng Việt"); vẫn giữ dòng riêng để đủ 17 cụm.
 * Dòng `ai translator` ở title trang chủ en luôn đạt vì đó là tên thương hiệu; nó không đặt mục tiêu thứ hạng.
 */
const SEO_TARGETS = [
  { phrase: "dịch livestream ra tiếng Việt", lang: "vi", id: "solutions-livestream", where: ["title", "h1"] },
  { phrase: "dịch livestream trực tiếp", lang: "vi", id: "solutions-livestream", where: ["h2"] },
  { phrase: "dịch livestream", lang: "vi", id: "solutions-livestream", where: ["title", "h1", "h2"] },
  { phrase: "dịch live trực tiếp", lang: "vi", id: "solutions-livestream", where: ["body"] },
  { phrase: "dịch live", lang: "vi", id: "solutions-livestream", where: ["body"], exact: true },
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
  assert.equal(REQUESTED.length, 17);
  const have = new Set(SEO_TARGETS.map((t) => norm(t.phrase)));
  assert.deepEqual(REQUESTED.filter((r) => !have.has(norm(r))), []);
});

for (const t of SEO_TARGETS) {
  test(`cụm "${t.phrase}" (${t.lang}) có ở ${t.id}: ${t.where.join(", ")}`, () => {
    const h = htmlOf(t.id, t.lang);
    for (const where of t.where) {
      const found = WHERE[where](h).some((s) => contains(s, t.phrase, t.exact));
      assert.ok(found, `${pageOf(t.id, t.lang).path}: "${t.phrase}" không có ở ${where}`);
    }
  });
}

/** Câu bắt buộc có ở hai trang mới: giới hạn nói thẳng, số đo kèm điều kiện, câu "chưa thử riêng". Chữ khớp từng chữ với thân trang. */
// Spec mục 6 cũng muốn chặn câu nói app dịch live của người phát cho người xem: chưa tự động hóa (cần luật loại trừ câu phủ định
// như `staleHits` của site.test.mjs, chưa làm); tạm thời chỉ được bảo vệ bằng câu bắt buộc ở NEEDS (hai trang mới) và kiểm bằng mắt khi sửa trang.
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
    ja: ["TikTok と提携していません"],
    zh: ["与 TikTok 没有关联"],
    ko: ["TikTok과 제휴 관계가 없습니다"],
  },
};

for (const [id, byLang] of Object.entries(NEEDS)) {
  for (const lang of CHECKED_LANGS.filter((l) => byLang[l])) {
    test(`${id} (${lang}) nói thẳng giới hạn và điều kiện đo`, () => {
      const body = text(mainOf(htmlOf(id, lang)));
      const errors = byLang[lang].filter((n) => !body.includes(n)).map((n) => `${id} (${lang}): thiếu "${n}"`);
      assert.deepEqual(errors, []);
    });
  }
}

/** Đổi thành true CHỈ khi kế hoạch 06 (V1) đạt và kết quả đã ghi ở docs/release/seo-theo-doi.md; lúc đó viết lại các câu "chưa thử". Khi true, test quét bên dưới bị bỏ qua. */
const LIVE_TESTED = false;
/**
 * Câu nói đã thử một nền tảng livestream (hoặc chạy tốt với nó). Ranh giới là dấu chấm: một câu có "đã thử …" rồi tới TikTok/YouTube/Facebook
 * trước dấu chấm kế tiếp thì bị bắt, kể cả câu nối bằng dấu phẩy ("đã thử …, nhưng chưa thử riêng TikTok"). Vì vậy luôn viết hai câu riêng (xem kế hoạch 00).
 * ja/zh/ko chỉ bắt dấu hiệu khẳng định mạnh; câu phủ định (試していません, 尚未测试, 테스트하지 않았) không chứa các chuỗi này.
 */
const P = "(?:TikTok|YouTube|Facebook)";
const CLAIM = {
  vi: new RegExp(String.raw`(?<!(?:chưa|không)\s)(?<![\p{L}])(?:đã|được)\s(?:[^.]{0,20}?\s)?(?:thử|test|kiểm\s?(?:tra|thử|chứng)|chạy|đo|xác\s?(?:nhận|minh))[^.]{0,80}?${P}|(?<!(?:chưa|không)\s)(?<![\p{L}])(?:chạy|hoạt động)\s+tốt\s+(?:với|trên)\s[^.]{0,20}?${P}`, "iu"),
  en: new RegExp(String.raw`\b(?:we|team|it|translator)(?:'ve|\s+(?:have|has|had))?\s+(?:(?:also|already|successfully|been|now)\s+)*(?:tested|tried|checked|verified|measured|confirmed|ran|run|used)\b[^.]{0,80}?${P}|(?<!(?:\bnot|\bnever|n't)\s(?:(?:yet|been)\s)*)\b(?:tested|verified|confirmed)\s+(?:on|with|against)\s[^.]{0,20}?${P}|(?<!(?:\bnot|\bnever|n't)\s)\bworks?\s+(?:well|fine|great)\s+(?:with|on)\s[^.]{0,20}?${P}`, "i"),
  ja: new RegExp(String.raw`(?:テスト済み|試しました|確認済み)[^。]{0,60}?${P}|${P}[^。]{0,60}?(?:テスト済み|試しました|確認済み)`, "u"),
  zh: new RegExp(String.raw`(?:已(?:经)?(?:测试|验证|试过)|(?<![没未尚]有?(?:经)?)验证过)[^。]{0,60}?${P}|${P}[^。]{0,60}?(?:已(?:经)?(?:测试|验证|试过)|(?<![没未尚]有?(?:经)?)验证过)`, "u"),
  ko: new RegExp(String.raw`(?:테스트했|검증했|시험했)[^.]{0,60}?${P}|${P}[^.]{0,60}?(?:테스트했|검증했|시험했)`, "u"),
};
const claimsLiveTested = (lang, s) => CLAIM[lang]?.test(s) ?? false;

/** Câu mà luật phải bắt (kể cả câu nối bằng dấu phẩy, vì vậy phải viết hai câu riêng). */
const SHOULD_CATCH = [
  ["vi", "Chúng tôi đã thử với TikTok LIVE và YouTube."],
  ["vi", "Chúng tôi đã thử với video phát trong trình duyệt, cả TikTok LIVE."],
  ["vi", "Chúng tôi đã thử với video phát trong trình duyệt, nhưng chưa thử riêng TikTok LIVE."],
  ["vi", "Chúng tôi đã kiểm thử với TikTok LIVE."],
  ["vi", "Chúng tôi đã dùng thử trên YouTube."],
  ["vi", "Chạy tốt với TikTok LIVE."],
  ["vi", "Chúng tôi đã test với TikTok LIVE."],
  ["vi", "Chúng tôi đã đo độ trễ khi xem YouTube Live."],
  ["vi", "Tính năng được thử nghiệm với TikTok LIVE."],
  ["vi", "Đã xác nhận chạy tốt trên YouTube."],
  ["en", "We have tested it with TikTok Live."],
  ["en", "We tested it on YouTube livestreams."],
  ["en", "We've tested it on YouTube Live."],
  ["en", "We have also tested TikTok Live."],
  ["en", "It has been tested with Facebook Live."],
  ["en", "Tested on TikTok Live."],
  ["en", "Works well with TikTok Live."],
  ["en", "We also tested TikTok Live."],
  ["en", "It was tested on YouTube."],
  ["en", "We ran it on Facebook Live."],
  ["en", "We verified it on YouTube Live."],
  ["en", "We measured latency on TikTok Live."],
  ["en", "We have already tested YouTube Live."],
  ["en", "We have tested it with videos playing in a browser, but have not tested TikTok Live itself."],
  ["ja", "TikTok でテスト済み"],
  ["zh", "已测试 TikTok 直播"],
  ["ko", "TikTok에서 테스트했습니다"],
];
/** Câu trung thực mà luật không được bắt. */
const SHOULD_PASS = [
  ["vi", "Chúng tôi đã thử với video phát trong trình duyệt. Chúng tôi chưa thử riêng TikTok LIVE."],
  ["en", "We have tested it with videos playing in a browser. We have not tested TikTok Live itself."],
  ["en", "We have not tested TikTok Live itself; what we have tested is described on the livestream translation page."],
  ["en", "We have not tested on TikTok Live."],
  ["en", "This has not been tested with YouTube Live yet."],
  ["en", "Not yet tested on Facebook Live."],
  ["en", "It does not work well with the TikTok app on phones."],
  ["vi", "App không chạy tốt với TikTok trên điện thoại."],
  ["vi", "Chưa được thử nghiệm với YouTube."],
  ["zh", "我们没有验证过 TikTok 直播"],
  ["zh", "尚未验证过 YouTube"],
  ["ja", "TikTok ライブはまだ試していません"],
  ["zh", "尚未测试 TikTok 直播"],
  ["ko", "TikTok 라이브는 아직 테스트하지 않았습니다"],
];

test("luật STALE_LIVE bắt câu nói đã thử nền tảng livestream và không bắt câu trung thực", () => {
  for (const [lang, s] of SHOULD_CATCH) assert.ok(claimsLiveTested(lang, s), `phải bắt (${lang}): ${s}`);
  for (const [lang, s] of SHOULD_PASS) assert.ok(!claimsLiveTested(lang, s), `không được bắt (${lang}): ${s}`);
});

/** Các khối JSON-LD của trang và mọi chuỗi (đệ quy) trong chúng. */
const ldBlocks = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const jsonStrings = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) jsonStrings(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) jsonStrings(x, out);
  return out;
};
/** Mọi bề mặt chữ của một trang: title, mô tả, thân trang và từng chuỗi JSON-LD. */
const surfacesOf = (h) => [
  ["title", WHERE.title(h)[0]],
  ["description", WHERE.description(h)[0]],
  ["thân trang", text(mainOf(h))],
  ...ldBlocks(h).flatMap((b) => jsonStrings(b)).map((s) => ["JSON-LD", text(s)]),
];

test("không trang nào nói đã thử TikTok, YouTube hay Facebook Live (LIVE_TESTED = false): quét title, mô tả, thân trang, JSON-LD", { skip: LIVE_TESTED && "V1 đã đạt, xem docs/release/seo-theo-doi.md" }, () => {
  const errors = [];
  for (const p of pages.filter((x) => CLAIM[x.lang])) {
    for (const [surface, s] of surfacesOf(html.get(p.path))) {
      const m = CLAIM[p.lang].exec(s);
      if (m) errors.push(`${p.path} (${surface}): …${m[0].slice(0, 120)}…`);
    }
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
    }
    if (!footer.includes(esc(T[lang].trademark))) errors.push(`${lang}: chân trang không có đủ câu nhãn hiệu`);
  }
  assert.deepEqual(errors, []);
});

/** Mục menu "Giải pháp" của một ngôn ngữ: mục có children chứa trang họp (trang giải pháp có sẵn). */
const solutionsMenu = (lang) => {
  const meetings = pageOf("solutions-meetings", lang)?.path;
  return NAV[lang].find((i) => (i.children ?? []).some((c) => c.href === meetings));
};

for (const lang of CHECKED_LANGS) {
  test(`menu Giải pháp và chân trang (${lang}) liên kết tới hai trang mới`, () => {
    const menu = solutionsMenu(lang);
    assert.ok(menu, `${lang}: không tìm thấy mục menu Giải pháp (mục có children chứa trang họp)`);
    const nav = menu.children.map((c) => c.href);
    const foot = FOOTER[lang].flatMap((c) => c.links).map((l) => l.href);
    const errors = [];
    for (const href of [lsPath(lang), ttPath(lang)]) {
      if (!nav.includes(href)) errors.push(`${lang}: menu thiếu ${href}`);
      if (!foot.includes(href)) errors.push(`${lang}: chân trang thiếu ${href}`);
    }
    assert.deepEqual(errors, []);
  });

  // Hai test liên kết dưới đây chỉ nhìn thân trang (mainOf): menu và chân trang có mặt ở mọi trang nên sẽ làm chúng đạt giả.
  test(`trang Giải pháp (${lang}) có thẻ tới hai trang mới; hai trang mới liên kết với nhau`, () => {
    const hub = mainOf(htmlOf("solutions", lang));
    const errors = [];
    for (const href of [lsPath(lang), ttPath(lang)]) if (!hub.includes(`href="${href}"`)) errors.push(`${lang}: trang Giải pháp thiếu ${href}`);
    if (!mainOf(htmlOf("solutions-livestream", lang)).includes(`href="${ttPath(lang)}"`)) errors.push(`${lang}: trang livestream không liên kết tới trang TikTok`);
    if (!mainOf(htmlOf("solutions-tiktok-live", lang)).includes(`href="${lsPath(lang)}"`)) errors.push(`${lang}: trang TikTok không liên kết tới trang livestream`);
    assert.deepEqual(errors, []);
  });

  test(`Trang chủ, Tính năng, Hỏi đáp và Webinar (${lang}) dẫn tới trang dịch livestream`, () => {
    const errors = [];
    for (const id of ["home", "features", "faq", "solutions-webinar"]) {
      if (!mainOf(htmlOf(id, lang)).includes(`href="${lsPath(lang)}"`)) errors.push(`${lang}: ${id} không liên kết tới ${lsPath(lang)}`);
    }
    assert.deepEqual(errors, []);
  });
}

const faqCount = (h) => ldBlocks(h).flatMap((b) => b["@graph"]).filter((n) => n["@type"] === "FAQPage").reduce((s, n) => s + n.mainEntity.length, 0);

for (const lang of CHECKED_LANGS) {
  test(`hai trang mới (${lang}) có FAQPage JSON-LD: 6 câu (livestream), 4 câu (TikTok)`, () => {
    const errors = [];
    for (const [id, want] of [["solutions-livestream", 6], ["solutions-tiktok-live", 4]]) {
      const n = faqCount(htmlOf(id, lang));
      if (n !== want) errors.push(`${lang} ${id}: ${n} câu FAQ, cần ${want}`);
    }
    assert.deepEqual(errors, []);
  });
}

const HOME_FAQ_Q = { vi: "Dịch livestream ra tiếng Việt được không?", en: "Can I translate a livestream into my language?" };
const summaries = (h) => [...mainOf(h).matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map((m) => text(m[1]));
for (const lang of CHECKED_LANGS.filter((l) => HOME_FAQ_Q[l])) {
  test(`Trang chủ (${lang}) có câu hỏi đáp về livestream`, () => {
    assert.ok(summaries(htmlOf("home", lang)).includes(HOME_FAQ_Q[lang]), `${lang}: trang chủ thiếu câu "${HOME_FAQ_Q[lang]}"`);
  });
}

test("llms.txt liệt kê hai trang mới bản vi và en", () => {
  const llms = readFileSync(path.join(DIST, "llms.txt"), "utf8");
  const errors = [LS_VI, LS_EN, TT_VI, TT_EN].filter((p) => !llms.includes(`${SITE.origin}${p}`)).map((p) => `llms.txt thiếu ${p}`);
  assert.deepEqual(errors, []);
});
