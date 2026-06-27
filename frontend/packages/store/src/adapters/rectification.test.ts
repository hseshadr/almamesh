// Adapter unit test: adaptRectification(raw) snake_case -> camelCase mapping.
// The function does NOT exist yet — this test file is intentionally RED.

import { describe, expect, it } from 'vitest';

import type { RectificationResultRaw } from '@almamesh/browser/types';

import { adaptRectification } from './rectification';

// Synthetic fixture — no real birth data, only structural coverage.
const RAW: RectificationResultRaw = {
  mode: 'cusp',
  candidates: [
    {
      ascendant_sign: 'Pisces',
      representative_time_local: '06:05',
      lagna_longitude_deg: 3.8,
      lagna_cusp_distance_deg: 3.8,
      is_near_cusp: false,
      fit_score: 0.72,
      supporting_events: [
        {
          event_index: 0,
          category: 'marriage',
          date: '2010-05-15',
          signals: ['Jupiter transit 7th house'],
          contribution: 1.0,
        },
      ],
    },
  ],
  margin: 0.22,
  band: 'leans',
  discriminating_event_count: 1,
  recorded_time_sign: 'Aquarius',
  honesty_note_key: 'rectify.honesty.leans',
};

describe('adaptRectification', () => {
  it('maps all top-level camelCase fields from the snake_case raw result', () => {
    const result = adaptRectification(RAW);

    expect(result.mode).toBe('cusp');
    expect(result.margin).toBe(0.22);
    expect(result.band).toBe('leans');
    expect(result.discriminatingEventCount).toBe(1);
    expect(result.recordedTimeSign).toBe('Aquarius');
    expect(result.honestyNoteKey).toBe('rectify.honesty.leans');
  });

  it('maps all candidate camelCase fields', () => {
    const result = adaptRectification(RAW);
    expect(result.candidates).toHaveLength(1);

    const cand = result.candidates[0];
    expect(cand?.ascendantSign).toBe('Pisces');
    expect(cand?.representativeTimeLocal).toBe('06:05');
    expect(cand?.lagnaLongitudeDeg).toBe(3.8);
    expect(cand?.lagnaCuspDistanceDeg).toBe(3.8);
    expect(cand?.isNearCusp).toBe(false);
    expect(cand?.fitScore).toBe(0.72);
  });

  it('maps all event evidence camelCase fields', () => {
    const result = adaptRectification(RAW);

    // Explicit runtime check: nested array is populated and mapped
    expect(result.candidates[0]?.supportingEvents).toHaveLength(1);

    const ev = result.candidates[0]?.supportingEvents[0];
    expect(ev).toBeDefined();
    expect(ev?.eventIndex).toBe(0);
    expect(ev?.category).toBe('marriage');
    expect(ev?.date).toBe('2010-05-15');
    expect(ev?.signals).toEqual(['Jupiter transit 7th house']);
    expect(ev?.contribution).toBe(1.0);
  });

  it('passes null recordedTimeSign through unchanged', () => {
    const raw: RectificationResultRaw = { ...RAW, recorded_time_sign: null };
    expect(adaptRectification(raw).recordedTimeSign).toBeNull();
  });

  it('handles near_tie band', () => {
    const raw: RectificationResultRaw = {
      ...RAW,
      band: 'near_tie',
      honesty_note_key: 'rectify.honesty.near_tie',
    };
    const result = adaptRectification(raw);
    expect(result.band).toBe('near_tie');
    expect(result.honestyNoteKey).toBe('rectify.honesty.near_tie');
  });

  it('handles empty candidates list', () => {
    const raw: RectificationResultRaw = { ...RAW, candidates: [] };
    expect(adaptRectification(raw).candidates).toHaveLength(0);
  });
});
