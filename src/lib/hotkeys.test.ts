import { describe, expect, it } from "vitest";
import { acceleratorFromEvent, formatAccelerator } from "./hotkeys";

const key = (code: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({
  code,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
  metaKey: mods.meta ?? false,
});

describe("acceleratorFromEvent", () => {
  it("ghép phím bổ trợ theo thứ tự Ctrl, Alt, Shift, Super rồi tới mã phím", () => {
    expect(acceleratorFromEvent(key("KeyT", { ctrl: true, alt: true }))).toBe("Ctrl+Alt+KeyT");
    expect(acceleratorFromEvent(key("Digit1", { meta: true, shift: true }))).toBe("Shift+Super+Digit1");
    expect(acceleratorFromEvent(key("F10", { alt: true }))).toBe("Alt+F10");
  });

  it("chờ phím chính khi mới bấm phím bổ trợ", () => {
    expect(acceleratorFromEvent(key("ControlLeft", { ctrl: true }))).toBeNull();
    expect(acceleratorFromEvent(key("MetaRight", { meta: true }))).toBeNull();
    expect(acceleratorFromEvent(key(""))).toBeNull();
  });

  it("không có phím bổ trợ vẫn trả về, để phía Rust báo lỗi", () => {
    expect(acceleratorFromEvent(key("KeyT"))).toBe("KeyT");
  });
});

describe("formatAccelerator", () => {
  it("macOS dùng ký hiệu", () => {
    expect(formatAccelerator("Ctrl+Alt+T", "macos")).toBe("⌃⌥T");
    expect(formatAccelerator("Shift+Super+1", "macos")).toBe("⇧⌘1");
  });

  it("Windows dùng tên phím", () => {
    expect(formatAccelerator("Ctrl+Alt+T", "windows")).toBe("Ctrl+Alt+T");
    expect(formatAccelerator("Shift+Super+F10", "windows")).toBe("Shift+Win+F10");
  });
});
