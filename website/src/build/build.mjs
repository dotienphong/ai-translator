// Sinh website tĩnh vào website/dist. Không phụ thuộc thư viện: Node thuần.
//   node src/build/build.mjs
// Đầu ra: HTML từng trang (VI ở gốc, các ngôn ngữ khác ở /en/, /ja/, /zh/, /ko/; xem langs.mjs), CSS/JS có băm nội dung, sitemap.xml (hreflang), robots.txt, llms.txt,
// llms-full.txt, _headers (CSP chặt, băm của script nội tuyến), 404.html, manifest, security.txt.
import { mkdir, rm, writeFile, readFile, cp, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SITE, T } from "../site.mjs";
import { renderPage, THEME_INIT_HASH } from "./layout.mjs";
import { pages, notFound } from "../content/index.mjs";
import { htmlToText } from "./text.mjs";
import { pinInstallers } from "./pin-installers.mjs";
import { PLANS, usd, vnd } from "../plans.mjs";
import { LANG_CODES, PUBLISHED, tagOf, homeOf, isHome } from "../langs.mjs";
import { API as CHAT_API } from "../assets/chat-core.js";

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
        .map((a) => `    <xhtml:link rel="alternate" hreflang="${tagOf(a.lang)}" href="${abs(a.path)}"/>`)
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
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Allow: /

${bots.map((b) => `User-agent: ${b}\nAllow: /\n`).join("\n")}
Sitemap: ${abs("/sitemap.xml")}
`;
}

/** Khối dữ kiện chính cho trợ lý AI: sinh từ SITE và PLANS để không lệch giá/phiên bản. Chỉ nêu điều có thật. */
function keyFacts() {
  const [free, monthly, sixMonths, yearly] = ["free", "monthly", "six_months", "yearly"].map((code) => PLANS.find((p) => p.code === code));
  return [
    `- Product: ${SITE.name} (aitranslator.vn), desktop app that shows live translated subtitles for meeting audio; speech recognition and translation run on the device`,
    `- Provider: ${SITE.owner} (independent developer, Vietnam); ${SITE.email}`,
    `- Current version: ${SITE.version} (released ${SITE.releaseDate}), official release for macOS and Windows`,
    `- Platforms: macOS 14.2+ on Apple Silicon (M1 or later); Windows 10/11 64-bit (x64) with AVX2. Not supported: Intel Macs, Windows ARM64`,
    `- Requirements: 8 GB RAM minimum (16 GB recommended); models download once, 1.3 GB (Lite pack) or 2.5 GB (Standard pack)`,
    `- Languages (speech and translation): English, Chinese, Japanese, Korean, Vietnamese (tiếng Anh, tiếng Trung, tiếng Nhật, tiếng Hàn, tiếng Việt); interface in Vietnamese, English, Japanese, Chinese (Simplified), Korean`,
    `- Measured latency: median 0.76–1.03 s with the Standard pack on a Mac M4 Pro 24 GB (macOS 26); preliminary Windows test on one laptop with integrated graphics: median 1.3–2.6 s (Lite), 2.7–5.4 s (Standard)`,
    `- Pricing: ${free.nameEn} trial ${free.days} days (${free.minutesPerDay} min/day, ${vnd(0)}); ${monthly.nameEn} ${vnd(monthly.priceVnd)} (${monthly.minutesPerCycle / 60} h per ${monthly.days} days); ${sixMonths.nameEn} ${vnd(sixMonths.priceVnd)} (${sixMonths.minutesPerCycle / 60} h per 30 days, ${sixMonths.days} days); ${yearly.nameEn} ${vnd(yearly.priceVnd)} (unlimited, ${yearly.days} days); prepaid, no auto-renewal; pay in VND by VietQR from a Vietnamese bank account, or in USD by international card (${monthly.nameEn} ${usd(monthly.priceUsdCents, "en")}, ${sixMonths.nameEn} ${usd(sixMonths.priceUsdCents, "en")}, ${yearly.nameEn} ${usd(yearly.priceUsdCents, "en")}, excluding tax)`,
    `- Install: macOS \`curl -fsSL ${SITE.origin}/install.sh | bash\`; Windows \`irm ${SITE.origin}/install.ps1 | iex\``,
    `- Privacy: no bot, no account, no ads, no analytics or cookies on the website; the app sends no audio or transcripts to any server; when the app hits an error it sends an error report with personal data scrubbed out (no audio, no transcript text), which you can turn off in Settings; not open source`,
  ].join("\n");
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

## Key facts / Dữ kiện chính

${keyFacts()}

## English

${doc("en")}

## Tiếng Việt

${doc("vi")}

## Optional

- [Full text of the main pages, English](${abs("/llms-full.txt")}): home, features, pricing, download, FAQ, data and security, comparison, solutions, about, contact, as plain text (step-by-step guides and legal texts are linked above).
- [Toàn văn các trang chính, tiếng Việt](${abs("/llms-full.vi.txt")}): trang chủ, tính năng, giá, tải xuống, hỏi đáp, bảo mật, so sánh, giải pháp, về chúng tôi, liên hệ, dạng chữ thuần (các bài hướng dẫn và văn bản pháp lý có liên kết ở trên).
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
    // Chat hỗ trợ gọi API của license server (spec chat hỗ trợ 2026-10-22, mục 3); không thêm nguồn nào khác.
    `connect-src 'self' ${CHAT_API}`,
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
/assets/video/*
  Cache-Control: public, max-age=2592000

# Trang HTML (đường dẫn kết thúc bằng /, sâu tới 3 cấp). Không đặt no-transform: có nó thì Cloudflare không nén (br/gzip)
# HTML (đo ngày 2026-10-09: 46 KB không nén so với khoảng 10 KB). Cloudflare Web Analytics tự chèn phải để TẮT ở zone, vì CSP
# của trang chặn script đo và sẽ gây lỗi console; sau mỗi lần deploy kiểm: curl -s <url> | grep -c cloudflareinsights phải ra 0.
/
  Cache-Control: public, max-age=0, must-revalidate
/:a/
  Cache-Control: public, max-age=0, must-revalidate
/:a/:b/
  Cache-Control: public, max-age=0, must-revalidate
/:a/:b/:c/
  Cache-Control: public, max-age=0, must-revalidate

/favicon.svg
  Cache-Control: public, max-age=604800
/favicon.ico
  Cache-Control: public, max-age=604800
/favicon-32.png
  Cache-Control: public, max-age=604800
/apple-touch-icon.png
  Cache-Control: public, max-age=604800
/site.webmanifest
  Cache-Control: public, max-age=604800

# Trang 404 phục vụ ở /404 (và /404.html chuyển tới đó): không cho lập chỉ mục.
/404
  X-Robots-Tag: noindex
/404.html
  X-Robots-Tag: noindex

/.well-known/security.txt
  Content-Type: text/plain; charset=utf-8

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

# Script cài macOS và Windows (public/install.sh, install.ps1): hiện dạng chữ thuần để người dùng đọc được trong trình duyệt; cache ngắn để bản
# sửa có hiệu lực nhanh; không cho công cụ tìm kiếm lập chỉ mục một file script.
/install.sh
  Cache-Control: public, max-age=300
  Content-Type: text/plain; charset=utf-8
  X-Robots-Tag: noindex
/install.ps1
  Cache-Control: public, max-age=300
  Content-Type: text/plain; charset=utf-8
  X-Robots-Tag: noindex
`;
}

/** Chat hỗ trợ (spec chat hỗ trợ 2026-10-22, mục 3): các ES module và CSS tên có mã băm. site.js tải chat-core.js khi khách đang
 *  chờ trả lời, chat.js và chat.css khi khách bấm bong bóng; đường dẫn đi qua thuộc tính data-chat-* của thẻ script (layout.mjs),
 *  nên không cần script nội tuyến mới. chat.js nhập "./chat-core.js" và "./chat-strings.js": hai dòng đó được đổi thành tên đã
 *  băm trước khi băm chính chat.js, nên sửa một file con thì tên chat.js cũng đổi (cache immutable không giữ bản cũ). */
async function chatAssets() {
  const out = {};
  const named = {};
  for (const [key, name] of [["core", "chat-core"], ["strings", "chat-strings"]]) {
    const buf = await readFile(path.join(SRC, "assets", `${name}.js`));
    out[key] = `/assets/bundle/${name}.${sha(buf)}.js`;
    named[`${name}.js`] = path.posix.basename(out[key]);
    await writeOut(out[key].slice(1), buf);
  }
  const ui = (await readFile(path.join(SRC, "assets", "chat.js"), "utf8")).replace(/from "\.\/([a-z-]+\.js)"/g, (m, f) => {
    if (!named[f]) throw new Error(`chat.js nhập file không có trong bundle: ${f}`);
    return `from "./${named[f]}"`;
  });
  const css = await readFile(path.join(SRC, "assets", "chat.css"));
  out.ui = `/assets/bundle/chat.${sha(ui)}.js`;
  out.css = `/assets/bundle/chat.${sha(css)}.css`;
  await writeOut(out.ui.slice(1), ui);
  await writeOut(out.css.slice(1), css);
  return out;
}

export async function build() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  // 1. Tài nguyên tĩnh
  await copyDir(path.join(SRC, "assets", "fonts"), path.join(DIST, "assets", "fonts"));
  for (const sub of ["img", "og", "video"]) {
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
  // Bản deploy: ghim số phiên bản và SHA-256 bộ cài vào hai script cài (xem pin-installers.mjs). Bản dựng thử để trống.
  if (SITE.pins) await pinInstallers(DIST, SITE.pins);
  const css = await readFile(path.join(SRC, "assets", "site.css"));
  const js = await readFile(path.join(SRC, "assets", "site.js"));
  const assets = { css: `/assets/bundle/site.${sha(css)}.css`, js: `/assets/bundle/site.${sha(js)}.js`, chat: await chatAssets() };
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
  // Ngôn ngữ đang có trang (menu ngôn ngữ chỉ liệt kê những ngôn ngữ này).
  const langs = LANG_CODES.filter((l) => list.some((p) => p.lang === l));
  const ctx = { pages: list, byId, assets, langs };
  for (const p of list) await writeOut(pageFile(p), renderPage(p, ctx));
  await writeOut("404.html", renderPage(notFound, { ...ctx, byId: new Map([[notFound.id, [notFound]]]) }));

  // 3. Tệp cho máy
  await writeOut("sitemap.xml", sitemap(list, byId));
  await writeOut("robots.txt", robots());
  await writeOut("llms.txt", llmsTxt(list));
  await writeOut("llms-full.txt", llmsFull(list, ctx, "en"));
  await writeOut("llms-full.vi.txt", llmsFull(list, ctx, "vi"));
  await writeOut("_headers", headers());
  // Đường dẫn thiếu dấu "/" cuối: Workers Static Assets tự chuyển bằng 307 (tạm thời); khai báo 301 cho từng trang để backlink
  // viết thiếu dấu "/" được gộp về URL chuẩn. Giữ các quy tắc có sẵn ở public/_redirects.
  const base = await readFile(path.join(SRC, "public", "_redirects"), "utf8").catch(() => "");
  const rules = list.filter((p) => p.path.endsWith("/") && !isHome(p.path)).map((p) => `${p.path.slice(0, -1)} ${p.path} 301`);
  const homes = PUBLISHED.filter((l) => homeOf(l) !== "/").map((l) => `${homeOf(l).slice(0, -1)} ${homeOf(l)} 301`);
  await writeOut("_redirects", `${base.trimEnd()}\n\n# Sinh tự động từ danh mục trang (build.mjs)\n${homes.join("\n")}\n${rules.join("\n")}\n`);
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
