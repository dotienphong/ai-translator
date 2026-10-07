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
    underpaid: "Chuyển thiếu",
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
});
