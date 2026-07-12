/**
 * ReportAssumptions — the single assumptions & provenance panel (Stage-4).
 *
 * Contract: it ASSEMBLES existing provenance (ayanāṁśa, whole-sign houses,
 * entered-vs-rectified time, ascendant cusp proximity) — inventing nothing. All
 * data is SYNTHETIC — never real birth data.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LagnaData } from '@almamesh/browser/types';

import '../../../../i18n/config';
import { ReportAssumptions } from '../ReportAssumptions';
import type { RectificationDelta } from '../../../../lib/rectification';

const LAGNA_CLEAR = {
  sign: 'aries',
  sign_degrees: 15,
  lagna_cusp_distance_deg: 15,
  lagna_adjacent_sign: null,
  is_near_cusp: false,
} as unknown as LagnaData;

const LAGNA_CUSP = {
  sign: 'aries',
  sign_degrees: 28.8,
  lagna_cusp_distance_deg: 1.2,
  lagna_adjacent_sign: 'Taurus',
  is_near_cusp: true,
} as unknown as LagnaData;

const DELTA: RectificationDelta = {
  deltaMinutes: 15,
  enteredLabel: '5:45 AM',
  rectifiedLabel: '6:00 AM',
};

describe('ReportAssumptions — assumptions & provenance', () => {
  it('always names the ayanāṁśa and the whole-sign house system', () => {
    render(<ReportAssumptions lagna={LAGNA_CLEAR} />);
    expect(screen.getByTestId('report-assumptions')).toBeTruthy();
    expect(screen.getByTestId('report-assumptions-ayanamsa').textContent).toContain('Lahiri');
    expect(screen.getByTestId('report-assumptions-house-system').textContent).toContain(
      'Whole-sign',
    );
  });

  it('reports the recorded time when there is no rectification', () => {
    render(<ReportAssumptions lagna={LAGNA_CLEAR} rectification={null} />);
    expect(screen.getByTestId('report-assumptions-time').textContent).toContain('as recorded');
  });

  it('shows both clocks when a rectification is in effect', () => {
    render(<ReportAssumptions lagna={LAGNA_CLEAR} rectification={DELTA} />);
    const time = screen.getByTestId('report-assumptions-time').textContent ?? '';
    expect(time).toContain('5:45 AM');
    expect(time).toContain('6:00 AM');
  });

  it('states an unambiguous ascendant when the lagna is clear of a cusp', () => {
    render(<ReportAssumptions lagna={LAGNA_CLEAR} />);
    expect(screen.getByTestId('report-assumptions-cusp').textContent).toContain('unambiguous');
  });

  it('flags a near-cusp ascendant as birth-time-sensitive', () => {
    render(<ReportAssumptions lagna={LAGNA_CUSP} />);
    const cusp = screen.getByTestId('report-assumptions-cusp').textContent ?? '';
    expect(cusp).toContain('Taurus');
    expect(cusp).toContain('birth-time-sensitive');
  });
});
