import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Hai cửa sổ, mỗi cửa sổ một entry HTML riêng (spec §6.10).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Vite mặc định lắng nghe `localhost`, mà Node 24 phân giải thành `::1` (IPv6) trước. Cửa sổ của app (WKWebView, mở
  // bằng `open` từ gói `.app`) lại kết nối `localhost` qua IPv4, nên gặp "Could not connect to the server" và trang trắng.
  // Ép lắng nghe 127.0.0.1; `devUrl` vẫn là `http://localhost:1420` vì chặn điều hướng chỉ cho địa chỉ đó (navigation.rs).
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        overlay: resolve(import.meta.dirname, "overlay.html"),
      },
    },
  },
});
