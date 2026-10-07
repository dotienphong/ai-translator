// Định dạng hiển thị (spec Web Admin §4.5). Giờ Việt Nam là GMT+7, không có giờ mùa hè, nên cộng thẳng 7 giờ.
const VN_OFFSET = 7 * 3600;
const DAY = 86400;

const pad = (n: number) => String(n).padStart(2, "0");

function vnParts(sec: number) {
  const d = new Date((sec + VN_OFFSET) * 1000);
  return {
    y: d.getUTCFullYear(),
    mo: pad(d.getUTCMonth() + 1),
    d: pad(d.getUTCDate()),
    h: pad(d.getUTCHours()),
    mi: pad(d.getUTCMinutes()),
  };
}

export function fmtDate(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const p = vnParts(sec);
  return `${p.d}/${p.mo}/${p.y}`;
}

export function fmtDateTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const p = vnParts(sec);
  return `${p.d}/${p.mo}/${p.y} ${p.h}:${p.mi}`;
}

export function fmtVnd(n: number): string {
  return `${String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} đ`;
}

export function daysLeft(expiresAt: number, now: number): string {
  if (expiresAt <= now) return "đã hết hạn";
  return `còn ${Math.ceil((expiresAt - now) / DAY)} ngày`;
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Key dạng che: 4 ký tự đầu, "-…-", 4 ký tự cuối. Nhận key đầy đủ hay key đã che. */
export function maskKey(key: string): string {
  const raw = key.replace(/-/g, "");
  return `${raw.slice(0, 4)}-…-${raw.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

/** `detail` JSON của nhật ký thành "khóa: giá trị · …"; không phải object JSON thì trả nguyên. */
export function fmtDetail(detail: string | null): string {
  if (!detail) return "";
  try {
    const o: unknown = JSON.parse(detail);
    if (o !== null && typeof o === "object" && !Array.isArray(o)) {
      return Object.entries(o)
        .map(([k, v]) => `${k}: ${v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)}`)
        .join(" · ");
    }
  } catch {
    // không phải JSON: hiện nguyên văn
  }
  return detail;
}
