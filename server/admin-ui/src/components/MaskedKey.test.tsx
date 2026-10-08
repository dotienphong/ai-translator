import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton, KeyReveal, MaskedKey } from "./MaskedKey";

const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";

describe("MaskedKey", () => {
  it("che mặc định, bấm Hiện mới thấy key đầy đủ, bấm Ẩn thì che lại", async () => {
    const user = userEvent.setup();
    render(<MaskedKey value={KEY} />);
    expect(screen.getByText("K7Q2-…-9XMB")).toBeTruthy();
    expect(screen.queryByText(KEY)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Hiện" }));
    expect(screen.getByText(KEY)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ẩn" }));
    expect(screen.queryByText(KEY)).toBeNull();
  });
});

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
}

describe("CopyButton", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Spec giao diện mới (mục 2): chữ "Đã chép" giữ 1,5 giây (trước là 2 giây).
  it("chép được: hiện Đã chép, sau 1,5 giây trở lại Chép", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    render(<CopyButton text="abc" />);
    fireEvent.click(screen.getByRole("button", { name: "Chép" }));
    await act(async () => {});
    expect(writeText).toHaveBeenCalledWith("abc");
    expect(screen.getByRole("button", { name: "Đã chép" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(screen.getByRole("button", { name: "Đã chép" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: "Chép" })).toBeTruthy();
  });

  it("chép lỗi: hiện Không chép được (không báo Đã chép), sau 1,5 giây trở lại Chép", async () => {
    vi.useFakeTimers();
    stubClipboard(async () => {
      throw new Error("bị chặn");
    });
    render(<CopyButton text="abc" />);
    fireEvent.click(screen.getByRole("button", { name: "Chép" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Không chép được" })).toBeTruthy();
    expect(screen.queryByText("Đã chép")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("button", { name: "Chép" })).toBeTruthy();
  });

  it("không có clipboard (trang không an toàn): cũng báo Không chép được", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<CopyButton text="abc" />);
    fireEvent.click(screen.getByRole("button", { name: "Chép" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Không chép được" })).toBeTruthy();
  });

  it("bỏ khỏi trang trước 1,5 giây: không còn bộ hẹn giờ nào", async () => {
    vi.useFakeTimers();
    stubClipboard(async () => {});
    const { unmount } = render(<CopyButton text="abc" />);
    fireEvent.click(screen.getByRole("button", { name: "Chép" }));
    await act(async () => {});
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("KeyReveal", () => {
  it("hộp có tên là tiêu đề, hiện key đầy đủ và nút Xong", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<KeyReveal licenseKey={KEY} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Key mới" })).toBeTruthy();
    expect(screen.getByText(KEY)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Xong" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("nhận tiêu đề riêng; không truyền thì là Key mới", () => {
    const { rerender } = render(<KeyReveal licenseKey={KEY} onClose={() => {}} title="Key của license" />);
    expect(screen.getByRole("dialog", { name: "Key của license" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Key mới" })).toBeNull();
    rerender(<KeyReveal licenseKey={KEY} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Key mới" })).toBeTruthy();
  });

  it("không khẳng định email đã tới tay khách: nói server đã thử gửi và chỉ cách gửi lại", () => {
    render(<KeyReveal licenseKey={KEY} onClose={() => {}} />);
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).toContain(
      "Server đã thử gửi key qua email cho khách; nếu khách báo không nhận được, dùng Gửi lại email ở trang license. Hộp này chỉ hiện key một lần.",
    );
    expect(text).not.toContain("Key đã được gửi");
  });
});

describe("MaskedKey và KeyReveal: an toàn của key (T-2)", () => {
  it("MaskedKey: nút Chép chép đúng giá trị truyền vào (key đầy đủ), kể cả khi chữ đang che", async () => {
    const user = userEvent.setup();
    render(<MaskedKey value={KEY} />);
    expect(screen.queryByText(KEY)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Chép" }));
    expect(await navigator.clipboard.readText()).toBe(KEY);
  });

  it("KeyReveal: bấm ra lớp phủ hay nhấn Esc KHÔNG đóng hộp (đóng nhầm là mất key); chỉ Xong mới đóng", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<KeyReveal licenseKey={KEY} onClose={onClose} />);
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;
    expect(overlay.className).toBe("overlay");
    await user.pointer({ keys: "[MouseLeft]", target: overlay });
    fireEvent.click(overlay);
    fireEvent.mouseDown(overlay);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(KEY)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Xong" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
