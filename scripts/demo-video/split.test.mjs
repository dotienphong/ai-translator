import assert from "node:assert/strict";
import { test } from "node:test";
import { FADE_FRAMES, clipFrames, ffmpegArgs, splitPlan } from "./split.mjs";
import { CROSSFADE_MS } from "./timeline.mjs";

// Mốc thật của bản tiếng Việt (desktop.vi) và tiếng Anh (desktop.en): cảnh họp, cảnh chat, màn kết.
const VI = { frames: 1215, scenes: { meeting: [0, 20103], slide: [20103, 21003], chat: [21003, 36493.9752], outro: [36493.9752, Infinity] } };
const EN = { frames: 1163, scenes: { meeting: [0, 18760], slide: [18760, 19660], chat: [19660, 34738.756], outro: [34738.756, Infinity] } };

test("kế hoạch cắt bản tiếng Việt: họp tới trước khi trượt cảnh, chat từ khung đã trượt xong, màn kết từ khi hiện hẳn", () => {
  // 20103 ms / 33,33 = 603,09 → khung 603 (t = 20100) còn là cảnh họp, khung 604 đã trượt.
  // 21003 ms → khung 631 (t = 21033) là khung đầu tiên sau khi trượt xong.
  // Màn kết mờ dần vào quanh chatEnd trong CROSSFADE_MS: hiện hẳn từ chatEnd + CROSSFADE_MS / 2.
  assert.deepEqual(splitPlan(VI), { total: 1215, meeting: [0, 604], chat: [631, 1215], outro: [1101, 1215] });
});

test("kế hoạch cắt bản tiếng Anh khác bản tiếng Việt (mốc tính từ lịch, không gõ tay)", () => {
  assert.deepEqual(splitPlan(EN), { total: 1163, meeting: [0, 563], chat: [590, 1163], outro: [1049, 1163] });
});

test("mốc đúng bằng một khung thì khung đó thuộc cảnh sau, không bị làm tròn lên nhầm do số thực", () => {
  const tl = { frames: 900, scenes: { meeting: [0, 21000], chat: [22000, 27000] } };
  const p = splitPlan(tl);
  assert.equal(p.meeting[1], 630);
  assert.equal(p.chat[0], 660);
  assert.equal(p.outro[0], Math.ceil(((27000 + CROSSFADE_MS / 2) * 30) / 1000));
});

test("ba đoạn không chồng nhau và nằm trong video", () => {
  for (const tl of [VI, EN]) {
    const p = splitPlan(tl);
    assert.ok(p.meeting[0] === 0 && p.meeting[1] > 0);
    assert.ok(p.meeting[1] <= p.chat[0], "cảnh họp phải hết trước khi cảnh chat bắt đầu");
    assert.ok(p.chat[0] < p.outro[0] && p.outro[0] < p.total, "màn kết nằm trong cảnh chat tới hết video");
    assert.equal(p.chat[1], p.total);
    assert.equal(p.outro[1], p.total);
  }
});

test("số khung của hai video: họp trừ đoạn chồng chuyển mờ, Gõ dịch giữ nguyên", () => {
  assert.equal(FADE_FRAMES, 12);
  const p = splitPlan(VI);
  assert.equal(clipFrames(p, "meeting"), 604 + (1215 - 1101) - FADE_FRAMES);
  assert.equal(clipFrames(p, "typing"), 1215 - 631);
});

test("lệnh ffmpeg: cắt theo khung, chuyển mờ cho video họp, mờ dần vào cho video Gõ dịch, mã hóa như render.mjs", () => {
  const p = splitPlan(VI);
  const meeting = ffmpegArgs("meeting", p, "in.mp4", "out.mp4.part");
  const graph = meeting[meeting.indexOf("-filter_complex") + 1];
  assert.match(graph, /trim=start_frame=0:end_frame=604/);
  assert.match(graph, /trim=start_frame=1101:end_frame=1215/);
  // (604 - 12 - 0,5 khung) / 30 = 19,7167 s: lùi nửa khung để làm tròn không làm thừa một khung.
  assert.match(graph, /xfade=transition=fade:duration=0\.4:offset=19\.7167[,:]/);
  assert.match(graph, /acrossfade=d=0\.4/);
  const typing = ffmpegArgs("typing", p, "in.mp4", "out.mp4.part");
  const g2 = typing[typing.indexOf("-filter_complex") + 1];
  assert.match(g2, /trim=start_frame=631:end_frame=1215/);
  assert.match(g2, /fade=t=in:st=0:d=0\.3/);
  assert.match(g2, /afade=t=in:st=0:d=0\.3/);
  for (const a of [meeting, typing]) {
    assert.deepEqual(a.slice(a.indexOf("-c:v"), a.indexOf("-c:v") + 6), ["-c:v", "libx264", "-preset", "slow", "-crf", "18"]);
    assert.ok(a.includes("+faststart"));
    assert.equal(a.at(-1), "out.mp4.part");
  }
  assert.throws(() => ffmpegArgs("khac", p, "in.mp4", "out"), /kind/);
});
