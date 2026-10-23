// Chữ trong thư gửi khách (server/src/email/strings.ts) phải khớp giao diện app và website (spec 2026-10-23 §2, D6): tên mục
// Cài đặt › Bản quyền, nút Kích hoạt và màn hình Hỗ trợ đúng như app hiện ở từng ngôn ngữ (src/i18n/*.ts), và link hướng dẫn trỏ
// đúng trang mua và kích hoạt key của website ở ngôn ngữ đó. Đổi chữ ở app hay đổi đường dẫn trang thì test này đỏ. Node tự bỏ kiểu
// của file .ts (type stripping), nên test đọc thẳng file nguồn. Chạy bằng `pnpm test:scripts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const LANGS = ["vi", "en", "ja", "zh", "ko"];
const { MAIL } = await import(new URL("../../src/email/strings.ts", import.meta.url));
const ui = Object.fromEntries(
  await Promise.all(LANGS.map(async (l) => [l, (await import(new URL(`../../../src/i18n/${l}.ts`, import.meta.url)))[l]])),
);

test("các bước kích hoạt và câu cuối của thư hỗ trợ dùng đúng chữ của giao diện app", () => {
  for (const l of LANGS) {
    const s = MAIL[l];
    const t = ui[l];
    for (const key of ["nav.settings", "settings.group.license"]) {
      assert.ok(s.steps[1].includes(t[key]), `${l}: bước 2 "${s.steps[1]}" thiếu "${t[key]}" (${key})`);
    }
    const button = t["settings.license.activate.button"];
    assert.ok(s.steps[2].includes(button), `${l}: bước 3 "${s.steps[2]}" thiếu "${button}"`);
    assert.ok(s.supportOutro.includes(t["nav.support"]), `${l}: câu cuối thư hỗ trợ thiếu "${t["nav.support"]}"`);
  }
});

test("link hướng dẫn trỏ đúng trang mua và kích hoạt key của website ở từng ngôn ngữ", () => {
  for (const l of LANGS) {
    const page = readFileSync(new URL(`../../../website/src/content/${l}/guide-license.mjs`, import.meta.url), "utf8");
    const path = /^ {2}path: "([^"]+)"/m.exec(page)?.[1];
    assert.equal(MAIL[l].guidePath, path, `${l}: guidePath khác path của website/src/content/${l}/guide-license.mjs`);
  }
});
