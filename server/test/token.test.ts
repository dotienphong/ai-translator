import { describe, expect, it } from "vitest";
import { b64urlEncode } from "../src/crypto";
import { normalizeLicenseKey } from "../src/license-key";
import {
  type AccountClaims,
  importSigningKey,
  signAccountToken,
  signToken,
  signTrialToken,
  type TokenClaims,
  type TrialClaims,
  verifyAccountToken,
  verifyToken,
  verifyTrialToken,
} from "../src/token";
import { testSigningJwk } from "./keys";
import accountVectors from "./vectors/token-account-v1.json";
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
    // Khớp đúng cả câu: lỗi của Web Crypto khi import cũng có chữ "Ed25519", nên /Ed25519/ không phân biệt được
    // importSigningKey tự từ chối hay để importKey ném lỗi.
    const notEd25519 = /^khóa ký không phải khóa riêng Ed25519$/;
    await expect(importSigningKey(JSON.stringify({ ...jwk, crv: "X25519" }))).rejects.toThrow(notEd25519);
    await expect(importSigningKey(JSON.stringify({ ...jwk, kty: "EC" }))).rejects.toThrow(notEd25519);
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

describe("token dùng thử theo vector dùng chung (spec 2026-10-07 §3.1)", () => {
  for (const v of vectors.trial.tokens) {
    it(`kiểm vector dùng thử ${v.name} ra ${v.expected}`, async () => {
      const result = await verifyTrialToken(v.token, vectors.public_keys, { deviceIdHash: v.device_id_hash });
      if (v.expected === "ok") {
        expect(result).toEqual({ ok: true, claims: v.claims });
      } else {
        expect(result).toEqual({ ok: false, error: v.expected });
      }
    });
  }

  it("signTrialToken sinh lại đúng từng token dùng thử hợp lệ của vector", async () => {
    for (const v of vectors.trial.tokens.filter((t) => t.expected === "ok")) {
      const claims = v.claims as TrialClaims;
      const key = await importSigningKey(await testSigningJwk(claims.kid));
      expect(await signTrialToken(key, claims)).toBe(v.token);
    }
  });

  it("token dùng thử không qua được bộ kiểm token bản quyền", async () => {
    const v = vectors.trial.tokens[0]!;
    expect(await verifyToken(v.token, vectors.public_keys, { now: 0, deviceIdHash: v.device_id_hash })).toEqual({
      ok: false,
      error: "malformed",
    });
  });
});

describe("token tài khoản (spec 2026-11-05 §5.2)", () => {
  const accountClaims: AccountClaims = {
    typ: "account",
    kid: "test-1",
    account_id: "7a1c9e52-4b3d-4f08-9c6e-1d2f3a4b5c6d",
    device_id_hash: vectors.tokens[0]!.device_id_hash,
    issued_at: 1_790_000_000,
  };
  const otherDevice = vectors.tokens.find((t) => t.name === "wrong_device")!.device_id_hash;
  const sign = async (claims: object) => {
    // Ký payload tùy ý bằng khóa test-1 (dùng cho claims thiếu/sai kiểu mà signAccountToken không sinh ra được).
    const jwk = JSON.parse(await testSigningJwk("test-1")) as JsonWebKey;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
    const input = `v1.${b64urlEncode(new TextEncoder().encode(JSON.stringify(claims)))}`;
    const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(input));
    return `${input}.${b64urlEncode(new Uint8Array(sig))}`;
  };

  it("account token ký rồi kiểm lại được", async () => {
    const key = await importSigningKey(await testSigningJwk("test-1"));
    const token = await signAccountToken(key, accountClaims);
    expect(await verifyAccountToken(token, vectors.public_keys, { deviceIdHash: accountClaims.device_id_hash })).toEqual({
      ok: true,
      claims: accountClaims,
    });
  });

  it("thứ tự trường ký cố định: typ, kid, account_id, device_id_hash, issued_at", async () => {
    const key = await importSigningKey(await testSigningJwk("test-1"));
    // Truyền claims theo thứ tự khác: payload vẫn phải ra đúng thứ tự cố định.
    const shuffled = {
      issued_at: accountClaims.issued_at,
      device_id_hash: accountClaims.device_id_hash,
      account_id: accountClaims.account_id,
      kid: accountClaims.kid,
      typ: "account",
    } as AccountClaims;
    const token = await signAccountToken(key, shuffled);
    expect(token).toBe(await sign(accountClaims));
  });

  it("token dùng thử bị verifyAccountToken từ chối (malformed)", async () => {
    const v = vectors.trial.tokens[0]!;
    expect(await verifyAccountToken(v.token, vectors.public_keys, { deviceIdHash: v.device_id_hash })).toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("token bản quyền bị verifyAccountToken từ chối (malformed)", async () => {
    const v = vectors.tokens[0]!;
    expect(await verifyAccountToken(v.token, vectors.public_keys, { deviceIdHash: v.device_id_hash })).toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("token tài khoản bị verifyTrialToken và verifyToken từ chối", async () => {
    const key = await importSigningKey(await testSigningJwk("test-1"));
    const token = await signAccountToken(key, accountClaims);
    expect(await verifyTrialToken(token, vectors.public_keys, { deviceIdHash: accountClaims.device_id_hash })).toEqual({
      ok: false,
      error: "malformed",
    });
    expect(
      await verifyToken(token, vectors.public_keys, { now: 0, deviceIdHash: accountClaims.device_id_hash }),
    ).toEqual({ ok: false, error: "malformed" });
  });

  it("đổi máy → wrong_device", async () => {
    const key = await importSigningKey(await testSigningJwk("test-1"));
    const token = await signAccountToken(key, accountClaims);
    expect(await verifyAccountToken(token, vectors.public_keys, { deviceIdHash: otherDevice })).toEqual({
      ok: false,
      error: "wrong_device",
    });
  });

  it("thiếu account_id → malformed", async () => {
    const { account_id: _omit, ...missing } = accountClaims;
    expect(
      await verifyAccountToken(await sign(missing), vectors.public_keys, { deviceIdHash: accountClaims.device_id_hash }),
    ).toEqual({ ok: false, error: "malformed" });
  });

  it("sai kiểu hoặc sai typ → malformed", async () => {
    const opts = { deviceIdHash: accountClaims.device_id_hash };
    for (const bad of [
      { ...accountClaims, issued_at: 1.5 },
      { ...accountClaims, issued_at: "1790000000" },
      { ...accountClaims, account_id: 42 },
      { ...accountClaims, typ: "trial" },
    ]) {
      expect(await verifyAccountToken(await sign(bad), vectors.public_keys, opts)).toEqual({
        ok: false,
        error: "malformed",
      });
    }
    const { typ: _omit, ...noTyp } = accountClaims;
    expect(await verifyAccountToken(await sign(noTyp), vectors.public_keys, opts)).toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("kid lạ → unknown_kid", async () => {
    const token = await sign({ ...accountClaims, kid: "test-9" });
    expect(
      await verifyAccountToken(token, vectors.public_keys, { deviceIdHash: accountClaims.device_id_hash }),
    ).toEqual({ ok: false, error: "unknown_kid" });
  });

  it("sửa 1 byte payload → bad_signature", async () => {
    const key = await importSigningKey(await testSigningJwk("test-1"));
    const token = await signAccountToken(key, accountClaims);
    const [v, , sig] = token.split(".");
    const tampered = `${v}.${b64urlEncode(new TextEncoder().encode(JSON.stringify({ ...accountClaims, account_id: "7a1c9e52-4b3d-4f08-9c6e-1d2f3a4b5c6e" })))}.${sig}`;
    expect(
      await verifyAccountToken(tampered, vectors.public_keys, { deviceIdHash: accountClaims.device_id_hash }),
    ).toEqual({ ok: false, error: "bad_signature" });
  });
});

describe("token tài khoản theo vector dùng chung (spec 2026-11-05 §5.2)", () => {
  it("dùng đúng khóa test của token-v1.json", () => {
    expect(accountVectors.public_keys).toEqual(vectors.public_keys);
    expect(accountVectors.test_keys).toEqual(vectors.test_keys);
  });

  for (const v of accountVectors.tokens) {
    it(`kiểm vector tài khoản ${v.name} ra ${v.expected}`, async () => {
      const result = await verifyAccountToken(v.token, accountVectors.public_keys, { deviceIdHash: v.device_id_hash });
      if (v.expected === "ok") {
        expect(result).toEqual({ ok: true, claims: v.claims });
      } else {
        expect(result).toEqual({ ok: false, error: v.expected });
      }
    });
  }

  it("signAccountToken sinh lại đúng từng token tài khoản hợp lệ của vector", async () => {
    for (const v of accountVectors.tokens.filter((t) => t.expected === "ok")) {
      const claims = v.claims as AccountClaims;
      const key = await importSigningKey(await testSigningJwk(claims.kid));
      expect(await signAccountToken(key, claims)).toBe(v.token);
    }
  });

  it("token tài khoản của vector không qua được bộ kiểm bản quyền và dùng thử", async () => {
    const v = accountVectors.tokens[0]!;
    expect(await verifyToken(v.token, accountVectors.public_keys, { now: 0, deviceIdHash: v.device_id_hash })).toEqual({
      ok: false,
      error: "malformed",
    });
    expect(await verifyTrialToken(v.token, accountVectors.public_keys, { deviceIdHash: v.device_id_hash })).toEqual({
      ok: false,
      error: "malformed",
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
