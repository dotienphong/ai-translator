import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate, vi as viText } from "../../../i18n";
import type { TtsStatus } from "../../../lib/ipc";
import { resetPatch, VOICE_DEFAULTS, VoiceScreenView, type VoiceScreenViewProps, voicePatch } from "./VoiceScreen";

const AVAILABLE: TtsStatus = { available: true, running: false, reason: null, progress: null };
const NAMES = ["Hải Đăng", "Thái Sơn", "Mai Anh", "Ngọc Trân", "Minh Đức"];

const props = (patch: Partial<VoiceScreenViewProps> = {}): VoiceScreenViewProps => ({
  lang: "vi",
  status: AVAILABLE,
  voices: { names: NAMES, default: "Hải Đăng" },
  settings: { ttsVoiceVi: "Mai Anh", ttsVoiceEn: "Thái Sơn", ttsVolume: 70, ttsSpeed: 1.05, ttsPause: 1.5 },
  previewing: null,
  loading: false,
  error: null,
  onVoice: () => {},
  onChange: () => {},
  onPreview: () => {},
  onReset: () => {},
  onDismiss: () => {},
  ...patch,
});

const html = (p: VoiceScreenViewProps) => renderToStaticMarkup(createElement(VoiceScreenView, p));
// Mọi thẻ `<input …>` và `<button …>` của trang.
const inputs = (markup: string) => markup.match(/<input [^>]*>/g) ?? [];
const buttons = (markup: string) => markup.match(/<button [^>]*>[\s\S]*?<\/button>/g) ?? [];
// Thẻ `<select id=…>` cùng các `<option>` của nó; option được chọn có `selected=""`.
const select = (markup: string, id: string) => markup.match(new RegExp(`<select [^>]*id="${id}"[^>]*>[\\s\\S]*?</select>`))?.[0];
const selectedOption = (markup: string, id: string) =>
  select(markup, id)?.match(/<option [^>]*selected=""[^>]*value="([^"]*)"|<option [^>]*value="([^"]*)"[^>]*selected=""/)?.slice(1).find(Boolean);
const slider = (markup: string, id: string) => inputs(markup).find((tag) => tag.includes(`id="${id}"`));

// Spec 2026-11-04-giong-doc §7: hai cột chọn giọng (Việt, Anh) dạng dropdown nhóm theo vùng, mặc định Thục Đoan / Đức Trí; ba thanh
// trượt; Khôi phục mặc định.
describe("VoiceScreenView", () => {
  it("locked_while_downloading_shows_percent_and_disables_controls", () => {
    const markup = html(props({ status: { available: false, running: false, reason: "downloading", progress: 42 } }));
    expect(markup).toContain(translate("vi", "voice.locked.downloading", { percent: 42 }));
    expect(inputs(markup).length).toBeGreaterThan(0);
    for (const tag of inputs(markup)) expect(tag, tag).toContain('disabled=""');
    expect(select(markup, "voice-vi")).toContain('disabled=""');
    expect(select(markup, "voice-en")).toContain('disabled=""');
    const controls = buttons(markup);
    expect(controls.some((b) => b.includes(viText["voice.reset"]))).toBe(true);
    for (const b of controls) expect(b, b).toContain('disabled=""');
  });

  it("locked_when_unavailable", () => {
    const markup = html(props({ status: { available: false, running: false, reason: "workerMissing", progress: null } }));
    expect(markup).toContain(viText["voice.locked.unavailable"]);
    expect(markup).not.toContain(translate("vi", "voice.locked.downloading", { percent: 0 }));
    for (const tag of inputs(markup)) expect(tag, tag).toContain('disabled=""');
    for (const b of buttons(markup)) expect(b, b).toContain('disabled=""');
  });

  it("locked_when_disabled_does_not_say_not_installed", () => {
    const markup = html(props({ status: { available: false, running: false, reason: "disabled", progress: null } }));
    expect(markup).toContain(viText["voice.locked.disabled"]);
    expect(markup).not.toContain(viText["voice.locked.unavailable"]);
    expect(markup).not.toContain("chưa cài");
    for (const tag of inputs(markup)) expect(tag, tag).toContain('disabled=""');
  });

  it("dùng được thì không có dòng khóa, điều khiển bấm được", () => {
    const markup = html(props());
    expect(markup).not.toContain(viText["voice.locked.unavailable"]);
    for (const tag of inputs(markup)) expect(tag, tag).not.toContain('disabled=""');
  });

  it("lists_voices_in_two_dropdowns_grouped_by_region", () => {
    const markup = html(props());
    expect(markup).toContain(viText["voice.lang.vi"]);
    expect(markup).toContain(viText["voice.lang.en"]);
    expect(inputs(markup).some((tag) => tag.includes('type="radio"'))).toBe(false);
    expect(markup.indexOf(viText["voice.lang.vi"])).toBeLessThan(markup.indexOf(viText["voice.lang.en"]));
    for (const id of ["voice-vi", "voice-en"]) {
      const box = select(markup, id) ?? "";
      expect(box, id).toBeTruthy();
      for (const voice of NAMES) expect(box, `${id} ${voice}`).toContain(`value="${voice}"`);
      expect(box).not.toContain('value=""');
      // Nhóm theo vùng: Bắc, Trung, Nam, Khác.
      const at = (key: "north" | "central" | "south" | "other") => box.indexOf(`label="${viText[`voice.region.${key}`]}"`);
      expect(at("north")).toBeGreaterThan(-1);
      expect(at("north")).toBeLessThan(at("central"));
      expect(at("central")).toBeLessThan(at("south"));
      expect(at("south")).toBeLessThan(at("other"));
      expect(box.indexOf('value="Mai Anh"')).toBeGreaterThan(at("north"));
      expect(box.indexOf('value="Mai Anh"')).toBeLessThan(at("central"));
      expect(box.indexOf('value="Thái Sơn"')).toBeGreaterThan(at("south"));
      expect(box.indexOf('value="Hải Đăng"')).toBeGreaterThan(at("other"));
      expect(box).toContain(`Mai Anh (${viText["voice.gender.female"]})`);
      expect(box).toContain(`Thái Sơn (${viText["voice.gender.male"]})`);
      expect(box).toContain(">Hải Đăng<");
    }
    // Giọng đã lưu được chọn ở từng cột.
    expect(selectedOption(markup, "voice-vi")).toBe("Mai Anh");
    expect(selectedOption(markup, "voice-en")).toBe("Thái Sơn");
    // Một nút Nghe thử mỗi cột.
    expect(buttons(markup).filter((b) => b.includes(viText["voice.preview"]))).toHaveLength(2);
  });

  it("đang nghe thử khối nào thì nút của khối đó là Dừng", () => {
    const markup = html(props({ previewing: "en" }));
    expect(buttons(markup).filter((b) => b.includes(viText["voice.previewStop"]))).toHaveLength(1);
    expect(buttons(markup).filter((b) => b.includes(viText["voice.preview"]))).toHaveLength(1);
    expect(markup.indexOf(viText["voice.previewStop"])).toBeGreaterThan(markup.indexOf(viText["voice.lang.en"]));
  });

  it("unknown_saved_voice_shows_the_language_default_selected", () => {
    const names = [...NAMES, "Thục Đoan", "Đức Trí"];
    const markup = html(
      props({
        voices: { names, default: "Hải Đăng" },
        settings: { ...props().settings, ttsVoiceVi: "Giọng đã bỏ", ttsVoiceEn: null },
      }),
    );
    // Việt mặc định Thục Đoan, Anh mặc định Đức Trí (cả giá trị null cũ của bản trước).
    expect(selectedOption(markup, "voice-vi")).toBe("Thục Đoan");
    expect(selectedOption(markup, "voice-en")).toBe("Đức Trí");
    expect(markup).not.toContain("Giọng đã bỏ");
  });

  it("language_default_missing_from_the_pack_falls_back_to_the_first_voice", () => {
    const markup = html(props({ settings: { ...props().settings, ttsVoiceVi: "Giọng đã bỏ" } }));
    expect(selectedOption(markup, "voice-vi")).toBe("Hải Đăng");
  });

  it("chưa có danh sách giọng thì ô chọn vẫn hiện một giọng (đã lưu hay mặc định)", () => {
    const markup = html(props({ voices: null, settings: { ...props().settings, ttsVoiceEn: null } }));
    expect(selectedOption(markup, "voice-vi")).toBe("Mai Anh");
    expect(selectedOption(markup, "voice-en")).toBe("Đức Trí");
  });

  it("nút Nghe thử gửi giọng đang chọn và giá trị thanh trượt", () => {
    // Static markup không bấm được: kiểm bằng cách gọi lại onPreview mà view truyền cho nút.
    const calls: unknown[] = [];
    const tree = VoiceScreenView(props({ onPreview: (lang, opts) => calls.push([lang, opts]) }));
    const clicks: (() => void)[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const el = node as { props?: Record<string, unknown> };
      if (el.props && typeof el.props.onClick === "function" && el.props.className === "tts-btn")
        clicks.push(el.props.onClick as () => void);
      const kids = el.props?.children;
      for (const k of Array.isArray(kids) ? kids.flat(Infinity) : [kids]) walk(k);
    };
    walk(tree);
    expect(clicks).toHaveLength(2);
    for (const click of clicks) click();
    expect(calls).toEqual([
      ["vi", { text: viText["voice.sample.vi"], voice: "Mai Anh", speed: 1.05, pause: 1.5, volume: 70 }],
      ["en", { text: viText["voice.sample.en"], voice: "Thái Sơn", speed: 1.05, pause: 1.5, volume: 70 }],
    ]);
  });

  it("sliders_show_current_values_and_ranges", () => {
    const markup = html(props());
    const volume = slider(markup, "tts-volume");
    expect(volume).toMatch(/min="0"/);
    expect(volume).toMatch(/max="100"/);
    expect(volume).toMatch(/step="1"/);
    expect(volume).toMatch(/value="70"/);
    const speed = slider(markup, "tts-speed");
    expect(speed).toMatch(/min="0.8"/);
    expect(speed).toMatch(/max="1.3"/);
    expect(speed).toMatch(/step="0.05"/);
    expect(speed).toMatch(/value="1.05"/);
    const pause = slider(markup, "tts-pause");
    expect(pause).toMatch(/min="0.5"/);
    expect(pause).toMatch(/max="2"/);
    expect(pause).toMatch(/step="0.1"/);
    expect(pause).toMatch(/value="1.5"/);
    expect(markup).toContain(viText["voice.volume"]);
    expect(markup).toContain(viText["voice.speed"]);
    expect(markup).toContain(viText["voice.pause"]);
    expect(markup).toContain("70%");
    expect(markup).toContain("1,05×");
    expect(markup).toContain("1,5×");
  });

  it("reset_button_present", () => {
    const markup = html(props());
    const reset = buttons(markup).find((b) => b.includes(viText["voice.reset"]));
    expect(reset).toBeTruthy();
    expect(reset).not.toContain('disabled=""');
  });

  it("lỗi đọc hiện thông báo ngắn có nút đóng", () => {
    const markup = html(props({ error: { code: "ttsFailed", field: null } }));
    expect(markup).toContain(viText["error.ttsFailed"]);
    expect(markup).toContain(viText["common.dismiss"]);
  });
});

// Spec §8: chọn giọng lưu đúng khóa; Khôi phục mặc định ghi cả năm khóa (đây là các bộ dựng mà `VoiceScreen` đưa vào `updateSettings`).
describe("VoiceScreen wiring", () => {
  it("choosing_a_voice_patches_the_key_of_its_language", () => {
    expect(voicePatch("vi", "Mai Anh")).toEqual({ ttsVoiceVi: "Mai Anh" });
    expect(voicePatch("en", "Hải Đăng")).toEqual({ ttsVoiceEn: "Hải Đăng" });
  });

  it("reset_patches_all_five_keys_to_defaults", () => {
    expect(resetPatch()).toEqual({
      ttsVoiceVi: "Thục Đoan",
      ttsVoiceEn: "Đức Trí",
      ttsVolume: 100,
      ttsSpeed: 1,
      ttsPause: 1,
    });
    expect(resetPatch()).toEqual(VOICE_DEFAULTS);
  });
});
