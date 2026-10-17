import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortHash } from "../format";
import { DEVICE, FP, group, json, RID, report } from "./error-fixtures";
import { ErrorsPage } from "./ErrorsPage";
import { CODE_ERROR } from "./ManualReportsPanel";
import { VERSION_ERROR } from "./ErrorGroupsPanel";

const EMPTY_PAGE = { items: [], next_cursor: null };
const MANUAL = report({ kind: "manual", code: null, fingerprint: "0000000000000000" });

let urls: string[];
let groups: () => Response;
let reports: () => Response;

beforeEach(() => {
  urls = [];
  groups = () => json(EMPTY_PAGE);
  reports = () => json(EMPTY_PAGE);
  window.history.replaceState(null, "", "/errors");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return url.startsWith("/admin/error-groups") ? groups() : reports();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const cell = (row: HTMLElement, label: string) => row.querySelector<HTMLElement>(`td[data-label="${label}"]`)!;

describe("ErrorsPage: tab Nhóm lỗi", () => {
  it("mở đầu gọi /admin/error-groups; chưa có báo cáo nào thì báo trống", async () => {
    render(<ErrorsPage />);
    expect(await screen.findByText("Chưa có báo cáo lỗi nào")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Báo cáo lỗi" })).toBeTruthy();
    expect(urls).toEqual(["/admin/error-groups"]);
  });

  it("mỗi nhóm: mã lỗi là liên kết tới trang nhóm, loại, các phiên bản, số máy, số báo cáo kèm số debug", async () => {
    groups = () => json({ items: [group()], next_cursor: null });
    render(<ErrorsPage />);
    const link = await screen.findByRole("link", { name: "sidecarFailed" });
    expect(link.getAttribute("href")).toBe(`/errors/groups/${FP}`);
    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByText("Phiên dịch lỗi")).toBeTruthy();
    expect(cell(row, "Phiên bản").textContent).toBe("0.1.10, 0.1.9");
    expect(cell(row, "Máy").textContent).toBe("4");
    expect(within(cell(row, "Báo cáo")).getByText("1 debug")).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".filterbar-count")?.textContent).toBe("1 nhóm"));
  });

  it("bấm vào hàng (ngoài liên kết) mở trang nhóm", async () => {
    groups = () => json({ items: [group()], next_cursor: null });
    render(<ErrorsPage />);
    const row = (await screen.findByRole("link", { name: "sidecarFailed" })).closest("tr") as HTMLElement;
    fireEvent.click(cell(row, "Gần nhất"));
    expect(window.location.pathname).toBe(`/errors/groups/${FP}`);
  });

  it("lọc theo loại: gọi lại với kind=…, về Tất cả thì bỏ tham số; có chip và nút xóa lọc khi rỗng", async () => {
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo lỗi nào");
    expect(screen.getByRole("radiogroup", { name: "Loại" })).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Phiên dịch lỗi" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-groups?kind=session_error"));
    expect(await screen.findByText("Không có nhóm lỗi nào")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bỏ lọc Loại: Phiên dịch lỗi" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-groups"));
  });

  it("công tắc Hiện cả báo cáo debug gửi include_debug=1", async () => {
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo lỗi nào");
    await user.click(screen.getByRole("switch", { name: "Hiện cả báo cáo debug" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-groups?include_debug=1"));
  });

  it("lọc theo phiên bản app: chỉ áp khi bấm Lọc; chuỗi sai mẫu thì báo lỗi và không gọi API", async () => {
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo lỗi nào");
    const box = screen.getByLabelText("Phiên bản app");
    await user.type(box, "$$");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    expect(screen.getByRole("alert").textContent).toBe(VERSION_ERROR);
    expect(urls).toEqual(["/admin/error-groups"]);
    await user.clear(box);
    await user.type(box, "0.1.9");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-groups?app_version=0.1.9"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ErrorsPage: tab Gửi tay", () => {
  it("đổi sang tab: gọi /admin/error-reports?kind=manual; báo cáo là liên kết tới chi tiết và trang máy", async () => {
    const user = userEvent.setup();
    reports = () => json({ items: [MANUAL], next_cursor: null });
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo lỗi nào");
    await user.click(screen.getByRole("radio", { name: "Gửi tay" }));
    const link = await screen.findByRole("link", { name: RID });
    expect(urls.at(-1)).toBe("/admin/error-reports?kind=manual");
    expect(link.getAttribute("href")).toBe(`/errors/reports/${RID}`);
    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByRole("link", { name: shortHash(DEVICE) }).getAttribute("href")).toBe(`/devices/${DEVICE}`);
  });

  it("?tab=manual của địa chỉ trang mở thẳng tab Gửi tay; chưa có báo cáo gửi tay thì báo trống", async () => {
    window.history.replaceState(null, "", "/errors?tab=manual");
    render(<ErrorsPage />);
    expect(await screen.findByText("Chưa có báo cáo gửi tay nào")).toBeTruthy();
    expect(urls).toEqual(["/admin/error-reports?kind=manual"]);
    expect(screen.getByRole("radio", { name: "Gửi tay" }).getAttribute("aria-checked")).toBe("true");
  });

  it("tìm theo mã báo cáo: chữ thường cũng được (chuẩn hóa thành chữ hoa), có chip, bỏ chip thì bỏ lọc", async () => {
    window.history.replaceState(null, "", "/errors?tab=manual");
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo gửi tay nào");
    await user.type(screen.getByLabelText("Mã báo cáo"), "r-7f3k-92qd");
    await user.click(screen.getByRole("button", { name: "Tìm" }));
    await waitFor(() => expect(urls.at(-1)).toBe(`/admin/error-reports?kind=manual&report=${RID}`));
    await user.click(await screen.findByRole("button", { name: `Bỏ lọc Mã báo cáo: ${RID}` }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-reports?kind=manual"));
  });

  it("mã báo cáo sai mẫu: báo lỗi ngay ở ô, không gọi API", async () => {
    window.history.replaceState(null, "", "/errors?tab=manual");
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo gửi tay nào");
    await user.type(screen.getByLabelText("Mã báo cáo"), "abc");
    await user.click(screen.getByRole("button", { name: "Tìm" }));
    expect(screen.getByRole("alert").textContent).toBe(CODE_ERROR);
    expect(urls).toEqual(["/admin/error-reports?kind=manual"]);
  });

  it("công tắc Hiện cả báo cáo debug gửi include_debug=1", async () => {
    window.history.replaceState(null, "", "/errors?tab=manual");
    const user = userEvent.setup();
    render(<ErrorsPage />);
    await screen.findByText("Chưa có báo cáo gửi tay nào");
    await user.click(screen.getByRole("switch", { name: "Hiện cả báo cáo debug" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/error-reports?kind=manual&include_debug=1"));
  });
});

describe("ErrorsPage: lỗi tải", () => {
  it("máy chủ lỗi: hiện câu lỗi có nút Thử lại", async () => {
    groups = () => json({ error: "internal" }, 500);
    render(<ErrorsPage />);
    expect(await screen.findByText("Không tải được danh sách nhóm lỗi")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });
});
