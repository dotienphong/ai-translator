import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Link, matchRoute, navigate, usePath } from "./router";

const ID = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const HASH = "a".repeat(64);

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("matchRoute", () => {
  it.each([
    ["/", { name: "queue" }],
    ["/search", { name: "search" }],
    ["/orders", { name: "orders" }],
    ["/orders/1000012", { name: "order", param: "1000012" }],
    ["/orders/0001", { name: "order", param: "0001" }],
    ["/licenses", { name: "licenses" }],
    [`/licenses/${ID}`, { name: "license", param: ID }],
    [`/devices/${HASH}`, { name: "device", param: HASH }],
    ["/trials", { name: "trials" }],
    ["/audit", { name: "audit" }],
    ["/tools", { name: "tools" }],
    ["/overview", { name: "overview" }],
    ["/overview/", { name: "overview" }],
    ["/overview/x", { name: "not_found" }],
    ["/system", { name: "system" }],
    ["/system/", { name: "system" }],
    ["/system/x", { name: "not_found" }],
    ["/orders/", { name: "orders" }],
    ["/orders/0", { name: "not_found" }],
    ["/orders/000", { name: "not_found" }],
    ["/orders/abc", { name: "not_found" }],
    ["/licenses/khong-phai-uuid", { name: "not_found" }],
    ["/khong-co", { name: "not_found" }],
  ])("%s", (path, route) => {
    expect(matchRoute(path)).toEqual(route);
  });
});

describe("navigate", () => {
  it("đổi đường dẫn và báo cho nơi đang theo dõi; replace không thêm mục history", () => {
    const { result } = renderHook(() => usePath());
    expect(result.current).toBe("/");
    const before = window.history.length;
    act(() => navigate("/x"));
    expect(window.location.pathname).toBe("/x");
    expect(result.current).toBe("/x");
    expect(window.history.length).toBe(before + 1);
    act(() => navigate("/y", { replace: true }));
    expect(result.current).toBe("/y");
    expect(window.history.length).toBe(before + 1);
  });
});

describe("Link", () => {
  /** jsdom chưa cài điều hướng thật: chặn mặc định ở document (chạy sau Link) để không in lỗi "Not implemented". */
  function blockDefaultNavigation() {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("click", stop);
    return () => document.removeEventListener("click", stop);
  }

  function Harness() {
    return (
      <>
        <Link to="/orders">Đơn</Link>
        <output>{usePath()}</output>
      </>
    );
  }

  it("bấm thường thì chuyển trang không tải lại", async () => {
    const unblock = blockDefaultNavigation();
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole("link", { name: "Đơn" }));
    expect(screen.getByRole("status").textContent).toBe("/orders");
    expect(window.location.pathname).toBe("/orders");
    unblock();
  });

  it("Ctrl+bấm để trình duyệt tự xử lý (mở tab mới), không chuyển trang", async () => {
    const unblock = blockDefaultNavigation();
    render(<Harness />);
    const user = userEvent.setup();
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("link", { name: "Đơn" }));
    await user.keyboard("{/Control}");
    expect(screen.getByRole("status").textContent).toBe("/");
    expect(window.location.pathname).toBe("/");
    unblock();
  });
});
