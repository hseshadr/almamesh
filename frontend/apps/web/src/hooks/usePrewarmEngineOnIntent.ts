import { useMemo } from 'react'
import { useChartEngine } from '../providers/chartEngineContext'

/**
 * Handlers that prewarm the in-browser engine the moment a visitor shows intent.
 *
 * The marketing landing page does NOT auto-boot the ~38 MB engine (see
 * `AlmaMeshRuntimeProvider` — it gates the mount auto-boot off the landing
 * route). To keep the actual "Generate my chart" click from feeling like a cold
 * wait, spread these onto the CTA (a `<Link>`/`<button>`):
 *
 * ```tsx
 * <Link to="/onboarding" {...usePrewarmEngineOnIntent()}>Generate my chart</Link>
 * ```
 *
 * Each handler calls the context's idempotent `startBootstrap()`, so the boot
 * begins on the FIRST sign of intent (hover, keyboard focus, or click) and any
 * later intent is a no-op — the bundle sync is launched at most once.
 */
export interface PrewarmEngineHandlers {
  /** Bind to `onPointerEnter` — warm on hover (the earliest, cheapest signal). */
  readonly onPointerEnter: () => void
  /** Bind to `onFocus` — warm on keyboard focus (a11y-equivalent of hover). */
  readonly onFocus: () => void
  /** Bind to `onClick` — warm on the committing click (covers no-hover devices). */
  readonly onClick: () => void
}

export function usePrewarmEngineOnIntent(): PrewarmEngineHandlers {
  const { startBootstrap } = useChartEngine()
  return useMemo(
    () => ({
      onPointerEnter: () => startBootstrap(),
      onFocus: () => startBootstrap(),
      onClick: () => startBootstrap(),
    }),
    [startBootstrap],
  )
}
