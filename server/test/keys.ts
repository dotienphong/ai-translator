import { b64urlDecode } from "../src/crypto";
import vectors from "./vectors/token-v1.json";

/** JWK khóa riêng của khóa test trong vector (PKCS#8 cố định cho Ed25519 + 32 byte seed). Chỉ dùng trong test. */
export async function testSigningJwk(kid: string): Promise<string> {
  const k = vectors.test_keys.find((t) => t.kid === kid);
  if (!k) throw new Error(`không có khóa test ${kid}`);
  const prefix = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
  const pkcs8 = Uint8Array.from([...prefix, ...b64urlDecode(k.seed_b64url)]);
  const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  const jwk = (await crypto.subtle.exportKey("jwk", key)) as JsonWebKey;
  if (jwk.x !== k.public_b64url) throw new Error("khóa công khai không khớp vector");
  return JSON.stringify({ kty: "OKP", crv: "Ed25519", kid, d: jwk.d, x: jwk.x });
}
