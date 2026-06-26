import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useLanguageStore } from '@almamesh/store';

import '../../../i18n/config';
import { WhatYouCanDoSection } from './WhatYouCanDoSection';

describe('WhatYouCanDoSection', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders the section title', () => {
    render(<WhatYouCanDoSection />);
    expect(screen.getByRole('heading', { name: 'What you can do' })).toBeTruthy();
  });

  it('renders the rectification as a prominent featured card', () => {
    render(<WhatYouCanDoSection />);
    const card = screen.getByTestId('features-rectify');
    expect(card.textContent).toContain('The honesty point');
    expect(card.textContent).toContain('Rectify your birth time');
    expect(card.textContent).toContain('an honest chart needs an honest time');
  });

  it('renders the four capability items from i18n', () => {
    render(<WhatYouCanDoSection />);
    expect(screen.getByText('Cast your chart')).toBeTruthy();
    expect(screen.getByText('Bring your own AI')).toBeTruthy();
    expect(screen.getByText('Chat with your chart')).toBeTruthy();
    expect(screen.getByText('See your timing')).toBeTruthy();
    // The four capabilities are a list of one <li> per item.
    const items = screen.getByRole('list').querySelectorAll('li');
    expect(items.length).toBe(4);
  });

  it('keeps the "narrates, never invents" honesty framing', () => {
    render(<WhatYouCanDoSection />);
    expect(screen.getByText(/narrates the engine's output, never invents it/)).toBeTruthy();
  });
});
