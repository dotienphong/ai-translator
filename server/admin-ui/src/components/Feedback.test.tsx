import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { ErrorBox, Notice, NoticeRegion, ResultRegion, useNotice } from "./Feedback";

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
  it("chữ và nút Đóng; tông thành lớp; nhận được focus bằng mã, không tự mang role (vùng live bọc ngoài)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container, rerender } = render(<Notice text="Đã gia hạn." onClose={onClose} />);
    const box = container.querySelector(".notice") as HTMLElement;
    expect(box.className).toBe("notice tone-ok");
    expect(box.textContent).toBe("Đã gia hạn.");
    expect(box.getAttribute("role")).toBeNull();
    expect(box.tabIndex).toBe(-1);
    await user.click(screen.getByRole("button", { name: "Đóng" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Notice text="x" tone="warn" onClose={onClose} />);
    expect((container.querySelector(".notice") as HTMLElement).className).toBe("notice tone-warn");
  });
});

/** Trang giả: tiêu đề, vùng thông báo, nút tạo thông báo. */
function NoticePage() {
  const notice = useNotice();
  return (
    <>
      <h1 className="page-title" tabIndex={-1}>
        Trang
      </h1>
      <NoticeRegion handle={notice} />
      <button type="button" onClick={() => notice.show("Đã thu hồi license.")}>
        Làm
      </button>
    </>
  );
}

describe("NoticeRegion (vùng thông báo kết quả của trang)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("vùng status luôn có trong DOM (rỗng lúc đầu), aria-live polite, aria-atomic; thông báo hiện BÊN TRONG vùng có sẵn", async () => {
    const user = userEvent.setup();
    render(<NoticePage />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.textContent).toBe("");
    await user.click(screen.getByRole("button", { name: "Làm" }));
    // Cùng một nút DOM: vùng không bị tạo lại cùng lúc với chữ (trình đọc màn hình mới chắc đọc).
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("Đã thu hồi license.");
  });

  it("thông báo mới: cuộn tới (khối gần nhất) và nhận focus; bấm lại cùng chữ vẫn là thông báo mới", async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<NoticePage />);
    await user.click(screen.getByRole("button", { name: "Làm" }));
    const box = document.querySelector(".notice") as HTMLElement;
    expect(document.activeElement).toBe(box);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.calls[0]?.[0]).toMatchObject({ block: "nearest" });
    await user.click(screen.getByRole("button", { name: "Làm" }));
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(document.querySelector(".notice"));
    // @ts-expect-error: jsdom không có scrollIntoView; trả lại như cũ.
    delete Element.prototype.scrollIntoView;
  });

  it("người dùng giảm chuyển động: cuộn không mượt; không thì cuộn mượt", async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    for (const reduce of [true, false]) {
      window.matchMedia = vi.fn((q: string) => ({ matches: reduce && q.includes("reduce") }) as MediaQueryList);
      const { unmount } = render(<NoticePage />);
      await user.click(screen.getByRole("button", { name: "Làm" }));
      expect(scroll.mock.lastCall?.[0]).toEqual({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      unmount();
    }
    // @ts-expect-error: dọn những gì jsdom vốn không có.
    delete window.matchMedia;
    // @ts-expect-error: như trên.
    delete Element.prototype.scrollIntoView;
  });

  it("đóng thông báo: vùng còn đó và rỗng, focus về tiêu đề trang (không rơi về body)", async () => {
    const user = userEvent.setup();
    render(<NoticePage />);
    await user.click(screen.getByRole("button", { name: "Làm" }));
    await user.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.getByRole("status").textContent).toBe("");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Trang" }));
  });
});

describe("ResultRegion (kết quả của công cụ)", () => {
  it("vùng luôn có; kết quả mới (khóa đổi) thì phần tử con đầu nhận focus", () => {
    function Tool({ at }: { at: number | null }) {
      return (
        <ResultRegion resultKey={at}>
          {at !== null && (
            <div tabIndex={-1} className="r">
              Kết quả {at}
            </div>
          )}
        </ResultRegion>
      );
    }
    const { rerender } = render(<Tool at={null} />);
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");
    expect(document.activeElement).toBe(document.body);
    act(() => rerender(<Tool at={1} />));
    expect(screen.getByRole("status")).toBe(region);
    expect(document.activeElement).toBe(region.querySelector(".r"));
  });
});
