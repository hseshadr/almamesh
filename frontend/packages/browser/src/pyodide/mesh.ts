// TS mirror of the Python relational MESH edge as emitted by
// `model_dump(mode="json")`:
//
//   MeshEdgeContext   backend/src/almamesh/schemas/mesh.py
//
// INTEGRITY FRAME (mirrors the backend docstring): the mesh edge is computed
// FROM two finished natal charts (read-only inputs); neither chart is
// recomputed, reweighted or mutated by the other. The worker recomputes both
// natal contexts on-device from the bare birth inputs — no chart crosses the
// worker boundary.
//
// Same conventions as ./predictive.ts: open-vocabulary enum fields (planet /
// sign / nakshatra names) are typed `string` at this JSON boundary; the SMALL
// closed sets the schemas document ("closed sets serialized as their .value")
// are typed as literal unions so the contract is self-describing. Datetimes
// are ISO-8601 UTC strings.

import type { DashaYearConvention } from "./predictive";

// --- closed-set enum values (serialized `.value`s of the Python enums) ---

/** Explicit Melapaka role — the caller states who is whom, never the engine. */
export type MatchRole = "bride" | "groom";

/**
 * The relation kinds the mesh edge models (closed set). Byte-aligned with the
 * frontend's `MemberRelationship` vocabulary (`@almamesh/shared-types`).
 */
export type MeshRelationship =
  | "spouse"
  | "partner"
  | "mother"
  | "father"
  | "child"
  | "sibling"
  | "friend"
  | "business";

/** The eight kootas of Ashtakoota Guna Milan (1+2+3+4+5+6+7+8 = 36). */
export type KootaName =
  | "varna"
  | "vashya"
  | "tara"
  | "yoni"
  | "graha_maitri"
  | "gana"
  | "bhakoot"
  | "nadi";

/** Classical-convention reading of the /36 total (labels, not verdicts). */
export type CompatibilityBand = "not_recommended" | "average" | "good" | "excellent";

/** The dosha flags Guna Milan raises (closed set). */
export type MeshDoshaName = "bhakoot_dosha" | "nadi_dosha";

/** Reference point Mars's dosha houses are counted from (per school). */
export type MangalReference = "lagna" | "moon" | "venus";

/** How a guest graha touches a host natal point in the overlay. */
export type ContactKind = "close_conjunction" | "same_sign" | "graha_drishti";

/** A host chart's natal points the overlay targets (lagna + 9 grahas). */
export type NatalPoint =
  | "lagna"
  | "sun"
  | "moon"
  | "mars"
  | "mercury"
  | "jupiter"
  | "venus"
  | "saturn"
  | "rahu"
  | "ketu";

// --- Ashtakoota Guna Milan ---

/** The Moon facts Guna Milan reads — verbatim from the natal context. */
export interface MoonSummary {
  readonly nakshatra: string;
  readonly nakshatra_index: number;
  readonly nakshatra_pada: number;
  readonly sign: string;
  readonly sign_degrees: number;
}

/** One koota's score with its human-readable basis and table citation. */
export interface KootaResult {
  readonly koota: KootaName;
  readonly earned: number;
  readonly maximum: number;
  readonly basis: string;
  readonly source: string;
}

/** A classical cancellation rule that fired, with its citation. */
export interface DoshaCancellation {
  readonly rule: string;
  readonly description: string;
  readonly source: string;
}

/** A dosha verdict: present / cancelled, with the rules that decided it. */
export interface DoshaFlag {
  readonly name: MeshDoshaName;
  readonly present: boolean;
  readonly cancelled: boolean;
  readonly cancellations: readonly DoshaCancellation[];
  readonly basis: string;
  readonly source: string;
}

/** The full 8-koota / 36-guna Melapaka match between two Moons. */
export interface AshtakootaResult {
  readonly bride_moon: MoonSummary;
  readonly groom_moon: MoonSummary;
  readonly kootas: readonly KootaResult[];
  readonly total: number;
  readonly maximum: number;
  readonly band: CompatibilityBand;
  readonly band_basis: string;
  readonly bhakoot_dosha: DoshaFlag;
  readonly nadi_dosha: DoshaFlag;
  readonly source: string;
}

// --- Mangal (Kuja) dosha ---

/** Mars's dosha verdict counted from ONE reference point (one school). */
export interface MangalReferenceResult {
  readonly reference: MangalReference;
  readonly school: string;
  readonly mars_sign: string;
  readonly mars_house: number;
  readonly in_dosha_house: boolean;
  readonly cancellations: readonly DoshaCancellation[];
  readonly net_dosha: boolean;
  readonly source: string;
}

/** Mangal dosha for one chart across the three classical references. */
export interface MangalDoshaResult {
  readonly references: readonly MangalReferenceResult[];
  readonly has_dosha: boolean;
  readonly convention: string;
}

/** Mutual Mangal-dosha comparison between two charts. */
export interface DoshaMatchResult {
  readonly a: MangalDoshaResult;
  readonly b: MangalDoshaResult;
  readonly mutually_cancelled: boolean;
  readonly compatible: boolean;
  readonly basis: string;
  readonly source: string;
}

// --- Overlay (one chart's grahas on the other's houses/points) ---

/** A guest graha placed (read-only) into a host whole-sign house. */
export interface OverlayPlacement {
  readonly planet: string;
  readonly sign: string;
  readonly host_house: number;
}

/** One guest-graha -> host-natal-point contact. */
export interface OverlayContact {
  readonly planet: string;
  readonly target: NatalPoint;
  readonly kind: ContactKind;
  readonly host_house: number;
  readonly orb_degrees: number | null;
  readonly heuristic: boolean;
  readonly source: string;
}

/** Guest grahas overlaid on a host chart: placements + typed contacts. */
export interface ChartOverlay {
  readonly host_lagna_sign: string;
  readonly placements: readonly OverlayPlacement[];
  readonly contacts: readonly OverlayContact[];
  readonly conjunction_orb_degrees: number;
  readonly convention: string;
}

/** Both overlay directions for a pair of charts. */
export interface OverlayPair {
  readonly b_in_a: ChartOverlay;
  readonly a_in_b: ChartOverlay;
}

// --- Dasha synchrony ---

/** One window slice where both charts' maha+antar legs are constant. */
export interface SynchronySegment {
  readonly start: string;
  readonly end: string;
  readonly a_maha: string;
  readonly a_antar: string;
  readonly b_maha: string;
  readonly b_antar: string;
  readonly shared_lords: readonly string[];
  readonly simultaneous_boundary: boolean;
}

/** Two charts' dated Vimshottari timelines joined over an explicit window. */
export interface DashaSynchronyResult {
  readonly window_start: string;
  readonly window_end: string;
  readonly segments: readonly SynchronySegment[];
  readonly convention_a: DashaYearConvention;
  readonly convention_b: DashaYearConvention;
  readonly basis: string;
}

// --- Relation significators ---

/** A graha's observable natal condition (verbatim engine facts). */
export interface GrahaCondition {
  readonly planet: string;
  readonly sign: string;
  readonly house: number;
  readonly dignity: string;
  readonly is_retrograde: boolean;
  readonly is_combust: boolean;
}

/** One karaka graha's condition, with the karakatva citation. */
export interface KarakaAssessment {
  readonly condition: GrahaCondition;
  readonly source: string;
}

/** The classical house + karaka corroboration for one relation, one chart. */
export interface RelationSignificators {
  readonly relationship: MeshRelationship;
  readonly karaka_house: number;
  readonly house_basis: string;
  readonly house_sign: string;
  readonly house_lord: string;
  readonly lord_condition: GrahaCondition;
  readonly occupants: readonly string[];
  readonly karakas: readonly KarakaAssessment[];
}

// --- the mesh edge bundle: backend almamesh/mesh/edge.py ---

/**
 * The full relation context between two READ-ONLY natal charts — the exact
 * `model_dump(mode="json")` of the backend `MeshEdgeContext`. `a` is the first
 * birth input of the request and `b` the second (`significators_a` belongs to
 * `a`, `b_in_a` overlays b's grahas on a's houses, and so on).
 */
export interface MeshEdgeContext {
  readonly relationship: MeshRelationship;
  readonly role_a: MatchRole;
  readonly role_b: MatchRole;
  readonly ashtakoota: AshtakootaResult;
  readonly mangal_match: DoshaMatchResult;
  readonly overlay: OverlayPair;
  readonly synchrony: DashaSynchronyResult;
  readonly significators_a: RelationSignificators;
  readonly significators_b: RelationSignificators;
  readonly integrity_note: string;
}
