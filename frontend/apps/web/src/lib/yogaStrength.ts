/**
 * yogaStrength — shapes a yoga's CALIBRATED STRUCTURAL strength for rendering
 * (rigor-upgrade §A.1, Tier S). The web report and the PDF both read from here,
 * so the two surfaces can never drift.
 *
 * This file computes NOTHING. The percentage, the signed marks, the achievable
 * bounds AND the strength word are all produced by the engine
 * (`backend/src/almamesh/yogas/factors.py`) and mirrored verbatim.
 *
 * Why that matters, concretely: this module used to hold its own `strengthBand`
 * with `pct >= 75 / >= 40` cut points while the engine graded on `net >= 2 /
 * <= -1`. Two rules, two languages, both printed on the same report line — so a
 * yoga could render "AUSPICIOUS · WEAK" next to "45% · MODERATE". Deriving the
 * word here at all is the defect; the fix is to have no rule to disagree with.
 * The cut points now live once, in `factors.band_for_pct`.
 */

import type { YogaData } from '@almamesh/browser/types';

export type StrengthBand = 'strong' | 'moderate' | 'weak';

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
  /** The engine's own strength word, mirrored. Never re-derived from `pct`. */
  readonly band: StrengthBand;
  readonly net: number;
  /**
   * BOTH ends of the achievable scale the net is measured against: `min` is
   * −max_unfavorable, `max` is +max_favorable. Both are exposed because the
   * engine's percentage divides by the FULL span — `100 · (net − min)/(max −
   * min)` — so showing only the favorable bound left the reader computing
   * 0/3 = 0% for a number the report printed as 50%. Correct maths,
   * unreproducible display; a reader who cannot check it has to take it on
   * faith, which is the thing this engine refuses to ask for.
   */
  readonly min: number;
  readonly max: number;
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

/** Shape a yoga's calibrated strength for rendering (band + ledger + scale). */
export function yogaStrength(yoga: YogaData): YogaStrengthView {
  const entries = yoga.strength_factors
    .map((factor) => ({ planet: factor.planet, value: factor.value, mark: factor.mark ?? 0 }))
    .filter((entry) => entry.mark !== 0);
  return {
    pct: Math.round(yoga.strength_pct ?? 0),
    band: yoga.grade, // the engine's word, mirrored — see the file header
    net: yoga.net_marks ?? 0,
    min: -(yoga.max_unfavorable ?? 0),
    max: yoga.max_favorable ?? 0,
    entries,
  };
}
