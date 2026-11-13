import { useEffect, useState } from "react";
import {
  DEEPSEEK_MODELS,
  DEFAULT_DEEPSEEK_MODEL,
  type DeepseekModel,
  GEMINI_MODELS,
  type GeminiModel,
  OPENAI_MODELS,
  type OpenaiModel,
  type TranslationKeysStatus,
  type TranslationProvider,
  tauriIpc,
} from "../../../lib/ipc";
import { defaultChoice, downloadBlock, formatBytes, localized, packById } from "../../../lib/models";
import { Field } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import { useApp, useT } from "../appStore";
import { BlockNote } from "../models/BlockNote";
import { DownloadPanel } from "../models/DownloadPanel";
import { MachineInfo } from "../models/MachineInfo";
import { ModelsError } from "../models/ModelsError";
import { PackList } from "../models/PackList";
import { UpdateNotice } from "../models/UpdateNotice";
import { useModels } from "../modelsStore";

const OPENAI_MODEL_LABELS: Record<string, string> = {
  "gpt-4o-mini": "gpt-4o-mini (chatgpt-4o-mini - Nhanh nhất, ổn định)",
  "gpt-4.1-mini": "gpt-4.1-mini (Thế hệ mới, phản hồi nhanh)",
  "gpt-4o": "gpt-4o (Tiêu chuẩn, chất lượng cao)",
};

const GEMINI_MODEL_LABELS: Record<string, string> = {
  "gemini-3.1-flash-lite": "gemini-3.1-flash-lite (Rất nhanh, ổn định cao)",
  "gemini-3.5-flash-lite": "gemini-3.5-flash-lite (Cân bằng tốc độ & chất lượng)",
};

const DEEPSEEK_MODEL_LABELS: Record<string, string> = {
  "deepseek-flash": "deepseek-flash (DeepSeek V4.1 Flash - Nhanh, tiết kiệm)",
  "deepseek-v4-pro": "deepseek-v4-pro (DeepSeek Pro - Chất lượng cao hơn, chậm hơn)",
};

// Nhóm Cài đặt "Model" (§4.3): chọn nguồn dịch (Local / ChatGPT / Gemini / DeepSeek), cấu hình model + API Key, và quản lý gói model Local.
export function ModelSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const lang = settings?.uiLanguage ?? "en";
  const current = settings?.modelTier ?? null;
  const provider: TranslationProvider = settings?.translationProvider ?? "local";
  const openaiModel = OPENAI_MODELS.includes(settings?.openaiModel as any)
    ? (settings?.openaiModel as OpenaiModel)
    : "gpt-4o-mini";
  const geminiModel = GEMINI_MODELS.includes(settings?.geminiModel as any)
    ? (settings?.geminiModel as GeminiModel)
    : "gemini-3.1-flash-lite";
  const deepseekModel = DEEPSEEK_MODELS.includes(settings?.deepseekModel as any)
    ? (settings?.deepseekModel as DeepseekModel)
    : DEFAULT_DEEPSEEK_MODEL;

  const [keys, setKeys] = useState<TranslationKeysStatus | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const view = useModels((s) => s.view);
  const choice = useModels((s) => s.choice);
  const choose = useModels((s) => s.choose);
  const load = useModels((s) => s.load);
  const download = useModels((s) => s.download);
  const select = useModels((s) => s.select);
  const remove = useModels((s) => s.remove);
  const repair = useModels((s) => s.repair);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (provider === "local") return;
    let cancelled = false;
    void tauriIpc
      .invoke("get_translation_keys")
      .then((status) => {
        if (!cancelled && status) setKeys(status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const activeCloud = provider === "openai" || provider === "gemini" || provider === "deepseek" ? provider : null;
  const keyConfigured =
    activeCloud === "openai"
      ? (keys?.openaiConfigured ?? false)
      : activeCloud === "gemini"
        ? (keys?.geminiConfigured ?? false)
        : activeCloud === "deepseek"
          ? (keys?.deepseekConfigured ?? false)
          : false;
  const keyHint =
    activeCloud === "openai"
      ? (keys?.openaiHint ?? null)
      : activeCloud === "gemini"
        ? (keys?.geminiHint ?? null)
        : activeCloud === "deepseek"
          ? (keys?.deepseekHint ?? null)
          : null;

  const saveKey = async (rawKey: string) => {
    if (!activeCloud || savingKey) return;
    setSavingKey(true);
    try {
      const next = await tauriIpc.invoke("set_translation_api_key", {
        provider: activeCloud,
        apiKey: rawKey,
      });
      if (next) setKeys(next);
      setApiKeyInput("");
    } catch {
      // Lỗi lưu keystore giữ nguyên trạng thái cũ, không làm sập giao diện.
    } finally {
      setSavingKey(false);
    }
  };

  if (!view) return <p className="hint">{t("models.loading")}</p>;
  const inUse = packById(view, current);
  const chosen = packById(view, defaultChoice(view, choice, current));
  const downloading = view.job.state === "downloading";
  return (
    <>
      <ModelsError />
      <UpdateNotice />
      {view.speaker === "downloading" && (
        <p className="note speaker-downloading" role="status">
          <Icon name="download" size={16} />
          <span>{t("settings.model.speakerDownloading")}</span>
        </p>
      )}
      <div className="card list">
        <Field
          label={t("settings.model.provider")}
          htmlFor="translation-provider"
          hint={t("settings.model.provider.hint")}
        >
          <select
            id="translation-provider"
            value={provider}
            onChange={(e) => {
              setApiKeyInput("");
              void updateSettings({ translationProvider: e.target.value as TranslationProvider });
            }}
          >
            <option value="local">{t("settings.model.provider.local")}</option>
            <option value="openai">{t("settings.model.provider.openai")}</option>
            <option value="gemini">{t("settings.model.provider.gemini")}</option>
            <option value="deepseek">{t("settings.model.provider.deepseek")}</option>
          </select>
        </Field>
        {provider === "openai" && (
          <Field label={t("settings.model.cloudModel")} htmlFor="cloud-model">
            <select
              id="cloud-model"
              value={openaiModel}
              onChange={(e) => void updateSettings({ openaiModel: e.target.value as OpenaiModel })}
            >
              {OPENAI_MODELS.map((m) => (
                <option key={m} value={m}>
                  {OPENAI_MODEL_LABELS[m] ?? m}
                </option>
              ))}
            </select>
          </Field>
        )}
        {provider === "gemini" && (
          <Field label={t("settings.model.cloudModel")} htmlFor="cloud-model">
            <select
              id="cloud-model"
              value={geminiModel}
              onChange={(e) => void updateSettings({ geminiModel: e.target.value as GeminiModel })}
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m} value={m}>
                  {GEMINI_MODEL_LABELS[m] ?? m}
                </option>
              ))}
            </select>
          </Field>
        )}
        {provider === "deepseek" && (
          <Field label={t("settings.model.cloudModel")} htmlFor="cloud-model">
            <select
              id="cloud-model"
              value={deepseekModel}
              onChange={(e) => void updateSettings({ deepseekModel: e.target.value as DeepseekModel })}
            >
              {DEEPSEEK_MODELS.map((m) => (
                <option key={m} value={m}>
                  {DEEPSEEK_MODEL_LABELS[m] ?? m}
                </option>
              ))}
            </select>
          </Field>
        )}
        {activeCloud && (
          <Field
            label={t("settings.model.apiKey")}
            htmlFor="cloud-api-key"
            hint={
              keyConfigured && keyHint
                ? t("settings.model.apiKey.saved", { hint: keyHint })
                : t("settings.model.apiKey.missing")
            }
          >
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input
                id="cloud-api-key"
                type="password"
                value={apiKeyInput}
                placeholder={t("settings.model.apiKey.placeholder")}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && apiKeyInput.trim()) {
                    e.preventDefault();
                    void saveKey(apiKeyInput);
                  }
                }}
              />
              <button
                type="button"
                className="primary"
                disabled={savingKey || !apiKeyInput.trim()}
                onClick={() => void saveKey(apiKeyInput)}
              >
                {t("settings.model.apiKey.save")}
              </button>
              {keyConfigured && (
                <button type="button" disabled={savingKey} onClick={() => void saveKey("")}>
                  {t("settings.model.apiKey.clear")}
                </button>
              )}
            </div>
          </Field>
        )}
      </div>
      <div className="card list">
        <Field
          label={
            <>
              {t("models.current")}: <strong>{inUse?.usable ? localized(inUse.name, lang) : t("models.none")}</strong>
            </>
          }
          hint={t("models.used", { size: formatBytes(view.usedBytes, lang) })}
        >
          {inUse && (
            <button disabled={downloading} onClick={() => void repair(inUse.id)}>
              <Icon name="refresh" size={16} />
              {t("models.redownload")}
            </button>
          )}
        </Field>
        <div className="field">
          <div className="field-text">
            <MachineInfo />
          </div>
        </div>
      </div>
      <DownloadPanel />
      <PackList view={view} choice={chosen?.id ?? null} onChoose={choose} />
      {chosen && <BlockNote view={view} pack={chosen} />}
      {chosen && (
        <div className="actions">
          {chosen.usable && chosen.id !== current && (
            <button className="primary" onClick={() => void select(chosen.id)}>
              {t("models.use")}
            </button>
          )}
          {!chosen.complete && (
            <button
              className="primary"
              disabled={downloading || downloadBlock(view, chosen) !== null}
              onClick={() => void download(chosen.id)}
            >
              {t(chosen.usable ? "models.download" : "models.downloadAndUse")}
            </button>
          )}
          {chosen.usable && (
            <button disabled={downloading} onClick={() => void remove(chosen.id)}>
              <Icon name="trash" size={16} />
              {t("models.delete")}
            </button>
          )}
        </div>
      )}
      <p className="hint">{t("models.nextSession")}</p>
    </>
  );
}
