import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';

import type { VedicInterpretation } from '@almamesh/shared-types';

import {
  interpretationStoreCreator,
  migrateInterpretationPersistedState,
  type InterpretationStore,
} from './interpretation';

function newStore() {
  return createStore<InterpretationStore>(interpretationStoreCreator);
}

/** Minimal valid `VedicInterpretation` — only the required fields. */
function makeInterpretation(summary = 'A bright Jupiter year.'): VedicInterpretation {
  return {
    summary: { layman: summary, technical: summary },
    strengths: [],
    challenges: [],
    life_themes: [],
  };
}

describe('migrateInterpretationPersistedState (defensive hydration)', () => {
  it('passes a valid previous-shape blob through unchanged', () => {
    const blob = { byChart: { c1: { status: 'complete', sections: {} } } };
    expect(migrateInterpretationPersistedState(blob, 0)).toEqual(blob);
  });

  it('does NOT throw on a malformed / corrupt blob, returns a clean empty map', () => {
    for (const corrupt of [null, undefined, 'oops', 42, [], {}, { byChart: 'x' }, { byChart: 5 }]) {
      expect(() => migrateInterpretationPersistedState(corrupt, 0)).not.toThrow();
      expect(migrateInterpretationPersistedState(corrupt, 0)).toEqual({ byChart: {} });
    }
  });

  it('normalizes a v1 entry whose summary is a bare string into a dual-mode Persona', () => {
    const v1 = {
      byChart: {
        c1: {
          status: 'complete',
          sections: {},
          interpretation: {
            summary: 'A grounded, determined chart.',
            strengths: [],
            challenges: [],
            life_themes: [],
          },
        },
      },
    };
    const migrated = migrateInterpretationPersistedState(v1, 1);
    expect(migrated.byChart.c1?.interpretation?.summary).toEqual({
      layman: 'A grounded, determined chart.',
      technical: 'A grounded, determined chart.',
    });
  });

  it('leaves an already-dual-mode summary Persona untouched', () => {
    const v2 = {
      byChart: {
        c1: {
          status: 'complete',
          sections: {},
          interpretation: {
            summary: { layman: 'plain', technical: 'Saturn in the 10th' },
            strengths: [],
            challenges: [],
            life_themes: [],
          },
        },
      },
    };
    const migrated = migrateInterpretationPersistedState(v2, 2);
    expect(migrated.byChart.c1?.interpretation?.summary).toEqual({
      layman: 'plain',
      technical: 'Saturn in the 10th',
    });
  });

  it('preserves an entry that has no interpretation yet (e.g. status generating)', () => {
    const v1 = { byChart: { c1: { status: 'generating', sections: {} } } };
    const migrated = migrateInterpretationPersistedState(v1, 1);
    expect(migrated.byChart.c1).toEqual({ status: 'generating', sections: {} });
  });
});

describe('interpretationStore', () => {
  it('startInterpretation sets status to generating with empty sections', () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('generating');
    expect(entry?.sections).toEqual({});
    expect(entry?.interpretation).toBeUndefined();
  });

  it('markSectionComplete records per-section progress', () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    store.getState().markSectionComplete('c1', 'strengths');
    store.getState().markSectionComplete('c1', 'career');
    expect(store.getState().getEntry('c1')?.sections).toEqual({
      strengths: true,
      career: true,
    });
    // Still generating until the full object lands.
    expect(store.getState().getEntry('c1')?.status).toBe('generating');
  });

  it('markSectionComplete works even without an explicit start', () => {
    const store = newStore();
    store.getState().markSectionComplete('c1', 'summary');
    const entry = store.getState().getEntry('c1');
    expect(entry?.sections).toEqual({ summary: true });
    expect(entry?.status).toBe('idle');
  });

  it('setInterpretation stores the object and marks complete', () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    store.getState().markSectionComplete('c1', 'strengths');
    const interpretation = makeInterpretation();
    store.getState().setInterpretation('c1', interpretation, '2026-06-01T00:00:00.000Z');
    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('complete');
    expect(entry?.interpretation).toBe(interpretation);
    expect(entry?.updatedAt).toBe('2026-06-01T00:00:00.000Z');
    // Prior section progress is preserved.
    expect(entry?.sections).toEqual({ strengths: true });
    expect(entry?.error).toBeUndefined();
  });

  it('setError sets status to error and records the message', () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    store.getState().setError('c1', 'LLM endpoint unreachable');
    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('error');
    expect(entry?.error).toBe('LLM endpoint unreachable');
  });

  it('getEntry returns undefined for an unknown chart', () => {
    const store = newStore();
    expect(store.getState().getEntry('missing')).toBeUndefined();
  });

  it('reset removes a chart entry entirely', () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    store.getState().reset('c1');
    expect(store.getState().getEntry('c1')).toBeUndefined();
  });

  it('keeps entries keyed per chartId independently', () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    store.getState().setInterpretation('c2', makeInterpretation('Mars-led drive.'), '2026-06-01T01:00:00.000Z');
    store.getState().setError('c3', 'boom');

    expect(store.getState().getEntry('c1')?.status).toBe('generating');
    expect(store.getState().getEntry('c2')?.status).toBe('complete');
    expect(store.getState().getEntry('c3')?.status).toBe('error');

    // Resetting one leaves the others untouched.
    store.getState().reset('c2');
    expect(store.getState().getEntry('c2')).toBeUndefined();
    expect(store.getState().getEntry('c1')?.status).toBe('generating');
    expect(store.getState().getEntry('c3')?.status).toBe('error');
  });
});

describe('interpretationStore — upcoming_periods section compatibility', () => {
  it('loads a legacy saved reading WITHOUT upcoming_periods (5-section readings keep working)', () => {
    const store = newStore();
    // A pre-period-intelligence reading: the 6th section never existed.
    const legacy = makeInterpretation('Saved before the Road Ahead section existed.');
    expect('upcoming_periods' in legacy).toBe(false);
    store.getState().setInterpretation('c1', legacy, '2026-01-01T00:00:00.000Z');
    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('complete');
    expect(entry?.interpretation?.summary).toEqual({
      layman: 'Saved before the Road Ahead section existed.',
      technical: 'Saved before the Road Ahead section existed.',
    });
    expect(entry?.interpretation?.upcoming_periods).toBeUndefined();
  });

  it('round-trips a reading WITH the upcoming_periods section', () => {
    const store = newStore();
    const withRoadAhead: VedicInterpretation = {
      ...makeInterpretation(),
      upcoming_periods: [
        {
          title: 'Sun antardasha — 2027-01 to 2028-01',
          layman: 'A year where your work becomes visible.',
          technical: 'The Sun period foregrounds the houses it rules.',
        },
      ],
    };
    store.getState().setInterpretation('c1', withRoadAhead, '2026-06-11T00:00:00.000Z');
    const entry = store.getState().getEntry('c1');
    expect(entry?.interpretation?.upcoming_periods).toHaveLength(1);
    expect(entry?.interpretation?.upcoming_periods?.[0]?.title).toBe(
      'Sun antardasha — 2027-01 to 2028-01',
    );
  });
});
