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
}

export interface FakeWebLlm {
  CreateMLCEngine: Mock;
  deleteModelAllInfoInCache: Mock;
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
  };
  const interrupt = vi.fn();
  const unload = vi.fn(async () => {});

  function makeEngine() {
    return {
      chat: {
        completions: {
          create: vi.fn(async (request: FakeChatRequest) => {
            state.requests.push(request);
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

  return {
    CreateMLCEngine,
    deleteModelAllInfoInCache,
    __state: state,
    __interrupt: interrupt,
    __unload: unload,
    __reset() {
      state.requests = [];
      state.streamChunks = ["Hello", " world"];
      state.jsonContent = '{"ok":true}';
      state.progressReports = [];
      state.failCreate = undefined;
      CreateMLCEngine.mockClear();
      deleteModelAllInfoInCache.mockClear();
      interrupt.mockClear();
      unload.mockClear();
    },
  };
}
