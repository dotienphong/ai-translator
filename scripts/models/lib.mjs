// Phần dùng chung của các script manifest model (spec §6.7, §10.2; kế hoạch 04). Định dạng phong bì phải khớp
// `src-tauri/src/models/signed.rs`:
//   { "format": "ai-translator-models", "version": 1, "kid", "body": base64url(JSON phần thân), "sig" }
//   sig = Ed25519(CONTEXT + body), body là chuỗi base64url không đệm.
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const { subtle } = webcrypto;
export const FORMAT = "ai-translator-models";
export const VERSION = 1;
export const CONTEXT = "ai-translator-models.v1.";
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const KEYS_FILE = resolve(REPO, "src-tauri/keys/manifest-public-keys.json");
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export const b64url = (buf) => Buffer.from(buf).toString("base64url");
export const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");

// Đường dẫn nằm trong repo không (khóa riêng không bao giờ được nằm trong repo).
export function insideRepo(path) {
  const rel = relative(REPO, resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// Khóa riêng từ JWK Ed25519 (`{ kty, crv, kid, d, x }`).
export async function importPrivateJwk(jwk) {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.d || !jwk.x || !jwk.kid) {
    throw new Error("Khóa không phải JWK Ed25519 có kid.");
  }
  const { kid: _kid, ...rest } = jwk;
  return subtle.importKey("jwk", rest, { name: "Ed25519" }, false, ["sign"]);
}

// Khóa test tất định từ một nhãn (chỉ cho bộ vector; kid luôn bắt đầu bằng "test-").
export async function testKey(kid, label) {
  const seed = createHash("sha256").update(label).digest();
  const privateKey = await subtle.importKey(
    "pkcs8",
    Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    { name: "Ed25519" },
    true,
    ["sign"],
  );
  const jwk = await subtle.exportKey("jwk", privateKey);
  return { kid, seed: b64url(seed), x: jwk.x, privateKey };
}

// Ký phần thân (chuỗi JSON hay Buffer) thành phong bì.
export async function signBody(privateKey, kid, body, { context = CONTEXT } = {}) {
  const bodyB64 = b64url(Buffer.isBuffer(body) ? body : Buffer.from(body));
  const sig = await subtle.sign({ name: "Ed25519" }, privateKey, Buffer.from(context + bodyB64));
  return { format: FORMAT, version: VERSION, kid, body: bodyB64, sig: b64url(sig) };
}

// Kiểm phong bì bằng khóa công khai `{ kid, x }`; trả phần thân đã đọc, hay ném lỗi.
export async function verifyEnvelope(envelope, keys) {
  const key = keys.find((k) => k.kid === envelope.kid);
  if (!key) throw new Error(`Không có khóa công khai cho kid ${envelope.kid}.`);
  const publicKey = await subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: key.x }, { name: "Ed25519" }, false, [
    "verify",
  ]);
  const ok = await subtle.verify(
    { name: "Ed25519" },
    publicKey,
    Buffer.from(envelope.sig, "base64url"),
    Buffer.from(CONTEXT + envelope.body),
  );
  if (!ok) throw new Error("Chữ ký không đúng.");
  return JSON.parse(Buffer.from(envelope.body, "base64url").toString("utf8"));
}

// Khóa công khai build sẵn vào app, của một môi trường (`staging` hay `production`).
export function builtInKeys(env, file = KEYS_FILE) {
  const all = JSON.parse(readFileSync(file, "utf8"));
  return all[env] ?? [];
}
