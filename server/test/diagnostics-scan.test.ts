import { describe, expect, it } from "vitest";
import { findSensitive, type SensitiveRule } from "../src/diagnostics-scan";
import vectors from "./vectors/scrub-v1.json";

describe("bộ phát hiện dữ liệu nhạy cảm (vector dùng chung với app)", () => {
  it.each(vectors.detect)("phát hiện: $name", ({ text, rule }) => {
    expect(findSensitive(text)).toBe(rule as SensitiveRule);
  });

  it.each(vectors.clean)("không báo nhầm: $name", ({ text }) => {
    expect(findSensitive(text)).toBeNull();
  });

  it.each(vectors.scrub)("kết quả che không còn gì nhạy cảm: $name", ({ expected }) => {
    expect(findSensitive(expected)).toBeNull();
  });

  it("nhiều quy tắc cùng khớp thì báo quy tắc đầu theo rule_order", () => {
    expect(vectors.rule_order).toEqual(["license_key", "token", "bearer", "authorization", "email", "home_path"]);
    const key = "7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF";
    expect(findSensitive(`${key} a@b.co /Users/bob/x`)).toBe("license_key");
    expect(findSensitive("a@b.co /Users/bob/x")).toBe("email");
  });

  it("đường dẫn dùng chung đứng cạnh đường dẫn của người khác vẫn bị báo", () => {
    expect(findSensitive("/Users/Shared/x và /Users/bob/y")).toBe("home_path");
    expect(findSensitive("/Users/Shared/x và /Users/Public/y")).toBeNull();
  });

  it("chuỗi dài không bị chậm theo cấp bình phương (lượng từ có cận)", () => {
    const started = performance.now();
    for (const text of ["a".repeat(60_000), "a.".repeat(30_000), "ABCD-".repeat(12_000), "v1.".repeat(20_000), "/Users/".repeat(8_000)]) {
      findSensitive(text);
    }
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
