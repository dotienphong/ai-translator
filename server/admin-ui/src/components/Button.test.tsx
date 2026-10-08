import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, ButtonGroup, IconButton } from "./Button";
import { IconPlus } from "./icons";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("Button", () => {
  it("mặc định là nút phụ type=button; kiểu và cỡ thành lớp CSS", () => {
    const { rerender } = render(<Button>Lưu</Button>);
    const b = screen.getByRole("button", { name: "Lưu" });
    expect(b.getAttribute("type")).toBe("button");
    expect(b.className).toBe("btn");
    rerender(
      <Button variant="primary" size="sm">
        Lưu
      </Button>,
    );
    expect(b.className).toBe("btn primary small");
    rerender(
      <Button variant="danger-solid" size="lg" block>
        Lưu
      </Button>,
    );
    expect(b.className).toBe("btn danger solid large block");
    rerender(<Button variant="ghost">Lưu</Button>);
    expect(b.className).toBe("btn ghost");
  });

  it("type=submit gửi form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Gửi</Button>
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Gửi" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("biểu tượng là aria-hidden, tên nút chỉ là chữ", () => {
    render(<Button icon={<IconPlus />}>Thêm</Button>);
    const b = screen.getByRole("button", { name: "Thêm" });
    expect(b.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("loading: vòng quay thay biểu tượng, aria-busy, bỏ qua mọi lần bấm nhưng vẫn nhận focus", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading icon={<IconPlus />} onClick={onClick}>
        Đang lưu…
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Đang lưu…" }) as HTMLButtonElement;
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.className).toContain("is-loading");
    expect(b.querySelector(".spinner")).toBeTruthy();
    expect(b.querySelector(".icon-plus")).toBeNull();
    expect(b.disabled).toBe(false);
    await user.click(b);
    expect(onClick).not.toHaveBeenCalled();
    b.focus();
    expect(document.activeElement).toBe(b);
  });

  it("onClick trả Promise: tự vào trạng thái đang xử lý tới khi xong, bấm đúp chỉ chạy một lần", async () => {
    let finish: () => void = () => {};
    const onClick = vi.fn(
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    );
    render(<Button onClick={onClick}>Gửi</Button>);
    const b = screen.getByRole("button", { name: "Gửi" });
    act(() => {
      fireEvent.click(b);
      fireEvent.click(b);
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(b.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish());
    expect(b.getAttribute("aria-busy")).toBeNull();
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("Promise bị từ chối: vẫn mở khóa lại", async () => {
    const onClick = vi.fn(async () => {
      throw new Error("x");
    });
    render(<Button onClick={onClick}>Gửi</Button>);
    const b = screen.getByRole("button", { name: "Gửi" });
    await act(async () => {
      fireEvent.click(b);
    });
    expect(b.getAttribute("aria-busy")).toBeNull();
  });

  it("disabled: không gọi onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Gửi
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Gửi" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("href: thành thẻ a; link ra tab mới có rel an toàn", () => {
    render(
      <Button href="https://example.com" target="_blank">
        Mở
      </Button>,
    );
    const a = screen.getByRole("link", { name: "Mở" });
    expect(a.getAttribute("href")).toBe("https://example.com");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.className).toBe("btn");
  });

  it("to: Link của router, bấm thì đổi trang không tải lại", async () => {
    const user = userEvent.setup();
    render(
      <Button to="/orders" variant="primary">
        Đơn hàng
      </Button>,
    );
    const a = screen.getByRole("link", { name: "Đơn hàng" });
    expect(a.getAttribute("href")).toBe("/orders");
    expect(a.className).toBe("btn primary");
    await user.click(a);
    expect(window.location.pathname).toBe("/orders");
  });

  it("link bị khóa: không có href, aria-disabled, bấm không đi đâu", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Button to="/orders" disabled>
        Đơn hàng
      </Button>,
    );
    const a = container.querySelector("a") as HTMLAnchorElement;
    expect(a.hasAttribute("href")).toBe(false);
    expect(a.getAttribute("aria-disabled")).toBe("true");
    await user.click(a);
    expect(window.location.pathname).toBe("/");
  });
});

describe("IconButton", () => {
  it("tên lấy từ label (aria-label và title), mặc định ghost, vuông", () => {
    render(<IconButton label="Làm mới" icon={<IconPlus />} />);
    const b = screen.getByRole("button", { name: "Làm mới" });
    expect(b.getAttribute("title")).toBe("Làm mới");
    expect(b.className).toBe("btn ghost icon-only");
    expect(b.textContent).toBe("");
  });

  it("đổi kiểu và cỡ được", () => {
    render(<IconButton label="Thêm" icon={<IconPlus />} variant="primary" size="sm" />);
    expect(screen.getByRole("button", { name: "Thêm" }).className).toBe("btn primary small icon-only");
  });
});

describe("ButtonGroup", () => {
  it("role=group có tên; attached và align thành lớp", () => {
    render(
      <ButtonGroup label="Khoảng thời gian" attached align="end">
        <Button>7 ngày</Button>
        <Button>30 ngày</Button>
      </ButtonGroup>,
    );
    const g = screen.getByRole("group", { name: "Khoảng thời gian" });
    expect(g.className).toBe("btn-group attached align-end");
    expect(g.querySelectorAll("button")).toHaveLength(2);
  });
});
