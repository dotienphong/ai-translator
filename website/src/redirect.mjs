// Chuyển hướng về tên miền chính thức (spec 2026-10-23-ten-mien-aitranslator-vn §2.3): www và tên miền cũ aitranslator.io.vn.
// 301 vĩnh viễn cho mọi phương thức, giữ đường dẫn và query. Tên không có trong bảng trả 404 (không thành máy chuyển hướng mở).
// api. và releases. của tên cũ KHÔNG ở đây: chúng vẫn chạy song song cho app ≤ 0.2.6 (server/wrangler.jsonc, bucket R2).
// Triển khai trong `pnpm deploy`, sau site: `wrangler deploy -c wrangler.redirect.jsonc`.
export const TARGETS = {
  "www.aitranslator.vn": "https://aitranslator.vn",
  "aitranslator.io.vn": "https://aitranslator.vn",
  "www.aitranslator.io.vn": "https://aitranslator.vn",
  "admin.aitranslator.io.vn": "https://admin.aitranslator.vn",
};

export default {
  fetch(request) {
    const url = new URL(request.url);
    const target = Object.hasOwn(TARGETS, url.hostname) ? TARGETS[url.hostname] : null;
    if (!target) return new Response("Not found", { status: 404 });
    return new Response(null, {
      status: 301,
      headers: { location: `${target}${url.pathname}${url.search}`, "cache-control": "public, max-age=3600" },
    });
  },
};
