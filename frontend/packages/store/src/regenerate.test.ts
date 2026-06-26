import { describe, expect, it, vi } from 'vitest';

import type { SiderealChart } from '@almamesh/browser/types';

import golden from '../../../../backend/tests/fixtures/chart_golden_de421.json';
import type { BirthMeta } from './adapters/chart';
import { chartId, siderealChartToChartData } from './adapters/chart';
import type { RegenerateDeps } from './regenerate';
import { regenerateOnBirthChange } from './regenerate';
import type { StoredChart } from './chartLibrary';

const DELHI_KEY = '1990-01-15T12:00:00+00:00';
const fakeSiderealChart = (golden as Record<string, SiderealChart>)[DELHI_KEY];

const baseBirth: BirthMeta = {
  name: 'Delhi Native',
  date: '1990-01-15',
  time: '17:30',
  latitude: 28.6139,
  longitude: 77.209,
  timezone: 'Asia/Kolkata',
  location_name: 'New Delhi, India',
  referenceDate: '2024-01-01T00:00:00.000Z',
};

/** An in-memory chart library satisfying `RegenerateDeps['library']`. */
function makeFakeLibrary(seed: StoredChart) {
  const charts = new Map<string, StoredChart>([[seed.chart_id, seed]]);
  return {
    charts,
    getPrimaryChart: () => [...charts.values()].find((c) => c.is_primary),
    getChart: (id: string) => charts.get(id),
    saveChart: (chart: StoredChart) => {
      for (const [id, c] of charts) {
        if (c.is_primary) charts.set(id, { ...c, is_primary: false });
      }
      charts.set(chart.chart_id, chart);
    },
    deleteChart: (id: string) => void charts.delete(id),
    primaryFor: (profileId: string) =>
      [...charts.values()].find((c) => c.is_primary && c.profile_id === profileId),
  };
}

function seededPrimary(birth: BirthMeta, profileId: string): StoredChart {
  const data = siderealChartToChartData(fakeSiderealChart, birth);
  return {
    ...data,
    chart_id: data.chart_id,
    person_name: birth.name,
    is_primary: true,
    profile_id: profileId,
    sidereal_chart: fakeSiderealChart,
  };
}

describe('regenerateOnBirthChange', () => {
  it('no-ops when chartId is unchanged (name is part of the id, so keep it equal)', async () => {
    const lib = makeFakeLibrary(seededPrimary(baseBirth, 'p1'));
    const engine = { generateChart: vi.fn() };
    const onRegenerated = vi.fn();
    const deps: RegenerateDeps = { engine, library: lib, onRegenerated };

    await regenerateOnBirthChange({ birth: baseBirth, profileId: 'p1' }, deps);

    expect(engine.generateChart).not.toHaveBeenCalled();
    expect(onRegenerated).not.toHaveBeenCalled();
    expect(lib.charts.size).toBe(1);
  });

  it('regenerates, deletes the stale-id orphan, and preserves profile_id', async () => {
    const lib = makeFakeLibrary(seededPrimary(baseBirth, 'p1'));
    const staleId = chartId(baseBirth);
    const changedBirth: BirthMeta = { ...baseBirth, time: '18:00' };
    const newId = chartId(changedBirth);
    const engine = { generateChart: vi.fn().mockResolvedValue(fakeSiderealChart) };
    const onRegenerated = vi.fn();
    const deps: RegenerateDeps = { engine, library: lib, onRegenerated };

    await regenerateOnBirthChange({ birth: changedBirth, profileId: 'p1' }, deps);

    expect(engine.generateChart).toHaveBeenCalledOnce();
    expect(lib.getChart(staleId)).toBeUndefined();
    expect(lib.primaryFor('p1')?.profile_id).toBe('p1');
    expect(lib.primaryFor('p1')?.chart_id).toBe(newId);
    expect(onRegenerated).toHaveBeenCalledOnce();
  });
});
