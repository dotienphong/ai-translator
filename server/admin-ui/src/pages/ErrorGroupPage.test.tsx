import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FP, json, report } from "./error-fixtures";
import { ErrorGroupPage } from "./ErrorGroupPage";

let calls: { url: string; method: string; body: unknown }[];
let reports: () => Response;
let deleteReply: () => Response;

const LIST_URL = `/admin/error-reports?fingerprint=${FP}&include_debug=1`;
const listCalls = () => calls.filter((c) => c.url.startsWith("/admin/error-reports?"));

beforeEach(() => {
  calls = [];
  reports = () => json({ items: [report({ id: "R-0000-0001" }), report({ id: "R-0000-0002", build: "debug" })], next_cursor: null });
  deleteReply = () => json({ deleted: 2 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      return url === "/admin/error-reports/delete" ? deleteReply() : reports();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ErrorGroupPage", () => {
  it("gọi báo cáo của nhóm kèm cả báo cáo debug; tiêu đề là mã lỗi của báo cáo đầu, có huy hiệu loại và dấu vân tay", async () => {
    render(<ErrorGroupPage fingerprint={FP} />);
    expect(await screen.findByRole("heading", { level: 1, name: "sidecarFailed" })).toBeTruthy();
    expect(calls[0]?.url).toBe(LIST_URL);
    expect(screen.getByText("Phiên dịch lỗi")).toBeTruthy();
    expect(screen.getByText(FP)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chép dấu vân tay" })).toBeTruthy();
  });

  it("đường dẫn về Báo cáo lỗi; mỗi báo cáo là liên kết tới chi tiết, báo cáo debug có huy hiệu", async () => {
    render(<ErrorGroupPage fingerprint={FP} />);
    const link = await screen.findByRole("link", { name: "R-0000-0001" });
    expect(link.getAttribute("href")).toBe("/errors/reports/R-0000-0001");
    const crumbs = within(screen.getByRole("navigation", { name: "Đường dẫn" }));
    expect(crumbs.getByRole("link", { name: "Báo cáo lỗi" }).getAttribute("href")).toBe("/errors");
    const row2 = screen.getByRole("link", { name: "R-0000-0002" }).closest("tr") as HTMLElement;
    expect(within(row2).getByText("debug")).toBeTruthy();
  });

  it("xóa cả nhóm: hộp xác nhận không đòi lý do; xác nhận gửi {fingerprint}, báo kết quả và tải lại danh sách (rỗng thì báo nhóm không còn)", async () => {
    const user = userEvent.setup();
    render(<ErrorGroupPage fingerprint={FP} />);
    await screen.findByRole("link", { name: "R-0000-0001" });
    await user.click(screen.getByRole("button", { name: "Xóa nhóm…" }));
    const dialog = screen.getByRole("dialog", { name: "Xóa cả nhóm lỗi này?" });
    expect(within(dialog).getByText(/2 báo cáo/)).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Lý do/)).toBeNull();
    reports = () => json({ items: [], next_cursor: null });
    await user.click(within(dialog).getByRole("button", { name: "Xóa nhóm" }));
    expect(await screen.findByText("Đã xóa 2 báo cáo.")).toBeTruthy();
    expect(calls.find((c) => c.url === "/admin/error-reports/delete")).toEqual({
      url: "/admin/error-reports/delete",
      method: "POST",
      body: { fingerprint: FP },
    });
    expect(await screen.findByText("Nhóm này không còn báo cáo nào")).toBeTruthy();
    expect(listCalls()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Xóa nhóm…" })).toBeNull();
    expect(screen.getByRole("link", { name: "Về Báo cáo lỗi" }).getAttribute("href")).toBe("/errors");
  });

  it("xóa gặp 404 (nhóm đã bị xóa nơi khác): hộp báo lỗi và trang tải lại", async () => {
    const user = userEvent.setup();
    deleteReply = () => json({ error: "not_found" }, 404);
    render(<ErrorGroupPage fingerprint={FP} />);
    await screen.findByRole("link", { name: "R-0000-0001" });
    await user.click(screen.getByRole("button", { name: "Xóa nhóm…" }));
    await user.click(within(screen.getByRole("dialog", { name: "Xóa cả nhóm lỗi này?" })).getByRole("button", { name: "Xóa nhóm" }));
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(within(screen.getByRole("dialog", { name: "Xóa cả nhóm lỗi này?" })).getByRole("alert").textContent).toContain("Không tìm thấy");
  });

  it("nhóm không có báo cáo nào: trạng thái trống, không có Khu vực nguy hiểm", async () => {
    reports = () => json({ items: [], next_cursor: null });
    render(<ErrorGroupPage fingerprint={FP} />);
    expect(await screen.findByText("Nhóm này không còn báo cáo nào")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Nhóm lỗi" })).toBeTruthy();
    expect(screen.queryByText("Khu vực nguy hiểm")).toBeNull();
  });

  it("máy chủ lỗi: hiện câu lỗi có nút Thử lại", async () => {
    reports = () => json({ error: "internal" }, 500);
    render(<ErrorGroupPage fingerprint={FP} />);
    expect(await screen.findByText("Không tải được các báo cáo của nhóm")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });
});
