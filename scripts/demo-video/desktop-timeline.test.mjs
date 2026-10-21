import assert from "node:assert/strict";
import { test } from "node:test";
import { SLIDE_MS, buildDesktopTimeline, cursorAt, ease } from "./desktop-timeline.mjs";
import { CAPTURE_DISPLAY_MS, FRAME_MS } from "./timeline.mjs";

const SCRIPT = {
  timing: {
    voiceStartMs: 800,
    liveHoldMs: 2000,
    outroMs: 4000,
    meetingLabel: { from: 800, to: 3800 },
    chatLabel: { from: 500, to: 3500 },
    chat: {
      typing1StartMs: 300,
      typing1Ms: 1200,
      moveAfterMsgMs: 500,
      moveMs: 700,
      clickAfterMoveMs: 100,
      hotkeyAfterClickMs: 600,
      pressMs: 200,
      openAfterHotkeyMs: 250,
      typingAfterOpenMs: 600,
      pace: { charMs: 70, spaceMs: 110, punctuationMs: 260 },
      readMs: 1500,
      pasteMs: 150,
      reviewMs: 1000,
      typing2StartMs: 700,
      typing2Ms: 1500,
      holdMs: 1500,
    },
  },
  labels: { meeting: { text: "M" }, chat: { text: "C" } },
  chat: { reply: "Dạ." },
  layout: { cursor: { rest: { x: 1290, y: 560 }, input: { x: 860, y: 788 } } },
};
const VOICE = { durationMs: 10_000, levelWindowMs: 100, levels: [0.1] };
const LIVE = { events: [{ t_ms: 11_000, kind: "subtitle", id: 1, status: "done" }] };
const COMPOSE = { src: "Dạ.", hyp: "Yes.", total_ms: 300, first_token_ms: 20 };

test("làm mượt đầu cuối đi qua 0, 0,5 và 1", () => {
  assert.equal(ease(0), 0);
  assert.equal(ease(0.5), 0.5);
  assert.equal(ease(1), 1);
  assert.ok(ease(0.25) < 0.25);
});

test("con trỏ đứng yên ở mốc, đi mượt giữa hai mốc, đổi hình khi tới mốc sau", () => {
  const path = [
    { at: 0, x: 1290, y: 560, kind: "arrow" },
    { at: 1000, x: 1290, y: 560, kind: "arrow" },
    { at: 1700, x: 860, y: 788, kind: "text" },
  ];
  assert.deepEqual(cursorAt(path, -5), { x: 1290, y: 560, kind: "arrow" });
  assert.deepEqual(cursorAt(path, 1000), { x: 1290, y: 560, kind: "arrow" });
  assert.deepEqual(cursorAt(path, 1350), { x: 1075, y: 674, kind: "arrow" });
  assert.deepEqual(cursorAt(path, 1700), { x: 860, y: 788, kind: "text" });
  assert.deepEqual(cursorAt(path, 9000), { x: 860, y: 788, kind: "text" });
});

test("lịch bản 16:10: cảnh họp, chuyển cảnh, chat, màn kết đúng thứ tự và độ dài", () => {
  const tl = buildDesktopTimeline(SCRIPT, VOICE, LIVE, COMPOSE);
  const liveEnd = 800 + 11_000 + CAPTURE_DISPLAY_MS + 2000; // 13 880: sự kiện cuối muộn hơn lúc hết giọng
  assert.equal(liveEnd, 13_880);
  assert.deepEqual(tl.scenes.meeting, [0, liveEnd]);
  assert.deepEqual(tl.scenes.slide, [liveEnd, liveEnd + SLIDE_MS]);
  const c = tl.chat;
  assert.deepEqual(c.typing1, [15_080, 16_280]);
  assert.equal(c.sarahAt, 16_280);
  assert.equal(c.clickAt, 17_580);
  assert.equal(c.hotkeyAt, 18_180);
  assert.equal(c.pressAt, 18_380);
  assert.equal(c.composeOpenAt, 18_430);
  assert.deepEqual(
    c.typing.map((k) => k.at),
    [19_030, 19_100, 19_170],
  );
  assert.equal(c.translateAt, 19_570);
  assert.equal(c.translatedAt, 19_870);
  assert.equal(c.enter1At, 21_370);
  assert.equal(c.pasteAt, 21_520);
  assert.equal(c.enter2At, 22_520);
  assert.equal(c.sentAt, 22_600);
  assert.deepEqual(c.typing2, [23_220, 24_720]);
  assert.equal(c.replyAt, 24_720);
  assert.deepEqual(tl.scenes.chat, [14_780, 26_220]);
  assert.equal(tl.totalMs, 30_220);
  assert.equal(tl.frames, Math.ceil(30_220 / FRAME_MS));
  assert.equal(tl.posterMs, 12_880);
  assert.deepEqual(
    tl.labels.map((l) => [l.text, l.from, l.to]),
    [
      ["M", 800, 3800],
      ["C", 15_280, 18_280],
    ],
  );
  assert.deepEqual(tl.keys, [
    { keys: ["Ctrl", "Alt", "G"], from: 18_080, to: 19_280, down: [18_380, 18_560] },
    { keys: ["Enter"], from: 21_250, to: 22_070, down: [21_370, 21_520] },
    { keys: ["Enter"], from: 22_400, to: 23_220, down: [22_520, 22_670] },
  ]);
  assert.deepEqual(tl.cursorPath, [
    { at: 0, x: 1290, y: 560, kind: "arrow" },
    { at: 16_780, x: 1290, y: 560, kind: "arrow" },
    { at: 17_480, x: 860, y: 788, kind: "text" },
  ]);
  assert.deepEqual(tl.sounds, [
    { at: 16_280, kind: "pop" },
    { at: 17_580, kind: "mouse" },
    { at: 18_380, kind: "key" },
    { at: 19_030, kind: "key" },
    { at: 19_100, kind: "key" },
    { at: 19_170, kind: "key" },
    { at: 21_370, kind: "key" },
    { at: 22_520, kind: "key" },
    { at: 24_720, kind: "pop" },
  ]);
  assert.deepEqual(
    tl.overlayEvents.map((e) => [e.at, e.event]),
    [
      [800, "audio://level"],
      [11_880, "subtitle://upsert"],
    ],
  );
  assert.equal(tl.compose.text, "Yes.");
  assert.equal(Object.keys(tl.keyTimes).length, 13);
  assert.equal(tl.keyTimes["13-ket"], 29_220);
});

test("câu trả lời của kịch bản phải đúng câu đã dịch trong compose.json", () => {
  assert.throws(() => buildDesktopTimeline(SCRIPT, VOICE, LIVE, { ...COMPOSE, src: "Câu khác." }), /compose/);
});
