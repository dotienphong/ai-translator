import assert from "node:assert/strict";
import { test } from "node:test";
import { dataName, fontStack, htmlLang, voiceName } from "./names.mjs";
import { readFileSync } from "node:fs";
import { typingSchedule } from "./timeline.mjs";

test("dataName: kịch bản tự khai `data` thì dùng nó, không thì trùng tên kịch bản", () => {
  assert.equal(dataName({ data: "vi" }, "desktop.vi"), "vi");
  assert.equal(dataName({}, "desktop.ja"), "desktop.ja");
});

test("voiceName: `voiceFrom` > `data` > tên kịch bản", () => {
  assert.equal(voiceName({ voiceFrom: "vi" }, "desktop.ja"), "vi");
  assert.equal(voiceName({ data: "vi" }, "desktop.vi"), "vi");
  assert.equal(voiceName({}, "desktop.en"), "desktop.en");
});

test("htmlLang và fontStack: vi/en giữ phông cũ; ja/zh/ko thêm phông CJK của macOS sau Noto Sans", () => {
  assert.deepEqual(["vi", "en", "ja", "zh", "ko"].map(htmlLang), ["vi", "en", "ja", "zh-Hans", "ko"]);
  assert.equal(fontStack("vi"), '"Demo UI",sans-serif');
  assert.equal(fontStack("en"), '"Demo UI",sans-serif');
  assert.equal(fontStack("ja"), '"Demo UI","Hiragino Sans",sans-serif');
  assert.equal(fontStack("zh"), '"Demo UI","PingFang SC",sans-serif');
  assert.equal(fontStack("ko"), '"Demo UI","Apple SD Gothic Neo",sans-serif');
});

const read = (name) => JSON.parse(readFileSync(new URL(`./script.${name}.json`, import.meta.url), "utf8"));
const typingMs = (s) => {
  const steps = typingSchedule(s.chat.reply, 0, s.timing.chat.pace);
  return steps.at(-1).at;
};

test("kịch bản ja/zh/ko: dùng lại bản thu tiếng Anh của bản vi, đích đúng ngôn ngữ, Gõ dịch sang tiếng Anh, ngày theo thói quen của Windows", () => {
  const vi = read("desktop.vi");
  const dates = { ja: "2026/10/21", zh: "2026/10/21", ko: "2026-10-21" };
  for (const lang of ["ja", "zh", "ko"]) {
    const s = read(`desktop.${lang}`);
    assert.equal(s.stage, "desktop", lang);
    assert.equal(s.voiceFrom, "vi", lang);
    assert.equal(s.data, undefined, `${lang}: không khai data (bộ chữ riêng)`);
    assert.equal(s.target, lang);
    assert.equal(s.chat.replyLang, lang);
    assert.equal(s.chat.replyTarget, "en");
    assert.equal(s.taskbar.date, dates[lang]);
    assert.deepEqual(s.layout, vi.layout, `${lang}: layout`);
    assert.deepEqual(s.viewport, vi.viewport, `${lang}: viewport`);
    assert.deepEqual({ ...s.timing.chat, pace: null }, { ...vi.timing.chat, pace: null }, `${lang}: timing.chat ngoài pace`);
    const ratio = typingMs(s) / typingMs(vi);
    assert.ok(ratio > 0.85 && ratio < 1.15, `${lang}: đoạn gõ dài ${typingMs(s)} ms, bản vi ${typingMs(vi)} ms`);
    assert.ok(!/\b(?:Teams|Meet|Messenger|Windows|Apple|Zoom)\b/.test(JSON.stringify({ labels: s.labels, chat: s.chat, ui: s.ui, call: s.call })), `${lang}: không tên thương hiệu`);
  }
});