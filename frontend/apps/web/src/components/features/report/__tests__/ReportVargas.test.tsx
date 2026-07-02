/**
 * ReportVargas — the printed Shodasavarga section (ALL 16 plates + tallies).
 *
 * Credibility contract: vargas are SIGN-placement charts — the engine emits no
 * in-varga longitudes, so the whole section must print NO degree text and each
 * South plate centre must carry its OWN varga label (never the D1 Rāśi
 * default). A fabricated "0°00'" is the exact red flag an expert reads as a
 * calculation bug. Every EMITTED chart gets a plate (the full sixteen when the
 * engine emits them; only what exists otherwise — no blank frames).
 *
 * i18n note: no i18next instance is bound here, so keys render verbatim —
 * assertions target testids, SVG labels and the degree glyph, never prose.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useChartStore } from '@almamesh/store';
import type {
  DivisionalChartId,
  VargaChartFullData,
  VargaCtxFull,
  ZodiacSign,
} from '@almamesh/shared-types';

import { ReportVargas } from '../ReportVargas';
import { VARGA_CTX_FULL } from '../../../../test/predictiveFixtures';

/** Canonical Shodaśavarga order — the order the section must draw plates in. */
const ALL_16: readonly DivisionalChartId[] = [
  'D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10', 'D12',
  'D16', 'D20', 'D24', 'D27', 'D30', 'D40', 'D45', 'D60',
];

function varga(chart: DivisionalChartId, lagnaSign: ZodiacSign): VargaChartFullData {
  return {
    chart,
    lagna_sign: lagnaSign,
    lagna_sign_lord: 'mars',
    placements: {
      saturn: { graha: 'saturn', sign: 'capricorn', sign_lord: 'saturn', is_combust: false },
    },
  };
}

/** A full-emission fixture: all sixteen charts present (synthetic values). */
const FULL_16_CTX: VargaCtxFull = {
  ...VARGA_CTX_FULL,
  charts: Object.fromEntries(ALL_16.map((id) => [id, varga(id, 'aries')])) as VargaCtxFull['charts'],
};

describe('ReportVargas — printed divisional plates', () => {
  beforeEach(() => {
    useChartStore.setState({ displayStyle: 'south' });
  });

  it('renders one framed plate for EVERY emitted varga (all sixteen)', () => {
    const { container } = render(<ReportVargas vargaCtxFull={FULL_16_CTX} />);
    expect(container.querySelectorAll('figure.report-chart-figure')).toHaveLength(16);
  });

  it('draws the sixteen plates in canonical D1→D60 order (South centre codes)', () => {
    render(<ReportVargas vargaCtxFull={FULL_16_CTX} />);
    const codes = screen
      .getAllByTestId('south-chart-center-code')
      .map((el) => el.textContent);
    expect(codes).toEqual([...ALL_16]);
  });

  it('renders only the emitted charts when the engine emits a subset (no blank frames)', () => {
    const { container } = render(<ReportVargas vargaCtxFull={VARGA_CTX_FULL} />);
    // The shared fixture emits D1 + D9 + D10 only.
    expect(container.querySelectorAll('figure.report-chart-figure')).toHaveLength(3);
    const codes = screen
      .getAllByTestId('south-chart-center-code')
      .map((el) => el.textContent);
    expect(codes).toEqual(['D1', 'D9', 'D10']);
  });

  it('prints NO degree text anywhere in the section (sign-placement charts)', () => {
    render(<ReportVargas vargaCtxFull={FULL_16_CTX} />);
    const section = screen.getByTestId('report-vargas');
    // Engine grahas still render as glyphs…
    expect(section.textContent).toContain('Sa');
    // …but no fabricated degree readout may appear.
    expect(section.textContent).not.toContain('°');
  });

  it('prints no degree text on North-style plates either', () => {
    useChartStore.setState({ displayStyle: 'north' });
    render(<ReportVargas vargaCtxFull={FULL_16_CTX} />);
    expect(screen.getByTestId('report-vargas').textContent).not.toContain('°');
  });
});
