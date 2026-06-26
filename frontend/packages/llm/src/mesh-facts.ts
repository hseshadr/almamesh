// Sanitized mesh edge -> one compact, clearly delimited engine-facts block.
//
// Same philosophy as ./predictive-facts.ts: every value is the engine's OWN
// figure read straight from the already-sanitized `SanitizedMeshEdge`
// (month-precision dates, identifier-free, role-labeled by construction) — NO
// new astrology math. The only processing is PRESENTATION: ordering the
// overlay contacts by the engine's own contact kind (close_conjunction, then
// same_sign, then graha_drishti) and orb, and capping the list honestly.
//
// The block is wrapped in explicit delimiters with narrate-only guard language
// PLUS the relationship framing: guna totals, bands, and doshas are classical
// conventions for reflection — never verdicts on a relationship. Both people
// appear ONLY as roles ("you" and e.g. "your spouse"), never by name.

import { meshRoleLabels, type SanitizedMeshEdge, type SanitizedSynchrony } from "./mesh-sanitize";
import type {
  MeshChartOverlay,
  MeshContactKind,
  MeshDoshaCancellation,
  MeshDoshaFlag,
  MeshGrahaCondition,
  MeshKootaResult,
  MeshMangalMatch,
  MeshMangalReferenceResult,
  MeshMangalSide,
  MeshOverlayContact,
  MeshRelationSignificators,
  MeshRelationship,
} from "./mesh-types";

export const MESH_BLOCK_START =
  "=== ENGINE RELATIONSHIP CONTEXT (deterministic engine output) ===";
export const MESH_BLOCK_END = "=== END ENGINE RELATIONSHIP CONTEXT ===";

/** Contacts listed per overlay direction before the honest remainder line. */
const CONTACT_CAP = 6;

/** "1st" / "2nd" / "3rd" / "4th" … for whole-sign house numbers (1-12). */
function ordinal(house: number): string {
  const suffix = house === 1 ? "st" : house === 2 ? "nd" : house === 3 ? "rd" : "th";
  return `${house}${suffix}`;
}

function capitalize(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

// The guard the model reads FIRST: engine truth, classical-convention framing,
// month-only dates, and roles-never-names.
function meshGuard(other: string): string {
  return [
    `Engine-computed relationship facts between you and ${other}.`,
    "Narrate ONLY what this block states. The guna scores, bands, and doshas are",
    "classical conventions offered for reflection — never verdicts on the",
    "relationship. The month-precision windows (e.g. 2026-03) are the ONLY dates",
    "that exist — quote them verbatim and never extrapolate beyond them. Refer to",
    `the two people ONLY as "you" and "${other}" — never by any name.`,
  ].join("\n");
}

// --- ashtakoota -------------------------------------------------------------

/** "- varna: 0/1 — groom Virgo (vaishya) x bride Leo (kshatriya)". */
function kootaLine(koota: MeshKootaResult): string {
  return `- ${koota.koota}: ${koota.earned}/${koota.maximum} — ${koota.basis}`;
}

function cancellationText(cancellations: readonly MeshDoshaCancellation[]): string {
  return cancellations.map((c) => `cancelled by ${c.rule}: ${c.description}`).join("; ");
}

/** One dosha verdict line: present/cancelled state + the engine basis. */
function doshaLine(label: string, flag: MeshDoshaFlag): string {
  if (!flag.present) {
    return `- ${label} dosha: not present — ${flag.basis}`;
  }
  if (flag.cancelled) {
    const rules = cancellationText(flag.cancellations);
    return `- ${label} dosha: present, CANCELLED — ${flag.basis}${rules ? `; ${rules}` : ""}`;
  }
  return `- ${label} dosha: present, not cancelled — ${flag.basis}`;
}

function ashtakootaSection(edge: SanitizedMeshEdge): string {
  const ak = edge.ashtakoota;
  return [
    "Ashtakoota Guna Milan (classical convention — reflective labels, never verdicts on the relationship):",
    ...ak.kootas.map(kootaLine),
    `- Total: ${ak.total}/${ak.maximum} — band "${ak.band}" (classical convention)`,
    `- Band thresholds: ${ak.band_basis}`,
    doshaLine("Bhakoot", ak.bhakoot_dosha),
    doshaLine("Nadi", ak.nadi_dosha),
  ].join("\n");
}

// --- mangal (Kuja) dosha ----------------------------------------------------

/** "lagna: Mars house 6, clear" / "…, net dosha" / "…, cancelled by <rule>". */
function mangalReferenceClause(ref: MeshMangalReferenceResult): string {
  const head = `${ref.reference}: Mars house ${ref.mars_house}`;
  if (ref.net_dosha) {
    return `${head}, net dosha`;
  }
  if (ref.in_dosha_house) {
    const rules = ref.cancellations.map((c) => `cancelled by ${c.rule}`).join(" + ");
    return `${head}, in a dosha house, ${rules || "no net dosha"}`;
  }
  return `${head}, clear`;
}

function mangalSideLine(label: string, side: MeshMangalSide): string {
  const verdict = side.has_dosha
    ? "afflicted — net dosha under at least one reference"
    : "clear — no net dosha under any reference";
  const refs = side.references.map(mangalReferenceClause).join("; ");
  return `- ${label}: ${verdict} (${refs})`;
}

function mangalMutualLine(match: MeshMangalMatch, other: string): string {
  const mutual = match.mutually_cancelled
    ? "yes — dosha neutralized between the charts"
    : "no";
  const compatible = match.compatible ? "yes" : "no";
  return (
    `- Mutual cancellation: ${mutual}; compatible: ${compatible} ` +
    `(engine basis: ${match.basis}; chart a = you, chart b = ${other})`
  );
}

function mangalSection(edge: SanitizedMeshEdge, other: string): string {
  const match = edge.mangal_match;
  return [
    "Mangal (Kuja) dosha screening:",
    mangalSideLine("you", match.a),
    mangalSideLine(other, match.b),
    mangalMutualLine(match, other),
    `- Screening convention: ${match.a.convention}`,
  ].join("\n");
}

// --- overlay (strongest engine contacts, both directions) --------------------

const KIND_RANK: Record<MeshContactKind, number> = {
  close_conjunction: 0,
  same_sign: 1,
  graha_drishti: 2,
};

/** Engine-kind-first, then tightest orb (nulls last). Pure presentation order. */
function contactOrder(a: MeshOverlayContact, b: MeshOverlayContact): number {
  const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (byKind !== 0) {
    return byKind;
  }
  return (a.orb_degrees ?? Number.POSITIVE_INFINITY) - (b.orb_degrees ?? Number.POSITIVE_INFINITY);
}

interface DirectionVoice {
  /** "Your spouse's grahas in your chart" */
  readonly heading: string;
  /** "your" / "their" — whose natal points and houses are being touched. */
  readonly hostPossessive: string;
}

function contactLine(contact: MeshOverlayContact, voice: DirectionVoice): string {
  const orb = contact.orb_degrees === null ? "" : `, orb ${contact.orb_degrees.toFixed(2)}°`;
  const heuristic = contact.heuristic ? "; modern orb convention" : "";
  return (
    `- ${contact.planet} ${contact.kind} ${voice.hostPossessive} natal ${contact.target} ` +
    `(in ${voice.hostPossessive} ${ordinal(contact.host_house)} house${orb}${heuristic})`
  );
}

function directionLines(overlay: MeshChartOverlay, voice: DirectionVoice): string[] {
  const ranked = [...overlay.contacts].sort(contactOrder);
  const shown = ranked.slice(0, CONTACT_CAP);
  const lines = [
    `${voice.heading} (${voice.hostPossessive} lagna ${overlay.host_lagna_sign}):`,
    ...(shown.length > 0 ? shown.map((c) => contactLine(c, voice)) : ["- no engine contacts"]),
  ];
  if (ranked.length > CONTACT_CAP) {
    lines.push(`(+${ranked.length - CONTACT_CAP} more engine contacts not listed)`);
  }
  return lines;
}

function overlaySection(edge: SanitizedMeshEdge, other: string): string {
  return [
    "Chart-on-chart overlay (strongest engine contacts first):",
    ...directionLines(edge.overlay.b_in_a, {
      heading: `${capitalize(other)}'s grahas in your chart`,
      hostPossessive: "your",
    }),
    ...directionLines(edge.overlay.a_in_b, {
      heading: `Your grahas in ${other}'s chart`,
      hostPossessive: "their",
    }),
    `- Overlay convention: ${edge.overlay.b_in_a.convention}`,
  ].join("\n");
}

// --- dasha synchrony ----------------------------------------------------------

function segmentLine(
  segment: SanitizedSynchrony["segments"][number],
  other: string,
): string {
  const shared =
    segment.shared_lords.length > 0
      ? ` — shared lord(s): ${segment.shared_lords.join(", ")}`
      : "";
  const boundary = segment.simultaneous_boundary ? " (simultaneous dasha boundary)" : "";
  return (
    `- ${segment.start_month} -> ${segment.end_month}: you in ` +
    `${segment.a_maha}/${segment.a_antar}, ${other} in ` +
    `${segment.b_maha}/${segment.b_antar}${shared}${boundary}`
  );
}

function conventionLine(synchrony: SanitizedSynchrony, other: string): string {
  return (
    `- Dasha-year convention: ${synchrony.convention_a} (you) / ` +
    `${synchrony.convention_b} (${other}) (engine-declared)`
  );
}

function synchronySection(edge: SanitizedMeshEdge, other: string): string {
  const sync = edge.synchrony;
  const window = `${sync.window_start_month} -> ${sync.window_end_month}`;
  return [
    `Joint dasha timing (engine-dated, month precision; window ${window}):`,
    ...(sync.segments.length > 0
      ? sync.segments.map((s) => segmentLine(s, other))
      : ["- no dated segments in the window"]),
    conventionLine(sync, other),
  ].join("\n");
}

// --- relationship significators ----------------------------------------------

/** "jupiter in Gemini (house 1), neutral, retrograde" — verbatim condition. */
function conditionText(condition: MeshGrahaCondition): string {
  const parts = [
    `${condition.planet} in ${condition.sign} (house ${condition.house})`,
    condition.dignity,
  ];
  if (condition.is_retrograde) {
    parts.push("retrograde");
  }
  if (condition.is_combust) {
    parts.push("combust");
  }
  return parts.join(", ");
}

function significatorLines(label: string, sig: MeshRelationSignificators): string[] {
  const occupants = sig.occupants.length > 0 ? sig.occupants.join(", ") : "none";
  const head =
    `- ${capitalize(label)}: house ${sig.karaka_house} (${sig.house_basis}) — ` +
    `${sig.house_sign}, lord ${sig.house_lord}; lord condition: ` +
    `${conditionText(sig.lord_condition)}; occupants: ${occupants}`;
  const karakas = sig.karakas.map(
    (k) => `  - karaka: ${conditionText(k.condition)} [${k.source}]`,
  );
  return [head, ...karakas];
}

function significatorsSection(edge: SanitizedMeshEdge, other: string): string {
  return [
    "Relationship significators (classical house + karaka corroboration):",
    ...significatorLines("you", edge.significators_a),
    ...significatorLines(other, edge.significators_b),
  ].join("\n");
}

// --- the block ------------------------------------------------------------

function relationshipSection(edge: SanitizedMeshEdge, other: string): string {
  return [
    `Relationship: you and ${other} (classical Melapaka table roles: ` +
      `you = ${edge.role_a}, ${other} = ${edge.role_b}).`,
    `Engine integrity: ${edge.integrity_note}`,
  ].join("\n");
}

/**
 * Serialize a sanitized mesh edge into ONE delimited engine-facts block, or ""
 * when no edge is present — so prompts without a relationship context stay
 * byte-identical to the single-chart output.
 *
 * `relationship` overrides the role vocabulary (the subject is always "you";
 * the other person is their relationship phrase); it defaults to the edge's own
 * engine-stated relationship.
 */
export function buildMeshFactsBlock(
  edge?: SanitizedMeshEdge | null,
  relationship?: MeshRelationship,
): string {
  if (!edge) {
    return "";
  }
  const { other } = meshRoleLabels(relationship ?? edge.relationship);
  const sections = [
    relationshipSection(edge, other),
    ashtakootaSection(edge),
    mangalSection(edge, other),
    overlaySection(edge, other),
    synchronySection(edge, other),
    significatorsSection(edge, other),
  ];
  return [MESH_BLOCK_START, meshGuard(other), "", sections.join("\n\n"), MESH_BLOCK_END].join(
    "\n",
  );
}
