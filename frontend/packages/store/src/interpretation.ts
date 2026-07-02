/**
 * Interpretation store — the on-device, local-first home for the structured
 * `VedicInterpretation` the app generates client-side, keyed by `chartId` and
 * persisted to localStorage so a generated reading survives reloads.
 *
 * No backend, no streaming SSE: unlike the predecessor (which tracked a server
 * stream token-by-token), the WHOLE `VedicInterpretation` is produced in the
 * browser, so this store holds the finished object plus coarse per-section
 * progress for the dashboard to render. Persistence is localStorage (small,
 * synchronous) under a single key, mirroring the naming of the other slices
 * (`almamesh-chart-library`, `almamesh-profiles`).
 *
 * Callers pass `updatedAt` (an ISO string) explicitly — the store never calls
 * `Date.now()`/`new Date()` itself, keeping it deterministic and easy to test.
 */

import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { VedicInterpretation } from '@almamesh/shared-types';

/** Lifecycle of a chart's interpretation generation. */
export type InterpretationStatus = 'idle' | 'generating' | 'complete' | 'error';

/** The persisted record for a single chart's interpretation. */
export interface ChartInterpretationEntry {
  readonly status: InterpretationStatus;
  /** The finished structured reading; present once `status === 'complete'`. */
  readonly interpretation?: VedicInterpretation;
  /** Failure message; present once `status === 'error'`. */
  readonly error?: string;
  /** Section key -> completed. Lets the dashboard show progressive progress. */
  readonly sections: Readonly<Record<string, boolean>>;
  /**
   * Section key -> failed. Per-section LLM failures degrade that section to
   * empty while the run still completes; recording them here lets the UI stay
   * honest about the gap (and offer a regenerate) instead of rendering a blank
   * section with no signal. Optional so pre-existing persisted entries load
   * unchanged; cleared by `startInterpretation`.
   */
  readonly failedSections?: Readonly<Record<string, boolean>>;
  /** ISO-8601 timestamp of the last mutation; supplied by the caller. */
  readonly updatedAt?: string;
}

export interface InterpretationStore {
  /** All interpretation entries, keyed by `chartId`. */
  readonly byChart: Readonly<Record<string, ChartInterpretationEntry>>;

  /** Begin generation: status -> 'generating', clearing any prior result. */
  startInterpretation: (chartId: string) => void;
  /** Record that one named section finished (progressive progress). */
  markSectionComplete: (chartId: string, section: string) => void;
  /** Record that one named section FAILED (degraded to empty; run continues). */
  markSectionFailed: (chartId: string, section: string) => void;
  /** Store the finished reading: status -> 'complete'. */
  setInterpretation: (
    chartId: string,
    interpretation: VedicInterpretation,
    updatedAt: string,
  ) => void;
  /** Record a failure: status -> 'error'. */
  setError: (chartId: string, error: string) => void;
  /** Read one chart's entry, or `undefined` if none exists. */
  getEntry: (chartId: string) => ChartInterpretationEntry | undefined;
  /** Drop one chart's entry entirely. */
  reset: (chartId: string) => void;
  /** Drop every chart's entry — the "start fresh" reset. */
  clearAll: () => void;
}

/** A single localStorage key holding every interpretation, persisted by zustand. */
const PERSIST_NAME = 'almamesh-interpretations';

/**
 * Bump when the persisted shape changes; always pair with `migrate`.
 * v2: `VedicInterpretation.summary` went from a bare `string` to a dual-mode
 * `Persona` ({ layman, technical }). The migration normalizes any old string
 * summary into both voices — no regeneration; the old text renders in both.
 */
export const INTERPRETATION_PERSIST_VERSION = 2;

/** The slice of the store that `partialize` actually persists. */
export interface PersistedInterpretationState {
  readonly byChart: Readonly<Record<string, ChartInterpretationEntry>>;
}

/** A plain (non-array) object — the only shape `byChart` may safely take. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Defensive hydration: tolerate ANY old/unknown/corrupt persisted blob and
 * always return a valid `{ byChart }`. A returning visitor whose stored reading
 * map is malformed (a string, an array, a missing field) must never crash the
 * dashboard — we fall back to an empty map and the reading regenerates.
 */
export function migrateInterpretationPersistedState(
  persisted: unknown,
  _fromVersion: number,
): PersistedInterpretationState {
  if (!isPlainRecord(persisted)) {
    return { byChart: {} };
  }
  const byChart = persisted.byChart;
  if (!isPlainRecord(byChart)) {
    return { byChart: {} };
  }
  const normalized: Record<string, ChartInterpretationEntry> = {};
  for (const [chartId, entry] of Object.entries(byChart)) {
    normalized[chartId] = normalizeEntrySummary(entry);
  }
  return { byChart: normalized };
}

/**
 * v1 -> v2: a persisted `interpretation.summary` may be a bare `string` (the
 * pre-dual-voice shape). Normalize it to a dual-mode `Persona` so the same text
 * renders in both the "For You" and "For Astrologer" voices. Entries with no
 * interpretation, or an already-dual summary, pass through unchanged.
 */
function normalizeEntrySummary(entry: unknown): ChartInterpretationEntry {
  if (!isPlainRecord(entry)) {
    return entry as unknown as ChartInterpretationEntry;
  }
  const interpretation = entry.interpretation;
  if (!isPlainRecord(interpretation) || typeof interpretation.summary !== 'string') {
    return entry as unknown as ChartInterpretationEntry;
  }
  const summary = interpretation.summary;
  return {
    ...(entry as unknown as ChartInterpretationEntry),
    interpretation: {
      ...(interpretation as unknown as VedicInterpretation),
      summary: { layman: summary, technical: summary },
    },
  };
}

/** True only where localStorage exists (real browsers), not in SSR/unit tests. */
function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/**
 * zustand `StateStorage` backed by localStorage. Outside a browser (SSR, unit
 * tests) localStorage is absent, so every op is a benign no-op and the store
 * simply runs in-memory — persistence is a browser-only enhancement, not a
 * correctness requirement (mirrors the IndexedDB pattern in the other slices).
 */
const localStorageBackend: StateStorage = {
  getItem: (name) => (hasLocalStorage() ? localStorage.getItem(name) : null),
  setItem: (name, value) => {
    if (hasLocalStorage()) {
      localStorage.setItem(name, value);
    }
  },
  removeItem: (name) => {
    if (hasLocalStorage()) {
      localStorage.removeItem(name);
    }
  },
};

/** The entry a chart starts from before any section has completed. */
const EMPTY_ENTRY: ChartInterpretationEntry = { status: 'idle', sections: {} };

/** Read the current entry for a chart, defaulting to the empty entry. */
function entryOf(
  byChart: Record<string, ChartInterpretationEntry>,
  chartId: string,
): ChartInterpretationEntry {
  return byChart[chartId] ?? EMPTY_ENTRY;
}

/** Pure: write one chart's entry, leaving the rest of the map untouched. */
function withEntry(
  byChart: Record<string, ChartInterpretationEntry>,
  chartId: string,
  entry: ChartInterpretationEntry,
): Record<string, ChartInterpretationEntry> {
  return { ...byChart, [chartId]: entry };
}

export const interpretationStoreCreator: StateCreator<InterpretationStore> = (set, get) => ({
  byChart: {},

  startInterpretation: (chartId) => {
    set((state) => ({
      byChart: withEntry(state.byChart, chartId, { status: 'generating', sections: {} }),
    }));
  },

  markSectionComplete: (chartId, section) => {
    set((state) => {
      const current = entryOf(state.byChart, chartId);
      const sections = { ...current.sections, [section]: true };
      return { byChart: withEntry(state.byChart, chartId, { ...current, sections }) };
    });
  },

  markSectionFailed: (chartId, section) => {
    set((state) => {
      const current = entryOf(state.byChart, chartId);
      const failedSections = { ...current.failedSections, [section]: true };
      return { byChart: withEntry(state.byChart, chartId, { ...current, failedSections }) };
    });
  },

  setInterpretation: (chartId, interpretation, updatedAt) => {
    set((state) => {
      const current = entryOf(state.byChart, chartId);
      const entry: ChartInterpretationEntry = {
        ...current,
        status: 'complete',
        interpretation,
        error: undefined,
        updatedAt,
      };
      return { byChart: withEntry(state.byChart, chartId, entry) };
    });
  },

  setError: (chartId, error) => {
    set((state) => {
      const current = entryOf(state.byChart, chartId);
      return {
        byChart: withEntry(state.byChart, chartId, { ...current, status: 'error', error }),
      };
    });
  },

  getEntry: (chartId) => get().byChart[chartId],

  reset: (chartId) => {
    set((state) => {
      const byChart = { ...state.byChart };
      delete byChart[chartId];
      return { byChart };
    });
  },

  clearAll: () => {
    set({ byChart: {} });
  },
});

/**
 * Interpretation store, persisted to localStorage under `almamesh-interpretations`.
 */
export const useInterpretationStore = create<InterpretationStore>()(
  persist<InterpretationStore, [], [], PersistedInterpretationState>(interpretationStoreCreator, {
    name: PERSIST_NAME,
    version: INTERPRETATION_PERSIST_VERSION,
    migrate: migrateInterpretationPersistedState,
    storage: createJSONStorage(() => localStorageBackend),
    partialize: (state) => ({ byChart: state.byChart }),
  }),
);
