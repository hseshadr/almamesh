/**
 * Rectification-records store — per-profile, local-first metadata about a
 * CONFIRMED birth-time rectification.
 *
 * When the user confirms a candidate in the `/rectify` wizard, the chosen
 * rising sign + time, the result's band/margin/mode, the original vs rectified
 * time+sign, a confirmed-at timestamp, and the opaque ids of the structured
 * life events that informed the fit are written here so Settings can show a
 * standing "Your rectification" record ("was X, now Y"). Without this the
 * confirm path only changed the birth time and dropped every trace of the
 * rectification itself.
 *
 * Display-only: this record NEVER feeds the engine and holds NO raw life-event
 * narrative — only the chosen candidate's sign/time/band/margin plus opaque
 * event ids — keeping the project's privacy posture intact.
 *
 * Fully local-first: persisted to IndexedDB via `idb-keyval` under its own key,
 * mirroring the `lifeEvents` store, keyed by the owning profile id.
 */

import type {
  RectificationCandidate,
  RectificationRecord,
  RectificationResult,
} from '@almamesh/shared-types';
import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

/** A single IndexedDB key holding all profiles' rectification records. */
const PERSIST_NAME = 'almamesh-rectification-records';

/** Bump when the persisted `RectificationRecord` shape changes; pair with `migrate`. */
export const RECTIFICATION_RECORDS_PERSIST_VERSION = 1;

/** The slice of the store that `partialize` actually persists. */
export interface PersistedRectificationRecordsState {
  readonly recordsByProfile: Readonly<Record<string, RectificationRecord>>;
}

/** A plain (non-array) object — the only shape `recordsByProfile` may safely take. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Defensive hydration: tolerate ANY old/unknown/corrupt persisted blob and
 * always return a valid `{ recordsByProfile }`. A returning visitor whose stored
 * record is malformed must never crash the app — non-object entries are dropped
 * and a corrupt root falls back to an empty map.
 */
export function migrateRectificationRecordsPersistedState(
  persisted: unknown,
  _fromVersion: number,
): PersistedRectificationRecordsState {
  if (!isPlainRecord(persisted)) {
    return { recordsByProfile: {} };
  }
  const byProfile = persisted.recordsByProfile;
  if (!isPlainRecord(byProfile)) {
    return { recordsByProfile: {} };
  }
  const migrated: Record<string, RectificationRecord> = {};
  for (const [profileId, record] of Object.entries(byProfile)) {
    if (isPlainRecord(record)) {
      migrated[profileId] = record as unknown as RectificationRecord;
    }
  }
  return { recordsByProfile: migrated };
}

/** True only where IndexedDB exists (real browsers / workers), not in SSR/tests. */
function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** IndexedDB-backed zustand storage; benign no-op outside browsers (SSR/tests). */
const idbStorage: StateStorage = {
  getItem: async (name) => (hasIndexedDb() ? ((await idbGet<string>(name)) ?? null) : null),
  setItem: async (name, value) => {
    if (hasIndexedDb()) {
      await idbSet(name, value);
    }
  },
  removeItem: async (name) => {
    if (hasIndexedDb()) {
      await idbDel(name);
    }
  },
};

/** Arguments for {@link buildRectificationRecord}. */
export interface BuildRectificationRecordArgs {
  /** Owning profile id. */
  readonly profileId: string;
  /** The full engine result (supplies mode/band/margin + the recorded sign). */
  readonly result: RectificationResult;
  /** The candidate the user chose (supplies the rectified sign + time). */
  readonly candidate: RectificationCandidate;
  /** The originally-entered birth time (`HH:MM`), or "" when the time was unknown. */
  readonly originalTime: string;
  /** Ids of the structured life events fed to the engine, in engine order. */
  readonly structuredEventIds: readonly string[];
  /** Confirmation instant (`Date.now()` in app code; explicit so it stays pure). */
  readonly confirmedAt: number;
}

/**
 * Build a display-only {@link RectificationRecord} from a confirmed candidate.
 *
 * Pure: copies the chosen candidate's sign/time and the result's band/margin/mode,
 * keeps the originally-entered time + recorded sign for the "was X" half, and
 * records the opaque ids of the structured life events that informed the fit.
 * No life-event narrative ever enters the record.
 */
export function buildRectificationRecord(args: BuildRectificationRecordArgs): RectificationRecord {
  const { profileId, result, candidate, originalTime, structuredEventIds, confirmedAt } = args;
  return {
    profileId,
    confirmedAt: new Date(confirmedAt).toISOString(),
    mode: result.mode,
    band: result.band,
    margin: result.margin,
    originalTime,
    originalSign: result.recordedTimeSign,
    rectifiedTime: candidate.representativeTimeLocal,
    rectifiedSign: candidate.ascendantSign,
    supportingEventIds: [...structuredEventIds],
  };
}

export interface RectificationRecordsStore {
  /** Latest confirmed rectification per profile, keyed by owning profile id. */
  readonly recordsByProfile: Readonly<Record<string, RectificationRecord>>;
  /** True once zustand has rehydrated from IndexedDB. */
  readonly hydrated: boolean;

  /** Store (or replace) the confirmed rectification record for its profile. */
  setRecord: (record: RectificationRecord) => void;
  /** A profile's confirmed rectification record, or null when none exists. */
  getRecord: (profileId: string) => RectificationRecord | null;
  /** Remove a profile's record (e.g. when the person is deleted). A no-op when absent. */
  clearRecord: (profileId: string) => void;
}

export const rectificationRecordsStoreCreator: StateCreator<RectificationRecordsStore> = (
  set,
  get,
) => ({
  recordsByProfile: {},
  hydrated: false,

  setRecord: (record) => {
    set((state) => ({
      recordsByProfile: { ...state.recordsByProfile, [record.profileId]: record },
    }));
  },

  getRecord: (profileId) => get().recordsByProfile[profileId] ?? null,

  clearRecord: (profileId) => {
    set((state) => {
      if (!(profileId in state.recordsByProfile)) {
        return state;
      }
      const next = { ...state.recordsByProfile };
      delete next[profileId];
      return { recordsByProfile: next };
    });
  },
});

export const useRectificationRecordsStore = create<RectificationRecordsStore>()(
  persist<RectificationRecordsStore, [], [], PersistedRectificationRecordsState>(
    rectificationRecordsStoreCreator,
    {
      name: PERSIST_NAME,
      version: RECTIFICATION_RECORDS_PERSIST_VERSION,
      migrate: migrateRectificationRecordsPersistedState,
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({ recordsByProfile: state.recordsByProfile }),
      onRehydrateStorage: () => () => {
        useRectificationRecordsStore.setState({ hydrated: true });
      },
    },
  ),
);

/**
 * Resolve once the rectification-records store has finished rehydrating from
 * IndexedDB. Mirrors `whenLifeEventsHydrated` — await before any read that must
 * reflect the persisted truth (avoids the async-rehydrate false-empty race).
 */
export function whenRectificationRecordsHydrated(): Promise<void> {
  const { persist: persistApi } = useRectificationRecordsStore;
  if (!persistApi?.hasHydrated || persistApi.hasHydrated()) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const unsubscribe = persistApi.onFinishHydration(() => {
      unsubscribe?.();
      resolve();
    });
  });
}
