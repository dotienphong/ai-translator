import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable } from "../components/DataTable";
import { shortHash } from "../format";
import { DEVICE, FP, group, NOW, RID, report } from "./error-fixtures";
import { groupColumns, groupPath, KIND_LABELS, KindBadge, osText, parseReportId, ramText, reportColumns, reportPath, versionsText } from "./error-kit";

const cell = (row: HTMLElement, label: string) => row.querySelector<HTMLElement>(`td[data-label="${label}"]`)!;

describe("parseReportId", () => {
  it.each([
    ["R-7F3K-92QD", "R-7F3K-92QD"],
    ["  r-7f3k-92qd \n", "R-7F3K-92QD"],
    ["R-0000-0000", "R-0000-0000"],
  ])("%j thành %s", (raw, expected) => {
    expect(parseReportId(raw)).toBe(expected);
  });

  it.each(["", "abc", "R-7F3K-92Q", "R7F3K-92QD", "R-7F3K-92QDX", "R-7F3I-92QD", "R-7F3L-92QD", "R-7F3O-92QD", "R-7F3U-92QD"])(
    "%j không hợp lệ (độ dài sai, thiếu gạch, hay chữ I, L, O, U không có trong bảng Crockford)",
    (raw) => {
      expect(parseReportId(raw)).toBeNull();
    },
  );
});

describe("đường dẫn, nhãn và định dạng", () => {
  it("đường dẫn trang nhóm và trang chi tiết", () => {
    expect(groupPath(FP)).toBe(`/errors/groups/${FP}`);
    expect(reportPath(RID)).toBe(`/errors/reports/${RID}`);
  });

  it("hệ điều hành, RAM, danh sách phiên bản", () => {
    expect(osText(report())).toBe("macOS 15.6.1 (aarch64)");
    expect(osText(report({ os_name: "windows", os_version: "11 23H2", arch: "x86_64" }))).toBe("Windows 11 23H2 (x86_64)");
    expect(osText(report({ os_name: "linux" }))).toBe("linux 15.6.1 (aarch64)");
    expect(ramText(24576)).toBe("24 GB");
    expect(ramText(8192)).toBe("8 GB");
    expect(ramText(null)).toBeNull();
    expect(versionsText(["0.1.10"])).toBe("0.1.10");
    expect(versionsText(["a", "b", "c"])).toBe("a, b, c");
    expect(versionsText(["a", "b", "c", "d", "e"])).toBe("a, b, c +2");
  });

  it("huy hiệu loại: mỗi loại có tên tiếng Việt; loại lạ (server thêm sau) vẫn hiện nguyên mã", () => {
    for (const kind of ["crash", "session_error", "sidecar_died", "manual"] as const) {
      const { unmount } = render(<KindBadge kind={kind} />);
      expect(screen.getByText(KIND_LABELS[kind])).toBeTruthy();
      unmount();
    }
    render(<KindBadge kind={"moi" as never} />);
    expect(screen.getByText("moi")).toBeTruthy();
  });
});

describe("cột bảng", () => {
  it("báo cáo: mã là liên kết tới trang chi tiết, máy là liên kết tới trang máy, báo cáo debug có huy hiệu, thông báo rỗng thì ghi rõ", () => {
    render(
      <DataTable
        columns={reportColumns(NOW)}
        rows={[report(), report({ id: "R-0000-0002", build: "debug", message: "" })]}
        rowKey={(r) => r.id}
        empty="Trống"
      />,
    );
    const link = screen.getByRole("link", { name: RID });
    expect(link.getAttribute("href")).toBe(`/errors/reports/${RID}`);
    const row1 = link.closest("tr") as HTMLElement;
    expect(within(row1).getByRole("link", { name: shortHash(DEVICE) }).getAttribute("href")).toBe(`/devices/${DEVICE}`);
    expect(cell(row1, "Phiên bản").textContent).toBe("0.1.10");
    expect(cell(row1, "Hệ điều hành").textContent).toContain("macOS 15.6.1 (aarch64)");
    expect(within(row1).getByText("tiến trình phụ không khởi động được").getAttribute("title")).toBe("tiến trình phụ không khởi động được");
    const row2 = screen.getByRole("link", { name: "R-0000-0002" }).closest("tr") as HTMLElement;
    expect(within(cell(row2, "Phiên bản")).getByText("debug")).toBeTruthy();
    expect(within(row2).getByText("Không có")).toBeTruthy();
  });

  it("nhóm: mã lỗi là liên kết tới trang nhóm, kèm loại, phiên bản, số máy và số báo cáo (có số debug)", () => {
    render(<DataTable columns={groupColumns(NOW)} rows={[group()]} rowKey={(g) => g.fingerprint} empty="Trống" />);
    const link = screen.getByRole("link", { name: "sidecarFailed" });
    expect(link.getAttribute("href")).toBe(`/errors/groups/${FP}`);
    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByText("Phiên dịch lỗi")).toBeTruthy();
    expect(cell(row, "Phiên bản").textContent).toBe("0.1.10, 0.1.9");
    expect(cell(row, "Máy").textContent).toBe("4");
    expect(within(cell(row, "Báo cáo")).getByText("9")).toBeTruthy();
    expect(within(cell(row, "Báo cáo")).getByText("1 debug")).toBeTruthy();
    expect(cell(row, "Mã lỗi").textContent).toContain(FP);
  });

  it("nhóm không có báo cáo debug: không có dòng phụ debug", () => {
    render(<DataTable columns={groupColumns(NOW)} rows={[group({ debug_reports: 0, release_reports: 9 })]} rowKey={(g) => g.fingerprint} empty="Trống" />);
    expect(screen.queryByText(/debug/)).toBeNull();
  });
});
