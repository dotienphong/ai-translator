import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtDate, fmtDateTime } from "../format";
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
 * Mock fetch theo URL, ghi mọi lời gọi vào `calls`. `lookup(n, body)`: phản hồi của lần tra cứu thứ n (từ 1; mặc định trả đơn
 * `o`). `post`: phản hồi của các POST ghi theo URL (mặc định cả grant lẫn resolve đều thành công). `auditReply(n)`: phản hồi của
 * lần tải nhật ký thứ n (mặc định trả `audit`).
 */
function serveOrder(
  o: object,
  opts: {
    lookup?: (n: number, body: Record<string, unknown>) => Response | Promise<Response>;
    post?: Record<string, () => Response | Promise<Response>>;
    audit?: unknown[];
    auditReply?: (n: number) => Response | Promise<Response>;
    licenses?: unknown[];
  } = {},
) {
  calls = [];
  let lookups = 0;
  let audits = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: init.method ?? "GET", body });
      if (url === "/admin/lookup") {
        lookups++;
        return opts.lookup ? opts.lookup(lookups, body) : json({ licenses: opts.licenses ?? [], orders: [o] });
      }
      if (url.startsWith("/admin/audit")) {
        audits++;
        return opts.auditReply ? opts.auditReply(audits) : json({ items: opts.audit ?? [], next_cursor: null });
      }
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

describe("OrderPage: đơn Creem (USD, thanh toán quốc tế)", () => {
  // Đồng hồ đóng băng (m6-T7): license "còn hạn" 1_900_000_000 (17/03/2030) không đỏ theo ngày thật.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(1_791_000_000 * 1000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const LIC = "33333333-3333-4333-8333-333333333333";
  const creemOrder = {
    ...order,
    provider: "creem",
    plan: "yearly",
    amount: 3999,
    amount_paid: 3999,
    currency: "USD",
    status: "paid",
    license_id: LIC,
    paid_at: 1_790_812_900,
    email_sent_at: 1_790_813_000,
  };
  const license = {
    id: LIC,
    license_key: KEY,
    email: "khach@example.com",
    plan: "yearly",
    expires_at: 1_900_000_000,
    created_at: 1_790_812_900,
    revoked_at: null,
    locked_at: null,
    conflict: false,
    activations: [],
    audit: [],
  };
  const region = (name: string) => screen.getByRole("region", { name });

  it("nút, thẻ trạng thái và dòng Cổng ghi Creem (không ghi PayOS); mọi số tiền là đô la", async () => {
    const user = userEvent.setup();
    const status = { orderCode: CODE, status: "paid", amount: 3999, amountPaid: 3999, paidAt: null };
    serveOrder(creemOrder, { licenses: [license], post: { [`/admin/orders/${CODE}/payment-status`]: () => json(status) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Xem trạng thái trên Creem" }));
    expect(screen.queryByRole("button", { name: "Xem trạng thái trên PayOS" })).toBeNull();
    const card = await screen.findByRole("region", { name: "Trạng thái trên Creem" });
    // Đổi nghĩa (m2-T7): đơn đã khép (paid) không có nút Cấp tay nên thẻ không kết luận "Khớp/Khác với đơn" (Creem còn báo paid cả
    // sau khi hoàn tiền: "Khớp" ở đây là sai nghĩa). Số liệu của cổng vẫn hiện.
    expect(within(card).queryByText(/Khớp với đơn|Khác với đơn/)).toBeNull();
    expect(card.textContent).toContain("$39,99");
    expect(card.textContent).not.toContain("3.999");
    expect(region("Số tiền").textContent).toContain("$39,99");
    expect(screen.getByText("Creem")).toBeTruthy();
    await user.click(within(card).getByRole("button", { name: "Đóng kết quả Creem" }));
    expect(screen.queryByRole("region", { name: "Trạng thái trên Creem" })).toBeNull();
  });

  // P3-T7: Creem không đổi trạng thái phiên thành refunded sau khi hoàn (đơn hoàn tiền đến từ webhook): ca "khác đơn" thật là
  // đơn còn đang xử lý mà Creem báo chưa trả.
  it("Creem báo khác đơn (đơn đang xử lý mà Creem báo chưa trả): thẻ cảnh báo so số tiền và trạng thái", async () => {
    const user = userEvent.setup();
    const status = { orderCode: CODE, status: "pending", amount: 3999, amountPaid: 0, paidAt: null };
    serveOrder(
      { ...creemOrder, status: "processing", amount_paid: 0, license_id: null, paid_at: null, email_sent_at: null },
      { post: { [`/admin/orders/${CODE}/payment-status`]: () => json(status) } },
    );
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Xem trạng thái trên Creem" }));
    const card = await screen.findByRole("region", { name: "Trạng thái trên Creem" });
    expect(within(card).getByText("Khác với đơn: so số tiền và trạng thái trước khi cấp tay.")).toBeTruthy();
  });

  it("đơn đã hoàn tiền mà Creem vẫn báo đã trả: không kết luận khớp, kèm câu giải thích trạng thái hoàn tiền đến từ đâu", async () => {
    const user = userEvent.setup();
    const status = { orderCode: CODE, status: "paid", amount: 3999, amountPaid: 3999, paidAt: null };
    serveOrder({ ...creemOrder, status: "refunded" }, { licenses: [license], post: { [`/admin/orders/${CODE}/payment-status`]: () => json(status) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Xem trạng thái trên Creem" }));
    const card = await screen.findByRole("region", { name: "Trạng thái trên Creem" });
    // Đổi nghĩa (m2-T7): trước đây khẳng định "Khớp với đơn." cho đơn đã hoàn tiền; giữ câu giải thích (.gateway-note).
    expect(within(card).queryByText(/Khớp với đơn|Khác với đơn/)).toBeNull();
    expect(card.querySelector(".gateway-note")).toBeTruthy();
    expect(card.textContent).toContain("Cổng vẫn có thể báo đã trả sau khi hoàn tiền");
    expect(card.textContent).toContain("xem nhật ký của đơn");
  });

  it("đơn đã trả bình thường (không có nhật ký hoàn tiền hay tranh chấp): không có thẻ việc cần làm nào (I1-T7 b)", async () => {
    serveOrder(creemOrder, { licenses: [license], audit: [{ id: 1, at: 1_790_812_950, actor: "webhook", action: "license_issued", license_id: LIC, order_code: CODE, detail: null }] });
    const { container } = render(<OrderPage code={CODE} />);
    await screen.findByRole("list", { name: "Nhật ký của đơn" });
    expect(container.querySelector(".callout")).toBeNull();
    expect(screen.queryByText(/hoàn tiền/)).toBeNull();
  });

  it("thẻ Số tiền của đơn USD: mọi ô là đô la, không có đồng (I2-T7)", async () => {
    serveOrder({ ...creemOrder, status: "underpaid", amount_paid: 2000, license_id: null, email_sent_at: null });
    render(<OrderPage code={CODE} />);
    const money = await screen.findByRole("region", { name: "Số tiền" });
    const cells = Array.from(money.querySelectorAll("dd")).map((d) => d.textContent);
    expect(cells).toEqual(["$39,99", "$20,00", "$19,99"]);
    expect(money.textContent).not.toMatch(/\d đ/);
  });

  it("Cấp tay… của đơn Creem chưa trả: câu cảnh báo số tiền theo đô la (T7-1)", async () => {
    const user = userEvent.setup();
    serveOrder({ ...creemOrder, status: "pending", amount_paid: 0, license_id: null, email_sent_at: null });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Cấp tay…" }));
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).toContain("Đơn mới nhận $0,00 / $39,99");
    expect(text).not.toMatch(/\d đ/);
  });

  it("đơn hoàn tiền từ lúc chưa ghi nhận thanh toán: thẻ Số tiền không báo thiếu tiền", async () => {
    serveOrder({ ...creemOrder, status: "refunded", amount_paid: 0, license_id: null, paid_at: null, email_sent_at: null });
    render(<OrderPage code={CODE} />);
    const money = await screen.findByRole("region", { name: "Số tiền" });
    expect(money.textContent).toContain("Cổng báo hoàn tiền khi đơn chưa ghi nhận thanh toán");
    expect(money.textContent).not.toContain("Chưa nhận khoản nào.");
    expect(money.querySelector(".is-warn")).toBeNull();
    // Không còn khoản nào cần thu: ô "Còn thiếu" không được hiện $39,99 trong khi câu ghi chú nói ngược lại (m1 của B2).
    const cells = Array.from(money.querySelectorAll("dd")).map((d) => d.textContent);
    expect(cells).toEqual(["$39,99", "$0,00", "—"]);
  });

  it("đơn đã nhận đủ rồi hoàn tiền: thẻ Số tiền nói đã nhận đủ sau đó hoàn tiền, tông nhạt (không xanh như đơn đã trả), không còn thiếu (m5-T7)", async () => {
    serveOrder({ ...creemOrder, status: "refunded" }, { licenses: [license] });
    render(<OrderPage code={CODE} />);
    const money = await screen.findByRole("region", { name: "Số tiền" });
    expect(Array.from(money.querySelectorAll("dd")).map((d) => d.textContent)).toEqual(["$39,99", "$39,99", "$0,00"]);
    expect(money.textContent).toContain("Đã nhận đủ, sau đó hoàn tiền.");
    expect(money.textContent).not.toContain("Đã nhận đủ.");
    expect(money.querySelector(".ratio-bar")?.getAttribute("class")).toContain("tone-muted");
    expect(money.querySelector(".ratio-bar")?.getAttribute("class")).not.toContain("tone-ok");
    expect(money.querySelector(".is-warn")).toBeNull();
  });

  it("đơn đã trả bình thường vẫn là 'Đã nhận đủ.' tông xanh (nhánh đã hoàn không lan sang)", async () => {
    serveOrder(creemOrder, { licenses: [license] });
    render(<OrderPage code={CODE} />);
    const money = await screen.findByRole("region", { name: "Số tiền" });
    expect(money.textContent).toContain("Đã nhận đủ.");
    expect(money.textContent).not.toContain("hoàn tiền");
    expect(money.querySelector(".ratio-bar")?.getAttribute("class")).toContain("tone-ok");
  });

  it("thẻ Số tiền: đơn USD ghi giá niêm yết chưa gồm thuế; đơn VND không nhắc thuế (M-T4-2)", async () => {
    serveOrder(creemOrder, { licenses: [license] });
    render(<OrderPage code={CODE} />);
    expect((await screen.findByRole("region", { name: "Số tiền" })).textContent).toContain("(chưa gồm thuế)");
    cleanup();
    serveOrder({ ...order, status: "pending", amount_paid: 0 });
    render(<OrderPage code={CODE} />);
    const vnd = await screen.findByRole("region", { name: "Số tiền" });
    expect(vnd.textContent).not.toContain("thuế");
  });

  it("đơn chờ trả: lời dẫn nói webhook và trạng thái của Creem, không nhắc PayOS", async () => {
    serveOrder({ ...creemOrder, status: "pending", amount_paid: 0, license_id: null });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đơn đang chờ khách trả" });
    expect(step.textContent).toContain("webhook Creem");
    expect(step.textContent).toContain("trạng thái trên Creem");
    expect(step.textContent).not.toContain("PayOS");
    expect(screen.getByText("Đơn chưa áp vào license nào").closest("section")?.textContent).toContain("webhook Creem");
  });

  // Đổi nghĩa (C1-T7): trước đây thẻ mời "Mở license" để thu hồi mọi license còn hạn của đơn đã hoàn. Nay đơn có license mà
  // nhật ký không có dòng cấp thì không tính được số ngày: không mời thu hồi như hành động chính, cho rút ngắn tự chọn.
  it("đã hoàn tiền, license còn hoạt động mà nhật ký không có dòng cấp: không mời thu hồi, cho rút ngắn hạn tự chọn", async () => {
    serveOrder({ ...creemOrder, status: "refunded" }, { licenses: [license] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền: chưa tính được số ngày đơn này cộng" });
    expect(within(step).getByRole("button", { name: "Rút ngắn hạn…" })).toBeTruthy();
    const open = within(step).getByRole("link", { name: "Mở license" });
    expect(open.getAttribute("href")).toBe(`/licenses/${LIC}`);
    expect(open.className).not.toContain("primary");
    expect(screen.queryByText("Đơn đã ghi là hoàn tiền")).toBeNull();
  });

  it.each([
    ["license đã thu hồi", [{ ...license, revoked_at: 1_790_900_000 }]],
    ["license đã hết hạn", [{ ...license, expires_at: 1_790_900_000 }]],
  ])("đã hoàn tiền, %s: chỉ ghi nhận, không có nút nào", async (_why, licenses) => {
    serveOrder({ ...creemOrder, status: "refunded" }, { licenses });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đơn đã ghi là hoàn tiền" });
    expect(within(step).queryByRole("link")).toBeNull();
    expect(within(step).queryByRole("button")).toBeNull();
  });

  // Đổi nghĩa: đơn không có license (chưa cấp) trước đây ra thẻ "Đơn đã ghi là hoàn tiền"; nay nói rõ đơn chưa từng cộng ngày.
  it("đã hoàn tiền, đơn không có license: hoàn trước khi được cấp, không có nút", async () => {
    serveOrder({ ...creemOrder, status: "refunded", license_id: null }, { licenses: [] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đơn đã hoàn tiền trước khi được cấp" });
    expect(step.textContent).toContain("Đơn chưa từng cộng thời gian vào license nào; không cần làm gì thêm.");
    expect(within(step).queryByRole("link")).toBeNull();
    expect(within(step).queryByRole("button")).toBeNull();
  });

  it("nhật ký có tên tiếng Việt cho hoàn tiền, hoàn một phần và tranh chấp của cổng", async () => {
    const row = (id: number, action: string) => ({ id, at: 1_790_813_000 + id, actor: "webhook", action, license_id: null, order_code: CODE, detail: null });
    serveOrder(creemOrder, {
      licenses: [license],
      audit: [row(3, "order_disputed"), row(2, "order_partially_refunded"), row(1, "order_refunded")],
    });
    render(<OrderPage code={CODE} />);
    const log = await screen.findByRole("list", { name: "Nhật ký của đơn" });
    for (const title of ["Đơn được hoàn tiền", "Hoàn tiền một phần", "Khách mở tranh chấp"]) {
      expect(within(log).getByText(title), title).toBeTruthy();
    }
  });

  /* ---------- Chữ cho đơn Creem bị giữ, lời dẫn theo cổng, nhật ký in tiền (B6) ---------- */

  /** Dòng nhật ký của đơn (detail là object, đã stringify như server). */
  const auditRow = (id: number, action: string, detail: object | null, over: object = {}) => ({
    id,
    at: 1_790_813_000 + id,
    actor: "webhook",
    action,
    license_id: null,
    order_code: CODE,
    detail: detail === null ? null : JSON.stringify(detail),
    ...over,
  });
  /** Đơn Creem bị giữ: chưa cấp, đã nhận $30,00 (giá niêm yết, không gồm thuế) trên giá $39,99. */
  const held = { ...creemOrder, status: "underpaid", amount_paid: 3000, license_id: null, email_sent_at: null, paid_at: null };
  const UNDERPAID_LOG = {
    amount: 3999,
    provider_amount: 3999,
    amount_paid: 3000,
    has_discount: true,
    provider_discount_amount: 999,
    provider_amount_paid: 3300,
    provider_tax_amount: 300,
  };
  const CHUYEN = /chuyển thiếu|chuyển bù/i;

  it("underpaid của Creem có mã giảm giá: nói Creem báo đã trả thấp hơn giá, số đã nhận không gồm thuế, số liệu của Creem; không có chữ chuyển thiếu hay chuyển bù ở đâu trên trang", async () => {
    serveOrder(held, { audit: [auditRow(1, "order_underpaid", UNDERPAID_LOG)] });
    const { container } = render(<OrderPage code={CODE} />);
    // Đổi nghĩa (p2 của rà B6): nhật ký nói có mã giảm giá thì tiêu đề nói thẳng, không còn "(có mã giảm giá?)".
    const step = await screen.findByRole("region", { name: "Creem báo đã trả, có dùng mã giảm giá" });
    expect(step.textContent).toContain("Khách dùng mã giảm giá; đã nhận $30,00 (không gồm thuế) trên giá $39,99.");
    expect(step.textContent).toContain("Số liệu Creem ghi: khách trả $33,00 (gồm thuế); thuế $3,00; giảm $9,99.");
    expect(step.textContent).toContain("hoàn tiền ở Creem");
    // Đổi nghĩa (I-2 của rà B6): Cấp tay của đơn thẻ bị giữ là nút phụ (chấp nhận số đã thu), không là việc chính.
    expect(within(step).getByRole("button", { name: "Cấp tay…" }).className).not.toContain("primary");
    await screen.findByRole("list", { name: "Nhật ký của đơn" });
    // Huy hiệu, thẻ việc, thẻ Số tiền, nhật ký: không chỗ nào gọi đơn thẻ là chuyển thiếu.
    expect(container.textContent).not.toMatch(CHUYEN);
    expect(screen.getByText("Trả thấp hơn giá")).toBeTruthy();
  });

  it("underpaid của Creem, nhật ký chưa có dữ kiện của cổng (chưa tải xong hay không có dòng): lời dẫn chung, không khẳng định có mã giảm giá", async () => {
    serveOrder(held, { audit: [] });
    const { container } = render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Creem báo đã trả nhưng thấp hơn giá đơn (có mã giảm giá?)" });
    expect(step.textContent).toContain("Đã nhận $30,00 (không gồm thuế) trên giá $39,99.");
    expect(step.textContent).not.toContain("Khách dùng mã giảm giá");
    expect(step.textContent).not.toContain("Số liệu Creem ghi");
    expect(container.textContent).not.toMatch(CHUYEN);
  });

  it("underpaid của Creem vì dữ liệu tiền hỏng: nêu các trường, dẫn tới dashboard Creem (trả đủ thì Cấp tay, không thì hoàn tiền trên Creem)", async () => {
    const log = { amount: 3999, provider_amount: 3999, amount_paid: 0, has_discount: false, provider_malformed_fields: ["order.discount", "checkout.status"] };
    serveOrder({ ...held, amount_paid: 0 }, { audit: [auditRow(1, "order_underpaid", log)] });
    const { container } = render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Creem báo đã thu tiền nhưng không đọc được số tiền" });
    expect(step.textContent).toContain(
      "Creem báo đã thu tiền nhưng không đọc được dữ liệu tiền (trường: order.discount, checkout.status). Mở đơn trên dashboard Creem: khách trả đủ thì Cấp tay, không thì hoàn tiền trên Creem.",
    );
    expect(step.textContent).not.toContain("Khách dùng mã giảm giá");
    expect(container.textContent).not.toMatch(CHUYEN);
  });

  it("lấy dữ kiện của dòng nhật ký MỚI NHẤT của đơn (đầu danh sách), bỏ qua dòng của đơn khác và dòng không đọc được", async () => {
    serveOrder(held, {
      audit: [
        auditRow(5, "order_underpaid", "không phải JSON" as unknown as object),
        auditRow(4, "order_underpaid", { ...UNDERPAID_LOG, has_discount: false }, { order_code: CODE + 1 }),
        auditRow(3, "order_underpaid", UNDERPAID_LOG),
        auditRow(2, "order_underpaid", { ...UNDERPAID_LOG, has_discount: false, provider_discount_amount: 0 }),
      ],
    });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Creem báo đã trả, có dùng mã giảm giá" });
    expect(step.textContent).toContain("Khách dùng mã giảm giá;");
  });

  it("đơn PayOS underpaid giữ nguyên chữ chuyển thiếu, chuyển bù, kể cả khi nhật ký có dữ kiện: mọi chữ mới chỉ cho cổng khác PayOS", async () => {
    serveOrder(order, { audit: [auditRow(1, "order_underpaid", { amount: 50000, provider_amount: 50000, amount_paid: 20000 })] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Khách chuyển thiếu 30.000 đ" });
    expect(step.textContent).toContain("Khi khách chuyển bù, hay bạn đã xác minh khoản bù, bấm Cấp tay để cấp license và gửi key qua email.");
    expect(step.textContent).not.toContain("Creem");
    expect(screen.getByText("Chuyển thiếu")).toBeTruthy();
    expect(screen.queryByText("Trả thấp hơn giá")).toBeNull();
  });

  it("đơn Creem failed vì không đọc được giá: nói không đọc được giá từ Creem, nêu trường; không nói chuyển thiếu", async () => {
    const log = { amount: 3999, provider_amount: 0, amount_paid: 0, has_discount: false, provider_malformed_fields: ["order.amount"] };
    serveOrder({ ...held, status: "failed", amount_paid: 0 }, { audit: [auditRow(1, "order_amount_mismatch", log)] });
    const { container } = render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đơn gặp lỗi khi xử lý" });
    expect(step.textContent).toContain("Không đọc được giá từ Creem (trường: order.amount).");
    // Đổi nghĩa (p4 của rà B6): đơn thẻ lệch giá không còn lời mời "Khách đã trả thì cấp tay".
    expect(step.textContent).toContain("Xem nhật ký của đơn và trạng thái trên Creem; khách trả đủ giá gói thì mới cấp tay, ngược lại hoàn tiền ở Creem.");
    expect(step.textContent).not.toContain("Khách đã trả thì cấp tay");
    expect(container.textContent).not.toMatch(CHUYEN);
  });

  it("đơn Creem failed vì giá Creem báo khác giá đơn: nêu cả hai giá (cùng loại tiền, không gồm thuế)", async () => {
    const log = { amount: 3999, provider_amount: 2199, amount_paid: 2199, has_discount: false };
    serveOrder({ ...held, status: "failed", amount_paid: 2199 }, { audit: [auditRow(1, "order_amount_mismatch", log)] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đơn gặp lỗi khi xử lý" });
    expect(step.textContent).toContain("Giá Creem báo (không gồm thuế) là $21,99, khác giá của đơn $39,99.");
    expect(step.textContent).not.toContain("Không đọc được giá");
  });

  it("đơn PayOS failed giữ nguyên lời dẫn cũ dù nhật ký có order_amount_mismatch", async () => {
    serveOrder({ ...order, status: "failed" }, { audit: [auditRow(1, "order_amount_mismatch", { amount: 50000, provider_amount: 40000, amount_paid: 40000 })] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đơn gặp lỗi khi xử lý" });
    expect(step.querySelector(".ui-card-desc")?.textContent).toBe("Xem nhật ký của đơn và trạng thái trên PayOS. Khách đã trả thì cấp tay.");
  });

  // Lời dẫn processing/failed theo tên cổng của đơn: Creem, và cổng lạ (hiện nguyên mã, không giả là PayOS) (m7-T7).
  it.each([
    ["creem", "Creem", "processing", "Đơn đang được xử lý"],
    ["creem", "Creem", "failed", "Đơn gặp lỗi khi xử lý"],
    ["zalopay", "zalopay", "processing", "Đơn đang được xử lý"],
    ["zalopay", "zalopay", "failed", "Đơn gặp lỗi khi xử lý"],
  ])("đơn %s đang ở %s: lời dẫn nói trạng thái trên đúng cổng, không nhắc PayOS", async (provider, name, status, title) => {
    serveOrder({ ...creemOrder, provider, status, amount_paid: 0, license_id: null });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: title });
    expect(step.textContent).toContain(`trạng thái trên ${name}`);
    expect(step.textContent).not.toContain("PayOS");
    expect(screen.getByRole("button", { name: `Xem trạng thái trên ${name}` })).toBeTruthy();
    if (provider === "zalopay") expect(step.textContent).not.toContain("Creem");
  });

  it.each([
    ["expired", "Link thanh toán đã hết hạn"],
    ["cancelled", "Đơn đã hủy"],
  ])("đơn Creem %s: nhắc xem trạng thái trên Creem trước, không nói khách chuyển tiền", async (status, title) => {
    serveOrder({ ...creemOrder, status, amount_paid: 0, license_id: null });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: title });
    expect(step.textContent).toContain("xem trạng thái trên Creem trước");
    expect(step.textContent).toContain("Creem báo đã thu tiền");
    expect(step.textContent).not.toMatch(/chuyển tiền|chuyển khoản/i);
    expect(within(step).getByRole("button", { name: "Cấp tay…" })).toBeTruthy();
  });

  it.each([
    ["expired", "Link thanh toán đã hết hạn"],
    ["cancelled", "Đơn đã hủy"],
  ])("đơn PayOS %s: giữ lời dẫn cũ (khách đã chuyển tiền)", async (status, title) => {
    serveOrder({ ...order, status });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: title });
    expect(step.textContent).toContain("Chỉ cấp tay khi khách đã chuyển tiền cho đơn này và bạn đã xác minh khoản tiền.");
  });

  it("Cấp tay… của đơn Creem: không nói chuyển thiếu hay chuyển bù; nói cấp tay ghi doanh thu bằng số đã nhận của đơn (có thể là 0)", async () => {
    const user = userEvent.setup();
    serveOrder({ ...creemOrder, status: "pending", amount_paid: 0, license_id: null, email_sent_at: null });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Cấp tay…" }));
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).not.toMatch(CHUYEN);
    expect(text).toContain("Đơn mới nhận $0,00 / $39,99: chỉ cấp khi bạn đã xác minh khách trả đủ trên Creem.");
    expect(text).toContain("Cấp tay ghi doanh thu bằng số đã nhận của đơn (đơn Creem kẹt có thể là 0).");
    expect(text).toContain("xem trạng thái trên Creem trước");
  });

  it("Cấp tay… của đơn PayOS: giữ chữ chuyển thiếu, chuyển bù; câu doanh thu không nhắc Creem", async () => {
    const user = userEvent.setup();
    serveOrder(order);
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Cấp tay…" }));
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).toContain("Dùng khi khách chuyển thiếu rồi chuyển bù, hay đơn đã trả mà chưa được cấp.");
    expect(text).toContain("Cấp tay ghi doanh thu bằng số đã nhận của đơn.");
    expect(text).not.toContain("Creem");
  });

  it("đơn Creem cần xử lý: hoàn tiền làm ở dashboard Creem rồi bấm Ghi đã hoàn tiền; hộp xác nhận không nói chuyển trả ngoài hệ thống", async () => {
    const user = userEvent.setup();
    serveOrder({ ...creemOrder, status: "paid_needs_review" }, { licenses: [license] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã nhận tiền nhưng license của đơn đã bị thu hồi" });
    // Webhook hoàn đủ thường tự chuyển đơn sang Đã hoàn tiền: chỉ bấm Ghi đã hoàn tiền nếu đơn chưa tự chuyển.
    expect(step.textContent).toContain("Hoàn tiền làm ở dashboard Creem, rồi bấm Ghi đã hoàn tiền nếu đơn chưa tự thành Đã hoàn tiền");
    expect(step.textContent).not.toContain("ngoài hệ thống");
    await user.click(within(step).getByRole("button", { name: "Ghi đã hoàn tiền…" }));
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).toContain("hoàn tiền cho khách ở dashboard Creem");
    expect(text).not.toContain("ngoài hệ thống");
    expect(text).toContain("Không hoàn tác được.");
  });

  it("đơn PayOS cần xử lý: giữ chữ hoàn tiền cho khách ngoài hệ thống", async () => {
    const user = userEvent.setup();
    serveOrder({ ...order, status: "paid_needs_review", amount_paid: 50000 });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã nhận tiền nhưng license của đơn đã bị thu hồi" });
    expect(step.textContent).toContain("hay ghi nhận bạn đã hoàn tiền cho khách ngoài hệ thống");
    expect(step.textContent).not.toContain("dashboard");
    await user.click(within(step).getByRole("button", { name: "Ghi đã hoàn tiền…" }));
    expect(screen.getByRole("dialog").textContent).toContain("đã chuyển trả tiền cho khách ngoài hệ thống");
  });

  // m2-T7: đơn đã khép (paid, refunded, paid_needs_review) không có nút Cấp tay: thẻ cổng không kết luận "Khớp/Khác với đơn".
  it.each([
    ["paid", "pending"],
    ["paid_needs_review", "pending"],
    ["refunded", "pending"],
    ["paid", "paid"],
  ])("đơn %s, Creem báo %s: thẻ cổng chỉ có số liệu, không có câu kết luận và không tô cảnh báo", async (status, remoteStatus) => {
    const user = userEvent.setup();
    const remote = { orderCode: CODE, status: remoteStatus, amount: 3999, amountPaid: remoteStatus === "paid" ? 3999 : 0, paidAt: null };
    serveOrder({ ...creemOrder, status }, { licenses: [license], post: { [`/admin/orders/${CODE}/payment-status`]: () => json(remote) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Xem trạng thái trên Creem" }));
    const card = await screen.findByRole("region", { name: "Trạng thái trên Creem" });
    expect(card.textContent).toContain("$39,99");
    expect(within(card).queryByText(/Khớp với đơn|Khác với đơn/)).toBeNull();
    expect(card.className).not.toContain("tone-warn");
  });

  it.each(["pending", "processing", "underpaid", "failed", "expired", "cancelled"])("đơn %s (chưa khép): thẻ cổng vẫn có câu kết luận", async (status) => {
    const user = userEvent.setup();
    const remote = { orderCode: CODE, status: "paid", amount: 3999, amountPaid: 3999, paidAt: null };
    serveOrder({ ...creemOrder, status, amount_paid: 0, license_id: null }, { post: { [`/admin/orders/${CODE}/payment-status`]: () => json(remote) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Xem trạng thái trên Creem" }));
    const card = await screen.findByRole("region", { name: "Trạng thái trên Creem" });
    expect(within(card).getByText("Khác với đơn: so số tiền và trạng thái trước khi cấp tay.")).toBeTruthy();
    expect(card.className).toContain("tone-warn");
  });

  it("nhật ký của đơn: các khóa tiền in theo loại tiền của đơn (đô la, không phải cent thô), kể cả dòng không ghi currency (m4-T7)", async () => {
    serveOrder(held, {
      audit: [
        auditRow(3, "order_underpaid", UNDERPAID_LOG),
        auditRow(2, "order_partially_refunded", { event_id: "evt_1", refunded_amount: 1000, provider_amount_paid: 3999, amount: 3999, currency: "USD" }),
        auditRow(1, "order_created", { plan: "yearly", amount: 3999, currency: "USD" }),
      ],
    });
    render(<OrderPage code={CODE} />);
    const log = await screen.findByRole("list", { name: "Nhật ký của đơn" });
    const text = log.textContent ?? "";
    expect(text).toContain("amount_paid: $30,00");
    expect(text).toContain("provider_amount_paid: $33,00");
    expect(text).toContain("provider_tax_amount: $3,00");
    expect(text).toContain("provider_discount_amount: $9,99");
    expect(text).toContain("refunded_amount: $10,00");
    expect(text).toContain("amount: $39,99");
    expect(text).not.toMatch(/amount_paid: 3000|refunded_amount: 1000|amount: 3999/);
  });

  it("nhật ký của đơn VND: số đồng, không đoán là đô la", async () => {
    serveOrder(order, { audit: [auditRow(1, "order_underpaid", { amount: 50000, provider_amount: 50000, amount_paid: 20000 })] });
    render(<OrderPage code={CODE} />);
    const log = await screen.findByRole("list", { name: "Nhật ký của đơn" });
    expect(log.textContent).toContain("amount_paid: 20.000 đ");
    expect(log.textContent).not.toContain("$");
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
    // Đơn cần xử lý chưa từng áp vào license (license của đơn đã thu hồi): thẻ hoàn trước khi được cấp.
    await screen.findByText("Đơn đã hoàn tiền trước khi được cấp");
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

describe("OrderPage: thẻ của đơn đã hoàn tiền theo loại đơn và hộp Rút ngắn hạn (C1-T7, Q2)", () => {
  const D = 86400;
  const NOW_T = 1_791_590_400; // 10/10/2026 07:00 giờ Việt Nam
  const LIC = "44444444-4444-4444-8444-444444444444";
  const PAID = NOW_T - 3 * D;
  const FROM = NOW_T + 200 * D;
  const TO = FROM + 365 * D;
  const SHORTEN = `/admin/licenses/${LIC}/shorten`;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW_T * 1000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Đơn gia hạn qua Creem (Yearly), đã áp vào license LIC, sau đó được hoàn đủ. */
  const refunded = {
    ...order,
    provider: "creem",
    plan: "yearly",
    amount: 3999,
    amount_paid: 3999,
    currency: "USD",
    status: "refunded",
    grant_kind: "extend",
    license_id: LIC,
    renew_license_id: LIC,
    paid_at: PAID,
    email_sent_at: PAID + 60,
  };
  const lic = (over: object = {}) => ({
    id: LIC,
    license_key: KEY,
    email: "khach@example.com",
    plan: "yearly",
    expires_at: TO,
    created_at: NOW_T - 200 * D,
    revoked_at: null,
    locked_at: null,
    conflict: false,
    activations: [],
    audit: [],
    ...over,
  });
  const log = (id: number, action: string, detail: object | null, over: object = {}) => ({
    id,
    at: PAID + 60,
    actor: "webhook",
    action,
    license_id: LIC,
    order_code: CODE,
    detail: detail === null ? null : JSON.stringify(detail),
    ...over,
  });
  const extendRow = log(2, "license_extended", { plan: "yearly", from_plan: "yearly", from_expires_at: FROM, expires_at: TO, paid_at: PAID });
  const refundRow = log(3, "order_refunded", { event_id: "evt_1", full: true }, { at: NOW_T - D });
  const created = log(1, "order_created", { plan: "yearly" }, { license_id: null, actor: "api", at: PAID - 600 });
  const lookups = () => calls.filter((c) => c.url === "/admin/lookup").length;

  it("đơn gia hạn bị hoàn: rút đúng 365 ngày là hành động chính; có hạn trước và sau đơn; Mở license chỉ là nút phụ", async () => {
    serveOrder(refunded, { licenses: [lic()], audit: [refundRow, extendRow, created] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền: license vẫn giữ 365 ngày đơn này cộng" });
    const shorten = within(step).getByRole("button", { name: "Rút ngắn 365 ngày…" });
    expect(shorten.className).toContain("primary");
    expect(step.textContent).toContain(`Đơn #${CODE} cộng 365 ngày (hạn trước đơn: ${fmtDate(FROM)}; sau đơn: ${fmtDate(TO)})`);
    expect(step.textContent).toContain("đừng thu hồi");
    expect(step.textContent).toContain("Xem bảng Đơn hàng của license trước.");
    const open = within(step).getByRole("link", { name: "Mở license" });
    expect(open.getAttribute("href")).toBe(`/licenses/${LIC}`);
    expect(open.className).not.toContain("primary");
    // Đơn gia hạn đã biết license đích: không tra cứu thêm các đơn của license.
    expect(lookups()).toBe(1);
  });

  it("gửi hộp: POST /shorten với số ngày, lý do, hạn đang hiển thị và mã đơn; báo hạn mới; tải lại đơn", async () => {
    const user = userEvent.setup();
    serveOrder(refunded, { licenses: [lic()], audit: [refundRow, extendRow], post: { [SHORTEN]: () => json({ license_id: LIC, expires_at: TO - 365 * D }) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Rút ngắn 365 ngày…" }));
    const dialog = screen.getByRole("dialog", { name: "Rút ngắn hạn license?" });
    expect((within(dialog).getByLabelText(/Số ngày/) as HTMLInputElement).value).toBe("365");
    expect(dialog.textContent).toContain(`Trừ 365 ngày khỏi hạn (${fmtDate(TO)} → ${fmtDate(TO - 365 * D)})`);
    expect(dialog.textContent).toContain("muốn lấy lại hết thì Thu hồi");
    expect(dialog.textContent).toContain("Muốn trả lại thì dùng Gia hạn");
    expect(dialog.textContent).toContain(`đơn #${CODE}`);
    const confirm = within(dialog).getByRole("button", { name: "Rút ngắn" }) as HTMLButtonElement;
    await user.type(within(dialog).getByLabelText(/Lý do/), "khách được hoàn đơn gia hạn");
    expect(confirm.disabled).toBe(true); // chưa gõ chữ xác nhận
    await user.type(within(dialog).getByLabelText(/để xác nhận/), "RUT NGAN");
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    expect(await screen.findByText(`Đã rút ngắn hạn tới ${fmtDate(TO - 365 * D)}.`)).toBeTruthy();
    expect(calls.filter((c) => c.url === SHORTEN)).toEqual([
      { url: SHORTEN, method: "POST", body: { days: 365, note: "khách được hoàn đơn gia hạn", expected_expires_at: TO, order_code: CODE } },
    ]);
    await waitFor(() => expect(lookups()).toBe(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("đang gửi: nút xác nhận bị khóa, bấm lại không gửi lần hai", async () => {
    const user = userEvent.setup();
    serveOrder(refunded, { licenses: [lic()], audit: [refundRow, extendRow], post: { [SHORTEN]: () => new Promise<Response>(() => {}) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Rút ngắn 365 ngày…" }));
    await user.type(screen.getByLabelText(/Lý do/), "hoàn đơn");
    await user.type(screen.getByLabelText(/để xác nhận/), "RUT NGAN");
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Rút ngắn" }) as HTMLButtonElement;
    await user.click(confirm);
    const busy = within(screen.getByRole("dialog")).getByRole("button", { name: "Đang làm…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    await user.click(busy);
    expect(calls.filter((c) => c.url === SHORTEN)).toHaveLength(1);
  });

  // Đổi nghĩa (I-1 của rà B2): 409 conflict không còn để hộp mở với lời mời thử lại.
  it("server trả 409 too_far: hộp còn mở với câu rõ ràng, trang tải lại; gửi lại vẫn mang hạn đã hiển thị lúc mở hộp", async () => {
    const user = userEvent.setup();
    serveOrder(refunded, {
      // Lần tải lại sau 409 trả hạn khác (license vừa đổi ở nơi khác): hộp vẫn phải gửi hạn đã hiển thị lúc mở.
      lookup: (n) => json({ licenses: [lic(n === 1 ? {} : { expires_at: TO + 10 * D })], orders: [refunded] }),
      audit: [refundRow, extendRow],
      post: { [SHORTEN]: () => json({ error: "too_far", max_days: 100, expires_at: TO }, 409) },
    });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Rút ngắn 365 ngày…" }));
    await user.type(screen.getByLabelText(/Lý do/), "hoàn đơn");
    await user.type(screen.getByLabelText(/để xác nhận/), "RUT NGAN");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rút ngắn" }));
    await waitFor(() => expect(lookups()).toBe(2));
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".dialog-error")?.textContent).toContain("còn rút được nhiều nhất 100 ngày");
    const days = within(dialog).getByLabelText(/Số ngày/) as HTMLInputElement;
    await user.clear(days);
    await user.type(days, "100");
    await user.click(within(dialog).getByRole("button", { name: "Rút ngắn" }));
    await waitFor(() => expect(calls.filter((c) => c.url === SHORTEN)).toHaveLength(2));
    expect(calls.filter((c) => c.url === SHORTEN).map((c) => (c.body as { expected_expires_at: number }).expected_expires_at)).toEqual([TO, TO]);
  });

  it("server trả 409 conflict: hộp đóng (không gửi lại được), câu cảnh báo ở trang, trang tải lại; mở lại hộp thì tính theo hạn mới", async () => {
    const user = userEvent.setup();
    serveOrder(refunded, {
      lookup: (n) => json({ licenses: [lic(n === 1 ? {} : { expires_at: TO - 365 * D })], orders: [refunded] }),
      audit: [refundRow, extendRow],
      post: { [SHORTEN]: () => json({ error: "conflict" }, 409) },
    });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Rút ngắn 365 ngày…" }));
    await user.type(screen.getByLabelText(/Lý do/), "hoàn đơn");
    await user.type(screen.getByLabelText(/để xác nhận/), "RUT NGAN");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rút ngắn" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(lookups()).toBe(2));
    const region = document.querySelector(".notice-region") as HTMLElement;
    expect(region.textContent).toContain("License vừa thay đổi (hay yêu cầu trước đã được áp dụng): đã tải lại.");
    expect(region.textContent).not.toContain("thử lại");
    expect(calls.filter((c) => c.url === SHORTEN)).toHaveLength(1);
    // Mở lại: hộp mới lấy hạn của lần tải mới nhất.
    await waitFor(() => expect((screen.getByRole("button", { name: /^Rút ngắn \d+ ngày…$/ }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole("button", { name: /^Rút ngắn \d+ ngày…$/ }));
    expect(screen.getByRole("dialog").textContent).toContain(fmtDate(TO - 365 * D));
  });

  it("đang tải lại (nhật ký chưa về): nút Rút ngắn N ngày… của thẻ bị khóa", async () => {
    const user = userEvent.setup();
    serveOrder(refunded, {
      licenses: [lic()],
      auditReply: (n) => (n === 1 ? json({ items: [refundRow, extendRow], next_cursor: null }) : new Promise<Response>(() => {})),
      post: { [SHORTEN]: () => json({ error: "too_far", max_days: 100, expires_at: TO }, 409) },
    });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Rút ngắn 365 ngày…" }));
    await user.type(screen.getByLabelText(/Lý do/), "hoàn đơn");
    await user.type(screen.getByLabelText(/để xác nhận/), "RUT NGAN");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rút ngắn" }));
    await waitFor(() => expect(lookups()).toBe(2));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
    expect((screen.getByRole("button", { name: "Rút ngắn 365 ngày…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mở hộp: focus vào ô Số ngày trước (M8)", async () => {
    const user = userEvent.setup();
    serveOrder(refunded, { licenses: [lic()], audit: [refundRow, extendRow] });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Rút ngắn 365 ngày…" }));
    expect(document.activeElement).toBe(within(screen.getByRole("dialog")).getByLabelText(/Số ngày/));
  });

  // Đổi nghĩa (I-1 của rà B2-fix): thẻ không còn khẳng định "license vẫn giữ N ngày" hay "Rút ngắn đúng N ngày" khi đã thấy lần rút
  // không kèm mã đơn; cảnh báo đứng đầu thẻ.
  it("license đã bị rút ngắn không kèm mã đơn sau khi đơn áp vào: tiêu đề và câu đầu là cảnh báo, không còn số ngày khẳng định, nút rút là nút phụ không điền sẵn (I-2)", async () => {
    const user = userEvent.setup();
    const cut = { at: NOW_T - 3600, actor: "admin:ops@example.com", action: "license_shortened_manually", order_code: null, detail: JSON.stringify({ days: 100, from_expires_at: TO, expires_at: TO - 100 * D }) };
    serveOrder(refunded, { licenses: [lic({ expires_at: TO - 100 * D, audit: [cut] })], audit: [refundRow, extendRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền: license đã bị rút ngắn 100 ngày không kèm mã đơn" });
    expect(step.querySelector(".ui-card-desc")?.textContent?.startsWith("License đã bị rút ngắn 100 ngày không kèm mã đơn")).toBe(true);
    expect(step.textContent).toContain(`Kiểm tra hạn hiện tại (${fmtDate(TO - 100 * D)})`);
    expect(step.textContent).toContain("50 dòng nhật ký mới nhất");
    expect(step.textContent).not.toContain("Rút ngắn đúng");
    expect(step.textContent).not.toContain("license vẫn giữ");
    expect(within(step).queryByRole("button", { name: /^Rút ngắn \d+ ngày…$/ })).toBeNull();
    const free = within(step).getByRole("button", { name: "Rút ngắn hạn…" });
    expect(free.className).not.toContain("primary");
    await user.click(free);
    expect((within(screen.getByRole("dialog")).getByLabelText(/Số ngày/) as HTMLInputElement).value).toBe("");
  });

  it("rút không kèm mã đơn đủ phần của đơn và hạn hiện tại đúng bằng hạn sau khi rút: coi như đã rút đủ, nói rõ phần rút ở trang license", async () => {
    const cut = { at: NOW_T - 3600, actor: "admin:ops@example.com", action: "license_shortened_manually", order_code: null, detail: JSON.stringify({ days: 365 }) };
    serveOrder(refunded, { licenses: [lic({ expires_at: FROM, audit: [cut] })], audit: [refundRow, extendRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã rút ngắn 365 ngày" });
    expect(step.textContent).toContain("gồm 365 ngày rút ở trang license không kèm mã đơn");
    expect(within(step).queryByRole("button")).toBeNull();
  });

  it("rút ngắn không kèm mã đơn TRƯỚC khi đơn áp vào: không tính, vẫn điền sẵn", async () => {
    const cut = { at: PAID - 3600, actor: "admin:ops@example.com", action: "license_shortened_manually", order_code: null, detail: JSON.stringify({ days: 5 }) };
    serveOrder(refunded, { licenses: [lic({ audit: [cut] })], audit: [refundRow, extendRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền: license vẫn giữ 365 ngày đơn này cộng" });
    expect(within(step).getByRole("button", { name: "Rút ngắn 365 ngày…" })).toBeTruthy();
    expect(step.textContent).not.toContain("không kèm mã đơn");
  });

  it("gia hạn áp vào license đã hết hạn (không còn thời gian của đơn trước): không nói thu hồi lấy thời gian của đơn khác (M3)", async () => {
    const expiredExtend = log(2, "license_extended", { plan: "yearly", from_expires_at: PAID - 10 * D, expires_at: PAID + 365 * D, paid_at: PAID });
    serveOrder(refunded, { licenses: [lic({ expires_at: PAID + 365 * D })], audit: [refundRow, expiredExtend] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền: license vẫn giữ 365 ngày đơn này cộng" });
    expect(step.textContent).not.toContain("thời gian khách đã trả ở đơn khác");
    expect(step.textContent).toContain("license đã hết hạn lúc đơn này áp vào");
    expect(within(step).getByRole("button", { name: "Rút ngắn 361 ngày…" })).toBeTruthy();
  });

  it("license còn chưa tới một ngày: không vừa mời rút đúng N ngày vừa nói không rút được (M3)", async () => {
    serveOrder(refunded, { licenses: [lic({ expires_at: NOW_T + 3600 })], audit: [refundRow, extendRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền: license vẫn giữ 365 ngày đơn này cộng" });
    expect(step.textContent).toContain("không rút ngắn được nữa");
    expect(step.textContent).not.toContain("Rút ngắn đúng");
    expect(within(step).queryByRole("button", { name: /Rút ngắn/ })).toBeNull();
  });

  it("không tải được nhật ký của đơn (đơn có license): thẻ báo chưa biết số ngày, không nút (M5)", async () => {
    serveOrder(refunded, { licenses: [lic()], auditReply: () => json({ error: "internal" }, 500) });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đơn đã hoàn tiền: không tải được nhật ký của đơn" });
    expect(within(step).queryByRole("button")).toBeNull();
  });

  it("đơn gia hạn hoàn trước khi được cấp (license_id null, license gia hạn còn hạn): không cần làm gì, không nút (I1-T7 a)", async () => {
    serveOrder({ ...refunded, license_id: null, grant_kind: null, paid_at: null, email_sent_at: null }, { licenses: [lic()], audit: [refundRow, created] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đơn đã hoàn tiền trước khi được cấp" });
    expect(within(step).queryByRole("button")).toBeNull();
    expect(within(step).queryByRole("link")).toBeNull();
  });

  /** Đơn mua mới qua Creem, đã cấp license LIC (hạn PAID + 365 ngày). */
  const fresh = { ...refunded, grant_kind: "new", renew_license_id: null };
  const issuedRow = log(2, "license_issued", { plan: "yearly", expires_at: PAID + 365 * D, cycle_anchor: PAID, paid_at: PAID });

  it("đơn mua mới, license chỉ gồm đơn này: thu hồi hay rút ngắn đều được; rút được nhiều nhất tới bây giờ", async () => {
    serveOrder(fresh, { licenses: [lic({ expires_at: PAID + 365 * D })], audit: [refundRow, issuedRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền một đơn mua mới" });
    await waitFor(() => expect(step.textContent).toContain("License chỉ gồm đơn này"));
    expect(within(step).getByRole("link", { name: "Mở license" }).getAttribute("href")).toBe(`/licenses/${LIC}`);
    // Khách đã dùng 3 ngày: hạn mới phải sau bây giờ nên chỉ rút được 361 ngày.
    expect(within(step).getByRole("button", { name: "Rút ngắn 361 ngày…" })).toBeTruthy();
    expect(step.textContent).toContain("phần khách đã dùng không lấy lại được");
    expect(calls.filter((c) => c.url === "/admin/lookup").map((c) => c.body)).toEqual([{ order_code: CODE }, { license_id: LIC }]);
  });

  it("đơn mua mới, license chỉ có thêm đơn chưa trả hay đã hoàn: vẫn là license chỉ gồm đơn này", async () => {
    const pending = { ...fresh, order_code: 1000098, status: "pending", license_id: null, renew_license_id: LIC };
    const gone = { ...fresh, order_code: 1000097, status: "refunded", grant_kind: "extend", renew_license_id: LIC };
    serveOrder(fresh, {
      lookup: (_n, body) => json({ licenses: [lic({ expires_at: PAID + 365 * D })], orders: body.license_id ? [fresh, pending, gone] : [fresh] }),
      audit: [refundRow, issuedRow],
    });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền một đơn mua mới" });
    await waitFor(() => expect(step.textContent).toContain("License chỉ gồm đơn này"));
  });

  it("đơn mua mới, license đã được gia hạn tay: còn nguồn thời gian khác, như đơn gia hạn (M4)", async () => {
    const manual = { at: NOW_T - D, actor: "admin:ops@example.com", action: "license_extended_manually", order_code: null, detail: JSON.stringify({ days: 30 }) };
    serveOrder(fresh, { licenses: [lic({ expires_at: PAID + 395 * D, audit: [manual] })], audit: [refundRow, issuedRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền: license vẫn giữ 365 ngày đơn này cộng" });
    expect(step.textContent).toContain("đừng thu hồi");
  });

  it("đơn mua mới, không tải được các đơn của license: coi như còn đơn khác (hướng an toàn) (M5)", async () => {
    serveOrder(fresh, {
      lookup: (_n, body) => (body.license_id ? json({ error: "internal" }, 500) : json({ licenses: [lic({ expires_at: PAID + 365 * D })], orders: [fresh] })),
      audit: [refundRow, issuedRow],
    });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền: license vẫn giữ 365 ngày đơn này cộng" });
    expect(step.textContent).toContain("đừng thu hồi");
  });

  it("đơn mua mới, đơn đã trả khác áp vào license KHÁC (cấp key mới): vẫn là license chỉ gồm đơn này (M5)", async () => {
    const elsewhere = { ...fresh, order_code: 1000096, status: "paid", license_id: "55555555-5555-4555-8555-555555555555", renew_license_id: LIC };
    serveOrder(fresh, {
      lookup: (_n, body) => json({ licenses: [lic({ expires_at: PAID + 365 * D })], orders: body.license_id ? [fresh, elsewhere] : [fresh] }),
      audit: [refundRow, issuedRow],
    });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền một đơn mua mới" });
    await waitFor(() => expect(step.textContent).toContain("License chỉ gồm đơn này"));
  });

  it("đơn mua mới mà license còn đơn đã trả khác: như đơn gia hạn (đừng thu hồi)", async () => {
    const other = { ...fresh, order_code: 1000099, status: "paid", grant_kind: "extend", renew_license_id: LIC };
    serveOrder(fresh, {
      lookup: (_n, body) => json(body.license_id ? { licenses: [lic({ expires_at: PAID + 730 * D })], orders: [fresh, other] } : { licenses: [lic({ expires_at: PAID + 730 * D })], orders: [fresh] }),
      audit: [refundRow, issuedRow],
    });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền: license vẫn giữ 365 ngày đơn này cộng" });
    expect(within(step).getByRole("button", { name: "Rút ngắn 365 ngày…" })).toBeTruthy();
    expect(step.textContent).toContain("đừng thu hồi");
  });

  it("đơn đổi gói bị hoàn: Web Admin không đổi lại gói; Rút ngắn hạn… không điền sẵn số ngày", async () => {
    const user = userEvent.setup();
    const changed = log(2, "license_plan_changed", { plan: "yearly", from_plan: "monthly", from_expires_at: NOW_T + 20 * D, expires_at: TO, paid_at: PAID });
    serveOrder({ ...refunded, grant_kind: "change" }, { licenses: [lic()], audit: [refundRow, changed] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã hoàn tiền một đơn đổi gói" });
    expect(step.textContent).toContain("Web Admin không đổi lại gói.");
    expect(step.textContent).toContain(`Đơn đổi gói từ Monthly sang Yearly (hạn trước: ${fmtDate(NOW_T + 20 * D)}; sau: ${fmtDate(TO)})`);
    expect(within(step).getByRole("link", { name: "Mở license" })).toBeTruthy();
    await user.click(within(step).getByRole("button", { name: "Rút ngắn hạn…" }));
    const dialog = screen.getByRole("dialog", { name: "Rút ngắn hạn license?" });
    expect((within(dialog).getByLabelText(/Số ngày/) as HTMLInputElement).value).toBe("");
    expect(dialog.textContent).toContain("Rút ngắn không đổi lại gói.");
  });

  it("đã rút đủ rồi license lại được cộng thêm (gia hạn tay trả lại…): thẻ nhắc kiểm tra hạn hiện tại (M6)", async () => {
    const cut = log(4, "license_shortened_manually", { days: 365, order_code: CODE }, { actor: "admin:ops@example.com", at: NOW_T - 3600 });
    serveOrder(refunded, { licenses: [lic({ expires_at: FROM + 365 * D })], audit: [cut, refundRow, extendRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã rút ngắn 365 ngày" });
    expect(step.textContent).toContain(`Hạn hiện tại ${fmtDate(FROM + 365 * D)}`);
    expect(step.textContent).toContain("kiểm tra");
    expect(step.textContent).not.toContain("Không cần làm gì thêm");
  });

  it("đã rút đủ số ngày đơn cộng: chỉ ghi nhận kèm thời điểm, không nút", async () => {
    const at = NOW_T - 3600;
    const cut = log(4, "license_shortened_manually", { days: 365, order_code: CODE, from_expires_at: TO, expires_at: TO - 365 * D }, { actor: "admin:ops@example.com", at });
    serveOrder(refunded, { licenses: [lic({ expires_at: FROM })], audit: [cut, refundRow, extendRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Đã rút ngắn 365 ngày" });
    expect(step.textContent).toContain(fmtDateTime(at));
    expect(within(step).queryByRole("button")).toBeNull();
    expect(within(step).queryByRole("link")).toBeNull();
  });

  it.each([
    ["order_partially_refunded", "Cổng báo hoàn tiền một phần hay tranh chấp", "Hoàn tiền một phần"],
    ["order_disputed", "Cổng báo hoàn tiền một phần hay tranh chấp", "Khách mở tranh chấp"],
    ["order_refund_unconfirmed", "Cổng báo một lần hoàn tiền chưa thành công", "Hoàn tiền chưa thành công"],
  ])("đơn còn paid có nhật ký %s: thẻ cảnh báo dẫn tới nhật ký, chỉ có nút phụ Rút ngắn hạn… (P2-T7, m3)", async (action, title, label) => {
    const paid = { ...refunded, status: "paid" };
    serveOrder(paid, { licenses: [lic()], audit: [log(5, action, { event_id: "evt_9", full: false }, { at: NOW_T - D }), extendRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: title });
    expect(step.textContent).toContain(label);
    expect(step.textContent).toContain("nhật ký của đơn");
    // Gợi ý thu hồi luôn kèm lời nhắc xem bảng Đơn hàng (M2).
    expect(step.textContent).toContain("xem bảng Đơn hàng của license trước");
    // Đổi nghĩa (m3 của rà B2-fix): thẻ không còn bảo rút ngắn "ở trang license" (ở đó không gắn mã đơn) mà có nút phụ Rút ngắn
    // hạn… gắn mã đơn ngay tại đây; vẫn không có liên kết.
    expect(step.textContent).not.toContain("rút ngắn hạn hay thu hồi ở trang license");
    expect(within(step).getAllByRole("button").map((b) => b.textContent)).toEqual(["Rút ngắn hạn…"]);
    expect(within(step).getByRole("button", { name: "Rút ngắn hạn…" }).className).not.toContain("primary");
    expect(within(step).queryByRole("link")).toBeNull();
  });

  it.each(["underpaid", "pending", "processing", "failed"])(
    "đơn %s (chưa cấp) có nhật ký tranh chấp: vẫn thấy thẻ cảnh báo, nói đơn vẫn có thể được cấp; thẻ Cấp tay vẫn còn (M2)",
    async (status) => {
      serveOrder({ ...refunded, status, amount_paid: status === "underpaid" ? 2000 : 0, license_id: null, paid_at: null, email_sent_at: null }, {
        licenses: [lic()],
        audit: [log(5, "order_disputed", { event_id: "evt_8", full: false }, { at: NOW_T - D })],
      });
      render(<OrderPage code={CODE} />);
      const step = await screen.findByRole("region", { name: "Cổng báo hoàn tiền một phần hay tranh chấp" });
      expect(step.textContent).toContain("Khách mở tranh chấp");
      expect(step.textContent).toContain("vẫn có thể được cấp");
      expect(step.textContent).not.toContain("license giữ nguyên");
      expect(screen.getByRole("button", { name: "Cấp tay…" })).toBeTruthy();
    },
  );

  it("thẻ hoàn một phần của đơn paid: Rút ngắn hạn… mở hộp gắn mã đơn, không điền sẵn (m3)", async () => {
    const user = userEvent.setup();
    serveOrder({ ...refunded, status: "paid" }, { licenses: [lic()], audit: [log(5, "order_partially_refunded", { event_id: "evt_9", full: false }, { at: NOW_T - D }), extendRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Cổng báo hoàn tiền một phần hay tranh chấp" });
    await user.click(within(step).getByRole("button", { name: "Rút ngắn hạn…" }));
    const dialog = screen.getByRole("dialog", { name: "Rút ngắn hạn license?" });
    expect((within(dialog).getByLabelText(/Số ngày/) as HTMLInputElement).value).toBe("");
    expect(dialog.textContent).toContain(`cho đơn #${CODE}`);
  });

  it("đơn paid_needs_review có nhật ký hoàn một phần: không nói đơn được cấp tự động (m5)", async () => {
    serveOrder({ ...refunded, status: "paid_needs_review", license_id: null }, { licenses: [lic({ revoked_at: NOW_T - D })], audit: [log(5, "order_partially_refunded", { event_id: "evt_9", full: false }, { at: NOW_T - D })] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Cổng báo hoàn tiền một phần hay tranh chấp" });
    expect(step.textContent).not.toContain("tự động khi cổng báo đã trả");
    expect(step.textContent).toContain("Cấp key mới");
  });

  it("đơn đã hoàn tiền mà nhật ký có tranh chấp: thẻ nhắc trả lời tranh chấp trên dashboard của cổng (m4)", async () => {
    const dispute = log(6, "order_disputed", { event_id: "evt_d", full: true }, { at: NOW_T - 3600 });
    serveOrder(refunded, { licenses: [lic()], audit: [dispute, refundRow, extendRow] });
    render(<OrderPage code={CODE} />);
    const step = await screen.findByRole("region", { name: "Khách mở tranh chấp cho đơn này" });
    expect(step.textContent).toContain("Trả lời tranh chấp trên dashboard của Creem");
    // Thẻ rút ngắn của đơn đã hoàn vẫn còn.
    expect(screen.getByRole("region", { name: "Đã hoàn tiền: license vẫn giữ 365 ngày đơn này cộng" })).toBeTruthy();
  });

  it("đang tải lại đơn (nhật ký đã về): nút Rút ngắn N ngày… của thẻ bị khóa", async () => {
    const user = userEvent.setup();
    serveOrder(refunded, {
      lookup: (n) => (n === 1 ? json({ licenses: [lic()], orders: [refunded] }) : new Promise<Response>(() => {})),
      audit: [refundRow, extendRow],
      post: { [SHORTEN]: () => json({ error: "too_far", max_days: 100, expires_at: TO }, 409) },
    });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Rút ngắn 365 ngày…" }));
    await user.type(screen.getByLabelText(/Lý do/), "hoàn đơn");
    await user.type(screen.getByLabelText(/để xác nhận/), "RUT NGAN");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rút ngắn" }));
    await waitFor(() => expect(lookups()).toBe(2));
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith("/admin/audit"))).toHaveLength(2));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
    expect((screen.getByRole("button", { name: "Rút ngắn 365 ngày…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lỗi máy chủ khi rút ngắn (không chắc đã ghi chưa): hộp khóa nút gửi, bấm lại không gửi lần hai", async () => {
    const user = userEvent.setup();
    serveOrder(refunded, { licenses: [lic()], audit: [refundRow, extendRow], post: { [SHORTEN]: () => json({ error: "internal" }, 500) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Rút ngắn 365 ngày…" }));
    await user.type(screen.getByLabelText(/Lý do/), "hoàn đơn");
    await user.type(screen.getByLabelText(/để xác nhận/), "RUT NGAN");
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Rút ngắn" }) as HTMLButtonElement;
    await user.click(confirm);
    expect(await within(screen.getByRole("dialog")).findByText(/Không chắc thao tác đã chạy chưa/)).toBeTruthy();
    expect(confirm.disabled).toBe(true);
    await user.click(confirm);
    expect(calls.filter((c) => c.url === SHORTEN)).toHaveLength(1);
  });

  it("tải lại sau 409 bị lỗi rồi Thử lại: hộp Rút ngắn không tự hiện lại (m1)", async () => {
    const user = userEvent.setup();
    serveOrder(refunded, {
      lookup: (n) => (n === 2 ? json({ error: "internal" }, 500) : json({ licenses: [lic()], orders: [refunded] })),
      audit: [refundRow, extendRow],
      post: { [SHORTEN]: () => json({ error: "too_far", max_days: 100, expires_at: TO }, 409) },
    });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Rút ngắn 365 ngày…" }));
    await user.type(screen.getByLabelText(/Lý do/), "hoàn đơn");
    await user.type(screen.getByLabelText(/để xác nhận/), "RUT NGAN");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rút ngắn" }));
    await user.click(await screen.findByRole("button", { name: "Thử lại" }));
    await screen.findByRole("button", { name: "Rút ngắn 365 ngày…" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("OrderPage: đơn thẻ (Creem) bị giữ vì số tiền: Cấp tay là chấp nhận số đã thu (I-2, p1–p4 của rà B6)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(1_791_000_000 * 1000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const held = {
    ...order,
    provider: "creem",
    plan: "yearly",
    amount: 3999,
    amount_paid: 3000,
    currency: "USD",
    status: "underpaid",
  };
  const row = (id: number, action: string, detail: object) => ({ id, at: 1_790_813_000 + id, actor: "webhook", action, license_id: null, order_code: CODE, detail: JSON.stringify(detail) });
  const DISCOUNT = { amount: 3999, provider_amount: 3999, amount_paid: 3000, has_discount: true, provider_discount_amount: 999 };

  async function openGrant(o: object, audit: unknown[]) {
    const user = userEvent.setup();
    serveOrder(o, { audit });
    render(<OrderPage code={CODE} />);
    await screen.findByRole("list", { name: "Nhật ký của đơn" });
    await user.click(screen.getByRole("button", { name: "Cấp tay…" }));
    return { user, dialog: screen.getByRole("dialog") };
  }

  it("underpaid: hộp Cấp tay nói Cấp tay là chấp nhận số Creem đã thu, doanh thu ghi số đó; phải gõ CAP TAY; không còn câu 'xác minh khách trả đủ'", async () => {
    const { user, dialog } = await openGrant(held, [row(1, "order_underpaid", DISCOUNT)]);
    expect(dialog.textContent).toContain(
      "Cấp tay là chấp nhận số Creem đã thu $30,00 (không gồm thuế) trên giá $39,99; doanh thu ghi $30,00. Không chấp nhận thì hoàn tiền ở dashboard Creem: đơn tự thành Đã hoàn tiền khi Creem báo.",
    );
    expect(dialog.textContent).not.toContain("xác minh khách trả đủ");
    const confirm = within(dialog).getByRole("button", { name: "Cấp" }) as HTMLButtonElement;
    await user.type(within(dialog).getByLabelText(/Lý do/), "chấp nhận giá đã giảm");
    expect(confirm.disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/để xác nhận/), "CAP TAY");
    expect(confirm.disabled).toBe(false);
  });

  it("underpaid vì dữ liệu tiền hỏng: hộp nói không đọc được số đã thu", async () => {
    const { dialog } = await openGrant({ ...held, amount_paid: 0 }, [row(1, "order_underpaid", { amount: 3999, amount_paid: 0, provider_malformed_fields: ["order.amount_paid"] })]);
    expect(dialog.textContent).toContain("không đọc được số đã thu");
    expect(dialog.textContent).toContain("doanh thu ghi $0,00");
  });

  it("failed vì lệch giá: Cấp tay là nút phụ, hộp cũng đòi CAP TAY", async () => {
    const { dialog } = await openGrant({ ...held, status: "failed", amount_paid: 2199 }, [row(1, "order_amount_mismatch", { amount: 3999, provider_amount: 2199, amount_paid: 2199 })]);
    expect(dialog.textContent).toContain("Cấp tay là chấp nhận số Creem đã thu $21,99 (không gồm thuế) trên giá $39,99");
    expect(within(dialog).getByLabelText(/để xác nhận/)).toBeTruthy();
  });

  it("Cấp tay… của đơn thẻ bị giữ là nút phụ; của đơn PayOS chuyển thiếu vẫn là nút chính, trừ khi nhật ký có tranh chấp hay hoàn tiền", async () => {
    serveOrder(held, { audit: [row(1, "order_underpaid", DISCOUNT)] });
    const first = render(<OrderPage code={CODE} />);
    await screen.findByRole("list", { name: "Nhật ký của đơn" });
    expect(screen.getByRole("button", { name: "Cấp tay…" }).className).not.toContain("primary");
    first.unmount();
    serveOrder(order);
    const second = render(<OrderPage code={CODE} />);
    expect((await screen.findByRole("button", { name: "Cấp tay…" })).className).toContain("primary");
    second.unmount();
    serveOrder(order, { audit: [row(2, "order_disputed", { event_id: "e", full: false })] });
    render(<OrderPage code={CODE} />);
    await screen.findByRole("region", { name: "Cổng báo hoàn tiền một phần hay tranh chấp" });
    expect(screen.getByRole("button", { name: "Cấp tay…" }).className).not.toContain("primary");
  });

  it("đơn PayOS chuyển thiếu: hộp Cấp tay không đòi gõ chữ xác nhận (giữ nguyên)", async () => {
    const { dialog } = await openGrant(order, [row(1, "order_created", { plan: "monthly" })]);
    expect(within(dialog).queryByLabelText(/để xác nhận/)).toBeNull();
  });

  it("thẻ trạng thái trên Creem: huy hiệu theo cổng (Trả thấp hơn giá, không Chuyển thiếu) (p1)", async () => {
    const user = userEvent.setup();
    serveOrder(held, { post: { [`/admin/orders/${CODE}/payment-status`]: () => json({ orderCode: CODE, status: "underpaid", amount: 3999, amountPaid: 3000, paidAt: null }) } });
    render(<OrderPage code={CODE} />);
    await user.click(await screen.findByRole("button", { name: "Xem trạng thái trên Creem" }));
    const card = await screen.findByRole("region", { name: "Trạng thái trên Creem" });
    expect(card.textContent).toContain("Trả thấp hơn giá");
    expect(card.textContent).not.toContain("Chuyển thiếu");
  });

  it("có mã giảm giá mà số đã thu bằng giá: tiêu đề nói có mã giảm giá; thẻ Số tiền không xanh, không 'Đã nhận đủ' (p2)", async () => {
    serveOrder({ ...held, amount_paid: 3999 }, { audit: [row(1, "order_underpaid", { ...DISCOUNT, amount_paid: 3999 })] });
    render(<OrderPage code={CODE} />);
    expect(await screen.findByRole("region", { name: "Creem báo đã trả, có dùng mã giảm giá" })).toBeTruthy();
    const money = screen.getByRole("region", { name: "Số tiền" });
    expect(money.textContent).toContain("Creem đã thu $39,99 không gồm thuế (có giảm giá).");
    expect(money.textContent).not.toContain("Đã nhận đủ");
    expect(money.querySelector(".ratio-bar")?.getAttribute("class")).not.toContain("tone-ok");
  });

  it("dữ liệu tiền hỏng (đã nhận 0): thẻ Số tiền nói không đọc được số Creem đã thu, không 'Chưa nhận khoản nào' (p3)", async () => {
    serveOrder({ ...held, amount_paid: 0 }, { audit: [row(1, "order_underpaid", { amount: 3999, amount_paid: 0, provider_malformed_fields: ["order.amount_paid"] })] });
    render(<OrderPage code={CODE} />);
    await screen.findByRole("region", { name: "Creem báo đã thu tiền nhưng không đọc được số tiền" });
    const money = screen.getByRole("region", { name: "Số tiền" });
    expect(money.textContent).toContain("Không đọc được số tiền Creem đã thu.");
    expect(money.textContent).not.toContain("Chưa nhận khoản nào");
  });
});
