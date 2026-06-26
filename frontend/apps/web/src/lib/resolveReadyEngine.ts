/**
 * Resolve a READY in-browser chart engine before computing a chart — the single
 * decision that kills the onboarding "Connection Issue" race and recovers a
 * fail-closed bootstrap, instead of throwing the moment the user clicks Generate
 * faster than the 38 MB Pyodide + signed-bundle boot finishes.
 *
 * Three states map to three actions:
 *   - `engine` already ready          -> use it immediately.
 *   - `error` (bootstrap failed)      -> `reboot()` (a FRESH sync + boot) and use the result.
 *   - neither (still warming, in race)-> `whenReady()` (await the in-flight boot) and use it.
 *
 * A generous timeout bounds the wait so a wedged boot still surfaces a clear,
 * retryable failure rather than hanging the Generate button forever.
 */

import type { ChartEngine } from '@almamesh/browser';

/** The slice of the chart-engine context this decision needs. */
export interface EngineReadiness {
  readonly engine: ChartEngine | null;
  readonly error: Error | null;
  /** Reset + run a FRESH bootstrap (new sync + boot); resolves with the ready engine. */
  reboot: () => Promise<ChartEngine>;
  /** Resolve when the CURRENT in-flight bootstrap finishes (shared, no extra boot). */
  whenReady: () => Promise<ChartEngine>;
}

/** Default readiness budget: a cold 38 MB bundle sync + Pyodide boot can be slow. */
export const DEFAULT_READY_TIMEOUT_MS = 90_000;

class EngineNotReadyError extends Error {
  constructor() {
    super('The on-device engine did not become ready in time.');
    this.name = 'EngineNotReadyError';
  }
}

function withTimeout(work: Promise<ChartEngine>, ms: number): Promise<ChartEngine> {
  return new Promise<ChartEngine>((resolve, reject) => {
    const timer = setTimeout(() => reject(new EngineNotReadyError()), ms);
    work.then(
      (engine) => {
        clearTimeout(timer);
        resolve(engine);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export async function resolveReadyEngine(
  readiness: EngineReadiness,
  timeoutMs: number = DEFAULT_READY_TIMEOUT_MS,
): Promise<ChartEngine> {
  if (readiness.engine) {
    return readiness.engine;
  }
  const work = readiness.error ? readiness.reboot() : readiness.whenReady();
  return withTimeout(work, timeoutMs);
}
