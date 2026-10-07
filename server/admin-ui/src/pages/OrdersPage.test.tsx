import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersPage } from "./OrdersPage";

const RANGE_ERROR = "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc";

let urls: string[];

beforeEach(() => {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const setDate = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("OrdersPage: khoảng ngày", () => {
  it("ngày bắt đầu sau ngày kết thúc: không gọi API, hiện thông báo; sửa lại thì gọi và thông báo mất", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    expect(urls).toEqual(["/admin/orders"]);
    setDate("Tạo từ ngày", "2026-10-05");
    await screen.findByText("Không có đơn nào");
    expect(urls).toEqual(["/admin/orders", "/admin/orders?from=2026-10-05"]);

    setDate("Đến ngày", "2026-10-01");
    expect((await screen.findByRole("alert")).textContent).toBe(RANGE_ERROR);
    expect(urls).toEqual(["/admin/orders", "/admin/orders?from=2026-10-05"]);

    setDate("Đến ngày", "2026-10-06");
    await screen.findByText("Không có đơn nào");
    expect(urls.at(-1)).toBe("/admin/orders?from=2026-10-05&to=2026-10-06");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cùng một ngày thì hợp lệ", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    setDate("Tạo từ ngày", "2026-10-05");
    setDate("Đến ngày", "2026-10-05");
    await screen.findByText("Không có đơn nào");
    expect(urls.at(-1)).toBe("/admin/orders?from=2026-10-05&to=2026-10-05");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
