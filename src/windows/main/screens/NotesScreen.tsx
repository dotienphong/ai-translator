import { type MouseEvent, useEffect, useRef, useState } from "react";
import { EmptyState } from "../../../components/EmptyState";
import { Field } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import { errorKey, type MessageKey, type Params, type UiLanguage, translate } from "../../../i18n";
import {
  type ExportFormat,
  type Notes,
  type NotesTemplate,
  type NotesView,
  type TranscriptRef,
  type TranslationKeysStatus,
  tauriIpc,
} from "../../../lib/ipc";
import type { NotesPack } from "../../../lib/models";
import { type Gate, type GateInput, type NotesSource, gate as gateOf, sourceLabel, sourceOf, templateOf } from "../../../lib/notes";
import { dateTime, localOffsetMinutes } from "../../../lib/subtitleView";
import { type UiError, toUiError } from "../../../store/app";
import { type NotesDialog, type NotesNotice, type NotesStoreState, sameRef } from "../../../store/notes";
import { useApp } from "../appStore";
import { notesStore, useNotes } from "../dataStores";
import { type Banner, pickBanner } from "../notes/banner";
import { NotesDialogs } from "../notes/NotesDialogs";
import { NotesPackPanel } from "../notes/NotesPackPanel";
import { NotesResult } from "../notes/NotesResult";
import { NotesSessionRail, NotesSessionSelect, sessionTitle } from "../notes/NotesSessionList";
import { NotesSourcePanel } from "../notes/NotesSourcePanel";
import { useModels } from "../modelsStore";

const TEMPLATES: readonly NotesTemplate[] = ["meeting", "lecture", "brief"];
// Lỗi của nhà cung cấp cloud: cho thử lại, hay chuyển sang model trên máy nếu gói đã cài (spec mục 7).
const CLOUD_FAILURES: readonly string[] = [
  "notesOffline",
  "notesAuthFailed",
  "notesRateLimited",
  "notesNoBalance",
  "notesCloudFailed",
  "notesKeyMissing",
];

export interface NotesScreenViewProps {
  lang: UiLanguage;
  targets: NotesStoreState["targets"];
  selected: TranscriptRef | null;
  view: NotesView | null;
  // Bản đang sửa tay; `null` khi không sửa.
  draft: Notes | null;
  dialog: NotesDialog | null;
  sourcePanel: NotesStoreState["source"];
  notice: NotesNotice | null;
  error: UiError | null;
  source: NotesSource;
  // Đã tính từ `gate(input, ∅)`: nút Tạo bị khóa khi `blocked`.
  gate: Gate;
  template: NotesTemplate;
  pack: NotesPack;
  freeDiskBytes: number;
  auto: boolean;
  pro: boolean;
  // Gói ghi chú trên máy đã cài: lỗi cloud mới có nút "Dùng model trên máy".
  localUsable: boolean;
  // Đang hỏi bỏ bản sửa trước khi đổi phiên.
  confirmDiscard: boolean;
  // Ghi chú mới hơn (tạo tự động hay tạo lại) về trong lúc đang sửa tay: bản sửa giữ nguyên, người dùng chọn lưu hay bỏ.
  staleDraft: boolean;
  onSelect(ref: TranscriptRef): void;
  onTemplate(template: NotesTemplate): void;
  onGenerate(): void;
  onCancel(): void;
  onEdit(next: Notes): void;
  onSave(): void;
  onDiscard(): void;
  onOpenSource(refs: number[]): void;
  onCloseSource(): void;
  onCopy(): void;
  onExport(format: ExportFormat): void;
  onDialogConfirm(remember: boolean): void;
  onDialogDismiss(): void;
  onOpenModelSettings(): void;
  onUpgrade(): void;
  onUseLocal(): void;
  onDownloadPack(): void;
  onCancelPack(): void;
  onDeletePack(): void;
  onAuto(on: boolean): void;
  onDismissError(): void;
  onConfirmDiscard(): void;
  onCancelDiscard(): void;
}

// Màn hình Ghi chú cuộc họp (spec 2026-11-11-ghi-chu-cuoc-hop-design §7), bố cục hai cột: cột "Cuộc họp" bên trái (cửa sổ hẹp thì là ô
// chọn), bên phải là đầu trang (tên phiên, sửa/chép/xuất), thanh công cụ (mẫu, nguồn, nút Tạo), MỘT thông báo gấp nhất, rồi kết quả kèm
// khung đối chiếu câu gốc; chưa có ghi chú thì là thẻ bắt đầu. Phần hiển thị thuần: mọi quyết định (có hỏi không, tạo được không) đã nằm
// ở `gate` và store.
export function NotesScreenView(p: NotesScreenViewProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  const { view, gate } = p;
  const running = view?.status === "running";
  const editing = p.draft !== null;
  const stored = view?.notes ?? null;
  const targets = p.pro ? p.targets : p.targets.filter((x) => x.ref.kind === "current");

  if (targets.length === 0) return <EmptyState icon="notes" text={t("notes.empty")} />;

  const blockedText = (reason: Extract<Gate, { kind: "blocked" }>["reason"]): string => {
    switch (reason) {
      case "empty":
        return t("error.notesEmpty");
      case "sessionRunning":
        return t("notes.blocked.sessionRunning");
      case "localSessionActive":
        return t("error.notesLocalSessionActive");
      case "freeUsedUp":
        return t("notes.free.usedUp");
      case "localUnavailable":
        return t("error.notesLocalUnavailable");
      case "packMissing":
        return t("error.notesLocalPackMissing");
      case "packDownloading":
        return t("notes.blocked.packDownloading");
      case "keyMissing":
        return t("notes.blocked.keyMissing", { provider: p.source.kind === "cloud" ? providerName(p.source) : "" });
    }
  };
  const setupOpen = gate.kind === "blocked" && (gate.reason === "packMissing" || gate.reason === "packDownloading");
  // Chưa có ghi chú mà thiếu gói: tải gói ngay trong thẻ bắt đầu, không bắt người dùng đi tìm khối Thiết lập.
  const packInStart = stored === null && !running && setupOpen;
  const failure = view?.status === "failed" && view.error !== null ? view.error : null;
  const banner = pickBanner({
    confirmDiscard: p.confirmDiscard,
    error: p.error,
    failure,
    editing,
    staleDraft: p.staleDraft,
    notice: p.notice,
    unsaved: stored !== null && view !== null && !view.persisted,
  });
  const selectedTarget = targets.find((x) => sameRef(x.ref, p.selected)) ?? null;
  const listProps = { lang: p.lang, targets, selected: p.selected, pro: p.pro, onSelect: p.onSelect };
  const closeMenu = (e: MouseEvent<HTMLButtonElement>) => e.currentTarget.closest("details")?.removeAttribute("open");

  const renderBanner = (b: Banner) => {
    switch (b.kind) {
      case "discard":
        return (
          <div className="notice warning" role="alertdialog" aria-label={t("notes.discard.ask")}>
            <Icon name="alert" />
            <span>{t("notes.discard.ask")}</span>
            <button type="button" onClick={p.onConfirmDiscard}>
              {t("notes.edit.discard")}
            </button>
            <button type="button" onClick={p.onCancelDiscard}>
              {t("notes.cancel")}
            </button>
          </div>
        );
      case "error":
        return (
          <div className="notice error" role="alert">
            <Icon name="alert" />
            <span>{t(errorKey(b.code))}</span>
            <button type="button" onClick={p.onDismissError}>
              {t("common.dismiss")}
            </button>
          </div>
        );
      case "failure":
        return (
          <div className="notice error" role="alert">
            <Icon name="alert" />
            <span>{t(errorKey(b.code))}</span>
            {CLOUD_FAILURES.includes(b.code) && (
              <>
                <button type="button" onClick={p.onGenerate}>
                  {t("notes.error.retry")}
                </button>
                {p.localUsable && (
                  <button type="button" onClick={p.onUseLocal}>
                    {t("notes.error.useLocal")}
                  </button>
                )}
              </>
            )}
          </div>
        );
      case "stale":
        return (
          <div className="notice warning" role="alert">
            <Icon name="alert" />
            <span>{t("notes.draft.stale")}</span>
          </div>
        );
      case "notice":
        return (
          <div className="notice" role="status">
            <Icon name="check" />
            <span>{b.notice.kind === "copied" ? t("notes.copied") : t("notes.exported", { path: b.notice.path })}</span>
          </div>
        );
      case "unsaved":
        return (
          <div className="notice warning" role="note">
            <Icon name="alert" />
            <span>{t("notes.unsaved")}</span>
          </div>
        );
    }
  };

  const headActions =
    stored === null ? null : editing ? (
      <>
        <button type="button" className="primary" onClick={p.onSave}>
          {t("notes.edit.save")}
        </button>
        <button type="button" onClick={p.onDiscard}>
          {t("notes.edit.discard")}
        </button>
      </>
    ) : (
      <>
        <button type="button" onClick={() => p.onEdit(stored.body)} disabled={running}>
          <Icon name="edit" size={16} />
          {t("notes.edit")}
        </button>
        <button type="button" onClick={p.onCopy}>
          <Icon name="copy" size={16} />
          {t("notes.copy")}
        </button>
        {p.pro && (
          <details className="notes-menu">
            <summary>
              <Icon name="download" size={16} />
              {t("notes.export.menu")}
            </summary>
            <div className="notes-menu-list">
              <button
                type="button"
                onClick={(e) => {
                  closeMenu(e);
                  p.onExport("markdown");
                }}
              >
                {t("notes.export.md")}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  closeMenu(e);
                  p.onExport("txt");
                }}
              >
                {t("notes.export.txt")}
              </button>
            </div>
          </details>
        )}
      </>
    );

  // Thiết lập nằm ngay dưới tiêu đề màn hình, trên danh sách cuộc họp: gói model và tự tạo ghi chú áp cho mọi cuộc họp.
  const setup = (
    <details className="card notes-setup" open={setupOpen && !packInStart}>
      <summary>
        <Icon name="settings" />
        {t("notes.settings.title")}
      </summary>
      {!packInStart && (
        <NotesPackPanel
          lang={p.lang}
          pack={p.pack}
          onDownload={p.onDownloadPack}
          onCancel={p.onCancelPack}
          onDelete={p.onDeletePack}
        />
      )}
      <Field label={t("notes.auto")} htmlFor="notes-auto">
        <input
          id="notes-auto"
          className="switch"
          type="checkbox"
          checked={p.auto}
          onChange={(e) => p.onAuto(e.target.checked)}
        />
      </Field>
    </details>
  );

  return (
    <div className="notes-page">
      {setup}
      <div className="notes-layout">
        <NotesSessionRail {...listProps} />
        <div className="notes-main">
          <NotesSessionSelect {...listProps} />

          <div className="notes-banner">{banner && renderBanner(banner)}</div>

          <div className="notes-head">
            <div className="notes-head-text">
              <h2 className="notes-title">{selectedTarget ? sessionTitle(selectedTarget, t) : t("notes.sessions.title")}</h2>
              {stored && (
                <p className="notes-sub">
                  {t("notes.meta.created", { time: dateTime(stored.createdAt, localOffsetMinutes(stored.createdAt)) })}
                </p>
              )}
            </div>
            {headActions && <div className="notes-head-actions">{headActions}</div>}
          </div>

          <div className="notes-toolbar">
            <label className="notes-chip notes-chip-field" htmlFor="notes-template">
              <span>{t("notes.template.label")}</span>
              <select
                id="notes-template"
                value={p.template}
                disabled={running}
                onChange={(e) => p.onTemplate(e.target.value as NotesTemplate)}
              >
                {TEMPLATES.map((x) => (
                  <option key={x} value={x}>
                    {t(`notes.template.${x}`)}
                  </option>
                ))}
              </select>
            </label>
            <span className="notes-chip">
              <Icon name={p.source.kind === "local" ? "cpu" : "sparkle"} size={14} />
              {t("notes.source.chip", { source: sourceLabel(p.source, t) })}
              <button type="button" className="notes-chip-link" title={t("notes.source.change")} onClick={p.onOpenModelSettings}>
                {t("notes.source.changeShort")}
              </button>
            </span>
            <span className="notes-spacer" />
            {running ? (
              <button type="button" onClick={p.onCancel}>
                {t("notes.cancel")}
              </button>
            ) : (
              <button
                type="button"
                className={editing ? undefined : "primary"}
                disabled={gate.kind === "blocked" || editing}
                onClick={p.onGenerate}
              >
                <Icon name="sparkle" size={16} />
                {stored ? t("notes.regenerate") : t("notes.generate")}
              </button>
            )}
            {gate.kind === "blocked" && (
              <p className="hint notes-blocked" role="status">
                {blockedText(gate.reason)}
              </p>
            )}
            {gate.kind === "blocked" && gate.reason === "freeUsedUp" && !p.pro && (
              <button type="button" onClick={p.onUpgrade}>
                <Icon name="upgrade" size={16} />
                {t("pro.upgrade")}
              </button>
            )}
            {!p.pro && view?.freeLeft != null && view.freeLeft > 0 && (
              <p className="hint">{t("notes.free.left", { n: view.freeLeft })}</p>
            )}
          </div>

          {running && (
            <div className="notes-running" role="status">
              <progress
                max={Math.max(1, view?.progress?.[1] ?? 0)}
                value={view?.progress?.[0] ?? 0}
                aria-label={t("notes.progress", { done: view?.progress?.[0] ?? 0, total: view?.progress?.[1] ?? 0 })}
              />
              <span>{t("notes.progress", { done: view?.progress?.[0] ?? 0, total: view?.progress?.[1] ?? 0 })}</span>
            </div>
          )}

          {stored === null && running && (
            <div className="notes-skeleton" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
          )}

          {stored === null && !running && (
            <section className="notes-start">
              <Icon name="notes" size={28} />
              <h3>{t("notes.start.title")}</h3>
              <p>{t("notes.start.body")}</p>
              {packInStart && (
                <NotesPackPanel
                  lang={p.lang}
                  pack={p.pack}
                  onDownload={p.onDownloadPack}
                  onCancel={p.onCancelPack}
                  onDelete={p.onDeletePack}
                />
              )}
            </section>
          )}

          {stored && (
            <div className={p.sourcePanel ? "notes-body has-source" : "notes-body"}>
              <NotesResult
                lang={p.lang}
                notes={p.draft ?? stored.body}
                source={stored.source}
                editing={editing}
                onEdit={p.onEdit}
                onOpenSource={p.onOpenSource}
              />
              {p.sourcePanel && (
                <NotesSourcePanel
                  lang={p.lang}
                  lines={p.sourcePanel.lines}
                  speakers={p.sourcePanel.speakers}
                  refs={p.sourcePanel.refs}
                  onClose={p.onCloseSource}
                />
              )}
            </div>
          )}
          {stored && !p.pro && !editing && <p className="hint">{t("notes.export.pro")}</p>}

          <NotesDialogs
            lang={p.lang}
            dialog={p.dialog}
            provider={p.source}
            onConfirm={p.onDialogConfirm}
            onDismiss={p.onDialogDismiss}
            onOpenModelSettings={p.onOpenModelSettings}
          />
        </div>
      </div>
    </div>
  );
}

// Tên nhà cung cấp trong câu "Chưa có API key cho ...": ChatGPT, Gemini hay DeepSeek (tên sản phẩm, như ở Cài đặt > Model).
function providerName(source: Extract<NotesSource, { kind: "cloud" }>): string {
  return source.provider === "openai" ? "ChatGPT" : source.provider === "gemini" ? "Gemini" : "DeepSeek";
}

const hasKeyFor = (source: NotesSource, keys: TranslationKeysStatus | null): boolean => {
  if (source.kind === "local") return false;
  if (source.provider === "openai") return keys?.openaiConfigured ?? false;
  if (source.provider === "gemini") return keys?.geminiConfigured ?? false;
  return keys?.deepseekConfigured ?? false;
};

const EMPTY_PACK: NotesPack = { state: "unavailable", bytes: 0, done: 0, minRamMib: 0 };

// Nối màn hình với store ghi chú, cài đặt, trạng thái phiên, gói model và key. Đổi phiên khi đang sửa tay thì hỏi trước (không bỏ
// bản sửa trong im lặng). Gói Free chỉ thấy phiên hiện tại.
export function NotesScreen() {
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);
  const navigate = useApp((s) => s.navigate);
  const updateSettings = useApp((s) => s.updateSettings);
  const pro = useApp((s) => s.status?.pro ?? false);
  const lang: UiLanguage = settings?.uiLanguage ?? "en";
  const targets = useNotes((s) => s.targets);
  const selected = useNotes((s) => s.selected);
  const view = useNotes((s) => s.view);
  const draft = useNotes((s) => s.draft);
  const dialog = useNotes((s) => s.dialog);
  const sourcePanel = useNotes((s) => s.source);
  const notice = useNotes((s) => s.notice);
  const error = useNotes((s) => s.error);
  const models = useModels((s) => s.view);
  const loadModels = useModels((s) => s.load);
  const template = templateOf(settings);
  const [keys, setKeys] = useState<TranslationKeysStatus | null>(null);
  const [pendingSelect, setPendingSelect] = useState<TranscriptRef | null>(null);
  // Thời điểm dựng của ghi chú lúc bắt đầu sửa: ghi chú đổi sang bản khác trong lúc sửa thì báo (`staleDraft`).
  const draftBase = useRef<number | null>(null);

  const source: NotesSource = settings ? sourceOf(settings) : { kind: "local" };
  const pack = models?.notes ?? EMPTY_PACK;
  const state = notesStore.getState();

  useEffect(() => {
    void state.init();
    void loadModels();
    // `init` nghe sự kiện một lần (tự kiểm tra bên trong); chỉ chạy khi vào màn hình.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (source.kind === "local") return;
    let cancelled = false;
    void tauriIpc
      .invoke("get_translation_keys")
      .then((k) => {
        if (!cancelled && k) setKeys(k);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source.kind === "cloud" ? source.provider : "local"]);
  // Gói đang tải: hỏi lại tiến độ mỗi giây (spec mục 7).
  useEffect(() => {
    if (pack.state !== "downloading") return;
    const id = setInterval(() => void loadModels(), 1000);
    return () => clearInterval(id);
  }, [pack.state, loadModels]);
  // Gói Free chỉ có phiên hiện tại: một phiên Lịch sử đang chọn từ lần dùng Pro trước thì chuyển về phiên hiện tại.
  useEffect(() => {
    if (!pro && selected?.kind === "history" && targets.some((x) => x.ref.kind === "current")) {
      void notesStore.getState().select({ kind: "current" });
    }
  }, [pro, selected, targets]);

  const visible = pro ? targets : targets.filter((x) => x.ref.kind === "current");
  const shown = selected !== null && visible.some((x) => sameRef(x.ref, selected));
  const current = shown ? selected : null;
  const existing = view?.notes == null ? "none" : view.notes.edited ? "edited" : "generated";
  if (draft === null) draftBase.current = null;
  else if (draftBase.current === null) draftBase.current = view?.notes?.createdAt ?? null;
  const staleDraft = draft !== null && draftBase.current !== null && view?.notes?.createdAt !== draftBase.current;
  const input = (override?: NotesSource): GateInput => ({
    source: override ?? source,
    pack: pack.state,
    localAck: settings?.notesLocalAck ?? false,
    cloudConsent: settings?.notesCloudConsent ?? false,
    hasKey: hasKeyFor(override ?? source, keys),
    sessionActive: status?.session === "starting" || status?.session === "running",
    isCurrent: current?.kind === "current",
    // Chỉ phiên có câu mới vào danh sách mục tiêu: phiên đang chọn nằm trong đó thì không rỗng.
    lineCount: current === null ? 0 : 1,
    pro,
    freeLeft: shown ? (view?.freeLeft ?? null) : null,
    existing,
  });

  // Lệnh của gói bị từ chối (hết chỗ, đang bận, không có nguồn): hiện ở thanh báo lỗi của màn hình, không nuốt.
  const showError = (e: unknown) => notesStore.setState({ error: toUiError(e) });

  const generate = (forceLocal = false) => {
    const local: NotesSource = { kind: "local" };
    void notesStore.getState().request(input(forceLocal ? local : undefined), template, forceLocal);
  };

  return (
    <NotesScreenView
      lang={lang}
      targets={targets}
      selected={current}
      view={shown ? view : null}
      draft={shown ? draft : null}
      dialog={dialog}
      sourcePanel={shown ? sourcePanel : null}
      notice={notice}
      error={error}
      source={source}
      gate={gateOf(input(), new Set())}
      template={template}
      pack={pack}
      freeDiskBytes={models?.freeDiskBytes ?? 0}
      auto={settings?.notesAuto ?? false}
      pro={pro}
      localUsable={pack.state === "installed"}
      confirmDiscard={pendingSelect !== null}
      staleDraft={staleDraft}
      onSelect={(ref) => {
        if (sameRef(ref, selected)) return;
        if (draft !== null) setPendingSelect(ref);
        else void notesStore.getState().select(ref);
      }}
      onTemplate={(next) => void updateSettings({ notesTemplate: next })}
      onGenerate={() => generate()}
      onCancel={() => void notesStore.getState().cancel()}
      onEdit={(next) => notesStore.getState().edit(next)}
      onSave={() => void notesStore.getState().saveEdit()}
      onDiscard={() => notesStore.getState().discardEdit()}
      onOpenSource={(refs) => void notesStore.getState().openSource(refs)}
      onCloseSource={() => notesStore.getState().closeSource()}
      onCopy={() => void notesStore.getState().copy()}
      onExport={(format) => void notesStore.getState().exportFile(format)}
      onDialogConfirm={(remember) =>
        void notesStore.getState().confirm(input(dialog === "localWarning" ? { kind: "local" } : undefined), template, remember)
      }
      onDialogDismiss={() => notesStore.getState().dismiss()}
      onOpenModelSettings={() => {
        notesStore.getState().dismiss();
        navigate("settings", "model");
      }}
      onUpgrade={() => navigate("upgrade")}
      onUseLocal={() => generate(true)}
      onDownloadPack={() => void tauriIpc.invoke("download_notes_pack").then(() => loadModels()).catch(showError)}
      onCancelPack={() => void tauriIpc.invoke("cancel_notes_download").then(() => loadModels()).catch(showError)}
      onDeletePack={() => void tauriIpc.invoke("delete_notes_pack").then(() => loadModels()).catch(showError)}
      onAuto={(on) => void updateSettings({ notesAuto: on })}
      onDismissError={() => notesStore.setState({ error: null })}
      onConfirmDiscard={() => {
        const next = pendingSelect;
        notesStore.getState().discardEdit();
        setPendingSelect(null);
        if (next) void notesStore.getState().select(next);
      }}
      onCancelDiscard={() => setPendingSelect(null)}
    />
  );
}
