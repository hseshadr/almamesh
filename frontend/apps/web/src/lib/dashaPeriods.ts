/**
 * dashaPeriods — PURE helpers behind the Vimśottarī period surfaces (the
 * Periods explorer on /predictive, the dashboard "now + next" line and the
 * report's antar/pratyantar tables).
 *
 * NO astrology is computed here. "Next" is literally the row after the current
 * one in an ENGINE-emitted, already-ordered sequence (a list lookup), and
 * `durationParts` re-expresses the engine's `duration_years` float in calendar
 * units for display (the exact engine dates are always rendered beside it).
 *
 * The structural types below are the superset BOTH engine payload shapes
 * satisfy — `DashaPeriod` (`@almamesh/browser/types`) and `DashaData`
 * (`@almamesh/shared-types`) — including the period-depth fields
 * (`antar_sequence` on a mahā row, `pratyantar_sequence` on the ctx) that
 * older stored charts/bundles do not carry. Every helper degrades to `null`
 * on absent depth, so callers render honest absent-states instead of crashing.
 */

/** One dated daśā row; `antar_sequence` is the depth a mahā row may carry. */
export interface DashaTreeRow {
  readonly lord: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly duration_years: number;
  /** The nine dated antar-daśās of a mahā row; absent on older payloads. */
  readonly antar_sequence?: readonly DashaTreeRow[] | null;
}

/** The minimal reference that locates a row: its lord + dated start. */
export interface DashaLegRef {
  readonly lord: string;
  readonly start_date: string;
}

/**
 * The structural source the Periods explorer reads — the browser engine's
 * `VimshottariDasha` (`sidereal_chart.dashas`) satisfies this today, and keeps
 * satisfying it once the period-depth fields land on the package types.
 */
export interface DashaTreeSource {
  readonly maha_dasha_sequence: readonly DashaTreeRow[];
  readonly current_maha: DashaTreeRow | null;
  readonly current_antar: DashaTreeRow | null;
  readonly current_pratyantar: DashaTreeRow | null;
  /** The declared daśā-year convention; additive, absent on older bundles. */
  readonly convention?: string;
  /**
   * The running antar's nine dated pratyantar-daśās; null/absent when there is
   * no current antar or on payloads predating the period-depth fields.
   */
  readonly pratyantar_sequence?: readonly DashaTreeRow[] | null;
}

/** Index of the row matching `leg` (lord + start_date), or -1. */
function periodRowIndex(
  rows: readonly DashaTreeRow[] | null | undefined,
  leg: DashaLegRef | null | undefined,
): number {
  if (!rows || !leg) {
    return -1;
  }
  return rows.findIndex((row) => row.lord === leg.lord && row.start_date === leg.start_date);
}

/** The row of `rows` matching `leg` (lord + dated start), else null. */
export function findPeriodRow(
  rows: readonly DashaTreeRow[] | null | undefined,
  leg: DashaLegRef | null | undefined,
): DashaTreeRow | null {
  const index = periodRowIndex(rows, leg);
  return index >= 0 ? (rows?.[index] ?? null) : null;
}

/** The row immediately AFTER the one matching `leg`, else null. */
export function nextPeriodRow(
  rows: readonly DashaTreeRow[] | null | undefined,
  leg: DashaLegRef | null | undefined,
): DashaTreeRow | null {
  const index = periodRowIndex(rows, leg);
  return index >= 0 ? (rows?.[index + 1] ?? null) : null;
}

/**
 * The antar-daśā following the running one: the next row of the running mahā's
 * `antar_sequence`, rolling into the FIRST antar of the next mahā when the
 * running antar is its mahā's last. Null when depth is absent (older payloads)
 * or there is nothing after (end of the emitted 120-year wheel).
 */
export function nextAntar(
  mahaRows: readonly DashaTreeRow[] | null | undefined,
  currentMaha: DashaLegRef | null | undefined,
  currentAntar: DashaLegRef | null | undefined,
): DashaTreeRow | null {
  if (!mahaRows || !currentMaha || !currentAntar) {
    return null;
  }
  const mahaIndex = periodRowIndex(mahaRows, currentMaha);
  if (mahaIndex < 0) {
    return null;
  }
  const antars = mahaRows[mahaIndex]?.antar_sequence;
  const within = nextPeriodRow(antars, currentAntar);
  if (within) {
    return within;
  }
  // Roll over only when the running antar IS the last row of its mahā.
  const antarIndex = periodRowIndex(antars, currentAntar);
  if (antarIndex < 0 || !antars || antarIndex !== antars.length - 1) {
    return null;
  }
  return mahaRows[mahaIndex + 1]?.antar_sequence?.[0] ?? null;
}

/**
 * The pratyantar-daśā following the running one within the engine-emitted
 * `pratyantar_sequence`. No rollover: the engine emits pratyantars only for
 * the RUNNING antar, so past its boundary the honest answer is null.
 */
export function nextPratyantar(
  pratyantarRows: readonly DashaTreeRow[] | null | undefined,
  currentPratyantar: DashaLegRef | null | undefined,
): DashaTreeRow | null {
  return nextPeriodRow(pratyantarRows, currentPratyantar);
}

/** Calendar-unit display split of an engine `duration_years` value. */
export interface DurationParts {
  readonly years: number;
  readonly months: number;
  readonly days: number;
}

/**
 * Re-express `duration_years` as display units: whole years + rounded months,
 * months alone under a year, days under a month (≈365.25-day year). Pure
 * presentation — the exact engine dates always render beside the duration.
 */
export function durationParts(durationYears: number): DurationParts {
  if (!Number.isFinite(durationYears) || durationYears <= 0) {
    return { years: 0, months: 0, days: 0 };
  }
  let years = Math.floor(durationYears);
  let months = Math.round((durationYears - years) * 12);
  if (months === 12) {
    years += 1;
    months = 0;
  }
  if (years === 0 && months === 0) {
    return { years: 0, months: 0, days: Math.round(durationYears * 365.25) };
  }
  return { years, months, days: 0 };
}
