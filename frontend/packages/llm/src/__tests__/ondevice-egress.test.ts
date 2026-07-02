// The on-device egress proof: an `on_device` (webllm) chat/JSON completion
// makes ZERO fetch/XHR calls — the entire inference pipeline runs against the
// (mocked) in-browser engine. Weights download is excluded by design (it lives
// inside the library, tested/disclosed separately). Also proves the PII
// sanitization path is UNCHANGED: the prompt the on-device engine sees is the
// same identifier-free shape the HTTP egress test pins.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mlc-ai/web-llm", async () => {
  const { makeFakeWebLlm } = await import("./helpers/fake-webllm");
  return makeFakeWebLlm();
});

import type { SiderealChart } from "@almamesh/browser/types";

import golden from "../../../../../backend/tests/fixtures/chart_golden_de421.json";
import type { ProviderConfig } from "../config";
import { streamChartChat } from "../index";
import { structureLifeEvents } from "../structure-life-events";
import { resetOnDeviceEngine } from "../webllm/engine";
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

async function drain(gen: AsyncGenerator<string>): Promise<void> {
  for await (const _ of gen) {
    // consume
  }
}

function installNetworkTripwires(): { fetchSpy: ReturnType<typeof vi.fn> } {
  const fetchSpy = vi.fn(() => {
    throw new Error("on_device must not fetch");
  });
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      constructor() {
        throw new Error("on_device must not XHR");
      }
    },
  );
  return { fetchSpy };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  fake.__reset();
  resetOnDeviceEngine();
});

describe("on_device egress — zero network calls for chat and JSON completions", () => {
  it("streamChartChat on a webllm config never touches fetch/XHR", async () => {
    const { fetchSpy } = installNetworkTripwires();
    fake.__state.streamChunks = ["all", " local"];

    await drain(
      streamChartChat({
        chart: realChart,
        question: "What does my current dasha emphasize?",
        config: ONDEVICE_CFG,
        now: new Date("2030-01-01T00:00:00.000Z"),
      }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fake.__state.requests).toHaveLength(1);
  });

  it("the sanitizer still runs: the on-device prompt is identifier-free", async () => {
    installNetworkTripwires();
    await drain(
      streamChartChat({
        chart: realChart,
        question: "Tell me about my chart",
        config: ONDEVICE_CFG,
        now: new Date("2030-01-01T00:00:00.000Z"),
      }),
    );

    const prompt = JSON.stringify(fake.__state.requests[0].messages);
    expect(prompt).not.toMatch(/chart_id/);
    expect(prompt).not.toMatch(/generated_at/);
    expect(prompt).not.toMatch(/calculation_timestamp/);
    // No absolute ISO calendar timestamps (birth-derived dasha dates relativized).
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    // Sanity: the astrology DID survive into the prompt.
    expect(prompt).toMatch(/planets/i);
  });

  it("structureLifeEvents on a webllm config never touches fetch/XHR", async () => {
    const { fetchSpy } = installNetworkTripwires();
    fake.__state.jsonContent = '{"events":[]}';

    const result = await structureLifeEvents("no dated events", ONDEVICE_CFG);

    expect(result).toEqual({ status: "ok", events: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
