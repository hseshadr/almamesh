// The client-side mirror of the backend privacy contract
// (`ProviderConfig` / `_resolve_provider_config` / `_is_local_endpoint` /
// `_is_private_ip` / `_ensure_privacy` in backend/src/almamesh/llm.py).
//
// In the OSS browser build the default is the SAFEST one: privacy mode
// `local_only`, pointed at a local Ollama-style endpoint. Cloud (e.g. OpenRouter)
// is strictly opt-in and a key is NEVER bundled — it is read from Vite env or the
// settings store at call time.

import type { LlmEngine } from "./provider";
import type { LlmSettings } from "./settings";

/** Mirror of the backend `PrivacyMode` enum (edgeproc.PrivacyMode). */
export type PrivacyMode = "local_only" | "cloud_premium";

/** Resolved description of which chat backend + endpoint a call should use. */
export interface ProviderConfig {
  /** Which engine serves the completion. Always `openai-http`. */
  readonly engine: LlmEngine;
  readonly model: string;
  readonly privacyMode: PrivacyMode;
  /** OpenAI-compatible base URL, e.g. `http://localhost:11434/v1` (Ollama). */
  readonly baseUrl: string;
  /** Optional API key. Never bundled; supplied by env or local settings. */
  readonly apiKey?: string;
}

/** Fail-closed: a local_only request that would leave the device is refused. */
export class PrivacyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyViolationError";
  }
}

// Default to Ollama's OpenAI-compatible local endpoint. Safe: loopback only.
const DEFAULT_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "llama3.1";
const DEFAULT_PRIVACY_MODE: PrivacyMode = "local_only";
// OpenRouter / BYO OpenAI-compatible build: every resolution lands on the
// OpenAI-compatible HTTP engine — a local endpoint by default, an opt-in cloud
// preset (OpenRouter).
const DEFAULT_ENGINE: LlmEngine = "openai-http";

// IPv4 private ranges (RFC 1918) + loopback, mirroring Python's
// `ipaddress.is_private` / `is_loopback` for the host literals we care about.
const PRIVATE_IPV4 =
  /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

function isPrivateIp(host: string): boolean {
  if (PRIVATE_IPV4.test(host)) {
    return true;
  }
  // IPv6 loopback / unique-local / link-local.
  const h = host.toLowerCase();
  return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
}

/** True if `baseUrl` points at a loopback or private-network host. */
export function isLocalEndpoint(baseUrl: string | undefined): boolean {
  if (!baseUrl) {
    return false;
  }
  let host: string;
  try {
    host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  return host === "localhost" || host.endsWith(".local") || isPrivateIp(host);
}

/** Fail closed: local_only must resolve to a local endpoint, else throw. */
export function ensurePrivacy(config: ProviderConfig): void {
  if (config.privacyMode === "local_only" && !isLocalEndpoint(config.baseUrl)) {
    throw new PrivacyViolationError(
      `PrivacyMode 'local_only' requires a local OpenAI-compatible endpoint ` +
        `(set VITE_LLM_API_BASE to a loopback/private host); refusing to send ` +
        `chart data to non-local endpoint ${config.baseUrl}.`,
    );
  }
}

function asPrivacyMode(value: string | undefined): PrivacyMode {
  return value === "cloud_premium" ? "cloud_premium" : DEFAULT_PRIVACY_MODE;
}

function resolveEngine(_env: LlmEnv): LlmEngine {
  // The engine is always the OpenAI-compatible HTTP path regardless of any
  // (legacy) `VITE_LLM_ENGINE` value.
  return DEFAULT_ENGINE;
}

/** Raw env values a host app supplies (Vite `import.meta.env`, or settings). */
export interface LlmEnv {
  readonly VITE_LLM_API_BASE?: string;
  readonly VITE_LLM_API_KEY?: string;
  readonly VITE_LLM_MODEL?: string;
  readonly VITE_LLM_PRIVACY_MODE?: string;
  /** Legacy engine selector; the only supported value is "openai-http". */
  readonly VITE_LLM_ENGINE?: string;
}

/**
 * Resolve a `ProviderConfig` from env-shaped values, applying safe OSS defaults.
 * Pure and injectable so callers can pass `import.meta.env` or settings-store
 * values without this module reaching for globals.
 */
export function resolveProviderConfig(env: LlmEnv = {}): ProviderConfig {
  const engine = resolveEngine(env);
  const apiKey = env.VITE_LLM_API_KEY?.trim();
  return {
    engine,
    model: env.VITE_LLM_MODEL?.trim() || DEFAULT_MODEL,
    privacyMode: asPrivacyMode(env.VITE_LLM_PRIVACY_MODE?.trim()),
    baseUrl: env.VITE_LLM_API_BASE?.trim() || DEFAULT_BASE_URL,
    ...(apiKey ? { apiKey } : {}),
  };
}

/** OpenRouter's OpenAI-compatible base URL — the one-click cloud preset target. */
export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

/**
 * The recommended OpenRouter cloud model — the SINGLE source of truth for the
 * one-click preset, the settings UI default, and the "switch to recommended"
 * self-heal. A real OpenRouter slug (verified against the live models catalog).
 */
export const RECOMMENDED_CLOUD_MODEL = "deepseek/deepseek-v4-pro";

/**
 * The cloud model the CHAT panel prefers: a fast-streaming OpenAI-compatible
 * OpenRouter slug (verified against the live models catalog). Chat trades the
 * deeper structured-interpretation model ({@link RECOMMENDED_CLOUD_MODEL}) for
 * snappier first-token latency in the conversational flow. Applied only via
 * {@link applyChatModelPreference}, and only when the user is on our default
 * cloud preset — a deliberately-chosen model is never overridden.
 */
export const CHAT_CLOUD_MODEL = "minimax/minimax-m2.7";

/**
 * Model ids AlmaMesh itself once shipped as a DEFAULT OpenRouter preset and that
 * are now retired/dead (they 404 "No endpoints found"). A saved blob still
 * pinning one of these is healed to {@link RECOMMENDED_CLOUD_MODEL} on read — see
 * `healRetiredModel` in settings.ts. Narrow on purpose: only OUR broken defaults,
 * never a model the user deliberately chose.
 */
export const RETIRED_CLOUD_MODELS: readonly string[] = ["anthropic/claude-3.5-sonnet"];

/**
 * Swap the resolved model to {@link CHAT_CLOUD_MODEL} for the chat path, but ONLY
 * when the endpoint is our default OpenRouter cloud preset (base starts with
 * {@link OPENROUTER_API_BASE}) AND the model is still the recommended default
 * ({@link RECOMMENDED_CLOUD_MODEL}). Anything else — a local endpoint, a custom
 * base, or a model the user deliberately chose — is returned unchanged. Narrow on
 * purpose, mirroring `healRetiredModel` in settings.ts. Pure; no globals.
 */
export function applyChatModelPreference(env: LlmEnv): LlmEnv {
  const onOpenRouter = (env.VITE_LLM_API_BASE ?? "").startsWith(OPENROUTER_API_BASE);
  if (onOpenRouter && env.VITE_LLM_MODEL === RECOMMENDED_CLOUD_MODEL) {
    return { ...env, VITE_LLM_MODEL: CHAT_CLOUD_MODEL };
  }
  return env;
}

/**
 * One-click OpenRouter settings: a cloud OpenAI-compatible endpoint + key.
 * `cloud_premium` is REQUIRED — the fail-closed `ensurePrivacy` gate refuses a
 * cloud host under `local_only`. Returns an `LlmSettings` ready for
 * `writeLlmSettings`; the key lives only in the browser, never bundled.
 */
export function openRouterPreset(apiKey: string, model: string): LlmSettings {
  return {
    apiBase: OPENROUTER_API_BASE,
    apiKey,
    model,
    privacyMode: "cloud_premium",
    engine: "openai-http",
  };
}
