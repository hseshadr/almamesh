import { describe, expect, it } from "vitest";

import {
  ensurePrivacy,
  isLocalEndpoint,
  PrivacyViolationError,
  resolveProviderConfig,
  type ProviderConfig,
} from "../config";

describe("isLocalEndpoint — mirrors backend _is_local_endpoint/_is_private_ip", () => {
  it.each([
    "http://localhost:11434/v1",
    "http://127.0.0.1:8080/v1",
    "http://10.0.0.5:1234/v1",
    "http://192.168.1.10/v1",
    "http://172.16.5.4/v1",
    "http://my-box.local/v1",
    "http://[::1]:11434/v1",
  ])("treats %s as local", (url) => {
    expect(isLocalEndpoint(url)).toBe(true);
  });

  it.each([
    "https://openrouter.ai/api/v1",
    "https://api.openai.com/v1",
    "http://8.8.8.8/v1",
    "http://172.32.0.1/v1", // just outside the 172.16/12 private block
    undefined,
    "not a url",
  ])("treats %s as non-local", (url) => {
    expect(isLocalEndpoint(url)).toBe(false);
  });
});

describe("ensurePrivacy — fail-closed local_only contract", () => {
  it("throws PrivacyViolationError when local_only targets a cloud endpoint", () => {
    const cfg: ProviderConfig = {
      engine: "openai-http",
      model: "gpt-4o-mini",
      privacyMode: "local_only",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-secret",
    };
    expect(() => ensurePrivacy(cfg)).toThrow(PrivacyViolationError);
  });

  it("allows local_only when the endpoint is loopback", () => {
    const cfg: ProviderConfig = {
      engine: "openai-http",
      model: "llama3.1",
      privacyMode: "local_only",
      baseUrl: "http://localhost:11434/v1",
    };
    expect(() => ensurePrivacy(cfg)).not.toThrow();
  });

  it("allows cloud_premium against a remote endpoint (opt-in)", () => {
    const cfg: ProviderConfig = {
      engine: "openai-http",
      model: "gpt-4o-mini",
      privacyMode: "cloud_premium",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-secret",
    };
    expect(() => ensurePrivacy(cfg)).not.toThrow();
  });
});

describe("resolveProviderConfig — safe OSS defaults, never a bundled key", () => {
  it("defaults to the openai-http engine in local_only mode with no key", () => {
    const cfg = resolveProviderConfig({});
    // OpenRouter / BYO build: the safe default is a local OpenAI-compatible
    // endpoint (Ollama) under local_only with no bundled key.
    expect(cfg.engine).toBe("openai-http");
    expect(cfg.privacyMode).toBe("local_only");
    expect(cfg.apiKey).toBeUndefined();
    expect(cfg.baseUrl).toBe("http://localhost:11434/v1");
    expect(isLocalEndpoint(cfg.baseUrl)).toBe(true);
  });

  it("infers the openai-http engine from a legacy local endpoint config", () => {
    const cfg = resolveProviderConfig({ VITE_LLM_API_BASE: "http://localhost:11434/v1" });
    expect(cfg.engine).toBe("openai-http");
    expect(cfg.baseUrl).toBe("http://localhost:11434/v1");
    expect(isLocalEndpoint(cfg.baseUrl)).toBe(true);
  });

  it("ignores a stale/legacy engine flag and stays openai-http", () => {
    // A saved blob might still pin a legacy engine value; the build supports
    // only the OpenAI-compatible HTTP engine, so it is ignored.
    const cfg = resolveProviderConfig({
      VITE_LLM_ENGINE: "web" + "llm",
    });
    expect(cfg.engine).toBe("openai-http");
  });

  it("honors an explicit cloud config from env", () => {
    const cfg = resolveProviderConfig({
      VITE_LLM_API_BASE: "https://openrouter.ai/api/v1",
      VITE_LLM_API_KEY: "sk-openrouter",
      VITE_LLM_MODEL: "deepseek/deepseek-chat",
      VITE_LLM_PRIVACY_MODE: "cloud_premium",
    });
    expect(cfg.privacyMode).toBe("cloud_premium");
    expect(cfg.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(cfg.apiKey).toBe("sk-openrouter");
    expect(cfg.model).toBe("deepseek/deepseek-chat");
  });

  it("ignores an unknown privacy mode and falls back to local_only", () => {
    const cfg = resolveProviderConfig({ VITE_LLM_PRIVACY_MODE: "wide_open" });
    expect(cfg.privacyMode).toBe("local_only");
  });
});
