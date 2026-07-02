// The on-device capability probe: WebGPU-or-nothing, decided by FEATURE
// DETECTION only (`navigator.gpu` + a real adapter request) — never by
// user-agent sniffing. Injectable navigator so the probe is unit-testable
// without a GPU, and it NEVER throws: every failure mode resolves to a typed
// unsupported reason the settings UI turns into honest copy.

/** Why the device cannot run the on-device tier. */
export type OnDeviceUnsupportedReason =
  /** `navigator.gpu` is absent — the browser has no WebGPU at all. */
  | "no_webgpu"
  /** WebGPU exists but `requestAdapter()` granted no adapter. */
  | "no_adapter"
  /** `requestAdapter()` itself failed (driver/permission error). */
  | "adapter_error";

/** Typed capability report: supported, or unsupported with a reason. */
export type OnDeviceCapability =
  | { readonly supported: true }
  | { readonly supported: false; readonly reason: OnDeviceUnsupportedReason };

/** The minimal structural slice of `navigator` the probe reads. */
export interface NavigatorGpuLike {
  readonly gpu?: {
    requestAdapter(): Promise<object | null>;
  };
}

/**
 * Probe whether this device can run on-device (WebLLM/WebGPU) inference.
 * Resolves `{ supported: true }` only when a WebGPU adapter is actually
 * granted; otherwise a typed unsupported reason. Never throws.
 */
export async function probeOnDeviceCapability(
  nav: NavigatorGpuLike | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator as NavigatorGpuLike),
): Promise<OnDeviceCapability> {
  const gpu = nav?.gpu;
  if (!gpu) {
    return { supported: false, reason: "no_webgpu" };
  }
  let adapter: object | null;
  try {
    adapter = await gpu.requestAdapter();
  } catch {
    return { supported: false, reason: "adapter_error" };
  }
  if (!adapter) {
    return { supported: false, reason: "no_adapter" };
  }
  return { supported: true };
}
