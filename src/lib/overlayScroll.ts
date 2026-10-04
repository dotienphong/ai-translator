// Cuộn của thanh phụ đề (§4.4): phần tính toán thuần, để test mà không cần DOM.

export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export type ScrollDirection = "up" | "down";

// Sai số khi coi là "đang ở đáy": cuộn bằng chuột hay trackpad hiếm khi dừng đúng pixel cuối, và `scrollTop` có thể là số lẻ
// trên màn hình Retina.
export const AT_BOTTOM_SLACK_PX = 24;

// Mỗi lần bấm phím tắt cuộn đi bao nhiêu phần của khung nhìn: chừa lại một phần để vẫn thấy dòng cuối của trang trước.
const PAGE_FRACTION = 0.8;
// Khung rất thấp (người dùng kéo nhỏ thanh) vẫn cuộn đi ít nhất chừng này, để phím tắt luôn làm gì đó.
const MIN_STEP_PX = 40;

export function atBottom(m: ScrollMetrics): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= AT_BOTTOM_SLACK_PX;
}

// Vị trí cuộn mới sau một lần bấm phím tắt cuộn lên hay xuống, không vượt đầu và đáy.
export function pagedScrollTop(m: ScrollMetrics, direction: ScrollDirection): number {
  const step = Math.max(MIN_STEP_PX, Math.round(m.clientHeight * PAGE_FRACTION));
  const max = Math.max(0, m.scrollHeight - m.clientHeight);
  const next = direction === "up" ? m.scrollTop - step : m.scrollTop + step;
  return Math.min(max, Math.max(0, next));
}
