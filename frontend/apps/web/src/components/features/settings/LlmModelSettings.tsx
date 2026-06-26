/**
 * LlmModelSettings — light, local-first AI model configuration (P4).
 *
 * Lets the user point AlmaMesh's interpretation at their own model without
 * rebuilding: a one-click OpenRouter cloud preset by default, or any other
 * OpenAI-compatible endpoint (e.g. a local Ollama) with a key. Everything is
 * stored ONLY in the browser's localStorage via @almamesh/llm; no backend, no
 * account, and the key never leaves the device except on the interpretation call
 * the user explicitly triggers (and only then to the endpoint they configured).
 */

import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  isLocalEndpoint,
  openRouterPreset,
  readLlmSettings,
  writeLlmSettings,
  RECOMMENDED_CLOUD_MODEL,
  type LlmSettings,
} from '@almamesh/llm';

const PLACEHOLDER_BASE = 'http://localhost:11434/v1';
const PLACEHOLDER_MODEL = 'llama3.1';
const OPENROUTER_MODEL = RECOMMENDED_CLOUD_MODEL;

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
  // the fail-closed gate allows it) and reveal the key + model fields. The user
  // still pastes their key and presses Save; nothing is persisted until then.
  const useOpenRouter = () => {
    const preset = openRouterPreset(settings.apiKey ?? '', settings.model || OPENROUTER_MODEL);
    setSettings((prev) => ({ ...prev, ...preset }));
    setSaved(false);
  };

  const isCloud = settings.privacyMode === 'cloud_premium';
  const endpointIsLocal = isLocalEndpoint(settings.apiBase || PLACEHOLDER_BASE);
  const willRefuse = !isCloud && !endpointIsLocal;

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
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-text-primary text-sm font-medium">{t('ai.use_openrouter_title')}</p>
              <p className="text-text-secondary text-xs mt-0.5">{t('ai.use_openrouter_description')}</p>
            </div>
            <button
              type="button"
              onClick={useOpenRouter}
              className="flex-shrink-0 rounded-md bg-accent-gold px-4 py-2 text-sm font-medium text-background-primary transition-colors hover:bg-accent-gold-bright"
              data-testid="llm-use-openrouter"
            >
              {t('ai.use_openrouter_button')}
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

        <label className="block">
          <span className="text-text-primary text-sm font-medium">{t('ai.model_label')}</span>
          <input
            type="text"
            value={settings.model ?? ''}
            placeholder={PLACEHOLDER_MODEL}
            onChange={(e) => update({ model: e.target.value })}
            className="mt-1 w-full px-3 py-2 bg-background-secondary border border-ui-border rounded-lg text-text-primary text-sm"
            data-testid="llm-model"
          />
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
