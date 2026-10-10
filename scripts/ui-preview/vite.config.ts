import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Xem trước giao diện app trong trình duyệt, không cần Tauri: dùng đúng mã của `src/`, chỉ thay hai module Tauri
// (`invoke`, `listen`) bằng bản giả có dữ liệu mẫu (`tauri-mock.ts`). Dùng để kiểm giao diện và chụp ảnh cho website
// (`shoot.mjs`). Không nằm trong bản build của app.
//
//   pnpm exec vite --config scripts/ui-preview/vite.config.ts
//   http://127.0.0.1:1430/?screen=settings&group=general&lang=vi&theme=dark
const root = resolve(import.meta.dirname, "../..");
const mock = resolve(import.meta.dirname, "tauri-mock.ts");

export default defineConfig({
  root,
  plugins: [react()],
  clearScreen: false,
  resolve: { alias: { "@tauri-apps/api/core": mock, "@tauri-apps/api/event": mock } },
  server: { host: "127.0.0.1", port: 1430, strictPort: true },
});
