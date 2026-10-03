import { createStore } from "zustand/vanilla";
import type { CheckoutView, Device, Ipc, LicenseView, OrderOutcome, PlanOffer } from "../lib/ipc";
import { type UiError, toUiError } from "./app";

// Store bản quyền của cửa sổ chính (kế hoạch 06): trạng thái bản quyền và hạn mức, kích hoạt, gỡ máy, mua gói. Phía Rust
// giữ key, token và `order_token`; store chỉ nhận bản đã che (`LicenseView`, `CheckoutView`).

export interface LicenseStoreState {
  view: LicenseView | null;
  // Key người dùng vừa gõ mà đã đủ 2 máy (`409 device_limit`): danh sách máy để gỡ một máy.
  devices: Device[] | null;
  plans: PlanOffer[] | null;
  checkout: CheckoutView | null;
  order: OrderOutcome | null;
  error: UiError | null;
  busy: boolean;
  init(): Promise<() => void>;
  activate(key: string): Promise<boolean>;
  // Gỡ một máy khác của key vừa gõ, rồi kích hoạt lại máy này.
  deactivateOther(key: string, activationId: string): Promise<boolean>;
  deactivate(): Promise<void>;
  validate(): Promise<void>;
  loadPlans(): Promise<void>;
  startCheckout(plan: string, email: string, consent: boolean, renew: boolean): Promise<boolean>;
  openCheckoutPage(): Promise<void>;
  cancelCheckout(): Promise<void>;
  recover(email: string): Promise<boolean>;
  dismiss(): void;
}

export function createLicenseStore(ipc: Ipc) {
  return createStore<LicenseStoreState>()((set, get) => {
    async function run(call: () => Promise<void>): Promise<boolean> {
      if (get().busy) return false;
      set({ busy: true });
      try {
        await call();
        set({ error: null });
        return true;
      } catch (e) {
        set({ error: toUiError(e) });
        return false;
      } finally {
        set({ busy: false });
      }
    }

    function setView(view: LicenseView | null) {
      if (view) set({ view });
    }

    return {
      view: null,
      devices: null,
      plans: null,
      checkout: null,
      order: null,
      error: null,
      busy: false,

      async init() {
        const offs = await Promise.all([
          ipc.listen("license://changed", (view) => set({ view })),
          ipc.listen("license://order", (order) => set({ order })),
        ]);
        const [view, checkout] = await Promise.all([ipc.invoke("get_license"), ipc.invoke("get_pending_order")]);
        setView(view);
        set({ checkout });
        return () => offs.forEach((off) => off());
      },

      activate(key) {
        return run(async () => {
          const outcome = await ipc.invoke("activate_license", { key });
          setView(outcome.view);
          set({ devices: outcome.devices });
        });
      },

      async deactivateOther(key, activationId) {
        const removed = await run(() => ipc.invoke("deactivate_other_device", { key, activationId }).then(() => {}));
        return removed && (await get().activate(key));
      },

      async deactivate() {
        await run(async () => setView(await ipc.invoke("deactivate_license")));
      },

      async validate() {
        await run(async () => setView(await ipc.invoke("validate_license")));
      },

      async loadPlans() {
        await run(async () => set({ plans: await ipc.invoke("get_plans") }));
      },

      startCheckout(plan, email, consent, renew) {
        return run(async () => {
          set({ checkout: await ipc.invoke("start_checkout", { plan, email, consent, renew }), order: null });
        });
      },

      async openCheckoutPage() {
        await run(() => ipc.invoke("open_checkout_page").then(() => {}));
      },

      async cancelCheckout() {
        await run(async () => {
          await ipc.invoke("cancel_checkout");
          set({ checkout: null, order: null });
        });
      },

      recover(email) {
        return run(() => ipc.invoke("recover_license", { email }).then(() => {}));
      },

      dismiss() {
        set({ error: null, devices: null });
      },
    };
  });
}

export type LicenseStore = ReturnType<typeof createLicenseStore>;
