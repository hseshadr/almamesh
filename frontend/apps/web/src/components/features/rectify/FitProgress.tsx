/**
 * FitProgress — honest indeterminate progress indicator shown while the
 * rectification engine is fitting events against candidate charts.
 *
 * Design invariants:
 *  - Elapsed-seconds timer is displayed honestly; duration is genuinely unknown
 *  - NO percentage bar — we do not know how long the fit will take
 *  - Copy is localized via the `rectify` i18n namespace
 *  - Resets to 0s on mount; cleans up the interval on unmount
 */

import { useState, useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export function FitProgress(): ReactElement {
  const { t } = useTranslation('rectify');
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div data-testid="fit-progress" className="flex flex-col gap-3">
      {/* Indeterminate spinner — no percentage */}
      <div className="flex items-center gap-3">
        <svg
          className="h-5 w-5 animate-spin text-accent-primary"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span
          data-testid="fit-elapsed"
          className="text-sm tabular-nums text-text-secondary"
        >
          {t('fit.elapsed', { seconds })}
        </span>
      </div>

      {/* Honest copy: on-device, no false promise of completion time */}
      <p
        data-testid="fit-device-note"
        className="text-sm leading-relaxed text-text-secondary"
      >
        {t('fit.device_note')}
      </p>
    </div>
  );
}
