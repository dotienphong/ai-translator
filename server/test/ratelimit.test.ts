import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex, sha256Hex } from "../src/crypto";
import { failureBlock, hit, LIMITS, noteFailure, pruneRateLimits } from "../src/ratelimit";
import { resetDb } from "./db";

beforeEach(resetDb);

const T = 1_790_812_800; // đầu một giờ

describe("giới hạn tần suất", () => {
  it("activate: 10 lần mỗi giờ mỗi IP, lần thứ 11 bị chặn, giờ sau mở lại", async () => {
    for (let i = 1; i <= LIMITS.activate_ip; i++) {
      expect((await hit(env, "activate_ip", "203.0.113.7", T + i)).allowed).toBe(true);
    }
    const blocked = await hit(env, "activate_ip", "203.0.113.7", T + 100);
    expect(blocked).toEqual({ allowed: false, count: 11, retryAfter: 3500 });
    expect((await hit(env, "activate_ip", "198.51.100.1", T + 100)).allowed).toBe(true);
    expect((await hit(env, "activate_ip", "203.0.113.7", T + 3600)).allowed).toBe(true);
  });

  it("chủ thể lưu dạng HMAC với RATE_LIMIT_PEPPER, không phải IP gốc hay SHA-256 không muối", async () => {
    await hit(env, "checkout_ip", "203.0.113.7", T);
    const { results } = await env.DB.prepare("SELECT bucket FROM rate_limits").all<{ bucket: string }>();
    expect(results.map((r) => r.bucket)).toEqual([`checkout_ip:${await hmacSha256Hex("test-pepper", "203.0.113.7")}`]);
    expect(results[0]!.bucket).not.toContain(await sha256Hex("203.0.113.7"));
    await hit({ ...env, RATE_LIMIT_PEPPER: "pepper-khac" }, "checkout_ip", "203.0.113.7", T);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits").first<{ n: number }>();
    expect(n?.n).toBe(2);
  });

  it("60 lần thất bại: chặn IP tới hết giờ, ghi log và tạo đúng một cảnh báo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 59; i++) await noteFailure(env, "203.0.113.9", T, "activate");
    expect(await failureBlock(env, "203.0.113.9", T + 10)).toBe(0);
    for (let i = 0; i < 6; i++) await noteFailure(env, "203.0.113.9", T, "activate");
    expect(await failureBlock(env, "203.0.113.9", T + 10)).toBe(3590);
    expect(await failureBlock(env, "198.51.100.1", T + 10)).toBe(0);
    expect(await failureBlock(env, "203.0.113.9", T + 3600)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toEqual({
      event: "many_failures",
      what: "activate",
      count: 60,
      window_seconds: 3600,
    });
    const alerts = await env.DB.prepare("SELECT kind, count FROM ops_alerts").all();
    expect(alerts.results).toEqual([{ kind: "many_failures", count: 1 }]);
    warn.mockRestore();
  });

  it("dọn bộ đếm cũ hơn 2 giờ và cảnh báo cũ hơn 7 ngày", async () => {
    await hit(env, "validate_key", "k", T);
    await env.DB.prepare("INSERT INTO ops_alerts (kind, window_start, count) VALUES ('email_failed', ?, 1)").bind(T).run();
    await pruneRateLimits(env.DB, T + 3 * 3600);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits").first<{ n: number }>())?.n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM ops_alerts").first<{ n: number }>())?.n).toBe(1);
    await pruneRateLimits(env.DB, T + 8 * 86400);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM ops_alerts").first<{ n: number }>())?.n).toBe(0);
  });
});
