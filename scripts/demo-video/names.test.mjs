import assert from "node:assert/strict";
import { test } from "node:test";
import { dataName, fontStack, htmlLang, voiceName } from "./names.mjs";

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
