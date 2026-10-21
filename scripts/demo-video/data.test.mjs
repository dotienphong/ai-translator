import assert from "node:assert/strict";
import { test } from "node:test";
import { composeFrom, liveProblems, slimLive } from "./data.mjs";

const report = (events, run = {}) => ({
  args: { streaming: "true" },
  machine: { cpu: "Apple M4 Pro" },
  usage: {},
  summary: { first_token_p50_ms: 400 },
  utterances: [],
  run: { session_ms: 20_000, feed_lag_max_ms: 3, sidecar_restarts: 0, asr_busy_ms: 1, ...run },
  events,
});
const sub = (t_ms, fields = {}) => ({
  t_ms,
  kind: "subtitle",
  id: 1,
  start_ms: 0,
  end_ms: 0,
  src_lang: "en",
  src_text: "Hi.",
  tgt_text: "Chào.",
  status: "done",
  provisional: false,
  replaces: [],
  ...fields,
});
const liveEv = {
  t_ms: 900,
  kind: "live",
  id: 1,
  extends: null,
  src_lang: "en",
  src_stable: "Hi",
  src_tail: "",
  tgt_stable: "Chào",
  tgt_tail: "",
  tgt_src_units: 1,
};

test("chỉ giữ sự kiện giao diện và phần run cần dùng", () => {
  const slim = slimLive(report([sub(1000), liveEv, { t_ms: 5, kind: "level" }]));
  assert.deepEqual(Object.keys(slim), ["args", "machine", "run", "summary", "events"]);
  assert.deepEqual(slim.run, { session_ms: 20_000, feed_lag_max_ms: 3, sidecar_restarts: 0 });
  assert.deepEqual(
    slim.events.map((e) => e.kind),
    ["subtitle", "live"],
  );
});

test("lượt chạy tốt thì không có vấn đề", () => {
  assert.deepEqual(liveProblems(slimLive(report([liveEv, sub(1000)]))), []);
});

test("báo phát lại chậm, tiến trình phụ khởi động lại, thiếu dòng đang nói, engine tắt chế độ, câu lỗi, không câu nào xong", () => {
  const off = { t_ms: 2, kind: "indicators", lagging: false, noAudio: false, translationUnavailable: false, streamingUnavailable: true };
  const bad = slimLive(report([sub(1000, { status: "failed" }), off], { feed_lag_max_ms: 150, sidecar_restarts: 1 }));
  assert.equal(liveProblems(bad).length, 6);
});

test("Gõ dịch lấy bản dịch, thời gian và điều kiện chạy; câu lỗi thì dừng", () => {
  const meta = { model_file: "Hy-MT2-1.8B-Q8_0.gguf", git_head: "abc", git_dirty: false };
  const row = { status: "done", hyp: "I'll send it.", total_ms: 412.5, first_token_ms: 30.1, attempts: 1 };
  assert.deepEqual(composeFrom(row, meta, "Em gửi ạ."), {
    src: "Em gửi ạ.",
    hyp: "I'll send it.",
    total_ms: 412.5,
    first_token_ms: 30.1,
    attempts: 1,
    model_file: "Hy-MT2-1.8B-Q8_0.gguf",
    git_head: "abc",
    git_dirty: false,
  });
  assert.throws(() => composeFrom({ status: "failed", reason: "quá dài" }, meta, "x"), /quá dài/);
});
