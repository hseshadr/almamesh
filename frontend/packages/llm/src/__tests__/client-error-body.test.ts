import { describe, expect, it, vi } from "vitest";

import { chatCompletionJson, LlmRequestError, type ChatMessage } from "../client";
import { ProviderConfig } from "../config";

// A local endpoint so `ensurePrivacy` passes under the default local_only mode.
const LOCAL_CFG: ProviderConfig = {
  engine: "openai-http",
  model: "x/y",
  privacyMode: "local_only",
  baseUrl: "http://localhost:11434/v1",
};

const MESSAGES: readonly ChatMessage[] = [{ role: "user", content: "hello" }];

/** A fetch stub that returns one canned error Response, ignoring its input. */
function errorFetch(body: string, init: ResponseInit): typeof fetch {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;
}

describe("chatCompletionJson — diagnosable request errors", () => {
  it("surfaces the response body in the message, status, and .body", async () => {
    const body = JSON.stringify({
      error: { message: "No endpoints found for x/y", code: 404 },
    });
    const fetchImpl = errorFetch(body, { status: 404, statusText: "Not Found" });

    const err = await chatCompletionJson({
      config: LOCAL_CFG,
      messages: MESSAGES,
      fetchImpl,
    }).then(
      () => {
        throw new Error("expected chatCompletionJson to reject");
      },
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(LlmRequestError);
    const reqErr = err as LlmRequestError;
    expect(reqErr.message).toContain("404");
    expect(reqErr.message).toContain("No endpoints found");
    expect(reqErr.status).toBe(404);
    expect(reqErr.body).toContain("No endpoints found for x/y");
  });

  it("truncates a very long error body in both the message and .body", async () => {
    const longBody = "E".repeat(5000);
    const fetchImpl = errorFetch(longBody, {
      status: 500,
      statusText: "Internal Server Error",
    });

    const err = await chatCompletionJson({
      config: LOCAL_CFG,
      messages: MESSAGES,
      fetchImpl,
    }).then(
      () => {
        throw new Error("expected chatCompletionJson to reject");
      },
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(LlmRequestError);
    const reqErr = err as LlmRequestError;
    // Body is capped near ~500 chars (not the full 5000).
    expect((reqErr.body ?? "").length).toBeLessThanOrEqual(520);
    expect(reqErr.message.length).toBeLessThanOrEqual(620);
    expect(reqErr.status).toBe(500);
  });
});
