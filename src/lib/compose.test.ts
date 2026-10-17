import { describe, expect, it } from "vitest";
import { type ComposeKey, autoTarget, errorScreen, keyAction, pasteKeys, shownTranslation } from "./compose";
import { LANGS, type Lang } from "./ipc";

// Cùng các trường hợp với test của `compose::target` phía Rust (spec 2026-10-17-go-dich §2.1).
describe("autoTarget", () => {
  const auto = (targetLanguage: Lang, sourceLanguages: Lang[], sourceLock: Lang | null = null) =>
    autoTarget({ targetLanguage, sourceLanguages, sourceLock });
  const ALL = [...LANGS];

  it("người bên kia nói English trừ khi phụ đề cho biết khác", () => {
    expect(auto("vi", ALL)).toBe("en");
    expect(auto("vi", ALL, "ja")).toBe("ja");
    expect(auto("vi", ["vi", "ko"])).toBe("ko");
    expect(auto("vi", ["zh"])).toBe("zh");
    expect(auto("vi", ["en", "ja"])).toBe("en");
    expect(auto("vi", ALL, "vi")).toBe("en");
  });

  it("phụ đề dịch sang English thì người bên kia nói tiếng Việt", () => {
    expect(auto("en", ALL)).toBe("vi");
    expect(auto("en", ["en", "ja", "vi"])).toBe("vi");
    expect(auto("en", ALL, "zh")).toBe("zh");
    expect(auto("ja", ALL)).toBe("en");
  });
});

const press = (key: string, extra: Partial<ComposeKey> = {}): ComposeKey => ({
  key,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  isComposing: false,
  keyCode: 0,
  ...extra,
});

describe("keyAction (spec 2026-10-17-go-dich §1.3)", () => {
  it("Enter dán, Esc đóng", () => {
    expect(keyAction(press("Enter"))).toBe("enter");
    expect(keyAction(press("Escape"))).toBe("escape");
    expect(keyAction(press("a"))).toBeNull();
  });

  it("Shift+Enter và Enter kèm phím bổ trợ để ô gõ tự xử lý", () => {
    for (const mod of ["shiftKey", "altKey", "ctrlKey", "metaKey"] as const) {
      expect(keyAction(press("Enter", { [mod]: true })), mod).toBeNull();
    }
  });

  it("bộ gõ đang chọn chữ thì Enter và Esc thuộc về bộ gõ", () => {
    expect(keyAction(press("Enter", { isComposing: true }))).toBeNull();
    expect(keyAction(press("Enter", { keyCode: 229 }))).toBeNull();
    expect(keyAction(press("Escape", { isComposing: true }))).toBeNull();
  });
});

describe("shownTranslation (spec §1.2)", () => {
  const base = { text: "xin chào\n\nhẹn gặp", request: null, lines: [], outcome: null, previous: "" };

  it("kết quả của đúng chữ đang có thì hiện rõ", () => {
    const request = { id: 1, text: base.text };
    expect(shownTranslation({ ...base, request, outcome: { kind: "translated", text: "Hi\n\nSee you" } })).toEqual({
      text: "Hi\n\nSee you",
      stale: false,
    });
    expect(shownTranslation({ ...base, request, outcome: { kind: "sameLanguage" } })).toEqual({
      text: base.text,
      stale: false,
    });
  });

  it("đang dịch thì hiện phần đã về theo dòng, giữ dòng trống, mờ", () => {
    const request = { id: 2, text: base.text };
    expect(shownTranslation({ ...base, request, lines: ["Hi"] })).toEqual({ text: "Hi\n\n", stale: true });
  });

  it("chưa về gì, hay chữ đã đổi sau khi xong, thì hiện bản dịch đủ gần nhất, mờ", () => {
    const old = { id: 1, text: "xin" };
    expect(shownTranslation({ ...base, request: old, previous: "Hello" })).toEqual({ text: "Hello", stale: true });
    expect(
      shownTranslation({ ...base, request: old, outcome: { kind: "translated", text: "Hi" }, previous: "Hi" }),
    ).toEqual({ text: "Hi", stale: true });
  });
});

describe("errorScreen (spec §5)", () => {
  it("mỗi nhóm lỗi mở đúng màn hình", () => {
    expect(errorScreen("modelMissing")).toBe("models");
    expect(errorScreen("modelsBusy")).toBe("models");
    expect(errorScreen("trialEnded")).toBe("upgrade");
    expect(errorScreen("licenseConflict")).toBe("license");
    expect(errorScreen("sidecarFailed")).toBe("home");
    expect(errorScreen("composeUnavailable")).toBe("home");
  });

  it("lỗi tự sửa được thì không có nút", () => {
    for (const code of ["composeTooLong", "composeFailed", "trialNeedsNetwork", "clockRolledBack", "unknown"]) {
      expect(errorScreen(code), code).toBeNull();
    }
  });
});

describe("pasteKeys", () => {
  it("ghi đúng tổ hợp dán của từng hệ điều hành", () => {
    expect(pasteKeys("macos")).toBe("⌘V");
    expect(pasteKeys("windows")).toBe("Ctrl+V");
  });
});
