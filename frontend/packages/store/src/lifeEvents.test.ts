import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';

import {
  isStructuredLifeEvent,
  lifeEventsStoreCreator,
  migrateLifeEventsPersistedState,
  type LifeEvent,
  type LifeEventsStore,
} from './lifeEvents';

function newStore() {
  return createStore<LifeEventsStore>(lifeEventsStoreCreator);
}

// ---------------------------------------------------------------------------
// isStructuredLifeEvent
// ---------------------------------------------------------------------------

describe('isStructuredLifeEvent', () => {
  it('returns true when both date and category are truthy', () => {
    const e = { id: 'e1', date: '2015-06-01', category: 'marriage', createdAt: '2024-01-01T00:00:00.000Z' } as LifeEvent;
    expect(isStructuredLifeEvent(e)).toBe(true);
  });

  it('returns false when date is an empty string', () => {
    const e = { id: 'e1', date: '', category: 'marriage', createdAt: '2024-01-01T00:00:00.000Z' } as LifeEvent;
    expect(isStructuredLifeEvent(e)).toBe(false);
  });

  it('returns false when category is absent', () => {
    const e = { id: 'e1', date: '2015-06-01', createdAt: '2024-01-01T00:00:00.000Z' } as LifeEvent;
    expect(isStructuredLifeEvent(e)).toBe(false);
  });

  it('returns false for a migrated draft (empty date + no category + needsStructuring)', () => {
    const e = { id: 'e1', date: '', note: 'Got married', needsStructuring: true, createdAt: '2024-01-01T00:00:00.000Z' } as LifeEvent;
    expect(isStructuredLifeEvent(e)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// migrateLifeEventsPersistedState — v1→v2 promotion
// ---------------------------------------------------------------------------

describe('migrateLifeEventsPersistedState (defensive hydration)', () => {
  it('does NOT throw on a malformed / corrupt blob, returns a clean empty map', () => {
    for (const corrupt of [null, undefined, 'oops', 42, [], {}, { eventsByProfile: 'x' }, { eventsByProfile: 9 }]) {
      expect(() => migrateLifeEventsPersistedState(corrupt, 0)).not.toThrow();
      expect(migrateLifeEventsPersistedState(corrupt, 0)).toEqual({ eventsByProfile: {} });
    }
  });

  it('v1→v2: promotes a legacy {description} event to a needsStructuring draft preserving text in note', () => {
    const blob = {
      eventsByProfile: {
        p1: [{ id: 'e1', description: 'Got married', createdAt: '2024-01-01T00:00:00.000Z' }],
      },
    };
    const result = migrateLifeEventsPersistedState(blob, 1);
    const event = result.eventsByProfile['p1']?.[0] as LifeEvent;
    expect(event.note).toBe('Got married');
    expect(event.date).toBe('');
    expect(event.needsStructuring).toBe(true);
    expect(event.category).toBeUndefined();
    expect(event.id).toBe('e1');
    expect(event.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('v1→v2: migration also runs for fromVersion 0', () => {
    const blob = {
      eventsByProfile: {
        p1: [{ id: 'e2', description: 'Career change', createdAt: '2023-05-01T00:00:00.000Z' }],
      },
    };
    const result = migrateLifeEventsPersistedState(blob, 0);
    const event = result.eventsByProfile['p1']?.[0] as LifeEvent;
    expect(event.note).toBe('Career change');
    expect(event.needsStructuring).toBe(true);
  });

  it('v1→v2: a v1 event that had a date loses the date on migration (date becomes "", needsStructuring: true, description preserved in note)', () => {
    // Documents the intentional date-loss behavior: v1 events have unverified
    // free-text dates so they become drafts requiring the user to re-enter a
    // structured date in the wizard.
    const blob = {
      eventsByProfile: {
        p1: [{ id: 'e4', description: 'Got married', date: '2015-06-01', createdAt: '2015-06-02T00:00:00.000Z' }],
      },
    };
    const result = migrateLifeEventsPersistedState(blob, 1);
    const event = result.eventsByProfile['p1']?.[0] as LifeEvent;
    expect(event.note).toBe('Got married');
    expect(event.date).toBe('');
    expect(event.needsStructuring).toBe(true);
    expect(event.id).toBe('e4');
    expect(event.createdAt).toBe('2015-06-02T00:00:00.000Z');
    // category must NOT be copied from the old record
    expect(event.category).toBeUndefined();
  });

  it('v2 blobs (fromVersion >= 2) pass through without re-migration (event with note)', () => {
    const v2event: LifeEvent = {
      id: 'e3',
      note: 'Already structured',
      date: '2022-01-01',
      category: 'relocation',
      createdAt: '2022-01-01T00:00:00.000Z',
    };
    const blob = { eventsByProfile: { p1: [v2event] } };
    const result = migrateLifeEventsPersistedState(blob, 2);
    expect(result.eventsByProfile['p1']?.[0]).toEqual(v2event);
  });

  it('v2 clean structured event (no note, no needsStructuring) passes through unchanged when fromVersion >= 2', () => {
    // Guards against regression where the migration would wrongly demote a
    // fully-structured v2 event that has neither `note` nor `needsStructuring`.
    const cleanV2: LifeEvent = {
      id: 'e5',
      date: '2022-06-15',
      category: 'marriage',
      createdAt: '2022-06-15T10:00:00.000Z',
    };
    const blob = { eventsByProfile: { p1: [cleanV2] } };
    const result = migrateLifeEventsPersistedState(blob, 2);
    expect(result.eventsByProfile['p1']?.[0]).toEqual(cleanV2);
  });
});

// ---------------------------------------------------------------------------
// lifeEventsStore — existing behaviour (updated for v2 shape)
// ---------------------------------------------------------------------------

describe('lifeEventsStore', () => {
  let store: ReturnType<typeof newStore>;

  beforeEach(() => {
    store = newStore();
  });

  it('round-trips: setEvents then getEvents preserves description + optional date', () => {
    store.getState().setEvents('profile-a', [
      { description: 'Got married', date: '2015-06-01' },
      { description: 'Changed careers' },
    ]);

    const events = store.getState().getEvents('profile-a');
    expect(events).toHaveLength(2);
    expect(events[0].description).toBe('Got married');
    expect(events[0].date).toBe('2015-06-01');
    expect(events[1].description).toBe('Changed careers');
    // v2: missing date becomes empty string, not undefined
    expect(events[1].date).toBe('');
    // Each persisted event gets a stable id + creation timestamp.
    expect(events[0].id).toBeTruthy();
    expect(typeof events[0].createdAt).toBe('string');
    expect(events[0].id).not.toBe(events[1].id);
  });

  it('returns an empty array for a profile with no events', () => {
    expect(store.getState().getEvents('nobody')).toEqual([]);
  });

  it('isolates events per profile', () => {
    store.getState().setEvents('profile-a', [{ description: 'A event' }]);
    store.getState().setEvents('profile-b', [{ description: 'B event' }]);

    expect(store.getState().getEvents('profile-a')).toHaveLength(1);
    expect(store.getState().getEvents('profile-a')[0].description).toBe('A event');
    expect(store.getState().getEvents('profile-b')[0].description).toBe('B event');
  });

  it('setEvents replaces the profile prior events', () => {
    store.getState().setEvents('p', [{ description: 'first' }]);
    store.getState().setEvents('p', [{ description: 'second' }, { description: 'third' }]);
    const events = store.getState().getEvents('p');
    expect(events.map((e) => e.description)).toEqual(['second', 'third']);
  });

  it('addEvent appends to a profile existing events', () => {
    store.getState().setEvents('p', [{ description: 'first' }]);
    store.getState().addEvent('p', { description: 'second', date: '2020-01-01' });
    const events = store.getState().getEvents('p');
    expect(events.map((e) => e.description)).toEqual(['first', 'second']);
    expect(events[1].date).toBe('2020-01-01');
  });

  it('clearEvents removes a profile events', () => {
    store.getState().setEvents('p', [{ description: 'x' }]);
    store.getState().clearEvents('p');
    expect(store.getState().getEvents('p')).toEqual([]);
  });

  it('ignores blank descriptions on setEvents (only meaningful notes persist)', () => {
    store.getState().setEvents('p', [{ description: '   ' }, { description: 'real' }]);
    expect(store.getState().getEvents('p').map((e) => e.description)).toEqual(['real']);
  });
});

// ---------------------------------------------------------------------------
// editEvent / removeEvent
// ---------------------------------------------------------------------------

describe('editEvent', () => {
  let store: ReturnType<typeof newStore>;

  beforeEach(() => {
    store = newStore();
    store.getState().setEvents('p', [
      { description: 'Got married', date: '2015-06-01' },
      { description: 'Started job', date: '2018-03-15' },
    ]);
  });

  it('patches a single event without touching other events', () => {
    const [e1, e2] = store.getState().getEvents('p');
    store.getState().editEvent('p', e1.id, { category: 'marriage', needsStructuring: false });
    const updated = store.getState().getEvents('p');
    // Patched fields
    expect(updated[0].category).toBe('marriage');
    expect(updated[0].needsStructuring).toBe(false);
    // Unchanged fields survive the patch
    expect(updated[0].date).toBe('2015-06-01');
    expect(updated[0].description).toBe('Got married');
    // Second event completely untouched
    expect(updated[1].id).toBe(e2.id);
    expect(updated[1].category).toBeUndefined();
  });

  it('can patch the date field', () => {
    const [e1] = store.getState().getEvents('p');
    store.getState().editEvent('p', e1.id, { date: '2015-07-04' });
    expect(store.getState().getEvents('p')[0].date).toBe('2015-07-04');
  });

  it('can patch the note field', () => {
    const [e1] = store.getState().getEvents('p');
    store.getState().editEvent('p', e1.id, { note: 'Updated text' });
    expect(store.getState().getEvents('p')[0].note).toBe('Updated text');
  });

  it('is a no-op for an unknown id (state unchanged)', () => {
    const before = store.getState().getEvents('p');
    store.getState().editEvent('p', 'nonexistent-id', { date: '2020-01-01' });
    expect(store.getState().getEvents('p')).toEqual(before);
  });

  it('is a no-op for an unknown profileId', () => {
    store.getState().editEvent('other-profile', 'any-id', { date: '2020-01-01' });
    expect(store.getState().getEvents('other-profile')).toEqual([]);
  });
});

describe('removeEvent', () => {
  let store: ReturnType<typeof newStore>;

  beforeEach(() => {
    store = newStore();
    store.getState().setEvents('p', [
      { description: 'first' },
      { description: 'second' },
      { description: 'third' },
    ]);
  });

  it('deletes the matching event and preserves order of others', () => {
    const [, e2] = store.getState().getEvents('p');
    store.getState().removeEvent('p', e2.id);
    const events = store.getState().getEvents('p');
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.description)).toEqual(['first', 'third']);
  });

  it('removes the only event, leaving an empty array', () => {
    store.getState().setEvents('p', [{ description: 'solo' }]);
    const [solo] = store.getState().getEvents('p');
    store.getState().removeEvent('p', solo.id);
    expect(store.getState().getEvents('p')).toEqual([]);
  });

  it('is a no-op for an unknown id (state unchanged)', () => {
    const before = store.getState().getEvents('p');
    store.getState().removeEvent('p', 'nonexistent-id');
    expect(store.getState().getEvents('p')).toEqual(before);
  });

  it('is a no-op for an unknown profileId', () => {
    store.getState().removeEvent('other-profile', 'any-id');
    expect(store.getState().getEvents('other-profile')).toEqual([]);
  });
});
