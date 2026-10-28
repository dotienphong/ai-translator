import { describe, expect, it } from "vitest";
import { translate, UI_LANGUAGES, type UiLanguage } from "./index";

// Chữ của "Phân biệt người nói" (spec 2026-10-26-phan-biet-nguoi-noi §8). Lời giải thích của "Lấy tên" nhắc đúng nhãn tự động mà
// phía Rust tính (`speaker_voice` ở src-tauri/src/i18n.rs): sửa một nơi thì sửa nơi kia.
const AUTO_LABEL: Record<UiLanguage, string> = { en: "Speaker 1", vi: "Người 1", ja: "話者1", zh: "说话人1", ko: "화자 1" };

describe("chữ của người nói", () => {
  it("lời giải thích của Lấy tên ghi đúng nhãn tự động của từng ngôn ngữ", () => {
    for (const lang of UI_LANGUAGES) {
      expect(translate(lang, "settings.speakers.names.hint"), lang).toContain(AUTO_LABEL[lang]);
    }
  });

  // Công thức build sẵn chỉ có Teams (07 QĐ 7): chữ không hứa Meet hay Zoom tới khi công thức của chúng được bật.
  it("chữ của Lấy tên chỉ nhắc Teams ở mọi ngôn ngữ", () => {
    for (const lang of UI_LANGUAGES) {
      for (const key of ["settings.speakers.names", "settings.speakers.names.hint"] as const) {
        const text = translate(lang, key);
        expect(text, `${lang} ${key}`).toContain("Teams");
        expect(text, `${lang} ${key}`).not.toMatch(/Meet|Zoom/);
      }
    }
  });

  it("đổi tên và menu điền đúng tên người nói", () => {
    for (const lang of UI_LANGUAGES) {
      expect(translate(lang, "transcript.speaker.rename", { name: "Lan" }), lang).toContain("Lan");
      expect(translate(lang, "transcript.speaker.menu", { name: "Lan" }), lang).toContain("Lan");
    }
  });
});
