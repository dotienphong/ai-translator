import type { MessageKey } from "../i18n";
import type { AppInfo, AudioSource, AudioSourceOption, InputDevice } from "./ipc";

// Nguồn âm thanh ở màn hình chính và Cài đặt › Âm thanh (§4.3, §6.1).

// Giá trị của `<select>` cho một nguồn: "system", "app:<bundle id>", "device:<id>".
export function sourceKey(source: AudioSource | AudioSourceOption): string {
  switch (source.kind) {
    case "system":
      return "system";
    case "app":
      return `app:${source.bundleId}`;
    case "device":
      return `device:${source.id}`;
  }
}

export function sourceFromKey(key: string): AudioSource {
  if (key.startsWith("app:")) return { kind: "app", bundleId: key.slice(4) };
  if (key.startsWith("device:")) return { kind: "device", id: key.slice(7) };
  return { kind: "system" };
}

// Các lựa chọn của danh sách: "toàn hệ thống", các nguồn đọc được lúc này, và nguồn đang chọn nếu lúc này không có
// (app họp chưa phát tiếng, thiết bị đã rút), để danh sách không tự đổi cài đặt.
export function sourceChoices(
  current: AudioSource,
  options: readonly AudioSourceOption[] | null,
): (AudioSource | AudioSourceOption)[] {
  const list: (AudioSource | AudioSourceOption)[] = [{ kind: "system" }, ...(options ?? [])];
  if (!list.some((o) => sourceKey(o) === sourceKey(current))) list.push(current);
  return list;
}

// Tên hiện cho một nguồn. App (macOS): tên hiển thị của app (đọc từ gói `.app`) nếu biết, từ chính lựa chọn hay từ danh
// sách đã đọc; tiến trình của WebKit (`com.apple.WebKit.GPU`, phát tiếng cho Safari và mọi WebView, không nằm trong gói
// `.app` nào) có tên riêng dễ hiểu (N-9 của review 02 lần 2); không thì bundle ID. Thiết bị (Windows): tên thiết bị nếu
// danh sách đã đọc, không thì id.
export function sourceLabel(
  source: AudioSource | AudioSourceOption,
  platform: AppInfo["platform"],
  options: readonly AudioSourceOption[] | null,
  t: (key: MessageKey, params?: Record<string, string>) => string,
): string {
  switch (source.kind) {
    case "system":
      return t(platform === "macos" ? "home.audioSource.system.macos" : "home.audioSource.system.windows");
    case "app": {
      const own = "name" in source ? source.name : null;
      const found = options?.find((o) => o.kind === "app" && o.bundleId === source.bundleId);
      const name = own ?? (found?.kind === "app" ? found.name : null);
      const webkit = source.bundleId.startsWith("com.apple.WebKit.") ? t("home.audioSource.webkit") : null;
      return t("home.audioSource.app", { app: name ?? webkit ?? source.bundleId });
    }
    case "device": {
      if ("name" in source) return source.name;
      const found = options?.find((o) => o.kind === "device" && o.id === source.id);
      return found?.kind === "device" ? found.name : source.id;
    }
  }
}

// Nhãn của nguồn micro ở màn hình chính (spec 2026-10-24-nguon-micro §3.3): "Micro: {tên}". Micro mặc định: tên của micro
// mặc định lúc này nếu danh sách đã đọc; micro đã chọn mà không còn trong danh sách thì hiện id.
export function micLabel(
  micDevice: string | null,
  devices: readonly InputDevice[] | null,
  t: (key: MessageKey, params?: Record<string, string>) => string,
): string {
  const found = devices?.find((d) => (micDevice === null ? d.isDefault : d.id === micDevice));
  const name = found?.name ?? micDevice ?? t("settings.audio.mic.default");
  return t("home.audioSource.mic", { name });
}

// Nhãn của chế độ trộn (spec 2026-10-24-nguon-micro §3.3): "<nguồn âm thanh máy> + Micro: <tên>".
export function bothLabel(
  source: AudioSource,
  micDevice: string | null,
  devices: readonly InputDevice[] | null,
  platform: AppInfo["platform"],
  options: readonly AudioSourceOption[] | null,
  t: (key: MessageKey, params?: Record<string, string>) => string,
): string {
  return t("home.audioSource.both", {
    source: sourceLabel(source, platform, options, t),
    mic: micLabel(micDevice, devices, t),
  });
}
