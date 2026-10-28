// Báo cáo tình trạng bộ đọc tên mẫu cho test của server (dạng JSON app gửi, spec 2026-10-26-phan-biet-nguoi-noi §7.2).
import { env } from "cloudflare:workers";
import { sha256Hex } from "../src/crypto";
import { insertSpeakerHealthStatement, parseSpeakerHealth } from "../src/speaker-health";
import { T0 } from "./world";

/** Ngày UTC trước T0 (2026-10-01T00:00:00Z). */
export const DAY0 = "2026-09-30";
export const device = (n: number) => sha256Hex(`speaker-device-${n}`);

/** Thân request hợp lệ của báo cáo tình trạng; `overrides` ghi đè từng khóa cấp trên (không trộn sâu). */
export async function health(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return {
    v: 1,
    kind: "speaker_health",
    day: DAY0,
    canary: false,
    build: "release",
    app: { version: "0.3.2" },
    os: { name: "macos", version: "15.6.1", arch: "aarch64" },
    meeting: { app: "teams", version: "26032.1100" },
    recipe_version: 2,
    state: "ok",
    minutes: { ok: 40, total: 45 },
    learned: 0,
    patterns: [],
    device_id_hash: await device(1),
    ...overrides,
  };
}

/** Ghi thẳng một báo cáo (đã qua parse) với giờ nhận `at`. */
export async function seed(overrides: Record<string, unknown>, at = T0) {
  const parsed = parseSpeakerHealth(await health(overrides), T0);
  if (!parsed.ok) throw new Error(`báo cáo mẫu sai ở ${parsed.field}`);
  await insertSpeakerHealthStatement(env.DB, parsed.report, at).run();
}
