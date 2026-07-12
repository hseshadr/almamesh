/**
 * ReportDomains — Stage-2 rigor: each life-domain block leads with a CALIBRATED
 * headline strength % (the weaker of the two anchored axes), backed by a
 * two-axis ledger (Śaḍbala % · Aṣṭakavarga %) and its epistemic-tier label
 * ("model estimate"). The headline % must equal min(shadbala%, sav%) — a domain
 * is only as strong as its weaker classical signal — and every % must visibly
 * name that it is a MODEL output, never a measured fact (honesty covenant §0.6).
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import '../../../../i18n/config';
import { ReportDomains } from '../ReportDomains';
import { DOMAINS_CTX } from '../../../../test/predictiveFixtures';

describe('ReportDomains — calibrated headline % + two-axis ledger', () => {
  it('leads a strong domain with the headline % (= the weaker axis) and its band', () => {
    render(<ReportDomains domainsCtx={DOMAINS_CTX} />);
    const career = screen.getByTestId('report-domain-career');
    // fixture: shadbala 82.5% -> 83%, SAV 53.57% -> 54%; headline = min = 54%.
    const pct = career.querySelector('.report-strength-pct');
    expect(pct?.textContent).toBe('54%');
    // the band word survives as a letterpress word beside the %.
    expect(career.querySelector('.report-domain-band')?.textContent).toContain('Strong');
  });

  it('shows the two-axis ledger with both anchored axes and the model-tier label', () => {
    render(<ReportDomains domainsCtx={DOMAINS_CTX} />);
    const ledger = within(screen.getByTestId('report-domain-career')).getByText(
      /Śaḍbala/,
    );
    expect(ledger.textContent).toContain('Śaḍbala 83%');
    expect(ledger.textContent).toContain('Aṣṭakavarga 54%');
    // every surfaced % names its epistemic tier — model, not measured.
    expect(ledger.textContent).toContain('model estimate');
  });

  it('renders a weak domain honestly with a low headline % and Weak band', () => {
    render(<ReportDomains domainsCtx={DOMAINS_CTX} />);
    const health = screen.getByTestId('report-domain-health');
    // fixture health: shadbala 38% / SAV 30% -> headline = min = 30%.
    expect(health.querySelector('.report-strength-pct')?.textContent).toBe('30%');
    expect(health.querySelector('.report-domain-band')?.textContent).toContain('Weak');
  });

  it('keeps the raw substrate line (graha · rūpas · SAV bindus) as the audit trail', () => {
    render(<ReportDomains domainsCtx={DOMAINS_CTX} />);
    const career = screen.getByTestId('report-domain-career');
    // never leak full-precision rūpas into print.
    expect(career.textContent).toContain('6.13');
    expect(career.textContent).not.toContain('6.128260954302394');
  });
});
