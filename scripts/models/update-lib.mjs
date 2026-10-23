// Logic của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md): đọc tham số,
// so bản ở nguồn với upstream.json, kiểm upstream.json, dựng bảng in ra. Không gọi mạng, không chạy lệnh ngoài (phần đó ở
// update-io.mjs); chỉ đọc file cục bộ (`latestBody` liệt kê thư mục released), nên test được bằng dữ liệu mẫu.
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { sha256hex } from "./lib.mjs";

/** URL của models.json đang phát hành; trùng `PRODUCTION_URL` của `src-tauri/src/models/source.rs` (có test). */
export const MANIFEST_URL = "https://releases.aitranslator.vn/models/models.json";
/** `url` trong manifest là tương đối so với thư mục này. */
export const PUBLIC_BASE = "https://releases.aitranslator.vn/models/";

export const USAGE = `Dùng:
  pnpm models:update                     kiểm nguồn, chuẩn bị, cổng kiểm, hỏi y/N rồi đăng
  pnpm models:update --check             chỉ kiểm nguồn, không tải, không đăng
  pnpm models:update --gate-only <id>    chạy cổng kiểm với file đang phát hành của <id>
  pnpm models:update --rollback-to <S>   quay các model về như manifest số S`;

export function parseArgs(argv) {
  if (argv.length === 0) return { mode: "update" };
  const [flag, value, ...rest] = argv;
  if (flag === "--check" && value === undefined) return { mode: "check" };
  if (flag === "--gate-only" && value && !value.startsWith("--") && rest.length === 0) return { mode: "gate-only", id: value };
  if (flag === "--rollback-to" && value && rest.length === 0) {
    if (!/^[1-9]\d*$/.test(value)) throw new Error(`--rollback-to cần số manifest nguyên dương, không phải ${value}.`);
    return { mode: "rollback", sequence: Number(value) };
  }
  throw new Error(`Tham số không hợp lệ: ${argv.join(" ")}\n${USAGE}`);
}

/** Phần thân manifest đã phát hành có số lớn nhất trong `dir` (`body-<n>.json`). */
export function latestBody(dir) {
  const numbers = readdirSync(dir)
    .map((name) => /^body-([1-9]\d*)\.json$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  if (numbers.length === 0) throw new Error(`Không có body-<n>.json nào trong ${dir}.`);
  const sequence = Math.max(...numbers);
  return { sequence, path: join(dir, `body-${sequence}.json`) };
}

/** Định danh nội dung một file trong `siblings` của API Hugging Face: SHA-256 với file LFS, mã blob git với file thường. */
export function contentId(sibling) {
  return sibling.lfs?.sha256 ? `sha256:${sibling.lfs.sha256}` : `blob:${sibling.blobId}`;
}

/** Tên file không ảnh hưởng tới model: tài liệu, giấy phép, thông báo, ảnh minh họa. */
const IGNORED_INPUT = (name) =>
  name === ".gitattributes" ||
  name.endsWith(".md") ||
  /^(license|notice|readme)(\.|$)/i.test(name.split("/").pop()) ||
  /\.(png|jpe?g|gif|svg|webp)$/i.test(name);

/** File đầu vào của `hf-convert`: mọi file của repo trừ tài liệu, giấy phép, thông báo, ảnh và `.gitattributes`. */
export function convertInputs(siblings) {
  return Object.fromEntries(
    siblings
      .filter((s) => !IGNORED_INPUT(s.rfilename))
      .map((s) => [s.rfilename, contentId(s)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

const sameMap = (a, b) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

/**
 * So một mục của upstream.json với trạng thái ở nguồn. `source`:
 * - Hugging Face: `{ api }`, JSON của `/api/models/<repo>/revision/main?blobs=true`;
 * - GitHub: `{ tag, license, content }`: tag của release mới nhất, `spdx_id` giấy phép của repo, và `sha256:<hex>` của file
 *   theo dõi ở tag đó (`null` khi tag trùng bản đang dùng, không cần tải).
 * Trả `{ id, status, reason?, next? }`. `status`: `same`; `new` (đi tiếp chuẩn bị); `report` (mục có `gate.kind` là
 * `report`: chỉ báo, không tự đăng); `skip` (bản này nằm trong `rejected` của mục: đã bị quay lại, không đăng lại); `stop`
 * (dừng, cần người xem).
 */
export function detect(id, entry, source) {
  const found = detectChange(id, entry, source);
  if (found.status !== "new") return found;
  const { next } = found;
  const rejected = (entry.rejected ?? []).find((r) =>
    r.inputs ? next.inputs && sameMap(r.inputs, next.inputs) : r.content !== undefined && r.content === next.content,
  );
  if (rejected) {
    return {
      id,
      status: "skip",
      reason: `bản này đã bị quay lại ở manifest số ${rejected.sequence}; xóa khỏi rejected trong upstream.json nếu muốn đăng lại`,
      next,
    };
  }
  if (entry.gate.kind === "report") {
    return {
      id,
      status: "report",
      reason: `có ${shortRev(next.revision)}, đang dùng ${shortRev(entry.revision)}; đổi bằng tay`,
      next,
    };
  }
  return found;
}

/** Phần so sánh của `detect`, chưa tính `rejected` và `gate.kind`: trả `same`, `new` hay `stop`. */
function detectChange(id, entry, source) {
  const stop = (reason) => ({ id, status: "stop", reason });
  if (entry.source === "github-release") {
    if (source.license !== entry.license) {
      return stop(`giấy phép của ${entry.repo} đổi: ${entry.license} → ${source.license}`);
    }
    if (source.tag === entry.revision || source.content === entry.content) return { id, status: "same" };
    return { id, status: "new", next: { revision: source.tag, content: source.content } };
  }
  const { api } = source;
  const license = api.cardData?.license ?? null;
  if (license !== entry.license) {
    return stop(`giấy phép trên model card của ${entry.repo} đổi: ${entry.license} → ${license}`);
  }
  if (entry.source === "hf-file") {
    const sibling = api.siblings.find((s) => s.rfilename === entry.path);
    if (!sibling) return stop(`${entry.repo} không còn file ${entry.path}`);
    const content = contentId(sibling);
    if (content === entry.content) return { id, status: "same" };
    return { id, status: "new", next: { revision: api.sha, content, size: sibling.size ?? sibling.lfs?.size ?? null } };
  }
  if (entry.source === "hf-convert") {
    const inputs = convertInputs(api.siblings);
    if (sameMap(inputs, entry.inputs)) return { id, status: "same" };
    return { id, status: "new", next: { revision: api.sha, inputs } };
  }
  return stop(`nguồn lạ ${entry.source}`);
}

/** Revision ngắn để in: commit 40 ký tự thành 7 ký tự đầu; tag giữ nguyên. */
export const shortRev = (revision) => (/^[0-9a-f]{40}$/.test(revision) ? revision.slice(0, 7) : revision);

const STATUS = {
  same: "không có bản mới",
  new: "CÓ BẢN MỚI",
  report: "có bản mới (chỉ báo)",
  skip: "bỏ qua",
  stop: "DỪNG",
};

/** Bảng Markdown "đang phát hành / mới nhất ở nguồn". */
export function checkTable(results, upstream) {
  const rows = results.map((r) => {
    const entry = upstream.entries[r.id];
    const now = shortRev(entry.revision);
    const latest = r.next ? shortRev(r.next.revision) : r.status === "stop" ? "?" : now;
    return `| ${r.id} | ${entry.repo} | ${now} | ${latest} | ${STATUS[r.status]}${r.reason ? `: ${r.reason}` : ""} |`;
  });
  return ["| id | Nguồn | Đang phát hành | Mới nhất ở nguồn | Kết luận |", "|---|---|---|---|---|", ...rows].join("\n");
}

/**
 * Lỗi của upstream.json so với models.config.json và phần thân manifest đang phát hành `body`: thiếu trường, `id` lạ, cổng
 * kiểm thiếu mốc, dòng `history` cuối không phải revision đang dùng, `content` SHA-256 khác file đang phát hành.
 */
export function checkUpstream(upstream, config, body) {
  const problems = [];
  const configIds = new Set(config.files.map((f) => f.id));
  const published = new Map(body.files.map((f) => [f.id, f]));
  for (const [id, e] of Object.entries(upstream.entries ?? {})) {
    const need = (...keys) => {
      for (const k of keys) if (e[k] === undefined) problems.push(`${id}: thiếu ${k}`);
    };
    if (!configIds.has(id)) problems.push(`${id}: không có trong models.config.json`);
    if (!["hf-file", "hf-convert", "github-release"].includes(e.source)) problems.push(`${id}: nguồn lạ ${e.source}`);
    need("repo", "revision", "license", "version_prefix", "r2_dir", "gate", "history");
    if (e.source === "hf-convert") need("inputs", "convert");
    else need("path", "content");
    const kind = e.gate?.kind;
    if (!["mt", "asr", "none", "report"].includes(kind)) problems.push(`${id}: gate.kind lạ ${kind}`);
    if ((kind === "mt" || kind === "asr") && !e.gate.baseline) problems.push(`${id}: thiếu gate.baseline`);
    if (kind === "mt") {
      if (!e.gate.prompt) problems.push(`${id}: thiếu gate.prompt`);
      else if (e.gate.prompt !== (config.files.find((f) => f.id === id)?.prompt ?? "hy-mt2")) {
        problems.push(`${id}: gate.prompt khác prompt của models.config.json`);
      }
    }
    if (e.notice !== undefined && !configIds.has(e.notice)) problems.push(`${id}: notice ${e.notice} không có trong models.config.json`);
    if (e.rejected !== undefined) {
      const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
      const validContent = (c) => typeof c === "string" && /^(sha256|blob):./.test(c);
      const valid = (r) =>
        isObject(r) &&
        Number.isInteger(r.sequence) &&
        (r.content !== undefined ? validContent(r.content) && r.inputs === undefined : isObject(r.inputs)) &&
        (r.sha256 === undefined || /^[0-9a-f]{64}$/.test(r.sha256));
      if (!Array.isArray(e.rejected)) problems.push(`${id}: rejected sai dạng`);
      else e.rejected.forEach((r, i) => valid(r) || problems.push(`${id}: rejected[${i}] sai dạng`));
    }
    if (e.history?.at(-1)?.revision !== e.revision) problems.push(`${id}: dòng history cuối không phải revision đang dùng`);
    const file = published.get(id);
    if (!file) problems.push(`${id}: manifest số ${body.sequence} không có mục này`);
    else if (e.content?.startsWith("sha256:") && e.content !== `sha256:${file.sha256}`) {
      problems.push(`${id}: content khác sha256 của file đang phát hành`);
    }
  }
  return problems;
}

/** Phần thân trong phong bì đã ký trùng từng byte với dạng gọn của file phần thân (CI ký `JSON.stringify` dạng gọn). */
export function sameSignedBody(envelope, bodyText) {
  return Buffer.from(envelope.body, "base64url").toString("utf8") === JSON.stringify(JSON.parse(bodyText));
}

/** Cổng dịch (A3), như `score_mt.py`: mỗi chiều không thấp hơn mốc quá mức này. */
export const REGRESSION = 0.01;
/** Mức sàn Anh→Việt, xét theo thứ tự như `FLOOR` của `score_mt.py`: LMT trước Q8_0 vì tên LMT cũng có "Q8_0". */
export const FLOORS = [
  ["LMT-60", 0.77],
  ["Q8_0", 0.83],
  ["Q4_K_M", 0.8],
];
/** Cổng nhận dạng (A4), như `A4_RELATIVE` của `bench/phase1/acceptance/gates.py`: không xấu hơn mốc quá 10% tương đối. */
export const ASR_RELATIVE = 0.1;

export const floorFor = (run) => FLOORS.find(([key]) => run.includes(key))?.[1] ?? null;
/** Tên lượt mà `score_mt.py` đặt cho kết quả `latency-bench mt-eval` (biến thể plain) của file model. */
export const mtRunName = (modelPath) => `${basename(modelPath).replace(/\.gguf$/, "")}-plain`;

/**
 * Cổng dịch (spec mục 4.4): `report`, `baseline` là `runs` của `s7_mt-*.json`; `run` là tên lượt. Đạt khi mỗi chiều của
 * mốc có COMET không thấp hơn quá `REGRESSION` và chấm đủ số câu, Anh→Việt không dưới mức sàn, số câu lỗi (`failed`,
 * `leaked`) không nhiều hơn mốc.
 */
export function gateMt(report, baseline, run) {
  const now = report[run];
  const base = baseline[run];
  if (!now) return { pass: false, rows: [], problems: [`kết quả không có lượt ${run}`] };
  if (!base) return { pass: false, rows: [], problems: [`mốc không có lượt ${run}`] };
  const rows = [];
  const problems = [];
  for (const dir of Object.keys(base).sort()) {
    const b = base[dir];
    const n = now[dir];
    if (b.comet === undefined) continue;
    if (n?.comet === undefined) {
      problems.push(`${dir}: thiếu COMET`);
      continue;
    }
    if (n.n < b.n) problems.push(`${dir}: chỉ chấm ${n.n}/${b.n} câu`);
    const diff = n.comet - b.comet;
    const ok = diff >= -REGRESSION;
    if (!ok) problems.push(`${dir}: COMET ${n.comet.toFixed(3)} thấp hơn mốc ${b.comet.toFixed(3)} quá ${REGRESSION}`);
    rows.push({ dir, baseline: b.comet, result: n.comet, diff, ok });
  }
  const floor = floorFor(run);
  const enVi = now["en->vi"]?.comet;
  if (floor !== null) {
    if (enVi === undefined) problems.push(`en->vi: không có COMET (mức sàn ${floor})`);
    else if (!(enVi >= floor)) problems.push(`en->vi ${enVi.toFixed(3)} dưới mức sàn ${floor}`);
  }
  const errors = (runs) => Object.values(runs).reduce((sum, d) => sum + (d.failed ?? 0) + (d.leaked ?? 0), 0);
  if (errors(now) > errors(base)) problems.push(`số câu lỗi ${errors(now)} nhiều hơn mốc ${errors(base)}`);
  return { pass: problems.length === 0, rows, problems };
}

/** Cổng nhận dạng (spec mục 4.4): mỗi nhóm của mốc (`a4_*.json`) có WER/CER không xấu hơn quá `ASR_RELATIVE`. */
export function gateAsr(result, baseline) {
  const rows = [];
  const problems = [];
  for (const group of Object.keys(baseline).sort()) {
    const metric = "cer" in baseline[group] ? "cer" : "wer";
    const base = baseline[group][metric];
    const now = result[group]?.[metric];
    if (now === undefined) {
      problems.push(`thiếu nhóm ${group}`);
      continue;
    }
    const ok = now <= base * (1 + ASR_RELATIVE) + 1e-12;
    if (!ok) problems.push(`${group}: ${metric.toUpperCase()} ${now.toFixed(3)} xấu hơn mốc ${base.toFixed(3)} quá 10%`);
    rows.push({ group, metric, baseline: base, result: now, ok });
  }
  return { pass: rows.length > 0 && problems.length === 0, rows, problems };
}

/** Bảng Markdown của một lượt cổng kiểm (`kind`: "mt" hay "asr"), kèm kết luận. */
export function gateTable(gate, kind) {
  const lines = kind === "mt"
    ? [
        "| Chiều | Mốc | Bản mới | Chênh | Kết luận |",
        "|---|---|---|---|---|",
        ...gate.rows.map(
          (r) =>
            `| ${r.dir} | ${r.baseline.toFixed(3)} | ${r.result.toFixed(3)} | ${r.diff >= 0 ? "+" : ""}${r.diff.toFixed(3)} | ${r.ok ? "đạt" : "THỤT LÙI"} |`,
        ),
      ]
    : [
        "| Nhóm | Mốc | Bản mới | Kết luận |",
        "|---|---|---|---|",
        ...gate.rows.map(
          (r) =>
            `| ${r.group} (${r.metric.toUpperCase()}) | ${r.baseline.toFixed(3)} | ${r.result.toFixed(3)} | ${r.ok ? "đạt" : "XẤU HƠN"} |`,
        ),
      ];
  lines.push("", gate.pass ? "Cổng kiểm: ĐẠT." : `Cổng kiểm: KHÔNG ĐẠT.\n- ${gate.problems.join("\n- ")}`);
  return lines.join("\n");
}

export const BUCKET = "ai-translator-releases";

/** Khóa R2 của bản mới: thư mục theo revision (12 ký tự đầu), để không bao giờ ghi đè file của bản cũ (spec mục 5.1). */
export const r2Key = (dir, revision, file) => `models/${dir}/${revision.slice(0, 12)}/${file}`;
/** `url` trong manifest: tương đối so với thư mục `models/` (`PUBLIC_BASE`). */
export const manifestUrlOf = (key) => key.replace(/^models\//, "");
/** Trường `version` của file: tiền tố của mục cộng revision ngắn. */
export const versionOf = (entry, revision) => `${entry.version_prefix}${shortRev(revision)}`;
/** JSON thụt lề hai dấu cách, như build-manifest.mjs. */
export const serializeJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
/** Giờ UTC dạng `published_at` của build-manifest.mjs. */
export const publishedAtNow = (date = new Date()) => date.toISOString().replace(/\.\d{3}Z$/, "Z");
export const isYes = (answer) => /^[yY]$/.test(String(answer ?? "").trim());

/** Phần thân số mới: thay nguyên mục của các `id` trong `replace`, các phần khác giữ như `prev`. */
export function bumpBody(prev, replace, publishedAt) {
  const ids = new Set(prev.files.map((f) => f.id));
  for (const id of Object.keys(replace)) {
    if (!ids.has(id)) throw new Error(`manifest số ${prev.sequence} không có mục ${id}`);
  }
  return { ...prev, sequence: prev.sequence + 1, published_at: publishedAt, files: prev.files.map((f) => replace[f.id] ?? f) };
}

/** Phần nội dung của một mục file; quay lại chỉ lấy lại phần này (spec mục 7.1). */
const CONTENT = ["file", "version", "url", "bytes", "sha256"];

/**
 * Các mục cần đổi để quay về như `target`: mỗi `id` có ở cả hai bản mà phần nội dung khác thì lấy phần nội dung của
 * `target`, các trường khác giữ như `current`. `id` chỉ có ở `current` giữ nguyên; `id` chỉ có ở `target` thì ném; mục đổi
 * mà `prompt` hay `kind` khác nhau giữa hai bản cũng ném.
 */
export function rollbackChanges(current, target) {
  const now = new Map(current.files.map((f) => [f.id, f]));
  const dropped = target.files.filter((f) => !now.has(f.id)).map((f) => f.id);
  if (dropped.length) {
    throw new Error(`manifest số ${target.sequence} có mục đã bỏ: ${dropped.join(", ")}; quay lại kiểu này làm tay.`);
  }
  const changes = {};
  for (const old of target.files) {
    const cur = now.get(old.id);
    if (CONTENT.some((k) => cur[k] !== old[k])) {
      // Cổng kiểm và cách chạy model phụ thuộc prompt và kind: khác nhau thì không quay lại tự động được.
      if (cur.prompt !== old.prompt || cur.kind !== old.kind) {
        throw new Error(`${old.id}: prompt/kind khác giữa số ${target.sequence} và số ${current.sequence}, quay lại làm tay.`);
      }
      changes[old.id] = { ...cur, ...Object.fromEntries(CONTENT.map((k) => [k, old[k]])) };
    }
  }
  return changes;
}

/** Thay revision của `repo` trong văn bản NOTICE ("https://huggingface.co/<repo> (revision <40 hex>)"). */
export function bumpNotice(text, repo, revision) {
  const escaped = repo.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const pattern = `(https://huggingface\\.co/${escaped} \\(revision )[0-9a-f]{40}\\)`;
  if (!new RegExp(pattern).test(text)) {
    throw new Error(`NOTICE không có dòng "https://huggingface.co/${repo} (revision …)": sửa NOTICE bằng tay trước.`);
  }
  return text.replace(new RegExp(pattern, "g"), `$1${revision})`);
}

export function nextNoticeVersion(version) {
  if (!/^[1-9]\d*$/.test(version)) throw new Error(`version của NOTICE phải là số nguyên dương, không phải ${version}`);
  return String(Number(version) + 1);
}

/** Các `id` của mục NOTICE mà upstream.json nhắc tới (`notice`). */
export const noticeIds = (upstream) => [...new Set(Object.values(upstream.entries).map((e) => e.notice).filter(Boolean))];

/**
 * Sửa `version`, `url` của mục `id` ngay trên văn bản của models.config.json: mỗi mục nằm trên một dòng, nên chỉ đổi đúng
 * dòng đó và giữ nguyên cách trình bày của cả file.
 */
export function applyConfigText(text, id, { version, url }) {
  const lines = text.split("\n");
  const i = lines.findIndex((line) => line.includes(`"id": "${id}"`));
  if (i < 0) throw new Error(`models.config.json không có dòng của ${id}`);
  let line = lines[i];
  for (const [key, value] of Object.entries({ version, url })) {
    const re = new RegExp(`"${key}": "[^"]*"`);
    if (!re.test(line)) throw new Error(`dòng của ${id} trong models.config.json thiếu ${key}`);
    line = line.replace(re, `"${key}": ${JSON.stringify(value)}`);
  }
  lines[i] = line;
  const out = lines.join("\n");
  JSON.parse(out);
  return out;
}

/** upstream.json sau khi đăng bản `next` của `id` ở manifest số `sequence`; `baseline`: mốc mới (hay `null`). */
export function applyUpstream(upstream, id, next, sequence, baseline) {
  const out = structuredClone(upstream);
  const e = out.entries[id];
  e.revision = next.revision;
  const record = { sequence, revision: next.revision };
  if (next.inputs) {
    e.inputs = next.inputs;
    record.inputs = next.inputs;
  } else {
    e.content = next.content;
    record.content = next.content;
  }
  if (e.gate.baseline !== undefined) {
    if (baseline) e.gate.baseline = baseline;
    record.baseline = e.gate.baseline;
  }
  e.history.push(record);
  return out;
}

/**
 * upstream.json khi quay `id` về bản đang dùng ở manifest số `target`, ghi thành dòng `history` số `sequence`. Bản đang bị
 * quay lại vào `rejected` (kèm `rejectedSha256` của file bị gỡ), để lần kiểm sau không đề nghị đăng lại (spec mục 4.1, 7.1).
 */
export function restoreUpstream(upstream, id, target, sequence, rejectedSha256) {
  const out = structuredClone(upstream);
  const e = out.entries[id];
  const record = e.history.filter((h) => h.sequence <= target).at(-1);
  if (!record) throw new Error(`upstream.json không có bản nào của ${id} ở manifest số ${target} trở về trước`);
  const rejected = e.inputs ? { sequence, inputs: e.inputs } : { sequence, content: e.content };
  // SHA-256 của file bị quay lại: bản chuyển ra từ `inputs` khác chưa chắc khác file, nên lần sau so cả SHA-256 này.
  if (rejectedSha256) rejected.sha256 = rejectedSha256;
  e.rejected = [...(e.rejected ?? []), rejected];
  e.revision = record.revision;
  if (record.inputs) e.inputs = record.inputs;
  else e.content = record.content;
  if (record.baseline !== undefined) e.gate.baseline = record.baseline;
  e.history.push({ ...record, sequence });
  return out;
}

/**
 * Kế hoạch đăng bản mới (spec mục 5). `body`: phần thân đang chạy. `prepared`: các mục đã chuẩn bị và qua cổng kiểm, mỗi
 * mục `{ id, entry, next, local: { path, bytes, sha256 }, bench, baseline }` (`bench`: `{ from, to }` chép kết quả đo vào
 * repo, `baseline`: mốc mới trong repo; cả hai `null` với mục không có cổng kiểm). `noticeTexts`: nội dung hiện tại của các
 * file NOTICE trong repo, theo `id` của mục NOTICE. `repo`: thư mục gốc của repo (đường dẫn tải lên của NOTICE).
 */
export function buildUpdatePlan({ body, upstream, configText, noticeTexts, prepared, publishedAt, repo }) {
  const changed = prepared.filter((p) => !p.unchanged);
  const names = (list) => list.map((p) => `${p.id} lên ${shortRev(p.next.revision)}`).join(", ");
  if (changed.length === 0) {
    // Mọi bản chuẩn bị đều trùng file đang phát hành: chỉ ghi nhận revision mới (spec mục 4.3), không ký, không đăng.
    let up = upstream;
    for (const p of prepared) up = applyUpstream(up, p.id, p.next, body.sequence, null);
    return {
      kind: "record",
      base: body.sequence,
      target: body.sequence,
      replace: {},
      uploads: [],
      files: { "scripts/models/upstream.json": serializeJson(up) },
      bench: [],
      message: `chore(models): ghi nhận revision mới của nguồn, nội dung không đổi (${names(prepared)})`,
    };
  }
  const target = body.sequence + 1;
  const old = new Map(body.files.map((f) => [f.id, f]));
  const replace = {};
  const uploads = [];
  const files = {};
  const notices = {};
  let up = upstream;
  let config = configText;
  for (const p of prepared.filter((item) => item.unchanged)) up = applyUpstream(up, p.id, p.next, target, null);
  for (const p of changed) {
    const was = old.get(p.id);
    const key = r2Key(p.entry.r2_dir, p.next.revision, was.file);
    replace[p.id] = {
      ...was,
      version: versionOf(p.entry, p.next.revision),
      url: manifestUrlOf(key),
      bytes: p.local.bytes,
      sha256: p.local.sha256,
    };
    uploads.push({ key, path: p.local.path, sha256: p.local.sha256 });
    up = applyUpstream(up, p.id, p.next, target, p.baseline);
    config = applyConfigText(config, p.id, replace[p.id]);
    const noticeId = p.entry.notice;
    if (noticeId && p.entry.source !== "github-release") {
      if (notices[noticeId] === undefined) {
        const was = old.get(noticeId);
        if (sha256hex(Buffer.from(noticeTexts[noticeId])) !== was.sha256) {
          throw new Error(`scripts/models/${was.file} trong repo khác bản đang phát hành: đối chiếu với R2 trước.`);
        }
      }
      notices[noticeId] = bumpNotice(notices[noticeId] ?? noticeTexts[noticeId], p.entry.repo, p.next.revision);
    }
  }
  for (const [id, text] of Object.entries(notices)) {
    const was = old.get(id);
    if (text === noticeTexts[id]) continue;
    const sha256 = sha256hex(Buffer.from(text));
    const version = nextNoticeVersion(was.version);
    const key = `models/notice/${version}-${sha256.slice(0, 8)}/${was.file}`;
    replace[id] = { ...was, version, url: manifestUrlOf(key), bytes: Buffer.byteLength(text), sha256 };
    const rel = `scripts/models/${was.file}`;
    files[rel] = text;
    uploads.push({ key, path: join(repo, rel), sha256 });
    config = applyConfigText(config, id, replace[id]);
  }
  const bodyRel = `scripts/models/released/body-${target}.json`;
  files[bodyRel] = serializeJson(bumpBody(body, replace, publishedAt));
  files["scripts/models/upstream.json"] = serializeJson(up);
  files["scripts/models/models.config.json"] = config;
  return {
    kind: "update",
    base: body.sequence,
    target,
    publishedAt,
    replace,
    uploads,
    files,
    bench: changed.map((p) => p.bench).filter(Boolean),
    bodyRel,
    prevRel: `scripts/models/released/body-${body.sequence}.json`,
    message: `chore(models): ${names(changed)} (manifest số ${target})`,
  };
}

/**
 * Kế hoạch quay các model về như phần thân `target` (spec mục 7.1), hay `null` khi không có gì để quay lại. `noticeTexts`:
 * nội dung các file NOTICE của `target` (tải từ R2), theo `id`, cho các mục NOTICE có đổi.
 */
export function buildRollbackPlan({ current, target, upstream, configText, noticeTexts, publishedAt }) {
  const replace = rollbackChanges(current, target);
  if (Object.keys(replace).length === 0) return null;
  const sequence = current.sequence + 1;
  const files = {};
  let up = upstream;
  let config = configText;
  for (const [id, entry] of Object.entries(replace)) {
    if (up.entries[id]) up = restoreUpstream(up, id, target.sequence, sequence, current.files.find((f) => f.id === id).sha256);
    config = applyConfigText(config, id, entry);
    if (noticeTexts[id] !== undefined) files[`scripts/models/${entry.file}`] = noticeTexts[id];
  }
  const bodyRel = `scripts/models/released/body-${sequence}.json`;
  files[bodyRel] = serializeJson(bumpBody(current, replace, publishedAt));
  files["scripts/models/upstream.json"] = serializeJson(up);
  files["scripts/models/models.config.json"] = config;
  return {
    kind: "rollback",
    base: current.sequence,
    target: sequence,
    publishedAt,
    replace,
    uploads: [],
    files,
    bench: [],
    bodyRel,
    prevRel: `scripts/models/released/body-${current.sequence}.json`,
    message: `chore(models): quay lại model như manifest số ${target.sequence} (manifest số ${sequence})`,
  };
}

/** Bản đã bị quay lại của `entry` có cùng SHA-256 với file vừa chuẩn bị không: trả dòng `rejected` đó, hay `undefined`. */
export const rejectedHit = (entry, sha256) => (entry.rejected ?? []).find((r) => r.sha256 === sha256);

/** Bảng "đang chạy / sẽ đăng" của kế hoạch, in trước câu hỏi y/N. */
export function planTable(plan, body) {
  const old = new Map(body.files.map((f) => [f.id, f]));
  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const rows = Object.entries(plan.replace).map(([id, f]) => {
    const was = old.get(id);
    return `| ${id} | ${was.version}, ${was.sha256.slice(0, 12)}, ${mb(was.bytes)} | ${f.version}, ${f.sha256.slice(0, 12)}, ${mb(f.bytes)} | ${f.url} |`;
  });
  return [`Manifest số ${plan.base} → số ${plan.target}.`, "", "| id | Đang chạy | Sẽ đăng | url |", "|---|---|---|---|", ...rows].join("\n");
}
