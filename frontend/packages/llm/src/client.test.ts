import { describe, expect, it, vi } from "vitest";

import { fetchOpenRouterModels, LlmRequestError } from "./client";
import { OPENROUTER_API_BASE, type ProviderConfig } from "./config";

// Minimal fetch stub: a Response-shaped object is enough for the models reader,
// which only touches `ok`, `status`, `json()`, and (on failure) `text()`.
function stubFetch(
  body: unknown,
  { ok = true, status = 200, nonJson = false }: { ok?: boolean; status?: number; nonJson?: boolean } = {},
): typeof fetch {
  const response = {
    ok,
    status,
    json: nonJson
      ? () => Promise.reject(new SyntaxError("not json"))
      : () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
  return vi.fn(() => Promise.resolve(response)) as unknown as typeof fetch;
}

const openRouterConfig: ProviderConfig = {
  engine: "openai-http",
  model: "openai/gpt-4o",
  privacyMode: "cloud_premium",
  baseUrl: OPENROUTER_API_BASE,
  apiKey: "sk-or-test",
};

describe("fetchOpenRouterModels", () => {
  it("maps the catalog to sorted {id,name} and hits {base}/models", async () => {
    const fetchImpl = stubFetch({
      data: [
        { id: "openai/gpt-4o", name: "GPT-4o" },
        { id: "anthropic/claude-3", name: "Claude 3" },
      ],
    });
    const models = await fetchOpenRouterModels({ config: openRouterConfig, fetchImpl });

    expect(models).toEqual([
      { id: "anthropic/claude-3", name: "Claude 3" },
      { id: "openai/gpt-4o", name: "GPT-4o" },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${OPENROUTER_API_BASE}/models`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("falls back name → id when the catalog omits a name, and skips id-less rows", async () => {
    const fetchImpl = stubFetch({
      data: [
        { id: "x/only-id" },
        { name: "no id here" },
        { id: "" },
        { id: "y/named", name: "Named" },
      ],
    });
    const models = await fetchOpenRouterModels({ config: openRouterConfig, fetchImpl });
    expect(models).toEqual([
      { id: "x/only-id", name: "x/only-id" },
      { id: "y/named", name: "Named" },
    ]);
  });

  it("refuses fail-closed for a non-OpenRouter endpoint (no key leaves the host)", async () => {
    const local: ProviderConfig = { ...openRouterConfig, baseUrl: "http://localhost:11434/v1" };
    const fetchImpl = stubFetch({ data: [] });
    await expect(fetchOpenRouterModels({ config: local, fetchImpl })).rejects.toBeInstanceOf(
      LlmRequestError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws a typed LlmRequestError on a non-2xx (classifiable by the UI)", async () => {
    const fetchImpl = stubFetch("Unauthorized", { ok: false, status: 401 });
    await expect(
      fetchOpenRouterModels({ config: openRouterConfig, fetchImpl }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it("throws a typed error on a 2xx non-JSON body", async () => {
    const fetchImpl = stubFetch("<html>", { nonJson: true });
    await expect(
      fetchOpenRouterModels({ config: openRouterConfig, fetchImpl }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it("returns [] for an empty or missing data array", async () => {
    await expect(
      fetchOpenRouterModels({ config: openRouterConfig, fetchImpl: stubFetch({}) }),
    ).resolves.toEqual([]);
  });
});
