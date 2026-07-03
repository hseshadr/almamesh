// TDD: the lazy on-device engine singleton. The library is mocked at the
// module boundary (vitest cannot run WebGPU); these tests pin the lifecycle:
// lazy creation, one engine per model, typed progress mapping, retry after a
// failed create (engine-recovery invariant), and cached-model deletion.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mlc-ai/web-llm", async () => {
  const { makeFakeWebLlm } = await import("./helpers/fake-webllm");
  return makeFakeWebLlm();
});

import type { FakeWebLlm } from "./helpers/fake-webllm";
import {
  deleteCachedModel,
  getOnDeviceEngine,
  hasCachedModel,
  preloadOnDeviceModel,
  resetOnDeviceEngine,
  type OnDeviceProgress,
} from "../webllm/engine";
import { BLESSED_ONDEVICE_MODELS, DEFAULT_ONDEVICE_MODEL } from "../webllm/models";

const fake = (await import("@mlc-ai/web-llm")) as unknown as FakeWebLlm;

beforeEach(() => {
  fake.__reset();
  resetOnDeviceEngine();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BLESSED_ONDEVICE_MODELS — the pluggable picker list", () => {
  it("carries the Qwen3 default and the lighter Llama alternative with sizes", () => {
    expect(BLESSED_ONDEVICE_MODELS).toEqual([
      {
        id: "Qwen3-1.7B-q4f16_1-MLC",
        label: expect.any(String),
        downloadMB: 968,
        vramMB: 2037,
        default: true,
        // Qwen3 needs the enable_thinking:false neutralizer; Llama must NOT
        // carry the flag (WebLLM would inject a literal empty <think> block).
        suppressThinking: true,
      },
      {
        id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
        label: expect.any(String),
        downloadMB: 695,
        vramMB: 879,
        lighter: true,
      },
    ]);
  });

  it("DEFAULT_ONDEVICE_MODEL is the default-flagged entry's id", () => {
    expect(DEFAULT_ONDEVICE_MODEL).toBe("Qwen3-1.7B-q4f16_1-MLC");
  });
});

describe("getOnDeviceEngine — lazy singleton", () => {
  it("does not create an engine until asked", () => {
    expect(fake.CreateMLCEngine).not.toHaveBeenCalled();
  });

  it("creates ONE engine for repeated requests of the same model", async () => {
    const a = await getOnDeviceEngine(DEFAULT_ONDEVICE_MODEL);
    const b = await getOnDeviceEngine(DEFAULT_ONDEVICE_MODEL);
    expect(a).toBe(b);
    expect(fake.CreateMLCEngine).toHaveBeenCalledTimes(1);
    expect(fake.CreateMLCEngine).toHaveBeenCalledWith(
      DEFAULT_ONDEVICE_MODEL,
      expect.anything(),
    );
  });

  it("switching models unloads the old engine and creates a new one", async () => {
    await getOnDeviceEngine("Qwen3-1.7B-q4f16_1-MLC");
    await getOnDeviceEngine("Llama-3.2-1B-Instruct-q4f16_1-MLC");
    expect(fake.CreateMLCEngine).toHaveBeenCalledTimes(2);
    expect(fake.__unload).toHaveBeenCalledTimes(1);
  });

  it("maps init progress into the typed phase/progress/text callback", async () => {
    fake.__state.progressReports = [
      { progress: 0.1, text: "Fetching param cache[1/38]: 12MB fetched", timeElapsed: 1 },
      { progress: 0.6, text: "Loading model from cache[20/38]", timeElapsed: 5 },
      { progress: 1, text: "Finish loading on WebGPU - qwen3", timeElapsed: 9 },
    ];
    const seen: OnDeviceProgress[] = [];
    await getOnDeviceEngine(DEFAULT_ONDEVICE_MODEL, (p) => seen.push(p));
    expect(seen).toEqual([
      { phase: "download", progress: 0.1, text: "Fetching param cache[1/38]: 12MB fetched" },
      { phase: "load", progress: 0.6, text: "Loading model from cache[20/38]" },
      { phase: "ready", progress: 1, text: "Finish loading on WebGPU - qwen3" },
    ]);
  });

  it("a failed create clears the slot so a retry re-attempts (recovery invariant)", async () => {
    fake.__state.failCreate = new Error("download interrupted");
    await expect(getOnDeviceEngine(DEFAULT_ONDEVICE_MODEL)).rejects.toThrow(
      "download interrupted",
    );
    fake.__state.failCreate = undefined;
    await expect(getOnDeviceEngine(DEFAULT_ONDEVICE_MODEL)).resolves.toBeDefined();
    expect(fake.CreateMLCEngine).toHaveBeenCalledTimes(2);
  });

  it("makes zero fetch calls (the mocked library owns all I/O)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await getOnDeviceEngine(DEFAULT_ONDEVICE_MODEL);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("preloadOnDeviceModel — the settings-UI download entry", () => {
  it("creates the engine (download) and surfaces progress", async () => {
    fake.__state.progressReports = [
      { progress: 0.5, text: "Fetching param cache[19/38]", timeElapsed: 3 },
    ];
    const seen: OnDeviceProgress[] = [];
    await preloadOnDeviceModel(DEFAULT_ONDEVICE_MODEL, (p) => seen.push(p));
    expect(fake.CreateMLCEngine).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(1);
    expect(seen[0].phase).toBe("download");
  });
});

describe("hasCachedModel — weights-presence check WITHOUT creating an engine", () => {
  it("delegates to the library's hasModelInCache and reports presence", async () => {
    fake.__state.modelInCache = true;
    await expect(hasCachedModel(DEFAULT_ONDEVICE_MODEL)).resolves.toBe(true);
    expect(fake.hasModelInCache).toHaveBeenCalledWith(DEFAULT_ONDEVICE_MODEL);
    // No engine was created — checking must never trigger a download.
    expect(fake.CreateMLCEngine).not.toHaveBeenCalled();
  });

  it("reports absence (the restored-backup-in-a-fresh-browser case)", async () => {
    fake.__state.modelInCache = false;
    await expect(hasCachedModel(DEFAULT_ONDEVICE_MODEL)).resolves.toBe(false);
  });
});

describe("deleteCachedModel — frees the Cache API weights", () => {
  it("delegates to the library's deleteModelAllInfoInCache", async () => {
    await deleteCachedModel("Llama-3.2-1B-Instruct-q4f16_1-MLC");
    expect(fake.deleteModelAllInfoInCache).toHaveBeenCalledWith(
      "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    );
  });

  it("unloads + drops the live engine when deleting the loaded model", async () => {
    await getOnDeviceEngine(DEFAULT_ONDEVICE_MODEL);
    await deleteCachedModel(DEFAULT_ONDEVICE_MODEL);
    expect(fake.__unload).toHaveBeenCalledTimes(1);
    // The next request re-creates from scratch.
    await getOnDeviceEngine(DEFAULT_ONDEVICE_MODEL);
    expect(fake.CreateMLCEngine).toHaveBeenCalledTimes(2);
  });
});
