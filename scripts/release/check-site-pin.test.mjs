import assert from "node:assert/strict";
import { test } from "node:test";

import { installerUrl, pinOf, problems } from "./check-site-pin.mjs";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const latest = (version, pub) => ({ status: 200, text: JSON.stringify({ version, pub_date: pub }) });
const ps1 = (v) => `function X {\n    $PinVersion = '${v}'\n    $PinSha256 = 'ab'\n}\n`;
const sh = (v) => `#!/bin/bash\nPIN_VERSION="${v}"\nPIN_SHA256="ab"\n`;

/** `get` giả: `pages` là nội dung hai script; `missing` là các URL file cài trả 404. */
function fake({ stable = "0.6.2", pub = "2026-11-03T08:42:34Z", ps = "0.6.2", s = "0.6.2", missing = [] } = {}) {
  return async (url, method) => {
    if (url.endsWith("/stable/latest.json")) return latest(stable, pub);
    if (url.endsWith("/install.ps1")) return { status: 200, text: ps1(ps) };
    if (url.endsWith("/install.sh")) return { status: 200, text: sh(s) };
    return { status: missing.some((m) => url.includes(m)) ? 404 : 200, text: method === "GET" ? "x" : "" };
  };
}

test("đọc bản ghim của hai script; để trống hay lạ thì null", () => {
  assert.equal(pinOf(ps1("0.5.2"), "ps1"), "0.5.2");
  assert.equal(pinOf(sh("0.5.2"), "sh"), "0.5.2");
  assert.equal(pinOf(ps1(""), "ps1"), null);
  assert.equal(pinOf(sh(""), "sh"), null);
  assert.equal(pinOf("không có gì", "sh"), null);
});

test("URL file cài đúng như script dựng", () => {
  assert.equal(installerUrl("0.6.2", "ps1"), "https://releases.aitranslator.vn/0.6.2/AI%20Translator_0.6.2_x64-setup.exe");
  assert.equal(installerUrl("0.6.2", "sh"), "https://releases.aitranslator.vn/0.6.2/AI%20Translator_0.6.2_aarch64.dmg");
});

test("ghim khớp stable và file tải được: không lỗi", async () => {
  assert.deepEqual(await problems({ get: fake(), now: NOW }), []);
});

test("vừa phát hành (trong thời gian chờ deploy) thì chưa báo lỗi, quá hạn thì báo cả hai nền tảng", async () => {
  const lag = { ps: "0.6.1", s: "0.6.1" };
  assert.deepEqual(await problems({ get: fake({ ...lag, pub: "2026-11-03T11:30:00Z" }), now: NOW }), []);
  const late = await problems({ get: fake({ ...lag, pub: "2026-11-03T08:00:00Z" }), now: NOW });
  assert.equal(late.length, 2);
  assert.match(late[0], /install\.ps1 \(Windows\): ghim 0\.6\.1 nhưng stable là 0\.6\.2/);
  assert.match(late[1], /install\.sh \(macOS\)/);
});

test("trường hợp 2026-11-03: ghim 0.5.2 mà file cài không còn trên R2", async () => {
  const list = await problems({ get: fake({ ps: "0.5.2", s: "0.5.2", missing: ["/0.5.2/"] }), now: NOW });
  assert.equal(list.length, 4);
  assert.ok(list.some((p) => /bản ghim 0\.5\.2 không tải được \(HTTP 404\).*x64-setup\.exe/.test(p)));
  assert.ok(list.some((p) => /bản ghim 0\.5\.2 không tải được \(HTTP 404\).*aarch64\.dmg/.test(p)));
});

test("script chưa ghim gì, hay không đọc được latest.json: báo lỗi", async () => {
  assert.match((await problems({ get: fake({ ps: "" }), now: NOW }))[0], /install\.ps1: chưa ghim/);
  const get = async () => ({ status: 503, text: "" });
  assert.deepEqual(await problems({ get, now: NOW }), ["không đọc được stable/latest.json (HTTP 503)"]);
});
