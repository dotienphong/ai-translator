// Chữ trong thư nhắc gia hạn (server/src/email/reminder-strings.ts) phải khớp giao diện app và website, như thư key
// (email-strings.test.mjs): tên mục "Nâng cấp Pro" đúng như app hiện ở từng ngôn ngữ (src/i18n/*.ts, nav.upgrade), và link nút trỏ
// đúng trang hướng dẫn của website (MAIL[lang].guidePath, đã có test riêng). Chạy bằng `pnpm test:scripts`.
import assert from "node:assert/strict";
import { test } from "node:test";

const LANGS = ["vi", "en", "ja", "zh", "ko"];
const { REMINDER } = await import(new URL("../../src/email/reminder-strings.ts", import.meta.url));
const ui = Object.fromEntries(
  await Promise.all(LANGS.map(async (l) => [l, (await import(new URL(`../../../src/i18n/${l}.ts`, import.meta.url)))[l]])),
);

test("bước 2 của thư nhắc gia hạn và tên mục in đậm dùng đúng chữ của app (nav.upgrade)", () => {
  for (const l of LANGS) {
    const s = REMINDER[l];
    const label = ui[l]["nav.upgrade"];
    assert.equal(s.upgradeLabel, label, `${l}: upgradeLabel khác nav.upgrade ("${label}")`);
    assert.ok(s.steps[1].includes(label), `${l}: bước 2 "${s.steps[1]}" thiếu "${label}"`);
  }
});

test("mọi ngôn ngữ có đủ chữ và hàm sinh chữ trả chuỗi không rỗng", () => {
  for (const l of LANGS) {
    const s = REMINDER[l];
    for (const text of [
      s.subject("Yearly", 3),
      s.eyebrow,
      s.heading("Yearly"),
      s.lead(3),
      s.monthLabel(11),
      s.badge(3),
      s.planTitle("Yearly"),
      s.expiresOn,
      s.keyLabel,
      s.renewTitle("Yearly"),
      s.addDays(365),
      ...s.checks,
      s.button,
      s.stepsTitle,
      ...s.steps,
      s.help,
      s.footerReason,
      s.unsubscribe,
    ]) {
      assert.ok(typeof text === "string" && text.trim().length > 0, `${l}: có chữ rỗng`);
    }
    for (let m = 1; m <= 12; m++) assert.ok(s.monthLabel(m).length > 0, `${l}: thiếu nhãn tháng ${m}`);
  }
});
