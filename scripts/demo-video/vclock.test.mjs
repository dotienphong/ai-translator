import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./vclock.js", import.meta.url), "utf8");
const EPOCH = Date.UTC(2026, 9, 21, 2, 0, 0);

// MessageChannel giả cho vm (bản của Node giữ tiến trình test sống): mỗi tin nhắn là một tác vụ mới, như trình duyệt.
class FakeChannel {
  constructor() {
    this.port1 = { onmessage: null };
    this.port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.({})) };
  }
}

// Một "trang" giả trong vm: `top` là chính nó, hay là trang ngoài cùng (iframe).
function page(top) {
  const sandbox = { performance: { now: () => 123 }, requestAnimationFrame: () => 0, MessageChannel: FakeChannel, console };
  sandbox.window = sandbox;
  sandbox.top = top?.ctx ?? sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(source, ctx);
  return { ctx, run: (code) => vm.runInContext(code, ctx) };
}

test("hẹn giờ chạy theo thời điểm rồi theo thứ tự đặt, chỉ khi đồng hồ tiến tới", async () => {
  const p = page();
  p.run(`globalThis.log = []; setTimeout(() => log.push("b"), 200); setTimeout(() => log.push("a"), 100); setTimeout(() => log.push("a2"), 100);`);
  await p.run("__vclock.advanceTo(99)");
  assert.deepEqual(Array.from(p.run("log")), []);
  await p.run("__vclock.advanceTo(200)");
  assert.deepEqual(Array.from(p.run("log")), ["a", "a2", "b"]);
});

test("hẹn giờ đặt trong lúc chạy hẹn giờ khác, setInterval, clearTimeout, clearInterval", async () => {
  const p = page();
  p.run(`globalThis.log = [];
    setTimeout(() => { log.push("t" + performance.now()); setTimeout(() => log.push("u" + performance.now()), 0); }, 50);
    const iv = setInterval(() => log.push("i" + performance.now()), 40);
    const x = setTimeout(() => log.push("never"), 60); clearTimeout(x);
    setTimeout(() => clearInterval(iv), 100);`);
  await p.run("__vclock.advanceTo(130)");
  assert.deepEqual(Array.from(p.run("log")), ["i40", "t50", "u50", "i80"]);
});

test("giữa hai hẹn giờ, việc dồn lại (Promise) chạy xong, như hai tác vụ riêng của trình duyệt", async () => {
  const p = page();
  p.run(`globalThis.log = [];
    setTimeout(() => { Promise.resolve().then(() => Promise.resolve()).then(() => log.push("promise")); }, 10);
    setTimeout(() => log.push("timer"), 10);`);
  await p.run("__vclock.advanceTo(10)");
  assert.deepEqual(Array.from(p.run("log")), ["promise", "timer"]);
});

test("Date và performance.now theo đồng hồ ảo", async () => {
  const p = page();
  await p.run("__vclock.advanceTo(1500)");
  assert.equal(p.run("performance.now()"), 1500);
  assert.equal(p.run("Date.now()"), EPOCH + 1500);
  assert.equal(p.run("new Date().getTime()"), EPOCH + 1500);
  assert.equal(p.run("new Date(0).getTime()"), 0);
});

test("requestAnimationFrame chạy ở mốc khung 30 hình/giây kế tiếp", async () => {
  const p = page();
  await p.run("__vclock.advanceTo(10)");
  p.run("globalThis.log = []; requestAnimationFrame((ts) => log.push(ts));");
  await p.run("__vclock.advanceTo(40)");
  const log = Array.from(p.run("log"));
  assert.equal(log.length, 1);
  assert.ok(Math.abs(log[0] - 1000 / 30) < 1e-9);
});

test("không cho đồng hồ chạy lùi", async () => {
  const p = page();
  await p.run("__vclock.advanceTo(100)");
  await assert.rejects(() => Promise.resolve(p.run("__vclock.advanceTo(50)")), /lùi/);
});

test("lỗi trong một hẹn giờ không chặn các hẹn giờ sau", async () => {
  const p = page();
  const errors = [];
  p.ctx.errs = errors;
  p.run("globalThis.console = { error: (e) => errs.push(String(e)) }");
  p.run(`globalThis.log = []; setTimeout(() => { throw new Error("hỏng"); }, 10); setTimeout(() => log.push("sau"), 20);`);
  await p.run("__vclock.advanceTo(30)");
  assert.deepEqual(Array.from(p.run("log")), ["sau"]);
  assert.equal(errors.length, 1);
});

test("iframe dùng chung đồng hồ của trang ngoài cùng", async () => {
  const top = page();
  const frame = page(top);
  frame.run("globalThis.log = []; setTimeout(() => log.push(performance.now()), 70);");
  await top.run("__vclock.advanceTo(100)");
  assert.deepEqual(Array.from(frame.run("log")), [70]);
});
