// Trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): ba tab, Nhóm lỗi (mặc định), Gửi tay và Bộ đọc tên (spec
// 2026-10-26-phan-biet-nguoi-noi §7.2). Tab đầu đọc từ `?tab=manual` hay `?tab=speaker` của địa chỉ trang khi mở (như AuditPage đọc
// `?action=`): đường dẫn từ trang chi tiết của báo cáo gửi tay về đúng tab.
import { useState } from "react";
import { SegmentedControl } from "../components/SegmentedControl";
import { ErrorGroupsPanel } from "./ErrorGroupsPanel";
import { ManualReportsPanel } from "./ManualReportsPanel";
import { SpeakerHealthPanel } from "./SpeakerHealthPanel";

type Tab = "groups" | "manual" | "speaker";

function initialTab(): Tab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "manual" || tab === "speaker" ? tab : "groups";
}

export function ErrorsPage() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs = (
    <SegmentedControl
      label="Loại báo cáo"
      value={tab}
      onChange={setTab}
      options={[
        { value: "groups", label: "Nhóm lỗi" },
        { value: "manual", label: "Gửi tay" },
        { value: "speaker", label: "Bộ đọc tên" },
      ]}
    />
  );
  if (tab === "speaker") return <SpeakerHealthPanel tabs={tabs} />;
  return tab === "groups" ? <ErrorGroupsPanel tabs={tabs} /> : <ManualReportsPanel tabs={tabs} />;
}
