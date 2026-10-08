// Test của các thành phần hiển thị: Badge, Card, Section, Stat, StatGrid, EmptyState, Skeleton, LoadingBlock.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";
import { Card, Section } from "./Card";
import { EmptyState } from "./EmptyState";
import { IconKey } from "./icons";
import { LoadingBlock, SkeletonLine, SkeletonRows, SkeletonStat, SkeletonTable } from "./Skeleton";
import { Stat, StatGrid } from "./Stat";

describe("Badge", () => {
  it.each([
    ["ok", "badge badge-ok"],
    ["warn", "badge badge-warn"],
    ["bad", "badge badge-bad"],
    ["info", "badge badge-info"],
    ["neutral", "badge badge-muted"],
    ["muted", "badge badge-muted"],
  ] as const)("tông %s thành lớp %s", (tone, cls) => {
    render(<Badge tone={tone}>Nhãn</Badge>);
    expect(screen.getByText("Nhãn").className).toBe(cls);
  });

  it("mặc định trung tính; dot=false, icon, outline thành lớp", () => {
    const { rerender } = render(<Badge>Yearly</Badge>);
    expect(screen.getByText("Yearly").className).toBe("badge badge-muted");
    rerender(<Badge dot={false}>Yearly</Badge>);
    expect(screen.getByText("Yearly").className).toBe("badge badge-muted no-dot");
    rerender(
      <Badge tone="warn" icon={<IconKey />} outline>
        Yearly
      </Badge>,
    );
    const b = screen.getByText("Yearly");
    expect(b.className).toBe("badge badge-warn has-icon outline");
    expect(b.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Card", () => {
  it("là vùng có tên là tiêu đề; đầu thẻ có mô tả và hành động; thân và chân", () => {
    render(
      <Card title="Thông tin" description="Chỉ đọc" actions={<button type="button">Tải lại</button>} footer="Cập nhật lúc 14:01">
        <p>Thân</p>
      </Card>,
    );
    const region = screen.getByRole("region", { name: "Thông tin" });
    expect(screen.getByRole("heading", { level: 2, name: "Thông tin" })).toBeTruthy();
    expect(region.querySelector(".ui-card-desc")?.textContent).toBe("Chỉ đọc");
    expect(region.querySelector(".ui-card-actions button")?.textContent).toBe("Tải lại");
    expect(region.querySelector(".ui-card-body")?.textContent).toBe("Thân");
    expect(region.querySelector("footer.ui-card-foot")?.textContent).toBe("Cập nhật lúc 14:01");
  });

  it("cấp tiêu đề, tông, thân flush", () => {
    const { container } = render(
      <Card title="Khu vực nguy hiểm" level={3} tone="danger" flush>
        x
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Khu vực nguy hiểm" })).toBeTruthy();
    expect(container.querySelector(".ui-card")?.className).toBe("ui-card tone-danger");
    expect(container.querySelector(".ui-card-body")?.className).toBe("ui-card-body flush");
  });

  it("không tiêu đề: không có đầu thẻ, tên vùng lấy từ aria-label", () => {
    const { container } = render(<Card aria-label="Biểu đồ">x</Card>);
    expect(container.querySelector(".ui-card-head")).toBeNull();
    expect(screen.getByRole("region", { name: "Biểu đồ" })).toBeTruthy();
  });

  it("hai thẻ cùng tiêu đề không trùng id", () => {
    render(
      <>
        <Card title="A">1</Card>
        <Card title="A">2</Card>
      </>,
    );
    const [a, b] = screen.getAllByRole("region", { name: "A" });
    expect(a?.getAttribute("aria-labelledby")).not.toBe(b?.getAttribute("aria-labelledby"));
  });
});

describe("Section", () => {
  it("vùng có tên là tiêu đề nhỏ (group-title), mô tả và hành động", () => {
    render(
      <Section title="Tiền" description="30 ngày" actions={<a href="/x">Xem tất cả</a>}>
        <p>nội dung</p>
      </Section>,
    );
    const s = screen.getByRole("region", { name: "Tiền" });
    expect(screen.getByRole("heading", { level: 2, name: "Tiền" }).className).toBe("group-title");
    expect(s.textContent).toContain("30 ngày");
    expect(screen.getByRole("link", { name: "Xem tất cả" })).toBeTruthy();
  });
});

describe("Stat", () => {
  it("nhãn, giá trị, ghi chú; biểu tượng và tông", () => {
    const { container } = render(<Stat label="Doanh thu hôm nay" value="100.000 đ" note="Tháng trước: 0 đ" icon={<IconKey />} tone="brand" />);
    expect(container.querySelector(".stat")?.className).toBe("stat tone-brand");
    expect(container.querySelector(".stat-label")?.textContent).toBe("Doanh thu hôm nay");
    expect(container.querySelector(".stat-value")?.textContent).toBe("100.000 đ");
    expect(container.querySelector(".stat-note")?.textContent).toBe("Tháng trước: 0 đ");
    expect(container.querySelector(".stat-icon svg")).toBeTruthy();
  });

  it.each([
    [{ label: "+12%", direction: "up" } as const, "is-good"],
    [{ label: "−3%", direction: "down" } as const, "is-bad"],
    [{ label: "+2", direction: "up", upIsGood: false } as const, "is-bad"],
    [{ label: "−2", direction: "down", upIsGood: false } as const, "is-good"],
    [{ label: "không đổi", direction: "flat" } as const, "is-flat"],
  ])("xu hướng %o thành %s", (delta, cls) => {
    const { container } = render(<Stat label="x" value="1" delta={delta} />);
    const d = container.querySelector(".stat-delta");
    expect(d?.className).toBe(`stat-delta ${cls}`);
    expect(d?.textContent).toBe(delta.label);
  });

  it("StatGrid: có label thì là nhóm có tên", () => {
    render(
      <StatGrid label="Số liệu chính">
        <Stat label="a" value="1" />
      </StatGrid>,
    );
    expect(screen.getByRole("group", { name: "Số liệu chính" })).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("tiêu đề, gợi ý, hành động; hình là aria-hidden", () => {
    const { container } = render(<EmptyState title="Không có đơn nào" hint="Thử bỏ bớt bộ lọc." action={<button type="button">Xóa lọc</button>} />);
    expect(screen.getByText("Không có đơn nào")).toBeTruthy();
    expect(screen.getByText("Thử bỏ bớt bộ lọc.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xóa lọc" })).toBeTruthy();
    expect(container.querySelector(".empty-art")?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(["empty", "no-results", "success", "error"] as const)("biến thể %s thành lớp, có hình mặc định", (variant) => {
    const { container } = render(<EmptyState title="x" variant={variant} compact />);
    expect(container.querySelector(".empty-state")?.className).toBe(`empty-state is-${variant} compact`);
    expect(container.querySelector(".empty-art svg")).toBeTruthy();
  });
});

describe("Skeleton", () => {
  it("thanh là aria-hidden, độ dài và cỡ thành lớp", () => {
    const { container } = render(<SkeletonLine width="lg" size="stat" />);
    const s = container.querySelector(".skel");
    expect(s?.getAttribute("aria-hidden")).toBe("true");
    expect(s?.className).toBe("skel skel-line w-lg fs-stat");
  });

  it("SkeletonStat cùng khung với Stat (nhãn, số, ghi chú)", () => {
    const { container } = render(<SkeletonStat />);
    const s = container.querySelector(".stat.is-skeleton");
    expect(s?.querySelector(".stat-label .skel")).toBeTruthy();
    expect(s?.querySelector(".stat-value .skel")).toBeTruthy();
    expect(s?.querySelector(".stat-foot .skel")).toBeTruthy();
  });

  it("SkeletonRows: đúng số dòng và số cột", () => {
    const { container } = render(
      <table>
        <tbody>
          <SkeletonRows rows={3} columns={4} />
        </tbody>
      </table>,
    );
    const rows = container.querySelectorAll("tr.skel-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelectorAll("td")).toHaveLength(4);
  });

  it("SkeletonTable: đầu bảng có chữ thật, vùng đang tải đọc được", () => {
    render(<SkeletonTable headers={["Mã đơn", "Email"]} rows={2} />);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Mã đơn", "Email"]);
    expect(screen.getByRole("status").textContent).toBe("Đang tải…");
  });

  it("LoadingBlock: aria-busy, nhãn ẩn đọc được, mặc định ba thanh", () => {
    const { container } = render(<LoadingBlock />);
    const block = container.querySelector(".loading-block");
    expect(block?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Đang tải…");
    expect(screen.getByRole("status").className).toBe("sr-only");
    expect(block?.querySelectorAll(".skel")).toHaveLength(3);
  });

  it("LoadingBlock: nhãn riêng và nội dung riêng", () => {
    render(
      <LoadingBlock label="Đang tìm…">
        <SkeletonLine />
      </LoadingBlock>,
    );
    expect(screen.getByRole("status").textContent).toBe("Đang tìm…");
  });
});
