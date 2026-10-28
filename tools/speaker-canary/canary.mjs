#!/usr/bin/env node
// Bộ điều khiển kiểm tra tự động hằng ngày (spec 2026-10-26-phan-biet-nguoi-noi §7.3; kế hoạch 06), chạy trên máy của chủ dự án (launchd, Task Scheduler):
//
//   node tools/speaker-canary/canary.mjs --app <teams|zoom|meet_chrome|meet_edge> --config <cấu hình.json> [--dry-run]
//
// Một lượt: dựng lịch nói cho hai khách, đặt mốc 0 sau `leadSeconds`, mở cuộc họp thử bằng bộ chuyển (`adapters/<app>.mjs`: chủ phòng là app thật,
// hai khách là trình duyệt tự động có micro giả là file giọng đọc), chạy `speaker-canary run` (bộ đọc thật chấm theo lịch rồi gửi `speaker_health` với
// `canary = true`), rồi LUÔN dọn cuộc họp. Không cần tài khoản hay dữ liệu thật của người dùng; mật khẩu không nằm trong repo hay trong cấu hình (hồ
// sơ trình duyệt đã đăng nhập sẵn). Mã thoát: của `speaker-canary` (0 ok, 1 hỏng, 2 lỗi chạy, 3 chưa gửi được, 4 bị từ chối; 3 và 4 che mã 1, nên tình trạng thật
// lấy từ file kết quả và ghi vào nhật ký), 5 khi bộ chuyển không mở được cuộc họp
// (hạ tầng thử hỏng, không phải app họp), 6 khi cấu hình sai.
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as os from "node:os";
import { APPS, canaryArgs, defaultSchedule, logLine, osVersion, parseConfig, scheduleSeconds, sendFailed } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Phiên bản AI Translator của repo này (`src-tauri/tauri.conf.json`), cho báo cáo. */
export const repoAppVersion = (root = resolve(HERE, "../..")) => JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version;

/** Bộ chuyển giả cho `--dry-run` và test: không mở gì. */
export const dryAdapter = { async open() { return { async stop() {} }; } };

/**
 * Một lượt kiểm tra. Mọi thứ ngoài (đồng hồ, chạy lệnh, bộ chuyển, thư mục tạm) đến qua `deps`, nên test chạy được bằng đồ giả.
 * Trả `{ exitCode, line }`.
 */
export async function runCanary({ app, cfg, deps }) {
  const { now, run, loadAdapter, tmp, append, keep, log, version, osv } = deps;
  const appCfg = cfg.apps[app];
  if (!appCfg || !appCfg.enabled) {
    log(`${app}: tắt trong cấu hình, bỏ qua`);
    return { exitCode: 0, line: null };
  }
  const schedule = defaultSchedule(app, appCfg.guests);
  const t0 = now() + cfg.leadSeconds * 1000;
  const seconds = cfg.leadSeconds + scheduleSeconds(schedule);
  const dir = tmp();
  const scheduleFile = join(dir, `lich-${app}.json`);
  const resultFile = join(dir, `ket-qua-${app}.json`);
  writeFileSync(scheduleFile, JSON.stringify(schedule));
  let handle = null;
  let exitCode;
  let result = null;
  let error = null;
  const day = () => new Date(now()).toISOString().slice(0, 10);
  let reportKept = null;
  try {
    try {
      handle = await (await loadAdapter(app, appCfg)).open({ options: appCfg.options, guests: appCfg.guests, t0, schedule, log });
    } catch (e) {
      error = `bộ chuyển không mở được cuộc họp: ${e.message}`;
      exitCode = 5;
    }
    if (exitCode === undefined) {
      const r = run(cfg.canaryBin, canaryArgs({ cfg, scheduleFile, t0, seconds, resultFile, osVersion: osv, appVersion: version, recipe: appCfg.recipe }));
      exitCode = r.status ?? 2;
      try {
        result = JSON.parse(readFileSync(resultFile, "utf8"));
      } catch {
        result = null;
      }
      // Gửi lỗi (mã 3, 4) thì `speaker-canary` trả mã đó thay cho mã 1 dù tình trạng chấm là hỏng: tình trạng nằm ở file kết quả (đã đọc ở trên, vào nhật ký).
      // Báo cáo đã dựng nằm trong thư mục tạm sắp xóa, nên giữ một bản (không có tên người) ở thư mục nhật ký để gửi lại bằng `speaker-canary send --report`.
      if (sendFailed(exitCode)) {
        try {
          reportKept = `${day()}-${app}.report.json`;
          keep(cfg.logDir, reportKept, resultFile.replace(/\.json$/, ".report.json"));
        } catch (e) {
          reportKept = null;
          log(`${app}: không giữ được báo cáo để gửi lại: ${e.message}`);
        }
        log(`${app}: gửi báo cáo lỗi (mã ${exitCode}), tình trạng chấm là ${result?.state ?? "không rõ"}${reportKept ? `; báo cáo giữ ở ${reportKept}` : ""}`);
      }
    }
  } finally {
    // Luôn dọn: đóng cuộc họp, xóa file lịch (có tên khách) và kết quả tạm.
    try {
      await handle?.stop();
    } catch (e) {
      log(`${app}: dọn cuộc họp lỗi: ${e.message}`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
  const line = logLine({ app, at: now(), exitCode, result, error });
  append(cfg.logDir, `${day()}-${app}.jsonl`, `${line}\n`);
  log(line);
  return { exitCode, line };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const app = opt("--app");
  const configPath = opt("--config") ?? process.env.SPEAKER_CANARY_CONFIG;
  if (!APPS.includes(app) || !configPath) {
    console.error("Dùng: node tools/speaker-canary/canary.mjs --app <teams|zoom|meet_chrome|meet_edge> --config <cấu hình.json> [--dry-run]");
    return 6;
  }
  let cfg;
  try {
    cfg = parseConfig(readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error(`LỖI: ${e.message}`);
    return 6;
  }
  const dry = args.includes("--dry-run");
  const deps = {
    now: () => Date.now(),
    run: (bin, a) => (dry ? { status: 0 } : spawnSync(bin, a, { stdio: ["ignore", "inherit", "inherit"] })),
    loadAdapter: async (name, appCfg) => (dry ? dryAdapter : import(pathToFileURL(resolve(HERE, appCfg.adapter)).href)),
    tmp: () => mkdtempSync(join(tmpdir(), "speaker-canary-")),
    append: (dir, file, text) => {
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, file), text);
    },
    keep: (dir, file, src) => {
      mkdirSync(dir, { recursive: true });
      copyFileSync(src, join(dir, file));
    },
    log: (m) => console.error(`speaker-canary: ${m}`),
    version: repoAppVersion(),
    osv: osVersion(process.platform, {
      swVers: () => spawnSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).stdout,
      release: () => os.release(),
    }),
  };
  return runCanary({ app, cfg, deps }).then((r) => r.exitCode);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  Promise.resolve(main()).then((code) => process.exit(code), (e) => {
    console.error(`LỖI: ${e.message}`);
    process.exit(2);
  });
}
