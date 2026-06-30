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

import { LIFE_EVENT_CATEGORIES, type RectificationEventInput } from "@almamesh/shared-types";

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

const INTERVIEW_PERSONA = [
  "You are a warm, neutral interviewer helping someone recall DATED life events so an",
  "on-device engine can narrow their birth time. Ask ONE clear question at a time about a",
  "single life milestone (a marriage, a move, a career change, a graduation, a loss, a",
  "surgery, a childbirth, etc.). Acknowledge briefly and kindly, then ask the next.",
  'When a date is vague, gently nudge for more precision ("Do you remember the year, even',
  'roughly?") but NEVER pressure — "around then" is fine. Keep replies short and human.',
  "When you have ~3 dateable events, tell the user that is enough and invite them to review.",
  "The valid event categories are: " + LIFE_EVENT_CATEGORIES.join(", ") + ".",
  "NEVER suggest, predict, hint at, confirm, or rule out any birth time, rising sign, or",
  "Ascendant — that is the engine's job alone, and your guesses would be harmful.",
  "",
  RECTIFICATION_FENCE,
].join("\n");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the chat messages for one interview turn.
 *
 * Returns `[system (interview persona), ...history]` — the same shape
 * `routeChatCompletion` expects. The persona system prompt embeds
 * `RECTIFICATION_FENCE` verbatim and lists all 16 event categories.
 */
export function buildInterviewMessages(
  history: readonly ChatTurn[],
  language: PromptLanguage = "en",
): ChatMessage[] {
  return [
    { role: "system", content: withLanguage(INTERVIEW_PERSONA, language) },
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
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}): AsyncGenerator<string> {
  const messages = buildInterviewMessages(params.history, params.language ?? "en");
  yield* routeChatCompletion({
    config: params.config,
    messages,
    ...(params.signal ? { signal: params.signal } : {}),
    ...(params.fetchImpl ? { fetchImpl: params.fetchImpl } : {}),
  });
}

/**
 * Extract typed life events from a single user turn.
 *
 * Thin wrapper over `structureLifeEvents`. Returns `[]` on any failure
 * (network error, parse failure, or `status:'error'`) — never throws.
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
): Promise<RectificationEventInput[]> {
  try {
    const res = await structureLifeEvents(userText, config, language);
    if (res.status !== "ok") {
      return [];
    }
    const summary = userText.trim();
    return summary ? res.events.map((e) => ({ ...e, summary })) : res.events;
  } catch {
    return [];
  }
}
