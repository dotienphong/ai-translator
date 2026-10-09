// Điều khiển Chrome không đầu qua Chrome DevTools Protocol, không thêm thư viện (Node có WebSocket sẵn). Dùng cho test hành vi
// thật của trang (nhận diện hệ điều hành, tab, bàn phím, sao chép) và để chụp ảnh kiểm giao diện ở nhiều cỡ màn hình.
//   const b = await launch(); const p = await b.newPage({ width: 390, height: 800, mobile: true, ua: "...", dark: true });
//   await p.goto("http://127.0.0.1:4173/tai-xuong/"); await p.eval("document.title"); await p.screenshot("a.png", { full: true }); await b.close();
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(`${m.error.message}`)) : resolve(m.result);
      } else if (m.method) {
        this.waiters = this.waiters.filter((w) => !w(m));
        for (const h of this.handlers) h(m);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  once(method, ms = 15000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`hết giờ chờ ${method}`)), ms);
      this.waiters.push((m) => (m.method === method ? (clearTimeout(t), resolve(m.params), true) : false));
    });
  }
}

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
  }
  async goto(url) {
    const loaded = this.s.once("Page.loadEventFired");
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
    const box = await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({block:"center", behavior:"instant"}); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
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

export async function launch({ port = 9333 + Math.floor(Math.random() * 500) } = {}) {
  const chrome = findChrome();
  if (!chrome) return null;
  const dir = mkdtempSync(join(tmpdir(), "cdp-"));
  const proc = spawn(chrome, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  const browser = { port, proc };
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch { /* chưa lên */ }
    await sleep(100);
  }
  browser.newPage = async ({ width = 1280, height = 900, mobile = false, ua, dark = false, reduceMotion = false, dpr = 1, touch } = {}) => {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
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
  browser.close = async () => {
    proc.kill();
    await sleep(200);
    rmSync(dir, { recursive: true, force: true });
  };
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
