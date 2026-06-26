import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { ChartEngine } from '@almamesh/browser';

/** Wrap the hook with a QueryClientProvider (the hook calls useQueryClient). */
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// --- mocks (declared before importing the hook) ---
const regenerateSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('@almamesh/store', async (orig) => {
  const actual = await orig<typeof import('@almamesh/store')>();
  return { ...actual, regenerateOnBirthChange: (...args: unknown[]) => regenerateSpy(...args) };
});

let engineValue: { engine: ChartEngine | null };
vi.mock('../../providers/AlmaMeshRuntimeProvider', () => ({
  useChartEngine: () => engineValue,
}));

import { appEvents, type BirthInfoChanged } from '@almamesh/store';
import { useRegenerationSubscription } from '../useRegenerationSubscription';

const fakeEngine = { generateChart: vi.fn() } as unknown as ChartEngine;

const event: BirthInfoChanged = {
  birth: {
    name: 'Asha',
    date: '1990-01-15',
    time: '12:00',
    latitude: 18.52,
    longitude: 73.85,
    timezone: 'Asia/Kolkata',
    location_name: 'Pune, India',
  },
  profileId: 'p1',
};

describe('useRegenerationSubscription — emit-before-subscribe race', () => {
  beforeEach(() => {
    regenerateSpy.mockClear();
    appEvents.all.clear();
  });

  afterEach(() => {
    appEvents.all.clear();
  });

  it('handles a live event when the engine is already ready', () => {
    engineValue = { engine: fakeEngine };
    renderHook(() => useRegenerationSubscription(), { wrapper });

    act(() => {
      appEvents.emit('birth-info-changed', event);
    });

    expect(regenerateSpy).toHaveBeenCalledTimes(1);
    expect(regenerateSpy.mock.calls[0][0]).toBe(event);
  });

  it('REPLAYS an event emitted BEFORE the engine was ready, once it becomes ready', () => {
    // Engine not ready yet (the warming race / post-reboot moment).
    engineValue = { engine: null };
    const { rerender } = renderHook(() => useRegenerationSubscription(), { wrapper });

    // Onboarding emits the moment resolveReadyEngine resolves — but the
    // subscriber's effect has not re-attached with a ready engine yet.
    act(() => {
      appEvents.emit('birth-info-changed', event);
    });
    expect(regenerateSpy).not.toHaveBeenCalled();

    // The engine becomes ready -> the effect re-runs and must DRAIN the pending
    // event so the chart is actually computed (no dropped compute on dashboard).
    engineValue = { engine: fakeEngine };
    act(() => {
      rerender();
    });

    expect(regenerateSpy).toHaveBeenCalledTimes(1);
    expect(regenerateSpy.mock.calls[0][0]).toBe(event);
  });

  it('does not double-handle: a replayed event is consumed exactly once', () => {
    engineValue = { engine: null };
    const { rerender } = renderHook(() => useRegenerationSubscription(), { wrapper });

    act(() => {
      appEvents.emit('birth-info-changed', event);
    });

    engineValue = { engine: fakeEngine };
    act(() => {
      rerender();
    });
    // A further unrelated rerender must NOT replay the same pending event again.
    act(() => {
      rerender();
    });

    expect(regenerateSpy).toHaveBeenCalledTimes(1);
  });
});
