// Chat scoring against a mocked endpoint: real prompt build, fence check,
// think-stripping, token accounting, language tallies, spend guard.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { SiderealChart } from "@almamesh/browser/types";

import { buildEngineTruth } from "../engineTruth";
import type { FetchLike } from "../openaiClient";
import { scoreChat } from "../scoreChat";
import type { ChatQuestion } from "../types";

const FIXTURES = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), "fixtures");
const CHART = JSON.parse(
  readFileSync(join(FIXTURES, "chart-tokyo-1990.json"), "utf8"),
) as SiderealChart;
const TRUTH = buildEngineTruth(CHART);
const NOW = new Date("2026-07-02T00:00:00Z");

const QUESTIONS: readonly ChatQuestion[] = [
  { id: "q1", language: "en", text: "What about my career?" },
  { id: "q2-es", language: "es", text: "¿Qué dice mi carta?" },
];

function fetchAnswering(byCall: readonly string[]): FetchLike {
  let call = 0;
  return (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: byCall[Math.min(call, byCall.length - 1)] } }],
        usage: { prompt_tokens: 500, completion_tokens: 100 * ++call },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as unknown as FetchLike;
}

describe("scoreChat", () => {
  it("runs narration through the fence checker and tallies language", async () => {
    const violating =
      "Saturn rules the 3rd house, which is great for your career. You also have the Gaja-Kesari yoga.";
    const spanish =
      "Tu carta es muy estable y tiene un buen momento con el trabajo durante los proximos anos, " +
      "y esta energia puede ayudarte cuando lo necesites.";
    const score = await scoreChat({
      model: "test-model",
      baseUrl: "https://bench.invalid/v1",
      chart: CHART,
      truth: TRUTH,
      questions: QUESTIONS,
      fetchBase: fetchAnswering([violating, spanish]),
      now: NOW,
    });
    expect(score.questions).toBe(2);
    expect(score.violations.map((v) => v.kind).sort()).toEqual(["invented_yoga", "lordship"]);
    expect(score.completionTokens).toBe(300); // 100 + 200 from mocked usage
    expect(score.violationsPer1k).toBeCloseTo((2 / 300) * 1000, 5);
    expect(score.inLanguage.es).toEqual({ ok: 1, total: 1 });
    expect(score.inLanguage.pt).toEqual({ ok: 0, total: 0 });
  });

  it("strips <think> blocks before scoring (Qwen3 handling)", async () => {
    const withThink =
      "<think>saturn rules the 3rd house — should I say that?</think>Your chart shows steady progress ahead.";
    const score = await scoreChat({
      model: "Qwen/Qwen3-1.7B",
      baseUrl: "https://bench.invalid/v1",
      chart: CHART,
      truth: TRUTH,
      questions: [QUESTIONS[0]],
      fetchBase: fetchAnswering([withThink]),
      now: NOW,
    });
    // The violating claim lived INSIDE the think block — must not be scored.
    expect(score.violations).toEqual([]);
    expect(score.thinkBlocksSeen).toBe(1);
  });

  it("skips questions once the spend guard refuses", async () => {
    const score = await scoreChat({
      model: "test-model",
      baseUrl: "https://bench.invalid/v1",
      chart: CHART,
      truth: TRUTH,
      questions: QUESTIONS,
      fetchBase: fetchAnswering(["All steady."]),
      now: NOW,
      trySpendTokens: (() => {
        let calls = 0;
        return () => ++calls === 1; // allow only the first question
      })(),
    });
    expect(score.questions).toBe(1);
    expect(score.failures).toHaveLength(1);
    expect(score.failures[0]).toContain("spend cap");
  });

  it("survives per-question endpoint failures (graceful, no throw)", async () => {
    const failing: FetchLike = (async () =>
      new Response("model not found", { status: 404 })) as unknown as FetchLike;
    const score = await scoreChat({
      model: "test-model",
      baseUrl: "https://bench.invalid/v1",
      chart: CHART,
      truth: TRUTH,
      questions: [QUESTIONS[0]],
      fetchBase: failing,
      now: NOW,
    });
    expect(score.questions).toBe(0);
    expect(score.failures).toHaveLength(1);
    expect(score.failures[0]).toContain("404");
  });
});
