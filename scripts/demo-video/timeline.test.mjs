import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPTURE_DISPLAY_MS,
  FRAME_MS,
  buildTimeline,
  levelAt,
  revealDeltas,
  subtitleEvents,
  typingSchedule,
  visibility,
} from "./timeline.mjs";

test("sự kiện phụ đề dời theo lúc giọng bắt đầu cộng 80 ms, giữ thứ tự, bỏ t_ms và kind", () => {
  const events = [
    { t_ms: 1000, kind: "live", id: 1, src_stable: "We" },
    { t_ms: 1000, kind: "indicators", streamingUnavailable: false },
    { t_ms: 2500.5, kind: "subtitle", id: 1, status: "done" },
    { t_ms: 2600, kind: "live_end", id: 1 },
    { t_ms: 2700, kind: "delta", id: 2, text: "x" },
  ];
  assert.deepEqual(subtitleEvents(events, 3000), [
    { at: 3000 + 1000 + CAPTURE_DISPLAY_MS, event: "subtitle://live", payload: { id: 1, src_stable: "We" } },
    { at: 3000 + 2500.5 + CAPTURE_DISPLAY_MS, event: "subtitle://upsert", payload: { id: 1, status: "done" } },
    { at: 3000 + 2600 + CAPTURE_DISPLAY_MS, event: "subtitle://live-end", payload: { id: 1 } },
    { at: 3000 + 2700 + CAPTURE_DISPLAY_MS, event: "subtitle://delta", payload: { id: 2, text: "x" } },
  ]);
});

test("mức âm lượng theo khung 100 ms, ngoài phần giọng là 0", () => {
  const voice = { levelWindowMs: 100, levels: [0.1, 0.2] };
  assert.equal(levelAt(voice, 3000, 2999), 0);
  assert.equal(levelAt(voice, 3000, 3000), 0.1);
  assert.equal(levelAt(voice, 3000, 3199), 0.2);
  assert.equal(levelAt(voice, 3000, 3200), 0);
});

test("lịch gõ theo nhịp ký tự, dấu cách, dấu câu; chữ có dấu tính một ký tự", () => {
  const steps = typingSchedule("Dạ, em", 1000, { charMs: 70, spaceMs: 110, punctuationMs: 260 });
  assert.deepEqual(
    steps.map((s) => s.text),
    ["D", "Dạ", "Dạ,", "Dạ, ", "Dạ, e", "Dạ, em"],
  );
  assert.deepEqual(
    steps.map((s) => s.at),
    [1000, 1070, 1140, 1400, 1510, 1580],
  );
});

test("nhịp gõ không được chạm thời gian chờ 400 ms của ô soạn", () => {
  assert.throws(() => typingSchedule("a", 0, { charMs: 70, spaceMs: 110, punctuationMs: 400 }), /punctuationMs/);
});

test("bản dịch về dần: đủ chữ, mảnh đầu ở first_token_ms, các mảnh tăng dần và trước total_ms", () => {
  const d = revealDeltas("I'll send it by Friday.", 30, 430);
  assert.equal(d.map((x) => x.text).join(""), "I'll send it by Friday.");
  assert.equal(d[0].after, 30);
  assert.ok(d.at(-1).after < 430);
  for (let i = 1; i < d.length; i++) assert.ok(d[i].after > d[i - 1].after);
});

test("bản dịch về một lần khi thời gian dịch ngắn hơn một khung", () => {
  assert.deepEqual(revealDeltas("Hi.", 10, 20), [{ after: 10, text: "Hi." }]);
});

test("độ hiện của cảnh: mờ qua 400 ms quanh mép, cảnh bắt đầu từ 0 hiện ngay", () => {
  assert.equal(visibility(0, [0, 1000]), 1);
  assert.equal(visibility(1000, [0, 1000]), 0.5);
  assert.equal(visibility(1200, [0, 1000]), 0);
  assert.equal(visibility(800, [1000, 2000]), 0);
  assert.equal(visibility(1000, [1000, 2000]), 0.5);
  assert.equal(visibility(1300, [1000, 2000]), 1);
});

const SCRIPT = {
  timing: {
    hookMs: 3000,
    liveHoldMs: 2500,
    outroMs: 5000,
    chat: {
      sarahMsgMs: 700,
      hotkeyMs: 2000,
      pressMs: 200,
      openAfterHotkeyMs: 250,
      typingAfterOpenMs: 600,
      pace: { charMs: 70, spaceMs: 110, punctuationMs: 260 },
      readMs: 1600,
      pasteMs: 150,
      reviewMs: 1200,
      holdMs: 2200,
    },
  },
  captions: { hook: { title: "H", sub: "" }, live: { title: "L", sub: "l" }, chat: { title: "C", sub: "c" } },
  chat: { reply: "Dạ." },
};
const VOICE = { durationMs: 10_000, levelWindowMs: 100, levels: [0.1, 0, 0.3] };
const LIVE = { events: [{ t_ms: 11_000, kind: "subtitle", id: 1, status: "done" }] };
const COMPOSE = { hyp: "Yes.", total_ms: 300, first_token_ms: 20 };

test("lịch cả video: cảnh live hết sau sự kiện cuối, Gõ dịch đúng thứ tự, tổng độ dài, tiếng gõ", () => {
  const tl = buildTimeline(SCRIPT, VOICE, LIVE, COMPOSE);
  // Sự kiện cuối (3000 + 11 000 + 80) muộn hơn lúc hết giọng (3000 + 10 000).
  const liveEnd = 3000 + 11_000 + CAPTURE_DISPLAY_MS + 2500;
  assert.deepEqual(tl.scenes.live, [0, liveEnd]);
  const c = tl.chat;
  assert.equal(c.sarahAt, liveEnd + 700);
  assert.equal(c.hotkeyAt, liveEnd + 2000);
  assert.equal(c.pressAt, liveEnd + 2200);
  assert.equal(c.composeOpenAt, liveEnd + 2250);
  assert.deepEqual(
    c.typing.map((k) => k.at),
    [liveEnd + 2850, liveEnd + 2920, liveEnd + 2990],
  );
  assert.equal(c.translateAt, liveEnd + 2990 + 400);
  assert.equal(c.translatedAt, c.translateAt + 300);
  assert.equal(c.enter1At, c.translatedAt + 1600);
  assert.equal(c.pasteAt, c.enter1At + 150);
  assert.equal(c.enter2At, c.pasteAt + 1200);
  assert.deepEqual(tl.scenes.chat, [liveEnd, c.enter2At + 2200]);
  assert.equal(tl.totalMs, c.enter2At + 2200 + 5000);
  assert.equal(tl.frames, Math.ceil(tl.totalMs / FRAME_MS));
  assert.deepEqual(
    tl.sounds,
    [c.pressAt, ...c.typing.map((k) => k.at), c.enter1At, c.enter2At].map((at) => ({ at, kind: "key" })),
  );
  assert.equal(tl.clicks, undefined);
  assert.deepEqual(tl.keyTimes, {
    "01-mo-dau": 1500,
    "02-dang-noi": 3000 + 4000,
    "03-phu-de": liveEnd - 1250,
    "04-tin-nhan": c.sarahAt + 600,
    "05-phim-tat": c.pressAt + 60,
    "06-dang-go": c.typing[1].at + 10,
    "07-ban-dich": c.translatedAt + 300,
    "08-da-dan": c.pasteAt + 400,
    "09-da-gui": c.enter2At + 700,
    "10-ket": tl.totalMs - 1500,
  });
  assert.deepEqual(
    tl.overlayEvents.map((e) => e.event),
    ["audio://level", "audio://level", "audio://level", "subtitle://upsert"],
  );
  assert.deepEqual(
    tl.captions.map((x) => [x.title, x.from, x.to]),
    [
      ["H", 0, 3000],
      ["L", 3000, liveEnd],
      ["C", liveEnd, c.enter2At + 2200],
    ],
  );
  assert.equal(tl.posterMs, liveEnd - 1250);
  assert.equal(tl.compose.text, "Yes.");
});
