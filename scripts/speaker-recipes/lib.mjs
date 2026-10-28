// Phần dùng chung của các script công thức đọc tên (spec 2026-10-26-phan-biet-nguoi-noi §7.1; kế hoạch 06). Định dạng phong bì phải
// khớp `crates/speaker-ops/src/envelope.rs`:
//   { "format": "ai-translator-speaker-recipes", "version": 1, "kid", "body": base64url(JSON phần thân), "sig" }
//   sig = Ed25519(CONTEXT + body), body là chuỗi base64url không đệm.
// Cùng khóa ký manifest model (khối production của src-tauri/keys/manifest-public-keys.json), nhưng `format` và tiền tố ký riêng:
// chữ ký của manifest model không dùng được cho công thức, và ngược lại.
import { webcrypto } from "node:crypto";
import { b64url, builtInKeys, importPrivateJwk, insideRepo, KEYS_FILE, REPO, testKey } from "../models/lib.mjs";

const { subtle } = webcrypto;
export const FORMAT = "ai-translator-speaker-recipes";
export const VERSION = 1;
export const CONTEXT = "ai-translator-speaker-recipes.v1.";
export { b64url, builtInKeys, importPrivateJwk, insideRepo, KEYS_FILE, REPO, testKey };

// Ký phần thân (chuỗi JSON hay Buffer) thành phong bì. `format` và `context` chỉ đổi trong bộ vector (ca "ký sai chỗ").
export async function signRecipes(privateKey, kid, body, { context = CONTEXT, format = FORMAT } = {}) {
  const bodyB64 = b64url(Buffer.isBuffer(body) ? body : Buffer.from(body));
  const sig = await subtle.sign({ name: "Ed25519" }, privateKey, Buffer.from(context + bodyB64));
  return { format, version: VERSION, kid, body: bodyB64, sig: b64url(sig) };
}

// Kiểm phong bì bằng khóa công khai `{ kid, x }`; trả phần thân đã đọc (chuỗi JSON), hay ném lỗi.
export async function verifyRecipes(envelope, keys) {
  if (envelope.format !== FORMAT || envelope.version !== VERSION) throw new Error("Phong bì sai định dạng.");
  const key = keys.find((k) => k.kid === envelope.kid);
  if (!key) throw new Error(`Không có khóa công khai cho kid ${envelope.kid}.`);
  const publicKey = await subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: key.x }, { name: "Ed25519" }, false, ["verify"]);
  const ok = await subtle.verify(
    { name: "Ed25519" },
    publicKey,
    Buffer.from(envelope.sig, "base64url"),
    Buffer.from(CONTEXT + envelope.body),
  );
  if (!ok) throw new Error("Chữ ký không đúng.");
  return Buffer.from(envelope.body, "base64url").toString("utf8");
}
