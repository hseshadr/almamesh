// TDD: structure-life-events — RED first, then GREEN after implementation.
//
// All network calls are eliminated: `chatCompletionJson` is mocked at the
// module level so no fetch happens, and only the parsed/validated rows reach
// the assertion layer.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LIFE_EVENT_CATEGORIES } from "@almamesh/shared-types";

import { chatCompletionJson } from "./client";
import type { ProviderConfig } from "./config";
import { RECTIFICATION_FENCE } from "./prompt";
import { structureLifeEvents } from "./structure-life-events";

vi.mock("./client", () => ({
  chatCompletionJson: vi.fn(),
}));

const mockChat = vi.mocked(chatCompletionJson);

const LOCAL_CFG: ProviderConfig = {
  baseUrl: "http://localhost:11434/v1",
  model: "test-model",
  engine: "openai-http",
  privacyMode: "local_only",
};

/** Return the system-message content from the last chatCompletionJson call. */
function lastSystemPrompt(): string {
  const calls = mockChat.mock.calls;
  if (calls.length === 0) throw new Error("chatCompletionJson was never called");
  const messages = calls[calls.length - 1][0].messages;
  const sys = messages.find((m) => m.role === "system");
  return sys?.content ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Happy path
// =============================================================================

describe("structureLifeEvents — happy path", () => {
  it("returns typed events for a valid two-event response", async () => {
    mockChat.mockResolvedValue(
      JSON.stringify({
        events: [
          { date: "2015-03-10", category: "marriage" },
          { date: "2018-07-22", category: "childbirth" },
        ],
      }),
    );
    const result = await structureLifeEvents(
      "Got married in March 2015 and had a child in July 2018.",
      LOCAL_CFG,
    );
    expect(result).toEqual([
      { date: "2015-03-10", category: "marriage" },
      { date: "2018-07-22", category: "childbirth" },
    ]);
  });

  it("accepts all 16 valid categories without dropping any", async () => {
    const events = LIFE_EVENT_CATEGORIES.map((cat, i) => ({
      date: `2020-${String((i % 12) + 1).padStart(2, "0")}-01`,
      category: cat,
    }));
    mockChat.mockResolvedValue(JSON.stringify({ events }));
    const result = await structureLifeEvents("...", LOCAL_CFG);
    expect(result).toHaveLength(LIFE_EVENT_CATEGORIES.length);
    expect(result.map((r) => r.category)).toEqual(LIFE_EVENT_CATEGORIES);
  });

  it("returns [] for an empty events array", async () => {
    mockChat.mockResolvedValue(JSON.stringify({ events: [] }));
    const result = await structureLifeEvents("nothing to extract", LOCAL_CFG);
    expect(result).toEqual([]);
  });
});

// =============================================================================
// Validation / filtering — bad rows dropped, not thrown
// =============================================================================

describe("structureLifeEvents — validation and filtering", () => {
  it("drops an item with an invalid category (e.g. 'divorce')", async () => {
    mockChat.mockResolvedValue(
      JSON.stringify({
        events: [
          { date: "2015-03-10", category: "divorce" },
          { date: "2018-07-22", category: "marriage" },
        ],
      }),
    );
    const result = await structureLifeEvents("...", LOCAL_CFG);
    expect(result).toEqual([{ date: "2018-07-22", category: "marriage" }]);
  });

  it("drops an item with a year-only date like '2020'", async () => {
    mockChat.mockResolvedValue(
      JSON.stringify({
        events: [
          { date: "2020", category: "marriage" },
          { date: "2021-05-15", category: "promotion" },
        ],
      }),
    );
    const result = await structureLifeEvents("...", LOCAL_CFG);
    expect(result).toEqual([{ date: "2021-05-15", category: "promotion" }]);
  });

  it("drops an item with a natural-language date like 'tomorrow'", async () => {
    mockChat.mockResolvedValue(
      JSON.stringify({ events: [{ date: "tomorrow", category: "marriage" }] }),
    );
    const result = await structureLifeEvents("...", LOCAL_CFG);
    expect(result).toEqual([]);
  });

  it("drops an item with a partial date like '2021-05' (no day)", async () => {
    mockChat.mockResolvedValue(
      JSON.stringify({
        events: [
          { date: "2021-05", category: "job_loss" },
          { date: "2022-03-14", category: "career_change" },
        ],
      }),
    );
    const result = await structureLifeEvents("...", LOCAL_CFG);
    expect(result).toEqual([{ date: "2022-03-14", category: "career_change" }]);
  });

  it("drops an item with an impossible calendar date like '2021-13-45' (month > 12, day > 31)", async () => {
    mockChat.mockResolvedValue(
      JSON.stringify({
        events: [
          { date: "2021-13-45", category: "marriage" },
          { date: "2022-03-14", category: "career_change" },
        ],
      }),
    );
    const result = await structureLifeEvents("...", LOCAL_CFG);
    // The impossible date must be dropped, only the valid one remains
    expect(result).toEqual([{ date: "2022-03-14", category: "career_change" }]);
  });

  it("drops items that are not objects", async () => {
    mockChat.mockResolvedValue(
      JSON.stringify({ events: [null, 42, "string", { date: "2022-01-01", category: "surgery" }] }),
    );
    const result = await structureLifeEvents("...", LOCAL_CFG);
    expect(result).toEqual([{ date: "2022-01-01", category: "surgery" }]);
  });

  it("strips extra PII fields like name, place, notes — only date and category survive", async () => {
    mockChat.mockResolvedValue(
      JSON.stringify({
        events: [
          {
            date: "2020-01-01",
            category: "marriage",
            name: "John Smith",
            place: "Paris",
            notes: "secret details",
          },
        ],
      }),
    );
    const result = await structureLifeEvents("...", LOCAL_CFG);
    // Only date and category must exist; no PII fields
    expect(result).toHaveLength(1);
    expect(Object.keys(result[0])).toEqual(["date", "category"]);
    expect(result[0]).toEqual({ date: "2020-01-01", category: "marriage" });
  });
});

// =============================================================================
// Safe-default / never-throw contract
// =============================================================================

describe("structureLifeEvents — safe-default (never throws)", () => {
  it("returns [] for malformed JSON — no throw", async () => {
    mockChat.mockResolvedValue("not json at all {{{");
    await expect(structureLifeEvents("...", LOCAL_CFG)).resolves.toEqual([]);
  });

  it("returns [] when top-level JSON is not an object — no throw", async () => {
    mockChat.mockResolvedValue(JSON.stringify([1, 2, 3]));
    await expect(structureLifeEvents("...", LOCAL_CFG)).resolves.toEqual([]);
  });

  it("returns [] when .events is missing — no throw", async () => {
    mockChat.mockResolvedValue(JSON.stringify({ other: "field" }));
    await expect(structureLifeEvents("...", LOCAL_CFG)).resolves.toEqual([]);
  });

  it("returns [] when .events is not an array (e.g. string or number) — no throw", async () => {
    mockChat.mockResolvedValue(JSON.stringify({ events: "not-an-array" }));
    await expect(structureLifeEvents("...", LOCAL_CFG)).resolves.toEqual([]);
  });

  it("returns [] when .events is a number instead of array — no throw", async () => {
    mockChat.mockResolvedValue(JSON.stringify({ events: 42 }));
    await expect(structureLifeEvents("...", LOCAL_CFG)).resolves.toEqual([]);
  });

  it("returns [] when the LLM call itself rejects — no throw", async () => {
    mockChat.mockRejectedValue(new Error("network error"));
    await expect(structureLifeEvents("...", LOCAL_CFG)).resolves.toEqual([]);
  });
});

// =============================================================================
// System prompt content assertions (fence + language)
// =============================================================================

describe("structureLifeEvents — system prompt content", () => {
  beforeEach(() => {
    mockChat.mockResolvedValue(JSON.stringify({ events: [] }));
  });

  it("system prompt contains the full RECTIFICATION_FENCE text", async () => {
    await structureLifeEvents("...", LOCAL_CFG);
    expect(lastSystemPrompt()).toContain(RECTIFICATION_FENCE);
  });

  it("system prompt carries the 'structure only, never compute' instruction", async () => {
    await structureLifeEvents("...", LOCAL_CFG);
    const prompt = lastSystemPrompt();
    // Must say it's a structurer, not an astrologer
    expect(prompt).toMatch(/structure/i);
    // Must explicitly prohibit computing astrology
    expect(prompt).toMatch(/do not compute|never compute|do NOT compute/i);
  });

  it("threads the Spanish language instruction for language='es'", async () => {
    await structureLifeEvents("...", LOCAL_CFG, "es");
    expect(lastSystemPrompt()).toContain("Write your entire response in Spanish");
  });

  it("threads the Portuguese language instruction for language='pt'", async () => {
    await structureLifeEvents("...", LOCAL_CFG, "pt");
    expect(lastSystemPrompt()).toContain("Write your entire response in Portuguese");
  });

  it("no language instruction appended for the default 'en' language", async () => {
    await structureLifeEvents("...", LOCAL_CFG, "en");
    expect(lastSystemPrompt()).not.toContain("Write your entire response");
  });

  it("passes the raw user text as the user message", async () => {
    const inputText = "I got married in June 2010.";
    await structureLifeEvents(inputText, LOCAL_CFG);
    const calls = mockChat.mock.calls;
    const messages = calls[calls.length - 1][0].messages;
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe(inputText);
  });
});
