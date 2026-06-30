/**
 * GatheredTray — collapsible sticky tray tests.
 *
 * Tests assert:
 *  - collapsed bar shows the structured-event count (not unstructured events)
 *  - aria-expanded reflects the expanded prop
 *  - clicking the bar calls onToggle
 *  - expanded: N EventRows rendered for N store events
 *  - CTA disabled with 0 structured events, enabled with ≥1
 *  - clicking the CTA fires onContinue
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useLifeEventsStore, useLanguageStore, type LifeEvent } from '@almamesh/store';

import '../../../i18n/config';
import { GatheredTray } from './GatheredTray';

const PROFILE_ID = 'test-profile';

/** Structured event: has both date and category. */
const STRUCTURED_1: LifeEvent = {
  id: 'e1',
  date: '2020-01-15',
  category: 'marriage',
  createdAt: '2020-01-01T00:00:00Z',
};
const STRUCTURED_2: LifeEvent = {
  id: 'e2',
  date: '2015-06-01',
  category: 'promotion',
  createdAt: '2015-01-01T00:00:00Z',
};
/** Unstructured event: no category → isStructuredLifeEvent returns false. */
const UNSTRUCTURED: LifeEvent = {
  id: 'e3',
  date: '',
  createdAt: '2019-01-01T00:00:00Z',
};

function seedEvents(events: readonly LifeEvent[]) {
  useLifeEventsStore.setState({ eventsByProfile: { [PROFILE_ID]: events } });
}

describe('GatheredTray', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
    useLifeEventsStore.setState({ eventsByProfile: {} });
  });

  // ── Collapsed state ──────────────────────────────────────────────────────

  it('collapsed: shows the structured-event count (2 structured + 1 unstructured → "2")', () => {
    seedEvents([STRUCTURED_1, STRUCTURED_2, UNSTRUCTURED]);
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={false}
        onToggle={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    // Must show "2 events" — unstructured (no category) does not count.
    expect(screen.getByText(/2 events gathered/i)).toBeTruthy();
  });

  it('collapsed: toggle button aria-expanded is "false"', () => {
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={false}
        onToggle={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /gathered/i });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('collapsed: clicking the bar calls onToggle', () => {
    const onToggle = vi.fn();
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={false}
        onToggle={onToggle}
        onContinue={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /gathered/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  // ── Expanded state ───────────────────────────────────────────────────────

  it('expanded: renders one EventRow per event in the store', () => {
    seedEvents([STRUCTURED_1, STRUCTURED_2]);
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={true}
        onToggle={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('event-row')).toHaveLength(2);
  });

  it('expanded: toggle button aria-expanded is "true"', () => {
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={true}
        onToggle={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /gathered/i });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('expanded: CTA "Find my rising sign" is disabled with 0 structured events', () => {
    seedEvents([UNSTRUCTURED]);
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={true}
        onToggle={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    const cta = screen.getByRole('button', { name: /rising sign/i }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it('expanded: CTA is enabled with ≥1 structured event', () => {
    seedEvents([STRUCTURED_1]);
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={true}
        onToggle={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    const cta = screen.getByRole('button', { name: /rising sign/i }) as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
  });

  it('expanded: clicking the CTA fires onContinue', () => {
    const onContinue = vi.fn();
    seedEvents([STRUCTURED_1]);
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={true}
        onToggle={vi.fn()}
        onContinue={onContinue}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /rising sign/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('expanded: renders the summary text for an event so events are distinguishable at a glance', () => {
    seedEvents([{ ...STRUCTURED_1, summary: 'Moved to Bangalore in 1991' }]);
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={true}
        onToggle={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Moved to Bangalore in 1991')).toBeTruthy();
  });

  it('expanded: editing the summary field calls editEvent with the new summary', () => {
    seedEvents([{ ...STRUCTURED_1, summary: 'old text' }]);
    const spy = vi.spyOn(useLifeEventsStore.getState(), 'editEvent');
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={true}
        onToggle={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByDisplayValue('old text'), {
      target: { value: 'Moved to Pune for a new role' },
    });
    expect(spy).toHaveBeenCalledWith(PROFILE_ID, 'e1', { summary: 'Moved to Pune for a new role' });
    spy.mockRestore();
  });

  it('expanded: clicking "Add event" calls addEvent for the profile', () => {
    seedEvents([STRUCTURED_1]);
    const spy = vi.spyOn(useLifeEventsStore.getState(), 'addEvent');
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={true}
        onToggle={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /add event/i }));
    expect(spy).toHaveBeenCalledWith(PROFILE_ID, expect.objectContaining({ description: 'new' }));
    spy.mockRestore();
  });

  it('expanded: continueDisabled=true disables CTA even with ≥1 structured event', () => {
    seedEvents([STRUCTURED_1]);
    render(
      <GatheredTray
        profileId={PROFILE_ID}
        expanded={true}
        onToggle={vi.fn()}
        onContinue={vi.fn()}
        continueDisabled={true}
      />,
    );
    const cta = screen.getByRole('button', { name: /rising sign/i }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });
});
