import { defineConfig } from "vitest/config";

// Test logic của giao diện (store, i18n, phím tắt) chạy trong Node, không cần DOM hay Tauri.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
