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

import type { LifeEventCategory } from '@almamesh/shared-types';
import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

/** A persisted life-event note belonging to one profile. */
export interface LifeEvent {
  /** Stable id (uuid where available). */
  readonly id: string;
  /**
   * Free-text note from the onboarding capture path (legacy/backward-compat).
   * New events from the structured wizard use `note` instead.
   */
  readonly description?: string;
  /**
   * Structured text note for the rectification wizard path.
   * Also populated from `description` during v1→v2 migration.
   */
  readonly note?: string;
  /**
   * ISO `YYYY-MM-DD` date of the event.
   * Empty string `""` for migrated/unstructured (needsStructuring) events.
   */
  readonly date: string;
  /**
   * Life-event category for rectification analysis.
   * Absent on migrated legacy events (drafts awaiting user completion).
   */
  readonly category?: LifeEventCategory;
  /**
   * True for events migrated from v1 that still need the user to supply
   * a structured date + category before they can be sent to the engine.
   */
  readonly needsStructuring?: boolean;
  /** ISO-8601 creation timestamp; also the stable ordering key within a profile. */
  readonly createdAt: string;
}

/**
 * What a caller supplies to persist an event — id/createdAt are assigned here.
 *
 * Kept draft-tolerant for backward compatibility: the Onboarding page calls
 * `setEvents(profileId, [{ description }])` without a date or category, and
 * that call must continue to typecheck without changes to Onboarding.tsx.
 */
export interface LifeEventInput {
  readonly description: string;
  readonly date?: string;
}

/** A single IndexedDB key holding all profiles' life events, persisted by zustand. */
const PERSIST_NAME = 'almamesh-life-events';

/** Bump when the persisted `LifeEvent` shape changes; always pair with `migrate`. */
export const LIFE_EVENTS_PERSIST_VERSION = 2;

/** The slice of the store that `partialize` actually persists. */
export interface PersistedLifeEventsState {
  readonly eventsByProfile: Readonly<Record<string, readonly LifeEvent[]>>;
}

/** A plain (non-array) object — the only shape `eventsByProfile` may safely take. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Coerce a single unknown persisted blob into a valid v2 `LifeEvent`.
 * Called for every event in a profile when migrating from v1 (or v0).
 */
function migrateEventToV2(e: unknown): LifeEvent {
  if (!isPlainRecord(e)) {
    return { id: nextEventId(), date: '', createdAt: new Date().toISOString(), needsStructuring: true };
  }
  // Already v2 — has fields that only exist in the new shape.
  if ('needsStructuring' in e || 'note' in e) {
    return e as unknown as LifeEvent;
  }
  // Legacy v1/v0 event: { id?, description?, date?, createdAt? }
  return {
    id: typeof e.id === 'string' ? e.id : nextEventId(),
    note: typeof e.description === 'string' && e.description.length > 0 ? e.description : undefined,
    date: '',
    needsStructuring: true,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString(),
  };
}

/**
 * Defensive hydration: tolerate ANY old/unknown/corrupt persisted blob and
 * always return a valid `{ eventsByProfile }`. A returning visitor whose stored
 * notes are malformed must never crash the app — we fall back to an empty map.
 *
 * Migration chain:
 *   v0/v1 → v2: legacy `{ description }` events become `{ note, date: "", needsStructuring: true }` drafts.
 */
export function migrateLifeEventsPersistedState(
  persisted: unknown,
  fromVersion: number,
): PersistedLifeEventsState {
  if (!isPlainRecord(persisted)) {
    return { eventsByProfile: {} };
  }
  const byProfile = persisted.eventsByProfile;
  if (!isPlainRecord(byProfile)) {
    return { eventsByProfile: {} };
  }

  // v0/v1 → v2: promote legacy free-text events to structured drafts.
  if (fromVersion < 2) {
    const migrated: Record<string, readonly LifeEvent[]> = {};
    for (const [profileId, events] of Object.entries(byProfile)) {
      migrated[profileId] = Array.isArray(events) ? events.map(migrateEventToV2) : [];
    }
    return { eventsByProfile: migrated };
  }

  return { eventsByProfile: byProfile as PersistedLifeEventsState['eventsByProfile'] };
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

/**
 * Promote a raw input into a stored event.
 * Blank descriptions are rejected (returns null); callers filter those out.
 * Date defaults to `""` (required field in v2 shape) when not provided.
 */
function toLifeEvent(input: LifeEventInput): LifeEvent | null {
  const description = input.description.trim();
  if (description.length === 0) {
    return null;
  }
  return {
    id: nextEventId(),
    description,
    date: input.date?.trim() ?? '',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Returns true when an event has both a non-empty date and a category —
 * i.e. it is fully structured and eligible to be sent to the rectification engine.
 *
 * Events with `needsStructuring: true` (migrated legacy notes) return false until
 * the user fills in date + category in the wizard.
 */
export function isStructuredLifeEvent(e: LifeEvent): boolean {
  return Boolean(e.date) && Boolean(e.category);
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
  /**
   * Patch mutable fields on one event. A no-op when `id` is not found.
   * Patchable fields: `date`, `category`, `note`, `needsStructuring`.
   */
  editEvent: (
    profileId: string,
    id: string,
    patch: Partial<Pick<LifeEvent, 'date' | 'category' | 'note' | 'needsStructuring'>>,
  ) => void;
  /** Remove a single event by id. A no-op when `id` is not found. */
  removeEvent: (profileId: string, id: string) => void;
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

  editEvent: (profileId, id, patch) => {
    set((state) => {
      const events = state.eventsByProfile[profileId];
      if (!events) {
        return state;
      }
      const idx = events.findIndex((e) => e.id === id);
      if (idx === -1) {
        return state;
      }
      const updated = [
        ...events.slice(0, idx),
        { ...events[idx], ...patch },
        ...events.slice(idx + 1),
      ] as readonly LifeEvent[];
      return { eventsByProfile: { ...state.eventsByProfile, [profileId]: updated } };
    });
  },

  removeEvent: (profileId, id) => {
    set((state) => {
      const events = state.eventsByProfile[profileId];
      if (!events) {
        return state;
      }
      const filtered = events.filter((e) => e.id !== id);
      if (filtered.length === events.length) {
        return state;
      }
      return { eventsByProfile: { ...state.eventsByProfile, [profileId]: filtered } };
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
