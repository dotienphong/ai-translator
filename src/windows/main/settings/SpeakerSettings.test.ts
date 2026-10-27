import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi as viText } from "../../../i18n";
import { SpeakerSettingsCard, type SpeakerSettingsCardProps } from "./SpeakerSettings";

const props = (patch: Partial<SpeakerSettingsCardProps> = {}): SpeakerSettingsCardProps => ({
  lang: "vi",
  platform: "macos",
  diarization: true,
  names: true,
  trusted: false,
  model: "ready",
  onDiarization: () => {},
  onNames: () => {},
  onOpenAccessibility: () => {},
  ...patch,
});

const html = (p: SpeakerSettingsCardProps) => renderToStaticMarkup(createElement(SpeakerSettingsCard, p));
const fields = (markup: string) => markup.split('<div class="field">').length - 1;

// Spec 2026-10-26-phan-biet-nguoi-noi §8.3: hai công tắc bật sẵn; "Lấy tên" tắt theo "Phân biệt"; "Quyền Trợ năng" chỉ macOS, dùng
// chung với Gõ dịch; §4.5: "đang tải" khi chưa có dữ liệu nhận giọng.
describe("SpeakerSettingsCard", () => {
  it("macOS, hai công tắc bật: có dòng Quyền Trợ năng (chưa cấp, đã cấp)", () => {
    const markup = html(props());
    expect(markup).toContain('<section id="speaker-settings"');
    expect(markup).toContain(viText["settings.speakers.title"]);
    expect(fields(markup)).toBe(3);
    expect(markup).toMatch(/<input id="speaker-diarization"[^>]*checked=""/);
    expect(markup).toMatch(/<input id="speaker-names"[^>]*checked=""/);
    expect(markup).toContain(viText["settings.speakers.permission.missing"]);
    expect(html(props({ trusted: true }))).toContain(viText["settings.speakers.permission.granted"]);
  });

  it("Windows không có dòng quyền", () => {
    expect(fields(html(props({ platform: "windows" })))).toBe(2);
  });

  it("tắt Phân biệt: Lấy tên tắt theo, không bấm được, không có dòng quyền", () => {
    const markup = html(props({ diarization: false }));
    expect(markup).toMatch(/<input id="speaker-names"[^>]*disabled=""/);
    expect(markup).not.toMatch(/<input id="speaker-names"[^>]*checked=""/);
    expect(fields(markup)).toBe(2);
  });

  it("dữ liệu nhận giọng đang tải hay chưa có: ghi dưới Phân biệt người nói", () => {
    expect(html(props({ model: "downloading" }))).toContain(viText["settings.speakers.model.downloading"]);
    expect(html(props({ model: "missing" }))).toContain(viText["settings.speakers.model.missing"]);
    expect(html(props({ model: "ready" }))).not.toContain('class="field-note"');
    expect(html(props({ model: "unavailable" }))).not.toContain('class="field-note"');
  });
});
