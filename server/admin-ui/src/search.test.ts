import { describe, expect, it } from "vitest";
import type { LicenseDetail, LookupResult, OrderRow } from "./api/types";
import { detectQuery, singleTarget } from "./search";

const ID = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const KEY = "K7Q2-M4XB-9TRD-0HZC-5WEF-8NPA-9XMB";

describe("detectQuery (spec Web Admin §4.3)", () => {
  it.each([
    ["  Khach@Example.com ", { email: "Khach@Example.com" }],
    ["1000012", { order_code: 1000012 }],
    [ID.toUpperCase(), { license_id: ID }],
    ["A".repeat(64), { device_id_hash: "a".repeat(64) }],
    [KEY, { license_key: KEY }],
    [KEY.replace(/-/g, "").toLowerCase(), { license_key: KEY.replace(/-/g, "").toLowerCase() }],
    ["abc", null],
    ["", null],
    ["   ", null],
  ])("%s", (raw, expected) => {
    expect(detectQuery(raw)).toEqual(expected);
  });
});

describe("singleTarget", () => {
  const lic = { id: ID } as LicenseDetail;
  const order = (license_id: string | null, renew_license_id: string | null = null) =>
    ({ order_code: 1, license_id, renew_license_id }) as OrderRow;

  it("một license, mọi đơn thuộc license đó: mở trang license", () => {
    expect(singleTarget({ licenses: [lic], orders: [order(ID), order(null, ID)] } as LookupResult)).toBe(`/licenses/${ID}`);
  });

  it("có đơn chưa thuộc license nào, hay nhiều license: ở lại trang kết quả", () => {
    expect(singleTarget({ licenses: [lic], orders: [order(null)] } as LookupResult)).toBeNull();
    expect(singleTarget({ licenses: [lic, { id: "khac" } as LicenseDetail], orders: [] } as LookupResult)).toBeNull();
    expect(singleTarget({ licenses: [], orders: [] } as LookupResult)).toBeNull();
  });
});
