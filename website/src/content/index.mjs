// Danh mục toàn bộ trang. Mỗi trang là một object: { id, lang, path, title, description, body, ... } (xem build/layout.mjs).
import home from "./vi/home.mjs";

export const pages = [home];

export const notFound = {
  id: "404",
  lang: "vi",
  path: "/404.html",
  title: "Không tìm thấy trang",
  description: "Trang bạn tìm không tồn tại hoặc đã được chuyển đi. Quay về trang chủ AI Translator để tiếp tục.",
  noindex: true,
  body: `<section class="section"><div class="container narrow"><h1>Không tìm thấy trang · Page not found</h1><p class="lead">Trang bạn tìm không tồn tại hoặc đã được chuyển đi.</p><p><a class="btn btn-primary" href="/">Về trang chủ</a> <a class="btn btn-secondary" href="/en/">Back to home</a></p></div></section>`,
};
