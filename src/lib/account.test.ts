import { describe, expect, it } from "vitest";
import { ACCOUNT_ERROR_CODES, accountErrorKey, isAccountView } from "./account";

describe("accountErrorKey", () => {
  it("mọi mã lỗi tài khoản của Rust ra khóa error.<mã>", () => {
    for (const code of [
      "accountNetwork",
      "accountDenied",
      "accountFailed",
      "accountExpired",
      "accountCancelled",
      "accountBusy",
      "accountUnavailable",
      "accountStorage",
      "loginRequired",
    ]) {
      expect(accountErrorKey(code), code).toBe(`error.${code}`);
    }
  });

  it("danh sách mã khớp đúng chín mã của phía Rust", () => {
    expect([...ACCOUNT_ERROR_CODES].sort()).toEqual(
      [
        "accountBusy",
        "accountCancelled",
        "accountDenied",
        "accountExpired",
        "accountFailed",
        "accountNetwork",
        "accountStorage",
        "accountUnavailable",
        "loginRequired",
      ].sort(),
    );
  });

  it("mã lạ, mã của tính năng khác, chuỗi rỗng ra error.unknown", () => {
    for (const code of ["", "khongCo", "outOfRange", "unknown", "ACCOUNTDENIED", "toString", "__proto__", "constructor"]) {
      expect(accountErrorKey(code), code).toBe("error.unknown");
    }
  });
});

describe("isAccountView", () => {
  it("nhận ba trạng thái hợp lệ", () => {
    expect(isAccountView({ state: "anonymous", email: null, gate: false })).toBe(true);
    expect(isAccountView({ state: "signingIn", email: null, gate: true })).toBe(true);
    expect(isAccountView({ state: "signedIn", email: "a@b.c", gate: false })).toBe(true);
  });

  it("bỏ mọi thứ sai hình dạng", () => {
    for (const bad of [
      null,
      undefined,
      0,
      "signedIn",
      [],
      {},
      { state: "signedIn", email: "a@b.c" },
      { state: "other", email: null, gate: false },
      { state: "signedIn", email: 5, gate: false },
      { state: "signedIn", email: undefined, gate: false },
      { state: "signedIn", email: null, gate: "no" },
    ]) {
      expect(isAccountView(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
