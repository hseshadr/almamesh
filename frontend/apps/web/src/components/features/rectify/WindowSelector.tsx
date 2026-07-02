/**
 * WindowSelector — the honest search-window question on the fit step.
 *
 * "How sure are you about the recorded time?" — the user states a symmetric
 * window (±15m / ±30m / ±1h / ±2h) or admits the whole day. The choice maps to
 * `run(mode, spanMinutes)`:
 *
 *   as_recorded → cusp comparison (no span — the recorded time is trusted)
 *   ±15m/±30m/±1h/±2h → window mode with spanMinutes = TOTAL span (2× the
 *       half-width; the engine halves it back — see rectification/__init__.py)
 *   whole_day → window mode, no span (full birth-day scan)
 *
 * `anchorConfidence` is NOT set here: it follows the engine's per-mode
 * defaults via `buildWireInput` ('about' for cusp, 'unknown' for window).
 * Honesty: a tighter window sharpens the search but is the USER'S claim —
 * the engine never invents precision from it.
 */

import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { RectificationMode } from '@almamesh/shared-types';

export type WindowChoiceId =
  | 'as_recorded'
  | 'quarter'
  | 'half'
  | 'hour'
  | 'two_hours'
  | 'whole_day';

export interface WindowChoice {
  readonly mode: RectificationMode;
  /** TOTAL honest span in minutes (±15m → 30); absent = full day / cusp. */
  readonly spanMinutes?: number;
}

/** The symmetric options: ±15m, ±30m, ±1h, ±2h, whole day (spanMinutes = total). */
export const WINDOW_CHOICES: Readonly<Record<WindowChoiceId, WindowChoice>> = {
  as_recorded: { mode: 'cusp' },
  quarter: { mode: 'window', spanMinutes: 30 },
  half: { mode: 'window', spanMinutes: 60 },
  hour: { mode: 'window', spanMinutes: 120 },
  two_hours: { mode: 'window', spanMinutes: 240 },
  whole_day: { mode: 'window' },
};

const OPTION_ORDER: readonly WindowChoiceId[] = [
  'as_recorded',
  'quarter',
  'half',
  'hour',
  'two_hours',
  'whole_day',
];

export interface WindowSelectorProps {
  /** Pre-selected option: 'as_recorded' for cusp-detected, 'whole_day' for window. */
  readonly defaultId: WindowChoiceId;
  readonly onStart: (choice: WindowChoice) => void;
}

export function WindowSelector({ defaultId, onStart }: WindowSelectorProps): ReactElement {
  const { t } = useTranslation('rectify');
  const [selected, setSelected] = useState<WindowChoiceId>(defaultId);

  return (
    <div data-testid="window-selector" className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-text-primary">{t('window.heading')}</h3>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{t('window.body')}</p>
      </div>

      <fieldset className="flex flex-col gap-1.5" aria-label={t('window.heading')}>
        {OPTION_ORDER.map((id) => (
          <label
            key={id}
            data-testid={`window-option-${id}`}
            className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
              selected === id
                ? 'border-accent-gold/60 bg-surface-secondary text-text-primary'
                : 'border-border-subtle text-text-secondary hover:border-text-tertiary'
            }`}
          >
            <input
              type="radio"
              name="rectify-window"
              value={id}
              checked={selected === id}
              onChange={() => setSelected(id)}
              className="accent-accent-gold"
            />
            {t(`window.${id}`)}
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        data-testid="window-start-btn"
        onClick={() => onStart(WINDOW_CHOICES[selected])}
        className="w-fit rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white"
      >
        {t('window.start')}
      </button>
    </div>
  );
}
