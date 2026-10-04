import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { loadSigningKey, signKeyCheck } from "../src/deps";
import { verifyToken } from "../src/token";
import { testSigningJwk } from "./keys";
import vectors from "./vectors/token-v1.json";
import { makeWorld, T0 } from "./world";

async function keyEnv(slot: string, environment = "test") {
  return {
    TOKEN_SIGNING_SLOT: slot,
    TOKEN_SIGNING_KEY_A: await testSigningJwk("test-1"),
    TOKEN_SIGNING_KEY_B: await testSigningJwk("test-2"),
    ENVIRONMENT: environment,
  };
}

describe("khung Worker API", () => {
  it("ở production chỉ nhận HTTPS (§10.2)", async () => {
    const w = makeWorld({ ENVIRONMENT: "production" });
    expect((await w.app.fetch(new Request("http://license.test/v1/health"), w.env)).status).toBe(403);
    expect((await w.app.fetch(new Request("https://license.test/v1/health"), w.env)).status).toBe(200);
  });

  it("route lạ trả 404 dạng JSON", async () => {
    expect(await makeWorld().call("GET", "/v1/nope")).toMatchObject({ status: 404, body: { error: "not_found" } });
  });

  it("body quá 16 KiB thì 413", async () => {
    const res = await makeWorld().call("POST", "/v1/nope", { pad: "x".repeat(20_000) });
    expect(res.status).toBe(413);
  });

  it("khóa test-* không dùng được ở production", async () => {
    await expect(loadSigningKey(await keyEnv("a", "production"))).rejects.toThrow(/test-/);
    expect((await loadSigningKey(await keyEnv("a"))).kid).toBe("test-1");
  });

  it("TOKEN_SIGNING_SLOT chọn ô đang ký; ô kia là khóa dự phòng (QĐ29)", async () => {
    expect(await loadSigningKey(await keyEnv("a"))).toMatchObject({ slot: "a", kid: "test-1" });
    expect(await loadSigningKey(await keyEnv("a"), "next")).toMatchObject({ slot: "b", kid: "test-2" });
    expect(await loadSigningKey(await keyEnv("b"))).toMatchObject({ slot: "b", kid: "test-2" });
    expect(await loadSigningKey(await keyEnv("b"), "next")).toMatchObject({ slot: "a", kid: "test-1" });
    await expect(loadSigningKey(await keyEnv("c"))).rejects.toThrow(/TOKEN_SIGNING_SLOT/);
    await expect(loadSigningKey(await keyEnv(""))).rejects.toThrow(/TOKEN_SIGNING_SLOT/);
  });

  it("ký thử bằng khóa dự phòng: token kiểm được bằng khóa công khai, nhưng không dùng được làm bản quyền", async () => {
    const check = await signKeyCheck(await keyEnv("a"), T0);
    expect(check).toMatchObject({ slot: "b", kid: "test-2" });
    const noDevice = "0".repeat(64);
    const before = await verifyToken(check.token, vectors.public_keys, { now: T0 - 1, deviceIdHash: noDevice });
    expect(before).toMatchObject({ ok: true, claims: { kid: "test-2", expires_at: T0, refresh_before: T0 } });
    // Đúng lúc ký là đã hết hạn, và không khớp máy thật nào.
    expect(await verifyToken(check.token, vectors.public_keys, { now: T0, deviceIdHash: noDevice })).toEqual({
      ok: false,
      error: "license_expired",
    });
    const realDevice = vectors.tokens[0]!.device_id_hash;
    expect(await verifyToken(check.token, vectors.public_keys, { now: T0 - 1, deviceIdHash: realDevice })).toEqual({
      ok: false,
      error: "wrong_device",
    });
    expect(await signKeyCheck(await keyEnv("b"), T0)).toMatchObject({ slot: "a", kid: "test-1" });
  });

  it("ký thử báo lỗi khi hai ô cùng một khóa hoặc ô dự phòng sai", async () => {
    const same = { ...(await keyEnv("a")), TOKEN_SIGNING_KEY_B: await testSigningJwk("test-1") };
    await expect(signKeyCheck(same, T0)).rejects.toThrow(/cùng kid test-1/);
    await expect(signKeyCheck({ ...(await keyEnv("a")), TOKEN_SIGNING_KEY_B: "{}" }, T0)).rejects.toThrow(/Ed25519/);
  });

  it("test chạy với secret giả, không bao giờ với secret thật của máy", () => {
    expect(env.PAYOS_API_KEY).toBe("test-api-key");
    expect(env.PAYOS_CHECKSUM_KEY).toBe("test-checksum-key");
    expect(env.RESEND_API_KEY).toBe("re_test");
    expect(env.ENVIRONMENT).toBe("test");
  });
});
