import assert from "node:assert/strict";
import { test } from "node:test";
import { composeBox, meetingTiles, overlayBox, pingPong, pixelSize } from "./desktop-layout.mjs";

const LAYOUT = {
  workArea: { width: 1536, height: 912 },
  meeting: { titleBar: 32, topBar: 48, controlBar: 72, padding: 12, gap: 10 },
  overlay: { width: 900, height: 200, fontSize: 22, bottomGap: 72 },
  compose: { width: 560, topRatio: 0.25 },
};

test("lưới 2×2 nằm giữa thanh trên và thanh điều khiển, cách nhau 10 điểm", () => {
  assert.deepEqual(meetingTiles(LAYOUT), [
    { left: 12, top: 92, width: 751, height: 363 },
    { left: 773, top: 92, width: 751, height: 363 },
    { left: 12, top: 465, width: 751, height: 363 },
    { left: 773, top: 465, width: 751, height: 363 },
  ]);
});

test("thanh phụ đề đặt như app: giữa, cách đáy vùng làm việc 72 điểm", () => {
  assert.deepEqual(overlayBox(LAYOUT), { left: 318, top: 640, width: 900, height: 200 });
});

test("ô Gõ dịch đặt như app trên Windows: giữa màn hình, mép trên ở 25% chiều cao", () => {
  assert.deepEqual(composeBox(LAYOUT, { width: 1536, height: 960 }), { left: 488, top: 240, width: 560 });
});

test("cỡ ảnh của ô ở mật độ 1,25, làm tròn số chẵn", () => {
  assert.deepEqual(pixelSize({ width: 751, height: 363 }, 1.25), { width: 938, height: 454 });
});

test("chỉ số khung chạy tới rồi lùi khi clip ngắn hơn cảnh", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => pingPong(i, 4)),
    [0, 1, 2, 3, 2, 1, 0, 1, 2, 3],
  );
  assert.equal(pingPong(5, 1), 0);
});
