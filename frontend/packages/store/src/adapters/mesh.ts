// Pure translation layer for the engine's relational MESH edge
// (`@almamesh/browser` raw shape -> `@almamesh/shared-types` UI shape).
//
// Per the project rule, this RESHAPES AND RENAMES ONLY — no astrology is
// computed in TypeScript. The single transformation applied is the existing
// adapter convention: engine Title-Case zodiac signs ("Aries") become the
// UI's lowercase `ZodiacSign` ("aries"); planet names are already the
// canonical lowercase `PlanetName`; every number, citation, verdict and
// integrity note is verbatim.
//
// The adapter tolerates an absent input (returns undefined): older signed
// bundles do not emit the mesh edge at all.

import type {
  AshtakootaResult,
  ChartOverlay,
  DoshaCancellation,
  DoshaFlag,
  DoshaMatchResult,
  GrahaCondition,
  KarakaAssessment,
  KootaResult,
  MangalDoshaResult,
  MangalReferenceResult,
  MeshEdgeContext,
  MoonSummary,
  OverlayContact,
  OverlayPair,
  OverlayPlacement,
  RelationSignificators,
  SynchronySegment,
} from "@almamesh/browser/types";
import type {
  AshtakootaData,
  ChartOverlayData,
  DignityName,
  DoshaCancellationData,
  DoshaFlagData,
  DoshaMatchData,
  GrahaConditionData,
  KarakaAssessmentData,
  KootaResultData,
  MangalDoshaData,
  MangalReferenceData,
  MeshEdgeCtx,
  MeshMoonData,
  OverlayContactData,
  OverlayPairData,
  OverlayPlacementData,
  PlanetName,
  RelationSignificatorsData,
  SynchronySegmentData,
  ZodiacSign,
} from "@almamesh/shared-types";

/** Engine Title-Case sign ("Aries") -> the UI's lowercase `ZodiacSign`. */
function toUiSign(sign: string): ZodiacSign {
  return sign.toLowerCase() as ZodiacSign;
}

function asPlanet(name: string): PlanetName {
  return name as PlanetName;
}

// ---------------------------------------------------------------------------
// Ashtakoota
// ---------------------------------------------------------------------------

function toMoon(raw: MoonSummary): MeshMoonData {
  return {
    nakshatra: raw.nakshatra,
    nakshatra_index: raw.nakshatra_index,
    nakshatra_pada: raw.nakshatra_pada,
    sign: toUiSign(raw.sign),
    sign_degrees: raw.sign_degrees,
  };
}

function toKoota(raw: KootaResult): KootaResultData {
  return {
    koota: raw.koota,
    earned: raw.earned,
    maximum: raw.maximum,
    basis: raw.basis,
    source: raw.source,
  };
}

function toCancellation(raw: DoshaCancellation): DoshaCancellationData {
  return { rule: raw.rule, description: raw.description, source: raw.source };
}

function toDoshaFlag(raw: DoshaFlag): DoshaFlagData {
  return {
    name: raw.name,
    present: raw.present,
    cancelled: raw.cancelled,
    cancellations: raw.cancellations.map(toCancellation),
    basis: raw.basis,
    source: raw.source,
  };
}

function toAshtakoota(raw: AshtakootaResult): AshtakootaData {
  return {
    bride_moon: toMoon(raw.bride_moon),
    groom_moon: toMoon(raw.groom_moon),
    kootas: raw.kootas.map(toKoota),
    total: raw.total,
    maximum: raw.maximum,
    band: raw.band,
    band_basis: raw.band_basis,
    bhakoot_dosha: toDoshaFlag(raw.bhakoot_dosha),
    nadi_dosha: toDoshaFlag(raw.nadi_dosha),
    source: raw.source,
  };
}

// ---------------------------------------------------------------------------
// Mangal (Kuja) dosha
// ---------------------------------------------------------------------------

function toMangalReference(raw: MangalReferenceResult): MangalReferenceData {
  return {
    reference: raw.reference,
    school: raw.school,
    mars_sign: toUiSign(raw.mars_sign),
    mars_house: raw.mars_house,
    in_dosha_house: raw.in_dosha_house,
    cancellations: raw.cancellations.map(toCancellation),
    net_dosha: raw.net_dosha,
    source: raw.source,
  };
}

function toMangalDosha(raw: MangalDoshaResult): MangalDoshaData {
  return {
    references: raw.references.map(toMangalReference),
    has_dosha: raw.has_dosha,
    convention: raw.convention,
  };
}

function toDoshaMatch(raw: DoshaMatchResult): DoshaMatchData {
  return {
    a: toMangalDosha(raw.a),
    b: toMangalDosha(raw.b),
    mutually_cancelled: raw.mutually_cancelled,
    compatible: raw.compatible,
    basis: raw.basis,
    source: raw.source,
  };
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function toPlacement(raw: OverlayPlacement): OverlayPlacementData {
  return { planet: asPlanet(raw.planet), sign: toUiSign(raw.sign), host_house: raw.host_house };
}

function toContact(raw: OverlayContact): OverlayContactData {
  return {
    planet: asPlanet(raw.planet),
    target: raw.target,
    kind: raw.kind,
    host_house: raw.host_house,
    orb_degrees: raw.orb_degrees,
    heuristic: raw.heuristic,
    source: raw.source,
  };
}

function toOverlay(raw: ChartOverlay): ChartOverlayData {
  return {
    host_lagna_sign: toUiSign(raw.host_lagna_sign),
    placements: raw.placements.map(toPlacement),
    contacts: raw.contacts.map(toContact),
    conjunction_orb_degrees: raw.conjunction_orb_degrees,
    convention: raw.convention,
  };
}

function toOverlayPair(raw: OverlayPair): OverlayPairData {
  return { b_in_a: toOverlay(raw.b_in_a), a_in_b: toOverlay(raw.a_in_b) };
}

// ---------------------------------------------------------------------------
// Dasha synchrony
// ---------------------------------------------------------------------------

function toSegment(raw: SynchronySegment): SynchronySegmentData {
  return {
    start: raw.start,
    end: raw.end,
    a_maha: asPlanet(raw.a_maha),
    a_antar: asPlanet(raw.a_antar),
    b_maha: asPlanet(raw.b_maha),
    b_antar: asPlanet(raw.b_antar),
    shared_lords: raw.shared_lords.map(asPlanet),
    simultaneous_boundary: raw.simultaneous_boundary,
  };
}

// ---------------------------------------------------------------------------
// Relation significators
// ---------------------------------------------------------------------------

function toCondition(raw: GrahaCondition): GrahaConditionData {
  return {
    planet: asPlanet(raw.planet),
    sign: toUiSign(raw.sign),
    house: raw.house,
    dignity: raw.dignity as DignityName,
    is_retrograde: raw.is_retrograde,
    is_combust: raw.is_combust,
  };
}

function toKaraka(raw: KarakaAssessment): KarakaAssessmentData {
  return { condition: toCondition(raw.condition), source: raw.source };
}

function toSignificators(raw: RelationSignificators): RelationSignificatorsData {
  return {
    relationship: raw.relationship,
    karaka_house: raw.karaka_house,
    house_basis: raw.house_basis,
    house_sign: toUiSign(raw.house_sign),
    house_lord: asPlanet(raw.house_lord),
    lord_condition: toCondition(raw.lord_condition),
    occupants: raw.occupants.map(asPlanet),
    karakas: raw.karakas.map(toKaraka),
  };
}

// ---------------------------------------------------------------------------
// toMeshEdgeCtx
// ---------------------------------------------------------------------------

/**
 * Reshape the engine's `MeshEdgeContext` into the UI `MeshEdgeCtx`. Returns
 * undefined when the engine payload omits it (older bundles).
 */
export function toMeshEdgeCtx(raw: MeshEdgeContext | null | undefined): MeshEdgeCtx | undefined {
  if (!raw) return undefined;
  return {
    relationship: raw.relationship,
    role_a: raw.role_a,
    role_b: raw.role_b,
    ashtakoota: toAshtakoota(raw.ashtakoota),
    mangal_match: toDoshaMatch(raw.mangal_match),
    overlay: toOverlayPair(raw.overlay),
    synchrony: {
      window_start: raw.synchrony.window_start,
      window_end: raw.synchrony.window_end,
      segments: raw.synchrony.segments.map(toSegment),
      convention_a: raw.synchrony.convention_a,
      convention_b: raw.synchrony.convention_b,
      basis: raw.synchrony.basis,
    },
    significators_a: toSignificators(raw.significators_a),
    significators_b: toSignificators(raw.significators_b),
    integrity_note: raw.integrity_note,
  };
}
