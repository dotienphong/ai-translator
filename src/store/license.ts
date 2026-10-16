import { createStore } from "zustand/vanilla";
import type { CheckoutView, Device, Ipc, LicenseView, OrderOutcome, PlanOffer } from "../lib/ipc";
import type { PayCurrency } from "../lib/license";
import { type UiError, toUiError } from "./app";

// Store bản quyền của cửa sổ chính (kế hoạch 06): trạng thái bản quyền và hạn mức, kích hoạt, gỡ máy, mua gói. Phía Rust
// giữ key, token và `order_token`; store chỉ nhận bản đã che (`LicenseView`, `CheckoutView`).

export interface LicenseStoreState {
  view: LicenseView | null;
  // Key người dùng vừa gõ đang dùng ở máy khác (`409 key_in_use`): danh sách máy để gỡ máy kia hay "Vẫn kích hoạt".
  devices: Device[] | null;
  plans: PlanOffer[] | null;
  // Loại tiền server gợi ý theo nước của máy ("VND" hay "USD"); null khi chưa tải bảng gói hay server không gợi ý.
  suggestedCurrency: string | null;
  checkout: CheckoutView | null;
  order: OrderOutcome | null;
  error: UiError | null;
  busy: boolean;
  init(): Promise<() => void>;
  activate(key: string): Promise<boolean>;
  // "Vẫn kích hoạt trên máy này" (đã xác nhận): key vào trạng thái xung đột (spec 2026-10-07 §4.2).
  activateAnyway(key: string): Promise<boolean>;
  // Gỡ một máy khác của key vừa gõ, rồi kích hoạt lại máy này.
  deactivateOther(key: string, activationId: string): Promise<boolean>;
  // Đang xung đột: gỡ máy kia bằng key đã lưu (phía Rust `validate` ngay sau đó), rồi đọc lại trạng thái.
  removeOtherMachine(activationId: string): Promise<boolean>;
  deactivate(): Promise<void>;
  validate(): Promise<void>;
  loadPlans(): Promise<void>;
  startCheckout(plan: string, email: string, consent: boolean, renew: boolean, currency: PayCurrency): Promise<boolean>;
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

    // Lần tải bảng gói đang chạy: màn Nâng cấp tải lại mỗi lần mở (và hai lần khi React chạy hiệu ứng kép lúc dev).
    let plansLoad: Promise<void> | null = null;

    async function fetchPlans(): Promise<void> {
      try {
        const { plans, suggestedCurrency } = await ipc.invoke("get_plans");
        set({ plans, suggestedCurrency, error: null });
      } catch (e) {
        set({ error: toUiError(e) });
      }
    }

    function setView(view: LicenseView | null) {
      if (view) set({ view });
    }

    return {
      view: null,
      devices: null,
      plans: null,
      suggestedCurrency: null,
      checkout: null,
      order: null,
      error: null,
      busy: false,

      async init() {
        const offs = await Promise.all([
          ipc.listen("license://changed", (view) => set({ view })),
          ipc.listen("license://order", (order) => {
            // Kết quả của đơn khác đơn đang hiện (khách Hủy đơn A rồi tạo đơn B, kết quả muộn của A tới sau): bỏ, để câu
            // "không thành" của A không hiện trên đơn B. Chưa có đơn nào (đang đọc đơn chờ lúc mở app) thì giữ, xét lại bên dưới.
            const { checkout } = get();
            if (checkout !== null && order.order_code !== checkout.orderCode) return;
            set({ order });
          }),
        ]);
        const [view, checkout] = await Promise.all([ipc.invoke("get_license"), ipc.invoke("get_pending_order")]);
        setView(view);
        const { order } = get();
        set({ checkout, order: order !== null && order.order_code === checkout?.orderCode ? order : null });
        return () => offs.forEach((off) => off());
      },

      activate(key) {
        return run(async () => {
          const outcome = await ipc.invoke("activate_license", { key });
          setView(outcome.view);
          set({ devices: outcome.devices });
        });
      },

      activateAnyway(key) {
        return run(async () => {
          const outcome = await ipc.invoke("activate_license", { key, allowConflict: true });
          setView(outcome.view);
          set({ devices: outcome.devices });
        });
      },

      removeOtherMachine(activationId) {
        return run(async () => {
          await ipc.invoke("deactivate_other_device", { activationId });
          setView(await ipc.invoke("get_license"));
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

      // Không qua `run()`/`busy`: `busy` khóa và làm mờ các ô chọn gói và cách trả, mà tải bảng giá có thể mất tới 20 giây khi
      // mất mạng và bảng cũ đang hiện đúng. Lỗi vẫn hiện, như `run()`.
      loadPlans() {
        plansLoad ??= fetchPlans().finally(() => {
          plansLoad = null;
        });
        return plansLoad;
      },

      startCheckout(plan, email, consent, renew, currency) {
        return run(async () => {
          set({ checkout: await ipc.invoke("start_checkout", { plan, email, consent, renew, currency }), order: null });
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
