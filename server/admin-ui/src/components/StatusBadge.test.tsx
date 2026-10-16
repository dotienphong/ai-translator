import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OrderStatus } from "../api/types";
import { LicenseBadges, OrderStatusBadge } from "./StatusBadge";

const NOW = 1_790_000_000;
const alive = { revoked_at: null, expires_at: NOW + 86_400, locked_at: null, conflict: false };

const labels = () => Array.from(document.querySelectorAll(".badge")).map((b) => b.textContent);

describe("LicenseBadges", () => {
  it("đã thu hồi: chỉ hiện Đã thu hồi, không hiện Khóa tạm, Xung đột máy hay Còn hạn", () => {
    render(<LicenseBadges license={{ ...alive, revoked_at: NOW - 10, locked_at: NOW - 20, conflict: true }} now={NOW} />);
    expect(labels()).toEqual(["Đã thu hồi"]);
    expect(screen.queryByText("Khóa tạm")).toBeNull();
    expect(screen.queryByText("Xung đột máy")).toBeNull();
  });

  it("chưa thu hồi: khóa tạm và xung đột máy hiện cùng nhãn hạn dùng", () => {
    render(<LicenseBadges license={{ ...alive, locked_at: NOW - 20, conflict: true }} now={NOW} />);
    expect(labels()).toEqual(["Còn hạn", "Khóa tạm", "Xung đột máy"]);
  });

  it("chưa thu hồi, không khóa, không xung đột: chỉ nhãn hạn dùng", () => {
    render(<LicenseBadges license={alive} now={NOW} />);
    expect(labels()).toEqual(["Còn hạn"]);
  });

  it("hết hạn: hết hạn đúng lúc expires_at", () => {
    render(<LicenseBadges license={{ ...alive, expires_at: NOW }} now={NOW} />);
    expect(labels()).toEqual(["Hết hạn"]);
  });
});

describe("OrderStatusBadge", () => {
  const EXPECTED: Record<OrderStatus, string> = {
    pending: "Chờ trả",
    processing: "Đang xử lý",
    paid: "Đã trả",
    // Đổi nghĩa (p1 của rà B6): nhãn chung (bộ lọc, biểu đồ, danh sách theo trạng thái: có cả đơn thẻ) là nhãn trung lập.
    underpaid: "Trả thiếu hay lệch số tiền",
    cancelled: "Đã hủy",
    expired: "Hết hạn link",
    failed: "Lỗi",
    paid_needs_review: "Cần xử lý",
    refunded: "Đã hoàn tiền",
  };

  it("có đúng 9 trạng thái", () => {
    expect(Object.keys(EXPECTED)).toHaveLength(9);
  });

  it.each(Object.entries(EXPECTED) as [OrderStatus, string][])("%s hiện nhãn %s", (status, label) => {
    render(<OrderStatusBadge status={status} />);
    expect(labels()).toEqual([label]);
  });

  // Đơn Creem underpaid là Creem báo đã thu tiền mà thấp hơn giá (mã giảm giá, hay dữ liệu tiền hỏng), không phải "chuyển thiếu"
  // rồi chuyển bù: nhãn "Chuyển thiếu" chỉ đúng với VietQR (PayOS). Không có cổng (huy hiệu không biết) thì giữ nhãn chung.
  it.each([
    ["payos", "Chuyển thiếu"],
    [undefined, "Trả thiếu hay lệch số tiền"],
    ["creem", "Trả thấp hơn giá"],
    ["cong_la", "Trả thấp hơn giá"],
  ])("underpaid của cổng %s hiện nhãn %s", (provider, label) => {
    render(<OrderStatusBadge status="underpaid" provider={provider} />);
    expect(labels()).toEqual([label]);
  });

  it("cổng không đổi nhãn của trạng thái khác (đơn Creem đã trả vẫn là Đã trả)", () => {
    render(<OrderStatusBadge status="paid" provider="creem" />);
    expect(labels()).toEqual(["Đã trả"]);
  });
});
