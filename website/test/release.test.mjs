// Phiên bản và ngày phát hành của website (spec 2026-10-13-website-version-tu-dong-design.md): chạy `node --test test/release.test.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  RELEASES_URL,
  compareVersions,
  deployRelease,
  fetchStableLatest,
  gitCommitDate,
  previewRelease,
  resolveRelease,
  vnDate,
} from "../src/release.mjs";

test("vnDate: ngày theo giờ Việt Nam (UTC+7) của một thời điểm ISO", () => {
  assert.equal(vnDate("2026-10-12T10:36:23Z"), "2026-10-12");
  assert.equal(vnDate("2026-10-12T16:59:59Z"), "2026-10-12");
  assert.equal(vnDate("2026-10-12T17:00:00Z"), "2026-10-13", "17:00 UTC đã sang ngày hôm sau ở Việt Nam");
});

test("vnDate: chuỗi không phải thời điểm ISO thì null", () => {
  for (const bad of ["hôm qua", "2026-10-12", "", undefined, null, 20261012]) assert.equal(vnDate(bad), null, String(bad));
});

test("compareVersions: so số, không so chuỗi; bản beta nhỏ hơn bản stable cùng số", () => {
  assert.equal(compareVersions("0.1.8", "0.1.7"), 1);
  assert.equal(compareVersions("0.1.7", "0.1.7"), 0);
  assert.equal(compareVersions("0.1.7", "0.1.10"), -1);
  assert.equal(compareVersions("0.2.0", "0.1.99"), 1);
  assert.equal(compareVersions("0.1.9-beta.1", "0.1.9"), -1);
  assert.equal(compareVersions("0.1.9-beta.2", "0.1.9-beta.10"), -1);
  assert.throws(() => compareVersions("0.1", "0.1.7"), /không phải phiên bản/);
});

test("previewRelease: version của tauri.conf.json; ngày là ngày commit nâng bản, thiếu thì hôm nay", () => {
  assert.deepEqual(previewRelease({ confVersion: "0.1.8", gitDate: "2026-10-12", today: "2026-10-13" }), {
    version: "0.1.8",
    releaseDate: "2026-10-12",
  });
  assert.deepEqual(previewRelease({ confVersion: "0.1.8", gitDate: null, today: "2026-10-13" }), {
    version: "0.1.8",
    releaseDate: "2026-10-13",
  });
  // Chỉ xem trước: bản beta vẫn dựng được (deploy mới đòi bản stable của R2).
  assert.equal(previewRelease({ confVersion: "0.1.9-beta.1", gitDate: null, today: "2026-10-13" }).version, "0.1.9-beta.1");
});

const latest = (version, pub_date = "2026-10-12T10:36:23Z") => ({ version, pub_date, notes: "", platforms: {} });

test("deployRelease: dùng version và ngày của R2 khi R2 bằng hoặc thấp hơn repo", () => {
  const expected = { version: "0.1.7", releaseDate: "2026-10-12" };
  assert.deepEqual(deployRelease({ confVersion: "0.1.7", latest: latest("0.1.7") }), expected);
  // Giữa lúc nâng bản và lúc đăng: repo đã 0.1.8, R2 còn 0.1.7 → website nói bản đã phát hành thật.
  assert.deepEqual(deployRelease({ confVersion: "0.1.8", latest: latest("0.1.7") }), expected);
});

test("deployRelease: R2 cao hơn repo thì dừng (máy chưa git pull)", () => {
  assert.throws(() => deployRelease({ confVersion: "0.1.7", latest: latest("0.1.8") }), /0\.1\.8 mới hơn repo \(0\.1\.7\).*git pull/s);
  // Repo ở bản beta của chính số đó cũng cũ hơn bản stable đã đăng.
  assert.throws(() => deployRelease({ confVersion: "0.1.9-beta.1", latest: latest("0.1.9") }), /mới hơn repo/);
  assert.deepEqual(deployRelease({ confVersion: "0.1.9-beta.1", latest: latest("0.1.8") }), { version: "0.1.8", releaseDate: "2026-10-12" });
});

test("deployRelease: dữ liệu lạ của R2 thì dừng, nói rõ lý do", () => {
  const conf = "0.1.8";
  assert.throws(() => deployRelease({ confVersion: conf, latest: latest("0.1.8-beta.1") }), /chỉ nhận X\.Y\.Z/);
  assert.throws(() => deployRelease({ confVersion: conf, latest: latest("latest") }), /chỉ nhận X\.Y\.Z/);
  assert.throws(() => deployRelease({ confVersion: conf, latest: {} }), /chỉ nhận X\.Y\.Z/);
  assert.throws(() => deployRelease({ confVersion: conf, latest: null }), /chỉ nhận X\.Y\.Z/);
  assert.throws(() => deployRelease({ confVersion: conf, latest: latest("0.1.7", "hôm qua") }), /pub_date/);
  assert.throws(() => deployRelease({ confVersion: conf, latest: { version: "0.1.7" } }), /pub_date/);
});

const jsonResponse = (status, body) => ({ status, json: async () => body });

test("fetchStableLatest: đọc stable/latest.json của R2 (15 giây là hạn chót)", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    return jsonResponse(200, latest("0.1.7"));
  };
  assert.deepEqual(await fetchStableLatest(fetchImpl), latest("0.1.7"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], `${RELEASES_URL}/stable/latest.json`);
  assert.ok(calls[0][1].signal instanceof AbortSignal, "có hạn chót để không treo deploy");
});

test("fetchStableLatest: lỗi mạng, mã khác 200, hay không phải JSON thì ném lỗi nói rõ và không cho deploy", async () => {
  await assert.rejects(fetchStableLatest(async () => { throw new Error("ENOTFOUND"); }), /không đọc được .*stable\/latest\.json.*ENOTFOUND.*không deploy/s);
  await assert.rejects(fetchStableLatest(async () => jsonResponse(404, {})), /mã 404.*không deploy/s);
  await assert.rejects(
    fetchStableLatest(async () => ({ status: 200, json: async () => { throw new SyntaxError("x"); } })),
    /không phải JSON/,
  );
});

test("gitCommitDate: ngày commit gần nhất đổi dòng version của tauri.conf.json trong repo này; ngoài repo thì null", () => {
  assert.match(gitCommitDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(gitCommitDate({ cwd: "/không/có/thư/mục/này" }), null);
});

const stubs = { readConf: () => ({ version: "0.1.8" }), gitDate: () => "2026-10-12", today: () => "2026-10-13" };

test("resolveRelease: xem trước không gọi mạng", async () => {
  const fetchLatest = async () => { throw new Error("không được gọi mạng ở chế độ xem trước"); };
  assert.deepEqual(await resolveRelease({ ...stubs, deploy: false, fetchLatest }), { version: "0.1.8", releaseDate: "2026-10-12" });
});

test("resolveRelease: deploy gọi R2 đúng một lần và dùng giá trị của nó", async () => {
  let n = 0;
  const fetchLatest = async () => { n += 1; return latest("0.1.7"); };
  assert.deepEqual(await resolveRelease({ ...stubs, deploy: true, fetchLatest }), { version: "0.1.7", releaseDate: "2026-10-12" });
  assert.equal(n, 1);
});

test("resolveRelease: deploy không đọc được R2 thì ném lỗi (không có website nói bừa)", async () => {
  const fetchLatest = async () => { throw new Error("mất mạng"); };
  await assert.rejects(resolveRelease({ ...stubs, deploy: true, fetchLatest }), /mất mạng/);
});

test("package.json: pnpm deploy dựng bằng --deploy trước khi gọi wrangler", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.deploy, /^node src\/build\/build\.mjs --deploy && wrangler deploy /);
});
