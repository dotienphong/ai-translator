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

describe("OrderPage: điều kiện hiện nút theo trạng thái đơn", () => {
  const OPEN = ["Cấp tay…", "Cấp key mới…", "Ghi đã hoàn tiền…"];
  it.each([
    ["pending", ["Cấp tay…"]],
    ["processing", ["Cấp tay…"]],
    ["underpaid", ["Cấp tay…"]],
    ["cancelled", ["Cấp tay…"]],
    ["expired", ["Cấp tay…"]],
    ["failed", ["Cấp tay…"]],
    ["paid", []],
    ["refunded", []],
    ["paid_needs_review", ["Cấp key mới…", "Ghi đã hoàn tiền…"]],
  ])("đơn %s: hiện đúng các nút ghi", async (status, shown) => {
    serveOrder({ ...order, status });
    render(<OrderPage code={CODE} />);
    await screen.findByRole("heading", { name: /Đơn #1000012/ });
    for (const name of OPEN) {
      expect(screen.queryByRole("button", { name }) !== null, `nút ${name}`).toBe(shown.includes(name));
    }
    // Nút xem trạng thái trên PayOS (chỉ đọc) luôn có.
    expect(screen.getByRole("button", { name: "Xem trạng thái trên PayOS" })).toBeTruthy();
  });
});

describe("OrderPage: các thao tác ghi gọi đúng route và body", () => {
  const resolveUrl = `/admin/orders/${CODE}/resolve`;
  const post = (url: string) => calls.find((c) => c.method === "POST" && c.url === url);
  /** Các POST ghi (không tính tra cứu). */
  const writes = () => calls.filter((c) => c.method === "POST" && c.url !== "/admin/lookup");
  const NEEDS_REVIEW = { ...order, status: "paid_needs_review", amount_paid: 50000 };

  it("Cấp tay…: POST /grant với {note}", async () => {
    const user = userEvent.setup();
    serveOrder(order);
    render(<OrderPage code={CODE} />);
    await grant(user);
    expect(await screen.findByText(KEY)).toBeTruthy();
    expect(post(`/admin/orders/${CODE}/grant`)).toEqual({ url: `/admin/orders/${CODE}/grant`, method: "POST", body: { note: "khách chuyển bù" } });
    expect(writes()).toHaveLength(1);
  });

  it("Cấp key mới…: POST /resolve với {action: grant_new_license, note}; hiện key mới", async () => {
    const user = userEvent.setup();
    serveOrder(NEEDS_REVIEW, { post: { [resolveUrl]: () => json({ order_code: CODE, status: "paid", license_key: KEY }) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Cấp key mới…" }));
    const confirm = screen.getByRole("button", { name: "Cấp key mới" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText(/Lý do/), "license cũ đã thu hồi nhầm");
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    expect(await screen.findByText(KEY)).toBeTruthy();
    expect(post(resolveUrl)).toEqual({
      url: resolveUrl,
      method: "POST",
      body: { action: "grant_new_license", note: "license cũ đã thu hồi nhầm" },
    });
    expect(writes()).toHaveLength(1);
  });

  it("Ghi đã hoàn tiền…: cần lý do và gõ đúng DA HOAN TIEN; POST /resolve với {action: refunded, note}", async () => {
    const user = userEvent.setup();
    serveOrder(NEEDS_REVIEW);
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Ghi đã hoàn tiền…" }));
    const confirm = screen.getByRole("button", { name: "Ghi đã hoàn tiền" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText(/để xác nhận/), "DA HOAN TIEN");
    expect(confirm.disabled).toBe(true); // có chữ xác nhận nhưng chưa có lý do
    await user.type(screen.getByLabelText(/Lý do/), "đã chuyển trả khách ngày 05/10");
    expect(confirm.disabled).toBe(false);
    await user.clear(screen.getByLabelText(/để xác nhận/));
    await user.type(screen.getByLabelText(/để xác nhận/), "da hoan tien");
    expect(confirm.disabled).toBe(true); // có lý do nhưng sai chữ hoa
    await user.clear(screen.getByLabelText(/để xác nhận/));
    await user.type(screen.getByLabelText(/để xác nhận/), "DA HOAN TIEN");
    await user.click(confirm);
    expect(await screen.findByText("Đã ghi đơn là đã hoàn tiền.")).toBeTruthy();
    expect(post(resolveUrl)).toEqual({
      url: resolveUrl,
      method: "POST",
      body: { action: "refunded", note: "đã chuyển trả khách ngày 05/10" },
    });
    expect(writes()).toHaveLength(1);
    expect(screen.queryByText(KEY)).toBeNull();
  });
});
