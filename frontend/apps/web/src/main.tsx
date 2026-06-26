import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
// Initialize i18next for its side effect (i18n.init) BEFORE rendering, then
// reuse the same instance in the provider below. Offline, bundled catalogs.
import i18n from './i18n/config'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AlmaMeshRuntimeProvider } from './providers/AlmaMeshRuntimeProvider'
import { runProfileMigration } from '@almamesh/store'
import App from './App'
// Self-hosted observatory typography (no external font CDN — keeps the app
// fully offline and free of cross-origin requests). Variable fonts: one woff2
// per family, bundled + hashed by Vite and precached by the service worker.
import '@fontsource-variable/fraunces'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/spline-sans-mono'
import './index.css'

// P5 local-first: there is no backend API to configure and no auth tokens to
// store. The app runs entirely on the in-browser engine + on-device storage;
// the only runtime egress is the optional, user-configured local LLM endpoint.

let queryClient: QueryClient
queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: unknown) => {
      // Spec 036: global cache invalidation on 404 to prevent stale UI after backend data loss.
      const maybeStatusCode =
        typeof error === 'object' && error !== null && 'status_code' in error
          ? (error as { status_code?: number }).status_code
          : undefined

      if (maybeStatusCode === 404) {
        console.warn('[Cache] 404 detected, invalidating all queries')
        queryClient.invalidateQueries()
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
    },
  },
})

// Named-profiles migration (no data loss): on first boot after profiles
// shipped, assign any pre-existing charts to a default "Me" profile. Idempotent
// and hydration-aware, so it is safe to fire-and-forget here.
void runProfileMigration()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <AlmaMeshRuntimeProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AlmaMeshRuntimeProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
