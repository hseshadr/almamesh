import { describe, expect, it } from "vitest";

import { compositeScore, latencyP50, renderReport } from "../report";
import type { ChatScore, ExtractorScore, ModelResult } from "../types";

const EXTRACTOR: ExtractorScore = {
  stories: 7,
  jsonValidFirstTry: 6,
  retries: 1,
  expectedTotal: 24,
  matched: 18,
  spurious: 2,
  accuracy: 0.75,
  latenciesMs: [100, 200, 300],
  failures: [],
};

const CHAT: ChatScore = {
  questions: 11,
  failures: [],
  completionTokens: 2000,
  violations: [
    { kind: "lordship", claim: "saturn rules the 3rd house", detail: "saturn rules [7,8]" },
  ],
  violationsPer1k: 0.5,
  latenciesMs: [400, 500],
  thinkBlocksSeen: 0,
  inLanguage: { es: { ok: 2, total: 2 }, pt: { ok: 1, total: 2 } },
};

function result(slug: string, composite: number, ok = true): ModelResult {
  return {
    spec: { slug, baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" },
    ok,
    ...(ok ? { extractor: EXTRACTOR, chat: CHAT } : { skipped: "env HF_TOKEN not set" }),
    latencyP50Ms: ok ? 300 : null,
    spendTokensEstimate: 5000,
    composite,
  };
}

describe("compositeScore", () => {
  it("weights extraction 0.4, fence 0.4, json 0.1, language 0.1", () => {
    const score = compositeScore({ extractor: EXTRACTOR, chat: CHAT });
    const expected =
      0.75 * 0.4 + (1 - 0.5 / 10) * 0.4 + (6 / 7) * 0.1 + (3 / 4) * 0.1;
    expect(score).toBeCloseTo(expected, 6);
  });

  it("floors the fence term at 0 for hopeless models", () => {
    const score = compositeScore({
      extractor: EXTRACTOR,
      chat: { ...CHAT, violationsPer1k: 50 },
    });
    expect(score).toBeCloseTo(0.75 * 0.4 + 0 + (6 / 7) * 0.1 + (3 / 4) * 0.1, 6);
  });

  it("gives NO fence credit to an empty/failed chat run (zero completion tokens)", () => {
    const silentChat: ChatScore = {
      ...CHAT,
      questions: 0,
      completionTokens: 0,
      violations: [],
      violationsPer1k: 0,
      inLanguage: { es: { ok: 0, total: 0 }, pt: { ok: 0, total: 0 } },
    };
    const score = compositeScore({ extractor: EXTRACTOR, chat: silentChat });
    // Fence + language terms are MISSING, not perfect: only extraction + JSON count.
    expect(score).toBeCloseTo(0.75 * 0.4 + (6 / 7) * 0.1, 6);
    // A silent model must rank BELOW the same model with a real, clean chat run.
    expect(score).toBeLessThan(compositeScore({ extractor: EXTRACTOR, chat: CHAT }));
  });
});

describe("latencyP50", () => {
  it("takes the median across extractor + chat latencies", () => {
    expect(latencyP50({ extractor: EXTRACTOR, chat: CHAT })).toBe(300);
  });
  it("is null with no samples", () => {
    expect(latencyP50({})).toBeNull();
  });
});

describe("renderReport", () => {
  const meta = {
    generatedAt: "2026-07-02T00:00:00Z",
    mode: "suite",
    fixtureIds: ["chart-bengaluru-1988.json"],
    pinnedNow: "2026-07-02T00:00:00.000Z",
    spendCapPerModel: 30000,
  };

  it("ranks ok models by composite, failed models last", () => {
    const report = renderReport(
      [result("b-model", 0.5), result("a-model", 0.9), result("skipped-model", 0, false)],
      meta,
    );
    const aIdx = report.indexOf("a-model");
    const bIdx = report.indexOf("b-model");
    const sIdx = report.indexOf("skipped-model");
    expect(aIdx).toBeGreaterThan(-1);
    expect(aIdx).toBeLessThan(bIdx);
    expect(bIdx).toBeLessThan(sIdx);
    expect(report).toContain("env HF_TOKEN not set");
  });

  it("carries the scoring columns, violation evidence and caveats", () => {
    const report = renderReport([result("a-model", 0.9)], meta);
    expect(report).toContain("| Rank | Model | Endpoint | Extraction acc |");
    expect(report).toContain("75% (18/24, 2 spurious)");
    expect(report).toContain("saturn rules the 3rd house");
    expect(report).toContain("Server quant ≠ browser quant");
    expect(report).toContain("es 2/2, pt 1/2");
  });

  it("marks the fence cell 'no data' for a zero-token chat run instead of a clean score", () => {
    const silent: ModelResult = {
      ...result("silent-model", 0.4),
      chat: {
        ...CHAT,
        questions: 0,
        completionTokens: 0,
        violations: [],
        violationsPer1k: 0,
        inLanguage: { es: { ok: 0, total: 0 }, pt: { ok: 0, total: 0 } },
      },
    };
    const report = renderReport([silent], meta);
    expect(report).toContain("no data");
    expect(report).not.toContain("0.00 (0 in 0 tok)");
  });
});
