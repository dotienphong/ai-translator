import type { UiLanguage } from "../i18n";

// Kiểu dữ liệu của quản lý model (kế hoạch 04), khớp `src-tauri/src/models/service.rs` (`ModelsView`), `machine.rs`
// và `recommend.rs`; cùng các hàm thuần để hiển thị.

export interface Localized {
  vi: string;
  en: string;
}

export interface PackView {
  id: string;
  name: Localized;
  // Ghi chú chất lượng khi chọn gói (§8).
  note: Localized;
  bytes: number;
  // Mọi file đã có (có thể là bản cũ hơn manifest): dùng được.
  usable: boolean;
  // Mọi file đã có đúng bản trong manifest.
  complete: boolean;
  missingBytes: number;
  partialBytes: number;
  appTooOld: boolean;
  // Ổ còn đủ chỗ cho phần còn phải tải cộng 1 GB (§6.7).
  enoughSpace: boolean;
}

export interface Gpu {
  name: string;
  discrete: boolean;
  vramMib: number;
}

export interface Machine {
  os: "macos" | "windows";
  ramMib: number;
  avx2: boolean;
  gpus: Gpu[];
  // Windows: đã có kết quả dò GPU.
  gpuKnown: boolean;
}

export type Verdict = { kind: "recommend"; pack: string } | { kind: "unsupported"; reason: "lowRam" | "noAvx2" };

export type JobState = "idle" | "downloading" | "paused" | "failed" | "done";

export interface Job {
  state: JobState;
  pack: string | null;
  doneBytes: number;
  totalBytes: number;
  // Mã lỗi (`error.<mã>`) khi `state` là "failed".
  error: string | null;
  // Đang tải đè file của gói đang dùng (bản cập nhật).
  replacesInUse: boolean;
}

export interface ModelsView {
  rev: number;
  hasSource: boolean;
  checking: boolean;
  manifestError: string | null;
  sequence: number | null;
  packs: PackView[];
  machine: Machine;
  verdict: Verdict | null;
  freeDiskBytes: number | null;
  usedBytes: number;
  job: Job;
  updateAvailable: boolean;
}

// Dung lượng theo đơn vị thập phân như spec ("khoảng 2,5 GB"): GB từ 1 GB, MB từ 1 MB, còn lại KB. Tiếng Việt dùng
// dấu phẩy thập phân.
export function formatBytes(bytes: number, lang: UiLanguage): string {
  const [value, unit] =
    bytes >= 1e9 ? [bytes / 1e9, "GB"] : bytes >= 1e6 ? [bytes / 1e6, "MB"] : [Math.max(bytes, 0) / 1e3, "KB"];
  const digits = value >= 10 ? 0 : 1;
  const text = value.toFixed(digits).replace(/\.0$/, "");
  return `${lang === "vi" ? text.replace(".", ",") : text} ${unit}`;
}

export function localized(text: Localized, lang: UiLanguage): string {
  return text[lang];
}

export function packById(view: ModelsView | null, id: string | null): PackView | undefined {
  return id ? view?.packs.find((p) => p.id === id) : undefined;
}

// Gói được đề xuất cho máy này; máy chưa được hỗ trợ thì gói nhỏ nhất.
export function recommendedPack(view: ModelsView): string | null {
  const usable = view.packs.filter((p) => !p.appTooOld);
  const verdict = view.verdict;
  if (verdict?.kind === "recommend" && usable.some((p) => p.id === verdict.pack)) return verdict.pack;
  const smallest = [...usable].sort((a, b) => a.bytes - b.bytes)[0];
  return smallest?.id ?? null;
}

// Gói chọn sẵn ở bước 2: gói người dùng đã chọn, gói đang dùng, rồi gói được đề xuất.
export function defaultChoice(view: ModelsView, choice: string | null, current: string | null): string | null {
  for (const id of [choice, current]) if (packById(view, id)) return id;
  return recommendedPack(view);
}

// Số byte còn phải tải của gói (trừ phần đã tải dở).
export function remainingBytes(pack: PackView): number {
  return Math.max(0, pack.missingBytes - pack.partialBytes);
}

// Tiến độ 0–1 của việc tải.
export function progress(job: Job): number {
  if (job.totalBytes <= 0) return 0;
  return Math.min(1, Math.max(0, job.doneBytes / job.totalBytes));
}

// Việc tải đang dở của gói này (đang tải, tạm dừng hay lỗi).
export function jobFor(view: ModelsView, pack: string): Job | null {
  return view.job.pack === pack && view.job.state !== "idle" ? view.job : null;
}

export type DownloadBlock = "unsupported" | "appTooOld" | "noSpace";

// Lý do không tải được gói này (phía Rust cũng từ chối lệnh tải): máy chưa được hỗ trợ (chủ dự án quyết 2026-10-02),
// gói cần app mới hơn, ổ không đủ chỗ. `null` là tải được.
export function downloadBlock(view: ModelsView, pack: PackView): DownloadBlock | null {
  if (view.verdict?.kind === "unsupported") return "unsupported";
  if (pack.appTooOld) return "appTooOld";
  if (!pack.enoughSpace) return "noSpace";
  return null;
}

// Bước 3 của lần đầu mở: tự bắt đầu tải gói đã chọn khi gói chưa đủ, tải được, và không có việc tải nào đang chạy hay
// đang dừng giữa chừng của chính gói đó (người dùng đã bấm Tạm dừng thì không tự tải tiếp). Gói khác đang tạm dừng
// hay lỗi thì vẫn bắt đầu gói vừa chọn (N6 của review 04). `picked`: người dùng đã tự chọn gói. Chưa tự chọn mà
// Windows chưa dò xong GPU thì chờ: gói chọn sẵn lúc đó chưa tính card rời (N-12 của review 04 lần 2).
export function shouldAutoDownload(view: ModelsView, chosen: string | null, picked: boolean): boolean {
  const pack = packById(view, chosen);
  if (!pack || pack.complete || downloadBlock(view, pack)) return false;
  if (!picked && !view.machine.gpuKnown) return false;
  const job = view.job;
  if (job.state === "downloading") return false;
  return job.state === "idle" || job.state === "done" || job.pack !== pack.id;
}

// Bước 3: gói chọn sẵn chưa đủ, tải được, không có việc tải nào đang chạy hay đang dừng của chính gói đó (khung tiến độ
// đã có nút Tiếp tục), mà cũng không tự tải được (ví dụ Windows dò GPU quá giờ nên `gpuKnown` vẫn `false`): hiện nút
// "Tải về" để người dùng không kẹt ở bước này mà chưa có model (N-1 của review cuối 04).
export function needsManualDownload(view: ModelsView, chosen: string | null, picked: boolean): boolean {
  const pack = packById(view, chosen);
  if (!pack || pack.complete || downloadBlock(view, pack)) return false;
  const job = view.job;
  if (job.state === "downloading") return false;
  if (job.pack === pack.id && (job.state === "paused" || job.state === "failed")) return false;
  return !shouldAutoDownload(view, chosen, picked);
}

export type PackBadge = "recommended" | "inUse" | "installed" | "appTooOld";

// Nhãn cạnh tên gói: đề xuất cho máy này, đang dùng, đã tải, cần app mới hơn.
export function packBadges(view: ModelsView, pack: PackView, current: string | null): PackBadge[] {
  const badges: PackBadge[] = [];
  if (recommendedPack(view) === pack.id && view.verdict?.kind === "recommend") badges.push("recommended");
  if (pack.usable && pack.id === current) badges.push("inUse");
  else if (pack.usable) badges.push("installed");
  if (pack.appTooOld) badges.push("appTooOld");
  return badges;
}
