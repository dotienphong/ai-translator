// Đọc scripts/release/versions.env (dòng `TÊN=giá trị`, như `sh` nạp) cho các script Node của kế hoạch 07a.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const root = join(import.meta.dirname, "..", "..");

export function parseVersions(text) {
  const versions = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) versions[match[1]] = match[2].trim();
  }
  return versions;
}

export function readVersions() {
  return parseVersions(readFileSync(join(root, "scripts/release/versions.env"), "utf8"));
}
