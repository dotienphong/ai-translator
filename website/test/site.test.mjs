// Kiểm tra website đã sinh (dist): SEO cơ bản, hreflang, liên kết nội bộ, JSON-LD, CSP, giá khớp server.
//   node --test test/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, DIST } from "../src/build/build.mjs";
import { pages, missing } from "../src/content/index.mjs";
import { vnDate } from "../src/release.mjs";
import * as legal from "../src/content/legal.mjs";
import { glue } from "../src/build/layout.mjs";
import { SITE } from "../src/site.mjs";
import { PLANS, usd, vnd } from "../src/plans.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
let htmlByPath = new Map();

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

const fileFor = (urlPath) => path.join(DIST, urlPath.endsWith("/") ? urlPath + "index.html" : urlPath);

before(async () => {
  await build();
  for (const p of pages) htmlByPath.set(p.path, await readFile(fileFor(p.path), "utf8"));
});

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
const textOf = (h) => strip(h).replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

test("đủ trang (không thiếu module nào)", () => {
  assert.deepEqual(missing, [], "thiếu: " + missing.join(", "));
});

test("mỗi trang có title, description, canonical, h1 duy nhất, lang đúng", () => {
  const errors = [];
  const titles = new Map();
  const descs = new Map();
  for (const p of pages) {
    const html = htmlByPath.get(p.path);
    const title = decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "");
    const desc = decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "");
    if (title.length < 15 || title.length > 70) errors.push(`${p.path}: title ${title.length} ký tự: ${title}`);
    if (desc.length < 90 || desc.length > 165) errors.push(`${p.path}: description ${desc.length} ký tự`);
    if (titles.has(title)) errors.push(`${p.path}: trùng title với ${titles.get(title)}`);
    if (descs.has(desc)) errors.push(`${p.path}: trùng description với ${descs.get(desc)}`);
    titles.set(title, p.path);
    descs.set(desc, p.path);
    const h1 = (html.match(/<h1[ >]/g) ?? []).length;
    if (h1 !== 1) errors.push(`${p.path}: ${h1} thẻ h1 (cần đúng 1)`);
    if (!html.includes(`<link rel="canonical" href="${SITE.origin}${p.path}">`)) errors.push(`${p.path}: canonical`);
    if (!html.startsWith(`<!doctype html>\n<html lang="${p.lang}">`)) errors.push(`${p.path}: lang`);
  }
  assert.deepEqual(errors, []);
});

test("thứ bậc heading không nhảy cấp (h1 → h2 → h3...)", () => {
  const errors = [];
  for (const p of pages) {
    const main = /<main id="main">([\s\S]*)<\/main>/.exec(htmlByPath.get(p.path))?.[1] ?? "";
    let last = 0;
    for (const m of main.matchAll(/<h([1-6])[ >]/g)) {
      const level = Number(m[1]);
      if (last && level > last + 1) errors.push(`${p.path}: nhảy từ h${last} xuống h${level}`);
      last = level;
    }
  }
  assert.deepEqual(errors, []);
});

test("hreflang đối xứng: A trỏ tới B thì B trỏ lại A, và có x-default", () => {
  const byId = new Map();
  for (const p of pages) byId.set(p.id, [...(byId.get(p.id) ?? []), p]);
  for (const [id, group] of byId) {
    if (process.env.ALLOW_PARTIAL === "1" && group.length < 2) continue;
    assert.ok(group.length === 2 && new Set(group.map((g) => g.lang)).size === 2, `${id}: mỗi trang cần đúng một bản vi và một bản en`);
    for (const p of group) {
      const html = htmlByPath.get(p.path);
      for (const q of group) assert.ok(html.includes(`hreflang="${q.lang}" href="${SITE.origin}${q.path}"`), `${p.path} thiếu hreflang ${q.lang}`);
      assert.ok(html.includes('hreflang="x-default"'), `${p.path}: x-default`);
    }
  }
});

test("HTML cân bằng thẻ, không style nội tuyến, không trình xử lý sự kiện nội tuyến, mọi ảnh có alt", () => {
  for (const p of pages) {
    const html = strip(htmlByPath.get(p.path));
    const stack = [];
    for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)(\/?)>/g)) {
      const [, close, name, , self] = m;
      const tag = name.toLowerCase();
      if (VOID.has(tag) || self || ["path", "circle", "rect", "use", "polygon", "line", "symbol", "defs", "svg", "g"].includes(tag)) continue;
      if (!close) stack.push(tag);
      else assert.equal(stack.pop(), tag, `${p.path}: thẻ đóng </${tag}> không khớp`);
    }
    assert.deepEqual(stack, [], `${p.path}: còn thẻ chưa đóng`);
    assert.ok(!/\sstyle="/.test(html), `${p.path}: có style nội tuyến (CSP style-src 'self')`);
    assert.ok(!/\son[a-z]+="/.test(html), `${p.path}: có sự kiện nội tuyến`);
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      assert.ok(/\salt="/.test(m[0]), `${p.path}: ảnh thiếu alt: ${m[0].slice(0, 80)}`);
      assert.ok(/\swidth="\d+"/.test(m[0]) && /\sheight="\d+"/.test(m[0]), `${p.path}: ảnh thiếu width/height (CLS): ${m[0].slice(0, 80)}`);
    }
  }
});

test("liên kết nội bộ và neo (#) đều tồn tại", async () => {
  const ids = new Map();
  for (const [p, html] of htmlByPath) ids.set(p, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  for (const p of pages) {
    const html = strip(htmlByPath.get(p.path));
    for (const m of html.matchAll(/<(?:a|link|img|script)\b[^>]*?\s(?:href|src)="([^"]+)"/g)) {
      const url = m[1];
      if (/^(https?:|mailto:|tel:|data:)/.test(url)) continue;
      // Bỏ query (`?v=<mã băm>` của ảnh app) trước khi tìm file.
      const [target, hash] = url.replace(/\?[^#]*/, "").split("#");
      const t = target === "" ? p.path : target;
      if (t.startsWith("#")) continue;
      const known = htmlByPath.has(t) || (await exists(path.join(DIST, t.endsWith("/") ? t + "index.html" : t)));
      assert.ok(known, `${p.path}: liên kết hỏng → ${url}`);
      if (hash && htmlByPath.has(t)) assert.ok(ids.get(t).has(hash), `${p.path}: neo không có → ${url}`);
    }
  }
});

test("JSON-LD hợp lệ, có Organization/WebSite/WebPage và BreadcrumbList cho trang con", () => {
  for (const p of pages) {
    const html = htmlByPath.get(p.path);
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(m, `${p.path}: thiếu JSON-LD`);
    const data = JSON.parse(m[1]);
    const types = data["@graph"].map((n) => n["@type"]);
    for (const t of ["Organization", "WebSite"]) assert.ok(types.includes(t), `${p.path}: thiếu ${t}`);
    if (p.path !== "/" && p.path !== "/en/") assert.ok(types.includes("BreadcrumbList"), `${p.path}: thiếu BreadcrumbList`);
    const ids = data["@graph"].map((n) => n["@id"]).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${p.path}: @id trùng`);
  }
});

test("sitemap liệt kê mọi trang chỉ mục, có hreflang; robots trỏ tới sitemap; llms.txt có liên kết hợp lệ", async () => {
  const sm = await readFile(path.join(DIST, "sitemap.xml"), "utf8");
  for (const p of pages.filter((x) => !x.noindex)) assert.ok(sm.includes(`<loc>${SITE.origin}${p.path}</loc>`), `sitemap thiếu ${p.path}`);
  assert.ok(sm.includes("xhtml:link"));
  const robots = await readFile(path.join(DIST, "robots.txt"), "utf8");
  assert.ok(robots.includes(`Sitemap: ${SITE.origin}/sitemap.xml`));
  for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot", "Google-Extended"]) assert.ok(robots.includes(`User-agent: ${bot}`), `robots thiếu ${bot}`);
  const llms = await readFile(path.join(DIST, "llms.txt"), "utf8");
  for (const m of llms.matchAll(/\]\((https:\/\/aitranslator\.io\.vn[^)]*)\)/g)) {
    const u = new URL(m[1]);
    assert.ok(htmlByPath.has(u.pathname) || (await exists(path.join(DIST, u.pathname))), `llms.txt: liên kết hỏng ${m[1]}`);
  }
});

test("CSP trong _headers băm đúng script nội tuyến và không cho phép unsafe-inline", async () => {
  const h = await readFile(path.join(DIST, "_headers"), "utf8");
  assert.ok(!h.includes("unsafe-inline") && !h.includes("unsafe-eval"));
  const sample = htmlByPath.get("/");
  const inline = [...sample.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(inline.length, 1, "chỉ một script nội tuyến (khởi tạo giao diện)");
  const { createHash } = await import("node:crypto");
  const hash = "sha256-" + createHash("sha256").update(inline[0]).digest("base64");
  assert.ok(h.includes(hash), "băm CSP không khớp script nội tuyến");
});

test("sản phẩm đã phát hành chính thức: không trang nào còn nói 'bản beta' hay 'đang beta' (chỉ còn tên kênh cập nhật Beta và cờ --beta)", () => {
  // Cho phép: tên kênh cập nhật có thật trong app, lệnh có --beta/-Beta.
  const ALLOWED = /(kênh|channel|channels|Ổn định hoặc|Ổn định và|Stable or|Stable and|--|-)\s*beta\b|\bbeta\s*(channel|channels)\b|<em>beta<\/em>/gi;
  for (const p of pages) {
    const text = textOf(htmlByPath.get(p.path)) + " " + `${p.title} ${p.description} ${p.llm ?? ""}`;
    const left = text.replace(ALLOWED, " ");
    const m = left.match(/.{0,40}\bbeta\b.{0,40}/i);
    assert.ok(!m, `${p.path}: còn chữ "beta" ngoài tên kênh: …${m?.[0]}…`);
  }
});

test("giá và hạn mức trên website khớp server/wrangler.jsonc", async () => {
  const raw = await readFile(path.join(ROOT, "..", "server", "wrangler.jsonc"), "utf8");
  const json = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
  const server = json.vars.PLANS;
  for (const code of ["monthly", "six_months", "yearly"]) {
    const web = PLANS.find((p) => p.code === code);
    assert.equal(web.priceVnd, server[code].prices.VND, `${code}: giá`);
    assert.equal(web.priceUsdCents, server[code].prices.USD, `${code}: giá USD (cent)`);
    assert.equal(web.minutesPerCycle, server[code].quota_minutes_per_cycle, `${code}: hạn mức`);
    assert.equal(web.days, server[code].days_per_order, `${code}: số ngày`);
  }
  assert.equal(PLANS.find((p) => p.code === "free").days, json.vars.TRIAL_DAYS);
});

test("không có chữ giữ chỗ, và trang tiếng Việt có dấu tiếng Việt", () => {
  for (const p of pages) {
    const text = textOf(htmlByPath.get(p.path));
    assert.ok(!/\b(TODO|TBD|FIXME|lorem ipsum|XXX)\b/i.test(text), `${p.path}: còn chữ giữ chỗ`);
    if (p.lang === "vi") {
      const marks = (text.match(/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/gi) ?? []).length;
      assert.ok(marks / text.length > 0.04, `${p.path}: có vẻ thiếu dấu tiếng Việt (${marks}/${text.length})`);
    }
  }
});

test("thư mục dist không chứa file nghi ngờ (bí mật, map, .env)", async () => {
  const all = [];
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) await walk(f);
      else all.push(f);
    }
  }
  await walk(DIST);
  for (const f of all) assert.ok(!/\.(env|map|pem|key)$|\.env/.test(f), `file không nên có: ${f}`);
});

test("biểu tượng raster không rỗng/cắt hỏng (kích thước tối thiểu) và có favicon.ico", async () => {
  const min = { "favicon-32.png": 700, "apple-touch-icon.png": 3000, "favicon.ico": 1200, "assets/img/icon-192.png": 4000, "assets/img/logo-512.png": 10000 };
  for (const [f, bytes] of Object.entries(min)) {
    const size = (await stat(path.join(DIST, f))).size;
    assert.ok(size >= bytes, `${f}: ${size} B, nghi ngờ ảnh trống hoặc bị cắt (cần >= ${bytes})`);
  }
});

test("_headers: không có hai quy tắc Cache-Control cùng khớp một tài nguyên tĩnh", async () => {
  const h = await readFile(path.join(DIST, "_headers"), "utf8");
  assert.ok(!/^\/assets\/\*$/m.test(h), "/assets/* trùng với /assets/bundle/*");
  // Không no-transform ở quy tắc HTML: có nó thì Cloudflare không nén HTML (46 KB thay vì ~10 KB).
  const rules = h.split("\n").filter((l) => /^\s+Cache-Control:/.test(l));
  assert.ok(!rules.some((l) => l.includes("no-transform")), "không đặt no-transform trên HTML (làm mất nén br/gzip)");
  assert.match(h, /^\/404\n\s+X-Robots-Tag: noindex/m, "/404 phải noindex");
});

test("robots.txt: Content-Signal nằm trong nhóm User-agent: *, sitemap khai báo, bot AI được phép", async () => {
  const r = await readFile(path.join(DIST, "robots.txt"), "utf8");
  assert.match(r, /User-agent: \*\nContent-Signal: [^\n]+\nAllow: \//);
  assert.ok(!/^Content-Signal/m.test(r.split("User-agent: *")[0]), "Content-Signal không được đứng ngoài nhóm");
  for (const bot of ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Bingbot", "Google-Extended"]) assert.ok(r.includes(`User-agent: ${bot}`), bot);
  assert.ok(r.includes("Sitemap: https://aitranslator.io.vn/sitemap.xml"));
});

test("_redirects: mỗi trang có quy tắc 301 cho URL thiếu dấu / cuối, đích là trang có thật", async () => {
  const lines = (await readFile(path.join(DIST, "_redirects"), "utf8")).split("\n").filter((l) => l && !l.startsWith("#"));
  const targets = new Set(pages.map((p) => p.path));
  const from = new Set();
  for (const l of lines) {
    const [src, dst, code] = l.split(" ");
    assert.equal(code, "301", l);
    assert.ok(!from.has(src), `trùng nguồn: ${src}`);
    from.add(src);
    assert.ok(dst === "/en/" || targets.has(dst), `đích không tồn tại: ${dst}`);
  }
  for (const p of pages.filter((x) => x.path.endsWith("/") && x.path !== "/" && x.path !== "/en/")) assert.ok(from.has(p.path.slice(0, -1)), `thiếu quy tắc cho ${p.path}`);
  assert.ok(lines.length <= 1000, "quá giới hạn quy tắc tĩnh của Workers");
});

test("sitemap lastmod: định dạng ngày hợp lệ, không ở tương lai, khớp ngày sửa của từng trang", async () => {
  const x = await readFile(path.join(DIST, "sitemap.xml"), "utf8");
  // Ngày sửa của trang lấy từ git theo giờ Việt Nam (UTC+7): so với hôm nay cũng theo giờ Việt Nam. So với ngày UTC thì từ 00:00
  // tới 07:00 giờ Việt Nam, trang vừa commit bị coi là ở tương lai.
  const today = vnDate(new Date().toISOString());
  const re = /<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g;
  const got = new Map([...x.matchAll(re)].map((m) => [m[1], m[2]]));
  for (const p of pages) {
    const lm = got.get(SITE.origin + p.path);
    assert.ok(lm, `${p.path}: thiếu lastmod`);
    assert.match(lm, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(lm <= today, `${p.path}: lastmod ở tương lai`);
    assert.equal(lm, p.modified ?? SITE.updated, p.path);
  }
});

test("JSON-LD: câu trả lời FAQ không dính câu, tham chiếu @id đều có định nghĩa, bài viết tách khỏi WebPage, version khớp bản phát hành", async () => {
  const conf = JSON.parse(await readFile(path.join(ROOT, "..", "src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(SITE.version, conf.version, "SITE.version phải bằng version trong tauri.conf.json");
  for (const p of pages) {
    const html = htmlByPath.get(p.path);
    const g = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const ids = new Set(g["@graph"].map((n) => n["@id"]).filter(Boolean));
    for (const n of g["@graph"]) {
      if (n["@type"] === "FAQPage") {
        for (const q of n.mainEntity) assert.ok(!/[.!?…][A-ZÀ-ỴĐ]/.test(q.acceptedAnswer.text), `${p.path}: câu trả lời FAQ dính câu: ${q.acceptedAnswer.text.match(/.{0,25}[.!?…][A-ZÀ-ỴĐ].{0,25}/)?.[0]}`);
      }
      for (const k of ["mainEntity", "mainEntityOfPage", "breadcrumb", "isPartOf", "about", "publisher", "author", "worksFor", "founder"]) {
        for (const ref of [].concat(n[k] ?? [])) {
          if (ref && typeof ref === "object" && Object.keys(ref).length === 1 && ref["@id"]) assert.ok(ids.has(ref["@id"]), `${p.path}: ${k} trỏ tới ${ref["@id"]} không có định nghĩa`);
        }
      }
    }
    const web = g["@graph"].find((n) => n["@id"] === SITE.origin + p.path + "#webpage");
    assert.ok(web, `${p.path}: thiếu node #webpage`);
    assert.ok(!/Article/.test(web["@type"]), `${p.path}: node #webpage không được là Article/TechArticle`);
    assert.ok(!/</.test(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]), `${p.path}: JSON-LD chứa "<" chưa escape`);
  }
});


// Công nghệ lõi không được công bố: tên model, engine/thư viện chạy model, định dạng, khung app, kiến trúc nội bộ.
const CORE_TECH = /whisper|hy-?mt|tencent|openai|madlad|nllb|llama|ggml|gguf|silero|tauri|\brust\b|cargo|\bmetal\b|vulkan|sqlcipher|sqlite|opencc|wasapi|core audio|process tap|\bengines?\b|quantiz|q8_0|q4_k|large-v3|\bWMT/i;

/** Các chỗ trong `sources` (Map nơi → chữ) nêu công nghệ lõi, dạng "nơi: “từ” …ngữ cảnh…". Hàm thuần: test âm cố định ở test bên dưới. */
const coreTechHits = (sources) =>
  [...sources].flatMap(([name, text]) =>
    [...text.matchAll(new RegExp(CORE_TECH.source, "gi"))].map((m) => `${name}: “${m[0]}” …${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}…`),
  );

test("không lộ công nghệ lõi (tên model, engine, thư viện, kiến trúc) ở mọi nguồn chữ: HTML thô, thân trang, <title>, mô tả, alt, aria-label, JSON-LD, mẫu thư và đủ ba file llms*.txt", async () => {
  // Ca âm trong bộ nhớ: tên công nghệ ở llms-full.vi.txt giả và ở từng bề mặt của một trang ảo đều phải bị bắt (trước đây file này không được quét).
  assert.equal(coreTechHits(new Map([["llms-full.vi.txt", "Bản dịch chạy bằng ggml trên Metal."]])).length, 2);
  const fake = `<!doctype html><html><head><title>Dùng Whisper</title><meta name="description" content="Chạy bằng llama.cpp"></head><body><main><p>Xin chào</p><img src="/a.webp" alt="Giao diện Tauri"><a aria-label="Silero VAD" href="mailto:a@b.vn?body=Rust%20engine">x</a></main>
<script type="application/ld+json">{"@graph":[{"description":"Dùng sqlcipher"}]}</script></body></html>`;
  const flagged = new Set(coreTechHits(pageSources("/trang-ao/", fake)).map((h) => h.split(": “")[0]));
  for (const where of ["/trang-ao/ [title]", "/trang-ao/ [meta]", "/trang-ao/ [alt]", "/trang-ao/ [aria-label]", "/trang-ao/ [mailto]", "/trang-ao/ [json-ld]"]) assert.ok(flagged.has(where), `coreTechHits bỏ sót ${where}`);
  // Mọi nguồn chữ của site (siteTexts: gồm đủ LLMS_FILES) cộng HTML thô của từng trang (bắt cả chữ nằm trong thuộc tính, script, đường dẫn).
  const sources = await siteTexts();
  for (const p of pages) sources.set(`${p.path} [html]`, htmlByPath.get(p.path));
  for (const key of [...LLMS_FILES, "/en/pricing/ [meta]", "/en/pricing/ [json-ld]", "/en/pricing/ [html]"]) assert.ok(sources.get(key), `nguồn quét thiếu ${key}`);
  const hits = coreTechHits(sources);
  assert.deepEqual(hits.slice(0, 10), [], `lộ công nghệ lõi (${hits.length} chỗ)`);
});

// Ảnh chụp app nằm trong cache trình duyệt 30 ngày: đường dẫn phải kèm mã băm nội dung, để chụp lại ảnh (cùng tên file)
// thì người đã vào trang thấy ảnh mới ngay.
test("ảnh chụp app có mã băm nội dung trong đường dẫn", async () => {
  const { createHash } = await import("node:crypto");
  let checked = 0;
  for (const html of htmlByPath.values()) {
    for (const m of html.matchAll(/src="(\/assets\/img\/app\/([^"?]+))(\?v=([0-9a-f]+))?"/g)) {
      assert.ok(m[4], `thiếu ?v= ở ${m[1]}`);
      const hash = createHash("sha256").update(await readFile(path.join(ROOT, "src/assets/img/app", m[2]))).digest("hex");
      assert.ok(hash.startsWith(m[4]), `mã băm cũ ở ${m[1]}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, "không thấy ảnh app nào");
});


// ---- Gói 6 Months (spec 2026-10-13 §4) ----

test("bảng gói của website: Free rồi ba gói trả phí theo thứ tự thời hạn", () => {
  assert.deepEqual(PLANS.map((p) => p.code), ["free", "monthly", "six_months", "yearly"]);
  assert.deepEqual(PLANS.map((p) => p.days), [10, 30, 180, 365]);
});

// ---- Thanh toán quốc tế bằng Creem (spec 2026-10-14 D2, §6) ----

test("giá USD của gói: bằng cent như server, Free là 0; định dạng theo ngôn ngữ", () => {
  assert.deepEqual(PLANS.map((p) => p.priceUsdCents), [0, 399, 2199, 3999]);
  assert.equal(usd(399, "en"), "$3.99");
  assert.equal(usd(2199, "vi"), "21,99 USD");
  assert.equal(usd(3999, "en"), "$39.99");
  assert.equal(usd(0, "en"), "$0.00");
  assert.equal(usd(3999, "vi"), "39,99 USD");
  // Đủ cả hai ngôn ngữ cho từng giá (M-W12-7): đổi nhánh định dạng của một ngôn ngữ thì test báo.
  assert.equal(usd(399, "vi"), "3,99 USD");
  assert.equal(usd(2199, "en"), "$21.99");
  assert.equal(usd(0, "vi"), "0,00 USD");
});

test("thẻ gói ở trang chủ và Bảng giá: đủ bốn thẻ theo thứ tự, đúng giá, nhãn Tiết kiệm nhất chỉ ở Yearly", () => {
  const errors = [];
  for (const [urlPath, lang] of [["/", "vi"], ["/bang-gia/", "vi"], ["/en/", "en"], ["/en/pricing/", "en"]]) {
    const html = htmlByPath.get(urlPath);
    const start = html.indexOf('<div class="plans">');
    const end = html.indexOf('<p class="disclaimer">', start);
    if (start < 0 || end < 0) {
      errors.push(`${urlPath}: không thấy khối thẻ gói`);
      continue;
    }
    const block = html.slice(start, end);
    const names = [...block.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1]);
    const prices = [...block.matchAll(/<div class="price"><b>([^<]*)<\/b>/g)].map((m) => m[1].replaceAll("&nbsp;", " "));
    const featured = [...block.matchAll(/<div class="plan featured[^>]*>[\s\S]*?<h3>([^<]*)<\/h3>/g)].map((m) => m[1]);
    const wantNames = PLANS.map((p) => (lang === "en" ? p.nameEn : p.nameVi));
    const wantPrices = PLANS.map((p) => (p.priceVnd === 0 ? (lang === "en" ? "Free" : "Miễn phí") : vnd(p.priceVnd, lang)));
    if (JSON.stringify(names) !== JSON.stringify(wantNames)) errors.push(`${urlPath}: tên thẻ ${names.join(" | ")}`);
    if (JSON.stringify(prices) !== JSON.stringify(wantPrices)) errors.push(`${urlPath}: giá thẻ ${prices.join(" | ")}`);
    if (JSON.stringify(featured) !== JSON.stringify(["Yearly"])) errors.push(`${urlPath}: thẻ nổi bật ${featured.join(" | ")}`);
  }
  assert.deepEqual(errors, []);
});

test("thẻ gói ở trang chủ và Bảng giá: gói trả phí ghi thêm giá USD bằng thẻ quốc tế, gói Free thì không", () => {
  const errors = [];
  for (const [urlPath, lang] of [["/", "vi"], ["/bang-gia/", "vi"], ["/en/", "en"], ["/en/pricing/", "en"]]) {
    const html = htmlByPath.get(urlPath);
    const start = html.indexOf('<div class="plans">');
    const block = html.slice(start, html.indexOf('<p class="disclaimer">', start));
    const lines = [...block.matchAll(/<p class="usd">([^<]*)<\/p>/g)].map((m) => m[1].replaceAll("&nbsp;", " "));
    const want = PLANS.filter((p) => p.priceUsdCents > 0).map((p) =>
      lang === "en" ? `or ${usd(p.priceUsdCents, "en")} by international card` : `hoặc ${usd(p.priceUsdCents, "vi")} bằng thẻ quốc tế`,
    );
    if (JSON.stringify(lines) !== JSON.stringify(want)) errors.push(`${urlPath}: dòng giá USD: ${lines.join(" | ")}`);
  }
  assert.deepEqual(errors, []);
});

/** Chữ thuần của chú thích `<p class="disclaimer">` đứng NGAY sau lưới thẻ gói (`<div class="plans">`, đủ các thẻ, không có tiêu đề hay phần mới
 *  xen giữa); "" nếu không có. Thẻ gói không ghi thuế nên W2 (giá USD chưa gồm thuế) dựa vào chú thích này: nó phải nằm sát lưới, không ở chỗ khác của trang. */
function gridNote(urlPath) {
  const html = htmlByPath.get(urlPath);
  const start = html.indexOf('<div class="plans">');
  const m = start < 0 ? null : /^([\s\S]*?<\/div>)\s*<\/div>\s*<p class="disclaimer">([\s\S]*?)<\/p>/.exec(html.slice(start));
  if (!m || /<h2[ >]|<\/?section[ >]/.test(m[1]) || (m[1].match(/<h3>/g) ?? []).length !== PLANS.length) return "";
  return textOf(m[2]);
}

test("Bảng giá và trang chủ: hai cách trả và Creem; chú thích sát dưới lưới gói nói giá USD chưa gồm thuế; Bảng giá có hàng Cách thanh toán, khung nước ngoài không phải cảnh báo, mô tả nêu thẻ quốc tế", () => {
  const need = {
    "/bang-gia/": ["VietQR", "thẻ quốc tế", "Creem", "3,99 USD", "21,99 USD", "39,99 USD", "chưa gồm thuế"],
    "/en/pricing/": ["VietQR", "international card", "Creem", "$3.99", "$21.99", "$39.99", "excluding tax"],
    "/": ["VietQR", "thẻ quốc tế", "Creem", "3,99 USD", "21,99 USD", "39,99 USD", "chưa gồm thuế"],
    "/en/": ["VietQR", "international card", "Creem", "$3.99", "$21.99", "$39.99", "excluding tax"],
  };
  const errors = [];
  for (const [urlPath, needles] of Object.entries(need)) errors.push(...needsIn(urlPath, textOf(htmlByPath.get(urlPath)), needles));
  // Chú thích sát dưới lưới gói (cả bốn trang dùng plansGrid): thẻ gói không ghi thuế, nên câu thuế phải nằm ở đây, kèm hai cách trả.
  for (const [urlPath, lang] of [["/", "vi"], ["/bang-gia/", "vi"], ["/en/", "en"], ["/en/pricing/", "en"]]) {
    const note = gridNote(urlPath);
    if (!note) errors.push(`${urlPath}: không có <p class="disclaimer"> ngay sau lưới thẻ gói`);
    else {
      if (!TAX_PHRASE.test(note)) errors.push(`${urlPath}: chú thích dưới lưới gói không nói giá USD chưa gồm thuế: ${note.slice(0, 100)}`);
      errors.push(...needsIn(`${urlPath} (chú thích dưới lưới gói)`, note, lang === "vi" ? ["VietQR", "thẻ quốc tế"] : ["VietQR", "international card"]));
    }
  }
  // Bảng giá: hàng "Cách thanh toán" của bảng so sánh, khung "Thanh toán từ nước ngoài" (thông tin, không phải cảnh báo), mô tả có thẻ quốc tế.
  for (const [urlPath, row, callout, card] of [
    ["/bang-gia/", "Cách thanh toán", "Thanh toán từ nước ngoài", "thẻ quốc tế"],
    ["/en/pricing/", "How to pay", "Paying from outside Vietnam", "international card"],
  ]) {
    const html = htmlByPath.get(urlPath);
    const cells = compareRow(urlPath, row);
    if (!cells || cells.length !== PLANS.length) errors.push(`${urlPath}: không có hàng "${row}" đủ ${PLANS.length} ô (có ${cells?.length ?? "không có"})`);
    else for (const [i, cell] of cells.entries()) if (i > 0 && !(cell.includes("VietQR") && cell.includes(card) && cell.includes("USD"))) errors.push(`${urlPath}: ô "${row}" của ${PLANS[i].nameEn} thiếu VietQR/${card}/USD: ${cell}`);
    const at = html.indexOf(`<strong>${callout}</strong>`);
    const cls = at < 0 ? null : /^<div class="([^"]*)"/.exec(html.slice(html.lastIndexOf('<div class="callout', at)))?.[1];
    if (cls == null) errors.push(`${urlPath}: không thấy khung "${callout}"`);
    else if (!cls.split(/\s+/).includes("callout") || cls.split(/\s+/).includes("warn")) errors.push(`${urlPath}: khung "${callout}" phải là khung thông tin, không phải cảnh báo (class="${cls}")`);
    const desc = decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "");
    if (!desc.includes(card)) errors.push(`${urlPath}: mô tả (description) không nhắc "${card}": ${desc}`);
  }
  assert.deepEqual(errors, []);
});

test("hướng dẫn mua gói và hỏi đáp nêu cả hai cách trả, giá USD và trang thanh toán của Creem", () => {
  const need = {
    "/huong-dan/mua-va-kich-hoat-key/": ["VietQR", "thẻ quốc tế", "Creem", "3,99 USD", "21,99 USD", "39,99 USD", "chưa gồm thuế"],
    "/en/guide/buy-and-activate/": ["VietQR", "international card", "Creem", "$3.99", "$21.99", "$39.99", "excluding tax"],
    "/cau-hoi-thuong-gap/": ["thẻ quốc tế", "Creem", "USD"],
    "/en/faq/": ["international card", "Creem", "USD"],
    "/huong-dan/": ["VietQR hoặc thẻ quốc tế"],
    "/en/guide/": ["VietQR or an international card"],
  };
  const errors = [];
  for (const [urlPath, needles] of Object.entries(need)) {
    const text = textOf(htmlByPath.get(urlPath));
    for (const n of needles) if (!text.includes(n)) errors.push(`${urlPath}: thiếu "${n}"`);
  }
  assert.deepEqual(errors, []);
});

test("Về chúng tôi, Giải pháp, Tải xuống, Tính năng, Liên hệ và Dữ liệu và bảo mật nêu đúng hai cách trả và Creem", () => {
  const need = {
    "/ve-chung-toi/": ["thẻ quốc tế bằng USD qua Creem"],
    "/en/about/": ["international cards in USD through Creem"],
    "/giai-phap/": ["VietQR hoặc thẻ quốc tế"],
    "/en/solutions/": ["VietQR or international card"],
    "/tai-xuong/": ["VietQR (VND) hoặc thẻ quốc tế (USD)"],
    "/en/download/": ["VietQR (VND) or international card (USD)"],
    "/tinh-nang/": ["3,99 USD", "21,99 USD", "39,99 USD"],
    "/en/features/": ["$3.99", "$21.99", "$39.99"],
    "/lien-he/": ["Creem", "biên lai"],
    "/en/contact/": ["Creem", "receipt"],
    "/bao-mat-du-lieu/": ["Đúng năm nơi", "www.creem.io", "Armitage Labs OÜ", "điền sẵn"],
    "/en/data-security/": ["exactly five places", "www.creem.io", "Armitage Labs OÜ", "pre-fill"],
  };
  const errors = [];
  for (const [urlPath, needles] of Object.entries(need)) {
    const text = textOf(htmlByPath.get(urlPath));
    for (const n of needles) if (!text.includes(n)) errors.push(`${urlPath}: thiếu "${n}"`);
  }
  assert.deepEqual(errors, []);
});

// ---- Hardening Creem D3: quét MỌI bề mặt chữ của site; luật "câu cũ", "giá USD" và "trả muộn" là hàm thuần có test âm cố định ----

/** Ba file llms của dist. Phải có đủ ba, và mọi file llms*.txt của dist phải nằm trong danh sách này (thêm file mới mà quên đây thì test báo). */
const LLMS_FILES = ["llms.txt", "llms-full.txt", "llms-full.vi.txt"];
/** Cụm nói giá USD chưa gồm thuế. */
const TAX_PHRASE = /chưa gồm thuế|excl\. tax|excluding tax|excludes? tax/i;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Giải mã thực thể HTML của giá trị thuộc tính (tên, kể cả &nbsp;, và số) trong MỘT lượt (&amp;lt; thành &lt;, không thành <). */
const decodeAttr = (s) =>
  s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (m, hex, dec, name) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : (ENTITIES[name.toLowerCase()] ?? m)));
const safeDecodeURI = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Mọi giá trị chuỗi của một giá trị JSON (đệ quy). Offer có giá thì thêm một mục "3.99 USD" để luật giá đọc được nó. */
function jsonStrings(node, out = []) {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const x of node) jsonStrings(x, out);
  else if (node && typeof node === "object") {
    if (typeof node.price === "string" && typeof node.priceCurrency === "string") out.push(`${node.price} ${node.priceCurrency}`);
    for (const v of Object.values(node)) jsonStrings(v, out);
  }
  return out;
}

/** Các nguồn chữ của một trang: thân trang (đã bỏ thẻ) và mọi bề mặt ngoài thân trang mà người đọc hay công cụ tìm kiếm vẫn thấy
 *  (<title>, giá trị content/alt/aria-label/title đã giải mã, chuỗi JSON-LD, mẫu thư mailto: đã giải mã). Map: khóa dùng để báo lỗi → chữ. */
function pageSources(urlPath, html) {
  const out = new Map([[urlPath, textOf(html)]]);
  const s = strip(html);
  const values = (re) => [...s.matchAll(re)].map((m) => decodeAttr(m[1]));
  const surfaces = {
    title: values(/<title>([\s\S]*?)<\/title>/g),
    meta: values(/<meta\b[^>]*?\scontent="([^"]*)"/g),
    alt: values(/\salt="([^"]*)"/g),
    "aria-label": values(/\saria-label="([^"]*)"/g),
    tooltip: values(/\stitle="([^"]*)"/g),
    "json-ld": [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => jsonStrings(JSON.parse(m[1]))),
    mailto: values(/\shref="(mailto:[^"]*)"/g).map(safeDecodeURI),
  };
  for (const [kind, list] of Object.entries(surfaces)) if (list.length) out.set(`${urlPath} [${kind}]`, list.join("\n"));
  return out;
}

/** Mọi nguồn chữ của site: từng trang (thân trang và bề mặt ngoài thân trang) cùng ba file llms. Để các test "quét cả site" dùng chung. */
async function siteTexts() {
  const sources = new Map();
  for (const [p, html] of htmlByPath) for (const [where, text] of pageSources(p, html)) sources.set(where, text);
  for (const f of LLMS_FILES) sources.set(f, await readFile(path.join(DIST, f), "utf8"));
  return sources;
}

/** Tách chữ thành câu (hết câu ở . ! ? … rồi tới chữ hoa, ngoặc hay nháy; xuống dòng cũng là hết câu). Khoảng trắng không ngắt (NBSP, U+202F) coi như dấu cách,
 *  để "thẻ quốc\u00a0tế" không che được câu cũ khi file llms hay JSON-LD mang ký tự đó. */
const sentencesOf = (text) => text.replace(/[\u00a0\u202f]/g, " ").split(/(?<=[.!?…])\s+(?=[\p{Lu}“"(])|\n+/u).map((s) => s.trim()).filter(Boolean);

/** Câu đã nhắc thẻ, USD hay Creem thì không phải câu "chỉ có một cách trả". */
const CARD_MENTION = /card|creem|usd|\$\s?\d|thẻ/i;
const NOT_ABOUT_ISSUER = String.raw`(?!\s+(?:phát hành|từ|ở|của|do|tại)\b)`;

/** Câu về giữ đơn thẻ 30 phút (quyết định Q3: đơn thẻ không báo thất bại sớm, nên "được giữ 30 phút" là sai). */
const STALE_HOLD30 = [
  { id: "vi: đơn được giữ 30 phút", re: /đơn được giữ (?:trong )?30 phút/i },
  { id: "vi: giữ … 30 phút", re: /giữ[^.]{0,40}30 phút/i },
  { id: "vi: 30 phút … được giữ, bị hủy, hết hạn", re: /30 phút[^.]{0,40}(?:được giữ|bị hủy|hết hạn|mất)/i },
  { id: "en: order is kept, stays open, … for 30 minutes", re: /\b(?:stays? open|(?:is|are|be|been) (?:kept|held)|kept open|held open)\b[^.]{0,40}\b30 minutes/i },
  { id: "en: 30 minutes … stays open, is kept, expires", re: /\b30 minutes\b[^.]{0,40}\b(?:stays? open|(?:is|are) (?:kept|held)|expires)/i },
];

/** Câu cũ nói chưa có thẻ quốc tế hay chỉ có VietQR/VND (đúng cho tới khi có Creem, giờ sai; spec 2026-10-14-creem-international-payment-design).
 *  Mỗi luật chỉ bắt đúng ý "chưa có/chỉ có", không bắt câu về giới hạn còn lại của thẻ (thẻ phát hành ở một số nước, giá chưa gồm thuế, "thẻ quốc tế chưa được bán lúc này"). */
const STALE_PAYMENT = [
  {
    id: "vi: chưa/không nhận thẻ quốc tế",
    re: new RegExp(
      String.raw`(?<![\p{L}])(?<!(?:bạn|khách)\s)(?:chưa\s+(?:có|nhận|hỗ trợ|chấp nhận|bán)|không\s+(?:nhận|hỗ trợ|chấp nhận|bán))\s+(?:(?:thanh toán|việc thanh toán)\s+)?(?:(?:bằng|qua|với)\s+)?(?:thẻ quốc tế|thẻ Visa|Visa|Mastercard)(?![\p{L}])${NOT_ABOUT_ISSUER}`,
      "iu",
    ),
  },
  { id: "vi: không thẻ quốc tế", re: /(?<![\p{L}])không thẻ quốc tế/iu },
  { id: "vi: chỉ VietQR hay chuyển khoản", re: /(?<![\p{L}])chỉ\s+(?:(?:có|nhận|hỗ trợ|chấp nhận|thanh toán|trả|dùng|cho phép)\s+)?(?:(?:bằng|qua|được|với)\s+)?(?:chuyển khoản|VietQR)/iu, unless: CARD_MENTION },
  { id: "vi: chỉ bằng VND", re: /(?<![\p{L}])chỉ\s+(?:(?:tính|trả|thanh toán)\s+)?(?:bằng|theo)\s+VND/iu, unless: CARD_MENTION },
  { id: "vi: bán ra nước ngoài, kèm thanh toán quốc tế", re: /bán ra nước ngoài, kèm thanh toán quốc tế/i },
  { id: "vi: không có tài khoản ngân hàng Việt Nam thì chưa mua được", re: /không có tài khoản ngân hàng Việt Nam[^.]{0,80}chưa mua được gói trả phí/i },
  { id: "en: international cards are not (yet) accepted", re: /\binternational cards?(?:\s+payments?)?\s+(?:are|is)\s+(?:currently\s+)?not\s+(?:yet\s+|currently\s+)?(?:accepted|supported|available|offered)\b(?!\s+(?:in|from|by|for|when|if|to)\b)/i },
  { id: "en: payment by international card is not available", re: /\b(?:payments?|paying)\s+(?:by|with)\s+(?:an?\s+)?international cards?\s+(?:is|are)\s+(?:currently\s+)?not\s+(?:yet\s+)?(?:accepted|supported|available|offered)\b/i },
  { id: "en: no international cards (yet)", re: /\bno international cards?\s+(?:yet|and\b|payments?|support|accepted|option)/i },
  { id: "en: only accept bank transfers, VietQR, VND", re: /\b(?:only\s+(?:accepts?|supports?|takes?|allows?)|(?:accepts?|supports?|takes?|allows?)\s+only)\b[^.]{0,40}?\b(?:bank transfers?|VietQR|VND|PayOS)\b/i, unless: CARD_MENTION },
  { id: "en: only bank transfers or VietQR", re: /\bonly\s+(?:bank transfers?|VietQR)\b/i, unless: CARD_MENTION },
  { id: "en: VND, VietQR, bank transfer only", re: /\b(?:VND|VietQR|bank transfers?|PayOS)\)?\s+only\b(?!\s+(?:works?|applies|accepts?|supports?|from|with|for|when|if|in)\b)/i, unless: CARD_MENTION },
  { id: "en: bank transfer only from Vietnamese banks", re: /\b(?:bank transfers?|VietQR|payments?)\s+only\s+from\s+(?:a\s+)?Vietnam/i },
  { id: "en: paid in VND by bank transfer", re: /\b(?:paid|pay|payments?)\s+in\s+VND\s+by\s+(?:bank transfer|VietQR)\b/i, unless: CARD_MENTION },
  { id: "en: through PayOS only", re: /\bthrough PayOS only\b/i },
  { id: "en: cannot buy a paid plan", re: /\b(?:cannot|can't|can not|unable to)\s+(?:buy|purchase)\s+a paid plan\s+(?:today|at the moment|yet|right now|currently)\b/i },
  { id: "en: selling outside Vietnam, with international payments", re: /selling outside vietnam, with international payments/i },
];
const STALE = [...STALE_PAYMENT, ...STALE_HOLD30];

/** Các câu của `text` khớp một luật câu cũ (và không có cụm `unless` của luật đó). Hàm thuần: test âm cố định ở dưới. */
function staleHits(text, rules = STALE) {
  const hits = [];
  for (const sentence of sentencesOf(text)) {
    for (const rule of rules) {
      if (rule.re.test(sentence) && !rule.unless?.test(sentence)) hits.push({ id: rule.id, sentence: sentence.length > 120 ? `${sentence.slice(0, 120)}…` : sentence });
    }
  }
  return hits;
}
const scanStale = (sources, rules) => [...sources].flatMap(([where, text]) => staleHits(text, rules).map((h) => `${where}: còn câu cũ [${h.id}] "${h.sentence}"`));

// Số tiền: "3,99" (thập phân kiểu Việt), "3.99" (kiểu Anh), "1,000" hay "1.000" (hàng nghìn; ba chữ số sau dấu là hàng nghìn).
const AMOUNT = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const USD_AFTER = new RegExp(String.raw`(${AMOUNT})\s*(?:US\$|USD|\$|US dollars?|dollars?|đô la(?: Mỹ)?|đô)(?![\p{L}])`, "giu");
// Ký hiệu đứng trước số, trừ khi ngay trước nó là một số ("3,99 USD 6 Months" ở bảng: "6" là tên cột kế, không phải giá).
const USD_BEFORE = new RegExp(String.raw`(?<!\d\s*)(?:US\$|USD|\$)\s*(${AMOUNT})(?!\d)`, "giu");
function amountOf(raw) {
  const dec = /[.,](\d{1,2})$/.exec(raw);
  return Number((dec ? raw.slice(0, dec.index) : raw).replace(/[.,]/g, "") + (dec ? `.${dec[1]}` : ""));
}
/** Mọi số tiền USD trong `text` (cả "3.99 USD", "$3,99", "USD 3.99", "US$ 4.99", "4.99$", "4,99 đô la", "4.99 US dollars"), tính bằng cent. */
function usdAmounts(text) {
  const found = [];
  for (const re of [USD_AFTER, USD_BEFORE]) for (const m of text.matchAll(re)) found.push({ raw: m[0], cents: Math.round(amountOf(m[1]) * 100) });
  return found;
}
const PLAN_USD_CENTS = new Set(PLANS.map((p) => p.priceUsdCents));
const scanUsd = (sources) => [...sources].flatMap(([where, text]) => usdAmounts(text).filter((a) => !PLAN_USD_CENTS.has(a.cents)).map((a) => `${where}: giá USD lạ "${a.raw}"`));

/** Lỗi khi một đoạn nêu giá USD của một gói mà không nói chưa gồm thuế (W2). Đoạn: nguồn chữ của một trang; một dòng của llms.txt; một trang của llms-full*.txt. */
function scanTax(sources) {
  const errors = [];
  for (const [where, text] of sources) {
    const chunks = where === "llms.txt" ? text.split("\n") : where.startsWith("llms-full") ? text.split(/\n---\n/) : [text];
    for (const [i, chunk] of chunks.entries()) {
      if (usdAmounts(chunk).some((a) => a.cents > 0) && !TAX_PHRASE.test(chunk)) errors.push(`${where}${chunks.length > 1 ? ` (đoạn ${i + 1}: ${chunk.trim().slice(0, 50)})` : ""}: nêu giá USD mà không nói chưa gồm thuế`);
    }
  }
  return errors;
}

// Trả muộn: hạn sống thật của phiên thanh toán Creem chưa có số đo (spike S6, docs/release/phat-hanh.md mục 9 bước 2g; ta chỉ giữ đơn 30 phút), nên website
// chỉ được nói có điều kiện "nếu bạn trả muộn hơn mà trang vẫn nhận". Khi S6 có số đo thì sửa chữ và nới test này cho khớp kết quả đo.
const LATE_PAY = /(?:trả|thanh toán)\s+(?:muộn|trễ|chậm)|(?:quá|sau)\s+(?:giờ hẹn|hạn)|\bpay(?:ing)?\s+(?:later|late)\b|\bpaid\s+late\b|\bafter\s+(?:the\s+)?(?:deadline|30 minutes)/i;
const LATE_OK = /vẫn\s+(?:được|nhận|hợp lệ|thành công|có hiệu lực|tính)|\bstill\s+(?:works?|counts?|valid|accepted|goes? through|succeeds?)|\bcan still\b/i;
const LATE_CONDITION_VI = "mà trang vẫn nhận";
const LATE_CONDITION_EN = "the page still accepts it";
const LATE_CONDITION = new RegExp(`${LATE_CONDITION_VI}|(?:if|and|when) ${LATE_CONDITION_EN}`, "i");
/** Các câu nói trả muộn vẫn được mà không kèm điều kiện "mà trang vẫn nhận" / "if the page still accepts it". */
const lateAbsoluteHits = (text) => sentencesOf(text).filter((s) => LATE_PAY.test(s) && LATE_OK.test(s) && !LATE_CONDITION.test(s));
const scanLate = (sources) => [...sources].flatMap(([where, text]) => lateAbsoluteHits(text).map((s) => `${where}: nói tuyệt đối trả muộn vẫn được: "${s.slice(0, 120)}"`));

test("ba file llms (llms.txt, llms-full.txt, llms-full.vi.txt) có trong dist, không rỗng, và mọi file llms*.txt của dist đều nằm trong danh sách quét", async () => {
  const onDisk = (await readdir(DIST)).filter((f) => /^llms.*\.txt$/.test(f)).sort();
  assert.deepEqual(onDisk, [...LLMS_FILES].sort(), "dist có file llms khác với LLMS_FILES (thêm hay đổi tên file thì sửa danh sách để các test quét cả site đọc nó)");
  const texts = await siteTexts();
  for (const f of LLMS_FILES) assert.ok((texts.get(f) ?? "").length > 1000, `${f}: rỗng hay quá ngắn`);
});

test("bề mặt chữ ngoài thân trang: pageSources lấy <title>, meta content, alt, aria-label, JSON-LD và mẫu thư mailto: (đã giải mã); trang thật có đủ và siteTexts đưa chúng vào mọi bài quét", async () => {
  const sample = `<!doctype html><html><head><title>Giá &amp; gói &#39;A&#39;</title><meta name="description" content="Mô tả&nbsp;một"><meta property="og:description" content="Mô tả hai"></head>
<body><main><h1>Chữ thân trang</h1><img src="/a.webp" alt="Ảnh &quot;một&quot;"><button aria-label="Mở menu" title="Gợi ý">x</button><a href="mailto:a@b.vn?body=C%C3%A1ch%20tr%E1%BA%A3">thư</a></main>
<script type="application/ld+json">{"@graph":[{"@type":"Offer","description":"Offer mô tả","price":"3.99","priceCurrency":"USD"}]}</script></body></html>`;
  const got = pageSources("/x/", sample);
  assert.ok(got.get("/x/").includes("Chữ thân trang x thư"), got.get("/x/"));
  assert.equal(got.get("/x/ [title]"), "Giá & gói 'A'");
  assert.equal(got.get("/x/ [meta]"), "Mô tả một\nMô tả hai");
  assert.equal(got.get("/x/ [alt]"), 'Ảnh "một"');
  assert.equal(got.get("/x/ [aria-label]"), "Mở menu");
  assert.equal(got.get("/x/ [tooltip]"), "Gợi ý");
  assert.equal(got.get("/x/ [mailto]"), "mailto:a@b.vn?body=Cách trả");
  assert.ok(got.get("/x/ [json-ld]").includes("Offer mô tả") && got.get("/x/ [json-ld]").includes("3.99 USD"), got.get("/x/ [json-ld]"));
  assert.equal(decodeAttr("&amp;lt;b&amp;gt; &#x41;&#66; &copy;"), "&lt;b&gt; AB &copy;");
  // Trang thật: mô tả có thẻ quốc tế, JSON-LD có giá USD, mẫu thư thanh toán nêu cách trả.
  const pricing = pageSources("/en/pricing/", htmlByPath.get("/en/pricing/"));
  assert.match(pricing.get("/en/pricing/ [title]"), /pricing/i);
  assert.match(pricing.get("/en/pricing/ [meta]"), /international card/);
  assert.ok(pricing.get("/en/pricing/ [alt]")?.length > 40, "alt của ảnh Bảng giá");
  assert.ok(pricing.get("/en/pricing/ [aria-label]")?.length > 10, "aria-label của Bảng giá");
  assert.ok(pricing.get("/en/pricing/ [json-ld]")?.includes("3.99 USD"), "JSON-LD của Bảng giá có giá USD");
  assert.ok(pageSources("/lien-he/", htmlByPath.get("/lien-he/")).get("/lien-he/ [mailto]")?.includes("Cách trả (VietQR hoặc thẻ quốc tế)"), "mẫu thư thanh toán ở Liên hệ");
  // siteTexts (nguồn của mọi test quét cả site) phải mang các bề mặt này của MỌI trang, không chỉ thân trang.
  const texts = await siteTexts();
  for (const p of pages) for (const kind of ["title", "meta", "json-ld"]) assert.ok(texts.get(`${p.path} [${kind}]`), `siteTexts thiếu ${p.path} [${kind}]`);
  for (const key of ["/en/pricing/ [alt]", "/en/pricing/ [aria-label]", "/lien-he/ [mailto]"]) assert.ok(texts.get(key), `siteTexts thiếu ${key}`);
});

// Câu PHẢI bắt: các câu cũ đã gỡ, và cách nói khác của cùng ý (lần sửa trước chỉ thử đúng câu cũ nên regex bắt thiếu).
const STALE_MUST_CATCH = [
  "International cards are not yet accepted.", "We only accept VietQR bank transfers.", "Không nhận thẻ quốc tế.", "Chưa hỗ trợ thanh toán bằng thẻ quốc tế.",
  "VND only", "Bank transfer only", "Pay by VietQR only", "Chỉ hỗ trợ VietQR", "Paid in VND by bank transfer from a Vietnamese bank (VietQR)",
  "Only bank transfers from Vietnamese banks, in VND, through PayOS.",
  "Không nhận thẻ quốc\u00a0tế.", "Chỉ\u00a0hỗ trợ VietQR",
  "Chỉ trả bằng VietQR", "Chỉ thanh toán bằng chuyển khoản", "Hiện chưa có thẻ quốc tế.", "Chưa có Visa hay Mastercard.", "Chúng tôi chưa nhận thẻ quốc tế.", "Giá chỉ bằng VND.",
  "Please note that we accept only bank transfers.", "Payment is available through PayOS only.", "Pay in VND (VietQR) only.", "Bank transfers only from Vietnamese banks.",
  "International card payment is not available yet.", "International cards are currently not supported.", "No international cards and no e-invoices yet.",
  "You cannot buy a paid plan today.", "Không có tài khoản ngân hàng Việt Nam thì hiện chưa mua được gói trả phí.", "Selling outside Vietnam, with international payments", "Bán ra nước ngoài, kèm thanh toán quốc tế",
  // Đơn thẻ không được giữ 30 phút (lượt sửa trước vừa bỏ câu này khỏi Bảng giá: khách trả ở phút 35 tưởng đơn mất).
  "Đơn được giữ 30 phút.", "Đơn được giữ trong 30 phút để bạn trả.", "The order is kept for 30 minutes.", "The order stays open for 30 minutes.",
];
// Câu KHÔNG được bắt: câu đúng về giới hạn còn lại của thẻ, câu mô tả VietQR, câu hướng dẫn đang dùng trên website.
const STALE_MUST_KEEP = [
  "There is no international card fee", "International cards issued in Russia are not accepted by Creem", "Creem không nhận thẻ quốc tế phát hành ở Nga.", "Thẻ quốc tế: giá chưa gồm thuế",
  "Thẻ không nhận được ở một số nước, theo danh sách của Creem.", "Cards are not accepted in some countries, per Creem's list.",
  "VietQR chỉ dùng được với tài khoản ngân hàng Việt Nam, bằng VND, qua PayOS; nếu thẻ quốc tế chưa được bán lúc này mà bạn không có tài khoản đó, hãy liên hệ hỗ trợ.",
  "VietQR works only with a Vietnamese bank account, in VND, through PayOS; if card payment is not available right now and you have no such account, contact support.",
  "Creem không nhận người mua từ một số nước, nên ở đó chưa mua được gói trả phí bằng thẻ; hãy dùng VietQR.", "Creem does not accept buyers from some countries, so there you cannot buy a paid plan by card.",
  "thẻ quốc tế chưa được bán lúc này", "card payment is not available right now", "VietQR chỉ dùng được với tài khoản ngân hàng Việt Nam", "VietQR works only with a Vietnamese bank account",
  "VietQR only works with a Vietnamese bank account.", "Nếu bạn chưa có thẻ quốc tế, hãy chọn VietQR.", "Chỉ nhận thanh toán bằng VietQR hoặc thẻ quốc tế.",
  "Pay in VND by VietQR from a Vietnamese bank account, or in USD by international card (Monthly $3.99, excluding tax).", "Paid in VND by bank transfer (VietQR) or in USD by international card.",
  "Apple Pay or Google Pay are available only when Creem's payment page shows that option.", "Không có PayPal.",
  "Hãy trả trong 30 phút. Nếu bạn đã trả, key sẽ gửi qua email; đừng trả lại.", "Pay within 30 minutes. If you have paid, your key will be sent by email; do not pay again.", "The code works for 15 minutes.",
];

test("luật câu cũ (staleHits) là hàm thuần: bắt ≥ 10 câu cũ và cách nói khác, không bắt câu đúng; chữ của app (kể cả upgrade.bankOnly) không bị bắt", async () => {
  assert.ok(STALE_MUST_CATCH.length >= 10 && STALE_MUST_KEEP.length >= 5);
  const missed = STALE_MUST_CATCH.filter((s) => staleHits(s).length === 0);
  assert.deepEqual(missed, [], "câu cũ mà luật không bắt");
  const extra = STALE_MUST_KEEP.filter((s) => staleHits(s).length > 0).map((s) => `${s} → ${staleHits(s).map((h) => h.id).join(", ")}`);
  assert.deepEqual(extra, [], "câu đúng mà luật bắt thừa");
  // Chữ thật của app trên màn hình Nâng cấp (và mọi chuỗi khác) là chữ đúng: không luật nào được bắt. upgrade.bankOnly phải có (đừng để test xanh vì khóa đổi tên).
  for (const lang of ["vi", "en"]) {
    const d = await appDict(lang);
    assert.ok(d["upgrade.bankOnly"], `${lang}: không đọc được upgrade.bankOnly`);
    const bad = Object.entries(d).filter(([, v]) => staleHits(v).length > 0).map(([k, v]) => `${lang} ${k}: ${v}`);
    assert.deepEqual(bad, [], "chuỗi của app mà luật câu cũ bắt");
  }
  // Mỗi bề mặt của một trang ảo (dạng chuỗi) mang một câu cũ: scanStale phải báo đủ từng bề mặt, kể cả llms*.
  const fake = `<!doctype html><html><head><title>Chỉ nhận VietQR, không nhận thẻ quốc tế</title><meta name="description" content="International cards are not accepted yet. Monthly $4.99.">
<meta property="og:title" content="x"></head><body><main><p>Đơn được giữ 30 phút.</p><img src="/a.webp" alt="Ảnh: VND only"><a aria-label="Bank transfer only" href="mailto:a@b.vn?body=Ch%E1%BB%89%20h%E1%BB%97%20tr%E1%BB%A3%20VietQR">x</a></main>
<script type="application/ld+json">{"@graph":[{"description":"We only accept VietQR bank transfers."}]}</script></body></html>`;
  const flagged = new Set(scanStale(pageSources("/trang-ao/", fake)).map((e) => e.split(": còn câu cũ")[0]));
  for (const where of ["/trang-ao/", "/trang-ao/ [title]", "/trang-ao/ [meta]", "/trang-ao/ [alt]", "/trang-ao/ [aria-label]", "/trang-ao/ [mailto]", "/trang-ao/ [json-ld]"]) assert.ok(flagged.has(where), `scanStale bỏ sót ${where}`);
  assert.equal(scanStale(new Map([["llms-full.vi.txt", "Bốn gói.\nChỉ nhận VietQR.\n"]])).length, 1, "scanStale đọc file llms");
});

test("không nguồn chữ nào của site (thân trang, <title>, mô tả, alt, aria-label, JSON-LD, mẫu thư, ba file llms) còn câu cũ nói chưa có thẻ quốc tế hay chỉ nhận VietQR", async () => {
  assert.deepEqual(scanStale(await siteTexts()), []);
});

// Báo cáo lỗi tự động (spec 2026-10-17-diagnostics-reports-design): app tự gửi báo cáo lỗi đã che dữ liệu cá nhân, nên website và chính sách
// không được còn nói "app không tự gửi báo cáo lỗi hay log, bạn tự quyết có gửi". Mỗi luật chỉ bắt đúng ý cũ đó, không bắt câu mới
// nói app có gửi (xem STALE_REPORTS_MUST_KEEP).
const STALE_REPORTS = [
  { id: "vi: không tự gửi báo cáo lỗi hay log", re: /không\s+tự\s+gửi\s+(?:báo cáo|log|nhật ký)/iu },
  { id: "vi: không gửi báo cáo lỗi tự động", re: /không\s+(?:có\s+)?gửi\s+báo cáo(?:\s+lỗi)?\s+tự động/iu },
  { id: "vi: app không tự gửi gì", re: /app\s+không\s+tự\s+gửi\s+gì/iu },
  { id: "vi: bạn tự quyết có gửi hay không", re: /bạn\s+tự\s+quyết(?:\s+định)?\s+có\s+gửi/iu },
  { id: "vi: bạn tự gửi cho chúng tôi", re: /bạn\s+tự\s+gửi\s+cho\s+chúng\s+tôi/iu },
  { id: "vi: log chỉ nằm trên máy", re: /\blog\s+chỉ\s+nằm\s+trên\s+máy/iu },
  { id: "en: sends no automatic crash reports", re: /\b(?:sends?|has)\s+no\s+automatic\s+(?:crash|error)\s+reports\b/i },
  { id: "en: no automatic crash reports", re: /\bno\s+automatic\s+(?:crash|error)\s+reports\b/i },
  { id: "en: never sends logs or anything by itself", re: /\bnever\s+sends?\s+(?:logs?|anything)\b/i },
  { id: "en: you decide whether to send logs", re: /\byou\s+decide\s+whether\s+to\s+send\s+(?:them|the\s+logs?|logs?)\b/i },
  { id: "en: you send them to us yourself", re: /\byou\s+send\s+them\s+to\s+us\s+yourself\b/i },
  { id: "en: logs stay on your computer", re: /\blogs?\s+stay\s+on\s+(?:your|this)\s+(?:computer|machine)\b/i },
];

// Câu cũ (nguyên văn từ website, chính sách 1.2 và chuỗi giao diện trước khi có báo cáo lỗi tự động) mà luật phải bắt.
const STALE_REPORTS_MUST_CATCH = [
  "App không có quảng cáo, không có analytics, không tự gửi báo cáo lỗi.",
  "App không có analytics và không gửi báo cáo lỗi tự động.",
  "Không. Log không chứa âm thanh hay nội dung chép lời, và app không tự gửi log đi đâu.",
  "App không tự gửi gì: bạn tự quyết có gửi cho hỗ trợ hay không.",
  "Log nằm trên máy bạn và không chứa nội dung chép lời; bạn tự quyết định có gửi hay không.",
  "Lưu trên máy bạn, không chứa nội dung chép lời. Khi cần hỗ trợ, bạn tự gửi cho chúng tôi nếu muốn",
  "Log chỉ nằm trên máy này và không bao giờ chứa nội dung cuộc họp.",
  "Ứng dụng không có tài khoản đăng nhập, không có quảng cáo, không có analytics, không gửi báo cáo lỗi tự động.",
  "The app has no ads, no analytics and sends no automatic crash reports.",
  "The app has no sign-in accounts, no advertising, no analytics, and no automatic crash reports.",
  "Logs contain no audio and no transcript text, and the app never sends logs anywhere by itself.",
  "The app never sends anything by itself: you decide whether to send them to support.",
  "Logs stay on your computer and never contain what was said; you decide whether to send them.",
  "Stored on your computer; they do not contain transcript text. If you want support, you send them to us yourself",
  "Stored on your computer and free of transcript content. You decide whether to send them to us.",
];
// Câu đúng của bản mới (nói app có gửi) mà luật KHÔNG được bắt.
const STALE_REPORTS_MUST_KEEP = [
  "Khi app gặp lỗi, nó tự gửi một báo cáo lỗi đã che dữ liệu cá nhân.",
  "Bạn tắt được ở Cài đặt › Quyền riêng tư.",
  "Log không chứa âm thanh hay nội dung chép lời.",
  "Ứng dụng không có tài khoản đăng nhập, không có quảng cáo và không có analytics.",
  "Chỉ phần log liên quan đến một lỗi rời máy, trong báo cáo lỗi đã che dữ liệu cá nhân.",
  "The app has no sign-in accounts, no advertising and no analytics.",
  "When the app hits an error, it sends us the relevant part of the log.",
  "Logs never contain what was said, and personal data is scrubbed before sending.",
  "Audio never leaves your computer.",
];

test("luật câu cũ về báo cáo lỗi (STALE_REPORTS) bắt các câu cũ đã gỡ và không bắt câu đúng của bản mới", () => {
  assert.ok(STALE_REPORTS_MUST_CATCH.length >= 10 && STALE_REPORTS_MUST_KEEP.length >= 5);
  const missed = STALE_REPORTS_MUST_CATCH.filter((s) => staleHits(s, STALE_REPORTS).length === 0);
  assert.deepEqual(missed, [], "câu cũ mà luật không bắt");
  const extra = STALE_REPORTS_MUST_KEEP.filter((s) => staleHits(s, STALE_REPORTS).length > 0).map((s) => `${s} → ${staleHits(s, STALE_REPORTS).map((h) => h.id).join(", ")}`);
  assert.deepEqual(extra, [], "câu đúng mà luật bắt thừa");
});

test("không nguồn chữ nào của site (kể cả chính sách dựng từ docs/legal) và không chuỗi giao diện nào của app (vi, en) còn câu nói app không tự gửi báo cáo lỗi hay log", async () => {
  assert.deepEqual(scanStale(await siteTexts(), STALE_REPORTS), []);
  for (const lang of ["vi", "en"]) {
    const d = await appDict(lang);
    assert.ok(Object.keys(d).length > 100, `${lang}: không đọc được từ điển của app`);
    const bad = Object.entries(d).filter(([, v]) => staleHits(v, STALE_REPORTS).length > 0).map(([k, v]) => `${lang} ${k}: ${v}`);
    assert.deepEqual(bad, [], "chuỗi của app còn câu cũ về báo cáo lỗi (kế hoạch bao-cao-loi-04 phải sửa, cả ja, zh, ko: luật này chỉ đọc vi và en)");
  }
});

// ---- Gõ dịch (spec 2026-10-17-go-dich): website nói đúng tính năng mới, trích đúng chữ của app, không còn câu cũ ----

// Câu cũ đã gỡ khi có Gõ dịch: số phím tắt, "cần đúng một quyền" trên macOS, "dịch một chiều" nói chung (phụ đề vẫn một chiều,
// nhưng tin nhắn gõ thì dịch được qua Gõ dịch: câu nói một chiều phải nói rõ là phụ đề).
const STALE_COMPOSE = [
  { id: "vi: năm phím tắt", re: /năm\s+phím\s+tắt|liệt\s+kê\s+năm\s+việc/iu },
  { id: "en: five shortcuts", re: /\bfive\s+(?:global\s+|default\s+)?shortcuts\b|\bfive\s+actions\b/i },
  { id: "vi: cần đúng một quyền", re: /cần\s+đúng\s+một\s+quyền/iu, unless: /dịch\s+phụ\s+đề/iu },
  { id: "en: exactly one permission", re: /\bexactly\s+one\s+(?:macOS\s+)?permission\b/i, unless: /\bsubtitles?\b/i },
  { id: "vi: chỉ quyền Ghi âm thanh hệ thống", re: /^Chỉ\s+quyền\s+Ghi\s+âm\s+thanh\s+hệ\s+thống/iu },
  { id: "en: only System Audio Recording permission", re: /^Only\s+System\s+Audio\s+Recording\s+permission/i },
  { id: "vi: dịch một chiều (không nói phụ đề)", re: /dịch\s+một\s+chiều|^một\s+chiều\b/iu, unless: /phụ\s+đề/iu },
  { id: "en: one way (without subtitles)", re: /\b(?:works?|translates?)\s+(?:in\s+)?one\s+(?:way|direction)\b|^one\s+(?:way|direction)\b/i, unless: /\bsubtitles?\b/i },
];
const STALE_COMPOSE_MUST_CATCH = [
  "Năm phím tắt toàn cục hoạt động ngay cả khi AI Translator không phải cửa sổ đang mở.",
  "Cài đặt Phím tắt liệt kê năm việc cùng tổ hợp phím mặc định trên macOS.",
  "Five global shortcuts work even when AI Translator is not the window in front.",
  "Shortcuts settings listing the five actions with their default macOS key combinations.",
  "AI Translator cần đúng một quyền trên macOS: Ghi âm thanh hệ thống.",
  "AI Translator needs exactly one macOS permission: System Audio Recording.",
  "Chỉ quyền Ghi âm thanh hệ thống (System Audio Recording); AI Translator không dùng micro.",
  "Only System Audio Recording permission; AI Translator does not use the microphone.",
  "Chưa. AI Translator dịch một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn.",
  "Not yet. AI Translator works one way, from the audio playing on your computer into your language.",
  "Một chiều, sang ngôn ngữ bạn chọn",
  "One way, into the language you choose",
];
const STALE_COMPOSE_MUST_KEEP = [
  "Sáu phím tắt toàn cục hoạt động ngay cả khi AI Translator không phải cửa sổ đang mở.",
  "Để dịch phụ đề, AI Translator cần đúng một quyền trên macOS: Ghi âm thanh hệ thống.",
  "For subtitles, AI Translator needs exactly one macOS permission: System Audio Recording.",
  "Phụ đề của AI Translator dịch một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn.",
  "AI Translator subtitles work one way, from the audio playing on your computer into your language.",
  "Dịch hai chiều bằng giọng nói, để giọng của bạn cũng được dịch cho người cùng họp.",
];

test("luật câu cũ về Gõ dịch (STALE_COMPOSE) bắt câu cũ và không bắt câu đúng", () => {
  const missed = STALE_COMPOSE_MUST_CATCH.filter((s) => staleHits(s, STALE_COMPOSE).length === 0);
  assert.deepEqual(missed, [], "câu cũ mà luật không bắt");
  const extra = STALE_COMPOSE_MUST_KEEP.filter((s) => staleHits(s, STALE_COMPOSE).length > 0).map((s) => `${s} → ${staleHits(s, STALE_COMPOSE).map((h) => h.id).join(", ")}`);
  assert.deepEqual(extra, [], "câu đúng mà luật bắt thừa");
});

test("không nguồn chữ nào của site còn câu cũ về số phím tắt, số quyền trên macOS hay 'dịch một chiều' không nói rõ là phụ đề", async () => {
  assert.deepEqual(scanStale(await siteTexts(), STALE_COMPOSE), []);
});

// Chữ của app có "&" (Type & Translate): textOf đổi thực thể HTML thành khoảng trắng, nên so cả hai phía sau khi bỏ "&".
const plainAmp = (s) => s.replace(/&/g, " ").replace(/\s+/g, " ").trim();

test("Gõ dịch: hướng dẫn trích đúng chữ trên ô soạn và ở Cài đặt › Gõ dịch của app (từ điển i18n vi và en)", async () => {
  const keys = [
    "compose.title", "compose.loading", "compose.translating", "compose.permission", "compose.permission.allow", "compose.permission.copyOnly",
    "settings.group.compose", "settings.compose.enabled", "settings.compose.target", "settings.compose.target.hint", "settings.compose.autoPaste",
    "settings.compose.permission", "settings.compose.permission.granted", "settings.compose.permission.open", "hotkeys.compose",
    "error.composeTooLong", "error.composeFailed",
  ];
  const errors = [];
  for (const [lang, path] of [["vi", "/huong-dan/go-dich/"], ["en", "/en/guide/type-and-translate/"]]) {
    const d = await appDict(lang);
    const text = plainAmp(textOf(htmlByPath.get(path)));
    for (const k of keys) {
      if (!d[k]) errors.push(`${lang}: không đọc được khóa ${k} của từ điển app`);
      else if (!text.includes(plainAmp(blanked(d[k])))) errors.push(`${path}: không trích "${blanked(d[k])}" (${k})`);
    }
  }
  assert.deepEqual(errors, []);
});

test("Gõ dịch: các trang nêu phím tắt, mọi gói, không trừ thời lượng, quyền Trợ năng, chữ gõ không rời máy", () => {
  const need = {
    "/huong-dan/go-dich/": ["⌃⌥G", "Ctrl+Alt+G", "Mọi gói còn hiệu lực", "không trừ thời lượng dịch", "không bao giờ dán câu gốc", "Trợ năng", "clipboard", "chưa thử ở từng app chat"],
    "/en/guide/type-and-translate/": ["⌃⌥G", "Ctrl+Alt+G", "Every active plan", "does not use translation time", "never pastes your original text", "Accessibility", "clipboard", "not yet tried every chat app"],
    "/": ["Trả lời bằng tiếng của người bên kia", "không trừ thời lượng dịch"],
    "/en/": ["Reply in the other person's language", "does not use translation time"],
    "/tinh-nang/": ["Sáu phím tắt toàn cục", "Mở hoặc đóng ô soạn Gõ dịch", "không trừ"],
    "/en/features/": ["Six global shortcuts", "Open or close the Type", "does not use"],
    "/bang-gia/": ["Gõ dịch tin nhắn (không trừ thời lượng dịch)"],
    "/en/pricing/": ["for chat messages (does not use translation time)"],
    "/huong-dan/thanh-phu-de-va-phim-tat/": ["Mở hoặc đóng ô soạn Gõ dịch"],
    "/en/guide/subtitle-bar-and-shortcuts/": ["Open or close the Type"],
    "/cau-hoi-thuong-gap/": ["Gõ dịch là gì?", "không tính vào thời lượng", "⌃⌥G (Ctrl+Alt+G)", "quyền Trợ năng"],
    "/en/faq/": ["What is Type", "are not counted", "⌃⌥G (Ctrl+Alt+G)", "Accessibility permission"],
    "/bao-mat-du-lieu/": ["Chữ bạn gõ ở Gõ dịch và bản dịch của nó", "quyền Trợ năng"],
    "/en/data-security/": ["Translate and its translation", "Accessibility permission"],
    "/huong-dan/khac-phuc-su-co/": ["Đã chép bản dịch. Muốn app tự dán, hãy cấp quyền Trợ năng cho AI Translator."],
    "/en/guide/troubleshooting/": ["Translation copied. To let AI Translator paste it for you, allow it in Accessibility."],
    "/huong-dan/": ["Gõ dịch tin nhắn"],
    "/en/guide/": ["Ten step-by-step guides"],
  };
  const errors = Object.entries(need).flatMap(([path, needles]) => needsIn(path, textOf(htmlByPath.get(path) ?? ""), needles));
  assert.deepEqual(errors, []);
});

test("chính sách quyền riêng tư: Gõ dịch ở mục 2, 3 (dữ liệu trên máy, clipboard, quyền Trợ năng), 4 (không kết nối nào mang chữ gõ) và 10 (báo cáo không gồm chữ gõ)", () => {
  const errors = [
    ...sectionErrors("/chinh-sach-quyen-rieng-tu/", {
      2: ["Chữ bạn gõ ở Gõ dịch", "không được gửi đi và không được ghi xuống đĩa"],
      3: ["Chữ bạn gõ ở Gõ dịch và bản dịch của nó", "clipboard", "Trợ năng", "không đọc chữ, nội dung hay clipboard của ứng dụng khác"],
      4: ["hay chữ bạn gõ ở Gõ dịch"],
      10: ["chữ bạn gõ ở Gõ dịch"],
    }),
    ...sectionErrors("/en/privacy/", {
      2: ["Text you type in Type", "it is not sent anywhere and not written to disk"],
      3: ["Translate and its translation", "clipboard", "Accessibility", "does not read text, content or the clipboard of other apps"],
      4: ["or text you type in Type"],
      10: ["text typed in Type"],
    }),
  ];
  assert.deepEqual(errors, []);
});

test("luật giá USD (usdAmounts): đọc đúng '3.99 USD' (en) và '$3,99' (vi), bắt 'US$ 4.99', '4.99$', 'USD 3.99', '1,000 USD', 'đô la'; không nhầm tên cột kế bên là giá", () => {
  const cents = (s) => [...new Set(usdAmounts(s).map((a) => a.cents))].sort((a, b) => a - b);
  for (const [text, want] of [
    ["3.99 USD", [399]], ["$3,99", [399]], ["3,99 USD", [399]], ["$3.99", [399]], ["21,99 USD", [2199]], ["$39.99/month", [3999]], ["0.00 USD", [0]],
    ["US$ 4.99", [499]], ["4.99$", [499]], ["USD 3.99", [399]], ["$ 4.99", [499]], ["1,000 USD", [100000]], ["4,99 đô la", [499]], ["4.99 US dollars", [499]],
    ["hoặc 3,99 USD 6 Months 21,99 USD", [399, 2199]], ["bằng USD (Monthly 3,99 USD)", [399]], ["Prices in USD.", []],
  ]) assert.deepEqual(cents(text), want, text);
  assert.equal(scanUsd(new Map([["x", "Monthly US$ 4.99, Yearly 4.99$ và 1,000 USD"]])).length, 3, "ba giá lạ phải bị báo");
  assert.deepEqual(scanUsd(new Map([["x", "Monthly 3.99 USD, 6 Months $21,99, Yearly USD 39.99"]])), []);
});

test("mọi giá USD nêu trên website (thân trang, bề mặt, JSON-LD, ba file llms, mô tả ảnh trong manifest) là giá của một gói trong plans.mjs (hoặc 0 của gói Free)", async () => {
  const sources = await siteTexts();
  const manifest = JSON.parse(await readFile(path.join(ROOT, "src/assets/img/app/manifest.json"), "utf8"));
  for (const e of manifest) sources.set(`manifest.json ${e.file}`, e.description ?? "");
  assert.deepEqual(scanUsd(sources), []);
});

test("trả muộn (spike S6 chưa đo hạn sống của phiên Creem): chỉ được nói 'trả muộn hơn mà trang vẫn nhận'; không nơi nào viết tuyệt đối 'trả muộn vẫn được'", async () => {
  for (const s of ["Trả muộn vẫn được.", "Nếu bạn trả muộn hơn thì khoản trả vẫn được ghi nhận.", "Trả quá giờ hẹn vẫn nhận.", "You can still pay late.", "Paying later still works.", "If you pay later, your payment still counts."]) {
    assert.equal(lateAbsoluteHits(s).length, 1, `phải bắt: ${s}`);
  }
  for (const s of [
    "Nếu bạn trả muộn hơn mà trang vẫn nhận, key vẫn gửi qua email; đã trả thì đừng trả lại.",
    "If you pay later and the page still accepts it, your key is still emailed; if you have paid, do not pay again.",
    "Đã quá giờ hẹn trả…: đừng trả lại; key vẫn gửi qua email.", "Hãy trả trong 30 phút.",
  ]) assert.deepEqual(lateAbsoluteHits(s), [], `không được bắt: ${s}`);
  assert.deepEqual(scanLate(await siteTexts()), []);
  // Điều kiện nằm ở cả hai bước trả thẻ của hướng dẫn mua gói (các bước trong bài và HowTo JSON-LD), vi và en.
  const errors = [];
  for (const [lang, g] of Object.entries(BUY_GUIDE)) {
    const cond = lang === "vi" ? LATE_CONDITION_VI : LATE_CONDITION_EN;
    const graph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(htmlByPath.get(g.path))[1])["@graph"];
    const howTo = graph.find((n) => n["@type"] === "HowTo")?.step.map((s) => `${s.name} ${s.text}`).join(" ") ?? "";
    errors.push(...needsIn(`${g.path} (các bước)`, guideSection(g.path, g.steps), [cond]), ...needsIn(`${g.path} (HowTo)`, howTo, [cond]));
  }
  assert.deepEqual(errors, []);
});

test("hướng dẫn mua gói cho xem đủ ba ảnh màn hình Nâng cấp: danh sách gói, mã VietQR và đơn thẻ quốc tế", () => {
  const errors = [];
  for (const [urlPath, lang] of [["/huong-dan/mua-va-kich-hoat-key/", "vi"], ["/en/guide/buy-and-activate/", "en"]]) {
    const html = htmlByPath.get(urlPath);
    for (const slug of ["app-upgrade", "app-upgrade-qr", "app-upgrade-card"]) {
      if (!html.includes(`/assets/img/app/${slug}.${lang}.webp`)) errors.push(`${urlPath}: thiếu ảnh ${slug}.${lang}.webp`);
    }
  }
  assert.deepEqual(errors, []);
});

test("manifest ảnh app: mọi ảnh trang dùng đều có mục, mỗi mục có file thật, đúng dung lượng và có mô tả", async () => {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "src/assets/img/app/manifest.json"), "utf8"));
  const byFile = new Map(manifest.map((e) => [e.file, e]));
  const errors = [];
  for (const [urlPath, html] of htmlByPath) {
    for (const m of html.matchAll(/src="\/assets\/img\/app\/([^"?]+)/g)) if (!byFile.has(m[1])) errors.push(`${urlPath}: ${m[1]} chưa có trong manifest.json`);
  }
  for (const e of manifest) {
    const file = path.join(ROOT, "src/assets/img/app", e.file);
    if (!(await exists(file))) {
      errors.push(`${e.file}: không có file`);
      continue;
    }
    const size = (await stat(file)).size;
    if (size !== e.bytes) errors.push(`${e.file}: manifest ghi ${e.bytes} B nhưng file có ${size} B (chạy lại scripts/ui-preview/shoot.mjs)`);
    if (!e.description || e.description.length < 40) errors.push(`${e.file}: thiếu mô tả`);
  }
  assert.deepEqual(errors, []);
});

test("JSON-LD SoftwareApplication của mọi trang có nó: bốn Offer VND (kể cả 6 Months 269000 ₫ trong 180 ngày) và ba Offer USD đúng từng gói trong plans.mjs, Offer USD nói giá chưa gồm thuế", () => {
  const errors = [];
  let checked = 0;
  for (const page of pages) {
    const graph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(htmlByPath.get(page.path))[1])["@graph"];
    const app = graph.find((n) => n["@type"] === "SoftwareApplication");
    if (!app) continue;
    checked += 1;
    const en = page.lang === "en";
    const pricingUrl = SITE.origin + (en ? "/en/pricing/" : "/bang-gia/");
    const offers = app.offers ?? [];
    const inVnd = offers.filter((o) => o.priceCurrency === "VND");
    const inUsd = offers.filter((o) => o.priceCurrency === "USD");
    if (inVnd.length !== PLANS.length || inUsd.length !== PLANS.length - 1 || offers.length !== inVnd.length + inUsd.length) {
      errors.push(`${page.path}: ${inVnd.length} Offer VND, ${inUsd.length} Offer USD, ${offers.length} Offer (cần ${PLANS.length}, ${PLANS.length - 1}, ${2 * PLANS.length - 1})`);
    }
    const check = (o, plan, want) => {
      if (!o) return;
      const nm = en ? plan.nameEn : plan.nameVi;
      const summary = en ? plan.summaryEn : plan.summaryVi;
      if (o.price !== want.price) errors.push(`${page.path}: ${want.tag} ${plan.nameEn}: price ${o.price}, cần ${want.price}`);
      if (o.eligibleDuration?.value !== plan.days || o.eligibleDuration?.unitCode !== "DAY") errors.push(`${page.path}: ${want.tag} ${plan.nameEn}: eligibleDuration ${JSON.stringify(o.eligibleDuration)}, cần ${plan.days} DAY`);
      if (o.availability !== "https://schema.org/InStock") errors.push(`${page.path}: ${want.tag} ${plan.nameEn}: availability ${o.availability}`);
      if (o.url !== pricingUrl) errors.push(`${page.path}: ${want.tag} ${plan.nameEn}: url ${o.url}, cần ${pricingUrl}`);
      if (plan.priceVnd > 0 && !o.name?.startsWith(nm)) errors.push(`${page.path}: ${want.tag} ${plan.nameEn}: name "${o.name}" không bắt đầu bằng "${nm}"`);
      if (!o.description?.startsWith(summary)) errors.push(`${page.path}: ${want.tag} ${plan.nameEn}: description không bắt đầu bằng mô tả gói trong plans.mjs`);
    };
    PLANS.forEach((plan, i) => check(inVnd[i], plan, { tag: "VND", price: String(plan.priceVnd) }));
    PLANS.filter((x) => x.priceUsdCents > 0).forEach((plan, i) => {
      check(inUsd[i], plan, { tag: "USD", price: (plan.priceUsdCents / 100).toFixed(2) });
      // Bản tóm tắt cho công cụ tìm kiếm và trợ lý AI chỉ thấy Offer này: giá USD phải tự nói chưa gồm thuế (W2), không dựa vào chú thích trên trang.
      if (inUsd[i] && !TAX_PHRASE.test(inUsd[i].description ?? "")) errors.push(`${page.path}: Offer USD ${plan.nameEn} không nói giá chưa gồm thuế: ${inUsd[i].description}`);
      if (inUsd[i] && inUsd[i].name !== `${en ? plan.nameEn : plan.nameVi} (USD)`) errors.push(`${page.path}: Offer USD ${plan.nameEn}: name "${inUsd[i].name}"`);
    });
    const six = inVnd.find((o) => /6 Months/.test(o.name));
    if (!six || six.price !== "269000" || six.eligibleDuration?.value !== 180) errors.push(`${page.path}: Offer 6 Months sai: ${JSON.stringify(six)}`);
  }
  assert.ok(checked >= 8, `chỉ ${checked} trang có SoftwareApplication (cần ít nhất 8: Trang chủ, Tính năng, Bảng giá, Tải xuống, mỗi trang hai ngôn ngữ)`);
  assert.deepEqual(errors, []);
});

test("llms.txt nêu giá cả ba gói trả phí (VND và USD) theo đúng tên gói, lấy từ plans.mjs, USD kèm 'excluding tax', và hai cách trả", async () => {
  const llms = await readFile(path.join(DIST, "llms.txt"), "utf8");
  const line = llms.split("\n").find((l) => l.startsWith("- Pricing:")) ?? "";
  const paid = PLANS.filter((x) => x.priceVnd > 0);
  for (const p of paid) {
    assert.ok(line.includes(`${p.nameEn} ${vnd(p.priceVnd)}`), `llms.txt: thiếu "${p.nameEn} ${vnd(p.priceVnd)}" trong: ${line}`);
    // Tên gói đứng ngay trước giá USD của nó (đảo giá Monthly và Yearly thì test báo).
    assert.ok(line.includes(`${p.nameEn} ${usd(p.priceUsdCents, "en")}`), `llms.txt: thiếu "${p.nameEn} ${usd(p.priceUsdCents, "en")}" trong: ${line}`);
  }
  // Cả ba giá USD nằm trong một ngoặc đơn kết thúc bằng "excluding tax" (bản tóm tắt cho trợ lý AI không được nêu "$3.99" như giá cuối).
  const group = `(${paid.map((p) => `${p.nameEn} ${usd(p.priceUsdCents, "en")}`).join(", ")}, excluding tax)`;
  assert.ok(line.includes(group), `llms.txt: thiếu nhóm giá USD "${group}" trong: ${line}`);
  assert.ok(/VietQR/.test(line) && /international card/.test(line), `llms.txt: phải nêu cả VietQR và thẻ quốc tế: ${line}`);
  assert.ok(!/only from Vietnamese bank accounts|payment only/i.test(line), `llms.txt: còn câu cũ "chỉ ngân hàng Việt Nam": ${line}`);
  // Cả ba file llms đều nêu đủ ba giá USD (llms-full.vi.txt theo định dạng tiếng Việt); trước đây không test nào đọc hai file llms-full.
  for (const f of LLMS_FILES) {
    const text = await readFile(path.join(DIST, f), "utf8");
    assert.ok(paid.every((p) => text.includes(usd(p.priceUsdCents, f === "llms-full.vi.txt" ? "vi" : "en"))), `${f}: không nêu đủ ba giá USD của gói trả phí`);
  }
});

// Ảnh app-upgrade* trên website chụp từ trang xem trước chạy IPC giả (scripts/ui-preview/tauri-mock.ts). Đổi giá mà không sửa mock và chụp lại
// thì ảnh nêu giá cũ (I4-W17): bảng giá của mock phải khớp plans.mjs.
const MOCK_FILE = path.join(ROOT, "..", "scripts", "ui-preview", "tauri-mock.ts");

/** Lỗi khi bảng giá (`PRICES`: gói → [VND, cent USD]) và bảng gói (`plansView`: tên, hạn mức, số ngày) trong mã nguồn mock lệch plans.mjs. Hàm thuần trên chuỗi. */
function mockPlanErrors(src) {
  const errors = [];
  const paid = PLANS.filter((p) => p.priceVnd > 0);
  const block = /const PRICES\b[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src)?.[1] ?? "";
  const prices = new Map([...block.matchAll(/(\w+):\s*\[\s*(\d[\d_]*)\s*,\s*(\d[\d_]*)\s*\]/g)].map((m) => [m[1], [Number(m[2].replaceAll("_", "")), Number(m[3].replaceAll("_", ""))]]));
  if (prices.size === 0) errors.push("không đọc được bảng PRICES (đổi dạng thì sửa test này)");
  for (const p of paid) {
    const got = prices.get(p.code);
    if (!got) errors.push(`PRICES thiếu gói ${p.code}`);
    else {
      if (got[0] !== p.priceVnd) errors.push(`PRICES ${p.code}: giá VND ${got[0]}, plans.mjs ${p.priceVnd}`);
      if (got[1] !== p.priceUsdCents) errors.push(`PRICES ${p.code}: giá USD ${got[1]} cent, plans.mjs ${p.priceUsdCents}`);
    }
  }
  for (const code of prices.keys()) if (!paid.some((p) => p.code === code)) errors.push(`PRICES có gói lạ ${code}`);
  const offers = new Map([...src.matchAll(/\{ code: "(\w+)", name: "([^"]+)", quota_minutes_per_cycle: (\d+|null), days_per_order: (\d+) \}/g)].map((m) => [m[1], { name: m[2], quota: m[3] === "null" ? null : Number(m[3]), days: Number(m[4]) }]));
  if (offers.size === 0) errors.push("không đọc được bảng gói của plansView (đổi dạng thì sửa test này)");
  for (const p of paid) {
    const got = offers.get(p.code);
    if (!got) errors.push(`plansView thiếu gói ${p.code}`);
    else if (got.name !== p.nameEn || got.quota !== p.minutesPerCycle || got.days !== p.days) errors.push(`plansView ${p.code}: ${JSON.stringify(got)}, plans.mjs ${JSON.stringify({ name: p.nameEn, quota: p.minutesPerCycle, days: p.days })}`);
  }
  for (const code of offers.keys()) if (!paid.some((p) => p.code === code)) errors.push(`plansView có gói lạ ${code}`);
  return errors;
}

test("mock IPC của trang xem trước (nguồn ảnh app-upgrade*): giá VND, giá USD, hạn mức và số ngày của từng gói khớp plans.mjs; lệch thì báo (đổi giá thì sửa mock và chụp lại ảnh)", async () => {
  const src = await readFile(MOCK_FILE, "utf8");
  assert.deepEqual(mockPlanErrors(src), []);
  // Đột biến trong bộ nhớ (không ghi file): mỗi kiểu lệch phải báo.
  for (const [why, from, to] of [
    ["giá USD Monthly lệch", "[50_000, 399]", "[50_000, 499]"],
    ["giá VND 6 Months lệch", "[269_000, 2_199]", "[259_000, 2_199]"],
    ["giá USD Yearly lệch", "3_999", "4_999"],
    ["hạn mức Monthly lệch", "quota_minutes_per_cycle: 3000", "quota_minutes_per_cycle: 6000"],
    ["số ngày Yearly lệch", "days_per_order: 365", "days_per_order: 360"],
    ["mất bảng PRICES", "const PRICES", "const PRICES_MOI"],
  ]) {
    assert.ok(src.includes(from), `mock không còn chuỗi "${from}" để đột biến (đổi dạng thì sửa test)`);
    assert.notDeepEqual(mockPlanErrors(src.replace(from, to)), [], `phải báo khi ${why}`);
  }
});

/** Các mục `## N. …` của một trang pháp lý đã dựng: Map số mục → { html, text }. Kiểm cụm theo đúng mục, không theo cả trang
 *  (cụm như "aitranslator.io.vn" hay "thu hồi" có sẵn ở mục khác thì test theo cả trang vẫn xanh khi câu cần kiểm bị xóa). */
function legalSections(urlPath) {
  const body = /<div class="legal">([\s\S]*?)<\/div><\/article>/.exec(htmlByPath.get(urlPath))?.[1] ?? "";
  const sections = new Map();
  for (const part of body.split(/(?=<h2 )/).slice(1)) {
    const n = /^<h2[^>]*>(\d+)\./.exec(part)?.[1];
    if (n) sections.set(n, { html: part, text: textOf(part) });
  }
  return sections;
}

/** Chữ của hàng bảng (trong một mục) có ô đầu bắt đầu bằng `first`; không có thì "". */
const rowText = (sectionHtml, first) =>
  [...(sectionHtml ?? "").matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => textOf(r[1])).find((t) => t.startsWith(first)) ?? "";

/** Lỗi khi mục `n` của trang thiếu cụm nào trong `wants[n]` (hay khi `text` của mục chứa cụm trong `forbids[n]`). */
function sectionErrors(urlPath, wants, forbids = {}) {
  const sections = legalSections(urlPath);
  const errors = [];
  for (const [n, needles] of Object.entries(wants)) {
    const text = sections.get(n)?.text;
    if (!text) {
      errors.push(`${urlPath}: không thấy mục ${n}`);
      continue;
    }
    for (const needle of needles) if (!text.includes(needle)) errors.push(`${urlPath} mục ${n}: thiếu "${needle}"`);
  }
  for (const [n, needles] of Object.entries(forbids)) {
    const text = sections.get(n)?.text ?? "";
    for (const needle of needles) if (text.includes(needle)) errors.push(`${urlPath} mục ${n}: còn câu cũ "${needle}"`);
  }
  return errors;
}

test("điều khoản (EULA) 1.3 nêu bốn gói với giá VND và USD đúng hàng, hai cách trả, Creem là bên bán lại (merchant of record) và đơn hoàn tiền thì rút ngắn hạn hay thu hồi", () => {
  const vi = textOf(htmlByPath.get("/dieu-khoan/"));
  const en = textOf(htmlByPath.get("/en/terms/"));
  const viNeeds = ["Phiên bản 1.3", "6 Months", "269.000 đ", "180 ngày", "3,99 USD", "21,99 USD", "39,99 USD", "VietQR", "thẻ quốc tế", "Creem", "Armitage Labs OÜ", "chưa gồm thuế"];
  const enNeeds = ["Version 1.3", "6 Months", "269,000 VND", "180 days", "$3.99", "$21.99", "$39.99", "VietQR", "international card", "Creem", "Armitage Labs OÜ", "exclude tax"];
  const errors = [
    ...viNeeds.filter((n) => !vi.includes(n)).map((n) => `/dieu-khoan/: thiếu "${n}"`),
    ...enNeeds.filter((n) => !en.includes(n)).map((n) => `/en/terms/: thiếu "${n}"`),
  ];
  // Giá nằm đúng hàng của gói ở bảng mục 3 (đổi chỗ giá USD giữa hai hàng thì đỏ).
  for (const [urlPath, lang] of [["/dieu-khoan/", "vi"], ["/en/terms/", "en"]]) {
    const table = legalSections(urlPath).get("3")?.html;
    for (const p of PLANS.filter((x) => x.priceVnd > 0)) {
      const amount = new Intl.NumberFormat(lang === "vi" ? "vi-VN" : "en-US").format(p.priceVnd);
      const price = lang === "vi" ? `${amount} đ hoặc ${usd(p.priceUsdCents, "vi")}` : `${amount} VND or ${usd(p.priceUsdCents, "en")}`;
      const row = rowText(table, lang === "vi" ? p.nameVi : p.nameEn);
      if (!row.includes(price)) errors.push(`${urlPath} mục 3: hàng ${p.nameEn} thiếu "${price}" (hàng: ${row || "không có"})`);
    }
  }
  errors.push(
    ...sectionErrors(
      "/dieu-khoan/",
      {
        3: [
          "trừ khi đơn đó đã được hoàn tiền",
          "một trong hai cách (khi cách đó đang được bán)",
          "Thanh toán bằng thẻ quốc tế do Creem bán lại.",
          "là bên bán lại (merchant of record) của đơn trả bằng thẻ",
          "thuế (VAT, GST hay thuế bán hàng, nếu có)",
          "sao kê thẻ thường ghi",
          "CREEM.IO* STORE",
          "https://www.creem.io/buyer-terms",
          "https://www.creem.io/privacy",
          "điều khoản của Creem được ưu tiên",
          "Chúng tôi không nhận số thẻ",
          "loại tiền bạn dùng để trả đơn đổi gói",
          "Gửi yêu cầu cho chúng tôi trước",
          "Creem là bên bán lại nên Creem cũng có thể hoàn tiền",
          "kể cả qua tranh chấp thẻ",
          "rút ngắn thời hạn mà đơn đó đã cộng",
          "thu hồi license nếu license chỉ gồm đơn đó",
          "việc này không tự động: người vận hành quyết định",
        ],
        12: ["kể cả khoản trả qua Creem"],
        13: ["rút ngắn hạn hoặc thu hồi khi đơn đã được hoàn tiền"],
      },
      { 3: ["license của đơn đó có thể bị thu hồi", "thuế bán hàng của khoản đó", "sao kê thẻ ghi"] },
    ),
    ...sectionErrors(
      "/en/terms/",
      {
        3: [
          "unless that order has been refunded",
          "one of two ways (when that method is offered)",
          "Orders paid by international card are resold by Creem.",
          "is the merchant of record (reseller) for orders paid by card",
          "tax (VAT, GST or sales tax, if any)",
          "your card statement usually shows",
          "CREEM.IO* STORE",
          "https://www.creem.io/buyer-terms",
          "https://www.creem.io/privacy",
          "terms prevail for that purchase",
          "We do not receive your card number",
          "currency you use to pay for the change",
          "Send your request to us first",
          "Creem is the merchant of record, so Creem may also refund",
          "including through a card dispute",
          "shorten the time that order added",
          "revoke the license if it consists only of that order",
          "this is not automatic: the operator decides",
        ],
        12: ["including payments made through Creem"],
        13: ["shortened or revoked when an order has been refunded"],
      },
      { 3: ["license of a refunded order may be revoked", "the sales tax on it", "card statement shows"] },
    ),
  );
  assert.deepEqual(errors, []);
});


test("chính sách quyền riêng tư 1.4 nêu Creem là bên bán lại (merchant of record), dữ liệu gửi và Creem tự thu, Creem giữ dữ liệu ngoài yêu cầu xóa, và website trong danh sách kết nối", () => {
  const vi = textOf(htmlByPath.get("/chinh-sach-quyen-rieng-tu/"));
  const en = textOf(htmlByPath.get("/en/privacy/"));
  const viNeeds = ["Phiên bản 1.4", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "điền sẵn trang thanh toán", "số thẻ", "loại tiền"];
  const enNeeds = ["Version 1.4", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "pre-fill the payment page", "card number", "currency"];
  const errors = [
    ...viNeeds.filter((n) => !vi.includes(n)).map((n) => `/chinh-sach-quyen-rieng-tu/: thiếu "${n}"`),
    ...enNeeds.filter((n) => !en.includes(n)).map((n) => `/en/privacy/: thiếu "${n}"`),
  ];
  const lang = {
    vi: { path: "/chinh-sach-quyen-rieng-tu/", email: "Email bạn nhập khi mua", orders: "Đơn hàng:", creem: "Creem (Armitage Labs OÜ" },
    en: { path: "/en/privacy/", email: "The email you enter when buying", orders: "Orders:", creem: "Creem (Armitage Labs OÜ" },
  };
  const rows = {
    vi: {
      email: ["điền sẵn trang thanh toán của Creem"],
      orders: ["mã phiên thanh toán của cổng"],
      creem: [
        "Bên bán lại (merchant of record) của đơn thẻ",
        "ngay khi bạn bấm thanh toán bằng thẻ (kể cả khi bạn không trả)",
        "để Creem gửi biên lai",
        "Creem tự thu số thẻ, tên, địa chỉ thanh toán và nước",
        "chúng tôi không nhận số thẻ",
        "https://www.creem.io/privacy",
        "chúng tôi không lưu hai thông tin này",
      ],
    },
    en: {
      email: ["pre-fill Creem"],
      orders: ["session ID"],
      creem: [
        "Merchant of record (reseller) for card orders",
        "as soon as you click to pay by card (even if you then do not pay)",
        "so that Creem can email you a receipt",
        "Creem itself collects your card number, name, billing address and country",
        "we do not receive your card number",
        "https://www.creem.io/privacy",
        "we do not store these two items",
      ],
    },
  };
  for (const l of ["vi", "en"]) {
    const sections = legalSections(lang[l].path);
    for (const [key, n] of [["email", "5"], ["orders", "5"], ["creem", "6"]]) {
      const row = rowText(sections.get(n)?.html, lang[l][key]);
      for (const needle of rows[l][key]) if (!row.includes(needle)) errors.push(`${lang[l].path} mục ${n}, hàng "${lang[l][key]}": thiếu "${needle}" (hàng: ${row || "không có"})`);
    }
    // Mục 4: năm nơi ứng dụng kết nối (website là nơi thứ năm), để câu "không có kết nối nào khác" đúng.
    const items = (sections.get("4")?.html.match(/<li>/g) ?? []).length;
    if (items !== 5) errors.push(`${lang[l].path} mục 4: ${items} nơi kết nối (cần 5, có website)`);
  }
  errors.push(
    ...sectionErrors(
      "/chinh-sach-quyen-rieng-tu/",
      {
        4: ["Website aitranslator.io.vn", "Không có kết nối nào khác"],
        5: ["đoán nước của bạn từ địa chỉ IP", "nước đoán được không được lưu"],
        6: ["còn Creem là pháp nhân Estonia"],
        7: ["mã đơn, ngày, số tiền (và loại tiền), mã phiên thanh toán của cổng", "hồ sơ giao dịch do Creem giữ", "nằm ngoài yêu cầu xóa gửi chúng tôi", "hãy liên hệ Creem"],
      },
      { 6: ["(theo pháp luật Estonia)"] },
    ),
    ...sectionErrors(
      "/en/privacy/",
      {
        4: ["website aitranslator.io.vn", "There are no other connections"],
        5: ["guesses your country from your IP address", "the guessed country is not stored"],
        6: ["Creem is an Estonian company"],
        7: ["order code, date, amount (and currency), the payment gateway", "transaction records kept by Creem", "are outside a deletion request sent to us", "contact Creem"],
      },
      { 6: ["(governed by Estonian law)"] },
    ),
  );
  assert.deepEqual(errors, []);
});

test("chính sách quyền riêng tư: mục 10 Báo cáo lỗi nêu khi nào gửi, gồm và không gồm gì, gắn với mã băm của máy, giữ 30 ngày, tắt ở đâu; các mục 2, 3, 4, 5, 7 nhắc tới báo cáo lỗi; không còn câu cũ", () => {
  const errors = [
    ...sectionErrors(
      "/chinh-sach-quyen-rieng-tu/",
      {
        2: ["tự gửi báo cáo lỗi đã che dữ liệu cá nhân", "trừ báo cáo lỗi tự xóa sau 30 ngày"],
        3: ["Chỉ phần log liên quan đến một lỗi rời máy"],
        4: ["gửi báo cáo lỗi (mục 10)"],
        5: ["Báo cáo lỗi (mục 10)", "tự xóa sau 30 ngày"],
        7: ["xóa các báo cáo lỗi của những máy từng kích hoạt key của email đó", "không gắn với email nào"],
        10: [
          "Gửi báo cáo lỗi tự động",
          "Gửi log cho hỗ trợ",
          "bật mặc định",
          "đã cài từ trước",
          "mã báo cáo",
          "không đang dịch",
          "mã băm của ID máy",
          "Âm thanh, bản chép lời, bản dịch, chữ bạn gõ ở Gõ dịch, license key, token, email",
          "có thể nối báo cáo với license và email",
          "30 ngày",
          "3.000",
        ],
        11: ["Thay đổi chính sách"],
        12: ["Liên hệ"],
      },
      { 2: ["không gửi báo cáo lỗi tự động"], 3: ["bạn tự gửi cho chúng tôi nếu muốn"] },
    ),
    ...sectionErrors(
      "/en/privacy/",
      {
        2: ["automatically sends us an error report with personal data scrubbed out", "except error reports"],
        3: ["Only the part of a log that relates to an error leaves your computer"],
        4: ["send error reports (section 10)"],
        5: ["Error reports (section 10)", "deleted automatically after 30 days"],
        7: ["delete the error reports of the machines that ever activated a key for that email", "not tied to any email"],
        10: [
          "Send error reports automatically",
          "Send log to support",
          "on by default",
          "installed the app earlier",
          "report code",
          "not translating",
          "hash of the machine ID",
          "Audio, transcripts, translations, text typed in Type",
          "Translate, license keys, tokens, email addresses",
          "can link a report to that machine",
          "30 days",
          "3,000",
        ],
        11: ["Changes to this policy"],
        12: ["Contact"],
      },
      { 2: ["no automatic crash reports"], 3: ["you send them to us yourself"] },
    ),
  ];
  for (const [urlPath, first, needles] of [
    ["/chinh-sach-quyen-rieng-tu/", "Báo cáo lỗi (mục 10)", ["mã băm", "Tìm và sửa lỗi"]],
    ["/en/privacy/", "Error reports (section 10)", ["hash", "Find and fix bugs"]],
  ]) {
    const row = rowText(legalSections(urlPath).get("5")?.html, first);
    if (!row) errors.push(`${urlPath} mục 5: không có hàng "${first}"`);
    for (const n of needles) if (row && !row.includes(n)) errors.push(`${urlPath} mục 5, hàng "${first}": thiếu "${n}" (hàng: ${row})`);
  }
  assert.deepEqual(errors, []);
});

test("văn bản pháp lý (điều khoản và chính sách ở docs/legal): bốn file nêu merchant of record, EULA nêu rút ngắn hay thu hồi khi hoàn tiền, bản tiếng Anh cùng cấu trúc và cùng ngày với bản tiếng Việt", async () => {
  const read = (f) => readFile(path.join(ROOT, "..", "docs", "legal", f), "utf8");
  const docs = Object.fromEntries(await Promise.all(["eula.vi.md", "eula.en.md", "privacy.vi.md", "privacy.en.md"].map(async (f) => [f, await read(f)])));
  const errors = [];
  for (const [file, md] of Object.entries(docs)) if (!md.includes("merchant of record")) errors.push(`${file}: thiếu "merchant of record"`);
  // Câu hoàn tiền của EULA (gạch đầu dòng "Hoàn tiền"/"Refunds" ở mục 3) nêu cả rút ngắn hạn lẫn thu hồi.
  const refundLine = (md, lead) => md.split("\n").find((l) => l.startsWith(lead)) ?? "";
  for (const [file, lead, words] of [["eula.vi.md", "- **Hoàn tiền:**", ["rút ngắn", "thu hồi"]], ["eula.en.md", "- **Refunds:**", ["shorten", "revoke"]]]) {
    const line = refundLine(docs[file], lead);
    for (const w of words) if (!line.includes(w)) errors.push(`${file}: câu hoàn tiền thiếu "${w}"`);
  }
  // Cấu trúc từng mục `##` của bản tiếng Anh giống bản tiếng Việt (cùng số mục, số gạch đầu dòng, số hàng bảng, số đoạn).
  const skeleton = (md) =>
    md
      .split(/^## /m)
      .slice(1)
      .map((sec) => {
        const lines = sec.split("\n").slice(1).filter((l) => l.trim() !== "");
        return {
          section: /^(\d+)\./.exec(sec)?.[1],
          items: lines.filter((l) => /^(- |\d+\. )/.test(l)).length,
          rows: lines.filter((l) => l.startsWith("|")).length,
          paragraphs: lines.filter((l) => !/^(- |\d+\. |\||#)/.test(l)).length,
        };
      });
  for (const [name, count] of [["eula", 16], ["privacy", 12]]) {
    const vi = skeleton(docs[`${name}.vi.md`]);
    const en = skeleton(docs[`${name}.en.md`]);
    if (vi.length !== count) errors.push(`${name}.vi.md: ${vi.length} mục (giữ ${count} mục)`);
    if (JSON.stringify(vi) !== JSON.stringify(en)) errors.push(`${name}: cấu trúc en khác vi: vi ${JSON.stringify(vi)} / en ${JSON.stringify(en)}`);
    // Cùng phiên bản và cùng ngày hiệu lực; bản tiếng Anh ghi bản tiếng Việt ưu tiên.
    const viHead = /\*\*Phiên bản ([0-9.]+), hiệu lực từ (\d{2})\/(\d{2})\/(\d{4})\.\*\*/.exec(docs[`${name}.vi.md`]);
    const enHead = /\*\*Version ([0-9.]+), effective (\d{1,2}) ([A-Z][a-z]+) (\d{4})\. If this English translation and the Vietnamese version differ, the Vietnamese version prevails\.\*\*/.exec(docs[`${name}.en.md`]);
    if (!viHead || !enHead) errors.push(`${name}: không đọc được dòng phiên bản (vi ${Boolean(viHead)}, en ${Boolean(enHead)})`);
    else {
      const enMonth = new Date(`${enHead[3]} 1, 2000`).getMonth() + 1;
      if (viHead[1] !== enHead[1] || Number(viHead[2]) !== Number(enHead[2]) || Number(viHead[3]) !== enMonth || viHead[4] !== enHead[4]) {
        errors.push(`${name}: phiên bản/ngày vi (${viHead.slice(1).join(" ")}) khác en (${enHead.slice(1).join(" ")})`);
      }
    }
  }
  // EULA giữ bản 1.3, ngày 2026-10-16; chính sách lên 1.4 (Gõ dịch) với ngày hiệu lực không sớm hơn ngày của bản 1.3 (2026-10-17).
  // Đặt bản và ngày bằng lệnh ở kế hoạch go-dich-06 (task ngày phát hành), trước khi build app.
  const privacyHead = docHeader(docs["privacy.vi.md"]);
  if (!/^\*\*Phiên bản 1\.3,/m.test(docs["eula.vi.md"]) || privacyHead?.version !== "1.4") errors.push("giữ EULA 1.3 và chính sách 1.4");
  if (!privacyHead || privacyHead.iso < "2026-10-17") {
    errors.push(`chính sách 1.4 phải có ngày hiệu lực từ 2026-10-17 (ngày của bản 1.3) trở đi, đang ghi ${privacyHead?.iso}: đặt ngày phát hành thật (docs/legal/README.md, "Đổi ngày hiệu lực")`);
  }
  assert.deepEqual(errors, []);
});

test("Về chúng tôi nêu đúng phiên bản và ngày hiệu lực của Điều khoản và Chính sách, lấy từ docs/legal", async () => {
  const errors = [];
  for (const [urlPath, files] of [["/ve-chung-toi/", ["eula.vi.md", "privacy.vi.md"]], ["/en/about/", ["eula.en.md", "privacy.en.md"]]]) {
    const text = textOf(htmlByPath.get(urlPath));
    for (const file of files) {
      const source = await readFile(path.join(ROOT, "..", "docs", "legal", file), "utf8");
      const line = /\*\*((?:Phiên bản|Version) [0-9.]+[^.*]*?)\./.exec(source)?.[1];
      if (!line) errors.push(`docs/legal/${file}: không thấy dòng phiên bản ở đầu văn bản`);
      else if (!text.includes(line)) errors.push(`${urlPath}: thiếu "${line}" (dòng đầu của ${file})`);
    }
  }
  assert.deepEqual(errors, []);
});


// ---- Hardening Creem D2: website khớp văn bản pháp lý (EULA 1.3, chính sách 1.3): Creem là merchant of record, thuế, hoàn tiền, báo cáo lỗi ----

const needsIn = (where, text, needles) => needles.filter((n) => !text.includes(n)).map((n) => `${where}: thiếu "${n}"`);
const forbidsIn = (where, text, needles) => needles.filter((n) => text.includes(n)).map((n) => `${where}: còn câu cũ "${n}"`);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Phiên bản và ngày hiệu lực (ISO) ở dòng đậm đầu văn bản pháp lý. Khuôn do test tự khẳng định, KHÔNG dùng regex của legal.mjs. */
function docHeader(md) {
  const first = md.split("\n").find((l) => l.startsWith("**")) ?? "";
  const vi = /^\*\*(Phiên bản (\d+\.\d+), hiệu lực từ (\d\d)\/(\d\d)\/(\d{4}))\.\*\*$/.exec(first);
  if (vi) return { line: vi[1], version: vi[2], iso: `${vi[5]}-${vi[4]}-${vi[3]}` };
  const en = /^\*\*(Version (\d+\.\d+), effective (\d{1,2}) ([A-Z][a-z]+) (\d{4}))\. If this English translation and the Vietnamese version differ, the Vietnamese version prevails\.\*\*$/.exec(first);
  if (en) return { line: en[1], version: en[2], iso: `${en[5]}-${String(MONTHS.indexOf(en[4]) + 1).padStart(2, "0")}-${en[3].padStart(2, "0")}` };
  return null;
}

const LEGAL_FILES = ["eula.vi.md", "eula.en.md", "privacy.vi.md", "privacy.en.md"];
const legalDoc = (file) => readFile(path.join(ROOT, "..", "docs", "legal", file), "utf8");

/** HTML của mục `<h2 id="…">` tới `<h2>` kế tiếp (hay hết trang); "" nếu không có. Cho các trang thường, không phải trang pháp lý. */
function pageSection(urlPath, id) {
  const html = htmlByPath.get(urlPath);
  const from = html.indexOf(`<h2 id="${id}"`);
  if (from < 0) return "";
  const rest = html.slice(from + 1);
  const next = rest.search(/<h2[ >]/);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Chữ thuần của câu trả lời FAQ có đúng câu hỏi `question` trên trang; "" nếu không có. */
function faqAnswer(urlPath, question) {
  for (const m of htmlByPath.get(urlPath).matchAll(/<details[^>]*><summary>([^<]*)<\/summary><div class="answer">([\s\S]*?)<\/div><\/details>/g)) {
    if (decode(m[1]).replaceAll("&nbsp;", " ") === question) return textOf(m[2]);
  }
  return "";
}

/** Chữ thuần của thẻ `<div class="card reveal" id="…">` ở trang Liên hệ; "" nếu không có. */
function contactCard(urlPath, id) {
  const m = new RegExp(`<div class="card reveal" id="${id}">([\\s\\S]*?)</div>`).exec(htmlByPath.get(urlPath));
  return m ? textOf(m[1]) : "";
}

/** Các ô `<td>` (chữ thuần) của hàng bảng so sánh gói có nhãn `label`; null nếu không có. */
function compareRow(urlPath, label) {
  const table = /<table class="compare">([\s\S]*?)<\/table>/.exec(htmlByPath.get(urlPath))?.[1] ?? "";
  for (const r of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    if (textOf(/<th scope="row">([\s\S]*?)<\/th>/.exec(r[1])?.[1] ?? "") === label) return [...r[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => textOf(c[1]));
  }
  return null;
}

// Câu hoàn tiền: cùng chữ với EULA mục 3 (rút ngắn thời hạn hay thu hồi license, do người vận hành quyết định, không tự động).
const REFUND_PHRASES = {
  vi: ["Creem cũng có thể hoàn tiền", "toàn bộ hay một phần, kể cả qua tranh chấp thẻ", "rút ngắn thời hạn mà đơn đó đã cộng", "thu hồi license nếu license chỉ gồm đơn đó", "việc này không tự động: người vận hành quyết định"],
  en: ["Creem may also refund", "in full or in part, including through a card dispute", "shorten the time that order added", "revoke the license if it consists only of that order", "this is not automatic: the operator decides"],
};
const REFUND_OLD = {
  vi: ["license của đơn đó có thể bị thu hồi", "Khoản trả bằng thẻ quốc tế do Creem xử lý"],
  en: ["license of a refunded order may then be revoked", "its license may be revoked", "Card payments are handled by Creem, which may also", "Card payments are processed by Creem"],
};

test("legalVersionLine và parseLegalHeader: dòng phiên bản đúng khuôn của từng văn bản (test tự đọc file, không dùng regex của hàm), ngày đúng, và báo lỗi rõ khi sai khuôn", async () => {
  const errors = [];
  for (const file of LEGAL_FILES) {
    const md = await legalDoc(file);
    const want = docHeader(md);
    if (!want) {
      errors.push(`${file}: dòng đậm đầu văn bản không theo khuôn đã biết`);
      continue;
    }
    let got;
    try {
      got = legal.legalVersionLine(file);
    } catch (e) {
      got = `lỗi: ${e.message}`;
    }
    if (got !== want.line) errors.push(`${file}: legalVersionLine = "${got}", cần "${want.line}"`);
    let header;
    try {
      header = legal.parseLegalHeader(md, file);
    } catch (e) {
      header = { error: e.message };
    }
    if (header?.iso !== want.iso || header?.version !== want.version) errors.push(`${file}: parseLegalHeader = ${JSON.stringify(header)}, cần phiên bản ${want.version}, ngày ${want.iso}`);
  }
  assert.deepEqual(errors, []);
  // Sai khuôn thì lỗi nêu tên file (không lặng lẽ lấy nhầm một chuỗi giống ở nơi khác của văn bản).
  const bad = {
    "dòng phiên bản không nằm đầu dòng": "# T\n\nxem **Phiên bản 9.9, hiệu lực từ 01/01/2030.** ở đây\n",
    "thiếu ngày hiệu lực": "# T\n\n**Phiên bản 1.2.**\n",
    "ngày một chữ số (cần dd/mm/yyyy)": "# T\n\n**Phiên bản 1.2, hiệu lực từ 7/10/2026.**\n",
    "ngày không có thật": "# T\n\n**Phiên bản 1.2, hiệu lực từ 31/02/2026.**\n",
    "tên tháng tiếng Anh lạ": "# T\n\n**Version 1.2, effective 7 Octobre 2026. x**\n",
    "không có dòng phiên bản": "# T\n\nChỉ có chữ.\n",
  };
  for (const [why, source] of Object.entries(bad)) assert.throws(() => legal.parseLegalHeader(source, "x.md"), /x\.md/, `phải báo lỗi có tên file khi ${why}`);
  const ok = legal.parseLegalHeader("# T\n\n**Version 1.2, effective 7 October 2026. If this differs.**\n", "x.md");
  assert.deepEqual([ok.label, ok.version, ok.iso], ["Version 1.2, effective 7 October 2026", "1.2", "2026-10-07"]);
});

test("trang pháp lý: `modified` do chính trang khai báo bằng ngày hiệu lực trong dòng phiên bản của docs/legal; sitemap và dateModified không cũ hơn", async () => {
  const errors = [];
  for (const [file, mod, urlPath] of [
    ["eula.vi.md", "vi/terms.mjs", "/dieu-khoan/"],
    ["eula.en.md", "en/terms.mjs", "/en/terms/"],
    ["privacy.vi.md", "vi/privacy.mjs", "/chinh-sach-quyen-rieng-tu/"],
    ["privacy.en.md", "en/privacy.mjs", "/en/privacy/"],
  ]) {
    const want = docHeader(await legalDoc(file))?.iso;
    if (!want) {
      errors.push(`${file}: không đọc được ngày hiệu lực`);
      continue;
    }
    // Nạp lại module bằng một địa chỉ khác để thấy giá trị trang tự khai báo, trước khi index.mjs nâng nó lên theo ngày sửa trong git.
    const declared = (await import(`../src/content/${mod}?declared`)).default.modified;
    if (declared !== want) errors.push(`${mod}: modified khai báo ${declared}, cần ${want} (ngày hiệu lực của ${file})`);
    const built = pages.find((p) => p.path === urlPath);
    if (!built || built.modified < want) errors.push(`${urlPath}: modified đã dựng ${built?.modified} cũ hơn ngày hiệu lực ${want}`);
  }
  assert.deepEqual(errors, []);
});

test("Dữ liệu và bảo mật khớp Chính sách quyền riêng tư 1.4: dòng phiên bản lấy từ docs/legal, hàng Creem, mục xóa dữ liệu, email gửi Creem viết chủ động, dấu phẩy", () => {
  const errors = [];
  const cfg = {
    vi: {
      path: "/bao-mat-du-lieu/",
      meta: `Khớp với Chính sách quyền riêng tư: ${legal.legalVersionLine("privacy.vi.md")}`,
      stale: ["Chính sách quyền riêng tư phiên bản 1.1"],
      checks: [
        ["ket-noi-mang", null, ["Mục 4 của Chính sách quyền riêng tư", "đếm theo mục đích", "đếm theo nơi nhận"], []],
        ["ket-noi-mang", "Trang thanh toán Creem", ["Mở bằng trình duyệt của bạn, không phải trong app", "máy chủ của chúng tôi sang Creem, không đi từ app"], []],
        ["may-chu", "Email khi mua", ["điền sẵn trang thanh toán của Creem"], []],
        ["may-chu", "Đơn hàng:", ["loại tiền", "mã phiên thanh toán của cổng"], []],
        ["may-chu", null, ["chúng tôi gửi email bạn nhập ở màn hình Nâng cấp cho Creem", "để điền sẵn trang thanh toán và để Creem gửi biên lai cho bạn"], ["được gửi cho Creem"]],
        ["xoa-du-lieu", null, ["số tiền và loại tiền, mã phiên thanh toán của cổng", "hồ sơ giao dịch do Creem giữ", "nằm ngoài yêu cầu xóa gửi chúng tôi", "hãy liên hệ Creem"], []],
        [
          "ben-xu-ly",
          "Creem (Armitage Labs OÜ, Estonia)",
          [
            "Bên bán lại (merchant of record) của đơn thẻ",
            "ngay khi bạn bấm thanh toán bằng thẻ (kể cả khi bạn không trả)",
            "để Creem gửi biên lai",
            "Creem tự thu số thẻ, tên, địa chỉ thanh toán và nước",
            "chúng tôi không nhận số thẻ",
            "https://www.creem.io/privacy",
            "chúng tôi không lưu hai thông tin này",
            "số tiền, loại tiền và email bạn nhập",
            "điền sẵn trang thanh toán",
          ],
          [],
        ],
        ["ben-xu-ly", null, ["Việt Nam, còn Creem là pháp nhân Estonia"], []],
      ],
    },
    en: {
      path: "/en/data-security/",
      meta: `Matches the Privacy policy: ${legal.legalVersionLine("privacy.en.md")}`,
      stale: ["Privacy policy version 1.1"],
      checks: [
        ["network", null, ["Section 4 of the Privacy policy", "counts them by purpose", "counts them by destination"], []],
        ["network", "Creem payment page", ["Opens in your browser, not inside the app", "Your email goes to Creem from our server, not from the app"], []],
        ["server", "Email at purchase", ["pre-filling Creem's payment page"], []],
        ["server", "Orders:", ["and currency", "the payment gateway's session ID"], []],
        ["server", null, ["we send the email you enter on the Upgrade screen to Creem", "to pre-fill its payment page and so that Creem can email you a receipt"], ["is sent to Creem"]],
        ["delete-data", null, ["amount and currency, the payment gateway's session ID", "transaction records kept by Creem", "are outside a deletion request sent to us", "contact Creem"], []],
        [
          "processors",
          "Creem (Armitage Labs OÜ, Estonia)",
          [
            "Merchant of record (reseller) for card orders",
            "as soon as you click to pay by card (even if you then do not pay)",
            "so that Creem can email you a receipt",
            "Creem itself collects your card number, name, billing address and country",
            "we do not receive your card number",
            "https://www.creem.io/privacy",
            "we do not store these two items",
            "amount, currency and the email you entered",
            "pre-fill the payment page",
          ],
          [],
        ],
        ["processors", null, ["outside Vietnam, and Creem is an Estonian company"], []],
      ],
    },
  };
  for (const { path: urlPath, meta, stale, checks } of Object.values(cfg)) {
    const html = htmlByPath.get(urlPath);
    errors.push(...needsIn(`${urlPath} (đầu trang)`, textOf(html.slice(0, html.indexOf('<section class="section-tight">'))), [meta]));
    errors.push(...forbidsIn(urlPath, textOf(html), stale));
    for (const [id, first, needles, forbids] of checks) {
      const section = pageSection(urlPath, id);
      const text = first ? rowText(section, first) : textOf(section);
      const where = `${urlPath} #${id}${first ? ` hàng "${first}"` : ""}`;
      if (!text) errors.push(`${where}: không có`);
      else errors.push(...needsIn(where, text, needles), ...forbidsIn(where, text, forbids));
    }
  }
  assert.deepEqual(errors, []);
});

test("Dữ liệu và bảo mật: số nơi app kết nối ở câu mở đầu, dòng tóm tắt và mô tả trong llms.txt khớp số dòng của bảng và số mục ở mục 4 của chính sách", async () => {
  const words = { vi: ["bốn", "năm", "sáu"], en: ["four", "five", "six"] };
  const llms = await readFile(path.join(DIST, "llms.txt"), "utf8");
  const errors = [];
  for (const [urlPath, lang, id, policyPath] of [
    ["/bao-mat-du-lieu/", "vi", "ket-noi-mang", "/chinh-sach-quyen-rieng-tu/"],
    ["/en/data-security/", "en", "network", "/en/privacy/"],
  ]) {
    const html = htmlByPath.get(urlPath);
    const section = pageSection(urlPath, id);
    const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(section)?.[1] ?? "";
    const rows = (tbody.match(/<tr[\s>]/g) ?? []).length;
    const policyItems = (legalSections(policyPath).get("4")?.html.match(/<li>/g) ?? []).length;
    if (rows !== policyItems) errors.push(`${urlPath}: bảng có ${rows} dòng nhưng mục 4 của chính sách liệt kê ${policyItems} mục (sửa một bên thì phải sửa cả bên kia)`);
    const word = words[lang][rows - 4];
    if (!word) {
      errors.push(`${urlPath}: bảng có ${rows} dòng, test chưa có từ chỉ số tương ứng`);
      continue;
    }
    // Chỉ đọc đoạn mở đầu của mục, dòng tóm tắt (<dd>) và mô tả llm: một chỗ khác nói "năm nơi" không che được chỗ sai.
    const opening = textOf(/<\/h2>\s*<p>([\s\S]*?)<\/p>/.exec(section)?.[1] ?? "");
    const summary = textOf(new RegExp(`<dt>${lang === "vi" ? "Kết nối mạng" : "Network"}</dt><dd>([\\s\\S]*?)</dd>`).exec(html)?.[1] ?? "");
    const llmLine = llms.split("\n").find((l) => l.includes(`(${SITE.origin}${urlPath})`)) ?? "";
    const cap = word[0].toUpperCase() + word.slice(1);
    if (!(lang === "vi" ? opening.startsWith(`Đúng ${word} nơi`) : opening.toLowerCase().includes(`exactly ${word} places`))) errors.push(`${urlPath}: câu mở đầu của mục phải nêu "${word}" nơi (bảng có ${rows} dòng): ${opening.slice(0, 60)}`);
    if (!summary.startsWith(lang === "vi" ? `${cap} nơi` : `${cap} places`)) errors.push(`${urlPath}: dòng tóm tắt phải bắt đầu bằng "${cap}" nơi (bảng có ${rows} dòng): ${summary.slice(0, 40)}`);
    if (!llmLine.includes(lang === "vi" ? `${word} nơi` : `${word} places`)) errors.push(`${urlPath}: mô tả llm (llms.txt) phải nêu "${word}" nơi`);
  }
  assert.deepEqual(errors, []);
});

test("Liên hệ: câu hoàn tiền giống FAQ và EULA, tra đơn ở Creem và liên hệ Creem khi quá 7 ngày không trả lời, Creem là merchant of record ở mục thanh toán, mẫu thư thanh toán nêu cách trả", () => {
  const errors = [];
  const cfg = {
    vi: {
      path: "/lien-he/",
      ids: { refund: "hoan-tien", pay: "thanh-toan", erase: "xoa-du-lieu" },
      refund: ["Gửi yêu cầu cho chúng tôi trước", "creem.io/my-orders/login", "quá 7 ngày", "liên hệ Creem", ...REFUND_PHRASES.vi],
      pay: ["merchant of record"],
      erase: ["Dữ liệu bạn nhập ở trang Creem", "hãy liên hệ Creem"],
      mail: "Cách trả (VietQR hoặc thẻ quốc tế), thời điểm và số tiền đã trả",
      old: REFUND_OLD.vi,
    },
    en: {
      path: "/en/contact/",
      ids: { refund: "refund", pay: "payment", erase: "delete-data" },
      refund: ["Send your request to us first", "creem.io/my-orders/login", "more than 7 days", "contact Creem", ...REFUND_PHRASES.en],
      pay: ["merchant of record"],
      erase: ["Data you enter on Creem's page", "contact Creem"],
      mail: "Payment method (VietQR or international card), time and amount paid",
      old: REFUND_OLD.en,
    },
  };
  for (const c of Object.values(cfg)) {
    errors.push(...needsIn(`${c.path} #${c.ids.refund}`, contactCard(c.path, c.ids.refund), c.refund));
    errors.push(...forbidsIn(`${c.path} #${c.ids.refund}`, contactCard(c.path, c.ids.refund), c.old));
    errors.push(...needsIn(`${c.path} #${c.ids.pay}`, contactCard(c.path, c.ids.pay), c.pay));
    errors.push(...needsIn(`${c.path} #${c.ids.erase}`, contactCard(c.path, c.ids.erase), c.erase));
    // Mẫu thư nằm trong href mailto: (textOf bỏ thuộc tính), nên giải mã href rồi mới kiểm.
    const mails = [...htmlByPath.get(c.path).matchAll(/href="(mailto:[^"]*)"/g)].map((m) => decodeURIComponent(decode(m[1])));
    if (!mails.some((m) => m.includes(c.mail))) errors.push(`${c.path}: mẫu thư thanh toán thiếu "${c.mail}"`);
  }
  assert.deepEqual(errors, []);
});

test("Bảng giá: ô giá USD của bảng so sánh nói chưa gồm thuế, thuế gọi đúng tên, 'bắt đầu thanh toán ngay trong app', email gửi Creem viết chủ động, ví dụ đổi gói có điều kiện; hỏi đáp có merchant of record, hoàn tiền và hóa đơn", () => {
  const errors = [];
  const cfg = {
    vi: {
      path: "/bang-gia/",
      lang: "vi",
      priceRow: "Giá",
      tax: "chưa gồm thuế",
      title: "không tự gia hạn",
      hero: ["Bắt đầu thanh toán ngay trong app"],
      heroOld: ["Thanh toán bằng VietQR hoặc thẻ quốc tế ngay trong app"],
      grid: ["thuế (VAT, GST hay thuế bán hàng)", "trong thời hạn đã mua, trừ khi đơn đó đã được hoàn tiền"],
      gridOld: ["có thu thuế bán hàng", "gói bạn đã mua giữ nguyên hạn mức."],
      steps: ["chúng tôi gửi email bạn nhập trong app cho Creem", "để điền sẵn trang thanh toán và để Creem gửi biên lai"],
      stepsOld: ["được dùng để điền sẵn"],
      example: ["Ví dụ tính theo giá VND", "công thức dùng giá USD của cả hai gói", "ở ví dụ này chỉ lệch tối đa một ngày"],
      exampleOld: ["có thể lệch một ngày"],
      qCard: "Tôi có thể trả bằng thẻ quốc tế không?",
      qRefund: "Có hoàn tiền không?",
      qInvoice: "Tôi cần hóa đơn điện tử cho doanh nghiệp?",
      invoice: ["đơn VietQR", "Creem gửi biên lai"],
      refundOld: REFUND_OLD.vi,
      refund: REFUND_PHRASES.vi,
    },
    en: {
      path: "/en/pricing/",
      lang: "en",
      priceRow: "Price",
      tax: "excl. tax",
      title: "no auto-renewal",
      hero: ["You start paying inside the app"],
      heroOld: ["You pay inside the app"],
      grid: ["tax (VAT, GST or sales tax)", "keeps its allowance for the period you bought, unless that order has been refunded"],
      gridOld: ["charges sales tax", "never has its allowance reduced"],
      steps: ["we send the email you enter in the app to Creem", "to pre-fill the payment page and so that Creem can email you a receipt"],
      stepsOld: ["is used to pre-fill"],
      example: ["For example, priced in VND", "uses the USD prices of both plans", "in this example by at most one day"],
      exampleOld: ["can differ by one day"],
      qCard: "Can I pay with an international card?",
      qRefund: "Can I get a refund?",
      qInvoice: "Can I get an e-invoice for my company?",
      invoice: ["VietQR orders", "Creem emails a receipt"],
      refundOld: REFUND_OLD.en,
      refund: REFUND_PHRASES.en,
    },
  };
  for (const c of Object.values(cfg)) {
    const html = htmlByPath.get(c.path);
    // Bảng so sánh: mỗi ô giá USD (Monthly, 6 Months, Yearly) tự nói giá chưa gồm thuế, không dựa vào chú thích ở xa.
    const cells = compareRow(c.path, c.priceRow);
    for (const [i, p] of PLANS.filter((x) => x.priceUsdCents > 0).entries()) {
      const cell = cells?.[i + 1] ?? "";
      if (!cell.includes(usd(p.priceUsdCents, c.lang)) || !cell.includes(c.tax)) errors.push(`${c.path}: ô giá ${p.nameEn} của bảng so sánh phải có "${usd(p.priceUsdCents, c.lang)}" và "${c.tax}" (ô: ${cell || "không có"})`);
    }
    const lead = textOf(/<p class="lead">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "");
    errors.push(...needsIn(`${c.path} (lời dẫn)`, lead, c.hero), ...forbidsIn(`${c.path} (lời dẫn)`, lead, c.heroOld));
    errors.push(...needsIn(`${c.path} (tiêu đề)`, textOf(/<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? ""), [c.title]));
    const disclaimers = [...html.matchAll(/<p class="disclaimer">([\s\S]*?)<\/p>/g)].map((m) => textOf(m[1]));
    errors.push(...needsIn(`${c.path} (chú thích dưới lưới gói)`, disclaimers[0] ?? "", c.grid), ...forbidsIn(`${c.path} (chú thích dưới lưới gói)`, disclaimers[0] ?? "", c.gridOld));
    errors.push(...needsIn(`${c.path} (chú thích dưới các bước mua)`, disclaimers[1] ?? "", c.steps), ...forbidsIn(`${c.path} (chú thích dưới các bước mua)`, disclaimers[1] ?? "", c.stepsOld));
    errors.push(...needsIn(`${c.path} (ví dụ đổi gói)`, textOf(html), c.example), ...forbidsIn(`${c.path} (ví dụ đổi gói)`, textOf(html), c.exampleOld));
    const card = faqAnswer(c.path, c.qCard);
    errors.push(...needsIn(`${c.path} hỏi đáp "${c.qCard}"`, card, ["merchant of record", "https://www.creem.io/buyer-terms"]));
    const refund = faqAnswer(c.path, c.qRefund);
    errors.push(...needsIn(`${c.path} hỏi đáp "${c.qRefund}"`, refund, c.refund), ...forbidsIn(`${c.path} hỏi đáp "${c.qRefund}"`, refund, c.refundOld));
    errors.push(...needsIn(`${c.path} hỏi đáp "${c.qInvoice}"`, faqAnswer(c.path, c.qInvoice), c.invoice));
  }
  assert.deepEqual(errors, []);
});

test("Hỏi đáp: câu hỏi thẻ quốc tế nói Creem là merchant of record, không có PayPal, Apple Pay và Google Pay chỉ khi trang Creem hiện, thẻ không nhận ở một số nước; câu hoàn tiền giống EULA", () => {
  const errors = [];
  const cfg = {
    vi: {
      path: "/cau-hoi-thuong-gap/",
      qCard: "Tôi trả tiền bằng cách nào? Trả bằng thẻ quốc tế được không?",
      qOld: "Có thẻ quốc tế không?",
      card: ["merchant of record", "https://www.creem.io/buyer-terms", "Không có PayPal", "Apple Pay hay Google Pay chỉ dùng được khi trang thanh toán của Creem hiện lựa chọn đó", "một số nước, theo danh sách của Creem", "đơn thẻ có biên lai của Creem"],
      qRefund: "Có hoàn tiền không?",
      refund: REFUND_PHRASES.vi,
      refundOld: REFUND_OLD.vi,
    },
    en: {
      path: "/en/faq/",
      qCard: "How do I pay? Can I pay by international card?",
      qOld: "Can I use an international card?",
      card: ["merchant of record", "https://www.creem.io/buyer-terms", "There is no PayPal", "Apple Pay or Google Pay are available only when Creem's payment page shows that option", "some countries, per Creem's list", "card orders get a receipt from Creem"],
      qRefund: "Can I get a refund?",
      refund: REFUND_PHRASES.en,
      refundOld: REFUND_OLD.en,
    },
  };
  for (const c of Object.values(cfg)) {
    const answer = faqAnswer(c.path, c.qCard);
    if (!answer) errors.push(`${c.path}: không có câu hỏi "${c.qCard}"`);
    errors.push(...needsIn(`${c.path} "${c.qCard}"`, answer, c.card));
    errors.push(...forbidsIn(c.path, textOf(htmlByPath.get(c.path)), [c.qOld]));
    const refund = faqAnswer(c.path, c.qRefund);
    errors.push(...needsIn(`${c.path} "${c.qRefund}"`, refund, c.refund), ...forbidsIn(`${c.path} "${c.qRefund}"`, refund, c.refundOld));
  }
  assert.deepEqual(errors, []);
});

test("câu hoàn tiền ở EULA mục 3 (docs/legal) có các cụm chính mà website dùng lại (REFUND_PHRASES), cùng hạn 7 ngày và hai ngoại lệ (a) (b); sửa EULA thì test báo", async () => {
  // Chỉ ghim EULA: các trang website (Bảng giá, Hỏi đáp, Liên hệ, hướng dẫn mua gói) được ghim cùng REFUND_PHRASES ở các test riêng của chúng,
  // nên sửa một cụm ở EULA (hay ở một trang) thì test của bên kia báo lệch.
  const extra = {
    vi: ["trong **7 ngày** kể từ ngày thanh toán", "(a) lỗi do chúng tôi khiến bạn không dùng được gói đã mua", "(b) pháp luật quy định khác"],
    en: ["within **7 days** of payment", "(a) where our fault prevents you from using the plan you bought", "(b) where the law requires otherwise"],
  };
  const errors = [];
  for (const [file, lead, lang] of [["eula.vi.md", "- **Hoàn tiền:**", "vi"], ["eula.en.md", "- **Refunds:**", "en"]]) {
    const line = (await legalDoc(file)).split("\n").find((l) => l.startsWith(lead)) ?? "";
    if (!line) errors.push(`${file}: không thấy dòng "${lead}"`);
    errors.push(...needsIn(`${file} (dòng hoàn tiền)`, line, [...REFUND_PHRASES[lang], ...extra[lang]]));
  }
  assert.deepEqual(errors, []);
});

test("Trang chủ, Tính năng, Về chúng tôi, Giải pháp, Tải xuống: 'thẻ quốc tế' ở tiêu đề phần giá, không lặp 'bằng', giá Free ở hàng thẻ là '—', hóa đơn đúng với từng cách trả, giới hạn nước của thẻ", () => {
  const errors = [];
  for (const [urlPath, lang] of [["/", "vi"], ["/en/", "en"]]) {
    const text = textOf(htmlByPath.get(urlPath));
    errors.push(...needsIn(urlPath, text, [lang === "vi" ? "Bốn gói đơn giản, trả trước bằng VietQR hoặc thẻ quốc tế" : "Four simple plans, prepaid by VietQR or international card"]));
    errors.push(...forbidsIn(urlPath, text, lang === "vi" ? ["VietQR hoặc thẻ Không", "không bất ngờ trên hóa đơn"] : ["VietQR or card No auto-renewal", "no surprises on your bill"]));
  }
  for (const p of pages.filter((x) => x.lang === "vi")) errors.push(...forbidsIn(p.path, textOf(htmlByPath.get(p.path)), ["bằng thẻ quốc tế bằng"]));
  // Tính năng: hàng giá VietQR (VND) và hàng giá thẻ (USD, chưa gồm thuế); Free ở hàng thẻ không có giá USD.
  for (const [urlPath, lang, vndLabel, usdLabel] of [
    ["/tinh-nang/", "vi", "Giá (VietQR, VND)", "Giá (thẻ quốc tế, USD, chưa gồm thuế)"],
    ["/en/features/", "en", "Price (VietQR, VND)", "Price (international card, USD, excluding tax)"],
  ]) {
    const vndCells = compareRow(urlPath, vndLabel);
    const usdCells = compareRow(urlPath, usdLabel);
    const wantVnd = PLANS.map((p) => vnd(p.priceVnd, lang));
    const wantUsd = PLANS.map((p) => (p.priceUsdCents > 0 ? usd(p.priceUsdCents, lang) : "—"));
    if (JSON.stringify(vndCells) !== JSON.stringify(wantVnd)) errors.push(`${urlPath}: hàng "${vndLabel}" = ${JSON.stringify(vndCells)}, cần ${JSON.stringify(wantVnd)}`);
    if (JSON.stringify(usdCells) !== JSON.stringify(wantUsd)) errors.push(`${urlPath}: hàng "${usdLabel}" = ${JSON.stringify(usdCells)}, cần ${JSON.stringify(wantUsd)}`);
  }
  // Về chúng tôi: hóa đơn điện tử Việt Nam chỉ chưa có cho đơn VietQR; đơn thẻ có biên lai của Creem.
  for (const [urlPath, row, needs, olds] of [
    ["/ve-chung-toi/", "Thanh toán", ["thẻ quốc tế bằng USD qua Creem", "Chưa có hóa đơn điện tử Việt Nam cho đơn VietQR; đơn thẻ có biên lai của Creem"], ["qua Creem. Chưa có hóa đơn điện tử."]],
    ["/en/about/", "Payments", ["international cards in USD through Creem", "No Vietnamese e-invoices yet for VietQR orders; card orders get a receipt from Creem"], ["through Creem. No e-invoices yet."]],
  ]) {
    const text = rowText(htmlByPath.get(urlPath), row);
    if (!text) errors.push(`${urlPath}: không có hàng "${row}"`);
    errors.push(...needsIn(`${urlPath} hàng "${row}"`, text, needs), ...forbidsIn(`${urlPath} hàng "${row}"`, text, olds));
  }
  // Giải pháp và Tải xuống nêu giới hạn của thẻ (không nhận người mua ở một số nước theo danh sách của Creem), không bịa danh sách.
  const limit = { vi: "Thẻ không nhận được ở một số nước, theo danh sách của Creem.", en: "Cards are not accepted in some countries, per Creem's list." };
  for (const [urlPath, lang] of [["/giai-phap/", "vi"], ["/en/solutions/", "en"], ["/tai-xuong/", "vi"], ["/en/download/", "en"]]) errors.push(...needsIn(urlPath, textOf(htmlByPath.get(urlPath)), [limit[lang]]));
  // Trang chủ (hỏi đáp "ngoài Việt Nam có mua được không") và Bảng giá (khung "Thanh toán từ nước ngoài") cũng nói cùng giới hạn đó.
  for (const [urlPath, lang, question] of [["/", "vi", "Tôi ở ngoài Việt Nam có mua được không?"], ["/en/", "en", "Can I pay from outside Vietnam?"]]) {
    errors.push(...needsIn(`${urlPath} hỏi đáp "${question}"`, faqAnswer(urlPath, question), [limit[lang]]));
  }
  for (const [urlPath, lang, title] of [["/bang-gia/", "vi", "Thanh toán từ nước ngoài"], ["/en/pricing/", "en", "Paying from outside Vietnam"]]) {
    const html = htmlByPath.get(urlPath);
    const from = html.indexOf(title);
    errors.push(...needsIn(`${urlPath} khung "${title}"`, from < 0 ? "" : textOf(html.slice(from, html.indexOf("</div>", from))), [limit[lang]]));
  }
  for (const [urlPath, id, needles] of [
    ["/giai-phap/", "chua-phu-hop", ["không có tài khoản ngân hàng Việt Nam", "Creem không nhận người mua từ một số nước", "không có PayPal", "gói Free dùng thử vẫn dùng được"]],
    ["/en/solutions/", "not-a-fit", ["no Vietnamese bank account", "which does not accept buyers from some countries", "no PayPal", "the Free trial still works"]],
  ]) {
    const html = htmlByPath.get(urlPath);
    const from = html.indexOf(`id="${id}"`);
    errors.push(...needsIn(`${urlPath} #${id}`, textOf(html.slice(from, html.indexOf("</section>", from))), needles));
  }
  assert.deepEqual(errors, []);
});

test("mọi nguồn chữ nêu giá USD của một gói đều nói giá chưa gồm thuế (W2): thân trang, bề mặt, JSON-LD và từng đoạn của llms; số USD và 'thẻ quốc tế' không bị ngắt dòng giữa chừng", async () => {
  assert.equal(glue("<p>Monthly 3,99 USD</p>"), "<p>Monthly 3,99&nbsp;USD</p>");
  assert.equal(glue("<p>bằng thẻ quốc tế bằng USD</p>"), "<p>bằng thẻ quốc&nbsp;tế bằng USD</p>");
  assert.equal(glue("<p>quốc gia, quốc tịch</p>"), "<p>quốc gia, quốc tịch</p>");
  assert.equal(glue("<code>3 USD quốc tế</code>"), "<code>3 USD quốc tế</code>");
  // Mỗi nguồn chữ của một trang (thân trang, mô tả, alt, JSON-LD, …) và mỗi đoạn của llms (một dòng của llms.txt, một trang của llms-full*.txt):
  // đoạn nào nêu giá USD của một gói thì chính đoạn đó nói giá chưa gồm thuế. Hàm thuần scanTax có test âm cố định (lỗi báo, chữ đúng không báo).
  assert.equal(scanTax(new Map([["/x/ [meta]", "Monthly 3,99 USD, Yearly 39,99 USD."]])).length, 1);
  assert.equal(scanTax(new Map([["llms.txt", "- Pricing: Monthly $3.99, Yearly $39.99, excluding tax\n- Other: Monthly $3.99"]])).length, 1, "mỗi dòng llms.txt tự nói thuế");
  assert.equal(scanTax(new Map([["llms-full.txt", "# A\nMonthly $3.99 excluding tax\n---\n# B\nYearly $39.99"]])).length, 1, "mỗi trang llms-full tự nói thuế");
  assert.deepEqual(scanTax(new Map([["/x/", "Monthly 3,99 USD, chưa gồm thuế."], ["/y/ [json-ld]", "Paid by card; price excludes tax.\n3.99 USD"], ["/z/", "Free: 0,00 USD."]])), []);
  const errors = scanTax(await siteTexts());
  // Trang đã dựng: trong chữ của thân trang (bỏ <code>), "số + USD" và "quốc tế" dùng khoảng trắng không ngắt.
  for (const p of pages) {
    const main = (/<main id="main">([\s\S]*)<\/main>/.exec(htmlByPath.get(p.path))?.[1] ?? "").replace(/<code>[\s\S]*?<\/code>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
    for (const m of main.matchAll(/(?<=>)[^<]+/g)) {
      const bad = /\d USD(?![\p{L}])/u.exec(m[0]) ?? /(?<![\p{L}])quốc tế(?![\p{L}])/u.exec(m[0]);
      if (bad) errors.push(`${p.path}: ngắt dòng được ở "${m[0].slice(Math.max(0, bad.index - 15), bad.index + 20).trim()}"`);
    }
  }
  assert.deepEqual(errors.slice(0, 10), []);
});

test("bảng so sánh gói: mỗi hàng có đủ số ô như hàng tiêu đề (không sót ô khi thêm một gói)", () => {
  const errors = [];
  let tables = 0;
  for (const p of pages) {
    for (const table of htmlByPath.get(p.path).matchAll(/<table class="compare">([\s\S]*?)<\/table>/g)) {
      if (!/<th scope="col">Monthly<\/th>/.test(table[1])) continue;
      tables++;
      const cells = [...table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => (r[1].match(/<t[hd][ >]/g) ?? []).length);
      if (new Set(cells).size !== 1 || cells[0] !== 5) errors.push(`${p.path}: số ô mỗi hàng ${cells.join(",")} (cần 5 ở mọi hàng)`);
      if (!/<th scope="col">6 Months<\/th>/.test(table[1])) errors.push(`${p.path}: bảng thiếu cột 6 Months`);
    }
  }
  assert.equal(tables, 4, "phải có đúng 4 bảng so sánh gói (Bảng giá và Tính năng, mỗi trang hai ngôn ngữ)");
  assert.deepEqual(errors, []);
});

test("không còn câu liệt kê chỉ Monthly và Yearly: mọi chỗ nêu cả hai gói phải nêu cả 6 Months", () => {
  // "Monthly … (hoặc|và|or|and|·|,) Yearly" trong cùng một câu mà giữa hai chữ không có "6 Months".
  const stale = /.{0,40}Monthly(?:(?!6 Months|\. )[\s\S]){0,120}?(?:hoặc|và|or|and|·|,) Yearly.{0,30}/;
  const errors = [];
  for (const p of pages) {
    const text = [textOf(htmlByPath.get(p.path)), p.title, p.description, p.llm ?? ""].join(" \n ");
    const m = text.match(stale);
    if (m) errors.push(`${p.path}: …${m[0]}…`);
  }
  assert.deepEqual(errors, []);
});

// ---- Hardening Creem D1: hướng dẫn mua key khớp chữ của app (C2, C3), mục "Đơn này không thành", đừng trả lại ----

/** Từ điển i18n của app (khóa → chữ) của một ngôn ngữ: nguồn chữ thật trên màn hình Nâng cấp. */
async function appDict(lang) {
  const raw = await readFile(path.join(ROOT, "..", "src", "i18n", `${lang}.ts`), "utf8");
  const out = {};
  for (const m of raw.matchAll(/^ {2}"([\w.]+)": ("(?:[^"\\]|\\.)*"),$/gm)) {
    try {
      out[m[1]] = JSON.parse(m[2]);
    } catch (e) {
      // Chuỗi TypeScript hợp lệ nhưng không phải JSON (escape \' hay \x..): nêu rõ khóa nào, đừng để SyntaxError trơ trụi.
      throw new Error(`src/i18n/${lang}.ts: không đọc được chuỗi "${m[1]}" như JSON (${e.message}); sửa chuỗi đó hay sửa appDict()`);
    }
  }
  return out;
}

/** Chữ của app có chỗ trống `{code}`, `{time}`; hướng dẫn viết "…" thay chỗ trống ("Đơn …", "Trả trước …"). */
const blanked = (s) => s.replace(/\s*\{\w+\}\.?$/, " …").replace(/\{\w+\}/g, "…");

/** Hai bài hướng dẫn mua gói: `steps` là mục các bước mua trong app, `problems` là mục sự cố thanh toán và hoàn tiền. */
const BUY_GUIDE = {
  vi: { path: "/huong-dan/mua-va-kich-hoat-key/", steps: "mua-goi", problems: "hoan-tien" },
  en: { path: "/en/guide/buy-and-activate/", steps: "buy", problems: "refunds" },
};

/** Chữ thuần của một mục h2 của bài (hết ở h2 kế tiếp hay hết phần bài, không lấy phần chân trang). */
const guideSection = (urlPath, id) => textOf(pageSection(urlPath, id).split("</article>")[0]);

test("hướng dẫn mua gói trích đúng chữ trên màn hình Nâng cấp của app (từ điển i18n vi và en), mỗi chuỗi ở đúng mục", async () => {
  // Chữ nút, nhãn và thông báo trong hướng dẫn phải khớp từ điển của app, để người đọc tìm thấy đúng thứ họ thấy trên màn hình.
  // Mỗi khóa phải nằm ở mục của nó (không chỉ đâu đó trong bài): chữ trên màn hình ở các bước, thông báo lỗi ở mục sự cố.
  const where = {
    steps: [
      "upgrade.method", "upgrade.method.vnd", "upgrade.method.usd", "upgrade.email", "upgrade.pay", "upgrade.payCard", "upgrade.openPage",
      "upgrade.browser.title", "upgrade.linkExpiresPage", "upgrade.reopen", "upgrade.order.waitingCard", "upgrade.order.paid", "legal.privacy", "legal.eula",
    ],
    problems: [
      "upgrade.order", "upgrade.order.underpaid", "upgrade.order.needsReview", "upgrade.order.waitingCard", "upgrade.order.waitingCardLate", "upgrade.order.failedCard", "upgrade.browser.cancelNote",
    ],
  };
  const errors = [];
  for (const [lang, g] of Object.entries(BUY_GUIDE)) {
    const d = await appDict(lang);
    for (const [section, keys] of Object.entries(where)) {
      const text = guideSection(g.path, g[section]);
      if (!text) errors.push(`${g.path}: không có mục #${g[section]}`);
      for (const k of keys) {
        if (!d[k]) errors.push(`${lang}: không đọc được khóa ${k} của từ điển app`);
        else if (!text.includes(blanked(d[k]))) errors.push(`${g.path}#${g[section]}: không trích "${blanked(d[k])}" (${k})`);
      }
    }
  }
  assert.deepEqual(errors, []);
});

test("HowTo JSON-LD của hướng dẫn mua gói: năm bước đánh số, chữ nút khớp app, nêu thẻ quốc tế, Creem và dặn đừng trả lại", async () => {
  // `textOf` bỏ <script> nên các test chữ ở trên không thấy JSON-LD: đọc thẳng từ HTML.
  const errors = [];
  for (const [lang, g] of Object.entries(BUY_GUIDE)) {
    const d = await appDict(lang);
    const html = htmlByPath.get(g.path);
    const graph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1])["@graph"];
    const howTos = graph.filter((n) => n["@type"] === "HowTo");
    if (howTos.length !== 1) {
      errors.push(`${g.path}: ${howTos.length} nút HowTo (cần đúng 1)`);
      continue;
    }
    const steps = howTos[0].step ?? [];
    if (steps.length !== 5) errors.push(`${g.path}: ${steps.length} bước trong HowTo (cần 5)`);
    steps.forEach((s, i) => {
      if (s["@type"] !== "HowToStep" || s.position !== i + 1 || !s.name || !s.text) errors.push(`${g.path}: bước ${i + 1} của HowTo không đủ @type, position, name, text`);
    });
    const text = steps.map((s) => `${s.name} ${s.text}`).join(" ");
    const need =
      lang === "vi"
        ? ["thẻ quốc tế", "Creem", "30 phút", "đừng trả lại", "Cài đặt › Bản quyền"]
        : ["international card", "Creem", "30 minutes", "do not pay again", "Settings › License"];
    for (const k of ["upgrade.method", "upgrade.method.vnd", "upgrade.method.usd", "upgrade.email", "upgrade.pay", "upgrade.payCard", "upgrade.openPage"]) {
      if (!d[k]) errors.push(`${lang}: không đọc được khóa ${k} của từ điển app`);
      else need.push(d[k]);
    }
    errors.push(...needsIn(`${g.path} (HowTo)`, text, need));
    // Bước chọn cách trả đứng trước bước nhập email và bấm nút: cách trả quyết định giá và nút bấm.
    const at = (needle) => steps.findIndex((s) => `${s.name} ${s.text}`.includes(needle));
    if (!(at(d["upgrade.method"]) >= 0 && at(d["upgrade.method"]) < at(d["upgrade.payCard"]))) errors.push(`${g.path} (HowTo): bước chọn "${d["upgrade.method"]}" phải đứng trước bước bấm "${d["upgrade.payCard"]}"`);
  }
  assert.deepEqual(errors, []);
});

test("hướng dẫn mua gói và hỏi đáp: đơn thẻ không thành hay quá giờ hẹn thì đừng trả lại, key vẫn gửi qua email, nơi tra biên lai, giá USD chưa gồm thuế (bảng tóm tắt, bước chọn gói, đoạn sau ảnh, hỏi đáp), hoàn tiền giống EULA; không còn câu cũ", async () => {
  const cfg = {
    vi: {
      steps: [
        "chọn sẵn theo nước nơi bạn kết nối mạng", "cập nhật app lên bản mới nhất", "Bấm vào khung", "gửi cho Creem để điền sẵn trang thanh toán", "trả trong 30 phút", "đừng trả lại", "cách thanh toán và gói bị khóa",
        "VietQR chỉ dùng được với tài khoản ngân hàng Việt Nam", "thẻ quốc tế chưa được bán lúc này mà bạn không có tài khoản đó, hãy liên hệ hỗ trợ", "sao kê thẻ thường ghi",
        // Giá USD chưa gồm thuế ở cả hai chỗ người đọc thấy giá: bước chọn khung gói và đoạn sau ảnh (không chỉ ở hàng "Thanh toán" của bảng tóm tắt).
        "giá USD chưa gồm thuế", "Giá thẻ quốc tế tính bằng USD, chưa gồm thuế (nếu có thì Creem cộng thêm ở trang thanh toán)",
      ],
      problems: [
        "không thành", "đừng trả lại", "key vẫn gửi qua email", "Cài đặt › Bản quyền", "sao kê thẻ thường ghi", "CREEM.IO* STORE", "creem.io/my-orders/login", "kèm mã đơn và biên lai của Creem",
        "Đơn VietQR: “Số tiền nhận được ít hơn giá gói", "Đơn thẻ trả thiếu", "đừng trả thêm",
        "Đơn thẻ: Creem là bên bán lại", "Đơn VietQR chưa có hóa đơn điện tử", "liên hệ hỗ trợ", ...REFUND_PHRASES.vi,
      ],
      old: [
        "Đơn được giữ 30 phút", "Đang chờ thanh toán…", "Mục này chỉ hiện khi cả hai cách trả đều đang bán", "Trang thanh toán dùng được tới", "thẻ Monthly", "thẻ đã chọn", "thẻ Hoàn tất",
        "Chúng tôi chưa xuất hóa đơn điện tử", "sao kê thẻ có thể ghi", "có thể lệch một ngày", ...REFUND_OLD.vi,
      ],
      faq: "/cau-hoi-thuong-gap/",
      qCard: "Tôi trả tiền bằng cách nào? Trả bằng thẻ quốc tế được không?",
      faqNeed: ["cập nhật app lên bản mới nhất", "trong 30 phút", "đừng trả lại", "chưa gồm thuế"],
      factRow: "Thanh toán",
      fact: ["VietQR", "thẻ quốc tế", "Creem", "Giá USD chưa gồm thuế", "không tự gia hạn"],
    },
    en: {
      steps: [
        "based on the country you connect from", "Update the app to the latest version", "Click the Monthly", "sent to Creem to pre-fill the payment page", "Pay within 30 minutes", "do not pay again", "payment method and plan are locked",
        "VietQR works only with a Vietnamese bank account", "card payment is not available right now", "if you change the payment method, tick the box again", "if card payment is not available right now and you have no such account, contact support", "your card statement usually shows",
        "USD prices exclude tax", "Card prices are in USD, excluding tax (if any; Creem adds it on the payment page)",
      ],
      problems: [
        "did not go through", "do not pay again", "your key is still emailed", "Settings › License", "card statement usually shows", "CREEM.IO* STORE", "creem.io/my-orders/login", "with the order number and your Creem receipt",
        "VietQR order: “The amount received is less than the price", "A card order paid short", "do not pay more",
        "Card orders: Creem is the merchant of record", "VietQR orders have no electronic invoice yet", "contact support", ...REFUND_PHRASES.en,
      ],
      old: [
        "The order is kept for 30 minutes", "Waiting for your payment…", "only appears when both ways to pay are on sale", "The payment page works until", "Monthly card", "selected card",
        "Finish paying in your browser card", "We do not issue e-invoices yet", "international card is not on sale right now", "(change the payment method and you tick again)", "card statement may show", "can differ by one day", ...REFUND_OLD.en,
      ],
      faq: "/en/faq/",
      qCard: "How do I pay? Can I pay by international card?",
      faqNeed: ["update the app to the latest version", "within 30 minutes", "do not pay again", "excluding tax"],
      factRow: "Payment",
      fact: ["VietQR", "international card", "Creem", "USD prices exclude tax", "no auto-renewal"],
    },
  };
  const errors = [];
  for (const [lang, c] of Object.entries(cfg)) {
    const g = BUY_GUIDE[lang];
    const d = await appDict(lang);
    errors.push(...needsIn(`${g.path}#${g.steps}`, guideSection(g.path, g.steps), c.steps));
    errors.push(...needsIn(`${g.path}#${g.problems}`, guideSection(g.path, g.problems), c.problems));
    // Câu cũ: quét cả chữ lẫn alt của ảnh (textOf bỏ thuộc tính).
    const html = htmlByPath.get(g.path);
    const alts = [...html.matchAll(/ alt="([^"]*)"/g)].map((m) => decode(m[1])).join(" \n ");
    errors.push(...forbidsIn(g.path, `${textOf(html)} \n ${alts}`, c.old));
    const answer = faqAnswer(c.faq, c.qCard);
    errors.push(...needsIn(`${c.faq} "${c.qCard}"`, answer, [d["upgrade.method"], ...c.faqNeed]));
    // Bảng tóm tắt đầu bài: hàng "Thanh toán" tự nói giá USD chưa gồm thuế (không dựa vào chữ ở mục khác).
    const fact = textOf(new RegExp(`<dt>${c.factRow}</dt><dd>([\\s\\S]*?)</dd>`).exec(html)?.[1] ?? "");
    if (!fact) errors.push(`${g.path}: không có hàng "${c.factRow}" ở bảng tóm tắt đầu bài`);
    errors.push(...needsIn(`${g.path} hàng "${c.factRow}"`, fact, c.fact));
  }
  assert.deepEqual(errors, []);
});

test("meta description của hướng dẫn mua gói không quá 160 ký tự (Google cắt khoảng 155 đến 160; trần chung của test là 165)", () => {
  const errors = [];
  for (const g of Object.values(BUY_GUIDE)) {
    const desc = decode(/<meta name="description" content="([^"]*)"/.exec(htmlByPath.get(g.path))?.[1] ?? "");
    if (desc.length < 90 || desc.length > 160) errors.push(`${g.path}: description ${desc.length} ký tự`);
  }
  assert.deepEqual(errors, []);
});

// ---- Hardening Creem D1/D2, lượt sửa theo rà soát (I1, M1, M5) ----

test("không nguồn chữ nào (kể cả bề mặt ngoài thân trang và ba file llms) nói đơn thẻ 'được giữ 30 phút': hãy trả trong 30 phút, đã trả thì đừng trả lại (quyết định Q3: đơn thẻ không báo thất bại sớm)", async () => {
  // Luật dùng chung với test câu cũ (STALE_HOLD30); ở đây quét riêng để câu "được giữ 30 phút" báo đỏ đúng test mang tên nó.
  const errors = scanStale(await siteTexts(), STALE_HOLD30);
  // Bước "Trả tiền" ở Cách mua của Bảng giá: nói chữ của Q3 thay cho câu cũ.
  for (const [urlPath, needs] of [
    ["/bang-gia/", ["hãy trả trong 30 phút. Nếu bạn đã trả, key sẽ gửi qua email; đừng trả lại."]],
    ["/en/pricing/", ["pay within 30 minutes. If you have paid, your key will be sent by email; do not pay again."]],
  ]) errors.push(...needsIn(urlPath, textOf(htmlByPath.get(urlPath)), needs));
  assert.deepEqual(errors, []);
});

test("Bảng giá, bước đầu của Cách mua: chọn Cách thanh toán trước, rồi mới chọn gói (như màn hình Nâng cấp của app và hướng dẫn mua gói)", async () => {
  const errors = [];
  for (const [lang, urlPath, open] of [["vi", "/bang-gia/", "Mở Nâng cấp Pro"], ["en", "/en/pricing/", "Open Upgrade to Pro"]]) {
    const method = (await appDict(lang))["upgrade.method"];
    const text = textOf(htmlByPath.get(urlPath));
    const from = text.indexOf(open);
    if (from < 0) {
      errors.push(`${urlPath}: không thấy bước "${open}"`);
      continue;
    }
    // Bước này kết thúc ở chữ của bước kế (bước Trả tiền ghi "VietQR:").
    const step = text.slice(from, text.indexOf("VietQR:", from));
    const at = { method: step.indexOf(method), plan: step.indexOf("Monthly") };
    if (at.method < 0) errors.push(`${urlPath}: bước chọn gói không nhắc "${method}" (${step.slice(0, 120)})`);
    else if (at.plan < 0 || at.method > at.plan) errors.push(`${urlPath}: "${method}" phải đứng trước tên gói trong bước đầu của Cách mua`);
  }
  assert.deepEqual(errors, []);
});

test("hướng dẫn mua gói, mục gia hạn và đổi gói: công thức dùng giá của cả hai gói bằng loại tiền của đơn đổi gói; ví dụ lệch nhiều ngày giữa VND và USD tính đúng từ giá trong plans.mjs", () => {
  const price = (code) => PLANS.find((p) => p.code === code);
  // 6 Months còn 180 ngày, mua Monthly: ngày quy đổi = floor(còn × (giá cũ ÷ ngày cũ) ÷ (giá mới ÷ ngày mới)), giá cùng loại tiền với đơn.
  const converted = (key) => Math.floor((180 * price("six_months")[key] * price("monthly").days) / (price("monthly")[key] * price("six_months").days));
  const days = { vnd: converted("priceVnd"), usd: converted("priceUsdCents") };
  const errors = [];
  if (days.vnd === days.usd) errors.push(`ví dụ không còn minh họa chênh lệch (VND ${days.vnd}, USD ${days.usd}): đổi ví dụ ở hướng dẫn mua gói`);
  for (const [urlPath, id, needs, olds] of [
    ["/huong-dan/mua-va-kich-hoat-key/", "gia-han-doi-goi", [
      "công thức dùng giá của cả hai gói tính bằng loại tiền của đơn đổi gói", "ở các ví dụ này chỉ lệch tối đa một ngày", `${days.vnd} ngày khi trả bằng VND và ${days.usd} ngày khi trả bằng USD`,
    ], ["có thể lệch một ngày"]],
    ["/en/guide/buy-and-activate/", "renew-change", [
      "the formula uses the prices of both plans in the currency of the plan-change order", "in these examples by at most one day", `${days.vnd} days when paying in VND and ${days.usd} days when paying in USD`,
    ], ["can differ by one day"]],
  ]) {
    const text = guideSection(urlPath, id);
    if (!text) errors.push(`${urlPath}: không có mục #${id}`);
    errors.push(...needsIn(`${urlPath}#${id}`, text, needs), ...forbidsIn(`${urlPath}#${id}`, text, olds));
  }
  assert.deepEqual(errors, []);
});
