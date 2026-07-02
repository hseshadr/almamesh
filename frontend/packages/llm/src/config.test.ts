import { describe, expect, it } from "vitest";

import { openRouterPreset, resolveProviderConfig } from "./config";
import { DEFAULT_ONDEVICE_MODEL } from "./webllm/models";

// Spec 063: the engine union is a THREE-KIND world — no AI (no config at all),
// on-device ("webllm"), and the OpenAI-compatible HTTP path ("openai-http").
// "webllm" is a first-class opt-in again; anything ELSE unknown/legacy still
// falls back to openai-http.

describe("resolveProviderConfig — three-kind engine resolution", () => {
  it("defaults to the openai-http engine", () => {
    expect(resolveProviderConfig({}).engine).toBe("openai-http");
  });

  it("selects the on-device engine when env/settings ask for webllm", () => {
    expect(resolveProviderConfig({ VITE_LLM_ENGINE: "webllm" }).engine).toBe("webllm");
  });

  it("falls back to openai-http for unknown/legacy engine values", () => {
    for (const legacy of ["mlc", "web-llm", "WEBLLM", "local", "  "]) {
      expect(resolveProviderConfig({ VITE_LLM_ENGINE: legacy }).engine).toBe("openai-http");
    }
  });

  it("defaults the on-device model to the blessed default, never an HTTP model", () => {
    const cfg = resolveProviderConfig({ VITE_LLM_ENGINE: "webllm" });
    expect(cfg.model).toBe(DEFAULT_ONDEVICE_MODEL);
  });

  it("an on-device config carries no baseUrl (nothing to point at)", () => {
    const cfg = resolveProviderConfig({ VITE_LLM_ENGINE: "webllm" });
    expect(cfg.baseUrl).toBeUndefined();
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
