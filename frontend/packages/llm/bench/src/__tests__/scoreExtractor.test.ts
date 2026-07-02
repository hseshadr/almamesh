// Extractor scoring against a mocked endpoint. The REAL structureLifeEvents
// (production prompt + validation) runs; only the transport is stubbed.

import { describe, expect, it } from "vitest";

import type { ProviderConfig } from "../../../src/config";

import type { FetchLike } from "../openaiClient";
import { eventMatches, matchEvents, scoreExtractor } from "../scoreExtractor";
import type { BenchStory } from "../types";

const CONFIG: ProviderConfig = {
  engine: "openai-http",
  model: "test-model",
  privacyMode: "cloud_premium",
  baseUrl: "https://bench.invalid/v1",
};

function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchReturning(...contents: string[]): FetchLike {
  let call = 0;
  return (async () => okResponse(contents[Math.min(call++, contents.length - 1)])) as unknown as FetchLike;
}

const STORY: BenchStory = {
  id: "t-1",
  language: "en",
  text: "I got married on 12 June 2014 and moved cities around 2010.",
  expected: [
    { date: "2014-06-12", category: "marriage", precision: "exact" },
    { date: "2010-01-01", category: "relocation", precision: "year" },
  ],
};

describe("eventMatches (precision-aware)", () => {
  it("exact requires the full date", () => {
    expect(
      eventMatches(
        { date: "2014-06-12", category: "marriage", precision: "exact" },
        { date: "2014-06-12", category: "marriage", precision: "exact" },
      ),
    ).toBe(true);
    expect(
      eventMatches(
        { date: "2014-06-12", category: "marriage", precision: "exact" },
        { date: "2014-06-13", category: "marriage", precision: "exact" },
      ),
    ).toBe(false);
  });

  it("month matches on YYYY-MM; year on YYYY; approx is date-free", () => {
    expect(
      eventMatches(
        { date: "2020-03-01", category: "job_loss", precision: "month" },
        { date: "2020-03-15", category: "job_loss", precision: "month" },
      ),
    ).toBe(true);
    expect(
      eventMatches(
        { date: "2010-01-01", category: "relocation", precision: "year" },
        { date: "2010-06-15", category: "relocation", precision: "year" },
      ),
    ).toBe(true);
    expect(
      eventMatches(
        { date: "2000-01-01", category: "relocation", precision: "approx" },
        { date: "1999-12-31", category: "relocation", precision: "approx" },
      ),
    ).toBe(true);
  });

  it("category and precision must be exact", () => {
    expect(
      eventMatches(
        { date: "2010-01-01", category: "relocation", precision: "year" },
        { date: "2010-01-01", category: "relocation", precision: "exact" },
      ),
    ).toBe(false);
    expect(
      eventMatches(
        { date: "2010-01-01", category: "relocation", precision: "year" },
        { date: "2010-01-01", category: "career_change", precision: "year" },
      ),
    ).toBe(false);
  });
});

describe("matchEvents", () => {
  it("greedy 1:1 — counts spurious extras", () => {
    const { matched, spurious } = matchEvents(STORY.expected, [
      { date: "2014-06-12", category: "marriage", precision: "exact" },
      { date: "2019-01-01", category: "surgery", precision: "exact" },
    ]);
    expect(matched).toBe(1);
    expect(spurious).toBe(1);
  });
});

describe("scoreExtractor", () => {
  it("scores a perfect extraction as 100% with valid JSON, no retries", async () => {
    const payload = JSON.stringify({
      events: [
        { date: "2014-06-12", category: "marriage", precision: "exact" },
        { date: "2010-05-20", category: "relocation", precision: "year" },
      ],
    });
    const score = await scoreExtractor({
      config: CONFIG,
      stories: [STORY],
      fetchBase: fetchReturning(payload),
    });
    expect(score.accuracy).toBe(1);
    expect(score.jsonValidFirstTry).toBe(1);
    expect(score.retries).toBe(0);
    expect(score.spurious).toBe(0);
    expect(score.failures).toEqual([]);
  });

  it("counts an invalid-JSON first attempt and recovers via retry", async () => {
    const good = JSON.stringify({
      events: [{ date: "2014-06-12", category: "marriage", precision: "exact" }],
    });
    const score = await scoreExtractor({
      config: CONFIG,
      stories: [STORY],
      fetchBase: fetchReturning("{ not json", good),
    });
    expect(score.jsonValidFirstTry).toBe(0);
    expect(score.retries).toBe(1);
    expect(score.matched).toBe(1); // marriage recovered; relocation missing
    expect(score.accuracy).toBe(0.5);
  });

  it("records a failure when every attempt errors", async () => {
    const score = await scoreExtractor({
      config: CONFIG,
      stories: [STORY],
      fetchBase: fetchReturning("{ not json", "{ still not json"),
    });
    expect(score.matched).toBe(0);
    expect(score.failures).toHaveLength(1);
    expect(score.failures[0]).toContain("t-1");
  });

  it("enforces the spend cap: stories after exhaustion are skipped, not silently run", async () => {
    const payload = JSON.stringify({
      events: [
        { date: "2014-06-12", category: "marriage", precision: "exact" },
        { date: "2010-05-20", category: "relocation", precision: "year" },
      ],
    });
    let allowance = 1; // budget for exactly one story attempt
    const score = await scoreExtractor({
      config: CONFIG,
      stories: [STORY, { ...STORY, id: "t-2" }],
      fetchBase: fetchReturning(payload),
      trySpendTokens: () => allowance-- > 0,
    });
    expect(score.matched).toBe(2); // only the first story was scored
    expect(score.failures).toEqual(["t-2: skipped (spend cap reached)"]);
  });
});
