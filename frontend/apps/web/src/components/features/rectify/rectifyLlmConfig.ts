/**
 * Shared LLM-configuration helpers for the rectification wizard.
 *
 * Shared by ConversationalAccelerator and any future wizard panel to reuse
 * the AI-usable gate check, provider config resolver, and language mapper
 * without duplicating the logic.
 */
import {
  describeLlmStatus,
  readLlmSettings,
  applyLlmSettings,
  resolveProviderConfig,
  type LlmEnv,
  type PromptLanguage,
  type ProviderConfig,
} from '@almamesh/llm';

/**
 * Returns true when the interview's AI loop can actually run (Spec 063 D2):
 * a cloud endpoint (OpenRouter / custom) OR the on-device tier. A BYO `local`
 * endpoint stays gated exactly as before 063 — the typed event-extraction
 * contract is only enforced on cloud (server-side) and on-device (xgrammar).
 */
export function isAiUsable(): boolean {
  const status = describeLlmStatus(readLlmSettings());
  return (
    (status.kind === 'openrouter' || status.kind === 'cloud' || status.kind === 'on_device') &&
    status.configured
  );
}

/** Build a ProviderConfig from the persisted user settings + Vite env. */
export function resolveConfig(): ProviderConfig {
  const settings = readLlmSettings();
  const env = applyLlmSettings(import.meta.env as LlmEnv, settings);
  return resolveProviderConfig(env);
}

/** Map an i18next language code to a supported PromptLanguage ('en' fallback). */
export function toPromptLanguage(i18nLang: string): PromptLanguage {
  if (i18nLang.startsWith('es')) return 'es';
  if (i18nLang.startsWith('pt')) return 'pt';
  return 'en';
}
