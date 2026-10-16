import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Activation, LicenseDetail, LicenseRow, OrderRow } from "../api/types";
import { activeDevices, licenseColumns, orderColumns } from "./columns";

const NOW = 1_790_000_000;

const row: LicenseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  license_key: "K7Q2-…-9XMB",
  email: "khach@example.com",
  plan: "monthly",
  expires_at: NOW + 86_400,
  created_at: NOW - 86_400,
  revoked_at: null,
  locked_at: null,
  active_devices: 1,
};

const activation = (id: string, deactivated_at: number | null): Activation => ({
  id,
  license_id: row.id,
  device_id_hash: id.repeat(64).slice(0, 64),
  device_label: null,
  quota_epoch: 0,
  created_at: NOW - 100,
  last_validated_at: NOW - 10,
  deactivated_at,
  deactivated_by: deactivated_at === null ? null : "admin",
});

const detail = (activations: Activation[]): LicenseDetail => ({
  id: row.id,
  license_key: "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB",
  email: row.email,
  plan: row.plan,
  expires_at: row.expires_at,
  created_at: row.created_at,
  revoked_at: null,
  locked_at: null,
  conflict: false,
  activations,
  audit: [],
});

function statusLabels(l: LicenseRow | LicenseDetail): (string | null)[] {
  const col = licenseColumns(NOW).find((c) => c.header === "Trạng thái");
  if (!col) throw new Error("thiếu cột Trạng thái");
  const { container } = render(<>{col.cell(l)}</>);
  return Array.from(container.querySelectorAll(".badge")).map((b) => b.textContent);
}

describe("licenseColumns: Xung đột máy khi có từ 2 máy đang dùng", () => {
  it("dòng danh sách: 1 máy thì không, 2 máy thì có", () => {
    expect(statusLabels({ ...row, active_devices: 0 })).toEqual(["Còn hạn"]);
    expect(statusLabels({ ...row, active_devices: 1 })).toEqual(["Còn hạn"]);
    expect(statusLabels({ ...row, active_devices: 2 })).toEqual(["Còn hạn", "Xung đột máy"]);
  });

  it("chi tiết: chỉ đếm máy chưa gỡ", () => {
    expect(activeDevices(detail([activation("a", null), activation("b", NOW - 5)]))).toBe(1);
    expect(statusLabels(detail([activation("a", null), activation("b", NOW - 5)]))).toEqual(["Còn hạn"]);
    expect(statusLabels(detail([activation("a", null), activation("b", null)]))).toEqual(["Còn hạn", "Xung đột máy"]);
  });

  it("license đã thu hồi có 2 máy: chỉ hiện Đã thu hồi", () => {
    expect(statusLabels({ ...row, active_devices: 2, revoked_at: NOW - 5, locked_at: NOW - 6 })).toEqual(["Đã thu hồi"]);
  });
});

const order: OrderRow = {
  order_code: 1000007,
  provider: "payos",
  plan: "monthly",
  amount: 50000,
  amount_paid: 50000,
  currency: "VND",
  email: "khach@example.com",
  status: "paid",
  grant_kind: "new",
  license_id: null,
  renew_license_id: null,
  created_at: NOW - 100,
  paid_at: NOW - 50,
  email_sent_at: null,
  email_gave_up_at: null,
};

/** Ô "Số tiền" của một đơn: nội dung chữ và phần tử mờ (chưa nhận tiền) nếu có. */
function amountCell(o: OrderRow) {
  const col = orderColumns(NOW).find((c) => c.header === "Số tiền");
  if (!col) throw new Error("thiếu cột Số tiền");
  const { container } = render(<>{col.cell(o)}</>);
  return { text: container.textContent, dim: container.querySelector(".cell-none") };
}

describe("orderColumns: Số tiền theo loại tiền của đơn", () => {
  it("VND (PayOS): đồng, dấu chấm ngăn nghìn", () => {
    expect(amountCell(order).text).toBe("50.000 đ");
  });

  it("USD (Creem): số cent thành đô la, không bao giờ hiện 399 đ", () => {
    expect(amountCell({ ...order, provider: "creem", currency: "USD", amount: 399, amount_paid: 399 }).text).toBe("$3,99");
  });

  it("USD chưa nhận tiền: số cần trả ở chữ mờ, lời chú cùng loại tiền", () => {
    const { text, dim } = amountCell({ ...order, currency: "USD", amount: 399, amount_paid: 0, status: "pending" });
    expect(text).toBe("$3,99");
    expect(dim?.getAttribute("title")).toBe("Chưa nhận tiền, cần trả $3,99 (chưa gồm thuế)");
  });

  // Phản hồi thiếu loại tiền (fixture cũ, Worker admin bản trước): theo đồng, không hiện "undefined", "null" hay chuỗi trống (T4 (2)).
  it.each([undefined, null, ""])("đơn thiếu loại tiền (%s): cột Số tiền theo đồng", (currency) => {
    const o = { ...order, currency } as unknown as OrderRow;
    expect(amountCell(o).text).toBe("50.000 đ");
    expect(amountCell({ ...o, amount_paid: 30000 }).text).toContain("thiếu 20.000 đ");
    expect(amountCell({ ...o, amount_paid: 0, status: "pending" }).dim?.getAttribute("title")).toBe("Chưa nhận tiền, cần trả 50.000 đ");
  });

  it("VND nhận thiếu hay dư: số đồng, không đơn vị đô la", () => {
    expect(amountCell({ ...order, amount_paid: 20000, status: "underpaid" }).text).toBe("20.000 đ / 50.000 đthiếu 30.000 đ");
    expect(amountCell({ ...order, amount_paid: 60000 }).text).toContain("dư 10.000 đ");
  });

  it("VND chưa nhận tiền: lời chú không nói thuế (chỉ đơn USD có giá niêm yết chưa gồm thuế)", () => {
    const { dim } = amountCell({ ...order, amount_paid: 0, status: "pending" });
    expect(dim?.getAttribute("title")).toBe("Chưa nhận tiền, cần trả 50.000 đ");
  });

  it("cột Trạng thái: đơn Creem underpaid không bị gọi là chuyển thiếu; đơn PayOS giữ nhãn Chuyển thiếu", () => {
    const col = orderColumns(NOW).find((c) => c.header === "Trạng thái");
    if (!col) throw new Error("thiếu cột Trạng thái");
    const label = (o: OrderRow) => {
      const { container, unmount } = render(<>{col.cell(o)}</>);
      const text = container.textContent;
      unmount();
      return text;
    };
    expect(label({ ...order, status: "underpaid" })).toBe("Chuyển thiếu");
    expect(label({ ...order, provider: "creem", currency: "USD", status: "underpaid" })).toBe("Trả thấp hơn giá");
  });

  it("USD nhận thiếu hay dư: mọi số cùng loại tiền", () => {
    const short = amountCell({ ...order, currency: "USD", amount: 2199, amount_paid: 2000, status: "underpaid" }).text;
    expect(short).toContain("$20,00");
    expect(short).toContain("/ $21,99");
    expect(short).toContain("thiếu $1,99");
    expect(amountCell({ ...order, currency: "USD", amount: 399, amount_paid: 500 }).text).toContain("dư $1,01");
  });
});
