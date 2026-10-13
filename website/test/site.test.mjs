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
import { SITE } from "../src/site.mjs";
import { PLANS, vnd } from "../src/plans.mjs";

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

test("không lộ công nghệ lõi (tên model, engine, thư viện, kiến trúc) trong trang, llms.txt hay JSON-LD", async () => {
  const hits = [];
  const scan = (name, text) => {
    for (const m of text.matchAll(new RegExp(CORE_TECH.source, "gi"))) hits.push(`${name}: “${m[0]}” …${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}…`);
  };
  for (const p of pages) scan(p.path, htmlByPath.get(p.path));
  for (const f of ["llms.txt", "llms-full.txt"]) if (await exists(path.join(DIST, f))) scan(f, await readFile(path.join(DIST, f), "utf8"));
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

test("JSON-LD của trang giá liệt kê đủ bốn Offer, kể cả 6 Months 269000 ₫ trong 180 ngày", () => {
  const errors = [];
  for (const urlPath of ["/bang-gia/", "/en/pricing/"]) {
    const html = htmlByPath.get(urlPath);
    const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    const app = data["@graph"].find((n) => n["@type"] === "SoftwareApplication");
    const offers = app?.offers ?? [];
    const six = offers.find((o) => /6 Months/.test(o.name));
    if (offers.length !== 4) errors.push(`${urlPath}: ${offers.length} Offer (cần 4)`);
    if (!six || six.price !== "269000" || six.priceCurrency !== "VND" || six.eligibleDuration?.value !== 180) {
      errors.push(`${urlPath}: Offer 6 Months sai: ${JSON.stringify(six)}`);
    }
  }
  assert.deepEqual(errors, []);
});

test("llms.txt nêu giá cả ba gói trả phí, lấy từ plans.mjs", async () => {
  const llms = await readFile(path.join(DIST, "llms.txt"), "utf8");
  const line = llms.split("\n").find((l) => l.startsWith("- Pricing:")) ?? "";
  for (const p of PLANS.filter((x) => x.priceVnd > 0)) {
    assert.ok(line.includes(`${p.nameEn} ${vnd(p.priceVnd)}`), `llms.txt: thiếu "${p.nameEn} ${vnd(p.priceVnd)}" trong: ${line}`);
  }
});
