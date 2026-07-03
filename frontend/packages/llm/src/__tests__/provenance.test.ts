/**
 * configFingerprint — the reading-provenance identity of a resolved provider
 * config. A stored interpretation carries this fingerprint so the dashboard can
 * tell "the reading on screen was produced by a DIFFERENT engine/model/endpoint
 * than the one now configured" and regenerate. It must identify WHAT would
 * produce a reading (engine, model, base URL) and must NEVER leak a secret.
 */
import { describe, expect, it } from "vitest";

import type { ProviderConfig } from "../config";
import { configFingerprint, configProvenance, type ReadingProvenance } from "../provenance";
import {
  configFingerprint as barrelFingerprint,
  configProvenance as barrelProvenance,
} from "../index";

/**
 * A synthetic cloud config — the key is fake and must never appear.
 * `satisfies` (not a `: ProviderConfig` annotation) so the narrow HTTP-variant
 * type is retained and `.baseUrl` / `.apiKey` stay directly accessible.
 */
const CLOUD = {
  engine: "openai-http",
  model: "deepseek/deepseek-v4-pro",
  privacyMode: "cloud_premium",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-or-v1-0000-synthetic-test-key",
} satisfies ProviderConfig;

const ON_DEVICE: ProviderConfig = {
  engine: "webllm",
  model: "Qwen3-1.7B-q4f16_1-MLC",
  privacyMode: "local_only",
};

describe("configProvenance", () => {
  it("is exported from the package barrel", () => {
    expect(barrelProvenance).toBe(configProvenance);
  });

  it("captures the display identity: engine, model, base URL — nothing else", () => {
    expect(configProvenance(CLOUD)).toEqual({
      engine: "openai-http",
      model: "deepseek/deepseek-v4-pro",
      baseUrl: "https://openrouter.ai/api/v1",
    });
  });

  it("NEVER carries the apiKey (or any fragment of it)", () => {
    const serialized = JSON.stringify(configProvenance(CLOUD));
    expect(serialized).not.toContain(CLOUD.apiKey as string);
    expect(serialized).not.toContain("synthetic-test-key");
  });

  it("omits baseUrl for the on-device engine (no endpoint exists)", () => {
    expect(configProvenance(ON_DEVICE)).toEqual({
      engine: "webllm",
      model: "Qwen3-1.7B-q4f16_1-MLC",
    });
  });

  it("carries no baseUrl key at all for the on-device engine", () => {
    expect("baseUrl" in configProvenance(ON_DEVICE)).toBe(false);
  });

  it("normalizes a trailing-slash base URL", () => {
    const slashed = { ...CLOUD, baseUrl: "https://openrouter.ai/api/v1/" };
    expect(configProvenance(slashed)).toEqual({
      engine: "openai-http",
      model: "deepseek/deepseek-v4-pro",
      baseUrl: "https://openrouter.ai/api/v1",
    });
  });
});

describe("configFingerprint", () => {
  it("is exported from the package barrel", () => {
    expect(barrelFingerprint).toBe(configFingerprint);
  });

  it("accepts a live config and a persisted provenance interchangeably", () => {
    // A persisted entry stores the ReadingProvenance object; the dashboard
    // compares it against the live ProviderConfig — both must fingerprint
    // identically when they describe the same producer.
    expect(configFingerprint(configProvenance(CLOUD))).toBe(configFingerprint(CLOUD));
    // A rehydrated plain object (localStorage round-trip) matches too.
    const rehydrated: ReadingProvenance = JSON.parse(JSON.stringify(configProvenance(CLOUD)));
    expect(configFingerprint(rehydrated)).toBe(configFingerprint(CLOUD));
  });

  it("is stable: the same config always fingerprints identically", () => {
    expect(configFingerprint(CLOUD)).toBe(configFingerprint({ ...CLOUD }));
  });

  // Persisted-format locks: a stored v3 provenance carries this exact string.
  // These pin the byte shape per engine variant so the discriminated-union
  // refactor cannot silently drift the fingerprint (which would invalidate every
  // stored reading). One per variant.
  it("emits a stable openai-http fingerprint string (engine, model, baseUrl)", () => {
    expect(configFingerprint(CLOUD)).toBe(
      '{"engine":"openai-http","model":"deepseek/deepseek-v4-pro","baseUrl":"https://openrouter.ai/api/v1"}',
    );
  });

  it("emits a stable webllm fingerprint string with a null baseUrl", () => {
    expect(configFingerprint(ON_DEVICE)).toBe(
      '{"engine":"webllm","model":"Qwen3-1.7B-q4f16_1-MLC","baseUrl":null}',
    );
  });

  it("NEVER contains the apiKey (or any fragment of it)", () => {
    const fp = configFingerprint(CLOUD);
    expect(fp).not.toContain(CLOUD.apiKey as string);
    expect(fp).not.toContain("synthetic-test-key");
  });

  it("is identical for two configs differing only by apiKey", () => {
    const rotated = { ...CLOUD, apiKey: "sk-or-v1-9999-another-fake" };
    const keyless: ProviderConfig = {
      engine: CLOUD.engine,
      model: CLOUD.model,
      privacyMode: CLOUD.privacyMode,
      baseUrl: CLOUD.baseUrl as string,
    };
    expect(configFingerprint(rotated)).toBe(configFingerprint(CLOUD));
    expect(configFingerprint(keyless)).toBe(configFingerprint(CLOUD));
  });

  it("changes when the model changes", () => {
    const other = { ...CLOUD, model: "minimax/minimax-m2.7" };
    expect(configFingerprint(other)).not.toBe(configFingerprint(CLOUD));
  });

  it("changes when the base URL changes (cloud vs local endpoint)", () => {
    const local = { ...CLOUD, baseUrl: "http://localhost:11434/v1" };
    expect(configFingerprint(local)).not.toBe(configFingerprint(CLOUD));
  });

  it("changes when the engine changes (openai-http vs on-device webllm)", () => {
    const asWebllm: ProviderConfig = {
      engine: "webllm",
      model: CLOUD.model,
      privacyMode: CLOUD.privacyMode,
    };
    expect(configFingerprint(asWebllm)).not.toBe(configFingerprint(CLOUD));
  });

  it("distinguishes on-device configs by MLC model id", () => {
    const lighter = { ...ON_DEVICE, model: "Llama-3.2-1B-Instruct-q4f16_1-MLC" };
    expect(configFingerprint(lighter)).not.toBe(configFingerprint(ON_DEVICE));
  });

  it("treats a trailing-slash base URL as the same endpoint", () => {
    const slashed = { ...CLOUD, baseUrl: "https://openrouter.ai/api/v1/" };
    expect(configFingerprint(slashed)).toBe(configFingerprint(CLOUD));
  });
});

describe("ProviderConfig / ReadingProvenance discriminated unions (type-level)", () => {
  // These guards ARE the discriminated union: illegal engine/field combinations
  // must not typecheck. Every `@ts-expect-error` below must suppress a REAL
  // error — under a flat shape (baseUrl/apiKey optional on every config) there is
  // nothing to suppress, so `tsc` reports each directive as unused (TS2578) and
  // the type-check fails. That failure is the red state this refactor turns green.

  it("forbids an on-device config that carries an endpoint", () => {
    const withEndpoint: ProviderConfig = {
      engine: "webllm",
      model: "Qwen3-1.7B-q4f16_1-MLC",
      privacyMode: "local_only",
      // @ts-expect-error — the on-device engine has no endpoint to point at
      baseUrl: "https://openrouter.ai/api/v1",
    };
    expect(withEndpoint.engine).toBe("webllm");
  });

  it("forbids an on-device config that carries an apiKey", () => {
    const withKey: ProviderConfig = {
      engine: "webllm",
      model: "Qwen3-1.7B-q4f16_1-MLC",
      privacyMode: "local_only",
      // @ts-expect-error — the on-device engine never carries an apiKey
      apiKey: "sk-must-not-typecheck",
    };
    expect(withKey.engine).toBe("webllm");
  });

  it("requires a baseUrl endpoint on the openai-http engine", () => {
    // @ts-expect-error — the HTTP engine must carry a baseUrl endpoint
    const missingEndpoint: ProviderConfig = {
      engine: "openai-http",
      model: "deepseek/deepseek-v4-pro",
      privacyMode: "cloud_premium",
    };
    expect(missingEndpoint.engine).toBe("openai-http");
  });

  it("forbids a webllm provenance that carries a baseUrl", () => {
    const prov: ReadingProvenance = {
      engine: "webllm",
      model: "Qwen3-1.7B-q4f16_1-MLC",
      // @ts-expect-error — a webllm provenance has no endpoint field
      baseUrl: "https://openrouter.ai/api/v1",
    };
    expect(prov.engine).toBe("webllm");
  });
});
