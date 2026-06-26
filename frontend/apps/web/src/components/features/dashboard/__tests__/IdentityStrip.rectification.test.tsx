/**
 * IdentityStrip — the rectification line.
 *
 * When a `rectification` delta is supplied (the chart was computed from a
 * rectified birth time), the strip renders ONE quiet honesty line naming the
 * entered → rectified clocks and the signed minute adjustment. When it is null
 * (no rectification in effect) the line is absent entirely. Display only — the
 * delta is the engine path's two clocks, never recomputed here.
 *
 * All data is SYNTHETIC (a "Reference Native" — never the owner's real birth).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLanguageStore } from '@almamesh/store';

import i18n from '../../../../i18n/config';
import { IdentityStrip } from '../IdentityStrip';
import type { RectificationDelta } from '../../../../lib/rectification';

function renderStrip(rectification?: RectificationDelta | null) {
  return render(
    <MemoryRouter>
      <IdentityStrip
        name="Reference Native"
        lagna={{ sign: 'Aquarius', longitude: 312.5, nakshatra: 'Shatabhisha', nakshatraPada: 2 }}
        moon={{ sign: 'Leo' }}
        rectification={rectification}
      />
    </MemoryRouter>,
  );
}

describe('IdentityStrip rectification line', () => {
  beforeEach(async () => {
    useLanguageStore.setState({ language: 'en' });
    await i18n.changeLanguage('en');
  });

  it('renders nothing when no rectification is in effect (null)', () => {
    renderStrip(null);
    expect(screen.queryByTestId('identity-rectification')).toBeNull();
  });

  it('renders nothing when the rectification prop is omitted', () => {
    renderStrip();
    expect(screen.queryByTestId('identity-rectification')).toBeNull();
  });

  it('renders a quiet line with a forward (+) adjustment', () => {
    renderStrip({ deltaMinutes: 15, enteredLabel: '5:45 AM', rectifiedLabel: '6:00 AM' });
    const line = screen.getByTestId('identity-rectification');
    expect(line.textContent).toContain('5:45 AM');
    expect(line.textContent).toContain('6:00 AM');
    expect(line.textContent).toContain('+15');
    // The signed minutes are positive → a "+" sign, not a "−".
    expect(line.textContent).not.toContain('−15');
  });

  it('renders a backward (−) adjustment with the absolute minute count', () => {
    renderStrip({ deltaMinutes: -30, enteredLabel: '6:00 AM', rectifiedLabel: '5:30 AM' });
    const line = screen.getByTestId('identity-rectification');
    expect(line.textContent).toContain('6:00 AM');
    expect(line.textContent).toContain('5:30 AM');
    // Signed with the minus glyph + the ABSOLUTE minute count (never "-30").
    expect(line.textContent).toContain('−30');
    expect(line.textContent).not.toContain('-30');
  });
});
