/**
 * Predictive-layer presentation helpers — PURE, no astrology.
 *
 * Everything here reshapes or formats engine-emitted predictive data for the
 * UI: building the lazy `ensurePredictive` input from the stored chart,
 * pinning an explicit reference instant (never a silent wall-clock read deep
 * in a component), Title-Casing the adapter's lowercase tokens for the chart
 * geometry builder, and locale-aware date display for engine ISO values.
 */

import type { ProcessedBirthData, VargaChartFullData } from '@almamesh/shared-types';
import type { EnsurePredictiveInput, StoredChart, VargaChart, VargaPlanet } from '@almamesh/store';
import { formatBirthDateForDisplay, formatDisplayDate } from './dates';

/**
 * The EXPLICIT reference instant for "what's happening now": UTC midnight of
 * the given day. Pinning to the day start keeps the store's idempotency key
 * stable across re-renders and across the whole session day, and makes the
 * computed "current" dasha/transits reproducible.
 */
export function predictiveReferenceInstant(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 10)}T00:00:00Z`;
}

/**
 * Build the lazy-compute input from the stored chart's birth data, or `null`
 * when the chart predates the fields the engine needs (no silent guesses).
 */
export function buildEnsurePredictiveInput(
  profileKey: string,
  birth: ProcessedBirthData | undefined,
  referenceInstant: string,
): EnsurePredictiveInput | null {
  const datetimeUtc = birth?.birth_datetime_utc;
  const location = birth?.birth_location_details;
  if (!datetimeUtc || !location) {
    return null;
  }
  return {
    profileKey,
    datetimeUtc,
    latitude: location.latitude,
    longitude: location.longitude,
    referenceInstant,
  };
}

/**
 * The active profile's primary stored chart (the explicit primary, else the
 * first) — the same rule `ReportView` and the chart-library store use.
 */
export function selectPrimaryStoredChart(
  charts: Readonly<Record<string, StoredChart>>,
): StoredChart | undefined {
  const all = Object.values(charts);
  return all.find((chart) => chart.is_primary) ?? all[0];
}

/** "aries" → "Aries", "saturn" → "Saturn" (pure casing, no vocabulary). */
export function titleCaseToken(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/**
 * Reshape one engine Shodasavarga chart (adapter-lowercased signs) into the
 * `VargaChart` shape `buildVargaGeometry` consumes (engine Title-Case signs).
 * Pure case mapping — placements and lordships render verbatim.
 */
export function toVargaChart(data: VargaChartFullData): VargaChart {
  const planets: Record<string, VargaPlanet> = {};
  for (const [key, placement] of Object.entries(data.placements)) {
    if (!placement) continue;
    planets[key] = {
      name: placement.graha,
      sign: titleCaseToken(placement.sign),
      sign_lord: placement.sign_lord,
    };
  }
  return {
    name: data.chart,
    lagna_sign: titleCaseToken(data.lagna_sign),
    lagna_sign_lord: data.lagna_sign_lord,
    planets,
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Locale-aware display for an engine ISO value: a date-only string renders as
 * that CALENDAR date (never reparsed through UTC, which can roll it back a day
 * west of GMT), while a full instant renders in the viewer's local time.
 */
export function formatPredictiveDate(iso: string): string {
  if (DATE_ONLY.test(iso)) {
    return formatBirthDateForDisplay(iso);
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return formatBirthDateForDisplay(iso.split('T')[0] ?? iso);
  }
  return formatDisplayDate(parsed);
}

/**
 * Display formatting for a Shadbala rupa value. The engine emits full-precision
 * floats (e.g. 6.128260954302394); the screen shows the conventional two
 * decimals. Pure presentation — the underlying engine value is untouched.
 */
export function formatRupas(value: number): string {
  return value.toFixed(2);
}
