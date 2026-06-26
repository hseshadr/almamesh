/**
 * ReportDasha — the letterpress Vimśottarī section: current legs, convention
 * note, the 9-row mahā table, PLUS (new) the running mahā's nine antar-daśās
 * and the running antar's nine pratyantar-daśās — never all 81 antars (page
 * bloat). Older payloads without depth render the classic section unchanged.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { useLanguageStore } from '@almamesh/store';

import '../../../../i18n/config';
import { ReportDasha } from '../ReportDasha';
import { FOUNDER_DASHAS, FOUNDER_DASHAS_NO_DEPTH } from '../../../../test/dashaFixtures';

describe('ReportDasha', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('keeps the classic section: current legs, convention note, 9-row mahā table', () => {
    render(<ReportDasha dashas={FOUNDER_DASHAS} />);
    expect(screen.getByTestId('report-dasha-current')).toBeTruthy();
    expect(screen.getByTestId('report-dasha-convention').textContent).toContain('Gregorian year');
    const mahaTable = screen.getByTestId('report-dasha-maha-table');
    expect(within(mahaTable).getAllByRole('row')).toHaveLength(10); // header + 9 mahās
    // The running mahā row carries the dot marker + aria-current.
    const runningRow = within(mahaTable)
      .getAllByRole('row')
      .find((row) => row.getAttribute('aria-current') === 'true');
    expect(runningRow?.textContent).toContain('Saturn');
  });

  it('adds the antar-daśās of the RUNNING mahā only (9 rows, running antar highlighted)', () => {
    render(<ReportDasha dashas={FOUNDER_DASHAS} />);
    expect(screen.getByText('Antar-daśās of the Saturn Mahā-daśā')).toBeTruthy();
    const table = screen.getByTestId('report-dasha-antars');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(10); // header + exactly the running mahā's 9 antars
    const running = rows.find((row) => row.getAttribute('aria-current') === 'true');
    expect(running?.textContent).toContain('Venus');
  });

  it('adds the pratyantar-daśās of the RUNNING antar (9 rows, running PD highlighted)', () => {
    render(<ReportDasha dashas={FOUNDER_DASHAS} />);
    expect(screen.getByText('Pratyantar-daśās of the Venus Antar-daśā')).toBeTruthy();
    const table = screen.getByTestId('report-dasha-pratyantars');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(10);
    const running = rows.find((row) => row.getAttribute('aria-current') === 'true');
    expect(running?.textContent).toContain('Saturn');
    expect(within(table).getByText('Mercury')).toBeTruthy(); // the next PD is on the page
  });

  it('never prints all 81 antars — only the running mahā expands', () => {
    render(<ReportDasha dashas={FOUNDER_DASHAS} />);
    expect(screen.getAllByTestId('report-dasha-antars')).toHaveLength(1);
  });

  it('renders the classic section unchanged (no sub-tables, no crash) on older payloads', () => {
    render(<ReportDasha dashas={FOUNDER_DASHAS_NO_DEPTH} />);
    expect(screen.getByTestId('report-dasha-maha-table')).toBeTruthy();
    expect(screen.queryByTestId('report-dasha-antars')).toBeNull();
    expect(screen.queryByTestId('report-dasha-pratyantars')).toBeNull();
  });
});
