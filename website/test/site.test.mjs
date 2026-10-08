// Kiểm tra website đã sinh (dist): SEO cơ bản, hreflang, liên kết nội bộ, JSON-LD, CSP, giá khớp server.
//   node --test test/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, DIST } from "../src/build/build.mjs";
import { pages, missing } from "../src/content/index.mjs";
import { SITE } from "../src/site.mjs";
import { PLANS } from "../src/plans.mjs";

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
      const [target, hash] = url.split("#");
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

test("giá và hạn mức trên website khớp server/wrangler.jsonc", async () => {
  const raw = await readFile(path.join(ROOT, "..", "server", "wrangler.jsonc"), "utf8");
  const json = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
  const server = json.vars.PLANS;
  for (const code of ["monthly", "yearly"]) {
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
  assert.ok(h.includes("no-transform"), "HTML cần no-transform (chặn Cloudflare tự chèn script đo)");
});
