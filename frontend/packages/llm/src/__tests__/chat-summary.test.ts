import { describe, expect, it, vi } from "vitest";

import type { ChatMessage, ChatThreadSummary } from "@almamesh/shared-types";

import {
  CHAT_SUMMARY_POLICY,
  CHAT_SUMMARY_PROMPT_SCHEMA_VERSION,
  ChatSummaryGenerationError,
  chatSummarySourceHash,
  finalizeChatSummary,
  generateChatSummaryDraft,
  planChatSummary,
  summaryMatchesMessages,
} from "../chat-summary";
import { PrivacyViolationError, type ProviderConfig } from "../config";

function message(
  index: number,
  role: "user" | "assistant",
  content = `${role}-${index}`,
): ChatMessage {
  return {
    id: `m${index}`,
    thread_id: "t1",
    role,
    content,
    created_at: new Date(index * 1_000).toISOString(),
  };
}

function turns(count: number, content = "x"): ChatMessage[] {
  return Array.from({ length: count }, (_, index) =>
    message(index, index % 2 === 0 ? "user" : "assistant", content),
  );
}

describe("planChatSummary", () => {
  it("does nothing below both deterministic thresholds", async () => {
    const plan = await planChatSummary({
      threadId: "t1",
      profileId: "p1",
      messages: turns(20, "short"),
    });

    expect(plan).toBeNull();
  });

  it("summarizes only complete pairs and preserves at least the configured tail", async () => {
    const messages = turns(40, "x".repeat(400));
    const plan = await planChatSummary({
      threadId: "t1",
      profileId: "p1",
      messages,
    });

    expect(plan).not.toBeNull();
    expect(plan?.messages_to_summarize.length).toBeGreaterThanOrEqual(
      CHAT_SUMMARY_POLICY.triggerMessages,
    );
    expect(plan?.messages_to_summarize.at(-1)?.role).toBe("assistant");
    expect(messages.length - (plan?.messages_to_summarize.length ?? 0)).toBeGreaterThanOrEqual(
      CHAT_SUMMARY_POLICY.preserveTurns,
    );
    const preserved = messages.slice(plan?.messages_to_summarize.length ?? 0);
    expect(
      preserved.reduce((total, item) => total + Math.ceil(item.content.length / 4), 0),
    ).toBeGreaterThanOrEqual(CHAT_SUMMARY_POLICY.preserveTokens);
  });

  it("does not plan a summary from an incomplete user turn", async () => {
    const messages = turns(40, "x".repeat(400));
    messages.splice(1, 1);

    expect(
      await planChatSummary({
        threadId: "t1",
        profileId: "p1",
        messages,
      }),
    ).toBeNull();
  });

  it("extends valid prior provenance instead of resummarizing covered messages", async () => {
    const firstMessages = turns(40, "x".repeat(400));
    const firstPlan = await planChatSummary({
      threadId: "t1",
      profileId: "p1",
      messages: firstMessages,
    });
    expect(firstPlan).not.toBeNull();
    if (firstPlan === null) return;
    const previous = await finalizeChatSummary({
      plan: firstPlan,
      currentMessages: firstMessages,
      draft: {
        items: [{ text: "Prior fact", source_message_ids: [firstPlan.source_message_ids[0]] }],
        open_questions: [],
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
      generator: { kind: "llm", prompt_schema_version: 1 },
    });
    expect(previous).not.toBeNull();
    if (previous === null) return;
    const laterMessages = turns(40, "y".repeat(400)).map((item, index) => ({
      ...item,
      id: `later-${index}`,
      created_at: new Date((index + 100) * 1_000).toISOString(),
    }));
    const nextPlan = await planChatSummary({
      threadId: "t1",
      profileId: "p1",
      messages: [...firstMessages, ...laterMessages],
      previousSummary: previous,
    });

    expect(nextPlan?.source_message_ids.slice(0, previous.source_message_ids.length)).toEqual(
      previous.source_message_ids,
    );
    expect(nextPlan?.messages_to_summarize[0].id).toBe(
      firstMessages[previous.source_message_ids.length].id,
    );
  });

  it("emits deterministic bounded incremental batches", async () => {
    const messages = turns(100, "x".repeat(400));
    const plan = await planChatSummary({ threadId: "t1", profileId: "p1", messages });

    expect(plan).not.toBeNull();
    expect(plan?.messages_to_summarize).toHaveLength(CHAT_SUMMARY_POLICY.maxBatchMessages);
    expect(
      plan?.messages_to_summarize.reduce((sum, item) => sum + item.content.length, 0),
    ).toBeLessThanOrEqual(CHAT_SUMMARY_POLICY.maxBatchChars);
    expect(plan?.messages_to_summarize.at(-1)?.role).toBe("assistant");
  });

  it("fails closed instead of sending an oversized individual turn", async () => {
    const messages = turns(30, "short");
    messages[0] = message(0, "user", "x".repeat(CHAT_SUMMARY_POLICY.maxMessageChars + 1));

    await expect(
      planChatSummary({ threadId: "t1", profileId: "p1", messages }),
    ).resolves.toBeNull();
  });
});

describe("chat summary provenance", () => {
  it("creates a SHA-256 hash that changes with source content", async () => {
    const first = turns(2, "original");
    const changed = [{ ...first[0], content: "changed" }, first[1]];

    expect(await chatSummarySourceHash(first)).toMatch(/^[a-f0-9]{64}$/u);
    expect(await chatSummarySourceHash(first)).not.toBe(await chatSummarySourceHash(changed));
  });

  it("finalizes a typed summary only when every item cites source messages", async () => {
    const messages = turns(40, "x".repeat(400));
    const plan = await planChatSummary({
      threadId: "t1",
      profileId: "p1",
      messages,
    });
    expect(plan).not.toBeNull();
    if (plan === null) return;

    const summary = await finalizeChatSummary({
      plan,
      currentMessages: messages,
      draft: {
        items: [
          {
            text: "The user asked a grounded question.",
            source_message_ids: [plan.source_message_ids[0]],
          },
        ],
        open_questions: [],
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
      generator: { kind: "llm", model: "test-model", prompt_schema_version: 1 },
    });

    expect(summary).toMatchObject({
      thread_id: "t1",
      profile_id: "p1",
      source_hash: plan.source_hash,
      source_message_count: plan.source_message_ids.length,
      through_message_id: plan.source_message_ids.at(-1),
      generator: { kind: "llm", model: "test-model", prompt_schema_version: 1 },
    });
  });

  it("rejects stale source content and malformed drafts as a no-op", async () => {
    const messages = turns(40, "x".repeat(400));
    const plan = await planChatSummary({
      threadId: "t1",
      profileId: "p1",
      messages,
    });
    expect(plan).not.toBeNull();
    if (plan === null) return;

    const stale = messages.map((item, index) =>
      index === 0 ? { ...item, content: "mutated after planning" } : item,
    );
    const base = {
      plan,
      generatedAt: "2026-01-01T00:00:00.000Z",
      generator: { kind: "llm" as const, prompt_schema_version: 1 },
    };
    expect(
      await finalizeChatSummary({
        ...base,
        currentMessages: stale,
        draft: {
          items: [{ text: "Fact", source_message_ids: [plan.source_message_ids[0]] }],
          open_questions: [],
        },
      }),
    ).toBeNull();
    expect(
      await finalizeChatSummary({
        ...base,
        currentMessages: messages,
        draft: {
          items: [{ text: "Fact", source_message_ids: ["not-in-the-plan"] }],
          open_questions: [],
        },
      }),
    ).toBeNull();
  });

  it("detects stale durable summaries without throwing", async () => {
    const messages = turns(2, "same");
    const sourceHash = await chatSummarySourceHash(messages);
    const summary: ChatThreadSummary = {
      thread_id: "t1",
      profile_id: "p1",
      items: [{ text: "Fact", source_message_ids: ["m0"] }],
      open_questions: [],
      source_message_ids: ["m0", "m1"],
      source_hash: sourceHash,
      source_message_count: 2,
      through_message_id: "m1",
      generated_at: "2026-01-01T00:00:00.000Z",
      generator: { kind: "llm", prompt_schema_version: 1 },
    };

    expect(await summaryMatchesMessages(summary, messages)).toBe(true);
    expect(
      await summaryMatchesMessages(summary, [{ ...messages[0], content: "changed" }, messages[1]]),
    ).toBe(false);
  });

  it("rejects malformed content, citations, profile metadata, and generator metadata", async () => {
    const messages = turns(2, "same");
    const sourceHash = await chatSummarySourceHash(messages);
    const valid: ChatThreadSummary = {
      thread_id: "t1",
      profile_id: "p1",
      items: [{ text: "Fact", source_message_ids: ["m0"] }],
      open_questions: [],
      source_message_ids: ["m0", "m1"],
      source_hash: sourceHash,
      source_message_count: 2,
      through_message_id: "m1",
      generated_at: "2026-01-01T00:00:00.000Z",
      generator: { kind: "llm", prompt_schema_version: CHAT_SUMMARY_PROMPT_SCHEMA_VERSION },
    };

    const invalid = [
      { ...valid, profile_id: "" },
      { ...valid, items: [{ text: "", source_message_ids: ["m0"] }] },
      { ...valid, items: [{ text: "Fact", source_message_ids: ["outside"] }] },
      { ...valid, open_questions: ["x".repeat(CHAT_SUMMARY_POLICY.maxOpenQuestionChars + 1)] },
      { ...valid, generator: { kind: "llm" as const, prompt_schema_version: 999 } },
      { ...valid, generated_at: "not-a-date" },
      { ...valid, unexpected: "persisted schema drift" },
      { ...valid, items: [{ ...valid.items[0], unexpected: true }] },
    ];
    for (const summary of invalid) {
      await expect(summaryMatchesMessages(summary, messages)).resolves.toBe(false);
    }
  });
});

const LOCAL_CONFIG: ProviderConfig = {
  engine: "openai-http",
  model: "summary-model",
  privacyMode: "local_only",
  baseUrl: "http://localhost:11434/v1",
};

async function summaryPlan() {
  const messages = turns(40, "x".repeat(400));
  const plan = await planChatSummary({ threadId: "t1", profileId: "p1", messages });
  if (plan === null) throw new Error("expected a summary plan");
  return { messages, plan };
}

function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("generateChatSummaryDraft", () => {
  it("uses the existing JSON completion shape and labels transcript as untrusted data", async () => {
    const { plan } = await summaryPlan();
    const response = {
      items: [{ text: "Grounded fact", source_message_ids: ["s1"] }],
      open_questions: ["What comes next?"],
    };
    const fetchImpl = vi.fn(async () => completion(JSON.stringify(response)));

    await expect(
      generateChatSummaryDraft({
        plan,
        config: LOCAL_CONFIG,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({
      items: [{ text: "Grounded fact", source_message_ids: [plan.source_message_ids[0]] }],
      open_questions: response.open_questions,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const body = JSON.parse(String(init?.body)) as {
      stream: boolean;
      response_format: unknown;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.stream).toBe(false);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toMatch(/untrusted data/i);
    expect(body.messages[0].content).toMatch(/strict JSON/i);
    const payload = JSON.parse(body.messages[1].content) as {
      transcript: Array<{ id: string; role: string; content: string }>;
      allowed_source_message_ids: string[];
    };
    expect(payload.transcript).toEqual(
      plan.messages_to_summarize.map(({ role, content }, index) => ({
        id: `s${index + 1}`,
        role,
        content,
      })),
    );
    expect(payload.allowed_source_message_ids).toEqual(
      plan.source_message_ids.map((_, index) => `s${index + 1}`),
    );
  });

  it("never sends durable message UUIDs and translates ordinal citations locally", async () => {
    const durablePrefix = "123e4567-e89b-12d3-a456-426614174";
    const messages = turns(40, "x".repeat(400)).map((item, index) => ({
      ...item,
      id: `${durablePrefix}${String(index).padStart(3, "0")}`,
    }));
    const plan = await planChatSummary({ threadId: "t1", profileId: "p1", messages });
    if (plan === null) throw new Error("expected plan");
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain(durablePrefix);
      return completion(
        JSON.stringify({
          items: [{ text: "Grounded", source_message_ids: ["s1", "s2"] }],
          open_questions: [],
        }),
      );
    });

    await expect(
      generateChatSummaryDraft({
        plan,
        config: LOCAL_CONFIG,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({
      items: [{ text: "Grounded", source_message_ids: plan.source_message_ids.slice(0, 2) }],
      open_questions: [],
    });
  });

  it("fails privacy closed before fetch for a cloud URL under local_only", async () => {
    const { plan } = await summaryPlan();
    const fetchImpl = vi.fn(async () => completion("{}"));

    await expect(
      generateChatSummaryDraft({
        plan,
        config: { ...LOCAL_CONFIG, baseUrl: "https://openrouter.ai/api/v1" },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(PrivacyViolationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed before fetch when the aggregate request exceeds its hard cap", async () => {
    const sourceIds = Array.from(
      { length: CHAT_SUMMARY_POLICY.maxSourceMessages },
      (_, index) => `durable-${index}`,
    );
    const oversizedPlan = {
      thread_id: "t1",
      profile_id: "p1",
      messages_to_summarize: [message(0, "user", "bounded")],
      source_message_ids: sourceIds,
      source_hash: "0".repeat(64),
      previous_summary: {
        thread_id: "t1",
        profile_id: "p1",
        items: Array.from({ length: CHAT_SUMMARY_POLICY.maxItems }, () => ({
          text: "x".repeat(CHAT_SUMMARY_POLICY.maxItemChars),
          source_message_ids: sourceIds.slice(0, CHAT_SUMMARY_POLICY.maxCitationsPerItem),
        })),
        open_questions: Array.from(
          { length: CHAT_SUMMARY_POLICY.maxOpenQuestions },
          () => "q".repeat(CHAT_SUMMARY_POLICY.maxOpenQuestionChars),
        ),
        source_message_ids: sourceIds,
        source_hash: "0".repeat(64),
        source_message_count: sourceIds.length,
        through_message_id: sourceIds.at(-1) as string,
        generated_at: "2026-01-01T00:00:00.000Z",
        generator: { kind: "llm" as const, prompt_schema_version: 1 },
      },
    };
    oversizedPlan.messages_to_summarize[0] = {
      ...oversizedPlan.messages_to_summarize[0],
      id: sourceIds[0],
    };
    const fetchImpl = vi.fn(async () => completion("{}"));

    const error = await generateChatSummaryDraft({
      plan: oversizedPlan,
      config: LOCAL_CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "invalid_plan" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws a typed failure for malformed JSON and invalid citation IDs", async () => {
    const { plan } = await summaryPlan();
    const malformed = vi.fn(async () => completion("not json"));
    const malformedError = await generateChatSummaryDraft({
      plan,
      config: LOCAL_CONFIG,
      fetchImpl: malformed as unknown as typeof fetch,
    }).catch((error: unknown) => error);
    expect(malformedError).toBeInstanceOf(ChatSummaryGenerationError);
    expect(malformedError).toMatchObject({ code: "malformed_json" });

    const badCitation = vi.fn(async () =>
      completion(
        JSON.stringify({
          items: [{ text: "Invented", source_message_ids: ["s999"] }],
          open_questions: [],
        }),
      ),
    );
    const citationError = await generateChatSummaryDraft({
      plan,
      config: LOCAL_CONFIG,
      fetchImpl: badCitation as unknown as typeof fetch,
    }).catch((error: unknown) => error);
    expect(citationError).toBeInstanceOf(ChatSummaryGenerationError);
    expect(citationError).toMatchObject({ code: "invalid_citation" });
  });

  it("supplies the previous grounded summary for incremental consolidation", async () => {
    const { messages, plan: firstPlan } = await summaryPlan();
    const previous = await finalizeChatSummary({
      plan: firstPlan,
      currentMessages: messages,
      draft: {
        items: [
          { text: "Prior grounded fact", source_message_ids: [firstPlan.source_message_ids[0]] },
        ],
        open_questions: ["Prior open question"],
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
      generator: { kind: "llm", prompt_schema_version: 1 },
    });
    if (previous === null) throw new Error("expected previous summary");
    const later = turns(40, "y".repeat(400)).map((item, index) => ({
      ...item,
      id: `later-${index}`,
      created_at: new Date((index + 100) * 1_000).toISOString(),
    }));
    const nextPlan = await planChatSummary({
      threadId: "t1",
      profileId: "p1",
      messages: [...messages, ...later],
      previousSummary: previous,
    });
    if (nextPlan === null) throw new Error("expected incremental plan");
    const fetchImpl = vi.fn(async () =>
      completion(
        JSON.stringify({
          items: [{ text: "Updated", source_message_ids: ["s1"] }],
          open_questions: [],
        }),
      ),
    );

    await generateChatSummaryDraft({
      plan: nextPlan,
      config: LOCAL_CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    const payload = JSON.parse(body.messages[1].content) as {
      previous_summary: unknown;
    };
    expect(payload.previous_summary).toEqual({
      items: previous.items.map((item) => ({
        text: item.text,
        source_message_ids: item.source_message_ids.map(
          (id) => `s${nextPlan.source_message_ids.indexOf(id) + 1}`,
        ),
      })),
      open_questions: previous.open_questions,
    });
  });
});
