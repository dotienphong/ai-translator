#!/usr/bin/env node
// Sinh bộ vector kiểm phong bì công thức, dùng chung giữa script ký (Node) và app (Rust, `crates/speaker-ops/src/envelope.rs`).
// Chạy lại cho ra đúng file cũ: Ed25519 là chữ ký tất định, khóa test sinh từ nhãn cố định. Khóa trong file này CHỈ để test; kid
// luôn bắt đầu bằng "test-" và không bao giờ có trong manifest-public-keys.json.
// Dùng: node scripts/speaker-recipes/gen-recipe-vectors.mjs > crates/speaker-ops/testdata/recipe-vectors.json
import { CONTEXT as MODELS_CONTEXT, FORMAT as MODELS_FORMAT } from "../models/lib.mjs";
import { b64url, signRecipes, testKey } from "./lib.mjs";

const k1 = await testKey("test-r1", "ai-translator speaker recipes test key 1");
const k2 = await testKey("test-r2", "ai-translator speaker recipes test key 2");
const body = {
  schema: 1,
  version: 2,
  min_app_version: "0.3.2",
  apps: [
    {
      app: "teams",
      os: "macos",
      window_title: ["^Meeting with "],
      tile: { role: "AXMenuItem", label: "^(?P<name>[^,]+), Context menu is available$" },
      name_from: "label",
      speaking: [{ kind: "presence", anchor: { scope: "child", role: "AXGroup", class_token: "vdi-frame-occlusion" } }],
      delay_ms: 900,
    },
  ],
};
const json = JSON.stringify(body);
const valid = await signRecipes(k1.privateKey, "test-r1", json);
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// Chữ ký 64 byte là 86 ký tự; ký tự cuối chỉ mang 2 bit, 4 bit còn lại phải bằng 0.
const last = valid.sig.at(-1);
const trailingBits = valid.sig.slice(0, -1) + B64URL[B64URL.indexOf(last) ^ 1];

const cases = [
  { name: "valid", envelope: valid, expect: "ok" },
  { name: "valid_second_key", envelope: await signRecipes(k2.privateKey, "test-r2", json), expect: "ok" },
  { name: "tampered_body", envelope: { ...valid, body: b64url(JSON.stringify({ ...body, version: 3 })) }, expect: "bad_signature" },
  { name: "kid_signed_by_other_key", envelope: await signRecipes(k2.privateKey, "test-r1", json), expect: "bad_signature" },
  { name: "unknown_kid", envelope: await signRecipes(k1.privateKey, "test-r9", json), expect: "unknown_key" },
  { name: "signed_without_context", envelope: await signRecipes(k1.privateKey, "test-r1", json, { context: "" }), expect: "bad_signature" },
  // Chữ ký của manifest model (cùng khóa) dưới phong bì công thức: tiền tố ký riêng nên không dùng được.
  { name: "signed_with_models_context", envelope: await signRecipes(k1.privateKey, "test-r1", json, { context: MODELS_CONTEXT }), expect: "bad_signature" },
  { name: "models_envelope", envelope: await signRecipes(k1.privateKey, "test-r1", json, { context: MODELS_CONTEXT, format: MODELS_FORMAT }), expect: "malformed" },
  { name: "body_with_padding", envelope: { ...valid, body: `${valid.body}==` }, expect: "malformed" },
  { name: "signature_trailing_bits", envelope: { ...valid, sig: trailingBits }, expect: "malformed" },
  { name: "unknown_envelope_field", envelope: { ...valid, note: "x" }, expect: "malformed" },
  { name: "wrong_format", envelope: { ...valid, format: "ai-translator-token" }, expect: "malformed" },
  { name: "version_2", envelope: { ...valid, version: 2 }, expect: "malformed" },
  { name: "kid_uppercase", envelope: { ...valid, kid: "TEST-R1" }, expect: "malformed" },
  { name: "bom", raw: `﻿${JSON.stringify(valid)}`, expect: "malformed" },
  { name: "body_not_utf8_signed", envelope: await signRecipes(k1.privateKey, "test-r1", Buffer.from([0xff, 0xfe, 0xfd])), expect: "malformed" },
];

process.stdout.write(
  `${JSON.stringify(
    {
      _note: "Vector kiểm phong bì công thức đọc tên (kế hoạch 06). Sinh bằng scripts/speaker-recipes/gen-recipe-vectors.mjs; không sửa tay. Khóa test-* chỉ để test.",
      keys: [k1, k2].map(({ kid, seed, x }) => ({ kid, x, seed })),
      body,
      cases,
    },
    null,
    2,
  )}\n`,
);
