import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SafeBoundary, type SafeBoundaryProps } from "./SafeBoundary";

// SafeBoundary (spec 2026-11-05-dang-nhap-google; Task 13): lỗi khi vẽ phần con thì hiện câu báo nhỏ và nút Thử lại thay vì cửa
// sổ trắng. `react-dom/server` không chạy ranh giới lỗi, nên thử thẳng các hàm của lớp (như React gọi chúng).

const props = (patch: Partial<SafeBoundaryProps> = {}): SafeBoundaryProps => ({
  message: "Phần này không hiện được.",
  retry: "Thử lại",
  children: createElement("p", null, "nội dung"),
  ...patch,
});

function elements(node: unknown, out: ReactElement<Record<string, unknown>>[] = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const n of node) elements(n, out);
    return out;
  }
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.props) {
    out.push(el);
    elements(el.props.children, out);
  }
  return out;
}

describe("SafeBoundary", () => {
  it("không lỗi: vẽ đúng phần con", () => {
    expect(renderToStaticMarkup(createElement(SafeBoundary, props()))).toContain("<p>nội dung</p>");
  });

  it("phần con ném lỗi: getDerivedStateFromError chuyển sang trạng thái lỗi", () => {
    expect(SafeBoundary.getDerivedStateFromError(new Error("hỏng"))).toMatchObject({ failed: true });
  });

  it("trạng thái lỗi: hiện câu báo (role=alert) và nút Thử lại, không vẽ phần con", () => {
    const boundary = new SafeBoundary(props());
    boundary.state = { ...boundary.state, failed: true };
    const markup = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(markup).toContain("Phần này không hiện được.");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Thử lại");
    expect(markup).not.toContain("nội dung");
  });

  it("bấm Thử lại: về trạng thái thường và dựng lại phần con (khóa mới)", () => {
    const boundary = new SafeBoundary(props());
    boundary.state = { failed: true, attempt: 0 };
    const updates: unknown[] = [];
    boundary.setState = ((u: unknown) => {
      const next = typeof u === "function" ? (u as (s: typeof boundary.state) => unknown)(boundary.state) : u;
      updates.push(next);
      boundary.state = { ...boundary.state, ...(next as object) };
    }) as typeof boundary.setState;
    const retry = elements(boundary.render()).find((e) => e.type === "button");
    expect(retry).toBeDefined();
    (retry?.props.onClick as () => void)();
    expect(updates).toEqual([{ failed: false, attempt: 1 }]);
    const again = boundary.render() as ReactElement<{ children?: unknown }>;
    expect(renderToStaticMarkup(again)).toContain("<p>nội dung</p>");
    // Khóa đổi theo lần thử: React dựng lại phần con từ đầu.
    expect(again.key).toBe("1");
  });

  it("ghi lỗi ra console, không ném tiếp", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boundary = new SafeBoundary(props());
    expect(() => boundary.componentDidCatch(new Error("hỏng"), { componentStack: "" })).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
