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
import {
  appEvents,
  type BirthMeta,
  buildRectificationRecord,
  isStructuredLifeEvent,
  useChartLibraryStore,
  useLifeEventsStore,
  useProfilesStore,
  useRectificationRecordsStore,
} from '@almamesh/store';
import type { ProcessedBirthData, RectificationCandidate } from '@almamesh/shared-types';
import type { TimeConfidence } from '@almamesh/constants';
import { useRectification } from '../hooks/useRectification';
import { EventEntryStep } from '../components/features/rectify/EventEntryStep';
import { FitProgress } from '../components/features/rectify/FitProgress';
import { EngineWarming } from '../components/features/rectify/EngineWarming';
import { RectifyResults } from '../components/features/rectify/RectifyResults';
import { RegenerationConfirmModal } from '../components/features/settings/RegenerationConfirmModal';

type WizardStep = 'intro' | 'events' | 'fit' | 'results';

export function RectifyPage(): ReactElement {
  const { profileId = '' } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('rectify');

  const {
    state,
    engineReady,
    engineError,
    engineStage,
    missingBirth,
    warmingTimedOut,
    hasEnoughEvents,
    detectedMode,
    run,
    retry,
  } = useRectification(profileId);

  const initialStep: WizardStep =
    useLifeEventsStore.getState().getEvents(profileId).some(isStructuredLifeEvent)
      ? 'events'
      : 'intro';
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [pendingCandidate, setPendingCandidate] = useState<RectificationCandidate | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Kick off the rectification when the fit step becomes active.
  // Mode is auto-detected from the profile's birth_time_confidence:
  //   'unknown'/'rough' → 'window' (whole-day sign ranking)
  //   'exact'/'approximate' → 'cusp' (two-candidate comparison)
  useEffect(() => {
    // Only kick the compute when the inputs are actually valid. When birth
    // details are missing or there are no structured events, the fit step shows
    // an explicit message instead — never a silent spinner waiting on a run that
    // can't happen. (run() records the mode even while the engine warms, so a
    // later retry recovers; the hook re-fires this once the engine is ready.)
    if (step === 'fit' && state.status === 'idle' && !missingBirth && hasEnoughEvents) {
      void run(detectedMode);
    }
  }, [step, state.status, missingBirth, hasEnoughEvents, run, detectedMode]);

  // Transition fit → results once the engine finishes.
  useEffect(() => {
    if (step === 'fit' && state.status === 'ready') {
      setStep('results');
    }
  }, [step, state.status]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const charts = useChartLibraryStore((s) => s.charts);

  /** True when the profile's stored chart has birth_time_confidence === 'unknown'.
   *  In that case the chart was computed from a noon placeholder — there is no
   *  real recorded time to compare against and no prior sign to flip from. */
  const isUnknownTime = useMemo(() => {
    const chart =
      Object.values(charts).find((c) => c.profile_id === profileId && c.is_primary) ??
      Object.values(charts).find((c) => c.profile_id === profileId);
    const birthData = chart?.birth_data as ProcessedBirthData | undefined;
    return (birthData?.birth_time_confidence as TimeConfidence | undefined) === 'unknown';
  }, [charts, profileId]);

  const signFlip = useMemo(() => {
    // No sign to flip from when the user never entered a time.
    if (isUnknownTime) return null;
    if (pendingCandidate == null || state.result == null) return null;
    const { recordedTimeSign } = state.result;
    if (recordedTimeSign == null) return null;
    if (pendingCandidate.ascendantSign === recordedTimeSign) return null;
    return { from: recordedTimeSign, to: pendingCandidate.ascendantSign };
  }, [isUnknownTime, pendingCandidate, state.result]);

  const recordedReading = useMemo(() => {
    // Suppress the comparison entirely when there was never a recorded time.
    if (isUnknownTime) return null;
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
  }, [isUnknownTime, state.result, profileId, charts]);

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

    // Persist a display-only record of THIS rectification before changing the
    // birth time, so Settings can show a standing "was X, now Y" account. The
    // chosen candidate's sign/time + the result's band/margin/mode are captured
    // alongside the opaque ids of the structured events that informed the fit —
    // no life-event narrative is ever stored (privacy posture).
    if (state.result != null) {
      const structuredEventIds = useLifeEventsStore
        .getState()
        .getEvents(profileId)
        .filter(isStructuredLifeEvent)
        .map((e) => e.id);
      useRectificationRecordsStore.getState().setRecord(
        buildRectificationRecord({
          profileId,
          result: state.result,
          candidate: pendingCandidate,
          originalTime: enteredTime,
          structuredEventIds,
          confirmedAt: Date.now(),
        }),
      );
    }

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
          {!missingBirth && hasEnoughEvents && (
            <h2 className="text-xl font-semibold text-text-primary">{t('fit.heading')}</h2>
          )}
          {state.status === 'error' ? (
            <>
              <p className="text-sm text-status-error">{t('fit.error_heading')}</p>
              {state.error != null && (
                <p className="break-words text-xs text-text-tertiary">{state.error}</p>
              )}
              <button
                type="button"
                onClick={() => void retry()}
                className="w-fit rounded-lg border border-ui-border px-4 py-2 text-sm"
              >
                {t('fit.retry')}
              </button>
            </>
          ) : missingBirth ? (
            <p
              data-testid="fit-missing-birth"
              className="text-sm leading-relaxed text-text-secondary"
            >
              {t('error.missing_birth')}
            </p>
          ) : !hasEnoughEvents ? (
            <div data-testid="fit-no-events" className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-text-secondary">{t('error.no_events')}</p>
              <button
                type="button"
                onClick={() => setStep('events')}
                className="w-fit rounded-lg border border-ui-border px-4 py-2 text-sm"
              >
                {t('error.back_to_events')}
              </button>
            </div>
          ) : engineError !== null || !engineReady ? (
            <EngineWarming
              engineError={engineError}
              timedOut={warmingTimedOut}
              engineStage={engineStage}
              onRetry={() => void retry()}
            />
          ) : (
            <FitProgress onRetry={() => void retry()} />
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
