import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type Column, countText, DataTable } from "./DataTable";

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

type Row = { id: string; name: string; amount: number };
const ROWS: Row[] = [
  { id: "1", name: "Một", amount: 50000 },
  { id: "2", name: "Hai", amount: 1500000 },
];
const COLS: Column<Row>[] = [
  { header: "Tên", cell: (r) => r.name },
  { header: "Số tiền", cell: (r) => String(r.amount), align: "right", nowrap: true, mobileLabel: "Tiền" },
  { header: "Mã", cell: (r) => r.id, hideOnMobile: true, primary: true },
  { header: "", cell: () => <button type="button">Gỡ…</button> },
];

describe("DataTable: giao diện mới", () => {
  it("cột số căn phải (cả tiêu đề), nhãn điện thoại riêng, cột chính, cột thao tác có tên ẩn", () => {
    const { container } = render(<DataTable columns={COLS} rows={ROWS} rowKey={(r) => r.id} empty="trống" />);
    const ths = [...container.querySelectorAll("thead th")];
    expect(ths.map((t) => t.className)).toEqual(["", "num nowrap", "hide-mobile", "dt-actions"]);
    expect(ths.every((t) => t.getAttribute("scope") === "col")).toBe(true);
    expect(ths[3]?.textContent).toBe("Thao tác");
    const tds = [...container.querySelectorAll("tbody tr:first-child td")];
    expect(tds.map((t) => t.getAttribute("data-label"))).toEqual(["Tên", "Tiền", "Mã", ""]);
    expect(tds[2]?.className).toBe("dt-primary hide-mobile");
    expect(tds[1]?.className).toBe("num nowrap");
  });

  it("không cột nào là chính: cột đầu là cột chính", () => {
    const { container } = render(<DataTable columns={columns} rows={["a"]} rowKey={rowKey} empty="trống" />);
    expect(container.querySelector("tbody td")?.className).toBe("dt-primary");
  });

  it("tải lần đầu: dòng chờ đúng số cột, aria-busy, không có trạng thái rỗng", () => {
    const { container } = render(<DataTable columns={COLS} rows={[]} rowKey={(r) => r.id} empty="trống" loading skeletonRows={3} />);
    const rows = container.querySelectorAll("tbody tr.skel-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelectorAll("td")).toHaveLength(4);
    expect(container.querySelector(".table-wrap")?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Đang tải…");
    expect(screen.queryByText("trống")).toBeNull();
  });

  it("rỗng: EmptyState với gợi ý, hành động và biến thể", () => {
    const { container } = render(
      <DataTable
        columns={COLS}
        rows={[]}
        rowKey={(r) => r.id}
        empty="Không có đơn nào khớp bộ lọc"
        emptyHint="Thử bỏ bớt bộ lọc."
        emptyAction={<button type="button">Xóa lọc</button>}
        emptyVariant="no-results"
      />,
    );
    const cell = container.querySelector("td.empty") as HTMLElement;
    expect(cell.getAttribute("colspan")).toBe("4");
    expect(cell.querySelector(".empty-state")?.className).toBe("empty-state is-no-results compact");
    expect(screen.getByText("Thử bỏ bớt bộ lọc.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xóa lọc" })).toBeTruthy();
  });

  it("chân bảng: dòng đếm bên trái (khi có dòng), Tải thêm khi còn trang sau", () => {
    const { container, rerender } = render(<DataTable columns={COLS} rows={ROWS} rowKey={(r) => r.id} empty="trống" summary="2 đơn" />);
    expect(container.querySelector(".dt-foot")?.className).toBe("dt-foot");
    expect(container.querySelector(".dt-summary")?.textContent).toBe("2 đơn");
    rerender(<DataTable columns={COLS} rows={[]} rowKey={(r) => r.id} empty="trống" summary="0 đơn" />);
    expect(container.querySelector(".dt-foot")).toBeNull();
  });

  it("maxHeight: khung cuộn có lớp riêng và nhận focus bàn phím; caption ẩn đặt tên bảng", () => {
    const { container } = render(<DataTable columns={COLS} rows={ROWS} rowKey={(r) => r.id} empty="trống" maxHeight="md" caption="Đơn hàng" />);
    const wrap = container.querySelector(".table-wrap") as HTMLElement;
    expect(wrap.className).toBe("table-wrap dt scroll-md");
    expect(wrap.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("table", { name: "Đơn hàng" })).toBeTruthy();
  });

  it("flush: khung không viền riêng (nằm trong Card)", () => {
    const { container } = render(<DataTable columns={COLS} rows={ROWS} rowKey={(r) => r.id} empty="trống" flush />);
    expect(container.querySelector(".dt-frame")?.className).toBe("dt-frame flush");
  });
});

describe("countText", () => {
  it("đếm có dấu chấm nghìn; còn trang sau thì nói rõ", () => {
    expect(countText(12, "đơn", false)).toBe("12 đơn");
    expect(countText(1200, "dòng", true)).toBe("1.200 dòng đầu, còn nữa");
  });
});
