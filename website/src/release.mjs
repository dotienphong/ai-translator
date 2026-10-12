// Phiên bản và ngày phát hành của website (spec 2026-10-13-website-version-tu-dong-design.md). Không gõ tay: chế độ xem
// trước (pnpm build, dev, test) lấy từ src-tauri/tauri.conf.json; chế độ deploy (cờ --deploy của pnpm deploy) lấy từ bản đã
// đăng trên R2, vì website chỉ được nói điều có thật.

export const RELEASES_URL = "https://releases.aitranslator.io.vn";

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Ngày `YYYY-MM-DD` theo giờ Việt Nam của một thời điểm ISO (UTC+7); null khi không phải thời điểm ISO. */
export function vnDate(iso) {
  if (typeof iso !== "string" || !ISO_INSTANT.test(iso)) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** So hai phiên bản X.Y.Z hay X.Y.Z-beta.N: -1, 0 hay 1 (bản beta nhỏ hơn bản stable cùng số). Sai dạng thì ném lỗi. */
export function compareVersions(a, b) {
  const parse = (text) => {
    const m = VERSION.exec(text);
    if (!m) throw new Error(`${JSON.stringify(text)} không phải phiên bản X.Y.Z hay X.Y.Z-beta.N`);
    return { n: [+m[1], +m[2], +m[3]], beta: m[4] === undefined ? null : +m[4] };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1;
  if (x.beta === y.beta) return 0;
  if (x.beta === null) return 1;
  if (y.beta === null) return -1;
  return x.beta < y.beta ? -1 : 1;
}

/** Chế độ xem trước: version của tauri.conf.json; ngày là ngày commit nâng bản (`gitDate`), thiếu thì `today`. */
export function previewRelease({ confVersion, gitDate, today }) {
  return { version: confVersion, releaseDate: gitDate ?? today };
}

/**
 * Chế độ deploy: version và ngày của bản stable đã đăng (`latest` là stable/latest.json). Dừng khi dữ liệu lạ, hay khi R2 có
 * bản mới hơn repo (máy chưa git pull: deploy lúc đó làm mất nội dung). R2 thấp hơn repo là bình thường (đã nâng bản, chưa
 * đăng): website vẫn nói bản đã phát hành thật.
 */
export function deployRelease({ confVersion, latest }) {
  const version = latest?.version;
  if (typeof version !== "string" || !STABLE.test(version)) {
    throw new Error(`stable/latest.json có version ${JSON.stringify(version)}: kênh stable chỉ nhận X.Y.Z`);
  }
  const releaseDate = vnDate(latest.pub_date);
  if (!releaseDate) throw new Error(`stable/latest.json có pub_date ${JSON.stringify(latest.pub_date)} không hợp lệ`);
  if (compareVersions(version, confVersion) > 0) {
    throw new Error(`R2 đã có bản ${version} mới hơn repo (${confVersion}): git pull rồi deploy lại`);
  }
  return { version, releaseDate };
}
