#!/usr/bin/env node
// Sinh bộ vector test token và license key dùng chung giữa server (kế hoạch 05) và app (kế hoạch 06), Đ9.
// Chạy lại cho ra đúng file cũ: Ed25519 là chữ ký tất định, và khóa test sinh từ nhãn cố định.
// Khóa trong file này CHỈ để test; không bản build nào của app hay server được nhận kid "test-*".
// Dùng: node scripts/gen-token-vectors.mjs > test/vectors/token-v1.json
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

const k1 = await testKey("test-1", "meeting-translator token test key 1");
const k2 = await testKey("test-2", "meeting-translator token test key 2");
const issuedAt = Date.UTC(2026, 9, 1) / 1000; // 2026-10-01T00:00:00Z
const device = sha256("test-device-1").toString("hex");
const otherDevice = sha256("test-device-2").toString("hex");
// Thứ tự trường như signToken của src/token.ts.
const base = {
  kid: "test-1",
  license_id: "0b6f2c3e-1f4a-4c1e-9a53-2d7c8e9f0a11",
  activation_id: "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60",
  activation_created_at: issuedAt - 3 * 86400,
  device_id_hash: device,
  plan: "pro",
  expires_at: issuedAt + 30 * 86400,
  cycle_anchor: issuedAt - 5 * 86400,
  quota_minutes_per_cycle: 1800,
  quota_epoch: 0,
  quota_fresh: false,
  issued_at: issuedAt,
  refresh_before: issuedAt + 14 * 86400,
};
// Gói X5 không giới hạn: quota_minutes_per_cycle là null (không phải thiếu trường). Cấp ngay sau khi admin
// tăng quota_epoch lên 2 (trong 15 phút) nên quota_fresh là true.
const unlimited = { ...base, plan: "pro_x5", quota_minutes_per_cycle: null, quota_epoch: 2, quota_fresh: true };
const valid = await sign(k1, base);
const [, , validSig] = valid.split(".");
const tampered = `v1.${b64url(JSON.stringify({ ...base, expires_at: base.expires_at + 365 * 86400 }))}.${validSig}`;
const shortLicense = { ...base, expires_at: issuedAt + 7 * 86400 };
const { device_id_hash: _omit, ...missingField } = base;
const { quota_minutes_per_cycle: _omitQuota, ...missingQuota } = base;
// base64url không ở dạng chuẩn: crate `base64` của Rust (URL_SAFE_NO_PAD) từ chối, server cũng phải từ chối.
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const [validHead, validPayload] = valid.split(".");
const lastSig = validSig.at(-1);
// Chữ ký 64 byte là 86 ký tự; ký tự cuối chỉ mang 2 bit dữ liệu, 4 bit còn lại phải bằng 0.
const trailingBitsSig = validSig.slice(0, -1) + B64URL[B64URL.indexOf(lastSig) ^ 1];
// Số lớn hơn 2^53 (2^53 + 1) viết thẳng vào JSON: JS đọc thành 2^53, không còn là số nguyên an toàn.
const baseJson = JSON.stringify(base);
const tooBigJson = baseJson.replace(`"refresh_before":${base.refresh_before}`, '"refresh_before":9007199254740993');
// Payload có chuỗi UTF-8 hỏng (0xC3 rồi 0x28 không phải byte nối tiếp) trong license_id, chữ ký vẫn đúng.
const [utf8Head, utf8Tail] = JSON.stringify({ ...base, license_id: "@" }).split('"@"');
const invalidUtf8 = Buffer.concat([Buffer.from(utf8Head), Buffer.from([0x22, 0xc3, 0x28, 0x22]), Buffer.from(utf8Tail)]);

const tokens = [
  { name: "valid", token: valid, now: issuedAt + 3600, device_id_hash: device, expected: "ok", claims: base },
  {
    name: "valid_unlimited",
    token: await sign(k1, unlimited),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "ok",
    claims: unlimited,
  },
  {
    name: "valid_backup_key",
    token: await sign(k2, { ...base, kid: "test-2" }),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "ok",
    claims: { ...base, kid: "test-2" },
  },
  { name: "bad_signature", token: tampered, now: issuedAt + 3600, device_id_hash: device, expected: "bad_signature" },
  {
    name: "unknown_kid",
    token: await sign(k1, { ...base, kid: "test-9" }),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "unknown_kid",
  },
  { name: "wrong_device", token: valid, now: issuedAt + 3600, device_id_hash: otherDevice, expected: "wrong_device" },
  {
    name: "refresh_expired",
    token: valid,
    now: base.refresh_before,
    device_id_hash: device,
    expected: "refresh_expired",
  },
  {
    name: "refresh_ok_one_second_before",
    token: valid,
    now: base.refresh_before - 1,
    device_id_hash: device,
    expected: "ok",
    claims: base,
  },
  {
    name: "license_expired",
    token: await sign(k1, shortLicense),
    now: shortLicense.expires_at,
    device_id_hash: device,
    expected: "license_expired",
  },
  {
    name: "kid_signed_by_other_key",
    token: await sign(k2, base),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "bad_signature",
  },
  {
    name: "signature_with_padding",
    token: `${valid}==`,
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "signature_trailing_bits",
    token: `${validHead}.${validPayload}.${trailingBitsSig}`,
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  { name: "malformed_parts", token: "v1.abc", now: issuedAt, device_id_hash: device, expected: "malformed" },
  {
    name: "malformed_version",
    token: valid.replace(/^v1\./, "v2."),
    now: issuedAt,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "malformed_json",
    token: `v1.${b64url("not json")}.${validSig}`,
    now: issuedAt,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "missing_field",
    token: await sign(k1, missingField),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "missing_quota",
    token: await sign(k1, missingQuota),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "unknown_plan",
    token: await sign(k1, { ...base, plan: "free" }),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "quota_zero",
    token: await sign(k1, { ...base, quota_minutes_per_cycle: 0 }),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "quota_fresh_not_boolean",
    token: await sign(k1, { ...base, quota_fresh: 0 }),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "quota_epoch_negative",
    token: await sign(k1, { ...base, quota_epoch: -1 }),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  // Token có hai lỗi: kết quả là lỗi đứng trước trong checks_order.
  {
    name: "order_bad_signature_before_wrong_device",
    token: tampered,
    now: issuedAt + 3600,
    device_id_hash: otherDevice,
    expected: "bad_signature",
  },
  {
    name: "order_wrong_device_before_license_expired",
    token: await sign(k1, shortLicense),
    now: shortLicense.expires_at,
    device_id_hash: otherDevice,
    expected: "wrong_device",
  },
  {
    name: "order_license_expired_before_refresh_expired",
    token: valid,
    now: base.expires_at,
    device_id_hash: device,
    expected: "license_expired",
  },
  // Dữ liệu sai dạng, chữ ký đúng: số không nguyên, số vượt 2^53 - 1, UTF-8 hỏng.
  {
    name: "timestamp_not_integer",
    token: await sign(k1, { ...base, expires_at: 1.5 }),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "number_above_2_pow_53",
    token: await signBytes(k1, Buffer.from(tooBigJson)),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
  {
    name: "payload_invalid_utf8",
    token: await signBytes(k1, invalidUtf8),
    now: issuedAt + 3600,
    device_id_hash: device,
    expected: "malformed",
  },
];
if (!tooBigJson.includes("9007199254740993")) throw new Error("không thay được refresh_before");

// Ký tự kiểm tra Luhn mod 32, viết lại độc lập với src/license-key.ts.
const KEY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function luhn32(body) {
  let sum = 0;
  [...body].reverse().forEach((ch, i) => {
    const p = KEY_ALPHABET.indexOf(ch) * (i % 2 === 0 ? 2 : 1);
    sum += Math.floor(p / 32) + (p % 32);
  });
  return KEY_ALPHABET[(32 - (sum % 32)) % 32];
}
const body = "0123456789ABCDEFGHJKMNPQRST";
const key = body + luhn32(body);
const group = (k) => k.match(/.{1,4}/g).join("-");
const zBody = `${"1".repeat(25)}0Z`;
const zKey = zBody + luhn32(zBody);
const licenseKeys = [
  { input: group(key), normalized: key },
  { input: ` ${group(key).toLowerCase().replace(/-/g, " ").replace("0", "o")} `, normalized: key },
  { input: group(key.slice(0, 27) + (key[27] === "0" ? "1" : "0")), normalized: null },
  { input: group(key.slice(0, 26) + key[27] + key[26]), normalized: null },
  { input: group(key.slice(0, 27)), normalized: null },
  { input: group(key.slice(0, 26) + "U" + key[27]), normalized: null },
  // Giới hạn đã biết của Luhn mod 32: đảo 0↔Z kề nhau vẫn qua.
  { input: group(`${"1".repeat(25)}Z0${zKey[27]}`), normalized: `${"1".repeat(25)}Z0${zKey[27]}` },
];

const out = {
  format:
    "v1.<base64url(JSON claims)>.<base64url(Ed25519 signature over ASCII 'v1.' + payload segment)>; base64url không padding",
  checks_order: ["malformed", "unknown_kid", "bad_signature", "wrong_device", "license_expired", "refresh_expired"],
  note: "Khóa test-* chỉ dùng cho test. Hết hạn khi now >= expires_at hoặc now >= refresh_before (giây Unix). Token có nhiều lỗi thì trả lỗi đứng trước trong checks_order.",
  claims:
    "kid, license_id, activation_id, device_id_hash: chuỗi; activation_created_at, expires_at, cycle_anchor, issued_at, refresh_before: số nguyên; plan: pro | pro_x2 | pro_x5; quota_minutes_per_cycle: số nguyên dương (phút mỗi chu kỳ 30 ngày) hoặc null (không giới hạn); quota_epoch: số nguyên >= 0; quota_fresh: boolean. Mọi số nguyên phải là số nguyên an toàn (|n| <= 2^53 - 1): 1.5 hay 2^53 + 1 là malformed. Payload phải là UTF-8 hợp lệ. Thiếu trường hay sai kiểu là malformed.",
  test_keys: [k1, k2].map(({ kid, seed_b64url, public_b64url }) => ({ kid, seed_b64url, public_b64url })),
  public_keys: { "test-1": k1.public_b64url, "test-2": k2.public_b64url },
  tokens,
  license_key_check:
    "Luhn mod 32 trên ALPHABET = 0123456789ABCDEFGHJKMNPQRSTVWXYZ: từ phải sang trái, nhân 2 các ký tự ở vị trí 1, 3, 5… của 27 ký tự đầu, cộng floor(p/32) + p%32 của mỗi tích, ký tự kiểm tra = ALPHABET[(32 - tổng % 32) % 32]",
  license_keys: licenseKeys,
};
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
