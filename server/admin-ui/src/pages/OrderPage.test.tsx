import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getQueueCount } from "../queue-store";
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
const g = (count: number) => ({ count, items: [] });
let calls: Call[] = [];

const ISSUED = { license_id: "11111111-1111-4111-8111-111111111111", license_key: KEY, plan: "monthly", expires_at: 1_800_000_000 };

/**
 * Mock fetch theo URL, ghi mọi lời gọi vào `calls`. `lookup(n)`: phản hồi của lần tra cứu thứ n (từ 1; mặc định trả đơn `o`).
 * `post`: phản hồi của các POST ghi theo URL (mặc định cả grant lẫn resolve đều thành công).
 */
function serveOrder(o: object, opts: { lookup?: (n: number) => Response; post?: Record<string, () => Response>; audit?: unknown[]; licenses?: unknown[] } = {}) {
  calls = [];
  let lookups = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/admin/lookup") {
        lookups++;
        return opts.lookup ? opts.lookup(lookups) : json({ licenses: opts.licenses ?? [], orders: [o] });
      }
      if (url.startsWith("/admin/audit")) return json({ items: opts.audit ?? [], next_cursor: null });
      if (url === "/admin/queue") return json({ needs_review: g(0), underpaid: g(0), email_failed: g(1), locked: g(0), conflict: g(0), alerts: g(0) });
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

describe("OrderPage: tiêu đề hộp key theo loại cấp (grant_kind)", () => {
  const RENEW_TITLE = "Key của license (đơn gia hạn hay đổi gói)";
  const grantReturning = (extra: object) => serveOrder(order, { post: { [`/admin/orders/${CODE}/grant`]: () => json({ ...ISSUED, ...extra }) } });

  it.each(["extend", "change"])("cấp tay trả grant_kind %s: key là của license cũ, tiêu đề không ghi Key mới", async (grant_kind) => {
    const user = userEvent.setup();
    grantReturning({ grant_kind, converted_days: 0 });
    render(<OrderPage code={CODE} />);
    await grant(user);
    expect(await screen.findByRole("dialog", { name: RENEW_TITLE })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Key mới" })).toBeNull();
    expect(screen.getByText(KEY)).toBeTruthy();
  });

  it("cấp tay trả grant_kind new: tiêu đề Key mới", async () => {
    const user = userEvent.setup();
    grantReturning({ grant_kind: "new" });
    render(<OrderPage code={CODE} />);
    await grant(user);
    expect(await screen.findByRole("dialog", { name: "Key mới" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: RENEW_TITLE })).toBeNull();
  });

  it("cấp tay không có grant_kind: tiêu đề Key mới", async () => {
    const user = userEvent.setup();
    serveOrder(order);
    render(<OrderPage code={CODE} />);
    await grant(user);
    expect(await screen.findByRole("dialog", { name: "Key mới" })).toBeTruthy();
  });

  it("Cấp key mới… (xử lý đơn paid_needs_review) luôn là key mới", async () => {
    const user = userEvent.setup();
    serveOrder({ ...order, status: "paid_needs_review", amount_paid: 50000 }, { post: { [`/admin/orders/${CODE}/resolve`]: () => json({ order_code: CODE, status: "paid", license_key: KEY }) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Cấp key mới…" }));
    await user.type(screen.getByLabelText(/Lý do/), "license cũ đã thu hồi nhầm");
    await user.click(screen.getByRole("button", { name: "Cấp key mới" }));
    expect(await screen.findByRole("dialog", { name: "Key mới" })).toBeTruthy();
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

describe("OrderPage: bố cục mới (việc cần làm, số tiền, license, nhật ký, PayOS, không tìm thấy)", () => {
  const LIC = "22222222-2222-4222-8222-222222222222";
  const region = (name: string) => screen.getByRole("region", { name });

  it("đơn chuyển thiếu: thẻ việc cần làm nói số tiền thiếu và chứa nút Cấp tay…", async () => {
    serveOrder(order);
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Khách chuyển thiếu 30.000 đ" });
    expect(within(step).getByRole("button", { name: "Cấp tay…" })).toBeTruthy();
    // Số tiền: cần trả, đã nhận, còn thiếu.
    const money = region("Số tiền");
    expect(money.textContent).toContain("50.000 đ");
    expect(money.textContent).toContain("Đã nhận 40% số cần trả.");
  });

  it("còn thiếu dù chỉ 1.000 đ thì không ghi 100% (99,8% làm tròn lên là sai nghĩa)", async () => {
    serveOrder({ ...order, amount: 500000, amount_paid: 499000 });
    render(<OrderPage code={CODE} />);
    await screen.findByRole("region", { name: "Khách chuyển thiếu 1.000 đ" });
    expect(region("Số tiền").textContent).toContain("Đã nhận 99% số cần trả.");
  });

  it("đơn cần xử lý: hai nút nằm cùng thẻ việc cần làm, Ghi đã hoàn tiền… tông nguy hiểm", async () => {
    serveOrder({ ...order, status: "paid_needs_review", amount_paid: 50000 });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã nhận tiền nhưng license của đơn đã bị thu hồi" });
    expect(within(step).getByRole("button", { name: "Cấp key mới…" })).toBeTruthy();
    expect(within(step).getByRole("button", { name: "Ghi đã hoàn tiền…" }).className).toContain("danger");
  });

  it("license của đơn là thẻ có liên kết mở license; nhật ký có tên tiếng Việt và không lặp liên kết tới chính đơn", async () => {
    const license = {
      id: LIC,
      license_key: KEY,
      email: "khach@example.com",
      plan: "monthly",
      expires_at: 1_900_000_000,
      created_at: 1_790_812_800,
      revoked_at: null,
      locked_at: null,
      conflict: false,
      activations: [],
      audit: [],
    };
    const audit = [{ id: 1, at: 1_790_812_900, actor: "api", action: "order_created", license_id: null, order_code: CODE, detail: null }];
    serveOrder({ ...order, status: "paid", amount_paid: 50000, license_id: LIC }, { licenses: [license], audit });
    render(<OrderPage code={CODE} />);
    const link = await screen.findByRole("link", { name: "K7Q2-…-9XMB" });
    expect(link.getAttribute("href")).toBe(`/licenses/${LIC}`);
    expect(screen.queryByText(KEY)).toBeNull();
    const log = await screen.findByRole("list", { name: "Nhật ký của đơn" });
    expect(within(log).getByText("Tạo đơn")).toBeTruthy();
    expect(within(log).queryByRole("link", { name: /#1000012/ })).toBeNull();
  });

  it("Xem trạng thái trên PayOS: kết quả nằm trong thẻ riêng, so với đơn; đóng được", async () => {
    const user = userEvent.setup();
    const status = { orderCode: CODE, status: "paid", amount: 50000, amountPaid: 50000, paidAt: 1_790_813_000 };
    serveOrder(order, { post: { [`/admin/orders/${CODE}/payment-status`]: () => json(status) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Xem trạng thái trên PayOS" }));
    const card = await screen.findByRole("region", { name: "Trạng thái trên PayOS" });
    expect(within(card).getByText("Khác với đơn: so số tiền và trạng thái trước khi cấp tay.")).toBeTruthy();
    expect(calls.filter((c) => c.url.endsWith("/payment-status"))).toEqual([{ url: `/admin/orders/${CODE}/payment-status`, method: "GET", body: undefined }]);
    await user.click(within(card).getByRole("button", { name: "Đóng kết quả PayOS" }));
    expect(screen.queryByRole("region", { name: "Trạng thái trên PayOS" })).toBeNull();
  });

  it("PayOS lỗi: câu lỗi nằm trong thẻ, trang đơn vẫn còn", async () => {
    const user = userEvent.setup();
    serveOrder(order, { post: { [`/admin/orders/${CODE}/payment-status`]: () => json({ error: "payment_provider_error" }, 502) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Xem trạng thái trên PayOS" }));
    const card = await screen.findByRole("region", { name: "Trạng thái trên PayOS" });
    expect(within(card).getByRole("alert").textContent).toContain("Cổng thanh toán lỗi");
    expect(screen.getByRole("button", { name: "Cấp tay…" })).toBeTruthy();
  });

  it("đơn không có: trạng thái không tìm thấy có lối về danh sách đơn, không có nút ghi nào", async () => {
    serveOrder(order, { lookup: () => json({ licenses: [], orders: [] }) });
    render(<OrderPage code={CODE} />);
    expect(await screen.findByText("Không có đơn này")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Về danh sách đơn" }).getAttribute("href")).toBe("/orders");
    for (const name of ["Cấp tay…", "Cấp key mới…", "Ghi đã hoàn tiền…", "Xem trạng thái trên PayOS"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("đang tải: khung chờ báo bận, tiêu đề chưa là tên đơn", async () => {
    serveOrder(order, { lookup: () => new Promise(() => {}) as unknown as Response });
    const { container } = render(<OrderPage code={CODE} />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Đơn #1000012/ })).toBeNull();
  });
});

describe("OrderPage: tải lại đơn và nhật ký sau mỗi thao tác (T-1)", () => {
  const resolveUrl = `/admin/orders/${CODE}/resolve`;
  const NEEDS_REVIEW = { ...order, status: "paid_needs_review", amount_paid: 50000 };
  const lookups = () => calls.filter((c) => c.url === "/admin/lookup").length;
  const audits = () => calls.filter((c) => c.url.startsWith("/admin/audit")).length;

  async function loaded() {
    await screen.findByRole("heading", { name: /Đơn #1000012/ });
    await waitFor(() => expect(audits()).toBe(1));
    expect(lookups()).toBe(1);
  }

  it("Ghi đã hoàn tiền xong: tải lại đơn và nhật ký, mỗi thứ đúng một lần", async () => {
    const user = userEvent.setup();
    serveOrder(NEEDS_REVIEW);
    render(<OrderPage code={CODE} />);
    await loaded();
    await user.click(screen.getByRole("button", { name: "Ghi đã hoàn tiền…" }));
    await user.type(screen.getByLabelText(/Lý do/), "đã chuyển trả");
    await user.type(screen.getByLabelText(/để xác nhận/), "DA HOAN TIEN");
    await user.click(screen.getByRole("button", { name: "Ghi đã hoàn tiền" }));
    await waitFor(() => expect(lookups()).toBe(2));
    await waitFor(() => expect(audits()).toBe(2));
  });

  it("Cấp key mới xong: tải lại đơn và nhật ký, mỗi thứ đúng một lần", async () => {
    const user = userEvent.setup();
    serveOrder(NEEDS_REVIEW, { post: { [resolveUrl]: () => json({ order_code: CODE, status: "paid", license_key: KEY }) } });
    render(<OrderPage code={CODE} />);
    await loaded();
    await user.click(screen.getByRole("button", { name: "Cấp key mới…" }));
    await user.type(screen.getByLabelText(/Lý do/), "license cũ thu hồi nhầm");
    await user.click(screen.getByRole("button", { name: "Cấp key mới" }));
    expect(await screen.findByText(KEY)).toBeTruthy();
    await waitFor(() => expect(lookups()).toBe(2));
    await waitFor(() => expect(audits()).toBe(2));
  });

  it("Cấp tay xong: tải lại cả nhật ký của đơn (không chỉ đơn)", async () => {
    const user = userEvent.setup();
    serveOrder(order);
    render(<OrderPage code={CODE} />);
    await loaded();
    await grant(user);
    expect(await screen.findByText(KEY)).toBeTruthy();
    await waitFor(() => expect(lookups()).toBe(2));
    await waitFor(() => expect(audits()).toBe(2));
  });

  it.each([
    [409, "conflict"],
    [404, "not_found"],
  ])("server trả %i (trạng thái đơn đã đổi): hộp còn mở, báo lỗi, tải lại đơn và nhật ký", async (status, error) => {
    const user = userEvent.setup();
    serveOrder(NEEDS_REVIEW, { post: { [resolveUrl]: () => json({ error }, status) } });
    render(<OrderPage code={CODE} />);
    await loaded();
    await user.click(screen.getByRole("button", { name: "Cấp key mới…" }));
    await user.type(screen.getByLabelText(/Lý do/), "thử");
    await user.click(screen.getByRole("button", { name: "Cấp key mới" }));
    await waitFor(() => expect(lookups()).toBe(2));
    await waitFor(() => expect(audits()).toBe(2));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeTruthy();
  });
});

describe("OrderPage: kết quả thao tác (vùng thông báo có sẵn, focus không rơi về body)", () => {
  const resolveUrl = `/admin/orders/${CODE}/resolve`;
  const NEEDS_REVIEW = { ...order, status: "paid_needs_review", amount_paid: 50000 };
  const after = (o: object) => (n: number) => json({ licenses: [], orders: [n === 1 ? NEEDS_REVIEW : o] });

  it("Ghi đã hoàn tiền xong (đơn thành refunded, hai nút biến mất): câu kết quả trong vùng status có sẵn, có focus", async () => {
    const user = userEvent.setup();
    serveOrder(NEEDS_REVIEW, { lookup: after({ ...NEEDS_REVIEW, status: "refunded" }) });
    render(<OrderPage code={CODE} />);
    await screen.findByRole("button", { name: "Ghi đã hoàn tiền…" });
    const region = document.querySelector(".notice-region") as HTMLElement;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.textContent).toBe("");
    await user.click(screen.getByRole("button", { name: "Ghi đã hoàn tiền…" }));
    await user.type(screen.getByLabelText(/Lý do/), "đã chuyển trả");
    await user.type(screen.getByLabelText(/để xác nhận/), "DA HOAN TIEN");
    await user.click(screen.getByRole("button", { name: "Ghi đã hoàn tiền" }));
    await screen.findByText("Đơn đã ghi là hoàn tiền");
    expect(screen.queryByRole("button", { name: "Ghi đã hoàn tiền…" })).toBeNull();
    expect(region.textContent).toBe("Đã ghi đơn là đã hoàn tiền.");
    expect(document.activeElement).toBe(region.querySelector(".notice"));
  });

  it("Cấp key mới: thông báo chỉ hiện khi bấm Xong; nút Cấp key mới… đã biến mất nên focus vào thông báo", async () => {
    const user = userEvent.setup();
    serveOrder(NEEDS_REVIEW, {
      lookup: after({ ...NEEDS_REVIEW, status: "paid" }),
      post: { [resolveUrl]: () => json({ order_code: CODE, status: "paid", license_key: KEY }) },
    });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Cấp key mới…" }));
    await user.type(screen.getByLabelText(/Lý do/), "license cũ thu hồi nhầm");
    await user.click(screen.getByRole("button", { name: "Cấp key mới" }));
    expect(await screen.findByText(KEY)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cấp key mới…" })).toBeNull());
    const region = document.querySelector(".notice-region") as HTMLElement;
    expect(region.textContent).toBe("");
    await user.click(screen.getByRole("button", { name: "Xong" }));
    expect(region.textContent).toBe("Đã cấp key mới cho đơn #1000012.");
    expect(document.activeElement).toBe(region.querySelector(".notice"));
  });
});

describe("OrderPage: huy hiệu Việc cần xử lý sau thao tác ghi", () => {
  it("Ghi đã hoàn tiền xong: tải hàng đợi đúng một lần, huy hiệu theo số mới", async () => {
    const user = userEvent.setup();
    serveOrder({ ...order, status: "paid_needs_review", amount_paid: 50000 });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Ghi đã hoàn tiền…" }));
    expect(calls.filter((c) => c.url === "/admin/queue")).toHaveLength(0);
    await user.type(screen.getByLabelText(/Lý do/), "đã chuyển trả");
    await user.type(screen.getByLabelText(/để xác nhận/), "DA HOAN TIEN");
    await user.click(screen.getByRole("button", { name: "Ghi đã hoàn tiền" }));
    await waitFor(() => expect(getQueueCount()).toBe(1));
    expect(calls.filter((c) => c.url === "/admin/queue")).toHaveLength(1);
  });
});
