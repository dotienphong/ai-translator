// Dữ liệu có cấu trúc JSON-LD (schema.org) cho mỗi trang, gộp thành một @graph. Chỉ dùng những gì có thật: không có
// aggregateRating, review hay giá giả; giá lấy từ plans.mjs (có test đối chiếu với server/wrangler.jsonc).
import { SITE, ogFor } from "../site.mjs";
import { PLANS } from "../plans.mjs";

const abs = (p) => (p.startsWith("http") ? p : SITE.origin + p);
const ORG_ID = `${SITE.origin}/#organization`;
const PERSON_ID = `${SITE.origin}/ve-chung-toi/#person`;
// Mỗi ngôn ngữ một WebSite và một SoftwareApplication (cùng @id thì giá trị inLanguage/url/description lệch nhau).
const siteId = (lang) => `${SITE.origin}${lang === "en" ? "/en" : ""}/#website`;
const appId = (lang) => `${SITE.origin}${lang === "en" ? "/en" : ""}/#software`;
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const decode = (t) => String(t).replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]);

const organization = (lang) => ({
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE.name,
  alternateName: ["AI Translator app", "aitranslator.io.vn"],
  url: SITE.origin + "/",
  description:
    lang === "en"
      ? "AI Translator is a desktop app that shows live translated subtitles for meeting audio on your computer, processed on-device. Provided by Đỗ Tiến Phong."
      : "AI Translator là app desktop hiện phụ đề dịch trực tiếp cho âm thanh cuộc họp trên máy tính, xử lý trên máy. Do Đỗ Tiến Phong cung cấp.",
  disambiguatingDescription:
    lang === "en"
      ? "Offline live-subtitle translation app for meetings by Đỗ Tiến Phong (aitranslator.io.vn); not related to other products with similar names."
      : "App dịch phụ đề cuộc họp offline của Đỗ Tiến Phong (aitranslator.io.vn); không liên quan tới các sản phẩm khác có tên tương tự.",
  logo: { "@type": "ImageObject", url: abs("/assets/img/logo-512.png"), width: 512, height: 512 },
  email: SITE.email,
  founder: { "@id": PERSON_ID },
  contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: SITE.email, availableLanguage: ["vi", "en"] }],
});

const person = () => ({ "@type": "Person", "@id": PERSON_ID, name: SITE.owner, url: abs("/ve-chung-toi/") });

const website = (lang) => ({
  "@type": "WebSite",
  "@id": siteId(lang),
  url: SITE.origin + (lang === "en" ? "/en/" : "/"),
  name: SITE.name,
  inLanguage: lang,
  publisher: { "@id": ORG_ID },
});

/** Ứng dụng: dùng cho trang chủ, tính năng, giá, tải xuống. */
export function softwareApplication(lang) {
  const en = lang === "en";
  const offers = PLANS.map((p) => ({
    "@type": "Offer",
    name: p.priceVnd === 0 ? (en ? "Free trial (10 days)" : "Free (dùng thử 10 ngày)") : en ? p.nameEn : p.nameVi,
    price: String(p.priceVnd),
    priceCurrency: "VND",
    description: en ? p.summaryEn : p.summaryVi,
    url: abs(en ? "/en/pricing/" : "/bang-gia/"),
  }));
  return {
    "@type": "SoftwareApplication",
    "@id": appId(lang),
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: en ? "Real-time meeting translation and live captions" : "Dịch phụ đề cuộc họp trực tiếp",
    operatingSystem: "macOS 14.2 or later (Apple Silicon)",
    softwareVersion: SITE.version,
    description: en
      ? "Desktop app that shows live translated subtitles for any meeting or video audio on your computer; speech recognition and translation run on-device, so audio never leaves your machine."
      : "App desktop hiện phụ đề dịch trực tiếp cho mọi âm thanh cuộc họp hoặc video trên máy tính; nhận dạng giọng nói và dịch chạy trên máy nên âm thanh không rời khỏi máy.",
    url: SITE.origin + (en ? "/en/" : "/"),
    inLanguage: ["vi", "en"],
    publisher: { "@id": ORG_ID },
    author: { "@id": PERSON_ID },
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
    mainEntity: items.map((q) => ({ "@type": "Question", name: decode(q.q), acceptedAnswer: { "@type": "Answer", text: decode(q.aText ?? q.a) } })),
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
  const nodes = [organization(page.lang), person(), website(page.lang)];
  const kind = page.schemaType ?? "WebPage";
  const image = abs(ogFor(page));
  const web = {
    "@type": kind,
    "@id": url + "#webpage",
    url,
    name: page.title,
    description: page.description,
    inLanguage: page.lang,
    isPartOf: { "@id": siteId(page.lang) },
    about: { "@id": page.software ? appId(page.lang) : ORG_ID },
    ...(page.modified ? { dateModified: page.modified } : {}),
    ...(page.published ? { datePublished: page.published } : {}),
  };
  if (page.type === "article") {
    // Article/TechArticle không có primaryImageOfPage (chỉ WebPage có): dùng image.
    web["@type"] = page.schemaType ?? "Article";
    web.headline = page.title;
    web.image = [image];
    web.author = { "@id": PERSON_ID };
    web.publisher = { "@id": ORG_ID };
    web.mainEntityOfPage = url;
  } else {
    web.primaryImageOfPage = { "@type": "ImageObject", url: image };
  }
  nodes.push(web);
  if (page.breadcrumbs?.length) nodes.push(breadcrumb(page.breadcrumbs));
  if (page.software) nodes.push(softwareApplication(page.lang));
  for (const extra of page.schema ?? []) nodes.push(typeof extra === "function" ? extra(ctx) : extra);
  return { "@context": "https://schema.org", "@graph": nodes };
}
