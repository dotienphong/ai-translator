import assert from "node:assert/strict";
import { test } from "node:test";
import { assetProblems, cropFilter } from "./assets.mjs";

const LICENSE = { name: "Mixkit Stock Video Free License", url: "https://mixkit.co/license/#videoFree", checked: "2026-10-21" };
const video = {
  name: "p1",
  kind: "video",
  page: "https://mixkit.co/free-stock-video/having-a-video-call-working-from-home-10446/",
  download: "https://assets.mixkit.co/videos/10446/10446-720.mp4",
  start: 1.5,
  duration: 12,
  focus: { x: 0.5, y: 0.4 },
};
const still = { ...video, name: "p1-still", kind: "still", at: 3, start: undefined, duration: undefined };

test("danh sách đúng thì không có vấn đề", () => {
  assert.deepEqual(assetProblems({ license: LICENSE, items: [video, still] }), []);
});

test("báo thiếu giấy phép, tên trùng, nguồn lạ, thiếu đoạn cắt, tâm khung sai", () => {
  const bad = [
    video,
    { ...video, download: "https://example.com/a.mp4", page: "https://example.com/" },
    { ...video, name: "p2", kind: "video", duration: undefined },
    { ...still, name: "s", at: undefined, focus: { x: 2, y: 0 } },
    { ...video, name: "x", kind: "gif" },
  ];
  const problems = assetProblems({ license: { name: "?" }, items: bad });
  assert.ok(problems.some((p) => p.includes("license")));
  assert.ok(problems.some((p) => p.includes("trùng")));
  assert.ok(problems.some((p) => p.includes("assets.mixkit.co")));
  assert.ok(problems.some((p) => p.includes("mixkit.co")) && problems.some((p) => p.includes("trang nguồn")));
  assert.ok(problems.some((p) => p.includes("p2") && p.includes("duration")));
  assert.ok(problems.some((p) => p.includes("s:") && p.includes("at")));
  assert.ok(problems.some((p) => p.includes("focus")));
  assert.ok(problems.some((p) => p.includes("kind")));
});

test("cắt vùng lớn nhất đúng tỉ lệ ô quanh tâm khung rồi hạ cỡ", () => {
  assert.equal(
    cropFilter({ width: 1280, height: 720 }, { width: 938, height: 454 }, { x: 0.5, y: 0.5 }),
    "crop=1280:618:0:51,scale=938:454:flags=lanczos",
  );
  assert.equal(
    cropFilter({ width: 1280, height: 720 }, { width: 320, height: 320 }, { x: 0.3, y: 0.4 }),
    "crop=720:720:24:0,scale=320:320:flags=lanczos",
  );
  // Tâm sát mép phải: vùng cắt không ra ngoài khung.
  assert.equal(
    cropFilter({ width: 1280, height: 720 }, { width: 320, height: 320 }, { x: 0.99, y: 0.5 }),
    "crop=720:720:560:0,scale=320:320:flags=lanczos",
  );
});

test("zoom cắt sát hơn quanh tâm khung (ảnh đại diện từ cảnh quay rộng), vẫn không ra ngoài khung", () => {
  assert.equal(
    cropFilter({ width: 1280, height: 720 }, { width: 320, height: 320 }, { x: 0.5, y: 0.22 }, 2),
    "crop=360:360:460:0,scale=320:320:flags=lanczos",
  );
  assert.equal(
    cropFilter({ width: 1280, height: 720 }, { width: 320, height: 320 }, { x: 0.5, y: 0.5 }, 2),
    "crop=360:360:460:180,scale=320:320:flags=lanczos",
  );
});

test("zoom phải từ 1 trở lên", () => {
  const item = {
    name: "s",
    kind: "still",
    page: "https://mixkit.co/free-stock-video/having-a-video-call-working-from-home-10446/",
    download: "https://assets.mixkit.co/videos/10446/10446-720.mp4",
    at: 1,
    focus: { x: 0.5, y: 0.5 },
  };
  assert.deepEqual(assetProblems({ license: LICENSE, items: [{ ...item, zoom: 2 }] }), []);
  assert.ok(assetProblems({ license: LICENSE, items: [{ ...item, zoom: 0.5 }] }).some((p) => p.includes("zoom")));
});
