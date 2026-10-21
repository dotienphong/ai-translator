// Lịch thời gian bản 16:10 (spec 2026-10-21-demo-video-desktop §3): module thuần, dùng chung cho desktop.mjs (trình duyệt) và
// render.mjs (Node). Mọi mốc là ms từ đầu video. Dùng lại các hàm của timeline.mjs (bản dọc): phụ đề cộng 80 ms, mức âm lượng, lịch
// gõ, bản dịch về dần. Trả cùng các trường render.mjs cần như lịch bản dọc.
import { COMPOSE_DEBOUNCE_MS, FRAME_MS, levelEvents, revealDeltas, subtitleEvents, typingSchedule } from "./timeline.mjs";

// Chuyển desktop ảo: cả màn hình trượt ngang.
export const SLIDE_MS = 900;

/** Làm mượt đầu cuối (easeInOutCubic) cho `p` trong [0, 1]. */
export const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** Con trỏ ở thời điểm `t` theo các mốc `[{ at, x, y, kind }]`: đứng yên ở mốc, đi mượt giữa hai mốc, đổi hình khi tới mốc sau. */
export function cursorAt(path, t) {
  if (t <= path[0].at) return { x: path[0].x, y: path[0].y, kind: path[0].kind };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (t < b.at) {
      const p = ease((t - a.at) / (b.at - a.at));
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, kind: a.kind };
    }
  }
  const last = path.at(-1);
  return { x: last.x, y: last.y, kind: last.kind };
}

/** Lịch cả video bản 16:10 từ kịch bản và dữ liệu thật (voice.json, live.json, compose.json). */
export function buildDesktopTimeline(script, voice, live, compose) {
  if (compose.src !== script.chat.reply) {
    throw new Error(`câu trả lời của kịch bản khác câu đã dịch trong compose.json ("${compose.src}"): chạy lại data.mjs`);
  }
  const s = script.timing;
  const c = s.chat;
  const voiceStartMs = s.voiceStartMs;
  const subtitles = subtitleEvents(live.events, voiceStartMs);
  const lastAt = subtitles.length > 0 ? subtitles.at(-1).at : voiceStartMs;
  const liveEnd = Math.max(voiceStartMs + voice.durationMs, lastAt) + s.liveHoldMs;
  const slide = [liveEnd, liveEnd + SLIDE_MS];
  const chatStart = slide[1];
  const typing1 = [chatStart + c.typing1StartMs, chatStart + c.typing1StartMs + c.typing1Ms];
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
  const { rest, input } = script.layout.cursor;
  return {
    totalMs,
    frames: Math.ceil(totalMs / FRAME_MS),
    voiceStartMs,
    posterMs: liveEnd - s.liveHoldMs / 2,
    scenes: { meeting: [0, liveEnd], slide, chat: [chatStart, chatEnd], outro: [chatEnd, Number.POSITIVE_INFINITY] },
    labels: [
      { ...script.labels.meeting, from: s.meetingLabel.from, to: s.meetingLabel.to },
      { ...script.labels.chat, from: chatStart + s.chatLabel.from, to: chatStart + s.chatLabel.to },
    ],
    overlayEvents: [...subtitles, ...levelEvents(voice.levels, voice.levelWindowMs, voiceStartMs)].sort((a, b) => a.at - b.at),
    chat: {
      typing1, sarahAt, clickAt, hotkeyAt, pressAt, composeOpenAt, typing, translateAt, translatedAt, enter1At, pasteAt, enter2At,
      sentAt, typing2, replyAt,
    },
    keys: [
      { keys: ["Ctrl", "Alt", "G"], from: hotkeyAt - 100, to: hotkeyAt + 1100, down: [pressAt, pressAt + 180] },
      { keys: ["Enter"], from: enter1At - 120, to: enter1At + 700, down: [enter1At, enter1At + 150] },
      { keys: ["Enter"], from: enter2At - 120, to: enter2At + 700, down: [enter2At, enter2At + 150] },
    ],
    cursorPath: [
      { at: 0, ...rest, kind: "arrow" },
      { at: moveFrom, ...rest, kind: "arrow" },
      { at: arriveAt, ...input, kind: "text" },
    ],
    compose: {
      text: compose.hyp,
      deltas: revealDeltas(compose.hyp, compose.first_token_ms ?? 0, compose.total_ms),
      totalMs: compose.total_ms,
    },
    sounds: [
      { at: sarahAt, kind: "pop" },
      { at: clickAt, kind: "mouse" },
      { at: pressAt, kind: "key" },
      ...typing.map((k) => ({ at: k.at, kind: "key" })),
      { at: enter1At, kind: "key" },
      { at: enter2At, kind: "key" },
      { at: replyAt, kind: "pop" },
    ],
    // Khung chính để xem lại (spec §6.4): tên ảnh → thời điểm.
    keyTimes: {
      "01-hop": 400,
      "02-dang-noi": voiceStartMs + 4500,
      "03-phu-de": liveEnd - s.liveHoldMs / 2,
      "04-chuyen-canh": slide[0] + SLIDE_MS / 2,
      "05-dang-nhap": typing1[0] + 600,
      "06-tin-nhan": sarahAt + 500,
      "07-phim-tat": pressAt + 60,
      "08-dang-go": typing[Math.floor(typing.length / 2)].at + 10,
      "09-ban-dich": translatedAt + 300,
      "10-da-dan": pasteAt + 400,
      "11-da-gui": sentAt + 500,
      "12-tra-loi": replyAt + 600,
      "13-ket": totalMs - 1000,
    },
  };
}
