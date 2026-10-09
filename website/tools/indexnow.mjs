// Báo cho Bing, Yandex, Naver, Seznam (IndexNow) biết các URL trong sitemap đã đổi, để công cụ tìm kiếm và trợ lý AI dùng chỉ mục
// của Bing (ChatGPT search, Copilot) nhận nội dung mới nhanh hơn. Chạy sau khi deploy:   node tools/indexnow.mjs
// Khóa nằm ở src/public/<khóa>.txt (nội dung file đúng bằng khóa) và được phục vụ tại gốc tên miền. Không bắt buộc: lỗi mạng chỉ
// in cảnh báo, không làm hỏng deploy. https://www.indexnow.org/documentation
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const host = "aitranslator.io.vn";
const files = await readdir(path.join(root, "src/public"));
const keyFile = files.find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) {
  console.log("indexnow: chưa có file khóa trong src/public, bỏ qua");
  process.exit(0);
}
const key = keyFile.replace(/\.txt$/, "");
const sitemap = await readFile(path.join(root, "dist/sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
try {
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `https://${host}/${keyFile}`, urlList }),
  });
  console.log(`indexnow: ${urlList.length} URL, HTTP ${res.status}`);
} catch (e) {
  console.log("indexnow: không gửi được (" + e.message + "), bỏ qua");
}
