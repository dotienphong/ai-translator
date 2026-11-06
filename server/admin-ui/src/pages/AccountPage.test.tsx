import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtDate } from "../format";
import { AccountPage } from "./AccountPage";

const ID = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const LIC_A = "7c1e0b9e-3a5f-4d1c-8a9e-1f2d4c3b6a96";
const LIC_B = "3a5f0b9e-7c1e-4d1c-8a9e-4c3b6a961f2d";
const HASH = "a".repeat(64);
const HASH_T = "b".repeat(64);
const NOW = Math.floor(Date.now() / 1000);

const detail = {
  account: {
    id: ID,
    email: "tai.khoan@gmail.com",
    created_at: NOW - 40 * 86400,
    last_login_at: NOW - 3600,
    consent_at: NOW - 40 * 86400,
    lang: "vi",
    trial_started_at: NOW - 40 * 86400,
    trial_ends_at: NOW - 30 * 86400,
    deleted_at: null,
    status: "paid",
  },
  licenses: [
    {
      id: LIC_A,
      email: "mua.hang@example.com",
      license_key: "K7Q2-…-9XMB",
      plan: "yearly",
      expires_at: NOW + 300 * 86400,
      created_at: NOW - 35 * 86400,
      revoked_at: null,
      locked_at: null,
      active_devices: 1,
    },
    {
      id: LIC_B,
      email: "tai.khoan@gmail.com",
      license_key: "AAAA-…-GGGG",
      plan: "monthly",
      expires_at: NOW - 5 * 86400,
      created_at: NOW - 70 * 86400,
      revoked_at: null,
      locked_at: null,
      active_devices: 0,
    },
  ],
  activations: [
    { id: "act-1", license_id: LIC_A, device_id_hash: HASH, device_label: "MacBook", created_at: NOW - 3 * 86400, last_validated_at: NOW - 60, deactivated_at: null },
  ],
  trials: [{ device_id_hash: HASH_T, started_at: NOW - 40 * 86400, ends_at: NOW - 30 * 86400, last_seen_at: NOW - 31 * 86400 }],
};

const deletedDetail = {
  ...detail,
  account: { ...detail.account, email: null, deleted_at: NOW - 2 * 86400, status: "deleted" },
  licenses: [],
  activations: [],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let calls: { url: string; method: string; body: unknown }[];
let current: unknown;
let unlinkResponse: () => Response;
let anonymizeResponse: () => Response;

beforeEach(() => {
  calls = [];
  current = detail;
  unlinkResponse = () => json({ ok: true });
  anonymizeResponse = () => json({ ok: true, changed: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url === `/admin/accounts/${ID}`) return current instanceof Response ? current : json(current);
      if (url === `/admin/accounts/${ID}/unlink-license`) return unlinkResponse();
      if (url === `/admin/accounts/${ID}/anonymize`) return anonymizeResponse();
      return json({ error: "not_found" }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AccountPage: hiển thị", () => {
  it("gọi GET /admin/accounts/:id; tiêu đề là email, huy hiệu nhóm, ngày tạo và đăng nhập gần nhất", async () => {
    render(<AccountPage id={ID} />);
    expect(await screen.findByRole("heading", { level: 1, name: "tai.khoan@gmail.com" })).toBeTruthy();
    expect(calls[0]).toEqual({ url: `/admin/accounts/${ID}`, method: "GET", body: undefined });
    expect(screen.getAllByText("Đã mua").length).toBeGreaterThan(0);
    expect(screen.getAllByText(fmtDate(detail.account.created_at), { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: "Đường dẫn" }).textContent).toContain("Tài khoản");
  });

  it("license: key che là link tới license, gói, hạn; hiện cả email mua license khi khác email tài khoản", async () => {
    render(<AccountPage id={ID} />);
    const a = await screen.findByRole("link", { name: "K7Q2-…-9XMB" });
    expect(a.getAttribute("href")).toBe(`/licenses/${LIC_A}`);
    expect(screen.getByRole("link", { name: "AAAA-…-GGGG" }).getAttribute("href")).toBe(`/licenses/${LIC_B}`);
    const itemA = a.closest("li") as HTMLElement;
    expect(within(itemA).getByText(/Email mua license: mua\.hang@example\.com/)).toBeTruthy();
    // License có cùng email với tài khoản thì không lặp lại.
    const itemB = screen.getByRole("link", { name: "AAAA-…-GGGG" }).closest("li") as HTMLElement;
    expect(within(itemB).queryByText(/Email mua license/)).toBeNull();
  });

  it("máy (kích hoạt) và dòng dùng thử có ngày", async () => {
    render(<AccountPage id={ID} />);
    const dev = await screen.findByRole("link", { name: /MacBook/ });
    expect(dev.getAttribute("href")).toBe(`/devices/${HASH}`);
    const trial = screen.getByRole("link", { name: /bbbb…bbbb/ });
    expect(trial.getAttribute("href")).toBe(`/devices/${HASH_T}`);
    const row = trial.closest("tr") as HTMLElement;
    expect(row.textContent).toContain(fmtDate(detail.trials[0]!.started_at));
    expect(row.textContent).toContain(fmtDate(detail.trials[0]!.ends_at));
  });

  it("tài khoản đã xóa: tiêu đề '(đã xóa)', hiện ngày xóa, không có nút Ẩn danh", async () => {
    current = deletedDetail;
    render(<AccountPage id={ID} />);
    expect(await screen.findByRole("heading", { level: 1, name: "(đã xóa)" })).toBeTruthy();
    expect(screen.getAllByText("Đã xóa").length).toBeGreaterThan(0);
    expect(screen.getByText(`Đã xóa lúc ${fmtDate(deletedDetail.account.deleted_at)}`, { exact: false })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ẩn danh/ })).toBeNull();
    // Dùng thử vẫn hiện (server giữ để không cấp thêm lần dùng thử).
    expect(screen.getByRole("link", { name: /bbbb…bbbb/ })).toBeTruthy();
  });

  it("không có tài khoản (404 account_not_found): trạng thái không tìm thấy, có đường về danh sách", async () => {
    current = json({ error: "account_not_found" }, 404);
    render(<AccountPage id={ID} />);
    expect(await screen.findByText("Không có tài khoản này")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về Tài khoản" }).getAttribute("href")).toBe("/accounts");
  });

  it("lỗi máy chủ: hộp lỗi có Thử lại", async () => {
    current = json({ error: "internal" }, 500);
    render(<AccountPage id={ID} />);
    expect(await screen.findByText("Không tải được tài khoản")).toBeTruthy();
  });
});

describe("AccountPage: gỡ gắn license", () => {
  it("nút của mỗi license; lý do không bắt buộc; không nhập thì body chỉ có license_id; xong tải lại trang", async () => {
    const user = userEvent.setup();
    render(<AccountPage id={ID} />);
    await user.click(await screen.findByRole("button", { name: /Gỡ gắn license K7Q2-…-9XMB/ }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Gỡ gắn" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(calls.filter((c) => c.url === `/admin/accounts/${ID}`)).toHaveLength(2));
    expect(calls.find((c) => c.url.endsWith("/unlink-license"))).toEqual({
      url: `/admin/accounts/${ID}/unlink-license`,
      method: "POST",
      body: { license_id: LIC_A },
    });
  });

  it("có nhập lý do thì gửi note đã cắt khoảng trắng", async () => {
    const user = userEvent.setup();
    render(<AccountPage id={ID} />);
    await user.click(await screen.findByRole("button", { name: /Gỡ gắn license AAAA-…-GGGG/ }));
    await user.type(within(screen.getByRole("dialog")).getByLabelText(/Lý do/), "  khách đăng nhập nhầm tài khoản  ");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ gắn" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/unlink-license"))).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/unlink-license"))?.body).toEqual({ license_id: LIC_B, note: "khách đăng nhập nhầm tài khoản" });
  });

  it("404 license_not_linked: hộp hiện câu lỗi tiếng Việt và trang tải lại", async () => {
    unlinkResponse = () => json({ error: "license_not_linked" }, 404);
    const user = userEvent.setup();
    render(<AccountPage id={ID} />);
    await user.click(await screen.findByRole("button", { name: /Gỡ gắn license K7Q2-…-9XMB/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ gắn" }));
    expect(await within(screen.getByRole("dialog")).findByText(/License không còn gắn với tài khoản này/)).toBeTruthy();
    await waitFor(() => expect(calls.filter((c) => c.url === `/admin/accounts/${ID}`)).toHaveLength(2));
  });
});

describe("AccountPage: ẩn danh tài khoản", () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: "Ẩn danh…" }));
    return screen.getByRole("dialog");
  };

  it("nằm trong Khu vực nguy hiểm; hộp có ô Lý do bắt buộc, nút khóa tới khi có lý do và gõ AN DANH", async () => {
    const user = userEvent.setup();
    render(<AccountPage id={ID} />);
    const zone = (await screen.findByText("Khu vực nguy hiểm")).closest(".danger-zone") as HTMLElement;
    expect(within(zone).getByRole("button", { name: "Ẩn danh…" })).toBeTruthy();
    const dialog = await open(user);
    const confirm = () => within(dialog).getByRole("button", { name: "Ẩn danh" }) as HTMLButtonElement;
    expect(within(dialog).getByText("bắt buộc")).toBeTruthy();
    expect(confirm().disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/để xác nhận/), "AN DANH");
    // Có chữ xác nhận mà thiếu lý do: vẫn khóa.
    expect(confirm().disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Lý do/), "   ");
    expect(confirm().disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Lý do/), "khách yêu cầu xóa");
    expect(confirm().disabled).toBe(false);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("xác nhận gửi {note} đã cắt khoảng trắng tới /anonymize rồi tải lại trang", async () => {
    const user = userEvent.setup();
    render(<AccountPage id={ID} />);
    const dialog = await open(user);
    await user.type(within(dialog).getByLabelText(/Lý do/), "  khách yêu cầu xóa  ");
    await user.type(within(dialog).getByLabelText(/để xác nhận/), "AN DANH");
    await user.click(within(dialog).getByRole("button", { name: "Ẩn danh" }));
    await waitFor(() => expect(calls.filter((c) => c.url === `/admin/accounts/${ID}`)).toHaveLength(2));
    expect(calls.find((c) => c.url.endsWith("/anonymize"))).toEqual({
      url: `/admin/accounts/${ID}/anonymize`,
      method: "POST",
      body: { note: "khách yêu cầu xóa" },
    });
  });

  it("lỗi từ API (400 invalid_request): hộp giữ nguyên và hiện câu lỗi", async () => {
    anonymizeResponse = () => json({ error: "invalid_request" }, 400);
    const user = userEvent.setup();
    render(<AccountPage id={ID} />);
    const dialog = await open(user);
    await user.type(within(dialog).getByLabelText(/Lý do/), "x");
    await user.type(within(dialog).getByLabelText(/để xác nhận/), "AN DANH");
    await user.click(within(dialog).getByRole("button", { name: "Ẩn danh" }));
    expect(await within(dialog).findByText(/Dữ liệu gửi lên không hợp lệ/)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("changed: false (tài khoản đã xóa từ trước): hộp đóng và trang tải lại, không báo đã ẩn danh", async () => {
    anonymizeResponse = () => json({ ok: true, changed: false });
    const user = userEvent.setup();
    render(<AccountPage id={ID} />);
    const dialog = await open(user);
    await user.type(within(dialog).getByLabelText(/Lý do/), "x");
    await user.type(within(dialog).getByLabelText(/để xác nhận/), "AN DANH");
    await user.click(within(dialog).getByRole("button", { name: "Ẩn danh" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/đã được ẩn danh từ trước/)).toBeTruthy();
    await waitFor(() => expect(calls.filter((c) => c.url === `/admin/accounts/${ID}`)).toHaveLength(2));
  });
});
