import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Topbar } from "./Topbar";

describe("Topbar", () => {
  it("chip người vận hành: avatar chữ cái đầu (viết hoa, ẩn với trình đọc màn hình) và email", () => {
    render(<Topbar operator="ops@aitranslator.io.vn" operatorLoading={false} menuOpen={false} onMenu={() => {}} />);
    expect(screen.getByText("ops@aitranslator.io.vn").className).toBe("operator-email");
    const avatar = document.querySelector(".avatar");
    expect(avatar?.textContent).toBe("O");
    expect(avatar?.getAttribute("aria-hidden")).toBe("true");
  });

  it("nhãn môi trường Production; ô tra cứu nằm trong thanh trên", () => {
    render(<Topbar operator={null} operatorLoading={false} menuOpen={false} onMenu={() => {}} />);
    expect(screen.getByText("Production")).toBeTruthy();
    // Điện thoại hẹp chỉ còn chấm: title vẫn nói tên môi trường.
    expect(document.querySelector(".env-badge")?.getAttribute("title")).toMatch(/^Production: dữ liệu thật/);
    expect(screen.getByRole("search")).toBeTruthy();
    expect(screen.getByLabelText("Tra cứu")).toBeTruthy();
  });

  it("đang tải người vận hành: chỗ giữ chỗ ẩn với trình đọc màn hình; lỗi: không hiện gì", () => {
    const { rerender } = render(<Topbar operator={null} operatorLoading menuOpen={false} onMenu={() => {}} />);
    expect(document.querySelector(".operator.is-loading")?.getAttribute("aria-hidden")).toBe("true");
    rerender(<Topbar operator={null} operatorLoading={false} menuOpen={false} onMenu={() => {}} />);
    expect(document.querySelector(".operator")).toBeNull();
  });

  it("nút menu: nhãn Mở menu, aria-expanded theo trạng thái, trỏ tới thanh bên, bấm gọi onMenu", async () => {
    const user = userEvent.setup();
    const onMenu = vi.fn();
    const { rerender } = render(<Topbar operator={null} operatorLoading={false} menuOpen={false} onMenu={onMenu} />);
    const btn = screen.getByRole("button", { name: "Mở menu" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.getAttribute("aria-controls")).toBe("thanh-ben");
    await user.click(btn);
    expect(onMenu).toHaveBeenCalledOnce();
    rerender(<Topbar operator={null} operatorLoading={false} menuOpen onMenu={onMenu} />);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });
});
