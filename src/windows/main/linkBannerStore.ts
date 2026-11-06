import { useStore } from "zustand";
import { createLinkBannerStore, type LinkBannerState } from "../../store/linkBanner";

// Cờ "Để sau" của banner liên kết trong phiên làm việc của cửa sổ chính: chỉ ở bộ nhớ (xem store/linkBanner.ts).
export const linkBannerStore = createLinkBannerStore();

export function useLinkBanner<T>(selector: (state: LinkBannerState) => T): T {
  return useStore(linkBannerStore, selector);
}
