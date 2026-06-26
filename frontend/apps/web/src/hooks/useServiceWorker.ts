import { useCallback, useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Registers the PWA Service Worker and surfaces its update lifecycle.
 *
 * Update policy (matches the P6 cache-discipline spec):
 *   - `registerType: 'prompt'` — a new SW installs but WAITS. We never auto
 *     `skipWaiting` for a normal update; instead `needRefresh` flips true and
 *     the UI offers a reload (see {@link UpdateBanner}).
 *   - `update()` is the force path: it activates the waiting SW (skipWaiting)
 *     and reloads, so a security update can be pushed through immediately.
 *
 * Persistence: the sync Worker best-effort calls `navigator.storage.persist()`;
 * we ALSO request it from the main thread so OPFS/IndexedDB (the cached engine
 * data + saved charts) are not evicted under storage pressure.
 */
export function useServiceWorker() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => false)

    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onOfflineReady() {
        setOfflineReady(true)
      },
    })
  }, [])

  const update = useCallback(() => {
    setNeedRefresh(false)
    // skipWaiting + reload (the registerSW updater reloads on activation).
    void updateRef.current?.(true)
  }, [])

  const dismiss = useCallback(() => {
    setNeedRefresh(false)
  }, [])

  return { needRefresh, offlineReady, update, dismiss }
}
