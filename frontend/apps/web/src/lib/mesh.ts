/**
 * lib/mesh — pure display helpers behind the Mesh surfaces (`/mesh`,
 * `/mesh/:memberId`).
 *
 * Scope (deliberately narrow): constellation geometry, explicit window
 * arithmetic, chart-library presence reads and verbatim field selection over
 * the engine's `MeshEdgeCtx`. NO astrology lives here — every score, contact,
 * dosha and date is the engine's own output; the only numeric work is display
 * rounding and calendar addition for the synchrony window bounds.
 */

import type { StoredChart } from '@almamesh/store';
import type { MeshEdgeWindow } from '@almamesh/store';
import type {
  AshtakootaData,
  KootaName,
  KootaResultData,
  MatchRole,
  MemberRelationship,
  MeshMoonData,
  OverlayContactData,
  OverlayContactKind,
} from '@almamesh/shared-types';

// ---------------------------------------------------------------------------
// Constellation geometry
// ---------------------------------------------------------------------------

/** One node's position on the constellation canvas, in percent coordinates. */
export interface RadialNodePosition {
  readonly xPct: number;
  readonly yPct: number;
}

/** Orbit radius as a percentage of the (square) constellation canvas. */
const ORBIT_RADIUS_PCT = 38;

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Even placement of `count` member nodes on the orbit circle, starting at the
 * top (12 o'clock) and proceeding clockwise. Percent coordinates so the SVG
 * edge lines and the HTML node overlays share one coordinate space.
 */
export function radialNodeLayout(count: number): RadialNodePosition[] {
  return Array.from({ length: count }, (_, index) => {
    const radians = ((-90 + (360 / count) * index) * Math.PI) / 180;
    return {
      xPct: roundPct(50 + ORBIT_RADIUS_PCT * Math.cos(radians)),
      yPct: roundPct(50 + ORBIT_RADIUS_PCT * Math.sin(radians)),
    };
  });
}

// ---------------------------------------------------------------------------
// Explicit synchrony window (never a silent wall clock)
// ---------------------------------------------------------------------------

/** The selectable synchrony spans (years ahead of the reference instant). */
export const MESH_WINDOW_YEARS = [1, 2, 5] as const;
export type MeshWindowYears = (typeof MESH_WINDOW_YEARS)[number];

/** Default span: now → +2 years. */
export const DEFAULT_MESH_WINDOW_YEARS: MeshWindowYears = 2;

/** Which person the classical bride-table rules read for (no gender guessed). */
export type BrideTableSide = 'anchor' | 'member';

/** Add whole UTC years to an ISO instant (plain calendar arithmetic). */
export function addYearsIso(iso: string, years: number): string {
  const date = new Date(iso);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Build the store's `MeshEdgeWindow` from a pinned reference instant, a span
 * choice and the bride-table seat. Roles are EXPLICIT (the engine never
 * guesses); `brideSide` is plain-language UI state, mapped here once.
 */
export function meshEdgeWindow(
  referenceInstant: string,
  years: MeshWindowYears,
  brideSide: BrideTableSide,
): MeshEdgeWindow {
  const anchorRole: MatchRole = brideSide === 'anchor' ? 'bride' : 'groom';
  const memberRole: MatchRole = brideSide === 'anchor' ? 'groom' : 'bride';
  return {
    start: referenceInstant,
    end: addYearsIso(referenceInstant, years),
    referenceInstant,
    anchorRole,
    memberRole,
  };
}

// ---------------------------------------------------------------------------
// Relationship curation (a design-integrity rule, not a style choice)
// ---------------------------------------------------------------------------

/**
 * Ashtakoota + Mangal are MARRIAGE-matching tables; they render only for
 * spouse/partner edges. Family/friend/business edges lead with Graha Maitri
 * (the one koota that generalizes), overlay, synchrony and significators.
 */
export function isMarriageEdge(relationship: MemberRelationship): boolean {
  return relationship === 'spouse' || relationship === 'partner';
}

// ---------------------------------------------------------------------------
// Chart-library reads (presence + verbatim lagna)
// ---------------------------------------------------------------------------

/**
 * The stored chart backing a profile (primary first) — mirrors how the mesh
 * store resolves each side's birth input, so the page's "needs a chart" gate
 * agrees with what `ensureMeshEdge` will actually find.
 */
export function profileChartOf(
  charts: Readonly<Record<string, StoredChart>>,
  profileId: string,
): StoredChart | undefined {
  const own = Object.values(charts).filter((chart) => chart.profile_id === profileId);
  return own.find((chart) => chart.is_primary) ?? own[0];
}

/** True when the profile has a generated chart with the fields an edge needs. */
export function hasBirthChart(
  charts: Readonly<Record<string, StoredChart>>,
  profileId: string,
): boolean {
  const birth = profileChartOf(charts, profileId)?.birth_data;
  return Boolean(birth?.birth_datetime_utc && birth.birth_location_details);
}

/** Display-only: the chart's engine-emitted rising sign as a lowercase token. */
export function lagnaSignOf(chart: StoredChart | undefined): string | undefined {
  const lagna = chart?.astronomical_calculations?.sidereal_ctx?.lagna;
  const sign = lagna?.sign;
  return typeof sign === 'string' && sign.length > 0 ? sign.toLowerCase() : undefined;
}

// ---------------------------------------------------------------------------
// Verbatim selection over the engine edge (ordering for display only)
// ---------------------------------------------------------------------------

/** Display order of contact kinds: conjunctions, then dṛṣṭi, then sign shares. */
const CONTACT_KIND_ORDER: Record<OverlayContactKind, number> = {
  close_conjunction: 0,
  graha_drishti: 1,
  same_sign: 2,
};

/**
 * The "strongest contacts" list: engine contacts re-ORDERED (kind, then
 * tightest orb) and capped for the card — every row stays verbatim.
 */
export function strongestContacts(
  contacts: readonly OverlayContactData[],
  limit = 6,
): OverlayContactData[] {
  return [...contacts]
    .sort(
      (a, b) =>
        CONTACT_KIND_ORDER[a.kind] - CONTACT_KIND_ORDER[b.kind] ||
        (a.orb_degrees ?? Number.POSITIVE_INFINITY) - (b.orb_degrees ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, limit);
}

/** Pull one koota row (e.g. Graha Maitri leads the non-marriage edges). */
export function kootaOf(
  ashtakoota: AshtakootaData,
  name: KootaName,
): KootaResultData | undefined {
  return ashtakoota.kootas.find((koota) => koota.koota === name);
}

/**
 * Resolve which Moon belongs to the anchor vs the member through the edge's
 * EXPLICIT roles (`role_a` is the anchor's). The UI never says "bride"/"groom"
 * about a person — it says "you" and the member's name.
 */
export function moonsByRole(
  anchorRole: MatchRole,
  ashtakoota: Pick<AshtakootaData, 'bride_moon' | 'groom_moon'>,
): { anchorMoon: MeshMoonData; memberMoon: MeshMoonData } {
  const anchorIsBride = anchorRole === 'bride';
  return {
    anchorMoon: anchorIsBride ? ashtakoota.bride_moon : ashtakoota.groom_moon,
    memberMoon: anchorIsBride ? ashtakoota.groom_moon : ashtakoota.bride_moon,
  };
}

/** Engine orb (degrees, full precision) → one display decimal. */
export function formatOrbDegrees(orb: number): string {
  return orb.toFixed(1);
}

/** Engine "Purva_Bhadrapada" → "Purva Bhadrapada" (proper noun, untranslated). */
export function prettyNakshatra(nakshatra: string): string {
  return nakshatra.replace(/_/g, ' ').trim();
}
