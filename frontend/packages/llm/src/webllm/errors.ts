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
