import { describe, expect, it } from "vitest";
import { canAdvance, stepsFor } from "./onboardingSteps";

describe("stepsFor", () => {
  it("macOS: bước Điều khoản ngay sau chọn ngôn ngữ, trước tải model", () => {
    expect(stepsFor("macos")).toEqual([
      "language", "terms", "model", "download", "permission", "languages", "test", "privacy", "tray",
    ]);
  });
  it("Windows: bỏ bước quyền ghi âm thanh hệ thống", () => {
    expect(stepsFor("windows")).not.toContain("permission");
    expect(stepsFor("windows")[1]).toBe("terms");
  });
});

describe("canAdvance", () => {
  it("chỉ bước Điều khoản bị khóa khi chưa đồng ý", () => {
    expect(canAdvance("terms", false)).toBe(false);
    expect(canAdvance("terms", true)).toBe(true);
    expect(canAdvance("language", false)).toBe(true);
    expect(canAdvance("tray", false)).toBe(true);
  });
});
