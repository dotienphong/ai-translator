// Phần thuần của bộ điều khiển kiểm tra tự động hằng ngày (spec 2026-10-26-phan-biet-nguoi-noi §7.3; kế hoạch 06): đọc và kiểm cấu hình, dựng lịch nói,
// ghép tham số cho `speaker-canary run`, dựng file lịch tác vụ của launchd và Task Scheduler. Không chạm hệ điều hành (phần đó ở canary.mjs).

export const APPS = ["teams", "zoom", "meet_chrome", "meet_edge"];
export const DEFAULT_API = "https://api.aitranslator.vn";

/**
 * Lịch nói mặc định (spec 7.3: "2 khách nói lần lượt rồi nói chồng"), giây tính từ mốc 0: A, B, A, B lần lượt rồi hai khách nói chồng.
 * `guests`: đúng hai tên hiển thị của hai tài khoản thử trong cuộc họp.
 */
export function defaultSchedule(app, guests) {
  if (!APPS.includes(app)) throw new Error(`app không hợp lệ: ${app}`);
  if (!Array.isArray(guests) || guests.length !== 2 || guests.some((g) => typeof g !== "string" || g.trim() === "") || guests[0] === guests[1]) {
    throw new Error("cần đúng hai tên khách khác nhau");
  }
  const [a, b] = guests;
  const turn = (who, start_s, end_s) => ({ who, start_s, end_s });
  return { app, turns: [turn(a, 0, 6), turn(b, 8, 14), turn(a, 16, 22), turn(b, 24, 30), turn(a, 32, 40), turn(b, 34, 42)] };
}

/** Thời gian lịch kéo dài (giây): lượt cuối kết thúc, cộng phần đuôi để chỉ báo kịp tắt. */
export const scheduleSeconds = (schedule, tail = 8) => Math.ceil(Math.max(...schedule.turns.map((t) => t.end_s)) + tail);

const isPlainText = (v, max) => typeof v === "string" && v.length >= 1 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);

/**
 * Đọc và kiểm cấu hình (JSON, nằm NGOÀI repo; có tên hiển thị của tài khoản thử, không có mật khẩu). Trả cấu hình đã chuẩn hóa hay ném lỗi
 * nêu trường sai. Không bao giờ in nội dung cấu hình vào thông báo lỗi.
 */
export function parseConfig(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("cấu hình không phải JSON");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("cấu hình phải là một đối tượng JSON");
  const fail = (field) => {
    throw new Error(`cấu hình sai ở "${field}"`);
  };
  if (!isPlainText(raw.machine, 40) || !/^[A-Za-z0-9._-]+$/.test(raw.machine)) fail("machine");
  if (!isPlainText(raw.canaryBin, 400)) fail("canaryBin");
  if (!isPlainText(raw.logDir, 400)) fail("logDir");
  const api = raw.api ?? DEFAULT_API;
  if (!/^https:\/\/[^\s/?#]+$/.test(api) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(api)) fail("api");
  const leadSeconds = raw.leadSeconds ?? 20;
  if (!Number.isInteger(leadSeconds) || leadSeconds < 5 || leadSeconds > 300) fail("leadSeconds");
  if (raw.apps === null || typeof raw.apps !== "object" || Array.isArray(raw.apps)) fail("apps");
  const apps = {};
  for (const [name, a] of Object.entries(raw.apps)) {
    if (!APPS.includes(name)) fail(`apps.${name}`);
    if (a === null || typeof a !== "object") fail(`apps.${name}`);
    if (a.enabled !== undefined && typeof a.enabled !== "boolean") fail(`apps.${name}.enabled`);
    const guests = a.guests;
    if (!Array.isArray(guests) || guests.length !== 2 || !guests.every((g) => isPlainText(g, 80))) fail(`apps.${name}.guests`);
    if (a.adapter !== undefined && !isPlainText(a.adapter, 200)) fail(`apps.${name}.adapter`);
    // `recipe`: công thức thay bản build sẵn (để thử công thức ứng viên hay cố ý thử với công thức hỏng, Task 21 của kế hoạch 06).
    if (a.recipe !== undefined && !isPlainText(a.recipe, 400)) fail(`apps.${name}.recipe`);
    apps[name] = {
      enabled: a.enabled ?? true,
      guests: [...guests],
      adapter: a.adapter ?? `adapters/${name}.mjs`,
      recipe: a.recipe ?? null,
      options: a.options ?? {},
    };
  }
  return { machine: raw.machine, canaryBin: raw.canaryBin, logDir: raw.logDir, api, leadSeconds, apps };
}

/** Phiên bản hệ điều hành cho báo cáo (chuỗi gồm chữ số và dấu chấm): macOS theo `sw_vers`, Windows theo `os.release()`. */
export function osVersion(platform, { swVers, release }) {
  const text = platform === "darwin" ? swVers() : release();
  const clean = String(text ?? "").trim();
  return /^[0-9A-Za-z._+-]{1,40}$/.test(clean) ? clean : "unknown";
}

/** Đối số của `speaker-canary run`. */
export function canaryArgs({ cfg, scheduleFile, t0, seconds, resultFile, osVersion: osv, appVersion, recipe = null }) {
  return [
    "run",
    "--schedule", scheduleFile,
    "--t0-unix-ms", String(t0),
    "--seconds", String(seconds),
    "--machine", cfg.machine,
    "--os-version", osv,
    "--app-version", appVersion,
    "--api", cfg.api,
    "--out", resultFile,
  ].concat(recipe ? ["--recipe", recipe] : []);
}

const RESULT_KEYS = ["state", "meeting_app", "meeting_version", "recipe_version", "turns", "turns_ok", "judged", "wrong", "frames", "passes", "duration_ms"];

/**
 * Kết quả của `speaker-canary run --out` rút gọn theo danh sách khóa đã biết (khóa lạ bị bỏ: nơi tên người có thể lọt vào nhật ký).
 * Không phải đối tượng JSON thì coi như không có kết quả.
 */
export function pickResult(result) {
  if (result === null || typeof result !== "object" || Array.isArray(result)) return null;
  return Object.fromEntries(RESULT_KEYS.filter((k) => k in result).map((k) => [k, result[k]]));
}

/** Mã thoát 3 (chưa gửi được) và 4 (server từ chối) của `speaker-canary` được trả THAY mã 1, kể cả khi tình trạng chấm là hỏng. */
export const sendFailed = (exitCode) => exitCode === 3 || exitCode === 4;

/** Dòng nhật ký một lượt (JSON một dòng): không có tên khách. */
export function logLine({ app, at, exitCode, result, error }) {
  return JSON.stringify({ at: new Date(at).toISOString(), app, exit: exitCode, result: pickResult(result), error: error ?? null });
}

const pad = (n) => String(n).padStart(2, "0");

/** Giờ chạy hằng đêm của từng app: lệch nhau 10 phút để các lượt không chồng nhau. */
export function slots(startHour, startMinute, count, stepMinutes = 10) {
  return Array.from({ length: count }, (_, i) => {
    const total = startHour * 60 + startMinute + i * stepMinutes;
    return { hour: Math.floor(total / 60) % 24, minute: total % 60 };
  });
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** plist của launchd (macOS): chạy `node canary.mjs --app <app> --config <file>` hằng ngày lúc `hour:minute`. */
export function launchdPlist({ label, node, script, configPath, app, hour, minute, logDir }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(script)}</string>
    <string>--app</string>
    <string>${xml(app)}</string>
    <string>--config</string>
    <string>${xml(configPath)}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>StandardOutPath</key><string>${xml(logDir)}/${xml(app)}.out.log</string>
  <key>StandardErrorPath</key><string>${xml(logDir)}/${xml(app)}.err.log</string>
</dict>
</plist>
`;
}

/** Tác vụ của Task Scheduler (Windows), định dạng XML của `schtasks /Create /XML`: chạy hằng ngày lúc `hour:minute`, chỉ khi người dùng đã đăng nhập. */
export function taskXml({ node, script, configPath, app, hour, minute, startDate }) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>${xml(startDate)}T${pad(hour)}:${pad(minute)}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT20M</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xml(node)}</Command>
      <Arguments>${xml(`"${script}" --app ${app} --config "${configPath}"`)}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

/** Nội dung file `.xml` cho `schtasks /Create /XML`: `taskXml` khai `encoding="UTF-16"` nên phải ghi UTF-16LE có BOM (ghi UTF-8 sẽ bị báo "malformed"). */
export function taskXmlFile(opts) {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(taskXml(opts), "utf16le")]);
}
