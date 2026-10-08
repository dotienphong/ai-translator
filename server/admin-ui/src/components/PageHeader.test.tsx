import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("PageHeader", () => {
  it("chỉ có tiêu đề: một h1, không có đường dẫn, mô tả hay vùng hành động", () => {
    const { container } = render(<PageHeader title="Đơn hàng" />);
    expect(screen.getByRole("heading", { level: 1, name: "Đơn hàng" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.querySelector(".page-desc")).toBeNull();
    expect(container.querySelector(".page-actions")).toBeNull();
  });

  it("đủ phần: đường dẫn (mục cuối là trang hiện tại, không phải link), huy hiệu ngoài h1, mô tả, hành động", async () => {
    const user = userEvent.setup();
    render(
      <PageHeader
        title="Đơn #1000012"
        breadcrumb={[{ label: "Đơn hàng", to: "/orders" }, { label: "#1000012" }]}
        badges={<span className="badge badge-ok">Đã trả</span>}
        description="Tạo lúc 07/10/2026 13:41"
        actions={<button type="button">Cấp tay…</button>}
      />,
    );
    // Tên tiêu đề không lẫn chữ của huy hiệu.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Đơn #1000012");
    expect(screen.getByText("Đã trả")).toBeTruthy();
    const crumbs = within(screen.getByRole("navigation", { name: "Đường dẫn" }));
    expect(crumbs.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Đơn hàng", "#1000012"]);
    expect(crumbs.getByText("#1000012").getAttribute("aria-current")).toBe("page");
    expect(crumbs.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Tạo lúc 07/10/2026 13:41")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cấp tay…" })).toBeTruthy();
    await user.click(crumbs.getByRole("link", { name: "Đơn hàng" }));
    expect(window.location.pathname).toBe("/orders");
  });
});
