import { describe, expect, it } from "vitest";
import {
  formatLicenseKey,
  generateLicenseKey,
  KEY_ALPHABET,
  luhnCheckChar,
  maskLicenseKey,
  normalizeLicenseKey,
} from "../src/license-key";

describe("license key", () => {
  it("sinh 28 ký tự trong bảng Crockford, ký tự kiểm tra đúng", () => {
    for (let i = 0; i < 50; i++) {
      const key = generateLicenseKey();
      expect(key).toMatch(new RegExp(`^[${KEY_ALPHABET}]{28}$`));
      expect(normalizeLicenseKey(key)).toBe(key);
    }
  });

  it("hai key sinh ra không trùng nhau", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) keys.add(generateLicenseKey());
    expect(keys.size).toBe(200);
  });

  it("nhận key có gạch nối, chữ thường, O/I/L gõ nhầm", () => {
    const key = generateLicenseKey();
    const typed = formatLicenseKey(key).toLowerCase().replace(/0/g, "o").replace(/1/g, "l");
    expect(normalizeLicenseKey(` ${typed} `)).toBe(key);
  });

  const FIXED = "0123456789ABCDEFGHJKMNPQRST5";

  it("key cố định: bắt được cả 28 × 31 lỗi thay một ký tự (kể cả ký tự kiểm tra)", () => {
    expect(normalizeLicenseKey(FIXED)).toBe(FIXED);
    let tried = 0;
    let caught = 0;
    for (let i = 0; i < 28; i++) {
      for (let d = 1; d < 32; d++) {
        const wrong = KEY_ALPHABET.charAt((KEY_ALPHABET.indexOf(FIXED.charAt(i)) + d) % 32);
        tried++;
        if (normalizeLicenseKey(FIXED.slice(0, i) + wrong + FIXED.slice(i + 1)) === null) caught++;
      }
    }
    expect([caught, tried]).toEqual([868, 868]);
  });

  it("key cố định: bắt được cả 27 lỗi đảo hai ký tự kề nhau", () => {
    let caught = 0;
    for (let i = 0; i < 27; i++) {
      const swapped = FIXED.slice(0, i) + FIXED.charAt(i + 1) + FIXED.charAt(i) + FIXED.slice(i + 2);
      if (normalizeLicenseKey(swapped) === null) caught++;
    }
    expect(caught).toBe(27);
  });

  it("giới hạn đã biết của Luhn mod 32: đảo cặp 0↔Z kề nhau không bị bắt", () => {
    const body = `${"1".repeat(25)}0Z`;
    const key = body + luhnCheckChar(body);
    expect(normalizeLicenseKey(`${"1".repeat(25)}Z0${key.charAt(27)}`)).toBe(`${"1".repeat(25)}Z0${key.charAt(27)}`);
  });

  it("từ chối sai độ dài, ký tự lạ, chuỗi quá dài", () => {
    expect(normalizeLicenseKey("ABC")).toBeNull();
    expect(normalizeLicenseKey("U".repeat(28))).toBeNull();
    expect(normalizeLicenseKey("' OR 1=1 --")).toBeNull();
    expect(normalizeLicenseKey("A".repeat(65))).toBeNull();
  });

  it("định dạng 7 nhóm 4 ký tự", () => {
    expect(formatLicenseKey("ABCDEFGHJKMNPQRSTVWXYZ012345")).toBe("ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345");
  });
});

describe("maskLicenseKey (Web Admin §3.2)", () => {
  it("giữ 4 ký tự đầu và 4 ký tự cuối, che phần giữa", () => {
    const key = generateLicenseKey();
    expect(maskLicenseKey(key)).toBe(`${key.slice(0, 4)}-…-${key.slice(-4)}`);
  });

  it("nhận cả dạng có gạch nối", () => {
    const key = generateLicenseKey();
    expect(maskLicenseKey(formatLicenseKey(key))).toBe(maskLicenseKey(key));
  });
});
