import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { UpdateBanner } from './components/UpdateBanner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AnimatedRoutes } from './components/AnimatedRoutes'
import { AnimatedPage } from './components/AnimatedPage'
import { AppLayout } from './components/features/layout/AppLayout'
import { Spinner } from './components/ui'
import { useOnboardingStatus } from './hooks/useOnboardingStatus'
import { useChatScopeSync } from './hooks/useChatScopeSync'
import { useLanguageSync } from './hooks/useLanguageSync'
import { useRegenerationSubscription } from './hooks/useRegenerationSubscription'

/** Wrap a page element in the animated-page transition wrapper. */
function page(element: ReactNode): ReactNode {
  return <AnimatedPage>{element}</AnimatedPage>
}

// Lazy-loaded page components for code splitting
const LandingPage = lazy(() => import('./pages/Landing'))
const OnboardingPage = lazy(() => import('./pages/Onboarding'))
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const PredictivePage = lazy(() => import('./pages/Predictive'))
const LifeDomainPage = lazy(() => import('./pages/LifeDomain'))
const MeshPage = lazy(() => import('./pages/Mesh'))
const MeshEdgePage = lazy(() => import('./pages/MeshEdge'))
const RectifyPage = lazy(() => import('./pages/Rectify'))
const ReportViewPage = lazy(() => import('./pages/ReportView'))
const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy'))
const TermsOfService = lazy(() => import('./pages/legal/TermsOfService'))
const DataDeletion = lazy(() => import('./pages/legal/DataDeletion'))
const SettingsLayout = lazy(() => import('./pages/settings/SettingsLayout'))
const ProfileSettings = lazy(() => import('./pages/settings/ProfileSettings'))
const PeopleSettings = lazy(() => import('./pages/settings/PeopleSettings'))
const PreferencesSettings = lazy(() => import('./pages/settings/PreferencesSettings'))
const AiSettings = lazy(() => import('./pages/settings/AiSettings'))
const DataSettings = lazy(() => import('./pages/settings/DataSettings'))

/**
 * Loading fallback component for Suspense boundaries
 */
function PageLoadingFallback() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background-primary">
      <div className="text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <p className="text-text-secondary text-sm">{t('loading')}</p>
      </div>
    </div>
  )
}

/**
 * Root path (`/`) routing (single local user, no auth):
 * - Chart exists locally -> redirect to /dashboard (the app shell, as before).
 * - No chart yet -> the marketing splash, rendered OUTSIDE `AppLayout` (no
 *   profile switcher / AI-status chrome) and WITHOUT booting the ~38 MB engine.
 *
 * The landing is a lazy, engine-free chunk; the engine bootstrap is deferred and
 * prewarmed on CTA intent (see `usePrewarmEngineOnIntent` + the auto-boot gate in
 * `AlmaMeshRuntimeProvider`).
 */
function RootRoute() {
  const { hasChart, isLoading } = useOnboardingStatus()

  if (isLoading) {
    return <PageLoadingFallback />
  }

  if (hasChart) {
    return <Navigate to="/dashboard" replace />
  }

  return <LandingPage />
}

/**
 * Stable, shareable splash at `/welcome`. Unlike `/`, this ALWAYS renders the
 * marketing splash regardless of whether a chart is saved locally — so a
 * returning visitor (and anyone with the link) can revisit or share the splash
 * without being bounced to `/dashboard`. Rendered OUTSIDE `AppLayout`, exactly
 * like the landing at `/`, and equally engine-free.
 */
function WelcomeRoute() {
  return <LandingPage />
}

/**
 * The observatory app shell + its animated route tree. Everything here is
 * wrapped by `AppLayout` (header chrome + constrained main). The landing page is
 * intentionally NOT part of this group — it owns its own full-bleed chrome.
 */
function AppRoutes() {
  return (
    <AppLayout>
      <AnimatedRoutes>
        <Route path="/onboarding" element={page(<OnboardingPage />)} />
        <Route path="/dashboard" element={page(<DashboardPage />)} />
        <Route path="/predictive" element={page(<PredictivePage />)} />
        <Route path="/life/:domain" element={page(<LifeDomainPage />)} />
        <Route path="/mesh" element={page(<MeshPage />)} />
        <Route path="/mesh/:memberId" element={page(<MeshEdgePage />)} />
        <Route path="/rectify/:profileId" element={page(<RectifyPage />)} />
        <Route path="/report" element={page(<ReportViewPage />)} />

        {/* Legacy route redirect */}
        <Route path="/edit-birth-details" element={<Navigate to="/settings/profile" replace />} />

        {/* Settings routes */}
        <Route path="/settings" element={<SettingsLayout />}>
          <Route path="profile" element={<ProfileSettings />} />
          <Route path="people" element={<PeopleSettings />} />
          <Route path="ai" element={<AiSettings />} />
          <Route path="preferences" element={<PreferencesSettings />} />
          <Route path="data" element={<DataSettings />} />
        </Route>

        {/* Legal pages - publicly accessible */}
        <Route path="/privacy" element={page(<PrivacyPolicy />)} />
        <Route path="/terms" element={page(<TermsOfService />)} />
        <Route path="/data-deletion" element={page(<DataDeletion />)} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </AnimatedRoutes>
    </AppLayout>
  )
}

function App() {
  useRegenerationSubscription()
  // Mirror the chartLibrary scope wiring: keep the per-profile chat + RAG memory
  // scope in step with the active profile (switch / create / delete).
  useChatScopeSync()
  // Keep i18next + <html lang> in step with the persisted language store, on
  // mount (reflecting the hydrated choice) and on every language switch.
  useLanguageSync()

  return (
    <ErrorBoundary>
      <UpdateBanner />
      <Suspense fallback={<PageLoadingFallback />}>
        {/* `/` is split out of the AppLayout-wrapped group so the marketing
            splash renders full-bleed, outside the app shell. */}
        <Routes>
          <Route path="/" element={<RootRoute />} />
          {/* Stable, shareable splash — always renders the landing, outside the
              app shell, even for a returning visitor with a saved chart. */}
          <Route path="/welcome" element={<WelcomeRoute />} />
          <Route path="*" element={<AppRoutes />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default App
