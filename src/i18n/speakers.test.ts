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

  it("tên Teams, Meet, Zoom giữ nguyên ở mọi ngôn ngữ", () => {
    for (const lang of UI_LANGUAGES) {
      for (const app of ["Teams", "Meet", "Zoom"]) {
        expect(translate(lang, "settings.speakers.names"), `${lang} ${app}`).toContain(app);
        expect(translate(lang, "settings.speakers.names.hint"), `${lang} ${app}`).toContain(app);
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
