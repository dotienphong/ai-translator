import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Activation, LicenseDetail, LicenseRow } from "../api/types";
import { activeDevices, licenseColumns } from "./columns";

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
