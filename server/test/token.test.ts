import { describe, expect, it } from "vitest";
import { b64urlEncode } from "../src/crypto";
import { normalizeLicenseKey } from "../src/license-key";
import { importSigningKey, signToken, type TokenClaims, verifyToken } from "../src/token";
import { testSigningJwk } from "./keys";
import vectors from "./vectors/token-v1.json";

describe("token Ed25519 theo vector dùng chung (Đ9)", () => {
  for (const v of vectors.tokens) {
    it(`kiểm vector ${v.name} ra ${v.expected}`, async () => {
      const result = await verifyToken(v.token, vectors.public_keys, { now: v.now, deviceIdHash: v.device_id_hash });
      if (v.expected === "ok") {
        expect(result).toEqual({ ok: true, claims: v.claims });
      } else {
        expect(result).toEqual({ ok: false, error: v.expected });
      }
    });
  }

  it("signToken sinh lại đúng từng token hợp lệ của vector", async () => {
    for (const v of vectors.tokens.filter((t) => t.expected === "ok")) {
      const claims = v.claims as TokenClaims;
      const key = await importSigningKey(await testSigningJwk(claims.kid));
      expect(key.kid).toBe(claims.kid);
      expect(await signToken(key, claims)).toBe(v.token);
    }
  });

  it("importSigningKey từ chối JWK thiếu kid hoặc sai loại khóa", async () => {
    const jwk = JSON.parse(await testSigningJwk("test-1")) as Record<string, string>;
    await expect(importSigningKey(JSON.stringify({ ...jwk, kid: undefined }))).rejects.toThrow(/kid/);
    await expect(importSigningKey(JSON.stringify({ ...jwk, kid: "Có dấu" }))).rejects.toThrow(/kid/);
    await expect(importSigningKey(JSON.stringify({ ...jwk, crv: "X25519" }))).rejects.toThrow(/Ed25519/);
    await expect(importSigningKey("không phải json")).rejects.toThrow(/JSON/);
  });

  it("chữ ký sai độ dài là malformed", async () => {
    const valid = vectors.tokens[0]!.token;
    const [v, payload] = valid.split(".");
    const short = `${v}.${payload}.${b64urlEncode(new Uint8Array(10))}`;
    expect(await verifyToken(short, vectors.public_keys, { now: 0, deviceIdHash: "" })).toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("kid trùng tên thuộc tính có sẵn của Object vẫn là kid lạ", async () => {
    const v = vectors.tokens[0]!;
    const key = await importSigningKey(await testSigningJwk("test-1"));
    const token = await signToken(key, { ...(v.claims as TokenClaims), kid: "constructor" });
    expect(await verifyToken(token, vectors.public_keys, { now: v.now, deviceIdHash: v.device_id_hash })).toEqual({
      ok: false,
      error: "unknown_kid",
    });
  });
});

describe("license key theo vector dùng chung", () => {
  for (const v of vectors.license_keys) {
    it(`chuẩn hóa ${JSON.stringify(v.input)}`, async () => {
      expect(await normalizeLicenseKey(v.input)).toBe(v.normalized);
    });
  }
});
