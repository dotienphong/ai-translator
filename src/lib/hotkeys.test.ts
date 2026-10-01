import { describe, expect, it } from "vitest";
import { acceleratorFromEvent, formatAccelerator, recorderStep } from "./hotkeys";

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
    expect(acceleratorFromEvent(key("OSLeft", { meta: true }))).toBeNull();
    expect(acceleratorFromEvent(key("OSRight", { meta: true }))).toBeNull();
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

  it("tên phím W3C hiện thành tên quen thuộc, giống nhau ở hai hệ điều hành", () => {
    const cases: [string, string][] = [
      ["ArrowUp", "↑"],
      ["ArrowDown", "↓"],
      ["ArrowLeft", "←"],
      ["ArrowRight", "→"],
      ["Backquote", "`"],
      ["Equal", "="],
      ["Minus", "-"],
      ["BracketLeft", "["],
      ["BracketRight", "]"],
      ["Backslash", "\\"],
      ["Semicolon", ";"],
      ["Quote", "'"],
      ["Comma", ","],
      ["Period", "."],
      ["Slash", "/"],
      ["Space", "Space"],
      ["Enter", "Enter"],
      ["Escape", "Esc"],
      ["Tab", "Tab"],
      ["Backspace", "Backspace"],
      ["Delete", "Delete"],
      ["F1", "F1"],
      ["F24", "F24"],
    ];
    for (const [code, shown] of cases) {
      expect(formatAccelerator(`Ctrl+Alt+${code}`, "windows"), code).toBe(`Ctrl+Alt+${shown}`);
      expect(formatAccelerator(`Ctrl+Alt+${code}`, "macos"), code).toBe(`⌃⌥${shown}`);
    }
  });

  it("tên phím không có trong bảng giữ nguyên; phím bổ trợ vẫn hiện như cũ", () => {
    expect(formatAccelerator("Ctrl+Alt+Numpad1", "windows")).toBe("Ctrl+Alt+Numpad1");
    expect(formatAccelerator("Alt+Shift+Minus", "macos")).toBe("⌥⇧-");
  });
});

describe("recorderStep", () => {
  const press = (code: string, mods: Parameters<typeof key>[1] = {}, repeat = false) => ({ ...key(code, mods), repeat });

  it("phím tắt đủ thì gửi, Esc thì hủy", () => {
    expect(recorderStep(press("KeyK", { ctrl: true, alt: true }), false)).toEqual({ kind: "submit", accelerator: "Ctrl+Alt+KeyK" });
    expect(recorderStep(press("Escape"), false)).toEqual({ kind: "cancel" });
  });

  it("giữ phím (lặp phím) thì bỏ qua, kể cả Esc", () => {
    expect(recorderStep(press("KeyK", { ctrl: true, alt: true }, true), false)).toEqual({ kind: "ignore" });
    expect(recorderStep(press("Escape", {}, true), false)).toEqual({ kind: "ignore" });
  });

  it("đang chờ phía Rust kiểm phím trước thì bỏ qua phím mới, nhưng Esc vẫn hủy", () => {
    expect(recorderStep(press("KeyJ", { ctrl: true, alt: true }), true)).toEqual({ kind: "ignore" });
    expect(recorderStep(press("Escape"), true)).toEqual({ kind: "cancel" });
  });

  it("mới bấm phím bổ trợ thì chờ tiếp", () => {
    expect(recorderStep(press("ControlLeft", { ctrl: true }), false)).toEqual({ kind: "ignore" });
  });
});
