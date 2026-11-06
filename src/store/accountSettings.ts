import { createStore } from "zustand/vanilla";
import type { AccountStore } from "./account";

// Luồng của Cài đặt › Tài khoản (spec 2026-11-05-dang-nhap-google §6.3, §5.5): đăng xuất, xóa tài khoản có bước xác nhận, liên kết
// (máy gói trả phí chưa đăng nhập). Việc gọi lệnh và lỗi nằm ở store tài khoản; store này chỉ giữ bước xác nhận và thao tác gần nhất
// của màn này (để chỉ hiện lỗi do chính màn này gây ra). Không có hàm nào ném hay để Promise bị từ chối (store tài khoản đã bảo đảm).
export type AccountAction = "signOut" | "delete" | "link";

export interface AccountSettingsState {
  confirming: boolean;
  action: AccountAction | null;
  askDelete(): void;
  cancelDelete(): void;
  signOut(): Promise<boolean>;
  confirmDelete(): Promise<boolean>;
  link(lang: string): Promise<boolean>;
}

/**
 * `sessionActive`: phiên dịch đang chạy hay đang bắt đầu. Đăng xuất chạy được cả lúc đang dịch (không gọi mạng); xóa và liên kết
 * thì không: app không gọi `/v1/account/*` hay `/v1/auth/*` lúc đang dịch (spec §6.2, A7), và lõi Rust cũng từ chối bằng `accountBusy`.
 */
export function createAccountSettingsStore(account: Pick<AccountStore, "getState">, sessionActive: () => boolean) {
  return createStore<AccountSettingsState>()((set, get) => {
    // Bắt đầu một thao tác: ghi nhận thao tác và bỏ lỗi cũ (của màn khác hay lần trước) để lỗi đang thấy là của lần này.
    function begin(action: AccountAction) {
      set({ action });
      account.getState().dismiss();
    }

    return {
      confirming: false,
      action: null,

      askDelete() {
        if (sessionActive()) return;
        set({ confirming: true });
      },

      cancelDelete() {
        set({ confirming: false });
      },

      signOut() {
        begin("signOut");
        return account.getState().signOut();
      },

      async confirmDelete() {
        if (!get().confirming) return false;
        // Đóng hộp ngay: bấm lần hai không gọi thêm; lỗi thì người dùng mở lại hộp để thử lại.
        set({ confirming: false });
        if (sessionActive()) return false;
        begin("delete");
        return account.getState().deleteAccount();
      },

      async link(lang) {
        if (sessionActive()) return false;
        begin("link");
        return account.getState().signIn(lang);
      },
    };
  });
}

export type AccountSettingsStore = ReturnType<typeof createAccountSettingsStore>;
