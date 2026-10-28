// Tab Bộ đọc tên của trang Báo cáo lỗi (spec 2026-10-26-phan-biet-nguoi-noi §7.2): tình trạng bộ đọc tên người nói theo app họp,
// phiên bản app họp và hệ điều hành (báo cáo của người dùng, bản release), kết quả kiểm tra tự động hằng ngày, và các mẫu chỉ báo tự
// học mới nhất (cho người cập nhật công thức). Không có tên người trong dữ liệu. Báo cáo tự xóa sau 60 ngày.
import { type ReactNode, useState } from "react";
import { api } from "../api/endpoints";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { DataTable } from "../components/DataTable";
import { ErrorBox } from "../components/Feedback";
import { IconRefresh } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { SegmentedControl } from "../components/SegmentedControl";
import { fmtInt, nowSec } from "../format";
import { useLoad } from "../hooks";
import { appLabel, canaryColumns, healthColumns } from "./speaker-kit";

type Days = "7" | "30";

/** `tabs`: công tắc chuyển tab của ErrorsPage, đặt cạnh nút Làm mới ở đầu trang. */
export function SpeakerHealthPanel({ tabs }: { tabs: ReactNode }) {
  const [days, setDays] = useState<Days>("7");
  const load = useLoad(() => api.speakerHealth(Number(days)), [days]);
  const data = load.data;
  const now = data?.generated_at ?? nowSec();
  const reports = data?.rows.reduce((n, r) => n + r.reports, 0) ?? 0;
  return (
    <>
      <PageHeader
        title="Báo cáo lỗi"
        description={
          <p className="page-meta">
            <span>
              Tình trạng bộ đọc tên người nói ở máy người dùng: {fmtInt(reports)} báo cáo trong {days} ngày qua. Không có tên người. Báo
              cáo tự xóa sau 60 ngày.
            </span>
          </p>
        }
        actions={
          <>
            {tabs}
            <SegmentedControl<Days>
              label="Khoảng thời gian"
              size="sm"
              value={days}
              onChange={setDays}
              options={[
                { value: "7", label: "7 ngày" },
                { value: "30", label: "30 ngày" },
              ]}
            />
            <Button icon={<IconRefresh size={16} />} loading={load.loading} onClick={load.reload}>
              Làm mới
            </Button>
          </>
        }
      />
      {load.error && <ErrorBox error={load.error} onRetry={load.reload} title="Không tải được tình trạng bộ đọc tên" />}
      {!load.error && (
        <>
          <Card flush aria-label="Tình trạng theo phiên bản" title="Theo app họp và phiên bản" className="list-card">
            <DataTable
              flush
              caption="Tình trạng bộ đọc tên theo app họp, phiên bản và hệ điều hành"
              columns={healthColumns(now)}
              rows={data?.rows ?? []}
              rowKey={(r) => `${r.meeting_app}|${r.meeting_version}|${r.os_name}`}
              loading={load.loading && data === null}
              empty="Chưa có báo cáo tình trạng nào"
              emptyHint="Báo cáo hiện ở đây khi người dùng đã dịch trong cuộc họp Teams, Meet hay Zoom và gửi báo cáo (mỗi ngày một lần)."
            />
          </Card>
          <Card
            flush
            aria-label="Kiểm tra tự động"
            title="Kiểm tra tự động hằng ngày"
            description="Chạy ban đêm trên máy của chủ dự án (tools/speaker-canary). Hỏng hai ngày liền thì có email cảnh báo."
            className="list-card"
          >
            <DataTable
              flush
              caption="Kết quả kiểm tra tự động hằng ngày"
              columns={canaryColumns()}
              rows={data?.canary ?? []}
              rowKey={(r) => `${r.day}|${r.meeting_app}|${r.os_name}|${r.meeting_version}`}
              loading={load.loading && data === null}
              empty="Chưa có kết quả kiểm tra tự động"
            />
          </Card>
          <Card
            aria-label="Mẫu chỉ báo tự học"
            title="Mẫu chỉ báo tự học mới nhất"
            description="Khi công thức không còn khớp, bộ đọc tự tìm phần tử đổi theo tiếng nói. Mẫu dưới đây (vai trò, vị trí trong ô, lớp) giúp sửa công thức."
          >
            {(data?.patterns ?? []).length === 0 ? (
              <p className="muted">Chưa có mẫu nào.</p>
            ) : (
              <ul className="plain-list">
                {data?.patterns.map((p, i) => (
                  <li key={`${p.meeting_app}|${p.meeting_version}|${p.day}|${i}`}>
                    <strong>{appLabel(p.meeting_app)}</strong> {p.meeting_version === "?" ? "" : p.meeting_version} · {p.day} · công thức {p.recipe_version}
                    <pre className="log-pre">{JSON.stringify(p.patterns)}</pre>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
