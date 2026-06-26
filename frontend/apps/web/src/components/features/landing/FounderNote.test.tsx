import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useLanguageStore } from '@almamesh/store';

import '../../../i18n/config';
import { FounderNote } from './FounderNote';

describe('FounderNote', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders the signature verbatim', () => {
    render(<FounderNote />);
    expect(screen.getByTestId('founder-signature').textContent).toBe('— Harish');
  });

  it('renders the approved founder paragraphs verbatim', () => {
    render(<FounderNote />);
    expect(
      screen.getByText(/an honest experiment can't be a sales funnel, and a gift shouldn't have a paywall/i),
    ).toBeTruthy();
  });
});
