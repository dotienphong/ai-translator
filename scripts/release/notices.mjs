#!/usr/bin/env node
// Sinh THIRD_PARTY_NOTICES.txt (spec §10.1; kế hoạch 07a): giấy phép của mọi thư viện đi vào bản phát hành.
//   - Rust: `cargo about generate --format json --frozen` cho app và cho asr-worker (hai binary được phát hành có code
//     Rust), gộp theo văn bản giấy phép. `about.toml` chỉ nhận các giấy phép trong `[licenses] allow` của deny.toml.
//   - JavaScript: `pnpm licenses list --prod --json` (gói nằm trong giao diện đã build), văn bản lấy từ file LICENSE của
//     từng gói. Giấy phép phải nằm trong allow-list của deny.toml.
//   - C/C++ trong tiến trình phụ: whisper.cpp và ggml (third_party/), llama.cpp cùng các thư viện nó nhúng (mã nguồn đã
//     clone ở --llama-src, đúng commit khóa trong versions.env).
//   - Model: Hy-MT2, trọng số Whisper, Silero VAD (licenses/models/).
//
//   node scripts/release/notices.mjs --out THIRD_PARTY_NOTICES.txt --llama-src <thư mục llama.cpp>
//   node scripts/release/notices.mjs --out <file> --no-llama     # CI kiểm giấy phép, chưa có mã nguồn llama.cpp
//
// Không dùng mạng: cargo-about chạy `--frozen`, chỉ đọc file trong cache của cargo.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { readVersions, root } from "./versions.mjs";

/** So chuỗi theo mã ký tự, không theo locale, để thứ tự giống nhau trên mọi máy. */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Danh sách chuỗi trong mảng `key = [ ... ]` đầu tiên sau dòng `[section]` (hay ở gốc file khi `section` rỗng). */
export function tomlStringArray(text, section, key) {
  let body = text;
  if (section) {
    const start = text.indexOf(`\n[${section}]`);
    if (start < 0) throw new Error(`không có [${section}]`);
    body = text.slice(start + 1);
  }
  const match = body.match(new RegExp(`^${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m"));
  if (!match) throw new Error(`không có ${key}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Biểu thức SPDX (`A OR B`, `A AND B`, có ngoặc) có hợp với allow-list không: OR cần một vế, AND cần mọi vế. */
export function spdxAllowed(expression, allow) {
  const tokens = expression.replace(/\(/g, " ( ").replace(/\)/g, " ) ").trim().split(/\s+/);
  let i = 0;
  const primary = () => {
    if (tokens[i] === "(") {
      i++;
      const value = orExpr();
      if (tokens[i++] !== ")") throw new Error(`thiếu ")" trong ${expression}`);
      return value;
    }
    let id = tokens[i++];
    if (id === undefined) throw new Error(`biểu thức SPDX hỏng: ${expression}`);
    if (tokens[i] === "WITH") {
      id = `${id} WITH ${tokens[i + 1]}`;
      i += 2;
    }
    return allow.includes(id);
  };
  const andExpr = () => {
    let value = primary();
    while (tokens[i] === "AND") {
      i++;
      value = primary() && value;
    }
    return value;
  };
  const orExpr = () => {
    let value = andExpr();
    while (tokens[i] === "OR") {
      i++;
      value = andExpr() || value;
    }
    return value;
  };
  const value = orExpr();
  if (i !== tokens.length) throw new Error(`biểu thức SPDX hỏng: ${expression}`);
  return value;
}

/** Gộp output JSON của nhiều lần chạy cargo-about: mỗi văn bản giấy phép một mục, kèm danh sách crate dùng nó. */
export function mergeAbout(reports) {
  const byText = new Map();
  for (const report of reports) {
    for (const license of report.licenses) {
      const key = `${license.id}\n${license.text}`;
      const entry = byText.get(key) ?? { id: license.id, name: license.name, text: license.text, crates: new Set() };
      for (const use of license.used_by) entry.crates.add(`${use.crate.name} ${use.crate.version}`);
      byText.set(key, entry);
    }
  }
  return [...byText.values()]
    .map((entry) => ({ ...entry, crates: [...entry.crates].sort(cmp) }))
    .sort((a, b) => cmp(a.id, b.id) || cmp(a.crates[0], b.crates[0]));
}

/** File giấy phép trong thư mục của một gói npm (LICENSE, LICENSE.md, LICENSE-MIT, LICENCE, COPYING…). */
export function licenseFiles(dir) {
  return readdirSync(dir)
    .filter((name) => /^(licen[cs]e|copying)/i.test(name))
    .sort(cmp);
}

/** Gói npm của giao diện: [{name, version, license, texts}]. Lỗi khi giấy phép ngoài allow-list hay gói không có file. */
export function npmPackages(listing, allow) {
  const errors = [];
  const packages = [];
  for (const group of Object.values(listing)) {
    for (const pkg of group) {
      if (!spdxAllowed(pkg.license, allow)) errors.push(`${pkg.name}: giấy phép ${pkg.license} không có trong deny.toml`);
      const dir = pkg.paths[0];
      if (!existsSync(dir)) {
        errors.push(`${pkg.name}: không thấy ${dir} (chạy pnpm install --frozen-lockfile trước)`);
        continue;
      }
      const files = licenseFiles(dir);
      if (files.length === 0) errors.push(`${pkg.name}: không có file giấy phép trong ${dir}`);
      packages.push({
        name: pkg.name,
        version: pkg.versions.join(", "),
        license: pkg.license,
        texts: files.map((file) => readFileSync(join(dir, file), "utf8")),
      });
    }
  }
  packages.sort((a, b) => cmp(a.name, b.name));
  return { packages, errors };
}

/** Thư viện C/C++ và model: [{title, files: [đường dẫn]}] hoặc [{title, text}]. */
export function nativeComponents(llamaSrc, llamaTag) {
  const items = [
    {
      title: "whisper.cpp 1.8.3 and ggml (MIT) - in asr-worker",
      files: [join(root, "third_party/whisper-rs-sys/whisper.cpp/LICENSE")],
    },
  ];
  if (llamaSrc) {
    const at = (path) => join(llamaSrc, path);
    items.push(
      { title: `llama.cpp ${llamaTag} and ggml (MIT) - in llama-server`, files: [at("LICENSE")] },
      { title: "cpp-httplib (MIT) - in llama-server", files: [at("vendor/cpp-httplib/LICENSE")] },
      { title: "nlohmann/json (MIT) - in llama-server", files: [at("licenses/LICENSE-jsonhpp")] },
      { title: "xxHash (BSD-2-Clause) - in llama-server", files: [at("vendor/hash/xxhash/LICENSE")] },
      { title: "rotate-bits (MIT) - in llama-server", files: [at("vendor/hash/rotate-bits/LICENSE.md")] },
      {
        title: "Public domain components in llama-server",
        text:
          "stb_image (public domain or MIT), miniaudio (public domain or MIT-0), subprocess.h by sheredom (Unlicense),\n" +
          "SHA-1 by Steve Reid (public domain), SHA-256 by Igor Pavlov (public domain).\n",
      },
    );
  }
  items.push(
    {
      title: "Vulkan-Headers, Vulkan SDK 1.4.363.0 (Apache-2.0 OR MIT) - in asr-worker-vulkan and ggml-vulkan.dll (Windows)",
      files: [join(root, "licenses/native/Vulkan-Headers-LICENSE.md"), join(root, "licenses/native/Vulkan-Headers-MIT.txt")],
    },
    {
      title: "FLEURS sample sentence of the listen test (CC BY 4.0), Google",
      files: [join(root, "public/listen-test-en.LICENSE.txt")],
    },
    {
      title: "Hy-MT2-1.8B-GGUF translation model (Apache-2.0), Tencent",
      files: [join(root, "licenses/models/Hy-MT2-LICENSE.txt")],
    },
    { title: "Whisper model weights (MIT), OpenAI", files: [join(root, "licenses/models/whisper-LICENSE.txt")] },
    { title: "Silero VAD v6.2.3 (MIT)", files: [join(root, "licenses/models/silero-vad-LICENSE.txt")] },
  );
  return items;
}

const RULE = "=".repeat(78);
const LINE = "-".repeat(78);

/** Văn bản THIRD_PARTY_NOTICES. */
export function renderNotices({ rust, npm, native }) {
  const out = [];
  out.push("AI Translator - third-party software notices");
  out.push("Generated by scripts/release/notices.mjs from Cargo.lock, pnpm-lock.yaml and the pinned native sources.");
  out.push("");
  out.push(RULE, `Rust crates (${rust.length} license texts)`, RULE, "");
  for (const license of rust) {
    out.push(LINE, `${license.name} (${license.id})`, `Used by: ${license.crates.join(", ")}`, LINE, "");
    out.push(license.text.trim(), "");
  }
  out.push(RULE, `JavaScript packages (${npm.length})`, RULE, "");
  for (const pkg of npm) {
    out.push(LINE, `${pkg.name} ${pkg.version} (${pkg.license})`, LINE, "");
    for (const text of pkg.texts) out.push(text.trim(), "");
  }
  out.push(RULE, "Native libraries and models", RULE, "");
  for (const item of native) {
    out.push(LINE, item.title, LINE, "");
    const texts = item.text !== undefined ? [item.text] : item.files.map((file) => readFileSync(file, "utf8"));
    for (const text of texts) out.push(text.trim(), "");
  }
  return `${out.join("\n")}\n`;
}

function cargoAbout(manifest) {
  const json = execFileSync(
    "cargo",
    ["about", "generate", "--format", "json", "--frozen", "--fail", "--all-features", "-c", "about.toml", "-m", manifest],
    { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  return JSON.parse(json);
}

export function main(argv) {
  const args = [...argv];
  const outIndex = args.indexOf("--out");
  if (outIndex < 0 || !args[outIndex + 1]) throw new Error("thiếu --out <file>");
  const out = args[outIndex + 1];
  const llamaIndex = args.indexOf("--llama-src");
  const noLlama = args.includes("--no-llama");
  if ((llamaIndex < 0) === !noLlama) throw new Error("cần đúng một trong --llama-src <thư mục> và --no-llama");
  const llamaSrc = llamaIndex >= 0 ? args[llamaIndex + 1] : null;
  const env = readVersions();
  if (llamaSrc) {
    const head = execFileSync("git", ["-C", llamaSrc, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (head !== env.LLAMA_CPP_COMMIT) throw new Error(`llama.cpp ở ${head}, versions.env khóa ${env.LLAMA_CPP_COMMIT}`);
  }

  const allow = tomlStringArray(readFileSync(join(root, "deny.toml"), "utf8"), "licenses", "allow");
  const accepted = tomlStringArray(readFileSync(join(root, "about.toml"), "utf8"), "", "accepted");
  const errors = [];
  if (JSON.stringify([...accepted].sort()) !== JSON.stringify([...allow].sort())) {
    errors.push("about.toml `accepted` khác deny.toml `[licenses] allow`");
  }
  const rust = mergeAbout([cargoAbout("src-tauri/Cargo.toml"), cargoAbout("crates/asr-worker/Cargo.toml")]);
  const listing = JSON.parse(
    execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], { cwd: root, encoding: "utf8", shell: process.platform === "win32" }),
  );
  const npm = npmPackages(listing, allow);
  errors.push(...npm.errors);
  const native = nativeComponents(llamaSrc, env.LLAMA_CPP_TAG);
  for (const item of native) for (const file of item.files ?? []) if (!existsSync(file)) errors.push(`thiếu ${file}`);
  if (errors.length === 0) {
    writeFileSync(out, renderNotices({ rust, npm: npm.packages, native }));
    const crates = new Set(rust.flatMap((license) => license.crates)).size;
    console.log(
      `${out}: ${rust.length} văn bản giấy phép Rust (${crates} crate), ${npm.packages.length} gói npm, ${native.length} mục C/C++ và model`,
    );
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const errors = main(process.argv.slice(2));
    for (const error of errors) console.error(`LỖI: ${error}`);
    process.exitCode = errors.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
