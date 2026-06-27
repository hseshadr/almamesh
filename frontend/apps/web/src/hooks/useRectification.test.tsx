/**
 * useRectification — orchestration hook tests.
 *
 * Covers:
 *  - happy path: run() transitions store idle -> loading -> ready
 *  - engine throw: error state; retry() calls reboot() then re-runs -> ready
 *  - cancel-on-unmount: unmount mid-run does NOT leave result in the store
 *  - predictive gate: active on mount, cleared on unmount
 *  - event guard: hasEnoughEvents false with no structured events
 *  - engine guard: engineReady false when context has no engine
 */

import type { ReactElement, ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useChartLibraryStore,
  useLifeEventsStore,
  useRectificationStore,
  type StoredChart,
} from '@almamesh/store';
import type { ChartEngine } from '@almamesh/browser';
import type { RectificationResultRaw } from '@almamesh/browser/types';
import {
  ChartEngineContext,
  type ChartEngineContextValue,
} from '../providers/chartEngineContext';
import { useRectificationGate } from '../lib/rectificationGate';
import { useRectification } from './useRectification';

// ---------------------------------------------------------------------------
// Synthetic fixtures (no real PII — generic birth data)
// ---------------------------------------------------------------------------

const PROFILE_ID = 'profile-test-rect-1';
const CHART_ID = 'chart-test-rect-1';

function syntheticChart(): StoredChart {
  return {
    chart_id: CHART_ID,
    person_name: 'Asha Rao',
    is_primary: true,
    profile_id: PROFILE_ID,
    birth_data: {
      birth_datetime_utc: '1990-06-15T01:30:00Z',
      birth_datetime_local: '1990-06-15T07:00:00',
      birth_location_details: {
        city: 'Bengaluru',
        latitude: 12.97,
        longitude: 77.59,
        timezone: 'Asia/Kolkata',
      },
    },
  } as StoredChart;
}

const SYNTHETIC_RAW: RectificationResultRaw = {
  mode: 'cusp',
  candidates: [
    {
      ascendant_sign: 'Cancer',
      representative_time_local: '07:05',
      lagna_longitude_deg: 95.2,
      lagna_cusp_distance_deg: 5.2,
      is_near_cusp: false,
      fit_score: 0.75,
      supporting_events: [],
    },
  ],
  margin: 0.28,
  band: 'leans',
  discriminating_event_count: 1,
  recorded_time_sign: 'Cancer',
  honesty_note_key: 'rectify.honesty.leans',
};

// ---------------------------------------------------------------------------
// Engine context helpers
// ---------------------------------------------------------------------------

function makeEngineCtx(
  computeImpl?: () => Promise<RectificationResultRaw>,
  rebootImpl?: () => Promise<ChartEngine>,
): ChartEngineContextValue {
  const computeRectification = vi.fn(computeImpl ?? (() => Promise.resolve(SYNTHETIC_RAW)));
  const engine = { computeRectification } as unknown as ChartEngine;
  return {
    engine,
    stage: null,
    error: null,
    meta: null,
    reboot: vi.fn(rebootImpl ?? (() => Promise.resolve(engine))),
    whenReady: vi.fn(() => Promise.resolve(engine)),
    startBootstrap: vi.fn(),
  };
}

function makeWrapper(ctx: ChartEngineContextValue | null) {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <ChartEngineContext.Provider value={ctx}>{children}</ChartEngineContext.Provider>;
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  useChartLibraryStore.setState({
    charts: { [CHART_ID]: syntheticChart() },
    hydrated: true,
  });
  useLifeEventsStore.setState({
    eventsByProfile: {
      [PROFILE_ID]: [
        {
          id: 'evt-s1',
          date: '2015-09-20',
          category: 'career_change',
          createdAt: '2015-09-20T00:00:00Z',
        },
      ],
    },
    hydrated: true,
  });
  useRectificationStore.getState().reset();
  useRectificationGate.setState({ active: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRectification', () => {
  it('run() transitions store idle -> loading -> ready with the adapted result', async () => {
    const ctx = makeEngineCtx();
    const { result } = renderHook(() => useRectification(PROFILE_ID), {
      wrapper: makeWrapper(ctx),
    });

    await act(async () => {
      await result.current.run('cusp');
    });

    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.result).not.toBeNull();
    expect(result.current.state.result?.mode).toBe('cusp');
    expect(result.current.state.result?.band).toBe('leans');
    expect(result.current.state.result?.discriminatingEventCount).toBe(1);
    expect(result.current.state.error).toBeNull();
  });

  it('engine throw produces error state; retry() calls reboot() then re-runs -> ready', async () => {
    let callCount = 0;
    const computeImpl = (): Promise<RectificationResultRaw> => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('Engine exploded'));
      return Promise.resolve(SYNTHETIC_RAW);
    };
    // reboot resolves with the same engine (which now succeeds on second compute call)
    const ctx = makeEngineCtx(computeImpl);

    const { result } = renderHook(() => useRectification(PROFILE_ID), {
      wrapper: makeWrapper(ctx),
    });

    // First run -> error
    await act(async () => {
      await result.current.run('cusp');
    });
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toBe('Engine exploded');

    // retry() -> calls reboot(), then re-runs -> ready
    await act(async () => {
      await result.current.retry();
    });
    expect(ctx.reboot).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.result?.mode).toBe('cusp');
  });

  it('unmount mid-run does NOT leave result in the store (calls reset after resolve)', async () => {
    let resolveEngine!: (v: RectificationResultRaw) => void;
    const enginePromise = new Promise<RectificationResultRaw>((res) => {
      resolveEngine = res;
    });
    const ctx = makeEngineCtx(() => enginePromise);

    const { result, unmount } = renderHook(() => useRectification(PROFILE_ID), {
      wrapper: makeWrapper(ctx),
    });

    // Fire run without awaiting so we can intercept mid-flight
    const runPromise = result.current.run('cusp');

    // The store's run() sets 'loading' synchronously before the await
    expect(useRectificationStore.getState().status).toBe('loading');

    // Unmount the hook (sets cancelledRef.current = true via useEffect cleanup)
    unmount();

    // Now resolve the engine; the store will write 'ready', then the hook
    // checks cancelledRef.current (true) and immediately calls reset() -> 'idle'
    await act(async () => {
      resolveEngine(SYNTHETIC_RAW);
      await runPromise;
    });

    expect(useRectificationStore.getState().status).toBe('idle');
    expect(useRectificationStore.getState().result).toBeNull();
  });

  it('predictive gate is active while mounted and cleared on unmount', () => {
    const ctx = makeEngineCtx();
    const { unmount } = renderHook(() => useRectification(PROFILE_ID), {
      wrapper: makeWrapper(ctx),
    });

    expect(useRectificationGate.getState().active).toBe(true);

    unmount();

    expect(useRectificationGate.getState().active).toBe(false);
  });

  it('hasEnoughEvents is false when the profile has no structured life events', () => {
    useLifeEventsStore.setState({ eventsByProfile: { [PROFILE_ID]: [] } });

    const ctx = makeEngineCtx();
    const { result } = renderHook(() => useRectification(PROFILE_ID), {
      wrapper: makeWrapper(ctx),
    });

    expect(result.current.hasEnoughEvents).toBe(false);
  });

  it('hasEnoughEvents is false when all events are unstructured (missing date or category)', () => {
    useLifeEventsStore.setState({
      eventsByProfile: {
        [PROFILE_ID]: [
          // Missing category -> not structured
          { id: 'e1', date: '2015-01-01', createdAt: '2015-01-01T00:00:00Z' },
          // Missing date -> not structured
          { id: 'e2', date: '', category: 'marriage', createdAt: '2015-01-02T00:00:00Z' },
        ],
      },
    });

    const ctx = makeEngineCtx();
    const { result } = renderHook(() => useRectification(PROFILE_ID), {
      wrapper: makeWrapper(ctx),
    });

    expect(result.current.hasEnoughEvents).toBe(false);
  });

  it('engineReady is false when the context provides no engine', () => {
    const { result } = renderHook(() => useRectification(PROFILE_ID), {
      wrapper: makeWrapper(null),
    });

    expect(result.current.engineReady).toBe(false);
  });

  it('run() is a no-op when the engine is not ready (no store mutation)', async () => {
    const { result } = renderHook(() => useRectification(PROFILE_ID), {
      wrapper: makeWrapper(null),
    });

    await act(async () => {
      await result.current.run('cusp');
    });

    expect(useRectificationStore.getState().status).toBe('idle');
  });

  it('reset() returns the store to idle', async () => {
    const ctx = makeEngineCtx();
    const { result } = renderHook(() => useRectification(PROFILE_ID), {
      wrapper: makeWrapper(ctx),
    });

    await act(async () => {
      await result.current.run('cusp');
    });
    expect(result.current.state.status).toBe('ready');

    act(() => {
      result.current.reset();
    });
    expect(result.current.state.status).toBe('idle');
  });
});
