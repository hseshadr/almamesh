/**
 * Chart library store — the on-device, local-first replacement for the backend
 * chart storage. Holds the adapted `ChartData` the UI renders, keyed by
 * `chart_id`, persisted to IndexedDB via `idb-keyval`.
 *
 * No backend, no account: charts the in-browser engine computes are saved here
 * and survive reloads. Routing's "has a chart?" check reads this store (mirrored
 * to a localStorage flag for synchronous route guards — see lib/localChart.ts).
 */

import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

import type { ChartData } from '@almamesh/shared-types';
import type { SiderealChart } from '@almamesh/browser/types';

/** A chart as held on-device: the rendered shape plus its identity + primacy. */
export interface StoredChart extends ChartData {
  readonly chart_id: string;
  readonly person_name: string;
  readonly is_primary: boolean;
  /**
   * The profile (person) this chart belongs to. Optional for back-compat:
   * charts persisted before named profiles shipped have no `profile_id` and are
   * treated as visible under ANY active profile (and claimed by migration into
   * a default profile). `is_primary` is scoped per-profile.
   */
  readonly profile_id?: string;
  /**
   * The engine's raw, lossless `SiderealChart` output (P4). The rendered
   * `ChartData` above is a lossy reshape; on-device LLM narration needs the
   * full engine output (dashas, yogas, dignities) to sanitize and interpret.
   * Optional so charts persisted before P4 still load.
   */
  readonly sidereal_chart?: SiderealChart;
}

/** A single IndexedDB key holding the whole library, persisted by zustand. */
const PERSIST_NAME = 'almamesh-chart-library';

/** Bump when the persisted chart shape changes; always pair with `migrate`. */
export const CHART_LIBRARY_PERSIST_VERSION = 1;

/** The slice of the store that `partialize` actually persists. */
export interface PersistedChartLibraryState {
  readonly charts: Readonly<Record<string, StoredChart>>;
}

/** A plain (non-array) object — the only shape `charts` may safely take. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Defensive hydration: tolerate ANY old/unknown/corrupt persisted blob and
 * always return a valid `{ charts }` map. A returning visitor whose stored chart
 * library is malformed (a string, an array, a missing field) must never crash
 * the dashboard — we fall back to an empty library rather than throwing.
 */
export function migrateChartLibraryPersistedState(
  persisted: unknown,
  _fromVersion: number,
): PersistedChartLibraryState {
  if (!isPlainRecord(persisted)) {
    return { charts: {} };
  }
  const charts = persisted.charts;
  return { charts: isPlainRecord(charts) ? (charts as PersistedChartLibraryState['charts']) : {} };
}

/**
 * The localStorage flag routing reads synchronously. IndexedDB is async, so we
 * mirror "a chart exists" into localStorage on every mutation; lib/localChart.ts
 * reads this key. Kept in sync here so the two never disagree.
 */
export const CHART_LIBRARY_FLAG_KEY = 'almamesh-chart';

function setLibraryFlag(hasAny: boolean): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  if (hasAny) {
    localStorage.setItem(CHART_LIBRARY_FLAG_KEY, '1');
  } else {
    localStorage.removeItem(CHART_LIBRARY_FLAG_KEY);
  }
}

/**
 * The active profile scope used to filter chart listing + primacy. Held as a
 * module variable (not a prop) so the profiles store can push it in without
 * chartLibrary importing the profiles store — keeping the two decoupled. `null`
 * means "no active profile" and resolves to "show all charts" (back-compat /
 * pre-migration / the exit-gate's profile-less seed).
 */
let activeProfileScope: string | null = null;

/**
 * Set the active profile scope. Called by the profiles store on hydrate and on
 * every active-profile change. Idempotent; no chartLibrary state mutation.
 */
export function setActiveProfileScope(profileId: string | null): void {
  activeProfileScope = profileId;
}

/** Read the active profile scope (test/coordination helper). */
export function getActiveProfileScope(): string | null {
  return activeProfileScope;
}

/**
 * A chart is in scope when: there is no active profile (show all), OR the chart
 * has no `profile_id` (back-compat orphan, visible everywhere until migrated),
 * OR the chart's `profile_id` matches the active scope.
 */
function chartInScope(chart: StoredChart, scope: string | null): boolean {
  return scope === null || chart.profile_id === undefined || chart.profile_id === scope;
}

/** True only where IndexedDB exists (real browsers / workers), not in SSR/tests. */
function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * zustand `StateStorage` backed by IndexedDB (`idb-keyval`). Outside a browser
 * (SSR, unit tests) IndexedDB is absent, so every op is a benign no-op and the
 * store simply runs in-memory — persistence is a browser-only enhancement, not
 * a correctness requirement.
 */
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

export interface ChartLibraryStore {
  /** All stored charts, keyed by `chart_id`. */
  readonly charts: Readonly<Record<string, StoredChart>>;
  /** True once zustand has rehydrated from IndexedDB. */
  readonly hydrated: boolean;

  saveChart: (chart: StoredChart) => void;
  getChart: (chartId: string) => StoredChart | undefined;
  /** Charts in the active profile scope (or all when no profile is active). */
  listCharts: () => StoredChart[];
  /** Every chart on the device, ignoring profile scope (admin/migration use). */
  listAllCharts: () => StoredChart[];
  deleteChart: (chartId: string) => void;
  /** Delete every chart belonging to a profile (used when a person is removed). */
  deleteChartsForProfile: (profileId: string) => void;
  /** Assign all profile-less (orphan) charts to a profile — idempotent migration. */
  assignOrphanChartsToProfile: (profileId: string) => number;
  getPrimaryChart: () => StoredChart | undefined;
}

export const chartLibraryStoreCreator: StateCreator<ChartLibraryStore> = (set, get) => ({
  charts: {},
  hydrated: false,

  saveChart: (chart) => {
    set((state) => {
      // Primacy is per-profile: a newly-primary chart only demotes the prior
      // primary WITHIN its own profile scope, so each person keeps one primary.
      const scope = chart.profile_id ?? null;
      const next: Record<string, StoredChart> = {};
      for (const [id, existing] of Object.entries(state.charts)) {
        const sameScope = (existing.profile_id ?? null) === scope;
        next[id] = chart.is_primary && sameScope ? { ...existing, is_primary: false } : existing;
      }
      next[chart.chart_id] = chart;
      return { charts: next };
    });
    setLibraryFlag(get().listCharts().length > 0);
  },

  getChart: (chartId) => get().charts[chartId],

  listCharts: () =>
    Object.values(get().charts).filter((c) => chartInScope(c, activeProfileScope)),

  listAllCharts: () => Object.values(get().charts),

  deleteChart: (chartId) => {
    set((state) => {
      const next = { ...state.charts };
      delete next[chartId];
      return { charts: next };
    });
    setLibraryFlag(get().listCharts().length > 0);
  },

  deleteChartsForProfile: (profileId) => {
    set((state) => {
      const next: Record<string, StoredChart> = {};
      for (const [id, chart] of Object.entries(state.charts)) {
        if (chart.profile_id !== profileId) {
          next[id] = chart;
        }
      }
      return { charts: next };
    });
    setLibraryFlag(get().listCharts().length > 0);
  },

  assignOrphanChartsToProfile: (profileId) => {
    let claimed = 0;
    set((state) => {
      const next: Record<string, StoredChart> = {};
      for (const [id, chart] of Object.entries(state.charts)) {
        if (chart.profile_id === undefined) {
          next[id] = { ...chart, profile_id: profileId };
          claimed += 1;
        } else {
          next[id] = chart;
        }
      }
      return { charts: next };
    });
    if (claimed > 0) {
      setLibraryFlag(get().listCharts().length > 0);
    }
    return claimed;
  },

  getPrimaryChart: () => {
    const inScope = get().listCharts();
    return inScope.find((c) => c.is_primary) ?? inScope[0];
  },
});

export const useChartLibraryStore = create<ChartLibraryStore>()(
  persist<ChartLibraryStore, [], [], PersistedChartLibraryState>(chartLibraryStoreCreator, {
    name: PERSIST_NAME,
    version: CHART_LIBRARY_PERSIST_VERSION,
    migrate: migrateChartLibraryPersistedState,
    storage: createJSONStorage(() => idbStorage),
    partialize: (state) => ({ charts: state.charts }),
    onRehydrateStorage: () => (state) => {
      // Re-sync the synchronous routing flag from the rehydrated truth.
      setLibraryFlag(!!state && Object.keys(state.charts).length > 0);
      useChartLibraryStore.setState({ hydrated: true });
    },
  }),
);

/**
 * Resolve once the chart library has finished rehydrating from IndexedDB.
 *
 * IndexedDB is async, so on a fresh document load (PWA reopen, hard refresh)
 * the store is created empty and `persist` rehydrates it on a later microtask.
 * Reading `getPrimaryChart()` before that completes returns a false miss. Any
 * caller that needs the persisted truth must `await` this first.
 *
 * Resolves immediately when hydration is already done (or when persistence is
 * unavailable — SSR/tests — where `persist.hasHydrated()` reports `true`).
 * The library package owns this knowledge so pages don't reach into zustand
 * persist internals.
 */
export function whenChartLibraryHydrated(): Promise<void> {
  const { persist: persistApi } = useChartLibraryStore;
  // Defensive: if the persist API or its hooks are absent, treat as hydrated.
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

/**
 * Cascade-delete every chart owned by a profile. Called when a person is
 * removed (see `profiles.deleteProfile`) so deleting a person also removes their
 * charts — no orphaned data. Thin wrapper over the store action, kept here so
 * the profiles store stays chart-agnostic and imports only this one helper.
 */
export function cascadeDeleteCharts(profileId: string): void {
  useChartLibraryStore.getState().deleteChartsForProfile(profileId);
}
