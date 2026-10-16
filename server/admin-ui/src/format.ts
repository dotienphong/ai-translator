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

const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** Thứ trong tuần theo giờ Việt Nam: "Thứ Hai"… "Chủ nhật". */
export function fmtWeekday(sec: number): string {
  return WEEKDAYS[new Date((sec + VN_OFFSET) * 1000).getUTCDay()] ?? "";
}

/** Số nguyên có dấu chấm ngăn nghìn: 1204 thành "1.204". */
export function fmtInt(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function fmtVnd(n: number): string {
  return `${fmtInt(n)} đ`;
}

/** Đô la từ số cent (đơn Creem lưu cent): 399 thành "$3,99", 123456 thành "$1.234,56". Cùng dấu số với fmtVnd. */
export function fmtUsd(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  return `${cents < 0 ? "-" : ""}$${fmtInt(Math.trunc(abs / 100))},${pad(abs % 100)}`;
}

/**
 * Số tiền của đơn theo loại tiền của nó (orders.currency): VND là đồng, USD là cent; loại lạ thì số kèm mã loại tiền. Thiếu
 * loại tiền (undefined, null hay chuỗi rỗng: phản hồi không đầy đủ) thì coi là VND: mọi đơn từ trước khi có cổng quốc tế đều là
 * đồng, và "50.000 null" hay "50.000 " là chữ hỏng.
 */
export function fmtMoney(n: number, currency: string | null | undefined): string {
  if (currency === "USD") return fmtUsd(n);
  if (currency && currency !== "VND") return `${fmtInt(n)} ${currency}`;
  return fmtVnd(n);
}

/**
 * Thời gian tương đối so với `now` (giây): "vừa xong", "5 phút trước", "2 giờ trước", "3 ngày trước"; từ 30 ngày trở lên
 * (hay ở tương lai quá một phút) thì là ngày đầy đủ dd/MM/yyyy. Đi kèm ngày giờ đầy đủ ở `title`/`<time>` (RelTime).
 */
export function fmtAgo(sec: number, now: number): string {
  const d = now - sec;
  if (d < -60) return fmtDate(sec);
  if (d < 60) return "vừa xong";
  if (d < 3600) return `${Math.floor(d / 60)} phút trước`;
  if (d < DAY) return `${Math.floor(d / 3600)} giờ trước`;
  if (d < 30 * DAY) return `${Math.floor(d / DAY)} ngày trước`;
  return fmtDate(sec);
}

/**
 * Đọc chuỗi ngày giờ ISO của server thành mili giây (NaN nếu không đọc được). Chuỗi có ngày giờ mà không có múi giờ (không
 * có Z hay +07:00) được coi là UTC: Date.parse coi nó là giờ địa phương của máy đang mở trang, sai lệch theo máy.
 */
export function parseIsoUtc(s: string): number {
  const t = s.trim();
  const noZone = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t);
  return Date.parse(noZone ? `${t.replace(" ", "T")}Z` : t);
}

/** Giây Unix thành chuỗi ISO cho thuộc tính dateTime của <time>. */
export function isoOf(sec: number): string {
  return new Date(sec * 1000).toISOString();
}

export function daysLeft(expiresAt: number, now: number): string {
  if (expiresAt <= now) return "đã hết hạn";
  return `còn ${fmtInt(Math.ceil((expiresAt - now) / DAY))} ngày`;
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

/**
 * Các khóa của `detail` nhật ký mang số tiền theo đơn vị nhỏ nhất của loại tiền (đồng với VND, cent với USD): đơn (`amount`,
 * `amount_paid`), số cổng báo (`provider_*`), hoàn tiền (`refunded_amount`). In cent thô thì "3999" dễ đọc nhầm là 3.999 đô.
 */
const MONEY_KEYS: ReadonlySet<string> = new Set([
  "amount",
  "amount_paid",
  "provider_amount",
  "provider_amount_paid",
  "provider_tax_amount",
  "provider_discount_amount",
  "refunded_amount",
]);

/**
 * `detail` JSON của nhật ký thành "khóa: giá trị · …"; không phải object JSON thì trả nguyên. Khi biết loại tiền (khóa
 * `currency` của chính dòng, hay `currency` truyền vào: trang đơn biết loại tiền của đơn mà dòng như order_underpaid không ghi
 * nó) thì các khóa tiền (MONEY_KEYS) có giá trị số in bằng fmtMoney; không biết thì giữ số thô, không đoán.
 */
export function fmtDetail(detail: string | null, currency?: string | null): string {
  if (!detail) return "";
  try {
    const o: unknown = JSON.parse(detail);
    if (o !== null && typeof o === "object" && !Array.isArray(o)) {
      const own = (o as { currency?: unknown }).currency;
      const cur = typeof own === "string" && own !== "" ? own : currency;
      return Object.entries(o)
        .map(([k, v]) => {
          if (cur && MONEY_KEYS.has(k) && typeof v === "number" && Number.isFinite(v)) return `${k}: ${fmtMoney(v, cur)}`;
          return `${k}: ${v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)}`;
        })
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

/**
 * Giờ chính xác dạng ngắn để đứng cạnh thời gian tương đối (điện thoại không xem được title): cùng ngày (GMT+7) với `now`
 * thì "HH:mm", khác ngày thì "dd/MM/yyyy HH:mm".
 */
export function fmtWhen(sec: number, now: number): string {
  return fmtDate(sec) === fmtDate(now) ? fmtHm(sec) : fmtDateTime(sec);
}

/** Số gọn cho trục biểu đồ: 1500 thành "1,5k", 1500000 thành "1,5tr", 2500000000 thành "2,5tỷ"; vạch lẻ dưới 1.000 như 2,5. */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const trim = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
  if (abs >= 1_000_000_000) return `${trim(n / 1_000_000_000)}tỷ`;
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}tr`;
  if (abs >= 1_000) return `${trim(n / 1_000)}k`;
  return trim(n);
}

/** Số gọn của trục tiền theo loại tiền: USD nhập cent, ra đô la ("$1,5k" cho 150000); VND như fmtCompact. */
export function fmtCompactMoney(n: number, currency: string): string {
  return currency === "USD" ? `${n < 0 ? "-" : ""}$${fmtCompact(Math.abs(n) / 100)}` : fmtCompact(n);
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
