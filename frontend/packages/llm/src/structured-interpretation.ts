// Structured six-section Vedic interpretation generator, ported to run entirely
// client-side against any OpenAI-compatible endpoint (no backend).
//
// This is the in-browser port of the predecessor's multi-call orchestrator
// (vedic_core/llm/orchestrator.py) + its Jinja section prompts. It fans out SIX
// independent JSON chat completions in parallel — core, yoga, guidance1,
// guidance2, remedial, upcoming_periods (The Road Ahead) — each requesting
// STRICT JSON matching its slice of the `VedicInterpretation` shared-type, then
// merges them into one interpretation (mirroring `_merge_results`). Any single
// section that fails degrades to its safe default (empty), emitting an `error`
// event, while the whole interpretation still completes — one bad section never
// sinks the reading.
//
// The chart is sanitized via `sanitizeChartForLlm` BEFORE any prompt is built,
// so the privacy boundary cannot be skipped. Every call also runs the fail-closed
// `ensurePrivacy` gate inside `chatCompletionJson`.

import type {
  CareerGuidance,
  EducationGuidance,
  FinanceGuidance,
  HealthGuidance,
  IntegratedYogaNarrative,
  LifeEvolutionGuidance,
  Persona,
  RelationshipGuidance,
  RemedialMeasures,
  SpiritualGuidance,
  TitledPersona,
  VedicInterpretation,
} from "@almamesh/shared-types";
import type { SiderealChart } from "@almamesh/browser/types";

import { chatCompletionJson, type ChatMessage } from "./client";
import { ensurePrivacy, isLocalEndpoint, type ProviderConfig } from "./config";
import { withLanguage, type PromptLanguage } from "./language";
import { buildPredictiveFactsBlock } from "./predictive-facts";
import { OUTPUT_DISCIPLINE_RULES, type ViewMode } from "./prompt";
import { sanitizeChartForLlm, type SanitizedChart } from "./sanitize";

// =============================================================================
// Public API
// =============================================================================

export type InterpretationSectionKey =
  | "core"
  | "yoga"
  | "guidance1"
  | "guidance2"
  | "remedial"
  | "upcoming_periods";

export type InterpretationEvent =
  | { type: "section_start"; section: InterpretationSectionKey }
  | { type: "section_complete"; section: InterpretationSectionKey }
  | { type: "complete"; interpretation: VedicInterpretation }
  | { type: "error"; section?: InterpretationSectionKey; message: string };

export interface StructuredInterpretationParams {
  /** The engine chart (same type `streamChartInterpretation` takes). */
  readonly chart: SiderealChart;
  readonly config: ProviderConfig;
  /** `layman` | `expert`; biases which mode the prompt foregrounds. */
  readonly mode?: ViewMode;
  /** UI/narration language for the reading (`en` default); engine is untouched. */
  readonly language?: PromptLanguage;
  readonly signal?: AbortSignal;
  /** Injectable reference "now" for deterministic dasha relativization. */
  readonly now?: Date;
  /** Injectable for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

const ALL_SECTIONS: readonly InterpretationSectionKey[] = [
  "core",
  "yoga",
  "guidance1",
  "guidance2",
  "remedial",
  "upcoming_periods",
];

// =============================================================================
// System prompt (ported, condensed) — the dual-mode + accuracy mandate
// =============================================================================

// Faithful port of vedic_core .../prompts/system_prompt.md to AlmaMesh's ACTUAL
// data contract (sanitize.ts + chart.ts). Every behavioral rule that protects
// correctness is kept — dual-mode layman/technical separation, the ABSOLUTE
// "only discuss yogas explicitly in the provided yoga list" constraint, privacy,
// anti-generic + anti-repetition discipline, strict-JSON output. The esoteric
// word-count minimums and "REJECTED/regenerate" coercion are dropped (they hurt
// in-browser JSON reliability without improving quality).
//
// CALCULATION-INTEGRITY: the esoteric prompt cited fields AlmaMesh does NOT emit
// (per-planet shadbala_ratio, birth date/age, transits, graha aspects/drishti,
// Neechabhanga, navamsa). Those instructions are REWRITTEN or DROPPED here, never
// copied — the LLM narrates only from fields that actually exist in the chart JSON.
const SYSTEM_PROMPT = [
  "You are a grand master Vedic Astrologer (Sidereal / Lahiri ayanamsa) and a",
  "positive, empowering life guide. You produce STRUCTURED interpretation data.",
  "You NARRATE the chart you are given; you never compute, recalculate, or invent",
  "astrological facts that are not already present in the chart JSON.",
  "",
  "DUAL-MODE OUTPUT (MANDATORY): every persona object has TWO fields with ZERO overlap:",
  '  - "layman": everyday language for someone who has NEVER heard of astrology.',
  "    FORBIDDEN here: planet names (Sun, Moon, Mars, …), house numbers, sign names,",
  "    conjunction, dasha, yoga, nakshatra, zodiac-sign names, Sanskrit terms. Speak",
  "    only of the LIVED THEMES (creativity, security, communication, partnership,",
  "    discipline, growth). Warm, practical, caring — a wise friend over coffee.",
  '  - "technical": for a practicing Jyotish scholar. Cite exact placements from the',
  "    data: degree-within-sign (sign + sign_degrees), nakshatra + nakshatra_pada +",
  "    nakshatra_lord, dignity, retrograde/combust flags, house-lord (dispositor)",
  "    chains, and dasha lord/status/sequence. Use Sanskrit terms with a short gloss.",
  "",
  "STRENGTH-SIGNAL HIERARCHY (this chart provides ONLY these signals — use no others):",
  "  - PER-PLANET strength comes ONLY from these fields: `dignity` (one of exactly four",
  "    values: exalted, own, neutral, debilitated), `is_retrograde`, `is_combust`, the",
  "    houses a graha rules (`houses_ruled`), and `is_yogakaraka`. There is NO numeric",
  "    planet strength (no shadbala field, no shadbala_ratio) — NEVER state a numeric",
  "    or percentage strength for a planet.",
  "  - PER-YOGA strength comes ONLY from each yoga's qualitative `grade` (exactly one",
  "    of strong, moderate, weak — there is NO numeric yoga strength) and its",
  "    `strength_factors[]` (each factor's `value` and `basis` already phrase the 'why'",
  "    in the engine's own words — QUOTE or paraphrase them; never invent numbers).",
  "",
  "DIGNITY VOCABULARY FENCE (ABSOLUTE): the ONLY dignities that exist in this chart are",
  "  exalted, own, neutral, debilitated. NEVER assert moolatrikona, friendly, enemy,",
  "  great-friend, or 'cancelled / Neechabhanga' dignity — that data is NOT provided.",
  "  Use signs, houses, and dignities EXACTLY as given; if a value is absent, say nothing.",
  "  DEBILITY HONESTY: never call a debilitated, retrograde-strained, or combust planet",
  "  simply 'strong' — name the condition and the struggle/delay/effort theme it implies.",
  "",
  "ASPECT HONESTY (ABSOLUTE): this chart contains NO graha-aspect / drishti data. NEVER",
  "  say one planet 'aspects', 'casts a glance on', or 'sees' another. The ONLY relation",
  "  you may assert between two planets is CONJUNCTION — and only when they share the",
  "  same `house` value. State nothing about any other inter-planetary relationship.",
  "",
  "DASHA HONESTY (ABSOLUTE): there is NO birth date, NO age, and NO transit data in",
  "  this chart. NEVER compute ages, 'Saturn returns', or age milestones, and NEVER",
  "  extrapolate a date the data does not state. Timing comes ONLY from the dasha",
  "  fields: the lords and ORDER of the sequence, each period's status, the current",
  "  period's `months_remaining`, and — when present — the engine-dated month windows",
  "  (`start_month`/`end_month`, the current maha's `antar_sequence`, and the",
  "  `pratyantar_sequence`). You MAY cite those dated month windows VERBATIM (e.g.",
  "  'the Venus sub-period, 2023-12 to 2027-01'); a period carrying no dated window",
  "  stays relative ('the current chapter ruled by X', 'an upcoming period of Y').",
  "",
  "YOGA CONSTRAINT (ZERO TOLERANCE — THE MOST IMPORTANT RULE):",
  "  You may ONLY discuss yogas that appear EXPLICITLY in the chart's yoga list.",
  "  If a yoga is not in that list, it DOES NOT EXIST in this chart — never invent,",
  "  fabricate, or name it (e.g. do not mention Gajakesari unless it is listed).",
  "  Achieve depth by analyzing the EXISTING yogas more deeply, never by adding new ones.",
  "",
  "ANTI-GENERIC MANDATE: every claim must be anchored to a NAMED placement from the data",
  "  (a specific planet's sign/house/dignity/nakshatra, a house-lord chain, or a listed",
  "  yoga). A sentence that could appear in any other person's reading must be rewritten",
  "  to cite this chart's specifics. No fortune-cookie generalities.",
  "",
  "ANTI-REPETITION: do not reuse the same yoga, placement, phrase, or metaphor across",
  "  sections — each section foregrounds different planets/houses and fresh vocabulary.",
  "",
  "PRIVACY: never mention city/state/country names. Refer generically to 'birth location'.",
  "",
  OUTPUT_DISCIPLINE_RULES,
  "",
  "OUTPUT: respond with a SINGLE strict JSON object matching the requested schema for",
  "the section. No prose outside the JSON. No markdown fences. Escape quotes in strings.",
].join("\n");

// =============================================================================
// LITE system prompt — for SMALL LOCAL models (gemma3:4b, qwen2.5:3b, …)
// =============================================================================
//
// Small local models drown in the full prompt's heavy analytical mandates
// (unique-angle openings, mandatory dispositor chains, strength-ordering, karaka
// chains) and return empty/placeholder JSON → a blank dashboard. The LITE prompt
// KEEPS every hard correctness guard (zero yoga fabrication, privacy, strict
// single-JSON / no fences, dual-mode layman vs technical, and ALL the honesty
// fences: no graha aspects/drishti, no ages/dates/Saturn-returns, no invented
// shadbala numbers, dignity only exalted/own/neutral/debilitated) but DROPS the
// analytical-depth requirements and asks for SHORT, plain, concrete content.
const SYSTEM_PROMPT_LITE = [
  "You are a kind, encouraging Vedic Astrologer (Sidereal / Lahiri ayanamsa).",
  "You NARRATE the chart JSON you are given. You NEVER compute, recalculate, or",
  "invent any astrological fact that is not already in the chart JSON.",
  "",
  "WRITE SHORT, PLAIN, CONCRETE content. Do not pad. Do not write essays.",
  "",
  "DUAL-MODE (MANDATORY): every persona object has TWO fields, no overlap:",
  '  - "layman": everyday words for someone who has NEVER heard of astrology. NO',
  "    planet names, NO house numbers, NO sign names, NO Sanskrit, NO jargon — speak",
  "    only of lived themes (creativity, security, communication, partnership, growth).",
  '  - "technical": for an astrologer. Name the actual placements from the data',
  "    (planet, sign, house, dignity, nakshatra, dasha lord). One or two specifics is enough.",
  "",
  "HARD FACT FENCES (ABSOLUTE — these protect correctness, never relax them):",
  "  - DIGNITY: the ONLY dignity values are exalted, own, neutral, debilitated. NEVER",
  "    say moolatrikona, friendly, enemy, or 'cancelled / Neechabhanga'. A debilitated,",
  "    combust, or retrograde planet is NOT plainly 'strong' — name the effort it asks.",
  "  - STRENGTH NUMBERS: never state a numeric or percentage strength for any planet",
  "    or yoga — no numeric strength field exists. Use only the dignity/retrograde/",
  "    combust flags, each yoga's `grade`, and its `strength_factors[]` (value + basis).",
  "  - ASPECTS: this chart has NO aspect/drishti data. NEVER say a planet 'aspects',",
  "    'sees', or 'casts a glance on' another. The only relation you may state is",
  "    CONJUNCTION, and only when two planets share the same `house` value.",
  "  - TIMING: there is NO birth date, NO age, NO transits. NEVER give ages or 'Saturn",
  "    returns', and NEVER invent a date. You MAY cite the dasha fields' own dated month",
  "    windows (start_month/end_month, antar_sequence, pratyantar_sequence) VERBATIM",
  "    when present; otherwise speak of chapters via the dasha order and `months_remaining`.",
  "  - YOGAS (ZERO TOLERANCE): discuss ONLY yogas that appear in the chart's yoga list.",
  "    If a yoga is not listed it DOES NOT EXIST here — never invent or name one.",
  "",
  "PRIVACY: never mention any city/state/country name. Say 'birth location' generically.",
  "",
  OUTPUT_DISCIPLINE_RULES,
  "",
  "OUTPUT: respond with ONE strict JSON object matching the requested schema. No prose",
  "outside the JSON. No markdown code fences. Escape any quotes inside strings. Fill in",
  "every requested field with real content — never leave a field blank, null, or a",
  "placeholder like 'N/A' or 'pending'.",
].join("\n");

// =============================================================================
// Per-section task prompts (ported from the .j2 section templates)
// =============================================================================

const CORE_TASK = [
  "TASK: Core Analysis — WHO the person IS (identity, innate nature, personality).",
  "Return JSON: { summary, strengths[], challenges[], life_themes[] }.",
  "  - summary: a DUAL-MODE object { \"layman\": string, \"technical\": string } — REQUIRED,",
  "    both fields NON-EMPTY, written FIRST (before the arrays). It is the headline reading",
  "    shown at the top of the dashboard, toggled between two voices:",
  "      • layman = a 2-3 sentence executive summary in EVERYDAY words, with NO planet,",
  "        sign, house, dasha, yoga, or nakshatra names — just the lived essence.",
  "      • technical = the SAME essence in 2-3 sentences that NAME the actual placements",
  "        and dignities (the lagna + lord, the most decisive dignity, the defining yoga).",
  "  - strengths / challenges / life_themes: arrays (aim for 3 items each) of objects",
  '    { "title": string, "layman": string, "technical": string }.',
  "",
  "UNIQUE-ANGLE OPENING: open from a spine that could fit NO other chart — anchor it to",
  "  the lagna (rising sign + its lord's placement), the planet with the most decisive",
  "  `dignity` (an exalted or debilitated planet, or an own-sign one), and the single",
  "  defining yoga from the list. Name that spine in the summary, then let strengths,",
  "  challenges, and themes elaborate it.",
  "HOUSE-LORD CHAINS: trace AT LEAST ONE explicit dispositor chain — take a house cusp,",
  "  read its `sign_lord` (that is the house's lord), find WHERE that planet sits via its",
  "  `house` and `sign`, and read ITS dignity; narrate what the chain reveals about the",
  "  path to that area of life. (e.g. 'the lord of the rising sign sits in the Nth house",
  "  in <dignity>, so identity is expressed through <that house's themes>'.)",
  "DEGREE & NAKSHATRA DEPTH (technical fields): cite sign + sign_degrees, and weave in",
  "  nakshatra + nakshatra_pada + nakshatra_lord for defining planets — let the nakshatra",
  "  lord modify how that planet expresses. NAME any defining planet that is_retrograde",
  "  (an inward/revisiting quality) or is_combust (overshadowed by the Sun, expressed",
  "  through effort). Two planets sharing a `house` are conjunct — you may say so.",
  "DEBILITY HONESTY: a debilitated/combust/retrograde-strained planet is never plainly",
  "  'strong' — name the condition and the growth-through-effort theme.",
  "Every challenge MUST end with a BRIDGE sentence linking it to a NAMED strength or",
  "  yoga from this same reading. Give each item a distinct emotional flavor and fresh",
  "  vocabulary. Only reference yogas in the provided list.",
].join("\n");

const YOGA_TASK = [
  "TASK: Integrated Yoga Narrative — the life JOURNEY and its turning points, NOT",
  "  personality (that is the Core section). Tell one flowing life story.",
  'Return JSON: { "integrated_yoga_narrative": { "layman": string, "technical": string } }.',
  "  Both fields MUST be non-empty strings.",
  "",
  "ORDER BY GRADE: rank the yogas by their qualitative `grade` (strong > moderate >",
  "  weak). The STRONGEST-graded yoga is the CORE THEME the story is built around; the",
  "  moderate yogas are AMPLIFIERS that color it; the weak are NUANCE/undertone.",
  "  Group yogas that share the same planets into ONE composite theme (max 7-8 headline",
  "  themes), naming the dominant one and treating the rest as supporting facets.",
  "WHY (quote the data): justify each yoga's weight by QUOTING or paraphrasing its own",
  "  `strength_factors[]` entries (`value` + `basis`) and `formation_rules[].description`",
  "  — those already phrase the contributing reasons, with their classical `source`.",
  "  Never invent a percentage or a factor that is not in the data.",
  "DEBILITY HONESTY: if a yoga involves a debilitated, combust, or retrograde planet,",
  "  state the modification explicitly — the yoga's gift is earned through struggle, not",
  "  given freely. Do NOT claim any 'Neechabhanga / cancellation' (not in this data).",
  "TIMING (relative only): place the journey using dasha ORDERING from the data — which",
  "  lord rules the CURRENT chapter, which periods are upcoming vs past, and the current",
  "  period's months_remaining. NEVER state ages, years, dates, or Saturn returns.",
  "ZERO TOLERANCE: never mention any yoga that is not in the provided list; reach depth",
  "  by analyzing the listed yogas more deeply, never by adding new ones.",
].join("\n");

const GUIDANCE1_TASK = [
  "TASK: Life Guidance Part 1 — practical application across four life areas.",
  "Return JSON with FOUR persona objects, each { layman, technical }:",
  "  health_guidance, education_guidance, career_guidance, relationship_guidance.",
  "",
  "PER-AREA HOUSE-LORD CHAIN (MANDATORY in the technical field): for each area, take its",
  "  house cusp, read the cusp's `sign_lord` (= that house's lord), find WHERE that lord",
  "  sits via its `house`/`sign`, and read ITS `dignity` — narrate the path that chain",
  "  reveals. Houses by area: Health = 1st & 6th; Education = 4th & 5th; Career = 10th;",
  "  Relationships = 7th.",
  "PER-AREA KARAKA CONDITION: also read the area's natural significator and report its",
  "  `dignity`, `is_combust`, `is_retrograde` — Health: Sun & Mars; Education: Mercury &",
  "  Jupiter; Career: Saturn & the Sun; Relationships: Venus & the Moon. If a karaka is",
  "  debilitated/combust, be honest that the area asks for more effort before it flowers.",
  "DISTINCT VOCABULARY PER AREA: Health = body-mind, vitality, stress response, rest.",
  "  Education = learning style, curiosity, which subjects flow vs. need effort.",
  "  Career = work environment, navigating authority, when the dasha order favors a move",
  "  (relative, never an age). Relationships = attachment, what makes them feel secure,",
  "  communication in partnership. Do NOT bleed one area's framing into another.",
  "DEBILITY HONESTY throughout; describe what success AND struggle FEEL like, not just",
  "  outcomes. Only reference yogas in the provided list.",
].join("\n");

const GUIDANCE2_TASK = [
  "TASK: Life Guidance Part 2 — the inner and temporal dimensions.",
  "Return JSON with THREE persona objects, each { layman, technical }:",
  "  finances_guidance, spiritual_guidance, life_evolution_guidance.",
  "",
  "FINANCES: trace the 2nd-house and 11th-house lord chains (each cusp's `sign_lord` →",
  "  where that planet sits → its dignity) to show how earning and gains flow. If a",
  "  wealth lord is_retrograde, frame it as a revisiting pattern — money themes circled",
  "  back to, refined the second time — not a date. Be honest about any debilitated",
  "  wealth lord (abundance is cultivated patiently, after lessons).",
  "SPIRITUAL: trace the 9th- and 12th-house lord chains; read Ketu's `house`/`sign` as",
  "  the area of natural detachment and inward pull. Name the practices that resonate",
  "  from these placements. Do NOT invent transits or 'phases of life' from dates.",
  "LIFE EVOLUTION = dasha-SEQUENCE phases (this REPLACES ages / Saturn returns entirely):",
  "  using the maha-dasha ordering and statuses, name which lord governs the CURRENT",
  "  chapter and what it is teaching, then which lord governs the NEXT (status 'future')",
  "  chapter and the shift it brings; cite the current period's months_remaining as the",
  "  sense of 'how far into this chapter'. When the dashas data carries dated month",
  "  windows (start_month/end_month and the current maha's antar_sequence), CITE the",
  "  current dated stack EXPLICITLY — maha, antar, and pratyantar each with its lord",
  "  and window (e.g. 'the Saturn chapter, 2017-02 to 2036-02, now in its Venus",
  "  sub-period, 2023-12 to 2027-01') — months verbatim; with no dated windows, stay",
  "  relative and never invent a date. Speak of chapters, never ages.",
  "  Every challenge mentioned MUST end with a BRIDGE to a NAMED strength or yoga.",
  "DEBILITY HONESTY throughout; give each section a distinct voice. Convey how money",
  "  anxiety/abundance and inner seeking FEEL. Only reference yogas in the provided list.",
].join("\n");

const REMEDIAL_TASK = [
  "TASK: Remedial Measures — universal & globally accessible, personalized to THIS chart.",
  'Return JSON: { "remedial_measures": { "layman": string, "technical": string } }.',
  "",
  "  - layman: UNIVERSAL-FIRST and culture-neutral ONLY — meditation & mindfulness,",
  "    breathing, yoga postures by ENGLISH name (warrior pose, tree pose), walking /",
  "    nature immersion, journaling & reflection, color/environment & decluttering,",
  "    sleep & general wellness, service & connection, creative expression. FORBIDDEN",
  "    here: Sanskrit mantras, pujas, temple/deity worship, gemstone prescriptions,",
  "    metals/fingers, hora/muhurta timing — any culture-specific religious practice.",
  "    For EACH practice say WHAT to do, WHY it helps (plain principle), HOW it FEELS",
  "    when it is working, and WHEN to do it. Honest framing only — practices help",
  "    MANAGE a challenge gradually over weeks/months; they do not erase it overnight.",
  "  - technical: gemstones and mantras MAY appear here, but ONLY as optional",
  "    alternatives alongside the universal practices, never as the primary solution.",
  "TARGETING (MANDATORY): every technical remedy must address a SPECIFIC named weak",
  "  placement actually present in the data — a planet whose `dignity` is debilitated,",
  "  or that is `is_combust`, or a yoga whose `grade` is weak. Name that placement as",
  "  the thing the remedy supports. NEVER invent an affliction, aspect, or dosha that",
  "  is not visible in the chart JSON.",
].join("\n");

const UPCOMING_PERIODS_TASK = [
  "TASK: The Road Ahead — the person's UPCOMING dasha periods as a dated forward arc.",
  'Return JSON: { "upcoming_periods": [ { "title": string, "layman": string, "technical": string } ] }.',
  "",
  "WINDOWS (THE ONLY ONES THAT EXIST): one item PER upcoming window, in chronological",
  "  order — each REMAINING antardasha of the current mahadasha (the rows of the current",
  "  maha's `antar_sequence` AFTER the current antardasha), then ONE item for the NEXT",
  "  mahadasha transition (the sequence row after the current maha). If the chart carries",
  "  no dated `antar_sequence`, fall back to the maha rows with status 'future' and their",
  "  relative wording. NEVER invent a window, a period, or a date beyond those rows.",
  "TITLE: the period + its engine-stated window verbatim, month precision — e.g.",
  '  "Sun antardasha — 2027-01 to 2028-01" (or the relative status when undated).',
  "GROUNDING (MANDATORY): anchor EVERY window in that period lord's OWN chart facts —",
  "  its sign + house + `dignity`, the houses it rules (`houses_ruled`), its",
  "  `is_yogakaraka` / `is_combust` / `is_retrograde` flags, and any LISTED yoga it",
  "  participates in. Where natural, speak to the life domains of the houses that lord",
  "  rules or occupies (career for the 10th, partnership for the 7th, finances for the",
  "  2nd and 11th, home for the 4th, learning for the 5th).",
  "VOICE: concrete and dated — no hedging filler ('time will tell', 'anything is",
  "  possible'). The layman field renders each window as lived experience with no",
  "  jargon; the technical field cites the exact placements and the dated window.",
  "DEBILITY HONESTY: a debilitated, combust, or retrograde lord's window is a",
  "  growth-through-effort chapter — name the condition; never call it plainly easy.",
  "ZERO TOLERANCE: never invent a period, a date, a dignity, or a yoga not in the data.",
].join("\n");

const SECTION_TASKS: Record<InterpretationSectionKey, string> = {
  core: CORE_TASK,
  yoga: YOGA_TASK,
  guidance1: GUIDANCE1_TASK,
  guidance2: GUIDANCE2_TASK,
  remedial: REMEDIAL_TASK,
  upcoming_periods: UPCOMING_PERIODS_TASK,
};

// =============================================================================
// LITE per-section tasks — SAME JSON keys/schema as the full tasks, but SHORT,
// plain, concrete asks (no dispositor-chain / karaka-chain / strength-ordering
// mandates). Used for small local models so they reliably fill every field.
// =============================================================================

const CORE_TASK_LITE = [
  "TASK: Core Analysis — WHO this person is (their nature and personality).",
  "Fill in this EXACT JSON shape (replace the ... with real content; keep these keys):",
  '{',
  '  "summary":     { "layman": "...", "technical": "..." },',
  '  "strengths":   [ { "title": "...", "layman": "...", "technical": "..." } ],',
  '  "challenges":  [ { "title": "...", "layman": "...", "technical": "..." } ],',
  '  "life_themes": [ { "title": "...", "layman": "...", "technical": "..." } ]',
  '}',
  "  - summary: a dual-mode object — BOTH fields NON-EMPTY, REQUIRED, written FIRST. It is",
  "    the headline shown at the top of the dashboard. Do NOT collapse it into a string.",
  "      • layman: ~2 sentences in plain words — NO planet/sign/house/dasha/yoga names.",
  "      • technical: ~2 sentences naming the actual placements (a planet's sign/house/",
  "        dignity, or a listed yoga) for this same essence.",
  "  - strengths, challenges, life_themes: 2-3 items each; keep layman and technical to",
  "    1-2 short sentences. Anchor each technical field to a real placement from the chart",
  "    (a planet's sign/house/dignity, or a listed yoga). Be honest about any",
  "    debilitated/combust/retrograde planet — name the effort it asks for.",
  "  DO NOT echo the chart, the birth data, a name, or a location — write the analysis.",
].join("\n");

const YOGA_TASK_LITE = [
  "TASK: Integrated Yoga Narrative — this person's life journey (NOT personality).",
  "Fill in this EXACT JSON shape (replace the ... with real content; keep these keys):",
  '{ "integrated_yoga_narrative": { "layman": "...", "technical": "..." } }',
  "  Both fields MUST be non-empty. Keep each to ONE short paragraph (2-4 sentences).",
  "  - layman: the lived shape of the journey, in plain words, no jargon.",
  "  - technical: name 1-3 yogas FROM THE PROVIDED LIST and what they bring. If a yoga's",
  "    planet is debilitated/combust/retrograde, say its gift is earned through effort.",
  "ZERO TOLERANCE: never mention any yoga that is not in the provided list.",
].join("\n");

const GUIDANCE1_TASK_LITE = [
  "TASK: Life Guidance Part 1 — four life areas. Return JSON with EXACTLY these FOUR",
  "top-level keys, each a persona object with its own layman + technical fields. Copy",
  "this skeleton EXACTLY — do NOT collapse it into a single { layman, technical }:",
  '{',
  '  "health_guidance":       { "layman": "...", "technical": "..." },',
  '  "education_guidance":    { "layman": "...", "technical": "..." },',
  '  "career_guidance":       { "layman": "...", "technical": "..." },',
  '  "relationship_guidance": { "layman": "...", "technical": "..." }',
  '}',
  "  Every field MUST be non-empty. Keep each layman and technical to 1-2 short sentences.",
  "  - layman: warm, practical advice for THAT area, in plain words (no jargon).",
  "  - technical: cite ONE relevant placement from the data for that area (a planet's",
  "    sign/house/dignity). Houses: Health = 1st/6th, Education = 4th/5th, Career = 10th,",
  "    Relationships = 7th. Be honest about any debilitated/combust significator.",
].join("\n");

const GUIDANCE2_TASK_LITE = [
  "TASK: Life Guidance Part 2 — inner and temporal areas. Return JSON with EXACTLY these",
  "THREE top-level keys, each a persona object with its own layman + technical fields.",
  "Copy this skeleton EXACTLY — do NOT collapse it into a single { layman, technical }:",
  '{',
  '  "finances_guidance":       { "layman": "...", "technical": "..." },',
  '  "spiritual_guidance":      { "layman": "...", "technical": "..." },',
  '  "life_evolution_guidance": { "layman": "...", "technical": "..." }',
  '}',
  "  Every field MUST be non-empty. Keep each layman and technical to 1-2 short sentences.",
  "  - layman: plain, encouraging guidance for money themes, inner life, and life phases.",
  "  - technical: cite ONE relevant placement (Finances = 2nd/11th house lord or a wealth",
  "    planet; Spiritual = 9th/12th house or Ketu; Life Evolution = the CURRENT dasha lord",
  "    and what the NEXT period brings). Speak of dasha as chapters — never ages. Cite the",
  "    dasha fields' dated month windows (start_month/end_month) VERBATIM when present;",
  "    never invent a date.",
].join("\n");

const REMEDIAL_TASK_LITE = [
  "TASK: Remedial Measures — simple, universal, personalized to THIS chart.",
  "Fill in this EXACT JSON shape (replace the ... with real content; keep these keys):",
  '{ "remedial_measures": { "layman": "...", "technical": "..." } }',
  "  Both fields MUST be non-empty. Keep each to 1-2 short sentences.",
  "  - layman: UNIVERSAL, culture-neutral practices ONLY — meditation, breathing, walking",
  "    in nature, journaling, rest, creative expression. NO mantras, pujas, temples,",
  "    deities, gemstones, or metals here. Say honestly these help gradually, over time.",
  "  - technical: name ONE specific weak placement actually in the data (a debilitated or",
  "    combust planet, or a low-strength listed yoga) and a supportive practice for it.",
  "    Gemstones/mantras MAY appear here as optional extras only. Invent no affliction.",
].join("\n");

const UPCOMING_PERIODS_TASK_LITE = [
  "TASK: The Road Ahead — this person's upcoming dasha periods, in order.",
  "Fill in this EXACT JSON shape (replace the ... with real content; keep these keys):",
  '{ "upcoming_periods": [ { "title": "...", "layman": "...", "technical": "..." } ] }',
  "  - One item per REMAINING antardasha of the current mahadasha (the rows of the",
  "    current maha's `antar_sequence` AFTER the current antardasha), then one item for",
  "    the NEXT mahadasha. Use ONLY periods listed in the dashas data — never invent a",
  "    period or a date.",
  '  - title: the period + its engine-stated window verbatim, e.g. "Sun antardasha —',
  '    2027-01 to 2028-01".',
  "  - layman: 1-2 plain sentences on how that chapter tends to feel (no jargon).",
  "  - technical: 1-2 sentences citing that lord's own sign/house/dignity from the",
  "    chart and the dated window. Be honest about a debilitated/combust lord.",
].join("\n");

const SECTION_TASKS_LITE: Record<InterpretationSectionKey, string> = {
  core: CORE_TASK_LITE,
  yoga: YOGA_TASK_LITE,
  guidance1: GUIDANCE1_TASK_LITE,
  guidance2: GUIDANCE2_TASK_LITE,
  remedial: REMEDIAL_TASK_LITE,
  upcoming_periods: UPCOMING_PERIODS_TASK_LITE,
};

function modeHint(mode: ViewMode, lite: boolean): string {
  const lengthGuidance = lite
    ? "Keep every field SHORT and concrete: ~2 sentences for the summary, 1-2 short sentences per persona field, 2-3 items per array. Never pad, never leave a field blank."
    : "Write 2-4 substantive paragraphs per persona field — depth over length; never pad.";
  const audience =
    mode === "expert"
      ? "The reader is an astrologer; make the technical fields especially rigorous."
      : "The reader is a layperson; make the layman fields especially warm and clear.";
  return `${audience} ${lengthGuidance}`;
}

/**
 * Build the system+user chat messages for one section from a SANITIZED chart.
 *
 * `lite` selects the lighter prompt variant for small LOCAL models (callers pass
 * `isLocalEndpoint(config.baseUrl)`); it defaults to the full cloud-grade prompt.
 * Either way the user message embeds the same `SECTION:<key>` marker, the sanitized
 * chart JSON, and the system+user roles — only the INSTRUCTION TEXT changes — and
 * `chatCompletionJson` still requests `response_format: json_object`.
 */
// Appended to BOTH system prompts ONLY when the chart carries the engine
// predictive block — so natal-only prompts stay byte-identical, and prompts
// WITH the block never contradict the "no transit data" honesty fences above.
const PREDICTIVE_CONTEXT_EXCEPTION = [
  "",
  "PREDICTIVE CONTEXT EXCEPTION: this chart ALSO carries a deterministic engine",
  "block delimited as 'ENGINE PREDICTIVE CONTEXT' (transits/Gochara, Sade Sati,",
  "strength figures, life-domain windows). Treat it exactly like the chart JSON:",
  "narrate ONLY what it states. You MAY cite its month-precision windows (e.g.",
  "2030-03) verbatim — they are the ONLY dates that exist. Every other timing",
  "rule still applies: no ages, no birth dates, no years, and no transit, window,",
  "or strength figure that is not stated in that block.",
].join("\n");

function buildSectionMessages(
  section: InterpretationSectionKey,
  chart: SanitizedChart,
  mode: ViewMode,
  lite = false,
  language: PromptLanguage = "en",
): ChatMessage[] {
  // The predictive contexts ride as a compact DELIMITED TEXT block with their
  // own narrate-only guard — excluded from the chart JSON dump (no duplication).
  const { predictive, ...chartForJson } = chart;
  const chartJson = JSON.stringify(chartForJson, null, 2);
  const predictiveBlock = buildPredictiveFactsBlock(predictive);
  const userContent = lite
    ? liteUserContent(section, chartJson, mode, predictiveBlock)
    : fullUserContent(section, chartJson, mode, predictiveBlock);
  const basePrompt = lite ? SYSTEM_PROMPT_LITE : SYSTEM_PROMPT;
  const exception = predictiveBlock === "" ? "" : PREDICTIVE_CONTEXT_EXCEPTION;
  const systemPrompt = withLanguage(basePrompt + exception, language);

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

/** Full cloud-grade user message: task + chart (task leads, as ported). */
function fullUserContent(
  section: InterpretationSectionKey,
  chartJson: string,
  mode: ViewMode,
  predictiveBlock: string,
): string {
  return [
    // A stable marker so tests (and logs) can identify the section; harmless to the model.
    `SECTION:${section}`,
    "",
    SECTION_TASKS[section],
    "",
    modeHint(mode, false),
    "",
    "Chart Data (sanitized; no identifying information). The 'yogas' field is the",
    "EXHAUSTIVE list of yogas in this chart — discuss no others. Fields that are",
    "null or absent are simply UNKNOWN — omit them silently, never guess a value:",
    chartJson,
    ...(predictiveBlock === "" ? [] : [predictiveBlock]),
  ].join("\n");
}

/**
 * LITE user message for small local models. The chart is given FIRST as read-only
 * reference, then the task + literal JSON skeleton come LAST so the schema is the
 * final thing the model sees (recency bias dramatically improves schema-adherence
 * on 3-4B models, which otherwise collapse to `{}` or echo the chart). Still carries
 * the `SECTION:<key>` marker and the full sanitized chart JSON.
 */
function liteUserContent(
  section: InterpretationSectionKey,
  chartJson: string,
  mode: ViewMode,
  predictiveBlock: string,
): string {
  return [
    `SECTION:${section}`,
    "",
    "Below is this person's sanitized chart (no identifying info). It is REFERENCE",
    "ONLY — read it, do NOT copy it back. The 'yogas' field is the EXHAUSTIVE list of",
    "yogas; discuss no others. Null/absent fields are simply UNKNOWN — never guess them.",
    "",
    "CHART (reference):",
    chartJson,
    ...(predictiveBlock === "" ? [] : [predictiveBlock]),
    "",
    "------------------------------------------------------------------",
    SECTION_TASKS_LITE[section],
    "",
    modeHint(mode, true),
    "",
    "Now output ONLY the filled-in JSON object described above — nothing else. Do not",
    "repeat the chart, the birth data, any name, or any place. Every requested field",
    "must contain real, specific content (never blank, null, or a placeholder).",
  ].join("\n");
}

// =============================================================================
// Per-section parse helpers (each returns the slice it owns, with safe defaults)
// =============================================================================

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Coerce an unknown summary value into a dual-mode `Persona`. A `{ layman,
 * technical }` object is taken as-is; a BARE STRING (what LITE / small local
 * models often emit) is mapped to both voices so the summary never blanks; any
 * other shape yields both-empty.
 */
function asPersona(value: unknown): Persona {
  if (typeof value === "string") {
    return { layman: value, technical: value };
  }
  const persona = parsePersona(value);
  return persona ?? { layman: "", technical: "" };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** A persona { layman?, technical? } parsed from an unknown JSON value, or null. */
function parsePersona(value: unknown): { layman: string; technical: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const rec = value as Record<string, unknown>;
  return { layman: asString(rec.layman), technical: asString(rec.technical) };
}

function parseTitledPersonas(value: unknown): TitledPersona[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: TitledPersona[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    out.push({
      title: asString(rec.title),
      layman: asString(rec.layman),
      technical: asString(rec.technical),
    });
  }
  return out;
}

interface CoreSlice {
  readonly summary: Persona;
  readonly strengths: TitledPersona[];
  readonly challenges: TitledPersona[];
  readonly life_themes: TitledPersona[];
}

function parseCore(json: unknown): CoreSlice {
  const rec = asRecord(json);
  return {
    summary: asPersona(rec.summary),
    strengths: parseTitledPersonas(rec.strengths),
    challenges: parseTitledPersonas(rec.challenges),
    life_themes: parseTitledPersonas(rec.life_themes),
  };
}

function parseYoga(json: unknown): IntegratedYogaNarrative {
  const rec = asRecord(json);
  const persona = parsePersona(rec.integrated_yoga_narrative) ?? { layman: "", technical: "" };
  return persona;
}

interface Guidance1Slice {
  readonly health_guidance: HealthGuidance | null;
  readonly education_guidance: EducationGuidance | null;
  readonly career_guidance: CareerGuidance | null;
  readonly relationship_guidance: RelationshipGuidance | null;
}

function parseGuidance1(json: unknown): Guidance1Slice {
  const rec = asRecord(json);
  return {
    health_guidance: parsePersona(rec.health_guidance),
    education_guidance: parsePersona(rec.education_guidance),
    career_guidance: parsePersona(rec.career_guidance),
    relationship_guidance: parsePersona(rec.relationship_guidance),
  };
}

interface Guidance2Slice {
  readonly finances_guidance: FinanceGuidance | null;
  readonly spiritual_guidance: SpiritualGuidance | null;
  readonly life_evolution_guidance: LifeEvolutionGuidance | null;
}

function parseGuidance2(json: unknown): Guidance2Slice {
  const rec = asRecord(json);
  return {
    finances_guidance: parsePersona(rec.finances_guidance),
    spiritual_guidance: parsePersona(rec.spiritual_guidance),
    life_evolution_guidance: parsePersona(rec.life_evolution_guidance),
  };
}

function parseRemedial(json: unknown): RemedialMeasures | null {
  const rec = asRecord(json);
  return parsePersona(rec.remedial_measures);
}

function parseUpcomingPeriods(json: unknown): TitledPersona[] {
  const rec = asRecord(json);
  return parseTitledPersonas(rec.upcoming_periods);
}

// =============================================================================
// Section results container (filled in parallel; merged at the end)
// =============================================================================

interface SectionResults {
  core: CoreSlice;
  yoga: IntegratedYogaNarrative;
  guidance1: Guidance1Slice;
  guidance2: Guidance2Slice;
  remedial: RemedialMeasures | null;
  upcoming_periods: TitledPersona[];
}

function emptyResults(): SectionResults {
  return {
    core: {
      summary: { layman: "", technical: "" },
      strengths: [],
      challenges: [],
      life_themes: [],
    },
    yoga: { layman: "", technical: "" },
    guidance1: {
      health_guidance: null,
      education_guidance: null,
      career_guidance: null,
      relationship_guidance: null,
    },
    guidance2: {
      finances_guidance: null,
      spiritual_guidance: null,
      life_evolution_guidance: null,
    },
    remedial: null,
    upcoming_periods: [],
  };
}

/** Parse one section's raw JSON string into the results container in place. */
function applySection(
  results: SectionResults,
  section: InterpretationSectionKey,
  raw: string,
): void {
  const json: unknown = JSON.parse(raw);
  switch (section) {
    case "core":
      results.core = parseCore(json);
      return;
    case "yoga":
      results.yoga = parseYoga(json);
      return;
    case "guidance1":
      results.guidance1 = parseGuidance1(json);
      return;
    case "guidance2":
      results.guidance2 = parseGuidance2(json);
      return;
    case "remedial":
      results.remedial = parseRemedial(json);
      return;
    case "upcoming_periods":
      results.upcoming_periods = parseUpcomingPeriods(json);
      return;
  }
}

/** Merge the populated section results into one VedicInterpretation. */
function mergeResults(results: SectionResults): VedicInterpretation {
  return {
    summary: results.core.summary,
    strengths: results.core.strengths,
    challenges: results.core.challenges,
    life_themes: results.core.life_themes,
    integrated_yoga_narrative: results.yoga,
    health_guidance: results.guidance1.health_guidance,
    education_guidance: results.guidance1.education_guidance,
    career_guidance: results.guidance1.career_guidance,
    relationship_guidance: results.guidance1.relationship_guidance,
    finances_guidance: results.guidance2.finances_guidance,
    spiritual_guidance: results.guidance2.spiritual_guidance,
    life_evolution_guidance: results.guidance2.life_evolution_guidance,
    remedial_measures: results.remedial,
    upcoming_periods: results.upcoming_periods,
  };
}

// =============================================================================
// Orchestration: 5 parallel JSON calls -> stream of events -> merged complete
// =============================================================================

/** Internal per-section outcome reported back to the event loop. */
type SectionOutcome =
  | { section: InterpretationSectionKey; ok: true; raw: string }
  | { section: InterpretationSectionKey; ok: false; message: string };

function runOneSection(
  section: InterpretationSectionKey,
  chart: SanitizedChart,
  params: StructuredInterpretationParams,
): Promise<SectionOutcome> {
  // Locality gate: a local OpenAI-compatible endpoint (Ollama et al.) means a
  // small model that needs the LITE prompt; a cloud endpoint gets the full prompt.
  const lite = isLocalEndpoint(params.config.baseUrl);
  const messages = buildSectionMessages(
    section,
    chart,
    params.mode ?? "layman",
    lite,
    params.language ?? "en",
  );
  return chatCompletionJson({
    config: params.config,
    messages,
    ...(params.signal ? { signal: params.signal } : {}),
    ...(params.fetchImpl ? { fetchImpl: params.fetchImpl } : {}),
  })
    .then((raw): SectionOutcome => ({ section, ok: true, raw }))
    .catch((err: unknown): SectionOutcome => ({
      section,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }));
}

function abortError(): Error {
  const err = new Error("Structured interpretation aborted");
  err.name = "AbortError";
  return err;
}

/** Collapse the per-section failure messages (usually identical) into one line. */
function summarizeFailures(messages: readonly string[]): string {
  const unique = [...new Set(messages.map((m) => m.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return "No further detail was reported by the endpoint.";
  }
  return unique.join(" / ");
}

/**
 * Sanitize a chart and stream a structured six-section Vedic interpretation.
 *
 * Emits `section_start` for every section up front, runs every section's JSON
 * call in PARALLEL, emits `section_complete` per successful section and `error`
 * per failed one (failed sections degrade to empty), then a single `complete`
 * event with the merged `VedicInterpretation`. Honors `params.signal` (aborts
 * before any call and during the in-flight calls via the underlying fetch).
 */
export async function* streamStructuredInterpretation(
  params: StructuredInterpretationParams,
): AsyncGenerator<InterpretationEvent> {
  if (params.signal?.aborted) {
    throw abortError();
  }

  // Fail fast and CLEAN on the privacy mismatch (e.g. a cloud OpenRouter URL
  // left under the default `local_only`). Otherwise every section would throw
  // the same PrivacyViolationError, get swallowed per-section, and the run would
  // "complete" empty — a blank dashboard with no explanation.
  ensurePrivacy(params.config);

  const chart = sanitizeChartForLlm(params.chart, params.now ?? new Date());

  // Announce all sections up front so the UI can render its pending slots.
  for (const section of ALL_SECTIONS) {
    yield { type: "section_start", section };
  }

  // Fan out: all section calls in flight at once (mirrors the orchestrator's gather).
  const inFlight = ALL_SECTIONS.map((section) => runOneSection(section, chart, params));
  const outcomes = await Promise.all(inFlight);

  if (params.signal?.aborted) {
    throw abortError();
  }

  const results = emptyResults();
  let applied = 0;
  const failures: string[] = [];
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      failures.push(outcome.message);
      yield { type: "error", section: outcome.section, message: outcome.message };
      continue;
    }
    try {
      applySection(results, outcome.section, outcome.raw);
      applied += 1;
      yield { type: "section_complete", section: outcome.section };
    } catch (err) {
      // A 2xx response that wasn't valid JSON for this section: degrade too.
      const message = err instanceof Error ? err.message : String(err);
      failures.push(message);
      yield {
        type: "error",
        section: outcome.section,
        message,
      };
    }
  }

  // Partial success still completes — one bad section never sinks the reading.
  // But ZERO usable sections is a total failure (privacy/auth/network/bad model),
  // and must be loud so the UI shows an error + Retry instead of going blank.
  if (applied === 0) {
    throw new Error(
      `Interpretation failed: all ${outcomes.length} sections failed. ${summarizeFailures(failures)}`,
    );
  }

  yield { type: "complete", interpretation: mergeResults(results) };
}
