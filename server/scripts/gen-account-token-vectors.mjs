#!/usr/bin/env node
// Sinh bộ vector test token tài khoản dùng chung giữa server (TypeScript) và app (Rust), spec 2026-11-05 §5.2.
// Chạy lại cho ra đúng file cũ: Ed25519 là chữ ký tất định, và khóa test sinh từ nhãn cố định (cùng nhãn, nên cùng khóa
// với gen-token-vectors.mjs: test-1 và test-2 có khóa công khai y hệt trong token-v1.json).
// Khóa trong file này CHỈ để test; không bản build nào của app hay server được nhận kid "test-*".
// Dùng: node scripts/gen-account-token-vectors.mjs > test/vectors/token-account-v1.json
import { createHash, webcrypto } from "node:crypto";

const { subtle } = webcrypto;
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (text) => createHash("sha256").update(text).digest();
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

async function testKey(kid, label) {
  const seed = sha256(label);
  const privateKey = await subtle.importKey("pkcs8", Buffer.concat([PKCS8_ED25519_PREFIX, seed]), { name: "Ed25519" }, true, ["sign"]);
  const jwk = await subtle.exportKey("jwk", privateKey);
  return { kid, seed_b64url: b64url(seed), public_b64url: jwk.x, privateKey, jwk };
}

// Ký đúng các byte payload cho trước (dùng cho payload không dựng được bằng JSON.stringify).
async function signBytes(key, payloadBytes) {
  const input = `v1.${b64url(payloadBytes)}`;
  const sig = await subtle.sign({ name: "Ed25519" }, key.privateKey, Buffer.from(input));
  return `${input}.${b64url(sig)}`;
}
const sign = (key, claims) => signBytes(key, Buffer.from(JSON.stringify(claims)));

// Cùng nhãn với gen-token-vectors.mjs.
const k1 = await testKey("test-1", "meeting-translator token test key 1");
const k2 = await testKey("test-2", "meeting-translator token test key 2");
const issuedAt = Date.UTC(2026, 10, 5) / 1000; // 2026-11-05T00:00:00Z
const device = sha256("test-device-1").toString("hex");
const otherDevice = sha256("test-device-2").toString("hex");
// Thứ tự trường như signAccountToken của src/token.ts.
const base = {
  typ: "account",
  kid: "test-1",
  account_id: "7a1c9e52-4b3d-4f08-9c6e-1d2f3a4b5c6d",
  device_id_hash: device,
  issued_at: issuedAt,
};
const valid = await sign(k1, base);
const [validHead, validPayload, validSig] = valid.split(".");
const { account_id: _omitAccount, ...missingAccount } = base;
const { device_id_hash: _omitDevice, ...missingDevice } = base;
const { typ: _omitTyp, ...noTyp } = base;
// base64url không ở dạng chuẩn: crate `base64` của Rust (URL_SAFE_NO_PAD) từ chối, server cũng phải từ chối.
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// Chữ ký 64 byte là 86 ký tự; ký tự cuối chỉ mang 2 bit dữ liệu, 4 bit còn lại phải bằng 0.
const trailingBitsSig = validSig.slice(0, -1) + B64URL[B64URL.indexOf(validSig.at(-1)) ^ 1];
const tampered = `v1.${b64url(JSON.stringify({ ...base, account_id: "7a1c9e52-4b3d-4f08-9c6e-1d2f3a4b5c6e" }))}.${validSig}`;
// Số lớn hơn 2^53 (2^53 + 1) viết thẳng vào JSON: JS đọc thành 2^53, không còn là số nguyên an toàn.
const baseJson = JSON.stringify(base);
const tooBigJson = baseJson.replace(`"issued_at":${base.issued_at}`, '"issued_at":9007199254740993');
if (!tooBigJson.includes("9007199254740993")) throw new Error("không thay được issued_at");
// Payload có chuỗi UTF-8 hỏng (0xC3 rồi 0x28 không phải byte nối tiếp) trong account_id, chữ ký vẫn đúng.
const [utf8Head, utf8Tail] = JSON.stringify({ ...base, account_id: "@" }).split('"@"');
const invalidUtf8 = Buffer.concat([Buffer.from(utf8Head), Buffer.from([0x22, 0xc3, 0x28, 0x22]), Buffer.from(utf8Tail)]);
// Payload bắt đầu bằng BOM UTF-8 (EF BB BF): không phải JSON hợp lệ, bên kiểm không được bỏ BOM đi.
const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(baseJson)]);
// Token dùng thử và token bản quyền hợp lệ (định dạng của gen-token-vectors.mjs): không phải token tài khoản.
const trialToken = await sign(k1, {
  typ: "trial",
  kid: "test-1",
  device_id_hash: device,
  started_at: issuedAt - 2 * 86400,
  ends_at: issuedAt + 8 * 86400,
  issued_at: issuedAt,
});
const licenseToken = await sign(k1, {
  kid: "test-1",
  license_id: "0b6f2c3e-1f4a-4c1e-9a53-2d7c8e9f0a11",
  activation_id: "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60",
  activation_created_at: issuedAt - 3 * 86400,
  device_id_hash: device,
  plan: "monthly",
  expires_at: issuedAt + 30 * 86400,
  cycle_anchor: issuedAt - 5 * 86400,
  quota_minutes_per_cycle: 3000,
  quota_epoch: 0,
  quota_fresh: false,
  issued_at: issuedAt,
  refresh_before: issuedAt + 14 * 86400,
});

const tokens = [
  { name: "valid", token: valid, device_id_hash: device, expected: "ok", claims: base },
  {
    name: "valid_backup_key",
    token: await sign(k2, { ...base, kid: "test-2" }),
    device_id_hash: device,
    expected: "ok",
    claims: { ...base, kid: "test-2" },
  },
  { name: "wrong_device", token: valid, device_id_hash: otherDevice, expected: "wrong_device" },
  { name: "bad_signature", token: tampered, device_id_hash: device, expected: "bad_signature" },
  { name: "kid_signed_by_other_key", token: await sign(k2, base), device_id_hash: device, expected: "bad_signature" },
  {
    name: "unknown_kid",
    token: await sign(k1, { ...base, kid: "test-9" }),
    device_id_hash: device,
    expected: "unknown_kid",
  },
  { name: "missing_account_id", token: await sign(k1, missingAccount), device_id_hash: device, expected: "malformed" },
  { name: "missing_device_id_hash", token: await sign(k1, missingDevice), device_id_hash: device, expected: "malformed" },
  { name: "no_typ", token: await sign(k1, noTyp), device_id_hash: device, expected: "malformed" },
  {
    name: "wrong_typ",
    token: await sign(k1, { ...base, typ: "trial" }),
    device_id_hash: device,
    expected: "malformed",
  },
  { name: "trial_token", token: trialToken, device_id_hash: device, expected: "malformed" },
  { name: "license_token", token: licenseToken, device_id_hash: device, expected: "malformed" },
  {
    name: "account_id_not_string",
    token: await sign(k1, { ...base, account_id: 42 }),
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "issued_at_not_integer",
    token: await sign(k1, { ...base, issued_at: 1.5 }),
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "issued_at_string",
    token: await sign(k1, { ...base, issued_at: String(issuedAt) }),
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "number_above_2_pow_53",
    token: await signBytes(k1, Buffer.from(tooBigJson)),
    device_id_hash: device,
    expected: "malformed",
  },
  { name: "payload_invalid_utf8", token: await signBytes(k1, invalidUtf8), device_id_hash: device, expected: "malformed" },
  { name: "payload_with_bom", token: await signBytes(k1, withBom), device_id_hash: device, expected: "malformed" },
  { name: "signature_with_padding", token: `${valid}==`, device_id_hash: device, expected: "malformed" },
  {
    name: "signature_trailing_bits",
    token: `${validHead}.${validPayload}.${trailingBitsSig}`,
    device_id_hash: device,
    expected: "malformed",
  },
  { name: "malformed_parts", token: "v1.abc", device_id_hash: device, expected: "malformed" },
  { name: "malformed_version", token: valid.replace(/^v1\./, "v2."), device_id_hash: device, expected: "malformed" },
  { name: "malformed_json", token: `v1.${b64url("not json")}.${validSig}`, device_id_hash: device, expected: "malformed" },
  // Token có hai lỗi: kết quả là lỗi đứng trước trong checks_order.
  {
    name: "order_malformed_before_unknown_kid",
    token: await sign(k1, { ...missingAccount, kid: "test-9" }),
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "order_malformed_before_bad_signature",
    token: `v1.${b64url(JSON.stringify({ ...base, typ: "trial" }))}.${validSig}`,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "order_unknown_kid_before_wrong_device",
    token: await sign(k1, { ...base, kid: "test-9" }),
    device_id_hash: otherDevice,
    expected: "unknown_kid",
  },
  { name: "order_bad_signature_before_wrong_device", token: tampered, device_id_hash: otherDevice, expected: "bad_signature" },
];

const out = {
  format:
    "v1.<base64url(JSON claims)>.<base64url(Ed25519 signature over ASCII 'v1.' + payload segment)>; base64url không padding; cùng định dạng và cùng khóa với token-v1.json",
  checks_order: ["malformed", "unknown_kid", "bad_signature", "wrong_device"],
  note: "Khóa test-* chỉ dùng cho test (cùng khóa với token-v1.json). Token tài khoản không có hạn dùng: bên kiểm không xét thời gian. Token có nhiều lỗi thì trả lỗi đứng trước trong checks_order.",
  claims:
    "typ: đúng chuỗi \"account\"; kid, account_id, device_id_hash: chuỗi; issued_at: số nguyên an toàn (|n| <= 2^53 - 1): 1.5 hay 2^53 + 1 là malformed. Payload phải là UTF-8 hợp lệ, không có BOM. Thiếu trường, sai kiểu hay typ khác \"account\" (kể cả token dùng thử và token bản quyền) là malformed. Thứ tự trường khi ký: typ, kid, account_id, device_id_hash, issued_at.",
  test_keys: [k1, k2].map(({ kid, seed_b64url, public_b64url }) => ({ kid, seed_b64url, public_b64url })),
  public_keys: { "test-1": k1.public_b64url, "test-2": k2.public_b64url },
  tokens,
};
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
