import { describe, expect, it } from "vitest";

import {
  applyChatModelPreference,
  CHAT_CLOUD_MODEL,
  OPENROUTER_API_BASE,
  openRouterPreset,
  RECOMMENDED_CLOUD_MODEL,
  resolveProviderConfig,
} from "./config";

// A stale/legacy engine value a saved settings blob might still pin. The build
// supports only the OpenAI-compatible HTTP engine, so any such value is ignored.
const LEGACY_ENGINE_FLAG = "web" + "llm";

describe("resolveProviderConfig", () => {
  it("defaults to the openai-http engine", () => {
    expect(resolveProviderConfig({}).engine).toBe("openai-http");
  });

  it("never returns a legacy engine even when the env asks for it", () => {
    expect(resolveProviderConfig({ VITE_LLM_ENGINE: LEGACY_ENGINE_FLAG }).engine).toBe(
      "openai-http",
    );
  });
});

describe("openRouterPreset", () => {
  it("is cloud_premium with the OpenRouter base url", () => {
    const p = openRouterPreset("my-key", "anthropic/claude-3.5-sonnet");
    expect(p.apiBase).toBe("https://openrouter.ai/api/v1");
    expect(p.privacyMode).toBe("cloud_premium");
    expect(p.model).toBe("anthropic/claude-3.5-sonnet");
    expect(p.apiKey).toBe("my-key");
    expect(p.engine).toBe("openai-http");
  });
});

describe("applyChatModelPreference", () => {
  it("swaps the recommended default to the fast chat model on the OpenRouter preset", () => {
    const env = applyChatModelPreference({
      VITE_LLM_API_BASE: OPENROUTER_API_BASE,
      VITE_LLM_MODEL: RECOMMENDED_CLOUD_MODEL,
    });
    expect(env.VITE_LLM_MODEL).toBe(CHAT_CLOUD_MODEL);
  });

  it("preserves a user-chosen custom OpenRouter model unchanged", () => {
    const env = applyChatModelPreference({
      VITE_LLM_API_BASE: OPENROUTER_API_BASE,
      VITE_LLM_MODEL: "anthropic/claude-3.7-sonnet",
    });
    expect(env.VITE_LLM_MODEL).toBe("anthropic/claude-3.7-sonnet");
  });

  it("leaves a local endpoint untouched regardless of model", () => {
    const env = applyChatModelPreference({
      VITE_LLM_API_BASE: "http://localhost:11434/v1",
      VITE_LLM_MODEL: RECOMMENDED_CLOUD_MODEL,
    });
    expect(env.VITE_LLM_MODEL).toBe(RECOMMENDED_CLOUD_MODEL);
    expect(env.VITE_LLM_API_BASE).toBe("http://localhost:11434/v1");
  });

  it("returns an empty env unchanged (no throw)", () => {
    expect(applyChatModelPreference({})).toEqual({});
  });
});
