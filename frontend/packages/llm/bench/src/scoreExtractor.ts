// Extractor task: drive the REAL `structureLifeEvents` (production prompt +
// production validation, imported from src) against synthetic stories and
// score field-exact accuracy, JSON validity, and retry count.

import type { RectificationEventInput } from "@almamesh/shared-types";

import type { ProviderConfig } from "../../src/config";
import { structureLifeEvents } from "../../src/structure-life-events";

import type { FetchLike } from "./openaiClient";
import { recordingFetch, withGlobalFetch, type RecordedExchange } from "./recordingFetch";
import type { BenchStory, ExtractorScore } from "./types";

/**
 * Precision-aware field-exact match. Category and precision must be exact;
 * the date granularity follows the expected row's precision:
 *   exact -> full YYYY-MM-DD, month -> YYYY-MM, year -> YYYY, approx -> date-free.
 */
export function eventMatches(
  expected: RectificationEventInput,
  actual: RectificationEventInput,
): boolean {
  if (expected.category !== actual.category) return false;
  if ((expected.precision ?? "exact") !== (actual.precision ?? "exact")) return false;
  switch (expected.precision ?? "exact") {
    case "exact":
      return expected.date === actual.date;
    case "month":
      return expected.date.slice(0, 7) === actual.date.slice(0, 7);
    case "year":
      return expected.date.slice(0, 4) === actual.date.slice(0, 4);
    case "approx":
      return true;
  }
}

/** Greedy 1:1 matching; returns [matched, spurious]. */
export function matchEvents(
  expected: readonly RectificationEventInput[],
  actual: readonly RectificationEventInput[],
): { matched: number; spurious: number } {
  const used = new Set<number>();
  let matched = 0;
  for (const exp of expected) {
    const idx = actual.findIndex((act, i) => !used.has(i) && eventMatches(exp, act));
    if (idx !== -1) {
      used.add(idx);
      matched += 1;
    }
  }
  return { matched, spurious: actual.length - used.size };
}

function isParseableJson(content: string | null): boolean {
  if (content === null) return false;
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(content.trim());
  const raw = fenced ? fenced[1] : content;
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

export interface ScoreExtractorOptions {
  readonly config: ProviderConfig;
  readonly stories: readonly BenchStory[];
  readonly fetchBase: FetchLike;
  /** Bench-level retries per story when structureLifeEvents reports 'error'. */
  readonly maxRetries?: number;
  readonly onSpendTokens?: (tokens: number) => void;
}

export async function scoreExtractor(options: ScoreExtractorOptions): Promise<ExtractorScore> {
  const maxRetries = options.maxRetries ?? 1;
  let jsonValidFirstTry = 0;
  let retries = 0;
  let expectedTotal = 0;
  let matched = 0;
  let spurious = 0;
  const latenciesMs: number[] = [];
  const failures: string[] = [];

  for (const story of options.stories) {
    expectedTotal += story.expected.length;
    let scored = false;
    for (let attempt = 0; attempt <= maxRetries && !scored; attempt++) {
      const records: RecordedExchange[] = [];
      // structureLifeEvents talks to globalThis.fetch — swap in the recorder
      // (mutex-guarded; see recordingFetch.ts) so raw validity is observable.
      const result = await withGlobalFetch(
        recordingFetch(options.fetchBase, records),
        () => structureLifeEvents(story.text, options.config, story.language),
      );
      const record = records[records.length - 1];
      if (record) {
        latenciesMs.push(record.ms);
        options.onSpendTokens?.(Math.ceil((record.content?.length ?? 0) / 4));
      }
      if (attempt === 0 && isParseableJson(record?.content ?? null)) {
        jsonValidFirstTry += 1;
      }
      if (result.status === "ok") {
        const tally = matchEvents(story.expected, result.events);
        matched += tally.matched;
        spurious += tally.spurious;
        scored = true;
      } else if (attempt < maxRetries) {
        retries += 1;
      } else {
        const status = record?.status ?? "network";
        // A short content excerpt makes systematic format failures diagnosable
        // (e.g. a provider ignoring response_format). Stories are synthetic,
        // so the excerpt can never carry PII.
        const sample = record?.content ? ` — content starts: ${JSON.stringify(record.content.slice(0, 80))}` : "";
        failures.push(
          `${story.id}: extraction failed after ${maxRetries + 1} attempts (last status: ${status})${sample}`,
        );
      }
    }
  }

  return {
    stories: options.stories.length,
    jsonValidFirstTry,
    retries,
    expectedTotal,
    matched,
    spurious,
    accuracy: expectedTotal === 0 ? 0 : matched / expectedTotal,
    latenciesMs,
    failures,
  };
}
