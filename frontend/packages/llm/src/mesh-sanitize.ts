// The PAIR privacy boundary. Extends the sanitize layer (./sanitize.ts) to a
// relationship edge between TWO charts: the only mesh data permitted to leave
// the device in a narration call passes through here first.
//
// Contract (same philosophy as `sanitizeChartForLlm`, applied to a pair):
//   - Allowlist rebuild at EVERY level: each nested shape is reconstructed
//     field-by-field, so any identifier a caller layered on (names, chart ids,
//     birth datetimes/places, timestamps — for EITHER person) is dropped by
//     construction, never by a fragile denylist.
//   - The dasha-synchrony window and segments are the only date-bearing fields;
//     their absolute ISO datetimes are reduced to MONTH precision ("YYYY-MM") —
//     the established outbound granularity of the natal sanitizer's dasha tree
//     and predictive contexts.
//   - Names are replaced by ROLES: the mesh edge never carries names by
//     construction, and `meshRoleLabels` is the single vocabulary downstream
//     prompts/facts use — the subject is "you", the other person is their
//     relationship ("your spouse", "your mother", …).
//   - All astrological content passes: kootas, doshas + cancellations, mangal
//     references, overlay placements/contacts, significators, citations.

import type {
  MeshAshtakoota,
  MeshChartOverlay,
  MeshDoshaCancellation,
  MeshDoshaFlag,
  MeshEdgeContext,
  MeshGrahaCondition,
  MeshKarakaAssessment,
  MeshKootaResult,
  MeshMangalMatch,
  MeshMangalReferenceResult,
  MeshMangalSide,
  MeshMatchRole,
  MeshMoonSummary,
  MeshOverlayContact,
  MeshOverlayPair,
  MeshOverlayPlacement,
  MeshRelationSignificators,
  MeshRelationship,
  MeshSynchrony,
  MeshSynchronySegment,
} from "./mesh-types";

// --- sanitized shapes. Sub-shapes that carry no dates keep the raw field set
// (rebuilt, not passed by reference); the synchrony shapes swap their absolute
// ISO datetimes for month-precision fields. ---

/** One synchrony slice at the LLM-bound month precision ("YYYY-MM"). */
export interface SanitizedSynchronySegment {
  readonly start_month: string;
  readonly end_month: string;
  readonly a_maha: string;
  readonly a_antar: string;
  readonly b_maha: string;
  readonly b_antar: string;
  readonly shared_lords: readonly string[];
  readonly simultaneous_boundary: boolean;
}

/** The joint dasha timeline after relativization: months only, no datetimes. */
export interface SanitizedSynchrony {
  readonly window_start_month: string;
  readonly window_end_month: string;
  readonly segments: readonly SanitizedSynchronySegment[];
  readonly convention_a: string;
  readonly convention_b: string;
  readonly basis: string;
}

/** The mesh edge as it leaves the device: identifier-free, month-precision. */
export interface SanitizedMeshEdge {
  readonly relationship: MeshRelationship;
  readonly role_a: MeshMatchRole;
  readonly role_b: MeshMatchRole;
  readonly ashtakoota: MeshAshtakoota;
  readonly mangal_match: MeshMangalMatch;
  readonly overlay: MeshOverlayPair;
  readonly synchrony: SanitizedSynchrony;
  readonly significators_a: MeshRelationSignificators;
  readonly significators_b: MeshRelationSignificators;
  readonly integrity_note: string;
}

// --- names -> roles. The single role vocabulary every downstream prompt and
// facts line uses; person names never exist on this side of the boundary. ---

export interface MeshRoleLabelPair {
  /** The reading's subject (chart A) — always addressed as "you". */
  readonly subject: string;
  /** The other person (chart B) — addressed by their relationship role. */
  readonly other: string;
}

const OTHER_ROLE: Record<MeshRelationship, string> = {
  spouse: "your spouse",
  partner: "your partner",
  mother: "your mother",
  father: "your father",
  child: "your child",
  sibling: "your sibling",
  friend: "your friend",
  business: "your business partner",
};

/** The role phrases that replace both people's names in every outbound string. */
export function meshRoleLabels(relationship: MeshRelationship): MeshRoleLabelPair {
  return { subject: "you", other: OTHER_ROLE[relationship] };
}

// --- allowlist rebuilders (one per engine shape, fields copied explicitly) ---

/** Reduce an ISO-8601 datetime to month precision ("YYYY-MM"). */
function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function rebuildMoon(moon: MeshMoonSummary): MeshMoonSummary {
  return {
    nakshatra: moon.nakshatra,
    nakshatra_index: moon.nakshatra_index,
    nakshatra_pada: moon.nakshatra_pada,
    sign: moon.sign,
    sign_degrees: moon.sign_degrees,
  };
}

function rebuildKoota(koota: MeshKootaResult): MeshKootaResult {
  return {
    koota: koota.koota,
    earned: koota.earned,
    maximum: koota.maximum,
    basis: koota.basis,
    source: koota.source,
  };
}

function rebuildCancellation(rule: MeshDoshaCancellation): MeshDoshaCancellation {
  return { rule: rule.rule, description: rule.description, source: rule.source };
}

function rebuildDoshaFlag(flag: MeshDoshaFlag): MeshDoshaFlag {
  return {
    name: flag.name,
    present: flag.present,
    cancelled: flag.cancelled,
    cancellations: flag.cancellations.map(rebuildCancellation),
    basis: flag.basis,
    source: flag.source,
  };
}

function rebuildAshtakoota(ashtakoota: MeshAshtakoota): MeshAshtakoota {
  return {
    bride_moon: rebuildMoon(ashtakoota.bride_moon),
    groom_moon: rebuildMoon(ashtakoota.groom_moon),
    kootas: ashtakoota.kootas.map(rebuildKoota),
    total: ashtakoota.total,
    maximum: ashtakoota.maximum,
    band: ashtakoota.band,
    band_basis: ashtakoota.band_basis,
    bhakoot_dosha: rebuildDoshaFlag(ashtakoota.bhakoot_dosha),
    nadi_dosha: rebuildDoshaFlag(ashtakoota.nadi_dosha),
    source: ashtakoota.source,
  };
}

function rebuildMangalReference(ref: MeshMangalReferenceResult): MeshMangalReferenceResult {
  return {
    reference: ref.reference,
    school: ref.school,
    mars_sign: ref.mars_sign,
    mars_house: ref.mars_house,
    in_dosha_house: ref.in_dosha_house,
    cancellations: ref.cancellations.map(rebuildCancellation),
    net_dosha: ref.net_dosha,
    source: ref.source,
  };
}

function rebuildMangalSide(side: MeshMangalSide): MeshMangalSide {
  return {
    references: side.references.map(rebuildMangalReference),
    has_dosha: side.has_dosha,
    convention: side.convention,
  };
}

function rebuildMangalMatch(match: MeshMangalMatch): MeshMangalMatch {
  return {
    a: rebuildMangalSide(match.a),
    b: rebuildMangalSide(match.b),
    mutually_cancelled: match.mutually_cancelled,
    compatible: match.compatible,
    basis: match.basis,
    source: match.source,
  };
}

function rebuildPlacement(placement: MeshOverlayPlacement): MeshOverlayPlacement {
  return { planet: placement.planet, sign: placement.sign, host_house: placement.host_house };
}

function rebuildContact(contact: MeshOverlayContact): MeshOverlayContact {
  return {
    planet: contact.planet,
    target: contact.target,
    kind: contact.kind,
    host_house: contact.host_house,
    orb_degrees: contact.orb_degrees,
    heuristic: contact.heuristic,
    source: contact.source,
  };
}

function rebuildOverlayDirection(overlay: MeshChartOverlay): MeshChartOverlay {
  return {
    host_lagna_sign: overlay.host_lagna_sign,
    placements: overlay.placements.map(rebuildPlacement),
    contacts: overlay.contacts.map(rebuildContact),
    conjunction_orb_degrees: overlay.conjunction_orb_degrees,
    convention: overlay.convention,
  };
}

function rebuildOverlay(overlay: MeshOverlayPair): MeshOverlayPair {
  return {
    b_in_a: rebuildOverlayDirection(overlay.b_in_a),
    a_in_b: rebuildOverlayDirection(overlay.a_in_b),
  };
}

/** The one shape that changes: absolute datetimes -> month precision. */
function sanitizeSegment(segment: MeshSynchronySegment): SanitizedSynchronySegment {
  return {
    start_month: monthOf(segment.start),
    end_month: monthOf(segment.end),
    a_maha: segment.a_maha,
    a_antar: segment.a_antar,
    b_maha: segment.b_maha,
    b_antar: segment.b_antar,
    shared_lords: [...segment.shared_lords],
    simultaneous_boundary: segment.simultaneous_boundary,
  };
}

function sanitizeSynchrony(synchrony: MeshSynchrony): SanitizedSynchrony {
  return {
    window_start_month: monthOf(synchrony.window_start),
    window_end_month: monthOf(synchrony.window_end),
    segments: synchrony.segments.map(sanitizeSegment),
    convention_a: synchrony.convention_a,
    convention_b: synchrony.convention_b,
    basis: synchrony.basis,
  };
}

function rebuildCondition(condition: MeshGrahaCondition): MeshGrahaCondition {
  return {
    planet: condition.planet,
    sign: condition.sign,
    house: condition.house,
    dignity: condition.dignity,
    is_retrograde: condition.is_retrograde,
    is_combust: condition.is_combust,
  };
}

function rebuildKaraka(karaka: MeshKarakaAssessment): MeshKarakaAssessment {
  return { condition: rebuildCondition(karaka.condition), source: karaka.source };
}

function rebuildSignificators(sig: MeshRelationSignificators): MeshRelationSignificators {
  return {
    relationship: sig.relationship,
    karaka_house: sig.karaka_house,
    house_basis: sig.house_basis,
    house_sign: sig.house_sign,
    house_lord: sig.house_lord,
    lord_condition: rebuildCondition(sig.lord_condition),
    occupants: [...sig.occupants],
    karakas: sig.karakas.map(rebuildKaraka),
  };
}

/**
 * Sanitize an engine `MeshEdgeContext` before it is sent to any LLM endpoint.
 *
 * Pure: returns a fresh object and never mutates `edge`. Deterministic — the
 * synchrony months are verbatim truncations of the engine's own dates, so no
 * clock is involved.
 */
export function sanitizeMeshEdgeForLlm(edge: MeshEdgeContext): SanitizedMeshEdge {
  return {
    relationship: edge.relationship,
    role_a: edge.role_a,
    role_b: edge.role_b,
    ashtakoota: rebuildAshtakoota(edge.ashtakoota),
    mangal_match: rebuildMangalMatch(edge.mangal_match),
    overlay: rebuildOverlay(edge.overlay),
    synchrony: sanitizeSynchrony(edge.synchrony),
    significators_a: rebuildSignificators(edge.significators_a),
    significators_b: rebuildSignificators(edge.significators_b),
    integrity_note: edge.integrity_note,
  };
}
