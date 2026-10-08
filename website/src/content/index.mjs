// Danh mục toàn bộ trang. Mỗi trang là một module `export default { id, lang, path, title, description, body, ... }`
// (xem build/layout.mjs và README.md). Cặp bản vi/en cùng `id`. Thiếu file thì bỏ qua và báo (chỉ khi ALLOW_PARTIAL=1,
// dùng lúc đang viết dở); bình thường thiếu file là lỗi.
const IDS = [
  "home", "features", "pricing", "download", "faq", "about", "contact", "data-security", "compare-offline-cloud",
  "solutions", "solutions-meetings", "solutions-webinar",
  "guide", "guide-quick-start", "guide-install-macos", "guide-install-windows", "guide-audio-permission", "guide-subtitle-bar", "guide-glossary",
  "guide-history-export", "guide-license", "guide-troubleshooting",
  "terms", "privacy",
];
// Tên file theo ngôn ngữ (vi/<tên>.mjs, en/<tên>.mjs).
const FILE = {
  home: "home", features: "features", pricing: "pricing", download: "download", faq: "faq", about: "about", contact: "contact",
  "data-security": "data-security", "compare-offline-cloud": "compare-offline-cloud",
  solutions: "solutions", "solutions-meetings": "solutions-meetings", "solutions-webinar": "solutions-webinar",
  guide: "guide", "guide-quick-start": "guide-quick-start", "guide-install-macos": "guide-install-macos", "guide-install-windows": "guide-install-windows",
  "guide-audio-permission": "guide-audio-permission", "guide-subtitle-bar": "guide-subtitle-bar", "guide-glossary": "guide-glossary",
  "guide-history-export": "guide-history-export", "guide-license": "guide-license", "guide-troubleshooting": "guide-troubleshooting",
  terms: "terms", privacy: "privacy",
};
const partial = process.env.ALLOW_PARTIAL === "1";
export const missing = [];

async function load(lang, id) {
  const spec = `./${lang}/${FILE[id]}.mjs`;
  try {
    return (await import(spec)).default;
  } catch (e) {
    if (e.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes(`${lang}/${FILE[id]}.mjs`)) {
      missing.push(`${lang}/${FILE[id]}.mjs`);
      if (partial) return null;
      throw new Error(`Thiếu trang: ${lang}/${FILE[id]}.mjs`);
    }
    throw e;
  }
}

export const pages = (await Promise.all(IDS.flatMap((id) => ["vi", "en"].map((lang) => load(lang, id))))).filter(Boolean);

export const notFound = {
  id: "404",
  lang: "vi",
  path: "/404.html",
  title: "Không tìm thấy trang",
  description: "Trang bạn tìm không tồn tại hoặc đã được chuyển đi. Quay về trang chủ AI Translator để tiếp tục.",
  noindex: true,
  body: `<section class="section"><div class="container narrow"><h1>Không tìm thấy trang · Page not found</h1><p class="lead">Trang bạn tìm không tồn tại hoặc đã được chuyển đi. The page you are looking for does not exist or has moved.</p><p><a class="btn btn-primary" href="/">Về trang chủ</a> <a class="btn btn-secondary" href="/en/">Back to home</a></p></div></section>`,
};
