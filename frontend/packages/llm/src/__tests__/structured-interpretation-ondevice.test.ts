// TDD: the on-device SCOPE FENCE. The structured six-section interpretation is
// NOT served on-device in v1 — a webllm config must throw the typed
// `OnDeviceUnsupportedError` BEFORE any work (no sanitize, no engine create,
// no network), so the UI can render honest copy. The LITE-prompt gate
// generalizes to "local endpoint OR on-device" for future-proofing.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mlc-ai/web-llm", async () => {
  const { makeFakeWebLlm } = await import("./helpers/fake-webllm");
  return makeFakeWebLlm();
});

import type { SiderealChart } from "@almamesh/browser/types";

import golden from "../../../../../backend/tests/fixtures/chart_golden_de421.json";
import type { ProviderConfig } from "../config";
import { streamStructuredInterpretation, usesLitePrompt } from "../structured-interpretation";
import { resetOnDeviceEngine } from "../webllm/engine";
import { OnDeviceUnsupportedError } from "../webllm/errors";
import type { FakeWebLlm } from "./helpers/fake-webllm";

const fake = (await import("@mlc-ai/web-llm")) as unknown as FakeWebLlm;

const goldenCharts = golden as Record<string, SiderealChart>;
const [firstKey] = Object.keys(goldenCharts);
const realChart: SiderealChart = goldenCharts[firstKey];

const ONDEVICE_CFG: ProviderConfig = {
  engine: "webllm",
  model: "Qwen3-1.7B-q4f16_1-MLC",
  privacyMode: "local_only",
};

beforeEach(() => {
  vi.unstubAllGlobals();
  fake.__reset();
  resetOnDeviceEngine();
});

describe("streamStructuredInterpretation — on-device scope fence", () => {
  it("throws the typed OnDeviceUnsupportedError before ANY work on a webllm config", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const gen = streamStructuredInterpretation({ chart: realChart, config: ONDEVICE_CFG });
    await expect(gen.next()).rejects.toBeInstanceOf(OnDeviceUnsupportedError);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fake.CreateMLCEngine).not.toHaveBeenCalled();
    expect(fake.__state.requests).toHaveLength(0);
  });

  it("the error is typed + named so the UI can map it to honest copy", async () => {
    const gen = streamStructuredInterpretation({ chart: realChart, config: ONDEVICE_CFG });
    const err = await gen.next().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(OnDeviceUnsupportedError);
    expect((err as OnDeviceUnsupportedError).name).toBe("OnDeviceUnsupportedError");
    expect((err as OnDeviceUnsupportedError).feature).toBe("structured interpretation");
  });
});

describe("usesLitePrompt — the generalized LITE gate", () => {
  it("stays true for a local OpenAI-compatible endpoint (existing behavior)", () => {
    const cfg: ProviderConfig = {
      engine: "openai-http",
      model: "llama3.1",
      privacyMode: "local_only",
      baseUrl: "http://localhost:11434/v1",
    };
    expect(usesLitePrompt(cfg)).toBe(true);
  });

  it("stays false for a cloud endpoint (existing behavior)", () => {
    const cfg: ProviderConfig = {
      engine: "openai-http",
      model: "deepseek/deepseek-v4-pro",
      privacyMode: "cloud_premium",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-x",
    };
    expect(usesLitePrompt(cfg)).toBe(false);
  });

  it("is true for the on-device engine (no baseUrl at all)", () => {
    expect(usesLitePrompt(ONDEVICE_CFG)).toBe(true);
  });
});
