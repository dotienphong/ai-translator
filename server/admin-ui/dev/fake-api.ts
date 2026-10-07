import type { Plugin } from "vite";

export function fakeAdminApi(): Plugin {
  return { name: "fake-admin-api", apply: "serve" };
}
