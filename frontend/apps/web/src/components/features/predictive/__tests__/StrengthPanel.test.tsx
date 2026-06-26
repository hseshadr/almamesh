import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { useLanguageStore } from '@almamesh/store';

import '../../../../i18n/config';
import { StrengthPanel, hasApproximatedComponents } from '../StrengthPanel';
import { ALL_SIGNS, SAV_BINDUS, STRENGTH_CTX } from '../../../../test/predictiveFixtures';

describe('StrengthPanel', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('shows the SAV grid with one cell per sign and the canonical 337 total', () => {
    render(<StrengthPanel strengthCtx={STRENGTH_CTX} />);
    expect(screen.getByTestId('sav-total').textContent).toContain('337');
    const grid = screen.getByTestId('sav-grid');
    for (const sign of ALL_SIGNS) {
      const label = sign.charAt(0).toUpperCase() + sign.slice(1);
      expect(within(grid).getByText(label)).toBeTruthy();
    }
    // A couple of verbatim bindu values.
    expect(within(grid).getAllByText(String(SAV_BINDUS.aries)).length).toBeGreaterThan(0);
  });

  it('shows per-planet BAV totals', () => {
    render(<StrengthPanel strengthCtx={STRENGTH_CTX} />);
    const card = screen.getByTestId('bav-card');
    expect(within(card).getByText(/39 bindus/)).toBeTruthy();
    expect(within(card).getByText(/56 bindus/)).toBeTruthy();
  });

  it('shows Shadbala rupas against the required minimum with verdict badges', () => {
    render(<StrengthPanel strengthCtx={STRENGTH_CTX} />);
    const table = screen.getByTestId('shadbala-table');
    // Two display decimals — never the engine's raw float (6.128260954302394).
    expect(within(table).getByText('6.13')).toBeTruthy();
    expect(within(table).getByText('4.80')).toBeTruthy();
    expect(table.textContent).not.toContain('6.128260954302394');
    expect(within(table).getByText('Meets minimum')).toBeTruthy();
    expect(within(table).getByText('Below minimum')).toBeTruthy();
  });

  it('surfaces approximated components honestly (footnote + sunrise basis)', () => {
    render(<StrengthPanel strengthCtx={STRENGTH_CTX} />);
    expect(screen.getByTestId('shadbala-approx-note')).toBeTruthy();
    expect(screen.getByText(/sunrise preceding birth/)).toBeTruthy();
  });

  it('hasApproximatedComponents detects any flagged component', () => {
    const saturn = STRENGTH_CTX.shadbala.planets.saturn;
    expect(saturn).toBeDefined();
    expect(hasApproximatedComponents(saturn!)).toBe(true);
  });
});
