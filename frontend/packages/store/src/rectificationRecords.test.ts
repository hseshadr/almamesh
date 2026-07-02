import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type {
  RectificationCandidate,
  RectificationRecord,
  RectificationResult,
} from '@almamesh/shared-types';

import {
  buildRectificationRecord,
  migrateRectificationRecordsPersistedState,
  rectificationRecordsStoreCreator,
  RECTIFICATION_RECORDS_PERSIST_VERSION,
  type RectificationRecordsStore,
} from './rectificationRecords';

function newStore() {
  return createStore<RectificationRecordsStore>(rectificationRecordsStoreCreator);
}

// ---------------------------------------------------------------------------
// Synthetic fixtures — NO real birth data
// ---------------------------------------------------------------------------

const CANDIDATE: RectificationCandidate = {
  ascendantSign: 'pisces',
  representativeTimeLocal: '07:45',
  lagnaLongitudeDeg: 333.8,
  lagnaCuspDistanceDeg: 3.8,
  isNearCusp: true,
  fitScore: 0.72,
  supportingEvents: [],
};

const RESULT_CUSP: RectificationResult = {
  mode: 'cusp',
  candidates: [CANDIDATE],
  margin: 0.04,
  band: 'leans',
  discriminatingEventCount: 2,
  recordedTimeSign: 'aquarius',
  honestyNoteKey: 'rectify.honesty.leans',
};

const RESULT_WINDOW_UNKNOWN: RectificationResult = {
  ...RESULT_CUSP,
  mode: 'window',
  recordedTimeSign: null,
};

function sampleRecord(overrides: Partial<RectificationRecord> = {}): RectificationRecord {
  return {
    profileId: 'p1',
    confirmedAt: '2026-06-29T12:00:00.000Z',
    mode: 'cusp',
    band: 'leans',
    margin: 0.04,
    originalTime: '07:30',
    originalSign: 'aquarius',
    rectifiedTime: '07:45',
    rectifiedSign: 'pisces',
    supportingEventIds: ['evt-1', 'evt-2'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildRectificationRecord — the pure record-building helper
// ---------------------------------------------------------------------------

describe('buildRectificationRecord', () => {
  it('builds a display record from a cusp result + chosen candidate', () => {
    const record = buildRectificationRecord({
      profileId: 'profile-abc',
      result: RESULT_CUSP,
      candidate: CANDIDATE,
      originalTime: '07:30',
      structuredEventIds: ['evt-1', 'evt-2'],
      confirmedAt: Date.parse('2026-06-29T12:00:00.000Z'),
    });

    expect(record).toEqual({
      profileId: 'profile-abc',
      confirmedAt: '2026-06-29T12:00:00.000Z',
      mode: 'cusp',
      band: 'leans',
      margin: 0.04,
      originalTime: '07:30',
      originalSign: 'aquarius',
      rectifiedTime: '07:45',
      rectifiedSign: 'pisces',
      supportingEventIds: ['evt-1', 'evt-2'],
      resultSnapshot: RESULT_CUSP,
    });
  });

  it('snapshots the full adapted result on the record (v2)', () => {
    const record = buildRectificationRecord({
      profileId: 'p1',
      result: RESULT_CUSP,
      candidate: CANDIDATE,
      originalTime: '07:30',
      structuredEventIds: ['evt-1'],
      confirmedAt: Date.parse('2026-06-29T12:00:00.000Z'),
    });
    expect(record.resultSnapshot).toEqual(RESULT_CUSP);
  });

  it('stores event summaries when supplied (v2) and omits the key when absent', () => {
    const summaries = [
      { id: 'evt-1', date: '2010-05-15', category: 'marriage' as const, summary: 'We married' },
      { id: 'evt-2', date: '2014-03-02', category: 'litigation' as const },
    ];
    const withSummaries = buildRectificationRecord({
      profileId: 'p1',
      result: RESULT_CUSP,
      candidate: CANDIDATE,
      originalTime: '07:30',
      structuredEventIds: ['evt-1', 'evt-2'],
      confirmedAt: Date.parse('2026-06-29T12:00:00.000Z'),
      eventSummaries: summaries,
    });
    expect(withSummaries.eventSummaries).toEqual(summaries);

    const withoutSummaries = buildRectificationRecord({
      profileId: 'p1',
      result: RESULT_CUSP,
      candidate: CANDIDATE,
      originalTime: '07:30',
      structuredEventIds: ['evt-1'],
      confirmedAt: Date.parse('2026-06-29T12:00:00.000Z'),
    });
    expect('eventSummaries' in withoutSummaries).toBe(false);
  });

  it('carries null originalSign + window mode for an unknown-time fit', () => {
    const record = buildRectificationRecord({
      profileId: 'p1',
      result: RESULT_WINDOW_UNKNOWN,
      candidate: CANDIDATE,
      originalTime: '',
      structuredEventIds: ['evt-9'],
      confirmedAt: Date.parse('2026-06-29T12:00:00.000Z'),
    });

    expect(record.mode).toBe('window');
    expect(record.originalSign).toBeNull();
    expect(record.originalTime).toBe('');
    expect(record.supportingEventIds).toEqual(['evt-9']);
  });

  it('stores only opaque event ids — no narrative, date, or category leaks in', () => {
    const record = buildRectificationRecord({
      profileId: 'p1',
      result: RESULT_CUSP,
      candidate: CANDIDATE,
      originalTime: '07:30',
      structuredEventIds: ['evt-1', 'evt-2', 'evt-3'],
      confirmedAt: Date.parse('2026-06-29T12:00:00.000Z'),
    });
    expect(record.supportingEventIds).toEqual(['evt-1', 'evt-2', 'evt-3']);
    // The only keys are the typed display fields — nothing else. (v2 adds the
    // resultSnapshot; eventSummaries appears only when explicitly supplied.)
    expect(Object.keys(record).sort()).toEqual(
      [
        'band',
        'confirmedAt',
        'margin',
        'mode',
        'originalSign',
        'originalTime',
        'profileId',
        'rectifiedSign',
        'rectifiedTime',
        'resultSnapshot',
        'supportingEventIds',
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// migrateRectificationRecordsPersistedState — defensive hydration
// ---------------------------------------------------------------------------

describe('migrateRectificationRecordsPersistedState', () => {
  it('returns a clean empty map for any malformed / corrupt blob (never throws)', () => {
    for (const corrupt of [null, undefined, 'oops', 42, [], {}, { recordsByProfile: 'x' }, { recordsByProfile: 9 }]) {
      expect(() => migrateRectificationRecordsPersistedState(corrupt, 0)).not.toThrow();
      expect(migrateRectificationRecordsPersistedState(corrupt, 0)).toEqual({ recordsByProfile: {} });
    }
  });

  it('passes a valid persisted record map through unchanged', () => {
    const blob = { recordsByProfile: { p1: sampleRecord() } };
    const out = migrateRectificationRecordsPersistedState(blob, RECTIFICATION_RECORDS_PERSIST_VERSION);
    expect(out.recordsByProfile.p1).toEqual(sampleRecord());
  });

  it('drops non-object record entries while keeping valid ones', () => {
    const blob = { recordsByProfile: { p1: sampleRecord(), bad: 'nope' } };
    const out = migrateRectificationRecordsPersistedState(blob, 1);
    expect(out.recordsByProfile.p1).toEqual(sampleRecord());
    expect(out.recordsByProfile.bad).toBeUndefined();
  });

  it('loads a v1 record (no resultSnapshot / eventSummaries) unchanged — graceful v1→v2', () => {
    // sampleRecord() IS the v1 shape: no snapshot, no summaries. Migrating from
    // version 1 must keep it verbatim with both v2 fields simply absent.
    const v1 = sampleRecord();
    const out = migrateRectificationRecordsPersistedState({ recordsByProfile: { p1: v1 } }, 1);
    expect(out.recordsByProfile.p1).toEqual(v1);
    expect(out.recordsByProfile.p1?.resultSnapshot).toBeUndefined();
    expect(out.recordsByProfile.p1?.eventSummaries).toBeUndefined();
  });

  it('keeps a v2 record with snapshot + summaries intact', () => {
    const v2 = sampleRecord({
      resultSnapshot: RESULT_CUSP,
      eventSummaries: [{ id: 'evt-1', date: '2010-05-15', category: 'marriage' }],
    });
    const out = migrateRectificationRecordsPersistedState(
      { recordsByProfile: { p1: v2 } },
      RECTIFICATION_RECORDS_PERSIST_VERSION,
    );
    expect(out.recordsByProfile.p1).toEqual(v2);
  });
});

// ---------------------------------------------------------------------------
// rectificationRecordsStore — actions
// ---------------------------------------------------------------------------

describe('rectificationRecordsStore', () => {
  let store: ReturnType<typeof newStore>;

  beforeEach(() => {
    store = newStore();
  });

  it('RECTIFICATION_RECORDS_PERSIST_VERSION is 2 (v2: resultSnapshot + eventSummaries)', () => {
    expect(RECTIFICATION_RECORDS_PERSIST_VERSION).toBe(2);
  });

  it('setRecord then getRecord round-trips, keyed by profileId', () => {
    const record = sampleRecord({ profileId: 'profile-a' });
    store.getState().setRecord(record);
    expect(store.getState().getRecord('profile-a')).toEqual(record);
  });

  it('getRecord returns null for a profile with no record', () => {
    expect(store.getState().getRecord('nobody')).toBeNull();
  });

  it('setRecord replaces the prior record for the same profile', () => {
    store.getState().setRecord(sampleRecord({ profileId: 'p', rectifiedTime: '07:45' }));
    store.getState().setRecord(sampleRecord({ profileId: 'p', rectifiedTime: '08:10' }));
    expect(store.getState().getRecord('p')?.rectifiedTime).toBe('08:10');
  });

  it('isolates records per profile', () => {
    store.getState().setRecord(sampleRecord({ profileId: 'p1', rectifiedSign: 'pisces' }));
    store.getState().setRecord(sampleRecord({ profileId: 'p2', rectifiedSign: 'aries' }));
    expect(store.getState().getRecord('p1')?.rectifiedSign).toBe('pisces');
    expect(store.getState().getRecord('p2')?.rectifiedSign).toBe('aries');
  });

  it('clearRecord removes a profile record (no-op when absent)', () => {
    store.getState().setRecord(sampleRecord({ profileId: 'p' }));
    store.getState().clearRecord('p');
    expect(store.getState().getRecord('p')).toBeNull();
    // clearing an unknown profile is a harmless no-op
    expect(() => store.getState().clearRecord('ghost')).not.toThrow();
  });
});
