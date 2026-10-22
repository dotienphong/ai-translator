// Kiểm nội dung bản ja/zh/ko (spec 2026-10-22-website-ja-zh-ko §5, §8): cùng khung với bản en (heading, id, ảnh, liên kết, câu FAQ,
// giá), không sót câu tiếng Anh, nhãn giao diện trùng chữ của app, nói đúng ngôn ngữ của hỗ trợ.
//   WEBSITE_PREVIEW_LANGS=ja node --test test/i18n-content.test.mjs     (xem trước ngôn ngữ đang dịch)
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CJK, VI_EN_ONLY, fromEn } from "../src/langs.mjs";
import { PLANS } from "../src/plans.mjs";
import { appLabelsIn, readDict } from "../tools/i18n/labels.mjs";

process.env.WEBSITE_DIST ??= mkdtempSync(path.join(tmpdir(), "i18n-content-"));
const { build, DIST } = await import("../src/build/build.mjs");
const { pages } = await import("../src/content/index.mjs");

const html = new Map();
before(async () => {
  await build();
  for (const p of pages) html.set(p.path, readFileSync(path.join(DIST, p.path, "index.html"), "utf8"));
});

const cjkPages = pages.filter((p) => CJK.has(p.lang));
const enOf = (p) => pages.find((q) => q.id === p.id && q.lang === "en");
const mainOf = (h) => /<main id="main">([\s\S]*)<\/main>/.exec(h)?.[1] ?? "";
const plain = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
const count = (h, re) => (h.match(re) ?? []).length;
/** Đường dẫn của bản en đổi sang ngôn ngữ `lang`: /en/… → /<lang>/…, trừ pháp lý (giữ bản tiếng Anh). */
function mapHref(href, lang) {
  if (!href.startsWith("/en/")) return href;
  const [p, hash] = href.split("#");
  if ([...VI_EN_ONLY].some((id) => p === `/en/${id}/`)) return href;
  return fromEn(p, lang) + (hash !== undefined ? `#${hash}` : "");
}
// mailto: chỉ so địa chỉ (mẫu thư trong tham số đã dịch).
const hrefs = (h) => [...new Set([...mainOf(h).matchAll(/<a\b[^>]*?\shref="([^"]+)"/g)].map((m) => (m[1].startsWith("mailto:") ? m[1].replace(/\?.*/, "") : m[1])))].sort();
const imgs = (h) => [...new Set([...mainOf(h).matchAll(/<(?:img|source|video)\b[^>]*?\s(?:src|poster)="([^"?]+)/g)].map((m) => m[1]))].sort();
const ids = (h) => [...new Set([...mainOf(h).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))].sort();
const faqCount = (h) =>
  [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => JSON.parse(m[1])["@graph"])
    .filter((n) => n["@type"] === "FAQPage")
    .reduce((s, n) => s + n.mainEntity.length, 0);
// Giá của gói nêu trong trang (VND và USD), chỉ các giá có trong plans.mjs (bỏ số "khoảng 44,800 ₫ mỗi tháng" của thẻ gói en).
const PLAN_VND = new Set(PLANS.map((p) => p.priceVnd).filter(Boolean));
const PLAN_USD = new Set(PLANS.map((p) => p.priceUsdCents).filter(Boolean));
function prices(h) {
  const t = plain(mainOf(h));
  const vnd = [...t.matchAll(/(\d{1,3}(?:[.,]\d{3})+)\s?₫/g)].map((m) => Number(m[1].replace(/[.,]/g, ""))).filter((n) => PLAN_VND.has(n));
  const usd = [...t.matchAll(/(?:US)?\$\s?(\d+)[.,](\d{2})|(\d+)[.,](\d{2})\s?USD/g)].map((m) => Number(`${m[1] ?? m[3]}${m[2] ?? m[4]}`)).filter((n) => PLAN_USD.has(n));
  return { vnd: [...new Set(vnd)].sort(), usd: [...new Set(usd)].sort() };
}

test("mỗi trang ja/zh/ko cùng khung với bản en: kiểu trang, số h2/h3, id, ảnh, liên kết, câu FAQ, giá", () => {
  const errors = [];
  for (const p of cjkPages) {
    const e = enOf(p);
    const a = html.get(p.path);
    const b = html.get(e.path);
    for (const k of ["type", "schemaType", "software", "published"]) if (p[k] !== e[k]) errors.push(`${p.path}: ${k} ${p[k]} ≠ ${e[k]}`);
    if (p.path !== fromEn(e.path, p.lang)) errors.push(`${p.path}: đường dẫn phải là ${fromEn(e.path, p.lang)}`);
    for (const tag of ["h2", "h3"]) {
      const re = new RegExp(`<${tag}[ >]`, "g");
      if (count(mainOf(a), re) !== count(mainOf(b), re)) errors.push(`${p.path}: ${count(mainOf(a), re)} ${tag}, bản en ${count(mainOf(b), re)}`);
    }
    if (JSON.stringify(ids(a)) !== JSON.stringify(ids(b))) errors.push(`${p.path}: id khác bản en: ${ids(a).filter((x) => !ids(b).includes(x)).join(",")} | thiếu ${ids(b).filter((x) => !ids(a).includes(x)).join(",")}`);
    const wantImgs = imgs(b).map((s) => s.replace(/\.en\.(webp|mp4)$/, `.${p.lang}.$1`)).sort();
    if (JSON.stringify(imgs(a)) !== JSON.stringify(wantImgs)) errors.push(`${p.path}: ảnh khác bản en: ${imgs(a).filter((x) => !wantImgs.includes(x)).join(",")} | thiếu ${wantImgs.filter((x) => !imgs(a).includes(x)).join(",")}`);
    const wantHrefs = [...new Set(hrefs(b).map((h) => mapHref(h, p.lang)))].sort();
    if (JSON.stringify(hrefs(a)) !== JSON.stringify(wantHrefs)) errors.push(`${p.path}: liên kết khác bản en: thừa ${hrefs(a).filter((x) => !wantHrefs.includes(x)).join(",")} | thiếu ${wantHrefs.filter((x) => !hrefs(a).includes(x)).join(",")}`);
    if (faqCount(a) !== faqCount(b)) errors.push(`${p.path}: ${faqCount(a)} câu FAQ, bản en ${faqCount(b)}`);
    if (JSON.stringify(prices(a)) !== JSON.stringify(prices(b))) errors.push(`${p.path}: giá ${JSON.stringify(prices(a))}, bản en ${JSON.stringify(prices(b))}`);
  }
  assert.deepEqual(errors, []);
});

// Tên riêng nhiều chữ Latin được phép đứng liền nhau trong bản ja/zh/ko.
const NAMES = /AI Translator|Microsoft Teams|Google Meet|Zalo PC|Apple Silicon|Windows 10\/11|Smart App Control|Type & Translate/g;

test("bản ja/zh/ko không sót câu tiếng Anh (từ năm từ Latin liền nhau, ngoài code, kbd, khối minh họa và phần lang=\"en\")", () => {
  const errors = [];
  for (const p of cjkPages) {
    const body = mainOf(html.get(p.path))
      .replace(/<!--llm-skip-->[\s\S]*?<!--\/llm-skip-->/g, " ")
      .replace(/<(code|kbd|pre)\b[\s\S]*?<\/\1>/g, " ")
      .replace(/<([a-z]+)\b[^>]*\slang="en"[^>]*>[\s\S]*?<\/\1>/g, " ")
      .replace(/<a\b[^>]*href="mailto:[^"]*"[^>]*>[\s\S]*?<\/a>/g, " ");
    const text = plain(body).replace(NAMES, "×");
    for (const m of text.matchAll(/\b[A-Za-z][A-Za-z0-9'’.-]*(?:[ ,]+[A-Za-z][A-Za-z0-9'’.-]*){4,}/g)) errors.push(`${p.path}: "${m[0].slice(0, 80)}"`);
  }
  assert.deepEqual(errors, []);
});

test("nhãn giao diện mà bản en nhắc trong <strong> có mặt đúng chữ của app trong bản ja/zh/ko", () => {
  const en = readDict("en");
  const dicts = { ja: readDict("ja"), zh: readDict("zh"), ko: readDict("ko") };
  const errors = [];
  for (const p of cjkPages) {
    const text = plain(mainOf(html.get(p.path)));
    for (const { en: label, keys } of appLabelsIn(html.get(enOf(p).path), en)) {
      const want = [...new Set(keys.map((k) => dicts[p.lang].get(k)).filter(Boolean))];
      if (want.length && !want.some((w) => text.includes(w.replace(/\s+/g, " ")))) errors.push(`${p.path}: thiếu nhãn "${want.join(" / ")}" (en: ${label})`);
    }
  }
  assert.deepEqual(errors, []);
});

test("Liên hệ và Hỏi đáp bản ja/zh/ko nói hỗ trợ trả lời bằng tiếng Anh hoặc tiếng Việt", () => {
  const PHRASE = { ja: "英語またはベトナム語", zh: "英语或越南语", ko: "영어 또는 베트남어" };
  const errors = [];
  for (const p of cjkPages.filter((x) => x.id === "contact" || x.id === "faq")) {
    if (!plain(mainOf(html.get(p.path))).includes(PHRASE[p.lang])) errors.push(`${p.path}: thiếu "${PHRASE[p.lang]}"`);
  }
  assert.deepEqual(errors, []);
});
