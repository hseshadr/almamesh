import { describe, expect, it } from "vitest";

import { OPENROUTER_API_BASE, openRouterPreset, resolveProviderConfig } from "./config";

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

describe("resolveProviderConfig — known-base normalization", () => {
  // A friend hand-typed the OpenRouter dashboard root into Advanced settings and
  // hit "Couldn't connect": the API lives at /api/v1, and the bare host sends the
  // probe/reading/chat to the wrong path. Normalize any openrouter.ai host to the
  // canonical API base so the common mistake just works everywhere at once.
  it("normalizes a bare openrouter.ai host to the canonical /api/v1 base", () => {
    for (const typed of [
      "https://openrouter.ai/",
      "https://openrouter.ai",
      "https://openrouter.ai/api",
      "https://openrouter.ai/api/v1/", // trailing slash
      "https://www.openrouter.ai/",
      "  https://openrouter.ai/  ", // stray whitespace
      "openrouter.ai", // scheme-less
    ]) {
      expect(resolveProviderConfig({ VITE_LLM_API_BASE: typed }).baseUrl).toBe(OPENROUTER_API_BASE);
    }
  });

  it("leaves the already-correct OpenRouter base untouched", () => {
    expect(resolveProviderConfig({ VITE_LLM_API_BASE: OPENROUTER_API_BASE }).baseUrl).toBe(
      OPENROUTER_API_BASE,
    );
  });

  it("passes through a non-OpenRouter endpoint verbatim (local Ollama, custom hosts)", () => {
    for (const base of [
      "http://localhost:11434/v1",
      "http://127.0.0.1:1234/v1",
      "https://api.openai.com/v1",
      "https://my-proxy.example.com/openrouter/v1", // 'openrouter' in path, not host
    ]) {
      expect(resolveProviderConfig({ VITE_LLM_API_BASE: base }).baseUrl).toBe(base.trim());
    }
  });

  it("keeps the API key attached after normalizing the OpenRouter host", () => {
    const cfg = resolveProviderConfig({
      VITE_LLM_API_BASE: "https://openrouter.ai/",
      VITE_LLM_API_KEY: "sk-or-123",
    });
    expect(cfg.baseUrl).toBe(OPENROUTER_API_BASE);
    expect(cfg.apiKey).toBe("sk-or-123");
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
