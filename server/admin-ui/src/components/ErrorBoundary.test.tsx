import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("hợp đồng lệch");
}

beforeEach(() => {
  // React ghi lỗi đã bắt ra console.error: không để ồn trong báo cáo test.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ErrorBoundary", () => {
  it("con không lỗi: hiện nguyên con, không có khung lỗi", () => {
    render(
      <ErrorBoundary>
        <p>nội dung</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("nội dung")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("con ném lỗi khi vẽ: thay bằng khung lỗi (vùng alert) có nút Tải lại trang, không để trang trắng", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const box = screen.getByRole("alert");
    expect(box.textContent).toContain("Trang lỗi khi hiển thị");
    expect(screen.getByRole("button", { name: "Tải lại trang" })).toBeTruthy();
  });

  it("nút Tải lại trang tải lại cửa sổ", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Tải lại trang" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("lỗi ném sau khi đã vẽ được (do dữ liệu tải về): cũng được bắt, phần ngoài khung vẫn còn", async () => {
    function Late() {
      const [bad, setBad] = useState(false);
      if (bad) throw new Error("dữ liệu lệch");
      return (
        <button type="button" onClick={() => setBad(true)}>
          nạp
        </button>
      );
    }
    render(
      <div>
        <p>thanh bên</p>
        <ErrorBoundary>
          <Late />
        </ErrorBoundary>
      </div>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "nạp" }));
    expect(screen.getByRole("alert").textContent).toContain("Trang lỗi khi hiển thị");
    expect(screen.getByText("thanh bên")).toBeTruthy();
  });
});
