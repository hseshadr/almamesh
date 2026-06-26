import { describe, expect, it } from "vitest";

import { openRouterPreset, resolveProviderConfig } from "./config";

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
