// The RAW engine shape of a mesh relationship edge — the exact serialized JSON
// of `backend/src/almamesh/schemas/mesh.py::MeshEdgeContext` (Pydantic, frozen).
//
// Declared LOCALLY (not imported from @almamesh/shared-types) on purpose: this
// package's boundary types mirror the engine's own emitted shape, exactly like
// the predictive facts code against the engine's `SiderealChart` — so the LLM
// layer never depends on the UI-contract package's release timing. If the
// shared-types `MeshEdgeCtx` lands with the same shape (it serializes the same
// engine model), the two are structurally compatible by construction.
//
// Everything here is READ-ONLY input: the engine computes relations FROM two
// finished natal charts and never mutates either (see `integrity_note`).

/** The relation kinds the mesh engine models (closed set, engine-spelled). */
export type MeshRelationship =
  | "spouse"
  | "partner"
  | "mother"
  | "father"
  | "child"
  | "sibling"
  | "friend"
  | "business";

/** Classical Melapaka table role assignment (the engine never guesses). */
export type MeshMatchRole = "bride" | "groom";

/** How a guest graha touches a host natal point in the overlay (closed set). */
export type MeshContactKind = "close_conjunction" | "same_sign" | "graha_drishti";

/** Reference point Mars's dosha houses are counted from (per school). */
export type MeshMangalReference = "lagna" | "moon" | "venus";

/** The Moon facts Guna Milan reads — verbatim from the natal context. */
export interface MeshMoonSummary {
  readonly nakshatra: string;
  readonly nakshatra_index: number;
  readonly nakshatra_pada: number;
  readonly sign: string;
  readonly sign_degrees: number;
}

/** One koota's score with its human-readable basis and table citation. */
export interface MeshKootaResult {
  readonly koota: string;
  readonly earned: number;
  readonly maximum: number;
  readonly basis: string;
  readonly source: string;
}

/** A classical cancellation rule that fired, with its citation. */
export interface MeshDoshaCancellation {
  readonly rule: string;
  readonly description: string;
  readonly source: string;
}

/** A dosha verdict: present / cancelled, with the rules that decided it. */
export interface MeshDoshaFlag {
  readonly name: string;
  readonly present: boolean;
  readonly cancelled: boolean;
  readonly cancellations: readonly MeshDoshaCancellation[];
  readonly basis: string;
  readonly source: string;
}

/** The full 8-koota / 36-guna Melapaka match between two Moons. */
export interface MeshAshtakoota {
  readonly bride_moon: MeshMoonSummary;
  readonly groom_moon: MeshMoonSummary;
  readonly kootas: readonly MeshKootaResult[];
  readonly total: number;
  readonly maximum: number;
  readonly band: string;
  readonly band_basis: string;
  readonly bhakoot_dosha: MeshDoshaFlag;
  readonly nadi_dosha: MeshDoshaFlag;
  readonly source: string;
}

/** Mars's dosha verdict counted from ONE reference point (one school). */
export interface MeshMangalReferenceResult {
  readonly reference: MeshMangalReference;
  readonly school: string;
  readonly mars_sign: string;
  readonly mars_house: number;
  readonly in_dosha_house: boolean;
  readonly cancellations: readonly MeshDoshaCancellation[];
  readonly net_dosha: boolean;
  readonly source: string;
}

/** Mangal dosha for one chart across the three classical references. */
export interface MeshMangalSide {
  readonly references: readonly MeshMangalReferenceResult[];
  readonly has_dosha: boolean;
  readonly convention: string;
}

/** Mutual Mangal-dosha comparison between the two charts. */
export interface MeshMangalMatch {
  readonly a: MeshMangalSide;
  readonly b: MeshMangalSide;
  readonly mutually_cancelled: boolean;
  readonly compatible: boolean;
  readonly basis: string;
  readonly source: string;
}

/** A guest graha placed (read-only) into a host whole-sign house. */
export interface MeshOverlayPlacement {
  readonly planet: string;
  readonly sign: string;
  readonly host_house: number;
}

/** One guest-graha -> host-natal-point contact. */
export interface MeshOverlayContact {
  readonly planet: string;
  readonly target: string;
  readonly kind: MeshContactKind;
  readonly host_house: number;
  readonly orb_degrees: number | null;
  readonly heuristic: boolean;
  readonly source: string;
}

/** Guest grahas overlaid on a host chart: placements + typed contacts. */
export interface MeshChartOverlay {
  readonly host_lagna_sign: string;
  readonly placements: readonly MeshOverlayPlacement[];
  readonly contacts: readonly MeshOverlayContact[];
  readonly conjunction_orb_degrees: number;
  readonly convention: string;
}

/** Both overlay directions for the pair. */
export interface MeshOverlayPair {
  readonly b_in_a: MeshChartOverlay;
  readonly a_in_b: MeshChartOverlay;
}

/**
 * One window slice where both charts' maha+antar legs are constant. The raw
 * engine dates are FULL ISO datetimes — the date-bearing leak vector the pair
 * sanitizer reduces to month precision before anything leaves the device.
 */
export interface MeshSynchronySegment {
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
export interface MeshSynchrony {
  readonly window_start: string;
  readonly window_end: string;
  readonly segments: readonly MeshSynchronySegment[];
  readonly convention_a: string;
  readonly convention_b: string;
  readonly basis: string;
}

/** A graha's observable natal condition (verbatim engine facts). */
export interface MeshGrahaCondition {
  readonly planet: string;
  readonly sign: string;
  readonly house: number;
  readonly dignity: string;
  readonly is_retrograde: boolean;
  readonly is_combust: boolean;
}

/** One karaka graha's condition, with the karakatva citation. */
export interface MeshKarakaAssessment {
  readonly condition: MeshGrahaCondition;
  readonly source: string;
}

/** The classical house + karaka corroboration for one relation, one chart. */
export interface MeshRelationSignificators {
  readonly relationship: MeshRelationship;
  readonly karaka_house: number;
  readonly house_basis: string;
  readonly house_sign: string;
  readonly house_lord: string;
  readonly lord_condition: MeshGrahaCondition;
  readonly occupants: readonly string[];
  readonly karakas: readonly MeshKarakaAssessment[];
}

/** The full relation context between two READ-ONLY natal charts. */
export interface MeshEdgeContext {
  readonly relationship: MeshRelationship;
  readonly role_a: MeshMatchRole;
  readonly role_b: MeshMatchRole;
  readonly ashtakoota: MeshAshtakoota;
  readonly mangal_match: MeshMangalMatch;
  readonly overlay: MeshOverlayPair;
  readonly synchrony: MeshSynchrony;
  readonly significators_a: MeshRelationSignificators;
  readonly significators_b: MeshRelationSignificators;
  readonly integrity_note: string;
}
