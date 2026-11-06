import { createStore } from "zustand/vanilla";

// Banner "Liên kết tài khoản Google" ở Màn hình chính (spec 2026-11-05-dang-nhap-google §6.3, L5): "Để sau" chỉ ẩn banner trong
// phiên làm việc này. Cờ nằm trong bộ nhớ, không lưu cài đặt hay đĩa; mở lại app thì banner hiện lại (máy vẫn chưa đăng nhập).
export interface LinkBannerState {
  dismissed: boolean;
  dismiss(): void;
}

export function createLinkBannerStore() {
  return createStore<LinkBannerState>()((set) => ({
    dismissed: false,
    dismiss() {
      set({ dismissed: true });
    },
  }));
}

export type LinkBannerStore = ReturnType<typeof createLinkBannerStore>;
