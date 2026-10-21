// Bố cục thuần của bản 16:10 (spec 2026-10-21-demo-video-desktop §2.3), dùng chung cho trang dựng cảnh và assets.mjs. Toạ độ là
// điểm CSS của màn hình 1536×960; vị trí thanh phụ đề và ô Gõ dịch theo đúng app (src-tauri/src/overlay/placement.rs,
// src-tauri/src/compose/native_windows.rs).

/** Bốn ô của lưới 2×2 trong cửa sổ họp phóng to. */
export function meetingTiles(L) {
  const M = L.meeting;
  const top = M.titleBar + M.topBar + M.padding;
  const bottom = L.workArea.height - M.controlBar - M.padding;
  const width = (L.workArea.width - 2 * M.padding - M.gap) / 2;
  const height = (bottom - top - M.gap) / 2;
  return [0, 1, 2, 3].map((i) => ({
    left: M.padding + (i % 2) * (width + M.gap),
    top: top + Math.floor(i / 2) * (height + M.gap),
    width,
    height,
  }));
}

/** Thanh phụ đề ở chỗ mặc định của app: giữa vùng làm việc, cách đáy `bottomGap`. */
export function overlayBox(L) {
  const o = L.overlay;
  return { left: (L.workArea.width - o.width) / 2, top: L.workArea.height - o.bottomGap - o.height, width: o.width, height: o.height };
}

/** Ô Gõ dịch ở chỗ app mở trên Windows: giữa màn hình, mép trên ở `topRatio` chiều cao màn hình. */
export function composeBox(L, viewport) {
  return { left: (viewport.width - L.compose.width) / 2, top: Math.round(viewport.height * L.compose.topRatio), width: L.compose.width };
}

/** Cỡ ảnh (điểm ảnh) của một ô ở mật độ `dpr`, làm tròn số chẵn cho ffmpeg. */
export function pixelSize(box, dpr) {
  const even = (v) => 2 * Math.round((v * dpr) / 2);
  return { width: even(box.width), height: even(box.height) };
}

/** Khung thứ `i` của một clip `count` khung chạy tới rồi lùi (0, 1, …, count-1, count-2, …, 1, 0, 1, …). */
export function pingPong(i, count) {
  if (count <= 1) return 0;
  const k = i % (2 * count - 2);
  return k < count ? k : 2 * count - 2 - k;
}
