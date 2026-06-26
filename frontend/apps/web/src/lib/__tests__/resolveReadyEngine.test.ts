import { describe, it, expect, vi } from 'vitest';

import type { ChartEngine } from '@almamesh/browser';
import { resolveReadyEngine, type EngineReadiness } from '../resolveReadyEngine';

const engineA = { tag: 'A' } as unknown as ChartEngine;
const engineB = { tag: 'B' } as unknown as ChartEngine;

function makeReadiness(over: Partial<EngineReadiness>): EngineReadiness {
  return {
    engine: null,
    error: null,
    reboot: vi.fn().mockResolvedValue(engineB),
    whenReady: vi.fn().mockResolvedValue(engineA),
    ...over,
  };
}

describe('resolveReadyEngine', () => {
  it('returns the already-ready engine immediately without rebooting or waiting', async () => {
    const reboot = vi.fn();
    const whenReady = vi.fn();
    const r = makeReadiness({ engine: engineA, reboot, whenReady });

    await expect(resolveReadyEngine(r)).resolves.toBe(engineA);
    expect(reboot).not.toHaveBeenCalled();
    expect(whenReady).not.toHaveBeenCalled();
  });

  it('reboots (re-syncs) when bootstrap previously failed, and returns the recovered engine', async () => {
    const reboot = vi.fn().mockResolvedValue(engineB);
    const whenReady = vi.fn();
    const r = makeReadiness({ engine: null, error: new Error('bundle 404'), reboot, whenReady });

    await expect(resolveReadyEngine(r)).resolves.toBe(engineB);
    expect(reboot).toHaveBeenCalledTimes(1);
    expect(whenReady).not.toHaveBeenCalled();
  });

  it('awaits the in-flight bootstrap (whenReady) during the warming race — no reboot', async () => {
    const reboot = vi.fn();
    const whenReady = vi.fn().mockResolvedValue(engineA);
    const r = makeReadiness({ engine: null, error: null, reboot, whenReady });

    await expect(resolveReadyEngine(r)).resolves.toBe(engineA);
    expect(whenReady).toHaveBeenCalledTimes(1);
    expect(reboot).not.toHaveBeenCalled();
  });

  it('rejects with a timeout if the engine never becomes ready within the budget', async () => {
    vi.useFakeTimers();
    try {
      const whenReady = vi.fn().mockReturnValue(new Promise<ChartEngine>(() => {}));
      const r = makeReadiness({ engine: null, error: null, whenReady });

      const promise = resolveReadyEngine(r, 5_000);
      const assertion = expect(promise).rejects.toThrow(/engine|warm|tim/i);
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
