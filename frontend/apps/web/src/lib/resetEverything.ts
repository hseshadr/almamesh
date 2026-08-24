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
 *  - confirmed rectification records
 *  - persisted predictive contexts
 *  - semantic chat-memory vectors
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
  abortBackupRestore,
  bumpRestoreEpoch,
  commitDatasetGeneration,
  whenChartLibraryHydrated,
  whenChatHydrated,
  whenLifeEventsHydrated,
  whenPredictiveHydrated,
  whenProfilesHydrated,
  whenRectificationRecordsHydrated,
  useChartLibraryStore,
  useChatStore,
  useInterpretationStore,
  useLifeEventsStore,
  useMeshStore,
  usePredictiveStore,
  useProfilesStore,
  useRectificationRecordsStore,
} from '@almamesh/store';
import { clearMemory } from './chatMemory';
import { publishDeletionNotice } from './deletionPropagation';

/** The interpretation store's persist key (mirrors interpretation.ts PERSIST_NAME). */
const INTERPRETATIONS_KEY = 'almamesh-interpretations';
const RESET_IDB_KEYS = [
  'almamesh-chart-library',
  'almamesh-profiles',
  'almamesh-life-events',
  'almamesh-chat-history',
  'almamesh-rectification-records',
  'almamesh-predictive',
  'almamesh-interpretations',
] as const;

function getUsableLocalStorage(): Pick<Storage, 'removeItem'> | null {
  try {
    const storage = (globalThis as { localStorage?: Partial<Storage> }).localStorage;
    if (typeof storage?.removeItem !== 'function') {
      return null;
    }
    return { removeItem: storage.removeItem.bind(storage) };
  } catch {
    return null;
  }
}

export interface ResetEverythingDeps {
  waitForHydration: () => Promise<void>;
  clearPersisted: (epoch?: number) => Promise<void>;
  beginDatasetReset?: () => Promise<number>;
  /** Optional only for injected non-atomic persistence; the browser commit finalizes itself. */
  finalizeDatasetReset?: (epoch: number) => Promise<void>;
  abortDatasetReset?: (epoch: number) => Promise<void>;
  publishDatasetReset?: (notice: {
    kind: 'dataset';
    operation: 'reset';
    phase: 'begin' | 'complete';
  }) => void;
}

async function waitForResetStoresHydrated(): Promise<void> {
  await Promise.all([
    whenChartLibraryHydrated(),
    whenProfilesHydrated(),
    whenLifeEventsHydrated(),
    whenChatHydrated(),
    whenRectificationRecordsHydrated(),
    whenPredictiveHydrated(),
  ]);
}

const DEFAULT_DEPS: ResetEverythingDeps = {
  waitForHydration: waitForResetStoresHydrated,
  clearPersisted: async (epoch) => {
    if (epoch === undefined) return;
    await commitDatasetGeneration(
      epoch,
      RESET_IDB_KEYS.map((key) => ({ key, value: null })),
      ['almamesh-chat-vectors'],
      { memoryRebuildPending: false },
    );
  },
  beginDatasetReset: bumpRestoreEpoch,
  abortDatasetReset: abortBackupRestore,
  publishDatasetReset: publishDeletionNotice,
};

/**
 * Wipe the chart and everything derived from it, then resolve so the caller can
 * navigate to `/`. Each store is cleared in memory, then its IndexedDB record is
 * deleted through an awaited persistence seam, so even a hard reload re-hydrates
 * from nothing. Preserves the OPFS engine bundle and the device-preference keys.
 */
export async function resetEverything(deps: ResetEverythingDeps = DEFAULT_DEPS): Promise<void> {
  await deps.waitForHydration();

  const epoch = await (deps.beginDatasetReset ?? bumpRestoreEpoch)();
  const publishReset = deps.publishDatasetReset ?? publishDeletionNotice;
  publishReset({ kind: 'dataset', operation: 'reset', phase: 'begin' });
  try {
    // The generation fence lands before vector draining, so another live
    // realm's in-flight embed cannot repopulate the reset dataset after clear.
    await clearMemory();

    useChartLibraryStore.getState().clearAll();
    useProfilesStore.getState().clearAll();
    useLifeEventsStore.getState().clearAll();
    useChatStore.getState().clearAll();
    useInterpretationStore.getState().clearAll();
    useRectificationRecordsStore.getState().clearAll();
    usePredictiveStore.getState().reset();
    useMeshStore.getState().reset();

    await deps.clearPersisted(epoch);
    const storage = getUsableLocalStorage();
    storage?.removeItem(CHART_LIBRARY_FLAG_KEY);
    storage?.removeItem(INTERPRETATIONS_KEY);
    await deps.finalizeDatasetReset?.(epoch);
    publishReset({ kind: 'dataset', operation: 'reset', phase: 'complete' });
  } catch (error) {
    await (deps.abortDatasetReset ?? abortBackupRestore)(epoch);
    throw error;
  }
}
