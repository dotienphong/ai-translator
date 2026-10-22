import { describe, expect, it } from "vitest";
import { ago, customerText, headerLine, listText } from "../src/support/format";
import type { RecentConversation } from "../src/support/store";

const conv = { code: "K7Q", source: "web", lang: "vi", page: "/bang-gia/", context: null } as const;

describe("chữ gửi tới Zalo (spec 2026-10-22 §2.3, §2.5)", () => {
  it("headerLine: mã, nguồn, ngôn ngữ, rồi trang hay thông tin máy, cách nhau bằng ·", () => {
    expect(headerLine(conv)).toBe("🆕 #K7Q · web · vi · /bang-gia/");
    expect(headerLine({ code: "M2D", source: "app", lang: "en", page: null, context: "AI Translator 0.2.4 · macOS 15.6" })).toBe(
      "🆕 #M2D · app · en · AI Translator 0.2.4 · macOS 15.6",
    );
    expect(headerLine({ code: "M2D", source: "app-debug", lang: "vi", page: null, context: null })).toBe("🆕 #M2D · app (debug) · vi");
  });

  it("customerText: tin đầu có dòng 🆕 rồi xuống dòng, tin sau chỉ có mã; không quá 2000 ký tự", () => {
    expect(customerText(conv, "Xin chào", true)).toBe("🆕 #K7Q · web · vi · /bang-gia/\nXin chào");
    expect(customerText(conv, "Cảm ơn", false)).toBe("#K7Q Cảm ơn");
    const long = customerText(conv, "y".repeat(1990), true);
    expect(Array.from(long)).toHaveLength(2000);
    expect(long.endsWith("…")).toBe(true);
  });

  it("ago: vừa xong, phút, giờ, ngày", () => {
    expect([0, 59, 60, 3599, 3600, 86399, 86400, 3 * 86400].map((s) => ago(s))).toEqual([
      "vừa xong",
      "vừa xong",
      "1 phút trước",
      "59 phút trước",
      "1 giờ trước",
      "23 giờ trước",
      "1 ngày trước",
      "3 ngày trước",
    ]);
  });

  it("listText: không có cuộc nào; có thì mỗi dòng mã · nguồn · bao lâu, dấu ✉️ và ⛔, 30 ký tự đầu của tin cuối", () => {
    expect(listText([], 1000)).toBe("Không có cuộc chat nào trong 7 ngày qua.");
    const rows: RecentConversation[] = [
      { code: "K7Q", source: "web", status: "open", has_email: 1, last_activity_at: 1000 - 60, last_text: "Cảm ơn, vậy mình mua 2 key nhé bạn ơi" },
      { code: "M2D", source: "app", status: "blocked", has_email: 0, last_activity_at: 1000 - 7200, last_text: "spam\nspam" },
      { code: "Z9Z", source: "app-debug", status: "open", has_email: 0, last_activity_at: 1000, last_text: null },
    ];
    expect(listText(rows, 1000)).toBe(
      [
        "Cuộc chat 7 ngày qua:",
        '#K7Q · web · 1 phút trước ✉️ · "Cảm ơn, vậy mình mua 2 key nh…"',
        '#M2D · app · 2 giờ trước ⛔ · "spam spam"',
        "#Z9Z · app (debug) · vừa xong",
      ].join("\n"),
    );
  });
});
