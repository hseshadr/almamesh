// rectification-interview.ts
//
// Conversational birth-time-event interview: persona prompt, streaming turn
// function, and per-turn event extractor.
//
// Privacy contract inherited from the transport layer:
//   - `routeChatCompletion` delegates to `streamChatCompletion`, which runs
//     `ensurePrivacy` before every network call (fail-closed gate).
//   - `gatherEventsFromTurn` re-uses `structureLifeEvents`, which emits only
//     `{ date, category }` — no free-form PII crosses the boundary.
//   - This layer adds no network calls of its own and no PII handling.
//
// NO-VERDICT invariant (enforced in the persona prompt):
//   The LLM NEVER suggests, confirms, or rules out any birth time, rising sign,
//   or Ascendant. Birth-time ranking is exclusively the engine's job.

import {
  LIFE_EVENT_CATEGORIES,
  type EventDatePrecision,
  type LifeEventCategory,
  type RectificationEventInput,
} from "@almamesh/shared-types";

import type { ChatTurn } from "./budget";
import type { ChatMessage } from "./client";
import type { ProviderConfig } from "./config";
import { type PromptLanguage, withLanguage } from "./language";
import { RECTIFICATION_FENCE } from "./prompt";
import { routeChatCompletion } from "./route";
import { structureLifeEvents } from "./structure-life-events";

// ---------------------------------------------------------------------------
// Persona prompt
// ---------------------------------------------------------------------------

// Spec 062 (LLM delta 2 preamble): the persona elicits what a rectifier
// actually NEEDS — exactly-dated, high-reliability events across distinct life
// domains — and explains, briefly, WHY exact dates matter. It pushes gently for
// date precision and never leads. The never-suggest clause and the
// RECTIFICATION_FENCE below are byte-identical to the original.
const INTERVIEW_PERSONA = [
  "You are a warm, neutral interviewer helping someone recall DATED life events so an",
  "on-device engine can narrow their birth time. The engine needs EXACTLY-DATED,",
  "high-reliability milestones spread across DISTINCT life domains (a marriage, a legal",
  "matter, a career change, a relocation, a childbirth, a surgery, a loss): different",
  "domains test different parts of the chart, and an exact date lets the engine score",
  "candidate birth times far more sharply than a rough year can.",
  "Ask ONE clear question at a time about a single life milestone. Acknowledge briefly",
  "and kindly, then ask the next.",
  'When a date is vague, gently nudge for more precision ("Do you remember the year, even',
  'roughly?") — you may explain once, in a single short sentence, that a full date',
  'sharpens the result — but NEVER pressure — "around then" is fine.',
  "Never lead: never propose what happened or when; only invite the user to recall.",
  "Keep replies short and human.",
  "When you have ~3 dateable events, tell the user that is enough and invite them to review.",
  "The valid event categories are: " + LIFE_EVENT_CATEGORIES.join(", ") + ".",
  "NEVER suggest, predict, hint at, confirm, or rule out any birth time, rising sign, or",
  "Ascendant — that is the engine's job alone, and your guesses would be harmful.",
  "",
  RECTIFICATION_FENCE,
].join("\n");

// ---------------------------------------------------------------------------
// Interview state block (Spec 062, LLM delta 2)
// ---------------------------------------------------------------------------

/**
 * One gathered event as the interview state block may carry it: date +
 * category + precision ONLY. The type IS the PII boundary — no summary, no
 * note, no free text can ride it (and the renderer below reads only these
 * three fields, so a smuggled extra property never reaches the prompt).
 */
export interface InterviewGatheredEvent {
  readonly date: string;
  readonly category: LifeEventCategory;
  readonly precision: EventDatePrecision;
}

// Categories whose classical house links make them the sharpest Ascendant
// discriminators (dasha-lord↔house-lordship + transit-to-house signals) — the
// domains the interviewer should steer toward when choosing what to ask next.
const ASCENDANT_SENSITIVE_CATEGORIES: readonly LifeEventCategory[] = [
  "marriage",
  "career_change",
  "relocation",
  "childbirth",
  "litigation",
  "surgery",
];

/**
 * Render the PII-safe interview state block: the events gathered so far as
 * `{date, category, precision}` lines, the categories still missing, and the
 * elicitation strategy (exact dates score sharpest; category diversity beats
 * stacked same-category — mirroring the engine's de-correlation cap;
 * Ascendant-sensitive domains preferred).
 */
function buildInterviewStateBlock(gathered: readonly InterviewGatheredEvent[]): string {
  const eventLines =
    gathered.length === 0
      ? ["- none yet"]
      : gathered.map((e) => `- ${e.date} (${e.category}, ${e.precision})`);
  const missing = LIFE_EVENT_CATEGORIES.filter(
    (category) => !gathered.some((e) => e.category === category),
  );
  return [
    "INTERVIEW STATE (device-derived; dates + categories only, no event narrative):",
    "Events gathered so far:",
    ...eventLines,
    `Categories not yet gathered: ${missing.length === 0 ? "none — all covered" : missing.join(", ")}.`,
    "",
    "ELICITATION STRATEGY for your next question:",
    "- Exact dates score sharpest for the engine: when the last date was vague, gently",
    "  ask for the month or day once, then move on.",
    "- Category diversity beats stacked same-category events (the engine de-correlates",
    "  repeats, so a third event in an already-covered category adds little) — steer",
    "  toward a category not yet gathered.",
    "- Prefer the Ascendant-sensitive domains when choosing what to ask about next: " +
      ASCENDANT_SENSITIVE_CATEGORIES.join(", ") +
      ".",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the chat messages for one interview turn.
 *
 * Returns `[system (interview persona), ...history]` — the same shape
 * `routeChatCompletion` expects. The persona system prompt embeds
 * `RECTIFICATION_FENCE` verbatim and lists every event category
 * (`LIFE_EVENT_CATEGORIES`, 17 incl. `family_rupture` — Spec 062 E6).
 *
 * When `state` is provided (Spec 062, LLM delta 2) a PII-safe INTERVIEW STATE
 * block — gathered `{date, category, precision}` rows, categories still
 * missing, and the elicitation strategy — is appended AFTER the persona (and
 * after the fence), leaving both byte-intact. Omitting `state` keeps the
 * legacy prompt byte-identical.
 */
export function buildInterviewMessages(
  history: readonly ChatTurn[],
  language: PromptLanguage = "en",
  state?: readonly InterviewGatheredEvent[],
): ChatMessage[] {
  const system = state
    ? `${INTERVIEW_PERSONA}\n\n${buildInterviewStateBlock(state)}`
    : INTERVIEW_PERSONA;
  return [
    { role: "system", content: withLanguage(system, language) },
    ...history.map((t): ChatMessage => ({ role: t.role, content: t.content })),
  ];
}

/**
 * Stream one interviewer reply given the current conversation history.
 *
 * Delegates directly to `routeChatCompletion` — no chart, no sanitizer.
 * `ensurePrivacy` inside the transport is the fail-closed backstop.
 */
export async function* streamRectificationInterview(params: {
  readonly history: readonly ChatTurn[];
  readonly config: ProviderConfig;
  readonly language?: PromptLanguage;
  /**
   * The events gathered so far as PII-safe `{date, category, precision}` rows
   * (Spec 062, LLM delta 2). When present, the system prompt carries the
   * INTERVIEW STATE block so the interviewer seeks the missing, sharpest
   * discriminators instead of re-asking covered ground.
   */
  readonly state?: readonly InterviewGatheredEvent[];
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): AsyncGenerator<string> {
  const messages = buildInterviewMessages(params.history, params.language ?? "en", params.state);
  yield* routeChatCompletion({
    config: params.config,
    messages,
    ...(params.signal ? { signal: params.signal } : {}),
    ...(params.fetchImpl ? { fetchImpl: params.fetchImpl } : {}),
  });
}

/**
 * Result of extracting events from one user turn: real failures (network,
 * parse, `status:'error'` from the structurer) are DISTINGUISHED from a
 * genuinely event-free turn (`status:'ok'`, `events: []`) so the caller can
 * tell the user their dated milestone may not have counted instead of
 * silently dropping it.
 */
export type GatherEventsResult =
  | { readonly status: "ok"; readonly events: RectificationEventInput[] }
  | { readonly status: "error" };

/**
 * Extract typed life events from a single user turn.
 *
 * Thin wrapper over `structureLifeEvents`. Never throws: any real failure
 * (network error, parse failure, or `status:'error'`) resolves to
 * `{ status: 'error' }`, while a well-formed turn with nothing datable
 * resolves to `{ status: 'ok', events: [] }`.
 *
 * Each extracted event is annotated with a `summary` set to the user's OWN turn
 * text, so the gathered list is human-readable and events with the same
 * date+category stay distinguishable. This adds ZERO new egress: `userText` was
 * already supplied to this function (and already sent to the endpoint by
 * `structureLifeEvents`); we only copy it into the returned rows. The
 * `structureLifeEvents` output itself remains strictly PII-free.
 */
export async function gatherEventsFromTurn(
  userText: string,
  config: ProviderConfig,
  language: PromptLanguage = "en",
): Promise<GatherEventsResult> {
  try {
    const res = await structureLifeEvents(userText, config, language);
    if (res.status !== "ok") {
      return { status: "error" };
    }
    const summary = userText.trim();
    return {
      status: "ok",
      events: summary ? res.events.map((e) => ({ ...e, summary })) : res.events,
    };
  } catch {
    return { status: "error" };
  }
}
