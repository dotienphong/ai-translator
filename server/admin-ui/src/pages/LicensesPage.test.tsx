import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LicensesPage } from "./LicensesPage";

const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let calls: { url: string; method: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/admin/licenses" && init.method === "POST") {
        return json({ license_id: "11111111-1111-4111-8111-111111111111", license_key: KEY, plan: "yearly", expires_at: 1_800_000_000 });
      }
      if (url.startsWith("/admin/licenses")) return json({ items: [], next_cursor: null });
      throw new Error(`fetch không mong đợi: ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LicensesPage: cấp license mới", () => {
  it("nút khóa tới khi email hợp lệ và có lý do; gửi {email, plan, note}; hiện key mới; tải lại danh sách", async () => {
    const user = userEvent.setup();
    render(<LicensesPage />);
    await user.click(await screen.findByRole("button", { name: "Cấp license mới…" }));
    const dialog = screen.getByRole("dialog");
    const confirm = () => within(dialog).getByRole("button", { name: "Cấp" }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);

    await user.type(within(dialog).getByLabelText(/Lý do/), "bù cho khách");
    expect(confirm().disabled).toBe(true);
    await user.type(within(dialog).getByLabelText("Email của khách"), "khong-phai-email");
    expect(confirm().disabled).toBe(true);
    await user.clear(within(dialog).getByLabelText("Email của khách"));
    await user.type(within(dialog).getByLabelText("Email của khách"), "khach@example.com");
    expect(confirm().disabled).toBe(false);

    await user.selectOptions(within(dialog).getByLabelText("Gói"), "yearly");
    await user.click(confirm());

    expect(await screen.findByText(KEY)).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")).toEqual({
      url: "/admin/licenses",
      method: "POST",
      body: { email: "khach@example.com", plan: "yearly", note: "bù cho khách" },
    });
    await waitFor(() => expect(calls.filter((c) => c.url === "/admin/licenses" && c.method === "GET")).toHaveLength(2));
  });
});
