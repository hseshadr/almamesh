// Adapter unit test: adaptRectification(raw) snake_case -> camelCase mapping.
// The function does NOT exist yet — this test file is intentionally RED.

import { describe, expect, it } from 'vitest';

import type { RectificationResultRaw } from '@almamesh/browser/types';

import { adaptRectification } from './rectification';

// Synthetic fixture — no real birth data, only structural coverage.
// Spec 062: candidates carry the fit-score split (positive/penalty/prior),
// the D9 navamsa lagna, and candidate-level miss keys; evidence signals use
// the depth/valence grammar and contribution is NET (can be negative).
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
      navamsa_lagna_sign: 'Leo',
      positive_total: 1.1,
      penalty_total: 0.45,
      prior_bonus: 0.07,
      misses: ['miss_silent_marriage_h7'],
      supporting_events: [
        {
          event_index: 0,
          category: 'marriage',
          date: '2010-05-15',
          signals: ['ad_lord_rules_h7#dignified_fit', 'd9_lord_in_d9_h7'],
          contribution: 1.0,
        },
        {
          event_index: 1,
          category: 'litigation',
          date: '2014-03-02',
          signals: ['miss_unexplained'],
          contribution: -0.25,
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

  it('maps the Spec 062 candidate fields (D9 lagna + fit-score split + misses) verbatim', () => {
    const cand = adaptRectification(RAW).candidates[0];
    expect(cand?.navamsaLagnaSign).toBe('Leo');
    expect(cand?.positiveTotal).toBe(1.1);
    expect(cand?.penaltyTotal).toBe(0.45);
    expect(cand?.priorBonus).toBe(0.07);
    expect(cand?.misses).toEqual(['miss_silent_marriage_h7']);
  });

  it('defaults the Spec 062 candidate fields when an older wheel omits them', () => {
    // An older bundled wheel (pre-Spec-062) emits candidates without the new
    // keys; the adapter must produce the same defaults the backend models use.
    const legacyCandidate = { ...RAW.candidates[0]! };
    delete (legacyCandidate as Record<string, unknown>).navamsa_lagna_sign;
    delete (legacyCandidate as Record<string, unknown>).positive_total;
    delete (legacyCandidate as Record<string, unknown>).penalty_total;
    delete (legacyCandidate as Record<string, unknown>).prior_bonus;
    delete (legacyCandidate as Record<string, unknown>).misses;
    const raw: RectificationResultRaw = { ...RAW, candidates: [legacyCandidate] };

    const cand = adaptRectification(raw).candidates[0];
    expect(cand?.navamsaLagnaSign).toBeNull();
    expect(cand?.positiveTotal).toBe(0);
    expect(cand?.penaltyTotal).toBe(0);
    expect(cand?.priorBonus).toBe(0);
    expect(cand?.misses).toEqual([]);
  });

  it('maps all event evidence camelCase fields', () => {
    const result = adaptRectification(RAW);

    // Explicit runtime check: nested array is populated and mapped
    expect(result.candidates[0]?.supportingEvents).toHaveLength(2);

    const ev = result.candidates[0]?.supportingEvents[0];
    expect(ev).toBeDefined();
    expect(ev?.eventIndex).toBe(0);
    expect(ev?.category).toBe('marriage');
    expect(ev?.date).toBe('2010-05-15');
    expect(ev?.signals).toEqual(['ad_lord_rules_h7#dignified_fit', 'd9_lord_in_d9_h7']);
    expect(ev?.contribution).toBe(1.0);
  });

  it('passes a NEGATIVE net contribution through verbatim (miss_unexplained rows)', () => {
    const ev = adaptRectification(RAW).candidates[0]?.supportingEvents[1];
    expect(ev?.category).toBe('litigation');
    expect(ev?.signals).toEqual(['miss_unexplained']);
    expect(ev?.contribution).toBe(-0.25);
  });

  it('accepts the family_rupture category (17th, Spec 062 E6) on evidence rows', () => {
    const raw: RectificationResultRaw = {
      ...RAW,
      candidates: [
        {
          ...RAW.candidates[0]!,
          supporting_events: [
            {
              event_index: 0,
              category: 'family_rupture',
              date: '2018-11-01',
              signals: ['md_lord_rules_h4'],
              contribution: 0.5,
            },
          ],
        },
      ],
    };
    expect(adaptRectification(raw).candidates[0]?.supportingEvents[0]?.category).toBe(
      'family_rupture',
    );
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
