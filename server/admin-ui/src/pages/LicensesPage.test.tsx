import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// Trạng thái là công tắc nhiều lựa chọn (radiogroup "Trạng thái") thay cho ô chọn cũ: bấm lựa chọn thay cho đổi giá trị ô
// chọn; URL gọi, số lần gọi và giá trị `state` gửi lên không đổi.
const STATE_LABEL: Record<string, string> = {
  "": "Tất cả",
  active: "Còn hạn",
  expired: "Hết hạn",
  revoked: "Thu hồi",
  locked: "Khóa tạm",
  conflict: "Xung đột",
};
const pickState = (state: string) => fireEvent.click(screen.getByRole("radio", { name: STATE_LABEL[state] }));

describe("LicensesPage: bộ lọc vào query", () => {
  const gets = () => calls.filter((c) => c.method === "GET").map((c) => c.url);

  it("đổi Trạng thái và Gói: gọi lại /admin/licenses đúng query; về Tất cả thì bỏ tham số đó", async () => {
    render(<LicensesPage />);
    await screen.findByText("Không có license nào");
    expect(gets()).toEqual(["/admin/licenses"]);

    pickState("locked");
    await waitFor(() => expect(gets().at(-1)).toBe("/admin/licenses?state=locked"));
    fireEvent.change(screen.getByLabelText("Gói"), { target: { value: "yearly" } });
    await waitFor(() => expect(gets().at(-1)).toBe("/admin/licenses?state=locked&plan=yearly"));
    pickState("");
    await waitFor(() => expect(gets().at(-1)).toBe("/admin/licenses?plan=yearly"));
    fireEvent.change(screen.getByLabelText("Gói"), { target: { value: "" } });
    await waitFor(() => expect(gets().at(-1)).toBe("/admin/licenses"));
    expect(gets()).toHaveLength(5);
  });

  it.each(["active", "expired", "revoked", "locked", "conflict"])("Trạng thái %s đi vào query state", async (state) => {
    render(<LicensesPage />);
    await screen.findByText("Không có license nào");
    pickState(state);
    await waitFor(() => expect(gets().at(-1)).toBe(`/admin/licenses?state=${state}`));
    expect(screen.getByRole("radio", { name: STATE_LABEL[state] }).getAttribute("aria-checked")).toBe("true");
  });

  it("?state= trong địa chỉ (liên kết từ Việc cần xử lý) thành bộ lọc ban đầu; giá trị lạ thì bỏ", async () => {
    window.history.replaceState(null, "", "/licenses?state=conflict");
    const { unmount } = render(<LicensesPage />);
    await screen.findByText("Không có license nào");
    expect(gets()).toEqual(["/admin/licenses?state=conflict"]);
    expect(screen.getByRole("radio", { name: "Xung đột" }).getAttribute("aria-checked")).toBe("true");
    unmount();
    calls = [];
    window.history.replaceState(null, "", "/licenses?state=hack");
    render(<LicensesPage />);
    await screen.findByText("Không có license nào");
    expect(gets()).toEqual(["/admin/licenses"]);
    expect(screen.getByRole("radio", { name: "Tất cả" }).getAttribute("aria-checked")).toBe("true");
    window.history.replaceState(null, "", "/");
  });

  it("chip của bộ lọc đang bật: bỏ từng cái, Xóa lọc bỏ hết; trạng thái rỗng khi lọc có nút Xóa bộ lọc", async () => {
    render(<LicensesPage />);
    await screen.findByText("Không có license nào");
    // Không lọc: không chip, gợi ý nguồn dữ liệu, không có nút xóa lọc.
    expect(screen.queryByRole("list", { name: "Bộ lọc đang bật" })).toBeNull();
    expect(screen.getByText(/License hiện ở đây khi khách trả tiền xong/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Xóa bộ lọc" })).toBeNull();

    pickState("revoked");
    fireEvent.change(screen.getByLabelText("Gói"), { target: { value: "monthly" } });
    await waitFor(() => expect(gets().at(-1)).toBe("/admin/licenses?state=revoked&plan=monthly"));
    const chips = await screen.findByRole("list", { name: "Bộ lọc đang bật" });
    expect(within(chips).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Trạng thái: Thu hồi", "Gói: Monthly"]);
    expect(await screen.findByText("Không có license khớp bộ lọc đang chọn.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc Gói: Monthly" }));
    await waitFor(() => expect(gets().at(-1)).toBe("/admin/licenses?state=revoked"));
    fireEvent.change(screen.getByLabelText("Gói"), { target: { value: "yearly" } });
    await waitFor(() => expect(gets().at(-1)).toBe("/admin/licenses?state=revoked&plan=yearly"));
    fireEvent.click(screen.getByRole("button", { name: "Xóa lọc" }));
    await waitFor(() => expect(gets().at(-1)).toBe("/admin/licenses"));
    expect(screen.getByRole("radio", { name: "Tất cả" }).getAttribute("aria-checked")).toBe("true");

    pickState("locked");
    fireEvent.click(await screen.findByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() => expect(gets().at(-1)).toBe("/admin/licenses"));
  });
});

describe("LicensesPage: ô email của hộp cấp license", () => {
  it("email sai dạng: báo lỗi sau khi rời ô, sửa đúng thì mất", async () => {
    const user = userEvent.setup();
    render(<LicensesPage />);
    await user.click(await screen.findByRole("button", { name: "Cấp license mới…" }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("Email của khách");
    await user.type(input, "khach@");
    expect(within(dialog).queryByText(/Email chưa đúng dạng/)).toBeNull();
    fireEvent.blur(input);
    expect(within(dialog).getByText(/Email chưa đúng dạng/)).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await user.type(input, "example.com");
    expect(within(dialog).queryByText(/Email chưa đúng dạng/)).toBeNull();
  });
});
