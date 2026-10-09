// Khung HTML dùng chung: <head> (SEO, Open Graph, hreflang, JSON-LD), header, footer. Mọi trang đều đi qua renderPage.
import { createHash } from "node:crypto";
import { esc } from "./markdown.mjs";
import { icon, sprite } from "./icons.mjs";
import { SITE, T, NAV, FOOTER, ogFor } from "../site.mjs";
import { graph } from "./schema.mjs";

/** Script chạy sớm trong <head> để áp giao diện sáng/tối đã lưu trước khi vẽ trang (tránh nháy). Băm SHA-256 vào CSP. */
export const THEME_INIT = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}document.documentElement.classList.add("js")`;
export const THEME_INIT_HASH = "sha256-" + createHash("sha256").update(THEME_INIT).digest("base64");

const abs = (p) => (p.startsWith("http") ? p : SITE.origin + p);

function alternates(page, ctx) {
  const pair = ctx.byId.get(page.id) ?? [];
  const links = pair.map((p) => `<link rel="alternate" hreflang="${p.lang}" href="${abs(p.path)}">`);
  const vi = pair.find((p) => p.lang === SITE.defaultLang) ?? pair[0];
  if (vi) links.push(`<link rel="alternate" hreflang="x-default" href="${abs(vi.path)}">`);
  return links.join("\n");
}

function head(page, ctx) {
  const t = T[page.lang];
  const url = abs(page.path);
  // Không thêm hậu tố thương hiệu khi tiêu đề đã có tên sản phẩm (tránh "AI Translator ... | AI Translator").
  const fullTitle = page.path === "/" || page.path === "/en/" || page.title.includes(SITE.name) ? page.title : `${page.title} | ${SITE.name}`;
  const image = abs(ogFor(page));
  const imageAlt = page.ogImageAlt ?? t.ogAlt;
  const robots = page.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
  const other = (ctx.byId.get(page.id) ?? []).filter((p) => p.lang !== page.lang);
  const ogType = page.type === "article" ? "article" : "website";
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(page.description)}">
${page.noindex ? "" : `<link rel="canonical" href="${url}">`}
<meta name="robots" content="${robots}">
${page.noindex ? "" : alternates(page, ctx)}
<meta name="theme-color" content="#fbfcfe" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#080d18" media="(prefers-color-scheme: dark)">
<meta name="author" content="${esc(SITE.owner)}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta property="og:locale" content="${t.ogLocale}">
${other.map((p) => `<meta property="og:locale:alternate" content="${T[p.lang].ogLocale}">`).join("\n")}
${page.type === "article" && page.published ? `<meta property="article:published_time" content="${page.published}">\n<meta property="article:modified_time" content="${page.modified ?? page.published}">\n<meta property="article:author" content="${abs(T[page.lang] && page.lang === "en" ? "/en/about/" : "/ve-chung-toi/")}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${esc(imageAlt)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/be-vietnam-pro-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/be-vietnam-pro-600-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/be-vietnam-pro-700-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/be-vietnam-pro-400-vietnamese.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/be-vietnam-pro-700-vietnamese.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${ctx.assets.css}">
<script>${THEME_INIT}</script>
<script type="application/ld+json">${JSON.stringify(graph(page, ctx)).replace(/</g, "\\u003c")}</script>`;
}

function navItem(item, page) {
  const current = (href) => (page.path === href ? ' aria-current="page"' : "");
  if (item.children) {
    const open = item.children.some((c) => page.path === c.href || page.path.startsWith(item.base ?? "\0"));
    return `<details${open ? "" : ""}><summary>${esc(item.label)} ${icon("chevron-down")}</summary><div class="menu-pop">${item.children
      .map((c) => `<a href="${c.href}"${current(c.href)}>${esc(c.label)}${c.hint ? `<span>${esc(c.hint)}</span>` : ""}</a>`)
      .join("")}</div></details>`;
  }
  return `<a href="${item.href}"${current(item.href)}>${esc(item.label)}</a>`;
}

function mobileNav(page, t) {
  const items = NAV[page.lang];
  const links = items
    .map((item) =>
      item.children
        ? `<a href="${item.href ?? item.children[0].href}">${esc(item.label)}</a><div class="sub">${item.children.map((c) => `<a href="${c.href}">${esc(c.label)}</a>`).join("")}</div>`
        : `<a href="${item.href}">${esc(item.label)}</a>`,
    )
    .join("");
  return `<div class="mobile-nav">${links}<a class="btn btn-primary btn-lg" href="${t.cta.href}">${esc(t.cta.label)}</a></div>`;
}

function header(page, ctx) {
  const t = T[page.lang];
  const pair = ctx.byId.get(page.id) ?? [];
  const other = pair.find((p) => p.lang !== page.lang);
  const home = page.lang === "vi" ? "/" : "/en/";
  const langSwitch = `<nav class="lang-switch" aria-label="${esc(t.language)}">${["vi", "en"]
    .map((l) => {
      const target = pair.find((p) => p.lang === l);
      if (l === page.lang) return `<span aria-current="true" lang="${l}">${l.toUpperCase()}</span>`;
      return target ? `<a href="${target.path}" hreflang="${l}" lang="${l}" title="${esc(T[l].langName)}">${l.toUpperCase()}</a>` : `<a href="${l === "vi" ? "/" : "/en/"}" hreflang="${l}" lang="${l}" title="${esc(T[l].langName)}">${l.toUpperCase()}</a>`;
    })
    .join("")}</nav>`;
  void other;
  return `<header class="site-header">
<div class="container">
<a class="brand" href="${home}" aria-label="${SITE.name} — ${esc(t.home)}"><img src="/assets/img/logo.svg" width="34" height="34" alt="" decoding="async"><span>${SITE.name}</span></a>
<nav class="nav" aria-label="${esc(t.mainNav)}">${NAV[page.lang].map((i) => navItem(i, page)).join("")}</nav>
<div class="header-tools">
${langSwitch}
<button class="icon-btn theme-toggle" type="button" aria-label="${esc(t.theme)}" data-theme-toggle>${icon("moon")}</button>
<a class="btn btn-primary btn-sm header-cta" href="${t.cta.href}">${esc(t.cta.label)}</a>
<details class="mnav"><summary class="icon-btn nav-toggle" aria-label="${esc(t.menu)}">${icon("menu")}</summary>${mobileNav(page, t)}</details>
</div>
</div>
</header>`;
}

/** Ngày hiển thị cho người đọc: vi 09/10/2026, en 9 October 2026. */
export function formatDate(iso, lang) {
  const [y, m, d] = iso.split("-");
  return lang === "vi" ? `${d}/${m}/${y}` : new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function footer(page) {
  const t = T[page.lang];
  const iso = page.modified ?? SITE.updated;
  const shown = formatDate(iso, page.lang);
  const f = FOOTER[page.lang];
  const col = (c) => `<div><p class="footer-title">${esc(c.title)}</p><ul>${c.links.map((l) => `<li><a href="${l.href}">${esc(l.label)}</a></li>`).join("")}</ul></div>`;
  return `<footer class="site-footer">
<div class="container">
<div class="footer-grid">
<div class="about">
<a class="brand" href="${page.lang === "vi" ? "/" : "/en/"}"><img src="/assets/img/logo.svg" width="34" height="34" alt="" loading="lazy" decoding="async"><span>${SITE.name}</span></a>
<p class="muted">${esc(t.footerAbout)}</p>
<p><a href="mailto:${SITE.email}">${SITE.email}</a></p>
</div>
${f.map(col).join("")}
</div>
<div class="footer-bottom">
<span>© ${SITE.year} ${SITE.name} · ${esc(t.provider)}: ${esc(SITE.owner)} · ${esc(t.updated)} <time datetime="${iso}">${shown}</time></span>
<span>${esc(t.trademark)}</span>
</div>
</div>
</footer>`;
}

/** Gắn chữ không được ngắt dòng (nbsp) trong phần chữ thường của HTML: "phụ đề", số + đơn vị, "AI Translator". Không đụng thuộc tính hay script. */
export function glue(html, lang = "vi") {
  const NB = "&nbsp;";
  let tableNo = 0;
  const L = lang === "vi" ? { col: "Tiêu chí", table: "Bảng dữ liệu" } : { col: "Criteria", table: "Data table" };
  html = html
    .replace(/<th scope="col"><\/th>/g, `<th scope="col"><span class="sr-only">${L.col}</span></th>`)
    // Nhãn khác nhau cho từng bảng (axe landmark-unique): "Bảng dữ liệu 1", "Bảng dữ liệu 2"...
    .replace(/<div class="(table-wrap(?: [^"]*)?)">/g, (m, cls) => `<div class="${cls}" tabindex="0" role="region" aria-label="${L.table} ${++tableNo}">`)
    .replace(/<pre>/g, '<pre tabindex="0">')
    // Giữa các phím trong tổ hợp có dấu "+" thật (để trích xuất chữ không dính "CtrlAltT").
    .replace(/<\/kbd>\s*<kbd/g, '</kbd> + <kbd');
  // Không đụng chữ trong <code> (đường dẫn, lệnh): người đọc chép nguyên văn, nbsp sẽ làm hỏng.
  return html
    .split(/(<code>[\s\S]*?<\/code>)/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/(^|>)([^<]+)(?=<|$)/g, (m, open, text) => {
            const fixed = text
              .replace(/(?<![\p{L}])(phụ|Phụ) (đề)(?![\p{L}])/gu, `$1${NB}$2`)
              .replace(/\bAI Translator\b/g, `AI${NB}Translator`)
              .replace(/(\d) ?(GB|MB|KB|ms|px|giây|phút|giờ|ngày|tháng|năm|hours?|minutes?|days?|seconds?|₫|%)(?![\p{L}])/gu, (mm, d, u) => `${d}${NB}${u}`);
            return `${open}${fixed}`;
          }),
    )
    .join("");
}

export function renderPage(page, ctx) {
  // `{{updated}}` trong nội dung trang = ngày sửa lần cuối của chính trang đó (từ git), để dòng "Cập nhật" không lỗi thời.
  const body = glue(typeof page.body === "function" ? page.body(ctx) : page.body, page.lang).replaceAll("{{updated}}", formatDate(page.modified ?? SITE.updated, page.lang));
  const t = T[page.lang];
  return `<!doctype html>
<html lang="${page.lang}">
<head>
${head(page, ctx)}
</head>
<body>
${sprite()}
<a class="skip" href="#main">${esc(t.skip)}</a>
${header(page, ctx)}
<main id="main">
${body}
</main>
${footer(page)}
<script src="${ctx.assets.js}" defer></script>
</body>
</html>
`;
}
