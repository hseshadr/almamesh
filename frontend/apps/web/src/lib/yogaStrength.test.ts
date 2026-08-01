import { describe, expect, it } from 'vitest';
import type { YogaData, YogaStrengthFactor } from '@almamesh/browser/types';
import { hasStrength, signedMark, yogaStrength } from './yogaStrength';

const factor = (planet: string, value: string, mark: number): YogaStrengthFactor => ({
  factor_type: 'dignity',
  planet,
  value,
  basis: 'test',
  mark,
});

const mkYoga = (over: Partial<YogaData>): YogaData => ({
  name: 'Test Yoga',
  display_name: 'Test Yoga',
  category: 'auspicious',
  description: '',
  effects: '',
  grade: 'strong',
  strength_factors: [factor('jupiter', 'exalted', 1)],
  planets_involved: ['jupiter'],
  houses_involved: [1],
  planetary_signature: 'sig',
  formation_rules: [{ rule: 'r', description: 'd', source: 's', planets: [], houses: [] }],
  ...over,
});

// NOTE: the former `describe('strengthBand')` block is GONE, deliberately and
// loudly. It pinned a SECOND set of cut points, in TypeScript, next to the
// engine's own — which is precisely how the report came to print
// "AUSPICIOUS · WEAK" and "45% · MODERATE" on the same line. The cut points now
// live once, in `backend/src/almamesh/yogas/factors.band_for_pct`, and the UI
// mirrors the word the engine already computed. The replacement guard below is
// strictly stronger: it fails if the UI ever re-derives a band from anything.

describe('yogaStrength — the UI never invents a band', () => {
  // Each row pairs a percentage with the word the ENGINE emitted for it. Rows
  // 3-5 are deliberately contradictory: they are what a bundle stored by the
  // pre-fix engine actually looks like. The UI must still show the engine's
  // word — re-deriving one from `pct` is the defect, not the fix.
  const rows = [
    { pct: 90.91, grade: 'strong' as const },
    { pct: 50, grade: 'moderate' as const },
    { pct: 45.45, grade: 'weak' as const },
    { pct: 66.67, grade: 'strong' as const },
    { pct: 40, grade: 'weak' as const },
    { pct: 0, grade: 'weak' as const },
    { pct: 100, grade: 'strong' as const },
  ];

  it.each(rows)('mirrors the engine grade for $pct% (engine says $grade)', ({ pct, grade }) => {
    const view = yogaStrength(
      mkYoga({ strength_pct: pct, strength_tier: 'structural', grade, net_marks: 0 }),
    );
    expect(view.band).toBe(grade);
  });
});

describe('signedMark', () => {
  it('formats with an explicit sign and a true minus glyph', () => {
    expect(signedMark(2)).toBe('+2');
    expect(signedMark(1)).toBe('+1');
    expect(signedMark(-1)).toBe('−1'); // U+2212 MINUS SIGN, not hyphen
    expect(signedMark(-3)).toBe('−3');
  });
});

describe('hasStrength', () => {
  it('is true only when the calibrated fields are present', () => {
    expect(hasStrength(mkYoga({ strength_pct: 91, strength_tier: 'structural' }))).toBe(true);
    expect(hasStrength(mkYoga({}))).toBe(false); // older stored bundle
    expect(hasStrength(mkYoga({ strength_pct: undefined }))).toBe(false);
  });
});

describe('yogaStrength', () => {
  it('rounds the pct, mirrors the engine band, and exposes BOTH achievable bounds', () => {
    const s = yogaStrength(
      mkYoga({
        strength_pct: 90.91,
        strength_tier: 'structural',
        grade: 'strong',
        net_marks: 4,
        max_favorable: 5,
        max_unfavorable: 6,
        strength_factors: [
          factor('jupiter', 'exalted', 1),
          factor('jupiter', 'kendra (house 1)', 1),
          factor('moon', 'neutral', 0), // neutral marks are dropped from the ledger
          factor('moon', 'kendra (house 4)', 1),
        ],
      }),
    );
    expect(s.pct).toBe(91);
    expect(s.band).toBe('strong');
    expect(s.net).toBe(4);
    expect(s.min).toBe(-6); // −max_unfavorable
    expect(s.max).toBe(5); //  +max_favorable
    expect(s.entries.map((e) => e.mark)).toEqual([1, 1, 1]); // the 0-mark factor is filtered
  });

  // The transparency defect: the report used to print ONE bound ("net +0 of max
  // +3") while `_strength_pct` divides by max_favorable + max_unfavorable. A
  // reader computing 0/3 got 0% and could not reproduce the 50% on screen. Both
  // bounds must be exposed so the arithmetic is checkable from the printed line.
  it('exposes a denominator the reader can actually reproduce the pct from', () => {
    const s = yogaStrength(
      mkYoga({
        strength_pct: 50,
        strength_tier: 'structural',
        grade: 'moderate',
        net_marks: 0,
        max_favorable: 3,
        max_unfavorable: 3,
        strength_factors: [factor('venus', 'exalted', 1), factor('venus', 'combust', -1)],
      }),
    );
    // Exactly the arithmetic a reader does from the printed "net +0 on the −3…+3 scale":
    const reproduced = (100 * (s.net - s.min)) / (s.max - s.min);
    expect(Math.round(reproduced)).toBe(s.pct);
  });

  it('keeps both bounds when the net is negative (the scale does not flip)', () => {
    const s = yogaStrength(
      mkYoga({
        strength_pct: 0,
        strength_tier: 'structural',
        grade: 'weak',
        net_marks: -2,
        max_favorable: 2,
        max_unfavorable: 2,
        strength_factors: [factor('sun', 'debilitated', -1), factor('sun', 'dusthana (house 6)', -1)],
      }),
    );
    expect(s.pct).toBe(0);
    expect(s.band).toBe('weak');
    expect(s.min).toBe(-2);
    expect(s.max).toBe(2);
  });
});
