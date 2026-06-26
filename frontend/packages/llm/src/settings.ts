// Light, local-first LLM settings: a localStorage-backed override layer over the
// build-time Vite env. This lets a user point AlmaMesh at their own local model
// (or, opt-in, a cloud endpoint + key) WITHOUT rebuilding — and without any
// backend or account. The key, if set, lives only in the browser's localStorage.
//
// Precedence: explicit localStorage value > Vite env > safe defaults (resolved
// downstream by `resolveProviderConfig`). Pure + storage-guarded so it is a
// no-op (returns the env unchanged) in SSR / tests where localStorage is absent.

import {
  isLocalEndpoint,
  OPENROUTER_API_BASE,
  RECOMMENDED_CLOUD_MODEL,
  RETIRED_CLOUD_MODELS,
  type LlmEnv,
} from "./config";

/** localStorage key holding the JSON-encoded LLM override settings. */
export const LLM_SETTINGS_KEY = "almamesh-llm-settings";

/** User-editable LLM settings (the subset a Settings UI would expose). */
export interface LlmSettings {
  readonly apiBase?: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly privacyMode?: string;
  /** Legacy engine selector; the only supported value is "openai-http". */
  readonly engine?: string;
}

/** Which kind of AI endpoint the saved settings point at. */
export type LlmProviderKind = "none" | "openrouter" | "local" | "cloud";

/** Human-readable summary of the saved AI provider state (for the UI status). */
export interface LlmStatus {
  readonly kind: LlmProviderKind;
  /** Short label for a badge, e.g. "OpenRouter", "Local", "Not set". */
  readonly label: string;
  /** True when the saved settings are complete enough to attempt a call. */
  readonly configured: boolean;
}

/**
 * Derive a human-readable AI provider status from saved settings — the single
 * source of truth for the header badge and "set up AI" call-to-action. A cloud
 * endpoint (OpenRouter / custom) needs an API key to count as configured; a
 * local endpoint does not.
 */
export function describeLlmStatus(settings: LlmSettings = readLlmSettings()): LlmStatus {
  const { apiBase, apiKey, model } = settings;
  if (!apiBase && !apiKey && !model) {
    return { kind: "none", label: "Not set", configured: false };
  }
  if (isLocalEndpoint(apiBase)) {
    return { kind: "local", label: "Local", configured: Boolean(apiBase && model) };
  }
  const isOpenRouter = (apiBase ?? "").startsWith(OPENROUTER_API_BASE);
  const configured = Boolean(apiBase && apiKey && model);
  return isOpenRouter
    ? { kind: "openrouter", label: "OpenRouter", configured }
    : { kind: "cloud", label: "Cloud", configured };
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

/**
 * Heal a saved blob that still pins one of AlmaMesh's OWN retired default cloud
 * models (e.g. the long-dead `anthropic/claude-3.5-sonnet` OpenRouter preset that
 * 404s) by rewriting it to {@link RECOMMENDED_CLOUD_MODEL}. Narrow by design: only
 * a model from {@link RETIRED_CLOUD_MODELS} on an OpenRouter base is touched, so a
 * model the user deliberately chose is never clobbered. Pure.
 */
function healRetiredModel(settings: LlmSettings): { settings: LlmSettings; changed: boolean } {
  const onOpenRouter = (settings.apiBase ?? "").startsWith(OPENROUTER_API_BASE);
  if (onOpenRouter && settings.model && RETIRED_CLOUD_MODELS.includes(settings.model)) {
    return { settings: { ...settings, model: RECOMMENDED_CLOUD_MODEL }, changed: true };
  }
  return { settings, changed: false };
}

/** Read the stored override settings, or `{}` if none / unavailable / corrupt. */
export function readLlmSettings(): LlmSettings {
  if (!hasLocalStorage()) {
    return {};
  }
  const raw = localStorage.getItem(LLM_SETTINGS_KEY);
  if (!raw) {
    return {};
  }
  let parsed: LlmSettings;
  try {
    parsed = JSON.parse(raw) as LlmSettings;
  } catch {
    return {};
  }
  const { settings, changed } = healRetiredModel(parsed);
  if (changed) {
    try {
      localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Best-effort persistence; the healed value is still returned this call.
    }
  }
  return settings;
}

/** Persist override settings (merging over any existing). No-op without storage. */
export function writeLlmSettings(settings: LlmSettings): void {
  if (!hasLocalStorage()) {
    return;
  }
  const merged = { ...readLlmSettings(), ...settings };
  localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(merged));
}

/**
 * Merge stored overrides on top of an env-shaped object so callers get a single
 * `LlmEnv` to hand to `resolveProviderConfig`. Stored values win when present.
 */
export function applyLlmSettings(env: LlmEnv, settings: LlmSettings = readLlmSettings()): LlmEnv {
  return {
    VITE_LLM_API_BASE: settings.apiBase || env.VITE_LLM_API_BASE,
    VITE_LLM_API_KEY: settings.apiKey || env.VITE_LLM_API_KEY,
    VITE_LLM_MODEL: settings.model || env.VITE_LLM_MODEL,
    VITE_LLM_PRIVACY_MODE: settings.privacyMode || env.VITE_LLM_PRIVACY_MODE,
    VITE_LLM_ENGINE: settings.engine || env.VITE_LLM_ENGINE,
  };
}
