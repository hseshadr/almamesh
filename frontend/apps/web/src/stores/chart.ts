/**
 * Web chart UI store (in-memory only, no persistence)
 *
 * Spec 036 (Cache Consolidation): Removed localStorage persistence.
 * UI selections don't need to survive page refresh.
 */

import { useChartStore as baseChartStore } from '@almamesh/store';

export const useChartStore = baseChartStore;

/**
 * Helper to clear all chart-related UI state
 * Used when regenerating chart after birth details update
 *
 * Note: This only clears Zustand UI state (conversation history, selected person, etc.)
 * React Query cache is the single source of truth for server data and should be
 * cleared separately via queryClient.clear() or queryClient.invalidateQueries()
 */
export function clearAllChartData() {
  // Reset the store state (no localStorage to clear after Spec 036)
  useChartStore.getState().reset();
}
