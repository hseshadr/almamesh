import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useEffect, useState } from 'react';

import type { BootStage, ChartEngine, OnStage, RuntimeConfig } from '@almamesh/browser';
import { AlmaMeshRuntimeProvider } from '../AlmaMeshRuntimeProvider';
import { useChartEngine } from '../chartEngineContext';

// The provider gates its mount auto-boot off the marketing landing route
// (path "/" with no saved chart). These tests assert the auto-boot / recovery
// contract, so they must render on a NON-landing route — otherwise the gate
// (correctly) skips the mount boot. Pin a non-landing path for every test here.
beforeEach(() => {
  window.history.pushState({}, '', '/onboarding');
});
afterEach(() => {
  window.history.pushState({}, '', '/');
});

/**
 * A minimal stand-in for `AlmaMeshRuntime` that lets a test drive bootstrap
 * outcomes deterministically: each `bootstrap()` call invokes the next queued
 * behavior. This is the same injection seam the real runtime exposes for its own
 * Workers — here we inject the whole runtime so the provider's retry orchestration
 * can be tested without Pyodide/OPFS.
 */
type Behavior = (onStage: OnStage) => Promise<ChartEngine>;

function makeFakeEngine(tag: string): ChartEngine {
  return {
    generateChart: vi.fn(),
    computePredictive: vi.fn(),
    computeMeshEdge: vi.fn(),
    meta: () => ({
      bundle_id: tag,
      version: '0',
      engine_version: '0',
      ephemeris_file: 'de421.bsp',
      ayanamsa: 'lahiri',
      constructs: [],
    }),
  } as unknown as ChartEngine;
}

interface FakeRuntime {
  bootstrap(config: RuntimeConfig, onStage?: OnStage): Promise<ChartEngine>;
  bootstrapCalls: number;
}

function makeFakeRuntime(behaviors: Behavior[]): FakeRuntime {
  let i = 0;
  return {
    bootstrapCalls: 0,
    bootstrap(_config: RuntimeConfig, onStage: OnStage = () => {}) {
      this.bootstrapCalls += 1;
      const behavior = behaviors[Math.min(i, behaviors.length - 1)];
      i += 1;
      return behavior(onStage);
    },
  };
}

/** Surfaces the context value onto the DOM + a captured ref for assertions. */
function Probe({ capture }: { capture: (v: ReturnType<typeof useChartEngine>) => void }) {
  const value = useChartEngine();
  useEffect(() => {
    capture(value);
  });
  return (
    <div>
      <span data-testid="engine">{value.engine ? 'engine-ready' : 'no-engine'}</span>
      <span data-testid="error">{value.error ? value.error.message : 'no-error'}</span>
      <span data-testid="reboot">{typeof value.reboot === 'function' ? 'has-reboot' : 'no-reboot'}</span>
      <span data-testid="whenReady">
        {typeof value.whenReady === 'function' ? 'has-whenReady' : 'no-whenReady'}
      </span>
    </div>
  );
}

describe('AlmaMeshRuntimeProvider — retryable bootstrap', () => {
  it('exposes reboot() and whenReady() on the context value', async () => {
    const runtime = makeFakeRuntime([(onStage) => {
      onStage({ kind: 'ready' } as BootStage);
      return Promise.resolve(makeFakeEngine('a'));
    }]);

    render(
      <AlmaMeshRuntimeProvider runtime={runtime}>
        <Probe capture={() => {}} />
      </AlmaMeshRuntimeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('engine').textContent).toBe('engine-ready'));
    expect(screen.getByTestId('reboot').textContent).toBe('has-reboot');
    expect(screen.getByTestId('whenReady').textContent).toBe('has-whenReady');
  });

  it('auto-bootstraps exactly once on mount and publishes the ready engine', async () => {
    const runtime = makeFakeRuntime([(onStage) => {
      onStage({ kind: 'ready' } as BootStage);
      return Promise.resolve(makeFakeEngine('once'));
    }]);

    render(
      <AlmaMeshRuntimeProvider runtime={runtime}>
        <Probe capture={() => {}} />
      </AlmaMeshRuntimeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('engine').textContent).toBe('engine-ready'));
    expect(runtime.bootstrapCalls).toBe(1);
  });

  it('whenReady() resolves with the in-flight bootstrap result (shared, no extra bootstrap)', async () => {
    let resolveBoot!: (e: ChartEngine) => void;
    const ready = makeFakeEngine('shared');
    const runtime = makeFakeRuntime([
      () => new Promise<ChartEngine>((res) => {
        resolveBoot = res;
      }),
    ]);

    let captured: ReturnType<typeof useChartEngine> | null = null;
    render(
      <AlmaMeshRuntimeProvider runtime={runtime}>
        <Probe capture={(v) => {
          captured = v;
        }} />
      </AlmaMeshRuntimeProvider>,
    );

    await waitFor(() => expect(captured).not.toBeNull());
    // Engine not ready yet (still warming).
    expect(screen.getByTestId('engine').textContent).toBe('no-engine');

    const whenReadyPromise = captured!.whenReady();
    // Let the in-flight bootstrap complete.
    await act(async () => {
      resolveBoot(ready);
      await whenReadyPromise;
    });

    await expect(whenReadyPromise).resolves.toBe(ready);
    // whenReady must NOT trigger a second bootstrap — it shares the in-flight one.
    expect(runtime.bootstrapCalls).toBe(1);
  });

  it('reboot() resets error to null, re-bootstraps fresh, and publishes the new engine', async () => {
    const recovered = makeFakeEngine('recovered');
    const runtime = makeFakeRuntime([
      // First mount bootstrap fails (stale/inconsistent bundle).
      () => Promise.reject(new Error('bundle chunk 404')),
      // reboot() re-runs a fresh bootstrap that succeeds.
      (onStage) => {
        onStage({ kind: 'ready' } as BootStage);
        return Promise.resolve(recovered);
      },
    ]);

    let captured: ReturnType<typeof useChartEngine> | null = null;
    render(
      <AlmaMeshRuntimeProvider runtime={runtime}>
        <Probe capture={(v) => {
          captured = v;
        }} />
      </AlmaMeshRuntimeProvider>,
    );

    // The first bootstrap fails -> error surfaced, no engine.
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('bundle chunk 404'));
    expect(screen.getByTestId('engine').textContent).toBe('no-engine');

    // Reboot -> fresh bootstrap -> recovery.
    let result: ChartEngine | undefined;
    await act(async () => {
      result = await captured!.reboot();
    });

    expect(result).toBe(recovered);
    expect(runtime.bootstrapCalls).toBe(2);
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('no-error'));
    await waitFor(() => expect(screen.getByTestId('engine').textContent).toBe('engine-ready'));
  });

  it('reboot() rejects (and re-surfaces the error) when the fresh bootstrap also fails', async () => {
    const runtime = makeFakeRuntime([
      () => Promise.reject(new Error('first fail')),
      () => Promise.reject(new Error('second fail')),
    ]);

    let captured: ReturnType<typeof useChartEngine> | null = null;
    render(
      <AlmaMeshRuntimeProvider runtime={runtime}>
        <Probe capture={(v) => {
          captured = v;
        }} />
      </AlmaMeshRuntimeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('first fail'));

    await act(async () => {
      await expect(captured!.reboot()).rejects.toThrow('second fail');
    });

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('second fail'));
  });
});

/** A tiny harness component proving the warming-race fix can drive readiness. */
function ConsumerThatWaits({ onResult }: { onResult: (s: string) => void }) {
  const { engine, error, whenReady, reboot } = useChartEngine();
  const [status, setStatus] = useState('idle');
  return (
    <button
      type="button"
      data-testid="go"
      onClick={async () => {
        try {
          const e = engine ?? (error ? await reboot() : await whenReady());
          onResult(e ? 'got-engine' : 'no-engine');
          setStatus('done');
        } catch {
          onResult('threw');
          setStatus('error');
        }
      }}
    >
      {status}
    </button>
  );
}

describe('AlmaMeshRuntimeProvider — consumer readiness contract', () => {
  it('a consumer can await whenReady() during the warming race and get the engine', async () => {
    let resolveBoot!: (e: ChartEngine) => void;
    const ready = makeFakeEngine('race');
    const runtime = makeFakeRuntime([
      () => new Promise<ChartEngine>((res) => {
        resolveBoot = res;
      }),
    ]);
    const results: string[] = [];

    render(
      <AlmaMeshRuntimeProvider runtime={runtime}>
        <ConsumerThatWaits onResult={(s) => results.push(s)} />
      </AlmaMeshRuntimeProvider>,
    );

    // Click Generate WHILE bootstrap is still in flight (the race).
    await act(async () => {
      screen.getByTestId('go').click();
      // Now let bootstrap finish.
      resolveBoot(ready);
    });

    await waitFor(() => expect(results).toContain('got-engine'));
  });
});
