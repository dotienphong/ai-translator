// Test của notices.mjs: `node --test "scripts/release/*.test.mjs"`.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { licenseFiles, mergeAbout, npmPackages, renderNotices, spdxAllowed, tomlStringArray } from "./notices.mjs";

const root = join(import.meta.dirname, "..", "..");
const ALLOW = ["Apache-2.0", "MIT", "Apache-2.0 WITH LLVM-exception", "BSD-3-Clause"];

test("about.toml nhận đúng các giấy phép deny.toml cho phép", () => {
  const allow = tomlStringArray(readFileSync(join(root, "deny.toml"), "utf8"), "licenses", "allow");
  const accepted = tomlStringArray(readFileSync(join(root, "about.toml"), "utf8"), "", "accepted");
  assert.ok(allow.includes("MIT") && allow.length > 5);
  assert.deepEqual([...accepted].sort(), [...allow].sort());
});

test("đọc mảng chuỗi trong TOML theo mục", () => {
  const toml = 'x = ["a"]\n\n[licenses]\n# chú thích\nallow = [\n    "MIT",\n    "Zlib",\n]\n[bans]\nallow = ["no"]\n';
  assert.deepEqual(tomlStringArray(toml, "licenses", "allow"), ["MIT", "Zlib"]);
  assert.deepEqual(tomlStringArray(toml, "", "x"), ["a"]);
  assert.throws(() => tomlStringArray(toml, "graph", "targets"), /không có \[graph\]/);
});

test("biểu thức SPDX: OR cần một vế, AND cần mọi vế, WITH là một giấy phép", () => {
  assert.equal(spdxAllowed("MIT", ALLOW), true);
  assert.equal(spdxAllowed("Apache-2.0 OR MIT", ALLOW), true);
  assert.equal(spdxAllowed("GPL-3.0-only OR MIT", ALLOW), true);
  assert.equal(spdxAllowed("GPL-3.0-only", ALLOW), false);
  assert.equal(spdxAllowed("MIT AND GPL-3.0-only", ALLOW), false);
  assert.equal(spdxAllowed("(MIT OR Apache-2.0) AND BSD-3-Clause", ALLOW), true);
  assert.equal(spdxAllowed("(MIT OR Apache-2.0) AND ISC", ALLOW), false);
  assert.equal(spdxAllowed("Apache-2.0 WITH LLVM-exception", ALLOW), true);
  assert.equal(spdxAllowed("GPL-2.0 WITH Classpath-exception-2.0", ALLOW), false);
  // Ngoại lệ đi cùng giấy phép thành một mục riêng: MIT được phép không có nghĩa "MIT WITH <ngoại lệ>" được phép.
  assert.equal(spdxAllowed("MIT WITH Unknown-exception", ALLOW), false);
  assert.throws(() => spdxAllowed("(MIT", ALLOW), /thiếu "\)"/);
  assert.throws(() => spdxAllowed("MIT MIT", ALLOW), /hỏng/);
});

const crate = (name, version) => ({ crate: { name, version } });

test("gộp hai lần chạy cargo-about theo văn bản, mỗi crate một lần", () => {
  const app = {
    licenses: [
      { id: "MIT", name: "MIT License", text: "mit text A", used_by: [crate("serde", "1.0.229"), crate("log", "0.4.34")] },
      { id: "Apache-2.0", name: "Apache License 2.0", text: "apache", used_by: [crate("serde", "1.0.229")] },
    ],
  };
  const worker = {
    licenses: [
      { id: "MIT", name: "MIT License", text: "mit text A", used_by: [crate("serde", "1.0.229"), crate("libc", "0.2.189")] },
      { id: "MIT", name: "MIT License", text: "mit text B", used_by: [crate("anyhow", "1.0.104")] },
    ],
  };
  assert.deepEqual(mergeAbout([app, worker]), [
    { id: "Apache-2.0", name: "Apache License 2.0", text: "apache", crates: ["serde 1.0.229"] },
    { id: "MIT", name: "MIT License", text: "mit text B", crates: ["anyhow 1.0.104"] },
    { id: "MIT", name: "MIT License", text: "mit text A", crates: ["libc 0.2.189", "log 0.4.34", "serde 1.0.229"] },
  ]);
});

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "notices-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("gói npm: đọc mọi file giấy phép; giấy phép lạ hay thiếu file là lỗi", (t) => {
  const ok = tempDir(t);
  writeFileSync(join(ok, "LICENSE_MIT"), "mit");
  writeFileSync(join(ok, "LICENSE_APACHE-2.0"), "apache");
  writeFileSync(join(ok, "README.md"), "readme");
  const bare = tempDir(t);
  assert.deepEqual(licenseFiles(ok), ["LICENSE_APACHE-2.0", "LICENSE_MIT"]);
  const listing = {
    "Apache-2.0 OR MIT": [{ name: "@tauri-apps/api", versions: ["2.12.1"], paths: [ok], license: "Apache-2.0 OR MIT" }],
    "GPL-3.0-only": [{ name: "gpl-pkg", versions: ["1.0.0"], paths: [bare], license: "GPL-3.0-only" }],
    MIT: [{ name: "zustand", versions: ["5.0.15"], paths: [join(bare, "missing")], license: "MIT" }],
  };
  const { packages, errors } = npmPackages(listing, ALLOW);
  assert.deepEqual(packages, [
    { name: "@tauri-apps/api", version: "2.12.1", license: "Apache-2.0 OR MIT", texts: ["apache", "mit"] },
    { name: "gpl-pkg", version: "1.0.0", license: "GPL-3.0-only", texts: [] },
  ]);
  assert.deepEqual(errors, [
    "gpl-pkg: giấy phép GPL-3.0-only không có trong deny.toml",
    `gpl-pkg: không có file giấy phép trong ${bare}`,
    `zustand: không thấy ${join(bare, "missing")} (chạy pnpm install --frozen-lockfile trước)`,
  ]);
});

test("văn bản có đủ ba phần, theo thứ tự", (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "LICENSE"), "MIT License\n\nCopyright (c) whisper.cpp authors\n");
  const text = renderNotices({
    rust: [{ id: "MIT", name: "MIT License", text: "\nmit body\n", crates: ["log 0.4.34", "serde 1.0.229"] }],
    npm: [{ name: "react", version: "19.3.0", license: "MIT", texts: ["react mit\n"] }],
    native: [
      { title: "whisper.cpp 1.8.3 and ggml (MIT) - in asr-worker", files: [join(dir, "LICENSE")] },
      { title: "Public domain components in llama-server", text: "stb_image (public domain or MIT)\n" },
    ],
  });
  const rule = "=".repeat(78);
  const line = "-".repeat(78);
  assert.equal(
    text,
    [
      "AI Translator - third-party software notices",
      "Generated by scripts/release/notices.mjs from Cargo.lock, pnpm-lock.yaml and the pinned native sources.",
      "",
      rule,
      "Rust crates (1 license texts)",
      rule,
      "",
      line,
      "MIT License (MIT)",
      "Used by: log 0.4.34, serde 1.0.229",
      line,
      "",
      "mit body",
      "",
      rule,
      "JavaScript packages (1)",
      rule,
      "",
      line,
      "react 19.3.0 (MIT)",
      line,
      "",
      "react mit",
      "",
      rule,
      "Native libraries and models",
      rule,
      "",
      line,
      "whisper.cpp 1.8.3 and ggml (MIT) - in asr-worker",
      line,
      "",
      "MIT License\n\nCopyright (c) whisper.cpp authors",
      "",
      line,
      "Public domain components in llama-server",
      line,
      "",
      "stb_image (public domain or MIT)",
      "",
      "",
    ].join("\n"),
  );
});
