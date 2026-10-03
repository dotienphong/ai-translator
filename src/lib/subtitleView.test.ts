import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppStatus, BackgroundColor, Subtitle, TextColor } from "./ipc";
import {
  BACKGROUND_COLORS,
  TEXT_COLORS,
  clockTime,
  dateTime,
  lineView,
  localOffsetMinutes,
  overlayBackground,
  overlayNotes,
} from "./subtitleView";

const sub = (status: Subtitle["status"], tgt = "", provisional = false): Subtitle => ({
  id: 1,
  start_ms: 0,
  end_ms: 1000,
  src_lang: "en",
  src_text: "Hello",
  tgt_text: tgt,
  status,
  provisional,
  replaces: [],
});

const status = (patch: Partial<AppStatus>): AppStatus => ({
  session: "running",
  overlayVisible: true,
  hotkeyFailures: [],
  loading: null,
  sessionError: null,
  cpuFallback: false,
  suggestLite: false,
  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
  permissionSuspected: false,
  waitingForApp: false,
  pro: true,
  quotaWarning: false,
  quotaResetAt: null,
  updateReady: null,
  rev: 1,
  ...patch,
});

describe("lineView", () => {
  it("bản dịch xong là dòng chính, câu gốc chỉ khi bật hiện câu gốc", () => {
    expect(lineView(sub("done", "Xin chào"), false)).toEqual({
      kind: "translated",
      main: "Xin chào",
      source: null,
      provisional: false,
    });
    expect(lineView(sub("done", "Xin chào"), true).source).toBe("Hello");
  });

  it("đang dịch: chữ dịch tới dần; chưa có chữ nào thì câu gốc màu nhạt", () => {
    expect(lineView(sub("translating", "Xin"), true)).toMatchObject({ kind: "translating", main: "Xin", source: "Hello" });
    expect(lineView(sub("translating"), true)).toMatchObject({ kind: "pending", main: "Hello", source: null });
    expect(lineView(sub("asr_done"), false)).toMatchObject({ kind: "pending", main: "Hello" });
  });

  it("cùng ngôn ngữ, bỏ bước dịch, dịch lỗi và đoạn bị bỏ", () => {
    expect(lineView(sub("same_lang"), true)).toMatchObject({ kind: "sourceOnly", main: "Hello", source: null });
    expect(lineView(sub("skipped"), true).kind).toBe("sourceOnly");
    expect(lineView(sub("failed"), true)).toMatchObject({ kind: "failed", main: "Hello" });
    expect(lineView(sub("dropped"), true)).toMatchObject({ kind: "dropped", main: "" });
    expect(lineView(sub("done"), false).kind).toBe("sourceOnly");
  });

  it("phụ đề tạm giữ cờ provisional", () => {
    expect(lineView(sub("done", "Xin chào", true), false).provisional).toBe(true);
  });
});

describe("giờ", () => {
  // 2026-10-02 07:05:09 UTC.
  const t = Date.UTC(2026, 9, 2, 7, 5, 9);

  it("giờ địa phương theo độ lệch múi giờ", () => {
    expect(clockTime(t, 7 * 60)).toBe("14:05:09");
    expect(clockTime(t, -9 * 60)).toBe("22:05:09");
    expect(dateTime(t, 7 * 60)).toBe("2026-10-02 14:05");
    expect(dateTime(t, -9 * 60)).toBe("2026-10-01 22:05");
  });

  describe("độ lệch múi giờ tại một thời điểm (N4 của review 03)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("theo giờ mùa hè của đúng thời điểm đó, không theo lúc này", () => {
      vi.stubEnv("TZ", "Europe/Berlin");
      expect(localOffsetMinutes(Date.UTC(2026, 0, 15))).toBe(60);
      expect(localOffsetMinutes(Date.UTC(2026, 6, 15))).toBe(120);
      vi.stubEnv("TZ", "Asia/Ho_Chi_Minh");
      expect(localOffsetMinutes(Date.UTC(2026, 6, 15))).toBe(420);
    });
  });
});

// Độ sáng tương đối và tỉ lệ tương phản theo WCAG 2.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("bảng màu của phụ đề (§4.3)", () => {
  it("đủ năm màu chữ và năm màu nền của spec", () => {
    expect(Object.keys(TEXT_COLORS)).toEqual(["white", "yellow", "green", "lightBlue", "orange"]);
    expect(Object.keys(BACKGROUND_COLORS)).toEqual(["black", "darkGray", "navy", "darkBrown", "darkPurple"]);
  });

  it("mọi màu chữ đọc được trên mọi màu nền (tương phản ít nhất 4,5:1, §6.10)", () => {
    for (const text of Object.keys(TEXT_COLORS) as TextColor[]) {
      for (const background of Object.keys(BACKGROUND_COLORS) as BackgroundColor[]) {
        expect(contrast(TEXT_COLORS[text], BACKGROUND_COLORS[background]), `${text} / ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("nền là màu đã chọn với độ mờ đã chọn", () => {
    expect(overlayBackground("black", 0.6)).toBe("rgba(0, 0, 0, 0.6)");
    expect(overlayBackground("navy", 0)).toBe("rgba(12, 27, 58, 0)");
    expect(overlayBackground("darkPurple", 1)).toBe("rgba(46, 16, 70, 1)");
  });
});

describe("overlayNotes", () => {
  it("không có trạng thái thì không có gì", () => {
    expect(overlayNotes(null)).toEqual([]);
  });

  it("đang nạp model, lần đầu, và các chỉ báo lúc đang dịch", () => {
    expect(overlayNotes(status({ session: "starting", loading: "model" }))).toEqual(["loading"]);
    expect(overlayNotes(status({ session: "starting", loading: "firstRun" }))).toEqual(["firstRun"]);
    expect(
      overlayNotes(
        status({
          waitingForApp: true,
          quotaWarning: true,
          indicators: { lagging: true, noAudio: true, translationUnavailable: true },
        }),
      ),
    ).toEqual(["noAudio", "waitingForApp", "quotaLow", "lagging", "translationUnavailable"]);
    // Còn dưới 5 phút chỉ nhắc khi đang dịch (kế hoạch 06).
    expect(overlayNotes(status({ session: "idle", quotaWarning: true }))).toEqual([]);
  });

  it("chỉ báo của phiên chỉ hiện khi đang dịch; lỗi và hết hạn mức hiện sau khi dừng", () => {
    expect(overlayNotes(status({ session: "idle", indicators: { lagging: true, noAudio: true, translationUnavailable: false } }))).toEqual([]);
    expect(overlayNotes(status({ session: "error", sessionError: "quotaExhausted" }))).toEqual(["quotaExhausted"]);
    expect(overlayNotes(status({ session: "error", sessionError: "sidecarFailed" }))).toEqual(["error"]);
  });
});
