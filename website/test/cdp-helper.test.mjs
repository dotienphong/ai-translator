// Kiểm chính công cụ tools/browser/cdp.mjs: nhiều Chrome mở cùng lúc không dùng chung nhau, click() trúng nút đang di chuyển,
// không để lại thư mục hồ sơ cdp-* trong thư mục tạm.
//   node --test test/cdp-helper.test.mjs        (không có Chrome: bỏ qua; đặt CHROME=<đường dẫn> nếu Chrome ở chỗ khác)
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { findChrome, launch } from "../tools/browser/cdp.mjs";

const skip = findChrome() ? false : "cần Google Chrome (hoặc biến CHROME)";
const dirs = []; // mọi thư mục hồ sơ test này tạo ra, để kiểm đã dọn hết
const page = (title) => `data:text/html,<title>${title}</title>`;

after(() => {
  if (skip) return;
  const left = dirs.filter((d) => existsSync(d));
  assert.deepEqual(left, [], "còn sót thư mục hồ sơ Chrome");
});

test("launch() song song: mỗi Chrome một cổng riêng, đóng một cái không làm hỏng cái khác", { skip }, async () => {
  const browsers = await Promise.all(Array.from({ length: 5 }, () => launch()));
  try {
    dirs.push(...browsers.map((b) => b.dir));
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

test("launch({ port }) trùng cổng của Chrome khác: báo lỗi rõ và dọn sạch, không âm thầm dùng chung", { skip }, async () => {
  const a = await launch();
  dirs.push(a.dir);
  try {
    const err = await launch({ port: a.port, timeout: 1500 }).then(() => null, (e) => e);
    assert.ok(err, "launch() trùng cổng phải ném lỗi");
    dirs.push(err.dir);
    assert.match(err.message, new RegExp(`cổng ${a.port} đang bị một Chrome khác chiếm|thoát sớm`));
    assert.ok(!existsSync(err.dir), "launch() hỏng phải xoá thư mục hồ sơ của nó");
  } finally {
    await a.close();
  }
});

test("click() chờ trang thôi cuộn rồi mới bấm: trúng nút đang bị cuộn đi và nút đập nhịp", { skip }, async () => {
  // Trang tự cuộn 12000 px trong 500 ms (mỗi tác vụ một bước, qua MessageChannel), bắt đầu ngay trước lúc goto() trả về
  // (goto chờ 250 ms sau load): nút #t dời đi giữa lúc đo và lúc bấm. click() kiểu cũ (đo hộp một lần) trượt 30/30 lần.
  const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;height:14000px}
    #t{position:absolute;top:1200px;left:100px;width:90px;height:40px}
    #p{position:absolute;top:100px;left:300px;width:90px;height:40px;animation:beat .4s ease-in-out infinite alternate}
    @keyframes beat{to{transform:scale(1.15)}}</style>
    <button id=t onclick="window.__hit='t';event.stopPropagation()">t</button><button id=p onclick="window.__hit='p';event.stopPropagation()">p</button>
    <script>window.__hit='none';document.addEventListener('click',()=>{window.__hit='trượt'});
    addEventListener('load',()=>setTimeout(()=>{const t0=performance.now(),ch=new MessageChannel();
      ch.port1.onmessage=()=>{const k=Math.min(1,(performance.now()-t0)/500);scrollTo(0,12000*k);if(k<1)ch.port2.postMessage(0)};
      ch.port2.postMessage(0)},150));</script>`;
  const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await launch();
  dirs.push(b.dir);
  try {
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
    await b.close();
    server.closeAllConnections();
    server.close();
  }
});
