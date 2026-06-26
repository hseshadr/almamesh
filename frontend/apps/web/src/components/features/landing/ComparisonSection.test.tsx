import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useLanguageStore } from '@almamesh/store';

import '../../../i18n/config';
import { ComparisonSection } from './ComparisonSection';

describe('ComparisonSection', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders the "gift, not a scheme" anchor line', () => {
    render(<ComparisonSection />);
    expect(screen.getByTestId('why-anchor').textContent).toContain(
      'handed down for the benefit of all — a gift, not a scheme',
    );
  });

  it('renders all six comparison rows (AlmaMesh vs the paid pattern)', () => {
    render(<ComparisonSection />);
    expect(screen.getByText('Free, forever — no paywall')).toBeTruthy();
    expect(screen.getByText(/Subscriptions/)).toBeTruthy();
    // The two-column ledger is a list of one <li> per row.
    const rows = screen.getByRole('list').querySelectorAll('li');
    expect(rows.length).toBe(6);
  });
});
