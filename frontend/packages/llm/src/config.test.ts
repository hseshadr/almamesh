import { describe, expect, it } from "vitest";

import { openRouterPreset, resolveProviderConfig } from "./config";

// The single-engine world: either no AI (no config at all) or the
// OpenAI-compatible HTTP path ("openai-http"). Every resolution lands on
// openai-http, so a stale saved blob can never select a nonexistent backend.

describe("resolveProviderConfig — engine resolution", () => {
  it("defaults to the openai-http engine", () => {
    expect(resolveProviderConfig({}).engine).toBe("openai-http");
  });

  it("resolves to openai-http for any engine value", () => {
    for (const value of ["mlc", "custom", "unknown", "local", "  "]) {
      expect(resolveProviderConfig({ VITE_LLM_ENGINE: value }).engine).toBe("openai-http");
    }
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
