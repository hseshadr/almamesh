/**
 * Predictive Store - the LAZY predictive contexts (transits, full vargas,
 * strength, life domains) for the active profile.
 *
 * Architecture (Wave C integration spine):
 * - The natal chart pipeline stays fast and byte-identical; the predictive
 *   superset takes ~35s under Pyodide, so it is computed LAZILY through the
 *   engine's second entrypoint (`computePredictive`) and cached here.
 * - `ensurePredictive(runtime, input)` is IDEMPOTENT per profile + reference
 *   instant: a repeat call while `ready` or `loading` for the same key is a
 *   no-op. A failed run can always be retried.
 * - The reference instant is EXPLICIT (never a silent now()): callers pin it,
 *   which pins both the "current" dasha and the transit "now".
 * - Raw engine contexts are adapted through the pure `to*Ctx` adapters; this
 *   store holds only UI-shaped data (`@almamesh/shared-types`). No astrology
 *   is computed in TypeScript.
 */

import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type {
  DomainsCtx,
  StrengthCtx,
  TransitCtx,
  VargaCtxFull,
} from '@almamesh/shared-types';
import type { PredictiveContexts, PredictiveInput } from '@almamesh/browser/types';
import {
  toDomainsCtx,
  toStrengthCtx,
  toTransitCtx,
  toVargaCtx,
} from './adapters/predictive';

export type PredictiveStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * What the store needs from the runtime: the ready engine surface. The
 * `ChartEngine` returned by `AlmaMeshRuntime.bootstrap()` / `.engine()`
 * satisfies this structurally.
 */
export interface PredictiveRuntime {
  computePredictive(input: PredictiveInput): Promise<PredictiveContexts>;
}

/** Birth + instant input for `ensurePredictive`. `referenceInstant` is REQUIRED. */
export interface EnsurePredictiveInput {
  /** Cache identity: the profile this chart belongs to. */
  readonly profileKey: string;
  readonly datetimeUtc: string; // ISO-8601 UTC birth instant
  readonly latitude: number;
  readonly longitude: number;
  /** ISO-8601 — explicit, never wall-clock; pins dasha "current" + transit "now". */
  readonly referenceInstant: string;
}

export interface PredictiveStore {
  status: PredictiveStatus;
  error?: string;
  transitCtx?: TransitCtx;
  vargaCtxFull?: VargaCtxFull;
  strengthCtx?: StrengthCtx;
  domainsCtx?: DomainsCtx;
  /** The profile the loaded/loading contexts belong to. */
  profileKey?: string;
  /** Internal idempotency key: `${profileKey}@${referenceInstant}`. */
  requestKey?: string;
  /**
   * Compute (once) the predictive contexts for `input` via the engine.
   * No-op when already `ready` or `loading` for the same profile + reference
   * instant; an `error` state can always be retried.
   */
  ensurePredictive(runtime: PredictiveRuntime, input: EnsurePredictiveInput): Promise<void>;
  /** Back to `idle` with no contexts (e.g. on profile deletion). */
  reset(): void;
}

const EMPTY_CONTEXTS = {
  transitCtx: undefined,
  vargaCtxFull: undefined,
  strengthCtx: undefined,
  domainsCtx: undefined,
} as const;

const requestKeyOf = (input: EnsurePredictiveInput): string =>
  `${input.profileKey}@${input.referenceInstant}`;

// --- Persistence (IndexedDB via idb-keyval) ---------------------------------
//
// The predictive superset takes ~30s under Pyodide. Without persistence the
// store reset to `idle` on every page reload / PWA relaunch, so the auto-kickoff
// re-ran the whole compute even though the chart + reference day were unchanged
// ("Life Atlas keeps regenerating"). We persist ONLY a completed (`ready`)
// result keyed by `${profileKey}@${referenceInstant}`, so a reload with the same
// chart + day rehydrates to `ready` and `ensurePredictive` short-circuits.

/** Bump when the persisted predictive shape changes; always pair with `migrate`. */
export const PREDICTIVE_PERSIST_VERSION = 1;

/** The single IndexedDB key holding the persisted predictive slice. */
export const PREDICTIVE_PERSIST_NAME = 'almamesh-predictive';

/**
 * The slice `partialize` persists. Written ONLY when `status === 'ready'` (a
 * completed result); a `loading`/`error` state is flattened to `idle` so a
 * reload mid-compute or a cached failure never re-serves a broken/half state.
 */
export interface PersistedPredictiveState {
  status: PredictiveStatus;
  error?: string;
  transitCtx?: TransitCtx;
  vargaCtxFull?: VargaCtxFull;
  strengthCtx?: StrengthCtx;
  domainsCtx?: DomainsCtx;
  profileKey?: string;
  requestKey?: string;
}

/** The clean idle snapshot both `migrate` and the rehydration coercer fall back to. */
const IDLE_PERSISTED: PersistedPredictiveState = {
  status: 'idle',
  error: undefined,
  ...EMPTY_CONTEXTS,
  profileKey: undefined,
  requestKey: undefined,
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** True only where IndexedDB exists (browsers/workers), not in SSR/unit tests. */
function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * zustand `StateStorage` backed by IndexedDB (`idb-keyval`) — the exact pattern
 * the chart library uses. Outside a browser (SSR, unit tests) IndexedDB is
 * absent, so every op is a benign no-op and the store simply runs in-memory;
 * persistence is a browser-only enhancement, not a correctness requirement.
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

/** Persist ONLY a completed (`ready`) result + its identity; else persist idle. */
function partializePredictive(state: PredictiveStore): PersistedPredictiveState {
  if (state.status !== 'ready') {
    return IDLE_PERSISTED;
  }
  return {
    status: 'ready',
    error: undefined,
    transitCtx: state.transitCtx,
    vargaCtxFull: state.vargaCtxFull,
    strengthCtx: state.strengthCtx,
    domainsCtx: state.domainsCtx,
    profileKey: state.profileKey,
    requestKey: state.requestKey,
  };
}

/**
 * Coerce ANY persisted blob into a SAFE snapshot. Only a fully-formed `ready`
 * result (its contexts plus a `requestKey` identity) survives a reload; a
 * persisted `loading`/`error`/unknown shape is flattened to a clean `idle` so a
 * reload mid-compute or a cached failure never wedges the store or serves stale
 * or half-computed data.
 */
export function coercePersistedPredictive(persisted: unknown): PersistedPredictiveState {
  if (
    !isPlainRecord(persisted) ||
    persisted.status !== 'ready' ||
    typeof persisted.requestKey !== 'string'
  ) {
    return IDLE_PERSISTED;
  }
  return {
    status: 'ready',
    error: undefined,
    transitCtx: persisted.transitCtx as TransitCtx | undefined,
    vargaCtxFull: persisted.vargaCtxFull as VargaCtxFull | undefined,
    strengthCtx: persisted.strengthCtx as StrengthCtx | undefined,
    domainsCtx: persisted.domainsCtx as DomainsCtx | undefined,
    profileKey: typeof persisted.profileKey === 'string' ? persisted.profileKey : undefined,
    requestKey: persisted.requestKey,
  };
}

/**
 * Any old/unknown persisted VERSION → a clean idle slate (forcing a fresh
 * compute). On the CURRENT version the untouched blob flows through `merge`.
 */
export function migratePredictivePersistedState(
  _persisted: unknown,
  _fromVersion: number,
): PersistedPredictiveState {
  return IDLE_PERSISTED;
}

/** Merge the (coerced) persisted slice onto the live store, keeping its actions. */
function mergePredictivePersisted(persisted: unknown, current: PredictiveStore): PredictiveStore {
  return { ...current, ...coercePersistedPredictive(persisted) };
}

export const predictiveStoreCreator: StateCreator<PredictiveStore> = (set, get) => ({
  status: 'idle',
  error: undefined,
  ...EMPTY_CONTEXTS,
  profileKey: undefined,
  requestKey: undefined,

  async ensurePredictive(runtime, input) {
    const key = requestKeyOf(input);
    const { status, requestKey } = get();
    const settledForKey = status === 'ready' || status === 'loading';
    if (settledForKey && requestKey === key) {
      return; // idempotent: already computed (or computing) this exact request
    }
    set({
      status: 'loading',
      error: undefined,
      ...EMPTY_CONTEXTS,
      profileKey: input.profileKey,
      requestKey: key,
    });
    try {
      const raw = await runtime.computePredictive({
        datetimeUtc: input.datetimeUtc,
        latitude: input.latitude,
        longitude: input.longitude,
        referenceInstant: input.referenceInstant,
      });
      if (get().requestKey !== key) {
        return; // superseded by a newer profile/instant while in flight
      }
      set({
        status: 'ready',
        error: undefined,
        transitCtx: toTransitCtx(raw.transit_context),
        vargaCtxFull: toVargaCtx(raw.varga_context_full),
        strengthCtx: toStrengthCtx(raw.strength_context),
        domainsCtx: toDomainsCtx(raw.domains_context),
      });
    } catch (err) {
      if (get().requestKey !== key) {
        return; // a newer request owns the store now; keep its state
      }
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        ...EMPTY_CONTEXTS,
      });
    }
  },

  reset() {
    set({
      status: 'idle',
      error: undefined,
      ...EMPTY_CONTEXTS,
      profileKey: undefined,
      requestKey: undefined,
    });
  },
});

export const usePredictiveStore = create<PredictiveStore>()(
  persist<PredictiveStore, [], [], PersistedPredictiveState>(predictiveStoreCreator, {
    name: PREDICTIVE_PERSIST_NAME,
    version: PREDICTIVE_PERSIST_VERSION,
    storage: createJSONStorage(() => idbStorage),
    partialize: partializePredictive,
    migrate: migratePredictivePersistedState,
    merge: mergePredictivePersisted,
  }),
);
