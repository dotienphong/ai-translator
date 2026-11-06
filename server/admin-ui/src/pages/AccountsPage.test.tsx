import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountsPage } from "./AccountsPage";

const ID_A = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const ID_B = "7c1e0b9e-3a5f-4d1c-8a9e-1f2d4c3b6a96";
const ID_C = "3a5f0b9e-7c1e-4d1c-8a9e-4c3b6a961f2d";
const ID_D = "5f3a7c1e-0b9e-4c1d-9a7e-b5a692f1d3c4";
const NOW = Math.floor(Date.now() / 1000);

const row = (id: string, email: string | null, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  email,
  created_at: NOW - 30 * 86400,
  last_login_at: NOW - 3600,
  deleted_at: status === "deleted" ? NOW - 86400 : null,
  trial_started_at: NOW - 20 * 86400,
  trial_ends_at: NOW - 10 * 86400,
  license_count: 0,
  device_count: 1,
  status,
  ...extra,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let urls: string[];
let page: (url: string) => Response;

beforeEach(() => {
  urls = [];
  page = () => json({ items: [], next_cursor: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return page(url);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("AccountsPage", () => {
  it("mở đầu gọi /admin/accounts; chưa có tài khoản nào thì báo trống", async () => {
    render(<AccountsPage />);
    expect(await screen.findByText("Chưa có tài khoản nào")).toBeTruthy();
    expect(urls).toEqual(["/admin/accounts"]);
    expect(screen.getByRole("heading", { level: 1, name: "Tài khoản" })).toBeTruthy();
  });

  it("mỗi dòng hiện email (link tới /accounts/:id), ngày tạo, đăng nhập gần nhất và nhóm bằng tiếng Việt", async () => {
    page = () =>
      json({
        items: [
          row(ID_A, "mua@example.com", "paid", { license_count: 1 }),
          row(ID_B, "thu@example.com", "trial_active", { trial_ends_at: NOW + 5 * 86400 }),
          row(ID_C, "het@example.com", "trial_ended"),
          row(ID_D, null, "deleted"),
        ],
        next_cursor: null,
      });
    render(<AccountsPage />);
    const link = await screen.findByRole("link", { name: "mua@example.com" });
    expect(link.getAttribute("href")).toBe(`/accounts/${ID_A}`);
    expect(screen.getByRole("link", { name: "thu@example.com" }).getAttribute("href")).toBe(`/accounts/${ID_B}`);
    const cells = (email: string) => Array.from(screen.getByRole("link", { name: email }).closest("tr")?.querySelectorAll("td") ?? []).map((td) => td.textContent ?? "");
    expect(cells("mua@example.com").join("|")).toContain("Đã mua");
    expect(cells("thu@example.com").join("|")).toContain("Đang dùng thử");
    expect(cells("het@example.com").join("|")).toContain("Hết dùng thử");
    // Tài khoản đã xóa không có email: link vẫn có, ghi "(đã xóa)".
    const deleted = screen.getByRole("link", { name: "(đã xóa)" });
    expect(deleted.getAttribute("href")).toBe(`/accounts/${ID_D}`);
    expect(deleted.closest("tr")?.textContent).toContain("Đã xóa");
    // Cột ngày: có tiêu đề cho ngày tạo và đăng nhập gần nhất.
    expect(screen.getByRole("columnheader", { name: "Ngày tạo" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Đăng nhập gần nhất" })).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".filterbar-count")?.textContent).toBe("4 tài khoản"));
  });

  it("ô tìm kiếm: gõ rồi Enter gọi lại với q (đã cắt khoảng trắng); xóa chữ thì bỏ tham số", async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    await screen.findByText("Chưa có tài khoản nào");
    const box = screen.getByRole("searchbox", { name: "Tìm theo email" });
    await user.type(box, "  khach@exa{Enter}");
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/accounts?q=khach%40exa"));
    // Email nằm trong tham số của API chứ không vào địa chỉ trang.
    expect(window.location.search).toBe("");
    await user.clear(box);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/accounts"));
  });

  it("lọc theo nhóm: công tắc 'Nhóm' gửi filter=paid, trial_active, trial_ended, deleted; Tất cả thì bỏ tham số", async () => {
    render(<AccountsPage />);
    await screen.findByText("Chưa có tài khoản nào");
    expect(screen.getByRole("radiogroup", { name: "Nhóm" })).toBeTruthy();
    const cases: [string, string][] = [
      ["Đã mua", "paid"],
      ["Đang dùng thử", "trial_active"],
      ["Hết dùng thử", "trial_ended"],
      ["Đã xóa", "deleted"],
    ];
    for (const [label, value] of cases) {
      fireEvent.click(screen.getByRole("radio", { name: label }));
      await waitFor(() => expect(urls.at(-1)).toBe(`/admin/accounts?filter=${value}`));
    }
    // Đang lọc mà rỗng: tiêu đề khác, có nút xóa bộ lọc.
    expect(await screen.findByText("Không có tài khoản nào")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/accounts"));
  });

  it("tìm kết hợp với nhóm: gửi cả q và filter", async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    await screen.findByText("Chưa có tài khoản nào");
    await user.click(screen.getByRole("radio", { name: "Đã mua" }));
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/accounts?filter=paid"));
    await user.type(screen.getByRole("searchbox", { name: "Tìm theo email" }), "an{Enter}");
    await waitFor(() => expect(urls.at(-1)).toBe("/admin/accounts?q=an&filter=paid"));
  });

  it("nút Xuất CSV là liên kết tới /admin/accounts/export.csv (tải về, không đi qua fetch)", async () => {
    render(<AccountsPage />);
    await screen.findByText("Chưa có tài khoản nào");
    const link = screen.getByRole("link", { name: "Xuất CSV" });
    expect(link.getAttribute("href")).toBe("/admin/accounts/export.csv");
    expect(urls).toEqual(["/admin/accounts"]);
  });

  it("Tải thêm đi theo next_cursor", async () => {
    page = (url) =>
      url.includes("cursor=")
        ? json({ items: [row(ID_B, "hai@example.com", "trial_ended")], next_cursor: null })
        : json({ items: [row(ID_A, "mot@example.com", "paid")], next_cursor: `${NOW}_${ID_A}` });
    const user = userEvent.setup();
    render(<AccountsPage />);
    await screen.findByRole("link", { name: "mot@example.com" });
    await user.click(screen.getByRole("button", { name: /Tải thêm/ }));
    expect(await screen.findByRole("link", { name: "hai@example.com" })).toBeTruthy();
    expect(urls.at(-1)).toBe(`/admin/accounts?cursor=${NOW}_${ID_A}`);
  });

  it("lỗi tải: hiện hộp lỗi có nút thử lại", async () => {
    page = () => json({ error: "internal" }, 500);
    render(<AccountsPage />);
    expect(await screen.findByText("Không tải được danh sách tài khoản")).toBeTruthy();
    expect(within(screen.getByRole("alert")).getByRole("button", { name: /Thử lại/ })).toBeTruthy();
  });
});
