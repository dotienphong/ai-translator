import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditPage } from "./AuditPage";

// Ô "Việc (action)" đổi tên thành "Hành động (mã)" cho cùng chữ với cột bảng và dòng thời gian; thông báo lỗi đổi theo.
const ACTION_ERROR = "Mã hành động chỉ gồm chữ thường, số và dấu gạch dưới";
const RANGE_ERROR = "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc";

let urls: string[];

beforeEach(() => {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuditPage: bộ lọc", () => {
  it("action không khớp mẫu của server (email…): không gọi API, hiện thông báo; sửa lại thì gọi", async () => {
    const user = userEvent.setup();
    render(<AuditPage />);
    await screen.findByText("Không có dòng nào");
    expect(urls).toEqual(["/admin/audit"]);

    await user.type(screen.getByLabelText(/Hành động/), "a@b.com");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    expect(screen.getByRole("alert").textContent).toBe(ACTION_ERROR);
    expect(urls).toEqual(["/admin/audit"]);

    await user.clear(screen.getByLabelText(/Hành động/));
    expect(screen.queryByRole("alert")).toBeNull();
    await user.type(screen.getByLabelText(/Hành động/), "license_revoked");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await screen.findByText("Không có dòng nào");
    expect(urls).toEqual(["/admin/audit", "/admin/audit?action=license_revoked"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Tác nhân là công tắc nhiều lựa chọn (radiogroup "Tác nhân") thay cho ô chọn "Ai (actor)": vẫn chỉ bốn giá trị cố định,
  // vẫn chỉ áp dụng khi bấm Lọc.
  it("actor là một trong bốn giá trị cố định; có thể hiện cả lượt xem", async () => {
    const user = userEvent.setup();
    render(<AuditPage />);
    await screen.findByText("Không có dòng nào");
    expect(screen.getAllByRole("radio").filter((r) => r.closest('[aria-label="Tác nhân"]')).map((r) => r.textContent)).toEqual([
      "Tất cả",
      "Vận hành",
      "App",
      "Webhook",
      "Đối soát",
    ]);
    await user.click(screen.getByRole("radio", { name: "Vận hành" }));
    expect(urls).toEqual(["/admin/audit"]);
    await user.click(screen.getByLabelText(/Hiện cả lượt xem/));
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await screen.findByText("Không có dòng nào");
    expect(urls.at(-1)).toBe("/admin/audit?actor=admin&include_views=1");
  });

  it("ngày bắt đầu sau ngày kết thúc: không gọi API, hiện thông báo; sửa lại thì gọi và thông báo mất", async () => {
    const user = userEvent.setup();
    render(<AuditPage />);
    await screen.findByText("Không có dòng nào");
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-10-01" } });
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    expect(screen.getByRole("alert").textContent).toBe(RANGE_ERROR);
    expect(urls).toEqual(["/admin/audit"]);

    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-10-06" } });
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await screen.findByText("Không có dòng nào");
    expect(urls).toEqual(["/admin/audit", "/admin/audit?from=2026-10-05&to=2026-10-06"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cùng một ngày thì hợp lệ; chỉ có một đầu thì không so sánh", async () => {
    const user = userEvent.setup();
    render(<AuditPage />);
    await screen.findByText("Không có dòng nào");
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-10-05" } });
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await screen.findByText("Không có dòng nào");
    expect(urls.at(-1)).toBe("/admin/audit?from=2026-10-05");
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-10-05" } });
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await screen.findByText("Không có dòng nào");
    expect(urls.at(-1)).toBe("/admin/audit?from=2026-10-05&to=2026-10-05");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

const NOW = Math.floor(Date.now() / 1000);
const row = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  at: NOW - id * 60,
  actor: "admin:ops@example.com",
  action: "license_revoked",
  license_id: "11111111-1111-4111-8111-111111111111",
  order_code: 1000012,
  detail: '{"note":"khách yêu cầu"}',
  ...over,
});

function serve(items: unknown[], next: string | null = null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ items: url.includes("cursor=") ? [row(99, { action: "activated", actor: "api" })] : items, next_cursor: url.includes("cursor=") ? null : next }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

describe("AuditPage: hai cách xem", () => {
  beforeEach(() => localStorage.clear());

  it("mặc định là dòng thời gian (tên dễ đọc, tác nhân, liên kết); đổi sang Bảng thì có bảng, và nhớ lựa chọn", async () => {
    serve([row(1), row(2, { actor: "webhook", action: "license_issued", detail: null })]);
    const { unmount } = render(<AuditPage />);
    const tl = await screen.findByRole("list", { name: "Nhật ký theo thời gian" });
    expect(screen.getByRole("radio", { name: "Dòng thời gian" }).getAttribute("aria-checked")).toBe("true");
    expect(tl.textContent).toContain("Thu hồi license");
    expect(tl.textContent).toContain("license_revoked");
    expect(tl.textContent).toContain("Vận hành");
    expect(tl.textContent).toContain("note: khách yêu cầu");
    expect(screen.getAllByRole("link", { name: "Đơn #1000012" })[0]?.getAttribute("href")).toBe("/orders/1000012");
    expect(screen.queryByRole("table")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Bảng" }));
    const table = screen.getByRole("table");
    expect(table.textContent).toContain("Cấp license");
    expect(screen.queryByRole("list", { name: "Nhật ký theo thời gian" })).toBeNull();
    // Đổi cách xem không gọi lại API.
    expect(urls).toEqual(["/admin/audit"]);
    unmount();

    render(<AuditPage />);
    await screen.findAllByText("Cấp license");
    expect(screen.getByRole("radio", { name: "Bảng" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("localStorage hỏng (chế độ riêng tư): vẫn mở được, đổi cách xem vẫn chạy", async () => {
    serve([row(1)]);
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<AuditPage />);
    await screen.findByRole("list", { name: "Nhật ký theo thời gian" });
    fireEvent.click(screen.getByRole("radio", { name: "Bảng" }));
    expect(screen.getByRole("table")).toBeTruthy();
    get.mockRestore();
    set.mockRestore();
  });

  it("dòng thời gian: còn trang sau thì đếm 'N+ dòng', Tải thêm gửi con trỏ và nối thêm mốc", async () => {
    serve([row(1)], "c1");
    render(<AuditPage />);
    await screen.findByRole("list", { name: "Nhật ký theo thời gian" });
    await waitFor(() => expect(document.querySelector(".filterbar-count")?.textContent).toBe("1+ dòng"));
    fireEvent.click(screen.getByRole("button", { name: "Tải thêm" }));
    expect(await screen.findByText("Kích hoạt máy")).toBeTruthy();
    expect(urls).toEqual(["/admin/audit", "/admin/audit?cursor=c1"]);
    await waitFor(() => expect(document.querySelector(".filterbar-count")?.textContent).toBe("2 dòng"));
  });
});

describe("AuditPage: chip bộ lọc đang áp dụng", () => {
  it("chip theo bộ lọc đã áp dụng (không theo ô đang sửa); bỏ chip thì lọc lại ngay; rỗng khi lọc có Xóa bộ lọc", async () => {
    const user = userEvent.setup();
    render(<AuditPage />);
    await screen.findByText("Không có dòng nào");
    await user.click(screen.getByRole("radio", { name: "Webhook" }));
    await user.type(screen.getByLabelText(/Hành động/), "license_issued");
    // Chưa bấm Lọc: chưa có chip, nút Lọc nổi bật (có thay đổi chưa áp dụng).
    expect(screen.queryByRole("list", { name: "Bộ lọc đang bật" })).toBeNull();
    expect(screen.getByRole("button", { name: "Lọc" }).className).toContain("primary");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/audit?actor=webhook&action=license_issued"));
    const chips = screen.getByRole("list", { name: "Bộ lọc đang bật" });
    expect(chips.textContent).toContain("Tác nhân: Webhook");
    expect(chips.textContent).toContain("Hành động: license_issued");
    expect(screen.getByRole("button", { name: "Lọc" }).className).not.toContain("primary");
    expect(await screen.findByText(/Không có dòng nào khớp bộ lọc/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Bỏ lọc Tác nhân: Webhook" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/audit?action=license_issued"));
    expect(screen.getByRole("radio", { name: "Tất cả" }).getAttribute("aria-checked")).toBe("true");
    await user.click(await screen.findByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/audit"));
    expect((screen.getByLabelText(/Hành động/) as HTMLInputElement).value).toBe("");
  });
});

