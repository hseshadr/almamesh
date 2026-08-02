/**
 * The confidence model must be DERIVED, CHART-SPECIFIC and REPRODUCIBLE.
 *
 * The failure this suite exists to prevent is fake precision: a "High" that a
 * model asserted or that a rule type carries as a hardcoded label. So the tests
 * below all take the same shape — assert that the level FOLLOWS from the cited
 * factors and this chart's measured fragilities, and that the same claim scores
 * DIFFERENTLY in a chart whose ascendant is secure.
 */

import { describe, expect, it } from 'vitest';

import { alternateLagna } from '../alternateLagna';
import { assessConfidence } from '../confidence';
import { factorIndex } from '../factors';
import { nearCuspChart, secureLagnaChart } from './evidenceFixtures';

function cite(chart: ReturnType<typeof nearCuspChart>, ids: readonly string[]) {
  const index = factorIndex(chart);
  return ids.map((id) => {
    const factor = index.get(id);
    if (factor === undefined) {
      throw new Error(`fixture is missing factor ${id}`);
    }
    return factor;
  });
}

describe('ceiling by factor class', () => {
  const chart = secureLagnaChart();
  const alternate = alternateLagna(chart);

  it('rates arithmetic High — a dasha period is the computation itself', () => {
    const verdict = assessConfidence(cite(chart, ['dasha:maha:saturn']), alternate);
    expect(verdict.ceiling).toBe('high');
    expect(verdict.ceilingClass).toBe('arithmetic');
    expect(verdict.level).toBe('high');
    expect(verdict.deductions).toEqual([]);
  });

  it('rates a classical rule Moderate — which sign exalts a graha is a choice', () => {
    const verdict = assessConfidence(cite(chart, ['dignity:venus']), alternate);
    expect(verdict.ceiling).toBe('moderate');
    expect(verdict.level).toBe('moderate');
  });

  it('rates a structural estimate Low — the lattice is this engine, not the tradition', () => {
    const verdict = assessConfidence(cite(chart, ['yoga:Test Sign Yoga:strength']), alternate);
    expect(verdict.ceiling).toBe('low');
    expect(verdict.ceilingClass).toBe('model');
    expect(verdict.level).toBe('low');
  });

  it('takes the WEAKEST cited factor — a claim is only as good as its worst support', () => {
    const verdict = assessConfidence(
      cite(chart, ['dasha:maha:saturn', 'yoga:Test Sign Yoga:strength']),
      alternate,
    );
    expect(verdict.ceiling).toBe('low');
    expect(verdict.ceilingFactorId).toBe('yoga:Test Sign Yoga:strength');
  });

  it('refuses to score a claim that cites nothing', () => {
    expect(() => assessConfidence([], alternate)).toThrow(/no derivable confidence/);
  });
});

describe('chart-specific deductions — the same claim, two charts', () => {
  const near = nearCuspChart();
  const secure = secureLagnaChart();
  const nearAlt = alternateLagna(near);
  const secureAlt = alternateLagna(secure);

  it('lowers a HOUSE-DEPENDENT claim only in the near-cusp chart', () => {
    // Venus lords the 4th and 9th FROM THE LAGNA. If the lagna sign is in doubt,
    // so is every number in that sentence.
    const secureVerdict = assessConfidence(cite(secure, ['rulership:venus']), secureAlt);
    const nearVerdict = assessConfidence(cite(near, ['rulership:venus']), nearAlt);

    expect(secureVerdict.level).toBe('moderate');
    expect(secureVerdict.deductions).toEqual([]);

    expect(nearVerdict.level).toBe('low');
    expect(nearVerdict.deductions).toEqual([
      { code: 'lagna-fork', subject: 'lagna', marginDeg: 1.183 },
    ]);
  });

  it('leaves a CUSP-INVARIANT claim untouched in the SAME near-cusp chart', () => {
    // This is the load-bearing half. A blanket "near cusp => everything is less
    // certain" would be a label, not a derivation. Dignity is sign-based and is
    // byte-identical in both candidate charts, so it must NOT be penalised.
    const secureVerdict = assessConfidence(cite(secure, ['dignity:venus']), secureAlt);
    const nearVerdict = assessConfidence(cite(near, ['dignity:venus']), nearAlt);
    expect(nearVerdict.level).toBe(secureVerdict.level);
    expect(nearVerdict.deductions).toEqual([]);
  });

  it('leaves the Vimshottari dasha untouched — it is keyed to the Moon, not the lagna', () => {
    const verdict = assessConfidence(cite(near, ['dasha:maha:saturn']), nearAlt);
    expect(verdict.level).toBe('high');
    expect(verdict.deductions).toEqual([]);
  });

  it('leaves combustion untouched — it is a Sun-to-planet longitude separation', () => {
    const verdict = assessConfidence(cite(near, ['combustion:venus']), nearAlt);
    expect(verdict.level).toBe('moderate');
    expect(verdict.deductions).toEqual([]);
  });

  it('penalises a combustion verdict sitting on its own orb', () => {
    // Saturn retrograde, 15.4 deg from the Sun against a 15 deg orb: 0.4 deg
    // from flipping. The engine says NOT combust; that verdict is fragile.
    const verdict = assessConfidence(cite(near, ['combustion:saturn']), nearAlt);
    expect(verdict.deductions).toEqual([
      { code: 'combustion-boundary', subject: 'saturn', marginDeg: expect.closeTo(0.4, 5) },
    ]);
    expect(verdict.level).toBe('low');
  });

  it('penalises a net-zero structural score — cancellation and silence look identical', () => {
    const verdict = assessConfidence(cite(near, ['yoga:Test House Yoga:strength']), nearAlt);
    const codes = verdict.deductions.map((d) => d.code);
    expect(codes).toContain('net-zero-marks');
    // Two deductions against a Low ceiling: clamped, and the clamp is declared.
    expect(verdict.level).toBe('low');
    expect(verdict.floored).toBe(true);
  });

  it('does not penalise a sign-only yoga for a cusp it does not touch', () => {
    const houseYoga = assessConfidence(cite(near, ['yoga:Test House Yoga']), nearAlt);
    const signYoga = assessConfidence(cite(near, ['yoga:Test Sign Yoga']), nearAlt);
    expect(houseYoga.deductions.map((d) => d.code)).toEqual(['lagna-fork']);
    expect(signYoga.deductions).toEqual([]);
  });

  it('is reproducible: level = ceiling − deductions, clamped to Low', () => {
    // The report prints ceiling, every deduction, and the level. A reader must
    // be able to recompute the third from the first two.
    const value = { high: 3, moderate: 2, low: 1 } as const;
    for (const ids of [
      ['dasha:maha:saturn'],
      ['dignity:venus'],
      ['rulership:venus'],
      ['house:venus'],
      ['yoga:Test House Yoga', 'yoga:Test House Yoga:strength'],
    ]) {
      const verdict = assessConfidence(cite(near, ids), nearAlt);
      const expected = Math.max(1, value[verdict.ceiling] - verdict.deductions.length);
      expect(value[verdict.level]).toBe(expected);
    }
  });
});
