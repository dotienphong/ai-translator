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

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];

const ISSUED = { license_id: "11111111-1111-4111-8111-111111111111", license_key: KEY, plan: "monthly", expires_at: 1_800_000_000 };

/**
 * Mock fetch theo URL, ghi mọi lời gọi vào `calls`. `lookup(n)`: phản hồi của lần tra cứu thứ n (từ 1; mặc định trả đơn `o`).
 * `post`: phản hồi của các POST ghi theo URL (mặc định cả grant lẫn resolve đều thành công).
 */
function serveOrder(o: object, opts: { lookup?: (n: number) => Response; post?: Record<string, () => Response> } = {}) {
  calls = [];
  let lookups = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/admin/lookup") {
        lookups++;
        return opts.lookup ? opts.lookup(lookups) : json({ licenses: [], orders: [o] });
      }
      if (url.startsWith("/admin/audit")) return json({ items: [], next_cursor: null });
      const post = opts.post?.[url];
      if (post) return post();
      if (url === `/admin/orders/${CODE}/grant`) return json(ISSUED);
      if (url === `/admin/orders/${CODE}/resolve`) return json({ order_code: CODE, status: "refunded" });
      throw new Error(`fetch không mong đợi: ${url}`);
    }),
  );
}

/** Tra cứu lần đầu thành công; từ lần thứ hai trả `afterGrant`. */
function serve(afterGrant: () => Response) {
  serveOrder(order, { lookup: (n) => (n === 1 ? json({ licenses: [], orders: [order] }) : afterGrant()) });
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

describe("OrderPage: mô tả hộp Cấp tay theo dữ liệu đơn", () => {
  const LIC = "22222222-2222-4222-8222-222222222222";
  const WARNING = "Đơn mới nhận 20.000 đ / 50.000 đ: chỉ cấp khi khách đã chuyển bù hay bạn đã xác minh.";
  const RENEW = "áp vào license của đơn (gia hạn hay đổi gói) theo luật của đơn, tính từ bây giờ";

  async function openGrant(o: object) {
    const user = userEvent.setup();
    serveOrder(o);
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Cấp tay…" }));
    return screen.getByRole("dialog").textContent ?? "";
  }

  it("đơn chuyển thiếu, mua mới: có cảnh báo số tiền, vẫn nói tính từ bây giờ, không nói áp vào license", async () => {
    const text = await openGrant(order);
    expect(text).toContain(WARNING);
    expect(text).toContain("Cấp license theo gói của đơn, tính từ bây giờ");
    expect(text).not.toContain("áp vào license của đơn");
  });

  it("đơn đã nhận đủ tiền, mua mới: không có cảnh báo số tiền", async () => {
    const text = await openGrant({ ...order, status: "processing", amount_paid: 50000 });
    expect(text).not.toContain("Đơn mới nhận");
    expect(text).toContain("Cấp license theo gói của đơn, tính từ bây giờ");
  });

  it("đơn gia hạn hay đổi gói (có renew_license_id), đã nhận đủ: nói áp vào license của đơn theo luật của đơn, không cảnh báo tiền", async () => {
    const text = await openGrant({ ...order, status: "processing", amount_paid: 50000, renew_license_id: LIC });
    expect(text).toContain(RENEW);
    expect(text).not.toContain("Cấp license theo gói của đơn, tính từ bây giờ");
    expect(text).not.toContain("Đơn mới nhận");
  });

  it("đơn gia hạn mà mới nhận thiếu: có cả hai câu", async () => {
    const text = await openGrant({ ...order, renew_license_id: LIC });
    expect(text).toContain(RENEW);
    expect(text).toContain(WARNING);
  });
});
