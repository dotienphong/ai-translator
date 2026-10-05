import { describe, expect, it } from "vitest";
import type { LicenseView, OrderOutcome, QuotaView } from "./ipc";
import { defaultPlan, deviceName, hoursUsed, isRenewal, licenseNotice, minutesLeft, orderFinished, orderMessageKey, quotaKey } from "./license";

const quota = (patch: Partial<QuotaView> = {}): QuotaView => ({
  unlimited: false,
  limitMs: 600_000,
  usedMs: 0,
  remainingMs: 600_000,
  resetAt: 1_790_900_000,
  resetKind: "daily",
  needsNetwork: false,
  lost: false,
  storageError: false,
  ...patch,
});

const licenseView = (patch: Partial<LicenseView> = {}): LicenseView => ({
  standing: "free",
  plan: "free",
  licensedPlan: null,
  key: null,
  expiresAt: null,
  refreshBefore: null,
  validatedAt: null,
  renewSoon: false,
  quota: quota(),
  serverConfigured: true,
  devOverride: false,
  clockRolledBack: false,
  ...patch,
});

describe("hạn mức", () => {
  it("số phút làm tròn xuống, giờ đã dùng một chữ số thập phân", () => {
    expect(minutesLeft(quota({ remainingMs: 59_999 }))).toBe(0);
    expect(minutesLeft(quota({ remainingMs: 300_000 }))).toBe(5);
    expect(hoursUsed(quota({ usedMs: 5_400_000 }))).toBe(1.5);
  });

  it("câu tóm tắt theo thứ tự: không giới hạn, lỗi kho khóa, mất bản ghi, cần mạng, đã hết, còn", () => {
    expect(quotaKey(quota({ unlimited: true, storageError: true }))).toBe("quota.unlimited");
    expect(quotaKey(quota({ storageError: true, lost: true }))).toBe("quota.storageError");
    expect(quotaKey(quota({ lost: true, remainingMs: 0 }))).toBe("quota.lost");
    expect(quotaKey(quota({ needsNetwork: true, resetKind: "cycle" }))).toBe("quota.needsNetwork");
    expect(quotaKey(quota({ remainingMs: 0 }))).toBe("quota.used");
    expect(quotaKey(quota())).toBe("quota.daily");
    expect(quotaKey(quota({ resetKind: "expiry" }))).toBe("quota.cycle");
  });
});

describe("lời nhắc bản quyền", () => {
  it("theo tình trạng; sắp hết hạn chỉ khi đang có gói", () => {
    expect(licenseNotice(null)).toBeNull();
    expect(licenseNotice(licenseView())).toBeNull();
    expect(licenseNotice(licenseView({ standing: "notGenuine" }))).toBe("license.notice.notGenuine");
    expect(licenseNotice(licenseView({ standing: "clockRolledBack" }))).toBe("license.notice.clockRolledBack");
    expect(licenseNotice(licenseView({ standing: "refreshNeeded" }))).toBe("license.notice.refreshNeeded");
    expect(licenseNotice(licenseView({ standing: "expired", renewSoon: true }))).toBe("license.notice.expired");
    expect(licenseNotice(licenseView({ standing: "revoked" }))).toBe("license.notice.revoked");
    expect(licenseNotice(licenseView({ standing: "active", renewSoon: true }))).toBe("license.notice.renewSoon");
    expect(licenseNotice(licenseView({ standing: "active" }))).toBeNull();
    // Gói Free cũng nhắc chỉnh giờ máy (Q2 của review 06 lần 1).
    expect(licenseNotice(licenseView({ standing: "free", clockRolledBack: true }))).toBe("license.notice.clockRolledBack");
  });

  it("gia hạn khi đã có key chưa bị thu hồi", () => {
    expect(isRenewal(null)).toBe(false);
    expect(isRenewal(licenseView())).toBe(false);
    expect(isRenewal(licenseView({ key: "••••-RST5", standing: "expired" }))).toBe(true);
    expect(isRenewal(licenseView({ key: "••••-RST5", standing: "revoked" }))).toBe(false);
  });

  it("gói chọn sẵn ở màn hình Nâng cấp: gia hạn được thì đúng gói đang dùng, còn lại là Professional", () => {
    const key = "••••-RST5";
    expect(defaultPlan(null)).toBe("pro");
    expect(defaultPlan(licenseView())).toBe("pro");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "pro" }))).toBe("pro");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "pro_x2" }))).toBe("pro_x2");
    expect(defaultPlan(licenseView({ key, standing: "expired", plan: "pro_x5" }))).toBe("pro_x5");
    // License đã thu hồi thì mua mới, không gia hạn: về Professional.
    expect(defaultPlan(licenseView({ key, standing: "revoked", plan: "pro_x2" }))).toBe("pro");
    // Có key nhưng gói Free thì không có gói trả phí nào để gia hạn.
    expect(defaultPlan(licenseView({ key, standing: "free", plan: "free" }))).toBe("pro");
  });
});

describe("đơn và máy", () => {
  it("máy không tên dùng tên thay thế", () => {
    expect(deviceName({ activation_id: "a", device_label: null, last_validated_at: null }, "Máy không tên")).toBe(
      "Máy không tên",
    );
    expect(deviceName({ activation_id: "a", device_label: " Mac ", last_validated_at: null }, "x")).toBe("Mac");
  });

  it("đơn đã xong thì cho tạo đơn mới; thiếu tiền vẫn chờ chuyển bù", () => {
    const o = (state: OrderOutcome["state"]) => ({ state, order_code: 1, expires_at: 0, plan: "pro", code: "x" }) as OrderOutcome;
    expect(orderFinished(null)).toBe(false);
    expect(orderFinished(o("waiting"))).toBe(false);
    expect(orderFinished(o("underpaid"))).toBe(false);
    for (const s of ["paid", "needsReview", "refunded", "failed", "paidButNotApplied"] as const) {
      expect(orderFinished(o(s)), s).toBe(true);
    }
    expect(orderMessageKey(o("refunded"))).toBe("upgrade.order.refunded");
  });
});
