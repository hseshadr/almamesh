/**
 * The single chart-regeneration handler.
 *
 * Onboarding and Settings used to inline the same four-step sequence
 * (generate → adapt → save → reset), which let Settings drift: it orphaned the
 * old chart under a new id, dropped `profile_id`, had no change-detection, and
 * never re-streamed the interpretation. This module is now the ONE place that
 * sequence lives; both pages just emit `birth-info-changed` (see `events.ts`).
 *
 * Pure-ish and dependency-injected so it is unit-testable without React, the
 * Pyodide engine, or IndexedDB: callers pass an `engine`, a `library` facade
 * (satisfied by `useChartLibraryStore.getState()`), and an `onRegenerated`
 * callback that resets ephemeral interpretation/chat and triggers the re-stream.
 */

import type { BirthInput, SiderealChart } from '@almamesh/browser/types';

import { type BirthMeta, chartId, siderealChartToChartData, toBirthInput } from './adapters/chart';
import type { StoredChart } from './chartLibrary';
import type { BirthInfoChanged } from './events';

/** The minimal engine surface the handler needs (the Pyodide chart engine). */
export interface RegenerateEngine {
  generateChart: (input: BirthInput) => Promise<SiderealChart>;
}

/** The minimal chart-library surface the handler mutates. */
export interface RegenerateLibrary {
  getPrimaryChart: () => StoredChart | undefined;
  saveChart: (chart: StoredChart) => void;
  deleteChart: (chartId: string) => void;
}

/** Everything the handler depends on; injected so it stays testable. */
export interface RegenerateDeps {
  readonly engine: RegenerateEngine;
  readonly library: RegenerateLibrary;
  /** Reset ephemeral interpretation/chat + trigger the interpretation re-stream. */
  readonly onRegenerated: () => void;
}

/** Build the new primary `StoredChart`, preserving the owning profile. */
function buildPrimary(
  chart: SiderealChart,
  birth: BirthMeta,
  profileId: string | null,
): StoredChart {
  const data = siderealChartToChartData(chart, birth);
  return {
    ...data,
    chart_id: data.chart_id,
    person_name: birth.name,
    is_primary: true,
    ...(profileId === null ? {} : { profile_id: profileId }),
    sidereal_chart: chart,
  };
}

/** True when the new birth inputs resolve to the existing primary's chart id. */
function isUnchanged(library: RegenerateLibrary, nextId: string): boolean {
  return library.getPrimaryChart()?.chart_id === nextId;
}

/**
 * Regenerate the primary chart in response to a `birth-info-changed` event.
 *
 * No-op (rename-only) when the effective birth inputs yield the same `chartId`.
 * Otherwise: compute the chart on-device, save the new primary with
 * `profile_id` PRESERVED, delete the prior primary row (the orphan), then let
 * the caller reset ephemeral state and re-stream the interpretation.
 */
export async function regenerateOnBirthChange(
  event: BirthInfoChanged,
  deps: RegenerateDeps,
): Promise<void> {
  const { birth, profileId } = event;
  const nextId = chartId(birth);
  if (isUnchanged(deps.library, nextId)) {
    return;
  }
  const prior = deps.library.getPrimaryChart();
  const chart = await deps.engine.generateChart(toBirthInput(birth));
  deps.library.saveChart(buildPrimary(chart, birth, profileId));
  if (prior && prior.chart_id !== nextId) {
    deps.library.deleteChart(prior.chart_id);
  }
  deps.onRegenerated();
}
