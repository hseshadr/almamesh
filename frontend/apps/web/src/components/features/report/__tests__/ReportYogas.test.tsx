/**
 * ReportYogas — the calibrated STRUCTURAL strength slot (rigor-upgrade Stage 1).
 *
 * Drives the real component with the real i18n config (English), so the
 * assertions target the rendered report exactly as a reader sees it: the
 * "NN% · band" headline, the "structural estimate" tier label, and the signed
 * factor ledger. Bundles stored before the upgrade (no strength fields) must
 * render NO strength block — the presence guard, verified.
 */
import '../../../../i18n/config';
import { describe, expect, it } from 'vitest';
import { render, within } from '@testing-library/react';
import type { YogaData, YogaStrengthFactor } from '@almamesh/browser/types';

import { ReportYogas } from '../ReportYogas';

const factor = (
  factor_type: string,
  planet: string,
  value: string,
  mark: number,
): YogaStrengthFactor => ({ factor_type, planet, value, basis: 'BPHS', mark });

const baseYoga: YogaData = {
  name: 'Gajakesari Yoga',
  display_name: 'Gajakesari Yoga',
  category: 'auspicious',
  description: 'Jupiter in a kendra from the Moon.',
  effects: 'Lasting reputation.',
  grade: 'strong',
  strength_factors: [factor('dignity', 'jupiter', 'exalted', 1)],
  planets_involved: ['jupiter', 'moon'],
  houses_involved: [1, 4],
  planetary_signature: 'jupiter_moon_h1_h4',
  formation_rules: [
    { rule: 'gajakesari', description: 'Jupiter in the 1st from the Moon', source: 'BPHS', planets: [], houses: [] },
  ],
};

const strongYoga: YogaData = {
  ...baseYoga,
  net_marks: 4,
  max_favorable: 5,
  max_unfavorable: 6,
  strength_pct: 90.91,
  strength_tier: 'structural',
  strength_factors: [
    factor('dignity', 'jupiter', 'exalted', 1),
    factor('house_class', 'jupiter', 'kendra (house 1)', 1),
    factor('retrograde', 'jupiter', 'retrograde', 1),
    factor('house_class', 'moon', 'kendra (house 4)', 1),
  ],
};

describe('ReportYogas — calibrated structural strength', () => {
  it('renders the NN% · band headline, the tier label, and the signed ledger', () => {
    const { getByTestId } = render(<ReportYogas yogas={[strongYoga]} audience="you" />);
    const block = getByTestId('report-yoga-strength');
    const text = block.textContent ?? '';
    expect(text).toContain('91%'); // 90.91 rounds to the whole-number headline
    expect(text).toContain('strong'); // band word (>=75%)
    expect(text).toContain('structural estimate'); // epistemic tier — never over-claims
    expect(text).toContain('Jupiter exalted +1'); // signed factor ledger, engine words
    expect(text).toContain('Moon kendra (house 4) +1');
    expect(text).toContain('net +4 of max +5'); // the achievable-range summary
  });

  it('renders NO strength block for a pre-upgrade bundle (presence guard)', () => {
    const { queryByTestId, getByTestId } = render(<ReportYogas yogas={[baseYoga]} audience="you" />);
    expect(getByTestId('report-yogas')).toBeTruthy(); // the section still renders
    expect(queryByTestId('report-yoga-strength')).toBeNull(); // but no fabricated %
  });

  it('shows the min-bound summary when the net is unfavorable', () => {
    const weak: YogaData = {
      ...baseYoga,
      grade: 'weak',
      net_marks: -2,
      max_favorable: 2,
      max_unfavorable: 2,
      strength_pct: 0,
      strength_tier: 'structural',
      strength_factors: [
        factor('dignity', 'sun', 'debilitated', -1),
        factor('house_class', 'sun', 'dusthana (house 6)', -1),
      ],
    };
    const { getByTestId } = render(<ReportYogas yogas={[weak]} audience="you" />);
    const text = within(getByTestId('report-yoga-strength')).getByText(/net −2 of min −2/);
    expect(text).toBeTruthy();
  });
});
