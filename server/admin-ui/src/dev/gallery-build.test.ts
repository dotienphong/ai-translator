// @vitest-environment node
// Trang thử thành phần (src/dev/Gallery.tsx) chỉ có ở dev server: dựng bản build thật (trong bộ nhớ, không ghi dist/) rồi
// kiểm không tệp nào có tên gallery hay chứa chuỗi đặc trưng của trang thử, đường dẫn /__gallery, CSS riêng của nó.
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { GALLERY_MARKER } from "./Gallery";

const ROOT = new URL("../..", import.meta.url).pathname;
// Không dùng kiểu của Node (dự án không cài @types/node): chỉ cần biến môi trường NODE_ENV.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

interface OutputFile {
  fileName: string;
  code?: string;
  source?: string | Uint8Array;
}

describe("bản build không có trang thử thành phần", () => {
  it(
    "không có Gallery, /__gallery hay gallery.css trong các tệp phát ra",
    async () => {
      // Vitest đặt NODE_ENV=test; bản build thật chạy với production (import.meta.env.DEV là false).
      const before = env.NODE_ENV;
      env.NODE_ENV = "production";
      let result: unknown;
      try {
        result = await build({
          root: ROOT,
          mode: "production",
          configFile: `${ROOT}vite.config.ts`,
          logLevel: "silent",
          build: { write: false },
        });
      } finally {
        env.NODE_ENV = before;
      }
      const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => (r as { output: OutputFile[] }).output);
      const names = outputs.map((o) => o.fileName);
      expect(names.some((n) => n.endsWith(".js"))).toBe(true);
      expect(names.some((n) => n.endsWith(".css"))).toBe(true);
      expect(names.filter((n) => /gallery/i.test(n))).toEqual([]);
      for (const o of outputs) {
        const text = o.code ?? (typeof o.source === "string" ? o.source : "");
        expect(text.includes(GALLERY_MARKER), o.fileName).toBe(false);
        expect(text.includes("__gallery"), o.fileName).toBe(false);
        expect(text.includes(".g-block"), o.fileName).toBe(false);
      }
    },
    120_000,
  );
});
