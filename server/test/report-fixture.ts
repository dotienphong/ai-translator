// Báo cáo lỗi mẫu hợp lệ cho test của server (dạng JSON app gửi, hợp đồng ở kế hoạch bao-cao-loi-01).
import { sha256Hex } from "../src/crypto";
import { type ErrorReport, parseReport } from "../src/error-reports";
import { T0 } from "./world";

/** Thân request hợp lệ; `overrides` ghi đè từng khóa cấp trên (không trộn sâu). */
export async function validReport(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return {
    v: 1,
    id: "R-7F3K-92QD",
    kind: "session_error",
    code: "sidecarFailed",
    fingerprint: "3fa1c09be2d47a55",
    at: T0 - 60,
    message: "tiến trình phụ không khởi động được",
    build: "release",
    app: { version: "0.1.10" },
    os: { name: "macos", version: "15.6.1", arch: "aarch64" },
    hw: { chip: "Apple M4 Pro", ram_mb: 24576, gpu_backend: "metal" },
    model_pack: "standard",
    plan: "monthly",
    ui_lang: "vi",
    device_id_hash: await sha256Hex("report-device-1"),
    logs: {
      app: "[2026-10-17][05:07:12][WARN][pipeline::supervisor] tiến trình phụ: Restarting { which: Asr }\n",
      asr: "ggml_metal_init: error: failed to load\n",
      llama: "0.00.289.523 W load: special_eos_id is not in special_eog_ids\n",
    },
    ...overrides,
  };
}

/** Như validReport nhưng đã qua parseReport, để dùng với insertReportStatements. */
export async function makeReport(overrides: Record<string, unknown> = {}): Promise<ErrorReport> {
  const parsed = parseReport(await validReport(overrides), T0);
  if (!parsed.ok) throw new Error(`validReport sai ở trường ${parsed.field}`);
  return parsed.report;
}
