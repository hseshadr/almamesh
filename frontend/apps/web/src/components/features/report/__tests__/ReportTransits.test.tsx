/**
 * ReportTransits — the printed Transits & Timing section, now including the
 * engine's `slow_hits` (previously computed but never rendered anywhere in the
 * report). Contract: one dated row per hit — graha → natal target, exact date,
 * severity tone — verbatim from TransitCtx; honest empty state when none.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { TransitCtx } from '@almamesh/shared-types';

import '../../../../i18n/config';
import { ReportTransits } from '../ReportTransits';
import { TRANSIT_CTX } from '../../../../test/predictiveFixtures';

describe('ReportTransits — slow-graha hits', () => {
  it('prints one dated row per engine slow hit with target and tone', () => {
    render(<ReportTransits transitCtx={TRANSIT_CTX} />);
    const table = screen.getByTestId('report-slow-hits');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 fixture hits
    expect(rows[1].textContent).toContain('Saturn → natal Saturn');
    expect(rows[1].textContent).toContain('Challenging');
    expect(rows[2].textContent).toContain('Jupiter → natal Moon');
    expect(rows[2].textContent).toContain('Supportive');
    // Dated: the exact-hit dates render (locale-formatted, year is stable).
    expect(rows[1].textContent).toContain('2026');
  });

  it('shows the honest empty state when the engine emitted no slow hits', () => {
    const ctx: TransitCtx = { ...TRANSIT_CTX, slow_hits: [] };
    render(<ReportTransits transitCtx={ctx} />);
    expect(screen.queryByTestId('report-slow-hits')).toBeNull();
    expect(screen.getByTestId('report-transits').textContent).toContain(
      'No exact slow-planet hits inside this window.',
    );
  });

  it('keeps the gochara table, Sade Sati panel, fusion and timeline intact', () => {
    render(<ReportTransits transitCtx={TRANSIT_CTX} />);
    expect(screen.getByTestId('report-gochara-table')).toBeTruthy();
    expect(screen.getByTestId('report-sade-sati')).toBeTruthy();
    expect(screen.getByTestId('report-fusion')).toBeTruthy();
    expect(screen.getByTestId('report-transit-timeline')).toBeTruthy();
  });
});
