// Giao tiếp trực tiếp với tiến trình phụ `tts-worker` trên Windows theo giao thức khung `u32 LE + postcard`
// (crates/tts-protocol/src/lib.rs), trả mẫu âm thanh 48 kHz mono Float32Array trong [-1, 1].
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TTS_SAMPLE_RATE = 48_000;

/** Mã hóa số nguyên không âm theo chuẩn LEB128 varint của postcard. */
export function encodeVarint(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`varint không hợp lệ: ${n}`);
  const out = [];
  let v = BigInt(n);
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return Uint8Array.from(out);
}

/** Đọc một LEB128 varint từ `buf` tại vị trí `offset`; trả `[value, nextOffset]`. */
export function decodeVarint(buf, offset) {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [Number(result), pos];
    shift += 7n;
  }
  throw new Error("khung postcard bị cụt khi đọc varint");
}

function encodeString(str) {
  const bytes = Buffer.from(str, "utf8");
  return Buffer.concat([Buffer.from(encodeVarint(bytes.length)), bytes]);
}

function encodeOptionString(str) {
  if (str === null || str === undefined) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), encodeString(str)]);
}

function encodeOptionF32(val) {
  if (val === null || val === undefined) return Buffer.from([0]);
  const buf = Buffer.alloc(5);
  buf[0] = 1;
  buf.writeFloatLE(val, 1);
  return buf;
}

function wrapFrame(body) {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

/** Mã hóa khung `Request::Speak` (variant 0, protocol v3). */
export function encodeSpeakFrame({ id, lang, text, voice = null, speed = null, pauseScale = null }) {
  const langByte = lang === "vi" ? 0 : lang === "en" ? 1 : -1;
  if (langByte < 0) throw new Error(`ngôn ngữ không hỗ trợ: ${lang}`);
  const body = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(encodeVarint(id)),
    Buffer.from([langByte]),
    encodeString(text),
    encodeOptionString(voice),
    encodeOptionF32(speed),
    encodeOptionF32(pauseScale),
  ]);
  return wrapFrame(body);
}

/** Mã hóa khung `Request::Shutdown` (variant 2). */
export function encodeShutdownFrame() {
  return wrapFrame(Buffer.from([2]));
}

/** Giải mã phần thân một khung `Response` từ `tts-worker`. */
export function decodeResponseFrame(body) {
  const [variant, p0] = decodeVarint(body, 0);
  if (variant === 0) {
    const [protocol] = decodeVarint(body, p0);
    return { kind: "ready", protocol };
  }
  if (variant === 1) {
    const [id, p1] = decodeVarint(body, p0);
    const [seq, p2] = decodeVarint(body, p1);
    const [len, p3] = decodeVarint(body, p2);
    const pcm = new Int16Array(len);
    let pos = p3;
    for (let i = 0; i < len; i++) {
      const [zz, next] = decodeVarint(body, pos);
      pos = next;
      pcm[i] = (zz >>> 1) ^ -(zz & 1);
    }
    return { kind: "audio", id, seq, pcm };
  }
  if (variant === 2) {
    const [id] = decodeVarint(body, p0);
    return { kind: "done", id };
  }
  if (variant === 3) {
    const [id, p1] = decodeVarint(body, p0);
    const [errorKind] = decodeVarint(body, p1);
    return { kind: "failed", id, errorKind };
  }
  throw new Error(`biến thể Response không hỗ trợ: ${variant}`);
}

/**
 * Chạy `tts-worker` một lần để tổng hợp danh sách câu `items` (`[{ key, lang, text, voice, speed, pauseScale }]`).
 * Trả `Map<key, Float32Array>` ở tần số 48 kHz.
 */
export async function synthesizeWithWorker(items, opts = {}) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = opts.rootDir ?? path.resolve(here, "../..");
  const workerBin = opts.workerBin ?? path.join(rootDir, "src-tauri/binaries/tts-worker-x86_64-pc-windows-msvc.exe");
  const modelDir = opts.modelDir ?? path.join(rootDir, "models/tts/vieneu-v3-turbo/onnx_int8");
  const codecDir = opts.codecDir ?? path.join(rootDir, "models/tts/moss-codec");
  const g2pDict = opts.g2pDict ?? path.join(rootDir, "models/tts/sea_g2p.bin");
  const voicesFile = opts.voicesFile ?? path.join(rootDir, "models/tts/voices_v3_turbo.json");
  const ortLib = opts.ortLib ?? path.join(rootDir, "models/tts/onnxruntime.dll");

  return new Promise((resolve, reject) => {
    const child = spawn(
      workerBin,
      [
        "--model-dir", modelDir,
        "--codec-dir", codecDir,
        "--g2p-dict", g2pDict,
        "--voices", voicesFile,
        "--ort-lib", ortLib,
      ],
      { stdio: ["pipe", "pipe", "inherit"] },
    );

    const chunksById = new Map();
    const keyById = new Map();
    items.forEach((item, idx) => {
      const numId = idx + 1;
      chunksById.set(numId, []);
      keyById.set(numId, item.key ?? item.id ?? String(numId));
    });

    let buf = Buffer.alloc(0);
    let completed = 0;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {}
      reject(err);
    };

    child.on("error", fail);
    child.stdout.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const frameLen = buf.readUInt32LE(0);
        if (buf.length < 4 + frameLen) break;
        const body = buf.subarray(4, 4 + frameLen);
        buf = buf.subarray(4 + frameLen);
        let msg;
        try {
          msg = decodeResponseFrame(body);
        } catch (e) {
          return fail(e);
        }
        const sendItem = (idx) => {
          const item = items[idx];
          child.stdin.write(
            encodeSpeakFrame({
              id: idx + 1,
              lang: item.lang,
              text: item.text,
              voice: item.voice ?? null,
              speed: item.speed ?? null,
              pauseScale: item.pauseScale ?? null,
            }),
          );
        };
        if (msg.kind === "ready") {
          if (items.length > 0) sendItem(0);
          else child.stdin.write(encodeShutdownFrame());
        } else if (msg.kind === "audio") {
          chunksById.get(msg.id)?.push(msg.pcm);
        } else if (msg.kind === "done") {
          completed += 1;
          if (completed < items.length) {
            sendItem(completed);
          } else if (!settled) {
            settled = true;
            child.stdin.write(encodeShutdownFrame());
            const out = new Map();
            for (const [numId, pcmList] of chunksById.entries()) {
              const total = pcmList.reduce((acc, arr) => acc + arr.length, 0);
              const f32 = new Float32Array(total);
              let offset = 0;
              for (const arr of pcmList) {
                for (let i = 0; i < arr.length; i++) f32[offset++] = arr[i] / 32768;
              }
              out.set(keyById.get(numId), f32);
            }
            resolve(out);
          }
        } else if (msg.kind === "failed") {
          return fail(new Error(`tts-worker thất bại ở câu id=${msg.id} (kind=${msg.errorKind})`));
        }
      }
    });

    child.on("close", (code) => {
      if (!settled) fail(new Error(`tts-worker đóng sớm với mã ${code} (đã xong ${completed}/${items.length})`));
    });
  });
}
