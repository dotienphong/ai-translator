import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fakeAdminApi } from "./dev/fake-api.ts";

// Trang Web Admin (spec 2026-10-07 Web Admin §2). Build ra dist/; Worker mt-license-admin phục vụ qua binding ASSETS.
// `pnpm dev`: xem giao diện với API giả (dev/fake-api.ts, chỉ có ở dev server, không vào bản build).
export default defineConfig({
  plugins: [react(), fakeAdminApi()],
  server: { host: "127.0.0.1", port: 5180, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Font luôn là tệp riêng (không nhúng data: URI): CSP không có font-src nên chỉ nhận font từ 'self'.
    assetsInlineLimit: (file) => (file.endsWith(".woff2") ? false : undefined),
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
    // src/styles/contrast.test.ts đọc tokens.css (?raw): mặc định Vitest bỏ nội dung CSS, nên bật riêng tệp này.
    css: { include: [/tokens\.css/] },
  },
});
