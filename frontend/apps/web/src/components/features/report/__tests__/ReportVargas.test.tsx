/**
 * ReportVargas — the printed Shodasavarga section (D9 + D10 plates + tallies).
 *
 * Credibility contract: vargas are SIGN-placement charts — the engine emits no
 * in-varga longitudes, so the whole section must print NO degree text and each
 * South plate centre must carry its OWN varga label (never the D1 Rāśi
 * default). A fabricated "0°00'" is the exact red flag an expert reads as a
 * calculation bug.
 *
 * i18n note: no i18next instance is bound here, so keys render verbatim —
 * assertions target testids, SVG labels and the degree glyph, never prose.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useChartStore } from '@almamesh/store';

import { ReportVargas } from '../ReportVargas';
import { VARGA_CTX_FULL } from '../../../../test/predictiveFixtures';

describe('ReportVargas — printed divisional plates', () => {
  beforeEach(() => {
    useChartStore.setState({ displayStyle: 'south' });
  });

  it('renders one framed plate per emitted key varga (D9 + D10)', () => {
    const { container } = render(<ReportVargas vargaCtxFull={VARGA_CTX_FULL} />);
    expect(container.querySelectorAll('figure.report-chart-figure')).toHaveLength(2);
  });

  it('prints NO degree text anywhere in the section (sign-placement charts)', () => {
    render(<ReportVargas vargaCtxFull={VARGA_CTX_FULL} />);
    const section = screen.getByTestId('report-vargas');
    // Engine grahas still render as glyphs…
    expect(section.textContent).toContain('Sa');
    // …but no fabricated degree readout may appear.
    expect(section.textContent).not.toContain('°');
  });

  it('labels each South plate centre with its own varga code, never D1', () => {
    render(<ReportVargas vargaCtxFull={VARGA_CTX_FULL} />);
    const codes = screen
      .getAllByTestId('south-chart-center-code')
      .map((el) => el.textContent);
    expect(codes).toEqual(['D9', 'D10']);
  });

  it('prints no degree text on North-style plates either', () => {
    useChartStore.setState({ displayStyle: 'north' });
    render(<ReportVargas vargaCtxFull={VARGA_CTX_FULL} />);
    expect(screen.getByTestId('report-vargas').textContent).not.toContain('°');
  });
});
