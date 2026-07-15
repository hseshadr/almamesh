import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval';

import {
  mergeDeletionTombstones,
  abortBackupRestore,
  beginBackupRestore,
  beginDatasetMutation,
  clearMemoryRebuildPending,
  commitDatasetGeneration,
  deletionAwareIdbStorage,
  readDeletionTombstones,
  recordDeletionTombstones,
  sanitizePersistedValue,
  shouldAcceptRestoreEpoch,
  subtractRestoredTombstones,
  tagPersistedValue,
  type DeletionTombstones,
} from './deletionTombstones';

const TEST_INDEXED_DB = new IDBFactory();

const TOMBSTONES: DeletionTombstones = {
  version: 1,
  activeEpoch: 2,
  restoreEpoch: 2,
  restoreInProgress: false,
  profileIds: ['deleted-profile'],
  threadIds: ['deleted-thread'],
  chartIds: ['deleted-chart'],
};

function envelope(state: Record<string, unknown>): string {
  return JSON.stringify({ state, version: 1 });
}

function stateOf(value: string): Record<string, unknown> {
  return (JSON.parse(value) as { state: Record<string, unknown> }).state;
}

describe('deletion tombstones', () => {
  it('does not revive pending deletion IDs until a Replace commit succeeds', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: TEST_INDEXED_DB,
      configurable: true,
    });
    try {
      await recordDeletionTombstones({ profileIds: ['pending-victim'] });
      const deletionEpoch = (await readDeletionTombstones()).restoreEpoch;
      await abortBackupRestore(deletionEpoch);

      const restoreEpoch = await beginBackupRestore({ profileIds: ['pending-victim'] });
      expect(await readDeletionTombstones()).toMatchObject({
        profileIds: ['pending-victim'],
        restoreInProgress: true,
      });
      await abortBackupRestore(restoreEpoch);
      expect(await readDeletionTombstones()).toMatchObject({
        profileIds: ['pending-victim'],
        restoreInProgress: false,
      });

      const cleanupEpoch = await beginDatasetMutation();
      await commitDatasetGeneration(cleanupEpoch, []);
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: originalIndexedDb,
        configurable: true,
      });
    }
  });

  it('serializes a reset behind an in-flight deletion without reviving either dataset', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: TEST_INDEXED_DB,
      configurable: true,
    });
    const store = createStore('keyval-store', 'keyval');
    try {
      const activeEpoch = (await readDeletionTombstones()).activeEpoch;
      const snapshot = envelope({
        profiles: { victim: { id: 'victim' }, survivor: { id: 'survivor' } },
      });
      await idbSet('almamesh-profiles', tagPersistedValue(snapshot, activeEpoch), store);

      const deleteEpoch = await beginDatasetMutation();
      await recordDeletionTombstones({ profileIds: ['victim'] }, deleteEpoch);
      let resetResolved = false;
      const resetEpochPromise = beginDatasetMutation().then((epoch) => {
        resetResolved = true;
        return epoch;
      });
      await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
      expect(resetResolved).toBe(false);

      await commitDatasetGeneration(deleteEpoch, [{ key: 'almamesh-profiles', value: snapshot }]);
      const resetEpoch = await resetEpochPromise;
      await commitDatasetGeneration(
        resetEpoch,
        [{ key: 'almamesh-profiles', value: null }],
        ['almamesh-chat-vectors'],
        { memoryRebuildPending: false },
      );

      expect(await deletionAwareIdbStorage.getItem('almamesh-profiles')).toBeNull();
      expect(await readDeletionTombstones()).toMatchObject({
        activeEpoch: resetEpoch,
        restoreInProgress: false,
        memoryRebuildPending: false,
        profileIds: [],
      });
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: originalIndexedDb,
        configurable: true,
      });
    }
  });

  it('serializes two realms and prevents the second stale snapshot from resurrecting the first victim', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: TEST_INDEXED_DB,
      configurable: true,
    });
    const store = createStore('keyval-store', 'keyval');
    try {
      const activeEpoch = (await readDeletionTombstones()).activeEpoch;
      const staleSnapshot = envelope({
        profiles: { a: { id: 'a' }, b: { id: 'b' }, survivor: { id: 'survivor' } },
      });
      await idbSet('almamesh-profiles', tagPersistedValue(staleSnapshot, activeEpoch), store);

      const firstEpoch = await beginDatasetMutation();
      await recordDeletionTombstones({ profileIds: ['a'] }, firstEpoch);
      let secondResolved = false;
      const secondEpochPromise = beginDatasetMutation().then((epoch) => {
        secondResolved = true;
        return epoch;
      });
      await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
      expect(secondResolved).toBe(false);

      await commitDatasetGeneration(firstEpoch, [{ key: 'almamesh-profiles', value: staleSnapshot }]);
      const secondEpoch = await secondEpochPromise;
      const synchronized = await deletionAwareIdbStorage.getItem('almamesh-profiles');
      await recordDeletionTombstones({ profileIds: ['b'] }, secondEpoch);
      await commitDatasetGeneration(secondEpoch, [
        { key: 'almamesh-profiles', value: synchronized },
      ]);

      const final = await deletionAwareIdbStorage.getItem('almamesh-profiles');
      expect(stateOf(final as string).profiles).toEqual({ survivor: { id: 'survivor' } });
      expect(await readDeletionTombstones()).toMatchObject({
        restoreInProgress: false,
        profileIds: [],
        threadIds: [],
        chartIds: [],
      });
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: originalIndexedDb,
        configurable: true,
      });
    }
  });

  it('does not let a second destructive operation preempt an active generation lease', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: TEST_INDEXED_DB,
      configurable: true,
    });
    try {
      const firstEpoch = await beginBackupRestore({ profileIds: ['first'] });
      let secondResolved = false;
      const secondEpochPromise = beginBackupRestore({ profileIds: ['second'] }).then((epoch) => {
        secondResolved = true;
        return epoch;
      });

      await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
      expect(secondResolved).toBe(false);

      await abortBackupRestore(firstEpoch);
      const secondEpoch = await secondEpochPromise;
      expect(secondEpoch).toBeGreaterThan(firstEpoch);
      await abortBackupRestore(secondEpoch);
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: originalIndexedDb,
        configurable: true,
      });
    }
  });

  it('marks a derived-memory rebuild pending in the same commit that deletes vectors', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: TEST_INDEXED_DB,
      configurable: true,
    });
    const store = createStore('keyval-store', 'keyval');
    try {
      await idbSet('almamesh-chat-vectors', [{ id: 'old#0' }], store);
      const epoch = await beginBackupRestore({});

      await commitDatasetGeneration(epoch, [], ['almamesh-chat-vectors'], {
        memoryRebuildPending: true,
      });

      const ledger = await readDeletionTombstones();
      expect(ledger).toMatchObject({
        activeEpoch: epoch,
        restoreInProgress: false,
        memoryRebuildPending: true,
      });
      await clearMemoryRebuildPending(epoch - 1);
      expect(await readDeletionTombstones()).toMatchObject({ memoryRebuildPending: true });
      await clearMemoryRebuildPending(epoch);
      expect(await readDeletionTombstones()).toMatchObject({ memoryRebuildPending: false });
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: originalIndexedDb,
        configurable: true,
      });
    }
  });

  it('filters a victim vector before promoting a stale cached index into the new generation', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: TEST_INDEXED_DB,
      configurable: true,
    });
    const store = createStore('keyval-store', 'keyval');
    try {
      await idbSet(
        'almamesh-chat-vectors',
        {
          generation: 0,
          records: [
            { id: 'victim#0', profile_id: 'victim', thread_id: 'victim-thread' },
            { id: 'survivor#0', profile_id: 'survivor', thread_id: 'survivor-thread' },
          ],
        },
        store,
      );
      await recordDeletionTombstones({
        profileIds: ['victim'],
        threadIds: ['victim-thread'],
      });
      const ledger = await idbGet<DeletionTombstones>('almamesh-deletion-tombstones', store);

      await commitDatasetGeneration(
        ledger!.restoreEpoch,
        [
          {
            key: 'almamesh-profiles',
            value: envelope({ profiles: { survivor: { id: 'survivor' } } }),
          },
        ],
        [],
        { retagGenerationKeys: ['almamesh-chat-vectors'] },
      );

      const vectors = await idbGet<{ generation: number; records: { id: string }[] }>(
        'almamesh-chat-vectors',
        store,
      );
      expect(vectors).toEqual({
        generation: ledger!.restoreEpoch,
        records: [{ id: 'survivor#0', profile_id: 'survivor', thread_id: 'survivor-thread' }],
      });
      const settled = await idbGet<DeletionTombstones>('almamesh-deletion-tombstones', store);
      expect(settled).toMatchObject({ profileIds: [], threadIds: [], chartIds: [] });
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: originalIndexedDb,
        configurable: true,
      });
    }
  });

  it('keeps the old active generation readable after a crash mid-transaction', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: TEST_INDEXED_DB,
      configurable: true,
    });
    const store = createStore('keyval-store', 'keyval');
    try {
      const previousEpoch = (await readDeletionTombstones()).activeEpoch;
      const oldValue = JSON.stringify({
        state: { profiles: { old: { id: 'old' } } },
        version: 1,
        datasetEpoch: previousEpoch,
      });
      await idbSet('almamesh-profiles', oldValue, store);
      const epoch = await beginBackupRestore({});

      await expect(
        commitDatasetGeneration(
          epoch,
          [
            {
              key: 'almamesh-profiles',
              value: envelope({ profiles: { replacement: { id: 'replacement' } } }),
            },
            { key: 'almamesh-chart-library', value: envelope({ charts: { replacement: {} } }) },
          ],
          [],
          {
            afterWrite: (index) => {
              if (index === 0) throw new Error('simulated tab crash');
            },
          },
        ),
      ).rejects.toThrow(/simulated tab crash/);

      expect(await idbGet('almamesh-profiles', store)).toBe(oldValue);
      expect(
        stateOf((await deletionAwareIdbStorage.getItem('almamesh-profiles')) as string).profiles,
      ).toEqual({ old: { id: 'old' } });
      const crashedLedger = await idbGet<DeletionTombstones>('almamesh-deletion-tombstones', store);
      expect(crashedLedger).toMatchObject({
        activeEpoch: previousEpoch,
        restoreEpoch: epoch,
        restoreInProgress: true,
      });

      await abortBackupRestore(epoch);
      const recoveredLedger = await idbGet<DeletionTombstones>('almamesh-deletion-tombstones', store);
      expect(recoveredLedger).toMatchObject({
        activeEpoch: previousEpoch,
        restoreEpoch: epoch,
        restoreInProgress: false,
      });
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        value: originalIndexedDb,
        configurable: true,
      });
    }
  });

  it('atomically mergeable ledger updates retain concurrent deletions', () => {
    const merged = mergeDeletionTombstones(
      {
        version: 1,
        activeEpoch: 3,
        restoreEpoch: 3,
        restoreInProgress: false,
        profileIds: ['first-profile'],
        threadIds: ['first-thread'],
        chartIds: [],
      },
      {
        profileIds: ['second-profile', 'first-profile'],
        threadIds: ['second-thread'],
        chartIds: ['second-chart'],
      },
    );

    expect(merged).toEqual({
      version: 1,
      activeEpoch: 3,
      restoreEpoch: 3,
      restoreInProgress: false,
      memoryRebuildPending: false,
      profileIds: ['first-profile', 'second-profile'],
      threadIds: ['first-thread', 'second-thread'],
      chartIds: ['second-chart'],
    });
  });

  it('a deliberate restore clears only tombstones for IDs present in that backup', () => {
    const restored = subtractRestoredTombstones(
      {
        version: 1,
        activeEpoch: 4,
        restoreEpoch: 4,
        restoreInProgress: false,
        profileIds: ['restored-profile', 'still-deleted-profile'],
        threadIds: ['restored-thread', 'still-deleted-thread'],
        chartIds: ['restored-chart', 'still-deleted-chart'],
      },
      {
        profileIds: ['restored-profile'],
        threadIds: ['restored-thread'],
        chartIds: ['restored-chart'],
      },
    );

    expect(restored).toEqual({
      version: 1,
      activeEpoch: 4,
      restoreEpoch: 4,
      restoreInProgress: false,
      memoryRebuildPending: false,
      profileIds: ['still-deleted-profile'],
      threadIds: ['still-deleted-thread'],
      chartIds: ['still-deleted-chart'],
    });
  });

  it('fences a realm that hydrated before a confirmed backup Replace', () => {
    expect(shouldAcceptRestoreEpoch(7, 8)).toBe(false);
    expect(shouldAcceptRestoreEpoch(8, 8)).toBe(true);
    expect(shouldAcceptRestoreEpoch(undefined, 8)).toBe(false);
    expect(shouldAcceptRestoreEpoch(undefined, 0)).toBe(true);
  });

  it('filters a stale realm snapshot across every profile-owned persistence key', () => {
    const snapshots = {
      'almamesh-profiles': {
        profiles: {
          'deleted-profile': { id: 'deleted-profile' },
          survivor: {
            id: 'survivor',
            relationship: 'spouse',
            relatedTo: 'deleted-profile',
          },
        },
        activeProfileId: 'deleted-profile',
      },
      'almamesh-chart-library': {
        charts: {
          'deleted-chart': { chart_id: 'deleted-chart' },
          'profile-chart': { chart_id: 'profile-chart', profile_id: 'deleted-profile' },
          survivor: { chart_id: 'survivor', profile_id: 'survivor' },
        },
      },
      'almamesh-life-events': {
        eventsByProfile: { 'deleted-profile': [{}], survivor: [{}] },
      },
      'almamesh-rectification-records': {
        recordsByProfile: { 'deleted-profile': {}, survivor: {} },
      },
      'almamesh-chat-history': {
        threads: {
          'deleted-thread': { id: 'deleted-thread', profile_id: 'survivor' },
          'profile-thread': { id: 'profile-thread', profile_id: 'deleted-profile' },
          survivor: { id: 'survivor', profile_id: 'survivor' },
        },
        messages: {
          'deleted-thread': [{}],
          'profile-thread': [{}],
          survivor: [{}],
        },
      },
      'almamesh-predictive': {
        status: 'ready',
        profileKey: 'deleted-profile',
        requestKey: 'private-request',
        rawContexts: { private: true },
      },
      'almamesh-interpretations': {
        byChart: {
          'deleted-chart': { status: 'complete', sections: {} },
          historical: {
            status: 'complete',
            sections: {},
            profileId: 'deleted-profile',
          },
          survivor: { status: 'complete', sections: {}, profileId: 'survivor' },
        },
      },
    } as const;

    const profiles = stateOf(
      sanitizePersistedValue('almamesh-profiles', envelope(snapshots['almamesh-profiles']), TOMBSTONES),
    );
    expect(profiles.profiles).toEqual({ survivor: { id: 'survivor' } });
    expect(profiles.activeProfileId).toBe('survivor');

    const charts = stateOf(
      sanitizePersistedValue(
        'almamesh-chart-library',
        envelope(snapshots['almamesh-chart-library']),
        TOMBSTONES,
      ),
    );
    expect(charts.charts).toEqual({
      survivor: { chart_id: 'survivor', profile_id: 'survivor' },
    });

    const events = stateOf(
      sanitizePersistedValue(
        'almamesh-life-events',
        envelope(snapshots['almamesh-life-events']),
        TOMBSTONES,
      ),
    );
    expect(events.eventsByProfile).toEqual({ survivor: [{}] });

    const records = stateOf(
      sanitizePersistedValue(
        'almamesh-rectification-records',
        envelope(snapshots['almamesh-rectification-records']),
        TOMBSTONES,
      ),
    );
    expect(records.recordsByProfile).toEqual({ survivor: {} });

    const chat = stateOf(
      sanitizePersistedValue(
        'almamesh-chat-history',
        envelope(snapshots['almamesh-chat-history']),
        TOMBSTONES,
      ),
    );
    expect(chat.threads).toEqual({ survivor: { id: 'survivor', profile_id: 'survivor' } });
    expect(chat.messages).toEqual({ survivor: [{}] });

    const predictive = stateOf(
      sanitizePersistedValue(
        'almamesh-predictive',
        envelope(snapshots['almamesh-predictive']),
        TOMBSTONES,
      ),
    );
    expect(predictive).toEqual({ status: 'idle' });

    const interpretations = stateOf(
      sanitizePersistedValue(
        'almamesh-interpretations',
        envelope(snapshots['almamesh-interpretations']),
        TOMBSTONES,
      ),
    );
    expect(interpretations.byChart).toEqual({
      survivor: { status: 'complete', sections: {}, profileId: 'survivor' },
    });
  });

});
