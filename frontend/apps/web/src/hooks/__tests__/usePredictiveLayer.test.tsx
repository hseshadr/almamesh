/**
 * usePredictiveLayer — the auto-mode contract.
 *
 * The Life Atlas makes the predictive synthesis FOUNDATIONAL: `auto: true`
 * fires the (idempotent) compute when the booted engine + a chart with birth
 * data are both present. To avoid STARVING the single serial Pyodide worker the
 * instant the dashboard mounts (which would queue interactive engine calls —
 * e.g. the rectification live-preview — behind the ~30s predictive job), the
 * kickoff is DEFERRED (idle/short-timeout) and CANCELLED on unmount. So:
 *   - it must NOT fire synchronously on mount (deferred),
 *   - it must fire once the deferred timer elapses while still mounted,
 *   - unmounting before the timer elapses must CANCEL the kickoff (freeing the
 *     engine for interactive work like the rectification preview),
 *   - it must NOT loop on an error (recovery stays a human decision),
 *   - it must recompute when the active profile changes under a ready store,
 *   - it must never double-fire.
 */

import type { ReactElement, ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useChartLibraryStore,
  usePredictiveStore,
  useProfilesStore,
  type EnsurePredictiveInput,
  type PredictiveRuntime,
  type StoredChart,
} from '@almamesh/store';

import { ChartEngineContext, type ChartEngineContextValue } from '../../providers/chartEngineContext';
import { usePredictiveLayer } from '../usePredictiveLayer';

function storedChart(chartId = 'chart-1', personName = 'Asha Rao'): StoredChart {
  return {
    chart_id: chartId,
    person_name: personName,
    is_primary: true,
    birth_data: {
      birth_datetime_utc: '1990-03-30T06:30:00Z',
      birth_datetime_local: '1990-03-30T12:00:00',
      birth_location_details: {
        city: 'Bengaluru',
        latitude: 12.97,
        longitude: 77.59,
        timezone: 'Asia/Kolkata',
      },
    },
  } as StoredChart;
}

/** A booted-engine context value; the engine object is never invoked here. */
function engineCtx(): ChartEngineContextValue {
  return {
    engine: {} as ChartEngineContextValue['engine'],
    stage: null,
    error: null,
    meta: null,
    reboot: () => Promise.reject(new Error('not used')),
    whenReady: () => Promise.reject(new Error('not used')),
    startBootstrap: () => {},
  };
}

function makeWrapper(ctx: ChartEngineContextValue | null) {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <ChartEngineContext.Provider value={ctx}>{children}</ChartEngineContext.Provider>;
  };
}

/** A spying ensurePredictive that marks the store ready for the input's key. */
function readyingEnsure() {
  return vi.fn((_runtime: PredictiveRuntime, input: EnsurePredictiveInput): Promise<void> => {
    usePredictiveStore.setState({ status: 'ready', profileKey: input.profileKey });
    return Promise.resolve();
  });
}

describe('usePredictiveLayer({ auto: true })', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useChartLibraryStore.setState({ charts: { 'chart-1': storedChart() }, hydrated: true });
    useProfilesStore.setState({ activeProfileId: 'chart-1' });
    usePredictiveStore.getState().reset();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does NOT fire synchronously on mount (the kickoff is deferred)', () => {
    const ensure = readyingEnsure();
    usePredictiveStore.setState({ ensurePredictive: ensure });

    renderHook(() => usePredictiveLayer({ auto: true }), { wrapper: makeWrapper(engineCtx()) });

    // Mounted but timers not yet advanced — the engine must be free.
    expect(ensure).not.toHaveBeenCalled();
  });

  it('fires compute exactly once after the deferred timer elapses while mounted', () => {
    const ensure = readyingEnsure();
    usePredictiveStore.setState({ ensurePredictive: ensure });

    const { rerender } = renderHook(() => usePredictiveLayer({ auto: true }), {
      wrapper: makeWrapper(engineCtx()),
    });

    act(() => {
      vi.runAllTimers();
    });
    rerender();
    act(() => {
      vi.runAllTimers();
    });

    expect(ensure).toHaveBeenCalledTimes(1);
    expect(usePredictiveStore.getState().status).toBe('ready');
  });

  it('CANCELS the deferred kickoff if unmounted before it elapses (frees the engine)', () => {
    const ensure = readyingEnsure();
    usePredictiveStore.setState({ ensurePredictive: ensure });

    const { unmount } = renderHook(() => usePredictiveLayer({ auto: true }), {
      wrapper: makeWrapper(engineCtx()),
    });

    // User navigates away before the deferred kickoff fires.
    unmount();
    act(() => {
      vi.runAllTimers();
    });

    expect(ensure).not.toHaveBeenCalled();
  });

  it('does not fire while the engine is still warming (no engine in context)', () => {
    const ensure = vi.fn((): Promise<void> => Promise.resolve());
    usePredictiveStore.setState({ ensurePredictive: ensure });

    renderHook(() => usePredictiveLayer({ auto: true }), { wrapper: makeWrapper(null) });
    act(() => {
      vi.runAllTimers();
    });

    expect(ensure).not.toHaveBeenCalled();
  });

  it('never auto-retries an error (status stays error, no further compute)', () => {
    const ensure = vi.fn((): Promise<void> => Promise.resolve());
    usePredictiveStore.setState({ status: 'error', error: 'boom', ensurePredictive: ensure });

    const { rerender } = renderHook(() => usePredictiveLayer({ auto: true }), {
      wrapper: makeWrapper(engineCtx()),
    });

    act(() => {
      vi.runAllTimers();
    });
    rerender();
    act(() => {
      vi.runAllTimers();
    });
    expect(ensure).not.toHaveBeenCalled();
    expect(usePredictiveStore.getState().status).toBe('error');
  });

  it('recomputes when the active profile switches under an already-ready store', () => {
    const ensure = readyingEnsure();
    // Already ready for chart-1.
    usePredictiveStore.setState({ status: 'ready', profileKey: 'chart-1', ensurePredictive: ensure });

    const { rerender } = renderHook(() => usePredictiveLayer({ auto: true }), {
      wrapper: makeWrapper(engineCtx()),
    });
    act(() => {
      vi.runAllTimers();
    });
    rerender();
    expect(ensure).not.toHaveBeenCalled(); // already current

    // Switch the active profile to a second chart.
    act(() => {
      useChartLibraryStore.setState({
        charts: { 'chart-2': storedChart('chart-2', 'Ben') },
        hydrated: true,
      });
      useProfilesStore.setState({ activeProfileId: 'chart-2' });
    });
    rerender();
    act(() => {
      vi.runAllTimers();
    });

    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure.mock.calls[0]?.[1].profileKey).toBe('chart-2');
  });

  it('does not double-fire when the deferred timer is rescheduled across re-renders', () => {
    const ensure = readyingEnsure();
    usePredictiveStore.setState({ ensurePredictive: ensure });

    const { rerender } = renderHook(() => usePredictiveLayer({ auto: true }), {
      wrapper: makeWrapper(engineCtx()),
    });

    // Several re-renders before the timer elapses must not stack kickoffs.
    rerender();
    rerender();
    act(() => {
      vi.runAllTimers();
    });
    rerender();
    act(() => {
      vi.runAllTimers();
    });

    expect(ensure).toHaveBeenCalledTimes(1);
  });
});
