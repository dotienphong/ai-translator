import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { raiseAlert, sendAlerts } from "../src/alerts";
import type { EmailMessage, EmailProvider } from "../src/email/provider";
import { resetDb } from "./db";

beforeEach(resetDb);

const T = 1_790_812_800;

function mailbox(fail = false) {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    async send(m) {
      if (fail) throw new Error("down");
      sent.push(m);
    },
  };
  return { sent, provider };
}

describe("cảnh báo cho người vận hành", () => {
  const ops = { ...env, OPERATOR_EMAIL: "ops@example.com" };

  it("gộp theo loại, gửi một email mỗi loại, tối đa một lần mỗi giờ", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const box = mailbox();
    await raiseAlert(env.DB, "webhook_bad_signature", T + 10);
    await raiseAlert(env.DB, "webhook_bad_signature", T + 20);
    await raiseAlert(env.DB, "license_locked", T + 30);
    expect(await sendAlerts(ops, box.provider, T + 300)).toBe(2);
    expect(box.sent.map((m) => [m.to, m.subject])).toEqual([
      ["ops@example.com", "[license dev] Cảnh báo: license_locked (1)"],
      ["ops@example.com", "[license dev] Cảnh báo: webhook_bad_signature (2)"],
    ]);
    // Sự kiện mới trong cùng giờ: chưa gửi lại.
    await raiseAlert(env.DB, "webhook_bad_signature", T + 400);
    expect(await sendAlerts(ops, box.provider, T + 600)).toBe(0);
    // Qua 1 giờ kể từ lần báo trước: gửi phần còn lại.
    expect(await sendAlerts(ops, box.provider, T + 300 + 3601)).toBe(1);
    expect(box.sent.at(-1)!.subject).toBe("[license dev] Cảnh báo: webhook_bad_signature (1)");
    vi.restoreAllMocks();
  });

  it("thiếu OPERATOR_EMAIL thì chỉ ghi log, không gửi", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const box = mailbox();
    await raiseAlert(env.DB, "email_failed", T);
    expect(await sendAlerts(env, box.provider, T + 300)).toBe(0);
    expect(box.sent).toHaveLength(0);
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toEqual({ event: "alert", kind: "email_failed", count: 1, since: T });
    expect(await sendAlerts(env, box.provider, T + 600)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("sự kiện tới trong lúc đang gửi: không bị tính là đã báo, lần sau báo đúng phần còn lại", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sent: EmailMessage[] = [];
    const busy: EmailProvider = {
      async send(m) {
        sent.push(m);
        await raiseAlert(env.DB, "many_failures", T + 301);
      },
    };
    await raiseAlert(env.DB, "many_failures", T);
    expect(await sendAlerts(ops, busy, T + 300)).toBe(1);
    expect(sent[0]!.subject).toBe("[license dev] Cảnh báo: many_failures (1)");
    const box = mailbox();
    expect(await sendAlerts(ops, box.provider, T + 300 + 3601)).toBe(1);
    expect(box.sent[0]!.subject).toBe("[license dev] Cảnh báo: many_failures (1)");
    vi.restoreAllMocks();
  });

  it("hai lần cron chạy chồng nhau: chỉ một lần gửi, giữ chỗ trước khi gửi", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sent: EmailMessage[] = [];
    const slow: EmailProvider = {
      async send(m) {
        await new Promise((r) => setTimeout(r, 20));
        sent.push(m);
      },
    };
    await raiseAlert(env.DB, "license_locked", T);
    await raiseAlert(env.DB, "email_failed", T);
    const counts = await Promise.all([sendAlerts(ops, slow, T + 300), sendAlerts(ops, slow, T + 300), sendAlerts(ops, slow, T + 301)]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
    expect(sent.map((m) => m.subject).sort()).toEqual([
      "[license dev] Cảnh báo: email_failed (1)",
      "[license dev] Cảnh báo: license_locked (1)",
    ]);
    vi.restoreAllMocks();
  });

  it("cảnh báo chưa báo mà đã quá 24 giờ: không gửi nữa nhưng ghi log một lần", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const box = mailbox();
    await raiseAlert(env.DB, "webhook_bad_signature", T + 10);
    await raiseAlert(env.DB, "webhook_bad_signature", T + 20);
    expect(await sendAlerts(ops, box.provider, T + 3600 + 86400)).toBe(0);
    expect(box.sent).toHaveLength(0);
    const logged = warn.mock.calls.map((c) => JSON.parse(c[0] as string) as Record<string, unknown>);
    expect(logged).toEqual([{ event: "alert_expired_unreported", kind: "webhook_bad_signature", count: 2, since: T }]);
    expect(await sendAlerts(ops, box.provider, T + 3600 + 86400 + 300)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("gửi lỗi thì lần sau thử lại", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await raiseAlert(env.DB, "many_failures", T);
    expect(await sendAlerts(ops, mailbox(true).provider, T + 300)).toBe(0);
    const box = mailbox();
    expect(await sendAlerts(ops, box.provider, T + 600)).toBe(1);
    expect(box.sent[0]!.text).toContain("dò key");
    vi.restoreAllMocks();
  });
});
