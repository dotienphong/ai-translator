// Lịch thời gian của video (spec 2026-10-21-demo-video §3): module thuần, dùng chung cho trang dựng cảnh (stage.mjs, trình
// duyệt) và phần âm thanh (render.mjs, Node). Mọi mốc là ms tính từ đầu video.

export const FPS = 30;
export const FRAME_MS = 1000 / FPS;
// Phần latency-bench không đo: thu âm và resample 30–60 ms, tới màn hình 10–20 ms (bench/2026-10-10-do-tre/README.md mục 0).
// Lấy cận trên để video không nhanh hơn thật.
export const CAPTURE_DISPLAY_MS = 80;
// Ô soạn chờ chừng này sau ký tự cuối rồi mới xin dịch (`DEBOUNCE_MS` của src/store/compose.ts). render.mjs kiểm lại bằng lần
// gọi thật, nên số này lệch với app thì lần quay báo lỗi.
export const COMPOSE_DEBOUNCE_MS = 400;
export const CROSSFADE_MS = 400;

// Sự kiện của latency-bench → sự kiện Tauri mà thanh phụ đề nghe (src-tauri/src/events.rs).
const EVENT_NAMES = {
  subtitle: "subtitle://upsert",
  delta: "subtitle://delta",
  live: "subtitle://live",
  live_end: "subtitle://live-end",
};

/** Sự kiện phụ đề đặt vào video: lúc giọng bắt đầu + `t_ms` + phần không đo. Giữ thứ tự và nội dung. */
export function subtitleEvents(events, voiceStartMs) {
  return events
    .filter((e) => Object.hasOwn(EVENT_NAMES, e.kind))
    .map(({ t_ms, kind, ...payload }) => ({ at: voiceStartMs + t_ms + CAPTURE_DISPLAY_MS, event: EVENT_NAMES[kind], payload }));
}

/** Mức âm lượng cho chấm "đang nghe" của thanh phụ đề (`audio://level`), mỗi khung của voice.json một lần. */
export function levelEvents(levels, windowMs, voiceStartMs) {
  return levels.map((rms, i) => ({ at: voiceStartMs + i * windowMs, event: "audio://level", payload: rms }));
}

/** Mức âm lượng của giọng ở thời điểm `t` (0 ngoài phần giọng). */
export function levelAt(voice, voiceStartMs, t) {
  const i = Math.floor((t - voiceStartMs) / voice.levelWindowMs);
  return i >= 0 && i < voice.levels.length ? voice.levels[i] : 0;
}

/** Lịch gõ từng ký tự; mỗi bước là chữ đã có trong ô. Mọi khoảng cách dưới thời gian chờ của ô soạn: chỉ một lần xin dịch. */
export function typingSchedule(text, startMs, pace) {
  for (const [k, v] of Object.entries(pace)) {
    if (v >= COMPOSE_DEBOUNCE_MS) throw new Error(`pace.${k} = ${v} ms: phải dưới ${COMPOSE_DEBOUNCE_MS} ms`);
  }
  const chars = Array.from(text.normalize("NFC"));
  const steps = [];
  let at = startMs;
  chars.forEach((ch, i) => {
    steps.push({ at, text: chars.slice(0, i + 1).join("") });
    at += /[,.!?]/.test(ch) ? pace.punctuationMs : ch === " " ? pace.spaceMs : pace.charMs;
  });
  return steps;
}

/** Bản dịch của ô soạn về dần (xấp xỉ stream từng token): mảnh đầu ở `firstMs`, rải đều mỗi khung, mảnh cuối trước `totalMs`. */
export function revealDeltas(text, firstMs, totalMs) {
  const chars = Array.from(text);
  const span = Math.max(0, totalMs - firstMs);
  const n = Math.max(1, Math.min(chars.length, Math.round(span / FRAME_MS)));
  const out = [];
  let shown = 0;
  for (let k = 0; k < n; k++) {
    const upto = Math.ceil((chars.length * (k + 1)) / n);
    if (upto > shown) out.push({ after: firstMs + (span * k) / n, text: chars.slice(shown, upto).join("") });
    shown = upto;
  }
  return out;
}

/** Độ hiện (0–1) của một cảnh [from, to): mờ dần qua `ms` quanh hai mép; cảnh bắt đầu từ 0 thì hiện ngay. */
export function visibility(t, [from, to], ms = CROSSFADE_MS) {
  const fadeIn = from <= 0 ? 1 : (t - from) / ms + 0.5;
  const fadeOut = (to - t) / ms + 0.5;
  return Math.max(0, Math.min(1, fadeIn, fadeOut));
}

/** Lịch cả video từ kịch bản và dữ liệu thật (voice.json, live.json, compose.json). */
export function buildTimeline(script, voice, live, compose) {
  const s = script.timing;
  const c = s.chat;
  const voiceStartMs = s.hookMs;
  const subtitles = subtitleEvents(live.events, voiceStartMs);
  const lastAt = subtitles.length > 0 ? subtitles.at(-1).at : voiceStartMs;
  const liveEnd = Math.max(voiceStartMs + voice.durationMs, lastAt) + s.liveHoldMs;
  const hotkeyAt = liveEnd + c.hotkeyMs;
  const pressAt = hotkeyAt + c.pressMs;
  const composeOpenAt = hotkeyAt + c.openAfterHotkeyMs;
  const typing = typingSchedule(script.chat.reply, composeOpenAt + c.typingAfterOpenMs, c.pace);
  const translateAt = typing.at(-1).at + COMPOSE_DEBOUNCE_MS;
  const translatedAt = translateAt + compose.total_ms;
  const enter1At = translatedAt + c.readMs;
  const pasteAt = enter1At + c.pasteMs;
  const enter2At = pasteAt + c.reviewMs;
  const chatEnd = enter2At + c.holdMs;
  const totalMs = chatEnd + s.outroMs;
  const sarahAt = liveEnd + c.sarahMsgMs;
  return {
    totalMs,
    frames: Math.ceil(totalMs / FRAME_MS),
    voiceStartMs,
    posterMs: liveEnd - s.liveHoldMs / 2,
    scenes: { live: [0, liveEnd], chat: [liveEnd, chatEnd], outro: [chatEnd, Number.POSITIVE_INFINITY] },
    captions: [
      { ...script.captions.hook, from: 0, to: voiceStartMs },
      { ...script.captions.live, from: voiceStartMs, to: liveEnd },
      { ...script.captions.chat, from: liveEnd, to: chatEnd },
    ],
    overlayEvents: [...subtitles, ...levelEvents(voice.levels, voice.levelWindowMs, voiceStartMs)].sort((a, b) => a.at - b.at),
    chat: { sarahAt, hotkeyAt, pressAt, composeOpenAt, typing, translateAt, translatedAt, enter1At, pasteAt, enter2At },
    compose: {
      text: compose.hyp,
      deltas: revealDeltas(compose.hyp, compose.first_token_ms ?? 0, compose.total_ms),
      totalMs: compose.total_ms,
    },
    sounds: [pressAt, ...typing.map((k) => k.at), enter1At, enter2At].map((at) => ({ at, kind: "key" })),
    // Khung chính để xem lại (spec §5.5): tên ảnh → thời điểm.
    keyTimes: {
      "01-mo-dau": 1500,
      "02-dang-noi": voiceStartMs + 4000,
      "03-phu-de": liveEnd - s.liveHoldMs / 2,
      "04-tin-nhan": sarahAt + 600,
      "05-phim-tat": pressAt + 60,
      "06-dang-go": typing[Math.floor(typing.length / 2)].at + 10,
      "07-ban-dich": translatedAt + 300,
      "08-da-dan": pasteAt + 400,
      "09-da-gui": enter2At + 700,
      "10-ket": totalMs - 1500,
    },
  };
}
