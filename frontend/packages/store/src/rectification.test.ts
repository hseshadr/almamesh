// Store unit test: useRectificationStore lifecycle.
// The store does NOT exist yet — this test file is intentionally RED.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RectificationInput, RectificationResultRaw } from '@almamesh/browser/types';

import { useRectificationStore, type RectificationRuntime } from './rectification';

// Synthetic birth data — no real PII.
const SYNTHETIC_INPUT: RectificationInput = {
  datetimeUtc: '1990-01-15T06:30:00+00:00',
  latitude: 28.6139,
  longitude: 77.209,
  utcOffsetMinutes: 330,
  events: [{ date: '2010-05-15', category: 'marriage' }],
  mode: 'cusp',
};

const SYNTHETIC_RAW: RectificationResultRaw = {
  mode: 'cusp',
  candidates: [
    {
      ascendant_sign: 'Pisces',
      representative_time_local: '06:05',
      lagna_longitude_deg: 3.8,
      lagna_cusp_distance_deg: 3.8,
      is_near_cusp: false,
      fit_score: 0.72,
      supporting_events: [],
    },
  ],
  margin: 0.22,
  band: 'leans',
  discriminating_event_count: 1,
  recorded_time_sign: 'Aquarius',
  honesty_note_key: 'rectify.honesty.leans',
};

function makeRuntime(
  impl?: () => Promise<RectificationResultRaw>,
): RectificationRuntime {
  return {
    computeRectification: vi.fn(impl ?? (() => Promise.resolve(SYNTHETIC_RAW))),
  };
}

describe('useRectificationStore', () => {
  beforeEach(() => {
    useRectificationStore.setState({ status: 'idle', result: null, error: null });
  });

  it('starts idle with null result and no error', () => {
    const { status, result, error } = useRectificationStore.getState();
    expect(status).toBe('idle');
    expect(result).toBeNull();
    expect(error).toBeNull();
  });

  it('transitions idle -> loading -> ready on a successful engine call', async () => {
    const rt = makeRuntime();
    await useRectificationStore.getState().run(rt, SYNTHETIC_INPUT);

    const { status, result, error } = useRectificationStore.getState();
    expect(status).toBe('ready');
    expect(result).not.toBeNull();
    expect(result?.mode).toBe('cusp');
    expect(result?.band).toBe('leans');
    expect(result?.discriminatingEventCount).toBe(1);
    expect(error).toBeNull();
  });

  it('calls the engine with the supplied input', async () => {
    const rt = makeRuntime();
    await useRectificationStore.getState().run(rt, SYNTHETIC_INPUT);
    expect(rt.computeRectification).toHaveBeenCalledWith(SYNTHETIC_INPUT);
  });

  it('transitions to error when the engine throws', async () => {
    const rt = makeRuntime(() => Promise.reject(new Error('Engine not booted')));
    await useRectificationStore.getState().run(rt, SYNTHETIC_INPUT);

    const { status, result, error } = useRectificationStore.getState();
    expect(status).toBe('error');
    expect(result).toBeNull();
    expect(error).toBe('Engine not booted');
  });

  it('reset returns to idle with null result and error cleared', async () => {
    const rt = makeRuntime();
    await useRectificationStore.getState().run(rt, SYNTHETIC_INPUT);

    useRectificationStore.getState().reset();

    const { status, result, error } = useRectificationStore.getState();
    expect(status).toBe('idle');
    expect(result).toBeNull();
    expect(error).toBeNull();
  });

  it('clears a previous error state on a subsequent successful run', async () => {
    const failing = makeRuntime(() => Promise.reject(new Error('boom')));
    await useRectificationStore.getState().run(failing, SYNTHETIC_INPUT);
    expect(useRectificationStore.getState().status).toBe('error');

    const ok = makeRuntime();
    await useRectificationStore.getState().run(ok, SYNTHETIC_INPUT);
    expect(useRectificationStore.getState().status).toBe('ready');
    expect(useRectificationStore.getState().error).toBeNull();
  });
});
