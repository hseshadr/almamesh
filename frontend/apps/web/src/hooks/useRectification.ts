/**
 * useRectification — orchestration hook for the event-based birth-time
 * rectification wizard.
 *
 * Responsibilities:
 *  - Builds a `RectificationInput` from the profile's stored chart + structured
 *    life events (DST-aware UTC offset via dayjs; always pins `referenceDate`).
 *  - Calls `useRectificationStore.run(engine, input)` and exposes the store's
 *    `{ status, result, error }` through `state`.
 *  - Predictive gating: sets `useRectificationGate.active = true` while mounted
 *    so `usePredictiveLayer({ auto: true })` does not race the single serial
 *    Pyodide worker with a ~30s predictive job.
 *  - Cancel-on-unmount: if the component unmounts mid-run, the result is NOT
 *    left in the store — `reset()` is called immediately after the store's run
 *    completes.
 *  - Retry: calls `engineCtx.reboot()` (engine recovery) then re-runs with the
 *    same mode using the fresh engine — never a dead end.
 *
 * Guards surfaced to the wizard:
 *  - `engineReady`: false → show "engine warming" state, disable Run button.
 *  - `hasEnoughEvents`: false → prompt user to add a structured life event.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  useChartLibraryStore,
  useLifeEventsStore,
  useRectificationStore,
  isStructuredLifeEvent,
  type RectificationRuntime,
  type StoredChart,
} from '@almamesh/store';
import type {
  ProcessedBirthData,
  RectificationEventInput,
  RectificationMode,
  RectificationResult,
} from '@almamesh/shared-types';
import type { RectificationInput } from '@almamesh/browser/types';
import { useOptionalChartEngine } from '../providers/chartEngineContext';
import { predictiveReferenceInstant } from '../lib/predictive';
import { useRectificationGate } from '../lib/rectificationGate';

// Extend dayjs once; idempotent if another module already extended it.
dayjs.extend(utc);
dayjs.extend(timezone);

// ---------------------------------------------------------------------------
// Pure helpers (module-level for testability)
// ---------------------------------------------------------------------------

/**
 * Find the primary stored chart for `profileId` and reconstruct a minimal
 * birth description the hook needs to build the wire input.
 */
function birthDescForProfile(
  charts: Readonly<Record<string, StoredChart>>,
  profileId: string,
): {
  date: string;
  effectiveTime: string;
  latitude: number;
  longitude: number;
  tz: string;
} | null {
  const candidates = Object.values(charts).filter((c) => c.profile_id === profileId);
  const primary = candidates.find((c) => c.is_primary) ?? candidates[0];
  const birth = primary?.birth_data as ProcessedBirthData | undefined;
  const loc = birth?.birth_location_details;
  if (!birth || !loc) return null;

  const localDt = birth.birth_datetime_local ?? '';
  // Use the rectified time if present (birth_time_original = entered; effective is in localDt)
  const effectiveTime = localDt.split('T')[1]?.slice(0, 5) ?? '';
  if (!effectiveTime || !localDt.split('T')[0]) return null;

  return {
    date: localDt.split('T')[0] ?? '',
    effectiveTime,
    latitude: loc.latitude,
    longitude: loc.longitude,
    tz: loc.timezone ?? 'UTC',
  };
}

/** Build the camelCase wire payload from the birth description + events. */
function buildWireInput(
  birth: NonNullable<ReturnType<typeof birthDescForProfile>>,
  events: readonly RectificationEventInput[],
  mode: RectificationMode,
): RectificationInput {
  const tzd = dayjs.tz(`${birth.date}T${birth.effectiveTime}`, birth.tz);
  return {
    datetimeUtc: tzd.utc().toISOString(),
    latitude: birth.latitude,
    longitude: birth.longitude,
    utcOffsetMinutes: tzd.utcOffset(),
    events,
    mode,
    // Always pin referenceDate — omitting it makes the engine use wall clock
    // (non-deterministic, breaks reproducibility across re-runs).
    referenceDate: predictiveReferenceInstant(),
  };
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UseRectificationState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly result: RectificationResult | null;
  readonly error: string | null;
}

export interface UseRectificationResult {
  readonly state: UseRectificationState;
  /** True when the Pyodide engine is booted and ready. */
  readonly engineReady: boolean;
  /** True when the profile has ≥ 1 life event with both a date and a category. */
  readonly hasEnoughEvents: boolean;
  /** Kick off a rectification run with the given mode. No-op if not ready. */
  readonly run: (mode: RectificationMode) => Promise<void>;
  /** Reset the store to idle (clears any previous result or error). */
  readonly reset: () => void;
  /**
   * Reboot the engine (recovery path for a failed bootstrap) then re-run
   * with the same mode. Ensures there is never a permanent dead-end after
   * an engine failure — the engine-recovery invariant.
   */
  readonly retry: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRectification(profileId: string): UseRectificationResult {
  const engineCtx = useOptionalChartEngine();
  const engine = engineCtx?.engine ?? null;

  // Birth description from the chart library (reactive: re-derives if charts update).
  const charts = useChartLibraryStore((s) => s.charts);
  const birth = useMemo(() => birthDescForProfile(charts, profileId), [charts, profileId]);

  // Rectification store state (reactive selectors).
  const status = useRectificationStore((s) => s.status);
  const result = useRectificationStore((s) => s.result);
  const storeError = useRectificationStore((s) => s.error);

  // Reactive guard: re-evaluates when the profile's events change.
  const hasEnoughEvents = useLifeEventsStore(
    (s) => (s.eventsByProfile[profileId] ?? []).filter(isStructuredLifeEvent).length >= 1,
  );

  // cancelledRef: set to true on unmount so a mid-flight run's completion
  // triggers an immediate reset() rather than leaving stale results in the store.
  const cancelledRef = useRef(false);
  // Track the last mode so retry() can re-run with the same argument.
  const lastModeRef = useRef<RectificationMode | null>(null);

  // Gate + cancel-on-unmount lifecycle.
  useEffect(() => {
    cancelledRef.current = false;
    useRectificationGate.getState().setActive(true);
    return () => {
      cancelledRef.current = true;
      useRectificationGate.getState().setActive(false);
    };
  }, []);

  /**
   * Shared run logic — takes the engine explicitly so retry() can inject a
   * fresh engine from reboot() without relying on the stale closure value.
   */
  const executeRun = useCallback(
    async (runtimeEngine: RectificationRuntime, mode: RectificationMode): Promise<void> => {
      if (birth === null) return;

      const wireEvents = useLifeEventsStore
        .getState()
        .getEvents(profileId)
        .filter(isStructuredLifeEvent)
        .map((e): RectificationEventInput => ({ date: e.date, category: e.category! }));

      if (wireEvents.length < 1) return;

      const wireInput = buildWireInput(birth, wireEvents, mode);

      // Reset the cancelled flag at the start of every run (important for
      // remounted wizards and for the retry path after a previous cancellation).
      cancelledRef.current = false;
      await useRectificationStore.getState().run(runtimeEngine, wireInput);

      // If the component unmounted while the engine was running, the store was
      // already written (status: 'ready'/'error') — undo that write so the
      // persisted chart is never touched and the store is left clean.
      if (cancelledRef.current) {
        useRectificationStore.getState().reset();
      }
    },
    [birth, profileId],
  );

  const run = useCallback(
    async (mode: RectificationMode): Promise<void> => {
      if (engine === null) return; // guard: engine not ready
      lastModeRef.current = mode;
      await executeRun(engine, mode);
    },
    [engine, executeRun],
  );

  const reset = useCallback(() => {
    useRectificationStore.getState().reset();
  }, []);

  const retry = useCallback(async (): Promise<void> => {
    if (engineCtx === null || lastModeRef.current === null) return;
    let freshEngine: RectificationRuntime;
    try {
      // reboot() resets the provider state to { engine: null, error: null }
      // and runs a fresh bootstrap; resolves with the new ready engine.
      freshEngine = await engineCtx.reboot();
    } catch {
      // Reboot itself failed — stay in error state; the user can try again.
      return;
    }
    if (cancelledRef.current) return;
    await executeRun(freshEngine, lastModeRef.current);
  }, [engineCtx, executeRun]);

  return {
    state: { status, result, error: storeError },
    engineReady: engine !== null,
    hasEnoughEvents,
    run,
    reset,
    retry,
  };
}
