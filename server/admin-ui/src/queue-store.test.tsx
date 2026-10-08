import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Queue } from "./api/types";
import { getQueueCount, queueTotal, resetQueueCount, seedQueueCount, setQueueCount, subscribeQueueCount, useQueueCount } from "./queue-store";

const g = (count: number) => ({ count, items: [] });

describe("queue-store", () => {
  it("tổng theo count của server ở cả sáu nhóm (không theo số dòng trả về)", () => {
    const q: Queue = { needs_review: g(1), underpaid: g(2), email_failed: g(3), locked: g(4), conflict: g(5), alerts: g(6) };
    expect(queueTotal(q)).toBe(21);
  });

  it("chưa biết là null; set ghi đè; seed chỉ ghi khi còn trống (kết quả về muộn lúc mở App không đè số mới)", () => {
    expect(getQueueCount()).toBeNull();
    seedQueueCount(3);
    expect(getQueueCount()).toBe(3);
    seedQueueCount(9);
    expect(getQueueCount()).toBe(3);
    setQueueCount(5);
    expect(getQueueCount()).toBe(5);
    setQueueCount(0);
    seedQueueCount(7);
    expect(getQueueCount()).toBe(0);
    resetQueueCount();
    expect(getQueueCount()).toBeNull();
  });

  it("báo cho người nghe khi số đổi (không báo khi giống cũ); hủy đăng ký thì thôi báo", () => {
    const l = vi.fn();
    const off = subscribeQueueCount(l);
    setQueueCount(2);
    setQueueCount(2);
    expect(l).toHaveBeenCalledTimes(1);
    off();
    setQueueCount(4);
    expect(l).toHaveBeenCalledTimes(1);
  });

  it("useQueueCount vẽ lại khi số đổi", () => {
    function Probe() {
      const n = useQueueCount();
      return <span>{n === null ? "chưa biết" : `số ${n}`}</span>;
    }
    render(<Probe />);
    expect(screen.getByText("chưa biết")).toBeTruthy();
    act(() => setQueueCount(8));
    expect(screen.getByText("số 8")).toBeTruthy();
  });
});
