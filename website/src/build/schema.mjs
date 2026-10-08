// Dữ liệu có cấu trúc JSON-LD (schema.org) cho mỗi trang, gộp thành một @graph. Chỉ dùng những gì có thật: không có
// aggregateRating, review hay giá giả; giá lấy từ plans.mjs (có test đối chiếu với server/wrangler.jsonc).
import { SITE, ogFor } from "../site.mjs";
import { PLANS } from "../plans.mjs";

const abs = (p) => (p.startsWith("http") ? p : SITE.origin + p);
const ORG_ID = `${SITE.origin}/#organization`;
const SITE_ID = `${SITE.origin}/#website`;
const APP_ID = `${SITE.origin}/#software`;

const organization = () => ({
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE.name,
  url: SITE.origin + "/",
  logo: { "@type": "ImageObject", url: abs("/assets/img/logo-512.png"), width: 512, height: 512 },
  email: SITE.email,
  founder: { "@type": "Person", name: SITE.owner },
  contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: SITE.email, availableLanguage: ["vi", "en"] }],
});

const website = (lang) => ({
  "@type": "WebSite",
  "@id": SITE_ID,
  url: SITE.origin + "/",
  name: SITE.name,
  inLanguage: lang,
  publisher: { "@id": ORG_ID },
});

/** Ứng dụng: dùng cho trang chủ, tính năng, giá, tải xuống. */
export function softwareApplication(lang) {
  const en = lang === "en";
  const offers = PLANS.map((p) => ({
    "@type": "Offer",
    name: en ? p.nameEn : p.nameVi,
    price: String(p.priceVnd),
    priceCurrency: "VND",
    description: en ? p.summaryEn : p.summaryVi,
    url: abs(en ? "/en/pricing/" : "/bang-gia/"),
  }));
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: en ? "Real-time meeting translation and live captions" : "Dịch phụ đề cuộc họp trực tiếp",
    operatingSystem: "macOS 14.2 or later (Apple Silicon)",
    softwareVersion: SITE.version,
    description: en
      ? "Desktop app that shows live translated subtitles for any meeting or video audio on your computer, processed fully offline."
      : "App desktop hiện phụ đề dịch trực tiếp cho mọi âm thanh cuộc họp hoặc video trên máy tính, xử lý hoàn toàn offline.",
    url: SITE.origin + (en ? "/en/" : "/"),
    inLanguage: ["vi", "en"],
    publisher: { "@id": ORG_ID },
    author: { "@type": "Person", name: SITE.owner },
    offers,
    featureList: en ? SITE.featureListEn : SITE.featureListVi,
  };
}

export function breadcrumb(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

export function faqPage(items, id) {
  return {
    "@type": "FAQPage",
    ...(id ? { "@id": id } : {}),
    mainEntity: items.map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: q.aText ?? q.a } })),
  };
}

export function howTo({ name, description, steps, totalTime }) {
  return {
    "@type": "HowTo",
    name,
    description,
    ...(totalTime ? { totalTime } : {}),
    step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
  };
}

export function graph(page, ctx) {
  const url = abs(page.path);
  const nodes = [organization(), website(page.lang)];
  const kind = page.schemaType ?? "WebPage";
  const web = {
    "@type": kind,
    "@id": url + "#webpage",
    url,
    name: page.title,
    description: page.description,
    inLanguage: page.lang,
    isPartOf: { "@id": SITE_ID },
    about: { "@id": ORG_ID },
    primaryImageOfPage: { "@type": "ImageObject", url: abs(ogFor(page)) },
    ...(page.modified ? { dateModified: page.modified } : {}),
    ...(page.published ? { datePublished: page.published } : {}),
  };
  if (page.type === "article") {
    web["@type"] = page.schemaType ?? "Article";
    web.headline = page.title;
    web.author = { "@type": "Person", name: SITE.owner };
    web.publisher = { "@id": ORG_ID };
    web.mainEntityOfPage = url;
  }
  nodes.push(web);
  if (page.breadcrumbs?.length) nodes.push(breadcrumb(page.breadcrumbs));
  if (page.software) nodes.push(softwareApplication(page.lang));
  for (const extra of page.schema ?? []) nodes.push(typeof extra === "function" ? extra(ctx) : extra);
  return { "@context": "https://schema.org", "@graph": nodes };
}
