import type { LicensePlan, QuotaView } from "../../lib/ipc";
import { minutesLeft, quotaKey } from "../../lib/license";
import { dateTime, localOffsetMinutes } from "../../lib/subtitleView";
import { useT } from "./appStore";

// Ngày giờ địa phương của một mốc (giây Unix).
export function when(seconds: number | null): string {
  if (seconds === null) return "";
  const ms = seconds * 1000;
  return dateTime(ms, localOffsetMinutes(ms));
}

export function PlanName({ plan }: { plan: LicensePlan }) {
  return <>{useT()(`plan.${plan}`)}</>;
}

// Câu tóm tắt hạn mức: số phút còn lại và lúc mở lại (§4.2 bước 2).
export function QuotaSummary({ quota }: { quota: QuotaView }) {
  const t = useT();
  const key = quotaKey(quota);
  const resetKey = quota.resetKind === "expiry" ? "quota.expiresAt" : "quota.resetAt";
  return (
    <span>
      {t(key, { minutes: minutesLeft(quota) })}
      {quota.resetAt !== null && !quota.unlimited && key !== "quota.lost" && key !== "quota.storageError" && (
        <span className="hint"> · {t(resetKey, { time: when(quota.resetAt) })}</span>
      )}
    </span>
  );
}
