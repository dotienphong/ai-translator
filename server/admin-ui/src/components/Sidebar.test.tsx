import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar, type SidebarProps } from "./Sidebar";

function setup(p: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    current: "queue",
    queueCount: null,
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    open: false,
    onClose: vi.fn(),
    ...p,
  };
  render(<Sidebar {...props} />);
  return props;
}

const nav = () => within(screen.getByRole("navigation", { name: "Điều hướng" }));

describe("Sidebar", () => {
  it("mỗi mục có biểu tượng SVG ẩn với trình đọc màn hình; mục của trang chi tiết được đánh dấu theo nhóm (đơn → Đơn hàng)", () => {
    setup({ current: "order" });
    const links = nav().getAllByRole("link");
    expect(links).toHaveLength(8);
    for (const a of links) expect(a.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    const orders = nav().getByRole("link", { name: "Đơn hàng" });
    expect(orders.getAttribute("aria-current")).toBe("page");
    expect(orders.className).toContain("active");
    expect(nav().getAllByRole("link").filter((a) => a.getAttribute("aria-current"))).toHaveLength(1);
  });

  it("không có việc (0 hay null): không có huy hiệu; nhiều việc: hiện 99+", () => {
    const { unmount } = render(<Sidebar current="queue" queueCount={0} collapsed={false} onToggleCollapsed={() => {}} open={false} onClose={() => {}} />);
    expect(document.querySelector(".nav-count")).toBeNull();
    unmount();
    setup({ queueCount: 150 });
    expect(document.querySelector(".nav-count")?.textContent).toBe("99+");
    expect(nav().getByRole("link", { name: "Việc cần xử lý, 150 việc" })).toBeTruthy();
  });

  it("tooltip tên mục (khi thu gọn) nằm ngoài link và aria-hidden: tên đọc được của link không bị lặp", () => {
    setup({ collapsed: true, queueCount: 2 });
    const tips = [...document.querySelectorAll(".nav-tip")];
    expect(tips.length).toBeGreaterThanOrEqual(8);
    for (const t of tips) {
      expect(t.getAttribute("aria-hidden")).toBe("true");
      expect(t.closest("a")).toBeNull();
    }
    expect(tips[0]?.textContent).toBe("Việc cần xử lý (2)");
    expect(nav().getByRole("link", { name: "Tổng quan" })).toBeTruthy();
  });

  it("nút thu gọn: chữ theo trạng thái, bấm gọi onToggleCollapsed", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Thu gọn thanh bên" }));
    expect(p.onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it("thu gọn: nút đổi thành Mở rộng thanh bên", () => {
    setup({ collapsed: true });
    expect(screen.getByRole("button", { name: "Mở rộng thanh bên" })).toBeTruthy();
    // Trạng thái của thanh bên cho trình đọc màn hình: thu gọn là aria-expanded false.
    expect(screen.getByRole("button", { name: "Mở rộng thanh bên" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("ngăn kéo đóng: không phải hộp thoại; mở: hộp thoại Menu, Esc gọi onClose", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Sidebar current="queue" queueCount={null} collapsed={false} onToggleCollapsed={() => {}} open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const onClose = vi.fn();
    rerender(<Sidebar current="queue" queueCount={null} collapsed={false} onToggleCollapsed={() => {}} open onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Đóng menu" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ngăn kéo đóng: Esc không gọi onClose", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.keyboard("{Escape}");
    expect(p.onClose).not.toHaveBeenCalled();
  });
});
