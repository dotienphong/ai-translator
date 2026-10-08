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

/** "2026-10-08" thành "08/10" (nhãn trục của biểu đồ theo ngày). */
export function fmtDay(key: string): string {
  const [, mo = "", d = ""] = key.split("-");
  return `${d}/${mo}`;
}

/** "2026-10" thành "10/2026" (nhãn trục của biểu đồ theo tháng). */
export function fmtMonth(key: string): string {
  const [y = "", mo = ""] = key.split("-");
  return `${mo}/${y}`;
}

/** Giờ và phút GMT+7, "HH:mm". */
export function fmtHm(sec: number): string {
  const p = vnParts(sec);
  return `${p.h}:${p.mi}`;
}

/** Số gọn cho trục biểu đồ: 1500 thành "1,5k", 1500000 thành "1,5tr". */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const trim = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}tr`;
  if (abs >= 1_000) return `${trim(n / 1_000)}k`;
  return String(n);
}

/** Dung lượng: "547,4 MB" (một chữ số thập phân khi cần, dấu phẩy kiểu Việt; B, KB, MB, GB theo bội 1024). Âm hay không hữu hạn thành "0 B". */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  // Làm tròn rồi mới so với 1024: 1048575 byte là "1 MB", không phải "1024 KB".
  while (i < units.length - 1 && Math.round(v * 10) / 10 >= 1024) {
    v /= 1024;
    i++;
  }
  const text = i === 0 ? String(Math.round(v)) : String(Math.round(v * 10) / 10).replace(".", ",");
  return `${text} ${units[i]}`;
}
