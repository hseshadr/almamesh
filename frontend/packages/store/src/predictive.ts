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

import { create } from 'zustand';
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

export const usePredictiveStore = create<PredictiveStore>()((set, get) => ({
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
}));
