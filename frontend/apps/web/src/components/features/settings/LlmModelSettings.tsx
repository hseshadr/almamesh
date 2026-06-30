/**
 * LlmModelSettings — light, local-first AI model configuration (P4).
 *
 * Lets the user point AlmaMesh's AI at their own models without rebuilding: a
 * one-click OpenRouter cloud preset, or any other OpenAI-compatible endpoint
 * (e.g. a local Ollama) with a key. Everything is stored ONLY in the browser's
 * localStorage via @almamesh/llm; no backend, no account, and the key never
 * leaves the device except on the AI calls the user explicitly triggers (and
 * only then to the endpoint they configured).
 *
 * Two TIERED models are configured here (replacing the old single shared field):
 *   - Interpretation / chart-reading model — the one-time, in-depth reading; a
 *     strong/frontier model is advised.
 *   - Chat model — multi-turn Q&A; a smaller/faster model is advised, because
 *     chat already reuses the chart facts + the generated reading, so it does
 *     not need a heavy model. A one-click "Recommended" preset sets both.
 */

import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  CHAT_CLOUD_MODEL,
  isLocalEndpoint,
  openRouterPreset,
  readLlmSettings,
  writeLlmSettings,
  RECOMMENDED_CLOUD_MODEL,
  type LlmSettings,
} from '@almamesh/llm';

const PLACEHOLDER_BASE = 'http://localhost:11434/v1';
const PLACEHOLDER_INTERP_MODEL = 'deepseek/deepseek-v4-pro';
const PLACEHOLDER_CHAT_MODEL = 'minimax/minimax-m2.7';

export default function LlmModelSettings() {
  const { t } = useTranslation('settings');
  const [settings, setSettings] = useState<LlmSettings>(() => readLlmSettings());
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<LlmSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const save = () => {
    writeLlmSettings(settings);
    setSaved(true);
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
    <section>
      <div className="p-4 bg-background-tertiary border border-ui-border rounded-lg space-y-4">
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
    </section>
  );
}
