// Nhãn giao diện của app mà các trang website nhắc tới (kế hoạch 2026-10-22-website-ja-zh-ko-04): từ điển i18n của app
// (src/i18n/<ngôn ngữ>.ts) và các chuỗi trong <strong> của một trang. Dùng chung cho tools/i18n/glossary.mjs và test/i18n-content.test.mjs.
import { readFileSync } from "node:fs";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, k) => ENT[k]);

/** Từ điển giao diện của app: Map khóa → chuỗi. Bỏ chuỗi có biến ({lang}, {hotkey}…) vì không trích nguyên văn được. */
export function readDict(lang) {
  const src = readFileSync(new URL(`../../../src/i18n/${lang}.ts`, import.meta.url), "utf8");
  const dict = new Map();
  for (const m of src.matchAll(/^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)) {
    let value;
    try {
      value = JSON.parse(`"${m[2]}"`);
    } catch {
      continue;
    }
    if (!value.includes("{")) dict.set(m[1], value);
  }
  return dict;
}

/** Chuỗi trong <strong>…</strong> của phần thân trang (bỏ thẻ con, giải mã, gộp khoảng trắng), tách theo "›" của đường dẫn menu. */
export function strongLabels(html) {
  const main = /<main id="main">([\s\S]*)<\/main>/.exec(html)?.[1] ?? html;
  return [...main.matchAll(/<strong>([\s\S]*?)<\/strong>/g)]
    .flatMap((m) => decode(m[1].replace(/<[^>]+>/g, "")).split("›"))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Nhãn của app mà một trang en nhắc trong <strong>: [{ en, keys }] (một chuỗi en có thể ứng với nhiều khóa). Bỏ chuỗi ngắn hơn 3 ký tự và tên gói (giống nhau ở mọi ngôn ngữ). */
export function appLabelsIn(enHtml, enDict) {
  const byValue = new Map();
  for (const [k, v] of enDict) byValue.set(v, [...(byValue.get(v) ?? []), k]);
  const SKIP = new Set(["Free", "Monthly", "6 Months", "Yearly", "Pro", "Lite", "Standard", "Fast"]);
  const seen = new Set();
  const out = [];
  for (const label of strongLabels(enHtml)) {
    if (label.length < 3 || SKIP.has(label) || seen.has(label) || !byValue.has(label)) continue;
    seen.add(label);
    out.push({ en: label, keys: byValue.get(label) });
  }
  return out;
}
