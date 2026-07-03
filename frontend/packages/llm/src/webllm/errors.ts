// Typed error for the on-device SCOPE FENCE (Spec 063): features the v1
// on-device tier deliberately does not serve (the structured six-section
// interpretation) throw this BEFORE any work, so the UI can render honest
// "use a cloud or local endpoint — stronger models" copy instead of letting a
// small model degrade the reading.

/** A feature the on-device (WebLLM) tier does not serve in v1. */
export class OnDeviceUnsupportedError extends Error {
  /** Which capability was refused, e.g. "structured interpretation". */
  public readonly feature: string;

  constructor(feature: string) {
    super(
      `On-device AI does not serve ${feature} in v1. ` +
        `Use a cloud or local OpenAI-compatible endpoint (stronger models).`,
    );
    this.name = "OnDeviceUnsupportedError";
    this.feature = feature;
  }
}

/**
 * The composed prompt exceeded the on-device model's context window. WebLLM
 * THROWS on overflow (it never truncates), so without a typed cause every
 * over-long conversation collapses into a generic failure. Recoverable: start
 * a new chat or ask a shorter question.
 */
export class OnDeviceContextOverflowError extends Error {
  constructor(cause?: unknown) {
    super("On-device prompt exceeded the model's context window");
    this.name = "OnDeviceContextOverflowError";
    this.cause = cause;
  }
}

/**
 * The requested model id has no record in WebLLM's prebuilt registry (e.g. a
 * cloud/Ollama slug leaked into the on-device settings, or a stale saved id).
 * Recoverable: re-select or re-download the on-device model in Settings.
 */
export class OnDeviceModelRecordError extends Error {
  constructor(cause?: unknown) {
    super("On-device model record not found in the WebLLM registry");
    this.name = "OnDeviceModelRecordError";
    this.cause = cause;
  }
}

/**
 * Map a raw WebLLM failure onto the typed on-device causes above; anything
 * unrecognized (including aborts) passes through untouched so generic
 * handling stays generic. Matched by error NAME first, message as fallback —
 * the library's classes are not importable here (lazy-load invariant).
 */
export function toOnDeviceError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }
  if (
    error.name === "ContextWindowSizeExceededError" ||
    /context window size/i.test(error.message)
  ) {
    return new OnDeviceContextOverflowError(error);
  }
  if (error.name === "ModelNotFoundError" || /cannot find model record/i.test(error.message)) {
    return new OnDeviceModelRecordError(error);
  }
  return error;
}
