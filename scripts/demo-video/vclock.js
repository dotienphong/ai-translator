// Đồng hồ ảo cho render.mjs (spec 2026-10-21-demo-video §2.5). render.mjs nạp file này vào mọi frame trước script của trang
// (`Page.addScriptToEvaluateOnNewDocument`: trang dựng cảnh và hai iframe overlay.html, compose.html). Mọi frame dùng chung đồng
// hồ của trang ngoài cùng; thời gian chỉ tiến khi render.mjs gọi `await __vclock.advanceTo(ms)`, nên mỗi khung hình là đúng một
// thời điểm và lần dựng nào cũng ra như nhau. Thay Date, performance.now, setTimeout/setInterval, requestAnimationFrame;
// MessageChannel, Promise, fetch vẫn là thật. Mỗi hẹn giờ chạy như một tác vụ riêng (giữa hai hẹn giờ có một lượt MessageChannel
// thật, nên Promise và lượt vẽ của React chạy xong như trên trình duyệt). Bản thật của requestAnimationFrame giữ ở
// `__vclock.realFrame` (chờ trang vẽ xong).
(() => {
  const FRAME_MS = 1000 / 30;
  const EPOCH = Date.UTC(2026, 9, 21, 2, 0, 0);
  if (window === window.top) {
    const timers = new Map();
    let seq = 0;
    let now = 0;
    // Một lượt tác vụ thật: chờ tin nhắn MessageChannel về (mọi Promise đang dồn chạy xong trước đó).
    const channel = new MessageChannel();
    const waiting = [];
    channel.port1.onmessage = () => waiting.shift()?.();
    const tick = () =>
      new Promise((resolve) => {
        waiting.push(resolve);
        channel.port2.postMessage(0);
      });
    window.__vclock = {
      now: () => now,
      realFrame: window.requestAnimationFrame.bind(window),
      add(fn, delay, args, repeat) {
        const id = ++seq;
        const ms = Math.max(0, Number(delay) || 0);
        timers.set(id, { id, at: now + ms, order: id, fn, args, every: repeat ? Math.max(1, ms) : 0 });
        return id;
      },
      clear(id) {
        timers.delete(id);
      },
      async advanceTo(t) {
        if (t < now) throw new Error(`vclock: không lùi được từ ${now} về ${t}`);
        for (;;) {
          let next = null;
          for (const timer of timers.values()) {
            if (timer.at > t) continue;
            if (!next || timer.at < next.at || (timer.at === next.at && timer.order < next.order)) next = timer;
          }
          if (!next) break;
          now = next.at;
          if (next.every) {
            next.at += next.every;
            next.order = ++seq;
          } else {
            timers.delete(next.id);
          }
          try {
            if (typeof next.fn === "function") next.fn(...next.args);
          } catch (e) {
            console.error(e);
          }
          await tick();
        }
        now = t;
      },
    };
  }
  const clock = window.top.__vclock;
  const RealDate = Date;
  class VDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(EPOCH + clock.now());
      else super(...args);
    }
    static now() {
      return EPOCH + clock.now();
    }
  }
  window.Date = VDate;
  performance.now = () => clock.now();
  window.setTimeout = (fn, delay, ...args) => clock.add(fn, delay, args, false);
  window.setInterval = (fn, delay, ...args) => clock.add(fn, delay, args, true);
  window.clearTimeout = (id) => clock.clear(id);
  window.clearInterval = (id) => clock.clear(id);
  window.requestAnimationFrame = (fn) => clock.add(() => fn(clock.now()), FRAME_MS - (clock.now() % FRAME_MS), [], false);
  window.cancelAnimationFrame = (id) => clock.clear(id);
})();
