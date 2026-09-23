/**
 * Guards a reset that drops the anti-rollback floor when the engine boot was
 * REFUSED as a rollback (`EngineOperationError.code === 'rollback'`).
 *
 * A rollback refusal is exactly what an attacker who can serve an older, validly
 * signed bundle would cause, so the recovery surface must not steer the user
 * into wiping the floor with one click. For a rollback it shows a plain-language
 * tampering warning and turns the trigger into the first step of a two-step
 * inline confirm (the same pattern as "Start over"). Any other failure keeps the
 * one-click reset. Nothing here ever resets automatically.
 */

import { useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface RollbackResetGuardProps {
  /** True when the boot failure is a rollback refusal. */
  readonly rollback: boolean;
  /** The actual reset (clears the cache, then reloads). */
  readonly onReset: () => void;
  /** Render the surface's own reset button, wired to the given click handler. */
  readonly renderTrigger: (onClick: () => void) => ReactNode;
}

export function RollbackResetGuard({
  rollback,
  onReset,
  renderTrigger,
}: RollbackResetGuardProps): ReactElement {
  const { t } = useTranslation('common');
  const [confirming, setConfirming] = useState(false);

  if (!rollback) {
    return <>{renderTrigger(onReset)}</>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p
        role="alert"
        data-testid="rollback-warning"
        className="rounded-md border border-status-error/40 bg-status-error/10 p-3 text-xs leading-relaxed text-status-error"
      >
        {t('engine_rollback.warning')}
      </p>
      {confirming ? (
        <div
          data-testid="rollback-reset-confirm-panel"
          className="flex flex-col gap-2 rounded-md border border-status-error/30 bg-status-error/5 p-3"
        >
          <p className="text-xs leading-relaxed text-text-secondary">
            {t('engine_rollback.confirm_prompt')}
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              data-testid="rollback-reset-cancel"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-ui-border px-3 py-1 text-xs text-text-primary hover:bg-background-tertiary"
            >
              {t('engine_rollback.cancel')}
            </button>
            <button
              type="button"
              data-testid="rollback-reset-confirm"
              onClick={onReset}
              className="rounded-md border border-status-error/50 px-3 py-1 text-xs font-medium text-status-error hover:bg-status-error/10"
            >
              {t('engine_rollback.confirm')}
            </button>
          </div>
        </div>
      ) : (
        renderTrigger(() => setConfirming(true))
      )}
    </div>
  );
}
