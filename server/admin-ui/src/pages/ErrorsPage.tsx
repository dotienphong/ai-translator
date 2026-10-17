// Trang Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §4): hai tab, Nhóm lỗi (mặc định) và Gửi tay. Tab đầu đọc từ
// `?tab=manual` của địa chỉ trang khi mở (như AuditPage đọc `?action=`): đường dẫn từ trang chi tiết của báo cáo gửi tay về đúng tab.
import { useState } from "react";
import { SegmentedControl } from "../components/SegmentedControl";
import { ErrorGroupsPanel } from "./ErrorGroupsPanel";
import { ManualReportsPanel } from "./ManualReportsPanel";

type Tab = "groups" | "manual";

function initialTab(): Tab {
  return new URLSearchParams(window.location.search).get("tab") === "manual" ? "manual" : "groups";
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
      ]}
    />
  );
  return tab === "groups" ? <ErrorGroupsPanel tabs={tabs} /> : <ManualReportsPanel tabs={tabs} />;
}
