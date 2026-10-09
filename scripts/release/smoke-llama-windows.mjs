#!/usr/bin/env node
// Kiểm khởi động llama-server Windows vừa build bằng một model GGUF nhỏ (stories260K, ghim URL và SHA-256 trong
// versions.env). Bản 0.1.1 build llama.cpp với CRT tĩnh: `llama-server --version` vẫn chạy, nhưng vừa nạp model là chết
// (0xc0000409 trong llama.dll) và không ai biết vì CI chưa từng nạp model. Script này nạp model, chờ /health, gọi
// /completion một lần, cho cả `-ngl 0` (CPU) lẫn `-ngl auto` (như app: GPU nếu có, không có thì CPU).
//
//   node scripts/release/smoke-llama-windows.mjs <thư mục có llama-server>   # src-tauri/binaries hay thư mục đã cài
//
// Chạy trong job không secret (cùng job build). Model tải về thư mục tạm (MT_SMOKE_DIR), kiểm SHA-256 trước khi dùng.
// Server chỉ nghe 127.0.0.1 trên cổng tạm.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { TRIPLE } from "./build-sidecars-windows.mjs";
import { readVersions } from "./versions.mjs";

/** File chạy của llama-server trong `dir`: tên có triple (binaries/) hoặc tên sau khi cài. */
export function findServer(dir, exists = existsSync) {
  for (const name of [`llama-server-${TRIPLE}.exe`, "llama-server.exe"]) {
    if (exists(join(dir, name))) return join(dir, name);
  }
  throw new Error(`không thấy llama-server trong ${dir}`);
}

/** Tham số chạy server (giống app: `crates/pipeline/src/llama.rs`, thêm `-c` nhỏ cho model thử). */
export function serverArgs(model, port, ngl) {
  return ["-m", model, "--host", "127.0.0.1", "--port", String(port), "-c", "512", "-np", "1", "-ngl", ngl, "--no-ui"];
}

/** Mã thoát của tiến trình, dạng dễ đọc: Windows trả số có dấu, nên đổi về không dấu 32 bit và in thập lục phân. */
export function describeExit(code, signal) {
  if (code === null || code === undefined) return `bị tín hiệu ${signal ?? "không rõ"}`;
  return `mã thoát 0x${(code >>> 0).toString(16)}`;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Tải model thử về `dir` (dùng lại nếu đã có và đúng SHA-256), trả đường dẫn. */
export async function fetchModel(dir, { url, sha256: expected }) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `smoke-${expected.slice(0, 12)}.gguf`);
  if (existsSync(path) && sha256(readFileSync(path)) === expected) return path;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`tải ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`model thử có SHA-256 ${actual}, versions.env khóa ${expected}`);
  writeFileSync(path, bytes);
  return path;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Chạy server một lần với `-ngl <ngl>`: chờ /health, gọi /completion; ném lỗi (kèm đuôi stderr) nếu server chết hay không trả lời. */
export async function smoke(exe, model, ngl, { readyMs = 120_000 } = {}) {
  const port = await freePort();
  const child = spawn(exe, serverArgs(model, port, ngl), {
    cwd: join(exe, ".."),
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  let exited = null;
  child.once("exit", (code, signal) => {
    exited = describeExit(code, signal);
  });
  child.once("error", (error) => {
    exited = `không chạy được: ${error.message}`;
  });
  const fail = (what) => new Error(`-ngl ${ngl}: ${what}\n--- stderr (đuôi) ---\n${stderr.trim()}`);
  try {
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + readyMs;
    for (;;) {
      if (exited) throw fail(`llama-server thoát sớm (${exited}) khi nạp model`);
      if (Date.now() > deadline) throw fail(`quá ${readyMs / 1000} giây mà /health chưa sẵn sàng`);
      try {
        if ((await fetch(`${base}/health`)).ok) break;
      } catch {
        // chưa nghe cổng
      }
      await sleep(250);
    }
    const reply = await fetch(`${base}/completion`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Once upon a time", n_predict: 8, temperature: 0 }),
    });
    if (!reply.ok) throw fail(`/completion trả HTTP ${reply.status}`);
    const body = await reply.json();
    if (typeof body.content !== "string" || body.content.length === 0) throw fail("/completion không trả chữ nào");
    if (exited) throw fail(`llama-server thoát (${exited}) sau khi trả lời`);
    return body.content;
  } finally {
    child.kill();
  }
}

export async function main(argv) {
  const dir = argv[0];
  if (!dir) throw new Error("dùng: node scripts/release/smoke-llama-windows.mjs <thư mục có llama-server>");
  if (process.platform !== "win32") throw new Error("chỉ chạy trên Windows");
  const versions = readVersions();
  const exe = resolve(findServer(dir));
  const model = await fetchModel(process.env.MT_SMOKE_DIR ?? join(tmpdir(), "mt-smoke"), {
    url: versions.SMOKE_MODEL_URL,
    sha256: versions.SMOKE_MODEL_SHA256,
  });
  console.log(`llama-server: ${exe}\nmodel thử: ${model}`);
  for (const ngl of ["0", "auto"]) {
    const text = await smoke(exe, model, ngl);
    console.log(`-ngl ${ngl}: nạp model, /health và /completion đều đạt (${JSON.stringify(text.slice(0, 40))})`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  });
}
