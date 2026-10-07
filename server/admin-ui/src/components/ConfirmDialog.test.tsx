import { act, fireEvent, render, screen } from "@testing-library/react";
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

const UNCERTAIN = "Không chắc thao tác đã chạy chưa. Đóng hộp, tải lại trang và xem Nhật ký trước khi thử lại.";
const never = () => new Promise<void>(() => {});

describe("ConfirmDialog: chữ xác nhận phải khớp từng ký tự", () => {
  it.each(["thu hoi", " THU HOI", "THU HOI "])("gõ %j thì chưa đủ điều kiện", async (typed) => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog title="Thu hồi?" description="x" confirmLabel="Thu hồi" needsNote typeToConfirm="THU HOI" onConfirm={async () => {}} onClose={() => {}} />,
    );
    await user.type(screen.getByLabelText(/Lý do/), "hoàn tiền");
    await user.type(screen.getByLabelText(/để xác nhận/), typed);
    expect(button("Thu hồi").disabled).toBe(true);
  });
});

describe("ConfirmDialog: chống gọi hai lần", () => {
  it("bấm đúp khi onConfirm còn treo: chỉ gọi một lần; nút thành Đang làm…, nút Hủy bị khóa", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(never);
    render(<ConfirmDialog title="Gửi lại?" description="x" confirmLabel="Gửi" needsNote={false} onConfirm={onConfirm} onClose={() => {}} />);
    await user.dblClick(button("Gửi"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button("Đang làm…").disabled).toBe(true);
    expect(button("Hủy").disabled).toBe(true);
  });

  it("hai lần gửi form liên tiếp trong cùng một lượt cập nhật: chỉ gọi một lần", () => {
    const onConfirm = vi.fn(never);
    render(<ConfirmDialog title="Gửi lại?" description="x" confirmLabel="Gửi" needsNote={false} onConfirm={onConfirm} onClose={() => {}} />);
    const form = screen.getByRole("dialog");
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("ConfirmDialog: lỗi", () => {
  function setup(err: unknown) {
    const onConfirm = vi.fn(async () => {
      throw err;
    });
    const onClose = vi.fn();
    const onConflict = vi.fn();
    render(
      <ConfirmDialog title="Gia hạn?" description="x" confirmLabel="Gia hạn" needsNote={false} onConfirm={onConfirm} onClose={onClose} onConflict={onConflict} />,
    );
    return { onConfirm, onClose, onConflict };
  }

  it.each([
    ["500", new ApiError(500, "internal"), "Lỗi máy chủ"],
    ["503", new ApiError(503, "http_503"), "Máy chủ trả lỗi 503"],
    ["mạng (status 0)", new ApiError(0, "network"), "Không kết nối được máy chủ"],
    ["không phải ApiError", new Error("boom bằng tiếng Anh"), "Lỗi không xác định"],
    ["không phải Error", "chuỗi lạ", "Lỗi không xác định"],
  ])("không chắc đã chạy chưa (%s): hiện lỗi và cảnh báo, tải lại trang, khóa nút xác nhận tới khi đóng hộp", async (_name, err, message) => {
    const user = userEvent.setup();
    const { onConfirm, onClose, onConflict } = setup(err);
    await user.click(button("Gia hạn"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).toContain(UNCERTAIN);
    expect(alert.textContent).not.toContain("boom");
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(button("Gia hạn").disabled).toBe(true);
    expect(button("Hủy").disabled).toBe(false);
    await user.click(button("Gia hạn"));
    fireEvent.submit(screen.getByRole("dialog"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(button("Hủy"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["400", new ApiError(400, "invalid_request", { field: "days" }), "Dữ liệu gửi lên không hợp lệ (trường days)"],
    ["404", new ApiError(404, "not_found"), "Không tìm thấy, hoặc đã ở trạng thái đó. Tải lại trang để xem trạng thái mới"],
  ])("lỗi %s chắc chắn chưa ghi: hiện lỗi, không cảnh báo, không tải lại, nút mở lại và bấm được lần nữa", async (_name, err, message) => {
    const user = userEvent.setup();
    const { onConfirm, onClose, onConflict } = setup(err);
    await user.click(button("Gia hạn"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(onConflict).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(button("Gia hạn").disabled).toBe(false);
    await user.click(button("Gia hạn"));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("409: tải lại trang nhưng không phải trường hợp không rõ kết quả; nút mở lại", async () => {
    const user = userEvent.setup();
    const { onConfirm, onConflict } = setup(new ApiError(409, "already_paid", { status: "paid" }));
    await user.click(button("Gia hạn"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain(UNCERTAIN);
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(button("Gia hạn").disabled).toBe(false);
    await user.click(button("Gia hạn"));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});

describe("ConfirmDialog: bàn phím và nhãn", () => {
  it("mở ra thì focus ở ô Lý do, không ở nút xác nhận", () => {
    render(<ConfirmDialog title="Gia hạn?" description="x" confirmLabel="Gia hạn" needsNote typeToConfirm="OK" onConfirm={async () => {}} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByLabelText(/Lý do/));
  });

  it("không có ô Lý do thì focus ở ô gõ chữ xác nhận", () => {
    render(
      <ConfirmDialog title="Xóa?" description="x" confirmLabel="Xóa" needsNote={false} typeToConfirm="XOA" onConfirm={async () => {}} onClose={() => {}} />,
    );
    expect(document.activeElement).toBe(screen.getByLabelText(/để xác nhận/));
  });

  it("không có cả hai thì focus ở ô nhập thêm của trang", () => {
    render(
      <ConfirmDialog title="Gia hạn?" description="x" confirmLabel="Gia hạn" needsNote={false} onConfirm={async () => {}} onClose={() => {}}>
        <label>
          Số ngày
          <input type="number" />
        </label>
      </ConfirmDialog>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Số ngày"));
  });

  it("chỉ có nút thì không focus nút xác nhận", () => {
    render(<ConfirmDialog title="Gửi lại?" description="x" confirmLabel="Gửi" needsNote={false} onConfirm={async () => {}} onClose={() => {}} />);
    expect(document.activeElement).not.toBe(button("Gửi"));
  });

  it("Esc đóng hộp khi rảnh", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConfirmDialog title="Gia hạn?" description="x" confirmLabel="Gia hạn" needsNote onConfirm={async () => {}} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc không đóng hộp khi đang chờ server", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConfirmDialog title="Gửi lại?" description="x" confirmLabel="Gửi" needsNote={false} onConfirm={never} onClose={onClose} />);
    await user.click(button("Gửi"));
    expect(button("Đang làm…").disabled).toBe(true);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hộp có tên là tiêu đề, và hai hộp cùng lúc không trùng id", () => {
    render(
      <>
        <ConfirmDialog title="Hộp một" description="x" confirmLabel="A" needsNote={false} onConfirm={async () => {}} onClose={() => {}} />
        <ConfirmDialog title="Hộp hai" description="x" confirmLabel="B" needsNote={false} onConfirm={async () => {}} onClose={() => {}} />
      </>,
    );
    const one = screen.getByRole("dialog", { name: "Hộp một" });
    const two = screen.getByRole("dialog", { name: "Hộp hai" });
    expect(one.getAttribute("aria-labelledby")).not.toBe(two.getAttribute("aria-labelledby"));
  });
});
