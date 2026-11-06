import type { AccountView } from "./ipc";

// Các bước lần đầu mở app (§4.1), tách khỏi Onboarding.tsx để test không cần DOM. "terms" (Điều khoản, spec 2026-10-06
// legal-in-app) đứng ngay sau chọn ngôn ngữ, để người dùng đồng ý trước khi tải model. "account" (đăng nhập Google, spec
// 2026-11-05-dang-nhap-google §6.3) ngay sau Điều khoản.
export type Step =
  | "language"
  | "terms"
  | "account"
  | "model"
  | "download"
  | "permission"
  | "languages"
  | "test"
  | "privacy"
  | "tray";

export function stepsFor(platform: "macos" | "windows"): Step[] {
  const steps: Step[] = ["language", "terms", "account", "model", "download", "permission", "languages", "test", "privacy", "tray"];
  return platform === "macos" ? steps : steps.filter((s) => s !== "permission");
}

/** Có cho bấm "Tiếp" ở bước này không: bước Điều khoản đòi đã tick đồng ý, bước Đăng nhập đòi `accountReady`. */
export function canAdvance(step: Step, termsAccepted: boolean, accountReady: boolean): boolean {
  if (step === "terms") return termsAccepted;
  if (step === "account") return accountReady;
  return true;
}

/**
 * Bước Đăng nhập cho đi tiếp không: đã đăng nhập, hay cổng đang mở (`gate` false: server tắt đăng nhập, máy có gói trả phí).
 * Chưa có câu trả lời đầu tiên thì chờ. `deferred`: người dùng đã bấm "Để sau". `loadFailed`: không đọc được trạng thái tài khoản (lệnh lỗi): không giam người dùng ở
 * các bước lần đầu mở; phía Rust vẫn tự chặn bắt đầu dịch (`loginRequired`) nếu cần.
 */
export function accountStepReady(view: AccountView | null, loadFailed: boolean, deferred = false): boolean {
  if (deferred) return true;
  if (view === null) return loadFailed;
  return view.state === "signedIn" || !view.gate;
}

/**
 * Có hiện nút "Để sau" ở bước Đăng nhập không: cổng đóng và chưa đăng nhập (không đang chờ trình duyệt). Người không đăng nhập
 * được (đã mua key trên máy mới, tài khoản Workspace bị chặn, không vào được Google, mất mạng) không bị giam ở onboarding; mua gói
 * và nhập key không cần đăng nhập (spec 2026-11-05 L5, §6.3). Cờ "Để sau" chỉ sống trong onboarding: sau đó cổng vẫn do
 * `gateBlocks` và phía Rust quyết định (Màn hình chính, Gõ dịch, Giọng đọc hiện màn đăng nhập; bắt đầu dịch bị từ chối).
 */
export function accountCanDefer(view: AccountView | null): boolean {
  return view !== null && view.gate && view.state === "anonymous";
}

/**
 * Việc chạy nền khi bấm "Tiếp" ở một bước. Qua Điều khoản: lưu lựa chọn báo cáo lỗi (spec 2026-10-17 §5). Đăng ký dùng thử
 * (`start_trial`) không còn ngay sau Điều khoản mà sau bước Đăng nhập: bước đó chỉ cho đi tiếp khi đã đăng nhập hay cổng mở.
 */
export function advanceEffects(step: Step): { saveReportsConsent: boolean; startTrial: boolean } {
  return { saveReportsConsent: step === "terms", startTrial: step === "account" };
}
