/**
 * Content Mode Store - Zustand state for interpretation display preferences (in-memory, no persistence)
 *
 * Manages the global "For You" (layman) vs "For Astrologer" (technical) toggle
 * that applies to all interpretation sections across the app.
 *
 * Spec 036 (Cache Consolidation): Removed persist middleware.
 * Default to "For You", let user toggle per session.
 */

import { create, StateCreator } from 'zustand';

export type ContentMode = 'layman' | 'technical';

export interface ContentModeStore {
  // State
  contentMode: ContentMode;

  // Actions
  setContentMode: (mode: ContentMode) => void;
  toggleContentMode: () => void;
}

/**
 * Content mode store state creator (without persistence)
 */
export const contentModeStoreCreator: StateCreator<ContentModeStore> = (set) => ({
  // Initial state - default to layman (For You) mode
  contentMode: 'layman',

  // Actions
  setContentMode: (mode) => set({ contentMode: mode }),

  toggleContentMode: () =>
    set((state) => ({
      contentMode: state.contentMode === 'layman' ? 'technical' : 'layman',
    })),
});

/**
 * Content mode store (in-memory only, no persistence)
 *
 * Spec 036 (Cache Consolidation): Removed persistence.
 * Default to "For You" (layman), user toggles per session.
 */
export const useContentModeStore = create<ContentModeStore>()(contentModeStoreCreator);
