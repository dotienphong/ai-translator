// Khối giao diện dùng lại cho mọi trang. Tham số là chữ thuần (được escape) trừ những chỗ ghi rõ là HTML.
import { readFileSync } from "node:fs";
import { esc } from "./markdown.mjs";
import { icon } from "./icons.mjs";
import { PLANS, vnd } from "../plans.mjs";

export { esc, icon };

// Kích thước ảnh chụp giao diện app lấy từ manifest do công cụ chụp ghi (tools/app-shots). Thiếu manifest thì dùng cỡ mặc định.
const MANIFEST = (() => {
  try {
    return JSON.parse(readFileSync(new URL("../assets/img/app/manifest.json", import.meta.url), "utf8"));
  } catch {
    return [];
  }
})();
const dims = (file, d) => MANIFEST.find((m) => m.file === file) ?? d;

/** Ảnh chụp cửa sổ chính của app (có thanh tiêu đề giả bằng CSS). */
export const appShot = ({ slug, lang, alt, caption, eager = false, title = "AI Translator", dark = false }) => {
  const file = `${slug}${dark ? ".dark" : ""}.${lang}.webp`;
  const d = dims(file, { width: 1440, height: 960 });
  return `<figure class="shot window reveal">
<div class="bar" aria-hidden="true"><i></i><span>${esc(title)}</span></div>
<img src="/assets/img/app/${file}" alt="${esc(alt)}" width="${d.width}" height="${d.height}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}
</figure>`;
};

/** Ảnh thanh phụ đề (nền trong suốt) đặt trên nền tối giống màn hình họp. */
export const overlayShot = ({ slug, lang, alt, caption }) => {
  const file = `${slug}.${lang}.webp`;
  const d = dims(file, { width: 1800, height: 400 });
  return `<figure class="shot stage reveal">
<div class="backdrop"><img src="/assets/img/app/${file}" alt="${esc(alt)}" width="${d.width}" height="${d.height}" loading="lazy" decoding="async"></div>
${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}
</figure>`;
};

/** Bảng thông tin nhanh (dl): dễ cho người đọc và cho trợ lý AI trích dẫn. rows: [[nhãn, HTML]] */
export const facts = (rows) => `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v.replace(/<small>/g, "<br><small>")}</dd></div>`).join("")}</dl>`;

/**
 * Khối lệnh dạng cửa sổ terminal, có nút Sao chép (nâng cấp bằng site.js; tắt JS thì nút ẩn, vẫn chọn và chép tay được).
 * cmd là chuỗi thuần (không HTML); copy/copied là nhãn nút trước và sau khi chép; term là tên hiện trên thanh tiêu đề
 * ("Terminal", "PowerShell"); prompt là ký tự dấu nhắc vẽ bằng CSS (không nằm trong nội dung chép). Không dùng `.reveal`:
 * khối này nằm trong tab bị ẩn, IntersectionObserver sẽ không bao giờ hiện nó.
 */
export const cmdBlock = ({ cmd, copy, copied, label, term = "Terminal", prompt = "$" }) => `<div class="cmd">
<div class="cmd-bar"><span class="cmd-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="cmd-title">${esc(term)}</span><button class="cmd-copy" type="button" hidden data-copy="${esc(cmd)}" data-copied="${esc(copied)}" data-label="${esc(copy)}">${icon("copy")}<span>${esc(copy)}</span></button></div>
<pre data-prompt="${esc(prompt)}"><code${label ? ` aria-label="${esc(label)}"` : ""}>${esc(cmd)}</code></pre>
</div>`;

/** Hàng chip thông tin ngắn: chips([["laptop","macOS 14.2+"], ...]). */
export const chips = (list) => `<ul class="chips">${list.map(([ic, t]) => `<li>${ic ? icon(ic) : ""}<span>${esc(t)}</span></li>`).join("")}</ul>`;

/**
 * Các bước nối nhau theo chiều dọc. list: [{ title, text (HTML, có thể chứa cmdBlock) }].
 */
export const flow = (list) => `<ol class="flow">${list
  .map((it) => `<li><div class="flow-body"><h3>${esc(it.title)}</h3>${it.text}</div></li>`)
  .join("")}</ol>`;

/**
 * Hai tab hệ điều hành. Không có JS: mọi panel hiện lần lượt (thanh tab ẩn), đủ nội dung cho người đọc và công cụ tìm kiếm.
 * Có JS (site.js): nhận diện hệ điều hành, chọn tab đúng, hỗ trợ #hash, bàn phím, ghi nhớ lựa chọn tay.
 * tabs: [{ key, id (neo của panel), icon, title, sub, body (HTML) }]; labels: { list, mine, detected, mobile, other, copyLink, copied }.
 */
export const osTabs = ({ tabs, labels }) => `<div class="ostabs" data-ostabs data-msg-detected="${esc(labels.detected)}" data-msg-mobile="${esc(labels.mobile)}" data-msg-other="${esc(labels.other)}">
<div class="ostabs-list" role="tablist" aria-label="${esc(labels.list)}" hidden>
${tabs
  .map(
    (t) => `<button class="ostab" type="button" role="tab" id="tab-${t.key}" aria-controls="${t.id}" aria-selected="false" tabindex="-1" data-os="${t.key}"><span class="ostab-ico">${icon(t.icon)}</span><span class="ostab-txt"><strong>${esc(t.title)}</strong><small>${esc(t.sub)}</small></span><span class="ostab-badge" hidden>${esc(labels.mine)}</span></button>`,
  )
  .join("\n")}
</div>
<div class="ostabs-note" data-note hidden role="status"><span class="note-ico">${icon("info")}</span><p data-note-text></p><button class="btn btn-secondary btn-sm" type="button" data-copy-link hidden data-copied="${esc(labels.copied)}" data-label="${esc(labels.copyLink)}">${icon("copy")}<span>${esc(labels.copyLink)}</span></button></div>
${tabs
  .map(
    (t) => `<section class="ostabs-panel" id="${t.id}" role="tabpanel" aria-labelledby="tab-${t.key}" data-os="${t.key}" tabindex="0">
<h2 class="panel-title">${icon(t.icon)}<span>${esc(t.title)}</span></h2>
${t.body}
</section>`,
  )
  .join("\n")}
</div>`;

/** Chip phím: keys(["⌃","⌥","T"]) */
export const keys = (list) => `<span class="keys">${list.map((k) => `<kbd>${esc(k)}</kbd>`).join("")}</span>`;

export const crumbs = (items) =>
  `<nav aria-label="Breadcrumb"><ol class="breadcrumb">${items
    .map((it, i) => (i === items.length - 1 ? `<li aria-current="page">${esc(it.name)}</li>` : `<li><a href="${it.path}">${esc(it.name)}</a></li>`))
    .join("")}</ol></nav>`;

/** Đầu trang con: breadcrumb, h1, đoạn dẫn. */
export const pageHero = ({ crumbs: c, title, lead, meta }) => `<section class="page-hero"><div class="container">
${crumbs(c)}
<h1>${esc(title)}</h1>
${lead ? `<p class="lead">${esc(lead)}</p>` : ""}
${meta ? `<div class="meta-line">${meta}</div>` : ""}
</div></section>`;

export const sectionHead = ({ eyebrow, title, text, center = false }) => `<div class="section-head${center ? " center" : ""} reveal">
${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ""}
<h2>${esc(title)}</h2>
${text ? `<p>${esc(text)}</p>` : ""}
</div>`;

/** feature: { icon, title, text (HTML), accent? } */
export const feature = (f, extra = "") => `<div class="card feature${f.accent ? " accent" : ""} reveal${extra}">
<div class="ico">${icon(f.icon)}</div>
<h3>${esc(f.title)}</h3>
<p>${f.text}</p>
</div>`;

export const linkCard = ({ href, icon: ic, title, text, more }) => `<a class="card card-link feature reveal" href="${href}">
${ic ? `<div class="ico">${icon(ic)}</div>` : ""}
<h3>${esc(title)}</h3>
<p>${esc(text)}</p>
<span class="more">${esc(more)} ${icon("arrow-right")}</span>
</a>`;

export const steps = (list, vertical = false) => `<ol class="steps${vertical ? " vertical" : ""}">${list
  .map((s) => `<li class="reveal"><h3>${esc(s.title)}</h3><p>${s.text}</p></li>`)
  .join("")}</ol>`;

export const checkList = (items, no = false) => `<ul class="check-list${no ? " no" : ""}">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

export const callout = ({ kind = "info", title, text }) => `<div class="callout ${kind === "info" ? "" : kind}">
${icon(kind === "warn" ? "alert" : kind === "ok" ? "shield" : "info")}
<div>${title ? `<p><strong>${esc(title)}</strong></p>` : ""}<p>${text}</p></div>
</div>`;

/** items: [{ q, a (HTML) }] */
export const faq = (items, { open = false } = {}) => `<div class="faq">${items
  .map((it, i) => `<details${open && i === 0 ? " open" : ""}><summary>${esc(it.q)}</summary><div class="answer">${it.a}</div></details>`)
  .join("")}</div>`;

export const ctaBand = ({ title, text, primary, secondary }) => `<section class="section-tight"><div class="container"><div class="cta-band reveal">
<h2>${esc(title)}</h2>
<p>${esc(text)}</p>
<div class="row">
<a class="btn btn-primary btn-lg" href="${primary.href}">${esc(primary.label)}</a>
${secondary ? `<a class="btn btn-secondary btn-lg" href="${secondary.href}">${esc(secondary.label)}</a>` : ""}
</div>
</div></div></section>`;

export const shot = ({ src, alt, caption, w, h, plain = false, eager = false }) => `<figure class="shot${plain ? " plain" : ""} reveal">
<img src="${src}" alt="${esc(alt)}" width="${w}" height="${h}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}
</figure>`;

/** Minh họa cuộc họp có thanh phụ đề dịch (HTML/CSS thuần, hoạt họa bằng CSS). pairs: [{src, dst}] (đúng 3). */
export function demo({ title, rec, langs, pairs, note, names, floatA, floatB }) {
  return `<!--llm-skip--><div class="demo-wrap">
<div class="demo" role="img" aria-label="${esc(note)}">
<div class="demo-bar"><i></i><span>${esc(title)}</span><span class="rec">${esc(rec)}</span></div>
<div class="demo-stage" aria-hidden="true">
${names.map((n, i) => `<div class="tile av${i + 1}${i === 0 ? " speaking" : ""}" data-name="${esc(n)}"><div class="avatar"></div></div>`).join("")}
</div>
<div class="subtitle-bar" aria-hidden="true">
<span class="lang">${esc(langs)}</span>
${pairs.map((p) => `<span class="pair"><span class="src">${esc(p.src)}</span><span class="dst">${esc(p.dst)}</span></span>`).join("")}
</div>
</div>
${floatA ? `<span class="floaty a">${icon(floatA.icon)} ${esc(floatA.text)}</span>` : ""}
${floatB ? `<span class="floaty b">${icon(floatB.icon)} ${esc(floatB.text)}</span>` : ""}
</div><!--/llm-skip-->`;
}

/** Ba gói giá. lang: "vi" | "en". Trả HTML của .plans. */
export function plansGrid(lang, { ctaLabel, freeLabel, featured = "yearly", detail = true } = {}) {
  const en = lang === "en";
  const L = {
    free: { for: en ? "Try it before you decide." : "Dùng thử trước khi quyết định.", per: en ? "10-day trial · once per device" : "Dùng thử 10 ngày · mỗi máy một lần" },
    monthly: { for: en ? "For regular meetings and short projects." : "Cho người họp thường xuyên, dự án ngắn hạn.", per: en ? "per 30 days · prepaid" : "cho mỗi 30 ngày · trả trước" },
    yearly: { for: en ? "For daily use. Best value." : "Cho người dùng hằng ngày. Tiết kiệm nhất.", per: en ? "per 365 days · prepaid" : "cho 365 ngày · trả trước" },
  };
  const feats = {
    free: en
      ? ["Live translated subtitles in all 5 languages", "30 minutes per day during the 10-day trial", "Subtitle bar, shortcuts and copying the transcript"]
      : ["Phụ đề dịch trực tiếp, đủ 5 ngôn ngữ", "30 phút mỗi ngày trong 10 ngày dùng thử", "Thanh phụ đề tùy chỉnh, phím tắt, sao chép bản chép lời"],
    monthly: en
      ? ["50 hours of translation per 30-day cycle", "Pro features: glossary, history, TXT/SRT/Markdown export", "Renew when you need it, never charged automatically"]
      : ["50 giờ dịch cho mỗi chu kỳ 30 ngày", "Tính năng Pro: từ điển thuật ngữ, lịch sử, xuất TXT/SRT/Markdown", "Gia hạn khi cần, không tự động trừ tiền"],
    yearly: en
      ? ["Unlimited translation time for 365 days", "All Pro features", "One payment for the whole year, about 41,700 ₫ per month"]
      : ["Không giới hạn thời lượng dịch trong 365 ngày", "Đầy đủ tính năng Pro", "Trả một lần cho cả năm, quy ra khoảng 41.700 ₫ mỗi tháng"],
  };
  void detail;
  return `<div class="plans">${PLANS.map((p) => {
    const f = p.code === featured;
    const price = p.priceVnd === 0 ? (en ? "Free" : "Miễn phí") : vnd(p.priceVnd, lang);
    return `<div class="plan${f ? " featured" : ""} reveal">
${f ? `<span class="tag">${en ? "Best value" : "Tiết kiệm nhất"}</span>` : ""}
<h3>${esc(en ? p.nameEn : p.nameVi)}</h3>
<p class="for">${esc(L[p.code].for)}</p>
<div class="price"><b>${esc(price)}</b></div>
<p class="per">${esc(L[p.code].per)}</p>
${checkList(feats[p.code].map(esc))}
<a class="btn ${f ? "btn-primary" : "btn-secondary"} btn-lg" href="${en ? "/en/download/" : "/tai-xuong/"}">${esc(p.priceVnd === 0 ? freeLabel ?? ctaLabel : ctaLabel)}</a>
</div>`;
  }).join("")}</div>`;
}

/** Bố cục bài hướng dẫn: mục lục dính bên trái (nếu có) + nội dung. toc: [{level:2|3,id,text}]. */
export const docLayout = ({ toc = [], tocTitle = "Trong bài này", body }) => `<div class="doc-layout${toc.length ? "" : " no-toc"}">
${toc.length ? `<nav class="toc" aria-label="${esc(tocTitle)}"><b>${esc(tocTitle)}</b>${toc.map((t) => `<a class="${t.level === 3 ? "l3" : ""}" href="#${t.id}">${esc(t.text)}</a>`).join("")}</nav>` : ""}
<article class="prose">${body}</article>
</div>`;

/** Liên kết trước/sau cuối bài. links: [{ href, kicker, title }] */
export const docNav = (links, label = "Bài liên quan") => `<nav class="doc-nav" aria-label="${esc(label)}">${links
  .map((l) => `<a href="${l.href}"><span>${esc(l.kicker)}</span>${esc(l.title)}</a>`)
  .join("")}</nav>`;

/** Sơ đồ "dữ liệu đi đâu": công cụ dịch qua cloud (đi vòng lên máy chủ) và AI Translator (ở lại trên máy). */
export function dataFlow(lang) {
  const en = lang === "en";
  const L = en
    ? {
        cloud: "How most cloud translation tools work",
        local: "AI Translator",
        you: "Your computer", audio: "meeting audio", net: "Internet", server: "Provider server", cloudAi: "plus an AI on the cloud",
        subs: "Subtitles", backTo: "back to you", audioHere: "Audio", onYour: "on your computer", ai: "AI running on your computer", models: "recognition + translation", screen: "Subtitles", onScreen: "on your screen",
        cloudNote: "The meeting audio leaves your computer and is processed somewhere you do not control.",
        localNote: "No trip to the cloud: the audio, the transcript and the translation stay on your computer.",
      }
    : {
        cloud: "Cách phần lớn công cụ dịch qua cloud hoạt động",
        local: "AI Translator",
        you: "Máy bạn", audio: "âm thanh cuộc họp", net: "Internet", server: "Máy chủ nhà cung cấp", cloudAi: "cùng AI trên cloud",
        subs: "Phụ đề", backTo: "gửi về máy bạn", audioHere: "Âm thanh", onYour: "trên máy bạn", ai: "AI chạy trên máy bạn", models: "nhận dạng + dịch", screen: "Phụ đề", onScreen: "trên màn hình bạn",
        cloudNote: "Âm thanh cuộc họp rời khỏi máy bạn và được xử lý ở nơi bạn không kiểm soát.",
        localNote: "Không có chuyến đi nào lên cloud: âm thanh, bản chép lời và bản dịch ở lại trên máy bạn.",
      };
  const sep = '<li class="sep" aria-hidden="true">→</li>';
  return `<div class="dataflow reveal">
<div class="lane lane-cloud">
<span class="tag">${esc(L.cloud)}</span>
<ol class="nodes"><li>${esc(L.you)}<small>${esc(L.audio)}</small></li>${sep}<li class="net">${esc(L.net)}</li>${sep}<li>${esc(L.server)}<small>${esc(L.cloudAi)}</small></li>${sep}<li class="net">${esc(L.net)}</li>${sep}<li>${esc(L.subs)}<small>${esc(L.backTo)}</small></li></ol>
<p>${esc(L.cloudNote)}</p>
</div>
<div class="lane lane-local">
<span class="tag">${esc(L.local)}</span>
<ol class="nodes"><li>${esc(L.audioHere)}<small>${esc(L.onYour)}</small></li>${sep}<li class="ai">${esc(L.ai)}<small>${esc(L.models)}</small></li>${sep}<li>${esc(L.screen)}<small>${esc(L.onScreen)}</small></li></ol>
<p>${esc(L.localNote)}</p>
</div>
</div>`;
}
