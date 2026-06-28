// LLM helper: structure free-text life events into typed RectificationEventInput rows.
//
// The LLM's sole job here is to EXTRACT and CATEGORIZE events the user described
// in plain prose — it must NEVER compute astrology, rectify birth times, or invent
// dates. The RECTIFICATION_FENCE makes this contract explicit in the system prompt.
//
// Privacy boundary: the output is typed { date, category, precision } only — no
// names, no places, no PII can survive the validation filter even if the model emits them.
//
// Safe-default contract: real failures (network/LLM/JSON-parse) return { status: 'error' };
// a well-formed but empty or filtered response returns { status: 'ok', events: [] }. Never throws.

import { LIFE_EVENT_CATEGORIES, type EventDatePrecision, type LifeEventCategory, type RectificationEventInput } from "@almamesh/shared-types";

import { chatCompletionJson, type ChatCompletionJsonOptions } from "./client";
import type { ProviderConfig } from "./config";
import { withLanguage, type PromptLanguage } from "./language";
import { RECTIFICATION_FENCE } from "./prompt";

// =============================================================================
// System prompt
// =============================================================================

const STRUCTURER_SYSTEM_PROMPT = [
  "You are a text structurer. Your sole task is to read the user's free-text description",
  "of life events and return ONE JSON object with this exact shape:",
  '{ "events": [ { "date": "YYYY-MM-DD", "category": "<category>", "precision": "exact|month|year|approx" } ] }',
  "",
  "The 16 valid categories are (use EXACTLY these strings, no others):",
  LIFE_EVENT_CATEGORIES.join(", "),
  "",
  "Rules:",
  "- Include ONLY events the user explicitly stated with a date you can express as YYYY-MM-DD.",
  "- OMIT any event you cannot date to a full YYYY-MM-DD, or whose category is not in the list.",
  '- Set "precision" to "exact" when the user gave a full date; use "year", "month", or "approx" when they were vague (e.g. "around 2010" → year, "early 2010" → month, "sometime in my 30s" → approx).',
  "- Output ONLY the JSON object — no explanation, no commentary, no markdown fences.",
  "- Do NOT compute astrology, rectify birth times, or interpret any chart.",
  "- Do NOT echo names, places, or any identifying information in your output.",
  "",
  RECTIFICATION_FENCE,
].join("\n");

// =============================================================================
// Validation helpers
// =============================================================================

const YYYY_MM_DD = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidYMD(date: string): boolean {
  const match = YYYY_MM_DD.exec(date);
  if (!match) {
    return false;
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // Validate month and day bounds
  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > 31) {
    return false;
  }

  // Verify it's a real calendar date by constructing a UTC date and round-tripping
  // This catches invalid combinations like Feb 30
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Check that the date didn't overflow (e.g., Feb 30 becomes Mar 2)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isValidCategory(value: unknown): value is LifeEventCategory {
  return typeof value === "string" && (LIFE_EVENT_CATEGORIES as readonly string[]).includes(value);
}

function isValidPrecision(value: unknown): value is EventDatePrecision {
  return value === 'exact' || value === 'month' || value === 'year' || value === 'approx';
}

// =============================================================================
// Public API
// =============================================================================

export type StructureLifeEventsResult =
  | { status: 'ok'; events: RectificationEventInput[] }
  | { status: 'error' };

/**
 * Ask the configured LLM to extract life events from free-form prose and return
 * them as typed `RectificationEventInput` rows.
 *
 * - Each row is validated: only YYYY-MM-DD dates and the 16 known categories survive.
 * - On a real call/parse failure (network error, LLM rejection, malformed JSON) returns
 *   `{ status: 'error' }`. On a genuine empty or filtered response returns
 *   `{ status: 'ok', events: [] }`. Never throws.
 * - The output carries only `{ date, category }` — PII cannot pass through.
 */
export async function structureLifeEvents(
  text: string,
  config: ProviderConfig,
  language: PromptLanguage = "en",
): Promise<StructureLifeEventsResult> {
  const options: ChatCompletionJsonOptions = {
    config,
    messages: [
      { role: "system", content: withLanguage(STRUCTURER_SYSTEM_PROMPT, language) },
      { role: "user", content: text },
    ],
  };

  try {
    const raw = await chatCompletionJson(options);
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { status: 'ok', events: [] };
    }

    const rec = parsed as Record<string, unknown>;
    const events = rec.events;
    if (!Array.isArray(events)) {
      return { status: 'ok', events: [] };
    }

    return {
      status: 'ok',
      events: events.flatMap((item: unknown): RectificationEventInput[] => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        const { date, category, precision } = row;
        if (typeof date !== "string" || !isValidYMD(date)) return [];
        if (!isValidCategory(category)) return [];
        return [{ date, category, precision: isValidPrecision(precision) ? precision : 'exact' }];
      }),
    };
  } catch {
    return { status: 'error' };
  }
}
