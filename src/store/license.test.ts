import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { CheckoutView, LicenseView, PlansView } from "../lib/ipc";
import { lockedCurrency } from "../lib/license";
import { createLicenseStore } from "./license";

const licenseView = (patch: Partial<LicenseView> = {}): LicenseView => ({
  standing: "free",
  plan: "free",
  licensedPlan: null,
  key: null,
  expiresAt: null,
  refreshBefore: null,
  validatedAt: null,
  renewSoon: false,
  quota: {
    unlimited: false,
    limitMs: 1_800_000,
    usedMs: 0,
    remainingMs: 1_800_000,
    resetAt: null,
    resetKind: "daily",
    needsNetwork: false,
    lost: false,
    storageError: false,
  },
  serverConfigured: true,
  devOverride: false,
  clockRolledBack: false,
  trial: { status: "active", endsAt: 1_791_676_800, daysLeft: 10 },
  conflict: null,
  ...patch,
});

const checkout: CheckoutView = {
  orderCode: 7,
  plan: "monthly",
  amount: 50_000,
  currency: "VND",
  expiresAt: 1,
  provider: "payos",
  qrSvg: "<svg/>",
  licenseExpiresAt: null,
  convertedDays: null,
};

// Đơn thẻ quốc tế (Creem): không có mã QR, khách trả ở trang mở bằng trình duyệt.
const cardCheckout: CheckoutView = { ...checkout, orderCode: 8, amount: 399, currency: "USD", provider: "creem", qrSvg: null };

const plansView = (): PlansView => ({
  plans: [{ code: "monthly", name: "Monthly", quota_minutes_per_cycle: 3000, days_per_order: 30, prices: { VND: 50_000, USD: 399 } }],
});

describe("license store", () => {
  it("đọc trạng thái và đơn đang chờ, rồi theo sự kiện", async () => {
    const fake = fakeIpc({ get_license: () => licenseView(), get_pending_order: () => checkout });
    const store = createLicenseStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().view?.plan).toBe("free");
    expect(store.getState().checkout?.orderCode).toBe(7);
    fake.emit("license://changed", licenseView({ plan: "monthly", standing: "active" }));
    expect(store.getState().view?.plan).toBe("monthly");
    fake.emit("license://order", { state: "paid", order_code: 7, plan: "monthly" });
    expect(store.getState().order?.state).toBe("paid");
  });

  it("key đã đủ 2 máy: hiện danh sách; gỡ một máy rồi kích hoạt lại máy này", async () => {
    let full = true;
    const fake = fakeIpc({
      activate_license: () =>
        full
          ? { view: null, devices: [{ activation_id: "a1", device_label: null, last_validated_at: 5 }] }
          : { view: licenseView({ plan: "monthly", standing: "active" }), devices: null },
      deactivate_other_device: () => {
        full = false;
        return null;
      },
    });
    const store = createLicenseStore(fake.ipc);
    await store.getState().activate("KEY");
    expect(store.getState().devices?.[0]?.activation_id).toBe("a1");
    expect(await store.getState().deactivateOther("KEY", "a1")).toBe(true);
    expect(store.getState().devices).toBeNull();
    expect(store.getState().view?.plan).toBe("monthly");
    expect(fake.calls.map((c) => c.cmd)).toEqual(["activate_license", "deactivate_other_device", "activate_license"]);
    expect(fake.calls[1]?.args).toEqual({ key: "KEY", activationId: "a1" });
  });

  it("vẫn kích hoạt khi key đang dùng ở máy khác: gửi allowConflict, nhận trạng thái xung đột", async () => {
    const conflict = { devices: [{ activation_id: "a1", device_label: null, last_validated_at: 5 }], thisActivationId: "a2" };
    const fake = fakeIpc({
      activate_license: () => ({ view: licenseView({ standing: "conflict", conflict }), devices: null }),
    });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().activateAnyway("KEY")).toBe(true);
    expect(fake.calls[0]?.args).toEqual({ key: "KEY", allowConflict: true });
    expect(store.getState().view?.standing).toBe("conflict");
    expect(store.getState().devices).toBeNull();
  });

  it("đang xung đột: gỡ máy kia bằng key đã lưu rồi đọc lại trạng thái", async () => {
    const fake = fakeIpc({
      deactivate_other_device: () => null,
      get_license: () => licenseView({ standing: "active", plan: "monthly" }),
    });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().removeOtherMachine("a1")).toBe(true);
    expect(fake.calls.map((c) => c.cmd)).toEqual(["deactivate_other_device", "get_license"]);
    expect(fake.calls[0]?.args).toEqual({ activationId: "a1" });
    expect(store.getState().view?.standing).toBe("active");
  });

  it("lỗi của lệnh hiện mã lỗi; bấm hai lần khi đang chờ chỉ gửi một lệnh", async () => {
    let release: () => void = () => {};
    const fake = fakeIpc({
      activate_license: () => {
        throw { code: "licenseLocked", field: null, message: "…" };
      },
      validate_license: () => new Promise((resolve) => (release = () => resolve(licenseView()))),
    });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().activate("K")).toBe(false);
    expect(store.getState().error).toEqual({ code: "licenseLocked", field: null });
    const first = store.getState().validate();
    void store.getState().validate();
    release();
    await first;
    expect(fake.calls.filter((c) => c.cmd === "validate_license")).toHaveLength(1);
    expect(store.getState().error).toBeNull();
  });

  it("tạo đơn gửi email, ô đồng ý, gia hạn và loại tiền; hủy đơn thì bỏ mã QR", async () => {
    const fake = fakeIpc({ start_checkout: () => checkout, cancel_checkout: () => null });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().startCheckout("yearly", "a@b.vn", true, true, "VND")).toBe(true);
    expect(fake.calls[0]?.args).toEqual({ plan: "yearly", email: "a@b.vn", consent: true, renew: true, currency: "VND" });
    expect(store.getState().checkout?.qrSvg).toBe("<svg/>");
    await store.getState().cancelCheckout();
    expect(store.getState().checkout).toBeNull();
  });

  it("tải bảng gói: giá theo từng loại tiền", async () => {
    const fake = fakeIpc({ get_plans: () => plansView() });
    const store = createLicenseStore(fake.ipc);
    expect(store.getState().plans).toBeNull();
    await store.getState().loadPlans();
    expect(store.getState().plans?.[0]?.prices.USD).toBe(399);
  });

  it("tải bảng gói không đặt `busy` (không khóa, không làm mờ ô chọn gói và cách trả); lỗi vẫn hiện, tải hai lần chỉ gửi một lệnh", async () => {
    let release: () => void = () => {};
    const fake = fakeIpc({
      get_plans: () => new Promise((resolve) => (release = () => resolve(plansView()))),
      start_checkout: () => cardCheckout,
    });
    const store = createLicenseStore(fake.ipc);
    const loading = store.getState().loadPlans();
    void store.getState().loadPlans();
    expect(fake.calls.filter((c) => c.cmd === "get_plans")).toHaveLength(1);
    expect(store.getState().busy).toBe(false);
    // Đang tải bảng gói (bảng cũ còn trong store) mà khách bấm trả: tạo đơn chạy được, không bị bỏ qua vì "đang bận".
    expect(await store.getState().startCheckout("monthly", "a@b.vn", true, false, "USD")).toBe(true);
    expect(store.getState().checkout?.orderCode).toBe(8);
    release();
    await loading;
    expect(store.getState().busy).toBe(false);
    expect(store.getState().plans?.[0]?.prices.USD).toBe(399);

    // Lỗi thì hiện mã lỗi và không kẹt: lần mở màn sau tải lại được, và thành công thì xóa lỗi cũ.
    let down = true;
    const flaky = createLicenseStore(
      fakeIpc({
        get_plans: () => {
          if (down) throw { code: "network", field: null, message: "…" };
          return plansView();
        },
      }).ipc,
    );
    await flaky.getState().loadPlans();
    expect(flaky.getState().error).toEqual({ code: "network", field: null });
    expect(flaky.getState().busy).toBe(false);
    down = false;
    await flaky.getState().loadPlans();
    expect(flaky.getState().error).toBeNull();
    expect(flaky.getState().plans).toHaveLength(1);
  });

  it("đơn thẻ quốc tế: gửi currency USD, giữ đơn không có mã QR; mở lại app vẫn đọc được đơn đó", async () => {
    // `get_pending_order` thật (license::app::pending_order): số tiền và loại tiền như lúc tạo đơn, không có ngày hết hạn
    // mới hay số ngày quy đổi.
    const reread: CheckoutView = { ...cardCheckout, licenseExpiresAt: null, convertedDays: null };
    const fake = fakeIpc({ start_checkout: () => cardCheckout, get_pending_order: () => reread, get_license: () => licenseView() });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().startCheckout("monthly", "a@b.vn", true, false, "USD")).toBe(true);
    expect(fake.calls[0]?.args).toEqual({ plan: "monthly", email: "a@b.vn", consent: true, renew: false, currency: "USD" });
    expect(store.getState().checkout).toEqual(cardCheckout);
    expect(store.getState().checkout?.qrSvg).toBeNull();
    const reopened = createLicenseStore(fake.ipc);
    await reopened.getState().init();
    expect(reopened.getState().checkout?.provider).toBe("creem");
    expect(lockedCurrency(reopened.getState().checkout as CheckoutView)).toBe("USD");
  });

  it("mở lại app với đơn do bản app cũ lưu (số tiền 0, loại tiền rỗng): vẫn là đơn thẻ USD, đơn VietQR vẫn là VND", async () => {
    for (const [saved, currency] of [
      [cardCheckout, "USD"],
      [checkout, "VND"],
    ] as const) {
      const old: CheckoutView = { ...saved, amount: 0, currency: "", licenseExpiresAt: null, convertedDays: null };
      const fake = fakeIpc({ get_license: () => licenseView(), get_pending_order: () => old });
      const store = createLicenseStore(fake.ipc);
      await store.getState().init();
      expect(store.getState().checkout).toEqual(old);
      expect(lockedCurrency(store.getState().checkout as CheckoutView), saved.provider).toBe(currency);
    }
  });

  it("bỏ qua kết quả muộn của đơn đã hủy: khách Hủy đơn A rồi tạo đơn B, câu của A không hiện trên đơn B", async () => {
    const fake = fakeIpc({
      get_license: () => licenseView(),
      get_pending_order: () => checkout,
      cancel_checkout: () => null,
      start_checkout: () => cardCheckout,
    });
    const store = createLicenseStore(fake.ipc);
    await store.getState().init();
    await store.getState().cancelCheckout();
    expect(await store.getState().startCheckout("monthly", "a@b.vn", true, false, "USD")).toBe(true);
    fake.emit("license://order", { state: "failed", order_code: checkout.orderCode });
    expect(store.getState().order).toBeNull();
    fake.emit("license://order", { state: "waiting", order_code: cardCheckout.orderCode, expires_at: 2 });
    expect(store.getState().order?.state).toBe("waiting");
    fake.emit("license://order", { state: "paid", order_code: checkout.orderCode, plan: "monthly" });
    expect(store.getState().order).toEqual({ state: "waiting", order_code: cardCheckout.orderCode, expires_at: 2 });
  });

  it("kết quả tới trước khi đọc xong đơn đang chờ (mở lại app): giữ nếu đúng đơn đó, bỏ nếu là đơn khác", async () => {
    for (const [code, kept] of [
      [cardCheckout.orderCode, true],
      [checkout.orderCode, false],
    ] as const) {
      let release: () => void = () => {};
      const fake = fakeIpc({
        get_license: () => licenseView(),
        get_pending_order: () => new Promise<CheckoutView>((resolve) => (release = () => resolve(cardCheckout))),
      });
      const store = createLicenseStore(fake.ipc);
      const ready = store.getState().init();
      while (!fake.calls.some((c) => c.cmd === "get_pending_order")) await Promise.resolve();
      fake.emit("license://order", { state: "paid", order_code: code, plan: "monthly" });
      release();
      await ready;
      expect(store.getState().checkout?.orderCode).toBe(cardCheckout.orderCode);
      expect(store.getState().order?.state ?? null, String(code)).toBe(kept ? "paid" : null);
    }
  });
});
