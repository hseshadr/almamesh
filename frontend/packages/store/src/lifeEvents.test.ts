import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';

import {
  lifeEventsStoreCreator,
  migrateLifeEventsPersistedState,
  type LifeEventsStore,
} from './lifeEvents';

function newStore() {
  return createStore<LifeEventsStore>(lifeEventsStoreCreator);
}

describe('migrateLifeEventsPersistedState (defensive hydration)', () => {
  it('passes a valid previous-shape blob through unchanged', () => {
    const blob = {
      eventsByProfile: {
        p1: [{ id: 'e1', description: 'Married', date: '2015-06-01', createdAt: '2024-01-01T00:00:00.000Z' }],
      },
    };
    expect(migrateLifeEventsPersistedState(blob, 0)).toEqual(blob);
  });

  it('does NOT throw on a malformed / corrupt blob, returns a clean empty map', () => {
    for (const corrupt of [null, undefined, 'oops', 42, [], {}, { eventsByProfile: 'x' }, { eventsByProfile: 9 }]) {
      expect(() => migrateLifeEventsPersistedState(corrupt, 0)).not.toThrow();
      expect(migrateLifeEventsPersistedState(corrupt, 0)).toEqual({ eventsByProfile: {} });
    }
  });
});

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
    expect(events[1].date).toBeUndefined();
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
