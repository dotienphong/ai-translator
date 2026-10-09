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
// HTML -> chữ thuần cho văn bản câu trả lời FAQ: đóng một khối (p, li, ...) thì chèn khoảng trắng để hai đoạn không dính nhau.
const toPlain = (h) =>
  decode(
    String(h)
      .replace(/<\/(p|li|div|dd|dt|tr|h[1-6]|ul|ol)>/g, "$& ")
      .replace(/<br\s*\/?>/g, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
const lm = (vi, en) => [{ "@language": "vi", "@value": vi }, { "@language": "en", "@value": en }];

// Một @id thì chỉ một nội dung: mô tả dùng language map (JSON-LD hợp lệ) thay vì khác nhau theo trang.
const organization = () => ({
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE.name,
  alternateName: ["AI Translator app", "aitranslator.io.vn"],
  url: SITE.origin + "/",
  description: lm(
    "AI Translator là app desktop hiện phụ đề dịch trực tiếp cho âm thanh cuộc họp trên máy tính, xử lý trên máy. Do Đỗ Tiến Phong cung cấp.",
    "AI Translator is a desktop app that shows live translated subtitles for meeting audio on your computer, processed on-device. Provided by Đỗ Tiến Phong.",
  ),
  disambiguatingDescription: lm(
    "App dịch phụ đề cuộc họp offline của Đỗ Tiến Phong (aitranslator.io.vn); không liên quan tới các sản phẩm khác có tên tương tự.",
    "Offline live-subtitle translation app for meetings by Đỗ Tiến Phong (aitranslator.io.vn); not related to other products with similar names.",
  ),
  logo: { "@type": "ImageObject", url: abs("/assets/img/logo-512.png"), width: 512, height: 512 },
  email: SITE.email,
  founder: { "@id": PERSON_ID },
  contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: SITE.email, availableLanguage: ["vi", "en"] }],
});

const person = () => ({
  "@type": "Person",
  "@id": PERSON_ID,
  name: SITE.owner,
  url: abs("/ve-chung-toi/"),
  jobTitle: lm("Nhà phát triển cá nhân", "Independent developer"),
  worksFor: { "@id": ORG_ID },
});

const website = (lang) => ({
  "@type": "WebSite",
  "@id": siteId(lang),
  url: SITE.origin + (lang === "en" ? "/en/" : "/"),
  name: SITE.name,
  alternateName: ["aitranslator.io.vn"],
  inLanguage: lang,
  publisher: { "@id": ORG_ID },
});

/** Ứng dụng: dùng cho trang chủ, tính năng, giá, tải xuống. Chỉ khai những gì có thật (không đánh giá, không giá giả). */
export function softwareApplication(lang) {
  const en = lang === "en";
  const offers = PLANS.map((p) => ({
    "@type": "Offer",
    name: p.priceVnd === 0 ? (en ? "Free trial (10 days)" : "Free (dùng thử 10 ngày)") : en ? p.nameEn : p.nameVi,
    price: String(p.priceVnd),
    priceCurrency: "VND",
    availability: "https://schema.org/InStock",
    eligibleDuration: { "@type": "QuantitativeValue", value: p.days, unitCode: "DAY" },
    description: en ? p.summaryEn : p.summaryVi,
    url: abs(en ? "/en/pricing/" : "/bang-gia/"),
  }));
  const shot = (name, vi, en_) => ({ "@type": "ImageObject", url: abs(`/assets/img/app/${name}.${lang}.webp`), caption: en ? en_ : vi });
  return {
    "@type": "SoftwareApplication",
    "@id": appId(lang),
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: en ? "Real-time meeting translation and live captions" : "Dịch phụ đề cuộc họp trực tiếp",
    operatingSystem: ["macOS 14.2+", "Windows 10", "Windows 11"],
    processorRequirements: en ? "Apple Silicon (M1 or later) on macOS; 64-bit x64 CPU with AVX2 on Windows" : "Apple Silicon (M1 trở lên) trên macOS; CPU x64 64-bit có AVX2 trên Windows",
    memoryRequirements: en ? "8 GB RAM minimum, 16 GB recommended" : "RAM tối thiểu 8 GB, khuyến nghị 16 GB",
    storageRequirements: en ? "1.3 GB (Lite pack) or 2.5 GB (Standard pack) for models, plus 1 GB free while downloading" : "1,3 GB (gói model Nhẹ) hoặc 2,5 GB (gói model Chuẩn) cho model, cộng 1 GB trống khi tải",
    softwareVersion: SITE.version,
    datePublished: SITE.releaseDate,
    description: en
      ? "Desktop app that shows live translated subtitles for any meeting or video audio on your computer; speech recognition and translation run on-device, so audio never leaves your machine."
      : "App desktop hiện phụ đề dịch trực tiếp cho mọi âm thanh cuộc họp hoặc video trên máy tính; nhận dạng giọng nói và dịch chạy trên máy nên âm thanh không rời khỏi máy.",
    disambiguatingDescription: en
      ? "AI Translator (aitranslator.io.vn), an on-device meeting subtitle translator by Đỗ Tiến Phong; not related to other products with similar names."
      : "AI Translator (aitranslator.io.vn), app phụ đề dịch cuộc họp chạy trên máy của Đỗ Tiến Phong; không liên quan tới các sản phẩm khác có tên tương tự.",
    url: SITE.origin + (en ? "/en/" : "/"),
    installUrl: abs(en ? "/en/download/" : "/tai-xuong/"),
    softwareHelp: abs(en ? "/en/guide/" : "/huong-dan/"),
    inLanguage: ["vi", "en"],
    screenshot: [
      shot("overlay-default", "Thanh phụ đề của AI Translator hiện câu gốc và bản dịch", "The AI Translator subtitle bar showing the original sentence and its translation"),
      shot("app-home-running", "Màn hình chính của AI Translator khi đang dịch", "The AI Translator Home screen while translating"),
    ],
    publisher: { "@id": ORG_ID },
    author: { "@id": PERSON_ID },
    offers,
    featureList: en ? SITE.featureListEn : SITE.featureListVi,
  };
}

export function breadcrumb(items, id) {
  return {
    "@type": "BreadcrumbList",
    ...(id ? { "@id": id } : {}),
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

export function faqPage(items, id) {
  return {
    "@type": "FAQPage",
    ...(id ? { "@id": id } : {}),
    mainEntity: items.map((q) => ({ "@type": "Question", name: toPlain(q.q), acceptedAnswer: { "@type": "Answer", text: toPlain(q.aText ?? q.a) } })),
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
  const nodes = [organization(), person(), website(page.lang)];
  const kind = page.schemaType ?? "WebPage";
  const image = abs(ogFor(page));
  const isArticle = page.type === "article" && kind !== "WebPage";
  const web = {
    "@type": "WebPage",
    "@id": url + "#webpage",
    url,
    name: page.title,
    description: page.description,
    inLanguage: page.lang,
    isPartOf: { "@id": siteId(page.lang) },
    about: { "@id": page.software ? appId(page.lang) : ORG_ID },
    ...(page.modified ? { dateModified: page.modified } : {}),
    ...(page.datePublishedOverride ?? page.published ? { datePublished: page.published } : {}),
    primaryImageOfPage: { "@type": "ImageObject", url: image },
  };
  // Trang loại AboutPage, ContactPage, CollectionPage: đổi @type của chính node trang (đều là kiểu con của WebPage).
  if (!isArticle && kind !== "WebPage") web["@type"] = kind;
  nodes.push(web);
  if (isArticle) {
    // Bài viết là một node riêng (Article/TechArticle) do node trang làm nội dung chính: không dùng chung @id với WebPage.
    web.mainEntity = { "@id": url + "#article" };
    nodes.push({
      "@type": kind,
      "@id": url + "#article",
      headline: page.title,
      description: page.description,
      image: [image],
      inLanguage: page.lang,
      ...(page.published ? { datePublished: page.published } : {}),
      ...(page.modified ? { dateModified: page.modified } : {}),
      author: { "@id": PERSON_ID },
      publisher: { "@id": ORG_ID },
      mainEntityOfPage: { "@id": url + "#webpage" },
    });
  }
  if (page.breadcrumbs?.length) {
    web.breadcrumb = { "@id": url + "#breadcrumb" };
    nodes.push(breadcrumb(page.breadcrumbs, url + "#breadcrumb"));
  }
  if (page.software) nodes.push(softwareApplication(page.lang));
  let faqIds = 0;
  for (const extra of page.schema ?? []) {
    const node = typeof extra === "function" ? extra(ctx) : extra;
    if (node["@type"] === "FAQPage" && !node["@id"]) {
      node["@id"] = url + "#faq" + (faqIds++ ? faqIds : "");
      web.mainEntity = web.mainEntity ? [].concat(web.mainEntity, { "@id": node["@id"] }) : { "@id": node["@id"] };
    }
    nodes.push(node);
  }
  return { "@context": "https://schema.org", "@graph": nodes };
}
