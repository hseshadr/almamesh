/**
 * LlmModelSettings — the AI configuration screen.
 *
 * Two choices, stated plainly:
 *   1. AI off (the DEFAULT) — the chart is pure calculation and nothing leaves
 *      the device. A feature, not an empty state.
 *   2. Connect AI — an OpenRouter key (the guided, recommended path) or, under
 *      "Advanced", any OpenAI-compatible endpoint (incl. a local Ollama).
 *
 * Saving is NOT fire-and-forget: it persists the config, then runs a real 1-token
 * connectivity probe (`testProviderConnection`) against the exact model/endpoint
 * the reading will use, and reports an honest **Connected** or a specific error
 * (bad key / bad model / out of credits / unreachable) right here — so the user
 * never has to leave the screen to discover their config is broken. Everything is
 * stored ONLY in the browser's localStorage via @almamesh/llm; no backend.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CHAT_CLOUD_MODEL,
  describeLlmStatus,
  isLocalEndpoint,
  openRouterPreset,
  readLlmSettings,
  testProviderConnection,
  writeLlmSettings,
  RECOMMENDED_CLOUD_MODEL,
  type LlmSettings,
  type LlmStatus,
  type ProviderConfig,
} from '@almamesh/llm';
import { Badge, Button } from '../../ui';
import { classifyConnectionError } from '../../../lib/errors';
import { notifyLlmSettingsChanged } from '../../../lib/llmSettingsEvents';
import { resolveInterpretationConfig } from '../../../hooks/useStreamingInterpretation';

const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';
const PLACEHOLDER_BASE = 'http://localhost:11434/v1';
const PLACEHOLDER_INTERP_MODEL = 'deepseek/deepseek-v4-pro';
const PLACEHOLDER_CHAT_MODEL = 'minimax/minimax-m2.7';

/** The live state of the save-time connectivity probe. */
type ConnState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'connected' }
  | { phase: 'error'; kind: ReturnType<typeof classifyConnectionError> };

/**
 * Injectable seams so the component is unit-testable without a network round-trip
 * — default to the real interpretation-config resolver + connectivity probe.
 */
export interface LlmModelSettingsProps {
  resolveConfig?: () => ProviderConfig;
  testConnection?: (opts: { config: ProviderConfig }) => Promise<void>;
}

export default function LlmModelSettings({
  resolveConfig = resolveInterpretationConfig,
  testConnection = testProviderConnection,
}: LlmModelSettingsProps = {}) {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<LlmStatus>(() => describeLlmStatus());
  const [settings, setSettings] = useState<LlmSettings>(() => readLlmSettings());
  const [conn, setConn] = useState<ConnState>({ phase: 'idle' });

  const noneActive = status.kind === 'none';
  const aiOn =
    (status.kind === 'openrouter' || status.kind === 'cloud' || status.kind === 'local') &&
    status.configured;

  const patch = (next: Partial<LlmSettings>) => {
    setSettings((prev) => ({ ...prev, ...next }));
    setConn({ phase: 'idle' });
  };

  // Back to the default: clear the engine selector AND the endpoint triplet so
  // describeLlmStatus reads "none" again. Per-tier model choices survive.
  const turnAiOff = () => {
    writeLlmSettings({ engine: '', apiBase: '', apiKey: '', model: '' });
    setSettings(readLlmSettings());
    setConn({ phase: 'idle' });
    setStatus(describeLlmStatus());
    notifyLlmSettingsChanged();
  };

  // The shared save→test path: persist, refresh every status surface, then probe
  // the resolved interpretation config and report an honest verdict.
  const saveAndTest = async (next: LlmSettings) => {
    writeLlmSettings({ ...next, engine: '' });
    const persisted = readLlmSettings();
    setSettings(persisted);
    setStatus(describeLlmStatus(persisted));
    notifyLlmSettingsChanged();
    setConn({ phase: 'testing' });
    try {
      await testConnection({ config: resolveConfig() });
      setConn({ phase: 'connected' });
    } catch (err) {
      // Never swallow — the specific verdict below is all the user sees.
      console.error('[ai-settings] connection test failed:', err);
      setConn({ phase: 'error', kind: classifyConnectionError(err) });
    }
  };

  // Guided OpenRouter: apply the cloud preset (recommended frontier/fast pair +
  // cloud_premium so the fail-closed gate passes) with the user's key, then test.
  const saveOpenRouter = () => {
    const interp = settings.interpretationModel || settings.model || RECOMMENDED_CLOUD_MODEL;
    const chat = settings.chatModel || CHAT_CLOUD_MODEL;
    return saveAndTest(openRouterPreset(settings.apiKey?.trim() ?? '', interp, chat));
  };

  const hasKey = Boolean(settings.apiKey?.trim());
  const isCloud = settings.privacyMode === 'cloud_premium';
  const endpointIsLocal = isLocalEndpoint(settings.apiBase || PLACEHOLDER_BASE);
  const willRefuse = !isCloud && !endpointIsLocal;
  const interpretationValue = settings.interpretationModel ?? settings.model ?? '';

  return (
    <section className="space-y-4">
      {/* ── AI off (the default) ── */}
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
            <Badge variant="brass" data-testid="tier-none-active">
              {t('tiers.active_badge')}
            </Badge>
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

      {/* ── Connect AI ── */}
      <div
        data-testid="tier-cloud"
        className={`rounded-lg border p-4 ${
          aiOn ? 'border-accent-gold/40 bg-accent-gold/5' : 'border-ui-border bg-background-secondary'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-text-primary text-sm font-medium">{t('tiers.cloud_title')}</p>
          {aiOn && (
            <Badge variant="brass" data-testid="tier-cloud-active">
              {t('tiers.active_badge')}
            </Badge>
          )}
        </div>
        <p className="text-text-secondary text-xs mt-1" data-testid="tier-cloud-honesty">
          {t('tiers.cloud_body')}
        </p>

        {/* Guided OpenRouter — the recommended path: get a key, paste, test. */}
        <div className="mt-4 space-y-3 rounded-lg border border-accent-gold/30 bg-accent-gold/5 p-4">
          <div>
            <p className="text-text-primary text-sm font-medium">{t('ai.step1_title')}</p>
            <p className="text-text-secondary text-xs mt-0.5">{t('ai.step1_body')}</p>
            <a
              href={OPENROUTER_KEYS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-accent-gold hover:underline"
              data-testid="llm-openrouter-link"
            >
              {t('ai.step1_link')} ↗
            </a>
          </div>

          <label className="block">
            <span className="text-text-primary text-sm font-medium">{t('ai.step2_title')}</span>
            <input
              type="password"
              value={settings.apiKey ?? ''}
              placeholder="sk-or-v1-..."
              autoComplete="off"
              onChange={(e) => patch({ apiKey: e.target.value })}
              className="mt-1 w-full px-3 py-2 bg-background-secondary border border-ui-border rounded-lg text-text-primary text-sm"
              data-testid="llm-openrouter-key"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveOpenRouter} disabled={!hasKey || conn.phase === 'testing'} data-testid="llm-save">
              {conn.phase === 'testing' ? t('ai.testing') : t('ai.save_and_test')}
            </Button>
            {!hasKey && <span className="text-text-muted text-xs">{t('ai.step2_hint')}</span>}
          </div>
        </div>

        {/* One shared, honest verdict for whichever Save was pressed. */}
        <ConnectionResult conn={conn} t={t} />

        {/* Advanced — any OpenAI-compatible endpoint (local Ollama, other cloud). */}
        <details className="mt-4 rounded-lg border border-ui-border bg-background-secondary p-4">
          <summary className="cursor-pointer text-text-primary text-sm font-medium" data-testid="llm-advanced-summary">
            {t('ai.advanced_summary')}
          </summary>
          <div className="mt-3 space-y-4">
            <p className="text-text-muted text-xs">{t('ai.advanced_body')}</p>

            <label className="block">
              <span className="text-text-primary text-sm font-medium">{t('ai.endpoint_label')}</span>
              <input
                type="text"
                value={settings.apiBase ?? ''}
                placeholder={PLACEHOLDER_BASE}
                onChange={(e) => patch({ apiBase: e.target.value })}
                className="mt-1 w-full px-3 py-2 bg-background-secondary border border-ui-border rounded-lg text-text-primary text-sm"
                data-testid="llm-api-base"
              />
            </label>

            <label className="block">
              <span className="text-text-primary text-sm font-medium">{t('aiModels.interpretation_label')}</span>
              <input
                type="text"
                value={interpretationValue}
                placeholder={PLACEHOLDER_INTERP_MODEL}
                onChange={(e) => patch({ interpretationModel: e.target.value })}
                className="mt-1 w-full px-3 py-2 bg-background-secondary border border-ui-border rounded-lg text-text-primary text-sm"
                data-testid="llm-model"
              />
              <p className="text-text-muted text-xs mt-1" data-testid="llm-model-advice">
                {t('aiModels.interpretation_advice')}
              </p>
            </label>

            <label className="block">
              <span className="text-text-primary text-sm font-medium">{t('aiModels.chat_label')}</span>
              <input
                type="text"
                value={settings.chatModel ?? ''}
                placeholder={PLACEHOLDER_CHAT_MODEL}
                onChange={(e) => patch({ chatModel: e.target.value })}
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
                onChange={(e) => patch({ privacyMode: e.target.checked ? 'cloud_premium' : 'local_only' })}
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
                  autoComplete="off"
                  onChange={(e) => patch({ apiKey: e.target.value })}
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

            <Button
              onClick={() => saveAndTest(settings)}
              disabled={conn.phase === 'testing'}
              data-testid="llm-save-advanced"
            >
              {conn.phase === 'testing' ? t('ai.testing') : t('ai.save_and_test')}
            </Button>
          </div>
        </details>
      </div>
    </section>
  );
}

/** The honest save-time verdict line: testing / connected / a specific error. */
function ConnectionResult({
  conn,
  t,
}: {
  conn: ConnState;
  t: ReturnType<typeof useTranslation<'settings'>>['t'];
}) {
  if (conn.phase === 'idle') {
    return null;
  }
  const text =
    conn.phase === 'testing'
      ? t('ai.testing')
      : conn.phase === 'connected'
        ? t('ai.connected')
        : t(`ai.error_${conn.kind}`);
  const tone =
    conn.phase === 'connected'
      ? 'text-green-400'
      : conn.phase === 'error'
        ? 'text-red-400'
        : 'text-text-secondary';
  return (
    <p className={`mt-3 text-sm ${tone}`} role="status" data-testid="llm-connection-result">
      {conn.phase === 'connected' ? '✓ ' : conn.phase === 'error' ? '✗ ' : ''}
      {text}
    </p>
  );
}
