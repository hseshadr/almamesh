// The blessed on-device model list (Spec 063) — pure data, safe to import
// eagerly anywhere (settings, UI pickers) without pulling `@mlc-ai/web-llm`
// into any chunk. Pluggable by design: the fence-violation benchmark harness
// re-ranks this list without code changes elsewhere.
//
// Ids are exact MLC `model_id` strings from WebLLM 0.2.84's prebuilt registry.

/** One picker entry for the on-device (WebLLM) tier. */
export interface OnDeviceModelSpec {
  /** Exact MLC model id, zero-config in WebLLM's prebuilt registry. */
  readonly id: string;
  /** Human label for the settings picker. */
  readonly label: string;
  /** Approximate weights download size, MB (UI disclosure). */
  readonly downloadMB: number;
  /** Approximate VRAM required to run, MB (capability messaging). */
  readonly vramMB: number;
  /** The recommended default pick. */
  readonly default?: boolean;
  /** The lighter alternative for low-VRAM devices. */
  readonly lighter?: boolean;
  /**
   * Send `extra_body: { enable_thinking: false }` on every request for this
   * model. Qwen3 needs it (it emits real `<think>` reasoning blocks
   * otherwise); models WITHOUT the flag must NEVER receive it — WebLLM 0.2.84
   * answers `enable_thinking === false` by splicing a literal empty
   * `"<think>\n\n</think>\n\n"` into the prompt AND the decoded stream when
   * the model's tokenizer lacks the think token (Llama), so the flag itself
   * creates the garbage it is meant to prevent.
   */
  readonly suppressThinking?: boolean;
}

/**
 * The vetted on-device models. Qwen3-1.7B is the default (Apache-2.0, real
 * es/pt coverage, `<think>` hazard neutralized via `enable_thinking: false`);
 * Llama-3.2-1B is the lighter fallback for constrained devices.
 */
export const BLESSED_ONDEVICE_MODELS: readonly OnDeviceModelSpec[] = [
  {
    id: "Qwen3-1.7B-q4f16_1-MLC",
    label: "Qwen3 1.7B (recommended)",
    downloadMB: 968,
    vramMB: 2037,
    default: true,
    suppressThinking: true,
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B (lighter)",
    downloadMB: 695,
    vramMB: 879,
    lighter: true,
  },
];

/** The default-flagged blessed model id — the on-device model fallback. */
export const DEFAULT_ONDEVICE_MODEL: string = (
  BLESSED_ONDEVICE_MODELS.find((m) => m.default) ?? BLESSED_ONDEVICE_MODELS[0]
).id;
