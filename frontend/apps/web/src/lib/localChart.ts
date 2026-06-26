/**
 * Local chart persistence helpers.
 *
 * The chart itself lives in the IndexedDB-backed chart-library store
 * (`@almamesh/store` chartLibrary). IndexedDB is async, but route guards need a
 * synchronous "does a chart exist?" answer, so the library store mirrors that
 * fact into a single localStorage flag. This module reads that flag.
 */

import { CHART_LIBRARY_FLAG_KEY } from '@almamesh/store'

/** localStorage flag the chart-library store keeps in sync with IndexedDB. */
export const LOCAL_CHART_KEY = CHART_LIBRARY_FLAG_KEY

/** True when at least one chart has been persisted locally on this device. */
export function hasLocalChart(): boolean {
  return localStorage.getItem(LOCAL_CHART_KEY) !== null
}
