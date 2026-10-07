import { describe, expect, it } from "vitest";
import { matchRoute } from "./router";

const ID = "0b9e7c1e-5f3a-4c1d-9a7e-2f1d3c4b5a69";
const HASH = "a".repeat(64);

describe("matchRoute", () => {
  it.each([
    ["/", { name: "queue" }],
    ["/search", { name: "search" }],
    ["/orders", { name: "orders" }],
    ["/orders/1000012", { name: "order", param: "1000012" }],
    ["/licenses", { name: "licenses" }],
    [`/licenses/${ID}`, { name: "license", param: ID }],
    [`/devices/${HASH}`, { name: "device", param: HASH }],
    ["/trials", { name: "trials" }],
    ["/audit", { name: "audit" }],
    ["/tools", { name: "tools" }],
    ["/orders/", { name: "orders" }],
    ["/orders/abc", { name: "not_found" }],
    ["/licenses/khong-phai-uuid", { name: "not_found" }],
    ["/khong-co", { name: "not_found" }],
  ])("%s", (path, route) => {
    expect(matchRoute(path)).toEqual(route);
  });
});
