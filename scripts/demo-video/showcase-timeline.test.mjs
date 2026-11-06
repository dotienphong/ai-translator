import assert from "node:assert/strict";
import { test } from "node:test";
import { buildShowcaseTimeline } from "./showcase-timeline.mjs";

const sampleScript = {
  stage: "showcase",
  timing: {
    intro1Ms: 3200,
    voice1OffsetMs: 400,
    voiceSplitMs: 7450,
    unlockAfterPart1Ms: 1150,
    listenClickAfterUnlockMs: 1600,
    voice2AfterListenMs: 1200,
    voiceModalAfterTtsMs: 1200,
    voiceSelectAfterOpenMs: 2800,
    voicePreviewAfterSelectMs: 1800,
    meetingHoldAfterPreviewMs: 4800,
    intro2Ms: 3200,
    ytVoiceOffsetMs: 500,
    ytHoldAfterTtsMs: 2500,
    intro3Ms: 3200,
    outroMs: 4000,
    chat: {
      typing1StartMs: 400,
      typing1Ms: 1200,
      moveAfterMsgMs: 500,
      moveMs: 700,
      clickAfterMoveMs: 100,
      hotkeyAfterClickMs: 600,
      pressMs: 200,
      openAfterHotkeyMs: 250,
      typingAfterOpenMs: 600,
      pace: { charMs: 70, spaceMs: 110, punctuationMs: 260 },
      readMs: 1600,
      pasteMs: 150,
      reviewMs: 1100,
      typing2StartMs: 800,
      typing2Ms: 1500,
      holdMs: 2600,
    },
  },
  introCards: {
    meeting: { step: "Tính năng 1 / 3", title: "Dịch cuộc họp & Giọng đọc AI", desc: "Phụ đề song ngữ thời gian thực, hạ tiếng họp và đọc bản dịch bằng 25 giọng Việt & Anh." },
    youtube: { step: "Tính năng 2 / 3", title: "Dịch video & YouTube", desc: "Xem video tiếng Anh trên trình duyệt với phụ đề và thuyết minh tiếng Việt trực tiếp." },
    chat: { step: "Tính năng 3 / 3", title: "Gõ dịch (Ctrl + Alt + G)", desc: "Gõ tiếng Việt, dịch tức thì sang tiếng Anh và tự dán vào ô chat." },
  },
  labels: {
    meeting: { text: "Dịch cuộc họp trực tiếp · phụ đề & giọng đọc AI" },
    youtube: { text: "Dịch video & trình duyệt · phụ đề song ngữ thời gian thực" },
    chat: { text: "Gõ dịch · Ctrl + Alt + G · nhắn tiếng Việt, gửi đi tiếng Anh" },
  },
  chat: {
    reply: "Dạ vâng, em sẽ gửi báo giá mới cho chị trước thứ Sáu.",
  },
  layout: {
    cursor: {
      rest: { x: 1290, y: 560 },
      listenToggle: { x: 432, y: 696 },
      voiceSelect: { x: 640, y: 315 },
      voicePreview: { x: 640, y: 368 },
      input: { x: 1150, y: 788 },
    },
  },
};

const sampleVoice = {
  durationMs: 17303,
  levelWindowMs: 100,
  levels: new Array(173).fill(0.15),
};

const sampleLive = {
  events: [
    { t_ms: 3386, kind: "subtitle", id: 0, status: "done", provisional: false, src_text: "Thanks everyone.", tgt_text: "Cảm ơn mọi người." },
    { t_ms: 7380, kind: "subtitle", id: 1, status: "done", provisional: false, src_text: "We need to push the launch.", tgt_text: "Chúng ta cần lùi ngày ra mắt." },
    { t_ms: 11620, kind: "subtitle", id: 2, status: "done", provisional: false, src_text: "Our design team found issues.", tgt_text: "Đội thiết kế phát hiện lỗi." },
    { t_ms: 15994, kind: "subtitle", id: 3, status: "done", provisional: false, src_text: "Can you send a new quote?", tgt_text: "Bạn gửi báo giá mới nhé?" },
  ],
};

const sampleYtVoice = {
  durationMs: 16500,
  levelWindowMs: 100,
  levels: new Array(165).fill(0.14),
};

const sampleYtLive = {
  events: [
    { t_ms: 4800, kind: "subtitle", id: 10, status: "done", provisional: false, src_text: "Welcome back.", tgt_text: "Chào mừng quay lại." },
    { t_ms: 10200, kind: "subtitle", id: 11, status: "done", provisional: false, src_text: "Real-time AI changes how teams work.", tgt_text: "AI thời gian thực thay đổi cách làm việc." },
    { t_ms: 15800, kind: "subtitle", id: 12, status: "done", provisional: false, src_text: "Every voice can be understood instantly.", tgt_text: "Mọi giọng nói đều được hiểu ngay lập tức." },
  ],
};

const sampleCompose = {
  src: "Dạ vâng, em sẽ gửi báo giá mới cho chị trước thứ Sáu.",
  hyp: "Yes, I will send you the new quote before Friday.",
  first_token_ms: 120,
  total_ms: 680,
};

const sampleTts = {
  meet1Ms: 4100,
  meet2Ms: 4600,
  previewMs: 4200,
  yt0Ms: 3700,
  yt1Ms: 4500,
};

test("buildShowcaseTimeline produces a 90s-120s 3-scene showcase timeline with intro cards, TTS, and ducking", () => {
  const tl = buildShowcaseTimeline(
    sampleScript,
    sampleVoice,
    sampleLive,
    sampleYtVoice,
    sampleYtLive,
    sampleCompose,
    sampleTts,
  );
  assert.ok(tl.totalMs >= 90_000 && tl.totalMs <= 120_000, `expected 90s..120s, got ${tl.totalMs}`);
  assert.equal(tl.introCards.length, 3);
  assert.ok(tl.scenes.meeting[0] === 0 && tl.scenes.meeting[1] > 35_000);
  assert.ok(tl.scenes.slide1[0] === tl.scenes.meeting[1]);
  assert.ok(tl.scenes.youtube[0] === tl.scenes.slide1[1]);
  assert.ok(tl.scenes.slide2[0] === tl.scenes.youtube[1]);
  assert.ok(tl.scenes.chat[0] === tl.scenes.slide2[1]);
  assert.ok(tl.scenes.outro[0] === tl.scenes.chat[1]);
  assert.ok(tl.meeting.listenClickAt > tl.meeting.unlockAt);
  assert.ok(tl.meeting.voiceModalOpenAt > tl.meeting.listenClickAt);
  assert.ok(tl.meeting.voicePreviewClickAt > tl.meeting.voiceModalOpenAt);
  assert.ok(tl.audioPlan.duckWindows.length >= 2);
  assert.ok(tl.audioPlan.ttsSegments.length >= 4);
  assert.ok(Object.keys(tl.keyTimes).length >= 16);
});
