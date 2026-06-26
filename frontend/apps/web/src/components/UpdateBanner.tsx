import { useTranslation } from 'react-i18next'
import { useServiceWorker } from '../hooks/useServiceWorker'
import { useVersionCheck } from '../hooks/useVersionCheck'

/**
 * Banner shown when a new version of the app is available.
 *
 * Two signals, one prompt:
 *   - the PWA Service Worker has a freshly precached app shell waiting
 *     (`needRefresh`) — the authoritative "reload to update" trigger;
 *   - `/version.json` changed (the build polled by {@link useVersionCheck}) —
 *     a redundant deploy signal that also surfaces the prompt for clients whose
 *     SW has not yet picked up the waiting worker.
 *
 * "Reload now" activates the waiting SW (skipWaiting) and reloads, so the new
 * shell takes over. The cached engine data in OPFS is untouched.
 */
export function UpdateBanner() {
  const { t } = useTranslation()
  const { needRefresh, update, dismiss: dismissSw } = useServiceWorker()
  const { hasNewVersion, dismissUpdate: dismissVersion } = useVersionCheck({
    pollInterval: 5 * 60 * 1000,
    checkOnFocus: true,
  })

  const show = needRefresh || hasNewVersion
  if (!show) {
    return null
  }

  const reload = () => {
    if (needRefresh) {
      update() // activates waiting SW + reloads
    } else {
      window.location.reload()
    }
  }

  const dismiss = () => {
    dismissSw()
    dismissVersion()
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 bg-accent-gold text-background-primary px-4 py-2 flex items-center justify-center gap-4 animate-fade-in"
    >
      <span className="text-sm font-medium">{t('update.available')}</span>
      <button
        onClick={reload}
        className="px-3 py-1 bg-background-primary text-accent-gold rounded-md text-sm font-semibold hover:bg-background-secondary transition-colors"
      >
        {t('update.reload_cta')}
      </button>
      <button
        onClick={dismiss}
        className="text-background-primary/70 hover:text-background-primary transition-colors"
        aria-label={t('update.dismiss_aria')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  )
}
