import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditPage } from "./AuditPage";

const ACTION_ERROR = "Việc (action) chỉ gồm chữ thường, số và dấu gạch dưới";

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

    await user.type(screen.getByLabelText(/Việc/), "a@b.com");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    expect(screen.getByRole("alert").textContent).toBe(ACTION_ERROR);
    expect(urls).toEqual(["/admin/audit"]);

    await user.clear(screen.getByLabelText(/Việc/));
    expect(screen.queryByRole("alert")).toBeNull();
    await user.type(screen.getByLabelText(/Việc/), "license_revoked");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await screen.findByText("Không có dòng nào");
    expect(urls).toEqual(["/admin/audit", "/admin/audit?action=license_revoked"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("actor là một trong bốn giá trị cố định; có thể hiện cả lượt xem", async () => {
    const user = userEvent.setup();
    render(<AuditPage />);
    await screen.findByText("Không có dòng nào");
    await user.selectOptions(screen.getByLabelText(/Ai/), "admin");
    await user.click(screen.getByLabelText(/Hiện cả lượt xem/));
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await screen.findByText("Không có dòng nào");
    expect(urls.at(-1)).toBe("/admin/audit?actor=admin&include_views=1");
  });
});
