/**
 * Owns the single in-browser AlmaMesh engine for the whole app.
 *
 * On mount it bootstraps one `AlmaMeshRuntime` (sync the signed bundle into
 * OPFS, boot Pyodide, expose a chart engine) and publishes `{ engine, stage,
 * error, meta }` through context. Bootstrap is idempotent; failures are surfaced
 * as `error` rather than crashing the app shell, so the rest of the UI still
 * renders while the engine warms up (or while a retry is offered).
 *
 * Bootstrap is RETRYABLE. The underlying `AlmaMeshRuntime.bootstrap()` already
 * nulls its cached promise on failure so it can re-run a fresh sync + boot; this
 * provider exposes that as:
 *   - `whenReady()` — await the CURRENT in-flight bootstrap (shared; no extra boot).
 *     Cures the "Connection Issue" warming race: a consumer awaits readiness
 *     instead of throwing when the user clicks Generate before boot completes.
 *   - `reboot()`    — reset state + run a FRESH bootstrap. Recovers a fail-closed
 *     boot (stale/inconsistent bundle chunk, signature/sha256 mismatch) in-app,
 *     with no manual reload.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlmaMeshRuntime } from '@almamesh/browser'
import type { BootStage, BundleMeta, ChartEngine, OnStage, RuntimeConfig } from '@almamesh/browser'
import { ChartEngineContext } from './chartEngineContext'
import { hasLocalChart } from '../lib/localChart'

// The context + hooks live in `./chartEngineContext` (type-only imports) so
// consumers never pull the runtime/sync graph; re-exported here so existing
// `import { useChartEngine } from './AlmaMeshRuntimeProvider'` sites keep working.
export {
  useChartEngine,
  useOptionalChartEngine,
  type ChartEngineContextValue,
} from './chartEngineContext'

// Canonical bundle layout emitted by the `almamesh-bundle` publisher. Order is
// install order: leaf wheels first, the almamesh wheel last.
const WHEEL_PATHS = [
  'wheels/jplephem-2.23-py3-none-any.whl',
  'wheels/sgp4-2.25-py3-none-any.whl',
  'wheels/skyfield-1.53-py3-none-any.whl',
  'wheels/almamesh-0.1.0-py3-none-any.whl',
] as const

const SKYFIELD_DATA_PATHS = [
  'skyfield-data/de421.bsp',
  'skyfield-data/finals2000A.all',
] as const

/** Build the RuntimeConfig from Vite env, with same-origin dev defaults. */
function readRuntimeConfig(): RuntimeConfig {
  return {
    bundleBaseUrl: import.meta.env.VITE_BUNDLE_BASE_URL ?? '/bundle',
    pubkeyUrl: new URL('public.key', document.baseURI).toString(),
    pyodideIndexUrl: '/pyodide/',
    wheelPaths: [...WHEEL_PATHS],
    skyfieldDataPaths: [...SKYFIELD_DATA_PATHS],
  }
}

/**
 * Drop the MUTABLE runtime caches that can fail-close a boot: the verify key
 * (`almamesh-pubkey`) and the update pointer (`almamesh-signals`). A stale key
 * here — e.g. a dev-signed key pinned by the old CacheFirst strategy — makes the
 * current prod-signed bundle fail ed25519 verification ("signature verification
 * failed"). Clearing it forces the next boot to re-fetch the CURRENT server key.
 * Immutable, content-addressed caches (pyodide/bundle chunks) are intentionally
 * left intact to avoid a needless ~38 MB re-download. Best-effort + guarded so
 * recovery never hard-fails (CacheStorage is absent in some test/SSR contexts).
 */
export async function clearStaleEngineCaches(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    await Promise.all(
      ['almamesh-pubkey', 'almamesh-signals'].map((name) => caches.delete(name)),
    )
  } catch {
    // ignore — recovery must never fail on cache cleanup
  }
}

// Observability/test hooks are installed only in dev, or in a build explicitly
// opted in via VITE_EXIT_GATE_HOOKS=1 (the P3 exit-gate verification build).
// They are NEVER present in a normal production build.
const EXIT_GATE_HOOKS =
  import.meta.env.DEV || import.meta.env.VITE_EXIT_GATE_HOOKS === '1'

/**
 * The minimal runtime surface the provider drives. `AlmaMeshRuntime` satisfies
 * it; tests inject a fake so the retry orchestration can be exercised without
 * Pyodide/OPFS Workers.
 */
export interface BootstrapRuntime {
  bootstrap(config: RuntimeConfig, onStage?: OnStage): Promise<ChartEngine>
}

interface ProviderProps {
  children: ReactNode
  /** Injectable for tests; defaults to a real `AlmaMeshRuntime`. */
  runtime?: BootstrapRuntime
}

export function AlmaMeshRuntimeProvider({ children, runtime }: ProviderProps) {
  // One runtime instance for the provider's lifetime. `AlmaMeshRuntime.bootstrap`
  // re-runs a fresh sync + boot after a failure, so we can reuse this instance
  // for reboot()s rather than building a new one each time.
  const runtimeRef = useRef<BootstrapRuntime | null>(runtime ?? null)
  if (runtimeRef.current === null) {
    runtimeRef.current = new AlmaMeshRuntime()
  }

  const [engine, setEngine] = useState<ChartEngine | null>(null)
  const [stage, setStage] = useState<BootStage | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [meta, setMeta] = useState<BundleMeta | null>(null)

  // The CURRENT in-flight (or last) bootstrap promise, shared by every awaiter
  // of whenReady(). A ref (not state) so stable callbacks always see the latest.
  const inFlightRef = useRef<Promise<ChartEngine> | null>(null)

  const onStage = useCallback<OnStage>((next) => {
    setStage(next)
    // Dev-only observability hook: expose the latest boot stage on window so a
    // Playwright harness can poll readiness without UI scraping.
    if (EXIT_GATE_HOOKS) {
      ;(window as unknown as { __ALMAMESH_STAGE__?: string }).__ALMAMESH_STAGE__ = next.kind
    }
  }, [])

  // Run (or re-run) the bootstrap, wiring engine/meta/error and sharing the
  // promise via the ref. Returns the promise so callers can await readiness.
  const runBootstrap = useCallback((): Promise<ChartEngine> => {
    const runtimeInstance = runtimeRef.current
    if (runtimeInstance === null) {
      return Promise.reject(new Error('AlmaMesh runtime unavailable'))
    }
    const promise = runtimeInstance
      .bootstrap(readRuntimeConfig(), onStage)
      .then((ready) => {
        setEngine(ready)
        setMeta(ready.meta())
        setError(null)
        // Dev-only test hook: drive the booted engine directly, bypassing the
        // geocode-dependent onboarding UI. Returns the raw SiderealChart.
        if (EXIT_GATE_HOOKS) {
          ;(
            window as unknown as {
              __almameshGenerate?: (birth: unknown) => Promise<unknown>
            }
          ).__almameshGenerate = (birth) =>
            ready.generateChart(birth as Parameters<typeof ready.generateChart>[0])
        }
        return ready
      })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        if (EXIT_GATE_HOOKS) {
          ;(window as unknown as { __ALMAMESH_ERROR__?: string }).__ALMAMESH_ERROR__ = e.message
        }
        throw e
      })
    inFlightRef.current = promise
    return promise
  }, [onStage])

  // Idempotently kick off the bootstrap AT MOST ONCE. Guarded by a ref so the
  // landing CTA's prewarm-on-intent (pointerenter/focus/click, which can all
  // fire) and the engine-route entry effect can all call it freely without
  // launching a second bundle sync. The rejection is swallowed here for the same
  // reason as the mount boot: it is published via `error` and recovered through
  // whenReady()/reboot(); an unhandled rejection would noise the console.
  const startedRef = useRef(false)
  const startBootstrap = useCallback((): void => {
    if (startedRef.current) {
      return
    }
    startedRef.current = true
    runBootstrap().catch(() => {})
  }, [runBootstrap])

  // Await the current in-flight bootstrap; if none is tracked yet, start one.
  const whenReady = useCallback((): Promise<ChartEngine> => {
    return inFlightRef.current ?? runBootstrap()
  }, [runBootstrap])

  // Reset to a clean pre-boot state and run a FRESH bootstrap.
  const reboot = useCallback((): Promise<ChartEngine> => {
    // A reboot is an explicit boot — keep the idempotency guard coherent so a
    // later prewarm-on-intent doesn't fire a redundant second sync.
    startedRef.current = true
    setEngine(null)
    setError(null)
    setStage(null)
    // Drop the stale verify key / update pointer first: a CacheFirst-pinned dev
    // key is the classic cause of a fail-closed "signature verification failed",
    // and a plain reboot would just re-read the same stale key. Best-effort.
    return clearStaleEngineCaches().then(() => runBootstrap())
  }, [runBootstrap])

  // Initial mount bootstrap — auto-run once, EXCEPT on the marketing landing
  // route. A fresh visitor sitting on `/` (no saved chart) only reads the pitch;
  // they must NOT pay the ~38 MB engine download. Every other case (direct
  // /onboarding, /dashboard, a returning visitor with a chart redirected to
  // /dashboard, etc.) boots on mount exactly as before. The provider sits ABOVE
  // the router (see main.tsx), so we read the initial path from window.location.
  // Intent on the landing CTA (and entry to engine routes) calls startBootstrap.
  useEffect(() => {
    const initialPath = window.location.pathname
    const isFreshLanding = initialPath === '/' && !hasLocalChart()
    if (isFreshLanding) {
      return
    }
    startBootstrap()
    // startBootstrap is stable (deps: runBootstrap → onStage, all stable) — run
    // once on mount; the path/chart decision is intentionally a mount-time read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo(
    () => ({ engine, stage, error, meta, reboot, whenReady, startBootstrap }),
    [engine, stage, error, meta, reboot, whenReady, startBootstrap],
  )

  return <ChartEngineContext.Provider value={value}>{children}</ChartEngineContext.Provider>
}
