// Số việc cần xử lý dùng chung giữa trang Việc cần xử lý và huy hiệu ở thanh bên (spec giao diện mới, mục 2).
// App tải hàng đợi một lần lúc mở và chỉ GIEO số khi kho còn trống (seedQueueCount); trang Việc cần xử lý ĐẨY số mới sau
// mỗi lần tải hay Làm mới (setQueueCount), nên kết quả về muộn của lần tải lúc mở App không đè số mới hơn của trang.
// Đọc bằng useSyncExternalStore (useQueueCount). null: chưa biết (chưa tải xong hay tải lỗi), thanh bên không hiện gì.
import { useSyncExternalStore } from "react";
import type { Queue } from "./api/types";

let count: number | null = null;
const listeners = new Set<() => void>();

function emit(next: number | null): void {
  if (next === count) return;
  count = next;
  for (const l of listeners) l();
}

/** Tổng số việc của mọi nhóm (theo `count` của server, không theo số dòng trả về). */
export function queueTotal(q: Queue): number {
  return q.needs_review.count + q.underpaid.count + q.email_failed.count + q.locked.count + q.conflict.count + q.alerts.count;
}

/** Số mới nhất (trang Việc cần xử lý vừa tải xong): luôn ghi đè. */
export function setQueueCount(n: number): void {
  emit(n);
}

/** Số của lần tải lúc mở App: chỉ ghi khi kho chưa có số nào. */
export function seedQueueCount(n: number): void {
  if (count === null) emit(n);
}

export function getQueueCount(): number | null {
  return count;
}

export function subscribeQueueCount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useQueueCount(): number | null {
  return useSyncExternalStore(subscribeQueueCount, getQueueCount, getQueueCount);
}

/** Chỉ cho test: đưa kho về trạng thái chưa biết giữa các ca. */
export function resetQueueCount(): void {
  emit(null);
}
