// Máy chủ xem thử cục bộ, mô phỏng Workers Static Assets: auto-trailing-slash, 404.html có mã 404, áp `_headers` (kể cả CSP)
// để lỗi CSP lộ ra ngay khi thử bằng trình duyệt.   node src/serve.mjs [cổng]   (mặc định 4173; cần `pnpm build` trước)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const DIST = process.env.WEBSITE_DIST ? path.resolve(process.env.WEBSITE_DIST) : path.resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
};

function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      cur = { pattern: line.trim(), headers: {} };
      rules.push(cur);
    } else if (cur) {
      const i = line.indexOf(":");
      cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}
const matches = (pattern, p) => new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(p);

async function find(p) {
  const tries = p.endsWith("/") ? [p + "index.html"] : [p, p + "/index.html"];
  for (const t of tries) {
    try {
      const f = path.join(DIST, t);
      if (!f.startsWith(DIST)) return null;
      if ((await stat(f)).isFile()) return { file: f, redirectSlash: !p.endsWith("/") && t.endsWith("/index.html") };
    } catch {
      /* thử tiếp */
    }
  }
  return null;
}

export async function start(port = 4173) {
  const rules = parseHeaders(await readFile(path.join(DIST, "_headers"), "utf8").catch(() => ""));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    let status = 200;
    let found = await find(decodeURIComponent(url.pathname));
    if (found?.redirectSlash) {
      res.writeHead(308, { location: url.pathname + "/" + url.search });
      return res.end();
    }
    if (!found) {
      status = 404;
      found = { file: path.join(DIST, "404.html") };
    }
    const body = await readFile(found.file).catch(() => Buffer.from("404"));
    const headers = { "content-type": TYPES[path.extname(found.file)] ?? "application/octet-stream" };
    for (const r of rules) if (matches(r.pattern, url.pathname)) Object.assign(headers, r.headers);
    const wantsGzip = /gzip/.test(req.headers["accept-encoding"] ?? "") && /text|json|xml|svg|javascript/.test(headers["content-type"]);
    if (wantsGzip) headers["content-encoding"] = "gzip";
    res.writeHead(status, headers);
    res.end(wantsGzip ? gzipSync(body) : body);
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4173);
  await start(port);
  console.log(`Xem thử: http://127.0.0.1:${port}/`);
}
