import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { ErrorBox, Notice, TOAST_MS, ToastProvider, useToast } from "./Feedback";

describe("ErrorBox", () => {
  it("alert có câu lỗi và nút Thử lại", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorBox error={new ApiError(500, "internal")} onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Lỗi máy chủThử lại");
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("phiên hết hạn: không có Thử lại (phải tải lại trang)", () => {
    render(<ErrorBox error={new ApiError(401, "session_expired")} onRetry={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tiêu đề tùy chọn đứng trước câu lỗi", () => {
    render(<ErrorBox error={new ApiError(0, "network")} title="Không tải được danh sách đơn" />);
    expect(screen.getByRole("alert").textContent).toBe("Không tải được danh sách đơnKhông kết nối được máy chủ");
  });
});

describe("Notice", () => {
  it("status có chữ và nút Đóng; tông thành lớp", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<Notice text="Đã gia hạn." onClose={onClose} />);
    const status = screen.getByRole("status");
    expect(status.className).toBe("notice tone-ok");
    expect(status.textContent).toBe("Đã gia hạn.");
    await user.click(screen.getByRole("button", { name: "Đóng" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Notice text="x" tone="warn" onClose={onClose} />);
    expect(screen.getByRole("status").className).toBe("notice tone-warn");
  });
});

function Trigger({ text, tone }: { text: string; tone?: "ok" | "bad" }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(text, { tone })}>
      Bấm
    </button>
  );
}

describe("Toast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("vùng status luôn có sẵn; hiện thông báo, tự đóng sau 4 giây", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger text="Đã chép email" />
      </ToastProvider>,
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Bấm" }));
    expect(region.textContent).toBe("Đã chép email");
    expect(region.querySelector(".toast")?.className).toBe("toast tone-ok");
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(region.textContent).toBe("Đã chép email");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region.textContent).toBe("");
  });

  it("nút đóng bỏ thông báo ngay và hủy hẹn giờ", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger text="Đã lưu" tone="bad" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bấm" }));
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Đóng thông báo" }));
    expect(screen.getByRole("status").textContent).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tối đa ba thông báo, cái cũ nhất bị bỏ trước", () => {
    vi.useFakeTimers();
    let n = 0;
    function Many() {
      const toast = useToast();
      return (
        <button type="button" onClick={() => toast.show(`T${++n}`)}>
          Thêm
        </button>
      );
    }
    render(
      <ToastProvider>
        <Many />
      </ToastProvider>,
    );
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    expect([...document.querySelectorAll(".toast-text")].map((e) => e.textContent)).toEqual(["T2", "T3", "T4"]);
  });

  it("ngoài ToastProvider: useToast không làm gì, không lỗi", () => {
    render(<Trigger text="x" />);
    fireEvent.click(screen.getByRole("button", { name: "Bấm" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
