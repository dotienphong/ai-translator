import { describe, expect, it } from "vitest";
import type { AccountView } from "./ipc";
import { accountCanDefer, accountStepReady, advanceEffects, canAdvance, stepsFor } from "./onboardingSteps";

describe("stepsFor", () => {
  it("macOS: bước Điều khoản ngay sau chọn ngôn ngữ, trước tải model", () => {
    expect(stepsFor("macos")).toEqual([
      "language", "terms", "account", "model", "download", "permission", "languages", "test", "privacy", "tray",
    ]);
  });
  it("Windows: bỏ bước quyền ghi âm thanh hệ thống", () => {
    expect(stepsFor("windows")).not.toContain("permission");
    expect(stepsFor("windows")[1]).toBe("terms");
  });
});

describe("canAdvance", () => {
  it("chỉ bước Điều khoản bị khóa khi chưa đồng ý", () => {
    expect(canAdvance("terms", false, true)).toBe(false);
    expect(canAdvance("terms", true, true)).toBe(true);
    expect(canAdvance("language", false, true)).toBe(true);
    expect(canAdvance("tray", false, true)).toBe(true);
  });
});

// Spec 2026-11-05-dang-nhap-google §6.3: bước `account` (đăng nhập Google) ngay sau Điều khoản; dùng thử đăng ký sau bước này.
describe("bước đăng nhập (account)", () => {
  const view = (patch: Partial<AccountView> = {}): AccountView => ({ state: "anonymous", email: null, gate: true, ...patch });

  it("đứng ngay sau terms ở cả hai nền tảng", () => {
    for (const platform of ["macos", "windows"] as const) {
      const steps = stepsFor(platform);
      expect(steps.indexOf("account"), platform).toBe(steps.indexOf("terms") + 1);
      expect(steps.filter((s) => s === "account"), platform).toHaveLength(1);
    }
    expect(stepsFor("windows")).toEqual(["language", "terms", "account", "model", "download", "languages", "test", "privacy", "tray"]);
  });

  it("canAdvance: bước account đòi accountReady, các bước khác không", () => {
    expect(canAdvance("account", true, false)).toBe(false);
    expect(canAdvance("account", true, true)).toBe(true);
    expect(canAdvance("model", true, false)).toBe(true);
    expect(canAdvance("terms", true, false)).toBe(true);
  });

  it("accountStepReady: cổng đóng mà chưa đăng nhập thì chưa đi tiếp được", () => {
    expect(accountStepReady(view(), false)).toBe(false);
    expect(accountStepReady(view({ state: "signingIn" }), false)).toBe(false);
  });

  it("accountStepReady: đã đăng nhập thì đi tiếp", () => {
    expect(accountStepReady(view({ state: "signedIn", email: "an@example.com", gate: false }), false)).toBe(true);
    expect(accountStepReady(view({ state: "signedIn", email: "an@example.com", gate: true }), false)).toBe(true);
  });

  it("accountStepReady: server tắt đăng nhập hay máy có gói trả phí (gate false, chưa đăng nhập) thì đi tiếp", () => {
    expect(accountStepReady(view({ gate: false }), false)).toBe(true);
  });

  it("accountStepReady: chưa biết trạng thái thì chờ; không đọc được trạng thái thì không giam người dùng ở onboarding", () => {
    expect(accountStepReady(null, false)).toBe(false);
    expect(accountStepReady(null, true)).toBe(true);
  });

  it("advanceEffects: qua Điều khoản chỉ lưu lựa chọn báo cáo lỗi, không còn đăng ký dùng thử", () => {
    expect(advanceEffects("terms")).toEqual({ saveReportsConsent: true, startTrial: false });
  });

  it("advanceEffects: qua bước account (đã đăng nhập, hay bỏ qua vì cổng mở) thì đăng ký dùng thử", () => {
    expect(advanceEffects("account")).toEqual({ saveReportsConsent: false, startTrial: true });
  });

  it("advanceEffects: các bước khác không làm gì thêm", () => {
    for (const step of ["language", "model", "download", "permission", "languages", "test", "privacy", "tray"] as const) {
      expect(advanceEffects(step), step).toEqual({ saveReportsConsent: false, startTrial: false });
    }
  });
});

// Fix round 1 (rà soát Task 13): người không đăng nhập được (đã mua key trên máy mới, tài khoản Workspace bị chặn, không vào được
// Google, mất mạng) không bị giam ở bước Đăng nhập: nút "Để sau" đặt cờ cục bộ cho đi tiếp. Cờ chỉ có tác dụng ở onboarding; cổng
// sau onboarding vẫn do `gateBlocks` (không biết cờ này) và phía Rust quyết định.
describe("bước account: Để sau", () => {
  const view = (patch: Partial<AccountView> = {}): AccountView => ({ state: "anonymous", email: null, gate: true, ...patch });

  it("accountCanDefer: chỉ khi cổng đóng và chưa đăng nhập (không đang chờ trình duyệt)", () => {
    expect(accountCanDefer(view())).toBe(true);
    expect(accountCanDefer(view({ gate: false }))).toBe(false);
    expect(accountCanDefer(view({ state: "signedIn", email: "an@example.com", gate: false }))).toBe(false);
    expect(accountCanDefer(view({ state: "signingIn" }))).toBe(false);
    expect(accountCanDefer(null)).toBe(false);
  });

  it("đã bấm Để sau: bước account cho đi tiếp dù cổng đóng", () => {
    expect(accountStepReady(view(), false, true)).toBe(true);
    expect(canAdvance("account", true, accountStepReady(view(), false, true))).toBe(true);
    expect(accountStepReady(view(), false, false)).toBe(false);
    expect(accountStepReady(view(), false)).toBe(false);
  });

  it("đi tiếp bằng Để sau vẫn gọi start_trial khi rời bước (phía Rust từ chối khi cổng đóng, vô hại)", () => {
    expect(advanceEffects("account").startTrial).toBe(true);
  });
});
