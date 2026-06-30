/**
 * "Reset chart / start fresh" — the surgical reset that returns a returning
 * visitor to a clean onboarding WITHOUT throwing away the things that make the
 * next start fast and personal.
 *
 * CLEARED (chart + everything derived from it):
 *  - the chart library + the `almamesh-chart` route-guard flag
 *  - profiles (and the mesh people they hold)
 *  - life events
 *  - chat history (threads + messages)
 *  - generated interpretations
 *  - in-memory mesh edges
 *
 * PRESERVED on purpose:
 *  - the OPFS engine bundle (~38 MB, cached for offline) — never touched, so the
 *    next chart computes immediately without a re-download
 *  - `almamesh-language` and `almamesh-llm-settings` (device preferences)
 *
 * This is deliberately NOT `resetAppData` (the nuclear "wedged client" hatch that
 * unregisters service workers + clears ALL caches/IndexedDB/OPFS). Start-fresh
 * keeps the engine and your preferences; it only forgets your chart and its data.
 *
 * After the clear, the route guard reads no chart flag and `RootRoute` falls back
 * to the Landing splash, so the caller should navigate to `/`.
 */

import {
  CHART_LIBRARY_FLAG_KEY,
  useChartLibraryStore,
  useChatStore,
  useInterpretationStore,
  useLifeEventsStore,
  useMeshStore,
  useProfilesStore,
} from '@almamesh/store';

/** The interpretation store's persist key (mirrors interpretation.ts PERSIST_NAME). */
const INTERPRETATIONS_KEY = 'almamesh-interpretations';

/**
 * Wipe the chart and everything derived from it, then resolve so the caller can
 * navigate to `/`. Persistence is rewritten/removed via each store's own clear
 * action plus `persist.clearStorage()`, so even a hard reload re-hydrates from
 * nothing. Preserves the OPFS engine bundle and the device-preference keys.
 */
export async function resetEverything(): Promise<void> {
  // 1) Wipe in-memory store state via each store's own clear action, so the
  //    running app reflects the empty state immediately.
  useChartLibraryStore.getState().clearAll();
  useProfilesStore.getState().clearAll();
  useLifeEventsStore.getState().clearAll();
  useChatStore.getState().clearAll();
  useInterpretationStore.getState().clearAll();
  useMeshStore.getState().reset();

  // 2) Remove the persisted blobs outright (don't rely on the async rewrite),
  //    so a subsequent hard reload re-hydrates from nothing. Best-effort: a
  //    blocked store must never strand the user mid-reset.
  try {
    await Promise.all([
      useChartLibraryStore.persist.clearStorage(),
      useProfilesStore.persist.clearStorage(),
      useLifeEventsStore.persist.clearStorage(),
      useChatStore.persist.clearStorage(),
      useInterpretationStore.persist.clearStorage(),
    ]);
  } catch {
    // Best-effort — in-memory state is already cleared and the flag is removed
    // below, which is what the synchronous route guard actually reads.
  }

  // 3) The synchronous localStorage keys read directly (the route-guard flag and
  //    the interpretations key) — remove them explicitly. PRESERVED on purpose:
  //    the OPFS engine bundle, `almamesh-language`, and `almamesh-llm-settings`.
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CHART_LIBRARY_FLAG_KEY);
    localStorage.removeItem(INTERPRETATIONS_KEY);
  }
}
