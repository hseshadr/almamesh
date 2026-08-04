import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';

import type { VedicInterpretation } from '@almamesh/shared-types';

import {
  INTERPRETATION_PERSIST_VERSION,
  interpretationStoreCreator,
  mergeInterpretationPersistedState,
  migrateInterpretationPersistedState,
  useInterpretationStore,
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
    const blob = {
      byChart: { c1: { status: 'complete', sections: {}, profileId: 'profile-1' } },
    };
    expect(migrateInterpretationPersistedState(blob, INTERPRETATION_PERSIST_VERSION)).toEqual(blob);
  });

  it('v4 migration preserves existing ownerless readings without deleting explicit ownership', () => {
    const v4 = {
      byChart: {
        ambiguous: { status: 'complete', sections: {} },
        survivor: { status: 'complete', sections: {}, profileId: 'survivor' },
      },
    };

    const migrated = migrateInterpretationPersistedState(v4, 4);

    expect(migrated.byChart.ambiguous).toEqual({ status: 'complete', sections: {} });
    expect(migrated.byChart.survivor?.profileId).toBe('survivor');
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
          profileId: 'profile-1',
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
          profileId: 'profile-1',
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

  it('preserves an entry that has no interpretation yet (e.g. status error)', () => {
    // NOTE: 'generating' is deliberately NOT preserved anymore — a persisted
    // in-flight status is always an interrupted run (streams don't survive
    // reloads) and used to hydrate as an eternal "Generating…" dead-end.
    // See the hydrate-healing describe block below.
    const v1 = {
      byChart: {
        c1: { status: 'error', error: 'boom', sections: {}, profileId: 'profile-1' },
      },
    };
    const migrated = migrateInterpretationPersistedState(v1, 1);
    expect(migrated.byChart.c1).toEqual({
      status: 'error',
      error: 'boom',
      sections: {},
      profileId: 'profile-1',
    });
  });
});

describe('interpretationStore', () => {
  it('backfills only provable legacy ownership without overwriting explicit owners', () => {
    const store = newStore();
    store.setState({
      byChart: {
        attributable: { status: 'complete', sections: {} },
        ambiguous: { status: 'complete', sections: {} },
        explicit: { status: 'complete', sections: {}, profileId: 'survivor' },
      },
    });

    store.getState().backfillProfileOwnership({
      attributable: 'target',
      explicit: 'target',
    });

    expect(store.getState().getEntry('attributable')?.profileId).toBe('target');
    expect(store.getState().getEntry('ambiguous')?.profileId).toBeUndefined();
    expect(store.getState().getEntry('explicit')?.profileId).toBe('survivor');
  });

  it('stays in-memory when an SSR host exposes a partial localStorage global', () => {
    const original = globalThis.localStorage;
    (globalThis as { localStorage?: Partial<Storage> }).localStorage = {};
    try {
      expect(() => useInterpretationStore.getState().startInterpretation('ssr-chart')).not.toThrow();
      expect(useInterpretationStore.getState().getEntry('ssr-chart')?.status).toBe('generating');
    } finally {
      (globalThis as { localStorage?: Partial<Storage> }).localStorage = original;
      useInterpretationStore.getState().reset('ssr-chart');
    }
  });

  it('rejects a late completion after the chart entry was deleted', () => {
    const store = newStore();
    const run = store.getState().startInterpretation('c1', 'profile-1');
    store.getState().reset('c1');

    store
      .getState()
      .setInterpretation(
        'c1',
        makeInterpretation('late'),
        '2026-07-13T00:00:00.000Z',
        undefined,
        undefined,
        run,
      );

    expect(store.getState().getEntry('c1')).toBeUndefined();
  });

  it('deletes current and historical readings owned by one profile only', () => {
    const store = newStore();
    const oldRun = store.getState().startInterpretation('old-chart', 'target');
    store
      .getState()
      .setInterpretation(
        'old-chart',
        makeInterpretation('old target'),
        '2026-07-01T00:00:00Z',
        undefined,
        undefined,
        oldRun,
      );
    const survivorRun = store.getState().startInterpretation('survivor-chart', 'survivor');
    store
      .getState()
      .setInterpretation(
        'survivor-chart',
        makeInterpretation('keep'),
        '2026-07-01T00:00:00Z',
        undefined,
        undefined,
        survivorRun,
      );
    store
      .getState()
      .setInterpretation('current-legacy-chart', makeInterpretation('current'), '2026-07-01');

    store.getState().deleteForProfile('target', ['current-legacy-chart']);

    expect(store.getState().getEntry('old-chart')).toBeUndefined();
    expect(store.getState().getEntry('current-legacy-chart')).toBeUndefined();
    expect(store.getState().getEntry('survivor-chart')?.interpretation).toBeDefined();
  });

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

  it('markSectionFailed records the failed section without ending the run', () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    store.getState().markSectionFailed('c1', 'yoga');
    const entry = store.getState().getEntry('c1');
    expect(entry?.failedSections).toEqual({ yoga: true });
    // A per-section failure degrades that section only — the run continues.
    expect(entry?.status).toBe('generating');
  });

  it('a section can complete while another fails (partial success)', () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    store.getState().markSectionComplete('c1', 'core');
    store.getState().markSectionFailed('c1', 'remedial');
    store.getState().setInterpretation('c1', makeInterpretation(), '2026-07-01T00:00:00Z');
    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('complete');
    expect(entry?.sections).toEqual({ core: true });
    // Failed sections SURVIVE completion so the UI can stay honest about gaps.
    expect(entry?.failedSections).toEqual({ remedial: true });
  });

  it('startInterpretation clears any prior failed sections', () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    store.getState().markSectionFailed('c1', 'yoga');
    store.getState().startInterpretation('c1');
    expect(store.getState().getEntry('c1')?.failedSections).toBeUndefined();
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

describe('interpretationStore — provenance + keep-old-until-success', () => {
  // Display-friendly producer identity (engine/model/endpoint — NEVER a key).
  const PROV_A = {
    engine: 'openai-http',
    model: 'model-a',
    baseUrl: 'http://localhost:11434/v1',
  } as const;
  const PROV_B = {
    engine: 'openai-http',
    model: 'model-b',
    baseUrl: 'http://localhost:11434/v1',
  } as const;
  const PREDICTIVE_A = { predictiveRequestKey: '["profile-1","birth-a","day-a"]' } as const;
  const NATAL_ONLY = { predictiveRequestKey: null } as const;

  it('setInterpretation records the structured provenance when given', () => {
    const store = newStore();
    store.getState().setInterpretation('c1', makeInterpretation(), '2026-07-01T00:00:00Z', PROV_A);
    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('complete');
    expect(entry?.provenance).toEqual({
      engine: 'openai-http',
      model: 'model-a',
      baseUrl: 'http://localhost:11434/v1',
    });
  });

  it('records the exact predictive request used to produce the reading', () => {
    const store = newStore();
    store
      .getState()
      .setInterpretation(
        'c1',
        makeInterpretation(),
        '2026-07-01T00:00:00Z',
        PROV_A,
        PREDICTIVE_A,
      );

    expect(store.getState().getEntry('c1')?.inputProvenance).toEqual(PREDICTIVE_A);
  });

  it('records an explicit natal-only input instead of conflating it with legacy unknown input', () => {
    const store = newStore();
    store
      .getState()
      .setInterpretation(
        'c1',
        makeInterpretation(),
        '2026-07-01T00:00:00Z',
        PROV_A,
        NATAL_ONLY,
      );

    expect(store.getState().getEntry('c1')?.inputProvenance).toEqual(NATAL_ONLY);
  });

  it('setInterpretation without a provenance leaves it undefined (back-compat callers)', () => {
    const store = newStore();
    store.getState().setInterpretation('c1', makeInterpretation(), '2026-07-01T00:00:00Z');
    expect(store.getState().getEntry('c1')?.provenance).toBeUndefined();
  });

  it('a regeneration does NOT destroy the previously completed reading', () => {
    const store = newStore();
    const original = makeInterpretation('The first reading.');
    store
      .getState()
      .setInterpretation('c1', original, '2026-07-01T00:00:00Z', PROV_A, PREDICTIVE_A);

    // Regeneration begins: status flips to generating, progress resets, but the
    // prior reading (and its provenance) stays available for the UI to render.
    store.getState().startInterpretation('c1');
    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('generating');
    expect(entry?.sections).toEqual({});
    expect(entry?.interpretation).toBe(original);
    expect(entry?.provenance).toBe(PROV_A);
    expect(entry?.inputProvenance).toBe(PREDICTIVE_A);
    expect(entry?.updatedAt).toBe('2026-07-01T00:00:00Z');
  });

  it('a FAILED regeneration keeps showing the prior reading (error recorded, reading intact)', () => {
    const store = newStore();
    const original = makeInterpretation('The first reading.');
    store.getState().setInterpretation('c1', original, '2026-07-01T00:00:00Z', PROV_A);

    store.getState().startInterpretation('c1');
    store.getState().setError('c1', 'endpoint unreachable');

    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('error');
    expect(entry?.error).toBe('endpoint unreachable');
    expect(entry?.interpretation).toBe(original);
    expect(entry?.provenance).toBe(PROV_A);
  });

  it('a SUCCESSFUL regeneration replaces the reading and its provenance', () => {
    const store = newStore();
    store
      .getState()
      .setInterpretation('c1', makeInterpretation('The first reading.'), '2026-07-01T00:00:00Z', PROV_A);

    store.getState().startInterpretation('c1');
    const regenerated = makeInterpretation('The regenerated reading.');
    store.getState().setInterpretation('c1', regenerated, '2026-07-02T00:00:00Z', PROV_B);

    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('complete');
    expect(entry?.interpretation).toBe(regenerated);
    expect(entry?.provenance).toBe(PROV_B);
    expect(entry?.updatedAt).toBe('2026-07-02T00:00:00Z');
    expect(entry?.error).toBeUndefined();
  });

  it('a regeneration clears a stale error and failed sections while keeping the reading', () => {
    const store = newStore();
    store.getState().setInterpretation('c1', makeInterpretation(), '2026-07-01T00:00:00Z', PROV_A);
    store.getState().startInterpretation('c1');
    store.getState().markSectionFailed('c1', 'yoga');
    store.getState().setError('c1', 'boom');

    store.getState().startInterpretation('c1');
    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('generating');
    expect(entry?.error).toBeUndefined();
    expect(entry?.failedSections).toBeUndefined();
    expect(entry?.interpretation).toBeDefined();
  });
});

describe('persist v5 migration (owner attribution)', () => {
  it('the persist version is bumped to 5', () => {
    expect(INTERPRETATION_PERSIST_VERSION).toBe(5);
  });

  it('a v2 entry (no provenance) hydrates unchanged and still renders', () => {
    const v2 = {
      byChart: {
        c1: {
          status: 'complete',
          sections: {},
          profileId: 'profile-1',
          updatedAt: '2026-06-20T00:00:00Z',
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
    const entry = migrated.byChart.c1;
    expect(entry?.status).toBe('complete');
    expect(entry?.interpretation?.summary).toEqual({
      layman: 'plain',
      technical: 'Saturn in the 10th',
    });
    // Legacy readings have no fingerprint — the dashboard treats that as a
    // mismatch and regenerates once when the config can produce a reading.
    expect(entry?.provenance).toBeUndefined();
    // Missing input provenance is intentionally distinguishable from a new
    // reading explicitly generated natal-only. Consumers fail closed because
    // this legacy reading may have included a now-stale predictive day/chart.
    expect(entry?.inputProvenance).toBeUndefined();
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

describe('hydrate healing — an interrupted generation must never persist as a dead-end', () => {
  // A persisted status of 'generating' can never be truly in flight after a
  // reload (streams do not survive page unloads). Leaving it stuck renders an
  // eternal "Generating…" card the auto-generate effect refuses to replace.

  it('migrate: a stuck generating entry WITH a kept reading heals to complete and clears error', () => {
    const blob = {
      byChart: {
        c1: {
          status: 'generating',
          sections: { core: true },
          profileId: 'profile-1',
          interpretation: makeInterpretation('Kept reading from before the reload.'),
          updatedAt: '2026-07-01T10:00:00.000Z',
          error: 'stale mid-run failure',
        },
      },
    };
    const migrated = migrateInterpretationPersistedState(blob, 2);
    expect(migrated.byChart.c1?.status).toBe('complete');
    expect(migrated.byChart.c1?.interpretation?.summary.layman).toBe(
      'Kept reading from before the reload.',
    );
    expect(migrated.byChart.c1?.error).toBeUndefined();
  });

  it('migrate: a stuck generating entry WITHOUT a reading is dropped so auto-generate can fire', () => {
    const blob = {
      byChart: {
        c1: { status: 'generating', sections: { core: true }, profileId: 'profile-1' },
        c2: { status: 'complete', sections: {}, profileId: 'profile-1' },
      },
    };
    const migrated = migrateInterpretationPersistedState(blob, 2);
    expect(migrated.byChart.c1).toBeUndefined();
    expect(migrated.byChart.c2?.status).toBe('complete');
  });

  it('merge (same-version rehydrate): heals stuck generating entries over the current state', () => {
    const blob = {
      byChart: {
        withReading: {
          status: 'generating',
          sections: {},
          interpretation: makeInterpretation(),
        },
        withoutReading: { status: 'generating', sections: {} },
      },
    };
    const current = newStore().getState();
    const merged = mergeInterpretationPersistedState(blob, current);
    expect(merged.byChart.withReading?.status).toBe('complete');
    expect(merged.byChart.withoutReading).toBeUndefined();
    // Store actions from the current state must survive the merge.
    expect(typeof merged.startInterpretation).toBe('function');
  });

  it('merge tolerates a corrupt persisted blob and keeps a working store', () => {
    const current = newStore().getState();
    for (const corrupt of [null, undefined, 'oops', 42, [], { byChart: 'x' }]) {
      const merged = mergeInterpretationPersistedState(corrupt, current);
      expect(merged.byChart).toEqual({});
      expect(typeof merged.setInterpretation).toBe('function');
    }
  });

  it('migrate: non-generating statuses pass through untouched', () => {
    const blob = {
      byChart: {
        done: { status: 'complete', sections: {}, profileId: 'profile-1' },
        failed: { status: 'error', error: 'boom', sections: {}, profileId: 'profile-1' },
        idle: { status: 'idle', sections: {}, profileId: 'profile-1' },
      },
    };
    const migrated = migrateInterpretationPersistedState(blob, 2);
    expect(migrated.byChart.done?.status).toBe('complete');
    expect(migrated.byChart.failed?.status).toBe('error');
    expect(migrated.byChart.failed?.error).toBe('boom');
    expect(migrated.byChart.idle?.status).toBe('idle');
  });
});

describe('evidence annotations (optional, purely additive)', () => {
  const PAYLOAD = {
    readings: [{ observation_id: 'dignity:venus', interpretation: 'Warmth arrives audited.' }],
    general_guidance: ['Sleep well.'],
  };

  it('stays at persist version 5 — an optional field needs no migration', () => {
    expect(INTERPRETATION_PERSIST_VERSION).toBe(5);
  });

  it('rehydrates an entry stored BEFORE the field existed, unchanged', () => {
    const legacy = {
      byChart: {
        c1: {
          status: 'complete',
          sections: { core: true },
          profileId: 'profile-1',
          interpretation: makeInterpretation('A steady Saturn stretch.'),
        },
      },
    };

    const migrated = migrateInterpretationPersistedState(legacy, INTERPRETATION_PERSIST_VERSION);

    expect(migrated).toEqual(legacy);
    expect(migrated.byChart.c1?.evidenceAnnotations).toBeUndefined();
    expect(migrated.byChart.c1?.interpretation).toEqual(makeInterpretation('A steady Saturn stretch.'));
  });

  it('attaches the raw payload to the entry without touching the stored reading', async () => {
    const store = newStore();
    const reading = makeInterpretation('A bright Jupiter year.');
    store.getState().startInterpretation('c1');
    await store.getState().setInterpretation('c1', reading, '2026-08-01T00:00:00Z');

    await store.getState().setEvidenceAnnotations('c1', PAYLOAD);

    const entry = store.getState().getEntry('c1');
    expect(entry?.evidenceAnnotations).toEqual(PAYLOAD);
    expect(entry?.status).toBe('complete');
    expect(entry?.interpretation).toEqual(reading);
    expect(entry?.updatedAt).toBe('2026-08-01T00:00:00Z');
  });

  it('ignores annotations from a SUPERSEDED run (a slow call must not land on a newer reading)', async () => {
    const store = newStore();
    const staleToken = store.getState().startInterpretation('c1');
    store.getState().startInterpretation('c1'); // a newer run takes over

    await store.getState().setEvidenceAnnotations('c1', PAYLOAD, staleToken);

    expect(store.getState().getEntry('c1')?.evidenceAnnotations).toBeUndefined();
  });

  it('a NEW reading drops the previous readings annotations — prose never outlives its reading', async () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    await store.getState().setInterpretation('c1', makeInterpretation('First.'), '2026-08-01T00:00:00Z');
    await store.getState().setEvidenceAnnotations('c1', PAYLOAD);

    store.getState().startInterpretation('c1');
    await store.getState().setInterpretation('c1', makeInterpretation('Second.'), '2026-08-02T00:00:00Z');

    expect(store.getState().getEntry('c1')?.evidenceAnnotations).toBeUndefined();
  });
});

describe('automatic-attempt marker (one generation per reading, not per mount)', () => {
  it('rehydrates an entry stored BEFORE the field existed, unchanged', () => {
    const legacy = {
      byChart: {
        c1: { status: 'complete', sections: { core: true }, interpretation: makeInterpretation('Old.') },
      },
    };

    const migrated = migrateInterpretationPersistedState(legacy, INTERPRETATION_PERSIST_VERSION);

    expect(migrated).toEqual(legacy);
    expect(migrated.byChart.c1?.automaticAttemptKey).toBeUndefined();
  });

  it('records the spent attempt key on the entry', async () => {
    const store = newStore();

    await store.getState().markAutomaticAttempt('c1', 'fp-a::natal-only');

    expect(store.getState().getEntry('c1')?.automaticAttemptKey).toBe('fp-a::natal-only');
  });

  it('SURVIVES a generation that fails — the attempt was spent when it started', async () => {
    const store = newStore();
    store.getState().startInterpretation('c1');
    await store.getState().setInterpretation('c1', makeInterpretation('Natal only.'), '2026-08-01T00:00:00Z');
    await store.getState().markAutomaticAttempt('c1', 'fp-a::key-today');

    // A regeneration starts and then fails outright.
    store.getState().startInterpretation('c1');
    store.getState().setError('c1', 'provider is down');

    const entry = store.getState().getEntry('c1');
    expect(entry?.status).toBe('error');
    expect(entry?.automaticAttemptKey).toBe('fp-a::key-today');
    // Keep-old-until-success still holds: the reading is untouched.
    expect(entry?.interpretation).toEqual(makeInterpretation('Natal only.'));
  });

  it('releases the marker so a later identity earns a fresh attempt', async () => {
    const store = newStore();
    await store.getState().markAutomaticAttempt('c1', 'fp-a::key-today');

    await store.getState().markAutomaticAttempt('c1', undefined);

    expect(store.getState().getEntry('c1')?.automaticAttemptKey).toBeUndefined();
    expect('automaticAttemptKey' in (store.getState().getEntry('c1') ?? {})).toBe(false);
  });
});
