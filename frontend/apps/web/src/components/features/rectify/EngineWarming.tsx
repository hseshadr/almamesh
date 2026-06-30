/**
 * EngineWarming — the honest, RECOVERABLE "engine not ready" surface for the
 * rectification wizard's fit step.
 *
 * The in-browser engine (sync the signed bundle into OPFS + boot Pyodide) can
 * take a minute or two on a cold first boot, so this mirrors the dashboard's
 * Life-Atlas pattern: a live elapsed timer + plain-language reassurance, never
 * a bare "warming up" line that looks permanently broken.
 *
 * Two recovery cues honour the engine-recovery invariant (no permanent
 * dead-end):
 *  - `engineError` non-null → the boot actually FAILED; show the failure + a
 *    reset-and-reload button.
 *  - `timedOut` → warming has dragged past a generous threshold; show a stalled
 *    message + the same reset-and-reload button.
 *
 * Both paths call `onRetry`, which reboots the engine and re-runs.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Spinner } from '../../ui';
import { useElapsedSeconds, formatElapsed } from '../../../hooks/useElapsedSeconds';

export interface EngineWarmingProps {
  /** Engine boot failure message, or null while still warming. */
  readonly engineError: string | null;
  /** True once warming has exceeded the generous timeout without booting. */
  readonly timedOut: boolean;
  /** Current bootstrap stage kind (e.g. 'syncing'), for an honest sub-label. */
  readonly engineStage: string | null;
  /** Reset-and-reload the engine, then re-run the rectification. */
  readonly onRetry: () => void;
}

/** Map a bootstrap stage kind to its localized sub-label key, or null. */
function stageLabelKey(stage: string | null): string | null {
  switch (stage) {
    case 'syncing':
      return 'status.stage_syncing';
    case 'reassembling':
      return 'status.stage_reassembling';
    case 'booting-engine':
      return 'status.stage_booting';
    default:
      return null;
  }
}

export function EngineWarming({
  engineError,
  timedOut,
  engineStage,
  onRetry,
}: EngineWarmingProps): ReactElement {
  const { t } = useTranslation('rectify');
  const needsRecovery = engineError !== null || timedOut;
  // Honest live timer — only running while we are genuinely still warming.
  const elapsed = useElapsedSeconds(!needsRecovery);

  if (needsRecovery) {
    const title = engineError !== null ? t('error.engine_failed_title') : t('status.stalled_title');
    const body = engineError !== null ? t('error.engine_failed_body') : t('status.stalled_body');
    return (
      <div data-testid="engine-recovery" className="flex flex-col gap-3">
        <p className="text-sm font-medium text-status-error">{title}</p>
        <p className="text-sm leading-relaxed text-text-secondary">{body}</p>
        {engineError !== null && (
          <p
            data-testid="engine-error-detail"
            className="break-words text-xs text-text-tertiary"
          >
            {engineError}
          </p>
        )}
        <Button
          variant="secondary"
          size="sm"
          data-testid="engine-reset-btn"
          onClick={onRetry}
          className="w-fit"
        >
          {t('status.reset_reload')}
        </Button>
      </div>
    );
  }

  const stageKey = stageLabelKey(engineStage);
  return (
    <div data-testid="engine-warming" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Spinner size="sm" className="mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text-primary">{t('status.warming_title')}</p>
          <p className="text-sm leading-relaxed text-text-secondary">
            {t('status.warming_body', { elapsed: formatElapsed(elapsed) })}
          </p>
          {stageKey !== null && (
            <p data-testid="engine-stage" className="text-xs text-text-tertiary">
              {t(stageKey)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
