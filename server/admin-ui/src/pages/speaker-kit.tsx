// Phần chung của tab Bộ đọc tên (spec 2026-10-26-phan-biet-nguoi-noi §7.2): tên app họp, nhãn và tông của tình trạng, cột của ba bảng.
// Dữ liệu không có tên người; mẫu chỉ báo tự học (vai trò, vị trí, lớp) hiện dạng văn bản, không bao giờ dựng HTML từ nó.
import type { SpeakerCanaryRow, SpeakerHealthRow } from "../api/types";
import { Badge, type Tone } from "../components/Badge";
import { Cell2, WhenCell } from "../components/columns";
import type { Column } from "../components/DataTable";
import { fmtInt } from "../format";

export const APP_LABELS: Record<string, string> = {
  teams: "Microsoft Teams",
  zoom: "Zoom",
  meet_chrome: "Google Meet (Chrome)",
  meet_edge: "Google Meet (Edge)",
};

export const STATE_LABELS: Record<string, string> = {
  ok: "Đọc được tên",
  no_names: "Không thấy tên",
  no_speaking: "Không thấy ai đang nói",
  no_permission: "Chưa có quyền Trợ năng",
  blocked: "App họp không trả lời",
};

export const STATE_TONES: Record<string, Tone> = {
  ok: "ok",
  no_names: "bad",
  no_speaking: "bad",
  no_permission: "neutral",
  blocked: "warn",
};

export const appLabel = (app: string): string => APP_LABELS[app] ?? app;

export function StateBadge({ state }: { state: string }) {
  return <Badge tone={STATE_TONES[state] ?? "neutral"}>{STATE_LABELS[state] ?? state}</Badge>;
}

/** Số báo cáo hỏng (không đọc được tên, không thấy ai đang nói, app họp không trả lời) của một dòng. */
export const brokenOf = (r: Pick<SpeakerHealthRow, "no_names" | "no_speaking" | "blocked">): number => r.no_names + r.no_speaking + r.blocked;

/**
 * Ngưỡng cảnh báo của cron (`DEGRADED_*` ở server/src/speaker-health.ts): từ chừng này báo cáo, ít nhất chừng này máy hỏng, và từ chừng này
 * phần số máy hỏng. Giữ khớp với server (đếm MÁY, không đếm báo cáo). Dòng ở đây gộp theo hệ điều hành và theo số ngày đang xem, còn cron
 * gộp theo (app họp, phiên bản) trong 3 ngày, nên huy hiệu chỉ là gợi ý cùng luật, không phải đúng từng email.
 */
const DEGRADED_MIN_REPORTS = 5;
const DEGRADED_MIN_DEVICES = 3;
const DEGRADED_SHARE = 0.3;

/** Dòng này vượt ngưỡng cảnh báo "hỏng" của cron (theo số máy). */
export const isDegraded = (r: Pick<SpeakerHealthRow, "reports" | "devices" | "broken_devices">): boolean =>
  r.reports >= DEGRADED_MIN_REPORTS && r.broken_devices >= DEGRADED_MIN_DEVICES && r.devices > 0 && r.broken_devices / r.devices >= DEGRADED_SHARE;

const percent = (part: number, whole: number): string => (whole === 0 ? "—" : `${Math.round((part * 100) / whole)}%`);

/** Cột bảng tình trạng theo phiên bản. `now` (giây): mốc của lần tải. */
export function healthColumns(now: number): Column<SpeakerHealthRow>[] {
  return [
    {
      header: "App họp",
      primary: true,
      cell: (r) => <Cell2 main={appLabel(r.meeting_app)} sub={r.meeting_version === "?" ? "không rõ phiên bản" : r.meeting_version} />,
    },
    { header: "Hệ điều hành", nowrap: true, cell: (r) => r.os_name },
    { header: "Máy", align: "right", cell: (r) => fmtInt(r.devices) },
    { header: "Báo cáo", align: "right", cell: (r) => fmtInt(r.reports) },
    {
      header: "Hỏng",
      align: "right",
      aside: true,
      cell: (r) => {
        return <Badge tone={isDegraded(r) ? "bad" : brokenOf(r) > 0 ? "warn" : "ok"}>{`${fmtInt(r.broken_devices)}/${fmtInt(r.devices)} máy (${percent(r.broken_devices, r.devices)})`}</Badge>;
      },
    },
    {
      header: "Chưa có quyền",
      align: "right",
      hideOnMobile: true,
      cell: (r) => fmtInt(r.no_permission),
    },
    {
      header: "Phút đọc được tên",
      align: "right",
      nowrap: true,
      cell: (r) => <Cell2 main={percent(r.minutes_ok, r.minutes_total)} sub={`${fmtInt(r.minutes_ok)} / ${fmtInt(r.minutes_total)}`} />,
    },
    { header: "Công thức", align: "right", hideOnMobile: true, cell: (r) => fmtInt(r.recipe_version) },
    { header: "Gần nhất", nowrap: true, cell: (r) => <WhenCell sec={r.last_at} now={now} /> },
  ];
}

/** Cột bảng kiểm tra tự động hằng ngày. */
export function canaryColumns(): Column<SpeakerCanaryRow>[] {
  return [
    { header: "Ngày", primary: true, nowrap: true, cell: (r) => r.day },
    { header: "App họp", cell: (r) => <Cell2 main={appLabel(r.meeting_app)} sub={r.meeting_version === "?" ? undefined : r.meeting_version} /> },
    { header: "Hệ điều hành", nowrap: true, cell: (r) => r.os_name },
    { header: "Kết quả", aside: true, cell: (r) => <StateBadge state={r.state} /> },
    { header: "Công thức", align: "right", hideOnMobile: true, cell: (r) => fmtInt(r.recipe_version) },
    { header: "Bản app", nowrap: true, hideOnMobile: true, cell: (r) => r.app_version },
  ];
}
