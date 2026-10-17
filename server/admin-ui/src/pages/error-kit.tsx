// Phần chung của các trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): tên và tông theo loại báo cáo, đường dẫn
// các trang, chuẩn hóa mã báo cáo người vận hành gõ, và cột của hai bảng (nhóm; báo cáo của tab Gửi tay và của trang nhóm).
import type { ErrorGroup, ErrorReport, ReportKind } from "../api/types";
import { Badge, type Tone } from "../components/Badge";
import { Cell2, WhenCell } from "../components/columns";
import type { Column } from "../components/DataTable";
import { PLAN_LABELS } from "../components/StatusBadge";
import { fmtBytes, fmtInt, shortHash } from "../format";
import { Link } from "../router";

export const KIND_LABELS: Record<ReportKind, string> = {
  crash: "App chết",
  session_error: "Phiên dịch lỗi",
  sidecar_died: "Tiến trình phụ chết",
  manual: "Gửi tay",
};

export const KIND_TONES: Record<ReportKind, Tone> = {
  crash: "bad",
  session_error: "warn",
  sidecar_died: "warn",
  manual: "info",
};

/** Loại lạ (server thêm sau giao diện) vẫn hiện nguyên mã, tông trung tính. */
export function KindBadge({ kind }: { kind: ReportKind }) {
  return <Badge tone={KIND_TONES[kind] ?? "neutral"}>{KIND_LABELS[kind] ?? kind}</Badge>;
}

/** Báo cáo của bản debug (máy dev): huy hiệu nhỏ cạnh phiên bản. Bản release không có gì. */
export function BuildBadge({ build }: { build: ErrorReport["build"] }) {
  return build === "debug" ? (
    <Badge tone="info" dot={false} outline>
      debug
    </Badge>
  ) : null;
}

/** Cùng mẫu với server (server/src/error-reports.ts): bảng Crockford, không có chữ I, L, O, U. */
export const REPORT_ID_PATTERN = /^R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
export const VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,40}$/;

/** Mã báo cáo người vận hành gõ hay dán: bỏ khoảng trắng hai đầu, viết hoa. Hợp lệ thì trả mã, không thì null. */
export function parseReportId(raw: string): string | null {
  const id = raw.trim().toUpperCase();
  return REPORT_ID_PATTERN.test(id) ? id : null;
}

export const groupPath = (fingerprint: string) => `/errors/groups/${fingerprint}`;
export const reportPath = (id: string) => `/errors/reports/${id}`;

const OS_NAMES: Record<string, string> = { macos: "macOS", windows: "Windows" };

export function osText(r: Pick<ErrorReport, "os_name" | "os_version" | "arch">): string {
  return `${OS_NAMES[r.os_name] ?? r.os_name} ${r.os_version} (${r.arch})`;
}

/** RAM theo MB thành chữ ("24 GB"); không biết thì null. */
export function ramText(mb: number | null): string | null {
  return mb === null ? null : fmtBytes(mb * 1024 * 1024);
}

export const GPU_LABELS: Record<string, string> = { metal: "Metal", vulkan: "Vulkan", cpu: "CPU (không có GPU)" };
export const REPORT_PLAN_LABELS: Record<string, string> = { free: "Free", ...PLAN_LABELS };

/** Tối đa ba phiên bản, còn lại gộp thành "+n". */
export function versionsText(versions: readonly string[]): string {
  return versions.length <= 3 ? versions.join(", ") : `${versions.slice(0, 3).join(", ")} +${versions.length - 3}`;
}

/** Cột bảng nhóm lỗi. `now` (giây): mốc của lần tải, cho thời gian tương đối. */
export function groupColumns(now: number): Column<ErrorGroup>[] {
  return [
    {
      header: "Mã lỗi",
      primary: true,
      cell: (g) => (
        <Cell2
          main={
            <Link to={groupPath(g.fingerprint)} className="row-id mono">
              {g.code ?? "—"}
            </Link>
          }
          sub={g.fingerprint}
        />
      ),
    },
    { header: "Loại", aside: true, cell: (g) => <KindBadge kind={g.kind} /> },
    { header: "Phiên bản", nowrap: true, cell: (g) => versionsText(g.versions) },
    { header: "Máy", align: "right", cell: (g) => fmtInt(g.devices) },
    {
      header: "Báo cáo",
      align: "right",
      cell: (g) => <Cell2 main={fmtInt(g.reports)} sub={g.debug_reports > 0 ? `${fmtInt(g.debug_reports)} debug` : undefined} />,
    },
    { header: "Lần đầu", nowrap: true, hideOnMobile: true, cell: (g) => <WhenCell sec={g.first_at} now={now} /> },
    { header: "Gần nhất", nowrap: true, cell: (g) => <WhenCell sec={g.last_at} now={now} /> },
  ];
}

/** Cột bảng báo cáo (tab Gửi tay, trang nhóm): mã báo cáo mở trang chi tiết, máy mở trang máy. */
export function reportColumns(now: number): Column<ErrorReport>[] {
  return [
    {
      header: "Mã báo cáo",
      primary: true,
      nowrap: true,
      cell: (r) => (
        <Link to={reportPath(r.id)} className="row-id mono">
          {r.id}
        </Link>
      ),
    },
    { header: "Nhận lúc", nowrap: true, cell: (r) => <WhenCell sec={r.received_at} now={now} /> },
    {
      header: "Phiên bản",
      nowrap: true,
      cell: (r) => (
        <span className="cell-version">
          {r.app_version}
          <BuildBadge build={r.build} />
        </span>
      ),
    },
    {
      header: "Máy",
      cell: (r) => (
        <Link to={`/devices/${r.device_id_hash}`} className="mono" title={r.device_id_hash}>
          {shortHash(r.device_id_hash)}
        </Link>
      ),
    },
    { header: "Hệ điều hành", cell: (r) => <Cell2 main={osText(r)} sub={r.chip ?? undefined} /> },
    {
      header: "Thông báo",
      cell: (r) =>
        r.message === "" ? (
          <span className="cell-none">Không có</span>
        ) : (
          <span className="cell-msg" title={r.message}>
            {r.message}
          </span>
        ),
    },
  ];
}
