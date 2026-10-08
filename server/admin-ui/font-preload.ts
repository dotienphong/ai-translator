// Plugin Vite (chỉ khi build): thêm <link rel="preload" as="font"> cho mọi tệp .woff2 mà bản build phát ra vào <head> của
// index.html. Lý do: trang là SPA, chữ chỉ có sau khi JS chạy xong, nên trình duyệt mới đòi font lúc đó và chữ đổi từ font
// hệ thống sang Be Vietnam Pro ngay trước mắt (font-display: swap). Tải trước thì font về song song với JS. Bốn tệp (400, 600 ×
// latin, vietnamese) trang nào cũng dùng: mọi trang có chữ có dấu và chữ đậm 600, nên không tải thừa.
// Tên tệp có băm do Vite đặt: lấy từ chính bundle (ctx.bundle) chứ không đoán. Cùng origin (CSP default-src 'self' cho font);
// crossorigin là bắt buộc với preload font, không thì trình duyệt tải hai lần.
import type { Plugin } from "vite";

export function preloadFonts(): Plugin {
  let base = "/";
  return {
    name: "admin-preload-fonts",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const fonts = Object.keys(ctx.bundle ?? {})
          .filter((f) => f.endsWith(".woff2"))
          .sort();
        return fonts.map((f) => ({
          tag: "link",
          attrs: { rel: "preload", href: `${base}${f}`, as: "font", type: "font/woff2", crossorigin: true },
          injectTo: "head" as const,
        }));
      },
    },
  };
}
