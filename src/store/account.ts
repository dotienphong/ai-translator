import { createStore } from "zustand/vanilla";
import { isAccountView } from "../lib/account";
import type { AccountView, Ipc } from "../lib/ipc";
import { type UiError, toUiError } from "./app";

// Store tài khoản Google của cửa sổ chính (spec 2026-11-05-dang-nhap-google). Phía Rust giữ token và quyết định cổng; store chỉ
// giữ `AccountView` và lỗi gần nhất. Quy tắc cứng: không có hàm nào ném hay để Promise bị từ chối (tài khoản hỏng không được làm
// app sập hay ảnh hưởng tính năng cũ); `busy` luôn về false; dữ liệu sai hình dạng thì bỏ.

export interface AccountStoreState {
  view: AccountView | null;
  error: UiError | null;
  busy: boolean;
  // Idempotent: gọi lại khi đang nghe thì không đăng ký thêm. Trả hàm hủy đăng ký (gọi nhiều lần được).
  init(): Promise<() => void>;
  signIn(lang: string): Promise<boolean>;
  // Hủy lần đăng nhập đang chờ; `signIn` đang chờ sẽ kết thúc với `accountCancelled`.
  cancel(): Promise<void>;
  signOut(): Promise<boolean>;
  deleteAccount(): Promise<boolean>;
  dismiss(): void;
}

export function createAccountStore(ipc: Ipc) {
  return createStore<AccountStoreState>()((set, get) => {
    // Hàm hủy của lần `init` đang hoạt động, và lần `init` đang chạy dở.
    let active: (() => void) | null = null;
    let starting: Promise<() => void> | null = null;

    // `AccountView` không có số thứ tự, nên đếm cục bộ: tăng mỗi lần một view hợp lệ được nhận (sự kiện hay kết quả lệnh). Kết
    // quả của lệnh gọi trước khi một sự kiện tới là cũ hơn sự kiện đó, không được đè lên.
    let seq = 0;

    function accept(view: AccountView) {
      seq += 1;
      set({ view });
    }

    // Chạy một lệnh đổi trạng thái; lỗi thì vào `error`, thành công thì lỗi cũ mất. Đang bận thì bỏ lệnh. Người dùng tự hủy
    // (`accountCancelled`) không phải lỗi: không ghi, trả false. Kết quả sai hình dạng bị bỏ: trả false, không đụng `error`.
    async function run(call: () => Promise<unknown>): Promise<boolean> {
      if (get().busy) return false;
      set({ busy: true });
      const issuedAt = seq;
      try {
        const result = await call();
        if (!isAccountView(result)) return false;
        if (seq === issuedAt) accept(result);
        set({ error: null });
        return true;
      } catch (e) {
        const error = toUiError(e);
        set({ error: error.code === "accountCancelled" ? null : error });
        return false;
      } finally {
        set({ busy: false });
      }
    }

    async function start(): Promise<() => void> {
      let off: (() => void) | null = null;
      try {
        off = await ipc.listen("account://changed", (view) => {
          if (isAccountView(view)) accept(view);
        });
      } catch (e) {
        set({ error: toUiError(e) });
        return () => {};
      }
      const unlisten = off;
      let done = false;
      const dispose = () => {
        if (done) return;
        done = true;
        if (active === dispose) active = null;
        try {
          unlisten();
        } catch {
          // Hủy đăng ký hỏng: không có gì để làm thêm.
        }
      };
      active = dispose;
      const issuedAt = seq;
      try {
        const view = await ipc.invoke("get_account");
        // Sự kiện tới trong lúc chờ là mới hơn câu trả lời này.
        if (isAccountView(view) && seq === issuedAt) accept(view);
      } catch (e) {
        set({ error: toUiError(e) });
      }
      return dispose;
    }

    return {
      view: null,
      error: null,
      busy: false,

      async init() {
        if (active) return active;
        starting ??= start().finally(() => {
          starting = null;
        });
        return starting;
      },

      signIn(lang) {
        return run(() => ipc.invoke("account_sign_in", { lang }));
      },

      // Không qua `run()`/`busy`: phải gọi được đúng lúc `signIn` đang chờ.
      async cancel() {
        try {
          await ipc.invoke("account_cancel_sign_in");
        } catch (e) {
          set({ error: toUiError(e) });
        }
      },

      signOut() {
        return run(() => ipc.invoke("account_sign_out"));
      },

      deleteAccount() {
        return run(() => ipc.invoke("account_delete"));
      },

      dismiss() {
        set({ error: null });
      },
    };
  });
}

export type AccountStore = ReturnType<typeof createAccountStore>;
