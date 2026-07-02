// Shared types for the fence-violation benchmark harness (Spec 063 D4).
//
// This is a MANUAL bun CLI tool, never CI. It screens candidate small models
// over any OpenAI-compatible endpoint and scores them on what matters for
// AlmaMesh: truthfulness against the engine (fence violations) and format
// reliability (JSON validity / field-exact extraction).

import type { PromptLanguage } from "../../src/language";
import type { RectificationEventInput } from "@almamesh/shared-types";

// ---------------------------------------------------------------------------
// Fence checking
// ---------------------------------------------------------------------------

export type FenceViolationKind =
  | "lordship"
  | "dasha_date"
  | "dignity"
  | "invented_yoga";

export interface FenceViolation {
  readonly kind: FenceViolationKind;
  /** The narration excerpt that triggered the flag (evidence, truncated). */
  readonly claim: string;
  /** Why it contradicts the engine (human-readable). */
  readonly detail: string;
}

export type DashaLevel = "maha" | "antar" | "pratyantar";

/** One engine-dated period window usable as dasha-date ground truth. */
export interface TruthPeriod {
  readonly lord: string;
  readonly level: DashaLevel;
  readonly start: Date;
  readonly end: Date;
}

/** Mechanical ground truth distilled from one engine chart JSON. */
export interface EngineTruth {
  /** planet (canonical lowercase) -> houses it rules (whole-sign, from lagna). */
  readonly lordships: ReadonlyMap<string, readonly number[]>;
  /** planet -> normalized dignity: "exalted" | "own" | "debilitated" | "neutral". */
  readonly dignities: ReadonlyMap<string, string>;
  /** Every dated dasha window the engine emitted (maha/antar/pratyantar). */
  readonly periods: readonly TruthPeriod[];
  /** Normalized yoga names (name + display_name, lowercased, separators removed). */
  readonly yogaNames: ReadonlySet<string>;
  /** Yoga categories present in the chart (raja, dhana, mahapurusha, ...). */
  readonly yogaCategories: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A synthetic life-event story with its known-correct extraction. */
export interface BenchStory {
  readonly id: string;
  readonly language: PromptLanguage;
  readonly text: string;
  readonly expected: readonly RectificationEventInput[];
}

/** A canned chat question driven through the REAL buildChatMessages prompt. */
export interface ChatQuestion {
  readonly id: string;
  readonly language: PromptLanguage;
  readonly text: string;
}

// ---------------------------------------------------------------------------
// Models / endpoints
// ---------------------------------------------------------------------------

export interface ModelSpec {
  /** Model slug as the endpoint expects it (exact, case-sensitive). */
  readonly slug: string;
  /** OpenAI-compatible base URL, e.g. https://openrouter.ai/api/v1 */
  readonly baseUrl: string;
  /** Env var holding the API key for this endpoint. */
  readonly keyEnv: string;
  /** Free-form note carried into the report (e.g. "upper bound"). */
  readonly note?: string;
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export interface ExtractorScore {
  readonly stories: number;
  /** Stories whose FIRST attempt returned parseable JSON. */
  readonly jsonValidFirstTry: number;
  /** Total bench-level retries consumed across all stories. */
  readonly retries: number;
  readonly expectedTotal: number;
  /** Expected rows matched field-exactly (precision-aware date matching). */
  readonly matched: number;
  /** Returned rows that matched no expected row. */
  readonly spurious: number;
  /** matched / expectedTotal. */
  readonly accuracy: number;
  readonly latenciesMs: readonly number[];
  readonly failures: readonly string[];
}

export interface LanguageTally {
  readonly ok: number;
  readonly total: number;
}

export interface ChatScore {
  readonly questions: number;
  readonly failures: readonly string[];
  readonly completionTokens: number;
  readonly violations: readonly FenceViolation[];
  readonly violationsPer1k: number;
  readonly latenciesMs: readonly number[];
  /** How many responses carried a <think> block (Qwen3 thinking mode). */
  readonly thinkBlocksSeen: number;
  readonly inLanguage: Readonly<Record<"es" | "pt", LanguageTally>>;
}

export interface ModelResult {
  readonly spec: ModelSpec;
  readonly ok: boolean;
  readonly skipped?: string;
  readonly error?: string;
  readonly extractor?: ExtractorScore;
  readonly chat?: ChatScore;
  readonly latencyP50Ms: number | null;
  readonly spendTokensEstimate: number;
  readonly composite: number;
}
