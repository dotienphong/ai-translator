#!/usr/bin/env node
// Sinh bộ vector kiểm manifest model, dùng chung giữa script ký (Node) và app (Rust, `models/signed.rs`).
// Chạy lại cho ra đúng file cũ: Ed25519 là chữ ký tất định, khóa test sinh từ nhãn cố định.
// Khóa trong file này CHỈ để test; kid luôn bắt đầu bằng "test-" và không bao giờ có trong manifest-public-keys.json.
// Dùng: node scripts/models/gen-manifest-vectors.mjs > src-tauri/src/models/testdata/manifest-vectors.json
import { b64url, signBody, testKey } from "./lib.mjs";

const k1 = await testKey("test-m1", "ai-translator manifest test key 1");
const k2 = await testKey("test-m2", "ai-translator manifest test key 2");
const file = (id, tier, kind, name, bytes, sha) => ({
  id,
  tier,
  kind,
  version: "1",
  file: name,
  url: `models/${name}`,
  bytes,
  sha256: sha,
  license_id: kind === "license" || id.startsWith("hy-mt2") ? "Apache-2.0" : "MIT",
  min_app_version: "0.1.0",
});
const body = {
  schema: 1,
  sequence: 1,
  published_at: "2026-10-02T00:00:00Z",
  files: [
    file("whisper-turbo", ["standard"], "asr", "ggml-large-v3-turbo-q5_0.bin", 574041195, "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"),
    file("whisper-small", ["lite"], "asr", "ggml-small-q5_1.bin", 190085487, "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"),
    file("hy-mt2-q8", ["standard"], "mt", "Hy-MT2-1.8B-Q8_0.gguf", 1908528192, "5c3fe0b1408a5ceb0143184ef247b11b579c525f4b02b060e6c851bb76fef1a4"),
    file("hy-mt2-q4", ["lite"], "mt", "Hy-MT2-1.8B-Q4_K_M.gguf", 1133080448, "dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699"),
    file("silero-vad", ["standard", "lite"], "vad", "silero_vad_v6.2.3.onnx", 2327524, "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"),
    file("hy-mt2-license", ["standard", "lite"], "license", "Hy-MT2-LICENSE.txt", 11639, "a1d52d448f81c584a47c583e19dfab2d3851c7c84431b07baee093c1113ed114"),
  ],
  packs: [
    { id: "standard", name: { vi: "Chuẩn", en: "Standard" }, note: { vi: "Chép lời tốt nhất.", en: "Best transcription." } },
    { id: "lite", name: { vi: "Nhẹ", en: "Lite" }, note: { vi: "Nhẹ hơn.", en: "Lighter." } },
  ],
  recommend: {
    min_ram_mib: 7000,
    rules: [{ pack: "standard", os: "macos", min_ram_mib: 15000 }],
    fallback: "lite",
  },
};
const json = JSON.stringify(body);
const valid = await signBody(k1.privateKey, "test-m1", json);
const tamperedJson = JSON.stringify({ ...body, sequence: 2 });
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// Chữ ký 64 byte là 86 ký tự; ký tự cuối chỉ mang 2 bit, 4 bit còn lại phải bằng 0.
const last = valid.sig.at(-1);
const trailingBits = valid.sig.slice(0, -1) + B64URL[B64URL.indexOf(last) ^ 1];
const badSha = JSON.stringify({ ...body, files: body.files.map((f, i) => (i === 0 ? { ...f, sha256: f.sha256.toUpperCase() } : f)) });

const cases = [
  { name: "valid", manifest: valid, expect: "ok" },
  { name: "valid_second_key", manifest: await signBody(k2.privateKey, "test-m2", json), expect: "ok" },
  { name: "tampered_body", manifest: { ...valid, body: b64url(tamperedJson) }, expect: "bad_signature" },
  { name: "kid_signed_by_other_key", manifest: await signBody(k2.privateKey, "test-m1", json), expect: "bad_signature" },
  { name: "unknown_kid", manifest: await signBody(k1.privateKey, "test-m9", json), expect: "unknown_key" },
  { name: "signed_without_context", manifest: await signBody(k1.privateKey, "test-m1", json, { context: "" }), expect: "bad_signature" },
  { name: "signed_as_token", manifest: await signBody(k1.privateKey, "test-m1", json, { context: "v1." }), expect: "bad_signature" },
  { name: "body_with_padding", manifest: { ...valid, body: `${valid.body}==` }, expect: "malformed" },
  { name: "signature_trailing_bits", manifest: { ...valid, sig: trailingBits }, expect: "malformed" },
  { name: "unknown_envelope_field", manifest: { ...valid, note: "x" }, expect: "malformed" },
  { name: "wrong_format", manifest: { ...valid, format: "ai-translator-token" }, expect: "malformed" },
  { name: "version_2", manifest: { ...valid, version: 2 }, expect: "malformed" },
  { name: "kid_uppercase", manifest: { ...valid, kid: "TEST-M1" }, expect: "malformed" },
  { name: "bom", raw: `﻿${JSON.stringify(valid)}`, expect: "malformed" },
  { name: "invalid_body_signed", manifest: await signBody(k1.privateKey, "test-m1", badSha), expect: "invalid" },
  { name: "body_not_json_signed", manifest: await signBody(k1.privateKey, "test-m1", "not json"), expect: "invalid" },
];

process.stdout.write(
  `${JSON.stringify(
    {
      _note: "Vector kiểm manifest model (kế hoạch 04). Sinh bằng scripts/models/gen-manifest-vectors.mjs; không sửa tay. Khóa test-* chỉ để test.",
      keys: [k1, k2].map(({ kid, seed, x }) => ({ kid, x, seed })),
      cases,
    },
    null,
    2,
  )}\n`,
);
