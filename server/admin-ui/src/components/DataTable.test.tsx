import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type Column, DataTable } from "./DataTable";

const columns: Column<string>[] = [{ header: "Tên", cell: (r) => r }];
const rowKey = (r: string) => r;

describe("DataTable: nút Tải thêm", () => {
  it("còn trang sau, đang rảnh: hiện nút Tải thêm bấm được, bấm thì gọi onMore", async () => {
    const user = userEvent.setup();
    const onMore = vi.fn();
    render(<DataTable columns={columns} rows={["a"]} rowKey={rowKey} empty="trống" hasMore loading={false} onMore={onMore} />);
    const btn = screen.getByRole("button", { name: "Tải thêm" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    await user.click(btn);
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it("còn trang sau, đang tải: nút bị khóa và đổi thành Đang tải…", async () => {
    const user = userEvent.setup();
    const onMore = vi.fn();
    render(<DataTable columns={columns} rows={["a"]} rowKey={rowKey} empty="trống" hasMore loading onMore={onMore} />);
    expect(screen.queryByRole("button", { name: "Tải thêm" })).toBeNull();
    const btn = screen.getByRole("button", { name: "Đang tải…" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await user.click(btn);
    expect(onMore).not.toHaveBeenCalled();
  });

  it("hết trang: không có nút, không có dòng Đang tải…", () => {
    const { container } = render(
      <DataTable columns={columns} rows={["a"]} rowKey={rowKey} empty="trống" hasMore={false} loading={false} onMore={() => {}} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Đang tải…")).toBeNull();
    expect(container.querySelector(".table-more")).toBeNull();
  });

  it("hasMore không truyền: không có nút, không có dòng Đang tải…", () => {
    const { container } = render(<DataTable columns={columns} rows={["a"]} rowKey={rowKey} empty="trống" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".table-more")).toBeNull();
  });

  it("đã có dòng, không còn trang sau, đang tải lại: không hiện dòng Đang tải… (dòng cũ giữ nguyên)", () => {
    const { container } = render(<DataTable columns={columns} rows={["a"]} rowKey={rowKey} empty="trống" hasMore={false} loading />);
    expect(container.querySelector(".table-more")).toBeNull();
  });

  it("chưa có dòng nào và đang tải: chữ Đang tải…, không có nút; xong mà rỗng thì hiện dòng empty", () => {
    const { rerender } = render(<DataTable columns={columns} rows={[]} rowKey={rowKey} empty="trống" hasMore={false} loading />);
    expect(screen.getByText("Đang tải…")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<DataTable columns={columns} rows={[]} rowKey={rowKey} empty="trống" hasMore={false} loading={false} />);
    expect(screen.getByText("trống")).toBeTruthy();
  });
});
