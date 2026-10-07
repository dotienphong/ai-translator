import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { ConfirmDialog } from "./ConfirmDialog";

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("ConfirmDialog (spec Web Admin §4.4)", () => {
  it("cần lý do: chưa có thì không bấm được; gửi lý do đã bỏ khoảng trắng; xong thì đóng", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<ConfirmDialog title="Gia hạn license?" description="mô tả" confirmLabel="Gia hạn" needsNote onConfirm={onConfirm} onClose={onClose} />);
    expect(button("Gia hạn").disabled).toBe(true);
    await user.type(screen.getByLabelText(/Lý do/), "   ");
    expect(button("Gia hạn").disabled).toBe(true);
    await user.type(screen.getByLabelText(/Lý do/), "bù cho khách  ");
    expect(button("Gia hạn").disabled).toBe(false);
    await user.click(button("Gia hạn"));
    expect(onConfirm).toHaveBeenCalledWith("bù cho khách");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("không hoàn tác được: phải có lý do và gõ đúng chữ xác nhận", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {});
    render(
      <ConfirmDialog title="Thu hồi?" description="x" confirmLabel="Thu hồi" needsNote typeToConfirm="THU HOI" onConfirm={onConfirm} onClose={() => {}} />,
    );
    await user.type(screen.getByLabelText(/Lý do/), "hoàn tiền");
    await user.type(screen.getByLabelText(/để xác nhận/), "THU HO");
    expect(button("Thu hồi").disabled).toBe(true);
    await user.type(screen.getByLabelText(/để xác nhận/), "I");
    expect(button("Thu hồi").disabled).toBe(false);
  });

  it("không cần lý do: không có ô Lý do, bấm được ngay", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(async () => {});
    render(<ConfirmDialog title="Gửi lại email?" description="x" confirmLabel="Gửi" needsNote={false} onConfirm={onConfirm} onClose={() => {}} />);
    expect(screen.queryByLabelText(/Lý do/)).toBeNull();
    await user.click(button("Gửi"));
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  it("ô nhập thêm chưa hợp lệ thì không bấm được", () => {
    render(
      <ConfirmDialog title="Gia hạn?" description="x" confirmLabel="Gia hạn" needsNote={false} extraValid={false} onConfirm={async () => {}} onClose={() => {}} />,
    );
    expect(button("Gia hạn").disabled).toBe(true);
  });

  it("server báo lỗi: hiện câu lỗi, không đóng; 409 thì gọi onConflict", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConflict = vi.fn();
    const onConfirm = vi.fn(async () => {
      throw new ApiError(409, "already_paid", { status: "paid" });
    });
    render(
      <ConfirmDialog title="Cấp tay?" description="x" confirmLabel="Cấp" needsNote={false} onConfirm={onConfirm} onClose={onClose} onConflict={onConflict} />,
    );
    await user.click(button("Cấp"));
    expect((await screen.findByRole("alert")).textContent).toBe("Đơn đã được cấp trước đó (trạng thái hiện tại: paid)");
    expect(onClose).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(button("Cấp").disabled).toBe(false);
  });
});
