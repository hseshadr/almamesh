/**
 * Rectify — event-based birth-time rectification wizard.
 *
 * Step flow: intro → events → fit (loading) → results
 *
 * On confirm: builds BirthMeta from stored chart + candidate's representative
 * time, opens RegenerationConfirmModal (with sign-flip gate when the ascendant
 * sign changes), then emits birth-info-changed and navigates to /dashboard.
 */
import { useState, useEffect, useMemo, type ReactElement } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { appEvents, type BirthMeta, useChartLibraryStore, useProfilesStore } from '@almamesh/store';
import type { ProcessedBirthData, RectificationCandidate } from '@almamesh/shared-types';
import { useRectification } from '../hooks/useRectification';
import { EventEntryStep } from '../components/features/rectify/EventEntryStep';
import { FitProgress } from '../components/features/rectify/FitProgress';
import { RectifyResults } from '../components/features/rectify/RectifyResults';
import { RegenerationConfirmModal } from '../components/features/settings/RegenerationConfirmModal';

type WizardStep = 'intro' | 'events' | 'fit' | 'results';

export function RectifyPage(): ReactElement {
  const { profileId = '' } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('rectify');

  const { state, engineReady, detectedMode, run, retry } = useRectification(profileId);

  const [step, setStep] = useState<WizardStep>('intro');
  const [pendingCandidate, setPendingCandidate] = useState<RectificationCandidate | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Kick off the rectification when the fit step becomes active.
  // Mode is auto-detected from the profile's birth_time_confidence:
  //   'unknown'/'rough' → 'window' (whole-day sign ranking)
  //   'exact'/'approximate' → 'cusp' (two-candidate comparison)
  useEffect(() => {
    if (step === 'fit' && state.status === 'idle') {
      void run(detectedMode);
    }
  }, [step, state.status, run, detectedMode]);

  // Transition fit → results once the engine finishes.
  useEffect(() => {
    if (step === 'fit' && state.status === 'ready') {
      setStep('results');
    }
  }, [step, state.status]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const signFlip = useMemo(() => {
    if (pendingCandidate == null || state.result == null) return null;
    const { recordedTimeSign } = state.result;
    if (recordedTimeSign == null) return null;
    if (pendingCandidate.ascendantSign === recordedTimeSign) return null;
    return { from: recordedTimeSign, to: pendingCandidate.ascendantSign };
  }, [pendingCandidate, state.result]);

  const charts = useChartLibraryStore((s) => s.charts);

  const recordedReading = useMemo(() => {
    if (state.result?.recordedTimeSign == null) return null;
    const chart =
      Object.values(charts).find((c) => c.profile_id === profileId && c.is_primary) ??
      Object.values(charts).find((c) => c.profile_id === profileId);
    const birthData = chart?.birth_data as ProcessedBirthData | undefined;
    const localDt = birthData?.birth_datetime_local ?? '';
    const enteredTime =
      birthData?.birth_time_original ?? localDt.split('T')[1]?.slice(0, 5) ?? '';
    return {
      time: enteredTime,
      sign: state.result.recordedTimeSign,
      signDegrees: 0,
    };
  }, [state.result, profileId, charts]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleConfirm(candidate: RectificationCandidate): void {
    setPendingCandidate(candidate);
    setShowModal(true);
  }

  function handleModalConfirm(): void {
    if (pendingCandidate == null) return;

    const charts = useChartLibraryStore.getState().charts;
    const chart =
      Object.values(charts).find((c) => c.profile_id === profileId && c.is_primary) ??
      Object.values(charts).find((c) => c.profile_id === profileId);

    if (chart == null) return;
    const birthData = chart.birth_data as ProcessedBirthData | undefined;
    const loc = birthData?.birth_location_details;
    if (birthData == null || loc == null) return;

    const localDt = birthData.birth_datetime_local ?? '';
    const enteredTime =
      birthData.birth_time_original ?? localDt.split('T')[1]?.slice(0, 5) ?? '';
    const date = localDt.split('T')[0] ?? '';

    const profileName = useProfilesStore.getState().profiles[profileId]?.name ?? '';

    const birth: BirthMeta = {
      name: profileName,
      date,
      time: enteredTime,
      rectifiedTime: pendingCandidate.representativeTimeLocal,
      latitude: loc.latitude,
      longitude: loc.longitude,
      timezone: loc.timezone ?? 'UTC',
      location_name: loc.location_name ?? '',
    };

    appEvents.emit('birth-info-changed', { birth, profileId });
    setShowModal(false);
    setPendingCandidate(null);
    navigate('/dashboard');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">{t('wizard.title')}</h1>

      {step === 'intro' && (
        <div data-testid="intro-step" className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-text-primary">{t('intro.heading')}</h2>
          <p className="text-sm text-text-secondary">{t('intro.body')}</p>
          <p className="rounded-md border border-ui-border bg-background-secondary/40 p-4 text-xs text-text-muted">
            {t('intro.honesty')}
          </p>
          <button
            type="button"
            data-testid="intro-start-btn"
            onClick={() => setStep('events')}
            className="w-fit rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white"
          >
            {t('intro.start')}
          </button>
        </div>
      )}

      {step === 'events' && (
        <EventEntryStep profileId={profileId} onContinue={() => setStep('fit')} />
      )}

      {step === 'fit' && state.status !== 'ready' && (
        <div data-testid="fit-step" className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-text-primary">{t('fit.heading')}</h2>
          {state.status === 'error' ? (
            <>
              <p className="text-sm text-status-error">{t('fit.error_heading')}</p>
              <button
                type="button"
                onClick={() => void retry()}
                className="w-fit rounded-lg border border-ui-border px-4 py-2 text-sm"
              >
                {t('fit.retry')}
              </button>
            </>
          ) : !engineReady ? (
            <p className="text-sm text-text-secondary">{t('fit.engine_warming')}</p>
          ) : (
            <FitProgress />
          )}
        </div>
      )}

      {step === 'results' && state.result != null && (
        <RectifyResults
          result={state.result}
          recordedReading={recordedReading}
          onConfirm={handleConfirm}
          onKeepRecorded={() => navigate('/dashboard')}
        />
      )}

      <RegenerationConfirmModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setPendingCandidate(null);
        }}
        onConfirm={handleModalConfirm}
        scope="chart+interpretation"
        estimatedCost={0}
        signFlip={signFlip}
      />
    </div>
  );
}

export default RectifyPage;
