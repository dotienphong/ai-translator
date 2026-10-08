// Sinh website tĩnh vào website/dist. Không phụ thuộc thư viện: Node thuần.
//   node src/build/build.mjs
// Đầu ra: HTML từng trang (VI ở gốc, EN ở /en/), CSS/JS có băm nội dung, sitemap.xml (hreflang), robots.txt, llms.txt,
// llms-full.txt, _headers (CSP chặt, băm của script nội tuyến), 404.html, manifest, security.txt.
import { mkdir, rm, writeFile, readFile, cp, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SITE, T } from "../site.mjs";
import { renderPage, THEME_INIT_HASH } from "./layout.mjs";
import { pages, notFound } from "../content/index.mjs";
import { htmlToText } from "./text.mjs";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const ROOT = path.resolve(SRC, "..");
// WEBSITE_DIST cho phép nhiều tiến trình dựng song song vào thư mục riêng (kiểm thử, agent) mà không đè dist/.
export const DIST = process.env.WEBSITE_DIST ? path.resolve(process.env.WEBSITE_DIST) : path.join(ROOT, "dist");

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 10);
const abs = (p) => SITE.origin + p;
const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function copyDir(from, to) {
  await cp(from, to, { recursive: true });
}

async function writeOut(rel, data) {
  const file = path.join(DIST, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

function pageFile(p) {
  return p.path.endsWith("/") ? p.path + "index.html" : p.path;
}

function sitemap(list, byId) {
  const urls = list
    .filter((p) => !p.noindex)
    .map((p) => {
      const alts = (byId.get(p.id) ?? [])
        .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.lang}" href="${abs(a.path)}"/>`)
        .concat(
          (byId.get(p.id) ?? []).length > 1
            ? [`    <xhtml:link rel="alternate" hreflang="x-default" href="${abs((byId.get(p.id).find((a) => a.lang === SITE.defaultLang) ?? p).path)}"/>`]
            : [],
        );
      return `  <url>\n    <loc>${abs(p.path)}</loc>\n    <lastmod>${p.modified ?? p.published ?? SITE.updated}</lastmod>\n${alts.join("\n")}\n  </url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}

function robots() {
  const bots = [
    "OAI-SearchBot", "ChatGPT-User", "GPTBot", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
    "Google-Extended", "Applebot", "Applebot-Extended", "Bingbot", "DuckDuckBot", "CCBot", "meta-externalagent", "Amazonbot",
  ];
  return `# ${SITE.name} — ${SITE.origin}
# Cho phép mọi trình thu thập, kể cả trình thu thập của công cụ tìm kiếm AI, để nội dung được trích dẫn đúng.
# Muốn chặn huấn luyện AI: đổi ai-train=yes thành ai-train=no (và Disallow các bot huấn luyện bên dưới).
Content-Signal: search=yes, ai-input=yes, ai-train=yes

User-agent: *
Allow: /

${bots.map((b) => `User-agent: ${b}\nAllow: /\n`).join("\n")}
Sitemap: ${abs("/sitemap.xml")}
`;
}

function llmsTxt(list) {
  const doc = (lang) =>
    list
      .filter((p) => p.lang === lang && !p.noindex && p.llm)
      .map((p) => `- [${p.llmTitle ?? p.title}](${abs(p.path)}): ${p.llm}`)
      .join("\n");
  return `# ${SITE.name}

> ${SITE.llmSummaryEn}

${SITE.llmSummaryVi}

Provider / Bên cung cấp: ${SITE.owner}. Contact / Liên hệ: ${SITE.email}. Website: ${SITE.origin}/

## English

${doc("en")}

## Tiếng Việt

${doc("vi")}

## Optional

- [Full text of key pages, English](${abs("/llms-full.txt")}): home, features, pricing, FAQ, data and security, comparison, about, as plain text.
- [Toàn văn các trang chính, tiếng Việt](${abs("/llms-full.vi.txt")}): trang chủ, tính năng, giá, hỏi đáp, bảo mật, so sánh, về chúng tôi, dạng chữ thuần.
`;
}

// Toàn văn các trang chính (không gồm hướng dẫn từng bước và pháp lý: đã có liên kết trong llms.txt), tách theo ngôn ngữ để
// mỗi tệp đủ nhỏ cho trợ lý AI đọc một lần.
function llmsFull(list, ctx, lang) {
  const head = lang === "en" ? SITE.llmSummaryEn : SITE.llmSummaryVi;
  const parts = [`# ${SITE.name} — full text (${lang === "en" ? "English" : "Tiếng Việt"})\n\n> ${head}\n`];
  for (const p of list.filter((x) => x.lang === lang && !x.noindex && x.llm && x.full !== false && !x.id.startsWith("guide"))) {
    const body = typeof p.body === "function" ? p.body(ctx) : p.body;
    parts.push(`\n---\n\n# ${p.title}\n\nURL: ${abs(p.path)}\nUpdated: ${p.modified ?? SITE.updated}\n\n${htmlToText(body)}`);
  }
  return parts.join("\n") + "\n";
}

function headers() {
  const csp = [
    "default-src 'self'",
    `script-src 'self' '${THEME_INIT_HASH}'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  return `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: ${csp}

/assets/bundle/*
  Cache-Control: public, max-age=31536000, immutable

/assets/fonts/*
  Cache-Control: public, max-age=2592000
/assets/img/*
  Cache-Control: public, max-age=2592000
/assets/og/*
  Cache-Control: public, max-age=2592000

# Trang HTML (đường dẫn kết thúc bằng /, sâu tới 3 cấp): no-transform để Cloudflare không tự chèn script đo (RUM/Web
# Analytics) vào trang; CSP của trang sẽ chặn script đó và gây lỗi console. Giữ đúng giá trị mặc định của Workers Assets.
/
  Cache-Control: public, max-age=0, must-revalidate, no-transform
/:a/
  Cache-Control: public, max-age=0, must-revalidate, no-transform
/:a/:b/
  Cache-Control: public, max-age=0, must-revalidate, no-transform
/:a/:b/:c/
  Cache-Control: public, max-age=0, must-revalidate, no-transform

/favicon.svg
  Cache-Control: public, max-age=604800
/apple-touch-icon.png
  Cache-Control: public, max-age=604800

/sitemap.xml
  Cache-Control: public, max-age=3600
/robots.txt
  Cache-Control: public, max-age=3600
  Content-Type: text/plain; charset=utf-8
/llms.txt
  Cache-Control: public, max-age=3600
  Content-Type: text/plain; charset=utf-8
/llms-full.txt
  Cache-Control: public, max-age=3600
  Content-Type: text/plain; charset=utf-8
/llms-full.vi.txt
  Cache-Control: public, max-age=3600
  Content-Type: text/plain; charset=utf-8
`;
}

export async function build() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  // 1. Tài nguyên tĩnh
  await copyDir(path.join(SRC, "assets", "fonts"), path.join(DIST, "assets", "fonts"));
  for (const sub of ["img", "og"]) {
    try {
      await copyDir(path.join(SRC, "assets", sub), path.join(DIST, "assets", sub));
    } catch {
      /* thư mục chưa có */
    }
  }
  try {
    for (const f of await readdir(path.join(SRC, "public"))) await cp(path.join(SRC, "public", f), path.join(DIST, f), { recursive: true });
  } catch {
    /* chưa có */
  }
  const css = await readFile(path.join(SRC, "assets", "site.css"));
  const js = await readFile(path.join(SRC, "assets", "site.js"));
  const assets = { css: `/assets/bundle/site.${sha(css)}.css`, js: `/assets/bundle/site.${sha(js)}.js` };
  await writeOut(assets.css.slice(1), css);
  await writeOut(assets.js.slice(1), js);

  // 2. Trang
  const list = pages;
  const byId = new Map();
  for (const p of list) byId.set(p.id, [...(byId.get(p.id) ?? []), p]);
  const seen = new Set();
  for (const p of list) {
    if (seen.has(p.path)) throw new Error(`Trùng đường dẫn: ${p.path}`);
    seen.add(p.path);
  }
  const ctx = { pages: list, byId, assets };
  for (const p of list) await writeOut(pageFile(p), renderPage(p, ctx));
  await writeOut("404.html", renderPage(notFound, { ...ctx, byId: new Map([[notFound.id, [notFound]]]) }));

  // 3. Tệp cho máy
  await writeOut("sitemap.xml", sitemap(list, byId));
  await writeOut("robots.txt", robots());
  await writeOut("llms.txt", llmsTxt(list));
  await writeOut("llms-full.txt", llmsFull(list, ctx, "en"));
  await writeOut("llms-full.vi.txt", llmsFull(list, ctx, "vi"));
  await writeOut("_headers", headers());
  await writeOut(
    ".well-known/security.txt",
    `Contact: mailto:${SITE.email}\nExpires: ${SITE.securityExpires}\nPreferred-Languages: vi, en\nCanonical: ${abs("/.well-known/security.txt")}\n`,
  );
  return { count: list.length, assets };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { count, assets } = await build();
  console.log(`Đã sinh ${count} trang vào ${path.relative(process.cwd(), DIST) || "."} (${assets.css}, ${assets.js})`);
  void T;
}
