import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { CheckoutView, LicenseView } from "../lib/ipc";
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
    limitMs: 600_000,
    usedMs: 0,
    remainingMs: 600_000,
    resetAt: null,
    resetKind: "daily",
    needsNetwork: false,
    lost: false,
    storageError: false,
  },
  serverConfigured: true,
  devOverride: false,
  clockRolledBack: false,
  ...patch,
});

const checkout: CheckoutView = {
  orderCode: 7,
  plan: "pro",
  amount: 50_000,
  currency: "VND",
  expiresAt: 1,
  qrSvg: "<svg/>",
  licenseExpiresAt: null,
  convertedDays: null,
};

describe("license store", () => {
  it("đọc trạng thái và đơn đang chờ, rồi theo sự kiện", async () => {
    const fake = fakeIpc({ get_license: () => licenseView(), get_pending_order: () => checkout });
    const store = createLicenseStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().view?.plan).toBe("free");
    expect(store.getState().checkout?.orderCode).toBe(7);
    fake.emit("license://changed", licenseView({ plan: "pro", standing: "active" }));
    expect(store.getState().view?.plan).toBe("pro");
    fake.emit("license://order", { state: "paid", order_code: 7, plan: "pro" });
    expect(store.getState().order?.state).toBe("paid");
  });

  it("key đã đủ 2 máy: hiện danh sách; gỡ một máy rồi kích hoạt lại máy này", async () => {
    let full = true;
    const fake = fakeIpc({
      activate_license: () =>
        full
          ? { view: null, devices: [{ activation_id: "a1", device_label: null, last_validated_at: 5 }] }
          : { view: licenseView({ plan: "pro", standing: "active" }), devices: null },
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
    expect(store.getState().view?.plan).toBe("pro");
    expect(fake.calls.map((c) => c.cmd)).toEqual(["activate_license", "deactivate_other_device", "activate_license"]);
    expect(fake.calls[1]?.args).toEqual({ key: "KEY", activationId: "a1" });
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

  it("tạo đơn gửi email, ô đồng ý và gia hạn; hủy đơn thì bỏ mã QR", async () => {
    const fake = fakeIpc({ start_checkout: () => checkout, cancel_checkout: () => null });
    const store = createLicenseStore(fake.ipc);
    expect(await store.getState().startCheckout("pro_x2", "a@b.vn", true, true)).toBe(true);
    expect(fake.calls[0]?.args).toEqual({ plan: "pro_x2", email: "a@b.vn", consent: true, renew: true });
    expect(store.getState().checkout?.qrSvg).toBe("<svg/>");
    await store.getState().cancelCheckout();
    expect(store.getState().checkout).toBeNull();
  });
});
