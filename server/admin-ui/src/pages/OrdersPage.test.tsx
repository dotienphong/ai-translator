import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("OrdersPage: bộ lọc vào query", () => {
  it("đổi Trạng thái, Gói, ngày: gọi lại /admin/orders đúng query; về Tất cả thì bỏ tham số đó", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    expect(urls).toEqual(["/admin/orders"]);

    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "paid_needs_review" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?status=paid_needs_review"));
    fireEvent.change(screen.getByLabelText("Gói"), { target: { value: "yearly" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?status=paid_needs_review&plan=yearly"));
    setDate("Tạo từ ngày", "2026-10-01");
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?status=paid_needs_review&plan=yearly&from=2026-10-01"));
    setDate("Đến ngày", "2026-10-31");
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?status=paid_needs_review&plan=yearly&from=2026-10-01&to=2026-10-31"));

    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?plan=yearly&from=2026-10-01&to=2026-10-31"));
    fireEvent.change(screen.getByLabelText("Gói"), { target: { value: "monthly" } });
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/orders?plan=monthly&from=2026-10-01&to=2026-10-31"));
    expect(urls).toHaveLength(7);
  });

  it("khoảng ngày ngược: bảng ẩn đi (không hiện kết quả của khoảng khác), sửa lại thì bảng về", async () => {
    render(<OrdersPage />);
    await screen.findByText("Không có đơn nào");
    setDate("Tạo từ ngày", "2026-10-05");
    setDate("Đến ngày", "2026-10-01");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Không có đơn nào")).toBeNull();
    setDate("Đến ngày", "2026-10-09");
    expect(await screen.findByText("Không có đơn nào")).toBeTruthy();
  });
});
