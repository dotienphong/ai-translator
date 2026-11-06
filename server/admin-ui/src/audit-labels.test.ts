import { describe, expect, it } from "vitest";
import { actionLabel, actionTone, KNOWN_ACTIONS } from "./audit-labels";

describe("audit-labels: hoàn tiền và tranh chấp của cổng thanh toán (webhook Creem)", () => {
  it.each([
    ["order_refunded", "Đơn được hoàn tiền", "warn"],
    ["order_partially_refunded", "Hoàn tiền một phần", "warn"],
    ["order_disputed", "Khách mở tranh chấp", "bad"],
  ])("%s có tên tiếng Việt và tông", (action, label, tone) => {
    expect(actionLabel(action)).toBe(label);
    expect(actionTone(action)).toBe(tone);
    expect(KNOWN_ACTIONS).toContain(action);
  });

  it.each([
    ["license_shortened_manually", "Rút ngắn hạn tay", "warn"],
    ["order_refund_unconfirmed", "Hoàn tiền chưa thành công", "warn"],
    ["payment_unmatched", "Thanh toán không khớp đơn", "bad"],
  ])("nhãn mới của hardening: %s có tên tiếng Việt, tông và là gợi ý của ô lọc hành động", (action, label, tone) => {
    expect(actionLabel(action)).toBe(label);
    expect(actionTone(action)).toBe(tone);
    expect(KNOWN_ACTIONS).toContain(action);
  });

  // Nhãn theo hành động, không theo cổng: order_underpaid của Creem là mã giảm giá hay trả thấp hơn giá (không thể chuyển bù qua
  // thẻ), nên nhãn không nói "Chuyển thiếu" cho mọi cổng.
  it("order_underpaid và order_amount_mismatch: tên trung lập cho mọi cổng, không nói chuyển thiếu", () => {
    expect(actionLabel("order_underpaid")).toBe("Trả thiếu hay lệch số tiền");
    expect(actionLabel("order_underpaid")).not.toMatch(/chuyển/i);
    expect(actionTone("order_underpaid")).toBe("warn");
    expect(actionLabel("order_amount_mismatch")).toBe("Số tiền không khớp");
    expect(actionTone("order_amount_mismatch")).toBe("warn");
    expect(KNOWN_ACTIONS).toContain("order_underpaid");
  });

  it("không lẫn với thao tác ghi tay của người vận hành (order_refunded_outside)", () => {
    expect(actionLabel("order_refunded_outside")).toBe("Ghi đã hoàn tiền");
    expect(actionTone("order_refunded_outside")).toBe("info");
  });

  it("mã lạ: không có tên, tông trung tính", () => {
    expect(actionLabel("ma_la")).toBeUndefined();
    expect(actionTone("ma_la")).toBe("default");
  });
});

describe("audit-labels: báo cáo lỗi của app", () => {
  it.each([
    ["error_report_viewed", "Xem báo cáo lỗi", "default"],
    ["error_reports_deleted", "Xóa báo cáo lỗi", "info"],
  ])("%s có tên tiếng Việt, tông và là gợi ý của ô lọc hành động", (action, label, tone) => {
    expect(actionLabel(action)).toBe(label);
    expect(actionTone(action)).toBe(tone);
    expect(KNOWN_ACTIONS).toContain(action);
  });
});

describe("audit-labels: tự gia hạn Creem (thuê bao)", () => {
  it.each([
    ["subscription_linked", "Bắt đầu tự gia hạn", "ok"],
    ["subscription_renewed", "Tự gia hạn kỳ mới", "ok"],
    ["subscription_status", "Đổi trạng thái tự gia hạn", "info"],
    ["subscription_period_unreadable", "Kỳ tự gia hạn cần xem", "warn"],
    ["subscription_unlinked", "Sự kiện thuê bao chưa gắn license", "bad"],
  ])("%s có tên tiếng Việt, tông và là gợi ý của ô lọc hành động", (action, label, tone) => {
    expect(actionLabel(action)).toBe(label);
    expect(actionTone(action)).toBe(tone);
    expect(KNOWN_ACTIONS).toContain(action);
  });
});

describe("audit-labels: tài khoản Google (admin-accounts.ts)", () => {
  it.each([
    ["account_viewed", "Xem tài khoản", "default"],
    ["account_license_unlinked", "Gỡ gắn license khỏi tài khoản", "info"],
    ["account_anonymized", "Ẩn danh tài khoản", "bad"],
    ["accounts_exported", "Xuất CSV tài khoản", "info"],
  ])("%s có tên tiếng Việt, tông và là gợi ý của ô lọc hành động", (action, label, tone) => {
    expect(actionLabel(action)).toBe(label);
    expect(actionTone(action)).toBe(tone);
    expect(KNOWN_ACTIONS).toContain(action);
  });
});
