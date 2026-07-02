// The lazy on-device engine singleton.
//
// THE LAZY-LOAD INVARIANT: `@mlc-ai/web-llm` is referenced ONLY via dynamic
// `import()` inside this module — never a static import (not even for types),
// so the multi-MB library lands in its own lazily-fetched chunk that a user
// who never enables the on-device tier never downloads. Enforced by
// `__tests__/webllm-lazy-import.test.ts`.
//
// Lifecycle: one engine per selected model. Switching models unloads the old
// engine (frees GPU memory) before creating the new one. A failed create
// clears the slot so a retry re-attempts — the engine-recovery invariant.
// Weights are cached by WebLLM's own Cache API storage; `deleteCachedModel`
// frees them (the settings UI's "delete downloaded model").

/** Which stage of engine bring-up a progress report describes. */
export type OnDeviceProgressPhase = "download" | "load" | "ready";

/** Typed download/load progress surfaced to the settings UI. */
export interface OnDeviceProgress {
  readonly phase: OnDeviceProgressPhase;
  /** 0 → 1 (WebLLM's own overall scale). */
  readonly progress: number;
  /** Human text, e.g. "Fetching param cache[12/38]". */
  readonly text: string;
}

/** Callback invoked for every init-progress report during engine bring-up. */
export type OnDeviceProgressCallback = (progress: OnDeviceProgress) => void;

// --- Structural slices of the WebLLM API this package uses. Kept local so no
// --- type import of the library is needed (see the lazy-load invariant).

/** One streamed chunk from a `stream: true` on-device completion. */
export interface OnDeviceChatDelta {
  readonly choices?: ReadonlyArray<{
    readonly delta?: { readonly content?: string | null };
  }>;
}

/** The full message of a non-streaming on-device completion. */
export interface OnDeviceChatCompletion {
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: string | null };
  }>;
}

/** The OpenAI-shaped request the on-device engine accepts. */
export interface OnDeviceChatRequest {
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
  readonly stream?: boolean;
  readonly response_format?: { readonly type: "json_object"; readonly schema?: string };
  /** Qwen3 `<think>`-block hazard: every request pins `enable_thinking: false`. */
  readonly extra_body?: { readonly enable_thinking: boolean };
}

/** The narrow engine surface the provider layer talks to. */
export interface OnDeviceEngineHandle {
  readonly chat: {
    readonly completions: {
      create(
        request: OnDeviceChatRequest,
      ): Promise<AsyncIterable<OnDeviceChatDelta> | OnDeviceChatCompletion>;
    };
  };
  interruptGenerate(): void;
  unload?(): Promise<void>;
}

interface InitProgressReportLike {
  readonly progress: number;
  readonly text: string;
}

interface WebLlmModuleLike {
  CreateMLCEngine(
    modelId: string,
    opts?: { initProgressCallback?: (report: InitProgressReportLike) => void },
  ): Promise<OnDeviceEngineHandle>;
  deleteModelAllInfoInCache(modelId: string): Promise<void>;
}

/** The ONLY place the library is loaded — dynamically, on first real use. */
async function loadWebLlm(): Promise<WebLlmModuleLike> {
  return (await import("@mlc-ai/web-llm")) as unknown as WebLlmModuleLike;
}

/** Map WebLLM's init report onto the typed phase/progress/text callback. */
function toProgress(report: InitProgressReportLike): OnDeviceProgress {
  const phase: OnDeviceProgressPhase =
    report.progress >= 1
      ? "ready"
      : /fetching|download/i.test(report.text)
        ? "download"
        : "load";
  return { phase, progress: report.progress, text: report.text };
}

interface EngineSlot {
  readonly modelId: string;
  readonly promise: Promise<OnDeviceEngineHandle>;
}

let slot: EngineSlot | undefined;

async function unloadSlot(previous: EngineSlot | undefined): Promise<void> {
  if (!previous) {
    return;
  }
  const engine = await previous.promise.catch(() => undefined);
  try {
    await engine?.unload?.();
  } catch {
    // Best-effort GPU cleanup; a failed unload must not block the new engine.
  }
}

/**
 * Get (or lazily create) the on-device engine for `modelId`. The first call
 * triggers the library chunk load + the weights download (or Cache API reuse),
 * with progress surfaced through `onProgress`. Subsequent calls for the same
 * model reuse the same engine; a different model unloads the old engine first.
 */
export function getOnDeviceEngine(
  modelId: string,
  onProgress?: OnDeviceProgressCallback,
): Promise<OnDeviceEngineHandle> {
  if (slot && slot.modelId === modelId) {
    return slot.promise;
  }
  const previous = slot;
  const promise = (async () => {
    await unloadSlot(previous);
    const webllm = await loadWebLlm();
    return webllm.CreateMLCEngine(modelId, {
      ...(onProgress
        ? { initProgressCallback: (report: InitProgressReportLike) => onProgress(toProgress(report)) }
        : {}),
    });
  })();
  slot = { modelId, promise };
  // Recovery invariant: a failed bring-up clears the slot so the next call
  // retries instead of pinning a dead promise forever.
  promise.catch(() => {
    if (slot?.promise === promise) {
      slot = undefined;
    }
  });
  return promise;
}

/**
 * Download (or warm from cache) an on-device model ahead of first use — the
 * settings UI's "Download" action, with typed progress for the disclosure UI.
 */
export async function preloadOnDeviceModel(
  modelId: string,
  onProgress?: OnDeviceProgressCallback,
): Promise<void> {
  await getOnDeviceEngine(modelId, onProgress);
}

/**
 * Delete a model's cached weights (WebLLM Cache API). If that model is the
 * live engine, it is unloaded and dropped first so the next use re-creates
 * (and re-downloads) from scratch.
 */
export async function deleteCachedModel(modelId: string): Promise<void> {
  if (slot?.modelId === modelId) {
    const current = slot;
    slot = undefined;
    await unloadSlot(current);
  }
  const webllm = await loadWebLlm();
  await webllm.deleteModelAllInfoInCache(modelId);
}

/** Drop the singleton (tests / hard reset). Does not touch cached weights. */
export function resetOnDeviceEngine(): void {
  slot = undefined;
}
