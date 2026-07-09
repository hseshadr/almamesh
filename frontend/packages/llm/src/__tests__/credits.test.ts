import { describe, expect, it, vi } from "vitest";

import { fetchOpenRouterCredits, LlmRequestError } from "../client";
import type { ProviderConfig } from "../config";

const OPENROUTER_CFG: ProviderConfig = {
  engine: "openai-http",
  model: "openai/gpt-4o-mini",
  privacyMode: "cloud_premium",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "sk-or-secret",
};

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchOpenRouterCredits", () => {
  it("GETs {baseUrl}/credits with the Bearer key and returns the remaining balance", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit = {};
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({ data: { total_credits: 10, total_usage: 3.5 } });
    });

    const credits = await fetchOpenRouterCredits({
      config: OPENROUTER_CFG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(capturedUrl).toBe("https://openrouter.ai/api/v1/credits");
    expect(capturedInit.method).toBe("GET");
    expect((capturedInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-or-secret",
    );
    expect(credits).toEqual({ totalCredits: 10, totalUsage: 3.5, remaining: 6.5 });
  });

  it("throws a typed LlmRequestError carrying the status on a bad key (401)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "unauthorized" }, { status: 401, statusText: "Unauthorized" }),
    );
    await expect(
      fetchOpenRouterCredits({
        config: OPENROUTER_CFG,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ name: "LlmRequestError", status: 401 });
  });

  it("throws LlmRequestError when the payload is malformed (no data fields)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: {} }));
    await expect(
      fetchOpenRouterCredits({
        config: OPENROUTER_CFG,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it("passes the abort signal through to fetch", async () => {
    const controller = new AbortController();
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      seenSignal = init.signal as AbortSignal;
      return jsonResponse({ data: { total_credits: 5, total_usage: 0 } });
    });
    await fetchOpenRouterCredits({
      config: OPENROUTER_CFG,
      signal: controller.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(seenSignal).toBe(controller.signal);
  });
});
