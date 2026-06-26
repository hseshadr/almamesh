/**
 * useChatScopeSync — keep `@almamesh/memory`/chat's active-profile scope in step
 * with the active profile, exactly like the chart library's scope wiring.
 *
 * The profiles store pushes `setActiveProfileScope` into the chart library on
 * every active-profile change. The chat store exposes the SAME seam
 * (`setActiveChatScope`) but, to keep the store packages decoupled, the app is
 * responsible for pushing the chat scope. Mounting this once at the app root
 * mirrors the existing chartLibrary scope behaviour: the current profile is set
 * on mount and re-pushed whenever it changes (switch / create / delete).
 *
 * Hydration is handled separately: `runProfileMigration()` already awaits
 * `whenChatHydrated()` alongside the profile + chart-library hydrations during
 * bootstrap, so by the time a profile id exists the chat store is rehydrated.
 */

import { useEffect } from 'react';
import { useProfilesStore, setActiveChatScope } from '@almamesh/store';

export function useChatScopeSync(): void {
  const activeProfileId = useProfilesStore((s) => s.activeProfileId);

  useEffect(() => {
    setActiveChatScope(activeProfileId);
  }, [activeProfileId]);
}

export default useChatScopeSync;
