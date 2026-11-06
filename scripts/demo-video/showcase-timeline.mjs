// Lịch thời gian bản Showcase tổng hợp (90–120s, 3 cảnh: Cuộc họp & Giọng đọc AI → YouTube → Gõ dịch trên Messenger).
// Dùng chung cho desktop.mjs (trình duyệt) và render.mjs (Node).
import { SLIDE_MS } from "./desktop-timeline.mjs";
import { COMPOSE_DEBOUNCE_MS, FRAME_MS, levelEvents, revealDeltas, subtitleEvents, typingSchedule } from "./timeline.mjs";

/**
 * Tách sự kiện phụ đề + mức âm lượng của cuộc họp làm 2 nửa quanh `splitMs`:
 * - Nửa 1 (`< splitMs`): phát từ `part1StartMs` (lúc chưa bật Nghe dịch)
 * - Nửa 2 (`>= splitMs`): phát từ `part2StartMs` (sau khi mở khóa thanh phụ đề và bấm Nghe dịch)
 */
function splitMeetingOverlayEvents(liveEvents, voice, splitMs, part1StartMs, part2StartMs) {
  const part1Raw = liveEvents.filter((e) => e.t_ms < splitMs);
  const part2Raw = liveEvents
    .filter((e) => e.t_ms >= splitMs)
    .map((e) => ({ ...e, t_ms: e.t_ms - splitMs }));

  const splitIdx = Math.floor(splitMs / voice.levelWindowMs);
  const levels1 = voice.levels.slice(0, splitIdx);
  const levels2 = voice.levels.slice(splitIdx);

  return [
    ...subtitleEvents(part1Raw, part1StartMs),
    ...levelEvents(levels1, voice.levelWindowMs, part1StartMs),
    ...subtitleEvents(part2Raw, part2StartMs),
    ...levelEvents(levels2, voice.levelWindowMs, part2StartMs),
  ];
}

/** Tìm thời điểm một câu phụ đề chốt xong (`status === "done"`, `!provisional`) trong danh sách sự kiện đã dời mốc. */
function doneAtOf(events, id, fallbackMs) {
  const found = events.find(
    (e) => e.event === "subtitle://upsert" && e.payload?.id === id && e.payload?.status === "done" && !e.payload?.provisional,
  );
  return found ? found.at : fallbackMs;
}

/**
 * Dựng lịch tổng hợp (~102 giây) từ kịch bản và dữ liệu thật:
 * - `voice`, `live`: giọng & phụ đề cuộc họp (4 câu tiếng Anh)
 * - `ytVoice`, `ytLive`: giọng & phụ đề video YouTube (3 câu tiếng Anh)
 * - `compose`: dữ liệu Gõ dịch
 * - `tts`: thời lượng thật (ms) của các đoạn giọng đọc AI (`meet1Ms`, `meet2Ms`, `previewMs`, `yt1Ms`)
 */
export function buildShowcaseTimeline(script, voice, live, ytVoice, ytLive, compose, tts) {
  if (compose.src !== script.chat.reply) {
    throw new Error(`câu trả lời của kịch bản khác câu đã dịch trong compose.json ("${compose.src}"): chạy lại data.mjs`);
  }
  const s = script.timing;
  const c = s.chat;
  const cur = script.layout.cursor;

  // --- Cảnh 1: Cuộc họp & Giọng đọc AI ---
  const intro1 = [0, s.intro1Ms];
  const voice1StartMs = intro1[1] + s.voice1OffsetMs;
  const voice1DurationMs = s.voiceSplitMs;
  const voice1EndMs = voice1StartMs + voice1DurationMs;

  const unlockAt = voice1EndMs + s.unlockAfterPart1Ms;
  const listenMoveFrom = unlockAt + 350;
  const listenArriveAt = unlockAt + s.listenClickAfterUnlockMs - 150;
  const listenClickAt = unlockAt + s.listenClickAfterUnlockMs;

  const voice2StartMs = listenClickAt + s.voice2AfterListenMs;
  const voice2DurationMs = Math.max(0, voice.durationMs - s.voiceSplitMs);
  const voice2EndMs = voice2StartMs + voice2DurationMs;

  const meetOverlayEvents = splitMeetingOverlayEvents(
    live.events,
    voice,
    s.voiceSplitMs,
    voice1StartMs,
    voice2StartMs,
  );

  // Bấm nút Nghe dịch: tiếng click (60 ms) vang trọn và nút sáng lên trước, rồi mới đọc câu 1 vừa chốt (id=1),
  // sau đó tự đọc câu 2 (id=2) và câu 3 (id=3):
  const TTS_AFTER_CLICK_MS = 550;
  const ttsMeet0StartAt = listenClickAt + TTS_AFTER_CLICK_MS;
  const ttsMeet0EndAt = ttsMeet0StartAt + (tts.meet0Ms ?? 3300);

  const sub2DoneAt = doneAtOf(meetOverlayEvents, 2, voice2StartMs + 4200);
  const ttsMeet1StartAt = Math.max(sub2DoneAt + 15, ttsMeet0EndAt + 120);
  const ttsMeet1EndAt = ttsMeet1StartAt + tts.meet1Ms;

  const sub3DoneAt = doneAtOf(meetOverlayEvents, 3, voice2StartMs + 8500);
  const ttsMeet2StartAt = Math.max(sub3DoneAt + 15, ttsMeet1EndAt + 120);
  const ttsMeet2EndAt = ttsMeet2StartAt + tts.meet2Ms;

  // Mở cửa sổ chính AI Translator ở màn hình Giọng đọc (VoiceScreen):
  const voiceModalOpenAt = ttsMeet2EndAt + s.voiceModalAfterTtsMs;
  const selectMoveFrom = voiceModalOpenAt + 900;
  const selectArriveAt = voiceModalOpenAt + s.voiceSelectAfterOpenMs - 150;
  const voiceSelectAt = voiceModalOpenAt + s.voiceSelectAfterOpenMs;

  const previewMoveFrom = voiceSelectAt + 400;
  const previewArriveAt = voiceSelectAt + s.voicePreviewAfterSelectMs - 150;
  const voicePreviewClickAt = voiceSelectAt + s.voicePreviewAfterSelectMs;
  const voicePreviewStartAt = voicePreviewClickAt + TTS_AFTER_CLICK_MS;
  const voicePreviewEndAt = voicePreviewStartAt + tts.previewMs;

  const meetingEnd = voicePreviewEndAt + s.meetingHoldAfterPreviewMs;
  const voiceModalCloseAt = meetingEnd - 300;

  // --- Chuyển cảnh 1 → Cảnh 2: Dịch video & YouTube ---
  const slide1 = [meetingEnd, meetingEnd + SLIDE_MS];
  const ytStart = slide1[1];
  const intro2 = [ytStart, ytStart + s.intro2Ms];
  const ytVoiceStartMs = intro2[1] + s.ytVoiceOffsetMs;
  const ytVoiceEndMs = ytVoiceStartMs + ytVoice.durationMs;

  const ytSubs = subtitleEvents(ytLive.events, ytVoiceStartMs);
  const ytLevels = levelEvents(ytVoice.levels, ytVoice.levelWindowMs, ytVoiceStartMs);
  const ytLastSubAt = ytSubs.length > 0 ? ytSubs.at(-1).at : ytVoiceEndMs;

  // Mở thanh điều khiển phụ đề trên YouTube, đưa chuột bấm nút Nghe dịch và phát giọng đọc tiếng Việt tức thì (+15 ms):
  const ytUnlockAt = ytVoiceStartMs + 400;
  const sub10DoneAt = doneAtOf(ytSubs, 10, ytVoiceStartMs + 2050);
  const ytListenMoveFrom = ytUnlockAt + 200;
  const ytListenArriveAt = sub10DoneAt - 100;
  const ytListenClickAt = sub10DoneAt + 15;
  const ttsYt0StartAt = ytListenClickAt + 15;
  const ttsYt0EndAt = ttsYt0StartAt + (tts.yt0Ms ?? 3200);
  const ytListenLeaveFrom = ytListenClickAt + 850;
  const ytListenRestAt = ytListenClickAt + 1500;

  const sub12DoneAt = doneAtOf(ytSubs, 12, ytLastSubAt);
  const ttsYt1StartAt = Math.max(ytVoiceEndMs, sub12DoneAt) + 15;
  const ttsYt1EndAt = ttsYt1StartAt + tts.yt1Ms;
  const ytEnd = ttsYt1EndAt + s.ytHoldAfterTtsMs;

  // --- Chuyển cảnh 2 → Cảnh 3: Gõ dịch (Ctrl + Alt + G) trên Messenger ---
  const slide2 = [ytEnd, ytEnd + SLIDE_MS];
  const chatStart = slide2[1];
  const intro3 = [chatStart, chatStart + s.intro3Ms];
  const chatFlowStart = intro3[1];

  const typing1 = [chatFlowStart + c.typing1StartMs, chatFlowStart + c.typing1StartMs + c.typing1Ms];
  const sarahAt = typing1[1];
  const moveFrom = sarahAt + c.moveAfterMsgMs;
  const arriveAt = moveFrom + c.moveMs;
  const clickAt = arriveAt + c.clickAfterMoveMs;
  const hotkeyAt = clickAt + c.hotkeyAfterClickMs;
  const pressAt = hotkeyAt + c.pressMs;
  const composeOpenAt = hotkeyAt + c.openAfterHotkeyMs;
  const typing = typingSchedule(script.chat.reply, composeOpenAt + c.typingAfterOpenMs, c.pace);
  const translateAt = typing.at(-1).at + COMPOSE_DEBOUNCE_MS;
  const translatedAt = translateAt + compose.total_ms;
  const enter1At = translatedAt + c.readMs;
  const pasteAt = enter1At + c.pasteMs;
  const enter2At = pasteAt + c.reviewMs;
  const sentAt = enter2At + 80;
  const typing2 = [enter2At + c.typing2StartMs, enter2At + c.typing2StartMs + c.typing2Ms];
  const replyAt = typing2[1];
  const chatEnd = replyAt + c.holdMs;
  const totalMs = chatEnd + s.outroMs;

  const overlayEvents = [
    ...meetOverlayEvents,
    { at: unlockAt, event: "__demo://unlock-overlay", payload: { locked: false } },
    { at: ytStart - 120, event: "__demo://reset-overlay", payload: { locked: true } },
    { at: ytUnlockAt, event: "__demo://unlock-yt-overlay", payload: { locked: false } },
    ...ytSubs,
    ...ytLevels,
  ].sort((a, b) => a.at - b.at);

  return {
    totalMs,
    frames: Math.ceil(totalMs / FRAME_MS),
    durationRangeMs: [90_000, 120_000],
    voiceStartMs: voice1StartMs,
    posterMs: ttsMeet1StartAt + 1200,
    scenes: {
      meeting: [0, meetingEnd],
      slide: slide1,
      slide1,
      youtube: [ytStart, ytEnd],
      slide2,
      chat: [chatStart, chatEnd],
      outro: [chatEnd, Number.POSITIVE_INFINITY],
    },
    introCards: [
      { ...script.introCards.meeting, from: intro1[0] + 150, to: intro1[1] },
      { ...script.introCards.youtube, from: intro2[0] + 100, to: intro2[1] },
      { ...script.introCards.chat, from: intro3[0] + 100, to: intro3[1] },
    ],
    labels: [
      { ...script.labels.meeting, from: intro1[1] + 200, to: intro1[1] + 4200 },
      { ...script.labels.youtube, from: intro2[1] + 200, to: intro2[1] + 4200 },
      { ...script.labels.chat, from: intro3[1] + 200, to: intro3[1] + 4200 },
    ],
    meeting: {
      voice1StartMs,
      voice1EndMs,
      unlockAt,
      listenClickAt,
      voice2StartMs,
      voice2EndMs,
      ttsMeet0StartAt,
      ttsMeet0EndAt,
      ttsMeet1StartAt,
      ttsMeet1EndAt,
      ttsMeet2StartAt,
      ttsMeet2EndAt,
      voiceModalOpenAt,
      voiceSelectAt,
      voicePreviewClickAt,
      voicePreviewStartAt,
      voicePreviewEndAt,
      voiceModalCloseAt,
    },
    youtube: {
      voiceStartMs: ytVoiceStartMs,
      voiceEndMs: ytVoiceEndMs,
      unlockAt: ytUnlockAt,
      listenClickAt: ytListenClickAt,
      ttsYt0StartAt,
      ttsYt0EndAt,
      ttsYt1StartAt,
      ttsYt1EndAt,
    },
    overlayEvents,
    chat: {
      typing1,
      sarahAt,
      clickAt,
      hotkeyAt,
      pressAt,
      composeOpenAt,
      typing,
      translateAt,
      translatedAt,
      enter1At,
      pasteAt,
      enter2At,
      sentAt,
      typing2,
      replyAt,
    },
    keys: [
      { keys: ["Ctrl", "Alt", "L"], from: unlockAt - 120, to: unlockAt + 850, down: [unlockAt - 40, unlockAt + 140] },
      { keys: ["Ctrl", "Alt", "G"], from: hotkeyAt - 100, to: hotkeyAt + 1100, down: [pressAt, pressAt + 180] },
      { keys: ["Enter"], from: enter1At - 120, to: enter1At + 700, down: [enter1At, enter1At + 150] },
      { keys: ["Enter"], from: enter2At - 120, to: enter2At + 700, down: [enter2At, enter2At + 150] },
    ],
    cursorPath: [
      { at: 0, ...cur.rest, kind: "arrow" },
      { at: listenMoveFrom, ...cur.rest, kind: "arrow" },
      { at: listenArriveAt, ...cur.listenToggle, kind: "arrow" },
      { at: voiceModalOpenAt, ...cur.listenToggle, kind: "arrow" },
      { at: selectMoveFrom, ...cur.listenToggle, kind: "arrow" },
      { at: selectArriveAt, ...cur.voiceSelect, kind: "arrow" },
      { at: previewMoveFrom, ...cur.voiceSelect, kind: "arrow" },
      { at: previewArriveAt, ...cur.voicePreview, kind: "arrow" },
      { at: meetingEnd, ...cur.rest, kind: "arrow" },
      { at: ytListenMoveFrom, ...cur.rest, kind: "arrow" },
      { at: ytListenArriveAt, ...cur.listenToggle, kind: "arrow" },
      { at: ytListenLeaveFrom, ...cur.listenToggle, kind: "arrow" },
      { at: ytListenRestAt, ...cur.rest, kind: "arrow" },
      { at: moveFrom, ...cur.rest, kind: "arrow" },
      { at: arriveAt, ...cur.input, kind: "text" },
    ],
    compose: {
      text: compose.hyp,
      deltas: revealDeltas(compose.hyp, compose.first_token_ms ?? 0, compose.total_ms),
      totalMs: compose.total_ms,
    },
    sounds: [
      { at: intro1[0] + 150, kind: "transition" },
      { at: unlockAt, kind: "key" },
      { at: listenClickAt, kind: "mouse" },
      { at: voiceSelectAt, kind: "mouse" },
      { at: voicePreviewClickAt, kind: "mouse" },
      { at: slide1[0], kind: "transition" },
      { at: ytListenClickAt, kind: "mouse" },
      { at: slide2[0], kind: "transition" },
      { at: sarahAt, kind: "pop" },
      { at: clickAt, kind: "mouse" },
      { at: pressAt, kind: "key" },
      ...typing.map((k) => ({ at: k.at, kind: "key" })),
      { at: enter1At, kind: "key" },
      { at: enter2At, kind: "key" },
      { at: replyAt, kind: "pop" },
    ],
    audioPlan: {
      segments: [
        { key: "meetingVoice", atMs: voice1StartMs, srcStartMs: 0, durationMs: voice1DurationMs, gain: 0.92 },
        { key: "meetingVoice", atMs: voice2StartMs, srcStartMs: s.voiceSplitMs, durationMs: voice2DurationMs, gain: 0.92 },
        { key: "ytVoice", atMs: ytVoiceStartMs, srcStartMs: 0, durationMs: ytVoice.durationMs, gain: 0.92 },
      ],
      duckWindows: [
        { fromMs: listenClickAt, toMs: voiceModalOpenAt, gain: 0.18, fadeMs: 120 },
        { fromMs: ytListenClickAt, toMs: ttsYt0EndAt + 120, gain: 0.2, fadeMs: 120 },
        { fromMs: ttsYt1StartAt - 60, toMs: ttsYt1EndAt + 150, gain: 0.2, fadeMs: 120 },
      ],
      ttsSegments: [
        { key: "meet0", lineId: 1, atMs: ttsMeet0StartAt, durationMs: tts.meet0Ms ?? 3300, gain: 0.98 },
        { key: "meet1", lineId: 2, atMs: ttsMeet1StartAt, durationMs: tts.meet1Ms, gain: 0.98 },
        { key: "meet2", lineId: 3, atMs: ttsMeet2StartAt, durationMs: tts.meet2Ms, gain: 0.98 },
        { key: "preview", lineId: null, atMs: voicePreviewStartAt, durationMs: tts.previewMs, gain: 0.98 },
        { key: "yt0", lineId: 10, atMs: ttsYt0StartAt, durationMs: tts.yt0Ms ?? 3200, gain: 0.98 },
        { key: "yt1", lineId: 12, atMs: ttsYt1StartAt, durationMs: tts.yt1Ms, gain: 0.98 },
      ],
    },
    keyTimes: {
      "01-gioi-thieu-hop": intro1[0] + 1500,
      "02-hop-phu-de": voice1StartMs + 5000,
      "03-mo-khoa-thanh": unlockAt + 500,
      "04-bat-nghe-dich": listenClickAt + 400,
      "05-doc-ban-dich-1": ttsMeet1StartAt + 1200,
      "06-doc-ban-dich-2": ttsMeet2StartAt + 1200,
      "07-man-hinh-giong-doc": voiceModalOpenAt + 1200,
      "08-nghe-thu-giong": voicePreviewStartAt + 1200,
      "09-chuyen-canh-youtube": slide1[0] + SLIDE_MS / 2,
      "10-gioi-thieu-youtube": intro2[0] + Math.min(800, s.intro2Ms - 300),
      "11-youtube-phu-de": ytListenClickAt + 250,
      "12-youtube-giong-doc": ttsYt1StartAt + 1200,
      "13-chuyen-canh-chat": slide2[0] + SLIDE_MS / 2,
      "14-gioi-thieu-go-dich": intro3[0] + 1500,
      "15-tin-nhan-den": sarahAt + 500,
      "16-dang-go-dich": typing[Math.floor(typing.length / 2)].at + 10,
      "17-ban-dich-go-dich": translatedAt + 400,
      "18-da-gui-messenger": replyAt + 600,
      "19-ket-thuc": totalMs - 1200,
    },
  };
}
