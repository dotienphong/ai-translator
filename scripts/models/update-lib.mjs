// Logic của `pnpm models:update` (spec docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md): đọc tham số,
// so bản ở nguồn với upstream.json, kiểm upstream.json, dựng bảng in ra. Không gọi mạng, không chạy lệnh ngoài (phần đó ở
// update-io.mjs); chỉ đọc file cục bộ (`latestBody` liệt kê thư mục released), nên test được bằng dữ liệu mẫu.
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";

/** URL của models.json đang phát hành; trùng `PRODUCTION_URL` của `src-tauri/src/models/source.rs` (có test). */
export const MANIFEST_URL = "https://releases.aitranslator.io.vn/models/models.json";
/** `url` trong manifest là tương đối so với thư mục này. */
export const PUBLIC_BASE = "https://releases.aitranslator.io.vn/models/";

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
        (r.content !== undefined ? validContent(r.content) && r.inputs === undefined : isObject(r.inputs));
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
