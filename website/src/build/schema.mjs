// Dữ liệu có cấu trúc JSON-LD (schema.org) cho mỗi trang, gộp thành một @graph. Chỉ dùng những gì có thật: không có
// aggregateRating, review hay giá giả; giá lấy từ plans.mjs (có test đối chiếu với server/wrangler.jsonc).
import { SITE, ogFor } from "../site.mjs";
import { PLANS, planName, planSummary } from "../plans.mjs";
import { LANGS, LANG_CODES, tagOf } from "../langs.mjs";
import { S } from "../strings.mjs";
import { videoMeta } from "./mp4.mjs";

const abs = (p) => (p.startsWith("http") ? p : SITE.origin + p);
const ORG_ID = `${SITE.origin}/#organization`;
const PERSON_ID = `${SITE.origin}/ve-chung-toi/#person`;
// Mỗi ngôn ngữ một WebSite và một SoftwareApplication (cùng @id thì giá trị inLanguage/url/description lệch nhau).
// Gốc của từng ngôn ngữ: "https://aitranslator.vn/" (vi), "…/en/", "…/ja/"…
const base = (lang) => SITE.origin + LANGS[lang].prefix;
const siteId = (lang) => `${base(lang)}#website`;
const appId = (lang) => `${base(lang)}#software`;
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
  alternateName: ["AI Translator app", "aitranslator.vn"],
  url: SITE.origin + "/",
  description: lm(
    "AI Translator là app desktop hiện phụ đề dịch trực tiếp cho âm thanh cuộc họp trên máy tính, xử lý trên máy. Do Đỗ Tiến Phong cung cấp.",
    "AI Translator is a desktop app that shows live translated subtitles for meeting audio on your computer, processed on-device. Provided by Đỗ Tiến Phong.",
  ),
  disambiguatingDescription: lm(
    "App dịch phụ đề cuộc họp offline của Đỗ Tiến Phong (aitranslator.vn); không liên quan tới các sản phẩm khác có tên tương tự.",
    "Offline live-subtitle translation app for meetings by Đỗ Tiến Phong (aitranslator.vn); not related to other products with similar names.",
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
  url: base(lang),
  name: SITE.name,
  alternateName: ["aitranslator.vn"],
  inLanguage: tagOf(lang),
  publisher: { "@id": ORG_ID },
});

/** Ứng dụng: dùng cho trang chủ, tính năng, giá, tải xuống. Chỉ khai những gì có thật (không đánh giá, không giá giả). Chữ theo
 *  ngôn ngữ ở strings.mjs (S[lang].app); đường dẫn Bảng giá, Tải xuống, Hướng dẫn lấy từ danh mục trang (ctx). */
export function softwareApplication(lang, ctx) {
  const a = S[lang].app;
  const href = (id) => abs((ctx?.byId.get(id) ?? []).find((p) => p.lang === lang)?.path ?? LANGS[lang].prefix);
  const offers = PLANS.map((p) => ({
    "@type": "Offer",
    name: p.priceVnd === 0 ? a.freeOffer : planName(p, lang),
    price: String(p.priceVnd),
    priceCurrency: "VND",
    availability: "https://schema.org/InStock",
    eligibleDuration: { "@type": "QuantitativeValue", value: p.days, unitCode: "DAY" },
    description: planSummary(p, lang),
    url: href("pricing"),
  }));
  // Giá USD khi trả bằng thẻ quốc tế (spec 2026-10-14): mỗi gói trả phí thêm một Offer riêng loại tiền, chưa gồm thuế.
  const usdOffers = PLANS.filter((p) => p.priceUsdCents > 0).map((p) => ({
    "@type": "Offer",
    name: `${planName(p, lang)} (USD)`,
    price: (p.priceUsdCents / 100).toFixed(2),
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    eligibleDuration: { "@type": "QuantitativeValue", value: p.days, unitCode: "DAY" },
    description: `${planSummary(p, lang)} ${a.cardNote}`,
    url: href("pricing"),
  }));
  const shot = (name, caption) => ({ "@type": "ImageObject", url: abs(`/assets/img/app/${name}.${lang}.webp`), caption });
  return {
    "@type": "SoftwareApplication",
    "@id": appId(lang),
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: a.subCategory,
    operatingSystem: ["macOS 14.2+", "Windows 10", "Windows 11"],
    processorRequirements: a.processor,
    memoryRequirements: a.memory,
    storageRequirements: a.storage,
    softwareVersion: SITE.version,
    datePublished: SITE.releaseDate,
    description: a.description,
    disambiguatingDescription: a.disambiguating,
    url: base(lang),
    installUrl: href("download"),
    softwareHelp: href("guide"),
    // Ngôn ngữ giao diện của app (năm ngôn ngữ từ 0.1.8), không phải ngôn ngữ của website.
    inLanguage: LANG_CODES.map(tagOf),
    screenshot: [shot("overlay-default", a.shots[0]), shot("app-home-running", a.shots[1])],
    publisher: { "@id": ORG_ID },
    author: { "@id": PERSON_ID },
    offers: [...offers, ...usdOffers],
    featureList: a.featureList,
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

/** Video demo của trang chủ (spec 2026-10-21-website-demo-video; thời lượng đọc từ file MP4, spec 2026-10-22 §4). `uploadDate` truyền vào dạng ngày
 *  (YYYY-MM-DD), ghi ra ngày giờ kèm múi giờ Việt Nam vì Google báo lỗi khi `uploadDate` của VideoObject thiếu giờ hoặc múi giờ. */
export function videoObject({ lang, name, description, uploadDate }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(uploadDate)) throw new Error(`videoObject: uploadDate phải dạng YYYY-MM-DD, nhận ${uploadDate}`);
  const file = `/assets/video/ai-translator-demo.${lang}`;
  return {
    "@type": "VideoObject",
    "@id": `${base(lang)}#demo-video`,
    name,
    description,
    thumbnailUrl: abs(`${file}.webp`),
    contentUrl: abs(`${file}.mp4`),
    duration: videoMeta(lang).iso,
    uploadDate: `${uploadDate}T00:00:00+07:00`,
    inLanguage: tagOf(lang),
    publisher: { "@id": ORG_ID },
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
    inLanguage: tagOf(page.lang),
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
      inLanguage: tagOf(page.lang),
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
  if (page.software) nodes.push(softwareApplication(page.lang, ctx));
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
