// Các bước lần đầu mở app (§4.1), tách khỏi Onboarding.tsx để test không cần DOM. "terms" (Điều khoản, spec 2026-10-06
// legal-in-app) đứng ngay sau chọn ngôn ngữ, để người dùng đồng ý trước khi tải model.
export type Step = "language" | "terms" | "model" | "download" | "permission" | "languages" | "test" | "privacy" | "tray";

export function stepsFor(platform: "macos" | "windows"): Step[] {
  const steps: Step[] = ["language", "terms", "model", "download", "permission", "languages", "test", "privacy", "tray"];
  return platform === "macos" ? steps : steps.filter((s) => s !== "permission");
}

/** Có cho bấm "Tiếp" ở bước này không: bước Điều khoản đòi đã tick đồng ý. */
export function canAdvance(step: Step, termsAccepted: boolean): boolean {
  return step !== "terms" || termsAccepted;
}
