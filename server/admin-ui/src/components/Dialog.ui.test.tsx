// Phần giao diện của hộp thoại (pha 2 giao diện mới): tông, biểu tượng, mô tả gắn với hộp, bẫy focus, trả focus, bộ đếm ký
// tự, dấu kiểm của ô gõ chữ xác nhận, KeyReveal. Hành vi nghiệp vụ (ghi chú, gõ chữ, bấm đúp, không chắc kết quả) nằm ở
// ConfirmDialog.test.tsx và không đổi.
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { KeyReveal } from "./MaskedKey";

const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";

describe("ConfirmDialog: giao diện", () => {
  it("mặc định tông thường: nút chính xanh, biểu tượng thông tin", () => {
    render(<ConfirmDialog title="Gửi lại?" description="Gửi key tới khách." confirmLabel="Gửi" needsNote={false} onConfirm={async () => {}} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Gửi lại?" });
    expect(dialog.className).toBe("dialog");
    expect(dialog.querySelector(".dialog-icon .icon-info")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gửi" }).className).toContain("primary");
  });

  it("có typeToConfirm: tông nguy hiểm (lớp, biểu tượng cảnh báo, nút đỏ nền đặc)", () => {
    render(<ConfirmDialog title="Thu hồi?" description="x" confirmLabel="Thu hồi" needsNote={false} typeToConfirm="THU HOI" onConfirm={async () => {}} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Thu hồi?" });
    expect(dialog.className).toBe("dialog tone-danger");
    expect(dialog.querySelector(".dialog-icon .icon-warning")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thu hồi" }).className).toContain("danger solid");
  });

  it("tone=danger không cần gõ chữ (Gỡ máy); tone=default ghi đè được", () => {
    const { rerender } = render(<ConfirmDialog title="Gỡ máy?" description="x" confirmLabel="Gỡ" needsNote={false} tone="danger" onConfirm={async () => {}} onClose={() => {}} />);
    expect(screen.getByRole("dialog").className).toBe("dialog tone-danger");
    rerender(<ConfirmDialog title="Gỡ máy?" description="x" confirmLabel="Gỡ" needsNote={false} typeToConfirm="X" tone="default" onConfirm={async () => {}} onClose={() => {}} />);
    expect(screen.getByRole("dialog").className).toBe("dialog");
  });

  it("mô tả gắn với hộp (aria-describedby)", () => {
    render(<ConfirmDialog title="Gia hạn?" description="Cộng thêm số ngày." confirmLabel="Gia hạn" needsNote onConfirm={async () => {}} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    const desc = document.getElementById(dialog.getAttribute("aria-describedby") ?? "");
    expect(desc?.textContent).toBe("Cộng thêm số ngày.");
  });

  it("ô Lý do: có gợi ý gắn với ô và bộ đếm ký tự", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog title="Gia hạn?" description="x" confirmLabel="Gia hạn" needsNote onConfirm={async () => {}} onClose={() => {}} />);
    const note = screen.getByLabelText(/Lý do/);
    const hint = document.getElementById(note.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Ghi vào nhật ký cùng thao tác.0/500");
    await user.type(note, "abc");
    expect(hint?.querySelector(".field-count")?.textContent).toBe("3/500");
  });

  it("ô gõ chữ xác nhận: dấu kiểm khi khớp, không tự sửa hoa thường", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ConfirmDialog title="Thu hồi?" description="x" confirmLabel="Thu hồi" needsNote={false} typeToConfirm="THU HOI" onConfirm={async () => {}} onClose={() => {}} />,
    );
    const input = screen.getByLabelText(/để xác nhận/);
    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(container.querySelector(".type-confirm.is-match")).toBeNull();
    await user.type(input, "THU HOI");
    expect(container.querySelector(".type-confirm.is-match .icon-check")).toBeTruthy();
  });

  it("bấm lớp phủ không đóng hộp (giữ hành vi cũ)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<ConfirmDialog title="Gia hạn?" description="x" confirmLabel="Gia hạn" needsNote onConfirm={async () => {}} onClose={onClose} />);
    await user.click(container.querySelector(".overlay") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("bẫy focus: Tab ở nút cuối về ô đầu, Shift+Tab ở ô đầu về nút cuối", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog title="Gia hạn?" description="x" confirmLabel="Gia hạn" needsNote onConfirm={async () => {}} onClose={() => {}} />);
    const note = screen.getByLabelText(/Lý do/);
    expect(document.activeElement).toBe(note);
    await user.type(note, "ok");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hủy" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Gia hạn" }));
    await user.tab();
    expect(document.activeElement).toBe(note);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Gia hạn" }));
  });

  it("đóng hộp: focus trở về nút đã mở hộp", async () => {
    const user = userEvent.setup();
    function Page(): ReactNode {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Gia hạn…
          </button>
          {open && <ConfirmDialog title="Gia hạn?" description="x" confirmLabel="Gia hạn" needsNote onConfirm={async () => {}} onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Gia hạn…" });
    await user.click(opener);
    expect(document.activeElement).toBe(screen.getByLabelText(/Lý do/));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("KeyReveal: giao diện", () => {
  it("mở ra: focus vào nút Chép key; key đầy đủ trong khung riêng", () => {
    const { container } = render(<KeyReveal licenseKey={KEY} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Chép key" }));
    expect(container.querySelector(".key-box .key-full")?.textContent).toBe(KEY);
  });

  it("Esc không đóng (đóng nhầm là mất key); chỉ nút Xong đóng", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<KeyReveal licenseKey={KEY} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("nút chép chép key đầy đủ", async () => {
    // Sau userEvent.setup(): user-event tự cài clipboard giả của nó lên navigator.
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<KeyReveal licenseKey={KEY} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Chép key" }));
    expect(writeText).toHaveBeenCalledWith(KEY);
  });

  it("bẫy focus: Tab đi vòng giữa Chép key và Xong", async () => {
    const user = userEvent.setup();
    render(<KeyReveal licenseKey={KEY} onClose={() => {}} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Xong" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Chép key" }));
  });
});
