import { describe, expect, it } from 'vitest';
import type { YogaData, YogaStrengthFactor } from '@almamesh/browser/types';
import { hasStrength, signedMark, strengthBand, yogaStrength } from './yogaStrength';

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

describe('strengthBand', () => {
  it('buckets at the §A.1 cut points (>=75 strong, >=40 moderate, else weak)', () => {
    expect(strengthBand(100)).toBe('strong');
    expect(strengthBand(75)).toBe('strong');
    expect(strengthBand(74.9)).toBe('moderate');
    expect(strengthBand(40)).toBe('moderate');
    expect(strengthBand(39.9)).toBe('weak');
    expect(strengthBand(0)).toBe('weak');
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
  it('rounds the pct, derives the band, and points the bound at max_favorable when net >= 0', () => {
    const s = yogaStrength(
      mkYoga({
        strength_pct: 90.91,
        strength_tier: 'structural',
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
    expect(s.bound).toBe(5); // net >= 0 -> +max_favorable
    expect(s.entries.map((e) => e.mark)).toEqual([1, 1, 1]); // the 0-mark factor is filtered
  });

  it('points the bound at -max_unfavorable when net < 0', () => {
    const s = yogaStrength(
      mkYoga({
        strength_pct: 0,
        strength_tier: 'structural',
        net_marks: -2,
        max_favorable: 2,
        max_unfavorable: 2,
        strength_factors: [factor('sun', 'debilitated', -1), factor('sun', 'dusthana (house 6)', -1)],
      }),
    );
    expect(s.pct).toBe(0);
    expect(s.band).toBe('weak');
    expect(s.bound).toBe(-2); // net < 0 -> -max_unfavorable
  });
});
