// Test bộ điều khiển kiểm tra tự động (kế hoạch 06). Chạy: node --test tools/speaker-canary/
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dryAdapter, repoAppVersion, runCanary } from "./canary.mjs";
import { APPS, canaryArgs, defaultSchedule, launchdPlist, logLine, osVersion, parseConfig, scheduleSeconds, slots, taskXml } from "./lib.mjs";

const config = (over = {}) =>
  JSON.stringify({
    machine: "mac-chu-du-an",
    canaryBin: "/opt/speaker-canary/speaker-canary",
    logDir: "/var/log/speaker-canary",
    apps: { teams: { guests: ["Canary Khach A", "Canary Khach B"] }, meet_chrome: { guests: ["Canary Khach A", "Canary Khach B"], enabled: false } },
    ...over,
  });

test("lịch mặc định: hai khách lần lượt rồi nói chồng, hợp lệ cho mọi app", () => {
  for (const app of APPS) {
    const s = defaultSchedule(app, ["A", "B"]);
    assert.equal(s.turns.length, 6);
    assert.ok(s.turns.every((t) => t.end_s > t.start_s));
    // Hai lượt cuối chồng nhau.
    assert.ok(s.turns[5].start_s < s.turns[4].end_s);
    assert.equal(scheduleSeconds(s), 50);
  }
  assert.throws(() => defaultSchedule("webex", ["A", "B"]), /app không hợp lệ/);
  assert.throws(() => defaultSchedule("teams", ["A"]), /đúng hai tên/);
  assert.throws(() => defaultSchedule("teams", ["A", "A"]), /đúng hai tên/);
  assert.throws(() => defaultSchedule("teams", ["A", " "]), /đúng hai tên/);
});

test("parseConfig chuẩn hóa và nêu trường sai mà không in nội dung", () => {
  const cfg = parseConfig(config());
  assert.equal(cfg.leadSeconds, 20);
  assert.equal(cfg.api, "https://api.aitranslator.vn");
  assert.equal(cfg.apps.teams.enabled, true);
  assert.equal(cfg.apps.teams.adapter, "adapters/teams.mjs");
  assert.equal(cfg.apps.meet_chrome.enabled, false);
  assert.equal(cfg.apps.teams.recipe, null);
  const bad = (over, field) => assert.throws(() => parseConfig(config(over)), (e) => e.message === `cấu hình sai ở "${field}"`, field);
  bad({ machine: "máy có dấu" }, "machine");
  bad({ canaryBin: "" }, "canaryBin");
  bad({ api: "http://api.example.com" }, "api");
  bad({ leadSeconds: 1 }, "leadSeconds");
  bad({ apps: { webex: { guests: ["A", "B"] } } }, "apps.webex");
  bad({ apps: { teams: { guests: ["A"] } } }, "apps.teams.guests");
  bad({ apps: { teams: { guests: ["A", "B"], recipe: "" } } }, "apps.teams.recipe");
  assert.throws(() => parseConfig("{"), /không phải JSON/);
  assert.throws(() => parseConfig("[]"), /đối tượng/);
  assert.doesNotThrow(() => parseConfig(config({ api: "http://127.0.0.1:8787" })));
  assert.throws(() => parseConfig(config({ machine: "bí-mật" })), (e) => !e.message.includes("bí-mật"));
});

test("osVersion chỉ nhận chuỗi an toàn", () => {
  assert.equal(osVersion("darwin", { swVers: () => "15.6.1\n", release: () => "24.6.0" }), "15.6.1");
  assert.equal(osVersion("win32", { swVers: () => "", release: () => "10.0.26100" }), "10.0.26100");
  assert.equal(osVersion("darwin", { swVers: () => "/usr/local", release: () => "" }), "unknown");
  assert.equal(osVersion("darwin", { swVers: () => undefined, release: () => "" }), "unknown");
});

test("slots lệch nhau 10 phút và quay vòng qua nửa đêm", () => {
  assert.deepEqual(slots(2, 0, 4), [{ hour: 2, minute: 0 }, { hour: 2, minute: 10 }, { hour: 2, minute: 20 }, { hour: 2, minute: 30 }]);
  assert.deepEqual(slots(23, 50, 2), [{ hour: 23, minute: 50 }, { hour: 0, minute: 0 }]);
});

test("file lịch tác vụ có đủ phần cần và thoát ký tự XML", () => {
  const plist = launchdPlist({ label: "vn.aitranslator.speaker-canary.teams", node: "/usr/local/bin/node", script: "/repo/tools/speaker-canary/canary.mjs", configPath: "/cfg/a&b.json", app: "teams", hour: 2, minute: 10, logDir: "/logs" });
  assert.match(plist, /<key>Label<\/key><string>vn\.aitranslator\.speaker-canary\.teams<\/string>/);
  assert.match(plist, /<string>--config<\/string>\s*<string>\/cfg\/a&amp;b\.json<\/string>/);
  assert.match(plist, /<key>Hour<\/key><integer>2<\/integer><key>Minute<\/key><integer>10<\/integer>/);
  assert.ok(!plist.includes("password") && !plist.includes("Password"));
  const task = taskXml({ node: "C:\\Program Files\\nodejs\\node.exe", script: "C:\\repo\\tools\\speaker-canary\\canary.mjs", configPath: "C:\\cfg\\canary.json", app: "meet_edge", hour: 2, minute: 30, startDate: "2026-11-01" });
  assert.match(task, /<StartBoundary>2026-11-01T02:30:00<\/StartBoundary>/);
  assert.match(task, /--app meet_edge --config &quot;C:\\cfg\\canary\.json&quot;/);
  assert.match(task, /<LogonType>InteractiveToken<\/LogonType>/);
  assert.match(task, /<RunLevel>LeastPrivilege<\/RunLevel>/);
});

test("logLine không có tên khách", () => {
  const line = logLine({ app: "teams", at: Date.UTC(2026, 9, 27), exitCode: 1, result: { state: "no_names", turns: 6 } });
  assert.deepEqual(JSON.parse(line), { at: "2026-10-27T00:00:00.000Z", app: "teams", exit: 1, result: { state: "no_names", turns: 6 }, error: null });
});

test("phiên bản app lấy từ tauri.conf.json của repo", () => {
  assert.match(repoAppVersion(), /^\d+\.\d+\.\d+$/);
});

/** Bàn làm việc giả: đồng hồ cố định, `run` ghi lại lệnh và ghi file kết quả như `speaker-canary` thật. */
function bench(t, { adapter = dryAdapter, exit = 0, result = { state: "ok", turns: 6, turns_ok: 6 }, writeResult = true } = {}) {
  const logDir = mkdtempSync(join(tmpdir(), "mt-canary-log-"));
  const tmpRoot = mkdtempSync(join(tmpdir(), "mt-canary-tmp-"));
  t.after(() => {
    rmSync(logDir, { recursive: true, force: true });
    rmSync(tmpRoot, { recursive: true, force: true });
  });
  const state = { runs: [], lines: [], files: {}, scheduleDuringRun: null };
  const deps = {
    now: () => Date.UTC(2026, 9, 27, 2, 10, 0),
    run: (bin, args) => {
      state.runs.push({ bin, args });
      const at = (name) => args[args.indexOf(name) + 1];
      state.scheduleDuringRun = JSON.parse(readFileSync(at("--schedule"), "utf8"));
      if (writeResult) {
        writeFileSync(at("--out"), JSON.stringify(result));
        // `speaker-canary run` ghi báo cáo đã dựng ở <kết quả>.report.json TRƯỚC khi gửi.
        writeFileSync(at("--out").replace(/\.json$/, ".report.json"), JSON.stringify({ kind: "speaker_health" }));
      }
      return { status: exit };
    },
    loadAdapter: async () => adapter,
    tmp: () => mkdtempSync(join(tmpRoot, "run-")),
    append: (dir, file, text) => {
      state.files[file] = (state.files[file] ?? "") + text;
    },
    keep: (dir, file, src) => {
      state.files[file] = readFileSync(src, "utf8");
    },
    log: (m) => state.lines.push(m),
    version: "0.3.2",
    osv: "15.6.1",
  };
  return { deps, state, tmpRoot, logDir };
}

test("một lượt: lịch và kết quả tạm bị xóa, nhật ký không có tên khách, mã thoát của speaker-canary", async (t) => {
  const b = bench(t, { exit: 1, result: { state: "no_names", turns: 6, turns_ok: 0 } });
  const cfg = parseConfig(config());
  const { exitCode, line } = await runCanary({ app: "teams", cfg, deps: b.deps });
  assert.equal(exitCode, 1);
  const run = b.state.runs[0];
  assert.equal(run.bin, "/opt/speaker-canary/speaker-canary");
  assert.deepEqual(run.args.slice(0, 1), ["run"]);
  const arg = (name) => run.args[run.args.indexOf(name) + 1];
  assert.equal(arg("--t0-unix-ms"), String(Date.UTC(2026, 9, 27, 2, 10, 0) + 20_000));
  assert.equal(arg("--seconds"), "70");
  assert.equal(arg("--machine"), "mac-chu-du-an");
  assert.equal(arg("--os-version"), "15.6.1");
  assert.equal(arg("--app-version"), "0.3.2");
  assert.equal(b.state.scheduleDuringRun.turns[0].who, "Canary Khach A", "lịch có tên khách lúc chạy");
  assert.deepEqual(readdirSync(b.tmpRoot), [], "thư mục tạm đã xóa");
  const logged = b.state.files["2026-10-27-teams.jsonl"];
  assert.ok(!logged.includes("Canary Khach") && !b.state.lines.join("\n").includes("Canary Khach"));
  assert.deepEqual(JSON.parse(logged).result, { state: "no_names", turns: 6, turns_ok: 0 });
  assert.equal(JSON.parse(line).exit, 1);
});

test("bộ chuyển không mở được cuộc họp: mã 5, không chạy speaker-canary, vẫn dọn", async (t) => {
  const b = bench(t, {
    adapter: {
      async open() {
        throw new Error("Chrome chưa đăng nhập");
      },
    },
  });
  const { exitCode } = await runCanary({ app: "teams", cfg: parseConfig(config()), deps: b.deps });
  assert.equal(exitCode, 5);
  assert.equal(b.state.runs.length, 0);
  assert.match(b.state.files["2026-10-27-teams.jsonl"], /bộ chuyển không mở được cuộc họp: Chrome chưa đăng nhập/);
  assert.deepEqual(readdirSync(b.tmpRoot), []);
});

test("luôn đóng cuộc họp (stop) dù speaker-canary lỗi, và lỗi khi dọn không làm hỏng kết quả", async (t) => {
  const calls = [];
  const adapter = {
    async open({ t0, schedule }) {
      calls.push(["open", t0, schedule.turns.length]);
      return {
        async stop() {
          calls.push(["stop"]);
          throw new Error("không đóng được");
        },
      };
    },
  };
  const b = bench(t, { adapter, exit: 2, writeResult: false });
  const { exitCode } = await runCanary({ app: "teams", cfg: parseConfig(config()), deps: b.deps });
  assert.equal(exitCode, 2);
  assert.deepEqual(calls.map((c) => c[0]), ["open", "stop"]);
  assert.equal(calls[0][2], 6);
  assert.ok(b.state.lines.some((l) => l.includes("dọn cuộc họp lỗi")));
  assert.equal(JSON.parse(b.state.files["2026-10-27-teams.jsonl"]).result, null);
});

test("app tắt trong cấu hình thì không làm gì", async (t) => {
  const b = bench(t);
  const { exitCode, line } = await runCanary({ app: "meet_chrome", cfg: parseConfig(config()), deps: b.deps });
  assert.deepEqual([exitCode, line, b.state.runs.length], [0, null, 0]);
  assert.equal((await runCanary({ app: "zoom", cfg: parseConfig(config()), deps: b.deps })).exitCode, 0, "không khai báo thì cũng bỏ qua");
});

test("công thức thay thế của app (nếu có) được truyền cho speaker-canary", async (t) => {
  const b = bench(t);
  const text = config({ apps: { teams: { guests: ["Canary Khach A", "Canary Khach B"], recipe: "/cfg/recipe-hong.json" } } });
  await runCanary({ app: "teams", cfg: parseConfig(text), deps: b.deps });
  const args = b.state.runs[0].args;
  assert.equal(args[args.indexOf("--recipe") + 1], "/cfg/recipe-hong.json");
  const plain = bench(t);
  await runCanary({ app: "teams", cfg: parseConfig(config()), deps: plain.deps });
  assert.ok(!plain.state.runs[0].args.includes("--recipe"));
});

test("canaryArgs có đủ tham số", () => {
  const cfg = parseConfig(config());
  assert.deepEqual(canaryArgs({ cfg, scheduleFile: "/t/l.json", t0: 5, seconds: 70, resultFile: "/t/r.json", osVersion: "15", appVersion: "0.3.2" }), [
    "run", "--schedule", "/t/l.json", "--t0-unix-ms", "5", "--seconds", "70", "--machine", "mac-chu-du-an", "--os-version", "15", "--app-version", "0.3.2",
    "--api", "https://api.aitranslator.vn", "--out", "/t/r.json",
  ]);
  assert.ok(!existsSync("/t/l.json"));
});

test("cấu hình mẫu trong repo hợp lệ và không có bí mật", () => {
  const text = readFileSync(new URL("./templates/canary.example.json", import.meta.url), "utf8");
  const cfg = parseConfig(text);
  assert.deepEqual(Object.keys(cfg.apps), ["teams", "meet_chrome"]);
  assert.ok(!/password|secret|token|mật khẩu/i.test(text));
  assert.ok(!text.includes("/Use" + "rs/"), "không có đường dẫn cá nhân");
});

test("gửi lỗi (mã 3, 4) che mã 1: bộ điều khiển vẫn đọc state từ file kết quả và giữ báo cáo để gửi lại", async (t) => {
  for (const exit of [3, 4]) {
    const b = bench(t, { exit, result: { state: "no_names", turns: 6, turns_ok: 0 } });
    const { exitCode, line } = await runCanary({ app: "teams", cfg: parseConfig(config()), deps: b.deps });
    assert.equal(exitCode, exit, "mã thoát của speaker-canary được giữ");
    assert.equal(JSON.parse(line).result.state, "no_names", "nhật ký có tình trạng thật dù gửi lỗi");
    assert.equal(b.state.files["2026-10-27-teams.report.json"], JSON.stringify({ kind: "speaker_health" }), "báo cáo được giữ ở thư mục nhật ký");
    assert.ok(b.state.lines.some((l) => l.includes("no_names") && l.includes("2026-10-27-teams.report.json")), "cảnh báo trên stderr nêu tình trạng và file báo cáo");
    assert.deepEqual(readdirSync(b.tmpRoot), [], "thư mục tạm vẫn xóa");
  }
});

test("gửi được thì không giữ báo cáo, mã 2 (không có file kết quả) thì không có gì để giữ", async (t) => {
  const ok = bench(t);
  await runCanary({ app: "teams", cfg: parseConfig(config()), deps: ok.deps });
  assert.deepEqual(Object.keys(ok.state.files), ["2026-10-27-teams.jsonl"]);
  const failed = bench(t, { exit: 2, writeResult: false });
  await runCanary({ app: "teams", cfg: parseConfig(config()), deps: failed.deps });
  assert.deepEqual(Object.keys(failed.state.files), ["2026-10-27-teams.jsonl"]);
});

test("nhật ký chỉ giữ các khóa kết quả đã biết, khóa lạ (có thể mang tên) bị bỏ", async (t) => {
  const b = bench(t, { result: { state: "ok", turns: 6, turns_ok: 6, judged: 10, wrong: 0, frames: 90, passes: 80, duration_ms: 70000, meeting_app: "teams", meeting_version: "1.2.3", recipe_version: 4, who: "Canary Khach A" } });
  await runCanary({ app: "teams", cfg: parseConfig(config()), deps: b.deps });
  const logged = JSON.parse(b.state.files["2026-10-27-teams.jsonl"]);
  assert.equal(logged.result.who, undefined);
  assert.equal(logged.result.meeting_version, "1.2.3");
  assert.ok(!b.state.files["2026-10-27-teams.jsonl"].includes("Canary Khach"));
});

test("kết quả không phải đối tượng JSON thì coi như không có", async (t) => {
  const b = bench(t, { result: ["state"] });
  await runCanary({ app: "teams", cfg: parseConfig(config()), deps: b.deps });
  assert.equal(JSON.parse(b.state.files["2026-10-27-teams.jsonl"]).result, null);
});
