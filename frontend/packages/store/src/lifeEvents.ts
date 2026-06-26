/**
 * Life-events store — per-profile, local-first notes the user enters during
 * onboarding (and later) as optional context for MANUAL birth-time
 * rectification.
 *
 * These are plain free-text/dated notes the person writes about their own life
 * (marriage, a career change, a move). The app NEVER auto-matches them to
 * planetary timing — they survive locally so that when the user rectifies their
 * birth time by hand in Settings they have their own reference points to weigh
 * against the live Ascendant.
 *
 * Fully local-first: no account, no server. Persisted to IndexedDB via
 * `idb-keyval` under its own key, mirroring the chartLibrary / profiles pattern,
 * keyed by the owning profile id so each person keeps their own notes.
 */

import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

/** A persisted life-event note belonging to one profile. */
export interface LifeEvent {
  /** Stable id (uuid where available). */
  readonly id: string;
  /** The user's own words for the event. */
  readonly description: string;
  /** Optional `YYYY-MM-DD` (or freer) date the user attached. */
  readonly date?: string;
  /** ISO-8601 creation timestamp; also the stable ordering key within a profile. */
  readonly createdAt: string;
}

/** What a caller supplies to persist an event — id/createdAt are assigned here. */
export interface LifeEventInput {
  readonly description: string;
  readonly date?: string;
}

/** A single IndexedDB key holding all profiles' life events, persisted by zustand. */
const PERSIST_NAME = 'almamesh-life-events';

/** Bump when the persisted `LifeEvent` shape changes; always pair with `migrate`. */
export const LIFE_EVENTS_PERSIST_VERSION = 1;

/** The slice of the store that `partialize` actually persists. */
export interface PersistedLifeEventsState {
  readonly eventsByProfile: Readonly<Record<string, readonly LifeEvent[]>>;
}

/** A plain (non-array) object — the only shape `eventsByProfile` may safely take. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Defensive hydration: tolerate ANY old/unknown/corrupt persisted blob and
 * always return a valid `{ eventsByProfile }`. A returning visitor whose stored
 * notes are malformed must never crash the app — we fall back to an empty map.
 */
export function migrateLifeEventsPersistedState(
  persisted: unknown,
  _fromVersion: number,
): PersistedLifeEventsState {
  if (!isPlainRecord(persisted)) {
    return { eventsByProfile: {} };
  }
  const byProfile = persisted.eventsByProfile;
  return {
    eventsByProfile: isPlainRecord(byProfile)
      ? (byProfile as PersistedLifeEventsState['eventsByProfile'])
      : {},
  };
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

/** Generate an event id (uuid where available, deterministic counter fallback). */
let idFallbackCounter = 0;
function nextEventId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  idFallbackCounter += 1;
  return `life-event-${Date.now()}-${idFallbackCounter}`;
}

/** Promote a raw input into a stored event, dropping blank descriptions. */
function toLifeEvent(input: LifeEventInput): LifeEvent | null {
  const description = input.description.trim();
  if (description.length === 0) {
    return null;
  }
  const date = input.date?.trim();
  return {
    id: nextEventId(),
    description,
    createdAt: new Date().toISOString(),
    ...(date ? { date } : {}),
  };
}

export interface LifeEventsStore {
  /** All life-event notes, keyed by owning profile id. */
  readonly eventsByProfile: Readonly<Record<string, readonly LifeEvent[]>>;
  /** True once zustand has rehydrated from IndexedDB. */
  readonly hydrated: boolean;

  /** Replace a profile's notes with a fresh set (blank descriptions dropped). */
  setEvents: (profileId: string, events: readonly LifeEventInput[]) => void;
  /** Append a single note to a profile (no-op for a blank description). */
  addEvent: (profileId: string, event: LifeEventInput) => void;
  /** A profile's notes in creation order (empty array when none). */
  getEvents: (profileId: string) => readonly LifeEvent[];
  /** Remove every note for a profile (e.g. when the person is deleted). */
  clearEvents: (profileId: string) => void;
}

export const lifeEventsStoreCreator: StateCreator<LifeEventsStore> = (set, get) => ({
  eventsByProfile: {},
  hydrated: false,

  setEvents: (profileId, events) => {
    const mapped = events.map(toLifeEvent).filter((e): e is LifeEvent => e !== null);
    set((state) => ({
      eventsByProfile: { ...state.eventsByProfile, [profileId]: mapped },
    }));
  },

  addEvent: (profileId, event) => {
    const mapped = toLifeEvent(event);
    if (!mapped) {
      return;
    }
    set((state) => ({
      eventsByProfile: {
        ...state.eventsByProfile,
        [profileId]: [...(state.eventsByProfile[profileId] ?? []), mapped],
      },
    }));
  },

  getEvents: (profileId) => get().eventsByProfile[profileId] ?? [],

  clearEvents: (profileId) => {
    set((state) => {
      if (!(profileId in state.eventsByProfile)) {
        return state;
      }
      const next = { ...state.eventsByProfile };
      delete next[profileId];
      return { eventsByProfile: next };
    });
  },
});

export const useLifeEventsStore = create<LifeEventsStore>()(
  persist<LifeEventsStore, [], [], PersistedLifeEventsState>(lifeEventsStoreCreator, {
    name: PERSIST_NAME,
    version: LIFE_EVENTS_PERSIST_VERSION,
    migrate: migrateLifeEventsPersistedState,
    storage: createJSONStorage(() => idbStorage),
    partialize: (state) => ({ eventsByProfile: state.eventsByProfile }),
    onRehydrateStorage: () => () => {
      useLifeEventsStore.setState({ hydrated: true });
    },
  }),
);

/**
 * Resolve once the life-events store has finished rehydrating from IndexedDB.
 * Mirrors `whenChartLibraryHydrated` — await before any read that must reflect
 * the persisted truth (avoids the async-rehydrate false-empty race).
 */
export function whenLifeEventsHydrated(): Promise<void> {
  const { persist: persistApi } = useLifeEventsStore;
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
