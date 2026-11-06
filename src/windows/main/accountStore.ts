import { useStore } from "zustand";
import { tauriIpc } from "../../lib/ipc";
import { type AccountStoreState, createAccountStore } from "../../store/account";

// Store tài khoản Google của cửa sổ chính, nối với lõi Rust thật (spec 2026-11-05-dang-nhap-google). Việc gọi `init()` lúc mở
// cửa sổ thuộc phần giao diện (Task 13).
export const accountStore = createAccountStore(tauriIpc);

export function useAccount<T>(selector: (state: AccountStoreState) => T): T {
  return useStore(accountStore, selector);
}
