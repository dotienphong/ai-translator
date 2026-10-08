// HTML → văn bản thuần (dùng cho llms-full.txt và các test nội dung). Chỉ cần đủ cho HTML do chính bộ sinh này tạo ra.
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export function htmlToText(html) {
  let s = html
    .replace(/<!--llm-skip-->[\s\S]*?<!--\/llm-skip-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/g, (_, t, c) => `\n\n${"#".repeat(Number(t[1]))} ${c}\n\n`)
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<\/dt>/g, ": ")
    .replace(/<\/dd>/g, "\n")
    .replace(/<\/a>(?=<a[ >])/g, "</a>\n")
    .replace(/<\/b>(?=<a[ >])/g, "</b>\n")
    .replace(/<\/(p|div|section|article|tr|ul|ol|table|details|summary|figure|figcaption|blockquote)>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/t[dh]>/g, " | ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, text) => (/^https?:|^mailto:/.test(href) ? `${text} (${href})` : text))
    .replace(/<[^>]+>/g, "");
  s = s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
