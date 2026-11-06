import assert from "node:assert/strict";
import test from "node:test";
import { decodeResponseFrame, encodeShutdownFrame, encodeSpeakFrame, encodeVarint } from "./tts-win.mjs";

test("encodeVarint mã hóa đúng số nguyên không âm theo chuẩn postcard", () => {
  assert.deepEqual([...encodeVarint(0)], [0]);
  assert.deepEqual([...encodeVarint(127)], [127]);
  assert.deepEqual([...encodeVarint(128)], [0x80, 0x01]);
  assert.deepEqual([...encodeVarint(9600)], [0x80, 0x4b]);
});

test("encodeSpeakFrame ghi độ dài u32 LE và đúng byte UTF-8 cho chữ tiếng Việt", () => {
  const frame = encodeSpeakFrame({ id: 7, lang: "vi", text: "Xin chào", voice: "Thục Đoan", speed: null, pauseScale: null });
  const len = frame.readUInt32LE(0);
  assert.equal(frame.length, 4 + len);
  const body = frame.subarray(4);
  assert.equal(body[0], 0); // Request::Speak variant = 0
  assert.equal(body[1], 7); // id = 7
  assert.equal(body[2], 0); // Lang::Vi = 0
  const textBytes = Buffer.from("Xin chào", "utf8");
  assert.equal(body[3], textBytes.length);
  assert.deepEqual(body.subarray(4, 4 + textBytes.length), textBytes);
});

test("encodeShutdownFrame và decodeResponseFrame giải mã đúng Ready, Audio zigzag i16, Done", () => {
  const shut = encodeShutdownFrame();
  assert.deepEqual([...shut], [1, 0, 0, 0, 2]);
  assert.deepEqual(decodeResponseFrame(Buffer.from([0, 3])), { kind: "ready", protocol: 3 });
  const audio = decodeResponseFrame(Buffer.from([1, 1, 0, 4, 0, 2, 1, 4]));
  assert.equal(audio.kind, "audio");
  assert.deepEqual([...audio.pcm], [0, 1, -1, 2]);
  assert.deepEqual(decodeResponseFrame(Buffer.from([2, 5])), { kind: "done", id: 5 });
});
