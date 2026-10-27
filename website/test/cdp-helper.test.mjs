// Kiểm chính công cụ tools/browser/cdp.mjs: nhiều Chrome mở cùng lúc không dùng chung nhau, click() trúng nút đang di chuyển
// (cả khi tắt JS hay trang không ở trước), lệnh gửi sau khi trang đóng không làm sập tiến trình, không để lại thư mục hồ sơ cdp-*.
//   node --test test/cdp-helper.test.mjs        (không có Chrome: bỏ qua; đặt CHROME=<đường dẫn> nếu Chrome ở chỗ khác)
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { findChrome, launch } from "../tools/browser/cdp.mjs";

const CDP = new URL("../tools/browser/cdp.mjs", import.meta.url).href;

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const dirs = []; // mọi thư mục hồ sơ test này tạo ra, để kiểm đã dọn hết
const page = (title) => `data:text/html,<title>${title}</title>`;

after(() => {
  if (skip) return;
  const left = dirs.filter((d) => existsSync(d));
  assert.deepEqual(left, [], "còn sót thư mục hồ sơ Chrome");
});

test("launch() song song: mỗi Chrome một cổng riêng, đóng một cái không làm hỏng cái khác", { skip }, async () => {
  const settled = await Promise.allSettled(Array.from({ length: 5 }, () => launch()));
  const browsers = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
  try {
    dirs.push(...browsers.map((b) => b.dir));
    for (const r of settled) if (r.status === "rejected") { if (r.reason?.dir) dirs.push(r.reason.dir); throw r.reason; }
    assert.equal(new Set(browsers.map((b) => b.port)).size, browsers.length, `cổng trùng: ${browsers.map((b) => b.port)}`);
    const pages = await Promise.all(browsers.map(async (b, i) => {
      const p = await b.newPage({ width: 400, height: 300 });
      await p.goto(page(`trang-${i}`));
      assert.equal(await p.eval("document.title + ':' + (6 * 7)"), `trang-${i}:42`);
      return p;
    }));
    const pids = new Set(browsers.map((b) => b.proc.pid));
    assert.equal(pids.size, browsers.length, "mỗi launch() phải có tiến trình Chrome riêng");

    await browsers[0].close();
    assert.ok(browsers[0].proc.exitCode !== null || browsers[0].proc.signalCode !== null, "Chrome đã đóng phải thoát hẳn");
    for (const [i, p] of pages.entries()) {
      if (i === 0) continue;
      assert.equal(await p.eval("document.title"), `trang-${i}`, `Chrome ${i} phải còn sống sau khi Chrome 0 đóng`);
    }
    const q = await browsers[1].newPage();
    await q.goto(page("moi"));
    assert.equal(await q.eval("document.title"), "moi");
    // Trang của Chrome đã đóng báo lỗi ngay, không treo
    await assert.rejects(pages[0].eval("1"), /mất kết nối/);
  } finally {
    await Promise.all(browsers.map((b) => b.close()));
  }
  for (const b of browsers) assert.ok(!existsSync(b.dir), `chưa xoá ${b.dir}`);
});

test("launch({ port }) ném lỗi rõ ngay, trước khi tạo thư mục hồ sơ hay mở Chrome", { skip }, async () => {
  // Chạy trong tiến trình con với TMPDIR riêng: thư mục đó phải còn trống (không mkdtemp, nên cũng không spawn Chrome)
  const tmp = mkdtempSync(join(tmpdir(), "cdp-port-opt-"));
  try {
    const code = `
      const { launch } = await import(${JSON.stringify(CDP)});
      const err = await launch({ port: 9999 }).then(() => null, (e) => e);
      console.log(err ? "lỗi:" + err.message : "không lỗi");`;
    const r = await new Promise((resolve) => execFile(process.execPath, ["--input-type=module", "-e", code], { timeout: 20000, env: { ...process.env, TMPDIR: tmp } }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
    assert.equal(r.error, null, `tiến trình con lỗi: ${r.error?.message}\n${r.stderr.slice(-800)}`);
    assert.match(r.stdout, /lỗi:.*tuỳ chọn port không còn được hỗ trợ/);
    assert.deepEqual(readdirSync(tmp), [], "launch({ port }) không được tạo thư mục hồ sơ");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("click() chờ trang thôi cuộn rồi mới bấm: trúng nút đang bị cuộn đi và nút đập nhịp", { skip }, async () => {
  // Trang tự cuộn 12000 px trong 800 ms (mỗi tác vụ một bước, qua MessageChannel) từ lúc load, nên vẫn đang cuộn khi goto()
  // trả về (250 ms sau load): nút #t dời đi giữa lúc đo và lúc bấm. click() kiểu cũ (đo hộp một lần) trượt gần như mọi lần.
  const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;height:14000px}
    #t{position:absolute;top:1200px;left:100px;width:90px;height:40px}
    #p{position:absolute;top:100px;left:300px;width:90px;height:40px;animation:beat .4s ease-in-out infinite alternate}
    @keyframes beat{to{transform:scale(1.15)}}</style>
    <button id=t onclick="window.__hit='t';event.stopPropagation()">t</button><button id=p onclick="window.__hit='p';event.stopPropagation()">p</button>
    <script>window.__hit='none';document.addEventListener('click',()=>{window.__hit='trượt'});
    addEventListener('load',()=>{const t0=performance.now(),ch=new MessageChannel();
      ch.port1.onmessage=()=>{const k=Math.min(1,(performance.now()-t0)/800);scrollTo(0,12000*k);if(k<1)ch.port2.postMessage(0)};
      ch.port2.postMessage(0)});</script>`;
  const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
  let b;
  try {
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}/`;
    b = await launch();
    dirs.push(b.dir);
    for (let i = 0; i < 3; i++) {
      const p = await b.newPage({ width: 1000, height: 700 });
      await p.goto(url);
      await p.click("#t");
      assert.equal(await p.eval("window.__hit"), "t", `lần ${i + 1}: phải trúng nút đang bị cuộn đi`);
      const t = Date.now();
      await p.click("#p");
      assert.equal(await p.eval("window.__hit"), "p", `lần ${i + 1}: phải trúng nút đập nhịp`);
      assert.ok(Date.now() - t < 1500, `nút đập nhịp tại chỗ không được bắt click() chờ hết hạn (${Date.now() - t} ms)`);
      await p.close();
    }
  } finally {
    await b?.close();
    server.closeAllConnections();
    server.close();
  }
});

test("click() khi tắt JS và trên trang không ở trước: trúng và xong nhanh, không treo", { skip }, async () => {
  const b = await launch();
  dirs.push(b.dir);
  const limit = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} treo quá ${ms} ms`)), ms).unref())]);
  try {
    // Tắt JS: rAF và setTimeout trong trang không chạy, click() phải rơi về đo một lần
    const p = await b.newPage({ width: 600, height: 400 });
    await p.goto("data:text/html,<details id=d><summary id=s>mở</summary>nội dung</details>");
    await p.setJS(false);
    let t = Date.now();
    await limit(p.click("#s"), 5000, "click() khi tắt JS");
    assert.ok(Date.now() - t < 1000, `click() khi tắt JS mất ${Date.now() - t} ms`);
    assert.equal(await p.eval("document.getElementById('d').open"), true, "bấm <summary> khi tắt JS phải mở <details>");
    // Trang cũ khi đã có trang mới mở sau nó (rAF của trang nền dừng)
    const a = await b.newPage({ width: 600, height: 400 });
    await a.goto(`data:text/html,<button id=t onclick="window.__hit=1">t</button>`);
    const c = await b.newPage({ width: 600, height: 400 });
    await c.goto("data:text/html,khác");
    t = Date.now();
    await limit(a.click("#t"), 5000, "click() trên trang nền");
    assert.ok(Date.now() - t < 1000, `click() trên trang không ở trước mất ${Date.now() - t} ms`);
    assert.equal(await a.eval("window.__hit"), 1);
  } finally {
    await b.close();
  }
});

test("handler async gửi lệnh sau khi trang đã đóng không làm sập tiến trình (như Fetch.requestPaused của chat-widget)", { skip }, async () => {
  // Chạy trong tiến trình con: lỗi không ai bắt sẽ làm nó thoát mã khác 0. Cổng chặn (gate) giữ handler lại tới khi trang đóng.
  const code = `
    const { launch } = await import(${JSON.stringify(CDP)});
    const b = await launch();
    try {
      const p = await b.newPage();
      let release; const gate = new Promise((r) => { release = r; });
      p.s.handlers.push(async (m) => { if (m.method !== "Page.loadEventFired") return; await gate; return p.s.send("Runtime.evaluate", { expression: "1" }); });
      const waiting = p.s.once("Page.javascriptDialogOpening", 60000); // lời chờ còn dở lúc đóng: phải bị từ chối ngay (không giữ tiến trình 60 s)
      waiting.catch(() => {});
      await p.goto("data:text/html,x");
      await p.close();
      release();
      await new Promise((r) => setTimeout(r, 200));
      console.log("sống:" + b.dir);
    } finally { await b.close(); }`;
  const r = await new Promise((resolve) => execFile(process.execPath, ["--input-type=module", "-e", code], { timeout: 20000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  const dir = r.stdout.match(/sống:(\S+)/)?.[1];
  if (dir) dirs.push(dir);
  assert.equal(r.error, null, `tiến trình con lỗi: ${r.error?.message}\n${r.stderr.slice(-800)}`);
  assert.ok(dir, `tiến trình con không chạy tới cuối: ${r.stdout}`);
});
