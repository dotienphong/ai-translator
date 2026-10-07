import { describe, expect, it } from "vitest";
import type { LicenseView, OrderOutcome, QuotaView } from "./ipc";
import {
  defaultPlan,
  deviceName,
  hoursUsed,
  isRenewal,
  isThisMachine,
  licenseNotice,
  minutesLeft,
  orderFinished,
  orderMessageKey,
  quotaKey,
  trialKey,
} from "./license";

const quota = (patch: Partial<QuotaView> = {}): QuotaView => ({
  unlimited: false,
  limitMs: 1_800_000,
  usedMs: 0,
  remainingMs: 1_800_000,
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
  trial: { status: "active", endsAt: 1_791_676_800, daysLeft: 10 },
  conflict: null,
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
    // Mỗi key một máy và dùng thử 10 ngày (spec 2026-10-07 §3.2, §4.2).
    expect(licenseNotice(licenseView({ standing: "conflict" }))).toBe("license.notice.conflict");
    const ended = { status: "ended", endsAt: 1, daysLeft: 0 } as const;
    expect(licenseNotice(licenseView({ trial: ended }))).toBe("license.notice.trialEnded");
    expect(licenseNotice(licenseView({ standing: "expired", trial: ended }))).toBe("license.notice.expired");
    expect(licenseNotice(licenseView({ standing: "active", plan: "monthly", trial: ended }))).toBeNull();
    expect(licenseNotice(licenseView({ devOverride: true, plan: "yearly", trial: ended }))).toBeNull();
  });

  it("dòng dùng thử chỉ ở gói Free", () => {
    expect(trialKey(licenseView())).toBe("trial.active");
    expect(trialKey(licenseView({ trial: { status: "ended", endsAt: 1, daysLeft: 0 } }))).toBe("trial.ended");
    expect(trialKey(licenseView({ trial: { status: "none", endsAt: null, daysLeft: 0 } }))).toBe("trial.none");
    expect(trialKey(licenseView({ standing: "active", plan: "monthly" }))).toBeNull();
    expect(trialKey(licenseView({ devOverride: true, plan: "yearly" }))).toBeNull();
  });

  it("gia hạn khi đã có key chưa bị thu hồi", () => {
    expect(isRenewal(null)).toBe(false);
    expect(isRenewal(licenseView())).toBe(false);
    expect(isRenewal(licenseView({ key: "••••-RST5", standing: "expired" }))).toBe(true);
    expect(isRenewal(licenseView({ key: "••••-RST5", standing: "revoked" }))).toBe(false);
  });

  it("gói chọn sẵn ở màn hình Nâng cấp: gia hạn được thì đúng gói đang dùng, còn lại là Monthly", () => {
    const key = "••••-RST5";
    expect(defaultPlan(null)).toBe("monthly");
    expect(defaultPlan(licenseView())).toBe("monthly");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "monthly" }))).toBe("monthly");
    expect(defaultPlan(licenseView({ key, standing: "active", plan: "yearly" }))).toBe("yearly");
    // License đã thu hồi thì mua mới, không gia hạn: về Monthly.
    expect(defaultPlan(licenseView({ key, standing: "revoked", plan: "yearly" }))).toBe("monthly");
    // Có key nhưng gói Free thì không có gói trả phí nào để gia hạn.
    expect(defaultPlan(licenseView({ key, standing: "free", plan: "free" }))).toBe("monthly");
  });
});

describe("đơn và máy", () => {
  it("máy không tên dùng tên thay thế", () => {
    expect(deviceName({ activation_id: "a", device_label: null, last_validated_at: null }, "Máy không tên")).toBe(
      "Máy không tên",
    );
    expect(deviceName({ activation_id: "a", device_label: " Mac ", last_validated_at: null }, "x")).toBe("Mac");
  });

  it("máy này trong danh sách xung đột", () => {
    const a = { activation_id: "a", device_label: null, last_validated_at: null };
    expect(isThisMachine({ devices: [a], thisActivationId: "a" }, a)).toBe(true);
    expect(isThisMachine({ devices: [a], thisActivationId: "b" }, a)).toBe(false);
  });

  it("đơn đã xong thì cho tạo đơn mới; thiếu tiền vẫn chờ chuyển bù", () => {
    const o = (state: OrderOutcome["state"]) => ({ state, order_code: 1, expires_at: 0, plan: "monthly", code: "x" }) as OrderOutcome;
    expect(orderFinished(null)).toBe(false);
    expect(orderFinished(o("waiting"))).toBe(false);
    expect(orderFinished(o("underpaid"))).toBe(false);
    for (const s of ["paid", "needsReview", "refunded", "failed", "paidButNotApplied"] as const) {
      expect(orderFinished(o(s)), s).toBe(true);
    }
    expect(orderMessageKey(o("refunded"))).toBe("upgrade.order.refunded");
  });
});
