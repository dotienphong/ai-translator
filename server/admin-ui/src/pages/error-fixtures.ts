// Dữ liệu mẫu cho test của các trang Báo cáo lỗi: hình dạng khớp hợp đồng API (api/types.ts, kế hoạch bao-cao-loi-01).
import type { ErrorGroup, ErrorReport, ErrorReportDetail } from "../api/types";

export const NOW = Math.floor(Date.now() / 1000);
export const FP = "3fa1c09be2d47a55";
export const RID = "R-7F3K-92QD";
export const DEVICE = "a1".repeat(32);

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function report(over: Partial<ErrorReport> = {}): ErrorReport {
  return {
    id: RID,
    received_at: NOW - 3600,
    occurred_at: NOW - 3660,
    kind: "session_error",
    code: "sidecarFailed",
    fingerprint: FP,
    build: "release",
    app_version: "0.1.10",
    os_name: "macos",
    os_version: "15.6.1",
    arch: "aarch64",
    chip: "Apple M4 Pro",
    ram_mb: 24576,
    gpu_backend: "metal",
    model_pack: "standard",
    plan: "monthly",
    ui_lang: "vi",
    device_id_hash: DEVICE,
    message: "tiến trình phụ không khởi động được",
    ...over,
  };
}

export function detail(over: Partial<ErrorReportDetail> = {}): ErrorReportDetail {
  return {
    ...report(),
    logs: {
      app: "[2026-10-17][05:07:12][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr }\n",
      asr: "ggml_metal_init: error: failed to load\n",
      llama: "0.00.289.523 W load: special_eos_id is not in special_eog_ids\n",
    },
    ...over,
  };
}

export function group(over: Partial<ErrorGroup> = {}): ErrorGroup {
  return {
    fingerprint: FP,
    kind: "session_error",
    code: "sidecarFailed",
    reports: 9,
    devices: 4,
    release_reports: 8,
    debug_reports: 1,
    first_at: NOW - 5 * 86400,
    last_at: NOW - 600,
    versions: ["0.1.10", "0.1.9"],
    ...over,
  };
}
