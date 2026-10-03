import { useStore } from "zustand";
import { tauriIpc } from "../../lib/ipc";
import { type LicenseStoreState, createLicenseStore } from "../../store/license";

// Store bản quyền của cửa sổ chính, nối với lõi Rust thật. Nghe sự kiện từ lúc mở cửa sổ (`main.tsx`), để màn hình chính
// và thanh báo luôn có số phút còn lại.
export const licenseStore = createLicenseStore(tauriIpc);

export function useLicense<T>(selector: (state: LicenseStoreState) => T): T {
  return useStore(licenseStore, selector);
}
