import { describe, expect, it } from "vitest";
import { AT_BOTTOM_SLACK_PX, atBottom, pagedScrollTop } from "./overlayScroll";

const m = (scrollTop: number, clientHeight = 100, scrollHeight = 1000) => ({ scrollTop, clientHeight, scrollHeight });

describe("atBottom", () => {
  it("ở đáy khi cuộn hết, hoặc còn cách đáy không quá ngưỡng sai số", () => {
    expect(atBottom(m(900))).toBe(true);
    expect(atBottom(m(900 - AT_BOTTOM_SLACK_PX))).toBe(true);
    expect(atBottom(m(900 - AT_BOTTOM_SLACK_PX - 1))).toBe(false);
    expect(atBottom(m(0))).toBe(false);
  });

  it("nội dung ngắn hơn khung thì luôn ở đáy (không có gì để cuộn)", () => {
    expect(atBottom(m(0, 100, 60))).toBe(true);
  });
});

describe("pagedScrollTop", () => {
  it("mỗi lần cuộn một phần lớn khung nhìn, để còn thấy dòng cuối của trang trước", () => {
    expect(pagedScrollTop(m(500), "up")).toBe(420);
    expect(pagedScrollTop(m(500), "down")).toBe(580);
  });

  it("không vượt đầu và đáy", () => {
    expect(pagedScrollTop(m(30), "up")).toBe(0);
    expect(pagedScrollTop(m(880), "down")).toBe(900);
    expect(pagedScrollTop(m(0, 100, 60), "down")).toBe(0);
  });

  it("khung rất thấp vẫn cuộn được ít nhất một đoạn", () => {
    expect(pagedScrollTop(m(500, 20), "down")).toBe(540);
  });
});
