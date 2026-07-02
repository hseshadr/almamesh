/**
 * LlmModelSettings — the three-tier AI configuration (Spec 063 D3).
 *
 *   1. None (the DEFAULT) — no AI at all: the chart is pure calculation and
 *      nothing leaves the device. Stated as a feature, not an empty state.
 *   2. On-device AI (private, beta) — a blessed WebLLM model on this device's
 *      GPU; capability-probed, disclosed download, chat + interview scope
 *      (see OnDeviceTierCard).
 *   3. Cloud AI (stronger) — the OpenRouter one-click preset or any BYO
 *      OpenAI-compatible endpoint (incl. local Ollama). Honest label: stronger
 *      models; redacted chart data leaves the device.
 *
 * Everything is stored ONLY in the browser's localStorage via @almamesh/llm;
 * no backend, no account. The active tier is derived from `describeLlmStatus`
 * (the same single source of truth the header badge uses).
 */

import { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  BLESSED_ONDEVICE_MODELS,
  CHAT_CLOUD_MODEL,
  describeLlmStatus,
  isLocalEndpoint,
  openRouterPreset,
  readLlmSettings,
  writeLlmSettings,
  RECOMMENDED_CLOUD_MODEL,
  type LlmSettings,
  type LlmStatus,
} from '@almamesh/llm';
import { OnDeviceTierCard, type OnDeviceTierCardProps } from './OnDeviceTierCard';

const PLACEHOLDER_BASE = 'http://localhost:11434/v1';
const PLACEHOLDER_INTERP_MODEL = 'deepseek/deepseek-v4-pro';
const PLACEHOLDER_CHAT_MODEL = 'minimax/minimax-m2.7';

/** True when the id is one of the blessed ON-DEVICE (MLC) model ids. */
function isOnDeviceModelId(id: string | undefined): boolean {
  return Boolean(id && BLESSED_ONDEVICE_MODELS.some((m) => m.id === id));
}

/**
 * The cloud form must never surface an on-device MLC model id (left behind by
 * a prior on-device enable + the legacy-model migration) as a cloud slug.
 */
function withoutOnDeviceModels(settings: LlmSettings): LlmSettings {
  const strip = (v?: string) => (isOnDeviceModelId(v) ? undefined : v);
  return {
    ...settings,
    model: strip(settings.model),
    interpretationModel: strip(settings.interpretationModel),
    chatModel: strip(settings.chatModel),
  };
}

/** Test-only injectables threaded through to the on-device tier card. */
export type LlmModelSettingsProps = Pick<
  OnDeviceTierCardProps,
  'probeFn' | 'preloadFn' | 'deleteFn'
>;

export default function LlmModelSettings(props: LlmModelSettingsProps = {}) {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<LlmStatus>(() => describeLlmStatus());
  const refreshStatus = useCallback(() => setStatus(describeLlmStatus()), []);

  const noneActive = status.kind === 'none';
  const cloudActive =
    (status.kind === 'openrouter' || status.kind === 'cloud' || status.kind === 'local') &&
    status.configured;

  // Back to the default: clear the engine selector AND the endpoint triplet so
  // describeLlmStatus reads "none" again. Per-tier model choices survive.
  const turnAiOff = () => {
    writeLlmSettings({ engine: '', apiBase: '', apiKey: '', model: '' });
    refreshStatus();
  };

  return (
    <section className="space-y-4">
      {/* ── Tier 1: None (the default, said plainly) ── */}
      <div
        data-testid="tier-none"
        className={`rounded-lg border p-4 ${
          noneActive ? 'border-accent-gold/40 bg-accent-gold/5' : 'border-ui-border bg-background-secondary'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-text-primary text-sm font-medium">
            {t('tiers.none_title')}
            <span className="ml-2 rounded-full border border-ui-border px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-text-secondary">
              {t('tiers.none_default_badge')}
            </span>
          </p>
          {noneActive ? (
            <span
              data-testid="tier-none-active"
              className="rounded-full bg-accent-gold/15 px-2 py-0.5 text-xs font-medium text-accent-gold"
            >
              {t('tiers.active_badge')}
            </span>
          ) : (
            <button
              type="button"
              onClick={turnAiOff}
              className="rounded-md border border-ui-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
              data-testid="tier-none-select"
            >
              {t('tiers.none_button')}
            </button>
          )}
        </div>
        <p className="text-text-secondary text-xs mt-1">{t('tiers.none_body')}</p>
      </div>

      {/* ── Tier 2: On-device AI (private, beta) ── */}
      <OnDeviceTierCard status={status} onChanged={refreshStatus} {...props} />

      {/* ── Tier 3: Cloud AI (stronger) ── */}
      <div
        data-testid="tier-cloud"
        className={`rounded-lg border p-4 ${
          cloudActive ? 'border-accent-gold/40 bg-accent-gold/5' : 'border-ui-border bg-background-secondary'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-text-primary text-sm font-medium">
            {t('tiers.cloud_title')}
            <span className="ml-2 rounded-full border border-ui-border px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-text-secondary">
              {t('tiers.cloud_badge')}
            </span>
          </p>
          {cloudActive && (
            <span
              data-testid="tier-cloud-active"
              className="rounded-full bg-accent-gold/15 px-2 py-0.5 text-xs font-medium text-accent-gold"
            >
              {t('tiers.active_badge')}
            </span>
          )}
        </div>
        {/* The honest one-liner: stronger models, redacted chart data leaves. */}
        <p className="text-text-secondary text-xs mt-1" data-testid="tier-cloud-honesty">
          {t('tiers.cloud_body')}
        </p>
        <div className="mt-4">
          <CloudEndpointForm onSaved={refreshStatus} />
        </div>
      </div>
    </section>
  );
}

/**
 * The cloud/BYO endpoint form — the pre-063 LlmModelSettings body, unchanged
 * in behavior except that SAVING it clears the engine selector (so saving a
 * cloud config always switches off a previously-enabled on-device tier).
 *
 * Two TIERED models are configured here:
 *   - Interpretation / chart-reading model — strong/frontier advised.
 *   - Chat model — smaller/faster advised (chat reuses facts + the reading).
 */
function CloudEndpointForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation('settings');
  const [settings, setSettings] = useState<LlmSettings>(() =>
    withoutOnDeviceModels(readLlmSettings()),
  );
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<LlmSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const save = () => {
    // engine:'' → any previously-selected on-device tier is switched off; the
    // saved endpoint/key/model now define the provider (openai-http).
    writeLlmSettings({ ...settings, engine: '' });
    setSaved(true);
    onSaved();
  };

  // One-click OpenRouter: prefill the cloud preset (base url + cloud_premium so
  // the fail-closed gate allows it) with the recommended interpretation + chat
  // pair, and reveal the key field. The user still pastes their key and Saves.
  const useOpenRouter = () => {
    const interp = settings.interpretationModel || settings.model || RECOMMENDED_CLOUD_MODEL;
    const chat = settings.chatModel || CHAT_CLOUD_MODEL;
    setSettings((prev) => ({ ...prev, ...openRouterPreset(settings.apiKey ?? '', interp, chat) }));
    setSaved(false);
  };

  // One-click "Recommended": the same OpenRouter cloud preset but always reset to
  // AlmaMesh's recommended frontier/fast pair (overriding any custom slugs), so a
  // user who lost the thread can get the advised tiers back in one click.
  const useRecommended = () => {
    setSettings((prev) => ({
      ...prev,
      ...openRouterPreset(settings.apiKey ?? '', RECOMMENDED_CLOUD_MODEL, CHAT_CLOUD_MODEL),
    }));
    setSaved(false);
  };

  const isCloud = settings.privacyMode === 'cloud_premium';
  const endpointIsLocal = isLocalEndpoint(settings.apiBase || PLACEHOLDER_BASE);
  const willRefuse = !isCloud && !endpointIsLocal;

  // The interpretation field is backed by `interpretationModel`, falling back to
  // a pre-tier legacy `model` so an existing user sees their saved value.
  const interpretationValue = settings.interpretationModel ?? settings.model ?? '';

  return (
    <div className="space-y-4">
      <p className="text-text-secondary text-sm">
        <Trans
          i18nKey="ai.intro"
          ns="settings"
          values={{ endpoint: PLACEHOLDER_BASE }}
          components={[<code className="mx-1 text-text-primary" />]}
        />
      </p>

      {/* Primary path: one-click OpenRouter. Prefills the cloud preset + reveals
          the key field; the user pastes a key and Saves. */}
      <div className="rounded-lg border border-accent-gold/30 bg-accent-gold/5 p-4">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-text-primary text-sm font-medium">{t('ai.use_openrouter_title')}</p>
            <p className="text-text-secondary text-xs mt-0.5">{t('ai.use_openrouter_description')}</p>
          </div>
          <button
            type="button"
            onClick={useOpenRouter}
            className="w-full flex-shrink-0 rounded-md bg-accent-gold px-4 py-2 text-sm font-medium text-background-primary transition-colors hover:bg-accent-gold-bright sm:w-auto"
            data-testid="llm-use-openrouter"
          >
            {t('ai.use_openrouter_button')}
          </button>
        </div>
      </div>

      {/* Tiered-model recommendation: set both models to the advised pair. */}
      <div className="rounded-lg border border-ui-border bg-background-secondary p-4">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-text-primary text-sm font-medium">{t('aiModels.recommended_title')}</p>
            <p className="text-text-secondary text-xs mt-0.5">{t('aiModels.recommended_description')}</p>
          </div>
          <button
            type="button"
            onClick={useRecommended}
            className="w-full flex-shrink-0 rounded-md border border-accent-gold/40 px-4 py-2 text-sm font-medium text-accent-gold transition-colors hover:bg-accent-gold/10 sm:w-auto"
            data-testid="llm-use-recommended"
          >
            {t('aiModels.recommended_button')}
          </button>
        </div>
      </div>

      <p className="text-text-muted text-xs">{t('ai.or_configure')}</p>

      <label className="block">
        <span className="text-text-primary text-sm font-medium">{t('ai.endpoint_label')}</span>
        <input
          type="text"
          value={settings.apiBase ?? ''}
          placeholder={PLACEHOLDER_BASE}
          onChange={(e) => update({ apiBase: e.target.value })}
          className="mt-1 w-full px-3 py-2 bg-background-secondary border border-ui-border rounded-lg text-text-primary text-sm"
          data-testid="llm-api-base"
        />
      </label>

      {/* Interpretation tier — strong/frontier model advised. Keeps the
          historical `llm-model` testid (the e2e contract for the prefilled
          recommended model). */}
      <label className="block">
        <span className="text-text-primary text-sm font-medium">{t('aiModels.interpretation_label')}</span>
        <input
          type="text"
          value={interpretationValue}
          placeholder={PLACEHOLDER_INTERP_MODEL}
          onChange={(e) => update({ interpretationModel: e.target.value })}
          className="mt-1 w-full px-3 py-2 bg-background-secondary border border-ui-border rounded-lg text-text-primary text-sm"
          data-testid="llm-model"
        />
        <p className="text-text-muted text-xs mt-1" data-testid="llm-model-advice">
          {t('aiModels.interpretation_advice')}
        </p>
      </label>

      {/* Chat tier — smaller/faster model advised (reuses facts + reading). */}
      <label className="block">
        <span className="text-text-primary text-sm font-medium">{t('aiModels.chat_label')}</span>
        <input
          type="text"
          value={settings.chatModel ?? ''}
          placeholder={PLACEHOLDER_CHAT_MODEL}
          onChange={(e) => update({ chatModel: e.target.value })}
          className="mt-1 w-full px-3 py-2 bg-background-secondary border border-ui-border rounded-lg text-text-primary text-sm"
          data-testid="llm-chat-model"
        />
        <p className="text-text-muted text-xs mt-1" data-testid="llm-chat-model-advice">
          {t('aiModels.chat_advice')}
        </p>
      </label>

      <label className="flex items-center justify-between">
        <span className="text-text-primary text-sm font-medium">{t('ai.allow_cloud_label')}</span>
        <input
          type="checkbox"
          checked={isCloud}
          onChange={(e) => update({ privacyMode: e.target.checked ? 'cloud_premium' : 'local_only' })}
          className="rounded border-ui-border text-accent-gold focus:ring-accent-gold/50"
          data-testid="llm-allow-cloud"
        />
      </label>

      {isCloud && (
        <label className="block">
          <span className="text-text-primary text-sm font-medium">{t('ai.api_key_label')}</span>
          <input
            type="password"
            value={settings.apiKey ?? ''}
            placeholder="sk-..."
            onChange={(e) => update({ apiKey: e.target.value })}
            className="mt-1 w-full px-3 py-2 bg-background-secondary border border-ui-border rounded-lg text-text-primary text-sm"
            data-testid="llm-api-key"
          />
        </label>
      )}

      {willRefuse && (
        <p className="text-sm text-amber-400" data-testid="llm-privacy-warning">
          {t('ai.privacy_warning')}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="px-4 py-2 text-sm font-medium rounded-md bg-accent-gold text-background-primary"
          data-testid="llm-save"
        >
          {t('ai.save_model_settings')}
        </button>
        {saved && <span className="text-sm text-green-400">{t('ai.saved')}</span>}
      </div>
    </div>
  );
}
