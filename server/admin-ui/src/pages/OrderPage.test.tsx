import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderPage } from "./OrderPage";

const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";
const CODE = 1000012;

const order = {
  order_code: CODE,
  provider: "payos",
  plan: "monthly",
  amount: 50000,
  amount_paid: 20000,
  currency: "VND",
  email: "khach@example.com",
  status: "underpaid",
  grant_kind: null,
  license_id: null,
  renew_license_id: null,
  created_at: 1_790_812_800,
  paid_at: null,
  email_sent_at: null,
  email_gave_up_at: null,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Tra cứu lần đầu thành công; từ lần thứ hai trả `afterGrant`. */
function serve(afterGrant: () => Response) {
  let lookups = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/admin/lookup") {
        lookups++;
        return lookups === 1 ? json({ licenses: [], orders: [order] }) : afterGrant();
      }
      if (url.startsWith("/admin/audit")) return json({ items: [], next_cursor: null });
      if (url === `/admin/orders/${CODE}/grant`) {
        return json({ license_id: "11111111-1111-4111-8111-111111111111", license_key: KEY, plan: "monthly", expires_at: 1_800_000_000 });
      }
      throw new Error(`fetch không mong đợi: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function grant(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Cấp tay…" }));
  await user.type(screen.getByLabelText(/Lý do/), "khách chuyển bù");
  await user.click(screen.getByRole("button", { name: "Cấp" }));
}

describe("OrderPage: hộp hiện key mới (chỉ hiện một lần)", () => {
  it("cấp key xong mà tải lại đơn bị lỗi: vẫn thấy key và nút Xong, bấm Xong thì hộp đóng", async () => {
    const user = userEvent.setup();
    serve(() => json({ error: "internal" }, 500));
    render(<OrderPage code={CODE} />);
    await grant(user);
    // Đợi trang đơn thay bằng thông báo lỗi tải lại, rồi mới kiểm hộp key (nếu kiểm sớm thì chưa thấy lỗi bỏ hộp đi).
    expect(await screen.findByText("Lỗi máy chủ")).toBeTruthy();
    expect(screen.getByText(KEY)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Xong" }));
    expect(screen.queryByText(KEY)).toBeNull();
    expect(screen.getByText("Lỗi máy chủ")).toBeTruthy();
  });

  it("cấp key xong, tải lại được: thấy key và trang đơn", async () => {
    const user = userEvent.setup();
    serve(() => json({ licenses: [], orders: [{ ...order, status: "paid", amount_paid: 50000 }] }));
    render(<OrderPage code={CODE} />);
    await grant(user);
    expect(await screen.findByText(KEY)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xong" })).toBeTruthy();
    expect(await screen.findByText("Đã trả")).toBeTruthy();
  });
});
