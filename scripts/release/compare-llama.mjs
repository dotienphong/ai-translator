#!/usr/bin/env node
// So hai bản llama-server trên cùng model (R11 của kế hoạch 00): chạy lần lượt từng bản với đúng cờ app dùng
// (crates/pipeline/src/llama.rs), dịch vài câu cố định với temperature 0, rồi so từng chữ và số token. Khác nhau thì thoát
// mã 1. Dùng khi thay bản chính thức b11146 bằng bản tự build của kế hoạch 07a, và mỗi lần nâng llama.cpp.
//
//   node scripts/release/compare-llama.mjs <llama-server A> <llama-server B> <model .gguf> [--cpu]
//
// --cpu: chạy với -ngl 0 (đường CPU, như app khi GPU lỗi). Không cần mạng; server chỉ nghe 127.0.0.1.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";

export const SENTENCES = [
  ["en", "vi", "Let's move the release to next Tuesday so the team has time to fix the login bug."],
  ["zh", "vi", "我们下周二之前需要把预算报告发给财务部。"],
  ["ja", "en", "この件については、来週の会議でもう一度話し合いましょう。"],
  ["vi", "en", "Chúng ta cần thêm hai người cho dự án này trước cuối tháng."],
  ["ko", "vi", "회의록은 오늘 오후까지 공유해 주세요."],
];

const NAMES = { en: "English", vi: "Vietnamese", zh: "Chinese", ja: "Japanese", ko: "Korean" };

/** Câu lệnh dịch theo mẫu của Hy-MT2 (không kèm thuật ngữ). */
export function translationPrompt(target, text) {
  return `Translate the following segment into ${NAMES[target]}, without additional explanation.\n\n${text}`;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitHealthy(base, key, child) {
  for (let i = 0; i < 600; i++) {
    if (child.exitCode !== null) throw new Error(`llama-server thoát sớm, mã ${child.exitCode}`);
    try {
      const res = await fetch(`${base}/health`, { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) return;
    } catch {
      // chưa nghe
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("llama-server không sẵn sàng sau 60 giây");
}

async function post(base, key, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** Chạy một bản llama-server, dịch mọi câu, trả [{text, tokens}]. */
export async function runServer(binary, model, cpu) {
  const port = await freePort();
  const key = randomBytes(16).toString("hex");
  const args = ["-m", model, "--host", "127.0.0.1", "--port", String(port), "-c", "2048", "-np", "1"];
  args.push("-ngl", cpu ? "0" : "auto", "--no-ui");
  const child = spawn(binary, args, { env: { ...process.env, LLAMA_API_KEY: key }, stdio: ["ignore", "ignore", "pipe"] });
  let log = "";
  child.stderr.on("data", (d) => {
    log = (log + d).slice(-4000);
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitHealthy(base, key, child);
    const out = [];
    for (const [, target, text] of SENTENCES) {
      const reply = await post(base, key, "/v1/chat/completions", {
        messages: [{ role: "user", content: translationPrompt(target, text) }],
        temperature: 0,
        top_k: 1,
        seed: 1,
        max_tokens: 96,
        stream: false,
      });
      const content = reply.choices[0].message.content;
      const tokens = (await post(base, key, "/tokenize", { content })).tokens.length;
      out.push({ text: content, tokens });
    }
    return out;
  } catch (error) {
    throw new Error(`${error.message}\n--- stderr của llama-server ---\n${log}`);
  } finally {
    child.kill();
  }
}

/** Các dòng khác nhau giữa hai kết quả. */
export function differences(a, b) {
  const diffs = [];
  for (let i = 0; i < SENTENCES.length; i++) {
    if (a[i].text !== b[i].text || a[i].tokens !== b[i].tokens) {
      diffs.push(`câu ${i + 1}: A ${JSON.stringify(a[i])} / B ${JSON.stringify(b[i])}`);
    }
  }
  return diffs;
}

async function main(argv) {
  const cpu = argv.includes("--cpu");
  const [a, b, model] = argv.filter((x) => x !== "--cpu");
  if (!a || !b || !model) throw new Error("cần: <llama-server A> <llama-server B> <model .gguf> [--cpu]");
  const ra = await runServer(a, model, cpu);
  const rb = await runServer(b, model, cpu);
  SENTENCES.forEach(([src, tgt], i) => console.log(`${i + 1}. ${src}->${tgt} (${ra[i].tokens} token): ${ra[i].text}`));
  const diffs = differences(ra, rb);
  for (const d of diffs) console.error(`KHÁC: ${d}`);
  console.log(diffs.length === 0 ? `giống nhau cả ${SENTENCES.length} câu` : `${diffs.length} câu khác nhau`);
  return diffs.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (error) => {
      console.error(`LỖI: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
