/**
 * EventEntryStep — structured life-event entry UI (slice 1, entry only).
 *
 * Tests assert:
 *  - existing store rows render as EventRow elements
 *  - "Add Event" appends a draft row
 *  - editing date / category / note calls editEvent (store state updated)
 *  - delete button calls removeEvent (store state updated)
 *  - Continue is disabled until ≥1 event has both date + category
 *  - category <select> options show localized labels, not raw enum values
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useLifeEventsStore, useLanguageStore, type LifeEvent } from '@almamesh/store';

import '../../../i18n/config';
import { EventEntryStep } from './EventEntryStep';

const PROFILE_ID = 'test-profile';

/** Seed the store directly — bypasses idb-keyval, operates on in-memory state. */
function setupEvents(events: readonly LifeEvent[]) {
  useLifeEventsStore.setState({
    eventsByProfile: { [PROFILE_ID]: events },
  });
}

describe('EventEntryStep', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
    useLifeEventsStore.setState({ eventsByProfile: {} });
  });

  it('renders the step title and subtitle', () => {
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    expect(screen.getByText('Your Life Events')).toBeTruthy();
    expect(screen.getByText(/Add dates of key events/i)).toBeTruthy();
  });

  it('renders existing store events as EventRow elements', () => {
    setupEvents([
      { id: 'e1', date: '2020-01-15', category: 'marriage', createdAt: '2020-01-01T00:00:00Z' },
    ]);
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2020-01-15');
    // The stored category should be pre-selected in the <select>
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('marriage');
  });

  it('"Add Event" appends a draft row to the store', () => {
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    expect(useLifeEventsStore.getState().eventsByProfile[PROFILE_ID]).toBeUndefined();
    fireEvent.click(screen.getByText('Add Event'));
    expect(useLifeEventsStore.getState().eventsByProfile[PROFILE_ID]?.length).toBe(1);
  });

  it('editing the date input calls editEvent and updates the store', () => {
    setupEvents([{ id: 'e1', date: '', createdAt: '2020-01-01T00:00:00Z' }]);
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2022-03-10' } });
    expect(useLifeEventsStore.getState().eventsByProfile[PROFILE_ID]?.[0].date).toBe('2022-03-10');
  });

  it('editing the category select calls editEvent and updates the store', () => {
    setupEvents([{ id: 'e1', date: '2020-01-01', createdAt: '2020-01-01T00:00:00Z' }]);
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'promotion' } });
    expect(useLifeEventsStore.getState().eventsByProfile[PROFILE_ID]?.[0].category).toBe('promotion');
  });

  it('editing the note input calls editEvent and updates the store', () => {
    setupEvents([{ id: 'e1', date: '2020-01-01', createdAt: '2020-01-01T00:00:00Z' }]);
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'civil ceremony' },
    });
    expect(useLifeEventsStore.getState().eventsByProfile[PROFILE_ID]?.[0].note).toBe('civil ceremony');
  });

  it('delete button removes the event from the store', () => {
    setupEvents([
      { id: 'e1', date: '2020-01-15', category: 'marriage', createdAt: '2020-01-01T00:00:00Z' },
    ]);
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    fireEvent.click(screen.getByLabelText('Delete'));
    expect(useLifeEventsStore.getState().eventsByProfile[PROFILE_ID]?.length).toBe(0);
  });

  it('Continue is disabled with no events', () => {
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('Continue is disabled when an event has date but no category', () => {
    setupEvents([{ id: 'e1', date: '2020-01-01', createdAt: '2020-01-01T00:00:00Z' }]);
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('Continue is enabled when at least one event has both date and category', () => {
    setupEvents([
      { id: 'e1', date: '2020-01-15', category: 'marriage', createdAt: '2020-01-01T00:00:00Z' },
    ]);
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('category <select> options render localized labels, not raw enum values', () => {
    setupEvents([{ id: 'e1', date: '', createdAt: '2020-01-01T00:00:00Z' }]);
    render(<EventEntryStep profileId={PROFILE_ID} onContinue={() => {}} />);
    // Localized labels present
    expect(screen.getByRole('option', { name: 'Marriage' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Career Change' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Higher Studies' })).toBeTruthy();
    // Raw enum values NOT present as option labels
    expect(screen.queryByRole('option', { name: 'marriage' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'career_change' })).toBeNull();
  });
});
