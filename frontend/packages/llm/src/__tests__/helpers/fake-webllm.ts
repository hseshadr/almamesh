// Shared fake for the `@mlc-ai/web-llm` module boundary. Vitest cannot run
// WebGPU, so every on-device test mocks the library here and asserts on the
// requests our engine/provider layer builds (enable_thinking, schema, abort,
// progress) plus the zero-network invariant.
//
// Usage in a test file:
//   vi.mock("@mlc-ai/web-llm", async () => {
//     const { makeFakeWebLlm } = await import("./helpers/fake-webllm");
//     return makeFakeWebLlm();
//   });
//   const fake = (await import("@mlc-ai/web-llm")) as unknown as FakeWebLlm;

import { vi, type Mock } from "vitest";

/** The init-progress report shape WebLLM's initProgressCallback receives. */
export interface FakeInitProgressReport {
  readonly progress: number;
  readonly text: string;
  readonly timeElapsed: number;
}

/** Chat request captured verbatim from `engine.chat.completions.create`. */
export interface FakeChatRequest {
  readonly messages: ReadonlyArray<{ role: string; content: string }>;
  readonly stream?: boolean;
  readonly response_format?: { type: string; schema?: string };
  readonly extra_body?: { enable_thinking?: boolean };
  readonly [key: string]: unknown;
}

export interface FakeWebLlmState {
  /** Every chat request any fake engine received, in order. */
  requests: FakeChatRequest[];
  /** Token deltas the next streaming request yields. */
  streamChunks: string[];
  /** Message content the next non-streaming request returns. */
  jsonContent: string;
  /** Progress reports replayed through initProgressCallback during create. */
  progressReports: FakeInitProgressReport[];
  /** When set, the next CreateMLCEngine call rejects with this error. */
  failCreate: Error | undefined;
  /** What hasModelInCache reports (weights present in the Cache API). */
  modelInCache: boolean;
  /**
   * Context window the fake enforces LIKE THE REAL ENGINE: a request whose
   * estimated prompt tokens (chars/4, the same heuristic as `budget.ts`)
   * exceed this throws a `ContextWindowSizeExceededError`-shaped error
   * instead of truncating. Defaults to the blessed models' 4096 so an
   * over-budget prompt fails loudly in tests.
   */
  contextWindowSize: number;
}

export interface FakeWebLlm {
  CreateMLCEngine: Mock;
  deleteModelAllInfoInCache: Mock;
  hasModelInCache: Mock;
  __state: FakeWebLlmState;
  __interrupt: Mock;
  __unload: Mock;
  __reset(): void;
}

export function makeFakeWebLlm(): FakeWebLlm {
  const state: FakeWebLlmState = {
    requests: [],
    streamChunks: ["Hello", " world"],
    jsonContent: '{"ok":true}',
    progressReports: [],
    failCreate: undefined,
    modelInCache: true,
    contextWindowSize: 4096,
  };
  const interrupt = vi.fn();
  const unload = vi.fn(async () => {});

  /** Real-engine behavior: an over-window prompt THROWS, never truncates. */
  function enforceContextWindow(request: FakeChatRequest): void {
    const promptChars = request.messages.reduce((n, m) => n + m.content.length, 0);
    const promptTokens = Math.ceil(promptChars / 4);
    if (promptTokens > state.contextWindowSize) {
      const err = new Error(
        `Prompt tokens exceed context window size: number of prompt tokens: ` +
          `${promptTokens}; context window size: ${state.contextWindowSize}`,
      );
      err.name = "ContextWindowSizeExceededError";
      throw err;
    }
  }

  function makeEngine() {
    return {
      chat: {
        completions: {
          create: vi.fn(async (request: FakeChatRequest) => {
            state.requests.push(request);
            enforceContextWindow(request);
            if (request.stream) {
              const chunks = [...state.streamChunks];
              return (async function* () {
                for (const content of chunks) {
                  yield { choices: [{ delta: { content } }] };
                }
              })();
            }
            return { choices: [{ message: { content: state.jsonContent } }] };
          }),
        },
      },
      interruptGenerate: interrupt,
      unload,
    };
  }

  const CreateMLCEngine = vi.fn(
    async (
      _modelId: string,
      opts?: { initProgressCallback?: (report: FakeInitProgressReport) => void },
    ) => {
      if (state.failCreate) {
        throw state.failCreate;
      }
      for (const report of state.progressReports) {
        opts?.initProgressCallback?.(report);
      }
      return makeEngine();
    },
  );

  const deleteModelAllInfoInCache = vi.fn(async (_modelId: string) => {});

  const hasModelInCache = vi.fn(async (_modelId: string) => state.modelInCache);

  return {
    CreateMLCEngine,
    deleteModelAllInfoInCache,
    hasModelInCache,
    __state: state,
    __interrupt: interrupt,
    __unload: unload,
    __reset() {
      state.requests = [];
      state.streamChunks = ["Hello", " world"];
      state.jsonContent = '{"ok":true}';
      state.progressReports = [];
      state.failCreate = undefined;
      state.modelInCache = true;
      state.contextWindowSize = 4096;
      CreateMLCEngine.mockClear();
      deleteModelAllInfoInCache.mockClear();
      hasModelInCache.mockClear();
      interrupt.mockClear();
      unload.mockClear();
    },
  };
}
