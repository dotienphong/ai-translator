// www → tên miền gốc, 301 vĩnh viễn, giữ đường dẫn và query.
export default {
  fetch(request) {
    const url = new URL(request.url);
    return new Response(null, {
      status: 301,
      headers: {
        location: `https://aitranslator.io.vn${url.pathname}${url.search}`,
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "cache-control": "public, max-age=3600",
      },
    });
  },
};
