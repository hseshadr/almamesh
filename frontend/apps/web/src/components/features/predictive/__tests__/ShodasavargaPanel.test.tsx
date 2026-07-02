import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { useChartStore, useLanguageStore } from '@almamesh/store';

import '../../../../i18n/config';
import { ShodasavargaPanel, VARGA_ORDER } from '../ShodasavargaPanel';
import { VARGA_CTX_FULL } from '../../../../test/predictiveFixtures';

describe('ShodasavargaPanel', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
    useChartStore.setState({ displayStyle: 'north' });
  });

  it('offers all 16 varga selectors (D1–D60), disabling absent charts', () => {
    render(<ShodasavargaPanel vargaCtxFull={VARGA_CTX_FULL} />);
    expect(VARGA_ORDER).toHaveLength(16);
    for (const id of VARGA_ORDER) {
      expect(screen.getByTestId(`varga-select-${id}`)).toBeTruthy();
    }
    // Fixture emits D1/D9/D10 only — others are honestly disabled.
    expect((screen.getByTestId('varga-select-D60') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('varga-select-D10') as HTMLButtonElement).disabled).toBe(false);
  });

  it('defaults to the D9 Navamsa and renders its kundli + lagna line', () => {
    render(<ShodasavargaPanel vargaCtxFull={VARGA_CTX_FULL} />);
    expect(screen.getByTestId('varga-select-D9').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('varga-lagna-line').textContent).toContain('Scorpio');
  });

  it('switches the rendered varga on selection', () => {
    render(<ShodasavargaPanel vargaCtxFull={VARGA_CTX_FULL} />);
    fireEvent.click(screen.getByTestId('varga-select-D10'));
    expect(screen.getByTestId('varga-select-D10').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('varga-lagna-line').textContent).toContain('Leo');
  });

  it('shows vargottama flags', () => {
    render(<ShodasavargaPanel vargaCtxFull={VARGA_CTX_FULL} />);
    const card = screen.getByTestId('vargottama-card');
    expect(within(card).getByText(/Jupiter in Pisces/)).toBeTruthy();
  });

  it('shows Vimshopaka scores with the approximated flag surfaced honestly', () => {
    render(<ShodasavargaPanel vargaCtxFull={VARGA_CTX_FULL} />);
    const table = screen.getByTestId('vimshopaka-table');
    expect(within(table).getByText('14.25')).toBeTruthy();
    expect(within(table).getByText('16.5')).toBeTruthy();
    // Saturn's score is approximated → the ≈ marker + the footnote render.
    expect(within(table).getAllByLabelText('approximated')).toHaveLength(1);
    expect(screen.getByTestId('vimshopaka-approx-note')).toBeTruthy();
    // Shadvarga own-sign tally merged per graha.
    expect(within(table).getByText(/3 of 6/)).toBeTruthy();
  });

  it('renders the selected varga with NO degree text (sign-placement chart)', () => {
    // The engine emits no in-varga longitudes; a fabricated "0°00'" is the
    // exact red flag an expert reads as a calculation bug.
    render(<ShodasavargaPanel vargaCtxFull={VARGA_CTX_FULL} />);
    expect(screen.getByTestId('varga-chart-card').textContent).not.toContain('°');
  });

  it('labels the South plate centre with the selected varga, not the D1 Rāśi', () => {
    useChartStore.setState({ displayStyle: 'south' });
    render(<ShodasavargaPanel vargaCtxFull={VARGA_CTX_FULL} />);
    const card = screen.getByTestId('varga-chart-card');
    expect(within(card).getByTestId('south-chart-center-code').textContent).toBe('D9');
    expect(within(card).getByTestId('south-chart-center-title').textContent).toBe('Navāṁśa');
    expect(card.textContent).not.toContain('°');
  });

  it('dims a graha the engine flagged combust in D1 across the divisional charts', () => {
    // Regression: the full-varga path dropped the engine's D1 combustion flag,
    // so a combust graha rendered full-opacity in every Shodasavarga chart. The
    // fixture's Saturn is combust; the North SVG marks it with opacity-50.
    useChartStore.setState({ displayStyle: 'north' });
    render(<ShodasavargaPanel vargaCtxFull={VARGA_CTX_FULL} />);
    const card = screen.getByTestId('varga-chart-card');
    const saturn = card.querySelector('[data-planet="saturn"]');
    const jupiter = card.querySelector('[data-planet="jupiter"]');
    expect(saturn?.getAttribute('class')).toContain('opacity-50');
    expect(jupiter?.getAttribute('class')).not.toContain('opacity-50');
  });
});
