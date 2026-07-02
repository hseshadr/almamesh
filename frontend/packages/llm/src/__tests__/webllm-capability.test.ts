// TDD: the on-device capability probe. WebGPU-or-nothing, injectable navigator,
// NO user-agent sniffing (asserted against the source), never throws.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { probeOnDeviceCapability } from "../webllm/capability";

describe("probeOnDeviceCapability — typed WebGPU report", () => {
  it("reports supported when an adapter is granted", async () => {
    const nav = { gpu: { requestAdapter: async () => ({}) } };
    await expect(probeOnDeviceCapability(nav)).resolves.toEqual({ supported: true });
  });

  it("reports no_webgpu when navigator.gpu is absent", async () => {
    await expect(probeOnDeviceCapability({})).resolves.toEqual({
      supported: false,
      reason: "no_webgpu",
    });
  });

  it("reports no_webgpu when no navigator exists at all (SSR/tests)", async () => {
    await expect(probeOnDeviceCapability(undefined)).resolves.toEqual({
      supported: false,
      reason: "no_webgpu",
    });
  });

  it("reports no_adapter when requestAdapter resolves null", async () => {
    const nav = { gpu: { requestAdapter: async () => null } };
    await expect(probeOnDeviceCapability(nav)).resolves.toEqual({
      supported: false,
      reason: "no_adapter",
    });
  });

  it("never throws: a rejecting requestAdapter becomes adapter_error", async () => {
    const nav = {
      gpu: {
        requestAdapter: async () => {
          throw new Error("GPU busted");
        },
      },
    };
    await expect(probeOnDeviceCapability(nav)).resolves.toEqual({
      supported: false,
      reason: "adapter_error",
    });
  });

  it("does no user-agent sniffing (source-level contract)", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../webllm/capability.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/userAgent|platform|vendor/i);
  });
});
