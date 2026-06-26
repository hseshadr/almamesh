import { hasLocalChart } from '../lib/localChart'

/**
 * Determines routing based on whether a chart exists locally.
 *
 * Single local user, no auth: resolves synchronously from local storage.
 * `isLoading` is retained in the contract so callers can keep their
 * loading-fallback branch; it is always `false` today.
 */
export function useOnboardingStatus(): { hasChart: boolean; isLoading: boolean } {
  return { hasChart: hasLocalChart(), isLoading: false }
}
