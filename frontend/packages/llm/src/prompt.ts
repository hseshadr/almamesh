// Prompt builder: turns a SANITIZED chart into an OpenAI-compatible chat prompt.
//
// The persona + instructions are ported from the backend's
// `TEXT_INTERPRETATION_PROMPT` and `_get_base_mode_instruction`
// (backend/src/almamesh/llm.py + constants/llm.py). This MVP asks for markdown
// prose (not the 5-persona structured `VedicInterpretation` JSON) — the streamed
// text renders directly in the existing interpretation panel.

import { estimateTokens, trimHistoryToBudget, type ChatTurn } from "./budget";
import type { ChatMessage } from "./client";
import { buildChartFactsBlock } from "./facts";
import { withLanguage, type PromptLanguage } from "./language";
import { buildMeshFactsBlock } from "./mesh-facts";
import type { SanitizedMeshEdge } from "./mesh-sanitize";
import { buildPredictiveFactsBlock } from "./predictive-facts";
import type { SanitizedChart } from "./sanitize";
import type { VedicInterpretation, TitledPersona, Persona } from "@almamesh/shared-types";

export type ViewMode = "layman" | "expert";

// History budget for the chat path. Now that the chart rides as a COMPACT facts
// block (not a full JSON dump), prior turns can keep a more generous slice of the
// context window before drop-oldest kicks in.
const HISTORY_TOKEN_BUDGET = 3072;

// Cap for the already-generated natal reading folded into a chat turn. It rides as
// CONTEXT (the model grounds its answer in it), not prose, so a generous-but-bounded
// slice keeps even a small/local chat model inside its window.
export const INTERP_TOKEN_BUDGET = 1200;

// Output-discipline + derived-fact fences shared by EVERY narration prompt
// (structured full + lite, this file's markdown interpretation, and chat).
// Added after an external expert found a mid-text self-correction ("Actually
// Saturn rules…") in a generated report: the reader must only ever see finished
// prose, and the model must never derive a lordship the engine did not state.
// Hardened again after a live-narration audit (real OpenRouter run) caught four
// leak classes the first fence missed: a parenthetical mid-sentence
// self-question ("(Saturn as co-lord of the 7th by aspect? Saturn occupies the
// 7th)"), an invented "incoming Mercury antar", a hedge against the engine's
// own `dignity` field ("neutral by the provided classification but effectively
// 'own'"), and misused house-class words ("trikona lord of 4th"). The engine
// now emits the dated dasha tree (antar + pratyantar sequences), so the old
// blanket ban on naming a next antar became a facts-fenced clause: upcoming
// periods may be narrated ONLY as listed — lords + dated windows verbatim,
// never a period beyond the list.
export const OUTPUT_DISCIPLINE_RULES = [
  "OUTPUT DISCIPLINE (ABSOLUTE): everything you write is FINISHED, polished prose the",
  'reader sees verbatim. NEVER include self-corrections ("Actually...", "wait", "let me',
  'reconsider"), meta-commentary about your writing or reasoning process, or any visible',
  "chain-of-thought. NEVER pose a question to yourself in the text — no parenthetical",
  'self-questioning like "(is it X? it is Y)". Reason silently BEFORE you write; if you',
  "catch a mistake, rewrite the sentence cleanly — never correct yourself mid-text.",
  "DERIVED-FACT FENCE (ABSOLUTE): NEVER state a house lordship, sign rulership, dasha",
  "date, or yoga that is not explicitly present in the provided engine facts. If a",
  "fact is absent, OMIT the claim entirely — do not derive, infer, or guess it.",
  "Dasha periods beyond the ones the data states do NOT exist. Upcoming periods (a",
  "next antar, pratyantar, or maha) may be narrated ONLY as stated in the provided facts",
  "— their lords and dated windows VERBATIM — and never beyond the list: NEVER name",
  "a period, a lord, or a window the facts do not state.",
  "The `dignity` field is the single authoritative dignity for a planet — state it",
  "verbatim and never second-guess it against any other classification.",
  "House-class words must be used correctly: kendra = houses 1/4/7/10, trikona =",
  "1/5/9, upachaya = 3/6/10/11, dusthana = 6/8/12.",
].join("\n");

// The anti-scam contract for ALL relationship narration (the mesh reading and
// any chat turn that carries a relationship context). AlmaMesh exists to be the
// anti-scam astrology app: classical Melapaka numbers are reflective tradition,
// and the moment a model turns a guna total or a dosha into a verdict, fear, or
// a marry/leave instruction, it becomes the thing this app was built against.
export const ANTI_SCAM_RELATIONSHIP_FENCE = [
  "ANTI-SCAM RELATIONSHIP FENCE (ABSOLUTE): the guna total and the doshas in the",
  "relationship facts are CLASSICAL CONVENTIONS offered for reflection — NEVER",
  "verdicts on this relationship's worth, destiny, or viability.",
  "NEVER advise marrying, leaving, divorcing, avoiding, or cutting off anyone,",
  "and never imply the data demands such a step. NO fear language around any",
  "dosha: name its classical meaning and its cancellation status exactly as",
  "stated, then move to what can be tended — communication, patience, timing,",
  "care. A compatibility band is a label from a classical table, not a judgment",
  "of two people.",
].join("\n");

// Verbatim persona from backend TEXT_INTERPRETATION_PROMPT.
const SYSTEM_PROMPT = [
  "You are an expert Vedic Astrologer with 30 years of experience.",
  "Your goal is to provide accurate, empathetic, and insightful readings based on the",
  "Sidereal Zodiac (Lahiri Ayanamsa).",
  "Use the provided astronomical data (Planets, Houses, Dashas, Yogas) to construct your analysis.",
  "Do not make up planetary positions; strictly adhere to the JSON context provided.",
  "",
  OUTPUT_DISCIPLINE_RULES,
  "",
  "Respond in clear, well-structured Markdown.",
].join("\n");

// Ported from backend `_get_base_mode_instruction`.
const LAYMAN_INSTRUCTION = [
  "Analyze this birth chart for a general audience. Avoid overly technical jargon.",
  "Focus on:",
  "1. The Ascendant (Lagna) and its sign - personality core.",
  "2. The Moon sign - emotional nature.",
  "3. Key planetary strengths (Exalted/Own sign planets).",
  "4. Current Dasha period (if provided) - what to expect now.",
].join("\n");

const EXPERT_INSTRUCTION = [
  "Provide a technical Vedic Astrology analysis including:",
  "1. Lagna and Lagna Lord strength.",
  "2. Planetary dignities (Uccha, Neecha, Moolatrikona).",
  "3. Yoga analysis (mention provided yogas).",
  "4. Vimshottari Dasha sequence and current bhukti.",
].join("\n");

function modeInstruction(mode: ViewMode): string {
  return mode === "expert" ? EXPERT_INSTRUCTION : LAYMAN_INSTRUCTION;
}

// The open-ended chat persona: a warm, wise Vedic-astrology life COMPANION. The
// user can talk to it about astrology AND their life — career, relationships,
// timing, wellbeing, decisions — and it answers grounded in the engine facts the
// prompt supplies (planet placements, dignities, the current dasha, yogas),
// referencing dashas and yogas when they are relevant. There is exactly ONE
// persona (the tool-using split is gone): the deterministic engine facts are the
// single source of truth, so the model NEVER invents or recomputes a position.
const CHAT_SYSTEM_PROMPT = [
  "You are a warm, wise Vedic astrology companion — an expert in the Sidereal",
  "Zodiac (Lahiri Ayanamsa) with decades of practice, and someone the user can",
  "simply talk to.",
  "",
  "They may ask about their chart, or about their life: career, relationships,",
  "timing, wellbeing, money, or a decision they are weighing. Meet them where they",
  "are. Be empathetic and human, not clinical; offer perspective, not commands.",
  "",
  "Ground EVERY answer in THIS chart's facts and reading — the planet placements,",
  "dignities, the current Vimshottari dasha, any detected yogas, and (when present)",
  "the already-generated reading supplied below. Reference the relevant dasha period",
  "or yoga when it genuinely bears on the answer. The deterministic chart engine is",
  "the SOURCE OF TRUTH: never invent or recompute a planet's position, and if those",
  "facts and that reading don't cover what they asked, say so plainly rather than",
  "inventing an answer.",
  "",
  "If the user reaches for Sanskrit or technical terms (dasha, nakshatra, yoga,",
  "bhukti…), mirror that level — meet their vocabulary instead of over-simplifying.",
  "",
  OUTPUT_DISCIPLINE_RULES,
  "",
  "Respond in clear, well-structured Markdown.",
].join("\n");

// Per-mode register: plain language for a general audience, technical Vedic
// vocabulary for an expert. The persona, grounding rule, and source-of-truth
// contract above are identical in both modes.
const LAYMAN_CHAT_REGISTER = [
  "Speak in plain, everyday language. Avoid heavy jargon; when you use a Sanskrit",
  "or technical term, give a one-line plain meaning. Translate timing language into",
  "lived experience — for example:",
  "- a Saturn period → a time of building lasting foundations and earning what you keep",
  "- a Jupiter period → a growth and opportunity phase, room to expand",
  "- a Rahu period → an ambitious, unconventional, sometimes restless chapter",
  "- a Ketu period → a reflective, letting-go phase that turns you inward",
  "- a Venus period → a season of relationships, comfort, and creativity",
  "- an exalted planet → that part of life runs at its natural best",
].join("\n");

const EXPERT_CHAT_REGISTER =
  "You may use precise Vedic terminology (dignities, lordships, bhuktis, yoga " +
  "names) freely; the reader is comfortable with technical astrology.";

// Appended to the chat system prompt ONLY when the turn carries a mesh edge —
// so single-chart chats stay byte-identical (mirrors the predictive-context
// exception in structured-interpretation.ts).
const MESH_CONTEXT_EXCEPTION = [
  "",
  "RELATIONSHIP CONTEXT EXCEPTION: this conversation ALSO carries a deterministic",
  "engine block delimited as 'ENGINE RELATIONSHIP CONTEXT' (Ashtakoota gunas and",
  "doshas, Mangal screening, chart-on-chart overlay contacts, joint dasha windows,",
  "relationship significators) describing how the user's chart and another",
  "person's chart relate. Treat it exactly like the chart facts: narrate ONLY what",
  "it states, cite its month-precision windows verbatim, and refer to the other",
  'person ONLY by their relationship role (e.g. "your spouse", "your mother") —',
  "never by any name, even if the user names them.",
  "",
  ANTI_SCAM_RELATIONSHIP_FENCE,
].join("\n");

function chatRegister(mode: ViewMode): string {
  return mode === "expert" ? EXPERT_CHAT_REGISTER : LAYMAN_CHAT_REGISTER;
}

/**
 * Build the chat messages for an interpretation request from a SANITIZED chart.
 * Callers MUST pass a `SanitizedChart` (the type makes the privacy boundary
 * explicit) so raw, identifier-bearing charts can never reach the prompt.
 */
export function buildInterpretationMessages(
  chart: SanitizedChart,
  mode: ViewMode = "layman",
  language: PromptLanguage = "en",
): ChatMessage[] {
  // The predictive contexts ride as a compact DELIMITED TEXT block (with their
  // own narrate-only guard), not raw JSON — so they are excluded from the chart
  // dump. When absent, the prompt is byte-identical to the natal-only path.
  const { predictive, ...chartForJson } = chart;
  const chartJson = JSON.stringify(chartForJson, null, 2);
  const predictiveBlock = buildPredictiveFactsBlock(predictive);
  const userContent = [
    modeInstruction(mode),
    "",
    "Chart Data (sanitized; no identifying information):",
    chartJson,
    ...(predictiveBlock === "" ? [] : [predictiveBlock]),
    "",
    "Provide a complete interpretation of this birth chart.",
  ].join("\n");

  return [
    { role: "system", content: withLanguage(SYSTEM_PROMPT, language) },
    { role: "user", content: userContent },
  ];
}

/** The labelled RAG block, or "" when no earlier context was retrieved. */
function retrievedContextBlock(retrievedContext: readonly string[]): string {
  if (retrievedContext.length === 0) {
    return "";
  }
  return ["Relevant earlier conversation (for context):", ...retrievedContext].join("\n");
}

/** Pick the layman or technical voice of a dual-mode section, or "" if absent. */
function personaText(persona: Persona | null | undefined, mode: ViewMode): string {
  if (!persona) {
    return "";
  }
  const text = mode === "expert" ? persona.technical : persona.layman;
  return (text ?? "").trim();
}

/** One "Title: text" line for a titled persona, or "" when it carries no voice. */
function titledLine(item: TitledPersona, mode: ViewMode): string {
  const text = personaText(item, mode);
  if (text === "") {
    return "";
  }
  return item.title ? `- ${item.title}: ${text}` : `- ${text}`;
}

/** A "Label: …" group from titled-persona items, or "" when none carry voice. */
function titledGroup(label: string, items: TitledPersona[], mode: ViewMode): string {
  const lines = items.map((item) => titledLine(item, mode)).filter((line) => line !== "");
  return lines.length === 0 ? "" : [`${label}:`, ...lines].join("\n");
}

/** The optional dual-mode (Persona) guidance sections, in a stable labelled order. */
function guidanceSections(
  interpretation: VedicInterpretation,
): readonly (readonly [string, Persona | null | undefined])[] {
  return [
    ["Yoga narrative", interpretation.integrated_yoga_narrative],
    ["Career", interpretation.career_guidance],
    ["Relationships", interpretation.relationship_guidance],
    ["Education", interpretation.education_guidance],
    ["Wellbeing", interpretation.health_guidance],
    ["Money", interpretation.finances_guidance],
    ["Spirituality", interpretation.spiritual_guidance],
    ["Life evolution", interpretation.life_evolution_guidance],
    ["Remedies", interpretation.remedial_measures],
  ];
}

/** A "Label: text" line per non-empty guidance section (incl. current period). */
function guidanceLines(interpretation: VedicInterpretation, mode: ViewMode): string[] {
  const lines = guidanceSections(interpretation)
    .map(([label, persona]) => [label, personaText(persona, mode)] as const)
    .filter(([, text]) => text !== "")
    .map(([label, text]) => `${label}: ${text}`);
  const period = currentPeriodLine(interpretation.current_period_guidance);
  return period === "" ? lines : [...lines, period];
}

/** A "Current period: …" line from the (non-Persona) current-period guidance. */
function currentPeriodLine(guidance: VedicInterpretation["current_period_guidance"]): string {
  if (!guidance) {
    return "";
  }
  const text = (guidance.guidance ?? guidance.period_summary ?? "").trim();
  return text === "" ? "" : `Current period: ${text}`;
}

/**
 * Flatten a finished `VedicInterpretation` into compact, labelled lines for the
 * given mode (layman vs technical voice). Null/undefined/empty fields are skipped.
 * It rides as chat CONTEXT — terse, not prose — so a small model can ground its
 * answers in the frontier reading instead of re-deriving from raw facts.
 */
export function serializeInterpretationForChat(
  interpretation: VedicInterpretation,
  mode: ViewMode,
): string {
  const parts = [
    `Summary: ${personaText(interpretation.summary, mode)}`,
    titledGroup("Strengths", interpretation.strengths, mode),
    titledGroup("Challenges", interpretation.challenges, mode),
    titledGroup("Life themes", interpretation.life_themes, mode),
    ...guidanceLines(interpretation, mode),
    // The Road Ahead (engine-dated upcoming windows); absent on legacy readings.
    titledGroup("Upcoming periods", interpretation.upcoming_periods ?? [], mode),
  ].filter((part) => part !== "");
  return truncateToInterpBudget(parts.join("\n"));
}

/** Truncate serialized reading text to INTERP_TOKEN_BUDGET, marking when cut. */
function truncateToInterpBudget(text: string): string {
  const marker = "\n…(reading truncated)";
  if (estimateTokens(text) <= INTERP_TOKEN_BUDGET) {
    return text;
  }
  const budgetChars = INTERP_TOKEN_BUDGET * 4 - marker.length;
  return text.slice(0, Math.max(0, budgetChars)) + marker;
}

/** The labelled reading block, or "" when no finished reading is available. */
function interpretationBlock(text?: string): string {
  if (!text || text.trim() === "") {
    return "";
  }
  return `Your chart reading (already generated — ground your answers in this):\n${text}`;
}

/**
 * Build the chat messages for a chart-grounded Q&A request from a SANITIZED
 * chart plus the user's question. Like `buildInterpretationMessages`, the
 * `SanitizedChart` type makes the privacy boundary explicit so no raw,
 * identifier-bearing chart can reach the prompt.
 *
 * The chart rides as the COMPACT, deterministic facts block (`buildChartFactsBlock`),
 * never a raw chart JSON dump — cheaper on the wire and easier to ground on. An
 * optional `retrievedContext` (RAG) is injected as a labelled block so relevant
 * earlier conversation can steer the answer. The optional `interpretationText` is
 * the already-generated natal reading (serialized via `serializeInterpretationForChat`)
 * so a fast/small chat model can lean on the frontier reading; when absent, the
 * prompt is byte-identical to the facts-only path.
 *
 * The optional `meshEdge` is a SANITIZED relationship edge (names already
 * replaced by roles, dates already month-precision): its delimited facts block
 * rides right after the chart facts — the way the predictive block rides — so
 * the user can ask how their chart and e.g. their mother's interact. The system
 * prompt then also carries the relationship exception + anti-scam fence. When
 * absent, the prompt is byte-identical to the single-chart path.
 */
export function buildChatMessages(
  chart: SanitizedChart,
  question: string,
  mode: ViewMode = "layman",
  history: readonly ChatTurn[] = [],
  retrievedContext: readonly string[] = [],
  interpretationText?: string,
  language: PromptLanguage = "en",
  meshEdge?: SanitizedMeshEdge,
): ChatMessage[] {
  const factsBlock = buildChartFactsBlock(chart);
  const meshBlock = buildMeshFactsBlock(meshEdge);
  // The compact facts block rides ONLY on the latest user turn (not repeated per
  // turn) to save budget; the system prompt already pins the engine as truth. The
  // mesh relationship block (when present) rides immediately after the chart
  // facts; the already-generated reading sits after those and before any RAG
  // context. Absent blocks are "" and filtered, keeping today's bytes.
  const userContent = [
    chatRegister(mode),
    "",
    "Chart facts (sanitized; no identifying information):",
    factsBlock,
    meshBlock,
    interpretationBlock(interpretationText),
    retrievedContextBlock(retrievedContext),
    "",
    "Question:",
    question,
  ]
    .filter((part) => part !== "")
    .join("\n");

  // Prior turns are model-authored prose + the user's own questions — plain UI
  // strings carrying no raw chart identifiers — inserted between the system
  // prompt and the final (facts-bearing) user turn, trimmed to a token budget.
  const trimmed = trimHistoryToBudget(history, HISTORY_TOKEN_BUDGET);

  const systemPrompt =
    meshBlock === "" ? CHAT_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT + MESH_CONTEXT_EXCEPTION;
  return [
    { role: "system", content: withLanguage(systemPrompt, language) },
    ...trimmed.map((turn): ChatMessage => ({ role: turn.role, content: turn.content })),
    { role: "user", content: userContent },
  ];
}
