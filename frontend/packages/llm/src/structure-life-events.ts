// LLM helper: structure free-text life events into typed RectificationEventInput rows.
//
// The LLM's sole job here is to EXTRACT and CATEGORIZE events the user described
// in plain prose — it must NEVER compute astrology, rectify birth times, or invent
// dates. The RECTIFICATION_FENCE makes this contract explicit in the system prompt.
//
// Privacy boundary: the output is typed { date, category } only — no names, no
// places, no PII can survive the validation filter even if the model emits them.
//
// Safe-default contract: any parse error, network error, or malformed shape
// returns [] and never propagates a throw to the caller (mirrors mesh-reading.ts).

import { LIFE_EVENT_CATEGORIES, type LifeEventCategory, type RectificationEventInput } from "@almamesh/shared-types";

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
  '{ "events": [ { "date": "YYYY-MM-DD", "category": "<category>" } ] }',
  "",
  "The 16 valid categories are (use EXACTLY these strings, no others):",
  LIFE_EVENT_CATEGORIES.join(", "),
  "",
  "Rules:",
  "- Include ONLY events the user explicitly stated with a date you can express as YYYY-MM-DD.",
  "- OMIT any event you cannot date to a full YYYY-MM-DD, or whose category is not in the list.",
  "- Output ONLY the JSON object — no explanation, no commentary, no markdown fences.",
  "- Do NOT compute astrology, rectify birth times, or interpret any chart.",
  "- Do NOT echo names, places, or any identifying information in your output.",
  "",
  RECTIFICATION_FENCE,
].join("\n");

// =============================================================================
// Validation helpers
// =============================================================================

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

function isValidYMD(date: string): boolean {
  return YYYY_MM_DD.test(date);
}

function isValidCategory(value: unknown): value is LifeEventCategory {
  return typeof value === "string" && (LIFE_EVENT_CATEGORIES as readonly string[]).includes(value);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Ask the configured LLM to extract life events from free-form prose and return
 * them as typed `RectificationEventInput` rows.
 *
 * - Each row is validated: only YYYY-MM-DD dates and the 16 known categories survive.
 * - On any error (network, parse, malformed shape) returns `[]` and never throws.
 * - The output carries only `{ date, category }` — PII cannot pass through.
 */
export async function structureLifeEvents(
  text: string,
  config: ProviderConfig,
  language: PromptLanguage = "en",
): Promise<RectificationEventInput[]> {
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
      return [];
    }

    const rec = parsed as Record<string, unknown>;
    const events = rec.events;
    if (!Array.isArray(events)) {
      return [];
    }

    return events.flatMap((item: unknown): RectificationEventInput[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const row = item as Record<string, unknown>;
      const { date, category } = row;
      if (typeof date !== "string" || !isValidYMD(date)) return [];
      if (!isValidCategory(category)) return [];
      return [{ date, category }];
    });
  } catch {
    return [];
  }
}
