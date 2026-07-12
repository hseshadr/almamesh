/**
 * yogaStrength — the single source of truth for rendering a yoga's CALIBRATED
 * STRUCTURAL strength (rigor-upgrade §A.1, Tier S). The web report and the PDF
 * both derive their headline band, signed factor ledger, and achievable-range
 * bound from here, so the two surfaces can never drift.
 *
 * This is presentation only: the % and the marks are computed by the engine
 * (backend `yogas/factors.favorability`) and mirrored verbatim; here we merely
 * bucket the % into a band and shape the ledger. NOTHING numeric is invented —
 * a factor's `mark` is the engine's own signed ±1, never a re-weighting.
 */

import type { YogaData } from '@almamesh/browser/types';

export type StrengthBand = 'strong' | 'moderate' | 'weak';

/** The %→band buckets (rigor-upgrade §A.1): ≥75 strong, 40–75 moderate, <40 weak. */
export function strengthBand(pct: number): StrengthBand {
  if (pct >= 75) return 'strong';
  if (pct >= 40) return 'moderate';
  return 'weak';
}

/** A signed integer as display text with an explicit sign and a true minus (−). */
export function signedMark(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** One non-neutral factor in the ledger: the engine's planet + value + signed mark. */
export interface StrengthLedgerEntry {
  readonly planet: string;
  readonly value: string;
  readonly mark: number;
}

export interface YogaStrengthView {
  /** The headline percentage, rounded to a whole number for display. */
  readonly pct: number;
  readonly band: StrengthBand;
  readonly net: number;
  /** The achievable bound the net is measured against: +max_favorable when the
   *  net is favorable, −max_unfavorable when it is unfavorable. */
  readonly bound: number;
  /** The signed factors that actually moved the net (neutral marks dropped). */
  readonly entries: readonly StrengthLedgerEntry[];
}

/**
 * Whether a yoga carries the calibrated-strength fields. Bundles stored before
 * the upgrade lack them, so every renderer guards on this before showing a %.
 */
export function hasStrength(yoga: YogaData): boolean {
  return typeof yoga.strength_pct === 'number' && yoga.strength_tier === 'structural';
}

/** Shape a yoga's calibrated strength for rendering (band + ledger + bound). */
export function yogaStrength(yoga: YogaData): YogaStrengthView {
  const pct = Math.round(yoga.strength_pct ?? 0);
  const net = yoga.net_marks ?? 0;
  const bound = net >= 0 ? (yoga.max_favorable ?? 0) : -(yoga.max_unfavorable ?? 0);
  const entries = yoga.strength_factors
    .map((factor) => ({ planet: factor.planet, value: factor.value, mark: factor.mark ?? 0 }))
    .filter((entry) => entry.mark !== 0);
  return { pct, band: strengthBand(pct), net, bound, entries };
}
