import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authFailedAlert, raiseAlert, sendAlerts } from "../src/alerts";
import type { EmailMessage, EmailProvider } from "../src/email/provider";
import { resetDb } from "./db";

beforeEach(resetDb);
// Gỡ mọi spy kể cả khi test đỏ giữa chừng, để console của test sau không bị nuốt.
afterEach(() => {
  vi.restoreAllMocks();
});

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
      ["ops@example.com", "[license test] Cảnh báo: license_locked (1)"],
      ["ops@example.com", "[license test] Cảnh báo: webhook_bad_signature (2)"],
    ]);
    // Sự kiện mới trong cùng giờ: chưa gửi lại.
    await raiseAlert(env.DB, "webhook_bad_signature", T + 400);
    expect(await sendAlerts(ops, box.provider, T + 600)).toBe(0);
    // Qua 1 giờ kể từ lần báo trước: gửi phần còn lại.
    expect(await sendAlerts(ops, box.provider, T + 300 + 3601)).toBe(1);
    expect(box.sent.at(-1)!.subject).toBe("[license test] Cảnh báo: webhook_bad_signature (1)");
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
    expect(sent[0]!.subject).toBe("[license test] Cảnh báo: many_failures (1)");
    const box = mailbox();
    expect(await sendAlerts(ops, box.provider, T + 300 + 3601)).toBe(1);
    expect(box.sent[0]!.subject).toBe("[license test] Cảnh báo: many_failures (1)");
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
      "[license test] Cảnh báo: email_failed (1)",
      "[license test] Cảnh báo: license_locked (1)",
    ]);
  });

  it("cảnh báo chưa báo mà đã quá 24 giờ: không gửi nữa nhưng ghi log lỗi một lần", async () => {
    // Cảnh báo bị mất là lỗi vận hành: ghi ở mức error để lọc log theo mức là thấy.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const box = mailbox();
    await raiseAlert(env.DB, "webhook_bad_signature", T + 10);
    await raiseAlert(env.DB, "webhook_bad_signature", T + 20);
    expect(await sendAlerts(ops, box.provider, T + 3600 + 86400)).toBe(0);
    expect(box.sent).toHaveLength(0);
    const logged = error.mock.calls.map((c) => JSON.parse(c[0] as string) as Record<string, unknown>);
    expect(logged).toEqual([{ event: "alert_expired_unreported", kind: "webhook_bad_signature", count: 2, since: T }]);
    expect(await sendAlerts(ops, box.provider, T + 3600 + 86400 + 300)).toBe(0);
    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("cảnh báo quá 24 giờ, hai lần cron chạy chồng nhau: chỉ ghi log một lần", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await raiseAlert(env.DB, "many_failures", T);
    await Promise.all([1, 2, 3].map(() => sendAlerts(ops, mailbox().provider, T + 3600 + 86400)));
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("gửi lỗi thì lần sau thử lại", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await raiseAlert(env.DB, "many_failures", T);
    expect(await sendAlerts(ops, mailbox(true).provider, T + 300)).toBe(0);
    const box = mailbox();
    expect(await sendAlerts(ops, box.provider, T + 600)).toBe(1);
    expect(box.sent[0]!.text).toContain("dò key");
  });

  it("email hoàn tiền và tranh chấp: chỉ cách tìm đơn ở Web Admin (email không mang mã đơn), không có số phí của bên thứ ba", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const kinds = ["order_disputed", "order_partially_refunded", "order_refund_unconfirmed", "order_refunded"] as const;
    for (const kind of kinds) await raiseAlert(env.DB, kind, T);
    const box = mailbox();
    expect(await sendAlerts(ops, box.provider, T + 300)).toBe(4);
    const text = (kind: string) => box.sent.find((m) => m.subject.includes(`: ${kind} (`))!.text;
    for (const kind of kinds) {
      // Đơn đã hoàn (refunded) không có trong hàng đợi Việc cần xử lý: chỉ nhật ký tìm được đơn.
      expect(text(kind), kind).toContain(
        "lọc nhật ký ở Web Admin theo hành động order_refunded (hay order_partially_refunded, order_disputed, order_refund_unconfirmed)",
      );
      expect(text(kind), kind).not.toContain("Việc cần xử lý");
      expect(text(kind), kind).not.toContain("theo mã đơn");
      expect(text(kind), kind).not.toContain("25 USD");
    }
    // Lần hoàn chưa thành công không đổi đơn: đơn chưa cấp vẫn có thể được cấp tự động.
    expect(text("order_refund_unconfirmed")).toContain("đơn chưa cấp vẫn có thể được cấp tự động khi cổng báo đã trả");
    expect(text("order_refund_unconfirmed")).toContain("thu hồi hay rút ngắn hạn license sau khi hoàn tiền xong");
  });

  it("email payment_unmatched (webhook đúng chữ ký không khớp đơn nào): chỉ cách tìm ở nhật ký Web Admin, nói rõ chưa cấp key", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await raiseAlert(env.DB, "payment_unmatched", T);
    const box = mailbox();
    expect(await sendAlerts(ops, box.provider, T + 300)).toBe(1);
    expect(box.sent[0]!.subject).toContain(": payment_unmatched (1)");
    expect(box.sent[0]!.text).toContain("Không có key nào được cấp");
    expect(box.sent[0]!.text).toContain("lọc nhật ký ở Web Admin theo hành động payment_unmatched");
    // Hoàn tiền hay tranh chấp: cách tìm đơn của ta, và nút Ghi đã hoàn tiền chỉ có ở đơn paid_needs_review (admin.ts /resolve).
    expect(box.sent[0]!.text).toContain("Với hoàn tiền hay tranh chấp (event_type refund.created/dispute.created): tra request_id của phiên ở dashboard Creem");
    expect(box.sent[0]!.text).toContain("đơn paid_needs_review thì bấm Ghi đã hoàn tiền");
    expect(box.sent[0]!.text).toContain("provider_ref có tiền tố ch_ (phiên), ref_ (lần hoàn), disp_ (tranh chấp)");
  });

  it("email order_payment_review (cổng báo đã trả mà số tiền khác giá đơn): nói rõ đơn không được cấp tự động và việc cần làm", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await raiseAlert(env.DB, "order_payment_review", T);
    const box = mailbox();
    expect(await sendAlerts(ops, box.provider, T + 300)).toBe(1);
    expect(box.sent[0]!.subject).toBe("[license test] Cảnh báo: order_payment_review (1)");
    expect(box.sent[0]!.text).toContain(
      "Cổng báo đã trả nhưng số tiền khác giá đơn (lệch giá, mã giảm giá, hay thuế tính khác giả định): đơn không được cấp tự động " +
        "(failed hoặc underpaid). Mở đơn ở Web Admin, xem trạng thái trên cổng, rồi cấp tay hay hoàn tiền.",
    );
    // Thư không mang mã đơn: chỉ cách tìm đơn (nhật ký theo hành động; đơn underpaid còn có ở hàng đợi).
    expect(box.sent[0]!.text).toContain(
      "Tìm đơn: lọc nhật ký ở Web Admin theo hành động order_amount_mismatch hay order_underpaid " +
        "(thư này không mang mã đơn; đơn underpaid cũng có ở trang Việc cần xử lý).",
    );
  });

  describe("khóa API của cổng bị từ chối: mỗi cổng một loại cảnh báo (hardening A6)", () => {
    const body = async (kind: "creem_auth_failed" | "payos_auth_failed") => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await raiseAlert(env.DB, kind, T);
      const box = mailbox();
      expect(await sendAlerts(ops, box.provider, T + 300)).toBe(1);
      expect(box.sent[0]!.subject).toBe(`[license test] Cảnh báo: ${kind} (1)`);
      return box.sent[0]!.text;
    };

    it("creem_auth_failed: nêu Creem, mã 401/403 có thân JSON của Creem, đơn đã trả và mốc 24 giờ, đặt lại CREEM_API_KEY cho cả hai Worker", async () => {
      const text = await body("creem_auth_failed");
      expect(text).toContain(
        "Creem từ chối khóa API (HTTP 401/403 có thân JSON của Creem): khóa sai, bị thu hồi hay thiếu quyền. Đơn USD mới lỗi 502; " +
          "nếu cảnh báo đến từ đối soát thì có thể có đơn khách ĐÃ TRẢ đang chờ cấp: thay khóa trong 24 giờ " +
          "(quá 24 giờ đơn thành expired, phải cấp tay). Đặt lại `CREEM_API_KEY` cho cả Worker API và Worker admin.",
      );
      expect(text).not.toContain("PayOS");
      expect(text).not.toContain("PAYOS");
    });

    it("payos_auth_failed: nêu PayOS, đơn VND, đơn đã trả và mốc 24 giờ, đặt lại PAYOS_CLIENT_ID và PAYOS_API_KEY cho cả hai Worker", async () => {
      const text = await body("payos_auth_failed");
      expect(text).toContain(
        "PayOS từ chối khóa API (HTTP 401/403 có thân JSON của PayOS): khóa sai, bị thu hồi hay thiếu quyền. Đơn VND mới lỗi 502; " +
          "nếu cảnh báo đến từ đối soát thì có thể có đơn khách ĐÃ TRẢ đang chờ cấp: thay khóa trong 24 giờ " +
          "(quá 24 giờ đơn thành expired, phải cấp tay). Đặt lại `PAYOS_CLIENT_ID` và `PAYOS_API_KEY` cho cả Worker API và Worker admin.",
      );
      expect(text).not.toContain("Creem");
      expect(text).not.toContain("CREEM");
    });

    it("(A5d) order_check_failed: đối soát không đọc được trạng thái đơn từ cổng; tìm đơn trên dashboard của cổng, log reconcile_failed có mã đơn; đếm theo đơn, gộp mỗi giờ", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await raiseAlert(env.DB, "order_check_failed", T);
      await raiseAlert(env.DB, "order_check_failed", T + 60);
      const box = mailbox();
      expect(await sendAlerts(ops, box.provider, T + 300)).toBe(1);
      expect(box.sent[0]!.subject).toBe("[license test] Cảnh báo: order_check_failed (2)");
      expect(box.sent[0]!.text).toContain(
        "Đối soát không đọc được trạng thái đơn từ cổng thanh toán (dữ liệu mâu thuẫn, 3xx hay 404). Nếu đơn đã được khách trả thì " +
          "tìm đơn trên dashboard của cổng; log `reconcile_failed` có mã đơn. Cảnh báo này đếm theo đơn và gộp mỗi giờ.",
      );
    });

    it("chân thư: chi tiết ở Workers Logs; loại có nhật ký thì xem thêm bảng audit_log ở Web Admin (loại khóa API không có nhật ký)", async () => {
      expect(await body("creem_auth_failed")).toContain("Chi tiết ở Workers Logs; loại có nhật ký thì xem thêm bảng audit_log ở Web Admin");
    });
  });

  describe("authFailedAlert: loại cảnh báo theo tên cổng của đơn (orders.provider)", () => {
    it("payos và creem có loại riêng; cổng khác hay tên lạ (kể cả tên thuộc tính của Object) không có loại", () => {
      expect(authFailedAlert("payos")).toBe("payos_auth_failed");
      expect(authFailedAlert("creem")).toBe("creem_auth_failed");
      for (const name of ["fakepay", "", "PAYOS", "none", "constructor", "__proto__", "toString"]) expect(authFailedAlert(name), name).toBeNull();
    });
  });
});
