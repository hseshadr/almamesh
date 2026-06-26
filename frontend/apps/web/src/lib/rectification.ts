/**
 * Rectification adjustment — a PURE, display-only helper.
 *
 * When a chart was computed from a *rectified* birth time, the originally-entered
 * clock is preserved on the stored birth data as `birth_time_original`, while the
 * effective (rectified) clock lives in `birth_datetime_local`. This helper derives
 * the signed minute adjustment between the two and the two clocks pre-formatted in
 * the active UI locale, so the UI can honestly show "entered 5:45 AM → rectified
 * 6:00 AM (+15 min)" wherever the birth time is displayed.
 *
 * It recomputes NO astrology — it only compares two wall clocks the engine path
 * already produced. Returns `null` when there is no rectification in effect (no
 * original time, or the original equals the effective time), so call sites render
 * the adjustment ONLY when one genuinely exists.
 */

import type { ProcessedBirthData } from '@almamesh/shared-types';

import { formatBirthTimeForDisplay } from './dates';

/** The derived, display-ready rectification adjustment. */
export interface RectificationDelta {
  /** Signed minutes from entered → rectified (positive = later, negative = earlier). */
  readonly deltaMinutes: number;
  /** The originally-entered time, formatted in the active UI locale (e.g. "5:45 AM"). */
  readonly enteredLabel: string;
  /** The rectified (effective) time, formatted in the active UI locale (e.g. "6:00 AM"). */
  readonly rectifiedLabel: string;
}

/** Minutes-since-midnight for an `HH:MM` clock, or null if it cannot be parsed. */
function minutesOfClock(clock: string): number | null {
  const [hourStr, minuteStr] = clock.split(':');
  const hours = Number(hourStr);
  const minutes = Number(minuteStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * The shared core: derive the adjustment from two raw `HH:MM` wall clocks
 * (entered → rectified), or `null` when either cannot be parsed or the two clocks
 * are equal (no adjustment to show). Both labels are formatted in the active UI
 * locale from a fixed date, since only the time-of-day is displayed. This is the
 * single source of the "minutes + entered/rectified labels" shape — the stored-
 * data `rectificationDelta` below and the ProfileSettings form panel both call it.
 */
export function rectificationDeltaFromClocks(
  enteredHHMM: string,
  rectifiedHHMM: string,
): RectificationDelta | null {
  const enteredMinutes = minutesOfClock(enteredHHMM);
  const rectifiedMinutes = minutesOfClock(rectifiedHHMM);
  if (enteredMinutes === null || rectifiedMinutes === null) {
    return null;
  }
  const deltaMinutes = rectifiedMinutes - enteredMinutes;
  if (deltaMinutes === 0) {
    return null;
  }
  return {
    deltaMinutes,
    enteredLabel: formatBirthTimeForDisplay(`2000-01-01T${enteredHHMM}:00`),
    rectifiedLabel: formatBirthTimeForDisplay(`2000-01-01T${rectifiedHHMM}:00`),
  };
}

/**
 * Derive the rectification adjustment from stored birth data, or `null` when no
 * rectification is in effect. The entered clock is `birth_time_original`; the
 * effective clock is the `HH:MM` of `birth_datetime_local`. Delegates the minutes
 * + label derivation to `rectificationDeltaFromClocks`.
 */
export function rectificationDelta(
  birth: ProcessedBirthData,
): RectificationDelta | null {
  const enteredClock = birth.birth_time_original;
  const local = birth.birth_datetime_local;
  if (!enteredClock || !local) {
    return null;
  }
  const effectiveClock = (local.split('T')[1] ?? '').slice(0, 5);
  return rectificationDeltaFromClocks(enteredClock, effectiveClock);
}
