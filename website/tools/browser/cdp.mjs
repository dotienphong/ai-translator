// Điều khiển Chrome không đầu qua Chrome DevTools Protocol, không thêm thư viện (Node có WebSocket sẵn). Dùng cho test hành vi
// thật của trang (nhận diện hệ điều hành, tab, bàn phím, sao chép) và để chụp ảnh kiểm giao diện ở nhiều cỡ màn hình.
//   const b = await launch(); const p = await b.newPage({ width: 390, height: 800, mobile: true, ua: "...", dark: true });
//   await p.goto("http://127.0.0.1:4173/tai-xuong/"); await p.eval("document.title"); await p.screenshot("a.png", { full: true }); await b.close();
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_PATHS = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

export const findChrome = () => CHROME_PATHS.find((p) => existsSync(p)) ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.waiters = [];
    this.handlers = [];
    // Chrome chết hay trang bị đóng giữa chừng: báo lỗi ngay cho mọi lệnh đang chờ thay vì treo tới hết giờ của test
    ws.addEventListener("close", () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new Error("mất kết nối tới Chrome (WebSocket đã đóng)"));
      this.pending.clear();
      for (const w of this.waiters) w(null); // null: phiên đã đóng
      this.waiters = [];
    });
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(`${m.error.message}`)) : resolve(m.result);
      } else if (m.method) {
        this.waiters = this.waiters.filter((w) => !w(m));
        for (const h of this.handlers) {
          // Handler async của người gọi (ví dụ trả lời Fetch.requestPaused) có thể gửi lệnh sau khi trang đã đóng: lỗi đó bỏ qua,
          // còn lỗi lúc phiên vẫn mở thì để lộ như trước
          h(m)?.catch?.((err) => { if (!this.closed) throw err; });
        }
      }
    });
  }
  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error(`mất kết nối tới Chrome, không gửi được ${method}`));
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  once(method, ms = 15000) {
    if (this.closed) return Promise.reject(new Error(`mất kết nối tới Chrome, không chờ được ${method}`));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`hết giờ chờ ${method}`)), ms);
      this.waiters.push((m) => {
        if (m === null) return clearTimeout(t), reject(new Error(`mất kết nối tới Chrome khi đang chờ ${method}`)), true;
        return m.method === method ? (clearTimeout(t), resolve(m.params), true) : false;
      });
    });
  }
}

// Chạy trong trang (đồng bộ): toạ độ điểm giữa phần tử và điểm đó có trúng chính phần tử (hay con của nó) không.
const point = (e) => {
  const r = e.getBoundingClientRect();
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  const at = document.elementFromPoint(x, y);
  return { x, y, hit: Boolean(at && (at === e || e.contains(at))) };
};

// Chạy trong trang: cuộn phần tử vào giữa, chờ tới khi vị trí cuộn không đổi và điểm giữa cũ vẫn nằm trong hộp mới suốt 3 khung
// hình liền nhau (nút "đập nhịp" phóng to thu nhỏ tại chỗ vẫn coi là đứng yên), tối đa 2,5 s; trả kết quả của point().
const settle = async (sel, point) => {
  const e = document.querySelector(sel);
  if (!e) return null;
  const frame = () => new Promise((r) => { const t = setTimeout(r, 100); requestAnimationFrame(() => { clearTimeout(t); r(); }); }); // trang nền không có rAF
  const look = () => { const r = e.getBoundingClientRect(); return { r, x: r.x + r.width / 2, y: r.y + r.height / 2, sx: scrollX, sy: scrollY }; };
  const end = performance.now() + 2500;
  e.scrollIntoView({ block: "center", behavior: "instant" });
  let prev = look(), still = 0, rescroll = 2;
  while (still < 3 && performance.now() < end) {
    await frame();
    const cur = look();
    const same = cur.sx === prev.sx && cur.sy === prev.sy && prev.x >= cur.r.left && prev.x <= cur.r.right && prev.y >= cur.r.top && prev.y <= cur.r.bottom;
    still = same ? still + 1 : 0;
    prev = cur;
    // Đứng yên nhưng đã bị cuộn ra khỏi khung nhìn (một lần cuộn khác chạy sau lúc ta cuộn): cuộn lại rồi chờ tiếp
    if (still >= 3 && rescroll > 0 && (cur.x < 0 || cur.y < 0 || cur.x >= innerWidth || cur.y >= innerHeight)) {
      rescroll--;
      e.scrollIntoView({ block: "center", behavior: "instant" });
      still = 0;
      prev = look();
    }
  }
  return point(e);
};

class Page {
  constructor(session, targetId, browser, opts) {
    this.errors = []; // lỗi JS chưa bắt, lỗi ghi ra console, vi phạm CSP
    session.handlers.push((m) => {
      if (m.method === "Runtime.exceptionThrown") this.errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === "Log.entryAdded" && m.params.entry.level === "error") this.errors.push(`${m.params.entry.source}: ${m.params.entry.text}`);
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") this.errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    });
    this.s = session;
    this.targetId = targetId;
    this.browser = browser;
    this.opts = opts;
  }
  /** Tắt hay bật JavaScript của trang (kiểm bản hoạt động không cần JS). */
  async setJS(enabled) {
    await this.s.send("Emulation.setScriptExecutionDisabled", { value: !enabled });
    this.jsOff = !enabled;
  }
  async goto(url) {
    const loaded = this.s.once("Page.loadEventFired");
    loaded.catch(() => {}); // navigate lỗi thì lỗi đó được ném ra; lời chờ load bị bỏ dở không được thành lỗi không ai bắt
    await this.s.send("Page.navigate", { url });
    await loaded;
    await sleep(250); // cho site.js (defer) chạy xong
  }
  async eval(expression) {
    const r = await this.s.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async click(selector) {
    // Trang có thể còn đang cuộn mượt (neo #, scrollIntoView trong rAF) khi goto() trả về: đo hộp một lần thì toạ độ gửi đi
    // có thể lệch và cú bấm trượt. Chờ hộp đứng yên rồi kiểm điểm giữa đúng là phần tử; trượt thì đo lại vài lần.
    // Trang không phải tab trước nhất thì rAF dừng và timer chậm lại: đưa lên trước để việc chờ không mất vài giây.
    await this.s.send("Page.bringToFront").catch(() => {});
    const sel = JSON.stringify(selector);
    // Đo một lần, đồng bộ (như click() cũ): dùng khi JS bị tắt, vì khi đó rAF và setTimeout trong trang không chạy
    const once = `(() => { const e = document.querySelector(${sel}); if (!e) return null; e.scrollIntoView({block:"center", behavior:"instant"}); return (${point})(e); })()`;
    const deadline = Date.now() + 3000;
    let box;
    for (let i = 0; !this.jsOff; i++) {
      let t;
      const late = new Promise((r) => { t = setTimeout(() => r(undefined), Math.max(0, deadline - Date.now()) + 500); });
      box = await Promise.race([this.eval(`(${settle})(${sel}, ${point})`), late]).finally(() => clearTimeout(t));
      if (box === undefined) break; // phần chờ trong trang không trả về (timer không chạy): rơi về đo một lần
      if (!box) throw new Error(`không thấy ${selector}`);
      if (box.hit || i >= 4 || Date.now() > deadline) break; // vẫn trượt (bị che, pointer-events: none…): bấm như cũ
      await sleep(50);
    }
    if (box === undefined) box = await this.eval(once);
    if (!box) throw new Error(`không thấy ${selector}`);
    for (const type of ["mousePressed", "mouseReleased"]) await this.s.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
    await sleep(120);
  }
  async focus(selector) {
    await this.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  }
  async press(key) {
    const codes = { ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35, Enter: 13, Tab: 9, " ": 32 };
    const k = { key, code: key, windowsVirtualKeyCode: codes[key] ?? key.toUpperCase().charCodeAt(0) };
    await this.s.send("Input.dispatchKeyEvent", { type: "keyDown", ...k });
    await this.s.send("Input.dispatchKeyEvent", { type: "keyUp", ...k });
    await sleep(120);
  }
  async screenshot(file, { full = false, clipSelector } = {}) {
    let clip;
    if (clipSelector) {
      const r = await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(clipSelector)}); const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`);
      clip = { ...r, scale: 1 };
    }
    const r = await this.s.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full || Boolean(clip), ...(clip ? { clip } : {}) });
    writeFileSync(file, Buffer.from(r.data, "base64"));
  }
  async close() {
    this.s.ws.close();
    await fetch(`http://127.0.0.1:${this.browser.port}/json/close/${this.targetId}`).catch(() => {});
  }
}

// Cổng này có trình duyệt nào đang trả lời /json/version không (mỗi lần hỏi tối đa 1 s)
const answers = (port) => fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) }).then(async (r) => (await r.body?.cancel(), r.ok), () => false);

/**
 * Mở một Chrome không đầu riêng. Mặc định để Chrome tự chọn cổng trống (--remote-debugging-port=0) rồi đọc cổng thật từ tệp
 * DevToolsActivePort trong thư mục hồ sơ: chọn cổng ngẫu nhiên thì hai tiến trình có thể trùng cổng và một bên âm thầm dùng
 * chung Chrome của bên kia (bên kia đóng là trang của mình chết). Truyền `port` thì dùng đúng cổng đó, nhưng nếu cổng đang có
 * Chrome khác trả lời thì báo lỗi. Chrome thoát sớm hay quá `timeout` ms chưa sẵn sàng: báo lỗi và dọn sạch.
 */
export async function launch({ port, timeout = 10000 } = {}) {
  const chrome = findChrome();
  if (!chrome) return null;
  // Cổng truyền tay đã có ai trả lời thì báo ngay, khỏi mở Chrome rồi chờ hết hạn
  if (port && (await answers(port))) throw new Error(`không mở được Chrome điều khiển: cổng ${port} đang bị một Chrome khác chiếm`);
  const dir = mkdtempSync(join(tmpdir(), "cdp-"));
  const proc = spawn(chrome, [`--remote-debugging-port=${port ?? 0}`, `--user-data-dir=${dir}`, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr = (stderr + d).slice(-2000); });
  let exited = null;
  const how = () => exited.error?.message ?? `mã ${exited.code}, tín hiệu ${exited.signal}`;
  const gone = new Promise((r) => proc.once("exit", (code, signal) => { exited = { code, signal }; r(); }));
  proc.once("error", (e) => { exited ??= { error: e }; });
  const waitGone = (ms) => { let t; return Promise.race([gone, new Promise((r) => { t = setTimeout(r, ms); })]).finally(() => clearTimeout(t)); };
  let stopping = null;
  const stop = () => (stopping ??= (async () => {
    if (!exited) {
      proc.kill();
      await waitGone(3000);
      if (!exited) { proc.kill("SIGKILL"); await waitGone(2000); }
    }
    proc.stderr.destroy();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); // xoá sau khi Chrome đã thoát hẳn, không còn ai ghi vào
  })());
  const fail = async (why) => {
    await stop();
    const tail = stderr.trim().split("\n").slice(-5).join("\n");
    throw Object.assign(new Error(`không mở được Chrome điều khiển (${chrome}): ${why}${tail ? `\n${tail}` : ""}`), { dir });
  };

  // Chờ Chrome ghi DevToolsActivePort: dòng 1 là cổng, dòng 2 là đường dẫn WebSocket của chính trình duyệt này
  const file = join(dir, "DevToolsActivePort");
  const end = Date.now() + timeout;
  let active = null;
  while (!active) {
    if (exited) return fail(`Chrome thoát sớm (${how()})`);
    if (Date.now() > end) {
      // Cổng truyền tay đã có Chrome khác giữ thì Chrome này lặng lẽ lùi sang [::1] và không ghi tệp: nói rõ lý do
      const taken = port && (await answers(port));
      return fail(taken ? `cổng ${port} đang bị một Chrome khác chiếm` : `quá ${timeout} ms chưa thấy ${file}`);
    }
    try {
      const [p, path] = readFileSync(file, "utf8").split("\n").map((s) => s.trim());
      if (/^\d+$/.test(p) && Number(p) > 0 && path) active = { port: Number(p), path };
    } catch { /* chưa có tệp */ }
    if (!active) await sleep(50);
  }
  // Hỏi lại qua HTTP: cổng phải do chính Chrome này trả lời (cổng truyền tay có thể đang bị Chrome khác chiếm)
  let version = null;
  while (!version) {
    if (exited) return fail(`Chrome thoát sớm (${how()})`);
    if (Date.now() > end) return fail(`quá ${timeout} ms cổng ${active.port} chưa trả lời`);
    try {
      const r = await fetch(`http://127.0.0.1:${active.port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) version = await r.json();
    } catch { /* chưa lên */ }
    if (!version) await sleep(50);
  }
  if (!version.webSocketDebuggerUrl?.endsWith(active.path)) return fail(`cổng ${active.port} đang bị một Chrome khác chiếm`);

  const browser = { port: active.port, proc, dir };
  browser.newPage = async ({ width = 1280, height = 900, mobile = false, ua, dark = false, reduceMotion = false, dpr = 1, touch } = {}) => {
    const t = await (await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
    const s = new Session(ws);
    await s.send("Page.enable");
    await s.send("Runtime.enable");
    await s.send("Log.enable");
    await s.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
    if (touch ?? mobile) await s.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    if (ua) await s.send("Emulation.setUserAgentOverride", { userAgent: ua.userAgent ?? ua, platform: ua.platform ?? "", ...(ua.metadata ? { userAgentMetadata: ua.metadata } : {}) });
    await s.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }, { name: "prefers-reduced-motion", value: reduceMotion ? "reduce" : "no-preference" }] });
    await s.send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => {});
    return new Page(s, t.id, browser, { width, height });
  };
  browser.close = stop;
  return browser;
}

/** Vài user-agent mẫu cho test nhận diện hệ điều hành. */
export const UA = {
  mac: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", platform: "MacIntel" },
  win: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", platform: "Win32" },
  linux: { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", platform: "Linux x86_64" },
  iphone: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", platform: "iPhone" },
  android: { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", platform: "Linux armv8l" },
  ipad: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", platform: "MacIntel", touch: true },
};
