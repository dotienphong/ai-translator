import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LicensePage } from "./LicensePage";

const ID = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";
const NOW = Math.floor(Date.now() / 1000);
const license = {
  id: ID,
  license_key: KEY,
  email: "khach@example.com",
  plan: "yearly",
  expires_at: NOW + 365 * 86400,
  created_at: NOW - 86400,
  revoked_at: null,
  locked_at: null,
  conflict: false,
  activations: [
    {
      id: "act-1",
      license_id: ID,
      device_id_hash: "a".repeat(64),
      device_label: "MacBook",
      quota_epoch: 0,
      created_at: NOW - 3600,
      last_validated_at: NOW - 60,
      deactivated_at: null,
      deactivated_by: null,
    },
  ],
  audit: [{ at: NOW - 3600, actor: "webhook", action: "license_issued", order_code: 1000001, detail: null }],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let calls: { url: string; method: string; body: unknown }[];
/** License trả về cho /admin/lookup; test đổi bằng withLicense. */
let current: Record<string, unknown>;
const withLicense = (patch: Record<string, unknown>) => {
  current = { ...license, ...patch };
};
/** Phản hồi của POST /extend; test đổi để thử 409/404. */
let extendResponse: () => Response;

beforeEach(() => {
  calls = [];
  current = license;
  extendResponse = () => json({ license_id: ID, expires_at: NOW + 400 * 86400 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/admin/lookup") return json({ licenses: [current], orders: [] });
      if (url === `/admin/licenses/${ID}/revoke`) return json({ ok: true });
      if (url === `/admin/licenses/${ID}/extend`) return extendResponse();
      if (url === `/admin/licenses/${ID}/unlock` || url === `/admin/licenses/${ID}/resend`) return json({ ok: true });
      if (url === "/admin/activations/act-1/deactivate") return json({ ok: true });
      if (url === "/admin/activations/act-1/reset-quota") return json({ activation_id: "act-1", quota_epoch: 1 });
      return json({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LicensePage", () => {
  it("tra theo license_id, che key mặc định, có bảng máy", async () => {
    render(<LicensePage id={ID} />);
    expect(await screen.findByText("K7Q2-…-9XMB")).toBeTruthy();
    expect(screen.queryByText(KEY)).toBeNull();
    expect(calls[0]).toEqual({ url: "/admin/lookup", method: "POST", body: { license_id: ID } });
    expect(screen.getByText("MacBook")).toBeTruthy();
  });

  it("thu hồi: cần lý do và gõ THU HOI; gửi note; tải lại trang", async () => {
    const user = userEvent.setup();
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Thu hồi…" }));
    const confirm = () => screen.getByRole("button", { name: "Thu hồi" }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    await user.type(screen.getByLabelText(/Lý do/), "khách yêu cầu hoàn tiền");
    expect(confirm().disabled).toBe(true);
    await user.type(screen.getByLabelText(/để xác nhận/), "THU HOI");
    expect(confirm().disabled).toBe(false);
    await user.click(confirm());
    await waitFor(() => expect(calls.filter((c) => c.url === "/admin/lookup")).toHaveLength(2));
    expect(calls.find((c) => c.url.endsWith("/revoke"))).toEqual({
      url: `/admin/licenses/${ID}/revoke`,
      method: "POST",
      body: { note: "khách yêu cầu hoàn tiền" },
    });
  });

  it("mọi nút mở hộp xác nhận đều có dấu … (Gửi lại email…, Mở khóa…)", async () => {
    const user = userEvent.setup();
    withLicense({ locked_at: NOW - 60 });
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Gửi lại email…" }));
    expect(screen.getByRole("dialog", { name: "Gửi lại email chứa key?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Hủy" }));
    await user.click(screen.getByRole("button", { name: "Mở khóa…" }));
    expect(screen.getByRole("dialog", { name: "Mở khóa license?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mở khóa" })).toBeTruthy(); // nút xác nhận trong hộp, không có dấu …
    expect(screen.queryByRole("button", { name: "Gửi lại email" })).toBeNull();
  });
});

/** Số lần đã tra cứu (lần đầu và mỗi lần tải lại). */
const lookups = () => calls.filter((c) => c.url === "/admin/lookup").length;
/** Các POST ghi (không tính tra cứu). */
const writes = () => calls.filter((c) => c.method === "POST" && c.url !== "/admin/lookup");
const btn = (name: string) => screen.queryByRole("button", { name });
const deactivated = {
  id: "act-2",
  license_id: ID,
  device_id_hash: "b".repeat(64),
  device_label: "Laptop cũ",
  quota_epoch: 0,
  created_at: NOW - 86400 * 20,
  last_validated_at: NOW - 86400 * 5,
  deactivated_at: NOW - 86400 * 4,
  deactivated_by: "admin",
};

describe("LicensePage: nút theo trạng thái license", () => {
  it("license đã thu hồi: không có Gia hạn…, Gửi lại email…, Mở khóa…, Thu hồi…, và máy không có Gỡ…/Reset hạn mức…", async () => {
    withLicense({ revoked_at: NOW - 600, locked_at: NOW - 900 });
    render(<LicensePage id={ID} />);
    expect(await screen.findByText("MacBook")).toBeTruthy();
    expect(screen.getByText("Đã thu hồi")).toBeTruthy();
    for (const name of ["Gia hạn…", "Gửi lại email…", "Mở khóa…", "Thu hồi…", "Gỡ…", "Reset hạn mức…"]) {
      expect(btn(name), name).toBeNull();
    }
  });

  it("license chưa thu hồi: có Gia hạn…, Gửi lại email…, Thu hồi…, và máy đang dùng có Gỡ…/Reset hạn mức…", async () => {
    render(<LicensePage id={ID} />);
    await screen.findByText("MacBook");
    for (const name of ["Gia hạn…", "Gửi lại email…", "Thu hồi…", "Gỡ…", "Reset hạn mức…"]) {
      expect(btn(name), name).toBeTruthy();
    }
  });

  it("Mở khóa… chỉ có khi license đang khóa tạm", async () => {
    const first = render(<LicensePage id={ID} />);
    await screen.findByText("MacBook");
    expect(btn("Mở khóa…")).toBeNull();
    first.unmount();
    withLicense({ locked_at: NOW - 60 });
    render(<LicensePage id={ID} />);
    await screen.findByText("MacBook");
    expect(btn("Mở khóa…")).toBeTruthy();
  });

  it("Gửi lại email… bị khóa khi license không còn email (đã ẩn danh), mở khi có email", async () => {
    withLicense({ email: null });
    const first = render(<LicensePage id={ID} />);
    await screen.findByText("MacBook");
    expect((btn("Gửi lại email…") as HTMLButtonElement).disabled).toBe(true);
    first.unmount();
    withLicense({});
    render(<LicensePage id={ID} />);
    await screen.findByText("MacBook");
    expect((btn("Gửi lại email…") as HTMLButtonElement).disabled).toBe(false);
  });

  it("máy đã gỡ không có Gỡ…/Reset hạn mức…; máy đang dùng thì có", async () => {
    withLicense({ activations: [...(license.activations as unknown[]), deactivated] });
    render(<LicensePage id={ID} />);
    await screen.findByText("MacBook");
    const rowOf = (label: string) => screen.getByText(label).closest("tr") as HTMLElement;
    expect(within(rowOf("Laptop cũ")).queryByRole("button")).toBeNull();
    expect(within(rowOf("Laptop cũ")).getByText(/Đã gỡ \(admin\)/)).toBeTruthy();
    expect(within(rowOf("MacBook")).getByRole("button", { name: "Gỡ…" })).toBeTruthy();
    expect(within(rowOf("MacBook")).getByRole("button", { name: "Reset hạn mức…" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Gỡ…" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Reset hạn mức…" })).toHaveLength(1);
  });
});

describe("LicensePage: mỗi thao tác gọi đúng route với đúng body", () => {
  it("Gia hạn: gửi đúng số ngày đã gõ (không cộng thêm) và {days, note}; báo đã gia hạn; tải lại", async () => {
    const user = userEvent.setup();
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Gia hạn…" }));
    const days = screen.getByLabelText(/Số ngày/) as HTMLInputElement;
    expect(days.value).toBe("30");
    await user.clear(days);
    await user.type(days, "45");
    await user.type(screen.getByLabelText(/Lý do/), "bù do lỗi hệ thống");
    await user.click(screen.getByRole("button", { name: "Gia hạn" }));
    expect(await screen.findByText(/Đã gia hạn tới/)).toBeTruthy();
    expect(writes()).toEqual([{ url: `/admin/licenses/${ID}/extend`, method: "POST", body: { days: 45, note: "bù do lỗi hệ thống" } }]);
    await waitFor(() => expect(lookups()).toBe(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["0", false],
    ["3651", false],
    ["1.5", false],
    ["-1", false],
    ["", false],
    ["1", true],
    ["3650", true],
  ])("Gia hạn: số ngày %j thì nút xác nhận %s", async (value, enabled) => {
    const user = userEvent.setup();
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Gia hạn…" }));
    await user.type(screen.getByLabelText(/Lý do/), "bù");
    fireEvent.change(screen.getByLabelText(/Số ngày/), { target: { value } });
    expect((screen.getByRole("button", { name: "Gia hạn" }) as HTMLButtonElement).disabled).toBe(!enabled);
  });

  it.each([
    [409, "already_paid", "Đơn đã được cấp trước đó"],
    [404, "not_found", "Không tìm thấy, hoặc đã ở trạng thái đó"],
  ])("Gia hạn gặp %i (trạng thái đã đổi): hiện lỗi, hộp còn mở, và tải lại trang", async (status, code, message) => {
    const user = userEvent.setup();
    extendResponse = () => json({ error: code }, status);
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Gia hạn…" }));
    await user.type(screen.getByLabelText(/Lý do/), "bù");
    expect(lookups()).toBe(1);
    await user.click(screen.getByRole("button", { name: "Gia hạn" }));
    expect((await screen.findByRole("alert")).textContent).toContain(message);
    await waitFor(() => expect(lookups()).toBe(2));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Reset hạn mức: POST /admin/activations/:id/reset-quota với {note}", async () => {
    const user = userEvent.setup();
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Reset hạn mức…" }));
    await user.type(screen.getByLabelText(/Lý do/), "khách mất bản ghi bộ đếm");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByText("Đã reset hạn mức của máy.")).toBeTruthy();
    expect(writes()).toEqual([
      { url: "/admin/activations/act-1/reset-quota", method: "POST", body: { note: "khách mất bản ghi bộ đếm" } },
    ]);
    await waitFor(() => expect(lookups()).toBe(2));
  });

  it("Gỡ máy: POST /admin/activations/:id/deactivate với {note}", async () => {
    const user = userEvent.setup();
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Gỡ…" }));
    await user.type(screen.getByLabelText(/Lý do/), "khách đổi máy");
    await user.click(screen.getByRole("button", { name: "Gỡ" }));
    expect(await screen.findByText("Đã gỡ máy.")).toBeTruthy();
    expect(writes()).toEqual([{ url: "/admin/activations/act-1/deactivate", method: "POST", body: { note: "khách đổi máy" } }]);
    await waitFor(() => expect(lookups()).toBe(2));
  });

  it("Mở khóa: POST /unlock với {note}", async () => {
    const user = userEvent.setup();
    withLicense({ locked_at: NOW - 60 });
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Mở khóa…" }));
    await user.type(screen.getByLabelText(/Lý do/), "đã xác minh với khách");
    await user.click(screen.getByRole("button", { name: "Mở khóa" }));
    expect(await screen.findByText("Đã mở khóa.")).toBeTruthy();
    expect(writes()).toEqual([{ url: `/admin/licenses/${ID}/unlock`, method: "POST", body: { note: "đã xác minh với khách" } }]);
    await waitFor(() => expect(lookups()).toBe(2));
  });

  it("Gửi lại email: không cần lý do; POST /resend với {}", async () => {
    const user = userEvent.setup();
    render(<LicensePage id={ID} />);
    await user.click(await screen.findByRole("button", { name: "Gửi lại email…" }));
    expect(screen.queryByLabelText(/Lý do/)).toBeNull();
    expect(screen.getByRole("dialog").textContent).toContain("khach@example.com");
    await user.click(screen.getByRole("button", { name: "Gửi" }));
    expect(await screen.findByText("Đã gửi lại email.")).toBeTruthy();
    expect(writes()).toEqual([{ url: `/admin/licenses/${ID}/resend`, method: "POST", body: {} }]);
    await waitFor(() => expect(lookups()).toBe(2));
  });
});
